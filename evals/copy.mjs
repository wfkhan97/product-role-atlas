// The copy eval (v19 B6): every string a screen owns, checked against "How to write". The rules are evals/copy_lib.mjs
// (sentences of at most 20 words; no passive construction, a form of "be" followed within two words by a past
// participle; none of utilize, leverage, facilitate, via, in order to). Three files are gated: web/copy.js (the table
// the screens read), web/data/sp27_campus.json and web/data/games.json (every string value). Their count must be
// zero; tests/web/copy.test.mjs fails otherwise, so fix the sentence or tighten the rule in copy_lib.mjs with a
// comment, never skip a file. The editorial data files are reported, not gated: web/data/graph_mba.json (the role
// labels, the field and cluster labels, the kinds, and per skill the name, definition, how_shown words, level ladder,
// build steps, field readings and sub-skills), web/data/role_blurbs.json, web/data/graph_mba/_evidence.json (the
// quoted posting sentences, which the rule does not govern: a posting says what it says) and the published sub-skill
// files web/data/subskills_mba.json and web/data/subskills.json (the depth files pipeline/depth/*.json as web/ serves
// them; regex patterns and URLs are not read). A false positive on a data-built line ("is based") is fine to list.
//   node evals/copy.mjs               # the report; exit 1 when a gated file has an offender
//   node evals/copy.mjs --baseline    # also rewrite evals/copy_baseline.md (commit it with the change)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { strings, checkAll, MAX_WORDS, STOPLIST } from "./copy_lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..");
const require = createRequire(import.meta.url);
const J = f => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
const BASELINE = process.argv.includes("--baseline");
const SHOW = 20;   // offenders listed per file and rule

// the gated files: web/copy.js is the table itself (functions skipped by strings()); the two data files whole
export const GATED = [
  { file: "web/copy.js", read: () => require(path.join(root, "web", "copy.js")) },
  { file: "web/data/sp27_campus.json", read: () => J("web/data/sp27_campus.json") },
  { file: "web/data/games.json", read: () => J("web/data/games.json") },
];
// the editorial files: the string fields a person reads, picked out so a regex pattern or a URL never counts
const skillStrings = s => ({ name: s.name, what: s.what, how_shown: s.how_shown, ladder: s.ladder, fields: s.fields, signals: s.signals,
  build: s.build == null ? null : Array.isArray(s.build) ? s.build.map(b => typeof b === "string" ? b : b.text) : Object.fromEntries(Object.entries(s.build).map(([k, v]) => [k, (v || []).map(b => typeof b === "string" ? b : b.text)])),
  subskills: (s.subskills || []).map(x => ({ name: x.name, example: x.example })) });
const graphStrings = g => ({
  roles: Object.fromEntries(Object.entries(g.roles || {}).map(([id, r]) => [id, r.label])),
  groups: (g.groups || []).map(x => x.label),
  clusters: Object.fromEntries(Object.entries(g.clusters || {}).map(([id, c]) => [id, c.label])),
  kinds: Object.fromEntries(Object.entries((g.meta || {}).kinds || {}).map(([id, k]) => [id, { label: k.label, meaning: k.meaning, how: k.how }])),
  skills: Object.fromEntries((g.skills || []).map(s => [s.id, skillStrings(s)])),
});
const subStrings = subs => Object.fromEntries(Object.entries(subs).map(([id, list]) => [id, (list || []).map(x => ({ name: x.name, example: x.example }))]));
const evidenceStrings = ev => Object.fromEntries(Object.entries(ev).map(([id, groups]) => [id, Object.fromEntries(Object.entries(groups || {}).map(([k, qs]) => [k, (qs || []).map(q => q.text)]))]));
export const REPORTED = [
  { file: "web/data/graph_mba.json", read: () => graphStrings(J("web/data/graph_mba.json")) },
  { file: "web/data/role_blurbs.json", read: () => J("web/data/role_blurbs.json") },
  { file: "web/data/graph_mba/_evidence.json", read: () => evidenceStrings(J("web/data/graph_mba/_evidence.json")) },
  { file: "web/data/subskills_mba.json", read: () => subStrings(J("web/data/subskills_mba.json")) },
  { file: "web/data/subskills.json", read: () => subStrings(J("web/data/subskills.json")) },
];

// one file's result: the strings counted, the offenders by rule
export function checkFile(entry) {
  const list = strings(entry.read());
  const offenders = checkAll(list);
  const by = { long: offenders.filter(o => o.rule === "long"), passive: offenders.filter(o => o.rule === "passive"), stop: offenders.filter(o => o.rule === "stop") };
  return { file: entry.file, strings: list.length, offenders, by };
}

const RULES = [["long", `sentences over ${MAX_WORDS} words`], ["passive", "passive constructions"], ["stop", `stoplist words (${STOPLIST.join(", ")})`]];
const cut = (s, n) => { s = String(s).replace(/\s+/g, " "); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
function section(r, gated) {
  const lines = [`### ${r.file}${gated ? " (gated)" : ""}`, "", `${r.strings} strings · ${r.by.long.length} long · ${r.by.passive.length} passive · ${r.by.stop.length} stoplist`, ""];
  for (const [rule, label] of RULES) {
    const xs = r.by[rule]; if (!xs.length) continue;
    lines.push(`**${label}** (${xs.length}${xs.length > SHOW ? `, first ${SHOW}` : ""})`, "");
    for (const o of xs.slice(0, SHOW)) lines.push(`- \`${o.path}\`: ${cut(o.hit, 160)}${rule === "long" ? "" : ` — "${cut(o.text, 140)}"`}`);
    lines.push("");
  }
  return lines.join("\n");
}

const gated = GATED.map(checkFile), reported = REPORTED.map(checkFile);
const table = ["| file | strings | long | passive | stoplist |", "|---|---:|---:|---:|---:|", ...[...gated.map(r => ({ ...r, g: true })), ...reported].map(r => `| ${r.file}${r.g ? " (gated)" : ""} | ${r.strings} | ${r.by.long.length} | ${r.by.passive.length} | ${r.by.stop.length} |`)].join("\n");
const fails = gated.reduce((n, r) => n + r.offenders.length, 0);
const md = [
  "# Copy baseline",
  "",
  "Written by `node evals/copy.mjs --baseline` (evals/README.md, \"The copy eval\"). The rule: sentences of at most",
  `${MAX_WORDS} words, active voice, none of ${STOPLIST.join(", ")}. The three gated files must show zero; the editorial data files`,
  "are reported for the editorial pass (PLAN.md, \"Later\"). A quoted posting sentence (_evidence.json) is a posting's own words.",
  "",
  table,
  "",
  "## The gated files",
  "",
  ...gated.map(r => section(r, true)),
  "## The editorial data files",
  "",
  ...reported.map(r => section(r, false)),
].join("\n");

if (BASELINE) { fs.writeFileSync(path.join(here, "copy_baseline.md"), md); console.log("wrote evals/copy_baseline.md"); }
console.log(table);
for (const r of gated) for (const o of r.offenders) console.log(`FAIL ${r.file} ${o.path} [${o.rule}] ${cut(o.hit, 120)} — "${cut(o.text, 120)}"`);
console.log(fails ? `${fails} offender(s) in the gated files` : "gated files: zero offenders");
process.exit(fails ? 1 : 0);
