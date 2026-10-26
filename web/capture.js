/* Capture: the GradBuddy waitlist and anonymous funnel counts (PLAN.md, "The demand-gen pass", step 1).
   A classic script like match.js, loaded before app.js; node requires it for tests/web/capture.test.mjs with its
   dependencies passed in. Two calls, both fire-and-forget, both no-ops when CONFIG.CAPTURE_ENABLED is false:
     Capture.event(name, ctx)             one funnel event: { stage, program, role_id, field_id } and a session id
     Capture.waitlist(email, source, ctx) one waitlist row: the email, where the click was, { role_id, stage, program, fields }
   What leaves the browser is exactly these columns. The resume, the syllabus, a pasted posting, a skill list, a file
   name or anything typed never does; an event carries no text and no skill id (a game's slug rides in role_id for
   `play`). The session id is a random string made once per browser session (sessionStorage, in try/catch), never
   written anywhere else and never joined to an email. Every error is swallowed: capture never breaks a screen. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;   // node: require("web/capture.js")({ fetch, config, storage, random })
  else root.Capture = factory({ fetch: (...a) => root.fetch(...a), config: () => root.CONFIG || {}, storage: () => root.sessionStorage, random: () => root.crypto && root.crypto.getRandomValues ? root.crypto : null });
})(typeof self !== "undefined" ? self : this, function (deps) {
  "use strict";
  deps = deps || {};
  const cfg = () => { try { return (deps.config && deps.config()) || {}; } catch { return {}; } };
  const enabled = () => { const c = cfg(); return !!(c.CAPTURE_ENABLED && c.SUPABASE_URL && c.SUPABASE_PUBLISHABLE_KEY); };
  // the closed list of event names (the same check constraint is in pipeline/sql/2026-10-25_capture.sql)
  const SOURCES = ["show", "build", "ways", "fit", "start"];
  const EVENTS = new Set(["start", "start_stage", "you_done", "resume_read", "explore", "field", "role", "fit", "course_read", "event_prep", "classes", "posting_link", "play", ...SOURCES.map(s => "waitlist_" + s)]);
  const STAGES = new Set(["looking", "targeting", "curious"]);
  const SESSION_KEY = "capture.session";
  let memSession = null;
  function randomId() {
    const c = deps.random && deps.random();
    if (c && c.getRandomValues) { const b = new Uint8Array(12); c.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, "0")).join(""); }
    return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  }
  // one id per browser session: sessionStorage when it works, else one for the life of the page
  function session() {
    try { const s = deps.storage && deps.storage(); if (s) { let id = s.getItem(SESSION_KEY); if (!id || !/^[0-9a-f]{24}$/.test(id)) { id = randomId(); s.setItem(SESSION_KEY, id); } return id; } } catch { }
    return memSession ||= randomId();
  }
  const str = v => (v == null || v === "") ? null : String(v).slice(0, 80);
  const stageOf = v => STAGES.has(v) ? v : null;
  // A plain insert. PostgREST's duplicate-ignoring upsert (on_conflict + resolution=ignore-duplicates) needs select on
  // the table, which the policy withholds on purpose, so a second waitlist click is answered 409 by the unique index
  // instead and `okStatus` says that counts as done.
  function post(table, row, okStatus) {
    const c = cfg();
    const url = `${String(c.SUPABASE_URL).replace(/\/$/, "")}/rest/v1/${table}`;
    return Promise.resolve().then(() => deps.fetch(url, { method: "POST", headers: { "Content-Type": "application/json", apikey: c.SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + c.SUPABASE_PUBLISHABLE_KEY, Prefer: "return=minimal" }, body: JSON.stringify(row), keepalive: true }))
      .then(r => !!(r && (r.ok || (okStatus && r.status === okStatus)))).catch(() => false);
  }
  // one funnel event; resolves true when the row was accepted, false otherwise, never rejects
  function event(name, ctx) {
    if (!enabled() || !EVENTS.has(name)) return Promise.resolve(false);
    ctx = ctx || {};
    return post("events", { name, session: session(), stage: stageOf(ctx.stage), program: str(ctx.program), role_id: str(ctx.role_id), field_id: str(ctx.field_id) });
  }
  // one waitlist row, then the matching event (waitlist_<source>); a second click with the same email and source is
  // not a second row: the unique index on lower(email), source refuses it with a 409, which reads as "on the list"
  function waitlist(email, source, ctx) {
    const e = String(email || "").trim();
    if (!enabled() || !SOURCES.includes(source) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 320) return Promise.resolve(false);
    ctx = ctx || {};
    const fields = Array.isArray(ctx.fields) ? ctx.fields.map(str).filter(Boolean).slice(0, 12) : null;
    const row = { email: e, source, role_id: str(ctx.role_id), stage: stageOf(ctx.stage), program: str(ctx.program), fields };
    return post("waitlist", row, 409).then(ok => { event("waitlist_" + source, ctx); return ok; });
  }
  return { event, waitlist, session, EVENTS, SOURCES };
});
