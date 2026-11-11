// Publishes the standards index for the site: web/data/standards.json holds the roles and what each must show, and
// nothing else (no sources, no addresses). The quest writer (web/api/quests.js) reads it as grounding.
//   node pipeline/standards_publish.mjs           # write web/data/standards.json
//   node pipeline/standards_publish.mjs --check   # exit 1 when the published file is behind pipeline/standards.json
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "pipeline/standards.json"), OUT = path.join(root, "web/data/standards.json");

export function publish(index) {
  const roles = {};
  for (const id of Object.keys(index.roles || {}).sort()) {
    const r = index.roles[id];
    roles[id] = {
      label: r.label, also_serves: r.also_serves || [], summary: r.summary || "",
      // `weak` (a thinly backed item) goes as a flag: the note itself may name a source
      shows: (r.shows || []).map(x => ({ id: x.id, label: x.label, stage: x.stage, means: x.means, artifacts: x.artifacts || [], skills: x.skills || [], ...(x.weak ? { weak: true } : {}) })),
    };
  }
  return { _doc: "Published by pipeline/standards_publish.mjs from pipeline/standards.json. Never edited by hand.", date_read: index.date_read, roles };
}
export const render = index => JSON.stringify(publish(index), null, 1) + "\n";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = render(JSON.parse(fs.readFileSync(SRC, "utf8")));
  if (process.argv.includes("--check")) {
    const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (have !== text) { console.error("web/data/standards.json is behind pipeline/standards.json: run node pipeline/standards_publish.mjs"); process.exit(1); }
    console.log("web/data/standards.json is current");
  } else { fs.writeFileSync(OUT, text); console.log(`wrote ${path.relative(root, OUT)} (${Object.keys(JSON.parse(text).roles).length} roles, ${text.length} bytes)`); }
}
