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
        // The testutils host mock defaults to `allowInteractions: false` (a
        // dashboard tile); these tests model a report, where it is true.
        (this.visualHost as any).hostCapabilities = { allowInteractions: true };
    }
    protected build(options: powerbi.extensibility.visual.VisualConstructorOptions): Visual {
        return new Visual(options);
    }
}

function buildDataView(): powerbi.DataView {
    const table = new DataTable([
        ["Category", "Value"],
        ["Start", 100],
        ["Increase", 30],
        ["Decrease", -20],
        ["End", 110],
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
    (dv.metadata as any).objects = { chartOrientation: { orientation: "Vertical" } };
    return dv;
}

function render() {
    const builder = new VisualBuilder();
    builder.init();
    builder.update(buildDataView());
    return builder;
}

function bars(root: Element): SVGElement[] {
    return Array.from(root.querySelectorAll(".myBars rect")) as SVGElement[];
}

describe("bar accessibility + selection", () => {
    it("gives the bar series a single roving tab stop", () => {
        const rects = bars(render().element);
        expect(rects.length).toBeGreaterThan(1);
        expect(rects[0].getAttribute("tabindex")).toBe("0");
        for (let i = 1; i < rects.length; i++) {
            expect(rects[i].getAttribute("tabindex")).toBe("-1");
        }
        expect(rects[0].getAttribute("role")).toBe("option");
        expect(rects[0].getAttribute("aria-label")).toContain("Start");
    });

    it("ArrowRight moves the roving tabindex forward", () => {
        const rects = bars(render().element);
        rects[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(rects[0].getAttribute("tabindex")).toBe("-1");
        expect(rects[1].getAttribute("tabindex")).toBe("0");
    });

    it("Home / End jump the roving tabindex to the ends", () => {
        const rects = bars(render().element);
        rects[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
        expect(rects[rects.length - 1].getAttribute("tabindex")).toBe("0");
        rects[rects.length - 1].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
        expect(rects[0].getAttribute("tabindex")).toBe("0");
    });

    it("clicking a bar drives selection opacity on the series", async () => {
        const rects = bars(render().element);
        rects[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise(r => setTimeout(r, 0));
        const opacities = rects.map(r => r.getAttribute("fill-opacity"));
        expect(opacities.some(o => o === "1")).toBe(true);
        expect(opacities.some(o => o === "0.5")).toBe(true);
    });

    // Regression: a background click registers selectionManager.registerOnSelectCallback.
    // The next Visual.update() discards the SVG and its ChartRenderer, so that callback
    // must sync the freshly drawn bars, not the detached ones from the retired renderer.
    it("host selection changes after a re-render sync the current bars", async () => {
        const builder = new VisualBuilder();
        builder.init();
        builder.update(buildDataView());

        const firstSvg = bars(builder.element)[0].closest("svg") as SVGElement;
        firstSvg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise(r => setTimeout(r, 0));

        // Rebuild — new ChartRenderer, new bar series.
        builder.update(buildDataView());
        const rects = bars(builder.element);
        expect(rects.length).toBeGreaterThan(1);
        expect(rects.every(r => r.getAttribute("fill-opacity") == null)).toBe(true);

        // Host-driven selection change (e.g. from another visual) fires the stored callback.
        const target = (rects[1] as any).__data__.selectionId;
        const selectionManager = builder.visualHost.createSelectionManager() as any;
        selectionManager.simutateSelection([target]);

        const opacities = rects.map(r => r.getAttribute("fill-opacity"));
        expect(opacities[1]).toBe("1");
        expect(opacities.filter(o => o === "0.5").length).toBe(rects.length - 1);
    });
});

describe("host allowInteractions", () => {
    function renderWithoutInteractions() {
        const builder = new VisualBuilder();
        (builder.visualHost as any).hostCapabilities = { allowInteractions: false };
        const selectionManager = builder.visualHost.createSelectionManager();
        const select = vi.spyOn(selectionManager, "select");
        builder.init();
        builder.update(buildDataView());
        return { builder, select };
    }

    it("does not select on click when the host disallows interactions", () => {
        const { builder, select } = renderWithoutInteractions();
        bars(builder.element)[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(select).not.toHaveBeenCalled();
    });

    it("does not select on Enter when the host disallows interactions", () => {
        const { builder, select } = renderWithoutInteractions();
        bars(builder.element)[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        expect(select).not.toHaveBeenCalled();
    });

    it("selects on click when the host allows interactions", () => {
        const builder = new VisualBuilder();
        const select = vi.spyOn(builder.visualHost.createSelectionManager(), "select");
        builder.init();
        builder.update(buildDataView());
        bars(builder.element)[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(select).toHaveBeenCalledTimes(1);
    });
});
