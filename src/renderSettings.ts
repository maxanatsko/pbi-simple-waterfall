import { VisualSettings } from "./settings";

/* ============================================================================
 * Render view-model
 * ---------------------------------------------------------------------------
 * A narrow, render-side projection of VisualSettings built once per
 * `update()`. The renderer, data builder and legend read only these semantic
 * getters; the raw card/property paths (`VisualSettings.<card>.<prop>`) live
 * solely here. Renaming or relocating a setting is therefore a single-edit
 * change instead of a string hunt across ~80 call sites.
 *
 * The object is cheap to construct (it only retains a reference to the parsed
 * settings) and getters resolve lazily, so it can be passed by value into the
 * render pipeline's context objects.
 * ==========================================================================*/
export class RenderSettings {
    constructor(private readonly settings: VisualSettings) {}

    // ---- margins ---------------------------------------------------------
    get marginTop(): number { return this.settings.margins.topMargin; }
    get marginRight(): number { return this.settings.margins.rightMargin; }
    get marginBottom(): number { return this.settings.margins.bottomMargin; }
    get marginLeft(): number { return this.settings.margins.leftMargin; }

    // ---- labels ----------------------------------------------------------
    get labelsShow(): boolean { return this.settings.LabelsFormatting.show; }
    get labelsFontSize(): number { return this.settings.LabelsFormatting.fontSize; }
    get labelsFontFamily(): string { return this.settings.LabelsFormatting.fontFamily; }
    get labelsFontColor(): string { return this.settings.LabelsFormatting.fontColor; }
    get labelsUseDefaultFontColor(): boolean { return this.settings.LabelsFormatting.useDefaultFontColor; }
    get labelsUseDefaultPositioning(): boolean { return this.settings.LabelsFormatting.useDefaultLabelPositioning; }
    get labelsHideZeroBlankValues(): boolean { return this.settings.LabelsFormatting.HideZeroBlankValues; }
    get labelsPosition(): string { return this.settings.LabelsFormatting.labelPosition; }
    get labelsPositionTotal(): string { return this.settings.LabelsFormatting.labelPositionTotal; }
    get labelsPositionFavourable(): string { return this.settings.LabelsFormatting.labelPositionFavourable; }
    get labelsPositionAdverse(): string { return this.settings.LabelsFormatting.labelPositionAdverse; }
    get labelsPositionOther(): string { return this.settings.LabelsFormatting.labelPositionOther; }
    get labelsSentimentFontColorTotal(): string { return this.settings.LabelsFormatting.sentimentFontColorTotal; }
    get labelsSentimentFontColorFavourable(): string { return this.settings.LabelsFormatting.sentimentFontColorFavourable; }
    get labelsSentimentFontColorAdverse(): string { return this.settings.LabelsFormatting.sentimentFontColorAdverse; }
    get labelsSentimentFontColorOther(): string { return this.settings.LabelsFormatting.sentimentFontColorOther; }

    // ---- x-axis ----------------------------------------------------------
    get xAxisShow(): boolean { return this.settings.xAxisFormatting.show; }
    get xAxisFitToWidth(): boolean { return this.settings.xAxisFormatting.fitToWidth; }
    get xAxisLabelWrapText(): boolean { return this.settings.xAxisFormatting.labelWrapText; }
    get xAxisBarWidth(): number { return this.settings.xAxisFormatting.barWidth; }
    get xAxisPadding(): number { return this.settings.xAxisFormatting.padding; }
    get xAxisShowGridLine(): boolean { return this.settings.xAxisFormatting.showGridLine; }
    get xAxisFontSize(): number { return this.settings.xAxisFormatting.fontSize; }
    get xAxisFontFamily(): string { return this.settings.xAxisFormatting.fontFamily; }
    get xAxisFontColor(): string { return this.settings.xAxisFormatting.fontColor; }
    get xAxisGridLineColor(): string { return this.settings.xAxisFormatting.gridLineColor; }
    /** Stroke width in the settings' own units, floored at 1 (matches valueFormatting.gridlineStrokeWidth). */
    get xGridlineStrokeWidth(): number { return Math.max(1, this.settings.xAxisFormatting.gridLineStrokeWidth); }

    // ---- y-axis ----------------------------------------------------------
    get yAxisShow(): boolean { return this.settings.yAxisFormatting.show; }
    get yAxisFontSize(): number { return this.settings.yAxisFormatting.fontSize; }
    get yAxisFontFamily(): string { return this.settings.yAxisFormatting.fontFamily; }
    get yAxisFontColor(): string { return this.settings.yAxisFormatting.fontColor; }
    get yAxisShowValues(): boolean { return this.settings.yAxisFormatting.showYAxisValues; }
    get yAxisShowGridLine(): boolean { return this.settings.yAxisFormatting.showGridLine; }
    get yAxisGridLineColor(): string { return this.settings.yAxisFormatting.gridLineColor; }
    /** Stroke width in the settings' own units, floored at 1 (matches valueFormatting.gridlineStrokeWidth). */
    get yGridlineStrokeWidth(): number { return Math.max(1, this.settings.yAxisFormatting.gridLineStrokeWidth); }
    get yAxisDataPointOption(): string { return this.settings.yAxisFormatting.YAxisDataPointOption; }
    get yAxisValueFormatOption(): string { return this.settings.yAxisFormatting.YAxisValueFormatOption; }
    get yAxisDecimalPlaces(): number { return this.settings.yAxisFormatting.decimalPlaces; }
    get yAxisShowZeroGridLine(): boolean { return this.settings.yAxisFormatting.showZeroAxisGridLine; }
    get yAxisZeroLineColor(): string { return this.settings.yAxisFormatting.zeroLineColor; }
    get yAxisZeroLineStrokeWidth(): number { return this.settings.yAxisFormatting.zeroLineStrokeWidth; }
    get yAxisJoinBars(): boolean { return this.settings.yAxisFormatting.joinBars; }
    get yAxisJoinBarsColor(): string { return this.settings.yAxisFormatting.joinBarsColor; }
    get yAxisJoinBarsStrokeWidth(): number { return this.settings.yAxisFormatting.joinBarsStrokeWidth; }

    // ---- chart orientation ----------------------------------------------
    get useSentimentFeatures(): boolean { return this.settings.chartOrientation.useSentimentFeatures; }
    get limitBreakdown(): boolean { return this.settings.chartOrientation.limitBreakdown; }
    get maxBreakdown(): number { return this.settings.chartOrientation.maxBreakdown; }
    get sortData(): number { return this.settings.chartOrientation.sortData; }

    // ---- define pillars --------------------------------------------------
    get showTotalPillar(): boolean { return this.settings.definePillars.Totalpillar; }

    // ---- sentiment colors -----------------------------------------------
    get sentimentColorTotal(): string { return this.settings.sentimentColor.sentimentColorTotal; }
    get sentimentColorFavourable(): string { return this.settings.sentimentColor.sentimentColorFavourable; }
    get sentimentColorAdverse(): string { return this.settings.sentimentColor.sentimentColorAdverse; }
    get sentimentColorOther(): string { return this.settings.sentimentColor.sentimentColorOther; }

    // ---- legend ----------------------------------------------------------
    get legendShow(): boolean { return this.settings.Legend.show; }
    get legendFontSize(): number { return this.settings.Legend.fontSize; }
    get legendFontFamily(): string { return this.settings.Legend.fontFamily; }
    get legendFontColor(): string { return this.settings.Legend.fontColor; }
    get legendTextFavourable(): string { return this.settings.Legend.textFavourable; }
    get legendTextAdverse(): string { return this.settings.Legend.textAdverse; }
}
