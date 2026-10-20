/* Where's the demand: rank the fields (PLAN.md v12, WID1 WID2; spec: games/wheres-the-demand/README.md).
   Round one: put five fields in order of open US postings. Round two: five roles of the player's field. No clock.
   The reveal is the Explore field cards' own bars with the player's order painted on; the gap line is the takeaway,
   the employer count (roles) or the role count (fields) its why. Drawn in the shared shell (web/gameshell.js):
   one header, 1 to 5 place a card, Enter checks or goes on, Esc quits, one record (demand +1 per role on a board).
   The pure part (entities, the deals, the scorer, the words) loads in node for tests/web/wheres-the-demand.test.mjs;
   the DOM part registers window.Games["wheres-the-demand"]. */
(function (root) {
  "use strict";
  const SLUG = "wheres-the-demand", TITLE = "Where's the demand";
  const N = 5, ROUNDS = 2, MIN_ROLES = 3, STALE_DAYS = 10;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ---------- small pure helpers ----------
  const r1 = x => Math.round(x * 10) / 10;
  const fmt = n => Number(n).toLocaleString("en-US");
  const fmtRatio = r => String(r1(r)).replace(/\.0$/, "") + "×";
  const ord = n => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || "th");
  function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  // a small seeded generator (mulberry32) for ?seed= rounds and tests
  function seeded(seed) { let a = (Number(seed) >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function fmtDate(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso || ""); }
  function daysSince(iso, now = new Date()) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); if (!m) return 0; const then = Date.UTC(+m[1], +m[2] - 1, +m[3]), today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()); return Math.floor((today - then) / 86400000); }

  // ---------- the entities a board can hold: the MBA fields and their roles (not the small ones); never ix.roles (product's pmm overwrites it) ----------
  function entities(ix) {
    const groups = ix.groups.filter(g => g.set === "mba" && g.id !== "product" && g.nOpen > 0);
    const fields = [], roles = [], byField = {};
    for (const g of groups) {
      byField[g.id] = [];
      for (const id of g.roles) {
        const r = ix.M.roles[id]; if (!r || r.small || !r.n_open) continue;
        const card = { kind: "role", id, label: r.label, sub: g.label, field: g.id, fieldLabel: g.label, n: r.n_open, employers: r.n_companies || 0, href: `#/role/${id}` };
        roles.push(card); byField[g.id].push(card);
      }
      byField[g.id].sort((a, b) => b.n - a.n);
      fields.push({ kind: "field", id: g.id, label: g.label, sub: `${g.roles.length} roles`, n: g.nOpen, roles: g.roles.length, href: `#/field/${g.id}` });
    }
    return { fields, roles, byField };
  }
  // no two cards with the same count on one board: "in place" has to mean one thing
  const distinct = (taken, c) => !taken.some(t => t.n === c.n);
  const order = items => items.slice().sort((a, b) => b.n - a.n);

  // round one: five fields, the player's own field among them when it has one; display order shuffled
  function dealFields(ents, rng, { field = null } = {}) {
    const taken = [];
    const mine = field && ents.fields.find(f => f.id === field);
    if (mine) taken.push(mine);
    for (const f of shuffle(ents.fields.slice(), rng)) { if (taken.length >= N) break; if (!taken.includes(f) && distinct(taken, f)) taken.push(f); }
    return { kind: "fields", label: "fields", items: shuffle(taken.slice(), rng), order: order(taken) };
  }
  // round two: the field's roles, largest first, up to five; a field with fewer is topped up with the largest roles of
  // other fields (every card shows its field, so a mixed board reads the same)
  function dealRoles(ents, field, rng) {
    const taken = [];
    for (const r of ents.byField[field] || []) { if (taken.length >= N) break; if (distinct(taken, r)) taken.push(r); }
    if (taken.length < N) for (const r of order(ents.roles)) { if (taken.length >= N) break; if (!taken.includes(r) && distinct(taken, r)) taken.push(r); }
    const own = taken.filter(r => r.field === field).length;
    return { kind: "roles", label: "roles", field, items: shuffle(taken.slice(), rng), order: order(taken), mixed: own < taken.length };
  }
  // the score: a card is in place when the player put it where the counts put it
  function scoreOrder(board, answer) {
    const truth = board.order.map(c => c.id);
    const rows = board.order.map((c, i) => { const at = answer.indexOf(c.id); return { card: c, rank: i + 1, at: at < 0 ? null : at + 1, right: at === i }; });
    return { rows, inPlace: rows.filter(r => r.right).length, n: truth.length };
  }
  // the one line on the gap between two cards, as parts: ["t", text] or ["n", number or ratio]; the why is the
  // employer count for roles and the role count for fields
  function gapLine(w, l) {
    const r = fmtRatio(w.n / l.n);
    if (w.kind === "role") {
      const fewer = w.employers && l.employers && w.employers < l.employers;
      return [["t", `${w.label} has `], ["n", r], ["t", ` the open postings of ${l.label}: `], ["n", fmt(w.n)], ["t", " against "], ["n", fmt(l.n)], ...(fewer ? [["t", ", from fewer employers: "], ["n", fmt(w.employers)], ["t", " against "], ["n", fmt(l.employers)], ["t", "."]] : [["t", `, from `], ["n", fmt(w.employers)], ["t", " and "], ["n", fmt(l.employers)], ["t", " employers."]])];
    }
    return [["t", `${w.label} has `], ["n", r], ["t", ` the open postings of ${l.label}: `], ["n", fmt(w.n)], ["t", " against "], ["n", fmt(l.n)], ["t", `, over ${w.roles} and ${l.roles} roles.`]];
  }
  // the takeaway of a reveal: the card the player put furthest from its place, against the card that sits where
  // they put it; with everything in place, the top two
  function takeaway(score) {
    const off = score.rows.filter(r => !r.right && r.at != null).sort((a, b) => Math.abs(b.at - b.rank) - Math.abs(a.at - a.rank) || a.rank - b.rank)[0];
    if (!off) { const [a, b] = score.rows; return { parts: gapLine(a.card, b.card), card: a.card }; }
    const other = score.rows[off.at - 1].card, c = off.card;
    const [w, l] = c.n > other.n ? [c, other] : [other, c];
    return { parts: [["t", `You had ${c.label} ${ord(off.at)}; it is ${ord(off.rank)}. `], ...gapLine(w, l)], card: c };
  }
  const partsText = parts => parts.map(([, v]) => v).join("");

  const logic = { N, ROUNDS, entities, dealFields, dealRoles, scoreOrder, gapLine, takeaway, partsText, seeded, shuffle, ord };

  // ---------- the screens ----------
  if (!root.document) { if (typeof module === "object" && module.exports) module.exports = logic; return; }
  let live = null;   // the mounted game, so a second mount (hash change) can stop the first

  async function mount(el, ctx) {
    if (live) live.destroy();
    const A = ctx.Atlas, esc = ctx.esc, GS = root.GameShell;
    const seedParam = (() => { const q = location.hash.split("?")[1]; if (!q) return null; const v = new URLSearchParams(q).get("seed"); return v == null || v === "" ? null : Number(v); })();
    const rng = seedParam == null || Number.isNaN(seedParam) ? Math.random : seeded(seedParam);
    const saved = () => Object.assign({ best: null, lastScore: null, field: null, plays: 0 }, GS.record.game(SLUG));
    const S = { phase: "start", ents: null, ix: null, field: null, boards: [], i: 0, answer: [], scores: [] };
    const INFO = GS.info({ rules: "Put five fields in order of open US postings, most at the top, then five roles of your field. Click the cards in order, or drag them; check, and see the real counts on the fields' own bars. Two rounds, no clock.", keys: "Keys: 1 to 5 place the next card, Backspace takes the last one back, Enter checks or goes on, Esc quits.", source: "Counts are open postings in the United States from employers' own careers pages, refreshed every week." });
    const F = GS.frame(el, { game: TITLE, cls: "wd-page", info: INFO });
    const $ = s => el.querySelector(s);
    const html = parts => parts.map(([k, v]) => k === "n" ? `<span class="num">${esc(v)}</span>` : esc(v)).join("");
    const render = inner => { F.body.innerHTML = inner; root.scrollTo(0, 0); };
    const announce = text => F.live(text);
    const dateOf = () => fmtDate((S.ix && S.ix.M.meta || {}).generated);
    const fieldOf = id => S.ents.fields.find(f => f.id === id);

    const me = { destroy, destroyed: false }, offKeys = offKeysWire();
    root.addEventListener("hashchange", onHash);
    live = me;
    try { S.ix = await A.index(); } catch (e) { return showError(e); }
    if (me.destroyed) return;
    S.ents = entities(S.ix);
    // the field: the profile's first field with a board, else the one chosen last time, else the largest
    let you = null; try { you = JSON.parse(localStorage.getItem("you")); } catch { }
    const has = id => !!fieldOf(id);
    S.field = ((you && you.fields) || []).find(has) || (has(saved().field) ? saved().field : null) || order(S.ents.fields)[0].id;
    showStart();

    // --- start screen: one sentence and Play on the field; the field chips behind it ---
    function showStart() {
      S.phase = "start";
      const sv = saved(), meta = S.ix.M.meta || {}, stale = daysSince(meta.generated), f = fieldOf(S.field);
      const extra = `<div class="chips fields" role="group" aria-label="Your field"><span class="lbl">Your field</span>${order(S.ents.fields).map(x => `<button type="button" class="chip${x.id === S.field ? " on" : ""}" data-field="${esc(x.id)}" aria-pressed="${x.id === S.field}">${esc(x.label)}</button>`).join("")}</div>
  ${sv.best != null ? `<p class="gm-best">Your best: <b>${esc(sv.best)}</b> of ${N * ROUNDS} in place</p>` : ""}
  ${stale > STALE_DAYS ? `<p class="small wd-stale">The counts were last refreshed ${esc(stale)} days ago.</p>` : ""}`;
      GS.start(F, { title: "Where's the demand?", lead: `Put five fields in order of open postings, then five ${f.label} roles. Two rounds, no clock.`, playLabel: `Play · ${esc(f.label)}`, play: startGame, extra });
      for (const b of el.querySelectorAll("[data-field]")) b.onclick = () => { S.field = b.dataset.field; GS.record.saveGame(SLUG, { field: S.field }); showStart(); };
    }
    function showError(e) {
      console.error(e);
      render(`<div class="narrow"><h1>Something did not load</h1><p class="lead">${esc(e && e.message || e)}. Reload the page; if it happens again, the data files may be missing.</p>${GS.foot({ primary: { href: "#/", label: "All games" } })}</div>`);
    }

    // --- a game: two boards ---
    function startGame() {
      if (S.phase !== "start" && S.phase !== "end") return;
      S.boards = [dealFields(S.ents, rng, { field: S.field }), dealRoles(S.ents, S.field, rng)];
      S.i = 0; S.scores = [];
      showBoard();
    }
    const marks = () => S.scores.map(s => s.inPlace * 2 >= s.n ? "ok" : "miss");
    const head = () => F.set({ round: S.i, rounds: ROUNDS, marks: marks(), role: fieldOf(S.field).label });

    function showBoard() {
      S.phase = "board"; S.answer = []; head();
      const b = S.boards[S.i], f = fieldOf(S.field);
      const what = b.kind === "fields" ? "five fields" : b.mixed ? "five roles" : `five ${f.label} roles`;
      render(`<h1 class="wd-prompt">Put these ${esc(what)} in order of open postings</h1>
<p class="wd-sub">Most at the top. Click them in order, or drag a placed card to move it. Open US postings, as of ${esc(dateOf())}.</p>
<div class="wd-rank"><div class="wd-pool" id="wd-pool" aria-label="Cards to place"></div><ol class="wd-slots" id="wd-slots" aria-label="Your order"></ol></div>
<p class="gm-key" id="wd-count"></p>
${GS.foot({ primary: { id: "wd-check", label: "Check", key: "Enter", disabled: true }, quiet: { id: "wd-undo", label: "Take the last one back" } })}`);
      $("#wd-check").onclick = check; $("#wd-undo").onclick = undo;
      paint();
      if (S.i === 0) GS.coachOnce(SLUG, $(".wd-rank"), "Click the field with the most open postings first, then the next. Press 1 to 5 to place a card by its number.", "beforebegin");
    }
    function paint() {
      const b = S.boards[S.i], placed = new Set(S.answer);
      const pool = b.items.filter(c => !placed.has(c.id));
      $("#wd-pool").innerHTML = b.items.map((c, k) => placed.has(c.id) ? `<span class="wd-chip gone" aria-hidden="true"><kbd>${k + 1}</kbd><span class="t">${esc(c.label)}</span></span>` : `<button type="button" class="wd-chip" data-place="${esc(c.id)}"><kbd aria-hidden="true">${k + 1}</kbd><span class="t">${esc(c.label)}</span><span class="f">${esc(c.sub)}</span></button>`).join("");
      $("#wd-slots").innerHTML = Array.from({ length: N }, (_, i) => { const c = S.answer[i] && b.items.find(x => x.id === S.answer[i]);
        return c ? `<li class="wd-slot on" draggable="true" data-at="${i}"><span class="k mono">${i + 1}</span><span class="t">${esc(c.label)}</span><span class="f">${esc(c.sub)}</span><button type="button" class="linkish link wd-back" data-back="${esc(c.id)}" aria-label="Take ${esc(c.label)} back">×</button></li>` : `<li class="wd-slot" data-at="${i}"><span class="k mono">${i + 1}</span><span class="t muted">${i === S.answer.length ? "Next" : ""}</span></li>`; }).join("");
      $("#wd-count").textContent = S.answer.length < N ? `${S.answer.length} of ${N} placed` : "All five placed. Check when you are ready.";
      $("#wd-check").disabled = S.answer.length < N;
      for (const bt of el.querySelectorAll("[data-place]")) bt.onclick = () => place(bt.dataset.place);
      for (const bt of el.querySelectorAll("[data-back]")) bt.onclick = () => { S.answer = S.answer.filter(id => id !== bt.dataset.back); paint(); };
      wireDrag();
      if (pool.length && document.activeElement && !el.contains(document.activeElement)) { const first = $("[data-place]"); if (first) first.focus({ preventScroll: true }); }
    }
    function place(id) {
      if (S.phase !== "board" || S.answer.includes(id) || S.answer.length >= N) return;
      const c = S.boards[S.i].items.find(x => x.id === id); if (!c) return;
      S.answer.push(id); paint();
      announce(`${c.label} placed ${ord(S.answer.length)}.`);
      if (S.answer.length >= N) $("#wd-check").focus({ preventScroll: true }); else { const n = $("[data-place]"); if (n) n.focus({ preventScroll: true }); }
    }
    function undo() { if (S.phase !== "board" || !S.answer.length) return; S.answer.pop(); paint(); const n = $("[data-place]"); if (n) n.focus({ preventScroll: true }); }
    // drag a placed card onto another slot to move it there
    function wireDrag() {
      let from = null;
      for (const li of el.querySelectorAll(".wd-slot")) {
        li.ondragstart = e => { if (!li.classList.contains("on")) { e.preventDefault(); return; } from = Number(li.dataset.at); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(from)); } catch { } li.classList.add("drag"); };
        li.ondragend = () => li.classList.remove("drag");
        li.ondragover = e => { if (from == null) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; li.classList.add("over"); };
        li.ondragleave = () => li.classList.remove("over");
        li.ondrop = e => { e.preventDefault(); li.classList.remove("over"); const to = Number(li.dataset.at); if (from == null || to === from) return; const a = S.answer.slice(); const [c] = a.splice(from, 1); a.splice(Math.min(to, a.length), 0, c); S.answer = a; from = null; paint(); };
      }
    }

    // --- the reveal: the measure, the cards' own bars with the player's order painted on, the gap line as the takeaway ---
    function check() {
      if (S.phase !== "board" || S.answer.length < N) return;
      S.phase = "reveal";
      const b = S.boards[S.i], sc = scoreOrder(b, S.answer);
      S.scores[S.i] = sc; head();
      // the Know-your-role record: a demand count seen, for each role on the board
      if (b.kind === "roles") for (const c of b.items) GS.record.saveRole(c.id, { label: c.label, demand: 1 });
      const t = takeaway(sc), last = S.i + 1 >= ROUNDS, f = fieldOf(S.field);
      const rows = sc.rows.map(r => ({ name: r.card.label, share: r.card.n, shareText: `${fmt(r.card.n)} open`, cls: r.right ? "you" : "miss", note: r.right ? "in place" : `you had it ${ord(r.at)}` }));
      render(GS.results({
        eyebrow: `Round ${S.i + 1} of ${ROUNDS} · ${b.kind === "fields" ? "the fields" : b.mixed ? "the roles" : `roles in ${esc(f.label)}`}`,
        measure: `${sc.inPlace} of ${sc.n} in place`,
        takeaway: html(t.parts),
        visual: `<p class="gm-key">The real order; blue is open US postings, as of ${esc(dateOf())}. Green is in place.</p>${GS.ranked(rows, "{n} of the top card's open postings")}`,
        link: { href: t.card.href, label: `Open ${t.card.label}` },
        foot: GS.foot({ primary: { id: "wd-next", label: last ? "See your result" : S.boards[1].mixed ? "Round 2: the roles" : `Round 2: roles in ${esc(f.label)}`, key: "Enter" } }),
      }));
      $("#wd-next").onclick = next;
      F.focusMeasure();
      announce(`${sc.inPlace} of ${sc.n} in place. ${partsText(t.parts)}`);
    }
    function next() { if (S.phase !== "reveal") return; S.i++; if (S.i < ROUNDS) showBoard(); else showEnd(); }

    // --- the end: the measure in plain words, the change since last time, one takeaway, both orders ---
    function showEnd() {
      S.phase = "end";
      const total = S.scores.reduce((a, s) => a + s.inPlace, 0), of = S.scores.reduce((a, s) => a + s.n, 0), sv = saved(), f = fieldOf(S.field);
      const isBest = sv.best == null || total > sv.best;
      GS.record.saveGame(SLUG, { played: true, best: isBest ? total : sv.best, lastScore: total, field: S.field });
      const change = sv.lastScore == null ? "Your first game." : total > sv.lastScore ? `Up from ${sv.lastScore} last time.` : total < sv.lastScore ? `Down from ${sv.lastScore} last time.` : "The same as last time.";
      const nRoles = S.boards[1].items.length;
      const rec = `You saw where the open postings are for <b>${nRoles}</b> roles and ${S.boards[0].items.length} fields. ${change}${isBest && sv.best != null ? " A new best." : sv.best != null ? ` Your best: <b>${esc(sv.best)}</b>.` : ""}`;
      const meta = S.ix.M.meta || {};
      const list = b => `<div class="list wd-recap">${b.order.map((c, i) => `<a class="r" href="${esc(c.href)}"><span class="mk mono">${i + 1}</span><span class="t">${esc(c.label)}</span><span class="m">${esc(c.kind === "role" ? `${c.sub} · ${fmt(c.employers)} employers` : c.sub)}</span><span class="n">${fmt(c.n)}</span></a>`).join("")}</div>`;
      F.set({ round: ROUNDS, rounds: ROUNDS, marks: marks() });
      render(GS.results({
        eyebrow: "Two rounds done",
        measure: `${total} of ${of} in place`,
        record: rec,
        takeaway: `The counts move every week: <b>${fmt(meta.n_open || 0)}</b> open US postings across ${S.ents.roles.length} roles on ${esc(dateOf())}. Nobody keeps that map in their head; Explore does.`,
        visual: `<div class="wd-two"><div><h3>The fields</h3>${list(S.boards[0])}</div><div><h3>${S.boards[1].mixed ? "The roles" : `Roles in ${esc(f.label)}`}</h3>${list(S.boards[1])}</div></div><p class="gm-key">Blue is open US postings.</p>`,
        link: { href: "#/explore", label: "Explore the fields" },
        foot: GS.foot({ primary: { id: "wd-again", label: "Play again", key: "Enter" }, quiet: { id: "wd-change", label: "Change field" } }),
      }));
      $("#wd-again").onclick = startGame; $("#wd-change").onclick = showStart;
      F.focusMeasure();
      announce(`${total} of ${of} in place.`);
    }

    // --- keys, cleanup ---
    function offKeysWire() { return GS.keys({
      choose(n) { if (S.phase !== "board") return false; const c = S.boards[S.i].items[n - 1]; if (c) place(c.id); return true; },
      confirm() { if (S.phase === "board") check(); else if (S.phase === "reveal") next(); else if (S.phase === "start" || S.phase === "end") startGame(); },
      other(e) {
        if (S.phase !== "board") return;
        if (e.key === "5" && !e.repeat) { const c = S.boards[S.i].items[4]; if (c) { e.preventDefault(); place(c.id); } }
        else if (e.key === "Backspace" && !(e.target && e.target.closest && e.target.closest("input, textarea"))) { e.preventDefault(); undo(); }
      },
    }); }
    function onHash() { destroy(); }
    function destroy() {
      if (me.destroyed) return;
      S.phase = "gone"; me.destroyed = true;
      offKeys(); root.removeEventListener("hashchange", onHash);
      if (live === me) live = null;
    }
  }

  root.Games = root.Games || {};
  root.Games[SLUG] = { mount };
  root.WheresTheDemand = logic;
})(typeof window !== "undefined" ? window : globalThis);
