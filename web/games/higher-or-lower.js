/* Higher or lower (#/play/higher-or-lower): two skill cards for one role, or one skill on two roles (Field hop).
   The left card shows its share of the role's postings; the player says whether the hidden right card's share is
   higher or lower. Spec: games/higher-or-lower/README.md. The dealer is games/higher-or-lower/deal.js, copied as it
   is, so a seed (?seed=7) deals the same pairs here as there. Every number is a share from Atlas.index() /
   Atlas.product() or a posting count; nothing leaves the browser (localStorage "hol-v1", "hol-mode"). */
(function () {
  "use strict";

  // ---------- the rules and the dealer: copied from games/higher-or-lower/deal.js ----------
  const MIN_SHARE = (window.Atlas && window.Atlas.TIER.some) || 0.10;   // the lowest row of the role screen
  const HOP_MIN_SHARE = 0.02;      // field hop: a role card needs at least 2%
  const MIN_GAP = 8;               // points, on the rounded shares the player sees
  const BANDS = [[0, 25, 100], [3, 15, 30], [6, 10, 20], [10, 8, 14]];   // [from streak, min gap, max gap]
  const HOP_RUN = 4;               // field hop: comparisons on one skill before the skill changes
  const RANKS = [[0, "Cover letter skimmer"], [3, "Job board regular"], [6, "Sharp recruiter"], [10, "Hiring committee"], [15, "Head of talent"], [25, "Walking atlas"]];
  const band = streak => { const b = BANDS.filter(x => streak >= x[0]).pop(); return { lo: b[1], hi: b[2] }; };
  const rankOf = streak => RANKS.filter(r => streak >= r[0]).pop()[1];
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
      const r = ix.roles[f]; if (!r || r.set !== "product" || r.n < small) continue;
      const shares = {};
      for (const s of P.G.skills) if (playableSkill(s) && s.by_family && s.by_family[f] != null) shares[s.id] = pct(s.by_family[f]);
      out.push({ key: "product:" + f, set: "product", id: f, label: r.label, group: "product", groupLabel: "Product", n: r.n, shares });
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
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    works() { try { localStorage.setItem("hol-probe", "1"); localStorage.removeItem("hol-probe"); return true; } catch { return false; } },
  };
  function loadSave() {
    const v = store.get("hol-v1") || {}, b = (v && v.best) || {};
    return { best: { one: b.one && typeof b.one === "object" ? b.one : {}, hop: Number.isInteger(b.hop) ? b.hop : null, overall: Number.isInteger(b.overall) ? b.overall : null }, runs: Array.isArray(v.runs) ? v.runs.filter(r => r && Number.isInteger(r.streak)) : [] };
  }

  async function mount(el, ctx) {
    const { Atlas, esc } = ctx;
    const ix = await Atlas.index();
    const root = document.createElement("div"); root.className = "hl";
    const screen = document.createElement("div"), live = document.createElement("div");
    live.className = "hl-live"; live.setAttribute("aria-live", "polite"); live.setAttribute("role", "status");
    root.append(screen, live); el.innerHTML = ""; el.append(root);

    const S = { P: null, pState: "loading", roles: [], byKey: {}, mode: "one", sel: null, field: null, touched: false, view: "start", run: null, busy: false, dead: false, seedUsed: false };
    const timers = new Set(), frames = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!S.dead) fn(); }, ms); timers.add(t); return t; };
    const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); frames.forEach(cancelAnimationFrame); frames.clear(); };
    function cleanup() { S.dead = true; clearTimers(); document.removeEventListener("keydown", onKey); window.removeEventListener("hashchange", cleanup); }
    window.addEventListener("hashchange", cleanup);
    document.addEventListener("keydown", onKey);
    const say = msg => { live.textContent = ""; later(() => { live.textContent = msg; }, 50); };

    // the query: role=<set>:<id>, mode=one|hop, seed=<integer>
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    const seedQ = /^-?\d+$/.test(q.get("seed") || "") ? parseInt(q.get("seed"), 10) : null;
    const last = store.get("hol-mode") || {};
    S.mode = q.get("mode") === "hop" || (!q.get("mode") && last.mode === "hop") ? "hop" : "one";
    const youFields = (() => { const y = store.get("you"); return y && Array.isArray(y.fields) ? y.fields : []; })();

    function setRoles() {
      S.roles = playableRoles(ix, S.P).filter(r => !(r.set === "mba" && COLLIDING_MBA_IDS.includes(r.id)));
      S.byKey = Object.fromEntries(S.roles.map(r => [r.key, r]));
    }
    setRoles();
    const rolesOf = g => S.roles.filter(r => r.group === g).sort((a, b) => b.n - a.n);
    const fieldOrder = () => { const ids = ["product", ...ix.groups.map(g => g.id).filter(id => id !== "product")]; return [...youFields.filter(f => ids.includes(f)), ...ids.filter(f => !youFields.includes(f))]; };
    const groupLabel = id => (ix.groups.find(g => g.id === id) || {}).label || id;
    function defaultKey() {
      if (last.role && S.byKey[last.role]) return last.role;
      for (const f of youFields) { const rs = rolesOf(f); if (rs.length) return rs[0].key; }
      if (S.byKey["product:pm"]) return "product:pm";
      return S.byKey["mba:management_consultant"] ? "mba:management_consultant" : S.roles[0].key;
    }
    S.sel = defaultKey(); S.field = S.byKey[S.sel].group;

    // ---------- names and numbers, read from the index ----------
    const skillOf = (sid, set) => (set === "product" ? (S.P && S.P.skillById[sid]) || ix.skillById[sid] : ix.skillById[sid] || (S.P && S.P.skillById[sid])) || { name: sid };
    const areaOf = (sid, set) => { const c = skillOf(sid, set).cluster, own = set === "product" && S.P ? S.P.G.clusters : ix.M.clusters; return (own[c] || ix.M.clusters[c] || (S.P && S.P.G.clusters[c]) || {}).label || ""; };
    const rawShare = (role, sid) => ((skillOf(sid, role.set).by_family || {})[role.id]);
    const bestOf = (save, run) => run.mode === "hop" ? save.best.hop : save.best.one[run.role.key];

    // ---------- start screen (01) ----------
    function renderStart() {
      S.view = "start"; S.busy = false; clearTimers();
      const save = loadSave(), canStore = store.works();
      const role = S.byKey[S.sel], one = S.mode === "one";
      const best = one ? save.best.one[S.sel] : save.best.hop;
      const chips = fieldOrder().map(f => { const n = rolesOf(f).length; if (!n && f !== "product") return ""; return `<button type="button" class="chip${S.field === f ? " on" : ""}" data-field="${esc(f)}" aria-pressed="${S.field === f}">${esc(groupLabel(f))}${n ? `<span class="n">${n}</span>` : ""}</button>`; }).join("");
      const list = S.field === "product" && S.pState !== "ok"
        ? `<span class="r">${S.pState === "fail" ? "Could not load the product roles" : "Loading the product roles…"}</span>`
        : rolesOf(S.field).map(r => `<button type="button" class="r${r.key === S.sel ? " on" : ""}" data-role="${esc(r.key)}" aria-pressed="${r.key === S.sel}">${esc(r.label)}<span class="n">${fmt(r.n)} postings</span></button>`).join("");
      const hopWait = !one && S.pState === "loading";
      screen.innerHTML = `<div class="hl-start"><div>
        <p class="eyebrow">Games · one rule, no timer</p><h1>Higher or lower</h1>
        <p class="lead">Two skills from one role. You see how many postings ask for the first. Do more postings ask for the second, or fewer? Keep guessing right and the streak grows.</p>
        <h2>How to play</h2>
        <div class="hl-modes">
          <button type="button" class="hl-mode${one ? " on" : ""}" data-mode="one" aria-pressed="${one}"><span class="t">One role</span><span class="d">Two skills, one role. Do more Product Manager postings ask for roadmapping, or for discovery?</span></button>
          <button type="button" class="hl-mode${one ? "" : " on"}" data-mode="hop" aria-pressed="${!one}"><span class="t">Field hop</span><span class="d">One skill, two roles from different fields. Do more Strategic Finance Manager or Management Consultant postings ask for SQL?</span></button>
        </div>
        ${one ? `<h2>Pick a role</h2><div class="chips"><span class="lbl">Field</span>${chips}</div><div class="hl-roles">${list}</div>` : ""}
        <div class="row hl-actions">
          <button type="button" class="btn primary" data-act="go"${hopWait ? " disabled" : ""}>${one ? `Start with ${esc(role.label)}` : hopWait ? "Loading the product roles…" : "Start field hop"} <kbd>Enter</kbd></button>
          ${one ? '<button type="button" class="btn" data-act="surprise">Surprise me <kbd>S</kbd></button>' : ""}
        </div></div>
        <aside class="hl-side">
          <h3>Rules</h3>
          <ol class="hl-rules"><li>Pick <b>Higher</b> or <b>Lower</b>: <kbd>H</kbd> or <kbd>↑</kbd>, <kbd>L</kbd> or <kbd>↓</kbd>.</li><li>Right: the hidden ${one ? "skill" : "role"} becomes the new left card.</li><li>Wrong once and the streak ends.</li><li>The gap between the two shares narrows as your streak grows.</li></ol>
          <h3>Titles</h3>
          <dl class="hl-ranks">${RANKS.map(([from, t], i) => { const to = RANKS[i + 1] ? RANKS[i + 1][0] - 1 : null, mine = best != null && rankOf(best) === t; return `<dt>${from}${to == null ? "+" : "–" + to}</dt><dd${mine ? ' class="you"' : ""}>${esc(t)}${mine ? " · your best" : ""}</dd>`; }).join("")}</dl>
          <h3>Your best</h3>
          <p class="small hl-best">${best != null ? `<span class="v">${best}</span> <span class="muted">${esc(one ? role.label : "Field hop")} · kept in this browser</span>` : `<span class="muted">${canStore ? `None yet${one ? " for " + esc(role.label) : " in Field hop"}.` : "None. This browser does not keep storage, so the game plays without a best."}</span>`}</p>
        </aside></div>`;
    }
    function surprise() {
      const pool = S.roles.filter(r => r.key !== S.sel), r = pool[Math.floor(Math.random() * pool.length)] || S.byKey[S.sel];
      S.sel = r.key; S.field = r.group; S.touched = true; startRun("one", r);
    }

    // ---------- a run ----------
    function startRun(mode, role) {
      clearTimers();
      const seed = seedQ != null && !S.seedUsed ? seedQ : Math.floor(Math.random() * 4294967296);
      S.seedUsed = true;
      const rng = mulberry32(seed);
      store.set("hol-mode", mode === "one" ? { mode, role: role.key } : { mode, role: S.sel });
      last.mode = mode; if (mode === "one") last.role = role.key;
      if (location.hash.includes("?")) history.replaceState(null, "", "#/play/higher-or-lower");
      const run = S.run = { mode, role, streak: 0, log: [], notice: null, rolesSeen: new Set() };
      if (mode === "one") { run.deck = oneRoleDeck(role, rng); run.left = run.deck.first; run.right = run.deck.next(run.left, 0); }
      else { run.deck = hopDeck(S.roles, rng); run.left = run.deck.first; const o = run.left && run.deck.next(run.left, 0); run.right = o ? o.card : null; run.seen = [run.left]; run.k = 1; }
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
      const picks = opt.hidden ? `<div class="hl-picks"><button type="button" class="hl-pick" data-pick="higher"><span><span class="arr" aria-hidden="true">↑</span>Higher</span><kbd>H</kbd></button><button type="button" class="hl-pick" data-pick="lower"><span><span class="arr" aria-hidden="true">↓</span>Lower</span><kbd>L</kbd></button></div>` : "";
      return `<section class="hl-card${opt.ok ? " ok" : ""}" aria-label="${opt.hidden ? "Hidden card" : opt.ok ? "Revealed card" : "Known card"}" data-side="${opt.side}">
        ${opt.verdict ? `<span class="hl-verdict ok">✓ ${esc(opt.verdict)}</span>` : ""}<span class="area">${esc(area)}</span>
        <div class="hl-name">${esc(main)}${paren ? `<span class="paren">${esc(paren)}</span>` : ""}</div>${num}${picks}</section>`;
    }
    function headHtml() {
      const run = S.run, save = loadSave(), best = bestOf(save, run);
      const pips = Math.min(30, Math.max(10, Math.ceil((run.streak + 1) / 10) * 10));
      const flash = run.flash ? `<span class="hl-flash">${esc(run.flash)}</span>` : "";
      let title;
      if (run.mode === "one") title = `<p class="eyebrow">Higher or lower · One role</p><h1>${esc(run.role.label)}</h1><p class="lead">Out of ${fmt(run.role.n)} postings. Do more of them ask for the right-hand skill, or fewer?</p>`;
      else { const sk = skillOf(run.left.skill, "mba").name; title = `<p class="eyebrow">Higher or lower · Field hop · ${esc(sk)}</p><h1>Do more ${esc(S.byKey[run.left.role].label)} or ${esc(S.byKey[run.right.role].label)} postings ask for ${esc(inline(sk))}?</h1>`; }
      return `<div class="hl-head"><div>${title}</div><div class="hl-score"><span><span class="k">Streak</span><span class="v you">${run.streak}</span></span><span><span class="k">Best</span><span class="v"${best == null ? ' aria-label="none"' : ""}>${best == null ? "–" : best}</span></span></div></div>
        <div class="hl-track"><div class="hl-pips" role="img" aria-label="Streak ${run.streak}">${Array.from({ length: pips }, (_, i) => `<i${i < run.streak ? ' class="ok"' : ""}></i>`).join("")}</div>${flash}</div>`;
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
      const run = S.run; S.view = "pick"; S.busy = false; run.flash = null;
      const note = run.mode === "one" ? `<span>${gapLine()}</span>` : `<span class="seen">${seenLine()}</span>`;
      screen.innerHTML = `${headHtml()}<div class="hl-stage">${cardHtml(run.left, { side: "left" })}<div class="hl-vs" aria-hidden="true">vs</div>${cardHtml(run.right, { side: "right", hidden: true })}</div>
        <p class="hl-note">${note}<span><kbd>Esc</kbd> back${run.mode === "one" ? " to roles" : ""}</span></p>`;
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
      const reached = RANKS.find(x => x[0] === run.streak && x[0] > 0);
      run.flash = reached && !reduced() ? reached[1] : null;
      const animate = !reduced(), verdict = same ? "Same share. Both count." : `${dir === "higher" ? "Higher" : "Lower"} · right`;
      const fact = run.mode === "one" ? contextLine() : seenLine();
      screen.innerHTML = `${headHtml()}<div class="hl-stage">${cardHtml(run.left, { side: "left" })}<div class="hl-vs" aria-hidden="true">vs</div>${cardHtml(run.right, { side: "right", ok: true, verdict, count: animate })}</div>
        <p class="hl-note"><span class="fact${run.mode === "hop" ? " seen" : ""}">${fact}</span><span>Next pair in a moment · <kbd>Space</kbd> now</span></p>`;
      const nm = run.mode === "one" ? skillOf(run.right.skill, run.role.set).name : S.byKey[run.right.role].label;
      say(`Right. ${nm.replace(/&/g, "and")}, ${run.right.share}%. Streak ${run.streak}.${reached ? ` New title: ${reached[1]}.` : ""}`);
      if (run.flash) later(() => { const f = screen.querySelector(".hl-flash"); if (f) f.remove(); run.flash = null; }, FLASH_MS);
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

    // ---------- end screen (04) ----------
    function finish(win, dir) {
      clearTimers();
      const run = S.run, save = loadSave(), prev = bestOf(save, run), hop = run.mode === "hop";
      const isBest = store.works() && run.streak > 0 && (prev == null || run.streak > prev);   // no storage: no best to beat
      if (hop) save.best.hop = Math.max(run.streak, save.best.hop || 0); else save.best.one[run.role.key] = Math.max(run.streak, save.best.one[run.role.key] || 0);
      save.best.overall = Math.max(run.streak, save.best.overall || 0);
      const lastCard = win ? run.left : run.right;
      const entry = hop ? { mode: "hop", skill: (lastCard || run.left).skill, streak: run.streak, date: new Date().toISOString() } : { mode: "one", role: run.role.key, streak: run.streak, date: new Date().toISOString() };
      save.runs = [...save.runs, entry].slice(-10);
      const kept = store.set("hol-v1", save);
      S.view = "end"; S.busy = false;
      const rank = rankOf(run.streak), nextRank = RANKS.find(r => r[0] > run.streak);
      const toNext = nextRank ? `${(nextRank[0] - run.streak) <= 10 ? WORDS[nextRank[0] - run.streak] : nextRank[0] - run.streak} more for ${nextRank[1]}.` : "The top title.";
      const missRole = win ? roleOfCard(run.left) : roleOfCard(run.right);
      const nameOf = c => hop ? S.byKey[c.role].label : skillOf(c.skill, run.role.set).name;
      const areaOfCard = c => hop ? S.byKey[c.role].groupLabel : areaOf(c.skill, run.role.set);
      const askFor = c => hop ? esc(inline(skillOf(c.skill, "mba").name)) : "it";
      let reveal, mini = "";
      if (win) reveal = `<div class="hl-reveal">Every pair dealt. You know ${esc(hop ? "these" : run.role.label)} postings better than most recruiters.</div>`;
      else {
        const c = run.right, r = roleOfCard(c);
        reveal = `<div class="hl-reveal">${esc(nameOf(c))}: <span class="num">${c.share}%</span>, not ${dir}. ${ROW_PHRASE(c.share)} ${esc(r.label)} postings ask for ${askFor(c)}.</div>`;
        mini = `<div class="hl-mini"><div class="c"><div class="small subtle">${esc(areaOfCard(run.left))}</div><div class="s">${esc(nameOf(run.left))}</div><div class="p">${run.left.share}%</div></div>
          <div class="c miss"><div class="small subtle">${esc(areaOfCard(c))} · you said ${dir}</div><div class="s">${esc(nameOf(c))}</div><div class="p">${c.share}%</div></div></div>`;
      }
      let punch;
      const weighed = run.streak + (win ? 1 : 2);
      if (hop) {
        const dealt = new Set([...run.log.flatMap(p => [p.left.role, p.right.role]), run.left.role, ...(win ? [] : [run.right.role])]);
        const total = [...dealt].reduce((a, k) => a + S.byKey[k].n, 0);
        punch = `You weighed ${weighed} shares. The numbers came from the postings of ${dealt.size} roles, <b>${fmt(total)}</b> of them, read one by one. Nobody reads that many by hand. That's the point.`;
      } else punch = `You weighed ${weighed} skills. The numbers came from <b>${fmt(run.role.n)}</b> ${esc(run.role.label)} postings, read one by one. Nobody reads that many by hand. That's the point.`;
      const link = r => `#/role/${encodeURIComponent(r.id)}`;
      let prevSkill = null;
      const log = run.log.length ? `<ol class="hl-log">${run.log.map(p => {
        const head = hop && p.skill !== prevSkill ? `<li class="hd">${esc(skillOf(p.skill, "mba").name)}</li>` : ""; prevSkill = p.skill;
        const side = (c, cls) => { const r = roleOfCard(c); return `<span${cls ? ` class="${cls}"` : ""}><a href="${link(r)}">${esc(nameOf(c))}</a> <span class="p">${c.share}%</span></span>`; };
        return `${head}<li>${side(p.left)}<span class="op">${p.right.share > p.left.share ? "&lt;" : "&gt;"}</span>${side(p.right, "b")}</li>`;
      }).join("")}</ol>` : '<p class="small muted">None this run.</p>';
      const today = new Date().toDateString();
      const when = d => { const t = new Date(d); return isNaN(t) ? "" : t.toDateString() === today ? "today" : t.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
      const runLabel = x => x.mode === "hop" ? `Field hop · ${skillOf(x.skill, "mba").name}` : (S.byKey[x.role] || (ix.roles[(x.role || "").split(":")[1]] || {})).label || x.role;
      const runs = kept ? save.runs.slice(-5).reverse().map((x, i) => `<span class="mono${i ? " subtle" : " you"}">${x.streak}</span><span>${esc(runLabel(x))}</span><span class="subtle small">${esc(when(x.date))}</span>`).join("")
        : "";
      screen.innerHTML = `<div class="hl-end"><div>
        <p class="eyebrow">Higher or lower · ${esc(hop ? "Field hop" : run.role.label)} · ${win ? "every pair dealt" : "streak over"}</p>
        <div class="hl-streak"><span class="hl-big">${run.streak}</span><span class="muted">${run.streak === 1 ? "pair" : "pairs"} right in a row${isBest ? ` · a new best${prev != null ? ` (was ${prev})` : ""}` : ""}</span></div>
        <div class="hl-rank">${esc(rank)}</div><p class="small muted hl-next">${esc(toNext)}</p>
        ${reveal}${mini}<p class="hl-punch">${punch}</p>
        <div class="row hl-actions"><a class="btn primary" href="${link(missRole)}">See what ${esc(missRole.label)} postings ask for →</a>
          <button type="button" class="btn" data-act="again">Play again <kbd>Enter</kbd></button><button type="button" class="btn quiet" data-act="back">${hop ? "Back to the start" : "Another role"}</button></div></div>
        <aside class="hl-side"><h3>The pairs you got right</h3>${log}
          <h3>Your runs in this browser</h3>${kept ? `<div class="hl-runs">${runs}</div>` : '<p class="small muted">This browser does not keep storage, so runs are not kept.</p>'}</aside></div>`;
      say(win ? `Every pair dealt. Streak ${run.streak}, ${rank}.` : `Wrong. ${nameOf(run.right).replace(/&/g, "and")}, ${run.right.share}%, not ${dir}. Streak over at ${run.streak}, ${rank}.`);
      const again = screen.querySelector('[data-act="again"]'); if (again) again.focus();
    }

    // ---------- input ----------
    function toStart() { clearTimers(); S.run = null; renderStart(); const b = screen.querySelector('[data-act="go"]'); if (b) b.focus(); }
    function go() {
      if (S.mode === "hop") { if (S.pState !== "loading") startRun("hop", null); return; }
      startRun("one", S.byKey[S.sel]);
    }
    root.addEventListener("click", e => {
      const t = e.target.closest("button"); if (!t || !root.contains(t) || t.disabled) return;
      const d = t.dataset;
      if (d.mode) { S.mode = d.mode; renderStart(); screen.querySelector(`[data-mode="${d.mode}"]`).focus(); }
      else if (d.field) { S.field = d.field; S.touched = true; const rs = rolesOf(d.field); if (rs.length && !rs.some(r => r.key === S.sel)) S.sel = rs[0].key; renderStart(); const c = screen.querySelector(`[data-field="${d.field}"]`); if (c) c.focus(); }
      else if (d.role) { S.sel = d.role; S.touched = true; renderStart(); const c = screen.querySelector(`[data-role="${d.role}"]`); if (c) c.focus(); }
      else if (d.pick) choose(d.pick);
      else if (d.act === "go") go();
      else if (d.act === "surprise") surprise();
      else if (d.act === "again") startRun(S.run.mode, S.run.role);
      else if (d.act === "back") toStart();
    });
    function onKey(e) {
      if (S.dead || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (t && t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
      if (S.busy) return;   // from a pick until its reveal finishes
      const k = e.key, onControl = t && t.closest && t.closest("button, a");
      let done = true;
      if (S.view === "pick") {
        if (k === "h" || k === "H" || k === "ArrowUp") choose("higher");
        else if (k === "l" || k === "L" || k === "ArrowDown") choose("lower");
        else if (k === "Escape") toStart(); else done = false;
      } else if (S.view === "reveal") {
        if (k === " " || k === "Spacebar") advance(); else if (k === "Escape") toStart(); else done = false;
      } else if (S.view === "start") {
        if (k === "Enter" && !onControl) go(); else if ((k === "s" || k === "S") && S.mode === "one") surprise(); else done = false;
      } else if (S.view === "end") {
        if (k === "Enter" && !onControl) startRun(S.run.mode, S.run.role); else if (k === "Escape") toStart(); else done = false;
      } else done = false;
      if (done) e.preventDefault();
    }

    // ---------- the product set: loads in the background; its six roles show "loading" until then ----------
    const qRole = q.get("role"), qHop = q.get("mode") === "hop";
    const pending = qHop || (qRole && qRole.startsWith("product:"));
    const tryQuery = () => {
      if (qHop) { S.mode = "hop"; startRun("hop", null); return true; }
      if (qRole && S.byKey[qRole]) { S.mode = "one"; S.sel = qRole; S.field = S.byKey[qRole].group; startRun("one", S.byKey[qRole]); return true; }
      return false;
    };
    Atlas.product().then(P => { S.P = P; S.pState = "ok"; }, err => { console.error(err); S.pState = "fail"; }).then(() => {
      if (S.dead) return;
      setRoles();
      if (!S.byKey[S.sel] || !S.touched) { S.sel = defaultKey(); S.field = S.byKey[S.sel].group; }
      if (pending && !S.run && S.view === "start" && tryQuery()) return;
      if (S.view === "start") { const f = document.activeElement, sel = f && root.contains(f) && (f.dataset.field ? `[data-field="${f.dataset.field}"]` : f.dataset.mode ? `[data-mode="${f.dataset.mode}"]` : f.dataset.act ? `[data-act="${f.dataset.act}"]` : null); renderStart(); if (sel) { const n = screen.querySelector(sel); if (n) n.focus(); } }
    });
    renderStart();
    if (!pending) tryQuery();
    else if (S.pState === "loading") { const b = screen.querySelector('[data-act="go"]'); if (b) { b.disabled = true; b.textContent = "Loading the product roles…"; } }
  }

  window.Games = window.Games || {};
  window.Games["higher-or-lower"] = { mount };
})();
