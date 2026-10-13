// What does a score mean? Score every published sample resume (evals/resumes/external/, gitignored) against the roles
// of a role set and compare three groups, using the role each sample was written for as the answer key:
//   same role      a resume against its own role family
//   adjacent role  a resume against the other role families of its own group
//   other field    a resume against the role families of other groups
// Writes the distribution of each group, how well the score separates them, and the cut points those distributions
// give for bands of fit, with bootstrap intervals. Only aggregate numbers are written.
//
//   node evals/calibrate.mjs               # the product roles            -> evals/calibration.md
//   node evals/calibrate.mjs --roles mba   # the 50 roles of the MBA set  -> evals/calibration_mba.md
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { externalSamples, rolesData } from "./lib.mjs";
import { loadGraph } from "./graph_mba.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..");
const require = createRequire(import.meta.url);
const { createMatcher } = require(path.join(root, "web/match.js"));
const J = f => JSON.parse(fs.readFileSync(path.join(root, f)));
const MBA = process.argv.includes("--roles") && process.argv[process.argv.indexOf("--roles") + 1] === "mba";

// A role set: its matcher, its role families, the group of each family, and how a sample's role maps onto them.
// `own` is the family a sample was written for; `group` is the group whose other families count as adjacent.
function productSet() {
  const G = J("web/data/graph.json");
  const fams = ["pm", "product_owner", "tpm", "pmm", "product_analyst", "product_ops"];
  const OWN = { pm: "pm", product_owner: "product_owner", tpm: "tpm", pmm: "pmm", product_analyst: "product_analyst", product_ops: "product_ops", product_strategy: "pm" };
  return { G, fams, M: createMatcher({ taxonomy: J("web/data/taxonomy.json"), subskills: J("web/data/subskills.json"), graph: G }),
    groupOf: () => "product", groups: [{ id: "product", label: "Product", families: fams }], own: r => OWN[r] || null, groupOfSample: r => OWN[r] ? "product" : null };
}
function mbaSet() {
  const G = loadGraph(), R = rolesData(); const fams = Object.keys(G.families);
  const groupOf = Object.fromEntries(R.groups.flatMap(g => g.families.map(f => [f, g.id])));
  // samples filed under a product family: the product scrape's "pm" is this set's product manager; the other
  // product families have no role here and sit beside the product group (the technical program manager beside
  // the program manager's group)
  const OWN = { pm: "product_manager" }, BESIDE = { product_owner: "product", product_analyst: "product", product_ops: "product", tpm: "operations" };
  const own = r => OWN[r] || (fams.includes(r) ? r : null);
  return { G, fams, M: createMatcher({ taxonomy: J("web/data/taxonomy_mba.json"), subskills: J("web/data/subskills_mba.json"), graph: G, roles: R }),
    groupOf: f => groupOf[f], groups: R.groups, own, groupOfSample: r => own(r) ? groupOf[own(r)] : BESIDE[r] || null };
}
const S = MBA ? mbaSet() : productSet();
const { G, M, fams } = S;
const jobs = Object.fromEntries(fams.map(f => [f, G.jobs.filter(j => j.family === f)]));
const SENIORITY = { early: ["associate"], mid: ["mid", "senior"], senior: ["senior", "lead"] };

const files = [];
for (const smp of await externalSamples()) {
  const { id, text } = smp; if (!smp.role || !text || (smp.spec && smp.spec.kind !== "single")) continue;
  if (text.trim().split(/\s+/).length < 120) continue;
  const sc = {}, held = {}, level = {}; const own = S.own(smp.role);
  for (const fam of fams) { const r = M.match(text, { jobs: jobs[fam], label: fam }); sc[fam] = r.overall; if (r.standing) held[fam] = r.standing; level[fam] = r.profile.level; }
  // the level read is relative to the role asked about: take the read against the sample's own role
  files.push({ id, role: smp.role, own, group: S.groupOfSample(smp.role), seniority: smp.seniority, level: level[own || fams[0]], sc, held });
}

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return NaN; const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
const pct = x => isNaN(x) ? "–" : Math.round(x * 100) + "%";
// `to` limits the target families (one group of roles); without it every family of the set is a target
const groups = (fs, to = fams) => ({
  same: fs.filter(f => f.own && to.includes(f.own)).map(f => f.sc[f.own]),
  adjacent: fs.filter(f => f.group).flatMap(f => to.filter(x => x !== f.own && S.groupOf(x) === f.group).map(x => f.sc[x])),
  other: fs.flatMap(f => to.filter(x => !f.group || S.groupOf(x) !== f.group).map(x => f.sc[x])),
});
// probability that a random member of a scores above a random member of b
const auc = (a, b) => { if (!a.length || !b.length) return NaN; let w = 0; for (const x of a) for (const y of b) w += x > y ? 1 : x === y ? 0.5 : 0; return w / (a.length * b.length); };
// Cut points. Below the first, a resume scores like three in four resumes from another field. The second is the
// score that best splits same-role from adjacent-role resumes (largest true-positive minus false-positive rate).
// The third is where the top quarter of same-role resumes begins.
const cuts = g => {
  const low = q(g.other, 0.75); let best = 0, high = NaN;
  if (g.same.length && g.adjacent.length) for (let t = 0.2; t <= 0.95; t += 0.01) { const j = g.same.filter(x => x >= t).length / g.same.length - g.adjacent.filter(x => x >= t).length / g.adjacent.length; if (j > best) { best = j; high = t; } }
  return { low, high, strong: q(g.same, 0.75) };
};
// bootstrap over files: how far do the cut points move with a different draw of sample resumes?
function bootstrap(to) {
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const boot = { low: [], high: [], strong: [] };
  for (let b = 0; b < 400; b++) { const s = files.map(() => files[Math.floor(rnd() * files.length)]); const cc = cuts(groups(s, to)); for (const k in boot) if (!isNaN(cc[k])) boot[k].push(cc[k]); }
  return k => `${pct(q(boot[k], 0.05))} to ${pct(q(boot[k], 0.95))}`;
}
const g = groups(files), c = cuts(g), ci = bootstrap(fams);
const band = x => x >= c.strong ? 3 : x >= c.high ? 2 : x >= c.low ? 1 : 0;
const share = (a, b) => pct(a.filter(x => band(x) === b).length / a.length);
const row = (name, a) => `| ${name} | ${a.length} | ${pct(q(a, 0.05))} | ${pct(q(a, 0.25))} | ${pct(q(a, 0.5))} | ${pct(q(a, 0.75))} | ${pct(q(a, 0.95))} |`;
const lvl = files.filter(f => f.own && SENIORITY[f.seniority]);
const top = files.filter(f => f.own);
const isTop = f => f.sc[f.own] >= Math.max(...fams.map(x => f.sc[x])) - 1e-9;
const bandTable = () => [
  "| band | score | rule | interval | same role | adjacent role | other field |", "|---|---|---|---|---|---|---|",
  `| Reads like people in the role | ${pct(c.strong)} and above | the top quarter of same-role resumes | ${ci("strong")} | ${share(g.same, 3)} | ${share(g.adjacent, 3)} | ${share(g.other, 3)} |`,
  `| In range for the role | ${pct(c.high)} to ${pct(c.strong)} | from the score that best splits same-role from adjacent-role resumes | ${ci("high")} | ${share(g.same, 2)} | ${share(g.adjacent, 2)} | ${share(g.other, 2)} |`,
  `| Related background | ${pct(c.low)} to ${pct(c.high)} | above three in four other-field resumes | ${ci("low")} | ${share(g.same, 1)} | ${share(g.adjacent, 1)} | ${share(g.other, 1)} |`,
  `| A different field so far | below ${pct(c.low)} | | | ${share(g.same, 0)} | ${share(g.adjacent, 0)} | ${share(g.other, 0)} |`];

let out;
if (!MBA) out = [
  "# Calibration: what a match score means", "",
  `Produced by \`node evals/calibrate.mjs\` on ${new Date().toISOString().slice(0, 10)} from ${files.length} published sample resumes in \`evals/resumes/external/\` (the files are not in the repository; see \`external_sources.json\`). Each is scored against the six product role families (all levels). ${top.length} were written for a product role and ${files.length - top.length} for another field. The role a sample was written for is the answer key.`, "",
  "## Score by group", "",
  "| group | scores | 5th pct | 25th | median | 75th | 95th |", "|---|---|---|---|---|---|---|",
  row("Same role (a product resume against its own role)", g.same), row("Adjacent role (against the other product roles)", g.adjacent), row("Other field (a non-product resume against product roles)", g.other), "",
  `The score ranks a same-role resume above an other-field resume ${pct(auc(g.same, g.other))} of the time, and above an adjacent-role one ${pct(auc(g.same, g.adjacent))} of the time (0.5 would be chance). A resume's own role is its highest-scoring product role in ${top.filter(isTop).length} of ${top.length}. The level read agrees with the sample's stated seniority in ${lvl.filter(f => SENIORITY[f.seniority].includes(f.level)).length} of ${lvl.length}.`, "",
  "## Bands of fit", "",
  "Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.", "",
  ...bandTable(), "",
  "Read each row across: of the resumes in a group, the share that lands in the band.", "",
  "## Limits", "",
  "- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.",
  `- ${top.length} same-role resumes is a small sample; the intervals show how far the cut points move.`,
  "- These bands are for the product roles. The MBA role set has its own file, `calibration_mba.md`.",
  "- A sample's seniority is the publisher's label or the one read from the resume, and the scores here are against all levels of a role.", "",
];
else {
  // role held: a same-role resume of a person who held the role, and whether the floor the runner checks holds
  const sameHeld = top.filter(f => f.held[f.own]); const floorOk = sameHeld.filter(f => f.sc[f.own] >= (f.held[f.own].above ? 0.6 : 0.5));
  const heldSc = sameHeld.map(f => f.sc[f.own]), notHeldSc = top.filter(f => !f.held[f.own]).map(f => f.sc[f.own]);
  const inGroup = f => S.groupOf(fams.reduce((a, x) => f.sc[x] > f.sc[a] ? x : a, fams[0])) === f.group;
  const perGroup = S.groups.map(gr => { const gg = groups(files, gr.families); return { gr, gg, cc: cuts(gg), cii: bootstrap(gr.families) }; });
  const MIN = 10; // fewer same-role resumes than this give no cut points worth printing
  const mid = a => a.length ? `${pct(q(a, 0.5))} (${pct(q(a, 0.25))}–${pct(q(a, 0.75))})` : "–";
  out = [
    "# Calibration for the MBA role set: what a match score means", "",
    `Produced by \`node evals/calibrate.mjs --roles mba\` on ${new Date().toISOString().slice(0, 10)} from ${files.length} published sample resumes in \`evals/resumes/external/\` (the files are not in the repository; see \`external_sources.json\`). Each is scored against the ${fams.length} role families of the MBA graph (US postings, all levels). ${top.length} were written for one of these roles. The role a sample was written for is the answer key. Adjacent roles are the other roles of the same group (${S.groups.length} groups, from \`web/data/roles_mba.json\`); roles of other groups are another field.`, "",
    "## Score by group of resumes", "",
    "| group | scores | 5th pct | 25th | median | 75th | 95th |", "|---|---|---|---|---|---|---|",
    row("Same role (a resume against its own role)", g.same), row("Adjacent role (against the other roles of its group)", g.adjacent), row("Other field (against the roles of other groups)", g.other), "",
    `The score ranks a same-role score above an other-field score ${pct(auc(g.same, g.other))} of the time, and above an adjacent-role score ${pct(auc(g.same, g.adjacent))} of the time (50% would be chance). A resume's own role is its highest-scoring role of the ${fams.length} in ${top.filter(isTop).length} of ${top.length}; its highest-scoring role is in its own group in ${top.filter(inGroup).length} of ${top.length}. The level read agrees with the seniority read from the resume in ${lvl.filter(f => SENIORITY[f.seniority].includes(f.level)).length} of ${lvl.length}.`, "",
    "## Role held", "",
    `A person who held the target role for a year or more, at the level read or above, gets part credit for what the resume does not show. Of the ${top.length} same-role resumes, the matcher read the role as held in ${sameHeld.length}. Their median score against their own role is ${pct(q(heldSc, 0.5))}; the median of the ${notHeldSc.length} where the role was not read as held is ${pct(q(notHeldSc, 0.5))}. The floor that \`run.mjs\` checks (60% when held above the level, 50% at it) holds in ${floorOk.length} of ${sameHeld.length}.`, "",
    "## By role group", "",
    "Each row scores the resumes against the roles of one group only. The last two columns say how often a same-role score is above an adjacent-role score, and above an other-field score.", "",
    "| role group | same-role resumes | same: median (25th–75th) | adjacent: median (25th–75th) | other field: median (25th–75th) | above adjacent | above other field |", "|---|---|---|---|---|---|---|",
    ...perGroup.map(({ gr, gg }) => `| ${gr.label} | ${gg.same.length} | ${mid(gg.same)} | ${mid(gg.adjacent)} | ${mid(gg.other)} | ${pct(auc(gg.same, gg.adjacent))} | ${pct(auc(gg.same, gg.other))} |`), "",
    "## Bands of fit, all roles together", "",
    "Cut points come from the distributions above, not from round numbers. The interval is the 5th to 95th percentile over 400 bootstrap resamples of the files.", "",
    ...bandTable(), "",
    "Read each row across: of the scores in a group, the share that lands in the band.", "",
    "## Cut points by role group", "",
    `The same three rules, on the roles of one group. A group with fewer than ${MIN} same-role resumes gets no cut points of its own.`, "",
    "| role group | same-role resumes | related background from | in range from | reads like people in the role from |", "|---|---|---|---|---|",
    ...perGroup.map(({ gr, gg, cc, cii }) => gg.same.length < MIN ? `| ${gr.label} | ${gg.same.length} | too few | too few | too few |` : `| ${gr.label} | ${gg.same.length} | ${pct(cc.low)} (${cii("low")}) | ${pct(cc.high)} (${cii("high")}) | ${pct(cc.strong)} (${cii("strong")}) |`), "",
    "## Limits", "",
    "- The samples are examples that resume sites and career offices publish: tidier and richer in keywords than most real resumes, so real resumes will sit lower in each band.",
    "- The role a sample is filed under is the publisher's. A \"Business Analyst\" sample filed under business analytics manager counts as same-role here.",
    "- Groups are small. Read the intervals before the cut points.",
    "- Scores are against all levels of a role, and against US postings only.", "",
  ];
}
fs.writeFileSync(path.join(here, MBA ? "calibration_mba.md" : "calibration.md"), out.join("\n"));
console.log(out.slice(4, 60).join("\n"));
