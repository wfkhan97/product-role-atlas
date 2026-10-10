// Matcher evals: score every sample in evals/resumes/ against its targets with the SAME logic the
// web app uses, check the human-written expectations in the sidecar .json, and print a report.
//
//   node evals/run.mjs                 # report
//   node evals/run.mjs --baseline      # also rewrite evals/baseline.md
//   node evals/run.mjs --only grad     # filter samples by substring
//
// NOTE: the scoring block below mirrors web/app.js (tagText + the #run-match handler). Until the
// matcher is extracted into its own module (see NOTES.md, step 0) the two must be kept in sync by hand.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const TAX = JSON.parse(fs.readFileSync(path.join(root, "pipeline/taxonomy.json")));
const SUBS = JSON.parse(fs.readFileSync(path.join(root, "web/data/subskills.json")));
const G = JSON.parse(fs.readFileSync(path.join(root, "web/data/graph.json")));
const skillById = Object.fromEntries(TAX.skills.map(s => [s.id, s]));

// ---- mirror of web/app.js ------------------------------------------------------------------
const CRED = id => id.startsWith("yoe_");
const SOFT = new Set(["ownership", "adaptability", "collaboration", "communication", "influence", "problem_solving", "customer_obsession", "product_sense", "execution"]);
const RX = TAX.skills.map(s => ({ id: s.id, rx: new RegExp(s.patterns.map(p => "(?:" + p + ")").join("|"), "i") }));
const SUBRX = []; for (const [sid, list] of Object.entries(SUBS)) for (const sub of list) SUBRX.push({ id: sub.id, parent: sid, rx: new RegExp(sub.patterns.map(p => "(?:" + p + ")").join("|"), "i") });
function tagText(text) {
  const skills = new Set(), subs = new Set();
  for (const { id, rx } of RX) if (rx.test(text)) skills.add(id);
  for (const { id, parent, rx } of SUBRX) if (rx.test(text)) { subs.add(id); skills.add(parent); }
  return { skills, subs };
}
function requiredFor(target) {
  const [fam, lv] = target.split(":");
  const js = G.jobs.filter(x => x.family === fam && (lv === "__all" || x.level === lv));
  const cnt = {}; for (const j of js) for (const k of j.skills) cnt[G.skill_ids[k]] = (cnt[G.skill_ids[k]] || 0) + 1;
  const share = id => (cnt[id] || 0) / (js.length || 1);
  return { n: js.length, required: new Map(G.skills.filter(s => !CRED(s.id) && !SOFT.has(s.id) && share(s.id) >= 0.2).map(s => [s.id, share(s.id)])) };
}
function score(have, required) {
  let got = 0, tot = 0; const per = {};
  for (const [k, w] of required) {
    tot += w;
    const subs = SUBS[k] || []; const hit = subs.filter(s => have.subs.has(s.id));
    const frac = have.skills.has(k) && !hit.length ? 1 : hit.length ? Math.min(1, 0.5 + 0.5 * hit.length / Math.max(1, subs.length - 1)) : 0;
    got += w * frac; per[k] = { w, frac, hit: hit.map(s => s.id) };
  }
  return { score: tot ? got / tot : 0, per };
}
// ---- end mirror ----------------------------------------------------------------------------

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const samples = fs.readdirSync(path.join(here, "resumes")).filter(f => f.endsWith(".txt") && (!only || f.includes(only))).sort();
const pct = x => Math.round(x * 100) + "%";
const rows = []; let pass = 0, fail = 0; const lines = [];
const out = s => { lines.push(s); console.log(s); };

for (const f of samples) {
  const name = f.replace(/\.txt$/, "");
  const text = fs.readFileSync(path.join(here, "resumes", f), "utf8");
  const specPath = path.join(here, "resumes", name + ".json");
  const spec = fs.existsSync(specPath) ? JSON.parse(fs.readFileSync(specPath)) : { targets: ["pm:__all"] };
  const have = tagText(text);
  out(`\n=== ${name}  (${spec.persona || "?"}; ${have.skills.size} skills tagged)`);
  const scores = {};
  for (const t of spec.targets) {
    const { n, required } = requiredFor(t); const r = score(have, required);
    scores[t] = r.score;
    const band = spec.score_band?.[t];
    const ok = band ? (r.score >= band[0] && r.score <= band[1]) : null;
    if (ok !== null) ok ? pass++ : fail++;
    out(`  ${t.padEnd(14)} n=${String(n).padEnd(5)} required=${String(required.size).padEnd(3)} score=${pct(r.score)}${band ? `  band ${pct(band[0])}–${pct(band[1])} ${ok ? "PASS" : "FAIL"}` : ""}`);
    // evidence that got *less* credit because sub-skills were hit (non-monotonic partial credit)
    const penalised = Object.entries(r.per).filter(([k, v]) => v.frac > 0 && v.frac < 1 && have.skills.has(k)).map(([k, v]) => `${k}=${v.frac.toFixed(2)}`);
    if (penalised.length) out(`    partial credit despite being named: ${penalised.join(", ")}`);
  }
  const check = (label, list, want) => {
    if (!list) return;
    const bad = list.filter(k => have.skills.has(k) !== want);
    pass += list.length - bad.length; fail += bad.length;
    out(`  ${label}: ${list.length - bad.length}/${list.length}${bad.length ? "  MISSING: " + bad.join(", ") : ""}`);
    return bad;
  };
  const missed = check("must_evidence", spec.must_evidence, true);
  const fp = check("must_not_tag ", spec.must_not_tag, false);
  const gapsOk = check("real_gaps    ", spec.real_gaps, false);
  const known = new Set([...(spec.must_evidence || []), ...(spec.must_not_tag || []), ...(spec.real_gaps || [])]);
  const unreviewed = [...have.skills].filter(k => !known.has(k));
  out(`  tagged but not covered by expectations (review these): ${unreviewed.join(", ") || "none"}`);
  rows.push({ name, persona: spec.persona, scores, tagged: have.skills.size, missed: missed?.length ?? 0, fp: fp?.length ?? 0, gapsWrong: gapsOk?.length ?? 0, nEv: spec.must_evidence?.length ?? 0, nFp: spec.must_not_tag?.length ?? 0 });
}
out(`\nTOTAL: ${pass} pass, ${fail} fail`);

if (args.includes("--baseline")) {
  const md = [`# Matcher eval baseline`, ``, `Generated by \`node evals/run.mjs --baseline\` on ${new Date().toISOString().slice(0, 10)} against ${G.meta.n_jobs} postings. Do not edit by hand.`, ``,
    `| sample | persona | ${[...new Set(rows.flatMap(r => Object.keys(r.scores)))].join(" | ")} | tagged | must_evidence missed | false positives | real_gaps wrongly tagged |`,
    `|---|---|${"---|".repeat(new Set(rows.flatMap(r => Object.keys(r.scores))).size)}---|---|---|---|`];
  const targets = [...new Set(rows.flatMap(r => Object.keys(r.scores)))];
  for (const r of rows) md.push(`| ${r.name} | ${r.persona} | ${targets.map(t => r.scores[t] != null ? pct(r.scores[t]) : "–").join(" | ")} | ${r.tagged} | ${r.missed}/${r.nEv} | ${r.fp}/${r.nFp} | ${r.gapsWrong} |`);
  md.push(``, `Checks: ${pass} pass, ${fail} fail.`, ``, "```", ...lines.map(l => l.replace(/^\n/, "")), "```", ``);
  fs.writeFileSync(path.join(here, "baseline.md"), md.join("\n"));
  console.log("\nwrote evals/baseline.md");
}
