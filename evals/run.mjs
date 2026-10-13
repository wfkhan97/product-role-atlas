// Matcher evals: run every sample in evals/resumes/ through web/match.js (the same code the app
// uses), check the human-written expectations in the sidecar .json, and print a report.
//
//   node evals/run.mjs                 # report
//   node evals/run.mjs --baseline      # also rewrite evals/baseline.md
//   node evals/run.mjs --private       # also score evals/resumes/private/* (gitignored, never in the baseline)
//   node evals/run.mjs --external      # also score evals/resumes/external/* (gitignored; fetched sample resumes)
// Samples may be .txt, .pdf or .docx; PDF and DOCX are read as the app reads them (needs npm install in evals/).
//   node evals/run.mjs --only grad     # filter samples by substring
//   node evals/run.mjs --verbose       # print every row with its evidence line
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { variants } from "./layouts.mjs";
import { extractText, READABLE } from "./extract.mjs";
import { externalSamples, rolesData, mbaTaxonomy } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const require = createRequire(import.meta.url);
const { createMatcher } = require(path.join(root, "web/match.js"));
const TAX = JSON.parse(fs.readFileSync(path.join(root, "web/data/taxonomy.json"))); // the app's copy: the product part of pipeline/taxonomy.json
const SUBS = JSON.parse(fs.readFileSync(path.join(root, "web/data/subskills.json")));
const G = JSON.parse(fs.readFileSync(path.join(root, "web/data/graph.json")));
const M = createMatcher({ taxonomy: TAX, subskills: SUBS, graph: G });
// The MBA role set: its skills and its role families. Until its graph exists there are no postings to score
// against, so this matcher is used for what a resume shows (skills tagged, role families read), not for a score.
const ROLES = rolesData();
const MBA = createMatcher({ taxonomy: mbaTaxonomy(), subskills: SUBS, graph: { jobs: [], skills: [] }, roles: ROLES });
const NO_TARGET = { jobs: [], label: "mba" };

function target(spec) {
  const [fam, lv] = spec.split(":");
  const jobs = G.jobs.filter(x => x.family === fam && (lv === "__all" || x.level === lv));
  return { jobs, label: spec, level: lv === "__all" ? null : lv };
}

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const verbose = args.includes("--verbose");
// --private adds evals/resumes/private/ (gitignored): real resumes that stay on this machine. They never go into baseline.md.
const priv = args.includes("--private");
if (priv && args.includes("--baseline")) { console.error("--private samples are not written to the baseline; run them without --baseline"); process.exit(1); }
// --external adds evals/resumes/external/ (gitignored): published sample resumes fetched by evals/fetch_external.mjs.
const ext = args.includes("--external");
if (ext && args.includes("--baseline")) { console.error("--external samples are not written to the baseline; run them without --baseline"); process.exit(1); }
const listTxt = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => READABLE.test(f) && (!only || f.includes(only))).sort() : [];
const sub = d => listTxt(path.join(here, "resumes", d)).map(f => path.join(d, f));
// in-repo and private samples are files; an external sample is a file or one resume cut out of a packet
const samples = [...listTxt(path.join(here, "resumes")), ...(priv ? sub("private") : [])].map(f => ({ f, name: f.replace(READABLE, "") }));
if (ext) for (const s of await externalSamples({ only })) samples.push({ f: "external/" + s.file + (s.packet ? " (" + s.id + ")" : ""), name: "external/" + s.id, text: s.text, error: s.error, extSpec: s.spec, external: true });
const pct = x => x == null ? "–" : Math.round(x * 100) + "%";
const rows = []; let pass = 0, fail = 0; const lines = [];
const out = s => { lines.push(s); console.log(s); };
const LEVEL_OF = { associate: "associate", mid: "mid", senior: "senior", staff: "lead", group: "lead", director: "lead", vp: "lead", cpo: "lead" };

for (const sample of samples) {
  const { f, name } = sample;
  let text = sample.text;
  try { if (sample.error) throw new Error(sample.error); if (!sample.external) text = await extractText(path.join(here, "resumes", f)); }
  catch (e) { fail++; out(`\n=== ${f}: could not be read (${String(e.message).split("\n")[0]})`); continue; }
  const specPath = path.join(here, "resumes", name + ".json");
  // fetched samples are not in the repository; what each must read is in external_expectations.json
  const extSpec = sample.external ? sample.extSpec : null;
  if (sample.external && (!extSpec || extSpec.kind !== "single")) { out(`\n=== ${f}: ${extSpec ? extSpec.kind + (extSpec.note ? " — " + extSpec.note : "") : "no expectations yet"}; ${text.trim().split(/\s+/).length} words read, not checked`); continue; }
  const spec = extSpec ? { targets: ["pm:__all"], ...extSpec } : fs.existsSync(specPath) ? JSON.parse(fs.readFileSync(specPath)) : { targets: ["pm:__all"] };
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
    // Role held: a person who held the target role at or above the target level must not read as unqualified for it.
    if (r.standing) {
      const floor = r.standing.above ? 0.6 : 0.5; const held = r.overall >= floor; held ? pass++ : fail++;
      out(`      role held (${r.standing.level}, ${r.standing.years.toFixed(1)} yrs${r.standing.above ? ", above this level" : ""}${r.standing.employers.length ? ", employer known: " + r.standing.employers.join(", ") : ""}): ${r.standing.presumed} presumed, floor ${pct(floor)} ${held ? "PASS" : "FAIL"}`);
    }
    if (verbose && t === spec.targets[0]) for (const row of r.rows) out(`      ${row.tier.padEnd(6)} ${row.status.padEnd(12)} s${row.strength} ${row.slotName.padEnd(32)} ${row.lines[0] ? JSON.stringify(row.lines[0].text.slice(0, 90)) : row.hintLines[0] ? "(hint) " + JSON.stringify(row.hintLines[0].text.slice(0, 80)) : ""}`);
  }
  const r = first;
  // a published sample's skill lists are written against the MBA taxonomy, so they are checked with that matcher
  const mba = sample.external && (spec.must_evidence || spec.must_not_tag || spec.held) ? MBA.match(text, NO_TARGET) : null;
  const covered = mba ? mba.covered : r.covered;
  const check = (label, list, want) => {
    if (!list) return [];
    const bad = list.filter(k => covered.has(k) !== want);
    pass += list.length - bad.length; fail += bad.length;
    out(`  ${label}: ${list.length - bad.length}/${list.length}${bad.length ? "  WRONG: " + bad.join(", ") : ""}`);
    return bad;
  };
  const missed = check("must_evidence", spec.must_evidence, true);
  const fp = check("must_not_tag ", spec.must_not_tag, false);
  const gapsWrong = check("real_gaps    ", spec.real_gaps, false);
  // role families the person held as jobs (not internships), read from their titles
  if (spec.held) { const got = new Set(mba.parsed.roles.filter(x => !x.isIntern && x.section !== "projects").map(x => x.roleFamily).filter(Boolean)); const bad = spec.held.filter(k => !got.has(k)); bad.length ? fail++ : pass++; out(`  roles held   : ${bad.length ? "FAIL (not read: " + bad.join(", ") + "; read: " + ([...got].join(", ") || "none") + ")" : "PASS"}`); }
  if (spec.persona) { const ok = r.profile.persona === spec.persona; ok ? pass++ : fail++; out(`  persona      : ${ok ? "PASS" : "FAIL (" + r.profile.persona + ")"}`); }
  // what the parser must find in this file, whatever its layout
  if (spec.parse) {
    // jobs are the dated roles under work experience; dated clubs, projects and volunteering are not counted
    const P = { ...r.parsed, roles: r.parsed.roles.filter(x => x.section !== "projects") }, want = spec.parse, bad = [];
    if (want.roles != null && P.roles.length !== want.roles) bad.push(`roles ${P.roles.length}, want ${want.roles}`);
    if (want.min_roles != null && P.roles.length < want.min_roles) bad.push(`roles ${P.roles.length}, want at least ${want.min_roles}`);
    if (want.min_years != null && r.profile.years < want.min_years) bad.push(`years ${r.profile.years.toFixed(1)}, want at least ${want.min_years}`);
    if (want.max_years != null && r.profile.years > want.max_years) bad.push(`years ${r.profile.years.toFixed(1)}, want at most ${want.max_years}`);
    for (const d of want.degrees || []) if (!P.degrees.includes(d)) bad.push(`degree ${d} not read`);
    for (const t of want.titles || []) if (!P.roles.some(x => { const a = x.title.toLowerCase(), b = t.toLowerCase(); return a.includes(b) || (b.startsWith(a) && (a.length >= 8 || b[a.length] === ",")); })) bad.push(`no role titled "${t}"`); // a title cut at its comma still names the job
    bad.length ? fail++ : pass++; out(`  parse        : ${bad.length ? "FAIL (" + bad.join("; ") + ")" : "PASS"} — ${P.roles.length} roles, ${r.profile.years.toFixed(1)} yrs, degrees: ${P.degrees.join(", ") || "none"}`);
  }
  if (spec.expect_employer) { const got = (r.standing && r.standing.employers) || []; const ok = got.includes(spec.expect_employer); ok ? pass++ : fail++; out(`  employer     : ${ok ? "PASS" : "FAIL (" + (got.join(", ") || "none") + ")"}`); }
  if (spec.expected_level) { const ok = LEVEL_OF[spec.expected_level] === r.profile.level; ok ? pass++ : fail++; out(`  level read   : ${ok ? "PASS" : "FAIL (" + r.profile.level + ")"}`); }
  // layouts: the same resume written other ways must read the same (roles, years, persona, level, score within 4 points)
  if (!f.startsWith("private")) {
    const o0 = { level: target(spec.targets[0]).level ? LEVEL_OF[target(spec.targets[0]).level] : undefined };
    const vs = variants(text); const badV = [];
    for (const v of vs) {
      const r2 = M.match(v.text, target(spec.targets[0]), o0); const why = [];
      if (r2.parsed.roles.length !== r.parsed.roles.length) why.push(`roles ${r2.parsed.roles.length} vs ${r.parsed.roles.length}`);
      if (Math.abs(r2.profile.pmYears - r.profile.pmYears) > 0.6) why.push(`product years ${r2.profile.pmYears.toFixed(1)} vs ${r.profile.pmYears.toFixed(1)}`);
      if (r2.profile.persona !== r.profile.persona || r2.profile.level !== r.profile.level) why.push(`read as ${r2.profile.persona}/${r2.profile.level}`);
      if (Math.abs(r2.overall - r.overall) > 0.04) why.push(`score ${pct(r2.overall)} vs ${pct(r.overall)}`);
      const lost = [...r.covered].filter(k => !r2.covered.has(k)), gained = [...r2.covered].filter(k => !r.covered.has(k));
      if (lost.length || gained.length) why.push(`skills ${lost.map(k => "-" + k).concat(gained.map(k => "+" + k)).join(" ")}`);
      why.length ? (fail++, badV.push(`${v.name} (${why.join("; ")})`)) : pass++;
    }
    if (vs.length) out(`  layouts      : ${vs.length - badV.length}/${vs.length}${badV.length ? "  WRONG: " + badV.join(", ") : ""}`);
  }
  // monotonicity: adding a line that evidences a gap must never lower the overall score
  const tg0 = target(spec.targets[0]);
  const gapIds = r.gaps.slice(0, 3).map(g => g.id).filter(id => M.nameOf(id) && TAX.skills.some(s => s.id === id));
  let mono = true;
  for (const id of gapIds) { const sig = (G.skills.find(s => s.id === id) || {}).signals?.[0]; if (!sig) continue; const r2 = M.match(text + "\n- " + sig, tg0); if (r2.overall < r.overall - 1e-9) { mono = false; out(`  monotonic    : FAIL adding evidence for ${id} lowered ${pct(r.overall)} → ${pct(r2.overall)}`); } }
  if (mono) { pass++; out(`  monotonic    : PASS`); } else fail++;
  const known = new Set([...(spec.must_evidence || []), ...(spec.must_not_tag || []), ...(spec.real_gaps || [])]);
  const unreviewed = [...covered].filter(k => !known.has(k));
  out(`  evidenced but not covered by expectations (review these): ${unreviewed.join(", ") || "none"}`);
  out(`  transferable: ${r.rows.filter(x => x.status === "transferable").map(x => x.slotName + " (via " + x.via.join("/") + ")").join(", ") || "none"}`);
  out(`  unmapped bullets: ${r.unmapped.length}`);
  rows.push({ name, persona: spec.persona, scores, tagged: r.covered.size, missed: missed.length, fp: fp.length, gapsWrong: gapsWrong.length, nEv: spec.must_evidence?.length ?? 0, nFp: spec.must_not_tag?.length ?? 0 });
}
// Role families read from resume job titles (evals/resume_titles.json). Run with the full sample set only.
if (!only) {
  const T = JSON.parse(fs.readFileSync(path.join(here, "resume_titles.json"))).titles; const wrong = [], gaps = [], closed = [];
  for (const t of T) { const x = MBA.roleOf(t.title, t.line || ""); const lvOk = !t.level || x.level === t.level; const got = x.family + (lvOk ? "" : ` at level ${x.level || "none"} (want ${t.level})`); const ok = x.family === t.family && lvOk; if (t.known_gap) (ok ? closed : gaps).push(t.title); else { ok ? pass++ : (fail++, wrong.push(`"${t.line || t.title}" read as ${x.family ? got : "none"}, want ${t.family || "none"}`)); } }
  out(`\n=== resume titles → role family (web/data/roles_mba.json): ${T.length - gaps.length - closed.length - wrong.length}/${T.length - gaps.length - closed.length}${wrong.length ? "\n  WRONG: " + wrong.join("\n  WRONG: ") : ""}`);
  out(`  known gaps (not counted): ${gaps.length}${gaps.length ? " — " + gaps.join("; ") : ""}${closed.length ? "\n  no longer a gap, remove the mark: " + closed.join("; ") : ""}`);
}
// Bands of fit: the cut points file must be in order, and bandOf must read it as documented.
if (!only) {
  const B = JSON.parse(fs.readFileSync(path.join(here, "bands_mba.json"))); const { bandOf } = require(path.join(root, "web/match.js")); const bad = [];
  if (!(B.in_range < B.strong)) bad.push("in_range is not below strong");
  for (const [g, low] of Object.entries(B.related)) { if (!(low < B.in_range)) bad.push(`${g}: related is not below in_range`); if (bandOf(low - 0.01, B, g) !== "different" || bandOf(low, B, g) !== "related" || bandOf(B.in_range, B, g) !== "in_range" || bandOf(B.strong, B, g) !== "strong") bad.push(`${g}: bandOf does not follow the cut points`); }
  for (const g of Object.keys(B.no_bands)) if (bandOf(0.9, B, g) !== null) bad.push(`${g}: has no bands but bandOf gives one`);
  for (const f of ROLES.families) if (!(B.group_of[f.id] in B.related) && !(B.group_of[f.id] in B.no_bands)) bad.push(`${f.id}: its group has neither bands nor a reason for none`);
  bad.length ? fail++ : pass++; out(`\n=== bands of fit (evals/bands_mba.json): ${bad.length ? "FAIL — " + bad.join("; ") : `PASS — in range from ${pct(B.in_range)}, like the role from ${pct(B.strong)}, ${Object.keys(B.related).length} groups with a bottom line, no bands for: ${Object.keys(B.no_bands).join(", ") || "none"}`}`);
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
