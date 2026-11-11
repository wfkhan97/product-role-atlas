// web/api/open.js: the open tree's build quests (2026-11-11). No session: the caps are the gate. Nothing here reaches
// the network: the storage is a dict and the model a stub.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { web, root, require, realAtlas } from "./_load.mjs";

const API = require(path.join(web, "api", "open.js"));
const KIT = JSON.parse(fs.readFileSync(path.join(web, "data", "build_kit.json"), "utf8"));
const RESUME = fs.readFileSync(path.join(root, "pipeline", "apprentice", "examples", "pmm-nyc", "profile.md"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
const cfg = { url: "https://x.supabase.co", key: "pk" };
const A = realAtlas();

// a project that passes web/quests.js validate for a pmm tree and no answers
const good = (over = {}) => ({
  title: "A positioning teardown of three freight apps", ship: "A public page that compares the positioning of three freight apps.",
  atlas_skills: ["positioning_messaging"], steps: ["Pick three apps your old customers used.", "Copy each home page headline and pitch.", "Ask the assistant to compare them in a table.", "Publish the page and share the link."],
  prompt: "Help me write a positioning teardown of three freight software products. Compare their headlines and the proof each offers.",
  build_with: { kind: "chat_pages", examples: [KIT.kinds.find(k => k.id === "chat_pages").examples[0].name] }, live_on: { host: KIT.hosts.find(h => !h.needs).id }, needs_database: false,
  why_role: { text: "Product marketers own positioning." }, why_person: { text: "You sold logistics software.", resume_quote: "" }, ...over,
});
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
  const d = { fetchImpl: s.fetchImpl, cfg, key: "svc", apiKey: "ak", enabled: true, kit: KIT, A, standards: null, caps: { email: 2, ip: 8, day: 150 }, asked: [], ...extra };
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
  assert.equal(input.resume, RESUME.trim()); assert.equal(input.extras, ""); assert.deepEqual(input.answers, { tech: "no_code" });
  // the counts: the email lowercased and hashed, the address hashed, the day; nothing else
  const day = new Date().toISOString().slice(0, 10);
  assert.deepEqual(Object.keys(s.objects).sort(), [`open/day.json`, `open/email/${API.hash("someone@school.edu")}.json`, `open/ip/${API.hash("203.0.113.7")}.json`].sort());
  for (const o of Object.values(s.objects)) assert.deepEqual(o, { date: day, n: 1 });
  const stored = JSON.stringify(s.objects);
  assert.ok(!stored.includes("someone@school.edu") && !stored.includes("203.0.113.7") && !stored.includes("freight"), "no email, no address, no project is stored");
  assert.ok(s.calls.every(([, url]) => /\/storage\/v1\/object\/maps\/open\//.test(url)), "the service role touches open/ only: no person's folder, no map written");
});

test("the caps: the third write of one email in a day, the ninth from one address and the day's cap all answer 429 without asking the model", async () => {
  let s = storage(), d = deps(s);
  for (let i = 0; i < 2; i++) assert.equal((await run(BODY, d)).statusCode, 200);
  let r = await run(BODY, d); assert.deepEqual([r.statusCode, r.body.error, r.body.scope], [429, "rate_limited", "email"]);
  assert.equal(d.asked.length, 2);
  assert.equal((await run({ ...BODY, email: "other@school.edu" }, d)).statusCode, 200, "another address still writes");

  s = storage(); d = deps(s, { caps: { email: 2, ip: 3, day: 150 } });
  for (let i = 0; i < 3; i++) assert.equal((await run({ ...BODY, email: `p${i}@school.edu` }, d)).statusCode, 200);
  r = await run({ ...BODY, email: "p9@school.edu" }, d); assert.deepEqual([r.statusCode, r.body.scope], [429, "ip"]);
  assert.equal((await run({ ...BODY, email: "p9@school.edu" }, d, { "x-real-ip": "198.51.100.2" })).statusCode, 200, "another network address still writes");

  s = storage(); d = deps(s, { caps: { email: 2, ip: 8, day: 2 } });
  for (let i = 0; i < 2; i++) assert.equal((await run({ ...BODY, email: `q${i}@school.edu` }, d, { "x-real-ip": `198.51.100.${i}` })).statusCode, 200);
  r = await run({ ...BODY, email: "q9@school.edu" }, d, { "x-real-ip": "198.51.100.9" }); assert.deepEqual([r.statusCode, r.body.scope], [429, "day"]);
  assert.equal(d.asked.length, 2);
  // yesterday's counts are no count
  for (const k of Object.keys(s.objects)) s.objects[k] = { date: "2020-01-01", n: 99 };
  assert.equal((await run({ ...BODY, email: "q9@school.edu" }, d, { "x-real-ip": "198.51.100.9" })).statusCode, 200);
});

test("the caps come from the environment, with the defaults 2, 8 and 150", () => {
  assert.deepEqual(API.caps({}), { email: 2, ip: 8, day: 150 });
  assert.deepEqual(API.caps({ OPEN_QUESTS_EMAIL_CAP: "1", OPEN_QUESTS_IP_CAP: "0", OPEN_QUESTS_DAILY_CAP: "40" }), { email: 1, ip: 0, day: 40 });
  assert.deepEqual(API.caps({ OPEN_QUESTS_DAILY_CAP: "lots" }), { email: 2, ip: 8, day: 150 });
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

test("the hosting file bundles what the function reads, and the local server serves it", () => {
  const v = JSON.parse(fs.readFileSync(path.join(web, "vercel.json"), "utf8")).functions;
  const inc = v["api/open.js"].includeFiles;
  for (const f of ["config.js", "build_kit.json", "standards.json", "graph_mba.json", "graph_mba/*.json"]) assert.ok(inc.includes(f), f);
  for (const f of v["api/tree.js"].includeFiles.match(/[a-z_]+\.json/g)) assert.ok(inc.includes(f), `the tree's ${f}`);
  assert.ok(v["api/open.js"].maxDuration * 1000 > API.LIMITS.timeoutMs);
  assert.match(fs.readFileSync(path.join(root, "tests", "ui", "serve.mjs"), "utf8"), /"\/api\/open"/);
});
