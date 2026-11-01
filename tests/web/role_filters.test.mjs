// web/app.js RoleFilters: the role page's filter defaults, and "Reset filters" in the drawer bringing every filter
// back to them (owner's feedback 2026-11-01: "Clear all" left the employer type, graduates and sponsors on).
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web } from "./_load.mjs";

const { RoleFilters } = require(path.join(web, "app.js"));

// a state with every filter on, as a person leaves it after a while in the drawer
const busy = () => ({ level: "senior", employer: "startup", grads: true, sponsor: true, sector: new Set(["Technology"]), company: new Set(["Acme"]), country: new Set(["United States"]), remote: true, companyQuery: "acm", roleId: "fpa", tab: "postings" });

test("reset brings every filter back to its default, the level to the one given", () => {
  const st = busy();
  RoleFilters.reset(st, "entry");
  assert.equal(st.level, "entry");
  assert.equal(st.employer, "all");
  assert.equal(st.grads, false);
  assert.equal(st.sponsor, false);
  assert.equal(st.remote, false);
  assert.equal(st.companyQuery, "");
  for (const k of ["sector", "company", "country"]) assert.ok(st[k] instanceof Set && st[k].size === 0, k);
  assert.equal(RoleFilters.active(st), 0);
  assert.equal(RoleFilters.changed(st, "entry"), false);
});

test("reset leaves what is not a filter alone and hands out new sets each time", () => {
  const st = busy(), old = st.sector;
  RoleFilters.reset(st, "all");
  assert.equal(st.roleId, "fpa"); assert.equal(st.tab, "postings");
  assert.notEqual(st.sector, old, "a fresh Set, so a set kept elsewhere cannot bring a value back");
  const a = RoleFilters.defaults("all"), b = RoleFilters.defaults("all");
  assert.notEqual(a.company, b.company);
});

test("each filter alone counts as on, and the reset is offered for it (the case Clear all missed)", () => {
  const base = () => RoleFilters.reset({}, "all");
  const one = [["employer", "firm"], ["grads", true], ["sponsor", true], ["remote", true]];
  for (const [k, v] of one) { const st = base(); st[k] = v; assert.equal(RoleFilters.active(st), 1, k); assert.ok(RoleFilters.changed(st, "all"), k); }
  for (const k of ["sector", "company", "country"]) { const st = base(); st[k].add("x"); assert.equal(RoleFilters.active(st), 1, k); assert.ok(RoleFilters.changed(st, "all"), k); }
  const st = base(); st.level = "mid";
  assert.equal(RoleFilters.active(st), 0, "the level is not counted on the Filters button");
  assert.ok(RoleFilters.changed(st, "all"), "but a level off its default is something to reset");
});
