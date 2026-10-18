// The rough read of a resume (Atlas.roughFit, from the index alone) against the full matcher's scores on every
// MBA role. The rough read picks the fields on Explore and marks roles in a field; this measures how far it agrees
// with the score the fit screen shows.
//
//   node evals/rough_fit.mjs              # in-repo samples plus up to 60 published samples (evals/resumes/external/)
//   node evals/rough_fit.mjs --all        # every published sample (slow)
//   node evals/rough_fit.mjs --baseline   # also rewrite evals/rough_fit.md
//
// For each resume: the Spearman correlation between the rough score and the full score over the 50 roles, whether
// the full matcher's top role is in the rough top 5, and whether its group is in the rough top 3 fields. A published
// sample's own role (from its file name) is checked the same way. The check: the median correlation stays at or above
// the floor in FLOOR, and the full matcher's top role is in the rough top 5 for at least FLOOR.top5 of the resumes.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { extractText } from "./extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, ".."), web = path.join(root, "web");
const require = createRequire(import.meta.url);
const Matcher = require(path.join(web, "match.js"));
const Atlas = require(path.join(web, "atlas.js"))({ load: f => JSON.parse(fs.readFileSync(path.join(web, f))), Matcher });
const { loadGraph } = await import("./graph_mba.mjs");
const J = f => JSON.parse(fs.readFileSync(path.join(root, f)));
const FLOOR = { spearman: 0.7, top5: 0.7 };
const args = process.argv.slice(2), ALL = args.includes("--all"), BASELINE = args.includes("--baseline");

// the full matcher, as calibrate.mjs builds it: the whole MBA graph, the calibrated scoring
const G = loadGraph(), ROLES = J("web/data/roles_mba.json"), BANDS = J("web/data/bands_mba.json");
const ix = await Atlas.index();
const M = Matcher.createMatcher({ taxonomy: J("web/data/taxonomy_mba.json"), subskills: J("web/data/subskills_mba.json"), graph: G, roles: ROLES, distinct: { ...BANDS.scoring.distinct, baseline: ix.baseline } });
const byFam = {}; for (const j of G.jobs) (byFam[j.family] ||= []).push(j);
const MBA = Object.keys(G.families);

// samples: the in-repo ones (any role set; scored against the MBA roles all the same) and the published ones by role
const samples = [];
for (const f of fs.readdirSync(path.join(here, "resumes")).filter(f => f.endsWith(".txt"))) samples.push({ name: f, role: null, text: fs.readFileSync(path.join(here, "resumes", f), "utf8") });
const ext = path.join(here, "resumes/external");
if (fs.existsSync(ext)) {
  const files = fs.readdirSync(ext).filter(f => /\.(txt|pdf|docx)$/i.test(f)).sort();
  for (const f of ALL ? files : files.filter((_, i) => i % Math.ceil(files.length / 60) === 0)) {
    const role = MBA.find(r => f.startsWith(r + "_")) || null;
    try { samples.push({ name: f, role, text: await extractText(path.join(ext, f)) }); } catch (e) { console.error(`skip ${f}: ${e.message}`); }
  }
}

function spearman(a, b) {
  const rank = xs => { const idx = xs.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]); const r = []; idx.forEach(([, i], k) => { r[i] = k + 1; }); return r; };
  const ra = rank(a), rb = rank(b), n = a.length; let d = 0; for (let i = 0; i < n; i++) d += (ra[i] - rb[i]) ** 2;
  return 1 - 6 * d / (n * (n * n - 1));
}
const rows = [];
for (const s of samples) {
  if (!s.text || s.text.trim().length < 40) continue;
  const rough = await Atlas.roughFit(s.text);
  const full = {}; for (const r of MBA) full[r] = M.match(s.text, { jobs: byFam[r], familyJobs: byFam[r], label: r }).overall;
  const rs = MBA.map(r => rough.scores[r] || 0), fs_ = MBA.map(r => full[r]);
  const rho = spearman(rs, fs_);
  const roughTop = MBA.slice().sort((a, b) => (rough.scores[b] || 0) - (rough.scores[a] || 0));
  const fullTop = MBA.slice().sort((a, b) => full[b] - full[a]);
  const group = r => ix.roles[r] ? ix.roles[r].group : (BANDS.group_of || {})[r];
  const roughFields = [...new Set(roughTop.map(group))];
  rows.push({ name: s.name, role: s.role, rho, fullTop: fullTop[0], inTop5: roughTop.slice(0, 5).includes(fullTop[0]), fieldTop3: roughFields.slice(0, 3).includes(group(fullTop[0])), ownInTop5: s.role ? roughTop.slice(0, 5).includes(s.role) : null, ownFieldTop3: s.role ? roughFields.slice(0, 3).includes(group(s.role)) : null, held: rough.held.join(" ") });
}
const med = xs => { const a = xs.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
const share = (xs, fn) => { const v = xs.filter(x => fn(x) !== null); return v.length ? v.filter(fn).length / v.length : null; };
const withRole = rows.filter(r => r.role);
const summary = { n: rows.length, medianRho: med(rows.map(r => r.rho)), top5: share(rows, r => r.inTop5), fieldTop3: share(rows, r => r.fieldTop3), ownTop5: share(withRole, r => r.ownInTop5), ownFieldTop3: share(withRole, r => r.ownFieldTop3), nRole: withRole.length };
const pctf = v => v == null ? "–" : Math.round(v * 100) + "%";
const lines = [`# Rough fit vs the full matcher`, ``, `Written by \`node evals/rough_fit.mjs --baseline\` on ${new Date().toISOString().slice(0, 10)}. ${rows.length} resumes (${withRole.length} published samples with a role in the file name).`, ``,
  `| measure | value |`, `|---|---|`, `| median Spearman, rough vs full over the 50 roles | ${summary.medianRho.toFixed(2)} |`, `| full matcher's top role in the rough top 5 | ${pctf(summary.top5)} |`, `| full matcher's top role's field in the rough top 3 fields | ${pctf(summary.fieldTop3)} |`, `| the sample's own role in the rough top 5 | ${pctf(summary.ownTop5)} |`, `| the sample's own field in the rough top 3 fields | ${pctf(summary.ownFieldTop3)} |`, ``,
  `| resume | own role | rho | full top role | in rough top 5 | field in top 3 | roles held |`, `|---|---|---|---|---|---|---|`,
  ...rows.map(r => `| ${r.name} | ${r.role || ""} | ${r.rho.toFixed(2)} | ${r.fullTop} | ${r.inTop5 ? "yes" : "no"} | ${r.fieldTop3 ? "yes" : "no"} | ${r.held} |`)];
const report = lines.join("\n") + "\n";
if (BASELINE) fs.writeFileSync(path.join(here, "rough_fit.md"), report);
console.log(lines.slice(0, 12).join("\n"));
const ok = summary.medianRho >= FLOOR.spearman && (summary.top5 ?? 1) >= FLOOR.top5;
console.log(`\nrough fit: ${ok ? "PASS" : "FAIL"} (median rho ${summary.medianRho.toFixed(2)} vs floor ${FLOOR.spearman}; top-5 ${pctf(summary.top5)} vs floor ${pctf(FLOOR.top5)})`);
process.exit(ok ? 0 : 1);
