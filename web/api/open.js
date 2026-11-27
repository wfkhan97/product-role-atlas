/* POST /api/open: the open flow's project writer (2026-11-11; the portfolio flow, 2026-11-27; behind
   CONFIG.OPEN_QUESTS_ENABLED with OPEN_TREE_ENABLED). A visitor with no session sends an email, their résumé text, the
   roles they picked (one field: the product, MBA or tech set) and the answers of the flow's steps; the function builds
   the map the way /api/tree does (web/apprentice.js over the bundled atlas; nothing is written), asks Claude Opus 5.5
   for three portfolio projects (two beginner, one intermediate) with the request and the rules of /api/quests
   (web/quests.js request and validate, web/api/quests.js write: one retry when nothing passed) and returns the ones
   that pass. "None of these" sends the same request again with `feedback` and `avoid`. The field the kit is read for
   is the built map's, never the request's. The browser keeps the projects (localStorage); nothing here stores a
   project, the résumé, the feedback or the email.

   No one is signed in, so the limits are the gate. Each is a small count in the private `maps` bucket under open/,
   a folder no person's policy reaches (pipeline/sql/2026-11-03_maps.sql: a person reads their own <uid>/ folder),
   written with the service role and counted before the call, since the call is the cost:
     open/email/<hash>.json   { date, n }   one address: OPEN_QUESTS_EMAIL_CAP writes a day (default 4: a first write
                                            and "none of these" rewrites)
     open/ip/<hash>.json      { date, n }   one network address: OPEN_QUESTS_IP_CAP a day (default 8)
     open/day.json            { date, n }   everyone: OPEN_QUESTS_DAILY_CAP a day (default 150)
   The hash is SHA-256, cut; the address is the email as typed, lowercased, never verified. Two requests at once can
   both pass a count: the caps bound the spend to the order of the cap, not to the unit. The key's own spend cap is
   the hard stop (PLAN.md).

     request   { email, text, roles: [role ids of one field, the first is the main role: "pmm", "product.pm",
                 "tech.software_engineer"], posting?: text,
                 answers?: { tech, tools, own_tools, try_new, places, own_places, portfolio } (Quests.cleanAnswers),
                 feedback?: text (at most 600 characters), avoid?: [titles already shown, at most 6] }
               A bare `tech` (a Quests.TECH id, the request before 2026-11-12) is still taken when `answers` has none.
     response  { ok: true, projects: [...], model, dropped }   (a project's shape: web/api/quests.js)
               404 off · 403 cross_origin · 400 email_required | text_required | text_too_short | roles_required |
               too_many_roles | dup_role | unknown_role | mixed_fields · 413 · 429 rate_limited { scope: "email" |
               "ip" | "day" } · 422 no_valid · 503 not_configured · 502 upstream · 504 timeout
     GET       { ok: true, enabled, key, storage }

   The log line holds the model, the stop reasons, the token usage and the rule counts; never the request, the email,
   the feedback or a word of the answer. */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Quests = require("../quests.js");
const { sameOrigin, send, readBody } = require("./infer.js");
const Tree = require("./tree.js");
const QuestsApi = require("./quests.js");

const WEB = path.join(__dirname, "..");
const BUCKET = "maps";
const LIMITS = { body: 200000, timeoutMs: 80000 };
const num = (v, d) => { const n = +v; return Number.isInteger(n) && n >= 0 ? n : d; };
const caps = (env = process.env) => ({ email: num(env.OPEN_QUESTS_EMAIL_CAP, 4), ip: num(env.OPEN_QUESTS_IP_CAP, 8), day: num(env.OPEN_QUESTS_DAILY_CAP, 150) });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const today = () => new Date().toISOString().slice(0, 10);
const hash = s => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 40);

// both flags, read from web/config.js like the project's address (one source: the browser reads the same file)
function enabled(file = path.join(WEB, "config.js")) {
  try { const t = fs.readFileSync(file, "utf8"); return /\bOPEN_TREE_ENABLED:\s*true\b/.test(t) && /\bOPEN_QUESTS_ENABLED:\s*true\b/.test(t); } catch { return false; }
}

// ---------- the request ----------
// the answers of the open flow's steps, cleaned as /api/quests cleans them; `tech` alone from an older page
function answersOf(b, kit) {
  const a = b.answers && typeof b.answers === "object" && !Array.isArray(b.answers) ? { ...b.answers } : {};
  if (a.tech == null) a.tech = b.tech;
  return Quests.cleanAnswers(a, kit);
}
function checkInput(body, kit) {
  const b = body && typeof body === "object" ? body : null;
  const email = b && typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 320) return { error: "email_required", status: 400 };
  const t = Tree.checkInput(b); if (t.error) return t;
  return { email, text: t.text, roles: t.roles, posting: t.posting, answers: answersOf(b, kit), ...Quests.cleanAsk(b) };
}
// the caller's network address as the platform reports it (Vercel sets both headers); "unknown" shares one count
function ipOf(req) {
  const h = req.headers || {};
  return String(h["x-real-ip"] || String(h["x-forwarded-for"] || "").split(",")[0] || "").trim() || "unknown";
}

// ---------- the counts (service role, open/) ----------
async function readCount(name, { fetchImpl = fetch, cfg, key, signal } = {}) {
  const r = await fetchImpl(`${cfg.url}/storage/v1/object/${BUCKET}/open/${name}`, { headers: Tree.serviceHeaders(key), signal });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw Object.assign(new Error(`storage ${r.status}`), { status: r.status });
  try { return await r.json(); } catch { return null; }
}
async function writeCount(name, obj, { fetchImpl = fetch, cfg, key, signal } = {}) {
  const r = await fetchImpl(`${cfg.url}/storage/v1/object/${BUCKET}/open/${name}`, { method: "POST", signal, headers: { ...Tree.serviceHeaders(key), "content-type": "application/json", "x-upsert": "true" }, body: JSON.stringify(obj) });
  if (!r.ok) throw Object.assign(new Error(`storage ${r.status}`), { status: r.status });
  return true;
}
// The three counts for one request: the first that is full names its scope; none full, all three go up by one.
async function count({ email, ip }, day, cap, io) {
  const names = [["email", `email/${hash(email)}.json`], ["ip", `ip/${hash(ip)}.json`], ["day", "day.json"]];
  const held = await Promise.all(names.map(([, n]) => readCount(n, io)));
  const full = names.findIndex(([scope], i) => Quests.dayCount(held[i], day) >= cap[scope]);
  if (full >= 0) return { limited: names[full][0] };
  await Promise.all(names.map(([, n], i) => writeCount(n, Quests.bump(held[i], day), io)));
  return { limited: null };
}

async function handler(req, res, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch, cfg = deps.cfg || Tree.siteConfig();
  const key = deps.key != null ? deps.key : process.env.CATALOG_SERVICE_ROLE_KEY || "";
  const apiKey = deps.apiKey != null ? deps.apiKey : process.env.ANTHROPIC_API_KEY || "";
  const on = deps.enabled != null ? deps.enabled : enabled();
  const kit = deps.kit || QuestsApi.theKit(), cap = deps.caps || caps();
  if (req.method === "GET") {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
    try { return send(res, 200, { ok: true, enabled: on, key: !!apiKey, storage: await Tree.probeStorage({ fetchImpl, cfg, key, signal: ctl.signal }) }); } finally { clearTimeout(t); }
  }
  if (req.method !== "POST") { res.setHeader("allow", "GET, POST"); return send(res, 405, { error: "method_not_allowed" }); }
  if (!on) return send(res, 404, { error: "off" });
  if (!sameOrigin(req)) return send(res, 403, { error: "cross_origin" });
  if (+((req.headers || {})["content-length"] || 0) > LIMITS.body) return send(res, 413, { error: "body_too_large" });
  if (!key || !apiKey) return send(res, 503, { error: "not_configured" });
  let raw; try { raw = await readBody(req); } catch (e) { return send(res, e.status || 400, { error: e.status === 413 ? "body_too_large" : "bad_json" }); }
  const input = checkInput(raw, kit); if (input.error) return send(res, input.status, { error: input.error });
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), LIMITS.timeoutMs);
  const io = { fetchImpl, cfg, key, signal: ctl.signal };
  const t0 = Date.now();
  try {
    // the map first: a request the atlas refuses (an unknown role, two fields) costs nothing and counts for nothing
    let built;
    try { built = await Tree.buildMap(input, { A: deps.A }); }
    catch (e) { if (e.code) return send(res, 400, { error: e.code }); throw e; }
    const c = await count({ email: input.email, ip: ipOf(req) }, today(), cap, io);
    if (c.limited) return send(res, 429, { error: "rate_limited", scope: c.limited });
    const out = await QuestsApi.write({ map: built.map, resume: input.text, extras: "", answers: input.answers, feedback: input.feedback, avoid: input.avoid, kit, standards: deps.standards !== undefined ? deps.standards : QuestsApi.standards() }, { apiKey, fetchImpl, signal: ctl.signal, call: deps.call });
    console.log(JSON.stringify({ fn: "open", model: out.model, stops: out.stops, calls: out.calls, usage: out.usage, kept: out.projects.length, dropped: out.dropped.map(d => d.rules), ms: Date.now() - t0 }));
    if (!out.projects.length) return send(res, 422, { error: "no_valid" });
    return send(res, 200, { ok: true, projects: out.projects, model: out.model, dropped: out.dropped.map(d => d.rules) });
  } catch (e) {
    console.error("open failed:", e.name === "AbortError" ? "timeout" : e.status || e.message);   // never the request
    return send(res, e.name === "AbortError" ? 504 : 502, { error: e.name === "AbortError" ? "timeout" : "upstream" });
  } finally { clearTimeout(timer); }
}

module.exports = handler;
Object.assign(module.exports, { LIMITS, caps, enabled, answersOf, checkInput, ipOf, hash, readCount, writeCount, count, handler });
