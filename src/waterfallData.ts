import powerbi from "powerbi-visuals-api";
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;
import DataViewMatrix = powerbi.DataViewMatrix;
import DataViewMatrixNode = powerbi.DataViewMatrixNode;
import ISelectionId = powerbi.visuals.ISelectionId;
import { VisualSettings, DEFAULT_GREY } from "./settings";
import { BarChartDataPoint, createBarChartDataPoint } from "./dataPoint";
import { ValueFormatter, resolveFormat } from "./valueFormatting";
import { requireMatrixDataView, findLowestLevels } from "./matrix";

/** Everything the data converters read that is not the matrix itself. Built
 *  once per `update()` and handed to WaterfallDataBuilder. */
export interface WaterfallDataContext {
    options: VisualUpdateOptions;
    dataView: DataView & { matrix: DataViewMatrix };
    host: IVisualHost;
    settings: VisualSettings;
    isHighContrast: boolean;
    colorPalette: powerbi.extensibility.ISandboxExtendedColorPalette;
    formatter: ValueFormatter;
}

/** Turns the matrix dataView into `BarChartDataPoint` rows for one of the four
 *  visual shapes. One instance per render; `build*()` picks the shape. */
export class WaterfallDataBuilder {
    constructor(private readonly ctx: WaterfallDataContext) {}

    private getfillColor(isPillar: number, value: number) {
        var barColor: string = DEFAULT_GREY;
        if (this.ctx.isHighContrast) {
            return this.ctx.colorPalette.background.value;
        }
        if (isPillar == 1) {
            barColor = this.ctx.settings.sentimentColor.sentimentColorTotal;
        } else {
            if (value < 0) {
                barColor = this.ctx.settings.sentimentColor.sentimentColorAdverse;
            } else {
                barColor = this.ctx.settings.sentimentColor.sentimentColorFavourable;
            }
        }
        return barColor;

    }
    private getLabelFontColor(isPillar: number, value: number) {
        if (this.ctx.isHighContrast) {
            return this.ctx.colorPalette.foreground.value;
        }
        if (this.ctx.settings.LabelsFormatting.useDefaultFontColor) {
            return this.ctx.settings.LabelsFormatting.fontColor;
        } else {
            if (isPillar == 1) {
                return this.ctx.settings.LabelsFormatting.sentimentFontColorTotal;
            } else if (value < 0) {
                return this.ctx.settings.LabelsFormatting.sentimentFontColorAdverse;
            } else {
                return this.ctx.settings.LabelsFormatting.sentimentFontColorFavourable;
            }
        }
    }
    private getLabelPosition(isPillar: number, value: number) {
        if (this.ctx.settings.LabelsFormatting.useDefaultLabelPositioning) {
            return this.ctx.settings.LabelsFormatting.labelPosition;
        } else {
            if (isPillar == 1) {
                return this.ctx.settings.LabelsFormatting.labelPositionTotal;
            } else if (value < 0) {
                return this.ctx.settings.LabelsFormatting.labelPositionAdverse;
            } else {
                return this.ctx.settings.LabelsFormatting.labelPositionFavourable;
            }
        }

    }
    private applyPerPointFormatting(dataPoint: BarChartDataPoint, objects: any, gateFontColorOnSentiment: boolean = true, gateLabelPositioningOnSentiment: boolean = true) {
        if (objects) {
            if (objects.sentimentColor && !this.ctx.settings.chartOrientation.useSentimentFeatures) {
                dataPoint.customBarColor = (objects as any)["sentimentColor"]["fill"]["solid"]["color"];
            } else {
                dataPoint.customBarColor = this.getfillColor(dataPoint.isPillar, dataPoint.value);
            }

            const fontColorEnabled = gateFontColorOnSentiment
                ? !this.ctx.settings.chartOrientation.useSentimentFeatures
                : true;
            if (objects.LabelsFormatting && fontColorEnabled && !this.ctx.settings.LabelsFormatting.useDefaultFontColor) {
                if (objects.LabelsFormatting.fill) {
                    dataPoint.customFontColor = (objects as any)["LabelsFormatting"]["fill"]["solid"]["color"];
                } else {
                    dataPoint.customFontColor = this.getLabelFontColor(dataPoint.isPillar, dataPoint.value);
                }
            } else {
                dataPoint.customFontColor = this.getLabelFontColor(dataPoint.isPillar, dataPoint.value);
            }

            const labelPositionEnabled = gateLabelPositioningOnSentiment
                ? !this.ctx.settings.chartOrientation.useSentimentFeatures
                : true;
            if (objects.LabelsFormatting && labelPositionEnabled && !this.ctx.settings.LabelsFormatting.useDefaultLabelPositioning) {
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
    public buildStatic() {
        const options = this.ctx.options;
        const dataView = requireMatrixDataView(options);

        var visualData: BarChartDataPoint[] = [];
        var sortOrderIndex = 0;
        for (let index = 0; index < dataView.matrix.columns.root.children!.length; index++) {
            dataView.matrix.rows.root.children!.forEach((x: DataViewMatrixNode) => {
                var checkforZero = false;
                if (this.ctx.settings.LabelsFormatting.HideZeroBlankValues && Number(x.values![index].value) == 0) {
                    checkforZero = true;
                }
                if (checkforZero == false) {
                    var data2 = createBarChartDataPoint();
                    data2.value = Number(x.values![index].value);
                    data2.numberFormat = resolveFormat(x.values![index], dataView.matrix.valueSources[index].format);
                    data2.selectionId = this.ctx.host.createSelectionIdBuilder()
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
                    data2.toolTipValue1Formatted = this.ctx.formatter.label(data2);
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
            switch (this.ctx.settings.chartOrientation.sortData) {
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

    public buildDrillable() {
        const options = this.ctx.options;
        const dataView = requireMatrixDataView(options);
        var totalData: BarChartDataPoint[][] = [];
        var visualData: BarChartDataPoint[] = [];
        var allMeasureValues: any[] = [];
        // find all values and aggregate them in an array of array with each child in an array of a measure
        allMeasureValues = findLowestLevels(dataView, this.ctx.host, this.ctx.formatter);
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
                    var HideZeroBlankValues: boolean = this.ctx.settings.LabelsFormatting.HideZeroBlankValues;                    
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
        if (this.ctx.settings.chartOrientation.limitBreakdown) {
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

    public buildStaticCategory() {
        const options = this.ctx.options;
        const dataView = requireMatrixDataView(options);

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
            if (this.ctx.settings.LabelsFormatting.HideZeroBlankValues && Number(x.values![measureIndex].value) == 0) {
                checkforZero = true;
            }
            if (checkforZero == false) {
                var data2 = createBarChartDataPoint();

                data2.value = Number(x.values![measureIndex].value);

                data2.numberFormat = resolveFormat(x.values![measureIndex], dataView.matrix.valueSources[measureIndex].format);
                data2.selectionId = this.ctx.host.createSelectionIdBuilder()
                    .withMatrixNode(x, dataView.matrix.rows.levels)
                    .createSelectionId();
                data2.xAxisFormat = dataView.matrix.rows.levels[0].sources[0].format;
                data2.type = dataView.matrix.rows.levels[0].sources[0].type;
                data2.category = this.ctx.formatter.category(x.value, data2.type, data2.xAxisFormat);
                data2.displayName = this.ctx.formatter.category(x.value, data2.type, data2.xAxisFormat);
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
                data2.toolTipValue1Formatted = this.ctx.formatter.label(data2);
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
        if (!hasPillar && this.ctx.settings.definePillars.Totalpillar) {
            visualData.push(this.addTotalLine(visualData, options));
        }
        if (this.ctx.settings.chartOrientation.limitBreakdown) {
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
        var limit = this.ctx.settings.chartOrientation.maxBreakdown;
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
        const dataView = requireMatrixDataView(options);
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
        data2.customBarColor = this.ctx.settings.sentimentColor.sentimentColorOther;
        if (this.ctx.settings.LabelsFormatting.useDefaultFontColor) {
            data2.customFontColor = this.ctx.settings.LabelsFormatting.fontColor
        } else {
            data2.customFontColor = this.ctx.settings.LabelsFormatting.sentimentFontColorOther;
        }
        if (this.ctx.settings.LabelsFormatting.useDefaultLabelPositioning) {
            data2.customLabelPositioning = this.ctx.settings.LabelsFormatting.labelPosition
        } else {
            data2.customLabelPositioning = this.ctx.settings.LabelsFormatting.labelPositionOther;
        }
        data2.isPillar = 0;
        data2.toolTipValue1Formatted = this.ctx.formatter.label(data2);
        data2.toolTipDisplayValue1 = data2.category;
        data2.childrenCount = 1;
        data2.sortOrderIndex = sortOrderIndex + 0.999999;
        data2.sortOrderIndexforLimitBreakdown = sortOrderIndexforLimitBreakdown + 0.999999;        
        data2.showbreakdownstep = true;
        return data2;

    }
    public buildDrillableCategory() {
        const options = this.ctx.options;

        const dataView = requireMatrixDataView(options);
        var totalData: BarChartDataPoint[][] = [];
        var visualData: BarChartDataPoint[] = [];
        var allMeasureValues: any[] = [];

        // find all values and aggregate them in an array of array with each child in an array of a measure        
        allMeasureValues = findLowestLevels(dataView, this.ctx.host, this.ctx.formatter);
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
            var HideZeroBlankValues: boolean = this.ctx.settings.LabelsFormatting.HideZeroBlankValues;
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
        if (this.ctx.settings.definePillars.Totalpillar) {
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
    private addTotalLine(data: any, options: VisualUpdateOptions) {
        const dataView = requireMatrixDataView(options);
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
        data2.selectionId = this.ctx.host.createSelectionIdBuilder()
            .withMeasure(x.queryName ?? "")
            .createSelectionId();
        this.applyPerPointFormatting(data2, x.objects, true, false);

        data2.toolTipValue1Formatted = this.ctx.formatter.label(data2);
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
        data2.toolTipValue1Formatted = this.ctx.formatter.value(Measure1Value, numberFormat);
        data2.toolTipValue2Formatted = this.ctx.formatter.value(Measure2Value, numberFormat);
        data2.toolTipDisplayValue1 = toolTipDisplayValue1;
        data2.toolTipDisplayValue2 = toolTipDisplayValue2;
        data2.customBarColor = this.getfillColor(data2.isPillar, data2.value);
        data2.customFontColor = this.getLabelFontColor(data2.isPillar, data2.value);
        data2.customLabelPositioning = this.getLabelPosition(data2.isPillar, data2.value);
        return data2;
    }
}
