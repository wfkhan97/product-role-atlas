/* Higher or lower (#/play/higher-or-lower): two skill cards for one role, or one skill on two roles (Field hop).
   The left card shows its share of the role's postings; the player says whether the hidden right card's share is
   higher or lower. Spec: games/higher-or-lower/README.md. The dealer is games/higher-or-lower/deal.js, copied as it
   is, so a seed (?seed=7) deals the same pairs here as there. Every number is a share from Atlas.index() /
   Atlas.product() or a posting count; nothing leaves the browser (the games record, web/gameshell.js). Drawn in the
   shared shell: one header, 1 = higher, 2 = lower, Enter goes on, Esc quits. Play first (HOL2): one sentence and
   Play on the default role, the shared picker behind "Change role", Field hop offered after a round. */
(function () {
  "use strict";

  // ---------- the rules and the dealer: copied from games/higher-or-lower/deal.js ----------
  const MIN_SHARE = (window.Atlas && window.Atlas.TIER.some) || 0.10;   // the lowest row of the role screen
  const HOP_MIN_SHARE = 0.02;      // field hop: a role card needs at least 2%
  const MIN_GAP = 8;               // points, on the rounded shares the player sees
  const BANDS = [[0, 25, 100], [3, 15, 30], [6, 10, 20], [10, 8, 14]];   // [from streak, min gap, max gap]
  const HOP_RUN = 4;               // field hop: comparisons on one skill before the skill changes
  const band = streak => { const b = BANDS.filter(x => streak >= x[0]).pop(); return { lo: b[1], hi: b[2] }; };
  const pct = share => Math.round(share * 100);
  const playableSkill = s => s.cluster !== "credentials" && !s.id.startsWith("yoe_");

  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pick = (rng, xs) => xs[Math.floor(rng() * xs.length)];

  function playableRoles(ix, P) {
    const M = ix.M, small = (M.meta.shares || {}).small || 60, out = [];
    const label = Object.fromEntries(ix.groups.map(g => [g.id, g.label]));
    for (const g of M.groups) {
      if (g.id === "product") continue;
      for (const f of g.families) {
        const r = M.roles[f];
        if (r.small || r.n < small || (P && P.G.families[f])) continue;   // pmm: same id as a product family
        const shares = {};
        for (const s of M.skills) if (playableSkill(s) && s.by_family && s.by_family[f] != null) shares[s.id] = pct(s.by_family[f]);
        out.push({ key: "mba:" + f, set: "mba", id: f, label: r.label, group: g.id, groupLabel: label[g.id], n: r.n, shares });
      }
    }
    if (P) for (const f of Object.keys(P.G.families)) {
      const r = ix.roles[Atlas.productKey(f)]; if (!r || r.set !== "product" || r.n < small) continue;
      const shares = {};
      for (const s of P.G.skills) if (playableSkill(s) && s.by_family && s.by_family[f] != null) shares[s.id] = pct(s.by_family[f]);
      out.push({ key: "product:" + f, set: "product", id: r.id, family: f, label: r.label, group: "product", groupLabel: "Product", n: r.n, shares });
    }
    return out;
  }

  function oneRoleDeck(role, rng) {
    const pool = Object.entries(role.shares).filter(([, v]) => v >= pct(MIN_SHARE)).map(([skill, share]) => ({ skill, share }));
    const used = new Set();
    const open = (c, extra) => { const up = pool.some(o => !used.has(o.skill) && o.skill !== extra && o.share - c.share >= MIN_GAP), dn = pool.some(o => !used.has(o.skill) && o.skill !== extra && c.share - o.share >= MIN_GAP); return up && dn; };
    const mids = pool.filter(c => open(c, c.skill));
    const first = pick(rng, mids.length ? mids : pool); used.add(first.skill);
    function next(left, streak) {
      let { lo, hi } = band(streak);
      for (let relax = 0; relax < 4; relax++) {
        const cands = pool.filter(c => !used.has(c.skill) && Math.abs(c.share - left.share) >= lo && Math.abs(c.share - left.share) <= hi);
        if (cands.length) {
          const up = cands.filter(c => c.share > left.share), dn = cands.filter(c => c.share < left.share);
          const side = (rng() < 0.5 && up.length) || !dn.length ? up : dn;   // the answer is a coin flip when both are possible
          const keepsOpen = side.filter(c => open(c, c.skill));             // and the next pair can still go either way
          const card = pick(rng, keepsOpen.length ? keepsOpen : side); used.add(card.skill); return card;
        }
        hi += 6; lo = Math.max(MIN_GAP, lo - 4); if (relax === 2) hi = 100;
      }
      return null;   // the deck is out: the run ends as "every pair dealt" (README, edge cases)
    }
    return { first, next, pool };
  }

  function hopSkills(roles) {
    const ids = new Set(roles.flatMap(r => Object.keys(r.shares)));
    return [...ids].filter(id => {
      const vals = roles.map(r => r.shares[id]).filter(v => v != null);   // a role without the skill has no card, not 0%
      return vals.filter(v => v >= pct(MIN_SHARE)).length >= 6 && Math.max(...vals) - Math.min(...vals) >= 30;
    });
  }
  function hopDeck(roles, rng) {
    const byKey = Object.fromEntries(roles.map(r => [r.key, r]));
    const skills = hopSkills(roles), usedSkills = new Set();
    let skill = null, used = new Set(), run = 0;
    const cardsOf = sid => roles.filter(r => r.shares[sid] != null && r.shares[sid] >= pct(HOP_MIN_SHARE)).map(r => ({ role: r.key, skill: sid, share: r.shares[sid] }));
    function newSkill() {
      const left = skills.filter(s => !usedSkills.has(s)); if (!left.length) return null;
      skill = pick(rng, left); usedSkills.add(skill); used = new Set(); run = 0;
      const cards = cardsOf(skill), mids = cards.filter(c => cards.some(o => o.share - c.share >= 25) && cards.some(o => c.share - o.share >= 25));
      const first = pick(rng, mids.length ? mids : cards); used.add(first.role); return first;
    }
    const first = newSkill();
    function next(left, streak) {
      if (run >= HOP_RUN) { const fresh = newSkill(); if (!fresh) return null; return { reset: fresh, ...nextFrom(fresh, streak) }; }
      return nextFrom(left, streak);
    }
    function nextFrom(left, streak) {
      let { lo, hi } = band(streak); const all = cardsOf(skill).filter(c => !used.has(c.role));
      const otherField = all.filter(c => byKey[c.role].group !== byKey[left.role].group);
      const base = otherField.length ? otherField : all;
      for (let relax = 0; relax < 4; relax++) {
        const cands = base.filter(c => Math.abs(c.share - left.share) >= lo && Math.abs(c.share - left.share) <= hi);
        if (cands.length) {
          const up = cands.filter(c => c.share > left.share), dn = cands.filter(c => c.share < left.share);
          const side = (rng() < 0.5 && up.length) || !dn.length ? up : dn;
          const card = pick(rng, side); used.add(card.role); run++; return { card };
        }
        hi += 6; lo = Math.max(MIN_GAP, lo - 4); if (relax === 2) hi = 100;
      }
      run = HOP_RUN; return next(left, streak);   // nothing left on this skill: change skill
    }
    return { first, next };
  }

  // ---------- small helpers ----------
  const fmt = n => Number(n).toLocaleString("en-US");
  const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const REVEAL_MS = 600, WAIT_MS = 1400, SLIDE_MS = 280, FLASH_MS = 1000;
  const COLLIDING_MBA_IDS = ["pmm"];   // README, edge cases: the MBA pmm shares its id with a product family
  const ROW_PHRASE = s => s >= 50 ? "Over half of" : s >= 25 ? "A quarter to a half of" : s >= 10 ? "One in ten to one in four" : "Fewer than one in ten";
  // "Market data platforms (Bloomberg, …)": the part before the parenthesis at full size, the parenthesis below it
  const splitName = name => { const m = /^(.*?)\s*(\([^()]*\))$/.exec(name); return m && m[1] ? [m[1], m[2]] : [name, ""]; };
  const inline = name => { const s = splitName(name)[0]; return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s; };
  const SLUG = "higher-or-lower", TITLE = "Higher or lower";
  function loadSave(GS) {
    const v = GS.record.game(SLUG), b = (v && v.best) || {};
    return { best: { one: b.one && typeof b.one === "object" ? b.one : {}, hop: Number.isInteger(b.hop) ? b.hop : null, overall: Number.isInteger(b.overall) ? b.overall : null }, lastStreak: Number.isInteger(v.lastStreak) ? v.lastStreak : null, mode: v.mode || null, role: v.role || null };
  }

  const keyOf = id => id.startsWith("product.") ? "product:" + id.slice(8) : "mba:" + id;
  const idOf = key => key.startsWith("product:") ? "product." + key.slice(8) : key.slice(4);

  async function mount(el, ctx) {
    const { Atlas, esc } = ctx, GS = window.GameShell;
    const ix = await Atlas.index();
    let P0 = null; try { P0 = await Atlas.product(); } catch (e) { console.error(e); }
    const INFO = GS.info({ rules: "Two skills from one role. You see how many of the role's postings ask for the first; say whether more or fewer ask for the second. Right: the hidden skill becomes the new left card and the streak grows. Wrong once and the streak ends. The gap between the two shares narrows as your streak grows. Field hop: one skill, two roles from different fields.", keys: "Keys: 1 says higher, 2 says lower; Enter goes on to the next pair; Esc quits.", source: "Every number is the share of a role's postings that ask for the skill." });
    const F = GS.frame(el, { game: TITLE, cls: "hl", info: INFO });
    const screen = F.body;

    const S = { P: P0, pState: P0 ? "ok" : "fail", roles: [], byKey: {}, mode: "one", sel: null, field: null, touched: false, view: "start", run: null, busy: false, dead: false, seedUsed: false };
    const timers = new Set(), frames = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!S.dead) fn(); }, ms); timers.add(t); return t; };
    const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); frames.forEach(cancelAnimationFrame); frames.clear(); };
    function cleanup() { S.dead = true; clearTimers(); offKeys(); window.removeEventListener("hashchange", cleanup); }
    window.addEventListener("hashchange", cleanup);
    const say = msg => F.live(msg);

    // the query: role=<id> (the shared convention; <set>:<id> still works), mode=hop, seed=<integer>
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    const seedQ = /^-?\d+$/.test(q.get("seed") || "") ? parseInt(q.get("seed"), 10) : null;
    const last = loadSave(GS);
    S.mode = q.get("mode") === "hop" ? "hop" : "one";

    function setRoles() {
      S.roles = playableRoles(ix, S.P).filter(r => !(r.set === "mba" && COLLIDING_MBA_IDS.includes(r.id)));
      S.byKey = Object.fromEntries(S.roles.map(r => [r.key, r]));
    }
    setRoles();
    const playable = id => !!S.byKey[keyOf(id)];
    if (q.get("role") && q.get("role").includes(":") && S.byKey[q.get("role")]) q.set("role", idOf(q.get("role")));
    const def = await GS.defaultRole(Atlas, playable);
    if (S.dead) return;
    S.sel = def ? keyOf(def) : (last.role && S.byKey[last.role] ? last.role : S.roles[0].key); S.field = S.byKey[S.sel].group;

    // ---------- names and numbers, read from the index ----------
    const skillOf = (sid, set) => (set === "product" ? (S.P && S.P.skillById[sid]) || ix.skillById[sid] : ix.skillById[sid] || (S.P && S.P.skillById[sid])) || { name: sid };
    const areaOf = (sid, set) => { const c = skillOf(sid, set).cluster, own = set === "product" && S.P ? S.P.G.clusters : ix.M.clusters; return (own[c] || ix.M.clusters[c] || (S.P && S.P.G.clusters[c]) || {}).label || ""; };
    const rawShare = (role, sid) => ((skillOf(sid, role.set).by_family || {})[role.family || role.id]);
    const bestOf = (save, run) => run.mode === "hop" ? save.best.hop : save.best.one[run.role.key];

    // ---------- start (01): one sentence and Play on the default role; "Change role" is the shared picker ----------
    function renderStart() {
      S.view = "start"; S.busy = false; clearTimers();
      const save = loadSave(GS), role = S.byKey[S.sel], best = save.best.one[S.sel];
      GS.start(F, { title: "Higher or lower", lead: `Two skills from one role. You see how many ${role.label} postings ask for the first. Do more postings ask for the second, or fewer?`, role: role.label, play: go, change: renderPick, extra: best != null ? `<p class="gm-best">Your best: <b>${best}</b> in a row · ${esc(role.label)}</p>` : "" });
    }
    function renderPick() {
      S.view = "pick"; clearTimers();
      GS.picker(F, { Atlas, roles: playable, field: S.byKey[S.sel].group, secondary: id => { const b = loadSave(GS).best.one[keyOf(id)]; return b != null ? `Your best: ${b} in a row` : "Not played yet"; }, back: true, onBack: renderStart, onRole: id => { S.sel = keyOf(id); S.field = S.byKey[S.sel].group; S.touched = true; startRun("one", S.byKey[S.sel]); } });
    }
    // ---------- a run ----------
    function startRun(mode, role) {
      clearTimers();
      const seed = seedQ != null && !S.seedUsed ? seedQ : Math.floor(Math.random() * 4294967296);
      S.seedUsed = true;
      const rng = mulberry32(seed);
      GS.record.saveGame(SLUG, mode === "one" ? { mode, role: role.key } : { mode, role: S.sel });
      last.mode = mode; if (mode === "one") last.role = role.key;
      if (location.hash.includes("?")) history.replaceState(null, "", "#/play/higher-or-lower");
      const run = S.run = { mode, role, streak: 0, log: [], notice: null, rolesSeen: new Set() };
      if (mode === "one") { run.deck = oneRoleDeck(role, rng); run.left = run.deck.first; run.right = run.deck.next(run.left, 0); }
      else { run.deck = hopDeck(S.roles, rng); run.left = run.deck.first; const o = run.left && run.deck.next(run.left, 0); run.right = o ? o.card : null; run.seen = [run.left]; run.k = 1; }
      F.set({ role: mode === "one" ? role.label : "Field hop" });
      if (!run.right) return finish(true);
      renderPick();
    }
    const roleOfCard = c => S.run.mode === "one" ? S.run.role : S.byKey[c.role];
    function cardHtml(c, opt) {
      const run = S.run, hop = run.mode === "hop", r = roleOfCard(c);
      const area = hop ? r.groupLabel : areaOf(c.skill, r.set), [main, paren] = splitName(hop ? r.label : skillOf(c.skill, r.set).name);
      const askFor = hop ? inline(skillOf(c.skill, "mba").name) : "it";
      const num = opt.hidden ? '<div class="num hid" aria-label="Share hidden">?</div><div class="bar"><i style="width:0"></i></div>'
        : `<div class="num"><span class="cnt">${opt.count ? 0 : c.share}</span><small>%</small></div><div class="bar"><i style="width:${opt.count ? 0 : c.share}%"></i></div><div class="of">of <b>${fmt(r.n)}</b> ${esc(r.label)} postings ask for ${esc(askFor)}</div>`;
      const picks = opt.hidden ? `<div class="hl-picks"><button type="button" class="hl-pick" data-pick="higher"><span><span class="arr" aria-hidden="true">↑</span>Higher</span><kbd>1</kbd></button><button type="button" class="hl-pick" data-pick="lower"><span><span class="arr" aria-hidden="true">↓</span>Lower</span><kbd>2</kbd></button></div>` : "";
      return `<section class="hl-card${opt.ok ? " ok" : ""}" aria-label="${opt.hidden ? "Hidden card" : opt.ok ? "Revealed card" : "Known card"}" data-side="${opt.side}">
        ${opt.verdict ? `<span class="hl-verdict ok">✓ ${esc(opt.verdict)}</span>` : ""}<span class="area">${esc(area)}</span>
        <div class="hl-name">${esc(main)}${paren ? `<span class="paren">${esc(paren)}</span>` : ""}</div>${num}${picks}</section>`;
    }
    function headHtml() {
      const run = S.run, save = loadSave(GS), best = bestOf(save, run);
      const pips = Math.min(30, Math.max(10, Math.ceil((run.streak + 1) / 10) * 10));
      let title;
      if (run.mode === "one") title = `<h1>${esc(run.role.label)}</h1><p class="lead">Out of ${fmt(run.role.n)} postings. Do more of them ask for the right-hand skill, or fewer?</p>`;
      else { const sk = skillOf(run.left.skill, "mba").name; title = `<h1>Do more ${esc(S.byKey[run.left.role].label)} or ${esc(S.byKey[run.right.role].label)} postings ask for ${esc(inline(sk))}?</h1>`; }
      return `<div class="hl-head"><div>${title}</div><div class="hl-score"><span><span class="k">Streak</span><span class="v you">${run.streak}</span></span><span><span class="k">Best</span><span class="v"${best == null ? ' aria-label="none"' : ""}>${best == null ? "–" : best}</span></span></div></div>
        <div class="hl-track"><div class="hl-pips" role="img" aria-label="Streak ${run.streak}">${Array.from({ length: pips }, (_, i) => `<i${i < run.streak ? ' class="ok"' : ""}></i>`).join("")}</div></div>`;
    }
    function gapLine() {
      const run = S.run, b = band(run.streak), gap = Math.abs(run.right.share - run.left.share), lo = gap >= b.lo ? b.lo : MIN_GAP;
      const ahead = [3, 6, 10].filter(t => t > run.streak);
      const narrows = ahead.length === 3 ? "The gap narrows at a streak of 3, again at 6 and at 10." : ahead.length === 2 ? "The gap narrows at a streak of 6 and again at 10." : ahead.length === 1 ? "The gap narrows again at a streak of 10." : "The gap does not narrow further.";
      return `The two shares are at least ${lo} points apart. ${narrows}`;
    }
    function seenLine() {
      const run = S.run, sk = skillOf(run.left.skill, "mba").name, more = HOP_RUN - run.k;
      const list = run.seen.map(c => `${esc(S.byKey[c.role].label)} <b>${c.share}%</b>`).join(" · ");
      const tail = S.view === "reveal" ? "" : more <= 0 ? " This is the last card on it, then a new skill." : ` This card and ${more === 1 ? "one" : more} more, then a new skill.`;
      return `${run.notice ? `New skill: ${esc(sk)}. ` : ""}So far on ${esc(inline(sk))}: ${list}.${tail}`;
    }
    function contextLine() {
      const run = S.run, r = run.role, base = ix.baseline[run.right.skill], raw = rawShare(r, run.right.skill);
      if (!base || raw == null) return "";
      const up = run.right.share > run.left.share, ratio = raw / base, avg = pct(base) ? pct(base) + "%" : "under 1%";
      const lead = `${up ? "More" : "Fewer"} than ${esc(inline(skillOf(run.left.skill, r.set).name))}`, who = `${esc(r.label)} postings ask for ${esc(inline(skillOf(run.right.skill, r.set).name))}`;
      if (ratio >= 1.5) return `${lead}, ${up ? "and" : "but"} ${who} <b>${ratio.toFixed(1)} times</b> as often as the average MBA role (<b>${avg}</b>).`;
      if (ratio <= 0.67) return `${lead}, ${up ? "but" : "and"} ${who} less often than the average MBA role (<b>${avg}</b>).`;
      return `${lead}, and ${who} about as often as the average MBA role.`;
    }
    function renderPick(focusDir) {
      const run = S.run; S.view = "pick"; S.busy = false;
      const note = run.mode === "one" ? `<span>${gapLine()}</span>` : `<span class="seen">${seenLine()}</span>`;
      screen.innerHTML = `${headHtml()}<div class="hl-stage">${cardHtml(run.left, { side: "left" })}<div class="hl-vs" aria-hidden="true">vs</div>${cardHtml(run.right, { side: "right", hidden: true })}</div>
        <p class="hl-note">${note}</p>`;
      if (run.streak === 0 && !run.log.length) GS.coachOnce(SLUG, screen.querySelector(".hl-stage"), `Do more or fewer ${run.mode === "one" ? run.role.label : ""} postings ask for the right-hand skill than for the left one? 1 says more, 2 says fewer. Right, and the hidden card becomes the new left card.`.replace("  ", " "), "beforebegin");
      if (focusDir) { const b = screen.querySelector(`[data-pick="${focusDir}"]`); if (b) b.focus(); }
    }
    function choose(dir) {
      const run = S.run; if (S.view !== "pick" || S.busy) return;
      const fromButton = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.pick;
      const l = run.left.share, r = run.right.share, same = l === r, right = same || (dir === "higher" ? r > l : r < l);
      if (!right) return finish(false, dir);
      S.busy = true; S.view = "reveal"; run.streak++; run.focusDir = fromButton ? dir : null;
      run.log.push({ left: run.left, right: run.right, skill: run.right.skill });
      if (run.mode === "hop") run.seen.push(run.right);
      const animate = !reduced(), verdict = same ? "Same share. Both count." : `${dir === "higher" ? "Higher" : "Lower"} · right`;
      const fact = run.mode === "one" ? contextLine() : seenLine();
      screen.innerHTML = `${headHtml()}<div class="hl-stage">${cardHtml(run.left, { side: "left" })}<div class="hl-vs" aria-hidden="true">vs</div>${cardHtml(run.right, { side: "right", ok: true, verdict, count: animate })}</div>
        <p class="hl-note"><span class="fact${run.mode === "hop" ? " seen" : ""}">${fact}</span></p>
        ${GS.foot({ primary: { id: "hl-next", label: "Next pair", key: "Enter" } })}`;
      screen.querySelector("#hl-next").onclick = advance;
      const nm = run.mode === "one" ? skillOf(run.right.skill, run.role.set).name : S.byKey[run.right.role].label;
      say(`Right. ${nm.replace(/&/g, "and")}, ${run.right.share}%. Streak ${run.streak}.`);
      const done = () => { S.busy = false; };
      if (animate) {
        const cnt = screen.querySelector('[data-side="right"] .cnt'), bar = screen.querySelector('[data-side="right"] .bar i'), t0 = performance.now(), v = run.right.share;
        const step = now => { if (S.dead || S.run !== run) return; const k = Math.min(1, (now - t0) / REVEAL_MS), e = 1 - Math.pow(1 - k, 3);
          cnt.textContent = Math.round(v * e); bar.style.width = (v * e) + "%"; if (k < 1) { const id = requestAnimationFrame(step); frames.add(id); } else done(); };
        frames.add(requestAnimationFrame(step));
        later(done, REVEAL_MS + 50);
      } else done();
      later(advance, WAIT_MS);
    }
    function advance() {
      const run = S.run; if (S.view !== "reveal") return;
      clearTimers(); S.busy = true;
      const go = () => {
        if (S.dead || S.run !== run) return;
        let nxt = null;
        if (run.mode === "one") { nxt = run.deck.next(run.right, run.streak); if (nxt) { run.left = run.right; run.right = nxt; } }
        else { const o = run.deck.next(run.right, run.streak); if (o) { nxt = o.card; if (o.reset) { run.left = o.reset; run.seen = [o.reset]; run.k = 1; run.notice = true; } else { run.left = run.right; run.k++; run.notice = false; } run.right = o.card; } }
        if (!nxt) return finish(true);
        renderPick(run.focusDir);
      };
      const card = screen.querySelector('[data-side="right"]'), leftCard = screen.querySelector('[data-side="left"]');
      if (reduced() || !card || !card.animate) return go();
      const dx = card.getBoundingClientRect().left - leftCard.getBoundingClientRect().left;
      leftCard.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SLIDE_MS, fill: "forwards" });
      card.animate([{ transform: "translateX(0)" }, { transform: `translateX(${-dx}px)` }], { duration: SLIDE_MS, easing: "ease-in-out", fill: "forwards" });
      later(go, SLIDE_MS);
    }

    // ---------- end screen (04): the measure in plain words, the change since last time, the pair that ended it ----------
    function finish(win, dir) {
      clearTimers();
      const run = S.run, save = loadSave(GS), prev = bestOf(save, run), hop = run.mode === "hop", prevLast = save.lastStreak;
      const isBest = GS.record.works() && run.streak > 0 && (prev == null || run.streak > prev);   // no storage: no best to beat
      if (hop) save.best.hop = Math.max(run.streak, save.best.hop || 0); else save.best.one[run.role.key] = Math.max(run.streak, save.best.one[run.role.key] || 0);
      save.best.overall = Math.max(run.streak, save.best.overall || 0);
      GS.record.saveGame(SLUG, { played: true, best: save.best, lastStreak: run.streak });
      S.view = "end"; S.busy = false;
      const missRole = win ? roleOfCard(run.left) : roleOfCard(run.right);
      const nameOf = c => hop ? S.byKey[c.role].label : skillOf(c.skill, run.role.set).name;
      const areaOfCard = c => hop ? S.byKey[c.role].groupLabel : areaOf(c.skill, run.role.set);
      const askFor = c => hop ? esc(inline(skillOf(c.skill, "mba").name)) : "it";
      let reveal, mini = "";
      if (win) reveal = `Every pair dealt. You know ${esc(hop ? "these" : run.role.label)} postings better than most recruiters.`;
      else {
        const c = run.right, r = roleOfCard(c);
        reveal = `${esc(nameOf(c))}: <b>${c.share}%</b>, not ${dir}. ${ROW_PHRASE(c.share)} ${esc(r.label)} postings ask for ${askFor(c)}.`;
        mini = `<div class="hl-mini"><div class="c"><div class="small subtle">${esc(areaOfCard(run.left))}</div><div class="s">${esc(nameOf(run.left))}</div><div class="p">${run.left.share}%</div></div>
          <div class="c miss"><div class="small subtle">${esc(areaOfCard(c))} · you said ${dir}</div><div class="s">${esc(nameOf(c))}</div><div class="p">${c.share}%</div></div></div>`;
      }
      const weighed = run.streak + (win ? 1 : 2);
      let punch;
      if (hop) {
        const dealt = new Set([...run.log.flatMap(p => [p.left.role, p.right.role]), run.left.role, ...(win ? [] : [run.right.role])]);
        const total = [...dealt].reduce((a, k) => a + S.byKey[k].n, 0);
        punch = `You weighed ${weighed} shares from the postings of ${dealt.size} roles, <b>${fmt(total)}</b> of them, read one by one.`;
      } else punch = `You weighed ${weighed} skills. The numbers came from <b>${fmt(run.role.n)}</b> ${esc(run.role.label)} postings, read one by one.`;
      const link = r => `#/role/${encodeURIComponent(r.id)}`;
      let prevSkill = null;
      const log = run.log.length ? `<ol class="hl-log">${run.log.map(p => {
        const head = hop && p.skill !== prevSkill ? `<li class="hd">${esc(skillOf(p.skill, "mba").name)}</li>` : ""; prevSkill = p.skill;
        const side = (c, cls) => { const r = roleOfCard(c); return `<span${cls ? ` class="${cls}"` : ""}><a href="${link(r)}">${esc(nameOf(c))}</a> <span class="p">${c.share}%</span></span>`; };
        return `${head}<li>${side(p.left)}<span class="op">${p.right.share > p.left.share ? "&lt;" : "&gt;"}</span>${side(p.right, "b")}</li>`;
      }).join("")}</ol>` : '<p class="small muted">None this run.</p>';
      const change = prevLast == null ? "Your first run." : run.streak > prevLast ? `Up from ${prevLast} last time.` : run.streak < prevLast ? `Down from ${prevLast} last time.` : "The same as last time.";
      const rec = `${change}${isBest && prev != null ? " A new best." : prev != null ? ` Your best here: <b>${prev}</b>.` : ""}`;
      screen.innerHTML = GS.results({
        eyebrow: `${esc(hop ? "Field hop" : run.role.label)} · ${win ? "every pair dealt" : "streak over"}`,
        measure: `${run.streak} ${run.streak === 1 ? "pair" : "pairs"} right in a row`,
        record: rec,
        takeaway: `${reveal} ${punch}`,
        visual: `${mini}<div class="gm-cols" style="margin-top:16px"><div><h3>The pairs you got right</h3>${log}</div></div>`,
        link: { href: link(missRole), label: `See what ${missRole.label} postings ask for` },
        foot: GS.foot({ primary: { id: "hl-again", label: "Play again", key: "Enter" }, quiet: { id: "hl-back", label: hop ? "Back to one role" : "Try the same skill across fields" } }),
      });
      screen.querySelector("#hl-again").onclick = () => startRun(S.run.mode, S.run.role);
      screen.querySelector("#hl-back").onclick = () => { if (hop) toStart(); else if (S.pState === "ok") startRun("hop", null); else toStart(); };
      say(win ? `Every pair dealt. Streak ${run.streak}.` : `Wrong. ${nameOf(run.right).replace(/&/g, "and")}, ${run.right.share}%, not ${dir}. Streak over at ${run.streak}.`);
      F.focusMeasure();
    }

    // ---------- input ----------
    function toStart() { clearTimers(); S.run = null; renderStart(); }
    function go() { startRun("one", S.byKey[S.sel]); }
    screen.addEventListener("click", e => {
      const t = e.target.closest("button"); if (!t || !screen.contains(t) || t.disabled) return;
      const d = t.dataset;
      if (d.pick) choose(d.pick);
    });
    const offKeys = GS.keys({
      choose(n) { if (S.dead || S.busy || S.view !== "pick" || n > 2) return false; choose(n === 1 ? "higher" : "lower"); return true; },
      confirm() {
        if (S.dead || S.busy) return;
        if (S.view === "reveal") advance();
        else if (S.view === "start") go();
        else if (S.view === "end") startRun(S.run.mode, S.run.role);
      },
    });

    // a round asked for in the hash: ?mode=hop, or ?role=<id>
    if (q.get("mode") === "hop" && S.pState === "ok") startRun("hop", null);
    else if (q.get("role") && playable(q.get("role"))) startRun("one", S.byKey[keyOf(q.get("role"))]);
    else renderStart();
  }

  window.Games = window.Games || {};
  window.Games["higher-or-lower"] = { mount };
})();
