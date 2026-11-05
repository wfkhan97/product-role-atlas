// web/capture.js: the waitlist and the funnel counts, with fetch, the config and sessionStorage replaced.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web } from "./_load.mjs";

const factory = require(path.join(web, "capture.js"));
const CFG = { SUPABASE_URL: "https://x.supabase.co/", SUPABASE_PUBLISHABLE_KEY: "pk", CAPTURE_ENABLED: true, JOURNEY_ENABLED: true };
const OLD_CFG = { ...CFG, JOURNEY_ENABLED: false };   // before 2026-11-05_journey.sql is applied
const memStorage = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
// a Capture over a recording fetch: calls[] holds { url, init, body }; `local` is the browser-wide store (the visitor id,
// the action count), `user` the signed-in person's id when the browser holds a session
function make(opts = {}) {
  const calls = [];
  const fetch = opts.fetch || (async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: true }; });
  const storage = opts.storage === null ? () => null : () => (opts.storage || make.store || (make.store = memStorage()));
  const local = opts.local === null ? () => null : () => (opts.local || make.local || (make.local = memStorage()));
  const C = factory({ fetch, config: () => opts.config || CFG, storage, local, user: () => opts.user || null, random: () => null });
  return { C, calls };
}

test("every call is a no-op when CAPTURE_ENABLED is false: nothing is fetched and the promise resolves false", async () => {
  const { C, calls } = make({ config: { ...CFG, CAPTURE_ENABLED: false }, storage: memStorage() });
  assert.equal(await C.event("start", { stage: "looking" }), false);
  assert.equal(await C.waitlist("a@b.co", "fit", {}), false);
  assert.equal(calls.length, 0);
});

test("an event posts exactly name, session, visitor, stage, program, role_id and field_id to the events table with the publishable key", async () => {
  const { C, calls } = make({ storage: memStorage(), local: memStorage() });
  assert.equal(await C.event("role", { stage: "targeting", program: "business", role_id: "fpa", resume: "SECRET", skills: ["x"] }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/events");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.apikey, "pk");
  assert.equal(calls[0].init.headers.Authorization, "Bearer pk");
  assert.deepEqual(Object.keys(calls[0].body).sort(), ["field_id", "name", "program", "role_id", "session", "stage", "visitor"], "no other key leaves the browser");
  assert.deepEqual({ ...calls[0].body, session: "…", visitor: "…" }, { name: "role", session: "…", visitor: "…", stage: "targeting", program: "business", role_id: "fpa", field_id: null });
  assert.match(calls[0].body.session, /^[0-9a-f]{24}$/);
  assert.match(calls[0].body.visitor, /^[0-9a-f]{24}$/);
});

// ---------- the journey (2026-11-05): the visitor, the screen, the signed-in person, the calls to action, the heartbeat ----------
test("with JOURNEY_ENABLED off, an event is the row of before: the old keys only, the new names, the cta and the heartbeat send nothing", async () => {
  const { C, calls } = make({ config: OLD_CFG, storage: memStorage(), local: memStorage(), user: "11111111-1111-4111-8111-111111111111" });
  C.screen("role");
  assert.equal(await C.event("role", { role_id: "pmm", cta: "heart" }), true);
  assert.deepEqual(Object.keys(calls[0].body).sort(), ["field_id", "name", "program", "role_id", "session", "stage"], "no visitor, screen, user_id or cta");
  assert.equal(await C.event("home"), false, "a journey name waits for the migration");
  assert.equal(await C.cta("heart", "shown"), false);
  let t = 0; C.tick(t, true, t); for (let i = 0; i < 7; i++) { t += 5000; C.tick(t, true, t); }
  await new Promise(r => setTimeout(r, 0));
  assert.equal(calls.length, 1, "no heartbeat row");
  assert.equal(C.action(), 1, "the action count is the browser's and needs no table");
});

test("the visitor id lives in localStorage across sessions; without it the page keeps one; a signed-in id rides along only when it is a uuid", async () => {
  const local = memStorage();
  const a = make({ storage: memStorage(), local }), b = make({ storage: memStorage(), local });
  await a.C.event("home"); await b.C.event("home");
  assert.equal(a.calls[0].body.visitor, b.calls[0].body.visitor, "the same browser, two sessions, one visitor");
  assert.notEqual(a.calls[0].body.session, b.calls[0].body.session);
  const c = make({ storage: memStorage(), local: null });
  assert.equal(c.C.visitor(), c.C.visitor());
  const u = make({ storage: memStorage(), local: memStorage(), user: "11111111-1111-4111-8111-111111111111" });
  await u.C.event("map");
  assert.equal(u.calls[0].body.user_id, "11111111-1111-4111-8111-111111111111");
  const bad = make({ storage: memStorage(), local: memStorage(), user: "not-a-uuid" });
  await bad.C.event("map");
  assert.ok(!("user_id" in bad.calls[0].body), "a malformed id never leaves");
});

test("screen(name) names the route's event and every event after carries the screen; a route off the list sends nothing", async () => {
  const { C, calls } = make({ storage: memStorage(), local: memStorage() });
  assert.equal(C.screen("skills"), "explore", "the launcher sends Explore's event");
  assert.equal(C.screen("event"), "event_prep");
  assert.equal(C.screen("role"), "role");
  await C.event("role", { role_id: "pmm" }); await C.event("posting_link", { role_id: "pmm" });
  assert.equal(calls[0].body.screen, "role"); assert.equal(calls[1].body.screen, "role");
  assert.equal(C.screen("nope"), null);
  await C.event("home");
  assert.ok(!("screen" in calls[2].body), "an unknown route clears the screen");
  await C.event("home", { screen: "about" });
  assert.equal(calls[3].body.screen, "about", "a screen given with the event wins");
  for (const s of C.SCREENS) assert.ok(C.EVENTS.has(s === "skills" ? "explore" : s === "event" ? "event_prep" : s), `${s} has an event`);
});

test("cta(id, step) sends cta_<step> with the id; an unknown step or a malformed id sends nothing", async () => {
  const { C, calls } = make({ storage: memStorage(), local: memStorage() });
  assert.equal(await C.cta("intake_skills", "shown", { surface: "skills" }), true);
  assert.deepEqual([calls[0].body.name, calls[0].body.cta, calls[0].body.surface], ["cta_shown", "intake_skills", "skills"]);
  assert.equal(await C.cta("heart", "done"), true);
  assert.equal(calls[1].body.name, "cta_done");
  assert.equal(await C.cta("heart", "hover"), false);
  assert.equal(await C.cta("Heart me", "shown"), false);
  assert.equal(calls.length, 2);
  await C.event("role", { cta: "x y" });
  assert.ok(!("cta" in calls[2].body), "a malformed cta on a plain event is dropped");
});

test("action() counts in localStorage and sends nothing; actions() reads it, zero when the store is closed", async () => {
  const local = memStorage();
  const { C, calls } = make({ storage: memStorage(), local });
  assert.equal(C.actions(), 0);
  assert.equal(C.action(), 1); assert.equal(C.action(), 2);
  assert.equal(make({ storage: memStorage(), local }).C.actions(), 2, "the count is the browser's, not the page's");
  assert.equal(calls.length, 0);
  assert.equal(make({ storage: memStorage(), local: null }).C.actions(), 0);
});

test("tick: visible, active time accrues; thirty seconds of it sends one heartbeat with the milliseconds, capped at a minute; hidden or idle time never counts", async () => {
  const { C, calls } = make({ storage: memStorage(), local: memStorage() });
  C.screen("role");
  let t = 1000;
  assert.equal(C.tick(t, true, t), null, "the first tick only starts the clock");
  for (let i = 0; i < 5; i++) { t += 5000; assert.equal(C.tick(t, true, t), null); }   // 25 s visible
  t += 5000; assert.equal(C.tick(t, true, t), 30000, "30 s reached: one beat");
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual([calls[0].body.name, calls[0].body.ms, calls[0].body.screen], ["heartbeat", 30000, "role"]);
  for (let i = 0; i < 12; i++) { t += 5000; assert.equal(C.tick(t, false, t), null); }    // a minute hidden: nothing
  for (let i = 0; i < 12; i++) { t += 5000; assert.equal(C.tick(t, true, t - 90000), null); }   // a minute visible but idle: nothing
  for (let i = 0; i < 20; i++) { t += 5000; C.tick(t, true, t); }                           // 100 s visible and active: beats of 30, 30, 30
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(calls.map(c => c.body.ms), [30000, 30000, 30000, 30000]);
  t += 200000; assert.equal(C.tick(t, true, t), 60000, "one long gap counts at most a minute");
});

test("an unknown event name and an unknown stage are not sent as such", async () => {
  const { C, calls } = make({ storage: memStorage() });
  assert.equal(await C.event("resume_text", { stage: "looking" }), false, "only the closed list of names");
  assert.equal(calls.length, 0);
  await C.event("explore", { stage: "whatever" });
  assert.equal(calls[0].body.stage, null, "a stage outside looking · targeting · curious is null");
});

test("the session id is stable within a session and differs between sessions", async () => {
  const s = memStorage();
  const a = make({ storage: s }), b = make({ storage: s }), other = make({ storage: memStorage() });
  assert.equal(a.C.session(), a.C.session());
  assert.equal(a.C.session(), b.C.session(), "the same sessionStorage gives the same id");
  assert.notEqual(a.C.session(), other.C.session());
  await a.C.event("start"); await a.C.event("explore");
  assert.equal(a.calls[0].body.session, a.calls[1].body.session);
});

test("without sessionStorage (private mode, a throwing accessor) the id still exists and holds for the page", async () => {
  const { C } = make({ storage: null });
  assert.match(C.session(), /^[0-9a-f]{24}$/);
  assert.equal(C.session(), C.session());
  const throwing = factory({ fetch: async () => ({ ok: true }), config: () => CFG, storage: () => { throw new Error("blocked"); } });
  assert.match(throwing.session(), /^[0-9a-f]{24}$/);
});

test("a waitlist click posts the email, the source and the context as a plain insert, then fires waitlist_<source>", async () => {
  const { C, calls } = make({ storage: memStorage() });
  assert.equal(await C.waitlist("  Someone@Cornell.edu ", "show", { role_id: "fpa", stage: "looking", program: "business", fields: ["finance", "consulting"], resume: "SECRET" }), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/waitlist", "no on_conflict: the duplicate-ignoring upsert needs select, which anon does not have");
  assert.equal(calls[0].init.headers.Prefer, "return=minimal");
  assert.deepEqual(calls[0].body, { email: "Someone@Cornell.edu", source: "show", role_id: "fpa", stage: "looking", program: "business", fields: ["finance", "consulting"] });
  assert.equal(calls[1].body.name, "waitlist_show");
  assert.equal(calls[1].body.role_id, "fpa");
  assert.equal(calls[1].url, "https://x.supabase.co/rest/v1/events");
});

test("the sentence the person typed goes out as `note`, trimmed and cut at 200 characters; an empty one leaves the key out", async () => {
  const { C, calls } = make({ storage: memStorage() });
  await C.waitlist("a@b.co", "classes", { role_id: "fpa", note: "  Product manager at a climate startup  " });
  assert.equal(calls[0].body.note, "Product manager at a climate startup");
  assert.equal(calls[0].body.source, "classes", "the class picker's foot is a source");
  assert.equal(calls[1].body.name, "waitlist_classes");
  assert.equal("note" in calls[1].body, false, "the event carries no text");
  await C.waitlist("a@b.co", "start", { note: "   " });
  assert.equal("note" in calls[2].body, false, "an empty sentence is not a key");
  await C.waitlist("a@b.co", "fit", {});
  assert.equal("note" in calls[4].body, false, "no sentence, no key");
  await C.waitlist("a@b.co", "show", { note: "x".repeat(250) });
  assert.equal(calls[6].body.note.length, 200, "cut at 200 characters, the column's check");
});

test("a second click with the same email and source is answered 409 by the unique index and still reads as joined", async () => {
  const dup = make({ fetch: async url => ({ ok: false, status: url.includes("/waitlist") ? 409 : 201 }), storage: memStorage() });
  assert.equal(await dup.C.waitlist("a@b.co", "fit"), true);
  const refused = make({ fetch: async () => ({ ok: false, status: 401 }), storage: memStorage() });
  assert.equal(await refused.C.waitlist("a@b.co", "fit"), false, "any other refusal is not joined");
  assert.equal(await refused.C.event("start"), false, "an event never treats a 409 as done");
  const ev409 = make({ fetch: async () => ({ ok: false, status: 409 }), storage: memStorage() });
  assert.equal(await ev409.C.event("start"), false);
});

test("a waitlist call with a bad email or an unknown source sends nothing", async () => {
  const { C, calls } = make({ storage: memStorage() });
  assert.equal(await C.waitlist("not an email", "show", {}), false);
  assert.equal(await C.waitlist("a@b.co", "footer", {}), false);
  assert.equal(await C.waitlist("", "fit", {}), false);
  assert.equal(calls.length, 0);
});

test("an error from fetch, or a response that is not ok, never throws: the promise resolves false", async () => {
  const boom = make({ fetch: async () => { throw new TypeError("Failed to fetch"); }, storage: memStorage() });
  assert.equal(await boom.C.event("start"), false);
  assert.equal(await boom.C.waitlist("a@b.co", "fit"), false);
  const sync = factory({ fetch: () => { throw new Error("sync"); }, config: () => CFG, storage: memStorage, random: () => null });
  assert.equal(await sync.event("start"), false);
  const notOk = make({ fetch: async () => ({ ok: false, status: 401 }), storage: memStorage() });
  assert.equal(await notOk.C.event("start"), false);
});

test("the names and the sources the script accepts are the ones the migrations allow (the latest definition wins)", async () => {
  const fs = await import("fs");
  const dir = path.join(web, "..", "pipeline", "sql");
  const files = fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}_(capture|cohort|doors|positioning|journey)\.sql$/.test(f)).sort();
  assert.deepEqual(files, ["2026-10-25_capture.sql", "2026-10-26_cohort.sql", "2026-10-31_doors.sql", "2026-11-01_positioning.sql", "2026-11-05_journey.sql"]);
  const list = (sql, col) => { const m = [...sql.matchAll(new RegExp(col + " in \\(([^)]*)\\)", "g"))]; return m.length ? [...m[m.length - 1][1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]) : null; };
  let names = null, sources = null;
  for (const f of files) { const sql = fs.readFileSync(path.join(dir, f), "utf8"); names = list(sql, "name") || names; sources = list(sql, "source") || sources; }
  const { C } = make({ storage: memStorage() });
  // the last closed list of names (2026-11-01) is exactly the old list; the journey migration keeps only a shape,
  // which every name, old and new, must match
  assert.deepEqual([...C.OLD_EVENTS].sort(), [...names].sort());
  const journey = fs.readFileSync(path.join(dir, "2026-11-05_journey.sql"), "utf8");
  const shape = new RegExp(/name ~ '([^']+)'/.exec(journey)[1]);
  for (const n of C.EVENTS) assert.match(n, shape, `${n} fits the table's shape`);
  assert.deepEqual([...C.SOURCES].sort(), [...sources].sort());
  assert.ok(C.SOURCES.includes("classes") && C.EVENTS.has("waitlist_classes"));
  assert.ok(C.SOURCES.includes("door") && C.SOURCES.includes("intake_network") && C.EVENTS.has("door_passed") && C.EVENTS.has("home_jobs"));
  assert.ok(C.SOURCES.includes("intake_positioning") && C.EVENTS.has("intake_positioning"), "the positioning box (2026-11-01)");
});

test("surface leaves the browser only when the screen gives one of the five, on events and on waitlist rows alike", async () => {
  const { C, calls } = make({ storage: memStorage() });
  await C.event("home_jobs", { surface: "jobs" });
  assert.equal(calls[0].body.surface, "jobs");
  await C.event("explore", {});
  assert.equal("surface" in calls[1].body, false, "no surface, no key: the rows of before 2026-10-31_doors.sql are unchanged");
  await C.event("explore", { surface: "footer" });
  assert.equal("surface" in calls[2].body, false, "a surface outside the five is not sent");
  await C.waitlist("a@b.co", "intake_skills", { surface: "skills", role_id: "pm" });
  assert.equal(calls[3].body.surface, "skills");
  assert.equal(calls[3].body.source, "intake_skills");
});

test("the event after a waitlist row: waitlist_<source> for the six of v18, intake_<surface> for an intake box, none for the door", async () => {
  const { C, calls } = make({ storage: memStorage() });
  assert.equal(C.afterEvent("fit"), "waitlist_fit");
  assert.equal(C.afterEvent("intake_classes"), "intake_classes");
  assert.equal(C.afterEvent("door"), null);
  await C.waitlist("a@b.co", "intake_classes", { surface: "classes" });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.name, "intake_classes");
  assert.equal(calls[1].body.surface, "classes");
  await C.waitlist("a@b.co", "door", { surface: "door", program: "cs" });
  assert.equal(calls.length, 3, "the door row fires no event: the door screen fires door_passed itself");
  assert.equal(calls[2].body.source, "door");
});
