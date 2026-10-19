// Spot the real ask (web/games/spot-the-real-ask.js, games/spot-the-real-ask/README.md "Scoring"): the scoring rule
// and the rank thresholds, by simulation over today's passages.
//
//   node evals/game_spot_scoring.mjs        # report; exit 1 when a check fails
//
// Loads web/data/game_passages.json and the game's `logic` (its deal, scoring and RANKS, so the thresholds live in one
// place: the game). Five simulated readers each play RUNS runs of three passages, dealt as the game deals them (one
// easy, one medium, one hard, different roles and employers), with a seeded random source:
//   perfect    marks every ask and no filler
//   careful    marks each ask with p 0.85 and each filler chunk with p 0.20 (a careful first read)
//   keyword    marks each ask with p 0.60 and each filler chunk with p 0.50 (marks what sounds like a skill)
//   everything marks every chunk
//   nothing    marks no chunk
// "Other" chunks are left unmarked by every reader except `everything`: they are neutral, so this changes nothing.
// The checks are in CHECKS below. When one fails after a data refresh, retune RANKS in the game and the README's
// rank table together.
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

// the rule divides by the filler count: every passage has at least one filler chunk
const chunks = new Map(D.passages.map(p => [p.id, L.chunksOf(p)]));
for (const p of D.passages) check(chunks.get(p.id).some(c => c.label === "f"), `${p.id}: no filler chunk`);
for (const p of D.passages) check(chunks.get(p.id).some(c => c.label === "a"), `${p.id}: no ask chunk`);

const READERS = [
  ["perfect", 1, 0], ["careful", 0.85, 0.2], ["keyword", 0.6, 0.5], ["everything", 1, 1], ["nothing", 0, 0],
];
const names = L.RANKS.map(r => r[0]);
const results = {};
for (const [who, pAsk, pFill] of READERS) {
  const rand = rng(SEED), dist = Object.fromEntries(names.map(n => [n, 0]));
  let sum = 0, min = 1, max = 0, short = 0;
  for (let k = 0; k < RUNS; k++) {
    const run = L.deal(D.passages, new Set(), rand);
    if (run.length !== 3 || run.map(p => p.difficulty).join() !== "easy,medium,hard") short++;
    const rs = run.map(p => {
      const cs = chunks.get(p.id), marks = new Set();
      cs.forEach((c, i) => {
        if (who === "everything") marks.add(i);
        else if (c.label === "a" && rand() < pAsk) marks.add(i);
        else if (c.label === "f" && rand() < pFill) marks.add(i);
      });
      return L.scoreMarks(cs, marks);
    });
    const read = L.runRead(rs);
    dist[L.rankOf(read)]++; sum += read; min = Math.min(min, read); max = Math.max(max, read);
  }
  check(!short, `${who}: ${short} runs were not one easy, one medium and one hard passage`);
  results[who] = { mean: sum / RUNS, min, max, dist, share: (...ranks) => ranks.reduce((a, r) => a + dist[r], 0) / RUNS };
}

const [SKIM, KEY, CAREFUL, EYE, ATLAS] = names;
const R = results;
// Two targets of the design brief cannot hold under this rule, whatever the thresholds, so they are checked at the
// level the rule allows: mark everything reads exactly 0.5, so Keyword spotter must start above 0.5, and
// - a careful reader's worst runs read below 0.5 (an easy passage has one filler chunk, so one false alarm there
//   empties that posting's filler half): "never Skimmer" becomes "Skimmer in at most 2% of runs";
// - a keyword reader reads 0.5 or less in about 4 runs of 10 (mean 0.55, spread about 0.12): "Keyword spotter or
//   Careful reader in 85% of runs" becomes "in at least half of runs, and on Recruiter's eye or above in at most
//   5%". At a threshold just above 0.5 the most the rule allows is about 62%.
const CHECKS = [
  [R.everything.share(SKIM) === 1, `mark everything lands on ${SKIM} in every run`],
  [R.nothing.share(SKIM) === 1, `mark nothing lands on ${SKIM} in every run`],
  [R.perfect.share(ATLAS) === 1, `the perfect reader lands on ${ATLAS} in every run`],
  [R.careful.share(CAREFUL, EYE) >= 0.85, `the careful reader lands on ${CAREFUL} or ${EYE} in at least 85% of runs`],
  [R.careful.share(SKIM) <= 0.02, `the careful reader lands on ${SKIM} in at most 2% of runs`],
  [R.keyword.share(KEY, CAREFUL) >= 0.5, `the keyword reader lands on ${KEY} or ${CAREFUL} in at least half of runs`],
  [R.keyword.share(EYE, ATLAS) <= 0.05, `the keyword reader lands on ${EYE} or above in at most 5% of runs`],
  [R.keyword.mean < R.careful.mean - 0.2, "the keyword reader's mean read is at least 0.2 below the careful reader's"],
];
for (const [ok, msg] of CHECKS) check(ok, msg);

const p = v => (v * 100).toFixed(1) + "%";
console.log(`${D.passages.length} passages, ${RUNS} runs per reader, seed ${SEED}`);
console.log(`thresholds: ${L.RANKS.map(([n, t]) => `${n} ${t}`).join(" · ")}`);
console.log(`| reader | mean read | min | max | ${names.join(" | ")} |`);
console.log(`|---|---|---|---|${names.map(() => "---").join("|")}|`);
for (const [who] of READERS) { const r = R[who]; console.log(`| ${who} | ${r.mean.toFixed(3)} | ${r.min.toFixed(3)} | ${r.max.toFixed(3)} | ${names.map(n => p(r.dist[n] / RUNS)).join(" | ")} |`); }
if (fails.length) { console.log(`FAIL ${fails.length}:`); for (const f of fails.slice(0, 40)) console.log("  " + f); process.exit(1); }
console.log("ok");
