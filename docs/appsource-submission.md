# AppSource submission & certification checklist

Steps for publishing Simpler Waterfall to AppSource and requesting Power BI
certification. Microsoft's reference:
<https://learn.microsoft.com/power-bi/developer/visuals/power-bi-custom-visuals-certified>
and <https://learn.microsoft.com/power-bi/developer/visuals/office-store>.

## 1. Repository gates (automated)

All must pass on the commit you package from. CI runs 1–5.

1. `npm ci`
2. `npm run eslint`: no errors
3. `npm run typecheck` and `npm test`
4. `npm audit`: no high or moderate findings (dev dependencies included)
5. `npm run package`: produces `dist/SimplerWaterfall…<version>.pbiviz`
6. `npx pbiviz package --all-locales --certification-audit`: the external
   requests audit is empty, and only the Highlight Data and Total SubTotal
   recommendations remain (neither is required). Run it on its own; see the
   note in `CONTRIBUTING.md` about spurious second-pass errors.

## 2. Live check in Power BI

Import the packaged `.pbiviz` into Desktop and Service
(`?approvedResourcesDisabled=true` for Service), keep DevTools open, and confirm
there are **no console errors** throughout:

- Empty visual shows the landing page; add a measure and the chart appears;
  remove it and the landing page returns with no leftover bars.
- Format pane opens on an empty visual and with data.
- Each "Ways to create a chart" combination from the README, plus drill-down.
- Edge data: nulls, negatives, all-zero, a single row, very large and very
  small values, long category names.
- Click, Ctrl-click, keyboard (Tab / arrows / Enter / Esc), the context menu,
  tooltips, and cross-filtering to and from other visuals.
- High-contrast mode (Windows contrast theme) and a dark report theme.
- Pin to a dashboard: clicks don't select.

## 3. Sample report (.pbix)

`demo/Simple Waterfall - Demo.pbix` is **stale**: it embeds the old
`SimpleWaterfall` and `SimpleWaterfall_dev` visuals, not this GUID. Rebuild it:

- Import the exact `.pbiviz` you will submit (never the dev visual).
- Show the main scenarios (vertical and horizontal, pillars by category and by
  measure, drill-down, sentiment colours), and include a page of usage hints.
- Save as `demo/Simpler Waterfall - Demo.pbix` and delete the old file.

## 4. Store assets

- Logo: 300×300 PNG (the 20×20 `assets/icon.png` is only the in-product icon).
- 1–5 screenshots at 1366×768 PNG.
- Short summary (100 characters or less), long description, and up to 3 search keywords.
- Optional: a video link.

## 5. Partner Center

- Offer type: **Power BI visual**.
- Upload the `.pbiviz` and the sample `.pbix`.
- Privacy policy URL:
  <https://github.com/maxanatsko/pbi-simple-waterfall/blob/main/PRIVACY.md>
- Support URL: <https://github.com/maxanatsko/pbi-simple-waterfall/issues>
- EULA: Microsoft Standard Contract (or link `LICENSE`).
- Tick **Request Power BI certification**.

**Notes for certification** (paste):

> Source: https://github.com/maxanatsko/pbi-simple-waterfall (public), branch
> `certification`. Build with `npm ci && npm run package`. The package script
> wraps `pbiviz package --all-locales`, because powerbi-visuals-tools 7.2.1's
> localization loader cannot parse the ESM locales file from
> powerbi-visuals-utils-formattingutils 7, so a bare `pbiviz package` fails.
> The visual makes no external requests and requests no privileges.

## 6. `certification` branch

After the release commit is merged to `main` and the live check passes:

```bash
git checkout main && git pull
git branch -f certification main
git push -u origin certification
```

The branch must match the submitted package exactly. Only move it when
submitting a new version.
