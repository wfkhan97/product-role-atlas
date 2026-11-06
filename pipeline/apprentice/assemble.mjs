// node pipeline/apprentice/assemble.mjs <slug>  ->  the student's map.json as version 2. Run it after the skill writes
// the cards and before check.mjs. It reads grounding.json and copies the deterministic parts: the role class, the
// first role, the posting's names, the class tree and the read. It writes the story cards (below) and the worlds.
// Every part the skill or the owner wrote stays as it is: student, company, the posting's url and title,
// gap_sentence, tracks, and the cards with any shipped, changed, declined or reply. A world's clear the owner set by
// hand stays too. Importable: assembleMap() and storyCards() are the pure parts (tests/web/apprentice.test.mjs),
// which live in web/apprentice.js. Nothing here calls a model.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { studentDir, readJson, writeJson, apprentice, rel, die } from "./_lib.mjs";

// The pure parts live in web/apprentice.js (the site's function runs the same code): re-exported here for the
// tests and the owner's scripts.
const Apprentice = apprentice();
export const { WORLDS, STORY_STATES, STORY_MAX, storyPrompt, storyCards, assembleMap, selfServeMap } = Apprentice;

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
  if (!(g.skills || []).some(s => s.shown_by)) die(`${rel(groundingFile)} predates the story cards (no shown_by). Run ground.mjs again.`);
  const { map: out, declined, stories } = assembleMap(written, g);
  const { cards, worlds } = out;
  writeJson(mapFile, out);
  const say = w => w.n === "reach" ? `the Reach is optional (${w.missions.length})` : `World ${w.n} clears at ${w.clear} of ${w.missions.filter(id => !declined.has(id)).length}`;
  console.log(`wrote ${rel(mapFile)}: version 2, ${cards.length} cards (${stories} story), ${g.tree.nodes.length} tree nodes. ${worlds.map(say).join("; ")}.`);
}
