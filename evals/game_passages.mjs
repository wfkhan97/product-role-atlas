// Checks web/data/game_passages.json, the passages of the game Spot the real ask (pipeline/game_passages.py):
// every chunk label is valid, every ask names a skill of its set's taxonomy, each block's chunks join back to its
// text, shares are in [0, 1], no passage is over 700 characters, at most 12 per role, one employer per role at most
// once, the file is under 1 MB, and every role id exists in graph_mba.json roles or graph.json families.
//
//   node evals/game_passages.mjs        # report; exit 1 when a check fails
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = f => JSON.parse(fs.readFileSync(path.join(root, "web/data", f), "utf8"));
const FILE = path.join(root, "web/data/game_passages.json");
const D = JSON.parse(fs.readFileSync(FILE, "utf8"));
const M = read("graph_mba.json"), G = read("graph.json");
const TAX = { mba: new Set(read("taxonomy_mba.json").skills.map(s => s.id)), product: new Set(read("taxonomy.json").skills.map(s => s.id)) };
const roleIds = new Set([...Object.keys(M.roles), ...Object.keys(G.families)]);
const MAX = { chars: 700, perRole: 12, bytes: 1_000_000, chunks: 25 };
const LABELS = new Set(["a", "f", "o", null]);
const FILLER_KINDS = new Set(["filler", "benefits", "legal", "about"]);
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const shareOk = v => v === undefined || v === null || (typeof v === "number" && v >= 0 && v <= 1);

check(Number.isInteger(D.n_jobs) && D.n_jobs > 0, "n_jobs missing");
check(Array.isArray(D.passages) && D.passages.length > 0, "no passages");
const perRole = {}, employers = {}, ids = new Set();
for (const p of D.passages || []) {
  const at = `${p.id} (${p.role})`;
  check(!ids.has(p.id), `${at}: id repeats`); ids.add(p.id);
  check(roleIds.has(p.role), `${at}: role not in graph_mba.json roles or graph.json families`);
  check(p.set === "mba" || p.set === "product", `${at}: set is ${p.set}`);
  check(DIFFICULTIES.has(p.difficulty), `${at}: difficulty is ${p.difficulty}`);
  check(D.roles && D.roles[p.role], `${at}: no roles entry`);
  for (const k of ["company", "title", "url", "section", "group"]) check(typeof p[k] === "string" && p[k], `${at}: ${k} missing`);
  check(/^https?:\/\//.test(p.url || ""), `${at}: url is not a link`);
  perRole[p.role] = (perRole[p.role] || 0) + 1;
  const key = `${p.role}::${p.company}`;
  check(!employers[key], `${at}: employer ${p.company} appears twice for ${p.role}`); employers[key] = true;
  let chars = 0, asks = 0, fill = 0, n = 0, gaps = 0;
  const tax = TAX[p.set] || new Set();
  for (const b of p.blocks || []) {
    if (b.kind === "gap") { gaps++; continue; }
    check(b.kind === "list" || b.kind === "para", `${at}: block kind ${b.kind}`);
    check(typeof b.text === "string", `${at}: block without text`);
    check((b.chunks || []).map(c => c[0]).join("") === b.text, `${at}: chunks do not join back to the block text`);
    chars += (b.text || "").length;
    for (const c of b.chunks || []) {
      check(Array.isArray(c) && typeof c[0] === "string" && c[0].length > 0, `${at}: empty chunk`);
      check(LABELS.has(c[1]), `${at}: label ${JSON.stringify(c[1])} on "${c[0]}"`);
      if (c[1]) n++;
      if (c[1] === "a") {
        asks++;
        check(Array.isArray(c[2]) && c[2].length > 0 && c[2].every(s => tax.has(s)), `${at}: ask "${c[0]}" names a skill outside the ${p.set} taxonomy: ${JSON.stringify(c[2])}`);
        check(shareOk(c[3]), `${at}: share ${c[3]} on "${c[0]}"`);
      } else if (c[1] === "f") {
        fill++;
        check(FILLER_KINDS.has(c[2]), `${at}: filler kind ${c[2]} on "${c[0]}"`);
        if (c.length > 4) { check(tax.has(c[4]), `${at}: counted skill ${c[4]} outside the taxonomy`); check(shareOk(c[5]), `${at}: counted share ${c[5]}`); }
      } else if (c[1] === null) {
        check(c[0] === "\n" ? b.kind === "list" : /^[\s,;:()—–-]+$/.test(c[0]), `${at}: separator "${c[0]}" is not punctuation`);
      }
    }
  }
  check(chars > 0 && chars <= MAX.chars, `${at}: ${chars} characters`);
  check(n <= MAX.chunks, `${at}: ${n} chunks`);
  check(asks >= 3, `${at}: only ${asks} ask chunks`);
  check(fill >= 1, `${at}: no filler chunk`);
  check(gaps <= 2, `${at}: ${gaps} gaps (two added fragments at most)`);
}
for (const [r, n] of Object.entries(perRole)) check(n <= MAX.perRole, `${r}: ${n} passages (at most ${MAX.perRole})`);
const bytes = fs.statSync(FILE).size;
check(bytes < MAX.bytes, `${bytes} bytes (under ${MAX.bytes})`);

const roles = Object.keys(perRole).length;
console.log(`${D.passages.length} passages over ${roles} roles, ${(bytes / 1024).toFixed(0)} KB, generated ${D.generated}, n_jobs ${D.n_jobs}`);
if (fails.length) { console.log(`FAIL ${fails.length}:`); for (const f of fails.slice(0, 40)) console.log("  " + f); if (fails.length > 40) console.log(`  … and ${fails.length - 40} more`); process.exit(1); }
console.log("ok");
