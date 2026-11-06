// Know the role (web/games/know-the-role.js, games/know-the-role/README.md): the pools and the deals on today's data.
//
//   node evals/game_know_the_role.mjs
//
// Loads web/atlas.js and the game's `logic` in node the way the other game evals do. For every role: the pools
// (asks at 40%, decoys other roles prize, calls at 10%), a board (twelve tiles, five real asks or all the role has,
// decoys never real asks, stage 0 decoys from another world when the pool has them), eight calls on both sides of
// half and at least the stage's gap from it when the pool allows, and a field hop. A seed deals the same game twice.
// Exits 1 on a rule violation; prints the counts (evals/NOTES.md keeps them).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const here = path.dirname(fileURLToPath(import.meta.url)), web = path.join(here, "..", "web");
const require = createRequire(import.meta.url);
const Matcher = require(path.join(web, "match.js"));
// the tech index on, so the tech roles are dealt too (the site deals them once CONFIG.TECH_ENABLED is on)
const Atlas = require(path.join(web, "atlas.js"))({ load: f => JSON.parse(fs.readFileSync(path.join(web, f))), Matcher, config: () => ({ TECH_ENABLED: true }) });
const { logic: L } = require(path.join(web, "games", "know-the-role.js"));

const ix = await Atlas.index(), P = await Atlas.product(), generic = await Atlas.genericSkills();
const ALL = L.pools(ix, P, generic);
let fails = 0;
const fail = m => { fails++; console.log("FAIL " + m); };

const roles = Object.values(ALL), playable = roles.filter(L.playable);
console.log(`${roles.length} roles, ${playable.length} playable (3 real asks and a decoy or more); not playable: ${roles.filter(r => !L.playable(r)).map(r => `${r.id} (${r.asks.length} asks, ${r.decoys.length} decoys)`).join(", ") || "none"}`);
const asksN = playable.map(r => r.asks.length), decoysN = playable.map(r => r.decoys.length), callsN = playable.map(r => r.calls.length);
const span = xs => `${Math.min(...xs)} to ${Math.max(...xs)}, median ${xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]}`;
console.log(`real asks per role: ${span(asksN)}; decoys: ${span(decoysN)}; calls: ${span(callsN)}; roles with fewer than ${L.PICK} asks: ${playable.filter(r => r.asks.length < L.PICK).map(r => r.id).join(", ") || "none"}; roles short of ${L.BOARD - L.PICK} decoys: ${playable.filter(r => r.decoys.length < L.BOARD - L.PICK).map(r => r.id).join(", ") || "none"}`);

for (const pool of playable) {
  const ids = new Set(pool.asks.map(a => a.id));
  for (const d of pool.decoys) { if (ids.has(d.id)) fail(`${pool.id}: decoy ${d.id} is a real ask`); if (d.share > pool.decoyMax + 1e-9) fail(`${pool.id}: decoy ${d.id} share ${d.share} above ${pool.decoyMax}`); if (d.whereShare < L.RULE.elsewhere) fail(`${pool.id}: decoy ${d.id} prized nowhere`); }
  for (const a of pool.asks) if (a.share < L.RULE.ask) fail(`${pool.id}: ask ${a.id} share ${a.share}`);
  for (let stage = 0; stage < L.STAGES.length; stage++) {
    const rnd = L.mulberry32(7 + stage), B = L.dealBoard(pool, rnd, { stage });
    const want = Math.min(L.PICK, pool.asks.length), size = Math.min(L.BOARD, pool.asks.length + pool.decoys.length);
    if (B.reals !== want) fail(`${pool.id} stage ${stage}: board has ${B.reals} real asks, not ${want}`);
    if (B.tiles.length !== Math.min(L.BOARD, want + pool.decoys.length)) fail(`${pool.id} stage ${stage}: board has ${B.tiles.length} tiles`);
    if (new Set(B.tiles.map(t => t.id)).size !== B.tiles.length) fail(`${pool.id} stage ${stage}: a tile twice`);
    if (B.tiles.some(t => t.real && !ids.has(t.id))) fail(`${pool.id} stage ${stage}: a real tile that is not an ask`);
    if (stage === 0 && pool.decoys.filter(d => d.diff === 0).length >= L.BOARD - want && B.tiles.some(t => !t.real && t.diff !== 0)) fail(`${pool.id} stage 0: a near decoy on the first board`);
    const C = L.dealCalls(pool, L.mulberry32(11 + stage), { stage });
    if (!C) { fail(`${pool.id}: no calls`); continue; }
    if (C.calls.some(c => c.id === C.anchor.id)) fail(`${pool.id}: the anchor among the calls`);
    if (new Set(C.calls.map(c => c.id)).size !== C.calls.length) fail(`${pool.id}: a call twice`);
    const far = pool.calls.filter(c => c.id !== C.anchor.id && Math.abs(c.share - L.HALF) >= L.STAGES[stage].gap);
    if (far.length >= L.CALLS && C.calls.some(c => Math.abs(c.share - L.HALF) < L.STAGES[stage].gap - 1e-9)) fail(`${pool.id} stage ${stage}: a call inside the gap although the pool has ${far.length} outside it`);
    const over = C.calls.filter(c => c.share >= L.HALF).length, under = C.calls.length - over;
    const poolOver = far.filter(c => c.share >= L.HALF).length, poolUnder = far.length - poolOver;
    if (C.calls.length === L.CALLS && poolOver >= 4 && poolUnder >= 4 && (over < 4 || under < 4)) fail(`${pool.id} stage ${stage}: ${over} over and ${under} under although both sides had four`);
    if (C.calls.length < Math.min(L.CALLS, pool.calls.length - 1)) fail(`${pool.id} stage ${stage}: only ${C.calls.length} calls`);
  }
  const H = L.dealHop(pool, ALL, L.mulberry32(5));
  if (!H || H.calls.length < 4) fail(`${pool.id}: field hop has ${H ? H.calls.length : 0} roles`);
  else if (H.calls.some(r => r.group === pool.group)) fail(`${pool.id}: a field-hop role from the same field`);
  // the same seed deals the same game
  const a = L.dealBoard(pool, L.mulberry32(99), { stage: 1 }).tiles.map(t => t.id).join(), b = L.dealBoard(pool, L.mulberry32(99), { stage: 1 }).tiles.map(t => t.id).join();
  if (a !== b) fail(`${pool.id}: the seed does not repeat the board`);
}
// the scorers
{
  const pool = ALL["product.pm"] || playable[0], B = L.dealBoard(pool, L.mulberry32(1)), all = new Set(B.tiles.map((_, i) => i)), none = new Set();
  const sAll = L.scoreBoard(B.tiles, all), sNone = L.scoreBoard(B.tiles, none);
  if (sAll.got !== B.reals || sAll.wrong.length !== B.tiles.length - B.reals) fail("scoreBoard: picking everything");
  if (sNone.got !== 0 || sNone.missed.length !== B.reals || sNone.wrong.length) fail("scoreBoard: picking nothing");
  const C = L.dealCalls(pool, L.mulberry32(2)), perfect = L.scoreCalls(C.calls, C.calls.map(c => c.share >= L.HALF)), wrong = L.scoreCalls(C.calls, C.calls.map(c => c.share < L.HALF));
  if (perfect.right !== C.calls.length || wrong.right !== 0) fail("scoreCalls: a perfect and an all-wrong player");
}
console.log(fails ? `\n${fails} check(s) failed.` : "\nknow the role: every rule holds");
process.exit(fails ? 1 : 0);
