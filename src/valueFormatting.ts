import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { VisualSettings } from "./settings";
import { BarChartDataPoint } from "./dataPoint";

/** Minimum stroke width (in the settings' own units) for an axis gridline. */
export function gridlineStrokeWidth(settings: VisualSettings, axis: "x" | "y"): number {
    const fmt = axis === "x" ? settings.xAxisFormatting : settings.yAxisFormatting;
    return Math.max(1, fmt.gridLineStrokeWidth);
}

// Resolve the effective format string for a single matrix value cell.
// A DAX dynamic format string is delivered per cell on
// `nodeValue.objects.general.formatString`; `valueSources[i].format` is only
// the measure's static model format and is empty for a dynamic-format measure.
// Requires the `general.formatString` object in capabilities.json and apiVersion >= 4.2.
export function resolveFormat(nodeValue: any, staticFormat: string | undefined): string {
    const dynamic = nodeValue
        && nodeValue.objects
        && nodeValue.objects.general
        && nodeValue.objects.general.formatString;
    return (typeof dynamic === "string" && dynamic.length > 0) ? dynamic : (staticFormat ?? "");
}

// Pick the display-unit scale factor for a value.
//  - The format string is kept on "Auto" too, so currency / dynamic-format symbols
//    survive display-unit scaling. Percentage formats are never abbreviated.
export function pickDisplayUnit(testValue: number, option: string, isPercent: boolean): number {
    switch (option) {
        case "Auto":
            if (isPercent) {
                return 0;
            } else if (testValue >= 1e9) {
                return 1e9;
            } else if (testValue >= 1e6) {
                return 1e6;
            } else if (testValue >= 1e3) {
                return 1e3;
            }
            return 0;
        case "Thousands": return isPercent ? 0 : 1e3;
        case "Millions": return isPercent ? 0 : 1e6;
        case "Billions": return isPercent ? 0 : 1e9;
        default: return 0; // "None"
    }
}

/** Y-axis (value/cross axis) range context needed to format a tick. */
export interface YAxisRange {
    min: number;
    max: number;
    primaryFormat: string | undefined;
    option: string;
    decimals: number;
}

/** Locale-aware value / category formatting for data labels, tooltips and axes.
 *  Built once per `update()` from the label-formatting settings; the y-axis
 *  method additionally takes the value range, which is only known mid-render. */
export class ValueFormatter {
    private readonly locale: string;
    private readonly labelValueFormat: string;
    private readonly labelDecimals: number;

    constructor(cfg: { locale: string; labelValueFormat: string; labelDecimals: number }) {
        this.locale = cfg.locale;
        this.labelValueFormat = cfg.labelValueFormat;
        this.labelDecimals = cfg.labelDecimals;
    }

    /** Formatted data-label / tooltip value for a datapoint. */
    public label(d: BarChartDataPoint): string {
        return this.withUnits(d.value, d.numberFormat, this.labelValueFormat, this.labelDecimals);
    }

    /** Formatted value with the label display-unit / precision rules applied. */
    public value(value: any, numberFormat: any): string {
        return this.withUnits(value, numberFormat, this.labelValueFormat, this.labelDecimals);
    }

    /** Value-axis tick label. */
    public yAxis(d: any, range: YAxisRange): string {
        const isPercent = typeof range.primaryFormat === "string" && range.primaryFormat.indexOf("%") >= 0;
        const span = Math.max(Math.abs(range.min), Math.abs(range.max));
        const displayValue = pickDisplayUnit(span, range.option, isPercent);
        return this.create(range.primaryFormat, displayValue, range.decimals).format(d);
    }

    /** Category-axis label; `(blank)` for null, datetime routed through the formatter. */
    public category(value: any, type: any, format: any): any {
        const formatter = valueFormatter.create({ cultureSelector: this.locale, format: format });
        let formattedValue = value;
        if (value == null) {
            formattedValue = "(blank)";
        }
        if (type["dateTime"]) {
            const currDate = new Date(formattedValue);
            formattedValue = formatter.format(currDate);
        }
        return formattedValue;
    }

    // Shared value formatter for data labels / tooltips.
    //  - `precision` (the "Value decimal places" control) is forwarded only when > 0,
    //    so 0 keeps the format string's own decimals and a positive value overrides them.
    private create(format: string | undefined, displayValue: number, precision: number) {
        return valueFormatter.create({
            cultureSelector: this.locale,
            format: format,
            value: displayValue,
            precision: precision > 0 ? precision : undefined
        });
    }

    private withUnits(value: any, format: string, valueFormat: string, precision: number): string {
        const isPercent = typeof format === "string" && format.indexOf("%") >= 0;
        const displayValue = pickDisplayUnit(Math.abs(value), valueFormat, isPercent);
        return this.create(format, displayValue, precision).format(value);
    }
}
