import powerbi from "powerbi-visuals-api";
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ISelectionId = powerbi.visuals.ISelectionId;
import { BarChartDataPoint } from "./dataPoint";

/** Tooltip rows for a bar / data label: the bar's own value (one row, or two
 *  when a step carries a second measure), then the running cumulative total,
 *  then any measures dropped into the "Tooltips" field well. */
export function buildValueTooltip(d: BarChartDataPoint): VisualTooltipDataItem[] {
    const tooltip: VisualTooltipDataItem[] = [{
        displayName: d.toolTipDisplayValue1,
        value: d.toolTipValue1Formatted,
    }];
    if (d.isPillar != 1 && d.toolTipDisplayValue2 != null) {
        tooltip.push({ displayName: d.toolTipDisplayValue2, value: d.toolTipValue2Formatted } as VisualTooltipDataItem);
    }
    if (d.cumulativeFormatted != null) {
        tooltip.push({ displayName: "Running total", value: d.cumulativeFormatted });
    }
    if (d.tooltipMeasures) {
        for (const m of d.tooltipMeasures) {
            tooltip.push({ displayName: m.displayName, value: m.value });
        }
    }
    return tooltip;
}

/** Tooltip row for a category-axis tick label. */
export function buildCategoryTooltip(d: BarChartDataPoint): VisualTooltipDataItem[] {
    return [{
        displayName: d.displayName,
    }] as any[];
}

export function tooltipSelectionId(d: BarChartDataPoint): ISelectionId {
    return d.selectionId as ISelectionId;
}
