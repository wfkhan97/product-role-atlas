// The pasted posting (PLAN.md v16, step 9): the 99 golden MBA postings (evals/golden_mba.json) pasted one by one and
// read by Atlas.readPosting, the reader the fit screen runs in the browser, against the tags the pipeline gives the
// same text (pipeline/extract.py, the same taxonomy patterns through another cleaner and the context fixes). For each
// posting the browser must show at least 80% of the skills the pipeline tags, and never a skill the pipeline does not
// tag; over the set, the same two numbers. The pipeline's side comes from a short python run (the venv's python, else
// python3), so this needs no network and no key. Exits 1 on a violation.
//   node evals/posting.mjs
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..");
const require = createRequire(import.meta.url);
const Matcher = require(path.join(root, "web/match.js"));
const A = require(path.join(root, "web/atlas.js"))({ load: url => Promise.resolve(JSON.parse(fs.readFileSync(path.join(root, "web", url), "utf8"))), Matcher });
const G = JSON.parse(fs.readFileSync(path.join(here, "golden_mba.json"), "utf8"));
const FLOOR = 0.8;

// the pipeline's tags and role for each golden posting
const py = ["../.venv/bin/python", ".venv/bin/python", "python3", "python"].map(p => p.startsWith(".") ? path.join(root, p) : p).find(p => { try { return p.includes("/") ? fs.existsSync(p) : (execFileSync(p, ["--version"], { stdio: "pipe" }), true); } catch { return false; } });
const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(root)})
from pipeline import extract
G = json.load(open(${JSON.stringify(path.join(here, "golden_mba.json"))}))
skills = extract.skills_for("mba"); cfg = extract.ROLE_SETS["mba"]
out = []
for r in G["rows"]:
    text = r["title"] + "\\n" + extract.clean(r["description"], r["company"], cfg.get("split_long", False))
    tags = [k for k in extract.tag(text, skills) if not k.startswith("yoe_")]
    fam = cfg["family"](r["title"], {"title": r["title"], "company": r["company"], "category": r.get("category")})
    out.append({"url": r["url"], "tags": sorted(tags), "role": fam})
print(json.dumps(out))
`;
const pipe = JSON.parse(execFileSync(py, ["-c", script], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
const byUrl = Object.fromEntries(pipe.map(p => [p.url, p]));

let pass = 0, fail = 0; const bad = []; const check = (ok, msg) => { ok ? pass++ : (fail++, bad.push(msg)); };
const ix = await A.index();
const CRED = new Set(ix.M.skills.filter(s => s.cluster === "credentials").map(s => s.id));
let shownAll = 0, taggedAll = 0, extraAll = 0, rolesSeen = new Set();
const rows = [];
for (const r of G.rows) {
  const p = byUrl[r.url]; if (!p) { check(false, `${r.title}: no pipeline tags`); continue; }
  const tagged = new Set(p.tags.filter(k => !CRED.has(k)));
  const read = await A.readPosting(r.title + "\n" + r.description);
  const shown = new Set([...read.found].filter(k => ix.skillById[k] && !CRED.has(k)));
  const hit = [...tagged].filter(k => shown.has(k)), extra = [...shown].filter(k => !tagged.has(k));
  const share = tagged.size ? hit.length / tagged.size : 1;
  shownAll += hit.length; taggedAll += tagged.size; extraAll += extra.length; if (p.role) rolesSeen.add(p.role);
  check(share >= FLOOR, `${r.title} (${r.company}, ${p.role || "role unknown"}): the browser shows ${hit.length} of ${tagged.size} tagged skills (${Math.round(100 * share)}%): missing ${[...tagged].filter(k => !shown.has(k)).join(", ")}`);
  check(extra.length === 0, `${r.title} (${r.company}): the browser shows ${extra.length} skill(s) the pipeline does not tag: ${extra.join(", ")}`);
  rows.push({ title: r.title, role: p.role, tagged: tagged.size, hit: hit.length, extra: extra.length });
}
console.log(`posting: ${G.rows.length} golden postings over ${rolesSeen.size} roles; the browser shows ${shownAll} of ${taggedAll} pipeline-tagged skills (${Math.round(100 * shownAll / taggedAll)}%), ${extraAll} skills the pipeline does not tag; floor per posting ${Math.round(100 * FLOOR)}%`);
const worst = rows.slice().sort((a, b) => a.hit / a.tagged - b.hit / b.tagged).slice(0, 3);
console.log("  lowest: " + worst.map(w => `${w.title} ${w.hit}/${w.tagged}`).join("; "));
for (const m of bad.slice(0, 20)) console.log("FAIL " + m);
console.log(`posting: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
