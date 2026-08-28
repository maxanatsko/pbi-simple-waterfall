import { describe, it, expect } from "vitest";
import { VisualSettings, VisualFormattingSettingsModel } from "../src/settings";
import { visualMode } from "../src/visualType";

function fakeSelectionId(key: string): any {
  return { getSelector: () => ({ id: key }) };
}

function row(category: string, isPillar = 0): any {
  return {
    category,
    isPillar,
    customBarColor: "#123456",
    customFontColor: "#654321",
    customLabelPositioning: "Inside end",
    selectionId: fakeSelectionId(category),
  };
}

function dataView(levels: number): any {
  return { matrix: { rows: { levels: new Array(levels).fill({}) } } };
}

function findCard(model: VisualFormattingSettingsModel, name: string): any {
  return model.cards.filter((c: any) => c.name === name)[0];
}

function groupOf(card: any, name: string): any {
  return (card.groups ?? []).filter((g: any) => g.name === name)[0];
}

function groupSliceNames(card: any, groupName: string): string[] {
  return (groupOf(card, groupName)?.slices ?? []).map((s: any) => s.name);
}

function allSliceNames(card: any): string[] {
  return (card.groups ?? []).flatMap((g: any) => (g.slices ?? []).map((s: any) => s.name));
}

describe("VisualFormattingSettingsModel.applyState", () => {
  it("static: pillar toggle per category, individual bar colours when sentiment features are off", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();
    settings.chartOrientation.useSentimentFeatures = false;
    const data = [row("A", 1), row("B"), row("C")];

    model.applyState(visualMode("static"), settings, data, dataView(0));

    const pillars = findCard(model, "definePillars");
    expect(pillars.visible).toBe(true);
    // cumulative total is not offered in "static" mode
    expect(groupOf(pillars, "cumulative").visible).toBe(false);
    expect(groupSliceNames(pillars, "perPoint")).toEqual(["pillars", "pillars", "pillars"]);
    const perPoint = groupOf(pillars, "perPoint");
    expect(perPoint.slices.map((s: any) => s.value)).toEqual([true, false, false]);
    perPoint.slices.forEach((s: any) => expect(s.selector).toEqual({ id: expect.any(String) }));

    const barColor = findCard(model, "sentimentColor");
    expect(groupOf(barColor, "bySentiment").visible).toBe(false);
    expect(groupOf(barColor, "byPoint").visible).toBe(true);
    expect(groupSliceNames(barColor, "byPoint")).toEqual(["fill", "fill", "fill"]);
    groupOf(barColor, "byPoint").slices.forEach((s: any) => {
      expect(s.instanceKind).toBe(3);
      expect(s.altConstantSelector).toEqual({ id: expect.any(String) });
    });
  });

  it("static + sentiment features: four sentiment colour pickers, no per-bar fills, legend enabled", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();
    settings.chartOrientation.useSentimentFeatures = true;

    model.applyState(visualMode("static"), settings, [row("A"), row("B")], dataView(0));

    const barColor = findCard(model, "sentimentColor");
    expect(groupOf(barColor, "bySentiment").visible).toBe(true);
    expect(groupOf(barColor, "byPoint").visible).toBe(false);
    expect(groupSliceNames(barColor, "bySentiment")).toEqual([
      "sentimentColorTotal", "sentimentColorFavourable", "sentimentColorAdverse", "sentimentColorOther",
    ]);

    const legend = findCard(model, "Legend");
    expect(legend.visible).toBe(true);
    expect(legend.disabled).toBeFalsy();
  });

  it("drillable: definePillars hidden, legend hidden without sentiment features", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();
    settings.chartOrientation.useSentimentFeatures = false;

    model.applyState(visualMode("drillable"), settings, [row("A"), row("B")], dataView(2));

    expect(findCard(model, "definePillars").visible).toBe(false);
    expect(findCard(model, "Legend").visible).toBe(false);
    // drillable multi-level -> only orientation is offered
    const co = findCard(model, "chartOrientation");
    expect(co.useSentimentFeatures.visible).toBe(false);
    expect(co.sortData.visible).toBe(false);
    expect(co.limitBreakdown.visible).toBe(false);
    expect(groupOf(co, "steps").visible).toBe(false);
    expect(groupOf(co, "sentiment").visible).toBe(false);
  });

  it("drillableCategory: cumulative total shown, no per-category pillar toggles", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();

    model.applyState(visualMode("drillableCategory"), settings, [row("A"), row("B")], dataView(3));

    const pillars = findCard(model, "definePillars");
    expect(pillars.visible).toBe(true);
    expect(groupOf(pillars, "cumulative").visible).toBe(true);
    expect(groupSliceNames(pillars, "cumulative")).toEqual(["Totalpillar"]);
    expect(groupOf(pillars, "perPoint").visible).toBe(false);
  });

  it("staticCategory: per-category pillar toggles always present, disabled while cumulative total is on", () => {
    const settings = new VisualSettings();
    const data = [row("A", 1), row("B"), row("C")];

    const withTotal = new VisualFormattingSettingsModel();
    settings.definePillars.Totalpillar = true;
    withTotal.applyState(visualMode("staticCategory"), settings, data, dataView(1));
    const withTotalPillars = findCard(withTotal, "definePillars");
    expect(groupSliceNames(withTotalPillars, "cumulative")).toEqual(["Totalpillar"]);
    expect(groupSliceNames(withTotalPillars, "perPoint")).toEqual(["pillars", "pillars", "pillars"]);
    expect(groupOf(withTotalPillars, "perPoint").disabled).toBe(true);

    const noTotal = new VisualFormattingSettingsModel();
    settings.definePillars.Totalpillar = false;
    noTotal.applyState(visualMode("staticCategory"), settings, data, dataView(1));
    const noTotalPillars = findCard(noTotal, "definePillars");
    expect(groupSliceNames(noTotalPillars, "perPoint")).toEqual(["pillars", "pillars", "pillars"]);
    expect(groupOf(noTotalPillars, "perPoint").disabled).toBe(false);
  });

  it("conditional slice visibility follows sibling toggles", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();
    settings.xAxisFormatting.fitToWidth = false;
    settings.xAxisFormatting.showGridLine = false;
    settings.yAxisFormatting.showYAxisValues = false;
    settings.yAxisFormatting.joinBars = true;

    model.applyState(visualMode("static"), settings, [row("A")], dataView(0));

    const xa = findCard(model, "xAxisFormatting");
    expect(xa.barWidth.visible).toBe(true);          // fitToWidth off -> min width shown
    expect(xa.gridLineColor.visible).toBe(false);    // gridlines off -> colour hidden
    expect(groupOf(xa, "gridlines").topLevelSlice.name).toBe("showGridLine");

    const ya = findCard(model, "yAxisFormatting");
    expect(ya.font.visible).toBe(false);             // values hidden -> font hidden
    expect(ya.decimalPlaces.visible).toBe(false);
    expect(ya.joinBarsColor.visible).toBe(true);     // connectors on -> colour shown
    expect(groupOf(ya, "connectors").topLevelSlice.name).toBe("joinBars");
  });

  it("decimal-places stays enabled when display units are None (precision still applies)", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();
    settings.yAxisFormatting.YAxisValueFormatOption = "None";
    settings.LabelsFormatting.valueFormat = "None";

    model.applyState(visualMode("static"), settings, [row("A")], dataView(0));

    expect(findCard(model, "yAxisFormatting").decimalPlaces.disabled).toBeFalsy();
    expect(findCard(model, "LabelsFormatting").decimalPlaces.disabled).toBeFalsy();
  });

  it("cards expose master on/off as a card-level topLevelSlice", () => {
    const model = new VisualFormattingSettingsModel();
    expect(findCard(model, "Legend").topLevelSlice.name).toBe("show");
    expect(findCard(model, "xAxisFormatting").topLevelSlice.name).toBe("show");
    expect(findCard(model, "yAxisFormatting").topLevelSlice.name).toBe("show");
    expect(findCard(model, "LabelsFormatting").topLevelSlice.name).toBe("show");
  });

  it("labels: per-category label position dropdowns when positioning is manual and non-sentiment", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();
    settings.chartOrientation.useSentimentFeatures = false;
    settings.LabelsFormatting.useDefaultLabelPositioning = false;
    settings.LabelsFormatting.useDefaultFontColor = false;
    const data = [row("A"), row("B")];

    model.applyState(visualMode("static"), settings, data, dataView(0));

    const lf = findCard(model, "LabelsFormatting");
    expect(groupSliceNames(lf, "color").filter((n) => n === "fill").length).toBe(2);
    expect(groupSliceNames(lf, "position").filter((n) => n === "labelPosition").length).toBe(2);
    expect(allSliceNames(lf)).toContain("valueFormat");
    expect(allSliceNames(lf)).toContain("HideZeroBlankValues");
  });

  it("labels: sentiment branch shows the four positional/colour dropdowns", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();
    settings.chartOrientation.useSentimentFeatures = true;
    settings.LabelsFormatting.useDefaultLabelPositioning = false;
    settings.LabelsFormatting.useDefaultFontColor = false;

    model.applyState(visualMode("static"), settings, [row("A")], dataView(0));

    const names = allSliceNames(findCard(model, "LabelsFormatting"));
    expect(names).toEqual(expect.arrayContaining([
      "sentimentFontColorTotal", "sentimentFontColorFavourable", "sentimentFontColorAdverse", "sentimentFontColorOther",
      "labelPositionTotal", "labelPositionFavourable", "labelPositionAdverse", "labelPositionOther",
    ]));
  });
});
