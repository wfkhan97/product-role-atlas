// web/atlas.js: the share statistics behind every number on a role screen, and the cache of data files.
// Inline fixtures: a loader that counts its calls and can fail on demand stands in for fetch.
import test from "node:test";
import assert from "node:assert/strict";
import { atlasFactory } from "./_load.mjs";

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
  const files = { ...INDEX, "data/subskills.json": {}, "data/graph.json": { families: { pm: "Product manager" }, skills: [{ id: "roadmap", name: "Roadmapping", cluster: "strategy", by_family: { pm: 1 } }], jobs: [{ family: "pm", company: "Acme", skills: ["roadmap"], level: "mid" }] } };
  const { load } = loader(files, { "data/graph.json": 1 });
  const A = atlasFactory({ load, Matcher: null });
  await assert.rejects(A.product(), /503/);
  const P = await A.product();
  assert.deepEqual(P.G.jobs.map(j => j.family), ["pm"]);
  assert.equal((await A.index()).roles.pm.set, "product");
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
