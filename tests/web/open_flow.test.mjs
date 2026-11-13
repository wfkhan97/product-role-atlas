// web/app.js OpenFlow: the pure part of the open form (#/map/find/<step>, 2026-11-12), one question per screen for a
// visitor with no session. The steps with the build quests on and off, the answers as a reload reads them back, what a
// step lacks (so Next says it instead of staying grey), the step a reload may land on, the role the fit screen's link
// names; and the form's words: it finds projects for a portfolio, never "Build my tree".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web } from "./_load.mjs";

const { OpenFlow } = require(path.join(web, "app.js"));
const Copy = require(path.join(web, "copy.js"));
const src = fs.readFileSync(path.join(web, "app.js"), "utf8");

test("the steps: roles, résumé, how technical, tools, accounts, email with the build quests on; roles, résumé, email with them off", () => {
  assert.deepEqual(OpenFlow.steps(true), ["roles", "resume", "tech", "tools", "accounts", "email"]);
  assert.deepEqual(OpenFlow.steps(false), ["roles", "resume", "email"], "c to e only steer the model");
  assert.equal(OpenFlow.steps(true).at(-1), "email", "the email comes last");
});

test("clean: a stored value as the form reads it; anything else is dropped", () => {
  const empty = { roles: [], tech: null, tools: {}, accounts: {}, email: "", posting: "" };
  for (const v of [null, undefined, "x", 3, [], { roles: "pmm" }]) assert.deepEqual(OpenFlow.clean(v), empty, JSON.stringify(v));
  const c = OpenFlow.clean({ roles: ["pmm", "pmm", "", 4, "bd", "cs", "x", "y"], tech: "no_code", tools: { image: "use" }, accounts: ["github"], email: "a@b.co", posting: 7 });
  assert.deepEqual(c.roles, ["pmm", "bd", "cs", "x"], "no repeat, no blank, four at most");
  assert.equal(c.tech, "no_code");
  assert.deepEqual([c.tools, c.accounts, c.email, c.posting], [{ image: "use" }, {}, "a@b.co", ""]);
  assert.equal(OpenFlow.clean({ tech: "hacker" }).tech, null, "a tech outside the four answers");
  assert.deepEqual(Object.keys(Copy.map.flow.tech.options), ["no_code", "ai_tools", "read_code", "write_code"]);
  assert.equal(OpenFlow.clean({ posting: "x".repeat(30000) }).posting.length, 20000);
});

test("missing: what a step lacks, or null; tools and accounts can always be skipped", () => {
  const none = { roles: [], resume: false, tech: null, email: "" };
  assert.deepEqual(OpenFlow.STEPS.map(s => OpenFlow.missing(s, none)), ["roles", "resume", "tech", null, null, "email"]);
  const all = { roles: ["pmm"], resume: true, tech: "write_code", email: " someone@school.edu " };
  assert.deepEqual(OpenFlow.STEPS.map(s => OpenFlow.missing(s, all)), [null, null, null, null, null, null]);
  for (const e of ["nope", "a@b", "a b@c.d", "@c.d", "x".repeat(320) + "@b.co"]) assert.equal(OpenFlow.missing("email", { email: e }), "email", e);
});

test("firstMissing: the first step that lacks something, or only those before a step (where a reload may land)", () => {
  const steps = OpenFlow.steps(true);
  assert.equal(OpenFlow.firstMissing(steps, { roles: [], resume: true, tech: "no_code", email: "a@b.co" }), "roles");
  assert.equal(OpenFlow.firstMissing(steps, { roles: ["pmm"], resume: false, tech: null, email: "" }), "resume");
  assert.equal(OpenFlow.firstMissing(steps, { roles: ["pmm"], resume: true, tech: null, email: "" }, "tools"), "tech", "a reload on tools without a tech answer goes back to it");
  assert.equal(OpenFlow.firstMissing(steps, { roles: ["pmm"], resume: true, tech: "no_code", email: "" }, "email"), null, "the email step itself is reachable");
  assert.equal(OpenFlow.firstMissing(steps, { roles: ["pmm"], resume: true, tech: "no_code", email: "" }), "email");
  assert.equal(OpenFlow.firstMissing(OpenFlow.steps(false), { roles: ["pmm"], resume: true, tech: null, email: "a@b.co" }), null, "flag off: no tech asked");
});

test("preselect: the fit screen's role goes first, beside roles of its field, or alone", () => {
  const field = { pmm: "marketing", brand: "marketing", bd: "bizdev" };
  const of = id => field[id];
  assert.deepEqual(OpenFlow.preselect([], "pmm", of), ["pmm"]);
  assert.deepEqual(OpenFlow.preselect(["brand"], "pmm", of), ["pmm", "brand"]);
  assert.deepEqual(OpenFlow.preselect(["brand", "pmm"], "pmm", of), ["pmm", "brand"], "already picked: moved to the front");
  assert.deepEqual(OpenFlow.preselect(["bd"], "pmm", of), ["pmm"], "another field: the named role alone");
  assert.deepEqual(OpenFlow.preselect(["a1", "a2", "a3", "a4"].map(x => x), "a5", () => "f"), ["a5", "a1", "a2", "a3"], "four at most");
  assert.deepEqual(OpenFlow.preselect(["brand"], null, of), ["brand"]);
});

test("the words: the open form finds projects for a portfolio; the skill tree is what they come from, not the goal", () => {
  const O = Copy.map.open;
  assert.equal(O.heading, "Find projects for your portfolio");
  assert.equal(O.find, "Find my projects");
  assert.equal(O.finding, "Finding your projects…");
  const words = JSON.stringify(O);
  for (const old of ["Build my tree", "Get your skill tree", "Building your tree", "Sign in", "sign in"]) assert.ok(!words.includes(old), old);
  const form = src.slice(src.indexOf("async function openForm("), src.indexOf("async function drawOpenNext"));
  assert.ok(!/T\.build\b|T\.building\b|signin/.test(form), "the form draws none of the signed-in form's build words and no sign-in");
  assert.equal(Copy.map.tree.build, "Compare my skills", "the signed-in form keeps its own words");
});

test("the answers leave with the résumé: writeOpen sends tech, tools and accounts as /api/open takes them", () => {
  const w = src.slice(src.indexOf("function writeOpen(held)"), src.indexOf("const loadApprentice"));
  assert.match(w, /answers: \{ tech: held\.tech \|\| null, tools: held\.tools \|\| \{\}, accounts: held\.accounts \|\| \{\} \}/);
  assert.match(src, /const OPEN_FLOW_KEY = "open\.flow";/, "the form's own key");
});
