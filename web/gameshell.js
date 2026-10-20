/* The one shell every game draws in (PLAN.md, "The games, second pass (v12)", conventions G2, G6, G7, G8).
   Header: game · role, round pips, one ⓘ (rules, keys, source, the storage note), one Quit. Body: the game.
   Footer: at most one primary and one quiet action. Keys: 1 to 4 choose, Enter confirms, Esc quits. One results
   template: the measure, one takeaway, one visual, one link, the evidence behind "Why". One record in localStorage
   for every game (every access in try/catch; a game works with storage blocked). Play first (G1, G9): one start
   screen (`start`), one default role (`defaultRole`: the role the player came from, else the profile's first
   field's largest role, else Product Manager), one coachmark on the first move (`coachOnce`), one picker
   (`picker`: the Explore field cards, then the field's roles with the player's record as the secondary line).
   UMD like atlas.js: the record's pure parts (`record.normalize`, `record.noteGame`) load in node for
   tests/web/gameshell.test.mjs; the DOM parts register window.GameShell. */
(function (root, factory) {
  const mod = factory(typeof root.document === "undefined" ? null : root.document);
  if (typeof module === "object" && module.exports) module.exports = mod;
  else root.GameShell = mod;
})(typeof self !== "undefined" ? self : this, function (document) {
  "use strict";
  const KEY = "games", VERSION = 1;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);

  // ---------- the record: pure ----------
  // { v, games: { <slug>: { plays, last, best, clean, speed, ... } }, roles: { <roleId>: { ... } } }.
  // `clean` is set once a game has been finished untimed with a result worth the name: it unlocks the Speed round.
  const empty = () => ({ v: VERSION, games: {}, roles: {} });
  function normalize(raw) {
    const rec = empty();
    if (!isObj(raw)) return rec;
    if (isObj(raw.games)) for (const [k, v] of Object.entries(raw.games)) if (isObj(v)) rec.games[k] = { ...v };
    if (isObj(raw.roles)) for (const [k, v] of Object.entries(raw.roles)) if (isObj(v)) rec.roles[k] = { ...v };
    return rec;
  }
  // one game's entry merged with a patch; `plays` counts up when the patch says played: true; `last` is the day
  function noteGame(rec, slug, patch, today) {
    const out = normalize(rec), g = { ...(out.games[slug] || {}) };
    const { played, ...rest } = patch || {};
    Object.assign(g, rest);
    if (played) { g.plays = (Number.isInteger(g.plays) ? g.plays : 0) + 1; g.last = today || new Date().toISOString().slice(0, 10); }
    out.games[slug] = g;
    return out;
  }
  const gameOf = (rec, slug) => (normalize(rec).games[slug]) || {};

  // storage: every access in try/catch; with storage blocked the game plays the same and forgets
  const storage = {
    read() { try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch { return empty(); } },
    write(rec) { try { localStorage.setItem(KEY, JSON.stringify(normalize(rec))); return true; } catch { return false; } },
    works() { try { localStorage.setItem(KEY + "-probe", "1"); localStorage.removeItem(KEY + "-probe"); return true; } catch { return false; } },
  };
  const record = {
    KEY, VERSION, empty, normalize, noteGame, gameOf,
    read: storage.read, write: storage.write, works: storage.works,
    game: slug => gameOf(storage.read(), slug),
    // save a game's patch; returns the entry as kept (or the patch merged in memory when storage is blocked)
    saveGame(slug, patch) { const rec = noteGame(storage.read(), slug, patch); storage.write(rec); return rec.games[slug]; },
    // a Speed round is on offer once the game has been played clean untimed (G7)
    speedUnlocked: slug => !!gameOf(storage.read(), slug).clean,
  };

  // ---------- small pieces of markup ----------
  const kbd = k => `<kbd>${esc(k)}</kbd>`;
  const tip = text => `<button type="button" class="tip" aria-label="How this game works" aria-expanded="false" data-tip="${esc(text)}">i</button>`;
  const STORAGE_NOTE = "Your results stay in this browser; nothing is uploaded.";
  const KEYS_NOTE = "Keys: 1 to 4 choose, Enter confirms, Esc quits.";
  // the ⓘ text: the rules, the keys, where the numbers come from, the storage note, in that order
  const info = ({ rules, keys, source }) => [rules, keys === false ? "" : keys || KEYS_NOTE, source, STORAGE_NOTE].filter(Boolean).join(" ");
  // the round pips: done, the current one, the rest; `marks[i]` = "ok" | "miss" paints a finished round
  function pips(i, n, marks) {
    if (!n) return "";
    const cls = k => k < i ? (marks && marks[k] ? marks[k] : "done") : k === i ? "now" : "";
    return `<span class="gm-pips" role="img" aria-label="Round ${Math.min(i + 1, n)} of ${n}">${Array.from({ length: n }, (_, k) => `<i class="${cls(k)}"></i>`).join("")}</span><span class="gm-pipn">${Math.min(i + 1, n)} of ${n}</span>`;
  }
  // the footer row: one primary (a button or a link) and one quiet action, nothing else; `attrs` is extra markup
  function foot({ primary, quiet } = {}) {
    const attrs = a => `${a.id ? ` id="${esc(a.id)}"` : ""}${a.attrs ? " " + a.attrs : ""}`;
    const one = (a, cls) => !a ? "" : a.href ? `<a class="btn ${cls}"${attrs(a)} href="${esc(a.href)}">${a.label}${a.key ? " " + kbd(a.key) : ""}</a>`
      : `<button type="button" class="btn ${cls}"${attrs(a)}${a.disabled ? " disabled" : ""}>${a.label}${a.key ? " " + kbd(a.key) : ""}</button>`;
    return `<div class="gm-foot">${one(quiet, "quiet")}${one(primary, "primary")}</div>`;
  }
  // the results template: the measure in plain words, the record line, one takeaway, one visual, one link, Why
  function results({ eyebrow, measure, record: rec, takeaway, visual, link, why, foot: footHtml, cls } = {}) {
    return `<div class="gm-result${cls ? " " + cls : ""}">${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}
      <p class="gm-measure" id="gm-measure" tabindex="-1">${measure || ""}</p>${rec ? `<p class="gm-record">${rec}</p>` : ""}
      ${takeaway ? `<p class="gm-take">${takeaway}</p>` : ""}${visual ? `<div class="gm-visual">${visual}</div>` : ""}
      ${link ? `<p class="gm-link"><a href="${esc(link.href)}">${esc(link.label)} →</a></p>` : ""}
      ${why ? `<details class="disc gm-why"><summary>Why</summary><div class="disc-body">${why}</div></details>` : ""}${footHtml || ""}</div>`;
  }
  // a ranked list with the player's calls painted on it (the role's own list, as the role screen draws it):
  // rows = [{ name, share, cls, note }], cls = "you" (right) | "miss" (a call that went wrong) | "" ; the label says what the bar is, once
  function ranked(rows, label) {
    const max = Math.max(0.01, ...rows.map(r => r.share || 0));
    return `<div class="gm-ranked">${rows.map(r => `<div class="gm-rr${r.cls ? " " + r.cls : ""}"><span class="nm">${esc(r.name)}${r.note ? `<span class="m">${esc(r.note)}</span>` : ""}</span><span class="v">${r.shareText || (r.share == null ? "" : Math.round(r.share * 100) + "%")}</span><span class="bar"${label ? ` data-measure="${esc(label.replace("{n}", Math.round((r.share || 0) * 100) + "%"))}"` : ""}><i style="width:${Math.round(100 * (r.share || 0) / max)}%"></i></span></div>`).join("")}</div>`;
  }

  // ---------- the default role (PLAN.md v12, "Play first"): the role the player came from (?role= in the hash), else
  // the profile's first field's largest role (store "you", fields[]), else Product Manager. Pure: ix is Atlas.index()
  // with the product set loaded; roles = the ids a game can play (a Set or a predicate), or null for any.
  function pickDefault(ix, you, roleParam, roles) {
    const ok = id => !!ix.roles[id] && (!roles || (typeof roles === "function" ? roles(id) : roles.has(id)));
    if (roleParam && ok(roleParam)) return roleParam;
    if (roleParam && ok("product." + roleParam)) return "product." + roleParam;
    const fields = you && Array.isArray(you.fields) ? you.fields : [];
    for (const f of fields) {
      const g = ix.groups.find(x => x.id === f); if (!g) continue;
      const best = (g.roles || []).filter(ok).sort((a, b) => (ix.roles[b].nOpen || 0) - (ix.roles[a].nOpen || 0))[0];
      if (best) return best;
    }
    if (ok("product.pm")) return "product.pm";
    return Object.keys(ix.roles).filter(ok).sort((a, b) => (ix.roles[b].nOpen || 0) - (ix.roles[a].nOpen || 0))[0] || null;
  }
  // the coachmark: one pointer on the first move of a game's first round (Coachmarks pattern), dismissed by any move
  const coach = text => `<div class="gm-coach" role="note" id="gm-coach">${esc(text)}<button type="button" class="linkish link" id="gm-coach-ok">Got it</button></div>`;

  if (!document) return { record, info, pips, foot, results, ranked, kbd, tip, pickDefault, coach, KEYS_NOTE, STORAGE_NOTE };

  // ---------- the frame: header, body, live region ----------
  // frame(el, { game, role, round, rounds, marks, info, quit, cls }) -> { body, set(...), live(msg) }
  function frame(el, o) {
    el.innerHTML = `<div class="page gm${o.cls ? " " + o.cls : ""}"><div class="gm-head">
        <div class="gm-title"><b>${esc(o.game)}</b>${o.role ? `<span class="gm-sep" aria-hidden="true">·</span><span class="gm-role" id="gm-role">${esc(o.role)}</span>` : ""}</div>
        <div class="gm-round" id="gm-round">${pips(o.round, o.rounds, o.marks)}</div>
        <div class="gm-tools"><span id="gm-info">${o.info ? tip(o.info) : ""}</span><a class="gm-quit" href="${esc(o.quit || "#/")}">Quit ${kbd("Esc")}</a></div>
      </div><div class="gm-body" id="gm-body"></div><div class="gm-live" aria-live="polite" id="gm-live"></div></div>`;
    const $ = s => el.querySelector(s);
    const body = $("#gm-body"), liveEl = $("#gm-live");
    let liveT = 0;
    return {
      body, el,
      set(p) {
        if (p.round != null || p.rounds != null || p.marks) { const r = $("#gm-round"); if (r) r.innerHTML = pips(p.round ?? o.round, p.rounds ?? o.rounds, p.marks || o.marks); Object.assign(o, p); }
        if (p.role != null) { const r = $("#gm-role"); if (r) r.textContent = p.role; else { const t = $(".gm-title"); if (t) t.insertAdjacentHTML("beforeend", `<span class="gm-sep" aria-hidden="true">·</span><span class="gm-role" id="gm-role">${esc(p.role)}</span>`); } o.role = p.role; }
        if (p.info != null) { const i = $("#gm-info"); if (i) i.innerHTML = p.info ? tip(p.info) : ""; o.info = p.info; }
        if (p.quit != null) { const q = $(".gm-quit"); if (q) q.setAttribute("href", p.quit); o.quit = p.quit; }
      },
      live(msg) { clearTimeout(liveT); liveEl.textContent = ""; liveT = setTimeout(() => { liveEl.textContent = msg; }, 30); },
      focusMeasure() { const m = $("#gm-measure"); if (m) m.focus({ preventScroll: true }); },
    };
  }

  // ---------- the keys: 1 to 4 choose, Enter confirms, Esc quits; everything else is a click ----------
  // keys({ choose(n), confirm(), quit(), other(e) }) -> off(). Runs in the capture phase so Esc can tell an open
  // tooltip (the app closes it) from a round to leave. Enter on a button or link is that control's own.
  function keys(h) {
    const tipOpen = () => { const t = document.querySelector(".tipbox"); return t && !t.hidden; };
    const on = e => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") { if (tipOpen() || document.getElementById("drawer")) return; e.preventDefault(); if (h.quit) h.quit(e); else location.hash = h.quitHref || "#/"; return; }
      if (e.key === "Enter") { if (t && t.closest && t.closest("button, a, summary")) return; if (h.confirm) { e.preventDefault(); h.confirm(e); } return; }
      if (/^[1-4]$/.test(e.key) && !e.repeat) { if (h.choose && h.choose(Number(e.key), e) !== false) e.preventDefault(); return; }
      if (h.other) h.other(e);
    };
    document.addEventListener("keydown", on, true);
    return () => document.removeEventListener("keydown", on, true);
  }

  // the default role for a game, from the atlas and the profile; `roles` limits it to the roles a game can play
  async function defaultRole(Atlas, roles) {
    const ix = await Atlas.index(); await Atlas.product().catch(() => { });
    let you = null; try { you = JSON.parse(localStorage.getItem("you")); } catch { }
    const q = new URLSearchParams((location.hash.split("?")[1] || "")).get("role");
    return pickDefault(ix, you, q, roles);
  }
  // the one start screen (G1): the title, one sentence, Play on the default role, "Change role" and ⓘ after that
  function start(F, { title, lead, role, play, change, extra, playLabel }) {
    F.set({ round: null, rounds: 0, role: "" });
    F.body.innerHTML = `<div class="gm-start"><h1>${esc(title)}</h1><p class="lead">${esc(lead)}</p>${extra || ""}
      ${foot({ primary: { id: "gm-play", label: playLabel || (role ? `Play · ${esc(role)}` : "Play"), key: "Enter" }, quiet: change ? { id: "gm-change", label: typeof change === "string" ? change : "Change role" } : null })}</div>`;
    const p = F.body.querySelector("#gm-play"), c = F.body.querySelector("#gm-change");
    p.onclick = play; if (c && typeof change === "function") c.onclick = change;
    p.focus({ preventScroll: true });
    return { play: p, change: c };
  }
  // the one picker (G9): the Explore field cards, then the field's roles with the player's record as the secondary
  // line. picker(F, { Atlas, roles, field, secondary, onRole, back, title }) draws into the frame's body.
  async function picker(F, o) {
    const Atlas = o.Atlas, ix = await Atlas.index(); await Atlas.product().catch(() => { });
    const ok = id => !!ix.roles[id] && (!o.roles || (typeof o.roles === "function" ? o.roles(id) : o.roles.has(id)));
    const fmt = n => Number(n).toLocaleString("en-US");
    const groups = ix.groups.map(g => ({ g, roles: (g.roles || []).filter(ok).map(id => ix.roles[id]).sort((a, b) => (b.nOpen || 0) - (a.nOpen || 0)) })).filter(x => x.roles.length);
    let field = o.field && groups.some(x => x.g.id === o.field) ? o.field : groups[0].g.id;
    const max = Math.max(1, ...groups.map(x => x.g.nOpen || 0));
    const draw = () => {
      const cur = groups.find(x => x.g.id === field);
      const card = ({ g, roles }) => { const ex = roles.slice(0, 3).map(r => r.label), more = roles.length - ex.length;
        return `<button type="button" class="fcard${g.id === field ? " on" : ""}" data-field="${esc(g.id)}" aria-pressed="${g.id === field}"><span class="t">${esc(g.label)}</span><span class="m">e.g. ${esc(ex.join(" · "))}${more > 0 ? `, +${more} more` : ""}</span><span class="bar" data-measure="${fmt(g.nOpen || 0)} open postings in ${esc(g.label)} now; the bar compares the fields."><i style="width:${Math.round(100 * (g.nOpen || 0) / max)}%"></i></span><span class="n">${fmt(g.nOpen || 0)} open</span></button>`; };
      const row = r => `<button type="button" class="r" data-role="${esc(r.id)}"><span class="t">${esc(r.label)}</span><span class="n">${fmt(r.nOpen || 0)} open</span><span class="m">${esc(o.secondary ? o.secondary(r.id) : "")}</span></button>`;
      F.set({ round: null, rounds: 0, role: "" });
      F.body.innerHTML = `<div class="gm-picker"><h1>${esc(o.title || "Change role")}</h1><p class="lead">${esc(o.lead || "Pick a field, then a role.")}</p>
        <div class="fcards">${groups.map(card).join("")}</div>
        <h2>${esc(cur.g.label)}</h2><div class="list">${cur.roles.map(row).join("")}</div>
        ${o.back ? foot({ quiet: { id: "gm-back", label: o.back === true ? "Back" : o.back } }) : ""}</div>`;
      F.body.querySelectorAll("[data-field]").forEach(b => b.onclick = () => { field = b.dataset.field; draw(); const c = F.body.querySelector(`[data-field="${CSS.escape(field)}"]`); if (c) c.focus(); });
      F.body.querySelectorAll("[data-role]").forEach(b => b.onclick = () => o.onRole(b.dataset.role, field));
      const bk = F.body.querySelector("#gm-back"); if (bk) bk.onclick = () => o.onBack && o.onBack();
      window.scrollTo(0, 0);
    };
    draw();
  }
  // show the coachmark once per game, at `where` relative to `host` (default: as its first child; "beforebegin"
  // keeps a grid host intact); any click or key on the page dismisses it
  function coachOnce(slug, host, text, where = "afterbegin") {
    const g = record.game(slug); if (g.coached || !host) return () => { };
    host.insertAdjacentHTML(where, coach(text));
    const done = () => { const c = document.getElementById("gm-coach"); if (c) c.remove(); record.saveGame(slug, { coached: true }); document.removeEventListener("keydown", done, true); document.removeEventListener("click", done, true); };
    const ok = document.getElementById("gm-coach-ok"); if (ok) ok.onclick = done;
    setTimeout(() => { document.addEventListener("keydown", done, true); document.addEventListener("click", done, true); }, 0);
    return done;
  }

  return { record, info, pips, foot, results, ranked, kbd, tip, frame, keys, pickDefault, defaultRole, start, picker, coach, coachOnce, KEYS_NOTE, STORAGE_NOTE };
});
