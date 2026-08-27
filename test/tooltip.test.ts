import { describe, it, expect } from "vitest";
import { buildValueTooltip, buildCategoryTooltip } from "../src/tooltip";
import { createBarChartDataPoint } from "../src/dataPoint";

function point(overrides: Partial<ReturnType<typeof createBarChartDataPoint>>) {
    return { ...createBarChartDataPoint(), ...overrides };
}

describe("buildValueTooltip", () => {
    it("returns one row for a pillar", () => {
        const rows = buildValueTooltip(point({
            isPillar: 1,
            toolTipDisplayValue1: "Total",
            toolTipValue1Formatted: "120",
            toolTipDisplayValue2: "ignored",
            toolTipValue2Formatted: "ignored",
        }));
        expect(rows).toEqual([{ displayName: "Total", value: "120" }]);
    });

    it("returns one row for a step with no second measure", () => {
        const rows = buildValueTooltip(point({
            isPillar: 0,
            toolTipDisplayValue1: "Increase",
            toolTipValue1Formatted: "30",
            toolTipDisplayValue2: null,
        }));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({ displayName: "Increase", value: "30" });
    });

    it("returns two rows for a step carrying a second measure", () => {
        const rows = buildValueTooltip(point({
            isPillar: 0,
            toolTipDisplayValue1: "M1 A",
            toolTipValue1Formatted: "10",
            toolTipDisplayValue2: "M2 A",
            toolTipValue2Formatted: "40",
        }));
        expect(rows).toEqual([
            { displayName: "M1 A", value: "10" },
            { displayName: "M2 A", value: "40" },
        ]);
    });
});

describe("buildCategoryTooltip", () => {
    it("returns a single row with the datapoint display name", () => {
        expect(buildCategoryTooltip(point({ displayName: "Region" }))).toEqual([
            { displayName: "Region" },
        ]);
    });
});
