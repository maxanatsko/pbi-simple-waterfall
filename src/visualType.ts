import { WaterfallDataBuilder } from "./waterfallData";
import { BarChartDataPoint } from "./dataPoint";

/** The four shapes the matrix dataView can take, discriminated by `kind`.
 *  One shared `VisualMode` instance per kind carries the derived booleans the
 *  renderer / formatting model branch on, plus the `build()` dispatch that
 *  replaces the old `if/else` ladder in `Visual.update()`. */
export type VisualKind = "static" | "staticCategory" | "drillableCategory" | "drillable";

export interface VisualMode {
    readonly kind: VisualKind;
    /** Bars + axis labels accept clicks (everything except "static"). */
    readonly isSelectable: boolean;
    /** Driven by matrix rows — a category axis is shown (everything except "static"). */
    readonly hasCategoryAxis: boolean;
    /** static || staticCategory. */
    readonly isStaticLike: boolean;
    readonly isStatic: boolean;
    readonly isStaticCategory: boolean;
    readonly isDrillableCategory: boolean;
    build(builder: WaterfallDataBuilder): BarChartDataPoint[][];
}

const makeMode = (kind: VisualKind): VisualMode => {
    const isStatic = kind === "static";
    const isStaticCategory = kind === "staticCategory";
    return {
        kind,
        isStatic,
        isStaticCategory,
        isStaticLike: isStatic || isStaticCategory,
        isSelectable: !isStatic,
        hasCategoryAxis: !isStatic,
        isDrillableCategory: kind === "drillableCategory",
        build(b: WaterfallDataBuilder): BarChartDataPoint[][] {
            switch (kind) {
                case "static":
                    return [b.buildStatic()];
                case "staticCategory":
                    return [b.buildStaticCategory()];
                case "drillableCategory":
                    return b.buildDrillableCategory();
                case "drillable":
                    return b.buildDrillable();
            }
        },
    };
};

const MODES: Record<VisualKind, VisualMode> = {
    static: makeMode("static"),
    staticCategory: makeMode("staticCategory"),
    drillableCategory: makeMode("drillableCategory"),
    drillable: makeMode("drillable"),
};

/** Look up a shared `VisualMode` by its `kind` (used by tests / callers that
 *  already know the kind). */
export function visualMode(kind: VisualKind): VisualMode {
    return MODES[kind];
}

/** Resolve the visual mode from the matrix shape — the single source of truth
 *  for "which of the four builders to use". */
export function resolveVisualMode(levels: number, sources: number): VisualMode {
    if (levels === 0) {
        return MODES.static;
    }
    if (levels === 1 && sources === 1) {
        return MODES.staticCategory;
    }
    if (sources === 1) {
        return MODES.drillableCategory;
    }
    return MODES.drillable;
}
