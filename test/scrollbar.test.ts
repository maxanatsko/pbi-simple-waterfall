import { describe, it, expect } from "vitest";
import powerbi from "powerbi-visuals-api";
import { Visual } from "../src/visual";
import {
    VisualBuilderBase,
    MatrixDataViewBuilder,
} from "powerbi-visuals-utils-testutils";
import { DataTable } from "powerbi-visuals-utils-testutils/lib/dataViewBuilder/matrixBuilder";

class VisualBuilder extends VisualBuilderBase<Visual> {
    constructor(width = 500, height = 400) {
        super(width, height);
    }
    protected build(options: powerbi.extensibility.visual.VisualConstructorOptions): Visual {
        return new Visual(options);
    }
}

function dataView(orientation: "Vertical" | "Horizontal"): powerbi.DataView {
    const table = new DataTable([
        ["Category", "Value"],
        ["Start", 100],
        ["A", 20],
        ["B", -15],
        ["C", 25],
        ["D", -10],
        ["End", 120],
    ]);
    const dv = new MatrixDataViewBuilder(table)
        .withRowGroups([{
            columns: [{
                metadata: { name: "Category", displayName: "Category", type: { text: true }, format: "" },
                role: "Category",
                queryName: "Table.Category",
            }],
        }])
        .withValues([{
            metadata: { name: "Value", displayName: "Value", type: { numeric: true }, format: "" },
            role: "Y",
            queryName: "Table.Value",
        }])
        .build();
    // fitToWidth off + a bar width wider than the natural step forces the
    // scrollbar branch of checkBarWidth().
    (dv.metadata as any).objects = {
        chartOrientation: { orientation },
        xAxisFormatting: { fitToWidth: false, barWidth: 300 },
    };
    return dv;
}

function render(orientation: "Vertical" | "Horizontal") {
    const b = new VisualBuilder();
    b.init();
    b.update(dataView(orientation));
    return b.element;
}

describe("scrollbar branch renders", () => {
    for (const orientation of ["Vertical", "Horizontal"] as const) {
        it(`${orientation}: still draws bars and adds a scrollbar track`, () => {
            const root = render(orientation);
            expect(root.querySelectorAll(".myBars rect").length).toBeGreaterThan(0);
            // the scrollbar track rect is filled #e1e1e1
            expect(root.querySelectorAll("rect[fill='#e1e1e1']").length).toBeGreaterThan(0);
        });
    }
});
