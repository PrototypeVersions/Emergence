# Update protocol

Forecasts change only during an explicit update cycle. Suggested cadence: weekly, plus an extra cycle after any major event touching three or more forecasts.

## 1. Resolve what closed

For each forecast whose window has closed, apply `RESOLUTION_RULES.md` and append an entry to `data/resolutions.json`. Don't touch the old snapshot.

## 2. Research

- Start with the **research questions** on the open forecasts, highest leverage first.
- Re-check every node whose state is marked low confidence. The **biggest unknown** in `links.json` comes first.
- Add new records to `data/evidence.json` with the next free ID. Assign an independence cluster. If a new article repeats an existing report, reuse that report's cluster.
- Check prediction markets for any forecast whose `market.status` is `to-check`.

## 3. Story engine (mandatory)

1. **Sweep wide.** Read across beats: security advisories, crypto analytics, court filings, election administration, shipping, AI lab disclosures, regulatory and legislative calendars, foreign elections and negotiations, and mainstream headlines. Note which sources were unreachable.
2. **Collect loose ends.** Things that happened and must have follow-ups: stolen money and keys, promised reports, running deadlines, unresolved threats, pending votes or mandates.
3. **Find the hype.** List the moments coverage is anticipating. For each, ask what actually decides it and when.
4. **Cross-match.** Pair loose ends across domains. Look for shared mechanisms, shared infrastructure, and timing collisions.
5. **Draft stories** in the "you'd think / more likely" form and apply the four tests in `METHODOLOGY.md`. Keep three to five. Each needs forecasts as receipts; add forecasts where needed.
6. **Verdicts.** Give a verdict to each story whose forecasts have all closed. Retire it from the brief, but keep it in `stories.json`.
7. **Write the weekly brief** last.

## 3b. Gap search (mandatory)

Run each tactic in `METHODOLOGY.md` against the current evidence. At minimum:

- **Lagged consequences:** for every major event in the last 30 days, list what must follow (money moves, keys get used, reports are promised, deadlines start running) and when.
- **Calendar:** list every deadline, scheduled release, court date and statutory step inside the next 30 days.
- **Precedent:** for each major event, find the closest past case and write down what happened in the 30 days after it.
- **Reverse gap:** check prediction markets and the most-covered stories, and flag anything the model doubts.

Keep candidates with p ≥ 55 and a real gap. Each needs a resolvable condition and a `surprise_note`. Update `expected` on existing forecasts when markets or coverage move.

## 3c. Implied-event challenge (mandatory)

Ask: *What important event is not on the list but follows naturally from two or more currently active conditions?* Generate at least 20 candidates. Red-team them. Keep only candidates with a coherent mechanism, real evidence, nontrivial probability, clear newsworthiness and a resolvable condition. Then ask the counter-consensus questions: which heavily covered event is overestimated, and which ignored event is underestimated?

## 4. Update numbers

- Change node states and edges in `world-map.json`.
- Re-derive each probability: base rate, then adjustments, then result. The validator checks the arithmetic.
- Append a `history` entry to each changed forecast with a one-sentence reason. Every move must be explainable.
- Retire closed forecasts from `forecasts.json`. Their snapshots remain the record. Add new ones (aim for 8–15 open in total).
- Refresh `links.json` signals and paths.

## 5. Publish

1. Set a new `cycle` id (`YYYY-MM-DD-HHMM`) and `published` time in `data/forecasts.json`.
2. Copy `data/forecasts.json` to `forecasts/<cycle>.json`. That file is now frozen.
3. Append the snapshot to `data/forecast-index.json` and set `active` to it. Use `change_type` `Forecast update` when only numbers or evidence changed, or `Model engine change` when the method or structure changed.
4. Run `node scripts/validate.mjs`. Fix every error.
5. Commit and push to `main`. CI validates again and deploys.

## Keep separate

**Forecast changes** (new evidence moved a number) and **model engine changes** (the method, scoring or structure changed) are recorded separately in the index. Never do both silently in one cycle.
