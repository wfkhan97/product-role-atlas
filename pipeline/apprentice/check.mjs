// node pipeline/apprentice/check.mjs <slug> [map file]  ->  validates the student's map.json; one line per failure,
// exit 1 on any. It reads the folder's posting.md, profile.md, intake.md and research/, the atlas's taxonomy and the
// roster's codes. The optional second argument checks another map file against the same folder; it exists for the
// check's own tests (a broken copy of the example), never for a real map. Importable: checkMap() returns the lines
// and prints nothing (tests/web/apprentice.test.mjs). Nothing here calls a model.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { studentDir, read, readIntake, norm, readJson, rosterTitles, atlasWeb, rel, die } from "./_lib.mjs";

// The check of one map file against one student folder: { fails, notes } as the lines the script prints, without
// their "FAIL " and "note " prefixes. A file that is missing or not JSON is one failure.
export function checkMap(slug, dir, mapFile = path.join(dir, "map.json")) {
  const fails = [], notes = [];
  const fail = (where, what) => fails.push(`${where}: ${what}`);
  const note = (where, what) => notes.push(`${where}: ${what}`);
  if (!fs.existsSync(mapFile)) { fail("map", `${rel(mapFile)} is missing`); return { fails, notes }; }
  let map;
  try { map = readJson(mapFile); } catch (e) { fail("map", `${rel(mapFile)}: not valid JSON (${e.message})`); return { fails, notes }; }
  const posting = norm(read(path.join(dir, "posting.md"))), profile = norm(read(path.join(dir, "profile.md")));
  const intake = readIntake(read(path.join(dir, "intake.md")) || "");

  // the taxonomy of the role set: the MBA set unless the role is a product family
  const mba = readJson(path.join(atlasWeb, "data/graph_mba.json"));
  const isMba = !!(map.role && mba.roles[map.role.id]);
  const tax = readJson(path.join(atlasWeb, isMba ? "data/taxonomy_mba.json" : "data/taxonomy.json"));
  const skillIds = new Set(tax.skills.map(s => s.id));
  const setName = isMba ? "MBA" : "product";
  const rosterCodes = new Set(Object.keys(rosterTitles()));
  const noRoster = /\bIE\b/i.test((map.student || {}).campus || "");

  // "How to write" for the three why lines: sentences of at most 20 words (split on . ? ! the way the atlas's copy
  // check splits them; URLs out first) and never a percentage. The quotes and the ship text are exempt.
  const MAX_WORDS = 20;
  const sentences = s => String(s || "").replace(/https?:\/\/\S+/g, " ").split(/(?<=[.?!])\s+|[.?!]+(?=\s|$)/).map(x => x.trim()).filter(Boolean);
  const wordCount = s => s.split(/\s+/).filter(w => w && !/^[·—–→↗↑↓←×•|]+$/.test(w)).length;

  // ---------- the top ----------
  for (const k of ["student", "role", "role_class", "company", "posting", "gap_sentence", "tracks", "tree", "read", "worlds", "cards"]) if (map[k] == null) fail("map", `missing "${k}"`);
  if (map.version !== 2) fail("map", `version is ${JSON.stringify(map.version)}; run assemble.mjs to write version 2`);
  if (map.levels) fail("map", `"levels" belongs to version 1; the worlds replace it`);
  for (const k of ["slug", "name_on_page", "campus", "program"]) if (!(map.student || {})[k]) fail("student", `missing "${k}"`);
  if (map.student && map.student.slug && map.student.slug !== slug) fail("student", `slug "${map.student.slug}" is not "${slug}"`);
  if (map.role && !isMba && !(tax.skills.length)) fail("role", `"${map.role.id}" is in neither role set`);
  if (map.role && !isMba && !/^product\./.test(map.role.id) && !mba.roles[map.role.id]) fail("role", `"${map.role.id}" is not an atlas role id`);
  const classRoles = ((map.role_class || {}).roles) || [];
  if (map.role_class && (!classRoles.length || !classRoles[0].first || (map.role && classRoles[0].id !== map.role.id))) fail("role_class", "the first role of the class must be the map's role");
  if (map.company && !map.company.name) fail("company", "missing name");
  if (map.posting && !map.posting.url) fail("posting", "missing url");
  if (!map.gap_sentence || map.gap_sentence.split(/\s+/).length < 6) fail("gap_sentence", "missing or too short to be an argument");
  const tracks = Array.isArray(map.tracks) ? map.tracks : [];
  if (tracks.length < 4 || tracks.length > 6) fail("tracks", `${tracks.length} tracks; four to six`);
  const trackIds = new Set();
  for (const t of tracks) { if (!t.id || !t.label || !t.atlas_area) fail("tracks", `a track is missing id, label or atlas_area`); if (trackIds.has(t.id)) fail("tracks", `duplicate track "${t.id}"`); trackIds.add(t.id); }

  // ---------- the tree and the read: every id in the role set's taxonomy ----------
  const tree = map.tree || {}, readOut = map.read || {};
  const known = (where, id) => { if (!skillIds.has(id)) fail(where, `"${id}" is not in the ${setName} taxonomy`); };
  if (map.tree) for (const k of ["nodes", "behaviours", "more"]) if (!Array.isArray(tree[k])) fail("tree", `missing "${k}"`);
  const nodes = tree.nodes || [], behaviours = tree.behaviours || [], more = tree.more || [];
  if (map.tree && !nodes.length) fail("tree", "no nodes");
  for (const n of nodes) { known("tree", n.id); if (!["trunk", "shared", "own"].includes(n.place)) fail("tree", `node "${n.id}" has place "${n.place}"; trunk, shared or own`); }
  for (const n of [...nodes, ...behaviours, ...more]) if (!["shows", "shows in other words", "must evidence better", "must build"].includes(n.state)) fail("tree", `"${n.id}" has the state "${n.state}"`);
  for (const n of [...behaviours, ...more]) known("tree", n.id);
  const onTree = new Set(nodes.map(n => n.id)), offTree = new Set([...behaviours, ...more].map(n => n.id));
  if (map.read) {
    if (!readOut.band_label) fail("read", "missing band_label");
    if (!Array.isArray(readOut.brings)) fail("read", "missing brings"); else for (const b of readOut.brings) known("read", b.id);
    const gaps = Array.isArray(readOut.marked_gaps) ? readOut.marked_gaps : [];
    if (!Array.isArray(readOut.marked_gaps)) fail("read", "missing marked_gaps");
    if (gaps.length > 8) fail("read", `${gaps.length} marked gaps; eight at most`);
    for (const id of gaps) { known("read", id); if (!onTree.has(id)) fail("read", `marked gap "${id}" is not a node on the tree`); }
  }
  for (const id of ((map.posting || {}).names) || []) known("posting", id);

  // ---------- the name on the page is not a name in the intake's background section ----------
  const name = ((map.student || {}).name_on_page || "").trim();
  const background = intake.sections["3"] || "";
  if (name) {
    const first = name.split(/\s+/)[0];
    const inText = (needle, text) => new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(text);
    if (inText(name, background)) fail("student", `name_on_page "${name}" appears in intake.md section 3 (background)`);
    else if (first.length > 2 && inText(first, background)) fail("student", `the first name of name_on_page, "${first}", appears in intake.md section 3 (background)`);
  }

  // ---------- the cards: levels 1, 2, 3 and the Reach (R15 to R19) ----------
  const cards = Array.isArray(map.cards) ? map.cards : [];
  const ids = new Set();
  const perLevel = { 1: [], 2: [], 3: [], reach: [] };
  for (const c of cards) {
    const w = `card ${c.id || "(no id)"}`;
    if (!c.id) fail(w, "missing id"); else if (ids.has(c.id)) fail(w, "duplicate id"); else ids.add(c.id);
    if (![1, 2, 3, "reach"].includes(c.level)) fail(w, `level ${JSON.stringify(c.level)} is not 1, 2, 3 or "reach"`); else perLevel[c.level].push(c);
    if (!trackIds.has(c.track)) fail(w, `track "${c.track}" is not in tracks`);
    for (const k of ["title", "ship", "window"]) if (!c[k]) fail(w, `missing "${k}"`);
    if (!(Number(c.hours) > 0)) fail(w, "hours must be a number above zero");
    // the three relevance lines, each pointing at its evidence
    if (!c.why_role || !c.why_role.text) fail(w, "missing why_role.text");
    if (!c.why_role || !c.why_role.posting_quote) fail(w, "missing why_role.posting_quote");
    else if (!posting.includes(norm(c.why_role.posting_quote))) fail(w, `why_role.posting_quote is not in posting.md: "${c.why_role.posting_quote.slice(0, 60)}"`);
    if (!c.why_company || !c.why_company.text) fail(w, "missing why_company.text");
    if (!c.why_company || !c.why_company.research_file) fail(w, "missing why_company.research_file");
    else if (!fs.existsSync(path.join(dir, "research", c.why_company.research_file))) fail(w, `why_company.research_file "${c.why_company.research_file}" is not in research/`);
    if (!c.why_company || !c.why_company.url) fail(w, "missing why_company.url");
    if (!c.why_person || !c.why_person.text) fail(w, "missing why_person.text");
    if (!c.why_person || !c.why_person.profile_quote) fail(w, "missing why_person.profile_quote");
    else if (!profile.includes(norm(c.why_person.profile_quote))) fail(w, `why_person.profile_quote is not in profile.md: "${c.why_person.profile_quote.slice(0, 60)}"`);
    // the write rule for the three why lines
    for (const k of ["why_role", "why_company", "why_person"]) {
      const text = (c[k] || {}).text || "";
      for (const s of sentences(text)) { const n = wordCount(s); if (n > MAX_WORDS) fail(w, `${k} has a sentence of ${n} words; ${MAX_WORDS} at most: "${s.slice(0, 50)}…"`); }
      if (/%|\bper ?cent\b/i.test(text)) fail(w, `${k} carries a percentage; say it in words`);
    }
    // the atlas skills and the classes
    if (!Array.isArray(c.atlas_skills) || !c.atlas_skills.length) fail(w, "atlas_skills is empty");
    else for (const id of c.atlas_skills) {
      if (!skillIds.has(id)) fail(w, `atlas skill "${id}" is not in the ${setName} taxonomy`);
      else if (map.tree && !onTree.has(id) && !offTree.has(id)) note(w, `"${id}" sits off the tree, outside "How you work" and outside "more"`);
    }
    for (const code of c.classes || []) { if (noRoster) fail(w, `class "${code}" listed, but ${map.student.campus} has no roster loaded`); else if (!rosterCodes.has(code)) fail(w, `class "${code}" is not in the roster`); }
    if ((c.level === 3 || c.level === "reach") && !c.users) fail(w, "a Level 3 or Reach card names its users");
    if (!Array.isArray(c.sources) || !c.sources.length) fail(w, "no source");
    else for (const s of c.sources) { if (!s.url || !s.title) fail(w, "a source needs title and url"); if (!s.read) fail(w, `source "${s.title || s.url}" has no read date`); }
  }
  // R15: a track whose core skills all show gets no Level 1 card; a note, never a failure
  for (const t of tracks) if (!perLevel[1].some(c => c.track === t.id)) note(`track "${t.id}"`, "no Level 1 card (its core skills show, or the owner left it out)");
  if (perLevel[1].length < 1 || perLevel[1].length > 6) fail("level 1", `${perLevel[1].length} cards; one to six`);
  if (perLevel[2].length !== 3) fail("level 2", `${perLevel[2].length} cards; exactly three`);
  if (perLevel[3].length !== 1) fail("level 3", `${perLevel[3].length} cards; exactly one`);
  if (perLevel.reach.length > 1) fail("reach", `${perLevel.reach.length} cards; one at most`);

  // ---------- the worlds: one per level in order, the Reach only with its card, k of n with k at most n ----------
  const worlds = Array.isArray(map.worlds) ? map.worlds : [];
  const expect = ["1", "2", "3", ...(perLevel.reach.length ? ["reach"] : [])];
  if (map.worlds && worlds.map(x => String(x.n)).join(",") !== expect.join(",")) fail("worlds", `the worlds read ${worlds.map(x => x.n).join(", ") || "none"}; the map needs ${expect.join(", ")}. Run assemble.mjs.`);
  const byId = Object.fromEntries(cards.map(c => [c.id, c]));
  for (const x of worlds) {
    const w = `world ${x.n}`;
    const missions = Array.isArray(x.missions) ? x.missions : [];
    for (const id of missions) { if (!byId[id]) fail(w, `mission "${id}" is not a card`); else if (String(byId[id].level) !== String(x.n)) fail(w, `mission "${id}" is a level ${byId[id].level} card`); }
    for (const c of perLevel[x.n] || []) if (!missions.includes(c.id)) fail(w, `card "${c.id}" is missing from its world. Run assemble.mjs.`);
    const n = missions.filter(id => byId[id] && !byId[id].declined).length;
    if (!Number.isInteger(x.clear) || x.clear < 0) fail(w, "clear must be a whole number, zero or more");
    else if (x.clear > n) fail(w, `clear is ${x.clear}, above its ${n} mission${n === 1 ? "" : "s"}`);
    if (!x.label || !x.release) fail(w, "missing label or release");
  }

  const cards_ = Array.isArray(map.cards) ? map.cards : [];
  const count = lv => cards_.filter(c => String(c.level) === lv).length;
  const summary = `${cards_.length} cards (L1 ${count("1")}, L2 ${count("2")}, L3 ${count("3")}, Reach ${count("reach")}), ${((map.tree || {}).nodes || []).length} tree nodes`;
  return { fails, notes, summary };
}

// ---------- the script ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const slug = process.argv[2];
  const dir = studentDir(slug);
  const mapFile = process.argv[3] ? path.resolve(process.argv[3]) : path.join(dir, "map.json");
  const { fails, notes, summary } = checkMap(slug, dir, mapFile);
  for (const n of notes) console.log("note " + n);
  if (fails.length) { for (const f of fails) console.log("FAIL " + f); console.log(`${fails.length} failure${fails.length === 1 ? "" : "s"} in ${rel(mapFile)}`); process.exit(1); }
  console.log(`ok ${rel(mapFile)}: ${summary}. Every quote, skill and class checks out.`);
}
