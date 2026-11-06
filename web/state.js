/* State: what a signed-in person keeps on the server (the visitor journey, step 3, 2026-11-05). A classic script like
   auth.js, loaded after it; node requires it for tests/web/state.test.mjs with its dependencies passed in. Three
   tables of the catalog project (pipeline/sql/2026-11-05_state.sql), every row the person's own under row-level
   security, read and written with the person's token through PostgREST. No call is made without a session, and
   nothing here runs when CONFIG.ACCOUNTS_ENABLED is off (app.js checks before it calls).
     State.hash(text)                        a SHA-256 of the normalized résumé text, hex; the id of a résumé, never its text
     State.readRows(fit)                     pure: a match result's core and common rows as { skills: [{ id, state, line }],
                                             gaps: [ids] } (the four states of the map; one line per skill, cut at 300)
     State.saveProfile(session, you, extra)  upsert the person's row: the About-you answers, { campus, resume_hash }
     State.saveRead(session, read)           upsert one read: { resume_hash, role_id, band, skills, gaps, inferred }
     State.heart(session, roleId, on)        add or remove one heart
     State.load(session)                     { you, campus, resume_hash, hearts: [role ids], reads: [{ role_id, resume_hash, band, created_at }] }
     State.forget(session)                   delete the person's rows in the three tables
     State.merge(local, remote)              pure: the answers the browser holds win when set, else the server's; hearts
                                             are the union; what to carry up is listed as `up`
   Every request resolves true or false (or the data), never rejects: a save that fails is retried at the next change.
   What goes up is exactly these columns: the answers, the campus flag, the hash, the role ids, the band, the skill
   ids with their state and the one résumé line that showed each, the gaps, the inferred ids. Never the résumé text,
   a file name or anything typed elsewhere. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;   // node: require("web/state.js")({ fetch, config, crypto })
  else root.State = factory({ fetch: (...a) => root.fetch(...a), config: () => root.CONFIG || {}, crypto: () => root.crypto });
})(typeof self !== "undefined" ? self : this, function (deps) {
  "use strict";
  deps = deps || {};
  const cfg = () => { try { return (deps.config && deps.config()) || {}; } catch { return {}; } };
  const base = () => String(cfg().SUPABASE_URL || "").replace(/\/$/, "") + "/rest/v1/";
  const pk = () => cfg().SUPABASE_PUBLISHABLE_KEY || "";
  const UID_RE = /^[0-9a-f-]{36}$/i, HASH_RE = /^[0-9a-f]{64}$/, ROLE_RE = /^[a-z][a-z0-9_.]{1,63}$/, CAMPUS_RE = /^[a-z][a-z_]{1,23}$/, BAND_RE = /^[a-z_]{1,24}$/;
  const LINE_MAX = 300, SKILLS_MAX = 120, HEARTS_MAX = 200;
  // the matcher's status of a row as one of the map's four states (web/map.js lineState, pipeline/apprentice/ground.mjs STATE)
  const STATE = { evidenced: "shows", through: "shows", transferable: "shows in other words", thin: "must evidence better", presumed: "must evidence better", gap: "must build" };
  const STATES = new Set(Object.values(STATE));
  const ok = s => !!(s && UID_RE.test(String(s.uid || "")) && s.access_token);

  // ---------- the pure parts ----------
  // the normalized text: whitespace collapsed, trimmed; the same résumé pasted twice hashes the same
  const normalize = text => String(text || "").replace(/\s+/g, " ").trim();
  async function hash(text) {
    const c = deps.crypto && deps.crypto();
    if (!c || !c.subtle) return null;
    const buf = await c.subtle.digest("SHA-256", new TextEncoder().encode(normalize(text)));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
  }
  function readRows(fit) {
    const rows = Array.isArray(fit && fit.rows) ? fit.rows : [];
    const skills = [];
    for (const r of rows) {
      if (!r || !ROLE_RE.test(String(r.id || "")) || !(r.tier === "core" || r.tier === "common")) continue;
      const state = STATE[r.status] || "must build";
      const line = r.lines && r.lines[0] && r.lines[0].text ? String(r.lines[0].text).slice(0, LINE_MAX) : null;
      const s = { id: r.id, state };
      if (line) s.line = line;
      if (r.tier === "core") s.core = true;
      skills.push(s);
      if (skills.length >= SKILLS_MAX) break;
    }
    const gaps = skills.filter(s => s.core && (s.state === "must build" || s.state === "must evidence better")).map(s => s.id);
    return { skills, gaps };
  }
  // what the browser keeps wins when it is set (it is the fresher answer); hearts are the union; `up` is what the
  // server lacks and should get
  function merge(local, remote) {
    local = local || {}; remote = remote || {};
    const youLocal = local.you && (local.you.where || local.you.stage || (local.you.fields || []).length) ? local.you : null;
    const you = youLocal || remote.you || null;
    const hearts = [...new Set([...(remote.hearts || []), ...(local.hearts || [])].filter(id => ROLE_RE.test(String(id))))].slice(0, HEARTS_MAX);
    const up = { you: youLocal && JSON.stringify(youLocal) !== JSON.stringify(remote.you || null) ? youLocal : null, hearts: (local.hearts || []).filter(id => ROLE_RE.test(String(id)) && !(remote.hearts || []).includes(id)) };
    return { you, hearts, up };
  }

  // ---------- the requests ----------
  const headers = (s, extra) => Object.assign({ apikey: pk(), Authorization: "Bearer " + s.access_token, "Content-Type": "application/json" }, extra || {});
  function call(s, method, path, body, prefer) {
    if (!ok(s)) return Promise.resolve(null);
    return Promise.resolve().then(() => deps.fetch(base() + path, { method, headers: headers(s, prefer ? { Prefer: prefer } : null), body: body == null ? undefined : JSON.stringify(body) }))
      .then(r => r && r.ok ? (method === "GET" ? r.json() : true) : (method === "GET" ? null : false)).catch(() => (method === "GET" ? null : false));
  }
  const upsert = (s, table, keys, row) => call(s, "POST", `${table}?on_conflict=${keys}`, row, "resolution=merge-duplicates,return=minimal").then(v => v === true);
  const you_ = y => { const v = y || {}; return { where: v.where || null, stage: v.stage || null, fields: Array.isArray(v.fields) ? v.fields.map(String).slice(0, 12) : [] }; };
  function saveProfile(s, you, extra) {
    if (!ok(s)) return Promise.resolve(false);
    const row = { user_id: s.uid, you: you_(you), updated_at: new Date().toISOString() };
    const e = extra || {};
    if (CAMPUS_RE.test(String(e.campus || ""))) row.campus = e.campus;
    if (HASH_RE.test(String(e.resume_hash || ""))) row.resume_hash = e.resume_hash;
    return upsert(s, "profiles", "user_id", row);
  }
  function saveRead(s, read) {
    const r = read || {};
    if (!ok(s) || !HASH_RE.test(String(r.resume_hash || "")) || !ROLE_RE.test(String(r.role_id || ""))) return Promise.resolve(false);
    const skills = (Array.isArray(r.skills) ? r.skills : []).filter(x => x && ROLE_RE.test(String(x.id)) && STATES.has(x.state)).slice(0, SKILLS_MAX).map(x => { const o = { id: x.id, state: x.state }; if (x.line) o.line = String(x.line).slice(0, LINE_MAX); if (x.core) o.core = true; return o; });
    const ids = xs => (Array.isArray(xs) ? xs : []).map(String).filter(id => ROLE_RE.test(id)).slice(0, SKILLS_MAX);
    const row = { user_id: s.uid, resume_hash: r.resume_hash, role_id: r.role_id, band: BAND_RE.test(String(r.band || "")) ? r.band : null, skills, gaps: ids(r.gaps), inferred: ids(r.inferred) };
    return upsert(s, "reads", "user_id,resume_hash,role_id", row);
  }
  function heart(s, roleId, on) {
    if (!ok(s) || !ROLE_RE.test(String(roleId || ""))) return Promise.resolve(false);
    if (on === false) return call(s, "DELETE", `hearts?user_id=eq.${encodeURIComponent(s.uid)}&role_id=eq.${encodeURIComponent(roleId)}`, null, "return=minimal").then(v => v === true);
    return upsert(s, "hearts", "user_id,role_id", { user_id: s.uid, role_id: roleId });
  }
  async function load(s) {
    if (!ok(s)) return null;
    const uid = encodeURIComponent(s.uid);
    const [p, h, r] = await Promise.all([
      call(s, "GET", `profiles?select=you,campus,resume_hash&user_id=eq.${uid}`),
      call(s, "GET", `hearts?select=role_id&user_id=eq.${uid}&order=created_at.asc`),
      call(s, "GET", `reads?select=role_id,resume_hash,band,created_at&user_id=eq.${uid}&order=created_at.desc&limit=100`),
    ]);
    if (p === null && h === null && r === null) return null;
    const prof = Array.isArray(p) && p[0] ? p[0] : {};
    return { you: prof.you ? you_(prof.you) : null, campus: prof.campus || null, resume_hash: prof.resume_hash || null,
      hearts: (Array.isArray(h) ? h : []).map(x => x.role_id).filter(id => ROLE_RE.test(String(id))),
      reads: (Array.isArray(r) ? r : []).map(x => ({ role_id: x.role_id, resume_hash: x.resume_hash, band: x.band || null, created_at: x.created_at })) };
  }
  async function forget(s) {
    if (!ok(s)) return false;
    const uid = encodeURIComponent(s.uid);
    const done = await Promise.all(["reads", "hearts", "profiles"].map(t => call(s, "DELETE", `${t}?user_id=eq.${uid}`, null, "return=minimal")));
    return done.every(v => v === true);
  }
  return { STATE, normalize, hash, readRows, merge, saveProfile, saveRead, heart, load, forget, LINE_MAX, SKILLS_MAX, HEARTS_MAX };
});
