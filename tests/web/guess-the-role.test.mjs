// web/games/guess-the-role.js `rules`: the seeded dealer (fields, roles, postings), the points and ranks, and the
// clue rules on the real web/data/ files. The screens are not tested.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web, realAtlas } from "./_load.mjs";

const { rules: R } = require(path.join(web, "games", "guess-the-role.js"));
const A = realAtlas(), ix = await A.index(), generic = await A.genericSkills();
const D = R.prepare(ix, generic, A.TIER.common);
// the plan of a game as startGame() deals it: the fields shuffled, one role picked per field
const plan = (seed, seen = new Set()) => { const rnd = R.rng(seed), used = new Set(); return R.shuffle(D.fields, rnd).map(f => { const r = R.pickRole(f, seen, used, rnd); used.add(r); return r; }); };

test("rng: the same seed gives the same numbers, in [0, 1)", () => {
  const take = (r, n) => Array.from({ length: n }, r), a = take(R.rng(7), 50);
  assert.deepEqual(take(R.rng(7), 50), a);
  assert.notDeepEqual(take(R.rng(8), 50), a);
  assert.ok(a.every(x => x >= 0 && x < 1));
});

test("shuffle: a seeded shuffle is a reordering of the same items, the same for the same seed, and leaves its input alone", () => {
  const items = Array.from({ length: 20 }, (_, i) => i), copy = items.slice();
  const s = R.shuffle(items, R.rng(3));
  assert.deepEqual(items, copy);
  assert.deepEqual(s.slice().sort((a, b) => a - b), items);
  assert.deepEqual(R.shuffle(items, R.rng(3)), s);
});

test("the dealer: the same seed deals the same game, one role from each field", () => {
  const a = plan(1234);
  assert.deepEqual(plan(1234), a);
  assert.equal(a.length, D.fields.length);
  assert.equal(new Set(a).size, a.length, "no role twice");
  assert.deepEqual(a.map(r => D.fieldOf[r]).sort(), D.fields.map(f => f.id).sort(), "one role per field");
});

test("pickRole deals a role not seen before while the field has one, and none once every role is used", () => {
  const f = { id: "f", roles: ["a", "b", "c"] };
  for (let seed = 1; seed < 50; seed++) assert.equal(R.pickRole(f, new Set(["a", "b"]), new Set(), R.rng(seed)), "c");
  assert.ok(["a", "b"].includes(R.pickRole(f, new Set(["a", "b", "c"]), new Set(["c"]), R.rng(1))), "all seen: any role not used");
  assert.equal(R.pickRole(f, new Set(), new Set(["a", "b", "c"]), R.rng(1)), null);
});

test("pickPosting never deals a company twice in a game, nor the same company and title as the last game", () => {
  const list = ["Acme|Analyst", "Beta|Analyst", "Gamma|Manager"].map(s => { const [company, title] = s.split("|"); return { job: { company, title } }; });
  for (let seed = 1; seed < 50; seed++) assert.equal(R.pickPosting(list, new Set(["Acme"]), new Set(["Beta\nAnalyst"]), R.rng(seed)).job.company, "Gamma");
  assert.equal(R.pickPosting(list, new Set(["Acme", "Beta", "Gamma"]), new Set(), R.rng(1)), null);
});

test("points: 500 for a guess after one clue, 100 less per clue after, 0 below", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(R.points), [500, 400, 300, 200, 100, 0, 0]);
  assert.equal(R.MAX, R.ROUNDS * R.points(1), "the best game is every round on the first clue");
});

test("rank: each rank starts at its threshold; nextRank names the one above", () => {
  for (const [min, name] of R.RANKS) { assert.equal(R.rank(min), name); if (min > 0) assert.notEqual(R.rank(min - 1), name); }
  assert.equal(R.nextRank(0)[1], R.RANKS[1][1]);
  assert.equal(R.nextRank(R.MAX), null);
});

test("decodeEntities turns the HTML entities of posting titles into text", () => {
  assert.equal(R.decodeEntities("FP&amp;A &#8211; Sr. Analyst&#x21; &nbsp;&bogus;"), "FP&A – Sr. Analyst!  &bogus;");
});

test("the pool: only roles of the MBA fields, each in the field that lists it", () => {
  assert.ok(D.roles.length > 0);
  for (const r of D.roles) { assert.equal(ix.roles[r].set, "mba", r); assert.ok(D.fields.find(f => f.id === D.fieldOf[r]).roles.includes(r), r); }
  assert.ok(![...D.eligible].some(s => generic.has(s) || s.startsWith("yoe_")), "no generic skill or years of experience is a clue");
});

test("clues on real postings: five distinct skills of the posting, the giveaway last, the same every time", async () => {
  const r = D.roles[0], jobs = (await A.fetchJson("data/" + D.M.roles[r].file)).jobs;
  const P = D.playable(r, jobs);
  assert.ok(P.length > 0, `${r} has a playable posting`);
  for (const { job, picked } of P.slice(0, 25)) {
    assert.equal(new Set(picked.clues).size, R.CLUES);
    assert.equal(picked.clues[R.CLUES - 1], picked.giveaway);
    const own = new Set(D.eligibleOf(job));
    assert.ok(picked.clues.every(s => own.has(s)), "every clue is asked by the posting");
    assert.deepEqual(D.clues(r, job), picked);
  }
  assert.deepEqual(D.distractors(r).ids, R.prepare(ix, generic, A.TIER.common).distractors(r).ids, "the distractors do not depend on the run");
});
