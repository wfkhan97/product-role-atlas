// The model read eval (2026-11-01): run the inference of web/api/infer.js (the same prompt, request and validation
// the site's /api/infer sends) over the sample resumes of evals/resumes/, and score what it adds against the
// matcher alone. Their expectation files are the spec and do not change here: an inferred skill may fill a
// must_evidence the patterns miss (a gain), must not tag a must_not_tag or a real_gaps skill (a loss).
//
//   node evals/infer.mjs                 # report; asks the model for any resume with no saved answer (ANTHROPIC_API_KEY)
//   node evals/infer.mjs --reuse         # saved answers only: no network, no key (resumes without one are listed)
//   node evals/infer.mjs --baseline      # also rewrite evals/infer_baseline.md (with --reuse: from the saved answers)
//   node evals/infer.mjs --url https://gradbuddy-atlas.vercel.app/api/infer
//                                        # ask the deployed route instead of Anthropic (the key lives only on Vercel):
//                                        # the body the site sends, the same cache; check it first: curl <url> → { ok, key }
//                                        # a preview deploy behind Vercel Authentication: INFER_COOKIE="_vercel_jwt=…" (from its share link)
//   node evals/infer.mjs --quick         # the eight samples only; the default (--full) adds every readable published
//                                        # sample of evals/resumes/external/ (the calibration's set, scored on its own role)
//   node evals/infer.mjs --private       # also evals/resumes/private/* (gitignored, never in the baseline)
//   node evals/infer.mjs --only grad     # filter samples by substring
//
// Saved answers: data/experiments/infer/<hash>.json (gitignored, a pipeline cache: never swept), one per resume,
// keyed by the model, the prompt, the skill list, the set, the text and the found ids, so a change to any of them
// asks again. The raw answer is saved and validated on every run, so a change to the validation needs no network.
// The key (direct calls only): ANTHROPIC_API_KEY in the environment or in .env at the repository root. Through --url
// the route validates and returns only the kept items; they are saved as the raw answer with the url's host in place
// of the model's usage, and validated again on every run like a direct answer.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { extractText, READABLE } from "./extract.mjs";
import { rolesData, mbaTaxonomy, externalSamples, SOURCES, EXTERNAL_DIR } from "./lib.mjs";
import { audit, bandMove, summarize, costOf } from "./infer_lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const require = createRequire(import.meta.url);
const I = require(path.join(root, "web/api/infer.js"));
const { createMatcher } = require(path.join(root, "web/match.js"));
const J = f => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));

const args = process.argv.slice(2);
const reuse = args.includes("--reuse"), baseline = args.includes("--baseline"), priv = args.includes("--private");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const full = !args.includes("--quick");   // the rule since 2026-11-01: the whole resume set, not the eight samples
const url = args.includes("--url") ? args[args.indexOf("--url") + 1] : null;
if (url && !/^https?:\/\/[^/]+\/.*api\/infer\/?$/.test(url)) { console.error(`--url wants the route itself, e.g. https://gradbuddy-atlas.vercel.app/api/infer (got ${url})`); process.exit(1); }
if (priv && baseline) { console.error("--private samples are not written to the baseline; run them without --baseline"); process.exit(1); }
const CACHE = path.join(root, "data/experiments/infer");
const SET = "both";   // what the site sends (web/app.js, inferResume)

// the key, from the environment or .env (KEY=value lines; the value is never printed)
function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const f = path.join(root, ".env"); if (!fs.existsSync(f)) return null;
  const m = fs.readFileSync(f, "utf8").match(/^\s*ANTHROPIC_API_KEY\s*=\s*"?([^"\n]*)"?\s*$/m);
  return m && m[1].trim() ? m[1].trim() : null;
}

// The matchers as the site builds them. `found` is the rough read's `shown` (Atlas.roughFit: the MBA taxonomy, no
// postings): what the site tells the route is credited already. The score is the product matcher's, as evals/run.mjs.
const TAXM = mbaTaxonomy();
const ROUGH = createMatcher({ taxonomy: TAXM, subskills: J("web/data/subskills_mba.json"), graph: { jobs: [], skills: [] }, roles: rolesData() });
const G = J("web/data/graph.json"), BANDS = J("web/data/bands.json");
const M = createMatcher({ taxonomy: J("web/data/taxonomy.json"), subskills: J("web/data/subskills.json"), graph: G, distinct: BANDS.scoring.distinct || undefined });
const LEVEL_OF = { associate: "associate", mid: "mid", senior: "senior", staff: "lead", group: "lead", director: "lead", vp: "lead", cpo: "lead" };
function target(spec) {
  const [fam, lv] = spec.split(":");
  return { jobs: G.jobs.filter(x => x.family === fam && (lv === "__all" || x.level === lv)), label: spec, level: lv === "__all" ? null : lv };
}
const foundOf = text => { const ev = ROUGH.tag(ROUGH.readRoles(ROUGH.parseResume(text))); return Object.entries(ev).filter(([, e]) => ROUGH.shownBy(e)).map(([id]) => id).sort(); };

const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const cacheKey = (text, found) => sha(JSON.stringify([I.MODEL, I.PROMPT, I.taxonomyBlock(SET), SET, text, found])).slice(0, 24);

const listTxt = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => READABLE.test(f) && (!only || f.includes(only))).sort() : [];
const samples = [...listTxt(path.join(here, "resumes")).map(f => ({ f, dir: "resumes" })), ...(priv ? listTxt(path.join(here, "resumes/private")).map(f => ({ f, dir: "resumes/private" })) : [])];
const key = reuse || url ? null : apiKey();
// one resume through the deployed route: the body web/infer.js sends (text, found sorted, set); no Origin header,
// which the route accepts from a non-browser caller
async function viaRoute(text, found) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 40000), t0 = Date.now();
  try {
    // INFER_COOKIE: a preview deploy behind Vercel Authentication takes the cookie its share link sets (curl -c)
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(process.env.INFER_COOKIE ? { cookie: process.env.INFER_COOKIE } : {}) }, body: JSON.stringify({ text, found, set: SET }), signal: ctl.signal });
    if (!r.ok) { const e = new Error(`route ${r.status}${r.status === 503 ? " (no key on the host)" : ""}`); e.status = r.status; throw e; }
    const b = await r.json();
    return { model: b.model || null, ms: b.ms != null ? b.ms : Date.now() - t0, raw: { inferred: Array.isArray(b.inferred) ? b.inferred : [] } };
  } finally { clearTimeout(timer); }
}
const paths = new Set();   // which path produced the answers read: "direct" or "route <host>"
const lines = [], out = s => { lines.push(s); console.log(s); };
const pct = x => x == null ? "–" : Math.round(x * 100) + "%";
let asked = 0, saved = 0, missing = 0, cost = { in: 0, cached: 0, out: 0 };
const tally = { gained: 0, lost: 0, inferred: 0, resumes: 0 };

// One resume's answer: the saved one, else (not --reuse) asked through the route or directly and saved; then validated
// again. Returns { rec, found, inferred, dropped } or null (printed: failed or no saved answer).
async function readOne(name, text) {
  const found = foundOf(text), k = cacheKey(text, found), file = path.join(CACHE, k + ".json");
  let rec = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  if (rec) saved++;
  else if (!reuse && (key || url)) {
    try {
      // the answer, never the resume; `via` says which path produced it
      if (url) { const r = await viaRoute(text, found); rec = { via: "route", host: new URL(url).host, model: r.model, set: SET, key: k, at: new Date().toISOString(), ms: r.ms, raw: r.raw }; }
      else { const r = await I.infer({ text, found, set: SET }, { apiKey: key }); rec = { via: "direct", model: r.model, set: SET, key: k, at: new Date().toISOString(), ms: r.ms, usage: r.usage, raw: r.raw }; }
      fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(file, JSON.stringify(rec, null, 1)); asked++;
    } catch (e) { out(`\n=== ${name}: the model read failed (${e.name === "AbortError" ? "timeout" : e.status || e.message})`); return null; }
  }
  if (!rec) { missing++; out(`\n=== ${name}: no saved answer (${found.length} skills found by the patterns)`); return null; }
  paths.add(rec.via === "route" ? `route ${rec.host}` : "direct");
  if (rec.usage) { cost.in += rec.usage.input_tokens || 0; cost.cached += (rec.usage.cache_read_input_tokens || 0) + (rec.usage.cache_creation_input_tokens || 0); cost.out += rec.usage.output_tokens || 0; }
  const inferred = I.validate(rec.raw, { text, found, set: SET });
  const dropped = ((rec.raw || {}).inferred || []).length - inferred.length;
  // the dollars of this answer: the usage of a direct call, else an estimate from the characters sent and returned
  const dollars = costOf(rec.usage, { inChars: I.PROMPT.length + I.taxonomyBlock(SET).length + I.userMessage(text, found).length, outChars: JSON.stringify(rec.raw || {}).length });
  return { rec, found, inferred, dropped, dollars };
}

out(`## The eight samples (evals/resumes/*.json are the spec)`);
for (const { f, dir } of samples) {
  const name = f.replace(READABLE, ""), specPath = path.join(here, dir, name + ".json");
  const spec = fs.existsSync(specPath) ? JSON.parse(fs.readFileSync(specPath, "utf8")) : { targets: ["pm:__all"] };
  let text; try { text = (await extractText(path.join(here, dir, f))).trim(); } catch (e) { out(`\n=== ${name}: could not be read (${String(e.message).split("\n")[0]})`); continue; }
  const one = await readOne(name, text); if (!one) continue;
  const { rec, found, inferred, dropped } = one;
  tally.resumes++; tally.inferred += inferred.length;
  out(`\n=== ${name}  (${spec.persona || "?"}) → ${inferred.length} inferred${dropped ? `, ${dropped} dropped by validation` : ""}; ${found.length} found by the patterns; ${rec.model}${rec.via === "route" ? ` through ${rec.host}` : ""}${rec.ms ? `, ${rec.ms} ms` : ""}`);
  for (const x of inferred) out(`  ◈ ${x.id.padEnd(26)} “${x.line.slice(0, 110)}” — ${x.why}`);
  // per target: the score without and with, and the expectations each way
  const want = { ev: spec.must_evidence || [], fp: spec.must_not_tag || [], gaps: spec.real_gaps || [] };
  for (const t of spec.targets || ["pm:__all"]) {
    const tg = target(t), o = { level: tg.level ? LEVEL_OF[tg.level] : undefined };
    const a = M.match(text, tg, o), b = M.match(text, tg, { ...o, inferred });
    const band = spec.score_band && spec.score_band[t], inBand = r => band ? r.overall >= band[0] && r.overall <= band[1] : null;
    out(`  ${t.padEnd(14)} overall ${pct(a.overall)} → ${pct(b.overall)}${band ? `  band ${pct(band[0])}–${pct(band[1])} ${inBand(a) ? "in" : "out"} → ${inBand(b) ? "in" : "out"}` : ""}  rows inferred: ${b.rows.filter(r => r.status === "inferred").map(r => r.id).join(", ") || "none"}`);
    if (t !== (spec.targets || ["pm:__all"])[0]) continue;
    const has = (r, id) => r.covered.has(id);
    const gainEv = want.ev.filter(id => !has(a, id) && has(b, id)), newFp = want.fp.filter(id => !has(a, id) && has(b, id)), newGap = want.gaps.filter(id => !has(a, id) && has(b, id));
    const missEv = want.ev.filter(id => !has(b, id));
    tally.gained += gainEv.length; tally.lost += newFp.length + newGap.length;
    out(`  must_evidence: ${want.ev.length - want.ev.filter(id => !has(a, id)).length}/${want.ev.length} → ${want.ev.length - missEv.length}/${want.ev.length}${gainEv.length ? `  GAINED: ${gainEv.join(", ")}` : ""}${missEv.length ? `  still missed: ${missEv.join(", ")}` : ""}`);
    out(`  must_not_tag : ${newFp.length ? "LOST: now tagged " + newFp.join(", ") : "none newly tagged"}`);
    out(`  real_gaps    : ${newGap.length ? "LOST: now covered " + newGap.join(", ") : "none newly covered"}`);
    const unreviewed = inferred.map(x => x.id).filter(id => ![...want.ev, ...want.fp, ...want.gaps].includes(id));
    out(`  inferred, not in the expectations (review these): ${unreviewed.join(", ") || "none"}`);
  }
}
// Haiku 5.5, prompts up to 100K tokens: $0.10 / $0.50 per million input / output; cache reads 0.1x, writes 1.25x
// (the cached figure mixes both, so it is an upper bound at the write rate)
const dollars = (cost.in * 0.10 + cost.cached * 0.125 + cost.out * 0.50) / 1e6;
const summary = `\nTOTAL: ${tally.resumes} resumes read (${asked} asked now, ${saved} saved answers, ${missing} without one); ${tally.inferred} skills inferred; must_evidence gained ${tally.gained}; expectations lost ${tally.lost}` +
  (cost.in + cost.out ? `; tokens ${cost.in} in + ${cost.cached} cached + ${cost.out} out ≈ $${dollars.toFixed(4)}` : "");
out(summary);

// ---------- the published samples (evals/resumes/external/): the calibration's set, each on its own MBA role ----------
// No skill expectations: per resume the inferred skills and the band of fit for the sample's own role without → with,
// as the site reads it (Atlas.role + Atlas.matcher, bands_mba.json); then the aggregate. A sample counts as the
// calibration counts it (evals/calibrate.mjs): a single resume with a role and 120 words or more; its role maps onto
// an MBA role the same way (pm is product.pm, the product set's id; the other product families have none here and get no band).
const ext = { present: 0, total: Object.keys(SOURCES).length, rows: [], skipped: [], t0: Date.now() };
if (full) {
  ext.present = fs.existsSync(EXTERNAL_DIR) ? fs.readdirSync(EXTERNAL_DIR).filter(f => READABLE.test(f) && SOURCES[f.replace(READABLE, "")]).length : 0;
  const atlas = require(path.join(root, "web/atlas.js"))({ load: u => JSON.parse(fs.readFileSync(path.join(root, "web", u), "utf8")), Matcher: require(path.join(root, "web/match.js")) });
  const Mx = require(path.join(root, "web/match.js"));
  const ix = await atlas.index(), TAXBY = Object.fromEntries(TAXM.skills.map(s => [s.id, s]));
  const ownOf = r => r === "pm" ? "product.pm" : ix.roles[r] && ix.roles[r].set === "mba" ? r : null;
  out(`\n## The published samples (evals/resumes/external/: ${ext.present} of ${ext.total} files present)`);
  for (const smp of await externalSamples({ only })) {
    const { id, text } = smp;
    if (!text || !smp.role || (smp.spec && smp.spec.kind !== "single")) { ext.skipped.push(`${id} (${smp.error ? "unreadable" : !smp.role ? "no role" : "not a single resume"})`); continue; }
    if (text.trim().split(/\s+/).length < 120) { ext.skipped.push(`${id} (under 120 words)`); continue; }
    const one = await readOne("external/" + id, text.trim()); if (!one) continue;
    const { inferred, dropped } = one, own = ownOf(smp.role);
    let a = null, b = null, ba = null, bb = null;
    if (own) {
      const R = await atlas.role(own), { M: RM, bands, group } = await atlas.matcher(R), tg = { jobs: R.jobs, familyJobs: R.jobs, label: R.role.label };
      a = RM.match(text.trim(), tg, { ladder: R.role.ladder, inferred: [] }); b = RM.match(text.trim(), tg, { ladder: R.role.ladder, inferred });
      ba = Mx.bandOf(a.overall, bands, group); bb = Mx.bandOf(b.overall, bands, group);
    }
    const move = own ? bandMove(ba, bb) : null, au = audit(inferred, text, TAXBY, I.norm);
    ext.rows.push({ id, inferred, move, audit: au, ms: one.rec.ms || 0, cost: one.dollars });
    out(`\n=== external/${id}  (${smp.role}, ${smp.seniority}) → ${inferred.length} inferred${dropped ? `, ${dropped} dropped by validation` : ""}; ${one.found.length} found by the patterns`);
    for (const x of inferred) out(`  ◈ ${x.id.padEnd(26)} “${x.line.slice(0, 110)}” — ${x.why}`);
    out(own ? `  ${own.padEnd(26)} overall ${pct(a.overall)} → ${pct(b.overall)}  band ${ba || "none"} → ${bb || "none"}${move ? `  BAND ${move.toUpperCase()}` : ""}` : `  no MBA role for ${smp.role}: no band`);
    const bad = ["credentials", "behaviours", "ungrounded", "unknown"].filter(k => au[k].length);
    if (bad.length) out(`  MUST BE ZERO: ${bad.map(k => `${k} ${au[k].join(", ")}`).join("; ")}`);
  }
  const S = summarize(ext.rows), secs = Math.round((Date.now() - ext.t0) / 1000);
  out(`\n## Aggregate over the published samples`);
  out(`resumes read: ${S.read} (${ext.present} of ${ext.total} files present; ${ext.skipped.length} skipped${ext.skipped.length ? ": " + ext.skipped.join(", ") : ""})`);
  out(`inferred per resume: mean ${S.mean.toFixed(1)}, max ${S.max}`);
  out(`most inferred: ${S.top.map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`);
  out(`band moves: ${S.up} up, ${S.down} down`);
  out(`inferred credentials: ${S.credentials} (must be 0); behaviours: ${S.behaviours} (must be 0); unknown ids: ${S.unknown} (must be 0); quoted lines not in the text: ${S.ungrounded} (must be 0)`);
  out(`time: model ${Math.round(S.ms / 1000)} s summed over the answers, this run ${secs} s; cost ≈ $${S.cost.toFixed(4)} (direct calls from their usage; route answers estimated from characters, thinking left out)`);
}

if (baseline) {
  const none = tally.resumes === 0 && !ext.rows.length;
  const pathLine = [...paths].map(p => p === "direct" ? "direct calls to the Anthropic API" : `the deployed route at ${p.slice(6)}`).join(" and ");
  const md = [`# Model read eval baseline`, ``, `Generated by \`node evals/infer.mjs --baseline${reuse ? " --reuse" : ""}${url ? " --url " + url : ""}\` on ${new Date().toISOString().slice(0, 10)}: ${I.MODEL}, the prompt and validation of \`web/api/infer.js\`, set \`${SET}\`. Do not edit by hand.`, ``,
    full ? `Two sections: the eight samples against their expectations, then the published samples of \`evals/resumes/external/\` (${ext.present} of the ${ext.total} files in \`external_sources.json\` were present for this run; \`python -m pipeline.store pull evals\` brings the rest) on their own role, with the aggregate.` : `The eight samples only (\`--quick\`).`, ``,
    ...(!paths.size ? [] : [`Answers from ${pathLine}.`, ``]),
    none ? `No saved answers yet: nothing was inferred. \`node evals/infer.mjs --baseline --url https://gradbuddy-atlas.vercel.app/api/infer\` (the key lives on Vercel) or, with \`ANTHROPIC_API_KEY\` in the environment or \`.env\`, \`node evals/infer.mjs --baseline\` asks the model once per resume and saves the answers under \`data/experiments/infer/\`; \`--reuse\` then reruns from them without network or key.` :
      `Per resume: each inferred skill with the line that suggested it, then per target the matcher's overall score without → with the inferred skills, and on the first target the expectations (evals/resumes/*.json) each way. A GAINED must_evidence is a skill the patterns miss and the model read finds; a LOST line is a must_not_tag or real_gaps skill the model read tags.`,
    ``, "```", ...lines.map(l => l.replace(/^\n/, "")), "```", ``];
  fs.writeFileSync(path.join(here, "infer_baseline.md"), md.join("\n"));
  console.log("\nwrote evals/infer_baseline.md");
}
