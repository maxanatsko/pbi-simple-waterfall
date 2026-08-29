import powerbi from "powerbi-visuals-api";
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;
import DataViewMatrix = powerbi.DataViewMatrix;
import ISelectionId = powerbi.visuals.ISelectionId;
import { ITooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import * as d3 from "d3";
import { RenderSettings } from "./renderSettings";
import { BarChartDataPoint } from "./dataPoint";
import { Orientation, OrientationName } from "./orientation";
import { ValueFormatter } from "./valueFormatting";
import { getMatrixLevelsAt } from "./matrix";
import {
    BAND_PADDING,
    MARGIN_BUMP,
    MAX_AXIS_STROKE_PT,
    MIN_BAND_STEP_PX,
    MIN_PLOT_CROSS_PX,
    LABEL_LINE_PT_TO_PX,
    HEADROOM_MAX_FRACTION,
    EDGE_LABEL_GUTTER_MIN_PX,
    Y_AXIS_TICK_COUNT,
    SCROLLBAR_TRACK_FILL,
    SCROLLBAR_TRACK_OPACITY,
    SCROLLBAR_THUMB_FILL,
    SCROLLBAR_THUMB_OPACITY
} from "./constants";
import { BarInteractions } from "./interactions";
import { buildValueTooltip, buildCategoryTooltip, tooltipSelectionId } from "./tooltip";
import { VisualMode } from "./visualType";

/** Everything the render pipeline reads off the Visual. Built once per
 *  `update()`; the renderer owns all the mutable layout state internally. */
export interface ChartRenderContext {
    chartContainer: d3.Selection<any, any, any, any>;
    orientationName: OrientationName;
    renderSettings: RenderSettings;
    barChartData: BarChartDataPoint[];
    allData: BarChartDataPoint[][];
    dataView: DataView & { matrix: DataViewMatrix };
    /** Count of leading `valueSources` bound to "Values" (the rest are "Tooltips"). */
    measureCount: number;
    host: IVisualHost;
    formatter: ValueFormatter;
    interactions: BarInteractions;
    tooltipServiceWrapper: ITooltipServiceWrapper;
    isHighContrast: boolean;
    colorPalette: powerbi.extensibility.ISandboxExtendedColorPalette;
    visualType: VisualMode;
    width: number;
    height: number;
    legendHeight: number;
    scrollbarBreath: number;
}

/** Draws the waterfall (both orientations, via Orientation) into the chart
 *  container: value + category axes, bars, labels, scrollbar. One instance
 *  per render; `render()` is the only entry point. */
export class ChartRenderer {
    private svg!: d3.Selection<any, any, any, any>;
    private svgYAxis!: d3.Selection<any, any, any, any>;
    private gScrollable!: d3.Selection<any, any, any, any>;
    private bars!: d3.Selection<d3.BaseType, any, d3.BaseType, any>;
    private orientation!: Orientation;
    private orientationName!: OrientationName;
    private margin!: { top: number; right: number; bottom: number; left: number };
    private adjustmentConstant = 0;
    private minValue = 0;
    private maxValue = 0;
    private width = 0;
    private height = 0;
    private innerWidth = 0;
    private innerHeight = 0;
    private xAxisPosition = 0;
    private yAxisWidth = 0;
    private yAxisHeightHorizontal = 0;
    private yScaleTickValues: number[] = [];

    constructor(private readonly ctx: ChartRenderContext) {}

    public render(): void {
        this.width = this.ctx.width;
        this.height = this.ctx.height;
        this.orientationName = this.ctx.orientationName;
        this.renderCore(this.ctx.allData);
    }

    /** Re-create `this.orientation` from the current `innerWidth` / `innerHeight`.
     *  The plot rectangle is only known in stages (value-axis width, then the
     *  category-label block), so the orientation -- which owns the band + value
     *  scales every draw call reads -- has to be rebuilt as those become known. */
    private rebuildOrientation(): void {
        this.orientation = new Orientation(this.orientationName, {
            minValue: this.minValue,
            maxValue: this.maxValue,
            innerWidth: this.innerWidth,
            innerHeight: this.innerHeight,
            xAxisPosition: this.xAxisPosition,
            scrollbarBreath: this.ctx.scrollbarBreath,
        });
    }

    private renderCore(allData: any): void {
        const o = this.orientationName;

        this.svgYAxis = this.ctx.chartContainer
            .append('svg');
        this.svg = this.ctx.chartContainer
            .append('svg');
        this.ctx.interactions.wireContextMenu(this.svg);
        this.ctx.chartContainer.attr("width", this.width);
        this.ctx.chartContainer.attr("height", this.height);
        this.svg.attr("height", this.height);
        this.svgYAxis.attr("height", this.height);

        this.margin = o == "Horizontal"
            ? {
                top: this.ctx.renderSettings.marginTop,
                right: this.ctx.renderSettings.marginRight + MARGIN_BUMP,
                bottom: this.ctx.renderSettings.marginBottom + 5,
                left: this.ctx.renderSettings.marginLeft
            }
            : {
                top: this.ctx.renderSettings.marginTop + MARGIN_BUMP,
                right: this.ctx.renderSettings.marginRight,
                bottom: this.ctx.renderSettings.marginBottom,
                left: this.ctx.renderSettings.marginLeft
            };
        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;
        this.adjustmentConstant = this.findXaxisAdjustment(this.ctx.barChartData);

        const { minValue, maxValue, yScaleTickValues } = this.computeMinMaxValue(
            this.ctx.barChartData,
            this.innerHeight);
        this.minValue = minValue;
        this.maxValue = maxValue;
        this.yScaleTickValues = yScaleTickValues;
        this.orientation = new Orientation(this.orientationName, {
            minValue: this.minValue,
            maxValue: this.maxValue,
            innerWidth: this.innerWidth,
            innerHeight: this.innerHeight,
            xAxisPosition: this.xAxisPosition,
            scrollbarBreath: this.ctx.scrollbarBreath
        });
        this.gScrollable = this.svg.append('g');
        const crossAxisExtent = this.measureCrossAxisExtent(
            this.gScrollable,
            this.orientation,
            this.yScaleTickValues,
            this.ctx.renderSettings);
        this[this.orientation.crossAxisExtentField] = crossAxisExtent;

        // The plot rectangle is known in stages: the value-axis label column/strip,
        // then (via checkBarWidth) a possible scroll-mode expansion, then the
        // category-label block. Reserve each as it becomes known and rebuild the
        // orientation so every consumer -- the bar-width check, the category axis,
        // the bars and labels -- reads the same scale.
        let findRightHorizontal = 0;
        if (o == "Vertical") {
            this.svgYAxis.attr("width", this.margin.left + this.yAxisWidth);
            this.width = this.width - this.margin.left - this.yAxisWidth - 5;
            this.svg.attr("width", this.width);
            this.svg.attr("transform", `translate(${this.margin.left + this.yAxisWidth},${0})`);
            // Reserve the value-axis label column + a 5px seam (the left margin is
            // already out of innerWidth) and half a band step for the outermost
            // category label, which is centred on its band and wider than it.
            const cats = this.ctx.barChartData.length || 1;
            const endLabelGutter = Math.min((this.innerWidth / (cats + BAND_PADDING)) / 2, 40);
            this.innerWidth = this.innerWidth - crossAxisExtent - 5 - endLabelGutter;
            this.rebuildOrientation();
            this.checkBarWidth();          // sees the real plot width; may expand innerWidth for scrolling
            this.rebuildOrientation();     // fold any scroll-mode expansion into the scale
            findRightHorizontal = this.applyCategoryAxisLayout(this.gScrollable, allData);
            // applyCategoryAxisLayout has measured the category-label block and
            // shrunk this.innerHeight. Rebuild so the value scale's zero lands on
            // the category-axis line rather than the container's bottom edge.
            this.rebuildOrientation();
            // With the final plot height known, re-derive the value domain so its
            // head-room is a few pixels (label height), not a y-axis tick step --
            // a tick step is a large fraction of a short plot and was crushing
            // the bars into a sliver / clipping the total pillar.
            this.applyPixelHeadroom();
            this.createCrossAxis(this.svgYAxis, this.margin.left + this.yAxisWidth, findRightHorizontal);
            this.createCrossAxis(this.gScrollable, 0, findRightHorizontal);
        } else {
            this.svg.attr("width", this.width);
            this.innerHeight = this.innerHeight - this.yAxisHeightHorizontal;
            this.svg.attr("height", this.innerHeight);
            this.rebuildOrientation();     // row band scale over the strip-reduced height
            this.checkBarWidth();          // sees the real plot height; may expand innerHeight for scrolling
            this.rebuildOrientation();     // fold any scroll-mode expansion into the scale
            findRightHorizontal = this.applyCategoryAxisLayout(this.gScrollable, allData);
            // applyCategoryAxisLayout has measured the (left) category-label block
            // as this.xAxisPosition. Rebuild so the value scale reserves that width
            // instead of running the full container width and pushing the domain
            // maximum -- and the tall pillars -- off the right edge.
            this.rebuildOrientation();
            this.svgYAxis.attr("width", this.innerWidth + 5);
            this.svgYAxis.attr("height", this.yAxisHeightHorizontal);
            this.createCrossAxis(this.svgYAxis, 0, findRightHorizontal);
            this.createCrossAxis(this.gScrollable, this.innerHeight, findRightHorizontal);
        }

        this.createBars(this.gScrollable, this.ctx.barChartData, findRightHorizontal);
        this.createLabels(this.gScrollable, findRightHorizontal);

        if (o == "Horizontal") {
            this.svg.attr('transform', `translate(${this.margin.left},${this.margin.top})`);
            this.svgYAxis.attr('transform', `translate(${this.margin.left},${this.margin.top})`);
        }
    }

    private xValue = (d: BarChartDataPoint) => d.category;

    private computeMinMaxValue(
        data: BarChartDataPoint[],
        innerHeight: number,
    ): { minValue: number; maxValue: number; yScaleTickValues: number[] } {
        const { min, max } = this.cumulativeExtent(data);
        let minValue: number = min;
        let maxValue: number = max;

        const yScale = d3.scaleLinear()
            .domain([minValue, maxValue])
            .range([innerHeight, 0]);

        const ticksCount = Y_AXIS_TICK_COUNT;
        const yScaleTickValues = yScale.ticks(ticksCount);

        //realigning the xaxis to the first tick value of yaxis    
        if (minValue != 0) {
            if (minValue > 0) {
                const firstTickValueforPositive = yScaleTickValues[0] - (yScaleTickValues[1] - yScaleTickValues[0]);
                minValue = firstTickValueforPositive;
                yScaleTickValues.unshift(firstTickValueforPositive);
            }
            if (maxValue < 0) {
                const firstTickValueforNegative = yScaleTickValues[yScaleTickValues.length - 1] - (yScaleTickValues[yScaleTickValues.length - 2] - yScaleTickValues[yScaleTickValues.length - 1]);
                maxValue = firstTickValueforNegative;
                yScaleTickValues.push(firstTickValueforNegative);
            }
        }
        if (maxValue > 0) {
            const lastTickValueforPositive = yScaleTickValues[yScaleTickValues.length - 1] + (yScaleTickValues[yScaleTickValues.length - 1] - yScaleTickValues[yScaleTickValues.length - 2]);
            maxValue = lastTickValueforPositive;
            yScaleTickValues.push(lastTickValueforPositive);
        }
        if (minValue < 0) {
            // One step of head-room below the minimum, mirroring the `maxValue > 0`
            // branch above. A second step here starved short plots of vertical
            // space (the empty band under the lowest bar) without buying much.
            const lastTickValueforNegative = yScaleTickValues[0] + (yScaleTickValues[0] - yScaleTickValues[1]);
            minValue = lastTickValueforNegative;
            yScaleTickValues.unshift(lastTickValueforNegative);
        }

        return { minValue, maxValue, yScaleTickValues };
    }

    /** Vertical only. On a short plot one y-axis tick step of head-room (what
     *  `computeMinMaxValue` seeds) is a large fraction of the height, which
     *  crushes the bars into a sliver and pushes the total pillar + its label
     *  off the top edge. If the current domain already leaves at least one
     *  label line of head-room above the tallest bar (and below the lowest,
     *  when the waterfall goes negative) this is a no-op; otherwise the domain
     *  is re-derived so that head-room is a fixed pixel size. Runs after the
     *  last `rebuildOrientation()` and before the cross axis / bars are drawn. */
    private applyPixelHeadroom(): void {
        const h = this.innerHeight;
        if (!(h > 0)) return;

        const { min: tightMin, max: tightMax } = this.cumulativeExtent(this.ctx.barChartData);
        let dataSpan = tightMax - tightMin;
        if (!(dataSpan > 0)) {
            dataSpan = Math.abs(tightMax) || Math.abs(tightMin) || 1;
        }

        const rs = this.ctx.renderSettings;
        const labelPx = rs.labelsShow ? rs.labelsFontSize * LABEL_LINE_PT_TO_PX + 6 : 4;
        const cap = h * HEADROOM_MAX_FRACTION;
        const topPad = Math.min(labelPx, cap);
        const botPad = tightMin < 0 ? Math.min(labelPx, cap) : 0;

        // Head-room the current domain already provides, in pixels.
        const curTop = this.orientation.crossPos(tightMax);
        const curBot = h - this.orientation.crossPos(tightMin);
        if (curTop >= topPad - 0.5 && curBot >= botPad - 0.5) {
            return;
        }

        // cross(v) = h * (max - v) / (max - min); solving cross(tightMax) >= topPad
        // and (below-zero) cross(tightMin) <= h - botPad for the domain that just
        // meets both gives span = dataSpan / (1 - topPad/h - botPad/h).
        const ft = topPad / h;
        const fb = botPad / h;
        const span = dataSpan / (1 - ft - fb);
        this.minValue = tightMin - fb * span;
        this.maxValue = tightMax + ft * span;
        // Round tick *labels* within the (unrounded) domain -- widening the domain
        // to "nice" round endpoints would re-inflate the head-room the whole
        // method is trying to bound.
        this.yScaleTickValues = d3.scaleLinear()
            .domain([this.minValue, this.maxValue])
            .ticks(Y_AXIS_TICK_COUNT);
        this.rebuildOrientation();
    }

    private applyCategoryAxisLayout(gParent: any, allDatatemp: any): number {
        if (!this.ctx.renderSettings.xAxisShow) {
            // X-axis hidden: draw no category labels / separators and reclaim the
            // strip they would have occupied.
            this.xAxisPosition = 0;
            if (this.orientation.scrollOrient === "x") {
                this.innerHeight = this.height - this.margin.top - this.margin.bottom
                    - this.ctx.scrollbarBreath + this.ctx.legendHeight;
            }
            return 0;
        }
        const result = this.createCategoryAxis(
            gParent,
            allDatatemp,
            this.orientation,
            this.innerWidth,
            this.innerHeight,
            this.height,
            this.margin,
            this.ctx.scrollbarBreath,
            this.ctx.legendHeight);
        this.innerHeight = result.innerHeight;
        this.xAxisPosition = result.xAxisPosition;
        return result.findRightHorizontal;
    }
    private styledAxisGroup(parent: any, settings: { fontSize: number; fontFamily: string; fontColor: string }, axisClass: string) {
        return parent.append('g')
            .style("font", settings.fontSize + "pt times")
            .style("font-family", settings.fontFamily)
            .style("color", settings.fontColor)
            .attr('class', axisClass);
    }
    private applyGridlineStyle(selection: any, color: string, strokeWidth?: string) {
        selection.style('fill', 'none').style('stroke', color);
        if (strokeWidth !== undefined) {
            selection.style('stroke-width', strokeWidth);
        }
        return selection;
    }
    private measureCrossAxisExtent(
        gParent: any,
        o: Orientation,
        yScaleTickValues: number[],
        rs: RenderSettings,
    ): number {
        const g = gParent.append('g').attr('class', 'yAxisParentGroup');

        const yAxisScale = o.crossAxisGenerator().tickValues(yScaleTickValues);

        let extent = 0;
        if (rs.yAxisShow) {
            const yAxis = this.styledAxisGroup(g, {
                fontSize: rs.yAxisFontSize,
                fontFamily: rs.yAxisFontFamily,
                fontColor: rs.yAxisFontColor,
            }, 'myYaxis');

            yAxisScale.tickFormat(d => this.formatValueForYAxis(d));

            yAxis.call(yAxisScale);

            this.applyGridlineStyle(yAxis.selectAll('path'), 'black', "0pt");
            if (rs.yAxisShowGridLine) {
                this.applyGridlineStyle(yAxis.selectAll('line'), rs.yAxisGridLineColor, rs.yGridlineStrokeWidth / 10 + "pt");
            } else {
                this.applyGridlineStyle(yAxis.selectAll('line'), rs.yAxisGridLineColor, "0pt");
            }

            // adjust the chart area according to the width/height of the cross axis
            const node = yAxis.node()!;
            extent = o.name === "Vertical"
                ? node.getBoundingClientRect().width
                : node.getBoundingClientRect().height;
        }
        g.remove();
        return extent;
    }

    private createCrossAxis(gParent: any, adjust: any, findRightHorizontal: number) {
        const o = this.orientation;
        var g = gParent.append('g').attr('class', 'yAxisParentGroup');

        var yAxisScale = o.crossAxisGenerator().tickValues(this.yScaleTickValues);

        if (this.ctx.renderSettings.yAxisShow) {
            var yAxis = this.styledAxisGroup(g, {
                fontSize: this.ctx.renderSettings.yAxisFontSize,
                fontFamily: this.ctx.renderSettings.yAxisFontFamily,
                fontColor: this.ctx.renderSettings.yAxisFontColor,
            }, 'myYaxis');
            yAxisScale.tickFormat(d => this.formatValueForYAxis(d));

            yAxis.call(yAxisScale);
            if (!this.ctx.renderSettings.yAxisShowValues) {
                yAxis.selectAll('text').style('visibility', 'hidden');
            }
            this.applyGridlineStyle(yAxis.selectAll('path'), 'black', "0pt");

            if (this.ctx.renderSettings.yAxisShowGridLine) {
                this.applyGridlineStyle(yAxis.selectAll('line'), this.ctx.renderSettings.yAxisGridLineColor, this.ctx.renderSettings.yGridlineStrokeWidth / 10 + "pt");
            } else {
                this.applyGridlineStyle(yAxis.selectAll('line'), this.ctx.renderSettings.yAxisGridLineColor, "0pt");
            }
            if (this.ctx.renderSettings.yAxisShowZeroGridLine) {
                // Floor at 1pt: at the /10 scale the default width (1) resolves to
                // 0.1pt and the zero line -- which also sits under the category
                // axis baseline -- is invisible, so the toggle looked inert.
                const zeroPt = Math.max(1, this.ctx.renderSettings.yAxisZeroLineStrokeWidth / 5);
                yAxis.selectAll('line').each((d: any, i: number, nodes: any) => {
                    if (d == 0) {
                        this.applyGridlineStyle(d3.select(nodes[i]), this.ctx.renderSettings.yAxisZeroLineColor, zeroPt + "pt");
                    }
                });
            }

            const extent = o.valueAxisLineExtent();
            yAxis.selectAll('line').attr('x2', extent.x2).attr('y2', extent.y2);
        }
        var transform = o.name === "Vertical"
            ? `translate(${adjust},${this.margin.top})`
            : `translate(${-findRightHorizontal},${adjust})`;
        g.attr('transform', transform);
    }
    private createLabels(gParent: any, findRightHorizontal: number) {
        const o = this.orientation;
        var g = gParent.append('g').attr('class', 'myBarLabels');

        var xScale = o.mainBand(this.ctx.barChartData.map(this.xValue));
        if (this.ctx.renderSettings.labelsShow) {

            var pillarLabelsg = g.selectAll('.labels')
                .data(this.ctx.barChartData)
                .enter().append('g');

            var pillarLabels = o.name === "Vertical"
                ? pillarLabelsg.append('text').attr('class', 'labels')
                : pillarLabelsg.append('text').append('tspan').attr('class', 'labels');
            var labelFormatting = (d: any) => {
                return this.formatValueforLabels(d);
            }

            var pillarLabelsText = pillarLabels
                .text((d: any) => labelFormatting(d));

            pillarLabelsText.style('font-size', this.ctx.renderSettings.labelsFontSize + "pt")
                .style("font-family", this.ctx.renderSettings.labelsFontFamily)
                .style('fill', (d: any) => {
                    return d.customFontColor;
                });
            // Halo behind "inside" labels: a short bar lets the label spill onto
            // the plain plot background, where the contrast-adjusted (often white)
            // text would otherwise vanish. The bar-coloured outline separates it.
            pillarLabelsText.each(function (this: SVGElement, d: any) {
                const inside = typeof d.customLabelPositioning === "string"
                    && d.customLabelPositioning.indexOf("Inside") === 0;
                if (inside && d.customBarColor) {
                    d3.select(this)
                        .style('stroke', d.customBarColor)
                        .style('stroke-width', '2px')
                        .style('stroke-linejoin', 'round')
                        .style('paint-order', 'stroke');
                }
            });

            var mainPos = o.mainPos;
            pillarLabelsg.attr('transform', (d: any, i: number, nodes: any) => {
                const mp = o.labelMainPosition(xScale, d);
                const cp = o.barLabelCrossPos(d, i, nodes, pillarLabelsg, this.ctx.barChartData);
                return mainPos === "x" ? `translate(${mp},${cp})` : `translate(${cp},${mp})`;
            })

        }
        o.labelFit(g.selectAll(".labels"), o.name === "Vertical" ? 0 : this.width + findRightHorizontal - this.ctx.scrollbarBreath);
        this.ctx.tooltipServiceWrapper.addTooltip(g.selectAll('.labels'),
            (dataPoint: any) => buildValueTooltip(dataPoint),
            // no identity-based tooltips here; the util's identity getter is optional
            () => (null as unknown as ISelectionId));

        if (o.name === "Vertical") {
            g.selectAll(".labels")
                .call(this.labelAlignment, xScale.bandwidth());
        }
        g.attr('transform', o.scrollableTransform(findRightHorizontal, this.margin.top));
    }
    private createBars(gParent: any, data: any, findRightHorizontal: number) {
        const o = this.orientation;
        var g = gParent.append('g').attr('class', 'myBars');

        var xScale = o.mainBand(data.map(this.xValue));

        this.bars = g.selectAll('rect').data(this.ctx.barChartData)
            .enter().append('rect')
            .attr(o.mainPos, (d: any) => xScale(d.category))
            .attr(o.crossPosAttr, (d: any, i: number) => o.barCrossStart(d, i, this.ctx.barChartData))
            .attr(o.mainSizeAttr, xScale.bandwidth())
            .attr(o.crossSizeAttr, (d: any, i: number) => o.barCrossSize(d, i, this.ctx.barChartData))
            .attr('fill', (d: any) => d.customBarColor);
        this.ctx.interactions.bindBars(this.bars);
        this.ctx.interactions.applyAccessibility(this.bars);
        if (this.ctx.isHighContrast) {
            // Override any per-bar / conditional fill copied straight into
            // customBarColor by the data converters, so every path follows the
            // high-contrast palette.
            this.bars.attr('fill', this.ctx.colorPalette.background.value).attr('stroke', this.ctx.colorPalette.foreground.value).attr('stroke-width', 2);
        }

        //line joinning the bars
        if (this.ctx.renderSettings.yAxisJoinBars) {
            const mainAttr = o.mainPos;
            const crossAttr = o.crossPosAttr;
            // The connector sits at the bar edge that meets the previous bar --
            // the shared cumulative level. `base` is that bar's near-origin edge:
            // its top for vertical (higher value = smaller y), its left for
            // horizontal (higher value = larger x). `atHighValueEnd` is true when
            // the shared level is the bar's higher-value edge (a decreasing step,
            // or a pillar). So we add `barCrossSize` for the high-value edge in
            // horizontal, and for the low-value edge in vertical.
            const connectorCross = (node: any, d: any, i: number) => {
                const base = parseFloat(d3.select(node).attr(crossAttr));
                const atHighValueEnd = ((d.value < 0 && !d.isPillar) || (d.value > 0 && d.isPillar));
                const addSize = o.name === "Vertical" ? !atHighValueEnd : atHighValueEnd;
                return addSize ? base + o.barCrossSize(d, i, this.ctx.barChartData) : base;
            };
            // Floor at 1pt: the /10 scale makes the default width (1) an
            // invisible 0.1pt, so "Join Bars" looked like it did nothing.
            const joinStrokePt = Math.max(1, this.ctx.renderSettings.yAxisJoinBarsStrokeWidth / 10);
            this.bars.each((d: any, i: number, nodes: any) => {
                if (i != 0) {
                    g.append('line')
                        .style("stroke", this.ctx.renderSettings.yAxisJoinBarsColor)
                        .style("stroke-width", joinStrokePt + "pt")
                        .attr(mainAttr + "1", parseFloat(d3.select(nodes[i - 1]).attr(mainAttr)) + xScale.bandwidth())
                        .attr(crossAttr + "1", connectorCross(nodes[i], d, i))
                        .attr(mainAttr + "2", parseFloat(d3.select(nodes[i]).attr(mainAttr)))
                        .attr(crossAttr + "2", connectorCross(nodes[i], d, i));
                }
            });
        }

        // Clear selection when clicking outside a bar
        this.ctx.interactions.wireRootClear(this.svg);

        //reset selections when the visual is re-drawn
        this.ctx.interactions.resyncOnRedraw(this.bars);
        if (this.ctx.visualType.isSelectable) {
            this.ctx.interactions.wireClick(this.bars);
        }

        this.ctx.tooltipServiceWrapper.addTooltip(g.selectAll('rect'),
            (dataPoint: any) => buildValueTooltip(dataPoint),
            (dataPoint: any) => tooltipSelectionId(dataPoint));

        g.attr('transform', o.scrollableTransform(findRightHorizontal, this.margin.top));

    }
    private lineWidth(d: any, i: number) {
        // Cap the category-cell separators: the single "Stroke Width" control
        // also drives the axis baseline, and past ~2pt the dividers read as a
        // broken grid rather than a rule.
        const pt = Math.min(this.ctx.renderSettings.xGridlineStrokeWidth / 10, MAX_AXIS_STROKE_PT);
        var defaultwidth = pt + "pt";
        if (d.displayName == "" || i == 0) {
            defaultwidth = "0" + "pt";
        }
        return defaultwidth;

    }
    private labelAlignment(tspan: any, width: any) {

        tspan.each(function (this: SVGTextContentElement) {
            var tspan = d3.select(this);
            var tspanWidth = tspan.node()!.getComputedTextLength();
            var diff = (width - tspanWidth) / 2;
            tspan.attr('dx', diff);

        });
    }
    private findXaxisAdjustment = (data: any): number => {
        var returnvalue = 0;
        if (this.ctx.renderSettings.yAxisDataPointOption == "Auto") {

            /************************************************
                this function is used to move the Yaxis to reduce the pillars size so that they don't start from zero, if pillars are all positive or negative
            *************************************************/
            var minDataPoint = 0;
            var maxDataPoint = 0;
            var cumulativeDataPoints: any[] = [];
            for (let index = 0; index < data.length; index++) {

                if (data[index].isPillar == 0) {
                    if (index == 0) {
                        cumulativeDataPoints.push(data[index].value)
                    } else {
                        cumulativeDataPoints.push(data[index].value + cumulativeDataPoints[index - 1]);
                    }
                } else {
                    cumulativeDataPoints.push(data[index].value)
                }
            }
            minDataPoint = Math.min(...cumulativeDataPoints);
            maxDataPoint = Math.max(...cumulativeDataPoints);


            if (minDataPoint >= 0 && maxDataPoint >= 0) {
                if (maxDataPoint - minDataPoint < minDataPoint) {
                    returnvalue = maxDataPoint - minDataPoint;
                }
            }

            if (minDataPoint <= 0 && maxDataPoint <= 0) {
                if (minDataPoint - maxDataPoint > maxDataPoint) {
                    returnvalue = Math.abs(minDataPoint - maxDataPoint);
                }
            }
        }
        return returnvalue;
    }
    private cumulativeExtent = (data: any): { min: number; max: number } => {
        const cumulativeDataPoints: number[] = [];
        for (let index = 0; index < data.length; index++) {
            if (data[index].isPillar == 0) {
                if (index == 0) {
                    cumulativeDataPoints.push(data[index].value);
                } else {
                    cumulativeDataPoints.push(data[index].value + cumulativeDataPoints[index - 1]);
                }
            } else {
                cumulativeDataPoints.push(data[index].value);
            }
        }
        let min = Math.min(...cumulativeDataPoints);
        let max = Math.max(...cumulativeDataPoints);
        if (min > 0) {
            min = this.adjustmentConstant == 0 ? 0 : min - this.adjustmentConstant;
        }
        if (max < 0) {
            max = this.adjustmentConstant == 0 ? 0 : max + this.adjustmentConstant;
        }
        return { min, max };
    }


    private checkBarWidth(): void {
        const o = this.orientation;
        // "Fit to width" off -> honour the user's Minimum Bar Width. On (the
        // default) -> still stop shrinking at the legibility floor and let the
        // scrollbar take over, rather than squashing the bars (and, in turn,
        // the wrapped category-label block) without limit.
        const minStep = this.ctx.renderSettings.xAxisFitToWidth
            ? MIN_BAND_STEP_PX
            : this.ctx.renderSettings.xAxisBarWidth;
        var xScale = o.mainBand(this.ctx.barChartData.map(this.xValue));
        var currentBarWidth = xScale.step();
        if (currentBarWidth < minStep) {
            currentBarWidth = minStep;

            var scrollBarGroup = this.svg.append('g');
            var scrollbarContainer = scrollBarGroup.append('rect')
                .attr('width', o.scrollOrient == "x" ? this.width : this.ctx.scrollbarBreath)
                .attr('height', o.scrollOrient == "x" ? this.ctx.scrollbarBreath : this.innerHeight)
                .attr('x', o.scrollOrient == "x" ? 0 : this.width - this.ctx.scrollbarBreath - this.margin.left)
                .attr('y', o.scrollOrient == "x" ? this.height - this.ctx.scrollbarBreath : 0)
                .attr('fill', SCROLLBAR_TRACK_FILL)
                .attr('opacity', SCROLLBAR_TRACK_OPACITY)
                .attr('rx', 4)
                .attr('ry', 4);

            var scrollBarGroupHeight: number = this.innerHeight;
            if (o.scrollOrient == "x") {
                this.innerWidth = currentBarWidth * this.ctx.barChartData.length + (currentBarWidth * xScale.padding());
                this.innerHeight = this.height - this.margin.top - this.margin.bottom - this.ctx.scrollbarBreath;
            } else {
                this.innerHeight = currentBarWidth * this.ctx.barChartData.length + (currentBarWidth * xScale.padding());
            }

            var dragStartPosition = 0;
            var dragScrollBarXStartposition = 0;

            if (o.scrollOrient == "x") {
                // The band scale fills `this.innerWidth` exactly, so the last
                // band ends flush with the content edge -- and at full-right
                // scroll that edge is the viewport edge. Both the outermost
                // category label and the centre-anchored value label are wider
                // than their band and spill past it (see `labelAlignment`, whose
                // dx goes negative for a label wider than the bar), so the total
                // pillar's label -- and a sliver of the pillar itself -- got
                // clipped with no way to scroll further. Give the scroll one
                // extra gutter of travel past the last bar. Deliberately not
                // folded into `this.innerWidth`: that stays the band range end,
                // so the bars, category axis and gridlines are unchanged.
                const endGutter = Math.max(currentBarWidth, EDGE_LABEL_GUTTER_MIN_PX);
                const scrollSpan = this.innerWidth + endGutter;
                var scrollbarwidth = this.width * this.width / scrollSpan;
                var scrollbar: d3.Selection<any, any, any, any> = scrollBarGroup.append('rect')
                    .attr('width', scrollbarwidth).attr('height', this.ctx.scrollbarBreath)
                    .attr('x', 0).attr('y', this.height - this.ctx.scrollbarBreath)
                    .attr('fill', SCROLLBAR_THUMB_FILL).attr('opacity', SCROLLBAR_THUMB_OPACITY).attr('rx', 4).attr('ry', 4);
                var scrollBarDragBar = d3.drag().on("start", (event) => {
                    dragStartPosition = event.x;
                    dragScrollBarXStartposition = parseInt(scrollbar.attr('x'));
                }).on("drag", (event) => {
                    var m = event.x - dragStartPosition;
                    if (dragScrollBarXStartposition + m >= 0 && (dragScrollBarXStartposition + m + scrollbarwidth <= this.width)) {
                        scrollbar.attr('x', dragScrollBarXStartposition + m);
                        this.gScrollable.attr('transform', `translate(${(dragScrollBarXStartposition + m) / (this.width - scrollbarwidth) * (scrollSpan - this.width) * -1},${0})`);
                    }
                });
                var scrollBarWheel = d3.zoom().on("zoom", (event) => {
                    var zc = parseInt(scrollbarContainer.attr('width'));
                    var dY = event.sourceEvent.deltaY;
                    var zm = dY / 100 * zc / this.ctx.barChartData.length;
                    var zStart = parseInt(scrollbar.attr('x'));
                    var zH = parseInt(scrollbar.attr('width'));
                    var m = zStart + zm;
                    if (m < 0) m = 0;
                    if (m + zH > zc) m = zc - zH;
                    scrollbar.attr('x', m);
                    this.gScrollable.attr('transform', `translate(${(m) / (this.width - scrollbarwidth) * (scrollSpan - this.width) * -1},${0})`);
                });
                scrollBarDragBar(this.svg); scrollBarWheel(this.svg); scrollBarDragBar(scrollbar);
            } else {
                var scrollbarHeight = (scrollBarGroupHeight) * (scrollBarGroupHeight) / this.innerHeight;
                var scrollbar: d3.Selection<any, any, any, any> = scrollBarGroup.append('rect')
                    .attr('width', this.ctx.scrollbarBreath).attr('height', scrollbarHeight)
                    .attr('x', this.width - this.ctx.scrollbarBreath - this.margin.left).attr('y', 0)
                    .attr('fill', SCROLLBAR_THUMB_FILL).attr('opacity', SCROLLBAR_THUMB_OPACITY).attr('rx', 4).attr('ry', 4);
                var scrollBarDragBar = d3.drag().on("start", (event) => {
                    dragStartPosition = event.y;
                    dragScrollBarXStartposition = parseInt(scrollbar.attr('y'));
                }).on("drag", (event) => {
                    var m = event.y - dragStartPosition;
                    if (dragScrollBarXStartposition + m >= 0 && (dragScrollBarXStartposition + m + scrollbarHeight <= (this.height - this.margin.top - this.margin.bottom - this.yAxisHeightHorizontal))) {
                        scrollbar.attr('y', dragScrollBarXStartposition + m);
                        this.gScrollable.attr('transform', `translate(${0},${(dragScrollBarXStartposition + m) / (this.height - this.margin.top - this.margin.bottom - this.yAxisHeightHorizontal - scrollbarHeight) * (this.innerHeight - this.height + this.margin.top + this.margin.bottom + this.yAxisHeightHorizontal) * -1})`);
                    }
                });
                var scrollBarWheel = d3.zoom().on("zoom", (event) => {
                    var zc = parseInt(scrollbarContainer.attr('height'));
                    var zm = event.sourceEvent.deltaY / 100 * zc / this.ctx.barChartData.length;
                    var zStart = parseInt(scrollbar.attr('y'));
                    var zH = parseInt(scrollbar.attr('height'));
                    var m = zStart + zm;
                    if (m < 0) m = 0;
                    if (m + zH > zc) m = zc - zH;
                    scrollbar.attr('y', m);
                    this.gScrollable.attr('transform', `translate(${0},${(m) / (this.height - this.margin.top - this.margin.bottom - this.yAxisHeightHorizontal - scrollbarHeight) * (this.innerHeight - this.height + this.margin.top + this.margin.bottom + this.yAxisHeightHorizontal) * -1})`);
                });
                scrollBarDragBar(this.svg); scrollBarWheel(this.svg); scrollBarDragBar(scrollbar);
            }
        }
    }

    private createCategoryAxis(
        gParent: any,
        allDatatemp: any,
        o: Orientation,
        innerWidth: number,
        innerHeight: number,
        height: number,
        margin: { top: number; right: number; bottom: number; left: number },
        scrollbarBreath: number,
        legendHeight: number,
    ): { innerHeight: number; findRightHorizontal: number; xAxisPosition: number } {
        var g = gParent.append('g').attr('class', 'xAxisParentGroup');
        var myAxisParentHeight = 0;
        const dataView = this.ctx.dataView;
        var rows = dataView.matrix.rows;
        var root = rows.root;
        var levels = allDatatemp.length;
        var xScale;
        var xBaseScale = o.mainBand(allDatatemp[allDatatemp.length - 1].map(this.xValue));
        const measureCount = this.ctx.measureCount;
        if (measureCount > 1) {
            var pillarsCount = 3;
            var fullWidth = o.scrollOrient == "x"
                ? innerWidth - xBaseScale.bandwidth() + (xBaseScale.step() * xBaseScale.padding() * pillarsCount)
                : innerHeight - xBaseScale.bandwidth() + (xBaseScale.step() * xBaseScale.padding() * pillarsCount);
            var myBandwidth = fullWidth / allDatatemp[allDatatemp.length - 1].length;
        } else {
            var pillarsCount = 2;
            var fullWidth = o.scrollOrient == "x"
                ? innerWidth - xBaseScale.bandwidth() - (xBaseScale.step() * xBaseScale.padding() * pillarsCount)
                : innerHeight - xBaseScale.bandwidth() - (xBaseScale.step() * xBaseScale.padding() * pillarsCount);
            var myBandwidth = fullWidth / (allDatatemp[allDatatemp.length - 1].length - 1);
        }
        for (var allDataIndex = levels - 1; allDataIndex >= 0; allDataIndex--) {
            var currData: any[] = [];
            var xAxisrange: any[] = [];
            var currChildCount = 0;
            if (allDataIndex == (levels - 1)) {
                xScale = xBaseScale;
                currData = allDatatemp[allDatatemp.length - 1];
            } else {
                currData = getMatrixLevelsAt(root, allDataIndex, dataView, this.ctx.host, this.ctx.formatter, measureCount);
                xAxisrange.push(0);
                currData.forEach((element: any) => {
                    currChildCount = currChildCount + myBandwidth * element.childrenCount;
                    xAxisrange.push(currChildCount);
                });
                xScale = d3.scaleOrdinal()
                    .domain(currData.map((displayName, index) => index + displayName))
                    .range(xAxisrange);
            }
            let edge = 0;
            var myWidth = currChildCount + myBandwidth;
            if (allDataIndex != (levels - 1)) {
                if (measureCount == 1) {
                    var myxAxisParent;
                    edge = this.createAxis(myxAxisParent, g, false, myWidth, 0, xScale, xBaseScale, currData, allDataIndex, levels, xAxisrange, myAxisParentHeight, edge);
                } else {
                    for (let index = 1; index < measureCount; index++) {
                        var myxAxisParent;
                        edge = this.createAxis(myxAxisParent, g, false, myWidth, index, xScale, xBaseScale, currData, allDataIndex, levels, xAxisrange, myAxisParentHeight, edge);
                    }
                }
            } else {
                var myxAxisParent;
                edge = this.createAxis(myxAxisParent, g, true, myWidth, 1, xScale, xBaseScale, currData, allDataIndex, levels, xAxisrange, myAxisParentHeight, edge);
            }
            myAxisParentHeight = edge;
        }
        var xAxisPosition = this.accumulateAxisEdge(g.selectAll('text'), 0, false);
        let resultInnerHeight = innerHeight;
        let findRightHorizontal = 0;
        if (o.scrollOrient == "x") {
            // Safety net: never let the (measured, unbounded) category-label
            // block shrink the plot below MIN_PLOT_CROSS_PX -- past that the
            // value scale degenerates/inverts and the tallest bar + its label
            // render above the plot. Cap the block and keep the axis line on
            // the same level the value scale's zero uses. The scrollbar path
            // (checkBarWidth) normally keeps xAxisPosition small enough that
            // this cap never bites.
            const available = height - margin.top - margin.bottom - scrollbarBreath + legendHeight;
            const block = Math.min(xAxisPosition, Math.max(available - MIN_PLOT_CROSS_PX, 0));
            g.attr('transform', `translate(${0},${margin.top + available - block})`);
            resultInnerHeight = available - block;
        } else {
            findRightHorizontal = xAxisPosition;
            g.attr('transform', `translate(${xAxisPosition * -1},${0})`);
        }
        return { innerHeight: resultInnerHeight, findRightHorizontal, xAxisPosition };
    }

    /** Reduce a set of axis label nodes to the outer category-axis edge.
     *  Vertical (scrollOrient "x"): max bounding-box bottom, optionally subtracting
     *  the legend height. Horizontal: min bounding-box left. `running` seeds the
     *  accumulator so callers can fold across multiple axis groups. */
    private accumulateAxisEdge(selection: any, running: number, subtractLegend: boolean): number {
        const o = this.orientation;
        let edge = running;
        selection.each((d: any, i: number, nodes: any) => {
            if (o.scrollOrient == "x") {
                const bottom = nodes[i].getBoundingClientRect().bottom - (subtractLegend ? this.ctx.legendHeight : 0);
                if (edge <= bottom) {
                    edge = bottom;
                }
            } else {
                const left = nodes[i].getBoundingClientRect().left;
                if (edge >= left) {
                    edge = left;
                }
            }
        });
        return edge;
    }

    private createAxis(myxAxisParent: any, g: any, baseAxis: boolean, myWidth: any, index: number, xScale: any, xBaseScale: any, currData: any, allDataIndex: any, levels: any, xAxisrange: any, myAxisParentHeight: any, currentEdge: number): number {
        const o = this.orientation;
        var myxAxisParentx = o.mainAxis(xScale);
        myxAxisParent = this.styledAxisGroup(g, {
            fontSize: this.ctx.renderSettings.xAxisFontSize,
            fontFamily: this.ctx.renderSettings.xAxisFontFamily,
            fontColor: this.ctx.renderSettings.xAxisFontColor,
        }, 'myXaxis')
            .call(myxAxisParentx);
        myxAxisParent
            .attr('transform', o.axisGroupTransform(baseAxis, index, xBaseScale, myWidth, myAxisParentHeight));
        this.applyGridlineStyle(myxAxisParent.selectAll('path'), this.ctx.renderSettings.xAxisGridLineColor);
        var xAxislabels = myxAxisParent.selectAll(".tick text").data(currData).text((d: any) => d.displayName);
        if (this.ctx.visualType.isSelectable) {
            this.ctx.interactions.wireClick(xAxislabels);
        }
        this.ctx.tooltipServiceWrapper.addTooltip(myxAxisParent.selectAll(".tick text"),
            (dataPoint: any) => buildCategoryTooltip(dataPoint),
            () => (null as unknown as ISelectionId));
        const wrapOpts = o.name === "Vertical"
            ? (this.ctx.renderSettings.xAxisLabelWrapText
                ? { splitToken: "whitespace" as const, layout: "vertical" as const }
                : { splitToken: "" as const, layout: "vertical" as const, maxLines: 3, ellipsis: true })
            : (this.ctx.renderSettings.xAxisLabelWrapText
                ? { splitToken: "whitespace" as const, layout: "horizontal" as const }
                : null);
        if (allDataIndex != (levels - 1)) {
            if (wrapOpts) {
                myxAxisParent.selectAll(".tick text").call(this.wrapLabels, xBaseScale.bandwidth(), wrapOpts);
            }
            myxAxisParent.selectAll(".tick text").data(currData).attr('transform', (d: any, i: number) => o.secondaryTickLabelTransform(xAxisrange, i, this.ctx.renderSettings.xAxisPadding));
            myxAxisParent.selectAll("line").remove();
        } else {
            if (wrapOpts) {
                myxAxisParent.selectAll(".tick text").call(this.wrapLabels, xBaseScale.bandwidth(), wrapOpts);
            }
            xAxislabels.attr('transform', o.baseTickLabelTransform(this.ctx.renderSettings.xAxisPadding));
        }
        let edge = this.accumulateAxisEdge(myxAxisParent.selectAll("text"), currentEdge, true);
        if (o.name === "Horizontal") {
            var maxtextWidth = 0;
            myxAxisParent.selectAll("text").each(function (this: SVGTextContentElement) {
                var text = d3.select(this);
                var textWidth = text.node()!.getBoundingClientRect().width;
                if (textWidth > maxtextWidth) {
                    maxtextWidth = textWidth;
                }
            });
            myxAxisParent.selectAll("tspan").call(this.xAxislabelAlignmentHorizontal, maxtextWidth);
        }
        this.createAxisGridlines(myxAxisParent, currData, allDataIndex, levels, xScale, xAxisrange, edge);
        return edge;
    }

    private createAxisGridlines(myxAxisParent: any, currData: any, allDataIndex: any, levels: any, xScale: any, xAxisrange: any, edge: number) {
        const o = this.orientation;
        if (this.ctx.renderSettings.xAxisShowGridLine) {
            const axisLinePt = Math.min(this.ctx.renderSettings.xGridlineStrokeWidth / o.xGridlineStrokeDivisor, MAX_AXIS_STROKE_PT);
            this.applyGridlineStyle(myxAxisParent.selectAll('path'), this.ctx.renderSettings.xAxisGridLineColor, axisLinePt + "pt");
            var myAxisTop = myxAxisParent.select("path").node()!.getBoundingClientRect().top;
            const catPos = (d: any, i: number) => allDataIndex == (levels - 1)
                ? xScale(d.category) - (xScale.padding() * xScale.step()) / 2
                : xAxisrange[i];
            const ext = edge - myAxisTop;
            myxAxisParent.selectAll(".text").data(currData).enter().append("line")
                .attr("x1", (d: any, i: number) => o.gridlineAttrs(catPos(d, i), ext).x1)
                .attr("y1", (d: any, i: number) => o.gridlineAttrs(catPos(d, i), ext).y1)
                .attr("x2", (d: any, i: number) => o.gridlineAttrs(catPos(d, i), ext).x2)
                .attr("y2", (d: any, i: number) => o.gridlineAttrs(catPos(d, i), ext).y2)
                .attr("stroke-width", (d: any, i: number) => this.lineWidth(d, i))
                .attr("stroke", this.ctx.renderSettings.xAxisGridLineColor);
        } else {
            this.applyGridlineStyle(myxAxisParent.selectAll('path'), this.ctx.renderSettings.xAxisGridLineColor, "0pt");
        }
    }


    private wrapLabels(text: any, standardwidth: any, opts: { splitToken: "" | "whitespace"; layout: "vertical" | "horizontal"; maxLines?: number; ellipsis?: boolean }) {
        const isChar = opts.splitToken === "";
        const joinSep = isChar ? "" : " ";
        const maxLines = opts.maxLines ?? 0;
        const ellipsis = opts.ellipsis ?? false;

        if (opts.layout === "horizontal") {
            var textHeight = text.node()!.getBoundingClientRect().height;
            var maxHeight = standardwidth * text.datum()["childrenCount"];
            var tspanAllowed = Math.floor(maxHeight / textHeight);

            text.each(function (this: SVGTextContentElement) {
                var t = d3.select(this),
                    words = t.text().split(/\s+/).reverse(),
                    wordsPerLine = Math.ceil(words.length / tspanAllowed),
                    word,
                    line: string[] = [],
                    lineNumber = 0,
                    lineHeight = 1.1,
                    y = t.attr("y"),
                    dy = parseFloat(t.attr("dy")),
                    tspan = t.text(null).append("tspan").attr("x", 0).attr("y", y).attr("dy", dy + "em");

                var counter = 0;
                while (word = words.pop()) {
                    line.push(word);
                    tspan.text(line.join(" "));
                    counter++;
                    if (counter + 1 > wordsPerLine && words.length > 0) {
                        counter = 0;
                        line = [];
                        tspan.attr("y", -textHeight / 2);
                        tspan = t.append("tspan").attr("x", 0).attr("y", -textHeight / 2).attr("dy", ++lineNumber * lineHeight + dy + "em");
                    }
                }
            });
            return;
        }

        text.each(function (this: SVGTextContentElement) {
            var t = d3.select(this),
                words = isChar ? t.text().split("").reverse() : t.text().split(/\s+/).reverse(),
                word,
                line: string[] = [],
                lineNumber = 0,
                lineHeight = isChar ? 1 : 1.1,
                y = t.attr("y"),
                dy = parseFloat(t.attr("dy")),
                tspan = t.text(null).append("tspan").attr("x", 0).attr("y", y).attr("dy", dy + "em");
            var width = standardwidth * (t.datum() as any)["childrenCount"];

            while (word = words.pop()) {
                line.push(word);
                tspan.text(line.join(joinSep));
                if (tspan.node()!.getComputedTextLength() > width) {
                    if (isChar) {
                        if (line.length != 1) {
                            if (maxLines && lineNumber == maxLines - 1) {
                                if (ellipsis) {
                                    tspan.text(tspan.text().substring(0, tspan.text().length - 3) + "...");
                                }
                                break;
                            } else {
                                line.pop();
                                tspan.text(line.join(joinSep));
                                line = [word];
                                tspan = t.append("tspan").attr("x", 0).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
                            }
                        }
                    } else {
                        // A single word wider than the cell is truncated character
                        // by character. `line` must be kept in step with what is
                        // actually rendered: the next iteration re-renders
                        // `line.join(" ")`, so leaving the untruncated word in
                        // `line` puts the full-width word back on the line and it
                        // spills across the neighbouring categories.
                        var currline: string[];
                        if (line.length != 1) {
                            line.pop();
                            tspan.text(line.join(joinSep));
                            line = [word];
                            tspan = t.append("tspan").attr("x", 0).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
                        }
                        currline = line[0].split("");
                        while (currline.length > 0 && tspan.node()!.getComputedTextLength() > width) {
                            currline.pop();
                            line[0] = currline.join("");
                            tspan.text(line[0]);
                        }
                    }
                }
            }
        });
    }

    private xAxislabelAlignmentHorizontal(tspan: any, width: any) {

        tspan.each(function (this: SVGTextContentElement) {
            var tspan = d3.select(this);
            var tspanWidth = tspan.node()!.getComputedTextLength();
            var diff = (tspanWidth - width) / 2;
            tspan.attr('dx', diff);

        });
    }
    // Thin delegates to ValueFormatter; the y-axis-tick call sites move into
    // chartRenderer.ts in a later stage, at which point these wrappers go away.
    private formatValueforLabels(d: BarChartDataPoint) {
        return this.ctx.formatter.label(d);
    }
    private formatValueForYAxis(d: any) {
        return this.ctx.formatter.yAxis(d, {
            min: this.minValue,
            max: this.maxValue,
            primaryFormat: (this.ctx.barChartData && this.ctx.barChartData.length > 0) ? this.ctx.barChartData[0].numberFormat : undefined,
            option: this.ctx.renderSettings.yAxisValueFormatOption,
            decimals: this.ctx.renderSettings.yAxisDecimalPlaces,
        });
    }
}
