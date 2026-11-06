/* Know the role (#/play/know-the-role): what a role's postings ask for, as one picture. Merges Higher or lower, What does
   it ask for and Build the hire (PLAN.md, "The games, second pass (v12)", decision 1; design: games/know-the-role/README.md).
   Three rounds on one role: a board of twelve skills ("Pick the five that most <role> postings ask for"; the seven
   others are decoys other roles prize), eight over-or-under calls against the role's top ask ("Do more or fewer than
   half of <role> postings ask for it?"), a second board; "the same skill across fields" can stand in for the second
   round. Every reveal is the role's ranked list with the player's calls on it. Untimed; a Speed round (a clock on each
   board and call) unlocks after a clean untimed game.
   UMD like atlas.js: `logic` (the pools, the deals, the scoring; pure, no DOM) loads in node for
   evals/game_know_the_role.mjs and tests/web/know-the-role.test.mjs; `mount` draws the screens in the shared shell
   (web/gameshell.js: one header, 1 = more, 2 = fewer, Enter hands in or goes on, Esc quits, one record). */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  else { root.Games = root.Games || {}; root.Games["know-the-role"] = { mount: mod.mount }; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const SLUG = "know-the-role", TITLE = "Know the role";
  // the pools, as What does it ask for drew them (games/what-it-asks/pools.js): a real ask is named by at least 40% of
  // the role's postings; a decoy is a skill at most 10% (15% when the pool is thin) name that some other role prizes
  // (at least 40% of its postings, twice the average role)
  const RULE = { ask: 0.40, filler: 0.10, fillerWide: 0.15, minFiller: 14, elsewhere: 0.40, lift: 2, minAsks: 3 };
  const BOARD = 12, PICK = 5, CALLS = 8, HALF = 0.5, CALL_MIN = 0.10, ROUNDS = 3;
  // the ramp inside a game (G5): the first board's decoys are from another world and the first calls are far from
  // half; later rounds use decoys from nearer roles and calls nearer half
  const STAGES = [{ diff: 0, gap: 0.20, say: "" }, { diff: 1, gap: 0.12, say: "Closer calls from here." }, { diff: 2, gap: 0.08, say: "Decoys from nearby roles from here." }];
  const SPEED = { board: 45, call: 6 };   // seconds, the Speed round only

  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = v => Math.round(v * 100) + "%";
  const fmt = n => Number(n).toLocaleString("en-US");
  const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const words = n => WORDS[n] || String(n);
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const shuffle = (a, rnd) => { const out = a.slice(); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };

  // ---------- logic: pure, loads in node ----------
  // the pools for every role. ix = Atlas.index() with the product set in ix.roles (P = Atlas.product()); generic = the
  // skills every role asks for (Atlas.genericSkills()). pools[roleId] = { id, label, set, group, n, nOpen, small,
  // asks: [{ id, name, share, generic }] most asked first, decoys: [{ id, name, share, where, whereLabel, whereShare,
  // lift, sameField, diff }], calls: [{ id, name, share }] every skill at least CALL_MIN name, most asked first }
  function pools(ix, P, generic) {
    const M = ix.M, G = P ? P.G : null;
    const skip = s => s.cluster === "credentials" || String(s.id).startsWith("yoe_");
    const mbaElsewhere = (sid, self) => Object.entries((ix.skillById[sid] || {}).by_family || {}).filter(([f]) => f !== self && ix.roles[f] && ix.roles[f].set === "mba" && !ix.roles[f].small);
    // the tech set (CONFIG.TECH_ENABLED): its skills are in its own index, its role ids are tech.<family>
    const techElsewhere = (sid, self) => Object.entries(((ix.techSkillById || {})[sid] || {}).by_family || {}).map(([f, v]) => ["tech." + f, v]).filter(([f]) => f !== self && ix.roles[f] && !ix.roles[f].small);
    const out = {};
    for (const r of Object.values(ix.roles)) {
      if (r.set === "product" && !G) continue;
      if (r.set === "tech" && !ix.T) continue;
      const skills = (r.set === "mba" ? M.skills : r.set === "tech" ? ix.T.skills : G.skills).filter(s => !skip(s));
      const share = s => (s.by_family || {})[r.family] || 0;
      // a decoy's other role: the role set's own roles, then the MBA roles (a tech skill shared with the MBA set is
      // prized by business roles too: financial modeling for a software engineer)
      const elsewhere = s => r.set === "mba" ? mbaElsewhere(s.id, r.id) : r.set === "tech" ? [...techElsewhere(s.id, r.id), ...mbaElsewhere(s.id, r.id)] : [...Object.entries(s.by_family || {}).filter(([f]) => f !== r.family).map(([f, v]) => ["product." + f, v]).filter(([f]) => ix.roles[f]), ...mbaElsewhere(s.id, r.id)];
      const baseline = r.set === "tech" ? (ix.baselineTech || {}) : ix.baseline;
      const asks = skills.filter(s => share(s) >= RULE.ask).map(s => ({ id: s.id, name: s.name, share: share(s), generic: !!(generic && generic.has(s.id)) })).sort((a, b) => b.share - a.share);
      const decoysAt = max => skills.filter(s => share(s) <= max).map(s => {
        const [top] = elsewhere(s).sort((a, b) => b[1] - a[1]); const base = baseline[s.id] || 0;
        if (!top || top[1] < RULE.elsewhere || (base && top[1] / base < RULE.lift)) return null;
        const sameField = ix.roles[top[0]].group === r.group, lift = base ? top[1] / base : null;
        return { id: s.id, name: s.name, share: share(s), where: top[0], whereLabel: ix.roles[top[0]].label, whereShare: top[1], lift, sameField, diff: sameField ? 2 : lift != null && lift < 5 ? 1 : 0 };
      }).filter(Boolean);
      let max = RULE.filler, decoys = decoysAt(max);
      if (decoys.length < RULE.minFiller) { max = RULE.fillerWide; decoys = decoysAt(max); }
      decoys.sort((a, b) => b.whereShare - a.whereShare);
      const calls = skills.filter(s => share(s) >= CALL_MIN).map(s => ({ id: s.id, name: s.name, share: share(s) })).sort((a, b) => b.share - a.share);
      out[r.id] = { id: r.id, label: r.label, set: r.set, group: r.group, n: r.n, nOpen: r.nOpen, small: !!r.small, decoyMax: max, asks, decoys, calls };
    }
    return out;
  }
  const playable = pool => !!pool && pool.asks.length >= RULE.minAsks && pool.decoys.length >= 1;

  // a decoy drawer by stage: stage 0 draws decoys from another world first, stage 1 up to the fairly widely asked ones,
  // stage 2 prefers the ones a nearby role prizes; a decoy repeats only once the pool is used up
  function drawer(decoys, rnd) {
    const used = new Set();
    return (diff, exclude) => {
      const tiers = diff === 0 ? [d => d.diff === 0, d => d.diff <= 1, () => true] : diff === 1 ? [d => d.diff <= 1, () => true] : [d => d.diff >= 1, () => true];
      const pickFrom = () => { for (const t of tiers) { const c = decoys.filter(d => t(d) && !used.has(d.id) && !(exclude && exclude.has(d.id))); if (c.length) return c[Math.floor(rnd() * c.length)]; } return null; };
      let d = pickFrom();
      if (!d) { used.clear(); d = pickFrom() || decoys.find(x => !(exclude && exclude.has(x.id))) || decoys[0]; }
      if (d) used.add(d.id);
      return d;
    };
  }
  // a board: PICK real asks (fewer when the role has fewer; `first` names asks to put on it, the fit page's gaps) and
  // decoys up to BOARD tiles, shuffled. `seen` holds the ids of asks dealt earlier in the game, drawn last.
  function dealBoard(pool, rnd, { stage = 0, first = [], seen = new Set() } = {}) {
    const want = new Set(first), fresh = pool.asks.filter(a => !seen.has(a.id) && !want.has(a.id)), old = pool.asks.filter(a => seen.has(a.id) && !want.has(a.id));
    const reals = [...pool.asks.filter(a => want.has(a.id)), ...shuffle(fresh, rnd), ...shuffle(old, rnd)].slice(0, Math.min(PICK, pool.asks.length));
    const tiles = reals.map(a => ({ ...a, real: true })), on = new Set(tiles.map(t => t.id)), draw = drawer(pool.decoys, rnd);
    const stg = STAGES[Math.min(stage, STAGES.length - 1)];
    while (tiles.length < BOARD && on.size < pool.asks.length + pool.decoys.length) { const d = draw(stg.diff, on); if (!d || on.has(d.id)) break; on.add(d.id); tiles.push({ ...d, real: false }); }
    return { tiles: shuffle(tiles, rnd), reals: tiles.filter(t => t.real).length, stage };
  }
  // scoring a board: picked = a Set of tile indexes. right: real asks picked; missed: real asks left; wrong: decoys picked
  function scoreBoard(tiles, picked) {
    const right = [], missed = [], wrong = [];
    tiles.forEach((t, i) => { if (t.real) (picked.has(i) ? right : missed).push(t); else if (picked.has(i)) wrong.push(t); });
    return { right, missed, wrong, reals: right.length + missed.length, got: right.length };
  }
  // the calls: the anchor is the role's top ask; CALLS skills at least `gap` from half, as many over as under as the
  // pool allows, never the anchor, spread over the shares; `seen` ids are drawn last
  function dealCalls(pool, rnd, { stage = 0, seen = new Set() } = {}) {
    const anchor = pool.asks[0] || pool.calls[0]; if (!anchor) return null;
    const stg = STAGES[Math.min(stage, STAGES.length - 1)];
    const cands = pool.calls.filter(c => c.id !== anchor.id);
    const far = cands.filter(c => Math.abs(c.share - HALF) >= stg.gap), use = far.length >= CALLS ? far : cands.filter(c => Math.abs(c.share - HALF) >= 0.04).length >= CALLS ? cands.filter(c => Math.abs(c.share - HALF) >= 0.04) : cands;
    const order = xs => [...shuffle(xs.filter(c => !seen.has(c.id)), rnd), ...shuffle(xs.filter(c => seen.has(c.id)), rnd)];
    const over = order(use.filter(c => c.share >= HALF)), under = order(use.filter(c => c.share < HALF));
    const half = Math.ceil(CALLS / 2), calls = [...over.slice(0, half), ...under.slice(0, CALLS - Math.min(half, over.length))];
    while (calls.length < CALLS && (over.length > half || under.length > CALLS - half)) { const extra = over.length > half ? over.splice(half, 1)[0] : under.splice(CALLS - half, 1)[0]; if (!extra || calls.includes(extra)) break; calls.push(extra); }
    return { anchor, calls: shuffle(calls.slice(0, CALLS), rnd), stage };
  }
  // scoring the calls: answers[i] = true for "more than half"; a call is right when the answer matches the share
  function scoreCalls(calls, answers) {
    const rows = calls.map((c, i) => ({ ...c, said: answers[i] == null ? null : !!answers[i], over: c.share >= HALF, right: answers[i] != null && (!!answers[i] === (c.share >= HALF)) }));
    return { rows, right: rows.filter(r => r.right).length, n: rows.length };
  }
  // the same skill across fields: the role's top ask, and CALLS roles of other fields with their share of it, the
  // call being "do more or fewer than half of <role> postings ask for it?"
  function dealHop(pool, all, rnd, { seen = new Set() } = {}) {
    const skill = pool.asks[0]; if (!skill) return null;
    // roles of other fields (both sets share the skill ids); the ones whose postings name the skill at least CALL_MIN first
    const roles = Object.values(all).filter(p => p.id !== pool.id && p.group !== pool.group && !p.small).map(p => { const c = p.calls.find(x => x.id === skill.id); return { id: p.id, label: p.label, group: p.group, share: c ? c.share : 0 }; });
    const named = roles.filter(r => r.share >= CALL_MIN), base = named.length >= CALLS ? named : roles;
    const far = base.filter(r => Math.abs(r.share - HALF) >= 0.08), use = far.length >= CALLS ? far : base;
    const order = xs => [...shuffle(xs.filter(r => !seen.has(r.id)), rnd), ...shuffle(xs.filter(r => seen.has(r.id)), rnd)];
    const over = order(use.filter(r => r.share >= HALF)), under = order(use.filter(r => r.share < HALF)), half = Math.ceil(CALLS / 2);
    const calls = [...over.slice(0, half), ...under.slice(0, CALLS - Math.min(half, over.length))];
    for (const extra of [...over.slice(half), ...under.slice(CALLS - half)]) { if (calls.length >= CALLS) break; calls.push(extra); }
    return { skill, calls: shuffle(calls.slice(0, CALLS), rnd) };
  }
  // the takeaway of a board (G3): the one miss or wrong pick worth a sentence
  function boardTakeaway(sc, pool) {
    const w = sc.wrong.slice().sort((a, b) => b.whereShare - a.whereShare)[0], m = sc.missed.slice().sort((a, b) => b.share - a.share)[0];
    if (w) return `${w.name}: ${pct(w.share)} of ${pool.label} postings ask for it; ${pct(w.whereShare)} of ${w.whereLabel} postings do.`;
    if (m) return `${m.name}: ${pct(m.share)} of ${pool.label} postings ask for it, and you left it.`;
    return `All ${sc.reals} real asks, no decoys. ${pool.asks[0] ? `${pool.asks[0].name} leads: ${pct(pool.asks[0].share)} of ${pool.label} postings ask for it.` : ""}`;
  }
  // the help line and the first coach line (2026-11-06, the usability pass: short sentences, active voice, no inside
  // words such as "decoys"); tests/web/know-the-role.test.mjs runs the copy rule over them
  const HELP = {
    rules: () => `Which skills do the role's postings ask for? Round one shows twelve skills. Pick the ${PICK} that most of the role's postings ask for. The other skills come from other roles. Then make ${CALLS} calls against the role's top ask. Do more or fewer than half of its postings ask for each skill? A real ask shows up in at least 40% of the role's postings. There are three rounds. As you go, the calls get closer and the wrong answers come from nearer roles.`,
    coach: (n, label) => `Pick the ${n} skills that most ${label} postings ask for. The other skills come from other roles. Then hand in.`,
  };
  const logic = { RULE, HELP, BOARD, PICK, CALLS, HALF, CALL_MIN, ROUNDS, STAGES, pools, playable, dealBoard, scoreBoard, dealCalls, scoreCalls, dealHop, boardTakeaway, mulberry32, shuffle };

  // ---------- the screens ----------
  async function mount(el, ctx) {
    const { Atlas } = ctx, GS = window.GameShell;
    const INFO = GS.info({ rules: HELP.rules(), keys: "Keys: click a tile to pick it (arrows move, Space picks); 1 says more than half, 2 says fewer; Enter hands in or goes on; Esc quits.", source: "Every share is the fraction of the role's postings that name a skill, read every week." });
    const F = GS.frame(el, { game: TITLE, cls: "ktr", info: INFO });
    const $ = s => el.querySelector(s);
    let alive = true, timer = null;
    const say = m => F.live(m);
    const stopTimer = () => { if (timer) { clearInterval(timer.id); timer = null; } };
    const offKeys = GS.keys({
      choose(n) { if (S.phase === "call" && n <= 2) { answerCall(n === 1); return true; } return false; },
      confirm() { if (!alive) return; if (S.phase === "start") begin(); else if (S.phase === "board") handIn(); else if (S.phase === "board-reveal" || S.phase === "calls-reveal") nextRound(); else if (S.phase === "end") begin(); },
    });
    const leave = () => { alive = false; stopTimer(); offKeys(); window.removeEventListener("hashchange", leave); };
    window.addEventListener("hashchange", leave);

    F.body.innerHTML = `<p class="lead">Reading the roles…</p>`;
    const ix = await Atlas.index(); let P = null; try { P = await Atlas.product(); } catch (e) { console.error(e); }
    const generic = await Atlas.genericSkills().catch(() => new Set());
    if (!alive) return;
    const ALL = pools(ix, P, generic);
    const ok = id => playable(ALL[id]);
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const first = (params.get("skills") || "").split(",").filter(Boolean);
    const saved = () => Object.assign({ best: {}, clean: false, speed: false }, GS.record.game(SLUG));
    const S = { phase: "start", role: null, pool: null, rnd: mulberry32(Math.floor(Math.random() * 2 ** 31)), round: 0, rounds: [], picked: new Set(), board: null, calls: null, answers: [], timed: false, marks: [] };
    S.role = await GS.defaultRole(Atlas, ok, { tech: true }); if (!alive) return;   // deals the tech set too (its eval covers it)
    if (!S.role) { F.body.innerHTML = `<p class="lead">No role can be played yet.</p>`; return; }
    S.pool = ALL[S.role];
    renderStart();

    // ----- the start -----
    function renderStart() {
      S.phase = "start"; stopTimer();
      const sv = saved(), pool = S.pool, b = sv.best[pool.id], asks = GS.record.asksOf(ix, P, pool.id), k = GS.record.knowledge(pool.id, asks);
      const mode = sv.clean && sv.speed;
      const extra = `${k.any ? `<p class="gm-best">You know <b>${k.known.length} of ${k.total}</b> things ${esc(pool.label)} postings ask for${b ? ` · best round ${esc(b)}` : ""}</p>` : ""}
        ${sv.clean ? `<div class="chips" role="group" aria-label="Round"><button class="chip${mode ? "" : " on"}" type="button" data-mode="untimed" aria-pressed="${!mode}">Untimed</button><button class="chip${mode ? " on" : ""}" type="button" data-mode="speed" aria-pressed="${mode}">Speed round<span class="n">${SPEED.board} s a board, ${SPEED.call} s a call</span></button></div>` : ""}
        ${pool.small ? `<p class="small muted">A small sample: ${fmt(pool.n)} postings in all. The shares can move a lot week to week.</p>` : ""}`;
      GS.start(F, { title: TITLE, lead: `Which skills do ${pool.label} postings ask for? Pick the real asks on a board of twelve, then call eight skills over or under half. Every round ends on the role's own ranked list.`, role: pool.label, playLabel: mode ? `Speed round · ${esc(pool.label)}` : `Play · ${esc(pool.label)}`, play: begin, change: renderPick, extra });
      F.body.querySelectorAll("[data-mode]").forEach(bt => bt.onclick = () => { GS.record.saveGame(SLUG, { speed: bt.dataset.mode === "speed" }); renderStart(); });
    }
    function renderPick() {
      S.phase = "pick"; stopTimer();
      GS.picker(F, { Atlas, roles: ok, tech: true, field: S.pool.group, secondary: id => { const k = GS.record.knowledge(id, GS.record.asksOf(ix, P, id)); return k.any ? `${k.known.length} of ${k.total} asks known` : "Not played yet"; }, back: true, onBack: renderStart, onRole: id => { S.role = id; S.pool = ALL[id]; begin(); } });
    }

    // ----- a game: three rounds -----
    function begin() {
      const sv = saved();
      S.round = 0; S.rounds = []; S.timed = !!(sv.clean && sv.speed); S.marks = []; S.seen = new Set(); S.seenRoles = new Set(); S.kinds = ["board", "calls", "board"];
      startRound();
    }
    function startRound() {
      const kind = S.kinds[S.round], stage = S.round;
      F.set({ round: S.round, rounds: ROUNDS, marks: S.marks, role: S.pool.label });
      if (kind === "board") startBoard(stage);
      else if (kind === "calls") startCalls(stage);
      else startHop();
    }
    const sayStage = stage => { const t = STAGES[Math.min(stage, STAGES.length - 1)].say; return t ? `<p class="gm-key">${esc(t)}</p>` : ""; };

    // ----- a board -----
    function startBoard(stage) {
      S.phase = "board";
      S.board = dealBoard(S.pool, S.rnd, { stage, first: S.round === 0 ? first : [], seen: S.seen });
      S.board.tiles.forEach(t => { if (t.real) S.seen.add(t.id); });
      S.picked = new Set(); S.focus = 0;
      drawBoard();
      if (S.round === 0) GS.coachOnce(SLUG, $(".ktr-board"), HELP.coach(S.board.reals, S.pool.label), "beforebegin");
      if (S.timed) startClock(SPEED.board, handIn);
    }
    function drawBoard() {
      const B = S.board, n = B.reals;
      const tile = (t, i) => `<button type="button" class="ktr-tile${S.picked.has(i) ? " on" : ""}" data-i="${i}" aria-pressed="${S.picked.has(i)}" tabindex="${i === S.focus ? 0 : -1}"><span class="ktr-check" aria-hidden="true"></span>${esc(t.name)}</button>`;
      F.body.innerHTML = `<h1>Pick the ${words(n)} that most ${esc(S.pool.label)} postings ask for</h1>${sayStage(B.stage)}
        <div class="ktr-board" role="group" aria-label="Twelve skills">${B.tiles.map(tile).join("")}</div>
        <p class="gm-key" id="ktr-count">${S.picked.size} of ${n} picked${S.timed ? ` · <span class="ktr-clock" id="ktr-clock"></span>` : ""}</p>
        ${GS.foot({ primary: { id: "ktr-hand", label: `Hand in · ${S.picked.size} of ${n}`, key: "Enter" } })}`;
      const board = $(".ktr-board");
      board.onclick = e => { const b = e.target.closest("[data-i]"); if (!b) return; const i = +b.dataset.i; S.focus = i; if (S.picked.has(i)) S.picked.delete(i); else if (S.picked.size < n) S.picked.add(i); else { say(`${n} picked already. Unpick one first.`); return; } b.classList.toggle("on", S.picked.has(i)); b.setAttribute("aria-pressed", S.picked.has(i)); $("#ktr-count").firstChild.textContent = `${S.picked.size} of ${n} picked`; $("#ktr-hand").firstChild.textContent = `Hand in · ${S.picked.size} of ${n}`; };
      board.onkeydown = e => {
        if (e.key === "Enter") { e.preventDefault(); handIn(); return; }   // Enter hands in, even from a tile
        if (e.key === " " || e.key === "Spacebar") { const b = e.target.closest("[data-i]"); if (b) { e.preventDefault(); b.click(); } return; }
        const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key]; if (d == null) return;
        const cell = e.target.closest("[data-i]"), i = cell ? +cell.dataset.i : 0, j = i + d; if (j < 0 || j >= B.tiles.length || (Math.abs(d) === 1 && Math.floor(j / 4) !== Math.floor(i / 4))) return;
        e.preventDefault(); S.focus = j; board.querySelectorAll("[data-i]").forEach(b => b.tabIndex = +b.dataset.i === j ? 0 : -1); board.querySelector(`[data-i="${j}"]`).focus();
      };
      $("#ktr-hand").onclick = handIn;
      const t0 = board.querySelector('[data-i="0"]'); if (t0) t0.focus({ preventScroll: true });
    }
    function handIn() {
      if (S.phase !== "board") return;
      stopTimer();
      const sc = scoreBoard(S.board.tiles, S.picked);
      S.rounds.push({ kind: "board", sc }); S.marks.push(sc.got * 2 >= sc.reals && !sc.wrong.length ? "ok" : "miss");
      S.phase = "board-reveal";
      F.set({ marks: S.marks });
      // the reveal: the twelve on the role's ranked list, your picks marked, one line per miss
      const rows = S.board.tiles.slice().sort((a, b) => b.share - a.share).map(t => { const i = S.board.tiles.indexOf(t), p = S.picked.has(i);
        return { name: t.name, share: t.share, cls: t.real ? (p ? "you" : "miss") : (p ? "wrong" : "dim"), note: t.real ? (p ? "" : "missed, a real ask") : (p ? `you picked it · ${pct(t.whereShare)} of ${t.whereLabel} postings ask for it` : `a decoy: ${t.whereLabel} ${pct(t.whereShare)}`) }; });
      F.body.innerHTML = GS.results({
        eyebrow: `Board ${S.round === 0 ? 1 : 2} · ${esc(S.pool.label)}`,
        measure: `${sc.got} of ${sc.reals} real asks${sc.wrong.length ? ` · ${words(sc.wrong.length)} ${sc.wrong.length === 1 ? "decoy" : "decoys"} picked` : ""}`,
        takeaway: esc(boardTakeaway(sc, S.pool)),
        visual: `${GS.ranked(rows, `{n} of ${esc(S.pool.label)} postings ask for it.`)}<p class="gm-key">The twelve on ${esc(S.pool.label)}'s own ranked list: % of its postings that ask. ✓ your right picks; amber a real ask you left; struck a decoy you picked.</p>`,
        link: { href: `#/role/${encodeURIComponent(S.pool.id)}`, label: `Open ${S.pool.label}` },
        foot: GS.foot({ primary: { id: "ktr-next", label: S.round + 1 < ROUNDS ? "Next round" : "See your result", key: "Enter" }, quiet: S.round === 0 ? { id: "ktr-hop", label: "Try the same skill across fields" } : null }),
      });
      $("#ktr-next").onclick = nextRound;
      const hop = $("#ktr-hop"); if (hop) hop.onclick = () => { S.kinds[1] = "hop"; nextRound(); };
      say(`${sc.got} of ${sc.reals} real asks. ${boardTakeaway(sc, S.pool)}`);
      F.focusMeasure();
    }

    // ----- the calls -----
    function startCalls(stage) {
      S.phase = "call";
      S.calls = dealCalls(S.pool, S.rnd, { stage, seen: S.seen });
      if (!S.calls || !S.calls.calls.length) { S.kinds[S.round] = "board"; return startBoard(stage); }
      S.calls.calls.forEach(c => S.seen.add(c.id));
      S.answers = []; S.ci = 0;
      drawCall();
    }
    function drawCall(hop) {
      const C = S.calls, i = S.ci, c = C.calls[i], anchor = hop ? C.skill : C.anchor;
      const sofar = C.calls.slice(0, i).map((x, k) => `${esc(hop ? x.label : x.name)} ${pct(x.share)} ${S.answers[k] === (x.share >= HALF) ? "✓" : "✗"}`).join(" · ");
      F.body.innerHTML = `<p class="eyebrow">${hop ? `${esc(C.skill.name)} across fields` : `Against the anchor`} · call ${i + 1} of ${C.calls.length}</p>
        ${hop ? `<p class="lead">${pct(C.skill.share)} of ${esc(S.pool.label)} postings ask for ${esc(C.skill.name)}. Half: 50%.</p>` : `<p class="lead">${esc(anchor.name)}: ${pct(anchor.share)} of ${esc(S.pool.label)} postings ask for it. Half of them: 50%.</p>`}${sayStage(C.stage || 0)}
        <h1>${esc(hop ? c.label : c.name)}</h1>
        <p class="gm-take">${hop ? `Do more or fewer than half of ${esc(c.label)} postings ask for ${esc(C.skill.name)}?` : `Do more or fewer than half of ${esc(S.pool.label)} postings ask for it?`}</p>
        <div class="ktr-calls"><button type="button" class="btn primary" id="ktr-more">More than half ${GS.kbd("1")}</button><button type="button" class="btn primary" id="ktr-fewer">Fewer than half ${GS.kbd("2")}</button></div>
        <p class="gm-key">${sofar ? `So far: ${sofar}` : "Eight calls. A second try is not needed: every call shows its answer at the end."}${S.timed ? ` · <span class="ktr-clock" id="ktr-clock"></span>` : ""}</p>`;
      $("#ktr-more").onclick = () => answerCall(true); $("#ktr-fewer").onclick = () => answerCall(false);
      if (S.round === 1 && i === 0 && !hop) GS.coachOnce(SLUG, $(".ktr-calls"), "Call each skill over or under half of the role's postings. 1 says more than half, 2 says fewer.", "beforebegin");
      if (S.timed) startClock(SPEED.call, () => answerCall(null));
    }
    function answerCall(over) {
      if (S.phase !== "call") return;
      stopTimer();
      S.answers.push(over); S.ci++;
      if (S.ci < S.calls.calls.length) { drawCall(S.calls.skill != null); return; }
      revealCalls();
    }
    function revealCalls() {
      const C = S.calls, hop = C.skill != null, sc = scoreCalls(C.calls, S.answers);
      S.rounds.push({ kind: hop ? "hop" : "calls", sc }); S.marks.push(sc.right * 2 >= sc.n ? "ok" : "miss");
      S.phase = "calls-reveal"; F.set({ marks: S.marks });
      const rows = sc.rows.slice().sort((a, b) => b.share - a.share).map(r => ({ name: hop ? r.label : r.name, share: r.share, cls: r.right ? "you" : "miss", note: r.right ? "" : r.said == null ? "no call" : `you said ${r.said ? "more" : "fewer"} than half` }));
      if (!hop) rows.push({ name: `${C.anchor.name} (the anchor)`, share: C.anchor.share, cls: "", note: "" });
      rows.sort((a, b) => b.share - a.share);
      const wrong = sc.rows.filter(r => !r.right).sort((a, b) => Math.abs(b.share - HALF) - Math.abs(a.share - HALF));
      const take = wrong.length ? `${wrong.length === 1 ? "One surprise" : `${words(wrong.length)} surprises`}: ${wrong.slice(0, 2).map(r => hop ? `${pct(r.share)} of ${r.label} postings ask for ${C.skill.name}` : `${r.over ? "half or more" : "fewer than half"} of ${S.pool.label} postings ask for ${r.name} (${pct(r.share)})`).join("; ")}.` : hop ? `Every call right: you know where ${C.skill.name} is prized.` : `Every call right: you know the shape of ${S.pool.label}'s asks.`;
      F.body.innerHTML = GS.results({
        eyebrow: hop ? `${esc(C.skill.name)} across fields` : `Eight calls · ${esc(S.pool.label)}`,
        measure: `${sc.right} of ${sc.n} right`,
        takeaway: esc(take),
        visual: `${GS.ranked(rows, hop ? `{n} of the role's postings ask for ${esc(C.skill.name)}.` : `{n} of ${esc(S.pool.label)} postings ask for it.`)}<p class="gm-key">${hop ? `Roles of other fields, ranked by the share of their postings that ask for ${esc(C.skill.name)}.` : `The eight on ${esc(S.pool.label)}'s own ranked list, with the anchor: % of its postings that ask.`} ✓ a right call; amber a wrong one.</p>`,
        link: { href: `#/role/${encodeURIComponent(S.pool.id)}`, label: `Open ${S.pool.label}` },
        foot: GS.foot({ primary: { id: "ktr-next", label: S.round + 1 < ROUNDS ? "Next round" : "See your result", key: "Enter" } }),
      });
      $("#ktr-next").onclick = nextRound;
      say(`${sc.right} of ${sc.n} right. ${take}`);
      F.focusMeasure();
    }
    // the same skill across fields (the second round type, offered after the first board)
    function startHop() {
      S.phase = "call";
      S.calls = dealHop(S.pool, ALL, S.rnd, { seen: S.seenRoles });
      if (!S.calls || !S.calls.calls.length) { S.kinds[S.round] = "calls"; return startCalls(S.round); }
      S.calls.calls.forEach(c => S.seenRoles.add(c.id));
      S.answers = []; S.ci = 0;
      drawCall(true);
    }

    function nextRound() {
      if (S.phase !== "board-reveal" && S.phase !== "calls-reveal") return;
      S.round++;
      if (S.round >= ROUNDS) return endGame();
      startRound();
    }

    // ----- the Speed round's clock: the board hands in as it is, a call counts as a miss -----
    function startClock(seconds, done) {
      stopTimer();
      let left = seconds;
      const paint = () => { const c = $("#ktr-clock"); if (c) c.textContent = `${left} s`; };
      paint();
      timer = { id: setInterval(() => { if (!alive) return stopTimer(); left--; paint(); if (left <= 0) { stopTimer(); done(); } }, 1000) };
    }

    // ----- the end: the record first, the biggest miss as the takeaway, the role's asks with ✓ -----
    function endGame() {
      S.phase = "end"; stopTimer();
      const pool = S.pool, asks = GS.record.asksOf(ix, P, pool.id), before = GS.record.knowledge(pool.id, asks);
      const known = new Set(), met = new Set();
      for (const r of S.rounds) {
        if (r.kind === "board") { r.sc.right.forEach(t => known.add(t.id)); r.sc.missed.forEach(t => met.add(t.id)); }
        else if (r.kind === "calls") r.sc.rows.forEach(x => { met.add(x.id); if (x.right) known.add(x.id); });
      }
      GS.record.saveRole(pool.id, { label: pool.label, met: [...met], known: [...known] });
      const after = GS.record.knowledge(pool.id, asks), line = GS.knowLine(before, after, pool.label);
      const rounds = S.rounds.map(r => r.kind === "board" ? `${r.sc.got} of ${r.sc.reals}` : `${r.sc.right} of ${r.sc.n}`), score = rounds.join(" · ");
      const sv = saved(), prev = sv.best[pool.id], total = S.rounds.reduce((a, r) => a + (r.kind === "board" ? r.sc.got : r.sc.right), 0), of = S.rounds.reduce((a, r) => a + (r.kind === "board" ? r.sc.reals : r.sc.n), 0);
      const cleanNow = !S.timed && total * 2 >= of && !sv.clean, best = { ...sv.best, [pool.id]: prev && prev.total >= total ? prev : { total, of } };
      GS.record.saveGame(SLUG, { played: true, best, clean: sv.clean || cleanNow });
      const byId = pool.set === "product" && P ? P.skillById : pool.set === "tech" ? ix.techSkillById : ix.skillById;
      const missing = after.missing.slice(0, 3).map(id => (byId[id] || ix.skillById[id] || { name: id }).name);
      const rows = asks.map(id => { const s = byId[id] || ix.skillById[id] || { name: id }, share = (s.by_family || {})[ix.roles[pool.id].family] || 0, k = after.known.includes(id); return { name: s.name, share, cls: k ? "you" : after.met.includes(id) ? "miss" : "", note: k ? "" : after.met.includes(id) ? "met, not yet right" : "not met yet" }; });
      F.set({ round: ROUNDS, rounds: ROUNDS, marks: S.marks });
      F.body.innerHTML = GS.results({
        eyebrow: `Three rounds · ${esc(pool.label)}`,
        measure: `${total} of ${of} right · ${esc(score)}`,
        record: `${line}${prev && total > prev.total ? " A new best." : ""}${S.timed ? " A Speed round." : cleanNow ? " The Speed round is unlocked." : ""}`,
        takeaway: after.missing.length ? `Still to meet or get right: ${esc(missing.join(", "))}${after.missing.length > 3 ? " and more" : ""}. Postings change every week; nobody keeps up by hand.` : `You know every skill ${esc(pool.label)} postings ask for most. Postings change every week; come back after a refresh.`,
        visual: `${GS.ranked(rows, `{n} of ${esc(pool.label)} postings ask for it.`)}<p class="gm-key">Everything at least 40% of ${esc(pool.label)} postings ask for: % of its postings that ask. ✓ you got it right in a game; amber met but not yet right.</p>`,
        link: { href: `#/role/${encodeURIComponent(pool.id)}`, label: `Open ${pool.label}` },
        foot: GS.foot({ primary: { id: "ktr-again", label: after.missing.length ? "Practise the rest" : "Play again", key: "Enter" }, quiet: { id: "ktr-change", label: "Change role" } }),
      });
      $("#ktr-again").onclick = () => { if (after.missing.length) { first.length = 0; first.push(...after.missing.slice(0, PICK)); } begin(); };
      $("#ktr-change").onclick = renderPick;
      say(`${total} of ${of} right. ${line.replace(/<[^>]+>/g, "")}`);
      F.focusMeasure();
    }
  }

  return { logic, mount };
});
