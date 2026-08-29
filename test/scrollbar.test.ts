import { describe, it, expect } from "vitest";
import powerbi from "powerbi-visuals-api";
import { Visual } from "../src/visual";
import {
    VisualBuilderBase,
    MatrixDataViewBuilder,
} from "powerbi-visuals-utils-testutils";
import { DataTable } from "powerbi-visuals-utils-testutils/lib/dataViewBuilder/matrixBuilder";
import { EDGE_LABEL_GUTTER_MIN_PX } from "../src/constants";

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

/** ~36 categories with "Fit to width" left at its default (true). The natural
 *  band step falls below MIN_BAND_STEP_PX, so the scrollbar must engage even
 *  though the user never turned "Fit to width" off. */
function crowdedDataView(orientation: "Vertical" | "Horizontal"): powerbi.DataView {
    const rows: (string | number)[][] = [["Category", "Value"], ["Start", 100]];
    for (let i = 0; i < 34; i++) {
        rows.push([`Step ${i}`, i % 2 === 0 ? 8 : -6]);
    }
    rows.push(["End", 120]);
    const dv = new MatrixDataViewBuilder(new DataTable(rows))
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
    (dv.metadata as any).objects = { chartOrientation: { orientation } };
    return dv;
}

describe("Fit to width: scrollbar engages below the legibility floor", () => {
    for (const orientation of ["Vertical", "Horizontal"] as const) {
        it(`${orientation}: crowded chart still scrolls with fitToWidth at its default`, () => {
            const b = new VisualBuilder(400, 300);
            b.init();
            b.update(crowdedDataView(orientation));
            const root = b.element;
            expect(root.querySelectorAll(".myBars rect").length).toBeGreaterThan(0);
            expect(root.querySelectorAll("rect[fill='#e1e1e1']").length).toBeGreaterThan(0);
            // the value scale must not have degenerated/inverted: every bar sits
            // at a finite, non-negative offset on its cross axis.
            const crossAttr = orientation === "Vertical" ? "y" : "x";
            root.querySelectorAll(".myBars rect").forEach((r) => {
                const v = parseFloat(r.getAttribute(crossAttr) || "NaN");
                expect(Number.isFinite(v)).toBe(true);
                expect(v).toBeGreaterThanOrEqual(-0.5);
            });
        });
    }
});

/** The bars fill the band range exactly, so without an end gutter the last bar
 *  (the cumulative total pillar) ends flush with the viewport's right edge at
 *  full-right scroll and its centre-anchored value label -- wider than the band
 *  -- is clipped away. The thumb/track ratio is the only observable handle on
 *  the scrollable span, so derive it back out: thumb = viewport^2 / span. */
describe("horizontal scroll reserves an end gutter past the last bar", () => {
    it("Vertical: the scrollable span runs past the last bar's right edge", () => {
        const b = new VisualBuilder(400, 300);
        b.init();
        b.update(crowdedDataView("Vertical"));
        const root = b.element;

        const track = root.querySelector("rect[fill='#e1e1e1']")!;
        const thumb = root.querySelector("rect[fill='#000']")!;
        const viewport = parseFloat(track.getAttribute("width")!);
        const thumbWidth = parseFloat(thumb.getAttribute("width")!);
        expect(thumbWidth).toBeGreaterThan(0);
        expect(thumbWidth).toBeLessThan(viewport);

        const scrollSpan = (viewport * viewport) / thumbWidth;
        let lastBarRight = 0;
        root.querySelectorAll(".myBars rect").forEach((r) => {
            lastBarRight = Math.max(
                lastBarRight,
                parseFloat(r.getAttribute("x")!) + parseFloat(r.getAttribute("width")!),
            );
        });
        expect(lastBarRight).toBeGreaterThan(0);
        expect(scrollSpan - lastBarRight).toBeGreaterThanOrEqual(EDGE_LABEL_GUTTER_MIN_PX - 1);
    });
});
