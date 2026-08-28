import { describe, it, expect, vi } from "vitest";
import powerbi from "powerbi-visuals-api";
import { Visual } from "../src/visual";
import {
    VisualBuilderBase,
    MatrixDataViewBuilder,
} from "powerbi-visuals-utils-testutils";
import { DataTable } from "powerbi-visuals-utils-testutils/lib/dataViewBuilder/matrixBuilder";

class VisualBuilder extends VisualBuilderBase<Visual> {
    constructor(width = 900, height = 600) {
        super(width, height);
    }
    protected build(options: powerbi.extensibility.visual.VisualConstructorOptions): Visual {
        return new Visual(options);
    }
}

function cat(name: string) {
    return {
        metadata: { name, displayName: name, type: { text: true }, format: "" },
        role: "Category",
        queryName: `Table.${name}`,
    };
}
function measure(name: string) {
    return {
        metadata: { name, displayName: name, type: { numeric: true }, format: "#,0" },
        role: "Y",
        queryName: `Table.${name}`,
    };
}

/** Render `dataView` and fail loudly if the visual reported a rendering error
 *  (the mock event service is a no-op, so a spy is the only signal). */
function render(dataView: powerbi.DataView) {
    const builder = new VisualBuilder();
    builder.init();
    const failed = vi.spyOn(builder.visualHost.eventService, "renderingFailed");
    builder.update(dataView);
    expect(failed).not.toHaveBeenCalled();
    return builder.element;
}

function barCount(root: Document | Element) {
    return root.querySelectorAll(".myBars rect").length;
}
function categoryAxisGroups(root: Document | Element) {
    return root.querySelectorAll(".xAxisParentGroup .myXaxis").length;
}

// staticCategory (1 row level, 1 measure) is already covered end-to-end by
// render.test.ts. These lock the two multi-level converters that had no coverage.

describe("drillableCategory converter (2 row levels, 1 measure)", () => {
    it("renders one bar per leaf plus a total pillar, and stacked category axes", () => {
        const table = new DataTable([
            ["Region", "Product", "Sales"],
            ["North", "A", 10],
            ["North", "B", 20],
            ["South", "A", 30],
            ["South", "B", 15],
        ]);
        const dv = new MatrixDataViewBuilder(table)
            .withRowGroups([{ columns: [cat("Region")] }, { columns: [cat("Product")] }])
            .withValues([measure("Sales")])
            .build();
        (dv.metadata as any).objects = {
            chartOrientation: { orientation: "Vertical" },
            definePillars: { Totalpillar: true },
        };

        const root = render(dv);
        // 4 leaf steps + 1 total pillar
        expect(barCount(root)).toBe(5);
        // leaf axis + one parent (Region) axis
        expect(categoryAxisGroups(root)).toBeGreaterThanOrEqual(2);
    });
});

describe("drillable converter (2 row levels, 2 measures)", () => {
    const table = new DataTable([
        ["Region", "Product", "Plan", "Actual"],
        ["North", "A", 10, 14],
        ["North", "B", 20, 18],
        ["South", "A", 30, 33],
        ["South", "B", 15, 20],
    ]);
    const mk = (orientation: string) => {
        const dv = new MatrixDataViewBuilder(table)
            .withRowGroups([{ columns: [cat("Region")] }, { columns: [cat("Product")] }])
            .withValues([measure("Plan"), measure("Actual")])
            .build();
        (dv.metadata as any).objects = { chartOrientation: { orientation } };
        return barCount(render(dv));
    };

    it("renders a step bar per leaf per measure gap plus per-measure pillars", () => {
        // 4 leaves * 1 measure gap (Plan->Actual) = 4 steps, + 2 measure pillars
        expect(mk("Vertical")).toBe(6);
    });

    it("produces the same bar count in Horizontal orientation", () => {
        const h = mk("Horizontal");
        expect(h).toBe(6);
        expect(h).toBe(mk("Vertical"));
    });
});
