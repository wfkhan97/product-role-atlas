// Read every file in evals/resumes/external/ (or a folder you name) and flag the ones the parser reads badly,
// without needing expectations: no jobs found, a job with no title, implausible years, almost no text.
//
//   node evals/parse_health.mjs [--all] [folder]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { extractText, READABLE } from "./extract.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { parseResume } = require(path.join(here, "..", "web", "match.js"));
const args = process.argv.slice(2); const all = args.includes("--all");
const dir = args.find(a => !a.startsWith("--")) || path.join(here, "resumes", "external");
const known = JSON.parse(fs.readFileSync(path.join(here, "external_expectations.json")));
let n = 0, bad = 0; const reasons = {};
for (const f of fs.readdirSync(dir).filter(f => READABLE.test(f)).sort()) {
  const id = f.replace(READABLE, ""); if (known[id] && known[id].kind !== "single") continue; // packets and templates
  let text; try { text = await extractText(path.join(dir, f)); } catch (e) { text = ""; }
  const p = parseResume(text); const jobs = p.roles.filter(r => r.section !== "projects");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0; const flags = [];
  if (words < 120) flags.push("almost no text");
  else if (!jobs.length) flags.push("no jobs");
  if (jobs.some(r => !r.title || r.title.length < 3)) flags.push("job without a title");
  if (jobs.some(r => r.title.length > 60)) flags.push("title too long");
  if (p.totalYears > 45) flags.push("years over 45");
  if (jobs.length >= 2 && p.totalYears === 0 && !jobs.every(r => r.isIntern)) flags.push("jobs but no years");
  if (!p.degrees.size) flags.push("no degree");
  n++; if (flags.length) { bad++; for (const x of flags) reasons[x] = (reasons[x] || 0) + 1; }
  if (flags.length || all) console.log(f.padEnd(46), String(words).padStart(5), "words |", String(jobs.length).padStart(2), "jobs", p.totalYears.toFixed(1).padStart(5), "yrs |", flags.join("; ") || "ok", "|", jobs.slice(0, 3).map(r => r.title.slice(0, 28)).join(" ; "));
}
console.log(`\n${n - bad} of ${n} files read with no flag.`, Object.entries(reasons).map(([k, v]) => `${k}: ${v}`).join(", "));
