import * as d3 from "d3";
import { RenderSettings } from "./renderSettings";
import { LEGEND_CIRCLE_RADIUS_FACTOR } from "./constants";

type Selection = d3.Selection<any, any, any, any>;

/** Draw the sentiment legend into `legendContainer`. Returns the legend height
 *  (0 when the legend is off), which the caller subtracts from the viewport
 *  height. Covers every pillar colour in play -- favourable, adverse, the total
 *  pillar, and (when breakdown steps are limited) the "Other" bucket -- not just
 *  favourable / adverse. */
export function renderLegend(legendContainer: Selection, renderSettings: RenderSettings): number {
    legendContainer.selectAll('svg').remove();
    if (!(renderSettings.useSentimentFeatures && renderSettings.legendShow)) {
        legendContainer.style('height', 0 + "pt");
        return 0;
    }

    const entries: { color: string; text: string }[] = [
        { color: renderSettings.sentimentColorFavourable, text: renderSettings.legendTextFavourable },
        { color: renderSettings.sentimentColorAdverse, text: renderSettings.legendTextAdverse },
        { color: renderSettings.sentimentColorTotal, text: "Total" },
    ];
    if (renderSettings.limitBreakdown) {
        entries.push({ color: renderSettings.sentimentColorOther, text: "Other" });
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
