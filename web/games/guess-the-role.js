/* Guess the role (#/play/guess-the-role): skills from one real, open posting, one at a time; name the role.
   Spec: games/guess-the-role/README.md; v12 (PLAN.md, GTR1): five rounds, three clues, the first already distinctive,
   a second guess for half the points, the player's own fields first. Data: the MBA index (Atlas.index()) and one role file per round, loaded lazily.
   The data rules (pool, sampling, distractors, clues, scoring) are pure functions in `rules`, loaded in node by
   evals/games_guess_the_role.mjs with the same UMD pattern as atlas.js; the screens follow below them.
   Drawn in the shared shell (web/gameshell.js): one header, 1 to 4 answer, Enter goes on, Esc quits, one record.
   Colours keep their meaning: green = you (right, chosen), blue = the postings' numbers, amber = attention or wrong;
   skill areas are text. Desktop only. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();   // node: require("web/games/guess-the-role.js")
  else { root.Games = root.Games || {}; root.Games["guess-the-role"] = { mount: factory().mount }; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const SLUG = "guess-the-role", TITLE = "Guess the role", ROUNDS = 5, CLUES = 3, GUESSES = 2, MAX = ROUNDS * CLUES * 100;
  const CAP = 0.90, FLOOR = 0.005, LIFT_FLOOR = 0.01, MIN_SKILLS = 8, RED_HERRING = [-Math.log(1.5), -Math.log(2)], CLOSE_LIFT = 1.5;
  const TIMER_S = 20;

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  // titles carry HTML entities in the data (&amp;): decode, then escape
  const decodeEntities = s => String(s ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(parseInt(e[1] === "x" || e[1] === "X" ? e.slice(2) : e.slice(1), e[1] === "x" || e[1] === "X" ? 16 : 10)) : (ENT[e.toLowerCase()] ?? m));
  const fmt = n => Number(n).toLocaleString("en-US");
  const ord = n => ["first", "second", "third", "fourth"][n - 1] || `${n}th`;
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

    // a posting's typical skills (asked by a quarter of the role's postings or more) with their numbers, and the
    // giveaway: the typical skill the distractors ask for least, relative to the role
    function typicalOf(r, job) {
      const D = distractors(r).ids;
      const skills = [...new Set(eligibleOf(job))];
      if (skills.length < MIN_SKILLS) return null;
      const typical = skills.filter(s => share(r, s) >= shareMin).map(s => ({ id: s, share: share(r, s), disc: disc(r, D, s), lift: lift(r, s) }));
      const give = typical.filter(t => t.disc > 0).sort((a, b) => b.disc - a.disc || b.share - a.share || byId(a, b))[0];
      return give ? { typical, give } : null;
    }
    // the clue candidates at a pass of the red-herring rule: the typical skills but the giveaway, least distinctive first
    const candidates = (typical, give, pass) => typical.filter(t => t.id !== give.id && t.disc >= RED_HERRING[pass]).sort((a, b) => a.lift - b.lift || byId(a, b));
    // the three clues of a posting: the first from the more distinctive half of the candidates (never the skill every
    // role asks for), the second the most distinctive but the giveaway, the giveaway last; null when not playable
    function clues(r, job) {
      const t = typicalOf(r, job); if (!t) return null;
      for (let pass = 0; pass < RED_HERRING.length; pass++) {
        const rest = candidates(t.typical, t.give, pass);
        if (rest.length < CLUES - 1) continue;
        const n = rest.length, first = Math.min(Math.floor(n / 2), n - 2);
        return { clues: [rest[first].id, rest[n - 1].id, t.give.id], giveaway: t.give.id, relaxed: pass > 0 };
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
    return { ix, M, fields, roles, fieldOf, fieldLabel, eligible, share, avg, lift, disc, similarity, distractors, skillsOf, eligibleOf, typicalOf, candidates, clues, playable, closeCalls, isOpen, nOpen, nRoles: roles.length, nAll: Object.keys(M.families).length };
  }

  const points = (shown, guess = 1) => Math.max(0, (CLUES + 1 - shown) * 100) / (guess > 1 ? 2 : 1);   // 300 after 1 clue … 100 after 3; a second guess, half

  // the fields of a game: the player's own first (store "you", fields[]), then the rest in a random order; five in all
  function pickFields(fields, yours, rnd) {
    const mine = (yours || []).map(id => fields.find(f => f.id === id)).filter(Boolean);
    const rest = shuffle(fields.filter(f => !mine.includes(f)), rnd);
    return [...mine, ...rest].slice(0, ROUNDS);
  }

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

  const rules = { prepare, points, pickFields, pickRole, pickPosting, rng, shuffle, decodeEntities, CAP, FLOOR, MIN_SKILLS, RED_HERRING, ROUNDS, CLUES, GUESSES, MAX };

  // ---------- the screens ----------
  async function mount(el, ctx) {
    const { Atlas } = ctx, GS = window.GameShell;
    const saved = Object.assign({ best: null, seen: [], speed: false, lastScore: null, plays: 0 }, GS.record.game(SLUG));
    let alive = true, timer = null, game = null, lastGame = new Set();   // lastGame: company + title of the previous game's postings
    const INFO = GS.info({ rules: "Skills from one real, open job posting appear one at a time, the giveaway last. Name the role it is for from four. The fewer clues you take, the more points the round keeps: 300 after one clue, 100 less per clue. A wrong answer leaves you one more guess for half the points. Five rounds, one from each of five fields, your own fields first.", keys: "Keys: 1 to 4 answer, Enter shows the next clue or goes on, Esc quits.", source: "Drawn from the open postings of 48 roles; the shares are the fraction of a role's postings that ask for a skill." });
    const F = GS.frame(el, { game: TITLE, cls: "gtr", info: INFO });
    const screen = F.body;
    const say = text => F.live(text);
    const focus = sel => { const n = screen.querySelector(sel); if (n) { n.setAttribute("tabindex", "-1"); n.focus({ preventScroll: true }); } };
    const stopTimer = () => { if (timer) { clearInterval(timer.id); timer = null; } };
    const leave = () => { alive = false; stopTimer(); offKeys(); window.removeEventListener("hashchange", leave); };
    window.addEventListener("hashchange", leave);
    const offKeys = GS.keys({
      choose(n) { if (game && game.phase === "clue") { answer(n - 1); return true; } return false; },
      confirm() { enter(); },
    });

    let D = null;
    try {
      const [ix, generic] = await Promise.all([Atlas.index(), Atlas.genericSkills()]);
      D = prepare(ix, generic, Atlas.TIER.common);
    } catch (e) { return failScreen(e); }
    if (!alive) return;
    renderStart();

    function enter() {
      const phase = game ? game.phase : "start";
      if (phase === "start" || phase === "end") startGame();
      else if (phase === "clue") nextClue();
      else if (phase === "reveal") nextRound();
    }
    const marks = () => game.rounds.map(r => r.answer == null ? "" : r.right ? "ok" : "miss");

    // ----- start: one sentence and Play; the Speed round on offer once unlocked -----
    function renderStart() {
      if (game) game.phase = "start";
      const unlocked = !!saved.clean;
      const extra = `${unlocked ? `<div class="chips" role="group" aria-label="Round"><button class="chip${saved.speed ? "" : " on"}" type="button" id="gtr-untimed" aria-pressed="${!saved.speed}">Untimed</button><button class="chip${saved.speed ? " on" : ""}" type="button" id="gtr-speed" aria-pressed="${saved.speed}">Speed round<span class="n">${TIMER_S} s a clue</span></button></div>` : ""}
 ${saved.best != null ? `<p class="gm-best">Your best: <b>${fmt(saved.best)}</b> of ${fmt(MAX)} points</p>` : ""}`;
      GS.start(F, { title: "Guess the role", lead: "Name a real posting's role from its skills, giveaway last. Five rounds, your fields first.", play: startGame, extra });
      const sp = screen.querySelector("#gtr-speed"), un = screen.querySelector("#gtr-untimed");
      if (sp) { sp.onclick = () => { saved.speed = true; GS.record.saveGame(SLUG, { speed: true }); renderStart(); say(`Speed round: ${TIMER_S} seconds a clue, then the next clue appears.`); }; un.onclick = () => { saved.speed = false; GS.record.saveGame(SLUG, { speed: false }); renderStart(); say("Untimed."); }; }
    }

    // ----- a game -----
    function startGame() {
      if (game && game.phase === "end") lastGame = new Set(game.rounds.map(r => r.job.company + "\n" + r.job.title));
      const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0, rnd = rng(seed);
      const seen = new Set(saved.seen), used = new Set();
      let you = null; try { you = JSON.parse(localStorage.getItem("you")); } catch { }
      const fields = pickFields(D.fields, you && you.fields, rnd);
      const plan = fields.map(f => { const r = pickRole(f, seen, used, rnd); used.add(r); return r; });
      game = { seed, rnd, fields, plan, used, seenBefore: seen, rounds: [], i: -1, score: 0, companies: new Set(), fails: 0, phase: "loading", timed: !!(saved.clean && saved.speed) };
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
            round = { field: field.id, role: roleId, job: posting.job, clues: posting.picked.clues, giveaway: posting.picked.giveaway, options, shown: 1, guess: 1, wrong: [], answer: null, right: false, points: 0 };
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
      if (game.i === 0) GS.coachOnce(SLUG, screen.querySelector(".gtr-play"), "One posting's skills, one at a time. Each clue you take lowers the round by 100 points; a wrong guess halves what is left. Press 1 to 4 to name the role.");
      if (shownLoading) say(`Round ${game.i + 1} of ${ROUNDS}.`);
      announceClue(round);
      focus(".clues");
      startTimer(round);
    }

    function renderRoundShell(inner) {
      F.set({ round: game.i, rounds: ROUNDS, marks: marks(), role: `${fmt(game.score)} points` });
      screen.innerHTML = `<div class="gtr-play">${inner}</div>`;
      window.scrollTo(0, 0);
    }
    function boardHtml(round) {
      const n = round.shown;
      const list = round.clues.map((s, k) => k < n ? `<li class="${k === n - 1 ? "new" : ""}"><span class="n mono">${k + 1}</span><span class="nm">${esc(D.ix.skillById[s].name)}</span></li>` : `<li class="hid"><span class="n mono">${k + 1}</span><span class="nm">Clue ${k + 1}</span></li>`).join("");
      const ladder = Array.from({ length: CLUES }, (_, k) => `<li class="${k + 1 < n ? "gone" : k + 1 === n ? "now" : ""}"><span class="mono">${points(k + 1, round.guess)}</span><span>after ${k + 1} clue${k ? "s" : ""}</span></li>`).join("");
      const tm = timer ? `<p class="small muted gtr-timer">Next clue in <b class="mono" id="gtr-count">${timer.left}</b> s</p>` : "";
      return `<section class="clues" aria-label="The clues"><p class="small muted">One open posting asks for</p><ol class="cluelist">${list}</ol></section>
  <aside class="pts" aria-label="Points"><p class="small muted">${round.guess > 1 ? "Second guess, half the points: " : "Answer now for"}</p><p class="now-pts mono">${points(n, round.guess)}</p><ol class="ladder-pts">${ladder}</ol><p class="small muted">${round.guess > 1 ? "One guess left." : "A wrong guess halves what is left."}</p>${tm}</aside>`;
    }
    function footHtml(round) {
      const n = round.shown;
      return n < CLUES ? GS.foot({ primary: { id: "gtr-next-clue", label: "Next clue", key: "Enter" } }) : `<p class="gm-key">That was the last clue. Answer with 1 to 4.</p>`;
    }
    function renderRound(round) {
      renderRoundShell(`<div class="gtr-board">${boardHtml(round)}</div>
 <p class="q" id="gtr-q">Which role is it?</p>
 <div class="gtr-choices" role="group" aria-labelledby="gtr-q">${round.options.map((r, k) => { const no = round.wrong.includes(r); return `<button class="gopt${no ? " wrong" : ""}" type="button" data-opt="${k}" aria-keyshortcuts="${k + 1}"${no ? " disabled" : ""}><kbd>${k + 1}</kbd><span class="t">${esc(D.M.roles[r].label)}</span><span class="m">${no ? "Not this one" : esc(D.fieldLabel[D.fieldOf[r]])}</span></button>`; }).join("")}</div>
 <div class="gtr-foot">${footHtml(round)}</div>`);
      wireRound(round);
    }
    function wireRound(round) {
      screen.querySelectorAll("[data-opt]").forEach(b => b.onclick = () => answer(Number(b.dataset.opt)));
      const nx = screen.querySelector("#gtr-next-clue"); if (nx) nx.onclick = nextClue;
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
      if (round.shown >= CLUES) return;   // there is no clue 4: the player must answer
      round.shown++;
      updateBoard(round);
      announceClue(round, timedOut === true);
      startTimer(round);
    }
    // the Speed round's clock (G7): when it runs out it shows the next clue, as if Enter were pressed; at clue 5 it stops
    function startTimer(round) {
      stopTimer();
      if (!game.timed || round.shown >= CLUES) { const t = screen.querySelector(".gtr-timer"); if (t) t.remove(); return; }
      timer = { left: TIMER_S, id: setInterval(() => {
        if (!alive || !game || game.phase !== "clue") return stopTimer();
        timer.left--;
        const c = screen.querySelector("#gtr-count"); if (c) c.textContent = timer.left;
        if (timer.left <= 0) { stopTimer(); nextClue(true); }
      }, 1000) };
      const aside = screen.querySelector(".pts");
      if (aside && !aside.querySelector(".gtr-timer")) aside.insertAdjacentHTML("beforeend", `<p class="small muted gtr-timer">Next clue in <b class="mono" id="gtr-count">${timer.left}</b> s</p>`);
    }

    // ----- the answer and the reveal -----
    function answer(k) {
      if (!game || game.phase !== "clue") return;
      const round = game.rounds[game.i];
      if (k < 0 || k >= round.options.length || round.wrong.includes(round.options[k])) return;
      const pick = round.options[k];
      // a first wrong guess: the option is struck, one more guess for half the points, the clock goes on
      if (pick !== round.role && round.guess < GUESSES) {
        round.wrong.push(pick); round.guess++;
        const choices = screen.querySelector(".gtr-choices"); if (choices) choices.outerHTML = `<div class="gtr-choices" role="group" aria-labelledby="gtr-q">${round.options.map((r, j) => { const no = round.wrong.includes(r); return `<button class="gopt${no ? " wrong" : ""}" type="button" data-opt="${j}" aria-keyshortcuts="${j + 1}"${no ? " disabled" : ""}><kbd>${j + 1}</kbd><span class="t">${esc(D.M.roles[r].label)}</span><span class="m">${no ? "Not this one" : esc(D.fieldLabel[D.fieldOf[r]])}</span></button>`; }).join("")}</div>`;
        updateBoard(round);
        say(`Not ${D.M.roles[pick].label}. One more guess, for ${points(round.shown, round.guess)} points.`);
        return;
      }
      game.phase = "locked"; stopTimer();   // no further input until the reveal renders
      round.answer = pick;
      round.right = round.answer === round.role;
      if (!round.right) round.wrong.push(pick);
      round.points = round.right ? points(round.shown, round.guess) : 0;
      game.score += round.points;
      if (!saved.seen.includes(round.role)) { saved.seen.push(round.role); GS.record.saveGame(SLUG, { seen: saved.seen }); }
      GS.record.saveRole(round.role, { label: D.M.roles[round.role].label, met: round.clues.slice(0, round.shown), known: round.right ? round.clues.slice(0, round.shown) : [], postings: [String(round.job.id || round.job.url || round.job.company + "|" + round.job.title)] });
      renderReveal(round);
      game.phase = "reveal";
      say(round.right ? `Right${round.guess > 1 ? ", on the second guess" : ""}. Plus ${round.points} points. The posting was for ${D.M.roles[round.role].label}.` : `Not this one either. 0 points. The posting was for ${D.M.roles[round.role].label}.`);
      focus(".gm-measure");
    }
    // the reveal (GTR2): the giveaway as the takeaway, one bar against the all-roles average, the posting as a link,
    // "Why not <your guesses>?" and the three clues behind a disclosure
    function renderReveal(round) {
      const r = round.role, meta = D.M.roles[r], label = meta.label, fieldId = D.fieldOf[r];
      const opts = round.options.map((o, k) => { const right = o === r, you = round.wrong.includes(o); const cls = `gopt${right ? " right" : ""}${right && round.right ? " you" : ""}${you ? " wrong" : ""}`; const m = right ? (round.right ? `The answer${round.guess > 1 ? " · your second guess" : " · your answer"}` : "The answer") : you ? `Your ${round.wrong.length > 1 ? ord(round.wrong.indexOf(o) + 1) + " " : ""}guess` : D.fieldLabel[D.fieldOf[o]]; return `<div class="${cls}"><kbd>${k + 1}</kbd><span class="t">${esc(D.M.roles[o].label)}</span><span class="m">${esc(m)}</span></div>`; }).join("");
      const facts = round.clues.map((s, k) => { const sk = D.ix.skillById[s], sh = D.share(r, s), a = D.avg(s); return `<li class="${k < round.shown ? "seen" : ""}"><span class="n mono">${k + 1}</span><span class="nm">${esc(sk.name)}<span class="ar">${esc((D.M.clusters[sk.cluster] || {}).label || sk.cluster)}</span></span><span class="bar" aria-hidden="true"><i style="width:${Math.round(sh * 100)}%"></i><u style="left:${Math.round(a * 100)}%" title="average"></u></span><span class="v mono">${pct(sh)}</span><span class="avg mono">${pct(a)}</span></li>`; }).join("");
      const give = D.ix.skillById[round.giveaway], gShare = D.share(r, round.giveaway), gAvg = D.avg(round.giveaway);
      const close = D.closeCalls(r, round).map(c => { const dm = D.M.roles[c.id], picked = round.wrong.includes(c.id); return `<li class="${picked ? "picked" : ""}"><a class="t" href="#/role/${esc(c.id)}">${esc(dm.label)}</a><span class="m">${esc(D.fieldLabel[D.fieldOf[c.id]])} · <span class="num">${fmt(dm.n_open)}</span> open${picked ? " · your answer" : ""}</span><span class="d">${esc(D.ix.skillById[c.skill].name)}: <span class="num">${pct(c.dShare)}</span> of its postings, <span class="num">${pct(c.rShare)}</span> of ${esc(label)} ones. ${esc(give.name)}: <span class="num">${pct(c.gShare)}</span>.</span></li>`; }).join("");
      const names = round.wrong.map(w => esc(D.M.roles[w].label));
      const verdict = round.right ? `<div class="verdict-box ok"><span class="big mono">+${round.points}</span><span>Right, at clue ${round.shown}${round.guess > 1 ? `, on the second guess (not ${names[0]})` : ""}.</span></div>` : `<div class="verdict-box miss"><span class="big mono">0</span><span>You answered ${names.join(", then ")} at clue ${round.shown}.</span></div>`;
      const in100 = v => v < 0.005 ? "fewer than 1 in 100" : `${Math.round(v * 100)} in 100`;
      renderRoundShell(`<div class="gtr-choices small4">${opts}</div>
 ${verdict}
 <div class="gm-result">
  <p class="eyebrow">The posting was for <a href="#/role/${esc(r)}">${esc(label)}</a> · ${esc(D.fieldLabel[fieldId])}</p>
  <p class="gm-measure">${esc(give.name)} gave it away</p>
  <p class="gm-take">${in100(gShare)} ${esc(label)} postings ask for ${esc(lower(give.name))}. Across all ${D.nAll} roles: ${in100(gAvg)}.</p>
  <div class="gm-visual gtr-give"><span class="bar" data-measure="${pct(gShare)} of ${esc(label)} postings ask for ${esc(give.name)}; the mark is the average over all ${D.nAll} roles, ${pct(gAvg)}."><i style="width:${Math.round(gShare * 100)}%"></i><u style="left:${Math.round(gAvg * 100)}%"></u></span><span class="gm-key">${esc(label)} <b class="num">${pct(gShare)}</b> · all roles <b class="num">${pct(gAvg)}</b></span></div>
  <p class="gm-link"><a href="${esc(round.job.url || "#/role/" + r)}"${round.job.url ? ' target="_blank" rel="noopener"' : ""}>${esc(decodeEntities(round.job.company))}, ${esc(decodeEntities(round.job.title))}${round.job.url ? " ↗" : ""}</a></p>
  <details class="disc gm-why"><summary>${names.length ? `Why not ${names.join(" or ")}?` : "Why"}</summary><div class="disc-body">
   <p class="sm-h">Close calls</p><ul class="close">${close}</ul>
   <div class="fact-head small muted"><span>The three clues</span><span>${esc(label)} postings</span><span style="text-align:right">All ${D.nAll}</span></div>
   <ol class="factlist">${facts}</ol></div></details>
 </div>
 ${GS.foot({ primary: { id: "gtr-next-round", label: game.i + 1 < ROUNDS ? "Next round" : "See your result", key: "Enter" }, quiet: { href: `#/role/${esc(r)}`, label: "Open this role" } })}`);
      F.set({ marks: marks(), role: `${fmt(game.score)} points` });
      screen.querySelector("#gtr-next-round").onclick = nextRound;
    }

    // ----- the end: the measure in plain words, the change since last time, the rounds -----
    function endGame() {
      game.phase = "end";
      const right = game.rounds.filter(r => r.right).length, prevBest = saved.best, prevLast = saved.lastScore, wasClean = !!saved.clean;
      const isNewBest = prevBest == null || game.score > prevBest;
      for (const r of game.rounds) if (!saved.seen.includes(r.role)) saved.seen.push(r.role);
      saved.best = isNewBest ? game.score : prevBest;
      if (!game.timed && right * 2 >= ROUNDS) saved.clean = true;   // a clean untimed game unlocks the Speed round
      saved.plays = (saved.plays || 0) + 1;
      GS.record.saveGame(SLUG, { played: true, best: saved.best, seen: saved.seen, lastScore: game.score, clean: !!saved.clean });
      saved.lastScore = game.score;
      renderEnd(right, prevBest, prevLast, isNewBest, !wasClean && saved.clean);
      say(`Five rounds done. ${right} of ${ROUNDS} right, ${fmt(game.score)} of ${fmt(MAX)} points.`);
      F.focusMeasure();
    }
    function renderEnd(right, prevBest, prevLast, isNewBest, unlockedNow) {
      const read = game.rounds.reduce((a, r) => a + r.shown, 0);
      const rows = game.rounds.map((r, k) => `<tr class="${r.right ? "" : "miss"}"><td class="mono rn">${k + 1}</td><td><a href="#/role/${esc(r.role)}">${esc(D.M.roles[r.role].label)}</a><span class="m">${esc(D.fieldLabel[r.field])}</span></td><td class="post">${esc(decodeEntities(r.job.company))}</td><td class="r mono">${r.shown}</td><td class="r mono rp">${r.right ? "+" + r.points : "0"}</td></tr>`).join("");
      const first = game.rounds.map(r => r.role).filter(r => !game.seenBefore.has(r));
      const change = prevLast == null ? "Your first game." : game.score > prevLast ? `Up from ${fmt(prevLast)} last time.` : game.score < prevLast ? `Down from ${fmt(prevLast)} last time.` : "The same as last time.";
      const known = game.rounds.filter(r => r.right).reduce((a, r) => a + r.shown, 0), readRoles = new Set(game.rounds.map(r => r.role)).size;
      const rec = `You read ${readRoles} ${readRoles === 1 ? "role's" : "roles'"} postings and now know <b>${known}</b> more of the things their postings ask for. ${change}${isNewBest && prevBest != null ? " A new best." : prevBest != null ? ` Your best: <b>${fmt(prevBest)}</b>.` : ""}${game.timed ? " A Speed round." : unlockedNow ? " The Speed round is unlocked." : ""}`;
      screen.innerHTML = GS.results({
        eyebrow: "Five rounds done",
        measure: `${right} of ${ROUNDS} right · ${fmt(game.score)} of ${fmt(MAX)} points`,
        record: rec,
        takeaway: `You read <b>${read}</b> skills from ${ROUNDS} postings. The atlas reads every skill of all <b>${fmt(D.nOpen)}</b> open postings for these ${D.nRoles} roles, every week. Nobody reads that by hand.`,
        visual: `<table class="rounds"><thead><tr><th><span class="sr-only">Round</span></th><th>Role</th><th>Posting</th><th class="r">Clues</th><th class="r">Points</th></tr></thead><tbody>${rows}</tbody></table>
  ${first.length ? `<p class="sm-h">Roles you met for the first time</p><div class="tags">${first.map(r => `<a class="tag" href="#/role/${esc(r)}">${esc(D.M.roles[r].label)} <span class="num mono">${fmt(D.M.roles[r].n_open)}</span></a>`).join("")}</div>` : ""}`,
        link: { href: "#/explore", label: "Explore the fields" },
        foot: GS.foot({ primary: { id: "gtr-again", label: "Play again", key: "Enter" } }),
      });
      F.set({ round: ROUNDS, rounds: ROUNDS, marks: marks(), role: `${fmt(game.score)} points` });
      window.scrollTo(0, 0);
      screen.querySelector("#gtr-again").onclick = startGame;
    }

    // the app's "Something did not load" message, with a way back
    function failScreen(e) {
      console.error(e);
      if (!alive) return;
      stopTimer(); if (game) game.phase = "failed";
      screen.innerHTML = `<div class="gtr-fail"><h1>Something did not load</h1><p class="lead">${esc(e && e.message || e)}. Reload the page; if it happens again, the data files may be missing.</p>${GS.foot({ primary: { href: "#/", label: "All games" } })}</div>`;
    }

    return leave;
  }

  return { mount, rules };
});
