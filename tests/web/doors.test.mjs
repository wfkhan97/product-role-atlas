// web/doors.js: the door and the intake boxes as Tally forms with the native fallback (v19 B7). The names it adds are
// in capture.js's lists and in the doors migration's two check lists; the embed carries every hidden field and no
// variant; the fallback clock, the Tally return and the native submit are pure.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web, root } from "./_load.mjs";

const doorsFactory = require(path.join(web, "doors.js"));
const captureFactory = require(path.join(web, "capture.js"));
const CFG = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "pk", CAPTURE_ENABLED: true, TALLY: { door: "wDoor1", intake: "wIntake" } };
const memStorage = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const makeCapture = () => { const calls = []; const C = captureFactory({ fetch: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true }; }, config: () => CFG, storage: memStorage, random: () => null }); return { C, calls }; };
const Doors = doorsFactory({ config: () => CFG, capture: () => null, now: () => 0 });
// the two check lists of the migrations, parsed from their text: the doors migration, then the positioning one
// (2026-11-01), whose lists replace it
const sql = fs.readFileSync(path.join(root, "pipeline", "sql", "2026-10-31_doors.sql"), "utf8");
const latest = fs.readFileSync(path.join(root, "pipeline", "sql", "2026-11-01_positioning.sql"), "utf8");
const list = (col, text = latest) => { const m = [...text.matchAll(new RegExp(col + " in \\(([^)]*)\\)", "g"))]; return [...m[m.length - 1][1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]); };
const SQL_NAMES = list("name"), SQL_SOURCES = list("source");

test("NAMES: every event and source is in capture.js's lists and in the migration's two check lists; no variant anywhere", () => {
  assert.deepEqual(Doors.NAMES.events, ["door", "door_passed", "home_jobs", "home_skills", "home_classes", "home_network", "intake_skills", "intake_classes", "intake_network", "intake_positioning"]);
  assert.deepEqual(Doors.NAMES.sources, ["door", "intake_skills", "intake_classes", "intake_network", "intake_positioning"]);
  for (const k of list("name", sql)) assert.ok(SQL_NAMES.includes(k), `the positioning migration keeps ${k}`);
  for (const k of list("source", sql)) assert.ok(SQL_SOURCES.includes(k), `the positioning migration keeps ${k}`);
  const { C } = makeCapture();
  for (const e of Doors.NAMES.events) { assert.ok(C.EVENTS.has(e), `capture EVENTS has ${e}`); assert.ok(SQL_NAMES.includes(e), `events_name_check has ${e}`); }
  for (const s of Doors.NAMES.sources) { assert.ok(C.SOURCES.includes(s), `capture SOURCES has ${s}`); assert.ok(SQL_SOURCES.includes(s), `waitlist_source_check has ${s}`); }
  for (const old of ["waitlist_classes", "play", "start"]) assert.ok(SQL_NAMES.includes(old), `the old name ${old} stays`);
  for (const old of ["show", "build", "ways", "fit", "start", "classes"]) assert.ok(SQL_SOURCES.includes(old), `the old source ${old} stays`);
  assert.equal(/variant/i.test(sql), false, "no variant column");
  assert.equal(/variant/i.test(fs.readFileSync(path.join(web, "doors.js"), "utf8")), false, "no variant in the module");
  assert.ok(/add column if not exists surface text/.test(sql) && (sql.match(/add column if not exists surface/g) || []).length === 2, "surface on both tables");
});

test("embedHtml: Tally's embed URL with the four display options and every hidden field, the email pre-filled, no variant", () => {
  const html = Doors.embedHtml("intake_skills", { hidden: { role: "pm", email: "a@b.co" } });
  assert.match(html, /^<iframe data-tally-src="https:\/\/tally\.so\/embed\/wIntake\?/);
  assert.match(html, /loading="lazy"/);
  for (const opt of ["alignLeft=1", "hideTitle=1", "transparentBackground=1", "dynamicHeight=1"]) assert.ok(html.includes(opt), opt);
  const src = html.match(/data-tally-src="([^"]+)"/)[1].replace(/&amp;/g, "&");
  const q = new URLSearchParams(src.split("?")[1]);
  assert.deepEqual(Doors.HIDDEN, ["surface", "source", "role", "email"]);
  for (const k of Doors.HIDDEN) assert.ok(q.has(k), `hidden field ${k}`);
  assert.deepEqual([q.get("surface"), q.get("source"), q.get("role"), q.get("email")], ["skills", "intake_skills", "pm", "a@b.co"]);
  assert.equal(q.has("variant"), false);
  const door = Doors.embedHtml("door", { hidden: { email: "" } });
  assert.match(door, /tally\.so\/embed\/wDoor1\?/);
  const dq = new URLSearchParams(door.match(/data-tally-src="([^"]+)"/)[1].replace(/&amp;/g, "&").split("?")[1]);
  assert.deepEqual([dq.get("surface"), dq.get("source"), dq.get("role"), dq.get("email")], ["door", "door", "", ""], "the fields exist even when empty");
  assert.equal(Doors.embedHtml("intake_classes", { formId: "abc123" }).includes("/embed/abc123?"), true, "an explicit id wins");
  assert.equal(Doors.embedHtml("intake_network", { hidden: { email: '"><script>' } }).includes("<script"), false, "attributes are escaped");
  assert.equal(Doors.embedHtml("footer", {}), "", "an unknown kind draws nothing");
  const unset = doorsFactory({ config: () => ({ TALLY: { door: null, intake: null } }) });
  assert.equal(unset.embedHtml("door", {}), "", "no id, no embed: the native form renders");
  assert.equal(unset.formIdFor("intake_skills"), null);
});

test("kinds: the surface, the source and the submitted event of each", () => {
  assert.deepEqual(Doors.KINDS, ["door", "intake_skills", "intake_classes", "intake_network", "intake_positioning"]);
  assert.equal(Doors.kindOf("positioning"), "intake_positioning"); assert.equal(Doors.surfaceOf("intake_positioning"), "positioning");
  assert.equal(Doors.formIdFor("intake_positioning"), "wIntake", "the new kind falls back to the shared intake form until it has its own");
  assert.equal(Doors.surfaceOf("door"), "door"); assert.equal(Doors.surfaceOf("intake_classes"), "classes"); assert.equal(Doors.surfaceOf("x"), null);
  assert.equal(Doors.kindOf("network"), "intake_network"); assert.equal(Doors.kindOf("door"), "door"); assert.equal(Doors.kindOf("jobs"), null, "Find jobs has no intake box");
  assert.equal(Doors.submittedEvent("door"), "door_passed"); assert.equal(Doors.submittedEvent("intake_skills"), "intake_skills"); assert.equal(Doors.submittedEvent("x"), null);
});

// the shape since 2026-11-01: a light and a dark form per kind, each intake kind with its own line
const PAIRS = { door: { light: "dLight", dark: "dDark" }, intake_skills: { light: "sLight", dark: "sDark" }, intake_classes: { light: "cLight", dark: "cDark" }, intake_network: { light: "nLight", dark: "nDark" } };
test("formIdFor: the kind's form for the theme; a kind with no entry takes intake_skills' pair; the flat shape of the first cut still works", () => {
  const D = doorsFactory({ config: () => ({ TALLY: PAIRS }) });
  assert.equal(D.formIdFor("door", null, "light"), "dLight");
  assert.equal(D.formIdFor("door", null, "dark"), "dDark");
  assert.equal(D.formIdFor("intake_classes", null, "dark"), "cDark");
  assert.equal(D.formIdFor("intake_network", null, "light"), "nLight");
  assert.equal(D.formIdFor("intake_positioning", null, "dark"), "sDark", "no entry: intake_skills' pair");
  assert.equal(D.formIdFor("intake_positioning", null, "light"), "sLight");
  assert.equal(D.formIdFor("door", null, "sepia"), "dLight", "anything but dark reads as light");
  assert.equal(D.formIdFor("door"), "dLight", "no theme and no page: light");
  assert.equal(D.formIdFor("footer", null, "dark"), null, "an unknown kind has no form");
  const half = { TALLY: { door: { light: "dLight", dark: null }, intake_skills: { light: "sLight" } } };
  assert.equal(D.formIdFor("door", half, "dark"), null, "a pair without the theme's id: the native form, never the other theme's");
  assert.equal(D.formIdFor("intake_classes", half, "dark"), null, "the fallback pair without the theme's id: null too");
  assert.equal(D.formIdFor("door", { TALLY: { door: { light: "bad id!" } } }, "light"), null, "an id that is not Tally's shape");
  assert.equal(D.formIdFor("intake_skills", { TALLY: {} }, "light"), null, "nothing set");
  // the first cut's flat shape: one id per role, both themes
  const flat = { TALLY: { door: "wDoor1", intake: "wIntake" } };
  for (const th of ["light", "dark"]) {
    assert.equal(D.formIdFor("door", flat, th), "wDoor1");
    for (const k of ["intake_skills", "intake_classes", "intake_network", "intake_positioning"]) assert.equal(D.formIdFor(k, flat, th), "wIntake");
  }
  assert.equal(D.formIdFor("intake_classes", { TALLY: { intake_skills: "one", intake: "old" } }, "dark"), "one", "a flat per-kind id serves both themes and wins over `intake`");
});

test("themeOf: the page's data-theme override, else the device's prefers-color-scheme, else light", () => {
  const page = (dataTheme, dark) => doorsFactory({ config: () => ({ TALLY: PAIRS }), document: () => ({ documentElement: { dataset: dataTheme ? { theme: dataTheme } : {} } }), window: () => ({ matchMedia: q => ({ matches: q === "(prefers-color-scheme: dark)" && dark }) }) });
  assert.equal(page("dark", false).themeOf(), "dark", "the override wins over the device");
  assert.equal(page("light", true).themeOf(), "light");
  assert.equal(page(null, true).themeOf(), "dark", "system: the device decides");
  assert.equal(page(null, false).themeOf(), "light");
  assert.equal(page(null, true).formIdFor("intake_network"), "nDark", "no theme passed: the one in effect");
  assert.equal(doorsFactory({ document: () => { throw new Error("no page"); } }).themeOf(), "light");
  assert.equal(Doors.themeOf(), "light", "node: light");
});

test("embedHtml / mount take the theme: the dark form in dark, the light one in light, and the handle says which", () => {
  const D = doorsFactory({ config: () => ({ TALLY: PAIRS }) });
  assert.match(D.embedHtml("intake_classes", { theme: "dark" }), /tally\.so\/embed\/cDark\?/);
  assert.match(D.embedHtml("intake_classes", { theme: "light" }), /tally\.so\/embed\/cLight\?/);
  assert.match(D.embedHtml("door", { theme: "dark" }), /data-doors-theme="dark"/);
  assert.equal(D.embedHtml("door", { theme: "dark" }).includes("transparentBackground=1"), true, "still transparent: the page's background shows");
  const p = fakePage(PAIRS);
  const h = p.D.mount(p.el, "intake_network", { theme: "dark", native: () => "x" });
  assert.match(p.el.innerHTML, /tally\.so\/embed\/nDark\?/);
  assert.deepEqual([h.kind, h.theme, h.formId, h.native], ["intake_network", "dark", "nDark", false]);
  h.destroy();
  const p2 = fakePage(PAIRS);
  const h2 = p2.D.mount(p2.el, "door", { theme: "light", native: () => "x" });
  assert.match(p2.el.innerHTML, /tally\.so\/embed\/dLight\?/);
  assert.equal(h2.formId, "dLight");
  const p3 = fakePage({ door: { light: "dLight", dark: null } }), seen = [];
  const h3 = p3.D.mount(p3.el, "door", { theme: "dark", native: () => "<form>native</form>", onFallback: r => seen.push(r) });
  assert.deepEqual([p3.el.innerHTML, seen, h3.native], ["<form>native</form>", ["unset"], true], "no dark form: the native one, which follows the theme");
});

test("web/config.js: every kind has a light and a dark form, ten ids, all distinct", () => {
  const w = {};
  new Function("window", fs.readFileSync(path.join(web, "config.js"), "utf8"))(w);
  const T = w.CONFIG.TALLY;
  assert.deepEqual(Object.keys(T).sort(), [...Doors.KINDS].sort(), "one entry per kind");
  const ids = Doors.KINDS.flatMap(k => [T[k].light, T[k].dark]);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{3,64}$/);
  assert.equal(new Set(ids).size, ids.length, "no form serves two kinds or both themes");
  const D = doorsFactory({ config: () => w.CONFIG });
  for (const k of Doors.KINDS) { assert.equal(D.formIdFor(k, null, "light"), T[k].light); assert.equal(D.formIdFor(k, null, "dark"), T[k].dark); }
});

test("shouldFallback: false before three seconds and when loaded, true after three seconds unloaded; the clock waits for the view", () => {
  const t0 = 10_000;
  const s = Doors.freshState(t0, "200");
  assert.equal(Doors.shouldFallback(s, t0 + 2999), false);
  assert.equal(Doors.shouldFallback(s, t0 + 3000), true);
  assert.equal(Doors.shouldFallback(s, t0 + 60_000), true);
  assert.equal(Doors.shouldFallback(Doors.markLoaded(s), t0 + 60_000), false, "a Tally message for the form");
  assert.equal(Doors.shouldFallback(Doors.loadedCheck(s, "412px"), t0 + 60_000), false, "a height change counts as loaded");
  assert.equal(Doors.loadedCheck(s, "200").loaded, false, "the same height says nothing");
  assert.equal(Doors.shouldFallback(Doors.freshState(null, ""), t0 + 60_000), false, "no clock before the iframe is in view");
  assert.equal(Doors.FALLBACK_MS, 3000);
});

test("readMessage: Tally's postMessage as a JSON string, anything else null", () => {
  assert.deepEqual(Doors.readMessage(JSON.stringify({ event: "Tally.FormLoaded", payload: { formId: "wIntake" } })), { event: "FormLoaded", formId: "wIntake", payload: { formId: "wIntake" } });
  assert.equal(Doors.readMessage(JSON.stringify({ event: "Tally.FormSubmitted", payload: { formId: "wDoor1" } })).event, "FormSubmitted");
  assert.equal(Doors.readMessage("not json"), null);
  assert.equal(Doors.readMessage({ event: "other" }), null);
  assert.equal(Doors.readMessage(null), null);
});

test("returnQuery / clearQuery: the Tally return round-trips and other keys stay", () => {
  const hash = "#/home?email=a%40b.co&where=cs&utm=x";
  assert.deepEqual(Doors.returnQuery(hash), { email: "a@b.co", where: "cs" });
  assert.equal(Doors.clearQuery(hash), "#/home?utm=x");
  assert.equal(Doors.clearQuery("#/home?email=a%40b.co&where=cs"), "#/home", "the ? goes with the last key");
  assert.deepEqual(Doors.returnQuery("#/home"), { email: "", where: "" });
  assert.equal(Doors.clearQuery("#/home"), "#/home");
  assert.equal(Doors.clearQuery("#/role/pm?x=1&email=z"), "#/role/pm?x=1");
  assert.deepEqual(Doors.returnQuery(""), { email: "", where: "" });
});

test("nativeSubmit: the kinds map to the sources, the surface and the role ride in the ctx, no Capture resolves false", async () => {
  const { C, calls } = makeCapture();
  const D = doorsFactory({ config: () => CFG, capture: () => C });
  assert.equal(await D.nativeSubmit("door", { email: "a@b.co", where: "cs" }), true);
  assert.equal(calls[0].body.source, "door");
  assert.equal(calls[0].body.surface, "door");
  assert.equal(calls[0].body.program, "cs");
  assert.equal(calls.length, 1, "the door row fires no event here");
  assert.equal(await D.nativeSubmit("intake_skills", { email: "a@b.co", role: "pm", ctx: { stage: "looking", program: "business" } }), true);
  assert.equal(calls[1].body.source, "intake_skills");
  assert.deepEqual([calls[1].body.surface, calls[1].body.role_id, calls[1].body.stage, calls[1].body.program], ["skills", "pm", "looking", "business"]);
  assert.equal(calls[2].body.name, "intake_skills", "then the intake event");
  assert.equal(await D.nativeSubmit("intake_classes", { email: "a@b.co" }), true);
  assert.equal(calls[3].body.source, "intake_classes");
  assert.equal(await D.nativeSubmit("intake_network", { email: "a@b.co" }), true);
  assert.equal(calls[5].body.source, "intake_network");
  assert.equal(calls[6].body.name, "intake_network");
  assert.equal(await D.nativeSubmit("footer", { email: "a@b.co" }), false, "an unknown kind sends nothing");
  assert.equal(calls.length, 7, "three intakes send a row and an event each, the door a row alone");
  assert.equal(await Doors.nativeSubmit("door", { email: "a@b.co" }), false, "no Capture on the page");
});

test("mount without an id draws the native form at once and says so; a handle comes back either way", () => {
  const unset = doorsFactory({ config: () => ({ TALLY: { door: null, intake: null } }), window: () => null, document: () => null });
  const el = { innerHTML: "" }, seen = [];
  const h = unset.mount(el, "door", { native: () => "<form>native</form>", onFallback: r => seen.push(r) });
  assert.equal(el.innerHTML, "<form>native</form>");
  assert.deepEqual(seen, ["unset"]);
  assert.equal(h.native, true);
  h.destroy();
  const unknown = unset.mount({ innerHTML: "" }, "footer", { native: () => "x", onFallback: r => seen.push(r) });
  assert.equal(unknown.native, true);
});

// a page just big enough for mount: an element, an iframe that can fire load, a window that keeps its listeners, timers
// and observers under test control; no IntersectionObserver, so the clock starts at mount
function fakePage(tally) {
  const listeners = {}, timers = [], observers = [];
  const iframe = { attrs: {}, style: {}, handlers: {}, dataset: {}, getAttribute(k) { return this.attrs[k] ?? null; }, addEventListener(t, fn) { this.handlers[t] = fn; } };
  const el = { html: "", querySelector: () => iframe, set innerHTML(v) { this.html = v; const m = v.match(/height="(\d+)"/); if (m) iframe.attrs.height = m[1]; }, get innerHTML() { return this.html; } };
  const w = { addEventListener: (t, fn) => { listeners[t] = fn; }, removeEventListener: t => { delete listeners[t]; }, ResizeObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() { } disconnect() { this.gone = true; } } };
  const doc = { querySelector: () => null, createElement: () => ({}), body: { appendChild() { } } };
  let now = 0;
  const D = doorsFactory({ config: () => (tally ? { ...CFG, TALLY: tally } : CFG), capture: () => null, window: () => w, document: () => doc, now: () => now, timer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clear: () => { } });
  const tick = () => { now += 3000; timers.splice(0).forEach(t => t.fn()); };
  return { D, el, iframe, w, listeners, observers, tick, message: data => listeners.message && listeners.message({ origin: "https://tally.so", data: JSON.stringify(data) }) };
}

test("mount with an id: the iframe's load event is no load; three seconds without a Tally message or a resize draw the native form", () => {
  const p = fakePage(), seen = [], loads = [];
  const h = p.D.mount(p.el, "door", { native: () => "<form>native</form>", onFallback: r => seen.push(r), onLoaded: () => loads.push(1) });
  assert.match(p.el.innerHTML, /^<iframe data-tally-src="https:\/\/tally\.so\/embed\/wDoor1\?/);
  assert.equal(h.native, false);
  p.iframe.handlers.load && p.iframe.handlers.load();   // Tally's error page for an unknown id loads like any page
  assert.deepEqual(loads, [], "a load event says nothing");
  p.tick();
  assert.equal(p.el.innerHTML, "<form>native</form>");
  assert.deepEqual(seen, ["timeout"]);
  assert.equal(h.native, true);
  assert.deepEqual(loads, []);
  assert.ok(p.observers[0].gone && !p.listeners.message, "the fallback drops the observer and the listener");
});

test("mount with an id: a Tally message for the form, or the iframe resized, is a load; the submit message reaches onSubmitted once", () => {
  const p = fakePage(), seen = [], loads = [], subs = [];
  p.D.mount(p.el, "intake_skills", { native: () => "x", onFallback: r => seen.push(r), onLoaded: () => loads.push(1), onSubmitted: x => subs.push(x) });
  p.message({ event: "Tally.FormLoaded", payload: { formId: "other" } });
  assert.deepEqual(loads, [], "another form's message says nothing");
  p.message({ event: "Tally.FormLoaded", payload: { formId: "wIntake" } });
  assert.deepEqual(loads, [1]);
  p.message({ event: "Tally.FormSubmitted", payload: { formId: "wIntake", responseId: "r1" } });
  assert.deepEqual(loads, [1], "onLoaded fires once");
  assert.deepEqual(subs, [{ formId: "wIntake", responseId: "r1" }]);
  p.tick();
  assert.deepEqual(seen, [], "no fallback once loaded");
  assert.equal(p.el.innerHTML.startsWith("<iframe"), true);
  // the resize path: dynamicHeight sets the iframe's style height
  const q = fakePage(), qLoads = [], qSeen = [];
  q.D.mount(q.el, "intake_classes", { native: () => "x", onFallback: r => qSeen.push(r), onLoaded: () => qLoads.push(1) });
  q.observers[0].fn();
  assert.deepEqual(qLoads, [], "the observer's first call, the same height, says nothing");
  q.iframe.style.height = "412px"; q.observers[0].fn();
  assert.deepEqual(qLoads, [1]);
  q.tick();
  assert.deepEqual(qSeen, []);
});
