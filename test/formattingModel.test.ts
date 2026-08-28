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

function sliceNames(card: any): string[] {
  return (card.slices ?? []).map((s: any) => s.name);
}

function findCard(model: VisualFormattingSettingsModel, name: string): any {
  return model.cards.filter((c: any) => c.name === name)[0];
}

describe("VisualFormattingSettingsModel.applyState", () => {
  it("static: pillar toggle per category, sentiment colours hidden when individual colours are used", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();
    settings.chartOrientation.useSentimentFeatures = false;
    const data = [row("A", 1), row("B"), row("C")];

    model.applyState(visualMode("static"), settings, data, dataView(0), 5, 1);

    const pillars = findCard(model, "definePillars");
    expect(pillars.visible).toBe(true);
    expect(sliceNames(pillars)).toEqual(["pillars", "pillars", "pillars"]);
    expect(pillars.slices.map((s: any) => s.value)).toEqual([true, false, false]);
    pillars.slices.forEach((s: any) => expect(s.selector).toEqual({ id: expect.any(String) }));

    const barColor = findCard(model, "sentimentColor");
    // individual colours -> one "fill" slice per data row, ConstantOrRule
    expect(sliceNames(barColor)).toEqual(["fill", "fill", "fill"]);
    barColor.slices.forEach((s: any) => {
      expect(s.instanceKind).toBe(3);
      expect(s.altConstantSelector).toEqual({ id: expect.any(String) });
    });
  });

  it("static + sentiment features: four sentiment colour pickers, no per-bar fills", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();
    settings.chartOrientation.useSentimentFeatures = true;

    model.applyState(visualMode("static"), settings, [row("A"), row("B")], dataView(0), 5, 1);

    const barColor = findCard(model, "sentimentColor");
    expect(sliceNames(barColor)).toEqual([
      "sentimentColorTotal", "sentimentColorFavourable", "sentimentColorAdverse", "sentimentColorOther",
    ]);
    expect(findCard(model, "Legend").visible).toBe(true);
  });

  it("drillable: definePillars hidden, Legend hidden without sentiment features", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();
    settings.chartOrientation.useSentimentFeatures = false;

    model.applyState(visualMode("drillable"), settings, [row("A"), row("B")], dataView(2), 5, 1);

    expect(findCard(model, "definePillars").visible).toBe(false);
    expect(findCard(model, "Legend").visible).toBe(false);
    // drillable multi-level -> only orientation is offered
    const co = findCard(model, "chartOrientation");
    expect(co.useSentimentFeatures.visible).toBe(false);
    expect(co.sortData.visible).toBe(false);
    expect(co.limitBreakdown.visible).toBe(false);
  });

  it("drillableCategory: Totalpillar shown, no per-category pillar toggles", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();

    model.applyState(visualMode("drillableCategory"), settings, [row("A"), row("B")], dataView(3), 5, 1);

    const pillars = findCard(model, "definePillars");
    expect(pillars.visible).toBe(true);
    expect(sliceNames(pillars)).toEqual(["Totalpillar"]);
  });

  it("staticCategory: per-category pillar toggles only while cumulative total is off", () => {
    const settings = new VisualSettings();
    const data = [row("A", 1), row("B"), row("C")];

    const withTotal = new VisualFormattingSettingsModel();
    settings.definePillars.Totalpillar = true;
    withTotal.applyState(visualMode("staticCategory"), settings, data, dataView(1), 5, 1);
    expect(sliceNames(findCard(withTotal, "definePillars"))).toEqual(["Totalpillar"]);

    const noTotal = new VisualFormattingSettingsModel();
    settings.definePillars.Totalpillar = false;
    noTotal.applyState(visualMode("staticCategory"), settings, data, dataView(1), 5, 1);
    expect(sliceNames(findCard(noTotal, "definePillars"))).toEqual([
      "pillars", "pillars", "pillars", "Totalpillar",
    ]);
  });

  it("conditional slice visibility follows sibling toggles", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();
    settings.xAxisFormatting.fitToWidth = false;
    settings.xAxisFormatting.showGridLine = false;
    settings.yAxisFormatting.showYAxisValues = false;
    settings.yAxisFormatting.joinBars = true;

    model.applyState(visualMode("static"), settings, [row("A")], dataView(0), 7, 2);

    const xa = findCard(model, "xAxisFormatting");
    expect(xa.barWidth.visible).toBe(true);          // fitToWidth off -> min width shown
    expect(xa.gridLineColor.visible).toBe(false);    // gridlines off -> colour hidden
    expect(xa.gridLineStrokeWidth.value).toBe(7);    // seeded from default stroke width

    const ya = findCard(model, "yAxisFormatting");
    expect(ya.font.visible).toBe(false);             // values hidden -> font hidden
    expect(ya.decimalPlaces.visible).toBe(false);
    expect(ya.joinBarsColor.visible).toBe(true);     // joinBars on -> colour shown
  });

  it("labels: per-category label position dropdowns when positioning is manual and non-sentiment", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();
    settings.chartOrientation.useSentimentFeatures = false;
    settings.LabelsFormatting.useDefaultLabelPositioning = false;
    settings.LabelsFormatting.useDefaultFontColor = false;
    const data = [row("A"), row("B")];

    model.applyState(visualMode("static"), settings, data, dataView(0), 5, 1);

    const lf = findCard(model, "LabelsFormatting");
    const names = sliceNames(lf);
    // two per-category fill pickers + two per-category labelPosition dropdowns
    expect(names.filter((n) => n === "fill").length).toBe(2);
    expect(names.filter((n) => n === "labelPosition").length).toBe(2);
    expect(names).toContain("valueFormat");
    expect(names).toContain("HideZeroBlankValues");
  });

  it("labels: sentiment branch shows the four positional/colour dropdowns", () => {
    const model = new VisualFormattingSettingsModel();
    const settings = new VisualSettings();
    settings.chartOrientation.useSentimentFeatures = true;
    settings.LabelsFormatting.useDefaultLabelPositioning = false;
    settings.LabelsFormatting.useDefaultFontColor = false;

    model.applyState(visualMode("static"), settings, [row("A")], dataView(0), 5, 1);

    const names = sliceNames(findCard(model, "LabelsFormatting"));
    expect(names).toEqual(expect.arrayContaining([
      "sentimentFontColorTotal", "sentimentFontColorFavourable", "sentimentFontColorAdverse", "sentimentFontColorOther",
      "labelPositionTotal", "labelPositionFavourable", "labelPositionAdverse", "labelPositionOther",
    ]));
  });
});
