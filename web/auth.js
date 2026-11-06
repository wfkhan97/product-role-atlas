/* Auth: the sign-in and the private store for the apprentice maps (the build plan's B2). A classic script like
   capture.js, loaded after it; it makes no request until a screen calls it (#/signin, #/map and #/skills with a
   session on file). No Supabase library: GoTrue and Storage are plain fetch calls against CONFIG.SUPABASE_URL with the
   publishable key, and the session's own token where a policy needs the person (storage.objects, owner's migration
   pipeline/sql/2026-11-03_maps.sql).
     Auth.sendLink(email)                     a magic link to an invited address only ({ create_user: false }); resolves
                                              { ok: true } or { ok: false, message } (the refused copy or the plain
                                              failure copy), never rejects
     Auth.sendCode(email)                     the visitor journey's sign-in (step 2, 2026-11-05): a six-digit code by
                                              email to any address ({ create_user: true }; GoTrue's email OTP, the
                                              template carrying {{ .Token }}); the same answers as sendLink
     Auth.verifyCode(email, code)             the code typed on the page (/auth/v1/verify, type "email"): keeps the
                                              session and resolves { ok: true, session }, or { ok: false, message }
     Auth.takeHash(hash)                      the link's landing (#access_token=…, the implicit flow, also after #/map):
                                              stores the session and says "session"; an expired or used link says
                                              "error"; anything else null. route() calls it before it parses the hash
     Auth.stored()                            the session on file (localStorage maps.session), no request
     Auth.session()                           the same, refreshed first when it ends within five minutes; null when none
     Auth.readMap(session)                    maps/<uid>/map.json, or null when there is none yet; rejects on any other error
     Auth.readFeedback(session, cardId)       maps/<uid>/feedback/<card>.json, or null
     Auth.writeFeedback(session, cardId, obj) writes it (x-upsert); resolves true, rejects on an error
     Auth.signOut()                           forgets the session here and tells GoTrue, best effort
   The pure parts load in node (tests/web/map_gate.test.mjs): sessionFromHash, errorFromHash, redirectTo, feedbackPath,
   feedbackObject, refusedMessage, codeMessage, MapGate.next, MapGate.signinHash and MapGate.landing. Nothing a person types leaves the browser but the email on #/signin
   and a feedback file: the card id, the choice, the note, the date. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = deps => factory(Object.assign({ copy: () => require("./copy.js") }, deps || {}));   // node: require("web/auth.js")({ fetch, config, storage, now })
  else { root.Auth = factory({ fetch: (...a) => root.fetch(...a), config: () => root.CONFIG || {}, storage: () => root.localStorage, now: () => Date.now(), copy: () => root.Copy }); root.MapGate = root.Auth.MapGate; }
})(typeof self !== "undefined" ? self : this, function (deps) {
  "use strict";
  deps = deps || {};
  const cfg = () => { try { return (deps.config && deps.config()) || {}; } catch { return {}; } };
  const copy = () => { try { return (deps.copy && deps.copy()) || {}; } catch { return {}; } };
  const now = () => (deps.now ? deps.now() : Date.now());
  const KEY = "maps.session";
  const BUCKET = "maps";
  const REFRESH_S = 5 * 60;   // refresh when the token ends within five minutes
  const CARD_RE = /^[a-z0-9-]+$/;
  const UID_RE = /^[0-9a-f-]{8,64}$/i;
  const CHOICES = ["build", "not", "change"];
  const NOTE_MAX = 500;

  // ---------- the pure parts ----------
  // the payload of a JWT, or {} when it is not one
  function jwtPayload(token) {
    try {
      const part = String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const bin = typeof atob === "function" ? atob(part + "===".slice((part.length + 3) % 4)) : Buffer.from(part, "base64").toString("binary");
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    } catch { return {}; }
  }
  // The parameters of the fragment that carries `key`: GoTrue appends "#access_token=…" to the redirect URL, so a
  // redirect of <site>/#/map lands on "#/map#access_token=…"; a bare "#access_token=…" reads the same.
  function fragmentWith(hash, key) {
    const part = String(hash || "").split("#").find(p => new RegExp(`(^|[?&/])${key}=`).test(p));
    if (part == null) return null;
    const q = part.includes("?") ? part.slice(part.indexOf("?") + 1) : part.replace(/^\/+/, "");
    return new URLSearchParams(q);
  }
  // the session a magic link lands with: { access_token, refresh_token, expires_at (seconds), uid, email }, or null
  function sessionFromHash(hash, nowMs) {
    const p = fragmentWith(hash, "access_token");
    if (!p || !p.get("access_token")) return null;
    const access_token = p.get("access_token"), jwt = jwtPayload(access_token);
    const t = nowMs == null ? now() : nowMs;
    const at = Number(p.get("expires_at")), inS = Number(p.get("expires_in"));
    const expires_at = at > 0 ? at : inS > 0 ? Math.floor(t / 1000) + inS : Number(jwt.exp) || Math.floor(t / 1000) + 3600;
    const uid = typeof jwt.sub === "string" ? jwt.sub : null;
    if (!uid) return null;
    return { access_token, refresh_token: p.get("refresh_token") || "", expires_at, uid, email: typeof jwt.email === "string" ? jwt.email : "" };
  }
  // an expired or used link lands with "#error=…&error_code=otp_expired…": { error, code, description }, or null
  function errorFromHash(hash) {
    const p = fragmentWith(hash, "error");
    if (!p || !p.get("error")) return null;
    return { error: p.get("error"), code: p.get("error_code") || "", description: p.get("error_description") || "" };
  }
  // where the link lands: the site's own address, its query and hash dropped, then #/map
  const redirectTo = loc => `${loc.origin}${loc.pathname}#/map`;
  // the object path of one card's feedback; a card id is lower-case letters, digits and hyphens, nothing else
  function feedbackPath(uid, cardId) {
    if (!UID_RE.test(String(uid || ""))) throw new Error("No user id");
    if (!CARD_RE.test(String(cardId || ""))) throw new Error(`Not a card id: ${cardId}`);
    return `${uid}/feedback/${cardId}.json`;
  }
  // the one object a card's control writes: { card, choice, note, date }; the note cut at 500 characters
  function feedbackObject(cardId, choice, note, date) {
    if (!CARD_RE.test(String(cardId || ""))) throw new Error(`Not a card id: ${cardId}`);
    if (!CHOICES.includes(choice)) throw new Error(`Not a choice: ${choice}`);
    const d = date instanceof Date ? date.toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? String(date) : new Date(now()).toISOString().slice(0, 10);
    return { card: cardId, choice, note: String(note == null ? "" : note).trim().slice(0, NOTE_MAX), date: d };
  }
  // What #/signin says when GoTrue answers no (2026-11-06: the connection line is for a network failure alone, which
  // sendLink and sendCode catch themselves). The answer's text, any shape, read three ways:
  //   too many emails (429, error_code over_email_send_rate_limit, "rate limit", "only request this after N seconds"):
  //     the wait, in seconds when GoTrue names them, else the hour the email limit counts
  //   an address with no invite ("Signups not allowed for otp", error_code otp_disabled, "User not found"): the refused copy
  //   anything else GoTrue says: the service line
  const answerText = b => { try { return typeof b === "string" ? b : JSON.stringify(b == null ? "" : b); } catch { return ""; } };
  function limitLine(text) {
    const S = copy().signin || {}, fill = copy().fill || ((t, v) => t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)));
    if (!/over_email_send_rate_limit|over_request_rate_limit|rate limit|only request this after/i.test(text)) return null;
    const m = /after (\d+) seconds?/i.exec(text);
    return m ? fill(S.rateWait, { n: m[1] }) : S.rateLimited;
  }
  function refusedMessage(errorBody) {
    const S = copy().signin || {}, text = answerText(errorBody);
    return limitLine(text) || (/signups not allowed|otp_disabled|user not found/i.test(text) ? S.refused : S.serviceFailed);
  }
  // what #/signin says when GoTrue refuses a code: the same wait for too many emails; sign-ups off reads as the refused
  // copy for codes; a wrong or expired code as its own line; anything else as the service line
  function codeMessage(errorBody, verifying) {
    const S = copy().signin || {}, text = answerText(errorBody);
    const limit = limitLine(text); if (limit) return limit;
    if (verifying) return /invalid|expired|not found|otp/i.test(text) ? S.codeWrong : S.serviceFailed;
    return /signups not allowed|not allowed|otp_disabled/i.test(text) ? S.codeRefused : S.serviceFailed;
  }
  // E1: where Build skills and #/map lead. Off: the launcher as before. No session: the sign-in. A session and a map:
  // the map. A session and no map file yet: the waiting line.
  // signinHash(from) and landing(next) (2026-11-06): the map's own address goes to the sign-in as `next` and comes back
  // after it, so #/map?build=1&role=<id> keeps its form and its role; anything but a #/map hash is dropped
  const MAP_HASH = /^#\/map(\?[a-z0-9_=&.%+-]*)?$/i;
  const MapGate = {
    next({ enabled, session, hasMap } = {}) {
      if (!enabled) return "launcher";
      if (!session) return "signin";
      return hasMap ? "map" : "waiting";
    },
    signinHash: from => MAP_HASH.test(String(from || "")) && String(from) !== "#/map" ? "#/signin?next=" + encodeURIComponent(String(from)) : "#/signin",
    landing: next => MAP_HASH.test(String(next || "")) ? String(next) : "#/map",
  };

  // ---------- the session, kept in localStorage ----------
  const store = () => { try { return deps.storage && deps.storage(); } catch { return null; } };
  function stored() {
    try {
      const s = store(); const v = s && JSON.parse(s.getItem(KEY));
      return v && v.access_token && v.uid ? v : null;
    } catch { return null; }
  }
  function keep(session) { try { const s = store(); if (!s) return; if (session) s.setItem(KEY, JSON.stringify(session)); else s.removeItem(KEY); } catch { } }
  function takeHash(hash) {
    const session = sessionFromHash(hash);
    if (session) { keep(session); return "session"; }
    return errorFromHash(hash) ? "error" : null;
  }

  // ---------- the requests ----------
  const base = () => String(cfg().SUPABASE_URL || "").replace(/\/$/, "");
  const pk = () => cfg().SUPABASE_PUBLISHABLE_KEY || "";
  const headers = (token, extra) => Object.assign({ apikey: pk(), Authorization: "Bearer " + (token || pk()) }, extra || {});
  const bodyOf = r => Promise.resolve().then(() => r.text()).then(t => { try { return JSON.parse(t); } catch { return t; } }).catch(() => "");
  async function sendLink(email) {
    const S = copy().signin || {};
    const e = String(email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 320) return { ok: false, message: S.invalid };
    try {
      const loc = deps.location ? deps.location() : (typeof location !== "undefined" ? location : null);
      const q = loc ? "?redirect_to=" + encodeURIComponent(redirectTo(loc)) : "";
      const r = await deps.fetch(`${base()}/auth/v1/otp${q}`, { method: "POST", headers: headers(null, { "Content-Type": "application/json" }), body: JSON.stringify({ email: e, create_user: false }) });
      if (r && r.ok) return { ok: true };
      return { ok: false, message: refusedMessage(r ? await bodyOf(r) : "") };
    } catch { return { ok: false, message: S.failed }; }
  }
  const CODE_RE = /^\d{6}$/;
  // the code flow (2026-11-05): a six-digit code to any address, then the code typed on the page becomes the session
  async function sendCode(email) {
    const S = copy().signin || {};
    const e = String(email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 320) return { ok: false, message: S.invalid };
    try {
      const r = await deps.fetch(`${base()}/auth/v1/otp`, { method: "POST", headers: headers(null, { "Content-Type": "application/json" }), body: JSON.stringify({ email: e, create_user: true }) });
      if (r && r.ok) return { ok: true };
      return { ok: false, message: codeMessage(r ? await bodyOf(r) : "", false) };
    } catch { return { ok: false, message: S.failed }; }
  }
  async function verifyCode(email, code) {
    const S = copy().signin || {};
    const e = String(email || "").trim(), c = String(code || "").replace(/\s+/g, "");
    if (!CODE_RE.test(c)) return { ok: false, message: S.codeWrong };
    try {
      const r = await deps.fetch(`${base()}/auth/v1/verify`, { method: "POST", headers: headers(null, { "Content-Type": "application/json" }), body: JSON.stringify({ type: "email", email: e, token: c }) });
      const b = r ? await bodyOf(r) : "";
      if (!r || !r.ok || !b || !b.access_token) return { ok: false, message: codeMessage(b, true) };
      const jwt = jwtPayload(b.access_token);
      const uid = (b.user && b.user.id) || jwt.sub;
      if (!uid) return { ok: false, message: S.failed };
      const session = { access_token: b.access_token, refresh_token: b.refresh_token || "", expires_at: Number(b.expires_at) || Math.floor(now() / 1000) + (Number(b.expires_in) || 3600), uid, email: (b.user && b.user.email) || jwt.email || e };
      keep(session);
      return { ok: true, session };
    } catch { return { ok: false, message: S.failed }; }
  }
  // the session on file, refreshed when it ends within five minutes; a refused refresh forgets it, a network failure
  // keeps it while it still works
  async function session() {
    const s = stored(); if (!s) return null;
    const left = s.expires_at - Math.floor(now() / 1000);
    if (left > REFRESH_S) return s;
    try {
      const r = await deps.fetch(`${base()}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: headers(null, { "Content-Type": "application/json" }), body: JSON.stringify({ refresh_token: s.refresh_token }) });
      if (!r || !r.ok) {
        if (r && r.status >= 400 && r.status < 500) { keep(null); return null; }   // the refresh token is spent or revoked
        return left > 0 ? s : null;
      }
      const b = await r.json(), jwt = jwtPayload(b.access_token);
      const next = { access_token: b.access_token, refresh_token: b.refresh_token || s.refresh_token, expires_at: Number(b.expires_at) || Math.floor(now() / 1000) + (Number(b.expires_in) || 3600), uid: (b.user && b.user.id) || jwt.sub || s.uid, email: (b.user && b.user.email) || jwt.email || s.email };
      keep(next); return next;
    } catch { return left > 0 ? s : null; }
  }
  // one object of the person's own folder, read with their token: the parsed JSON, or null when it is not there
  // (Storage answers 404, or 400 with "not found", for a missing object)
  async function readObject(sess, path) {
    if (!sess || !UID_RE.test(String(sess.uid || ""))) throw new Error("No session");
    const r = await deps.fetch(`${base()}/storage/v1/object/authenticated/${BUCKET}/${path}`, { headers: headers(sess.access_token) });
    if (r.ok) return r.json();
    const b = await bodyOf(r);
    if (r.status === 404 || (r.status === 400 && /not.?found/i.test(typeof b === "string" ? b : JSON.stringify(b)))) return null;
    throw new Error(`Storage answered ${r.status}`);
  }
  const readMap = sess => readObject(sess, `${sess && sess.uid}/map.json`);
  const readFeedback = (sess, cardId) => readObject(sess, feedbackPath(sess && sess.uid, cardId));
  async function writeFeedback(sess, cardId, obj) {
    if (!sess) throw new Error("No session");
    const path = feedbackPath(sess.uid, cardId);
    const r = await deps.fetch(`${base()}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: headers(sess.access_token, { "Content-Type": "application/json", "x-upsert": "true" }), body: JSON.stringify(obj) });
    if (!r.ok) throw new Error(`Storage answered ${r.status}`);
    return true;
  }
  async function signOut() {
    const s = stored(); keep(null);
    if (!s) return;
    try { await deps.fetch(`${base()}/auth/v1/logout`, { method: "POST", headers: headers(s.access_token) }); } catch { }
  }

  return { KEY, BUCKET, CHOICES, NOTE_MAX, sessionFromHash, errorFromHash, redirectTo, feedbackPath, feedbackObject, refusedMessage, codeMessage, MapGate,
    takeHash, stored, session, sendLink, sendCode, verifyCode, readMap, readFeedback, writeFeedback, signOut };
});
