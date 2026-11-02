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
// The MBA role set scores with distinctive asks weighed up (see `distinct` in web/match.js). The bands are valid
// for this setting only, so it is written into bands_mba.json for the interface to use. DISTINCT='{"floor":0,"full":3}'
// in the environment tries another setting: the report is printed and nothing is written.
const DISTINCT_MBA = { floor: 0.2, full: 2 };
// For the product roles the weighting is built and measured but OFF (PRODUCT_ON) until the owner decides: with it
// the sample of an MBA student with one PM internship falls just below "in range" against entry-level PM roles,
// and that sample's score band is part of the spec. The six product families ask for the same product
// skills, so among themselves nothing is distinctive: their "all roles" is the 50 roles of the MBA graph, given
// to the matcher as a baseline (the mean share of each skill across those roles).
function mbaBaseline(ids) {
  const g = loadGraph(), by = {}; for (const j of g.jobs) (by[j.family] ||= []).push(j);
  const fams = Object.values(by), out = {};
  const numeric = g.jobs.length && typeof g.jobs[0].skills[0] === "number"; // the graph files store skills as indices into skill_ids
  for (const id of ids) { const key = numeric ? g.skill_ids.indexOf(id) : id; let sum = 0; for (const jobs of fams) { let n = 0, c = 0; for (const j of jobs) { const w = j.w == null ? 1 : j.w; n += w; if (j.skills.includes(key)) c += w; } sum += c / (n || 1); } out[id] = Math.round(1e4 * sum / fams.length) / 1e4; }
  return out;
}
const DISTINCT_PRODUCT = { floor: 0.2, full: 2 };
const PRODUCT_ON = !!process.env.PRODUCT_DISTINCT; // PRODUCT_DISTINCT=1 prints the report with it on and writes nothing
const DATA = path.join(root, "web/data"); // the bands are data of the interface: bands.json (product), bands_mba.json
// Groups the owner holds back whatever the numbers say (decided 2026-10-12, to be lifted when the samples improve).
const HOLD = { risk: "held back by the owner until the group has more samples of people who hold the role (most are law-school resumes of students and career changers)" };
const TRY = process.env.DISTINCT ? JSON.parse(process.env.DISTINCT) : null;
// Behaviours (PLAN.md v14, decision 1) are rows credited through their carriers. "show" (the setting in use) gives them
// weight 0, so every score is what it was before the rows existed and the cut points hold; "score" weighs them like
// every ask. BEHAVIOURS=score in the environment tries the other setting: the report is printed and nothing is written.
const BEHAVIOURS = process.env.BEHAVIOURS || "show";
const TRYING = !!(TRY || PRODUCT_ON || process.env.BEHAVIOURS);
const MBA = process.argv.includes("--roles") && process.argv[process.argv.indexOf("--roles") + 1] === "mba";

// A role set: its matcher, its role families, the group of each family, and how a sample's role maps onto them.
// `own` is the family a sample was written for; `group` is the group whose other families count as adjacent.
function productSet() {
  const G = J("web/data/graph.json"), TAXP = J("web/data/taxonomy.json");
  DISTINCT_PRODUCT.baseline = mbaBaseline(TAXP.skills.map(s => s.id));
  const fams = ["pm", "product_owner", "tpm", "pmm", "product_analyst", "product_ops"];
  const OWN = { pm: "pm", product_owner: "product_owner", tpm: "tpm", pmm: "pmm", product_analyst: "product_analyst", product_ops: "product_ops", product_strategy: "pm" };
  return { G, fams, M: createMatcher({ taxonomy: TAXP, subskills: J("web/data/subskills.json"), graph: G, distinct: TRY || (PRODUCT_ON ? DISTINCT_PRODUCT : false), behaviours: BEHAVIOURS }),
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
  return { G, fams, M: createMatcher({ taxonomy: J("web/data/taxonomy_mba.json"), subskills: J("web/data/subskills_mba.json"), graph: G, roles: R, distinct: TRY || DISTINCT_MBA, behaviours: BEHAVIOURS }),
    groupOf: f => groupOf[f], groups: R.groups, own, groupOfSample: r => own(r) ? groupOf[own(r)] : BESIDE[r] || null };
}
const S = MBA ? mbaSet() : productSet();
const { G, M, fams } = S;
const jobs = Object.fromEntries(fams.map(f => [f, G.jobs.filter(j => j.family === f)]));
const SENIORITY = { early: ["associate"], mid: ["mid", "senior"], senior: ["senior", "lead"] };

const files = [];
const samples = await externalSamples();
// a sample that cannot be read would silently drop out of the bands (PDF and DOCX need npm install in evals/)
const unread = samples.filter(x => x.error);
if (unread.length) { console.error(`${unread.length} of ${samples.length} samples could not be read (first: ${unread[0].file}: ${unread[0].error}); run npm install in evals/ and try again. Nothing written.`); process.exit(1); }
for (const smp of samples) {
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
if (!MBA && !TRYING) fs.writeFileSync(path.join(DATA, "bands.json"), JSON.stringify({
  about: "Bands of fit for the product roles, written by node evals/calibrate.mjs (do not edit by hand). A score at or above 'strong' reads like people in the role; at or above 'in_range' it is in range for the role; at or above 'related' it is a related background; below that, a different field so far. The cut points hold only for scores made with createMatcher({ ..., distinct: scoring.distinct, behaviours: scoring.behaviours }) (distinct null: every ask counts by its share; behaviours 'show': a behaviour is a row with weight 0, credited through its carriers for display only); web/app.js creates its matcher that way.",
  generated: new Date().toISOString().slice(0, 10), resumes: files.length, scoring: { distinct: null, behaviours: BEHAVIOURS },
  related: Math.round(c.low * 100) / 100, in_range: Math.round(c.high * 100) / 100, strong: Math.round(c.strong * 100) / 100,
}, null, 1) + "\n");
if (!MBA) out = [
  "# Calibration: what a match score means", "",
  `Produced by \`node evals/calibrate.mjs\` on ${new Date().toISOString().slice(0, 10)} from ${files.length} published sample resumes in \`evals/resumes/external/\` (the files are not in the repository; see \`external_sources.json\`). Each is scored against the six product role families (all levels)${PRODUCT_ON ? ", with asks weighed by how distinctive they are against the 50 MBA roles" : ""}. ${top.length} were written for a product role and ${files.length - top.length} for another field. The role a sample was written for is the answer key.`, "",
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
  // The bands the interface uses (the owner's choice, 2026-10-12): the two upper lines are shared by all roles,
  // because a group has too few same-role resumes to place them; the bottom line is each group's own, because it
  // is steady in every group and it is where the groups differ most. A group gets no bands when it has too few
  // same-role resumes or when half of its same-role resumes score below its own bottom line (the score does not yet sort its resumes).
  const use = perGroup.map(({ gr, gg, cc, cii }) => {
    const why = HOLD[gr.id] ? HOLD[gr.id] : gg.same.length < MIN ? `fewer than ${MIN} same-role resumes` : q(gg.same, 0.5) < cc.low ? "half of its same-role resumes score below its own bottom line" : cc.low >= c.high ? "its bottom line is above the shared middle line" : null;
    const b = x => x >= c.strong ? 3 : x >= c.high ? 2 : x >= cc.low ? 1 : 0; const sh = (a, k) => a.length ? pct(a.filter(x => b(x) === k).length / a.length) : "–";
    return { gr, gg, cc, cii, why, sh };
  });
  const r2 = x => Math.round(x * 100) / 100;
  if (!TRYING) fs.writeFileSync(path.join(DATA, "bands_mba.json"), JSON.stringify({
    about: "Bands of fit for the MBA role set, written by node evals/calibrate.mjs --roles mba (do not edit by hand). A score at or above 'strong' reads like people in the role; at or above 'in_range' it is in range for the role; at or above the 'related' line of the role's group it is a related background; below that, a different field so far. A group under 'no_bands' gets no band: show no verdict for its roles. web/match.js reads this with Matcher.bandOf(score, bands, group). The cut points hold only for scores made with createMatcher({ ..., distinct: scoring.distinct, behaviours: scoring.behaviours }) (behaviours 'show': a behaviour is a row with weight 0, credited through its carriers for display only).",
    scoring: { distinct: DISTINCT_MBA, behaviours: BEHAVIOURS },
    generated: new Date().toISOString().slice(0, 10), resumes: files.length,
    in_range: r2(c.high), strong: r2(c.strong),
    related: Object.fromEntries(use.filter(u => !u.why).map(u => [u.gr.id, r2(u.cc.low)])),
    no_bands: Object.fromEntries(use.filter(u => u.why).map(u => [u.gr.id, u.why])),
    group_of: Object.fromEntries(fams.map(f => [f, S.groupOf(f)])),
  }, null, 1) + "\n");
  const mid = a => a.length ? `${pct(q(a, 0.5))} (${pct(q(a, 0.25))}–${pct(q(a, 0.75))})` : "–";
  out = [
    "# Calibration for the MBA role set: what a match score means", "",
    `Produced by \`node evals/calibrate.mjs --roles mba\` on ${new Date().toISOString().slice(0, 10)} from ${files.length} published sample resumes in \`evals/resumes/external/\` (the files are not in the repository; see \`external_sources.json\`). Each is scored against the ${fams.length} role families of the MBA graph (US postings, all levels). ${top.length} were written for one of these roles. The role a sample was written for is the answer key. Adjacent roles are the other roles of the same group (${S.groups.length} groups, from \`web/data/roles_mba.json\`); roles of other groups are another field. An ask counts by how distinctive it is for the role (\`distinct\`: an ask that the role's postings set no more often than the mean of all roles keeps ${DISTINCT_MBA.floor} of its weight; one set ${DISTINCT_MBA.full} times as often or more keeps all of it).`, "",
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
    "## The bands in use", "",
    `Written to \`web/data/bands_mba.json\`. The two upper lines are the same for every role: in range from ${pct(c.high)}, reads like people in the role from ${pct(c.strong)}. The bottom line (related background) is each group's own. A group gets no bands when it has too few same-role resumes, when half of them score below the group's own bottom line, or when the owner holds it back: the interface shows no verdict for its roles.`, "",
    "| role group | related background from | interval | same role: different / related / in range / like the role | other field: different / related / in range / like the role |", "|---|---|---|---|---|",
    ...use.map(u => u.why ? `| ${u.gr.label} | no bands | ${u.why} | | |` : `| ${u.gr.label} | ${pct(u.cc.low)} | ${u.cii("low")} | ${[0, 1, 2, 3].map(k => u.sh(u.gg.same, k)).join(" / ")} | ${[0, 1, 2, 3].map(k => u.sh(u.gg.other, k)).join(" / ")} |`), "",
    "Read a row across: of the same-role scores against the roles of that group, the share in each band, then the same for other-field scores.", "",
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
if (TRY || (PRODUCT_ON && !MBA)) { console.log(out.join("\n")); process.exit(0); } // another setting on trial: print, write nothing
fs.writeFileSync(path.join(here, MBA ? "calibration_mba.md" : "calibration.md"), out.join("\n"));
console.log(out.slice(4, 60).join("\n"));
