import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Pick = require("../../web/pick.js");

const opts = [{ value: "pm", label: "Product Manager" }, { value: "fpa", label: "FP&A Analyst", hint: "Finance" }, { value: "ops", label: "Operations Manager" }];

test("an empty query lists every option", () => { assert.equal(Pick.filter(opts, "").length, 3); });
test("every typed word must be in the label or the hint, label starts first", () => {
  assert.deepEqual(Pick.filter(opts, "manager").map(o => o.value), ["pm", "ops"]);
  assert.deepEqual(Pick.filter(opts, "finance").map(o => o.value), ["fpa"]);
  assert.deepEqual(Pick.filter(opts, "oper man").map(o => o.value), ["ops"]);
  assert.deepEqual(Pick.filter(opts, "xyz"), []);
});

// the usability pass of 2026-11-06: typing "Product Manager" listed Product Marketing Manager first, and the product set's
// and the MBA set's Product Marketing Manager read the same in the list
const roles = [
  { value: "pmm", label: "Product Marketing Manager", hint: "Marketing" },
  { value: "pm", label: "Product Manager", hint: "Product" },
  { value: "product.pmm", label: "Product Marketing Manager", hint: "Product" },
  { value: "tpm", label: "Technical Program Manager", hint: "Product" },
];
test("the label typed in full comes first, then a label that starts with what was typed, then the rest in list order", () => {
  assert.deepEqual(Pick.filter(roles, "product manager").map(o => o.value), ["pm", "pmm", "product.pmm", "tpm"]);
  assert.deepEqual(Pick.filter(roles, "Product Manager")[0].value, "pm", "case and spacing do not matter");
  assert.deepEqual(Pick.filter(roles, "product mark").map(o => o.value), ["pmm", "product.pmm"], "a prefix of the label");
  assert.deepEqual(Pick.filter(roles, "manager").map(o => o.value), ["pmm", "pm", "product.pmm", "tpm"], "no label starts with it: the list's order");
});
test("two options with one label say their hint in the label; a label used once stays as it is", () => {
  const d = Pick.distinct(roles);
  assert.deepEqual(d.map(o => o.label), ["Product Marketing Manager (Marketing)", "Product Manager", "Product Marketing Manager (Product)", "Technical Program Manager"]);
  assert.equal(new Set(d.map(o => o.label)).size, d.length, "no two rows read the same");
  assert.deepEqual(d.map(o => o.hint), ["", "Product", "", "Product"], "the hint moves into the label, never said twice");
  assert.deepEqual(Pick.filter(d, "product manager").map(o => o.value), ["pm", "pmm", "product.pmm", "tpm"]);
  assert.deepEqual(Pick.distinct([{ value: "a", label: "Same" }, { value: "b", label: "Same" }]).map(o => o.label), ["Same", "Same"], "no hint to tell them apart: left as they are");
});

// the usability pass of 2026-11-06 (C-07, the Role box found nothing for "data" or "software"): when nothing matches,
// the closest options by what they are about, a line every option has counting next to nothing
const live = [
  { value: "fpa", label: "FP&A Manager", hint: "Finance", about: ["Owns the budget and the forecast.", "Data-driven decision making"], lean: 0 },
  { value: "ba", label: "Business Analytics Manager", hint: "Analytics", about: ["Turns business data into decisions.", "Data-driven decision making", "Data modeling & pipelines", "Dashboards & data visualization"], lean: 2 },
  { value: "pa", label: "Product Analyst", hint: "Product", about: ["Measures how a product is used.", "Data-driven decision making", "Data modeling & pipelines", "SQL"], lean: 3 },
  { value: "pe", label: "Product Engineer", hint: "Product", about: ["Builds the feature end to end.", "Systems & architecture"], lean: 5 },
  { value: "hr", label: "HR Manager", hint: "People", about: ["Partners with managers on their people.", "Data-driven decision making"], lean: 0 },
];
test("closest: no label holds the word, so the options whose blurb and asks hold it come first; a line all options share counts little", () => {
  assert.deepEqual(Pick.filter(live, "data"), [], "the filter finds nothing");
  assert.deepEqual(Pick.closest(live, "data", 2).map(o => o.value), ["ba", "pa"]);
  assert.deepEqual(Pick.closest(live, "Data Scientist", 2).map(o => o.value), ["ba", "pa"], "a word no option holds adds nothing");
  assert.deepEqual(Pick.closest(live, "analytics", 3).map(o => o.value)[0], "ba", "the hint (the field) counts");
});
test("closest: a word no option holds gives the options with the highest lean; none with a lean gives []", () => {
  assert.deepEqual(Pick.closest(live, "software", 2).map(o => o.value), ["pe", "pa"]);
  assert.deepEqual(Pick.closest(opts, "software", 2), [], "no about, no lean: nothing to offer");
  assert.deepEqual(Pick.closest(live, "", 2).map(o => o.value), ["pe", "pa"], "nothing typed: the lean");
  assert.deepEqual(Pick.distinct(live).map(o => o.about.length), live.map(o => o.about.length), "distinct keeps about and lean");
});
