// Shared by the apprentice scripts (not a script itself): paths, the config, the student folder, the intake reader.
// The atlas is this repository; every script runs from its root. Nothing here calls a model or the network.
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

export const here = path.dirname(fileURLToPath(import.meta.url));          // pipeline/apprentice/
export const repoRoot = path.join(here, "..", "..");                          // this repository, the atlas
export const require = createRequire(import.meta.url);                        // for the atlas's CommonJS modules
export const config = JSON.parse(fs.readFileSync(path.join(here, "config.json"), "utf8"));
export const atlasRoot = repoRoot;
export const atlasWeb = path.join(atlasRoot, "web");
export const studentsRoot = path.join(repoRoot, "data", "apprentice", "students");   // gitignored: real students
export const examplesRoot = path.join(here, "examples");                              // tracked: the fictional example

// A folder outside the repository, named relative to the repo root in config.json: beside the repository first,
// then the same path under the home folder (a worktree sits deeper), as pipeline/catalog_export.py does.
export function outside(relPath) {
  const parts = relPath.split("/").filter(p => p && p !== "..");
  const candidates = [path.resolve(repoRoot, relPath), path.join(os.homedir(), ...parts)];
  return candidates.find(p => fs.existsSync(p)) || candidates[0];
}
export const catalogRoot = outside(config.catalogPath);                       // the SP27 roster folder
export const rosterFile = path.join(catalogRoot, config.rosterFile || "sp27_cornell_tech_classes.json");
// the roster as grounding names it: the configured path, the same on every machine and in every worktree
export const rosterLabel = path.posix.join(config.catalogPath, config.rosterFile || "sp27_cornell_tech_classes.json");
export const gradbuddyStudents = () => path.join(outside(config.gradbuddyPath), "students");
export const today = () => new Date().toISOString().slice(0, 10);
export const rel = f => path.relative(repoRoot, f);
export const die = (msg, code = 1) => { console.error(msg); process.exit(code); };
export const read = f => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null);
export const readJson = f => JSON.parse(fs.readFileSync(f, "utf8"));
export const writeJson = (f, x) => fs.writeFileSync(f, JSON.stringify(x, null, 1) + "\n");

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
// A slug resolves to data/apprentice/students/<slug>/ when that exists, else pipeline/apprentice/examples/<slug>/.
export function studentDir(slug, { mustExist = true } = {}) {
  if (!slug || !SLUG_RE.test(slug)) die("usage: node pipeline/apprentice/<script>.mjs <slug>   (a slug is lowercase letters, digits and dashes)");
  const s = path.join(studentsRoot, slug), e = path.join(examplesRoot, slug);
  if (fs.existsSync(s)) return s;
  if (fs.existsSync(e)) return e;
  if (mustExist) die(`no folder ${rel(s)} or ${rel(e)}; run: node pipeline/apprentice/new.mjs ${slug}`);
  return s;
}

// The intake (INTAKE.md, copied by new.mjs): a fenced yaml block of short answers at the top (key: value; lists are
// comma-separated) and numbered prose sections ("## 2. The posting"). Returns { answers, sections, titles }.
export function readIntake(text) {
  const answers = {};
  const m = (text || "").match(/```ya?ml\n([\s\S]*?)```/);
  if (m) for (const line of m[1].split("\n")) {
    const mm = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!mm) continue;
    let v = mm[2].replace(/\s+#.*$/, "").trim();
    if (/^".*"$/.test(v)) v = v.slice(1, -1);
    answers[mm[1]] = v;
  }
  const sections = {}, titles = {};
  let cur = null;
  for (const line of (text || "").split("\n")) {
    const h = line.match(/^## (\d+)\.\s*(.*)$/);
    if (h) { cur = h[1]; titles[cur] = h[2].trim(); sections[cur] = ""; continue; }
    if (cur) sections[cur] += line + "\n";
  }
  return { answers, sections, titles };
}
export const list = v => (v || "").split(/[,;]\s*|\n/).map(s => s.trim()).filter(s => s && !/^(none|n\/a|—|-)$/i.test(s));
// The class of roles: `roles:` holds one to three atlas role ids, the first is the map's role. An intake written
// before the class (a lone `role:`) reads as a class of one.
export const roleIds = answers => { const r = list((answers || {}).roles); return r.length ? r : list((answers || {}).role); };
// a section's answers without its question lines
export const prose = s => (s || "").split("\n").filter(l => !/^###\s/.test(l)).join("\n").trim();
// a file that holds nothing but comments and blank lines counts as empty
export const isBlank = text => !text || !text.replace(/<!--[\s\S]*?-->/g, "").trim();

// Text comparison for quotes: whitespace collapsed, curly quotes and dashes unified, case folded.
export const norm = s => String(s || "").replace(/[‘’‚]/g, "'").replace(/[“”„]/g, '"').replace(/[‐-―−]/g, "-").replace(/ /g, " ").replace(/\s+/g, " ").trim().toLowerCase();

// The atlas's own modules, loaded the way its tests load them (tests/web/_load.mjs): web/data read from disk.
export function atlas() {
  const Matcher = require(path.join(atlasWeb, "match.js"));
  const factory = require(path.join(atlasWeb, "atlas.js"));
  const load = url => { const f = path.join(atlasWeb, url); return fs.existsSync(f) ? readJson(f) : Promise.reject(new Error(url + ": not found")); };
  const A = factory({ load, Matcher });
  const Catalog = require(path.join(atlasWeb, "catalog.js"))({});
  const EvidenceText = require(path.join(atlasWeb, "evidence_text.js"));
  return { A, Matcher, Catalog, EvidenceText };
}

// The Spring 2027 roster as a list of classes; null when the file is missing.
export function roster() {
  if (!fs.existsSync(rosterFile)) return null;
  const d = readJson(rosterFile);
  return Array.isArray(d) ? d : d.classes || [];
}
// The roster's codes and titles: the research roster when this machine has it, else the atlas's public catalog file
// (web/data/catalog/cornell_tech.json, written by pipeline.catalog_export), so the check and the page run in CI.
export function rosterTitles() {
  const rows = roster() || (readJson(path.join(atlasWeb, "data/catalog/cornell_tech.json")).classes || []);
  return Object.fromEntries(rows.map(c => [c.code, c.title]));
}
