# Automated updates

Emergence updates itself on a schedule, with no one reviewing each run. These rules are what keep that safe. Scheduled runs must follow this file, `docs/UPDATE_PROTOCOL.md`, `docs/SAFETY_BOUNDARY.md` and `CLAUDE.md`.

## Run types

### Weekly full update (Mondays, early morning, US Central)

It runs after the 7-day windows close at midnight Sunday, so it scores the week that just ended and publishes the brief for the week ahead.

The complete `UPDATE_PROTOCOL.md`, in order:

1. Resolve every forecast whose window has closed.
2. Research sweep.
3. Story engine.
4. Gap search.
5. Implied-event challenge.
6. Update numbers.
7. Publish.

Also:

- **Brief.** Move the current `brief` into `brief_archive` (newest first), then write a new brief. Fill `brief.changes` with 2–5 one-line entries saying what changed since last week: stories that gained or lost support, the biggest number moves and why, and verdicts given.
- **Connections.** Refresh `links.json → connections`: add new sets of separately reported events that may be linked, re-rate existing ones as evidence arrives, and retire ones that turned out to be coincidence. Keep four to eight.
- **Calendar.** Mark past dates `done: true` with a one-sentence `outcome`, but only once the day has ended (US Central) or the outcome is known. Add new decision dates for the next 30 days. Keep 4–10 upcoming entries.
- **Verdicts and postmortems.** Give a verdict to every story whose forecasts have all resolved, and write a 2–4 sentence postmortem: what it got right, what it got wrong, and why. Be candid about misses.
- **Windows.** Each horizon in `forecasts.json → horizons` rolls only when it has closed. If the 7-day window has closed, open a new one from the run date. Open a new 30-day window only once the current one has closed. Never shorten or extend a window that is still open. Resolve the old window first. Forecasts carried into a new window get a number for that window and a history entry saying so.

### Daily check (Tuesday–Sunday, evening, US Central)

The goal is a fast check that usually changes nothing.

1. **Decision dates.** If any `calendar.json` entry dated today or earlier is `done: false`, do a short update:
   - resolve forecasts that closed
   - fill in the calendar `outcome`
   - add one or two lines to `brief.changes`
   - adjust at most three forecasts that clearly moved, with history entries
   - give verdicts and postmortems to stories whose forecasts have all closed

   Don't write new stories or a new brief.
2. **Overdue resolutions.** Resolve any forecast whose window has closed and has no resolution yet, if its deciding source is available.
3. **Major surprise check.** Do one quick headline scan. If something happened that clearly changes three or more open forecasts (for example, strikes resumed, a major breach, a race call that resolves a forecast early, a government formed), do the same short update for those forecasts.
4. **Otherwise, stop.** Make no commit and end with a one-line note that nothing was due.

## Guardrails (all runs)

- **Start clean.** Clone or pull the latest `main` before doing anything.
- **Never edit or delete anything in `forecasts/`.** Every run that changes any forecast number publishes a new snapshot and index entry.
- **Never rewrite the record.** Don't change resolutions, verdicts, postmortems or history entries once published. Corrections are added as new entries with a note.
- **Validator must pass.** Run `node scripts/validate.mjs` before committing. If it fails, fix the cause. After two failed attempts, discard all changes and publish nothing.
- **Partial research is fine; invented research is not.** If search or fetch tools are unavailable or most sources fail, do a scoring-only update (resolutions, calendar outcomes, verdicts) and say so in `brief.changes`. Never state a fact that wasn't retrieved this run or isn't already in the evidence ledger.
- **Resolve only on evidence.** Resolve a forecast only when a named deciding source can be cited. If the source isn't available yet, leave it in "Awaiting resolution" for the next run. The grace period is 7 days after close.
- **Safety boundary and neutrality** apply in full. When unsure whether something crosses the line, leave it out.
- **Size limits.** A daily check changes at most three forecasts and adds no stories. A weekly run keeps 8–15 open forecasts (mostly likely ones; at most four below 30%) and 3–5 stories in the brief. Write reader-facing text in plain language (see "Plain language" in `METHODOLOGY.md`).
- **Publish.** Commit to `main` with a clear message, push, then check that the GitHub Actions run succeeds. If deployment fails, fix it in a follow-up commit. If it can't be fixed, revert the commit so the live site stays on the last good version.
- **Report.** End every run with a short summary: what was resolved, what moved and why, what was published, and anything that went wrong.
