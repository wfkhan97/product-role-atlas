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
