/* Emergence — single-page app. No build step, no dependencies. */
(() => {
  "use strict";

  // ---------- state ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("emergence." + k); return v === null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("emergence." + k, v); } catch { /* storage unavailable */ } },
  };
  const S = {
    horizon: store.get("horizon", "7d"),
    mode: store.get("mode", "briefing"),
    sort: "radar",
    evFilter: "all",
    data: null,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const view = $("#view");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => { if (!iso) return "Undated"; const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
  const fmtShort = (iso) => { const d = new Date(iso + "T12:00:00"); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };

  // ---------- data ----------
  async function load() {
    const files = ["forecasts", "world-map", "evidence", "links", "forecast-index", "resolutions", "stories", "calendar"];
    const out = await Promise.all(files.map((f) => fetch(`data/${f}.json`, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(`data/${f}.json returned ${r.status}`); return r.json(); })));
    const [fc, map, ev, links, index, res, stories, calendar] = out;
    const nodes = Object.fromEntries(map.nodes.map((n) => [n.id, n]));
    const evidence = Object.fromEntries(ev.records.map((e) => [e.id, e]));
    const forecasts = fc.forecasts;
    const byId = Object.fromEntries(forecasts.map((f) => [f.id, f]));
    const paths = Object.fromEntries(links.paths.map((p) => [p.id, p]));
    const storyById = Object.fromEntries(stories.stories.map((x) => [x.id, x]));
    S.data = { fc, map, nodes, ev, evidence, forecasts, byId, links, paths, index, res, stories, storyById, calendar };
  }

  // ---------- model helpers ----------
  const STATE_LEVEL = { low: 1, moderate: 2, elevated: 3, high: 4, severe: 5 };
  const ATTN = { low: 1.15, medium: 1, high: 0.85 };

  function pAt(f, h) { const v = f.p[h]; return v === null || v === undefined ? null : v; }
  function effH(f, h) { return pAt(f, h) === null ? f.primary : h; }

  function activation(f) {
    const ns = f.pathway.map((id) => S.data.nodes[id]);
    const withEv = ns.filter((n) => n.evidence && n.evidence.length).length;
    return ns.length ? withEv / ns.length : 0;
  }
  /** Signal score — see "How it works" for the formula. Visible, not objective. */
  function signal(f, h) {
    const p = pAt(f, h); if (p === null) return null;
    const d = f.domains.length;
    const s = 100 * Math.sqrt(p / 100) * (f.impact / 100) * (0.5 + 0.5 * f.newsworthiness / 100) * (1 + 0.1 * (d - 1)) * ATTN[f.attention] * (0.6 + 0.4 * activation(f));
    return Math.round(s);
  }
  // Public expectation is estimated for each forecast's main (primary) window.
  const pp = (f) => f.p[f.primary];
  const gap = (f) => pp(f) - f.expected.value;
  /** Surprise score: the gap, weighted by how much it would be news. */
  const surprise = (f) => Math.round(gap(f) * (0.5 + 0.5 * f.newsworthiness / 100));
  const isUnderRadar = (f) => pp(f) >= 55 && gap(f) >= 20;
  const isOverexpected = (f) => gap(f) <= -5;
  function pulsePicks() {
    const fs = S.data.forecasts;
    const bySurprise = [...fs].sort((a, b) => surprise(b) - surprise(a));
    const under = bySurprise.filter(isUnderRadar);
    const hero = under[0] || bySurprise[0];
    const second = under.find((f) => f !== hero);
    const over = fs.filter(isOverexpected).sort((a, b) => gap(a) - gap(b))[0];
    const tail = fs.filter((f) => pp(f) <= 20 && f.impact >= 70 && f !== over).sort((a, b) => b.impact * b.newsworthiness - a.impact * a.newsworthiness)[0];
    return { hero, second, over, tail, underCount: under.length };
  }
  /** Plain-English likelihood. */
  const word = (p) => (p >= 90 ? "Almost certain" : p >= 70 ? "Likely" : p >= 55 ? "More likely than not" : p >= 45 ? "Toss-up" : p >= 30 ? "Possible" : p >= 10 ? "Unlikely" : "Very unlikely");
  const peopleGuess = (f) => `${f.expected.basis === "market" ? "Betting markets put it at" : "Most people would guess"} about ${f.expected.value}%`;
  const gapText = (f) => { const g = gap(f); return `${f.expected.basis === "market" ? "Markets" : "Most people"} ~${f.expected.value}% (${g > 0 ? "+" : ""}${g} pts)`; };
  function gapBar(f) {
    const p = pp(f), e = f.expected.value, lo = Math.min(p, e), hi = Math.max(p, e);
    const who = f.expected.basis === "market" ? "Markets" : "Most people";
    const edge = (v) => (v < 10 ? " el" : v > 90 ? " er" : "");
    return `<div class="gapbar" role="img" aria-label="Model ${p} percent; ${who.toLowerCase()} about ${e} percent">
      <span class="g-axis"></span><span class="g-span ${p >= e ? "up" : "down"}" style="left:${lo}%;width:${hi - lo}%"></span>
      <span class="g-mark g-exp${edge(e)}" style="left:${e}%"><i></i><em>${who === "Markets" ? "Betting markets" : "Most people"} ~${e}%</em></span>
      <span class="g-mark g-mod${edge(p)}" style="left:${p}%"><i></i><em>Our forecast ${p}%</em></span>
    </div>`;
  }
  function lastMove(f) {
    const h = f.history; if (!h || h.length < 2) return null;
    const a = h[h.length - 2], b = h[h.length - 1];
    const k = f.primary; return { delta: b.p[k] - a.p[k], reason: b.reason, at: b.at };
  }

  // ---------- small renderers ----------
  const DOMLABEL = () => Object.fromEntries(S.data.map.domains.map((d) => [d.id, d.label]));
  const domColor = (d) => `var(--d-${d})`;
  const chips = (ds) => `<span class="domains">${ds.map((d) => `<span class="dom" data-d="${d}">${esc(DOMLABEL()[d])}</span>`).join("")}</span>`;
  const chain = (ids) => `<span class="chain">${ids.map((id, i) => `${i ? '<span class="arr" aria-hidden="true">›</span>' : ""}<span class="n">${esc(S.data.nodes[id].label)}</span>`).join("")}</span>`;
  const meters = (f, h) => `<div class="meters" aria-label="Probability, impact and newsworthiness">
      <div class="meter" data-k="p"><span>Probability</span><span class="track"><span class="fill" style="width:${pAt(f, h) ?? 0}%"></span></span></div>
      <div class="meter" data-k="impact"><span>Impact</span><span class="track"><span class="fill" style="width:${f.impact}%"></span></span></div>
      <div class="meter" data-k="news"><span>Newsworthiness</span><span class="track"><span class="fill" style="width:${f.newsworthiness}%"></span></span></div>
    </div>`;
  const stateBars = (state, d) => { const lv = STATE_LEVEL[state] || 0; return `<span class="state" style="--c:${domColor(d)}"><i aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<b class="${i <= lv ? "on" : ""}"></b>`).join("")}</i>${esc(state[0].toUpperCase() + state.slice(1))}</span>`; };
  const hLabel = (h) => S.data.fc.horizons[h].label;
  const closes = (h) => fmtShort(S.data.fc.horizons[h].closes);
  const rel = (r) => `<span class="rel" data-r="${r}" title="Reliability ${r}">${r}</span>`;

  function evRow(e) {
    return `<div class="ev">${rel(e.reliability)}<div>
      <p class="claim">${esc(e.claim)}</p>
      <p class="src"><span class="status" data-s="${e.status}">${e.status === "confirmed" ? "Confirmed" : "Reported claim"}</span><span>${esc(e.source)}</span><span>${fmtDate(e.date)}</span><a href="${esc(e.url)}" target="_blank" rel="noopener">Open source</a></p>
      ${e.notes ? `<p class="note">${esc(e.notes)}</p>` : ""}
    </div></div>`;
  }

  // ---------- views ----------
  // ---------- stories ----------
  const STYPE_COLOR = { later: "var(--blue)", smaller: "var(--green)", bigger: "var(--violet)", "in-motion": "var(--amber)", collision: "var(--red)" };
  const stype = (st) => S.data.stories.types[st.type].label;
  function receipt(w) {
    const f = w.forecast ? S.data.byId[w.forecast] : null;
    if (!f) return "";
    return `<span class="rc${w.expect === "no" ? " rc-no" : ""}"><b>${wp(w, f)}%</b>${esc(f.short)}</span>`;
  }
  const wh = (w, f) => (w.h && f.p[w.h] != null ? w.h : f.primary);
  const wp = (w, f) => f.p[wh(w, f)];
  function storyCard(st, big) {
    return `<a class="story${big ? " story-big" : ""}" href="#/story/${st.id}" style="--c:${STYPE_COLOR[st.type]}">
      <span class="stype">${esc(stype(st))}</span>
      <h3>${esc(st.title)}</h3>
      <div class="contrast"><p><span>You'd think</span>${esc(st.think)}</p><p><span>More likely</span>${esc(st.actually)}</p></div>
      <div class="receipts">${st.watch.map(receipt).join("")}</div>
    </a>`;
  }
  const lastClose = (st) => st.forecasts.map((id) => S.data.fc.horizons[S.data.byId[id].primary].closes).sort().pop();

  function viewPulse() {
    const { hero, second, over } = pulsePicks();
    const B = S.data.stories.brief;
    const L = S.data.links;
    const pickHTML = (f, kind, label, why) => f ? `<a class="pick" data-kind="${kind}" href="#/forecast/${f.id}">
        <span class="kind">${label}</span>
        <span class="num">${pp(f)}%<small>${esc(word(pp(f)).toLowerCase())}, by ${closes(f.primary)}</small></span>
        <span class="t">${esc(f.title)}</span>
        <span class="why">${why(f)}</span></a>` : "";
    return `
      <section class="brief" aria-labelledby="brief-title">
        <p class="intro">Emergence reads AI, cybersecurity, elections, world politics and markets side by side, to spot what news covering one topic at a time tends to miss. New every Monday.</p>
        <p class="brief-date">This week's brief, ${fmtDate(B.date)}</p>
        <h1 id="brief-title" class="brief-title">${esc(B.title)}</h1>
        ${B.changes && B.changes.length ? `<div class="changes"><h2>What changed since last week</h2><ul>${B.changes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
        <div class="brief-body">${B.paragraphs.map((x) => `<p>${esc(x)}</p>`).join("")}</div>
      </section>
      <section class="stories-sec" aria-labelledby="stories-h">
        <h2 id="stories-h">The stories behind this week</h2>
        <div class="story-list">${B.stories.map((id) => storyCard(S.data.storyById[id])).join("")}</div>
      </section>
      <h2 class="trio-h">Numbers to watch</h2>
      <section class="trio" aria-label="Numbers to watch">
        ${pickHTML(hero, "likely", "Likely, but few expect it", (f) => `${peopleGuess(f)}.`)}
        ${pickHTML(second, "likely", "Also likely, but few expect it", (f) => `${peopleGuess(f)}.`)}
        ${pickHTML(over, "underwatched", "Expected, but may not happen", (f) => `${peopleGuess(f)}. We think it's less likely.`)}
      </section>
      <section class="pulse-foot">
        <div class="unknown">
          <span class="label">Biggest model unknown</span>
          <h3>${esc(L.biggest_unknown.title)}</h3>
          <p>${esc(L.biggest_unknown.text)}</p>
          <p style="margin-top:1rem"><button type="button" class="link" data-node="${L.biggest_unknown.node}">See the node</button></p>
        </div>
        <div class="foot-links">
          <h3 class="foot-h">Next dates when things actually get decided</h3>
          <div class="nextdates">${upcoming().slice(0, 3).map((e) => `<a href="#/calendar"><b>${fmtShort(e.date)}</b><span>${esc(e.title)}</span></a>`).join("") || '<p class="muted">No dates scheduled.</p>'}</div>
          <p><a class="link" href="#/calendar">See the full calendar</a></p>
          <p><a class="link" href="#/predictions">See every prediction</a></p>
          <p><a class="link" href="#/connections">Connections between separate events</a></p>
          <p><a class="link" href="#/method">How these stories and numbers are made</a></p>
          <p><a class="link" href="feed.xml">Follow by RSS</a></p>
        </div>
      </section>`;
  }

  const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const upcoming = () => S.data.calendar.entries.filter((e) => e.date >= todayISO()).sort((a, b) => a.date.localeCompare(b.date));
  function viewCalendar() {
    const t = todayISO();
    const es = [...S.data.calendar.entries].sort((a, b) => a.date.localeCompare(b.date));
    const next = es.find((e) => e.date >= t);
    return `<header class="page-head"><h1>When we'll actually know</h1><p>News builds up to moments. This is the calendar of when things are actually decided, with what the coverage implies next to what's really scheduled. Updates to the site land on these dates.</p></header>
      <ol class="cal-list">${es.map((e) => { const past = e.date < t; return `<li class="cal-item${past ? " past" : ""}${e === next ? " next" : ""}">
        <div class="cal-date"><b>${new Date(e.date + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}</b><span>${new Date(e.date + "T12:00:00").getDate()}</span></div>
        <div class="cal-body">
          ${e === next ? '<span class="cal-next">Next</span>' : ""}
          <h3>${esc(e.title)}</h3>
          <div class="contrast"><p><span>What the coverage implies</span>${esc(e.hype)}</p><p><span>What's actually scheduled</span>${esc(e.reality)}</p></div>
          ${e.outcome ? `<p class="cal-outcome"><b>What happened:</b> ${esc(e.outcome)}</p>` : ""}
          <div class="receipts">${e.forecasts.map((id) => { const f = S.data.byId[id]; return f ? `<a class="rc" href="#/forecast/${f.id}"><b>${pp(f)}%</b>${esc(f.short)}</a>` : ""; }).join("")}${e.stories.map((id) => `<a class="rc rc-story" href="#/story/${id}">${esc(S.data.storyById[id].title.split(".")[0])}</a>`).join("")}</div>
        </div></li>`; }).join("")}</ol>`;
  }

  const STRENGTH = { strong: "Strong link", plausible: "Plausible link", speculative: "Speculative" };
  function viewConnections() {
    const L = S.data.links;
    return `<header class="page-head"><h1>Connections</h1><p>Things that happened separately and were reported separately, and why they may be more than a coincidence. Each one says honestly how strong the link is, and what would confirm or rule it out.</p></header>
      <div class="conn-list">${L.connections.map((c) => `<article class="conn" data-s="${c.strength}">
        <header><span class="strength">${STRENGTH[c.strength]}</span><h2>${esc(c.title)}</h2></header>
        <ol class="events">${c.events.map((e) => `<li><time>${fmtShort(e.date)}</time><span>${esc(e.text)}${e.evidence.map((x) => ` <button type="button" class="link src-link" data-ev="${x}" aria-label="Source ${x}">source</button>`).join("")}</span></li>`).join("")}</ol>
        <div class="conn-link"><h3>The possible link</h3><p>${esc(c.link)}</p></div>
        <div class="conn-confirm"><h3>What would confirm it or rule it out</h3><p>${esc(c.confirm)}</p></div>
        ${c.stories.length ? `<p class="conn-stories">${c.stories.map((id) => `<a class="link" href="#/story/${id}">${esc(S.data.storyById[id].title)}</a>`).join("")}</p>` : ""}
      </article>`).join("")}</div>
      <section class="section"><h2>How strong is strong?</h2><dl class="types">${Object.entries(L.strength_scale).map(([k, v]) => `<div class="st-${k}"><dt>${STRENGTH[k]}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></section>`;
  }

  function viewStories() {
    const L = S.data.links;
    const T = S.data.stories.types;
    return `<header class="page-head"><h1>Stories</h1><p>Claims about what's really going on, written so they can be checked. Each one says what you'd expect, what's more likely, what you'll see if it's right, and what would prove it wrong. Its forecasts are the receipts.</p></header>
      <div class="story-list">${S.data.stories.stories.map((st) => storyCard(st)).join("")}</div>
      <section class="section"><h2>Story types</h2><dl class="types">${Object.entries(T).map(([k, v]) => `<div style="--c:${STYPE_COLOR[k]}"><dt>${esc(v.label)}</dt><dd>${esc(v.text)}</dd></div>`).join("")}</dl></section>
      <p class="small" style="margin-top:2.5rem"><a class="link" href="#/connections">See the connections between separate events</a></p>`;
  }

  function viewStory(id) {
    const st = S.data.storyById[id]; if (!st) return notFound();
    const path = st.path ? S.data.paths[st.path] : null;
    const verdict = { open: `It gets a verdict once its forecasts close; the last one closes ${fmtShort(lastClose(st))}.`, held: "Held up.", partly: "Partly held up.", wrong: "Wrong." }[st.status];
    return `<article class="story-page" style="--c:${STYPE_COLOR[st.type]}">
      <header class="story-head">
        <span class="stype">${esc(stype(st))}</span>
        <h1>${esc(st.title)}</h1>
        <div class="contrast big"><p><span>You'd think</span>${esc(st.think)}</p><p><span>More likely</span>${esc(st.actually)}</p></div>
        <p class="story-status"><span class="pill">${st.status === "open" ? "Open" : esc(verdict)}</span> ${st.status === "open" ? esc(verdict) : esc(st.verdict)}</p>
      </header>
      <div class="cols">
        <div class="story-body">${st.body.map((x) => `<p>${esc(x)}</p>`).join("")}</div>
        <div>
          <div class="block"><h2>What you'll see if this is right</h2>
            <div class="watch">${st.watch.map((w) => { const f = w.forecast ? S.data.byId[w.forecast] : null;
              return f ? `<a class="wrow" href="#/forecast/${f.id}"><b>${wp(w, f)}%</b><span>${esc(w.text)}<em>${w.expect === "no" ? "The story expects this not to happen. " : ""}By ${closes(wh(w, f))}</em></span></a>`
                       : `<div class="wrow"><b>—</b><span>${esc(w.text)}<em>Not a scored forecast</em></span></div>`; }).join("")}</div>
          </div>
          <div class="block"><h2>What would prove it wrong</h2><ul class="bullets">${st.wrong.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          ${path ? `<div class="block"><h2>The chain underneath</h2><div class="linked"><a href="#/links/${path.id}"><b>${path.steps.filter((x) => x.status === "observed").length}/${path.steps.length}</b><span>${esc(path.title)}</span></a></div></div>` : ""}
        </div>
      </div>
      ${st.postmortem ? `<section class="section postmortem"><h2>Postmortem</h2><p>${esc(st.postmortem)}</p></section>` : ""}
      <details class="reasoning section"><summary>Why this made the cut</summary>
        <dl class="tests">
          <div><dt>People already care</dt><dd>${esc(st.tests.cares)}</dd></div>
          <div><dt>It overturns an expectation</dt><dd>${esc(st.tests.overturns)}</dd></div>
          <div><dt>You'll see it soon</dt><dd>${esc(st.tests.visible)}</dd></div>
          <div><dt>It changes what to watch</dt><dd>${esc(st.tests.changes)}</dd></div>
        </dl>
      </details>
      <section class="section"><h2>Evidence</h2>${st.evidence.map((e) => evRow(S.data.evidence[e])).join("")}</section>
    </article>`;
  }

  const SORTS = {
    radar: { label: "Under the radar", note: "Ranked by the gap between the model's probability and what most people would expect, weighted by how newsworthy the event would be. Gaps use each forecast's main window.", fn: () => (a, b) => surprise(b) - surprise(a) },
    over: { label: "Overexpected", note: "Events most people, or prediction markets, think are more likely than the model does.", filter: (f) => isOverexpected(f), fn: () => (a, b) => gap(a) - gap(b) },
    signal: { label: "Cross-domain", note: "Ranked by Signal score: probability, impact, newsworthiness, how many domains a forecast crosses, and how little attention it's getting. Higher means more worth noticing, not more likely.", fn: (h) => (a, b) => signal(b, h) - signal(a, h) },
    likely: { label: "Most likely", note: "Highest probability first.", fn: (h) => (a, b) => pAt(b, h) - pAt(a, h) },
    important: { label: "Most important", note: "Probability × impact.", fn: (h) => (a, b) => pAt(b, h) * b.impact - pAt(a, h) * a.impact },
    underwatched: { label: "Underwatched", note: "Forecasts with low public attention, ranked by Signal score. Low attention is not evidence that an event is likely.", filter: (f) => f.attention === "low", fn: (h) => (a, b) => signal(b, h) - signal(a, h) },
    tails: { label: "Tail risks", note: "20% or less, with impact of 70 or more.", filter: (f, h) => pAt(f, h) <= 20 && f.impact >= 70, fn: (h) => (a, b) => b.impact - a.impact },
  };

  function rowHTML(f) {
    const p = pp(f);
    const st = S.data.stories.stories.find((x) => x.forecasts.includes(f.id));
    return `<a class="row" href="#/forecast/${f.id}">
      <div class="p">${p}<small>%</small><span class="word">${esc(word(p))}</span></div>
      <div class="info">
        <h3>${esc(f.title)}</h3>
        <span class="delta">Decided by ${closes(f.primary)}. ${esc(peopleGuess(f))}.</span>
        ${st ? `<span class="delta">Part of the story: ${esc(st.title)}</span>` : ""}
      </div>
    </a>`;
  }

  function viewPredictions() {
    const fs = S.data.forecasts;
    const likely = fs.filter((f) => pp(f) >= 55).sort((a, b) => surprise(b) - surprise(a) || pp(b) - pp(a));
    const rest = fs.filter((f) => pp(f) < 55).sort((a, b) => pp(b) - pp(a));
    return `
      <header class="page-head"><h1>Predictions</h1><p>Each one is a yes-or-no question with a deadline. When the deadline passes, it's checked against named sources and scored. The ones most people aren't expecting come first.</p></header>
      <div class="rows">${likely.map(rowHTML).join("")}</div>
      ${rest.length ? `<details class="more-list"><summary>Less likely possibilities (${rest.length})</summary>
        <p class="small muted" style="margin:1rem 0">These are tracked because they'd matter a lot if they happened, or because a story depends on them.</p>
        <div class="rows">${rest.map(rowHTML).join("")}</div></details>` : ""}`;
  }

  const FTABS = [["overview", "Overview"], ["number", "Why this number"], ["resolution", "How it's decided"], ["evidence", "Sources"], ["history", "History"]];
  const FTAB_ALL = [...FTABS, ["pathway", "Step-by-step chain"]];

  function viewForecast(id, tab) {
    const f = S.data.byId[id];
    if (!f) return notFound();
    tab = FTAB_ALL.some(([k]) => k === tab) ? tab : "overview";
    const h = f.primary; // a forecast page always leads with its main window

    const head = `
      <header class="fhead">
        <div class="big">${pAt(f, h)}<sup>%</sup></div>
        <div>
          <h1>${esc(f.title)}</h1>
          ${chips(f.domains)}
          <div class="facts">
            <span><b>${esc(word(pp(f)))}</b></span>
            <span>Decided by <b>${closes(h)}</b></span>
            <span>${esc(peopleGuess(f))}</span>
          </div>
        </div>
      </header>
      <nav class="tabs" aria-label="Forecast sections">${FTABS.map(([k, l]) => `<a href="#/forecast/${f.id}/${k}" ${k === tab ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>`;
    const body = { overview: fOverview, pathway: fPathway, number: fNumber, evidence: fEvidence, resolution: fResolution, history: fHistory }[tab](f, h);
    return head + body;
  }

  function fOverview(f) {
    return `<div class="cols">
      <div>
        <div class="block"><h2>In plain terms</h2><p class="lede">${esc(f.summary)}</p></div>
        ${f.surprise_note ? `<div class="block"><h2>Why most people would miss this</h2><p>${esc(f.surprise_note)}</p>${gapBar(f)}</div>` : ""}
        <div class="block"><h2>Why now</h2><ul class="bullets">${f.why_now.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>
        <details class="reasoning"><summary>Show the reasoning</summary>
          <p class="small muted" style="margin:.75rem 0 1rem">The strongest case that the number is too high, too low, and which side the evidence supports.</p>
          <div class="debate">
            <div class="voice" data-v="skeptic"><h3>Why it might be too high</h3><p>${esc(f.skeptic)}</p></div>
            <div class="voice" data-v="escalation"><h3>Why it might be too low</h3><p>${esc(f.escalation)}</p></div>
            <div class="voice" data-v="adjudicator"><h3>What the evidence supports</h3><p>${esc(f.adjudicator)}</p></div>
          </div>
        </details>
      </div>
      <div>
        <div class="block"><h2>What would raise it</h2><ul class="bullets up">${f.increase_if.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>
        <div class="block"><h2>What would lower it</h2><ul class="bullets down">${f.decrease_if.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>
        <div class="block"><h2>How it connects</h2>${chain(f.pathway)}<p style="margin-top:.6rem"><a class="link" href="#/forecast/${f.id}/pathway">See the step-by-step chain</a></p></div>
      </div>
    </div>`;
  }

  function fPathway(f) {
    const related = S.data.links.paths.filter((p) => p.forecasts.includes(f.id));
    return `<div class="cols"><div>
      <div class="block"><h2>The main route</h2><p class="small muted" style="margin-bottom:1.5rem">Select any step to see its sources and what it affects.</p>
      <div class="path">${f.pathway.map((id) => {
        const n = S.data.nodes[id];
        const st = n.evidence.length ? "observed" : "hypothetical";
        return `<div class="pstep" data-s="${st}" style="--c:${domColor(n.domain)}"><span class="pmark" aria-hidden="true"></span><div class="pbody">
          <button type="button" data-node="${id}">${esc(n.label)}</button>
          <p>${esc(n.summary)}</p>
          <p class="st">${stateBars(n.state, n.domain)}<span>${esc(DOMLABEL()[n.domain])}</span><span>${n.evidence.length ? `${n.evidence.length} evidence record${n.evidence.length > 1 ? "s" : ""}` : "No direct evidence this cycle"}</span></p>
        </div></div>`;
      }).join("")}
        <div class="pstep" data-s="hypothetical" style="--c:var(--ink)"><span class="pmark" aria-hidden="true"></span><div class="pbody"><b>${esc(f.short)}</b><p>The forecast event.</p></div></div>
      </div></div></div>
      <div>${related.length ? `<div class="block"><h2>Part of these hidden links</h2><div class="linked">${related.map((p) => `<a href="#/links/${p.id}"><b>${p.steps.filter((s) => s.status === "observed").length}/${p.steps.length}</b><span>${esc(p.title)}</span></a>`).join("")}</div><p class="xs muted" style="margin-top:.75rem">The number shows how many steps in each path are already observed.</p></div>` : ""}</div>
    </div>`;
  }

  function fNumber(f, h) {
    const prim = f.primary;
    let run = f.base_rate.value;
    const max = 100;
    const rows = f.adjustments.map((a) => {
      const from = run; run += a.delta;
      const lo = Math.min(from, run), w = Math.abs(a.delta);
      return `<div class="frow"><span class="lbl">${esc(a.label)}</span><span class="ftrack" aria-hidden="true"><span class="${a.delta >= 0 ? "up" : "down"}" style="left:${lo / max * 100}%;width:${Math.max(w / max * 100, .6)}%"></span></span><span class="v ${a.delta >= 0 ? "up" : "down"}">${a.delta > 0 ? "+" : ""}${a.delta}</span></div>`;
    }).join("");
    const r = f.range[prim];
    return `<div class="block"><h2>How we got this number</h2>
      <p style="margin-bottom:1.5rem">We start from how often things like this have actually happened, then adjust for what's different right now. Each adjustment is shown below.</p>
      <div class="fall">
        <div class="frow"><span class="lbl"><b>Starting point: how often this has happened</b>${esc(f.base_rate.text)}</span><span class="ftrack" aria-hidden="true"><span class="base" style="width:${f.base_rate.value}%"></span></span><span class="v">${f.base_rate.value}</span></div>
        ${rows}
        <div class="frow total"><span class="lbl"><b>Our forecast</b></span><span class="ftrack" aria-hidden="true"><span class="final" style="width:${f.p[prim]}%"></span></span><span class="v">${f.p[prim]}%</span></div>
      </div>
      <p style="margin-top:1.25rem">How sure are we? We'd be surprised if the real chance were below ${r[0]}% or above ${r[1]}%. Our confidence in this number is ${esc(f.confidence)}.</p>
    </div>
    <div class="block"><h2>Us vs. ${f.expected.basis === "market" ? "betting markets" : "most people"}</h2>
      <p class="small">${f.expected.basis === "market" ? "Taken from prediction-market prices." : "Our estimate of what a typical person following the news would guess. It's a judgment, not a survey."} ${esc(f.expected.note)}</p>
      ${gapBar(f)}
    </div>
    ${f.market.status === "checked" ? `<div class="block"><h2>What betting markets say</h2><p class="small">${esc(f.market.note)}</p></div>` : ""}`;
  }

  function fEvidence(f) {
    const rows = f.evidence.map((id) => S.data.evidence[id]).filter(Boolean);
    const clusters = new Set(rows.map((e) => e.cluster)).size;
    return `<div class="block"><h2>What supports this forecast</h2>
      <p class="small muted" style="margin-bottom:1rem">${rows.length} record${rows.length === 1 ? "" : "s"} from ${clusters} independent source cluster${clusters === 1 ? "" : "s"}. Repeats of the same underlying report count once.</p>
      ${rows.map(evRow).join("")}</div>`;
  }

  function fResolution(f) {
    const h = f.primary;
    return `<div class="block"><h2>Resolves yes if</h2><div class="res"><p>${esc(f.resolution.condition)}</p></div></div>
      <div class="cols" style="margin-top:2rem"><div class="block"><h2>Edge cases</h2><ul class="bullets">${f.resolution.ambiguous.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>
      <div class="block"><h2>Deciding sources</h2><ul class="bullets">${f.resolution.sources.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      <p class="small muted" style="margin-top:1rem">Window opens ${fmtShort(S.data.fc.horizons[h].opens)} and closes ${closes(h)}.</p></div></div>`;
  }

  function fHistory(f) {
    const hs = f.history;
    return `<div class="block"><h2>Why it moved</h2>
      <p style="margin-bottom:1.25rem">Past forecasts are never rewritten. Each update adds a line here explaining what changed, point by point.</p>
      <div class="moves">${hs.map((m, i) => {
        const prev = hs[i - 1];
        const d = prev ? m.p[f.primary] - prev.p[f.primary] : null;
        return `<div class="move"><span class="when">${fmtDate(m.at)}</span><span>${esc(m.reason)}</span><b>${m.p[f.primary]}%${d !== null ? ` (${d > 0 ? "+" : ""}${d})` : ""}</b></div>`;
      }).join("")}</div>
      ${hs.length < 2 ? '<p class="small muted" style="margin-top:1rem">First published this cycle. Moves will appear here after the next update.</p>' : ""}</div>`;
  }

  function viewLinks() {
    return `<header class="page-head"><h1>Chains</h1><p>Step-by-step chains behind the stories. Each starts from something already happening and ends at a prediction. The bars show how many steps have already happened.</p></header>
      <div class="plist">${S.data.links.paths.map((p) => `<a class="prow" href="#/links/${p.id}">
        <div><h3>${esc(p.title)}</h3><p class="tag">${esc(p.tagline)}</p>
          <div class="prog" aria-hidden="true">${p.steps.map((s) => `<i data-s="${s.status}"></i>`).join("")}</div>
          <div style="margin-top:.8rem">${chips(p.domains)}</div></div>
        <div class="cnt"><b>${p.steps.filter((s) => s.status === "observed").length} of ${p.steps.length}</b>steps observed</div>
      </a>`).join("")}</div>`;
  }

  function viewLink(id) {
    const p = S.data.paths[id]; if (!p) return notFound();
    const stLabel = { observed: "Observed", partial: "Partly realized", hypothetical: "Not yet observed" };
    return `<header class="page-head"><h1>${esc(p.title)}</h1><p>${esc(p.tagline)}</p><div style="margin-top:1rem">${chips(p.domains)}</div></header>
      <div class="hiddenwhy"><span class="label">Why this is easy to miss</span><p style="margin-top:.35rem">${esc(p.why_hidden)}</p>${p.model_inference ? '<p class="inference" style="margin-top:.6rem">This connection is the model\'s own inference, not a reported finding.</p>' : ""}</div>
      <div class="cols"><div>
        <div class="legend"><span><i class="lm o"></i>Observed</span><span><i class="lm pa"></i>Partly realized</span><span><i class="lm h"></i>Not yet observed</span></div>
        <div class="path">${p.steps.map((s) => { const n = S.data.nodes[s.node]; return `<div class="pstep" data-s="${s.status}" style="--c:${domColor(n.domain)}"><span class="pmark" aria-hidden="true"></span><div class="pbody">
          <button type="button" data-node="${n.id}">${esc(s.text)}</button>
          <p class="st"><span>${stLabel[s.status]}</span><span>${esc(n.label)}</span>${s.evidence.map((e) => `<button type="button" class="link" data-ev="${e}">${e}</button>`).join("")}</p>
        </div></div>`; }).join("")}</div>
      </div>
      <div class="block"><h2>Forecasts on this path</h2><div class="linked">${p.forecasts.map((fid) => { const f = S.data.byId[fid]; return `<a href="#/forecast/${f.id}"><b>${pp(f)}%</b><span>${esc(f.title)}</span></a>`; }).join("")}</div></div>
      </div>`;
  }

  // world map
  function viewMap() {
    const { map, nodes } = S.data;
    const W = 1000, H = 620, px = (n) => 40 + n.x / 100 * 920, py = (n) => 34 + n.y / 100 * 552;
    const edges = map.edges.map((e) => {
      const a = nodes[e.from], b = nodes[e.to];
      const x1 = px(a), y1 = py(a), x2 = px(b), y2 = py(b);
      const mx = (x1 + x2) / 2 + (y2 - y1) * 0.12, my = (y1 + y2) / 2 - (x2 - x1) * 0.12;
      const dash = e.basis === "theoretical" || e.basis === "judgmental" ? 'stroke-dasharray="4 5"' : "";
      return `<path class="m-edge" data-e="${e.id}" data-from="${e.from}" data-to="${e.to}" d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" stroke-width="${1 + e.strength * 2.5}" opacity="${0.25 + e.strength * 0.55}" ${dash} marker-end="url(#arrow)"><title>${esc(a.label)} ${e.type.toLowerCase().replace("_", " ")} ${esc(b.label)}</title></path>`;
    }).join("");
    const ns = map.nodes.map((n) => {
      const r = 6 + n.weight * 3, lv = STATE_LEVEL[n.state];
      const x = px(n), y = py(n);
      const side = n.label_side || "r";
      const anchor = side === "l" ? "end" : side === "r" ? "start" : "middle";
      const dx = side === "l" ? -(r + 8) : side === "r" ? r + 8 : 0;
      const dy = side === "b" ? r + 18 : side === "t" ? -(r + 8) : 4;
      return `<g class="m-node" data-node="${n.id}" tabindex="0" role="button" aria-label="${esc(n.label)}, ${n.state}">
        <circle class="halo" cx="${x}" cy="${y}" r="${r + lv * 3.5}" fill="${domColor(n.domain)}"/>
        <circle class="core" cx="${x}" cy="${y}" r="${r}" fill="${domColor(n.domain)}"/>
        <text x="${x + dx}" y="${y + dy}" text-anchor="${anchor}">${esc(n.label)}</text></g>`;
    }).join("");
    const opts = map.nodes.map((n) => `<option value="${n.id}">${esc(n.label)}</option>`).join("");
    return `<header class="page-head"><h1>World map</h1><p>The ${map.nodes.length} conditions the model tracks and the ${map.edges.length} links between them. Bigger dots matter more to the forecasts, and a brighter halo means a more stressed condition. Solid lines rest on evidence; dashed lines are judgment or theory. Select any dot to open its details.</p></header>
      <div class="mapwrap"><svg viewBox="0 0 ${W} ${H}" role="group" aria-label="World map of tracked conditions">
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#4A6191"/></marker></defs>
        ${edges}${ns}</svg></div>
      <p class="maphint xs muted">Scroll sideways to see the whole map.</p>
      <div class="maplegend">${map.domains.map((d) => `<span class="dom" data-d="${d.id}">${esc(d.label)}</span>`).join("")}</div>
      <section class="connect" aria-labelledby="connect-h">
        <h2 id="connect-h" style="font-size:var(--t-lg)">What connects these?</h2>
        <p class="muted small">Pick any two conditions to see every modeled route between them, up to four steps.</p>
        <form class="connect-form" id="connect-form">
          <label>From<select name="a">${opts}</select></label>
          <label>To<select name="b">${opts}</select></label>
          <button class="btn" type="submit">Find connections</button>
        </form>
        <div id="connect-out" aria-live="polite"></div>
      </section>`;
  }

  function findPaths(a, b, directed) {
    const adj = {};
    for (const e of S.data.map.edges) {
      (adj[e.from] ||= []).push({ to: e.to, e });
      if (!directed) (adj[e.to] ||= []).push({ to: e.from, e });
    }
    const out = [];
    const walk = (cur, path, seen) => {
      if (out.length >= 6 || path.length > 5) return;
      if (cur === b && path.length > 1) { out.push([...path]); return; }
      for (const { to } of adj[cur] || []) if (!seen.has(to)) { seen.add(to); path.push(to); walk(to, path, seen); path.pop(); seen.delete(to); }
    };
    walk(a, [a], new Set([a]));
    return out.sort((x, y) => x.length - y.length);
  }
  function edgeBetween(a, b) { return S.data.map.edges.find((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)); }

  function bindMap() {
    const svg = $(".mapwrap svg"); if (!svg) return;
    const hl = (id) => {
      svg.querySelectorAll(".m-edge").forEach((p) => { const on = !id || p.dataset.from === id || p.dataset.to === id; p.classList.toggle("dim", !on); p.classList.toggle("hot", !!id && on); });
      svg.querySelectorAll(".m-node").forEach((g) => { const nid = g.dataset.node; const linked = !id || nid === id || S.data.map.edges.some((e) => (e.from === id && e.to === nid) || (e.to === id && e.from === nid)); g.classList.toggle("dim", !linked); });
    };
    svg.querySelectorAll(".m-node").forEach((g) => {
      g.addEventListener("mouseenter", () => hl(g.dataset.node));
      g.addEventListener("mouseleave", () => hl(null));
      g.addEventListener("focus", () => hl(g.dataset.node));
      g.addEventListener("blur", () => hl(null));
      g.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openNode(g.dataset.node); } });
    });
    const form = $("#connect-form");
    form.b.value = "N_ELECTION_STRESS"; form.a.value = "N_AGENT_AUTONOMY";
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const a = form.a.value, b = form.b.value, out = $("#connect-out");
      if (a === b) { out.innerHTML = '<p class="muted small">Pick two different conditions.</p>'; return; }
      let paths = findPaths(a, b, true), directed = true;
      if (!paths.length) { paths = findPaths(a, b, false); directed = false; }
      if (!paths.length) { out.innerHTML = `<p class="muted small" style="margin-top:1rem">No modeled route within four steps. That's a gap in the model, not proof the two are unrelated.</p>`; return; }
      out.innerHTML = `<p class="small muted" style="margin:1rem 0 .25rem">${paths.length} route${paths.length > 1 ? "s" : ""} found${directed ? "" : ". No direct cause-and-effect chain, so these follow links in either direction."}</p>` +
        paths.map((p) => `<div class="cpath">${chain(p)}<p class="why">${p.slice(1).map((n, i) => { const e = edgeBetween(p[i], n); return `${e.type.toLowerCase().replace(/_/g, " ")} (${e.basis}, ${e.confidence} confidence)`; }).join("; ")}</p></div>`).join("");
    });
  }

  function viewEvidence() {
    const recs = S.data.ev.records.filter((e) => S.evFilter === "all" || e.reliability === S.evFilter);
    const sc = S.data.ev.reliability_scale;
    const clusters = new Set(S.data.ev.records.map((e) => e.cluster)).size;
    return `<header class="page-head"><h1>Evidence</h1><p>Every fact the model uses, where it came from, and how much to trust it. ${S.data.ev.records.length} records in ${clusters} independent source clusters. Ten articles repeating one report count as one cluster.</p></header>
      <div class="scale">${Object.entries(sc).map(([k, v]) => `<div>${rel(k)}<span>${esc(v)}</span></div>`).join("")}</div>
      <div class="filters" role="group" aria-label="Filter by reliability">${["all", "A", "B", "C", "D"].map((k) => `<button type="button" data-evf="${k}" aria-pressed="${S.evFilter === k}">${k === "all" ? "All" : `Reliability ${k}`}</button>`).join("")}</div>
      <div>${recs.map(evRow).join("") || '<p class="empty">No records at this reliability level.</p>'}</div>`;
  }

  function viewRecord() {
    const fs = S.data.forecasts;
    const R = S.data.res.resolutions;
    const scored = R.filter((r) => r.outcome !== null);
    const brier = (r) => (r.p / 100 - r.outcome) ** 2;
    const avg = scored.length ? scored.reduce((t, r) => t + brier(r), 0) / scored.length : null;
    const today = new Date().toISOString().slice(0, 10);
    const key = (id, h) => `${id}|${h}|${S.data.fc.horizons[h].closes}`;
    const resolvedIds = new Set(R.map((r) => `${r.forecast}|${r.horizon}|${r.closes}`));
    const awaiting = fs.filter((f) => S.data.fc.horizons[f.primary].closes < today && !resolvedIds.has(key(f.id, f.primary)));
    const open = fs.filter((f) => !awaiting.includes(f) && !resolvedIds.has(key(f.id, f.primary)));
    const idx = S.data.index;
    const bins = Array.from({ length: 10 }, (_, i) => ({ lo: i * 10, n: 0, sp: 0, so: 0 }));
    for (const r of scored) { const b = bins[Math.min(9, Math.floor(r.p / 10))]; b.n++; b.sp += r.p; b.so += r.outcome; }
    const outcome = (r) => r.outcome === 1 ? "Yes" : r.outcome === 0 ? "No" : "Ambiguous";
    return `<header class="page-head"><h1>Track record</h1><p>Where the model's past calls are checked against what happened. Each forecast is scored on the number first published for its window, so later revisions can't improve the score.</p></header>
      <div class="scorecards">
        <div><b>${scored.length}</b><span>resolved</span></div>
        <div><b>${avg === null ? "—" : avg.toFixed(3)}</b><span>accuracy score (lower is better)</span></div>
        <div><b>${awaiting.length}</b><span>awaiting resolution</span></div>
        <div><b>${open.length}</b><span>still open</span></div>
      </div>
      <p class="small muted" style="max-width:44em">The accuracy score (a Brier score) runs from 0, meaning perfect, to 1. Someone who answered "50%" to everything would score 0.25, so anything well below that means the predictions are genuinely useful.</p>
      <section class="section"><h2>Story verdicts</h2><p class="small muted" style="margin-bottom:1rem">Each story is judged once all of its forecasts close. Lead time records how far ahead of mainstream coverage a story was, when coverage later caught up.</p><div class="tablewrap"><table class="table"><thead><tr><th>Story</th><th>Published</th><th class="num">Forecasts resolved</th><th>Verdict</th><th>Lead time</th></tr></thead><tbody>${S.data.stories.stories.map((st) => { const done = st.forecasts.filter((id) => R.some((r) => r.forecast === id && r.closes <= lastClose(st))).length; return `<tr><td><a href="#/story/${st.id}">${esc(st.title)}</a></td><td>${fmtShort(st.published)}</td><td class="num">${done} of ${st.forecasts.length}</td><td>${st.status === "open" ? "Open" : { held: "Held up", partly: "Partly held up", wrong: "Wrong" }[st.status]}</td><td>${st.lead_time ? esc(st.lead_time) : "—"}</td></tr>`; }).join("")}</tbody></table></div></section>
      <section class="section"><h2>Are our percentages honest?</h2>${scored.length >= 20 ? `<div class="tablewrap"><table class="table"><thead><tr><th>We said</th><th class="num">Predictions</th><th class="num">Average we gave</th><th class="num">How often it happened</th></tr></thead><tbody>${bins.filter((b) => b.n).map((b) => `<tr><td>${b.lo}–${b.lo + 10}%</td><td class="num">${b.n}</td><td class="num">${Math.round(b.sp / b.n)}%</td><td class="num">${Math.round(b.so / b.n * 100)}%</td></tr>`).join("")}</tbody></table></div>` : `<div class="cal">
        <p>Once 20 predictions have been checked, this section will show whether things we called "70% likely" really happened about 70% of the time. ${scored.length} checked so far.</p>
        <div class="prog-bar"><span style="width:${Math.min(scored.length / 20 * 100, 100)}%"></span></div>
        <p class="xs muted">The first 7-day window closes on ${closes("7d")}.</p></div>`}</section>
      ${awaiting.length ? `<section class="section"><h2>Awaiting resolution</h2><p class="small muted" style="margin-bottom:1rem">These windows have closed. Outcomes are checked against the named sources during the next update.</p><div class="tablewrap"><table class="table"><thead><tr><th>Forecast</th><th>Closed</th><th class="num">Forecast</th></tr></thead><tbody>${awaiting.map((f) => `<tr><td><a href="#/forecast/${f.id}/resolution">${esc(f.title)}</a></td><td>${closes(f.primary)}</td><td class="num">${pp(f)}%</td></tr>`).join("")}</tbody></table></div></section>` : ""}
      <section class="section"><h2>Resolved</h2>${R.length ? `<div class="tablewrap"><table class="table"><thead><tr><th>Forecast</th><th>Closed</th><th class="num">Forecast</th><th>Outcome</th><th class="num">Brier</th></tr></thead><tbody>${R.map((r) => `<tr><td>${esc(r.title)}<div class="xs muted">${esc(r.note)}${r.source ? ` <a class="link" href="${esc(r.source)}" target="_blank" rel="noopener">Source</a>` : ""}</div></td><td>${fmtShort(r.resolved_on)}</td><td class="num">${r.p}%</td><td><span class="outcome" data-o="${r.outcome}">${outcome(r)}</span></td><td class="num">${r.outcome === null ? "—" : brier(r).toFixed(3)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Nothing has resolved yet. The first forecasts close on ${closes("7d")}.</p>`}</section>
      <section class="section"><h2>Open forecasts</h2><div class="tablewrap"><table class="table">
        <thead><tr><th>Forecast</th><th>Window</th><th>Closes</th><th class="num">Our forecast</th><th class="num">Most people</th></tr></thead>
        <tbody>${open.map((f) => `<tr><td><a href="#/forecast/${f.id}">${esc(f.title)}</a></td><td>${hLabel(f.primary)}</td><td>${closes(f.primary)}</td><td class="num">${pp(f)}%</td><td class="num">~${f.expected.value}%</td></tr>`).join("")}</tbody></table></div></section>
      <section class="section"><h2>Published snapshots</h2><div class="tablewrap"><table class="table">
        <thead><tr><th>Cycle</th><th>Published</th><th class="num">Forecasts</th><th>Change</th><th>File</th></tr></thead>
        <tbody>${[...idx.snapshots].reverse().map((s) => `<tr><td>${esc(s.cycle)}${s.cycle === idx.active ? ' <span class="pill">Current</span>' : ""}</td><td>${fmtDate(s.published)}</td><td class="num">${s.count}</td><td>${esc(s.change_type)}<div class="xs muted">${esc(s.reason || "")}</div></td><td><a href="${esc(s.file)}">${esc(s.file.split("/").pop())}</a></td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function viewMethod() {
    return `<div class="prose">
      <header class="page-head"><h1>How it works</h1><p>Emergence looks for events that become plausible only when separate systems are read together: AI, cyber, internet infrastructure, elections, geopolitics and markets.</p></header>
      <h2>Stories come first</h2>
      <p>The site's main product is stories: short claims about what's really going on that most coverage misses because it sees only one part of the picture. A story has to pass four tests:</p>
      <ul><li><b>People already care</b> about the subject.</li><li><b>It overturns an expectation</b> people already hold: "you'd think X; more likely Y."</li><li><b>You'll see it soon.</b> It predicts visible events within weeks.</li><li><b>It changes what you'd watch.</b></li></ul>
      <p>Each story lists forecasts as receipts and says what would prove it wrong. When its forecasts close, it gets a verdict: held up, partly held up, or wrong. Verdicts stay on the site either way.</p>
      <p>Stories are found by reading across beats that are usually covered separately, collecting loose ends (things that happened and must have follow-ups), and matching them across domains. A common pattern: news is built around moments, but outcomes are decided by slower processes. "It won't be decided when you think" is often the most useful thing to know.</p>
      <h2>Where the numbers come from</h2>
      <p>Each forecast starts from a base rate: how often events like this have actually happened. A short list of adjustments for current conditions is then added or subtracted, each tied to evidence. Every step is shown on the forecast's "Why this number" tab. When there's no honest base rate, the forecast says so and is marked low confidence.</p>
      <p>These are structured judgments, not measurements. The 80% range is the forecaster's own uncertainty.</p>
      <h2>Likely, and under the radar</h2>
      <p>The most useful forecast is one that's probably true and that most people aren't expecting. Each forecast carries an estimate of what a typical informed news reader would guess. It comes from prediction markets where one exists; otherwise it's the forecaster's labeled judgment. The site leads with the biggest gaps between that guess and the model:</p>
      <div class="formula">Surprise = (model probability − what most people expect) × (½ + ½ newsworthiness)</div>
      <p>A forecast counts as "likely, and under the radar" when the model gives it at least 55% and that's at least 20 points above the expected guess. The reverse also matters: when most people or markets expect something the model doubts, it appears under "Expected, but may not happen."</p>
      <h2>How likely-but-overlooked events are found</h2>
      <ul>
        <li><b>Already happened, not yet visible.</b> An event has occurred, but its consequences haven't arrived. Stolen money has to move; stolen keys get used later.</li>
        <li><b>Calendars and mechanical triggers.</b> Rules, deadlines and procedures that force an outcome, like vote-counting rules or certification deadlines.</li>
        <li><b>What followed last time.</b> The sequence after the most similar past event.</li>
        <li><b>At least one of.</b> Several modest, separate risks that together make "at least one happens" likely.</li>
        <li><b>Looking back from the future.</b> Imagine the window has closed and everyone says "obviously that happened." What was it?</li>
        <li><b>The reverse gap.</b> Widely expected events the evidence doesn't support.</li>
      </ul>
      <h2>Signal score</h2>
      <p>Probability alone is a poor guide to what matters. A 70% chance of something routine is less interesting than a 12% chance of something that would reshape a field. The Signal score ranks forecasts by how worth noticing they are:</p>
      <div class="formula">Signal = 100 × √probability × impact × (½ + ½ newsworthiness) × (1 + 0.1 per extra domain) × attention × (0.6 + 0.4 × share of path with evidence)</div>
      <p>Attention multiplies by 1.15 when public attention is low, 1.0 when it's medium, and 0.85 when it's high. Impact and newsworthiness are judgments on a 0–100 scale. The score is a ranking aid, not an objective measurement.</p>
      <h2>Connections</h2>
      <p>A connection is a set of real, separately reported events, plus the reason they may be more than a coincidence. Each is rated strong (good evidence the link is real), plausible (a credible mechanism, not yet shown) or speculative (worth watching, could easily be coincidence), with what would confirm or rule it out. Behind the scenes, the model keeps a map of the conditions it tracks and how they affect each other; that map is used to build stories and chains, and is <a class="link" href="#/map">viewable here</a> for anyone curious.</p>
      <h2>Evidence rules</h2>
      <ul><li>Sources are graded A to D for reliability.</li><li>Reports that repeat the same underlying source share one independence cluster and count once.</li><li>Reported claims, confirmed facts and the model's own inferences are labeled differently.</li><li>Social media is used only as a weak lead.</li></ul>
      <h2>Keeping score</h2>
      <p>Forecasts are frozen when published and never rewritten. Each update cycle saves a new snapshot and explains every move. Once 20 forecasts have resolved, calibration is shown: do 30% forecasts come true about 30% of the time?</p>
      <h2>What this site won't do</h2>
      <p>Emergence is a defensive analysis project. It describes threats as categories, public incidents and probabilities. It never publishes exploit details, attack steps, or targeting guidance. It forecasts whether election processes come under strain, never who should win. It forecasts by category rather than naming a company as a likely victim, unless the question itself is about that company.</p>
      <h2>Follow along</h2>
      <p>Subscribe to the <a class="link" href="feed.xml">RSS feed</a> to get each weekly brief and new story.</p>
      <h2>Updates</h2>
      <p>The site updates itself on a schedule: a full update every Monday morning, and a short update on the decision dates in the calendar or after a major surprise. Each update follows a written protocol, and a validator must pass before anything is published. The current cycle was published ${fmtDate(S.data.fc.published)}.</p>
    </div>`;
  }

  function notFound() { return `<div class="page-head"><h1>Nothing here</h1><p>That page doesn't exist. <a class="link" href="#/pulse">Go to Pulse</a></p></div>`; }

  // ---------- drawer ----------
  const drawer = $("#drawer"), scrim = $("#scrim"), dbody = $("#drawer-body");
  let lastFocus = null;
  function openDrawer(html) {
    lastFocus = document.activeElement;
    dbody.innerHTML = html; drawer.hidden = false; scrim.hidden = false;
    $("#drawer-close").focus();
  }
  function closeDrawer() { drawer.hidden = true; scrim.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function openNode(id) {
    const n = S.data.nodes[id]; if (!n) return;
    const out = S.data.map.edges.filter((e) => e.from === id), inn = S.data.map.edges.filter((e) => e.to === id);
    const fcs = S.data.forecasts.filter((f) => f.pathway.includes(id));
    const relList = (es, k) => es.map((e) => `<li><button type="button" data-node="${e[k]}">${esc(S.data.nodes[e[k]].label)}</button><span class="t">${esc(e.type.toLowerCase().replace(/_/g, " "))}, ${esc(e.basis)}</span></li>`).join("");
    openDrawer(`<span class="dom" data-d="${n.domain}">${esc(DOMLABEL()[n.domain])}</span>
      <h2>${esc(n.label)}</h2>
      <dl class="kv"><dt>Current state</dt><dd>${stateBars(n.state, n.domain)}</dd><dt>Confidence</dt><dd>${esc(n.confidence)}</dd><dt>Feeds forecasts</dt><dd>${fcs.length}</dd></dl>
      <div class="dsec"><h3>Why</h3><p class="small" style="color:var(--ink-2)">${esc(n.summary)}</p></div>
      ${fcs.length ? `<div class="dsec"><h3>Forecasts that run through it</h3><ul class="rels">${fcs.map((f) => `<li><a href="#/forecast/${f.id}" class="small">${esc(f.title)}</a><span class="t">${pp(f)}%</span></li>`).join("")}</ul></div>` : ""}
      ${inn.length ? `<div class="dsec"><h3>Driven by</h3><ul class="rels">${relList(inn, "from")}</ul></div>` : ""}
      ${out.length ? `<div class="dsec"><h3>Affects</h3><ul class="rels">${relList(out, "to")}</ul></div>` : ""}
      <div class="dsec"><h3>Evidence</h3>${n.evidence.length ? n.evidence.map((e) => evRow(S.data.evidence[e])).join("") : '<p class="small muted">No direct evidence collected this cycle. This condition is carried by precedent and judgment.</p>'}</div>`);
  }
  function openEvidence(id) {
    const e = S.data.evidence[id]; if (!e) return;
    openDrawer(`<span class="label">Evidence ${esc(e.id)}</span><h2>${esc(e.source)}</h2>${evRow(e)}
      <div class="dsec"><h3>Affects</h3><ul class="rels">${e.nodes.map((n) => `<li><button type="button" data-node="${n}">${esc(S.data.nodes[n].label)}</button></li>`).join("")}</ul></div>`);
  }

  // ---------- router ----------
  const CRUMB = { pulse: "Pulse", predictions: "Predictions", links: "Hidden links", map: "World map", evidence: "Evidence", record: "Track record", method: "How it works" };
  function crumbs(parts) {
    $("#crumbs").innerHTML = parts.map((p, i) => i === parts.length - 1 ? `<span aria-current="page">${esc(p[0])}</span>` : `<a href="${p[1]}">${esc(p[0])}</a><span class="sep" aria-hidden="true">›</span>`).join("");
  }
  function route() {
    if (!S.data) return;
    closeDrawer();
    const parts = (location.hash.replace(/^#\/?/, "") || "pulse").split("/");
    const [top, a, b] = parts;
    let html, c, nav = top;
    switch (top) {
      case "pulse": html = viewPulse(); c = [["This week"]]; break;
      case "predictions": html = viewPredictions(); c = [["Predictions"]]; break;
      case "forecast": { const f = S.data.byId[a]; html = viewForecast(a, b); nav = "predictions"; c = [["Predictions", "#/predictions"], [f ? f.short : "Not found"]]; if (f && b && b !== "overview") { const t = FTAB_ALL.find(([k]) => k === b); if (t) c = [["Predictions", "#/predictions"], [f.short, `#/forecast/${f.id}`], [t[1]]]; } break; }
      case "stories": html = viewStories(); c = [["Stories"]]; break;
      case "calendar": html = viewCalendar(); c = [["Calendar"]]; break;
      case "connections": html = viewConnections(); c = [["Connections"]]; break;
      case "story": { const st = S.data.storyById[a]; html = viewStory(a); nav = "stories"; c = [["Stories", "#/stories"], [st ? stype(st) : "Not found"]]; break; }
      case "links": nav = "stories"; if (a) { const p = S.data.paths[a]; html = viewLink(a); c = [["Stories", "#/stories"], [p ? p.title : "Not found"]]; } else { html = viewLinks(); c = [["Stories", "#/stories"], ["Chains"]]; } break;
      case "map": html = viewMap(); c = [["World map"]]; break;
      case "evidence": html = viewEvidence(); c = [["Evidence"]]; break;
      case "record": html = viewRecord(); c = [["Track record"]]; break;
      case "method": html = viewMethod(); c = [["How it works"]]; break;
      default: html = notFound(); c = [["Not found"]];
    }
    view.innerHTML = html;
    document.body.classList.toggle("no-horizon", true);
    crumbs(c);
    document.querySelectorAll(".nav a").forEach((el) => { if (el.dataset.nav === nav) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current"); });
    document.title = (c[c.length - 1][0] === "This week" ? "" : c[c.length - 1][0] + " | ") + "Emergence";
    if (top === "map") bindMap();
    if (route.prev !== location.hash) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); }
    route.prev = location.hash;
  }

  function syncControls() {
    document.querySelectorAll("#horizon button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.h === S.horizon));
    document.querySelectorAll("#mode button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === S.mode));
    document.body.classList.toggle("analyst", S.mode === "analyst");
  }

  // ---------- events ----------
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-node],[data-ev],[data-h],[data-m],[data-sort],[data-evf]");
    if (!t) return;
    if (t.dataset.h) { S.horizon = t.dataset.h; store.set("horizon", S.horizon); syncControls(); route(); return; }
    if (t.dataset.m) { S.mode = t.dataset.m; store.set("mode", S.mode); syncControls(); return; }
    if (t.dataset.sort) { S.sort = t.dataset.sort; route(); return; }
    if (t.dataset.evf) { S.evFilter = t.dataset.evf; route(); return; }
    if (t.dataset.ev) { ev.preventDefault(); openEvidence(t.dataset.ev); return; }
    if (t.dataset.node) { ev.preventDefault(); openNode(t.dataset.node); }
  });
  $("#drawer-close").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && !drawer.hidden) closeDrawer(); });
  drawer.addEventListener("click", (ev) => { if (ev.target.closest("a[href^='#']")) closeDrawer(); });
  window.addEventListener("hashchange", route);

  syncControls();
  load().then(() => {
    const fc = S.data.fc;
    $("#rail-foot").innerHTML = `<strong>Forecast cycle ${esc(fmtDate(fc.published))}</strong>Updates every Monday morning and on decision dates. Next 7-day forecasts close ${esc(closes("7d"))}.`;
    route();
  }).catch((err) => {
    view.innerHTML = `<div class="page-head"><h1>The forecast data didn't load</h1><p>${esc(err.message)}. If you opened this file directly from disk, serve the folder over HTTP instead (for example, <code>python3 -m http.server</code>) and reload.</p></div>`;
  });
})();
