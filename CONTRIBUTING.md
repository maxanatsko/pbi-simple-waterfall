# Contributing

Thanks for your interest in improving **Simple Waterfall**.

## Reporting issues

Open a GitHub issue using the template in
[`.github/ISSUE_TEMPLATE.md`](.github/ISSUE_TEMPLATE.md). Include the visual
version (see [`pbiviz.json`](pbiviz.json)), Power BI environment
(Desktop / Service), and steps to reproduce.

## Development setup

Requires Node.js 20.19+ and the Power BI visuals tools.

```bash
git clone https://github.com/maxanatsko/pbi-simple-waterfall.git
cd pbi-simple-waterfall
npm install

# One-time: install the local dev certificate
npx pbiviz install-cert

# Start the dev server (run twice the first time if the cert step just ran)
npm start

# Lint
npm run lint

# Produce a distributable package in dist/
npm run package
```

### Testing a package build

When importing a locally built `.pbiviz` into Power BI Service for testing,
append this to the report URL before importing:

```
?approvedResourcesDisabled=true
```

## Coding notes

- Source lives in `src/` (`visual.ts` is the entry point declared in
  `tsconfig.json`). Visual capabilities are in `capabilities.json`; styling in
  `style/visual.less`.
- The format pane is defined in `src/settings.ts`
  (`VisualFormattingSettingsModel`) and served via `getFormattingModel`. The
  legacy `DataViewObjectsParser` model in the same file is still used for reads
  in `visual.ts`; keep the defaults of the two in sync.
- Keep changes to visual behaviour documented in
  [`CHANGELOG.md`](CHANGELOG.md) under `## [Unreleased]`.
- Bump the version in `pbiviz.json` (and `package.json`) when producing a
  release build.

## Build environment notes

- Use Node 20.19+ (`.nvmrc` pins 22).
- `npm run package` goes through `scripts/package.mjs`, not `pbiviz package`
  directly. `powerbi-visuals-tools` 7.2.x with webpack 5.10x intermittently
  throws `No such label 'emitAssets'` from a post-build logging hook *after* the
  `.pbiviz` has been written and the build has reported success. The wrapper
  treats a completed build with a fresh `dist/*.pbiviz` as success and still
  fails on any real build error. `webpack` is pinned to `5.105.4` via
  `overrides` to reduce how often this fires.
- The build runs with `--all-locales` because the current
  `powerbi-visuals-webpack-plugin` localisation loader cannot parse the ESM
  `powerbiGlobalizeLocales.js` shipped by `powerbi-visuals-utils-formattingutils`
  7. This bundles all locale strings rather than only `en-US`.
- TypeScript `strict` mode is off for `src/visual.ts` — a strict-mode migration
  is deferred to a follow-up.

## Useful references

- Power BI visuals – capabilities:
  <https://learn.microsoft.com/power-bi/developer/visuals/capabilities>
- Custom visual GUID guidance:
  <https://community.powerbi.com/t5/Developer/Custom-visual-GUID-question/td-p/436243>
- "`pbiviz package` does not update the visual's capabilities":
  <https://community.powerbi.com/t5/Developer/quot-pbiviz-package-quot-does-not-update-visual-s-capabilities/td-p/320266>
- Error loading a custom visual in Desktop:
  <https://github.com/microsoft/PowerBI-visuals-tools/issues/402>

### Useful npm commands

| Command | Purpose |
| --- | --- |
| `npm outdated` | List dependencies that are out of date |
| `npm install <pkg>@latest` | Update a package to its latest version |
| `npm ls --depth=0` | List installed top-level packages with versions |
