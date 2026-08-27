/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;
import { ITooltipServiceWrapper, createTooltipServiceWrapper } from "powerbi-visuals-utils-tooltiputils";
import ISelectionIdBuilder = powerbi.visuals.ISelectionIdBuilder;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import * as d3 from "d3";
import { VisualSettings, VisualFormattingSettingsModel } from "./settings";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { Orientation, OrientationName } from "./orientation";
import { BarChartDataPoint } from "./dataPoint";
import { buildValueTooltip, buildCategoryTooltip, tooltipSelectionId } from "./tooltip";
import { ValueFormatter, gridlineStrokeWidth } from "./valueFormatting";
import { requireMatrixDataView, getMatrixLevelsAt } from "./matrix";
import { WaterfallDataBuilder } from "./waterfallData";
import { BarInteractions } from "./interactions";

/** Best-effort message extraction from an unknown thrown value. */
function toErrorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

export class Visual implements IVisual {

    private svg!: d3.Selection<any, any, any, any>;
    private svgYAxis!: d3.Selection<any, any, any, any>;
    private mainContainer: d3.Selection<any, any, any, any>;
    private legendContainer: d3.Selection<any, any, any, any>;
    private chartContainer: d3.Selection<any, any, any, any>;
    private gScrollable!: d3.Selection<any, any, any, any>;
    private visualSettings!: VisualSettings;
    private formattingSettingsService: FormattingSettingsService;
    private adjustmentConstant: number;
    private minValue!: number;
    private maxValue!: number;
    private width!: number;
    private height!: number;
    private innerWidth!: number;
    private innerHeight!: number;
    private barChartData!: BarChartDataPoint[];
    private margin!: { top: number; right: number; bottom: number; left: number };
    private legendHeight = 0;
    private host: IVisualHost;
    private selectionIdBuilder: ISelectionIdBuilder;
    private selectionManager: ISelectionManager;
    private tooltipServiceWrapper: ITooltipServiceWrapper;
    private visualType!: string;
    private visualUpdateOptions!: VisualUpdateOptions;
    private bars!: d3.Selection<d3.BaseType, any, d3.BaseType, any>;
    private xAxisPosition = 0;
    private yAxisWidth = 0;
    private yAxisHeightHorizontal = 0;
    private scrollbarBreath = 0;
    private yScaleTickValues: number[] = [];
    private orientation!: Orientation;
    private orientationName!: OrientationName;
    private events: IVisualEventService;
    private locale: string;
    private colorPalette: powerbi.extensibility.ISandboxExtendedColorPalette;
    private isHighContrast: boolean;
    private formatter!: ValueFormatter;
    private interactions: BarInteractions;



    constructor(options?: VisualConstructorOptions) {
        // The pbiviz-generated plugin shim calls `new Visual(options?)`; the real
        // Power BI host always supplies them.
        if (!options) {
            throw new Error("Multi-Step Waterfall: VisualConstructorOptions are required.");
        }
        this.host = options.host;
        this.mainContainer = d3.select<HTMLElement, any>(options.element)
            .append('div')
            .classed('simpleWaterfall', true);
        this.legendContainer = this.mainContainer
            .append('div');
        this.chartContainer = this.mainContainer
            .append('div');

        this.adjustmentConstant = 0;
        this.scrollbarBreath = 8;
        this.tooltipServiceWrapper = createTooltipServiceWrapper(options.host.tooltipService, options.element);
        this.selectionIdBuilder = options.host.createSelectionIdBuilder();
        this.selectionManager = options.host.createSelectionManager();
        this.events = options.host.eventService;
        this.locale = options.host.locale;
        this.formattingSettingsService = new FormattingSettingsService();
        this.colorPalette = options.host.colorPalette;
        this.isHighContrast = this.colorPalette.isHighContrast;
        this.interactions = new BarInteractions({
            selectionManager: this.selectionManager,
            colorPalette: this.colorPalette,
        });

    }
    private static parseSettings(dataView: DataView): VisualSettings {
        return <VisualSettings>VisualSettings.parse(dataView);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const dataView: DataView = this.visualUpdateOptions && this.visualUpdateOptions.dataViews && this.visualUpdateOptions.dataViews[0];
        const model: VisualFormattingSettingsModel =
            this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
        model.applyState(
            this.visualType,
            this.visualSettings,
            this.barChartData,
            dataView,
            gridlineStrokeWidth(this.visualSettings, "x"),
            gridlineStrokeWidth(this.visualSettings, "y"));
        return this.formattingSettingsService.buildFormattingModel(model);
    }
    public update(options: VisualUpdateOptions) {
        //Certification requirement to use rendering API//
        //-------------------------------------------------------------------------
        this.events.renderingStarted(options);
        //-------------------------------------------------------------------------
        try {
        this.visualUpdateOptions = options;
        this.isHighContrast = this.colorPalette.isHighContrast;
        const dataView = requireMatrixDataView(options);
        this.visualSettings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
        this.formatter = new ValueFormatter({
            locale: this.locale,
            labelValueFormat: this.visualSettings.LabelsFormatting.valueFormat,
            labelDecimals: this.visualSettings.LabelsFormatting.decimalPlaces,
        });
        this.chartContainer.selectAll('svg').remove();
        this.addLegend(options);
        this.width = options.viewport.width;
        this.height = options.viewport.height - this.legendHeight;
        this.xAxisPosition = 0;
        if (dataView.matrix.rows.levels.length != 1){
            this.visualSettings.chartOrientation.limitBreakdown=false;
        }

        const builder = new WaterfallDataBuilder({
            options,
            dataView,
            host: this.host,
            settings: this.visualSettings,
            isHighContrast: this.isHighContrast,
            colorPalette: this.colorPalette,
            formatter: this.formatter,
        });
        const levels = dataView.matrix.rows.levels.length;
        const sources = dataView.matrix.valueSources.length;
        let allData: BarChartDataPoint[][];
        if (levels === 0) {
            this.visualType = "static";
            allData = [builder.buildStatic()];
        } else if (levels === 1 && sources === 1) {
            this.visualType = "staticCategory";
            allData = [builder.buildStaticCategory()];
        } else if (sources === 1) {
            this.visualType = "drillableCategory";
            allData = builder.buildDrillableCategory();
        } else {
            this.visualType = "drillable";
            allData = builder.buildDrillable();
        }
        this.barChartData = allData[allData.length - 1];

        this.createWaterfallGraph(options, allData);

        //Certification requirement to use rendering API//
        //-------------------------------------------------------------------------
        this.events.renderingFinished(options);
        //-------------------------------------------------------------------------
        } catch (e: unknown) {
            this.events.renderingFailed(options, toErrorMessage(e));
        }
    }
    private addLegend(options: VisualUpdateOptions) {
        this.legendContainer.selectAll('svg').remove();
        if (this.visualSettings.chartOrientation.useSentimentFeatures && this.visualSettings.Legend.show) {
            //this.legendContainer.attr('width', options.viewport.width);
            //this.legendContainer.attr('height', 0);

            var circleFavourableSVG = this.legendContainer.append('svg');

            var circleFavourable = circleFavourableSVG.append('circle');


            var textFavourableSVG = this.legendContainer.append('svg')
                /* .attr('width', 10 + "pt")
                .attr('height', 10 + "pt") */
                /* .style('margin-left', 2 + "pt")
                .style('margin-right', 2 + "pt") */;
            var textFavourable = textFavourableSVG.append('text')
                .attr("x", 0)
                .attr("y", "75%")
                .style('font-size', this.visualSettings.Legend.fontSize + "pt")
                .text(this.visualSettings.Legend.textFavourable)
                .style('font-family', this.visualSettings.Legend.fontFamily)
                .style('fill', this.visualSettings.Legend.fontColor);

            var textBoxSize;
            var textBoxSizeHeight;
            var textBoxSizeWidth;
            textBoxSize = textFavourable.node()!.getBoundingClientRect();
            textBoxSizeHeight = textBoxSize.height;
            textBoxSizeWidth = textBoxSize.width;
            circleFavourableSVG
                .attr('height', textBoxSizeHeight)
                .attr('width', textBoxSizeHeight);

            textFavourableSVG
                .attr('width', textBoxSizeWidth)
                .attr('height', textBoxSizeHeight);


            circleFavourable
                .attr("r", textBoxSizeHeight / 2 * .6)
                .attr('cx', textBoxSizeHeight / 2)
                .attr('cy', textBoxSizeHeight / 2)
                .attr("fill", this.visualSettings.sentimentColor.sentimentColorFavourable);

            var circleAdverseSVG = this.legendContainer.append('svg');

            var circleAdverse = circleAdverseSVG.append('circle');

            var textAdverseSVG = this.legendContainer.append('svg')
                /* .attr('width', 10)
                .attr('height', 10) */
                /* .style('margin-left', 2 + "pt")
                .style('margin-right', 2+ "pt") */;
            var textAdverse = textAdverseSVG.append('text')
                .attr("x", 0)
                .attr("y", "75%")
                .style('font-size', this.visualSettings.Legend.fontSize + "pt")
                .text(this.visualSettings.Legend.textAdverse)
                .style('font-family', this.visualSettings.Legend.fontFamily)
                .style('fill', this.visualSettings.Legend.fontColor);


            textBoxSize = textAdverse.node()!.getBoundingClientRect();
            textBoxSizeHeight = textBoxSize.height;
            textBoxSizeWidth = textBoxSize.width;
            circleAdverseSVG
                .attr('height', textBoxSizeHeight)
                .attr('width', textBoxSizeHeight);

            textAdverseSVG
                .attr('width', textBoxSizeWidth)
                .attr('height', textBoxSizeHeight);


            circleAdverse
                .attr("r", textBoxSizeHeight / 2 * .6)
                .attr('cx', textBoxSizeHeight / 2)
                .attr('cy', textBoxSizeHeight / 2)
                .attr("fill", this.visualSettings.sentimentColor.sentimentColorAdverse);
            this.legendContainer
                //.style('width', options.viewport.width)
                .style('height', textBoxSizeHeight + "pt");
            this.legendHeight = textBoxSizeHeight;
        } else {
            this.legendContainer
                //.style('width', options.viewport.width)
                .style('height', 0 + "pt");
            this.legendHeight = 0;
        }

    }
    private createWaterfallGraph(options: any, allData: any) {
        this.interactions.configure({ allowInteractions: true, isHighContrast: this.isHighContrast });
        this.orientationName = this.visualSettings.chartOrientation.orientation == "Horizontal" ? "Horizontal" : "Vertical";
        this.createWaterfallGraphCore(options, allData);
    }

    private createWaterfallGraphCore(options: any, allData: any) {
        const o = this.orientationName;

        this.svgYAxis = this.chartContainer
            .append('svg');
        this.svg = this.chartContainer
            .append('svg');
        this.interactions.wireContextMenu(this.svg);
        this.chartContainer.attr("width", this.width);
        this.chartContainer.attr("height", this.height);
        this.svg.attr("height", this.height);
        this.svgYAxis.attr("height", this.height);

        this.margin = o == "Horizontal"
            ? {
                top: this.visualSettings.margins.topMargin,
                right: this.visualSettings.margins.rightMargin + 20,
                bottom: this.visualSettings.margins.bottomMargin + 5,
                left: this.visualSettings.margins.leftMargin
            }
            : {
                top: this.visualSettings.margins.topMargin + 20,
                right: this.visualSettings.margins.rightMargin,
                bottom: this.visualSettings.margins.bottomMargin,
                left: this.visualSettings.margins.leftMargin
            };
        this.innerWidth = this.width - this.margin.left - this.margin.right;
        this.innerHeight = this.height - this.margin.top - this.margin.bottom;
        this.adjustmentConstant = this.findXaxisAdjustment(this.barChartData);

        this.getMinMaxValue();
        this.gScrollable = this.svg.append('g');
        this.measureCrossAxis(this.gScrollable);

        if (o == "Vertical") {
            this.svgYAxis.attr("width", this.margin.left + this.yAxisWidth);
            this.width = this.width - this.margin.left - this.yAxisWidth - 5;
            this.svg.attr("width", this.width);
            this.svg.attr("transform", `translate(${this.margin.left + this.yAxisWidth},${0})`);
            this.checkBarWidth(options);
            this.createCategoryAxis(this.gScrollable, options, allData);
            this.createCrossAxis(this.svgYAxis, this.margin.left + this.yAxisWidth);
            this.createCrossAxis(this.gScrollable, 0);
        } else {
            this.svg.attr("width", this.width);
            this.innerHeight = this.innerHeight - this.yAxisHeightHorizontal;
            this.svg.attr("height", this.innerHeight);
            this.checkBarWidth(options);
            this.createCategoryAxis(this.gScrollable, options, allData);
            this.svgYAxis.attr("width", this.innerWidth + 5);
            this.svgYAxis.attr("height", this.yAxisHeightHorizontal);
            this.createCrossAxis(this.svgYAxis, 0);
            this.createCrossAxis(this.gScrollable, this.innerHeight);
        }

        this.createBars(this.gScrollable, this.barChartData);
        this.createLabels(this.gScrollable);

        if (o == "Horizontal") {
            this.svg.attr('transform', `translate(${this.margin.left},${this.margin.top})`);
            this.svgYAxis.attr('transform', `translate(${this.margin.left},${this.margin.top})`);
        }
    }

    private yValue = (d: BarChartDataPoint) => d.value;
    private xValue = (d: BarChartDataPoint) => d.category;

    private getMinMaxValue() {
        if (this.visualSettings.yAxisFormatting.YAxisDataPointOption == "Range"
            && this.visualSettings.yAxisFormatting.YAxisDataPointRangeStart != 0 && this.visualSettings.yAxisFormatting.YAxisDataPointRangeEnd != 0) {
            this.minValue = this.visualSettings.yAxisFormatting.YAxisDataPointRangeStart;
            this.maxValue = this.visualSettings.yAxisFormatting.YAxisDataPointRangeEnd;
        } else {
            const { min, max } = this.cumulativeExtent(this.barChartData);
            this.minValue = min;
            this.maxValue = max;
        }

        var yScale = d3.scaleLinear()
            .domain([this.minValue, this.maxValue])
            .range([this.innerHeight, 0]);

        var ticksCount = 5;
        var staticYscaleTIcks = yScale.ticks(ticksCount);

        //realigning the xaxis to the first tick value of yaxis    
        if (this.minValue != 0) {
            if (this.minValue > 0) {
                var firstTickValueforPositive = staticYscaleTIcks[0] - (staticYscaleTIcks[1] - staticYscaleTIcks[0]);
                this.minValue = firstTickValueforPositive;
                staticYscaleTIcks.unshift(firstTickValueforPositive);
            }
            if (this.maxValue < 0) {
                var firstTickValueforNegative = staticYscaleTIcks[staticYscaleTIcks.length - 1] - (staticYscaleTIcks[staticYscaleTIcks.length - 2] - staticYscaleTIcks[staticYscaleTIcks.length - 1]);
                this.maxValue = firstTickValueforNegative;
                staticYscaleTIcks.push(firstTickValueforNegative);
            }
        }
        if (this.maxValue > 0) {
            var lastTickValueforPositive = staticYscaleTIcks[staticYscaleTIcks.length - 1] + (staticYscaleTIcks[staticYscaleTIcks.length - 1] - staticYscaleTIcks[staticYscaleTIcks.length - 2]);
            this.maxValue = lastTickValueforPositive;
            staticYscaleTIcks.push(lastTickValueforPositive);
        }
        if (this.minValue < 0) {
            var lastTickValueforNegative = staticYscaleTIcks[0] + (staticYscaleTIcks[0] - staticYscaleTIcks[1]);
            var lastTickValueforNegative2 = staticYscaleTIcks[0] + (staticYscaleTIcks[0] - staticYscaleTIcks[1]) * 2;
            //add 2 steps to have enough space between the xAxis and the labels.
            this.minValue = lastTickValueforNegative2;
            staticYscaleTIcks.unshift(lastTickValueforNegative, lastTickValueforNegative2);
        }


        this.yScaleTickValues = staticYscaleTIcks
        this.visualSettings.yAxisFormatting.YAxisDataPointRangeStart = this.minValue;
        this.visualSettings.yAxisFormatting.YAxisDataPointRangeEnd = this.maxValue;

        this.orientation = new Orientation(this.orientationName, {
            minValue: this.minValue,
            maxValue: this.maxValue,
            innerWidth: this.innerWidth,
            innerHeight: this.innerHeight,
            xAxisPosition: this.xAxisPosition,
            scrollbarBreath: this.scrollbarBreath
        });

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
    private measureCrossAxis(gParent: any) {
        const o = this.orientation;
        var g = gParent.append('g').attr('class', 'yAxisParentGroup');

        var yAxisScale = o.crossAxisGenerator().tickValues(this.yScaleTickValues);

        if (this.visualSettings.yAxisFormatting.show) {
            var yAxis = this.styledAxisGroup(g, this.visualSettings.yAxisFormatting, 'myYaxis');

            yAxisScale.tickFormat(d => this.formatValueForYAxis(d));

            yAxis.call(yAxisScale);

            this.applyGridlineStyle(yAxis.selectAll('path'), 'black', "0pt");
            if (this.visualSettings.yAxisFormatting.showGridLine) {

                this.applyGridlineStyle(yAxis.selectAll('line'), this.visualSettings.yAxisFormatting.gridLineColor, gridlineStrokeWidth(this.visualSettings, "y") / 10 + "pt");
            } else {
                this.applyGridlineStyle(yAxis.selectAll('line'), this.visualSettings.yAxisFormatting.gridLineColor, "0pt");
            }

            // adjust the chart area according to the width/height of the cross axis
            const node = yAxis.node()!;
            this[o.crossAxisExtentField] = o.name === "Vertical"
                ? node.getBoundingClientRect().width
                : node.getBoundingClientRect().height;
            if (o.name === "Vertical") {
                this.innerWidth = this.innerWidth - this.yAxisWidth;
            }
        }
        g.remove();
    }

    private createCrossAxis(gParent: any, adjust: any) {
        const o = this.orientation;
        var g = gParent.append('g').attr('class', 'yAxisParentGroup');

        var yAxisScale = o.crossAxisGenerator().tickValues(this.yScaleTickValues);

        if (this.visualSettings.yAxisFormatting.show) {
            var yAxis = this.styledAxisGroup(g, this.visualSettings.yAxisFormatting, 'myYaxis');
            yAxisScale.tickFormat(d => this.formatValueForYAxis(d));

            yAxis.call(yAxisScale);
            if (!this.visualSettings.yAxisFormatting.showYAxisValues) {
                yAxis.selectAll('text').style('visibility', 'hidden');
            }
            this.applyGridlineStyle(yAxis.selectAll('path'), 'black', "0pt");

            if (this.visualSettings.yAxisFormatting.showGridLine) {
                this.applyGridlineStyle(yAxis.selectAll('line'), this.visualSettings.yAxisFormatting.gridLineColor, gridlineStrokeWidth(this.visualSettings, "y") / 10 + "pt");
            } else {
                this.applyGridlineStyle(yAxis.selectAll('line'), this.visualSettings.yAxisFormatting.gridLineColor, "0pt");
            }
            if (this.visualSettings.yAxisFormatting.showZeroAxisGridLine) {
                yAxis.selectAll('line').each((d: any, i: number, nodes: any) => {
                    if (d == 0) {
                        this.applyGridlineStyle(d3.select(nodes[i]), this.visualSettings.yAxisFormatting.zeroLineColor, this.visualSettings.yAxisFormatting.zeroLineStrokeWidth / 10 + "pt");
                    }
                });
            }

            const extent = o.valueAxisLineExtent();
            yAxis.selectAll('line').attr('x2', extent.x2).attr('y2', extent.y2);
        }
        var transform = o.name === "Vertical"
            ? `translate(${adjust},${this.margin.top})`
            : `translate(${-this.findRightHorizontal},${adjust})`;
        g.attr('transform', transform);
    }
    private createLabels(gParent: any) {
        const o = this.orientation;
        var g = gParent.append('g').attr('class', 'myBarLabels');

        var xScale = o.mainBand(this.barChartData.map(this.xValue));
        if (this.visualSettings.LabelsFormatting.show) {

            var pillarLabelsg = g.selectAll('.labels')
                .data(this.barChartData)
                .enter().append('g');

            var pillarLabels = o.name === "Vertical"
                ? pillarLabelsg.append('text').attr('class', 'labels')
                : pillarLabelsg.append('text').append('tspan').attr('class', 'labels');
            var labelFormatting = (d: any) => {
                return this.formatValueforLabels(d);
            }

            var pillarLabelsText = pillarLabels
                .text((d: any) => labelFormatting(d));

            pillarLabelsText.style('font-size', this.visualSettings.LabelsFormatting.fontSize + "pt")
                .style("font-family", this.visualSettings.LabelsFormatting.fontFamily)
                .style('fill', (d: any) => {
                    return d.customFontColor;
                });

            var mainPos = o.mainPos;
            pillarLabelsg.attr('transform', (d: any, i: number, nodes: any) => {
                const mp = o.labelMainPosition(xScale, d);
                const cp = o.barLabelCrossPos(d, i, nodes, pillarLabelsg, this.barChartData);
                return mainPos === "x" ? `translate(${mp},${cp})` : `translate(${cp},${mp})`;
            })

        }
        o.labelFit(g.selectAll(".labels"), o.name === "Vertical" ? 0 : this.width + this.findRightHorizontal - this.scrollbarBreath);
        this.tooltipServiceWrapper.addTooltip(g.selectAll('.labels'),
            (dataPoint: any) => buildValueTooltip(dataPoint),
            // no identity-based tooltips here; the util's identity getter is optional
            () => (null as unknown as ISelectionId));

        if (o.name === "Vertical") {
            g.selectAll(".labels")
                .call(this.labelAlignment, xScale.bandwidth());
        }
        g.attr('transform', o.scrollableTransform(this.findRightHorizontal, this.margin.top));
    }
    private createBars(gParent: any, data: any) {
        const o = this.orientation;
        var g = gParent.append('g').attr('class', 'myBars');

        var xScale = o.mainBand(data.map(this.xValue));

        this.bars = g.selectAll('rect').data(this.barChartData)
            .enter().append('rect')
            .attr(o.mainPos, (d: any) => xScale(d.category))
            .attr(o.crossPosAttr, (d: any, i: number) => o.barCrossStart(d, i, this.barChartData))
            .attr(o.mainSizeAttr, xScale.bandwidth())
            .attr(o.crossSizeAttr, (d: any, i: number) => o.barCrossSize(d, i, this.barChartData))
            .attr('fill', (d: any) => d.customBarColor);
        this.interactions.applyAccessibility(this.bars);
        if (this.isHighContrast) {
            // Override any per-bar / conditional fill copied straight into
            // customBarColor by the data converters, so every path follows the
            // high-contrast palette.
            this.bars.attr('fill', this.colorPalette.background.value).attr('stroke', this.colorPalette.foreground.value).attr('stroke-width', 2);
        }

        //line joinning the bars
        if (this.visualSettings.yAxisFormatting.joinBars) {
            const mainAttr = o.mainPos;
            const crossAttr = o.crossPosAttr;
            const connectorCross = (node: any, d: any, i: number) => {
                const base = parseFloat(d3.select(node).attr(crossAttr));
                const cond = ((d.value < 0 && !d.isPillar) || (d.value > 0 && d.isPillar));
                return cond ? base : base + o.barCrossSize(d, i, this.barChartData);
            };
            this.bars.each((d: any, i: number, nodes: any) => {
                if (i != 0) {
                    g.append('line')
                        .style("stroke", this.visualSettings.yAxisFormatting.joinBarsColor)
                        .style("stroke-width", this.visualSettings.yAxisFormatting.joinBarsStrokeWidth / 10 + "pt")
                        .attr(mainAttr + "1", parseFloat(d3.select(nodes[i - 1]).attr(mainAttr)) + xScale.bandwidth())
                        .attr(crossAttr + "1", connectorCross(nodes[i], d, i))
                        .attr(mainAttr + "2", parseFloat(d3.select(nodes[i]).attr(mainAttr)))
                        .attr(crossAttr + "2", connectorCross(nodes[i], d, i));
                }
            });
        }

        // Clear selection when clicking outside a bar
        this.interactions.wireRootClear(this.svg, () => this.bars);

        //reset selections when the visual is re-drawn
        this.interactions.syncSelectionState(
            this.bars,
            <ISelectionId[]>this.selectionManager.getSelectionIds()
        );
        if (this.visualType == "drillable" || this.visualType == "staticCategory" || this.visualType == "drillableCategory") {
            this.interactions.wireClick(this.bars, () => this.bars);
        }

        this.tooltipServiceWrapper.addTooltip(g.selectAll('rect'),
            (dataPoint: any) => buildValueTooltip(dataPoint),
            (dataPoint: any) => tooltipSelectionId(dataPoint));

        g.attr('transform', o.scrollableTransform(this.findRightHorizontal, this.margin.top));

    }
    private lineWidth(d: any, i: number) {
        var defaultwidth = gridlineStrokeWidth(this.visualSettings, "x") / 10 + "pt";
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
        if (this.visualSettings.yAxisFormatting.YAxisDataPointOption == "Auto" || this.visualSettings.yAxisFormatting.YAxisDataPointOption == "Range") {

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
    private findBottom = 0;
    private findRightHorizontal = 0;

    private checkBarWidth(options: any) {
        const o = this.orientation;
        if (!this.visualSettings.xAxisFormatting.fitToWidth) {
            this.visualUpdateOptions = options;
            var xScale = o.mainBand(this.barChartData.map(this.xValue));
            var currentBarWidth = xScale.step();
            if (currentBarWidth < this.visualSettings.xAxisFormatting.barWidth) {
                currentBarWidth = this.visualSettings.xAxisFormatting.barWidth;

                var scrollBarGroup = this.svg.append('g');
                var scrollbarContainer = scrollBarGroup.append('rect')
                    .attr('width', o.scrollOrient == "x" ? this.width : this.scrollbarBreath)
                    .attr('height', o.scrollOrient == "x" ? this.scrollbarBreath : this.innerHeight)
                    .attr('x', o.scrollOrient == "x" ? 0 : this.width - this.scrollbarBreath - this.margin.left)
                    .attr('y', o.scrollOrient == "x" ? this.height - this.scrollbarBreath : 0)
                    .attr('fill', '#e1e1e1')
                    .attr('opacity', 0.5)
                    .attr('rx', 4)
                    .attr('ry', 4);

                var scrollBarGroupHeight: number = this.innerHeight;
                if (o.scrollOrient == "x") {
                    this.innerWidth = currentBarWidth * this.barChartData.length + (currentBarWidth * xScale.padding());
                    this.innerHeight = this.height - this.margin.top - this.margin.bottom - this.scrollbarBreath;
                } else {
                    this.innerHeight = currentBarWidth * this.barChartData.length + (currentBarWidth * xScale.padding());
                }

                var dragStartPosition = 0;
                var dragScrollBarXStartposition = 0;

                if (o.scrollOrient == "x") {
                    var scrollbarwidth = this.width * this.width / this.innerWidth;
                    var scrollbar: d3.Selection<any, any, any, any> = scrollBarGroup.append('rect')
                        .attr('width', scrollbarwidth).attr('height', this.scrollbarBreath)
                        .attr('x', 0).attr('y', this.height - this.scrollbarBreath)
                        .attr('fill', '#000').attr('opacity', 0.24).attr('rx', 4).attr('ry', 4);
                    var scrollBarDragBar = d3.drag().on("start", (event) => {
                        dragStartPosition = event.x;
                        dragScrollBarXStartposition = parseInt(scrollbar.attr('x'));
                    }).on("drag", (event) => {
                        var m = event.x - dragStartPosition;
                        if (dragScrollBarXStartposition + m >= 0 && (dragScrollBarXStartposition + m + scrollbarwidth <= this.width)) {
                            scrollbar.attr('x', dragScrollBarXStartposition + m);
                            this.gScrollable.attr('transform', `translate(${(dragScrollBarXStartposition + m) / (this.width - scrollbarwidth) * (this.innerWidth - this.width) * -1},${0})`);
                        }
                    });
                    var scrollBarWheel = d3.zoom().on("zoom", (event) => {
                        var zc = parseInt(scrollbarContainer.attr('width'));
                        var dY = event.sourceEvent.deltaY;
                        var zm = dY / 100 * zc / this.barChartData.length;
                        var zStart = parseInt(scrollbar.attr('x'));
                        var zH = parseInt(scrollbar.attr('width'));
                        var m = zStart + zm;
                        if (m < 0) m = 0;
                        if (m + zH > zc) m = zc - zH;
                        scrollbar.attr('x', m);
                        this.gScrollable.attr('transform', `translate(${(m) / (this.width - scrollbarwidth) * (this.innerWidth - this.width) * -1},${0})`);
                    });
                    scrollBarDragBar(this.svg); scrollBarWheel(this.svg); scrollBarDragBar(scrollbar);
                } else {
                    var scrollbarHeight = (scrollBarGroupHeight) * (scrollBarGroupHeight) / this.innerHeight;
                    var scrollbar: d3.Selection<any, any, any, any> = scrollBarGroup.append('rect')
                        .attr('width', this.scrollbarBreath).attr('height', scrollbarHeight)
                        .attr('x', this.width - this.scrollbarBreath - this.margin.left).attr('y', 0)
                        .attr('fill', '#000').attr('opacity', 0.24).attr('rx', 4).attr('ry', 4);
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
                        var zm = event.sourceEvent.deltaY / 100 * zc / this.barChartData.length;
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
    }

    private createCategoryAxis(gParent: any, options: any, allDatatemp: any) {
        const o = this.orientation;
        var g = gParent.append('g').attr('class', 'xAxisParentGroup');
        var myAxisParentHeight = 0;
        const dataView = requireMatrixDataView(this.visualUpdateOptions);
        var rows = dataView.matrix.rows;
        var root = rows.root;
        var levels = allDatatemp.length;
        var xScale;
        var xBaseScale = o.mainBand(allDatatemp[allDatatemp.length - 1].map(this.xValue));
        if (dataView.matrix.valueSources.length > 1) {
            var pillarsCount = 3;
            var fullWidth = o.scrollOrient == "x"
                ? this.innerWidth - xBaseScale.bandwidth() + (xBaseScale.step() * xBaseScale.padding() * pillarsCount)
                : this.innerHeight - xBaseScale.bandwidth() + (xBaseScale.step() * xBaseScale.padding() * pillarsCount);
            var myBandwidth = fullWidth / allDatatemp[allDatatemp.length - 1].length;
        } else {
            var pillarsCount = 2;
            var fullWidth = o.scrollOrient == "x"
                ? this.innerWidth - xBaseScale.bandwidth() - (xBaseScale.step() * xBaseScale.padding() * pillarsCount)
                : this.innerHeight - xBaseScale.bandwidth() - (xBaseScale.step() * xBaseScale.padding() * pillarsCount);
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
                currData = getMatrixLevelsAt(root, allDataIndex, dataView, this.host, this.formatter);
                xAxisrange.push(0);
                currData.forEach((element: any) => {
                    currChildCount = currChildCount + myBandwidth * element.childrenCount;
                    xAxisrange.push(currChildCount);
                });
                xScale = d3.scaleOrdinal()
                    .domain(currData.map((displayName, index) => index + displayName))
                    .range(xAxisrange);
            }
            this[o.edgeField] = 0;
            var myWidth = currChildCount + myBandwidth;
            if (allDataIndex != (levels - 1)) {
                if (dataView.matrix.valueSources.length == 1) {
                    var myxAxisParent;
                    this.createAxis(myxAxisParent, g, false, myWidth, 0, xScale, xBaseScale, currData, allDataIndex, levels, xAxisrange, myAxisParentHeight);
                } else {
                    for (let index = 1; index < dataView.matrix.valueSources.length; index++) {
                        var myxAxisParent;
                        this.createAxis(myxAxisParent, g, false, myWidth, index, xScale, xBaseScale, currData, allDataIndex, levels, xAxisrange, myAxisParentHeight);
                    }
                }
            } else {
                var myxAxisParent;
                this.createAxis(myxAxisParent, g, true, myWidth, 1, xScale, xBaseScale, currData, allDataIndex, levels, xAxisrange, myAxisParentHeight);
            }
            myAxisParentHeight = this[o.edgeField];
        }
        g.selectAll('text').each((d: any, i: number, nodes: any) => {
            if (o.scrollOrient == "x") {
                if (this.xAxisPosition <= nodes[i].getBoundingClientRect().bottom) {
                    this.xAxisPosition = nodes[i].getBoundingClientRect().bottom;
                }
            } else {
                if (this.xAxisPosition >= nodes[i].getBoundingClientRect().left) {
                    this.xAxisPosition = nodes[i].getBoundingClientRect().left;
                }
            }
        });
        if (o.scrollOrient == "x") {
            g.attr('transform', `translate(${0},${this.height - this.xAxisPosition - this.margin.bottom - this.scrollbarBreath + this.legendHeight})`);
            this.innerHeight = this.height - this.margin.top - this.margin.bottom - this.xAxisPosition - this.scrollbarBreath + this.legendHeight;
        } else {
            this.findRightHorizontal = this.xAxisPosition;
            g.attr('transform', `translate(${this.xAxisPosition * -1},${0})`);
        }
    }

    private createAxis(myxAxisParent: any, g: any, baseAxis: boolean, myWidth: any, index: number, xScale: any, xBaseScale: any, currData: any, allDataIndex: any, levels: any, xAxisrange: any, myAxisParentHeight: any) {
        const o = this.orientation;
        var myxAxisParentx = o.mainAxis(xScale);
        myxAxisParent = this.styledAxisGroup(g, this.visualSettings.xAxisFormatting, 'myXaxis')
            .call(myxAxisParentx);
        myxAxisParent
            .attr('transform', o.axisGroupTransform(baseAxis, index, xBaseScale, myWidth, myAxisParentHeight));
        this.applyGridlineStyle(myxAxisParent.selectAll('path'), this.visualSettings.yAxisFormatting.gridLineColor);
        var xAxislabels = myxAxisParent.selectAll(".tick text").data(currData).text((d: any) => d.displayName);
        if (this.visualType == "drillable" || this.visualType == "staticCategory" || this.visualType == "drillableCategory") {
            this.interactions.wireClick(xAxislabels, () => this.bars);
        }
        this.tooltipServiceWrapper.addTooltip(myxAxisParent.selectAll(".tick text"),
            (dataPoint: any) => buildCategoryTooltip(dataPoint),
            () => (null as unknown as ISelectionId));
        const wrapOpts = o.name === "Vertical"
            ? (this.visualSettings.xAxisFormatting.labelWrapText
                ? { splitToken: "whitespace" as const, layout: "vertical" as const }
                : { splitToken: "" as const, layout: "vertical" as const, maxLines: 3, ellipsis: true })
            : (this.visualSettings.xAxisFormatting.labelWrapText
                ? { splitToken: "whitespace" as const, layout: "horizontal" as const }
                : null);
        if (allDataIndex != (levels - 1)) {
            if (wrapOpts) {
                myxAxisParent.selectAll(".tick text").call(this.wrapLabels, xBaseScale.bandwidth(), wrapOpts);
            }
            myxAxisParent.selectAll(".tick text").data(currData).attr('transform', (d: any, i: number) => o.secondaryTickLabelTransform(xAxisrange, i, this.visualSettings.xAxisFormatting.padding));
            myxAxisParent.selectAll("line").remove();
        } else {
            if (wrapOpts) {
                myxAxisParent.selectAll(".tick text").call(this.wrapLabels, xBaseScale.bandwidth(), wrapOpts);
            }
            xAxislabels.attr('transform', o.baseTickLabelTransform(this.visualSettings.xAxisFormatting.padding));
        }
        myxAxisParent.selectAll("text").each((d: any, i: number, nodes: any) => {
            if (o.scrollOrient == "x") {
                if (this[o.edgeField] <= nodes[i].getBoundingClientRect().bottom) {
                    this[o.edgeField] = nodes[i].getBoundingClientRect().bottom - this.legendHeight;
                }
            } else {
                if (this[o.edgeField] >= nodes[i].getBoundingClientRect().left) {
                    this[o.edgeField] = nodes[i].getBoundingClientRect().left;
                }
            }
        });
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
        this.createAxisGridlines(myxAxisParent, currData, allDataIndex, levels, xScale, xAxisrange);
    }

    private createAxisGridlines(myxAxisParent: any, currData: any, allDataIndex: any, levels: any, xScale: any, xAxisrange: any) {
        const o = this.orientation;
        if (this.visualSettings.xAxisFormatting.showGridLine) {
            this.applyGridlineStyle(myxAxisParent.selectAll('path'), this.visualSettings.xAxisFormatting.gridLineColor, gridlineStrokeWidth(this.visualSettings, "x") / o.xGridlineStrokeDivisor + "pt");
            var myAxisTop = myxAxisParent.select("path").node()!.getBoundingClientRect().top;
            const catPos = (d: any, i: number) => allDataIndex == (levels - 1)
                ? xScale(d.category) - (xScale.padding() * xScale.step()) / 2
                : xAxisrange[i];
            const ext = this[o.edgeField] - myAxisTop;
            myxAxisParent.selectAll(".text").data(currData).enter().append("line")
                .attr("x1", (d: any, i: number) => o.gridlineAttrs(catPos(d, i), ext).x1)
                .attr("y1", (d: any, i: number) => o.gridlineAttrs(catPos(d, i), ext).y1)
                .attr("x2", (d: any, i: number) => o.gridlineAttrs(catPos(d, i), ext).x2)
                .attr("y2", (d: any, i: number) => o.gridlineAttrs(catPos(d, i), ext).y2)
                .attr("stroke-width", (d: any, i: number) => this.lineWidth(d, i))
                .attr("stroke", this.visualSettings.xAxisFormatting.gridLineColor);
        } else {
            this.applyGridlineStyle(myxAxisParent.selectAll('path'), this.visualSettings.xAxisFormatting.gridLineColor, "0pt");
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
                        if (line.length == 1) {
                            var currline = line[0].split("");
                            while (tspan.node()!.getComputedTextLength() > width) {
                                currline.pop();
                                line[0] = currline.join("");
                                tspan.text(line[0]);
                            }
                        } else {
                            line.pop();
                            tspan.text(line.join(joinSep));
                            line = [word];
                            tspan = t.append("tspan").attr("x", 0).attr("y", y).attr("dy", ++lineNumber * lineHeight + dy + "em").text(word);
                            currline = tspan.text().split("");
                            while (tspan.node()!.getComputedTextLength() > width) {
                                currline.pop();
                                tspan.text(currline.join(""));
                            }
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
        return this.formatter.label(d);
    }
    private formatValueForYAxis(d: any) {
        return this.formatter.yAxis(d, {
            min: this.minValue,
            max: this.maxValue,
            primaryFormat: (this.barChartData && this.barChartData.length > 0) ? this.barChartData[0].numberFormat : undefined,
            option: this.visualSettings.yAxisFormatting.YAxisValueFormatOption,
            decimals: this.visualSettings.yAxisFormatting.decimalPlaces,
        });
    }
}