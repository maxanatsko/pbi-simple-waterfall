import { describe, it, expect, beforeAll } from "vitest";
import * as d3 from "d3";
import { ChartRenderer } from "../src/chartRenderer";

/** happy-dom has no SVG text metrics, so give every element a deterministic
 *  monospace-ish measure: CHAR_PX per character of its own text content. */
const CHAR_PX = 7;

beforeAll(() => {
    // happy-dom defines a stub on the concrete text/tspan prototypes, so those
    // are the ones that have to be replaced.
    const measure = function (this: Element) {
        return (this.textContent ?? "").length * CHAR_PX;
    };
    for (const name of ["SVGTextElement", "SVGTSpanElement", "SVGElement"]) {
        const ctor = (globalThis as any)[name];
        if (ctor) {
            ctor.prototype.getComputedTextLength = measure;
        }
    }
});

/** `wrapLabels` never touches the instance, so it can be driven directly. */
const wrapLabels: (text: any, standardwidth: number, opts: any) => void =
    (ChartRenderer.prototype as any).wrapLabels;

function wrap(label: string, cellPx: number): string[] {
    d3.select(document.body).selectAll("svg").remove();
    const text = d3.select(document.body)
        .append("svg")
        .append("text")
        .attr("y", 0)
        .attr("dy", "0.71em")
        .datum({ childrenCount: 1 } as any)
        .text(label);

    wrapLabels(text, cellPx, { splitToken: "whitespace", layout: "vertical" });

    return text.selectAll("tspan").nodes().map((n: any) => n.textContent as string);
}

describe("category-axis label wrapping (Wrap text on)", () => {
    // A word too wide for the cell is truncated character by character. The
    // truncation used to be written to the rendered <tspan> but not to the
    // `line` array behind it, so appending the next word restored the full-width
    // word and that line spilled across the neighbouring categories.
    it("never emits a line wider than the cell, even after a truncated word", () => {
        const cellPx = 6 * CHAR_PX; // fits 6 characters
        for (const label of [
            "Touch Screen Phones",
            "Smart phones & PDAs",
            "Cameras & Camcorders Accessories",
            "Bluetooth Headphones",
            "Home & Office Phones",
        ]) {
            const lines = wrap(label, cellPx);
            expect(lines.length).toBeGreaterThan(0);
            for (const line of lines) {
                expect(line.length * CHAR_PX, `"${line}" from "${label}"`).toBeLessThanOrEqual(cellPx);
            }
        }
    });

    it("leaves labels that already fit untouched", () => {
        expect(wrap("Fans", 20 * CHAR_PX)).toEqual(["Fans"]);
    });

    it("keeps wrapping onto new lines rather than dropping the rest of the label", () => {
        // Every word survives in some (possibly truncated) form, in order.
        const lines = wrap("Touch Screen Phones", 6 * CHAR_PX);
        expect(lines.length).toBe(3);
        expect(lines[0]).toBe("Touch");
        expect(lines[1]).toBe("Screen");
        expect(lines[2]).toBe("Phones");
    });

    it("truncates a single word that cannot fit at all", () => {
        const lines = wrap("Refrigerators", 4 * CHAR_PX);
        expect(lines).toEqual(["Refr"]);
    });
});
