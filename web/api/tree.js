/* POST /api/tree: the self-serve tree tier of the apprentice map (the visitor journey, step 4, 2026-11-05). A signed-in
   person sends their résumé text and one to four role ids of one field; the function grounds the class the way the
   owner's ground.mjs does (web/apprentice.js: the class tree, the read, the story cards; no model, no company
   research, no build cards) and writes the map to maps/<uid>/map.json with the service role, where #/map reads it.

   A Vercel serverless function beside api/infer.js (the Vercel root is `web`): the atlas's data files sit in ../data/
   and web/vercel.json bundles the ones the MBA role read needs (includeFiles). The local python dev server has no
   /api, so the form says the build failed there.

     request   Authorization: Bearer <the session's access token>   (web/auth.js keeps it under maps.session)
               { text, roles: [role ids, the first is the map's role], posting?: the posting's text, campus?: the door's campus }
     response  { ok: true, role: { id, label }, roles, nodes, stories, band }
               401 no_session · 400 text_required | text_too_short | roles_required | too_many_roles | dup_role |
               unknown_role | mixed_fields · 413 · 409 map_by_hand (the owner wrote this person's map; it stays) ·
               503 not_configured (no service key) · 502 upstream (GoTrue or Storage failed)
     GET       { ok: true, key: <whether CATALOG_SERVICE_ROLE_KEY is set>, storage: <whether that key opens the bucket;
               null without a key> }   (a probe, so production can say the key works before anyone signs in)

   Who the person is: GoTrue says (GET /auth/v1/user with the token), never the request body. The résumé text is read
   once, grounded and dropped: the map keeps the lines the read found, as the saved read does (step 3), never the file.
   The service role writes one object, the caller's own; it reads the same object first and refuses to overwrite a map
   the owner made by hand (any build card; a side project the person picked is not one, and a rebuild keeps it). */
"use strict";
const fs = require("fs");
const path = require("path");
const Matcher = require("../match.js");
const EvidenceText = require("../evidence_text.js");
const atlasFactory = require("../atlas.js");
const Apprentice = require("../apprentice.js");
const Quests = require("../quests.js");
const { sameOrigin, send, readBody } = require("./infer.js");

const WEB = path.join(__dirname, "..");
const LIMITS = { body: 200000, text: 40000, minText: 80, posting: 20000, roles: 4, timeoutMs: 8000 };
const ROLE_RE = /^(product\.)?[a-z][a-z0-9_]{1,60}$/;   // product.<family>: the product set's roles (web/atlas.js productKey)
const BUCKET = "maps";

// the project the site talks to, from web/config.js (one source: the browser reads the same file)
function siteConfig(file = path.join(WEB, "config.js")) {
  const text = fs.readFileSync(file, "utf8");
  const val = k => (text.match(new RegExp(`${k}:\\s*"([^"]+)"`)) || [])[1] || "";
  return { url: val("SUPABASE_URL").replace(/\/$/, ""), key: val("SUPABASE_PUBLISHABLE_KEY") };
}
const serviceKey = () => process.env.CATALOG_SERVICE_ROLE_KEY || "";
// The service key's headers (2026-11-06): a new-style secret key (sb_secret_…) is no JWT, so it goes in `apikey` alone
// and the Authorization header stays empty (Supabase, "Migrating to publishable and secret API keys"); the legacy
// service_role JWT goes in both, as before.
const serviceHeaders = key => /^sb_/.test(key) ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` };

// the atlas over the bundled files, once per process
let atlas = null;
function theAtlas() {
  return atlas ||= atlasFactory({ load: url => JSON.parse(fs.readFileSync(path.join(WEB, url), "utf8")), Matcher });
}

// ---------- the request: checked before anything runs ----------
function checkInput(body) {
  const b = body && typeof body === "object" ? body : null;
  if (!b || typeof b.text !== "string") return { error: "text_required", status: 400 };
  const text = b.text.replace(/\u0000/g, "").trim();
  if (text.length < LIMITS.minText) return { error: "text_too_short", status: 400 };
  if (text.length > LIMITS.text) return { error: "text_too_long", status: 413 };
  const roles = Array.isArray(b.roles) ? b.roles.filter(x => typeof x === "string" && ROLE_RE.test(x)) : [];
  if (!roles.length) return { error: "roles_required", status: 400 };
  if (roles.length > LIMITS.roles) return { error: "too_many_roles", status: 400 };
  if (new Set(roles).size !== roles.length) return { error: "dup_role", status: 400 };
  const posting = typeof b.posting === "string" ? b.posting.replace(/\u0000/g, "").trim().slice(0, LIMITS.posting) : "";
  const campus = typeof b.campus === "string" && /^[A-Za-z][A-Za-z .-]{0,39}$/.test(b.campus.trim()) ? b.campus.trim() : null;   // the door's campus, a label at most
  return { text, roles, posting, campus };
}
const bearer = req => { const m = /^Bearer\s+(\S+)$/i.exec(String((req.headers || {}).authorization || "")); return m ? m[1] : null; };

// ---------- the project: who the person is, their map as it stands, the write ----------
async function userOf(token, { fetchImpl = fetch, cfg = siteConfig(), signal } = {}) {
  const r = await fetchImpl(`${cfg.url}/auth/v1/user`, { headers: { apikey: cfg.key, authorization: `Bearer ${token}` }, signal });
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw Object.assign(new Error(`gotrue ${r.status}`), { status: r.status });
  const u = await r.json();
  return u && typeof u.id === "string" && /^[0-9a-f-]{36}$/i.test(u.id) ? { uid: u.id, email: u.email || null } : null;
}
async function readMap(uid, { fetchImpl = fetch, cfg = siteConfig(), key = serviceKey(), signal } = {}) {
  const r = await fetchImpl(`${cfg.url}/storage/v1/object/${BUCKET}/${uid}/map.json`, { headers: serviceHeaders(key), signal });
  if (r.status === 404 || r.status === 400) return null;   // Storage says 400 "Object not found" on some versions, 404 on others
  if (!r.ok) throw Object.assign(new Error(`storage ${r.status}`), { status: r.status });
  try { return await r.json(); } catch { return null; }
}
// the probe behind GET: does the key open the bucket? (its record, not an object; nothing is read or written)
async function probeStorage({ fetchImpl = fetch, cfg = siteConfig(), key = serviceKey(), signal } = {}) {
  if (!key) return null;
  try { const r = await fetchImpl(`${cfg.url}/storage/v1/bucket/${BUCKET}`, { headers: serviceHeaders(key), signal }); return r.ok; }
  catch { return false; }
}
async function writeMap(uid, map, { fetchImpl = fetch, cfg = siteConfig(), key = serviceKey(), signal } = {}) {
  const r = await fetchImpl(`${cfg.url}/storage/v1/object/${BUCKET}/${uid}/map.json`, {
    method: "POST", signal,
    headers: { ...serviceHeaders(key), "content-type": "application/json", "x-upsert": "true" },
    body: JSON.stringify(map),
  });
  if (!r.ok) throw Object.assign(new Error(`storage ${r.status}`), { status: r.status });
  return true;
}

// ---------- the tree: the grounding and the map, for the handler and the tests ----------
async function buildMap({ text, roles, posting }, { A = theAtlas(), campus = null, program = null, date } = {}) {
  const g = await Apprentice.ground({ A, Matcher, EvidenceText }, { profile: text, roles, posting, today: date });
  const { map, stories } = Apprentice.selfServeMap(g, { campus, program, date });
  return { map, stories, g };
}
const summary = (map, stories) => ({ ok: true, role: { id: map.role.id, label: map.role.label }, roles: map.role_class.roles.length, nodes: map.tree.nodes.length, stories, band: map.read.band_label || null });

async function handler(req, res, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch, cfg = deps.cfg || siteConfig(), key = deps.key != null ? deps.key : serviceKey();
  if (req.method === "GET") { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000); try { return send(res, 200, { ok: true, key: !!key, storage: await probeStorage({ fetchImpl, cfg, key, signal: ctl.signal }) }); } finally { clearTimeout(t); } }
  if (req.method !== "POST") { res.setHeader("allow", "GET, POST"); return send(res, 405, { error: "method_not_allowed" }); }
  if (!sameOrigin(req)) return send(res, 403, { error: "cross_origin" });
  if (+((req.headers || {})["content-length"] || 0) > LIMITS.body) return send(res, 413, { error: "body_too_large" });
  if (!key) return send(res, 503, { error: "not_configured" });
  const token = bearer(req);
  if (!token) return send(res, 401, { error: "no_session" });
  let body; try { body = await readBody(req); } catch (e) { return send(res, e.status || 400, { error: e.status === 413 ? "body_too_large" : "bad_json" }); }
  const input = checkInput(body); if (input.error) return send(res, input.status, { error: input.error });
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), LIMITS.timeoutMs);
  try {
    const user = await userOf(token, { fetchImpl, cfg, signal: ctl.signal });
    if (!user) return send(res, 401, { error: "no_session" });
    const before = await readMap(user.uid, { fetchImpl, cfg, key, signal: ctl.signal });
    if (Apprentice.byHand(before)) return send(res, 409, { error: "map_by_hand" });
    let built;
    try { built = await buildMap(input, { A: deps.A, campus: input.campus }); }
    catch (e) { if (e.code) return send(res, 400, { error: e.code }); throw e; }
    built.map = Quests.keepSide(before, built.map);   // a rebuild keeps the side projects the person picked (2026-11-11)
    await writeMap(user.uid, built.map, { fetchImpl, cfg, key, signal: ctl.signal });
    return send(res, 200, summary(built.map, built.stories));
  } catch (e) {
    console.error("tree failed:", e.name === "AbortError" ? "timeout" : e.status || e.message);   // never the request
    return send(res, e.name === "AbortError" ? 504 : 502, { error: e.name === "AbortError" ? "timeout" : "upstream" });
  } finally { clearTimeout(timer); }
}

module.exports = handler;
Object.assign(module.exports, { LIMITS, siteConfig, serviceHeaders, checkInput, bearer, userOf, readMap, probeStorage, writeMap, buildMap, summary, handler });
