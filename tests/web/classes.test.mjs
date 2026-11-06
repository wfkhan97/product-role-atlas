// web/catalog.js: the pure functions behind the Spring 2027 class cards, on synthetic rows (invented codes; no real
// catalog row lives in this repo). The thresholds and the eligibility words come from web/data/sp27_campus.json.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web, readJson } from "./_load.mjs";

const C = require(path.join(web, "catalog.js"))({});
const FILE = readJson("sp27_campus.json"), campus = FILE.campuses[0];

const cls = (code, extra = {}) => ({ code, subject: code.split(" ")[0], catalog_nbr: code.split(" ")[1], title: "Title of " + code, credits: "3", location_scope: "cornell_tech", eligibility_category: "cornell_tech_students", description: "Budgeting and forecasting for managers.", roster_syllabus_read: null, sp27_instructor_matches_syllabus: null, grading_summary: null, roster_syllabus_md: null, ...extra });
const DATA = {
  classes: [cls("TEST 1010"), cls("TEST 2020", { eligibility_category: "msba_nyc" }), cls("TEST 1020", { eligibility_category: "no_enrollment_restriction_listed" }), cls("TEST 3030", { eligibility_category: null, location_scope: "other_nyc" }), cls("ZZZ 9000", { eligibility_category: "cornell_tech_phd" })],
  // 2020 and 1020 are one class under two codes; 1010 is also listed under a code outside the dataset
  crosslists: [{ code: "TEST 2020", other_code: "TEST 1020" }, { code: "TEST 1020", other_code: "TEST 2020" }, { code: "TEST 1010", other_code: "OUT 1" }],
  sections: [{ class_nbr: 1, class_code: "TEST 2020", component: "LEC", section: "001" }, { class_nbr: 1, class_code: "TEST 1020", component: "LEC", section: "001" }, { class_nbr: 2, class_code: "TEST 1020", component: "DIS", section: "201" }, { class_nbr: 3, class_code: "TEST 1010", component: "LEC", section: "001" }],
  meetings: [{ id: 1, class_nbr: 1, pattern: "MW", time_start: "10:10", time_end: "11:25", facility: "Room A" }, { id: 2, class_nbr: 2, pattern: "F", time_start: "9:05", time_end: "9:55", facility: "Room B" }],
  instructors: [{ class_code: "TEST 2020", instructor_name: "Pat Example", professor_slug: "pat-example" }, { class_code: "TEST 1020", instructor_name: "Pat Example", professor_slug: "pat-example" }, { class_code: "TEST 1010", instructor_name: "Sam Roster", professor_slug: null }],
  priors: [{ class_code: "TEST 2020", term: "SP26", instructors: ["Pat Example"] }, { class_code: "TEST 1020", term: "SP26", instructors: ["Pat Example"] }],
};

// ---------- cross-lists ----------
test("cross-listed classes collapse into one card keyed by the first code alphabetically, sections merged without a duplicate class_nbr", () => {
  const cards = C.collapse(DATA);
  assert.deepEqual(cards.map(c => c.key), ["TEST 1010", "TEST 1020", "TEST 3030", "ZZZ 9000"]);
  const pair = cards.find(c => c.key === "TEST 1020");
  assert.deepEqual(pair.codes, ["TEST 1020", "TEST 2020"]);
  assert.deepEqual(pair.sections.map(s => s.class_nbr), [1, 2], "class_nbr 1 is listed under both codes and appears once");
  assert.equal(pair.sections[0].meetings.length, 1);
  assert.deepEqual(pair.instructors, [{ name: "Pat Example", slug: "pat-example" }], "one instructor, not one per code");
  assert.equal(pair.priors.length, 1, "the same prior offering under two codes is one line");
  assert.deepEqual(pair.subjects, ["TEST"]);
});

test("a cross-list to a code outside the dataset is carried on the card but does not merge anything", () => {
  const solo = C.collapse(DATA).find(c => c.key === "TEST 1010");
  assert.deepEqual(solo.codes, ["TEST 1010"]);
  assert.deepEqual(solo.otherCodes, ["OUT 1"]);
  assert.match(C.cardHtml(solo, { campus }), /TEST 1010 \/ OUT 1/);
});

test("meeting lines mark DIS and LAB components and leave LEC unmarked", () => {
  const pair = C.collapse(DATA).find(c => c.key === "TEST 1020");
  assert.deepEqual(C.meetingLines(pair.sections), ["MW · 10:10–11:25 · Room A", "DIS F · 9:05–9:55 · Room B"]);
  assert.deepEqual(C.meetingLines([{ component: "LAB", meetings: [] }]), ["LAB time not set yet"], "the words of Copy.classes.timeTBA, active voice");
});

// ---------- the grading line (owner feedback 2026-11-01) ----------
test("gradingText reads each component weight as a percentage and leaves fractions, ranges, decimals and course numbers alone", () => {
  assert.equal(C.gradingText("Weekly push 15, 3 progress presentations 15, final exhibition 25"), "Weekly push 15%, 3 progress presentations 15%, final exhibition 25%", "the count before a component is no weight");
  assert.equal(C.gradingText("4 homeworks 5 each, participation 5, midterm 35, final 40"), "4 homeworks 5% each, participation 5%, midterm 35%, final 40%");
  assert.equal(C.gradingText("Homework 50, quizzes 20; lowest 2 dropped"), "Homework 50%, quizzes 20%; lowest 2 dropped");
  assert.equal(C.gradingText("Assignments 30 (three at 10), final 40 and quizzes 5."), "Assignments 30% (three at 10%), final 40% and quizzes 5%.");
  assert.equal(C.gradingText("Midterm 1/2, final 1/2; curve mean 3.35. SP26 uses 40/60 splits"), "Midterm 1/2, final 1/2; curve mean 3.35. SP26 uses 40/60 splits");
  assert.equal(C.gradingText("Projects 13x4+11, literature review 30 (5290 only; replaced for 7290)"), "Projects 13x4+11, literature review 30% (5290 only; replaced for 7290)");
  assert.equal(C.gradingText("Plan 10, presentation 40 points."), "Plan 10%, presentation 40 points.");
  assert.equal(C.gradingText("Homework 60%, final 40%"), "Homework 60%, final 40%", "a weight with % keeps one");
  assert.equal(C.gradingText("Group work 60, attendance 20, extra credit 30"), "Group work 60%, attendance 20%, extra credit 30%", "parts over 100 keep their numbers");
  assert.equal(C.gradingText(null), ""); assert.equal(C.gradingText("  "), "");
  assert.equal(C.gradingText("SP23: Homeworks 72, final 18"), "SP23: Homeworks 72%, final 18%", "a term code is no weight");
});

test("the card carries no grading line, no prior-term line and no own rating", () => {
  const card = (extra) => C.collapse({ classes: [cls("TEST 1010", extra)] })[0];
  for (const extra of [{ roster_syllabus_read: "FA26 DRAFT", sp27_instructor_matches_syllabus: "different", grading_summary: "Weekly quizzes 30, final 70." }, { grading_summary: "Two exams 50 each." }, {}]) {
    for (const o of [{ campus }, { campus, roleId: "fpa", rel: { band: "high", matched: [] } }]) {
      const html = C.cardHtml(card(extra), o);
      assert.doesNotMatch(html, /Prior term|DRAFT|different instructor|No prior syllabus|Weekly quizzes|Two exams|cls-grading/);
      assert.doesNotMatch(html, /data-own|cls-own|Your rating|>You</);
    }
  }
});

// ---------- eligibility ----------
test("eligibility reads in plain words from the campus file; null reads as not verified", () => {
  assert.equal(C.eligibilityLabel("no_enrollment_restriction_listed", campus), "no restriction listed · check with Student Affairs");
  assert.equal(C.eligibilityLabel(null, campus), "eligibility not verified");
  assert.equal(C.eligibilityLabel("cornell_tech_students", campus), campus.eligibility.cornell_tech_students);
  for (const k of ["cornell_tech_students", "no_enrollment_restriction_listed", "jacobs_non_first_year", "cornell_tech_phd", "msba_nyc", "law_llm_jd", "johnson_cornell_tech_mba", "ms_design_technology", "continuing_from_fall_2026", "cornell_tech_phd_plus_masters", "health_tech", "urban_tech", "jacobs_first_year", "null"]) assert.ok(campus.eligibility[k], `no words for ${k}`);
});

test("the default filter keeps the classes a program may enroll in plus the no-restriction ones; Show all keeps everything", () => {
  const cards = C.collapse(DATA);
  const msba = campus.programs.find(p => p.id === "msba");
  assert.deepEqual(C.filterCards(cards, { program: msba }).map(c => c.key), ["TEST 1020"], "msba_nyc and no restriction listed are on the same card; cornell_tech_students and null are not");
  const mba = campus.programs.find(p => p.id === "mba");
  assert.deepEqual(C.filterCards(cards, { program: mba }).map(c => c.key), ["TEST 1010", "TEST 1020"]);
  assert.equal(C.filterCards(cards, { program: mba, showAll: true }).length, 4);
  assert.equal(C.filterCards(cards, { program: null }).length, 4, "no program chosen: everything");
  assert.deepEqual(C.filterCards(cards, { showAll: true, subject: "ZZZ" }).map(c => c.key), ["ZZZ 9000"]);
  assert.deepEqual(C.filterCards(cards, { showAll: true, q: "2020" }).map(c => c.key), ["TEST 1020"], "search matches any code on the card");
  assert.deepEqual(C.filterCards(cards, { showAll: true, q: "title of zzz" }).map(c => c.key), ["ZZZ 9000"]);
  for (const p of campus.programs) for (const k of p.categories) assert.ok(campus.eligibility[k], `${p.id} names an unknown category ${k}`);
});

// ---------- relevance ----------
test("the relevance score is the share of core and common weight the text names; diff rows do not count", () => {
  const rows = [{ id: "a", name: "A", tier: "core", w: 0.6 }, { id: "b", name: "B", tier: "common", w: 0.3 }, { id: "c", name: "C", tier: "diff", w: 0.9 }, { id: "d", name: "D", tier: "common", w: 0.1 }];
  const r = C.relevanceScore(new Set(["b", "c"]), rows);
  assert.ok(Math.abs(r.score - 0.3) < 1e-9, String(r.score));
  assert.deepEqual(r.matched.map(m => m.id), ["b"]);
  assert.deepEqual(C.relevanceScore(new Set(["a", "d"]), rows).matched.map(m => m.id), ["a", "d"], "core first");
  assert.deepEqual(C.relevanceScore(new Set(), []), { score: 0, matched: [] });
});

test("the band follows the thresholds in the campus file: high at or above high, medium at or above medium, else low", () => {
  const t = campus.relevance;
  assert.equal(C.relevanceBand(t.high, t), "high");
  assert.equal(C.relevanceBand(t.high - 1e-6, t), "medium");
  assert.equal(C.relevanceBand(t.medium, t), "medium");
  assert.equal(C.relevanceBand(t.medium - 1e-6, t), "low");
  assert.equal(C.relevanceBand(0, t), "low");
  assert.equal(C.relevanceBand(0.9, {}), "low", "no thresholds, no claim");
  assert.equal(C.relevanceBand(0.5, { high: 0.5, medium: 0.2 }), "high");
});

test("the card shows a band word and never a number", () => {
  const card = C.collapse(DATA)[0];
  const html = C.cardHtml(card, { campus, roleId: "fpa", rel: { band: "medium", matched: [{ name: "Budgeting", tier: "core" }, { name: "Forecasting", tier: "common" }] } });
  assert.match(html, /<span class="tag amber">medium<\/span>/);
  assert.match(html, /Budgeting/); assert.match(html, /a course can teach a skill without naming it/);
  assert.doesNotMatch(html, /\d+%|0\.\d/);
  // nothing chosen, nothing to compare against: the card carries no rating column at all
  const bare = C.cardHtml(card, { campus });
  assert.doesNotMatch(bare, /cls-rel|GradBuddy|pick a role|reading…|class="tag (thin|amber|good)">(low|medium|high)/);
  assert.match(C.cardHtml(card, { campus, roleId: "fpa" }), /cls-rel[\s\S]*reading…/, "roles chosen, the band still reading");
});

// ---------- what never reaches the screen ----------
test("roster_syllabus_md is matcher input and never appears in the card html; the card text does carry it", () => {
  const secret = "SYLLABUS-DIGEST-NEVER-SHOWN week 3 variance analysis";
  const card = C.collapse({ classes: [cls("TEST 1010", { roster_syllabus_md: "## Roster syllabus\n" + secret, research_note_md: "NOTE-NEVER-SHOWN" })] })[0];
  for (const o of [{ campus }, { campus, roleId: "fpa", rel: { band: "high", matched: [] }, selected: true, whyOpen: true }]) {
    const html = C.cardHtml(card, o);
    assert.doesNotMatch(html, /SYLLABUS-DIGEST-NEVER-SHOWN/);
    assert.doesNotMatch(html, /variance analysis/);
    assert.doesNotMatch(html, /NOTE-NEVER-SHOWN/);
  }
  assert.match(C.cardText(card), /variance analysis/);
  assert.match(C.cardText(card), /Budgeting and forecasting/);
  const withOutcomes = C.collapse({ classes: [cls("TEST 1010", { outcomes: "Build a rolling forecast\nPresent to stakeholders" })] })[0];
  assert.match(C.cardText(withOutcomes), /rolling forecast\nPresent to stakeholders/, "roster outcomes are matcher input");
});

// ---------- the markdown reader ----------
test("mdSections splits a profile on ## headings and mdHtml renders paragraphs, bullets and links without a library", () => {
  const md = "# Pat Example\n\n## At a glance\nShort.\n\n## Networking angle\nAsk about **pricing**.\n- Office hours on [the site](https://example.edu/pat)\n- A second point\n\n## Bio\nLong text <script>x</script>.";
  const s = C.mdSections(md);
  assert.deepEqual(Object.keys(s), ["_", "At a glance", "Networking angle", "Bio"]);
  const html = C.mdHtml(s["Networking angle"]);
  assert.equal(html, '<p>Ask about <b>pricing</b>.</p><ul class="plain"><li>Office hours on <a href="https://example.edu/pat" target="_blank" rel="noopener">the site</a></li><li>A second point</li></ul>');
  assert.match(C.mdHtml(s.Bio), /&lt;script&gt;/);
});

// (v19 B3) The two sign-in tests (allowedEmail, domainWords) are gone with sign-in: the roster is a public file, no campus has domains.

// ---------- the person's gaps (PLAN.md v16, step 3) ----------
import { realAtlas } from "./_load.mjs";
const GAPS = [{ id: "budgeting_forecasting", name: "Budgeting & forecasting", tier: "core", w: 0.6 }, { id: "communication", name: "Written & verbal communication", tier: "core", w: 0.8 }, { id: "stakeholder_mgmt", name: "Stakeholder management", tier: "common", w: 0.4 }, { id: "sql", name: "SQL", tier: "common", w: 0.3 }];

test("a course that names a behaviour or a practice covers no gap: only what a course can show counts, by kind", async () => {
  const A = realAtlas(); const ix = await A.index();
  for (const g of GAPS) assert.ok(ix.skillById[g.id], `${g.id} is a skill of the index`);
  assert.equal(ix.skillById.communication.kind, "behaviour"); assert.equal(ix.skillById.stakeholder_mgmt.kind, "practice");
  // the text names all four; the split by kind keeps the method and the technical skill as taught
  const split = A.courseSplit(new Set(GAPS.map(g => g.id)), ix.skillById);
  const covered = C.gapsCovered(split.teaches, GAPS);
  assert.deepEqual(covered.map(g => g.id), ["budgeting_forecasting", "sql"], "communication (a behaviour) and stakeholder management (a practice) are named, not covered");
  assert.equal(C.coverLine(covered, GAPS.length), "Covers 2 of your 4 gaps: Budgeting & forecasting, SQL");
  assert.equal(C.coverLine([], GAPS.length), "Covers none of your 4 gaps");
  assert.equal(C.coverLine([], 0), "", "no fit on file, no line");
  assert.deepEqual(C.gapsCovered(null, GAPS), []);
});

test("covered gaps come core first, then by share", () => {
  const covered = C.gapsCovered(new Set(["sql", "budgeting_forecasting", "stakeholder_mgmt"]), GAPS);
  assert.deepEqual(covered.map(g => g.id), ["budgeting_forecasting", "stakeholder_mgmt", "sql"]);
});

test("the card carries the covered line; the chip filter keeps only the cards that cover a gap", () => {
  const cards = C.collapse(DATA);
  const html = C.cardHtml(cards[0], { campus, roleId: "fpa", rel: { band: "low", matched: [] }, gaps: { covered: [GAPS[0]], total: 3 } });
  assert.match(html, /Covers 1 of your 3 gaps: Budgeting &amp; forecasting/);
  assert.match(C.cardHtml(cards[0], { campus, roleId: "fpa", rel: { band: "low", matched: [] }, gaps: { covered: [], total: 3 } }), /cls-gaps muted">Covers none of your 3 gaps/);
  assert.doesNotMatch(C.cardHtml(cards[0], { campus, roleId: "fpa", rel: { band: "low", matched: [] }, gaps: null }), /Covers/);
  const covered = { "TEST 1020": [GAPS[0]], "ZZZ 9000": [GAPS[3]] };
  assert.deepEqual(C.filterCards(cards, { showAll: true, coversGap: true, covered }).map(c => c.key), ["TEST 1020", "ZZZ 9000"]);
  assert.equal(C.filterCards(cards, { showAll: true, coversGap: false, covered }).length, 4, "the chip off: everything");
  assert.deepEqual(C.filterCards(cards, { showAll: true, coversGap: true, covered, subject: "ZZZ" }).map(c => c.key), ["ZZZ 9000"], "the chip composes with the other filters");
});

test("the sort: the roster's order, by relevance band, or by gaps covered (the share covered, then the score, then roster order; v19 B3 tuning)", () => {
  const cards = C.collapse(DATA);   // TEST 1010, TEST 1020, TEST 3030, ZZZ 9000
  const info = { "TEST 1010": { band: "low", covered: [GAPS[3]] }, "TEST 1020": { band: "high", covered: [] }, "TEST 3030": { band: "medium", covered: [GAPS[0], GAPS[3]] }, "ZZZ 9000": { band: "high", covered: [GAPS[0]] } };
  assert.deepEqual(C.sortCards(cards, "roster", info).map(c => c.key), ["TEST 1010", "TEST 1020", "TEST 3030", "ZZZ 9000"]);
  assert.deepEqual(C.sortCards(cards, "relevance", info).map(c => c.key), ["TEST 1020", "ZZZ 9000", "TEST 3030", "TEST 1010"]);
  assert.deepEqual(C.sortCards(cards, "gaps", info).map(c => c.key), ["TEST 3030", "ZZZ 9000", "TEST 1010", "TEST 1020"], "3030 covers 0.9 of share, 9000 0.6, 1010 0.3, 1020 none");
  assert.deepEqual(C.topCovering(cards, info, 3).map(c => c.key), ["TEST 3030", "ZZZ 9000", "TEST 1010"], "the rail's three: never a course that covers nothing");
  assert.deepEqual(C.topCovering(cards, { "TEST 1010": { covered: [GAPS[1]] } }, 3).map(c => c.key), ["TEST 1010"]);
  assert.notEqual(C.sortCards(cards, "gaps", info), cards, "a sort returns a new list");
  assert.deepEqual(cards.map(c => c.key), ["TEST 1010", "TEST 1020", "TEST 3030", "ZZZ 9000"]);
});

// ---------- campuses as data (PLAN.md v16, step 4) ----------
test("the campus file is a list; every campus has the keys the screens read, and Cornell Tech is first, unchanged", () => {
  // (v19 B3) signin_domains is gone: the roster is a public file; a campus with a roster names its catalog_file and tags_file
  const KEYS = ["id", "label", "term", "term_label", "pre_enrollment", "roster_updates_until", "start_card", "closed_notice", "rail_closed_line", "privacy_line", "eligibility", "programs", "relevance", "catalog"];
  assert.ok(Array.isArray(FILE.campuses) && FILE.campuses.length >= 2);
  for (const c of FILE.campuses) { for (const k of KEYS) assert.ok(k in c, `${c.id} lacks ${k}`); assert.ok(!("signin_domains" in c), `${c.id} still carries sign-in domains`); assert.equal(typeof c.catalog, "boolean"); if (c.catalog) assert.match(c.catalog_file, /^data\/catalog\/[a-z_]+\.json$/); for (const p of c.programs) assert.ok("group" in p, `${c.id} program ${p.id} has no v15 group`); }
  assert.equal(FILE.campuses[0].id, "cornell_tech"); assert.equal(FILE.campuses[0].catalog, true);
  assert.equal(FILE.campuses[0].catalog_file, "data/catalog/cornell_tech.json"); assert.equal(FILE.campuses[0].tags_file, "data/catalog/cornell_tech_tags.json");
  const ie = FILE.campuses.find(c => c.id === "ienyc");
  assert.equal(ie.label, "IE New York"); assert.equal(ie.term, "SP27"); assert.equal(ie.catalog, false);
  assert.match(ie.start_card.title, /Spring 2027 classes at IE New York/); assert.match(ie.start_card.tag, /not loaded yet/i);
  // the five programs of IENYC's College Catalog 2026-2027 (v18, step 3; "Data Science & Decision Analytics" was Cornell Tech's name, not IE's)
  assert.deepEqual(ie.programs.map(p => p.id), ["ie_mim", "ie_mif", "ie_bai", "ie_gbs", "ie_mkt"]);
  assert.deepEqual(ie.programs.map(p => p.group), ["business", "business", "analytics", "business", "business"]);
  for (const p of ie.programs) { assert.ok(!p.unverified, `${p.id} is verified against the catalog`); assert.ok(p.categories.includes(p.id) && p.categories.includes("ienyc_shared"), `${p.id} sees its own courses and the shared ones`); assert.ok(ie.eligibility[p.id], `words for ${p.id}`); }
  assert.equal(ie.pre_enrollment.closes, "2026-12-17", "the spring specialization course selection deadline");
  assert.ok(new Set(FILE.campuses.flatMap(c => c.programs.map(p => p.id))).size === FILE.campuses.flatMap(c => c.programs).length, "program ids are unique across campuses");
});

test("the person's campus: stored first, else the picker program's, else the one campus that has the v15 group, else none", () => {
  const list = FILE.campuses;
  assert.equal(C.campusFor(list, { stored: "ienyc" }).id, "ienyc");
  assert.equal(C.campusFor(list, { stored: "nowhere", programId: "ie_mif" }).id, "ienyc", "an unknown stored id falls through");
  assert.equal(C.campusFor(list, { programId: "mba" }).id, "cornell_tech");
  assert.equal(C.campusFor(list, { where: "cs" }).id, "cornell_tech", "only Cornell Tech has a CS program");
  assert.equal(C.campusFor(list, { where: "infosci" }).id, "cornell_tech");
  // with both rosters loaded, a shared group or no answer at all asks
  const both = list.map(c => ({ ...c, catalog: true }));
  assert.equal(C.campusFor(both, { where: "business" }), null, "business belongs to both campuses: ask");
  assert.equal(C.campusFor(both, { where: "analytics" }), null);
  assert.equal(C.campusFor(both, {}), null);
  // only one campus has its roster loaded (the file as shipped): no question, whatever the group
  const oneLoaded = list.map(c => ({ ...c, catalog: c.id === "cornell_tech" }));
  assert.equal(C.campusFor(oneLoaded, { where: "business" }).id, "cornell_tech", "one roster loaded: no question");
  assert.equal(C.campusFor(oneLoaded, {}).id, "cornell_tech");
  assert.equal(C.campusFor(oneLoaded, { stored: "ienyc" }).id, "ienyc", "a stored choice still wins");
  assert.equal(C.campusFor([list[0]], {}).id, "cornell_tech", "one campus in the file: no question");
  assert.equal(C.campusFor([], { stored: "x" }), null);
});

test("the neutral home card names the term and every campus", () => {
  assert.equal(C.neutralCardTitle(FILE.campuses), "Spring 2027 classes · Cornell Tech and IE New York");
});

// ---------- the picker's facets (PLAN.md v18, step 2) ----------
test("the instructor list: one entry per person from the rows, alphabetical by surname, the slug kept when any row has it", () => {
  const data = { ...DATA, classes: [...DATA.classes, cls("TEST 4040"), cls("TEST 5050")], instructors: [...DATA.instructors, { class_code: "TEST 4040", instructor_name: "Zed, Amy", professor_slug: null }, { class_code: "TEST 5050", instructor_name: "pat example", professor_slug: null }, { class_code: "TEST 5050", instructor_name: "Bo Adams", professor_slug: "bo-adams" }] };
  const list = C.instructorList(C.collapse(data));
  assert.deepEqual(list.map(i => i.name), ["Bo Adams", "Pat Example", "Sam Roster", "Zed, Amy"], "Adams, Example, Roster, Zed: by surname, a comma name by the part before it");
  const pat = list.find(i => i.name === "Pat Example");
  assert.equal(pat.slug, "pat-example"); assert.equal(pat.n, 2, "TEST 1020 (one card for two codes) and TEST 5050; the lower-case row is the same person");
  assert.equal(list.find(i => i.name === "Sam Roster").slug, null);
  assert.deepEqual(C.instructorList([]), []);
  const cards = C.collapse(data);
  assert.deepEqual(C.filterCards(cards, { showAll: true, instructor: pat }).map(c => c.key), ["TEST 1020", "TEST 5050"], "by slug when both sides have one");
  assert.deepEqual(C.filterCards(cards, { showAll: true, instructor: "sam roster" }).map(c => c.key), ["TEST 1010"], "by name, case-insensitively");
  assert.deepEqual(C.filterCards(cards, { showAll: true, instructor: pat, subject: "ZZZ" }), [], "composes with the other filters");
  assert.deepEqual(C.instructorCards(cards, { name: "Zed, Amy" }).map(c => c.key), ["TEST 4040"]);
  assert.equal(C.instructorCards(cards, null).length, cards.length);
});

test("the content search reads the code, the title, the description and the outcomes, never the syllabus digest or the research note; the card labels a match the person cannot see", () => {
  const card = C.collapse({ classes: [cls("TEST 1010", { description: "Budgeting and forecasting for managers.", outcomes: "Build a rolling forecast\nQuery a warehouse with SQL", roster_syllabus_md: "SECRET-DIGEST pricing", research_note_md: "SECRET-NOTE tableau" })] })[0];
  assert.equal(C.matchField(card, "1010"), "code");
  assert.equal(C.matchField(card, "title of"), "title");
  assert.equal(C.matchField(card, "forecasting"), "description", "the description before the outcomes");
  assert.equal(C.matchField(card, "warehouse"), "outcomes");
  assert.equal(C.matchField(card, "SQL "), "outcomes", "trimmed, case-insensitive");
  assert.equal(C.matchField(card, "pricing"), null, "roster_syllabus_md is never searched");
  assert.equal(C.matchField(card, "tableau"), null, "research_note_md is never searched");
  assert.equal(C.matchField(card, ""), null);
  assert.deepEqual(C.filterCards([card], { showAll: true, q: "warehouse" }).map(c => c.key), ["TEST 1010"]);
  assert.deepEqual(C.filterCards([card], { showAll: true, q: "pricing" }), []);
  assert.match(C.cardHtml(card, { campus, matched: "outcomes" }), /<span class="tag thin cls-match">in outcomes<\/span>/);
  assert.match(C.cardHtml(card, { campus, matched: "description" }), /in description/);
  assert.doesNotMatch(C.cardHtml(card, { campus, matched: "title" }), /cls-match/, "a match on the title or the code is visible; no label");
  assert.doesNotMatch(C.cardHtml(card, { campus }), /cls-match/);
});

test("the gaps-by-instructor join: the union of the gaps the instructor's cards cover, each with the codes that cover it, core first", () => {
  const data = { ...DATA, classes: [...DATA.classes, cls("TEST 5050")], instructors: [...DATA.instructors, { class_code: "TEST 5050", instructor_name: "Pat Example", professor_slug: "pat-example" }] };
  const cards = C.collapse(data);
  const covered = { "TEST 1020": [GAPS[3], GAPS[2]], "TEST 5050": [GAPS[0], GAPS[3]], "TEST 1010": [GAPS[1]] };
  const mine = C.instructorCards(cards, { slug: "pat-example", name: "Pat Example" });
  assert.deepEqual(mine.map(c => c.key), ["TEST 1020", "TEST 5050"]);
  const gaps = C.instructorGaps(mine, covered);
  assert.deepEqual(gaps.map(g => [g.id, g.codes]), [["budgeting_forecasting", ["TEST 5050"]], ["stakeholder_mgmt", ["TEST 1020"]], ["sql", ["TEST 1020", "TEST 5050"]]], "core first, then by share; SQL once with both codes; Sam Roster's card (communication) is not Pat's");
  assert.deepEqual(C.instructorGaps(mine, {}), []);
  assert.deepEqual(C.instructorGaps([], covered), []);
});

// ---------- the public files (v19 B3): the picker reads a file per campus, never a database client ----------
const FIXTURE = { campus: "cornell_tech", term: "SP27", generated: "2026-10-31", rosterDate: "2026-10-30", ...DATA, professors: [{ slug: "pat-example", name: "Pat Example", identity: "confirmed", title: "Professor", affiliation: "Cornell Tech", expertise: ["pricing"], official_profile_url: "https://example.edu/pat", personal_site_url: null, scholar_url: null, linkedin_url: null, profile_md: "# Pat Example\n\n## Networking angle\nAsk about pricing." }] };
const TAGS = { taxonomy_sha256: "x", taxonomy_product_sha256: "y", rule: "named outright", tags: { "TEST 1010": { found: ["budgeting_forecasting", "communication"], teaches: ["budgeting_forecasting"] }, "TEST 2020": { found: ["sql"], teaches: ["sql"] }, "TEST 1020": { found: ["stakeholder_mgmt"], teaches: [] } } };
test("files mode: loadCatalog and loadProfessor read the campus's files through deps.load and never touch deps.supabase", async () => {
  const seen = [];
  const F = require(path.join(web, "catalog.js"))({ supabase: () => { throw new Error("files mode must never open a client"); }, config: () => ({ CATALOG_SOURCE: "files", IENYC_ENABLED: true }), load: url => { seen.push(url); if (url === "data/sp27_campus.json") return FILE; if (url === "data/catalog/cornell_tech.json") return FIXTURE; if (url === "data/catalog/cornell_tech_tags.json") return TAGS; throw new Error("no such file " + url); } });
  const data = await F.loadCatalog("cornell_tech");
  assert.deepEqual(seen.sort(), ["data/catalog/cornell_tech.json", "data/catalog/cornell_tech_tags.json", "data/sp27_campus.json"]);
  assert.equal(data.classes.length, 5); assert.equal(data.rosterDate, "2026-10-30"); assert.equal(data.professors.length, 1);
  assert.ok(data.tags["TEST 1010"].found instanceof Set && data.tags["TEST 1010"].teaches.has("budgeting_forecasting"));
  assert.equal(data.tagsMeta.rule, "named outright");
  assert.equal(await F.loadCatalog("cornell_tech"), data, "one load per page");
  assert.equal(await F.loadCatalog(), data, "no campus named: the first with a catalog file");
  // the card's tags: the union over the cross-listed codes
  const pair = F.collapse(data).find(c => c.key === "TEST 1020");
  const t = F.cardTags(pair, data.tags);
  assert.deepEqual([...t.found].sort(), ["sql", "stakeholder_mgmt"]); assert.deepEqual([...t.teaches], ["sql"]);
  assert.deepEqual([...F.cardTags(F.collapse(data).find(c => c.key === "ZZZ 9000"), data.tags).found], [], "no row in the tags file: names nothing");
  const r = await F.loadProfessor("pat-example", "cornell_tech");
  assert.equal(r.professor.name, "Pat Example");
  assert.deepEqual(r.classes, [{ code: "TEST 1020", term: "SP27", title: "Title of TEST 1020" }, { code: "TEST 2020", term: "SP27", title: "Title of TEST 2020" }], "the classes the instructor rows name, by code, with titles");
  assert.equal((await F.loadProfessor("nobody", "cornell_tech")).professor, null);
  // a campus with no file says so instead of reading anything
  await assert.rejects(F.loadCatalog("ienyc"), /No catalog file for IE New York/);
  assert.ok(!("sb" in F) && !("session" in F) && !("onAuth" in F) && !("signInGoogle" in F), "no client, no session, no auth listener");
});

test("a tags file that fails to load leaves the catalog readable with no tags", async () => {
  const F = require(path.join(web, "catalog.js"))({ load: url => { if (url === "data/sp27_campus.json") return FILE; if (url === "data/catalog/cornell_tech.json") return FIXTURE; return Promise.reject(new Error("404")); } });
  const warn = console.error; console.error = () => {};
  try { const data = await F.loadCatalog("cornell_tech"); assert.equal(data.classes.length, 5); assert.deepEqual(data.tags, {}); assert.equal(data.tagsMeta, null); }
  finally { console.error = warn; }
});

// ---------- the tuned matching (v19 B3; data/experiments/scratch/surfaces/mocks/classes/tuning) ----------
const GENERIC = new Set(["communication", "stakeholder_mgmt"]);
test("relevanceScore counts a generic row at half weight; without a generic set it reads as before", () => {
  const rows = [{ id: "budgeting_forecasting", name: "B", tier: "core", w: 0.6 }, { id: "communication", name: "C", tier: "core", w: 0.8 }, { id: "sql", name: "S", tier: "common", w: 0.2 }];
  // total 0.6 + 0.4 + 0.2 = 1.2; communication alone names 0.4 of it
  const r = C.relevanceScore(new Set(["communication"]), rows, GENERIC);
  assert.ok(Math.abs(r.score - 0.4 / 1.2) < 1e-9, String(r.score));
  assert.ok(Math.abs(C.relevanceScore(new Set(["communication"]), rows).score - 0.8 / 1.6) < 1e-9, "no generic set: full weight");
  assert.ok(Math.abs(C.relevanceScore(new Set(["budgeting_forecasting"]), rows, GENERIC).score - 0.6 / 1.2) < 1e-9);
  assert.deepEqual(C.relevanceScore(new Set(["sql", "budgeting_forecasting"]), rows, GENERIC).matched.map(m => m.id), ["budgeting_forecasting", "sql"]);
});

test("gapsCovered leaves the generic gaps out", () => {
  const teaches = new Set(["budgeting_forecasting", "sql", "communication", "stakeholder_mgmt"]);
  assert.deepEqual(C.gapsCovered(teaches, GAPS, GENERIC).map(g => g.id), ["budgeting_forecasting", "sql"]);
  assert.deepEqual(C.gapsCovered(teaches, GAPS).map(g => g.id), ["communication", "budgeting_forecasting", "stakeholder_mgmt", "sql"], "no generic set: everything taught counts, core first by share");
  assert.deepEqual(C.gapsCovered(new Set(["communication"]), GAPS, GENERIC), []);
});

test("sortCards 'gaps' orders by the share covered, then the score, then the field, then code; with nothing covered, by score", () => {
  const mk = (code, extra) => cls(code, extra);
  const cards = C.collapse({ classes: [mk("TECH 1"), mk("BANA 2"), mk("CS 3"), mk("LAW 4"), mk("NBAY 5")] });   // BANA 2, CS 3, LAW 4, NBAY 5, TECH 1
  const g = (id, w, tier = "core") => ({ id, name: id, tier, w });
  const info = {
    "TECH 1": { score: 0.2, covered: [g("a", 0.5)] },
    "BANA 2": { score: 0.9, covered: [g("b", 0.3), g("c", 0.2)] },   // 0.5 too: the score breaks the tie
    "CS 3": { score: 0.9, covered: [g("b", 0.3), g("c", 0.2)] },     // 0.5 and 0.9 too: the field, then code
    "LAW 4": { score: 0.1, covered: [g("d", 0.8, "common")] },
    "NBAY 5": { score: 0.7, covered: [] },
  };
  assert.deepEqual(C.sortCards(cards, "gaps", info).map(c => c.key), ["LAW 4", "BANA 2", "CS 3", "TECH 1", "NBAY 5"], "weight first (a common gap of 0.8 outranks a core one of 0.5), then score, then code");
  assert.deepEqual(C.sortCards(cards, "gaps", info, ["CS"]).map(c => c.key), ["LAW 4", "CS 3", "BANA 2", "TECH 1", "NBAY 5"], "the field tie-break lifts CS 3 over BANA 2");
  assert.deepEqual(C.topCovering(cards, info, 3).map(c => c.key), ["LAW 4", "BANA 2", "CS 3"]);
  // relevance: by band, then score, then field, then code
  const rel = { "TECH 1": { band: "high", score: 0.4 }, "BANA 2": { band: "high", score: 0.5 }, "CS 3": { band: "medium", score: 0.3 }, "LAW 4": { band: "medium", score: 0.3 }, "NBAY 5": { band: "low", score: 0.9 } };
  assert.deepEqual(C.sortCards(cards, "relevance", rel).map(c => c.key), ["BANA 2", "TECH 1", "CS 3", "LAW 4", "NBAY 5"]);
  assert.deepEqual(C.sortCards(cards, "relevance", rel, ["LAW"]).map(c => c.key), ["BANA 2", "TECH 1", "LAW 4", "CS 3", "NBAY 5"]);
  // nothing covered: the gaps sort falls to the score, and the line is said once
  const none = Object.fromEntries(Object.entries(info).map(([k, v]) => [k, { score: v.score, covered: [] }]));
  assert.equal(C.noCover(cards, none), true); assert.equal(C.noCover(cards, info), false);
  assert.deepEqual(C.sortCards(cards, "gaps", none).map(c => c.key), ["BANA 2", "CS 3", "NBAY 5", "TECH 1", "LAW 4"]);
  assert.deepEqual(C.topCovering(cards, none, 3), [], "the rail shows none");
  assert.equal(C.NO_COVER_LINE, "No class names your gaps. These are the closest.");
});

test("inField: a card whose subject is in the list; fieldSubjects reads the campus map for the roles' fields", () => {
  const [tech, bana] = C.collapse({ classes: [cls("TECH 1"), cls("BANA 2")] }).sort((a, b) => a.key < b.key ? 1 : -1);
  assert.equal(C.inField(tech, ["TECH", "NBAY"]), true); assert.equal(C.inField(bana, ["TECH", "NBAY"]), false); assert.equal(C.inField(tech, []), false); assert.equal(C.inField(tech, null), false);
  const fs = campus.field_subjects;
  assert.deepEqual(Object.keys(fs).sort(), readJson("roles_mba.json").groups.map(g => g.id).sort(), "one entry per field of the MBA role set, shown or not yet");
  for (const g of readJson("graph_mba.json").groups) assert.ok(Array.isArray(fs[g.id]) && fs[g.id].length, `field_subjects lacks ${g.id}`);
  assert.deepEqual(C.fieldSubjects(campus, ["product"]), fs.product);
  assert.deepEqual(C.fieldSubjects(campus, ["finance", "analytics"]), [...new Set([...fs.finance, ...fs.analytics])]);
  assert.deepEqual(C.fieldSubjects(campus, ["nowhere"]), []); assert.deepEqual(C.fieldSubjects(null, ["product"]), []);
  assert.ok(fs.product.includes("TECH") && fs.finance.includes("NBAY") && fs.analytics.includes("BANA") && fs.risk.includes("LAW"));
});

test("combineRoles: a gap when any role leaves it open, weight summed over the roles that do and divided by the count, tier core when core anywhere; rows the same way", () => {
  const pm = { roleId: "pm", label: "Product Manager", gaps: [{ id: "a", name: "A", tier: "core", w: 0.8 }, { id: "b", name: "B", tier: "common", w: 0.2 }], rows: [{ id: "a", name: "A", tier: "core", w: 0.8 }, { id: "b", name: "B", tier: "common", w: 0.2 }, { id: "x", name: "X", tier: "core", w: 0.5 }] };
  const fpa = { roleId: "fpa", label: "FP&A Manager", gaps: [{ id: "b", name: "B", tier: "core", w: 0.4 }, { id: "c", name: "C", tier: "common", w: 0.3 }], rows: [{ id: "b", name: "B", tier: "core", w: 0.4 }, { id: "c", name: "C", tier: "common", w: 0.3 }] };
  const r = C.combineRoles([pm, fpa]);
  assert.deepEqual(r.labels, ["Product Manager", "FP&A Manager"]);
  const by = Object.fromEntries(r.gaps.map(g => [g.id, g]));
  assert.ok(Math.abs(by.a.w - 0.4) < 1e-9 && by.a.tier === "core" && by.a.roles.join() === "pm");
  assert.ok(Math.abs(by.b.w - 0.3) < 1e-9 && by.b.tier === "core", "common for PM, core for FP&A: core; (0.2 + 0.4) / 2");
  assert.ok(Math.abs(by.c.w - 0.15) < 1e-9 && by.c.tier === "common" && by.c.roles.join() === "fpa");
  assert.deepEqual(r.gaps.map(g => g.id), ["a", "b", "c"], "core first by weight (a 0.4, b 0.3), then common");
  const rows = Object.fromEntries(r.rows.map(x => [x.id, x]));
  assert.deepEqual(Object.keys(rows).sort(), ["a", "b", "c", "x"], "the union of the rows");
  assert.ok(Math.abs(rows.x.w - 0.25) < 1e-9 && rows.x.tier === "core"); assert.ok(Math.abs(rows.b.w - 0.3) < 1e-9 && rows.b.tier === "core");
  assert.ok(!("roles" in rows.a), "rows carry no role list");
  // one role: everything reads as today
  const one = C.combineRoles([pm]);
  assert.deepEqual(one.gaps.map(g => [g.id, g.w, g.tier]), [["a", 0.8, "core"], ["b", 0.2, "common"]]); assert.deepEqual(one.rows.map(x => [x.id, x.w]), [["a", 0.8], ["x", 0.5], ["b", 0.2]]);
  // no resume: no fit carries gaps, so gaps is null; the rows still combine
  const dry = C.combineRoles([{ ...pm, gaps: null }, { ...fpa, gaps: null }]);
  assert.equal(dry.gaps, null); assert.equal(dry.rows.length, 4);
  assert.deepEqual(C.combineRoles([]), { gaps: null, rows: [], labels: [] });
  assert.equal(C.joinLabels(["Product Manager", "FP&A Manager"]), "Product Manager and FP&A Manager");
  assert.equal(C.joinLabels(["A", "B", "C"]), "A, B and C"); assert.equal(C.joinLabels(["A"]), "A"); assert.equal(C.joinLabels([]), "");
});

// ---------- a campus behind a switch (IENYC_ENABLED, 2026-10-31) ----------
test("campuses() lists a campus whose entry names a switch only while that switch is on in the config; the file itself keeps the entry", async () => {
  const mk = cfg => require(path.join(web, "catalog.js"))({ config: () => cfg, load: () => structuredClone(FILE) });
  assert.equal(FILE.campuses.find(c => c.id === "ienyc").enabled_by, "IENYC_ENABLED", "the IE entry names its switch");
  assert.deepEqual((await mk({}).campuses()).map(c => c.id), ["cornell_tech"], "no config: the switch is off");
  assert.deepEqual((await mk({ IENYC_ENABLED: false }).campuses()).map(c => c.id), ["cornell_tech"]);
  assert.deepEqual((await mk({ IENYC_ENABLED: true }).campuses()).map(c => c.id), ["cornell_tech", "ienyc"]);
  const only = await mk({}).campuses();
  assert.equal(C.campusFor(only, { stored: "ienyc" }).id, "cornell_tech", "an IE choice kept in a browser falls back to the one campus listed");
  assert.equal(C.campusFor(only, { programId: "ie_mif" }).id, "cornell_tech");
  assert.equal(C.neutralCardTitle(only), "Spring 2027 classes · Cornell Tech");
});

// ---------- the collapsible facets and the eligibility label (owner feedback 2026-11-01) ----------
// TEST 1010 meets M (section 3), TEST 1020 (with 2020) meets MW and F, TEST 3030 has no section, ZZZ 9000 meets "" (TBA)
const FACETS = { ...DATA, classes: DATA.classes.map(c => c.code === "TEST 3030" ? { ...c, credits: "1.5" } : c.code === "ZZZ 9000" ? { ...c, credits: "1-5" } : c.code === "TEST 1010" ? { ...c, credits: "3.0" } : c), meetings: [...DATA.meetings, { id: 3, class_nbr: 3, pattern: "M", time_start: "1:00", time_end: "2:00" }, { id: 4, class_nbr: 9, pattern: "" }], sections: [...DATA.sections, { class_nbr: 9, class_code: "ZZZ 9000", component: "LEC", section: "001" }] };

test("days: one letter per day (R is Thursday, Su or U Sunday); a card matches when any meeting of any section has a chosen day", () => {
  assert.deepEqual(C.dayCodes("MWF"), ["M", "W", "F"]); assert.deepEqual(C.dayCodes("TR"), ["T", "R"]); assert.deepEqual(C.dayCodes("SSu"), ["S", "U"]); assert.deepEqual(C.dayCodes(""), []); assert.deepEqual(C.dayCodes(null), []);
  const cards = C.collapse(FACETS);
  assert.deepEqual(C.dayList(cards), ["M", "W", "F"], "the days some section meets, in week order");
  assert.deepEqual([...C.cardDays(cards.find(c => c.key === "TEST 1020"))].sort(), ["F", "M", "W"], "the lecture and the discussion together");
  assert.deepEqual(C.filterCards(cards, { showAll: true, days: ["F"] }).map(c => c.key), ["TEST 1020"], "a discussion section's day counts");
  assert.deepEqual(C.filterCards(cards, { showAll: true, days: ["M"] }).map(c => c.key), ["TEST 1010", "TEST 1020"]);
  assert.deepEqual(C.filterCards(cards, { showAll: true, days: ["W", "F"] }).map(c => c.key), ["TEST 1020"], "or within the facet");
  assert.equal(C.filterCards(cards, { showAll: true, days: [] }).length, 4, "no day chosen: everything");
  assert.deepEqual(C.filterCards(cards, { showAll: true, days: ["T"] }), [], "a class with no section or no pattern meets on no day");
});

test("credits: the distinct numbers listed, a range matching every chosen value inside it, no credits matching nothing", () => {
  const cards = C.collapse(FACETS);
  assert.deepEqual(C.creditList(cards), ["1.5", "3"], "3.0 reads as 3; the range is no option of its own");
  assert.deepEqual(C.cardCredits(cards.find(c => c.key === "TEST 1010")), ["3"]);
  assert.deepEqual(C.filterCards(cards, { showAll: true, credits: ["3"] }).map(c => c.key), ["TEST 1010", "TEST 1020", "ZZZ 9000"], "3.0, 3 and the 1-5 range");
  assert.deepEqual(C.filterCards(cards, { showAll: true, credits: ["1.5"] }).map(c => c.key), ["TEST 3030", "ZZZ 9000"]);
  assert.deepEqual(C.filterCards(C.collapse({ classes: [cls("TEST 1", { credits: null })] }), { showAll: true, credits: ["3"] }), []);
  assert.equal(C.filterCards(cards, { showAll: true, credits: [] }).length, 4);
});

test("eligibility: one option per category on the roster, no restriction first and unverified last; a card matches when any of its codes carries a chosen one", () => {
  const cards = C.collapse(DATA);   // 1010 cornell_tech_students, 1020 = no restriction + msba_nyc, 3030 null, 9000 cornell_tech_phd
  const list = C.eligibilityList(cards, campus, "No restriction");
  assert.deepEqual(list.map(o => o.value), ["no_enrollment_restriction_listed", "cornell_tech_phd", "cornell_tech_students", "msba_nyc", "null"]);
  assert.equal(list[0].value, "no_enrollment_restriction_listed"); assert.equal(list[0].label, "No restriction"); assert.equal(list[list.length - 1].value, "null");
  assert.equal(list.find(o => o.value === "msba_nyc").label, campus.eligibility.msba_nyc, "labels from the campus file");
  assert.equal(list.find(o => o.value === "null").label, "eligibility not verified");
  assert.deepEqual(list.slice(1, -1).map(o => o.label), list.slice(1, -1).map(o => o.label).slice().sort((a, b) => a.localeCompare(b)), "the rest by label");
  assert.equal(C.eligibilityList(cards, campus)[0].label, campus.eligibility.no_enrollment_restriction_listed, "no open label given: the campus words");
  assert.deepEqual(C.filterCards(cards, { showAll: true, eligibility: ["no_enrollment_restriction_listed"] }).map(c => c.key), ["TEST 1020"]);
  assert.deepEqual(C.filterCards(cards, { showAll: true, eligibility: ["msba_nyc"] }).map(c => c.key), ["TEST 1020"], "the cross-listed card under its restricted code's group too");
  assert.deepEqual(C.filterCards(cards, { showAll: true, eligibility: ["cornell_tech_students", "null"] }).map(c => c.key), ["TEST 1010", "TEST 3030"]);
  assert.equal(C.filterCards(cards, { showAll: true, eligibility: [] }).length, 4);
});

test("the facets compose with each other and with subject, search and instructor", () => {
  const cards = C.collapse(FACETS);
  assert.deepEqual(C.filterCards(cards, { showAll: true, days: ["M"], credits: ["3"] }).map(c => c.key), ["TEST 1010", "TEST 1020"]);
  assert.deepEqual(C.filterCards(cards, { showAll: true, days: ["M"], eligibility: ["no_enrollment_restriction_listed"] }).map(c => c.key), ["TEST 1020"]);
  assert.deepEqual(C.filterCards(cards, { showAll: true, days: ["M"], instructor: "Sam Roster" }).map(c => c.key), ["TEST 1010"]);
  assert.deepEqual(C.filterCards(cards, { showAll: true, credits: ["1.5"], subject: "ZZZ" }).map(c => c.key), ["ZZZ 9000"]);
  assert.deepEqual(C.filterCards(cards, { showAll: true, days: ["F"], q: "1010" }), []);
});

test("the eligibility label shows only on a restricted card, on the card and in the line the panel reads", () => {
  const cards = C.collapse(DATA);
  const open = cards.find(c => c.key === "TEST 1020"), shut = cards.find(c => c.key === "TEST 1010"), unknown = cards.find(c => c.key === "TEST 3030");
  assert.equal(C.restricted(open), false, "one code lists no restriction: open"); assert.equal(C.restricted(shut), true); assert.equal(C.restricted(unknown), true, "unverified is not open");
  assert.equal(C.eligibilityLine(open, campus), ""); assert.equal(C.eligibilityLine(shut, campus), campus.eligibility.cornell_tech_students); assert.equal(C.eligibilityLine(unknown, campus), "", "an unverified restriction is not a restriction the card names (owner, 2026-11-01)");
  assert.doesNotMatch(C.cardHtml(open, { campus }), /no restriction listed|tag thin/);
  assert.match(C.cardHtml(shut, { campus }), new RegExp(`<span class="tag thin">${campus.eligibility.cornell_tech_students}</span>`));
});

test("roster order: subject, then the number read as a number", () => {
  const cards = C.collapse({ classes: [cls("CS 5304"), cls("BANA 6010"), cls("CS 600"), cls("CS 5110")] });
  assert.deepEqual(C.sortCards(cards, "roster").map(c => c.key), ["BANA 6010", "CS 600", "CS 5110", "CS 5304"]);
  assert.deepEqual(C.sortCards(cards, undefined).map(c => c.key), ["BANA 6010", "CS 600", "CS 5110", "CS 5304"], "any other mode is the roster's order");
});

// ---------- the usability pass of 2026-11-06 (cluster "Find classes and the campus gate") ----------
const Copy = require(path.join(web, "copy.js"));
const fs = require("fs");

test("a card says \"1 credit\" for one credit and \"N credits\" otherwise, in the panel's words too", () => {
  assert.equal(C.creditsLine("1"), "1 credit");
  assert.equal(C.creditsLine("1.0"), "1.0 credit", "the roster's number as written, singular because it is one");
  assert.equal(C.creditsLine("3"), "3 credits");
  assert.equal(C.creditsLine("1-5"), "1-5 credits");
  assert.equal(C.creditsLine(null), Copy.classes.noCredits);
  const one = C.collapse({ classes: [cls("TECH 5200", { credits: "1" })] })[0];
  assert.match(C.cardHtml(one, { campus }), /<p class="facts">1 credit</);
  assert.doesNotMatch(C.cardHtml(one, { campus }), /1 credits/);
});

test("the card's words come from Copy.classes, so the copy checks read them; none is left in catalog.js", () => {
  const src = fs.readFileSync(path.join(web, "catalog.js"), "utf8");
  for (const s of ["from the course description", "reading…", "Instructor to be announced", "credits not listed", "time to be announced", "None of the role's main asks named", "Read from the roster text", "No class names your gaps"]) assert.ok(!src.includes(s), `catalog.js still says "${s}"`);
  const CL = Copy.classes;
  const card = C.collapse({ classes: [cls("TEST 9")] })[0];
  assert.match(C.cardHtml(card, { campus }), new RegExp(CL.noInstructor), "no instructor on the roster");
  assert.match(C.cardHtml(card, { campus, roleId: "fpa" }), new RegExp(`${CL.fromDescription}[\\s\\S]*${CL.reading}`));
  assert.match(C.cardHtml(card, { campus, roleId: "fpa", rel: { band: "low", matched: [] } }), new RegExp(CL.noneNamed.replace(/[.']/g, ".")));
  assert.equal(C.NO_COVER_LINE, CL.noCoverLine);
  assert.equal(C.coverLine([], 2), Copy.fill(CL.coverNone, { total: 2 }));
});

test("the pre-enrollment dates under the heading are read from the campus entry, never written in the code", () => {
  const ct = FILE.campuses.find(c => c.id === "cornell_tech");
  const line = C.datesLine(ct);
  assert.ok(line.includes(ct.pre_enrollment.label), line);
  assert.ok(line.includes(ct.roster_updates_until), line);
  assert.equal(line, `${Copy.fill(Copy.classes.preEnrollment, { dates: ct.pre_enrollment.label })} ${Copy.fill(Copy.classes.rosterUpdates, { date: ct.roster_updates_until })}`);
  assert.equal(C.datesLine({ ...ct, roster_updates_until: null }), Copy.fill(Copy.classes.preEnrollment, { dates: ct.pre_enrollment.label }), "no roster date: the window alone");
  assert.equal(C.datesLine({ id: "x" }), "", "no dates in the entry: no line");
  for (const f of ["catalog.js", "classes.js", "copy.js"]) assert.ok(!/Nov 1[0-6]/.test(fs.readFileSync(path.join(web, f), "utf8")), `${f} carries no date of its own`);
});

test("the gap names: the first few by name, then \"and N more\"", () => {
  assert.equal(C.namesLine(["A"], 3), "A");
  assert.equal(C.namesLine(["A", "B", "C"], 3), "A, B and C");
  assert.equal(C.namesLine(["A", "B", "C", "D", "E"], 3), "A, B, C and 2 more");
  assert.equal(C.namesLine([], 3), "");
});

test("an empty list names the filters that emptied it, in the order the screen draws them", () => {
  const CL = Copy.classes;
  assert.deepEqual(C.activeFilters({}), [], "nothing on: the bare no-match line and no Clear button");
  assert.deepEqual(C.activeFilters({ q: "  zzzz ", subject: "TECH" }), [Copy.fill(CL.filterSearch, { q: "zzzz" }), Copy.fill(CL.filterSubject, { subject: "TECH" })]);
  assert.deepEqual(C.activeFilters({ days: ["M"], instructor: "Pat" }), [Copy.fill(CL.filterNamed, { name: CL.facets.days }), Copy.fill(CL.filterNamed, { name: CL.facets.professor })], "a facet alone empties the list: the line names the facet, not the search");
  assert.deepEqual(C.activeFilters({ coversGap: true, credits: ["3"], elig: ["x"] }).length, 3);
  assert.ok(!CL.noMatch.includes("search"), "the bare line no longer tells the person to clear a search that may be empty");
});
