# Changelog

All notable changes to the Multi-Step Waterfall Power BI visual (formerly
"Simple Waterfall") are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Power BI custom visuals use a four-part `major.minor.patch.build` version scheme;
the authoritative version is in [`pbiviz.json`](pbiviz.json).

## [Unreleased]

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
