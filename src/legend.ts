import * as d3 from "d3";
import { RenderSettings } from "./renderSettings";
import { LEGEND_CIRCLE_RADIUS_FACTOR } from "./constants";

type Selection = d3.Selection<any, any, any, any>;

/** Draw the favourable / adverse sentiment legend into `legendContainer`.
 *  Returns the legend height (0 when the legend is off), which the caller
 *  subtracts from the viewport height. */
export function renderLegend(legendContainer: Selection, renderSettings: RenderSettings): number {
    legendContainer.selectAll('svg').remove();
    if (renderSettings.useSentimentFeatures && renderSettings.legendShow) {
        var circleFavourableSVG = legendContainer.append('svg');

        var circleFavourable = circleFavourableSVG.append('circle');

        var textFavourableSVG = legendContainer.append('svg');
        var textFavourable = textFavourableSVG.append('text')
            .attr("x", 0)
            .attr("y", "75%")
            .style('font-size', renderSettings.legendFontSize + "pt")
            .text(renderSettings.legendTextFavourable)
            .style('font-family', renderSettings.legendFontFamily)
            .style('fill', renderSettings.legendFontColor);

        var textBoxSize;
        var textBoxSizeHeight;
        var textBoxSizeWidth;
        textBoxSize = textFavourable.node()!.getBoundingClientRect();
        textBoxSizeHeight = textBoxSize.height;
        textBoxSizeWidth = textBoxSize.width;
        circleFavourableSVG
            .attr('height', textBoxSizeHeight)
            .attr('width', textBoxSizeHeight);

        textFavourableSVG
            .attr('width', textBoxSizeWidth)
            .attr('height', textBoxSizeHeight);


        circleFavourable
            .attr("r", textBoxSizeHeight / 2 * LEGEND_CIRCLE_RADIUS_FACTOR)
            .attr('cx', textBoxSizeHeight / 2)
            .attr('cy', textBoxSizeHeight / 2)
            .attr("fill", renderSettings.sentimentColorFavourable);

        var circleAdverseSVG = legendContainer.append('svg');

        var circleAdverse = circleAdverseSVG.append('circle');

        var textAdverseSVG = legendContainer.append('svg');
        var textAdverse = textAdverseSVG.append('text')
            .attr("x", 0)
            .attr("y", "75%")
            .style('font-size', renderSettings.legendFontSize + "pt")
            .text(renderSettings.legendTextAdverse)
            .style('font-family', renderSettings.legendFontFamily)
            .style('fill', renderSettings.legendFontColor);


        textBoxSize = textAdverse.node()!.getBoundingClientRect();
        textBoxSizeHeight = textBoxSize.height;
        textBoxSizeWidth = textBoxSize.width;
        circleAdverseSVG
            .attr('height', textBoxSizeHeight)
            .attr('width', textBoxSizeHeight);

        textAdverseSVG
            .attr('width', textBoxSizeWidth)
            .attr('height', textBoxSizeHeight);


        circleAdverse
            .attr("r", textBoxSizeHeight / 2 * LEGEND_CIRCLE_RADIUS_FACTOR)
            .attr('cx', textBoxSizeHeight / 2)
            .attr('cy', textBoxSizeHeight / 2)
            .attr("fill", renderSettings.sentimentColorAdverse);
        legendContainer
            .style('height', textBoxSizeHeight + "pt");
        return textBoxSizeHeight;
    }
    legendContainer
        .style('height', 0 + "pt");
    return 0;
}
