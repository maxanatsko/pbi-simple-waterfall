# Simple Waterfall

A Power BI custom visual for building multi-step waterfall charts. Define pillars
from categories or measures, choose a vertical or horizontal layout, and format
every element of the chart — individual bar colours, labels, axes, gridlines,
margins and more.

Current version is tracked in [`pbiviz.json`](pbiviz.json); release notes are in
[`CHANGELOG.md`](CHANGELOG.md).

## Key features

- Choose between a vertical and a horizontal chart
- Define chart pillars by measure or by category
- Drillable and drill-through capable
- Format by sentiment (total, favourable, adverse) or per individual data point
- Scrollable or fit-to-window chart
- Customisable bar colour and chart margins
- Choose when to show or hide categories / measures with a zero value
- X-axis / Y-axis
  - Y-axis auto-scaled or always starting at zero
  - Wrap or clip x-axis labels
  - Customise x-axis padding, bar width, gridlines, font size and font family
  - Y-axis number formatting: none, auto, thousands, millions or billions
- Labels
  - Customise font colour and label position, by sentiment or per data point
  - Label number formatting: none, auto, thousands, millions or billions

## Ways to create a chart

| Number of categories | Number of measures | Define pillars using | Drillable? |
| --- | --- | --- | --- |
| None | Any | Measures | No |
| 1 | 1 | Category | No |
| More than 1 | 1 | Category | Yes |
| 1 | More than 1 | Default (measures = pillars, categories = steps) | No |
| More than 1 | More than 1 | Default (measures = pillars, categories = steps) | Yes |

## Development

Requires Node.js 18+.

```bash
npm install
npm run pbiviz -- --install-cert   # one-time dev certificate
npm start                          # dev server
npm run lint                       # ESLint
npm run package                    # build dist/*.pbiviz
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full setup and testing notes.

## Links

- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Privacy policy](PRIVACY.md)
- [License](LICENSE) (MIT)
- [Support](https://maxanatsko.com)

## Credits

Originally created by [Nishant Jain](https://github.com/nishantjainuk); this fork
is maintained by [Maxim Anatsko](https://github.com/maxanatsko).
