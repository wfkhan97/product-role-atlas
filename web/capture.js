/* Capture: the GradBuddy waitlist and anonymous funnel counts (PLAN.md, "The demand-gen pass", step 1).
   A classic script like match.js, loaded before app.js; node requires it for tests/web/capture.test.mjs with its
   dependencies passed in. Two calls, both fire-and-forget, both no-ops when CONFIG.CAPTURE_ENABLED is false:
     Capture.event(name, ctx)             one funnel event: { stage, program, role_id, field_id, surface } and a session id
     Capture.waitlist(email, source, ctx) one application row: the email, where the click was, { role_id, stage, program, fields,
                                          note } (note: the one free-text field, "the role you want, in your words", typed
                                          knowingly into the box, cut at 200 characters; the key is left out when empty)
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
  // The closed lists of sources and event names: the check constraints in pipeline/sql/2026-10-25_capture.sql, extended
  // by 2026-10-26_cohort.sql (the sixth source, `classes`, the class picker's foot) and by 2026-10-31_doors.sql (v19 B7:
  // the native fallback's sources `door` and `intake_<surface>`, the door funnel's events, and the `surface` column).
  const OLD_SOURCES = ["show", "build", "ways", "fit", "start", "classes"];
  const SURFACES = ["skills", "classes", "network"];
  const SOURCES = [...OLD_SOURCES, "door", ...SURFACES.map(s => "intake_" + s)];
  const EVENTS = new Set(["start", "start_stage", "you_done", "resume_read", "explore", "field", "role", "fit", "course_read", "event_prep", "classes", "posting_link", "play", ...OLD_SOURCES.map(s => "waitlist_" + s),
    "door", "door_passed", "home_jobs", "home_skills", "home_classes", "home_network", ...SURFACES.map(s => "intake_" + s)]);
  // the surface a row belongs to (the `surface` column of 2026-10-31_doors.sql); the key leaves the browser only when
  // it is set, so the rows of before that migration are unchanged
  const SURFACE_VALUES = new Set(["door", "jobs", "skills", "classes", "network"]);
  const surfaceOf = v => SURFACE_VALUES.has(v) ? v : null;
  // the event that follows a waitlist row: waitlist_<source> for the six sources of v18; intake_<surface> for an intake
  // box (the row and the event share the name); none for the door, whose screen fires door_passed itself
  const afterEvent = source => source === "door" ? null : source.startsWith("intake_") ? source : "waitlist_" + source;
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
    const row = { name, session: session(), stage: stageOf(ctx.stage), program: str(ctx.program), role_id: str(ctx.role_id), field_id: str(ctx.field_id) };
    const surface = surfaceOf(ctx.surface);
    if (surface) row.surface = surface;
    return post("events", row);
  }
  // one application row, then the matching event (waitlist_<source>); a second click with the same email and source is
  // not a second row: the unique index on lower(email), source refuses it with a 409, which reads as "applied".
  // The note is the one piece of content that leaves the browser, and only because the person typed it into the box.
  function waitlist(email, source, ctx) {
    const e = String(email || "").trim();
    if (!enabled() || !SOURCES.includes(source) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 320) return Promise.resolve(false);
    ctx = ctx || {};
    const fields = Array.isArray(ctx.fields) ? ctx.fields.map(str).filter(Boolean).slice(0, 12) : null;
    const row = { email: e, source, role_id: str(ctx.role_id), stage: stageOf(ctx.stage), program: str(ctx.program), fields };
    const note = ctx.note == null ? "" : String(ctx.note).trim().slice(0, 200);
    if (note) row.note = note;
    const surface = surfaceOf(ctx.surface);
    if (surface) row.surface = surface;
    const after = afterEvent(source);
    return post("waitlist", row, 409).then(ok => { if (after) event(after, ctx); return ok; });
  }
  return { event, waitlist, session, EVENTS, SOURCES, SURFACES: [...SURFACE_VALUES], afterEvent };
});
