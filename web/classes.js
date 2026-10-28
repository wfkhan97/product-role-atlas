/* The Spring 2027 screens: #/classes (the class picker), #/professor/<slug> (a professor card) and #/signin (Supabase
   Auth, the campus's email domains). app.js dispatches here with its shell helpers; the data and the pure functions are
   in catalog.js; every campus-specific string is in data/sp27_campus.json, one entry per campus. Four localStorage
   keys: classes.campus, classes.program, classes.role, classes.own; the product never writes classes.own except on the
   student's own click. The person's campus is inferred from the program they picked when it belongs to one campus,
   else asked once on the classes screen. */
(function () {
  "use strict";
  if (typeof document === "undefined") return;
  const $ = s => document.querySelector(s);
  const CFG = () => window.CONFIG || {};
  const esc = Catalog.esc;
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  const S = { campus: store.get("classes.campus"), program: store.get("classes.program"), role: store.get("classes.role"), own: store.get("classes.own") || {}, showAll: false, subject: null, q: "", selected: null, why: new Set(), token: 0, coversGap: false, sort: "code", instructor: null };
  const scores = {};   // roleId -> { cardKey -> { band, matched } }, in memory for the page's life
  const inFlight = new Set();   // "roleId|cardKey" being read now, so two renders do not read the same card twice
  const rowsP = {};    // roleId -> Promise of the role's core and common rows
  // the course reader's answer per card (cardKey -> Promise of { found, teaches }): it does not depend on the role, so
  // the picker's relevance column and the gaps (PLAN.md v16, step 3) share one read per card per page
  const reads = {};
  const readCard = card => reads[card.key] ||= Atlas.readCourse(Catalog.cardText(card)).then(r => ({ found: r.found, teaches: r.teaches })).catch(e => { delete reads[card.key]; throw e; });
  // every card read, a few at a time so the page stays responsive; a card that fails to read covers nothing
  async function readAll(cards) {
    const out = {}; let i = 0;
    for (const c of cards) { try { out[c.key] = await readCard(c); } catch (e) { console.error(e); out[c.key] = { found: new Set(), teaches: new Set() }; } if (++i % 8 === 0) await new Promise(r => setTimeout(r, 0)); }
    return out;
  }
  // which of the person's gaps each card covers: { cardKey: [gap rows] }, by kind (a named behaviour is not covered)
  const coverage = (cards, readsByKey, gaps) => Object.fromEntries(cards.map(c => [c.key, Catalog.gapsCovered((readsByKey[c.key] || {}).teaches, gaps)]));
  let cardsCache = null, dataCache = null;
  const safe = (p, fallback) => Promise.resolve(p).catch(e => { console.error(e); return fallback; });
  // the campuses and the person's: stored, else the picker program's, else the v15 program group's when one campus has it
  let lastCampus = null;
  async function campusCtx() {
    const list = await safe(Catalog.campuses(), []);
    const you = store.get("you") || {};
    const cm = Catalog.campusFor(list, { stored: S.campus, programId: S.program, where: you.where });
    if (cm) lastCampus = cm;
    return { list, cm };
  }
  const setCampus = id => { S.campus = id; store.set("classes.campus", id); };
  const niceDate = d => { const [y, m, day] = String(d || "").split("-"); const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return m && day ? `${Number(day)} ${names[Number(m) - 1]} ${y}` : String(d || ""); };

  // CATALOG_OPEN (web/config.js): the test switch that pauses every sign-in gate below; the roster then reads with no
  // session, which the anon-read policy of pipeline/sql/2026-10-28_open_read.sql allows
  const OPEN = () => !!CFG().CATALOG_OPEN;
  // ---------- the top bar: "Classes" once sign in is on, a session exists or the gates are paused; "Sign in" only while sign in is on and not paused ----------
  async function navSync(sess) {
    const s = sess === undefined ? await Catalog.session() : sess;
    const on = !!CFG().AUTH_ENABLED;
    const c = $("#nav-classes"); if (c) c.hidden = !(on || s || OPEN());
    const i = $("#nav-signin"); if (i) { i.hidden = !on || !!s || OPEN(); }
  }
  navSync();
  // a fresh sign-in that lands on the start page (the redirect lost its hash) goes to the picker, once
  let routedOnce = false;
  Catalog.onAuth((s, ev) => {
    navSync(s);
    if (s && ev === "SIGNED_IN" && !routedOnce && ["", "#", "#/"].includes(location.hash)) { routedOnce = true; location.hash = "#/classes"; return; }
    if (location.hash.startsWith("#/signin") && current.signin) current.signin();
  });
  const current = {};

  // the one-line card on the start screen: the person's campus's, or, with no campus known, a neutral one over all
  async function startCard() {
    const { list, cm } = await campusCtx();
    if (cm && cm.start_card) { const sc = cm.start_card; return `<a class="choice" href="#/classes"><div class="t">${esc(sc.title)}</div><div class="d">${esc(sc.detail)}</div><span class="tag">${esc(OPEN() && cm.catalog ? (cm.term_label || "") + " roster →" : sc.tag)}</span></a>`; }
    if (!list.length) return "";
    return `<a class="choice" href="#/classes"><div class="t">${esc(Catalog.neutralCardTitle(list))}</div><div class="d">The roster, who teaches what, and how each class reads against the role you want.</div><span class="tag">Pick your campus →</span></a>`;
  }

  // ---------- 1. the class picker ----------
  async function classes(ctx) {
    const { crumbs, page, showAside } = ctx;
    const token = ++S.token;
    crumbs([["Classes", null]]); showAside(null);
    const { list, cm } = await campusCtx();
    // no campus known and more than one to choose from: ask once, as two cards, and keep the answer in this browser
    if (!cm) {
      if (!list.length) { page(`<h1>Pick your classes</h1><div class="notice">No campus is configured on this page.</div>`, true); return; }
      page(`<h1>Pick your classes</h1><p class="lead">Which campus are you at?</p><div class="choices">${list.map(c => `<a class="choice" href="#/classes" data-campus="${esc(c.id)}"><div class="t">${esc(c.label)}</div><div class="d">${esc((c.start_card || {}).detail || "")}</div><span class="tag">${esc(c.catalog ? (c.term_label || "") + " roster →" : "Roster not loaded yet")}</span></a>`).join("")}</div><p class="small muted">Your campus stays in this browser; change it any time from the classes screen.</p>`, true);
      document.querySelectorAll("[data-campus]").forEach(a => a.onclick = e => { e.preventDefault(); setCampus(a.dataset.campus); classes(ctx); });
      return;
    }
    const termLabel = cm.term_label || CFG().CATALOG_TERM || "";
    const change = list.length > 1 ? ` · <button type="button" class="linkish link" id="cls-campus">change campus</button>` : "";
    const head = `<p class="eyebrow">${esc(termLabel)} · ${esc(cm.label || "")}${change}</p><h1>Pick your classes</h1>`;
    const privacy = cm.privacy_line ? `<p class="small muted">${esc(cm.privacy_line)}</p>` : "";
    const wireCampus = () => { const b = $("#cls-campus"); if (b) b.onclick = () => { setCampus(null); classes(ctx); }; };
    // a campus with no roster loaded says so and stops
    if (!cm.catalog) { page(`${head}<p class="lead">${esc(cm.closed_notice || "The roster is not loaded yet.")}</p>${privacy}`, true); wireCampus(); return; }
    const sess = await Catalog.session();
    if (CFG().AUTH_ENABLED && !sess && !OPEN()) {
      page(`${head}<p class="lead">The roster is for ${esc(cm.label)} students. Sign in with your ${esc(Catalog.domainWords(cm))} email to open it.</p><p><a class="btn primary" href="#/signin">Sign in →</a></p>${privacy}`, true);
      wireCampus(); return;
    }
    if (!Catalog.sb()) { page(`${head}<div class="notice">The catalog client did not load, so the roster cannot be read on this page. Reload the page.</div>${privacy}`, true); wireCampus(); return; }
    let data;
    try { data = await Catalog.loadCatalog(); }
    catch (e) { console.error(e); page(`${head}<div class="notice">The roster could not be read: ${esc(e.message)}.</div>${privacy}`, true); wireCampus(); return; }
    if (token !== S.token) return;
    if (!data.classes.length) {
      // with the gates paused and no session, an empty read means the anon-read policy is not on the catalog project
      page(`${head}${!sess && OPEN() ? `<div class="notice">The roster read nothing without a sign-in. CATALOG_OPEN is on, so the anon-read policy (pipeline/sql/2026-10-28_open_read.sql) is not applied on the catalog project.</div>` : !sess ? `<p class="lead">${esc(cm.closed_notice || "Sign in is not open yet.")}</p><p class="small muted"><a class="btn quiet" href="#/signin">Sign in (development)</a></p>` : `<p class="lead">The roster is empty right now. Check back after the next refresh.</p>`}${privacy}`, true);
      wireCampus(); return;
    }
    if (dataCache !== data) { dataCache = data; cardsCache = Catalog.collapse(data); }
    const cards = cardsCache;
    const ix = await Atlas.index(); await safe(Atlas.product(), null);
    const { query } = Routes.parseRoute(location.hash);
    if (query.open) { const c = cards.find(x => x.codes.includes(query.open)); if (c) S.selected = c.key; }
    // "#/classes?role=fpa": the rail's link brings the role along
    if (query.role && ix.roles[query.role]) { S.role = query.role; store.set("classes.role", S.role); }
    // the person's gaps for the chosen role, when a resume is on file (app.js reads the fit): the cards say which of
    // them each course covers, "Covers a gap" filters, and "Gaps covered" sorts
    const G = ctx.gapsFor && S.role ? await safe(ctx.gapsFor(S.role), null) : null;
    let covered = {};
    if (G && G.gaps.length) { const readsByKey = await readAll(cards); if (token !== S.token) return; covered = coverage(cards, readsByKey, G.gaps); }
    else S.coversGap = false;
    const programs = cm.programs || [], program = programs.find(p => p.id === S.program) || null;
    const subjects = [...new Set(cards.flatMap(c => c.subjects))].sort();
    // the instructor facet (v18, step 2): every instructor of a section this term, alphabetical by surname
    const instructors = Catalog.instructorList(cards);
    if (S.instructor && !instructors.some(i => i.name === S.instructor)) S.instructor = null;
    const roleOpts = ix.groups.map(g => { const rs = g.roles.map(id => ix.roles[id]).filter(Boolean); return rs.length ? `<optgroup label="${esc(g.label)}">${rs.map(r => `<option value="${esc(r.id)}"${S.role === r.id ? " selected" : ""}>${esc(r.label)}</option>`).join("")}</optgroup>` : ""; }).join("");
    const render = () => {
      const rel = S.role ? (scores[S.role] || {}) : {};
      const info = Object.fromEntries(cards.map(c => [c.key, { band: (rel[c.key] || {}).band, covered: covered[c.key] || [] }]));
      if (S.sort === "gaps" && !(G && G.gaps.length)) S.sort = "code";
      const who = S.instructor ? instructors.find(i => i.name === S.instructor) : null;
      const shown = Catalog.sortCards(Catalog.filterCards(cards, { program, showAll: S.showAll, subject: S.subject, q: S.q, coversGap: S.coversGap, covered, instructor: who }), S.sort, info);
      // which field the search matched, for the card's label (a match in the description or the outcomes is not visible on the card)
      const matchedOf = c => S.q ? Catalog.matchField(c, S.q) : null;
      const instructorCtl = instructors.length ? `<label class="small muted">Instructor <select id="cls-instructor" class="cls-select"><option value="">anyone</option>${instructors.map(i => `<option value="${esc(i.name)}"${S.instructor === i.name ? " selected" : ""}>${esc(i.name)}</option>`).join("")}</select></label>` : "";
      const aboutLine = who ? `<p class="small">${who.slug ? `<a href="#/professor/${encodeURIComponent(who.slug)}">About ${esc(who.name)} →</a>` : `${esc(who.name)} has no profile on the roster yet.`}</p>` : "";
      const gapsOf = c => G && G.gaps.length ? { covered: covered[c.key] || [], total: G.gaps.length } : null;
      const gapChip = G && G.gaps.length ? `<button type="button" class="chip${S.coversGap ? " on" : ""}" id="cls-gap">Covers a gap<span class="n">${cards.filter(c => (covered[c.key] || []).length).length}</span></button>` : "";
      const sortCtl = `<label class="small muted">Sort <select id="cls-sort" class="cls-select"><option value="code"${S.sort === "code" ? " selected" : ""}>Code</option><option value="relevance"${S.sort === "relevance" ? " selected" : ""}>Relevance</option>${G && G.gaps.length ? `<option value="gaps"${S.sort === "gaps" ? " selected" : ""}>Gaps covered</option>` : ""}</select></label>`;
      // the cohort application box at the foot (v18, step 1), from app.js, with the picker's role recorded as the role on
      // screen; over it, when a role is chosen and the fit leaves gaps, the one data-built line naming them
      const applyFoot = ctx.applyBox ? `<div class="fit-wait">${G && G.gaps.length && ctx.applyLine ? `<p class="small">${esc(ctx.applyLine(G.label))}</p>` : ""}${ctx.applyBox("classes", { always: true, role_id: S.role || null })}</div>` : "";
      const gapLine = G ? (G.gaps.length ? `<p class="small">Your fit for ${esc(G.label)} leaves ${G.gaps.length} ${G.gaps.length === 1 ? "gap" : "gaps"}; each card says which it covers, read from the course text by kind (a course can show craft, not how you work). <a href="#/role/${esc(G.roleId)}/fit">Your fit →</a></p>` : `<p class="small muted">Your resume shows every skill most ${esc(G.label)} postings ask for; nothing to cover.</p>`) : S.role && ctx.gapsFor ? `<p class="small muted">Add your resume on the role screen and each card says which of your gaps it covers. <a href="#/role/${esc(S.role)}">Open the role →</a></p>` : "";
      const html = `${head}
        <p class="lead">${cm.roster_updates_until ? `Roster as of ${esc(niceDate(data.rosterDate))}; updated weekly until ${esc(cm.roster_updates_until)}.` : `Roster as of ${esc(niceDate(data.rosterDate))}.`} Two columns rate each class: ours reads the roster text against the role you pick; yours is your own call and stays in this browser.</p>
        <div class="row cls-filters">
          <label class="small muted">Your program <select id="cls-program" class="cls-select"><option value="">pick a program</option>${programs.map(p => `<option value="${esc(p.id)}"${program && program.id === p.id ? " selected" : ""}>${esc(p.label)}</option>`).join("")}</select></label>
          <label class="small muted">Rate for <select id="cls-role" class="cls-select"><option value="">pick a role</option>${roleOpts}</select></label>
          <label class="small muted"><input type="checkbox" id="cls-all"${S.showAll ? " checked" : ""}> Show all ${cards.length === data.classes.length ? cards.length : `${data.classes.length} classes`}</label>
          ${instructorCtl}
          <input type="search" id="cls-q" placeholder="Code, title or content" aria-label="Search by code, title, description or outcomes" value="${esc(S.q)}">
          ${sortCtl}
        </div>${aboutLine}${gapLine}
        ${program && program.unverified ? `<p class="small muted">Which classes a ${esc(program.label)} student may take is a first pass, not confirmed with Student Affairs; use Show all if a class you expect is missing.</p>` : ""}
        <div class="chips">${gapChip ? gapChip + '<span class="lbl">·</span>' : ""}<span class="lbl">Subject</span><button type="button" class="chip${!S.subject ? " on" : ""}" data-subject="">All</button>${subjects.map(s => `<button type="button" class="chip${S.subject === s ? " on" : ""}" data-subject="${esc(s)}">${esc(s)}</button>`).join("")}</div>
        <p class="small muted" id="cls-count">${shown.length} ${shown.length === 1 ? "class" : "classes"} shown${program && !S.showAll ? ` for ${esc(program.label)}` : ""}; cross-listed classes share a card.</p>
        <div class="cls-list" id="cls-list">${shown.map(c => Catalog.cardHtml(c, { campus: cm, roleId: S.role, rel: rel[c.key] || "pending", own: S.own[c.key] || null, selected: S.selected === c.key, whyOpen: S.why.has(c.key), gaps: gapsOf(c), matched: matchedOf(c) })).join("") || `<p class="small muted">No class matches. Clear the search, or show all.</p>`}</div>
        ${applyFoot}
        ${privacy}`;
      page(html); $("#main").firstElementChild.classList.add("wide");
      wire(shown);
      renderAside();
      if (S.role) scoreCards(shown, S.role, token, cm);
    };
    const wire = shown => {
      wireCampus();
      if (ctx.wireApply) ctx.wireApply($("#main"), () => { const y = window.scrollY; render(); window.scrollTo(0, y); });
      $("#cls-program").onchange = e => { S.program = e.target.value || null; store.set("classes.program", S.program); classes(ctx); };
      const rs = $("#cls-role"); rs.value = S.role || ""; if (rs.value !== (S.role || "")) rs.value = "";   // a remembered role the index no longer has
      rs.onchange = e => { S.role = e.target.value || null; store.set("classes.role", S.role); render(); };
      $("#cls-all").onchange = e => { S.showAll = e.target.checked; render(); };
      $("#cls-sort").onchange = e => { S.sort = e.target.value; render(); };
      const ic = $("#cls-instructor"); if (ic) ic.onchange = e => { S.instructor = e.target.value || null; render(); };
      const gc = $("#cls-gap"); if (gc) gc.onclick = () => { S.coversGap = !S.coversGap; render(); };
      const q = $("#cls-q"); let t = null; q.oninput = () => { S.q = q.value; clearTimeout(t); t = setTimeout(() => { const y = window.scrollY; render(); window.scrollTo(0, y); const q2 = $("#cls-q"); q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); }, 160); };
      document.querySelectorAll("[data-subject]").forEach(b => b.onclick = () => { S.subject = b.dataset.subject || null; render(); });
      document.querySelectorAll(".cls-card").forEach(wireCard);
    };
    const wireCard = el => {
      el.querySelector("[data-open]").onclick = () => { S.selected = S.selected === el.dataset.card ? null : el.dataset.card; document.querySelectorAll(".cls-card").forEach(x => x.classList.toggle("on", x.dataset.card === S.selected)); renderAside(); };
      el.querySelectorAll("[data-own]").forEach(b => b.onclick = () => { S.own[b.dataset.own] = b.dataset.val; store.set("classes.own", S.own); el.querySelectorAll("[data-own]").forEach(x => x.classList.toggle("on", x.dataset.val === b.dataset.val)); });
      const w = el.querySelector("[data-why]"); if (w) w.ontoggle = () => { w.open ? S.why.add(w.dataset.why) : S.why.delete(w.dataset.why); };
    };
    const redrawCard = (key, cm2) => {
      const el = document.querySelector(`.cls-card[data-card="${CSS.escape(key)}"]`); if (!el) return;
      const card = cards.find(c => c.key === key);
      const tmp = document.createElement("div"); tmp.innerHTML = Catalog.cardHtml(card, { campus: cm2, roleId: S.role, rel: (scores[S.role] || {})[key] || "pending", own: S.own[key] || null, selected: S.selected === key, whyOpen: S.why.has(key), gaps: G && G.gaps.length ? { covered: covered[key] || [], total: G.gaps.length } : null, matched: S.q ? Catalog.matchField(card, S.q) : null });
      el.replaceWith(tmp.firstElementChild); wireCard(document.querySelector(`.cls-card[data-card="${CSS.escape(key)}"]`));
    };
    // the product's column, computed lazily per role and kept in memory; the reader is async, so cards fill in one by one
    const rowsFor = id => rowsP[id] ||= Atlas.role(id).then(R => Catalog.rowsOf(Atlas.grid(R, R.jobs))).catch(e => { delete rowsP[id]; throw e; });
    async function scoreCards(shown, roleId, tok, cm2) {
      let rows; try { rows = await rowsFor(roleId); } catch (e) { console.error(e); return; }
      const th = cm.relevance || {};
      const bag = scores[roleId] ||= {};
      let i = 0;
      for (const card of shown) {
        if (tok !== S.token || S.role !== roleId) return;
        const fk = roleId + "|" + card.key;
        if (!bag[card.key] && !inFlight.has(fk)) {
          inFlight.add(fk);
          try { const { found } = await readCard(card); const r = Catalog.relevanceScore(found, rows); bag[card.key] = { band: Catalog.relevanceBand(r.score, th), matched: r.matched.map(m => ({ name: m.name, tier: m.tier })) }; }
          catch (e) { console.error(e); bag[card.key] = { band: "low", matched: [] }; }
          finally { inFlight.delete(fk); }
          if (tok !== S.token || S.role !== roleId) return;
          redrawCard(card.key, cm2);
          if (++i % 4 === 0) await new Promise(r => setTimeout(r, 0));
        }
      }
    }
    const renderAside = () => {
      const card = S.selected && cards.find(c => c.key === S.selected);
      if (!card) { showAside(null); return; }
      showAside(detailHtml(card, cm));
      const x = document.querySelector("#aside .close"); if (x) x.onclick = () => { S.selected = null; document.querySelectorAll(".cls-card").forEach(el => el.classList.remove("on")); showAside(null); };
    };
    render();
  }
  function detailHtml(card, cm) {
    const p = card.primary;
    const per = (label, pick) => { const vals = card.classes.map(c => [c.code, (pick(c) || "").trim()]).filter(x => x[1]); if (!vals.length) return ""; const uniq = [...new Set(vals.map(v => v[1]))]; return `<h3>${label}</h3>` + (uniq.length === 1 ? `<p class="small">${esc(uniq[0])}</p>` : vals.map(v => `<p class="small"><span class="muted">${esc(v[0])}</span> ${esc(v[1])}</p>`).join("")); };
    // roster learning outcomes, one per line
    const outcomes = cd => { const lines = [...new Set(cd.classes.flatMap(c => String(c.outcomes || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean)))]; return lines.length ? `<h3>Outcomes</h3><ul class="plain">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""; };
    const secs = card.sections.map(s => `<li><b>${esc([s.component, s.section].filter(Boolean).join(" "))}</b> · ${esc(s.class_nbr)}${s.open_status ? ` · ${esc(s.open_status)}` : ""}${s.instruction_mode ? ` · ${esc(s.instruction_mode)}` : ""}${s.topic ? ` · ${esc(s.topic)}` : ""}${(s.meetings || []).map(m => `<br><span class="muted">${esc([m.pattern, m.time_start && m.time_end ? `${m.time_start}–${m.time_end}` : m.time_start || "", m.facility].filter(Boolean).join(" · ") || "time to be announced")}</span>`).join("")}${(s.notes || []).length ? `<br><span class="muted">${esc(s.notes.join(" "))}</span>` : ""}</li>`).join("");
    const priors = card.priors.slice().sort((a, b) => a.term.localeCompare(b.term)).map(pr => `<li>Taught ${esc(pr.term)} by ${esc((pr.instructors || []).join(", ") || "an instructor the roster does not name")}</li>`).join("");
    const chip = Catalog.gradingChip(p);
    return `<button type="button" class="close" aria-label="Close">×</button><div class="card">
      <p class="eyebrow">${esc(card.codes.concat(card.otherCodes || []).join(" / "))}</p><h2>${esc(card.title)}</h2>
      <p class="facts">${esc(p.credits ? p.credits + " credits" : "credits not listed")}${p.grading_basis ? " · " + esc(p.grading_basis) : ""}${p.career ? " · " + esc(p.career) : ""}</p>
      ${per("Description", c => c.description)}${outcomes(card)}${per("Prerequisites", c => c.prereq)}
      ${per("Enrollment limited to", c => c.enrollment_limited_to)}
      <p class="small"><span class="tag thin">${esc([...new Set(card.classes.map(c => Catalog.eligibilityLabel(c.eligibility_category, cm)))].join(" · "))}</span></p>
      <h3>Sections</h3>${secs ? `<ul class="plain">${secs}</ul>` : `<p class="small muted">No section on the roster yet.</p>`}
      <h3>Prior offerings</h3>${priors ? `<ul class="plain">${priors}</ul>` : `<p class="small muted">None on record since SP25.</p>`}
      <h3>Grading</h3><p class="small"><span class="muted">${esc(chip.text)}</span>${chip.summary ? ` ${esc(chip.summary)}` : ""}${chip.caveat ? ` <span class="muted">(${esc(chip.caveat)})</span>` : ""}</p>
      ${card.instructors.length ? `<h3>Teaching it</h3><p class="small">${card.instructors.map(i => i.slug ? `<a href="#/professor/${encodeURIComponent(i.slug)}">${esc(i.name)}</a>` : esc(i.name)).join(", ")}</p>` : ""}
      ${p.roster_url ? `<p><a class="link" href="${esc(p.roster_url)}" target="_blank" rel="noopener">Open on the class roster ↗</a></p>` : ""}
    </div>`;
  }

  // ---------- 2. a professor ----------
  const IDENTITY = { confirmed: ["identity confirmed", "good"], probable: ["identity probable", "amber"], not_confirmed: ["identity not confirmed", "thin"] };
  async function professor(slug, ctx) {
    const { crumbs, page, showAside } = ctx;
    crumbs([["Classes", "#/classes"], ["Professor", null]]); showAside(null);
    if (!slug) { page(`<h1>Professor</h1><p class="lead">No professor named. <a href="#/classes">Back to the classes.</a></p>`, true); return; }
    if (!Catalog.sb()) { page(`<h1>Professor</h1><div class="notice">The catalog client did not load. Reload the page.</div>`, true); return; }
    let r;
    try { r = await Catalog.loadProfessor(slug); }
    catch (e) { console.error(e); page(`<h1>Professor</h1><div class="notice">The profile could not be read: ${esc(e.message)}.</div>`, true); return; }
    const sess = await Catalog.session();
    if (!r.professor) {
      page(`<h1>Professor</h1><p class="lead">${sess || OPEN() ? "No profile under that name on the roster." : "Profiles open with a Cornell sign-in."} <a href="#/classes">Back to the classes.</a>${sess || OPEN() ? "" : ` <a href="#/signin">Sign in.</a>`}</p>`, true);
      return;
    }
    const P = r.professor;
    crumbs([["Classes", "#/classes"], [P.name, null]]);
    // the person's gaps this instructor's classes cover (v18, step 2): the picker's chosen role and its fit, the same
    // per-card reads the picker makes (readCard), joined over this instructor's cards; public facts stay as they are,
    // and nothing here is a rating or a review
    const gapsBlock = await safe(instructorGapsHtml(P, r.classes, ctx), "");
    const taught = r.classes.length ? `<h2>Teaching in ${esc(CFG().CATALOG_TERM || "SP27")}</h2><div class="list">${r.classes.map(c => `<a class="r" href="#/classes?open=${encodeURIComponent(c.code)}"><span class="t">${esc(c.code)}${c.title ? " · " + esc(c.title) : ""}</span><span class="n">open in the picker →</span></a>`).join("")}</div>` : `<p class="small muted">No class on the roster this term.</p>`;
    if (P.identity === "not_confirmed") {
      page(`<p class="eyebrow">Professor</p><h1>${esc(P.name)}</h1><p class="lead">Identity not confirmed; no profile shown.</p>${taught}${gapsBlock}`, true);
      return;
    }
    const [idLabel, idClass] = IDENTITY[P.identity] || IDENTITY.not_confirmed;
    const secs = Catalog.mdSections(P.profile_md || "");
    const angle = secs["Networking angle"] ? `<h2>Networking angle</h2>${Catalog.mdHtml(secs["Networking angle"])}` : "";
    const bio = secs["Bio"] ? `<details class="disc" style="margin-top:14px"><summary>More</summary><div class="disc-body">${Catalog.mdHtml(secs["Bio"])}</div></details>` : "";
    const links = [[P.official_profile_url, "Official profile"], [P.personal_site_url, "Personal site"], [P.scholar_url, "Google Scholar"], [P.linkedin_url, "LinkedIn"]].filter(([u]) => u).map(([u, l]) => `<a class="link" href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join(" · ");
    page(`<p class="eyebrow">Professor</p><h1>${esc(P.name)}</h1>
      <p class="small"><span class="tag ${idClass}">${idLabel}</span></p>
      <p class="lead">${esc([P.title, P.affiliation].filter(Boolean).join(" · ") || "Title and affiliation not on record.")}</p>
      ${(P.expertise || []).length ? `<div class="tags">${P.expertise.map(x => `<span class="tag">${esc(x)}</span>`).join("")}</div>` : ""}
      ${taught}${gapsBlock}${angle}${links ? `<p class="small" style="margin-top:14px">${links}</p>` : ""}${bio}
      <p class="small muted" style="margin-top:20px">Public professional information only. There are no ratings or reviews here.</p>`, true);
  }

  // "Your gaps" on the professor card: "" when no role is chosen, no fit is on file, the roster cannot be read here, or
  // the instructor teaches nothing this term; else the gaps covered with the codes that cover them, or one line saying none
  async function instructorGapsHtml(P, taughtNow, ctx) {
    if (!S.role || !ctx.gapsFor || !taughtNow.length) return "";
    const G = await ctx.gapsFor(S.role);
    if (!G || !G.gaps.length) return "";
    if (!Catalog.sb()) return "";
    const data = await Catalog.loadCatalog();
    if (!data.classes.length) return "";
    if (dataCache !== data) { dataCache = data; cardsCache = Catalog.collapse(data); }
    const codes = new Set(taughtNow.map(c => c.code));
    const mine = Catalog.instructorCards(cardsCache, { slug: P.slug, name: P.name }).filter(c => c.codes.some(k => codes.has(k)));
    if (!mine.length) return "";
    const readsByKey = await readAll(mine);
    const gaps = Catalog.instructorGaps(mine, coverage(mine, readsByKey, G.gaps));
    const link = code => `<a href="#/classes?role=${encodeURIComponent(S.role)}&open=${encodeURIComponent(code)}">${esc(code)}</a>`;
    const body = gaps.length
      ? `<p class="small">${esc(P.name)}'s ${mine.length === 1 ? "class" : "classes"} this term cover ${gaps.length} of your ${G.gaps.length} ${G.gaps.length === 1 ? "gap" : "gaps"} for ${esc(G.label)}.</p><ul class="plain">${gaps.map(g => `<li><b>${esc(g.name)}</b> · ${g.codes.map(link).join(", ")}</li>`).join("")}</ul>`
      : `<p class="small muted">None of ${esc(P.name)}'s ${mine.length === 1 ? "class" : "classes"} this term names one of your ${G.gaps.length} gaps for ${esc(G.label)}.</p>`;
    return `<h2>Your gaps</h2>${body}<p class="small muted">Read from the course text by kind, as the picker reads it; a course can teach a skill without naming it. <a href="#/role/${esc(G.roleId)}/fit">Your fit →</a></p>`;
  }

  // ---------- 3. sign in: Google or a magic link, to an address in the campus's domains (data) ----------
  async function signin(ctx) {
    const { crumbs, page, showAside } = ctx;
    current.signin = () => signin(ctx);
    crumbs([["Sign in", null]]); showAside(null);
    const { list, cm: known } = await campusCtx();
    // with no campus known, sign in as the first campus that has sign-in; the picker asks the campus afterwards
    const cm = known || list.find(c => (c.signin_domains || []).length) || list[0] || {};
    const privacy = `<p class="small muted">${esc(cm.privacy_line || "Your program, your ratings and anything you paste stay in this browser.")}</p>`;
    const note = Catalog.takeAuthNote();
    if (!Catalog.sb()) { page(`<h1>Sign in</h1><div class="notice">The sign-in client did not load. Reload the page.</div>${privacy}`, true); return; }
    const sess = await Catalog.session();
    if (sess) {
      page(`<h1>Signed in</h1><p class="lead">You are signed in as <b>${esc(sess.user.email)}</b>.</p>
        <div class="row"><a class="btn primary" href="#/classes">Open the classes →</a><button type="button" class="btn quiet" id="si-out">Sign out</button></div>${privacy}`, true);
      $("#si-out").onclick = async () => { try { await Catalog.signOut(); } catch (e) { console.error(e); } signin(ctx); };
      return;
    }
    const domains = cm.signin_domains || [], words = Catalog.domainWords(cm);
    if (!domains.length) {
      page(`<h1>Sign in</h1><p class="lead">Sign-in for ${esc(cm.label || "this campus")} is not open yet.</p><p class="small muted">The roster, the professors and the ratings open with a school account once it is.</p>${privacy}`, true);
      return;
    }
    page(`<h1>Sign in</h1><p class="lead">For ${esc(cm.label)} students: the roster, the professors and the ratings open with ${esc(words)} account.</p>
      ${OPEN() ? `<div class="notice">Sign-in is paused on this build (CATALOG_OPEN in config.js): the roster, the professors and the role rail open without it. This page stays reachable for development.</div>` : ""}
      ${note ? `<div class="notice">${esc(note)}</div>` : ""}
      <div class="row" style="margin-top:12px"><button type="button" class="btn primary" id="si-google">Continue with Google (${esc(domains[0])})</button></div>
      <h3 style="margin-top:22px">Or get a sign-in link by email</h3>
      <form id="si-form" class="row"><input type="email" id="si-email" class="cls-email" placeholder="you@${esc(domains[0])}" autocomplete="email" aria-label="School email"><button type="submit" class="btn" id="si-send" disabled>Send the link</button></form>
      <p class="small muted" id="si-msg">Only addresses ending in ${esc(words)} are accepted.</p>
      ${privacy}
      ${CFG().AUTH_ENABLED ? "" : `<p class="small muted">Sign in is not open to students yet; this page is reachable for development.</p>`}`, true);
    const msg = t => { $("#si-msg").textContent = t; };
    const email = $("#si-email"), send = $("#si-send");
    email.oninput = () => { send.disabled = !Catalog.allowedEmail(email.value, cm); };
    $("#si-form").onsubmit = async e => {
      e.preventDefault();
      if (!Catalog.allowedEmail(email.value, cm)) { msg(`Use an address that ends in ${words}.`); return; }
      send.disabled = true; msg("Sending…");
      try { await Catalog.signInEmail(email.value, cm); msg(`Sent. Open the link in the email in this browser; it signs you in and opens the classes.`); }
      catch (err) { console.error(err); msg(`The link could not be sent: ${err.message}.`); send.disabled = false; }
    };
    $("#si-google").onclick = async () => { msg("Opening Google…"); try { await Catalog.signInGoogle(cm); } catch (err) { console.error(err); msg(`Google sign-in did not start: ${err.message}.`); } };
  }

  // For the rail and the fit screen (PLAN.md v16, step 3): the courses that cover the person's gaps. Returns
  // { closed: <line> } when the roster cannot be read here (sign-in on and no session, no client, an empty roster), else
  // { top: [{ key, codes, title, covered }], byGap: { gapId: [{ key, code }] } } over every card. gaps: [{ id, name, tier, w }].
  async function coverGaps(gaps) {
    const { list, cm: known } = await campusCtx();
    const cm = known || list[0] || {};
    const closed = { closed: cm.rail_closed_line || "The roster is not open here yet." };
    if (!cm.catalog || !Catalog.sb()) return closed;
    const sess = await Catalog.session();
    if (CFG().AUTH_ENABLED && !sess && !OPEN()) return closed;
    let data; try { data = await Catalog.loadCatalog(); } catch (e) { console.error(e); return closed; }
    if (!data.classes.length) return closed;
    if (dataCache !== data) { dataCache = data; cardsCache = Catalog.collapse(data); }
    const cards = cardsCache;
    const readsByKey = await readAll(cards);
    const covered = coverage(cards, readsByKey, gaps);
    const info = Object.fromEntries(cards.map(c => [c.key, { covered: covered[c.key] }]));
    const top = Catalog.topCovering(cards, info, 3).map(c => ({ key: c.key, codes: c.codes, title: c.title, covered: covered[c.key] }));
    const byGap = {};
    for (const c of Catalog.sortCards(cards, "gaps", info)) for (const g of covered[c.key] || []) (byGap[g.id] ||= []).push({ key: c.key, code: c.codes[0] });
    return { top, byGap, total: cards.length };
  }
  const termLabel = () => (lastCampus && lastCampus.term_label) || (CFG().CATALOG_TERM === "SP27" ? "Spring 2027" : CFG().CATALOG_TERM || "");
  campusCtx();   // so termLabel has the campus's words once the file is read

  window.ClassScreens = { classes, professor, signin, startCard, navSync, coverGaps, termLabel };
})();
