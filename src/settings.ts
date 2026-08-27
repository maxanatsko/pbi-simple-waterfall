/*
 *  Power BI Visualizations
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

import powerbi from "powerbi-visuals-api";
import { dataViewObjectsParser, dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import DataViewObjectsParser = dataViewObjectsParser.DataViewObjectsParser;
import DataView = powerbi.DataView;
import VisualEnumerationInstanceKinds = powerbi.VisualEnumerationInstanceKinds;

/* ============================================================================
 * Legacy read model
 * ---------------------------------------------------------------------------
 * The renderer in visual.ts reads settings through this DataViewObjectsParser
 * model (~120 call sites). It is kept as the single read path; the formatting
 * pane is produced separately by VisualFormattingSettingsModel below. Both read
 * the same dataView.metadata.objects, so values stay in sync.
 * ==========================================================================*/

export class VisualSettings extends DataViewObjectsParser {
  public chartOrientation: chartOrientation = new chartOrientation();
  public sentimentColor: sentimentColor = new sentimentColor();
  public margins: margins = new margins();
  public definePillars: definePillars = new definePillars();
  public xAxisFormatting: xAxisFormatting = new xAxisFormatting();
  public yAxisFormatting: yAxisFormatting = new yAxisFormatting();
  public LabelsFormatting: LabelsFormatting = new LabelsFormatting();
  public Legend: Legend = new Legend();

}
export class chartOrientation {
  public orientation: string = "Vertical";
  public useSentimentFeatures: boolean = true;
  public sortData: number = 1;
  public limitBreakdown: boolean = false;
  public maxBreakdown: number = 5;

}
export class definePillars {
  public Totalpillar: boolean = true;

}
export class Legend {
  public show: boolean = false;
  public fontSize: number = 9;
  public fontColor: string = "#777777";
  public fontFamily: string = "\"Segoe UI\", wf_segoe-ui_normal, helvetica, arial, sans-serif";
  public textFavourable: string = "Favourable";
  public textAdverse: string = "Adverse";
}
export class sentimentColor {
  public sentimentColorTotal: string = "#0000ff";
  public sentimentColorFavourable: string = "#00b050";
  public sentimentColorAdverse: string = "#ff0000";
  public sentimentColorOther: string = "#F2C811";
}
export class margins {
  public topMargin: number = 0;
  public leftMargin: number = 0;
  public rightMargin: number = 0;
  public bottomMargin: number = 0;

}

export class xAxisFormatting {
  public fontSize: number = 9;
  public fontColor: string = "#777777";
  public fontFamily: string = "\"Segoe UI\", wf_segoe-ui_normal, helvetica, arial, sans-serif";
  public labelWrapText: boolean = true;
  public fitToWidth: boolean = true;
  public barWidth: number = 50;
  public padding: number = 5;
  public showGridLine: boolean = true;
  public gridLineStrokeWidth: number = 5;
  public gridLineColor: string = "#777777";
}
export class yAxisFormatting {
  public show: boolean = true;
  public YAxisDataPointOption: string = "Auto";
  public YAxisDataPointRangeStart: number = 0;
  public YAxisDataPointRangeEnd: number = 0;
  public showYAxisValues: boolean = true;
  public fontSize: number = 9;
  public fontColor: string = "#777777";
  public fontFamily: string = "\"Segoe UI\", wf_segoe-ui_normal, helvetica, arial, sans-serif";
  public YAxisValueFormatOption: string = "Auto";
  public showGridLine: boolean = true;

  public gridLineStrokeWidth: number = 1;
  public gridLineColor: string = "#777777";
  public showZeroAxisGridLine: boolean = false;
  public zeroLineStrokeWidth: number = 1;
  public zeroLineColor: string = "#777777";
  public joinBars: boolean = false;
  public joinBarsStrokeWidth: number = 1;
  public joinBarsColor: string = "#777777";
  public decimalPlaces: number = 0;

}
export class LabelsFormatting {
  public show: boolean = true;
  public fontSize: number = 9;
  public useDefaultFontColor: boolean = true;
  public fontColor: string = "#777777";
  public sentimentFontColorTotal: string = "#777777";
  public sentimentFontColorFavourable: string = "#777777";
  public sentimentFontColorAdverse: string = "#777777";
  public sentimentFontColorOther: string = "#777777";
  public fontFamily: string = "\"Segoe UI\", wf_segoe-ui_normal, helvetica, arial, sans-serif";
  public valueFormat: string = "Auto";
  public useDefaultLabelPositioning: boolean = true;
  public labelPosition: string = "Outside end";
  public labelPositionTotal: string = "Outside end";
  public labelPositionFavourable: string = "Outside end";
  public labelPositionAdverse: string = "Outside end";
  public labelPositionOther: string = "Outside end";
  public HideZeroBlankValues: boolean = false;
  public decimalPlaces: number = 0;
}


/* ============================================================================
 * Formatting pane model (getFormattingModel)
 * ---------------------------------------------------------------------------
 * Replaces the legacy enumerateObjectInstances / enumerateObjects.ts path.
 * Cards mirror the capabilities.json objects. Conditional visibility and the
 * per-datapoint dynamic slices are applied in applyState(), called from
 * Visual.getFormattingModel() once barChartData / visualType are known.
 * ==========================================================================*/

const FONT_FAMILY_DEFAULT = "\"Segoe UI\", wf_segoe-ui_normal, helvetica, arial, sans-serif";

const LABEL_POSITION_ITEMS: powerbi.IEnumMember[] = [
  { value: "Inside end", displayName: "Inside end" },
  { value: "Outside end", displayName: "Outside end" },
  { value: "Inside center", displayName: "Inside center" },
  { value: "Inside base", displayName: "Inside base" },
  { value: "Outside top", displayName: "Always top/right" },
  { value: "Inside bottom", displayName: "Always bottom/left" },
];

const VALUE_FORMAT_ITEMS: powerbi.IEnumMember[] = [
  { value: "None", displayName: "None" },
  { value: "Auto", displayName: "Auto" },
  { value: "Thousands", displayName: "Thousands" },
  { value: "Millions", displayName: "Millions" },
  { value: "Billions", displayName: "Billions" },
];

function num(name: string, displayName: string, value: number, min?: number, max?: number): formattingSettings.NumUpDown {
  const slice = new formattingSettings.NumUpDown({ name, displayName, value });
  if (min !== undefined || max !== undefined) {
    slice.options = {
      minValue: min !== undefined ? { type: powerbi.visuals.ValidatorType.Min, value: min } : undefined,
      maxValue: max !== undefined ? { type: powerbi.visuals.ValidatorType.Max, value: max } : undefined,
    };
  }
  return slice;
}

function toggle(name: string, displayName: string, value: boolean): formattingSettings.ToggleSwitch {
  return new formattingSettings.ToggleSwitch({ name, displayName, value });
}

function color(name: string, displayName: string, value: string): formattingSettings.ColorPicker {
  return new formattingSettings.ColorPicker({ name, displayName, value: { value } });
}

function text(name: string, displayName: string, value: string): formattingSettings.TextInput {
  return new formattingSettings.TextInput({ name, displayName, value, placeholder: "" });
}

function dropdown(name: string, displayName: string, value: string, items: powerbi.IEnumMember[]): formattingSettings.ItemDropdown {
  return new formattingSettings.ItemDropdown({
    name,
    displayName,
    items,
    value: items.filter(i => i.value === value)[0] ?? items[0],
  });
}

function fontControl(objectName: string, fontSize: number): formattingSettings.FontControl {
  return new formattingSettings.FontControl({
    name: "font",
    displayName: "Font",
    fontFamily: new formattingSettings.FontPicker({ name: "fontFamily", displayName: "Font Family", value: FONT_FAMILY_DEFAULT }),
    fontSize: num("fontSize", "Font Size", fontSize, 8, 60),
  });
}

class ChartOrientationCard extends formattingSettings.SimpleCard {
  name = "chartOrientation";
  displayName = "Chart Options";

  orientation = dropdown("orientation", "Orientation", "Vertical", [
    { value: "Vertical", displayName: "Vertical" },
    { value: "Horizontal", displayName: "Horizontal" },
  ]);
  useSentimentFeatures = toggle("useSentimentFeatures", "Format using Sentiments", true);
  sortData = dropdown("sortData", "Sort Data", "1", [
    { value: "1", displayName: "Default" },
    { value: "3", displayName: "Ascending" },
    { value: "2", displayName: "Descending" },
  ]);
  limitBreakdown = toggle("limitBreakdown", "Limit Steps", false);
  maxBreakdown = num("maxBreakdown", "Max Steps", 5, 1, 100);

  slices = [this.orientation, this.useSentimentFeatures, this.sortData, this.limitBreakdown, this.maxBreakdown];
}

class DefinePillarsCard extends formattingSettings.SimpleCard {
  name = "definePillars";
  displayName = "Define Pillars";

  Totalpillar = toggle("Totalpillar", "Show Cumulative Total", true);

  slices = [this.Totalpillar];
}

class SentimentColorCard extends formattingSettings.SimpleCard {
  name = "sentimentColor";
  displayName = "Bar Color";

  sentimentColorTotal = color("sentimentColorTotal", "Total", "#0000ff");
  sentimentColorFavourable = color("sentimentColorFavourable", "Favourable", "#00b050");
  sentimentColorAdverse = color("sentimentColorAdverse", "Adverse", "#ff0000");
  sentimentColorOther = color("sentimentColorOther", "Other", "#F2C811");

  slices = [this.sentimentColorTotal, this.sentimentColorFavourable, this.sentimentColorAdverse, this.sentimentColorOther];
}

class MarginsCard extends formattingSettings.SimpleCard {
  name = "margins";
  displayName = "Margins";

  topMargin = num("topMargin", "Top Margin", 0, 0, 100);
  bottomMargin = num("bottomMargin", "Bottom Margin", 0, 0, 100);
  leftMargin = num("leftMargin", "Left Margin", 0, 0, 100);
  rightMargin = num("rightMargin", "Right Margin", 0, 0, 100);

  slices = [this.topMargin, this.bottomMargin, this.leftMargin, this.rightMargin];
}

class LegendCard extends formattingSettings.SimpleCard {
  name = "Legend";
  displayName = "Legend";

  show = toggle("show", "Legend Show / Hide", false);
  textFavourable = text("textFavourable", "Sentiment - Favourable", "Favourable");
  textAdverse = text("textAdverse", "Sentiment - Adverse", "Adverse");
  font = fontControl("Legend", 9);
  fontColor = color("fontColor", "Font Color", "#777777");

  slices = [this.show, this.textFavourable, this.textAdverse, this.font, this.fontColor];
}

class XAxisCard extends formattingSettings.SimpleCard {
  name = "xAxisFormatting";
  displayName = "X-Axis";

  font = fontControl("xAxisFormatting", 9);
  fontColor = color("fontColor", "Font Color", "#777777");
  fitToWidth = toggle("fitToWidth", "Fit to width", true);
  labelWrapText = toggle("labelWrapText", "Wrap text", true);
  barWidth = num("barWidth", "Minimum Bar Width", 50, 10, 100);
  padding = num("padding", "Padding", 5, 0, 20);
  showGridLine = toggle("showGridLine", "Show / Hide Gridlines", true);
  gridLineStrokeWidth = num("gridLineStrokeWidth", "Stroke Width", 5, 1, 50);
  gridLineColor = color("gridLineColor", "Gridlines Color", "#777777");

  slices = [this.font, this.fontColor, this.fitToWidth, this.labelWrapText, this.barWidth,
    this.padding, this.showGridLine, this.gridLineStrokeWidth, this.gridLineColor];
}

class YAxisCard extends formattingSettings.SimpleCard {
  name = "yAxisFormatting";
  displayName = "Y-Axis";

  show = toggle("show", "Y-Axis Show/Hide", true);
  YAxisDataPointOption = dropdown("YAxisDataPointOption", "Starting Point", "Auto", [
    { value: "Auto", displayName: "Auto" },
    { value: "Zero", displayName: "Zero" },
  ]);
  showYAxisValues = toggle("showYAxisValues", "Show / Hide Values", true);
  font = fontControl("yAxisFormatting", 9);
  fontColor = color("fontColor", "Font Color", "#777777");
  YAxisValueFormatOption = dropdown("YAxisValueFormatOption", "Display Units", "Auto", VALUE_FORMAT_ITEMS);
  decimalPlaces = num("decimalPlaces", "Value decimal places", 0, 0, 15);
  showGridLine = toggle("showGridLine", "Show / Hide Gridlines", true);
  gridLineStrokeWidth = num("gridLineStrokeWidth", "Stroke Width", 1, 1, 50);
  gridLineColor = color("gridLineColor", "Gridlines Color", "#777777");
  showZeroAxisGridLine = toggle("showZeroAxisGridLine", "Show Zero Line", false);
  zeroLineStrokeWidth = num("zeroLineStrokeWidth", "Zero Line Width", 1, 1, 50);
  zeroLineColor = color("zeroLineColor", "Zero Line Color", "#777777");
  joinBars = toggle("joinBars", "Join Bars", false);
  joinBarsStrokeWidth = num("joinBarsStrokeWidth", "Join Bar - Stroke Width", 1, 1, 50);
  joinBarsColor = color("joinBarsColor", "Join Bar - Color", "#777777");

  slices = [this.show, this.YAxisDataPointOption, this.showYAxisValues, this.font, this.fontColor,
    this.YAxisValueFormatOption, this.decimalPlaces, this.showGridLine, this.gridLineStrokeWidth,
    this.gridLineColor, this.showZeroAxisGridLine, this.zeroLineStrokeWidth, this.zeroLineColor,
    this.joinBars, this.joinBarsStrokeWidth, this.joinBarsColor];
}

class LabelsCard extends formattingSettings.SimpleCard {
  name = "LabelsFormatting";
  displayName = "Labels";

  show = toggle("show", "Show Labels", true);
  topLevelSlice = this.show;

  font = fontControl("LabelsFormatting", 9);
  useDefaultFontColor = toggle("useDefaultFontColor", "Use Default Font Color", true);
  fontColor = color("fontColor", "Default Font Color", "#777777");
  sentimentFontColorTotal = color("sentimentFontColorTotal", "Total", "#777777");
  sentimentFontColorFavourable = color("sentimentFontColorFavourable", "Favourable", "#777777");
  sentimentFontColorAdverse = color("sentimentFontColorAdverse", "Adverse", "#777777");
  sentimentFontColorOther = color("sentimentFontColorOther", "Other", "#777777");
  useDefaultLabelPositioning = toggle("useDefaultLabelPositioning", "Use Default Label Positioning", true);
  labelPosition = dropdown("labelPosition", "Label Position", "Outside end", LABEL_POSITION_ITEMS);
  labelPositionTotal = dropdown("labelPositionTotal", "Total", "Outside end", LABEL_POSITION_ITEMS);
  labelPositionFavourable = dropdown("labelPositionFavourable", "Favourable", "Outside end", LABEL_POSITION_ITEMS);
  labelPositionAdverse = dropdown("labelPositionAdverse", "Adverse", "Outside end", LABEL_POSITION_ITEMS);
  labelPositionOther = dropdown("labelPositionOther", "Other", "Outside end", LABEL_POSITION_ITEMS);
  valueFormat = dropdown("valueFormat", "Display Units", "Auto", VALUE_FORMAT_ITEMS);
  decimalPlaces = num("decimalPlaces", "Value decimal places", 0, 0, 15);
  HideZeroBlankValues = toggle("HideZeroBlankValues", "Hide Zero / Blank values", false);

  slices = [this.font, this.useDefaultFontColor, this.fontColor, this.sentimentFontColorTotal,
    this.sentimentFontColorFavourable, this.sentimentFontColorAdverse, this.sentimentFontColorOther,
    this.useDefaultLabelPositioning, this.labelPosition, this.labelPositionTotal, this.labelPositionFavourable,
    this.labelPositionAdverse, this.labelPositionOther, this.valueFormat, this.decimalPlaces, this.HideZeroBlankValues];
}

function fillSlice(displayName: string, value: string, selectionId: powerbi.visuals.ISelectionId): formattingSettings.ColorPicker {
  const slice = new formattingSettings.ColorPicker({ name: "fill", displayName, value: { value } });
  // 0 === DataViewWildcardMatchingOption.InstancesAndTotals (const enum; also the util's own default)
  slice.selector = dataViewWildcard.createDataViewWildcardSelector(0);
  slice.altConstantSelector = selectionId.getSelector();
  slice.instanceKind = VisualEnumerationInstanceKinds.ConstantOrRule;
  return slice;
}

export class VisualFormattingSettingsModel extends formattingSettings.Model {
  chartOrientation = new ChartOrientationCard();
  definePillars = new DefinePillarsCard();
  sentimentColor = new SentimentColorCard();
  margins = new MarginsCard();
  Legend = new LegendCard();
  xAxisFormatting = new XAxisCard();
  yAxisFormatting = new YAxisCard();
  LabelsFormatting = new LabelsCard();

  cards = [
    this.chartOrientation,
    this.definePillars,
    this.sentimentColor,
    this.margins,
    this.Legend,
    this.xAxisFormatting,
    this.yAxisFormatting,
    this.LabelsFormatting,
  ];

  /**
   * Apply the conditional visibility and per-datapoint dynamic slices that the
   * legacy enumerateObjects.ts produced. Called from Visual.getFormattingModel()
   * after visualType / barChartData are known.
   */
  public applyState(
    visualType: string,
    settings: VisualSettings,
    barChartData: any[],
    dataView: DataView,
    defaultXAxisGridlineStrokeWidth: number,
    defaultYAxisGridlineStrokeWidth: number
  ): void {
    const isStatic = visualType === "static";
    const isStaticCategory = visualType === "staticCategory";
    const isStaticLike = isStatic || isStaticCategory;
    const singleLevel = dataView?.matrix?.rows?.levels?.length === 1;
    const useSentiment = settings.chartOrientation.useSentimentFeatures;
    const data = (barChartData ?? []).filter(d => d && d.category !== "defaultBreakdownStepOther");

    // ---- chartOrientation -------------------------------------------------
    const co = this.chartOrientation;
    co.useSentimentFeatures.visible = isStaticLike;
    co.sortData.visible = isStaticLike || singleLevel;
    co.limitBreakdown.visible = isStaticCategory || (!isStaticLike && singleLevel);
    co.maxBreakdown.visible = co.limitBreakdown.visible && settings.chartOrientation.limitBreakdown;

    // ---- definePillars --------------------------------------------------
    const dp = this.definePillars;
    dp.visible = isStaticLike || visualType === "drillableCategory";
    dp.slices = [];
    if (isStatic) {
      for (const d of data) {
        dp.slices.push(this.perDatapointToggle("pillars", d.category, !!d.isPillar, d.selectionId));
      }
    } else if (isStaticCategory) {
      if (!settings.definePillars.Totalpillar) {
        for (const d of data) {
          dp.slices.push(this.perDatapointToggle("pillars", d.category, !!d.isPillar, d.selectionId));
        }
      }
      dp.slices.push(dp.Totalpillar);
    } else if (visualType === "drillableCategory") {
      dp.slices.push(dp.Totalpillar);
    }

    // ---- sentimentColor ("Bar Color") ---------------------------------
    const sc = this.sentimentColor;
    sc.slices = [];
    if (isStaticLike && !useSentiment) {
      for (const row of barChartData ?? []) {
        if (row.category !== "defaultBreakdownStepOther") {
          sc.slices.push(fillSlice(row.category, row.customBarColor, row.selectionId));
        } else {
          sc.slices.push(sc.sentimentColorOther);
        }
      }
    } else {
      sc.slices = [sc.sentimentColorTotal, sc.sentimentColorFavourable, sc.sentimentColorAdverse, sc.sentimentColorOther];
    }

    // ---- Legend --------------------------------------------------------
    this.Legend.visible = useSentiment;

    // ---- xAxisFormatting ---------------------------------------------
    const xa = this.xAxisFormatting;
    xa.barWidth.visible = !settings.xAxisFormatting.fitToWidth;
    xa.gridLineStrokeWidth.visible = settings.xAxisFormatting.showGridLine;
    xa.gridLineColor.visible = settings.xAxisFormatting.showGridLine;
    xa.gridLineStrokeWidth.value = defaultXAxisGridlineStrokeWidth as number;

    // ---- yAxisFormatting ---------------------------------------------
    const ya = this.yAxisFormatting;
    const showValues = settings.yAxisFormatting.showYAxisValues;
    ya.font.visible = showValues;
    ya.fontColor.visible = showValues;
    ya.YAxisValueFormatOption.visible = showValues;
    ya.decimalPlaces.visible = showValues;
    ya.gridLineStrokeWidth.visible = settings.yAxisFormatting.showGridLine;
    ya.gridLineColor.visible = settings.yAxisFormatting.showGridLine;
    ya.gridLineStrokeWidth.value = defaultYAxisGridlineStrokeWidth as number;
    ya.zeroLineStrokeWidth.visible = settings.yAxisFormatting.showZeroAxisGridLine;
    ya.zeroLineColor.visible = settings.yAxisFormatting.showZeroAxisGridLine;
    ya.joinBarsStrokeWidth.visible = settings.yAxisFormatting.joinBars;
    ya.joinBarsColor.visible = settings.yAxisFormatting.joinBars;

    // ---- LabelsFormatting ------------------------------------------
    const lf = this.LabelsFormatting;
    const useDefaultColor = settings.LabelsFormatting.useDefaultFontColor;
    const useDefaultPos = settings.LabelsFormatting.useDefaultLabelPositioning;
    const sentimentBranch = useSentiment || !isStaticLike;

    lf.slices = [lf.font, lf.useDefaultFontColor];

    // font colour block
    if (useDefaultColor) {
      lf.slices.push(lf.fontColor);
    } else if (sentimentBranch) {
      lf.slices.push(lf.sentimentFontColorTotal, lf.sentimentFontColorFavourable, lf.sentimentFontColorAdverse, lf.sentimentFontColorOther);
    } else {
      for (const row of barChartData ?? []) {
        if (row.category !== "defaultBreakdownStepOther") {
          lf.slices.push(fillSlice(row.category, row.customFontColor, row.selectionId));
        } else {
          lf.slices.push(lf.sentimentFontColorOther);
        }
      }
    }

    // label positioning block
    lf.slices.push(lf.useDefaultLabelPositioning);
    if (useDefaultPos) {
      lf.slices.push(lf.labelPosition);
    } else if (sentimentBranch) {
      lf.slices.push(lf.labelPositionTotal, lf.labelPositionFavourable, lf.labelPositionAdverse, lf.labelPositionOther);
    } else {
      for (const row of barChartData ?? []) {
        if (row.category !== "defaultBreakdownStepOther") {
          lf.slices.push(this.perDatapointDropdown("labelPosition", row.category, row.customLabelPositioning, row.selectionId));
        } else {
          lf.slices.push(lf.labelPositionOther);
        }
      }
    }

    lf.slices.push(lf.valueFormat, lf.decimalPlaces, lf.HideZeroBlankValues);
  }

  private perDatapointToggle(name: string, displayName: string, value: boolean, selectionId: powerbi.visuals.ISelectionId): formattingSettings.ToggleSwitch {
    const slice = new formattingSettings.ToggleSwitch({ name, displayName, value });
    slice.selector = selectionId.getSelector();
    return slice;
  }

  private perDatapointDropdown(name: string, displayName: string, value: string, selectionId: powerbi.visuals.ISelectionId): formattingSettings.ItemDropdown {
    const slice = dropdown(name, displayName, value, LABEL_POSITION_ITEMS);
    slice.selector = selectionId.getSelector();
    return slice;
  }
}
