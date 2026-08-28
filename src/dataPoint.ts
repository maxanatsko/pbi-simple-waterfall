import powerbi from "powerbi-visuals-api";
import ISelectionId = powerbi.visuals.ISelectionId;

/** One rendered bar of the waterfall: a breakdown step or a pillar/total.
 *  Produced by the data converters (see waterfallData.ts), consumed by the
 *  renderer. A wide flat shape by design — the converters fill what they need
 *  and the renderer / tooltips read fields straight off it. */
export interface BarChartDataPoint {
    value: number;
    numberFormat: string;
    isPillar: number;
    category: string;
    displayName: string;
    selectionId: ISelectionId | null;
    childrenCount: number;
    sortOrderIndex: number;
    sortGroupIndex: number;
    sortWithinGroupIndex: number;
    customBarColor: string;
    customFontColor: string;
    customLabelPositioning: string;
    toolTipValue1Formatted: string;
    toolTipDisplayValue1: string;
    toolTipValue2Formatted?: string;
    toolTipDisplayValue2?: string | null;
    Measure1Value?: number | null;
    Measure2Value?: number | null;
    showbreakdownstep?: boolean;
    orderIndex?: number;
    xAxisFormat?: string;
    type?: any;
    /** Running cumulative total up to and including this bar, pre-formatted.
     *  Set for step bars; left undefined for pillars (the pillar value is the
     *  total already). Rendered as an extra tooltip row. */
    cumulativeFormatted?: string;
    /** Values from the "Tooltips" field well for this bar's category, in field
     *  order, each `{ displayName, value }` pre-formatted. Appended to the
     *  hover tooltip. */
    tooltipMeasures?: { displayName: string; value: string }[];
}

/** Build a BarChartDataPoint with safe defaults; converters override per-point fields. */
export function createBarChartDataPoint(): BarChartDataPoint {
    return {
        value: 0,
        numberFormat: "",
        isPillar: 0,
        category: "",
        displayName: "",
        selectionId: null,
        childrenCount: 0,
        sortOrderIndex: 0,
        sortGroupIndex: 0,
        sortWithinGroupIndex: 0,
        customBarColor: "",
        customFontColor: "",
        customLabelPositioning: "",
        toolTipValue1Formatted: "",
        toolTipDisplayValue1: "",
    };
}
