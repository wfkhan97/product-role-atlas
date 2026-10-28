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
  assert.deepEqual(C.meetingLines([{ component: "LAB", meetings: [] }]), ["LAB time to be announced"]);
});

// ---------- the grading chip ----------
test("grading chip: a roster syllabus read names the term and the instructor match, then the summary", () => {
  const same = C.gradingChip({ roster_syllabus_read: "SP26 DRAFT", sp27_instructor_matches_syllabus: "same", grading_summary: "Four problem sets and a final project." });
  assert.equal(same.text, "Prior term · SP26 DRAFT · same instructor");
  assert.equal(same.summary, "Four problem sets and a final project.");
  assert.equal(same.caveat, "");
  const diff = C.gradingChip({ roster_syllabus_read: "FA25", sp27_instructor_matches_syllabus: "different", grading_summary: "Weekly quizzes." });
  assert.equal(diff.text, "Prior term · FA25 · different instructor");
  assert.equal(diff.caveat, "structure example, not a prediction");
  assert.equal(C.gradingChip({ roster_syllabus_read: "SP26", sp27_instructor_matches_syllabus: "partial", grading_summary: "" }).text, "Prior term · SP26 · partial instructor");
  assert.equal(C.gradingChip({ roster_syllabus_read: "SP26", sp27_instructor_matches_syllabus: "unknown" }).text, "Prior term · SP26 · instructor match unknown");
});

test("grading chip: a public summary without a roster read shows as is; nothing at all says so", () => {
  const pub = C.gradingChip({ roster_syllabus_read: null, sp27_instructor_matches_syllabus: null, grading_summary: "Per the public course page: two exams and a paper." });
  assert.equal(pub.text, "Per the public course page: two exams and a paper.");
  assert.equal(pub.summary, ""); assert.equal(pub.caveat, "");
  assert.deepEqual(C.gradingChip({ roster_syllabus_read: null, grading_summary: null }), { text: "No prior syllabus on the roster.", summary: "", caveat: "" });
});

test("the chip text reaches the card for each of the three cases", () => {
  const card = (extra) => C.collapse({ classes: [cls("TEST 1010", extra)] })[0];
  assert.match(C.cardHtml(card({ roster_syllabus_read: "SP26 DRAFT", sp27_instructor_matches_syllabus: "different", grading_summary: "Weekly quizzes." }), { campus }), /Prior term · SP26 DRAFT · different instructor<\/span> Weekly quizzes\. <span class="muted">\(structure example, not a prediction\)/);
  assert.match(C.cardHtml(card({ grading_summary: "Two exams." }), { campus }), /Two exams\./);
  assert.match(C.cardHtml(card({}), { campus }), /No prior syllabus on the roster\./);
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
  assert.match(C.cardHtml(card, { campus }), /pick a role to rate/);
  assert.match(C.cardHtml(card, { campus, roleId: "fpa", own: "high" }), /data-val="high"[^>]*>high/);
  assert.match(C.cardHtml(card, { campus, roleId: "fpa", own: "high" }), /class="chip on" data-own="TEST 1010" data-val="high"/);
});

// ---------- what never reaches the screen ----------
test("roster_syllabus_md is matcher input and never appears in the card html; the card text does carry it", () => {
  const secret = "SYLLABUS-DIGEST-NEVER-SHOWN week 3 variance analysis";
  const card = C.collapse({ classes: [cls("TEST 1010", { roster_syllabus_md: "## Roster syllabus\n" + secret, research_note_md: "NOTE-NEVER-SHOWN" })] })[0];
  for (const o of [{ campus }, { campus, roleId: "fpa", rel: { band: "high", matched: [] }, own: "low", selected: true, whyOpen: true }]) {
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

test("only addresses in the campus's domains pass the sign-in check (Cornell Tech: cornell.edu)", () => {
  assert.ok(C.allowedEmail("abc123@cornell.edu", campus)); assert.ok(C.allowedEmail(" ABC@Cornell.EDU ", campus));
  assert.ok(!C.allowedEmail("abc@cornell.edu.evil.com", campus)); assert.ok(!C.allowedEmail("abc@gmail.com", campus)); assert.ok(!C.allowedEmail("", campus));
});

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

test("the sort: by code, by relevance band, or by gaps covered (core gaps first, then every gap, then code)", () => {
  const cards = C.collapse(DATA);   // TEST 1010, TEST 1020, TEST 3030, ZZZ 9000
  const info = { "TEST 1010": { band: "low", covered: [GAPS[3]] }, "TEST 1020": { band: "high", covered: [] }, "TEST 3030": { band: "medium", covered: [GAPS[0], GAPS[3]] }, "ZZZ 9000": { band: "high", covered: [GAPS[0]] } };
  assert.deepEqual(C.sortCards(cards, "code", info).map(c => c.key), ["TEST 1010", "TEST 1020", "TEST 3030", "ZZZ 9000"]);
  assert.deepEqual(C.sortCards(cards, "relevance", info).map(c => c.key), ["TEST 1020", "ZZZ 9000", "TEST 3030", "TEST 1010"]);
  assert.deepEqual(C.sortCards(cards, "gaps", info).map(c => c.key), ["TEST 3030", "ZZZ 9000", "TEST 1010", "TEST 1020"], "3030 and 9000 cover a core gap, 3030 covers more; 1010 covers a common one; 1020 none");
  assert.deepEqual(C.topCovering(cards, info, 3).map(c => c.key), ["TEST 3030", "ZZZ 9000", "TEST 1010"], "the rail's three: never a course that covers nothing");
  assert.deepEqual(C.topCovering(cards, { "TEST 1010": { covered: [GAPS[1]] } }, 3).map(c => c.key), ["TEST 1010"]);
  assert.notEqual(C.sortCards(cards, "gaps", info), cards, "a sort returns a new list");
  assert.deepEqual(cards.map(c => c.key), ["TEST 1010", "TEST 1020", "TEST 3030", "ZZZ 9000"]);
});

// ---------- campuses as data (PLAN.md v16, step 4) ----------
test("the campus file is a list; every campus has the keys the screens read, and Cornell Tech is first, unchanged", () => {
  const KEYS = ["id", "label", "term", "term_label", "pre_enrollment", "roster_updates_until", "start_card", "closed_notice", "rail_closed_line", "privacy_line", "eligibility", "programs", "relevance", "signin_domains", "catalog"];
  assert.ok(Array.isArray(FILE.campuses) && FILE.campuses.length >= 2);
  for (const c of FILE.campuses) { for (const k of KEYS) assert.ok(k in c, `${c.id} lacks ${k}`); assert.ok(Array.isArray(c.signin_domains)); assert.equal(typeof c.catalog, "boolean"); for (const p of c.programs) assert.ok("group" in p, `${c.id} program ${p.id} has no v15 group`); }
  assert.equal(FILE.campuses[0].id, "cornell_tech"); assert.deepEqual(FILE.campuses[0].signin_domains, ["cornell.edu"]); assert.equal(FILE.campuses[0].catalog, true);
  const ie = FILE.campuses.find(c => c.id === "ienyc");
  assert.equal(ie.label, "IE New York"); assert.equal(ie.term, "SP27"); assert.deepEqual(ie.signin_domains, []); assert.equal(ie.catalog, false);
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
  assert.equal(C.campusFor(list, { where: "business" }), null, "business belongs to both campuses: ask");
  assert.equal(C.campusFor(list, { where: "analytics" }), null);
  assert.equal(C.campusFor(list, {}), null);
  assert.equal(C.campusFor([list[0]], {}).id, "cornell_tech", "one campus in the file: no question");
  assert.equal(C.campusFor([], { stored: "x" }), null);
});

test("sign-in accepts an email whose domain is in the campus's list; a campus with no domains accepts none", () => {
  const [cornell, ie] = FILE.campuses;
  assert.equal(C.allowedEmail("netid@cornell.edu", cornell), true);
  assert.equal(C.allowedEmail(" NetID@Cornell.EDU ", cornell), true);
  assert.equal(C.allowedEmail("x@tech.cornell.edu", cornell), true, "a subdomain counts");
  assert.equal(C.allowedEmail("x@notcornell.edu", cornell), false);
  assert.equal(C.allowedEmail("x@cornell.edu.evil.com", cornell), false);
  assert.equal(C.allowedEmail("@cornell.edu", cornell), false);
  assert.equal(C.allowedEmail("x@ie.edu", ie), false, "IE has no sign-in yet");
  assert.equal(C.allowedEmail("x@cornell.edu", null), false);
  assert.equal(C.domainWords(cornell), "@cornell.edu");
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

// ---------- the test switch: a database that returns nothing falls back to the local copy, only with CATALOG_OPEN on ----------
test("loadCatalog with CATALOG_OPEN on reads data/local/catalog.json when the database returns no rows, and marks the result local; off, the empty read stands", async () => {
  const empty = () => { const q = { order: () => q, then: (res) => res({ data: [], error: null }) }; return q; };
  const lib = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) }, from: () => ({ select: () => ({ range: () => empty(), eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) };
  const LOCAL = { classes: [cls("TEST 1010")], crosslists: [], sections: [], meetings: [], instructors: [{ class_code: "TEST 1010", instructor_name: "Pat Example", professor_slug: "pat-example", term: "SP27" }], priors: [], rosterDate: "2026-10-27", professors: [{ slug: "pat-example", name: "Pat Example", identity: "confirmed" }] };
  const loads = [];
  const mk = open => require(path.join(web, "catalog.js"))({ supabase: () => lib, config: () => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "pk", CATALOG_OPEN: open }), load: url => { loads.push(url); return url.endsWith("data/local/catalog.json") ? structuredClone(LOCAL) : Promise.reject(new Error(url + ": 404")); } });
  const on = mk(true);
  const d = await on.loadCatalog();
  assert.equal(d.local, true); assert.equal(d.classes.length, 1); assert.equal(d.rosterDate, "2026-10-27");
  const p = await on.loadProfessor("pat-example");
  assert.equal(p.local, true); assert.equal(p.professor.name, "Pat Example"); assert.deepEqual(p.classes.map(c => c.code), ["TEST 1010"]);
  assert.ok(loads.some(u => u.endsWith("data/local/catalog.json")), "the local copy was read");
  const off = mk(false);
  const e = await off.loadCatalog();
  assert.equal(e.local, undefined); assert.equal(e.classes.length, 0, "with the switch off the empty read is what the page gets");
  const q = await off.loadProfessor("pat-example");
  assert.equal(q.professor, null);
});
