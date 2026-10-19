/* Guess the role (#/play/guess-the-role): skills from one real, open posting, one at a time; name the role.
   Spec: games/guess-the-role/README.md. Data: the MBA index (Atlas.index()) and one role file per round, loaded lazily.
   The data rules (pool, sampling, distractors, clues, scoring, ranks) are pure functions in `rules`, loaded in node by
   evals/games_guess_the_role.mjs with the same UMD pattern as atlas.js; the screens follow below them.
   Colours keep their meaning: green = you (right, chosen, your rank), blue = the postings' numbers, amber = attention
   or wrong; skill areas are text. Desktop only. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();   // node: require("web/games/guess-the-role.js")
  else { root.Games = root.Games || {}; root.Games["guess-the-role"] = { mount: factory().mount }; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const SLUG = "guess-the-role", KEY = "game." + SLUG, ROUNDS = 10, CLUES = 5, MAX = ROUNDS * 500;
  const CAP = 0.90, FLOOR = 0.005, LIFT_FLOOR = 0.01, MIN_SKILLS = 8, RED_HERRING = [-Math.log(1.5), -Math.log(2)], CLOSE_LIFT = 1.5;
  const RANKS = [[0, "Career fair tourist"], [1000, "Info session regular"], [2000, "Coffee chat pro"], [2900, "Recruiter's favourite"], [3800, "Walking job board"]];
  const TIMER_S = 20;

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  // titles carry HTML entities in the data (&amp;): decode, then escape
  const decodeEntities = s => String(s ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(parseInt(e[1] === "x" || e[1] === "X" ? e.slice(2) : e.slice(1), e[1] === "x" || e[1] === "X" ? 16 : 10)) : (ENT[e.toLowerCase()] ?? m));
  const fmt = n => Number(n).toLocaleString("en-US");
  const pct = v => v <= 0 ? "0%" : v < 0.005 ? "under 1%" : Math.round(v * 100) + "%";
  const lower = s => /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;   // "Cash & liquidity management" → "cash & …", "FX & …" stays
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  // ---------- seeded randomness, so a seed reproduces a game ----------
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const shuffle = (arr, rnd) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

  // ---------- the data rules: everything but the posting itself comes from the index ----------
  // ix: Atlas.index(); generic: Atlas.genericSkills(); shareMin: Atlas.TIER.common (0.25)
  function prepare(ix, generic, shareMin) {
    const M = ix.M;
    const fields = ix.groups.filter(g => g.set === "mba").map(g => ({ id: g.id, label: g.label, roles: g.roles.slice() }));
    const roles = fields.flatMap(f => f.roles);
    const fieldOf = {}, fieldLabel = {};
    for (const f of fields) { fieldLabel[f.id] = f.label; for (const r of f.roles) fieldOf[r] = f.id; }
    const eligible = new Set(M.skills.filter(s => s.cluster !== "credentials" && !s.id.startsWith("yoe_") && !generic.has(s.id)).map(s => s.id));
    const eligibleList = [...eligible].sort();
    const share = (r, s) => ((ix.skillById[s] || {}).by_family || {})[r] || 0;
    const avg = s => ix.baseline[s] || 0;
    const lift = (r, s) => share(r, s) / Math.max(avg(s), LIFT_FLOOR);
    const ln = v => Math.log(Math.max(v, FLOOR));
    const disc = (r, D, s) => ln(share(r, s)) - Math.max(...D.map(d => ln(share(d, s))));

    // each role's profile: its share vector over the eligible skills; similarity is the cosine between two profiles
    const profile = {}, norm = {};
    for (const r of roles) { const v = eligibleList.map(s => share(r, s)); profile[r] = v; norm[r] = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1; }
    const simCache = {};
    const similarity = (a, b) => { const k = a < b ? a + "|" + b : b + "|" + a; if (simCache[k] != null) return simCache[k]; const va = profile[a], vb = profile[b]; let dot = 0; for (let i = 0; i < va.length; i++) dot += va[i] * vb[i]; return simCache[k] = dot / (norm[a] * norm[b]); };

    // the three distractors: fair (nothing above the cap) but not trivial (the nearest roles), 2 + 2 or 1 + 1 + 1 + 1
    const distCache = {};
    function distractors(r) {
      if (distCache[r]) return distCache[r];
      const cands = roles.filter(x => x !== r && similarity(r, x) <= CAP).map(x => ({ id: x, sim: similarity(r, x), field: fieldOf[x] })).sort((a, b) => b.sim - a.sim || byId(a, b));
      const same = cands.filter(c => c.field === fieldOf[r]);
      const others = fields.filter(f => f.id !== fieldOf[r]).map(f => ({ field: f.id, top: cands.filter(c => c.field === f.id) })).filter(o => o.top.length);
      let out = null;
      if (same.length) {
        const pairs = others.filter(o => o.top.length >= 2).map(o => ({ ...o, mean: (o.top[0].sim + o.top[1].sim) / 2 })).sort((a, b) => b.mean - a.mean || (a.field < b.field ? -1 : 1));
        if (pairs.length) out = { ids: [same[0].id, pairs[0].top[0].id, pairs[0].top[1].id], pattern: "2+2" };
      }
      if (!out) {
        const near = others.map(o => o.top[0]).sort((a, b) => b.sim - a.sim || byId(a, b)).slice(0, 3);
        out = { ids: near.map(c => c.id), pattern: "1+1+1+1" };
      }
      out.sims = Object.fromEntries(out.ids.map(d => [d, similarity(r, d)]));
      return distCache[r] = out;
    }

    const skillsOf = job => job.skills.map(s => typeof s === "number" ? M.skill_ids[s] : s);
    const eligibleOf = job => skillsOf(job).filter(s => eligible.has(s));

    // the five clues of a posting: least distinctive first, the giveaway last; null when the posting is not playable
    function clues(r, job) {
      const D = distractors(r).ids;
      const skills = [...new Set(eligibleOf(job))];
      if (skills.length < MIN_SKILLS) return null;
      const typical = skills.filter(s => share(r, s) >= shareMin).map(s => ({ id: s, share: share(r, s), disc: disc(r, D, s), lift: lift(r, s) }));
      const give = typical.filter(t => t.disc > 0).sort((a, b) => b.disc - a.disc || b.share - a.share || byId(a, b))[0];
      if (!give) return null;
      for (let pass = 0; pass < RED_HERRING.length; pass++) {
        const rest = typical.filter(t => t.id !== give.id && t.disc >= RED_HERRING[pass]).sort((a, b) => a.lift - b.lift || byId(a, b));
        if (rest.length < CLUES - 1) continue;
        const n = rest.length, at = [0, Math.round((n - 1) / 3), Math.round(2 * (n - 1) / 3), n - 1];
        return { clues: [...at.map(i => rest[i].id), give.id], giveaway: give.id, relaxed: pass > 0 };
      }
      return null;
    }
    const isOpen = job => job.open == null ? true : !!job.open;
    const playable = (r, jobs) => jobs.filter(isOpen).map(job => ({ job, picked: clues(r, job) })).filter(x => x.picked);

    // the close calls: where each distractor came closest to the answer, and its share of the giveaway
    function closeCalls(r, picked) {
      const D = distractors(r).ids, give = picked.giveaway;
      const pool = picked.clues.filter(s => s !== give && lift(r, s) >= CLOSE_LIFT);
      const from = pool.length ? pool : picked.clues.filter(s => s !== give);
      return D.map(d => { const s = from.slice().sort((a, b) => share(d, b) / share(r, b) - share(d, a) / share(r, a) || (a < b ? -1 : 1))[0]; return { id: d, skill: s, dShare: share(d, s), rShare: share(r, s), gShare: share(d, give) }; });
    }

    const nOpen = roles.reduce((a, r) => a + (M.roles[r].n_open || 0), 0);
    return { ix, M, fields, roles, fieldOf, fieldLabel, eligible, share, avg, lift, disc, similarity, distractors, skillsOf, eligibleOf, clues, playable, closeCalls, isOpen, nOpen, nRoles: roles.length, nAll: Object.keys(M.families).length };
  }

  const points = shown => Math.max(0, (CLUES + 1 - shown) * 100);   // 500 after 1 clue … 100 after 5
  const rank = score => RANKS.filter(([min]) => score >= min).pop()[1];
  const nextRank = score => RANKS.find(([min]) => score < min) || null;

  // one role per field, in a random order; unseen roles of a field first; `used` holds the ids already taken this game
  function pickRole(field, seen, used, rnd) {
    const open = field.roles.filter(r => !used.has(r));
    if (!open.length) return null;
    const fresh = open.filter(r => !seen.has(r));
    return pick(fresh.length ? fresh : open, rnd);
  }
  // one playable posting of a role: never two postings from the same company in a game, never the same company and
  // title twice in a row across games
  function pickPosting(list, companies, lastGame, rnd) {
    const ok = list.filter(x => !companies.has(x.job.company) && !lastGame.has(x.job.company + "\n" + x.job.title));
    return ok.length ? pick(ok, rnd) : null;
  }

  const rules = { prepare, points, rank, nextRank, pickRole, pickPosting, rng, shuffle, decodeEntities, CAP, FLOOR, MIN_SKILLS, RED_HERRING, RANKS, ROUNDS, CLUES, MAX };

  // ---------- the screens ----------
  async function mount(el, ctx) {
    const { Atlas, crumbs } = ctx;
    const store = { get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }, set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { } } };
    const saved = Object.assign({ v: 1, best: [], seen: [], timer: false, plays: 0 }, store.get() || {});
    let alive = true, timer = null, game = null, lastGame = new Set();   // lastGame: company + title of the previous game's postings
    el.classList.add("gtr");
    el.innerHTML = `<div class="sr-only" aria-live="polite" id="gtr-live"></div><div id="gtr-screen"></div>`;
    const screen = el.querySelector("#gtr-screen"), live = el.querySelector("#gtr-live");
    const say = text => { live.textContent = ""; setTimeout(() => { if (alive) live.textContent = text; }, 30); };
    const focus = sel => { const n = screen.querySelector(sel); if (n) { n.setAttribute("tabindex", "-1"); n.focus({ preventScroll: true }); } };
    const stopTimer = () => { if (timer) { clearInterval(timer.id); timer = null; } };
    const leave = () => { alive = false; stopTimer(); document.removeEventListener("keydown", onKey); window.removeEventListener("hashchange", leave); el.classList.remove("gtr"); };
    window.addEventListener("hashchange", leave);
    document.addEventListener("keydown", onKey);

    let D = null;
    try {
      const [ix, generic] = await Promise.all([Atlas.index(), Atlas.genericSkills()]);
      D = prepare(ix, generic, Atlas.TIER.common);
    } catch (e) { return failScreen(e); }
    if (!alive) return;
    renderStart();

    function onKey(e) {
      if (!alive || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target;
      if (t && t.matches && t.matches("input, textarea, select, [contenteditable]")) return;   // never while typing
      if (e.key === "Enter") {
        if (t && t.closest && t.closest("button, a, summary")) return;   // the element's own activation handles Enter
        e.preventDefault(); enter();
      } else if (/^[1-4]$/.test(e.key) && game && game.phase === "clue") { e.preventDefault(); answer(Number(e.key) - 1); }
    }
    function enter() {
      const phase = game ? game.phase : "start";
      if (phase === "start" || phase === "end") startGame();
      else if (phase === "clue") nextClue();
      else if (phase === "reveal") nextRound();
    }

    // ----- start -----
    function renderStart() {
      crumbs([["Games", "#/"], ["Guess the role", null]]);
      const best = saved.best[0];
      screen.innerHTML = `<div class="gtr-start">
 <p class="eyebrow">Game · about 5 minutes</p>
 <h1 class="gtr-title">Guess the role</h1>
 <p class="lead">Skills from one real, open job posting appear one at a time. Name the role it is for. The fewer clues you need, the more points you keep.</p>
 <div class="gtr-rules">
  <div class="rule"><span class="k mono">1</span><b>One posting</b><span>Its skills arrive one by one, the giveaway last.</span><span class="ex">${exampleClues()}</span></div>
  <div class="rule"><span class="k mono">2</span><b>Four roles</b><span>Press 1 to 4 to answer, or Enter for the next clue.</span><span class="ex"><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> &nbsp; <kbd>Enter</kbd></span></div>
  <div class="rule"><span class="k mono">3</span><b>Fewer clues, more points</b><span>Each clue you take lowers the round.</span><span class="ex mono nw">${Array.from({ length: CLUES }, (_, i) => points(i + 1)).join(" ")}</span></div>
  <div class="rule"><span class="k mono">4</span><b>One guess</b><span>A wrong answer scores 0 and the round is over.</span><span class="ex">Then you see who really asks for it.</span></div>
 </div>
 <p class="gtr-pool">Ten rounds, one from each field. Drawn from <span class="num">${fmt(D.nOpen)}</span> open postings for <span class="num">${D.nRoles}</span> roles.</p>
 <div class="row gtr-go"><button class="btn primary" type="button" id="gtr-start">Start <kbd class="on-primary">Enter</kbd></button>
  <button class="chip${saved.timer ? " on" : ""}" type="button" id="gtr-timer" aria-pressed="${saved.timer}">Gentle timer: ${saved.timer ? "on" : "off"}</button>
  ${best ? `<span class="small muted">Your best: <b class="you mono">${fmt(best.score)}</b> · ${esc(best.rank)}</span>` : ""}</div>
</div>`;
      window.scrollTo(0, 0);
      screen.querySelector("#gtr-start").onclick = startGame;
      screen.querySelector("#gtr-timer").onclick = () => { saved.timer = !saved.timer; store.set(saved); renderStart(); say(saved.timer ? `Gentle timer on: ${TIMER_S} seconds a clue, then the next clue appears.` : "Gentle timer off."); };
    }
    // the example tile: the two least distinctive clues of a typical posting would need a role file, so the tile shows
    // the two most common eligible skills across the 50 roles, which is what early clues look like
    function exampleClues() {
      const top = [...D.eligible].map(s => ({ s, a: D.avg(s) })).sort((a, b) => b.a - a.a).slice(0, 2);
      return top.map(t => esc(D.ix.skillById[t.s].name)).join("<br>") + "<br>…";
    }

    // ----- a game -----
    function startGame() {
      if (game && game.phase === "end") lastGame = new Set(game.rounds.map(r => r.job.company + "\n" + r.job.title));
      const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0, rnd = rng(seed);
      const seen = new Set(saved.seen), used = new Set();
      const fields = shuffle(D.fields, rnd);
      const plan = fields.map(f => { const r = pickRole(f, seen, used, rnd); used.add(r); return r; });
      game = { seed, rnd, fields, plan, used, seenBefore: seen, rounds: [], i: -1, score: 0, companies: new Set(), fails: 0, phase: "loading" };
      nextRound();
    }
    const loadRole = id => Atlas.fetchJson("data/" + D.M.roles[id].file);   // via M.roles, never ix.roles (pmm is shared with the product set)
    const prefetch = id => { if (id) loadRole(id).catch(() => { }); };

    async function nextRound() {
      stopTimer();
      game.i++;
      if (game.i >= ROUNDS) return endGame();
      game.phase = "loading";
      const field = game.fields[game.i];
      let shownLoading = false;
      const slow = setTimeout(() => { if (alive && game.phase === "loading") { shownLoading = true; renderRoundShell(`<p class="lead" id="gtr-loading">Loading the next posting…</p>`); } }, 200);
      let round = null;
      while (!round && alive) {
        const roleId = game.plan[game.i];
        let jobs = null;
        try { jobs = (await loadRole(roleId)).jobs; game.fails = 0; }
        catch (e) {
          game.fails++;
          if (game.fails >= 2) { clearTimeout(slow); return failScreen(e); }
        }
        if (!alive) return;
        if (jobs) {
          const posting = pickPosting(D.playable(roleId, jobs), game.companies, lastGame, game.rnd);
          if (posting) {
            const options = shuffle([roleId, ...D.distractors(roleId).ids], game.rnd);
            round = { field: field.id, role: roleId, job: posting.job, clues: posting.picked.clues, giveaway: posting.picked.giveaway, options, shown: 1, answer: null, right: false, points: 0 };
          }
        }
        if (!round) {   // no playable posting left, or the file failed: another role of the same field
          const other = pickRole(field, game.seenBefore, game.used, game.rnd);
          if (!other) { clearTimeout(slow); return failScreen(new Error(`No playable posting left in ${field.label}`)); }
          game.used.add(other); game.plan[game.i] = other;
        }
      }
      clearTimeout(slow);
      game.companies.add(round.job.company);
      game.rounds.push(round);
      game.phase = "clue";
      prefetch(game.plan[game.i + 1]);
      renderRound(round);
      if (shownLoading) say(`Round ${game.i + 1} of ${ROUNDS}.`);
      announceClue(round);
      focus(".clues");
      startTimer(round);
    }

    function pipsHtml() {
      return `<div class="pips" aria-label="Round ${game.i + 1} of ${ROUNDS}">${Array.from({ length: ROUNDS }, (_, k) => { const r = game.rounds[k]; const c = k === game.i && game.phase !== "reveal" ? "cur" : r && r.answer != null ? (r.right ? "ok" : "miss") : ""; return `<i class="${c}"></i>`; }).join("")}</div>`;
    }
    function headHtml() {
      return `<div class="gtr-head"><p class="eyebrow">Guess the role · round ${game.i + 1} of ${ROUNDS}</p><div class="gtr-score">${pipsHtml()}<span class="mono"><b>${fmt(game.score)}</b> points</span></div></div>`;
    }
    function renderRoundShell(inner) {
      crumbs([["Games", "#/"], [`Round ${game.i + 1} of ${ROUNDS}`, null]]);
      screen.innerHTML = `<div class="gtr-play">${headHtml()}${inner}</div>`;
      window.scrollTo(0, 0);
    }
    function boardHtml(round) {
      const n = round.shown;
      const list = round.clues.map((s, k) => k < n ? `<li class="${k === n - 1 ? "new" : ""}"><span class="n mono">${k + 1}</span><span class="nm">${esc(D.ix.skillById[s].name)}</span></li>` : `<li class="hid"><span class="n mono">${k + 1}</span><span class="nm">Clue ${k + 1}</span></li>`).join("");
      const ladder = Array.from({ length: CLUES }, (_, k) => `<li class="${k + 1 < n ? "gone" : k + 1 === n ? "now" : ""}"><span class="mono">${points(k + 1)}</span><span>after ${k + 1} clue${k ? "s" : ""}</span></li>`).join("");
      const tm = timer ? `<p class="small muted gtr-timer">Next clue in <b class="mono" id="gtr-count">${timer.left}</b> s · <button type="button" class="linkish small" id="gtr-timer-off">turn the timer off</button></p>` : "";
      return `<section class="clues" aria-label="The clues"><p class="small muted">One open posting asks for</p><ol class="cluelist">${list}</ol></section>
  <aside class="pts" aria-label="Points"><p class="small muted">Answer now for</p><p class="now-pts mono">${points(n)}</p><ol class="ladder-pts">${ladder}</ol>${tm}</aside>`;
    }
    function footHtml(round) {
      const n = round.shown;
      return n < CLUES ? `<button class="btn" type="button" id="gtr-next-clue">Next clue <kbd>Enter</kbd></button><span class="small muted">The next clue lowers this round to ${points(n + 1)}.</span>` : `<span class="small muted">That was the last clue. Press 1 to 4 to answer.</span>`;
    }
    function renderRound(round) {
      renderRoundShell(`<div class="gtr-board">${boardHtml(round)}</div>
 <p class="q" id="gtr-q">Which role is it?</p>
 <div class="gtr-choices" role="group" aria-labelledby="gtr-q">${round.options.map((r, k) => `<button class="gopt" type="button" data-opt="${k}" aria-keyshortcuts="${k + 1}"><kbd>${k + 1}</kbd><span class="t">${esc(D.M.roles[r].label)}</span><span class="m">${esc(D.fieldLabel[D.fieldOf[r]])}</span></button>`).join("")}</div>
 <div class="row gtr-foot">${footHtml(round)}</div>`);
      wireRound(round);
    }
    function wireRound(round) {
      screen.querySelectorAll("[data-opt]").forEach(b => b.onclick = () => answer(Number(b.dataset.opt)));
      const nx = screen.querySelector("#gtr-next-clue"); if (nx) nx.onclick = nextClue;
      const off = screen.querySelector("#gtr-timer-off"); if (off) off.onclick = () => { saved.timer = false; store.set(saved); stopTimer(); updateBoard(round); say("Gentle timer off."); };
    }
    function updateBoard(round) {
      const board = screen.querySelector(".gtr-board"), foot = screen.querySelector(".gtr-foot");
      if (!board) return;
      board.innerHTML = boardHtml(round); foot.innerHTML = footHtml(round);
      wireRound(round);
    }
    function announceClue(round, timedOut) {
      const n = round.shown, s = round.clues[n - 1];
      say(`${timedOut ? "Time. " : ""}Clue ${n} of ${CLUES}: ${D.ix.skillById[s].name}. ${n < CLUES ? `Answer now for ${points(n)} points.` : `Answer now for ${points(n)} points. That was the last clue.`}`);
    }
    function nextClue(timedOut) {
      if (!game || game.phase !== "clue") return;
      const round = game.rounds[game.i];
      if (round.shown >= CLUES) return;   // there is no clue 6: the player must answer
      round.shown++;
      updateBoard(round);
      announceClue(round, timedOut === true);
      startTimer(round);
    }
    // the optional gentle timer: when it runs out it shows the next clue, as if Enter were pressed; at clue 5 it stops
    function startTimer(round) {
      stopTimer();
      if (!saved.timer || round.shown >= CLUES) { const t = screen.querySelector(".gtr-timer"); if (t) t.remove(); return; }
      timer = { left: TIMER_S, id: setInterval(() => {
        if (!alive || !game || game.phase !== "clue") return stopTimer();
        timer.left--;
        const c = screen.querySelector("#gtr-count"); if (c) c.textContent = timer.left;
        if (timer.left <= 0) { stopTimer(); nextClue(true); }
      }, 1000) };
      const aside = screen.querySelector(".pts");
      if (aside && !aside.querySelector(".gtr-timer")) { aside.insertAdjacentHTML("beforeend", `<p class="small muted gtr-timer">Next clue in <b class="mono" id="gtr-count">${timer.left}</b> s · <button type="button" class="linkish small" id="gtr-timer-off">turn the timer off</button></p>`); wireRound(round); }
    }

    // ----- the answer and the reveal -----
    function answer(k) {
      if (!game || game.phase !== "clue") return;
      const round = game.rounds[game.i];
      if (k < 0 || k >= round.options.length) return;
      game.phase = "locked"; stopTimer();   // no further input until the reveal renders
      round.answer = round.options[k];
      round.right = round.answer === round.role;
      round.points = round.right ? points(round.shown) : 0;
      game.score += round.points;
      if (!saved.seen.includes(round.role)) { saved.seen.push(round.role); store.set(saved); }
      renderReveal(round);
      game.phase = "reveal";
      say(round.right ? `Right. Plus ${round.points} points. The posting was for ${D.M.roles[round.role].label}.` : `Not this one. 0 points. The posting was for ${D.M.roles[round.role].label}.`);
      focus(".gtr-role");
    }
    function renderReveal(round) {
      const r = round.role, meta = D.M.roles[r], label = meta.label, fieldId = D.fieldOf[r];
      const opts = round.options.map((o, k) => { const right = o === r, you = o === round.answer; const cls = `gopt${right ? " right" : ""}${you && right ? " you" : ""}${you && !right ? " wrong" : ""}`; const m = right ? "The answer" : you ? "Your answer" : D.fieldLabel[D.fieldOf[o]]; return `<div class="${cls}"><kbd>${k + 1}</kbd><span class="t">${esc(D.M.roles[o].label)}</span><span class="m">${esc(m)}</span></div>`; }).join("");
      const facts = round.clues.map((s, k) => { const sk = D.ix.skillById[s], sh = D.share(r, s), a = D.avg(s); return `<li class="${k < round.shown ? "seen" : ""}"><span class="n mono">${k + 1}</span><span class="nm">${esc(sk.name)}<span class="ar">${esc((D.M.clusters[sk.cluster] || {}).label || sk.cluster)}</span></span><span class="bar" aria-hidden="true"><i style="width:${Math.round(sh * 100)}%"></i><u style="left:${Math.round(a * 100)}%" title="average"></u></span><span class="v mono">${pct(sh)}</span><span class="avg mono">${pct(a)}</span></li>`; }).join("");
      const give = D.ix.skillById[round.giveaway];
      const close = D.closeCalls(r, round).map(c => { const dm = D.M.roles[c.id], picked = c.id === round.answer; return `<li class="${picked ? "picked" : ""}"><a class="t" href="#/role/${esc(c.id)}">${esc(dm.label)}</a><span class="m">${esc(D.fieldLabel[D.fieldOf[c.id]])} · <span class="num">${fmt(dm.n_open)}</span> open${picked ? " · your answer" : ""}</span><span class="d">${esc(D.ix.skillById[c.skill].name)}: <span class="num">${pct(c.dShare)}</span> of its postings, <span class="num">${pct(c.rShare)}</span> of ${esc(label)} ones. ${esc(give.name)}: <span class="num">${pct(c.gShare)}</span>.</span></li>`; }).join("");
      const verdict = round.right ? `<div class="verdict-box ok"><span class="big mono">+${round.points}</span><span>Right, at clue ${round.shown}.</span></div>` : `<div class="verdict-box miss"><span class="big mono">0</span><span>You answered ${esc(D.M.roles[round.answer].label)} at clue ${round.shown}.</span></div>`;
      renderRoundShell(`<div class="gtr-choices small4">${opts}</div>
 <div class="gtr-reveal">
  <section>
   <p class="eyebrow">The posting was for</p>
   <h1 class="gtr-role">${esc(label)}</h1>
   <p class="facts"><a href="#/field/${esc(fieldId)}">${esc(D.fieldLabel[fieldId])}</a> · <span class="num">${fmt(meta.n_open)}</span> open postings at <span class="num">${fmt(meta.n_companies)}</span> employers</p>
   ${meta.small ? `<p class="small muted">Based on ${fmt(meta.n)} postings</p>` : ""}
   <p class="small muted src">This one: ${esc(decodeEntities(round.job.company))}, ${esc(decodeEntities(round.job.title))}</p>
   <div class="fact-head small muted"><span>The five clues</span><span>${esc(label)} postings</span><span style="text-align:right">All ${D.nAll}</span></div>
   <ol class="factlist">${facts}</ol>
   <p class="punch">${pct(D.share(r, round.giveaway))} of ${esc(label)} postings ask for ${esc(lower(give.name))}. On average, ${pct(D.avg(round.giveaway))} of postings across the ${D.nAll} roles do.</p>
  </section>
  <aside>
   ${verdict}
   <p class="sm-h">Close calls</p>
   <ul class="close">${close}</ul>
   <div class="row gtr-next"><a class="btn" href="#/role/${esc(r)}">Open this role →</a><button class="btn primary" type="button" id="gtr-next-round">${game.i + 1 < ROUNDS ? "Next round" : "See your result"} <kbd class="on-primary">Enter</kbd></button></div>
  </aside>
 </div>`);
      screen.querySelector("#gtr-next-round").onclick = nextRound;
    }

    // ----- the end -----
    function endGame() {
      game.phase = "end";
      const today = new Date(), date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const prevBest = saved.best.length ? Math.max(...saved.best.map(b => b.score)) : null;
      const entry = { score: game.score, rank: rank(game.score), date, data: D.M.meta.generated };
      saved.best = [...saved.best, entry].sort((a, b) => b.score - a.score || (a === entry ? -1 : 1)).slice(0, 5);
      saved.plays = (saved.plays || 0) + 1;
      for (const r of game.rounds) if (!saved.seen.includes(r.role)) saved.seen.push(r.role);
      store.set(saved);
      renderEnd(entry, prevBest != null && game.score > prevBest);
      say(`Ten rounds done. ${entry.rank}: ${fmt(game.score)} of ${fmt(MAX)} points.`);
      focus(".gtr-rank");
    }
    function renderEnd(entry, isNewBest) {
      crumbs([["Games", "#/"], ["Result", null]]);
      const nx = nextRank(game.score);
      const read = game.rounds.reduce((a, r) => a + r.shown, 0);
      const rows = game.rounds.map((r, k) => `<tr class="${r.right ? "" : "miss"}"><td class="mono rn">${k + 1}</td><td><a href="#/role/${esc(r.role)}">${esc(D.M.roles[r.role].label)}</a><span class="m">${esc(D.fieldLabel[r.field])}</span></td><td class="post">${esc(decodeEntities(r.job.company))}</td><td class="r mono">${r.shown}</td><td class="r mono rp">${r.right ? "+" + r.points : "0"}</td></tr>`).join("");
      const first = game.rounds.map(r => r.role).filter(r => !game.seenBefore.has(r));
      const fmtDate = d => d === entry.date ? "Today" : new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const best = saved.best.map(b => `<li class="${b === entry ? "today" : ""}"><span class="mono">${fmt(b.score)}</span><span>${esc(b.rank)}</span><span class="subtle">${esc(fmtDate(b.date))}</span></li>`).join("");
      screen.innerHTML = `<div class="gtr-end">
 <section>
  <p class="eyebrow">Ten rounds done</p>
  <h1 class="gtr-rank">${esc(entry.rank)}</h1>
  <p class="facts"><b class="you">${fmt(game.score)}</b> of ${fmt(MAX)} points${isNewBest ? " · new personal best" : ""}${nx ? ` · ${esc(nx[1])} starts at ${fmt(nx[0])}` : " · the top title"}</p>
  <table class="rounds"><thead><tr><th><span class="sr-only">Round</span></th><th>Role</th><th>Posting</th><th class="r">Clues</th><th class="r">Points</th></tr></thead><tbody>${rows}</tbody></table>
 </section>
 <aside>
  <div class="point">
   <p>You read <b class="you mono">${read}</b> skills from ${ROUNDS} postings.</p>
   <p>The atlas reads every skill of all <span class="num">${fmt(D.nOpen)}</span> open postings for these ${D.nRoles} roles, every week.</p>
   <p class="kick">Nobody reads that by hand. That's the point.</p>
  </div>
  <p class="sm-h">Roles you met for the first time</p>
  ${first.length ? `<div class="tags">${first.map(r => `<a class="tag" href="#/role/${esc(r)}">${esc(D.M.roles[r].label)} <span class="num mono">${fmt(D.M.roles[r].n_open)}</span></a>`).join("")}</div>` : `<p class="small muted">None this time. You had met all ten before.</p>`}
  <p class="sm-h">Your best games</p>
  <ol class="best">${best}</ol>
  <div class="row gtr-next"><button class="btn primary" type="button" id="gtr-again">Play again <kbd class="on-primary">Enter</kbd></button><a class="btn" href="#/explore">Explore the fields</a></div>
 </aside>
</div>`;
      window.scrollTo(0, 0);
      screen.querySelector("#gtr-again").onclick = startGame;
    }

    // the app's "Something did not load" message, with a way back
    function failScreen(e) {
      console.error(e);
      if (!alive) return;
      stopTimer(); if (game) game.phase = "failed";
      crumbs([["Games", "#/"], ["Guess the role", null]]);
      screen.innerHTML = `<div class="gtr-fail"><h1>Something did not load</h1><p class="lead">${esc(e && e.message || e)}. Reload the page; if it happens again, the data files may be missing.</p><div class="row" style="margin-top:16px"><a class="btn" href="#/">← All games</a></div></div>`;
    }

    return leave;
  }

  return { mount, rules };
});
