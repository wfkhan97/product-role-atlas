// Guess the role (web/games/guess-the-role.js): the data rules over every role of the MBA pool.
//
//   node evals/games_guess_the_role.mjs
//
// Loads web/atlas.js in node with a file-system `load`, as the game loads it in the browser, and checks the rules in
// games/guess-the-role/README.md: every role has a playable posting; every distractor set has three distinct roles,
// none above similarity 0.90, in a 2 + 2 or 1 + 1 + 1 + 1 field pattern; every clue set has five distinct eligible
// skills, none generic, each asked by at least a quarter of the role's postings, with the giveaway's disc > 0.
// A rule violation fails. The counts the README states (open, playable, roles with 2 + 2) are printed and a change
// is a warning, not a failure: a weekly data refresh moves them.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const require = createRequire(import.meta.url);
const README = { open: 22483, playable: 19004, twoTwo: 46, fewSkills: 1132, relaxed: 1400 };   // games/guess-the-role/README.md, data of 2026-10-14

const Atlas = require(path.join(root, "web/atlas.js"))({ load: url => JSON.parse(fs.readFileSync(path.join(root, "web", url), "utf8")), Matcher: null });
const { rules } = require(path.join(root, "web/games/guess-the-role.js"));

const ix = await Atlas.index(), generic = await Atlas.genericSkills();
const D = rules.prepare(ix, generic, Atlas.TIER.common);
const fails = [], warns = [], lines = [];
const fail = (m) => fails.push(m);

let open = 0, playable = 0, fewSkills = 0, relaxed = 0, twoTwo = 0;
const fileOpen = {};
for (const r of D.roles) {
  const meta = D.M.roles[r];
  const d = D.distractors(r);
  // the distractors
  const ids = new Set(d.ids);
  if (d.ids.length !== 3 || ids.size !== 3 || ids.has(r)) fail(`${r}: distractors are not three distinct other roles (${d.ids.join(", ")})`);
  for (const x of d.ids) if (D.similarity(r, x) > rules.CAP + 1e-9) fail(`${r}: distractor ${x} is ${D.similarity(r, x).toFixed(3)} alike, above the cap`);
  const counts = {};
  for (const x of [r, ...d.ids]) counts[D.fieldOf[x]] = (counts[D.fieldOf[x]] || 0) + 1;
  const pattern = Object.values(counts).sort().join("+");
  if (pattern !== "2+2" && pattern !== "1+1+1+1") fail(`${r}: field pattern is ${pattern}`);
  if ((pattern === "2+2") !== (d.pattern === "2+2")) fail(`${r}: pattern reported as ${d.pattern}, fields say ${pattern}`);
  if (pattern === "2+2") twoTwo++;
  // the postings
  const jobs = (await Atlas.fetchJson("data/" + meta.file)).jobs;
  const openJobs = jobs.filter(D.isOpen);
  fileOpen[r] = openJobs.length; open += openJobs.length;
  if (openJobs.length !== meta.n_open) warns.push(`${r}: ${openJobs.length} open postings in the file, n_open ${meta.n_open} in the index`);
  for (const j of openJobs) if (new Set(D.eligibleOf(j)).size < rules.MIN_SKILLS) fewSkills++;
  const P = D.playable(r, jobs);
  if (!P.length) fail(`${r}: no playable posting`);
  playable += P.length;
  for (const { job, picked } of P) {
    if (picked.relaxed) relaxed++;
    const c = picked.clues;
    if (c.length !== rules.CLUES || new Set(c).size !== rules.CLUES) { fail(`${r} posting ${job.id}: clues are not five distinct skills`); continue; }
    if (c[rules.CLUES - 1] !== picked.giveaway) fail(`${r} posting ${job.id}: the giveaway is not last`);
    const have = new Set(D.eligibleOf(job));
    for (const s of c) {
      if (!D.eligible.has(s)) fail(`${r} posting ${job.id}: clue ${s} is not eligible`);
      if (generic.has(s)) fail(`${r} posting ${job.id}: clue ${s} is generic`);
      if (!have.has(s)) fail(`${r} posting ${job.id}: clue ${s} is not in the posting`);
      if (D.share(r, s) < Atlas.TIER.common) fail(`${r} posting ${job.id}: clue ${s} is asked by ${D.share(r, s)} of the role's postings, under the floor`);
    }
    if (!(D.disc(r, d.ids, picked.giveaway) > 0)) fail(`${r} posting ${job.id}: giveaway disc is ${D.disc(r, d.ids, picked.giveaway)}`);
    for (let k = 1; k < rules.CLUES - 1; k++) if (D.lift(r, c[k]) < D.lift(r, c[k - 1]) - 1e-9) fail(`${r} posting ${job.id}: clue ${k + 1} is less distinctive than clue ${k}`);
    for (let k = 0; k < rules.CLUES - 1; k++) if (D.disc(r, d.ids, c[k]) < rules.RED_HERRING[1] - 1e-9) fail(`${r} posting ${job.id}: clue ${k + 1} is a red herring (disc ${D.disc(r, d.ids, c[k]).toFixed(2)})`);
  }
  const sims = d.ids.map(x => `${D.M.roles[x].label} (${D.similarity(r, x).toFixed(2)})`).join(", ");
  lines.push(`${(P.length ? "ok  " : "FAIL")} ${r.padEnd(24)} ${String(openJobs.length).padStart(5)} open ${String(P.length).padStart(5)} playable  ${d.pattern.padEnd(7)} ${sims}`);
}
if (D.nOpen !== open) warns.push(`index n_open sums to ${D.nOpen}, the role files hold ${open} open postings`);
if (D.roles.length !== 48) warns.push(`${D.roles.length} roles in the pool (README: 48)`);

console.log(lines.join("\n"));
console.log(`\n${D.roles.length} roles in ${D.fields.length} fields; ${D.eligible.size} eligible skills of ${D.M.skills.length} (${generic.size} generic)`);
const cmp = (name, got, want) => { const same = got === want; if (!same) warns.push(`${name}: ${got.toLocaleString("en-US")} now, ${want.toLocaleString("en-US")} in the README`); return `${name} ${got.toLocaleString("en-US")}${same ? "" : ` (README ${want.toLocaleString("en-US")})`}`; };
console.log([cmp("open postings", open, README.open), cmp("playable", playable, README.playable), cmp("roles with 2 + 2", twoTwo, README.twoTwo), cmp("fewer than 8 eligible skills", fewSkills, README.fewSkills), cmp("relaxed rule", relaxed, README.relaxed)].join(" · "));
console.log(`playable share ${(100 * playable / open).toFixed(1)}%`);
if (warns.length) console.log(`\n${warns.length} warning${warns.length === 1 ? "" : "s"} (counts move with the weekly refresh):\n  ` + warns.join("\n  "));
if (fails.length) { console.log(`\n${fails.length} rule violation${fails.length === 1 ? "" : "s"}:\n  ` + fails.slice(0, 40).join("\n  ") + (fails.length > 40 ? `\n  … ${fails.length - 40} more` : "")); process.exit(1); }
console.log("\nguess the role: every rule holds");
