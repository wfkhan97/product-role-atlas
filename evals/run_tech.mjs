// Matcher evals for the tech role set (PLAN.md, "A third role set"): the samples in evals/resumes_tech/ through
// web/match.js with the set's part of the taxonomy, the counterpart of evals/run.mjs for the product roles.
//
//   node evals/run_tech.mjs               # check every sample, print a report; exit 1 on a failed check
//   node evals/run_tech.mjs --baseline    # also rewrite evals/baseline_tech.md
//   node evals/run_tech.mjs --only ece    # one sample
//
// What a resume shows (must_evidence, must_not_tag, real_gaps) needs only web/data/taxonomy_tech.json, so it is checked
// everywhere. A score against a role needs the set's postings (web/data/graph_tech.json and its role files, written by
// refresh-tech): where they are, each target is scored and its score_band checked; where they are not, the scores are
// reported as waiting. The bands are judgment calls, as the product samples' are, until calibrate.mjs gives the set bands.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const require = createRequire(import.meta.url);
const { createMatcher } = require(path.join(root, "web/match.js"));
const read = f => JSON.parse(fs.readFileSync(path.join(root, "web/data", f)));
const TAX = read("taxonomy_tech.json"), SUBS = read("subskills_tech.json");
const hasGraph = fs.existsSync(path.join(root, "web/data/graph_tech.json"));
let G = { jobs: [], skills: [] };
if (hasGraph) { const { loadGraph } = await import("./graph_mba.mjs"); G = loadGraph(null, { set: "tech" }); }
const M = createMatcher({ taxonomy: TAX, subskills: SUBS, graph: G });
const LEVEL_OF = { associate: "associate", mid: "mid", senior: "senior", staff: "lead", group: "lead", director: "lead", vp: "lead", cpo: "lead" };

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const dir = path.join(here, "resumes_tech");
const names = fs.readdirSync(dir).filter(f => f.endsWith(".txt") && (!only || f.includes(only))).map(f => f.replace(/\.txt$/, "")).sort();
const lines = []; let pass = 0, fail = 0;
const out = s => { lines.push(s); console.log(s); };
const pct = x => x == null ? "–" : Math.round(x * 100) + "%";
const target = spec => {
  const [fam, lv] = spec.split(":");
  return { jobs: G.jobs.filter(j => j.family === fam && (lv === "__all" || j.level === lv)), label: spec, level: lv === "__all" ? null : lv };
};

for (const name of names) {
  const text = fs.readFileSync(path.join(dir, name + ".txt"), "utf8");
  const spec = JSON.parse(fs.readFileSync(path.join(dir, name + ".json")));
  const shown = M.match(text, { jobs: [], label: "tech" });
  out(`\n=== ${name} → ${shown.covered.size} skills evidenced; read at ${shown.profile.level}, ${shown.profile.years.toFixed(1)} yrs`);
  for (const t of spec.targets) {
    const tg = target(t);
    if (!hasGraph || !tg.jobs.length) { out(`  ${t.padEnd(28)} waiting: ${hasGraph ? "no postings at this level" : "no graph_tech.json in this checkout"}`); continue; }
    const r = M.match(text, tg, { level: tg.level ? LEVEL_OF[tg.level] : undefined });
    const band = spec.score_band?.[t];
    const ok = band ? r.overall >= band[0] && r.overall <= band[1] : null;
    const known = (spec.known_miss || {})[t];
    if (ok !== null) (known ? !ok : ok) ? pass++ : fail++;
    const verdict = ok === null ? "" : known ? (ok ? "known miss now passes, remove the mark" : `known miss: ${known}`) : ok ? "PASS" : "FAIL";
    out(`  ${t.padEnd(28)} n=${String(tg.jobs.length).padEnd(5)} core ${pct(r.core)} (${r.req.core.length})  common ${pct(r.common)} (${r.req.common.length})  overall ${pct(r.overall)}${band ? `  band ${pct(band[0])}–${pct(band[1])} ${verdict}` : ""}`);
  }
  // known_miss: { skill id or "level": reason } a wrong answer accepted for now; it fails when it starts to pass
  const km = spec.known_miss || {};
  const check = (label, list, want) => {
    if (!list) return;
    const bad = list.filter(k => shown.covered.has(k) !== want && !km[k]);
    const fixed = list.filter(k => km[k] && shown.covered.has(k) === want);
    const known = list.filter(k => km[k] && shown.covered.has(k) !== want);
    pass += list.length - bad.length - fixed.length - known.length; fail += bad.length + fixed.length;
    out(`  ${label}: ${list.length - bad.length - known.length}/${list.length}${bad.length ? "  WRONG: " + bad.join(", ") : ""}${known.length ? "  known miss: " + known.join(", ") : ""}${fixed.length ? "  known miss now passes, remove the mark: " + fixed.join(", ") : ""}`);
  };
  check("must_evidence", spec.must_evidence, true);
  check("must_not_tag ", spec.must_not_tag, false);
  check("real_gaps    ", spec.real_gaps, false);
  if (spec.expected_level) {
    const ok = LEVEL_OF[spec.expected_level] === shown.profile.level;
    if (km.level) { ok ? fail++ : pass++; out(`  level read   : ${ok ? "known miss now passes, remove the mark" : "known miss (" + shown.profile.level + "): " + km.level}`); }
    else { ok ? pass++ : fail++; out(`  level read   : ${ok ? "PASS" : "FAIL (" + shown.profile.level + ")"}`); }
  }
  const covered = new Set([...(spec.must_evidence || []), ...(spec.must_not_tag || []), ...(spec.real_gaps || [])]);
  const extra = [...shown.covered].filter(k => !covered.has(k)).sort();
  out(`  not covered by an expectation: ${extra.join(", ") || "none"}`);
}
out(`\nTOTAL: ${pass} pass, ${fail} fail${hasGraph ? "" : " (scores waiting for the set's graph)"}`);
if (args.includes("--baseline")) {
  if (only || fail) { console.error("the baseline is written from a full run with no failures"); process.exit(1); }
  fs.writeFileSync(path.join(here, "baseline_tech.md"), ["# Matcher baseline: the tech role set", "",
    `Generated by \`node evals/run_tech.mjs --baseline\` on ${new Date().toISOString().slice(0, 10)}${hasGraph ? " with the set's graph" : " without the set's graph (scores waiting)"}. Do not edit by hand.`, "",
    "```", ...lines.map(l => l.replace(/^\n/, "")), "```", ""].join("\n"));
  console.log("wrote evals/baseline_tech.md");
}
process.exit(fail ? 1 : 0);
