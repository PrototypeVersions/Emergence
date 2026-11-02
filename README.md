# Emergence

Emergence forecasts events that only come into view when several systems are read together: AI, cyber, internet infrastructure, elections, geopolitics and markets.

It publishes **stories**: claims about what's really going on that most coverage misses because it sees only one part of the picture. Each story says what you'd expect, what's more likely, what you'll see if it's right, and what would prove it wrong. A short weekly brief ties them together.

Behind every story are forecasts that make it checkable:

- a yes-or-no outcome with a deadline and named deciding sources
- a probability that starts from a base rate, with every adjustment shown
- a cause-and-effect pathway through a world map of tracked conditions
- an evidence ledger graded by reliability, where repeated reports count once
- a frozen snapshot, so past forecasts can be scored and never quietly rewritten

## The site

| View | Question it answers |
|---|---|
| Pulse | The weekly brief, this week's stories, and three numbers to watch |
| Stories | Every story, plus the causal chains underneath |
| Predictions | What might happen, ranked several ways? |
| Forecast pages | How could it happen, why this number, and what decides it? |
| World map | How do the tracked conditions connect? Includes "What connects these?" |
| Evidence | Where did each fact come from, and how reliable is it? |
| Track record | How have past forecasts turned out? |

There's a **Briefing / Analyst** switch at the top. Analyst mode adds uncertainty ranges, the skeptic and escalation arguments, and source clusters.

## Run it locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

No build step and no dependencies. The page is plain HTML, CSS and JavaScript, and it reads the JSON files in `data/`.

## Repository layout

```
index.html, assets/          the app
data/forecasts.json          current forecast set (source of truth)
data/world-map.json          domains, conditions (nodes) and typed links (edges)
data/evidence.json           evidence ledger
data/stories.json            stories, story types and the weekly brief
data/links.json              causal chains, unexpected signals, biggest unknown
data/forecast-index.json     list of published snapshots + active pointer
data/resolutions.json        outcomes, added as forecasts close
forecasts/<cycle>.json       frozen snapshots — never edited after publishing
scripts/validate.mjs         model checks run in CI
docs/                        methodology, resolution rules, safety boundary, update protocol
```

## Deployment

Every push to `main` runs `scripts/validate.mjs`. If the checks pass, it deploys to GitHub Pages. In the repository settings, set Pages to **Source: GitHub Actions** (one-time).

## Updating

Updates are manual and follow [docs/UPDATE_PROTOCOL.md](docs/UPDATE_PROTOCOL.md).
