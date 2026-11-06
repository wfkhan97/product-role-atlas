// web/skillmap.js SkillMap.board(): the positions, links and field shares the skill map draws and Skill path plays
// on, on the real web/data/ files. Drawing is not tested. skillmap.js is a browser script: it is loaded with the stub
// window evals/skill_path.mjs uses, and a node Atlas over the files.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web, realAtlas } from "./_load.mjs";

globalThis.window = { addEventListener() { } };   // skillmap.js registers a resize listener at load
const fresh = async () => {
  globalThis.Atlas = realAtlas();
  delete require.cache[require.resolve(path.join(web, "skillmap.js"))];
  require(path.join(web, "skillmap.js"));
  return { SM: await window.SkillMap.board(), ix: await globalThis.Atlas.index() };
};
const { SM, ix } = await fresh();

test("every skill of the MBA index is on the map, at a point inside the drawing", () => {
  assert.deepEqual(Object.keys(SM.byId).sort(), ix.M.skills.map(s => s.id).sort());
  for (const nd of SM.nodes) {
    assert.ok(Number.isFinite(nd.x) && Number.isFinite(nd.y), `${nd.id} has a position`);
    assert.ok(nd.x >= 0 && nd.x <= SM.A && nd.y >= 0 && nd.y <= 1, `${nd.id} at ${nd.x}, ${nd.y} is outside ${SM.A} x 1`);
  }
});

test("every field of the index has a place on the ring", () => {
  for (const g of ix.M.groups) assert.ok(Array.isArray(SM.field[g.id]) && SM.field[g.id].length === 2, g.id);
});

test("every link joins two skills on the map, never a skill to itself, and shows from both ends", () => {
  let n = 0;
  for (const [a, list] of Object.entries(SM.adj)) for (const [b, j] of list) {
    n++;
    assert.ok(SM.byId[a] && SM.byId[b], `${a} - ${b}: an end is not on the map`);
    assert.notEqual(a, b, `${a} is linked to itself`);
    assert.ok(SM.adj[b].some(([c, k]) => c === a && k === j), `${a} - ${b} is not listed from ${b}`);
    assert.ok(j > 0 && j <= 1, `${a} - ${b}: Jaccard ${j}`);
  }
  assert.ok(n > 0, "the map has links");
});

test("a skill's links are listed strongest first", () => {
  for (const [a, list] of Object.entries(SM.adj)) for (let i = 1; i < list.length; i++) assert.ok(list[i - 1][1] >= list[i][1], `${a}: link ${i} is stronger than link ${i - 1}`);
});

test("the field shares are shares", () => {
  for (const [g, v] of Object.entries(SM.FS)) for (const [id, w] of Object.entries(v)) assert.ok(w >= 0 && w <= 1, `${g}/${id}: ${w}`);
});

test("the layout is the same on every load (it is seeded, so the map does not move between visits)", async () => {
  const again = (await fresh()).SM;
  for (const nd of SM.nodes) assert.deepEqual([again.byId[nd.id].x, again.byId[nd.id].y], [nd.x, nd.y], nd.id);
});

// thinNames (usability pass 2026-11-06, the phone's map drew field names over each other): boxes in order of
// importance; a label stays when it lies inside the stage, crosses no circle but its own and no label kept before it
test("thinNames keeps the first of two labels that cross and every label that crosses none", () => {
  const T = window.SkillMap.thinNames;
  assert.deepEqual(T([[0, 0, 10, 10], [5, 5, 15, 15], [20, 0, 30, 10]]), [true, false, true]);
  assert.deepEqual(T([[0, 0, 10, 10], [10, 0, 20, 10]]), [true, true], "boxes that only touch do not cross");
  assert.deepEqual(T([null, [0, 0, 10, 10]]), [false, true], "a label with no box is not kept");
});
test("thinNames drops a label past the stage's edge or over another field's circle, never for its own circle", () => {
  const T = window.SkillMap.thinNames;
  assert.deepEqual(T([[-5, 0, 10, 10], [0, 0, 10, 10]], { bounds: [0, 0, 100, 100] }), [false, true]);
  const circles = [[0, 0, 20, 20], [30, 0, 50, 20]];
  assert.deepEqual(T([[-2, 5, 22, 15], [18, 5, 40, 15]], { blocked: circles, own: [0, 1] }), [true, false], "the first runs past its own circle only; the second runs into the first circle");
});
