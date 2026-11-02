# Working on Emergence

Static GitHub Pages site. No build step. Data lives in `data/*.json` and is rendered by `assets/js/app.js`.

- **Before any forecast update**, read `docs/UPDATE_PROTOCOL.md` and follow it in order. Never edit files in `forecasts/`. They are frozen snapshots.
- **Lead with the gap.** Every forecast has `expected` (what most people or markets expect) and a `tactic`. Likely-but-overlooked forecasts (p ≥ 55, gap ≥ 20) need a `surprise_note`. Run the gap search in the update protocol every cycle.
- **Probabilities** must equal `base_rate.value + sum(adjustments.delta)` for the primary horizon. Explain every move in `history`.
- **Always run** `node scripts/validate.mjs` before committing. CI blocks deployment on failure.
- **Safety boundary** (`docs/SAFETY_BOUNDARY.md`): no exploit, intrusion or targeting detail; no partisan content; forecast by category rather than naming likely victims.
- **Evidence**: label `confirmed` vs `reported`, grade reliability A–D, and reuse an independence cluster when sources repeat one report.
- **Design**: keep the home screen to roughly five things. New detail goes behind a click (forecast tabs, drawer, Analyst mode), never onto Pulse. Labels are sentence case, with no all-caps eyebrows.
- **Preview**: `python3 -m http.server 8000`.
