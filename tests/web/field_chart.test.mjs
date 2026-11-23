// web/atlas.js fieldChart: which skills a field page's chart shows (owner's feedback 2026-11-01: the chart had 58 to
// 79 dots, most of them unnamed). At most CHART.cap, no credential or tool, at most CHART.every of the skills asked in
// every field, every role's defining skill kept, the rest by field share. Synthetic cases, then every field of the
// real MBA index.
import test from "node:test";
import assert from "node:assert/strict";
import { atlasFactory, realAtlas, Matcher } from "./_load.mjs";

const A = atlasFactory({ load: () => Promise.reject(new Error("no files")), Matcher });
const sk = (id, kind, cluster = "craft") => ({ id, kind, cluster });
const byId = xs => Object.fromEntries(xs.map(s => [s.id, s]));

test("credentials and tools are out; a skill under TIER.some is out unless it defines a role", () => {
  const skillById = byId([sk("cpa", "credential", "credentials"), sk("excel", "tool", "tools"), sk("val", "method"), sk("rare", "method"), sk("niche", "method"), sk("nokind", undefined, "tools")]);
  const rows = A.fieldChart({ shares: { cpa: 0.9, excel: 0.8, val: 0.5, rare: 0.05, niche: 0.04, nokind: 0.7 }, skillById, roles: [{ definingList: [{ id: "niche" }] }], generic: new Set() });
  assert.deepEqual(rows.map(r => r.id), ["val", "niche"]);
  assert.equal(rows.find(r => r.id === "niche").defining, true);
  assert.equal(rows.find(r => r.id === "val").defining, false);
});

test("the skills asked in every field (generic or behaviour) keep three, in their own lane", () => {
  const skillById = byId([sk("comm", "behaviour"), sk("collab", "behaviour"), sk("own", "behaviour"), sk("adapt", "behaviour"), sk("stake", "practice"), sk("m", "method")]);
  const rows = A.fieldChart({ shares: { comm: 0.9, collab: 0.8, own: 0.7, adapt: 0.6, stake: 0.85, m: 0.3 }, skillById, roles: [], generic: new Set(["stake"]) });
  assert.deepEqual(rows.filter(r => r.lane === "every").map(r => r.id), ["comm", "stake", "collab"]);
  assert.deepEqual(rows.filter(r => r.lane === "own").map(r => r.id), ["m"]);
});

test("a behaviour that defines a role of the field takes a place in the lane before a higher share", () => {
  const skillById = byId([sk("comm", "behaviour"), sk("collab", "behaviour"), sk("own", "behaviour"), sk("data", "behaviour"), sk("m", "method")]);
  const rows = A.fieldChart({ shares: { comm: 0.9, collab: 0.8, own: 0.7, data: 0.4, m: 0.3 }, skillById, roles: [{ definingList: [{ id: "data" }] }], generic: new Set() });
  assert.deepEqual(rows.filter(r => r.lane === "every").map(r => r.id), ["comm", "collab", "data"]);
  assert.equal(rows.find(r => r.id === "data").defining, true);
});

test("industries and rule sets (kind knowledge) only when they define a role; the cap keeps the defining ones first", () => {
  const xs = [sk("fin", "knowledge"), sk("gov", "knowledge"), ...Array.from({ length: 30 }, (_, i) => sk("m" + i, "method"))];
  const shares = { fin: 0.6, gov: 0.6, ...Object.fromEntries(xs.slice(2).map((s, i) => [s.id, 0.5 - i * 0.01])) };
  const rows = A.fieldChart({ shares, skillById: byId(xs), roles: [{ definingList: [{ id: "gov" }, { id: "m29" }] }], generic: new Set(), cap: 10 });
  assert.equal(rows.length, 10);
  assert.ok(rows.some(r => r.id === "gov") && !rows.some(r => r.id === "fin"));
  assert.ok(rows.some(r => r.id === "m29"), "a defining skill stays though 20 skills have a higher share");
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].share >= rows[i].share, "highest share first");
});

test("every field of the MBA index: at most 20 dots, none a credential or tool, three at most in every field, the roles' defining skills kept", async () => {
  const At = realAtlas(), ix = await At.index(), generic = await At.genericSkills(), M = ix.M;
  for (const g of M.groups) {
    const shares = {}; for (const s of M.skills) shares[s.id] = g.families.reduce((a, f) => a + ((s.by_family || {})[f] || 0), 0) / g.families.length;
    const roles = g.families.map(f => ix.roles[f]).filter(Boolean);
    const rows = At.fieldChart({ shares, skillById: ix.skillById, roles, generic });
    assert.ok(rows.length >= 12 && rows.length <= At.CHART.cap, `${g.id}: ${rows.length} dots`);
    assert.ok(rows.filter(r => r.lane === "every").length <= At.CHART.every, g.id);
    for (const r of rows) { const s = ix.skillById[r.id]; assert.ok(!["credential", "tool"].includes(s.kind) && s.cluster !== "credentials" && s.cluster !== "tools", `${g.id}: ${r.id}`); }
    assert.ok(!rows.some(r => r.id === "office_tools"), `${g.id}: Office suite is a tool`);
    for (const r of roles) for (const d of r.definingList) { const s = ix.skillById[d.id]; if (s && !["credential", "tool"].includes(s.kind)) assert.ok(rows.some(x => x.id === d.id), `${g.id}: ${r.id}'s defining ${d.id}`); }
    assert.equal(new Set(rows.map(r => r.id)).size, rows.length, `${g.id}: no skill twice`);
  }
});
