// web/feedback.js (the visitor journey, step 6): the prompt's rule as a pure function, the one row the box sends with
// a fake fetch (exactly the listed columns, with the publishable key), the marks in localStorage, the migration's
// insert-only policy, the shell loading the script, the flag, the copy and app.js's two calls to action.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web, root } from "./_load.mjs";

const factory = require(path.join(web, "feedback.js"));
const Copy = require(path.join(web, "copy.js"));
const CFG = { SUPABASE_URL: "https://x.supabase.co/", SUPABASE_PUBLISHABLE_KEY: "pk", FEEDBACK_ENABLED: true };
const memStorage = () => { const m = {}; return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
function make(opts = {}) {
  const calls = [], local = memStorage();
  const F = factory({ fetch: async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return opts.answer || { ok: true }; }, config: () => opts.config || CFG, local: () => local });
  return { F, calls, local };
}
const MIN = 60 * 1000, DAY = 24 * 60 * MIN, NOW = Date.UTC(2026, 10, 5, 12);
const F0 = factory({});

test("due: the first prompt after twelve actions or six minutes of visible time, whichever first; nothing before", () => {
  assert.deepEqual(F0.due({ now: NOW, screen: "role", actions: 11, visibleMs: 5 * MIN }), { due: false, why: null });
  assert.deepEqual(F0.due({ now: NOW, screen: "role", actions: 12, visibleMs: 0 }), { due: true, why: "actions" });
  assert.deepEqual(F0.due({ now: NOW, screen: "explore", actions: 0, visibleMs: 6 * MIN }), { due: true, why: "time" });
  assert.deepEqual(F0.due(null), { due: false, why: null });
});

test("due: never on the door or the sign-in, nor within a minute of signing in", () => {
  assert.deepEqual(F0.due({ now: NOW, screen: "door", actions: 99, visibleMs: 99 * MIN }), { due: false, why: null });
  assert.deepEqual(F0.due({ now: NOW, screen: "signin", actions: 99, visibleMs: 99 * MIN, treeOpened: true }), { due: false, why: null });
  assert.deepEqual(F0.due({ now: NOW, screen: "role", actions: 99, signedInAt: NOW - 59 * 1000 }), { due: false, why: null });
  assert.deepEqual(F0.due({ now: NOW, screen: "role", actions: 99, signedInAt: NOW - 61 * 1000 }), { due: true, why: "actions" });
});

test("due: once asked, again only after thirty days and only with new actions since; the tree's own prompt once, whatever else", () => {
  const asked = { at: NOW - 31 * DAY, actions: 20 };
  assert.deepEqual(F0.due({ now: NOW, screen: "role", actions: 20, asked }), { due: false, why: null }, "no new action: not again");
  assert.deepEqual(F0.due({ now: NOW, screen: "role", actions: 21, asked }), { due: true, why: "again" });
  assert.deepEqual(F0.due({ now: NOW, screen: "role", actions: 50, asked: { at: NOW - 29 * DAY, actions: 20 } }), { due: false, why: null }, "too soon");
  assert.deepEqual(F0.due({ now: NOW, screen: "map", actions: 0, asked: { at: NOW - DAY, actions: 5 }, treeOpened: true }), { due: true, why: "tree" });
  assert.deepEqual(F0.due({ now: NOW, screen: "map", actions: 0, treeOpened: true, treeAsked: true }), { due: false, why: null });
});

test("send posts exactly the sentence, the email only when typed and well-formed, the screen, prompted, the two ids and the person's id, with the publishable key", async () => {
  const { F, calls } = make();
  const ok = await F.send({ text: "  The fit screen hides the gaps. ", email: "a@b.co", screen: "fit", prompted: true, session: "a".repeat(24), visitor: "b".repeat(24), user_id: "11111111-aaaa-4aaa-8aaa-111111111111" });
  assert.equal(ok, true);
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/feedback");
  assert.equal(calls[0].init.headers.apikey, "pk"); assert.equal(calls[0].init.headers.Authorization, "Bearer pk"); assert.equal(calls[0].init.headers.Prefer, "return=minimal");
  assert.deepEqual(calls[0].body, { text: "The fit screen hides the gaps.", prompted: true, email: "a@b.co", screen: "fit", session: "a".repeat(24), visitor: "b".repeat(24), user_id: "11111111-aaaa-4aaa-8aaa-111111111111" });
  await F.send({ text: "x".repeat(600), email: "not an email", screen: "Bad Screen", session: "short", prompted: 0 });
  assert.deepEqual(calls[1].body, { text: "x".repeat(500), prompted: false }, "cut at 500; a malformed email, screen or id is left out");
  assert.equal(await F.send({ text: "   " }), false, "nothing typed, nothing sent"); assert.equal(calls.length, 2);
  const off = make({ config: { ...CFG, FEEDBACK_ENABLED: false } });
  assert.equal(await off.F.send({ text: "hello" }), false); assert.equal(off.calls.length, 0, "off: no request");
  const bad = make({ answer: { ok: false, status: 404 } });
  assert.equal(await bad.F.send({ text: "hello" }), false, "a refused row reads as false, never throws");
});

test("the marks live in localStorage: asked (when, at how many actions), the tree's, the sign-in's minute; a closed store reads as never asked", () => {
  const { F, local } = make();
  assert.equal(F.asked(), null); assert.equal(F.treeAsked(), false); assert.equal(F.signedInAt(), null);
  F.markAsked(NOW, 14); F.markTreeAsked(); F.signedIn(NOW + 5);
  assert.deepEqual(F.asked(), { at: NOW, actions: 14 }); assert.equal(F.treeAsked(), true); assert.equal(F.signedInAt(), NOW + 5);
  assert.deepEqual(Object.keys(local.m).sort(), ["feedback.asked", "feedback.signin", "feedback.tree"]);
  const closed = factory({ local: () => { throw new Error("private mode"); } });
  assert.equal(closed.asked(), null); closed.markAsked(NOW, 1); assert.equal(closed.treeAsked(), false);
});

test("the migration: one insert-only table, anon and authenticated may insert and never select, the sentence at most 500 characters, no text but the sentence", () => {
  const sql = fs.readFileSync(path.join(root, "pipeline", "sql", "2026-11-05_feedback.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.feedback/);
  assert.match(sql, /char_length\(text\) between 1 and 500/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /for insert to anon, authenticated with check \(true\)/);
  assert.match(sql, /revoke all on public\.feedback from anon, authenticated;\s*grant insert on public\.feedback to anon, authenticated;/);
  assert.ok(!/grant select/.test(sql) && !/for select/.test(sql), "nothing readable from the browser");
  assert.ok(!/resume|résumé/i.test(sql.split("\n").filter(l => !l.startsWith("--")).join("\n")), "no column for a résumé");
});

test("the shell loads feedback.js after capture.js (after state.js, so auth.js keeps its place) and before app.js; the switch exists; the footer holds the link, hidden until the flag", () => {
  const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
  const at = s => html.indexOf(`<script src="${s}"></script>`);
  assert.ok(at("capture.js") < at("feedback.js") && at("feedback.js") < at("app.js"));
  assert.match(html, /<button type="button" class="linkish footlink" id="foot-feedback" hidden>/);
  // C-23, the footer said "About the data" and the page "About GradBuddy"; C-20, the footer's two links looked different
  assert.match(html, /<a class="footlink" href="#\/about">About GradBuddy<\/a>/);
  assert.equal(Copy.about.heading, "About GradBuddy");
  const cfgSrc = fs.readFileSync(path.join(web, "config.js"), "utf8");
  assert.match(cfgSrc, /FEEDBACK_ENABLED: (true|false),/, "the switch exists; it flipped on with chore/feedback-on once the table was applied");
  for (const k of ["link", "heading", "lead", "promptLead", "treeLead", "placeholder", "emailLabel", "count", "send", "sending", "notNow", "close", "empty", "thanks", "failed", "privacy"]) assert.equal(typeof Copy.feedback[k], "string", k);
  assert.equal(typeof Copy.about.privacyFeedback, "string");
});

test("app.js: the link in the bar and the footer open the box (cta `feedback`), the prompt opens it as `feedback_prompt`, the rule reads the browser's counts, and the sign-in notes its minute", () => {
  const app = fs.readFileSync(path.join(web, "app.js"), "utf8");
  assert.match(app, /const feedbackOn = \(\) => !!\(\(window\.CONFIG \|\| \{\}\)\.FEEDBACK_ENABLED && window\.Feedback\)/);
  assert.match(app, /id = prompted \? "feedback_prompt" : "feedback"/);
  for (const step of ["shown", "click", "done"]) assert.match(app, new RegExp(`Capture\\.cta\\(id, "${step}", \\{ role_id: state\\.roleId \\}\\)`), step);
  assert.match(app, /Feedback\.due\(\{ now, screen: name, actions: Capture\.actions\(\), visibleMs: Capture\.visible\(\), signedInAt: Feedback\.signedInAt\(\), asked: Feedback\.asked\(\), treeOpened: !!o\.treeOpened, treeAsked: Feedback\.treeAsked\(\) \}\)/);
  assert.match(app, /if \(d\.why === "tree"\) Feedback\.markTreeAsked\(\); else Feedback\.markAsked\(now, Capture\.actions\(\)\)/, "shown counts as asked");
  assert.match(app, /maybePrompt\("map", \{ treeOpened: true \}\)/, "the tree's own prompt at the first self-serve map drawn");
  assert.match(app, /Capture\.cta\("signin", "done"\);\s*noteSignedIn\(\);/);
  assert.match(app, /data-feedback/); assert.match(app, /\$\("#foot-feedback"\)/);
  assert.ok(!/Feedback\.send\(\{ text: ta\.value/.test(app), "the sentence is trimmed before it goes");
});

test("capture sums the visible, active time of the heartbeats in this browser and sends nothing for it", async () => {
  const captureFactory = require(path.join(web, "capture.js"));
  const calls = [], local = memStorage();
  const C = captureFactory({ fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true }; }, config: () => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "pk", CAPTURE_ENABLED: true, JOURNEY_ENABLED: true }), storage: () => null, local: () => local });
  assert.equal(C.visible(), 0);
  let t = 0; C.tick(t, true, t);
  for (let i = 0; i < 8; i++) { t += 5000; C.tick(t, true, t); }   // forty seconds visible and active: one beat of 30 s and 10 s accrued
  assert.equal(C.visible(), 30000); assert.equal(local.getItem("journey.visible"), "30000");
  for (let i = 0; i < 6; i++) { t += 5000; C.tick(t, true, t); }
  assert.equal(C.visible(), 60000);
  await new Promise(r => setTimeout(r, 0));   // the posts go in a microtask
  assert.deepEqual(calls.map(r => r.name), ["heartbeat", "heartbeat"], "the sum is local; only the beats go");
});

// the usability pass of 2026-11-06, cluster "feedback, the sign-in, About and the chrome"
test("C-09, the box took an address that is not an email: emailOk passes empty or one well-formed address, nothing else", () => {
  for (const v of ["", "   ", null, undefined, "a@b.co", " wk@cornell.edu "]) assert.equal(F0.emailOk(v), true, String(v));
  for (const v of ["not-an-email", "a@b", "a b@c.co", "@b.co", "a@@b.co", "x".repeat(320) + "@b.co"]) assert.equal(F0.emailOk(v), false, v);
  assert.equal(Copy.feedback.badEmail, "Check the email, or leave it empty.");
});

test("C-03, the box sent the door's email unasked: offer names the address on file for one press, and send carries it only when it is in the box", async () => {
  assert.equal(F0.offer("", "wk332@cornell.edu"), "wk332@cornell.edu");
  assert.equal(F0.offer("WK332@cornell.edu", "wk332@cornell.edu"), "", "already in the box: no offer");
  for (const f of ["", null, "not-an-email"]) assert.equal(F0.offer("", f), "", String(f));
  const { F, calls } = make();
  await F.send({ text: "hello", email: "" });
  assert.equal("email" in calls[0].body, false, "the box empty: no email, whatever is on file");
  assert.equal(Copy.fill(Copy.feedback.useEmail, { email: "a@b.co" }), "Use a@b.co");
  const app = fs.readFileSync(path.join(web, "app.js"), "utf8");
  assert.match(app, /id="fb-email" maxlength="\$\{Feedback\.LIMITS\.email\}" value=""/, "the field is drawn empty");
  assert.match(app, /Feedback\.emailOk\(em\.value\)/, "Send checks the field first");
});
