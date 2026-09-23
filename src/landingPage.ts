import powerbi from "powerbi-visuals-api";
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;
import * as d3 from "d3";

type Selection = d3.Selection<any, any, any, any>;

/** Localized landing-page strings; keys live in stringResources/<locale>/resources.resjson. */
export interface LandingText {
    title: string;
    message: string;
}

/** Look up a string, falling back to English when the host has no entry
 *  (an unknown key comes back empty or as the key itself). */
function localize(manager: ILocalizationManager, key: string, fallback: string): string {
    const value = manager.getDisplayName(key);
    return value && value !== key ? value : fallback;
}

export function landingText(manager: ILocalizationManager): LandingText {
    return {
        title: localize(manager, "Visual_LandingPage_Title", "Simpler Waterfall"),
        message: localize(manager, "Visual_LandingPage_Message", "Add a measure to Values to build the waterfall."),
    };
}

/** Show or hide the empty-state message shown while the visual has nothing to
 *  plot (declared via `supportsLandingPage` / `supportsEmptyDataView` in
 *  capabilities.json). The message is static text written with `.text()`, so
 *  no user data ever reaches the DOM as markup. */
export function renderLandingPage(container: Selection, show: boolean, text: LandingText): void {
    container.selectAll('.landingPage').remove();
    if (!show) {
        return;
    }
    const page = container
        .append('div')
        .classed('landingPage', true);
    page.append('div')
        .classed('landingPageTitle', true)
        .text(text.title);
    page.append('div')
        .classed('landingPageMessage', true)
        .text(text.message);
}
