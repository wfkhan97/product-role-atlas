// A reader's judgment of the generated fit-page lines (PLAN.md v16, step 6; the eval evals/README.md listed to build).
// Every sentence a screen shows about a skill is built from the data by web/evidence_text.js: the field entry's line
// (pipeline/fields.json), a template from the evidence entry (pipeline/evidence.json) when no field entry exists, and
// the gap sentence by kind. No reader had judged them. This draws a stratified sample per release, over both role sets
// (kinds and fields balanced), and asks a model reader of a different family from the one that drafted the depth
// (openai/gpt-6.1-sol in pipeline/depth_gen.py) three yes/no questions per sentence:
//   artefact    does it name a concrete artefact (a document, model, plan, system) or a counterpart (a team, client, committee)?
//   number      does it carry a number where its kind asks for one? (an instruction that names the measure to add is "na")
//   field_words is it written in the field's own words, not another field's?
// Answers are cached under data/experiments/lines_judged/ (a rerun sends only what is missing); the report is
// evals/lines_judged.md, failures listed by skill and field so fields.json can be fixed. The gate (decision 10 of the
// pass): this runs before any later PR changes a sentence template or shows a new generated line.
//
//   node evals/lines_judged.mjs --dry-run            # the sample and the cost; nothing is sent, nothing written
//   node evals/lines_judged.mjs                       # judge (OPENROUTER_API_KEY in .env) and write evals/lines_judged.md
//   node evals/lines_judged.mjs --n 50 --seed 7 --model anthropic/claude-haiku-5.5
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { loadGraph } from "./graph_mba.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..");
const require = createRequire(import.meta.url);
const { createMatcher } = require(path.join(root, "web/match.js"));
const EvidenceText = require(path.join(root, "web/evidence_text.js"));
const J = f => JSON.parse(fs.readFileSync(path.join(root, f)));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry-run"), N = Number(arg("--n", 50)), SEED = Number(arg("--seed", 7));
const MODEL = arg("--model", "anthropic/claude-haiku-5.5");   // a different family from the drafter of the depth (openai/gpt-6.1-sol)
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const CACHE_DIR = path.join(root, "data", "experiments", "lines_judged"), CACHE = path.join(CACHE_DIR, "cache.jsonl");
const REPORT = path.join(here, "lines_judged.md");

// ---------- the sentences: every line, template and gap sentence over both role sets, as evals/adaptive.mjs reads them ----------
const MBA = loadGraph(), ROLES = J("web/data/roles_mba.json"), PROD = J("web/data/graph.json");
const groupOf = Object.fromEntries(ROLES.groups.flatMap(g => g.families.map(f => [f, g.id])));
const roleSets = [
  { set: "mba", G: MBA, tax: J("web/data/taxonomy_mba.json"), subs: J("web/data/subskills_mba.json"), roles: ROLES, fams: Object.keys(MBA.families).filter(f => MBA.jobs.some(j => j.family === f)), group: f => groupOf[f], kinds: MBA.meta.kinds, labels: MBA.families },
  { set: "product", G: PROD, tax: J("web/data/taxonomy.json"), subs: J("web/data/subskills.json"), roles: null, fams: Object.keys(PROD.families), group: () => "product", kinds: PROD.meta.kinds, labels: PROD.families },
];
const pool = new Map();   // text -> { text, type, skill, name, kind, field, role, set }
for (const S of roleSets) {
  const M = createMatcher({ taxonomy: S.tax, subskills: S.subs, graph: S.G, roles: S.roles || undefined });
  const T = EvidenceText.create({ kinds: S.kinds }); const byId = Object.fromEntries(S.G.skills.map(s => [s.id, s]));
  const nameOf = id => (byId[id] || {}).name || id;
  for (const fam of S.fams) {
    const jobs = S.G.jobs.filter(j => j.family === fam); if (!jobs.length) continue;
    const keys = [`role:${fam}`, S.group(fam)]; const req = M.requirements({ jobs, label: fam });
    const rows = M.score({}, req, { level: "mid" }).rows.filter(x => !x.slot.startsWith("__"));
    for (const x of rows) {
      const s = byId[x.id]; if (!s) continue;
      const l = T.line(s, keys), g = T.gap(x, s, { shown: new Set(), nameOf });
      const add = (text, type, field) => { if (!pool.has(text)) pool.set(text, { text, type, skill: s.id, name: s.name, kind: s.kind || "method", field, role: fam, set: S.set }); };
      if (l.source === "field") add(l.text, "field line", l.field);
      else if (l.source === "template") add(l.text, "template", S.group(fam));
      add(g, "gap sentence", S.group(fam));
    }
  }
}
// ---------- the sample: N sentences, a third per type, each third spread over kinds then fields (seeded) ----------
function rng(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(SEED);
const shuffle = xs => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function stratified(items, n) {
  // one cell per (kind, field); the cells in a seeded order, one sentence taken from each in turn until n, so neither a
  // kind nor a field fills the sample alone (with 50 sentences and about 60 cells, most cells give one)
  const cells = {}; for (const it of shuffle(items)) (cells[it.kind + "|" + it.field] ||= []).push(it);
  const order = shuffle(Object.keys(cells)); const out = []; const seen = new Set();
  while (out.length < n && order.some(c => cells[c].length)) {
    for (const c of order) {
      if (out.length >= n) break;
      const it = cells[c].shift(); if (!it || seen.has(it.text)) continue; seen.add(it.text); out.push(it);
    }
  }
  return out;
}
const TYPES = ["field line", "template", "gap sentence"];
const per = Math.floor(N / TYPES.length), rem = N - per * TYPES.length;
const sample = TYPES.flatMap((t, i) => stratified([...pool.values()].filter(x => x.type === t), per + (i < rem ? 1 : 0)));
const count = (xs, k) => { const c = {}; for (const x of xs) c[x[k]] = (c[x[k]] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(", "); };
console.log(`lines judged: pool of ${pool.size} distinct sentences over ${roleSets.reduce((a, S) => a + S.fams.length, 0)} roles (${count([...pool.values()], "type")}); sample of ${sample.length} with seed ${SEED}`);
console.log(`  by type: ${count(sample, "type")}\n  by kind: ${count(sample, "kind")}\n  by field: ${count(sample, "field")}`);

// ---------- the reader ----------
const prompt = it => `You are a careful reader of career advice for graduate students. A website that reads job postings shows this sentence about the skill "${it.name}" (a ${it.kind}) to a student heading for ${it.field.startsWith("role:") ? `the role "${it.field.slice(5)}"` : `the field "${it.field}"`}. It is ${it.type === "gap sentence" ? "an instruction on how to show the skill on a resume" : "an example resume line that would show the skill"}.

Sentence: "${it.text}"

Answer three questions with "yes", "no" or "na" and one short reason each, as JSON only: {"artefact": ..., "number": ..., "field_words": ..., "reason": "..."}.
1. artefact: Does the sentence name a concrete artefact (a document, model, plan, system, product) or a concrete counterpart (a team, a client, a committee, a function)?
2. number: Does it carry a number, where a sentence of its kind should? An example resume line should carry one. An instruction that names what to measure instead of a figure is "na". A sentence about a way of working (a behaviour) that points to other work is "na".
3. field_words: Is it written in the words of ${it.field.startsWith("role:") ? "that role" : "that field"}, rather than in another field's words (a finance line that reads like a product line, a banking line that reads like marketing)?`;
function readKey() {
  const env = path.join(root, ".env");
  if (!fs.existsSync(env)) return null;
  for (const line of fs.readFileSync(env, "utf8").split("\n")) if (line.startsWith("OPENROUTER_API_KEY=")) return line.split("=", 2)[1].trim().replace(/^["']|["']$/g, "");
  return null;
}
const cache = {};
if (fs.existsSync(CACHE)) for (const line of fs.readFileSync(CACHE, "utf8").split("\n")) if (line.trim()) { const r = JSON.parse(line); cache[r.key] = r; }
const keyOf = p => crypto.createHash("sha256").update(`${MODEL}\n${p}`).digest("hex");
async function ask(p) {
  const key = keyOf(p); if (cache[key]) return cache[key].answer;
  const apiKey = readKey(); if (!apiKey) throw new Error("OPENROUTER_API_KEY is not in .env; use --dry-run");
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: p }], response_format: { type: "json_object" }, max_tokens: 300 }) });
      const d = await r.json(); const text = d.choices[0].message.content; const m = text.match(/\{[\s\S]*\}/); const answer = JSON.parse(m[0]);
      const rec = { key, model: MODEL, answer, usage: d.usage || null };
      cache[key] = rec; fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.appendFileSync(CACHE, JSON.stringify(rec) + "\n");
      return answer;
    } catch (e) { last = e; await new Promise(res => setTimeout(res, 2000 * (attempt + 1))); }
  }
  return { _error: String(last && last.message || last) };
}
const missing = sample.filter(it => !cache[keyOf(prompt(it))]).length;
if (DRY) {
  const tokens = sample.reduce((a, it) => a + Math.ceil(prompt(it).length / 4) + 80, 0);
  console.log(`dry run: ${missing} of ${sample.length} sentences would be sent to ${MODEL} (${sample.length - missing} cached); about ${tokens.toLocaleString()} tokens, well under a cent at this model's price. Nothing sent, nothing written.`);
  process.exit(0);
}
const answers = [];
for (const it of sample) answers.push({ it, a: await ask(prompt(it)) });
// ---------- the report ----------
const yes = v => String(v || "").toLowerCase() === "yes", na = v => String(v || "").toLowerCase() === "na";
const Q = ["artefact", "number", "field_words"];
const lines = [];
const out = s => lines.push(s);
out(`# Lines judged (${new Date().toISOString().slice(0, 10)})`); out("");
out(`A reader's judgment of ${sample.length} generated fit-page sentences (seed ${SEED}) from \`web/evidence_text.js\` over ${roleSets.reduce((a, S) => a + S.fams.length, 0)} roles of both sets: field lines (\`pipeline/fields.json\`), templates (\`pipeline/evidence.json\`) and gap sentences by kind. Reader: \`${MODEL}\`, a different family from the depth's drafter. Three questions: names an artefact or a counterpart; carries a number where its kind asks for one ("na" when the sentence names the measure or points to other work); in the field's words. Pool: ${pool.size} distinct sentences.`); out("");
out("| type | n | artefact yes | number yes (of those asked) | field words yes | errors |"); out("|---|---|---|---|---|---|");
for (const t of TYPES) {
  const xs = answers.filter(x => x.it.type === t), ok = xs.filter(x => !x.a._error);
  const asked = ok.filter(x => !na(x.a.number));
  out(`| ${t} | ${xs.length} | ${ok.filter(x => yes(x.a.artefact)).length}/${ok.length} | ${asked.filter(x => yes(x.a.number)).length}/${asked.length} | ${ok.filter(x => yes(x.a.field_words)).length}/${ok.length} | ${xs.length - ok.length} |`);
}
out(""); out("## Sentences the reader did not accept"); out("");
out("Listed by skill and field (a `role:` field is a role override), with the question failed and the reader's reason, so `pipeline/fields.json` or `pipeline/evidence.json` can be fixed."); out("");
const failed = answers.filter(x => !x.a._error && Q.some(q => String(x.a[q] || "").toLowerCase() === "no")).sort((a, b) => a.it.skill.localeCompare(b.it.skill) || a.it.field.localeCompare(b.it.field));
if (!failed.length) out("None.");
for (const { it, a } of failed) out(`- **${it.name}** (${it.kind}) · ${it.field} · ${it.type}: failed ${Q.filter(q => String(a[q] || "").toLowerCase() === "no").join(", ")}. “${it.text}” — ${a.reason || ""}`);
out(""); out("## Every sentence judged"); out(""); out("| skill | field | type | artefact | number | field words | sentence |"); out("|---|---|---|---|---|---|---|");
for (const { it, a } of answers) out(`| ${it.name} | ${it.field} | ${it.type} | ${a.artefact || a._error || ""} | ${a.number || ""} | ${a.field_words || ""} | ${it.text.replace(/\|/g, "/")} |`);
out(""); out(`Failures: ${failed.length} of ${answers.filter(x => !x.a._error).length} judged; request errors ${answers.filter(x => x.a._error).length}.`);
fs.writeFileSync(REPORT, lines.join("\n") + "\n");
console.log(lines.slice(0, 10).join("\n")); console.log(`wrote ${REPORT}; failures ${failed.length}`);
process.exit(failed.length ? 1 : 0);
