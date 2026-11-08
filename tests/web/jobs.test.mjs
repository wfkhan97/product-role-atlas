// web/jobs.js: the pure logic of Find jobs (search_logic.md) on synthetic rows, then the real web/data/jobs_open.json
// against the indexes it was written from.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web, readJson } from "./_load.mjs";

const J = require(path.join(web, "jobs.js"));

// ---------- synthetic rows ----------
const SKILLS = ["sql", "stakeholder_mgmt", "valuation", "roadmapping"];
const NAMES = { sql: "SQL", stakeholder_mgmt: "Stakeholder management", valuation: "Valuation", roadmapping: "Roadmapping" };
const ROLES = { management_consultant: ["Management Consultant", "consulting_strategy"], ib_analyst: ["Investment Banking Analyst", "banking_investing"], "product.pm": ["Product Manager", "product"] };
const ctx = {
  roleName: r => (ROLES[r.role] || [""])[0],
  skillNames: r => r.skills.map(i => NAMES[SKILLS[i]]),
  fieldOf: id => (ROLES[id] || ["", ""])[1],
};
const row = (id, extra = {}) => ({ id, set: "mba", role: "management_consultant", title: "Consultant", company: "Acme", group: "fortune50", sector: "Consulting", level: "mid", entry: null, intern: false, location: "New York, NY", remote: false, sponsorship: null, url: "https://example.test/" + id, skills: [0, 1], first_seen: null, posted: null, grad: false, start: null, ...extra });
const ROWS = [
  row("m1", { title: "Product Manager", role: "product.pm", set: "product", company: "Adobe", group: "fortune250", level: "senior", skills: [1, 3], location: "San Jose, CA", remote: true }),
  row("m2", { title: "Strategy Consultant", company: "Bain", group: "mba_employer", level: "associate", entry: "mba", skills: [0, 1, 2] }),
  row("m3", { title: "Investment Banking Analyst", role: "ib_analyst", company: "Goldman Sachs", group: "mba_employer", level: "associate", entry: "pre_mba", skills: [2], location: "New York, NY", sponsorship: "yes" }),
  row("m4", { title: "Summer Consultant Intern", company: "Acme", group: "startup", level: "associate", intern: true, skills: [0], location: "Chicago, IL" }),
  row("m5", { title: "Director of Product", role: "product.pm", set: "product", company: "Adobe", group: "fortune250", level: "vp", skills: [3], location: "Remote - USA", remote: true }),
  row("m6", { title: "Consultant", company: "Acme", level: "staff", location: "New York, NY", skills: [1], sponsorship: "no" }),
];
const ids = rows => rows.map(r => r.id);

// ---------- the query ----------
test("an empty query gives every row with strength 1", () => {
  const r = J.searchJobs(ROWS, "", ctx);
  assert.deepEqual(ids(r), ids(ROWS));
  assert.ok(r.every(x => x.strength === 1));
});

test("words combine with AND: every word must hit somewhere", () => {
  assert.deepEqual(ids(J.searchJobs(ROWS, "consultant", ctx)), ["m2", "m4", "m6"]);
  assert.deepEqual(ids(J.searchJobs(ROWS, "consultant chicago", ctx)), ["m4"]);
  assert.deepEqual(ids(J.searchJobs(ROWS, "consultant mars", ctx)), []);
});

test("a whole word scores 2, the start of a word 1, times the field's weight", () => {
  const strength = (id, q) => (J.searchJobs(ROWS, q, ctx).find(r => r.id === id) || {}).strength || 0;
  assert.equal(strength("m1", "product"), 6, "whole word in the title: 2 x 3");
  assert.equal(strength("m1", "prod"), 3, "prefix in the title: 1 x 3");
  assert.equal(strength("m1", "adobe"), 4, "whole word in the company: 2 x 2");
  assert.equal(strength("m2", "management"), 4, "whole word in the role name: 2 x 2");
  assert.equal(strength("m2", "valuation"), 2, "whole word in a skill name: 2 x 1");
  assert.equal(strength("m2", "york"), 2, "whole word in the location: 2 x 1");
  assert.equal(strength("m6", "consultant"), 6, "the best field counts, not the sum: title 6 beats the role name's 4");
  assert.equal(strength("m1", "product jose"), 8, "the strength sums the words: 6 + 2");
  assert.equal(strength("m3", "banking"), 6);
});

test("the query reads case and punctuation away", () => {
  assert.deepEqual(ids(J.searchJobs(ROWS, "GOLDMAN-sachs", ctx)), ["m3"]);
});

// ---------- the short forms, the all-but-one fallback, the filter words (2026-11-08) ----------
const TECH = { "tech.ml_engineer": "ML / AI Engineer", "tech.software_engineer": "Software Engineer", "product.pm": "Product Manager" };
const tctx = { roleName: r => TECH[r.role] || "", skillNames: () => [] };
const AROWS = [
  row("a1", { set: "tech", role: "tech.ml_engineer", title: "Machine Learning Engineer, New Grad", company: "Nvidia", location: "Santa Clara, CA", grad: true }),
  row("a2", { set: "tech", role: "tech.ml_engineer", title: "MLE II", company: "Roku", location: "Austin, TX" }),
  row("a3", { set: "product", role: "product.pm", title: "Associate Product Manager, New Grad (2027 Start)", company: "Databricks", location: "San Francisco, CA", grad: true, start: 2027 }),
  row("a4", { set: "product", role: "product.pm", title: "PM, Growth", company: "Figma", location: "New York, NY" }),
  row("a5", { role: "program_manager", title: "Program Management Office Lead (PMO)", company: "Acme", location: "Remote", remote: true }),
  row("a6", { set: "tech", role: "tech.software_engineer", title: "Software Engineer, Backend", company: "Stripe", location: "Wilmington, DE" }),
  row("a7", { set: "mba", role: "fpa", title: "Senior Manager, FP&A", company: "AbbVie", location: "Chicago, IL" }),
];
const strengthIn = (rows, q, id) => (J.searchJobs(rows, q, tctx).find(r => r.id === id) || {}).strength || 0;

test("a short form finds its own word and the words it stands for, never the start of a longer word", () => {
  assert.deepEqual(ids(J.searchJobs(AROWS, "mle", tctx)), ["a1", "a2"], "the expansion (a1) and the word itself (a2)");
  assert.deepEqual(ids(J.searchJobs(AROWS, "pm", tctx)), ["a3", "a4"], "PM, Growth by the word, Product Manager by the expansion, not PMO");
  assert.deepEqual(ids(J.searchJobs(AROWS, "swe", tctx)), ["a6"]);
  assert.deepEqual(ids(J.searchJobs(AROWS, "fpa", tctx)), ["a7"], "FP&A reads as fpa");
  assert.deepEqual(ids(J.searchJobs(AROWS, "fp&a", tctx)), ["a7"]);
  assert.deepEqual(ids(J.searchJobs([...AROWS, row("de1", { set: "tech", title: "Data Engineer", location: "Austin, TX" })], "de", tctx)), ["a6"], "de is a plain word, not a short form: Delaware in the location, not a data engineer");
  assert.ok(!("de" in J.ALIASES) && J.ALIASES.mle === "machine learning engineer" && J.ALIASES.pm === "product manager");
  assert.deepEqual(ids(J.searchJobs(AROWS, "pm new grad", tctx)), ["a3"], "the expansion and the other words, with AND kept");
});

test("a short form scores the better of its word and its expansion's average", () => {
  assert.equal(strengthIn(AROWS, "pm", "a4"), 6, "the word in the title: 2 x 3");
  assert.equal(strengthIn(AROWS, "pm", "a3"), 6, "product and manager both whole words of the title: (6 + 6) / 2");
  assert.equal(strengthIn(AROWS, "mle", "a2"), 6, "MLE in the title");
  assert.equal(strengthIn(AROWS, "mle", "a1"), 6, "machine learning engineer in the title");
  // an expansion spread over the title and the role name scores less than the word in the title
  const spread = [row("s1", { role: "product.pm", title: "Product Lead, Payments" }), row("s2", { role: "product.pm", title: "Senior PM" })];
  assert.equal(strengthIn(spread, "pm", "s1"), 5, "product in the title 6, manager in the role name 4: their average");
  assert.deepEqual(ids(J.sortJobs(J.searchJobs(spread, "pm", tctx), "best")), ["s2", "s1"], "the word in the title first");
});

test("the all-but-one fallback runs only after an empty exact pass, and never for one word", () => {
  const exact = J.searchJobsRelaxed(AROWS, "machine learning engineer", tctx);
  assert.equal(exact.relaxed, false); assert.deepEqual(ids(exact.rows), ["a1"]);
  const loose = J.searchJobsRelaxed(AROWS, "machine learning engineer zanzibar", tctx);
  assert.equal(loose.relaxed, true, "no posting has zanzibar: the rows that miss only it");
  assert.deepEqual(ids(loose.rows), ["a1"]);
  assert.ok(loose.rows[0].strength > 0);
  assert.ok(!("relaxed" in loose.rows[0]), "the flag is on the result, not the rows");
  assert.deepEqual(J.searchJobsRelaxed(AROWS, "zanzibar", tctx), { rows: [], relaxed: false }, "one word: nothing to relax");
  assert.deepEqual(J.searchJobsRelaxed(AROWS, "zanzibar mars", tctx), { rows: [], relaxed: false }, "two misses: still nothing");
  assert.deepEqual(ids(J.searchJobsRelaxed(AROWS, "stripe zanzibar", tctx).rows), ["a6"]);
});

test("queryHints reads the filters a query names, with the words and their places", () => {
  const h = q => J.queryHints(q, 2026).map(x => [x.key, x.val, x.words.join(" ")]);
  for (const q of ["new grad", "new graduate", "new graduates", "new grads", "grad", "grads", "graduate", "graduates", "entry level", "early career", "new-grad", "Entry-Level"])
    assert.deepEqual(h(q), [["entry", "grads", J.words(q).join(" ")]], q);
  for (const q of ["intern", "interns", "internship", "internships"]) assert.deepEqual(h(q), [["entry", "intern", q]], q);
  assert.deepEqual(h("remote"), [["remote", true, "remote"]]);
  for (const q of ["sponsor", "sponsors", "sponsorship", "visa", "h1b"]) assert.deepEqual(h(q), [["sponsor", "yes", q]], q);
  assert.deepEqual(h("H-1B"), [["sponsor", "yes", "h1b"]], "h-1b reads as h1b");
  assert.deepEqual(h("2027"), [["entry", "later", "2027"]], "a year after the file's");
  assert.deepEqual(h("2026"), [], "the file's own year is not later");
  assert.deepEqual(J.queryHints("2027", 2027), []);
  assert.deepEqual(h("product manager"), []);
  const all = J.queryHints("product manager remote sponsorship new grad", 2026);
  assert.deepEqual(all.map(x => [x.key, x.at]), [["remote", [2]], ["sponsor", [3]], ["entry", [4, 5]]]);
  assert.equal(J.dropWords("Product Manager remote sponsorship", all[0].at), "product manager sponsorship", "the rest of the query kept, in order");
  assert.equal(J.dropWords("PM new grad", J.queryHints("PM new grad", 2026)[0].at), "pm");
});

test("the query is read before it is cut: fp&a is one word, new-grad two", () => {
  assert.deepEqual(J.words("FP&A"), ["fpa"]);
  assert.deepEqual(J.words("new-grad"), ["new", "grad"]);
  assert.deepEqual(J.words("R&D, AT&T"), ["rd", "att"]);
  assert.deepEqual(J.words("H-1B visa"), ["h1b", "visa"]);
});

// ---------- the filters ----------
test("each filter narrows as the spec says", () => {
  const f = (o) => ids(J.filterJobs(ROWS, o, ctx));
  assert.deepEqual(f({}), ids(ROWS), "no filter: every row");
  assert.deepEqual(f({ field: "product" }), ["m1", "m5"]);
  assert.deepEqual(f({ role: "ib_analyst" }), ["m3"]);
  assert.deepEqual(f({ level: "mid" }), ["m1"], "senior folds into Manager");
  assert.deepEqual(f({ level: "associate" }), ["m2", "m3", "m4"]);
  assert.deepEqual(f({ level: "director" }), ["m5"], "vp folds into Director");
  assert.deepEqual(f({ level: "staff" }), ["m6"]);
  assert.deepEqual(f({ entry: "mba" }), ["m2"]);
  assert.deepEqual(f({ entry: "grads" }), ["m3"]);
  assert.deepEqual(f({ entry: "bachelor" }), ["m3"], "an old link's value reads as New graduates");
  assert.deepEqual(f({ entry: "intern" }), ["m4"]);
  assert.deepEqual(f({ location: "new york" }), ["m2", "m3", "m6"], "each word starts a word in the location");
  assert.deepEqual(f({ location: "chi" }), ["m4"]);
  assert.deepEqual(f({ location: "ork" }), [], "a word must start a word");
  assert.deepEqual(f({ location: "remote" }), ["m1", "m5"], "remote matches the flag too");
  assert.deepEqual(f({ remote: true }), ["m1", "m5"]);
  assert.deepEqual(f({ sponsor: "yes" }), ["m3"], "yes only");
  assert.deepEqual(f({ sponsor: "open" }), ["m1", "m2", "m3", "m4", "m5"], "every posting but the one that says it will not");
  assert.deepEqual(f({ group: "fortune500" }), ["m1", "m5", "m6"], "every Fortune tier is one employer type");
  assert.deepEqual(f({ group: "mba_employer" }), ["m2", "m3"]);
  assert.deepEqual(f({ group: "startup" }), ["m4"]);
  assert.deepEqual(f({ company: "Acme" }), ["m4", "m6"]);
  assert.deepEqual(f({ company: "Acme", level: "associate" }), ["m4"], "filters combine");
});

test("facet counts leave the facet's own filter out and keep the others", () => {
  const levels = J.LEVEL_WORDS.labels.map(([id]) => id);
  assert.deepEqual(J.facetCounts(ROWS, { level: "mid" }, "level", levels, ctx), { associate: 3, mid: 1, staff: 1, director: 1 });
  assert.deepEqual(J.facetCounts(ROWS, { level: "mid", company: "Acme" }, "level", levels, ctx), { associate: 1, mid: 0, staff: 1, director: 0 });
  assert.deepEqual(J.facetCounts(ROWS, {}, "remote", [true], ctx), { true: 2 });
  assert.deepEqual(J.facetCounts(ROWS, { remote: true }, "sponsor", J.SPONSOR, ctx), { yes: 0, open: 2 });
  assert.deepEqual(J.facetCounts(ROWS, { sponsor: "yes" }, "sponsor", J.SPONSOR, ctx), { yes: 1, open: 5 }, "the two values are exclusive, like Level");
  // a field value that leaves the chosen role outside drops the role, as the rail does
  assert.deepEqual(J.facetCounts(ROWS, { role: "ib_analyst" }, "field", ["product", "banking_investing"], ctx), { product: 2, banking_investing: 1 });
  // the counts respect the rows handed in (the search result)
  assert.deepEqual(J.facetCounts(J.searchJobs(ROWS, "consultant", ctx), {}, "company", ["Acme", "Bain", "Adobe"], ctx), { Acme: 2, Bain: 1, Adobe: 0 });
});

// ---------- the fit ----------
test("the fit is N of M, never a percentage", () => {
  const fit = J.fitOf(ROWS[1], ["sql", "valuation", "roadmapping"], SKILLS);
  assert.deepEqual(fit, { n: 2, m: 3 });
  assert.ok(!("pct" in fit) && !("share" in fit) && !("score" in fit));
  assert.equal(J.fitLine(fit), "2 of the 3 skills this posting asks for are on your résumé.");
  assert.ok(!/%/.test(J.fitLine(fit)));
  assert.deepEqual(J.fitOf(ROWS[1], new Set(["sql"]), SKILLS), { n: 1, m: 3 }, "a Set works too");
  assert.deepEqual(J.fitOf({ skills: ["sql", "valuation"] }, ["sql"]), { n: 1, m: 2 }, "without skill ids the row's skills compare as they are");
  assert.deepEqual(J.fitOf(ROWS[1], [], SKILLS), { n: 0, m: 3 });
});

// ---------- the order ----------
test("best: strength, then the fit share, then company, then title", () => {
  const rows = [
    { id: "a", strength: 2, company: "Zed", title: "B" },
    { id: "b", strength: 4, company: "Acme", title: "A" },
    { id: "c", strength: 2, company: "Acme", title: "B" },
    { id: "d", strength: 2, company: "Acme", title: "A" },
  ];
  assert.deepEqual(ids(J.sortJobs(rows, "best")), ["b", "d", "c", "a"]);
  const fits = { a: { n: 2, m: 2 }, b: { n: 0, m: 5 }, c: { n: 2, m: 4 }, d: { n: 1, m: 1 } };
  // every m here is under the floor, so a and c share 2 of 15 and tie; the tie goes to company A–Z (c, Acme)
  assert.deepEqual(ids(J.sortJobs(rows, "best", fits)), ["b", "c", "a", "d"], "within a strength tie: the larger share first, an equal share by company");
  assert.deepEqual(ids(J.sortJobs(rows, "fit", fits)), ["c", "a", "d", "b"], "fit first, then strength");
  assert.deepEqual(ids(J.sortJobs(rows, "fit")), ["b", "d", "c", "a"], "fit without fits is best");
  assert.deepEqual(ids(J.sortJobs(rows, "company")), ["b", "d", "c", "a"]);
  assert.deepEqual(ids(rows), ["a", "b", "c", "d"], "the input is not reordered");
  assert.deepEqual(ids(J.sortJobs(rows, "best", new Map(Object.entries(fits)))), ["b", "c", "a", "d"], "a Map of fits works too");
});

// A student: a listing's age matters most for new-grad roles. Newest orders by the board's posting date, else the day
// our scrape first saw the posting; the undated go last, and a tie keeps the best order.
test("newest: the posting date, else the first-seen day, newest first; undated last; a tie in the best order", () => {
  const rows = [
    row("none", { strength: 9 }),
    row("seen", { first_seen: "2026-11-05", strength: 1 }),
    row("old", { posted: "2026-09-01", first_seen: "2026-11-06", strength: 1 }),
    row("new", { posted: "2026-11-03", strength: 1 }),
    row("tieB", { posted: "2026-10-10", strength: 1, company: "Bain" }),
    row("tieA", { posted: "2026-10-10", strength: 1, company: "Acme" }),
    row("tieS", { posted: "2026-10-10", strength: 3, company: "Zed" }),
  ];
  assert.deepEqual(ids(J.sortJobs(rows, "newest")), ["seen", "new", "tieS", "tieA", "tieB", "old", "none"],
    "posted beats first_seen on the same row (old is 1 Sep though first seen 6 Nov); within a day, strength then company");
  assert.deepEqual(J.dateOf(rows[2]), { date: "2026-09-01", kind: "posted" });
  assert.deepEqual(J.dateOf(rows[1]), { date: "2026-11-05", kind: "listed" });
  assert.equal(J.dateOf(rows[0]), null);
});

test("the date line says Posted for the board's date and Listed here for first_seen, with the year only when it is not this one", () => {
  const now = new Date(2026, 10, 7);
  assert.equal(J.dateLine(row("a", { posted: "2026-11-03", first_seen: "2026-11-05" }), now), "Posted 3 Nov");
  assert.equal(J.dateLine(row("b", { first_seen: "2026-11-05" }), now), "Listed here 5 Nov", "first_seen is never called a posting date");
  assert.equal(J.dateLine(row("c", { posted: "2025-11-03" }), now), "Posted 3 Nov 2025");
  assert.equal(J.dateLine(row("d"), now), "", "no date, no line");
  assert.equal(J.dayLabel("2026-09-30", now), "30 Sep");
  assert.equal(J.dayLabel("", now), "");
});

// B-03 (usability pass 2026-11-06), the Fit sort put Staff and Principal postings first for a new graduate: it ranked by
// the count N, so a long posting won. The owner's decision 3a: the share N / max(M, floor).
test("fit sorts by the share of the posting's skills, so a long senior posting does not beat a short entry one", () => {
  const rows = [
    { id: "staff", strength: 1, company: "Acme", title: "Staff Product Manager" },
    { id: "entry", strength: 1, company: "Zed", title: "Associate Product Manager" },
  ];
  // the auditor's case: 21 of the 52 skills (a share of 0.40) against 9 of the 12 (9 of the floor's 15, 0.60)
  const fits = { staff: { n: 21, m: 52 }, entry: { n: 9, m: 12 } };
  assert.deepEqual(ids(J.sortJobs(rows, "fit", fits)), ["entry", "staff"]);
  assert.deepEqual(ids(J.sortJobs(rows, "best", fits)), ["entry", "staff"], "Best match uses the same share inside a strength tie");
  assert.equal(J.fitLine(fits.staff), "21 of the 52 skills this posting asks for are on your résumé.", "the card still says N of M");
});

test("the floor: a posting that asks for fewer skills than the floor counts as if it asked for the floor", () => {
  assert.equal(J.FIT_FLOOR, 15);
  const row = (id, company) => ({ id, strength: 1, company, title: "PM" });
  const rows = [row("thin", "Acme"), row("full", "Bcd"), row("floor", "Cde"), row("none", "Def")];
  // thin: 2 of 2 is 2 of 15 (0.13); full: 12 of 20 (0.60); floor: 9 of 15 (0.60), equal to full, so company A–Z
  const fits = { thin: { n: 2, m: 2 }, full: { n: 12, m: 20 }, floor: { n: 9, m: 15 }, none: { n: 0, m: 4 } };
  assert.deepEqual(ids(J.sortJobs(rows, "fit", fits)), ["full", "floor", "thin", "none"], "a 2-of-2 posting does not top the list");
  assert.equal(J.fitShare({ n: 2, m: 2 }), 2 / 15, "under the floor: N over the floor");
  assert.equal(J.fitShare({ n: 12, m: 20 }), 12 / 20, "over the floor: N over M");
  assert.equal(J.fitShare({ n: 0, m: 0 }), 0, "a posting with no skills shares nothing");
  // an equal share then goes to the strength, then the stable order
  const strong = [{ id: "a", strength: 1, company: "Acme", title: "A" }, { id: "b", strength: 3, company: "Zed", title: "B" }];
  assert.deepEqual(ids(J.sortJobs(strong, "fit", { a: { n: 3, m: 10 }, b: { n: 3, m: 15 } })), ["b", "a"], "3 of 10 and 3 of 15 tie; strength decides");
});

// B-32 (usability pass 2026-11-06), some job cards left the field out of the facts line: the MBA set's
// product_manager and product_strategy have no field in the index. The facts line now names one on every card.
test("the card's facts line always names a field: the data's, or a plain stand-in", () => {
  const withField = { roleName: r => "Product Manager", fieldName: r => r.role === "product_manager" ? "" : "Product" };
  assert.deepEqual(J.cardFacts(ROWS[0], withField), ["Product", "Product Manager", "San Jose, CA"]);
  assert.deepEqual(J.cardFacts({ ...ROWS[0], role: "product_manager" }, withField), ["Other field", "Product Manager", "San Jose, CA"], "no field in the data: the stand-in");
  assert.deepEqual(J.cardFacts(ROWS[0], withField, "San Jose…"), ["Product", "Product Manager", "San Jose…"], "the card's cut location");
  assert.equal(J.cardFacts(ROWS[0], {})[0], "Other field", "a ctx with no fieldName still gives a field");
});

// ---------- the dedupe ----------
test("same title, company and location is one posting, with a count of the rest", () => {
  const rows = [row("x1"), row("x2", { title: "consultant " }), row("x3", { location: "Chicago, IL" }), row("x4"), row("x5", { company: "Bain" })];
  const d = J.dedupe(rows);
  assert.deepEqual(ids(d.rows), ["x1", "x3", "x5"]);
  assert.deepEqual(d.dupes, { x1: 2 });
});

// ---------- the page ----------
test("fifty a page, clamped, with the count line's numbers", () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({ id: "r" + i }));
  assert.deepEqual(J.pageOf(rows, 1).rows.length, 50);
  const p3 = J.pageOf(rows, 3);
  assert.equal(p3.from, 101); assert.equal(p3.to, 120); assert.equal(p3.total, 120); assert.equal(p3.pages, 3); assert.equal(p3.page, 3);
  assert.equal(J.pageOf(rows, 9).page, 3, "a page past the end is the last page");
  assert.equal(J.pageOf(rows, 0).page, 1);
  assert.deepEqual(J.pageOf([], 1), { rows: [], from: 0, to: 0, total: 0, pages: 1, page: 1 });
  assert.equal(J.pageOf(rows, 2, 100).rows.length, 20, "a size of its own");
  assert.equal(J.PAGE, 50);
});

// ---------- the hash ----------
// the sort a person starts on (owner, 2026-11-08): Newest without a résumé, Fit with one, and Newest second in the menu
test("the default sort is Newest without a résumé and Fit with one; the menu lists Newest second", () => {
  assert.equal(J.defaultSort(null), "newest");
  assert.equal(J.defaultSort(new Set(["sql"])), "fit");
  assert.deepEqual(J.sortChoices(new Set(["sql"])), ["fit", "newest", "best", "company"]);
  assert.deepEqual(J.sortChoices(null), ["newest", "best", "company"], "no Fit to offer without a résumé");
  // the default of the person reading stays out of the link; the other one is a choice and stays in it
  assert.equal(J.parseState("q=pm").sort, "newest");
  assert.equal(J.parseState("q=pm", "fit").sort, "fit");
  assert.equal(J.parseState("sort=oldest", "fit").sort, "fit", "an unknown sort is that person's default");
  assert.equal(J.stateQuery({ ...J.blankState("fit"), q: "pm" }, "fit"), "q=pm");
  assert.equal(J.stateQuery({ ...J.blankState("fit"), sort: "newest" }, "fit"), "sort=newest", "with a résumé, Newest is a choice");
  assert.equal(J.stateQuery({ ...J.blankState(), sort: "fit" }), "sort=fit");
  assert.equal(J.parseState("sort=best", "fit").sort, "best", "an old link's Best match still opens on it");
});

test("the state round-trips through the query string; defaults stay out", () => {
  assert.equal(J.stateQuery(J.blankState()), "");
  assert.deepEqual(J.parseState(""), J.blankState());
  const s = { ...J.blankState(), q: "product manager", field: "product", level: "mid", sort: "fit", open: "m1879", remote: true, page: 3, loc: "new york" };
  const q = J.stateQuery(s);
  assert.equal(q, "q=product+manager&field=product&level=mid&loc=new+york&remote=1&sort=fit&page=3&open=m1879");
  assert.deepEqual(J.parseState(q), s);
  assert.deepEqual(J.parseState("#/jobs?" + q), s, "a full hash reads the same");
  assert.deepEqual(J.parseState("?" + q), s);
  assert.equal(J.stateQuery({ sort: "newest", page: 1, remote: false, sponsor: "" }), "", "newest and page 1 are the defaults");
  assert.equal(J.parseState("sort=oldest").sort, "newest", "an unknown sort is the default");
  assert.equal(J.stateQuery({ ...J.blankState(), sort: "best" }), "sort=best");
  assert.equal(J.parseState(J.stateQuery({ ...J.blankState(), sort: "newest" })).sort, "newest", "newest round-trips");
  assert.equal(J.parseState("page=abc").page, 1);
  assert.equal(J.parseState("page=-2").page, 1);
  assert.equal(J.stateQuery({ company: "Goldman Sachs & Co" }), "company=Goldman+Sachs+%26+Co");
  assert.deepEqual(J.filterOf(s), { field: "product", role: "", level: "mid", entry: "", years: "", sector: "", location: "new york", remote: true, sponsor: "", noclear: false, group: "", company: "" });
  const t = { ...J.blankState(), years: "5", sector: "Health Care", noclear: true };
  assert.equal(J.stateQuery(t), "years=5&sector=Health+Care&noclear=1");
  assert.deepEqual(J.parseState(J.stateQuery(t)), t, "the years, the industry and the clearance filter round-trip");
  assert.ok(J.isFiltered(J.filterOf(s)) && !J.isFiltered(J.filterOf(J.blankState())));
});

// Two students (2026-11-08): the sponsorship filter was hard to find, and the jobs for new graduates should stand out.
// sponsor is a string now and entry has new values; the links people already have keep working.
test("sponsor and entry: the new values round-trip, and old links read as their new values", () => {
  assert.equal(J.parseState("sponsor=1").sponsor, "yes", "an old link's switch is Says it sponsors");
  assert.equal(J.parseState("sponsor=true").sponsor, "yes");
  assert.equal(J.parseState("sponsor=open").sponsor, "open");
  assert.equal(J.parseState("sponsor=maybe").sponsor, "", "an unknown value is off");
  assert.equal(J.parseState("entry=bachelor").entry, "grads", "Bachelor's entry became New graduates");
  assert.equal(J.parseState("entry=pre_mba").entry, "grads");
  for (const sponsor of J.SPONSOR) for (const entry of J.ENTRY_IDS) {
    const s = { ...J.blankState(), sponsor, entry };
    assert.equal(J.stateQuery(s), `entry=${entry}&sponsor=${sponsor}`);
    assert.deepEqual(J.parseState(J.stateQuery(s)), s, `${entry} and ${sponsor} round-trip`);
    assert.deepEqual([J.filterOf(s).sponsor, J.filterOf(s).entry], [sponsor, entry]);
  }
  assert.equal(J.filterOf({ ...J.blankState(), sponsor: true }).sponsor, "", "the filter takes only the two values");
});

test("New graduates holds every set's mark and the title's; Starts {year} or later counts from the file's year", () => {
  const R = [
    row("g1", { set: "product", role: "product.pm", title: "Associate Product Manager, New Grad (2027 Start)", grad: true, start: 2027 }),
    row("g2", { entry: "pre_mba" }),
    row("g3", { set: "tech", entry: "grad", title: "Software Engineer, New Grad 2026", grad: true, start: 2026 }),
    row("g4", { entry: "mba", title: "2028 MBA University Graduate - Strategy", grad: true, start: 2028 }),
    row("g5", { intern: true, title: "Summer 2027 Intern" }),
    row("g6", {}),
  ];
  const f = (entry, year) => ids(J.filterJobs(R, { entry }, { year }));
  assert.deepEqual(f("grads", 2026), ["g1", "g2", "g3", "g4"]);
  assert.deepEqual(f("mba", 2026), ["g4"]);
  assert.deepEqual(f("intern", 2026), ["g5"]);
  assert.deepEqual(f("later", 2026), ["g1", "g4"], "a start after the file's year; 2026 is not later");
  assert.deepEqual(f("later", 2027), ["g4"]);
  assert.deepEqual(J.ENTRIES(2026).map(([id]) => id), J.ENTRY_IDS);
  assert.deepEqual(J.ENTRIES(2026).map(([, l]) => l), ["New graduates", "MBA entry", "Internship", "Starts 2027 or later"]);
  assert.deepEqual(J.facetCounts(R, {}, "entry", J.ENTRY_IDS, { year: 2026 }), { grads: 4, mba: 1, intern: 1, later: 2 });
});

// ---------- the level words ----------
test("the four level words, and every level id of the three sets maps to one", () => {
  assert.deepEqual(J.LEVEL_WORDS.labels.map(([, l]) => l), ["Analyst or associate", "Manager", "Lead or principal", "Director"]);
  const four = new Set(J.LEVEL_WORDS.labels.map(([id]) => id));
  for (const set of ["product", "mba", "tech"]) for (const [id, word] of Object.entries(J.LEVEL_WORDS[set])) assert.ok(four.has(word), `${set} ${id} -> ${word}`);
  assert.equal(J.levelLabel(row("x", { level: "senior" })), "Manager");
  assert.equal(J.levelLabel(row("x", { level: "cpo", set: "product" })), "Director");
  // the tech set's cards use its own four words on the same ids: an Engineer II is not a manager
  assert.equal(J.levelLabel(row("x", { level: "mid", set: "tech" })), "Mid-level or senior");
  assert.equal(J.levelLabel(row("x", { level: "associate", set: "tech" })), "New grad or junior");
  assert.deepEqual(J.levelLabels("tech").map(([id]) => id), J.levelLabels("mba").map(([id]) => id), "the same four ids, so the Level filter's value holds across fields");
});

// ---------- the file shape ----------
test("rowsOf expands the column-oriented file into the row objects the other functions take", () => {
  const file = {
    skill_ids: SKILLS, levels: { product: ["associate", "mid"], mba: ["associate", "mid", "senior"] },
    companies: [{ name: "Acme", group: "fortune50", sector: "Consulting", url_prefix: "https://acme.test/jobs/" }, { name: "Adobe", group: "fortune250", sector: null, url_prefix: "" }],
    locations: ["New York, NY", "Remote - USA"], roles: ["management_consultant", "product.pm"], titles: ["Consultant", "Director of Product"],
    rows: [
      [7, 0, 0, 0, 2, 0, 1 | 8 | 32, [0, 1], "123", null, 5, "2026-10-28"],
      [3, 1, 1, 1, 1, 1, 4 | 128, [3], "https://adobe.test/x", "2026-10-01", null],
      [9, 0, 0, 0, 0, 0, 1 | 2 | 16 | 64, [], "", null],
      [11, 1, 1, 1, 0, 1, 1024, [], "y", null, null, null, 2027],
    ],
  };
  const rows = J.rowsOf(file);
  assert.deepEqual(rows[0], { id: "m7", set: "mba", role: "management_consultant", title: "Consultant", company: "Acme", group: "fortune50", sector: "Consulting", level: "senior", entry: "mba", intern: false, location: "New York, NY", remote: false, sponsorship: "yes", url: "https://acme.test/jobs/123", skills: [0, 1], first_seen: null, yoe: 5, clearance: false, posted: "2026-10-28", grad: false, start: null });
  assert.deepEqual(rows[1], { id: "p3", set: "product", role: "product.pm", title: "Director of Product", company: "Adobe", group: "fortune250", sector: null, level: "mid", entry: null, intern: false, location: "Remote - USA", remote: true, sponsorship: null, url: "https://adobe.test/x", skills: [3], first_seen: "2026-10-01", yoe: null, clearance: true, posted: null, grad: false, start: null });
  assert.deepEqual(rows[2], { id: "m9", set: "mba", role: "management_consultant", title: "Consultant", company: "Acme", group: "fortune50", sector: "Consulting", level: "associate", entry: "pre_mba", intern: true, location: "New York, NY", remote: false, sponsorship: "no", url: "https://acme.test/jobs/", skills: [], first_seen: null, yoe: null, clearance: false, posted: null, grad: false, start: null });
  assert.equal(rows[3].id, "p11"); assert.equal(rows[3].grad, true); assert.equal(rows[3].start, 2027); assert.equal(rows[3].entry, null, "the title's mark is not an entry mark");
  assert.deepEqual(J.rowsOf({}), []);
  assert.deepEqual(Object.keys(J.FLAGS), ["mba", "intern", "remote", "entry_mba", "entry_pre_mba", "sponsor_yes", "sponsor_no", "clearance", "tech", "entry_grad", "grad_title"]);
});

// A student searching "ML engineer new grad": the tech set's rows carry their own set bit (256) and new-graduate bit
// (512), so they read as set tech, id t<num>, role tech.<family> and entry "grad", and the Bachelor's entry facet finds them.
test("rowsOf reads the tech set's bits: set tech, id t<num>, the grad entry, the level from levels.tech", () => {
  const file = {
    levels: { product: ["associate", "mid"], mba: ["associate", "mid"], tech: ["associate", "mid", "senior"] },
    companies: [{ name: "Acme", group: "startup", sector: "Technology", url_prefix: "https://acme.test/" }],
    locations: ["Austin, TX"], roles: ["tech.ml_engineer", "tech.software_engineer"], titles: ["Machine Learning Engineer, New Grad", "Senior Software Engineer"],
    rows: [
      [12, 0, 0, 0, 0, 0, 256 | 512, [1], "a", "2026-11-05", null, "2026-11-01"],
      [40, 0, 1, 1, 2, 0, 256 | 4, [], "b", null, 5, null],
    ],
  };
  const [grad, senior] = J.rowsOf(file);
  assert.deepEqual(grad, { id: "t12", set: "tech", role: "tech.ml_engineer", title: "Machine Learning Engineer, New Grad", company: "Acme", group: "startup", sector: "Technology", level: "associate", entry: "grad", intern: false, location: "Austin, TX", remote: false, sponsorship: null, url: "https://acme.test/a", skills: [1], first_seen: "2026-11-05", yoe: null, clearance: false, posted: "2026-11-01", grad: false, start: null });
  assert.equal(senior.id, "t40"); assert.equal(senior.set, "tech"); assert.equal(senior.level, "senior"); assert.equal(senior.entry, null); assert.equal(senior.remote, true);
  assert.deepEqual(J.filterJobs([grad, senior], { entry: "grads" }, {}).map(r => r.id), ["t12"], "New graduates holds the tech set's new-graduate postings");
  assert.equal(J.filterJobs([grad, senior], { entry: "mba" }, {}).length, 0);
});

test("the tech set's eight levels fold to the same four ids, said in its own words", () => {
  assert.deepEqual(J.LEVEL_WORDS.tech, J.LEVEL_WORDS.mba);
  const w = level => J.levelWord({ set: "tech", level });
  assert.deepEqual(["associate", "mid", "senior", "staff", "group", "director", "vp", "cpo"].map(w), ["associate", "mid", "mid", "staff", "staff", "director", "director", "director"]);
  assert.equal(J.levelLabel({ set: "tech", level: "staff" }), J.LEVEL_WORDS.techLabels.find(([id]) => id === "staff")[1]);
  assert.notEqual(J.levelLabel({ set: "tech", level: "senior" }), J.levelLabel({ set: "mba", level: "senior" }), "a senior engineer is not called a manager");
});

// ---------- the real file ----------
test("web/data/jobs_open.json agrees with the indexes it was written from, and jobs_meta.json with it", () => {
  const D = readJson("jobs_open.json"), META = readJson("jobs_meta.json"), M = readJson("graph_mba.json"), G = readJson("graph.json"), T = readJson("graph_tech.json");
  assert.equal(D.country, M.meta.country);
  assert.equal(D.country, T.meta.country);
  const TECH_NS = "tech.", techFamily = id => id.slice(TECH_NS.length);
  assert.deepEqual(D.flags, J.FLAGS, "the file names the same bits jobs.js reads");
  for (const k of ["companies", "locations", "roles", "titles", "rows"]) assert.ok(Array.isArray(D[k]), `${k} is a list`);
  assert.equal(new Set(D.titles).size, D.titles.length, "titles are distinct");
  assert.equal(new Set(D.locations).size, D.locations.length, "locations are distinct");
  assert.equal(new Set(D.roles).size, D.roles.length, "roles are distinct");
  assert.deepEqual(Object.keys(D.role_labels), D.roles, "every role has its label, in the roles' order");
  for (const id of D.roles) assert.ok(typeof D.role_labels[id] === "string" && D.role_labels[id], `${id} has a label`);
  for (const id of D.roles) assert.equal(D.role_labels[id], id.startsWith(J.PRODUCT_NS) ? G.families[id.slice(J.PRODUCT_NS.length)] : id.startsWith(TECH_NS) ? T.roles[techFamily(id)].label : M.roles[id].label, `${id}: the label the index gives`);
  assert.equal(new Set(D.companies.map(c => c.name)).size, D.companies.length, "companies are distinct");
  for (const c of D.companies) { assert.equal(typeof c.name, "string"); assert.equal(typeof c.group, "string"); assert.equal(typeof c.url_prefix, "string"); assert.ok(c.url_prefix === "" || /^https?:\/\/.+\/$/.test(c.url_prefix), `${c.name}: url_prefix ${c.url_prefix}`); }
  for (const r of D.rows) {
    assert.equal(r.length, 13, "thirteen columns");
    assert.ok(r[12] === null || (Number.isInteger(r[12]) && r[12] >= 2026 && r[12] <= 2029), `start ${r[12]}`);
    assert.ok(r[12] === null || (r[6] & J.FLAGS.grad_title), `start ${r[12]} only on a title with the graduate mark`);
    assert.ok(!((r[6] & J.FLAGS.grad_title) && (r[6] & J.FLAGS.intern)), `flags ${r[6]}: an internship never carries the title's mark`);
    assert.ok(r[11] === null || (/^\d{4}-\d{2}-\d{2}$/.test(r[11]) && r[11] <= D.generated), `posted ${r[11]}`);
    assert.ok(r[9] === null || /^\d{4}-\d{2}-\d{2}$/.test(r[9]), `firstSeen ${r[9]}`);
    assert.ok(r[10] === null || (typeof r[10] === "number" && r[10] > 0 && r[10] < 40), `yoe ${r[10]}`);
    assert.ok(Number.isInteger(r[0]) && r[0] >= 0, `num ${r[0]}`);
    assert.ok(D.companies[r[1]], `company index ${r[1]}`); assert.ok(D.roles[r[2]], `role index ${r[2]}`); assert.ok(D.titles[r[3]] != null, `title index ${r[3]}`); assert.ok(D.locations[r[5]] != null, `location index ${r[5]}`);
    assert.ok(Number.isInteger(r[6]) && r[6] >= 0 && r[6] < 2048, `flags ${r[6]}`);
    assert.ok(!((r[6] & J.FLAGS.mba) && (r[6] & J.FLAGS.tech)), `flags ${r[6]}: one set`);
    assert.equal(typeof r[8], "string");
  }
  const jobs = J.rowsOf(D);
  assert.equal(jobs.length, META.n_open, "the meta count is the row count");
  assert.equal(META.n_companies, new Set(jobs.map(j => j.company)).size);
  assert.equal(META.by_set.product.n_open + META.by_set.mba.n_open + META.by_set.tech.n_open, META.n_open);
  assert.equal(META.by_set.mba.n_open, M.meta.n_open, "the MBA rows are the index's open US postings");
  const techOpen = fs.readdirSync(path.join(web, "data", "graph_tech")).filter(f => f.endsWith(".json") && !f.startsWith("_"))
    .reduce((a, f) => a + readJson(path.join("graph_tech", f)).jobs.filter(j => j.open !== false && j.country === T.meta.country).length, 0);
  assert.equal(META.by_set.tech.n_open, techOpen, "the tech rows are the open US rows of graph_tech/<role>.json");
  const rest = jobs.filter(j => j.set !== "tech");
  assert.deepEqual(META.without_tech, { n_open: rest.length, n_companies: new Set(rest.map(j => j.company)).size }, "the counts a site without the tech set shows");
  assert.equal(META.by_set.product.n_open, G.jobs.filter(j => j.country === D.country).length, "the product rows are the US slice");
  assert.equal(META.n_roles, new Set(jobs.map(j => j.role)).size);
  assert.deepEqual(D.skill_ids, [...new Set([...G.skill_ids, ...M.skill_ids, ...T.skill_ids])].sort(), "the union of the three sets' skill ids");
  assert.deepEqual(D.levels, { product: G.levels, mba: M.levels, tech: T.levels });
  assert.deepEqual(D.level_labels, { product: G.level_labels, mba: M.level_labels, tech: T.level_labels });
  const levels = { product: new Set(G.levels), mba: new Set(M.levels), tech: new Set(T.levels) }, roles = new Set(Object.keys(M.roles)), seen = new Set();
  for (const set of ["product", "mba", "tech"]) for (const id of D.levels[set]) assert.ok(J.LEVEL_WORDS[set][id], `${set} level ${id} has a level word`);
  const byProduct = new Map(G.jobs.map(j => [j.id, j]));
  const cluster = Object.fromEntries([...G.skills, ...M.skills, ...T.skills].map(s => [s.id, s.cluster]));
  const definingOf = role => new Set((role.startsWith(TECH_NS) ? (T.roles[techFamily(role)] || {}).defining : (M.roles[role] || {}).defining || []).map(a => a.id));
  const keeps = (set, role, id) => cluster[id] !== "credentials" && (cluster[id] !== "domain" || (set !== "product" && definingOf(role).has(id)));
  for (const j of jobs) {
    assert.ok(!seen.has(j.id), `duplicate id ${j.id}`); seen.add(j.id);
    assert.ok((j.set === "product" && j.id[0] === "p") || (j.set === "mba" && j.id[0] === "m") || (j.set === "tech" && j.id[0] === "t"), `${j.id}: set ${j.set}`);
    if (j.set === "product") assert.ok(j.role.startsWith(J.PRODUCT_NS) && G.families[j.role.slice(J.PRODUCT_NS.length)], `${j.id}: role ${j.role}`);
    else if (j.set === "tech") assert.ok(j.role.startsWith(TECH_NS) && T.roles[techFamily(j.role)], `${j.id}: role ${j.role}`);
    else assert.ok(roles.has(j.role), `${j.id}: role ${j.role}`);
    assert.ok(levels[j.set].has(j.level), `${j.id}: level ${j.level}`);
    assert.ok(typeof j.title === "string" && j.title, `${j.id}: title`);
    assert.ok(/^https?:\/\//.test(j.url), `${j.id}: url ${j.url}`);
    for (const i of j.skills) assert.ok(Number.isInteger(i) && i >= 0 && i < D.skill_ids.length, `${j.id}: skill index ${i}`);
    assert.ok(!("snippet" in j) && !("sub" in j) && !("country" in j), `${j.id} carries a field the file leaves out`);
    for (const i of j.skills) { const c = cluster[D.skill_ids[i]]; assert.ok(c !== "credentials", `${j.id}: a credential ${D.skill_ids[i]} is not a skill`); if (c === "domain") assert.ok(j.set !== "product" && definingOf(j.role).has(D.skill_ids[i]), `${j.id}: industry ${D.skill_ids[i]} kept though it does not define ${j.role}`); }
    assert.equal(typeof j.remote, "boolean"); assert.equal(typeof j.intern, "boolean");
    if (j.set === "product") assert.equal(j.entry, null);
    assert.equal(j.entry === "grad", j.set === "tech" && j.entry !== null, `${j.id}: entry ${j.entry}: grad is the tech set's mark, and its only one`);
  }
  assert.ok(jobs.some(j => j.entry === "grad"), "the tech set's new-graduate postings are marked");
  for (const set of ["product", "mba", "tech"]) assert.ok(jobs.some(j => j.set === set && j.grad), `the ${set} set has titles with the graduate mark`);
  assert.ok(jobs.some(j => j.start != null && j.start > Number(D.generated.slice(0, 4))), "some graduate titles start after the file's year");
  // a sample of product rows reads back exactly what graph.json says
  for (const j of jobs.filter(x => x.set === "product").filter((x, i) => i % 500 === 0)) {
    const g = byProduct.get(Number(j.id.slice(1)));
    assert.ok(g, `${j.id} is in graph.json`);
    assert.equal(j.title, g.title); assert.equal(j.company, g.company); assert.equal(j.url, g.url); assert.equal(j.level, g.level); assert.equal(j.location, g.location || ""); assert.equal(j.remote, !!g.remote);
    assert.deepEqual(j.skills.map(i => D.skill_ids[i]).sort(), g.skills.map(i => G.skill_ids[i]).filter(id => keeps("product", j.role, id)).sort());
    assert.equal(j.yoe, g.yoe == null ? null : g.yoe); assert.equal(j.clearance, g.skills.some(i => G.skill_ids[i] === "security_clearance"));
  }
  // a sample of tech rows reads back what its role file says
  const techFiles = new Map();
  for (const j of jobs.filter(x => x.set === "tech").filter((x, i) => i % 500 === 0)) {
    const f = techFamily(j.role);
    if (!techFiles.has(f)) techFiles.set(f, new Map(readJson(path.join("graph_tech", f + ".json")).jobs.map(x => [x.id, x])));
    const g = techFiles.get(f).get(Number(j.id.slice(1)));
    assert.ok(g, `${j.id} is in graph_tech/${f}.json`);
    assert.equal(j.title, g.title); assert.equal(j.company, g.company); assert.equal(j.url, g.url); assert.equal(j.level, g.level); assert.equal(j.entry, g.entry === "grad" ? "grad" : null); assert.equal(j.posted, g.posted || null);
    assert.deepEqual(j.skills.map(i => D.skill_ids[i]).sort(), g.skills.map(i => T.skill_ids[i]).filter(id => keeps("tech", j.role, id)).sort());
  }
});

// ---------- the years, the industry and the clearance (skills audit, 2026-11-06) ----------
test("years keeps postings that ask that many or fewer, or name none; industry is the employer's sector; noclear drops clearance asks", () => {
  const R = [row("a", { yoe: 2 }), row("b", { yoe: 5, sector: "Health Care" }), row("c", { yoe: null, clearance: true }), row("d", { yoe: 8, sector: "Health Care" })];
  const f = o => J.filterJobs(R, o, {}).map(r => r.id);
  assert.deepEqual(f({ years: "2" }), ["a", "c"], "a posting that names no years counts");
  assert.deepEqual(f({ years: "5" }), ["a", "b", "c"]);
  assert.deepEqual(f({ years: "8" }), ["a", "b", "c", "d"]);
  assert.deepEqual(f({ sector: "Health Care" }), ["b", "d"]);
  assert.deepEqual(f({ noclear: true }), ["a", "b", "d"]);
  assert.deepEqual(J.facetCounts(R, { sector: "Health Care" }, "years", J.YEARS.map(([v]) => v), {}), { 2: 0, 5: 1, 8: 2 });
  assert.deepEqual(J.YEARS.map(([v]) => v), ["2", "5", "8"]);
  assert.ok(J.isFiltered({ years: "5" }) && J.isFiltered({ noclear: true }) && J.isFiltered({ sector: "Retail" }));
});

// ---------- the short forms on the real file (2026-11-08) ----------
test("on the real file, the short forms find the jobs they stand for", () => {
  const D = readJson("jobs_open.json"), names = {};
  for (const f of ["graph.json", "graph_mba.json", "graph_tech.json"]) for (const sk of readJson(f).skills) names[sk.id] ||= sk.name;
  const jobs = J.rowsOf(D), rctx = { roleName: r => D.role_labels[r.role] || "", skillNames: r => r.skills.map(i => names[D.skill_ids[i]] || D.skill_ids[i]) };
  const product = id => id.startsWith(J.PRODUCT_NS) || id === "product_manager" || id === "product_strategy" || id === "pmm";
  const cases = [["MLE new grad", id => id === "tech.ml_engineer"], ["machine learning engineer", id => id === "tech.ml_engineer"], ["PM new grad", product], ["SWE", id => id === "tech.software_engineer"], ["APM", product]];
  for (const [q, want] of cases) {
    const found = J.searchJobsRelaxed(jobs, q, rctx), top = J.sortJobs(J.dedupe(found.rows).rows, "best");
    assert.ok(top.length, `${q}: no rows`);
    assert.ok(want(top[0].role), `${q}: ${found.rows.length} rows${found.relaxed ? " (all but one word)" : ""}; the top is ${top[0].role}, "${top[0].title}"`);
    assert.equal(found.relaxed, false, `${q}: ${found.rows.length} rows match every word`);
  }
});

// ---------- one field and one role per label (2026-11-08) ----------
// The Product filter left out the MBA set's product_manager and product_strategy postings: the index skips the MBA
// Product group, so the filter's fieldOf gave them no field while their cards said "Product". Jobs.fieldLookup is the
// one lookup the filter, the counts, the rail and the card read.
test("fieldLookup: every family of the MBA graph's Product group is in the Product field", async () => {
  const { realAtlas } = await import("./_load.mjs");
  const ix = await realAtlas().index(), M = readJson("graph_mba.json"), fieldOf = J.fieldLookup(ix);
  const fams = (M.groups.find(g => g.id === "product") || {}).families || [];
  assert.ok(fams.includes("product_manager") && fams.includes("product_strategy"), "the MBA Product group's families");
  for (const f of fams) assert.equal(fieldOf(f), "product", f);
  for (const g of M.groups) for (const f of g.families) assert.equal(fieldOf(f), g.id, `${f}: its group`);
  assert.equal(fieldOf("product.pm"), "product", "the product set by its namespace");
  assert.equal(fieldOf("no_such_role"), "", "a role nobody lists has no field");
});

test("on the real file, the Product filter keeps every product_manager and product_strategy posting, and every card that says Product", async () => {
  const { realAtlas } = await import("./_load.mjs");
  const ix = await realAtlas().index(), D = readJson("jobs_open.json"), rows = J.rowsOf(D);
  const fieldOf = J.fieldLookup(ix), rctx = { fieldOf, roleKey: J.roleKey(D), roleIds: D.roles };
  const kept = new Set(J.filterJobs(rows, { field: "product" }, rctx).map(r => r.id));
  const mbaProduct = rows.filter(r => r.role === "product_manager" || r.role === "product_strategy");
  assert.ok(mbaProduct.length > 0, "the file has MBA product postings");
  for (const r of mbaProduct) assert.ok(kept.has(r.id), `${r.id} (${r.role}) passes the Product filter`);
  // the card's field name reads the same lookup: a card that says Product passes the filter, and only those do
  const saysProduct = rows.filter(r => fieldOf(r.role) === "product");
  assert.equal(kept.size, saysProduct.length);
  for (const r of saysProduct) assert.ok(kept.has(r.id), `${r.id} says Product`);
  const fc = J.facetCounts(rows, {}, "field", ["product"], rctx);
  assert.equal(fc.product, saysProduct.length, "the Product facet counts them too");
});

test("roleKey: two ids that share a label filter as one role", () => {
  const D = { roles: ["product.pm", "product.pmm", "product_manager", "pmm", "fpa"], role_labels: { "product.pm": "Product Manager", "product.pmm": "Product Marketing Manager", product_manager: "Product Manager", pmm: "Product Marketing Manager", fpa: "FP&A" } };
  const key = J.roleKey(D);
  assert.equal(key("product_manager"), "product.pm", "the first id with the label is the key");
  assert.equal(key("product.pm"), "product.pm");
  assert.equal(key("pmm"), "product.pmm");
  assert.equal(key("fpa"), "fpa", "a label of its own: its own key");
  assert.equal(key("unlisted"), "unlisted");
  const FIELDS = { "product.pm": "product", product_manager: "product", "product.pmm": "product", pmm: "marketing", fpa: "finance" };
  const kctx = { fieldOf: id => FIELDS[id] || "", roleKey: key, roleIds: D.roles };
  const R = [row("x1", { role: "product.pm" }), row("x2", { role: "product_manager" }), row("x3", { role: "pmm" }), row("x4", { role: "product.pmm" }), row("x5", { role: "fpa" })];
  const f = filt => ids(J.filterJobs(R, filt, kctx));
  assert.deepEqual(f({ role: "product.pm" }), ["x1", "x2"]);
  assert.deepEqual(f({ role: "product_manager" }), ["x1", "x2"], "either id filters as the key");
  assert.deepEqual(f({ role: "pmm" }), ["x3", "x4"]);
  assert.deepEqual(f({ role: "product.pmm", field: "marketing" }), ["x3"], "the field still cuts the key's ids");
  assert.deepEqual(J.facetCounts(R, {}, "role", ["product.pm", "product.pmm", "fpa"], kctx), { "product.pm": 2, "product.pmm": 2, fpa: 1 }, "one count per key, both ids' postings");
  assert.equal(J.roleInField("product.pmm", "marketing", kctx), true, "a key is in each field one of its ids is in");
  assert.equal(J.roleInField("product.pm", "marketing", kctx), false);
  assert.deepEqual(J.facetCounts(R, { role: "product.pmm" }, "field", ["marketing", "finance"], kctx), { marketing: 1, finance: 1 }, "a field the key is not in drops the role");
  assert.deepEqual(f({ role: "x" }), [], "without a key a role is itself");
  assert.deepEqual(ids(J.filterJobs(R, { role: "product_manager" }, { fieldOf: kctx.fieldOf })), ["x2"], "a ctx without roleKey compares ids");
});
