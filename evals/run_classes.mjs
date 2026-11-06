// The class picker's matching (B3), checked against hand-written expectations. Runs the picker's own code over the
// eight test résumés and the public Cornell Tech files (web/data/catalog/), the way web/classes.js runs it: the fit
// and the gaps of app.js gapsFor at level "all", Catalog.combineRoles over the roles, Catalog.relevanceScore,
// relevanceBand and gapsCovered over the tags file, sortCards("gaps") with the field tie-break.
//   node evals/run_classes.mjs               # report; exit 1 when a check fails
//   node evals/run_classes.mjs --baseline    # also rewrite evals/classes_baseline.md
//   node evals/run_classes.mjs --cut         # print the thresholds that keep the study's band shares
//   node evals/run_classes.mjs --only pivot  # the cases whose id contains the text
// The expectation files are evals/classes/<resume>+<roleId>.json (and <resume>+all.json); evals/README.md,
// "The class picker's matching", gives their shape.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { web, readJson, atlasFactory, Matcher, require } = await import(path.join(here, "..", "tests", "web", "_load.mjs"));
// the pure parts plus the reads, with web/data read from disk as the tests read it
const Catalog = require(path.join(web, "catalog.js"))({ load: url => JSON.parse(fs.readFileSync(path.join(web, url), "utf8")) });

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const BASELINE = args.includes("--baseline");
const CUT = args.includes("--cut");
const CAMPUS = "cornell_tech";
const TOP = 10;

// ---------- the cases: each résumé with the roles its expectation file or the rough fit points at ----------
// Every résumé gets product.pm (the expectation files target pm:*), then the MBA roles the rough fit (Atlas.roughFit)
// ranked highest for it on 2026-10-29, or the second product role its file names. Fixed here so the cases stay the
// same when the data refreshes (the tuning study's table, data/experiments scratch, 2026-10-29).
const CASES = {
  course_list: ["product.pm", "pmm", "strategic_finance"],
  experienced_pm: ["product.pm", "strategy_manager", "business_analytics"],
  experienced_with_coursework: ["product.pm", "procurement", "strategic_sourcing"],
  grad_student_new: ["product.pm", "marketing_manager", "brand_manager"],
  pivot_phd_hci: ["product.pm", "program_manager", "business_intelligence"],
  senior_pm_pdf_layout: ["product.pm", "product.product_owner", "pmm"],
  staff_pm_terse: ["product.pm", "general_manager", "tech_strategy"],
  template_placeholder_years: ["product.pm", "corporate_banking", "fpa"],
};
// The tech samples (evals/resumes_tech/, 2026-11-06): each with the tech role its file targets and the nearest other
// role, tech or (for the lawyer) the MBA compliance role, so a mixed set reads the two tag readings joined.
const CASES_TECH = {
  meng_cs_new_grad: ["tech.software_engineer", "tech.ml_engineer"],
  ml_masters_paper: ["tech.ml_engineer", "tech.data_engineer"],
  analyst_to_data_engineer: ["tech.data_engineer", "tech.ml_engineer"],
  ece_embedded: ["tech.software_engineer", "tech.security_engineer"],
  security_career_changer: ["tech.security_engineer", "tech.software_engineer"],
  connective_media_designer: ["tech.product_designer", "tech.ux_researcher"],
  llm_counsel: ["tech.counsel", "compliance"],
};
Object.assign(CASES, CASES_TECH);
const resumeDir = name => name in CASES_TECH ? "resumes_tech" : "resumes";
// the level the fit is read at: "all" is what the role screen opens on with no About you answers (app.js defaultLevel)
const LEVEL = "all";
const LEVEL_OPT = { entry: "associate", mid: "mid", senior: "senior", lead: "lead" };
// the study's band shares, kept by --cut: 79 high and 1,747 medium of 3,392 card reads (tuned run, 2026-10-29)
const SHARE_HIGH = 79 / 3392, SHARE_MID = (79 + 1747) / 3392;

const t0 = Date.now();
// the tech index on, so the tech roles exist (the switch hides them from visitors; the MBA and product cases read the same)
const Atlas = atlasFactory({ load: url => JSON.parse(fs.readFileSync(path.join(web, url), "utf8")), Matcher, config: () => ({ TECH_ENABLED: true }) });
const ix = await Atlas.index(); await Atlas.product();
const GENERIC = await Atlas.genericSkills();
const campus = readJson("sp27_campus.json").campuses.find(c => c.id === CAMPUS);
const TH = campus.relevance || {};
const data = await Catalog.loadCatalog(campus);
const tagsFile = JSON.parse(fs.readFileSync(path.join(web, campus.tags_file), "utf8"));
const cards = Catalog.collapse(data);
// one read per card, as the picker keeps one per page (classes.js readAll): the MBA reading, and joined with the tech
// reading for a case with a tech role (Catalog.tagsFor)
const readsOf = withTech => Object.fromEntries(cards.map(c => [c.key, Catalog.cardTags(c, Catalog.tagsFor(data, withTech))]));
const READS = { false: readsOf(false), true: readsOf(true) };
const round = v => Math.round(v * 1000) / 1000;

// ---------- one role: its rows for the relevance score, and the résumé's fit and gaps (app.js gapsFor) ----------
const roleCache = {};
async function roleData(roleId) {
  if (roleCache[roleId]) return roleCache[roleId];
  const R = await Atlas.role(roleId);
  const rows = Catalog.rowsOf(Atlas.grid(R, R.jobs));   // classes.js rowsFor
  const { M } = await Atlas.matcher(R);
  return roleCache[roleId] = { R, rows, M };
}
async function fitFor(roleId, text) {
  const { R, rows, M } = await roleData(roleId);
  const slice = LEVEL === "all" ? R.jobs : R.jobs.filter(j => Atlas.stepOf(j) === LEVEL);
  const r = M.match(text, { jobs: slice, familyJobs: R.jobs, label: R.role.label }, { level: LEVEL_OPT[LEVEL], ladder: R.role.ladder });
  const all = r.rows, by = st => all.filter(x => x.status === st && x.tier !== "diff");
  const f = { coreGaps: all.filter(x => x.tier === "core" && (x.status === "gap" || x.status === "thin")).sort((a, b) => b.w - a.w), gaps: by("gap"), thin: by("thin") };
  // app.js gapRows: core gaps and thin first (by share), then the common gaps, then the common thin rows
  const gaps = [...f.coreGaps, ...f.gaps.filter(x => x.tier !== "core"), ...f.thin.filter(x => x.tier !== "core")]
    .filter(x => x.slot !== "__domain" && x.slot !== "__ai" && R.skillById[x.id]).map(x => ({ id: x.id, name: x.slotName, tier: x.tier, w: x.w }));
  const role = ix.roles[roleId];
  return { roleId, label: R.role.label, group: role ? role.group : null, rows, gaps };
}

// ---------- one case: the roles read together, every card scored, the picker's order ----------
function scoreCase(fits) {
  const readsByKey = READS[fits.some(f => ix.roles[f.roleId] && ix.roles[f.roleId].set === "tech")];
  const c = Catalog.combineRoles(fits);
  const gaps = c.gaps || [], rows = c.rows;
  const subjects = Catalog.fieldSubjects(campus, [...new Set(fits.map(f => f.group).filter(Boolean))]);
  const withGaps = gaps.length > 0;
  const info = {}, detail = {};
  for (const card of cards) {
    const rd = readsByKey[card.key];
    const r = Catalog.relevanceScore(rd.found, rows, GENERIC);
    const covered = withGaps ? Catalog.gapsCovered(rd.teaches, gaps, GENERIC) : [];
    info[card.key] = { band: Catalog.relevanceBand(r.score, TH), score: r.score, covered };
    detail[card.key] = { matched: r.matched };
  }
  const noCover = Catalog.noCover(cards, info);
  const order = Catalog.sortCards(cards, "gaps", info, subjects);
  const top = order.slice(0, TOP).map(card => ({ key: card.key, codes: card.codes, title: card.title, score: round(info[card.key].score), band: info[card.key].band,
    covered: info[card.key].covered.map(g => ({ id: g.id, name: g.name, tier: g.tier, w: round(g.w || 0) })), coveredW: round(info[card.key].covered.reduce((a, g) => a + (g.w || 0), 0)) }));
  const bands = { high: 0, medium: 0, low: 0 };
  for (const card of cards) bands[info[card.key].band]++;
  return { gaps, rows, subjects, info, order, top, noCover, bands, nCovering: cards.filter(x => info[x.key].covered.length).length };
}

// ---------- the checks against the expectation file ----------
const cardOf = code => cards.find(c => c.codes.includes(code));
function check(id, spec, res) {
  const out = [];
  // a failing check the spec lists under known_failures (name -> reason) is known: it is reported and counted apart,
  // and does not fail the run. A known check that passes is reported too, so the list never goes stale unnoticed.
  const known = (spec && spec.known_failures) || {};
  const add = (name, ok, why) => out.push({ name, ok, why, known: !ok && name in known ? known[name] : null });
  if (!spec) { add("spec", false, `no file evals/classes/${id}.json`); return out; }
  const want = CASES[id.split("+")[0]], roles = id.endsWith("+all") ? want : [id.slice(id.indexOf("+") + 1)];
  add("roles", JSON.stringify(spec.roles || []) === JSON.stringify(roles), `spec names ${JSON.stringify(spec.roles || [])}, case is ${JSON.stringify(roles)}`);
  const rank = code => { const c = cardOf(code); return c ? res.order.findIndex(x => x.key === c.key) + 1 : 0; };
  for (const [field, inside] of [["must_top", true], ["must_not_top", false]]) {
    const m = spec[field]; if (!m) continue;
    const n = m.n || 3;
    for (const code of m.codes || []) {
      const r = rank(code);
      if (!r) { add(`${field} ${code}`, false, "no such class in the catalog"); continue; }
      const ok = inside ? r <= n : r > n;
      add(`${field} ${code}`, ok, `rank ${r} of ${cards.length}, n ${n}`);
    }
  }
  const gapIds = new Set(res.gaps.map(g => g.id));
  for (const [gapId, codes] of Object.entries(spec.must_cover || {})) {
    if (!gapIds.has(gapId)) { add(`must_cover ${gapId}`, false, "not a gap of this case"); continue; }
    for (const code of codes || []) {
      const c = cardOf(code);
      const ok = !!c && res.info[c.key].covered.some(g => g.id === gapId);
      add(`must_cover ${gapId} ${code}`, ok, c ? `covers ${res.info[c.key].covered.map(g => g.id).join(", ") || "nothing"}` : "no such class in the catalog");
    }
  }
  if (typeof spec.no_cover === "boolean") add("no_cover", spec.no_cover === res.noCover, `case is ${res.noCover ? "" : "not "}a noCover case`);
  return out;
}

// ---------- run ----------
const specDir = path.join(here, "classes");
const readSpec = id => { const f = path.join(specDir, id + ".json"); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; };
const results = [];
for (const name of Object.keys(CASES)) {
  const text = fs.readFileSync(path.join(here, resumeDir(name), name + ".txt"), "utf8");
  const fits = [];
  for (const roleId of CASES[name]) fits.push(await fitFor(roleId, text));
  const all = [...fits.map(f => ({ id: `${name}+${f.roleId}`, fits: [f] })), { id: `${name}+all`, fits }];
  for (const { id, fits: fl } of all) {
    if (only && !id.includes(only)) continue;
    const res = scoreCase(fl);
    const spec = readSpec(id);
    results.push({ id, resume: name, roles: fl.map(f => f.roleId), labels: fl.map(f => f.label), spec, res, checks: check(id, spec, res) });
  }
}
// an expectation file with no case behind it is a failure too
const orphans = fs.existsSync(specDir) ? fs.readdirSync(specDir).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5)).filter(id => !(CASES[id.split("+")[0]] || []).concat("all").some(r => id === `${id.split("+")[0]}+${r}`)) : [];
if (!only) for (const id of orphans) results.push({ id, resume: id.split("+")[0], roles: [], labels: [], spec: null, res: null, checks: [{ name: "spec", ok: false, why: "a file in evals/classes with no case in CASES" }] });

// ---------- --cut: the thresholds that keep the study's band shares over the pooled scores ----------
if (CUT) {
  const pool = results.filter(r => r.res).flatMap(r => cards.map(c => r.res.info[c.key].score)).sort((a, b) => b - a);
  // the score at the rank, to 3 decimals: of the two roundings, the one whose count comes closest to the target
  // (many cards tie, since a card scores the same in every case with the same roles)
  const at = n => { const v = pool[Math.max(0, Math.min(pool.length, n) - 1)] * 1000; return [Math.floor(v), Math.ceil(v)].map(x => x / 1000).sort((a, b) => Math.abs(pool.filter(s => s >= a).length - n) - Math.abs(pool.filter(s => s >= b).length - n))[0]; };
  const nHigh = Math.round(pool.length * SHARE_HIGH), nMid = Math.round(pool.length * SHARE_MID);
  const th = { high: at(nHigh), medium: at(nMid) };
  const count = t => ({ high: pool.filter(s => s >= t.high).length, mid: pool.filter(s => s >= t.medium).length });
  const now = count(TH), next = count(th);
  console.log(`pooled ${pool.length} card reads over ${results.filter(r => r.res).length} cases`);
  console.log(`target: ${nHigh} high (${(SHARE_HIGH * 100).toFixed(1)}%), ${nMid} medium or high (${(SHARE_MID * 100).toFixed(1)}%)`);
  console.log(`current thresholds high ${TH.high} medium ${TH.medium}: ${now.high} high, ${now.mid} medium or high`);
  console.log(`cut: "relevance": { "high": ${th.high.toFixed(3)}, "medium": ${th.medium.toFixed(3)} } gives ${next.high} high, ${next.mid} medium or high`);
  process.exit(0);
}

// ---------- the report ----------
const all = results.flatMap(r => r.checks);
const pass = all.filter(c => c.ok).length, knownFail = all.filter(c => !c.ok && c.known).length, fail = all.filter(c => !c.ok && !c.known).length;
const stale = results.flatMap(r => r.checks.filter(c => c.ok && r.spec && r.spec.known_failures && c.name in r.spec.known_failures).map(c => `${r.id}: ${c.name}`));
const bands = { high: 0, medium: 0, low: 0 };
for (const r of results) if (r.res) for (const b of Object.keys(bands)) bands[b] += r.res.bands[b];
const lines = [];
for (const r of results) {
  if (!r.res) { lines.push(`=== ${r.id}\n  FAIL spec: ${r.checks[0].why}`); continue; }
  const head = `=== ${r.id}  (${r.labels.join(" + ")})  gaps ${r.res.gaps.length}  bands h/m/l ${r.res.bands.high}/${r.res.bands.medium}/${r.res.bands.low}  covering ${r.res.nCovering}${r.res.noCover ? "  noCover" : ""}`;
  const tops = r.res.top.slice(0, 5).map((t, i) => `  ${String(i + 1).padStart(2)}. ${t.codes[0].padEnd(12)} ${t.band.padEnd(6)} ${t.score.toFixed(3)}  gaps ${t.coveredW.toFixed(3)}  ${t.covered.map(g => g.name).join(", ") || "-"}  · ${t.title}`);
  const checks = r.checks.map(c => `  ${c.ok ? "PASS" : c.known ? "KNOWN" : "FAIL"} ${c.name}: ${c.why}${c.known ? ` — ${c.known}` : ""}`);
  lines.push([head, ...tops, ...checks].join("\n"));
}
console.log(lines.join("\n\n"));
console.log(`\n${results.length} cases over ${cards.length} cards; bands ${bands.high} high, ${bands.medium} medium, ${bands.low} low; thresholds high ${TH.high} medium ${TH.medium}`);
if (stale.length) console.log(`known failures that now pass (drop them from known_failures): ${stale.join("; ")}`);
console.log(`Checks: ${pass} pass, ${fail} fail, ${knownFail} known.  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

if (BASELINE) {
  if (only) { console.error("--only runs are not written to the baseline"); process.exit(1); }
  const md = [`# Class picker eval baseline`, ``,
    `Generated by \`node evals/run_classes.mjs --baseline\` on ${new Date().toISOString().slice(0, 10)} over ${cards.length} cards (tags file generated ${tagsFile.generated || "unknown"}; thresholds high ${TH.high}, medium ${TH.medium}). Do not edit by hand.`, ``,
    `| résumé | roles | gaps | noCover | top 3 | checks |`, `|---|---|---|---|---|---|`];
  for (const r of results) {
    const p = r.checks.filter(c => c.ok).length, k = r.checks.filter(c => !c.ok && c.known).length, f = r.checks.length - p - k;
    md.push(r.res ? `| ${r.resume} | ${r.labels.join(", ")} | ${r.res.gaps.length} | ${r.res.noCover ? "yes" : "no"} | ${r.res.top.slice(0, 3).map(t => t.codes[0]).join(", ")} | ${p} pass, ${f} fail${k ? `, ${k} known` : ""} |` : `| ${r.resume} | ${r.id} | – | – | – | 0 pass, 1 fail |`);
  }
  md.push(``, `Bands over all cases: ${bands.high} high, ${bands.medium} medium, ${bands.low} low. Checks: ${pass} pass, ${fail} fail, ${knownFail} known (a known failure is one the spec file names under known_failures with its reason; the run stays green on it).`, ``, "```", lines.join("\n\n"), "```", ``);
  fs.writeFileSync(path.join(here, "classes_baseline.md"), md.join("\n"));
  console.log("\nwrote evals/classes_baseline.md");
}
process.exit(fail || stale.length ? 1 : 0);
