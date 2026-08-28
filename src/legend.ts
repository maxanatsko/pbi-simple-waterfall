import * as d3 from "d3";
import { VisualSettings } from "./settings";

type Selection = d3.Selection<any, any, any, any>;

/** Draw the favourable / adverse sentiment legend into `legendContainer`.
 *  Returns the legend height (0 when the legend is off), which the caller
 *  subtracts from the viewport height. */
export function renderLegend(legendContainer: Selection, settings: VisualSettings): number {
    legendContainer.selectAll('svg').remove();
    if (settings.chartOrientation.useSentimentFeatures && settings.Legend.show) {
        var circleFavourableSVG = legendContainer.append('svg');

        var circleFavourable = circleFavourableSVG.append('circle');

        var textFavourableSVG = legendContainer.append('svg');
        var textFavourable = textFavourableSVG.append('text')
            .attr("x", 0)
            .attr("y", "75%")
            .style('font-size', settings.Legend.fontSize + "pt")
            .text(settings.Legend.textFavourable)
            .style('font-family', settings.Legend.fontFamily)
            .style('fill', settings.Legend.fontColor);

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
            .attr("r", textBoxSizeHeight / 2 * .6)
            .attr('cx', textBoxSizeHeight / 2)
            .attr('cy', textBoxSizeHeight / 2)
            .attr("fill", settings.sentimentColor.sentimentColorFavourable);

        var circleAdverseSVG = legendContainer.append('svg');

        var circleAdverse = circleAdverseSVG.append('circle');

        var textAdverseSVG = legendContainer.append('svg');
        var textAdverse = textAdverseSVG.append('text')
            .attr("x", 0)
            .attr("y", "75%")
            .style('font-size', settings.Legend.fontSize + "pt")
            .text(settings.Legend.textAdverse)
            .style('font-family', settings.Legend.fontFamily)
            .style('fill', settings.Legend.fontColor);


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
            .attr("r", textBoxSizeHeight / 2 * .6)
            .attr('cx', textBoxSizeHeight / 2)
            .attr('cy', textBoxSizeHeight / 2)
            .attr("fill", settings.sentimentColor.sentimentColorAdverse);
        legendContainer
            .style('height', textBoxSizeHeight + "pt");
        return textBoxSizeHeight;
    }
    legendContainer
        .style('height', 0 + "pt");
    return 0;
}
