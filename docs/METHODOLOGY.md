# Methodology

## What the site is for

Emergence shows **how the news will play out**. It takes stories already in the news and forecasts where they're really heading: when they'll actually be decided, what the next chapter will look like, what will turn out bigger or smaller than the coverage suggests. Often that's not where the coverage implies, because each newsroom beat sees only part of the picture. Every call gets a probability and is scored when it's due. Forecasts are the receipts that make each story checkable. Most of this document describes the receipts. The section below describes the stories.

## Focus on likely events

Readers have limited attention. Most open forecasts should be likely (55% or higher), and the site leads with likely events most people aren't expecting. Lower-probability forecasts are kept only when a story needs them as receipts, or for a rare high-impact risk. Keep at most four below 30%. The validator enforces this. They appear on the site in a collapsed "less likely possibilities" section.

## Connections

`links.json → connections` lists sets of two to four real, separately reported events, each with a date and source, plus the possible link between them. Each has a strength rating: `strong` (good evidence the link is real), `plausible` (a credible mechanism, not shown yet) or `speculative` (could easily be coincidence). Each also says what would confirm or rule it out. Only publish connections where the events are real and the link is non-obvious. Never imply a link is stronger than the evidence. Upgrade, downgrade or retire connections as evidence arrives. The world map stays as internal plumbing for building chains; it isn't a reader-facing section.

## Plain language

Write for someone who follows the news but has never seen a forecasting site. Show likelihood in words with the number ("Likely, 82%"). Explain ranges in a sentence ("we'd be surprised if the real chance were below X% or above Y%"). Avoid jargon on reader-facing pages. Technical terms belong in these docs and behind "Show the reasoning."

## Stories (engine 1.2)

A story is written as "you'd think X; more likely Y," followed by a few short paragraphs, what you'll see if it's right (linked forecasts), and what would prove it wrong. It lives in `data/stories.json`.

**The four tests.** A story is published only if:

1. **People already care** about the subject.
2. **It overturns an expectation** people already hold. Being new isn't required; being different from the default picture is.
3. **You'll see it soon.** It predicts visible events within the forecast windows.
4. **It changes what you'd watch.**

A diagnosis of a mechanism ("three incidents had a common cause") is not a story by itself. Reframe it around a belief people hold and something they'll see, or leave it as a signal.

**Story types:**

| Type | Shape |
|---|---|
| `later` | The moment everyone is watching isn't where it gets decided. |
| `smaller` | The anticipated event won't change much. |
| `bigger` | A quiet development will matter more than its coverage suggests. |
| `in-motion` | It happened; the consequences haven't arrived yet. |
| `collision` | Two separately covered things land at the same time. |

News is organized around moments; outcomes are usually decided by slower processes. `later` and `smaller` stories are often the most useful thing the site can say.

**Verdicts.** When all of a story's forecasts close, it gets `held`, `partly` or `wrong`, with a one-line note. As a guide: held means its expected outcomes mostly happened (at least two-thirds), partly means about half, wrong means fewer. If mainstream coverage later makes the same point, record `lead_time` (for example, "12 days before Reuters"). This is a bonus, not a requirement.

**Weekly brief.** Three short paragraphs that say what the stories add up to. Every sentence must tie to a story, a forecast or an evidence record.

## Principle

Maximum explanatory depth per unit of unjustified assumption. A model component exists only if it helps tell possible worlds apart, find causal pathways, improve calibration, or point research at the right question.

## Four kinds of thing

| Kind | Where it lives | Example |
|---|---|---|
| Observed state | `evidence.json` | A theft was attributed to North Korea by the FBI |
| Latent condition | `world-map.json` nodes | "Agent & developer credential exposure: high" |
| Forecast event | `forecasts.json` | "A single crypto theft of $100M+ within 30 days" |
| Emergent path | `links.json` | Iran war → Gulf cables → Gulf cloud regions |

## How a probability is made

1. **Pick a reference class and count.** How often has this kind of event happened over a recent, comparable period? Convert to a monthly rate λ. For a window of *t* days, P = 1 − e^(−λ·t/30).
2. **Adjust.** Add or subtract a small number of points for current conditions. Each adjustment is tied to evidence where possible. Adjustments should rarely total more than ±15 points. If they do, the reference class is probably wrong.
3. **No base rate?** Say so in `base_rate.text`, use a scenario-judgment anchor, and set confidence to `low`.
4. **Range.** Give a subjective 80% interval.
5. **Argue with it.** Write the skeptic case (too high) and the escalation case (too low). The adjudicator says which one the evidence supports. It doesn't just split the difference.

The validator enforces that `base_rate.value + sum(adjustments.delta)` equals the published primary-horizon probability.

## Horizons

v1 uses **7 days** and **30 days** only. Updates are manual, so 24-hour and 72-hour forecasts would be stale most of the time. A forecast may leave a horizon `null` when the question only makes sense in one window (for example, election week).

## Likely, and under the radar (engine 1.1)

The site leads with forecasts that are probably true and that most people aren't expecting.

Each forecast has an `expected` block. It holds the probability a typical informed news reader would assign, for the forecast's primary window:

- `basis: "market"` uses prediction-market prices. Note any mismatch between the market's question and ours.
- `basis: "judgment"` is the forecaster's labeled estimate. It's a judgment, not a survey, and the site says so.

```
gap      = p(primary) − expected
surprise = gap × (0.5 + 0.5·newsworthiness)
```

**Likely, and under the radar** means p ≥ 55 and gap ≥ 20. Each one needs a `surprise_note` explaining why people would miss it. The validator enforces this. **Expected, but may not happen** means gap ≤ −5.

### Discovery tactics

Each forecast records the `tactic` that produced it:

| Tactic | Question it asks |
|---|---|
| `lagged-consequence` | What has already happened whose consequences haven't arrived yet? |
| `calendar` | What do rules, deadlines and procedures force to happen? |
| `precedent` | What followed the most similar past event? |
| `disjunction` | Which group of separate modest risks makes "at least one" likely? |
| `look-back` | Imagine the window has closed and everyone says "obviously." What happened? |
| `reverse-gap` | What does everyone expect that the evidence doesn't support? |
| `base-rate` | The plain frequency, when that alone is surprising |
| `scenario` | Judgment where no base rate exists |

Most real edge comes from `lagged-consequence` and `calendar`. Specialists usually already know about obviously likely events. The overlooked ones are where consequences lag the news, or where rules force an outcome nobody is watching.

## Signal score

```
Signal = 100 × √p × impact × (0.5 + 0.5·newsworthiness)
             × (1 + 0.1·(domains − 1))
             × attention   (low 1.15 · medium 1.0 · high 0.85)
             × (0.6 + 0.4·share of pathway nodes with evidence)
```

p, impact and newsworthiness are taken as fractions of 1 (a 0–100 score divided by 100). The square root keeps low-probability, high-impact events visible without letting them dominate. The attention term favors underwatched events. The evidence term penalizes pathways held up by precedent alone. The score is a ranking aid, not a measurement.

## Evidence

Reliability grades: **A** official or primary, **B** wire service or established specialist outlet, **C** aggregator, anonymous-source or secondary, **D** weak signal. Records that trace back to the same underlying report share an `independence cluster` and count once.

Each record is labeled `confirmed` or `reported`. Model inferences are labeled separately, in `links.json`.

## World map

Edges are typed (`ENABLES`, `INCREASES`, `TRIGGERS`, `MITIGATES`, `CORRELATED_WITH`…). Each one carries strength, confidence, lag, and a basis: empirical, historical, theoretical or judgmental. Forecast pathways must follow existing edges.

## Deferred to later versions

These were considered and deferred on purpose. Without calibration data, they would add apparent precision without adding information:

- Monte Carlo world simulation
- Hawkes-style contagion parameters
- Formal actor utility models
- Automated media-attention measurement (attention is a labeled judgment in v1)

Each becomes worth building once there are enough resolved forecasts to fit or test it.
