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
