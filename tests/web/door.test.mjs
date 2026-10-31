// web/app.js Door: the pure table behind the door (#/) and home (#/home), v19 B2. The Cornell gate, the route after
// the door, the bounce of a deep link, the four cards with their data-built lines, and the copy's rules: no "sign in",
// "cohort", "paid" or "apply", none of the five banned words, and no sentence over 20 words.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web } from "./_load.mjs";

const { Door, parseRoute } = require(path.join(web, "app.js"));
const Doors = require(path.join(web, "doors.js"))({ config: () => ({ TALLY: { door: "wDoor1", intake: null } }) });

test("Door.opens: a Cornell NetID address and nothing else", () => {
  for (const e of ["wk332@cornell.edu", "ub47@cornell.edu", "khg9@cornell.edu", "WK332@Cornell.EDU", "  ab1@cornell.edu  ", "abc1234@cornell.edu"]) assert.equal(Door.opens(e), true, e);
  for (const e of ["john.smith@cornell.edu", "wk332@alumni.cornell.edu", "wk332@gmail.com", "", null, undefined, "w332@cornell.edu", "abcd12@cornell.edu", "wk12345@cornell.edu", "wk@cornell.edu", "wk332@cornell.edu.evil.com", "wk332@cornell.edu x", "wk-332@cornell.edu"]) assert.equal(Door.opens(e), false, JSON.stringify(e));
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

test("Door.verbs: four cards in order, Find classes closed for a non-NetID address and open for one", () => {
  const counts = { nOpen: 25950, nCompanies: 1502, nRoles: 54 };
  const closed = Door.verbs("wk332@gmail.com", counts), open = Door.verbs("wk332@cornell.edu", counts), none = Door.verbs("", counts);
  assert.deepEqual(closed.map(v => v.title), ["Find jobs", "Explore roles & build skills", "Find classes", "Networking"]);
  assert.deepEqual(closed.map(v => v.href), ["#/jobs", "#/skills", "#/classes", "#/network"]);
  assert.deepEqual(closed.map(v => v.open), [true, true, false, true]);
  assert.deepEqual(none.map(v => v.open), [true, true, false, true]);
  assert.deepEqual(open.map(v => v.open), [true, true, true, true]);
  for (const v of closed) assert.ok(v.line && v.key, v.title);
});

test("the lines carry the counts in words, rounded down: over 25 thousand, over 1,500, over 50", () => {
  const [jobs, skills] = Door.verbs("", { nOpen: 25950, nCompanies: 1502, nRoles: 54 });
  assert.equal(jobs.line, "Search over 25 thousand open jobs in popular fields for grad students, from over 1,500 companies.");
  assert.equal(skills.line, "Explore over 50 roles and see how your experience and skills match up.");
  assert.equal(Door.inside(54), Door.COPY.inside.replace("{roles}", "50"));
  assert.ok(!/\{roles\}/.test(Door.inside(54)));
  // a count under a thousand reads in hundreds, so the sentence never says "0 thousand"
  assert.equal(Door.verbs("", { nOpen: 950, nCompanies: 99, nRoles: 9 })[0].line, "Search over 900 open jobs in popular fields for grad students, from over 0 companies.");
  assert.equal(Door.thousands(31965), "31 thousand");
  assert.equal(Door.hundreds(1694), "1,600");
  assert.equal(Door.tens(56), "50");
});

// every string of the copy and of the four lines, flattened
function strings(x, out = []) {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) x.forEach(v => strings(v, out));
  else if (x && typeof x === "object") Object.values(x).forEach(v => strings(v, out));
  return out;
}
const all = () => [...strings(Door.COPY), ...Door.verbs("", { nOpen: 25950, nCompanies: 1502, nRoles: 54 }).flatMap(v => [v.title, v.line]), Door.inside(54)];

test("no string says sign in, log in, account, cohort, paid or apply, and none uses utilize, leverage, facilitate, via or in order to", () => {
  const banned = [/\bsign[ -]?in\b/i, /\blog[ -]?in\b/i, /\baccount\b/i, /\bcohort\b/i, /\bpaid\b/i, /\bapply\b/i, /\butili[sz]e/i, /\bleverage/i, /\bfacilitate/i, /\bvia\b/i, /\bin order to\b/i];
  for (const s of all()) for (const re of banned) assert.ok(!re.test(s), `${re} in "${s}"`);
});

test("no sentence runs over 20 words", () => {
  for (const s of all()) for (const sentence of s.split(/[.!?]+/)) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    assert.ok(words.length <= 20, `${words.length} words: "${sentence.trim()}"`);
  }
});

test("the copy holds every string the two screens draw", () => {
  const C = Door.COPY;
  for (const k of ["heading", "intro", "inside", "email", "emailPlaceholder", "where", "pick", "cornell", "button", "skip", "privacy", "home", "more", "closed", "closedLink", "closedAfter", "bar"]) assert.ok(C[k] != null && C[k] !== "", k);
  assert.equal(C.emailPlaceholder, "user@school.edu");
  assert.equal(C.skip, "Skip for now");
  assert.equal(C.intro.length, 2);
  assert.deepEqual(Object.keys(C.bar), ["jobs", "skills", "classes", "network"]);
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
  assert.equal(Door.opens(Doors.returnQuery("#/home?email=ab12%40cornell.edu").email), true);
});
