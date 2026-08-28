import powerbi from "powerbi-visuals-api";
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ISelectionId = powerbi.visuals.ISelectionId;
import { BarChartDataPoint } from "./dataPoint";

/** Tooltip rows for a bar / data label: one row for a pillar or a single-measure
 *  step, two rows when a step carries a second measure value. */
export function buildValueTooltip(d: BarChartDataPoint): VisualTooltipDataItem[] {
    let tooltip: any[] = [];
    if (d.isPillar == 1) {
        tooltip = [{
            displayName: d.toolTipDisplayValue1,
            value: d.toolTipValue1Formatted
        }];
    } else {
        if (d.toolTipDisplayValue2 == null) {
            tooltip = [{
                displayName: d.toolTipDisplayValue1,
                value: d.toolTipValue1Formatted
            }];
        } else {
            tooltip = [{
                displayName: d.toolTipDisplayValue1,
                value: d.toolTipValue1Formatted,
            }, {
                displayName: d.toolTipDisplayValue2,
                value: d.toolTipValue2Formatted
            }];
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
