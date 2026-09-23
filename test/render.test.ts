import { describe, it, expect, vi } from "vitest";
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

/** With a negative minimum, Horizontal keeps two tick-steps of head-room below
 *  it (restored per a Codex review comment on PR #8) while Vertical keeps one
 *  -- the latter has `applyPixelHeadroom()` topping it back up afterwards if a
 *  single step falls short, but Horizontal has no such follow-up pass, and
 *  that head-room is also where a negative bar's "Outside end" label sits
 *  before `labelFit` prunes anything crossing x=0. Each orientation's value
 *  axis is rendered twice (`svgYAxis` + the scrollable copy), so the one extra
 *  padding tick shows up twice in a whole-root query. */
function negativeMinDataView(orientation: "Vertical" | "Horizontal"): powerbi.DataView {
    const table = new DataTable([
        ["Category", "Value"],
        ["Start", 100],
        ["Drop", -140],
        ["Recover", 60],
        ["End", 20],
    ]);
    const builder = new MatrixDataViewBuilder(table);
    builder.withRowGroups([
        {
            columns: [
                {
                    metadata: { name: "Category", displayName: "Category", type: { text: true }, format: "" },
                    role: "Category",
                    queryName: "Table.Category",
                },
            ],
        },
    ]);
    builder.withValues([
        {
            metadata: { name: "Value", displayName: "Value", type: { numeric: true }, format: "" },
            role: "Y",
            queryName: "Table.Value",
        },
    ]);
    const dataView = builder.build();
    (dataView.metadata as any).objects = { chartOrientation: { orientation } };
    return dataView;
}

describe("negative-minimum head-room differs by orientation", () => {
    it("Horizontal renders two more value-axis ticks than Vertical for the same negative-minimum data", () => {
        const v = new VisualBuilder(800, 600);
        v.init();
        v.update(negativeMinDataView("Vertical"));
        const h = new VisualBuilder(800, 600);
        h.init();
        h.update(negativeMinDataView("Horizontal"));

        const verticalTicks = counts(v.element).valueTicks;
        const horizontalTicks = counts(h.element).valueTicks;
        expect(verticalTicks).toBeGreaterThan(0);
        expect(horizontalTicks).toBe(verticalTicks + 2);
        v.destroy();
        h.destroy();
    });
});

describe("landing page", () => {
    function emptyDataView(): powerbi.DataView {
        return { metadata: { columns: [] } } as powerbi.DataView;
    }

    function landing(root: Element): Element | null {
        return root.querySelector(".landingPage");
    }

    it("shows the landing page and no chart when there is no data", () => {
        const builder = new VisualBuilder(800, 600);
        builder.init();
        const finished = vi.spyOn(builder.visualHost.eventService, "renderingFinished");
        const failed = vi.spyOn(builder.visualHost.eventService, "renderingFailed");
        builder.update(emptyDataView());
        expect(landing(builder.element)?.textContent).toContain("Add a measure to Values");
        expect(builder.element.querySelectorAll("svg").length).toBe(0);
        expect(finished).toHaveBeenCalled();
        expect(failed).not.toHaveBeenCalled();
        builder.destroy();
    });

    it("hides the landing page once there is data, and brings it back without leftover bars", () => {
        const builder = new VisualBuilder(800, 600);
        builder.init();
        builder.update(emptyDataView());
        builder.update(buildDataView("Vertical"));
        expect(landing(builder.element)).toBeNull();
        expect(counts(builder.element).bars).toBeGreaterThan(0);

        builder.update(emptyDataView());
        expect(landing(builder.element)).not.toBeNull();
        expect(builder.element.querySelectorAll("svg").length).toBe(0);
        builder.destroy();
    });

    it("builds a format pane model while the landing page is shown", () => {
        const builder = new VisualBuilder(800, 600);
        builder.init();
        builder.update(emptyDataView());
        const model = (builder as any).visual.getFormattingModel();
        expect(model.cards.length).toBeGreaterThan(0);
        builder.destroy();
    });
});
