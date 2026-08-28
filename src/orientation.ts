import * as d3 from "d3";
import { BAND_PADDING } from "./constants";

export type OrientationName = "Vertical" | "Horizontal";

/** Geometry + scale + layout config for one chart orientation.
 *  The Visual builds one of these per render and routes every draw call through
 *  it, so a single render path serves both orientations. Vertical semantics are
 *  preserved verbatim; horizontal is normalized to the same waterfall math
 *  (single forward cross scale, 0-anchored breakdown). */
export class Orientation {
    public readonly name: OrientationName;
    public readonly minValue: number;
    public readonly maxValue: number;
    public readonly innerWidth: number;
    public readonly innerHeight: number;
    public readonly xAxisPosition: number;
    public readonly scrollbarBreath: number;

    /** Value (cross) axis scale: maps data value -> pixel along the cross axis.
     *  Vertical: decreasing (value up = pixel up). Horizontal: increasing (value right = pixel right). */
    public readonly cross: d3.ScaleLinear<number, number>;

    /** Field on the Visual that holds the measured cross-axis extent (width for vertical, height for horizontal). */
    public readonly crossAxisExtentField: "yAxisWidth" | "yAxisHeightHorizontal";

    constructor(name: OrientationName, geo: {
        minValue: number; maxValue: number; innerWidth: number; innerHeight: number;
        xAxisPosition: number; scrollbarBreath: number;
    }) {
        this.name = name;
        this.minValue = geo.minValue;
        this.maxValue = geo.maxValue;
        this.innerWidth = geo.innerWidth;
        this.innerHeight = geo.innerHeight;
        this.xAxisPosition = geo.xAxisPosition;
        this.scrollbarBreath = geo.scrollbarBreath;

        if (name === "Vertical") {
            this.cross = d3.scaleLinear().domain([geo.minValue, geo.maxValue]).range([geo.innerHeight, 0]);
            this.crossAxisExtentField = "yAxisWidth";
        } else {
            this.cross = d3.scaleLinear().domain([geo.minValue, geo.maxValue]).range([0, geo.innerWidth + geo.xAxisPosition - geo.scrollbarBreath]);
            this.crossAxisExtentField = "yAxisHeightHorizontal";
        }
    }

    // ---- main (category) axis accessors -----------------------------------
    public get mainRange(): [number, number] {
        return this.name === "Vertical" ? [0, this.innerWidth] : [0, this.innerHeight];
    }
    public get mainPos(): "x" | "y" { return this.name === "Vertical" ? "x" : "y"; }
    public get mainSizeAttr(): "width" | "height" { return this.name === "Vertical" ? "width" : "height"; }
    public get crossPosAttr(): "y" | "x" { return this.name === "Vertical" ? "y" : "x"; }
    public get crossSizeAttr(): "height" | "width" { return this.name === "Vertical" ? "height" : "width"; }
    public get scrollOrient(): "x" | "y" { return this.name === "Vertical" ? "x" : "y"; }

    public mainBand(domain: string[]): d3.ScaleBand<string> {
        return d3.scaleBand().domain(domain).range(this.mainRange).padding(BAND_PADDING);
    }
    public mainAxis(scale: d3.ScaleBand<string>): d3.Axis<any> {
        const axis = this.name === "Vertical" ? d3.axisBottom(scale) : d3.axisLeft(scale);
        axis.tickSize(0);
        axis.tickSizeOuter(0);
        return axis;
    }

    // ---- value (cross) axis ------------------------------------------------
    public crossAxisGenerator(): d3.Axis<any> {
        return this.name === "Vertical"
            ? d3.axisLeft(this.cross)
            : d3.axisBottom(this.cross);
    }
    /** Extend value-axis gridlines across the plot area. */
    public valueAxisLineExtent(): { x2?: number; y2?: number } {
        return this.name === "Vertical" ? { x2: this.innerWidth } : { y2: -this.innerHeight };
    }

    // ---- cross-scale helpers ----------------------------------------------
    public crossZero(): number { return this.cross(0); }
    public crossPos(v: number): number { return this.cross(v); }
    public crossSize(v: number): number { return Math.abs(this.cross(0) - this.cross(v)); }

    /** Running cumulative *before* index i (standard waterfall running total). */
    private cumulativeBefore(i: number, data: any[]): number {
        let startingPointCumulative = 0;
        for (let index = 0; index < i; index++) {
            if (data[index].isPillar == 1 || index == 0) {
                startingPointCumulative = data[index].value;
            } else {
                startingPointCumulative += data[index].value;
            }
        }
        return startingPointCumulative;
    }

    /** 0-anchored breakdown offset (pixel distance from the zero baseline to the
     *  cumulative starting level). Shared by both orientations after normalization. */
    public breakdown(i: number, data: any[]): number {
        let cum = this.cumulativeBefore(i, data);
        if (data[i] && data[i].value < 0) {
            cum += Math.abs(data[i].value);
        }
        return this.cross(0) - this.cross(cum);
    }

    // ---- bar geometry -------------------------------------------------------
    public barCrossStart(d: any, i: number, data: any[]): number {
        if (this.name === "Vertical") {
            if ((d.isPillar == 1 || i == 0) && d.value < 0) {
                return this.maxValue >= 0 ? this.cross(0) : this.cross(this.maxValue);
            }
            return this.cross(d.value) - this.breakdown(i, data);
        }
        // horizontal: single forward cross scale, baseline at cross(0)
        const cum = this.cumulativeBefore(i, data);
        if (d.isPillar == 1 || i == 0) {
            return Math.min(this.cross(0), this.cross(d.value));
        }
        return Math.min(this.cross(cum), this.cross(cum + d.value));
    }

    public barCrossSize(d: any, i: number, data: any[]): number {
        if (this.name === "Vertical") {
            if (d.isPillar == 1 || i == 0) {
                if (d.value > 0) {
                    if (this.minValue < 0) {
                        return this.cross(0) - this.cross(d.value);
                    }
                    return this.cross(0) - this.cross(Math.abs(d.value) - this.minValue);
                }
                if (this.maxValue >= 0) {
                    return this.cross(d.value) - this.cross(0);
                }
                return this.cross(d.value) - this.cross(this.maxValue);
            }
            return this.cross(0) - this.cross(Math.abs(d.value));
        }
        // horizontal
        const cum = this.cumulativeBefore(i, data);
        if (d.isPillar == 1 || i == 0) {
            return Math.abs(this.cross(d.value) - this.cross(0));
        }
        return Math.abs(this.cross(cum + d.value) - this.cross(cum));
    }

    // ---- category gridlines (perpendicular to cross axis) ------------------
    public gridlineAttrs(catPos: number, extent: number): { x1: number; y1: number; x2: number; y2: number } {
        return this.name === "Vertical"
            ? { x1: catPos, y1: 0, x2: catPos, y2: extent }
            : { y1: catPos, x1: 0, y2: catPos, x2: extent };
    }
    public get xGridlineStrokeDivisor(): number { return this.name === "Vertical" ? 8 : 10; }

    // ---- category-axis group transform ------------------------------------
    public axisGroupTransform(baseAxis: boolean, index: number, xBaseScale: d3.ScaleBand<string>, myWidth: number, axisEdge: number): string {
        if (this.name === "Vertical") {
            if (baseAxis) {
                return `translate(0,${axisEdge})`;
            }
            if (index == 0) {
                return `translate(${(xBaseScale.step() * xBaseScale.padding() * 0.5)},${axisEdge})`;
            }
            return `translate(${(xBaseScale.bandwidth() + (xBaseScale.step() * xBaseScale.padding() * 1.5)) + myWidth * (index - 1)},${axisEdge})`;
        }
        if (baseAxis) {
            return `translate(${axisEdge}, 0)`;
        }
        if (index == 0) {
            return `translate(${axisEdge - 5}, ${(xBaseScale.step() * xBaseScale.padding() * 0.5)})`;
        }
        return `translate(${axisEdge - 5}, ${(xBaseScale.bandwidth() + (xBaseScale.step() * xBaseScale.padding() * 1.5)) + myWidth * (index - 1)})`;
    }

    /** Transform applied to a base-axis tick label. */
    public baseTickLabelTransform(padding: number): string {
        return this.name === "Vertical" ? `translate(0,${padding})` : `translate(${-padding},0)`;
    }
    /** Transform applied to a secondary-axis tick label (offset along the cross axis). */
    public secondaryTickLabelTransform(xAxisrange: any[], i: number, padding: number): string {
        return this.name === "Vertical"
            ? `translate(${(xAxisrange[i + 1] - xAxisrange[i]) / 2},${padding})`
            : `translate(${-padding},${(xAxisrange[i + 1] - xAxisrange[i]) / 2})`;
    }

    /** Which wrap helper to use for category labels. */
    public get labelWrap(): "labelWrapText" | "wrapHorizontal" { return this.name === "Vertical" ? "labelWrapText" : "wrapHorizontal"; }

    /** Remove overlapping / out-of-bounds labels so they don't collide. */
    public labelFit(text: any, edge: number): void {
        if (this.name === "Vertical") {
            text.each((d: any, i: number, nodes: any) => {
                if (i != 0) {
                    const b2 = nodes[i].getBoundingClientRect();
                    const b1 = nodes[i - 1].getBoundingClientRect();
                    const overlap = !(b1.right < b2.left || b1.left > b2.right || b1.bottom < b2.top || b1.top > b2.bottom);
                    if (overlap) {
                        nodes[i].remove();
                    }
                }
            });
        } else {
            text.each((d: any, i: number, nodes: any) => {
                if (nodes[i].getBoundingClientRect().right > edge || nodes[i].getBoundingClientRect().left < 0) {
                    nodes[i].remove();
                }
            });
        }
    }

    /** Final transform applied to the scrollable bars/labels group. */
    public scrollableTransform(edgeOffset: number, mainPos: number): string {
        return this.name === "Vertical"
            ? `translate(${0},${mainPos})`
            : `translate(${-edgeOffset},${0})`;
    }

    // ---- bar label placement ----------------------------------------------
    public labelMainPosition(xScale: d3.ScaleBand<string>, d: any): number {
        const main = xScale(d.category) as number;
        return this.name === "Vertical" ? main : (main + xScale.step() / 2);
    }

    public barLabelCrossPos(d: any, i: number, nodes: any, pillarLabelsg: any, data: any[]): number {
        if (this.name === "Vertical") {
            let heightAdjustment = 0;
            pillarLabelsg.each((d2: any, idx: number, ns: any) => {
                if (idx == i) {
                    heightAdjustment = ns[idx].getBoundingClientRect().height;
                }
            });
            let yPosition: number;
            switch (d.customLabelPositioning) {
                case "Inside end":
                    yPosition = this.barCrossStart(d, i, data) + heightAdjustment;
                    break;
                case "Outside end":
                    if (d.value >= 0) {
                        yPosition = this.barCrossStart(d, i, data) - 5;
                    } else {
                        yPosition = this.barCrossStart(d, i, data) + this.barCrossSize(d, i, data) + heightAdjustment;
                    }
                    if (yPosition >= this.cross(0)) {
                        yPosition = this.barCrossStart(d, i, data) - 5;
                    }
                    break;
                case "Inside center":
                    yPosition = (this.barCrossStart(d, i, data) + this.barCrossSize(d, i, data) / 2) + heightAdjustment / 2;
                    break;
                case "Inside base":
                    yPosition = this.barCrossStart(d, i, data) + this.barCrossSize(d, i, data) - heightAdjustment / 2;
                    break;
                case "Outside top":
                    yPosition = this.barCrossStart(d, i, data) - 5;
                    break;
                case "Inside bottom":
                    yPosition = this.barCrossStart(d, i, data) + this.barCrossSize(d, i, data) + heightAdjustment;
                    if (this.minValue >= 0 && this.maxValue >= 0) {
                        if (yPosition >= this.cross(0)) {
                            yPosition = this.barCrossStart(d, i, data) - 5;
                        }
                    }
                    break;
                default:
                    yPosition = this.barCrossStart(d, i, data);
            }
            return yPosition;
        }
        // horizontal
        let widthAdjustment = 0;
        pillarLabelsg.each((d2: any, idx: number, ns: any) => {
            if (idx == i) {
                widthAdjustment = ns[idx].getBoundingClientRect().width;
            }
        });
        let yPosition: number;
        switch (d.customLabelPositioning) {
            case "Inside end":
                yPosition = this.barCrossStart(d, i, data) + this.barCrossSize(d, i, data) - widthAdjustment - 5;
                break;
            case "Outside end":
                if (d.value >= 0) {
                    yPosition = this.barCrossStart(d, i, data) + this.barCrossSize(d, i, data) + 5;
                } else {
                    yPosition = this.barCrossStart(d, i, data) - widthAdjustment - 5;
                }
                break;
            case "Inside center":
                yPosition = (this.barCrossStart(d, i, data) + this.barCrossSize(d, i, data) / 2 - widthAdjustment / 2);
                break;
            case "Inside base":
                yPosition = this.barCrossStart(d, i, data) + 5;
                break;
            case "Outside top":
                yPosition = this.barCrossStart(d, i, data) + this.barCrossSize(d, i, data) + 5;
                break;
            case "Inside bottom":
                yPosition = this.barCrossStart(d, i, data) - widthAdjustment - 5;
                break;
            default:
                yPosition = this.barCrossStart(d, i, data);
        }
        return yPosition;
    }
}
