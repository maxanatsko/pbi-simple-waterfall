import { describe, it, expect } from "vitest";
import { pickDisplayUnit, resolveFormat, gridlineStrokeWidth, ValueFormatter } from "../src/valueFormatting";

describe("pickDisplayUnit", () => {
    it("Auto scales by magnitude and never abbreviates percentages", () => {
        expect(pickDisplayUnit(2_000_000_000, "Auto", false)).toBe(1e9);
        expect(pickDisplayUnit(5_000_000, "Auto", false)).toBe(1e6);
        expect(pickDisplayUnit(4_000, "Auto", false)).toBe(1e3);
        expect(pickDisplayUnit(400, "Auto", false)).toBe(0);
        expect(pickDisplayUnit(2_000_000_000, "Auto", true)).toBe(0);
    });

    it("explicit units are fixed but suppressed for percentages", () => {
        expect(pickDisplayUnit(1, "Thousands", false)).toBe(1e3);
        expect(pickDisplayUnit(1, "Millions", false)).toBe(1e6);
        expect(pickDisplayUnit(1, "Billions", false)).toBe(1e9);
        expect(pickDisplayUnit(1, "Millions", true)).toBe(0);
        expect(pickDisplayUnit(1, "None", false)).toBe(0);
    });
});

describe("resolveFormat", () => {
    it("prefers a per-cell dynamic format string over the static measure format", () => {
        const cell = { objects: { general: { formatString: "0.0%" } } };
        expect(resolveFormat(cell, "#,0")).toBe("0.0%");
    });
    it("falls back to the static format, then to empty string", () => {
        expect(resolveFormat({}, "#,0")).toBe("#,0");
        expect(resolveFormat(null, undefined)).toBe("");
    });
});

describe("gridlineStrokeWidth", () => {
    it("clamps to a minimum of 1 for each axis", () => {
        const settings: any = {
            xAxisFormatting: { gridLineStrokeWidth: 0 },
            yAxisFormatting: { gridLineStrokeWidth: 4 },
        };
        expect(gridlineStrokeWidth(settings, "x")).toBe(1);
        expect(gridlineStrokeWidth(settings, "y")).toBe(4);
    });
});

describe("ValueFormatter", () => {
    const fmt = new ValueFormatter({ locale: "en-US", labelValueFormat: "Auto", labelDecimals: 0 });

    it("leaves a percentage format un-abbreviated", () => {
        expect(fmt.value(0.1234, "0.0%")).toBe("12.3%");
    });

    it("category returns (blank) for null", () => {
        expect(fmt.category(null, {}, "")).toBe("(blank)");
    });
});
