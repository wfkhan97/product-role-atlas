// Spot the real ask (web/games/spot-the-real-ask.js, games/spot-the-real-ask/README.md "Scoring"): the line-by-line
// scorer, by simulation over today's passages.
//
//   node evals/game_spot_scoring.mjs        # report; exit 1 when a check fails
//
// Loads web/data/game_passages.json and the game's `logic` (its lines, deal and scoring). Five simulated readers each
// play RUNS runs of three passages, dealt as the game deals them (one easy, one medium, one hard, different roles and
// employers), answering every line with a seeded random source:
//   perfect    says "real ask" to every ask line and "filler" to every filler line
//   careful    says "real ask" to an ask with p 0.85 and to a filler line with p 0.20 (a careful first read)
//   keyword    says "real ask" to an ask with p 0.60 and to a filler line with p 0.50 (whatever sounds like a skill)
//   all-ask    says "real ask" to every line
//   all-filler says "filler" to every line
// The checks are in CHECKS below: the rule's fixed points (perfect 1, all-ask exactly 0.5, all-filler 0) and the
// order of the readers, which a data refresh must keep.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { logic: L } = require(path.join(root, "web/games/spot-the-real-ask.js"));
const D = JSON.parse(fs.readFileSync(path.join(root, "web/data/game_passages.json"), "utf8"));
const RUNS = 4000, SEED = 7;

// mulberry32: the same runs on every machine
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

// the lines: the ask and filler chunks, in reading order, each in its bullet; every passage has one of each
const lines = new Map(), chunks = new Map();
let nLines = 0, nAsk = 0, nFill = 0, minL = Infinity, maxL = 0;
for (const p of D.passages) {
  const cs = L.chunksOf(p), ls = L.linesOf(p);
  chunks.set(p.id, cs); lines.set(p.id, ls);
  const judged = cs.map((c, k) => ({ ...c, k })).filter(c => c.label !== "o");
  check(ls.length === judged.length && ls.every((l, j) => l.k === judged[j].k && l.text === judged[j].text), `${p.id}: the lines are not the ask and filler chunks in order`);
  check(ls.every(l => l.bullet.some(([t, k]) => k === l.k && t === l.text)), `${p.id}: a line is not inside its bullet`);
  const a = ls.filter(l => l.label === "a").length, f = ls.length - a;
  check(a > 0, `${p.id}: no ask line`); check(f > 0, `${p.id}: no filler line`);
  nLines += ls.length; nAsk += a; nFill += f; minL = Math.min(minL, ls.length); maxL = Math.max(maxL, ls.length);
}

const READERS = [["perfect", 1, 0], ["careful", 0.85, 0.2], ["keyword", 0.6, 0.5], ["all-ask", 1, 1], ["all-filler", 0, 0]];
const results = {};
for (const [who, pAsk, pFill] of READERS) {
  const rand = rng(SEED);
  let sum = 0, min = 1, max = 0, short = 0, found = 0, asks = 0, passed = 0, filler = 0;
  for (let k = 0; k < RUNS; k++) {
    const run = L.deal(D.passages, new Set(), rand);
    if (run.length !== 3 || run.map(p => p.difficulty).join() !== "easy,medium,hard") short++;
    const rs = run.map(p => {
      const answers = new Map();
      for (const l of lines.get(p.id)) answers.set(l.k, rand() < (l.label === "a" ? pAsk : pFill) ? "ask" : "filler");
      const r = L.scoreMarks(chunks.get(p.id), L.marksOf(answers));
      found += r.found; asks += r.asks; passed += r.skipped; filler += r.filler;
      return r;
    });
    const read = L.runRead(rs);
    sum += read; min = Math.min(min, read); max = Math.max(max, read);
  }
  check(!short, `${who}: ${short} runs were not one easy, one medium and one hard passage`);
  results[who] = { mean: sum / RUNS, min, max, found: found / asks, passed: passed / filler };
}

const R = results;
const CHECKS = [
  [R.perfect.min === 1 && R.perfect.max === 1, "the perfect reader reads 1 in every run"],
  [Math.abs(R["all-ask"].mean - 0.5) < 1e-9 && R["all-ask"].min === R["all-ask"].max, "calling every line an ask reads exactly 0.5"],
  [R["all-filler"].max === 0, "calling every line filler reads 0"],
  [R.careful.mean >= 0.75, "the careful reader's mean read is at least 0.75"],
  [R.careful.min > 0.3, "the careful reader never reads below 0.3 over a run"],
  [R.keyword.mean < R.careful.mean - 0.2, "the keyword reader's mean read is at least 0.2 below the careful reader's"],
  [R.keyword.mean > 0.4, "the keyword reader still reads above 0.4: a wrong call is never worse than a blank one"],
  [R.careful.found > R.keyword.found && R.careful.passed > R.keyword.passed, "the careful reader finds more and lets more pass than the keyword reader"],
];
for (const [ok, msg] of CHECKS) check(ok, msg);

const p = v => (v * 100).toFixed(1) + "%";
console.log(`${D.passages.length} passages, ${nLines} lines (${nAsk} asks, ${nFill} filler; ${minL} to ${maxL} a passage), ${RUNS} runs per reader, seed ${SEED}`);
console.log(`| reader | mean read | min | max | asks found | filler let pass |`);
console.log(`|---|---|---|---|---|---|`);
for (const [who] of READERS) { const r = R[who]; console.log(`| ${who} | ${r.mean.toFixed(3)} | ${r.min.toFixed(3)} | ${r.max.toFixed(3)} | ${p(r.found)} | ${p(r.passed)} |`); }
if (fails.length) { console.log(`FAIL ${fails.length}:`); for (const f of fails.slice(0, 40)) console.log("  " + f); process.exit(1); }
console.log("ok");
