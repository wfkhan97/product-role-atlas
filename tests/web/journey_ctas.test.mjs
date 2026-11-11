// The visitor journey, step 5 (2026-11-05): the heart on a role's row and on the open role (one list, kept in the
// browser and, with a session, in the person's own row), the Save with a word on the open role, "Get your tree" on
// the fit screen behind the tree flag, and the calls to action they send (heart, get_tree) through Capture.cta.
// app.js draws them from strings; these tests read the source and the copy table and run capture's cta with the ids.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web } from "./_load.mjs";

const Copy = require(path.join(web, "copy.js"));
const app = fs.readFileSync(path.join(web, "app.js"), "utf8");
const css = fs.readFileSync(path.join(web, "style.css"), "utf8");
const captureFactory = require(path.join(web, "capture.js"));

test("the copy table holds the heart's words, the fit screen's tree box and the saved roles on About you and Explore", () => {
  for (const k of ["save", "saved", "saveAria", "unsaveAria", "kept", "signIn"]) assert.equal(typeof Copy.heart[k], "string", k);
  assert.match(Copy.heart.saveAria, /\{role\}/); assert.match(Copy.heart.unsaveAria, /\{role\}/);
  for (const k of ["heading", "lead", "button"]) assert.equal(typeof Copy.fit.tree[k], "string", k);
  assert.match(Copy.fit.tree.lead, /\{role\}/);
  assert.equal(typeof Copy.you.savedRoles, "string"); assert.equal(typeof Copy.you.noSaved, "string"); assert.equal(typeof Copy.explore.saved, "string");
});

test("the heart is one list (store `hearts`), drawn beside a row's link and never inside it, and on the open role with a word", () => {
  assert.match(app, /const hearted = id => hearts\(\)\.includes\(id\)/);
  assert.match(app, /const heartRow = \(id, label, rowHtml\) => `<div class="rw">\$\{rowHtml\}\$\{heartHtml\(id, \{ label \}\)\}<\/div>`/, "the heart is a sibling of the row's <a>, so a press never follows the link");
  assert.match(app, /heartRow\(r\.id, r\.label, `<a class="r" href="#\/role\/\$\{esc\(r\.id\)\}"/, "the field screen's rows");
  assert.match(app, /<div class="role-head"><h1>\$\{esc\(role\.label\)\}<\/h1>\$\{heartHtml\(role\.id, \{ label: role\.label, save: true \}\)\}<\/div>/, "the open role: the heart with Save beside the title");
  assert.match(app, /e\.preventDefault\(\); e\.stopPropagation\(\); toggleHeart\(b\.dataset\.heart\)/);
  assert.match(css, /\.list \.rw \{ display: flex/); assert.match(css, /\.heart\.on/);
});

test("a press keeps the role in this browser at once, goes to the person's row only with a session, and tells the funnel: click, then done when it turned on", () => {
  const fn = app.slice(app.indexOf("function toggleHeart"), app.indexOf("function paintHearts"));
  assert.match(fn, /Capture\.cta\("heart", "click", \{ role_id: id \}\)/);
  assert.match(fn, /keepHearts\(on \? \[\.\.\.hearts\(\), id\] : hearts\(\)\.filter\(x => x !== id\)\)/);
  assert.match(fn, /if \(on && window\.Capture\) Capture\.cta\("heart", "done", \{ role_id: id \}\)/, "done only when it turned on");
  assert.match(fn, /if \(stateOn\(\)\) State\.heart\(Auth\.stored\(\), id, on\)/, "the server's row only with accounts on and a session");
  assert.match(app, /Capture\.cta\("heart", "shown"/, "shown once per screen that draws a heart");
  assert.match(app, /const heartNote = id => hearted\(id\) && accountsOn\(\) && !Auth\.stored\(\)/, "the sign-in nudge: accounts on, no session, the role hearted");
});

test("Get your tree sits on the fit screen behind the tree flag and a sign-in anyone can use; without a session it goes through the sign-in and back to the form with the role picked", () => {
  // one rule for every door into the map (decision K, 2026-11-10): this box and the top bar's Build skills
  assert.match(app, /const buildOn = \(\) => treeOn\(\) && \(accountsOn\(\) \|\| !!Auth\.stored\(\)\);/);
  assert.match(app, /const treeCta = buildOn\(\) \?/);
  assert.match(app, /const treeHref = `#\/map\?build=1&role=\$\{encodeURIComponent\(role\.id\)\}`/);
  assert.match(app, /Auth\.stored\(\) \? treeHref : `#\/signin\?next=\$\{encodeURIComponent\(treeHref\)\}`/);
  assert.match(app, /Capture\.cta\("get_tree", "click", \{ role_id: role\.id \}\)/);
  assert.match(app, /Capture\.cta\("get_tree", "shown", \{ role_id: role\.id \}\)/);
  assert.match(app, /const picked = Routes\.parseRoute\(location\.hash\)\.query\.role, pre = picked \? F\.find\(f => f\.roles\.some\(r => r\.id === picked\)\) : null/, "the tree form picks the role the link names");
  const { parseRoute } = require(path.join(web, "app.js"));
  const next = "#/map?build=1&role=fpa";
  assert.ok(/^#\/(?!signin)[a-z][a-z0-9_/?=&.%-]*$/i.test(next), "the return hash passes the sign-in's rule for `next`");
  assert.deepEqual(parseRoute(next).query, { build: "1", role: "fpa" });
});

test("capture accepts the two new ids: cta_shown, cta_click and cta_done rows with cta heart and get_tree", async () => {
  const calls = [];
  const C = captureFactory({ fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true }; }, config: () => ({ CAPTURE_ENABLED: true, JOURNEY_ENABLED: true, SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "pk" }), storage: () => null, local: () => null });
  for (const id of ["heart", "get_tree"]) for (const step of ["shown", "click", "done"]) assert.equal(await C.cta(id, step, { role_id: "fpa" }), true);
  assert.deepEqual(calls.map(r => [r.name, r.cta, r.role_id]), [["cta_shown", "heart", "fpa"], ["cta_click", "heart", "fpa"], ["cta_done", "heart", "fpa"], ["cta_shown", "get_tree", "fpa"], ["cta_click", "get_tree", "fpa"], ["cta_done", "get_tree", "fpa"]]);
  for (const r of calls) assert.ok(!("text" in r) && !("label" in r), "no text leaves");
});
