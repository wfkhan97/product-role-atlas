// web/preview.js: the two projects under the open tree and the booking link (2026-11-11). No model, no network: the
// same tree and the same files give the same options.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { web, require, readJson, Matcher, realAtlas } from "./_load.mjs";

const Preview = require(path.join(web, "preview.js"));
const Apprentice = require(path.join(web, "apprentice.js"));
const EvidenceText = require(path.join(web, "evidence_text.js"));
const STANDARDS = readJson("standards.json");

const node = (id, state, share = 0.5) => ({ id, name: id.replace(/_/g, " "), state, share: { r: share } });
const mapOf = (nodes, role = "r") => ({ role: { id: role, label: "Role" }, tree: { nodes, behaviours: [], more: [] } });
const show = (id, stage, skills, artifacts = [`A ${id} piece`], means = `Do the ${id} work.`) => ({ id, label: id, stage, means, artifacts, skills });

test("the shows that practise what the person has to build come first, two at most", () => {
  const standards = { roles: { r: { also_serves: [], shows: [show("a", "build", ["held"]), show("b", "foundation", ["gap_small"]), show("c", "build", ["gap_big", "gap_small"]), show("d", "build", ["gap_big"])] } } };
  const map = mapOf([node("held", "shows", 0.9), node("gap_big", "must build", 0.7), node("gap_small", "must evidence better", 0.2)]);
  const out = Preview.pick(map, { standards });
  assert.deepEqual(out.map(o => o.id), ["c", "d"]);
  assert.deepEqual(out[0], { id: "c", title: "A c piece", text: "Do the c work.", skills: ["gap big", "gap small"], from: "standards" });
});

test("on a tie a build show comes before a foundation one, then the file's order", () => {
  const standards = { roles: { r: { also_serves: [], shows: [show("f", "foundation", []), show("b1", "build", []), show("b2", "build", [])] } } };
  assert.deepEqual(Preview.pick(mapOf([node("x", "shows")]), { standards }).map(o => o.id), ["b1", "b2"]);
});

test("a role named under also_serves takes that entry", () => {
  const standards = { roles: { other: { also_serves: ["r"], shows: [show("a", "build", []), show("b", "build", [])] } } };
  assert.equal(Preview.pick(mapOf([node("x", "must build")]), { standards }).length, 2);
});

test("a role with no entry gets its options from the tree: a skill to build that an artifact shows", () => {
  const skillById = {
    cash: { what: "Forecast the company's cash.", how_shown: { form: "artifact", artefacts: ["cash forecast"] } },
    held: { what: "Already shown.", how_shown: { form: "artifact", artefacts: ["old deck"] } },
    tools: { what: "Spreadsheets.", how_shown: { form: "named", artefacts: [] } },
    fx: { what: "Hedge currency swings.", how_shown: { form: "artifact", artefacts: ["hedging program"] } },
  };
  const map = mapOf([node("held", "shows", 0.9), node("tools", "must build", 0.8), node("fx", "must build", 0.4), node("cash", "must build", 0.7)]);
  const out = Preview.pick(map, { standards: { roles: {} }, skillById });
  assert.deepEqual(out.map(o => [o.id, o.title, o.from]), [["cash", "Cash forecast", "tree"], ["fx", "Hedging program", "tree"]]);
  assert.equal(out[0].text, "Forecast the company's cash.");
});

test("one show and the tree fill two; nothing to draw from gives none", () => {
  const standards = { roles: { r: { also_serves: [], shows: [show("a", "build", ["cash"])] } } };
  const skillById = { cash: { what: "Forecast the company's cash.", how_shown: { form: "artifact", artefacts: ["cash forecast"] } } };
  assert.deepEqual(Preview.pick(mapOf([node("cash", "must build")]), { standards, skillById }).map(o => o.from), ["standards", "tree"]);
  assert.deepEqual(Preview.pick(mapOf([node("cash", "must build")]), {}), []);
  assert.deepEqual(Preview.pick(null, { standards }), []);
});

test("no option states a length of time", () => {
  assert.ok(Preview.hasDuration("A 30-second voicemail pitch"));
  assert.ok(Preview.hasDuration("Ship it in two weeks"));
  assert.ok(!Preview.hasDuration("A positioning document for a real product"));
  const standards = { roles: { r: { also_serves: [], shows: [show("a", "build", [], ["A 30-second voicemail pitch", "A call script"]), show("b", "build", [], ["A plan"], "Write it in one hour.")] } } };
  const out = Preview.pick(mapOf([node("x", "must build")]), { standards });
  assert.deepEqual(out.map(o => o.title), ["A call script"]);
});

// A show whose line states a length (the investment pitch's "ten minutes") is left out, so that role's second option
// comes from the tree (the test after this one); every role keeps at least one option of its own.
test("the published standards file: every role yields its options, each a title and a line, none with a duration", () => {
  for (const [id, entry] of Object.entries(STANDARDS.roles)) {
    const out = Preview.pick(mapOf([node("nothing_named", "must build")], id), { standards: STANDARDS });
    const usable = entry.shows.filter(s => !Preview.hasDuration(s.means) && s.artifacts.some(a => !Preview.hasDuration(a))).length;
    assert.ok(usable >= 1, `${id}: no show without a length of time`);
    assert.equal(out.length, Math.min(2, usable), `${id}: ${out.length} options`);
    for (const o of out) {
      assert.ok(o.title && o.text, `${id}/${o.id}`);
      assert.ok(!Preview.hasDuration(o.title) && !Preview.hasDuration(o.text), `${id}/${o.id} states a length of time`);
      assert.deepEqual(Object.keys(o).sort(), ["from", "id", "skills", "text", "title"]);   // a title and a line: no steps, no tools, no prompt
    }
    assert.ok(entry.shows.length >= 2);
  }
});

test("a real tree: a role in the standards file and one outside it both get two options", async () => {
  const A = realAtlas(), ix = await A.index();
  const profile = "Product marketing intern at a logistics startup. Wrote launch emails and a competitor comparison for the sales team. Ran customer interviews with twelve freight forwarders and summarised the findings for the product lead.";
  for (const [role, from] of [["pmm", "standards"], ["treasury", "tree"]]) {
    const g = await Apprentice.ground({ A, Matcher, EvidenceText }, { profile, roles: [role], posting: "" });
    const { map } = Apprentice.selfServeMap(g, {});
    const out = Preview.pick(map, { standards: STANDARDS, skillById: ix.skillById });
    assert.equal(out.length, 2, role);
    assert.ok(out.every(o => o.from === from), `${role}: ${out.map(o => o.from)}`);
    assert.deepEqual(out, Preview.pick(map, { standards: STANDARDS, skillById: ix.skillById }));   // the same again
  }
});

test("the booking link: Tally's page with the hidden fields, and null without a form id", () => {
  assert.equal(Preview.bookingHref(null, { email: "a@b.co" }), null);
  assert.equal(Preview.bookingHref("", {}), null);
  assert.equal(Preview.bookingHref("../evil", {}), null);
  assert.equal(Preview.bookingHref("https://x.y/z", {}), null);
  const u = new URL(Preview.bookingHref("wA1b2C", { email: "a+b@school.edu", role: "pmm" }));
  assert.equal(u.origin + u.pathname, "https://tally.so/r/wA1b2C");
  assert.deepEqual(Object.fromEntries(u.searchParams), { surface: "build", source: "open_tree", role: "pmm", email: "a+b@school.edu" });
});

test("the open tree is on with a booking form id (owner, 2026-11-11), and so is the side-project flow", () => {
  globalThis.window = {}; require(path.join(web, "config.js")); const C = globalThis.window.CONFIG; delete globalThis.window;
  assert.equal(C.OPEN_TREE_ENABLED, true);
  assert.ok(Preview.bookingHref(C.BOOKING_TALLY, {}), "the id reads as a Tally form id");
  assert.equal(C.QUESTS_ENABLED, true);
});
