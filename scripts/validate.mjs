#!/usr/bin/env node
// Validates the Emergence model data. Run: node scripts/validate.mjs
// Exits non-zero if any core invariant breaks, which blocks deployment.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const errors = [];
const warn = [];
const fail = (m) => errors.push(m);
const read = (p) => {
  try { return JSON.parse(readFileSync(p, "utf8")); }
  catch (e) { fail(`${p}: invalid JSON (${e.message})`); return null; }
};

const fc = read("data/forecasts.json");
const map = read("data/world-map.json");
const ev = read("data/evidence.json");
const links = read("data/links.json");
const index = read("data/forecast-index.json");
const resolutions = read("data/resolutions.json");
if (errors.length) { report(); }

const dupes = (arr, what) => {
  const seen = new Set();
  for (const id of arr) { if (seen.has(id)) fail(`Duplicate ${what} id: ${id}`); seen.add(id); }
  return seen;
};

// ---- evidence ----
const evIds = dupes(ev.records.map((r) => r.id), "evidence");
const REL = new Set(Object.keys(ev.reliability_scale));
for (const r of ev.records) {
  for (const k of ["id", "source", "source_type", "url", "claim", "status", "reliability", "cluster", "direction", "nodes"]) if (r[k] === undefined || r[k] === "") fail(`${r.id}: missing ${k}`);
  if (!REL.has(r.reliability)) fail(`${r.id}: unknown reliability ${r.reliability}`);
  if (!["confirmed", "reported"].includes(r.status)) fail(`${r.id}: status must be confirmed or reported`);
  if (r.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) fail(`${r.id}: date must be YYYY-MM-DD or null`);
  if (!/^https?:\/\//.test(r.url)) fail(`${r.id}: url must be http(s)`);
}

// ---- world map ----
const domIds = dupes(map.domains.map((d) => d.id), "domain");
const nodeIds = dupes(map.nodes.map((n) => n.id), "node");
const STATES = new Set(map.state_scale);
for (const n of map.nodes) {
  if (!domIds.has(n.domain)) fail(`${n.id}: unknown domain ${n.domain}`);
  if (!STATES.has(n.state)) fail(`${n.id}: unknown state ${n.state}`);
  if (!(n.x >= 0 && n.x <= 100 && n.y >= 0 && n.y <= 100)) fail(`${n.id}: x/y must be 0–100`);
  for (const e of n.evidence) if (!evIds.has(e)) fail(`${n.id}: evidence ${e} does not exist`);
}
for (const r of ev.records) for (const n of r.nodes) if (!nodeIds.has(n)) fail(`${r.id}: node ${n} does not exist`);
dupes(map.edges.map((e) => e.id), "edge");
const EDGE_TYPES = new Set(["ENABLES", "INCREASES", "DEPENDS_ON", "AMPLIFIES", "DETERS", "TRIGGERS", "MITIGATES", "CORRELATED_WITH", "REQUIRES", "INFORMATION_CHANNEL", "SECOND_ORDER", "THIRD_ORDER"]);
const BASIS = new Set(["empirical", "historical", "theoretical", "judgmental"]);
const edgeSet = new Set();
for (const e of map.edges) {
  if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) fail(`${e.id}: orphan edge ${e.from} → ${e.to}`);
  if (!EDGE_TYPES.has(e.type)) fail(`${e.id}: unknown type ${e.type}`);
  if (!BASIS.has(e.basis)) fail(`${e.id}: unknown basis ${e.basis}`);
  if (!(e.strength > 0 && e.strength <= 1)) fail(`${e.id}: strength must be in (0, 1]`);
  for (const x of e.evidence) if (!evIds.has(x)) fail(`${e.id}: evidence ${x} does not exist`);
  edgeSet.add(`${e.from}>${e.to}`);
}
for (const n of map.nodes) if (!map.edges.some((e) => e.from === n.id || e.to === n.id)) warn.push(`${n.id}: node has no links`);

// ---- forecasts ----
const fIds = dupes(fc.forecasts.map((f) => f.id), "forecast");
const H = Object.keys(fc.horizons);
for (const f of fc.forecasts) {
  const tag = f.id;
  for (const k of ["title", "short", "summary", "primary", "p", "range", "confidence", "impact", "newsworthiness", "attention", "base_rate", "adjustments", "pathway", "resolution", "history", "evidence", "skeptic", "escalation", "adjudicator", "research_question"]) if (f[k] === undefined) fail(`${tag}: missing ${k}`);
  if (!H.includes(f.primary)) fail(`${tag}: primary horizon ${f.primary} unknown`);
  if (f.p[f.primary] === null || f.p[f.primary] === undefined) fail(`${tag}: no probability for primary horizon`);
  for (const h of H) {
    const p = f.p[h];
    if (p === null) { if (f.range[h] !== null) fail(`${tag}: range set for null ${h}`); continue; }
    if (!(Number.isInteger(p) && p >= 1 && p <= 99)) fail(`${tag}: p[${h}]=${p} must be an integer 1–99`);
    const r = f.range[h];
    if (!Array.isArray(r) || !(r[0] <= p && p <= r[1] && r[0] >= 0 && r[1] <= 100)) fail(`${tag}: range[${h}] must bracket p`);
  }
  if (f.p["7d"] !== null && f.p["30d"] !== null && f.p["7d"] > f.p["30d"]) fail(`${tag}: 7-day probability exceeds 30-day (impossible for a cumulative window)`);
  for (const d of f.domains) if (!domIds.has(d)) fail(`${tag}: unknown domain ${d}`);
  for (const k of ["impact", "newsworthiness"]) if (!(f[k] >= 0 && f[k] <= 100)) fail(`${tag}: ${k} must be 0–100`);
  if (!["low", "medium", "high"].includes(f.attention)) fail(`${tag}: attention must be low/medium/high`);
  if (!["low", "medium", "high"].includes(f.confidence)) fail(`${tag}: confidence must be low/medium/high`);
  // base rate + adjustments must add up to the published primary number
  const sum = f.base_rate.value + f.adjustments.reduce((s, a) => s + a.delta, 0);
  if (sum !== f.p[f.primary]) fail(`${tag}: base rate ${f.base_rate.value} + adjustments = ${sum}, but published ${f.p[f.primary]}`);
  for (const a of f.adjustments) for (const e of a.evidence) if (!evIds.has(e)) fail(`${tag}: adjustment evidence ${e} missing`);
  for (const e of [...f.evidence, ...f.base_rate.evidence]) if (!evIds.has(e)) fail(`${tag}: evidence ${e} does not exist`);
  for (const n of f.pathway) if (!nodeIds.has(n)) fail(`${tag}: pathway node ${n} does not exist`);
  for (let i = 1; i < f.pathway.length; i++) if (!edgeSet.has(`${f.pathway[i - 1]}>${f.pathway[i]}`)) fail(`${tag}: pathway step ${f.pathway[i - 1]} → ${f.pathway[i]} has no edge`);
  const res = f.resolution;
  if (!res || !res.condition || res.condition.length < 60) fail(`${tag}: resolution condition missing or too vague`);
  if (!res || !res.sources || !res.sources.length) fail(`${tag}: resolution sources missing`);
  if (!res || !Array.isArray(res.ambiguous)) fail(`${tag}: ambiguous cases list missing`);
  if (!f.research_question) fail(`${tag}: research question missing`);
  // public expectation and discovery tactic (engine 1.1)
  const TACTICS = ["base-rate", "lagged-consequence", "calendar", "precedent", "disjunction", "look-back", "reverse-gap", "scenario"];
  if (!f.expected || !Number.isInteger(f.expected.value) || f.expected.value < 1 || f.expected.value > 99) fail(`${tag}: expected.value must be an integer 1–99`);
  else {
    if (!["market", "judgment"].includes(f.expected.basis)) fail(`${tag}: expected.basis must be market or judgment`);
    const gap = f.p[f.primary] - f.expected.value;
    if (f.p[f.primary] >= 55 && gap >= 20 && !f.surprise_note) fail(`${tag}: likely and under the radar (gap +${gap}) but no surprise_note explaining why people would miss it`);
    if (f.expected.basis === "market" && f.market.status !== "checked") fail(`${tag}: expected is market-based but market.status is not "checked"`);
  }
  if (!TACTICS.includes(f.tactic)) fail(`${tag}: tactic must be one of ${TACTICS.join(", ")}`);
  const last = f.history[f.history.length - 1];
  if (!last || last.p[f.primary] !== f.p[f.primary]) fail(`${tag}: latest history entry does not match current probability`);
}

// ---- links ----
const pIds = dupes(links.paths.map((p) => p.id), "path");
for (const p of links.paths) {
  for (const s of p.steps) {
    if (!nodeIds.has(s.node)) fail(`${p.id}: step node ${s.node} missing`);
    if (!["observed", "partial", "hypothetical"].includes(s.status)) fail(`${p.id}: bad step status ${s.status}`);
    for (const e of s.evidence) if (!evIds.has(e)) fail(`${p.id}: evidence ${e} missing`);
    if (s.status === "observed" && !s.evidence.length) fail(`${p.id}: an "observed" step needs evidence`);
  }
  for (const f of p.forecasts) if (!fIds.has(f)) fail(`${p.id}: forecast ${f} missing`);
  for (const d of p.domains) if (!domIds.has(d)) fail(`${p.id}: unknown domain ${d}`);
}
for (const s of links.signals) for (const e of s.evidence) if (!evIds.has(e)) fail(`${s.id}: evidence ${e} missing`);
if (!nodeIds.has(links.biggest_unknown.node)) fail("biggest_unknown: node missing");

// ---- snapshots ----
const actives = index.snapshots.filter((s) => s.cycle === index.active);
if (actives.length !== 1) fail(`forecast-index: active pointer must match exactly one snapshot (found ${actives.length})`);
dupes(index.snapshots.map((s) => s.cycle), "snapshot cycle");
for (const s of index.snapshots) if (!existsSync(s.file)) fail(`forecast-index: ${s.file} does not exist`);
if (fc.cycle !== index.active) fail(`forecasts.json cycle ${fc.cycle} does not match active snapshot ${index.active}`);
if (actives.length === 1 && existsSync(actives[0].file)) {
  const snap = JSON.parse(readFileSync(actives[0].file, "utf8"));
  const cur = Object.fromEntries(fc.forecasts.map((f) => [f.id, JSON.stringify(f.p)]));
  for (const f of snap.forecasts) if (cur[f.id] !== JSON.stringify(f.p)) fail(`Active snapshot disagrees with forecasts.json for ${f.id}. Publish a new snapshot instead of editing.`);
}

// ---- resolutions ----
const snapCache = {};
for (const r of resolutions.resolutions) {
  const tag = `resolution ${r.forecast}@${r.cycle}`;
  const s = index.snapshots.find((x) => x.cycle === r.cycle);
  if (!s) { fail(`${tag}: cycle not in forecast-index`); continue; }
  snapCache[s.file] ||= JSON.parse(readFileSync(s.file, "utf8"));
  const f = snapCache[s.file].forecasts.find((x) => x.id === r.forecast);
  if (!f) { fail(`${tag}: forecast not in that snapshot`); continue; }
  if (f.p[r.horizon] !== r.p) fail(`${tag}: p ${r.p} does not match the frozen snapshot (${f.p[r.horizon]})`);
  if (![0, 1, null].includes(r.outcome)) fail(`${tag}: outcome must be 1, 0 or null (ambiguous)`);
  if (!r.title || !r.resolved_on || !r.note) fail(`${tag}: title, resolved_on and note are required`);
  if (r.outcome !== null && !/^https?:\/\//.test(r.source || "")) fail(`${tag}: a source URL is required`);
}

// ---- immutability: published snapshots may be added, never changed ----
const base = process.env.VALIDATE_BASE;
if (base) {
  try {
    const diff = execSync(`git diff --name-status ${base} HEAD -- forecasts/`, { encoding: "utf8" }).trim();
    for (const line of diff.split("\n").filter(Boolean)) if (!line.startsWith("A")) fail(`Published snapshot modified or deleted: ${line}`);
  } catch (e) { warn.push(`Could not check snapshot immutability: ${e.message.split("\n")[0]}`); }
}

// ---- browser assets ----
for (const p of ["index.html", "assets/css/app.css", "assets/js/app.js", "assets/favicon.svg"]) if (!existsSync(p)) fail(`Missing asset ${p}`);

report();

function report() {
  for (const w of warn) console.log(`warning: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`);
    console.error(`\n${errors.length} problem(s). Fix before publishing.`);
    process.exit(1);
  }
  console.log(`OK: ${fc.forecasts.length} forecasts, ${map.nodes.length} nodes, ${map.edges.length} links, ${ev.records.length} evidence records, ${links.paths.length} paths.`);
  process.exit(0);
}
