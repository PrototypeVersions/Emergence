# Resolution rules

1. **Every forecast is yes/no** with a window (opens and closes dates in `forecasts.json → horizons`). Times are US Central.
2. **The condition text decides.** Only the `resolution.condition` and `resolution.ambiguous` fields count, not the title or summary.
3. **Named sources decide.** If none of the listed sources reports the event by 7 days after the window closes, it resolves **no**.
4. **First public report** must fall inside the window, unless the condition says the event itself must occur inside it.
5. **Thresholds are as stated** (for example, "$100 million gross at time of theft," "at least 2 hours per the provider's own figure"). Later revisions of the figure by the deciding source are accepted up to the 7-day grace period.
6. **Genuinely ambiguous cases** are recorded as `ambiguous` in `data/resolutions.json`, with a written reason, and excluded from scoring. That label should be rare. If a rule keeps producing ambiguity, rewrite it for the next cycle instead.
7. **No retroactive edits.** A resolution is never changed to fit a published number, and a published number is never changed to fit a resolution.

## Scoring

- **Brier score** for each binary forecast: (p − outcome)², with p as a fraction.
- **Calibration** (bins of 10 points) is shown only after at least 20 forecasts have resolved.
- Each forecast is scored on its **primary** horizon. Secondary horizons are recorded but scored separately.
- The number scored is the one **first published** for that window. Later revisions are shown in the forecast's history, but they can't improve its score.

## `data/resolutions.json` entry format

`cycle` is the cycle where that window's number was first published.

```json
{
  "forecast": "F02",
  "title": "A single crypto theft of $100 million or more",
  "cycle": "2026-11-01-1800",
  "horizon": "30d",
  "p": 33,
  "outcome": 1,
  "resolved_on": "2026-12-01",
  "source": "https://…",
  "note": "One-sentence reason."
}
```
