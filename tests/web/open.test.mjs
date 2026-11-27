// web/api/open.js: the open flow's project writer (2026-11-11; the portfolio flow, 2026-11-27). No session: the caps
// are the gate. Nothing here reaches the network: the storage is a dict and the model a stub. The rules run over an
// inline kit (tests/web/quests.test.mjs holds the real kit's structure).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { web, root, require, realAtlas } from "./_load.mjs";

const API = require(path.join(web, "api", "open.js"));
const Q = require(path.join(web, "quests.js"));
const Tree = require(path.join(web, "api", "tree.js"));
const ex = (name, free = null) => ({ name, url: `https://example.com/${name.toLowerCase()}`, checked: "2026-11-27", free });
const KIT = {
  kinds: [
    { id: "writing", label: "Docs and writing", fields: "all", examples: [ex("WriterOne", "free plan"), ex("WriterTwo")] },
    { id: "decks", label: "Decks", fields: ["marketing"], examples: [ex("DeckOne", "free trial")] },
    { id: "agents", label: "Coding agents", fields: ["software"], code: true, examples: [ex("CodeBot")] },
  ],
  places: [
    { id: "linkedin", label: "LinkedIn", type: "social", fields: "all", default: true, note: "A post.", url: "https://www.linkedin.com", checked: "2026-11-27" },
    { id: "public_page", label: "A public page", type: "page", fields: "all", note: "On the web.", url: "https://example.com/p", checked: "2026-11-27" },
    { id: "portfolio", label: "My own portfolio site", type: "portfolio", fields: "all", note: "On your site.", url: null, checked: "2026-11-27" },
  ],
  portfolio_hosts: [{ id: "other", label: "Somewhere else", url: null, checked: "2026-11-27" }],
};
const RESUME = fs.readFileSync(path.join(root, "pipeline", "apprentice", "examples", "pmm-nyc", "profile.md"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
const cfg = { url: "https://x.supabase.co", key: "pk" };
const A = realAtlas();

// a project that passes web/quests.js validate for a pmm tree and no answers
const good = (over = {}) => ({
  level: "beginner",
  title: "A positioning teardown of three freight apps", ship: "A public page that compares the positioning of three freight apps.",
  atlas_skills: ["positioning_messaging"], steps: ["Pick three apps your old customers used.", "Copy each home page headline and pitch.", "Ask the assistant to compare them in a table.", "Publish the page and share the link."],
  prompt: "Help me write a positioning teardown of three freight software products. Compare their headlines and the proof each offers.",
  build_with: { kind: "writing", examples: ["WriterOne"] }, live_on: { place: "linkedin" },
  share: { place: "linkedin", how: "Post the page with one screenshot.", post: "I compared three freight apps. Here is what I learned." },
  why_role: { text: "Product marketers own positioning." }, why_person: { text: "You sold logistics software.", resume_quote: "" }, ...over,
});
const NO_ANSWERS = Q.cleanAnswers({}, KIT);
function storage() {
  const objects = {}, calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push([init.method || "GET", url]);
    const m = /\/storage\/v1\/object\/maps\/(.+)$/.exec(url);
    if (!m) return { ok: false, status: 500 };
    if (!init.method) return objects[m[1]] ? { ok: true, status: 200, json: async () => objects[m[1]] } : { ok: false, status: 404 };
    objects[m[1]] = JSON.parse(init.body); return { ok: true, status: 200 };
  };
  return { objects, calls, fetchImpl };
}
const res = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } });
const post = (body, headers = {}) => ({ method: "POST", headers: { host: "h", "x-real-ip": "203.0.113.7", ...headers }, body });
const BODY = { email: "Someone@School.edu", text: RESUME, roles: ["pmm"], tech: "no_code" };
function deps(s, extra = {}) {
  const d = { fetchImpl: s.fetchImpl, cfg, key: "svc", apiKey: "ak", enabled: true, kit: KIT, A, standards: null, caps: { email: 4, ip: 8, day: 150 }, asked: [], ...extra };
  d.call = extra.call || (async input => { d.asked.push(input); return { answer: { projects: [good(), good({ title: "A launch brief for a partner program" })] }, model: "claude-opus-5-5", usage: { input_tokens: 9000, output_tokens: 3000 }, stop: "end_turn" }; });
  return d;
}
const run = async (body, d, headers) => { const r = res(); await API.handler(post(body, headers), r, d); return r; };

test("both flags gate it; web/config.js has both on (owner, 2026-11-11)", async () => {
  const s = storage();
  const r = await run(BODY, deps(s, { enabled: false }));
  assert.deepEqual([r.statusCode, r.body.error], [404, "off"]);
  assert.equal(s.calls.length, 0, "off: nothing is read, counted or asked");
  assert.equal(API.enabled(), true, "OPEN_TREE_ENABLED and OPEN_QUESTS_ENABLED are on in web/config.js");
  const tmp = path.join(fs.mkdtempSync(path.join(require("os").tmpdir(), "open-")), "config.js");
  for (const [text, want] of [["OPEN_TREE_ENABLED: true,\nOPEN_QUESTS_ENABLED: true,", true], ["OPEN_TREE_ENABLED: false,\nOPEN_QUESTS_ENABLED: true,", false], ["OPEN_TREE_ENABLED: true,\nOPEN_QUESTS_ENABLED: false,", false]]) { fs.writeFileSync(tmp, text); assert.equal(API.enabled(tmp), want, text); }
});

test("no keys 503; another site's page 403; no email, a short résumé, an unknown role 400, and none of them counts or asks", async () => {
  const s = storage(), d = deps(s);
  assert.equal((await run(BODY, deps(s, { apiKey: "" }))).statusCode, 503);
  assert.equal((await run(BODY, deps(s, { key: "" }))).statusCode, 503);
  assert.deepEqual([(await run(BODY, d, { origin: "https://evil.example" })).statusCode], [403]);
  for (const [body, error] of [[{ ...BODY, email: "nope" }, "email_required"], [{ ...BODY, email: undefined }, "email_required"], [{ ...BODY, text: "short" }, "text_too_short"], [{ ...BODY, roles: [] }, "roles_required"], [{ ...BODY, roles: ["not_a_role"] }, "unknown_role"]]) {
    const r = await run(body, d); assert.deepEqual([r.statusCode, r.body.error], [400, error]);
  }
  assert.equal(d.asked.length, 0); assert.deepEqual(s.objects, {});
});

test("a write: the map is built here, the model is asked with the generator's input, the valid projects come back, and only the counts are stored", async () => {
  const s = storage(), d = deps(s);
  const r = await run({ ...BODY, posting: "We need positioning and launches." }, d);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.projects.map(p => p.id), ["p1", "p2"]);
  assert.equal(r.body.model, "claude-opus-5-5");
  assert.equal(d.asked.length, 1);
  const input = d.asked[0];
  assert.equal(input.map.role.id, "pmm"); assert.equal(input.map.student.self_serve, true);
  assert.equal(input.resume, RESUME.trim()); assert.equal(input.extras, ""); assert.deepEqual(input.answers, { ...NO_ANSWERS, tech: "no_code" }, "a bare tech, as an older page sends it");
  assert.deepEqual([input.feedback, input.avoid], ["", []]);
  // the counts: the email lowercased and hashed, the address hashed, the day; nothing else
  const day = new Date().toISOString().slice(0, 10);
  assert.deepEqual(Object.keys(s.objects).sort(), [`open/day.json`, `open/email/${API.hash("someone@school.edu")}.json`, `open/ip/${API.hash("203.0.113.7")}.json`].sort());
  for (const o of Object.values(s.objects)) assert.deepEqual(o, { date: day, n: 1 });
  const stored = JSON.stringify(s.objects);
  assert.ok(!stored.includes("someone@school.edu") && !stored.includes("203.0.113.7") && !stored.includes("freight"), "no email, no address, no project is stored");
  assert.ok(s.calls.every(([, url]) => /\/storage\/v1\/object\/maps\/open\//.test(url)), "the service role touches open/ only: no person's folder, no map written");
});

test("the answers (2026-11-27): cleaned as /api/quests cleans them, a bare tech is still taken, and the field is the map's, never the request's", async () => {
  const answers = { tech: "write_code", tools: { writing: "use", sora: "use", decks: "maybe" }, own_tools: "Excel\u0000, Gemini", try_new: false, places: ["public_page", "linkedin", "myspace"], own_places: "Bluesky", portfolio: { host: "other", note: "my site" }, field: "legal" };
  const clean = { tech: "write_code", tools: { writing: "use" }, own_tools: "Excel , Gemini", try_new: false, places: ["public_page", "linkedin"], own_places: "Bluesky", portfolio: { host: "other", note: "my site" } };
  assert.deepEqual(API.answersOf({ answers }, KIT), clean, "anything outside the kit's lists is dropped, a field in the answers too");
  assert.deepEqual(API.answersOf({ answers }, KIT), Q.cleanAnswers(answers, KIT), "the same cleaning as /api/quests");
  assert.deepEqual(API.answersOf({ tech: "no_code" }, KIT), { ...NO_ANSWERS, tech: "no_code" }, "an older page: tech alone");
  assert.equal(API.answersOf({ tech: "no_code", answers: { tech: "read_code" } }, KIT).tech, "read_code", "the answers' own tech wins");
  for (const b of [{}, { tech: "hacker" }, { answers: "x" }, { answers: [1] }, { answers: null }]) assert.deepEqual(API.answersOf(b, KIT), NO_ANSWERS, JSON.stringify(b));
  const s = storage(), d = deps(s);
  const r = await run({ email: BODY.email, text: RESUME, roles: ["pmm"], answers, field: "legal" }, d);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(d.asked[0].answers, clean, "the generator gets the cleaned answers");
  assert.equal(Q.treeOf(d.asked[0].map).field, "marketing", "the field comes from the built map");
  assert.ok(Q.request(d.asked[0]).messages[0].content.includes("field: marketing"));
});

test("a rewrite (\"none of these\"): feedback and avoid are cleaned, reach the writer, and an avoided title is dropped", async () => {
  const s = storage(), d = deps(s);
  const r = await run({ ...BODY, feedback: "More numbers, \u0007less writing. " + "z".repeat(700), avoid: [good().title, "", "Another", "Another"] }, d);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(d.asked[0].feedback.length, 600);
  assert.ok(!d.asked[0].feedback.includes("\u0007"));
  assert.deepEqual(d.asked[0].avoid, [good().title, "Another"]);
  assert.deepEqual(r.body.projects.map(p => p.title), ["A launch brief for a partner program"], "the avoided title is dropped, the other kept");
  assert.ok(r.body.dropped.some(rules => rules.includes("avoided")));
  const logs = []; const log = console.log; console.log = (...a) => logs.push(a.join(" "));
  try { await run({ ...BODY, feedback: "SECRET-FEEDBACK-WORDS" }, deps(storage())); } finally { console.log = log; }
  assert.ok(logs.length === 1 && !logs[0].includes("SECRET-FEEDBACK") && !logs[0].includes("school.edu"), "the log line holds no feedback and no email");
});

const MAP_PROJECT = (field, skill) => good({ atlas_skills: [skill], build_with: { kind: "writing", examples: ["WriterOne"] } });
test("the tech and MBA sets each build a map through the handler (the server's own atlas), and the field picks the kit's kinds", async () => {
  assert.ok(Tree.ROLE_RE.test("tech.software_engineer") && Tree.ROLE_RE.test("product.pm") && Tree.ROLE_RE.test("pmm") && !Tree.ROLE_RE.test("tech.") && !Tree.ROLE_RE.test("evil.pm"));
  for (const [roles, field] of [[["tech.software_engineer"], "software"], [["tech.product_designer", "tech.ux_researcher"], "design"], [["pmm"], "marketing"]]) {
    const s = storage(), seen = [];
    const d = deps(s, { A: undefined, call: async input => { seen.push(input); const skill = Q.treeOf(input.map).skills[0].id; return { answer: { projects: [MAP_PROJECT(field, skill)] }, model: "m", usage: {}, stop: "end_turn" }; } });
    const log = console.log; console.log = () => { };
    let r; try { r = await run({ ...BODY, roles, answers: { tech: "write_code" } }, d); } finally { console.log = log; }
    assert.equal(r.statusCode, 200, `${roles}: ${JSON.stringify(r.body)}`);
    const T = Q.treeOf(seen[0].map);
    assert.deepEqual([seen[0].map.role.id, T.field], [roles[0], field], roles.join());
    assert.ok(T.skills.length > 0, `${roles}: a tree with skills`);
    const allowed = Q.allowedKinds(seen[0].answers, KIT, T.field);
    assert.deepEqual(allowed, Q.fieldKinds(KIT, field, "write_code"), `${roles}: the field's kinds`);
    if (field === "software") assert.ok(allowed.includes("agents"), "a code kind for a software person who writes code");
  }
  const r = await run({ ...BODY, roles: ["tech.software_engineer", "pmm"] }, deps(storage(), { A: undefined }));
  assert.deepEqual([r.statusCode, r.body.error], [400, "mixed_fields"], "one field per request, across sets too");
});

test("the caps: the fifth write of one email in a day (a first write and three rewrites), the ninth from one address and the day's cap all answer 429 without asking the model", async () => {
  let s = storage(), d = deps(s);
  for (let i = 0; i < 4; i++) assert.equal((await run(BODY, d)).statusCode, 200);
  let r = await run(BODY, d); assert.deepEqual([r.statusCode, r.body.error, r.body.scope], [429, "rate_limited", "email"]);
  assert.equal(d.asked.length, 4);
  assert.equal((await run({ ...BODY, email: "other@school.edu" }, d)).statusCode, 200, "another address still writes");

  s = storage(); d = deps(s, { caps: { email: 4, ip: 3, day: 150 } });
  for (let i = 0; i < 3; i++) assert.equal((await run({ ...BODY, email: `p${i}@school.edu` }, d)).statusCode, 200);
  r = await run({ ...BODY, email: "p9@school.edu" }, d); assert.deepEqual([r.statusCode, r.body.scope], [429, "ip"]);
  assert.equal((await run({ ...BODY, email: "p9@school.edu" }, d, { "x-real-ip": "198.51.100.2" })).statusCode, 200, "another network address still writes");

  s = storage(); d = deps(s, { caps: { email: 4, ip: 8, day: 2 } });
  for (let i = 0; i < 2; i++) assert.equal((await run({ ...BODY, email: `q${i}@school.edu` }, d, { "x-real-ip": `198.51.100.${i}` })).statusCode, 200);
  r = await run({ ...BODY, email: "q9@school.edu" }, d, { "x-real-ip": "198.51.100.9" }); assert.deepEqual([r.statusCode, r.body.scope], [429, "day"]);
  assert.equal(d.asked.length, 2);
  // yesterday's counts are no count
  for (const k of Object.keys(s.objects)) s.objects[k] = { date: "2020-01-01", n: 99 };
  assert.equal((await run({ ...BODY, email: "q9@school.edu" }, d, { "x-real-ip": "198.51.100.9" })).statusCode, 200);
});

test("the caps come from the environment, with the defaults 4, 8 and 150", () => {
  assert.deepEqual(API.caps({}), { email: 4, ip: 8, day: 150 });
  assert.deepEqual(API.caps({ OPEN_QUESTS_EMAIL_CAP: "1", OPEN_QUESTS_IP_CAP: "0", OPEN_QUESTS_DAILY_CAP: "40" }), { email: 1, ip: 0, day: 40 });
  assert.deepEqual(API.caps({ OPEN_QUESTS_DAILY_CAP: "lots" }), { email: 4, ip: 8, day: 150 });
});

test("nothing valid after the retry is 422; a failed model is 502; both were counted, since the call is the cost", async () => {
  let s = storage(), d = deps(s, { call: async () => ({ answer: { projects: [good({ title: "Ship it in two weeks" })] }, model: "m", usage: {}, stop: "end_turn" }) });
  let r = await run(BODY, d); assert.deepEqual([r.statusCode, r.body.error], [422, "no_valid"]);
  assert.equal(s.objects["open/day.json"].n, 1);
  s = storage(); d = deps(s, { call: async () => { throw Object.assign(new Error("anthropic 529"), { status: 529 }); } });
  r = await run(BODY, d); assert.deepEqual([r.statusCode, r.body.error], [502, "upstream"]);
});

test("the address is the platform's header, the first of a forwarded list, else one shared count", () => {
  assert.equal(API.ipOf({ headers: { "x-real-ip": "203.0.113.7", "x-forwarded-for": "10.0.0.1" } }), "203.0.113.7");
  assert.equal(API.ipOf({ headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.1" } }), "198.51.100.4");
  assert.equal(API.ipOf({ headers: {} }), "unknown");
});

// a Vercel includeFiles pattern as the paths under web/ it takes: braces expanded, * within one folder
function expand(p) {
  const m = /\{([^{}]*)\}/.exec(p);
  return m ? m[1].split(",").flatMap(x => expand(p.slice(0, m.index) + x + p.slice(m.index + m[0].length))) : [p];
}
function bundled(pattern) {
  const out = new Set();
  for (const p of expand(pattern)) {
    const dir = path.dirname(p), re = new RegExp("^" + path.basename(p).replace(/[.+?^$()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
    let names = []; try { names = fs.readdirSync(path.join(web, dir), { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name); } catch { }
    for (const n of names) if (re.test(n)) out.add(path.posix.join(dir, n).replace(/^\.\//, ""));
  }
  return out;
}
test("the hosting file bundles what the function reads, and the local server serves it", () => {
  const v = JSON.parse(fs.readFileSync(path.join(web, "vercel.json"), "utf8")).functions;
  // Vercel refuses a pattern over 256 characters, and the deploy fails (2026-11-27: the tech set's files made it 347)
  for (const [fn, f] of Object.entries(v)) assert.ok(f.includeFiles.length <= 256, `${fn}: includeFiles is ${f.includeFiles.length} characters`);
  const inc = bundled(v["api/open.js"].includeFiles);
  for (const f of ["config.js", "data/build_kit.json", "data/standards.json"]) assert.ok(inc.has(f), f);
  for (const f of bundled(v["api/tree.js"].includeFiles)) assert.ok(inc.has(f), `the tree's ${f}`);
  // the product set (2026-11-12) and the tech set (2026-11-27): what web/atlas.js reads for a role of either
  for (const f of ["taxonomy.json", "graph.json", "subskills.json", "bands.json", "taxonomy_tech.json", "roles_tech.json", "bands_tech.json", "graph_tech.json", "subskills_tech.json"]) assert.ok(inc.has("data/" + f), f);
  for (const d of ["graph_mba", "graph_tech"]) for (const n of fs.readdirSync(path.join(web, "data", d)).filter(n => n.endsWith(".json"))) assert.ok(inc.has(`data/${d}/${n}`), `${d}/${n}`);
  assert.ok(v["api/open.js"].maxDuration * 1000 > API.LIMITS.timeoutMs);
  assert.match(fs.readFileSync(path.join(root, "tests", "ui", "serve.mjs"), "utf8"), /"\/api\/open"/);
});
