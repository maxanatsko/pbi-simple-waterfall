import powerbi from "powerbi-visuals-api";
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataViewMatrixNode = powerbi.DataViewMatrixNode;
import ISelectionId = powerbi.visuals.ISelectionId;
import { DEFAULT_GREY } from "./settings";
import { RenderSettings } from "./renderSettings";
import { BarChartDataPoint, createBarChartDataPoint } from "./dataPoint";
import { ValueFormatter, resolveFormat } from "./valueFormatting";
import { requireMatrixDataView, findLowestLevels } from "./matrix";
import { SORT_EPSILON, SORT_EPSILON_MAX } from "./constants";

/** Stable ordering key: sort by group, then by position within the group.
 *  Replaces the old float-packed sortOrderIndex (precision loss with many nodes). */
const compareBySortKey = (a: BarChartDataPoint, b: BarChartDataPoint) =>
    (a.sortGroupIndex - b.sortGroupIndex) || (a.sortWithinGroupIndex - b.sortWithinGroupIndex);

/** Black or white, whichever is legible on top of `bg` (a #rgb / #rrggbb
 *  colour). Returns `fallback` when `bg` isn't a hex colour. */
function readableTextColor(bg: string, fallback: string): string {
    const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec((bg ?? "").trim());
    if (!m) return fallback;
    let hex = m[1];
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const channel = (i: number) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
    return luminance > 0.4 ? "#000000" : "#ffffff";
}

/** Everything the data converters read that is not the matrix itself. Built
 *  once per `update()` and handed to WaterfallDataBuilder. The matrix dataView
 *  is re-derived from `options` via requireMatrixDataView in each converter. */
export interface WaterfallDataContext {
    options: VisualUpdateOptions;
    host: IVisualHost;
    renderSettings: RenderSettings;
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
            barColor = this.ctx.renderSettings.sentimentColorTotal;
        } else {
            if (value < 0) {
                barColor = this.ctx.renderSettings.sentimentColorAdverse;
            } else {
                barColor = this.ctx.renderSettings.sentimentColorFavourable;
            }
        }
        return barColor;

    }
    private getLabelFontColor(isPillar: number, value: number) {
        if (this.ctx.isHighContrast) {
            return this.ctx.colorPalette.foreground.value;
        }
        if (this.ctx.renderSettings.labelsUseDefaultFontColor) {
            return this.ctx.renderSettings.labelsFontColor;
        } else {
            if (isPillar == 1) {
                return this.ctx.renderSettings.labelsSentimentFontColorTotal;
            } else if (value < 0) {
                return this.ctx.renderSettings.labelsSentimentFontColorAdverse;
            } else {
                return this.ctx.renderSettings.labelsSentimentFontColorFavourable;
            }
        }
    }
    private getLabelPosition(isPillar: number, value: number) {
        if (this.ctx.renderSettings.labelsUseDefaultPositioning) {
            return this.ctx.renderSettings.labelsPosition;
        } else {
            if (isPillar == 1) {
                return this.ctx.renderSettings.labelsPositionTotal;
            } else if (value < 0) {
                return this.ctx.renderSettings.labelsPositionAdverse;
            } else {
                return this.ctx.renderSettings.labelsPositionFavourable;
            }
        }

    }
    private applyPerPointFormatting(dataPoint: BarChartDataPoint, objects: any, gateFontColorOnSentiment: boolean = true, gateLabelPositioningOnSentiment: boolean = true) {
        if (objects) {
            if (objects.sentimentColor && !this.ctx.renderSettings.useSentimentFeatures) {
                dataPoint.customBarColor = (objects as any)["sentimentColor"]["fill"]["solid"]["color"];
            } else {
                dataPoint.customBarColor = this.getfillColor(dataPoint.isPillar, dataPoint.value);
            }

            const fontColorEnabled = gateFontColorOnSentiment
                ? !this.ctx.renderSettings.useSentimentFeatures
                : true;
            if (objects.LabelsFormatting && fontColorEnabled && !this.ctx.renderSettings.labelsUseDefaultFontColor) {
                if (objects.LabelsFormatting.fill) {
                    dataPoint.customFontColor = (objects as any)["LabelsFormatting"]["fill"]["solid"]["color"];
                } else {
                    dataPoint.customFontColor = this.getLabelFontColor(dataPoint.isPillar, dataPoint.value);
                }
            } else {
                dataPoint.customFontColor = this.getLabelFontColor(dataPoint.isPillar, dataPoint.value);
            }

            const labelPositionEnabled = gateLabelPositioningOnSentiment
                ? !this.ctx.renderSettings.useSentimentFeatures
                : true;
            if (objects.LabelsFormatting && labelPositionEnabled && !this.ctx.renderSettings.labelsUseDefaultPositioning) {
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
        this.applyInsideLabelContrast(dataPoint);
    }

    /** When labels sit inside the bar and follow the default font colour, swap
     *  the default grey for black/white so the value stays readable on the
     *  green / yellow / blue fill. */
    private applyInsideLabelContrast(dataPoint: BarChartDataPoint) {
        if (this.ctx.isHighContrast) return;
        if (!this.ctx.renderSettings.labelsUseDefaultFontColor) return;
        if (dataPoint.customLabelPositioning && dataPoint.customLabelPositioning.indexOf("Inside") === 0) {
            dataPoint.customFontColor = readableTextColor(dataPoint.customBarColor, dataPoint.customFontColor);
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
                if (this.ctx.renderSettings.labelsHideZeroBlankValues && Number(x.values![index].value) == 0) {
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
                    data2.sortGroupIndex = data2.sortOrderIndex;
                    data2.sortWithinGroupIndex = 0;
                    visualData.push(data2);
                }
            });
        }
        visualData = this.sortVisualData(visualData, false);
        return visualData;
    }
    private sortVisualData(visualData: BarChartDataPoint[], drillable: boolean) {
        visualData.sort((a: BarChartDataPoint, b: BarChartDataPoint) => {
            switch (this.ctx.renderSettings.sortData) {
                case 3:
                    if (a.sortGroupIndex === b.sortGroupIndex) {
                        return parseFloat(a.value.toString()) - parseFloat(b.value.toString());
                    }
                    return compareBySortKey(a, b);
                case 2:
                    if (a.sortGroupIndex === b.sortGroupIndex) {
                        return parseFloat(b.value.toString()) - parseFloat(a.value.toString());
                    }
                    return compareBySortKey(a, b);
                default:
                    return drillable ? compareBySortKey(a, b) : 0;
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
        var maxNodes = Math.max(...allMeasureValues.map(m => m.length)) + 2;
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
                    var HideZeroBlankValues: boolean = this.ctx.renderSettings.labelsHideZeroBlankValues;                    
                    if (HideZeroBlankValues && valueDifference == 0) {
                        // hidden: drop this zero/blank step
                    } else {
                        toolTipDisplayValue1 = dataView.matrix.valueSources[indexMeasures].displayName + allMeasureValues[indexMeasures][nodeItems].category.toString();
                        toolTipDisplayValue2 = dataView.matrix.valueSources[indexMeasures + 1].displayName + allMeasureValues[indexMeasures + 1][nodeItems].category.toString();

                        var displayName: string = allMeasureValues[indexMeasures][nodeItems].displayName;
                        var category: string = dataView.matrix.valueSources[indexMeasures].displayName + allMeasureValues[indexMeasures][nodeItems].category.toString();
                        var selectionId = allMeasureValues[indexMeasures][nodeItems].selectionId;
                        data2Category = this.getDataForCategory(valueDifference, (allMeasureValues[indexMeasures][nodeItems]["numberFormat"] || dataView.matrix.valueSources[indexMeasures].format), displayName, category, 0, selectionId, indexMeasures * maxNodes + (nodeItems + 1), 1, toolTipDisplayValue1, toolTipDisplayValue2, Measure1Value, Measure2Value);
                        data2Category.sortGroupIndex = indexMeasures * 2 + 1;
                        data2Category.sortWithinGroupIndex = nodeItems + 1;
                        visualData.push(data2Category);
                    }
                    
                }
            }            
            toolTipDisplayValue1 = dataView.matrix.valueSources[indexMeasures].displayName;
            toolTipDisplayValue2 = null;
            Measure1Value = totalValueofMeasure;
            Measure2Value = null;                        
            dataPillar = this.getDataForCategory(totalValueofMeasure, ((allMeasureValues[indexMeasures][0] && allMeasureValues[indexMeasures][0]["numberFormat"]) || dataView.matrix.valueSources[indexMeasures].format), dataView.matrix.valueSources[indexMeasures].displayName, dataView.matrix.valueSources[indexMeasures].displayName, 1, null, indexMeasures * 2, 1, toolTipDisplayValue1, toolTipDisplayValue2, Measure1Value, Measure2Value);
            dataPillar.sortGroupIndex = indexMeasures * 2;
            dataPillar.sortWithinGroupIndex = 0;
            visualData.push(dataPillar);
        }
        if (this.ctx.renderSettings.limitBreakdown) {
            visualData = this.limitBreakdownsteps(options, visualData);
        }
        // Sort the [visualData] in order of the display
        if (dataView.matrix.rows.levels.length === 1) {
            this.sortVisualData(visualData, true);
        } else {
            visualData.sort((a: any, b: any) => {
                return compareBySortKey(a, b);
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
                    // pillars and the first node keep the full parent-level label
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
            if (this.ctx.renderSettings.labelsHideZeroBlankValues && Number(x.values![measureIndex].value) == 0) {
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
                    sortOrderIndex = sortOrderIndex + 1
                } else {
                    sortOrderIndex = sortOrderIndex + + SORT_EPSILON;
                    data2.sortOrderIndex = sortOrderIndex ;
                }
                data2.sortGroupIndex = Math.round(data2.sortOrderIndex);
                data2.sortWithinGroupIndex = orderIndex;
                orderIndex++;
                data2.orderIndex = orderIndex;
                visualData.push(data2);
            }
        });
        if (!hasPillar && this.ctx.renderSettings.showTotalPillar) {
            visualData.push(this.addTotalLine(visualData, options));
        }
        if (this.ctx.renderSettings.limitBreakdown) {
            visualData = this.limitBreakdownsteps(options,visualData);
        }
        visualData = this.sortVisualData(visualData, false);
        return visualData;
    }
    private limitBreakdownsteps(options: VisualUpdateOptions, currData: any) {
        //var currData = []
        //currData = this.getDataStaticCategoryWaterfall(options);
        currData.sort((a: any, b: any) => {
            if (a.sortGroupIndex === b.sortGroupIndex && a.isPillar != 1) {
                return parseFloat(Math.abs(b.value).toString()) - parseFloat(Math.abs(a.value).toString());
            } else {
                return compareBySortKey(a, b);
            }
        });
        var limit = this.ctx.renderSettings.maxBreakdown;
        var limitcounter = 0;
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
                    newOther.push(this.addOtherBreakdownStep(options, otherTotalValue, othersortOrderIndex));
                }
                otherTotalValue = 0
                othersortOrderIndex = 0;

            } else if (limitcounter < limit) {
                limitcounter++;
                currData[index]["showbreakdownstep"] = true;
            }
            else if (
                (index != currData.length - 1 && currData[index].sortGroupIndex === currData[index + 1].sortGroupIndex && limitcounter < limit)
                || (index != 0 && currData[index].sortGroupIndex === currData[index - 1].sortGroupIndex && limitcounter < limit)
            ) {
                limitcounter++;
                currData[index]["showbreakdownstep"] = true;
            } else {
                currData[index]["showbreakdownstep"] = false;
                otherTotalValue = otherTotalValue + currData[index].value;
                othersortOrderIndex = currData[index].sortGroupIndex;
            }
        }

        newOther.forEach(node => {
            currData.push(node);
        });

        for (let index = 0; index < currData.length; index++) {
            if (currData[index].showbreakdownstep == false) {
                currData.splice(index, 1);
                index--;
            }

        }
        currData.sort((a: any, b: any) => {
            return compareBySortKey(a, b);
        });

        

        return currData;
    }
    private addOtherBreakdownStep(options: VisualUpdateOptions, value: any, sortOrderIndex: any) {
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
        data2.customBarColor = this.ctx.renderSettings.sentimentColorOther;
        if (this.ctx.renderSettings.labelsUseDefaultFontColor) {
            data2.customFontColor = this.ctx.renderSettings.labelsFontColor
        } else {
            data2.customFontColor = this.ctx.renderSettings.labelsSentimentFontColorOther;
        }
        if (this.ctx.renderSettings.labelsUseDefaultPositioning) {
            data2.customLabelPositioning = this.ctx.renderSettings.labelsPosition
        } else {
            data2.customLabelPositioning = this.ctx.renderSettings.labelsPositionOther;
        }
        data2.isPillar = 0;
        data2.toolTipValue1Formatted = this.ctx.formatter.label(data2);
        data2.toolTipDisplayValue1 = data2.category;
        data2.childrenCount = 1;
        data2.sortOrderIndex = sortOrderIndex + SORT_EPSILON_MAX;
        data2.sortGroupIndex = sortOrderIndex;
        // Last within the group, but still ahead of the total pillar
        // (Number.MAX_SAFE_INTEGER): "Other" is a breakdown step and must land
        // before the total, not floating on top of it.
        data2.sortWithinGroupIndex = Number.MAX_SAFE_INTEGER - 1;
        data2.showbreakdownstep = true;
        this.applyInsideLabelContrast(data2);
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
            var HideZeroBlankValues: boolean = this.ctx.renderSettings.labelsHideZeroBlankValues;
            if (HideZeroBlankValues && valueDifference == 0) {

                // hidden: drop this zero/blank step

            } else {

                toolTipDisplayValue1 = dataView.matrix.valueSources[indexMeasures].displayName + allMeasureValues[indexMeasures][nodeItems].category.toString();
                var displayName: string = allMeasureValues[indexMeasures][nodeItems].displayName;
                var category: string = dataView.matrix.valueSources[indexMeasures].displayName + allMeasureValues[indexMeasures][nodeItems].category.toString();
                var selectionId = allMeasureValues[indexMeasures][nodeItems].selectionId;
                data2Category = this.getDataForCategory(valueDifference, (allMeasureValues[indexMeasures][nodeItems]["numberFormat"] || dataView.matrix.valueSources[indexMeasures].format), displayName, category, 0, selectionId, 1, 1, toolTipDisplayValue1, null, Measure1Value, null);
                data2Category.sortGroupIndex = 0;
                data2Category.sortWithinGroupIndex = nodeItems + 1;
                visualData.push(data2Category);
            }

        }
        if (this.ctx.renderSettings.showTotalPillar) {
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
                    // pillars and the first node keep the full parent-level label
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
        data2.sortGroupIndex = 0;
        data2.sortWithinGroupIndex = Number.MAX_SAFE_INTEGER;
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
        this.applyInsideLabelContrast(data2);
        return data2;
    }
}
