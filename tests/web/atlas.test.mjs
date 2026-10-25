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
