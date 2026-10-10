// Matcher evals: run every sample in evals/resumes/ through web/match.js (the same code the app
// uses), check the human-written expectations in the sidecar .json, and print a report.
//
//   node evals/run.mjs                 # report
//   node evals/run.mjs --baseline      # also rewrite evals/baseline.md
//   node evals/run.mjs --only grad     # filter samples by substring
//   node evals/run.mjs --verbose       # print every row with its evidence line
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const require = createRequire(import.meta.url);
const { createMatcher } = require(path.join(root, "web/match.js"));
const TAX = JSON.parse(fs.readFileSync(path.join(root, "pipeline/taxonomy.json")));
const SUBS = JSON.parse(fs.readFileSync(path.join(root, "web/data/subskills.json")));
const G = JSON.parse(fs.readFileSync(path.join(root, "web/data/graph.json")));
const M = createMatcher({ taxonomy: TAX, subskills: SUBS, graph: G });

function target(spec) {
  const [fam, lv] = spec.split(":");
  const jobs = G.jobs.filter(x => x.family === fam && (lv === "__all" || x.level === lv));
  return { jobs, label: spec, level: lv === "__all" ? null : lv };
}

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const verbose = args.includes("--verbose");
const samples = fs.readdirSync(path.join(here, "resumes")).filter(f => f.endsWith(".txt") && (!only || f.includes(only))).sort();
const pct = x => x == null ? "–" : Math.round(x * 100) + "%";
const rows = []; let pass = 0, fail = 0; const lines = [];
const out = s => { lines.push(s); console.log(s); };
const LEVEL_OF = { associate: "associate", mid: "mid", senior: "senior", staff: "lead", group: "lead", director: "lead", vp: "lead", cpo: "lead" };

for (const f of samples) {
  const name = f.replace(/\.txt$/, "");
  const text = fs.readFileSync(path.join(here, "resumes", f), "utf8");
  const specPath = path.join(here, "resumes", name + ".json");
  const spec = fs.existsSync(specPath) ? JSON.parse(fs.readFileSync(specPath)) : { targets: ["pm:__all"] };
  let first = null; const scores = {};
  for (const t of spec.targets) {
    const tg = target(t);
    const r = M.match(text, tg, { level: tg.level ? LEVEL_OF[tg.level] : undefined });
    first ||= r; scores[t] = r.overall;
    if (t === spec.targets[0]) out(`\n=== ${name}  (${spec.persona || "?"}) → read as ${r.profile.persona}, ${r.profile.level}; ${r.profile.years.toFixed(1)} yrs total, ${r.profile.pmYears.toFixed(1)} in product; backgrounds: ${r.profile.backgrounds.join(", ") || "none"}; ${r.covered.size} skills evidenced`);
    const band = spec.score_band?.[t];
    const ok = band ? (r.overall >= band[0] && r.overall <= band[1]) : null;
    if (ok !== null) ok ? pass++ : fail++;
    out(`  ${t.padEnd(14)} n=${String(tg.jobs.length).padEnd(5)} core ${pct(r.core)} (${r.req.core.length})  common ${pct(r.common)} (${r.req.common.length})  depth ${pct(r.depth)}  breadth ${pct(r.breadth)}  overall ${pct(r.overall)}${band ? `  band ${pct(band[0])}–${pct(band[1])} ${ok ? "PASS" : "FAIL"}` : ""}  what-if ${pct(r.whatIf)}`);
    if (verbose && t === spec.targets[0]) for (const row of r.rows) out(`      ${row.tier.padEnd(6)} ${row.status.padEnd(12)} s${row.strength} ${row.slotName.padEnd(32)} ${row.lines[0] ? JSON.stringify(row.lines[0].text.slice(0, 90)) : row.hintLines[0] ? "(hint) " + JSON.stringify(row.hintLines[0].text.slice(0, 80)) : ""}`);
  }
  const r = first;
  const check = (label, list, want) => {
    if (!list) return [];
    const bad = list.filter(k => r.covered.has(k) !== want);
    pass += list.length - bad.length; fail += bad.length;
    out(`  ${label}: ${list.length - bad.length}/${list.length}${bad.length ? "  WRONG: " + bad.join(", ") : ""}`);
    return bad;
  };
  const missed = check("must_evidence", spec.must_evidence, true);
  const fp = check("must_not_tag ", spec.must_not_tag, false);
  const gapsWrong = check("real_gaps    ", spec.real_gaps, false);
  if (spec.persona) { const ok = r.profile.persona === spec.persona; ok ? pass++ : fail++; out(`  persona      : ${ok ? "PASS" : "FAIL (" + r.profile.persona + ")"}`); }
  if (spec.expected_level) { const ok = LEVEL_OF[spec.expected_level] === r.profile.level; ok ? pass++ : fail++; out(`  level read   : ${ok ? "PASS" : "FAIL (" + r.profile.level + ")"}`); }
  // monotonicity: adding a line that evidences a gap must never lower the overall score
  const tg0 = target(spec.targets[0]);
  const gapIds = r.gaps.slice(0, 3).map(g => g.id).filter(id => M.nameOf(id) && TAX.skills.some(s => s.id === id));
  let mono = true;
  for (const id of gapIds) { const sig = (G.skills.find(s => s.id === id) || {}).signals?.[0]; if (!sig) continue; const r2 = M.match(text + "\n- " + sig, tg0); if (r2.overall < r.overall - 1e-9) { mono = false; out(`  monotonic    : FAIL adding evidence for ${id} lowered ${pct(r.overall)} → ${pct(r2.overall)}`); } }
  if (mono) { pass++; out(`  monotonic    : PASS`); } else fail++;
  const known = new Set([...(spec.must_evidence || []), ...(spec.must_not_tag || []), ...(spec.real_gaps || [])]);
  const unreviewed = [...r.covered].filter(k => !known.has(k));
  out(`  evidenced but not covered by expectations (review these): ${unreviewed.join(", ") || "none"}`);
  out(`  transferable: ${r.rows.filter(x => x.status === "transferable").map(x => x.slotName + " (via " + x.via.join("/") + ")").join(", ") || "none"}`);
  out(`  unmapped bullets: ${r.unmapped.length}`);
  rows.push({ name, persona: spec.persona, scores, tagged: r.covered.size, missed: missed.length, fp: fp.length, gapsWrong: gapsWrong.length, nEv: spec.must_evidence?.length ?? 0, nFp: spec.must_not_tag?.length ?? 0 });
}
out(`\nTOTAL: ${pass} pass, ${fail} fail`);

if (args.includes("--baseline")) {
  const targets = [...new Set(rows.flatMap(r => Object.keys(r.scores)))];
  const md = [`# Matcher eval baseline`, ``, `Generated by \`node evals/run.mjs --baseline\` on ${new Date().toISOString().slice(0, 10)} against ${G.meta.n_jobs} postings. Do not edit by hand.`, ``,
    `| sample | persona | ${targets.join(" | ")} | evidenced | must_evidence missed | false positives | real_gaps wrongly tagged |`,
    `|---|---|${"---|".repeat(targets.length)}---|---|---|---|`];
  for (const r of rows) md.push(`| ${r.name} | ${r.persona} | ${targets.map(t => pct(r.scores[t])).join(" | ")} | ${r.tagged} | ${r.missed}/${r.nEv} | ${r.fp}/${r.nFp} | ${r.gapsWrong} |`);
  md.push(``, `Checks: ${pass} pass, ${fail} fail.`, ``, "```", ...lines.map(l => l.replace(/^\n/, "")), "```", ``);
  fs.writeFileSync(path.join(here, "baseline.md"), md.join("\n"));
  console.log("\nwrote evals/baseline.md");
}
