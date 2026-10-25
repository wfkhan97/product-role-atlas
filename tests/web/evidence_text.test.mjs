// web/evidence_text.js: every sentence a screen shows about a skill, built from the data files. Inline fixtures.
import test from "node:test";
import assert from "node:assert/strict";
import { require, web } from "./_load.mjs";
import path from "path";

const { create, KINDS } = require(path.join(web, "evidence_text.js"));
const T = create({});
const ROADMAP = { id: "roadmap", name: "Roadmapping", kind: "method", signals: ["Owned the roadmap for 3 squads."],
  how_shown: { form: "artefact", artefacts: ["roadmap", "quarterly plan"], counterparts: ["engineering", "design", "leadership"], measures: ["initiatives shipped against plan", "quarters planned"], verbs: ["owned", "built"], shown_by: [] },
  fields: { product: { reads_as: "The plan the team builds from.", shown_by: ["prd"], line: "Owned the roadmap for 3 squads; 11 of 14 initiatives shipped on plan." } } };
const COMM = { id: "communication", name: "Written & verbal communication", kind: "behaviour", signals: [],
  how_shown: { form: "through", artefacts: ["memo", "deck"], counterparts: ["executives"], measures: ["decisions the document carried"], verbs: ["wrote"], shown_by: ["prd", "exec_communication"] },
  fields: { finance: { reads_as: "Reporting packages leaders read to decide.", shown_by: ["financial_reporting", "business_case"], line: "Wrote the monthly variance commentary for a $120M cost base." } } };
const EXCEL = { id: "advanced_excel", name: "Advanced Excel modelling", kind: "tool", how_shown: { form: "named", artefacts: [], counterparts: [], measures: [], verbs: ["modelled in"], shown_by: [] } };
const NAMES = { prd: "PRDs", exec_communication: "Executive communication", financial_reporting: "Financial reporting", business_case: "Business cases" };
const nameOf = id => NAMES[id] || id;

test("line: the field entry's line comes first, then the product signals, then a template from how_shown", () => {
  assert.deepEqual(T.line(ROADMAP, "product"), { text: ROADMAP.fields.product.line, source: "field", field: "product", role: false });
  assert.deepEqual(T.line(ROADMAP, "finance"), { text: ROADMAP.signals[0], source: "signals" });
  const t = T.line({ ...ROADMAP, signals: [] }, "finance");
  assert.equal(t.source, "template");
  assert.equal(t.text, "Owned the roadmap with engineering, design; initiatives shipped against plan.");
});

test("line: a template names its slots and never invents a number", () => {
  for (const s of [ROADMAP, COMM, EXCEL]) {
    const t = T.template(s);
    assert.ok(!/\d/.test(t), `no digit in "${t}"`);
    assert.ok(!/undefined|null|\[|\]|\s;|\.\./.test(t), `no empty slot in "${t}"`);
    assert.ok(t.split(" ").length < 40, "under 40 words");
  }
  assert.equal(T.template({ name: "Owning", kind: "method", how_shown: { form: "outcome", artefacts: ["P&L"], counterparts: [], measures: ["revenue"], verbs: ["owned"] } }), "Owned the P&L; revenue.");
  assert.equal(T.template({ name: "Pay", kind: "knowledge", how_shown: { form: "context", artefacts: ["payments product"], counterparts: ["risk"], measures: [], verbs: ["launched"] } }), "Launched a payments product for risk.");
  assert.ok(T.template(COMM).startsWith("Never a line of its own"), "a behaviour has no line of its own");
});

test("reads and sayIt: the field's reading, with the field's line, when the field has an entry", () => {
  assert.equal(T.reads(COMM, "finance"), "Reporting packages leaders read to decide.");
  assert.equal(T.reads(COMM, "sales"), null);
  assert.deepEqual(T.sayIt(ROADMAP, "product"), { reads: "The plan the team builds from.", line: ROADMAP.fields.product.line, source: "field" });
});

test("gap: a method names its artefact and what changed; a practice who and how many; a tool a line of work", () => {
  assert.equal(T.gap({ kind: "method" }, ROADMAP), "Name the roadmap you produced and what changed: initiatives shipped against plan, quarters planned.");
  assert.equal(T.gap({ kind: "practice" }, { name: "Stakeholders", kind: "practice", how_shown: { counterparts: ["executives", "partner teams"], measures: ["stakeholders managed"] } }), "Say who you worked with (executives, partner teams), how many, and what you were trusted with: stakeholders managed.");
  assert.equal(T.gap({ kind: "tool" }, EXCEL), "Name Advanced Excel modelling inside a line of work that used it, not only in a skills list.");
  assert.equal(T.gap({ kind: "technical" }, { name: "SQL", kind: "technical", how_shown: { artefacts: ["queries"], measures: ["tables queried"] } }), "Say what you built or queried: queries; tables queried.");
  assert.equal(T.gap({ kind: "knowledge" }, { name: "Fintech", kind: "knowledge", how_shown: { artefacts: ["payments product"] } }), "Name the industry in your lines of work: payments product. One line is enough.");
  assert.equal(T.gap({ kind: "credential" }, { name: "CPA", kind: "credential", how_shown: {} }), "Name cpa once, with its date, where a reader looks for it.");
});

test("gap: a behaviour names the two carriers the role asks for that the resume does not show, or the one it does", () => {
  const row = { kind: "behaviour", status: "gap", carriers: ["prd", "exec_communication", "business_case"] };
  assert.equal(T.gap(row, COMM, { shown: new Set(), nameOf }), "Never a line of its own. Show it through PRDs or Executive communication, which these postings ask for most.");
  assert.equal(T.gap({ ...row, carriersFallback: true }, COMM, { shown: new Set(), nameOf }), "Never a line of its own. Show it through PRDs or Executive communication, which these postings ask for most in this field.");
  assert.equal(T.gap({ ...row, status: "thin" }, COMM, { shown: new Set(["exec_communication"]), nameOf }), "Never a line of its own: your line about Executive communication shows written & verbal communication once it carries a result.");
  assert.equal(T.gap({ ...row, status: "through", through: "prd" }, COMM, { shown: new Set(["prd"]), nameOf }), "Never a line of its own: your line about PRDs already shows written & verbal communication.");
  assert.ok(T.gap({ kind: "behaviour", carriers: [] }, COMM, {}).startsWith("Never a line of its own"), "with no carrier at all, the kind's rule and the artefacts");
});

test("thin names the measures to add; how gives the kind's rule; the index's kinds table wins over the default", () => {
  assert.equal(T.thin(ROADMAP), "Add a number: initiatives shipped against plan, quarters planned.");
  assert.equal(T.thin(EXCEL), "Add a number: how much, how many, or what changed.");
  assert.equal(T.how("method"), KINDS.method.how);
  const own = create({ kinds: { method: { label: "Craft", form: "artefact", how: "Own rule." } } });
  assert.equal(own.how("method"), "Own rule.");
  assert.equal(own.how("behaviour"), KINDS.behaviour.how, "a kind the table lacks falls back to the behaviour's rule");
});

// ---------- role overrides (PLAN.md v16, step 6): a list of keys, the role's own entry first ----------
test("line and reads take a list of keys and read the role's override before its field's entry", () => {
  const skill = { ...ROADMAP, fields: { ...ROADMAP.fields, "role:corp_dev": { reads_as: "The deal roadmap.", shown_by: ["prd"], line: "Sequenced 4 deals over 2 years." } } };
  assert.deepEqual(T.line(skill, ["role:corp_dev", "product"]), { text: "Sequenced 4 deals over 2 years.", source: "field", field: "role:corp_dev", role: true });
  assert.equal(T.reads(skill, ["role:corp_dev", "product"]), "The deal roadmap.");
  assert.deepEqual(T.line(skill, ["role:treasury", "product"]), { text: ROADMAP.fields.product.line, source: "field", field: "product", role: false }, "no override for this role: the field's entry");
  assert.equal(T.line(skill, ["role:treasury", "finance"]).source, "signals", "neither key present: the next source");
  assert.equal(T.reads(skill, []), null);
});
