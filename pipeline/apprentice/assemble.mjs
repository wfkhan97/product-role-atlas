// node pipeline/apprentice/assemble.mjs <slug>  ->  the student's map.json as version 2. Run it after the skill writes
// the cards and before check.mjs. It reads grounding.json and copies the deterministic parts: the role class, the
// first role, the posting's names, the class tree and the read. It writes the story cards (below) and the worlds.
// Every part the skill or the owner wrote stays as it is: student, company, the posting's url and title,
// gap_sentence, tracks, and the cards with any shipped, changed, declined or reply. A world's clear the owner set by
// hand stays too. Importable: assembleMap() and storyCards() are the pure parts (tests/web/apprentice.test.mjs).
// Nothing here calls a model.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { studentDir, readJson, writeJson, today, rel, die } from "./_lib.mjs";

// The worlds are the levels in order (R27); a world clears after k of its n missions (R28). These are the defaults;
// the owner may set another clear per world by hand, and the check refuses one above the count. World 1 opens with
// the story cards, which walk the person through one line of their own; the build cards follow (2026-11-05).
export const WORLDS = [
  { n: 1, label: "Fundamentals", who: "Guided first: two lines of your own, then a page each. A few hours apiece.", clear: 2 },
  { n: 2, label: "Three demos in a day", who: "You build with help beside you. One day each.", clear: 2 },
  { n: 3, label: "One project, real users", who: "You build on your own, for real users. Four to eight weeks.", clear: 1 },
  { n: "reach", label: "Reach", who: "A product-sized project with no deadline. It never blocks a world.", clear: 0, optional: true },
];

// ---------- the story cards (World 1, written here, never by the skill) ----------
// A story card takes one skill the résumé half shows (must evidence better: named, not shown; shows in other words:
// shown in another field's words) and asks for one line, rewritten so the atlas reads the skill as shown. The card
// carries the line as it stands, what the skill means in this field, the slots a line that shows it fills (the
// artefacts, verbs, measures and counterparts of pipeline/evidence.json) and a prompt the person can paste into any
// model to practise the rewrite. The atlas reads the new line live, in the browser, with the same matcher that read
// the résumé. Two at most: the posting's skills first, then the skills most postings ask for. Nothing is invented: every
// word comes from the grounding, and the prompt tells the model to leave a blank where a number goes. The line is a line
// of work (ground.mjs, work_lines): a course list or a skills list is never the line to rewrite.
export const STORY_STATES = ["must evidence better", "shows in other words"];
export const STORY_MAX = 2;
const STATE_WORDS = { "must evidence better": "named, not shown", "shows in other words": "shown in another field's words" };
const list = (xs, n = 3) => (xs || []).slice(0, n);
// a skill's name mid-sentence: "positioning & messaging", but "AI / machine learning" keeps its acronym
const lower = n => /^[A-Z]{2,}/.test(n) ? n : n[0].toLowerCase() + n.slice(1);
const words = xs => { const l = list(xs); return l.length <= 1 ? l.join("") : l.slice(0, -1).join(", ") + " or " + l[l.length - 1]; };
// "nearly every posting", "about 2 in 3 postings", ... (the fit page's words), never a percentage
const shareWords = v => v >= 0.9 ? "Nearly every posting for {role} asks" : v >= 0.6 ? "About two in three postings for {role} ask" : v >= 0.45 ? "About half of the postings for {role} ask" : v >= 0.3 ? "About one in three postings for {role} ask" : v >= 0.22 ? "About one in four postings for {role} ask" : "Many postings for {role} ask";

export function storyPrompt({ skill, role, field, state, line, what, reads_as, shown_by }) {
  const h = shown_by || {};
  const p = [];
  p.push(`I am rewriting one line of my résumé for a ${role} role. The skill the line should show is "${skill}": ${what || "see below"}`);
  if (reads_as) p.push(`In ${field}, it means: ${reads_as}`);
  p.push(`The line today reads: "${line}". An automatic reader marks it "${STATE_WORDS[state] || state}".`);
  const slots = [];
  if (h.artefacts && h.artefacts.length) slots.push(`names the thing produced (${words(h.artefacts)})`);
  if (h.verbs && h.verbs.length) slots.push(`starts with a verb like ${words(h.verbs)}`);
  if (h.counterparts && h.counterparts.length) slots.push(`says who it was with (${words(h.counterparts)})`);
  if (h.measures && h.measures.length) slots.push(`gives a measure (${words(h.measures)})`);
  if (slots.length) p.push(`A line that shows it ${slots.join("; ")}.`);
  p.push(`Ask me three questions about what I actually did, one at a time. Then draft three versions of the line, each under 30 words, in the past tense. Never invent a number or a name: write [ ] where I must fill one in.`);
  return p.join("\n");
}

export function storyCards(map, g, written = []) {
  const read = Array.isArray((g.person || {}).read) ? g.person.read : [];
  const nodes = Array.isArray((g.tree || {}).nodes) ? g.tree.nodes : [];
  const nodeOf = Object.fromEntries(nodes.map(n => [n.id, n]));
  const skillOf = Object.fromEntries((g.skills || []).map(s => [s.id, s]));
  const tracks = Array.isArray(map.tracks) ? map.tracks : [];
  const first = (g.role || {}).id;
  const kept = Object.fromEntries(written.filter(c => c && c.kind === "story").map(c => [c.id, c]));
  const picks = read
    .filter(r => STORY_STATES.includes(r.state) && nodeOf[r.id] && (r.work_lines || [])[0])
    .sort((a, b) => (nodeOf[b.id].posting_names ? 1 : 0) - (nodeOf[a.id].posting_names ? 1 : 0) || (b.share || 0) - (a.share || 0) || a.id.localeCompare(b.id))
    .slice(0, STORY_MAX);
  return picks.map(r => {
    const node = nodeOf[r.id], sk = skillOf[r.id] || {}, line = r.work_lines[0];
    const track = tracks.find(t => t.atlas_area === node.area) || tracks[0] || {};
    const name = node.name || r.label || r.id;
    const shown_by = sk.shown_by || { artefacts: [], verbs: [], measures: [], counterparts: [] };
    const prev = kept[`s1-${r.id}`] || {};
    const card = {
      id: `s1-${r.id}`, kind: "story", level: 1, track: track.id || null,
      title: `${name}, said so it shows`,
      ship: `One line of your résumé, rewritten so the atlas reads ${lower(name)} as shown. Paste it on the card: the read runs in your browser, with the reader that read your résumé.`,
      hours: 1, window: "one sitting",
      skill: r.id, state: r.state, line,
      what: sk.what || null, reads_as: sk.reads_as || null, shown_by,
      prompt: storyPrompt({ skill: name, role: (g.role || {}).label || first, field: (g.role_class || {}).label ? (g.role_class.label.replace(/ roles$/, "")) : (g.role || {}).field, state: r.state, line, what: sk.what, reads_as: sk.reads_as, shown_by }),
      why_role: { text: `${shareWords(r.share || 0).replace("{role}", (g.role || {}).label || "this role")} for ${lower(name)}.${node.posting_names ? " This posting names it." : ""}`, posting_quote: null },
      why_person: { text: r.state === "shows in other words" ? "Your line shows it in another field's words. Said in this field's words, it shows." : "Your line names the work but not what you produced or what changed. One line can.", profile_quote: line },
      atlas_skills: [r.id], classes: [],
      sources: [{ title: `${name} in the job atlas, ${(g.role || {}).label || ""}`.trim(), url: `#/role/${first}`, read: (g.atlas || {}).generated || (g.generated || null) }],
    };
    for (const k of ["shipped", "changed", "declined", "reply"]) if (prev[k] != null) card[k] = prev[k];
    return card;
  });
}

// The map as version 2 from the map as written and the grounding: { map, declined }. Writes nothing.
export function assembleMap(map, g, date = today()) {
  const written = Array.isArray(map.cards) ? map.cards : [];
  const stories = storyCards(map, g, written);
  const cards = [...stories, ...written.filter(c => !(c && c.kind === "story"))];
  const declined = new Set(cards.filter(c => c.declined).map(c => c.id));
  const before = Object.fromEntries((Array.isArray(map.worlds) ? map.worlds : []).map(w => [String(w.n), w]));
  const worlds = [];
  for (const w of WORLDS) {
    const missions = cards.filter(c => String(c.level) === String(w.n)).map(c => c.id);   // the story cards first in World 1
    if (w.n === "reach" && !missions.length) continue;                           // the Reach exists only with its card
    const live = missions.filter(id => !declined.has(id)).length;                 // a declined mission leaves n (R29)
    // A clear the owner set by hand stays: one that is neither the default nor the default capped at the last count.
    const prev = before[String(w.n)];
    const lastAuto = prev ? Math.min(w.clear, (prev.missions || []).length) : null;
    const byHand = prev && Number.isInteger(prev.clear) && prev.clear !== w.clear && prev.clear !== lastAuto;
    worlds.push({ n: w.n, label: w.label, who: w.who, clear: byHand ? prev.clear : Math.min(w.clear, live), ...(w.optional ? { optional: true } : {}), missions });
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
  return { map: out, declined, stories: stories.length };
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
  if (!(g.skills || []).some(s => s.shown_by)) die(`${rel(groundingFile)} predates the story cards (no shown_by). Run ground.mjs again.`);
  const { map: out, declined, stories } = assembleMap(written, g);
  const { cards, worlds } = out;
  writeJson(mapFile, out);
  const say = w => w.n === "reach" ? `the Reach is optional (${w.missions.length})` : `World ${w.n} clears at ${w.clear} of ${w.missions.filter(id => !declined.has(id)).length}`;
  console.log(`wrote ${rel(mapFile)}: version 2, ${cards.length} cards (${stories} story), ${g.tree.nodes.length} tree nodes. ${worlds.map(say).join("; ")}.`);
}
