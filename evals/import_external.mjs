// Bring sample resumes you downloaded by hand into evals/resumes/external/ under their ids.
// It looks in a folder (default: ~/Downloads) for files named like the last part of each "manual" URL in
// external_sources.json, with or without a browser's " (1)" suffix, and copies them. Nothing is deleted.
//
//   node evals/import_external.mjs [folder]
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const from = process.argv[2] || path.join(os.homedir(), "Downloads");
const dir = path.join(here, "resumes", "external");
const list = JSON.parse(fs.readFileSync(path.join(here, "external_sources.json"))).filter(e => e.fetch === "manual");
const MAGIC = { pdf: b => b.subarray(0, 5).toString() === "%PDF-", docx: b => b[0] === 0x50 && b[1] === 0x4b };
fs.mkdirSync(dir, { recursive: true });
const files = fs.readdirSync(from);
let n = 0;
for (const e of list) {
  const base = decodeURIComponent(path.basename(new URL(e.url).pathname));
  const stem = base.replace(/\.[^.]+$/, "");
  const hit = files.filter(f => f === base || (f.startsWith(stem) && /^( ?\(\d+\)|-\d+)?\.(pdf|docx)$/i.test(f.slice(stem.length)) && f.toLowerCase().endsWith("." + e.file_type)))
    .sort((a, b) => fs.statSync(path.join(from, b)).mtimeMs - fs.statSync(path.join(from, a)).mtimeMs)[0];
  if (!hit) continue;
  const buf = fs.readFileSync(path.join(from, hit));
  if (!MAGIC[e.file_type](buf)) { console.log("skip ", hit, "(not a " + e.file_type + " file)"); continue; }
  fs.writeFileSync(path.join(dir, `${e.id}.${e.file_type}`), buf);
  console.log("copied", hit, "->", `${e.id}.${e.file_type}`); n++;
}
console.log(n ? `${n} file(s) imported into evals/resumes/external/` : `No matching files found in ${from}`);
