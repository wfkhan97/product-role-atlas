/* Feedback: the box anyone can send from, and the prompt that asks once (the visitor journey, step 6, 2026-11-05;
   PLAN.md decision 6). A classic script like capture.js, loaded after state.js; node requires it for
   tests/web/feedback.test.mjs with its dependencies passed in. Nothing here runs when CONFIG.FEEDBACK_ENABLED is off
   (the table lands with pipeline/sql/2026-11-05_feedback.sql, applied by the owner).
     Feedback.due(input)              pure: whether the prompt fires now, and why ("actions" · "time" · "again" · "tree")
     Feedback.send(row)               one row into `feedback` with the publishable key: { text, email, screen, prompted,
                                      session, visitor, user_id }; resolves true or false, never rejects
     Feedback.asked() / markAsked(now, actions)       the first prompt's mark in this browser (localStorage)
     Feedback.treeAsked() / markTreeAsked()           the tree prompt's mark
     Feedback.signedIn(now) / signedInAt()            when this browser last signed in (the minute of grace)
   The rule: once per browser after twelve meaningful actions (Capture.actions) or six minutes of visible time
   (Capture.visible), whichever first; never on the door or the sign-in, nor within a minute of signing in; shown counts
   as asked, dismissed or sent; it may ask again after thirty days, only when new actions happened since; a second
   prompt, its own, at the first tree opened. What leaves the browser is the row above and only on Send: the sentence
   typed into the box, the email only when typed. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;   // node: require("web/feedback.js")({ fetch, config, local })
  else root.Feedback = factory({ fetch: (...a) => root.fetch(...a), config: () => root.CONFIG || {}, local: () => root.localStorage });
})(typeof self !== "undefined" ? self : this, function (deps) {
  "use strict";
  deps = deps || {};
  const cfg = () => { try { return (deps.config && deps.config()) || {}; } catch { return {}; } };
  const enabled = () => { const c = cfg(); return !!(c.FEEDBACK_ENABLED && c.SUPABASE_URL && c.SUPABASE_PUBLISHABLE_KEY); };
  const LIMITS = { text: 500, email: 320, actions: 12, visibleMs: 6 * 60 * 1000, againDays: 30, graceMs: 60 * 1000 };
  const NEVER_ON = ["door", "signin"];
  const ASKED_KEY = "feedback.asked", TREE_KEY = "feedback.tree", SIGNIN_KEY = "feedback.signin";
  const ID_RE = /^[0-9a-f]{24}$/, UID_RE = /^[0-9a-f-]{36}$/i, SCREEN_RE = /^[a-z][a-z_]{1,23}$/, EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ---------- the pure part ----------
  // input: { now, screen, actions, visibleMs, signedInAt, asked: { at, actions } | null, treeOpened, treeAsked }
  function due(input) {
    const i = input || {}, now = Number(i.now) || 0;
    if (NEVER_ON.includes(i.screen)) return { due: false, why: null };
    if (i.signedInAt != null && now - Number(i.signedInAt) < LIMITS.graceMs) return { due: false, why: null };
    if (i.treeOpened && !i.treeAsked) return { due: true, why: "tree" };
    const actions = Number(i.actions) || 0, visibleMs = Number(i.visibleMs) || 0;
    if (!i.asked) {
      if (actions >= LIMITS.actions) return { due: true, why: "actions" };
      if (visibleMs >= LIMITS.visibleMs) return { due: true, why: "time" };
      return { due: false, why: null };
    }
    const since = now - (Number(i.asked.at) || 0), moved = actions > (Number(i.asked.actions) || 0);
    if (since >= LIMITS.againDays * 24 * 60 * 60 * 1000 && moved) return { due: true, why: "again" };
    return { due: false, why: null };
  }

  // ---------- the marks in this browser ----------
  const store = () => { try { return (deps.local && deps.local()) || null; } catch { return null; } };
  const get = k => { try { const s = store(); return s ? s.getItem(k) : null; } catch { return null; } };
  const set = (k, v) => { try { const s = store(); if (s) s.setItem(k, v); } catch { } };
  function asked() { try { const v = JSON.parse(get(ASKED_KEY) || "null"); return v && Number.isFinite(v.at) ? { at: v.at, actions: Number(v.actions) || 0 } : null; } catch { return null; } }
  const markAsked = (now, actions) => set(ASKED_KEY, JSON.stringify({ at: Number(now) || 0, actions: Number(actions) || 0 }));
  const treeAsked = () => get(TREE_KEY) === "1";
  const markTreeAsked = () => set(TREE_KEY, "1");
  const signedIn = now => set(SIGNIN_KEY, String(Number(now) || 0));
  function signedInAt() { const n = parseInt(get(SIGNIN_KEY), 10); return Number.isFinite(n) && n > 0 ? n : null; }

  // ---------- the one request ----------
  function send(row) {
    const r = row || {}, text = String(r.text || "").trim().slice(0, LIMITS.text);
    if (!enabled() || !text) return Promise.resolve(false);
    const out = { text, prompted: !!r.prompted };
    const email = String(r.email || "").trim();
    if (email && email.length <= LIMITS.email && EMAIL_RE.test(email)) out.email = email;
    if (SCREEN_RE.test(String(r.screen || ""))) out.screen = String(r.screen);
    if (ID_RE.test(String(r.session || ""))) out.session = String(r.session);
    if (ID_RE.test(String(r.visitor || ""))) out.visitor = String(r.visitor);
    if (UID_RE.test(String(r.user_id || ""))) out.user_id = String(r.user_id);
    const c = cfg(), url = `${String(c.SUPABASE_URL).replace(/\/$/, "")}/rest/v1/feedback`;
    return Promise.resolve().then(() => deps.fetch(url, { method: "POST", headers: { "Content-Type": "application/json", apikey: c.SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + c.SUPABASE_PUBLISHABLE_KEY, Prefer: "return=minimal" }, body: JSON.stringify(out) }))
      .then(r => !!(r && r.ok)).catch(() => false);
  }
  return { LIMITS, NEVER_ON, due, send, asked, markAsked, treeAsked, markTreeAsked, signedIn, signedInAt, enabled };
});
