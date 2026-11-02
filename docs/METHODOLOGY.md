# Methodology

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
