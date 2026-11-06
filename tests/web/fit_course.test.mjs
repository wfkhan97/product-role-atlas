// The usability pass of 2026-11-06, cluster "the fit screen, the course screen, the games and Explore": the pure parts
// behind the fixes. The screens themselves are tests/ui/fit.spec.mjs.
//   - FitCounts (web/app.js): the rail's "N of M" and the fit screen's two lists count from one fit, and the rail names
//     what its count takes and the full count of skills that still need evidence
//   - CourseCore (web/app.js): the course screen's count never reads "0 of the 0"; with no course-showable skill
//     leading at a level it takes all levels
//   - GameShell.firstCard (knowCard with no record): a new visitor gets one line into the game
//   - SkillMap.roleShare: the skill card counts the roles the map shows, the number Explore says
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web, realAtlas } from "./_load.mjs";

const Copy = require(path.join(web, "copy.js"));
const { FitCounts, CourseCore } = require(path.join(web, "app.js"));
const GS = require(path.join(web, "gameshell.js"));

const rows = (n, tag) => Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}` }));

test("FitCounts: the rail's N of M are the core rows, the fit screen's lists every row; the two never mix", () => {
  // seven core skills, all shown; eleven skills of other tiers still to show (the Product Manager case of the audit)
  const f = { core: rows(7, "c"), coreHave: rows(7, "c"), evid: rows(20, "e"), trans: rows(3, "t"), through: rows(2, "h"), inferred: [], presumed: rows(1, "p"), gaps: rows(8, "g"), thin: rows(3, "n") };
  assert.deepEqual(FitCounts.of(f), { core: 7, coreHave: 7, have: 26, still: 11 });
  assert.deepEqual(FitCounts.of({ ...f, through: undefined, inferred: undefined }).have, 24, "a fit read before through and inferred existed");
});

test("FitCounts.railLines names the set N of M counts, at the level or at all levels, and the full count to evidence", () => {
  const c = { core: 7, coreHave: 7, have: 26, still: 11 };
  const at = FitCounts.railLines(c, "Entry");
  assert.equal(at.what, "That count takes the 7 skills most asked for at Entry level.");
  assert.equal(at.still, "11 skills in all still need evidence.");
  assert.equal(FitCounts.railLines(c, null).what, "That count takes the 7 skills most asked for at all levels.");
  assert.equal(FitCounts.railLines({ ...c, still: 1 }, null).still, "1 skill in all still needs evidence.");
  assert.equal(FitCounts.railLines({ ...c, still: 0 }, null).still, Copy.role.rail.stillNone);
});

test("CourseCore.pick: the level's showable core; none there, then all levels and it says so; never an empty count at all levels by fallback", () => {
  const kind = { a: "behaviour", b: "practice", c: "method", d: "technical" }, showable = x => ["method", "technical"].includes(kind[x.id]);
  const entry = [{ id: "a" }, { id: "b" }], all = [{ id: "a" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(CourseCore.pick(entry, all, showable, "entry"), { core: [{ id: "c" }, { id: "d" }], all: true, fellBack: true });
  assert.deepEqual(CourseCore.pick(all, all, showable, "mid"), { core: [{ id: "c" }, { id: "d" }], all: false });
  assert.deepEqual(CourseCore.pick(all, all, showable, "all"), { core: [{ id: "c" }, { id: "d" }], all: true });
});

test("on the real data, Product Manager at Entry has no course-showable skill among the most asked, and the fallback has some", async () => {
  const A = realAtlas(); await A.index(); await A.product();
  const R = await A.role("product.pm"), showable = x => A.COURSE_KINDS.has((R.skillById[x.id] || {}).kind);
  const atEntry = A.grid(R, R.jobs.filter(j => A.stepOf(j) === "entry")).rows[0].flat(), atAll = A.grid(R, R.jobs).rows[0].flat();
  const pick = CourseCore.pick(atEntry, atAll, showable, "entry");
  assert.ok(pick.core.length > 0, "the count is never 0 of the 0");
  // the data moves with a refresh; when the entry grade gains a showable core skill, the count simply stays at Entry
  if (!atEntry.some(showable)) assert.equal(pick.fellBack, true);
});

test("firstCard: a new visitor gets one line into the game; without its link or its words, nothing", () => {
  const first = { href: "#/play/know-the-role?role=pm", text: Copy.fill(Copy.role.tryGame, { title: "Know the role", minutes: 2 }) };
  const html = GS.firstCard(first);
  assert.match(html, /href="#\/play\/know-the-role\?role=pm"/);
  assert.match(html, /Test yourself: Know the role \(2 min\) →/);
  assert.equal(GS.firstCard(null), "");
  assert.equal(GS.firstCard({ href: "#/x" }), "", "no words, no line");
});

test("SkillMap.roleShare: the card counts the roles the map shows (no tech role; product once loaded), as Explore does", async () => {
  globalThis.window = { addEventListener() { } };
  globalThis.Atlas = realAtlas(); globalThis.Copy = Copy;
  delete require.cache[require.resolve(path.join(web, "skillmap.js"))];
  require(path.join(web, "skillmap.js"));
  const ix = await Atlas.index(), P = await Atlas.product();
  const shown = Object.values(ix.roles).filter(r => r.set !== "tech");
  const r = window.SkillMap.roleShare(ix, P, "roadmap");
  assert.equal(r.n, shown.length, "every role the map shows, the number in Explore's lead");
  assert.ok(r.share > 0 && r.share < 1);
  assert.equal(window.SkillMap.roleShare(ix, null, "roadmap").n, shown.filter(x => x.set !== "product").length, "before the product file: the business roles alone");
  const line = window.SkillMap.cardShare(ix, P, "roadmap");
  assert.ok(line.includes(`${shown.length} roles`) && !/MBA/.test(line), line);
});
