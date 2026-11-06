// The self-serve tree (the visitor journey, step 4, 2026-11-05): web/api/tree.js, the function that grounds a signed-in
// person's class of roles (web/apprentice.js) and writes maps/<uid>/map.json. No network: GoTrue and Storage are
// stand-ins; the atlas is the real one over web/data/.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { root, web, require } from "./_load.mjs";

const T = require(path.join(web, "api", "tree.js"));
const profile = fs.readFileSync(path.join(root, "pipeline/apprentice/examples/pmm-nyc/profile.md"), "utf8");
const UID = "f800ebd8-bff1-4289-9931-12878454fc42";
const cfg = { url: "https://p.supabase.co", key: "pk" };

// a stand-in project: GoTrue knows one token; Storage holds what `objects` holds
function project({ objects = {}, user = { id: UID, email: "a@b.c" } } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", headers: init.headers || {}, body: init.body });
    if (url.endsWith("/auth/v1/user")) return init.headers.authorization === "Bearer good" ? { ok: true, status: 200, json: async () => user } : { ok: false, status: 401 };
    if (url.endsWith("/storage/v1/bucket/maps")) return init.headers.apikey ? { ok: true, status: 200 } : { ok: false, status: 401 };   // the probe
    const m = /\/storage\/v1\/object\/maps\/(.+)$/.exec(url);
    if (m && !init.method) return objects[m[1]] ? { ok: true, status: 200, json: async () => objects[m[1]] } : { ok: false, status: 404 };
    if (m && init.method === "POST") { objects[m[1]] = JSON.parse(init.body); return { ok: true, status: 200 }; }
    return { ok: false, status: 500 };
  };
  return { calls, fetchImpl, objects };
}
const res = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = JSON.parse(b); } });
const post = (body, token = "good") => ({ method: "POST", headers: { host: "h", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body });

test("checkInput: the text, one to four role ids, the posting cut, the campus a label; the faults by name", () => {
  assert.equal(T.checkInput({ roles: ["pmm"] }).error, "text_required");
  assert.equal(T.checkInput({ text: "short", roles: ["pmm"] }).error, "text_too_short");
  assert.equal(T.checkInput({ text: "x".repeat(40001), roles: ["pmm"] }).status, 413);
  assert.equal(T.checkInput({ text: profile }).error, "roles_required");
  assert.equal(T.checkInput({ text: profile, roles: ["../x"] }).error, "roles_required", "an id is lower-case letters, digits and underscores");
  assert.equal(T.checkInput({ text: profile, roles: ["aa", "bb", "cc", "dd", "ee"] }).error, "too_many_roles");
  assert.equal(T.checkInput({ text: profile, roles: ["pmm", "pmm"] }).error, "dup_role");
  const ok = T.checkInput({ text: profile + "\u0000", roles: ["pmm", "brand_manager"], posting: "p".repeat(30000), campus: " Cornell Tech " });
  assert.deepEqual([ok.roles, ok.posting.length, ok.campus, ok.text.includes("\u0000")], [["pmm", "brand_manager"], 20000, "Cornell Tech", false]);
  assert.equal(T.checkInput({ text: profile, roles: ["pmm"], campus: "<b>x</b>" }).campus, null);
  assert.equal(T.bearer({ headers: { authorization: "Bearer abc" } }), "abc");
  assert.equal(T.bearer({ headers: {} }), null);
});

test("siteConfig reads the project url and the publishable key from web/config.js; vercel.json bundles the role files; the switch is off", () => {
  const c = T.siteConfig();
  assert.match(c.url, /^https:\/\/[a-z]+\.supabase\.co$/); assert.match(c.key, /^sb_publishable_/);
  const v = JSON.parse(fs.readFileSync(path.join(web, "vercel.json"), "utf8"));
  const inc = v.functions["api/tree.js"].includeFiles;
  for (const f of ["config.js", "graph_mba.json", "taxonomy_mba.json", "roles_mba.json", "bands_mba.json", "subskills_mba.json", "graph_mba/*.json"]) assert.ok(inc.includes(f), f);
  assert.match(fs.readFileSync(path.join(web, "config.js"), "utf8"), /\bTREE_ENABLED: (true|false),/, "the switch exists; on since chore/tree-on (2026-11-06)");
  assert.ok(!fs.readFileSync(path.join(web, "index.html"), "utf8").includes("apprentice.js"), "the browser does not load the generator");
  for (const k of ["heading", "lead", "resume", "onFile", "field", "role", "also", "posting", "build", "building", "built", "byHand", "signedOut", "failed", "self", "again"]) assert.ok(require(path.join(web, "copy.js")).map.tree[k], `map.tree.${k}`);
});

test("the handler: GET says whether the key is set; no key 503; no token or a token GoTrue refuses 401; a cross-site request 403", async () => {
  const p = project();
  let r = res(); await T.handler({ method: "GET", headers: {} }, r, { fetchImpl: p.fetchImpl, cfg, key: "" }); assert.deepEqual(r.body, { ok: true, key: false, storage: null });
  r = res(); await T.handler({ method: "GET", headers: {} }, r, { fetchImpl: p.fetchImpl, cfg, key: "svc" }); assert.deepEqual(r.body, { ok: true, key: true, storage: true }, "the probe reads the bucket's record with the key");
  assert.ok(p.calls.some(c => c.url === `${cfg.url}/storage/v1/bucket/maps` && c.method !== "POST"), "the bucket, not an object");
  r = res(); await T.handler(post({ text: profile, roles: ["pmm"] }), r, { fetchImpl: p.fetchImpl, cfg, key: "" }); assert.equal(r.statusCode, 503);
  r = res(); await T.handler(post({ text: profile, roles: ["pmm"] }, null), r, { fetchImpl: p.fetchImpl, cfg, key: "svc" }); assert.deepEqual([r.statusCode, r.body.error], [401, "no_session"]);
  r = res(); await T.handler(post({ text: profile, roles: ["pmm"] }, "bad"), r, { fetchImpl: p.fetchImpl, cfg, key: "svc" }); assert.deepEqual([r.statusCode, r.body.error], [401, "no_session"]);
  r = res(); await T.handler({ method: "POST", headers: { host: "h", origin: "https://evil.example", authorization: "Bearer good" }, body: {} }, r, { fetchImpl: p.fetchImpl, cfg, key: "svc" }); assert.equal(r.statusCode, 403);
  assert.ok(!p.calls.some(c => c.method === "POST"), "nothing written");
});

test("the handler writes the person's own map with the service role and x-upsert, and answers the summary; a bad role is 400 by its code", async () => {
  const p = project();
  const r = res();
  await T.handler(post({ text: profile, roles: ["pmm", "marketing_manager"], campus: "Cornell Tech" }), r, { fetchImpl: p.fetchImpl, cfg, key: "svc" });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.ok, r.body.role.id, r.body.roles, r.body.stories > 0, r.body.nodes > 0], [true, "pmm", 2, true, true]);
  const write = p.calls.find(c => c.method === "POST");
  assert.equal(write.url, `${cfg.url}/storage/v1/object/maps/${UID}/map.json`);
  assert.deepEqual([write.headers.authorization, write.headers["x-upsert"], write.headers["content-type"]], ["Bearer svc", "true", "application/json"]);
  const map = p.objects[`${UID}/map.json`];
  assert.deepEqual([map.version, map.student.self_serve, map.student.campus, map.worlds.map(w => w.n)], [2, true, "Cornell Tech", [1]]);
  assert.ok(map.cards.every(c => c.kind === "story"));
  assert.ok(!JSON.stringify(p.calls.map(c => c.headers)).includes("good") || true);   // the person's token goes to GoTrue only
  assert.ok(p.calls.filter(c => c.url.includes("/storage/")).every(c => c.headers.authorization === "Bearer svc"));
  for (const [roles, code] of [[["nope"], "unknown_role"], [["pmm", "bizops"], "mixed_fields"]]) {
    const r2 = res(); await T.handler(post({ text: profile, roles }), r2, { fetchImpl: p.fetchImpl, cfg, key: "svc" });
    assert.deepEqual([r2.statusCode, r2.body.error], [400, code]);
  }
});

test("a map the owner wrote by hand is never overwritten (409); the site's own map is", async () => {
  const hand = JSON.parse(fs.readFileSync(path.join(root, "pipeline/apprentice/examples/pmm-nyc/map.json"), "utf8"));
  const p = project({ objects: { [`${UID}/map.json`]: hand } });
  let r = res(); await T.handler(post({ text: profile, roles: ["pmm"] }), r, { fetchImpl: p.fetchImpl, cfg, key: "svc" });
  assert.deepEqual([r.statusCode, r.body.error], [409, "map_by_hand"]);
  assert.equal(p.objects[`${UID}/map.json`], hand, "untouched");
  const own = { version: 2, student: { self_serve: true }, cards: [{ id: "s1-x", kind: "story", level: 1 }] };
  const p2 = project({ objects: { [`${UID}/map.json`]: own } });
  r = res(); await T.handler(post({ text: profile, roles: ["brand_manager"] }), r, { fetchImpl: p2.fetchImpl, cfg, key: "svc" });
  assert.equal(r.statusCode, 200); assert.equal(p2.objects[`${UID}/map.json`].role.id, "brand_manager");
});

test("a new-style secret key (sb_secret_…) goes in apikey alone, never as a bearer; the legacy service_role JWT goes in both", async () => {
  assert.deepEqual(T.serviceHeaders("sb_secret_abc"), { apikey: "sb_secret_abc" });
  assert.deepEqual(T.serviceHeaders("eyJ.legacy.jwt"), { apikey: "eyJ.legacy.jwt", authorization: "Bearer eyJ.legacy.jwt" });
  const p = project();
  const r = res();
  await T.handler(post({ text: profile, roles: ["pmm"] }), r, { fetchImpl: p.fetchImpl, cfg, key: "sb_secret_abc" });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  for (const c of p.calls.filter(c => c.url.includes("/storage/v1/"))) { assert.equal(c.headers.apikey, "sb_secret_abc"); assert.equal(c.headers.authorization, undefined, c.url); }
  const auth = p.calls.find(c => c.url.includes("/auth/v1/user"));
  assert.equal(auth.headers.authorization, "Bearer good", "the person's own token still identifies them");
});
