// The public catalog files the class picker reads (web/data/catalog/, written by pipeline.catalog_export and
// pipeline/catalog_tags.mjs): the rows hold no syllabus digest or research note, every reference resolves, the tags
// cover every code, and the tags were read with the taxonomy as it is now.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { require, web, readJson, realAtlas, atlasFactory, Matcher } from "./_load.mjs";

const PUBLIC = readJson("catalog/cornell_tech.json");
const TAGS = readJson("catalog/cornell_tech_tags.json");
const FULL = path.join(web, "data", "local", "catalog_full.json");
const sha256 = f => crypto.createHash("sha256").update(fs.readFileSync(path.join(web, "data", f))).digest("hex");
const codes = new Set(PUBLIC.classes.map(c => c.code));

test("the public file parses, holds the catalog, and never the syllabus digest or the research note", () => {
  assert.equal(PUBLIC.campus, "cornell_tech");
  assert.equal(PUBLIC.term, "SP27");
  assert.ok(PUBLIC.classes.length >= 100, `${PUBLIC.classes.length} classes`);
  assert.equal(codes.size, PUBLIC.classes.length, "codes are unique");
  for (const c of PUBLIC.classes) {
    assert.ok(!("roster_syllabus_md" in c), `${c.code} carries roster_syllabus_md`);
    assert.ok(!("research_note_md" in c), `${c.code} carries research_note_md`);
  }
  const text = fs.readFileSync(path.join(web, "data", "catalog", "cornell_tech.json"), "utf8");
  assert.ok(!text.includes("roster_syllabus_md") && !text.includes("research_note"), "a hidden column name is in the text");
});

test("every reference in the public file resolves", () => {
  for (const x of PUBLIC.crosslists) {
    assert.ok(codes.has(x.code), `crosslist from unknown class ${x.code}`);
    // a cross-listed code outside the dataset is allowed (the picker drops it); one inside must be a class
    if (codes.has(x.other_code)) assert.ok(PUBLIC.classes.some(c => c.code === x.other_code));
  }
  const slugs = new Set(PUBLIC.professors.map(p => p.slug));
  for (const i of PUBLIC.instructors) {
    assert.ok(codes.has(i.class_code), `instructor row for unknown class ${i.class_code}`);
    if (i.professor_slug !== null) assert.ok(slugs.has(i.professor_slug), `${i.class_code}: no professor ${i.professor_slug}`);
  }
  for (const s of PUBLIC.sections) assert.ok(codes.has(s.class_code), `section for unknown class ${s.class_code}`);
  const nbrs = new Set(PUBLIC.sections.map(s => s.class_nbr));
  for (const m of PUBLIC.meetings) assert.ok(nbrs.has(m.class_nbr), `meeting for unknown section ${m.class_nbr}`);
});

test("the tags file has one entry per class code and no other, in both readings", () => {
  for (const [name, T] of [["tags", TAGS.tags], ["tags_tech", TAGS.tags_tech]]) {
  const tagged = Object.keys(T || {});
  assert.deepEqual(tagged.sort(), [...codes].sort(), `${name}: one entry per class code`);
  for (const code of tagged) {
    const t = T[code];
    assert.ok(Array.isArray(t.found) && Array.isArray(t.teaches), `${code}: found and teaches are lists`);
    assert.deepEqual(t.found, [...t.found].sort(), `${code}: found is sorted`);
    for (const id of t.teaches) assert.ok(t.found.includes(id), `${code}: ${id} taught but not found`);
  }
  }
});

test("the tags were read with the taxonomy files as they are now", () => {
  const hint = "stale tags: rerun node pipeline/catalog_tags.mjs";
  assert.equal(TAGS.taxonomy_sha256, sha256("taxonomy_mba.json"), `taxonomy_mba.json changed; ${hint}`);
  assert.equal(TAGS.taxonomy_product_sha256, sha256("taxonomy.json"), `taxonomy.json changed; ${hint}`);
  assert.equal(TAGS.taxonomy_tech_sha256, sha256("taxonomy_tech.json"), `taxonomy_tech.json changed; ${hint}`);
});

test("the tags equal a live read of the local catalog under the same rule", async t => {
  if (!fs.existsSync(FULL)) { t.skip("web/data/local/catalog_full.json is not on this machine (pipeline.catalog_export writes it)"); return; }
  const full = JSON.parse(fs.readFileSync(FULL, "utf8"));
  const Catalog = require(path.join(web, "catalog.js"))({});
  const Atlas = realAtlas();
  const keep = (rd, set) => [...set].filter(id => rd.ev[id] && rd.ev[id].strength >= 1).sort();
  const step = Math.max(1, Math.floor(full.classes.length / 12));
  const sample = full.classes.filter((_, i) => i % step === 0).slice(0, 12);
  assert.equal(sample.length, 12);
  for (const cls of sample) {
    const rd = await Atlas.readCourse(Catalog.matcherText(cls));
    assert.deepEqual(TAGS.tags[cls.code], { found: keep(rd, rd.found), teaches: keep(rd, rd.teaches) }, `${cls.code}: tags differ from a live read`);
  }
  // the tech reading, with the tech index on as pipeline/catalog_tags.mjs reads it
  if (!fs.existsSync(path.join(web, "data", "graph_tech.json"))) return;
  const AT = atlasFactory({ load: url => JSON.parse(fs.readFileSync(path.join(web, url), "utf8")), Matcher, config: () => ({ TECH_ENABLED: true }) });
  for (const cls of sample) {
    const rt = await AT.readCourse(Catalog.matcherText(cls), { set: "tech" });
    assert.deepEqual(TAGS.tags_tech[cls.code], { found: keep(rt, rt.found), teaches: keep(rt, rt.teaches) }, `${cls.code}: tech tags differ from a live read`);
  }
});
