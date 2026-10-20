// web/games/skill-path.js `logic`: the board, the shortest route, a round, and the seeded dealer. The rules are
// stated on small inline boards; the board invariants are also checked on the real web/data/ files.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web, realAtlas } from "./_load.mjs";

const { logic: L } = require(path.join(web, "games", "skill-path.js"));

// a line of skills a - b - c - d with a branch b - e, plus what buildBoard must leave out
const M = {
  skills: ["a", "b", "c", "d", "e", "gen", "cred", "yoe_3", "lone"].map(id => ({ id, name: id.toUpperCase(), cluster: id === "cred" ? "credentials" : "craft" })),
  edges: [
    { source: "a", target: "b", jaccard: 0.5 }, { source: "b", target: "a", jaccard: 0.5 },   // the same link twice
    { source: "b", target: "c", jaccard: 0.4 }, { source: "c", target: "d", jaccard: 0.3 }, { source: "b", target: "e", jaccard: 0.6 },
    { source: "c", target: "c", jaccard: 1 },   // a self-link
    { source: "a", target: "gen", jaccard: 0.9 }, { source: "a", target: "cred", jaccard: 0.9 }, { source: "a", target: "yoe_3", jaccard: 0.9 },
  ],
};
const B = L.buildBoard(M, ["gen"]);

test("buildBoard leaves out credentials, years of experience, generic skills, self-links and repeated links", () => {
  assert.deepEqual(B.ids, ["a", "b", "c", "d", "e"]);
  assert.equal(B.links, 4);
  assert.deepEqual(B.adj.c.map(([id]) => id), ["b", "d"]);
  assert.deepEqual(B.generic, ["gen"]);
});

test("buildBoard drops a skill left with no link", () => {
  assert.ok(!B.has.has("lone"));
});

test("buildBoard lists a skill's links strongest first", () => {
  assert.deepEqual(B.adj.b.map(([id]) => id), ["e", "a", "c"]);
});

test("distances counts the hops to the nearest source; a skill off the board is no source", () => {
  assert.deepEqual(L.distances(B, ["d"]), { d: 0, c: 1, b: 2, a: 3, e: 3 });
  assert.deepEqual(L.distances(B, ["d", "a"]), { d: 0, a: 0, c: 1, b: 1, e: 2 });
  assert.deepEqual(L.distances(B, ["lone"]), {});
});

test("shortestRoute takes par hops, and of equal routes the one with the higher blue numbers", () => {
  // a square: s - x - t and s - y - t; y is asked for more
  const Q = L.buildBoard({ skills: ["s", "x", "y", "t"].map(id => ({ id, cluster: "craft" })), edges: [["s", "x"], ["x", "t"], ["s", "y"], ["y", "t"]].map(([source, target]) => ({ source, target, jaccard: 0.5 })) }, []);
  const share = id => ({ x: 0.1, y: 0.6 }[id] || 0);
  assert.deepEqual(L.shortestRoute(Q, L.distances(Q, ["t"]), "s", share), ["s", "y", "t"]);
  assert.equal(L.shortestRoute(Q, {}, "s", share), null, "no route from a skill the target cannot be reached from");
});

test("choices offer at most four unvisited neighbours, one that moves closer, and mark the ones that end the round", () => {
  const dist = L.distances(B, ["d"]);
  const c = L.choices(B, dist, "b", new Set(["b"]), () => 0);
  assert.deepEqual(c.map(x => x.id).sort(), ["a", "c", "e"]);
  assert.deepEqual(c.filter(x => x.closer).map(x => x.id), ["c"]);
  assert.deepEqual(c.filter(x => x.end).map(x => x.id), []);
  assert.deepEqual(L.choices(B, dist, "c", new Set(["b", "c"]), () => 0).filter(x => x.end).map(x => x.id), ["d"], "d is an arrival skill");
  assert.deepEqual(L.choices(B, dist, "b", new Set(["a", "b", "c", "e"]), () => 0), []);
});

// a round on the line board: start a, arrive at d (par 3); the target asks for c and d, not b or e
const share = id => ({ c: 0.5, d: 0.7, b: 0.1, e: 0.2 }[id] || 0);
const su = { start: "a", arrivals: ["d"], dist: L.distances(B, ["d"]), par: 3, share, shortGood: 2 };
test("a round: the budget is the shortest route plus two; reaching an arrival skill ends the round as arrived; a hop is good at 25% or more", () => {
  const R = L.newRound(su);
  assert.equal(R.budget, 5, "par + 2");
  assert.equal(L.MARGIN, 2);
  for (const id of ["b", "c", "d"]) assert.ok(L.hop(R, B, id), `hop to ${id}`);
  assert.equal(R.phase, "arrived");
  assert.deepEqual(R.hops.map(h => h.good), [false, true, true]);
  const res = L.result(R);
  assert.deepEqual([res.arrived, res.used, res.hops, res.good, res.short, res.ticked], [true, 3, 3, 2, 0, 0]);
});

test("a round: a hop to a skill that is not offered is refused and changes nothing", () => {
  const R = L.newRound(su);
  assert.equal(L.hop(R, B, "d"), false);
  assert.deepEqual([R.cur, R.used, R.phase], ["a", 0, "choose"]);
});

test("a round: the round ends 'out' when the hop budget is spent; stepping back costs a hop", () => {
  const R = L.newRound({ ...su, par: 2 });
  assert.equal(R.budget, 4);
  for (const id of ["b", "e"]) L.hop(R, B, id);
  assert.ok(L.stepBack(R, B), "at e every neighbour is visited: step back to b");
  L.hop(R, B, "c");
  assert.equal(R.used, 4);
  assert.equal(R.phase, "out");
  const res = L.result(R);
  assert.deepEqual([res.arrived, res.short, res.hops, res.good], [false, 1, 3, 1]);
});

test("ticks: only a skill on the route can be ticked; build next is the unticked skill the target asks for most, else the arrival reached", () => {
  const R = L.newRound(su);
  for (const id of ["b", "c", "d"]) L.hop(R, B, id);
  assert.equal(L.buildNext(R, B).id, "d", "nothing ticked: the skill with the highest share");
  assert.equal(L.tick(R, "d", true), true);
  assert.equal(L.tick(R, "zzz", true), false);
  assert.deepEqual(L.buildNext(R, B), { id: "c", why: "not-yet" });
  for (const id of ["a", "b", "c"]) L.tick(R, id, true);
  assert.deepEqual(L.buildNext(R, B), { id: "d", why: "reached" });
  assert.equal(L.result(R).ticked, 4);
  L.tick(R, "d", false);
  assert.equal(L.result(R).ticked, 3);
  assert.deepEqual(L.routeSkills(R), ["a", "b", "c", "d"]);
});

test("compare: arrived first, then fewer hops, then more good hops; two rounds that did not arrive compare on hops short", () => {
  const r = (arrived, hops, good, short, at) => ({ arrived, hops, good, short, at });
  assert.ok(L.compare(r(true, 5, 1, 0, "1"), r(false, 3, 3, 1, "2")) < 0);
  assert.ok(L.compare(r(true, 4, 1, 0, "1"), r(true, 5, 3, 0, "2")) < 0);
  assert.ok(L.compare(r(true, 4, 3, 0, "1"), r(true, 4, 1, 0, "2")) < 0);
  assert.ok(L.compare(r(false, 2, 0, 1, "1"), r(false, 5, 0, 3, "2")) < 0);
});

test("pool: a random pairing has a shortest route of 2 to 6 hops, never a small role and never one with no route", () => {
  const p = (par, small = false) => ({ from: "field", start: "f", target: "t" + par + small, par, small });
  const pool = L.pool({ field: [p(1), p(2), p(3), p(6), p(2, true), p(null), p(0), p(7)], role: [p(4)] });
  assert.deepEqual(pool.field.map(x => x.par), [2, 3, 6]);
  assert.deepEqual(pool.role.map(x => x.par), [4]);
});

test("rng: the same seed gives the same numbers, in [0, 1); another seed gives others", () => {
  const take = (r, n) => Array.from({ length: n }, r);
  const a = take(L.rng(42), 20);
  assert.deepEqual(take(L.rng(42), 20), a);
  assert.notDeepEqual(take(L.rng(43), 20), a);
  assert.ok(a.every(x => x >= 0 && x < 1));
});

test("randomPairing: the same seed deals the same pairing, and it avoids the pairing just played", () => {
  const pool = Array.from({ length: 30 }, (_, i) => ({ start: "s" + i, target: "t" + i }));
  assert.equal(L.randomPairing(pool, 9), L.randomPairing(pool, 9));
  assert.equal(L.randomPairing([], 9), null);
  for (let seed = 1; seed < 200; seed++) { const first = L.randomPairing(pool, seed); assert.notEqual(L.randomPairing(pool, seed, first), first, `seed ${seed}`); }
});

// ---------- the real board ----------
test("the real board: every link joins two skills on the board, none to itself, each from both ends, every skill with at least two links", async () => {
  // at least two: a skill with one link is a dead end, where a player can only step back (the eval states this too)
  const A = realAtlas(), ix = await A.index(), RB = L.buildBoard(ix.M, await A.genericSkills());
  for (const a of RB.ids) {
    assert.ok(RB.adj[a].length >= 2, `${a} has ${RB.adj[a].length} link`);
    for (const [b] of RB.adj[a]) {
      assert.ok(RB.has.has(b) && b !== a, `${a} - ${b}`);
      assert.ok(RB.adj[b].some(([c]) => c === a), `${a} - ${b} is not listed from ${b}`);
    }
  }
  assert.equal(L.pieces(RB), 1, "one piece: every skill can be reached from every other");
});
