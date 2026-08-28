import * as d3 from "d3";
import { RenderSettings } from "./renderSettings";
import { BarChartDataPoint } from "./dataPoint";
import { LEGEND_CIRCLE_RADIUS_FACTOR } from "./constants";

type Selection = d3.Selection<any, any, any, any>;

/** Draw the sentiment legend into `legendContainer`. Returns the legend height
 *  (0 when the legend is off), which the caller subtracts from the viewport
 *  height. Every entry is derived from `bars` -- only colours that appear on an
 *  actual bar get a swatch. */
export function renderLegend(legendContainer: Selection, renderSettings: RenderSettings, bars: BarChartDataPoint[]): number {
    legendContainer.selectAll('svg').remove();
    if (!(renderSettings.useSentimentFeatures && renderSettings.legendShow)) {
        legendContainer.style('height', 0 + "pt");
        return 0;
    }

    const hasFavourable = bars.some(d => d.isPillar != 1 && d.displayName !== "Other" && d.value >= 0);
    const hasAdverse = bars.some(d => d.isPillar != 1 && d.value < 0);
    const hasTotal = bars.some(d => d.isPillar == 1);
    const hasOther = bars.some(d => d.displayName === "Other");

    const entries: { color: string; text: string }[] = [];
    if (hasFavourable) entries.push({ color: renderSettings.sentimentColorFavourable, text: renderSettings.legendTextFavourable });
    if (hasAdverse) entries.push({ color: renderSettings.sentimentColorAdverse, text: renderSettings.legendTextAdverse });
    if (hasTotal) entries.push({ color: renderSettings.sentimentColorTotal, text: "Total" });
    if (hasOther) entries.push({ color: renderSettings.sentimentColorOther, text: "Other" });

    if (entries.length === 0) {
        legendContainer.style('height', 0 + "pt");
        return 0;
    }

    let legendHeight = 0;
    for (const entry of entries) {
        const swatchSVG = legendContainer.append('svg');
        const swatch = swatchSVG.append('circle');

        const labelSVG = legendContainer.append('svg');
        const label = labelSVG.append('text')
            .attr("x", 0)
            .attr("y", "75%")
            .style('font-size', renderSettings.legendFontSize + "pt")
            .text(entry.text)
            .style('font-family', renderSettings.legendFontFamily)
            .style('fill', renderSettings.legendFontColor);

        const box = label.node()!.getBoundingClientRect();
        legendHeight = box.height;

        swatchSVG.attr('height', box.height).attr('width', box.height);
        labelSVG.attr('width', box.width).attr('height', box.height);

        swatch
            .attr("r", box.height / 2 * LEGEND_CIRCLE_RADIUS_FACTOR)
            .attr('cx', box.height / 2)
            .attr('cy', box.height / 2)
            .attr("fill", entry.color);
    }

    legendContainer.style('height', legendHeight + "pt");
    return legendHeight;
}
