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

describe("drillable converter sort order is precision-safe", () => {
    const measureCount = 5;
    const leafCount = 300;
    const measures = Array.from({ length: measureCount }, (_, i) => `M${i}`);
    const leaves = Array.from({ length: leafCount }, (_, i) => `L${i}`);

    const table = new DataTable([
        ["Region", "Product", ...measures],
        ...[..."NS"].flatMap(r =>
            leaves.map((l, i) => [r, l, ...measures.map((_, mi) => ((mi + 1) * (i + 1)) % 97)])
        ),
    ]);

    const barDataPoints = (sortData = "1") => {
        const dv = new MatrixDataViewBuilder(table)
            .withRowGroups([{ columns: [cat("Region")] }, { columns: [cat("Product")] }])
            .withValues(measures.map(measure))
            .build();
        (dv.metadata as any).objects = {
            chartOrientation: { orientation: "Vertical" },
            sortData: { sortData },
        };
        const root = render(dv);
        return Array.from(root.querySelectorAll<SVGElement>(".myBars rect")).map(
            (el) => (el as any).__data__ as {
                sortGroupIndex: number;
                sortWithinGroupIndex: number;
                isPillar: number;
            }
        );
    };

    const measureOf = (p: { sortGroupIndex: number }) => Math.floor(p.sortGroupIndex / 2);

    it("renders every pillar and step", () => {
        // 2 regions x leafCount leaves; pillars: one per measure;
        // steps: one per leaf per measure gap (measureCount-1)
        const leafTotal = 2 * leafCount;
        const expected = measureCount + leafTotal * (measureCount - 1);
        expect(barDataPoints().length).toBe(expected);
    });

    it("orders bars by the [groupIndex, withinGroupIndex] tuple (no float packing collapse)", () => {
        const pts = barDataPoints();
        for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1];
            const cur = pts[i];
            const groupOk = cur.sortGroupIndex > prev.sortGroupIndex ||
                (cur.sortGroupIndex === prev.sortGroupIndex &&
                    cur.sortWithinGroupIndex >= prev.sortWithinGroupIndex);
            expect(groupOk).toBe(true);
        }
    });

    it("places each measure's pillar before its step bars", () => {
        const pts = barDataPoints();
        // pillar (sortGroupIndex 2m) must precede every step (sortGroupIndex 2m+1) of the same measure
        const firstSeenStep = new Map<number, number>();
        pts.forEach((p, i) => {
            if (p.isPillar !== 1) firstSeenStep.set(measureOf(p), i);
        });
        pts.forEach((p, i) => {
            if (p.isPillar === 1) {
                const m = measureOf(p);
                const stepIdx = firstSeenStep.get(m);
                if (stepIdx !== undefined) {
                    expect(stepIdx).toBeGreaterThan(i);
                }
            }
        });
    });

    it("keeps each measure's pillar first under value-sort (no float-packing collapse)", () => {
        // sortData 2 = descending: steps re-order by value, but the pillar of a
        // measure must still lead its measure block.
        const pts = barDataPoints("2");
        const seenPillar = new Map<number, boolean>();
        pts.forEach((p) => {
            const m = measureOf(p);
            if (p.isPillar === 1) {
                seenPillar.set(m, true);
            } else {
                expect(seenPillar.get(m)).toBe(true);
            }
        });
    });

    it("exercises the buildDrillable value-sort path at a single row level (sortData 2/3)", () => {
        // With one row level, buildDrillable routes through sortVisualData's
        // value-sort branch. Pillars must still lead their measure's steps.
        const singleTable = new DataTable([
            ["Region", "Plan", "Actual"],
            ["North", 10, 14],
            ["South", 20, 18],
        ]);
        const ptsFor = (sortData: string) => {
            const dv = new MatrixDataViewBuilder(singleTable)
                .withRowGroups([{ columns: [cat("Region")] }])
                .withValues([measure("Plan"), measure("Actual")])
                .build();
            (dv.metadata as any).objects = {
                chartOrientation: { orientation: "Vertical" },
                sortData: { sortData },
            };
            const root = render(dv);
            return Array.from(root.querySelectorAll<SVGElement>(".myBars rect")).map(
                (el) => (el as any).__data__ as { sortGroupIndex: number; isPillar: number }
            );
        };
        for (const sd of ["2", "3"]) {
            const pts = ptsFor(sd);
            const seenPillar = new Map<number, boolean>();
            pts.forEach((p) => {
                const m = Math.floor(p.sortGroupIndex / 2);
                if (p.isPillar === 1) {
                    seenPillar.set(m, true);
                } else {
                    expect(seenPillar.get(m)).toBe(true);
                }
            });
        }
    });
});
