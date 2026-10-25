// web/games/spot-the-real-ask.js `logic`: the lines a player judges, the deal and the scorer, on the real passages
// file. The screens are not tested.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web, readJson } from "./_load.mjs";

const { logic: L } = require(path.join(web, "games", "spot-the-real-ask.js"));
const D = readJson("game_passages.json");

test("linesOf: the ask and filler chunks in reading order, each inside the bullet it came from; 'other' chunks are never asked", () => {
  for (const p of D.passages.slice(0, 60)) {
    const chunks = L.chunksOf(p), lines = L.linesOf(p);
    const judged = chunks.map((c, k) => ({ ...c, k })).filter(c => c.label === "a" || c.label === "f");
    assert.deepEqual(lines.map(l => [l.k, l.text, l.label]), judged.map(c => [c.k, c.text, c.label]), p.id);
    for (const l of lines) {
      const piece = l.bullet.find(([, k]) => k === l.k);
      assert.ok(piece && piece[0] === l.text, `${p.id}: the line sits in its bullet`);
      assert.ok(!l.bullet.some(([t]) => t === "\n"), "a bullet holds no line break");
    }
    assert.ok(lines.some(l => l.label === "a") && lines.some(l => l.label === "f"), `${p.id}: an ask and a filler line`);
  }
});

test("marksOf and scoreMarks: 'ask' on an ask is found, on filler a false alarm; 'filler' on an ask is missed, on filler let pass", () => {
  const p = D.passages[0], chunks = L.chunksOf(p), lines = L.linesOf(p);
  const say = f => new Map(lines.map(l => [l.k, f(l)]));
  const perfect = L.scoreMarks(chunks, L.marksOf(say(l => l.label === "a" ? "ask" : "filler")));
  assert.equal(perfect.read, 1); assert.equal(perfect.missed, 0); assert.equal(perfect.falses, 0);
  const allAsk = L.scoreMarks(chunks, L.marksOf(say(() => "ask")));
  assert.equal(allAsk.read, 0.5); assert.equal(allAsk.skipped, 0); assert.equal(allAsk.found, allAsk.asks);
  const allFiller = L.scoreMarks(chunks, L.marksOf(say(() => "filler")));
  assert.equal(allFiller.read, 0); assert.equal(allFiller.found, 0); assert.equal(allFiller.skipped, allFiller.filler);
  assert.ok(allAsk.chunks.filter(c => c.label === "o").every(c => c.state === "plain"), "'other' chunks are plain whatever is said");
  assert.equal(L.readOf(2, 4, 1, 2), 0.5); assert.equal(L.readOf(0, 4, 2, 2), 0);
});

test("deal: one easy, one medium, one hard passage, different roles and employers, unseen ones first, a seed repeats", () => {
  const rng = seed => { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
  const run = L.deal(D.passages, new Set(), rng(3));
  assert.deepEqual(run.map(p => p.difficulty), L.DIFFICULTIES);
  assert.equal(new Set(run.map(p => p.role)).size, 3); assert.equal(new Set(run.map(p => p.company)).size, 3);
  assert.deepEqual(L.deal(D.passages, new Set(), rng(3)).map(p => p.id), run.map(p => p.id));
  const seen = new Set(D.passages.filter(p => p.difficulty === "easy").map(p => p.id).slice(0, -1));
  const unseenEasy = D.passages.find(p => p.difficulty === "easy" && !seen.has(p.id));
  assert.equal(L.deal(D.passages, seen, rng(1))[0].id, unseenEasy.id, "the one unseen easy passage comes first");
  assert.equal(L.runRead([{ read: 1 }, { read: 0.5 }]), 0.75);
});
