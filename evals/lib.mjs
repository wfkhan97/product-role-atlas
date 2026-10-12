// Shared by the eval scripts: the published sample resumes (single files and the resumes inside packets), the role
// families and the taxonomy of the MBA role set.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extractText, READABLE } from "./extract.mjs";

export const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.join(here, "..");
const J = f => JSON.parse(fs.readFileSync(f, "utf8"));
export const EXTERNAL_DIR = path.join(here, "resumes", "external");
export const EXPECTED = J(path.join(here, "external_expectations.json"));
export const SOURCES = Object.fromEntries(J(path.join(here, "external_sources.json")).map(e => [e.id, e]));

// Role families of the MBA role set, written by the graph build from pipeline/roles_mba.py.
export function rolesData() { return J(path.join(root, "web/data/roles_mba.json")); }

// The taxonomy as the MBA role set sees it (shared skills plus those marked only: ["mba"]), as pipeline/tax.py gives it.
export function mbaTaxonomy() {
  const tax = J(path.join(root, "pipeline/taxonomy.json"));
  return { clusters: tax.clusters, skills: tax.skills.filter(s => !s.only || s.only.includes("mba")) };
}

// One resume cut out of a packet: lines first..last (1-based) of the packet's text. `starts` guards the cut: if the
// text of the file comes out differently one day, the part fails loudly rather than reading the wrong lines.
export function cutPart(text, part) {
  const lines = text.split("\n"), [a, b] = part.lines;
  if (part.starts && !(lines[a - 1] || "").trim().startsWith(part.starts)) throw new Error(`line ${a} does not start with "${part.starts}"`);
  return lines.slice(a - 1, b).join("\n");
}

// Every sample in evals/resumes/external/: { id, file, text | error, spec, role, seniority, packet }.
// A packet gives one sample per resume in it; `spec` is null when nothing has been written for the file yet.
export async function externalSamples({ only } = {}) {
  const out = [];
  if (!fs.existsSync(EXTERNAL_DIR)) return out;
  for (const f of fs.readdirSync(EXTERNAL_DIR).filter(f => READABLE.test(f)).sort()) {
    const id = f.replace(READABLE, ""), spec = EXPECTED[id] || null, src = SOURCES[id] || {};
    if (only && !f.includes(only)) continue;
    let text = null, error = null;
    try { text = await extractText(path.join(EXTERNAL_DIR, f)); } catch (e) { error = String(e.message).split("\n")[0]; }
    if (!spec || spec.kind !== "packet" || !spec.parts || error) { out.push({ id, file: f, text, error, spec, role: src.role || null, seniority: (spec && spec.seniority) || src.seniority || "unknown", packet: null }); continue; }
    for (const part of spec.parts) {
      let t = null, err = null; try { t = cutPart(text, part); } catch (e) { err = e.message; }
      out.push({ id: part.id, file: f, text: t, error: err, spec: { kind: part.kind || "single", ...part }, role: part.role || null, seniority: part.seniority || "unknown", packet: id });
    }
  }
  return out;
}
