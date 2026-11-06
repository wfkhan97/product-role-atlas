// web/guide.js (the usability pass of 2026-11-06, the guide): the step table against the copy and the routes, the
// steps a state gets (route, flags, résumé, the DOM-presence predicate), the due rule (first visit, seen, version bump,
// relaunch), the seen-state with bad values, the phone or desktop choice, the cta ids, the run as a reducer, the card's
// place; then the shell: the script order, the flag shipped off, app.js's one hook and the two relaunch links.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web } from "./_load.mjs";
import { checkAll } from "../../evals/copy_lib.mjs";

const factory = require(path.join(web, "guide.js"));
const Copy = require(path.join(web, "copy.js"));
const Routes = require(path.join(web, "app.js"));
const memStorage = () => { const m = {}; return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const ON = { GUIDE_ENABLED: true, FEEDBACK_ENABLED: true };
const make = (cfg = ON, local = memStorage()) => ({ G: factory({ config: () => cfg, local: () => local, copy: Copy }), local });
const { G } = make();
const all = () => true;
const ids = list => list.map(s => s.id);

// ---------- the constants ----------
test("STEPS: every row's screen is in SCREENS, ids are unique per screen, two to four rows per screen, none for the door", () => {
  const per = {};
  for (const r of G.STEPS) {
    assert.ok(Object.hasOwn(G.SCREENS, r.screen), r.screen);
    assert.ok(Array.isArray(r.target) && r.target.length >= 1, `${r.screen}.${r.id} has a target`);
    (per[r.screen] ||= []).push(r.id);
  }
  for (const [s, list] of Object.entries(per)) {
    assert.equal(new Set(list).size, list.length, `${s}: ids unique`);
    assert.ok(list.length >= 2 && list.length <= 5, `${s}: ${list.length} rows`);
  }
  assert.deepEqual(Object.keys(per).sort(), Object.keys(G.SCREENS).sort(), "every screen has rows");
  assert.ok(!per.door && !G.SCREENS.door, "the door has no step: its own copy is the guide there");
});

test("one run shows two to four steps per screen (rows that exclude each other count once)", () => {
  for (const s of Object.keys(G.SCREENS)) {
    const most = Math.max(G.stepsFor(s, { resume: false, config: ON }, all).length, G.stepsFor(s, { resume: true, config: ON }, all).length);
    assert.ok(most >= 2 && most <= 4, `${s}: at most ${most}`);
  }
});

test("every row has Copy.guide.steps[screen][id] with a title and a body, and no copy entry lacks a row", () => {
  const steps = Copy.guide.steps;
  for (const r of G.STEPS) {
    const w = (steps[r.screen] || {})[r.id];
    assert.ok(w && w.title && w.body, `${r.screen}.${r.id}`);
  }
  for (const [s, list] of Object.entries(steps)) for (const id of Object.keys(list)) assert.ok(G.STEPS.some(r => r.screen === s && r.id === id), `copy ${s}.${id} has a row`);
  for (const k of ["relaunch", "relaunchAria", "dialog", "count", "next", "back", "done", "skip", "close", "none"]) assert.ok(Copy.guide[k], k);
});

test("the guide's copy: no sentence over 20 words, no passive, no stoplist word; titles of at most six words, bodies of at most two sentences", () => {
  const list = [];
  const walk = (v, p) => { if (typeof v === "string") list.push({ path: p, text: v }); else for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`); };
  walk(Copy.guide, "guide");
  assert.deepEqual(checkAll(list).map(o => `${o.path} [${o.rule}] ${o.hit}`), []);
  for (const [s, steps] of Object.entries(Copy.guide.steps)) for (const [id, w] of Object.entries(steps)) {
    assert.ok(w.title.split(/\s+/).length <= 6, `${s}.${id} title`);
    assert.ok(w.body.split(/[.?!](\s|$)/).filter(x => x && x.trim()).length <= 2, `${s}.${id} body`);
  }
});

test("SCREENS: every key is a route name parseRoute returns; fit waits for .fitcols and network for #nw-prep; versions are integers of 1 or more", () => {
  const hashOf = { door: "#/", fit: "#/role/x/fit", role: "#/role/x", field: "#/field/x" };
  for (const [s, v] of Object.entries(G.SCREENS)) {
    assert.equal(Routes.parseRoute(hashOf[s] || `#/${s}`).name, s, s);
    assert.ok(Number.isInteger(v.version) && v.version >= 1, `${s} version`);
  }
  assert.equal(G.SCREENS.fit.ready, ".fitcols");
  assert.equal(G.SCREENS.network.ready, "#nw-prep");
});

test("KEY is guide.seen and PHONE_MAX is the style sheet's phone breakpoint", () => {
  assert.equal(G.KEY, "guide.seen");
  assert.equal(G.PHONE_MAX, 640);
  const css = fs.readFileSync(path.join(web, "style.css"), "utf8");
  assert.match(css, /@media \(max-width: 640px\)/);
});

test("the top bar's links have the footer's as a second target, for a phone where the bar's are past the edge", () => {
  const t = (s, id) => G.STEPS.find(r => r.screen === s && r.id === id).target;
  assert.deepEqual(t("home", "relaunch"), ["#verbs [data-guide]", "#foot-guide"]);
  assert.deepEqual(t("about", "feedback"), ["#verbs [data-feedback]", "#foot-feedback"]);
  assert.deepEqual(t("home", "you"), ["#main section.home-you:has(.opts)"], "About you's questions only, never its summary");
});

// ---------- has ----------
test("has: true for a screen with rows, false for the screens without and for nonsense", () => {
  for (const s of ["home", "fit"]) assert.equal(G.has(s), true, s);
  for (const s of ["door", "signin", "map", "play", "nope", "", undefined]) assert.equal(G.has(s), false, String(s));
});

// ---------- stepsFor ----------
test("stepsFor: a screen's rows only, in table order, with their copy; an unknown screen gives none", () => {
  const jobs = G.stepsFor("jobs", { resume: false, config: ON }, all);
  assert.deepEqual(ids(jobs), ["search", "fields", "card"]);
  assert.deepEqual(jobs[0], { id: "search", target: "#jsearch", title: Copy.guide.steps.jobs.search.title, body: Copy.guide.steps.jobs.search.body });
  assert.deepEqual(G.stepsFor("nope", {}, all), []);
  assert.deepEqual(G.stepsFor(undefined, {}, all), []);
});

test("stepsFor: a flag the step needs filters it; GUIDE_ENABLED does not (that is due's)", () => {
  assert.ok(ids(G.stepsFor("about", { config: { FEEDBACK_ENABLED: true } }, all)).includes("feedback"));
  assert.ok(!ids(G.stepsFor("about", { config: { FEEDBACK_ENABLED: false } }, all)).includes("feedback"));
  assert.ok(!ids(G.stepsFor("about", {}, all)).includes("feedback"), "no config: the flag reads off");
  assert.deepEqual(ids(G.stepsFor("home", { config: {} }, all)), ["verbs", "you", "relaunch"], "the flag off filters nothing here");
});

test("stepsFor: a résumé or not picks one of each pair, never both", () => {
  const pairs = { jobs: ["card", "cardFit"], skills: ["resume", "resumeFit"], role: ["rail", "railFit"], classes: ["resume", "gaps"] };
  for (const [s, [without, withIt]] of Object.entries(pairs)) {
    const a = ids(G.stepsFor(s, { resume: false }, all)), b = ids(G.stepsFor(s, { resume: true }, all));
    assert.ok(a.includes(without) && !a.includes(withIt), `${s} without a résumé: ${a}`);
    assert.ok(b.includes(withIt) && !b.includes(without), `${s} with a résumé: ${b}`);
  }
});

test("stepsFor: the DOM-presence predicate drops a row with no present target and keeps the order of the rest", () => {
  assert.deepEqual(ids(G.stepsFor("classes", { resume: false }, all)), ["role", "band", "resume", "subjects"], "no role: the table drops nothing by when");
  assert.deepEqual(ids(G.stepsFor("classes", { resume: false }, s => s !== ".cls-card .cls-rel")), ["role", "resume", "subjects"]);
  const both = G.stepsFor("role", { resume: false }, all).find(s => s.id === "rail");
  assert.equal(both.target, "#rail-read");
  const tabOnly = G.stepsFor("role", { resume: false }, s => s !== "#rail-read").find(s => s.id === "rail");
  assert.equal(tabOnly.target, ".rail-tab");
  assert.deepEqual(G.stepsFor("home", {}, () => false), []);
});

test("stepsFor: the predicate is called with the row's selectors only, in order, and stops at the first true", () => {
  const calls = [];
  G.stepsFor("role", { resume: false }, s => { calls.push(s); return s === "#rail-read" || s === ".filters .seg" || s === "details.areabox"; });
  assert.deepEqual(calls, [".filters .seg", "details.areabox", "#rail-read"], "railFit is filtered by when before any selector; .rail-tab is never asked");
  const calls2 = [];
  G.stepsFor("skills", { resume: true }, s => { calls2.push(s); return s === "#lf-body"; });
  assert.deepEqual(calls2, [".lf-tiles", "#lf-body", "#lf-q", "#lf-side"]);
});

test("stepsFor: a predicate that throws counts as absent", () => {
  assert.deepEqual(G.stepsFor("home", {}, () => { throw new Error("x"); }), []);
});

// ---------- due ----------
test("due: the flag off is never due, even for a relaunch", () => {
  assert.deepEqual(G.due({ screen: "home", seen: {}, version: 1, enabled: false }), { due: false, why: null });
  assert.deepEqual(G.due({ screen: "home", seen: {}, version: 1, enabled: false, relaunch: true }), { due: false, why: null });
});

test("due: busy (the feedback sheet, the drawer) is not due, except a relaunch the person asked for", () => {
  assert.deepEqual(G.due({ screen: "home", seen: {}, version: 1, enabled: true, busy: true }), { due: false, why: null });
  assert.deepEqual(G.due({ screen: "home", seen: { home: 1 }, version: 1, enabled: true, busy: true, relaunch: true }), { due: true, why: "relaunch" });
});

test("due: a screen without rows is never due", () => {
  for (const s of ["signin", "map", "nope"]) assert.deepEqual(G.due({ screen: s, seen: {}, version: 1, enabled: true, relaunch: true }), { due: false, why: null });
});

test("due: the first visit, a seen screen, a version bump, an older version than the mark", () => {
  assert.deepEqual(G.due({ screen: "home", seen: {}, version: 1, enabled: true }), { due: true, why: "first" });
  assert.deepEqual(G.due({ screen: "home", seen: { home: 1 }, version: 1, enabled: true }), { due: false, why: null });
  assert.deepEqual(G.due({ screen: "home", seen: { home: 1 }, version: 2, enabled: true }), { due: true, why: "version" });
  assert.deepEqual(G.due({ screen: "home", seen: { home: 3 }, version: 2, enabled: true }), { due: false, why: null });
  assert.deepEqual(G.due({ screen: "home", seen: { home: 1 }, version: 1, enabled: true, relaunch: true }), { due: true, why: "relaunch" });
  assert.deepEqual(G.due({ screen: "home", seen: { jobs: 1 }, version: 1, enabled: true }), { due: true, why: "first" }, "other screens' marks do not count");
  assert.deepEqual(G.due({ screen: "home", enabled: true }), { due: true, why: "first" }, "no seen-state and no version: the table's");
  assert.deepEqual(G.due(null), { due: false, why: null });
});

// ---------- the seen-state ----------
test("readSeen: nothing usable reads as {}; good keys survive, bad ones drop; never throws", () => {
  for (const raw of [null, undefined, "", "not json", "[]", "3", "null", "{", "true"]) assert.deepEqual(G.readSeen(raw), {}, String(raw));
  assert.deepEqual(G.readSeen('{"home":1,"classes":"2","jobs":1.5,"x":1,"fit":0,"you":-1}'), { home: 1, classes: 2 });
});

test("markSeen and writeSeen: a new object with the screen set, the input untouched; an unknown screen changes nothing; the round trip cleans", () => {
  const before = { home: 1 };
  const after = G.markSeen(before, "jobs", 2);
  assert.deepEqual(after, { home: 1, jobs: 2 });
  assert.deepEqual(before, { home: 1 }, "the input is untouched");
  assert.deepEqual(G.markSeen(before, "nope", 1), { home: 1 });
  assert.notEqual(G.markSeen(before, "nope", 1), before, "a copy, even unchanged");
  const bad = '{"classes":"2","jobs":1.5,"x":1,"about":3}';
  assert.deepEqual(G.readSeen(G.writeSeen(G.markSeen(G.readSeen(bad), "home", 1))), { classes: 2, about: 3, home: 1 });
  assert.equal(G.writeSeen({ home: 1, x: 2, jobs: "no" }), '{"home":1}');
});

test("seen() and mark(): the pair over localStorage; mark writes the screen's version from SCREENS; a broken storage reads {} and never throws", () => {
  const { G: g, local } = make();
  assert.deepEqual(g.seen(), {});
  g.mark("home");
  assert.deepEqual(g.seen(), { home: 1 });
  assert.equal(local.m["guide.seen"], '{"home":1}');
  local.m["guide.seen"] = '{"home":1,"bogus":5,"jobs":"x"}';
  g.mark("jobs");
  assert.equal(local.m["guide.seen"], '{"home":1,"jobs":1}', "a bad value is rewritten clean on the next mark");
  g.mark("nope");
  assert.equal(local.m["guide.seen"], '{"home":1,"jobs":1}');
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  const g2 = factory({ config: () => ON, local: () => broken, copy: Copy });
  assert.deepEqual(g2.seen(), {});
  assert.doesNotThrow(() => g2.mark("home"));
  const g3 = factory({});
  assert.deepEqual(g3.seen(), {});
  assert.doesNotThrow(() => g3.mark("home"));
});

// ---------- mode, ctaId ----------
test("mode: a bottom sheet at 640 px and under, the spotlight above; a width the page cannot read keeps the spotlight", () => {
  for (const w of [390, 640]) assert.equal(G.mode(w), "sheet", String(w));
  for (const w of [641, 1280, 0, NaN, undefined, -1]) assert.equal(G.mode(w), "spotlight", String(w));
});

test("ctaId: guide_<screen> for a screen with rows that fits Capture's CTA_RE; null otherwise", () => {
  const capture = fs.readFileSync(path.join(web, "capture.js"), "utf8");
  const src = capture.match(/CTA_RE = (\/[^\n]*?\/),/)[1];
  assert.equal(src, "/^[a-z][a-z0-9_]{1,31}$/", "the regex web/capture.js holds");
  const CTA_RE = /^[a-z][a-z0-9_]{1,31}$/;
  assert.equal(G.ctaId("classes"), "guide_classes");
  assert.equal(G.ctaId("fit"), "guide_fit");
  for (const s of ["map", "Home", "", undefined]) assert.equal(G.ctaId(s), null, String(s));
  for (const s of Object.keys(G.SCREENS)) { const id = G.ctaId(s); assert.ok(id && CTA_RE.test(id), s); }
  for (const id of ["guide_skip", "guide_relaunch"]) assert.ok(CTA_RE.test(id), id);
});

// ---------- the run ----------
const S = "jobs", ID = "guide_jobs", ctx = { screen: S };
test("start: index 0, shown sent, and the screen marked (shown counts as seen)", () => {
  const r = G.start(S, ["search", "fields", "card"]);
  assert.deepEqual(r.run, { screen: S, steps: ["search", "fields", "card"], i: 0, clicked: false });
  assert.deepEqual(r.cta, [[ID, "shown", ctx]]);
  assert.equal(r.mark, true);
  assert.equal(r.end, null);
});

test("step: next moves and sends one click per run; next on the last is done; back stops at the first", () => {
  let { run } = G.start(S, ["search", "fields", "card"]);
  let r = G.step(run, { type: "next" });
  assert.equal(r.run.i, 1); assert.deepEqual(r.cta, [[ID, "click", ctx]]); assert.equal(r.end, null); assert.equal(r.mark, false);
  r = G.step(r.run, { type: "next" });
  assert.equal(r.run.i, 2); assert.deepEqual(r.cta, [], "the click went once");
  const last = G.step(r.run, { type: "next" });
  assert.equal(last.end, "done"); assert.deepEqual(last.cta, [[ID, "done", ctx]]);
  const done = G.step(r.run, { type: "done" });
  assert.equal(done.end, "done"); assert.deepEqual(done.cta, [[ID, "done", ctx]]);
  assert.equal(r.run.i, 2, "the input run is untouched");
  const b0 = G.step(run, { type: "back" });
  assert.equal(b0.run.i, 0); assert.deepEqual(b0.cta, []); assert.equal(b0.end, null);
  const b2 = G.step({ ...run, i: 2 }, { type: "back" });
  assert.equal(b2.run.i, 1);
});

test("step: ×, Skip tips, Esc and a click outside skip, with guide_skip done and the screen", () => {
  const { run } = G.start(S, ["search", "fields"]);
  for (const type of ["skip", "esc", "close", "outside"]) {
    const r = G.step(run, { type });
    assert.equal(r.end, "skip", type);
    assert.deepEqual(r.cta, [["guide_skip", "done", ctx]], type);
  }
});

test("step: a click on the target ends as engaged with a click if none went yet, never a done", () => {
  const { run } = G.start(S, ["search", "fields"]);
  assert.deepEqual(G.step(run, { type: "target" }), { run: { ...run, clicked: true }, end: "engaged", cta: [[ID, "click", ctx]], mark: false });
  const r = G.step({ ...run, clicked: true }, { type: "target" });
  assert.equal(r.end, "engaged"); assert.deepEqual(r.cta, []);
});

test("step: left and gone end with nothing sent", () => {
  const { run } = G.start(S, ["search"]);
  assert.deepEqual([G.step(run, { type: "left" }).end, G.step(run, { type: "left" }).cta], ["left", []]);
  assert.deepEqual([G.step(run, { type: "gone" }).end, G.step(run, { type: "gone" }).cta], ["gone", []]);
});

test("step: a redraw keeps a present target, moves past an absent one, and ends as gone with none ahead", () => {
  const { run } = G.start(S, ["search", "fields", "card"]);
  assert.equal(G.step(run, { type: "redraw", present: () => true }).run.i, 0);
  const moved = G.step(run, { type: "redraw", present: id => id !== "search" && id !== "fields" });
  assert.equal(moved.run.i, 2); assert.equal(moved.end, null); assert.deepEqual(moved.cta, []);
  const gone = G.step({ ...run, i: 1 }, { type: "redraw", present: id => id === "search" });
  assert.equal(gone.end, "gone"); assert.deepEqual(gone.cta, []);
});

test("step: Next and Back skip a step whose target is gone now", () => {
  const { run } = G.start(S, ["search", "fields", "card"]);
  const r = G.step(run, { type: "next", present: id => id !== "fields" });
  assert.equal(r.run.i, 2);
  const b = G.step(r.run, { type: "back", present: id => id !== "fields" });
  assert.equal(b.run.i, 0);
  const end = G.step(run, { type: "next", present: id => id === "search" });
  assert.equal(end.end, "done", "nothing ahead: Next is Done");
});

// ---------- place ----------
const V = { width: 1280, height: 800 }, CARD = { width: 340, height: 200 };
const rect = (left, top, width, height) => ({ left, top, width, height });
const overlaps = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
test("place: below when there is room, above near the bottom, then right, then left", () => {
  const below = G.place(rect(100, 100, 200, 40), CARD, V);
  assert.deepEqual(below, { side: "below", left: 100, top: 152 });
  assert.equal(G.place(rect(100, 700, 200, 40), CARD, V).side, "above");
  assert.equal(G.place(rect(100, 100, 400, 650), CARD, V).side, "right");
  assert.equal(G.place(rect(900, 100, 360, 650), CARD, V).side, "left");
});

test("place: the card stays 16 px inside the window", () => {
  const p = G.place(rect(1200, 100, 60, 30), CARD, V);
  assert.equal(p.left, 1280 - 16 - 340);
  const q = G.place(rect(-50, 2, 30, 1), CARD, V);
  assert.ok(q.left >= 16 && q.top >= 16);
});

test("place: over random targets, the card never leaves the view and never covers the target when a side has room", () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 2000; k++) {
    const w = 10 + rnd() * 900, h = 10 + rnd() * 700, t = rect(rnd() * (V.width - w), rnd() * (V.height - h), w, h);
    const c = { width: 200 + rnd() * 200, height: 100 + rnd() * 200 };
    const p = G.place(t, c, V);
    assert.ok(p.left >= 16 && p.left + c.width <= V.width - 16 + 1e-9, `x ${k}`);
    assert.ok(p.top >= 16 && p.top + c.height <= V.height - 16 + 1e-9, `y ${k}`);
    const room = t.top + h + 12 + c.height <= V.height - 16 || t.top - 12 - c.height >= 16 || t.left + w + 12 + c.width <= V.width - 16 || t.left - 12 - c.width >= 16;
    if (room) assert.ok(!overlaps({ left: p.left, top: p.top, ...c }, t), `overlap ${k} ${p.side}`);
  }
});

// ---------- node: no DOM ----------
test("in node the DOM part is inert: after and relaunch return false, isOpen is false", () => {
  assert.equal(G.after("home", {}), false);
  assert.equal(G.relaunch("home", {}), false);
  assert.equal(G.isOpen(), false);
});

// ---------- the shell ----------
test("the shell: guide.js loads after feedback.js and before app.js; the flag ships off; the footer has the relaunch link", () => {
  const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
  const at = s => html.indexOf(`<script src="${s}"></script>`);
  assert.ok(at("feedback.js") > 0 && at("feedback.js") < at("guide.js") && at("guide.js") < at("app.js"));
  assert.match(html, /<button[^>]*id="foot-guide"[^>]*hidden/);
  const cfg = fs.readFileSync(path.join(web, "config.js"), "utf8");
  assert.match(cfg, /\n  GUIDE_ENABLED: false,/);
});

test("app.js: one hook in route() (the guide first, the feedback prompt otherwise), the prompt yields to an open run, the top bar's link", () => {
  const app = fs.readFileSync(path.join(web, "app.js"), "utf8");
  assert.equal((app.match(/Guide\.after\(/g) || []).length, 1, "one call");
  assert.match(app, /if \(!\(guideOn\(\) && Guide\.after\(name, guideCtx\(\)\)\)\) maybePrompt\(name\);/);
  assert.match(app, /if \(window\.Guide && Guide\.isOpen\(\)\) return false;/);
  assert.match(app, /feedbackLink\(name\) \+ guideLink\(name\) \+ whoHtml\(name\)/);
  assert.match(app, /data-guide/);
});
