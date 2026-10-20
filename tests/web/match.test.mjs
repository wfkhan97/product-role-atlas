// web/match.js: the resume reader, the score and the bands of fit. Inline fixtures; the real taxonomy is not needed
// to state these rules. match.js changes only with its eval baseline (CLAUDE.md), so a rule it breaks that is not
// fixed in the same change is a `todo` test with the finding.
import test from "node:test";
import assert from "node:assert/strict";
import { Matcher } from "./_load.mjs";

const { parseResume, createMatcher, bandOf } = Matcher;
const rolesOf = text => parseResume(text).roles;
const yearsOf = dates => { const r = rolesOf(`EXPERIENCE\nAnalyst, Acme Corp, ${dates}\n- Built the monthly model`); assert.equal(r.length, 1, `one role read from "${dates}"`); return r[0].years; };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} is not ${b}`);

// ---------- parseResume: sections, titles, dates ----------
test("parseResume reads each heading as the section of the lines below it", () => {
  const p = parseResume(["SUMMARY", "Analyst who builds models.", "EXPERIENCE", "Analyst, Acme Corp, Jan 2019 - Dec 2020", "- Built the monthly forecast", "EDUCATION", "State University, BS in Economics", "SKILLS", "SQL, Excel"].join("\n"));
  assert.equal(p.hasSections, true);
  assert.deepEqual(p.lines.filter(l => l.kind === "heading").map(l => l.section), ["summary", "experience", "education", "skills"]);
  assert.equal(p.lines.find(l => l.text.startsWith("Analyst who")).kind, "summary");
  assert.equal(p.lines.find(l => l.text.startsWith("Built")).kind, "bullet");
  assert.equal(p.lines.find(l => l.text.startsWith("SQL")).kind, "skill");
  assert.ok(p.degrees.has("bachelors"), "the BS under Education is a degree");
});

test("parseResume finds the job title on the dated line, or on the line above the dates", () => {
  assert.deepEqual(rolesOf("EXPERIENCE\nProduct Manager, Acme Corp, Jan 2019 - Dec 2020\n- Led the roadmap").map(r => r.title), ["Product Manager"]);
  assert.deepEqual(rolesOf("EXPERIENCE\nProduct Manager\nAcme Corp\nJan 2019 - Dec 2020\n- Led the roadmap").map(r => r.title), ["Product Manager"]);
});

test("parseResume marks a product title as product work and an internship as an internship", () => {
  const [pm] = rolesOf("EXPERIENCE\nSenior Product Manager, Acme Corp, Jan 2019 - Dec 2020\n- Led the roadmap");
  assert.equal(pm.isPM, true); assert.equal(pm.family, "pm"); assert.equal(pm.level, "senior"); assert.equal(pm.isIntern, false);
  const [intern] = rolesOf("EXPERIENCE\nProduct Intern, Acme Corp, Summer 2023\n- Ran user interviews");
  assert.equal(intern.isIntern, true);
});

test("parseResume counts years of work from jobs only, not internships", () => {
  const p = parseResume("EXPERIENCE\nAnalyst, Acme Corp, Jan 2019 - Dec 2020\n- Built models\nFinance Intern, Beta LLC, Summer 2018\n- Built more models");
  assert.equal(p.roles.length, 2);
  near(p.totalYears, 2, "two years as an analyst; the internship does not count");
});

test("parseResume reads a resume with no dates: no jobs, no years, no error", () => {
  const p = parseResume("Analyst at Acme\n- Built models\n- Led a team\nState University, BS in Economics");
  assert.deepEqual(p.roles, []);
  assert.equal(p.totalYears, 0);
  assert.equal(p.hasSections, false);
  assert.ok(p.degrees.has("bachelors"), "a degree written out is read without an Education heading");
});

test("parseResume reads an empty text as nothing", () => {
  const p = parseResume("");
  assert.deepEqual([p.roles.length, p.lines.length, p.totalYears], [0, 0, 0]);
});

test("parseResume reads en and em dashes in a date range as the hyphen", () => {
  for (const dash of ["-", "–", "—", "to"]) near(yearsOf(`Jan 2019 ${dash} Dec 2020`), 2, `dash ${JSON.stringify(dash)}`);
});

test("parseResume reads a curly apostrophe like a straight one, in short years and in degrees", () => {
  near(yearsOf("Jul ’19 – Jun ’21"), yearsOf("Jul '19 – Jun '21"), "’19 is '19");
  near(yearsOf("Jul ’19 – Jun ’21"), 2, "July 2019 to June 2021 is two years");
  assert.ok(parseResume("EDUCATION\nMaster’s degree in Finance, State University").degrees.has("masters_mba"));
});

test("parseResume brings the placeholder years of a template (20XX) back as written, with no years counted", () => {
  const p = parseResume("EXPERIENCE\nAnalyst, Acme Corp, Jan 20XX - Dec 20XX\n- Built models");
  assert.equal(p.placeholderDates, true);
  assert.equal(p.roles.length, 1);
  assert.equal(p.roles[0].years, 0);
  assert.ok(p.roles[0].text.includes("20XX"));
});

test("parseResume reads a range written with another dash (hyphen U+2010, non-breaking hyphen, figure dash, horizontal bar, minus) as a range", () => {
  for (const dash of ["‐", "‑", "‒", "―", "−"]) assert.equal(rolesOf(`EXPERIENCE\nAnalyst, Acme Corp, Jan 2019 ${dash} Dec 2020\n- Built models`).length, 1, `U+${dash.codePointAt(0).toString(16)}`);
});

// ---------- yearsBetween (not exported: read through parseResume, whose roles carry its value as `years`) ----------
test("yearsBetween counts a month range inclusively: Jan 2019 to Dec 2020 is two years", () => {
  near(yearsOf("Jan 2019 - Dec 2020"), 2, "24 months");
  near(yearsOf("01/2019 - 12/2020"), 2, "the same range in numbers");
});

test("yearsBetween reads a range of bare years from the start of the first to the start of the last", () => {
  near(yearsOf("2018 - 2020"), 2, "2018 to 2020");
});

test("yearsBetween reads 'Present' as today", () => {
  const now = new Date(), today = now.getFullYear() + now.getMonth() / 12;
  near(yearsOf("Jan 2020 - Present"), today - 2020, "January 2020 to now");
});

test("yearsBetween gives a season a quarter of a year and a lone year half a year", () => {
  near(yearsOf("Summer 2023"), 0.25, "one summer");
  near(yearsOf("(2021)"), 0.5, "a year with no range");
});

test("yearsBetween reads a reversed range (a typing slip) as the range meant", () => {
  near(yearsOf("12/2020 - 01/2019"), yearsOf("01/2019 - 12/2020"), "reversed");
});

test("yearsBetween keeps every role between a quarter of a year and 40 years", () => {
  assert.ok(yearsOf("12/2020 - 01/2019") > 0, "a reversed range is not negative");
  near(yearsOf("Jan 2020 - Jan 2020"), 0.25, "the floor");
  near(yearsOf("1960 - 2020"), 40, "the cap");
});

test("yearsBetween reads a range that ends in a season to the end of that season: Fall 2021 to Spring 2023 is Sep 2021 to May 2023", () => {
  near(yearsOf("Fall 2021 – Spring 2023"), yearsOf("Sep 2021 – May 2023"), "Fall to Spring");
  near(yearsOf("Summer 2021 – Summer 2022"), yearsOf("Jun 2021 – Aug 2022"), "Summer to Summer");
  near(yearsOf("Spring 2022 – Present"), yearsOf("Mar 2022 – Present"), "a season start with an open end");
});

// ---------- score: a small graph whose shares are chosen to land in each tier ----------
// 8 postings of one role: roadmap in all 8 (core), sql in 4 (core, at the 0.5 edge), interviews in 3 (common),
// pricing in 1 (differentiator), fintech in 2 (the industry slot). Levels: 4 mid, 4 senior.
const TAX = { skills: [
  { id: "t_roadmap", name: "Roadmapping", cluster: "strategy", patterns: ["roadmap"] },
  { id: "t_sql", name: "SQL", cluster: "technical", patterns: ["\\bSQL\\b"] },
  { id: "t_interviews", name: "Customer interviews", cluster: "discovery", patterns: ["customer interviews?"] },
  { id: "t_pricing", name: "Pricing", cluster: "gtm", patterns: ["pricing"] },
  { id: "t_fintech", name: "Fintech", cluster: "domain", patterns: ["fintech"] },
] };
const has = (i, list) => list.filter(([, n]) => i < n).map(([id]) => id);
const JOBS = Array.from({ length: 8 }, (_, i) => ({ id: i, family: "pm", level: i < 4 ? "mid" : "senior", company: "Co" + i, skills: has(i, [["t_roadmap", 8], ["t_sql", 4], ["t_interviews", 3], ["t_pricing", 1], ["t_fintech", 2]]) }));
const M = createMatcher({ taxonomy: TAX, subskills: {}, graph: { jobs: JOBS, skills: [] } });
const TARGET = { jobs: JOBS, label: "pm" };
const REQ = M.requirements(TARGET);
const IDS = ["t_roadmap", "t_sql", "t_interviews", "t_pricing", "t_fintech"];
const evOf = strengths => Object.fromEntries(Object.entries(strengths).map(([id, s]) => [id, { strength: s, lines: [], subs: new Set(), via: new Set() }]));
const rng = seed => () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };

test("requirements put each skill in the tier its share of postings sets (core from 0.5, common from 0.25, else from 0.1)", () => {
  assert.deepEqual([...REQ.tiers.core.keys()].sort(), ["t_roadmap", "t_sql"]);
  assert.deepEqual([...REQ.tiers.common.keys()].sort(), ["__domain", "t_interviews"]);
  assert.deepEqual([...REQ.tiers.diff.keys()], ["t_pricing"]);
});

test("score is 0 for a resume that shows nothing and holds no role", () => {
  const r = M.score({}, REQ, { level: "mid" });
  assert.equal(r.overall, 0);
  assert.ok(r.rows.every(x => x.status === "gap"));
});

test("score is 0, not NaN, when the role asks for nothing", () => {
  const r = M.score({}, M.requirements({ jobs: [], label: "none" }), { level: "mid" });
  assert.equal(r.overall, 0);
});

test("score is 1 when every core and common ask is shown with a line of work", () => {
  near(M.score(evOf(Object.fromEntries(IDS.map(id => [id, 2]))), REQ, { level: "mid" }).overall, 1, "all shown");
});

test("score never goes down when evidence is added or strengthened (200 random resumes, with and without a role held)", () => {
  const rnd = rng(7);
  const standing = { above: false, market: new Set(["t_sql"]), marketCommon: new Set(["t_interviews"]), employer: new Set() };
  for (let k = 0; k < 200; k++) {
    const st = k % 2 ? standing : null;
    const s = Object.fromEntries(IDS.map(id => [id, Math.floor(rnd() * 4)]));
    const before = M.score(evOf(s), REQ, { level: "mid" }, { standing: st }).overall;
    const id = IDS[Math.floor(rnd() * IDS.length)];
    if (s[id] === 3) continue;
    const after = M.score(evOf({ ...s, [id]: s[id] + 1 }), REQ, { level: "mid" }, { standing: st }).overall;
    assert.ok(after >= before - 1e-12, `raising ${id} from ${s[id]} lowered ${before} to ${after}`);
    assert.ok(before >= 0 && before <= 1 && after >= 0 && after <= 1, "a score is a share");
  }
});

test("match: adding a resume line that shows a gap never lowers the score", () => {
  const text = "EXPERIENCE\nAnalyst, Acme Corp, Jan 2019 - Dec 2022\n- Owned the quarterly roadmap";
  const r = M.match(text, TARGET);
  for (const line of ["- Wrote SQL queries for the weekly review", "- Ran 12 customer interviews", "- Set pricing for a fintech product"]) {
    const r2 = M.match(text + "\n" + line, TARGET);
    assert.ok(r2.overall >= r.overall - 1e-12, `"${line}" lowered ${r.overall} to ${r2.overall}`);
  }
});

test("match: a person who held the role scores at least as high against their own level as against a higher one", () => {
  const text = "EXPERIENCE\nProduct Manager, Acme Corp, Jan 2021 - Dec 2023\n- Owned the quarterly roadmap";
  const own = M.match(text, TARGET, { level: "mid" }), higher = M.match(text, TARGET, { level: "senior" });
  assert.equal(own.profile.level, "mid", "three years in product reads as mid-level");
  assert.ok(own.standing && own.standing.presumed > 0, "at their own level, asks the resume does not show are presumed");
  assert.equal(higher.standing, null, "above their level nothing is presumed");
  assert.ok(own.overall >= higher.overall, `${own.overall} at mid, ${higher.overall} at senior`);
});

// ---------- bandOf: each cut point is the lowest score of its band ----------
const BANDS = { strong: 0.7, in_range: 0.5, related: 0.3 };
test("bandOf: a score equal to a cut point is in the band that starts there", () => {
  assert.equal(bandOf(0.7, BANDS), "strong");
  assert.equal(bandOf(0.5, BANDS), "in_range");
  assert.equal(bandOf(0.3, BANDS), "related");
});

test("bandOf: a score just under a cut point is in the band below", () => {
  assert.equal(bandOf(0.7 - 1e-9, BANDS), "in_range");
  assert.equal(bandOf(0.5 - 1e-9, BANDS), "related");
  assert.equal(bandOf(0.3 - 1e-9, BANDS), "different");
  assert.equal(bandOf(0, BANDS), "different");
  assert.equal(bandOf(1, BANDS), "strong");
});

test("bandOf reads the bottom line per group of roles when bands.related is a table", () => {
  const B = { strong: 0.7, in_range: 0.5, related: { finance: 0.3, ops: 0.4 }, no_bands: { tech: "too few resumes" } };
  assert.equal(bandOf(0.35, B, "finance"), "related");
  assert.equal(bandOf(0.35, B, "ops"), "different");
});

test("bandOf gives no band for a group without bands, a group it does not know, or no bands at all", () => {
  const B = { strong: 0.7, in_range: 0.5, related: { finance: 0.3 }, no_bands: { tech: "too few resumes" } };
  assert.equal(bandOf(0.9, B, "tech"), null);
  assert.equal(bandOf(0.9, B, "unknown"), null);
  assert.equal(bandOf(0.9, null), null);
});
