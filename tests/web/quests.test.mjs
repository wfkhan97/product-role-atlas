// "Start a side project" (2026-11-11): the pure parts (web/quests.js), the build kit (web/data/build_kit.json) and the
// function (web/api/quests.js). No network and no model: GoTrue, Storage and the model call are stand-ins; the map is
// the tracked example (pipeline/apprentice/examples/pmm-nyc/map.json) and its profile.md is the résumé.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { root, web, require } from "./_load.mjs";

const Q = require(path.join(web, "quests.js"));
const API = require(path.join(web, "api", "quests.js"));
const Apprentice = require(path.join(web, "apprentice.js"));
const MapModel = require(path.join(web, "map.js"));
const Copy = require(path.join(web, "copy.js"));
const { checkMap } = await import(path.join(root, "pipeline/apprentice/check.mjs"));
const KIT = JSON.parse(fs.readFileSync(path.join(web, "data", "build_kit.json"), "utf8"));
const EXDIR = path.join(root, "pipeline/apprentice/examples/pmm-nyc");
const example = () => JSON.parse(fs.readFileSync(path.join(EXDIR, "map.json"), "utf8"));
const RESUME = fs.readFileSync(path.join(EXDIR, "profile.md"), "utf8");
const ANSWERS = { tech: "ai_tools", tools: { chat_pages: "use", app_builders: "learn" }, accounts: { github: "have", vercel: "would", notion: "no", supabase: "no", domain: "no" } };

// a project that passes every rule against the example map and ANSWERS
const good = (extra = {}) => ({
  title: "A positioning teardown of three freight apps",
  ship: "A public page comparing how three freight apps position themselves.",
  atlas_skills: ["positioning_messaging", "gtm"],
  steps: ["Pick three freight apps your old customers used.", "Copy each home page headline and pitch.", "Ask Claude to compare the positioning in a table.", "Publish the page on GitHub Pages and share it."],
  prompt: "You are helping me write a positioning teardown of three freight software products. Compare their headlines, the customer each names and the proof each offers.",
  build_with: { kind: "chat_pages", examples: ["Claude", "Not a kit name"] },
  live_on: { host: "github_pages" },
  needs_database: false,
  why_role: { text: "Product marketers own positioning. A teardown shows you can read a market." },
  why_person: { text: "You sold logistics software and know these buyers.", resume_quote: "built the partner program from zero to eleven partners" },
  ...extra,
});
const ctx = () => ({ kit: KIT, answers: ANSWERS, map: example(), resume: RESUME });

// ---------- the kit ----------
test("the kit: every example and host has a checked date and an https url; no Sora; the coding agents name Claude Code, Cursor and Codex", () => {
  for (const k of KIT.kinds) {
    assert.ok(k.id && k.label && k.examples.length >= 2 && k.examples.length <= 3, k.id);
    for (const e of k.examples) {
      assert.match(e.checked || "", /^\d{4}-\d{2}-\d{2}$/, `${k.id}/${e.name} has no checked date`);
      assert.match(e.url || "", /^https:\/\//, `${k.id}/${e.name} has no url`);
    }
  }
  for (const h of KIT.hosts) { assert.match(h.checked || "", /^\d{4}-\d{2}-\d{2}$/, h.id); assert.match(h.url || "", /^https:\/\//, h.id); assert.ok(h.needs === null || KIT.accounts.some(a => a.id === h.needs), h.id); }
  assert.ok(!/sora/i.test(JSON.stringify(KIT.kinds)), "Sora shut down in 2026");
  assert.deepEqual(KIT.kinds.find(k => k.id === "coding_agents").examples.map(e => e.name), ["Claude Code", "Cursor", "Codex"]);
  assert.deepEqual(KIT.kinds.map(k => k.id), ["chat_pages", "app_builders", "coding_agents", "image", "video", "voice_audio", "automation", "docs_data", "research"]);
  assert.deepEqual(KIT.accounts.map(a => a.id), ["github", "vercel", "notion", "supabase", "domain"]);
});

// ---------- the answers ----------
test("the answers: anything outside the lists drops; the kinds marked, else all; a host only with its account had or wanted; a database only with Supabase", () => {
  const a = Q.cleanAnswers({ tech: "wizard", tools: { chat_pages: "use", nope: "use", image: "maybe" }, accounts: { github: "have", ftp: "have", vercel: "sure" } }, KIT);
  assert.deepEqual(a, { tech: null, tools: { chat_pages: "use" }, accounts: { github: "have" } });
  assert.deepEqual(Q.allowedKinds({ tools: {} }, KIT), KIT.kinds.map(k => k.id), "none marked: every kind");
  assert.deepEqual(Q.allowedKinds(Q.cleanAnswers(ANSWERS, KIT), KIT), ["chat_pages", "app_builders"]);
  assert.deepEqual(Q.allowedHosts(Q.cleanAnswers(ANSWERS, KIT), KIT), ["claude_artifact", "chatgpt_share", "github_pages", "vercel", "video_link"]);
  assert.equal(Q.dbAllowed(ANSWERS), false);
  assert.equal(Q.dbAllowed({ accounts: { supabase: "would" } }), true);
});

test("clipExtras joins the parts and cuts at the cap, and says so", () => {
  assert.deepEqual(Q.clipExtras(["a", " ", { text: "b" }]), { text: "a\n\n---\n\nb", cut: false, chars: 9 });
  const big = Q.clipExtras(["x".repeat(15000), "y".repeat(15000)]);
  assert.deepEqual([big.cut, big.text.length], [true, Q.LIMITS.extras]);
});

// ---------- the prompt ----------
test("the request: Opus 5.5, effort medium, no thinking key, no sampling, structured outputs; the stable prefix is byte-identical for two people and holds none of their material", () => {
  const one = Q.request({ map: example(), resume: RESUME, extras: "An essay about freight.", answers: ANSWERS, kit: KIT });
  const other = example(); other.role_class.roles = [{ id: "brand_manager", label: "Brand Manager", first: true }]; other.tree.nodes = other.tree.nodes.slice(0, 3);
  const two = Q.request({ map: other, resume: "A different person who ran a bakery and its Instagram for six years.", extras: "", answers: { tech: "write_code", tools: {}, accounts: { supabase: "have" } }, kit: KIT });
  assert.equal(one.model, "claude-opus-5-5");
  assert.deepEqual(one.output_config.effort, "medium");
  assert.equal(one.output_config.format.type, "json_schema");
  assert.deepEqual(one.output_config.format.schema, Q.SCHEMA);
  for (const k of ["thinking", "temperature", "top_p", "top_k", "tool_choice", "tools"]) assert.ok(!(k in one), `no ${k}`);
  assert.equal(one.messages.length, 1); assert.equal(one.messages[0].role, "user", "no assistant prefill");
  assert.equal(JSON.stringify(one.system), JSON.stringify(two.system), "the stable prefix is the same bytes for every person");
  assert.deepEqual(one.system.map(b => !!b.cache_control), [false, true], "the breakpoint sits after the kit");
  const sys = JSON.stringify(one.system);
  for (const own of ["freight", "Mumbai", "An essay", "positioning_messaging", "Product Marketing Manager"]) assert.ok(!sys.includes(own), `the prefix holds no "${own}"`);
  const user = one.messages[0].content;
  assert.ok(user.includes("<resume>") && user.includes("Mumbai") && user.includes("An essay about freight."), "the person's material is the user message");
  assert.ok(user.indexOf("<roles>") < user.indexOf("<resume>") && user.indexOf("<resume>") < user.indexOf("<extra>"));
  assert.ok(user.includes("kinds allowed: chat_pages, app_builders") && user.includes("database allowed: no"));
  assert.ok(Q.kitBlock(KIT).includes("Claude Code") && !Q.PROMPT.includes("{"), "the kit is in the prefix; the prompt has no template slot");
  assert.equal(Q.request({ map: example(), resume: RESUME, extras: "", answers: ANSWERS, kit: KIT }).messages[0].content, Q.request({ map: example(), resume: RESUME, extras: "", answers: ANSWERS, kit: KIT }).messages[0].content, "deterministic");
});

// ---------- the validator: each rule with a bad sample ----------
test("validate keeps a good project with an id, cuts examples to the kit's, and keeps a quote the résumé holds", () => {
  const v = Q.validate({ projects: [good()] }, ctx());
  assert.equal(v.projects.length, 1, JSON.stringify(v.dropped));
  const p = v.projects[0];
  assert.equal(p.id, "p1");
  assert.deepEqual(p.build_with.examples, ["Claude"]);
  assert.equal(p.why_person.resume_quote, "built the partner program from zero to eleven partners");
});
const BAD = {
  schema: { title: "" },
  skills_on_tree: { atlas_skills: ["positioning_messaging", "not_a_skill"] },
  kind_in_kit: { build_with: { kind: "sora", examples: [] } },
  kind_allowed: { build_with: { kind: "coding_agents", examples: ["Cursor"] } },
  host_in_kit: { live_on: { host: "geocities" } },
  host_allowed: { live_on: { host: "notion_page" } },
  database_allowed: { needs_database: true },
  title_words: { title: "One two three four five six seven eight nine ten" },
  ship_words: { ship: "A page that compares the positioning of three freight apps for buyers who move goods across India daily." },
  steps_count: { steps: ["Write it.", "Ship it."] },
  step_words: { steps: ["One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen.", "Write.", "Ship."] },
  prompt_words: { prompt: Array.from({ length: 81 }, (_, i) => "w" + i).join(" ") },
  no_duration: { steps: ["Spend two hours on research.", "Write the page.", "Publish it."] },
  no_mission: { ship: "A page for your mission to win buyers." },
  why_voice: { why_person: { text: "They sold logistics software and know these buyers.", resume_quote: "" } },
};
for (const [rule, edit] of Object.entries(BAD)) {
  test(`validate drops a project that breaks ${rule}`, () => {
    const v = Q.validate({ projects: [good(edit)] }, ctx());
    assert.equal(v.projects.length, 0);
    assert.ok(v.dropped[0].rules.includes(rule), JSON.stringify(v.dropped));
    assert.equal(v.failures[rule], 1);
  });
}
test("validate drops a quote the résumé does not hold, and keeps the project; drops a duplicate title; keeps three at most", () => {
  const v = Q.validate({ projects: [good({ why_person: { text: "You know freight.", resume_quote: "won a Nobel prize in logistics" } }), good(), good({ title: "A second idea" }), good({ title: "A third idea" }), good({ title: "A fourth idea" })] }, ctx());
  assert.equal(v.projects[0].why_person.resume_quote, null);
  assert.equal(v.failures.quote_dropped, 1);
  assert.deepEqual(v.projects.map(p => p.title), [good().title, "A second idea", "A third idea"]);
  assert.deepEqual(v.dropped.map(d => d.rules), [["duplicate"], ["over_three"]]);
  assert.deepEqual(Q.validate(null, ctx()).projects, []);
  assert.ok(Q.DURATION.test("in an evening") && Q.DURATION.test("takes 6 weeks") && Q.DURATION.test("Spend two hours on research.") && Q.DURATION.test("5 hours a week") && !Q.DURATION.test("Write today's brief") && !Q.DURATION.test("a daily digest"));
  // a time word in the project's own subject is not an estimate (the first eval run dropped these)
  for (const ok of ["A weekly business review kit", "Compute monthly KPIs like cost per lead", "A first ninety days playbook for new GMs", "Add filters by device and week", "week-over-week change", "twelve months of data", "a five-minute spoken briefing", "this week, target, trend"]) assert.ok(!Q.DURATION.test(ok), ok);
});

test("write asks once more when nothing passed, then gives up; usage sums over the calls", async () => {
  let n = 0;
  const call = async () => ({ answer: { projects: n++ === 0 ? [good({ title: "" })] : [good()] }, model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 5 }, stop: "end_turn" });
  const w = await API.write({ map: example(), resume: RESUME, extras: "", answers: ANSWERS, kit: KIT }, { call });
  assert.deepEqual([w.calls, w.projects.length, w.usage.input_tokens, w.usage.output_tokens], [2, 1, 20, 10]);
  const none = await API.write({ map: example(), resume: RESUME, extras: "", answers: ANSWERS, kit: KIT }, { call: async () => ({ answer: { projects: [] }, model: "m", usage: null, stop: "refusal" }) });
  assert.deepEqual([none.calls, none.projects.length, none.stops], [2, 0, ["refusal", "refusal"]]);
});

test("callModel reads stop_reason before the content: a refusal or max_tokens is no answer; the body carries the fallback and the beta header", async () => {
  let seen = null;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ model: "claude-opus-5-5", stop_reason: "max_tokens", usage: { input_tokens: 1 }, content: [{ type: "text", text: JSON.stringify({ projects: [good()] }) }] }) }; };
  const out = await API.callModel({ map: example(), resume: RESUME, extras: "", answers: ANSWERS, kit: KIT }, { apiKey: "k", fetchImpl });
  assert.deepEqual(out.answer, { projects: [] });
  const body = JSON.parse(seen.init.body);
  assert.equal(seen.url, "https://api.anthropic.com/v1/messages");
  assert.equal(seen.init.headers["anthropic-beta"], "server-side-fallback-2026-07-01");
  assert.deepEqual([body.model, body.fallbacks, body.max_tokens, body.output_config.effort], ["claude-opus-5-5", "default", 16000, "medium"]);
  const ok = await API.callModel({ map: example(), resume: RESUME, extras: "", answers: ANSWERS, kit: KIT }, { apiKey: "k", fetchImpl: async () => ({ ok: true, json: async () => ({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify({ projects: [good()] }) }] }) }) });
  assert.equal(ok.answer.projects.length, 1);
});

// ---------- the card ----------
test("cardOf: a side_project card from the model, level side, no time estimate, the kit's words; addSide puts its level first; the screen reads it", () => {
  const map = example(), p = Q.validate({ projects: [good()] }, ctx()).projects[0];
  const card = Q.cardOf(p, map, { kit: KIT, date: "2026-11-11" });
  assert.match(card.id, /^side-a-positioning-teardown-of-three/);
  assert.match(card.id, /^[a-z0-9_-]+$/, "a card id the feedback path takes");
  assert.deepEqual([card.kind, card.source, card.level, card.track], ["side_project", "model", "side", "gtm"]);
  assert.ok(!("hours" in card) && !("window" in card));
  assert.deepEqual(card.build_with, [{ name: "Chat assistants that make pages or small tools", note: "Claude" }]);
  assert.deepEqual(card.live_on.map(x => x.name), ["GitHub Pages"]);
  assert.equal(card.why_person.profile_quote, p.why_person.resume_quote);
  assert.equal(Q.cardOf(p, { ...map, cards: [...map.cards, card] }, { kit: KIT }).id, card.id + "-2", "a second pick of the same title gets its own id");
  const m2 = Q.addSide(map, card);
  assert.deepEqual(m2.worlds.map(w => w.n), ["side", 1, 2, 3, "reach"]);
  assert.equal(map.cards.length + 1, m2.cards.length, "the map itself is not changed");
  const W = MapModel.worlds(m2, {});
  assert.deepEqual([W.worlds[0].head, W.worlds[0].label, W.worlds[0].side, W.here], [Copy.map.sideHead, "", true, card.id]);
  assert.equal(Q.sideCount(m2), 1);
  assert.equal(Apprentice.byHand({ cards: [card] }), false, "a side project is not an owner's card: /api/tree may rebuild");
  const rebuilt = Q.keepSide(m2, { worlds: [{ n: 1, missions: [] }], cards: [] });
  assert.deepEqual([rebuilt.worlds.map(w => w.n), rebuilt.cards.map(c => c.id)], [["side", 1], [card.id]]);
});

test("the example with a side project still passes check.mjs; a side card with hours fails it", () => {
  const map = example(), p = Q.validate({ projects: [good()] }, ctx()).projects[0];
  const m2 = Q.addSide(map, Q.cardOf(p, map, { kit: KIT, date: "2026-11-11" }));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "quests-check-"));
  try {
    const f = path.join(tmp, "map.json"); fs.writeFileSync(f, JSON.stringify(m2));
    assert.deepEqual(checkMap("pmm-nyc", EXDIR, f).fails, []);
    m2.cards.at(-1).hours = 3; fs.writeFileSync(f, JSON.stringify(m2));
    assert.deepEqual(checkMap("pmm-nyc", EXDIR, f).fails, [`card ${m2.cards.at(-1).id}: a side project carries no time estimate`]);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// ---------- the cap ----------
test("the daily cap counts per day and starts again on a new day", () => {
  assert.equal(Q.dayCount(null, "2026-11-11"), 0);
  let c = Q.bump(null, "2026-11-11"); c = Q.bump(c, "2026-11-11");
  assert.deepEqual(c, { date: "2026-11-11", n: 2 });
  assert.equal(Q.dayCount(c, "2026-11-12"), 0);
  assert.deepEqual(Q.bump(c, "2026-11-12"), { date: "2026-11-12", n: 1 });
  assert.ok(Q.CAP >= 3 && Q.CAP <= 10);
});

// ---------- the function ----------
const UID = "f800ebd8-bff1-4289-9931-12878454fc42";
const cfg = { url: "https://p.supabase.co", key: "pk" };
function project(objects = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", headers: init.headers || {} });
    if (url.endsWith("/auth/v1/user")) return init.headers.authorization === "Bearer good" ? { ok: true, status: 200, json: async () => ({ id: UID }) } : { ok: false, status: 401 };
    if (url.endsWith("/storage/v1/bucket/maps")) return { ok: true, status: 200 };
    const m = /\/storage\/v1\/object\/maps\/(.+)$/.exec(url);
    if (m && !init.method) return objects[m[1]] ? { ok: true, status: 200, json: async () => objects[m[1]] } : { ok: false, status: 404 };
    if (m && init.method === "POST") { objects[m[1]] = JSON.parse(init.body); return { ok: true, status: 200 }; }
    return { ok: false, status: 500 };
  };
  return { calls, fetchImpl, objects };
}
const res = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } });
const post = (body, token = "good") => ({ method: "POST", headers: { host: "h", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body });
const deps = (p, extra = {}) => ({ fetchImpl: p.fetchImpl, cfg, key: "svc", apiKey: "ak", enabled: true, kit: KIT, call: async () => ({ answer: { projects: [good(), good({ title: "A partner program teardown page" })] }, model: "claude-opus-5-5", usage: { input_tokens: 9000, output_tokens: 3000 }, stop: "end_turn" }), ...extra });
const WRITE = { mode: "write", text: RESUME, extras: "My essay on freight.", answers: ANSWERS };

test("the function: off is 404 and the flag is on in web/config.js (owner, 2026-11-11); no keys 503; no session 401; no map 409; a bad mode 400", async () => {
  const p = project();
  let r = res(); await API.handler(post(WRITE), r, deps(p, { enabled: false })); assert.deepEqual([r.statusCode, r.body.error], [404, "off"]);
  assert.equal(API.enabled(), true, "QUESTS_ENABLED is on in web/config.js");
  r = res(); await API.handler(post(WRITE), r, deps(p, { apiKey: "" })); assert.equal(r.statusCode, 503);
  r = res(); await API.handler(post(WRITE, "bad"), r, deps(p)); assert.equal(r.statusCode, 401);
  r = res(); await API.handler(post(WRITE), r, deps(p)); assert.deepEqual([r.statusCode, r.body.error], [409, "no_map"]);
  r = res(); await API.handler(post({ mode: "nope" }), r, deps(p)); assert.equal(r.statusCode, 400);
  r = res(); await API.handler({ method: "GET", headers: {} }, r, deps(p)); assert.deepEqual(r.body, { ok: true, enabled: true, key: true, storage: true });
  const v = JSON.parse(fs.readFileSync(path.join(web, "vercel.json"), "utf8")).functions["api/quests.js"];
  assert.ok(v.includeFiles.includes("build_kit.json") && v.includeFiles.includes("config.js") && v.maxDuration >= 90);
});

test("the function writes three at most, counts the day, keeps the pending projects without the résumé or the extras, logs no text; a pick adds the card", async () => {
  const p = project({ [`${UID}/map.json`]: example() });
  const logs = []; const log = console.log; console.log = (...a) => logs.push(a.join(" "));
  let r = res();
  try { await API.handler(post(WRITE), r, deps(p)); } finally { console.log = log; }
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.projects.map(x => x.id), r.body.left, r.body.cap], [["p1", "p2"], API.CAP - 1, API.CAP]);
  assert.deepEqual(p.objects[`${UID}/quests/count.json`].n, 1);
  const pending = JSON.stringify(p.objects[`${UID}/quests/pending.json`]);
  assert.ok(!pending.includes("Mumbai") && !pending.includes("My essay"), "the pending file holds neither the résumé nor the extras");
  assert.equal(logs.length, 1);
  const line = JSON.parse(logs[0]);
  assert.deepEqual([line.fn, line.kept, line.usage.input_tokens, line.usage.output_tokens], ["quests", 2, 9000, 3000]);
  assert.ok(!logs[0].includes("freight") && !logs[0].includes("essay"), "the log holds no text");
  r = res(); await API.handler(post({ mode: "pick", id: "p2" }), r, deps(p));
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const map = p.objects[`${UID}/map.json`];
  assert.equal(map.worlds[0].n, "side");
  assert.equal(map.cards.at(-1).id, r.body.card);
  assert.equal(map.cards.at(-1).title, "A partner program teardown page");
  r = res(); await API.handler(post({ mode: "pick", id: "p3" }), r, deps(p)); assert.deepEqual([r.statusCode, r.body.error], [410, "no_options"]);
});

test("the function refuses past the daily cap with 429 and the cap, before any call; no valid project is 422", async () => {
  const p = project({ [`${UID}/map.json`]: example(), [`${UID}/quests/count.json`]: { date: new Date().toISOString().slice(0, 10), n: API.CAP } });
  let called = false;
  let r = res(); await API.handler(post(WRITE), r, deps(p, { call: async () => { called = true; return { answer: {} }; } }));
  assert.deepEqual([r.statusCode, r.body.error, r.body.cap, called], [429, "rate_limited", API.CAP, false]);
  const p2 = project({ [`${UID}/map.json`]: example() });
  const log = console.log; console.log = () => { };
  r = res(); try { await API.handler(post(WRITE), r, deps(p2, { call: async () => ({ answer: { projects: [good({ title: "" })] }, usage: {}, stop: "end_turn" }) })); } finally { console.log = log; }
  assert.deepEqual([r.statusCode, r.body.error], [422, "no_valid"]);
});

test("the copy has the flow's lines, and no line says mission or names a duration", () => {
  const S = Copy.map.flow;
  for (const k of ["aim", "bring", "tech", "tools", "accounts", "pick"]) assert.ok(S[k] && S[k].title, k);
  assert.equal(S.bring.privacy, "Sent once to write your quests. Not stored.");
  const text = JSON.stringify({ start: S, side: [Copy.map.sideHead, Copy.map.flowSide, Copy.map.emptySide, Copy.map.sideTag] });
  assert.ok(!/\bmissions?\b/i.test(text));
  assert.ok(!Q.DURATION.test(text.replace(/today/g, "")), "no duration words (\"today\" names the cap's day)");
});

// ---------- the standards index as grounding (2026-11-11) ----------
test("standardsFor: a role matches by its id or also_serves, carries no source or address, and a role with no list adds nothing", async () => {
  const index = JSON.parse(fs.readFileSync(path.join(root, "web/data/standards.json"), "utf8"));
  const t = Q.standardsFor(index, ["pmm", "data_analyst", "general_manager"]);
  assert.ok(/## Product Marketing Manager/.test(t) && /## Data Scientist/.test(t), "pmm by id, data_analyst through also_serves");
  assert.ok(!/https?:|lenny|meta_|google_/i.test(t), "no source id and no address");
  assert.ok(/Never name a source/.test(t));
  assert.equal(Q.standardsFor(index, ["general_manager"]), "");
  assert.equal(Q.standardsFor(null, ["pmm"]), "");
  assert.ok(t.length <= Q.LIMITS.standards);
  const four = Q.standardsFor(index, ["pmm", "marketing_manager", "growth_manager", "brand_manager"]);
  assert.ok(four.length <= Q.LIMITS.standards && four.split("\n").every(l => /^#|^- .*Skills: /.test(l)), "a long class ends on a whole line");
});

test("the published standards file is what pipeline/standards_publish.mjs writes from pipeline/standards.json", async () => {
  const { render } = await import(path.join(root, "pipeline/standards_publish.mjs"));
  const want = render(JSON.parse(fs.readFileSync(path.join(root, "pipeline/standards.json"), "utf8")));
  assert.equal(fs.readFileSync(path.join(root, "web/data/standards.json"), "utf8"), want, "run node pipeline/standards_publish.mjs");
  assert.ok(!/"sources"|https?:/.test(want), "no sources and no addresses reach the site");
});

test("the person block carries <standards> when the index has a list for one of the map's roles, and none without the index", () => {
  const index = JSON.parse(fs.readFileSync(path.join(root, "web/data/standards.json"), "utf8"));
  const withIt = Q.personBlock({ map: example(), resume: RESUME, answers: {}, kit: KIT, standards: index });
  const without = Q.personBlock({ map: example(), resume: RESUME, answers: {}, kit: KIT, standards: null });
  assert.ok(withIt.includes("<standards>") && withIt.includes("## Product Marketing Manager") && !without.includes("<standards>"));
  assert.ok(withIt.indexOf("<standards>") < withIt.indexOf("<resume>"), "before the résumé, after the answers");
});

test("the why line speaks to the person: a sentence opening in the third person is refused, a third party in mid-sentence is not", () => {
  for (const bad of ["They built an agent-facing tool.", "You led AI strategy. She knows the buyer.", "The candidate cut vendor costs."]) assert.ok(Q.THIRD.test(bad), bad);
  for (const ok of ["You built an agent-facing tool.", "Your sellers log objections, and they get approved replies.", "You know what the buyer values and how they decide."]) assert.ok(!Q.THIRD.test(ok), ok);
  assert.match(Q.PROMPT, /Speak to the person as "you"/);
});
