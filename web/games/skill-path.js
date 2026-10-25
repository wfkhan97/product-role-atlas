/* Skill path — a game on the skill map (games/skill-path/README.md). Get from where you are (a field, or a role you
   hold) to a role you want by hopping between linked skills, inside a hop budget, then compare your route with the
   shortest one. Two parts in one file, UMD like atlas.js:
   - logic: pure, no DOM, loads in node (evals/skill_path.mjs). The board, arrival and start skills, the shortest
     route, the choice rule, a round as a small state machine, rank, route fit, build next, the random pairings.
   - ui: the start, play and end screens in the shared shell (web/gameshell.js: one header, 1 to 4 choose, Enter goes
     on, Esc quits, one record). Play first (SP1): one line from the profile's field to the role the player came from
     (else Product Manager) and Go; no difficulty, the budget is par plus two; "Change route" behind it. Registers
     window.Games["skill-path"] = { mount } for play() in app.js.
   Colours keep their meaning: green = you (route, Yes, chosen), blue = the postings' numbers and the arrival skills,
   amber = Not yet and build next. Skill areas are text. Desktop only, like the rest. */
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;   // node: require("web/games/skill-path.js").logic
  else { root.Games = root.Games || {}; root.Games["skill-path"] = { mount: mod.mount }; root.SkillPath = mod; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // =====================================================================================================
  // logic
  // =====================================================================================================
  const DIFFICULTY = {
    easy: { label: "Easy", par: [2, 2], margin: 3, help: true },
    normal: { label: "Normal", par: [3, 4], margin: 2, help: false },
    hard: { label: "Hard", par: [5, 6], margin: 1, help: false },
  };
  const LEVELS = ["easy", "normal", "hard"];
  const ARRIVE = { n: 3, minShare: 0.25, maxLift: 4 };
  const START = { minShare: 0.05, maxLift: 4 };
  const CHOICES = 4, EPS = 1e-9;
  const isCred = s => !s || s.cluster === "credentials" || String(s.id).startsWith("yoe_");
  const isDomain = s => !!s && s.cluster === "domain";
  const byId = list => Object.fromEntries(list.map(s => [s.id, s]));

  // The board: the MBA index's skills and links, without credentials (and yoe_*) and without the generic skills.
  // A skill left with no link drops off. adj[id] = [[neighbour, jaccard]], strongest link first.
  function buildBoard(M, generic) {
    const skill = byId(M.skills), gen = new Set(generic || []);
    const keep = id => skill[id] && !isCred(skill[id]) && !gen.has(id);
    const adj = {}, seen = new Set(); let links = 0;
    for (const e of M.edges) {
      if (!keep(e.source) || !keep(e.target) || e.source === e.target) continue;
      const k = e.source < e.target ? e.source + "|" + e.target : e.target + "|" + e.source;
      if (seen.has(k)) continue; seen.add(k);
      (adj[e.source] ||= []).push([e.target, e.jaccard]); (adj[e.target] ||= []).push([e.source, e.jaccard]); links++;
    }
    for (const k in adj) adj[k].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const ids = M.skills.map(s => s.id).filter(id => adj[id]);
    return { ids, has: new Set(ids), adj, links, skill, generic: M.skills.map(s => s.id).filter(id => gen.has(id)), total: M.skills.length };
  }
  // one connected piece? (for the eval and as a guard)
  function pieces(B) {
    const seen = new Set(); let n = 0;
    for (const id of B.ids) { if (seen.has(id)) continue; n++; const q = [id]; seen.add(id); while (q.length) { const c = q.pop(); for (const [nb] of B.adj[c]) if (!seen.has(nb)) { seen.add(nb); q.push(nb); } } }
    return n;
  }

  // The blue number: the share of a role's postings that ask for a skill, exactly as the role screen shows it.
  // MBA role: graph_mba.json by_family; product role: graph.json by_family, null ("not read") for an MBA-only skill.
  function shareFn(ix, P, roleId) {
    const r = ix.roles[roleId];
    if (!r) return () => null;
    if (r.set === "product") return sid => { const s = P && P.skillById[sid]; return s ? ((s.by_family || {})[r.family] || 0) : null; };
    return sid => (((ix.skillById[sid] || {}).by_family || {})[r.family]) || 0;
  }

  // The three skills that most set a role apart: share x min(4, share / baseline), share >= 0.25, not domain.
  function arrivalSkills(B, baseline, share) {
    return B.ids.map(id => [id, share(id)])
      .filter(([id, w]) => w != null && w >= ARRIVE.minShare && !isDomain(B.skill[id]))
      .map(([id, w]) => [id, w * Math.min(ARRIVE.maxLift, w / (baseline[id] || EPS))])
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, ARRIVE.n).map(([id]) => id);
  }
  // A field's start: the skill with the highest w x min(4, w / mean over the fields), w >= 0.05 (topSkills in
  // skillmap.js), not domain, on the board. FS = the skill map's field shares; fields = the field ids on the map.
  function fieldStart(B, FS, gid, fields) {
    const v = FS[gid] || {}, mean = id => fields.reduce((a, g) => a + ((FS[g] || {})[id] || 0), 0) / fields.length || EPS;
    const best = Object.entries(v).filter(([id, w]) => w >= START.minShare && B.has.has(id) && !isDomain(B.skill[id]))
      .map(([id, w]) => [id, w * Math.min(START.maxLift, w / mean(id))]).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    return best ? best[0] : null;
  }

  // dist[s]: hops from s to the nearest of the sources (multi-source BFS)
  function distances(B, sources) {
    const d = {}, q = [];
    for (const s of sources) if (B.has.has(s) && d[s] == null) { d[s] = 0; q.push(s); }
    for (let i = 0; i < q.length; i++) { const c = q[i]; for (const [nb] of B.adj[c]) if (d[nb] == null) { d[nb] = d[c] + 1; q.push(nb); } }
    return d;
  }
  // Of the routes with par hops, the one with the highest sum of blue numbers ("not read" = 0), then of Jaccard.
  function shortestRoute(B, dist, start, share) {
    if (dist[start] == null) return null;
    const memo = {};
    const best = id => {
      if (memo[id]) return memo[id];
      if (dist[id] === 0) return (memo[id] = { path: [id], s: 0, j: 0 });
      let b = null;
      for (const [nb, j] of B.adj[id]) {
        if (dist[nb] !== dist[id] - 1) continue;
        const r = best(nb), s = r.s + (share(nb) || 0), jj = r.j + j;
        if (!b || s > b.s + EPS || (Math.abs(s - b.s) <= EPS && jj > b.j + EPS)) b = { path: [id, ...r.path], s, j: jj };
      }
      return (memo[id] = b);
    };
    return best(start).path;
  }

  // The choices at a hop: unvisited neighbours. First pick: a neighbour one hop closer (the highest blue number; if
  // none is unvisited, the neighbour with the smallest dist). Then fill to 4 with the strongest links. Shown
  // strongest link first. closer = the hop moves one closer (the easy level marks it).
  function choices(B, dist, cur, visited, share, n = CHOICES) {
    const open = B.adj[cur].filter(([id]) => !visited.has(id));
    if (!open.length) return [];
    const dc = dist[cur], s = id => share(id) || 0;
    const closer = open.filter(([id]) => dist[id] === dc - 1);
    const first = closer.length ? closer.slice().sort((a, b) => s(b[0]) - s(a[0]) || b[1] - a[1])[0]
      : open.slice().sort((a, b) => dist[a[0]] - dist[b[0]] || b[1] - a[1])[0];
    const pick = new Set([first[0], ...open.filter(x => x !== first).slice(0, n - 1).map(x => x[0])]);
    return open.filter(([id]) => pick.has(id)).map(([id, j]) => ({ id, j, closer: dist[id] === dc - 1 }));
  }

  // ---------- a pairing: everything a round needs, computed once ----------
  // ctx = { ix, P, B, FS, fields } ; from = "field" | "role"
  function setup(ctx, from, startId, targetId) {
    const { ix, P, B } = ctx, share = shareFn(ix, P, targetId);
    const arrivals = arrivalSkills(B, ix.baseline, share);
    const start = from === "field" ? fieldStart(B, ctx.FS, startId, ctx.fields) : arrivalSkills(B, ix.baseline, shareFn(ix, P, startId))[0] || null;
    const dist = distances(B, arrivals), par = start != null && dist[start] != null ? dist[start] : null;
    const short = par != null ? shortestRoute(B, dist, start, share) : null;
    return { from, startId, targetId, start, arrivals, dist, par, short, share, shortFit: short ? routeFit(short.slice(1), share) : null };
  }
  // why a pairing cannot be played: "same-field", "self", "par0", "none", or null
  function refusal(ix, from, startId, targetId, su) {
    const t = ix.roles[targetId];
    if (!t) return "none";
    if (from === "field" && t.group === startId) return "same-field";
    if (from === "role" && startId === targetId) return "self";
    if (!su || su.start == null || su.arrivals.length < ARRIVE.n || su.par == null) return "none";
    if (su.par === 0) return "par0";
    return null;
  }
  const budgetFor = (par, level) => par + DIFFICULTY[level].margin;

  // ---------- a round: choose -> check -> (choose | arrived | out) ----------
  function newRound(su, level) {
    const budget = budgetFor(su.par, level);
    return { su, level, budget, cur: su.start, path: [su.start], stack: [su.start], visited: new Set([su.start]), hops: [], used: 0, phase: "choose", stopped: false };
  }
  // what the player may do now: { list: [{ id, j, closer, revisit }], back: id | null }
  function optionsOn(R, B) {
    if (R.phase !== "choose") return { list: [], back: null };
    const list = choices(B, R.su.dist, R.cur, R.visited, R.su.share);
    if (list.length) return { list, back: null };
    if (R.stack.length > 1) return { list: [], back: R.stack[R.stack.length - 2] };
    // at the start with every neighbour visited: hop back onto a linked skill (strongest link first)
    return { list: B.adj[R.cur].slice(0, CHOICES).map(([id, j]) => ({ id, j, closer: R.su.dist[id] === R.su.dist[R.cur] - 1, revisit: true })), back: null };
  }
  function hop(R, B, id) {
    const op = optionsOn(R, B), c = op.list.find(x => x.id === id);
    if (!c) return false;
    const blue = id2 => R.su.share(id2) || 0, top = Math.max(...op.list.map(x => blue(x.id)));
    const revisit = R.visited.has(id);
    R.hops.push({ id, kind: revisit ? "revisit" : "hop", yes: null, biggest: blue(id) >= top - EPS, closer: c.closer, shown: op.list.map(x => x.id) });
    R.used++; R.cur = id; R.path.push(id); R.stack.push(id); R.visited.add(id);
    if (revisit) settle(R); else R.phase = "check";
    return true;
  }
  function answer(R, yes) {
    if (R.phase !== "check") return false;
    R.hops[R.hops.length - 1].yes = !!yes; settle(R); return true;
  }
  function stepBack(R, B) {
    const op = optionsOn(R, B); if (!op.back) return false;
    R.stack.pop(); R.cur = op.back; R.path.push(op.back); R.used++;
    R.hops.push({ id: op.back, kind: "back", yes: null });
    settle(R); return true;
  }
  function stop(R) { if (R.phase === "arrived" || R.phase === "out") return false; R.phase = "out"; R.stopped = true; return true; }
  function settle(R) { R.phase = R.su.arrivals.includes(R.cur) ? "arrived" : R.used >= R.budget ? "out" : "choose"; }
  const checked = R => R.hops.filter(h => h.kind === "hop");

  // route fit: the mean blue number over the skills hopped onto ("not read" left out); null when none was read
  function routeFit(ids, share) {
    const v = ids.map(share).filter(x => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  function fitOf(R) { return routeFit(checked(R).map(h => h.id), R.su.share); }
  function rank(arrived, used, par, fit, shortFit) {
    if (!arrived) return "Still on the road";
    const over = used - par;
    if (over <= 0) return (fit == null ? 0 : fit) >= (shortFit == null ? 0 : shortFit) - EPS ? "Cartographer" : "Pathfinder";
    return over === 1 ? "Navigator" : over === 2 ? "Commuter" : "Scenic route";
  }
  function result(R) {
    const arrived = R.phase === "arrived", fit = fitOf(R), su = R.su;
    return { arrived, used: R.used, par: su.par, budget: R.budget, fit, shortFit: su.shortFit, rank: rank(arrived, R.used, su.par, fit, su.shortFit), short: arrived ? 0 : su.dist[R.cur], yes: checked(R).filter(h => h.yes).length, checked: checked(R).length, stopped: R.stopped };
  }
  // build next: the Not yet hop with the highest blue number (no domain, no "not read"); else the arrival skill
  // reached, or (out of hops) the arrival skill nearest to where the round stopped
  function buildNext(R, B) {
    const su = R.su;
    const no = checked(R).filter(h => h.yes === false && !isDomain(B.skill[h.id]) && su.share(h.id) != null).sort((a, b) => su.share(b.id) - su.share(a.id));
    if (no.length) return { id: no[0].id, why: "not-yet" };
    if (su.arrivals.includes(R.cur)) return { id: R.cur, why: "reached" };
    const d = distances(B, [R.cur]);
    const near = su.arrivals.slice().sort((a, b) => (d[a] ?? 1e9) - (d[b] ?? 1e9) || (su.share(b) || 0) - (su.share(a) || 0))[0];
    return { id: near, why: "nearest" };
  }
  // the personal leaderboard's order: arrived first, then fewer hops over par, then higher route fit, then the most
  // recent. Two rounds that did not arrive compare on hops short instead, so ending a round early never ranks higher.
  function compare(a, b) {
    return (b.arrived - a.arrived) || (a.arrived ? (a.hops - a.par) - (b.hops - b.par) : (a.short ?? 99) - (b.short ?? 99)) || ((b.fit ?? -1) - (a.fit ?? -1)) || String(b.at || "").localeCompare(String(a.at || ""));
  }

  // ---------- pairings: every start x target with its par; the random pools per difficulty ----------
  // small = a small role (few postings) on either side: never dealt at random, but can be picked by hand
  function pickable(ix) { return Object.keys(ix.roles); }
  function allPairings(ctx) {
    const { ix, P, B } = ctx, roles = pickable(ix), out = { field: [], role: [] };
    const tgt = {};
    for (const t of roles) { const share = shareFn(ix, P, t), arr = arrivalSkills(B, ix.baseline, share); tgt[t] = { arr, dist: distances(B, arr) }; }
    const fieldIds = ctx.fieldIds || ix.groups.map(g => g.id);
    for (const g of fieldIds) {
      const s = fieldStart(B, ctx.FS, g, ctx.fields);
      for (const t of roles) if (ix.roles[t].group !== g) out.field.push({ from: "field", start: g, target: t, par: s == null ? null : tgt[t].dist[s] ?? null, small: !!ix.roles[t].small });
    }
    for (const r of roles) {
      const s = tgt[r].arr[0];
      for (const t of roles) if (t !== r) out.role.push({ from: "role", start: r, target: t, par: s == null ? null : tgt[t].dist[s] ?? null, small: !!(ix.roles[t].small || ix.roles[r].small) });
    }
    return out;
  }
  function pools(pairs) {
    const out = {};
    for (const from of ["field", "role"]) {
      out[from] = {};
      for (const lv of LEVELS) { const [lo, hi] = DIFFICULTY[lv].par; out[from][lv] = pairs[from].filter(p => !p.small && p.par != null && p.par >= lo && p.par <= hi); }
    }
    return out;
  }
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function randomPairing(pool, seed, avoid) {
    if (!pool.length) return null;
    const r = rng(seed); let p = pool[Math.floor(r() * pool.length)];
    if (avoid && pool.length > 1) for (let i = 0; i < 8 && p.start === avoid.start && p.target === avoid.target; i++) p = pool[Math.floor(r() * pool.length)];
    return p;
  }

  const logic = { DIFFICULTY, LEVELS, buildBoard, pieces, shareFn, arrivalSkills, fieldStart, distances, shortestRoute, choices, setup, refusal, budgetFor, newRound, options: optionsOn, hop, answer, stepBack, stop, routeFit, fitOf, rank, result, buildNext, compare, pickable, allPairings, pools, randomPairing, rng, isDomain };

  // =====================================================================================================
  // ui
  // =====================================================================================================
  const SLUG = "skill-path", TITLE = "Skill path", KEEP_ROUNDS = 20, SHOW_BEST = 5;
  const FIELD_SIZE = 0.66;   // the fields drawn at the skill map's smallest bubble size, as in the mocks, so skills stay visible
  const NUM = ["no", "one", "two", "three", "four"];
  const pairKey = (from, start, target) => `${from}:${start}>${target}`;

  async function mount(el, ctx) {
    const { Atlas, esc, showAside } = ctx, GS = window.GameShell;
    const doc = document, aside = doc.getElementById("aside"), SkillMap = window.SkillMap;
    const pct = v => v == null ? "not read" : Math.round(v * 100) + "%";
    const fmt = n => Number(n).toLocaleString("en-US");
    const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    let alive = true, rz = 0;
    // storage: the games record, every access in try/catch; the game works with storage blocked. Answers are never stored.
    const store = { read: () => GS.record.game(SLUG), write: v => GS.record.saveGame(SLUG, v) };

    const S = {
      ix: null, P: null, B: null, SM: null, cx: null, ready: false, failed: null, pairs: null, pools: null,
      from: "field", startField: "marketing", startRole: null, target: "product.pm", level: "normal",   // the budget is par plus two (SP1): no difficulty is asked
      su: null, round: null, opts: null, screen: "start", view: null, hover: null, drawn: false, note: null, typed: {},
    };
    const INFO = GS.info({ rules: "Get from where you are to a role you want, one skill at a time. You can only hop along a line: two skills are linked when postings ask for both. Start on the skill your field asks for most; hop to a linked skill, one of up to four; the blue number is how often the target's postings ask for it; arrive on any of the three skills that set the target apart, . Your budget is the shortest route plus two hops.", keys: "Keys: 1 to 4 pick a hop, 1 says you can show the skill and 2 not yet, Enter starts or plays again, Esc quits.", source: "“Asked together” is the share of postings asking for either skill that ask for both; “not read” means the product postings were read for the product skills only." });
    const F = GS.frame(el, { game: TITLE, cls: "sp", info: INFO });
    const say = text => F.live(text);

    // ---------- shell: the listeners, cleanup when the route changes ----------
    const onClick = e => { const t = e.target.closest("[data-act]"); if (t && !t.disabled) act(t.dataset.act, t.dataset.v, e); };
    const onInput = e => { const t = e.target; if (t.id === "sp-target" || t.id === "sp-from-role") typed(t, e.type === "change"); };
    const onOver = e => { const t = e.target.closest('[data-act="pick"]'); setHover(t ? t.dataset.v : null); };
    const onLeave = () => setHover(null);
    const onFocus = e => { const t = e.target.closest && e.target.closest('[data-act="pick"]'); setHover(t ? t.dataset.v : null); };
    const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { if (alive) drawBoards(); }, 120); };
    el.addEventListener("click", onClick); el.addEventListener("input", onInput); el.addEventListener("change", onInput);
    el.addEventListener("mouseover", onOver); el.addEventListener("mouseleave", onLeave);
    aside.addEventListener("click", onClick); aside.addEventListener("mouseover", onOver); aside.addEventListener("mouseleave", onLeave); aside.addEventListener("focusin", onFocus);
    window.addEventListener("resize", onResize);
    const offKeys = GS.keys({
      choose(n) {
        if (!alive || S.screen !== "play") return false;
        const R = S.round;
        if (R.phase === "choose") { const c = S.opts.list[n - 1]; if (c) { doHop(c.id); return true; } return false; }
        if (R.phase === "check" && n <= 2) { doAnswer(n === 1); return true; }
        return false;
      },
      confirm() { if (!alive) return; if (S.screen === "end") act("again"); else if (S.screen === "start" || S.screen === "route") act("go"); },
    });
    function cleanup() {
      alive = false; clearTimeout(rz);
      el.removeEventListener("click", onClick); el.removeEventListener("input", onInput); el.removeEventListener("change", onInput);
      el.removeEventListener("mouseover", onOver); el.removeEventListener("mouseleave", onLeave);
      aside.removeEventListener("click", onClick); aside.removeEventListener("mouseover", onOver); aside.removeEventListener("mouseleave", onLeave); aside.removeEventListener("focusin", onFocus);
      offKeys(); window.removeEventListener("resize", onResize);
    }
    window.addEventListener("hashchange", cleanup, { once: true });

    // ---------- data: the index first (the start screen renders from it), then the board and the product set ----------
    S.ix = await Atlas.index(); if (!alive) return;
    const ix = S.ix, M = ix.M;
    const fieldOrder = M.groups.map(g => g.id).filter(id => ix.groups.some(g => g.id === id));
    const group = id => ix.groups.find(g => g.id === id) || { id, label: id, roles: [] };
    const role = id => ix.roles[id];
    const name = id => (ix.skillById[id] || {}).name || id;
    const area = id => ((M.clusters[(ix.skillById[id] || {}).cluster] || {}).label) || "";
    renderStart();
    try {
      const SM = await SkillMap.board();
      const P = await Atlas.product();
      const generic = await Atlas.genericSkills();
      if (!alive) return;
      S.SM = SM; S.P = P; S.B = buildBoard(M, generic);
      const fields = Object.keys(SM.FS).filter(g => g in SM.field);
      S.cx = { ix, P, B: S.B, FS: SM.FS, fields, fieldIds: fieldOrder };
      S.ready = true;
      defaultPairing();
    } catch (e) { console.error(e); S.failed = e.message || String(e); }
    if (alive && S.screen === "start") renderStart();

    // the default pairing (SP1): from the profile's first field (else Marketing), to the role the player came from
    // (?role=), else Product Manager; a pairing that cannot be played falls back to the largest role of another field
    function defaultPairing() {
      let you = null; try { you = JSON.parse(localStorage.getItem("you")); } catch { }
      const mine = ((you && you.fields) || []).find(f => fieldOrder.includes(f));
      S.from = "field"; S.startField = mine || (fieldOrder.includes("marketing") ? "marketing" : fieldOrder[0]);
      const q = new URLSearchParams(location.hash.split("?")[1] || "").get("role");
      const cands = [q, q && "product." + q, "product.pm", ...fieldOrder.filter(g => g !== S.startField).flatMap(g => group(g).roles.slice().sort((a, b) => ((role(b) || {}).nOpen || 0) - ((role(a) || {}).nOpen || 0)))].filter(id => id && role(id));
      for (const t of cands) { S.target = t; S.su = null; const su = currentSetup(); if (su && !refusal(ix, S.from, S.startField, t, su)) return; }
    }

    // ---------- the pairing on the start screen ----------
    function startId() { return S.from === "field" ? S.startField : S.startRole; }
    function startLabel(from = S.from, id = startId()) { return from === "field" ? group(id).label : (role(id) || {}).label || ""; }
    function startGroup(from = S.from, id = startId()) { return from === "field" ? id : (role(id) || {}).group; }
    function currentSetup() {
      if (!S.ready || !startId() || !role(S.target)) return null;
      const k = pairKey(S.from, startId(), S.target);
      if (!S.su || S.su.key !== k) { S.su = setup(S.cx, S.from, startId(), S.target); S.su.key = k; }
      return S.su;
    }
    function getPools() { if (!S.pools) { S.pairs = allPairings(S.cx); S.pools = pools(S.pairs); } return S.pools; }
    function roleOptions() {
      return fieldOrder.flatMap(g => group(g).roles.filter(r => role(r)).map(r => `<option value="${esc(role(r).label)}">${esc(group(g).label)}</option>`)).join("");
    }
    function findRole(label) { const q = String(label || "").trim().toLowerCase(); return Object.keys(ix.roles).find(id => role(id).label.toLowerCase() === q) || null; }
    function typed(input, committed) {
      const id = findRole(input.value);
      S.typed[input.id] = input.value;
      if (id) { if (input.id === "sp-target") S.target = id; else S.startRole = id; S.typed[input.id] = null; }
      if (id || committed) keepFocus(renderRoute);
    }

    // ---------- start: one line and Go (SP1); "Change route" opens the route screen ----------
    function renderStart() {
      S.screen = "start"; showAside(null);
      const su = currentSetup(), t = role(S.target), refuse = su ? refusal(ix, S.from, startId(), S.target, su) : null;
      const ok = S.ready && su && !refuse;
      const lead = !S.ready ? (S.failed ? `Something did not load: ${S.failed}. Reload the page.` : "Loading the skill map…") : ok ? `From ${startLabel()} to ${t.label} in ${su.par} ${su.par === 1 ? "hop" : "hops"}. You start on ${name(su.start)}, the skill ${startLabel()} postings ask for most, and arrive on any of the three skills that set ${t.label} apart.` : "Pick a route to play.";
      GS.start(F, { title: "Skill path", lead, playLabel: ok ? "Go" : "Loading…", play: () => act("go"), change: "Change route", extra: "" });
      const p = F.body.querySelector("#gm-play"); if (p) { p.disabled = !ok; p.setAttribute("data-act", "go"); }
      const c = F.body.querySelector("#gm-change"); if (c) { c.disabled = !S.ready; c.onclick = renderRoute; }
    }
    function renderRoute() {
      S.screen = "route"; showAside(null); F.set({ round: null, rounds: 0, role: "" });
      const ready = S.ready, su = currentSetup(), t = role(S.target), from = S.from;
      const refuse = su ? refusal(ix, from, startId(), S.target, su) : null;
      const fieldChips = fieldOrder.map(g => `<button type="button" class="chip${S.startField === g ? " on" : ""}" aria-pressed="${S.startField === g}" data-act="field" data-v="${esc(g)}">${esc(group(g).label)}</button>`).join("");
      const roleVal = S.typed["sp-from-role"] != null ? S.typed["sp-from-role"] : (role(S.startRole) || {}).label || "";
      const targetVal = S.typed["sp-target"] != null ? S.typed["sp-target"] : t ? t.label : "";
      const tg = t ? group(t.group) : null;
      const unknownTarget = S.typed["sp-target"] != null && S.typed["sp-target"].trim() !== "";
      const unknownRole = from === "role" && S.typed["sp-from-role"] != null && S.typed["sp-from-role"].trim() !== "";
      let problem = "";
      if (!ready) problem = "";
      else if (unknownTarget || unknownRole) problem = "No role has that name. Pick one from the list.";
      else if (from === "role" && !S.startRole) problem = "";
      else if (refuse === "same-field") problem = `${esc(t.label)} is a ${esc(group(S.startField).label)} role. Pick a role in another field, or start from a role you hold.`;
      else if (refuse === "self") problem = "Pick a role other than the one you hold.";
      else if (refuse === "par0") problem = `You already stand on one of the skills that end the round: ${esc(name(su.start))}. Pick another pairing.`;
      else if (refuse === "none") problem = "This pairing cannot be played on the board.";
      const canGo = ready && su && !refuse && !problem && (from === "field" || S.startRole);
      const html = `<div class="sp-start"><div class="sp-cols">
        <div>
          <h1>Change route</h1>
          <p class="lead">Where you are and the role you want. The shortest route and your budget follow.</p>
          <h2>Where are you now?</h2>
          <div class="chips sp-tabs"><button type="button" class="chip${from === "field" ? " on" : ""}" aria-pressed="${from === "field"}" data-act="from" data-v="field">A field</button><button type="button" class="chip${from === "role" ? " on" : ""}" aria-pressed="${from === "role"}" data-act="from" data-v="role">A role I hold</button></div>
          ${from === "field" ? `<div class="chips" role="group" aria-label="Your field">${fieldChips}</div>`
          : `<div class="row"><input type="search" id="sp-from-role" class="sp-search" list="sp-roles" value="${esc(roleVal)}" placeholder="${ready ? "Type a role you hold" : "Loading the roles…"}" aria-label="A role you hold" autocomplete="off">${S.startRole && role(S.startRole) ? `<span class="small muted"><a class="link" href="#/field/${esc(role(S.startRole).group)}">${esc(group(role(S.startRole).group).label)}</a></span>` : ""}</div>`}
          <h2>Where do you want to go?</h2>
          <div class="row"><input type="search" id="sp-target" class="sp-search" list="sp-roles" value="${esc(targetVal)}" placeholder="Type a target role" aria-label="Target role" autocomplete="off">${t && tg ? `<span class="small muted"><a class="link" href="#/field/${esc(tg.id)}" title="See all roles in ${esc(tg.label)}" aria-label="See all roles in ${esc(tg.label)}">${esc(tg.label)}</a> · ${fmt(t.nOpen)} postings</span>` : ""}</div>
          <datalist id="sp-roles">${roleOptions()}</datalist>
          ${problem ? `<p class="notice sp-problem">${problem}</p>` : ""}
          ${t && t.small && !problem ? `<p class="small muted">${esc(t.label)} has few postings (${fmt(t.n)}), so its numbers rest on a small sample. It is never dealt at random.</p>` : ""}
          ${S.failed ? `<p class="notice">Something did not load: ${esc(S.failed)}. Reload the page.</p>` : ""}
          ${GS.foot({ primary: { id: "sp-go", label: "Start the route", key: "Enter", disabled: !canGo, attrs: 'data-act="go"' }, quiet: { label: "Random pairing", disabled: !ready, attrs: 'data-act="random"' } })}
        </div>
        <div>
          <div class="sp-board sp-mini" id="sp-mini" data-kind="mini"></div>
          <div class="sp-brief">${brief(su, refuse)}</div>
          ${bestList()}
        </div>
      </div></div>`;
      F.body.innerHTML = html;
      drawBoards();
    }
    function brief(su, refuse) {
      if (!S.ready) return S.failed ? "" : `<p class="small muted">Loading the product postings…</p>`;
      if (!su || su.start == null || refuse === "same-field" || refuse === "self" || refuse === "none") return S.from === "role" && !S.startRole ? `<p class="small muted">Pick a role you hold. You start on the skill that sets it apart most.</p>` : "";
      const t = role(S.target), from = S.from, sid = startId();
      const startShare = from === "field" ? (S.cx.FS[sid] || {})[su.start] : shareFn(ix, S.P, sid)(su.start);
      const nRoles = from === "field" ? group(sid).roles.length : 0;
      const where = from === "field" ? `${esc(group(sid).label)} apart most: ${pct(startShare)} of postings across its ${nRoles} roles ask for it.` : `${esc(role(sid).label)} apart most: ${pct(startShare)} of its postings ask for it.`;
      const rows = su.arrivals.map(id => `<div class="r"><span class="t">${esc(name(id))}</span><span class="n sp-blue">${pct(su.share(id))}</span><span class="m">${esc(area(id))}</span></div>`).join("");
      const facts = su.par > 0 ? `<p class="facts" style="margin-top:10px">Shortest route ${plural(su.par, "hop", "hops")} · your budget ${budgetFor(su.par, S.level)}</p>` : "";
      return `<p><b class="sp-green">You start at ${esc(name(su.start))}.</b> It sets ${where}</p>
        <p><b class="sp-bluet">You arrive on any of three skills</b> that set ${esc(t.label)} apart:</p>
        <div class="list sp-zone-list">${rows}</div>${facts}`;
    }
    function bestList() {
      const st = store.read(), best = Object.values(st.best || {}).sort(compare).slice(0, SHOW_BEST);
      if (!best.length) return "";
      const gen = M.meta.generated || "";
      return `<h3 class="sp-besth">Your best routes</h3><div class="list sp-best">${best.map(b => `<button type="button" class="r${b.gen !== gen ? " sp-old" : ""}" data-act="best" data-v="${esc(b.key)}"><span class="t">${b.arrived ? `Arrived in ${plural(b.hops, "hop", "hops")}` : `${plural(b.short ?? 0, "hop", "hops")} short`}</span><span class="n">${b.fit == null ? "" : "fit " + pct(b.fit)}</span><span class="m">${esc(b.startLabel)} → ${esc(b.targetLabel)} · shortest ${b.par}${b.gen !== gen ? " · on older data" : ""}</span></button>`).join("")}</div>`;
    }

    // ---------- play ----------
    function startRound(su, level) {
      S.round = newRound(su, level); S.screen = "play"; S.view = null; S.hover = null; S.drawn = false;
      renderPlay();
      say(`${startLabel(su.from, su.startId)} to ${role(su.targetId).label}. You start at ${name(su.start)}. Shortest route ${plural(su.par, "hop", "hops")}, your budget ${S.round.budget}.`);
      focusFirst();
    }
    function renderPlay() {
      const R = S.round, su = R.su, t = role(su.targetId);
      S.opts = optionsOn(R, S.B);
      F.set({ round: Math.min(R.used, R.budget - 1), rounds: R.budget, role: `${startLabel(su.from, su.startId)} → ${t.label}` });
      const title = R.phase === "check" ? `Hop ${R.used} of ${R.budget}: ${esc(name(R.cur))}` : `Hop ${Math.min(R.used + 1, R.budget)} of ${R.budget}`;
      const strip = [`<span class="tag good">${esc(name(su.start))} <span class="sp-tagn">start</span></span>`].concat(R.hops.map((h, i) => {
        const last = i === R.hops.length - 1, curCls = last ? " sp-cur" : "";
        if (h.kind === "back") return `<span class="tag${curCls}">Back to ${esc(name(h.id))} <span class="sp-tagn">back</span></span>`;
        const cls = h.kind === "revisit" ? "" : h.yes === true ? " good" : h.yes === false ? " bad" : "";
        return `<span class="tag${cls}${curCls}">${h.yes === true ? "✓ " : ""}${esc(name(h.id))} <span class="sp-tagn">${pct(su.share(h.id))}${h.yes === false ? " · not yet" : ""}</span></span>`;
      })).join(`<span class="sp-arrow" aria-hidden="true">→</span>`);
      let key;
      if (R.phase === "check") {
        const open = S.B.adj[R.cur].filter(([id]) => !R.visited.has(id)), ends = open.filter(([id]) => su.arrivals.includes(id)).length;
        key = `The faint lines are where you can go from here.${ends ? ` ${cap(NUM[ends])} of them ${ends === 1 ? "ends" : "end"} the round.` : ""}`;
      } else key = "Green: your route; ✓ you can show it. Blue rings: the three skills that end the round. Hollow dots: skills most roles ask for, so they are not a hop.";
      F.body.innerHTML = `<div class="sp-play">
        <div class="sp-head"><h1>${title}</h1><span class="facts">${plural(R.budget - R.used, "hop", "hops")} left · shortest route ${su.par}</span></div>
        <div class="sp-board" id="sp-board" data-kind="play"></div>
        <div class="sp-strip">${strip}</div>
        <p class="gm-key">${key}</p>
      </div>`;
      drawBoards();
      renderPlayAside();
    }
    function renderPlayAside() {
      const R = S.round, su = R.su, t = role(su.targetId), op = S.opts;
      let html;
      if (R.phase === "check") {
        const s = ix.skillById[R.cur] || {}, sh = su.share(R.cur), arrived = su.arrivals.includes(R.cur);
        const open = S.B.adj[R.cur].filter(([id]) => !R.visited.has(id)).length;
        const next = arrived ? "This is one of the three skills that end the round." : R.used >= R.budget ? "That was your last hop." : `Next: ${plural(open, "linked skill", "linked skills")} from here. You will see up to ${CHOICES}.`;
        html = `<p class="eyebrow">${esc(area(R.cur))}</p>
          <h2 class="sp-h2">${esc(s.name)}</h2>
          ${s.what ? `<p class="small">${esc(s.what)}</p>` : ""}
          <p class="facts">${sh == null ? `${esc(t.label)} postings were not read for this skill` : `<span class="sp-blue">${pct(sh)}</span> of ${esc(t.label)} postings ask for it`}</p>
          <div class="sp-q">
            <p class="sp-qt" id="sp-qt" tabindex="-1">Can you already show it?</p>
            <p class="small muted">A line of work, a project or a course you could point to. Your own read; it picks the skill to build next.</p>
            <div class="sp-ans"><button type="button" class="btn primary" data-act="yes">Yes, on my resume <kbd>1</kbd></button><button type="button" class="btn" data-act="no">Not yet <kbd>2</kbd></button></div>
          </div>
          <p class="small muted" style="margin-top:16px">${next}</p>`;
      } else {
        const help = DIFFICULTY[R.level].help;
        const items = op.list.map((c, i) => {
          const sh = su.share(c.id);
          return `<button type="button" class="skill sp-choice" data-act="pick" data-v="${esc(c.id)}" data-key="${i + 1}"><span class="sp-k" aria-hidden="true">${i + 1}</span><span class="sp-cn"><span class="def">${esc(name(c.id))}</span><span class="sp-meta">${esc(area(c.id))} · asked together ${pct(c.j)}${help && c.closer ? ' · <span class="sp-towards">towards the target</span>' : ""}${c.revisit ? " · visited" : ""}</span></span><span class="pct${sh == null ? "" : " sp-blue"}">${pct(sh)}</span><span class="bar"><i style="width:${Math.round((sh || 0) * 100)}%"></i></span></button>`;
        }).join("");
        const back = op.back ? `<p class="small">No linked skill is left that you have not visited.</p><div class="sp-ans"><button type="button" class="btn" data-act="back">Step back to ${esc(name(op.back))}</button></div><p class="small muted" style="margin-top:8px">Stepping back costs a hop.</p>` : "";
        const revisit = op.list.length && op.list[0].revisit ? `<p class="small muted" style="margin-top:10px">Every skill linked to this one is visited. Hop back onto one of them; it costs a hop.</p>` : "";
        html = `<p class="eyebrow">Your next hop</p>
          <h2 class="sp-h2">From ${esc(name(R.cur))}</h2>
          ${items ? `<div class="sp-choices">${items}</div>` : back}${revisit}
          ${items ? `<p class="gm-key">The blue number: % of ${esc(t.label)} postings that ask for it.</p>` : ""}
          <p class="small" style="margin-top:14px"><button type="button" class="linkish link" data-act="end-yes">End the round here</button></p>`;
      }
      showAside(`<div class="sp-aside">${html}</div>`);
      if (R.phase === "choose" && R.used === 0) GS.coachOnce(SLUG, aside.querySelector(".sp-aside"), `Pick a linked skill, 1 to 4. The blue number is the share of ${t.label} postings that ask for it. The round ends when you reach one of the three skills that set ${t.label} apart.`);
    }
    function focusFirst() {
      const R = S.round; if (!R) return;
      const t = R.phase === "check" ? aside.querySelector("#sp-qt") : aside.querySelector('[data-act="pick"], [data-act="back"]');
      if (t) t.focus({ preventScroll: true });
    }
    function doHop(id) {
      const R = S.round; S.hover = null;
      if (!hop(R, S.B, id)) return;
      const h = R.hops[R.hops.length - 1];
      if (h.kind === "revisit") { afterSettle(); return; }
      renderPlay();
      const sh = R.su.share(id), t = role(R.su.targetId).label;
      say(`Hop ${R.used} of ${R.budget}: ${name(id)}. ${sh == null ? `${t} postings were not read for it.` : `${pct(sh)} of ${t} postings ask for it.`} Can you already show it?`);
      focusFirst();
    }
    function doAnswer(yes) { const R = S.round; if (!answer(R, yes)) return; afterSettle(); }
    function doBack() { const R = S.round; if (!stepBack(R, S.B)) return; afterSettle(true); }
    function afterSettle(back) {
      const R = S.round;
      if (R.phase === "arrived" || R.phase === "out") return endRound();
      renderPlay();
      const n = S.opts.list.length;
      say(`${back ? `Stepped back to ${name(R.cur)}. ` : ""}Hop ${R.used + 1} of ${R.budget}. ${n ? `${cap(NUM[n] || String(n))} ${n === 1 ? "choice" : "choices"} from ${name(R.cur)}.` : "No new skill is linked; you can step back."}`);
      focusFirst();
    }
    function endRound() {
      const R = S.round;
      if (R.phase !== "arrived" && R.phase !== "out") stop(R);
      S.result = result(R); S.build = buildNext(R, S.B); S.screen = "end"; S.drawn = false; S.view = null;
      const was = record(R, S.result);
      renderEnd(was);
      const t = role(R.su.targetId).label;
      say(S.result.arrived ? `Arrived at ${name(R.cur)} in ${plural(R.used, "hop", "hops")}; the shortest route takes ${R.su.par}.` : `${plural(S.result.short, "hop", "hops")} short of ${t}.`);
      F.focusMeasure();
    }
    // the record: the last 20 rounds and the best round per pairing (arrived first, then fewer hops over par, then fit)
    function record(R, res) {
      const su = R.su, st = store.read(), now = new Date();
      const row = { key: pairKey(su.from, su.startId, su.targetId), from: su.from, start: su.startId, target: su.targetId, startLabel: startLabel(su.from, su.startId), targetLabel: role(su.targetId).label, level: R.level, arrived: res.arrived, hops: res.used, par: su.par, short: res.short, fit: res.fit, at: now.toISOString(), day: now.toLocaleDateString("en-CA"), gen: M.meta.generated || "" };
      const rounds = [row, ...(Array.isArray(st.rounds) ? st.rounds : [])].slice(0, KEEP_ROUNDS);
      const best = st.best && typeof st.best === "object" ? { ...st.best } : {};
      const old = best[row.key], lastSame = (Array.isArray(st.rounds) ? st.rounds : []).find(x => x.key === row.key) || null;
      const isBest = !old || old.gen !== row.gen || compare(row, old) < 0;
      if (isBest) best[row.key] = row;
      store.write({ played: true, rounds, best });
      return { old: old && old.gen === row.gen ? old : null, isBest, lastSame };
    }

    // ---------- end screen: the measure in plain words, the change since last time, the two routes, build next ----------
    function renderEnd(was) {
      showAside(null);
      const R = S.round, su = R.su, res = S.result, t = role(su.targetId), tg = group(t.group), sg = startGroup(su.from, su.startId);
      const link = () => `#/role/${encodeURIComponent(su.targetId)}`;
      const row = (id, n, cls) => `<a class="r${cls || ""}" href="${link(id)}"><span class="t">${esc(name(id))}</span><span class="n">${n}</span></a>`;
      const blue = id => su.share(id) == null ? "not read" : `<span class="sp-blue">${pct(su.share(id))}</span>`;
      const mine = [row(su.start, "start")].concat(R.hops.map(h => h.kind === "back" ? row(h.id, "back") : row(h.id, blue(h.id), h.kind === "revisit" ? "" : h.yes ? " sp-yes" : h.yes === false ? " sp-no" : ""))).join("");
      const short = su.short.map((id, i) => row(id, i ? blue(id) : "start")).join("");
      let lead;
      if (res.arrived) lead = `The shortest route takes ${su.par}. You can show ${res.yes} of your ${plural(res.checked, "hop", "hops")}.`;
      else {
        lead = res.stopped ? `You ended the round after ${plural(res.used, "hop", "hops")}.` : `${plural(res.used, "hop", "hops")} used.`;
        const hopped = R.hops.filter(h => h.kind === "hop");
        if (hopped.length >= 2 && hopped.every(h => h.biggest)) {
          const FS = S.cx.FS, gs = S.cx.fields, nearF = gs.slice().sort((a, b) => ((FS[b] || {})[R.cur] || 0) - ((FS[a] || {})[R.cur] || 0))[0];
          lead += ` Your route took the biggest blue numbers${nearF && nearF !== t.group ? ` and drifted towards ${esc(group(nearF).label.toLowerCase())}` : ""}.`;
        }
        const mid = su.short.slice(1, -1).filter(id => su.share(id) != null).sort((a, b) => su.share(a) - su.share(b))[0];
        if (mid) lead += ` The shortest goes through ${esc(name(mid))}, which only ${pct(su.share(mid))} of ${esc(t.label)} postings ask for.`;
      }
      const fitLine = f => `<p class="facts">route fit ${f == null ? "not read" : pct(f)}</p>`;
      const b = S.build, bs = ix.skillById[b.id] || {};
      const steps = Array.isArray(bs.build) && bs.build.length ? bs.build : bs.build && typeof bs.build === "object" && Array.isArray(bs.build[t.ladder]) ? bs.build[t.ladder].map(x => typeof x === "string" ? x : x.text) : null;
      const why = b.why === "not-yet" ? `The skill on your route that ${esc(t.label)} postings ask for most and that you cannot show yet.` : b.why === "reached" ? `You can show every hop. This is the skill that ended the round, and ${esc(t.label)} postings ask for it most of your route.` : `You can show every hop. This is the skill that ends the round nearest to where you stopped.`;
      const last = was.lastSame;
      const change = !last ? "Your first round on this pairing." : (res.arrived && !last.arrived) ? "Last time you did not arrive." : (!res.arrived && last.arrived) ? `Last time you arrived in ${plural(last.hops, "hop", "hops")}.` : res.arrived ? (res.used < last.hops ? `Fewer hops than last time (${last.hops}).` : res.used > last.hops ? `More hops than last time (${last.hops}).` : "The same as last time.") : (res.short < (last.short ?? 99) ? `Closer than last time (${last.short} short).` : "No closer than last time.");
      const rec = `${change}${was.isBest && was.old ? " A new best for this pairing." : was.old ? ` Your best: ${was.old.arrived ? `arrived in ${plural(was.old.hops, "hop", "hops")}` : `${plural(was.old.short ?? 0, "hop", "hops")} short`}.` : ""}`;
      F.set({ round: R.budget, rounds: R.budget, role: `${startLabel(su.from, su.startId)} → ${t.label}` });
      F.body.innerHTML = GS.results({
        cls: "sp-end",
        eyebrow: `${esc(startLabel(su.from, su.startId))} → ${esc(t.label)} · ${R.level}`,
        measure: res.arrived ? `Arrived in ${plural(res.used, "hop", "hops")} · shortest ${su.par}` : `${plural(res.short, "hop", "hops")} short of ${esc(t.label)}`,
        record: rec,
        takeaway: lead,
        visual: `<div class="sp-cols e">
          <div><div class="sp-board sp-endboard" id="sp-endboard" data-kind="end"></div>
            <p class="gm-key"><span class="sp-green">Green</span>: your route, ✓ you can show it. <span class="sp-amber">Amber</span>: not yet. Dashed: the shortest route${res.arrived ? "" : ` (${plural(su.par, "hop", "hops")})`}. Blue rings: where the round ends.</p></div>
          <div class="sp-endside">
            <div class="sp-two">
              <div><h3>Your route</h3><div class="list sp-rl">${mine}</div>${res.arrived ? fitLine(res.fit) : ""}</div>
              <div><h3>Shortest route</h3><div class="list sp-rl">${short}</div>${res.arrived ? fitLine(su.shortFit) : ""}</div>
            </div>
            <div class="sp-build">
              <p class="eyebrow">Build next</p>
              <p class="sp-bt"><a href="${link(b.id)}">${esc(name(b.id))}</a> <span class="sp-blue mono">${pct(su.share(b.id))}</span></p>
              <p class="small muted">${why}</p>
              ${steps ? `<ul class="plain">${steps.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : `<p class="small muted">Build steps for this skill are not written yet.</p>`}
            </div>
            <p class="small muted" style="margin-top:10px"><a class="link" href="#/explore?field=${encodeURIComponent(sg)}">${esc(group(sg).label)} on the skill map</a> · <a class="link" href="#/field/${encodeURIComponent(tg.id)}">All ${esc(tg.label)} roles</a></p>
          </div></div>`,
        link: { href: link(), label: `Open ${t.label}` },
        foot: GS.foot({ primary: { label: res.arrived ? "Play again" : "Try this pairing again", key: "Enter", attrs: 'data-act="again"' }, quiet: { label: "Change route", attrs: 'data-act="route"' } }),
      });
      drawBoards();
    }

    // ---------- actions ----------
    function act(a, v) {
      if (a === "from") { S.from = v; S.typed = {}; renderRoute(); return; }
      if (a === "field") { S.startField = v; renderRoute(); return; }
      if (a === "go") { const su = currentSetup(); if (su && !refusal(ix, S.from, startId(), S.target, su)) startRound(su, S.level); return; }
      if (a === "random" || a === "random-end") { dealRandom(); return; }
      if (a === "best") { const b = (store.read().best || {})[v]; if (b) { setPairing(b.from, b.start, b.target); renderRoute(); focusGo(); } return; }
      if (a === "route") { renderRoute(); return; }
      if (a === "pick") { if (S.screen === "play" && S.round.phase === "choose") doHop(v); return; }
      if (a === "yes" || a === "no") { doAnswer(a === "yes"); return; }
      if (a === "back") { doBack(); return; }
      if (a === "end-yes") { endRound(); return; }
      if (a === "again") { const su = S.round.su; startRound(su, S.round.level); return; }
    }
    function setPairing(from, start, target) {
      S.from = from; S.typed = {}; S.target = target;
      if (from === "field") S.startField = start; else S.startRole = start;
    }
    function dealRandom() {
      if (!S.ready) return;
      const pool = getPools()[S.from][S.level];
      const p = randomPairing(pool, (Date.now() ^ Math.floor(Math.random() * 1e9)) | 0, { start: startId(), target: S.target });
      if (!p) return;
      setPairing(p.from, p.start, p.target); renderRoute();
      say(`Random pairing: ${startLabel()} to ${role(S.target).label}, shortest route ${plural(p.par, "hop", "hops")}.`);
      focusGo();
    }
    function focusGo() { const g = el.querySelector("#sp-go"); if (g) g.focus({ preventScroll: true }); }
    function keepFocus(fn) {
      const a = doc.activeElement, id = a && a.id, act2 = a && a.dataset && a.dataset.act, v = a && a.dataset && a.dataset.v;
      const sel = a && typeof a.selectionStart === "number" ? [a.selectionStart, a.selectionEnd] : null;
      fn();
      let n = id ? doc.getElementById(id) : act2 ? el.querySelector(`[data-act="${act2}"]${v ? `[data-v="${CSS.escape(v)}"]` : ""}`) : null;
      if (n) { n.focus({ preventScroll: true }); if (sel && n.setSelectionRange) try { n.setSelectionRange(sel[0], sel[1]); } catch { } }
    }

    // ---------- the board: the skill map's own positions, drawn as one SVG ----------
    function setHover(id) {
      if (S.screen !== "play" || !S.round || S.round.phase !== "choose") return;
      if (id && !S.opts.list.some(c => c.id === id)) id = null;
      if (id === S.hover) return;
      S.hover = id; drawBoards();
    }
    function drawBoards() {
      el.querySelectorAll(".sp-board[data-kind]").forEach(box => {
        const kind = box.dataset.kind, w = box.clientWidth; if (!w || !S.ready) { if (!S.ready) box.style.height = Math.round((w || 392) * 0.6) + "px"; return; }
        const ratio = kind === "mini" ? 0.6 : kind === "end" ? 0.62 : 0.5625;
        let h = Math.round(w * ratio);
        if (kind === "play") h = Math.max(340, Math.min(h, window.innerHeight - 330));
        box.style.height = "";
        box.innerHTML = boardSvg(kind, w, h);
      });
    }
    function scene(kind) {
      if (kind === "mini") {
        const su = currentSetup(), sid = startId();
        if (!su || su.start == null) return { fields: [startGroup(), (role(S.target) || {}).group].filter(Boolean), route: [], arrivals: su ? su.arrivals : [], here: null };
        return { fields: [startGroup(S.from, sid), role(S.target).group], route: [su.start], arrivals: su.arrivals, here: null, startOnly: true };
      }
      const R = S.round, su = R.su;
      const gaps = new Set(R.hops.filter(h => h.kind === "hop" && h.yes === false).map(h => h.id));
      const sc = { fields: [startGroup(su.from, su.startId), role(su.targetId).group], route: R.path, gaps, arrivals: su.arrivals, here: kind === "play" ? R.cur : null };
      if (kind === "play" && R.phase === "choose") { sc.cands = S.opts.list; sc.look = S.hover; }
      if (kind === "play" && R.phase === "check") sc.lookAll = R.cur;
      if (kind === "end") sc.short = su.short;
      return sc;
    }
    function boardSvg(kind, w, h) {
      const SM = S.SM, B = S.B, sc0 = scene(kind), at = id => SM.byId[id], rF = SM.rField * FIELD_SIZE, mini = kind === "mini";
      // what the view must hold: the two fields, the start, the arrival skills, the route, the choices, the shortest route
      const pts = [];
      for (const g of sc0.fields) if (SM.field[g]) pts.push([SM.field[g][0], SM.field[g][1], rF]);
      for (const id of [...sc0.route, ...sc0.arrivals, ...(sc0.cands || []).map(c => c.id), ...(sc0.short || [])]) if (at(id)) pts.push([at(id).x, at(id).y, 0.02]);
      let v = { x0: Math.min(...pts.map(p => p[0] - p[2])), x1: Math.max(...pts.map(p => p[0] + p[2])), y0: Math.min(...pts.map(p => p[1] - p[2])), y1: Math.max(...pts.map(p => p[1] + p[2])) };
      if (kind === "play" && S.view) v = { x0: Math.min(v.x0, S.view.x0), x1: Math.max(v.x1, S.view.x1), y0: Math.min(v.y0, S.view.y0), y1: Math.max(v.y1, S.view.y1) };   // the view only grows during a round
      if (kind === "play") S.view = v;
      const padX = 0.07, padY = 0.03, bw = v.x1 - v.x0 + 2 * padX, bh = v.y1 - v.y0 + 2 * padY, fit = Math.min(w / SM.A, h);
      const sc = Math.max(fit, Math.min(w / bw, h / bh, fit * (mini ? 2 : 2.6))), cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
      const X = x => w / 2 + (x - cx) * sc, Y = y => h / 2 + (y - cy) * sc, P = id => [X(at(id).x), Y(at(id).y)];
      const f1 = n => n.toFixed(1), k = mini ? 0.7 : 1;
      const onF = new Set(sc0.fields), boxes = [];
      let s = `<svg class="sp-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(altText(kind, sc0))}">`;
      // fields: the map's circles, the two in play outlined
      for (const g of S.cx.fields) {
        const f = SM.field[g]; if (!f) continue;
        const fx = X(f[0]), fy = Y(f[1]), r = rF * sc; if (fx + r < 0 || fx - r > w || fy + r < 0 || fy - r > h) continue;
        const label = group(g).label, two = label.length > 12 && label.includes(" & ") ? [label.slice(0, label.indexOf(" & ")), label.slice(label.indexOf(" & ") + 1)] : [label], on = onF.has(g) ? " on" : "";
        two.forEach((l, i) => { const tw = l.length * 7.1; boxes.push([fx - tw / 2, fy - 9 + (two.length > 1 ? i * 15 - 7.5 : 0), tw, 14]); });
        s += `<circle class="sp-field${on}" cx="${f1(fx)}" cy="${f1(fy)}" r="${f1(r)}"/>`;
        s += two.length === 1 ? `<text class="sp-flabel${on}" x="${f1(fx)}" y="${f1(fy + 4)}" text-anchor="middle">${esc(label)}</text>`
          : `<text class="sp-flabel${on}" x="${f1(fx)}" y="${f1(fy - 3.5)}" text-anchor="middle">${esc(two[0])}</text><text class="sp-flabel${on}" x="${f1(fx)}" y="${f1(fy + 11.5)}" text-anchor="middle">${esc(two[1])}</text>`;
      }
      // every link on the board, faint
      let d = "";
      for (const a of B.ids) for (const [b] of B.adj[a]) if (a < b) { const p = P(a), q = P(b); d += `M${f1(p[0])} ${f1(p[1])}L${f1(q[0])} ${f1(q[1])}`; }
      s += `<path class="sp-e" d="${d}"/>`;
      // the dots: board skills filled, generic skills hollow (not hops)
      for (const id of B.ids) { const [x, y] = P(id); if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue; s += `<circle class="sp-n" cx="${f1(x)}" cy="${f1(y)}" r="${f1((2 + 4.5 * Math.sqrt(at(id).share || 0)) * k)}"/>`; }
      for (const id of B.generic) { if (!at(id)) continue; const [x, y] = P(id); s += `<circle class="sp-gen" cx="${f1(x)}" cy="${f1(y)}" r="${f1(4.5 * k)}"/>`; }
      const lines = (from, to) => to.map(t => { const p = P(from), q = P(t); return `M${f1(p[0])} ${f1(p[1])}L${f1(q[0])} ${f1(q[1])}`; }).join("");
      if (sc0.lookAll) s += `<path class="sp-look" d="${lines(sc0.lookAll, B.adj[sc0.lookAll].map(x => x[0]))}"/>`;
      if (sc0.look) s += `<path class="sp-look" d="${lines(sc0.look, B.adj[sc0.look].map(x => x[0]))}"/>`;
      if (sc0.cands && sc0.here) for (const c of sc0.cands) s += `<path class="sp-cand-e" style="stroke-width:${(1 + 8 * c.j).toFixed(1)}" d="${lines(sc0.here, [c.id])}"/>`;
      const poly = ids => ids.map((id, i) => { const [x, y] = P(id); return (i ? "L" : "M") + f1(x) + " " + f1(y); }).join("");
      if (sc0.short) s += `<path class="sp-short" d="${poly(sc0.short)}"/>`;
      if (sc0.route.length > 1) s += `<path class="sp-route${kind === "end" && !S.drawn ? " draw" : ""}" pathLength="1" d="${poly(sc0.route)}"/>`;
      if (kind === "end") S.drawn = true;
      for (const id of sc0.arrivals) { const [x, y] = P(id); s += `<circle class="sp-zone" cx="${f1(x)}" cy="${f1(y)}" r="${f1(9 * k)}"/><circle class="sp-zone-dot" cx="${f1(x)}" cy="${f1(y)}" r="${f1(4 * k)}"/>`; }
      const onRoute = new Set(sc0.route);
      if (sc0.short) for (const id of sc0.short.slice(1, -1)) if (!onRoute.has(id)) { const [x, y] = P(id); s += `<circle class="sp-short-n" cx="${f1(x)}" cy="${f1(y)}" r="4"/>`; }
      (sc0.cands || []).forEach((c, i) => { const [x, y] = P(c.id); s += `<g class="sp-pick" data-act="pick" data-v="${esc(c.id)}"><title>${esc(name(c.id))}</title><circle class="sp-cand" cx="${f1(x)}" cy="${f1(y)}" r="7"/><text class="sp-num" x="${f1(x)}" y="${f1(y + 4)}" text-anchor="middle">${i + 1}</text></g>`; });
      for (const id of new Set(sc0.route)) { const [x, y] = P(id), here = id === sc0.here; s += `<circle class="sp-you${sc0.gaps && sc0.gaps.has(id) ? " gap" : ""}" cx="${f1(x)}" cy="${f1(y)}" r="${f1((here ? 7 : 6) * (mini ? 0.9 : 1))}"/>`; if (here) s += `<circle class="sp-here" cx="${f1(x)}" cy="${f1(y)}" r="12"/>`; }
      // names: the current skill first, then the choices, the route, the shortest route and the arrival skills
      const named = [];
      if (sc0.here) named.push([sc0.here, "you"]);
      (sc0.cands || []).forEach(c => named.push([c.id, "cand", 7]));
      for (const id of sc0.route.slice().reverse()) named.push([id, "you"]);
      for (const id of sc0.short || []) named.push([id, "short"]);
      for (const id of sc0.arrivals) named.push([id, "zone", 9]);
      const placed = [], seen = new Set();
      for (const [id, cls, rr] of named) {
        if (seen.has(id) || !at(id)) continue; seen.add(id);
        const [x, y] = P(id), tw = name(id).length * 7.1, r = (rr || 6) * k + 5;
        const mx = Math.max(2, Math.min(w - 2 - tw, x - tw / 2));   // above or below, slid sideways to stay on the board
        const cand = [[x + r, y + 4, "start", x + r, y - 9, tw, 14], [x - r, y + 4, "end", x - r - tw, y - 9, tw, 14]];
        for (const dy of [0, 14, 28]) cand.push([mx, y - r - 3 - dy, "start", mx, y - r - 15 - dy, tw, 14], [mx, y + r + 12 + dy, "start", mx, y + r + dy, tw, 14]);
        const inside = c => c[3] >= 2 && c[3] + c[5] <= w - 2 && c[4] >= 2 && c[4] + c[6] <= h - 2;
        const clash = c => boxes.reduce((a, b) => a + Math.max(0, Math.min(c[3] + c[5], b[0] + b[2]) - Math.max(c[3], b[0])) * Math.max(0, Math.min(c[4] + c[6], b[1] + b[3]) - Math.max(c[4], b[1])), 0);
        const pick = cand.filter(inside).sort((a, b) => clash(a) - clash(b))[0] || cand[0];   // the clearest place on the board
        boxes.push([pick[3], pick[4], pick[5], pick[6]]);
        const c2 = cls === "you" && onRoute.has(id) ? "you" : cls;
        placed.push(`<text class="sp-name ${c2}" x="${f1(pick[0])}" y="${f1(pick[1])}" text-anchor="${pick[2]}">${esc(name(id))}</text>`);
      }
      s += placed.join("") + "</svg>";
      return s;
    }
    function altText(kind, sc0) {
      const arr = `Arrival skills: ${sc0.arrivals.map(name).join(", ")}.`;
      if (kind === "mini") return sc0.route.length ? `You start at ${name(sc0.route[0])}. ${arr}` : arr;
      const route = `Your route: ${sc0.route.map(name).join(", ")}.`;
      const cands = sc0.cands && sc0.cands.length ? ` Choices: ${sc0.cands.map((c, i) => `${i + 1} ${name(c.id)}`).join(", ")}.` : "";
      const short = sc0.short ? ` Shortest route: ${sc0.short.map(name).join(", ")}.` : "";
      return `${route} ${arr}${cands}${short}`;
    }
  }

  return { logic, mount };
});
