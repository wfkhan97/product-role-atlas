/* Find jobs: the pure logic behind one search over every open posting (PLAN.md v19, step B4; the spec is the
   owner's search_logic.md). No DOM, no data of its own: the rows are web/data/jobs_open.json (written by
   pipeline.jobs_open, column-oriented; rowsOf expands it once), and `ctx` hands in what the rows do not carry (a role's name and field, a skill's name), so
   the same code runs in node: require("web/jobs.js") gives the functions; in the browser they are window.Jobs.
   A person's fit is never a number on its own: fitLine says "N of the M skills". The words (the level words, the
   entry marks, the employer types, the fit line) are web/copy.js, Copy.jobs.
   The query is words, read the same way every time, with no model: every word must hit a row (AND), a whole word
   scoring more than the start of one, weighted by the field it hits. A short form in ALIASES ("mle", "pm", "swe")
   also hits by the words it stands for; when nothing has every word of a longer query, searchJobsRelaxed gives the
   rows that miss one; queryHints names the filters a query's words ask for ("new grad", "remote", "visa"). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.Copy || require("./copy.js"));   // node: require("web/jobs.js")
  else root.Jobs = factory(root.Copy);
})(typeof self !== "undefined" ? self : this, function (Copy) {
  "use strict";
  const W = Copy.jobs, fill = Copy.fill;
  const PAGE = 50;
  const PRODUCT_NS = "product.";   // web/atlas.js productKey: the product set's roles are product.<family>

  // ---------- the file: column-oriented (pipeline.jobs_open), expanded once into row objects ----------
  // A row of the file is [num, companyIdx, roleIdx, titleIdx, levelIdx, locationIdx, flags, skills, url, firstSeen, yoe,
  // posted, start]; rowsOf gives { id, set, role, title, company, group, sector, level, entry, intern, location, remote,
  // sponsorship, url, skills, first_seen, yoe, clearance, posted, grad, start }, the shape every function below takes. The skills
  // stay indexes into file.skill_ids and hold no credential: the years asked are yoe (a number or null), a clearance is
  // its own flag. posted is the board's own posting date and first_seen the day our scrape first saw the posting (both
  // YYYY-MM-DD or null); a file written before the twelfth column gives posted null. The set is a bit: mba (id m<num>),
  // tech (id t<num>, role tech.<family>), else product (id p<num>); the tech set's one entry mark, new graduates, is
  // its own bit and reads as entry "grad". grad is the title's own mark, in any set (the title says the job is for new
  // graduates, pipeline.jobs_open GRAD_TITLE), and start the year such a title names, or null; a file written before
  // the thirteenth column gives start null.
  const FLAGS = { mba: 1, intern: 2, remote: 4, entry_mba: 8, entry_pre_mba: 16, sponsor_yes: 32, sponsor_no: 64, clearance: 128, tech: 256, entry_grad: 512, grad_title: 1024 };
  const ID_PREFIX = { product: "p", mba: "m", tech: "t" };
  function rowsOf(file) {
    const F = Object.assign({}, FLAGS, file.flags || {}), C = file.companies || [], L = file.locations || [], R = file.roles || [], T = file.titles || [], levels = file.levels || {};
    return (file.rows || []).map(r => {
      const [num, ci, ri, ti, li, loci, flags, skills, url, firstSeen, yoe, posted, start] = r, c = C[ci] || {}, set = flags & F.tech ? "tech" : flags & F.mba ? "mba" : "product";
      return {
        id: ID_PREFIX[set] + num, set, role: R[ri], title: T[ti], company: c.name, group: c.group, sector: c.sector == null ? null : c.sector,
        level: (levels[set] || [])[li], entry: flags & F.entry_mba ? "mba" : flags & F.entry_pre_mba ? "pre_mba" : flags & F.entry_grad ? "grad" : null,
        intern: !!(flags & F.intern), location: L[loci] || "", remote: !!(flags & F.remote),
        sponsorship: flags & F.sponsor_yes ? "yes" : flags & F.sponsor_no ? "no" : null,
        url: (c.url_prefix || "") + (url || ""), skills: skills || [], first_seen: firstSeen == null ? null : firstSeen,
        yoe: yoe == null ? null : yoe, clearance: !!(flags & F.clearance), posted: posted == null ? null : posted,
        grad: !!(flags & F.grad_title), start: start == null ? null : start,
      };
    });
  }

  // ---------- the level words: four on the rail and the card, from each set's own level ids ----------
  // The three sets grade on the same eight ids (graph.json, graph_mba.json and graph_tech.json `levels`); the words
  // fold them to four. For the tech set a senior engineer is still mid, staff and principal are staff, and a VP and a
  // CTO sit with the directors.
  // A senior manager is still a manager; a group manager leads; a VP and a chief officer sit with the directors.
  const FOUR = { associate: "associate", mid: "mid", senior: "mid", staff: "staff", group: "staff", director: "director", vp: "director", cpo: "director" };
  // The ids are shared, the words are not: the tech set's cards say "Mid-level or senior" where a business card says
  // "Manager" (Copy.jobs.levelsTech), and the rail shows the tech words while a tech field is picked (levelLabels).
  const LEVEL_WORDS = {
    labels: ["associate", "mid", "staff", "director"].map(id => [id, W.levels[id]]),
    techLabels: ["associate", "mid", "staff", "director"].map(id => [id, W.levelsTech[id]]),
    product: Object.assign({}, FOUR),
    mba: Object.assign({}, FOUR),
    tech: Object.assign({}, FOUR),
  };
  const levelLabels = set => set === "tech" ? LEVEL_WORDS.techLabels : LEVEL_WORDS.labels;
  // The Entry facet: new graduates, MBA entry, internship, and the jobs that start after this year. "New graduates"
  // holds the MBA set's pre-MBA mark, the tech set's grad mark and any title that says it is for new graduates, so the
  // product set has the mark too. The last value's year is the file's own year plus one (a file written in 2026 says
  // "Starts 2027 or later"), so ENTRIES is a function of that year; without one, the year it is now.
  const ENTRY_IDS = ["grads", "mba", "intern", "later"];
  const ENTRIES = year => ENTRY_IDS.map(id => [id, fill(W.entries[id], { year: (year || new Date().getFullYear()) + 1 })]);
  // a link from before the values were renamed: bachelor (and pre_mba, which the facet once took) is New graduates
  const ENTRY_ALIAS = { bachelor: "grads", pre_mba: "grads" };
  const EMPLOYERS = ["fortune500", "startup", "mba_employer"].map(id => [id, W.employers[id]]);
  const SORTS = ["best", "fit", "newest", "company"];
  // the years a person has: a posting fits when it asks for that many or fewer, or names no number (owner's decision
  // on the skills audit, 2026-11-06: years of experience is a filter, not a skill)
  const YEARS = ["2", "5", "8"].map(id => [id, W.years[id]]);
  const yearsHit = (row, max) => row.yoe == null || row.yoe <= Number(max);
  const levelWord = row => (LEVEL_WORDS[row.set] || {})[row.level] || row.level || "";
  const levelLabel = row => (levelLabels(row.set).find(([id]) => id === levelWord(row)) || [, row.level])[1] || "";
  // the employer type from the company group: fortune50..fortune500 are one type
  const employerOf = group => group === "startup" ? "startup" : group === "mba_employer" ? "mba_employer" : /^fortune/.test(String(group || "")) ? "fortune500" : String(group || "");
  const fieldOfRole = (id, ctx) => ctx && ctx.fieldOf ? (ctx.fieldOf(id) || "") : String(id || "").startsWith(PRODUCT_NS) ? "product" : "";
  const roleName = (row, ctx) => ctx && ctx.roleName ? ctx.roleName(row) || "" : "";
  const skillNames = (row, ctx) => { const v = ctx && ctx.skillNames ? ctx.skillNames(row) : []; return Array.isArray(v) ? v.join(" ") : String(v || ""); };

  // ---------- the query ----------
  // Before the words are cut, an ampersand between letters joins them ("FP&A" reads as "fpa", "AT&T" as "att") and
  // "H-1B" reads as "h1b"; every other mark splits, so "new-grad" is "new grad". The rows' text is cut the same way,
  // so a title that says "FP&A" has the word a person types.
  const normalise = t => String(t || "").toLowerCase().replace(/(?<=[a-z])&(?=[a-z])/g, "").replace(/\bh-1b\b/g, "h1b");
  const words = t => normalise(t).split(/[^a-z0-9]+/).filter(Boolean);
  // one word against one text's words: 2 for a whole word, 1 for the start of a word, 0 for nothing
  function hit(tok, ws) { let best = 0; for (const w of ws) { if (w === tok) return 2; if (best === 0 && w.startsWith(tok)) best = 1; } return best; }
  // The short forms a student types for a job, and the words they stand for (2026-11-08: "MLE new grad" found the two
  // titles that spell "MLE" and none of the thousands that say "Machine Learning Engineer"). A table, not a model: it
  // is read the same way every time, and a wrong entry is one line to fix. A query word in the table hits a row when
  // the word itself is a whole word of the row (a title "PM, Growth" hits "pm") or when every word of its expansion
  // hits the row, as if the person had typed them; it scores the better of the two. The short form never counts as the
  // start of a longer word: "pm" would find "PMO" and "po" "PowerPoint" (23,142 postings by the start of a word
  // against 1 by the word), and the expansion finds the long forms. Each entry was checked against the open postings
  // (2026-11-08). "de" is left out: of the 166 postings with "de" as a word, 139 have it in the location (Delaware),
  // and the 30 titles with it are Spanish or French ("Líder de Producto") or Delaware, none a data engineer; a
  // location is searched, so "de" would mix Delaware postings into a data-engineer search. The other two-letter forms
  // are rare as words (da in 4 titles, po 1, ui 45, pe 11, all in their sense here) or common in their own sense (ai,
  // hr, sr, ux). "and" and "of" in an expansion are not asked for, so "Financial Planning & Analysis" hits "fpa".
  const ALIASES = {
    mle: "machine learning engineer", swe: "software engineer", sde: "software development engineer",
    pm: "product manager", apm: "associate product manager", pmm: "product marketing manager", tpm: "technical program manager",
    po: "product owner", ds: "data scientist", da: "data analyst", fde: "forward deployed engineer",
    ib: "investment banking", pe: "private equity", vc: "venture capital", bd: "business development",
    cs: "customer success", csm: "customer success manager", ux: "user experience", ui: "user interface",
    ml: "machine learning", ai: "artificial intelligence", eng: "engineer", mgr: "manager", sr: "senior", jr: "junior",
    dev: "developer", ops: "operations", bizops: "business operations", hr: "human resources", qa: "quality assurance",
    sec: "security", fpa: "financial planning and analysis", gm: "general manager", cos: "chief of staff",
    ae: "account executive", sdr: "sales development representative", ldp: "leadership development program",
  };
  const LINK_WORDS = new Set(["and", "of"]);
  const EXPAND = Object.fromEntries(Object.entries(ALIASES).map(([k, v]) => [k, words(v).filter(w => !LINK_WORDS.has(w))]));
  const expansionOf = tok => Object.prototype.hasOwnProperty.call(EXPAND, tok) ? EXPAND[tok] : null;
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
  // one query word against a row's fields: its best hit times that field's weight; a short form of the table scores the
  // better of its whole-word hit and its expansion's words' average
  function wordScore(tok, fields) {
    const ex = expansionOf(tok);
    let best = 0;
    for (const [ws, w] of fields) { const h = (ex ? (ws.includes(tok) ? 2 : 0) : hit(tok, ws)) * w; if (h > best) best = h; }
    if (!ex) return best;
    let sum = 0;
    for (const e of ex) { const s = wordScore(e, fields); if (!s) return best; sum += s; }
    return Math.max(best, sum / ex.length);
  }
  // the strength: every word must hit something (AND); the strength sums the words' scores. An empty query gives 1.
  // `slack` is how many words may miss (the all-but-one pass below gives 1).
  function strengthOf(row, q, ctx, slack) {
    const toks = Array.isArray(q) ? q : words(q);
    if (!toks.length) return 1;
    const fields = searched(row, ctx);
    let total = 0, missed = 0;
    for (const t of toks) {
      const s = wordScore(t, fields);
      if (!s && ++missed > (slack || 0)) return 0;
      total += s;
    }
    return total;
  }
  // the rows that match, each with its strength
  function searchJobs(jobs, q, ctx, slack) {
    const toks = Array.isArray(q) ? q : words(q), out = [];
    for (const row of jobs) { const s = strengthOf(row, toks, ctx, slack); if (s) out.push(Object.assign({}, row, { strength: s })); }
    return out;
  }
  // The all-but-one fallback: when a query of two or more words finds nothing, the rows that match every word but one,
  // and relaxed true so the screen can say so. One typo or one word no posting uses ("zanzibar") then leaves the rest
  // of the query working instead of an empty list. It runs only after an empty exact pass, so a query that finds
  // something costs what it did. Never two misses: past one, the list stops being about the query.
  function searchJobsRelaxed(jobs, q, ctx) {
    const toks = words(q), rows = searchJobs(jobs, toks, ctx);
    if (rows.length || toks.length < 2) return { rows, relaxed: false };
    const loose = searchJobs(jobs, toks, ctx, 1);
    return { rows: loose, relaxed: loose.length > 0 };
  }
  // The filters a query's words name: "new grad", "remote", "sponsorship" and the like are what the Entry, Work and
  // Visa sponsorship filters say better, since a posting's mark can come from its text and not its title. Each hint is
  // { key, val, words, at }: the filter, its value, the query words it was read from and their places in words(q), so
  // the screen can turn the filter on and take those words out (dropWords). A year after the file's (`year`, passed in)
  // names "Starts {year} or later". Two-word phrases are read before one word, so "new grad" is one hint.
  const HINT_PHRASES = [
    [["new", "grad"], "entry", "grads"], [["new", "grads"], "entry", "grads"], [["new", "graduate"], "entry", "grads"], [["new", "graduates"], "entry", "grads"],
    [["entry", "level"], "entry", "grads"], [["early", "career"], "entry", "grads"], [["early", "careers"], "entry", "grads"],
    [["grad"], "entry", "grads"], [["grads"], "entry", "grads"], [["graduate"], "entry", "grads"], [["graduates"], "entry", "grads"],
    [["intern"], "entry", "intern"], [["interns"], "entry", "intern"], [["internship"], "entry", "intern"], [["internships"], "entry", "intern"],
    [["remote"], "remote", true],
    [["sponsor"], "sponsor", "yes"], [["sponsors"], "sponsor", "yes"], [["sponsorship"], "sponsor", "yes"], [["visa"], "sponsor", "yes"], [["h1b"], "sponsor", "yes"],
  ].sort((a, b) => b[0].length - a[0].length);
  function queryHints(q, year) {
    const toks = words(q), out = [], byKey = new Map();
    const add = (key, val, at) => {
      const k = key + "=" + val;
      let h = byKey.get(k); if (!h) { byKey.set(k, h = { key, val, words: [], at: [] }); out.push(h); }
      for (const i of at) { h.words.push(toks[i]); h.at.push(i); }
    };
    for (let i = 0; i < toks.length;) {
      const p = HINT_PHRASES.find(([ws]) => ws.every((w, j) => toks[i + j] === w));
      if (p) { add(p[1], p[2], p[0].map((_, j) => i + j)); i += p[0].length; continue; }
      if (/^20\d\d$/.test(toks[i]) && Number(toks[i]) > (year || new Date().getFullYear())) add("entry", "later", [i]);
      i += 1;
    }
    return out;
  }
  // the query without the words at those places (a hint's `at`), the rest kept in order
  const dropWords = (q, at) => { const skip = new Set(at || []); return words(q).filter((_, i) => !skip.has(i)).join(" "); };

  // ---------- the filters ----------
  // f = { field, role, level, entry, years, sector, location, remote, sponsor, noclear, group, company }; a missing or
  // empty key is off. sector is the employer's industry (companies[].sector); noclear keeps postings that ask for no
  // security clearance. sponsor is one of two values, like level: "yes" keeps the postings that say they sponsor a
  // visa, "open" every posting that does not say it will not (most say nothing either way).
  const blankFilter = () => ({ field: "", role: "", level: "", entry: "", years: "", sector: "", location: "", remote: false, sponsor: "", noclear: false, group: "", company: "" });
  const SPONSOR = ["yes", "open"];
  const sponsorHit = (row, v) => v === "yes" ? row.sponsorship === "yes" : v === "open" ? row.sponsorship !== "no" : true;
  // the year "later" counts from is the file's (ctx.year, the year of its generated date): a start after it
  const yearOf = ctx => (ctx && ctx.year) || new Date().getFullYear();
  function entryHit(row, entry, ctx) {
    entry = ENTRY_ALIAS[entry] || entry;
    if (entry === "intern") return !!row.intern;
    if (entry === "mba") return row.entry === "mba";
    if (entry === "grads") return row.entry === "pre_mba" || row.entry === "grad" || !!row.grad;
    if (entry === "later") return row.start != null && row.start > yearOf(ctx);
    return false;
  }
  // every word must start a word in the posting's location; "remote" also matches the flag
  const locHit = (row, toks) => { const ws = words(row.location); return toks.every(t => (t === "remote" && row.remote) || hit(t, ws) > 0); };
  function matches(row, f, ctx, locToks) {
    if (f.field && fieldOfRole(row.role, ctx) !== f.field) return false;
    if (f.role && row.role !== f.role) return false;
    if (f.level && levelWord(row) !== f.level) return false;
    if (f.entry && !entryHit(row, f.entry, ctx)) return false;
    if (f.years && !yearsHit(row, f.years)) return false;
    if (f.sector && row.sector !== f.sector) return false;
    if (locToks.length && !locHit(row, locToks)) return false;
    if (f.remote && !row.remote) return false;
    if (f.sponsor && !sponsorHit(row, f.sponsor)) return false;
    if (f.noclear && row.clearance) return false;
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

  // ---------- the card's facts line: field · role · location ----------
  // The field is always there (usability pass 2026-11-06, B-32): ctx.fieldName(row) gives the field's name, and a row
  // whose role has none in the data gets the stand-in W.noField, so every card has the same three parts. `loc` is the
  // location as the card shows it (the screen cuts a long one); without it, the row's own.
  function cardFacts(row, ctx, loc) {
    const field = (ctx && ctx.fieldName ? ctx.fieldName(row) : "") || W.noField;
    return [field, roleName(row, ctx), loc == null ? row.location : loc].filter(Boolean);
  }

  // ---------- the order ----------
  const cmp = (a, b) => String(a || "").localeCompare(String(b || ""), "en", { sensitivity: "base" });
  const tie = (a, b) => cmp(a.company, b.company) || cmp(a.title, b.title);
  const byStrength = (a, b) => (b.strength || 0) - (a.strength || 0);
  const fitLookup = fits => !fits ? null : typeof fits === "function" ? fits : fits instanceof Map ? r => fits.get(r.id) : r => fits[r.id];
  // The fit order (usability pass 2026-11-06, B-03; owner's decision 3a): the share N/M, not the count N. By the count,
  // a long Staff posting (21 of its 52 skills) beat an entry posting (9 of its 12), so a new graduate saw Staff and
  // Principal jobs first. The share has a floor on M: a posting that asks for fewer than FIT_FLOOR skills counts as if
  // it asked for FIT_FLOOR, so the share is N / max(M, FIT_FLOOR). We chose this form, not "short postings after the
  // rest", because a short posting with a good match still ranks by how much of it you show. Without the floor, a thin
  // posting (2 of its 2 skills) tops every list. 15 sits near the 7th percentile of M over the open postings
  // (2026-11-06: p5 13, p10 17, median 27), so it touches only the thin ones; the auditor's case holds up to a floor of 22.
  // The card keeps "N of the M skills" (fitLine): the share orders the list and is never shown.
  const FIT_FLOOR = 15;
  const fitShare = fit => fit && fit.n ? fit.n / Math.max(fit.m || 0, FIT_FLOOR) : 0;
  // A row's date and which kind it is: the board's posting date when it has one, else the day our scrape first saw it
  // ("listed"), else null. first_seen clusters on scrape days, so the screen never calls it a posting date.
  const dateOf = row => row && row.posted ? { date: row.posted, kind: "posted" } : row && row.first_seen ? { date: row.first_seen, kind: "listed" } : null;
  // the day as the card shows it: "3 Nov", with the year when it is not this year's ("3 Nov 2025"). The month words are
  // Copy.jobs.months, not a locale's, so every browser prints the same.
  function dayLabel(iso, now) {
    const [y, m, d] = String(iso || "").split("-").map(Number);
    if (!y || !m || !d) return "";
    return `${d} ${W.months[m - 1]}${y !== (now || new Date()).getFullYear() ? " " + y : ""}`;
  }
  // "Posted 3 Nov", "Listed here 5 Nov", or "" for a row with neither date
  const dateLine = (row, now) => { const x = dateOf(row); return x ? fill(W[x.kind], { date: dayLabel(x.date, now) }) : ""; };
  // "best": strength, then the fit share when fits are given, then company A–Z, title A–Z;
  // "fit": the fit share first, then strength (without fits, the same as best); "newest": the date of dateOf, newest
  // first, the undated last, a tie in the best order; "company": company A–Z, title A–Z
  function sortJobs(rows, mode, fits) {
    const fit = fitLookup(fits);
    // compared as N_y * max(M_x, floor) against N_x * max(M_y, floor): whole numbers, so equal shares tie exactly
    const byFit = (a, b) => { if (!fit) return 0; const x = fit(a) || { n: 0, m: 0 }, y = fit(b) || { n: 0, m: 0 }; return (y.n || 0) * Math.max(x.m || 0, FIT_FLOOR) - (x.n || 0) * Math.max(y.m || 0, FIT_FLOOR); };
    const best = (a, b) => byStrength(a, b) || byFit(a, b) || tie(a, b);
    // YYYY-MM-DD strings order as dates; "" (no date) sorts after every date
    const day = r => (dateOf(r) || { date: "" }).date;
    const out = rows.slice();
    if (mode === "company") out.sort(tie);
    else if (mode === "newest") out.sort((a, b) => { const x = day(a), y = day(b); return x === y ? best(a, b) : !x ? 1 : !y ? -1 : x < y ? 1 : -1; });
    else if (mode === "fit") out.sort((a, b) => byFit(a, b) || byStrength(a, b) || tie(a, b));
    else out.sort(best);
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
  const KEYS = ["q", "field", "role", "level", "entry", "years", "sector", "loc", "remote", "sponsor", "noclear", "group", "company", "sort", "page", "open"];
  const BOOL = new Set(["remote", "noclear"]);
  const blankState = () => ({ q: "", field: "", role: "", level: "", entry: "", years: "", sector: "", loc: "", remote: false, sponsor: "", noclear: false, group: "", company: "", sort: "best", page: 1, open: "" });
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
      // sponsor was a switch until it had two values: an old link's sponsor=1 is "says it sponsors"
      else if (k === "sponsor") s.sponsor = v === "1" || v === "true" ? "yes" : SPONSOR.includes(v) ? v : "";
      else if (k === "entry") s.entry = ENTRY_ALIAS[v] || v;
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
  const filterOf = s => ({ field: s.field || "", role: s.role || "", level: s.level || "", entry: s.entry || "", years: s.years || "", sector: s.sector || "", location: s.loc || "", remote: !!s.remote, sponsor: SPONSOR.includes(s.sponsor) ? s.sponsor : "", noclear: !!s.noclear, group: s.group || "", company: s.company || "" });

  return { PAGE, PRODUCT_NS, FIT_FLOOR, fitShare, FLAGS, rowsOf, LEVEL_WORDS, ENTRIES, ENTRY_IDS, SPONSOR, EMPLOYERS, YEARS, SORTS, KEYS, yearsHit, levelWord, levelLabel, levelLabels, employerOf, fieldOfRole, words, ALIASES, strengthOf, searchJobs, searchJobsRelaxed, queryHints, dropWords, blankFilter, filterJobs, facetCounts, isFiltered, fitOf, fitLine, cardFacts, dateOf, dayLabel, dateLine, sortJobs, dedupe, pageOf, blankState, parseState, stateQuery, filterOf };
});
