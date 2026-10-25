// web/games/guess-the-role.js `rules`: the seeded dealer (fields, roles, postings), the points, and the
// clue rules on the real web/data/ files. The screens are not tested.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web, realAtlas } from "./_load.mjs";

const { rules: R } = require(path.join(web, "games", "guess-the-role.js"));
const A = realAtlas(), ix = await A.index(), generic = await A.genericSkills();
const D = R.prepare(ix, generic, A.TIER.common);
// the plan of a game as startGame() deals it: the player's fields first, then the rest shuffled, one role per field
const plan = (seed, seen = new Set(), yours = null) => { const rnd = R.rng(seed), used = new Set(); return R.pickFields(D.fields, yours, rnd).map(f => { const r = R.pickRole(f, seen, used, rnd); used.add(r); return r; }); };

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

test("the dealer: the same seed deals the same game, five rounds from five fields, the player's fields first", () => {
  const a = plan(1234);
  assert.deepEqual(plan(1234), a);
  assert.equal(a.length, R.ROUNDS);
  assert.equal(new Set(a).size, a.length, "no role twice");
  assert.equal(new Set(a.map(r => D.fieldOf[r])).size, a.length, "one role per field");
  const mine = [D.fields[3].id, D.fields[0].id], b = plan(99, new Set(), mine);
  assert.deepEqual(b.slice(0, 2).map(r => D.fieldOf[r]), mine, "the player's fields come first, in their order");
  assert.equal(new Set(b.map(r => D.fieldOf[r])).size, R.ROUNDS);
  assert.deepEqual(R.pickFields(D.fields, ["no-such-field"], R.rng(1)).length, R.ROUNDS, "an unknown field is skipped");
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

test("points: 300 for a guess after one clue, 100 less per clue after, half on the second guess, 0 below", () => {
  assert.deepEqual([1, 2, 3, 4].map(n => R.points(n)), [300, 200, 100, 0]);
  assert.deepEqual([1, 2, 3, 4].map(n => R.points(n, 2)), [150, 100, 50, 0]);
  assert.equal(R.GUESSES, 2);
  assert.equal(R.MAX, R.ROUNDS * R.points(1), "the best game is every round on the first clue, first guess");
});

test("decodeEntities turns the HTML entities of posting titles into text", () => {
  assert.equal(R.decodeEntities("FP&amp;A &#8211; Sr. Analyst&#x21; &nbsp;&bogus;"), "FP&A – Sr. Analyst!  &bogus;");
});

test("the pool: only roles of the MBA fields, each in the field that lists it", () => {
  assert.ok(D.roles.length > 0);
  for (const r of D.roles) { assert.equal(ix.roles[r].set, "mba", r); assert.ok(D.fields.find(f => f.id === D.fieldOf[r]).roles.includes(r), r); }
  assert.ok(![...D.eligible].some(s => generic.has(s) || s.startsWith("yoe_")), "no generic skill or years of experience is a clue");
});

test("clues on real postings: three distinct skills of the posting, the first already distinctive, the giveaway last, the same every time", async () => {
  const r = D.roles[0], jobs = (await A.fetchJson("data/" + D.M.roles[r].file)).jobs;
  const P = D.playable(r, jobs);
  assert.ok(P.length > 0, `${r} has a playable posting`);
  for (const { job, picked } of P.slice(0, 25)) {
    assert.equal(new Set(picked.clues).size, R.CLUES);
    assert.equal(R.CLUES, 3);
    assert.equal(picked.clues[R.CLUES - 1], picked.giveaway);
    const own = new Set(D.eligibleOf(job));
    assert.ok(picked.clues.every(s => own.has(s)), "every clue is asked by the posting");
    assert.deepEqual(D.clues(r, job), picked);
    // the first clue sits in the more distinctive half of the candidates; the second is the most distinctive of them
    const t = D.typicalOf(r, job), rest = D.candidates(t.typical, t.give, picked.relaxed ? 1 : 0), n = rest.length;
    assert.ok(rest.findIndex(x => x.id === picked.clues[0]) >= Math.min(Math.floor(n / 2), n - 2), "the first clue is not the skill every role asks for");
    assert.equal(picked.clues[1], rest[n - 1].id, "the second clue is the most distinctive but the giveaway");
    assert.ok(D.lift(r, picked.clues[1]) >= D.lift(r, picked.clues[0]) - 1e-9, "clues rise in lift");
  }
  assert.deepEqual(D.distractors(r).ids, R.prepare(ix, generic, A.TIER.common).distractors(r).ids, "the distractors do not depend on the run");
});
