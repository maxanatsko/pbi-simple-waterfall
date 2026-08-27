import { describe, it, expect } from "vitest";
import powerbi from "powerbi-visuals-api";
import { Visual } from "../src/visual";
import {
    VisualBuilderBase,
    MatrixDataViewBuilder,
} from "powerbi-visuals-utils-testutils";
import { DataTable } from "powerbi-visuals-utils-testutils/lib/dataViewBuilder/matrixBuilder";

class VisualBuilder extends VisualBuilderBase<Visual> {
    constructor(width = 800, height = 600) {
        super(width, height);
    }
    protected build(options: powerbi.extensibility.visual.VisualConstructorOptions): Visual {
        return new Visual(options);
    }
}

function buildDataView(orientation: "Vertical" | "Horizontal"): powerbi.DataView {
    const table = new DataTable([
        ["Category", "Value"],
        ["Start", 100],
        ["Increase", 30],
        ["Decrease", -20],
        ["Increase2", 10],
        ["End", 120],
    ]);
    const builder = new MatrixDataViewBuilder(table);
    builder.withRowGroups([
        {
            columns: [
                {
                    metadata: {
                        name: "Category",
                        displayName: "Category",
                        type: { text: true },
                        format: "",
                    },
                    role: "Category",
                    queryName: "Table.Category",
                },
            ],
        },
    ]);
    builder.withValues([
        {
            metadata: {
                name: "Value",
                displayName: "Value",
                type: { numeric: true },
                format: "",
            },
            role: "Y",
            queryName: "Table.Value",
        },
    ]);
    const dataView = builder.build();
    (dataView.metadata as any).objects = {
        chartOrientation: { orientation },
    };
    return dataView;
}

function render(orientation: "Vertical" | "Horizontal") {
    const builder = new VisualBuilder(800, 600);
    builder.init();
    const dataView = buildDataView(orientation);
    builder.update(dataView);
    return builder;
}

function counts(root: Document | Element) {
    return {
        bars: root.querySelectorAll(".myBars rect").length,
        labels: root.querySelectorAll(".myBarLabels text").length,
        categoryTicks: root.querySelectorAll(".xAxisParentGroup .tick").length,
        valueTicks: root.querySelectorAll(".yAxisParentGroup .tick").length,
    };
}

describe("waterfall renders both orientations with structural symmetry", () => {
    for (const orientation of ["Vertical", "Horizontal"] as const) {
        it(`renders ${orientation} without throwing and produces bars, labels and axes`, () => {
            const builder = render(orientation);
            const root = builder.element;
            const c = counts(root);
            expect(c.bars).toBeGreaterThan(0);
            expect(c.labels).toBeGreaterThan(0);
            expect(c.categoryTicks).toBeGreaterThan(0);
            expect(c.valueTicks).toBeGreaterThan(0);
            builder.destroy();
        });
    }

    it("produces identical element counts for both orientations", () => {
        const v = render("Vertical");
        const h = render("Horizontal");
        const cv = counts(v.element);
        const ch = counts(h.element);
        expect(ch.bars).toBe(cv.bars);
        expect(ch.categoryTicks).toBe(cv.categoryTicks);
        expect(ch.valueTicks).toBe(cv.valueTicks);
        v.destroy();
        h.destroy();
    });
});
