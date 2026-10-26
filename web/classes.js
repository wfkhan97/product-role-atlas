/* The Spring 2027 screens: #/classes (the class picker), #/professor/<slug> (a professor card) and #/signin (Supabase
   Auth, cornell.edu only). app.js dispatches here with its shell helpers; the data and the pure functions are in
   catalog.js; every campus-specific string is in data/sp27_campus.json. Three localStorage keys: classes.program,
   classes.role, classes.own; the product never writes classes.own except on the student's own click. */
(function () {
  "use strict";
  if (typeof document === "undefined") return;
  const $ = s => document.querySelector(s);
  const CFG = () => window.CONFIG || {};
  const esc = Catalog.esc;
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  const S = { program: store.get("classes.program"), role: store.get("classes.role"), own: store.get("classes.own") || {}, showAll: false, subject: null, q: "", selected: null, why: new Set(), token: 0, coversGap: false, sort: "code" };
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
  const campusData = () => safe(Catalog.campus(), {});
  const niceDate = d => { const [y, m, day] = String(d || "").split("-"); const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return m && day ? `${Number(day)} ${names[Number(m) - 1]} ${y}` : String(d || ""); };

  // ---------- the top bar: "Classes" once sign in is on or a session exists; "Sign in" only while it is on ----------
  async function navSync(sess) {
    const s = sess === undefined ? await Catalog.session() : sess;
    const on = !!CFG().AUTH_ENABLED;
    const c = $("#nav-classes"); if (c) c.hidden = !(on || s);
    const i = $("#nav-signin"); if (i) { i.hidden = !on || !!s; }
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

  // the one-line card on the start screen
  async function startCard() {
    const cm = await campusData(); const sc = cm.start_card; if (!sc) return "";
    return `<a class="choice" href="#/classes"><div class="t">${esc(sc.title)}</div><div class="d">${esc(sc.detail)}</div><span class="tag">${esc(sc.tag)}</span></a>`;
  }

  // ---------- 1. the class picker ----------
  async function classes(ctx) {
    const { crumbs, page, showAside } = ctx;
    const token = ++S.token;
    crumbs([["Classes", null]]); showAside(null);
    const cm = await campusData();
    const termLabel = cm.term_label || CFG().CATALOG_TERM || "";
    const head = `<p class="eyebrow">${esc(termLabel)} · ${esc(cm.campus || "")}</p><h1>Pick your classes</h1>`;
    const privacy = cm.privacy_line ? `<p class="small muted">${esc(cm.privacy_line)}</p>` : "";
    const sess = await Catalog.session();
    if (CFG().AUTH_ENABLED && !sess) {
      page(`${head}<p class="lead">The roster is for Cornell students. Sign in with your Cornell email to open it.</p><p><a class="btn primary" href="#/signin">Sign in →</a></p>${privacy}`, true);
      return;
    }
    if (!Catalog.sb()) { page(`${head}<div class="notice">The catalog client did not load, so the roster cannot be read on this page. Reload the page.</div>${privacy}`, true); return; }
    let data;
    try { data = await Catalog.loadCatalog(); }
    catch (e) { console.error(e); page(`${head}<div class="notice">The roster could not be read: ${esc(e.message)}.</div>${privacy}`, true); return; }
    if (token !== S.token) return;
    if (!data.classes.length) {
      page(`${head}${!sess ? `<p class="lead">${esc(cm.closed_notice || "Sign in is not open yet.")}</p><p class="small muted"><a class="btn quiet" href="#/signin">Sign in (development)</a></p>` : `<p class="lead">The roster is empty right now. Check back after the next refresh.</p>`}${privacy}`, true);
      return;
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
    const roleOpts = ix.groups.map(g => { const rs = g.roles.map(id => ix.roles[id]).filter(Boolean); return rs.length ? `<optgroup label="${esc(g.label)}">${rs.map(r => `<option value="${esc(r.id)}"${S.role === r.id ? " selected" : ""}>${esc(r.label)}</option>`).join("")}</optgroup>` : ""; }).join("");
    const render = () => {
      const rel = S.role ? (scores[S.role] || {}) : {};
      const info = Object.fromEntries(cards.map(c => [c.key, { band: (rel[c.key] || {}).band, covered: covered[c.key] || [] }]));
      if (S.sort === "gaps" && !(G && G.gaps.length)) S.sort = "code";
      const shown = Catalog.sortCards(Catalog.filterCards(cards, { program, showAll: S.showAll, subject: S.subject, q: S.q, coversGap: S.coversGap, covered }), S.sort, info);
      const gapsOf = c => G && G.gaps.length ? { covered: covered[c.key] || [], total: G.gaps.length } : null;
      const gapChip = G && G.gaps.length ? `<button type="button" class="chip${S.coversGap ? " on" : ""}" id="cls-gap">Covers a gap<span class="n">${cards.filter(c => (covered[c.key] || []).length).length}</span></button>` : "";
      const sortCtl = `<label class="small muted">Sort <select id="cls-sort" class="cls-select"><option value="code"${S.sort === "code" ? " selected" : ""}>Code</option><option value="relevance"${S.sort === "relevance" ? " selected" : ""}>Relevance</option>${G && G.gaps.length ? `<option value="gaps"${S.sort === "gaps" ? " selected" : ""}>Gaps covered</option>` : ""}</select></label>`;
      const gapLine = G ? (G.gaps.length ? `<p class="small">Your fit for ${esc(G.label)} leaves ${G.gaps.length} ${G.gaps.length === 1 ? "gap" : "gaps"}; each card says which it covers, read from the course text by kind (a course can show craft, not how you work). <a href="#/role/${esc(G.roleId)}/fit">Your fit →</a></p>` : `<p class="small muted">Your resume shows every skill most ${esc(G.label)} postings ask for; nothing to cover.</p>`) : S.role && ctx.gapsFor ? `<p class="small muted">Add your resume on the role screen and each card says which of your gaps it covers. <a href="#/role/${esc(S.role)}">Open the role →</a></p>` : "";
      const html = `${head}
        <p class="lead">${cm.roster_updates_until ? `Roster as of ${esc(niceDate(data.rosterDate))}; updated weekly until ${esc(cm.roster_updates_until)}.` : `Roster as of ${esc(niceDate(data.rosterDate))}.`} Two columns rate each class: ours reads the roster text against the role you pick; yours is your own call and stays in this browser.</p>
        <div class="row cls-filters">
          <label class="small muted">Your program <select id="cls-program" class="cls-select"><option value="">pick a program</option>${programs.map(p => `<option value="${esc(p.id)}"${program && program.id === p.id ? " selected" : ""}>${esc(p.label)}</option>`).join("")}</select></label>
          <label class="small muted">Rate for <select id="cls-role" class="cls-select"><option value="">pick a role</option>${roleOpts}</select></label>
          <label class="small muted"><input type="checkbox" id="cls-all"${S.showAll ? " checked" : ""}> Show all ${cards.length === data.classes.length ? cards.length : `${data.classes.length} classes`}</label>
          <input type="search" id="cls-q" placeholder="Code or title" aria-label="Search by code or title" value="${esc(S.q)}">
          ${sortCtl}
        </div>${gapLine}
        ${program && program.unverified ? `<p class="small muted">Which classes a ${esc(program.label)} student may take is a first pass, not confirmed with Student Affairs; use Show all if a class you expect is missing.</p>` : ""}
        <div class="chips">${gapChip ? gapChip + '<span class="lbl">·</span>' : ""}<span class="lbl">Subject</span><button type="button" class="chip${!S.subject ? " on" : ""}" data-subject="">All</button>${subjects.map(s => `<button type="button" class="chip${S.subject === s ? " on" : ""}" data-subject="${esc(s)}">${esc(s)}</button>`).join("")}</div>
        <p class="small muted" id="cls-count">${shown.length} ${shown.length === 1 ? "class" : "classes"} shown${program && !S.showAll ? ` for ${esc(program.label)}` : ""}; cross-listed classes share a card.</p>
        <div class="cls-list" id="cls-list">${shown.map(c => Catalog.cardHtml(c, { campus: cm, roleId: S.role, rel: rel[c.key] || "pending", own: S.own[c.key] || null, selected: S.selected === c.key, whyOpen: S.why.has(c.key), gaps: gapsOf(c) })).join("") || `<p class="small muted">No class matches. Clear the search, or show all.</p>`}</div>
        ${privacy}`;
      page(html); $("#main").firstElementChild.classList.add("wide");
      wire(shown);
      renderAside();
      if (S.role) scoreCards(shown, S.role, token, cm);
    };
    const wire = shown => {
      $("#cls-program").onchange = e => { S.program = e.target.value || null; store.set("classes.program", S.program); classes(ctx); };
      const rs = $("#cls-role"); rs.value = S.role || ""; if (rs.value !== (S.role || "")) rs.value = "";   // a remembered role the index no longer has
      rs.onchange = e => { S.role = e.target.value || null; store.set("classes.role", S.role); render(); };
      $("#cls-all").onchange = e => { S.showAll = e.target.checked; render(); };
      $("#cls-sort").onchange = e => { S.sort = e.target.value; render(); };
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
      const tmp = document.createElement("div"); tmp.innerHTML = Catalog.cardHtml(card, { campus: cm2, roleId: S.role, rel: (scores[S.role] || {})[key] || "pending", own: S.own[key] || null, selected: S.selected === key, whyOpen: S.why.has(key), gaps: G && G.gaps.length ? { covered: covered[key] || [], total: G.gaps.length } : null });
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
      page(`<h1>Professor</h1><p class="lead">${sess ? "No profile under that name on the roster." : "Profiles open with a Cornell sign-in."} <a href="#/classes">Back to the classes.</a>${sess ? "" : ` <a href="#/signin">Sign in.</a>`}</p>`, true);
      return;
    }
    const P = r.professor;
    crumbs([["Classes", "#/classes"], [P.name, null]]);
    const taught = r.classes.length ? `<h2>Teaching in ${esc(CFG().CATALOG_TERM || "SP27")}</h2><div class="list">${r.classes.map(c => `<a class="r" href="#/classes?open=${encodeURIComponent(c.code)}"><span class="t">${esc(c.code)}${c.title ? " · " + esc(c.title) : ""}</span><span class="n">open in the picker →</span></a>`).join("")}</div>` : `<p class="small muted">No class on the roster this term.</p>`;
    if (P.identity === "not_confirmed") {
      page(`<p class="eyebrow">Professor</p><h1>${esc(P.name)}</h1><p class="lead">Identity not confirmed; no profile shown.</p>${taught}`, true);
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
      ${taught}${angle}${links ? `<p class="small" style="margin-top:14px">${links}</p>` : ""}${bio}
      <p class="small muted" style="margin-top:20px">Public professional information only. There are no ratings or reviews here.</p>`, true);
  }

  // ---------- 3. sign in: Google (cornell.edu) or a magic link to a cornell.edu address ----------
  async function signin(ctx) {
    const { crumbs, page, showAside } = ctx;
    current.signin = () => signin(ctx);
    crumbs([["Sign in", null]]); showAside(null);
    const cm = await campusData();
    const privacy = `<p class="small muted">${esc(cm.privacy_line || "Signing in sends your Cornell email to Supabase. Your program, your ratings and anything you paste stay in this browser.")}</p>`;
    const note = Catalog.takeAuthNote();
    if (!Catalog.sb()) { page(`<h1>Sign in</h1><div class="notice">The sign-in client did not load. Reload the page.</div>${privacy}`, true); return; }
    const sess = await Catalog.session();
    if (sess) {
      page(`<h1>Signed in</h1><p class="lead">You are signed in as <b>${esc(sess.user.email)}</b>.</p>
        <div class="row"><a class="btn primary" href="#/classes">Open the classes →</a><button type="button" class="btn quiet" id="si-out">Sign out</button></div>${privacy}`, true);
      $("#si-out").onclick = async () => { try { await Catalog.signOut(); } catch (e) { console.error(e); } signin(ctx); };
      return;
    }
    page(`<h1>Sign in</h1><p class="lead">For Cornell students: the roster, the professors and the ratings open with a cornell.edu account.</p>
      ${note ? `<div class="notice">${esc(note)}</div>` : ""}
      <div class="row" style="margin-top:12px"><button type="button" class="btn primary" id="si-google">Continue with Google (cornell.edu)</button></div>
      <h3 style="margin-top:22px">Or get a sign-in link by email</h3>
      <form id="si-form" class="row"><input type="email" id="si-email" class="cls-email" placeholder="netid@cornell.edu" autocomplete="email" aria-label="Cornell email"><button type="submit" class="btn" id="si-send" disabled>Send the link</button></form>
      <p class="small muted" id="si-msg">Only addresses ending in @cornell.edu are accepted.</p>
      ${privacy}
      ${CFG().AUTH_ENABLED ? "" : `<p class="small muted">Sign in is not open to students yet; this page is reachable for development.</p>`}`, true);
    const msg = t => { $("#si-msg").textContent = t; };
    const email = $("#si-email"), send = $("#si-send");
    email.oninput = () => { send.disabled = !Catalog.isCornell(email.value); };
    $("#si-form").onsubmit = async e => {
      e.preventDefault();
      if (!Catalog.isCornell(email.value)) { msg("Use an address that ends in @cornell.edu."); return; }
      send.disabled = true; msg("Sending…");
      try { await Catalog.signInEmail(email.value); msg(`Sent. Open the link in the email in this browser; it signs you in and opens the classes.`); }
      catch (err) { console.error(err); msg(`The link could not be sent: ${err.message}.`); send.disabled = false; }
    };
    $("#si-google").onclick = async () => { msg("Opening Google…"); try { await Catalog.signInGoogle(); } catch (err) { console.error(err); msg(`Google sign-in did not start: ${err.message}.`); } };
  }

  // For the rail and the fit screen (PLAN.md v16, step 3): the courses that cover the person's gaps. Returns
  // { closed: <line> } when the roster cannot be read here (sign-in on and no session, no client, an empty roster), else
  // { top: [{ key, codes, title, covered }], byGap: { gapId: [{ key, code }] } } over every card. gaps: [{ id, name, tier, w }].
  async function coverGaps(gaps) {
    const cm = await campusData();
    const closed = { closed: cm.rail_closed_line || "The roster is not open here yet." };
    if (!Catalog.sb()) return closed;
    const sess = await Catalog.session();
    if (CFG().AUTH_ENABLED && !sess) return closed;
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
  const termLabel = () => CFG().CATALOG_TERM === "SP27" ? "Spring 2027" : CFG().CATALOG_TERM || "";

  window.ClassScreens = { classes, professor, signin, startCard, navSync, coverGaps, termLabel };
})();
