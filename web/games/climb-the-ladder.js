/* Climb the ladder (design: games/climb-the-ladder/README.md). One skill, four sentences that describe it at Entry, Mid,
   Senior and Lead, shuffled; put each on its rung, check, see what changes as you move up. Five skills a game.
   Registers window.Games["climb-the-ladder"] = { mount } (the contract in games/README.md). Data comes through
   ctx.Atlas: index(), product() and genericSkills(); no postings are loaded. The pure parts (pool, filter, draw,
   shuffle, scoring, verb chain, new words) touch no DOM and are exported under module.exports for node tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.Games = root.Games || {}; root.Games["climb-the-ladder"] = { mount: api.mount }; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const SLUG = "climb-the-ladder";
  const STORE_BEST = `game.${SLUG}.best`, STORE_FIELD = `game.${SLUG}.last-field`;
  // the four rungs, Entry to Lead: Atlas.STEPS names them, these are the keys in skills[].ladder (LADDER_KEYS in app.js)
  const STEP_KEY = { entry: "associate", mid: "mid", senior: "senior", lead: "lead" };
  const STEP_LABEL = { entry: "Entry", mid: "Mid", senior: "Senior", lead: "Lead" };
  const STEPS = ["entry", "mid", "senior", "lead"];
  const KEYS = STEPS.map(s => STEP_KEY[s]), LABELS = STEPS.map(s => STEP_LABEL[s]);
  const INDUSTRIES = ["corporate", "bank", "consulting"];
  const MAX_OVERLAP = 0.35;   // a ladder with two neighbouring rungs this alike (Jaccard on content words) is out
  const MIN_SHARE = 0.10;     // a skill counts for a field when its postings ask for it this often, averaged over the field's roles
  const PER_GAME = 5, MAX_POSTINGS = 2;
  const README_COUNTS = { atlas: 64, postings: 16, corporate: 11, bank: 4, consulting: 1 };   // games/climb-the-ladder/README.md, data of 2026-10-11 / 2026-10-14
  const TITLES = [[0, 19, "Summer intern"], [20, 27, "Analyst"], [28, 33, "Manager"], [34, 37, "Senior manager"], [38, 39, "Director"], [40, 40, "Head of the ladder"]];
  // Grade names of the four rungs per industry ladder: RUNG_NAMES in pipeline/depth_gen.py, the names the depth pipeline
  // wrote the postings ladders for. web/data has no copy, so it is copied here; graph_mba.json ladders[].levels is used where it names the rung.
  const RUNG_NAMES = {
    corporate: { associate: "Analyst or associate", mid: "Manager", senior: "Senior manager", lead: "Lead, director and above" },
    bank: { associate: "Analyst", mid: "Associate", senior: "Vice President", lead: "Director, Managing Director" },
    consulting: { associate: "Analyst", mid: "Consultant", senior: "Senior consultant or manager", lead: "Engagement manager, principal, partner" },
  };
  const STOP = new Set("the a an and or of to for in on with you your that is are as at by it its their they them this these those be can more than".split(" "));
  const WORD = /[A-Za-z][A-Za-z&-]*/g;

  // ---------- words: content tokens, overlap between rungs, the words new at a rung, the first word ----------
  const norm = w => { w = w.toLowerCase(); return w.length > 1 && w.endsWith("s") ? w.slice(0, -1) : w; };
  const tokens = text => (String(text).match(WORD) || []).filter(w => !STOP.has(w.toLowerCase())).map(w => ({ raw: w, key: norm(w) }));
  // the overlap filter compares plain lowercased content words (the README's measure); the final-s drop is for new words only
  const contentSet = text => new Set(tokens(text).map(t => t.raw.toLowerCase()));
  function jaccard(a, b) { let inter = 0; for (const x of a) if (b.has(x)) inter++; const union = a.size + b.size - inter; return union ? inter / union : 1; }
  // per rung, the words that appear in no lower rung (the Entry rung has none)
  function newWords(rungs) {
    const seen = new Set(), out = [];
    rungs.forEach((text, i) => { const ts = tokens(text); out.push(i === 0 ? [] : [...new Set(ts.filter(t => !seen.has(t.key)).map(t => t.raw))]); ts.forEach(t => seen.add(t.key)); });
    return out;
  }
  const newKeys = (rungs, i) => new Set(newWords(rungs)[i].map(norm));
  // the first word of a rung, "You " removed (postings rungs start with "You")
  function firstWord(text) { const m = String(text).replace(/^\s*You\s+/i, "").match(/[A-Za-z][A-Za-z&-]*/); return m ? m[0][0].toUpperCase() + m[0].slice(1) : ""; }
  const verbChain = rungs => rungs.map(firstWord);
  // the note on the chain, written from the comparison: which rungs share a first word
  function verbNote(verbs, labels) {
    const groups = {}; verbs.forEach((v, i) => (groups[v.toLowerCase()] ||= []).push(i));
    const shared = Object.values(groups).filter(g => g.length > 1);
    if (!shared.length) return "Every rung starts with a different word: here the first word alone tells you the rung.";
    const list = xs => xs.length === 2 ? `${xs[0]} and ${xs[1]}` : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
    return "The first word does not settle this one: " + shared.map(g => `${list(g.map(i => labels[i]))} ${g.length === 2 ? "both" : "all"} start with “${verbs[g[0]]}”`).join("; ") + ". What each rung does with it does.";
  }
  // text with the words new at this rung wrapped in <span class="new">; escapes as it goes, so "M&A" stays one word
  function markNew(text, keys, esc) {
    let out = "", last = 0;
    for (const m of String(text).matchAll(WORD)) { const w = m[0]; out += esc(text.slice(last, m.index)) + (!STOP.has(w.toLowerCase()) && keys.has(norm(w)) ? `<span class="new">${esc(w)}</span>` : esc(w)); last = m.index + w.length; }
    return out + esc(text.slice(last));
  }

  // ---------- the pool: atlas-written ladders (graph.json) and postings ladders per industry (graph_mba.json) ----------
  const fullLadder = L => !!L && typeof L === "object" && KEYS.every(k => typeof L[k] === "string" && L[k].trim());
  // build steps as written: a list of strings, or (three MBA skills) an object keyed by industry ladder with {text} items
  function buildSteps(build, ladder) {
    let b = build; if (b && !Array.isArray(b) && typeof b === "object") b = ladder ? b[ladder] : null;
    return Array.isArray(b) ? b.map(x => typeof x === "string" ? x : x && x.text).filter(Boolean) : [];
  }
  function entryOf(s, source, ladder, L) {
    const rungs = KEYS.map(k => L[k].trim()), sets = rungs.map(contentSet);
    const overlaps = [0, 1, 2].map(i => jaccard(sets[i], sets[i + 1]));
    return { key: ladder ? `${s.id}@${ladder}` : s.id, skillId: s.id, name: s.name, cluster: s.cluster, source, ladder, rungs, overlaps, overlap: Math.max(...overlaps), verbs: verbChain(rungs), newWords: newWords(rungs), build: buildSteps(s.build, ladder), climb: typeof s.climb === "string" && s.climb.trim() ? s.climb.trim() : null };
  }
  // G: graph.json, M: graph_mba.json. The 64 shared skills carry the same flat ladder in both files; they count once, from G.
  function buildPool(G, M) {
    const atlas = G.skills.filter(s => fullLadder(s.ladder)).map(s => entryOf(s, "atlas", null, s.ladder));
    const postings = [];
    for (const s of M.skills) { const L = s.ladder; if (!L || typeof L !== "object" || fullLadder(L)) continue; for (const l of INDUSTRIES) if (fullLadder(L[l])) postings.push(entryOf(s, "postings", l, L[l])); }
    const keep = e => e.overlap < MAX_OVERLAP;
    const all = [...atlas, ...postings].filter(keep);
    const counts = { atlas: atlas.filter(keep).length, postings: postings.filter(keep).length };
    for (const l of INDUSTRIES) counts[l] = postings.filter(e => keep(e) && e.ladder === l).length;
    return { atlas, postings, all, excluded: [...atlas, ...postings].filter(e => !keep(e)), counts };
  }

  // ---------- shares: a skill in a field (average over the field's roles), the roles that ask for it most ----------
  // D = { gById, mById, roles (Atlas.index().roles, both sets), groups (fields), generic (Atlas.genericSkills()) }
  const byFamily = (D, set, id) => (((set === "product" ? D.gById : D.mById)[id] || {}).by_family || {});
  function fieldShare(e, g, D) { const b = byFamily(D, g.set, e.skillId), roles = g.roles || []; return roles.length ? roles.reduce((a, r) => a + (b[r] || 0), 0) / roles.length : 0; }
  function candidates(pool, g, D) { return pool.all.filter(e => !D.generic.has(e.skillId)).map(e => ({ e, share: fieldShare(e, g, D), field: g })).filter(c => c.share >= MIN_SHARE); }
  // "Any field": every field's candidates, each ladder once, with the field where its share is highest
  function anyCandidates(pool, D) { const best = {}; for (const g of D.groups) for (const c of candidates(pool, g, D)) if (!best[c.e.key] || c.share > best[c.e.key].share) best[c.e.key] = c; return Object.values(best); }
  function topRoles(skillId, D, n) {
    return Object.values(D.roles).map(r => ({ id: r.id, label: r.label, nOpen: r.nOpen || 0, share: byFamily(D, r.set, skillId)[r.id] || 0 })).filter(r => r.share > 0).sort((a, b) => b.share - a.share || b.nOpen - a.nOpen).slice(0, n);
  }

  // ---------- the draw: five ladders weighted by share, at most two from postings, never two of one skill; easiest first ----------
  function draw(cands, rng, others) {
    const chosen = [], skills = new Set(); let postings = 0;
    const take = list => {
      const pool = list.slice();
      while (chosen.length < PER_GAME && pool.length) {
        let r = rng() * pool.reduce((a, c) => a + c.share, 0), i = 0;
        while (i < pool.length - 1 && (r -= pool[i].share) > 0) i++;
        const [c] = pool.splice(i, 1);
        if (skills.has(c.e.skillId) || (c.e.source === "postings" && postings >= MAX_POSTINGS)) continue;
        chosen.push(c); skills.add(c.e.skillId); if (c.e.source === "postings") postings++;
      }
    };
    take(cands); const own = chosen.length;
    if (chosen.length < PER_GAME && others) take(others.filter(o => !cands.some(c => c.e.key === o.e.key)));
    chosen.sort((a, b) => a.e.overlap - b.e.overlap);
    return { chosen, fromOther: chosen.length - own };
  }
  // the pile order: never the right order top to bottom, and not the ladder's order (Lead first) either
  function shuffleOrder(n, rng) {
    const id = Array.from({ length: n }, (_, i) => i);
    for (let tries = 0; tries < 100; tries++) {
      const a = id.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      const fixed = a.filter((v, i) => v === i).length, reversed = a.every((v, i) => v === n - 1 - i);
      if (n - fixed >= 2 && !reversed) return a;
    }
    return id.map(i => (i + 1) % n);   // unreachable in practice: every sentence one rung along
  }

  // ---------- scoring ----------
  const pointsFor = (placed, correct) => { const d = Math.abs(placed - correct); return d === 0 ? 2 : d === 1 ? 1 : 0; };
  // placed[i] = the rung index sentence i (whose right rung is i) was put on
  function score(placed) { const pts = placed.map((p, i) => pointsFor(p, i)); return { pts, total: pts.reduce((a, b) => a + b, 0) }; }
  const rankOf = total => (TITLES.find(([lo, hi]) => total >= lo && total <= hi) || TITLES[0])[2];
  const NUM = ["None", "One", "Two", "Three", "All four"];
  function verdictWords(pts) {
    const r = pts.filter(p => p === 2).length, h = pts.filter(p => p === 1).length, w = pts.filter(p => p === 0).length;
    if (r === 4) return "All four on the right rung.";
    const parts = [`${NUM[r]} on the right rung`]; if (h) parts.push(`${NUM[h].toLowerCase()} one rung off`); if (w) parts.push(`${NUM[w].toLowerCase()} further off`);
    return parts.join(", ") + ".";
  }
  function placeWords(placed, correct) {
    if (placed === correct) return "Right rung · +2";
    const d = correct - placed, n = Math.abs(d);
    return `Belongs on ${LABELS[correct]}, ${n === 1 ? "one rung" : n === 2 ? "two rungs" : "three rungs"} ${d > 0 ? "up" : "down"} · +${pointsFor(placed, correct)}`;
  }
  const gradeOf = (e, M, k) => e.ladder ? ((k !== "lead" && M.ladders && M.ladders[e.ladder] && M.ladders[e.ladder].levels[k]) || RUNG_NAMES[e.ladder][k]) : null;
  const ladderLabel = (e, M) => e.ladder ? ((M.ladders && M.ladders[e.ladder] && M.ladders[e.ladder].label) || e.ladder) : null;
  const lower1 = s => /^[A-Z][a-z]/.test(s || "") ? s[0].toLowerCase() + s.slice(1) : s;   // "Vendor…" → "vendor…"; "PRDs", "M&A" keep their case

  // ---------- the screens ----------
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  const pct = v => Math.round(v * 100) + "%";
  const isDev = () => typeof location !== "undefined" && (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:");
  let printed = false;

  async function mount(el, ctx) {
    const { Atlas, esc, showAside } = ctx;
    showAside(null);
    el.innerHTML = `<div class="page cl"><p class="eyebrow">Game · not timed</p><h1>Climb the ladder</h1><p class="lead">Loading the ladders…</p></div>`;
    const [ix, P, generic] = await Promise.all([Atlas.index(), Atlas.product(), Atlas.genericSkills()]);
    const M = ix.M, G = P.G;
    const D = { gById: P.skillById, mById: ix.skillById, roles: ix.roles, groups: M.groups.map(g => ix.groups.find(x => x.id === g.id)).filter(Boolean), generic };
    const pool = buildPool(G, M);
    if (isDev() && !printed) {
      printed = true; const c = pool.counts, ok = Object.keys(README_COUNTS).every(k => c[k] === README_COUNTS[k]);
      (ok ? console.info : console.warn)(`${SLUG}: pool ${c.atlas} atlas-written, ${c.postings} postings ladders (${c.corporate} corporate, ${c.bank} bank, ${c.consulting} consulting); excluded ${pool.excluded.map(e => e.key).join(", ") || "none"}. ${ok ? "Matches" : "Does not match"} the README (${README_COUNTS.atlas} / ${README_COUNTS.postings}: ${README_COUNTS.corporate}, ${README_COUNTS.bank}, ${README_COUNTS.consulting}).`);
    }
    const byField = Object.fromEntries(D.groups.map(g => [g.id, candidates(pool, g, D)]));
    const anyC = anyCandidates(pool, D);
    const rng = Math.random;
    const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    // state: which screen, the field, the game (five entries, scores) and the round (pile order, placements)
    const S = { screen: "pick", field: store.get(STORE_FIELD), game: null, round: null };
    let alive = true, focusSel = null, drag = null;
    const fieldLabel = () => S.field === "any" ? "Any field" : (D.groups.find(g => g.id === S.field) || {}).label || "";
    const fieldOf = id => D.groups.find(g => g.id === id);
    const page = html => { el.innerHTML = `<div class="page cl">${html}</div>`; window.scrollTo(0, 0); if (focusSel) { const f = el.querySelector(focusSel); if (f) f.focus(); focusSel = null; } };
    const $ = s => el.querySelector(s), $$ = s => [...el.querySelectorAll(s)];
    const live = msg => { const r = $("#cl-live"); if (r) { r.textContent = ""; setTimeout(() => { if (alive) r.textContent = msg; }, 30); } };

    // ---------- 1. pick a field ----------
    function renderPick() {
      S.screen = "pick"; S.game = null; S.round = null;
      const best = store.get(STORE_BEST);
      const tile = g => `<button type="button" class="cl-field${S.field === g.id ? " on" : ""}" data-field="${esc(g.id)}" aria-pressed="${S.field === g.id}">${esc(g.label)}<span class="n">${byField[g.id].length} ladders</span></button>`;
      const picked = S.field === "any" || fieldOf(S.field);
      const c = pool.counts;
      page(`<p class="eyebrow">Game · not timed</p><h1>Climb the ladder</h1>
        <p class="lead" style="max-width:720px">Four sentences describe one skill at four levels: Entry, Mid, Senior and Lead. Put each sentence on its rung. Five skills a game. It is the clearest way we know to see what senior actually means.</p>
        <div class="cl-pick">
          <section>
            <h2 style="margin-top:18px">Pick a field</h2>
            <p class="small muted">We pick five skills its postings ask for. The number is how many of its skills have all four rungs written.</p>
            <div class="cl-fields" role="group" aria-label="Fields">${D.groups.map(tile).join("")}<button type="button" class="cl-field any${S.field === "any" ? " on" : ""}" data-field="any" aria-pressed="${S.field === "any"}">Any field<span class="n">Five at random</span></button></div>
            <div class="row" style="margin-top:20px"><button type="button" class="btn primary" id="cl-start"${picked ? "" : " disabled"}>${picked ? `Start: ${esc(fieldLabel())} →` : "Start · pick a field first"}</button><span class="small muted">Your answers stay in this browser.</span></div>
          </section>
          <aside class="cl-rules" style="margin-top:18px" aria-label="How a round works">
            <h3 style="margin-top:0">How a round works</h3>
            <ol>
              <li>You get one skill and four sentences about it, shuffled.</li>
              <li>Drag each sentence onto its rung. Or select it and press <span class="cl-keys"><kbd>1</kbd>–<kbd>4</kbd></span>.</li>
              <li>Check. The right rung earns 2 points, one rung off earns 1.</li>
              <li>See what changes as you move up, then the next skill.</li>
            </ol>
            <p class="small muted">Five skills, up to 40 points. Your score becomes a title, from Summer intern to Head of the ladder.</p>
            <p class="small muted">Where the sentences come from: ${c.atlas} ladders written by the atlas for skills every field shares, and ${c.postings} drawn from postings, each for one industry (${c.corporate} corporate, ${c.bank} bank, ${c.consulting} consulting). Each round says which.</p>
            <div class="cl-best"><span>Your best</span><b>${best ? `${esc(String(best.score))} of 40 · ${esc(best.rank)} · ${esc(best.field)}` : "No game yet"}</b></div>
          </aside>
        </div>`);
      $$("[data-field]").forEach(b => b.onclick = () => { S.field = b.dataset.field; store.set(STORE_FIELD, S.field); focusSel = `[data-field="${S.field}"]`; renderPick(); });
      $("#cl-start").onclick = startGame;
    }

    // ---------- the game: five rounds ----------
    function startGame() {
      if (!(S.field === "any" || fieldOf(S.field))) return;
      const cands = S.field === "any" ? anyC : byField[S.field];
      const { chosen, fromOther } = draw(cands, rng, anyC);
      if (!chosen.length) { page(`<h1>Climb the ladder</h1><p class="lead">No ladder qualifies for this field yet.</p><div class="row"><button type="button" class="btn" id="cl-back">← Pick another field</button></div>`); $("#cl-back").onclick = renderPick; return; }
      S.game = { entries: chosen, fromOther, i: 0, results: [] };
      startRound();
    }
    function startRound() {
      const c = S.game.entries[S.game.i];
      S.round = { c, e: c.e, order: shuffleOrder(4, rng), placed: [-1, -1, -1, -1], selected: null, checked: false, pts: null, revealed: false };
      focusSel = ".cl-pile .cl-line[data-id]";
      renderSort();
    }
    const total = () => S.game.results.reduce((a, r) => a + r.total, 0);
    const progress = (i, done) => `<div class="cl-progress" aria-label="${done ? "Five of five done" : `Skill ${i + 1} of ${S.game.entries.length}`}">${S.game.entries.map((_, k) => `<i class="${done || k < i ? "done" : k === i ? "now" : ""}"></i>`).join("")}</div>`;
    function head() {
      const { c, e } = S.round, g = c.field, n = S.game.entries.length, i = S.game.i;
      const cluster = (M.clusters[e.cluster] || G.clusters[e.cluster] || { label: e.cluster }).label;
      const src = e.ladder ? `from postings, ${esc(lower1(ladderLabel(e, M)))} ladder` : "ladder written by the atlas";
      const where = S.field === "any" ? `${esc(g.label)} postings (its strongest field, average over its ${g.roles.length} roles)` : `${esc(g.label)} postings (average over its ${g.roles.length} roles)`;
      const other = S.game.fromOther ? ` · ${NUM[S.game.fromOther] || S.game.fromOther} ${S.game.fromOther === 1 ? "skill" : "skills"} from other fields` : "";
      return `<div class="cl-head"><div>${progress(i)}<p class="eyebrow">Skill ${i + 1} of ${n} · ${esc(cluster)}</p><h1>${esc(e.name)}</h1>
        <p class="facts">Asked by <span class="cl-num">${pct(c.share)}</span> of ${where} · ${src}${other}</p></div>
        <div class="cl-score">Score<b>${total() + (S.round.pts ? S.round.pts.total : 0)}</b>of ${n * 8}</div></div>`;
    }
    const lv = (e, k) => { const grade = gradeOf(e, M, KEYS[k]); return `<div class="lv"><span class="key" aria-hidden="true">${k + 1}</span>${LABELS[k]}${grade ? `<span class="grade">${esc(grade)}</span>` : ""}</div>`; };
    const rungAria = (e, k, text) => `Rung ${k + 1}, ${LABELS[k]}${gradeOf(e, M, KEYS[k]) ? ", " + gradeOf(e, M, KEYS[k]) : ""}, ${text ? "holds: " + text : "empty"}`;

    // ---------- 2. sort ----------
    function renderSort() {
      S.screen = "sort";
      const R = S.round, e = R.e, sel = R.selected;
      const left = R.placed.filter(p => p < 0).length;
      const line = i => `<button type="button" class="cl-line${sel === i ? " sel" : ""}" data-id="${i}" aria-pressed="${sel === i}" aria-label="${esc(e.rungs[i])}${R.placed[i] >= 0 ? `, on ${LABELS[R.placed[i]]}` : ""}. ${sel === i ? "Selected: press 1 to 4 to place it" : "Press Enter to select"}"><span class="grip" aria-hidden="true">⋮⋮</span><span>${esc(e.rungs[i])}</span></button>`;
      const pile = R.order.map(i => R.placed[i] < 0 ? line(i) : `<div class="cl-line ghost" aria-hidden="true"><span class="grip"></span><span>On ${LABELS[R.placed[i]]}</span></div>`).join("");
      const slot = k => { const i = R.placed.indexOf(k); return i >= 0 ? `<div class="cl-slot filled" data-slot="${k}" role="group" aria-label="${esc(rungAria(e, k, e.rungs[i]))}">${line(i)}</div>` : `<div class="cl-slot" data-slot="${k}" role="group" aria-label="${esc(rungAria(e, k, null))}">${sel != null ? `Press ${k + 1} to put the selected sentence here` : "Empty"}</div>`; };
      const full = left === 0;
      page(`${head()}
        <div class="cl-board">
          <section>
            <p class="cl-col-h"><span>Four sentences, shuffled</span><span>${left === 0 ? "All placed" : `${left} left`}</span></p>
            <div class="cl-pile">${pile}</div>
            <p class="cl-keys" style="margin-top:16px">Drag a sentence onto a rung, or select it and press <kbd>1</kbd> Entry, <kbd>2</kbd> Mid, <kbd>3</kbd> Senior, <kbd>4</kbd> Lead. <kbd>Backspace</kbd> takes it back. <kbd>Esc</kbd> clears the selection.</p>
            <p class="cl-sr" id="cl-live" aria-live="polite"></p>
          </section>
          <section>
            <p class="cl-col-h"><span>The ladder</span><span>Top is the most senior</span></p>
            <div class="cl-ladder">${[3, 2, 1, 0].map(k => `<div class="cl-rung">${lv(e, k)}${slot(k)}</div>`).join("")}</div>
            <div class="row between" style="margin-top:18px">
              <span class="small muted">${e.ladder ? `Grade names: the ${esc(lower1(ladderLabel(e, M)))} ladder the depth pipeline wrote these rungs for.` : "Not timed. Change your mind as often as you like."}</span>
              <button type="button" class="btn${full ? " primary" : ""}" id="cl-check"${full ? "" : " disabled"}>${full ? "Check" : "Check · place all four first"}</button>
            </div>
          </section>
        </div>`);
      $$(".cl-line[data-id]").forEach(b => { b.onclick = () => { if (drag && drag.moved) { drag = null; return; } select(Number(b.dataset.id)); }; b.onpointerdown = ev => dragStart(ev, Number(b.dataset.id)); });
      $$(".cl-slot").forEach(s => { s.onclick = () => { if (R.selected != null) place(R.selected, Number(s.dataset.slot)); }; s.onpointerenter = () => { if (R.selected != null && !s.classList.contains("filled")) s.classList.add("over"); }; s.onpointerleave = () => s.classList.remove("over"); });
      $("#cl-check").onclick = check;
    }
    function select(i) { const R = S.round; R.selected = R.selected === i ? null : i; focusSel = `.cl-line[data-id="${i}"]`; renderSort(); }
    function place(i, k) {
      const R = S.round; if (R.checked) return;
      const other = R.placed.indexOf(k), from = R.placed[i];
      R.placed[i] = k; if (other >= 0 && other !== i) R.placed[other] = from;   // a full rung swaps
      R.selected = null;
      const next = R.order.find(j => R.placed[j] < 0);
      focusSel = next != null ? `.cl-pile .cl-line[data-id="${next}"]` : "#cl-check";
      renderSort();
      const left = R.placed.filter(p => p < 0).length;
      live(`On ${LABELS[k]}${other >= 0 && other !== i ? (from >= 0 ? `, swapped with the sentence on ${LABELS[from]}` : ", the sentence there went back to the pile") : ""}. ${left ? `${left} left.` : "All four placed. Press Enter on Check."}`);
    }
    function unplace(i) {
      const R = S.round; if (R.checked || R.placed[i] < 0) return;
      R.placed[i] = -1; R.selected = null; focusSel = `.cl-pile .cl-line[data-id="${i}"]`; renderSort(); live("Back in the pile.");
    }

    // drag and drop with pointer events: an extra on top of the keyboard path
    function dragStart(ev, i) {
      if (S.round.checked || ev.button !== 0) return;
      const src = ev.currentTarget;
      drag = { i, x0: ev.clientX, y0: ev.clientY, moved: false, src, ghost: null, over: null };
      const move = e2 => {
        if (!drag) return;
        if (!drag.moved) { if (Math.hypot(e2.clientX - drag.x0, e2.clientY - drag.y0) < 6) return; drag.moved = true; const g = src.cloneNode(true); g.className = "cl-line cl-drag"; g.style.width = src.offsetWidth + "px"; document.body.appendChild(g); drag.ghost = g; src.classList.add("dragging"); }
        drag.ghost.style.transform = `translate(${e2.clientX - drag.x0 + src.getBoundingClientRect().left}px, ${e2.clientY - drag.y0 + src.getBoundingClientRect().top}px)`;
        const under = document.elementFromPoint(e2.clientX, e2.clientY), slot = under && under.closest(".cl-slot"), pileEl = under && under.closest(".cl-pile");
        const target = slot || pileEl || null;
        if (drag.over !== target) { if (drag.over) drag.over.classList.remove("over"); if (target) target.classList.add("over"); drag.over = target; }
      };
      const up = e2 => {
        document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
        if (!drag) return;
        const d = drag; if (d.ghost) d.ghost.remove(); if (d.over) d.over.classList.remove("over"); src.classList.remove("dragging");
        if (!d.moved) { drag = null; return; }   // a click: the button's click handler selects
        const under = document.elementFromPoint(e2.clientX, e2.clientY), slot = under && under.closest(".cl-slot");
        if (slot) place(d.i, Number(slot.dataset.slot)); else if (S.round.placed[d.i] >= 0) unplace(d.i);   // outside a rung: back to the pile
        setTimeout(() => { drag = null; }, 0);
      };
      document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
    }

    // keys: 1–4 place (the selected sentence, else the first in the pile), Backspace returns, Escape clears, arrows move
    function onKey(ev) {
      if (!alive || S.screen !== "sort" || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target, inField = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName); if (inField) return;
      const R = S.round;
      if (R.checked) return;
      if (/^[1-4]$/.test(ev.key)) { const i = R.selected != null ? R.selected : R.order.find(j => R.placed[j] < 0); if (i != null) { ev.preventDefault(); place(i, Number(ev.key) - 1); } return; }
      if (ev.key === "Backspace" || ev.key === "Delete") { const i = R.selected != null ? R.selected : (t && t.dataset && t.dataset.id != null ? Number(t.dataset.id) : null); if (i != null && R.placed[i] >= 0) { ev.preventDefault(); unplace(i); } return; }
      if (ev.key === "Escape") { if (R.selected != null) { R.selected = null; focusSel = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.id != null ? `.cl-line[data-id="${document.activeElement.dataset.id}"]` : null; renderSort(); live("Selection cleared."); } return; }
      if (/^Arrow(Up|Down|Left|Right)$/.test(ev.key) && t && t.classList && t.classList.contains("cl-line")) {
        const lines = $$(".cl-line[data-id]"), at = lines.indexOf(t); if (at < 0) return;
        ev.preventDefault(); const dir = /Down|Right/.test(ev.key) ? 1 : -1; lines[(at + dir + lines.length) % lines.length].focus();
      }
    }
    document.addEventListener("keydown", onKey);

    // ---------- 3. checked ----------
    function check() {
      const R = S.round; if (R.checked || R.placed.some(p => p < 0)) return;
      R.checked = true; R.pts = score(R.placed);
      S.game.results.push({ c: R.c, e: R.e, placed: R.placed.slice(), pts: R.pts.pts, total: R.pts.total });
      focusSel = "#cl-verdict";
      renderChecked();
    }
    function renderChecked() {
      S.screen = "checked";
      const R = S.round, e = R.e, { pts, total: t } = R.pts, i = S.game.i, n = S.game.entries.length, last = i === n - 1;
      const where = k => R.revealed ? k : R.placed.indexOf(k);   // which sentence sits on rung k: as placed, or after "Show the right order"
      const lineChecked = (sIdx, k) => { const p = pts[sIdx], cls = p === 2 ? "right" : "wrong", placedOn = R.placed[sIdx];
        const words = p === 2 ? "Right rung · +2" : R.revealed ? `You put it on ${LABELS[placedOn]}, ${Math.abs(sIdx - placedOn) === 1 ? "one rung" : Math.abs(sIdx - placedOn) === 2 ? "two rungs" : "three rungs"} ${placedOn > sIdx ? "up" : "down"} · +${p}` : placeWords(placedOn, sIdx);
        const arrow = p === 2 ? "✓" : (R.revealed ? placedOn > sIdx : sIdx > placedOn) ? "↑" : "↓";
        return `<div class="cl-line ${cls}" data-id="${sIdx}"><span class="grip" aria-hidden="true">${arrow}</span><span>${markNew(e.rungs[sIdx], newKeys(e.rungs, sIdx), esc)}</span><span class="verdict-l">${words}</span></div>`; };
      const rung = k => { const sIdx = where(k); return `<div class="cl-rung ${pts[sIdx] === 2 ? "here-right" : "here-wrong"}">${lv(e, k)}<div class="cl-slot filled" role="group" aria-label="${esc(rungAria(e, k, e.rungs[sIdx]))}">${lineChecked(sIdx, k)}</div></div>`; };
      const roles = topRoles(e.skillId, D, 3);
      const buildLink = e.build.length ? `<button type="button" class="linkish link" id="cl-build" aria-expanded="false">How to build ${esc(lower1(e.name))} →</button>` : `<span class="small subtle">No build step is written for this skill yet.</span> ${roles[0] ? `<a class="link" href="#/role/${esc(roles[0].id)}">How postings say it →</a>` : ""}`;
      const grades = e.ladder ? KEYS.map(k => gradeOf(e, M, k)) : null;
      const gradeNote = grades ? `<p class="small muted">This ladder uses ${esc(lower1(ladderLabel(e, M)))} grades: ${grades.map(esc).join(" → ")}.${grades[1].toLowerCase() === "associate" ? " At a bank, Associate is the second rung, not the first: analysts join below it." : ""}</p>` : "";
      const country = (M.meta || {}).country || "US";
      page(`${head()}
        <div class="cl-board">
          <section>
            <p class="verdict" id="cl-verdict" tabindex="-1" aria-live="polite" style="margin-top:0">${verdictWords(pts)}</p>
            <p class="facts" style="margin:0 0 6px" aria-live="polite">${pts.map(p => "+" + p).join(" ")} · <b style="color:var(--heading-foreground)">${t} of 8</b></p>
            <p class="small muted">${esc(verbNote(e.verbs, LABELS))}</p>${gradeNote}
            <h3 style="margin-top:18px">What changes as you move up</h3>
            <div class="cl-verbs" aria-label="The first word of each rung, Entry to Lead">${e.verbs.map((v, k) => `${k ? '<i aria-hidden="true">→</i>' : ""}<span>${esc(v)}</span>`).join("")}</div>
            <p class="small muted" style="margin-top:8px">The first word of each rung, Entry to Lead. On the ladder, the words in bold are new at that rung: they appear in no rung below it.</p>
            ${e.climb ? `<p>${esc(e.climb)}</p>` : ""}
            ${e.ladder ? `<p class="small muted">Every sentence here comes from ${esc(country)} postings: each is asked for by at least two employers at that level.</p>` : ""}
            <h3 style="margin-top:18px">Where to go from here</h3>
            <p style="margin:4px 0 8px">${buildLink}</p>
            ${e.build.length ? `<div class="cl-drawer" id="cl-drawer" hidden><p class="small muted" style="margin:0">How to build it, as the atlas writes it</p><ul class="plain">${e.build.map(b => `<li>${esc(b)}</li>`).join("")}</ul></div>` : ""}
            <p class="small muted" style="margin:0 0 4px">Roles whose postings ask for it most</p>
            <div class="tags">${roles.map(r => `<a class="tag" href="#/role/${esc(r.id)}">${esc(r.label)} <span class="cl-num">${pct(r.share)}</span></a>`).join("") || '<span class="small muted">No role in the atlas asks for it yet.</span>'}</div>
          </section>
          <section>
            <p class="cl-col-h"><span>Your ladder, checked</span><span>Top is the most senior</span></p>
            <div class="cl-ladder" id="cl-ladder">${[3, 2, 1, 0].map(rung).join("")}</div>
            <div class="row between" style="margin-top:18px">
              ${t === 8 || R.revealed ? `<span class="small muted">${t === 8 ? (e.ladder ? `Grade names: the ${esc(lower1(ladderLabel(e, M)))} ladder the depth pipeline wrote these rungs for.` : "That is the right order.") : "Shown in the right order."}</span>` : `<button type="button" class="btn quiet" id="cl-reveal">Show the right order</button>`}
              <button type="button" class="btn primary" id="cl-next">${last ? "See your title →" : `Next skill · ${i + 2} of ${n} →`}</button>
            </div>
          </section>
        </div>`);
      const b = $("#cl-build"); if (b) b.onclick = () => { const d = $("#cl-drawer"); d.hidden = !d.hidden; b.setAttribute("aria-expanded", String(!d.hidden)); };
      const rv = $("#cl-reveal"); if (rv) rv.onclick = reveal;
      $("#cl-next").onclick = () => { if (last) renderEnd(); else { S.game.i++; startRound(); } };
    }
    // "Show the right order": the sentences move to their rungs; a short move animation unless motion is reduced
    function reveal() {
      const R = S.round; if (R.revealed) return;
      const before = {}; $$("#cl-ladder .cl-line[data-id]").forEach(l => before[l.dataset.id] = l.getBoundingClientRect().top);
      R.revealed = true; focusSel = "#cl-next"; const y = window.scrollY; renderChecked(); window.scrollTo(0, y);
      if (reduced()) return;
      $$("#cl-ladder .cl-line[data-id]").forEach(l => { const dy = (before[l.dataset.id] || 0) - l.getBoundingClientRect().top; if (!dy) return; l.style.transition = "none"; l.style.transform = `translateY(${dy}px)`; requestAnimationFrame(() => { l.style.transition = "transform .4s ease"; l.style.transform = ""; }); });
    }

    // ---------- 4. end ----------
    function renderEnd() {
      S.screen = "end";
      const t = total(), n = S.game.entries.length, rank = rankOf(t), label = fieldLabel();
      let best = store.get(STORE_BEST), isBest = false;
      if (!best || typeof best.score !== "number" || t > best.score) { best = { score: t, rank, field: label, date: new Date().toISOString().slice(0, 10) }; store.set(STORE_BEST, best); isBest = true; }
      const dots = r => `<span class="cl-dots" aria-label="${r.pts.map((p, k) => `${LABELS[k]} ${p === 2 ? "right" : p === 1 ? "one off" : "two or more off"}`).join(", ")}">${r.pts.map(p => `<i class="${p === 2 ? "d-r" : p === 1 ? "d-h" : "d-w"}"></i>`).join("")}</span>`;
      const row = (r, k) => { const roles = topRoles(r.e.skillId, D, 2);
        const src = r.e.ladder ? `From postings · ${esc(lower1(ladderLabel(r.e, M)))} ladder` : "Written by the atlas";
        const how = r.e.build.length ? `<button type="button" class="linkish link" data-build="${k}" aria-expanded="false">How to build it →</button>` : roles[0] ? `<a href="#/role/${esc(roles[0].id)}">How postings say it →</a>` : "";
        return `<div class="r"><span class="t">${esc(r.e.name)}</span><span class="pts">${dots(r)}<b>${r.total}</b>/8</span>
          <span class="m">${src} · ${r.e.verbs.map(esc).join(" → ")}</span>
          <span class="ln">${how}<span class="roles">${roles.map(x => `<a href="#/role/${esc(x.id)}">${esc(x.label)}</a> <span class="cl-num">${pct(x.share)}</span>`).join(", ")}</span></span>
          ${r.e.build.length ? `<div class="cl-drawer" id="cl-drawer-${k}" hidden><ul class="plain">${r.e.build.map(b => `<li>${esc(b)}</li>`).join("")}</ul></div>` : ""}</div>`; };
      const g = S.field !== "any" ? fieldOf(S.field) : null;
      page(`${progress(n, true)}
        <div class="cl-end">
          <section>
            <p class="eyebrow">${esc(label)} · ${t} of ${n * 8}</p>
            <p class="cl-rank" id="cl-rank" tabindex="-1">${esc(rank)}</p>
            <p class="small muted">Your best: <b style="color:var(--heading-foreground);font-weight:500">${best.score}</b>${isBest ? ", this game." : ` (${esc(best.rank)}), ${esc(best.field)}, ${esc(best.date)}.`}</p>
            <p class="cl-punch">Same skill, four different jobs. A title tells you the rung, not the job.</p>
            <p class="small muted">Every role in the atlas shows what its postings ask for at each level. Open one and pick a level.</p>
            <div class="cl-ranks" aria-label="Titles by score">${TITLES.map(([lo, hi, name]) => `<span class="${name === rank ? "on" : ""}">${lo === hi ? lo : `${lo}–${hi}`}</span><span class="${name === rank ? "on" : ""}">${name}${name === rank ? ' <span class="cl-sr">(yours)</span>' : ""}</span>`).join("")}</div>
            <div class="row" style="margin-top:20px"><button type="button" class="btn primary" id="cl-again">Play again</button><button type="button" class="btn" id="cl-other">Another field</button>${g ? `<a class="btn quiet" href="#/field/${esc(g.id)}">Open ${esc(g.label)} →</a>` : `<a class="btn quiet" href="#/explore">Explore the roles →</a>`}</div>
          </section>
          <section>
            <p class="cl-col-h"><span>Your five skills</span><span>Entry to Lead · points</span></p>
            <div class="list cl-results">${S.game.results.map(row).join("")}</div>
            <p class="small muted" style="margin-top:10px">Each square is one sentence, Entry to Lead: green on the right rung, faded green one rung off, amber two or more off. The roles are the two whose postings ask for the skill most.</p>
          </section>
        </div>`);
      $("#cl-rank").focus();
      $("#cl-again").onclick = startGame;
      $("#cl-other").onclick = () => { focusSel = "#cl-start"; renderPick(); };
      $$("[data-build]").forEach(b => b.onclick = () => { const d = $(`#cl-drawer-${b.dataset.build}`); d.hidden = !d.hidden; b.setAttribute("aria-expanded", String(!d.hidden)); });
    }

    // leaving the route: the game is lost (no resume in v1); listeners go with it
    const leave = () => { alive = false; document.removeEventListener("keydown", onKey); if (drag && drag.ghost) drag.ghost.remove(); drag = null; window.removeEventListener("hashchange", leave); };
    window.addEventListener("hashchange", leave);
    renderPick();
  }

  return { mount, buildPool, candidates, anyCandidates, fieldShare, topRoles, draw, shuffleOrder, score, pointsFor, rankOf, verdictWords, placeWords, verbChain, verbNote, newWords, markNew, tokens, jaccard, firstWord, buildSteps, RUNG_NAMES, TITLES, KEYS, LABELS, MAX_OVERLAP, MIN_SHARE };
});
