// What does a score mean? Score every real sample resume (evals/resumes/external/, gitignored) against the product
// roles and compare three groups, using the role each sample was written for as the answer key:
//   same role      a product-role resume against its own role family
//   adjacent role  a product-role resume against the other product role families
//   other field    a resume written for a non-product role against the product role families
// Writes evals/calibration.md: the distribution of each group, how well the score separates them, and the cut points
// those distributions give for bands of fit, with bootstrap intervals. Only aggregate numbers are written.
//
//   node evals/calibrate.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { extractText, READABLE } from "./extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..");
const require = createRequire(import.meta.url);
const { createMatcher } = require(path.join(root, "web/match.js"));
const J = f => JSON.parse(fs.readFileSync(path.join(root, f)));
const G = J("web/data/graph.json");
const M = createMatcher({ taxonomy: J("web/data/taxonomy.json"), subskills: J("web/data/subskills.json"), graph: G });
const src = Object.fromEntries(J("evals/external_sources.json").map(e => [e.id, e])), known = J("evals/external_expectations.json");
const OWN = { pm: "pm", product_owner: "product_owner", tpm: "tpm", pmm: "pmm", product_analyst: "product_analyst", product_ops: "product_ops", product_strategy: "pm" };
const fams = ["pm", "product_owner", "tpm", "pmm", "product_analyst", "product_ops"];
const jobs = Object.fromEntries(fams.map(f => [f, G.jobs.filter(j => j.family === f)]));
const SENIORITY = { early: ["associate"], mid: ["mid", "senior"], senior: ["senior", "lead"] };

const dir = path.join(here, "resumes", "external"); const files = [];
for (const f of fs.readdirSync(dir).filter(f => READABLE.test(f)).sort()) {
  const id = f.replace(READABLE, ""), e = src[id]; if (!e || (known[id] && known[id].kind !== "single")) continue;
  let text; try { text = await extractText(path.join(dir, f)); } catch { continue; }
  if (text.trim().split(/\s+/).length < 120) continue;
  const sc = {}; let prof = null;
  for (const fam of fams) { const r = M.match(text, { jobs: jobs[fam], label: fam }); sc[fam] = r.overall; prof ||= r.profile; }
  files.push({ id, role: e.role, own: OWN[e.role] || null, seniority: e.seniority, level: prof.level, sc });
}

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return NaN; const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
const pct = x => isNaN(x) ? "–" : Math.round(x * 100) + "%";
const groups = fs => ({
  same: fs.filter(f => f.own).map(f => f.sc[f.own]),
  adjacent: fs.filter(f => f.own).flatMap(f => fams.filter(x => x !== f.own).map(x => f.sc[x])),
  other: fs.filter(f => !f.own).flatMap(f => fams.map(x => f.sc[x])),
});
// probability that a random member of a scores above a random member of b
const auc = (a, b) => { let w = 0; for (const x of a) for (const y of b) w += x > y ? 1 : x === y ? 0.5 : 0; return w / (a.length * b.length); };
// Cut points. Below the first, a resume scores like three in four resumes from another field. The second is the
// score that best splits same-role from adjacent-role resumes (largest true-positive minus false-positive rate).
// The third is where the top quarter of same-role resumes begins.
const cuts = g => {
  const low = q(g.other, 0.75); let best = 0, high = NaN;
  for (let t = 0.2; t <= 0.95; t += 0.01) { const j = g.same.filter(x => x >= t).length / g.same.length - g.adjacent.filter(x => x >= t).length / g.adjacent.length; if (j > best) { best = j; high = t; } }
  return { low, high, strong: q(g.same, 0.75) };
};
const g = groups(files), c = cuts(g);
// bootstrap over files: how far do the cut points move with a different draw of sample resumes?
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const boot = { low: [], high: [], strong: [] };
for (let b = 0; b < 400; b++) { const s = files.map(() => files[Math.floor(rnd() * files.length)]); const cc = cuts(groups(s)); for (const k in boot) if (!isNaN(cc[k])) boot[k].push(cc[k]); }
const ci = k => `${pct(q(boot[k], 0.05))} to ${pct(q(boot[k], 0.95))}`;
const band = x => x >= c.strong ? 3 : x >= c.high ? 2 : x >= c.low ? 1 : 0;
const share = (a, b) => pct(a.filter(x => band(x) === b).length / a.length);
const row = (name, a) => `| ${name} | ${a.length} | ${pct(q(a, 0.05))} | ${pct(q(a, 0.25))} | ${pct(q(a, 0.5))} | ${pct(q(a, 0.75))} | ${pct(q(a, 0.95))} |`;
const lvl = files.filter(f => f.own && SENIORITY[f.seniority]);
const top = files.filter(f => f.own);
const out = [
  "# Calibration: what a match score means", "",
  `Produced by \`node evals/calibrate.mjs\` on ${new Date().toISOString().slice(0, 10)} from ${files.length} published sample resumes in \`evals/resumes/external/\` (the files are not in the repository; see \`external_sources.json\`). Each is scored against the six product role families (all levels). ${top.length} were written for a product role and ${files.length - top.length} for another field. The role a sample was written for is the answer key.`, "",
  "## Score by group", "",
  "| group | scores | 5th pct | 25th | median | 75th | 95th |", "|---|---|---|---|---|---|---|",
  row("Same role (a product resume against its own role)", g.same), row("Adjacent role (against the other product roles)", g.adjacent), row("Other field (a non-product resume against product roles)", g.other), "",
  `The score ranks a same-role resume above an other-field resume ${pct(auc(g.same, g.other))} of the time, and above an adjacent-role one ${pct(auc(g.same, g.adjacent))} of the time (0.5 would be chance). A resume's own role is its highest-scoring product role in ${top.filter(f => f.sc[f.own] >= Math.max(...fams.map(x => f.sc[x])) - 1e-9).length} of ${top.length}. The level read agrees with the sample's stated seniority in ${lvl.filter(f => SENIORITY[f.seniority].includes(f.level)).length} of ${lvl.length}.`, "",
  "## Bands of fit", "",
  "Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.", "",
  "| band | score | rule | interval | same role | adjacent role | other field |", "|---|---|---|---|---|---|---|",
  `| Reads like people in the role | ${pct(c.strong)} and above | the top quarter of same-role resumes | ${ci("strong")} | ${share(g.same, 3)} | ${share(g.adjacent, 3)} | ${share(g.other, 3)} |`,
  `| In range for the role | ${pct(c.high)} to ${pct(c.strong)} | from the score that best splits same-role from adjacent-role resumes | ${ci("high")} | ${share(g.same, 2)} | ${share(g.adjacent, 2)} | ${share(g.other, 2)} |`,
  `| Related background | ${pct(c.low)} to ${pct(c.high)} | above three in four other-field resumes | ${ci("low")} | ${share(g.same, 1)} | ${share(g.adjacent, 1)} | ${share(g.other, 1)} |`,
  `| A different field so far | below ${pct(c.low)} | | | ${share(g.same, 0)} | ${share(g.adjacent, 0)} | ${share(g.other, 0)} |`, "",
  "Read each row across: of the resumes in a group, the share that lands in the band.", "",
  "## Limits", "",
  "- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.",
  `- ${top.length} same-role resumes is a small sample; the intervals show how far the cut points move.`,
  "- Only product roles can be scored until the other role sets have a graph. The bands are for product roles.",
  "- A sample's seniority is the publisher's label, and the scores here are against all levels of a role.", "",
];
fs.writeFileSync(path.join(here, "calibration.md"), out.join("\n"));
console.log(out.slice(4, 30).join("\n"));
