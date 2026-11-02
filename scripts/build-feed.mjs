#!/usr/bin/env node
// Builds an RSS 2.0 feed of weekly briefs and stories. Usage: node scripts/build-feed.mjs > feed.xml
import { readFileSync } from "node:fs";
const BASE = "https://prototypeversions.github.io/Emergence/";
const S = JSON.parse(readFileSync("data/stories.json", "utf8"));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const rfc = (d) => new Date(d + "T18:00:00-06:00").toUTCString();
const items = [];
for (const b of [S.brief, ...(S.brief_archive || [])]) {
  const html = (b.changes?.length ? `<p><b>What changed since last week</b></p><ul>${b.changes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "") + b.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("");
  items.push({ date: b.date, title: `Weekly brief: ${b.title}`, link: `${BASE}#/pulse`, guid: `brief-${b.date}`, html });
}
for (const st of S.stories) {
  const html = `<p><b>You'd think:</b> ${esc(st.think)}</p><p><b>More likely:</b> ${esc(st.actually)}</p>` + st.body.map((p) => `<p>${esc(p)}</p>`).join("") + (st.postmortem ? `<p><b>Postmortem:</b> ${esc(st.postmortem)}</p>` : "");
  items.push({ date: st.published, title: st.title, link: `${BASE}#/story/${st.id}`, guid: `story-${st.id}`, html });
}
items.sort((a, b) => b.date.localeCompare(a.date));
process.stdout.write(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Emergence</title>
<link>${BASE}</link>
<description>Stories about what's really going on, found by reading AI, cyber, internet, elections, geopolitics and markets together.</description>
<language>en-us</language>
${items.map((i) => `<item><title>${esc(i.title)}</title><link>${esc(i.link)}</link><guid isPermaLink="false">${esc(i.guid)}</guid><pubDate>${rfc(i.date)}</pubDate><description>${esc(i.html)}</description></item>`).join("\n")}
</channel></rss>
`);
