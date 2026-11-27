// web/app.js OpenFlow: the pure part of the open form (#/map/find/<step>, 2026-11-12), one question per screen for a
// visitor with no session. The steps with the build quests on and off, the answers as a reload reads them back, what a
// step lacks (so Next says it instead of staying grey), the step a reload may land on, the role the fit screen's link
// names; and the form's words: it finds projects for a portfolio, never "Build my tree".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web, readJson } from "./_load.mjs";

const { OpenFlow } = require(path.join(web, "app.js"));
const Copy = require(path.join(web, "copy.js"));
const src = fs.readFileSync(path.join(web, "app.js"), "utf8");

test("the steps: roles, résumé, how technical, tools, share, email with the build quests on; roles, résumé, email with them off", () => {
  assert.deepEqual(OpenFlow.steps(true), ["roles", "resume", "tech", "tools", "share", "email"]);
  assert.deepEqual(OpenFlow.steps(false), ["roles", "resume", "email"], "c to e only steer the model");
  assert.equal(OpenFlow.steps(true).at(-1), "email", "the email comes last");
  assert.equal(OpenFlow.step("accounts"), "share", "the old step's address lands on the share step");
  assert.equal(OpenFlow.step("tools"), "tools");
});

test("clean: a stored value as the form reads it; anything else is dropped", () => {
  const empty = { roles: [], tech: null, tools: {}, own_tools: "", try_new: null, places: null, own_places: "", portfolio: { has: null, host: null, note: "" }, email: "", posting: "" };
  for (const v of [null, undefined, "x", 3, [], { roles: "pmm" }]) assert.deepEqual(OpenFlow.clean(v), empty, JSON.stringify(v));
  const c = OpenFlow.clean({ roles: ["pmm", "pmm", "", 4, "bd", "cs", "x", "y"], tech: "no_code", tools: { design_decks: "use", research: "learn", x: 1 }, accounts: { github: "have" }, email: "a@b.co", posting: 7,
    own_tools: "PowerPoint", try_new: "yes", places: ["linkedin", "linkedin", 3, "x"], own_places: "Substack", portfolio: { has: true, host: "notion", note: "me.com" } });
  assert.deepEqual(c.roles, ["pmm", "bd", "cs", "x"], "no repeat, no blank, four at most");
  assert.equal(c.tech, "no_code");
  assert.deepEqual(c.tools, { design_decks: "use" }, "a kind is tapped or not: only `use` stays");
  assert.ok(!("accounts" in c), "the accounts answer is gone");
  assert.deepEqual([c.email, c.posting, c.own_tools, c.try_new, c.places, c.own_places], ["a@b.co", "", "PowerPoint", null, ["linkedin", "x"], "Substack"]);
  assert.deepEqual(c.portfolio, { has: true, host: "notion", note: "me.com" });
  assert.equal(OpenFlow.clean({ tech: "hacker" }).tech, null, "a tech outside the four answers");
  assert.deepEqual(Object.keys(Copy.map.flow.tech.options), ["no_code", "ai_tools", "read_code", "write_code"]);
  assert.equal(OpenFlow.clean({ posting: "x".repeat(30000) }).posting.length, 20000);
  assert.equal(OpenFlow.clean({ own_tools: "x".repeat(400), own_places: "y".repeat(400), portfolio: { note: "z".repeat(400) } }).own_tools.length, 300);
  assert.equal(OpenFlow.clean({ own_places: "y".repeat(400) }).own_places.length, 200);
  assert.equal(OpenFlow.clean({ portfolio: { note: "z".repeat(400) } }).portfolio.note.length, 120);
  assert.deepEqual(OpenFlow.clean({ places: [] }).places, [], "a person who untapped every place");
});

test("missing: what a step lacks, or null; tools and share can always be skipped", () => {
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

test("the roles' type-ahead ranks the label typed in full first, leaves other fields out once one is set, and tells two roles of one label apart", () => {
  const roles = OpenFlow.named([
    { id: "pmm", label: "Product Marketing Manager", field: "marketing", fieldLabel: "Marketing" },
    { id: "brand", label: "Brand Manager", field: "marketing", fieldLabel: "Marketing" },
    { id: "product.pmm", label: "Product Marketing Manager", field: "product", fieldLabel: "Product" },
    { id: "product.pm", label: "Product Manager", field: "product", fieldLabel: "Product" },
    { id: "product.gpm", label: "Group Product Manager", field: "product", fieldLabel: "Product" },
  ]);
  assert.equal(OpenFlow.hits(roles, [], "product manager")[0].id, "product.pm", "the audit's bug: Enter on \"product manager\" added Product Marketing Manager");
  assert.deepEqual(OpenFlow.hits(roles, [], "product man").map(r => r.id).slice(0, 2), ["product.pm", "pmm"], "a label that starts with what was typed comes next");
  assert.deepEqual(OpenFlow.hits(roles, [], "manager", "product").map(r => r.id), ["product.pmm", "product.pm", "product.gpm"], "a field set: its roles alone");
  assert.deepEqual(OpenFlow.hits(roles, ["product.pm"], "product manager", "product").map(r => r.id), ["product.pmm", "product.gpm"], "a picked role is not offered again");
  assert.deepEqual(OpenFlow.hits(roles, [], "  "), []);
  assert.ok(OpenFlow.hits(roles, [], "a").length <= 6);
  assert.deepEqual(roles.filter(r => r.label === "Product Marketing Manager").map(r => r.name), ["Product Marketing Manager (Marketing)", "Product Marketing Manager (Product)"]);
  assert.equal(roles.find(r => r.id === "brand").name, "Brand Manager", "a label used once stays as it is");
});

test("the field's kinds and places: file order, a code kind only for a person who reads code, social and page places of the field, LinkedIn before any tap", () => {
  const kit = readJson("build_kit.json"), Quests = require(path.join(web, "quests.js"));
  for (const f of ["marketing", "software", "finance", "legal", "data_ai"]) for (const t of [null, "no_code", "read_code", "write_code"]) assert.deepEqual(OpenFlow.fieldKinds(kit, f, t), Quests.fieldKinds(kit, f, t), `${f} ${t}: the same rule as web/quests.js`);
  assert.ok(!OpenFlow.fieldKinds(kit, "software", "no_code").includes("coding_agents"));
  assert.ok(OpenFlow.fieldKinds(kit, "software", "write_code").includes("coding_agents"));
  const ids = OpenFlow.fieldPlaces(kit, "marketing").map(p => p.id);
  assert.equal(ids[0], "linkedin");
  assert.ok(!ids.includes("portfolio"), "the portfolio is the share step's own question");
  assert.ok(!ids.includes("kaggle"), "a place of another field");
  assert.deepEqual(OpenFlow.shownPlaces({ places: null }, kit, "marketing"), ["linkedin"], "nothing tapped yet: LinkedIn");
  assert.deepEqual(OpenFlow.shownPlaces({ places: [] }, kit, "marketing"), [], "untapped stays untapped");
  assert.deepEqual(OpenFlow.shownPlaces({ places: ["kaggle", "x"] }, kit, "marketing"), ["x"], "a place of another field is dropped");
});

test("answers: what /api/open and /api/quests take, cleaned the same way the server cleans them", () => {
  const kit = readJson("build_kit.json"), Quests = require(path.join(web, "quests.js"));
  const flow = { roles: ["pmm"], tech: "no_code", tools: { design_decks: "use", coding_agents: "use", research: "use" }, own_tools: " PowerPoint, Canva ", try_new: false, places: ["linkedin", "substack"], own_places: " my newsletter ", portfolio: { has: true, host: "squarespace", note: " me.com " }, email: "a@b.co" };
  const a = OpenFlow.answers(flow, kit, "marketing");
  assert.deepEqual(a, { tech: "no_code", tools: { design_decks: "use", research: "use" }, own_tools: "PowerPoint, Canva", try_new: false, places: ["linkedin", "substack"], own_places: "my newsletter", portfolio: { host: "squarespace", note: "me.com" } });
  assert.deepEqual(Quests.cleanAnswers(a, kit), a, "nothing the server would drop");
  assert.deepEqual(OpenFlow.answers({ ...flow, portfolio: { has: false, host: "squarespace", note: "me.com" } }, kit, "marketing").portfolio, { host: null, note: "" }, "No: no host goes");
  assert.deepEqual(OpenFlow.answers({}, kit, "marketing").places, ["linkedin"], "LinkedIn when nothing was tapped");
});

test("the answers leave with the résumé: the form keeps OpenFlow.answers on the tree and writeOpen sends them, with feedback and avoid on None of these", () => {
  const w = src.slice(src.indexOf("function writeOpen(held, ask)"), src.indexOf("const loadApprentice"));
  assert.match(w, /answers: heldAnswers\(held\)/);
  assert.match(w, /body\.feedback = .*body\.avoid = /);
  assert.match(src, /answers: quests \? OF\.answers\(flow, kit, field0\(\)\) : null/);
  assert.match(src, /const OPEN_FLOW_KEY = "open\.flow";/, "the form's own key");
});

test("the skill tree flag ships off, with the session line's address null; off, #/map is the open flow for a session too", () => {
  const cfg = fs.readFileSync(path.join(web, "config.js"), "utf8");
  assert.match(cfg, /\n  SKILL_TREE_ENABLED: false,/);
  assert.match(cfg, /\n  SESSION_URL: null,/);
  const ms = src.slice(src.indexOf("async function mapScreen()"), src.indexOf("const treeOn = "));
  assert.ok(ms.indexOf("if (!skillTreeOn() && openOn()) { await openScreen(); return; }") < ms.indexOf("await mapGate()"), "before the session's map is read");
  assert.match(src, /const treeCta = buildOn\(\) && skillTreeOn\(\) \?/);
  assert.equal(Copy.map.open.projects.session, "Having trouble? Book a free 30-minute session with Wally.");
});
