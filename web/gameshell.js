/* The one shell every game draws in (PLAN.md, "The games, second pass (v12)", conventions G2, G6, G7, G8).
   Header: game · role, round pips, one ⓘ (rules, keys, source, the storage note), one Quit. Body: the game.
   Footer: at most one primary and one quiet action. Keys: 1 to 4 choose, Enter confirms, Esc quits. One results
   template: the measure, one takeaway, one visual, one link, the evidence behind "Why". One record in localStorage
   for every game (every access in try/catch; a game works with storage blocked). Play first (G1, G9): one start
   screen (`start`), one default role (`defaultRole`: the role the player came from, else the profile's first
   field's largest role, else Product Manager), one coachmark on the first move (`coachOnce`), one picker
   (`picker`: the Explore field cards, then the field's roles with the player's record as the secondary line). The
   Know-your-role record (G4): `record.saveRole` / `record.knowledge`, `knowLine` for the first line of an end screen,
   `knowCard` for the role screen and About you.
   UMD like atlas.js: the record's pure parts (`record.normalize`, `record.noteGame`) load in node for
   tests/web/gameshell.test.mjs; the DOM parts register window.GameShell. The shell's strings are web/copy.js,
   Copy.games. */
(function (root, factory) {
  const mod = factory(typeof root.document === "undefined" ? null : root.document, root.Copy || (typeof module === "object" && module.exports ? require("./copy.js") : null));
  if (typeof module === "object" && module.exports) module.exports = mod;
  else root.GameShell = mod;
})(typeof self !== "undefined" ? self : this, function (document, Copy) {
  "use strict";
  const KEY = "games", VERSION = 1;
  const W = Copy.games, fill = Copy.fill;
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

  // ---------- the Know-your-role record (G4): one entry per role, written by every game ----------
  // roles[id] = { label, met: [skill ids seen in a game], known: [skill ids the player got right], ladders: [skill ids
  // sorted right], postings: [posting ids read], demand: n (pairs of open-posting counts seen), updated }
  const ASK_CUT = 0.4;   // a role's asks: the skills at least this share of its postings name (the What does it ask for cut)
  const uniq = (a, b) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter(x => typeof x === "string"))];
  function noteRole(rec, roleId, patch, today) {
    const out = normalize(rec), r = { met: [], known: [], ladders: [], postings: [], demand: 0, ...(out.roles[roleId] || {}) }, p = patch || {};
    if (p.label) r.label = p.label;
    r.met = uniq(r.met, [...(p.met || []), ...(p.known || [])]);
    r.known = uniq(r.known, p.known);
    r.ladders = uniq(r.ladders, p.ladders);
    r.postings = uniq(r.postings, p.postings);
    r.demand = (Number.isInteger(r.demand) ? r.demand : 0) + (Number.isInteger(p.demand) ? p.demand : 0);
    r.updated = today || new Date().toISOString().slice(0, 10);
    out.roles[roleId] = r;
    return out;
  }
  // a role's asks: ids of the skills at least ASK_CUT of its postings name, most asked first. ix = Atlas.index(),
  // P = Atlas.product() or null (needed for a product role)
  function asksOf(ix, P, roleId, cut = ASK_CUT) {
    const r = ix.roles[roleId]; if (!r) return [];
    const skills = r.set === "product" ? (P ? P.G.skills : []) : r.set === "tech" ? ((ix.T || {}).skills || []) : ix.M.skills;
    return skills.filter(s => s.cluster !== "credentials" && !String(s.id).startsWith("yoe_")).map(s => ({ id: s.id, share: (s.by_family || {})[r.family] || 0 })).filter(x => x.share >= cut).sort((a, b) => b.share - a.share).map(x => x.id);
  }
  // what the player knows about a role: the asks known of the role's asks, what is missing, the rest of the ledger
  function summary(rec, roleId, asks) {
    const r = normalize(rec).roles[roleId] || { met: [], known: [], ladders: [], postings: [], demand: 0 };
    const known = new Set(r.known), met = new Set(r.met);
    return { known: asks.filter(id => known.has(id)), met: asks.filter(id => met.has(id)), missing: asks.filter(id => !known.has(id)), total: asks.length, ladders: r.ladders, postings: r.postings.length, demand: r.demand, any: !!(r.known.length || r.met.length || r.ladders.length || r.postings.length || r.demand) };
  }

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
    // the Know-your-role record: note what a round showed and what the player got right; read it back as a summary
    noteRole, asksOf, summary, ASK_CUT,
    role: roleId => storage.read().roles[roleId] || null,
    saveRole(roleId, patch) { const rec = noteRole(storage.read(), roleId, patch); storage.write(rec); return rec.roles[roleId]; },
    knowledge: (roleId, asks) => summary(storage.read(), roleId, asks),
  };
  // the record's first line on an end screen (G4, G6): "You know 9 of the 15 things PM postings ask for · up from 6"
  function knowLine(before, after, label) {
    if (!after.total) return "";
    const n = after.known.length, was = before ? before.known.length : null;
    const change = was == null || was === n ? "" : n > was ? fill(W.upFrom, { was }) : fill(W.downFrom, { was });
    return fill(W.knowLine, { n: `<b>${fill(W.knowCount, { n, m: after.total })}</b>`, role: esc(label), change });
  }

  // ---------- small pieces of markup ----------
  const kbd = k => `<kbd>${esc(k)}</kbd>`;
  const tip = text => `<button type="button" class="tip" aria-label="${esc(W.infoLabel)}" aria-expanded="false" data-tip="${esc(text)}">i</button>`;
  const STORAGE_NOTE = W.storage;
  const KEYS_NOTE = W.keys;
  // the ⓘ text: the rules, the keys, where the numbers come from, the storage note, in that order
  const info = ({ rules, keys, source }) => [rules, keys === false ? "" : keys || KEYS_NOTE, source, STORAGE_NOTE].filter(Boolean).join(" ");
  // the round pips: done, the current one, the rest; `marks[i]` = "ok" | "miss" paints a finished round
  function pips(i, n, marks) {
    if (!n) return "";
    const cls = k => k < i ? (marks && marks[k] ? marks[k] : "done") : k === i ? "now" : "";
    return `<span class="gm-pips" role="img" aria-label="${esc(fill(W.round, { i: Math.min(i + 1, n), n }))}">${Array.from({ length: n }, (_, k) => `<i class="${cls(k)}"></i>`).join("")}</span><span class="gm-pipn">${esc(fill(W.roundShort, { i: Math.min(i + 1, n), n }))}</span>`;
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
      ${why ? `<details class="disc gm-why"><summary>${esc(W.why)}</summary><div class="disc-body">${why}</div></details>` : ""}${footHtml || ""}</div>`;
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
  // A tech role is offered only by a game that deals the tech set (opts.tech; its eval covers it).
  function pickDefault(ix, you, roleParam, roles, opts = {}) {
    const ok = id => !!ix.roles[id] && (ix.roles[id].set !== "tech" || !!opts.tech) && (!roles || (typeof roles === "function" ? roles(id) : roles.has(id)));
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
  const coach = text => `<div class="gm-coach" role="note" id="gm-coach">${esc(text)}<button type="button" class="linkish link" id="gm-coach-ok">${esc(W.gotIt)}</button></div>`;

  // the role page's way into the game before any record (2026-11-06; a new visitor found none): `first` is
  // { href, text }; one line, or "" without both
  const firstCard = first => first && first.href && first.text ? `<p class="gm-first"><a href="${esc(first.href)}">${esc(first.text)}</a></p>` : "";
  if (!document) return { record, info, pips, foot, results, ranked, kbd, tip, pickDefault, coach, knowLine, firstCard, KEYS_NOTE, STORAGE_NOTE };

  // ---------- the frame: header, body, live region ----------
  // frame(el, { game, role, round, rounds, marks, info, quit, cls }) -> { body, set(...), live(msg) }
  function frame(el, o) {
    el.innerHTML = `<div class="page gm${o.cls ? " " + o.cls : ""}"><div class="gm-head">
        <div class="gm-title"><b>${esc(o.game)}</b>${o.role ? `<span class="gm-sep" aria-hidden="true">·</span><span class="gm-role" id="gm-role">${esc(o.role)}</span>` : ""}</div>
        <div class="gm-round" id="gm-round">${pips(o.round, o.rounds, o.marks)}</div>
        <div class="gm-tools"><span id="gm-info">${o.info ? tip(o.info) : ""}</span><a class="gm-quit" href="${esc(o.quit || "#/home")}">${esc(W.quit)} ${kbd("Esc")}</a></div>
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
      if (e.key === "Escape") { if (tipOpen() || document.getElementById("drawer")) return; e.preventDefault(); if (h.quit) h.quit(e); else location.hash = h.quitHref || "#/home"; return; }
      if (e.key === "Enter") { if (t && t.closest && t.closest("button, a, summary")) return; if (h.confirm) { e.preventDefault(); h.confirm(e); } return; }
      if (/^[1-4]$/.test(e.key) && !e.repeat) { if (h.choose && h.choose(Number(e.key), e) !== false) e.preventDefault(); return; }
      if (h.other) h.other(e);
    };
    document.addEventListener("keydown", on, true);
    return () => document.removeEventListener("keydown", on, true);
  }

  // the default role for a game, from the atlas and the profile; `roles` limits it to the roles a game can play
  async function defaultRole(Atlas, roles, opts = {}) {
    const ix = await Atlas.index(); await Atlas.product().catch(() => { });
    let you = null; try { you = JSON.parse(localStorage.getItem("you")); } catch { }
    const q = new URLSearchParams((location.hash.split("?")[1] || "")).get("role");
    return pickDefault(ix, you, q, roles, opts);
  }
  // the one start screen (G1): the title, one sentence, Play on the default role, "Change role" and ⓘ after that
  function start(F, { title, lead, role, play, change, extra, playLabel }) {
    F.set({ round: null, rounds: 0, role: "" });
    F.body.innerHTML = `<div class="gm-start"><h1>${esc(title)}</h1><p class="lead">${esc(lead)}</p>${extra || ""}
      ${foot({ primary: { id: "gm-play", label: playLabel || (role ? esc(fill(W.playRole, { role })) : esc(W.play)), key: "Enter" }, quiet: change ? { id: "gm-change", label: typeof change === "string" ? change : esc(W.changeRole) } : null })}</div>`;
    const p = F.body.querySelector("#gm-play"), c = F.body.querySelector("#gm-change");
    p.onclick = play; if (c && typeof change === "function") c.onclick = change;
    p.focus({ preventScroll: true });
    return { play: p, change: c };
  }
  // the one picker (G9): the Explore field cards, then the field's roles with the player's record as the secondary
  // line. picker(F, { Atlas, roles, field, secondary, onRole, back, title }) draws into the frame's body.
  async function picker(F, o) {
    const Atlas = o.Atlas, ix = await Atlas.index(); await Atlas.product().catch(() => { });
    const ok = id => !!ix.roles[id] && (ix.roles[id].set !== "tech" || !!o.tech) && (!o.roles || (typeof o.roles === "function" ? o.roles(id) : o.roles.has(id)));
    const fmt = n => Number(n).toLocaleString("en-US");
    const groups = ix.groups.map(g => ({ g, roles: (g.roles || []).filter(ok).map(id => ix.roles[id]).sort((a, b) => (b.nOpen || 0) - (a.nOpen || 0)) })).filter(x => x.roles.length);
    let field = o.field && groups.some(x => x.g.id === o.field) ? o.field : groups[0].g.id;
    const draw = () => {
      const cur = groups.find(x => x.g.id === field);
      const card = ({ g, roles }) => { const ex = roles.slice(0, 3).map(r => r.label), more = roles.length - ex.length;
        return `<button type="button" class="fcard${g.id === field ? " on" : ""}" data-field="${esc(g.id)}" aria-pressed="${g.id === field}"><span class="t">${esc(g.label)}</span><span class="m">${esc(fill(W.example, { names: ex.join(" · ") }))}${more > 0 ? esc(fill(W.more, { n: more })) : ""}</span><span class="n">${esc(fill(W.nOpen, { n: fmt(g.nOpen || 0) }))}</span></button>`; };
      const row = r => `<button type="button" class="r" data-role="${esc(r.id)}"><span class="t">${esc(r.label)}</span><span class="n">${esc(fill(W.nOpen, { n: fmt(r.nOpen || 0) }))}</span><span class="m">${esc(o.secondary ? o.secondary(r.id) : "")}</span></button>`;
      F.set({ round: null, rounds: 0, role: "" });
      F.body.innerHTML = `<div class="gm-picker"><h1>${esc(o.title || W.changeRole)}</h1><p class="lead">${esc(o.lead || W.pickField)}</p>
        <div class="fcards">${groups.map(card).join("")}</div>
        <h2>${esc(cur.g.label)}</h2><div class="list">${cur.roles.map(row).join("")}</div>
        ${o.back ? foot({ quiet: { id: "gm-back", label: o.back === true ? esc(W.back) : o.back } }) : ""}</div>`;
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

  // the Know-your-role card (G4): the ledger shown beside a role screen's action row and on About you
  // knowCard({ roleId, label, asks, nameOf, practise, first }) -> html, or with nothing known yet firstCard(first)
  function knowCard(o) {
    const k = summary(storage.read(), o.roleId, o.asks); if (!k.any) return firstCard(o.first);
    const names = ids => ids.map(id => esc(o.nameOf(id))).join(", ");
    const missing = k.missing.slice(0, 3);
    return `<div class="gm-know"><p class="eyebrow">${esc(W.knowHeading)}</p>
      <div class="gm-know-r"><span>${esc(W.asksKnown)}</span><b>${k.known.length} of ${k.total}</b></div>
      <div class="gm-know-bar" data-measure="${esc(fill(W.knowMeasure, { n: k.known.length, m: k.total, share: Math.round(ASK_CUT * 100) + "%", role: o.label }))}"><i style="width:${k.total ? Math.round(100 * k.known.length / k.total) : 0}%"></i></div>
      ${k.ladders.length ? `<div class="gm-know-r"><span>${esc(W.levelsSorted)}</span><b>${names(k.ladders.slice(0, 3))}${k.ladders.length > 3 ? ` +${k.ladders.length - 3}` : ""}</b></div>` : ""}
      ${k.postings ? `<div class="gm-know-r"><span>${esc(W.postingsRead)}</span><b>${k.postings}</b></div>` : ""}
      ${k.demand ? `<div class="gm-know-r"><span>${esc(W.demandSeen)}</span><b>${k.demand}</b></div>` : ""}
      ${missing.length && o.practise ? `<p class="gm-know-p"><a href="${esc(o.practise(k.missing))}">${esc(W.practiceMissing)}</a> <span class="muted">${names(missing)}${k.missing.length > 3 ? ", …" : ""}</span></p>` : ""}</div>`;
  }

  return { record, info, pips, foot, results, ranked, kbd, tip, frame, keys, pickDefault, defaultRole, start, picker, coach, coachOnce, knowLine, knowCard, firstCard, KEYS_NOTE, STORAGE_NOTE };
});
