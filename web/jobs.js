/* Find jobs: the pure logic behind one search over every open posting (PLAN.md v19, step B4; the spec is the
   owner's search_logic.md). No DOM, no data of its own: the rows are web/data/jobs_open.json (written by
   pipeline.jobs_open, column-oriented; rowsOf expands it once), and `ctx` hands in what the rows do not carry (a role's name and field, a skill's name), so
   the same code runs in node: require("web/jobs.js") gives the functions; in the browser they are window.Jobs.
   A person's fit is never a number on its own: fitLine says "N of the M skills". The words (the level words, the
   entry marks, the employer types, the fit line) are web/copy.js, Copy.jobs. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.Copy || require("./copy.js"));   // node: require("web/jobs.js")
  else root.Jobs = factory(root.Copy);
})(typeof self !== "undefined" ? self : this, function (Copy) {
  "use strict";
  const W = Copy.jobs, fill = Copy.fill;
  const PAGE = 50;
  const PRODUCT_NS = "product.";   // web/atlas.js productKey: the product set's roles are product.<family>

  // ---------- the file: column-oriented (pipeline.jobs_open), expanded once into row objects ----------
  // A row of the file is [num, companyIdx, roleIdx, titleIdx, levelIdx, locationIdx, flags, skills, url, firstSeen];
  // rowsOf gives { id, set, role, title, company, group, sector, level, entry, intern, location, remote, sponsorship,
  // url, skills, first_seen }, the shape every function below takes. The skills stay indexes into file.skill_ids.
  const FLAGS = { mba: 1, intern: 2, remote: 4, entry_mba: 8, entry_pre_mba: 16, sponsor_yes: 32, sponsor_no: 64 };
  function rowsOf(file) {
    const F = Object.assign({}, FLAGS, file.flags || {}), C = file.companies || [], L = file.locations || [], R = file.roles || [], T = file.titles || [], levels = file.levels || {};
    return (file.rows || []).map(r => {
      const [num, ci, ri, ti, li, loci, flags, skills, url, firstSeen] = r, c = C[ci] || {}, set = flags & F.mba ? "mba" : "product";
      return {
        id: (set === "mba" ? "m" : "p") + num, set, role: R[ri], title: T[ti], company: c.name, group: c.group, sector: c.sector == null ? null : c.sector,
        level: (levels[set] || [])[li], entry: flags & F.entry_mba ? "mba" : flags & F.entry_pre_mba ? "pre_mba" : null,
        intern: !!(flags & F.intern), location: L[loci] || "", remote: !!(flags & F.remote),
        sponsorship: flags & F.sponsor_yes ? "yes" : flags & F.sponsor_no ? "no" : null,
        url: (c.url_prefix || "") + (url || ""), skills: skills || [], first_seen: firstSeen == null ? null : firstSeen,
      };
    });
  }

  // ---------- the level words: four on the rail and the card, from each set's own level ids ----------
  // Both sets grade on the same eight ids (graph.json and graph_mba.json `levels`); the words fold them to four.
  // A senior manager is still a manager; a group manager leads; a VP and a chief officer sit with the directors.
  const FOUR = { associate: "associate", mid: "mid", senior: "mid", staff: "staff", group: "staff", director: "director", vp: "director", cpo: "director" };
  const LEVEL_WORDS = {
    labels: ["associate", "mid", "staff", "director"].map(id => [id, W.levels[id]]),
    product: Object.assign({}, FOUR),
    mba: Object.assign({}, FOUR),
  };
  const ENTRIES = ["mba", "bachelor", "intern"].map(id => [id, W.entries[id]]);
  const EMPLOYERS = ["fortune500", "startup", "mba_employer"].map(id => [id, W.employers[id]]);
  const SORTS = ["best", "fit", "company"];
  const levelWord = row => (LEVEL_WORDS[row.set] || {})[row.level] || row.level || "";
  const levelLabel = row => (LEVEL_WORDS.labels.find(([id]) => id === levelWord(row)) || [, row.level])[1] || "";
  // the employer type from the company group: fortune50..fortune500 are one type
  const employerOf = group => group === "startup" ? "startup" : group === "mba_employer" ? "mba_employer" : /^fortune/.test(String(group || "")) ? "fortune500" : String(group || "");
  const fieldOfRole = (id, ctx) => ctx && ctx.fieldOf ? (ctx.fieldOf(id) || "") : String(id || "").startsWith(PRODUCT_NS) ? "product" : "";
  const roleName = (row, ctx) => ctx && ctx.roleName ? ctx.roleName(row) || "" : "";
  const skillNames = (row, ctx) => { const v = ctx && ctx.skillNames ? ctx.skillNames(row) : []; return Array.isArray(v) ? v.join(" ") : String(v || ""); };

  // ---------- the query ----------
  const words = t => String(t || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  // one word against one text's words: 2 for a whole word, 1 for the start of a word, 0 for nothing
  function hit(tok, ws) { let best = 0; for (const w of ws) { if (w === tok) return 2; if (best === 0 && w.startsWith(tok)) best = 1; } return best; }
  // the searched fields and their weights: title 3, company 2, role name 2, skill names 1, location 1. The words of
  // a row are cut once per ctx (the names a ctx gives can change when its data loads) and kept beside the row.
  const tokenize = (row, ctx) => [[words(row.title), 3], [words(row.company), 2], [words(roleName(row, ctx)), 2], [words(skillNames(row, ctx)), 1], [words(row.location), 1]];
  const NO_CTX = {}, CACHE = new WeakMap();
  function searched(row, ctx) {
    const key = ctx && typeof ctx === "object" ? ctx : NO_CTX;
    let rows = CACHE.get(key); if (!rows) CACHE.set(key, rows = new WeakMap());
    let f = rows.get(row); if (!f) rows.set(row, f = tokenize(row, ctx));
    return f;
  }
  // the strength: every word must hit something (AND); a word scores its best hit times that field's weight; the
  // strength sums the words. An empty query gives 1.
  function strengthOf(row, q, ctx) {
    const toks = Array.isArray(q) ? q : words(q);
    if (!toks.length) return 1;
    const fields = searched(row, ctx);
    let total = 0;
    for (const t of toks) {
      let best = 0;
      for (const [ws, w] of fields) { const h = hit(t, ws) * w; if (h > best) best = h; }
      if (!best) return 0;
      total += best;
    }
    return total;
  }
  // the rows that match, each with its strength
  function searchJobs(jobs, q, ctx) {
    const toks = words(q), out = [];
    for (const row of jobs) { const s = strengthOf(row, toks, ctx); if (s) out.push(Object.assign({}, row, { strength: s })); }
    return out;
  }

  // ---------- the filters ----------
  // f = { field, role, level, entry, location, remote, sponsor, group, company }; a missing or empty key is off
  const blankFilter = () => ({ field: "", role: "", level: "", entry: "", location: "", remote: false, sponsor: false, group: "", company: "" });
  const entryHit = (row, entry) => entry === "intern" ? !!row.intern : entry === "mba" ? row.entry === "mba" : entry === "bachelor" || entry === "pre_mba" ? row.entry === "pre_mba" : false;
  // every word must start a word in the posting's location; "remote" also matches the flag
  const locHit = (row, toks) => { const ws = words(row.location); return toks.every(t => (t === "remote" && row.remote) || hit(t, ws) > 0); };
  function matches(row, f, ctx, locToks) {
    if (f.field && fieldOfRole(row.role, ctx) !== f.field) return false;
    if (f.role && row.role !== f.role) return false;
    if (f.level && levelWord(row) !== f.level) return false;
    if (f.entry && !entryHit(row, f.entry)) return false;
    if (locToks.length && !locHit(row, locToks)) return false;
    if (f.remote && !row.remote) return false;
    if (f.sponsor && row.sponsorship !== "yes") return false;
    if (f.group && employerOf(row.group) !== f.group && row.group !== f.group) return false;
    if (f.company && row.company !== f.company) return false;
    return true;
  }
  function filterJobs(jobs, f, ctx) {
    f = Object.assign(blankFilter(), f || {});
    const locToks = words(f.location);
    return jobs.filter(row => matches(row, f, ctx, locToks));
  }
  // how many rows each value of a facet would leave on, with the other filters as they are (the facet's own current
  // value plays no part); a field value drops a role outside that field, as the rail does
  function facetCounts(jobs, f, facet, values, ctx) {
    const out = {};
    for (const v of values) {
      const g = Object.assign(blankFilter(), f || {}, { [facet]: v });
      if (facet === "field" && g.role && v && fieldOfRole(g.role, ctx) !== v) g.role = "";
      out[v] = filterJobs(jobs, g, ctx).length;
    }
    return out;
  }
  const isFiltered = f => { f = Object.assign(blankFilter(), f || {}); return Object.keys(f).some(k => f[k] === true || (typeof f[k] === "string" && f[k].trim() !== "")); };

  // ---------- the fit ----------
  // { n, m }: the posting's skills the résumé shows, of the skills it asks for. Never a percentage. The résumé
  // gives skill ids; with skillIds (the file's list) the row's indexes become ids first, else they compare as they are.
  function fitOf(row, haveSkillIds, skillIds) {
    const have = haveSkillIds instanceof Set ? haveSkillIds : new Set(haveSkillIds || []);
    const ids = skillIds ? (row.skills || []).map(i => skillIds[i]) : (row.skills || []);
    let n = 0; for (const id of ids) if (have.has(id)) n += 1;
    return { n, m: ids.length };
  }
  const fitLine = fit => fill(W.fitLine, { n: fit.n, m: fit.m });

  // ---------- the order ----------
  const cmp = (a, b) => String(a || "").localeCompare(String(b || ""), "en", { sensitivity: "base" });
  const tie = (a, b) => cmp(a.company, b.company) || cmp(a.title, b.title);
  const byStrength = (a, b) => (b.strength || 0) - (a.strength || 0);
  const fitLookup = fits => !fits ? null : typeof fits === "function" ? fits : fits instanceof Map ? r => fits.get(r.id) : r => fits[r.id];
  // "best": strength, then fit (N high, then M low) when fits are given, then company A–Z, title A–Z;
  // "fit": fit first, then strength (without fits, the same as best); "company": company A–Z, title A–Z
  function sortJobs(rows, mode, fits) {
    const fit = fitLookup(fits);
    const byFit = (a, b) => { if (!fit) return 0; const x = fit(a) || { n: 0, m: 0 }, y = fit(b) || { n: 0, m: 0 }; return (y.n - x.n) || (x.m - y.m); };
    const out = rows.slice();
    if (mode === "company") out.sort(tie);
    else if (mode === "fit") out.sort((a, b) => byFit(a, b) || byStrength(a, b) || tie(a, b));
    else out.sort((a, b) => byStrength(a, b) || byFit(a, b) || tie(a, b));
    return out;
  }

  // ---------- the dedupe: one title at one company in one location is one posting ----------
  const dupeKey = r => [r.title, r.company, r.location].map(x => String(x || "").toLowerCase().trim()).join("|");
  function dedupe(rows) {
    const seen = new Map(), out = [], dupes = {};
    for (const r of rows) {
      const k = dupeKey(r);
      if (seen.has(k)) { const id = seen.get(k); dupes[id] = (dupes[id] || 0) + 1; continue; }
      seen.set(k, r.id); out.push(r);
    }
    return { rows: out, dupes };
  }

  // ---------- the page ----------
  function pageOf(rows, page, size) {
    size = size || PAGE;
    const total = rows.length, pages = Math.max(1, Math.ceil(total / size));
    page = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pages);
    const slice = rows.slice((page - 1) * size, page * size);
    const from = total ? (page - 1) * size + 1 : 0, to = total ? from + slice.length - 1 : 0;
    return { rows: slice, from, to, total, pages, page };
  }

  // ---------- the hash: every filter, the query, the sort, the page and the open posting ----------
  const KEYS = ["q", "field", "role", "level", "entry", "loc", "remote", "sponsor", "group", "company", "sort", "page", "open"];
  const BOOL = new Set(["remote", "sponsor"]);
  const blankState = () => ({ q: "", field: "", role: "", level: "", entry: "", loc: "", remote: false, sponsor: false, group: "", company: "", sort: "best", page: 1, open: "" });
  // reads "q=product&level=mid", "?q=…", "#/jobs?q=…" or a full hash; what is absent takes its default
  function parseState(query) {
    const s = blankState();
    let str = String(query || "");
    const i = str.indexOf("?");
    if (i >= 0) str = str.slice(i + 1); else if (str.startsWith("#")) str = str.slice(1);
    const h = new URLSearchParams(str);
    for (const k of KEYS) {
      if (!h.has(k)) continue;
      const v = h.get(k);
      if (BOOL.has(k)) s[k] = v === "1" || v === "true";
      else if (k === "page") s.page = Math.max(1, Math.floor(Number(v)) || 1);
      else if (k === "sort") s.sort = SORTS.includes(v) ? v : "best";
      else s[k] = v;
    }
    return s;
  }
  // the query string of a state: empty values, false, "best" and page 1 stay out
  function stateQuery(state) {
    const s = Object.assign(blankState(), state || {}), h = new URLSearchParams();
    for (const k of KEYS) {
      const v = s[k];
      if (v == null || v === "" || v === false) continue;
      if (k === "sort" && v === "best") continue;
      if (k === "page" && Number(v) === 1) continue;
      h.set(k, v === true ? "1" : String(v));
    }
    return h.toString();
  }
  // the filter object of a state (the hash says loc; the filter says location)
  const filterOf = s => ({ field: s.field || "", role: s.role || "", level: s.level || "", entry: s.entry || "", location: s.loc || "", remote: !!s.remote, sponsor: !!s.sponsor, group: s.group || "", company: s.company || "" });

  return { PAGE, PRODUCT_NS, FLAGS, rowsOf, LEVEL_WORDS, ENTRIES, EMPLOYERS, SORTS, KEYS, levelWord, levelLabel, employerOf, fieldOfRole, words, strengthOf, searchJobs, blankFilter, filterJobs, facetCounts, isFiltered, fitOf, fitLine, sortJobs, dedupe, pageOf, blankState, parseState, stateQuery, filterOf };
});
