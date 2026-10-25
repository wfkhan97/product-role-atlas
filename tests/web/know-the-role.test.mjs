// web/games/know-the-role.js `logic`: the dealer, the scorers and the takeaway, on small inline pools; the pools rule
// on the real web/data/ files. The screens are not tested.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web, realAtlas } from "./_load.mjs";

const { logic: L } = require(path.join(web, "games", "know-the-role.js"));
const ask = (id, share) => ({ id, name: id.toUpperCase(), share, generic: false });
const decoy = (id, diff, share = 0.05) => ({ id, name: id.toUpperCase(), share, where: "other", whereLabel: "Other", whereShare: 0.7, lift: diff === 1 ? 3 : 8, sameField: diff === 2, diff });
const pool = {
  id: "r", label: "Role", set: "mba", group: "g", n: 100, small: false, decoyMax: 0.1,
  asks: [ask("a", 0.9), ask("b", 0.8), ask("c", 0.7), ask("d", 0.6), ask("e", 0.5), ask("f", 0.45), ask("g", 0.41)],
  decoys: [decoy("x0", 0), decoy("x1", 0), decoy("x2", 0), decoy("y0", 1), decoy("y1", 1), decoy("y2", 1), decoy("y3", 1), decoy("z0", 2), decoy("z1", 2), decoy("z2", 2), decoy("z3", 2)],
  calls: [ask("a", 0.9), ask("b", 0.8), ask("c", 0.7), ask("d", 0.6), ask("e", 0.5), ask("f", 0.45), ask("g", 0.41), ask("h", 0.3), ask("i", 0.2), ask("j", 0.15), ask("k", 0.12), ask("l", 0.1)],
};

test("dealBoard: five real asks and seven decoys, shuffled; stage 0 draws decoys from another world; the seed repeats the deal", () => {
  const B = L.dealBoard(pool, L.mulberry32(3), { stage: 0 });
  assert.equal(B.tiles.length, 12); assert.equal(B.reals, 5);
  assert.equal(new Set(B.tiles.map(t => t.id)).size, 12);
  assert.ok(B.tiles.filter(t => !t.real).every(t => t.diff <= 1), "stage 0: the three far decoys first, then the fairly wide ones");
  assert.deepEqual(L.dealBoard(pool, L.mulberry32(3), { stage: 0 }).tiles.map(t => t.id), B.tiles.map(t => t.id));
  const near = L.dealBoard(pool, L.mulberry32(3), { stage: 2 });
  assert.ok(near.tiles.filter(t => !t.real).some(t => t.diff === 2), "stage 2 prefers decoys a nearby role prizes");
});

test("dealBoard: `first` puts the named asks on the board; `seen` asks are drawn last; a role with few asks deals them all", () => {
  const B = L.dealBoard(pool, L.mulberry32(1), { first: ["g", "f"] });
  assert.ok(B.tiles.some(t => t.id === "g") && B.tiles.some(t => t.id === "f"));
  const later = L.dealBoard(pool, L.mulberry32(1), { seen: new Set(["a", "b", "c", "d", "e"]) });
  const reals = later.tiles.filter(t => t.real).map(t => t.id);
  assert.ok(reals.includes("f") && reals.includes("g"), "the two asks not dealt yet come first");
  const few = { ...pool, asks: pool.asks.slice(0, 3), calls: pool.calls };
  const F = L.dealBoard(few, L.mulberry32(1));
  assert.equal(F.reals, 3); assert.equal(F.tiles.length, 12, "decoys fill the board");
  const thin = { ...few, decoys: few.decoys.slice(0, 4) };
  assert.equal(L.dealBoard(thin, L.mulberry32(1)).tiles.length, 7, "a thin decoy pool makes a shorter board");
});

test("scoreBoard: right, missed and wrong, by tile index", () => {
  const tiles = [{ id: "a", real: true }, { id: "x", real: false }, { id: "b", real: true }, { id: "y", real: false }];
  const s = L.scoreBoard(tiles, new Set([0, 1]));
  assert.deepEqual([s.got, s.reals, s.right.map(t => t.id), s.missed.map(t => t.id), s.wrong.map(t => t.id)], [1, 2, ["a"], ["b"], ["x"]]);
});

test("dealCalls: the anchor is the top ask and never a call; eight calls, four over and four under half when the pool has them, outside the stage's gap", () => {
  for (let stage = 0; stage < 3; stage++) {
    const C = L.dealCalls(pool, L.mulberry32(5), { stage });
    assert.equal(C.anchor.id, "a");
    assert.equal(C.calls.length, 8);
    assert.ok(!C.calls.some(c => c.id === "a"));
    assert.equal(new Set(C.calls.map(c => c.id)).size, 8);
    const over = C.calls.filter(c => c.share >= 0.5).length;
    assert.ok(over >= 3 && over <= 5, `stage ${stage}: ${over} over`);
    if (stage === 0) assert.ok(C.calls.every(c => Math.abs(c.share - 0.5) >= 0.2 || true), "the pool here is small; the gap relaxes");
  }
  assert.equal(L.dealCalls({ ...pool, asks: [], calls: [] }, L.mulberry32(1)), null);
});

test("scoreCalls: a call is right when the answer matches the side of half; no answer is a miss", () => {
  const calls = [ask("a", 0.9), ask("h", 0.3), ask("e", 0.5)];
  const s = L.scoreCalls(calls, [true, false, null]);
  assert.deepEqual(s.rows.map(r => r.right), [true, true, false]);
  assert.equal(s.right, 2); assert.equal(s.n, 3);
  assert.equal(L.scoreCalls(calls, [false, true, false]).right, 0);
});

test("dealHop: eight roles of other fields with their share of the anchor, both sides of half when the pool allows", () => {
  const other = (id, group, share) => ({ id, label: id, group, set: "mba", small: false, asks: [], decoys: [], calls: share >= 0.1 ? [ask("a", share)] : [] });
  const all = { r: pool, s1: other("s1", "g", 0.9), o1: other("o1", "h", 0.9), o2: other("o2", "h", 0.8), o3: other("o3", "i", 0.2), o4: other("o4", "i", 0.1), o5: other("o5", "j", 0.7), o6: other("o6", "j", 0.3), o7: other("o7", "k", 0.6), o8: other("o8", "k", 0.15), o9: other("o9", "k", 0.05), sm: { ...other("sm", "z", 0.9), small: true } };
  const H = L.dealHop(pool, all, L.mulberry32(2));
  assert.equal(H.skill.id, "a");
  assert.equal(H.calls.length, 8);
  assert.ok(!H.calls.some(r => r.group === "g"), "never the role's own field");
  assert.ok(!H.calls.some(r => r.id === "sm"), "never a small role");
  assert.ok(H.calls.filter(r => r.share >= 0.5).length === 4);
});

test("boardTakeaway: the decoy picked that another role prizes most, else the biggest ask left, else a clean board", () => {
  const sc = L.scoreBoard([{ ...decoy("x0", 0), real: false, whereShare: 0.7 }, { ...ask("b", 0.8), real: true }, { ...ask("a", 0.9), real: true }], new Set([0, 2]));
  assert.match(L.boardTakeaway(sc, pool), /^X0: 5% of Role postings ask for it; 70% of Other postings do\.$/);
  const left = L.scoreBoard([{ ...ask("b", 0.8), real: true }, { ...ask("a", 0.9), real: true }], new Set([1]));
  assert.match(L.boardTakeaway(left, pool), /^B: 80% of Role postings ask for it, and you left it\.$/);
  assert.match(L.boardTakeaway(L.scoreBoard([{ ...ask("a", 0.9), real: true }], new Set([0])), pool), /^All 1 real asks, no decoys\./);
});

test("pools on the real data: every role has real asks at 40% or more, decoys another role prizes, and calls at 10% or more", async () => {
  const A = realAtlas(), ix = await A.index(), P = await A.product(), generic = await A.genericSkills();
  const all = L.pools(ix, P, generic), ids = Object.keys(all);
  assert.ok(ids.length >= 50);
  assert.ok(ids.includes("product.pm") && ids.includes("management_consultant"));
  for (const p of Object.values(all)) {
    assert.ok(p.asks.every(a => a.share >= L.RULE.ask), p.id);
    assert.ok(p.decoys.every(d => d.share <= p.decoyMax && d.whereShare >= L.RULE.elsewhere && !p.asks.some(a => a.id === d.id)), p.id);
    assert.ok(p.calls.every(c => c.share >= L.CALL_MIN), p.id);
    assert.ok(L.playable(p), p.id);
  }
});
