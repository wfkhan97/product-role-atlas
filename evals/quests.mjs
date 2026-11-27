// The project-writer eval (2026-11-11; the portfolio flow, 2026-11-27): what the model behind /api/open and
// /api/quests writes, held to the rules web/quests.js validate checks, over a small fixed set: the eight sample résumés
// of evals/resumes/ × two or three roles each (MBA, product and tech sets) × three answer profiles (a person who stays
// with their own tools, a builder open to new ones, and a "none of these" rewrite with feedback and avoided titles).
// It reports the validity rate per rule (level_mix and share_dropped are notes, not drops), how often a project was
// dropped, the token usage and the cost per person at Claude Opus 5.5's prices, and writes evals/quests_baseline.md.
//
//   node evals/quests.mjs                 # asks the model for any case with no saved answer (ANTHROPIC_API_KEY)
//   node evals/quests.mjs --reuse         # saved answers only: no network, no key (cases without one are listed)
//   node evals/quests.mjs --baseline      # also rewrite evals/quests_baseline.md (with --reuse: from the saved answers)
//   node evals/quests.mjs --url https://<deploy>/api/quests
//                                        # through the deployed function, signed in as a test account:
//                                        # QUESTS_TOKEN=<its session access token>; each case POSTs /api/tree (the
//                                        # sample and the roles, which rebuilds that account's map) then /api/quests;
//                                        # a preview behind Vercel Authentication takes INFER_COOKIE; the deploy
//                                        # needs QUESTS_DAILY_CAP of 60 or more for one full run (51 cases) (the cap counts calls)
//   node evals/quests.mjs --only grad     # filter cases by substring
//
// A direct case builds the person's map the way /api/tree does (web/apprentice.js over the atlas on disk) and sends
// exactly the body the function sends (web/api/quests.js body). Saved answers: data/experiments/quests/<hash>.json
// (gitignored, a pipeline cache: never swept), keyed by the model, the prompt, the kit, the request and the case; the
// raw answer is saved and validated on every run, so a change to the rules needs no network. Through --url the
// function returns only the kept projects, their dropped rules and the usage; those are saved and counted as such.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { extractText, READABLE } from "./extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const require = createRequire(import.meta.url);
const Q = require(path.join(root, "web/quests.js"));
const API = require(path.join(root, "web/api/quests.js"));
const Apprentice = require(path.join(root, "web/apprentice.js"));
const Matcher = require(path.join(root, "web/match.js"));
const EvidenceText = require(path.join(root, "web/evidence_text.js"));
// the atlas as the deployed /api/open reads it: the tech set on (web/api/tree.js theAtlas)
const atlas = require(path.join(root, "web/atlas.js"))({ load: u => new Promise(r => r(JSON.parse(fs.readFileSync(path.join(root, "web", u), "utf8")))), Matcher, config: () => ({ TECH_ENABLED: true }) });
const KIT = JSON.parse(fs.readFileSync(path.join(root, "web/data/build_kit.json"), "utf8"));
// the published standards index, as the deployed function reads it
const STANDARDS = API.standards();

const args = process.argv.slice(2);
const reuse = args.includes("--reuse"), baseline = args.includes("--baseline");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const url = args.includes("--url") ? args[args.indexOf("--url") + 1] : null;
if (url && !/^https?:\/\/[^/]+\/.*api\/quests\/?$/.test(url)) { console.error(`--url wants the route itself, e.g. https://<deploy>/api/quests (got ${url})`); process.exit(1); }
if (url && !reuse && !process.env.QUESTS_TOKEN) { console.error("--url needs QUESTS_TOKEN, the session access token of a test account"); process.exit(1); }
const CACHE = path.join(root, "data/experiments/quests");
// Claude Opus 5.5, per million tokens (the owner's brief and the claude-api skill, 2026-11-03): input $4, output $20,
// cache reads $0.20, cache writes at 1.25 times input
const RATES = { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 };
const dollars = u => u ? ((u.input_tokens || 0) * RATES.in + (u.output_tokens || 0) * RATES.out + (u.cache_read_input_tokens || 0) * RATES.cacheRead + (u.cache_creation_input_tokens || 0) * RATES.cacheWrite) / 1e6 : 0;

// the fixed set: each sample's roles (the open flow's sets: MBA, product.<id>, tech.<id>) and the answer profiles. The
// tools and places are kit ids; a profile naming an id the kit no longer has loses it in cleanAnswers, as the site would.
const ROLES = {
  course_list: ["business_analytics", "pmm"], experienced_pm: ["pmm", "product.pm"],
  experienced_with_coursework: ["pmm", "bizops"], grad_student_new: ["pmm", "data_analyst", "tech.data_engineer"],
  pivot_phd_hci: ["market_research", "tech.ux_researcher"], senior_pm_pdf_layout: ["general_manager", "strategy_manager"],
  staff_pm_terse: ["general_manager", "tech.software_engineer"], template_placeholder_years: ["marketing_manager", "business_analytics"],
};
const PROFILES = {
  own_tools: { answers: { tech: "no_code", tools: { research: "use" }, own_tools: "PowerPoint, Google Sheets with Gemini, ChatGPT", try_new: false, places: ["linkedin"], own_places: "", portfolio: { host: null, note: "" } } },
  builder: { answers: { tech: "write_code", tools: { coding_agents: "use", app_builders: "use" }, own_tools: "", try_new: true, places: ["linkedin", "github_pages"], own_places: "@me on Bluesky", portfolio: { host: "github_pages", note: "a personal site with three case studies" } } },
  rewrite: { answers: { tech: "ai_tools", tools: {}, own_tools: "", try_new: null, places: ["linkedin", "notion_page"], own_places: "", portfolio: { host: null, note: "" } },
    feedback: "These feel like writing exercises. I want something with numbers that I can show in an interview.", avoid: ["A positioning teardown of three competitors", "A launch plan for a new feature"] },
};

function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const f = path.join(root, ".env"); if (!fs.existsSync(f)) return null;
  const m = fs.readFileSync(f, "utf8").match(/^\s*ANTHROPIC_API_KEY\s*=\s*"?([^"\n]*)"?\s*$/m);
  return m && m[1].trim() ? m[1].trim() : null;
}
const key = reuse || url ? null : apiKey();
if (!reuse && !url && !key) console.error("no ANTHROPIC_API_KEY: only saved answers are read (as --reuse)");
const sha = s => crypto.createHash("sha256").update(s).digest("hex");

async function mapFor(text, role) {
  const g = await Apprentice.ground({ A: atlas, Matcher, EvidenceText }, { profile: text, roles: [role], posting: "", today: "2026-11-11" });
  return Apprentice.selfServeMap(g, { date: "2026-11-11" }).map;
}
async function viaRoute(text, role, { answers, feedback, avoid }) {
  const base = url.replace(/\/api\/quests\/?$/, ""), headers = { "content-type": "application/json", authorization: `Bearer ${process.env.QUESTS_TOKEN}`, ...(process.env.INFER_COOKIE ? { cookie: process.env.INFER_COOKIE } : {}) };
  const t = await fetch(base + "/api/tree", { method: "POST", headers, body: JSON.stringify({ text, roles: [role] }) });
  if (!t.ok) throw Object.assign(new Error(`tree ${t.status}`), { status: t.status });
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ mode: "write", text, extras: "", answers, feedback, avoid }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 422) throw Object.assign(new Error(`quests ${r.status} ${b.error || ""}`), { status: r.status });
  return { model: b.model || null, usage: b.usage || null, projects: b.projects || [], dropped: b.dropped || [] };
}

const lines = [], out = s => { lines.push(s); console.log(s); };
const fails = Object.fromEntries(Q.RULES.map(r => [r, 0]));
let cases = 0, missing = 0, asked = 0, projectsAsked = 0, projectsKept = 0, zero = 0, retried = 0, total$ = 0, shares = 0;
const levels = { beginner: 0, intermediate: 0 };
const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const samples = fs.readdirSync(path.join(here, "resumes")).filter(f => READABLE.test(f)).sort();

out("## The cases");
for (const f of samples) {
  const name = f.replace(READABLE, ""), text = (await extractText(path.join(here, "resumes", f))).trim();
  for (const role of ROLES[name] || ["pmm", "general_manager"]) for (const [pname, prof] of Object.entries(PROFILES)) {
    const answers = prof.answers, ask = Q.cleanAsk(prof);
    const id = `${name} · ${role} · ${pname}`;
    if (only && !id.includes(only)) continue;
    const map = await mapFor(text, role);
    const input = { map, resume: text, extras: "", answers, feedback: ask.feedback, avoid: ask.avoid, kit: KIT, standards: STANDARDS };
    const body = API.body(input);
    const k = sha(JSON.stringify([url ? "route" : "direct", body])).slice(0, 24), file = path.join(CACHE, k + ".json");
    let rec = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
    if (!rec && !reuse && (key || url)) {
      try {
        if (url) { const r = await viaRoute(text, role, { answers, ...ask }); rec = { via: "route", host: new URL(url).host, case: id, at: new Date().toISOString(), ...r }; }
        else {
          const calls = [];
          const call = async (inp, o) => { const r = await API.callModel(inp, o); calls.push({ answer: r.answer, stop: r.stop, usage: r.usage, model: r.model }); return r; };
          await API.write(input, { apiKey: key, call });
          rec = { via: "direct", case: id, at: new Date().toISOString(), calls };   // the answers, never the résumé
        }
        fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(file, JSON.stringify(rec, null, 1)); asked++;
      } catch (e) { out(`- ${id}: failed (${e.status || e.message})`); continue; }
    }
    if (!rec) { missing++; out(`- ${id}: no saved answer`); continue; }
    cases++;
    let kept = 0, line;
    if (rec.via === "direct") {
      // validated again on every run: the first call, and the retry when the first kept nothing
      const ctx = { kit: KIT, answers, map, tree: Q.treeOf(map), resume: text, posting: null, avoid: ask.avoid };
      for (const [i, c] of rec.calls.entries()) {
        const v = Q.validate(c.answer, ctx);
        projectsAsked += v.asked; for (const [r, n] of Object.entries(v.failures)) fails[r] = (fails[r] || 0) + n;
        for (const kk of Object.keys(usage)) usage[kk] += (c.usage || {})[kk] || 0;
        total$ += dollars(c.usage);
        if (i > 0) retried++;
        kept = v.projects.length;
        if (kept) for (const p of v.projects) { levels[p.level] = (levels[p.level] || 0) + 1; if (p.share) shares++; }
        line = `${v.asked} asked, ${kept} kept${v.dropped.length ? `; dropped: ${v.dropped.map(d => d.rules.join("+")).join(", ")}` : ""}; stop ${c.stop}`;
        if (kept) break;
      }
    } else {
      kept = rec.projects.length;
      for (const p of rec.projects) { levels[p.level] = (levels[p.level] || 0) + 1; if (p.share) shares++; }
      projectsAsked += kept + rec.dropped.length;
      for (const rules of rec.dropped) for (const r of rules) fails[r] = (fails[r] || 0) + 1;
      for (const kk of Object.keys(usage)) usage[kk] += (rec.usage || {})[kk] || 0;
      total$ += dollars(rec.usage);
      line = `${kept} kept, ${rec.dropped.length} dropped (through ${rec.host})`;
    }
    projectsKept += kept; if (!kept) zero++;
    out(`- ${id}: ${line}`);
  }
}

const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "–";
out(`\n## Validity per rule (${projectsAsked} projects asked, ${projectsKept} kept)`);
out(`| rule | projects failing | share of projects |`);
out(`|---|---|---|`);
for (const r of Q.RULES) out(`| ${r} | ${fails[r] || 0} | ${pct(fails[r] || 0, projectsAsked)} |`);
out(`\n(level_mix counts answers whose levels were not two beginner and one intermediate; share_dropped and quote_dropped cut a part, never the project.)`);
out(`\n## The kept projects`);
out(`- levels: ${levels.beginner} beginner, ${levels.intermediate} intermediate; with a share: ${shares} of ${projectsKept}`);
out(`\n## Drops and cost`);
out(`- cases read: ${cases} of ${cases + missing}${missing ? ` (${missing} with no saved answer)` : ""}; asked this run: ${asked}`);
out(`- projects dropped: ${projectsAsked - projectsKept} of ${projectsAsked} (${pct(projectsAsked - projectsKept, projectsAsked)}); cases with no project kept after the retry: ${zero}; retries: ${retried}`);
out(`- tokens: ${usage.input_tokens} in, ${usage.output_tokens} out, ${usage.cache_read_input_tokens} cache read, ${usage.cache_creation_input_tokens} cache written`);
out(`- cost at Opus 5.5 ($${RATES.in} / $${RATES.out} per million in / out): $${total$.toFixed(2)} in all, $${cases ? (total$ / cases).toFixed(3) : "–"} per person (one write)`);

if (baseline) {
  if (!cases) { console.error("no case was read: the baseline is not written"); process.exit(1); }
  const head = `# The side-project eval baseline\n\nWritten by \`node evals/quests.mjs --baseline\` on ${new Date().toISOString().slice(0, 10)}: ${cases} of ${cases + missing} cases, model ${Q.MODEL}${url ? `, through ${new URL(url).host}` : ", direct"}. The rules are web/quests.js validate.\n\n`;
  fs.writeFileSync(path.join(here, "quests_baseline.md"), head + lines.join("\n") + "\n");
  console.log("\nwrote evals/quests_baseline.md");
}
