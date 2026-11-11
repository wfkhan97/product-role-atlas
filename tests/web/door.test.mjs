// web/app.js Door: the pure table behind the door (#/) and home (#/home), v19 B2. The campus flags and the roster gate
// (2026-11-04: any @cornell.edu address; IE New York by its domain once its roster loads), the route after
// the door, the bounce of a deep link, the four cards with their data-built lines, and the copy's rules: no "sign in",
// "cohort", "paid" or "apply", none of the five banned words, and no sentence over 20 words.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web } from "./_load.mjs";
import { OWNER_WORDS } from "../../evals/copy_lib.mjs";

const { Door, You, parseRoute } = require(path.join(web, "app.js"));
const Catalog = require(path.join(web, "catalog.js"))({});
// the flag table as web/config.js holds it (CAMPUS_DOMAINS), with a stand-in IE domain, and the campus list as
// Catalog.campuses() gives it: Cornell Tech's roster loaded, IE New York listed (its switch on) with none
const DOMAINS = { cornell: ["cornell.edu"], ienyc: ["ie-test.edu"] };
const CAMPUSES = [{ id: "cornell_tech", flag: "cornell", catalog: true }, { id: "ienyc", flag: "ienyc", catalog: false }];
const IE_LOADED = [CAMPUSES[0], { ...CAMPUSES[1], catalog: true }];
const Doors = require(path.join(web, "doors.js"))({ config: () => ({ TALLY: { door: "wDoor1", intake: null } }) });

test("the flag table: config.js holds cornell and ienyc, cornell.edu under cornell; every sp27 campus names a flag of it", async () => {
  const vm = await import("node:vm"), fs = await import("node:fs");
  const box = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(web, "config.js"), "utf8"), box);
  const T = box.window.CONFIG.CAMPUS_DOMAINS;
  assert.deepEqual(Object.keys(T), ["cornell", "ienyc"]);
  assert.deepEqual([...T.cornell], ["cornell.edu"]);
  assert.deepEqual([...T.ienyc], ["student.ie.edu", "ie.edu"], "the IE student and staff domains (owner, 2026-11-04)");
  assert.equal(Door.campus("someone@student.ie.edu", T), "ienyc");
  assert.equal(Door.campus("someone@IE.edu", T), "ienyc");
  const file = JSON.parse(fs.readFileSync(path.join(web, "data", "sp27_campus.json"), "utf8"));
  assert.deepEqual(file.campuses.map(c => [c.id, c.flag]), [["cornell_tech", "cornell"], ["ienyc", "ienyc"]]);
  for (const c of file.campuses) assert.ok(Object.hasOwn(T, c.flag), `${c.id}: its flag is in the table`);
  assert.equal(Door.campus("ab1@ie-test.edu", { ...T, ienyc: [] }), null, "the empty IE list: no address is ienyc");
});

test("Door.campus: the flag whose list holds the whole domain, any case, spaces around ignored; else null", () => {
  for (const e of ["wk332@cornell.edu", "john.smith@cornell.edu", "WK332@Cornell.EDU", "  ab1@cornell.edu  ", "wk-332@cornell.edu", "abcd12345@cornell.edu"]) assert.equal(Door.campus(e, DOMAINS), "cornell", e);
  assert.equal(Door.campus("someone@IE-test.edu", DOMAINS), "ienyc");
  for (const e of ["wk332@alumni.cornell.edu", "wk332@gmail.com", "", null, undefined, "cornell.edu", "@cornell.edu", "wk332@", "wk332@cornell.edu.evil.com", "wk332@cornell.edu x", "a@b@cornell.edu", "wk332@notcornell.edu"]) assert.equal(Door.campus(e, DOMAINS), null, JSON.stringify(e));
  assert.equal(Door.campus("wk332@cornell.edu"), null, "in node there is no config table: no campus");
  assert.equal(Door.campus("wk332@cornell.edu", {}), null);
});

test("Door.opens: any @cornell.edu address opens while Cornell Tech's roster is loaded; alumni, gmail and an IE address with no roster do not", () => {
  for (const e of ["wk332@cornell.edu", "john.smith@cornell.edu", "ub47@cornell.edu", "WK332@Cornell.EDU"]) assert.equal(Door.opens(e, DOMAINS, CAMPUSES), true, e);
  for (const e of ["wk332@alumni.cornell.edu", "wk332@gmail.com", "", null, "ab1@ie-test.edu"]) assert.equal(Door.opens(e, DOMAINS, CAMPUSES), false, JSON.stringify(e));
  assert.equal(Door.opens("ab1@ie-test.edu", DOMAINS, IE_LOADED), true, "the IE roster loaded and its switch on: an IE address opens");
  assert.equal(Door.opens("wk332@cornell.edu", DOMAINS, []), false, "no campus listed: nothing opens");
  assert.equal(Door.opens("wk332@cornell.edu", DOMAINS, [{ id: "cornell_tech", flag: "cornell", catalog: false }]), false, "a listed campus with no roster opens nothing");
  assert.equal(Door.rosterOf("cornell", CAMPUSES).id, "cornell_tech");
  assert.equal(Door.rosterOf("ienyc", CAMPUSES), null);
  assert.equal(Door.rosterOf(null, CAMPUSES), null);
});

test("Catalog.campusFor prefers the flag's campus with a roster, over a stored choice", () => {
  const list = [{ id: "cornell_tech", flag: "cornell", catalog: true, programs: [] }, { id: "ienyc", flag: "ienyc", catalog: true, programs: [] }];
  assert.equal(Catalog.campusFor(list, { flag: "ienyc", stored: "cornell_tech" }).id, "ienyc");
  assert.equal(Catalog.campusFor(list, { flag: "cornell", stored: "ienyc" }).id, "cornell_tech");
  const ieClosed = [list[0], { ...list[1], catalog: false }];
  assert.equal(Catalog.campusFor(ieClosed, { flag: "ienyc", stored: "ienyc" }).id, "ienyc", "no roster for the flag: the rules before it apply");
  assert.equal(Catalog.campusFor(list, { flag: null, stored: "ienyc" }).id, "ienyc");
});

test("Door.next: the deep link the person arrived on, unless it is the door itself", () => {
  assert.equal(Door.next("#/explore"), "#/explore");
  assert.equal(Door.next("#/role/pm/fit?x=1"), "#/role/pm/fit?x=1");
  for (const t of ["#/", "#", "", undefined, null]) assert.equal(Door.next(t), "#/home", JSON.stringify(t));
});

test("Door.bounce: any route but the door goes to the door first while door.seen is not set", () => {
  for (const h of ["#/home", "#/explore", "#/role/pm", "#/classes", "#/nope"]) { assert.equal(Door.bounce(h, false), true, h); assert.equal(Door.bounce(h, true), false, h); }
  for (const h of ["#/", "#", ""]) assert.equal(Door.bounce(h, false), false, JSON.stringify(h));
});

test("Door.verbs: four cards in order, Find classes open only for an address whose campus has a roster", () => {
  const counts = { nOpen: 25950, nCompanies: 1502, nRoles: 54 };
  const closed = Door.verbs("wk332@gmail.com", counts, DOMAINS, CAMPUSES), open = Door.verbs("john.smith@cornell.edu", counts, DOMAINS, CAMPUSES), none = Door.verbs("", counts, DOMAINS, CAMPUSES);
  assert.deepEqual(closed.map(v => v.title), ["Find jobs", "Explore careers", "Find classes", "Networking"]);
  assert.deepEqual(closed.map(v => v.href), ["#/jobs", "#/skills", "#/classes", "#/network"]);
  assert.deepEqual(closed.map(v => v.open), [true, true, false, true]);
  assert.deepEqual(none.map(v => v.open), [true, true, false, true]);
  assert.deepEqual(open.map(v => v.open), [true, true, true, true]);
  for (const v of closed) assert.ok(v.line && v.key, v.title);
  assert.deepEqual(Door.verbs("wk332@alumni.cornell.edu", counts, DOMAINS, CAMPUSES).map(v => v.open), [true, true, false, true]);
  assert.deepEqual(Door.verbs("ab1@ie-test.edu", counts, DOMAINS, CAMPUSES).map(v => v.open), [true, true, false, true], "IE's roster not loaded: no Find classes");
  assert.deepEqual(Door.verbs("ab1@ie-test.edu", counts, DOMAINS, IE_LOADED).map(v => v.open), [true, true, true, true]);
  // the screens draw the open cards alone: three for a visitor whose address opens nothing, never a grayed fourth
  assert.deepEqual(closed.filter(v => v.open).map(v => v.key), ["jobs", "skills", "network"]);
});

test("the jobs line carries its counts in words, rounded down (over 25 thousand, over 1,500); the roles line the exact count", () => {
  const [jobs, skills] = Door.verbs("", { nOpen: 25950, nCompanies: 1502, nRoles: 69 });
  assert.equal(jobs.line, "Search over 25 thousand open jobs in popular fields for grad students, from over 1,500 companies.");
  // the launcher and Explore say 69: home says 69 too, never "over 60" (2026-11-08)
  assert.equal(skills.line, "Explore 69 roles and see how your experience and skills match up.");
  // before the product set's roles are counted the line names no number, so no smaller one shows first
  assert.equal(Door.verbs("", { nOpen: 25950, nCompanies: 1502, nRoles: 0 })[1].line, "Explore every role and see how your experience and skills match up.");
  // a count under a thousand reads in hundreds, so the sentence never says "0 thousand"
  assert.equal(Door.verbs("", { nOpen: 950, nCompanies: 99, nRoles: 9 })[0].line, "Search over 900 open jobs in popular fields for grad students, from over 0 companies.");
  assert.equal(Door.thousands(31965), "31 thousand");
  assert.equal(Door.hundreds(1694), "1,600");
});

// every string of the copy and of the four lines, flattened
function strings(x, out = []) {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) x.forEach(v => strings(v, out));
  else if (x && typeof x === "object") Object.values(x).forEach(v => strings(v, out));
  return out;
}
const all = () => [...strings(Door.COPY), ...Door.verbs("", { nOpen: 25950, nCompanies: 1502, nRoles: 54 }).flatMap(v => [v.title, v.line])];
// the owner's own words on the door (evals/copy_lib.mjs OWNER_WORDS) are kept verbatim over the 20-word rule
const owners = new Set(Object.values(OWNER_WORDS["web/copy.js"]));

test("no string says sign in, log in, account, cohort, paid or apply, and none uses utilize, leverage, facilitate, via or in order to", () => {
  const banned = [/\bsign[ -]?in\b/i, /\blog[ -]?in\b/i, /\baccount\b/i, /\bcohort\b/i, /\bpaid\b/i, /\bapply\b/i, /\butili[sz]e/i, /\bleverage/i, /\bfacilitate/i, /\bvia\b/i, /\bin order to\b/i];
  for (const s of all()) for (const re of banned) assert.ok(!re.test(s), `${re} in "${s}"`);
});

test("no sentence runs over 20 words, but for the owner's own words", () => {
  assert.ok(owners.has(Door.COPY.inside) && owners.has(Door.COPY.intro[0]), "the door's inside line and first intro line are the owner's words");
  for (const s of all().filter(x => !owners.has(x))) for (const sentence of s.split(/[.!?]+/)) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    assert.ok(words.length <= 20, `${words.length} words: "${sentence.trim()}"`);
  }
});

test("the copy holds every string the two screens draw", () => {
  const C = Door.COPY;
  for (const k of ["heading", "intro", "inside", "email", "emailPlaceholder", "where", "pick", "school", "button", "skip", "privacy", "home", "bar"]) assert.ok(C[k] != null && C[k] !== "", k);
  for (const k of ["cornell", "closed", "closedLink", "closedAfter"]) assert.ok(!(k in C), `${k} is gone: no grayed card, no Cornell-only door line`);
  assert.ok(!/cornell|\bIE\b/i.test(C.school), "the door's school line names no campus");
  assert.ok(!/\{\w+\}/.test(C.inside), "the inside line has no slot left to fill");
  assert.equal(C.emailPlaceholder, "user@school.edu");
  assert.equal(C.skip, "Skip for now");
  assert.equal(C.intro.length, 2);
  // Build skills (the map's section, 2026-11-10) is not one of Door.verbs: Door.withBuild adds it (below)
  assert.deepEqual(Object.keys(C.bar), ["jobs", "skills", "build", "classes", "network"]);
  assert.equal(C.bar.build, "Build skills");
  assert.deepEqual(Door.verbs("", {}, null, []).map(v => v.key), ["jobs", "skills", "classes", "network"]);
});

test("Build skills joins the bar and the home cards after Explore careers", () => {
  const open = Door.verbs("", {}, null, []).filter(v => v.open);
  assert.deepEqual(Door.withBuild(open, false).map(v => v.key), ["jobs", "skills", "network"], "tree off: no card");
  const withB = Door.withBuild(open, true), b = withB[2];
  assert.deepEqual(withB.map(v => v.key), ["jobs", "skills", "build", "network"]);
  assert.equal(open.length, 3, "the list passed in is not changed");
  assert.equal(b.href, "#/map"); assert.equal(b.title, "Build skills");
  assert.match(b.line, /portfolio projects/); assert.match(b.line, /referrals\.$/);
  const inv = Door.withBuild(open, true, true)[2].line;
  assert.ok(inv.startsWith(b.line) && /by invite today\.$/.test(inv), inv);
  for (const s of inv.split(/(?<=\.)\s+/)) assert.ok(s.split(/\s+/).length <= 20, s);
  assert.ok(!/sign in/i.test(inv));
});

test("the Tally return: #/home?email=…&where=… is home, reads once as the door keeps it, and the hash ends clean", () => {
  // what home() does: returnQuery for the two answers, then history.replaceState with clearQuery
  const hash = "#/home?email=x%40y.edu&where=business";
  assert.equal(parseRoute(hash).name, "home");
  assert.deepEqual(parseRoute(hash).query, { email: "x@y.edu", where: "business" }, "the route carries the query, as every route does");
  const ret = Doors.returnQuery(hash);
  assert.deepEqual(ret, { email: "x@y.edu", where: "business" });
  assert.equal(Doors.clearQuery(hash), "#/home", "nothing of the return stays in the hash");
  assert.equal(parseRoute(Doors.clearQuery(hash)).name, "home");
  assert.deepEqual(Doors.returnQuery(Doors.clearQuery(hash)), { email: "", where: "" }, "a second read finds nothing: it was read once");
  // the return with the email alone (the person skipped the program question), and the other routes untouched
  assert.deepEqual(Doors.returnQuery("#/home?email=x%40y.edu"), { email: "x@y.edu", where: "" });
  assert.equal(Doors.clearQuery("#/role/pm/fit?x=1"), "#/role/pm/fit?x=1");
  assert.equal(Door.next("#/home?email=x%40y.edu"), "#/home?email=x%40y.edu", "the door never rewrites a return");
  // the return passes the door: a Cornell address in it opens Find classes on the first draw
  assert.equal(Door.opens(Doors.returnQuery("#/home?email=ab12%40cornell.edu").email, DOMAINS, CAMPUSES), true);
});

test("You: About you answered, the step it opens on, and the door's program answer folded in", () => {
  const keys = ["where", "stage", "fields"];
  // answered: a program of About you's own, a stage, a field or a résumé; a door-filled program alone is not
  assert.equal(You.answered(null, null), false);
  assert.equal(You.answered({ where: "business", whereFrom: "door", stage: null, fields: [] }, null), false, "the door's answer alone still asks the rest");
  assert.equal(You.answered({ where: "business" }, null), true);
  assert.equal(You.answered({ stage: "curious" }, null), true);
  assert.equal(You.answered({ fields: ["finance"] }, null), true);
  assert.equal(You.answered({ fields: [] }, { text: "x", name: "cv.pdf", words: 300 }), true, "a résumé on file counts");
  // the first step: the first question not answered, the door's program counting as answered there; else the résumé step
  assert.equal(You.firstStep(null, keys), 0);
  assert.equal(You.firstStep({ where: "cs", whereFrom: "door", fields: [] }, keys), 1, "the door's program skips the first question");
  assert.equal(You.firstStep({ where: "cs", stage: "looking", fields: [] }, keys), 2);
  assert.equal(You.firstStep({ where: "cs", stage: "looking", fields: ["finance"] }, keys), 3, "every question answered: the résumé step");
  assert.equal(You.firstStep({ stage: "looking" }, keys), 0, "a gap before an answer opens on the gap");
  // fromDoor: lands only when About you has no program of its own
  assert.deepEqual(You.fromDoor(null, "cs"), { fields: [], stage: null, where: "cs", whereFrom: "door" });
  assert.deepEqual(You.fromDoor({ stage: "looking", fields: ["x"] }, "cs"), { stage: "looking", fields: ["x"], where: "cs", whereFrom: "door" });
  assert.equal(You.fromDoor({ where: "business" }, "cs"), null, "an answer given in About you wins over the door");
  assert.deepEqual(You.fromDoor({ where: "business", whereFrom: "door" }, "cs"), { where: "cs", whereFrom: "door", fields: [], stage: null }, "a later door answer replaces an earlier door answer");
  assert.equal(You.fromDoor({ where: "cs", whereFrom: "door" }, "cs"), null, "the same answer changes nothing");
  assert.equal(You.fromDoor({}, ""), null, "no program picked at the door: nothing lands");
});

// The door's fixes of 2026-11-06 (usability pass, cluster "the door")
test("Door.pass: a click on the door's chrome (top bar, brand, footer About) passes the door and lands where it points", () => {
  assert.equal(Door.pass("#/jobs"), "#/jobs", "the top bar's Find jobs lands on Find jobs");
  assert.equal(Door.pass("#/skills"), "#/skills");
  assert.equal(Door.pass("#/network"), "#/network");
  assert.equal(Door.pass("#/home"), "#/home", "the brand lands home");
  assert.equal(Door.pass("#/about"), "#/about", "the footer's About lands on About");
  assert.equal(Door.pass("#/"), "#/home", "a link to the door itself lands home");
  for (const h of ["https://example.com", "mailto:x@y.edu", "", null, undefined, "#top"]) assert.equal(Door.pass(h), null, JSON.stringify(h));
  // the cold deep link still meets the door once: pass changes nothing in the bounce
  assert.equal(Door.bounce("#/jobs", false), true);
});

test("Door.schoolLine: the door's student line names the campuses whose address opens Find classes, and only those", () => {
  assert.equal(Door.schoolLine(CAMPUSES), "A Cornell email also opens Find classes.", "Cornell Tech's roster loaded, IE's not");
  assert.equal(Door.schoolLine(IE_LOADED), "A Cornell or IE email also opens Find classes.");
  assert.equal(Door.schoolLine([]), "", "no campus with a roster: no line");
  assert.equal(Door.schoolLine([{ id: "cornell_tech", flag: "cornell", catalog: false }]), "");
  // the line is true against Door.opens: every campus it names opens for an address of that campus
  for (const c of CAMPUSES.filter(c => c.catalog)) assert.equal(Door.opens(`a@${DOMAINS[c.flag][0]}`, DOMAINS, CAMPUSES), true, c.id);
  assert.ok(!/A school address opens them/.test(Door.COPY.school), "the old line promised any school address");
});

test("the door's and home's lines end with a full stop", () => {
  assert.ok(/[.!?]$/.test(Door.COPY.inside), Door.COPY.inside);
  for (const t of Door.COPY.intro) assert.ok(/[.!?]$/.test(t), t);
  for (const v of Door.verbs("", { nOpen: 25950, nCompanies: 1502, nRoles: 54 })) assert.ok(/[.!?]$/.test(v.line), `${v.key}: ${v.line}`);
});

test("You.steps: the inline wizard's label counts the same steps as its bar (three questions and the résumé)", () => {
  for (let i = 0; i <= 3; i++) {
    const S = You.steps(i, 3), [, a, b] = S.label.match(/Step (\d+) of (\d+)/) || [];
    assert.equal(S.bars, 4);
    assert.equal(Number(b), S.bars, `step ${i}: the count is the bar's length`);
    assert.equal(Number(a), S.done, `step ${i}: the step number is the filled bars`);
  }
  assert.equal(You.steps(1, 3).label, "Step 2 of 4");
  assert.equal(You.steps(3, 3).label, "Step 4 of 4: your résumé, optional");
});

// home says the role count the launcher and Explore say (2026-11-08): exact, with no "over" and no rounding, and no
// screen falls back to a number of its own
test("the role count: home's line has no \"over\", nothing rounds it, and Explore falls back to roleCount, not 56", async () => {
  const fs = await import("fs");
  const app = fs.readFileSync(path.join(web, "app.js"), "utf8");
  const Copy = require(path.join(web, "copy.js"));
  assert.doesNotMatch(Copy.home.verbs.skills.line, /\bover\b/);
  assert.doesNotMatch(Copy.home.verbs.skills.lineAll, /\{roles\}|\d/);
  assert.equal(Door.tens, undefined, "no rounding to tens is left");
  assert.doesNotMatch(app, /Door\.tens\(/);
  assert.doesNotMatch(app, /\|\| 56\b/);
  assert.match(app, /line: c\.nRoles \? fill\(V\.skills\.line, \{ roles: c\.nRoles \}\) : V\.skills\.lineAll/);
});
