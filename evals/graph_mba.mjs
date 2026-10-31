// Load the MBA graph as the matcher expects a graph, and check that web/match.js reads it unchanged.
//
//   import { loadGraph } from "./graph_mba.mjs";
//   const G = loadGraph(["fpa", "strategic_finance"]);     // index + the role files named (all roles when omitted)
//   node evals/graph_mba.mjs                               // every role: the matcher builds requirements and scores a resume
//
// The index (web/data/graph_mba.json) has every key of web/data/graph.json with "jobs" empty; a role file
// (web/data/graph_mba/<role>.json) has that role's jobs. A graph is the index plus the jobs of the roles loaded.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const here = path.dirname(fileURLToPath(import.meta.url));
const data = path.join(here, "../web/data");
const read = f => JSON.parse(fs.readFileSync(path.join(data, f)));

export function loadGraph(roles, { evidence = false } = {}) {
  const index = read("graph_mba.json");
  const jobs = (roles || Object.keys(index.families)).flatMap(f => read(index.meta.files[f]).jobs);
  if (evidence) { const ev = read(index.meta.evidence); for (const s of index.skills) s.evidence = ev[s.id] || {}; }
  return { ...index, jobs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const require = createRequire(import.meta.url);
  const { createMatcher } = require(path.join(here, "../web/match.js"));
  const taxonomy = read("taxonomy_mba.json"), subskills = read("subskills_mba.json");
  const index = read("graph_mba.json");
  const resume = fs.readFileSync(path.join(here, "resumes/experienced_pm.txt"), "utf8");
  let pass = 0, fail = 0; const out = [];
  for (const f of Object.keys(index.families)) {
    if (!index.roles[f].n) { out.push(`skip ${f.padEnd(24)}     0 postings  (a role added since the last extraction; nothing to score against)`); continue; }
    try {
      const G = loadGraph([f]);
      const M = createMatcher({ taxonomy, subskills, graph: G });
      const r = M.match(resume, { jobs: G.jobs, label: f, level: null });
      const ok = G.jobs.length > 0 && r.req.core.length + r.req.common.length > 0 && r.overall >= 0 && r.overall <= 1 && G.jobs.every(j => typeof j.skills[0] !== "number");
      ok ? pass++ : fail++;
      out.push(`${ok ? "ok  " : "FAIL"} ${f.padEnd(24)} ${String(G.jobs.length).padStart(5)} postings  core ${String(r.req.core.length).padStart(2)}  common ${String(r.req.common.length).padStart(2)}  product-manager resume scores ${Math.round(r.overall * 100)}%`);
    } catch (e) { fail++; out.push(`FAIL ${f}: ${String(e.message).split("\n")[0]}`); }
  }
  console.log(out.join("\n"));
  console.log(`\nmatcher reads the MBA graph: ${pass} roles pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
