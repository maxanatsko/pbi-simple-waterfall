# Changelog

All notable changes to the Multi-Step Waterfall Power BI visual (formerly
"Simple Waterfall") are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Power BI custom visuals use a four-part `major.minor.patch.build` version scheme;
the authoritative version is in [`pbiviz.json`](pbiviz.json).

## [Unreleased]

### Added

- **X-Axis Show/Hide** toggle, mirroring the Y-Axis one. Off removes the
  category labels and cell separators and gives the space back to the bars.
- **Tooltips field well.** Drop extra measures onto the new **Tooltips** bucket
  and they show as rows in the hover tooltip, alongside the bar's own value.
  Tooltip measures are excluded from the pillar/step logic, so they never change
  the shape of the waterfall.
- The hover tooltip now includes a **Running total** row for each step, showing
  the cumulative value up to and including that bar.

### Changed

- TypeScript `strict` mode is now enabled. All resulting type errors in
  `src/visual.ts` were addressed (null-safety around `dataView.matrix`, d3
  `.node()` results, uninitialised class fields, and implicit `any`). No
  intended change to rendering behaviour.
- Added an `npm run typecheck` script and a matching CI step; test sources are
  now type-checked via `tsconfig.test.json`.
- Split the `Visual` god class (was ~2150 lines) into focused modules —
  `dataPoint`, `tooltip`, `valueFormatting`, `matrix`, `waterfallData`
  (the four data converters), `interactions` (selection + keyboard),
  `chartRenderer` (the draw pipeline) and `legend`. `Visual` is now a ~200-line
  orchestrator. No intended change to rendering, data or interaction behaviour;
  added unit tests for the converters, formatters, tooltips, keyboard
  navigation and the scrollbar path.

### Fixed

- **Vertical layout geometry.** The plot rectangle is only known in stages
  (value-axis width, then the category-label block), but the scales were built
  once up front. As a result: the outermost pillar and its label were clipped at
  the right edge; short bars rendered on top of the category-axis labels because
  the value axis's zero sat at the container's bottom edge instead of on the
  axis line; bars drifted out of their category cells; and the first bar's
  near-zero label read as sitting below its bar. The scales are now rebuilt as
  each dimension becomes known, with a small reserved gutter for the centred end
  label.
- **Total pillar drawn far too tall.** A pillar (and the first bar) was offset
  by the running cumulative, so the total pillar shot off the top of the plot
  and carried no data label. Pillars are now anchored to the value axis.
- **Horizontal orientation.** The category rows overran the bottom edge and the
  value axis stopped short of the cumulative total (clipping the last steps and
  the total bar on the right). Same fix — rebuild the scales once the plot
  rectangle is known.
- **Category axis stroke width.** A large "Stroke Width" value thickened the
  baseline and every cell separator without limit, turning the grid into a solid
  block; both are now capped.
- **Show Zero Line** had no visible effect — the line was drawn at 0.1pt. It is
  now floored to a visible width.
- **Legend completeness.** The legend now shows the total-pillar colour, and the
  "Other" colour when breakdown steps are limited, not just favourable/adverse.
- **Inside label contrast.** Labels placed inside a bar and using the default
  (grey) colour are now switched to black or white based on the bar fill, with a
  halo so a label spilling off a short bar stays readable.
- **"Other" step order.** The aggregated "Other" step now sorts before the total
  pillar instead of on top of it.
- **Join Bars connectors.** In horizontal orientation the connectors were drawn
  on the far end of each bar instead of the shared cumulative level, and the
  connector into the total pillar landed at zero (so it looked missing). Both
  orientations now place the connector on the meeting edge. The connector stroke
  width is also floored so the default is visible.
- **Font default** no longer renders as `'"Segoe UI", wf_…` in the format pane's
  font picker.

## [3.0.0.0]

Renamed from **Simple Waterfall** to **Multi-Step Waterfall**. This is a fork of
the original visual by Nishant Jain, now maintained by Maxim Anatsko and
published as its own AppSource entry.

### Added
- **Keyboard navigation.** Tab to the chart, move between bars with the arrow
  keys (and Home / End), press Enter or Space to select, Ctrl / Shift to add to
  the selection, and Esc to clear. The focused bar shows a visible outline.
- **High-contrast mode support.** Bars, labels and selection follow the Windows
  high-contrast theme colours.

### Changed
- Rebuilt the format pane on Power BI's current formatting API and refreshed the
  underlying build to the latest Power BI visuals API (5.11). Every existing
  option is unchanged — sentiment and per-bar colours, per-bar pillar toggles
  and conditional formatting all behave as before.

### Removed
- The **"Negative value in brackets"** label option, which had no effect.

### Fixed
- The labels on/off switch is now labelled **"Show Labels"** (previously an
  unnamed placeholder).

## [2.0.7] – [2.0.10.4]

These builds shipped between 2021 and 2026 without individual changelog entries.
Notable changes, reconstructed from git history:

- **2.0.10.4** – dynamic format-string support for measures, honouring the
  source measure's decimal places; certification / best-practice tooling added.
- **2.0.10.3** (2021-12) – build error fixes; Microsoft AppSource submission
  fixes; `powerbi-visuals-api` updated to 4.2.0.
- **2.0.10** (2021-10) – PowerPoint / PDF export bug fixed.
- **2.0.8 – 2.0.9** (2021-07) – `powerbi-visuals-api` updated to 3.8.2;
  packaging and dependency updates.

## [2.0.6] and earlier

Imported verbatim from the original `Version History.md`.

### 2.0.6
- Bug fixes

### 2.0.5
- Bug fixes

### 2.0.4
- Vertical Waterfall – select chart orientation: Horizontal or Vertical (default)
- Scrollable – choose whether the chart fits or is scrollable
- Adjust bar width (if scrollable)
- Added margin (left, right, bottom, top)
- Gridlines for x-axis
- Option to wrap text x-axis labels
- More y-axis value formatting (Thousands, Millions, Billions)
- More label value formatting (Thousands, Millions, Billions)
- Other bug fixes

### 2.0.3
- Fixed x-axis label issues

### 2.0.2
- Bug fixes

### 2.0.1
- Added drilldown waterfall
- Added waterfall based on single category
- Ability to define pillars in the property pane
- The first pillar can now be a step pillar for a static waterfall
- Customise the colour and font for each bar
- Four options to position labels
- Support report tooltip, drill-through and right-click options
- Auto-format labels and y-axis
- Added gridlines

### 1.7.0
- Added drilldown functionality

### 1.6.0
- Added individual font colour option for each sentiment

### 1.5.0
- First pillar can be a step pillar (previously the first pillar had to be a base pillar)
- Format y-axis values
- Added gridlines and related properties
- Options for positioning labels
- Removed option for commentary

### 1.4.0
- Ability to auto-format label values using the SI prefix

### 1.3.0
- Option to hide the y-axis
- Auto-format y-axis using the SI prefix

### 1.2.0
- Original version
