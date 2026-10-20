// web/catalog.js: the pure functions behind the Spring 2027 class cards, on synthetic rows (invented codes; no real
// catalog row lives in this repo). The thresholds and the eligibility words come from web/data/sp27_campus.json.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web, readJson } from "./_load.mjs";

const C = require(path.join(web, "catalog.js"))({});
const campus = readJson("sp27_campus.json");

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

test("only cornell.edu addresses pass the sign-in check", () => {
  assert.ok(C.isCornell("abc123@cornell.edu")); assert.ok(C.isCornell(" ABC@Cornell.EDU "));
  assert.ok(!C.isCornell("abc@cornell.edu.evil.com")); assert.ok(!C.isCornell("abc@gmail.com")); assert.ok(!C.isCornell(""));
});
