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
import { BarChartDataPoint } from "./dataPoint";
import { VisualMode } from "./visualType";

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
  public fontColor: string = DEFAULT_GREY;
  public fontFamily: string = "Segoe UI";
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
  public show: boolean = true;
  public fontSize: number = 9;
  public fontColor: string = DEFAULT_GREY;
  public fontFamily: string = "Segoe UI";
  public labelWrapText: boolean = true;
  public fitToWidth: boolean = true;
  public barWidth: number = 50;
  public padding: number = 5;
  public showGridLine: boolean = true;
  public gridLineStrokeWidth: number = 5;
  public gridLineColor: string = DEFAULT_GREY;
}
export class yAxisFormatting {
  public show: boolean = true;
  public YAxisDataPointOption: string = "Auto";
  public showYAxisValues: boolean = true;
  public fontSize: number = 9;
  public fontColor: string = DEFAULT_GREY;
  public fontFamily: string = "Segoe UI";
  public YAxisValueFormatOption: string = "Auto";
  public showGridLine: boolean = true;

  public gridLineStrokeWidth: number = 1;
  public gridLineColor: string = DEFAULT_GREY;
  public showZeroAxisGridLine: boolean = false;
  public zeroLineStrokeWidth: number = 1;
  public zeroLineColor: string = DEFAULT_GREY;
  public joinBars: boolean = false;
  public joinBarsStrokeWidth: number = 1;
  public joinBarsColor: string = DEFAULT_GREY;
  public decimalPlaces: number = 0;

}
export class LabelsFormatting {
  public show: boolean = true;
  public fontSize: number = 9;
  public useDefaultFontColor: boolean = true;
  public fontColor: string = DEFAULT_GREY;
  public sentimentFontColorTotal: string = DEFAULT_GREY;
  public sentimentFontColorFavourable: string = DEFAULT_GREY;
  public sentimentFontColorAdverse: string = DEFAULT_GREY;
  public sentimentFontColorOther: string = DEFAULT_GREY;
  public fontFamily: string = "Segoe UI";
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
 * Cards mirror the capabilities.json objects; groups are pane-only containers
 * (their `name` is not in capabilities). Every master on/off is promoted to a
 * card- or group-level `topLevelSlice` so the pane host renders it in the
 * header and subordinates the body when it is off.
 *
 * Rules for "unavailable" controls, applied in applyState():
 *  1. Master on/off within a card  -> card/group `topLevelSlice`.
 *  2. Depends on a switch elsewhere -> keep visible, set `disabled` +
 *     `disabledReason` naming the switch to flip.
 *  3. Incompatible with the data shape (mode gating) -> `visible = false`.
 *
 * applyState() is called from Visual.getFormattingModel() after visualType /
 * barChartData are known; it also injects the per-datapoint dynamic slices.
 * ==========================================================================*/

// Bare family name so the formatting-pane FontPicker shows a clean "Segoe UI"
// chip rather than the raw, quote-prefixed CSS stack ('"Segoe UI", wf_...').
const FONT_FAMILY_DEFAULT = "Segoe UI";

export const DEFAULT_GREY = "#777777";

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

function fontControl(fontSize: number): formattingSettings.FontControl {
  return new formattingSettings.FontControl({
    name: "font",
    displayName: "Font",
    fontFamily: new formattingSettings.FontPicker({ name: "fontFamily", displayName: "Font Family", value: FONT_FAMILY_DEFAULT }),
    fontSize: num("fontSize", "Font Size", fontSize, 8, 60),
  });
}

function group(
  name: string,
  displayName: string,
  slices: formattingSettings.Slice[],
  topLevelSlice?: formattingSettings.ToggleSwitch
): formattingSettings.Group {
  const g = new formattingSettings.Group({ name, displayName, slices });
  if (topLevelSlice) {
    g.topLevelSlice = topLevelSlice;
  }
  return g;
}

// ---- Chart Options -----------------------------------------------------------
class ChartOrientationCard extends formattingSettings.CompositeCard {
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

  layoutGroup = group("layout", "Layout", [this.orientation]);
  stepsGroup = group("steps", "Steps", [this.sortData, this.limitBreakdown, this.maxBreakdown]);
  sentimentGroup = group("sentiment", "Sentiment formatting", [this.useSentimentFeatures]);

  groups = [this.layoutGroup, this.stepsGroup, this.sentimentGroup];
}

// ---- Pillars ---------------------------------------------------------------
class DefinePillarsCard extends formattingSettings.CompositeCard {
  name = "definePillars";
  displayName = "Pillars";

  Totalpillar = toggle("Totalpillar", "Show Cumulative Total", true);

  cumulativeGroup = group("cumulative", "Cumulative total", [this.Totalpillar]);
  // Per-datapoint "pillars" toggles are injected in applyState().
  perPointGroup = group("perPoint", "Mark step as pillar", []);

  groups = [this.cumulativeGroup, this.perPointGroup];
}

// ---- Bar Color ----------------------------------------------------------
class SentimentColorCard extends formattingSettings.CompositeCard {
  name = "sentimentColor";
  displayName = "Bar Color";

  sentimentColorTotal = color("sentimentColorTotal", "Total", "#0000ff");
  sentimentColorFavourable = color("sentimentColorFavourable", "Favourable", "#00b050");
  sentimentColorAdverse = color("sentimentColorAdverse", "Adverse", "#ff0000");
  sentimentColorOther = color("sentimentColorOther", "Other", "#F2C811");

  bySentimentGroup = group("bySentiment", "By sentiment", [
    this.sentimentColorTotal, this.sentimentColorFavourable, this.sentimentColorAdverse, this.sentimentColorOther,
  ]);
  // Per-datapoint "fill" pickers are injected in applyState().
  byPointGroup = group("byPoint", "By data point", []);

  groups = [this.bySentimentGroup, this.byPointGroup];
}

// ---- Margins (flat: four equal peers) --------------------------------------
class MarginsCard extends formattingSettings.SimpleCard {
  name = "margins";
  displayName = "Margins";

  topMargin = num("topMargin", "Top Margin", 0, 0, 100);
  bottomMargin = num("bottomMargin", "Bottom Margin", 0, 0, 100);
  leftMargin = num("leftMargin", "Left Margin", 0, 0, 100);
  rightMargin = num("rightMargin", "Right Margin", 0, 0, 100);

  slices = [this.topMargin, this.bottomMargin, this.leftMargin, this.rightMargin];
}

// ---- Legend --------------------------------------------------------------
class LegendCard extends formattingSettings.CompositeCard {
  name = "Legend";
  displayName = "Legend";

  show = toggle("show", "Legend", false);
  textFavourable = text("textFavourable", "Sentiment - Favourable", "Favourable");
  textAdverse = text("textAdverse", "Sentiment - Adverse", "Adverse");
  font = fontControl(9);
  fontColor = color("fontColor", "Font Color", DEFAULT_GREY);

  topLevelSlice = this.show;

  textGroup = group("text", "Text", [this.textFavourable, this.textAdverse]);
  fontGroup = group("font", "Font", [this.font, this.fontColor]);

  groups = [this.textGroup, this.fontGroup];
}

// ---- X-Axis -----------------------------------------------------------
class XAxisCard extends formattingSettings.CompositeCard {
  name = "xAxisFormatting";
  displayName = "X-Axis";

  show = toggle("show", "X-Axis", true);
  font = fontControl(9);
  fontColor = color("fontColor", "Font Color", DEFAULT_GREY);
  labelWrapText = toggle("labelWrapText", "Wrap text", true);
  padding = num("padding", "Padding", 5, 0, 20);
  fitToWidth = toggle("fitToWidth", "Fit to width", true);
  barWidth = num("barWidth", "Minimum Bar Width", 50, 10, 100);
  showGridLine = toggle("showGridLine", "Gridlines", true);
  gridLineStrokeWidth = num("gridLineStrokeWidth", "Stroke Width", 5, 1, 50);
  gridLineColor = color("gridLineColor", "Gridlines Color", DEFAULT_GREY);

  topLevelSlice = this.show;

  labelsGroup = group("labels", "Labels", [this.font, this.fontColor, this.labelWrapText, this.padding]);
  layoutGroup = group("layout", "Layout", [this.fitToWidth, this.barWidth]);
  gridlinesGroup = group("gridlines", "Gridlines", [this.gridLineStrokeWidth, this.gridLineColor], this.showGridLine);

  groups = [this.labelsGroup, this.layoutGroup, this.gridlinesGroup];
}

// ---- Y-Axis -----------------------------------------------------------
class YAxisCard extends formattingSettings.CompositeCard {
  name = "yAxisFormatting";
  displayName = "Y-Axis";

  show = toggle("show", "Y-Axis", true);
  showYAxisValues = toggle("showYAxisValues", "Values", true);
  font = fontControl(9);
  fontColor = color("fontColor", "Font Color", DEFAULT_GREY);
  YAxisValueFormatOption = dropdown("YAxisValueFormatOption", "Display Units", "Auto", VALUE_FORMAT_ITEMS);
  decimalPlaces = num("decimalPlaces", "Value decimal places", 0, 0, 15);
  YAxisDataPointOption = dropdown("YAxisDataPointOption", "Starting Point", "Auto", [
    { value: "Auto", displayName: "Auto" },
    { value: "Zero", displayName: "Zero" },
  ]);
  showGridLine = toggle("showGridLine", "Gridlines", true);
  gridLineStrokeWidth = num("gridLineStrokeWidth", "Stroke Width", 1, 1, 50);
  gridLineColor = color("gridLineColor", "Gridlines Color", DEFAULT_GREY);
  showZeroAxisGridLine = toggle("showZeroAxisGridLine", "Zero line", false);
  zeroLineStrokeWidth = num("zeroLineStrokeWidth", "Stroke Width", 1, 1, 50);
  zeroLineColor = color("zeroLineColor", "Color", DEFAULT_GREY);
  joinBars = toggle("joinBars", "Connectors", false);
  joinBarsStrokeWidth = num("joinBarsStrokeWidth", "Stroke Width", 1, 1, 50);
  joinBarsColor = color("joinBarsColor", "Color", DEFAULT_GREY);

  topLevelSlice = this.show;

  valuesGroup = group("values", "Values",
    [this.font, this.fontColor, this.YAxisValueFormatOption, this.decimalPlaces], this.showYAxisValues);
  scaleGroup = group("scale", "Scale", [this.YAxisDataPointOption]);
  gridlinesGroup = group("gridlines", "Gridlines", [this.gridLineStrokeWidth, this.gridLineColor], this.showGridLine);
  zeroLineGroup = group("zeroLine", "Zero line", [this.zeroLineStrokeWidth, this.zeroLineColor], this.showZeroAxisGridLine);
  connectorsGroup = group("connectors", "Connectors", [this.joinBarsStrokeWidth, this.joinBarsColor], this.joinBars);

  groups = [this.valuesGroup, this.scaleGroup, this.gridlinesGroup, this.zeroLineGroup, this.connectorsGroup];
}

// ---- Labels ------------------------------------------------------------
class LabelsCard extends formattingSettings.CompositeCard {
  name = "LabelsFormatting";
  displayName = "Labels";

  show = toggle("show", "Show Labels", true);
  topLevelSlice = this.show;

  font = fontControl(9);
  useDefaultFontColor = toggle("useDefaultFontColor", "Use Default Font Color", true);
  fontColor = color("fontColor", "Default Font Color", DEFAULT_GREY);
  sentimentFontColorTotal = color("sentimentFontColorTotal", "Total", DEFAULT_GREY);
  sentimentFontColorFavourable = color("sentimentFontColorFavourable", "Favourable", DEFAULT_GREY);
  sentimentFontColorAdverse = color("sentimentFontColorAdverse", "Adverse", DEFAULT_GREY);
  sentimentFontColorOther = color("sentimentFontColorOther", "Other", DEFAULT_GREY);
  useDefaultLabelPositioning = toggle("useDefaultLabelPositioning", "Use Default Label Positioning", true);
  labelPosition = dropdown("labelPosition", "Label Position", "Outside end", LABEL_POSITION_ITEMS);
  labelPositionTotal = dropdown("labelPositionTotal", "Total", "Outside end", LABEL_POSITION_ITEMS);
  labelPositionFavourable = dropdown("labelPositionFavourable", "Favourable", "Outside end", LABEL_POSITION_ITEMS);
  labelPositionAdverse = dropdown("labelPositionAdverse", "Adverse", "Outside end", LABEL_POSITION_ITEMS);
  labelPositionOther = dropdown("labelPositionOther", "Other", "Outside end", LABEL_POSITION_ITEMS);
  valueFormat = dropdown("valueFormat", "Display Units", "Auto", VALUE_FORMAT_ITEMS);
  decimalPlaces = num("decimalPlaces", "Value decimal places", 0, 0, 15);
  HideZeroBlankValues = toggle("HideZeroBlankValues", "Hide Zero / Blank values", false);

  fontGroup = group("font", "Font", [this.font]);
  // color / position group slices are rebuilt in applyState().
  colorGroup = group("color", "Color", [this.useDefaultFontColor, this.fontColor]);
  positionGroup = group("position", "Position", [this.useDefaultLabelPositioning, this.labelPosition]);
  valueFormatGroup = group("valueFormat", "Value format", [this.valueFormat, this.decimalPlaces]);
  optionsGroup = group("options", "Options", [this.HideZeroBlankValues]);

  groups = [this.fontGroup, this.colorGroup, this.positionGroup, this.valueFormatGroup, this.optionsGroup];
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
    this.sentimentColor,
    this.Legend,
    this.definePillars,
    this.xAxisFormatting,
    this.yAxisFormatting,
    this.LabelsFormatting,
    this.margins,
  ];

  /**
   * Apply conditional visibility, cross-setting `disabled` reasons, and the
   * per-datapoint dynamic slices. Called from Visual.getFormattingModel() after
   * visualType / barChartData are known. The model is rebuilt from defaults on
   * every call (populateFormattingSettingsModel news it up), so each branch sets
   * its state explicitly rather than relying on a reset.
   */
  public applyState(
    visualType: VisualMode,
    settings: VisualSettings,
    barChartData: BarChartDataPoint[],
    dataView: DataView
  ): void {
    const isStatic = visualType.isStatic;
    const isStaticCategory = visualType.isStaticCategory;
    const isStaticLike = visualType.isStaticLike;
    const isDrillableCategory = visualType.isDrillableCategory;
    const singleLevel = dataView?.matrix?.rows?.levels?.length === 1;
    const useSentiment = settings.chartOrientation.useSentimentFeatures;
    const data = (barChartData ?? []).filter(d => d && d.category !== "defaultBreakdownStepOther");

    // ---- Chart Options -------------------------------------------------
    const co = this.chartOrientation;
    co.sortData.visible = isStaticLike || singleLevel;
    co.limitBreakdown.visible = isStaticCategory || (!isStaticLike && singleLevel);
    co.maxBreakdown.visible = co.limitBreakdown.visible;
    co.maxBreakdown.disabled = !settings.chartOrientation.limitBreakdown;
    co.maxBreakdown.disabledReason = "Turn on Limit Steps to set a maximum.";
    co.useSentimentFeatures.visible = isStaticLike;
    co.stepsGroup.visible = co.sortData.visible || co.limitBreakdown.visible;
    co.sentimentGroup.visible = co.useSentimentFeatures.visible;

    // ---- Pillars -----------------------------------------------------
    const dp = this.definePillars;
    dp.visible = isStaticLike || isDrillableCategory;
    dp.perPointGroup.slices = [];
    dp.perPointGroup.disabled = false;
    if (isStatic) {
      dp.cumulativeGroup.visible = false;
      dp.perPointGroup.visible = data.length > 0;
      for (const d of data) {
        dp.perPointGroup.slices.push(this.perDatapointToggle("pillars", d.category, !!d.isPillar, d.selectionId!));
      }
    } else if (isStaticCategory) {
      dp.cumulativeGroup.visible = true;
      dp.perPointGroup.visible = data.length > 0;
      dp.perPointGroup.disabled = settings.definePillars.Totalpillar;
      dp.perPointGroup.disabledReason = "Turn off Show Cumulative Total to mark individual steps as pillars.";
      for (const d of data) {
        dp.perPointGroup.slices.push(this.perDatapointToggle("pillars", d.category, !!d.isPillar, d.selectionId!));
      }
    } else if (isDrillableCategory) {
      dp.cumulativeGroup.visible = true;
      dp.perPointGroup.visible = false;
    }

    // ---- Bar Color -------------------------------------------------
    const sc = this.sentimentColor;
    const individualColors = isStaticLike && !useSentiment;
    sc.byPointGroup.slices = [];
    if (individualColors) {
      // The per-bar pickers fully replace the sentiment swatches; the aggregated
      // "Other" bar reuses the shared sentimentColorOther picker, so the two
      // groups can't both be shown without duplicating that control.
      sc.bySentimentGroup.visible = false;
      sc.byPointGroup.visible = true;
      for (const row of barChartData ?? []) {
        if (row.category !== "defaultBreakdownStepOther") {
          sc.byPointGroup.slices.push(fillSlice(row.category, row.customBarColor, row.selectionId!));
        } else {
          sc.byPointGroup.slices.push(sc.sentimentColorOther);
        }
      }
    } else {
      sc.bySentimentGroup.visible = true;
      sc.byPointGroup.visible = false;
    }

    // ---- Legend --------------------------------------------------------
    const lg = this.Legend;
    if (useSentiment) {
      lg.visible = true;
      lg.disabled = false;
    } else if (isStaticLike) {
      lg.visible = true;
      lg.disabled = true;
      lg.disabledReason = "Turn on Format using Sentiments (Chart Options) to use the legend.";
    } else {
      lg.visible = false;
    }

    // ---- X-Axis ----------------------------------------------------
    // The group `topLevelSlice`s render the header toggles; the explicit
    // `.visible` gating below keeps the dependent slices hidden (not just
    // greyed) when a toggle is off, matching the established behaviour.
    const xa = this.xAxisFormatting;
    xa.barWidth.visible = !settings.xAxisFormatting.fitToWidth;
    const xGrid = settings.xAxisFormatting.showGridLine;
    xa.gridLineStrokeWidth.visible = xGrid;
    xa.gridLineColor.visible = xGrid;

    // ---- Y-Axis ----------------------------------------------------
    const ya = this.yAxisFormatting;
    const yValues = settings.yAxisFormatting.showYAxisValues;
    ya.font.visible = yValues;
    ya.fontColor.visible = yValues;
    ya.YAxisValueFormatOption.visible = yValues;
    ya.decimalPlaces.visible = yValues;
    const yGrid = settings.yAxisFormatting.showGridLine;
    ya.gridLineStrokeWidth.visible = yGrid;
    ya.gridLineColor.visible = yGrid;
    const yZero = settings.yAxisFormatting.showZeroAxisGridLine;
    ya.zeroLineStrokeWidth.visible = yZero;
    ya.zeroLineColor.visible = yZero;
    ya.joinBarsStrokeWidth.visible = settings.yAxisFormatting.joinBars;
    ya.joinBarsColor.visible = settings.yAxisFormatting.joinBars;

    // ---- Labels --------------------------------------------------
    const lf = this.LabelsFormatting;
    const useDefaultColor = settings.LabelsFormatting.useDefaultFontColor;
    const useDefaultPos = settings.LabelsFormatting.useDefaultLabelPositioning;
    const sentimentBranch = useSentiment || !isStaticLike;

    // colour block
    lf.colorGroup.slices = [lf.useDefaultFontColor];
    if (useDefaultColor) {
      lf.colorGroup.slices.push(lf.fontColor);
    } else if (sentimentBranch) {
      lf.colorGroup.slices.push(
        lf.sentimentFontColorTotal, lf.sentimentFontColorFavourable, lf.sentimentFontColorAdverse, lf.sentimentFontColorOther);
    } else {
      for (const row of barChartData ?? []) {
        if (row.category !== "defaultBreakdownStepOther") {
          lf.colorGroup.slices.push(fillSlice(row.category, row.customFontColor, row.selectionId!));
        } else {
          lf.colorGroup.slices.push(lf.sentimentFontColorOther);
        }
      }
    }

    // positioning block
    lf.positionGroup.slices = [lf.useDefaultLabelPositioning];
    if (useDefaultPos) {
      lf.positionGroup.slices.push(lf.labelPosition);
    } else if (sentimentBranch) {
      lf.positionGroup.slices.push(
        lf.labelPositionTotal, lf.labelPositionFavourable, lf.labelPositionAdverse, lf.labelPositionOther);
    } else {
      for (const row of barChartData ?? []) {
        if (row.category !== "defaultBreakdownStepOther") {
          lf.positionGroup.slices.push(this.perDatapointDropdown("labelPosition", row.category, row.customLabelPositioning, row.selectionId!));
        } else {
          lf.positionGroup.slices.push(lf.labelPositionOther);
        }
      }
    }
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
