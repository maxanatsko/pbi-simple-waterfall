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
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import * as d3 from "d3";
import { VisualSettings, VisualFormattingSettingsModel } from "./settings";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { BarChartDataPoint } from "./dataPoint";
import { ValueFormatter, gridlineStrokeWidth } from "./valueFormatting";
import { requireMatrixDataView } from "./matrix";
import { WaterfallDataBuilder } from "./waterfallData";
import { BarInteractions } from "./interactions";
import { ChartRenderer } from "./chartRenderer";

/** Best-effort message extraction from an unknown thrown value. */
function toErrorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

export class Visual implements IVisual {

    private mainContainer: d3.Selection<any, any, any, any>;
    private legendContainer: d3.Selection<any, any, any, any>;
    private chartContainer: d3.Selection<any, any, any, any>;
    private visualSettings!: VisualSettings;
    private formattingSettingsService: FormattingSettingsService;
    private barChartData!: BarChartDataPoint[];
    private legendHeight = 0;
    private host: IVisualHost;
    private selectionIdBuilder: ISelectionIdBuilder;
    private selectionManager: ISelectionManager;
    private tooltipServiceWrapper: ITooltipServiceWrapper;
    private visualType!: string;
    private visualUpdateOptions!: VisualUpdateOptions;
    private scrollbarBreath = 8;
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

        this.interactions.configure({ allowInteractions: true, isHighContrast: this.isHighContrast });
        new ChartRenderer({
            chartContainer: this.chartContainer,
            orientationName: this.visualSettings.chartOrientation.orientation == "Horizontal" ? "Horizontal" : "Vertical",
            settings: this.visualSettings,
            barChartData: this.barChartData,
            allData,
            dataView,
            host: this.host,
            formatter: this.formatter,
            interactions: this.interactions,
            tooltipServiceWrapper: this.tooltipServiceWrapper,
            isHighContrast: this.isHighContrast,
            colorPalette: this.colorPalette,
            visualType: this.visualType,
            width: options.viewport.width,
            height: options.viewport.height - this.legendHeight,
            legendHeight: this.legendHeight,
            scrollbarBreath: this.scrollbarBreath,
        }).render();

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
}