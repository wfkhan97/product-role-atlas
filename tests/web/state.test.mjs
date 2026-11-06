// web/state.js (the visitor journey, step 3): the hash of a résumé, the read rows as the four states, the merge of what
// the browser holds with what the server has, and every request made with a fake fetch: the upserts with the person's
// token, the heart added and removed, the load, the forget. Nothing but the listed columns leaves; no call without a session.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web } from "./_load.mjs";

const factory = require(path.join(web, "state.js"));
const CFG = { SUPABASE_URL: "https://x.supabase.co/", SUPABASE_PUBLISHABLE_KEY: "pk" };
const UID = "11111111-aaaa-4aaa-8aaa-111111111111";
const SESSION = { access_token: "tok", refresh_token: "r", expires_at: 9999999999, uid: UID, email: "a@b.co" };
const HASH = "a".repeat(64);
function make(answer) {
  const calls = [];
  const S = factory({ fetch: async (url, init = {}) => { calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null }); return answer ? answer(url, init) : { ok: true, json: async () => [] }; }, config: () => CFG, crypto: () => globalThis.crypto });
  return { S, calls };
}

test("hash: a SHA-256 of the normalized text, so whitespace and a trailing newline do not make a new résumé", async () => {
  const { S } = make();
  const a = await S.hash("Led the launch.\n\nWrote  the plan."), b = await S.hash("  Led the launch. Wrote the plan.\n");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b);
  assert.notEqual(a, await S.hash("Led the launch. Wrote the plans."));
  assert.equal(await factory({ crypto: () => null }).hash("x"), null, "no WebCrypto, no hash");
});

test("readRows: core and common rows as the four states with one line each; the gaps are the core rows not shown", () => {
  const { S } = make();
  const fit = { rows: [
    { id: "launch", tier: "core", status: "thin", lines: [{ text: "x".repeat(400) }, { text: "second" }] },
    { id: "gtm", tier: "core", status: "gap", lines: [] },
    { id: "sales_enablement", tier: "core", status: "evidenced", lines: [{ text: "Wrote the guide." }] },
    { id: "market_research", tier: "common", status: "transferable", lines: [{ text: "Ran 200 calls." }] },
    { id: "communication", tier: "core", status: "through", lines: [{ text: "Wrote the guide." }] },
    { id: "mba", tier: "diff", status: "evidenced", lines: [{ text: "MBA" }] },
    { id: "Bad Id", tier: "core", status: "gap" },
  ] };
  const { skills, gaps } = S.readRows(fit);
  assert.deepEqual(skills.map(s => [s.id, s.state, !!s.core, s.line ? s.line.length : null]), [
    ["launch", "must evidence better", true, 300], ["gtm", "must build", true, null], ["sales_enablement", "shows", true, 16],
    ["market_research", "shows in other words", false, 14], ["communication", "shows", true, 16]]);
  assert.deepEqual(gaps, ["launch", "gtm"], "a core skill named but not shown, or missing");
  assert.deepEqual(S.readRows(null), { skills: [], gaps: [] });
});

test("merge: the browser's answers win when set, else the server's; hearts are the union; up lists what the server lacks", () => {
  const { S } = make();
  const you = { where: "business", stage: "looking", fields: ["marketing"] };
  const m = S.merge({ you, hearts: ["pmm", "bad id", "fpa"] }, { you: { where: "tech", stage: null, fields: [] }, hearts: ["fpa", "cfo"] });
  assert.deepEqual(m.you, you);
  assert.deepEqual(m.hearts, ["fpa", "cfo", "pmm"]);
  assert.deepEqual(m.up, { you, hearts: ["pmm"] });
  const empty = S.merge({ you: { where: null, stage: null, fields: [] }, hearts: [] }, { you: { where: "tech", stage: null, fields: [] }, hearts: ["fpa"] });
  assert.deepEqual(empty.you, { where: "tech", stage: null, fields: [] }, "unanswered locally: the server's answers");
  assert.deepEqual(empty.up, { you: null, hearts: [] });
  assert.deepEqual(S.merge({ you }, { you }).up.you, null, "the same answers go up again never");
});

test("saveProfile and saveRead upsert the person's row with their token; a malformed hash or role sends nothing", async () => {
  const { S, calls } = make();
  assert.equal(await S.saveProfile(SESSION, { where: "business", stage: "looking", fields: ["marketing", "x"], secret: "no" }, { campus: "cornell", resume_hash: HASH }), true);
  assert.equal(calls[0].url, "https://x.supabase.co/rest/v1/profiles?on_conflict=user_id");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.Authorization, "Bearer tok"); assert.equal(calls[0].headers.apikey, "pk");
  assert.equal(calls[0].headers.Prefer, "resolution=merge-duplicates,return=minimal");
  assert.deepEqual(Object.keys(calls[0].body).sort(), ["campus", "resume_hash", "updated_at", "user_id", "you"]);
  assert.deepEqual(calls[0].body.you, { where: "business", stage: "looking", fields: ["marketing", "x"] }, "only the three answers");
  assert.equal(await S.saveRead(SESSION, { resume_hash: HASH, role_id: "pmm", band: "related", skills: [{ id: "gtm", state: "must build", resume: "SECRET" }, { id: "x", state: "nope" }], gaps: ["gtm"], inferred: ["ai_ml"] }), true);
  assert.equal(calls[1].url, "https://x.supabase.co/rest/v1/reads?on_conflict=user_id,resume_hash,role_id");
  assert.deepEqual(calls[1].body, { user_id: UID, resume_hash: HASH, role_id: "pmm", band: "related", skills: [{ id: "gtm", state: "must build" }], gaps: ["gtm"], inferred: ["ai_ml"] });
  assert.equal(await S.saveRead(SESSION, { resume_hash: "short", role_id: "pmm" }), false);
  assert.equal(await S.saveRead(SESSION, { resume_hash: HASH, role_id: "Bad Id" }), false);
  assert.equal(await S.saveProfile(null, {}), false, "no session, no request");
  assert.equal(calls.length, 2);
});

test("heart adds with an upsert and removes with a delete on the person's own row", async () => {
  const { S, calls } = make();
  assert.equal(await S.heart(SESSION, "pmm", true), true);
  assert.deepEqual([calls[0].method, calls[0].url, calls[0].body], ["POST", "https://x.supabase.co/rest/v1/hearts?on_conflict=user_id,role_id", { user_id: UID, role_id: "pmm" }]);
  assert.equal(await S.heart(SESSION, "pmm", false), true);
  assert.deepEqual([calls[1].method, calls[1].url], ["DELETE", `https://x.supabase.co/rest/v1/hearts?user_id=eq.${UID}&role_id=eq.pmm`]);
  assert.equal(await S.heart(SESSION, "not a role", true), false);
});

test("load reads the three tables and shapes them; forget deletes the person's rows; a refused answer reads as null or false", async () => {
  const data = { profiles: [{ you: { where: "business", stage: null, fields: ["marketing"], extra: 1 }, campus: "cornell", resume_hash: HASH }], hearts: [{ role_id: "pmm" }, { role_id: "fpa" }], reads: [{ role_id: "pmm", resume_hash: HASH, band: "related", created_at: "2026-11-05T00:00:00Z" }] };
  const { S, calls } = make(async (url, init) => init.method === "GET" ? { ok: true, json: async () => data[/rest\/v1\/(\w+)/.exec(url)[1]] } : { ok: true });
  const got = await S.load(SESSION);
  assert.deepEqual(got, { you: { where: "business", stage: null, fields: ["marketing"] }, campus: "cornell", resume_hash: HASH, hearts: ["pmm", "fpa"], reads: [{ role_id: "pmm", resume_hash: HASH, band: "related", created_at: "2026-11-05T00:00:00Z" }] });
  assert.ok(calls.every(c => c.method === "GET" && c.url.includes(`user_id=eq.${UID}`) && c.headers.Authorization === "Bearer tok"));
  assert.equal(await S.forget(SESSION), true);
  assert.deepEqual(calls.slice(3).map(c => [c.method, c.url.replace("https://x.supabase.co/rest/v1/", "")]), [["DELETE", `reads?user_id=eq.${UID}`], ["DELETE", `hearts?user_id=eq.${UID}`], ["DELETE", `profiles?user_id=eq.${UID}`]]);
  const refused = make(async () => ({ ok: false, status: 401 }));
  assert.equal(await refused.S.load(SESSION), null);
  assert.equal(await refused.S.forget(SESSION), false);
  assert.equal(await refused.S.load(null), null);
});

test("the shell loads state.js after auth.js and the migration keeps every table under row-level security for the person's own rows", async () => {
  const fs = await import("fs");
  const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
  assert.ok(html.indexOf('src="auth.js"') < html.indexOf('src="state.js"'));
  const sql = fs.readFileSync(path.join(web, "..", "pipeline", "sql", "2026-11-05_state.sql"), "utf8");
  for (const t of ["profiles", "hearts", "reads"]) {
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`));
    assert.match(sql, new RegExp(`create policy "${t}: own" on public\\.${t} for all to authenticated using \\(user_id = auth\\.uid\\(\\)\\) with check \\(user_id = auth\\.uid\\(\\)\\)`));
  }
  assert.match(sql, /revoke all on public\.profiles, public\.hearts, public\.reads from anon/);
  assert.ok(!/resume_text|resume text/.test(sql), "no column for the résumé's text");
});
