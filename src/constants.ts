export const SCROLLBAR_BREATH = 8;
export const Y_AXIS_TICK_COUNT = 5;
/** Band `step()` (px) below which a single category label stops being legible.
 *  When "Fit to width" is on, the scrollbar engages at this point instead of
 *  letting the bars keep shrinking. */
export const MIN_BAND_STEP_PX = 24;
/** Hard floor (px) for the value-axis pixel range. Safety net so a pathological
 *  category-label block (huge font / very long unbroken word) can never shrink
 *  the plot enough to degenerate or invert the value scale. */
export const MIN_PLOT_CROSS_PX = 60;
/** Rough px height of one label line as a multiple of its point size
 *  (1pt ~= 1.333px, ~1.2 line-height). Sizes the value-axis head-room so an
 *  "outside" label on the tallest / lowest bar is never clipped. */
export const LABEL_LINE_PT_TO_PX = 1.6;
/** Cap the value-axis head-room (above the tallest bar, and below the lowest
 *  when the waterfall goes negative) at this fraction of the plot height, so on
 *  a very short plot the head-room can't itself crush the bars. */
export const HEADROOM_MAX_FRACTION = 0.18;
/** Extra scrollable width past the last bar so its centre-anchored value label
 *  (which spills beyond the band) is not clipped at the viewport edge when the
 *  chart is scrolled fully right. Floored so a narrow bar still gets room. */
export const EDGE_LABEL_GUTTER_MIN_PX = 48;
export const LEGEND_CIRCLE_RADIUS_FACTOR = 0.6;
export const BAND_PADDING = 0.2;
export const MARGIN_BUMP = 20;
/** Upper bound (pt) for the category-axis baseline and its cell separators, so
 *  a large "Stroke Width" value can't turn the grid into a solid block. */
export const MAX_AXIS_STROKE_PT = 3;
export const SCROLLBAR_TRACK_FILL = "#e1e1e1";
export const SCROLLBAR_TRACK_OPACITY = 0.5;
export const SCROLLBAR_THUMB_FILL = "#000";
export const SCROLLBAR_THUMB_OPACITY = 0.24;
export const SORT_EPSILON = 0.000001;
export const SORT_EPSILON_MAX = 0.999999;
