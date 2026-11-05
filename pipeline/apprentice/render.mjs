// node pipeline/apprentice/render.mjs <slug>  ->  map.html in the student's folder, one page from template.html.
// It reads map.json, the atlas's skill names (web/data/graph_mba.json, graph.json) and the roster's class titles.
// Ids become names at render time, so map.json stays ids. The page is the owner's check view: the worlds as columns
// with their k of n, the tracks down, and the class tree as a plain list. The atlas draws the student's own page.
import fs from "fs";
import path from "path";
import { here, studentDir, readJson, rosterTitles, atlasWeb, today, rel, die } from "./_lib.mjs";

const slug = process.argv[2];
const dir = studentDir(slug);
const mapFile = path.join(dir, "map.json");
if (!fs.existsSync(mapFile)) die(`${rel(mapFile)} is missing`);
const map = readJson(mapFile);
if (map.version !== 2 || !Array.isArray(map.worlds)) die(`${rel(mapFile)} is not version 2. Run assemble.mjs, then check.mjs.`);

const labels = {};
for (const f of ["data/graph_mba.json", "data/graph.json"]) { const p = path.join(atlasWeb, f); if (fs.existsSync(p)) for (const s of readJson(p).skills || []) labels[s.id] ||= s.name; }
const titles = rosterTitles();
const grounding = fs.existsSync(path.join(dir, "grounding.json")) ? readJson(path.join(dir, "grounding.json")) : {};
const data = { ...map, skill_labels: labels, class_titles: titles, rendered: today(), atlas_generated: map.atlas_generated || (grounding.atlas || {}).generated || null };

const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const json = JSON.stringify(data).replace(/<\//g, "<\\/").replace(/<!--/g, "<\\!--");
const html = fs.readFileSync(path.join(here, "template.html"), "utf8")
  .replace("__TITLE__", esc(`${map.student.name_on_page} · ${map.role.label} at ${map.company.name}`))
  .replace("__MAP_JSON__", () => json);
fs.writeFileSync(path.join(dir, "map.html"), html);
console.log(`wrote ${rel(path.join(dir, "map.html"))} (${(html.length / 1024).toFixed(0)} KB, ${map.cards.length} cards in ${map.worlds.length} worlds, ${(map.tree || {}).nodes ? map.tree.nodes.length : 0} tree nodes)`);
