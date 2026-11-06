/* Capture: the GradBuddy waitlist and the visitor journey's counts (PLAN.md, "The demand-gen pass", step 1; "The
   visitor journey", step 1). A classic script like match.js, loaded before app.js; node requires it for
   tests/web/capture.test.mjs with its dependencies passed in. Every call is fire-and-forget and a no-op when
   CONFIG.CAPTURE_ENABLED is false:
     Capture.event(name, ctx)             one event: { stage, program, role_id, field_id, surface, cta, ms }, the session id,
                                          the visitor id, the screen on and the signed-in person when there is one
     Capture.waitlist(email, source, ctx) one application row: the email, where the click was, { role_id, stage, program, fields,
                                          note } (note: the one free-text field, "the role you want, in your words", typed
                                          knowingly into the box, cut at 200 characters; the key is left out when empty)
     Capture.screen(name)                 the route on screen; every event after carries it (the drop-off report reads it)
     Capture.cta(id, step, ctx)           cta_shown · cta_click · cta_done for one call to action (the conversion report)
     Capture.action()                     one meaningful action more in this browser (localStorage); returns the count.
                                          The feedback prompt (step 6) reads Capture.actions(); nothing is sent.
     Capture.watch(opts)                  the heartbeat: every thirty seconds of visible, active time, one `heartbeat`
                                          event with the milliseconds since the last (at most a minute); a tab left
                                          open counts nothing. Capture.tick(now) is the pure step, for the tests.
   What leaves the browser is exactly these columns. The resume, the syllabus, a pasted posting, a skill list, a file
   name or anything typed never does; an event carries no text and no skill id (a game's slug rides in role_id for
   `play`). The session id is a random string made once per browser session (sessionStorage); the visitor id one made
   once per browser (localStorage, 2026-11-05), so a return visit reads as one; the signed-in person's id rides along
   once the browser holds a session (web/auth.js). Every error is swallowed: capture never breaks a screen. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;   // node: require("web/capture.js")({ fetch, config, storage, local, user, random })
  else root.Capture = factory({ fetch: (...a) => root.fetch(...a), config: () => root.CONFIG || {}, storage: () => root.sessionStorage, local: () => root.localStorage, user: () => (root.Auth && root.Auth.stored() || {}).uid, random: () => root.crypto && root.crypto.getRandomValues ? root.crypto : null });
})(typeof self !== "undefined" ? self : this, function (deps) {
  "use strict";
  deps = deps || {};
  const cfg = () => { try { return (deps.config && deps.config()) || {}; } catch { return {}; } };
  const enabled = () => { const c = cfg(); return !!(c.CAPTURE_ENABLED && c.SUPABASE_URL && c.SUPABASE_PUBLISHABLE_KEY); };
  // The journey (2026-11-05): the new columns and names wait behind CONFIG.JOURNEY_ENABLED until the owner applies
  // pipeline/sql/2026-11-05_journey.sql, since PostgREST refuses a row whole when it carries a column the table lacks.
  // Off, every call behaves as before that date: the old names, the old keys, no heartbeat, no cta rows.
  const journey = () => !!cfg().JOURNEY_ENABLED;
  // The closed lists of sources and event names. The sources are the check constraint in pipeline/sql/2026-10-25_capture.sql,
  // extended by 2026-10-26_cohort.sql (the sixth source, `classes`), 2026-10-31_doors.sql (the native fallback's sources
  // `door` and `intake_<surface>`) and 2026-11-01_positioning.sql (intake_positioning). The event names were a check
  // constraint too until 2026-11-05_journey.sql, which keeps only their shape in the table: this list is the authority.
  const OLD_SOURCES = ["show", "build", "ways", "fit", "start", "classes"];
  const SURFACES = ["skills", "classes", "network", "positioning"];
  const SOURCES = [...OLD_SOURCES, "door", ...SURFACES.map(s => "intake_" + s)];
  // every route is a screen event (the drop-off report counts the sessions that reach each): the names of before stand
  // for the screens they always meant (explore for the launcher and Explore, event_prep for an event, classes for the
  // picker), and the rest of the routes get their own name (2026-11-05)
  const SCREENS = ["door", "home", "jobs", "skills", "network", "you", "explore", "field", "event", "role", "fit", "course", "play", "about", "classes", "professor", "signin", "map"];
  const SCREEN_EVENT = { skills: "explore", event: "event_prep" };
  const OLD_EVENTS = ["start", "start_stage", "you_done", "resume_read", "explore", "field", "role", "fit", "course_read", "event_prep", "classes", "posting_link", "play", ...OLD_SOURCES.map(s => "waitlist_" + s),
    "door", "door_passed", "home_jobs", "home_skills", "home_classes", "home_network", ...SURFACES.map(s => "intake_" + s)];
  // the journey (2026-11-05): the other screens, the heartbeat, the three steps of a call to action
  const JOURNEY_EVENTS = ["home", "jobs", "network", "you", "course", "about", "professor", "signin", "map", "heartbeat", "cta_shown", "cta_click", "cta_done"];
  const EVENTS = new Set([...OLD_EVENTS, ...JOURNEY_EVENTS]);
  const CTA_STEPS = ["shown", "click", "done"];
  // the surface a row belongs to (the `surface` column of 2026-10-31_doors.sql); the key leaves the browser only when
  // it is set, so the rows of before that migration are unchanged
  const SURFACE_VALUES = new Set(["door", "jobs", "skills", "classes", "network", "positioning"]);
  const surfaceOf = v => SURFACE_VALUES.has(v) ? v : null;
  // the event that follows a waitlist row: waitlist_<source> for the six sources of v18; intake_<surface> for an intake
  // box (the row and the event share the name); none for the door, whose screen fires door_passed itself
  const afterEvent = source => source === "door" ? null : source.startsWith("intake_") ? source : "waitlist_" + source;
  const STAGES = new Set(["looking", "targeting", "curious"]);
  const SESSION_KEY = "capture.session", VISITOR_KEY = "capture.visitor", ACTIONS_KEY = "journey.actions";
  const ID_RE = /^[0-9a-f]{24}$/, SCREEN_RE = /^[a-z][a-z_]{1,23}$/, CTA_RE = /^[a-z][a-z0-9_]{1,31}$/, UID_RE = /^[0-9a-f-]{36}$/i;
  const BEAT_MS = 30000, BEAT_CAP = 60000, IDLE_MS = 60000;
  let memSession = null, memVisitor = null, curScreen = null;
  function randomId() {
    const c = deps.random && deps.random();
    if (c && c.getRandomValues) { const b = new Uint8Array(12); c.getRandomValues(b); return Array.from(b, x => x.toString(16).padStart(2, "0")).join(""); }
    return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  }
  // one id kept under `key` in a store, made once; `mem` holds it for the page when the store is closed (private mode)
  function kept(getStore, key, mem) {
    try { const s = getStore && getStore(); if (s) { let id = s.getItem(key); if (!id || !ID_RE.test(id)) { id = randomId(); s.setItem(key, id); } return id; } } catch { }
    return mem;
  }
  // one id per browser session: sessionStorage when it works, else one for the life of the page
  function session() { return kept(deps.storage, SESSION_KEY, memSession ||= randomId()); }
  // one id per browser: localStorage when it works, else the page's
  function visitor() { return kept(deps.local, VISITOR_KEY, memVisitor ||= randomId()); }
  const str = v => (v == null || v === "") ? null : String(v).slice(0, 80);
  const stageOf = v => STAGES.has(v) ? v : null;
  const userId = () => { try { const u = deps.user && deps.user(); return u && UID_RE.test(String(u)) ? String(u) : null; } catch { return null; } };
  // A plain insert. PostgREST's duplicate-ignoring upsert (on_conflict + resolution=ignore-duplicates) needs select on
  // the table, which the policy withholds on purpose, so a second waitlist click is answered 409 by the unique index
  // instead and `okStatus` says that counts as done.
  function post(table, row, okStatus) {
    const c = cfg();
    const url = `${String(c.SUPABASE_URL).replace(/\/$/, "")}/rest/v1/${table}`;
    return Promise.resolve().then(() => deps.fetch(url, { method: "POST", headers: { "Content-Type": "application/json", apikey: c.SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + c.SUPABASE_PUBLISHABLE_KEY, Prefer: "return=minimal" }, body: JSON.stringify(row), keepalive: true }))
      .then(r => !!(r && (r.ok || (okStatus && r.status === okStatus)))).catch(() => false);
  }
  // the route on screen; every event after carries it. Returns the screen event's name (null off the list).
  function screen(name) {
    curScreen = SCREENS.includes(name) ? name : null;
    return curScreen ? (SCREEN_EVENT[curScreen] || curScreen) : null;
  }
  // one event; resolves true when the row was accepted, false otherwise, never rejects
  function event(name, ctx) {
    if (!enabled() || !EVENTS.has(name)) return Promise.resolve(false);
    ctx = ctx || {};
    const row = { name, session: session(), stage: stageOf(ctx.stage), program: str(ctx.program), role_id: str(ctx.role_id), field_id: str(ctx.field_id) };
    const surface = surfaceOf(ctx.surface);
    if (surface) row.surface = surface;
    if (!journey()) return OLD_EVENTS.includes(name) ? post("events", row) : Promise.resolve(false);
    row.visitor = visitor();
    const scr = SCREEN_RE.test(String(ctx.screen || "")) ? String(ctx.screen) : curScreen;
    if (scr) row.screen = scr;
    const uid = userId();
    if (uid) row.user_id = uid;
    if (CTA_RE.test(String(ctx.cta || ""))) row.cta = String(ctx.cta);
    if (name === "heartbeat") row.ms = Math.max(0, Math.min(BEAT_CAP * 2, Math.round(Number(ctx.ms) || 0)));
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
  // one call to action's step: cta_shown when it draws, cta_click when it is pressed, cta_done when it went through
  function cta(id, step, ctx) {
    if (!CTA_RE.test(String(id || "")) || !CTA_STEPS.includes(step)) return Promise.resolve(false);
    return event("cta_" + step, { ...(ctx || {}), cta: id });
  }
  // the count of meaningful actions in this browser (a role, a fit, a class, a quest or a prep opened); nothing is sent
  function actions() { try { const s = deps.local && deps.local(); const n = s ? parseInt(s.getItem(ACTIONS_KEY), 10) : NaN; return Number.isFinite(n) && n >= 0 ? n : 0; } catch { return 0; } }
  function action() { const n = actions() + 1; try { const s = deps.local && deps.local(); if (s) s.setItem(ACTIONS_KEY, String(n)); } catch { } return n; }

  // ---------- the heartbeat ----------
  // `tick(now, visible, lastActive)` is the pure step: with the page visible and an input within the last minute, the
  // visible time since the last tick accrues; when the accrued time reaches thirty seconds, one heartbeat goes with it
  // (capped at a minute). Hidden or idle time never accrues. `watch` wires it to the document and a timer.
  const beat = { last: null, acc: 0 };
  function tick(now, visible, lastActive) {
    if (beat.last == null) { beat.last = now; return null; }
    const dt = Math.max(0, now - beat.last); beat.last = now;
    if (visible && lastActive != null && now - lastActive <= IDLE_MS) beat.acc += dt;
    if (beat.acc < BEAT_MS) return null;
    const ms = Math.min(BEAT_CAP, beat.acc); beat.acc = 0;
    event("heartbeat", { ms });
    return ms;
  }
  let watching = false;
  function watch(opts) {
    if (watching) return; watching = true;
    opts = opts || {};
    const doc = opts.document || (typeof document !== "undefined" ? document : null);
    const now = opts.now || (() => Date.now());
    const every = opts.setInterval || ((f, ms) => setInterval(f, ms));
    if (!doc) return;
    let lastActive = now();
    const active = () => { lastActive = now(); };
    for (const ev of ["pointerdown", "keydown", "scroll", "touchstart"]) doc.addEventListener(ev, active, { passive: true });
    doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "visible") active(); beat.last = now(); });
    every(() => tick(now(), doc.visibilityState === "visible", lastActive), opts.interval || 5000);
  }
  return { event, waitlist, session, visitor, screen, cta, action, actions, tick, watch, EVENTS, OLD_EVENTS, JOURNEY_EVENTS, SOURCES, SCREENS, SURFACES: [...SURFACE_VALUES], afterEvent, BEAT_MS, BEAT_CAP, IDLE_MS };
});
