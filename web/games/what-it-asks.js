/* What does it ask for (#/play/what-it-asks): skills pop up on a 4 by 4 board; tap what the role's postings really ask
   for, let the filler pass. Spec: games/what-it-asks/README.md. Pools mirror games/what-it-asks/pools.js through
   web/atlas.js. Registers window.Games["what-it-asks"] = { mount }; play() in app.js calls it. Params after "?" in the
   hash: role=<id> (skip the picker), mode=shift|steady, seed=<integer> (a fixed deal), debug=pools (the pool counts). */
(function () {
  "use strict";
  const SLUG = "what-it-asks", TITLE = "What does it ask for", HOME = "#/play/" + SLUG;
  // a real ask is 40% of postings: next to Atlas.TIER (core 0.5, common 0.25, some 0.1), its own cut for this game
  const RULE = { ask: 0.40, filler: 0.10, fillerWide: 0.15, minFiller: 14, elsewhere: 0.40, lift: 2 };
  const SHIFT = 50, FIRST = 0.3, LAST_REAL = 66, MIN_REAL = 21, LIVES = 3, CELLS = 16, FLASH = 0.6, FRESH = 2;
  const STAGES = [{ until: 10, every: 1.10, life: 4.0, cap: 5 }, { until: 25, every: 0.85, life: 3.4, cap: 7 }, { until: 40, every: 0.65, life: 2.9, cap: 9 }, { until: 50, every: 0.50, life: 2.5, cap: 10 }];
  const stageAt = t => STAGES.findIndex(s => t < s.until) + 1 || 4;
  const SCHEDULE = (() => { const out = []; for (let t = FIRST; t < SHIFT; t += STAGES[stageAt(t) - 1].every) out.push(t); return out; })();   // 70 spawns
  const KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "KeyQ", "KeyW", "KeyE", "KeyR", "KeyA", "KeyS", "KeyD", "KeyF", "KeyZ", "KeyX", "KeyC", "KeyV"];
  const LABEL = "1234QWERASDFZXCV".split("");
  const RANKS = [["applicant", "Applicant", "under 40%"], ["shortlisted", "Shortlisted", "40%"], ["interview", "Interview", "65%"], ["offer", "Offer", "85%, 2 blown at most"]];
  const PUNCH = "Postings change every week. Nobody keeps up by hand.";
  const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const words = n => WORDS[n] || String(n), cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
  const pct = v => Math.round(v * 100) + "%", fmt = n => Number(n).toLocaleString("en-US");
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
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

  // ---------- rank and bests ----------
  function rankOf(knew, total, blown) {
    const r = total ? knew / total : 0;
    return r >= 0.85 && blown <= 2 ? "offer" : r >= 0.65 && blown <= 4 ? "interview" : r >= 0.40 ? "shortlisted" : "applicant";
  }
  const rankIx = id => RANKS.findIndex(r => r[0] === id), rankLabel = id => (RANKS[rankIx(id)] || RANKS[0])[1];
  const better = (a, b, mode) => { if (!b) return true; const d = rankIx(a.rank) - rankIx(b.rank); if (d) return d > 0; const q = a.knew / a.total - b.knew / b.total; if (Math.abs(q) > 1e-9) return q > 0; return mode === "shift" && a.score > b.score; };
  const bestLine = b => b ? `${rankLabel(b.rank)}, ${b.knew} of ${b.total}` : "";

  // ---------- the mount ----------
  let current = null;
  async function mount(el, ctx) {
    if (current && current.alive) current.cleanup();
    const { Atlas, crumbs } = ctx, esc = ctx.esc;
    const S = { alive: true, timers: new Set(), listeners: [], raf: 0 };
    current = S;
    const on = (t, type, fn) => { t.addEventListener(type, fn); S.listeners.push([t, type, fn]); };
    const later = (fn, ms) => { const id = setTimeout(() => { S.timers.delete(id); if (S.alive) fn(); }, ms); S.timers.add(id); };
    S.cleanup = () => { S.alive = false; cancelAnimationFrame(S.raf); S.timers.forEach(clearTimeout); S.listeners.forEach(([t, ty, fn]) => t.removeEventListener(ty, fn)); if (current === S) el.classList.remove("wia-main"); };
    on(window, "hashchange", S.cleanup);   // leaving the route ends the shift without saving
    el.classList.add("wia-main");
    el.innerHTML = `<div class="wia-view"></div><div class="wia-sr" aria-live="polite" id="wia-live"></div>`;   // one live region, for outcomes only
    const view = el.firstElementChild;

    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const seed0 = /^-?\d+$/.test(params.get("seed") || "") ? Number(params.get("seed")) : Math.floor(Math.random() * 2 ** 31);
    let plays = 0, rnd = mulberry32(seed0);
    let mode = ["shift", "steady"].includes(params.get("mode")) ? params.get("mode") : store.get("wia-mode") === "steady" ? "steady" : "shift";
    let phase = "load", G = null, SD = null;
    const say = msg => { const n = el.querySelector("#wia-live"); if (n) { n.textContent = ""; later(() => { n.textContent = msg; }, 30); } };
    const bests = () => store.get("wia-best-v1") || {};
    const blue = v => `<span class="wia-blue wia-num">${pct(v)}</span>`;

    // ---------- keys, pause on blur ----------
    on(document, "keydown", e => {
      const tg = e.target, tag = (tg && tg.tagName) || "";
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (tg && tg.isContentEditable) || e.ctrlKey || e.metaKey || e.altKey) return;
      const own = tag !== "A" && (tag !== "BUTTON" || /^wia-(go|again|hand|next)$/.test(tg.id) || !!tg.closest("#wia-board"));   // Enter on other links and buttons keeps its own meaning
      if (phase === "shift") {
        if (e.key === "Escape") { e.preventDefault(); pause(!G.paused); return; }
        const i = KEYS.indexOf(e.code); if (i >= 0 && !e.repeat) { e.preventDefault(); tap(i); }
      } else if ((phase === "intro" || phase === "over") && e.key === "Enter" && own) { e.preventDefault(); begin(); }
      else if (phase === "steady" && e.key === "Enter" && own) { e.preventDefault(); SD.shown ? nextBoard() : handIn(); }
    });
    on(window, "blur", () => pause(true));
    on(document, "visibilitychange", () => { if (document.hidden) pause(true); });

    const ix = await Atlas.index(); if (!S.alive) return;
    const productP = pools(Atlas);   // starts the product file now; the picker shows the MBA fields meanwhile
    productP.catch(() => { });

    if (params.get("debug") === "pools") return debugPools(await productP);
    const roleId = params.get("role");
    if (!roleId) return picker();
    if (!ix.roles[roleId] && !(await productP.then(p => p[roleId], () => null))) { if (S.alive) picker(`There is no role called “${roleId}”. Pick one below.`); return; }
    view.innerHTML = `<p class="subtle">Loading the role…</p>`;
    const P = await productP; if (!S.alive) return;
    const pool = P[roleId];
    if (!pool) return picker(`There is no role called “${roleId}”. Pick one below.`);
    return intro();

    // ---------- 04 pick a role ----------
    function picker(notice) {
      phase = "pick"; crumbs([["Games", "#/"], [TITLE, null]]);
      const you = store.get("you"), mine = ((you && you.fields) || []).find(f => ix.groups.some(g => g.id === f));
      let field = mine || ix.groups[0].id, P = null;
      const draw = () => {
        const b = bests(), g = ix.groups.find(x => x.id === field), loading = !P;
        const ids = (g.roles || []).filter(id => ix.roles[id]).sort((a, c) => ix.roles[c].nOpen - ix.roles[a].nOpen);
        const row = id => {
          const r = ix.roles[id], p = P && P[id], best = b[id] && (b[id].shift || b[id].steady);
          const m = r.small ? `<span class="small-n">A small sample: ${fmt(r.n)} postings in all. The shares can move a lot week to week.</span>` : best ? `<span class="best">Your best: ${esc(bestLine(best))}${b[id].shift ? "" : " (Steady)"}</span>` : "Not played yet";
          return `<a class="r" href="${HOME}?role=${encodeURIComponent(id)}"><span class="t">${esc(r.label)}</span><span class="n">${p ? `${p.asks.length} skills to know · ` : ""}${fmt(r.nOpen)} open</span><span class="m">${m}</span></a>`;
        };
        view.innerHTML = `<section class="wia-card wia-pick">
          <p class="wia-eyebrow">${TITLE}</p><h1>Pick a role, then work its shift</h1>
          <p class="lead">Each shift deals the skills one role's postings ask for, mixed with filler from other roles. About 50 seconds. There is a gentler mode with no clock.</p>
          ${notice ? `<p class="small wia-amber">${esc(notice)}</p>` : ""}
          <div class="chips" style="margin-top:18px" role="group" aria-label="Field"><span class="lbl">Field</span>${ix.groups.map(x => `<button class="chip${x.id === field ? " on" : ""}" type="button" data-field="${esc(x.id)}" aria-pressed="${x.id === field}">${esc(x.label)}<span class="n">${x.id === "product" && loading ? "…" : (x.roles || []).length}</span></button>`).join("")}</div>
          ${loading ? `<p class="small subtle" style="margin:0">Loading product roles</p>` : ""}
          <div class="list" style="margin-top:14px">${ids.map(row).join("") || `<p class="small subtle" style="padding:11px 0;margin:0">${loading ? "Loading product roles" : "No roles here yet."}</p>`}</div>
          <div class="row" style="margin-top:18px"><button class="btn" type="button" id="wia-surprise">Surprise me</button><span class="small subtle">A skill to know: at least 40% of the role's postings ask for it.</span></div></section>`;
        el.querySelectorAll("[data-field]").forEach(bt => bt.onclick = () => { field = bt.dataset.field; draw(); el.querySelector(`[data-field="${CSS.escape(field)}"]`).focus(); });
        el.querySelector("#wia-surprise").onclick = () => {
          const ids = Object.values(ix.roles).filter(r => !r.small && (P ? P[r.id] : r.set === "mba")).map(r => r.id);
          location.hash = `${HOME}?role=${encodeURIComponent(ids[Math.floor(Math.random() * ids.length)])}`;
        };
      };
      draw();
      productP.then(p => { if (S.alive && phase === "pick") { P = p; const f = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.field; draw(); if (f) el.querySelector(`[data-field="${CSS.escape(f)}"]`).focus(); } }, () => { });
    }

    // ---------- 01 how it works ----------
    function examples() {
      const strong = pool.asks.filter(a => !a.generic).slice(0, 2);
      const far = pool.filler.filter(f => f.diff === 0).sort((a, b) => a.share - b.share || b.whereShare - a.whereShare)[0] || pool.filler[pool.filler.length - 1];
      const near = pool.filler.filter(f => f.sameField)[0] || pool.filler.filter(f => f.diff === 1 && f !== far)[0] || pool.filler.find(f => f !== far);
      const field = (ix.groups.find(g => g.id === pool.group) || {}).label || "";
      const tile = (k, s, w) => `<div class="wia-tile${w < 0.3 ? " late" : ""}" aria-hidden="true"><span class="k wia-key">${k}</span><span class="name">${esc(s.name)}</span><span class="timer"><i style="width:${Math.round(w * 100)}%"></i></span></div>`;
      const out = strong.map((a, i) => `<div class="wia-ex">${tile(i + 1, a, i ? 0.52 : 0.78)}<span class="verdict wia-green">Tap</span><span class="why">${blue(a.share)} ${i ? `ask for it.${a.share < 0.7 ? " Not every posting, still a real ask." : ""}` : `of ${esc(pool.label)} postings ask for it.`}</span></div>`);
      if (far) out.push(`<div class="wia-ex">${tile(out.length + 1, far, 0.64)}<span class="verdict">Let it pass</span><span class="why">${blue(far.share)} here. ${blue(far.whereShare)} of ${esc(far.whereLabel)} postings.</span></div>`);
      if (near) out.push(`<div class="wia-ex">${tile(out.length + 1, near, 0.22)}<span class="verdict">Let it pass</span><span class="why">${near.sameField ? `Sounds like ${esc(field.toLowerCase())}.` : "Sounds plausible."} ${blue(near.share)} here, ${blue(near.whereShare)} of ${esc(near.whereLabel)} postings.</span></div>`);
      return out.join("");
    }
    function intro() {
      phase = "intro"; crumbs([["Games", "#/"], [TITLE, HOME], [pool.label, null]]);
      const b = (bests()[pool.id] || {})[mode], few = pool.asks.length <= 12;
      view.innerHTML = `<section class="wia-card">
        <p class="wia-eyebrow">${TITLE} · How it works</p>
        <h1>Tap what ${esc(pool.label)} postings ask for</h1>
        <p class="lead">Skills pop up on a 4 by 4 board, each with a timer. Some are what ${esc(pool.label)} postings really ask for. The rest is filler: skills that other roles ask for and ${esc(pool.label)} postings rarely do.</p>
        ${few ? `<p class="small wia-amber" style="margin:0">${esc(pool.label)} postings agree on few skills: ${pool.asks.length} reach 40%. Expect to see them twice.</p>` : ""}
        ${pool.small ? `<p class="small subtle" style="margin:0">A small sample: ${fmt(pool.n)} postings in all. The shares can move a lot week to week.</p>` : ""}
        <div class="wia-examples">${examples()}</div>
        <div class="wia-rules">
          <p>A real ask is one that at least 40% of the role's postings name. Filler is ${pct(pool.fillerMax)} or fewer.</p>
          <p>Blow a slot and it stays blown. A wrong tap closes that square for the rest of the shift.</p>
          <p>Let a real ask run out and you lose one of three lives.</p>
          <p>Five right in a row raises the multiplier, up to x4. The pace picks up as the shift goes on.</p>
        </div>
        <div class="wia-modes" role="group" aria-label="Mode">
          <button type="button" class="wia-mode${mode === "shift" ? " on" : ""}" data-mode="shift" aria-pressed="${mode === "shift"}"><div class="t">Shift <span class="wia-num subtle">50 s</span></div><div class="d">Timers, lives, a multiplier. Keys 1–4, Q–R, A–F, Z–V tap the four rows.</div></button>
          <button type="button" class="wia-mode${mode === "steady" ? " on" : ""}" data-mode="steady" aria-pressed="${mode === "steady"}"><div class="t">Steady <span class="wia-num subtle">no clock</span></div><div class="d">Three boards of 16. Pick the real asks, then hand in. Works with a screen reader.</div></button>
          <div class="wia-start"><button type="button" class="btn primary" id="wia-go">${mode === "shift" ? "START SHIFT" : "START STEADY"}</button><a class="btn quiet" href="${HOME}" style="justify-content:center;padding-left:14px">Change role</a></div>
        </div>
        ${reduced() && mode === "shift" ? `<p class="small muted" style="margin:10px 0 0">Prefer no clock? Try Steady.</p>` : ""}
        <p class="wia-foot">From ${fmt(pool.n)} ${esc(pool.label)} postings at ${fmt(pool.nCompanies)} companies, read ${pool.date}. ${pool.asks.length} skills reach 40% of them. Your best for this role: ${b ? esc(bestLine(b)) + (mode === "shift" ? `, score ${fmt(b.score)}` : "") : `no ${mode === "shift" ? "shift" : "Steady round"} yet`}.</p>
      </section>`;
      el.querySelectorAll("[data-mode]").forEach(bt => bt.onclick = () => { mode = bt.dataset.mode; store.set("wia-mode", mode); intro(); el.querySelector(`[data-mode="${mode}"]`).focus(); });
      el.querySelector("#wia-go").onclick = begin;
    }
    function begin() { rnd = mulberry32(seed0 + plays++); return mode === "shift" ? shift() : steady(); }

    // ---------- 02 the shift ----------
    function shift() {
      phase = "shift"; crumbs([["Games", "#/"], [TITLE, HOME], [pool.label, null]]);
      G = { t: 0, count: reduced() ? 0 : 3, paused: false, deck: deal(pool, rnd), di: 0, nextAt: SCHEDULE[0], slots: Array.from({ length: CELLS }, () => ({ s: "empty" })), lives: LIVES, score: 0, streak: 0, bestStreak: 0, blown: 0, knew: new Set(), dealt: new Set(), ranOut: new Set(), tapped: [], log: [], reset: "", over: false };
      view.innerHTML = `<div class="wia-shift">
        <section class="wia-play">
          <div class="wia-hud"><div><div class="role">${esc(pool.label)}</div><div class="sub">Shift · tap what its postings ask for</div></div>
            <div class="stat"><span class="l">Score</span><span class="v" id="wia-score"></span></div>
            <div class="stat"><span class="l">Lives</span><span class="wia-lives" id="wia-lives" role="img"></span></div>
            <div class="stat"><span class="l">Left</span><span class="v" id="wia-left">0:50</span></div></div>
          <div class="wia-clock" aria-hidden="true"><i id="wia-clock" style="width:0%"></i></div>
          <div class="wia-stage"><div class="wia-board" id="wia-board" role="group" aria-label="Board">${LABEL.map((k, i) => `<button type="button" class="wia-tile empty" data-i="${i}" disabled></button>`).join("")}</div>
            <div class="wia-over-board" id="wia-overlay" hidden></div></div>
          <div class="wia-feedback calm" id="wia-feedback"></div>
        </section>
        <aside class="wia-side" aria-label="Calls so far"><h3>Calls so far</h3><div class="wia-log" id="wia-log"></div><div class="keys" id="wia-keys"></div></aside></div>`;
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
      const s = G.slots[i], b = slotEl(i), k = `<span class="k wia-key" aria-hidden="true">${LABEL[i]}</span>`, anim = !reduced();
      if (!b) return;
      b.disabled = s.s !== "live"; b.removeAttribute("aria-label");
      if (s.s === "empty") { b.className = "wia-tile empty"; b.innerHTML = k; b.setAttribute("aria-label", `${LABEL[i]}: empty`); }
      else if (s.s === "live") { b.className = "wia-tile" + (anim ? " pop" : ""); b.innerHTML = `${k}<span class="name">${esc(s.item.name)}</span><span class="timer"><i></i></span>`; b.setAttribute("aria-label", `${LABEL[i]}: ${s.item.name}`); }
      else if (s.s === "hit") { b.className = "wia-tile hit" + (anim ? " flash" : ""); b.innerHTML = `${k}<span class="name">${esc(s.item.name)}</span><span class="meta"><span class="pts">+${fmt(s.pts)}</span> · ${blue(s.item.share)} of postings</span>`; }
      else if (s.s === "missed") { b.className = "wia-tile missed"; b.innerHTML = `${k}<span class="name">${esc(s.item.name)}</span><span class="meta wia-amber">Missed · ${blue(s.item.share)} ask for it</span>`; }
      else if (s.s === "blown") { b.className = "wia-tile blown" + (s.old ? " old" : anim ? " shake" : ""); b.innerHTML = s.old ? `${k}<span class="name">Blown</span><span class="meta wia-amber">Closed for this shift</span>` : `${k}<span class="name">${esc(s.item.name)}</span><span class="meta wia-amber">Filler. Slot blown.</span>`; b.setAttribute("aria-label", `${LABEL[i]}: blown`); }
    }
    function hud() {
      const m = Math.min(4, 1 + Math.floor(G.streak / 5));
      el.querySelector("#wia-score").innerHTML = `${fmt(G.score)}<span class="wia-mult">x${m}</span>`;
      const L = el.querySelector("#wia-lives"); L.innerHTML = Array.from({ length: LIVES }, (_, i) => `<i class="wia-life${i < G.lives ? "" : " lost"}"></i>`).join(""); L.setAttribute("aria-label", `${G.lives} of ${LIVES} lives left`);
      el.querySelector("#wia-keys").innerHTML = `Streak <span class="wia-num wia-fg">${G.streak}</span>${G.streak === 0 && G.reset ? `, reset by ${G.reset}` : ""} · best <span class="wia-num wia-fg">${G.bestStreak}</span><br>Keys <span class="wia-key">1</span> <span class="wia-key">2</span> <span class="wia-key">3</span> <span class="wia-key">4</span> top row, then Q–R, A–F, Z–V<br><span class="wia-key">Esc</span> pauses`;
    }
    function drawLog() {
      el.querySelector("#wia-log").innerHTML = G.log.slice(0, 8).map(e => `<div class="e"><span class="t">${esc(e.item.name)}</span><span class="v ${e.v === "passed" ? "subtle" : e.ok ? "wia-green" : "wia-amber"}">${e.v}</span><span class="m">${e.item.real ? `Real ask · ${blue(e.item.share)}` : `Filler · ${blue(e.item.share)} here`}</span></div>`).join("");
    }
    function feedback(kind, item) {
      const f = el.querySelector("#wia-feedback");
      if (!kind) { f.className = "wia-feedback calm"; f.innerHTML = `<span>Tap what ${esc(pool.label)} postings ask for. Let the rest pass.</span>`; return; }
      f.className = "wia-feedback";
      f.innerHTML = kind === "filler" ? `<b>Filler. That slot is gone.</b><span>${blue(item.share)} of ${esc(pool.label)} postings ask for ${esc(item.name)}; ${blue(item.whereShare)} of ${esc(item.whereLabel)} postings do.</span>`
        : `<b>Missed. ${cap1(words(G.lives))} ${G.lives === 1 ? "life" : "lives"} left.</b><span>${blue(item.share)} of ${esc(pool.label)} postings ask for ${esc(item.name)}.</span>`;
    }
    function overlay() {
      const o = el.querySelector("#wia-overlay"), board = el.querySelector("#wia-board");
      if (G.paused) { board.classList.add("hidden-board"); o.hidden = false; o.innerHTML = `<div class="wia-pause"><p class="wia-eyebrow">Paused</p><p class="muted">The board is hidden while the shift is paused.</p><button type="button" class="btn primary" id="wia-resume">Resume</button><p class="small subtle" style="margin:8px 0 0"><span class="wia-key">Esc</span> resumes</p></div>`; el.querySelector("#wia-resume").onclick = () => pause(false); el.querySelector("#wia-resume").focus(); return; }
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
            G.lives--; G.streak = 0; G.reset = "a missed ask"; G.ranOut.add(s.item.id);
            G.log.unshift({ item: s.item, v: "missed" }); Object.assign(s, { s: "missed", until: t + FLASH });
            feedback("missed", s.item); say(`Missed. ${s.item.name}, ${pct(s.item.share)}. ${cap1(words(G.lives))} ${G.lives === 1 ? "life" : "lives"} left.`);
          } else { G.log.unshift({ item: s.item, v: "passed" }); G.slots[i] = { s: "empty" }; }
          drawSlot(i); changed = true;
        } else if ((s.s === "hit" || s.s === "missed") && t >= s.until) { G.slots[i] = { s: "empty" }; drawSlot(i); }
        else if (s.s === "blown" && !s.old && t >= s.until) { s.old = true; drawSlot(i); }
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
      if (G.lives <= 0) end("lives"); else if (G.blown >= CELLS) end("slots"); else if (t >= SHIFT) end("time");
    }
    function tap(i) {
      if (!G || G.over || G.paused || G.count > 0 || phase !== "shift") return;
      const s = G.slots[i]; if (s.s !== "live") return;   // an empty or blown slot does nothing
      const item = s.item, m = Math.min(4, 1 + Math.floor(G.streak / 5));
      if (item.real) {
        const quick = 1 - (G.t - s.born) / s.life > 0.5, pts = (item.generic ? 50 : 100) * m + (quick ? 50 * m : 0);
        G.score += pts; G.streak++; G.bestStreak = Math.max(G.bestStreak, G.streak); G.knew.add(item.id);
        G.slots[i] = { s: "hit", item, pts, until: G.t + FLASH }; G.log.unshift({ item, v: "+" + fmt(pts), ok: true });
      } else {
        G.blown++; G.streak = 0; G.reset = "the wrong tap"; G.tapped.push(item);
        G.slots[i] = { s: "blown", item, until: G.t + FRESH }; G.log.unshift({ item, v: "blown" });
        feedback("filler", item); say(`Filler. Slot ${LABEL[i]} blown.`);
      }
      drawSlot(i); hud(); drawLog();
      if (G.blown >= CELLS) end("slots");
    }
    function end(reason) {
      if (G.over) return;
      G.over = true; cancelAnimationFrame(S.raf);
      if (G.lives > 0) G.score += 200 * G.lives;
      const missed = pool.asks.filter(a => !G.knew.has(a.id)), ranOut = missed.filter(a => G.ranOut.has(a.id)).length;
      const atBell = missed.filter(a => !G.ranOut.has(a.id) && G.dealt.has(a.id)).length, after = missed.length - ranOut - atBell;
      const when = `${Math.floor(G.t / 60)}:${String(Math.min(59, Math.floor(G.t % 60))).padStart(2, "0")}`;
      const parts = [ranOut && `${words(ranOut)} ran out on the board`, atBell && `${words(atBell)} ${atBell === 1 ? "was" : "were"} still on the board at the end`, after && `${words(after)} came after ${reason === "lives" ? "your last life" : reason === "slots" ? "the last slot blew" : "the shift ended"}`].filter(Boolean);
      results({ mode: "shift", knew: G.knew.size, blown: G.blown, score: G.score, streak: G.bestStreak, lives: G.lives, tapped: G.tapped, missed, eyebrow: reason === "lives" ? `out of lives at ${when}` : reason === "slots" ? `no slots left at ${when}` : "end of shift", missedLine: parts.length ? cap1(parts.join("; ")) + "." : "" });
      say(`Shift over. You knew ${G.knew.size} of ${pool.asks.length}.`);
    }

    // ---------- 05 steady ----------
    function steady() {
      phase = "steady"; crumbs([["Games", "#/"], [TITLE, HOME], [pool.label, null]]);
      SD = { boards: steadyBoards(pool, rnd), b: 0, picked: new Set(), shown: false, knew: new Set(), blown: 0, seen: 0, tapped: [], focus: 0 };
      drawSteady(); el.querySelector('#wia-board [data-i="0"]').focus();
    }
    function drawSteady() {
      const tiles = SD.boards[SD.b], n = SD.b + 1, shown = SD.shown;
      const realN = tiles.filter(t => t.real).length, got = tiles.filter((t, i) => t.real && SD.picked.has(i)).length, wrong = tiles.filter((t, i) => !t.real && SD.picked.has(i));
      const tile = (t, i) => {
        const p = SD.picked.has(i), cls = !shown ? (p ? " picked" : "") : t.real ? (p ? " picked" : " gap") : (p ? " wrong" : " passed");
        const rev = !shown ? "" : t.real ? (p ? `<span class="rev">Real ask · ${blue(t.share)}</span>` : `<span class="rev wia-amber">Missed · ${blue(t.share)} ask for it</span>`) : `<span class="rev">Filler · ${blue(t.share)} · ${esc(t.whereLabel)} ${blue(t.whereShare)}</span>`;
        const said = !shown ? t.name : `${t.name}. ${t.real ? (p ? "Real ask, you picked it" : "Real ask you left") : (p ? "Filler you picked" : "Filler you let pass")}, ${pct(t.share)} of postings${t.real ? "" : `, ${t.whereLabel} ${pct(t.whereShare)}`}`;
        return `<button type="button" class="wia-tile${cls}" data-i="${i}" aria-pressed="${p}" aria-label="${esc(said)}" ${shown ? 'aria-disabled="true"' : ""} tabindex="${i === SD.focus ? 0 : -1}"><span class="wia-check" aria-hidden="true"></span><span class="name">${esc(t.name)}</span>${rev}</button>`;
      };
      const side = !shown ? `<h3>Board ${n} of 3</h3><p class="small muted" style="margin:0">Pick every skill that at least 40% of ${esc(pool.label)} postings ask for. Leave the filler: skills other roles ask for.</p>
          <p class="small muted" id="wia-picked">Picked: <span class="wia-num wia-fg">${SD.picked.size}</span></p>
          <div class="keys"><button type="button" class="btn primary wia-wide" id="wia-hand">Hand in board ${n} →</button>Arrow keys move, <span class="wia-key">Space</span> picks, <span class="wia-key">Enter</span> hands in.</div>`
        : `<h3>Board ${n}: ${got} of ${realN} real asks</h3>
          <p class="small muted" style="margin:0">${wrong.length ? `You picked ${wrong.length === 1 ? "one piece" : words(wrong.length) + " pieces"} of filler. <b class="wia-amber" style="font-weight:500">${esc(wrong[0].name)}</b> is asked by ${blue(wrong[0].share)} of ${esc(pool.label)} postings and ${blue(wrong[0].whereShare)} of ${esc(wrong[0].whereLabel)} postings.` : "You picked no filler on this board."}</p>
          <div class="wia-legend"><div><span class="lg-pick"></span>You picked a real ask</div><div><span class="lg-gap"></span>A real ask you left</div><div><span class="lg-wrong"></span>Filler you picked</div><div><span class="lg-pass"></span>Filler you let pass</div></div>
          <p class="small muted">Percentages are the share of ${esc(pool.label)} postings that ask, from ${fmt(pool.n)} postings at ${fmt(pool.nCompanies)} companies, read ${pool.date}.</p>
          <div class="keys"><button type="button" class="btn primary wia-wide" id="wia-next">${n < 3 ? "Next board →" : "See how you did →"}</button><span class="wia-key">Enter</span> continues.</div>`;
      view.innerHTML = `<div class="wia-steady"><section>
          <div class="wia-hud" style="grid-template-columns:1fr auto"><div><div class="role">${esc(pool.label)}</div><div class="sub">Steady · board ${n} of 3 · ${shown ? "handed in" : "pick the real asks"}</div></div>
            <div class="stat"><span class="l">So far</span><span class="v">${SD.seen ? `${SD.knew.size} <span class="subtle wia-of">of ${SD.seen}</span>` : "–"}</span></div></div>
          <div class="wia-board" id="wia-board" role="group" aria-label="Board ${n}${shown ? ", answers shown" : ""}">${tiles.map(tile).join("")}</div></section>
        <aside class="wia-side" aria-label="Board ${n}">${side}</aside></div>`;
      const board = el.querySelector("#wia-board");
      board.onclick = e => { const b = e.target.closest("[data-i]"); if (!b || SD.shown) return; const i = +b.dataset.i; SD.focus = i; SD.picked.has(i) ? SD.picked.delete(i) : SD.picked.add(i); b.setAttribute("aria-pressed", SD.picked.has(i)); b.classList.toggle("picked", SD.picked.has(i)); el.querySelector("#wia-picked .wia-num").textContent = SD.picked.size; };
      board.onkeydown = e => {
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
      SD.shown = true; drawSteady();
      const got = tiles.filter((t, i) => t.real && SD.picked.has(i)).length, wrong = tiles.filter((t, i) => !t.real && SD.picked.has(i)).length;
      say(`Board ${SD.b + 1}: ${got} of ${tiles.filter(t => t.real).length} real asks. ${wrong ? `${cap1(words(wrong))} filler picked.` : "No filler picked."}`);
    }
    function nextBoard() {
      if (!SD.shown) return;
      if (SD.b < 2) { SD.b++; SD.picked = new Set(); SD.shown = false; SD.focus = 0; drawSteady(); el.querySelector('#wia-board [data-i="0"]').focus(); return; }
      phase = "over";
      const missed = pool.asks.filter(a => !SD.knew.has(a.id));
      results({ mode: "steady", knew: SD.knew.size, blown: SD.blown, tapped: SD.tapped, missed, eyebrow: "three boards handed in", missedLine: missed.length ? `${cap1(words(missed.length))} ${missed.length === 1 ? "was" : "were"} left on the boards.` : "" });
    }

    // ---------- 03 shift over ----------
    function results(R) {
      phase = "over";
      const total = pool.asks.length, rank = rankOf(R.knew, total, R.blown), ri = rankIx(rank);
      const rec = { rank, knew: R.knew, total, blown: R.blown, date: new Date().toISOString().slice(0, 10), ...(R.mode === "shift" ? { score: R.score, streak: R.streak } : {}) };
      const all = bests(), prev = (all[pool.id] || {})[R.mode], isNew = better(rec, prev, R.mode);
      if (isNew) { all[pool.id] = { ...(all[pool.id] || {}), [R.mode]: rec }; store.set("wia-best-v1", all); }
      const field = ix.groups.find(g => g.id === pool.group) || { label: "", roles: [] };
      const tappedSame = R.tapped.find(f => f.sameField && f.where !== pool.id);
      const door = [];
      if (tappedSame) door.push({ id: tappedSame.where, m: `Where ${tappedSame.name} belongs` });
      (field.roles || []).filter(id => ix.roles[id] && id !== pool.id && !ix.roles[id].small && !door.some(d => d.id === id)).sort((a, b) => ix.roles[b].nOpen - ix.roles[a].nOpen).slice(0, 2 - door.length)
        .forEach((id, k) => door.push({ id, m: `${fmt(ix.roles[id].nOpen)} open postings${k === 0 ? `, the most in ${field.label}` : ""}` }));
      const chips = R.missed.map(a => `<span class="wia-chip">${esc(a.name)} <span class="p">${pct(a.share)}</span></span>`).join("");
      const wrong = R.tapped.filter((f, i, a) => a.findIndex(x => x.id === f.id) === i).map(f => `<span class="wia-chip wrong">${esc(f.name)} <span class="p">${pct(f.share)}</span> <span class="muted">· ${esc(f.whereLabel)} ${blue(f.whereShare)}</span></span>`).join("");
      const stats = R.mode === "shift" ? [["Score", fmt(R.score)], ["Best streak", R.streak], ["Slots blown", R.blown, R.blown > 0], ["Lives left", R.lives]] : [["Boards", 3], ["Filler picked", R.blown, R.blown > 0]];
      const shown = isNew ? rec : prev;
      view.innerHTML = `<div class="wia-over"><section>
          <p class="wia-eyebrow">${R.mode === "shift" ? "Shift" : "Steady"} over · ${esc(pool.label)} · ${R.eyebrow}</p>
          <div class="wia-ladder" role="img" aria-label="Your rank: ${rankLabel(rank)}">${RANKS.map((r, i) => `<div class="s${i < ri ? " done" : i === ri ? " here" : ""}">${r[1]}<span class="c">${r[2]}</span></div>`).join("")}</div>
          <p class="wia-knew">You knew <span class="wia-green">${R.knew}</span> of the <span class="wia-blue">${total}</span> skills ${esc(pool.label)} postings ask for.</p>
          <div class="wia-stats">${stats.map(([l, v, amber]) => `<div><span class="l">${l}</span><span class="v${amber ? " wia-amber" : ""}">${v}</span></div>`).join("")}</div>
          ${chips ? `<h3 style="margin-top:16px">The ones you missed</h3><div class="wia-chips">${chips}</div><p class="small subtle" style="margin:0">${esc(R.missedLine)} Percentages are the share of ${esc(pool.label)} postings that ask.</p>` : `<h3 style="margin-top:16px">You missed none</h3>`}
          ${wrong ? `<h3 style="margin-top:14px">Filler you ${R.mode === "shift" ? "tapped" : "picked"}</h3><div class="wia-chips">${wrong}</div>` : ""}
          <p class="wia-punch">${PUNCH}</p>
          <div class="row" style="margin-top:12px"><a class="btn primary" href="#/role/${encodeURIComponent(pool.id)}">Open ${esc(pool.label)} →</a><button type="button" class="btn" id="wia-again">Play again</button><a class="btn quiet" href="${HOME}" style="padding-left:6px">Another role</a></div>
        </section>
        <aside class="wia-aside">
          <div class="wia-best">${isNew ? `<b>New best for ${esc(pool.label)}.</b><br>` : `Your best for ${esc(pool.label)}:<br>`}${esc(bestLine(shown))}${R.mode === "shift" ? `, score ${fmt(shown.score)}` : ", Steady"}. Kept in this browser only.</div>
          <h3 style="margin-top:22px">How the rank works</h3>
          <p class="small muted">The share of the role's real asks you caught at least once. Offer also needs two ${R.mode === "shift" ? "blown slots" : "pieces of filler picked"} or fewer. Score and streak are for bragging; the rank is what you know.</p>
          ${door.length ? `<h3 style="margin-top:18px">Next door in ${esc(field.label)}</h3><div class="list" style="margin-top:6px">${door.map(d => `<a class="r" href="${HOME}?role=${encodeURIComponent(d.id)}"><span class="t">${esc(ix.roles[d.id].label)}</span><span class="n" data-asks="${esc(d.id)}"></span><span class="m">${esc(d.m)}</span></a>`).join("")}</div>` : ""}
          <p class="small subtle" style="margin-top:16px">From ${fmt(pool.n)} ${esc(pool.label)} postings at ${fmt(pool.nCompanies)} companies, read ${pool.date}. A real ask: at least 40% of them name it. Filler: ${pct(pool.fillerMax)} or fewer, and most postings of another role do.</p>
        </aside></div>`;
      productP.then(p => { if (!S.alive) return; el.querySelectorAll("[data-asks]").forEach(n => { const q = p[n.dataset.asks]; if (q) n.textContent = `${q.asks.length} asks`; }); }, () => { });
      el.querySelector("#wia-again").onclick = begin;
    }

    function debugPools(P) {
      phase = "debug"; crumbs([["Games", "#/"], [TITLE, HOME], ["Pools", null]]);
      const rows = Object.values(P).map(v => `<tr><td>${esc(v.id)}</td><td>${v.set}</td><td>${v.n}</td><td>${v.asks.length}</td><td>${v.asks.filter(a => a.generic).length}</td><td>${v.filler.length}</td><td>${pct(v.fillerMax)}</td><td>${v.filler.filter(f => f.sameField).length}</td><td>${v.small}</td></tr>`).join("");
      view.innerHTML = `<section class="wia-card"><p class="wia-eyebrow">${TITLE} · Pools</p><table class="wia-debug" id="wia-pools"><thead><tr><th>role</th><th>set</th><th>postings</th><th>asks</th><th>generic</th><th>filler</th><th>fillerMax</th><th>sameField</th><th>small</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    }

  }

  window.Games = window.Games || {};
  window.Games[SLUG] = { mount };
})();
