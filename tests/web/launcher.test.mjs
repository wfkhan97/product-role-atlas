// web/launcher.js: the pure parts of Explore careers, the launcher (owner's pick S5), on a synthetic index and on the
// real one. The prefix search, the fields with their roles by open postings, the closest roles and the match lines.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web, realAtlas } from "./_load.mjs";

const L = require(path.join(web, "launcher.js"));

// a small index in the shape Atlas.index() gives: three fields, one role under two of them
const sk = (id, name, cluster) => [id, { id, name, cluster: cluster || "craft" }];
const IX = {
  skillById: Object.fromEntries([sk("a", "Forecasting"), sk("b", "Budgeting"), sk("c", "Stakeholder management"), sk("d", "Modeling"), sk("mba", "MBA", "credentials")]),
  groups: [
    { id: "finance", label: "Finance", roles: ["fpa", "treasury"] },
    { id: "strategy", label: "Strategy", roles: ["strategy", "fpa"] },
    { id: "product", label: "Product", roles: ["product.pm"] },
  ],
  roles: {
    fpa: { id: "fpa", label: "FP&A Manager", group: "finance", nOpen: 300, definingList: [{ id: "a", share: 0.9 }], asks: [{ id: "mba", share: 0.8 }, { id: "b", share: 0.7 }, { id: "c", share: 0.6 }, { id: "d", share: 0.4 }] },
    treasury: { id: "treasury", label: "Treasury Manager", group: "finance", nOpen: 120, definingList: [], asks: [{ id: "d", share: 0.6 }] },
    strategy: { id: "strategy", label: "Strategy Manager", group: "strategy", nOpen: 500, definingList: [], asks: [{ id: "c", share: 0.7 }] },
    "product.pm": { id: "product.pm", label: "Product Manager", group: "product", nOpen: 900, definingList: [], asks: [{ id: "c", share: 0.9 }, { id: "a", share: 0.5 }] },
  },
};

// ---------- the prefix search ----------
test("words splits a label into its words and their letter runs, so an ampersand label is found both ways", () => {
  assert.deepEqual(L.words("FP&A Manager"), ["fp&a", "fp", "a", "manager"]);
  assert.deepEqual(L.words("Product Manager"), ["product", "manager"]);
});

test("matches: each typed word is a prefix of a word in the label; an empty query matches nothing", () => {
  const pm = IX.roles["product.pm"];
  assert.equal(L.matches(pm, "prod man"), true, "prod man finds Product Manager");
  assert.equal(L.matches(pm, "man"), true);
  assert.equal(L.matches(pm, "manager product"), true, "order does not matter");
  assert.equal(L.matches(pm, "duct"), false, "a prefix, not a substring");
  assert.equal(L.matches(pm, ""), false);
  assert.equal(L.matches(pm, "   "), false);
  assert.equal(L.matches(IX.roles.fpa, "fp&a"), true, "fp&a finds FP&A Manager");
  assert.equal(L.matches(IX.roles.fpa, "fp"), true);
});

test("searchRoles ranks the hits by open postings and lists every field a role is under", () => {
  const hits = L.searchRoles(IX, "man");
  assert.deepEqual(hits.map(h => h.id), ["product.pm", "strategy", "fpa", "treasury"]);
  const fpa = hits.find(h => h.id === "fpa");
  assert.deepEqual(fpa.fields.map(f => f.id), ["finance", "strategy"], "a role with two fields names both");
  assert.deepEqual(fpa.asks, ["Forecasting", "Budgeting", "Stakeholder management"], "three names, the defining skill first, the credential skipped");
  assert.deepEqual(L.searchRoles(IX, "zzz"), [], "no match is an empty list");
  assert.deepEqual(L.searchRoles(IX, ""), [], "no query is an empty list");
});

// ---------- the fields ----------
test("fields lists each role under every field it belongs to, sorted by open postings, with the field's open count", () => {
  const F = L.fields(IX);
  assert.deepEqual(F.map(f => f.id), ["finance", "strategy", "product"]);
  assert.deepEqual(F[0].roles.map(r => r.id), ["fpa", "treasury"]);
  assert.deepEqual(F[1].roles.map(r => r.id), ["strategy", "fpa"], "the bigger role first");
  assert.equal(F[0].nOpen, 420);
  assert.equal(F[1].nOpen, 800);
  const memberships = IX.groups.reduce((a, g) => a + g.roles.length, 0);
  assert.equal(F.reduce((a, f) => a + f.roles.length, 0), memberships, "the role counts sum to the roles once per membership");
  assert.equal(F[0].roles[0].field.label, "Finance", "a row carries its field");
});

test("roleRow gives the label, the open count, three ask names and the field", () => {
  const row = L.roleRow(IX, IX.roles["product.pm"], IX.groups[2]);
  assert.deepEqual(row, { id: "product.pm", label: "Product Manager", nOpen: 900, asks: ["Stakeholder management", "Forecasting"], field: { id: "product", label: "Product" } });
});

test("the lead names the roles and the fields; the hits line is singular for one match", () => {
  assert.equal(L.lead(IX), "Pick a role from 4 in 3 fields. Add your résumé to see how your skills match up.");
  assert.equal(L.hitsLine(1), "1 role matches. Pick one to see what its postings ask for.");
  assert.equal(L.hitsLine(3), "3 roles match. Pick one to see what its postings ask for.");
  assert.equal(L.COPY.heading, "Explore careers");
});

// ---------- a résumé on file ----------
test("closestRoles sorts by skills shown, then by the smaller ask, and keeps three", () => {
  const fits = [{ roleId: "fpa", n: 3, m: 5 }, { roleId: "strategy", n: 3, m: 4 }, { roleId: "treasury", n: 1, m: 2 }, { roleId: "product.pm", n: 4, m: 9 }, { roleId: "nope", n: 9, m: 9 }];
  const rows = L.closestRoles(IX, fits);
  assert.deepEqual(rows.map(r => [r.id, r.n, r.m]), [["product.pm", 4, 9], ["strategy", 3, 4], ["fpa", 3, 5]]);
  assert.equal(rows[0].label, "Product Manager");
  assert.equal(L.closestRoles(IX, fits, 1).length, 1);
  assert.equal(L.closestRoles(IX, fits, 10).length, 4, "a role the index lacks is dropped");
});

test("coreOf reads a match result's rows: the core tier, shown or a gap", () => {
  const rows = [{ id: "a", slotName: "Forecasting", tier: "core", status: "evidenced", w: 0.9 }, { id: "b", slotName: "Budgeting", tier: "core", status: "gap", w: 0.7 }, { id: "c", slotName: "Stakeholder management", tier: "core", status: "through", w: 0.6 }, { id: "d", slotName: "Modeling", tier: "common", status: "gap", w: 0.4 }, { id: "e", slotName: "Thin", tier: "core", status: "thin", w: 0.8 }];
  const c = L.coreOf(rows);
  assert.equal(c.n, 2); assert.equal(c.m, 4);
  assert.deepEqual(c.gaps.map(g => g.id), ["e", "b"], "gaps by share");
});

test("matchLines is N of M with the band's name, never a percentage", () => {
  const m = L.matchLines({ band: "related", label: "Product Manager", n: 11, m: 14 });
  assert.equal(m.bandLabel, "Relevant foundation");
  assert.equal(m.bandLine, "Relevant foundation for Product Manager.");
  assert.equal(m.line, "11 of the 14 skills most Product Manager postings ask for are on your résumé.");
  assert.equal(m.fitLink, "See your fit for Product Manager →");
  assert.equal(L.matchLines({ band: null, label: "X", n: 1, m: 3 }).line, "1 of the 3 skills most X postings ask for is on your résumé.");
  assert.equal(L.matchLines({ band: null, label: "X", n: 1, m: 3 }).bandLine, null, "no band, no band line");
  for (const [band, label] of [["different", "New to the field"], ["related", "Relevant foundation"], ["in_range", "Qualified for the role"], ["strong", "Strong match"]]) assert.equal(L.matchLines({ band, label: "X", n: 0, m: 0 }).bandLabel, label);
  const all = JSON.stringify([m, L.COPY]);
  assert.ok(!/%|\bscore\b|\bpercent/i.test(all), "no percentage and no score anywhere");
});

test("every sentence of every launcher string is at most 20 words", () => {
  const strings = []; const walk = v => typeof v === "string" ? strings.push(v) : Object.values(v).forEach(walk); walk(L.COPY);
  for (const s of strings) for (const sentence of s.split(/[.?!]\s+|[.?!]$/).filter(Boolean)) assert.ok(sentence.trim().split(/\s+/).length <= 20, `"${sentence}" is over 20 words`);
});

// ---------- the real index ----------
test("on the real index: prod man finds Product Manager, fp&a finds FP&A Manager, the fields sum to the memberships", async () => {
  const Atlas = realAtlas();
  const ix = await Atlas.index(); await Atlas.product();
  assert.ok(L.searchRoles(ix, "prod man").some(h => h.label === "Product Manager"), "prod man finds Product Manager");
  assert.ok(L.searchRoles(ix, "fp&a").some(h => h.label === "FP&A Manager"), "fp&a finds FP&A Manager");
  assert.deepEqual(L.searchRoles(ix, "qqqq"), []);
  const F = L.fields(ix);
  const memberships = ix.groups.reduce((a, g) => a + g.roles.length, 0);
  assert.equal(F.reduce((a, f) => a + f.roles.length, 0), memberships);
  assert.equal(F.reduce((a, f) => a + f.roles.length, 0), L.roleCount(ix), "today every role has one field");
  for (const f of F) { assert.ok(f.roles.length, `${f.label} has roles`); for (let i = 1; i < f.roles.length; i++) assert.ok(f.roles[i - 1].nOpen >= f.roles[i].nOpen, `${f.label} sorted by open postings`); }
  for (const f of F) for (const r of f.roles) { assert.equal(r.asks.length, 3, `${r.label} has three asks`); assert.ok(r.asks.every(a => typeof a === "string" && a.length), "names, not ids"); }
  const pm = F.find(f => f.id === "product").roles.find(r => r.id === "product.pm");
  assert.ok(pm && pm.nOpen > 0, "the product set's roles list under Product with their open count");
});
