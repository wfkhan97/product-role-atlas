// web/app.js parseRoute: every hash the app links to, read into the screen route() dispatches to.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web } from "./_load.mjs";

const { parseRoute } = require(path.join(web, "app.js"));
const screen = hash => { const r = parseRoute(hash); return [r.name, r.params]; };

test("an empty hash, a bare # and #/ show the start screen", () => {
  for (const h of ["", "#", "#/", undefined]) assert.deepEqual(screen(h), ["start", {}], JSON.stringify(h));
});

test("#/you, #/explore and #/about name their screens", () => {
  assert.deepEqual(screen("#/you"), ["you", {}]);
  assert.deepEqual(screen("#/explore"), ["explore", {}]);
  assert.deepEqual(screen("#/about"), ["about", {}]);
});

test("#/role/<id> opens the role; /fit and /course open its fit and course screens", () => {
  assert.deepEqual(screen("#/role/pm"), ["role", { id: "pm" }]);
  assert.deepEqual(screen("#/role/pm/fit"), ["fit", { id: "pm" }]);
  assert.deepEqual(screen("#/role/pm/course"), ["course", { id: "pm" }]);
  assert.deepEqual(screen("#/role/pm/other"), ["role", { id: "pm" }], "an unknown third part keeps the role screen");
});

test("#/field/<id> opens the field; /event opens its event screen", () => {
  assert.deepEqual(screen("#/field/finance"), ["field", { id: "finance" }]);
  assert.deepEqual(screen("#/field/finance/event"), ["event", { id: "finance" }]);
});

test("#/play/<slug> opens the game, and its query is read as key = value pairs", () => {
  const r = parseRoute("#/play/higher-or-lower?seed=7&mode=hop");
  assert.deepEqual([r.name, r.params], ["play", { slug: "higher-or-lower" }]);
  assert.deepEqual(r.query, { seed: "7", mode: "hop" });
  assert.equal(r.search, "seed=7&mode=hop");
});

test("a value that holds = keeps everything after the first =", () => {
  assert.deepEqual(parseRoute("#/play/build-the-hire?deal=a=b&seed=3").query, { deal: "a=b", seed: "3" });
});

test("the query of the explore screen and the bare key of the event screen are read as those screens read them", () => {
  assert.equal(parseRoute("#/explore?field=finance").query.field, "finance");
  const ev = parseRoute("#/field/finance/event?hackathon");
  assert.equal(ev.name, "event");
  assert.equal(ev.search, "hackathon", "eventScreen reads the first & part of this");
});

test("a path part is URI-decoded; a query value is decoded by URLSearchParams", () => {
  assert.deepEqual(screen("#/role/fp%26a"), ["role", { id: "fp&a" }]);
  assert.equal(parseRoute("#/what-it-asks?role=fp%26a+x").query.role, "fp&a x");
});

test("an unknown screen shows the start screen", () => {
  for (const h of ["#/nope", "#/skill/sql", "#nope", "#/PLAY/x"]) assert.equal(parseRoute(h).name, "start", h);
});

test("a screen name that is also an Object property (constructor, __proto__, toString) shows the start screen", () => {
  // before parseRoute, route() looked the first part up in an object literal and called what it found: #/constructor called Object() and threw
  for (const h of ["#/constructor", "#/__proto__", "#/toString", "#/hasOwnProperty"]) assert.equal(parseRoute(h).name, "start", h);
});

test("parseRoute todo: a malformed percent escape in the path shows the start screen instead of throwing", { todo: "finding: decodeURIComponent throws URIError on \"#/role/%E0\", so route() throws in the hashchange handler and the screen does not change; kept as it was (no behaviour change in this split)" }, () => {
  assert.doesNotThrow(() => parseRoute("#/role/%E0"));
});

test("every screen parseRoute names has an entry in route()'s dispatch table", () => {
  const src = fs.readFileSync(path.join(web, "app.js"), "utf8");
  const table = src.match(/const go = \{([^}]*)\}\[name\]/);
  assert.ok(table, "route() dispatches with `const go = { ... }[name]`");
  const keys = new Set(table[1].split(",").map(x => x.trim().split(":")[0].trim()));
  const names = ["#/", "#/you", "#/explore", "#/about", "#/field/x", "#/field/x/event", "#/role/x", "#/role/x/fit", "#/role/x/course", "#/play/x"].map(h => parseRoute(h).name);
  for (const n of names) assert.ok(keys.has(n), `no dispatch for ${n}`);
});
