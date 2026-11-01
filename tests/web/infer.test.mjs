// The model read of a resume (2026-11-01): web/infer.js (the browser's call and its cache), web/api/infer.js (the
// route: the request it checks, the request it sends, the answer it keeps) and the merge into the matcher's evidence
// (web/match.js, opts.inferred; web/atlas.js, useInferred). No network: every fetch here is a stand-in.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web, root, Matcher, readJson, realAtlas } from "./_load.mjs";

const clientFactory = require(path.join(web, "infer.js"));
const API = require(path.join(web, "api", "infer.js"));
const TEXT = fs.readFileSync(path.join(root, "evals/resumes/staff_pm_terse.txt"), "utf8");
const memStorage = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
const ITEM = { id: "prd", line: "Lead product for the carrier platform across 3 squads.", why: "Leading product for squads means writing their requirements." };
function client(opts = {}) {
  const calls = [];
  const fetch = opts.fetch || (async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({ inferred: [ITEM], model: "m", ms: 1 }) }; });
  const storage = opts.storage || memStorage();
  return { I: clientFactory({ fetch, config: () => ({ INFER_ENABLED: true, ...(opts.config || {}) }), storage: () => storage }), calls, storage };
}

// ---------- web/infer.js ----------
test("request: the text as given, the found ids once each and sorted, a known set (else both)", () => {
  const { I } = client();
  assert.deepEqual(I.request("cv", new Set(["sql", "prd", "sql"]), "mba"), { text: "cv", found: ["prd", "sql"], set: "mba" });
  assert.deepEqual(I.request("cv", ["a", 3, null], "nope"), { text: "cv", found: ["a"], set: "both" });
});
test("keyOf: one key per text and set, stable, blind to outer whitespace; the hash is not the text", () => {
  const { I } = client();
  assert.equal(I.keyOf(TEXT, "both"), I.keyOf("\n" + TEXT + "  ", "both"));
  assert.notEqual(I.keyOf(TEXT, "both"), I.keyOf(TEXT + "x", "both"));
  assert.notEqual(I.keyOf(TEXT, "both"), I.keyOf(TEXT, "mba"));
  assert.match(I.keyOf(TEXT), /^v\d+\.both\.[0-9a-f]+$/);
  assert.ok(!I.keyOf(TEXT).includes("Northwind"));
});
test("clean: well-formed items only, ids once each, at most 12, strings trimmed", () => {
  const { I } = client();
  const many = Array.from({ length: 20 }, (_, i) => ({ id: "s" + i, line: "line " + i, why: "w" }));
  assert.equal(I.clean({ inferred: many }).length, 12);
  assert.deepEqual(I.clean({ inferred: [{ id: "Bad Id", line: "x" }, { id: "ok", line: "  " }, { id: "ok", line: " a ", why: 3 }, { id: "ok", line: "b", why: "c" }, null] }), [{ id: "ok", line: "a", why: "" }]);
  assert.deepEqual(I.clean("nonsense"), []);
});
test("read: off, nothing is fetched and the answer is []", async () => {
  const { I, calls } = client({ config: { INFER_ENABLED: false } });
  assert.deepEqual(await I.read(TEXT, ["sql"], "both"), []);
  assert.equal(calls.length, 0);
});
test("read: one POST to the relative route with the request body; the answer is saved, so the same resume is one call", async () => {
  const { I, calls, storage } = client();
  assert.deepEqual(await I.read(TEXT, ["sql", "launch"], "both"), [ITEM]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "api/infer"); assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(calls[0].body, { text: TEXT, found: ["launch", "sql"], set: "both" });
  assert.deepEqual(await I.read(TEXT, ["sql", "launch"], "both"), [ITEM]);
  assert.equal(calls.length, 1, "a saved answer is not asked again");
  assert.ok(!storage.getItem(I.CACHE_KEY).includes("Jordan"), "the saved answer holds the lines it quotes, never the whole text");
  I.forget(); assert.equal(storage.getItem(I.CACHE_KEY), null);
});
test("read: no route (404), a 503 without a key, a 500 or a throw are [] and quiet; no route is not asked again", async () => {
  let n = 0;
  const gone = client({ fetch: async () => { n++; return { ok: false, status: 404 }; } });
  assert.deepEqual(await gone.I.read(TEXT, [], "both"), []); assert.deepEqual(await gone.I.read(TEXT + "2", [], "both"), []);
  assert.equal(n, 1, "after a 404 the page stops asking");
  const err = client({ fetch: async () => ({ ok: false, status: 500 }) });
  assert.deepEqual(await err.I.read(TEXT, [], "both"), []); assert.equal(err.storage.getItem(err.I.CACHE_KEY), null, "a failure is not saved");
  const thrown = client({ fetch: async () => { throw new Error("offline"); } });
  assert.deepEqual(await thrown.I.read(TEXT, [], "both"), []);
});

// ---------- web/api/infer.js ----------
test("the skill list offers neither credentials nor behaviours; product is a subset of both", () => {
  const all = API.skillsFor("both"), tax = readJson("taxonomy_mba.json").skills, by = Object.fromEntries(tax.map(s => [s.id, s]));
  assert.ok(all.length > 200);
  assert.ok(all.every(s => by[s.id].cluster !== "credentials" && by[s.id].kind !== "behaviour"));
  const product = new Set(readJson("taxonomy.json").skills.map(s => s.id));
  assert.ok(API.skillsFor("product").every(s => product.has(s.id)));
  const block = API.taxonomyBlock("both");
  assert.match(block, /^<skills>\n/); assert.ok(block.includes("prd | PRDs & requirements writing | "), "a definition rides with each skill");
  assert.equal(block, API.taxonomyBlock("both"), "stable, so the prompt cache holds it");
});
test("validate: a known id of the set, not found already, once, with a line the resume holds and a reason; at most 12", () => {
  const ok = API.validate({ inferred: [
    ITEM, { ...ITEM }, { id: "made_up", line: ITEM.line, why: "x" }, { id: "sql", line: ITEM.line, why: "x" },
    { id: "fintech", line: "Northwind processed all the payments", why: "not in the resume" },
    { id: "bachelors", line: "BS Computer Science, State University (2012)", why: "a credential" },
    { id: "communication", line: "Set the annual plan with the VP of Engineering and the VP of Sales.", why: "a behaviour" },
    { id: "pricing_packaging", line: "launched   dynamic pricing — margin up 6 points", why: "" },
    { id: "people_management", line: "hired and mentored 2 PMs", why: "  Hiring PMs.  " },
    { id: "okrs", line: "hired and mentored 2 PMs", why: "Mentoring hints at goal setting, though weakly shown, so skip." },   // a hedged reason: out
    { id: "ai_tools", line: "Salesforce", why: "placeholder" },   // one word is not a line: out
  ] }, { text: TEXT, found: ["sql"] });
  assert.deepEqual(ok, [ITEM, { id: "people_management", line: "hired and mentored 2 PMs", why: "Hiring PMs." }]);
  const many = API.skillsFor("both").slice(0, 30).map(s => ({ id: s.id, line: ITEM.line, why: "w" }));
  assert.equal(API.validate({ inferred: many }, { text: TEXT }).length, API.LIMITS.out);
  assert.deepEqual(API.validate(null, { text: TEXT }), []);
});
test("checkInput: text required and sized, found ids filtered, the set defaults to both", () => {
  assert.equal(API.checkInput(null).status, 400);
  assert.equal(API.checkInput({ text: "short" }).error, "text_too_short");
  assert.equal(API.checkInput({ text: "x".repeat(API.LIMITS.text + 1) }).status, 413);
  assert.deepEqual(API.checkInput({ text: TEXT, found: ["sql", "DROP TABLE", 4], set: "?" }), { text: TEXT.trim(), found: ["sql"], set: "both" });
});
test("the Anthropic request: Haiku 5.5, the prompt then the cached skill list, the resume as the user turn, JSON by schema, no sampling parameters", () => {
  const body = API.anthropicBody(API.partsFor({ text: TEXT, found: ["sql"], set: "both" }));
  assert.equal(body.model, "claude-haiku-5-5");
  assert.equal(body.system[0].text, API.PROMPT);
  assert.deepEqual(body.system[1].cache_control, { type: "ephemeral" });
  assert.match(body.messages[0].content, /<already_found>sql<\/already_found>/);
  assert.ok(body.messages[0].content.includes("Northwind Logistics"));
  assert.equal(body.output_config.format.type, "json_schema");
  for (const k of ["temperature", "top_p", "top_k", "thinking"]) assert.ok(!(k in body), `${k} is not sent`);
});
test("infer: the provider's answer validated; a refusal is no answer; the API key goes in the header only", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify({ inferred: [ITEM, { id: "nope", line: "x", why: "y" }] }) }], usage: { input_tokens: 10, output_tokens: 5 } }) }; };
  const out = await API.infer({ text: TEXT, found: [], set: "both" }, { apiKey: "test-key", fetchImpl });
  assert.deepEqual(out.inferred, [ITEM]); assert.equal(out.model, "claude-haiku-5-5"); assert.ok(out.ms >= 0);
  assert.equal(seen.url, "https://api.anthropic.com/v1/messages");
  assert.equal(seen.init.headers["x-api-key"], "test-key"); assert.ok(!seen.init.body.includes("test-key"));
  const refused = await API.infer({ text: TEXT }, { apiKey: "k", fetchImpl: async () => ({ ok: true, json: async () => ({ stop_reason: "refusal", content: [] }) }) });
  assert.deepEqual(refused.inferred, []);
  await assert.rejects(API.infer({ text: TEXT }, { apiKey: "k", fetchImpl: async () => ({ ok: false, status: 529 }) }), /529/);
});
test("the handler: POST only, same origin only, a clean 503 without a key, bad input refused before any call", async () => {
  const run = async (req) => { const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } }; await API.handler({ headers: {}, ...req }, res); return res; };
  const saved = process.env.ANTHROPIC_API_KEY;
  try {
    delete process.env.ANTHROPIC_API_KEY;
    const health = await run({ method: "GET" });
    assert.equal(health.statusCode, 200); assert.deepEqual(health.body, { ok: true, key: false });
    assert.equal((await run({ method: "PUT" })).statusCode, 405);
    assert.equal((await run({ method: "POST", headers: { origin: "https://evil.example", host: "gradbuddy-atlas.vercel.app" }, body: { text: TEXT } })).statusCode, 403);
    assert.equal((await run({ method: "POST", headers: { "sec-fetch-site": "cross-site" }, body: { text: TEXT } })).statusCode, 403);
    const r503 = await run({ method: "POST", headers: { origin: "https://gradbuddy-atlas.vercel.app", host: "gradbuddy-atlas.vercel.app" }, body: { text: TEXT } });
    assert.equal(r503.statusCode, 503); assert.deepEqual(r503.body, { error: "not_configured" }); assert.equal(r503.headers["cache-control"], "no-store");
    process.env.ANTHROPIC_API_KEY = "test-key";
    const healthy = await run({ method: "GET" });
    assert.deepEqual(healthy.body, { ok: true, key: true }); assert.ok(!JSON.stringify(healthy.body).includes("test-key"), "the health line never holds the key");
    assert.equal((await run({ method: "POST", body: { text: "hi" } })).statusCode, 400);
    assert.equal((await run({ method: "POST", headers: { "content-length": String(API.LIMITS.body + 1) }, body: { text: TEXT } })).statusCode, 413);
  } finally { if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved; }
});

// ---------- the merge into the matcher ----------
const G = readJson("graph.json"), BANDS = readJson("bands.json");
const M = Matcher.createMatcher({ taxonomy: readJson("taxonomy.json"), subskills: readJson("subskills.json"), graph: G, distinct: BANDS.scoring.distinct || undefined });
const PM = { jobs: G.jobs.filter(j => j.family === "pm"), label: "pm" };
test("an inferred skill is a row `inferred` with credit 0.75 and its line first; the score rises; no list, no change", () => {
  const a = M.match(TEXT, PM), b = M.match(TEXT, PM, { inferred: [ITEM] }), c = M.match(TEXT, PM, { inferred: [] });
  const ra = a.rows.find(r => r.id === "prd"), rb = b.rows.find(r => r.id === "prd");
  assert.ok(ra && ra.status !== "evidenced", "the patterns do not credit PRDs on this resume");
  assert.equal(rb.status, "inferred"); assert.equal(rb.credit, Matcher.INFERRED); assert.equal(Matcher.INFERRED, 0.75);
  assert.deepEqual(rb.inferred, { line: ITEM.line, why: ITEM.why }); assert.equal(rb.lines[0].text, ITEM.line); assert.equal(rb.lines[0].kind, "inferred");
  assert.ok(b.overall > a.overall); assert.ok(b.covered.has("prd") && !a.covered.has("prd"));
  assert.equal(c.overall, a.overall); assert.deepEqual([...c.covered].sort(), [...a.covered].sort());
  assert.deepEqual(a.rows.map(r => r.status), c.rows.map(r => r.status));
});
test("the merge keeps a line of work, skips credentials, behaviours and unknown ids", () => {
  const base = M.match(TEXT, PM);
  const shown = base.rows.find(r => r.status === "evidenced");
  const b = M.match(TEXT, PM, { inferred: [{ id: shown.id, line: ITEM.line, why: "w" }, { id: "masters_mba", line: ITEM.line, why: "w" }, { id: "communication", line: ITEM.line, why: "w" }, { id: "made_up", line: ITEM.line, why: "w" }] });
  assert.equal(b.rows.find(r => r.id === shown.id).status, "evidenced");
  assert.ok(!b.covered.has("masters_mba")); assert.ok(!b.evidence.communication || !b.evidence.communication.inferred); assert.ok(!b.evidence.made_up);
  assert.equal(b.overall, base.overall);
});
test("creditOf: a mention 0.5, an inferred skill 0.75, a line of work 1", () => {
  assert.equal(Matcher.creditOf(null), 0); assert.equal(Matcher.creditOf({ strength: 1 }), 0.5);
  assert.equal(Matcher.creditOf({ strength: 1, inferred: {} }), 0.75); assert.equal(Matcher.creditOf({ strength: 0, inferred: {} }), 0.75);
  assert.equal(Matcher.creditOf({ strength: 2, inferred: {} }), 1);
});
test("Atlas.useInferred binds a list to one text: the rough read and every matcher pass it for that text only", async () => {
  const A = realAtlas();
  const before = await A.roughFit(TEXT);
  A.useInferred(TEXT, [ITEM]);
  const after = await A.roughFit(TEXT), other = await A.roughFit(TEXT + "\nInterests: chess");
  assert.ok(after.shown.has("prd") && !before.shown.has("prd")); assert.ok(!other.shown.has("prd"));
  assert.ok(Object.values(after.scores).some((s, i) => s > Object.values(before.scores)[i]), "a role that asks for PRDs reads closer");
  assert.deepEqual((await A.roughFit(TEXT, { inferred: [] })).shown, before.shown, "an explicit list wins");
  A.useInferred(null, []); assert.deepEqual((await A.roughFit(TEXT)).shown, before.shown);
});

// ---------- evals/infer_lib.mjs: the full-set eval's pure parts ----------
const L = await import(path.join(root, "evals", "infer_lib.mjs"));
test("bandMove: up, down, or null when it holds; no band sits below every band", () => {
  assert.equal(L.bandMove("related", "in_range"), "up"); assert.equal(L.bandMove("strong", "related"), "down");
  assert.equal(L.bandMove("related", "related"), null); assert.equal(L.bandMove(null, "different"), "up"); assert.equal(L.bandMove(null, null), null);
});
test("audit: credentials, behaviours, unknown ids and lines the text does not hold are caught on the kept items", () => {
  const skills = { prd: { cluster: "craft", kind: "method" }, bachelors: { cluster: "credentials", kind: "credential" }, communication: { cluster: "leadership", kind: "behaviour" } };
  const a = L.audit([ITEM, { id: "bachelors", line: ITEM.line }, { id: "communication", line: ITEM.line }, { id: "ghost", line: ITEM.line }, { id: "prd", line: "not in it at all" }], TEXT, skills, API.norm);
  assert.deepEqual(a, { credentials: ["bachelors"], behaviours: ["communication"], ungrounded: ["prd"], unknown: ["ghost"] });
  assert.deepEqual(L.audit([ITEM], TEXT, skills, API.norm), { credentials: [], behaviours: [], ungrounded: [], unknown: [] });
});
test("summarize: resumes read, mean and max per resume, the most inferred, band moves, the must-be-zero counts, time and cost", () => {
  const clean = { credentials: [], behaviours: [], ungrounded: [], unknown: [] };
  const S = L.summarize([
    { inferred: [{ id: "fintech" }, { id: "prd" }], move: "up", audit: clean, ms: 1000, cost: 0.002 },
    { inferred: [{ id: "fintech" }], move: "down", audit: { ...clean, ungrounded: ["x"] }, ms: 500, cost: 0.001 },
    { inferred: [], move: null, audit: clean, ms: 0, cost: 0 },
  ], 1);
  assert.equal(S.read, 3); assert.equal(S.mean, 1); assert.equal(S.max, 2);
  assert.deepEqual(S.top, [["fintech", 2]]); assert.equal(S.up, 1); assert.equal(S.down, 1);
  assert.equal(S.ungrounded, 1); assert.equal(S.credentials, 0); assert.equal(S.ms, 1500); assert.ok(Math.abs(S.cost - 0.003) < 1e-12);
  assert.deepEqual(L.summarize([]), { read: 0, mean: 0, max: 0, top: [], up: 0, down: 0, credentials: 0, behaviours: 0, ungrounded: 0, unknown: 0, ms: 0, cost: 0 });
});
test("costOf: a usage record at Haiku 5.5 rates, else an estimate from characters", () => {
  assert.ok(Math.abs(L.costOf({ input_tokens: 1e6, output_tokens: 1e6 }) - 0.6) < 1e-9);
  assert.ok(Math.abs(L.costOf({ cache_read_input_tokens: 1e6 }) - 0.01) < 1e-9);
  assert.ok(Math.abs(L.costOf(null, { inChars: 4e6, outChars: 4e6 }) - 0.6) < 1e-9);
  assert.equal(L.costOf(null, null), 0);
});
