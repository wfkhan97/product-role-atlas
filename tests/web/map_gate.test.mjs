// web/auth.js and the map gate (the build plan's B2): the magic link's landing read into a session, the refused copy,
// the feedback object and its path, MapGate's table, the requests made with a fake fetch, the routes, the switch in
// config.js, the shell naming auth.js and no remote auth library, and the bucket's policies in the migration.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web, root } from "./_load.mjs";

const authFactory = require(path.join(web, "auth.js"));
const Copy = require(path.join(web, "copy.js"));
const { parseRoute } = require(path.join(web, "app.js"));
const CFG = { SUPABASE_URL: "https://x.supabase.co/", SUPABASE_PUBLISHABLE_KEY: "pk", MAPS_ENABLED: true };
const UID = "11111111-aaaa-4aaa-8aaa-111111111111";
const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);
const b64url = o => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = payload => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.sig`;
const TOKEN = jwt({ sub: UID, email: "student@example.com", exp: NOW / 1000 + 3600, role: "authenticated" });
const memStorage = () => { const m = {}; return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => typeof body === "string" ? body : JSON.stringify(body), json: async () => typeof body === "string" ? JSON.parse(body) : body });
function makeAuth(answer, opts = {}) {
  const calls = [], storage = opts.storage || memStorage();
  const A = authFactory({ fetch: async (url, init = {}) => { calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); return answer(url, init); }, config: () => CFG, storage: () => storage, now: () => opts.now || NOW, location: () => ({ origin: "https://site.example", pathname: "/atlas/", search: "?x=1", hash: "#/signin" }) });
  return { A, calls, storage };
}
const Pure = authFactory({});

test("sessionFromHash: the implicit flow's landing, bare or after #/map, read into the five fields", () => {
  const frag = `access_token=${TOKEN}&expires_at=${NOW / 1000 + 3600}&expires_in=3600&refresh_token=r1&token_type=bearer&type=magiclink`;
  const want = { access_token: TOKEN, refresh_token: "r1", expires_at: NOW / 1000 + 3600, uid: UID, email: "student@example.com" };
  assert.deepEqual(Pure.sessionFromHash("#" + frag, NOW), want);
  assert.deepEqual(Pure.sessionFromHash("#/map#" + frag, NOW), want, "GoTrue appends #… to a redirect that already has #/map");
  const noAt = Pure.sessionFromHash(`#access_token=${TOKEN}&expires_in=600&refresh_token=r1&type=magiclink`, NOW);
  assert.equal(noAt.expires_at, NOW / 1000 + 600, "expires_in counts from now when expires_at is missing");
  for (const h of ["", "#/map", "#/skills?all=1", "#access_token=&refresh_token=r", "#access_token=not-a-jwt"]) assert.equal(Pure.sessionFromHash(h, NOW), null, h);
});

test("errorFromHash: a spent or expired link; takeHash keeps a session and says which it was", () => {
  assert.deepEqual(Pure.errorFromHash("#/map#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"), { error: "access_denied", code: "otp_expired", description: "Email link is invalid or has expired" });
  assert.equal(Pure.errorFromHash("#/map"), null);
  const { A, storage } = makeAuth(() => reply(200, {}));
  assert.equal(A.takeHash("#/skills"), null);
  assert.equal(A.stored(), null);
  assert.equal(A.takeHash(`#access_token=${TOKEN}&expires_in=3600&refresh_token=r1&type=magiclink`), "session");
  assert.equal(JSON.parse(storage.m["maps.session"]).uid, UID, "stored under maps.session");
  assert.equal(A.stored().email, "student@example.com");
  assert.equal(A.takeHash("#error=access_denied&error_code=otp_expired"), "error");
});

test("redirectTo: the site's own address, its query and hash dropped, then #/map", () => {
  assert.equal(Pure.redirectTo({ origin: "https://site.example", pathname: "/atlas/", search: "?x=1", hash: "#/signin" }), "https://site.example/atlas/#/map");
});

test("refusedMessage: an address with no invite reads as the refused copy; too many emails as the wait; any other answer as the service line, never the connection", () => {
  assert.equal(Copy.signin.refused, "This email has no invite.");
  assert.equal(Pure.refusedMessage({ code: 422, error_code: "otp_disabled", msg: "Signups not allowed for otp" }), Copy.signin.refused);
  assert.equal(Pure.refusedMessage("Signups not allowed for otp"), Copy.signin.refused);
  assert.equal(Pure.refusedMessage({ error: "invalid_request", error_description: "User not found" }), Copy.signin.refused);
  // C-13, the sign-in said "Check your connection" on a rate limit: GoTrue's 429 reads as the wait
  assert.equal(Pure.refusedMessage({ code: 429, error_code: "over_email_send_rate_limit", msg: "Email rate limit exceeded" }), Copy.signin.rateLimited);
  assert.equal(Pure.refusedMessage({ error_code: "over_email_send_rate_limit" }), Copy.signin.rateLimited);
  assert.equal(Pure.refusedMessage({ code: 429, error_code: "over_email_send_rate_limit", msg: "For security purposes, you can only request this after 30 seconds." }), Copy.fill(Copy.signin.rateWait, { n: 30 }), "GoTrue's own seconds");
  assert.equal(Copy.signin.rateLimited, "Too many emails sent. Try again in an hour.");
  for (const b of [{ code: 500, msg: "Error sending magic link email" }, "boom", "", null, undefined]) assert.equal(Pure.refusedMessage(b), Copy.signin.serviceFailed, JSON.stringify(b));
  for (const b of [{ error_code: "over_email_send_rate_limit" }, { msg: "boom" }, "", null]) assert.notEqual(Pure.refusedMessage(b), Copy.signin.failed, "the connection line is for a network failure alone");
});

test("feedbackPath: <uid>/feedback/<card>.json; a card id is lower-case letters, digits, hyphens and underscores", () => {
  assert.equal(Pure.feedbackPath(UID, "l2-battlecard"), `${UID}/feedback/l2-battlecard.json`);
  // 2026-11-10: a story card's id carries its skill id's underscores, which the bucket's policy refuses in a file name
  // (name ~ '^[0-9a-f-]+/feedback/[a-z0-9-]+\.json$'): the name writes them as hyphens
  assert.equal(Pure.feedbackPath(UID, "s1-positioning_messaging"), `${UID}/feedback/s1-positioning-messaging.json`);
  const policy = /^[0-9a-f-]+\/feedback\/[a-z0-9-]+\.json$/;
  for (const id of ["l2-battlecard", "s1-customer_facing_exec", "l4-library"]) assert.match(Pure.feedbackPath(UID, id), policy, id);
  for (const bad of ["", "L2", "../map", "a/b", "a.json", "a b", null]) assert.throws(() => Pure.feedbackPath(UID, bad), /card id/, String(bad));
  assert.throws(() => Pure.feedbackPath("", "l1-gtm"), /user id/);
  assert.throws(() => Pure.feedbackPath("../x", "l1-gtm"), /user id/);
});

test("feedbackObject: { card, choice, link (shipped only), date }; the choice one of four; a shipped mark needs a link", () => {
  assert.deepEqual(Pure.feedbackObject("l1-gtm", "start", null, "2026-11-10"), { card: "l1-gtm", choice: "start", date: "2026-11-10" });
  assert.deepEqual(Pure.feedbackObject("l1-gtm", "shipped", "  agentio-read.notion.site/page  ", "2026-11-10"), { card: "l1-gtm", choice: "shipped", link: "https://agentio-read.notion.site/page", date: "2026-11-10" });
  assert.deepEqual(Object.keys(Pure.feedbackObject("l1-gtm", "skip", "https://x.example", new Date(NOW))), ["card", "choice", "date"], "a link only goes up with shipped");
  assert.equal(Pure.feedbackObject("l1-gtm", "open", null, new Date(NOW)).date, "2026-11-03");
  assert.deepEqual(Pure.CHOICES, ["start", "shipped", "skip", "open"]);
  for (const bad of ["", "not a link", "javascript:alert(1)", "https://nohost", "https://a b.com", "ftp://x.example/f", "https://x.example/" + "a".repeat(600)]) assert.throws(() => Pure.feedbackObject("l1-gtm", "shipped", bad, "2026-11-10"), /link/, bad);
  for (const old of ["build", "not", "change", "maybe"]) assert.throws(() => Pure.feedbackObject("l1-gtm", old, "", "2026-11-04"), /choice/, `${old}: old shapes are read, never written`);
  assert.throws(() => Pure.feedbackObject("../x", "start", "", "2026-11-04"), /card id/);
});

test("cleanLink: an http(s) link with a host, a bare host made https, anything else null", () => {
  assert.equal(Pure.cleanLink("https://claude.ai/public/artifacts/abc"), "https://claude.ai/public/artifacts/abc");
  assert.equal(Pure.cleanLink("http://example.com"), "http://example.com");
  assert.equal(Pure.cleanLink("me.github.io/battlecard"), "https://me.github.io/battlecard");
  for (const bad of [null, "", "   ", "foo", "http://x", "https://x y.com", "mailto:a@b.com", "javascript:alert(1)//x.com"]) assert.equal(Pure.cleanLink(bad), null, String(bad));
});

test("MapGate.next: off, the launcher; no session, the sign-in; a session and a map, the map; no map yet, waiting", () => {
  const G = Pure.MapGate;
  const S = { uid: UID };
  assert.equal(G.next({ enabled: false, session: S, hasMap: true }), "launcher");
  assert.equal(G.next({ enabled: false }), "launcher");
  assert.equal(G.next({ enabled: true, session: null, hasMap: true }), "signin");
  assert.equal(G.next({ enabled: true, session: S, hasMap: true }), "map");
  assert.equal(G.next({ enabled: true, session: S, hasMap: false }), "waiting");
  assert.equal(G.next(), "launcher");
});

// C-12, the map sent a visitor to the sign-in without the place it came from
test("MapGate.signinHash and landing: the map's own address goes to the sign-in as next and comes back; nothing else does", () => {
  const G = Pure.MapGate;
  assert.equal(G.signinHash("#/map?build=1&role=product.pm"), "#/signin?next=" + encodeURIComponent("#/map?build=1&role=product.pm"));
  // the plain map goes as next too (2026-11-10): the code sign-in returns to `next` alone, and Build skills is #/map
  assert.equal(G.signinHash("#/map"), "#/signin?next=" + encodeURIComponent("#/map"));
  for (const h of ["", null, "#/jobs", "#/signin?next=x", "https://evil.example/#/map", "#/map?x=<script>", "#/mapx", "#/map/other", "#/map/tree/x"]) assert.equal(G.signinHash(h), "#/signin", String(h));
  // the map's two pages (2026-11-10) keep their place through the sign-in
  for (const h of ["#/map/tree", "#/map/quests?q=l2-battlecard", "#/map/tree?view=list"]) { assert.equal(G.signinHash(h), "#/signin?next=" + encodeURIComponent(h), h); assert.equal(G.landing(h), h, h); }
  assert.equal(G.landing("#/map?build=1&role=product.pm"), "#/map?build=1&role=product.pm");
  for (const h of ["", null, undefined, "#/jobs", "javascript:alert(1)", "#/map#access_token=x"]) assert.equal(G.landing(h), "#/map", String(h));
  const back = new URLSearchParams(G.signinHash("#/map?build=1&role=product.pm").split("?").slice(1).join("?")).get("next");
  assert.equal(G.landing(back), "#/map?build=1&role=product.pm", "the round trip keeps the form and its role");
});

test("sendLink posts /auth/v1/otp with create_user false and the redirect; refused and failed answers read as copy", async () => {
  const { A, calls } = makeAuth(() => reply(200, {}));
  assert.deepEqual(await A.sendLink(" student@example.com "), { ok: true });
  assert.equal(calls.length, 1);
  const [base, q] = calls[0].url.split("?");
  assert.equal(base, "https://x.supabase.co/auth/v1/otp");
  assert.equal(new URLSearchParams(q).get("redirect_to"), "https://site.example/atlas/#/map");
  assert.deepEqual(calls[0].body, { email: "student@example.com", create_user: false });
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.apikey, "pk");
  assert.deepEqual(await makeAuth(() => reply(422, { error_code: "otp_disabled", msg: "Signups not allowed for otp" })).A.sendLink("nobody@example.com"), { ok: false, message: Copy.signin.refused });
  assert.deepEqual(await makeAuth(() => reply(500, "boom")).A.sendLink("a@example.com"), { ok: false, message: Copy.signin.serviceFailed });
  assert.deepEqual(await makeAuth(() => reply(429, { code: 429, error_code: "over_email_send_rate_limit", msg: "Email rate limit exceeded" })).A.sendLink("a@example.com"), { ok: false, message: Copy.signin.rateLimited });
  assert.deepEqual(await makeAuth(() => { throw new TypeError("Failed to fetch"); }).A.sendLink("a@example.com"), { ok: false, message: Copy.signin.failed }, "no network: the plain failure, never a rejection");
  const none = makeAuth(() => reply(200, {}));
  assert.equal((await none.A.sendLink("not an email")).ok, false);
  assert.equal(none.calls.length, 0, "a malformed address sends nothing");
});

// ---------- the code flow (the visitor journey, step 2, 2026-11-05) ----------
test("sendCode posts /auth/v1/otp with create_user true and no redirect; sign-ups off reads as the refused copy, a rate limit as the wait, another answer as the service line, no network as the connection line", async () => {
  const S = Copy.signin;
  const ok = makeAuth(async () => reply(200, {}));
  assert.deepEqual(await ok.A.sendCode(" Student@Example.com "), { ok: true });
  assert.equal(ok.calls[0].url, "https://x.supabase.co/auth/v1/otp", "no redirect_to: the code is typed on the page");
  assert.deepEqual(ok.calls[0].body, { email: "Student@Example.com", create_user: true });
  assert.equal(ok.calls[0].init.headers.apikey, "pk");
  assert.deepEqual(await makeAuth(async () => reply(422, { code: 422, msg: "Signups not allowed for otp" })).A.sendCode("a@b.co"), { ok: false, message: S.codeRefused });
  assert.deepEqual(await makeAuth(async () => reply(429, { error_code: "over_email_send_rate_limit" })).A.sendCode("a@b.co"), { ok: false, message: S.rateLimited });
  assert.deepEqual(await makeAuth(async () => reply(500, "boom")).A.sendCode("a@b.co"), { ok: false, message: S.serviceFailed });
  assert.deepEqual(await makeAuth(async () => { throw new Error("offline"); }).A.sendCode("a@b.co"), { ok: false, message: S.failed });
  const bad = makeAuth(async () => reply(200, {}));
  assert.deepEqual(await bad.A.sendCode("not an email"), { ok: false, message: S.invalid });
  assert.equal(bad.calls.length, 0);
});

test("verifyCode posts /auth/v1/verify with type email and keeps the session; a wrong code reads as its line and keeps nothing", async () => {
  const S = Copy.signin;
  const good = makeAuth(async () => reply(200, { access_token: TOKEN, refresh_token: "r9", expires_in: 3600, expires_at: NOW / 1000 + 3600, user: { id: UID, email: "student@example.com" } }));
  const r = await good.A.verifyCode("student@example.com", " 123 456 ");
  assert.equal(r.ok, true);
  assert.equal(good.calls[0].url, "https://x.supabase.co/auth/v1/verify");
  assert.deepEqual(good.calls[0].body, { type: "email", email: "student@example.com", token: "123456" });
  assert.deepEqual(r.session, { access_token: TOKEN, refresh_token: "r9", expires_at: NOW / 1000 + 3600, uid: UID, email: "student@example.com" });
  assert.deepEqual(good.A.stored(), r.session, "kept under maps.session, the shape the map reads");
  const wrong = makeAuth(async () => reply(403, { error_code: "otp_expired", msg: "Token has expired or is invalid" }));
  assert.deepEqual(await wrong.A.verifyCode("student@example.com", "000000"), { ok: false, message: S.codeWrong });
  assert.equal(wrong.A.stored(), null);
  const short = makeAuth(async () => reply(200, {}));
  assert.deepEqual(await short.A.verifyCode("student@example.com", "12"), { ok: false, message: S.codeWrong }, "six digits or nothing is sent");
  assert.equal(short.calls.length, 0);
  assert.deepEqual(await makeAuth(async () => reply(500, "boom")).A.verifyCode("a@b.co", "123456"), { ok: false, message: S.serviceFailed });
  assert.deepEqual(await makeAuth(async () => { throw new TypeError("Failed to fetch"); }).A.verifyCode("a@b.co", "123456"), { ok: false, message: S.failed }, "no network: the connection line");
  const noUid = makeAuth(async () => reply(200, { access_token: "not.a.jwt", refresh_token: "r" }));
  assert.deepEqual(await noUid.A.verifyCode("a@b.co", "123456"), { ok: false, message: S.failed });
});

test("session(): kept as is far from expiry; refreshed within five minutes; a refused refresh forgets it", async () => {
  const fresh = { access_token: TOKEN, refresh_token: "r1", expires_at: NOW / 1000 + 3600, uid: UID, email: "student@example.com" };
  const storage = memStorage(); storage.setItem("maps.session", JSON.stringify(fresh));
  const a = makeAuth(() => reply(200, {}), { storage });
  assert.deepEqual(await a.A.session(), fresh);
  assert.equal(a.calls.length, 0, "no request while the token has time left");
  const soon = { ...fresh, expires_at: NOW / 1000 + 120 };
  const s2 = memStorage(); s2.setItem("maps.session", JSON.stringify(soon));
  const NEW = jwt({ sub: UID, email: "student@example.com" });
  const b = makeAuth(() => reply(200, { access_token: NEW, refresh_token: "r2", expires_in: 3600, expires_at: NOW / 1000 + 3600, user: { id: UID, email: "student@example.com" } }), { storage: s2 });
  const got = await b.A.session();
  assert.equal(b.calls[0].url, "https://x.supabase.co/auth/v1/token?grant_type=refresh_token");
  assert.deepEqual(b.calls[0].body, { refresh_token: "r1" });
  assert.deepEqual([got.access_token, got.refresh_token, got.expires_at, got.uid], [NEW, "r2", NOW / 1000 + 3600, UID]);
  assert.equal(JSON.parse(s2.m["maps.session"]).refresh_token, "r2", "the refreshed session is kept");
  const s3 = memStorage(); s3.setItem("maps.session", JSON.stringify(soon));
  const c = makeAuth(() => reply(400, { error: "invalid_grant" }), { storage: s3 });
  assert.equal(await c.A.session(), null);
  assert.equal(s3.m["maps.session"], undefined, "a refused refresh forgets the session");
  const s4 = memStorage(); s4.setItem("maps.session", JSON.stringify(soon));
  const d = makeAuth(() => { throw new TypeError("offline"); }, { storage: s4 });
  assert.equal((await d.A.session()).refresh_token, "r1", "offline, a token with time left still serves");
  assert.equal(await makeAuth(() => reply(200, {})).A.session(), null, "nothing on file, nothing sent");
});

test("readMap and readFeedback: the person's folder with their token; null when missing, a rejection otherwise", async () => {
  const S = { access_token: TOKEN, uid: UID };
  const ok = makeAuth(() => reply(200, { version: 2 }));
  assert.deepEqual(await ok.A.readMap(S), { version: 2 });
  assert.equal(ok.calls[0].url, `https://x.supabase.co/storage/v1/object/authenticated/maps/${UID}/map.json`);
  assert.equal(ok.calls[0].init.headers.Authorization, "Bearer " + TOKEN);
  assert.equal(ok.calls[0].init.headers.apikey, "pk");
  assert.equal(await makeAuth(() => reply(404, { message: "Object not found" })).A.readMap(S), null);
  assert.equal(await makeAuth(() => reply(400, { statusCode: "404", error: "not_found", message: "Object not found" })).A.readMap(S), null);
  await assert.rejects(makeAuth(() => reply(400, { error: "InvalidJWT" })).A.readMap(S), /400/);
  await assert.rejects(makeAuth(() => reply(500, "x")).A.readMap(S), /500/);
  const fb = makeAuth(() => reply(200, { card: "l1-gtm", choice: "build", note: "", date: "2026-11-04" }));
  assert.equal((await fb.A.readFeedback(S, "l1-gtm")).choice, "build");
  assert.equal(fb.calls[0].url, `https://x.supabase.co/storage/v1/object/authenticated/maps/${UID}/feedback/l1-gtm.json`);
  await assert.rejects(makeAuth(() => reply(200, {})).A.readMap(null), /session/);
});

test("writeFeedback posts the object to maps/<uid>/feedback/<card>.json with x-upsert", async () => {
  const S = { access_token: TOKEN, uid: UID };
  const w = makeAuth(() => reply(200, { Key: "x" }));
  const obj = Pure.feedbackObject("l2-battlecard", "shipped", "https://me.github.io/battlecard", "2026-11-05");
  assert.equal(await w.A.writeFeedback(S, "l2-battlecard", obj), true);
  assert.equal(w.calls[0].url, `https://x.supabase.co/storage/v1/object/maps/${UID}/feedback/l2-battlecard.json`);
  assert.equal(w.calls[0].init.method, "POST");
  assert.equal(w.calls[0].init.headers["x-upsert"], "true");
  assert.equal(w.calls[0].init.headers.Authorization, "Bearer " + TOKEN);
  assert.deepEqual(w.calls[0].body, obj);
  await assert.rejects(makeAuth(() => reply(403, "denied")).A.writeFeedback(S, "l2-battlecard", obj), /403/);
  await assert.rejects(makeAuth(() => reply(200, {})).A.writeFeedback(S, "../map", obj), /card id/);
});

test("signOut forgets the session here and tells GoTrue", async () => {
  const storage = memStorage(); storage.setItem("maps.session", JSON.stringify({ access_token: TOKEN, uid: UID }));
  const o = makeAuth(() => reply(204, ""), { storage });
  await o.A.signOut();
  assert.equal(o.A.stored(), null);
  assert.equal(o.calls[0].url, "https://x.supabase.co/auth/v1/logout");
});

test("the routes: #/map is a screen, #/signin stays one, #/skills keeps its query, and route() dispatches both", () => {
  assert.equal(parseRoute("#/map").name, "map");
  assert.equal(parseRoute("#/signin").name, "signin");
  assert.equal(parseRoute("#/signin?expired=1").query.expired, "1");
  const all = parseRoute("#/skills?field=marketing");
  assert.equal(all.name, "skills"); assert.equal(all.query.field, "marketing");
  assert.equal(parseRoute("#access_token=abc&type=magiclink").name, "home", "a landing hash is caught by route() before it gets here");
  const src = fs.readFileSync(path.join(web, "app.js"), "utf8");
  const table = src.match(/const go = \{([^}]*)\}\[name\]/)[1];
  assert.match(table, /\bmap: mapScreen\b/);
  assert.match(table, /signin: \(\) => mapsOn\(\) \? signinScreen\(\) : ClassScreens\.signin\(shellCtx\)/);
  const r = src.indexOf("function route()"), take = src.indexOf("Auth.takeHash(location.hash)", r), parse = src.indexOf("Routes.parseRoute(location.hash)", r);
  assert.ok(take > r && take < parse, "route() takes the landing hash before it parses");
});

test("decision K (2026-11-10): Explore careers never sends a map owner to the map; Build skills follows it in the top bar for every visitor (buildBar)", () => {
  const src = fs.readFileSync(path.join(web, "app.js"), "utf8");
  const launcher = src.slice(src.indexOf("async function skillsScreen()"), src.indexOf("let mapHeld = null"));
  assert.ok(!/toHash\("#\/map/.test(launcher), "no redirect to the map");
  assert.ok(!/mapGate\(\)/.test(launcher) && !/\ball\b === "1"|query\.all/.test(launcher), "no gate read and no ?all=1");
  assert.match(launcher, /const slot = mapsOn\(\) && !accountsOn\(\) && !Auth\.stored\(\) \?/, "the invite line: only for a person who sees no Build skills");
  const bar = src.slice(src.indexOf("function topBar(name)"), src.indexOf("function markVerb"));
  assert.match(bar, /if \(buildBar\(\)\) verbs\.splice\(verbs\.findIndex\(v => v\.key === "skills"\) \+ 1, 0, \{ key: "build", href: "#\/map"/);
});

test("config.js turns the maps on; index.html loads auth.js after capture.js and no remote auth library", () => {
  const cfg = fs.readFileSync(path.join(web, "config.js"), "utf8");
  assert.match(cfg, /\bMAPS_ENABLED: true\b/);
  assert.match(cfg, /\bAUTH_ENABLED: false\b/);
  const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
  const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
  assert.ok(srcs.includes("auth.js"), "index.html names auth.js");
  assert.equal(srcs.indexOf("auth.js"), srcs.indexOf("capture.js") + 1, "right after capture.js");
  assert.ok(srcs.indexOf("auth.js") < srcs.indexOf("app.js"));
  for (const s of srcs.filter(s => /^(https?:)?\/\//.test(s))) assert.ok(!/supabase|gotrue|auth/i.test(s), `a remote auth script: ${s}`);
  assert.ok(!/@supabase|supabase-js|createClient/.test(fs.readFileSync(path.join(web, "auth.js"), "utf8")), "auth.js uses fetch, no library");
});

test("the copy: every string the two screens and the launcher's slot draw is in Copy.signin and Copy.map", () => {
  for (const k of ["heading", "lead", "email", "emailPlaceholder", "button", "sent", "sentTo", "refused", "failed", "expired", "note", "explore"]) assert.ok(Copy.signin[k], `signin.${k}`);
  for (const k of ["questsTitle", "treeTitle", "roleAt", "band", "levelHead", "waiting", "invite", "inviteLink", "signOut"]) assert.ok(Copy.map[k], `map.${k}`);
  for (const k of ["firstHeading", "firstLead"]) assert.ok(Copy.map.tree[k], `map.tree.${k}`);
  assert.equal(Copy.signin.sent, "Check your email for a six-digit code. It works once.");
  // 2026-11-11: the email leads with a code, so the invited page asks for one; the link in it still works
  for (const k of ["sentLink", "code", "codePlaceholder", "verify", "verifying", "codeWrong"]) assert.ok(Copy.signin[k], `signin.${k}`);
  assert.match(fs.readFileSync(path.join(web, "app.js"), "utf8"), /id="si-codeform"[\s\S]{0,1200}Auth\.verifyCode\(email/);
  // decision K (2026-11-10): the top bar's Build skills does the job of the map's own links to the launcher and back
  for (const k of ["others", "back", "crumb"]) assert.ok(!(k in Copy.map), `map.${k} is gone`);
  // B-33, the launcher's "Have an invite? Sign in." read to every visitor: it says what the invite is for
  assert.equal(`${Copy.map.invite} ${Copy.map.inviteLink}`, "Have an invite to Build skills, your private quests and skill tree? Sign in.");
  // C-02, the sign-in gave a visitor without an invite no way forward: what the map is, and a way to ask
  for (const k of ["mapLine", "askInvite", "rateLimited", "rateWait", "serviceFailed"]) assert.ok(Copy.signin[k], `signin.${k}`);
  assert.match(Copy.signin.mapLine, /invite/);
});

test("the migration: a private bucket `maps`, the person's own folder to read, only feedback to write, nothing for anon", () => {
  const sql = fs.readFileSync(path.join(root, "pipeline", "sql", "2026-11-03_maps.sql"), "utf8");
  const code = sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
  assert.match(code, /insert into storage\.buckets \(id, name, public[^)]*\)\s*values \('maps', 'maps', false/);
  const policies = [...code.matchAll(/create policy "[^"]+" on storage\.objects for (\w+) to (\w+)/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(policies, [["select", "authenticated"], ["insert", "authenticated"], ["update", "authenticated"]]);
  assert.ok(!/\banon\b/.test(code), "nothing for anon");
  assert.ok(!/for (delete|all)\b/.test(code), "no delete");
  assert.equal((code.match(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g) || []).length, 4, "every check is the person's own folder");
  assert.equal((code.match(/\(storage\.foldername\(name\)\)\[2\] = 'feedback'/g) || []).length, 3, "writes only under feedback/");
  for (const step of ["Allow new users to sign up", "localhost:8002", "Invite user", "pipeline.map_publish"]) assert.ok(sql.includes(step), step);
});

test("readFeedback: a story card's file under its hyphen name, and an object that names another card reads as none", async () => {
  const S = { access_token: TOKEN, uid: UID };
  const hit = makeAuth(() => reply(200, { card: "s1-a_b", choice: "start", date: "2026-11-10" }));
  assert.deepEqual(await hit.A.readFeedback(S, "s1-a_b"), { card: "s1-a_b", choice: "start", date: "2026-11-10" });
  assert.equal(hit.calls[0].url, `https://x.supabase.co/storage/v1/object/authenticated/maps/${UID}/feedback/s1-a-b.json`);
  assert.equal(await makeAuth(() => reply(200, { card: "s1-a-b", choice: "skip" })).A.readFeedback(S, "s1-a_b"), null, "the other id's file");
  await assert.rejects(makeAuth(() => reply(200, {})).A.readFeedback(S, "../x"), /card id/, "a bad id rejects, never throws");
});

test("2026-11-11: an invited person finds the way in before a session: the top bar for every visitor, and a line on the welcome screen", () => {
  const src = fs.readFileSync(path.join(web, "app.js"), "utf8");
  assert.match(src, /const buildBar = \(\) => treeOn\(\);/);
  assert.match(src, /id="door-invited">\$\{esc\(C\.invited\)\} <a href="\$\{esc\(MapGate\.signinHash\("#\/map"\)\)\}"/);
  assert.ok(Copy.door.invited && Copy.door.invitedLink);
});
