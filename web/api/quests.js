/* POST /api/quests: the project writer for a signed-in person (2026-11-11; behind CONFIG.QUESTS_ENABLED, and behind
   SKILL_TREE_ENABLED in the browser since 2026-11-27: still live). A person with a map sends their résumé text, the
   extra material they added (sent once, never stored, never logged), their answers and, for a "none of these"
   rewrite, what should be different and the titles already shown; the function asks Claude Opus 5.5 for three
   portfolio projects (two beginner, one intermediate) grounded in the person's class tree and the build kit
   (web/data/build_kit.json), checks every project in code (web/quests.js validate) and returns the ones that pass. A
   second call picks one: the project, as the function kept it, becomes a card in maps/<uid>/map.json under the
   "Your side project" level. The field is the map's, never the request's.

   Authenticated as /api/tree is (GoTrue says who the person is; the service role reads and writes their folder).
   Raw fetch to the Messages API, no SDK, as web/api/infer.js does: the site has no build step and no dependency.

     request   Authorization: Bearer <the session's access token>
               { mode: "write", text: <the résumé>, extras?: <text, cut at 20,000 characters>,
                 answers: { tech, tools: { <kind id>: "use" }, own_tools, try_new, places: [<place id>], own_places,
                            portfolio: { host, note } }   (Quests.cleanAnswers),
                 feedback?: <text, at most 600 characters>, avoid?: [<titles, at most 6>] }
               { mode: "pick", id: "p1" | "p2" | "p3" }
     response  write: { ok: true, projects: [...], left, cap, model, usage, dropped }   pick: { ok: true, card: <card id> }
               a project: { id, level, title, ship, atlas_skills, steps, prompt, build_with: { kind, examples, tools:
               [{ name, url, free, own }] }, live_on: { place }, share: { place, how, post } | null, why_role, why_person }
               401 no_session · 400 bad_mode | text_required | text_too_short | bad_pick · 404 off (the flag is off) ·
               409 no_map (build the tree first) | side_full (three side projects already) · 410 no_options (pick
               with nothing written today) · 429 rate_limited { cap } · 422 no_valid (two answers, no project passed) ·
               503 not_configured (no ANTHROPIC_API_KEY or no CATALOG_SERVICE_ROLE_KEY) · 502 upstream · 504 timeout
     GET       { ok: true, enabled, key, storage }

   What it writes, with the service role, in the person's own folder (the person can read both, never write them):
   quests/count.json ({ date, n }: the daily cap) and quests/pending.json (the projects of the last write, so a pick
   names one by id and never sends a project back). Neither holds the résumé, the extras or the feedback. The log line
   holds the model, the stop reason, the token usage and the rule counts; never the request or the answer's text. */
"use strict";
const fs = require("fs");
const path = require("path");
const Quests = require("../quests.js");
const { sameOrigin, send, readBody } = require("./infer.js");
const { siteConfig, serviceHeaders, userOf, readMap, writeMap, probeStorage, bearer } = require("./tree.js");

const WEB = path.join(__dirname, "..");
const MODEL = process.env.QUESTS_MODEL || Quests.MODEL;
const LIMITS = { body: 120000, text: 40000, minText: 80, extras: Quests.LIMITS.extras, timeoutMs: 80000, maxTokens: 16000 };
const BUCKET = "maps";
const CAP = +process.env.QUESTS_DAILY_CAP || Quests.CAP;
const today = () => new Date().toISOString().slice(0, 10);
const serviceKey = () => process.env.CATALOG_SERVICE_ROLE_KEY || "";

// the flag, read from web/config.js like the project's address (one source: the browser reads the same file)
function enabled(file = path.join(WEB, "config.js")) {
  try { return /\bQUESTS_ENABLED:\s*true\b/.test(fs.readFileSync(file, "utf8")); } catch { return false; }
}
let KIT = null;
const theKit = () => KIT ||= JSON.parse(fs.readFileSync(path.join(WEB, "data", "build_kit.json"), "utf8"));
// The standards index, as published for the site (web/data/standards.json: the roles and what each must show, no
// sources). Read once; a deploy without the file writes quests without it.
let STANDARDS;
function standards(file = path.join(WEB, "data", "standards.json")) {
  if (STANDARDS !== undefined && arguments.length === 0) return STANDARDS;
  let v = null;
  try { v = JSON.parse(fs.readFileSync(file, "utf8")); } catch { v = null; }
  if (arguments.length === 0) STANDARDS = v;
  return v;
}

// ---------- the request: checked before anything runs ----------
function checkInput(body, kit = theKit()) {
  const b = body && typeof body === "object" ? body : null;
  if (!b || !["write", "pick"].includes(b.mode)) return { error: "bad_mode", status: 400 };
  if (b.mode === "pick") return /^p[1-3]$/.test(String(b.id || "")) ? { mode: "pick", id: b.id } : { error: "bad_pick", status: 400 };
  if (typeof b.text !== "string") return { error: "text_required", status: 400 };
  const text = b.text.replace(/\u0000/g, "").trim();
  if (text.length < LIMITS.minText) return { error: "text_too_short", status: 400 };
  if (text.length > LIMITS.text) return { error: "text_too_long", status: 413 };
  const extras = Quests.clipExtras([typeof b.extras === "string" ? b.extras : ""], LIMITS.extras).text;
  return { mode: "write", text, extras, answers: Quests.cleanAnswers(b.answers, kit), ...Quests.cleanAsk(b) };
}

// ---------- the person's folder: the count and the pending projects (service role) ----------
async function readObj(uid, name, { fetchImpl = fetch, cfg = siteConfig(), key = serviceKey(), signal } = {}) {
  const r = await fetchImpl(`${cfg.url}/storage/v1/object/${BUCKET}/${uid}/quests/${name}`, { headers: serviceHeaders(key), signal });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw Object.assign(new Error(`storage ${r.status}`), { status: r.status });
  try { return await r.json(); } catch { return null; }
}
async function writeObj(uid, name, obj, { fetchImpl = fetch, cfg = siteConfig(), key = serviceKey(), signal } = {}) {
  const r = await fetchImpl(`${cfg.url}/storage/v1/object/${BUCKET}/${uid}/quests/${name}`, { method: "POST", signal, headers: { ...serviceHeaders(key), "content-type": "application/json", "x-upsert": "true" }, body: JSON.stringify(obj) });
  if (!r.ok) throw Object.assign(new Error(`storage ${r.status}`), { status: r.status });
  return true;
}

// ---------- the model ----------
// Opus 5.5 over the Messages API: the body from Quests.request (effort medium set explicitly, structured outputs,
// thinking left to its default, which is adaptive and cannot be turned off), plus the server-side refusal fallback.
// stop_reason is read before the content: a refusal or a cut answer is no answer.
function body(input, model = MODEL) {
  return { ...Quests.request(input, { model, maxTokens: LIMITS.maxTokens, effort: "medium" }), fallbacks: "default" };
}
async function callModel(input, { apiKey, fetchImpl = fetch, signal, model = MODEL } = {}) {
  const r = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST", signal,
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2026-10-21", "anthropic-beta": "server-side-fallback-2026-07-01" },
    body: JSON.stringify(body(input, model)),
  });
  if (!r.ok) throw Object.assign(new Error(`anthropic ${r.status}`), { status: r.status });
  const msg = await r.json();
  const out = { model: msg.model || model, usage: msg.usage || null, stop: msg.stop_reason || null };
  if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") return { ...out, answer: { projects: [] } };
  const text = (msg.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  let answer; try { answer = JSON.parse(text); } catch { answer = { projects: [] }; }
  return { ...out, answer };
}
// usage as one record, summed over the calls of one write (a retry adds its own)
const addUsage = (a, u) => { const o = { ...(a || {}) }; for (const k of ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]) o[k] = (o[k] || 0) + ((u || {})[k] || 0); return o; };

// One write: the call, the check, one retry when nothing passed. { projects, dropped, failures, model, usage, stops, calls }
async function write(input, { apiKey, fetchImpl, signal, call = callModel } = {}) {
  const ask = Quests.cleanAsk(input);
  const ctx = { kit: input.kit, answers: input.answers, map: input.map, tree: Quests.treeOf(input.map), resume: input.resume, posting: null, avoid: ask.avoid };
  let usage = null, stops = [], model = MODEL, v = null, calls = 0;
  for (let i = 0; i < 2; i++) {
    const out = await call(input, { apiKey, fetchImpl, signal });
    calls++; usage = addUsage(usage, out.usage); stops.push(out.stop); model = out.model || model;
    v = Quests.validate(out.answer, ctx);
    if (v.projects.length) break;
  }
  return { ...v, model, usage, stops, calls };
}

async function handler(req, res, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch, cfg = deps.cfg || siteConfig(), key = deps.key != null ? deps.key : serviceKey();
  const apiKey = deps.apiKey != null ? deps.apiKey : process.env.ANTHROPIC_API_KEY || "";
  const on = deps.enabled != null ? deps.enabled : enabled();
  const kit = deps.kit || theKit();
  if (req.method === "GET") {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
    try { return send(res, 200, { ok: true, enabled: on, key: !!apiKey, storage: await probeStorage({ fetchImpl, cfg, key, signal: ctl.signal }) }); } finally { clearTimeout(t); }
  }
  if (req.method !== "POST") { res.setHeader("allow", "GET, POST"); return send(res, 405, { error: "method_not_allowed" }); }
  if (!on) return send(res, 404, { error: "off" });
  if (!sameOrigin(req)) return send(res, 403, { error: "cross_origin" });
  if (+((req.headers || {})["content-length"] || 0) > LIMITS.body) return send(res, 413, { error: "body_too_large" });
  if (!key || !apiKey) return send(res, 503, { error: "not_configured" });
  const token = bearer(req);
  if (!token) return send(res, 401, { error: "no_session" });
  let raw; try { raw = await readBody(req); } catch (e) { return send(res, e.status || 400, { error: e.status === 413 ? "body_too_large" : "bad_json" }); }
  const input = checkInput(raw, kit); if (input.error) return send(res, input.status, { error: input.error });
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), LIMITS.timeoutMs);
  const io = { fetchImpl, cfg, key, signal: ctl.signal };
  const t0 = Date.now();
  try {
    const user = await userOf(token, { fetchImpl, cfg, signal: ctl.signal });
    if (!user) return send(res, 401, { error: "no_session" });
    const map = await readMap(user.uid, io);
    if (!map) return send(res, 409, { error: "no_map" });
    if (input.mode === "pick") {
      const pending = await readObj(user.uid, "pending.json", io);
      const project = pending && Array.isArray(pending.projects) ? pending.projects.find(p => p.id === input.id) : null;
      if (!project) return send(res, 410, { error: "no_options" });
      if (Quests.sideCount(map) >= Quests.LIMITS.cardsMax) return send(res, 409, { error: "side_full" });
      const card = Quests.cardOf(project, map, { kit, date: today(), model: pending.model || MODEL });
      await writeMap(user.uid, Quests.addSide(map, card), io);
      return send(res, 200, { ok: true, card: card.id });
    }
    const day = today(), count = await readObj(user.uid, "count.json", io);
    if (Quests.dayCount(count, day) >= CAP) return send(res, 429, { error: "rate_limited", cap: CAP });
    await writeObj(user.uid, "count.json", Quests.bump(count, day), io);   // counted before the call: the call is the cost
    const out = await write({ map, resume: input.text, extras: input.extras, answers: input.answers, feedback: input.feedback, avoid: input.avoid, kit, standards: standards() }, { apiKey, fetchImpl, signal: ctl.signal, call: deps.call });
    // the one log line: what it cost and what the rules dropped, never a word of the request or the answer
    console.log(JSON.stringify({ fn: "quests", model: out.model, stops: out.stops, calls: out.calls, usage: out.usage, kept: out.projects.length, dropped: out.dropped.map(d => d.rules), ms: Date.now() - t0 }));
    if (!out.projects.length) return send(res, 422, { error: "no_valid" });
    await writeObj(user.uid, "pending.json", { date: day, model: out.model, projects: out.projects }, io);
    return send(res, 200, { ok: true, projects: out.projects, left: Math.max(0, CAP - Quests.dayCount(count, day) - 1), cap: CAP, model: out.model, usage: out.usage, dropped: out.dropped.map(d => d.rules) });
  } catch (e) {
    console.error("quests failed:", e.name === "AbortError" ? "timeout" : e.status || e.message);   // never the request
    return send(res, e.name === "AbortError" ? 504 : 502, { error: e.name === "AbortError" ? "timeout" : "upstream" });
  } finally { clearTimeout(timer); }
}

module.exports = handler;
Object.assign(module.exports, { MODEL, LIMITS, CAP, enabled, theKit, standards, checkInput, readObj, writeObj, body, callModel, write, handler });
