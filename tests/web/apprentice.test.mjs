// pipeline/apprentice/, the apprentice map generator: the intake reader, assemble's pure part (the owner's hand edits
// survive, the worlds' k of n) and the check on the tracked example (it passes, with its two notes) and on six broken
// copies of it, each of which must fail with exactly one line. No subprocess: check.mjs and assemble.mjs export
// their functions. The example is in the repository, so this runs everywhere; without the research roster the check
// reads the class codes from web/data/catalog/cornell_tech.json.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { root, web, require, Matcher, realAtlas } from "./_load.mjs";

const lib = await import(path.join(root, "pipeline/apprentice/_lib.mjs"));
const { checkMap } = await import(path.join(root, "pipeline/apprentice/check.mjs"));
const { assembleMap, storyCards, storyPrompt, STORY_MAX } = await import(path.join(root, "pipeline/apprentice/assemble.mjs"));
const Apprentice = require(path.join(web, "apprentice.js"));
const EvidenceText = require(path.join(web, "evidence_text.js"));

const EXAMPLE = path.join(root, "pipeline/apprentice/examples/pmm-nyc");
const example = () => JSON.parse(fs.readFileSync(path.join(EXAMPLE, "map.json"), "utf8"));

// ---------- the intake ----------
const INTAKE = [
  "# Intake", "", "```yaml", "slug: ab-1", "roles: pmm, marketing_manager   # the first is the map's role",
  "campus: \"Cornell Tech\"", "spring_courses: TECH 5240; NBAY 6090", "visa_deadline: none", "```", "",
  "## 2. The posting", "### Paste one real posting.", "We hire a writer.", "", "## 3. Background", "Ten years of sales.", "",
].join("\n");

test("readIntake: the yaml answers without comments or quotes, and the numbered sections with their titles", () => {
  const { answers, sections, titles } = lib.readIntake(INTAKE);
  assert.equal(answers.slug, "ab-1");
  assert.equal(answers.roles, "pmm, marketing_manager", "a trailing comment is not part of the answer");
  assert.equal(answers.campus, "Cornell Tech", "the quotes go");
  assert.equal(titles["2"], "The posting");
  assert.equal(lib.prose(sections["2"]), "We hire a writer.", "a question line is not an answer");
  assert.match(sections["3"], /Ten years of sales/);
  assert.deepEqual(lib.list(answers.spring_courses), ["TECH 5240", "NBAY 6090"], "a list splits on commas and semicolons");
  assert.deepEqual(lib.list(answers.visa_deadline), [], "none is an empty list");
});

test("roleIds: roles: in order, the first the map's role; a lone role: from an older intake is a class of one", () => {
  assert.deepEqual(lib.roleIds(lib.readIntake(INTAKE).answers), ["pmm", "marketing_manager"]);
  assert.deepEqual(lib.roleIds({ role: "brand_manager" }), ["brand_manager"]);
  assert.deepEqual(lib.roleIds({ roles: "", role: "pmm" }), ["pmm"], "an empty roles: falls back to role:");
  assert.deepEqual(lib.roleIds({}), []);
});

test("a slug resolves to data/apprentice/students/<slug>/ when it exists, else to the example", () => {
  assert.equal(lib.repoRoot, root, "the atlas root is this repository");
  assert.equal(lib.studentDir("pmm-nyc"), fs.existsSync(path.join(lib.studentsRoot, "pmm-nyc")) ? path.join(lib.studentsRoot, "pmm-nyc") : EXAMPLE);
  assert.equal(path.relative(root, lib.studentsRoot), path.join("data", "apprentice", "students"));
});

// ---------- assemble ----------
test("assembleMap keeps the owner's hand edits and a hand-set clear; a declined card leaves its world's n", () => {
  const written = example();
  const grounding = JSON.parse(fs.readFileSync(path.join(EXAMPLE, "grounding.json"), "utf8"));
  const l1 = written.cards.filter(c => c.level === 1);
  l1[0].shipped = "2026-11-03";
  l1[1].changed = "2026-11-03";
  l1[2].declined = true;
  l1[3].reply = { text: "Shorter now.", date: "2026-11-03" };
  written.worlds.find(w => w.n === 2).clear = 3;   // by hand: neither the default 2 nor the default capped at the count
  written.levels = [];                              // version 1's key goes
  const { map, stories } = assembleMap(written, grounding, "2026-11-04");
  const build = cs => cs.filter(c => c.kind !== "story");
  assert.deepEqual(build(map.cards), build(written.cards), "every build card, with its hand edits, as written");
  assert.equal(map.version, 2);
  assert.equal(map.published, "2026-11-04");
  assert.equal(map.levels, undefined);
  assert.deepEqual(map.tree, grounding.tree, "the tree comes from the grounding");
  const w = Object.fromEntries(map.worlds.map(x => [String(x.n), x]));
  assert.equal(w["1"].clear, 2, "the default");
  assert.equal(w["1"].missions.length, build(l1).length + stories, "a declined mission stays listed; the check takes it off n");
  assert.ok(!map.worlds.some(x => "release" in x), "the worlds carry no release label (2026-11-05)");
  assert.equal(w["2"].clear, 3, "the owner's clear stays");
  assert.equal(w.reach.clear, 0);
  const noReach = assembleMap({ ...written, cards: written.cards.filter(c => c.level !== "reach") }, grounding).map;
  assert.ok(!noReach.worlds.some(x => x.n === "reach"), "the Reach exists only with its card");
});

// ---------- the story cards ----------
test("storyCards: two at most, from work lines of half-shown skills on the tree, the posting's first; hand edits by id survive", () => {
  const written = example();
  const grounding = JSON.parse(fs.readFileSync(path.join(EXAMPLE, "grounding.json"), "utf8"));
  const cards = storyCards(written, grounding, []);
  assert.deepEqual(cards.map(c => c.id), ["s1-positioning_messaging", "s1-customer_facing_exec"], "the posting names both; the larger share first");
  assert.ok(cards.length <= STORY_MAX);
  for (const c of cards) {
    assert.equal(c.kind, "story"); assert.equal(c.level, 1);
    assert.ok(["must evidence better", "shows in other words"].includes(c.state));
    const row = grounding.person.read.find(r => r.id === c.skill);
    assert.equal(c.line, row.work_lines[0], "the line is the first work line the read found");
    assert.ok(c.prompt.includes(c.line) && c.prompt.includes("[ ]"), "the prompt quotes the line and leaves the numbers blank");
    assert.deepEqual(c.atlas_skills, [c.skill]);
    assert.equal(c.why_person.profile_quote, c.line);
    assert.ok(!/%/.test(c.why_role.text + c.why_person.text));
    assert.ok(written.tracks.some(t => t.id === c.track), "the track is one of the map's");
  }
  // the hand edits on a story card the owner kept survive a re-assemble; a story card no pick names goes
  const kept = storyCards(written, grounding, [{ ...cards[0], shipped: "2026-11-05", reply: { text: "Good.", date: "2026-11-05" } }, { id: "s1-stale", kind: "story", level: 1, declined: true }]);
  assert.equal(kept[0].shipped, "2026-11-05"); assert.deepEqual(kept[0].reply, { text: "Good.", date: "2026-11-05" });
  assert.ok(!kept.some(c => c.id === "s1-stale"));
  // the map's story cards sit first in World 1; a stale story card in the written map is replaced
  const { map } = assembleMap({ ...written, cards: [{ id: "s1-stale", kind: "story", level: 1 }, ...written.cards] }, grounding);
  assert.deepEqual(map.worlds[0].missions.slice(0, 2), ["s1-positioning_messaging", "s1-customer_facing_exec"]);
  assert.ok(!map.cards.some(c => c.id === "s1-stale"));
  // a grounding with no work line for a half-shown skill (a course list, a skills list) yields no card for it
  const g2 = JSON.parse(JSON.stringify(grounding));
  for (const r of g2.person.read) if (r.id === "positioning_messaging") r.work_lines = [];
  assert.ok(!storyCards(written, g2, []).some(c => c.skill === "positioning_messaging"));
});

test("storyPrompt names the slots it has and never a number", () => {
  const p = storyPrompt({ skill: "Product launches", role: "Product Marketing Manager", field: "Marketing", state: "must evidence better", line: "Helped launch things.", what: "Getting a product out.", reads_as: null, shown_by: { artefacts: ["launch plan"], verbs: ["launched", "shipped"], measures: [], counterparts: ["sales"] } });
  assert.match(p, /names the thing produced \(launch plan\)/);
  assert.match(p, /a verb like launched or shipped/);
  assert.match(p, /who it was with \(sales\)/);
  assert.ok(!/gives a measure/.test(p), "an empty slot is left out");
  assert.match(p, /"named, not shown"/);
  assert.ok(!/\d/.test(p.replace(/30 words|three/g, "")), "no number but the length rule");
});

// ---------- the pure grounding (web/apprentice.js), the same code ground.mjs runs ----------
test("ground: the class tree from the roles' core skills, the first role's read, the posting's names; a role of another field refused", async () => {
  const profile = fs.readFileSync(path.join(EXAMPLE, "profile.md"), "utf8"), posting = fs.readFileSync(path.join(EXAMPLE, "posting.md"), "utf8");
  const deps = { A: realAtlas(), Matcher, EvidenceText };
  const g = await Apprentice.ground(deps, { profile, roles: ["pmm", "marketing_manager"], posting, today: "2026-11-05" });
  assert.equal(g.generated, "2026-11-05");
  assert.equal(g.role.id, "pmm"); assert.equal(g.role_class.field, "marketing");
  assert.deepEqual(g.role_class.roles.map(r => [r.id, r.first]), [["pmm", true], ["marketing_manager", false]]);
  const core = r => new Set(g.role_class.roles.find(x => x.id === r).core.map(s => s.id));
  for (const n of g.tree.nodes) {
    const asks = ["pmm", "marketing_manager"].filter(r => core(r).has(n.id));
    assert.deepEqual(n.roles, asks, `${n.id} sits under the roles whose core asks for it`);
    assert.equal(n.place, asks.length === 2 ? "trunk" : "own");
    assert.ok(["shows", "shows in other words", "must evidence better", "must build"].includes(n.state));
  }
  assert.ok(g.tree.nodes.some(n => n.place === "trunk"), "two marketing roles share a trunk");
  assert.ok(g.tree.behaviours.length && g.tree.behaviours.every(n => !g.tree.nodes.some(x => x.id === n.id)), "behaviours leave the nodes");
  assert.ok(g.person.read.every(r => ["core", "common"].includes(r.tier)));
  assert.ok(g.read.brings.every(b => ["shows", "shows in other words"].includes(b.state)));
  assert.ok(g.posting.names.includes("positioning_messaging"), "the posting names positioning");
  assert.ok(g.tree.nodes.find(n => n.id === "positioning_messaging").posting_names);
  assert.ok(g.skills.every(s => s.shown_by && Array.isArray(s.shown_by.verbs)), "every skill carries its slots");
  assert.ok(g.tracks.length >= 4 && g.tracks.length <= 6);
  // no posting: nothing named, the tree the same
  const g0 = await Apprentice.ground(deps, { profile, roles: ["pmm", "marketing_manager"] });
  assert.deepEqual(g0.posting.names, []); assert.deepEqual(g0.tree.nodes.map(n => n.id), g.tree.nodes.map(n => n.id));
  // the faults, by code
  for (const [roles, code] of [[[], "no_roles"], [["pmm", "pmm"], "dup_role"], [["pmm", "a", "b", "c", "d"], "too_many_roles"], [["nope"], "unknown_role"], [["pmm", "bizops"], "mixed_fields"]]) {
    await assert.rejects(Apprentice.ground(deps, { profile, roles }), e => e.code === code, code);
  }
});

test("selfServeMap: the story cards alone, World 1 alone, no company, the grounding's tracks, marked self_serve; byHand tells it from the owner's", async () => {
  const profile = fs.readFileSync(path.join(EXAMPLE, "profile.md"), "utf8");
  const g = await Apprentice.ground({ A: realAtlas(), Matcher, EvidenceText }, { profile, roles: ["pmm"], today: "2026-11-05" });
  const { map, stories } = Apprentice.selfServeMap(g, { campus: "Cornell Tech", date: "2026-11-05" });
  assert.equal(map.version, 2); assert.equal(map.published, "2026-11-05");
  assert.deepEqual(map.student, { slug: null, name_on_page: null, campus: "Cornell Tech", program: null, self_serve: true });
  assert.equal(map.company, null); assert.equal(map.gap_sentence, null); assert.deepEqual(map.posting, { url: null, title: null, names: [] });
  assert.ok(stories >= 1 && map.cards.length === stories && map.cards.every(c => c.kind === "story" && c.level === 1));
  assert.deepEqual(map.worlds.map(w => w.n), [1], "a world with no mission is left out");
  assert.equal(map.worlds[0].clear, Math.min(2, stories));
  assert.deepEqual(map.tracks, g.tracks.map(t => ({ id: t.id, label: t.label, atlas_area: t.atlas_area })));
  assert.ok(map.cards.every(c => map.tracks.some(t => t.id === c.track)));
  assert.equal(Apprentice.byHand(map), false);
  assert.equal(Apprentice.byHand(example()), true, "the example has build cards");
  assert.equal(Apprentice.byHand(null), false);
});

// ---------- the check ----------
test("the example passes the check, with its two notes (data_driven sits off the class tree on two cards)", () => {
  const { fails, notes, summary } = checkMap("pmm-nyc", EXAMPLE);
  assert.deepEqual(fails, []);
  assert.match(summary, /^13 cards \(2 story, L1 6, L2 3, L3 1, Reach 1\)/, "the story cards count apart from the six build cards");
  assert.deepEqual(notes, [
    'card l1-behaviours: "data_driven" sits off the tree, outside "How you work" and outside "more"',
    'card l3-brief: "data_driven" sits off the tree, outside "How you work" and outside "more"',
  ]);
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apprentice-check-"));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const broken = (name, edit) => {
  const map = example();
  edit(map);
  const f = path.join(tmp, `${name}.json`);
  fs.writeFileSync(f, JSON.stringify(map));
  return checkMap("pmm-nyc", EXAMPLE, f).fails;
};
const card = (map, level) => map.cards.find(c => c.level === level);
const CASES = {
  "a fourth Level 2 card": [map => { const c = { ...card(map, 2), id: "l2-extra" }; map.cards.push(c); map.worlds.find(w => w.n === 2).missions.push(c.id); }, /^level 2: 4 cards; exactly three$/],
  "a quote not in posting.md": [map => { card(map, 2).why_role.posting_quote = "a sentence no posting ever held"; }, /why_role\.posting_quote is not in posting\.md/],
  "a 21-word why sentence": [map => { card(map, 1).why_person.text = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone."; }, /why_person has a sentence of 21 words; 20 at most/],
  "a percent sign": [map => { card(map, 3).why_company.text = "Most postings ask for it, 60% of them."; }, /why_company carries a percentage/],
  "a marked gap off the tree": [map => { map.read.marked_gaps = [...map.read.marked_gaps.slice(0, 7), map.tree.more[0].id]; }, /^read: marked gap ".+" is not a node on the tree$/],
  "a bad version": [map => { map.version = 1; }, /^map: version is 1; run assemble\.mjs/],
  "a story line not in profile.md": [map => { const c = map.cards.find(c => c.kind === "story"); c.line = "A line nobody wrote."; c.prompt = c.prompt + " A line nobody wrote."; c.why_person.profile_quote = c.line; }, /the story line is not in profile\.md/],
  "a story card in World 2": [map => { const c = map.cards.find(c => c.kind === "story"); c.level = 2; map.worlds[0].missions = map.worlds[0].missions.filter(id => id !== c.id); map.worlds[1].missions.unshift(c.id); }, /a story card sits in World 1/],
  "a third story card": [map => { const c = { ...map.cards.find(c => c.kind === "story"), id: "s1-third" }; map.cards.push(c); map.worlds[0].missions.push(c.id); }, /^level 1: 3 story cards; 2 at most$/],
};
for (const [name, [edit, line]] of Object.entries(CASES)) {
  test(`the check fails a broken copy with one line: ${name}`, () => {
    const fails = broken(name.replace(/\W+/g, "-"), edit);
    assert.equal(fails.length, 1, fails.join("\n"));
    assert.match(fails[0], line);
  });
}
