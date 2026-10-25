/* What does it ask for (#/play/what-it-asks): three boards of 16 skills; pick what the role's postings really ask for,
   let the filler pass, hand in. Spec: games/what-it-asks/README.md. Pools mirror games/what-it-asks/pools.js through
   web/atlas.js. The Shift (skills pop up with a timer each) is the Speed round: the clock alone, no lives, no blown
   slots, no multiplier; it unlocks after a clean untimed round (web/gameshell.js: one header, Enter hands in, Esc
   quits, one record). Registers window.Games["what-it-asks"] = { mount }; play() in app.js calls it. Params after "?"
   in the hash: role=<id> (skip the picker), seed=<integer> (a fixed deal), debug=pools (the pool counts). */
(function () {
  "use strict";
  const SLUG = "what-it-asks", TITLE = "What does it ask for", HOME = "#/play/" + SLUG;
  // a real ask is 40% of postings: next to Atlas.TIER (core 0.5, common 0.25, some 0.1), its own cut for this game
  const RULE = { ask: 0.40, filler: 0.10, fillerWide: 0.15, minFiller: 14, elsewhere: 0.40, lift: 2 };
  const SHIFT = 50, FIRST = 0.3, LAST_REAL = 66, MIN_REAL = 21, CELLS = 16, FLASH = 0.6;
  const STAGES = [{ until: 10, every: 1.10, life: 4.0, cap: 5 }, { until: 25, every: 0.85, life: 3.4, cap: 7 }, { until: 40, every: 0.65, life: 2.9, cap: 9 }, { until: 50, every: 0.50, life: 2.5, cap: 10 }];
  const stageAt = t => STAGES.findIndex(s => t < s.until) + 1 || 4;
  const SCHEDULE = (() => { const out = []; for (let t = FIRST; t < SHIFT; t += STAGES[stageAt(t) - 1].every) out.push(t); return out; })();   // 70 spawns
  const KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "KeyQ", "KeyW", "KeyE", "KeyR", "KeyA", "KeyS", "KeyD", "KeyF", "KeyZ", "KeyX", "KeyC", "KeyV"];
  const LABEL = "1234QWERASDFZXCV".split("");
  const PUNCH = "Postings change every week. Nobody keeps up by hand.";
  const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const words = n => WORDS[n] || String(n), cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
  const pct = v => Math.round(v * 100) + "%", fmt = n => Number(n).toLocaleString("en-US");
  const youStore = () => { try { return JSON.parse(localStorage.getItem("you")); } catch { return null; } };
  const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const dateOf = s => { const [y, m, d] = String(s || "").split("-").map(Number); return y ? new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "recently"; };

  // ---------- pools: the same rule as games/what-it-asks/pools.js ----------
  let poolsP = null;
  function pools(Atlas) {
    return poolsP ||= (async () => {
      const ix = await Atlas.index(), P = await Atlas.product();   // product() first, so the product families (product.<family>) are in ix.roles
      const generic = await Atlas.genericSkills();
      const M = ix.M, G = P.G;
      const skip = s => s.cluster === "credentials" || s.id.startsWith("yoe_");
      const mbaElsewhere = (sid, self) => Object.entries((ix.skillById[sid] || {}).by_family || {}).filter(([f]) => f !== self && ix.roles[f] && ix.roles[f].set === "mba" && !ix.roles[f].small);
      const out = {};
      for (const r of Object.values(ix.roles)) {
        const skills = (r.set === "mba" ? M.skills : G.skills).filter(s => !skip(s));
        const share = s => (s.by_family || {})[r.family] || 0;
        const elsewhere = s => r.set === "mba" ? mbaElsewhere(s.id, r.id) : [...Object.entries(s.by_family || {}).filter(([f]) => f !== r.family).map(([f, v]) => [Atlas.productKey(f), v]), ...mbaElsewhere(s.id, r.id)];
        const asks = skills.filter(s => share(s) >= RULE.ask).map(s => ({ id: s.id, name: s.name, share: share(s), generic: generic.has(s.id) })).sort((a, b) => b.share - a.share);
        const fillerAt = max => skills.filter(s => share(s) <= max).map(s => {
          const [top] = elsewhere(s).sort((a, b) => b[1] - a[1]); const base = ix.baseline[s.id] || 0;
          if (!top || top[1] < RULE.elsewhere || (base && top[1] / base < RULE.lift)) return null;
          const sameField = ix.roles[top[0]].group === r.group, lift = base ? top[1] / base : null;
          // difficulty: 2 asked in the same field, 1 asked fairly widely (lift under 5), 0 clearly another world
          return { id: s.id, name: s.name, share: share(s), where: top[0], whereLabel: ix.roles[top[0]].label, whereShare: top[1], lift, sameField, diff: sameField ? 2 : lift != null && lift < 5 ? 1 : 0 };
        }).filter(Boolean);
        let max = RULE.filler, filler = fillerAt(max);
        if (filler.length < RULE.minFiller) { max = RULE.fillerWide; filler = fillerAt(max); }
        filler.sort((a, b) => b.whereShare - a.whereShare);
        out[r.id] = { id: r.id, label: r.label, set: r.set, group: r.group, n: r.n, nOpen: r.nOpen, nCompanies: r.nCompanies, small: r.small, fillerMax: max, asks, filler, date: dateOf((r.set === "mba" ? M : G).meta.generated) };
      }
      return out;
    })();
  }

  // ---------- the deal ----------
  // filler by stage: 1 draws difficulty 0, 2 up to 1, 3 and 4 prefer 1 and 2; a skill repeats only once its pool is used up
  function drawer(filler, rnd) {
    const used = new Set(); let prev = null;
    return (stage, exclude) => {
      const tiers = stage === 1 ? [f => f.diff === 0, f => f.diff <= 1, () => true] : stage === 2 ? [f => f.diff <= 1, () => true] : [f => f.diff >= 1, () => true];
      const pickFrom = () => {
        for (const t of tiers) {
          const c = filler.filter(f => t(f) && !used.has(f.id) && f.id !== prev && !(exclude && exclude.has(f.id)));
          if (!c.length) continue;
          const w = c.map(f => stage >= 3 && f.diff === 2 ? 2 : 1), sum = w.reduce((a, b) => a + b, 0);
          let x = rnd() * sum; for (let i = 0; i < c.length; i++) { x -= w[i]; if (x < 0) return c[i]; } return c[c.length - 1];
        }
        return null;
      };
      let f = pickFrom();
      if (!f) { used.clear(); f = pickFrom() || filler.find(x => !(exclude && exclude.has(x.id))) || filler[0]; }
      used.add(f.id); prev = f.id;
      return f;
    };
  }
  // the asks in shuffled passes: every ask once, then again for roles with fewer than 21; never twice in a row
  function passes(asks, n, rnd) {
    const out = [];
    while (out.length < n) { const p = shuffle(asks.slice(), rnd); if (out.length && p.length > 1 && p[0].id === out[out.length - 1].id) [p[0], p[1]] = [p[1], p[0]]; out.push(...p); }
    return out.slice(0, n);
  }
  function deal(pool, rnd) {
    const R = Math.min(Math.max(pool.asks.length, MIN_REAL), LAST_REAL), realAt = new Set();
    for (let k = 0; k < R; k++) realAt.add(Math.floor((k + 0.5) * LAST_REAL / R));   // spread evenly, the last by spawn 66
    const reals = passes(pool.asks, R, rnd), draw = drawer(pool.filler, rnd);
    return SCHEDULE.map((t, i) => realAt.has(i) || !pool.filler.length ? { ...reals.shift() || pool.asks[i % pool.asks.length], real: true } : { ...draw(stageAt(t)), real: false });
  }
  function steadyBoards(pool, rnd) {
    const asks = shuffle(pool.asks.slice(), rnd), draw = drawer(pool.filler, rnd), sizes = [0, 1, 2].map(b => Math.floor(asks.length / 3) + (b < asks.length % 3 ? 1 : 0));
    let k = 0;
    return sizes.map((n, b) => {
      const tiles = asks.slice(k, k += n).map(a => ({ ...a, real: true })), on = new Set(tiles.map(t => t.id));
      while (tiles.length < CELLS) { const f = draw(b + 1, on); on.add(f.id); tiles.push({ ...f, real: false }); }
      return shuffle(tiles, rnd);
    });
  }

  // ---------- bests: the share of the role's real asks known at least once, then fewer filler picks ----------
  const better = (a, b) => { if (!b) return true; const q = a.knew / a.total - b.knew / b.total; if (Math.abs(q) > 1e-9) return q > 0; return a.blown < b.blown; };
  const bestLine = b => b ? `${b.knew} of ${b.total}` : "";

  // ---------- the mount ----------
  let current = null;
  async function mount(el, ctx) {
    if (current && current.alive) current.cleanup();
    const { Atlas } = ctx, esc = ctx.esc, GS = window.GameShell;
    const S = { alive: true, timers: new Set(), listeners: [], raf: 0 };
    current = S;
    const on = (t, type, fn) => { t.addEventListener(type, fn); S.listeners.push([t, type, fn]); };
    const later = (fn, ms) => { const id = setTimeout(() => { S.timers.delete(id); if (S.alive) fn(); }, ms); S.timers.add(id); };
    const INFO = GS.info({ rules: "Sixteen skills on a board. Some are what the role's postings really ask for: at least 40% of them name it. The rest is filler, skills other roles ask for and this one rarely does. Pick the real asks and hand in; three boards a round. The Speed round deals the skills one by one with a timer each: tap the real asks before they fade.", keys: "Keys: arrows move on the board, Space picks, Enter hands in; in the Speed round 1 to 4, Q to R, A to F and Z to V tap the four rows; Esc quits.", source: "The shares are the fraction of the role's postings that ask for a skill, read every week." });
    const F = GS.frame(el, { game: TITLE, cls: "wia-main", info: INFO });
    const view = F.body;
    S.cleanup = () => { S.alive = false; cancelAnimationFrame(S.raf); S.timers.forEach(clearTimeout); S.listeners.forEach(([t, ty, fn]) => t.removeEventListener(ty, fn)); offKeys(); };
    on(window, "hashchange", S.cleanup);   // leaving the route ends the round without saving

    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const seed0 = /^-?\d+$/.test(params.get("seed") || "") ? Number(params.get("seed")) : Math.floor(Math.random() * 2 ** 31);
    let plays = 0, rnd = mulberry32(seed0);
    const saved = () => Object.assign({ best: {}, speed: false, clean: false }, GS.record.game(SLUG));
    let mode = "steady", phase = "load", G = null, SD = null, pool = null;
    const say = msg => F.live(msg);
    const blue = v => `<span class="wia-blue wia-num">${pct(v)}</span>`;

    // ---------- keys (the shell's convention), pause on blur ----------
    const offKeys = GS.keys({
      choose(n) { if (phase === "shift") { tap(n - 1); return true; } return false; },
      confirm() { if (phase === "intro") begin(); else if (phase === "over") begin(); else if (phase === "steady") { SD.shown ? nextBoard() : handIn(); } },
      other(e) {
        if (phase !== "shift" || e.repeat) return;
        const i = KEYS.indexOf(e.code); if (i >= 4) { e.preventDefault(); tap(i); }
      },
    });
    on(window, "blur", () => pause(true));
    on(document, "visibilitychange", () => { if (document.hidden) pause(true); });
    on(window, "focus", () => pause(false));

    const ix = await Atlas.index(); if (!S.alive) return;
    const productP = pools(Atlas);   // starts the product file now; the picker shows the MBA fields meanwhile
    productP.catch(() => { });

    if (params.get("debug") === "pools") return debugPools(await productP);
    const roleId = params.get("role");
    if (!roleId) return picker();
    if (!ix.roles[roleId] && !(await productP.then(p => p[roleId], () => null))) { if (S.alive) picker(`There is no role called “${roleId}”. Pick one below.`); return; }
    view.innerHTML = `<p class="subtle">Loading the role…</p>`;
    const P = await productP; if (!S.alive) return;
    pool = P[roleId];
    if (!pool) return picker(`There is no role called “${roleId}”. Pick one below.`);
    return intro();

    // ---------- 04 pick a role ----------
    function picker(notice) {
      phase = "pick"; F.set({ round: null, rounds: 0, role: "" });
      const you = youStore(), mine = ((you && you.fields) || []).find(f => ix.groups.some(g => g.id === f));
      let field = mine || ix.groups[0].id, P = null;
      const draw = () => {
        const b = saved().best, g = ix.groups.find(x => x.id === field), loading = !P;
        const ids = (g.roles || []).filter(id => ix.roles[id]).sort((a, c) => ix.roles[c].nOpen - ix.roles[a].nOpen);
        const row = id => {
          const r = ix.roles[id], p = P && P[id], best = b[id] && (b[id].steady || b[id].shift);
          const m = r.small ? `<span class="small-n">A small sample: ${fmt(r.n)} postings in all. The shares can move a lot week to week.</span>` : best ? `<span class="best">Your best: ${esc(bestLine(best))}</span>` : "Not played yet";
          return `<a class="r" href="${HOME}?role=${encodeURIComponent(id)}"><span class="t">${esc(r.label)}</span><span class="n">${p ? `${p.asks.length} skills to know · ` : ""}${fmt(r.nOpen)} open</span><span class="m">${m}</span></a>`;
        };
        view.innerHTML = `<section class="wia-card wia-pick">
          <h1>What does it ask for</h1>
          <p class="lead">Pick a role. Each board mixes the skills its postings ask for with filler from other roles.</p>
          ${notice ? `<p class="small wia-amber">${esc(notice)}</p>` : ""}
          <div class="chips" style="margin-top:18px" role="group" aria-label="Field"><span class="lbl">Field</span>${ix.groups.map(x => `<button class="chip${x.id === field ? " on" : ""}" type="button" data-field="${esc(x.id)}" aria-pressed="${x.id === field}">${esc(x.label)}<span class="n">${x.id === "product" && loading ? "…" : (x.roles || []).length}</span></button>`).join("")}</div>
          ${loading ? `<p class="small subtle" style="margin:0">Loading product roles</p>` : ""}
          <div class="list" style="margin-top:14px">${ids.map(row).join("") || `<p class="small subtle" style="padding:11px 0;margin:0">${loading ? "Loading product roles" : "No roles here yet."}</p>`}</div>
          ${GS.foot({ quiet: { id: "wia-surprise", label: "Surprise me" } })}</section>`;
        el.querySelectorAll("[data-field]").forEach(bt => bt.onclick = () => { field = bt.dataset.field; draw(); el.querySelector(`[data-field="${CSS.escape(field)}"]`).focus(); });
        el.querySelector("#wia-surprise").onclick = () => {
          const ids = Object.values(ix.roles).filter(r => !r.small && (P ? P[r.id] : r.set === "mba")).map(r => r.id);
          location.hash = `${HOME}?role=${encodeURIComponent(ids[Math.floor(Math.random() * ids.length)])}`;
        };
      };
      draw();
      productP.then(p => { if (S.alive && phase === "pick") { P = p; const f = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.field; draw(); if (f) el.querySelector(`[data-field="${CSS.escape(f)}"]`).focus(); } }, () => { });
    }

    // ---------- 01 the start: one sentence, Start, the Speed round once unlocked ----------
    function intro() {
      phase = "intro"; F.set({ round: null, rounds: 0, role: pool.label });
      const sv = saved(), b = (sv.best[pool.id] || {}).steady, few = pool.asks.length <= 12;
      mode = sv.clean && sv.speed ? "shift" : "steady";
      view.innerHTML = `<section class="wia-card">
        <h1>Pick what ${esc(pool.label)} postings ask for</h1>
        <p class="lead">Three boards of sixteen skills. Some are what ${esc(pool.label)} postings really ask for; the rest is filler from other roles. Pick the real asks, hand in, see.</p>
        ${few ? `<p class="small wia-amber" style="margin:0">${esc(pool.label)} postings agree on few skills: ${pool.asks.length} reach 40%. Expect to see them twice.</p>` : ""}
        ${pool.small ? `<p class="small subtle" style="margin:0">A small sample: ${fmt(pool.n)} postings in all. The shares can move a lot week to week.</p>` : ""}
        ${sv.clean ? `<div class="chips" role="group" aria-label="Round"><button class="chip${mode === "steady" ? " on" : ""}" type="button" data-mode="steady" aria-pressed="${mode === "steady"}">Untimed</button><button class="chip${mode === "shift" ? " on" : ""}" type="button" data-mode="shift" aria-pressed="${mode === "shift"}">Speed round<span class="n">50 s, the skills pop up one by one</span></button></div>` : `<p class="small muted">Untimed. A Speed round, 50 seconds with the skills popping up one by one, unlocks after a round that knows half the asks.</p>`}
        ${b ? `<p class="gm-best">Your best for ${esc(pool.label)}: <b>${esc(bestLine(b))}</b> skills known</p>` : ""}
        ${GS.foot({ primary: { id: "wia-go", label: mode === "shift" ? "Start the Speed round" : "Start", key: "Enter" }, quiet: { href: HOME, label: "Change role" } })}
      </section>`;
      el.querySelectorAll("[data-mode]").forEach(bt => bt.onclick = () => { GS.record.saveGame(SLUG, { speed: bt.dataset.mode === "shift" }); intro(); el.querySelector(`[data-mode="${bt.dataset.mode}"]`).focus(); });
      el.querySelector("#wia-go").onclick = begin;
    }
    function begin() { rnd = mulberry32(seed0 + plays++); return mode === "shift" ? shift() : steady(); }

    // ---------- 02 the Speed round: the skills pop up with a timer each; the clock alone ----------
    function shift() {
      phase = "shift"; F.set({ round: 0, rounds: 1, role: pool.label });
      G = { t: 0, count: reduced() ? 0 : 3, paused: false, deck: deal(pool, rnd), di: 0, nextAt: SCHEDULE[0], slots: Array.from({ length: CELLS }, () => ({ s: "empty" })), blown: 0, knew: new Set(), dealt: new Set(), ranOut: new Set(), tapped: [], log: [], over: false };
      view.innerHTML = `<div class="wia-shift">
        <section class="wia-play">
          <div class="wia-hud"><div><div class="role">${esc(pool.label)}</div><div class="sub">Speed round · tap what its postings ask for</div></div>
            <div class="stat"><span class="l">Known</span><span class="v" id="wia-score"></span></div>
            <div class="stat"><span class="l">Left</span><span class="v" id="wia-left">0:50</span></div></div>
          <div class="wia-clock" aria-hidden="true"><i id="wia-clock" style="width:0%"></i></div>
          <div class="wia-stage"><div class="wia-board" id="wia-board" role="group" aria-label="Board">${LABEL.map((k, i) => `<button type="button" class="wia-tile empty" data-i="${i}" disabled></button>`).join("")}</div>
            <div class="wia-over-board" id="wia-overlay" hidden></div></div>
          <div class="wia-feedback calm" id="wia-feedback"></div>
        </section>
        <aside class="wia-side" aria-label="Calls so far"><h3>Calls so far</h3><div class="wia-log" id="wia-log"></div></aside></div>`;
      el.querySelector("#wia-board").onclick = e => { const b = e.target.closest("[data-i]"); if (b) tap(+b.dataset.i); };
      for (let i = 0; i < CELLS; i++) drawSlot(i);
      hud(); drawLog(); feedback(null); overlay();
      let last = performance.now();
      const frame = now => {
        if (!S.alive || G.over) return;
        const dt = Math.min(0.1, (now - last) / 1000); last = now;
        if (!G.paused) { if (G.count > 0) { const c = Math.ceil(G.count); G.count -= dt; if (Math.ceil(G.count) !== c) overlay(); } else { G.t += dt; step(); } }
        if (!G.over) S.raf = requestAnimationFrame(frame);
      };
      S.raf = requestAnimationFrame(frame);
    }
    function slotEl(i) { return el.querySelector(`#wia-board [data-i="${i}"]`); }
    function drawSlot(i) {
      const s = G.slots[i], b = slotEl(i), k = `<kbd class="k" aria-hidden="true">${LABEL[i]}</kbd>`, anim = !reduced();
      if (!b) return;
      b.disabled = s.s !== "live"; b.removeAttribute("aria-label");
      if (s.s === "empty") { b.className = "wia-tile empty"; b.innerHTML = k; b.setAttribute("aria-label", `${LABEL[i]}: empty`); }
      else if (s.s === "live") { b.className = "wia-tile" + (anim ? " pop" : ""); b.innerHTML = `${k}<span class="name">${esc(s.item.name)}</span><span class="timer"><i></i></span>`; b.setAttribute("aria-label", `${LABEL[i]}: ${s.item.name}`); }
      else if (s.s === "hit") { b.className = "wia-tile hit" + (anim ? " flash" : ""); b.innerHTML = `${k}<span class="name">${esc(s.item.name)}</span><span class="meta">Real ask · ${blue(s.item.share)} of postings</span>`; }
      else if (s.s === "missed") { b.className = "wia-tile missed"; b.innerHTML = `${k}<span class="name">${esc(s.item.name)}</span><span class="meta wia-amber">Missed · ${blue(s.item.share)} ask for it</span>`; }
      else if (s.s === "wrong") { b.className = "wia-tile wrong" + (anim ? " shake" : ""); b.innerHTML = `${k}<span class="name">${esc(s.item.name)}</span><span class="meta wia-amber">Filler · ${blue(s.item.share)} here</span>`; }
    }
    function hud() { el.querySelector("#wia-score").innerHTML = `${G.knew.size}<span class="subtle wia-of"> of ${pool.asks.length}</span>`; }
    function drawLog() {
      el.querySelector("#wia-log").innerHTML = G.log.slice(0, 8).map(e => `<div class="e"><span class="t">${esc(e.item.name)}</span><span class="v ${e.v === "passed" ? "subtle" : e.ok ? "wia-green" : "wia-amber"}">${e.v}</span><span class="m">${e.item.real ? `Real ask · ${blue(e.item.share)}` : `Filler · ${blue(e.item.share)} here`}</span></div>`).join("");
    }
    function feedback(kind, item) {
      const f = el.querySelector("#wia-feedback");
      if (!kind) { f.className = "wia-feedback calm"; f.innerHTML = `<span>Tap what ${esc(pool.label)} postings ask for. Let the rest pass.</span>`; return; }
      f.className = "wia-feedback";
      f.innerHTML = kind === "filler" ? `<b>Filler.</b><span>${blue(item.share)} of ${esc(pool.label)} postings ask for ${esc(item.name)}; ${blue(item.whereShare)} of ${esc(item.whereLabel)} postings do.</span>`
        : `<b>Missed.</b><span>${blue(item.share)} of ${esc(pool.label)} postings ask for ${esc(item.name)}.</span>`;
    }
    function overlay() {
      const o = el.querySelector("#wia-overlay"), board = el.querySelector("#wia-board");
      if (G.paused) { board.classList.add("hidden-board"); o.hidden = false; o.innerHTML = `<div class="wia-pause"><p class="eyebrow">Paused</p><p class="muted">The board is hidden while the round is paused.</p><button type="button" class="btn primary" id="wia-resume">Resume</button></div>`; el.querySelector("#wia-resume").onclick = () => pause(false); el.querySelector("#wia-resume").focus(); return; }
      board.classList.remove("hidden-board");
      if (G.count > 0) { o.hidden = false; o.innerHTML = `<div class="wia-count" aria-hidden="true">${Math.ceil(G.count)}</div>`; return; }
      o.hidden = true; o.innerHTML = "";
    }
    function pause(p) {
      if (!G || G.over || phase !== "shift" || G.paused === p) return;
      G.paused = p; overlay(); say(p ? "Paused." : "Resumed.");
    }
    function step() {
      const t = G.t; let changed = false;
      G.slots.forEach((s, i) => {
        if (s.s === "live" && t >= s.born + s.life) {
          if (s.item.real) {
            G.ranOut.add(s.item.id);
            G.log.unshift({ item: s.item, v: "missed" }); Object.assign(s, { s: "missed", until: t + FLASH });
            feedback("missed", s.item); say(`Missed. ${s.item.name}, ${pct(s.item.share)}.`);
          } else { G.log.unshift({ item: s.item, v: "passed" }); G.slots[i] = { s: "empty" }; }
          drawSlot(i); changed = true;
        } else if ((s.s === "hit" || s.s === "missed" || s.s === "wrong") && t >= s.until) { G.slots[i] = { s: "empty" }; drawSlot(i); }
      });
      if (G.di < G.deck.length && t >= G.nextAt) {
        const st = STAGES[stageAt(t) - 1], liveIds = new Set(G.slots.filter(s => s.s === "live").map(s => s.item.id));
        const free = G.slots.map((s, i) => s.s === "empty" ? i : -1).filter(i => i >= 0);
        G.nextAt += st.every;
        if (free.length && liveIds.size < st.cap) {
          let item = G.deck[G.di];
          if (liveIds.has(item.id)) { const j = G.deck.findIndex((d, k) => k > G.di && d.real === item.real && !liveIds.has(d.id)); if (j > 0) { [G.deck[G.di], G.deck[j]] = [G.deck[j], G.deck[G.di]]; item = G.deck[G.di]; } }
          if (!liveIds.has(item.id)) {
            const i = free[Math.floor(rnd() * free.length)];
            G.slots[i] = { s: "live", item, born: t, life: st.life }; G.di++; if (item.real) G.dealt.add(item.id); drawSlot(i);
          }
        }
      }
      if (changed) { hud(); drawLog(); }
      G.slots.forEach((s, i) => { if (s.s !== "live") return; const left = Math.max(0, 1 - (t - s.born) / s.life), b = slotEl(i); b.querySelector(".timer i").style.width = (left * 100).toFixed(1) + "%"; b.classList.toggle("late", left < 0.3); });
      el.querySelector("#wia-clock").style.width = Math.min(100, t / SHIFT * 100).toFixed(1) + "%";
      const left = Math.max(0, Math.ceil(SHIFT - t)); el.querySelector("#wia-left").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      if (t >= SHIFT) end();
    }
    function tap(i) {
      if (!G || G.over || G.paused || G.count > 0 || phase !== "shift") return;
      const s = G.slots[i]; if (s.s !== "live") return;   // an empty slot does nothing
      const item = s.item;
      if (item.real) {
        G.knew.add(item.id);
        G.slots[i] = { s: "hit", item, until: G.t + FLASH }; G.log.unshift({ item, v: "known", ok: true });
      } else {
        G.blown++; G.tapped.push(item);
        G.slots[i] = { s: "wrong", item, until: G.t + FLASH }; G.log.unshift({ item, v: "filler" });
        feedback("filler", item); say(`Filler. ${item.name}.`);
      }
      drawSlot(i); hud(); drawLog();
    }
    function end() {
      if (G.over) return;
      G.over = true; cancelAnimationFrame(S.raf);
      const missed = pool.asks.filter(a => !G.knew.has(a.id)), ranOut = missed.filter(a => G.ranOut.has(a.id)).length;
      const atBell = missed.filter(a => !G.ranOut.has(a.id) && G.dealt.has(a.id)).length, after = missed.length - ranOut - atBell;
      const parts = [ranOut && `${words(ranOut)} ran out on the board`, atBell && `${words(atBell)} ${atBell === 1 ? "was" : "were"} still on the board at the end`, after && `${words(after)} never came up`].filter(Boolean);
      results({ mode: "shift", knew: G.knew.size, blown: G.blown, tapped: G.tapped, missed, eyebrow: "Speed round over", missedLine: parts.length ? cap1(parts.join("; ")) + "." : "" });
      say(`Round over. You knew ${G.knew.size} of ${pool.asks.length}.`);
    }

    // ---------- 05 the boards (untimed) ----------
    function steady() {
      phase = "steady"; F.set({ round: 0, rounds: 3, role: pool.label });
      SD = { boards: steadyBoards(pool, rnd), b: 0, picked: new Set(), shown: false, knew: new Set(), blown: 0, seen: 0, tapped: [], focus: 0, marks: [] };
      drawSteady(); el.querySelector('#wia-board [data-i="0"]').focus();
    }
    function drawSteady() {
      const tiles = SD.boards[SD.b], n = SD.b + 1, shown = SD.shown;
      const realN = tiles.filter(t => t.real).length, got = tiles.filter((t, i) => t.real && SD.picked.has(i)).length, wrong = tiles.filter((t, i) => !t.real && SD.picked.has(i));
      F.set({ round: SD.b, rounds: 3, marks: SD.marks });
      const tile = (t, i) => {
        const p = SD.picked.has(i), cls = !shown ? (p ? " picked" : "") : t.real ? (p ? " picked" : " gap") : (p ? " wrong" : " passed");
        const rev = !shown ? "" : t.real ? (p ? `<span class="rev">Real ask · ${blue(t.share)}</span>` : `<span class="rev wia-amber">Missed · ${blue(t.share)} ask for it</span>`) : `<span class="rev">Filler · ${blue(t.share)} · ${esc(t.whereLabel)} ${blue(t.whereShare)}</span>`;
        const said = !shown ? t.name : `${t.name}. ${t.real ? (p ? "Real ask, you picked it" : "Real ask you left") : (p ? "Filler you picked" : "Filler you let pass")}, ${pct(t.share)} of postings${t.real ? "" : `, ${t.whereLabel} ${pct(t.whereShare)}`}`;
        return `<button type="button" class="wia-tile${cls}" data-i="${i}" aria-pressed="${p}" aria-label="${esc(said)}" ${shown ? 'aria-disabled="true"' : ""} tabindex="${i === SD.focus ? 0 : -1}"><span class="wia-check" aria-hidden="true"></span><span class="name">${esc(t.name)}</span>${rev}</button>`;
      };
      const side = !shown ? `<h3>Board ${n} of 3</h3><p class="small muted" style="margin:0">Pick every skill that at least 40% of ${esc(pool.label)} postings ask for. Leave the filler: skills other roles ask for.</p>
          <p class="small muted" id="wia-picked">Picked: <span class="wia-num wia-fg">${SD.picked.size}</span></p>`
        : `<h3>Board ${n}: ${got} of ${realN} real asks</h3>
          <p class="small muted" style="margin:0">${wrong.length ? `You picked ${wrong.length === 1 ? "one piece" : words(wrong.length) + " pieces"} of filler. <b class="wia-amber" style="font-weight:500">${esc(wrong[0].name)}</b> is asked by ${blue(wrong[0].share)} of ${esc(pool.label)} postings and ${blue(wrong[0].whereShare)} of ${esc(wrong[0].whereLabel)} postings.` : "You picked no filler on this board."}</p>
          <div class="wia-legend"><div><span class="lg-pick"></span>You picked a real ask</div><div><span class="lg-gap"></span>A real ask you left</div><div><span class="lg-wrong"></span>Filler you picked</div><div><span class="lg-pass"></span>Filler you let pass</div></div>
          <p class="gm-key">Percentages: the share of ${esc(pool.label)} postings that ask.</p>`;
      view.innerHTML = `<div class="wia-steady"><section>
          <div class="wia-hud" style="grid-template-columns:1fr auto"><div><div class="role">${esc(pool.label)}</div><div class="sub">Board ${n} of 3 · ${shown ? "handed in" : "pick the real asks"}</div></div>
            <div class="stat"><span class="l">So far</span><span class="v">${SD.seen ? `${SD.knew.size} <span class="subtle wia-of">of ${SD.seen}</span>` : "–"}</span></div></div>
          <div class="wia-board" id="wia-board" role="group" aria-label="Board ${n}${shown ? ", answers shown" : ""}">${tiles.map(tile).join("")}</div></section>
        <aside class="wia-side" aria-label="Board ${n}">${side}</aside></div>
        ${!shown ? GS.foot({ primary: { id: "wia-hand", label: `Hand in board ${n}`, key: "Enter" } }) : GS.foot({ primary: { id: "wia-next", label: n < 3 ? "Next board" : "See how you did", key: "Enter" } })}`;
      const board = el.querySelector("#wia-board");
      board.onclick = e => { const b = e.target.closest("[data-i]"); if (!b || SD.shown) return; const i = +b.dataset.i; SD.focus = i; SD.picked.has(i) ? SD.picked.delete(i) : SD.picked.add(i); b.setAttribute("aria-pressed", SD.picked.has(i)); b.classList.toggle("picked", SD.picked.has(i)); el.querySelector("#wia-picked .wia-num").textContent = SD.picked.size; };
      board.onkeydown = e => {
        if (e.key === "Enter") { e.preventDefault(); SD.shown ? nextBoard() : handIn(); return; }   // Enter hands in, even from a tile
        const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key]; if (d == null) return;
        const cell = e.target.closest("[data-i]"), i = cell ? +cell.dataset.i : 0, j = i + d; if (j < 0 || j >= CELLS || (Math.abs(d) === 1 && Math.floor(j / 4) !== Math.floor(i / 4))) return;
        e.preventDefault(); SD.focus = j; board.querySelectorAll("[data-i]").forEach(b => b.tabIndex = +b.dataset.i === j ? 0 : -1); board.querySelector(`[data-i="${j}"]`).focus();
      };
      if (!shown) el.querySelector("#wia-hand").onclick = handIn; else { el.querySelector("#wia-next").onclick = nextBoard; el.querySelector("#wia-next").focus(); }
    }
    function handIn() {
      if (SD.shown) return;
      const tiles = SD.boards[SD.b];
      tiles.forEach((t, i) => { if (t.real) { SD.seen++; if (SD.picked.has(i)) SD.knew.add(t.id); } else if (SD.picked.has(i)) { SD.blown++; SD.tapped.push(t); } });
      const got = tiles.filter((t, i) => t.real && SD.picked.has(i)).length, wrong = tiles.filter((t, i) => !t.real && SD.picked.has(i)).length, realN = tiles.filter(t => t.real).length;
      SD.marks[SD.b] = got * 2 >= realN && wrong <= 2 ? "ok" : "miss";
      SD.shown = true; drawSteady();
      say(`Board ${SD.b + 1}: ${got} of ${realN} real asks. ${wrong ? `${cap1(words(wrong))} filler picked.` : "No filler picked."}`);
    }
    function nextBoard() {
      if (!SD.shown) return;
      if (SD.b < 2) { SD.b++; SD.picked = new Set(); SD.shown = false; SD.focus = 0; drawSteady(); el.querySelector('#wia-board [data-i="0"]').focus(); return; }
      phase = "over";
      const missed = pool.asks.filter(a => !SD.knew.has(a.id));
      results({ mode: "steady", knew: SD.knew.size, blown: SD.blown, tapped: SD.tapped, missed, eyebrow: "Three boards handed in", missedLine: missed.length ? `${cap1(words(missed.length))} ${missed.length === 1 ? "was" : "were"} left on the boards.` : "" });
    }

    // ---------- 03 the result: the measure in plain words, the change since last time, the ones you missed ----------
    function results(R) {
      phase = "over";
      const total = pool.asks.length, rec = { knew: R.knew, total, blown: R.blown, date: new Date().toISOString().slice(0, 10) };
      const sv = saved(), all = sv.best, prev = (all[pool.id] || {})[R.mode], isNew = better(rec, prev), prevLast = (all[pool.id] || {}).lastKnew;
      const cleanNow = R.mode === "steady" && R.knew * 2 >= total && R.blown <= 2 && !sv.clean;
      all[pool.id] = { ...(all[pool.id] || {}), lastKnew: R.knew, ...(isNew ? { [R.mode]: rec } : {}) };
      GS.record.saveGame(SLUG, { played: true, best: all, clean: sv.clean || cleanNow });
      const chips = R.missed.map(a => `<span class="wia-chip">${esc(a.name)} <span class="p">${pct(a.share)}</span></span>`).join("");
      const wrong = R.tapped.filter((f, i, a) => a.findIndex(x => x.id === f.id) === i).map(f => `<span class="wia-chip wrong">${esc(f.name)} <span class="p">${pct(f.share)}</span> <span class="muted">· ${esc(f.whereLabel)} ${blue(f.whereShare)}</span></span>`).join("");
      const change = prevLast == null ? "Your first round on this role." : R.knew > prevLast ? `Up from ${prevLast} last time.` : R.knew < prevLast ? `Down from ${prevLast} last time.` : "The same as last time.";
      const line = `${change}${isNew && prev ? " A new best." : prev ? ` Your best: <b>${esc(bestLine(prev))}</b>.` : ""}${R.mode === "shift" ? " A Speed round." : cleanNow ? " The Speed round is unlocked." : ""}`;
      F.set({ round: R.mode === "steady" ? 3 : 1, rounds: R.mode === "steady" ? 3 : 1, marks: R.mode === "steady" ? SD.marks : [R.knew * 2 >= total ? "ok" : "miss"] });
      view.innerHTML = GS.results({
        eyebrow: `${esc(R.eyebrow)} · ${esc(pool.label)}`,
        measure: `You knew ${R.knew} of the ${total} skills ${esc(pool.label)} postings ask for`,
        record: line,
        takeaway: `${R.blown ? `You picked ${words(R.blown)} ${R.blown === 1 ? "piece" : "pieces"} of filler. ` : "You picked no filler. "}${PUNCH}`,
        visual: `${chips ? `<h3>The ones you missed</h3><div class="wia-chips">${chips}</div><p class="gm-key">${esc(R.missedLine)} Percentages are the share of ${esc(pool.label)} postings that ask.</p>` : `<h3>You missed none</h3>`}
          ${wrong ? `<h3 style="margin-top:14px">Filler you ${R.mode === "shift" ? "tapped" : "picked"}</h3><div class="wia-chips">${wrong}</div>` : ""}`,
        link: { href: `#/role/${encodeURIComponent(pool.id)}`, label: `Open ${pool.label}` },
        foot: GS.foot({ primary: { id: "wia-again", label: "Play again", key: "Enter" }, quiet: { href: HOME, label: "Another role" } }),
      });
      el.querySelector("#wia-again").onclick = () => intro();
      F.focusMeasure();
    }

    function debugPools(P) {
      phase = "debug";
      const rows = Object.values(P).map(v => `<tr><td>${esc(v.id)}</td><td>${v.set}</td><td>${v.n}</td><td>${v.asks.length}</td><td>${v.asks.filter(a => a.generic).length}</td><td>${v.filler.length}</td><td>${pct(v.fillerMax)}</td><td>${v.filler.filter(f => f.sameField).length}</td><td>${v.small}</td></tr>`).join("");
      view.innerHTML = `<section class="wia-card"><p class="wia-eyebrow">${TITLE} · Pools</p><table class="wia-debug" id="wia-pools"><thead><tr><th>role</th><th>set</th><th>postings</th><th>asks</th><th>generic</th><th>filler</th><th>fillerMax</th><th>sameField</th><th>small</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    }

  }

  window.Games = window.Games || {};
  window.Games[SLUG] = { mount };
})();
