// node pipeline/apprentice/assemble.mjs <slug>  ->  the student's map.json as version 2. Run it after the skill writes
// the cards and before check.mjs. It reads grounding.json and copies the deterministic parts: the role class, the
// first role, the posting's names, the class tree and the read. It writes the worlds from the cards. Every part the
// skill or the owner wrote stays as it is: student, company, the posting's url and title, gap_sentence, tracks, and
// the cards with any shipped, changed, declined or reply. A world's clear the owner set by hand stays too.
// Importable: assembleMap() is the pure part (tests/web/apprentice.test.mjs). Nothing here calls a model.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { studentDir, readJson, writeJson, today, rel, die } from "./_lib.mjs";

// The worlds are the levels in order (R27); a world clears after k of its n missions (R28). These are the defaults;
// the owner may set another clear per world by hand, and the check refuses one above the count.
export const WORLDS = [
  { n: 1, label: "Fundamentals", release: "I do", who: "You read and write a page. A few hours each.", clear: 2 },
  { n: 2, label: "Three demos in a day", release: "we do", who: "You build with help beside you. One day each.", clear: 2 },
  { n: 3, label: "One project, real users", release: "you do", who: "You build for real users. Four to eight weeks.", clear: 1 },
  { n: "reach", label: "Reach", release: "you do", who: "A product-sized project with no deadline. It never blocks a world.", clear: 0, optional: true },
];
// The map as version 2 from the map as written and the grounding: { map, declined }. Writes nothing.
export function assembleMap(map, g, date = today()) {
  const cards = Array.isArray(map.cards) ? map.cards : [];
  const declined = new Set(cards.filter(c => c.declined).map(c => c.id));
  const before = Object.fromEntries((Array.isArray(map.worlds) ? map.worlds : []).map(w => [String(w.n), w]));
  const worlds = [];
  for (const w of WORLDS) {
    const missions = cards.filter(c => String(c.level) === String(w.n)).map(c => c.id);
    if (w.n === "reach" && !missions.length) continue;                           // the Reach exists only with its card
    const live = missions.filter(id => !declined.has(id)).length;                 // a declined mission leaves n (R29)
    // A clear the owner set by hand stays: one that is neither the default nor the default capped at the last count.
    const prev = before[String(w.n)];
    const lastAuto = prev ? Math.min(w.clear, (prev.missions || []).length) : null;
    const byHand = prev && Number.isInteger(prev.clear) && prev.clear !== w.clear && prev.clear !== lastAuto;
    worlds.push({ n: w.n, label: w.label, release: w.release, who: w.who, clear: byHand ? prev.clear : Math.min(w.clear, live), ...(w.optional ? { optional: true } : {}), missions });
  }

  // The deterministic parts first, then what the skill and the owner wrote, then anything else the file holds.
  const out = {
    version: 2, published: date, atlas_generated: (g.atlas || {}).generated || null,
    student: map.student,
    role_class: { id: g.role_class.id, label: g.role_class.label, field: g.role_class.field, roles: g.role_class.roles.map(r => ({ id: r.id, label: r.label, first: !!r.first })) },
    role: { id: g.role.id, label: g.role.label, postings_n: g.role.postings_n },
    company: map.company,
    posting: { ...(map.posting || {}), names: g.posting.names || [] },
    gap_sentence: map.gap_sentence,
    tree: g.tree, read: g.read,
    tracks: map.tracks,
    worlds, cards,
  };
  for (const [k, v] of Object.entries(map)) if (!(k in out) && k !== "levels") out[k] = v;   // `levels` was version 1
  return { map: out, declined };
}

// ---------- the script ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const slug = process.argv[2];
  const dir = studentDir(slug);
  const mapFile = path.join(dir, "map.json"), groundingFile = path.join(dir, "grounding.json");
  if (!fs.existsSync(groundingFile)) die(`${rel(groundingFile)} is missing. Run ground.mjs first.`);
  if (!fs.existsSync(mapFile)) die(`${rel(mapFile)} is missing. Write the cards first, then assemble.`);
  const g = readJson(groundingFile);
  let written;
  try { written = readJson(mapFile); } catch (e) { die(`${rel(mapFile)} is not valid JSON: ${e.message}`); }
  if (!g.tree || !g.read || !g.role_class) die(`${rel(groundingFile)} has no class tree. Run ground.mjs again.`);
  const { map: out, declined } = assembleMap(written, g);
  const { cards, worlds } = out;
  writeJson(mapFile, out);
  const say = w => w.n === "reach" ? `the Reach is optional (${w.missions.length})` : `World ${w.n} clears at ${w.clear} of ${w.missions.filter(id => !declined.has(id)).length}`;
  console.log(`wrote ${rel(mapFile)}: version 2, ${cards.length} cards, ${g.tree.nodes.length} tree nodes. ${worlds.map(say).join("; ")}.`);
}
