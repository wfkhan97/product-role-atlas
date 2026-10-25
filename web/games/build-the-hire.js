/* Game: Build the hire (#/play/build-the-hire?role=<id>&deal=<n>, &view=score for the scorecard). The spec is
   games/build-the-hire/README.md; the model is a port of games/build-the-hire/scripts/compute.js and gives the same
   numbers for the same role, deal and choices. Four screens: the start (one sentence and Play on the default role,
   the shared picker behind "Change role"), draft, verdict, scorecard, drawn in the shared shell (web/gameshell.js:
   one header, 1 to 3 choose, Enter hires, Esc quits, one record).
   Registers window.Games["build-the-hire"] = { mount } (contract in games/README.md). Nothing leaves the browser. */
(function () {
  "use strict";
  const SLUG = "build-the-hire", TITLE = "Build the hire", BASE = "#/play/" + SLUG;

  // ---------- the rules (same values as scripts/compute.js; distinct is read from bands_mba.json at load) ----------
  const CFG = {
    budget: 10, slots: 6, hands: 8, handSize: 3,
    distinct: { floor: 0.2, full: 2 },
    priceCuts: [1.5, 2.5, 4],                        // lift cut points for 2, 3 and 4 points
    askedShare: 0.2,                                 // below this share a card is priced by the role that prizes it most
    peakMinShare: 0.25,                              // a role sets a price only where at least this share asks
    strong: { share: 0.25, lift: 1.5 },
    mustHave: { share: 0.4, lift: 1.5 },
    trap: { here: 0.2, there: 0.5, lift: 2 },
    topK: 5, matchCut: 0.5, minBuildable: 0.01,
  };
  const factor = l => Math.max(CFG.distinct.floor, Math.min(1, CFG.distinct.floor + (1 - CFG.distinct.floor) * (l - 1) / (CFG.distinct.full - 1)));
  const tier = l => 1 + CFG.priceCuts.filter(c => l >= c).length;
  // xorshift32: the deal number is the seed, so a deal can be replayed and shared
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  const cost = h => h.reduce((a, c) => a + c.price, 0);

  // ---------- data: both role sets, the average role, and which role prizes each skill most ----------
  let dataP = null;
  function load(Atlas) {
    if (dataP) return dataP;
    dataP = (async () => {
      // the product set first, so the product families (product.<family>) are in ix.roles
      const [ix, P, bands] = await Promise.all([Atlas.index(), Atlas.product(), Atlas.fetchJson("data/bands_mba.json").catch(() => ({}))]);
      const d = (bands.scoring || {}).distinct || {};
      if (typeof d.floor === "number") CFG.distinct.floor = d.floor;
      if (typeof d.full === "number" && d.full > 1) CFG.distinct.full = d.full;
      const roles = Object.values(ix.roles);
      const skillsOf = r => r.set === "product" ? P.G.skills : ix.M.skills;
      const byId = r => r.set === "product" ? P.skillById : ix.skillById;
      const shareOf = (r, id) => { const s = byId(r)[id]; return s ? ((s.by_family || {})[r.family] || 0) : 0; };
      const playable = s => s.cluster !== "credentials" && s.cluster !== "domain" && !s.id.startsWith("yoe_");
      const peak = {};
      for (const r of roles) {
        if (r.small) continue;
        for (const s of skillsOf(r)) {
          if (!playable(s)) continue;
          const sh = shareOf(r, s.id), b = ix.baseline[s.id];
          if (!b || sh < CFG.peakMinShare) continue;
          const l = sh / b; if (!peak[s.id] || l > peak[s.id].lift) peak[s.id] = { role: r.id, share: sh, lift: l };
        }
      }
      // the picker: the atlas's fields (the MBA Product field is skipped by Atlas.index(); its place is the product set),
      // each role listed once under the field it now belongs to (the shared pmm id lands under Product)
      const fields = ix.groups.map(g => ({ id: g.id, label: g.label, roles: g.roles.filter(id => ix.roles[id] && ix.roles[id].group === g.id).map(id => ix.roles[id]).sort((a, b) => b.n - a.n) })).filter(g => g.roles.length);
      return { ix, P, roles, skillsOf, shareOf, playable, peak, fields };
    })();
    dataP.catch(() => { dataP = null; });
    return dataP;
  }

  function deck(D, r) {
    const cards = D.skillsOf(r).filter(D.playable).map(s => {
      const share = D.shareOf(r, s.id), base = D.ix.baseline[s.id] || 0, lift = base ? share / base : 0, pk = D.peak[s.id];
      const price = share >= CFG.askedShare ? tier(lift) : tier(pk ? pk.lift : 1);
      return { id: s.id, name: s.name, cluster: s.cluster, share, base, lift, worth: share * factor(lift), price, peak: pk };
    });
    const otherField = c => c.peak && c.peak.role !== r.id && (D.ix.roles[c.peak.role] || {}).group !== r.group;
    return {
      cards, byId: Object.fromEntries(cards.map(c => [c.id, c])),
      strong: cards.filter(c => c.share >= CFG.strong.share && c.lift >= CFG.strong.lift),
      mustHave: cards.filter(c => c.share >= CFG.mustHave.share && c.lift < CFG.mustHave.lift),
      trap: cards.filter(c => c.share < CFG.trap.here && c.peak && c.peak.share >= CFG.trap.there && c.peak.lift >= CFG.trap.lift && otherField(c)),
    };
  }
  const pickWeighted = (arr, rand, wf) => { const tot = arr.reduce((a, c) => a + wf(c), 0); let x = rand() * tot; for (const c of arr) { x -= wf(c); if (x <= 0) return c; } return arr[arr.length - 1]; };
  // one hand: a strong ask, a must-have and a trap; dry pools filled from cards at least 10% ask for; never nothing to buy
  function dealHand(K, seen, budget, rand) {
    const hand = [], fresh = a => a.filter(c => !seen.has(c.id) && !hand.some(h => h.id === c.id));
    const take = (arr, wf, kind) => { const a = fresh(arr); if (a.length) hand.push({ ...pickWeighted(a, rand, wf), kind }); };
    take(K.strong, c => c.worth, "strong"); take(K.mustHave, c => c.share, "must-have"); take(K.trap, c => c.peak.share, "trap");
    while (hand.length < CFG.handSize) { const a = fresh(K.cards).filter(c => c.share >= 0.1); if (!a.length) break; hand.push({ ...pickWeighted(a, rand, c => c.share), kind: "filler" }); }
    if (hand.length && hand.every(c => c.price > budget)) {
      const a = fresh(K.cards).filter(c => c.price <= budget && c.share >= 0.25);
      if (a.length) { const i = hand.findIndex(c => c.kind === "must-have"); hand[i < 0 ? hand.length - 1 : i] = { ...pickWeighted(a, rand, c => c.share), kind: "must-have" }; }
    }
    for (let i = hand.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [hand[i], hand[j]] = [hand[j], hand[i]]; }
    return hand;
  }
  // the match: per posting, need = weight of its five heaviest asks; got = weight of the hire's skills it names.
  // An inverted index from skill to postings, so an evaluation touches only postings that name a hired skill.
  function scorer(K, jobs) {
    const need = new Float64Array(jobs.length), w = new Float64Array(jobs.length), inv = {}; let W = 0;
    jobs.forEach((j, i) => { const ids = j.skills.filter(id => K.byId[id]); need[i] = ids.map(id => K.byId[id].worth).sort((a, b) => b - a).slice(0, CFG.topK).reduce((a, b) => a + b, 0); w[i] = j.w; W += j.w; for (const id of ids) (inv[id] ||= []).push(i); });
    const got = new Float64Array(jobs.length);
    const run = ids => { got.fill(0); const t = new Set(); for (const id of ids) { const c = K.byId[id]; if (!c || !inv[id]) continue; for (const i of inv[id]) { got[i] += c.worth; t.add(i); } } let s = 0, n = 0; for (const i of t) if (need[i] > 0 && got[i] >= CFG.matchCut * need[i] - 1e-12) { s += w[i]; n++; } return { share: W ? s / W : 0, n }; };
    return { run, score: ids => run(ids).share, count: ids => run(ids).n, need };
  }
  // the best hire from a pool: greedy from several starts, then single swaps; within budget and slots
  function best(S, pool) {
    const cands = pool.slice().sort((a, b) => b.worth - a.worth).slice(0, 30);
    const sc = h => S.score(h.map(c => c.id)) + 0.001 * h.reduce((a, c) => a + c.worth, 0);
    const grow = H => { for (;;) { let bb = null, bv = sc(H); for (const c of cands) { if (H.includes(c) || H.length >= CFG.slots || cost(H) + c.price > CFG.budget) continue; const v = sc([...H, c]); if (v > bv + 1e-9) { bv = v; bb = c; } } if (!bb) return H; H = [...H, bb]; } };
    const swap = H => { let imp = true; while (imp) { imp = false; const base = sc(H); for (let i = 0; i < H.length && !imp; i++) for (const c of cands) { if (H.includes(c)) continue; const h = [...H]; h[i] = c; if (cost(h) <= CFG.budget && sc(h) > base + 1e-9) { H = h; imp = true; break; } } } return H; };
    let top = null; for (const seed of [[], ...cands.slice(0, 8).map(c => [c])]) { const H = swap(grow(seed)); if (!top || sc(H) > sc(top)) top = H; }
    const ids = top.map(c => c.id), res = S.run(ids);
    return { score: res.share, n: res.n, ids, cost: cost(top) };
  }

  // one role's model, kept for the visit
  const models = {};
  async function model(Atlas, D, id) {
    if (models[id]) return models[id];
    const r = D.ix.roles[id], R = await Atlas.role(id), K = deck(D, r), S = scorer(K, R.jobs);
    return models[id] = { id, r, R, K, S, total: R.jobs.length, extras: null };
  }
  // the role's fixed lines on the verdict: must-haves alone and the ceiling (for the generalist line)
  function extras(M) {
    if (!M.extras) M.extras = { mustHave: best(M.S, M.K.mustHave), ceiling: best(M.S, M.K.cards.filter(c => c.share >= 0.1)) };
    return M.extras;
  }

  // ---------- a game: one role, one deal ----------
  let game = null;   // kept across re-mounts so the scorecard and "back to the verdict" find the finished draft
  function newGame(M, deal) {
    const g = { roleId: M.id, deal, rand: rng(deal), seen: new Set(), hands: [], hire: [], budget: CFG.budget, sel: null, done: false, end: null, verdict: null, saved: null, noted: false };
    nextHand(M, g);
    return g;
  }
  function nextHand(M, g) {
    g.sel = null;
    if (g.hire.length >= CFG.slots) return finish(M, g, "slots");
    if (g.budget <= 0) return finish(M, g, "budget");
    if (g.hands.length >= CFG.hands) return finish(M, g, "hands");
    const cards = dealHand(M.K, g.seen, g.budget, g.rand);
    if (!cards.length) return finish(M, g, "deck");
    cards.forEach(c => g.seen.add(c.id));
    g.hands.push({ cards, budget: g.budget, pick: null });
  }
  const current = g => g.hands[g.hands.length - 1];
  function hireCard(M, g, i) {
    const h = current(g), c = h.cards[i];
    if (!c || c.price > g.budget) return null;
    h.pick = c.id; g.hire.push(c); g.budget -= c.price;
    nextHand(M, g);
    return c;
  }
  function skipHand(M, g) { current(g).pick = null; nextHand(M, g); }
  function finish(M, g, why) { g.done = true; g.end = { why, hand: g.hands.length }; g.verdict = judge(M, g); }

  const tieOrder = (a, b) => b.price - a.price || a.share - b.share || a.name.localeCompare(b.name);
  function judge(M, g) {
    const { K, S } = M, ids = g.hire.map(c => c.id), mine = S.run(ids);
    const offered = [...new Map(g.hands.flatMap(h => h.cards).map(c => [c.id, c])).values()];
    const handOf = id => g.hands.findIndex(h => h.cards.some(c => c.id === id)) + 1;
    const bo = best(S, offered);
    const top = bo.score >= mine.share ? bo : { score: mine.share, n: mine.n, ids, cost: cost(g.hire) };   // the search is a heuristic; never below the player's own hire
    const buildable = top.score >= CFG.minBuildable;
    const rel = buildable && top.score ? mine.share / top.score : 0;
    const bestPick = g.hire.slice().sort((a, b) => b.worth - a.worth || tieOrder(a, b))[0] || null;
    const without = bestPick ? S.run(ids.filter(x => x !== bestPick.id)) : null;
    const over = g.hire.filter(c => c.share < 0.25 && c.price >= 2).sort(tieOrder)[0] || null;
    const missed = offered.filter(c => !ids.includes(c.id) && c.kind === "strong").sort((a, b) => b.worth - a.worth || tieOrder(a, b))[0] || null;
    let swap = null;
    if (missed && over) { const sw = ids.map(x => x === over.id ? missed.id : x); if (cost(sw.map(x => K.byId[x])) <= CFG.budget) swap = S.run(sw); }
    const ex = extras(M);
    return { share: mine.share, n: mine.n, offered, handOf, best: top, buildable, rel, bestPick, without, over, missed, swap, mustHave: ex.mustHave, ceiling: ex.ceiling };
  }

  // ---------- the personal best, in the games record (every access in try/catch) ----------
  const rec = () => window.GameShell.record.game(SLUG);
  const bestOf = id => { const b = (rec().best || {})[id]; return b && typeof b.rel === "number" ? b : null; };
  function saveLastRole(id) { window.GameShell.record.saveGame(SLUG, { lastRole: id }); }
  function saveBest(M, g) {
    const v = g.verdict;
    if (!v.buildable) return { kind: "none" };
    const s = rec(), all = s.best && typeof s.best === "object" ? s.best : {}, prev = all[M.id];
    const row = { pct: Math.round(v.share * 1000) / 1000, rel: Math.round(v.rel * 1000) / 1000, deal: g.deal, at: today() };
    if (prev && typeof prev.rel === "number" && prev.rel >= v.rel) { window.GameShell.record.saveGame(SLUG, { played: true, last: { ...all.last, [M.id]: row } }); return { kind: "kept", rec: prev }; }
    if (!window.GameShell.record.saveGame(SLUG, { played: true, best: { ...all, [M.id]: row } })) return { kind: "failed" };
    const back = bestOf(M.id);
    return back && back.deal === g.deal ? { kind: "new", rec: row } : { kind: "failed" };
  }

  // ---------- words ----------
  const fmt = n => Number(n).toLocaleString();
  const pct = v => Math.round(v * 100) + "%";
  const times = l => l.toFixed(1) + "×";
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
  const pts = n => n === 1 ? "1 point" : n + " points";
  const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  // a skill name inside a sentence: lower-case the first letter unless it starts an acronym (SQL, APIs)
  const lc = s => (s.length > 1 && s[1] === s[1].toLowerCase() && s[1] !== s[1].toUpperCase()) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const shortName = s => s.split(/ \/ | \(/)[0];
  const today = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const randomDeal = () => 1 + Math.floor(Math.random() * 9999);
  const href = (id, deal, view) => `${BASE}?role=${encodeURIComponent(id)}${deal ? "&deal=" + deal : ""}${view ? "&view=" + view : ""}`;
  const EMPLOYER = { large: "large company", startup: "startup", firm: "consulting, bank or fund" };
  const LEVEL = { associate: "entry level", mid: "mid-level", senior: "senior", staff: "staff", group: "group level", director: "director", vp: "VP", cpo: "chief officer" };
  const smallNote = r => r.small ? `Only ${fmt(r.n)} postings: one posting moves the score by several points.` : "";

  // ---------- the hook ----------
  let mounts = 0;
  async function mount(el, ctx) {
    const { Atlas } = ctx, esc = ctx.esc, GS = window.GameShell;
    const token = ++mounts;
    const INFO = GS.info({ rules: `You are the hiring manager, with ${CFG.budget} points and room for ${NUM[CFG.slots]} skills. Take one card from each hand of three, or skip it; a card you pass on does not come back. A skill asked for by most postings of almost every role costs 1 point; one asked for far more often by one role than by the average role costs 2 to 4. An expensive card may set this role apart, or a different one. Real postings then judge your hire.`, keys: "Keys: 1 to 3 choose a card, Enter hires it, Esc quits.", source: "A posting counts as a match when your hire covers at least half of what it asks for most." });
    const F = GS.frame(el, { game: TITLE, cls: "bh", info: INFO });
    const root = F.body;
    const alive = () => token === mounts && root.isConnected;
    const say = t => F.live(t);
    let onKey = null;
    const offKeys = GS.keys({ choose(n, e) { if (alive() && onKey) return onKey("choose", n, e); return false; }, confirm(e) { if (alive() && onKey) onKey("confirm", null, e); }, other(e) { if (alive() && onKey) onKey("other", null, e); } });
    const off = () => { offKeys(); window.removeEventListener("hashchange", off); };
    window.addEventListener("hashchange", off);

    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    const wait = msg => { root.innerHTML = `<p class="lead">${esc(msg)}</p>`; };
    const failed = e => { console.error(e); root.innerHTML = `<h1>Something did not load</h1><p class="lead">${esc(e.message)}. Reload the page; if it happens again, the data files may be missing.</p>${GS.foot({ primary: { href: "#/", label: "All games" } })}`; };

    const marks = g => g.hands.map((h, i) => i < g.hands.length - 1 || g.done ? (h.pick ? "ok" : "done") : "");
    wait("Reading the postings of every role…");
    let D;
    try { D = await load(Atlas); } catch (e) { if (alive()) failed(e); return; }
    if (!alive()) return;

    const pickable = id => D.fields.some(f => f.roles.some(x => x.id === id));
    const roleId = q.get("role");
    if (!roleId || !pickable(roleId)) return brief();
    const deal = parseInt(q.get("deal"), 10);
    if (!(deal > 0)) { location.replace(href(roleId, randomDeal())); return; }
    const r = D.ix.roles[roleId];
    wait(`Reading ${plural(r.n, "posting", "postings")} for ${r.label}…`);
    let M;
    try { M = await model(Atlas, D, roleId); } catch (e) { if (alive()) failed(e); return; }
    if (!alive()) return;
    const same = game && game.roleId === roleId && game.deal === deal;
    if (q.get("view") === "score") return same && game.done ? scorecard() : notPlayed();
    if (!same) game = newGame(M, deal);
    return game.done ? verdict() : draft();

    // a skill name that opens the role screen with that skill selected, the way the atlas opens a skill
    function skillLink(c) {
      return `<a class="sk" href="#/role/${esc(roleId)}" data-open-skill="${esc(c.id)}">${esc(c.name)}</a>`;
    }
    function roleLink(id) { return `<a class="sk" href="#/role/${esc(id)}">${esc(D.ix.roles[id].label)}</a>`; }
    function wireLinks() {
      root.querySelectorAll("a[data-open-skill]").forEach(a => a.addEventListener("click", () => openSkillAfter(a.dataset.openSkill)));
    }
    // the role screen has no address for a selected skill; once it has drawn its grid, press that skill's button
    function openSkillAfter(id) {
      const main = el, t0 = Date.now();
      const tryOpen = () => { const b = main.querySelector(`button.skill[data-skill="${CSS.escape(id)}"]`); if (b) { if (!b.classList.contains("on")) b.click(); return true; } return false; };
      const ob = new MutationObserver(() => { if (tryOpen() || Date.now() - t0 > 8000) ob.disconnect(); });
      ob.observe(main, { childList: true, subtree: true });
      setTimeout(() => ob.disconnect(), 8000);
    }
    function pricedElsewhere(c) { return c.share < CFG.askedShare && !!c.peak && c.peak.role !== roleId; }

    // ---------- 01 the start: one sentence and Play on the default role; "Change role" is the shared picker ----------
    async function brief() {
      onKey = null;
      const pick = await GS.defaultRole(Atlas, pickable); if (!alive()) return;
      const sel = D.ix.roles[pick], b = bestOf(pick);
      GS.start(F, { title: "Build the hire", lead: `You are the hiring manager. Draft a candidate for ${sel.label} from three cards at a time, then let real job postings judge your hire.`, role: sel.label, play: () => { saveLastRole(pick); location.hash = href(pick, randomDeal()); }, change: picker, extra: `${sel.small ? `<p class="bh-small">${esc(smallNote(sel))}</p>` : ""}${b ? `<p class="gm-best">Your best for ${esc(sel.label)}: <b>${b.pct >= 0.01 ? pct(b.pct) : "under 1%"}</b> of postings matched</p>` : ""}` });
      onKey = kind => { if (kind === "confirm") { saveLastRole(pick); location.hash = href(pick, randomDeal()); } };
    }
    function picker() {
      onKey = null;
      GS.picker(F, { Atlas, roles: pickable, field: roleId ? D.ix.roles[roleId].group : undefined, secondary: id => { const b = bestOf(id); return b ? `Your best: ${b.pct >= 0.01 ? pct(b.pct) : "under 1%"} of postings matched` : "Not played yet"; }, back: true, onBack: brief, onRole: id => { saveLastRole(id); location.hash = href(id, randomDeal()); } });
    }

    // ---------- 02 draft ----------
    function draft(focusCard) {
      const g = game, h = current(g), n = h.cards.length;
      F.set({ round: g.hands.length - 1, rounds: CFG.hands, marks: marks(g), role: r.label });
      const sel = g.sel != null ? h.cards[g.sel] : null;
      const so = M.S.run(g.hire.map(c => c.id));
      const pips = [];
      for (let i = 0; i < CFG.budget; i++) {
        const spent = i < CFG.budget - g.budget, fromEnd = CFG.budget - i;   // 1 for the last pip
        pips.push(spent ? "<i></i>" : sel && fromEnd <= sel.price ? '<i class="next"></i>' : '<i class="left"></i>');
      }
      const slotPips = Array.from({ length: CFG.slots }, (_, i) => i < g.hire.length ? '<i class="full"></i>' : "<i></i>").join("");
      const card = (c, i) => {
        const over = c.price > g.budget, on = g.sel === i, R = M.R;
        const note = over ? "Over budget" : on ? (c.price === g.budget ? `Uses your last ${c.price}` : `Leaves ${g.budget - c.price}`) : "";
        const tab = (g.sel == null ? i === 0 : on) ? 0 : -1;
        return `<button class="bh-card${on ? " on" : ""}${over ? " over" : ""}" type="button" role="radio" aria-checked="${on}"${over ? ' aria-disabled="true"' : ""} tabindex="${tab}" data-i="${i}">
          <kbd class="key" aria-hidden="true">${i + 1}</kbd>
          <span class="area">${esc((R.clusters[c.cluster] || {}).label || "")}</span>
          <span class="nm">${esc(c.name)}</span>
          <span class="what">${esc((R.skillById[c.id] || {}).what || "")}</span>
          <span class="price"><span class="coins" aria-hidden="true">${"<i></i>".repeat(c.price)}</span><span class="pts">${pts(c.price)}</span>${note ? `<span class="note">${note}</span>` : ""}</span>
        </button>`;
      };
      const slot = c => {
        const flag = pricedElsewhere(c) ? `<span class="flag"> · prized by ${esc(D.ix.roles[c.peak.role].label)}</span>` : "";
        return `<div class="bh-slot${flag ? " trap" : ""}"><span class="nm">${esc(c.name)}</span><span class="pts">${pts(c.price)}</span><span class="rv"><b>${pct(c.share)}</b> of postings ask · <b>${times(c.lift)}</b> average${flag}</span></div>`;
      };
      const slots = g.hire.map(slot).join("") + '<div class="bh-slot empty">Open slot</div>'.repeat(CFG.slots - g.hire.length);
      const nothing = h.cards.every(c => c.price > g.budget);
      root.innerHTML = `<div class="bh-head">
          <div>
            <h1>Pick one skill for your hire</h1>
            <p class="lead" style="margin:4px 0 0">${nothing ? "None of these fits your budget. Skip the hand." : n === 3 ? "The two you pass on are gone for good." : n === 2 ? "The one you pass on is gone for good." : "If you pass on it, it is gone for good."}</p>
          </div>
          <div class="bh-meters" role="group" aria-label="Budget and slots">
            <div class="bh-meter">
              <div class="lbl"><span>Budget</span><span><b>${g.budget}</b> of ${CFG.budget} points left</span></div>
              <div class="bh-pips" aria-hidden="true">${pips.join("")}</div>
            </div>
            <div class="bh-meter">
              <div class="lbl"><span>Slots</span><span><b>${g.hire.length}</b> of ${CFG.slots} filled</span></div>
              <div class="bh-pips six" aria-hidden="true">${slotPips}</div>
            </div>
          </div>
        </div>
        <div class="bh-hand" role="radiogroup" aria-label="${n === 3 ? "Three" : cap(NUM[n])} ${n === 1 ? "skill" : "skills"} on offer">${h.cards.map(card).join("")}</div>
        <div class="bh-hire-h"><h2>Your hire</h2><span class="gm-key">Blue numbers: the share of the ${fmt(M.total)} ${esc(r.label)} postings that ask for the skill, and how that compares with the average role.</span></div>
        <div class="bh-slots">${slots}</div>
        <div class="bh-read">
          <div class="t">So far your hire matches <b>${fmt(so.n)}</b> of ${fmt(M.total)} ${esc(r.label)} postings</div>
          <div class="bar" aria-hidden="true"><i style="width:${Math.min(100, so.share * 100).toFixed(1)}%"></i></div>
        </div>
        ${GS.foot({ primary: { id: "bh-hire", label: sel ? `Hire ${esc(lc(shortName(sel.name)))} · ${pts(sel.price)}` : "Choose a card to hire", key: "Enter", disabled: !sel }, quiet: { id: "bh-skip", label: "Skip this hand" } })}`;
      const cards = [...root.querySelectorAll(".bh-card")];
      cards.forEach(b => b.onclick = () => choose(+b.dataset.i));
      root.querySelector(".bh-hand").onkeydown = e => { if (e.key !== "Enter") return; const i = +e.target.closest(".bh-card").dataset.i; e.preventDefault(); if (g.sel === i) hire(); else choose(i); };   // Enter on the chosen card hires it
      root.querySelector("#bh-skip").onclick = skip;
      root.querySelector("#bh-hire").onclick = hire;
      if (focusCard != null && cards[focusCard]) cards[focusCard].focus();
      if (g.hands.length === 1 && g.sel == null) GS.coachOnce(SLUG, root.querySelector(".bh-hand"), "Take one card for your hire, or skip the hand; a card you pass on does not come back. 1 to 3 choose, Enter hires.", "beforebegin");
      onKey = (kind, num, e) => {
        if (kind === "choose") { if (num <= n) { choose(num - 1); return true; } return false; }
        const t = e && e.target;
        const onCard = t && t.classList && t.classList.contains("bh-card"), onPage = !t || t === document.body || t === document.documentElement;
        if (kind === "confirm") { if (onCard || onPage) { if (onCard && g.sel !== +t.dataset.i) choose(+t.dataset.i); else hire(); } return; }
        if (kind === "other" && ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key) && (onCard || onPage)) {
          e.preventDefault();
          const ok = h.cards.map((c, i) => c.price <= g.budget ? i : -1).filter(i => i >= 0);
          if (!ok.length) return;
          const from = g.sel != null ? g.sel : onCard ? +t.dataset.i : -1, dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
          let k = ok.indexOf(from); k = k < 0 ? (dir > 0 ? 0 : ok.length - 1) : (k + dir + ok.length) % ok.length;
          choose(ok[k]);
        }
      };
    }
    function choose(i) {
      const g = game, c = current(g).cards[i];
      if (!c) return;
      if (c.price > g.budget) { say(`${c.name} costs ${pts(c.price)}; you have ${pts(g.budget)} left. Over budget.`); draft(i); return; }
      g.sel = i; draft(i);
    }
    function hire() {
      const g = game;
      if (g.sel == null) { say("Choose a card first: press 1, 2 or 3."); return; }
      const c = hireCard(M, g, g.sel);
      if (!c) return;
      const so = M.S.run(g.hire.map(x => x.id));
      const reveal = `${c.name}: ${pct(c.share)} of ${r.label} postings ask for it, ${c.lift.toFixed(1)} times the average role. Your hire now matches ${fmt(so.n)} of ${fmt(M.total)} postings.`;
      if (g.done) { say(reveal + " The draft is over."); verdict(true); }
      else { say(`${reveal} Hand ${g.hands.length} of ${CFG.hands}.`); draft(0); }
    }
    function skip() {
      const g = game;
      skipHand(M, g);
      if (g.done) { say("Hand skipped. The draft is over."); verdict(true); }
      else { say(`Hand skipped. Hand ${g.hands.length} of ${CFG.hands}.`); draft(0); }
    }

    // ---------- 03 verdict (BTH3): one headline, the cards painted with their shares and your picks marked, one
    // line on the one that got away, one action; the model and the notes behind Why ----------
    function verdict(focus) {
      const g = game, v = g.verdict;
      if (!g.saved) g.saved = saveBest(M, g);
      F.set({ round: CFG.hands, rounds: CFG.hands, marks: marks(g), role: r.label });
      const label = esc(r.label), num = s => `<span class="num">${s}</span>`;
      const matchWords = (share, n) => share >= 0.01 ? pct(share) : plural(n, "posting", "postings");
      const head = v.share >= 0.01 ? `Your hire matches ${pct(v.share)} of ${label} postings` : `Your hire matches ${fmt(v.n)} of the ${fmt(M.total)} ${label} postings`;
      const hired = new Set(g.hire.map(c => c.id));
      // the record: every card offered is an ask met when the role asks for it; a hired ask is known
      const asks = GS.record.asksOf(D.ix, D.P, roleId), before = GS.record.knowledge(roleId, asks);
      if (!g.noted) { g.noted = true; GS.record.saveRole(roleId, { label: r.label, met: v.offered.map(c => c.id), known: g.hire.map(c => c.id) }); }
      const know = GS.knowLine(before, GS.record.knowledge(roleId, asks), r.label);
      const take = v.missed ? `The one that got away: ${esc(v.missed.name)}, hand ${v.handOf(v.missed.id)}. ${num(pct(v.missed.share))} of ${label} postings ask for it, ${num(times(v.missed.lift))} the average role.` : v.bestPick ? `Your best pick: ${esc(v.bestPick.name)}. ${num(pct(v.bestPick.share))} of ${label} postings ask for it, ${num(times(v.bestPick.lift))} the average role.` : "You skipped every hand, so there is no hire to judge.";
      // the cards you were dealt, painted: green a hired skill the role asks for, amber a hired skill it rarely does, the rest with their share
      const cardCls = c => hired.has(c.id) ? (c.share >= CFG.strong.share ? " on" : " bad") : v.missed && v.missed.id === c.id ? " miss" : "";
      const board = v.offered.slice().sort((a, b) => b.share - a.share).map(c => `<span class="bh-cell${cardCls(c)}">${skillLink(c)}<i>${pct(c.share)}</i></span>`).join("");
      const notes = [];
      if (v.bestPick) notes.push(`<p><b>Best pick.</b> ${esc(v.bestPick.name)}, ${pts(v.bestPick.price)}: ${pct(v.bestPick.share)} of postings ask for it, ${times(v.bestPick.lift)} the average role. Without it, your hire matches ${plural(v.without.n, "posting", "postings")}.</p>`);
      if (v.over) { const pk = v.over.peak && v.over.peak.role !== roleId ? v.over.peak : null; notes.push(`<p><b>Where you overspent.</b> ${esc(v.over.name)}, ${pts(v.over.price)}: ${v.over.share < 0.005 ? "almost no" : "only " + pct(v.over.share) + " of"} ${label} postings ask for it.${pk ? ` ${esc(D.ix.roles[pk.role].label)} postings do: ${pct(pk.share)}.` : ""}</p>`); }
      if (v.swap) notes.push(`<p>In place of ${esc(v.over.name)}, ${esc(v.missed.name)} would have made your hire match ${matchWords(v.swap.share, v.swap.n)}.</p>`);
      notes.push(`<p><b>Must-haves alone.</b> The best hire made only of 1-point cards matches ${matchWords(v.mustHave.score, v.mustHave.n)} of ${label} postings.${v.ceiling.score > 0 && v.mustHave.score >= 0.8 * v.ceiling.score ? " Here the skills every role asks for carry most of the weight; this role is set apart by fewer skills." : ""}</p>`);
      const ends = { budget: `the budget ran out in hand ${g.end.hand}`, slots: `the slots filled up in hand ${g.end.hand}`, hands: `all ${NUM[CFG.hands]} hands were played`, deck: `the deck ran out in hand ${g.end.hand + 1}` };
      notes.push(`<p>${cap(NUM[g.hire.length])} of ${NUM[CFG.slots]} slots filled; ${ends[g.end.why]}. Each posting has five asks that count most: skills it names that most ${label} postings name and that set the role apart. Your hire matches a posting when it covers at least half of their weight. <a class="link" href="${href(roleId, g.deal, "score")}">How the postings scored it →</a></p>`);
      const sv = g.saved, savedLine = sv.kind === "new" ? "A new best for this role." : sv.kind === "kept" ? `Your best for ${label}: <b>${sv.rec.pct >= 0.01 ? pct(sv.rec.pct) : "under 1%"}</b>.` : sv.kind === "failed" ? "This browser does not let the page keep data, so your best is not saved." : "";
      root.innerHTML = GS.results({
        eyebrow: `Verdict · ${label} · deal ${fmt(g.deal)}`,
        measure: head,
        record: `${know ? know + " " : ""}${v.buildable ? `From the cards you were dealt, the best hire matches ${matchWords(v.best.score, v.best.n)}: you got ${pct(v.rel)} of the way there.` : "These hands could not build a match. Deal again."} ${savedLine}`,
        takeaway: take,
        visual: `<div class="bh-board">${board}</div><p class="gm-key">The cards you were dealt, most asked first: % of ${label} postings that ask for the skill. Green: hired, an ask; amber: hired, rarely asked for here; dashed: the one that got away.</p>`,
        link: { href: `#/role/${esc(roleId)}`, label: `See what ${r.label} postings ask for` },
        why: notes.join(""),
        foot: GS.foot({ primary: { id: "bh-again", label: "Play again", key: "Enter" }, quiet: { id: "bh-same", label: "Same deal again" } }),
      });
      wireLinks();
      root.querySelector("#bh-again").onclick = playAgain;
      root.querySelector("#bh-same").onclick = sameDeal;
      if (focus) F.focusMeasure();
      onKey = kind => { if (kind === "confirm") playAgain(); };
    }
    function playAgain() { saveLastRole(roleId); location.hash = href(roleId, randomDeal()); }
    function sameDeal() { game = newGame(M, deal); say(`Deal ${fmt(deal)} again. Hand 1 of ${CFG.hands}.`); window.scrollTo(0, 0); draft(0); }

    // ---------- 04 scorecard ----------
    function scorecard() {
      onKey = null;
      const g = game, v = g.verdict, K = M.K, label = esc(r.label);
      F.set({ round: CFG.hands, rounds: CFG.hands, marks: marks(g), role: r.label });
      const hired = new Set(g.hire.map(c => c.id));
      const rows = g.hands.flatMap((h, hi) => h.cards.map(c => {
        const pk = pricedElsewhere(c) ? c.peak : null, isHired = hired.has(c.id) && h.pick === c.id;
        const you = isHired ? '<td class="mine">Hired</td>' : c.price > h.budget ? '<td class="subtle">Over budget</td>' : '<td class="subtle">Passed</td>';
        return `<tr><td class="pts">${hi + 1}</td><td>${isHired ? `<span class="${pk ? "trap" : "mine"}">${skillLink(c)}</span>` : skillLink(c)}${pk ? `<span class="sub">Priced by ${esc(D.ix.roles[pk.role].label)}: ${pct(pk.share)}, ${times(pk.lift)}</span>` : ""}</td><td class="pts">${c.price}</td><td class="num">${pct(c.share)}</td><td class="num">${times(c.lift)}</td><td class="num">${c.worth.toFixed(2)}</td>${you}</tr>`;
      })).join("");
      // two real open postings: one the hire matches and one it does not (preferably one a passed card would have won)
      const passed = v.offered.filter(c => !hired.has(c.id));
      const look = j => {
        const ids = j.skills.filter(id => K.byId[id]), top = ids.slice().sort((a, b) => K.byId[b].worth - K.byId[a].worth).slice(0, CFG.topK);
        const need = top.reduce((a, id) => a + K.byId[id].worth, 0), got = ids.filter(id => hired.has(id)).reduce((a, id) => a + K.byId[id].worth, 0);
        return { j, top, need, got, cov: need ? got / need : 0, match: need > 0 && got >= CFG.matchCut * need - 1e-12, inTop: top.filter(id => hired.has(id)).length, extra: ids.filter(id => hired.has(id) && !top.includes(id)) };
      };
      const byName = (a, b) => String(a.j.company).localeCompare(String(b.j.company)) || String(a.j.title).localeCompare(String(b.j.title));
      const open = M.R.jobs.filter(j => j.open !== false).map(look).filter(x => x.need > 0);
      const yes = open.filter(x => x.match).sort((a, b) => b.need - a.need || b.inTop - a.inTop || byName(a, b))[0] || null;
      const winner = x => { const order = v.missed ? [v.missed, ...passed.filter(c => c.id !== v.missed.id)] : passed; return order.find(c => x.j.skills.includes(c.id) && x.got + c.worth >= CFG.matchCut * x.need - 1e-12) || null; };
      const nos = open.filter(x => !x.match && x.got > 0).map(x => ({ ...x, win: winner(x) }));
      const no = nos.sort((a, b) => (!!b.win - !!a.win) || (b.win && a.win ? (b.win === v.missed) - (a.win === v.missed) : 0) || b.cov - a.cov || b.need - a.need || byName(a, b))[0] || null;
      const names = ids => ids.map(id => lc(K.byId[id].name));
      const list = xs => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
      const posting = x => {
        const j = x.j, meta = [j.company, EMPLOYER[Atlas.employerType(j)], LEVEL[j.level]].filter(Boolean).map(esc).join(" · ");
        const cov = x.match
          ? `Its five heaviest asks weigh ${x.need.toFixed(2)}. Your hire covers <b>${pct(x.cov)}</b> of that${x.extra.length ? `, with ${esc(list(names(x.extra)))} as well` : ""}.`
          : `Its five heaviest asks weigh ${x.need.toFixed(2)}. Your hire covers <b>${pct(x.cov)}</b>${x.extra.length ? `, with ${esc(list(names(x.extra)))}` : ""}.${x.win ? ` ${esc(x.win.name)} would have made it a match.` : ""}`;
        return `<div class="bh-posting">
          <div class="h"><span class="t">${esc(j.title)}</span><span class="res ${x.match ? "yes" : "no"}">${x.match ? "Match" : "Not a match"}</span></div>
          <div class="m">${meta}</div>
          <div class="tags">${x.top.map(id => `<span class="tag${hired.has(id) ? " good" : ""}">${esc(K.byId[id].name)}${hired.has(id) ? '<span class="bh-sr"> (in your hire)</span>' : ""}</span>`).join("")}</div>
          <div class="cov">${cov}</div>
        </div>`;
      };
      root.innerHTML = `<p class="eyebrow">Scorecard · ${label} · deal ${fmt(g.deal)}</p>
        <h1>How the postings scored your hire</h1>
        <div style="display:grid;grid-template-columns:1fr 380px;gap:32px;margin-top:14px">
          <section>
            <table class="bh-table tight">
              <thead><tr><th>Hand</th><th>Card</th><th class="num">Points</th><th class="num">Ask</th><th class="num">vs average</th><th class="num">Weight</th><th>You</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
            <div class="bh-rule"><b>Price.</b> How many times more often this role asks for the skill than the average role: under 1.5× is 1 point, 1.5× to 2.5× is 2, 2.5× to 4× is 3, 4× and up is 4. A skill that fewer than 1 in 5 of these postings ask for is priced by the role that prizes it most. <b>Weight.</b> The share of postings that ask, times how much it sets the role apart: ${CFG.distinct.floor} for a skill the average role asks for as often, rising to 1 at ${CFG.distinct.full === 2 ? "twice" : CFG.distinct.full + " times"} as often.</div>
          </section>
          <aside>
            <h2 style="margin:0 0 8px;font-size:var(--text-base);color:var(--foreground)">${yes && no ? "Two real postings" : "A real posting"}</h2>
            ${yes ? posting(yes) : `<p class="small muted">No open posting counts your hire as a match.</p>`}
            ${no ? posting(no) : ""}
            <p class="gm-key">Green: in your hire. A posting is a match when the weight of your skills it names reaches half the weight of its five heaviest asks.</p>
          </aside>
        </div>
        ${GS.foot({ primary: { href: `#/role/${esc(roleId)}`, label: `See what ${label} postings ask for` }, quiet: { href: href(roleId, g.deal), label: "Back to the verdict" } })}`;
      wireLinks();
    }
    function notPlayed() {
      onKey = null; F.set({ round: null, rounds: 0, role: r.label });
      root.innerHTML = `<p class="eyebrow">Scorecard · ${esc(r.label)} · deal ${fmt(deal)}</p><h1>Play this deal first</h1><p class="lead">The scorecard shows the cards you were dealt and what you did with each. Only your best score is kept, not the draft, so play the deal to see its scorecard.</p>${GS.foot({ primary: { href: href(roleId, deal), label: `Play deal ${fmt(deal)}` }, quiet: { href: BASE, label: "Pick another role" } })}`;
    }
  }

  window.Games = window.Games || {};
  window.Games[SLUG] = { mount };
})();
