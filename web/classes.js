/* The Spring 2027 screens: #/classes (the class picker), #/professor/<slug> (a professor card) and #/signin (one line:
   sign-in is off, then home). app.js dispatches here with its shell helpers; the data and the pure functions are in
   catalog.js; every campus-specific string is in data/sp27_campus.json, one entry per campus. The roster is a public
   file each campus entry names (catalog_file) and the skills each class names come from its tags_file, so nothing
   here opens a client or asks for a session: the roster reads for everyone. Two localStorage keys: classes.campus and
   classes.roles (the roles the cards are matched to, a list); the own-rating column and its classes.own key are gone
   (owner feedback 2026-11-01), and a key left from before is dropped on load. The person's campus is inferred from
   the v15 program group they answered when it belongs to one campus, else asked once on the classes screen. */
(function () {
  "use strict";
  if (typeof document === "undefined") return;
  const $ = s => document.querySelector(s);
  const CFG = () => window.CONFIG || {};
  const esc = Catalog.esc;
  const CL = Copy.classes, fill = Copy.fill;   // the screens' strings: web/copy.js
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  // the roles on file: classes.roles, a list; a classes.role string from before the multi-select moves into it once
  const storedRoles = () => { let r = store.get("classes.roles"); if (!Array.isArray(r)) { const one = store.get("classes.role"); r = typeof one === "string" && one ? [one] : []; store.set("classes.roles", r); store.set("classes.role", null); } return r.filter(x => typeof x === "string"); };
  store.set("classes.own", null);   // the own ratings of a browser from before 2026-11-01: nothing reads them now
  // the screen's state: the facets hold lists of chosen values (days, credits, eligibility categories) and `open` the
  // facets the person has unfolded (all folded at first); sort is "relevance" or "gaps", and only counts with a role chosen
  const S = { flag: null, campus: store.get("classes.campus"), roles: storedRoles(), subject: null, q: "", selected: null, why: new Set(), token: 0, coversGap: false, sort: "relevance", instructor: null, days: [], credits: [], elig: [], open: new Set() };
  // the searchable drop-downs (web/pick.js) of the last draw, across calls of classes(); each holds a document
  // listener, so every draw drops the last draw's first
  let picks = [];
  const scores = {};   // the sorted role ids joined -> { cardKey -> { band, score, matched } }, in memory for the page's life
  const rowsP = {};    // roleId -> Promise of the role's core and common rows
  let genericP = null; // the skills generic to the role set (Atlas.genericSkills), read once per page
  const genericSet = () => genericP ||= Atlas.genericSkills().catch(e => { genericP = null; throw e; });
  // what a card names, from the tags file: the union over its codes, { found: Set, teaches: Set }; no reading in the
  // browser. With a tech role chosen, the tech reading joins the MBA one (Catalog.tagsFor).
  const readCard = (card, data, withTech) => Catalog.cardTags(card, Catalog.tagsFor(data, withTech));
  const readAll = (cards, data, withTech) => Object.fromEntries(cards.map(c => [c.key, readCard(c, data, withTech)]));
  // which of the person's gaps each card covers: { cardKey: [gap rows] }, by kind (a named behaviour is not covered), the generic skills left out
  const coverage = (cards, readsByKey, gaps, generic) => Object.fromEntries(cards.map(c => [c.key, Catalog.gapsCovered((readsByKey[c.key] || {}).teaches, gaps, generic)]));
  let cardsCache = null, dataCache = null;
  const cardsOf = data => { if (dataCache !== data) { dataCache = data; cardsCache = Catalog.collapse(data); } return cardsCache; };
  const safe = (p, fallback) => Promise.resolve(p).catch(e => { console.error(e); return fallback; });
  // the campuses and the person's: stored, else the v15 program group's when one campus has it
  let lastCampus = null;
  async function campusCtx() {
    const list = await safe(Catalog.campuses(), []);
    const you = store.get("you") || {};
    const cm = Catalog.campusFor(list, { flag: S.flag, stored: S.campus, where: you.where });
    if (cm) lastCampus = cm;
    return { list, cm };
  }
  // the campus whose roster a read goes to: the person's, else the first with a catalog file
  const readCampus = ({ list, cm }) => cm || list.find(c => c.catalog_file) || list[0] || null;
  const setCampus = id => { S.campus = id; store.set("classes.campus", id); };
  const setRoles = list => { S.roles = [...new Set(list)]; store.set("classes.roles", S.roles); };
  // the product's rows for a role, kept in memory
  const rowsFor = id => rowsP[id] ||= Atlas.role(id).then(R => Catalog.rowsOf(Atlas.grid(R, R.jobs))).catch(e => { delete rowsP[id]; throw e; });
  // The chosen roles read together (Catalog.combineRoles): the relevance rows, and the gaps when a resume is on file
  // (ctx.gapsFor, app.js, per role; null without one). With one role everything reads as it did with "Rate for".
  // Returns { roles, rows, G: { roleIds, labels, label, gaps } | null, generic, subjects } where subjects is the field
  // tie-break's list for the campus (Catalog.fieldSubjects over the roles' fields).
  async function roleCtx(ctx, ix, cm) {
    const roles = S.roles.filter(id => ix.roles[id]);
    const generic = await safe(genericSet(), new Set());
    const fits = await Promise.all(roles.map(async id => ({ roleId: id, label: ix.roles[id].label, group: ix.roles[id].group, rows: await safe(rowsFor(id), []), gaps: ctx.gapsFor ? ((await safe(ctx.gapsFor(id), null)) || {}).gaps || null : null })));
    const c = Catalog.combineRoles(fits);
    const G = c.gaps ? { roleIds: roles, labels: c.labels, label: Catalog.joinLabels(c.labels), gaps: c.gaps } : null;
    return { roles, rows: c.rows, G, generic, subjects: Catalog.fieldSubjects(cm, [...new Set(fits.map(f => f.group).filter(Boolean))]) };
  }

  // the one-line card for home: the person's campus's, or, with no campus known, a neutral one over all
  async function startCard() {
    const { list, cm } = await campusCtx();
    if (cm && cm.start_card) { const sc = cm.start_card; return `<a class="choice" href="#/classes"><div class="t">${esc(sc.title)}</div><div class="d">${esc(sc.detail)}</div><span class="tag">${esc(sc.tag)}</span></a>`; }
    if (!list.length) return "";
    return `<a class="choice" href="#/classes"><div class="t">${esc(Catalog.neutralCardTitle(list))}</div><div class="d">${esc(CL.neutralDetail)}</div><span class="tag">${esc(CL.neutralTag)}</span></a>`;
  }

  // the hash the person came from, for the professor card's crumb: this script loads before app.js, so its listener
  // runs before route() draws the next screen (a reload has no previous hash, and the crumb says Classes)
  let fromHash = "";
  window.addEventListener("hashchange", e => { try { fromHash = new URL(e.oldURL).hash; } catch { fromHash = ""; } });
  // the open detail panel's close, while one is open: Esc calls it (a key inside a drop-down is the drop-down's own)
  let closeAside = null;
  document.addEventListener("keydown", e => { if (e.key === "Escape" && closeAside && !(e.target.closest && e.target.closest(".pick"))) { e.preventDefault(); closeAside(); } });

  // ---------- 1. the class picker ----------
  // opts.again: a redraw the screen asked for itself (a role added or dropped, a résumé read); a route (a link, Back)
  // draws without it and starts with no card open, so Back from a professor never brings the panel back over the list
  async function classes(ctx, opts) {
    const { crumbs, page, showAside } = ctx;
    S.flag = ctx.flag ? ctx.flag() : null;   // the door's campus flag (app.js): its campus comes first
    const token = ++S.token;
    const again0 = !!(opts && opts.again);
    if (!again0) { S.selected = null; closeAside = null; }
    crumbs([[CL.crumb, null]]); showAside(null);
    const { list, cm } = await campusCtx();
    // no campus known and more than one to choose from: ask once, as two cards, and keep the answer in this browser
    if (!cm) {
      if (!list.length) { page(`<h1>${esc(CL.heading)}</h1><div class="notice">${esc(CL.noCampus)}</div>`, true); return; }
      page(`<h1>${esc(CL.heading)}</h1><p class="lead">${esc(CL.whichCampus)}</p><div class="choices">${list.map(c => `<a class="choice" href="#/classes" data-campus="${esc(c.id)}"><div class="t">${esc(c.label)}</div><div class="d">${esc((c.start_card || {}).detail || "")}</div><span class="tag">${esc(c.catalog ? fill(CL.rosterLink, { term: c.term_label || "" }) : CL.rosterNotLoaded)}</span></a>`).join("")}</div><p class="small muted">${esc(CL.campusStays)}</p>`, true);
      document.querySelectorAll("[data-campus]").forEach(a => a.onclick = e => { e.preventDefault(); setCampus(a.dataset.campus); classes(ctx); });
      return;
    }
    const termLabel = cm.term_label || CFG().CATALOG_TERM || "";
    // the door's flag settles the campus (Catalog.campusFor), so a flagged visitor has nothing to change
    const change = list.length > 1 && !(S.flag && cm.flag === S.flag) ? ` · <button type="button" class="linkish link" id="cls-campus">${esc(CL.changeCampus)}</button>` : "";
    // the pre-enrollment dates under the heading, read from the campus entry (never written here)
    const dates = Catalog.datesLine(cm);
    const head = `<p class="eyebrow">${esc(termLabel)} · ${esc(cm.label || "")}${change}</p><h1>${esc(CL.heading)}</h1>${dates ? `<p class="small cls-dates">${esc(dates)}</p>` : ""}`;
    const privacy = cm.privacy_line ? `<p class="small muted">${esc(cm.privacy_line)}</p>` : "";
    const wireCampus = () => { const b = $("#cls-campus"); if (b) b.onclick = () => { setCampus(null); classes(ctx); }; };
    // a campus with no roster loaded says so and stops
    if (!cm.catalog || !cm.catalog_file) { page(`${head}<p class="lead">${esc(cm.closed_notice || CL.rosterClosed)}</p>${privacy}`, true); wireCampus(); return; }
    let data;
    try { data = await Catalog.loadCatalog(cm); }
    catch (e) { console.error(e); page(`${head}<div class="notice">${esc(fill(CL.rosterFailed, { message: e.message }))}</div>${privacy}`, true); wireCampus(); return; }
    if (token !== S.token) return;
    if (!data.classes.length) { page(`${head}<p class="lead">${esc(CL.rosterEmpty)}</p>${privacy}`, true); wireCampus(); return; }
    const cards = cardsOf(data);
    const ix = await Atlas.index(); await safe(Atlas.product(), null);
    const { query } = Routes.parseRoute(location.hash);
    if (query.open) { const c = cards.find(x => x.codes.includes(query.open)); if (c) S.selected = c.key; }
    // "#/classes?role=fpa": the rail's link brings the role along, added to the ones on file
    if (query.role && ix.roles[query.role] && !S.roles.includes(query.role)) setRoles([...S.roles, query.role]);
    if (S.roles.some(id => !ix.roles[id])) setRoles(S.roles.filter(id => ix.roles[id]));   // a remembered role the index no longer has
    // the roles read together: the relevance rows and, with a resume on file (app.js reads the fit), the person's
    // gaps: the cards say which of them each course covers, "Covers a gap" filters, and "Gaps covered" sorts
    const { roles, rows, G, generic, subjects } = await roleCtx(ctx, ix, cm);
    if (token !== S.token) return;
    const readsByKey = readAll(cards, data, roles.some(id => ix.roles[id].set === "tech"));
    const withGaps = !!(G && G.gaps.length);
    const covered = withGaps ? coverage(cards, readsByKey, G.gaps, generic) : {};
    if (!withGaps) S.coversGap = false;
    // no class covers any gap: the Gaps sort falls to the score, and one line over the list says so (never per card)
    const none = withGaps && Catalog.noCover(cards, Object.fromEntries(cards.map(c => [c.key, { covered: covered[c.key] }])));
    if (none) S.coversGap = false;
    // the product's column, from the tags: computed once per set of roles and kept in memory
    const rolesKey = roles.slice().sort().join("+");
    const th = cm.relevance || {};
    const rel = roles.length ? (scores[rolesKey] ||= Object.fromEntries(cards.map(c => { const r = Catalog.relevanceScore(readsByKey[c.key].found, rows, generic); return [c.key, { band: Catalog.relevanceBand(r.score, th), score: r.score, matched: r.matched.map(m => ({ name: m.name, tier: m.tier })) }]; }))) : {};
    const info = Object.fromEntries(cards.map(c => [c.key, { band: (rel[c.key] || {}).band, score: (rel[c.key] || {}).score || 0, covered: covered[c.key] || [] }]));
    const subjectsAll = [...new Set(cards.flatMap(c => c.subjects))].sort();
    // the instructor facet (v18, step 2): every instructor of a section this term, alphabetical by surname
    const instructors = Catalog.instructorList(cards);
    if (S.instructor && !instructors.some(i => i.name === S.instructor)) S.instructor = null;
    // the collapsible facets (owner feedback 2026-11-01), their options read from the roster: the days the sections
    // meet, the credits listed, who can take each class; a value chosen before that the roster no longer has is dropped
    const dayOpts = Catalog.dayList(cards).map(d => ({ value: d, label: CL.days[d] || d }));
    const creditOpts = Catalog.creditList(cards).map(v => ({ value: v, label: v }));
    const eligOpts = Catalog.eligibilityList(cards, cm, CL.noRestriction);
    const keep = (list, opts) => list.filter(v => opts.some(o => o.value === v));
    S.days = keep(S.days, dayOpts); S.credits = keep(S.credits, creditOpts); S.elig = keep(S.elig, eligOpts);
    const roleLink = id => `<a href="#/role/${esc(id)}/fit">${esc(ix.roles[id].label)}</a>`;
    // Focus after a draw (the page is drawn anew each time): the control the person used, found again by the same key,
    // else the role box when the screen asked for it (S.focusNext: a role added or dropped, a résumé read, no role on
    // the first draw); nothing when focus was outside the list's controls, so a draw never pulls focus from elsewhere
    let rolePick = null, profPick = null;
    const keyOf = el => {
      const main = $("#main");
      if (!el || !main || !main.contains(el)) return null;
      if (el.closest("#cls-add")) return "role";
      if (el.closest("#cls-prof")) return "prof";
      if (el.id) return "#" + CSS.escape(el.id);
      const ds = el.dataset || {};
      if (ds.facetKey) return `[data-facet-key="${CSS.escape(ds.facetKey)}"][data-val="${CSS.escape(ds.val)}"]`;
      for (const a of ["subject", "open", "dropRole"]) if (a in ds) return `[data-${a.replace(/[A-Z]/g, c => "-" + c.toLowerCase())}="${CSS.escape(ds[a])}"]`;
      if (el.tagName === "SUMMARY" && el.parentElement && el.parentElement.dataset.facet) return `[data-facet="${CSS.escape(el.parentElement.dataset.facet)}"] > summary`;
      return null;
    };
    const focusKey = k => {
      if (k === "role") { if (rolePick) rolePick.focus(); return; }
      if (k === "prof") { if (profPick) profPick.focus(); else if (rolePick) rolePick.focus(); return; }
      const el = k && $(k);
      if (el) el.focus({ preventScroll: true });
      else if (k && k.startsWith("[data-drop-role") && rolePick) rolePick.focus();
    };
    // no role chosen on the screen's first draw: the role box, since nothing on the cards means much before a role
    if (!roles.length && !again0 && !S.selected) S.focusNext = "role";
    const render = () => {
      const want = S.focusNext || keyOf(document.activeElement); S.focusNext = null;
      // The order: with nothing to compare against (no role chosen) there is no sort control and the list is the
      // roster's (subject, number); with roles, Relevance, or Gaps covered when a résumé leaves gaps. Never by code.
      if (S.sort === "gaps" && !withGaps) S.sort = "relevance";
      const mode = !roles.length ? "roster" : S.sort === "gaps" ? "gaps" : "relevance";
      const who = S.instructor ? instructors.find(i => i.name === S.instructor) : null;
      const shown = Catalog.sortCards(Catalog.filterCards(cards, { program: null, showAll: true, subject: S.subject, q: S.q, coversGap: S.coversGap, covered, instructor: who, days: S.days, credits: S.credits, eligibility: S.elig }), mode, info, subjects);
      // which field the search matched, for the card's label (a match in the description or the outcomes is not visible on the card)
      const matchedOf = c => S.q ? Catalog.matchField(c, S.q) : null;
      // "Match to roles": the chosen roles as chips a click removes, and one searchable drop-down (Pick, mounted in
      // wire) that adds a role; each option carries its field as the hint, so typing a field finds its roles
      const chips = roles.map(id => `<span class="chip on">${esc(ix.roles[id].label)}<button type="button" class="x" data-drop-role="${esc(id)}" aria-label="${esc(fill(CL.removeRole, { role: ix.roles[id].label }))}">×</button></span>`).join("");
      const rolesCtl = `<div class="chips cls-roles"><span class="lbl">${esc(CL.matchRoles)}</span>${chips}<div id="cls-add"></div></div>`;
      // one facet: a folded <details> whose summary says how many values it holds; chips toggle a value in S[name]
      const facet = (name, n, body) => `<details class="disc cls-facet" data-facet="${name}"${S.open.has(name) ? " open" : ""}><summary>${esc(n ? fill(CL.facetOn, { label: CL.facets[name], n }) : CL.facets[name])}</summary>${body}</details>`;
      const chipSet = (key, opts) => `<div class="chips">${opts.map(o => `<button type="button" class="chip${S[key].includes(o.value) ? " on" : ""}" data-facet-key="${key}" data-val="${esc(o.value)}">${esc(o.label)}${o.n != null ? `<span class="n">${o.n}</span>` : ""}</button>`).join("")}</div>`;
      const aboutLine = who ? `<p class="small">${who.slug ? `<a href="#/professor/${encodeURIComponent(who.slug)}">${esc(fill(CL.about, { name: who.name }))}</a>` : esc(fill(CL.noProfile, { name: who.name }))}</p>` : "";
      const facets = `<div class="cls-facets">${dayOpts.length ? facet("days", S.days.length, chipSet("days", dayOpts)) : ""}${creditOpts.length ? facet("credits", S.credits.length, chipSet("credits", creditOpts)) : ""}${eligOpts.length ? facet("eligibility", S.elig.length, chipSet("elig", eligOpts)) : ""}${instructors.length ? facet("professor", who ? 1 : 0, `<div id="cls-prof"></div>${aboutLine}`) : ""}</div>`;
      const gapsOf = c => withGaps && !none ? { covered: covered[c.key] || [], total: G.gaps.length } : null;
      const gapChip = withGaps && !none ? `<button type="button" class="chip${S.coversGap ? " on" : ""}" id="cls-gap">${esc(CL.coversGap)}<span class="n">${cards.filter(c => (covered[c.key] || []).length).length}</span></button>` : "";
      const sortCtl = roles.length ? `<label class="small muted">${esc(CL.sort)} <select id="cls-sort" class="cls-select"><option value="relevance"${mode === "relevance" ? " selected" : ""}>${esc(CL.sorts.relevance)}</option>${withGaps ? `<option value="gaps"${mode === "gaps" ? " selected" : ""}>${esc(CL.sorts.gaps)}</option>` : ""}</select></label>` : "";
      // the résumé row (C1): with none on file, the shell's form under the filters; a read draws the picker again
      // With a résumé on file and no role, one line stands in the row's place, so a read never ends on nothing
      const hasResume = !!(ctx.hasResume && ctx.hasResume());
      const resumeRow = !hasResume && ctx.resumeForm ? `<div class="cls-resume" id="cls-resume"><p class="small">${esc(CL.addResume)}</p>${ctx.resumeForm()}</div>`
        : hasResume && !roles.length ? `<p class="small cls-norole" id="cls-norole" role="status">${esc(CL.resumeNoRole)}</p>` : "";
      // the application box at the foot (v18, step 1), from app.js, with the first role recorded as the role on screen;
      // over it, when the fit leaves gaps, the one data-built line naming them
      const applyFoot = ctx.applyBox ? `<div class="fit-wait">${withGaps && ctx.applyLine ? `<p class="small">${esc(ctx.applyLine(G.label))}</p>` : ""}${ctx.applyBox("classes", { always: true, role_id: roles[0] || null })}</div>` : "";
      const gapLine = G ? (G.gaps.length ? `<p class="small">${fill(esc(CL.gapLine), { roles: Catalog.joinLabels(G.roleIds.map(roleLink)), gaps: esc(G.gaps.length === 1 ? CL.gap : fill(CL.gaps, { n: G.gaps.length })) })}</p><p class="small cls-gapnames">${esc(fill(CL.gapNames, { names: Catalog.namesLine(G.gaps.map(g => g.name), 6) }))}</p>` : `<p class="small muted">${esc(fill(CL.noGaps, { roles: G.label }))}</p>`) : "";
      const noneLine = none ? `<p class="small muted">${esc(Catalog.NO_COVER_LINE)}</p>` : "";
      // the empty list names the filters that emptied it and offers to clear them all (the roles stay)
      const on = Catalog.activeFilters({ q: S.q, subject: S.subject, coversGap: S.coversGap, days: S.days, credits: S.credits, elig: S.elig, instructor: S.instructor });
      const empty = `<p class="small muted cls-empty">${esc(on.length ? fill(CL.noMatchBy, { filters: Catalog.joinLabels(on) }) : CL.noMatch)}${on.length ? ` <button type="button" class="linkish link" id="cls-clear">${esc(CL.clearFilters)}</button>` : ""}</p>`;
      const leadLine = !roles.length ? `<p class="lead cls-lead">${esc(CL.pickRoleLead)}</p>` : "";
      const html = `${head}${leadLine}
        ${rolesCtl}
        <div class="row cls-filters">
          <input type="search" id="cls-q" placeholder="${esc(CL.searchPlaceholder)}" aria-label="${esc(CL.searchAria)}" value="${esc(S.q)}">
          ${sortCtl}
        </div>${resumeRow}${gapLine}
        <div class="chips">${gapChip ? gapChip + '<span class="lbl">·</span>' : ""}<span class="lbl">${esc(CL.subject)}</span><button type="button" class="chip${!S.subject ? " on" : ""}" data-subject="">${esc(CL.all)}</button>${subjectsAll.map(s => `<button type="button" class="chip${S.subject === s ? " on" : ""}" data-subject="${esc(s)}">${esc(s)}</button>`).join("")}</div>
        ${facets}${noneLine}
        <div class="cls-list" id="cls-list">${shown.map(c => Catalog.cardHtml(c, { campus: cm, roleId: roles.length ? rolesKey : null, rel: rel[c.key] || null, selected: S.selected === c.key, whyOpen: S.why.has(c.key), gaps: gapsOf(c), matched: matchedOf(c) })).join("") || empty}</div>
        ${applyFoot}
        ${privacy}`;
      picks.forEach(p => p.destroy()); picks = []; rolePick = profPick = null;
      page(html); $("#main").firstElementChild.classList.add("wide");
      wire();
      renderAside();
      if (want) focusKey(want);
    };
    // the screen's own redraw with the roles read again; focus goes back to the role box
    const again = () => { const y = window.scrollY; S.focusNext = "role"; classes(ctx, { again: true }).then(() => window.scrollTo(0, y)); };
    const wire = () => {
      wireCampus();
      if (ctx.wireApply) ctx.wireApply($("#main"), () => { const y = window.scrollY; render(); window.scrollTo(0, y); });
      // a draw keeps the page where it is (the facets and the drop-downs sit above the list)
      const redraw = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };
      // the role drop-down: every role not chosen yet, its field as the hint; a pick adds it and reads the roles again.
      // Pick calls onChange before it finishes its own update, so the draw waits a tick.
      const roleOptions = ix.groups.flatMap(g => g.roles.map(id => ix.roles[id]).filter(r => r && !roles.includes(r.id)).map(r => ({ value: r.id, label: r.label, hint: g.label })));
      const addEl = $("#cls-add");
      if (addEl && window.Pick) picks.push(rolePick = Pick.mount(addEl, { options: roleOptions, value: "", placeholder: roles.length ? CL.addRole : CL.pickRole, label: CL.addRoleAria, onChange: id => { if (id) setTimeout(() => { setRoles([...S.roles, id]); again(); }, 0); } }));
      // the professor facet: a searchable drop-down over every instructor this term, empty for anyone
      const profEl = $("#cls-prof");
      if (profEl && window.Pick) picks.push(profPick = Pick.mount(profEl, { options: instructors.map(i => ({ value: i.name, label: i.name })), value: S.instructor || "", placeholder: CL.anyProfessor, label: CL.facets.professor, allowEmpty: true, emptyLabel: CL.anyProfessor, onChange: v => setTimeout(() => { S.instructor = v || null; S.focusNext = "prof"; redraw(); }, 0) }));
      document.querySelectorAll("[data-facet]").forEach(d => d.ontoggle = () => { d.open ? S.open.add(d.dataset.facet) : S.open.delete(d.dataset.facet); });
      document.querySelectorAll("[data-facet-key]").forEach(b => b.onclick = () => { const k = b.dataset.facetKey, v = b.dataset.val; S[k] = S[k].includes(v) ? S[k].filter(x => x !== v) : [...S[k], v]; redraw(); });
      document.querySelectorAll("[data-drop-role]").forEach(b => b.onclick = () => { setRoles(S.roles.filter(id => id !== b.dataset.dropRole)); again(); });
      if ($("#cls-resume")) ctx.wireResume(again);   // a chosen file is kept and draws the picker again
      const sc = $("#cls-sort"); if (sc) sc.onchange = e => { S.sort = e.target.value; render(); };
      const gc = $("#cls-gap"); if (gc) gc.onclick = () => { S.coversGap = !S.coversGap; render(); };
      const q = $("#cls-q"); let t = null; q.oninput = () => { S.q = q.value; clearTimeout(t); t = setTimeout(() => { const y = window.scrollY; render(); window.scrollTo(0, y); const q2 = $("#cls-q"); q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); }, 160); };
      document.querySelectorAll("[data-subject]").forEach(b => b.onclick = () => { S.subject = b.dataset.subject || null; render(); });
      const clr = $("#cls-clear"); if (clr) clr.onclick = () => { Object.assign(S, { q: "", subject: null, coversGap: false, days: [], credits: [], elig: [], instructor: null }); S.focusNext = "#cls-q"; redraw(); };
      document.querySelectorAll(".cls-card").forEach(wireCard);
    };
    const wireCard = el => {
      el.querySelector("[data-open]").onclick = () => { S.selected = S.selected === el.dataset.card ? null : el.dataset.card; document.querySelectorAll(".cls-card").forEach(x => x.classList.toggle("on", x.dataset.card === S.selected)); renderAside(); const h = S.selected && document.querySelector("#aside #cls-detail-h"); if (h) h.focus(); };
      const w = el.querySelector("[data-why]"); if (w) w.ontoggle = () => { w.open ? S.why.add(w.dataset.why) : S.why.delete(w.dataset.why); };
    };
    // the detail panel: opened from a card's title, it takes focus on its heading (wireCard); × or Esc closes it and
    // focus goes back to the title that opened it
    const renderAside = () => {
      const card = S.selected && cards.find(c => c.key === S.selected);
      if (!card) { closeAside = null; showAside(null); return; }
      showAside(detailHtml(card, cm));
      const close = () => {
        const key = S.selected; S.selected = null; closeAside = null;
        document.querySelectorAll(".cls-card").forEach(el => el.classList.remove("on"));
        showAside(null);
        const back = key && document.querySelector(`.cls-card [data-open="${CSS.escape(key)}"]`); if (back) back.focus();
      };
      closeAside = close;
      const x = document.querySelector("#aside .close"); if (x) x.onclick = close;
    };
    render();
  }
  function detailHtml(card, cm) {
    const p = card.primary;
    const per = (label, pick) => { const vals = card.classes.map(c => [c.code, (pick(c) || "").trim()]).filter(x => x[1]); if (!vals.length) return ""; const uniq = [...new Set(vals.map(v => v[1]))]; return `<h3>${label}</h3>` + (uniq.length === 1 ? `<p class="small">${esc(uniq[0])}</p>` : vals.map(v => `<p class="small"><span class="muted">${esc(v[0])}</span> ${esc(v[1])}</p>`).join("")); };
    // roster learning outcomes, one per line
    const outcomes = cd => { const lines = [...new Set(cd.classes.flatMap(c => String(c.outcomes || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean)))]; return lines.length ? `<h3>${esc(CL.outcomes)}</h3><ul class="plain">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""; };
    const secs = card.sections.map(s => `<li><b>${esc([s.component, s.section].filter(Boolean).join(" "))}</b> · ${esc(s.class_nbr)}${s.open_status ? ` · ${esc(s.open_status)}` : ""}${s.instruction_mode ? ` · ${esc(s.instruction_mode)}` : ""}${s.topic ? ` · ${esc(s.topic)}` : ""}${(s.meetings || []).map(m => `<br><span class="muted">${esc([m.pattern, m.time_start && m.time_end ? `${m.time_start}–${m.time_end}` : m.time_start || "", m.facility].filter(Boolean).join(" · ") || CL.timeTBA)}</span>`).join("")}${(s.notes || []).length ? `<br><span class="muted">${esc(s.notes.join(" "))}</span>` : ""}</li>`).join("");
    // (owner feedback 2026-11-01) no prior offerings; Grading only when a code's row has a breakdown, its weights read as
    // percentages (Catalog.gradingText); the restriction and the eligibility label only on a restricted card, a
    // restriction the roster repeats ("A | A | A") said once
    const open = !Catalog.restricted(card);
    const limited = c => [...new Set(String(c.enrollment_limited_to || "").split(/\s*\|\s*/).map(x => x.trim()).filter(Boolean))].join("; ");
    const elig = Catalog.eligibilityLine(card, cm);
    return `${UI.close(Copy.common.close)}<div class="card">
      <p class="eyebrow">${esc(card.codes.concat(card.otherCodes || []).join(" / "))}</p><h2 id="cls-detail-h" tabindex="-1">${esc(card.title)}</h2>
      <p class="facts">${esc(Catalog.creditsLine(p.credits))}${p.grading_basis ? " · " + esc(p.grading_basis) : ""}${p.career ? " · " + esc(p.career) : ""}</p>
      ${per(esc(CL.description), c => c.description)}${outcomes(card)}${per(esc(CL.prerequisites), c => c.prereq)}
      ${open ? "" : per(esc(CL.limitedTo), limited)}
      ${elig ? `<p class="small"><span class="tag thin">${esc(elig)}</span></p>` : ""}
      <h3>${esc(CL.sections)}</h3>${secs ? `<ul class="plain">${secs}</ul>` : `<p class="small muted">${esc(CL.noSection)}</p>`}
      ${per(esc(CL.grading), c => Catalog.gradingText(c.grading_summary))}
      ${card.instructors.length ? `<h3>${esc(CL.teaching)}</h3><p class="small">${card.instructors.map(i => i.slug ? `<a href="#/professor/${encodeURIComponent(i.slug)}">${esc(i.name)}</a>` : esc(i.name)).join(", ")}</p>` : ""}
      ${p.roster_url ? `<p><a class="link" href="${esc(p.roster_url)}" target="_blank" rel="noopener">${esc(CL.openRoster)}</a></p>` : ""}
    </div>`;
  }

  // ---------- 2. a professor ----------
  async function professor(slug, ctx) {
    const { crumbs, page, showAside } = ctx;
    S.flag = ctx.flag ? ctx.flag() : null;
    const back = `<a href="#/classes">${esc(CL.backClasses)}</a>`;
    // the first crumb is where the person came from: Networking (the Faculty tab) when that was the last screen, with
    // its own hash so the tab and the role come back; else Classes
    const fromNet = Routes.parseRoute(fromHash).name === "network" && /^#\/network\b/.test(fromHash);
    const first = fromNet ? [Copy.common.bar.network, fromHash] : [CL.crumb, "#/classes"];
    crumbs([first, [CL.professor, null]]); showAside(null);
    if (!slug) { page(`<h1>${esc(CL.professor)}</h1><p class="lead">${esc(CL.noProfessor)} ${back}</p>`, true); return; }
    const at = readCampus(await campusCtx());
    if (!at || !at.catalog_file) { page(`<h1>${esc(CL.professor)}</h1><p class="lead">${esc((at && at.closed_notice) || CL.rosterClosedHere)} ${back}</p>`, true); return; }
    let r;
    try { r = await Catalog.loadProfessor(slug, at); }
    catch (e) { console.error(e); page(`<h1>${esc(CL.professor)}</h1><div class="notice">${esc(fill(CL.profileFailed, { message: e.message }))}</div>`, true); return; }
    if (!r.professor) { page(`<h1>${esc(CL.professor)}</h1><p class="lead">${esc(CL.noProfileNamed)} ${back}</p>`, true); return; }
    const P = r.professor;
    crumbs([first, [P.name, null]]);
    // the person's gaps this instructor's classes cover (v18, step 2): the picker's roles and their fit, the same
    // per-card tags the picker reads, joined over this instructor's cards; public facts stay as they are, and nothing
    // here is a rating or a review
    const gapsBlock = await safe(instructorGapsHtml(P, r.classes, ctx, at), "");
    // the blocks carry ids (#prof-tags, #prof-classes, #prof-gaps, #prof-angle) for the guide's steps (web/guide.js)
    const taught = `<div id="prof-classes">${r.classes.length ? `<h2>${esc(fill(CL.teachingIn, { term: at.term_label || CFG().CATALOG_TERM || "SP27" }))}</h2><div class="list">${r.classes.map(c => `<a class="r" href="#/classes?open=${encodeURIComponent(c.code)}"><span class="t">${esc(c.code)}${c.title ? " · " + esc(c.title) : ""}</span><span class="n">${esc(CL.openInPicker)}</span></a>`).join("")}</div>` : `<p class="small muted">${esc(CL.noClassTerm)}</p>`}</div>`;
    // A profile whose identity the research could not confirm stays unshown: the card is the name, the classes and the
    // gaps, and (owner feedback 2026-11-01) the screen says nothing about identity either way
    if (P.identity === "not_confirmed") {
      page(`<p class="eyebrow">${esc(CL.professor)}</p><h1>${esc(P.name)}</h1>${taught}${gapsBlock}`, true);
      return;
    }
    const secs = Catalog.mdSections(P.profile_md || "");
    const angle = secs["Networking angle"] ? `<div id="prof-angle"><h2>${esc(CL.angle)}</h2>${Catalog.mdHtml(secs["Networking angle"])}</div>` : "";
    const bio = secs["Bio"] ? `<details class="disc" style="margin-top:14px"><summary>${esc(CL.more)}</summary><div class="disc-body">${Catalog.mdHtml(secs["Bio"])}</div></details>` : "";
    const links = [[P.official_profile_url, CL.links.official], [P.personal_site_url, CL.links.site], [P.scholar_url, CL.links.scholar], [P.linkedin_url, CL.links.linkedin]].filter(([u]) => u).map(([u, l]) => `<a class="link" href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join(" · ");
    page(`<p class="eyebrow">${esc(CL.professor)}</p><h1>${esc(P.name)}</h1>
      <p class="lead">${esc([P.title, P.affiliation].filter(Boolean).join(" · ") || CL.noTitle)}</p>
      ${(P.expertise || []).length ? `<div class="tags" id="prof-tags">${P.expertise.map(x => `<span class="tag">${esc(x)}</span>`).join("")}</div>` : ""}
      ${taught}${gapsBlock}${angle}${links ? `<p class="small" style="margin-top:14px">${links}</p>` : ""}${bio}`, true);
  }

  // "Your gaps" on the professor card: "" when no role is chosen, no fit is on file, or the instructor teaches nothing
  // this term; else the gaps covered with the codes that cover them, or one line saying none
  async function instructorGapsHtml(P, taughtNow, ctx, at) {
    if (!S.roles.length || !ctx.gapsFor || !taughtNow.length) return "";
    const ix = await Atlas.index(); await safe(Atlas.product(), null);
    const { G, generic } = await roleCtx(ctx, ix, at);
    if (!G || !G.gaps.length) return "";
    const data = await Catalog.loadCatalog(at);
    if (!data.classes.length) return "";
    const codes = new Set(taughtNow.map(c => c.code));
    const mine = Catalog.instructorCards(cardsOf(data), { slug: P.slug, name: P.name }).filter(c => c.codes.some(k => codes.has(k)));
    if (!mine.length) return "";
    const gaps = Catalog.instructorGaps(mine, coverage(mine, readAll(mine, data), G.gaps, generic));
    const link = code => `<a href="#/classes?open=${encodeURIComponent(code)}">${esc(code)}</a>`;
    const fitLinks = Catalog.joinLabels(G.roleIds.map(id => `<a href="#/role/${esc(id)}/fit">${esc(ix.roles[id].label)}</a>`));
    const words = { name: P.name, classes: mine.length === 1 ? CL.classWord : CL.classesWord, roles: G.label };
    const body = gaps.length
      ? `<p class="small">${esc(fill(CL.profCovers, { ...words, n: gaps.length, gaps: `${G.gaps.length} ${G.gaps.length === 1 ? CL.gapWord : CL.gapsWord}` }))}</p><ul class="plain">${gaps.map(g => `<li><b>${esc(g.name)}</b> · ${g.codes.map(link).join(", ")}</li>`).join("")}</ul>`
      : `<p class="small muted">${esc(fill(CL.profCoversNone, { ...words, n: G.gaps.length }))}</p>`;
    return `<div id="prof-gaps"><h2>${esc(CL.yourGaps)}</h2>${body}<p class="small muted">${fill(esc(CL.byKind), { links: fitLinks })}</p></div>`;
  }

  // ---------- 3. #/signin: one line, then home (the roster is open; nothing here needs an account) ----------
  async function signin(ctx) {
    const { crumbs, page, showAside } = ctx;
    crumbs([[Copy.common.home, "#/home"]]); showAside(null);
    page(`<p class="lead">${esc(CL.signinOff)} <a href="#/home">${esc(CL.homeLink)}</a></p>`, true);
    // the entry is replaced, not pushed, so Back leaves as it came
    setTimeout(() => { if (location.hash.startsWith("#/signin")) location.replace(location.pathname + location.search + "#/home"); }, 1500);
  }

  // For the rail and the fit screen (PLAN.md v16, step 3): the courses that cover the person's gaps. Returns
  // { closed: <line> } when the roster cannot be read here (no file for the campus, an empty roster), else
  // { top: [{ key, codes, title, covered }], byGap: { gapId: [{ key, code }] } } over every card. gaps: [{ id, name, tier, w }].
  async function coverGaps(gaps) {
    const cm = readCampus(await campusCtx()) || {};
    const closed = { closed: cm.rail_closed_line || CL.rosterClosedHere };
    if (!cm.catalog || !cm.catalog_file) return closed;
    let data; try { data = await Catalog.loadCatalog(cm); } catch (e) { console.error(e); return closed; }
    if (!data.classes.length) return closed;
    const cards = cardsOf(data);
    const generic = await safe(genericSet(), new Set());
    const covered = coverage(cards, readAll(cards, data), gaps, generic);
    const info = Object.fromEntries(cards.map(c => [c.key, { covered: covered[c.key] }]));
    const top = Catalog.topCovering(cards, info, 3).map(c => ({ key: c.key, codes: c.codes, title: c.title, covered: covered[c.key] }));
    const byGap = {};
    for (const c of Catalog.sortCards(cards, "gaps", info)) for (const g of covered[c.key] || []) (byGap[g.id] ||= []).push({ key: c.key, code: c.codes[0] });
    return { top, byGap, total: cards.length };
  }
  const termLabel = () => (lastCampus && lastCampus.term_label) || (CFG().CATALOG_TERM === "SP27" ? "Spring 2027" : CFG().CATALOG_TERM || "");
  campusCtx();   // so termLabel has the campus's words once the file is read

  window.ClassScreens = { classes, professor, signin, startCard, coverGaps, termLabel };
})();
