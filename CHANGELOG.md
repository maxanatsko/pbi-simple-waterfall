# Changelog

All notable changes to the Multi-Step Waterfall Power BI visual (formerly
"Simple Waterfall") are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Power BI custom visuals use a four-part `major.minor.patch.build` version scheme;
the authoritative version is in [`pbiviz.json`](pbiviz.json).

## [Unreleased]

## [3.0.0.0]

### Changed
- **Renamed to "Multi-Step Waterfall"** with a new, unique visual GUID. This
  fork cannot update the original author's AppSource listing, so it ships as a
  separate entry under its own publisher.
- Modernised the toolchain: `powerbi-visuals-tools` 4 → 7, `powerbi-visuals-api`
  4.2 → 5.11, TypeScript 3.9 → 5.9, `powerbi-visuals-utils-*` 2.x/4.x → 7.x,
  d3 5 → 7, ESLint flat config. `npm audit` (production) is now clean; the
  legacy build stack was the source of 11 critical / 37 high advisories.
- Rewrote the format pane onto the modern `getFormattingModel` API
  (`powerbi-visuals-utils-formattingmodel`), replacing the hand-built
  `enumerateObjectInstances` path. This also fixes the long-standing bug where
  every per-datapoint format instance was emitted under the object name
  `"objectName"` instead of its real object.
- Replaced the vendored d3-v5 `tooltipServiceWrapper` with the official
  `powerbi-visuals-utils-tooltiputils` package.

### Added
- Keyboard navigation of chart bars: Tab to focus, Arrow / Home / End to move,
  Enter / Space to select (Ctrl / Shift for multi-select), Esc to clear, with a
  visible focus outline. `supportsKeyboardFocus` is enabled.
- Windows High Contrast support via `host.colorPalette` — bars, labels and
  selection use foreground / background / foregroundSelected colours.
- A `vitest` smoke suite for the formatting model, run in CI.

### Removed
- The unused `LabelsFormatting.negativeInBrackets` setting (declared but never
  read). Stored values for it are simply ignored.
- The duplicate `sentimentColor.useSentimentFeatures` capability property.

### Fixed
- The `LabelsFormatting` show toggle is labelled "Show Labels" (was the
  placeholder "My Property Switch").
- The `tooltips` data role referenced by `capabilities.json` is now declared.

### Known limitations
- TypeScript `strict` mode is still off for `src/visual.ts`.
- `pbiviz package` is run with `--all-locales` to work around an incompatibility
  between the current `powerbi-visuals-webpack-plugin` localisation loader and
  the ESM `powerbiGlobalizeLocales.js` in `powerbi-visuals-utils-formattingutils`
  7. This bundles all locale strings rather than only `en-US`.
- `webpack` is pinned to `5.105.4` via `overrides`, and `npm run package` goes
  through `scripts/package.mjs`. `powerbi-visuals-tools` 7.2.x with webpack 5.10x
  intermittently crashes in a post-build logging hook
  (`No such label 'emitAssets'`) *after* the `.pbiviz` is written and the build
  reports success — a webpack `needAdditionalPass` timer race. The wrapper treats
  a completed build with a fresh `dist/*.pbiviz` as success and still fails on
  any real build error.

## Earlier maintainership changes (pre-3.0.0.0)

- Maintainership moved to Maxim Anatsko (fork of the original by Nishant Jain).
  Updated `author` in `package.json` / `pbiviz.json`, `supportUrl`, and the
  `LICENSE` copyright notice (the original 2019 notice is retained).
- Repository cleanup: removed committed build artifacts (`Beta Version/`,
  `webpack.statistics.*.html`), Visual Studio local state (`.vs/`), and leftover
  debug files from version control; rewrote `.gitignore`.
- Renamed `Version History.md` to `CHANGELOG.md` and `Private Policy` to
  `PRIVACY.md`; added `CONTRIBUTING.md`.
- Migrated linting from TSLint (end-of-life) to ESLint with
  `eslint-plugin-powerbi-visuals`.
- Added `.editorconfig`, a GitHub Actions build workflow, and standard
  `package.json` metadata.
- Renamed `assets/icon-visual.png` to `assets/icon.png` and pointed
  `pbiviz.json` at it.

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
