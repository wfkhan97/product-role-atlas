/* The Spring 2027 catalog: the reads from the public files, and the pure functions behind the class cards (cross-list
   collapsing, the grading line, the facets (subject, days, credits, eligibility, instructor), the relevance band, the
   gaps a class covers, the sorts, a minimal markdown reader). Pure parts take no DOM and load in node
   (tests/web/classes.test.mjs): require("web/catalog.js")({ load }) gives the functions. What never leaves the browser:
   the roles chosen, the campus. What never reaches the screen: a prior-term syllabus digest (it never enters the public
   file) and research_note_md (never read). Campuses are data (data/sp27_campus.json, `campuses`): a new campus is a new
   entry with its own catalog_file and tags_file, never a code change. Nothing here opens a network client: the files
   are static, read with deps.load (fetch in the browser, the disk in node). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;   // node: require("web/catalog.js")({ ...deps })
  else root.Catalog = factory({ config: () => root.CONFIG || {}, load: url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }) });
})(typeof self !== "undefined" ? self : this, function (deps) {
  "use strict";
  deps = deps || {};
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const BANDS = ["low", "medium", "high"];
  // the columns the picker reads from a class row of the public file (the shape the export writes; a syllabus digest
  // and research_note_md are never in it)
  const CLASS_COLS = "code,subject,catalog_nbr,title,career,description,outcomes,prereq,credits,grading_basis,location_scope,eligibility_category,enrollment_limited_to,also_in_ithaca,roster_url,roster_syllabus_read,sp27_instructor_matches_syllabus,grading_summary,last_scraped";
  const PROF_COLS = "slug,name,identity,title,affiliation,expertise,official_profile_url,personal_site_url,scholar_url,linkedin_url,profile_md";
  const load = url => { if (!deps.load) throw new Error("No loader on this page"); return Promise.resolve(deps.load(url)); };

  // ---------- campuses: data/sp27_campus.json, a list under `campuses` ----------
  let campusP = null;
  const campusFile = () => campusP ||= load("data/sp27_campus.json").catch(e => { campusP = null; throw e; });
  // the list; a file in the old flat shape (one campus at the top level) reads as a list of one
  // A campus whose entry names a switch (`enabled_by`, e.g. IENYC_ENABLED in web/config.js) is listed only while that
  // switch is on, so the chooser, the start card, the neutral card title and campusFor all follow one line of data.
  const switchOn = name => { try { return !!(deps.config && deps.config()[name]); } catch { return false; } };
  const campuses = async () => { const f = await campusFile(); const list = !f ? [] : Array.isArray(f.campuses) ? f.campuses : [f]; return list.filter(c => !c.enabled_by || switchOn(c.enabled_by)); };
  // The person's campus from what we know, pure: the campus of the door's flag (Door.campus: the listed campus whose
  // `flag` it is and whose roster is loaded, 2026-11-04), else the one stored (classes.campus), else the campus of the
  // picker program chosen, else the one campus whose programs include the v15 program group answered (you.where); null
  // when the group belongs to two campuses, which the picker then asks once.
  function campusFor(list, { flag = null, stored = null, programId = null, where = null } = {}) {
    list = list || [];
    if (flag) { const c = list.find(x => x.flag === flag && x.catalog); if (c) return c; }
    if (stored) { const c = list.find(x => x.id === stored); if (c) return c; }
    if (programId) { const c = list.find(x => (x.programs || []).some(p => p.id === programId)); if (c) return c; }
    if (where) { const cs = list.filter(x => (x.programs || []).some(p => p.group === where)); if (cs.length === 1) return cs[0]; }
    // one campus with a roster loaded: the question has one answer, so it is not asked (B3; the other campus's
    // entry says "roster not loaded yet" on its card until its courses land)
    const loaded = list.filter(x => x.catalog);
    if (loaded.length === 1) return loaded[0];
    return list.length === 1 ? list[0] : null;
  }
  // the one-line words for the start card when no campus is known: "Spring 2027 classes · Cornell Tech and IE New York"
  const neutralCardTitle = list => `${(list[0] || {}).term_label || "Classes"} classes · ${list.map(c => c.label).join(" and ")}`;

  // ---------- the reads: one load per file, kept until the page reloads ----------
  // The campus entry names its files: catalog_file ({ campus, term, generated, rosterDate, classes, crosslists, sections,
  // meetings, instructors, priors, professors }) and tags_file ({ tags: { code: { found: [ids], teaches: [ids] } } }, the
  // skills each class names outright, read once by pipeline/catalog_tags.mjs; `tags_tech` the same read with the tech
  // set's taxonomy). loadCatalog returns the catalog with `tags` and `tagsTech` as Sets per code; a tags file that fails
  // to load leaves both empty and the picker rates nothing.
  const catalogP = {};
  // the campus to read: the entry given (or its id), else the first campus with a catalog file
  async function campusOf(campus) {
    const list = await campuses();
    if (campus && typeof campus === "object") return campus;
    return (campus ? list.find(c => c.id === campus) : null) || list.find(c => c.catalog_file) || null;
  }
  const toSets = tags => Object.fromEntries(Object.entries(tags || {}).map(([code, t]) => [code, { found: new Set((t && t.found) || []), teaches: new Set((t && t.teaches) || []) }]));
  // one read per campus, keyed by the campus id once it is resolved, so a call with no campus shares the first's read
  const readCatalog = cm => catalogP[cm.id] ||= (async () => {
    const [f, t] = await Promise.all([load(cm.catalog_file), cm.tags_file ? load(cm.tags_file).catch(e => { console.error(e); return null; }) : null]);
    const pick = k => Array.isArray(f[k]) ? f[k] : [];
    return { campus: f.campus || cm.id, term: f.term || cm.term || null, generated: f.generated || null, rosterDate: f.rosterDate || null,
      classes: pick("classes"), crosslists: pick("crosslists"), sections: pick("sections"), meetings: pick("meetings"), instructors: pick("instructors"), priors: pick("priors"), professors: pick("professors"),
      tags: toSets(t && t.tags), tagsTech: toSets(t && t.tags_tech), tagsMeta: t ? { taxonomy_sha256: t.taxonomy_sha256 || null, taxonomy_product_sha256: t.taxonomy_product_sha256 || null, taxonomy_tech_sha256: t.taxonomy_tech_sha256 || null, rule: t.rule || null } : null };
  })().catch(e => { delete catalogP[cm.id]; throw e; });
  async function loadCatalog(campus) {
    const cm = await campusOf(campus);
    if (!cm || !cm.catalog_file) throw new Error(`No catalog file for ${cm ? cm.label : "this campus"}`);
    return readCatalog(cm);
  }
  // a professor from the same file: the row, and the classes its instructor rows name, by code with titles
  async function loadProfessor(slug, campus) {
    const data = await loadCatalog(campus);
    const professor = data.professors.find(p => p.slug === slug) || null;
    const title = Object.fromEntries(data.classes.map(c => [c.code, c.title || ""]));
    const seen = new Set();
    const classes = data.instructors.filter(i => i.professor_slug === slug && !seen.has(i.class_code) && seen.add(i.class_code)).map(i => ({ code: i.class_code, term: i.term || data.term, title: title[i.class_code] || "" })).sort((a, b) => a.code.localeCompare(b.code));
    return { professor, classes };
  }

  // ---------- cards: cross-listed classes collapse into one, keyed by the first code alphabetically ----------
  function collapse(data) {
    const { classes = [], crosslists = [], sections = [], meetings = [], instructors = [], priors = [] } = data || {};
    const byCode = Object.fromEntries(classes.map(c => [c.code, c]));
    const parent = {}; const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (const c of classes) parent[c.code] = c.code;
    const outside = {};   // codes a class is also listed under that are not in the dataset
    for (const x of crosslists) {
      if (!byCode[x.code]) continue;
      if (byCode[x.other_code]) { const a = find(x.code), b = find(x.other_code); if (a !== b) parent[a < b ? b : a] = a < b ? a : b; }
      else (outside[x.code] ||= new Set()).add(x.other_code);
    }
    const groups = {};
    for (const c of classes) (groups[find(c.code)] ||= []).push(c);
    const meetBy = {}; for (const m of meetings) (meetBy[m.class_nbr] ||= []).push(m);
    const secBy = {}; for (const s of sections) (secBy[s.class_code] ||= []).push(s);
    const insBy = {}; for (const i of instructors) (insBy[i.class_code] ||= []).push(i);
    const priBy = {}; for (const p of priors) (priBy[p.class_code] ||= []).push(p);
    const cards = Object.values(groups).map(list => {
      list.sort((a, b) => a.code.localeCompare(b.code));
      const codes = list.map(c => c.code), key = codes[0], primary = list[0];
      const other = [...new Set(list.flatMap(c => [...(outside[c.code] || [])]))].filter(o => !codes.includes(o)).sort();
      const seen = new Set(), secs = [];
      for (const c of list) for (const s of secBy[c.code] || []) { if (seen.has(s.class_nbr)) continue; seen.add(s.class_nbr); secs.push({ ...s, meetings: (meetBy[s.class_nbr] || []).slice() }); }
      secs.sort((a, b) => a.class_nbr - b.class_nbr);
      const ins = []; const seenIns = new Set();
      for (const c of list) for (const i of insBy[c.code] || []) { const k = i.instructor_name.toLowerCase(); if (seenIns.has(k)) continue; seenIns.add(k); ins.push({ name: i.instructor_name, slug: i.professor_slug || null }); }
      const pri = []; const seenPri = new Set();
      for (const c of list) for (const p of priBy[c.code] || []) { const k = p.term + "|" + (p.instructors || []).join(","); if (seenPri.has(k)) continue; seenPri.add(k); pri.push(p); }
      return { key, codes, otherCodes: other, classes: list, primary, title: primary.title, credits: primary.credits, sections: secs, instructors: ins, priors: pri, subjects: [...new Set(list.map(c => c.subject))] };
    });
    return cards.sort((a, b) => a.key.localeCompare(b.key));
  }
  // The tags a read goes by: the MBA reading alone, or, when a tech role is among the roles (withTech), the MBA and the
  // tech readings joined per code (the rows of a tech role ask for the tech set's own skills, which only its reading
  // names; a shared skill either reading names counts). Built once per catalog read.
  const techJoined = new WeakMap();
  function tagsFor(data, withTech) {
    if (!withTech || !data) return (data && data.tags) || {};
    if (techJoined.has(data)) return techJoined.get(data);
    const out = {};
    for (const src of [data.tags || {}, data.tagsTech || {}]) for (const [code, t] of Object.entries(src)) {
      const o = out[code] ||= { found: new Set(), teaches: new Set() };
      for (const id of t.found || []) o.found.add(id); for (const id of t.teaches || []) o.teaches.add(id);
    }
    techJoined.set(data, out); return out;
  }
  // the tags of a card: the union over its codes of what the tags file holds, as Sets ({ found, teaches }); a card
  // with no row in the file names nothing
  function cardTags(card, tags) {
    const found = new Set(), teaches = new Set();
    for (const code of card.codes) { const t = (tags || {})[code]; if (!t) continue; for (const id of t.found || []) found.add(id); for (const id of t.teaches || []) teaches.add(id); }
    return { found, teaches };
  }

  // ---------- what a card says ----------
  // The grading line (owner feedback 2026-11-01): the row's grading_summary with each component weight read as a
  // percentage ("Weekly push 15, final 25" -> "Weekly push 15%, final 25%"); "" when the row has none, and then the
  // panel shows no Grading heading at all. A weight is a whole number of at most 100 that ends a component: before a
  // comma, a semicolon, a closing bracket, a full stop, " each", " and", " (" or the end. Left as given: fractions and
  // splits (1/2, 40/60), ranges and sums (1-4, 13x4+11), decimals (a curve mean of 3.35), course numbers (7290),
  // numbers with a unit ("40 points") and any number already carrying %. Parts that do not sum to 100 keep their
  // numbers: the line reads the source, it never rescales it.
  const WEIGHT = /(?<![\w.%\/+-])(\d{1,3})(?![\d\/%-]|\.\d)(?=\s+each\b|\s*(?:[,;)]|\.(?:\s|$)|$|\s+\(| and\b))/g;
  const gradingText = summary => String(summary || "").trim().replace(WEIGHT, (m, n) => Number(n) <= 100 ? `${n}%` : n);
  const eligibilityLabel = (cat, campusData) => ((campusData && campusData.eligibility) || {})[cat == null ? "null" : cat] || (cat == null ? "eligibility not verified" : String(cat).replace(/_/g, " "));
  // A card is open to anyone when any of its codes lists no restriction (a cross-listed class one code leaves open can
  // be taken under that code); then the card and the panel show no eligibility label. A null category is unknown; the
  // card says nothing about it either (owner, 2026-11-01: no restriction listed means no label), and only the
  // eligibility filter still groups it as "not verified".
  const NO_RESTRICTION = "no_enrollment_restriction_listed";
  const restricted = card => !(card.classes || []).some(c => c.eligibility_category === NO_RESTRICTION);
  // the labels of a restricted card's known restrictions, one each ("" for an open or unverified card)
  const eligibilityLine = (card, campusData) => restricted(card) ? [...new Set(card.classes.filter(c => c.eligibility_category != null).map(c => eligibilityLabel(c.eligibility_category, campusData)))].join(" · ") : "";
  // the eligibility filter: classes a program may enroll in, plus the ones with no restriction listed; no program, everything
  function openTo(card, program) {
    if (!program) return true;
    const cats = new Set([...(program.categories || []), "no_enrollment_restriction_listed"]);
    return card.classes.some(c => cats.has(c.eligibility_category));
  }
  // The content search (v18, step 2) reads the code, the title, the description and the roster outcomes, in that order;
  // never a syllabus digest and never research_note_md (never read): the rule at the top stands.
  // matchField says which field matched first, so the card can label a match the person cannot see on it.
  const SEARCH_FIELDS = [["code", c => c.codes.join("\n")], ["title", c => c.title || ""], ["description", c => c.classes.map(x => x.description || "").join("\n")], ["outcomes", c => c.classes.map(x => x.outcomes || "").join("\n")]];
  function matchField(card, q) {
    const needle = String(q || "").trim().toLowerCase();
    if (!needle) return null;
    const hit = SEARCH_FIELDS.find(([, text]) => text(card).toLowerCase().includes(needle));
    return hit ? hit[0] : null;
  }
  // the instructor facet: the instructors of every card, one entry per person, alphabetical by surname (the last
  // word of the name, or the part before a comma), with the slug when the roster has a profile and the card count
  const surname = name => { const n = String(name || "").trim(); const comma = n.indexOf(","); return (comma > 0 ? n.slice(0, comma) : n.split(/\s+/).pop() || n).toLowerCase(); };
  function instructorList(cards) {
    const by = {};
    for (const c of cards || []) for (const i of c.instructors || []) { const k = String(i.name || "").trim().toLowerCase(); if (!k) continue; const e = by[k] ||= { name: String(i.name).trim(), slug: i.slug || null, n: 0 }; e.n++; if (!e.slug && i.slug) e.slug = i.slug; }
    return Object.values(by).sort((a, b) => surname(a.name).localeCompare(surname(b.name)) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }
  // the cards an instructor teaches: by slug when both sides have one, else by name, case-insensitively
  const teaches = (card, who) => (card.instructors || []).some(i => (who.slug && i.slug) ? i.slug === who.slug : String(i.name || "").trim().toLowerCase() === String(who.name || "").trim().toLowerCase());
  const instructorCards = (cards, who) => !who || !(who.slug || who.name) ? (cards || []).slice() : (cards || []).filter(c => teaches(c, who));
  // The collapsible facets (owner feedback 2026-11-01). Each takes a list of chosen values and an empty list keeps
  // everything; within a facet a card matches when it has any chosen value (or), and the facets compose (and).
  // Days: the roster's meeting patterns spell the days in one letter each (M T W R F S, U or Su for Sunday; R is
  // Thursday). A card meets on a day when any meeting of any of its sections has that letter; a meeting with no
  // pattern (time to be announced) meets on no day, so a day filter hides it.
  const DAYS = ["M", "T", "W", "R", "F", "S", "U"];
  const dayCodes = pattern => { const p = String(pattern || "").replace(/Su/g, "U"); return DAYS.filter(d => p.includes(d)); };
  const cardDays = card => new Set((card.sections || []).flatMap(s => (s.meetings || []).flatMap(m => dayCodes(m.pattern))));
  const dayList = cards => { const on = new Set((cards || []).flatMap(c => [...cardDays(c)])); return DAYS.filter(d => on.has(d)); };
  const meetsOn = (card, days) => !(days || []).length || (d => days.some(x => d.has(x)))(cardDays(card));
  // Credits: the distinct values of the codes' `credits`, read as numbers ("3.0" is "3"); a range ("1-5") is no option
  // of its own but matches every chosen value inside it; a class with no credits listed matches no credits filter.
  const creditNorm = v => { const s = String(v ?? "").trim(); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? String(n) : s; };
  const creditRange = s => { const m = /^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/.exec(s || ""); return m ? [Number(m[1]), Number(m[2])] : null; };
  const cardCredits = card => [...new Set((card.classes || []).map(c => creditNorm(c.credits)).filter(Boolean))];
  const creditList = cards => [...new Set((cards || []).flatMap(cardCredits))].filter(s => Number.isFinite(Number(s))).sort((a, b) => Number(a) - Number(b));
  const hasCredits = (card, chosen) => !(chosen || []).length || cardCredits(card).some(v => { if (chosen.includes(v)) return true; const r = creditRange(v); return !!r && chosen.some(x => Number(x) >= r[0] && Number(x) <= r[1]); });
  // Eligibility, who can take the class: one option per eligibility_category on the roster (null as "null", the
  // campus file's "not verified"), labelled from the campus file; the no-restriction category takes openLabel when
  // given. A card matches a chosen category when any of its codes carries it, so an open cross-listed class shows
  // under "no restriction" and under its restricted code's group. Open first, unverified last, the rest by label.
  const eligKey = cat => cat == null ? "null" : String(cat);
  function eligibilityList(cards, campusData, openLabel) {
    const n = {};
    for (const c of cards || []) for (const k of new Set((c.classes || []).map(x => eligKey(x.eligibility_category)))) n[k] = (n[k] || 0) + 1;
    const rank = k => k === NO_RESTRICTION ? 0 : k === "null" ? 2 : 1;
    return Object.keys(n).map(k => ({ value: k, label: k === NO_RESTRICTION && openLabel ? openLabel : eligibilityLabel(k === "null" ? null : k, campusData), n: n[k] }))
      .sort((a, b) => rank(a.value) - rank(b.value) || a.label.localeCompare(b.label));
  }
  const eligibleFor = (card, chosen) => !(chosen || []).length || (card.classes || []).some(c => chosen.includes(eligKey(c.eligibility_category)));
  function filterCards(cards, { program = null, showAll = false, subject = null, q = "", coversGap = false, covered = null, instructor = null, days = [], credits = [], eligibility = [] } = {}) {
    const needle = String(q || "").trim().toLowerCase();
    return cards.filter(c => (showAll || openTo(c, program))
      && (!coversGap || ((covered || {})[c.key] || []).length)
      && (!subject || c.subjects.includes(subject))
      && (!instructor || teaches(c, typeof instructor === "string" ? { name: instructor } : instructor))
      && meetsOn(c, days) && hasCredits(c, credits) && eligibleFor(c, eligibility)
      && (!needle || !!matchField(c, needle)));
  }
  // meeting lines: "MW 10:10–11:25 · Bloomberg 061" per section, DIS/LAB marked
  const timeOf = (a, b) => a && b ? `${a}–${b}` : a || b || "";
  function meetingLines(sections) {
    const out = [];
    for (const s of sections) {
      const comp = s.component && s.component !== "LEC" ? `${s.component} ` : "";
      const ms = (s.meetings || []).length ? s.meetings : [{}];
      for (const m of ms) {
        const bits = [m.pattern, timeOf(m.time_start, m.time_end), m.facility].filter(Boolean).join(" · ");
        out.push((comp + (bits || "time to be announced")).trim());
      }
    }
    return [...new Set(out)];
  }
  // the text the tagger read for a class (pipeline/catalog_tags.mjs reads the same fields; the browser reads tags, not text)
  const matcherText = cls => [cls.description, cls.outcomes, cls.roster_syllabus_md].filter(Boolean).join("\n");
  const cardText = card => card.classes.map(matcherText).join("\n");

  // ---------- relevance: the share of a role's core and common asks the text names, read as a band ----------
  // rows: [{ id, name, tier: "core" | "common" | other, w }]; found: a Set of skill ids the text names; generic: a Set
  // of the skills generic to the role set (Atlas.genericSkills), which count at half weight (tuning, 2026-10-29)
  function relevanceScore(found, rows, generic) {
    const gen = generic || new Set();
    const use = (rows || []).filter(r => r.tier === "core" || r.tier === "common").map(r => ({ ...r, w: gen.has(r.id) ? (r.w || 0) / 2 : (r.w || 0) }));
    const total = use.reduce((a, r) => a + r.w, 0);
    if (!total) return { score: 0, matched: [] };
    const matched = use.filter(r => found && found.has(r.id)).sort((a, b) => a.tier === b.tier ? b.w - a.w : a.tier === "core" ? -1 : 1);
    return { score: matched.reduce((a, r) => a + r.w, 0) / total, matched };
  }
  function relevanceBand(score, thresholds) {
    const t = thresholds || {}; const hi = Number(t.high), md = Number(t.medium);
    if (!(hi > 0) || !(md > 0)) return "low";
    return score >= hi ? "high" : score >= md ? "medium" : "low";
  }
  // the grid rows of a role as the scorer reads them: core (rows[0]) and common (rows[1]), weighted by share
  const rowsOf = grid => [...grid.rows[0].flat().map(x => ({ id: x.id, name: x.name, tier: "core", w: x.share })), ...grid.rows[1].flat().map(x => ({ id: x.id, name: x.name, tier: "common", w: x.share }))];

  // ---------- several roles at once: the "Match to roles" multi-select ----------
  // fits: [{ roleId, label, gaps: [{ id, name, tier, w, ... }] | null, rows: [{ id, name, tier, w }] }]. A skill is a
  // gap when any role leaves it open; its weight is the sum of those roles' shares divided by the number of roles, so
  // a gap three roles ask for outranks a gap one asks for; its tier is core when core for any. The rows combine the
  // same way (the union, share averaged over the roles, tier core when core anywhere). gaps is null when no fit
  // carries gaps (no resume on file). Pure.
  function combineRoles(fits) {
    fits = fits || [];
    const n = fits.length || 1;
    const byTier = (a, b) => a.tier === b.tier ? (b.w || 0) - (a.w || 0) : a.tier === "core" ? -1 : 1;
    const merge = (lists, extra) => {
      const by = {};
      for (const list of lists) for (const x of list || []) { const e = by[x.id] ||= { ...x, tier: "common", w: 0, roles: [] }; e.w += (x.w || 0) / n; if (x.tier === "core") e.tier = "core"; if (extra) extra(e, x); }
      return Object.values(by).sort(byTier);
    };
    const anyGaps = fits.some(f => Array.isArray(f.gaps));
    const gaps = anyGaps ? merge(fits.map(f => f.gaps && f.gaps.map(g => ({ ...g, roleId: f.roleId }))), (e, x) => { if (!e.roles.includes(x.roleId)) e.roles.push(x.roleId); delete e.roleId; }) : null;
    const rows = merge(fits.map(f => f.rows)).map(({ roles, ...r }) => r);
    return { gaps, rows, labels: fits.map(f => f.label).filter(Boolean) };
  }
  // the roles' names as one phrase: "Product Manager", "A and B", "A, B and C"
  const joinLabels = labels => { const l = (labels || []).filter(Boolean); return l.length <= 1 ? l[0] || "" : l.length === 2 ? `${l[0]} and ${l[1]}` : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`; };

  // ---------- the person's gaps (PLAN.md v16, step 3): which of them a course covers ----------
  // gaps: the fit's gap rows for the role, [{ id, name, tier, w }]; teaches: the Set of skill ids a course can show
  // (the tags file's `teaches`, by kind: a behaviour or a practice the text names is never a covered gap); generic: the
  // Set of generic skills, which are never a gap a class covers (tuning, 2026-10-29)
  function gapsCovered(teaches, gaps, generic) {
    if (!teaches || !gaps) return [];
    const gen = generic || new Set();
    return gaps.filter(g => !gen.has(g.id) && teaches.has(g.id)).sort((a, b) => a.tier === b.tier ? (b.w || 0) - (a.w || 0) : a.tier === "core" ? -1 : 1);
  }
  const coverLine = (covered, total) => !total ? "" : covered.length ? `Covers ${covered.length} of your ${total} gaps: ${covered.map(g => g.name).join(", ")}` : `Covers none of your ${total} gaps`;
  // the line over the list when no class covers any gap (noCover): said once, never per card
  const NO_COVER_LINE = "No class names your gaps. These are the closest.";
  // true when none of the cards covers a gap (info[key].covered empty everywhere)
  const noCover = (cards, info) => !(cards || []).some(c => (((info || {})[c.key] || {}).covered || []).length);
  // the field tie-break: a card whose subject is one the chosen roles' fields teach in (campus field_subjects)
  const inField = (card, subjects) => { const s = new Set(subjects || []); return (card.subjects || []).some(x => s.has(x)); };
  // the subjects of a list of field ids, from the campus entry's field_subjects map
  const fieldSubjects = (campus, groupIds) => [...new Set((groupIds || []).flatMap(g => ((campus && campus.field_subjects) || {})[g] || []))];
  // sorts: relevance (the band, then the score, then the field, then roster order); gaps (the sum of the shares of the
  // gaps covered, then the score, then the field, then roster order; with no card covering anything, by score, then the
  // field, then roster order); any other mode is the roster's order, subject then number read as a number (the screen
  // offers no Code sort: with nothing to compare against it shows the roster as it stands). info[key] = { band, score,
  // covered } as the screen holds them; subjects: the field tie-break's list (inField), optional
  const BAND_RANK = { high: 0, medium: 1, low: 2 };
  const rosterOrder = (a, b) => { const p = a.primary || {}, q = b.primary || {}; return String(p.subject || "").localeCompare(String(q.subject || "")) || String(p.catalog_nbr || "").localeCompare(String(q.catalog_nbr || ""), undefined, { numeric: true }) || a.key.localeCompare(b.key); };
  function sortCards(cards, mode, info, subjects) {
    const inf = k => (info && info[k]) || {};
    const byCode = rosterOrder;
    const field = subjects && subjects.length ? (a, b) => (inField(b, subjects) ? 1 : 0) - (inField(a, subjects) ? 1 : 0) : () => 0;
    const score = c => Number(inf(c.key).score) || 0;
    const w = c => (inf(c.key).covered || []).reduce((a, g) => a + (g.w || 0), 0);
    const tail = (a, b) => (score(b) - score(a)) || field(a, b) || byCode(a, b);
    if (mode === "relevance") return cards.slice().sort((a, b) => ((BAND_RANK[inf(a.key).band] ?? 3) - (BAND_RANK[inf(b.key).band] ?? 3)) || tail(a, b));
    if (mode === "gaps") return noCover(cards, info) ? cards.slice().sort(tail) : cards.slice().sort((a, b) => (w(b) - w(a)) || tail(a, b));
    return cards.slice().sort(byCode);
  }
  // the n courses that cover the most gap weight, for the rail; a course covering nothing is never one
  const topCovering = (cards, info, n, subjects) => sortCards(cards, "gaps", info, subjects).filter(c => ((info[c.key] || {}).covered || []).length).slice(0, n || 3);
  // The gaps one instructor's classes cover (v18, step 2), for the professor card: the union of the gaps covered by the
  // cards given (the picker's per-card reads, covered[key] = [gap rows]), each gap with the codes that cover it, core
  // first and then by share, the same order as a card's line. Pure: the screen picks the cards with instructorCards.
  function instructorGaps(cards, covered) {
    const by = {};
    for (const c of cards || []) for (const g of (covered || {})[c.key] || []) { const e = by[g.id] ||= { ...g, codes: [] }; if (!e.codes.includes(c.codes[0])) e.codes.push(c.codes[0]); }
    return Object.values(by).map(g => ({ ...g, codes: g.codes.slice().sort() })).sort((a, b) => a.tier === b.tier ? (b.w || 0) - (a.w || 0) : a.tier === "core" ? -1 : 1);
  }

  // ---------- the card's html (pure: the screen wires the handlers) ----------
  const RELS = { low: "thin", medium: "amber", high: "good" };
  const bandTag = (b, extra) => `<span class="tag ${RELS[b] || "thin"}${extra ? " " + extra : ""}">${esc(b)}</span>`;
  // o.matched (v18, step 2): the field the search matched (matchField); a match in the description or the outcomes,
  // which the card does not show, gets a small label so the person knows why the card is here.
  // (owner feedback 2026-11-01) The card carries no grading line, no prior-term line and no rating of the person's own;
  // the eligibility label shows only on a restricted card (restricted); the product's band column shows only when
  // there is something to compare against (o.roleId: one or more roles chosen), so with nothing chosen a card is the
  // roster's facts alone.
  function cardHtml(card, o) {
    o = o || {};
    const cm = o.campus || {};
    const codes = card.codes.concat(card.otherCodes || []).join(" / ");
    const who = card.instructors.length ? card.instructors.map(i => i.slug ? `<a href="#/professor/${encodeURIComponent(i.slug)}" data-prof>${esc(i.name)}</a>` : esc(i.name)).join(", ") : "Instructor to be announced";
    const elig = eligibilityLine(card, cm);
    const rel = o.rel;   // { band, matched: [{name, tier}] } | "pending" | null
    const product = !o.roleId ? "" : rel === "pending" || !rel ? `<span class="small muted">reading…</span>` : bandTag(rel.band) +
      (rel.matched.length ? `<details class="disc small cls-why" data-why="${esc(card.key)}"${o.whyOpen ? " open" : ""}><summary>Why</summary><div class="disc-body"><div class="tags">${rel.matched.map(m => `<span class="tag${m.tier === "core" ? " good" : ""}">${esc(m.name)}</span>`).join("")}</div><p class="small muted">Read from the roster text; a course can teach a skill without naming it.</p></div></details>` : `<p class="small muted">None of the role's main asks named.</p>`);
    // the person's gaps this course covers (o.gaps: { covered: [{ name, tier }], total }), read by kind
    const gaps = o.gaps && o.gaps.total ? `<p class="small cls-gaps${o.gaps.covered.length ? "" : " muted"}">${esc(coverLine(o.gaps.covered, o.gaps.total))}</p>` : "";
    return `<article class="cls-card${o.selected ? " on" : ""}" data-card="${esc(card.key)}">
      <div class="cls-main">
        <button type="button" class="cls-open linkish" data-open="${esc(card.key)}"><span class="cls-codes">${esc(codes)}</span> <span class="cls-title">${esc(card.title)}</span></button>${o.matched === "description" || o.matched === "outcomes" ? ` <span class="tag thin cls-match">in ${esc(o.matched)}</span>` : ""}
        <p class="facts">${esc(card.credits ? card.credits + " credits" : "credits not listed")}${meetingLines(card.sections).map(l => " · " + esc(l)).join("")}</p>
        <p class="small">${who}</p>
        ${elig ? `<p class="small"><span class="tag thin">${esc(elig)}</span></p>` : ""}
      </div>
      ${o.roleId ? `<div class="cls-rel"><p class="eyebrow">GradBuddy</p><p class="small muted">from the course description</p>${product}${gaps}</div>` : ""}
    </article>`;
  }

  // ---------- a minimal markdown reader: ## sections, bullets, links, paragraphs ----------
  function mdSections(md) {
    const out = {}; let cur = "_"; out[cur] = [];
    for (const line of String(md || "").split(/\r?\n/)) {
      const h = line.match(/^##\s+(.+?)\s*$/);
      if (h) { cur = h[1].trim(); out[cur] = out[cur] || []; continue; }
      if (/^#\s/.test(line)) continue;   // the title line
      out[cur].push(line);
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join("\n").trim()]));
  }
  const inlineMd = t => esc(t).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, a, u) => `<a href="${u}" target="_blank" rel="noopener">${a}</a>`).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  function mdHtml(md) {
    const blocks = [], lines = String(md || "").split(/\r?\n/); let para = [], list = [];
    const flush = () => { if (para.length) { blocks.push(`<p>${inlineMd(para.join(" "))}</p>`); para = []; } if (list.length) { blocks.push(`<ul class="plain">${list.map(l => `<li>${inlineMd(l)}</li>`).join("")}</ul>`); list = []; } };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { flush(); continue; }
      if (/^#{1,6}\s/.test(line)) { flush(); blocks.push(`<h3>${inlineMd(line.replace(/^#+\s*/, ""))}</h3>`); continue; }
      const li = line.match(/^[-*•]\s+(.*)$/);
      if (li) { if (para.length) flush(); list.push(li[1]); continue; }
      if (list.length) flush();
      para.push(line);
    }
    flush();
    return blocks.join("");
  }

  return { esc, BANDS, CLASS_COLS, PROF_COLS, loadCatalog, loadProfessor, campuses, campusFor, neutralCardTitle, collapse, tagsFor, cardTags, gradingText, eligibilityLabel, restricted, eligibilityLine, openTo, filterCards, matchField, instructorList, DAYS, dayCodes, cardDays, dayList, meetsOn, cardCredits, creditList, hasCredits, eligibilityList, eligibleFor, rosterOrder, instructorCards, instructorGaps, meetingLines, matcherText, cardText, relevanceScore, relevanceBand, rowsOf, combineRoles, joinLabels, gapsCovered, coverLine, NO_COVER_LINE, noCover, inField, fieldSubjects, sortCards, topCovering, cardHtml, mdSections, mdHtml };
});
