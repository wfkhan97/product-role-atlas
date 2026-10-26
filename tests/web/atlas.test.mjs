// web/atlas.js: the share statistics behind every number on a role screen, and the cache of data files.
// Inline fixtures: a loader that counts its calls and can fail on demand stands in for fetch.
import test from "node:test";
import assert from "node:assert/strict";
import { atlasFactory, Matcher } from "./_load.mjs";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} is not ${b}`);
// a loader over in-memory files; `failures[url]` = how many of the next loads of url fail
function loader(files, failures = {}) {
  const calls = {};
  const load = url => {
    calls[url] = (calls[url] || 0) + 1;
    if (failures[url] > 0) { failures[url]--; return Promise.reject(new Error(`${url}: 503`)); }
    if (!(url in files)) return Promise.reject(new Error(`${url}: 404`));
    return Promise.resolve(structuredClone(files[url]));
  };
  return { load, calls };
}
// the smallest index atlas.js can build: one field with one role
const INDEX = {
  "data/graph_mba.json": {
    meta: {}, families: { fpa: "FP&A" }, groups: [{ id: "finance", label: "Finance", families: ["fpa"] }],
    roles: { fpa: { label: "FP&A", n_open: 3, n: 4, n_companies: 2, ladder: "corporate", defining: [], asks: [], credentials: [], small: false, file: "graph_mba/fpa.json" } },
    skills: [{ id: "excel", name: "Excel", cluster: "tools", by_family: { fpa: 0.5 } }],
  },
  "data/subskills_mba.json": {},
};

// ---------- the fetch cache ----------
test("fetchJson loads a file once and gives every caller the same data", async () => {
  const { load, calls } = loader({ "data/a.json": { x: 1 } });
  const A = atlasFactory({ load, Matcher: null });
  const [a, b] = await Promise.all([A.fetchJson("data/a.json"), A.fetchJson("data/a.json")]);
  assert.equal(a, b);
  assert.deepEqual(await A.fetchJson("data/a.json"), { x: 1 });
  assert.equal(calls["data/a.json"], 1);
});

test("fetchJson tries a file again after a load fails, instead of keeping the failure until a page reload", async () => {
  const { load, calls } = loader({ "data/a.json": { x: 1 } }, { "data/a.json": 1 });
  const A = atlasFactory({ load, Matcher: null });
  await assert.rejects(A.fetchJson("data/a.json"), /503/);
  assert.deepEqual(await A.fetchJson("data/a.json"), { x: 1 });
  assert.equal(calls["data/a.json"], 2);
  await A.fetchJson("data/a.json");
  assert.equal(calls["data/a.json"], 2, "once it has loaded, it is not loaded again");
});

test("fetchJson: the callers waiting on a load that fails all see the failure, and the next call loads again", async () => {
  const { load, calls } = loader({ "data/a.json": { x: 1 } }, { "data/a.json": 1 });
  const A = atlasFactory({ load, Matcher: null });
  const waits = [A.fetchJson("data/a.json"), A.fetchJson("data/a.json")];
  for (const w of waits) await assert.rejects(w, /503/);
  assert.equal(calls["data/a.json"], 1, "both waited on the one load");
  assert.deepEqual(await A.fetchJson("data/a.json"), { x: 1 });
});

test("fetchJson takes a loader that returns the data itself, not a promise (the evals read files synchronously)", async () => {
  const A = atlasFactory({ load: () => ({ x: 2 }), Matcher: null });
  assert.deepEqual(await A.fetchJson("data/a.json"), { x: 2 });
});

test("index() is built again after one of its files failed to load", async () => {
  const { load, calls } = loader(INDEX, { "data/graph_mba.json": 1 });
  const A = atlasFactory({ load, Matcher: null });
  await assert.rejects(A.index(), /503/);
  const ix = await A.index();
  assert.deepEqual(ix.groups.map(g => g.id), ["finance", "product"]);
  assert.equal(ix.roles.fpa.nOpen, 3);
  assert.equal(calls["data/graph_mba.json"], 2);
  assert.equal(calls["data/subskills_mba.json"], 1, "the file that loaded is not loaded again");
  assert.equal(await A.index(), ix, "once built, the index is kept");
});

test("product() is built again after its file failed to load", async () => {
  // the real graph.json always carries meta (build_graph writes generated, n_jobs, n_companies, ...): the Product field shows its date
  const files = { ...INDEX, "data/subskills.json": {}, "data/graph.json": { meta: { generated: "2026-10-18", n_jobs: 1, n_companies: 1 }, families: { pm: "Product manager" }, skills: [{ id: "roadmap", name: "Roadmapping", cluster: "strategy", by_family: { pm: 1 } }], jobs: [{ family: "pm", company: "Acme", skills: ["roadmap"], level: "mid" }] } };
  const { load } = loader(files, { "data/graph.json": 1 });
  const A = atlasFactory({ load, Matcher: null });
  await assert.rejects(A.product(), /503/);
  const P = await A.product();
  assert.deepEqual(P.G.jobs.map(j => j.family), ["pm"]);
  const ix = await A.index();
  assert.equal(ix.roles[A.productKey("pm")].set, "product", "product roles live under their own namespace (#34)");
  assert.equal(ix.groups.find(g => g.id === "product").generated, "2026-10-18", "the Product field carries the product file's date");
});

// ---------- shares and subShares ----------
const JOBS = [
  { skills: ["sql", "excel"], sub: ["sql.joins"], w: 1 },
  { skills: ["sql"], sub: ["sql.window", "sql.joins"], w: 0.5 },
  { skills: ["excel"], sub: [], w: 1 },
  { skills: [], sub: [], w: 0.5 },
];
test("shares: a skill's share is the weight of the postings that ask for it over the weight of all postings", () => {
  const A = atlasFactory({ load: () => ({}), Matcher: null }), st = A.shares(JOBS);
  assert.equal(st.n, 4, "n is the number of postings");
  assert.equal(st.w, 3, "w is their weight");
  near(st.share("sql"), 1.5 / 3, "sql");
  near(st.share("excel"), 2 / 3, "excel");
  assert.equal(st.share("python"), 0, "a skill no posting asks for");
});

test("shares of no postings are 0, not NaN", () => {
  const A = atlasFactory({ load: () => ({}), Matcher: null }), st = A.shares([]);
  assert.deepEqual([st.n, st.w, st.share("sql")], [0, 0, 0]);
});

test("subShares: a sub-skill's share is taken over the postings that ask for the skill, by weight", () => {
  const A = atlasFactory({ load: () => ({}), Matcher: null }), ss = A.subShares(JOBS, "sql");
  assert.equal(ss.n, 2, "only the two postings that ask for sql");
  near(ss.share("sql.joins"), 1, "both ask for joins");
  near(ss.share("sql.window"), 0.5 / 1.5, "window functions: the half-weight posting only");
  assert.equal(A.subShares(JOBS, "python").share("x"), 0, "no posting asks for the skill: 0, not NaN");
});

test("stepOf puts each level on one of the four steps, and an unknown level at mid", () => {
  const A = atlasFactory({ load: () => ({}), Matcher: null });
  assert.deepEqual(["associate", "mid", "senior", "staff", "director", "cpo", undefined].map(level => A.stepOf({ level })), ["entry", "mid", "senior", "lead", "lead", "lead", "mid"]);
});

// ---------- the skills by area (the role screen's accordion) ----------
// a role whose postings ask for six skills in four areas; every posting is at the same level, so nothing "grows"
const AREA_R = (() => {
  const skills = [["budget", "finance"], ["report", "finance"], ["close", "finance"], ["model", "analytics"], ["sql", "technical"], ["teams", "leadership"]];
  const job = (id, asks) => ({ id, skills: asks, w: 1, level: "mid", open: true });
  const jobs = [job(1, ["budget", "report", "model", "teams"]), job(2, ["budget", "model", "sql"]), job(3, ["budget", "report", "close", "model"]), job(4, ["budget", "model"])];
  return { role: { defining: new Set(["budget"]) }, skills: skills.map(([id, cluster]) => ({ id, name: id, cluster })), jobs, clusters: { finance: { label: "Finance" }, analytics: { label: "Data" }, technical: { label: "Technical" }, leadership: { label: "Leadership" } } };
})();
test("areas: an area with a skill most postings ask for is its own panel; the area holding the role's defining skills leads", () => {
  const A = atlasFactory({ load: () => Promise.reject(new Error("no files")), Matcher: null });
  const { areas } = A.areas(AREA_R, AREA_R.jobs);
  assert.deepEqual(areas.map(a => a.cluster), ["finance", "analytics", "other"], "finance (the defining skill, 2 core skills) before data (1), then the rest");
  const R2 = { ...AREA_R, role: { defining: new Set(["model"]) } };
  assert.deepEqual(A.areas(R2, R2.jobs).areas.map(a => a.cluster), ["analytics", "finance", "other"], "with modelling as the defining skill, data leads even with fewer core skills");
  assert.deepEqual(areas[0].skills.map(s => s.id), ["budget", "report", "close"], "skills in a panel are ranked by share");
  assert.deepEqual(areas[0].skills.map(s => s.tier), [0, 0, 1], "budget and report are asked by most postings, close by a quarter");
  assert.equal(areas[0].core, 2);
  assert.equal(areas[0].skills[0].defining, true, "the role's defining skill carries its mark");
});
test("areas: areas with no such skill and fewer than three skills fold into one panel, each skill keeping its area's name", () => {
  const A = atlasFactory({ load: () => Promise.reject(new Error("no files")), Matcher: null });
  const { areas } = A.areas(AREA_R, AREA_R.jobs);
  const other = areas[2];
  assert.equal(other.label, "Other areas"); assert.equal(other.merged, true);
  assert.deepEqual(other.skills.map(s => [s.id, s.area]), [["teams", "Leadership"], ["sql", "Technical"]], "equal shares, so the fixed area order decides");
});
test("areas: a single leftover area keeps its own name instead of becoming 'Other areas'", () => {
  const A = atlasFactory({ load: () => Promise.reject(new Error("no files")), Matcher: null });
  const R = { ...AREA_R, jobs: AREA_R.jobs.map(j => ({ ...j, skills: j.skills.filter(k => k !== "teams") })) };
  const { areas } = A.areas(R, R.jobs);
  assert.deepEqual(areas.map(a => a.label), ["Finance", "Data", "Technical"]);
  assert.equal(areas[2].merged, false);
});

// ---------- carriers: the skills a behaviour or a practice is shown through, picked on the role's postings ----------
test("carriers: picked on the postings of the view at the 15% floor, by share, four at most, carrier kinds only; the field's list stands in", async () => {
  const skills = [
    { id: "comm", name: "Communication", cluster: "leadership", kind: "behaviour", by_family: { fpa: 0.9 }, how_shown: { shown_by: ["prd", "excel", "rare"] }, fields: { finance: { shown_by: ["report", "case"], reads_as: "x", line: "1" } } },
    { id: "report", name: "Reporting", cluster: "finance", kind: "method", by_family: { fpa: 0.5 } }, { id: "case", name: "Business case", cluster: "gtm", kind: "method", by_family: { fpa: 0.5 } },
    { id: "prd", name: "PRDs", cluster: "craft", kind: "method", by_family: { fpa: 0.1 } }, { id: "rare", name: "Rare", cluster: "craft", kind: "method", by_family: { fpa: 0.1 } }, { id: "excel", name: "Excel", cluster: "tools", kind: "tool", by_family: { fpa: 0.5 } },
  ];
  const mk = n => Array.from({ length: n }, (_, i) => ({ id: i, company: "Co" + i, level: "mid", ladder: "corporate", w: 1, open: true, skills: ["comm", ...(i < 10 ? ["report"] : []), ...(i < 4 ? ["case"] : []), ...(i < 1 ? ["prd"] : []), ...(i < 10 ? ["excel"] : [])], sub: [] }));
  const files = { "data/graph_mba.json": { ...INDEX["data/graph_mba.json"], skill_ids: skills.map(s => s.id), sub_ids: [], skills, meta: { kinds: {} }, ladders: { corporate: { levels: {} } } }, "data/subskills_mba.json": {}, "data/graph_mba/fpa.json": { jobs: mk(10).map(j => ({ ...j, skills: j.skills.map(k => skills.findIndex(s => s.id === k)) })) } };
  const { load } = loader(files); const A = atlasFactory({ load, Matcher });
  const R = await A.role("fpa");
  const c = A.carriers(R, R.jobs, "comm");
  assert.deepEqual(c.ids, ["report", "case"], "report (100%) and case (40%) pass; prd (10%) does not; excel is a tool");
  assert.equal(c.fallback, false); assert.equal(c.source, "role"); assert.equal(c.kind, "behaviour");
  // a view where only one carrier passes the floor: the field entry's list stands in, marked
  const one = A.carriers(R, R.jobs.slice(4), "comm");
  assert.deepEqual(one.ids, ["report", "case"]); assert.equal(one.source, "field"); assert.equal(one.fallback, true);
  // no postings in the view: the role's postings decide
  assert.deepEqual(A.carriers(R, [], "comm").ids, ["report", "case"]);
  assert.deepEqual(A.carriers(R, R.jobs, "nope"), { ids: [], shares: {}, fallback: false, field: [], source: "none", kind: null });
});

// ---------- areas: the behaviours leave their areas for one last panel, "How you work" (PLAN.md v14, decision 4) ----------
const KIND_R = (() => {
  const S = { ...AREA_R, skills: AREA_R.skills.map(s => ({ ...s, kind: s.id === "teams" ? "behaviour" : s.id === "sql" ? "technical" : "method", how_shown: s.id === "teams" ? { shown_by: ["report", "budget"] } : {} })) };
  S.skillById = Object.fromEntries(S.skills.map(s => [s.id, s])); S.role = { ...S.role, group: "finance" };
  return S;
})();
test("areas: a behaviour leaves its area for the last panel, which says what it holds and carries each row's carriers", () => {
  const A = atlasFactory({ load: () => Promise.reject(new Error("no files")), Matcher });
  const { areas } = A.areas(KIND_R, KIND_R.jobs);
  assert.deepEqual(areas.map(a => a.cluster), ["finance", "analytics", "technical", A.BEHAVIOURS_PANEL], "teams left Leadership, which then has no skill and no panel");
  const panel = areas[3];
  assert.equal(panel.label, "How you work"); assert.equal(panel.behaviours, true);
  assert.deepEqual(panel.skills.map(s => s.id), ["teams"]);
  assert.equal(panel.summary, "Ways of working, shown through the work above: teams 25%");
  assert.deepEqual(panel.skills[0].carriers, ["budget", "report"], "the carriers the role's postings pick, by share");
  assert.ok(areas.slice(0, 3).every(a => a.skills.every(s => s.kind !== "behaviour")), "no behaviour in an area panel");
});
test("areas: no behaviour in the grid, no How you work panel", () => {
  const A = atlasFactory({ load: () => Promise.reject(new Error("no files")), Matcher });
  const R = { ...KIND_R, jobs: KIND_R.jobs.map(j => ({ ...j, skills: j.skills.filter(k => k !== "teams") })) };
  const { areas } = A.areas(R, R.jobs);
  assert.ok(!areas.some(a => a.behaviours));
  assert.deepEqual(areas.map(a => a.label), ["Finance", "Data", "Technical"]);
});
test("areas: the panel is last whatever the behaviour's share, and the area that lost it keeps its place", () => {
  const A = atlasFactory({ load: () => Promise.reject(new Error("no files")), Matcher });
  const R = { ...KIND_R, jobs: KIND_R.jobs.map(j => ({ ...j, skills: [...new Set([...j.skills, "teams"])] })) };
  const { areas } = A.areas(R, R.jobs);
  assert.equal(areas[areas.length - 1].cluster, A.BEHAVIOURS_PANEL);
  assert.equal(areas[areas.length - 1].skills[0].tier, 0, "asked by every posting, still in the last panel");
  assert.equal(areas[areas.length - 1].core, 1);
  assert.deepEqual(areas.map(a => a.cluster).slice(0, 2), ["finance", "analytics"]);
});

// ---------- courseSplit: what a course can show, by kind (PLAN.md v14, decision 5) ----------
test("courseSplit: methods, technical, knowledge and tools are taught; behaviours and practices are only named; credentials are neither", () => {
  const A = atlasFactory({ load: () => Promise.reject(new Error("no files")), Matcher });
  const byId = { prd: { kind: "method" }, sql: { kind: "technical" }, fintech: { kind: "knowledge" }, excel: { kind: "tool" }, comm: { kind: "behaviour" }, stakeholders: { kind: "practice" }, cpa: { kind: "credential" }, unknown: {} };
  const s = A.courseSplit(new Set(Object.keys(byId)), byId);
  assert.deepEqual([...s.teaches].sort(), ["excel", "fintech", "prd", "sql"]);
  assert.deepEqual([...s.named].sort(), ["comm", "stakeholders"]);
  assert.deepEqual([...s.other].sort(), ["cpa", "unknown"], "a credential, or a skill with no kind, is neither taught nor named");
  assert.equal(s.teaches.size + s.named.size + s.other.size, 8, "the split sums to the found set");
});

// ---------- American spelling on screen (PLAN.md v16, step 5): Atlas.us over web/data/spelling_us.json ----------
import fs from "fs";
import path from "path";
import { web } from "./_load.mjs";
const SPELLING = JSON.parse(fs.readFileSync(path.join(web, "data", "spelling_us.json"), "utf8"));
const realAtlasFor = () => atlasFactory({ load: url => Promise.resolve(JSON.parse(fs.readFileSync(path.join(web, url), "utf8"))), Matcher });
const usAtlas = () => { const A = atlasFactory({ load: () => Promise.reject(new Error("no files")), Matcher }); A.useSpelling(SPELLING); return A; };

test("us: the named families from the brief map to American spelling, keeping case", () => {
  const A = usAtlas();
  const cases = [["programme", "program"], ["programmes", "programs"], ["labour", "labor"], ["organisation", "organization"], ["optimise", "optimize"], ["analyse", "analyze"], ["behaviour", "behavior"], ["centre", "center"], ["licence", "license"],
    ["Programme management", "Program management"], ["OPTIMISE", "OPTIMIZE"], ["Analysed", "Analyzed"], ["artefacts", "artifacts"], ["behavioural", "behavioral"], ["colours", "colors"], ["centred", "centered"], ["kilometres", "kilometers"],
    ["prioritised", "prioritized"], ["standardising", "standardizing"], ["visualisation", "visualization"], ["modelled", "modeled"], ["modelling", "modeling"], ["levelling", "leveling"], ["labelled", "labeled"], ["counsellor", "counselor"],
    ["fulfilment", "fulfillment"], ["enrolment", "enrollment"], ["defence", "defense"], ["catalogue", "catalog"], ["practise", "practice"], ["advisers", "advisors"], ["unfavourable", "unfavorable"]];
  for (const [from, to] of cases) assert.equal(A.us(from), to, from);
  assert.equal(A.us("You analyse the labour cost centre."), "You analyze the labor cost center.");
});

test("us: words that only look British are left alone (the exceptions are data), and so are nouns both spellings share", () => {
  const A = usAtlas();
  for (const w of ["enterprise", "exercise", "advise", "expertise", "surprises", "otherwise", "noise", "premise", "promise", "compromise", "raise", "merchandising", "supervised", "unsupervised", "precise", "revised", "franchise", "fundraising", "analyses", "parameter", "controlled", "genre", "acre", "four", "hour", "our", "improvisation", "expenditure", "structure", "prepare", "culture"]) assert.equal(A.us(w), w, w);
  assert.equal(A.us(""), ""); assert.equal(A.us(null), null); assert.equal(A.us(42), 42);
  // before the word list is loaded the text passes through
  const B = atlasFactory({ load: () => Promise.reject(new Error("no files")), Matcher }); assert.equal(B.us("programme"), "programme");
});

test("us is applied to the names, definitions, ladders, build steps, sub-skills and field lines of the index, never to posting evidence", async () => {
  const files = {
    "data/graph_mba.json": { meta: { evidence: "graph_mba/_evidence.json" }, families: { fpa: "FP&A" }, groups: [{ id: "finance", label: "Finance", families: ["fpa"] }], ladders: { corporate: { label: "Corporate", levels: { associate: "Analyst", mid: "Manager", senior: "Senior" } } }, level_labels: {}, edges: [],
      roles: { fpa: { label: "FP&A", n_open: 1, n: 1, n_companies: 1, ladder: "corporate", defining: [], asks: [], credentials: [], small: false, file: "graph_mba/fpa.json" } },
      skills: [{ id: "prog", name: "Programme management", what: "You organise the programme.", cluster: "delivery", by_family: { fpa: 0.5 }, ladder: { corporate: { mid: "You prioritise artefacts." } }, build: { corporate: [{ kind: "read", text: "Read the organisation's licence." }] }, subskills: [{ id: "s1", name: "Labour planning", example: "Modelled the labour cost" }], how_shown: { artefacts: ["programme plan"] }, fields: { finance: { reads_as: "the behaviours a centre asks for", line: "Optimised 3 programmes" } }, signals: ["Analysed the catalogue"] }],
      clusters: { delivery: { label: "Delivery & organisation" } } },
    "data/subskills_mba.json": { prog: [{ id: "s1", name: "Labour planning", example: "Modelled the labour cost" }] },
    "data/spelling_us.json": SPELLING,
    "data/graph_mba/fpa.json": { jobs: [{ id: 1, company: "Acme", title: "Programme Manager", skills: ["prog"], sub: [], level: "mid", open: true, snippet: "We optimise the programme" }] },
    "data/graph_mba/_evidence.json": { prog: { early: [{ text: "You will organise the programme office", company: "Acme", title: "Programme Manager" }] } },
  };
  const A = atlasFactory({ load: url => url in files ? Promise.resolve(structuredClone(files[url])) : Promise.reject(new Error(url + ": 404")), Matcher });
  const ix = await A.index(); const s = ix.skillById.prog;
  assert.equal(s.name, "Program management"); assert.equal(s.what, "You organize the program.");
  assert.equal(s.ladder.corporate.mid, "You prioritize artifacts."); assert.equal(s.build.corporate[0].text, "Read the organization's license.");
  assert.deepEqual(s.subskills[0], { id: "s1", name: "Labor planning", example: "Modeled the labor cost" });
  assert.deepEqual(s.how_shown.artefacts, ["program plan"]);
  assert.equal(s.fields.finance.reads_as, "the behaviors a center asks for"); assert.equal(s.fields.finance.line, "Optimized 3 programs");
  assert.deepEqual(s.signals, ["Analyzed the catalog"]);
  assert.equal(ix.M.clusters.delivery.label, "Delivery & organization");
  assert.equal(ix.SUBS.prog[0].name, "Labor planning");
  const R = await A.role("fpa");
  assert.equal(R.jobs[0].title, "Programme Manager", "a posting's title is the employer's"); assert.equal(R.jobs[0].snippet, "We optimise the programme");
  const ev = await R.evidence("prog");
  assert.equal(ev.early[0].text, "You will organise the programme office", "a quoted posting sentence is left as written");
});

// ---------- a pasted posting (PLAN.md v16, step 9): read like a syllabus, with the sub-skills it names ----------
test("readPosting reads a posting the way readCourse reads a syllabus and adds the sub-skills it names", async () => {
  const A = realAtlasFor(); 
  const text = "Senior Financial Analyst, FP&A. Own the monthly forecast and the annual budget; build driver-based models; present variance analysis to the CFO; SQL and Tableau a plus. Strong communication and teamwork.";
  const r = await A.readPosting(text);
  assert.ok(r.found instanceof Set && r.found.size > 0);
  assert.ok(r.teaches instanceof Set && r.named instanceof Set && r.subs instanceof Set);
  assert.ok(r.found.has("budgeting_forecasting") || r.found.has("variance_analysis"), [...r.found].join(","));
  assert.ok(r.named.has("communication") || r.named.has("collaboration"), "a behaviour the posting names is named, not taught: " + [...r.named].join(","));
  for (const k of r.teaches) assert.ok(!r.named.has(k));
  assert.equal(r.found.size, r.teaches.size + r.named.size + r.other.size);
  // the posting reader runs the taxonomy's own patterns only: a resume-language extra of the matcher never fires on it
  const loose = await A.readPosting("We serve customers across segments and geographies. Equal opportunity employer; we do not discriminate on the basis of national origin.");
  assert.ok(!loose.found.has("personas_jtbd"), "a bare 'segments' is a resume-mode extra, not the taxonomy's pattern");
  assert.ok(!loose.found.has("public_sector") && !loose.found.has("hr_compliance"), "the EEO line is boilerplate and is cut: " + [...loose.found].join(","));
});
