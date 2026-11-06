// The skill tags of every Spring 2027 class, read once here so the picker never reads the syllabus digest in the
// browser (PLAN.md v19, step B3). For every class code, Atlas.readCourse runs over Catalog.matcherText (description,
// outcomes, roster_syllabus_md) from web/data/local/catalog_full.json, and a skill stays only when the text names it
// (ev[id].strength >= 1): a sub-skill hint alone does not count. Each class is read twice: with the MBA taxonomy
// (`tags`, every role the picker has had) and with the tech set's (`tags_tech`, its own skills and wordings; the picker
// joins the two when a tech role is chosen). Writes web/data/catalog/cornell_tech_tags.json with the hashes of the three
// taxonomy files, so tests/web/catalog_files.test.mjs can tell a stale file from a fresh one.
//
//   node pipeline/catalog_tags.mjs        # after pipeline.catalog_export, and after any taxonomy change
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FULL = path.join(ROOT, "web", "data", "local", "catalog_full.json");
const OUT = path.join(ROOT, "web", "data", "catalog", "cornell_tech_tags.json");
const RULE = "A skill is tagged when the class text names it (strength >= 1); a sub-skill hint alone does not count.";
const sha256 = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

if (!fs.existsSync(FULL)) {
  console.error(`no ${path.relative(ROOT, FULL)}: run .venv/bin/python -m pipeline.catalog_export first (it needs the research folder)`);
  process.exit(1);
}
const t0 = Date.now();
const { atlasFactory, Matcher, require } = await import(path.join(ROOT, "tests", "web", "_load.mjs"));
const Catalog = require(path.join(ROOT, "web", "catalog.js"))({});
// the tech index on, so the tech reader exists (the switch hides the set from visitors, not from this reading)
const Atlas = atlasFactory({ load: url => JSON.parse(fs.readFileSync(path.join(ROOT, "web", url), "utf8")), Matcher, config: () => ({ TECH_ENABLED: true }) });
const full = JSON.parse(fs.readFileSync(FULL, "utf8"));

// the rule, applied to one read: the ids of `set` the evidence supports with strength >= 1
const keep = (rd, set) => [...set].filter(id => rd.ev[id] && rd.ev[id].strength >= 1).sort();
const tags = {}, tagsTech = {}; let dropped = 0;
for (const cls of full.classes) {
  const text = Catalog.matcherText(cls);
  const rd = await Atlas.readCourse(text), rt = await Atlas.readCourse(text, { set: "tech" });
  const found = keep(rd, rd.found);
  dropped += rd.found.size - found.length;
  tags[cls.code] = { found, teaches: keep(rd, rd.teaches) };
  tagsTech[cls.code] = { found: keep(rt, rt.found), teaches: keep(rt, rt.teaches) };
}
if (!Object.values(tagsTech).some(t => t.found.length)) { console.error("the tech reading found nothing: is web/data/graph_tech.json here?"); process.exit(1); }
const out = {
  _note: "Skill tags per class code for the picker (pipeline/catalog_tags.mjs over the local catalog with the syllabus digest). Rerun after a taxonomy change.",
  campus: full.campus, term: full.term, generated: new Date().toISOString().slice(0, 10), rule: RULE,
  taxonomy_sha256: sha256(path.join(ROOT, "web", "data", "taxonomy_mba.json")),
  taxonomy_product_sha256: sha256(path.join(ROOT, "web", "data", "taxonomy.json")),
  taxonomy_tech_sha256: sha256(path.join(ROOT, "web", "data", "taxonomy_tech.json")),
  tags: Object.fromEntries(Object.keys(tags).sort().map(k => [k, tags[k]])),
  tags_tech: Object.fromEntries(Object.keys(tagsTech).sort().map(k => [k, tagsTech[k]])),
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
const sizes = Object.values(tags).map(t => t.found.length).sort((a, b) => a - b);
const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
console.log(`wrote ${path.relative(ROOT, OUT)}: ${sizes.length} codes, median found ${median}, ${dropped} hint-only hits dropped, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
