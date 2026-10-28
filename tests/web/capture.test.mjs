// web/capture.js: the waitlist and the funnel counts, with fetch, the config and sessionStorage replaced.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web } from "./_load.mjs";

const factory = require(path.join(web, "capture.js"));
const CFG = { SUPABASE_URL: "https://x.supabase.co/", SUPABASE_PUBLISHABLE_KEY: "pk", CAPTURE_ENABLED: true };
const memStorage = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
// a Capture over a recording fetch: calls[] holds { url, init, body }
function make(opts = {}) {
  const calls = [];
  const fetch = opts.fetch || (async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: true }; });
  const storage = opts.storage === null ? () => null : () => (opts.storage || make.store || (make.store = memStorage()));
  const C = factory({ fetch, config: () => opts.config || CFG, storage, random: () => null });
  return { C, calls };
}

test("every call is a no-op when CAPTURE_ENABLED is false: nothing is fetched and the promise resolves false", async () => {
  const { C, calls } = make({ config: { ...CFG, CAPTURE_ENABLED: false }, storage: memStorage() });
  assert.equal(await C.event("start", { stage: "looking" }), false);
  assert.equal(await C.waitlist("a@b.co", "fit", {}), false);
  assert.equal(calls.length, 0);
});

test("an event posts exactly name, session, stage, program, role_id and field_id to the events table with the publishable key", async () => {
  const { C, calls } = make({ storage: memStorage() });
  assert.equal(await C.event("role", { stage: "targeting", program: "business", role_id: "fpa", resume: "SECRET", skills: ["x"] }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/events");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.apikey, "pk");
  assert.equal(calls[0].init.headers.Authorization, "Bearer pk");
  assert.deepEqual(Object.keys(calls[0].body).sort(), ["field_id", "name", "program", "role_id", "session", "stage"], "no other key leaves the browser");
  assert.deepEqual({ ...calls[0].body, session: "…" }, { name: "role", session: "…", stage: "targeting", program: "business", role_id: "fpa", field_id: null });
  assert.match(calls[0].body.session, /^[0-9a-f]{24}$/);
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
  const files = fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}_(capture|cohort)\.sql$/.test(f)).sort();
  assert.deepEqual(files, ["2026-10-25_capture.sql", "2026-10-26_cohort.sql"]);
  const list = (sql, col) => { const m = [...sql.matchAll(new RegExp(col + " in \\(([^)]*)\\)", "g"))]; return m.length ? [...m[m.length - 1][1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]) : null; };
  let names = null, sources = null;
  for (const f of files) { const sql = fs.readFileSync(path.join(dir, f), "utf8"); names = list(sql, "name") || names; sources = list(sql, "source") || sources; }
  const { C } = make({ storage: memStorage() });
  assert.deepEqual([...C.EVENTS].sort(), [...names].sort());
  assert.deepEqual([...C.SOURCES].sort(), [...sources].sort());
  assert.ok(C.SOURCES.includes("classes") && C.EVENTS.has("waitlist_classes"));
});

// ---------- the test switch: a 400 on a row the unmigrated table refuses is retried in the older shape ----------
test("with CATALOG_OPEN on, a waitlist row refused with a 400 is sent again without the note and with classes as start, and lastFallback says what was dropped", async () => {
  const calls = [];
  const fetch = async (url, init) => { const body = JSON.parse(init.body); calls.push({ url, body }); if (url.endsWith("/waitlist") && (body.note || body.source === "classes")) return { ok: false, status: 400, json: async () => ({ message: "Could not find the 'note' column of 'waitlist' in the schema cache" }) }; return { ok: true }; };
  const { C } = make({ fetch, config: { ...CFG, CATALOG_OPEN: true }, storage: memStorage() });
  assert.equal(await C.waitlist("a@b.co", "classes", { note: "operations manager", role_id: "pmm" }), true);
  const w = calls.filter(c => c.url.endsWith("/waitlist"));
  assert.equal(w.length, 2, "one refused post, one retry");
  assert.equal(w[0].body.note, "operations manager"); assert.equal(w[0].body.source, "classes");
  assert.equal(w[1].body.note, undefined); assert.equal(w[1].body.source, "start"); assert.equal(w[1].body.role_id, "pmm");
  assert.deepEqual(C.lastFallback(), { dropped: ["the sentence", "source classes (sent as start)"] });
  assert.equal(C.lastError(), null, "the retry succeeded");
});

test("with CATALOG_OPEN off, the same 400 is not retried, the call resolves false and lastError carries the status and message", async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push(url); if (url.endsWith("/waitlist")) return { ok: false, status: 400, json: async () => ({ message: "no such column" }) }; return { ok: true }; };
  const { C } = make({ fetch, config: { ...CFG, CATALOG_OPEN: false }, storage: memStorage() });
  assert.equal(await C.waitlist("a@b.co", "fit", { note: "x" }), false);
  assert.equal(calls.filter(u => u.endsWith("/waitlist")).length, 1);
  assert.deepEqual(C.lastError(), { table: "waitlist", status: 400, message: "no such column" });
  assert.equal(C.lastFallback(), null);
});
