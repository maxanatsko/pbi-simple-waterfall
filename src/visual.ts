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
// The selection-manager APIs traffic in the narrower `extensibility.ISelectionId`;
// only the visuals variant carries `.includes()` / `.equals()` etc.
import ISelectionIdBase = powerbi.extensibility.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import DataViewMatrixNode = powerbi.DataViewMatrixNode;
import DataViewMatrix = powerbi.DataViewMatrix;
import * as d3 from "d3";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { VisualSettings, VisualFormattingSettingsModel, DEFAULT_GREY } from "./settings";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { Orientation, OrientationName } from "./orientation";
import { BarChartDataPoint, createBarChartDataPoint } from "./dataPoint";
import { buildValueTooltip, buildCategoryTooltip, tooltipSelectionId } from "./tooltip";

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
    private allowInteractions!: boolean;
    private colorPalette: powerbi.extensibility.ISandboxExtendedColorPalette;
    private isHighContrast: boolean;



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

    }
    /** Foreground colour to use when Windows High Contrast mode is active. */
    private get hcForeground(): string {
        return this.colorPalette.foreground.value;
    }
    /** Background colour to use when Windows High Contrast mode is active. */
    private get hcBackground(): string {
        return this.colorPalette.background.value;
    }
    private static parseSettings(dataView: DataView): VisualSettings {
        return <VisualSettings>VisualSettings.parse(dataView);
    }

    /**
     * Returns the first dataView with its `matrix` proven non-null. Every data
     * converter needs the matrix; `update()` runs inside a try/catch that reports
     * `renderingFailed`, so throwing here is the intended "no data" path.
     */
    private requireMatrixDataView(options: VisualUpdateOptions): DataView & { matrix: DataViewMatrix } {
        const dataView = options && options.dataViews && options.dataViews[0];
        if (!dataView || !dataView.matrix) {
            throw new Error("Multi-Step Waterfall: a matrix dataView is required.");
        }
        return dataView as DataView & { matrix: DataViewMatrix };
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
            <number>this.gridlineStrokeWidth("x"),
            <number>this.gridlineStrokeWidth("y"));
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
        const dataView = this.requireMatrixDataView(options);
        this.visualSettings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
        this.chartContainer.selectAll('svg').remove();
        this.addLegend(options);
        this.width = options.viewport.width;
        this.height = options.viewport.height - this.legendHeight;
        this.xAxisPosition = 0;
        if (dataView.matrix.rows.levels.length != 1){
            this.visualSettings.chartOrientation.limitBreakdown=false;
        }
        if (dataView.matrix.rows.levels.length == 0) {
            this.visualType = "static";
            this.barChartData = this.getDataStaticWaterfall(options);

            var allData: BarChartDataPoint[][] = [];
            allData.push(this.barChartData);

        } else if (dataView.matrix.rows.levels.length == 1 && dataView.matrix.valueSources.length == 1) {
            this.visualType = "staticCategory";
            this.barChartData = this.getDataStaticCategoryWaterfall(options);

            var allData: BarChartDataPoint[][] = [];
            allData.push(this.barChartData);


        } else if (dataView.matrix.rows.levels.length != 1 && dataView.matrix.valueSources.length == 1) {
            this.visualType = "drillableCategory";
            var allData: BarChartDataPoint[][] = this.getDataDrillableCategoryWaterfall(options);
            this.barChartData = allData[allData.length - 1];




        } else {
            this.visualType = "drillable";
            var allData: BarChartDataPoint[][] = this.getDataDrillableWaterfall(options);
            this.barChartData = allData[allData.length - 1];
            


        }
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
        this.allowInteractions = true;
        this.orientationName = this.visualSettings.chartOrientation.orientation == "Horizontal" ? "Horizontal" : "Vertical";
        this.createWaterfallGraphCore(options, allData);
    }

    private createWaterfallGraphCore(options: any, allData: any) {
        const o = this.orientationName;

        this.svgYAxis = this.chartContainer
            .append('svg');
        this.svg = this.chartContainer
            .append('svg');
        this.svg.on('contextmenu', (event: MouseEvent) => {

            const mouseEvent: MouseEvent = event;
            const eventTarget: EventTarget | null = mouseEvent.target;
            let dataPoint: any = d3.select(<d3.BaseType>eventTarget).datum();
            this.selectionManager.showContextMenu(dataPoint ? dataPoint.selectionId : {}, {
                x: mouseEvent.clientX,
                y: mouseEvent.clientY
            });
            mouseEvent.preventDefault();
        });
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

    private gridlineStrokeWidth = (axis: "x" | "y"): number =>
        Math.max(1, (axis === "x" ? this.visualSettings.xAxisFormatting : this.visualSettings.yAxisFormatting).gridLineStrokeWidth);
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

                this.applyGridlineStyle(yAxis.selectAll('line'), this.visualSettings.yAxisFormatting.gridLineColor, this.gridlineStrokeWidth("y") / 10 + "pt");
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
                this.applyGridlineStyle(yAxis.selectAll('line'), this.visualSettings.yAxisFormatting.gridLineColor, this.gridlineStrokeWidth("y") / 10 + "pt");
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
        this.applyBarAccessibility(this.bars);
        if (this.isHighContrast) {
            // Override any per-bar / conditional fill copied straight into
            // customBarColor by the data converters, so every path follows the
            // high-contrast palette.
            this.bars.attr('fill', this.hcBackground).attr('stroke', this.hcForeground).attr('stroke-width', 2);
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
        this.svg.on('click', () => {
            if (this.allowInteractions) {
                this.selectionManager
                    .clear()
                    .then(() => {
                        this.selectionManager.registerOnSelectCallback(
                            (ids: ISelectionIdBase[]) => {
                                this.syncSelectionState(this.bars, ids);
                            });
                    });
            }
            this.bars.attr('fill-opacity', 1);
        });

        //reset selections when the visual is re-drawn
        this.syncSelectionState(
            this.bars,
            <ISelectionId[]>this.selectionManager.getSelectionIds()
        );
        if (this.visualType == "drillable" || this.visualType == "staticCategory" || this.visualType == "drillableCategory") {
            this.wireDataPointSelection(this.bars);
        }

        this.tooltipServiceWrapper.addTooltip(g.selectAll('rect'),
            (dataPoint: any) => buildValueTooltip(dataPoint),
            (dataPoint: any) => tooltipSelectionId(dataPoint));

        g.attr('transform', o.scrollableTransform(this.findRightHorizontal, this.margin.top));

    }
    private wireDataPointSelection = (selection: d3.Selection<any, any, any, any>) => {
        selection.on('click', (event: MouseEvent, d: any) => {
            // Allow selection only if the visual is rendered in a view that supports interactivity (e.g. Report)
            if (this.allowInteractions) {
                const isCtrlPressed: boolean = event.ctrlKey;
                if (this.selectionManager.hasSelection() && !isCtrlPressed) {
                    this.bars.attr('fill-opacity', 1);
                }
                this.selectionManager
                    .select(d.selectionId, isCtrlPressed)
                    .then((ids: ISelectionIdBase[]) => {
                        this.syncSelectionState(this.bars, ids);
                    });
                event.stopPropagation();
            }
        });
    }
    private applyBarAccessibility = (bars: d3.Selection<any, any, any, any>) => {
        if (!bars) {
            return;
        }
        const self = this;
        // Roving tab index: the whole bar series is one Tab stop. Only the
        // "current" bar is tabbable; Arrow / Home / End move focus and the 0
        // index with it.
        bars
            .attr('tabindex', (d: any, i: number) => (i === 0 ? 0 : -1))
            .attr('role', 'option')
            .attr('aria-label', (d: any) => {
                const name = d.category === "defaultBreakdownStepOther" ? (d.displayName || "Other") : d.category;
                const value = (d.toolTipValue1Formatted != null && d.toolTipValue1Formatted !== "")
                    ? d.toolTipValue1Formatted
                    : d.value;
                return `${name}: ${value}`;
            })
            .on('keydown', function (event: KeyboardEvent, d: any) {
                const nodes = bars.nodes();
                const i = nodes.indexOf(this);
                const focusAt = (target: number) => {
                    const clamped = Math.max(0, Math.min(target, nodes.length - 1));
                    const el = nodes[clamped] as SVGElement;
                    if (!el) {
                        return;
                    }
                    nodes.forEach((n, k) => (n as SVGElement).setAttribute('tabindex', k === clamped ? '0' : '-1'));
                    el.focus();
                };
                switch (event.key) {
                    case 'Enter':
                    case ' ':
                    case 'Spacebar':
                        event.preventDefault();
                        if (!self.allowInteractions) {
                            return;
                        }
                        self.selectionManager
                            .select(d.selectionId, event.ctrlKey || event.metaKey || event.shiftKey)
                            .then((ids: ISelectionIdBase[]) => self.syncSelectionState(self.bars, ids));
                        break;
                    case 'ArrowRight':
                    case 'ArrowDown':
                        event.preventDefault();
                        focusAt(i + 1);
                        break;
                    case 'ArrowLeft':
                    case 'ArrowUp':
                        event.preventDefault();
                        focusAt(i - 1);
                        break;
                    case 'Home':
                        event.preventDefault();
                        focusAt(0);
                        break;
                    case 'End':
                        event.preventDefault();
                        focusAt(nodes.length - 1);
                        break;
                    case 'Escape':
                        if (self.allowInteractions) {
                            self.selectionManager.clear().then(() => self.syncSelectionState(self.bars, []));
                        }
                        break;
                    default:
                        break;
                }
            });
    }
    private syncSelectionState = (bars: any, selectionIds: ISelectionIdBase[]) => {
        if (!bars) {
            return;
        }
        if (!selectionIds.length) {
            bars.attr("fill-opacity", null);
            if (this.isHighContrast) {
                bars.attr('stroke', this.hcForeground).attr('stroke-width', 2);
            }
            return;
        }
        bars.each((d: any, i: number, nodes: any) => {
            const isSelected: boolean = this.isSelectionIdInArray(selectionIds, d.selectionId);
            d3.select(nodes[i]).attr('fill-opacity', isSelected
                ? 1
                : 0.5
            );
            if (this.isHighContrast) {
                d3.select(nodes[i])
                    .attr('stroke', isSelected ? this.colorPalette.foregroundSelected.value : this.hcForeground)
                    .attr('stroke-width', isSelected ? 3 : 1);
            }
        });
    }
    private isSelectionIdInArray(selectionIds: ISelectionIdBase[], selectionId: ISelectionIdBase): boolean {

        if (!selectionIds || !selectionId) {
            return false;
        }
        return selectionIds.some((currentSelectionId) => {
            return (currentSelectionId as ISelectionId).includes(selectionId as ISelectionId);
        });
    };
    private lineWidth(d: any, i: number) {
        var defaultwidth = this.gridlineStrokeWidth("x") / 10 + "pt";
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
    private getfillColor(isPillar: number, value: number) {
        var barColor: string = DEFAULT_GREY;
        if (this.isHighContrast) {
            return this.hcBackground;
        }
        if (isPillar == 1) {
            barColor = this.visualSettings.sentimentColor.sentimentColorTotal;
        } else {
            if (value < 0) {
                barColor = this.visualSettings.sentimentColor.sentimentColorAdverse;
            } else {
                barColor = this.visualSettings.sentimentColor.sentimentColorFavourable;
            }
        }
        return barColor;

    }
    private getLabelFontColor(isPillar: number, value: number) {
        if (this.isHighContrast) {
            return this.hcForeground;
        }
        if (this.visualSettings.LabelsFormatting.useDefaultFontColor) {
            return this.visualSettings.LabelsFormatting.fontColor;
        } else {
            if (isPillar == 1) {
                return this.visualSettings.LabelsFormatting.sentimentFontColorTotal;
            } else if (value < 0) {
                return this.visualSettings.LabelsFormatting.sentimentFontColorAdverse;
            } else {
                return this.visualSettings.LabelsFormatting.sentimentFontColorFavourable;
            }
        }
    }
    private getLabelPosition(isPillar: number, value: number) {
        if (this.visualSettings.LabelsFormatting.useDefaultLabelPositioning) {
            return this.visualSettings.LabelsFormatting.labelPosition;
        } else {
            if (isPillar == 1) {
                return this.visualSettings.LabelsFormatting.labelPositionTotal;
            } else if (value < 0) {
                return this.visualSettings.LabelsFormatting.labelPositionAdverse;
            } else {
                return this.visualSettings.LabelsFormatting.labelPositionFavourable;
            }
        }

    }
    private applyPerPointFormatting(dataPoint: BarChartDataPoint, objects: any, gateFontColorOnSentiment: boolean = true, gateLabelPositioningOnSentiment: boolean = true) {
        if (objects) {
            if (objects.sentimentColor && !this.visualSettings.chartOrientation.useSentimentFeatures) {
                dataPoint.customBarColor = (objects as any)["sentimentColor"]["fill"]["solid"]["color"];
            } else {
                dataPoint.customBarColor = this.getfillColor(dataPoint.isPillar, dataPoint.value);
            }

            const fontColorEnabled = gateFontColorOnSentiment
                ? !this.visualSettings.chartOrientation.useSentimentFeatures
                : true;
            if (objects.LabelsFormatting && fontColorEnabled && !this.visualSettings.LabelsFormatting.useDefaultFontColor) {
                if (objects.LabelsFormatting.fill) {
                    dataPoint.customFontColor = (objects as any)["LabelsFormatting"]["fill"]["solid"]["color"];
                } else {
                    dataPoint.customFontColor = this.getLabelFontColor(dataPoint.isPillar, dataPoint.value);
                }
            } else {
                dataPoint.customFontColor = this.getLabelFontColor(dataPoint.isPillar, dataPoint.value);
            }

            const labelPositionEnabled = gateLabelPositioningOnSentiment
                ? !this.visualSettings.chartOrientation.useSentimentFeatures
                : true;
            if (objects.LabelsFormatting && labelPositionEnabled && !this.visualSettings.LabelsFormatting.useDefaultLabelPositioning) {
                if (objects.LabelsFormatting.labelPosition) {
                    dataPoint.customLabelPositioning = objects["LabelsFormatting"]["labelPosition"] as string;
                } else {
                    dataPoint.customLabelPositioning = this.getLabelPosition(dataPoint.isPillar, dataPoint.value);
                }
            } else {
                dataPoint.customLabelPositioning = this.getLabelPosition(dataPoint.isPillar, dataPoint.value);
            }
        } else {
            dataPoint.customBarColor = this.getfillColor(dataPoint.isPillar, dataPoint.value);
            dataPoint.customFontColor = this.getLabelFontColor(dataPoint.isPillar, dataPoint.value);
            dataPoint.customLabelPositioning = this.getLabelPosition(dataPoint.isPillar, dataPoint.value);
        }
    }
    private getDataStaticWaterfall(options: VisualUpdateOptions) {
        const dataView = this.requireMatrixDataView(options);

        var visualData: BarChartDataPoint[] = [];
        var sortOrderIndex = 0;
        for (let index = 0; index < dataView.matrix.columns.root.children!.length; index++) {
            dataView.matrix.rows.root.children!.forEach((x: DataViewMatrixNode) => {
                var checkforZero = false;
                if (this.visualSettings.LabelsFormatting.HideZeroBlankValues && Number(x.values![index].value) == 0) {
                    checkforZero = true;
                }
                if (checkforZero == false) {
                    var data2 = createBarChartDataPoint();
                    data2.value = Number(x.values![index].value);
                    data2.numberFormat = this.resolveFormat(x.values![index], dataView.matrix.valueSources[index].format);
                    data2.selectionId = this.host.createSelectionIdBuilder()
                        .withMeasure(dataView.matrix.valueSources[index].queryName ?? "")
                        .createSelectionId();
                    var y = dataView.matrix.valueSources[index];
                    if (y.objects) {
                        if (y.objects.definePillars) {
                            data2.category = dataView.matrix.valueSources[index].displayName;
                            data2.displayName = dataView.matrix.valueSources[index].displayName;
                            if (y.objects["definePillars"]["pillars"]) {
                                data2.isPillar = 1;
                            } else {
                                data2.isPillar = 0;
                            }
                        } else {

                            if (dataView.matrix.valueSources[index].displayName.substring(0, 1) != "_") {
                                data2.isPillar = 0;
                                data2.category = dataView.matrix.valueSources[index].displayName;
                                data2.displayName = dataView.matrix.valueSources[index].displayName;
                            } else {
                                data2.isPillar = 1;
                                data2.category = dataView.matrix.valueSources[index].displayName;
                                data2.displayName = dataView.matrix.valueSources[index].displayName;
                            }
                        }
                        this.applyPerPointFormatting(data2, y.objects);
                    } else {

                        if (dataView.matrix.valueSources[index].displayName.substring(0, 1) != "_") {
                            data2.isPillar = 0;
                            data2.category = dataView.matrix.valueSources[index].displayName;
                            data2.displayName = dataView.matrix.valueSources[index].displayName;
                        } else {
                            data2.isPillar = 1;
                            data2.category = dataView.matrix.valueSources[index].displayName;
                            data2.displayName = dataView.matrix.valueSources[index].displayName;
                        }
                        this.applyPerPointFormatting(data2, y.objects);
                    }
                    data2.toolTipValue1Formatted = this.formatValueforLabels(data2);
                    data2.toolTipDisplayValue1 = data2.category;
                    data2.childrenCount = 1;
                    if (data2.isPillar == 1) {
                        sortOrderIndex = sortOrderIndex + 1
                        data2.sortOrderIndex = sortOrderIndex;
                        sortOrderIndex = sortOrderIndex + 1
                    } else {
                        data2.sortOrderIndex = sortOrderIndex;
                    }
                    visualData.push(data2);
                }
            });
        }
        visualData = this.sortVisualData(visualData, false);
        return visualData;
    }
    private sortVisualData(visualData: BarChartDataPoint[], drillable: boolean) {
        visualData.sort((a: BarChartDataPoint, b: BarChartDataPoint) => {
            switch (this.visualSettings.chartOrientation.sortData) {
                case 3:
                    if (Math.floor(a.sortOrderIndex) === Math.floor(b.sortOrderIndex)) {
                        return parseFloat(a.value.toString()) - parseFloat(b.value.toString());
                    }
                    return a.sortOrderIndex - b.sortOrderIndex;
                case 2:
                    if (Math.floor(a.sortOrderIndex) === Math.floor(b.sortOrderIndex)) {
                        return parseFloat(b.value.toString()) - parseFloat(a.value.toString());
                    }
                    return a.sortOrderIndex - b.sortOrderIndex;
                default:
                    return drillable ? a.sortOrderIndex - b.sortOrderIndex : 0;
            }
        });
        return visualData;
    }

    private getDataDrillableWaterfall(options: VisualUpdateOptions) {
        const dataView = this.requireMatrixDataView(options);
        var totalData: BarChartDataPoint[][] = [];
        var visualData: BarChartDataPoint[] = [];
        var allMeasureValues: any[] = [];
        // find all values and aggregate them in an array of array with each child in an array of a measure
        allMeasureValues = this.findLowestLevels();
        var sortOrderPrecision = Math.pow(10, allMeasureValues.length * allMeasureValues[0].length.toString().length);
        var sortOrderIndex = 1;
        // calculate the difference between each measure and add them to an array as the step bars and then add the pillar bars [visualData]
        for (let indexMeasures = 0; indexMeasures < allMeasureValues.length; indexMeasures++) {
            var totalValueofMeasure = 0;
            var toolTipDisplayValue1 = "";
            var toolTipDisplayValue2: string | null = "";
            var Measure1Value: number | null = null;
            var Measure2Value: number | null = null;            
            var dataPillar: BarChartDataPoint;
            for (let nodeItems = 0; nodeItems < allMeasureValues[indexMeasures].length; nodeItems++) {
                totalValueofMeasure = totalValueofMeasure + allMeasureValues[indexMeasures][nodeItems].value
                if (indexMeasures < allMeasureValues.length - 1) {
                    var data2Category: BarChartDataPoint;
                    Measure1Value = +allMeasureValues[indexMeasures][nodeItems].value;
                    Measure2Value = +allMeasureValues[indexMeasures + 1][nodeItems].value;
                    var valueDifference = Measure2Value - Measure1Value;
                    var HideZeroBlankValues: boolean = this.visualSettings.LabelsFormatting.HideZeroBlankValues;                    
                    if (HideZeroBlankValues && valueDifference == 0) {
                    } else {
                        toolTipDisplayValue1 = dataView.matrix.valueSources[indexMeasures].displayName + allMeasureValues[indexMeasures][nodeItems].category.toString();
                        toolTipDisplayValue2 = dataView.matrix.valueSources[indexMeasures + 1].displayName + allMeasureValues[indexMeasures + 1][nodeItems].category.toString();

                        var displayName: string = allMeasureValues[indexMeasures][nodeItems].displayName;
                        var category: string = dataView.matrix.valueSources[indexMeasures].displayName + allMeasureValues[indexMeasures][nodeItems].category.toString();
                        var selectionId = allMeasureValues[indexMeasures][nodeItems].selectionId;
                        data2Category = this.getDataForCategory(valueDifference, (allMeasureValues[indexMeasures][nodeItems]["numberFormat"] || dataView.matrix.valueSources[indexMeasures].format), displayName, category, 0, selectionId, sortOrderIndex + ((nodeItems + 1) / sortOrderPrecision), 1, toolTipDisplayValue1, toolTipDisplayValue2, Measure1Value, Measure2Value);
                        visualData.push(data2Category);
                    }
                    
                }
            }            
            toolTipDisplayValue1 = dataView.matrix.valueSources[indexMeasures].displayName;
            toolTipDisplayValue2 = null;
            Measure1Value = totalValueofMeasure;
            Measure2Value = null;                        
            dataPillar = this.getDataForCategory(totalValueofMeasure, ((allMeasureValues[indexMeasures][0] && allMeasureValues[indexMeasures][0]["numberFormat"]) || dataView.matrix.valueSources[indexMeasures].format), dataView.matrix.valueSources[indexMeasures].displayName, dataView.matrix.valueSources[indexMeasures].displayName, 1, null, sortOrderIndex - 1, 1, toolTipDisplayValue1, toolTipDisplayValue2, Measure1Value, Measure2Value);                        
            sortOrderIndex = sortOrderIndex + 2;
            visualData.push(dataPillar);
        }
        if (this.visualSettings.chartOrientation.limitBreakdown) {
            visualData = this.limitBreakdownsteps(options, visualData);
        }
        // Sort the [visualData] in order of the display
        if (dataView.matrix.rows.levels.length === 1) {
            this.sortVisualData(visualData, true);
        } else {
            visualData.sort((a: any, b: any) => {
                return a.sortOrderIndex - b.sortOrderIndex;
            });
        }
        // add arrays to the main array for additional x-axis for each category
        for (let levelItems = 0; levelItems < dataView.matrix.rows.levels.length - 1; levelItems++) {
            var categorynode: BarChartDataPoint[] = []
            var childrenCount = 1;
            var displayNode;

            for (let nodeItems = 0; nodeItems < visualData.length; nodeItems++) {
                var currNode = visualData[nodeItems];
                var childnode: BarChartDataPoint;
                var currCategoryText: string = currNode["category"];
                var currCategoryArray: string[] = currCategoryText.split("|");
                var newDisplayName = currCategoryArray[levelItems + 1];

                if (currNode["isPillar"] == 1 || nodeItems == 0) {

                } else {
                    var previousNode = visualData[nodeItems - 1];
                    var previousCategoryText: string = previousNode["category"];
                    var previousCategoryArray: string[] = previousCategoryText.split("|");
                    if (newDisplayName == previousCategoryArray[levelItems + 1]) {
                        newDisplayName = "";
                    }
                }
                childnode = this.getDataForCategory(currNode["value"], currNode["numberFormat"], newDisplayName, currCategoryText, currNode["isPillar"], null, currNode["sortOrderIndex"], childrenCount, currNode["toolTipDisplayValue1"], currNode["toolTipDisplayValue2"], currNode["Measure1Value"], currNode["Measure2Value"]);
                if (displayNode != undefined) {
                    if (displayNode.displayName == currCategoryArray[levelItems + 1]) {
                        displayNode.childrenCount = displayNode.childrenCount + 1;
                    } else {
                        displayNode = childnode;
                    }
                } else {
                    displayNode = childnode;
                }

                categorynode.push(childnode);
            }
            totalData.push(categorynode);
        }
        // final array that contains all the values as the last array, while all the other array are only for additional x-axis
        totalData.push(visualData);
        return totalData;
    }

    private getDataStaticCategoryWaterfall(options: VisualUpdateOptions) {
        const dataView = this.requireMatrixDataView(options);

        var visualData: BarChartDataPoint[] = [];
        var hasPillar = false;
        //*******************************************************************
        //This will always be zero as it should only have 1 measure
        var measureIndex = 0;
        //*******************************************************************
        var sortOrderIndex = 0;
        var orderIndex = 0;
        dataView.matrix.rows.root.children!.forEach((x: DataViewMatrixNode) => {
            var checkforZero = false;
            if (this.visualSettings.LabelsFormatting.HideZeroBlankValues && Number(x.values![measureIndex].value) == 0) {
                checkforZero = true;
            }
            if (checkforZero == false) {
                var data2 = createBarChartDataPoint();

                data2.value = Number(x.values![measureIndex].value);

                data2.numberFormat = this.resolveFormat(x.values![measureIndex], dataView.matrix.valueSources[measureIndex].format);
                data2.selectionId = this.host.createSelectionIdBuilder()
                    .withMatrixNode(x, dataView.matrix.rows.levels)
                    .createSelectionId();
                data2.xAxisFormat = dataView.matrix.rows.levels[0].sources[0].format;
                data2.type = dataView.matrix.rows.levels[0].sources[0].type;
                data2.category = this.formatCategory(x.value, data2.type, data2.xAxisFormat);
                data2.displayName = this.formatCategory(x.value, data2.type, data2.xAxisFormat);
                if (x.objects) {
                    if (x.objects.definePillars) {
                        if (x.objects["definePillars"]["pillars"]) {
                            data2.isPillar = 1;
                            hasPillar = true;
                        } else {
                            data2.isPillar = 0;
                        }
                    } else {
                        /* data2.category = x.value;
                        data2.displayName = x.value; */
                        data2.isPillar = 0;
                    }
                    this.applyPerPointFormatting(data2, x.objects, false);
                } else {
                    data2.isPillar = 0;
                    this.applyPerPointFormatting(data2, x.objects, false);
                }
                data2.toolTipValue1Formatted = this.formatValueforLabels(data2);
                data2.toolTipDisplayValue1 = data2.category;
                data2.childrenCount = 1;
                if (data2.isPillar == 1) {
                    sortOrderIndex = Math.round(sortOrderIndex) + 1
                    data2.sortOrderIndex = sortOrderIndex;
                    data2.sortOrderIndexforLimitBreakdown = sortOrderIndex;
                    sortOrderIndex = sortOrderIndex + 1
                } else {
                    sortOrderIndex = sortOrderIndex + + 0.000001;
                    data2.sortOrderIndex = sortOrderIndex ;
                    data2.sortOrderIndexforLimitBreakdown = sortOrderIndex;
                }
                orderIndex++;
                data2.orderIndex = orderIndex;
                visualData.push(data2);
            }
        });
        if (!hasPillar && this.visualSettings.definePillars.Totalpillar) {
            visualData.push(this.addTotalLine(visualData, options));
        }
        if (this.visualSettings.chartOrientation.limitBreakdown) {
            visualData = this.limitBreakdownsteps(options,visualData);
        }
        visualData = this.sortVisualData(visualData, false);
        return visualData;
    }
    private limitBreakdownsteps(options: VisualUpdateOptions, currData: any) {
        //var currData = []
        //currData = this.getDataStaticCategoryWaterfall(options);
        currData.sort((a: any, b: any) => {
            if (Math.round(a.sortOrderIndexforLimitBreakdown) === Math.round(b.sortOrderIndexforLimitBreakdown) && a.isPillar !=1) {
                return parseFloat(Math.abs(b.value).toString()) - parseFloat(Math.abs(a.value).toString());
            } else {
                return Math.round(a.sortOrderIndexforLimitBreakdown) - Math.round(b.sortOrderIndexforLimitBreakdown);
            }
        });
        var limit = this.visualSettings.chartOrientation.maxBreakdown;
        var limitcounter = 0;
        var otherbreakdownstepCount = 0;
        var newOther: any[] = [];
        var otherTotalValue = 0;
        var othersortOrderIndex = 0;
        for (let index = 0; index < currData.length; index++) {
            /*currData[index]["showbreakdownstep"] = false;
            otherTotalValue = otherTotalValue + currData[index].value
            othersortOrderIndex*/
            if (currData[index].isPillar == 1) {
                currData[index]["showbreakdownstep"] = true;
                limitcounter = 0;
                if (otherTotalValue != 0) {
                    newOther.push(this.addOtherBreakdownStep(options, otherTotalValue,othersortOrderIndex, othersortOrderIndex, otherbreakdownstepCount));
                    otherbreakdownstepCount++;
                }
                otherTotalValue = 0
                othersortOrderIndex = 0;

            } else if (limitcounter < limit) {
                limitcounter++;
                currData[index]["showbreakdownstep"] = true;
            }
            else if (
                (index != currData.length - 1 && currData[index].sortOrderIndex == currData[index + 1].sortOrderIndex && limitcounter < limit)
                || (index != 0 && currData[index].sortOrderIndex == currData[index - 1].sortOrderIndex && limitcounter < limit)
            ) {
                limitcounter++;
                currData[index]["showbreakdownstep"] = true;
            } else {
                currData[index]["showbreakdownstep"] = false;
                otherTotalValue = otherTotalValue + currData[index].value;
                othersortOrderIndex = Math.round(currData[index].sortOrderIndex);
            }
        }

        newOther.forEach(node => {
            currData.push(node);
        });

        for (let index = 0; index < currData.length; index++) {
            const element = currData[index];
            if (currData[index].showbreakdownstep == false) {
                currData.splice(index, 1);
                index--;
            }

        }
        currData.sort((a: any, b: any) => {
            if (a.sortOrderIndexforLimitBreakdown === b.sortOrderIndexforLimitBreakdown) {
                //return parseFloat(Math.abs(b.value).toString()) - parseFloat(Math.abs(a.value).toString());
                //return a.orderIndex - b.orderIndex;
                return a.sortOrderIndexforLimitBreakdown - b.sortOrderIndexforLimitBreakdown;
            } else {
                return a.sortOrderIndexforLimitBreakdown - b.sortOrderIndexforLimitBreakdown;
            }
        });

        

        return currData;
    }
    private addOtherBreakdownStep(options: VisualUpdateOptions, value: any, sortOrderIndex: any, sortOrderIndexforLimitBreakdown: any, otherbreakdownstepCount: any) {
        //*******************Add "Other" breakdown item *********************
        const dataView = this.requireMatrixDataView(options);
        //*******************************************************************
        //This will always be zero as it should only have 1 measure
        var measureIndex = 0;
        //
        var data2 = createBarChartDataPoint();

        data2.value = value;

        data2.numberFormat = dataView.matrix.valueSources[measureIndex].format ?? "";
        data2.selectionId = null;
        data2.xAxisFormat = dataView.matrix.rows.levels[0].sources[0].format;
        data2.type = dataView.matrix.rows.levels[0].sources[0].type;
        data2.category = "defaultBreakdownStepOther" + sortOrderIndex;
        data2.displayName = "Other";
        data2.customBarColor = this.visualSettings.sentimentColor.sentimentColorOther;
        if (this.visualSettings.LabelsFormatting.useDefaultFontColor) {
            data2.customFontColor = this.visualSettings.LabelsFormatting.fontColor
        } else {
            data2.customFontColor = this.visualSettings.LabelsFormatting.sentimentFontColorOther;
        }
        if (this.visualSettings.LabelsFormatting.useDefaultLabelPositioning) {
            data2.customLabelPositioning = this.visualSettings.LabelsFormatting.labelPosition
        } else {
            data2.customLabelPositioning = this.visualSettings.LabelsFormatting.labelPositionOther;
        }
        data2.isPillar = 0;
        data2.toolTipValue1Formatted = this.formatValueforLabels(data2);
        data2.toolTipDisplayValue1 = data2.category;
        data2.childrenCount = 1;
        data2.sortOrderIndex = sortOrderIndex + 0.999999;
        data2.sortOrderIndexforLimitBreakdown = sortOrderIndexforLimitBreakdown + 0.999999;        
        data2.showbreakdownstep = true;
        return data2;

    }
    private getDataDrillableCategoryWaterfall(options: VisualUpdateOptions) {

        const dataView = this.requireMatrixDataView(options);
        var totalData: BarChartDataPoint[][] = [];
        var visualData: BarChartDataPoint[] = [];
        var allMeasureValues: any[] = [];

        // find all values and aggregate them in an array of array with each child in an array of a measure        
        allMeasureValues = this.findLowestLevels();
        var sortOrderPrecision = Math.pow(10, allMeasureValues.length * allMeasureValues[0].length.toString().length);

        // calculate the difference between each measure and add them to an array as the step bars and then add the pillar bars [visualData]
        let indexMeasures = 0;
        var totalValueofMeasure = 0;
        var toolTipDisplayValue1 = "";
        var Measure1Value: number | null = null;
        for (let nodeItems = 0; nodeItems < allMeasureValues[indexMeasures].length; nodeItems++) {
            totalValueofMeasure = totalValueofMeasure + allMeasureValues[indexMeasures][nodeItems].value

            var data2Category: BarChartDataPoint;
            Measure1Value = +allMeasureValues[indexMeasures][nodeItems].value;

            var valueDifference = Measure1Value;
            var HideZeroBlankValues: boolean = this.visualSettings.LabelsFormatting.HideZeroBlankValues;
            if (HideZeroBlankValues && valueDifference == 0) {

            } else {

                toolTipDisplayValue1 = dataView.matrix.valueSources[indexMeasures].displayName + allMeasureValues[indexMeasures][nodeItems].category.toString();
                var displayName: string = allMeasureValues[indexMeasures][nodeItems].displayName;
                var category: string = dataView.matrix.valueSources[indexMeasures].displayName + allMeasureValues[indexMeasures][nodeItems].category.toString();
                var selectionId = allMeasureValues[indexMeasures][nodeItems].selectionId;
                data2Category = this.getDataForCategory(valueDifference, (allMeasureValues[indexMeasures][nodeItems]["numberFormat"] || dataView.matrix.valueSources[indexMeasures].format), displayName, category, 0, selectionId, 1, 1, toolTipDisplayValue1, null, Measure1Value, null);
                visualData.push(data2Category);
            }

        }
        if (this.visualSettings.definePillars.Totalpillar) {
            visualData.push(this.addTotalLine(visualData, options));
        }

        // add arrays to the main array for additional x-axis for each category
        for (let levelItems = 0; levelItems < dataView.matrix.rows.levels.length - 1; levelItems++) {
            var categorynode: BarChartDataPoint[] = []
            var childrenCount = 1;
            var displayNode;

            for (let nodeItems = 0; nodeItems < visualData.length; nodeItems++) {
                var currNode = visualData[nodeItems];
                var childnode: BarChartDataPoint;
                var currCategoryText: string = currNode["category"];
                var currCategoryArray: string[] = currCategoryText.split("|");
                var newDisplayName = currCategoryArray[levelItems + 1];

                if (currNode["isPillar"] == 1 || nodeItems == 0) {

                } else {
                    var previousNode = visualData[nodeItems - 1];
                    var previousCategoryText: string = previousNode["category"];
                    var previousCategoryArray: string[] = previousCategoryText.split("|");
                    if (newDisplayName == previousCategoryArray[levelItems + 1]) {
                        newDisplayName = "";
                    }
                }

                childnode = this.getDataForCategory(currNode["value"], currNode["numberFormat"], newDisplayName, currCategoryText, currNode["isPillar"], null, currNode["sortOrderIndex"], childrenCount, currNode["toolTipDisplayValue1"], currNode["toolTipDisplayValue2"], currNode["Measure1Value"], currNode["Measure2Value"]);
                if (displayNode != undefined) {
                    if (displayNode.displayName == currCategoryArray[levelItems + 1]) {
                        displayNode.childrenCount = displayNode.childrenCount + 1;
                    } else {
                        displayNode = childnode;
                    }
                } else {
                    displayNode = childnode;
                }

                categorynode.push(childnode);
            }
            totalData.push(categorynode);
        }

        // final array that contains all the values as the last array, while all the other array are only for additional x-axis
        totalData.push(visualData);
        return totalData;

    }
    private findLowestLevels() {

        function getChildLevel(currentNode: any, parentText: string, indexMeasures: any, rootnode: boolean) {

            if (currentNode.children.length != undefined) {
                currentNode.children.forEach((child: any) => {
                    if (rootnode) {
                        parentNodes.length = 0;
                    }
                    var format = dataView.matrix.rows.levels[child.level].sources[0].format;
                    var type = dataView.matrix.rows.levels[child.level].sources[0].type;
                    if (child.children != undefined) {
                        childrenCount = childrenCount + 1

                        /* if (currentNode == root) {
                            //selectionNode = host1.createSelectionIdBuilder().withMatrixNode(child, rows.levels)
                        } else {
                            
                        } */
                        parentNodes.push(child);
                        getChildLevel(child, parentText + "|" + getFormatCategory.formatCategory(child.value, type, format), indexMeasures, false);
                    } else {

                        /* data2.xAxisFormat = dataView.matrix.rows.levels[0].sources[0].format;
                        data2.type = dataView.matrix.rows.levels[indexMeasures].sources[0].type;
                        data2.category = this.formatCategory(x.value, data2.type, data2.xAxisFormat); */
                        var node: any = [];
                        node["value"] = child.values[indexMeasures].value;
                        node["numberFormat"] = getFormatCategory.resolveFormat(child.values[indexMeasures], dataView.matrix.valueSources[indexMeasures].format);
                        node["category"] = (parentText + "|" + getFormatCategory.formatCategory(child.value, type, format)).replace("null", "(blank)");
                        if (child.value == null) {
                            node["displayName"] = "(blank)";
                        } else {
                            node["displayName"] = getFormatCategory.formatCategory(child.value, type, format);
                            //node["displayName"] = this.formatCategory(child.value, node["type"], node["xAxisFormat"]);
                        }

                        var selectionbuilder = host1.createSelectionIdBuilder();
                        var selectionnode: any = host1.createSelectionIdBuilder();
                        if (parentNodes.length > 0) {
                            parentNodes.forEach(nodes => {
                                selectionnode = selectionbuilder.withMatrixNode(nodes, rows.levels)
                            });
                        } else {
                            selectionnode = host1.createSelectionIdBuilder();
                        }
                        var selectionId: ISelectionId = selectionnode.withMatrixNode(child, rows.levels).createSelectionId();
                        node["selectionId"] = selectionId;
                        nodes.push(node);

                    };
                });
            }
        };
        const dataView = this.requireMatrixDataView(this.visualUpdateOptions);
        var rows = dataView.matrix.rows;
        var root = rows.root;
        var allNodes: any[] = [];
        var childrenCount = 0;
        var host1 = this.host;
        var getFormatCategory = this;
        var parentNodes: any[] = [];
        for (let indexMeasures = 0; indexMeasures < dataView.matrix.valueSources.length; indexMeasures++) {
            var nodes: any[] = [];
            getChildLevel(root, "", indexMeasures, true);
            allNodes.push(nodes);
        }
        return allNodes;

    }
    private getMatrixLevelsAt(root: any, num: any) {

        function getChildLevel(currentNode: any, parentText: string) {
            if (currentNode.children.length != undefined) {

                currentNode.children.forEach((child: any) => {
                    if (index == num) {
                        mainNode.push(createNode(child));
                    } else {

                        index = index + 1;
                        if (child.children != undefined) {

                            getChildLevel(child, parentText + "|" + child.value);
                        };
                        index = index - 1;
                    }

                });

            }

        };
        function createNode(child: any) {
            var node: any = [];
            if (child.children == undefined) {
                for (let indexMeasures = 0; indexMeasures < dataView.matrix.valueSources.length; indexMeasures++) {
                    var nodeValue: any[] = [];
                    nodeValue = child.values[indexMeasures].value;
                    node.push(nodeValue);
                }
            } else {
                counter = 0;
                countChildrens(child);
                node["childrenCount"] = counter;

            }
            var format = dataView.matrix.rows.levels[num].sources[0].format;
            var type = dataView.matrix.rows.levels[num].sources[0].type;
            if (child.value == null) {
                node["category"] = "(blank)";
                node["displayName"] = "(blank)";
            } else {
                node["category"] = getFormatCategory.formatCategory(child.value, type, format);
                node["displayName"] = getFormatCategory.formatCategory(child.value, type, format);
            }

            var selectionId: ISelectionId = host1.createSelectionIdBuilder()
                .withMatrixNode(child, rows.levels)
                .createSelectionId();
            node["selectionId"] = selectionId;
            return node;
        }
        function countChildrens(child: any) {
            if (child.children == undefined) {
                counter = counter + 1;
            } else {
                child.children.forEach((element: any) => {
                    countChildrens(element)
                });
            }

        }
        var counter = 0;
        var index = 0;
        var host1 = this.host
        var getFormatCategory = this;
        var mainNode: any[] = [];
        const dataView = this.requireMatrixDataView(this.visualUpdateOptions);
        var rows = dataView.matrix.rows;
        getChildLevel(root, "");
        return mainNode;

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
        const dataView = this.requireMatrixDataView(this.visualUpdateOptions);
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
                currData = this.getMatrixLevelsAt(root, allDataIndex);
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
            this.wireDataPointSelection(xAxislabels);
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
            this.applyGridlineStyle(myxAxisParent.selectAll('path'), this.visualSettings.xAxisFormatting.gridLineColor, this.gridlineStrokeWidth("x") / o.xGridlineStrokeDivisor + "pt");
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

    private addTotalLine(data: any, options: VisualUpdateOptions) {
        const dataView = this.requireMatrixDataView(options);
        var data2 = createBarChartDataPoint();
        var totalValue = 0;
        var orderIndex = 0;
        //*******************************************************************
        //This will always be zero as it should only have 1 measure
        var measureIndex = 0;
        //*******************************************************************
        data.forEach((element: any) => {
            totalValue = totalValue + element["value"];
            if (orderIndex < element["orderIndex"]) {
                orderIndex = element["orderIndex"];
            }
        });
        data2.value = totalValue;
        data2.orderIndex = orderIndex;
        data2.numberFormat = data[0]["numberFormat"];
        data2.isPillar = 1;
        data2.category = dataView.matrix.valueSources[0].displayName;
        data2.displayName = dataView.matrix.valueSources[0].displayName;

        var x = dataView.matrix.valueSources[measureIndex];
        data2.selectionId = this.host.createSelectionIdBuilder()
            .withMeasure(x.queryName ?? "")
            .createSelectionId();
        this.applyPerPointFormatting(data2, x.objects, true, false);

        data2.toolTipValue1Formatted = this.formatValueforLabels(data2);
        data2.toolTipDisplayValue1 = data2.category;
        data2.childrenCount = 1;
        data2.sortOrderIndex = 1;
        data2.sortOrderIndexforLimitBreakdown = 1;        
        return data2;
    }
    private getDataForCategory(value: number, numberFormat: string, displayName: string, displayID: string, isPillar: number, selectionId: ISelectionId | null, sortOrderIndex: number, childrenCount: number, toolTipDisplayValue1: string, toolTipDisplayValue2: string | null | undefined, Measure1Value: number | null | undefined, Measure2Value: number | null | undefined): BarChartDataPoint {

        var data2 = createBarChartDataPoint();
        data2.value = value;
        data2.numberFormat = numberFormat;
        data2.isPillar = isPillar;
        data2.category = displayID;
        data2.displayName = displayName;
        data2.selectionId = selectionId;
        data2.sortOrderIndex = sortOrderIndex;
        data2.sortOrderIndexforLimitBreakdown = sortOrderIndex;
        data2.childrenCount = childrenCount;
        data2.Measure1Value = Measure1Value;
        data2.Measure2Value = Measure2Value;
        data2.toolTipValue1Formatted = this.formatValueforvalues(Measure1Value, numberFormat);
        data2.toolTipValue2Formatted = this.formatValueforvalues(Measure2Value, numberFormat);
        data2.toolTipDisplayValue1 = toolTipDisplayValue1;
        data2.toolTipDisplayValue2 = toolTipDisplayValue2;
        data2.customBarColor = this.getfillColor(data2.isPillar, data2.value);
        data2.customFontColor = this.getLabelFontColor(data2.isPillar, data2.value);
        data2.customLabelPositioning = this.getLabelPosition(data2.isPillar, data2.value);
        return data2;
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
    // Resolve the effective format string for a single matrix value cell.
    // A DAX dynamic format string is delivered per cell on
    // `nodeValue.objects.general.formatString`; `valueSources[i].format` is only
    // the measure's static model format and is empty for a dynamic-format measure.
    // Requires the `general.formatString` object in capabilities.json and apiVersion >= 4.2.
    private resolveFormat(nodeValue: any, staticFormat: string | undefined): string {
        var dynamic = nodeValue
            && nodeValue.objects
            && nodeValue.objects.general
            && nodeValue.objects.general.formatString;
        return (typeof dynamic === "string" && dynamic.length > 0) ? dynamic : (staticFormat ?? "");
    }
    private formatValueforLabels(d: BarChartDataPoint) {
        return this.formatValueWithUnits(
            d.value,
            d.numberFormat,
            this.visualSettings.LabelsFormatting.valueFormat,
            this.visualSettings.LabelsFormatting.decimalPlaces);
    }
    private formatValueforvalues(value: any, numberFormat: any) {
        return this.formatValueWithUnits(
            value,
            numberFormat,
            this.visualSettings.LabelsFormatting.valueFormat,
            this.visualSettings.LabelsFormatting.decimalPlaces);
    }
    // Shared value formatter for data labels / tooltips.
    //  - `format` is the effective (dynamic or static) format string for the cell.
    //  - `precision` (the "Value decimal places" control) is passed on EVERY branch,
    //    including "None"; the old code omitted it there so decimals never applied.
    //    It is only forwarded when > 0, so 0 keeps the format string's own decimals
    //    (backward compatible) and a positive value overrides them.
    //  - The format string is kept on "Auto" too, so currency / dynamic-format symbols
    //    survive display-unit scaling. Percentage formats are never abbreviated.
    private pickDisplayUnit(testValue: number, option: string, isPercent: boolean): number {
        switch (option) {
            case "Auto":
                if (isPercent) {
                    return 0;
                } else if (testValue >= 1e9) {
                    return 1e9;
                } else if (testValue >= 1e6) {
                    return 1e6;
                } else if (testValue >= 1e3) {
                    return 1e3;
                }
                return 0;
            case "Thousands": return isPercent ? 0 : 1e3;
            case "Millions": return isPercent ? 0 : 1e6;
            case "Billions": return isPercent ? 0 : 1e9;
            default: return 0; // "None"
        }
    }

    private createFormatter(format: string | undefined, displayValue: number, precision: number) {
        return valueFormatter.create({
            cultureSelector: this.locale,
            format: format,
            value: displayValue,
            precision: precision > 0 ? precision : undefined
        });
    }

    private formatValueWithUnits(value: any, format: string, valueFormat: string, precision: number): string {
        var isPercent = typeof format === "string" && format.indexOf("%") >= 0;
        var displayValue = this.pickDisplayUnit(Math.abs(value), valueFormat, isPercent);
        return this.createFormatter(format, displayValue, precision).format(value);
    }

    private formatValueForYAxis(d: any) {
        var decimalPlaces = this.visualSettings.yAxisFormatting.decimalPlaces;
        var format = (this.barChartData && this.barChartData.length > 0) ? this.barChartData[0].numberFormat : undefined;
        var isPercent = typeof format === "string" && format.indexOf("%") >= 0;
        var range = Math.max(Math.abs(this.minValue), Math.abs(this.maxValue));
        var option = this.visualSettings.yAxisFormatting.YAxisValueFormatOption;
        var displayValue = this.pickDisplayUnit(range, option, isPercent);
        return this.createFormatter(format, displayValue, decimalPlaces).format(d);
    }
    private formatCategory(value: any, type: any, format: any) {
        let iValueFormatter_XAxis;
        iValueFormatter_XAxis = valueFormatter.create({ cultureSelector: this.locale, format: format });
        var formattedValue = value;
        if (value == null) {
            formattedValue = "(blank)";
        }
        if (type["dateTime"]) {
            var currDate = new Date(formattedValue);
            formattedValue = iValueFormatter_XAxis.format(currDate);
        }
        return formattedValue;
    }
}