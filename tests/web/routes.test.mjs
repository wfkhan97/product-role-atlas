// web/app.js parseRoute: every hash the app links to, read into the screen route() dispatches to.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web } from "./_load.mjs";

const { parseRoute } = require(path.join(web, "app.js"));
const screen = hash => { const r = parseRoute(hash); return [r.name, r.params]; };

test("an empty hash, a bare # and #/ show the door", () => {
  for (const h of ["", "#", "#/", undefined]) assert.deepEqual(screen(h), ["door", {}], JSON.stringify(h));
});

test("#/home is home; #/jobs, #/skills and #/network are the verbs (v19 B2), named so their hrefs never change", () => {
  assert.deepEqual(screen("#/home"), ["home", {}]);
  assert.deepEqual(screen("#/jobs"), ["jobs", {}]);
  assert.deepEqual(screen("#/skills"), ["skills", {}]);
  assert.deepEqual(screen("#/network"), ["network", {}]);
  assert.deepEqual(screen("#/jobs/extra"), ["jobs", {}], "a second part changes nothing yet");
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
  const r = parseRoute("#/play/know-the-role?seed=7&mode=hop");
  assert.deepEqual([r.name, r.params], ["play", { slug: "know-the-role" }]);
  assert.deepEqual(r.query, { seed: "7", mode: "hop" });
  assert.equal(r.search, "seed=7&mode=hop");
});

test("a value that holds = keeps everything after the first =", () => {
  assert.deepEqual(parseRoute("#/play/skill-path?deal=a=b&seed=3").query, { deal: "a=b", seed: "3" });
});

test("the query of the explore screen and the bare key of the event screen are read as those screens read them", () => {
  assert.equal(parseRoute("#/explore?field=finance").query.field, "finance");
  const ev = parseRoute("#/field/finance/event?hackathon");
  assert.equal(ev.name, "event");
  assert.equal(ev.search, "hackathon", "eventScreen reads the first & part of this");
});

test("a path part is URI-decoded; a query value is decoded by URLSearchParams", () => {
  assert.deepEqual(screen("#/role/fp%26a"), ["role", { id: "fp&a" }]);
  assert.equal(parseRoute("#/know-the-role?role=fp%26a+x").query.role, "fp&a x");
});

test("an unknown screen shows home", () => {
  for (const h of ["#/nope", "#/skill/sql", "#nope", "#/PLAY/x", "#/start"]) assert.equal(parseRoute(h).name, "home", h);
});

test("a screen name that is also an Object property (constructor, __proto__, toString) shows home", () => {
  // before parseRoute, route() looked the first part up in an object literal and called what it found: #/constructor called Object() and threw
  for (const h of ["#/constructor", "#/__proto__", "#/toString", "#/hasOwnProperty"]) assert.equal(parseRoute(h).name, "home", h);
});

test("a path part that cannot be decoded shows home instead of throwing", () => {
  // decodeURIComponent throws URIError on "%E0"; route() used to throw in the hashchange handler and leave the screen as it was
  for (const h of ["#/role/%E0", "#/%", "#/play/x%ZZ?seed=1"]) assert.deepEqual(screen(h), ["home", {}], h);
});

test("every screen parseRoute names has an entry in route()'s dispatch table", () => {
  const src = fs.readFileSync(path.join(web, "app.js"), "utf8");
  const table = src.match(/const go = \{([^}]*)\}\[name\]/);
  assert.ok(table, "route() dispatches with `const go = { ... }[name]`");
  const keys = new Set(table[1].split(",").map(x => x.trim().split(":")[0].trim()));
  const names = ["#/", "#/home", "#/jobs", "#/skills", "#/network", "#/you", "#/explore", "#/about", "#/field/x", "#/field/x/event", "#/role/x", "#/role/x/fit", "#/role/x/course", "#/play/x", "#/classes", "#/professor/x", "#/signin", "#/map"].map(h => parseRoute(h).name);
  for (const n of names) assert.ok(keys.has(n), `no dispatch for ${n}`);
});

test("#/classes, #/professor/<slug> and #/signin name the Spring 2027 screens", () => {
  assert.deepEqual(screen("#/classes"), ["classes", {}]);
  assert.deepEqual(parseRoute("#/classes?open=TEST%201010").query, { open: "TEST 1010" });
  assert.deepEqual(screen("#/professor/jane-doe"), ["professor", { slug: "jane-doe" }]);
  assert.deepEqual(screen("#/signin"), ["signin", {}]);
});

test("a query on a screen's hash comes through: the wizard's step and the role screen's tab", () => {
  const you = parseRoute("#/you?step=2"); assert.equal(you.name, "you"); assert.deepEqual(you.query, { step: "2" });
  const role = parseRoute("#/role/fpa?tab=skills"); assert.equal(role.name, "role"); assert.deepEqual(role.query, { tab: "skills" });
});
