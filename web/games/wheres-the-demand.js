/* Where's the demand: a market-sense quick-fire on the MBA set's open US postings (spec: games/wheres-the-demand/README.md).
   Two cards, one question: which has more open postings right now? Ten questions, eight seconds each.
   Pure pair-building (buildRound) first, so node can test it; the DOM part registers window.Games["wheres-the-demand"]. */
(function (root) {
  "use strict";
  const SLUG = "wheres-the-demand", STORE_KEY = "game." + SLUG;
  const N = 10, SECONDS = 8, LOW_AT = 3, KEEP_ROUNDS = 5, STALE_DAYS = 10;
  const MIN_EMPLOYER = 10, FILE_MAX = 1.5e6, FILE_TRIES = 3, FILE_WAIT = 6000;
  const MIN_RATIO = 1.1, BAND_FLOOR = 1.2, BAND_CEIL = 3;
  const BANDS = { easy: { lo: 2, hi: 3, incl: true }, medium: { lo: 1.5, hi: 2, incl: false }, hard: { lo: 1.2, hi: 1.5, incl: false } };
  const RANKS = [[2, "warming up"], [4, "hunch"], [6, "steady"], [8, "sharp"], [9, "keen"], [10, "uncanny"]];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ---------- small pure helpers ----------
  const r1 = x => Math.round(x * 10) / 10;
  const inBand = (r, b) => r >= b.lo - 1e-9 && (b.incl ? r <= b.hi + 1e-9 : r < b.hi - 1e-9);
  const widen = b => { const lo = Math.max(BAND_FLOOR, r1(b.lo - 0.1)), hi = Math.min(BAND_CEIL, r1(b.hi + 0.1)); return { lo, hi, incl: b.incl || hi >= BAND_CEIL }; };
  const canWiden = b => b.lo > BAND_FLOOR + 1e-9 || b.hi < BAND_CEIL - 1e-9;
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
  function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  // a small seeded generator (mulberry32) for ?seed= rounds and tests
  function seeded(seed) { let a = (Number(seed) >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const fmt = n => Number(n).toLocaleString();
  const fmtRatio = r => String(r1(r)).replace(/\.0$/, "") + "×";
  function fmtDate(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso || ""); }
  function daysSince(iso, now = new Date()) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); if (!m) return 0; const then = Date.UTC(+m[1], +m[2] - 1, +m[3]), today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()); return Math.floor((today - then) / 86400000); }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  function rankTitle(score) { const key = (RANKS.find(([max]) => score <= max) || RANKS[RANKS.length - 1])[1]; return { key, title: "Market sense: " + key }; }

  // ---------- the entities a card can show: MBA roles (not small) and the MBA fields; never ix.roles (product's pmm overwrites it) ----------
  function entities(ix) {
    const fields = ix.groups.filter(g => g.set === "mba" && g.id !== "product");
    const allRoles = [], byField = {};
    for (const g of fields) {
      byField[g.id] = [];
      for (const id of g.roles) {
        const r = ix.M.roles[id]; if (!r) continue;
        const card = { kind: "role", id, label: r.label, sub: g.label, group: g.id, field: g.label, n: r.n_open, unit: "open", employers: r.n_companies, meta: `from ${fmt(r.n_companies)} employers`, small: !!r.small, bytes: r.bytes || 0, file: r.file };
        allRoles.push(card); if (!card.small) byField[g.id].push(card);
      }
    }
    const roles = allRoles.filter(r => !r.small);
    const fieldCards = fields.map(g => ({ kind: "field", id: g.id, label: g.label, sub: `${g.roles.length} roles`, n: g.nOpen, unit: "open", roles: g.roles.length, meta: `${g.roles.length} roles` }));
    return { fields: fieldCards, roles, allRoles, byField };
  }
  // the skills generic to the set (the same rule as Atlas.genericSkills, for when no set is passed in)
  function genericFrom(ix) {
    const count = {}, mba = Object.values(ix.roles).filter(r => r.set === "mba");
    for (const r of mba) for (const a of [...(r.definingList || []), ...(r.asks || [])]) if (a.share >= 0.5) count[a.id] = (count[a.id] || 0) + 1;
    return new Set(Object.entries(count).filter(([, c]) => c >= mba.length / 2).map(([id]) => id));
  }

  // ---------- the pools, one per question type: every pair in the band, both sides unused ----------
  const sides = (w, l, rng) => { const left = rng() < 0.5; return { left: left ? w : l, right: left ? l : w, winner: left ? "left" : "right" }; };
  function rolePairs(ents, used, band) {
    const out = [], R = ents.roles;
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      const a = R[i], b = R[j];
      if (used.roles.has(a.id) || used.roles.has(b.id) || a.n === b.n) continue;
      const [w, l] = a.n > b.n ? [a, b] : [b, a], ratio = w.n / l.n;
      if (!inBand(ratio, band)) continue;
      out.push({ w, l, ratio, same: a.group === b.group, concentrated: w.employers < l.employers });
    }
    return out;
  }
  function fieldPairs(ents, used, band) {
    const out = [], F = ents.fields;
    for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
      const a = F[i], b = F[j];
      if (used.fields.has(a.id) || used.fields.has(b.id) || a.n === b.n) continue;
      const [w, l] = a.n > b.n ? [a, b] : [b, a], ratio = w.n / l.n;
      if (inBand(ratio, band)) out.push({ w, l, ratio });
    }
    return out;
  }
  // which field has more roles where most postings ask for the skill: counted in roles, fair to small fields (share check)
  function skillPairs(ix, ents, used, band, generic, core) {
    const out = [], F = ents.fields.filter(f => !used.fields.has(f.id));
    for (const s of ix.M.skills) {
      if (s.cluster === "credentials" || s.id.startsWith("yoe_") || generic.has(s.id)) continue;
      const bf = s.by_family || {};
      const asking = {}; for (const f of F) asking[f.id] = ents.byField[f.id].filter(r => (bf[r.id] || 0) >= core).length;
      for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
        const a = F[i], b = F[j], na = asking[a.id], nb = asking[b.id];
        if (!na || !nb || na === nb) continue;
        const [wf, lf, nw, nl] = na > nb ? [a, b, na, nb] : [b, a, nb, na], ratio = nw / nl;
        if (!inBand(ratio, band)) continue;
        const ow = ents.byField[wf.id].length, ol = ents.byField[lf.id].length;
        if (nw / ow <= nl / ol) continue;
        const card = (f, n, of) => ({ kind: "skillfield", id: f.id, label: f.label, sub: `of ${of} roles`, n, of, unit: "roles", meta: `of ${of} roles` });
        out.push({ skill: { id: s.id, name: s.name }, w: card(wf, nw, ow), l: card(lf, nl, ol), ratio });
      }
    }
    return out;
  }
  // one role's open postings by employer type: large companies, startups, or consulting firms, banks and funds
  function employerCounts(jobs, A) {
    const counts = {}; for (const [k] of A.EMPLOYER_TYPES) counts[k] = 0;
    for (const j of jobs) { if (j.open === false) continue; const t = A.employerType(j); if (t in counts) counts[t]++; }
    return counts;
  }
  function employerPairs(role, jobs, band, A) {
    const counts = employerCounts(jobs, A), types = A.EMPLOYER_TYPES.map(([id, label]) => ({ id, label, n: counts[id] })).filter(t => t.n >= MIN_EMPLOYER), out = [];
    for (let i = 0; i < types.length; i++) for (let j = i + 1; j < types.length; j++) {
      const a = types[i], b = types[j]; if (a.n === b.n) continue;
      const [w, l] = a.n > b.n ? [a, b] : [b, a], ratio = w.n / l.n;
      if (!inBand(ratio, band)) continue;
      const card = t => ({ kind: "employer", id: t.id, label: t.label, sub: role.label, n: t.n, unit: "open", role: role.id, roleLabel: role.label, meta: `of ${fmt(role.n)} open ${role.label} postings` });
      out.push({ role, w: card(w), l: card(l), ratio });
    }
    return out;
  }

  // ---------- the round: 10 slots, bands by slot, the rules of "Choosing pairs" ----------
  function template(rng) {
    return [...shuffle(["role", "employer", "skill"], rng).map(t => ({ type: t, band: BANDS.easy })),
      ...shuffle(["role", "role", "field", "field"], rng).map(t => ({ type: t, band: BANDS.medium })),
      ...["role", "role", "role"].map(t => ({ type: t, band: BANDS.hard }))];
  }
  // widen the band 0.1 at a time towards 1.2 or 3 until the pool has something
  function withWidening(band, poolOf) {
    let b = band, pool = poolOf(b), log = null;
    while (!pool.length && canWiden(b)) { b = widen(b); pool = poolOf(b); log = `band widened to ${b.lo}–${b.hi}`; }
    return { pool, band: b, fallback: log };
  }
  function buildRound(ix, roleFiles, rng, opts = {}) {
    const A = opts.Atlas || root.Atlas; if (!A) throw new Error("buildRound needs Atlas (opts.Atlas)");
    const core = (A.TIER && A.TIER.core) || 0.5, generic = opts.generic || genericFrom(ix);
    const ents = entities(ix), slots = template(rng).slice(0, opts.n || N);
    const used = { roles: new Set(), fields: new Set() };
    const files = Object.entries(roleFiles || {}).map(([id, f]) => ({ role: ents.roles.find(r => r.id === id) || ents.allRoles.find(r => r.id === id), jobs: Array.isArray(f) ? f : (f && f.jobs) || [] })).filter(x => x.role);
    const roleSlots = slots.map((s, i) => s.type === "role" ? i : -1).filter(i => i >= 0);
    let concentratedAt = roleSlots.length ? pick(roleSlots, rng) : -1, needConcentrated = roleSlots.length > 0;
    const questions = [];

    const rolePick = (band, i) => {
      // the concentrated pair (more postings from fewer employers) goes in one random role slot, or the next that has one
      let res = withWidening(band, b => rolePairs(ents, used, b)), fallback = res.fallback, p = null;
      if (!res.pool.length) { res = { pool: rolePairs(ents, used, { lo: MIN_RATIO, hi: Infinity, incl: true }), band: res.band }; fallback = "role pair from any band"; }
      if (!res.pool.length) throw new Error("no role pair left for question " + (i + 1));
      let pool = res.pool;
      if (needConcentrated && i >= concentratedAt) { const c = pool.filter(x => x.concentrated); if (c.length) { pool = c; needConcentrated = false; } }
      const same = pool.filter(x => x.same);
      p = same.length && rng() < 0.5 ? pick(same, rng) : pick(pool, rng);
      used.roles.add(p.w.id); used.roles.add(p.l.id);
      return { type: "role", ...p, band: res.band, fallback };
    };

    // build the employer, skill and field questions first, then the role pairs, so a role pair never takes the
    // employer question's role; every question keeps its slot
    const order = [...slots.map((s, i) => s.type === "role" ? -1 : i).filter(i => i >= 0), ...roleSlots];
    for (const i of order) {
      const slot = slots[i];
      let q = null, fallback = null;
      if (slot.type === "field") {
        const res = withWidening(slot.band, b => fieldPairs(ents, used, b));
        if (res.pool.length) { const p = pick(res.pool, rng); used.fields.add(p.w.id); used.fields.add(p.l.id); q = { type: "field", ...p, band: res.band, fallback: res.fallback }; }
        else fallback = "no field pair: role pair instead";
      } else if (slot.type === "skill") {
        const res = withWidening(slot.band, b => skillPairs(ix, ents, used, b, generic, core));
        if (res.pool.length) { const p = pick(res.pool, rng); used.fields.add(p.w.id); used.fields.add(p.l.id); q = { type: "skill", ...p, band: res.band, fallback: res.fallback }; }
        else fallback = "no skill pair: role pair instead";
      } else if (slot.type === "employer") {
        // every file loaded in the slot's band first, then the band widened, then a role pair
        const res = withWidening(slot.band, b => files.filter(f => !used.roles.has(f.role.id)).flatMap(f => employerPairs(f.role, f.jobs, b, A)));
        if (res.pool.length) { const p = pick(res.pool, rng); used.roles.add(p.role.id); q = { type: "employer", ...p, band: res.band, fallback: res.fallback }; }
        else fallback = files.length ? "no employer-type pair in the files loaded: role pair instead" : "no role file loaded: role pair instead";
      }
      if (!q) { q = rolePick(slot.band, i); if (fallback) q.fallback = fallback + (q.fallback ? "; " + q.fallback : ""); }
      const s = sides(q.w, q.l, rng);
      questions[i] = { i, type: q.type, band: q.band, ratio: q.ratio, left: s.left, right: s.right, winner: s.winner, w: q.w, l: q.l, same: !!q.same, concentrated: !!q.concentrated, skill: q.skill || null, role: q.role || null, fallback: q.fallback || null };
    }
    const meta = ix.M.meta || {};
    return { questions, meta: { generated: meta.generated, nOpen: meta.n_open, country: meta.country, nRoles: ents.allRoles.length, nFields: ents.fields.length }, fallbacks: questions.filter(q => q.fallback).map(q => `q${q.i + 1} (${q.type}): ${q.fallback}`) };
  }

  // ---------- words: prompt, sub-line, the gap sentence, the recap ----------
  const PROMPT = { role: "More open US postings right now?", field: "Which field has more open US postings?", employer: q => `${q.role.label}: where are more of the open US postings?`, skill: q => `More roles where most postings ask for ${q.skill.name}?` };
  const prompt = q => typeof PROMPT[q.type] === "function" ? PROMPT[q.type](q) : PROMPT[q.type];
  const subLine = (q, date) => q.type === "skill" ? `Counted in roles, not postings. A role counts when half or more of its postings ask. As of ${date}.` : `Open postings only, as of ${date}.`;
  const footNote = q => q.type === "role" ? (q.same ? `${q.w.field} · both roles` : `${q.left.field} against ${q.right.field}`) : q.type === "field" ? "Two fields" : q.type === "employer" ? "One role, three kinds of employer" : "Two fields, one skill";
  const moreTag = q => q.type === "skill" ? "More roles" : "More postings";
  // the one line on the gap, as parts: ["t", text] or ["n", number or ratio]
  function gapLine(q) {
    const { w, l } = q, r = fmtRatio(q.ratio);
    if (q.type === "role") return w.employers < l.employers ? [["t", `${w.label} has `], ["n", r], ["t", " the open postings, from fewer employers: "], ["n", fmt(w.employers)], ["t", " against "], ["n", fmt(l.employers)], ["t", "."]]
      : [["t", `${w.label} has `], ["n", r], ["t", " the open postings: "], ["n", fmt(w.n)], ["t", " against "], ["n", fmt(l.n)], ["t", "."]];
    if (q.type === "field") return [["t", `${w.label} has `], ["n", r], ["t", ` the open postings of ${l.label}: `], ["n", fmt(w.n)], ["t", " against "], ["n", fmt(l.n)], ["t", `, over ${w.roles} and ${l.roles} roles.`]];
    if (q.type === "employer") return [["t", `${q.role.label}: ${w.label.toLowerCase()} list `], ["n", fmt(w.n)], ["t", " open postings, "], ["n", r], ["t", ` the `], ["n", fmt(l.n)], ["t", ` at ${l.label.toLowerCase()}.`]];
    return [["t", `${w.label}: `], ["n", w.n], ["t", ` of ${w.of} roles have most postings asking for ${q.skill.name}. ${l.label}: `], ["n", l.n], ["t", ` of ${l.of}.`]];
  }
  const partsText = parts => parts.map(([, v]) => v).join("");
  const recapMeta = q => q.type === "role" ? "Role vs role" : q.type === "field" ? "Field vs field" : q.type === "employer" ? `${q.role.label} · employer type` : `${q.skill.name} · roles asking`;
  const recapCounts = q => q.type === "skill" ? `${q.w.n} · ${q.l.n} roles` : `${fmt(q.w.n)} · ${fmt(q.l.n)}`;
  const unitWord = q => q.type === "skill" ? "roles" : "open";

  // ---------- the result: score, rank, the biggest surprise (first rule that applies) ----------
  function result(questions, picks) {
    const rows = questions.map((q, i) => { const p = picks[i] || {}; const side = p.side || null; return { q, side, timedOut: !side, right: side === q.winner }; });
    const score = rows.filter(r => r.right).length;
    return { score, n: questions.length, rank: rankTitle(score), rows, surprise: surprise(rows) };
  }
  function surprise(rows) {
    const open = (kind, id, label) => ({ href: kind === "role" ? `#/role/${id}` : `#/field/${id}`, label: `Open ${label}` });
    const wrong = rows.filter(r => !r.timedOut && !r.right).sort((a, b) => b.q.ratio - a.q.ratio)[0];
    if (wrong) {
      const q = wrong.q, w = q.w, l = q.l;
      if (q.type === "employer") return { rule: 1, title: `${q.role.label}: ${w.label.toLowerCase()}, not ${l.label.toLowerCase()}`, parts: [["t", `${w.label} list `], ["n", fmt(w.n)], ["t", ` open ${q.role.label} postings; ${l.label.toLowerCase()} `], ["n", fmt(l.n)], ["t", `. You picked ${l.label.toLowerCase()}.`]], open: open("role", q.role.id, q.role.label) };
      if (q.type === "skill") return { rule: 1, title: `${q.skill.name}: ${w.label}, not ${l.label}`, parts: [["n", w.n], ["t", ` of ${w.of} ${w.label} roles have most postings asking for ${q.skill.name}; `], ["n", l.n], ["t", ` of ${l.of} in ${l.label}. You picked ${l.label}.`]], open: open("field", w.id, w.label) };
      return { rule: 1, title: `${w.label}, not ${l.label}`, parts: [["t", `${w.label} has `], ["n", fmt(w.n)], ["t", ` open postings; ${l.label} `], ["n", fmt(l.n)], ["t", `. You picked ${l.label}.`]], open: open(q.type, w.id, w.label) };
    }
    const conc = rows.filter(r => r.q.type === "role" && r.q.w.employers < r.q.l.employers).sort((a, b) => (b.q.l.employers / b.q.w.employers) - (a.q.l.employers / a.q.w.employers))[0];
    if (conc) { const { w, l } = conc.q; return { rule: 2, title: `${w.label}: more postings from fewer employers`, parts: [["t", `${w.label}: `], ["n", fmt(w.n)], ["t", " open postings from "], ["n", fmt(w.employers)], ["t", ` employers. ${l.label}: `], ["n", fmt(l.n)], ["t", " from "], ["n", fmt(l.employers)], ["t", "."]], open: open("role", w.id, w.label) }; }
    const seen = {};
    for (const r of rows) for (const c of [r.q.w, r.q.l]) { if (c.kind === "field") seen[c.id] = { id: c.id, label: c.label, n: c.n }; }
    const smallest = Object.values(seen).sort((a, b) => a.n - b.n)[0];
    if (smallest) return { rule: 3, title: `${smallest.label}: the smallest field you saw`, parts: [["t", `${smallest.label}: `], ["n", fmt(smallest.n)], ["t", " open, the smallest field you saw."]], open: open("field", smallest.id, smallest.label) };
    const any = rows[0].q;
    return { rule: 3, title: `${any.w.label}: the first pair`, parts: [["t", `${any.w.label}: `], ["n", fmt(any.w.n)], ["t", ` ${unitWord(any)}.`]], open: open(any.w.kind === "role" ? "role" : "field", any.w.kind === "employer" ? any.role.id : any.w.id, any.w.kind === "employer" ? any.role.label : any.w.label) };
  }

  // ---------- loading a round: the index, the generic skills, up to three role files for the employer-type question ----------
  async function prepare(A, rng, n) {
    const [ix, generic] = await Promise.all([A.index(), A.genericSkills()]);
    const ents = entities(ix), roleFiles = {};
    const small = ents.roles.filter(r => r.bytes && r.bytes < FILE_MAX), order = shuffle((small.length ? small : ents.roles).slice(), rng);
    const wait = ms => new Promise(res => setTimeout(() => res(null), ms));
    for (let k = 0; k < Math.min(FILE_TRIES, order.length); k++) {
      const r = order[k];
      const file = await Promise.race([A.fetchJson("data/" + r.file).catch(() => null), wait(FILE_WAIT)]);
      if (!file || !file.jobs) continue;
      roleFiles[r.id] = file.jobs;
      if (employerPairs(r, file.jobs, BANDS.easy, A).length) break;
    }
    return buildRound(ix, roleFiles, rng, { Atlas: A, generic, n });
  }
  // for another game: a short round (three questions by default) and the function that scores the picks
  async function miniRound({ n = 3, seed = null, Atlas: A = root.Atlas } = {}) {
    const rng = seed == null ? Math.random : seeded(seed);
    const round = await prepare(A, rng, n);
    return { ...round, prompt, gapLine, result: picks => result(round.questions, picks) };
  }

  // ---------- persistence: best plus the last five rounds, in this browser only ----------
  const store = {
    get() { try { const v = JSON.parse(localStorage.getItem(STORE_KEY)); return v && typeof v === "object" ? v : {}; } catch { return {}; } },
    set(v) { try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { } },
  };
  function saveRound(score, rank, untimed, dataDate) {
    const s = store.get(), at = today();
    const rounds = [{ score, rank, at, data: dataDate, untimed: !!untimed }, ...(Array.isArray(s.rounds) ? s.rounds : [])].slice(0, KEEP_ROUNDS);
    const next = { ...s, untimed: !!untimed, rounds };
    let status = "none";
    if (!untimed) { if (s.best == null || score > s.best) { next.best = score; next.bestAt = at; status = "new"; } else status = score === s.best ? "match" : "below"; }
    store.set(next);
    return { status, best: next.best, prev: s.best };
  }

  // ---------- the screens ----------
  if (!root.document) { if (typeof module === "object" && module.exports) module.exports = { buildRound, miniRound, result, rankTitle, surprise, entities, employerCounts, employerPairs, seeded, prompt, gapLine, BANDS }; return; }
  let live = null;   // the mounted game, so a second mount (hash change) can stop the first

  async function mount(el, ctx) {
    if (live) live.destroy();
    const A = ctx.Atlas, esc = ctx.esc;
    const reduced = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seedParam = (() => { const q = location.hash.split("?")[1]; if (!q) return null; const v = new URLSearchParams(q).get("seed"); return v == null || v === "" ? null : Number(v); })();
    const S = { phase: "start", round: null, prep: null, i: 0, picks: [], score: 0, timer: null, untimed: !!store.get().untimed, starting: false };
    const newRng = () => seedParam == null || Number.isNaN(seedParam) ? Math.random : seeded(seedParam);
    const prep = () => { S.prep = prepare(A, newRng(), N); S.prep.catch(() => { }); return S.prep; };

    // --- helpers on the DOM ---
    const $ = s => el.querySelector(s);
    const html = parts => parts.map(([k, v]) => k === "n" ? `<span class="num">${esc(v)}</span>` : esc(v)).join("");
    el.innerHTML = `<div class="page wd-page" id="wd-root"></div><div class="wd-sr" aria-live="polite" id="wd-live"></div>`;
    const pageEl = $("#wd-root"), liveEl = $("#wd-live");
    const render = inner => { pageEl.innerHTML = inner; root.scrollTo(0, 0); };
    const announce = text => { liveEl.textContent = ""; setTimeout(() => { if (!me.destroyed) liveEl.textContent = text; }, 30); };
    const stopTimer = () => { if (S.timer) { cancelAnimationFrame(S.timer.raf); clearTimeout(S.timer.step); S.timer = null; } };
    const dateOf = () => fmtDate(S.round ? S.round.meta.generated : "");
    const whenLabel = iso => iso === today() ? "today" : fmtDate(iso).replace(/ \d{4}$/, "");

    // --- start screen ---
    async function showStart() {
      stopTimer(); S.phase = "start"; S.starting = false;
      prep();
      let ix = null;
      try { ix = await A.index(); } catch (e) { return showError(e); }
      if (S.phase !== "start" || me.destroyed) return;
      const meta = ix.M.meta || {}, ents = entities(ix), saved = store.get(), rounds = Array.isArray(saved.rounds) ? saved.rounds : [];
      const stale = daysSince(meta.generated), date = fmtDate(meta.generated);
      const best = saved.best != null ? `<div class="wd-best"><span class="big">${esc(saved.best)}</span><span class="muted">of 10 &middot; your best</span></div><p class="small" style="color:var(--primary)">${esc(rankTitle(saved.best).title)}</p>` : `<p class="small muted">No rounds yet. Your best and your last five rounds show here.</p>`;
      const list = rounds.length ? `<div class="list wd-rounds">${rounds.map(r => `<div class="r"><span class="t">${esc(r.score)} of 10 &middot; ${esc(rankTitle(r.score).title.toLowerCase())}${r.untimed ? " &middot; no timer" : ""}</span><span class="n">${esc(whenLabel(r.at))}</span></div>`).join("")}</div>` : "";
      render(`<div class="wd-start">
<section>
  <p class="eyebrow">Market sense quick-fire</p>
  <h1>Where&rsquo;s the demand?</h1>
  <p class="lead">Two roles, one question: which has more open postings right now? Ten questions, eight seconds each. Tap a side, or press <kbd>&larr;</kbd> or <kbd>&rarr;</kbd>.</p>
  <ol class="wd-steps">
    <li><div>Pick the side with more open postings.<span>Most questions are role against role; some are fields, employer types, or a skill across two fields.</span></div></li>
    <li><div>The real counts show after every pick.<span>Blue numbers are the postings; your right picks turn green, misses amber.</span></div></li>
    <li><div>It gets closer as you go.<span>The first three pairs differ by two to three times; the last three by less than one and a half.</span></div></li>
  </ol>
  <div class="row"><button type="button" class="btn primary" id="wd-start">Start round <kbd>Enter</kbd></button><a class="btn quiet" href="#/explore">Explore the fields first</a></div>
  <label class="wd-switch"><input type="checkbox" id="wd-untimed"${S.untimed ? " checked" : ""}> No timer <span class="muted">Eight seconds per question when the timer is on. Off, you take your time; the rank title is the same.</span></label>
  <p class="facts" style="margin-top:22px">${esc(fmt(meta.n_open))} open US postings &middot; ${esc(ents.allRoles.length)} roles &middot; ${esc(ents.fields.length)} fields &middot; as of ${esc(date)}${stale > STALE_DAYS ? ` &middot; <span class="wd-stale">last refreshed ${esc(stale)} days ago</span>` : ""}</p>
</section>
<div class="wd-side"><aside class="wd-panel">
  <h3>Your rounds</h3>
  <p class="small muted">Kept in this browser only.</p>
  ${best}${list}
</aside><aside class="wd-panel"><h3>Four kinds of question</h3><div class="list wd-rounds">
<div class="r"><span class="t">Role against role</span><span class="n">most of the round</span></div>
<div class="r"><span class="t">Field against field</span><span class="n">two a round</span></div>
<div class="r"><span class="t">Large companies, startups or firms, for one role</span><span class="n">one</span></div>
<div class="r"><span class="t">Which field has more roles asking for a skill</span><span class="n">one</span></div></div></aside></div>
</div>`);
      $("#wd-start").onclick = startRound;
      $("#wd-untimed").onchange = e => { S.untimed = e.target.checked; store.set({ ...store.get(), untimed: S.untimed }); };
      $("#wd-start").focus();
    }
    function showError(e) {
      console.error(e);
      render(`<div class="narrow"><h1>Something did not load</h1><p class="lead">${esc(e && e.message || e)}. Reload the page; if it happens again, the data files may be missing.</p><div class="row" style="margin-top:16px"><a class="btn" href="#/">&larr; All games</a></div></div>`);
    }

    // --- a round ---
    async function startRound() {
      if (S.starting || (S.phase !== "start" && S.phase !== "results")) return;
      S.starting = true;
      const b = $("#wd-start") || $("#wd-again"); if (b) { b.disabled = true; b.textContent = "Starting…"; }
      let round;
      try { round = await (S.prep || prep()); } catch (e) { S.starting = false; return showError(e); }
      if (me.destroyed) return;
      S.round = round; S.i = 0; S.picks = []; S.score = 0; S.starting = false;
      if (round.fallbacks.length) console.info("wheres-the-demand: fallbacks", round.fallbacks);
      showQuestion();
    }
    const dots = () => `<div class="wd-dots" aria-label="Progress">${S.round.questions.map((q, k) => `<i class="${k < S.i ? (S.picks[k] && S.picks[k].right ? "ok" : "miss") : k === S.i ? "now" : ""}"></i>`).join("")}</div>`;
    const hud = () => `<div class="wd-hud"><span class="q">Question ${S.i + 1} of ${S.round.questions.length}</span>${dots()}<span class="score">Score <b>${S.score}</b></span></div>`;
    const cardName = c => c.kind === "role" ? `${c.label}, ${c.field}` : c.kind === "employer" ? `${c.label}, ${c.roleLabel}` : c.kind === "skillfield" ? `${c.label}, of ${c.of} roles` : `${c.label}, ${c.roles} roles`;

    function showQuestion() {
      S.phase = "question";
      const q = S.round.questions[S.i];
      const card = (c, side) => `<button type="button" class="wd-card ask${side === "right" ? " right-side" : ""}" data-side="${side}" aria-label="${esc(cardName(c))}"><span class="key" aria-hidden="true">${side === "left" ? "&larr;" : "&rarr;"}</span><span class="t">${esc(c.label)}</span><span class="f">${esc(c.sub)}</span></button>`;
      render(`${hud()}
<h1 class="wd-prompt">${esc(prompt(q))}</h1>
<p class="wd-sub">${esc(subLine(q, dateOf()))}</p>
<div class="wd-timer${S.untimed ? " off" : ""}" aria-hidden="true"><i style="width:100%"></i></div>
<div class="wd-stage"><div class="wd-cards">${card(q.left, "left")}${card(q.right, "right")}</div><span class="wd-or" aria-hidden="true">or</span></div>
<div class="wd-foot"><span>Press <kbd>&larr;</kbd> or <kbd>&rarr;</kbd>, or click a card.${S.untimed ? " No timer." : ""}</span><span class="mono">${esc(footNote(q))}</span></div>`);
      for (const b of el.querySelectorAll(".wd-card")) b.onclick = () => answer(b.dataset.side);
      const first = $(".wd-card"); if (first) first.focus();
      if (!S.untimed) startTimer();
    }
    function startTimer() {
      stopTimer();
      const bar = $(".wd-timer"), fill = bar && bar.firstElementChild, total = SECONDS * 1000;
      const T = S.timer = { left: total, last: performance.now(), paused: document.hidden, raf: 0, step: 0, shown: -1 };
      const paint = () => {
        const frac = Math.max(0, T.left / total);
        if (reduced) { const sec = Math.ceil(T.left / 1000); if (sec !== T.shown) { T.shown = sec; fill.style.width = (sec / SECONDS * 100) + "%"; } }
        else fill.style.width = (frac * 100) + "%";
        bar.classList.toggle("low", T.left <= LOW_AT * 1000);
      };
      const tick = now => {
        if (S.timer !== T) return;
        if (!T.paused) { T.left -= now - T.last; }
        T.last = now;
        if (bar && fill) paint();
        if (T.left <= 0) { answer(null); return; }
        T.raf = requestAnimationFrame(tick);
      };
      T.raf = requestAnimationFrame(tick);
    }
    function answer(side) {
      if (S.phase !== "question") return;   // the first pick locks the question
      stopTimer(); S.phase = "answer";
      const q = S.round.questions[S.i], right = side === q.winner;
      S.picks[S.i] = { side, right }; if (right) S.score++;
      const picked = c => side === c, winner = c => q.winner === c;
      const verdict = sideName => picked(sideName) ? (winner(sideName) ? '<span class="tag good">Your pick &middot; right</span>' : '<span class="tag bad">Your pick</span>') : winner(sideName) ? `<span class="tag amber">${esc(moreTag(q))}</span>` : "";
      const cls = sideName => (sideName === "right" ? " right-side" : "") + (picked(sideName) ? (winner(sideName) ? " mine-ok" : " mine-miss") : " dim");
      const card = (c, sideName) => `<div class="wd-card${cls(sideName)}"><span class="verdict">${verdict(sideName)}</span><span class="t">${esc(c.label)}</span><span class="f">${esc(c.sub)}</span>
<span class="n" data-n="${c.n}">${reduced ? esc(fmt(c.n)) : "0"}<small>${esc(c.unit)}</small></span><span class="bar"><i data-w="${Math.round(c.n / q.w.n * 100)}" style="width:${reduced ? Math.round(c.n / q.w.n * 100) : 0}%"></i></span>${c.meta ? `<span class="meta">${esc(c.meta)}</span>` : ""}</div>`;
      render(`${hud()}
<h1 class="wd-prompt">${esc(prompt(q))}</h1>
<p class="wd-sub">${esc(subLine(q, dateOf()))}</p>
<div class="wd-timer${S.untimed ? " off" : ""}" aria-hidden="true"><i style="width:0"></i></div>
<div class="wd-stage"><div class="wd-cards">${card(q.left, "left")}${card(q.right, "right")}</div></div>
<p class="wd-line">${side == null ? '<span class="subtle">Out of time. </span>' : ""}${html(gapLine(q))}</p>
<div class="wd-next"><button type="button" class="btn primary" id="wd-next">${S.i + 1 < S.round.questions.length ? "Next question &rarr;" : "See your result &rarr;"}</button><span class="small subtle">or press <kbd>Space</kbd></span></div>`);
      $("#wd-next").onclick = next;
      $("#wd-next").focus();
      if (!reduced) {
        requestAnimationFrame(() => { for (const i of el.querySelectorAll(".wd-card .bar i")) i.style.width = i.dataset.w + "%"; });
        const t0 = performance.now(), D = 600, nums = [...el.querySelectorAll(".wd-card .n")];
        const step = now => { const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 3); for (const n of nums) n.firstChild.textContent = fmt(Math.round(Number(n.dataset.n) * e)); if (p < 1 && S.phase === "answer") requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }
      const lead = side == null ? "Out of time." : right ? "Right." : "Not this one.";
      announce(`${lead} ${q.w.label} ${fmt(q.w.n)} ${unitWord(q)}, ${q.l.label} ${fmt(q.l.n)} ${unitWord(q)}.`);
    }
    function next() {
      if (S.phase !== "answer") return;
      S.i++;
      if (S.i < S.round.questions.length) showQuestion(); else showResults();
    }

    // --- results ---
    function showResults() {
      S.phase = "results";
      const R = result(S.round.questions, S.picks), saved = saveRound(R.score, R.rank.key, S.untimed, S.round.meta.generated);
      const bestLine = S.untimed ? `no timer${saved.best != null ? ` &middot; best: ${esc(saved.best)}` : ""}` : saved.status === "new" ? "new best" : saved.status === "match" ? "matches your best" : `best: ${esc(saved.best)}`;
      const mark = r => r.timedOut ? '<span class="mk miss">time</span>' : r.right ? '<span class="mk ok">&#10003;</span>' : '<span class="mk miss">&times;</span>';
      const row = r => `<div class="r">${mark(r)}<span class="t">${esc(r.q.w.label)} <span class="subtle">over</span> ${esc(r.q.l.label)}</span><span class="m">${esc(recapMeta(r.q))}</span><span class="n">${esc(recapCounts(r.q))}</span></div>`;
      const sp = R.surprise;
      render(`<div class="wd-res">
<section>
  <p class="eyebrow">Round over</p>
  <h1 class="wd-rank" tabindex="-1" id="wd-rank">${esc(R.rank.title)}</h1>
  <p class="wd-score"><b>${R.score}</b> of ${R.n} right &middot; ${bestLine}</p>
  <div class="wd-surprise">
    <p class="eyebrow">Biggest surprise</p>
    <p class="big">${esc(sp.title)}</p>
    <p class="small">${html(sp.parts)}</p>
  </div>
  <p class="wd-punch">Nobody reads ${esc(fmt(S.round.meta.nOpen))} postings by hand. That&rsquo;s the point.</p>
  <p class="small muted">Counts refresh weekly from live postings. These are as of ${esc(dateOf())}.</p>
  <div class="row" style="margin-top:18px"><a class="btn primary" href="#/explore">Explore the fields &rarr;</a><button type="button" class="btn" id="wd-again">Play again</button><a class="btn quiet" href="${esc(sp.open.href)}">${esc(sp.open.label)}</a></div>
</section>
<section>
  <h3 style="margin-top:6px">Your round</h3>
  <p class="small muted" style="margin-bottom:8px">The winner first; blue is open postings.</p>
  <div class="list wd-recap">${R.rows.map(row).join("")}</div>
</section>
</div>`);
      $("#wd-again").onclick = () => { prep(); startRound(); };
      $("#wd-rank").focus();
      announce(`${R.rank.title}. ${R.score} of ${R.n} right.`);
    }

    // --- keys, visibility, cleanup ---
    const onKey = e => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target && e.target.tagName || "").toLowerCase();
      if (S.phase === "question") {
        if (e.key === "ArrowLeft") { e.preventDefault(); answer("left"); }
        else if (e.key === "ArrowRight") { e.preventDefault(); answer("right"); }
        else if (e.key === "Escape") { e.preventDefault(); showStart(); }
      } else if (S.phase === "answer") {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); next(); }
        else if (e.key === "Escape") { e.preventDefault(); showStart(); }
      } else if (S.phase === "start") {
        if (e.key === "Enter" && tag !== "a" && tag !== "input") { e.preventDefault(); startRound(); }
      } else if (S.phase === "results") {
        if (e.key === "Escape") { e.preventDefault(); showStart(); }
      }
    };
    const onVisibility = () => { if (S.timer) { S.timer.paused = document.hidden; S.timer.last = performance.now(); } };
    const onHash = () => destroy();
    function destroy() {
      if (me.destroyed) return;
      stopTimer(); S.phase = "gone"; me.destroyed = true;
      document.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVisibility); root.removeEventListener("hashchange", onHash);
      if (live === me) live = null;
    }
    const me = { destroy, destroyed: false };
    document.addEventListener("keydown", onKey); document.addEventListener("visibilitychange", onVisibility); root.addEventListener("hashchange", onHash);
    live = me;
    await showStart();
  }

  root.Games = root.Games || {};
  root.Games[SLUG] = { mount };
  root.WheresTheDemand = { buildRound, miniRound, result, rankTitle, surprise, seeded, BANDS };
})(typeof window !== "undefined" ? window : globalThis);
