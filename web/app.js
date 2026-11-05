/* Role atlas — the screens. Routes (hash): #/ the door (welcome, an email, what you study; everyone can skip) · #/home (the four verbs) ·
   #/jobs (Find jobs: one search over every open posting, v19 B4) · #/skills (the launcher: every role by field with the résumé beside it, v19 B5) ·
   #/network (Who to meet: the people types for one role and a prep card, v19 B5) · #/play/<game> ·
   #/you · #/explore · #/field/<group> · #/role/<role> · #/about · #/classes, #/professor/<slug> (classes.js) ·
   #/signin (the magic link for an invited address when CONFIG.MAPS_ENABLED, else classes.js's one line) · #/map (the
   apprentice map, read from the private bucket with the person's session; web/auth.js).
   Data comes from atlas.js; the side panel (owner's choice 8B) shows a skill or a posting. */
// The route: the hash read into the screen to show, its path parts and its query. Pure, no DOM; UMD like atlas.js,
// so node loads it alone (tests/web/routes.test.mjs): require("web/app.js").parseRoute.
// Every string a screen owns is web/copy.js (Copy, loaded first; required here in node): the pure tables Intake and
// Door.COPY below are views over it.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.Copy || require("./copy.js"));
  else { root.Routes = factory(root.Copy); root.Stage = root.Routes.Stage; root.Intake = root.Routes.Intake; root.Door = root.Routes.Door; root.You = root.Routes.You; }
})(typeof self !== "undefined" ? self : this, function (Copy) {
  "use strict";
  const SCREENS = { "": "door", home: "home", jobs: "jobs", skills: "skills", network: "network", you: "you", explore: "explore", field: "field", role: "role", play: "play", about: "about", classes: "classes", professor: "professor", signin: "signin", map: "map" };
  // "#/role/pm/fit?x=1" -> { name: "fit", params: { id: "pm" }, query: { x: "1" }, parts: ["role", "pm", "fit"], search: "x=1" }.
  // An empty hash is the door. An unknown first part, or a part that cannot be decoded ("%E0"), shows home. `search`
  // is the text between the first and a second "?", as the screens read it.
  function parseRoute(hash) {
    const h = String(hash || "");
    let parts;
    try { parts = h.split("?")[0].replace(/^#\/?/, "").split("/").map(decodeURIComponent); }
    catch { return { name: "home", params: {}, query: {}, parts: [], search: "" }; }
    const [a, b, c] = parts;
    const search = h.split("?")[1] || "";
    const query = Object.fromEntries(new URLSearchParams(search));
    let name = Object.hasOwn(SCREENS, a || "") ? SCREENS[a || ""] : "home";
    if (name === "field" && c === "event") name = "event";
    if (name === "role" && (c === "fit" || c === "course")) name = c;
    const params = name === "play" || name === "professor" ? { slug: b } : ["field", "event", "role", "fit", "course"].includes(name) ? { id: b } : {};
    return { name, params, query, parts, search };
  }
  // The stage answer (v15: you.stage) decides what About you and the role rail lead with (v16 step 2). It is asked in
  // About you, step 2, and nowhere else (v19, decision 8: the start screen that asked it first went with v19 B2; the
  // door and home never ask it). Pure, so evals/stage.mjs can check that for each stage the first action offered is the
  // one the stage asks for: looking, a resume drop or the fields; targeting, the role search or the gaps; curious,
  // explore or a game. On the rail the stage no longer changes the order (owner, 2026-11-01): the entry-grade facts,
  // the "Add your resume" sentences and the standing links (practice, a course, events) went, so every stage gets the
  // drop, then the one link to the class picker.
  const STAGES = ["looking", "targeting", "curious"];
  const Stage = {
    STAGES,
    // what the About you summary leads with
    youLead: stage => stage === "targeting" ? "role-search" : "answers",
    // the rail's blocks in order, for a person with answers (and, when `resume`, a resume read): sentences and actions;
    // ACTIONS says which keys are something to do. "drop" is the resume drop zone; "gaps" the gap rows; "classes" the
    // rail's one closing link, "Find classes relevant for this role"
    railBlocks: (stage, resume) => resume ? ["band", "line", "gaps", "fit-link", "classes"] : ["drop", "classes"],
    ACTIONS: new Set(["drop", "gaps", "fit-link", "classes", "role-search", "explore", "fields"]),
    // the first action a screen offers for a stage: "you" is About you, anything else the rail
    firstAction(stage, screen, resume) {
      if (screen === "you") return this.youLead(stage) === "role-search" ? "role-search" : resume || stage === "curious" ? "fields" : "drop";   // curious: the fields and Explore, no resume asked
      return this.railBlocks(stage, resume).find(k => this.ACTIONS.has(k)) || null;
    },
    // the first call to action a screen ends in, for a stage: the intake box, the same for every stage and every
    // screen (v18 step 1 put one box everywhere; v19 B5 made it the intake); its heading, so the eval can read it
    cta: (stage, screen) => Intake.heading,
  };
  // The intake box (v19 B5, 2026-10-31): the one call to action the rail, the fit screen, the launcher's foot, the
  // networking screen and the class picker end in. It replaced the cohort application box of v18 step 1 (that program
  // and its dates are gone from every screen). One heading, one line per surface (what GradBuddy will do for that
  // verb), an email, Notify me. No free-text field. Pure, so evals/stage.mjs and tests/web/intake.test.mjs can read
  // every string: none says a cohort, a price, a date or "apply", and no sentence runs over 20 words.
  const Intake = {
    heading: Copy.intake.heading,
    line: Copy.intake.line,
    email: Copy.intake.email,
    button: Copy.intake.button,
    done: Copy.intake.done,
    privacy: Copy.intake.privacy,
    // the one data-built line over the picker's box, when a role is chosen and the person's fit leaves gaps
    gapsLine: label => Copy.fill(Copy.intake.gapsLine, { label }),
    // the surface a click comes from, for the line: the gap rows' "Help me build this skill" and the fit screen's foot
    // are the skills verb; the gap rows' "Help me improve my positioning" its own (2026-11-01); the picker's foot the
    // classes verb; the networking screen its own
    surfaceOf: what => what === "classes" || what === "network" || what === "positioning" ? what : "skills",
    // the form a box is (v19 B7): `intake_<surface>`, the kind web/doors.js mounts and the source its row carries
    kindOf: what => "intake_" + Intake.surfaceOf(what),
    // the sources the database accepts (the same list as web/capture.js SOURCES): the six of v18 (the rail's three
    // placeholders, the fit screen's foot, the start screen's box, gone with v19 B2, the class picker's foot) and the
    // four of v19 B7, which every box sends from now: `door` and `intake_<surface>`; `intake_positioning` since
    // 2026-11-01 (pipeline/sql/2026-11-01_positioning.sql)
    SOURCES: ["show", "build", "ways", "fit", "start", "classes", "door", "intake_skills", "intake_classes", "intake_network", "intake_positioning"],
  };
  // The door (#/) and home (#/home), v19 B2. The door is a welcome screen, not a gate: everyone can skip it, and the
  // email is capture and routing, never a credential (nothing behind it is private, no screen says "sign in"). Pure:
  // every string on the two screens is in web/copy.js (Copy.door, Copy.home, the bar Copy.common.bar) and COPY is a
  // view over them with the shape tests/web/door.test.mjs reads; the four functions touch no DOM and no storage. The screens store the answers (door.email, door.where,
  // door.seen) in localStorage. The form is Tally's when CONFIG.TALLY.door is set (web/doors.js, B7), else the native
  // one; the native Continue sends the email with the source `door`. Tally's return is the one time the email rides in
  // the URL (#/home?email=…&where=…): home reads it once and cleans the hash.
  // The campus flags (2026-11-04): the door's email read by its domain against web/config.js CAMPUS_DOMAINS
  // ({ flag: [domains] }), and the flag linked to a roster by the `flag` of a campus entry (data/sp27_campus.json).
  // `domains` defaults to the config's table in the browser and to none in node; `campuses` is Catalog.campuses()'s
  // list, which honors `enabled_by`, so a switched-off campus opens nothing.
  const domainTable = domains => domains || (typeof self !== "undefined" && self.CONFIG && self.CONFIG.CAMPUS_DOMAINS) || {};
  // the screens a flag with no roster does not reach: they go home (not grayed, not shown)
  const ROSTER_SCREENS = new Set(["classes", "professor"]);
  const Door = {
    COPY: { ...Copy.door, home: Copy.home.heading, bar: Copy.common.bar },
    // the flag whose domain list holds the address's domain, else null: the whole domain after the last "@", any case,
    // spaces around the address ignored (wk332@cornell.edu and john.smith@cornell.edu are cornell;
    // wk332@alumni.cornell.edu, a gmail address and anything without an "@" are no campus)
    campus(email, domains) {
      const e = String(email || "").trim().toLowerCase(), at = e.lastIndexOf("@");
      if (at < 1 || at === e.length - 1 || e.indexOf("@") !== at || /\s/.test(e)) return null;
      const d = e.slice(at + 1);
      for (const [flag, list] of Object.entries(domainTable(domains))) if ((list || []).some(x => String(x || "").trim().toLowerCase() === d)) return flag;
      return null;
    },
    // the listed campus with a loaded roster (catalog: true) for a flag, else null
    rosterOf: (flag, campuses) => (flag && (campuses || []).find(c => c.flag === flag && c.catalog)) || null,
    // the address belongs to a campus with a loaded roster: Find classes, its routes and the Faculty tab open
    // (owner, 2026-11-04: any @cornell.edu address, no longer a NetID alone)
    opens: (email, domains, campuses) => !!Door.rosterOf(Door.campus(email, domains), campuses),
    // the screen a route draws for a visitor: #/classes and #/professor/<slug> go home when the address opens no roster
    reach: (name, open) => ROSTER_SCREENS.has(name) && !open ? "home" : name,
    // the route after the door: the deep link the person arrived on, unless that is the door itself
    next: target => { const t = String(target || ""); return t && parseRoute(t).name !== "door" ? t : "#/home"; },
    // a deep link goes to the door first, once: any route but the door while door.seen is not set
    bounce: (hash, seen) => !seen && parseRoute(hash).name !== "door",
    // a count in words, rounded down so the sentence stays true until the next refresh: 25,950 -> "25 thousand",
    // 1,502 -> "1,500", 54 -> "50"
    thousands: n => n >= 1000 ? `${Math.floor(n / 1000)} thousand` : Door.hundreds(n),
    hundreds: n => (Math.floor(n / 100) * 100).toLocaleString("en-US"),
    tens: n => String(Math.floor(n / 10) * 10),
    // the four home cards in order, with the line each one builds from the counts ({ nOpen, nCompanies, nRoles }: open
    // US postings of both role sets, the employers behind them, the roles in the index); Find classes is open only when
    // the email opens a roster (Door.opens), and the screens draw the open cards alone (2026-11-04: no grayed card)
    verbs(email, counts, domains, campuses) {
      const c = counts || {}, V = Copy.home.verbs, fill = Copy.fill;
      return [
        { key: "jobs", href: "#/jobs", title: V.jobs.title, line: fill(V.jobs.line, { jobs: Door.thousands(c.nOpen || 0), companies: Door.hundreds(c.nCompanies || 0) }), open: true },
        { key: "skills", href: "#/skills", title: V.skills.title, line: fill(V.skills.line, { roles: Door.tens(c.nRoles || 0) }), open: true },
        { key: "classes", href: "#/classes", title: V.classes.title, line: V.classes.line, open: Door.opens(email, domains, campuses) },
        { key: "network", href: "#/network", title: V.network.title, line: V.network.line, open: true },
      ];
    },
  };
  // The role page's filters (the level control, the Says-it-sponsors chip and the drawer: employer type, graduates and
  // interns, industry, employer, location, remote): their defaults in one place, so a new role and "Reset filters" set
  // the same values. Before 2026-11-01 the drawer's "Clear all" cleared the industry, employer and location sets alone
  // while it showed for any filter on, so with only an employer type, graduates or sponsors on it did nothing. reset()
  // writes fresh values (new Sets) onto the state it is given; tests/web/role_filters.test.mjs checks every filter.
  const RoleFilters = {
    defaults: level => ({ level, employer: "all", grads: false, sponsor: false, sector: new Set(), company: new Set(), country: new Set(), remote: false, companyQuery: "" }),
    reset: (state, level) => Object.assign(state, RoleFilters.defaults(level)),
    // every filter but the level that is on: what the Filters button counts
    active: st => (st.employer === "all" ? 0 : 1) + (st.grads ? 1 : 0) + (st.sponsor ? 1 : 0) + st.sector.size + st.company.size + st.country.size + (st.remote ? 1 : 0),
    // the drawer offers the reset when anything is off its default, the level included
    changed: (st, level) => RoleFilters.active(st) > 0 || st.level !== level,
  };
  // About you's answers as home, Networking and the door read them (owner's feedback 2026-11-01): the pure rules behind
  // youAnswered, youInline and keepDoor below. `y` is state.you ({ where, stage, fields, whereFrom }), `resume` the
  // résumé on file or null. A program the door filled in (whereFrom "door") pre-fills About you's first question, so
  // home's inline questions skip it, but it does not count as having answered About you: the screens still ask the rest.
  const You = {
    // a program answered in About you, a stage, a field or a résumé on file
    answered: (y, resume) => { const v = y || {}; return !!((v.where && v.whereFrom !== "door") || v.stage || (v.fields || []).length || resume); },
    // the step to open on: the first of the questions (their keys, in order) not answered yet, else the résumé step
    // (index = keys.length); a door-filled program counts as answered here, so the program question is skipped
    firstStep: (y, keys) => { const v = y || {}; const i = keys.findIndex(k => k === "fields" ? !(v.fields || []).length : !v[k]); return i < 0 ? keys.length : i; },
    // the door's program answer folded into About you: it lands only when About you has no program of its own (none,
    // or one the door filled earlier). The new answers object, or null when nothing changes.
    fromDoor: (y, where) => { const v = y || {}; if (!where || (v.where && v.whereFrom !== "door") || v.where === where) return null; return { fields: [], stage: null, ...v, where, whereFrom: "door" }; },
  };
  return { parseRoute, Stage, Intake, Door, RoleFilters, You };
});
(function () {
  "use strict";
  if (typeof document === "undefined") return;   // node loads this file for parseRoute alone
  const $ = s => document.querySelector(s);
  const fill = Copy.fill, CM = Copy.common, RF = Copy.common.resume;   // the strings: web/copy.js
  const RoleFilters = Routes.RoleFilters;   // the role page's filter defaults (pure, above)
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = v => Math.round(v * 100) + "%";
  const fmt = n => Number(n).toLocaleString();
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
  const join = xs => xs.length > 1 ? xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1] : xs[0] || "";
  const cap = t => t.replace(/^./, c => c.toUpperCase()), low = t => t.replace(/^./, c => c.toLowerCase());
  const inWords = v => { const S = Copy.role.shareWords; return v >= 0.9 ? S.nearlyAll : v >= 0.66 ? S.twoThirds : v >= 0.45 ? S.half : v >= 0.3 ? S.third : v >= 0.2 ? S.quarter : v >= 0.12 ? S.seventh : S.few; };
  const EV_GROUPS = Object.entries(Copy.role.evGroups);
  const LADDER_KEYS = Object.entries(Copy.role.ladderKeys);
  const STEP_TO_EV = { entry: "early", mid: "early", senior: "senior", lead: "staff" };
  // A skill's build steps are a flat list of strings (product skills) or keyed by industry ladder, each step with its
  // source ({bank: [{kind, text, source_title, url, grounding, ...}]}: MBA skills). Keyed steps are read on the role's
  // own ladder; with `other`, another industry's steps stand in, named as such. Consulting is on hold (no source agreed,
  // data/raw/build_sources.json), so nothing stands in for it. Sources are named and linked, never quoted.
  function buildSteps(s, ladder, other) {
    const B = s && s.build;
    if (!B) return { steps: [], ind: null };
    if (Array.isArray(B)) return { steps: B, ind: null };
    if ((B[ladder] || []).length) return { steps: B[ladder], ind: ladder };
    const ind = other && ladder !== "consulting" ? ["corporate", "bank"].find(k => (B[k] || []).length) : null;
    return { steps: ind ? B[ind] : [], ind };
  }
  const practise = steps => steps.find(b => typeof b === "string" ? /^project/i.test(b) : b.kind === "practise") || steps[0];
  // Every sentence about a skill comes from the data files through web/evidence_text.js (PLAN.md v14, decision 2): the
  // builder is created once over the index's kinds table. `skillText(R, row)` gives a fit row its skill node and field.
  let TXT = null;
  const textOf = kinds => TXT ||= EvidenceText.create({ kinds: kinds || {} });
  const nodeOf = (R, id) => R.skillById[id] || null;
  function gapText(R, x, fit) {
    const T = textOf(R.kinds), s = nodeOf(R, x.id); if (!s) return null;
    const shown = fit && fit.r ? fit.r.covered : new Set(); const nameOf = id => (R.skillById[id] || {}).name || id;
    return { line: T.line(s, Atlas.fieldKeys(R)), gap: T.gap(x, s, { shown, nameOf }), reads: T.reads(s, Atlas.fieldKeys(R)), thin: T.thin(s) };
  }
  function stepHtml(b) {
    if (typeof b === "string") return esc(b);
    const title = b.source_title || b.source || "";
    const src = b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title);
    return esc(b.text) + (title ? ` <span class="small muted">${esc(Copy.role.source)}${src}${b.grounding === "input only" ? esc(Copy.role.inputOnly) : ""}.</span>` : "");
  }

  // ---------- theme: the device decides unless the person overrides ----------
  const THEMES = ["system", "dark", "light"], GLYPH = { system: "◐", dark: "●", light: "○" };
  let theme = "system"; try { theme = localStorage.getItem("theme") || "system"; } catch { }
  function applyTheme(t) { theme = THEMES.includes(t) ? t : "system"; if (theme === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; const b = $("#theme"); b.textContent = GLYPH[theme]; b.title = theme === "system" ? CM.theme : fill(CM.themeSet, { theme }); }
  applyTheme(theme);
  $("#theme").onclick = () => { applyTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]); try { localStorage.setItem("theme", theme); } catch { } remountForms(); };

  // ---------- shell helpers ----------
  const main = $("#main"), aside = $("#aside"), shell = $("#shell");
  function crumbs(items) { $("#crumbs").innerHTML = items.map((it, i) => (i ? '<span class="sep">/</span>' : "") + (it[1] ? `<a href="${esc(it[1])}">${esc(it[0])}</a>` : `<span class="here">${esc(it[0])}</span>`)).join(""); document.title = (items.length ? items[items.length - 1][0] + " · " : "") + CM.title; }
  // The side column has two modes. Elsewhere it is an overlay that opens on a selection (owner's choice 8B). On a
  // role screen it is the rail (owner's decision 2026-10-24): always there, holding the legend, the person's fit and
  // the things to do with the role; a skill or posting card draws over it with "← Back". Under the breakpoint in
  // style.css the rail collapses to an edge tab and opens as the overlay.
  let railBase = null;   // a function that draws the rail's own content, so a toggle inside it redraws from the current state
  const railTab = document.createElement("button"); railTab.type = "button"; railTab.className = "rail-tab"; railTab.textContent = CM.railTab; railTab.setAttribute("aria-label", CM.railOpen); railTab.onclick = () => shell.classList.toggle("rail-open"); shell.appendChild(railTab);
  function showRail(base) { railBase = base; shell.classList.add("with-rail"); aside.classList.add("rail"); }
  function leaveRail() { railBase = null; shell.classList.remove("with-rail", "rail-open"); aside.classList.remove("rail"); }
  function showAside(html) {
    if (html == null) { if (railBase) { const y = aside.hidden ? 0 : aside.scrollTop; aside.hidden = false; aside.innerHTML = railBase(); aside.scrollTop = y; wireRail(); return; } aside.hidden = true; shell.classList.remove("with-aside"); aside.innerHTML = ""; return; }
    aside.hidden = false; if (!railBase) shell.classList.add("with-aside"); aside.innerHTML = html; aside.scrollTop = 0;
  }
  function page(html, narrow) { main.innerHTML = `<div class="page${narrow ? " narrow" : ""}">${html}</div>`; window.scrollTo(0, 0); }
  function fail(e) { console.error(e); page(`<h1>${esc(CM.failHeading)}</h1><p class="lead">${esc(fill(CM.failLine, { message: e.message }))}</p>`, true); showAside(null); }

  // ---------- tooltips (owner's choices X1 and X2, 2026-10-19) ----------
  // One box for the whole app. An ⓘ (`tip(text)`, a button with data-tip) opens it on click and never on hover;
  // Escape, a second click or a click elsewhere closes it. A visual measure (a bar, a mark: any element with
  // data-measure) explains what it shows and what that means while the pointer is over it.
  const tipBox = document.createElement("div"); tipBox.className = "tipbox"; tipBox.setAttribute("role", "tooltip"); tipBox.hidden = true; document.body.appendChild(tipBox);
  let tipFor = null, tipPinned = false;
  const tip = text => `<button type="button" class="tip" aria-label="${esc(CM.tipLabel)}" aria-expanded="false" data-tip="${esc(text)}">i</button>`;
  function showTip(el, text, pinned) {
    if (tipPinned && !pinned) return;   // a clicked ⓘ stays while the pointer wanders over bars
    if (tipFor && tipFor !== el && tipFor.hasAttribute("data-tip")) tipFor.setAttribute("aria-expanded", "false");
    tipFor = el; tipPinned = !!pinned; tipBox.textContent = text; tipBox.hidden = false;
    if (pinned) el.setAttribute("aria-expanded", "true");
    const r = el.getBoundingClientRect(), w = tipBox.offsetWidth, h = tipBox.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)), top = r.bottom + 6 + h > window.innerHeight ? r.top - h - 6 : r.bottom + 6;
    tipBox.style.left = left + "px"; tipBox.style.top = top + "px";
  }
  function hideTip() { if (tipFor && tipFor.hasAttribute("data-tip")) tipFor.setAttribute("aria-expanded", "false"); tipFor = null; tipPinned = false; tipBox.hidden = true; }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-tip]");
    if (b) { e.preventDefault(); e.stopPropagation(); if (tipFor === b && tipPinned) hideTip(); else showTip(b, b.dataset.tip, true); return; }
    if (tipPinned && !e.target.closest(".tipbox")) hideTip();
  });
  document.addEventListener("mouseover", e => { const m = e.target.closest("[data-measure]"); if (m && m !== tipFor) showTip(m, m.dataset.measure, false); });
  document.addEventListener("mouseout", e => { const m = e.target.closest("[data-measure]"); if (m && tipFor === m && !tipPinned && !m.contains(e.relatedTarget)) hideTip(); });
  window.addEventListener("scroll", () => { if (tipFor && !tipPinned) hideTip(); }, { passive: true });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (tipFor) { hideTip(); return; }
    if (state.more && $("#drawer")) { state.more = false; keepScroll(renderRole); return; }
    if (state.selected && !aside.hidden) select(null, Routes.parseRoute(location.hash).name !== "role");
  });

  // ---------- router ----------
  const state = { roleId: null, R: null, level: "all", employer: "all", selected: null, query: "", shown: 40, evTab: null, open: new Set(), you: null, resume: null, rough: null, match: null, fitLevel: null, course: null, paint: null, sector: new Set(), company: new Set(), country: new Set(), remote: false, more: false, companyQuery: "", grads: false, areaOpen: null, areaMore: new Set(), tab: "skills", fitTab: "show", empOpen: new Set(), cardTab: null, cardMore: false, fitMore: new Set(), group: null, fit: null, gapOpen: null, wait: null, sponsor: false, posting: null, postingOpen: false };
  const PAGE = 8;   // employers shown in the postings tab before "Show more"
  // Owner's choice 2026-10-23: the postings stay in the data and behind every number, but the interface stays high
  // level for now: no postings tab, no link out to a posting, no list of postings on a skill card, no filter by
  // employer name. Flip this to bring them back.
  const POSTINGS = false;
  // what the person told us and the resume they dropped stay in this browser; the resume text alone leaves it, once
  // per upload, for the model read (inferResume below, web/infer.js), and the route stores nothing
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  state.you = store.get("you"); state.resume = store.get("resume");
  if (state.resume) Atlas.useInferred(state.resume.text, state.resume.inferred || []);
  // Funnel counts (web/capture.js): an event name, the session id, the stage and the program group, a role or field id.
  // Never text, a skill id or a file name. Everything is a no-op when CONFIG.CAPTURE_ENABLED is off.
  const track = (name, ctx) => { if (window.Capture) { Capture.event(name, { stage: (state.you || {}).stage, program: (state.you || {}).where, ...(ctx || {}) }); if (ACTIONS.has(name)) Capture.action(); } };
  // the meaningful actions the feedback prompt counts (web/capture.js Capture.action): a thing opened or read, never a screen drawn
  const ACTIONS = new Set(["role", "fit", "course_read", "event_prep", "classes", "play", "posting_link", "resume_read", "you_done", "home_jobs", "home_skills", "home_classes", "home_network"]);
  if (window.Capture) Capture.watch();   // the heartbeat: visible, active time per screen
  const waitCtx = () => ({ role_id: state.roleId, stage: (state.you || {}).stage, program: (state.you || {}).where, fields: (state.you || {}).fields || [] });
  // a posting link (decision 8 of the pass: visible on the fit screen and the rail's gap rows for a person with a resume)
  document.addEventListener("click", e => { const a = e.target.closest("[data-posting]"); if (a) track("posting_link", { role_id: a.dataset.posting }); });
  const LEVEL_OPT = { entry: "associate", mid: "mid", senior: "senior", lead: "lead" };
  // what the Spring 2027 screens (classes.js) draw with; gapsFor hands them the person's gaps for a role (step 3 of the
  // demand-gen pass): the fit on screen when it is this role's, else the matcher at the default level, cached per role;
  // applyBox, applyLine and wireApply draw the intake box at the picker's foot (v18 step 1, the intake since v19 B5);
  // resumeForm, wireResume, takeResume and hasResume let the picker hold the shell's resume form when none is on file (v19 B3, C1)
  const shellCtx = { crumbs, page, showAside, gapsFor: roleId => gapsFor(roleId), applyBox: (what, opts) => applyBox(what, opts), applyLine: label => Intake.gapsLine(label), wireApply: (el, redraw) => wireWait(el, redraw), resumeForm: () => resumeForm(), wireResume: () => wireResumeForm(), takeResume: () => takeResume(), hasResume: () => !!state.resume, flag: () => campusGate().flag };
  // what the door kept, in this browser only: the email, the program group, and that the door was seen once
  const doorKept = () => { try { return { email: localStorage.getItem("door.email") || "", where: localStorage.getItem("door.where") || "", seen: localStorage.getItem("door.seen") === "1" }; } catch { return { email: "", where: "", seen: false }; } };
  // The campus gate (2026-11-04): the door's email read for its flag (Door.campus, web/config.js CAMPUS_DOMAINS) and
  // whether that flag has a listed campus with a loaded roster (Door.opens over Catalog.campuses(), which honors
  // `enabled_by`). The campus list loads once before the first route draws (route() waits for it), so the top bar,
  // home, the routes and Networking read it synchronously. { flag, open, campus: the roster's campus entry or null }
  let CAMPUSES = null;
  const campusesP = Promise.resolve(window.Catalog ? Catalog.campuses() : []).catch(e => { console.error(e); return []; }).then(l => (CAMPUSES = l || []));
  const campusGate = () => { const email = doorKept().email, flag = Door.campus(email), campus = Door.rosterOf(flag, CAMPUSES || []); return { flag, open: !!campus, campus }; };
  // The four verbs in the top bar (v19 B2), drawn on every route: the current one marked, Find classes only when the
  // email on file opens a roster (Door.opens); for any other visitor it is not there at all. The brand goes home. A screen the verbs will absorb (Explore, a field, a role,
  // its fit and course screens) marks Explore careers; an event screen marks Networking; the classes screens Find classes.
  const VERB_OF = { jobs: "jobs", skills: "skills", map: "skills", explore: "skills", field: "skills", role: "skills", fit: "skills", course: "skills", play: "skills", network: "network", event: "network", classes: "classes", professor: "classes" };
  function topBar(name) {
    const el = $("#verbs"); if (!el) return;
    const on = VERB_OF[name] || null;
    el.innerHTML = Door.verbs(doorKept().email, {}, null, CAMPUSES || []).filter(v => v.open).map(v => `<a class="toplink${on === v.key ? " on" : ""}" href="${esc(v.href)}"${on === v.key ? ' aria-current="page"' : ""}>${esc(Door.COPY.bar[v.key] || v.title)}</a>`).join("");
  }
  // the Tally forms on screen (web/doors.js handles): dropped when the route changes, so no clock or listener outlives
  // its screen
  const mounts = new Set();
  const unmount = all => { for (const h of mounts) if (all || !(h.el && h.el.isConnected)) { h.destroy(); mounts.delete(h); } };
  // The theme the Tally forms take (2026-11-01): the page's override, else the device's (Doors.themeOf). CONFIG.TALLY
  // holds a light and a dark form per kind, since a Tally theme is per form; mountForm mounts the one for the theme in
  // effect and keeps its options, and a theme change (the toggle, or the device's while the toggle says system) mounts
  // every form on screen again when the new theme has another form. A box that fell back to the native form stays:
  // the native form follows the theme by CSS.
  const formTheme = () => window.Doors ? Doors.themeOf() : "light";
  function mountForm(slot, kind, opts) {
    const h = Doors.mount(slot, kind, { ...opts, theme: formTheme() });
    mounts.add(Object.assign(h, { el: slot, opts }));
    return h;
  }
  function remountForms() {
    if (!window.Doors) return;
    const t = formTheme();
    for (const h of [...mounts]) {
      if (h.native || !h.opts || !(h.el && h.el.isConnected) || h.theme === t || Doors.formIdFor(h.kind, null, t) === h.formId) continue;
      h.destroy(); mounts.delete(h); mountForm(h.el, h.kind, h.opts);
    }
  }
  try { const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)"); if (mq) { if (mq.addEventListener) mq.addEventListener("change", remountForms); else if (mq.addListener) mq.addListener(remountForms); } } catch { }
  // the door's Tally return (#/home?email=…&where=…) passes the door: it is the door's own answer coming back
  const returned = hash => !!(window.Doors && Routes.parseRoute(hash).name === "home" && (Doors.returnQuery(hash).email || Doors.returnQuery(hash).where));
  // the apprentice maps (CONFIG.MAPS_ENABLED, web/auth.js): the one private thing on the site
  const mapsOn = () => !!((window.CONFIG || {}).MAPS_ENABLED && window.Auth);
  const toHash = h => location.replace(location.pathname + location.search + h);   // replaced, not pushed: Back leaves as it came
  function route() {
    if (!CAMPUSES) { campusesP.then(route); return; }   // the campus gate reads the campus list: once, before the first draw
    // a magic link lands with its tokens in the hash (#access_token=…, or #/map#access_token=…): web/auth.js keeps the
    // session and the hash becomes #/map before anything parses it; a spent or expired link lands on the sign-in
    const landed = window.Auth && mapsOn() ? Auth.takeHash(location.hash) : null;
    if (landed) history.replaceState(null, "", location.pathname + location.search + (landed === "session" ? "#/map" : "#/signin?expired=1"));
    const parsed = Routes.parseRoute(location.hash);
    unmount(true);
    // a deep link bounces to the door once (v19 B2): the hash stays, the door draws over it, and Continue or Skip
    // (Door.next) lands on the hash. The sign-in and the map never bounce: an invited person comes from the email.
    const invited = mapsOn() && (parsed.name === "signin" || parsed.name === "map");
    // #/classes and #/professor/<slug> are home for a visitor whose address opens no roster (Door.reach, 2026-11-04):
    // the URL is rewritten too, so the address bar never says a screen the person cannot reach
    const name0 = !invited && Door.bounce(location.hash, doorKept().seen || returned(location.hash)) ? "door" : parsed.name;
    const name = Door.reach(name0, campusGate().open), { id, slug } = parsed.params;
    if (name !== name0) { toHash("#/home"); return; }
    // #/jobs, #/skills and #/network exist so the hrefs never change: #/jobs is Find jobs (B4), #/skills the launcher
    // and #/network Who to meet (B5); #/explore, a field and the event screen stay at their routes
    const go = { door, home, jobs: jobsScreen, skills: skillsScreen, network: networkScreen, you, explore, field: () => field(id), event: () => eventScreen(id), role: () => roleScreen(id), fit: () => fitScreen(id), course: () => courseScreen(id), play: () => play(slug), about, classes: () => ClassScreens.classes(shellCtx), professor: () => ClassScreens.professor(slug, shellCtx), signin: () => mapsOn() ? signinScreen() : ClassScreens.signin(shellCtx), map: mapScreen }[name];
    SkillMap.leave(); leaveRail(); topBar(name);
    // every route is a screen event (2026-11-05, web/capture.js SCREENS; the drop-off report counts them): the launcher
    // sends the same event Explore sends, since it is the screen that picks a role; the door sends `door` (v19 B7) and
    // `door_passed` itself when Continue or Skip goes through; the rest carry the id on screen
    const ctx = { door: { surface: "door" }, field: { field_id: id }, event: { field_id: id }, role: { role_id: id }, play: { role_id: slug } }[name] || {};
    const ev = window.Capture ? Capture.screen(name) : null;
    if (ev) track(ev, ctx);
    go().catch(fail);
  }
  window.addEventListener("hashchange", route);

  // ---------- 1. the door and home (v19 B2) ----------
  // the games list, for a game's own screen (web/data/games.json)
  let gamesP = null;
  const games = () => gamesP ||= Atlas.fetchJson("data/games.json").catch(() => []);
  // the role count both screens say: the roles the index shows, the product set's six among them once its file is
  // loaded; until then the index's own families table (which counts the two product-group families the product set
  // stands in for) is the floor, so the number never dips while the file loads
  const roleCount = ix => Math.max(Object.keys(ix.roles).length, Object.keys(ix.M.families || {}).length);
  // The one count of open postings every screen says (owner's feedback 2026-11-01: home said "over 31 thousand" while
  // the footer said 25,950, the MBA set alone): the open US postings of both role sets that Find jobs searches, and
  // the employers behind them. data/jobs_meta.json carries the two numbers beside the Find jobs file (224 bytes, B4;
  // pipeline.jobs_open asserts n_open is the row count of jobs_open.json and tests/web/jobs.test.mjs checks it), so
  // home, #/about and the Find jobs lead (rows.length, D.companies.length) agree. When the meta file is missing the
  // Find jobs file itself is counted, never another index's number. Home says it in words, rounded down ("over").
  let jobsMetaP = null;
  const jobsMeta = () => jobsMetaP ||= Atlas.fetchJson("data/jobs_meta.json").catch(() => null);
  const openCounts = () => jobsMeta().then(jm => jm && jm.n_open > 0 && jm.n_companies > 0 ? { nOpen: jm.n_open, nCompanies: jm.n_companies }
    : jobsData().then(J => ({ nOpen: J.rows.length, nCompanies: J.D.companies.length })).catch(() => ({ nOpen: 0, nCompanies: 0 })));
  const homeCounts = (ix, n) => ({ nOpen: n.nOpen, nCompanies: n.nCompanies, nRoles: roleCount(ix) });
  // what the door keeps, in this browser only (door.email, door.where, door.seen); a program answer also fills About
  // you's first question when About you has no program of its own (You.fromDoor: marked whereFrom "door", so home's
  // inline questions skip it and still ask the rest). The door's two buttons and the Tally return (home) go through here.
  function keepDoor(email, where) {
    try { localStorage.setItem("door.email", email); localStorage.setItem("door.where", where); localStorage.setItem("door.seen", "1"); } catch { }
    const next = WHERE[where] ? Routes.You.fromDoor(state.you, where) : null;
    if (next) { state.you = next; store.set("you", next); wiz = null; }
  }
  // the context the door's events and row carry: the session (capture.js adds it), the stage and the program group
  const doorCtx = where => ({ surface: "door", ...(where ? { program: where } : {}) });
  // The door: what GradBuddy is, what is inside, then the form: Tally's when CONFIG.TALLY.door is set (web/doors.js
  // mounts it, with the native form as the fallback after three seconds), else the native one: an email and the program
  // question, Continue, Skip for now. Both buttons keep what was typed (keepDoor) and go where the person was headed
  // (Door.next); Continue with an address also sends it with the source `door` (Doors.nativeSubmit), Skip sends
  // nothing. `door_passed` goes out when either button goes through, or when Tally reports the form submitted.
  async function door() {
    crumbs([]); showAside(null);
    const kept = doorKept();
    const C = Door.COPY;
    const nativeForm = () => `<form class="door-form" id="door-form" novalidate="">
          <label class="dlabel">${esc(C.email)}<input type="email" name="email" placeholder="${esc(C.emailPlaceholder)}" autocomplete="email" value="${esc(kept.email)}"></label>
          <label class="dlabel">${esc(C.where)}<select name="where"><option value="">${esc(C.pick)}</option>${Q[0].options.map(([id, label]) => `<option value="${esc(id)}"${kept.where === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
          <p class="small muted" style="margin:0">${esc(C.school)}</p>
          <p class="door-acts"><button type="submit" class="btn primary">${esc(C.button)}</button><a class="door-skip" href="${esc(Door.next(location.hash))}" id="door-skip">${esc(C.skip)}</a></p>
        </form>`;
    const tally = !!(window.Doors && Doors.formIdFor("door", null, formTheme()));
    page(`<section class="door">
        <h1>${esc(C.heading)}</h1>
        ${C.intro.map(t => `<p class="lead">${esc(t)}</p>`).join("")}
        <p class="lead">${esc(C.inside)}</p>
        <div class="door-slot" id="door-slot">${tally ? "" : nativeForm()}</div>${tally ? `<p class="small muted door-loading" id="door-loading">${esc(CM.loadingForm)}</p>` : ""}
        ${tally ? "" : `<p class="small muted door-privacy">${esc(C.privacy)}</p>`}
      </section>`, true);
    const go = () => { const next = Door.next(location.hash); if (location.hash === next) route(); else location.hash = next; };
    const passed = where => track("door_passed", doorCtx(where));
    const wireNative = () => {
      const form = $("#door-form"); if (!form) return;
      form.onsubmit = e => {
        e.preventDefault(); const em = form.email; if (em.value.trim() && !em.checkValidity()) { em.reportValidity(); return; }
        const email = em.value.trim(), where = form.where.value;
        keepDoor(email, where);
        if (email && window.Doors) Doors.nativeSubmit("door", { email, where, ctx: { stage: (state.you || {}).stage, ...doorCtx(where) } });
        passed(where); go();
      };
      $("#door-skip").onclick = e => { e.preventDefault(); const where = form.where.value; keepDoor(form.email.value.trim(), where); passed(where); go(); };
    };
    if (!tally) { wireNative(); return; }
    const slot = $("#door-slot"), dropLoading = () => { const p = $("#door-loading"); if (p) p.remove(); };
    mountForm(slot, "door", {
      hidden: { surface: "door", source: "door", email: kept.email },
      native: nativeForm,
      onLoaded: dropLoading,
      onFallback: () => { dropLoading(); wireNative(); },
      // Tally keeps the answers; the door counts as seen, and the return (#/home?email=…&where=…) fills the rest
      onSubmitted: () => { try { localStorage.setItem("door.seen", "1"); } catch { } passed(""); },
    });
  }
  // Home: the verbs as a grid, one data-built line each: four for an address that opens a roster, else three (Find
  // classes is not drawn at all, 2026-11-04; the grid's n3 class lays three in one row from 1280 px). Under them, About you (owner's feedback 2026-11-01): the three questions and the résumé drop inline
  // (youInline) until any is answered, then the one-line summary with Edit to #/you (youLine). The door's Tally form
  // comes back here with its answers in the query (#/home?email=…&where=…): read once, kept as the door keeps them,
  // and the hash cleaned before anything draws. A card click sends home_<verb> before the screen changes.
  async function home() {
    crumbs([]); showAside(null);
    if (window.Doors) {
      const ret = Doors.returnQuery(location.hash);
      // Tally returns the option's label, not its id: map it back (whereId) before keeping it
      if (ret.email || ret.where) { keepDoor(ret.email, whereId(ret.where)); history.replaceState(null, "", location.pathname + location.search + Doors.clearQuery(location.hash)); }
    }
    const [ix, n] = await Promise.all([Atlas.index(), openCounts()]);
    const C = Door.COPY;
    let doneHere = false;   // finished or skipped the inline questions on this visit: the summary, even with nothing answered
    const drawYou = () => {
      const body = $("#home-you-body"); if (!body) return;
      if (doneHere || youAnswered()) body.innerHTML = youLine(ix);
      else youInline(body, { onDone: () => { doneHere = true; drawYou(); } }).catch(console.error);
    };
    const render = () => {
      const cards = Door.verbs(doorKept().email, homeCounts(ix, n), null, CAMPUSES || []).filter(v => v.open)
        .map(v => `<a class="verb" href="${esc(v.href)}" data-verb="${esc(v.key)}"><span class="t">${esc(v.title)}</span><span class="d">${esc(v.line)}</span></a>`);
      page(`<h1>${esc(C.home)}</h1><div class="verbs n${cards.length}">${cards.join("")}</div>
        <section class="home-you" aria-labelledby="home-you-h"><h2 id="home-you-h">${esc(YOU.inline.heading)}</h2><div id="home-you-body"></div></section>`);
      main.firstElementChild.classList.add("home-page");
      main.querySelectorAll("a.verb[data-verb]").forEach(a => a.onclick = () => track("home_" + a.dataset.verb, { surface: a.dataset.verb }));
      drawYou();
    };
    render();
  }
  // ---------- 1b. Explore careers (v19 B5, owner's pick S5; "Explore roles & build skills" until 2026-11-01): the launcher ----------
  // Every role by field on the left two thirds (a prefix search over all of them, the field tiles, a field's roles
  // under the tiles), the résumé on the right third, sticky; one column under 900 px. The pure parts are
  // web/launcher.js. With a résumé on file the right third reads it against the three roles the rough read puts
  // closest (Atlas.roughFit) and the role the person chose, each through the matcher as the rail reads it
  // (matchRole), and says "N of M", never a score. The hash keeps the field open and the query
  // (#/skills?field=…&q=…), written with replaceState.
  const matchCache = new Map();   // roleId|résumé text -> one matcher run per role per résumé: { roleId, label, n, m, band, r, R }
  async function matchRole(id) {
    const key = id + "|" + state.resume.text;
    if (matchCache.has(key)) return matchCache.get(key);
    const R = await Atlas.role(id); const { M, bands, group } = await Atlas.matcher(R);
    const level = defaultLevel(), slice = level === "all" ? R.jobs : R.jobs.filter(j => Atlas.stepOf(j) === level);
    const r = M.match(state.resume.text, { jobs: slice, familyJobs: R.jobs, label: R.role.label }, { level: LEVEL_OPT[level], ladder: R.role.ladder });
    const c = Launcher.coreOf(r.rows);
    const out = { roleId: R.role.id, label: R.role.label, n: c.n, m: c.m, band: Matcher.bandOf(r.overall, bands, group) || null, r, R };
    matchCache.set(key, out); return out;
  }
  // a match result's gap rows in the shape gapRows reads (what gapsFor builds for the picker)
  const rowsOf = r => { const rows = r.rows, by = st => rows.filter(x => x.status === st && x.tier !== "diff"); return { coreGaps: rows.filter(x => x.tier === "core" && (x.status === "gap" || x.status === "thin")).sort((a, b) => b.w - a.w), gaps: by("gap"), thin: by("thin") }; };
  // the roles the résumé reads closest to (the three the rough read ranks first) and the role the person chose, each
  // read through the matcher; the chosen role is the role screen's or the picker's, else the closest
  async function closestFits(ix) {
    const rg = await rough();
    const ids = Object.entries(rg.scores).filter(([id, sc]) => sc > 0 && ix.roles[id]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
    let chosen = chosenRole(); if (chosen && !ix.roles[chosen]) chosen = Atlas.productKey(chosen); if (!ix.roles[chosen]) chosen = ids[0] || null;
    const fits = await Promise.all([...new Set([...ids, ...(chosen ? [chosen] : [])])].map(matchRole));
    return { text: state.resume.text, chosen: fits.find(f => f.roleId === chosen) || fits[0] || null, rows: Launcher.closestRoles(ix, fits.filter(f => ids.includes(f.roleId)), 3) };
  }
  async function skillsScreen() {
    const C = Launcher.COPY;
    crumbs([[CM.home, "#/home"], [C.heading, null]]); showAside(null);
    page(`<h1>${esc(C.heading)}</h1><p class="lead">${esc(CM.loadingRoles)}</p>`);
    const here = () => Routes.parseRoute(location.hash).name === "skills";
    // E1 (the build plan's B2): a signed-in person with a map opens it first; #/skills?all=1 is the launcher behind
    // it, with the way back in the slot above the field tiles. No session: one line to the sign-in. A session and no
    // map file yet: the waiting line. MAPS_ENABLED off: the launcher as it was.
    const all = Routes.parseRoute(location.hash).query.all === "1";
    const gate = mapsOn() ? (await mapGate()).gate : "launcher";
    if (!here()) return;
    if (gate === "map" && !all) { toHash("#/map"); return; }
    const MC = Copy.map;
    const slot = { map: `<p class="lf-slot"><a href="#/map">${esc(MC.back)}</a></p>`, signin: `<p class="lf-slot">${esc(MC.invite)} <a href="#/signin">${esc(MC.inviteLink)}</a></p>`, waiting: `<p class="lf-slot">${esc(MC.waiting)}</p>` }[gate] || "";
    const ix = await Atlas.index(); await Atlas.product().catch(console.error);   // the Product tile carries its roles
    if (!here()) return;
    const F = Launcher.fields(ix), q0 = Routes.parseRoute(location.hash).query;
    const s = { q: q0.q || "", field: F.some(f => f.id === q0.field) ? q0.field : null, change: false };
    const writeHash = () => { const p = new URLSearchParams(); if (all) p.set("all", "1"); if (s.q.trim()) p.set("q", s.q.trim()); if (s.field) p.set("field", s.field); const next = "#/skills" + (p.toString() ? "?" + p : ""); if (location.hash !== next) history.replaceState(null, "", location.pathname + location.search + next); };
    // ---- the left two thirds: the search, the tiles, a field's roles ----
    const row = (r, withField) => `<a class="r" href="#/role/${esc(r.id)}"><span class="t">${esc(r.label)}</span><span class="n">${esc(Launcher.fill(C.open, { open: fmt(r.nOpen) }))}</span><span class="m">${withField && r.field ? esc(r.field.label) + " · " : ""}${r.asks.length ? esc(Launcher.fill(C.asks, { asks: r.asks.join(", ") })) : ""}</span></a>`;
    const tiles = on => `<div class="fcards lf-tiles">${F.map(f => `<button type="button" class="fcard${on === f.id ? " on" : ""}" data-field="${esc(f.id)}" aria-pressed="${on === f.id}"><span class="t">${esc(f.label)}</span><span class="n">${esc(Launcher.fill(C.tile, { roles: f.roles.length, open: fmt(f.nOpen) }))}</span></button>`).join("")}</div>`;
    const left = () => {
      if (s.q.trim()) { const hits = Launcher.searchRoles(ix, s.q); return hits.length ? `<p class="lf-lab">${esc(Launcher.hitsLine(hits.length))}</p><div class="list">${hits.map(r => row(r, true)).join("")}</div>` : `<p class="lf-lab">${esc(C.noHit)}</p>${tiles(null)}`; }
      // a picked field's roles take the tiles' place (owner, 2026-11-01), with the way back to the tiles above them
      const f = F.find(x => x.id === s.field);
      if (f) return `<p class="lf-lab"><button type="button" class="linkish link lf-back" id="lf-back">${esc(C.backToFields)}</button></p><section class="lf-field"><h2>${esc(f.label)}</h2><p class="small muted">${esc(Launcher.fill(C.fieldLine, { roles: f.roles.length, open: fmt(f.nOpen) }))}</p><div class="list">${f.roles.map(r => row(r, false)).join("")}</div></section>`;
      return `<p class="lf-lab">${esc(C.pickField)}</p>${tiles(null)}`;
    };
    // ---- the right third: the résumé form, or the light match once it is read ----
    let light = null;   // closestFits for the résumé on file
    const you = `<p class="small muted lf-you"><a href="#/you">${esc(C.you)}</a></p>`;
    const right = () => {
      if (!state.resume || s.change) return `<section class="lf-step"><h2>${esc(C.resume.heading)}</h2><p class="small muted">${esc(C.resume.privacy)}</p>${resumeForm()}<p><button type="button" class="btn primary" id="lf-read">${esc(C.resume.read)}</button></p>${you}</section>`;
      const onFile = `<p class="small muted">${esc(state.resume.name)} · ${esc(C.resume.onFile)} · <button type="button" class="linkish link" id="lf-change">${esc(C.resume.change)}</button></p>`;
      if (!light || light.text !== state.resume.text) return `<section class="lf-step"><h2>${esc(C.resume.heading)}</h2>${onFile}<p class="small muted">${esc(light && light.failed ? C.resume.failed : C.resume.reading)}</p>${you}</section>`;
      const top = light.chosen; if (!top) return `<section class="lf-step"><h2>${esc(C.resume.heading)}</h2>${onFile}<p class="small muted">${esc(C.resume.noClose)}</p>${you}</section>`;
      const L = Launcher.matchLines(top);
      const inf = top.r ? Launcher.coreOf(top.r.rows).shown.filter(x => x.status === "inferred").length : 0;   // the model read's part (web/infer.js)
      return `<section class="lf-step"><h2>${esc(C.resume.heading)}</h2>${onFile}
        ${L.bandLabel ? `<p><b>${esc(L.bandLabel)}</b> for ${esc(top.label)}.</p>` : ""}
        <p>${esc(L.line)}</p>${inf ? `<p class="small muted">◈ ${esc(fill(C.resume.inferred, { n: inf }))}</p>` : ""}
        <p><a class="btn primary" href="#/role/${esc(top.roleId)}/fit">${esc(L.fitLink)}</a></p>
        ${light.rows.length ? `<h3>${esc(C.resume.closest)}</h3><div class="list">${light.rows.map(x => `<a class="r" href="#/role/${esc(x.id)}/fit"><span class="t">${esc(x.label)}</span><span class="n">${x.n} of ${x.m}</span></a>`).join("")}</div><p class="small muted">${esc(C.resume.ranked)}</p>` : ""}
        ${you}</section>`;
    };
    const wireLeft = () => {
      main.querySelectorAll("[data-field]").forEach(b => b.onclick = () => { s.field = b.dataset.field; s.q = ""; $("#lf-q").value = ""; drawLeft(); });
      const back = $("#lf-back"); if (back) back.onclick = () => { s.field = null; drawLeft(); };
    };
    const drawLeft = () => { $("#lf-body").innerHTML = left(); wireLeft(); writeHash(); };
    const wireRight = () => {
      if ($("#drop")) { wireResumeForm(); $("#lf-read").onclick = async () => { if (await takeResume()) { s.change = false; drawRight(); } else $("#file-status").textContent = RF.nothing; }; }
      const ch = $("#lf-change"); if (ch) ch.onclick = () => { s.change = true; drawRight(); };
    };
    const drawRight = () => {
      $("#lf-side").innerHTML = right(); wireRight();
      if (state.resume && !s.change && (!light || light.text !== state.resume.text)) { const text = state.resume.text; closestFits(ix).then(res => { if (!here() || !state.resume || state.resume.text !== text) return; light = res; drawRight(); }).catch(e => { console.error(e); if (here()) { light = { text, failed: true, chosen: null, rows: [] }; $("#lf-side").innerHTML = right(); wireRight(); } }); }
    };
    page(`<h1>${esc(C.heading)}</h1><p class="lead lf-lead">${esc(Launcher.lead(ix))}</p>
      <div class="lf"><section class="lf-main" aria-label="${esc(C.rolesAria)}"><input type="search" class="lf-q" id="lf-q" value="${esc(s.q)}" placeholder="${esc(C.search)}" aria-label="${esc(C.searchLabel)}" autocomplete="off">${slot}<div id="lf-body"></div></section><div class="lf-side" id="lf-side"></div></div>`);
    main.firstElementChild.classList.add("wide", "lf-page");
    let timer = null;
    $("#lf-q").oninput = e => { clearTimeout(timer); timer = setTimeout(() => { s.q = e.target.value; drawLeft(); }, 150); };
    drawLeft(); drawRight();
  }

  // ---------- 1b'. The apprentice map: the sign-in and #/map (the build plan's B2; web/auth.js) ----------
  // The map is read once per page and per person; a missing file is not kept, so the next visit reads again.
  let mapHeld = null;   // { uid, map }
  // where the person stands: MapGate's answer ("signin", "map", "waiting"), or "failed" when the read failed
  async function mapGate() {
    const session = await Auth.session();
    if (!session) return { gate: MapGate.next({ enabled: true, session: null }), map: null };
    let map = mapHeld && mapHeld.uid === session.uid ? mapHeld.map : null;
    if (!map) {
      try { map = await Auth.readMap(session); if (map) mapHeld = { uid: session.uid, map }; }
      catch (e) { console.error(e); return { gate: "failed", map: null }; }
    }
    return { gate: MapGate.next({ enabled: true, session, hasMap: !!map }), map };
  }
  // #/signin, invited mode: an email, Send me a link, then the sent state, the refused line or the plain failure. A
  // session already on file goes to the map. GoTrue sends the link to an existing user only (web/auth.js).
  async function signinScreen() {
    const S = Copy.signin;
    crumbs([[CM.home, "#/home"], [S.crumb, null]]); showAside(null);
    if (Auth.stored()) { toHash("#/map"); return; }
    const expired = Routes.parseRoute(location.hash).query.expired === "1";
    page(`<h1>${esc(S.heading)}</h1><p class="lead">${esc(S.lead)}</p>${expired ? `<p class="si-no">${esc(S.expired)}</p>` : ""}
      <form class="si" id="si" novalidate><input type="email" id="si-email" required autocomplete="email" placeholder="${esc(S.emailPlaceholder)}" aria-label="${esc(S.email)}"><button class="btn primary" type="submit" id="si-send">${esc(S.button)}</button></form>
      <div class="si-out" id="si-out" aria-live="polite"></div>
      <p class="small muted si-note">${esc(S.note)} <a href="#/skills">${esc(S.explore)}</a></p>`, true);
    const out = $("#si-out"), send = $("#si-send");
    $("#si").onsubmit = async e => {
      e.preventDefault();
      const email = $("#si-email").value.trim();
      send.disabled = true; out.innerHTML = `<p class="small muted">${esc(S.sending)}</p>`;
      const r = await Auth.sendLink(email);
      send.disabled = false;
      if (Routes.parseRoute(location.hash).name !== "signin") return;
      out.innerHTML = r.ok ? `<div class="wait"><b>${esc(S.sent)}</b><p class="small muted">${esc(fill(S.sentTo, { email }))}</p></div>` : `<p class="si-no">${esc(r.message || S.failed)}</p>`;
    };
  }
  // #/map: with a session and a map, the map (B3, below); with a session and no map file, the waiting line and the
  // launcher link; without a session, the sign-in; with MAPS_ENABLED off, the launcher
  async function mapScreen() {
    const MC = Copy.map;
    crumbs([[CM.home, "#/home"], [MC.crumb, null]]); showAside(null);
    if (!mapsOn()) { toHash("#/skills"); return; }
    page(`<h1>${esc(MC.heading)}</h1><p class="lead">${esc(MC.loading)}</p>`, true);
    const g = await mapGate();
    if (Routes.parseRoute(location.hash).name !== "map") return;
    if (g.gate === "signin") { toHash("#/signin"); return; }
    const others = `<a href="#/skills?all=1">${esc(MC.others)}</a>`, out = `<button type="button" class="linkish link" id="map-out">${esc(MC.signOut)}</button>`;
    if (g.gate === "map") {
      const ix = await Atlas.index().catch(e => { console.error(e); return null; });   // what a skill is, its area, the co-asked pairs
      if (Routes.parseRoute(location.hash).name !== "map") return;
      drawMap(g.map, ix, others, out);
    } else {
      page(`<h1>${esc(MC.heading)}</h1><p class="lead">${esc(g.gate === "failed" ? MC.failed : MC.waiting)}</p><p>${others}</p><p class="small muted">${out}</p>`, true);
      main.firstElementChild.classList.add("roomy");
    }
    $("#map-out").onclick = async () => { mapHeld = null; mapUi = null; await Auth.signOut(); location.hash = "#/skills"; };
  }

  // ---------- 1b''. The map screen (the build plan's B3; the pure parts are web/map.js) ----------
  // D1 the read at the top; the legend bar; two tabs, "Your quests" (Q1 on <svg>) first and "Your skill tree" (T4 on
  // <svg>); the "How you work" line and the more skills under the tree; a stop or a mission title opens the card (K1)
  // in the side panel with the feedback control (F1) at its foot; a node opens the node panel with its "asked together
  // with" lines drawn on the tree while it is open; a shipped mission's skills take the fifth look (P1); Print draws
  // the one-page sheet (@media print). The map file is the truth: the screen never rewrites it, and the person's own
  // answers (read once per card, Auth.readFeedback) only mark a stop until the owner republishes.
  let mapUi = null;   // { map, M (the index as map.js reads it), tab, mine, asked, panel, catalog }
  const SVG_NS = "http://www.w3.org/2000/svg";
  const stCls = s => ({ "shows": "st-shows", "shows in other words": "st-other", "must evidence better": "st-half", "must build": "st-build" })[s] || "st-build";
  const lookCls = n => n.shipped ? "st-built" : stCls(n.state);
  const lookWords = n => n.shipped ? n.shipped.label : Copy.map.states[n.state] || n.state;
  const hoursWords = h => Number(h) === 1 ? Copy.map.card.hourOne : fill(Copy.map.card.hoursValue, { hours: h });
  const sdot = n => `<span class="sdot ${lookCls(n)}" aria-hidden="true"></span>`;
  const msMark = (st, extra) => `<span class="mk ms-${st}${extra ? " " + extra : ""}" aria-hidden="true"></span>`;
  const diamond = `<svg class="mk-p" width="9" height="9" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 0 8 4 4 8 0 4Z"/></svg>`;
  const chevron = `<svg class="mk-s" width="11" height="8" viewBox="0 0 11 8" aria-hidden="true"><path d="M1.5 6.5 5.5 2.5 9.5 6.5"/></svg>`;
  const hostOf = url => { try { return new URL(url).host.replace(/^www\./, ""); } catch { return String(url || ""); } };
  const researchWords = f => String(f || "").replace(/\.md$/, "").replace(/[_-]+/g, " ");
  const todayIso = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const safeUrl = u => /^https?:\/\//i.test(String(u || "")) ? String(u) : "#";
  function svgEl(tag, attrs, parent, text) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  // a name on at most two lines, cut at the space nearest the middle
  function wrap2(s) {
    if (s.length <= 24) return [s];
    let best = -1;
    for (let i = 0; i < s.length; i++) if (s[i] === " " && (best < 0 || Math.abs(i - s.length / 2) < Math.abs(best - s.length / 2))) best = i;
    return best < 0 ? [s] : [s.slice(0, best), s.slice(best + 1)];
  }
  const onMap = () => Routes.parseRoute(location.hash).name === "map" && mapUi && $("#map-body");
  const mapWorlds = () => MapModel.worlds(mapUi.map, mapUi.mine);
  const roleLabel = id => ((mapUi.tree.roles.find(r => r.id === id) || {}).label) || id;
  const trackLabel = id => { const t = (mapUi.map.tracks || []).find(x => x.id === id); return t ? t.label : ""; };

  function drawMap(map, ix, others, out) {
    const MC = Copy.map, st = map.student || {}, role = (map.role || {}).label || "", company = (map.company || {}).name || "";
    const M = ix ? { skillById: ix.skillById, edges: ix.M.edges, clusters: ix.M.clusters, reads: (s, keys) => textOf(ix.M.meta.kinds).reads(s, keys) } : {};
    const q = Routes.parseRoute(location.hash).query;
    mapUi = { map, M, tree: MapModel.classTree(map), tab: q.tab === "tree" ? "tree" : "quests", mine: {}, asked: new Set(), panel: null, catalog: null };
    const R = MapModel.readLines(map, M);
    const groups = R.groups.map(g => `<div class="rd-group">${g.line ? `<q class="rd-line" title="${esc(g.line)}">${esc(g.line)}</q>` : ""}<ul class="rd-skills">${g.skills.map(s => `<li><button type="button" class="linkish" data-node="${esc(s.id)}">${sdot(s)}${esc(s.name)}${s.state === "shows in other words" ? ` <span class="muted rd-st">${esc(MC.inOtherWords)}</span>` : ""}</button></li>`).join("")}</ul></div>`).join("");
    const gaps = R.gaps.map(g => `<li class="rd-gap"><p class="rd-gname"><button type="button" class="linkish" data-node="${esc(g.id)}">${sdot(g)}${esc(g.name)}</button> <span class="muted rd-st">${esc((MC.states[g.state] || "").toLowerCase())}</span></p>
      ${g.sentence ? `<p class="rd-gsent">${esc(g.sentence)}</p>` : ""}<p class="rd-gm">${g.mission ? `<span class="rd-world">${esc(g.world)}</span><button type="button" class="rd-mission" data-card="${esc(g.mission.id)}">${esc(g.mission.title)}</button>` : `<span class="muted">${esc(g.none)}</span>`}</p></li>`).join("");
    page(`<div class="map-head"><h1>${esc(st.name_on_page ? fill(MC.title, { name: st.name_on_page }) : MC.heading)}</h1><p class="map-top">${others}<button type="button" class="btn map-print-btn" id="map-print">${esc(MC.print)}</button></p></div>
      ${role ? `<p class="lead map-lead">${esc(company ? fill(MC.roleAt, { role, company }) : role + ".")}</p>` : ""}
      <section class="rd">
        ${R.headline ? `<p class="rd-band">${fill(esc(MC.band), { band: `<b>${esc(R.band)}</b>`, role: esc(role) })}</p>` : ""}
        ${role ? `<p class="small muted rd-sub">${esc(fill(MC.readSub, { role }))}</p>` : ""}
        <div class="rd-cols">
          <div><h2>${esc(MC.brings)}</h2><p class="small muted rd-hint">${esc(MC.bringsHint)}</p>${groups}</div>
          <div><h2>${esc(MC.gaps)}</h2><p class="small muted rd-hint">${esc(MC.gapsHint)}</p><ul class="rd-gaps">${gaps}</ul></div>
        </div>
        <p class="rd-quiet">${esc(MC.quiet)}</p>
      </section>
      <div class="legend-bar" id="map-legend" role="note"></div>
      <div class="map-tabs" role="tablist" aria-label="${esc(MC.tabsAria)}">${["quests", "tree"].map(t => `<button type="button" role="tab" class="map-tab" data-tab="${t}">${esc(MC.tabs[t])}</button>`).join("")}</div>
      <div id="map-body" role="tabpanel"></div>
      <p class="small muted map-only">${esc(MC.only)} ${out}</p>
      ${printSheet()}`);
    main.firstElementChild.classList.add("wide", "map-page");
    main.querySelectorAll(".map-tab").forEach(b => b.onclick = () => { mapUi.tab = b.dataset.tab; const p = new URLSearchParams(Routes.parseRoute(location.hash).search); if (mapUi.tab === "tree") p.set("tab", "tree"); else p.delete("tab"); history.replaceState(null, "", location.pathname + location.search + "#/map" + (p.toString() ? "?" + p : "")); closePanel(); drawTab(); });
    main.querySelectorAll(".rd [data-card]").forEach(b => b.onclick = () => openCard(b.dataset.card));
    main.querySelectorAll(".rd [data-node]").forEach(b => b.onclick = () => openNode(b.dataset.node));
    $("#map-print").onclick = () => window.print();
    drawTab();
  }

  function drawTab() {
    const MC = Copy.map, tab = mapUi.tab;
    main.querySelectorAll(".map-tab").forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
    // the legend bar, one line: the mission marks on the quests, the skill states and the two marks on the tree
    $("#map-legend").innerHTML = tab === "quests"
      ? `<span class="lb">${esc(MC.missionsLabel)}</span>` + MapModel.MISSION_STATES.map(s => `<span>${msMark(s)}${esc(MC.missionStates[s])}</span>`).join("")
      : MapModel.STATES.map(s => `<span class="${stCls(s)}"><span class="sdot"></span>${esc(MC.states[s])}</span>`).join("") + `<span class="st-built"><span class="sdot"></span>${esc(MC.shippedLegend)}</span><span>${diamond} ${esc(MC.postingNames)}</span><span>${chevron} ${esc(MC.senior)}</span>`;
    if (tab === "quests") drawQuests(); else drawTree();
  }

  // ---------- Q1, the quests: the worlds left to right on one road ----------
  function drawQuests() {
    const MC = Copy.map, W = mapWorlds(), L = MapModel.questLayout(W), body = $("#map-body");
    const sel = mapUi.panel && mapUi.panel.kind === "card" ? mapUi.panel.id : null;
    let h = `<p class="q-how">${esc(MC.walk)}</p><div class="ow-scroll"><div class="ow" style="width:${L.width}px;height:${L.height}px">`;
    W.worlds.forEach((w, i) => {
      const c = L.columns[i];
      const pips = w.optional || !w.clear ? "" : `<span class="pips" aria-hidden="true">${Array.from({ length: w.clear }, (_, k) => `<span class="pip${k < w.shipped ? " on" : ""}"></span>`).join("")}</span>`;
      h += `<div class="cl${w.cleared ? " cleared" : ""}${w.optional ? " optional" : ""}" style="left:${c.x}px;width:${c.width}px">
        <div class="ch"><div class="eyebrow">${esc(w.optional ? MC.optional : w.head)}</div><b>${esc(w.label)}</b><p class="who">${esc(w.who)}</p></div>
        <div class="cf"><p class="clr">${esc(w.clearLine)}</p>${w.optional ? `<p class="prog">${esc(w.progress)}</p>` : `<p class="prog">${w.cleared ? `<span class="cleared-tag">${esc(w.progress)}</span>` : pips + esc(w.progress)}</p>`}</div></div>`;
    });
    h += `</div></div><div class="ow-cap" id="ow-cap" aria-live="polite"></div><p class="ow-note">${esc(MC.stopHint)}</p>`;
    body.innerHTML = h;
    const svg = svgEl("svg", { class: "ow-path", width: L.width, height: L.svgHeight, viewBox: `0 0 ${L.width} ${L.svgHeight}`, role: "group", "aria-label": MC.questAria, style: `top:${L.top}px` }, body.querySelector(".ow"));
    svgEl("path", { class: "road", d: L.road }, svg);
    if (L.reach) svgEl("path", { class: "road reach", d: L.reach }, svg);
    for (const f of L.flags) {
      const w = W.worlds[f.world], g = svgEl("g", { class: "flag" + (w.cleared ? " up" : "") }, svg);
      svgEl("title", {}, g, fill(w.cleared ? MC.flagUp : MC.flagDown, { world: w.head }));
      svgEl("line", { class: "pole", x1: f.x, y1: f.y + 12, x2: f.x, y2: f.y - 34 }, g);
      svgEl("path", { class: "cloth", d: `M${f.x},${f.y - 34} L${f.x + 20},${f.y - 27} L${f.x},${f.y - 20} Z` }, g);
    }
    let hover = null;
    const cap = () => {
      const id = hover || W.here, el = $("#ow-cap"); if (!el) return;
      const hit = id && MapModel.missionOf(W, id);
      if (!hit) { el.innerHTML = `<span class="st">${esc(MC.allClear)}</span>`; return; }
      const { world: w, mission: m } = hit, lead = hover && hover !== W.here ? `${w.head} · ${m.i}` : MC.here;
      el.innerHTML = `<span class="k">${esc(lead)}</span><button type="button" class="ow-title" data-card="${esc(m.id)}">${esc(m.card.title)}</button><span class="st">${esc(MC.missionStates[m.state])} · ${esc(m.card.window || "")} · ${esc(hoursWords(m.card.hours))}</span><button type="button" class="ow-open" data-card="${esc(m.id)}">${esc(MC.openIt)}</button>`;
      el.querySelectorAll("[data-card]").forEach(b => b.onclick = () => openCard(b.dataset.card));
    };
    for (const s of L.stops) {
      const m = MapModel.missionOf(W, s.id).mission;
      const g = svgEl("g", { class: `stop ms-${m.state}${m.kind === "story" ? " story" : ""}${sel === m.id ? " sel" : ""}`, tabindex: "0", role: "button", "data-card": m.id, "aria-label": `${m.card.title}. ${MC.missionStates[m.state]}.` }, svg);
      svgEl("title", {}, g, `${m.card.title} · ${MC.missionStates[m.state]}`);
      svgEl("circle", { class: "halo", cx: s.x, cy: s.y, r: s.r + 5 }, g);
      svgEl("circle", { class: "base", cx: s.x, cy: s.y, r: s.r }, g);
      svgEl("circle", { class: "disc", cx: s.x, cy: s.y, r: s.r }, g);
      if (m.state === "chosen") svgEl("circle", { class: "inner", cx: s.x, cy: s.y, r: s.r - 4.5 }, g);
      svgEl("text", { x: s.x, y: s.y + 1 }, g, String(s.i));
      if (m.state === "changed") svgEl("circle", { class: "corner", cx: s.x + s.r * 0.72, cy: s.y - s.r * 0.72, r: 5.5 }, g);
      if (m.state === "declined") svgEl("line", { class: "cross", x1: s.x - s.r - 3, y1: s.y + s.r + 3, x2: s.x + s.r + 3, y2: s.y - s.r - 3 }, g);
      // the person's own answer, sent from this page or read back: a small mark under the stop until the republish
      if (m.sent) { const k = svgEl("circle", { class: "sent", cx: s.x, cy: s.y + s.r + 10, r: 3.5 }, g); svgEl("title", {}, k, fill(MC.sentMark, { choice: (m.kind === "story" ? MC.feedback.storyChoices : MC.feedback.choices)[m.sent.choice] || m.sent.choice })); }
      g.addEventListener("click", () => openCard(m.id));
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCard(m.id); } });
      g.addEventListener("mouseenter", () => { hover = m.id; cap(); });
      g.addEventListener("mouseleave", () => { hover = null; cap(); });
      g.addEventListener("focus", () => { hover = m.id; cap(); });
      g.addEventListener("blur", () => { hover = null; cap(); });
    }
    const here = L.stops.find(s => s.id === W.here);
    if (here) {
      const top = here.y - here.r - 30, g = svgEl("g", { class: "you" }, svg);
      svgEl("line", { x1: here.x, y1: here.y - here.r - 4, x2: here.x, y2: top + 6 }, g);
      svgEl("circle", { cx: here.x, cy: top, r: 6 }, g);
      svgEl("text", { x: Math.max(here.x, 48), y: top - 12 }, g, MC.here);
    }
    cap();
    if (sel) { const s = L.stops.find(x => x.id === sel), sc = body.querySelector(".ow-scroll"); if (s && sc && (s.x < sc.scrollLeft + 40 || s.x > sc.scrollLeft + sc.clientWidth - 40)) sc.scrollLeft = Math.max(0, s.x - sc.clientWidth / 2); }
  }

  // ---------- T4, the tree: the trunk and its branches ----------
  function drawTree() {
    const MC = Copy.map, T = mapUi.tree, L = MapModel.treeLayout(T, 816), body = $("#map-body");
    const how = T.behaviours.slice().sort((a, b) => MapModel.rankOf(a.state) - MapModel.rankOf(b.state));
    body.innerHTML = `<div class="t4-scroll"><div class="t4-host"></div></div><p class="t2-cap">${esc(MC.treeCap)}</p>
      <div class="t2-how"><span class="lbl">${esc(MC.how)}</span>${how.map(n => `<button class="t2n ${lookCls(n)}" type="button" data-node="${esc(n.id)}" title="${esc(n.name + ". " + lookWords(n) + ".")}"><span class="nd" aria-hidden="true"></span><span class="nm">${esc(n.name)}</span></button>`).join("")}</div>
      <div class="t2-links"><button type="button" id="map-more">${esc(MC.more)}</button></div>`;
    const svg = svgEl("svg", { class: "t4", width: L.width, height: L.height, viewBox: `0 0 ${L.width} ${L.height}`, role: "group", "aria-label": fill(MC.treeAria, { label: T.label.toLowerCase() || "" }) }, body.querySelector(".t4-host"));
    svgEl("line", { class: "ground", x1: L.ground.x1, y1: L.ground.y, x2: L.ground.x2, y2: L.ground.y }, svg);
    for (const b of L.branches) {
      const cls = "branch" + (b.first ? " first" : "");
      svgEl("path", { class: cls, d: b.sweep }, svg);
      svgEl("line", { class: cls, x1: b.stem.x, y1: b.stem.y1, x2: b.stem.x, y2: b.stem.y2 }, svg);
      svgEl("text", { class: "role" + (b.first ? " first" : ""), x: b.text.x, y: b.text.y }, svg, b.label);
    }
    svgEl("rect", { class: "trunk", x: L.trunk.x, y: L.trunk.y, width: L.trunk.width, height: L.trunk.height, rx: 6 }, svg);
    for (const n of L.nodes) if (n.tick) svgEl("line", { class: "tick" + (n.tick.first ? " first" : ""), x1: n.tick.x1, y1: n.tick.y1, x2: n.tick.x2, y2: n.tick.y2 }, svg);
    svgEl("g", { class: "co-lines", id: "map-co" }, svg);   // "asked together with", drawn only while a node is open
    const byId = Object.fromEntries(T.nodes.map(n => [n.id, n]));
    for (const p of L.nodes) {
      const n = byId[p.id], r = p.r;
      const g = svgEl("g", { class: `node ${lookCls(n)}`, transform: `translate(${p.x},${p.y})`, tabindex: "0", role: "button", "data-node": n.id, "aria-label": `${n.name}. ${lookWords(n)}.` }, svg);
      svgEl("title", {}, g, `${n.name}. ${lookWords(n)}.`);
      svgEl("circle", { class: "halo", r: r + 4 }, g);
      if (n.shipped) svgEl("circle", { class: "ring", r: r + 3 }, g);
      svgEl("circle", { class: "disc", r }, g);
      if (!n.shipped && n.state === "must evidence better") svgEl("path", { class: "half", d: `M0,${-r} A${r},${r} 0 0 0 0,${r} Z` }, g);
      if (n.shipped) svgEl("path", { class: "check", d: `M${-r * 0.45},0 L${-r * 0.1},${r * 0.35} L${r * 0.5},${-r * 0.35}` }, g);
      const left = p.side === "l", tx = left ? -(r + 8) : r + 8, lines = wrap2(n.name), y0 = lines.length === 2 ? -3 : 5;
      const t = svgEl("text", { class: "nm", x: tx, y: y0, "text-anchor": left ? "end" : "start" }, g);
      let last = null; lines.forEach((ln, i) => { last = svgEl("tspan", { x: tx, dy: i ? 16 : 0 }, t, ln); });
      // the two marks after the name's last line: the posting names it (a diamond), senior roles ask more (a chevron)
      if (n.posting_names || n.grows) {
        let len = 0; try { len = last.getComputedTextLength(); } catch { len = lines[lines.length - 1].length * 7.5; }
        if (!len) len = lines[lines.length - 1].length * 7.5;
        const ly = y0 + (lines.length - 1) * 16 - 5, step = left ? -14 : 14;
        let mx = left ? tx - len - 8 : tx + len + 8;
        if (n.posting_names) { svgEl("path", { class: "mk-p", d: `M${mx},${ly - 4} l4,4 l-4,4 l-4,-4 Z` }, g); mx += step; }
        if (n.grows) svgEl("path", { class: "mk-s", d: `M${mx - 4},${ly + 2} L${mx},${ly - 2} L${mx + 4},${ly + 2}` }, g);
      }
      g.addEventListener("click", () => openNode(n.id));
      g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openNode(n.id); } });
    }
    body.querySelectorAll(".t2-how [data-node]").forEach(b => b.onclick = () => openNode(b.dataset.node));
    $("#map-more").onclick = openMore;
    markTree();
  }
  // the open node, its co-asked nodes and the lines between them: on the tree only while the node panel is open
  function markTree() {
    const svg = main.querySelector("svg.t4"); if (!svg) return;
    const co = $("#map-co"); co.innerHTML = "";
    main.querySelectorAll(".t4 .node, .t2-how .t2n").forEach(x => x.classList.remove("sel", "co"));
    const id = mapUi.panel && mapUi.panel.kind === "node" ? mapUi.panel.id : null; if (!id) return;
    const L = MapModel.treeLayout(mapUi.tree, 816), at = Object.fromEntries(L.nodes.map(n => [n.id, n]));
    const self = main.querySelector(`.t4 [data-node="${CSS.escape(id)}"], .t2-how [data-node="${CSS.escape(id)}"]`); if (self) self.classList.add("sel");
    for (const o of MapModel.coAsked(mapUi.map, mapUi.M, id)) {
      const el = main.querySelector(`.t4 [data-node="${CSS.escape(o)}"]`); if (el) el.classList.add("co");
      const a = at[id], b = at[o]; if (!a || !b) continue;
      // a gentle bow, so a line between two neighbors never hides under the tree's own strokes
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, k = Math.max(30, Math.min(60, len * 0.3));
      let px = -dy / len, py = dx / len; if (px < 0 || (px === 0 && py < 0)) { px = -px; py = -py; }
      svgEl("path", { d: `M${a.x},${a.y} Q${(a.x + b.x) / 2 + px * k},${(a.y + b.y) / 2 + py * k} ${b.x},${b.y}` }, co);
    }
  }

  // ---------- the side panel ----------
  function panel(html, p) {
    mapUi.panel = p;
    showAside(`<button type="button" class="close" aria-label="${esc(CM.close)}">×</button>${html}`);
    aside.querySelector(".close").onclick = closePanel;
    if (mapUi.tab === "tree") markTree(); else drawQuests();
  }
  function closePanel() {
    if (!mapUi) return;
    const had = mapUi.panel; mapUi.panel = null; showAside(null);
    if (had && $("#map-body")) { if (mapUi.tab === "tree") markTree(); else drawQuests(); }
  }
  // the node panel: name, state in words, the line that showed it, what it is, the roles that ask, "asked together
  // with" (three, drawn on the tree while open), the missions that build it
  function openNode(id, fromMore) {
    if (!mapUi) return;
    const MC = Copy.map, N = MC.node, s = MapModel.skillInfo(mapUi.map, mapUi.M, id), company = (mapUi.map.company || {}).name || "";
    const co = MapModel.coAsked(mapUi.map, mapUi.M, id), cards = MapModel.questsOf(mapUi.map, id), W = mapWorlds();
    const lineHead = s.state === "must evidence better" ? N.lineHalf : s.state === "shows in other words" ? N.lineOther : N.lineShows;
    const mk = [s.posting_names && company ? `<span>${diamond} ${esc(fill(N.postingNames, { company }))}</span>` : "", s.grows ? `<span>${chevron} ${esc(N.senior)}</span>` : ""].join("");
    const roles = s.roles.map(roleLabel);
    const row = c => { const hit = MapModel.missionOf(W, c.id); return `<button type="button" class="r" data-card="${esc(c.id)}"><span class="t">${esc(c.title)}</span><span class="m">${esc(hit ? (hit.world.optional ? MC.reachHead : fill(MC.world, { n: hit.world.num, label: hit.world.label })) : "")}</span>${hit ? `<span class="n">${msMark(hit.mission.state)}</span>` : ""}</button>`; };
    panel((fromMore ? `<button type="button" class="backlink" data-back="more">${esc(MC.moreBack)}</button>` : "") +
      (s.area_label ? `<p class="eyebrow">${esc(s.area_label)}</p>` : "") +
      `<h2 class="t2p">${esc(s.name)}</h2><p class="t2-state ${lookCls(s)}"><span class="nd" aria-hidden="true"></span>${esc(lookWords(s))}</p>` +
      (mk ? `<div class="t2-mk">${mk}</div>` : "") +
      (s.shipped ? `<p class="t2-since">${esc(fill(N.since, { date: s.shipped.words, title: s.shipped.title }))}</p>` : "") +
      (s.line ? `<div class="rs"><h3 class="rh">${esc(lineHead)}</h3><q>${esc(s.line)}</q>${s.through ? `<p class="small muted">${esc(fill(N.through, { name: s.through }))}</p>` : ""}</div>` : "") +
      (s.what ? `<div class="rs"><h3 class="rh">${esc(N.what)}</h3><p class="what">${esc(s.what)}</p></div>` : "") +
      (roles.length ? `<div class="rs"><h3 class="rh">${esc(N.roles)}</h3><div class="chips">${roles.map(r => `<span class="chip">${esc(r)}</span>`).join("")}</div></div>` : "") +
      (co.length ? `<div class="rs"><h3 class="rh">${esc(N.together)}</h3><div class="co-l">${co.map(c => `<button type="button" data-node="${esc(c)}"><span class="ln" aria-hidden="true"></span>${esc(MapModel.skillInfo(mapUi.map, mapUi.M, c).name)}</button>`).join("")}</div></div>` : "") +
      `<div class="rs"><h3 class="rh">${esc(N.missions)}</h3>${cards.length ? `<div class="list">${cards.map(row).join("")}</div>` : `<p>${esc(MC.noMission)}</p>`}</div>`,
      { kind: "node", id });
    aside.querySelectorAll("[data-node]").forEach(b => b.onclick = () => openNode(b.dataset.node));
    aside.querySelectorAll("[data-card]").forEach(b => b.onclick = () => openCard(b.dataset.card, id));
    const back = aside.querySelector("[data-back]"); if (back) back.onclick = openMore;
  }
  function openMore() {
    const MC = Copy.map, list = mapUi.tree.more.map(m => MapModel.skillInfo(mapUi.map, mapUi.M, m.id)).sort((a, b) => MapModel.rankOf(a.state) - MapModel.rankOf(b.state));
    const first = mapUi.tree.roles[0];
    panel(`<h2 class="t2p">${esc(MC.more)}</h2>${first ? `<p class="empty">${esc(fill(MC.moreLead, { role: first.label }))}</p>` : ""}
      <div class="list more-l">${list.map(n => `<button class="r" type="button" data-node="${esc(n.id)}"><span class="t">${sdot(n)}${esc(n.name)}</span><span class="m">${esc(lookWords(n))}</span></button>`).join("")}</div>`, { kind: "more" });
    aside.querySelectorAll("[data-node]").forEach(b => b.onclick = () => openNode(b.dataset.node, true));
  }

  // ---------- K1, the card, with F1 at its foot ----------
  function openCard(cardId, fromNode) {
    if (!mapUi) return;
    const MC = Copy.map, K = MC.card, map = mapUi.map, c = MapModel.cardsById(map)[cardId]; if (!c) return;
    const W = mapWorlds(), hit = MapModel.missionOf(W, cardId), w = hit ? hit.world : null, m = hit ? hit.mission : { state: MapModel.missionState(c, mapUi.mine[cardId]), sent: mapUi.mine[cardId] || null };
    const posting = map.posting || {}, company = (map.company || {}).name || "";
    const stateLine = m.state === "shipped" ? fill(K.state.shipped, { date: MapModel.dateWords(c.shipped) })
      : m.state === "declined" ? (c.declined ? K.state.declined : K.state.declinedSent)
      : m.state === "changed" ? (c.changed ? fill(K.state.changed, { date: MapModel.dateWords(c.changed) }) : K.state.changedSent)
      : m.state === "open" && c.kind === "story" ? K.state.openStory
      : K.state[m.state];
    const story = MapModel.storyOf(c), S = K.story;
    const head = w ? (w.optional ? `${MC.reachHead} · ${MC.optional}` : fill(MC.world, { n: w.num, label: w.label })) + (story ? ` · ${S.eyebrow}` : "") : (story ? S.eyebrow : "");
    const skills = (c.atlas_skills || []).map(id => MapModel.skillInfo(map, mapUi.M, id));
    const back = fromNode ? fill(K.backTo, { name: MapModel.skillInfo(map, mapUi.M, fromNode).name }) : K.back;
    const chips = `<h3>${esc(K.skills)}</h3><div class="chipset">${skills.map(s => `<button type="button" class="chip" data-node="${esc(s.id)}" title="${esc(lookWords(s))}">${sdot(s)}${esc(s.name)}</button>`).join("")}</div>`;
    // a story card: the line as it stands, what the skill means here, the slots, a box that reads a new line live,
    // the practice prompt with Copy, the two why lines; a build card: the three why lines, the classes, the sources
    const field = ((map.role_class || {}).label || "").replace(/ roles$/, "");
    const body = story ? `
        <section class="why"><h3>${esc(S.lineToday)}</h3><q>“${esc(story.line)}”</q><p class="from">${esc(fill(S.todayState, { state: (MC.states[story.state] || story.state).toLowerCase() }))}</p></section>
        ${story.reads_as || story.what ? `<section class="why"><h3>${esc(field ? fill(S.means, { field }) : S.meansPlain)}</h3><p>${esc(story.reads_as || story.what)}</p></section>` : ""}
        ${story.slots.length ? `<section class="why"><h3>${esc(S.shows)}</h3><ul class="slots">${story.slots.map(x => `<li><b>${esc(S.slots[x.key] || x.key)}</b> ${esc(x.items.join(", "))}</li>`).join("")}</ul></section>` : ""}
        <section class="why try"><h3>${esc(S.tryIt)}</h3><p class="small muted">${esc(S.tryHint)}</p><textarea id="story-line" maxlength="400" aria-label="${esc(S.tryAria)}" placeholder="${esc(S.tryPlaceholder)}"></textarea><p class="story-read" id="story-read" aria-live="polite"></p></section>
        ${story.prompt ? `<section class="why"><h3>${esc(S.practice)}</h3><p class="small muted">${esc(S.practiceHint)}</p><pre class="prompt" id="story-prompt">${esc(story.prompt)}</pre><p><button type="button" class="btn" id="story-copy">${esc(S.copy)}</button><span class="copied" id="story-copied"></span></p></section>` : ""}
        ${c.why_role ? `<section class="why"><h3>${esc(K.whyRole)}</h3><p>${esc(c.why_role.text)}</p></section>` : ""}
        ${c.why_person ? `<section class="why"><h3>${esc(K.whyYou)}</h3><p>${esc(c.why_person.text)}</p></section>` : ""}
        ${chips}
        <p class="from"><a href="#/role/${esc((map.role || {}).id || "")}">${esc(fill(S.fromAtlas, { role: (map.role || {}).label || "" }))}</a></p>` : `
        ${c.why_role ? `<section class="why"><h3>${esc(K.whyRole)}</h3><p>${esc(c.why_role.text)}</p>${c.why_role.posting_quote ? `<q>“${esc(c.why_role.posting_quote)}”</q>` : ""}<p class="from">${esc(K.fromPosting)} <a href="${esc(safeUrl(posting.url))}" target="_blank" rel="noopener">${esc(posting.title || "")}</a>${company ? ", " + esc(company) : ""}</p></section>` : ""}
        ${c.why_company ? `<section class="why"><h3>${esc(K.whyCompany)}</h3><p>${esc(c.why_company.text)}</p><p class="from">${esc(fill(K.fromResearch, { topic: researchWords(c.why_company.research_file) }))}${c.why_company.url ? ` · <a href="${esc(safeUrl(c.why_company.url))}" target="_blank" rel="noopener">${esc(hostOf(c.why_company.url))}</a>` : ""}</p></section>` : ""}
        ${c.why_person ? `<section class="why"><h3>${esc(K.whyYou)}</h3><p>${esc(c.why_person.text)}</p>${c.why_person.profile_quote ? `<q>“${esc(c.why_person.profile_quote)}”</q>` : ""}<p class="from">${esc(K.fromProfile)}</p></section>` : ""}
        ${chips}
        <h3>${esc(K.classes)}</h3><div id="map-classes">${classList(c)}</div>
        ${c.users ? `<h3>${esc(K.users)}</h3><p class="users">${esc(c.users)}</p>` : ""}
        <h3>${esc(K.sources)}</h3><ul class="src">${(c.sources || []).map(s => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.title)}</a>${s.read ? ` <span class="rd">· ${esc(fill(K.read, { date: MapModel.dateWords(s.read) }))}</span>` : ""}</li>`).join("")}</ul>`;
    panel(`<button type="button" class="backlink" data-back>${esc(back)}</button>
      <div class="q-mstate ms-${m.state}">${msMark(m.state)}<span>${esc(stateLine)}</span></div>
      <div class="qcard${story ? " story" : ""}" data-card="${esc(c.id)}">
        ${head ? `<div class="eyebrow">${esc(head)}</div>` : ""}${w && w.who ? `<p class="who">${esc(w.who)}</p>` : ""}
        <h2>${esc(c.title)}</h2>
        <dl><dt>${esc(K.window)}</dt><dd>${esc(c.window || "")}</dd><dt>${esc(K.hours)}</dt><dd>${esc(hoursWords(c.hours))}</dd></dl>
        <h3>${esc(K.ships)}</h3><p class="ship">${esc(c.ship || "")}</p>${body}
        <div class="fb" id="map-fb"></div>
      </div>`, { kind: "card", id: c.id, from: fromNode || null });
    aside.querySelector("[data-back]").onclick = () => fromNode ? openNode(fromNode) : closePanel();
    aside.querySelectorAll(".qcard [data-node]").forEach(b => b.onclick = () => openNode(b.dataset.node));
    if (story) storyControls(c, story);
    // the class titles from the class roster (Catalog), once per page; the codes stand until they load
    if (!story && (c.classes || []).length && window.Catalog && !mapUi.catalog) {
      mapUi.catalog = Catalog.loadCatalog().then(d => Object.fromEntries(d.classes.map(k => [k.code, k.title || ""]))).catch(e => { console.error(e); return {}; });
    }
    if (mapUi.catalog) mapUi.catalog.then(t => { mapUi.titles = t; const el = $("#map-classes"); if (el && mapUi.panel && mapUi.panel.id === c.id) el.innerHTML = classList(c); });
    drawFeedback(c.id, { choice: null, note: "" });
    // the person's last answer on this card, read once per page from the private folder
    if (!mapUi.asked.has(c.id)) {
      mapUi.asked.add(c.id);
      const fb = $("#map-fb"); if (fb) fb.innerHTML = `<h3>${esc(MC.feedback.heading)}</h3><p class="small muted">${esc(MC.feedback.reading)}</p>`;
      (async () => { const s = await Auth.session(); return s ? Auth.readFeedback(s, c.id) : null; })()
        .then(obj => { if (obj && obj.choice && mapUi) mapUi.mine[c.id] = obj; })
        .catch(e => console.error(e))
        .then(() => { if (!mapUi || !mapUi.panel || mapUi.panel.id !== c.id) return; if (mapUi.mine[c.id]) openCard(c.id, fromNode); else drawFeedback(c.id, { choice: null, note: "" }); });
    }
  }
  // The story card's two controls. The box reads the new line with the matcher of the map's role, the way the fit
  // page read the résumé (Atlas.matcher), on its own: the row's status for the card's skill becomes one of the four
  // states (MapModel.lineState). Nothing is stored and nothing is sent; the person tells the owner with F1 below.
  // Copy puts the practice prompt on the clipboard (a selection when the clipboard is closed to the page).
  const storyMatcher = async () => { const R = await Atlas.role(mapUi.map.role.id); const { M } = await Atlas.matcher(R); return { R, M }; };
  function storyControls(c, story) {
    const S = Copy.map.card.story, box = $("#story-line"), out = $("#story-read");
    let timer = null, seq = 0;
    const show = (state, text) => { if (!out) return; out.innerHTML = state ? `<span class="sdot ${stCls(state)}" aria-hidden="true"></span><span>${esc(text)}</span>` : `<span>${esc(text)}</span>`; };
    const readLine = async text => {
      const my = ++seq;
      if (!text.trim()) { show(null, ""); return; }
      show(null, S.reading);
      try {
        const { R, M } = await storyMatcher();
        const r = M.match(text, { jobs: R.jobs, familyJobs: R.jobs, label: R.role.label }, { ladder: R.role.ladder });
        const row = (r.rows || []).find(x => x.id === story.skill);
        const state = MapModel.lineState(row ? row.status : "gap");
        if (my === seq && mapUi && mapUi.panel && mapUi.panel.id === c.id) show(state, S.result[state] || "");
      } catch (e) { console.error(e); if (my === seq) show(null, ""); }
    };
    if (box) box.oninput = () => { clearTimeout(timer); timer = setTimeout(() => readLine(box.value), 450); };
    const copy = $("#story-copy"), pre = $("#story-prompt"), said = $("#story-copied");
    if (copy && pre) copy.onclick = async () => {
      try { await navigator.clipboard.writeText(pre.textContent); if (said) said.textContent = S.copied; }
      catch { const range = document.createRange(); range.selectNodeContents(pre); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
    };
  }
  function classList(c) {
    const K = Copy.map.card, codes = c.classes || [], t = mapUi.titles || {};
    if (!codes.length) return `<p class="none small muted">${esc(K.noClass)}</p>`;
    return `<ul class="k-classes">${codes.map(code => `<li><code>${esc(code)}</code>${esc(t[code] || "")}</li>`).join("")}</ul>`;
  }
  // F1: "I'll build this" · "Not this one" · "Change it", a note, Send; the sent state with the choice and the date;
  // the owner's reply from the map when the republish carries one
  function drawFeedback(cardId, draft, err) {
    const box = $("#map-fb"); if (!box) return;
    const MC = Copy.map, F = MC.feedback, c = MapModel.cardsById(mapUi.map)[cardId], mine = mapUi.mine[cardId], editing = draft.editing;
    const choices = c.kind === "story" ? F.storyChoices : F.choices;   // "I'll rewrite it" on a story card
    let h = `<h3>${esc(F.heading)}</h3>`;
    if (c.shipped) h += `<div class="sent"><b>${esc(MC.missionStates.shipped)}</b> <span class="when">· ${esc(MapModel.dateWords(c.shipped))}</span><p class="small ok">${esc(F.shipped)}</p></div>`;
    else if (mine && !editing) {
      h += `<div class="sent"><b>${esc(fill(F.sentChoice, { choice: choices[mine.choice] || mine.choice }))}</b> <span class="when">· ${esc(MapModel.dateWords(mine.date))}</span>${mine.note ? `<p>${esc(mine.note)}</p>` : `<p class="muted">${esc(F.noNote)}</p>`}<p class="small ok">${esc(F.sent)}</p></div>`;
      h += `<div class="again"><button type="button" class="linkish link" data-again>${esc(F.again)}</button></div>`;
    } else {
      h += `<div class="row">${Object.entries(choices).map(([k, v]) => `<button class="btn choice${draft.choice === k ? " on" : ""}" type="button" data-choice="${k}" aria-pressed="${draft.choice === k}">${esc(v)}</button>`).join("")}</div>
        <textarea id="map-note" maxlength="500" aria-label="${esc(F.noteAria)}" placeholder="${esc(F.note)}">${esc(draft.note)}</textarea>
        <div class="send"><button class="btn primary" type="button" data-send${draft.choice && !draft.busy ? "" : " disabled"}>${esc(draft.busy ? F.sending : F.send)}</button><span class="small muted">${esc(F.saved)}</span></div>
        ${err ? `<p class="small fb-err">${esc(F.failed)}</p>` : ""}`;
    }
    if (c.reply && c.reply.text) h += `<div class="reply"><b>${esc(F.reply)}</b>${c.reply.date ? ` <span class="from">· ${esc(MapModel.dateWords(c.reply.date))}</span>` : ""}<p>${esc(c.reply.text)}</p><p class="from">${esc(F.replyFrom)}</p></div>`;
    h += `<p class="up">${esc(F.up)}</p>`;
    box.innerHTML = h;
    const ta = $("#map-note"); if (ta) ta.oninput = () => { draft.note = ta.value; };
    box.querySelectorAll("[data-choice]").forEach(b => b.onclick = () => { draft.choice = b.dataset.choice; drawFeedback(cardId, draft); });
    const again = box.querySelector("[data-again]"); if (again) again.onclick = () => drawFeedback(cardId, { choice: mine.choice, note: mine.note || "", editing: true });
    const send = box.querySelector("[data-send]");
    if (send) send.onclick = async () => {
      if (!draft.choice || draft.busy) return;
      draft.busy = true; drawFeedback(cardId, draft);
      try {
        const s = await Auth.session(); if (!s) throw new Error("No session");
        const obj = Auth.feedbackObject(cardId, draft.choice, draft.note, todayIso());
        await Auth.writeFeedback(s, cardId, obj);
        mapUi.mine[cardId] = obj;
        if (mapUi.panel && mapUi.panel.id === cardId) openCard(cardId, mapUi.panel.from);   // the state line, the stop's mark
      } catch (e) {
        console.error(e); draft.busy = false;
        if (mapUi.panel && mapUi.panel.id === cardId) drawFeedback(cardId, draft, true);
      }
    };
  }
  document.addEventListener("keydown", e => { if (e.key === "Escape" && mapUi && mapUi.panel && Routes.parseRoute(location.hash).name === "map" && !aside.hidden) closePanel(); });

  // ---------- the print page: one landscape sheet (@media print in style.css) ----------
  // The four worlds as columns, each mission's title, track, window, hours and three lines of what ships; the tree's
  // states as a row of dots. On screen it stays hidden; it carries the light tokens so any printer reads it.
  function printSheet() {
    const MC = Copy.map, P = MC.printPage, map = mapUi.map, st = map.student || {}, role = (map.role || {}).label || "", company = (map.company || {}).name || "";
    const R = MapModel.readLines(map, mapUi.M), W = mapWorlds(), T = mapUi.tree;
    const cols = W.worlds.map(w => `<section><h2>${esc(w.optional ? MC.reachHead : fill(MC.world, { n: w.num, label: w.label }))}</h2><p class="who">${esc(w.clearLine)}</p>
      ${w.missions.map(m => `<div class="pr-card ms-${m.state}"><span class="t">${esc(m.card.title)}</span><span class="m">${esc([trackLabel(m.card.track), m.card.window, hoursWords(m.card.hours), m.state === "open" ? "" : MC.missionStates[m.state]].filter(Boolean).join(" · "))}</span><span class="ship">${esc(m.card.ship || "")}</span></div>`).join("")}</section>`).join("");
    const dots = (label, nodes) => nodes.length ? `<div class="pr-grp"><h3>${esc(label)}</h3>${nodes.map(n => `<span class="pr-node">${sdot(n)}${esc(n.name)}</span>`).join("")}</div>` : "";
    const tree = dots(P.trunk, T.trunk) + dots(P.shared, T.shared) + T.branches.map(b => dots(b.role.label, b.own)).join("") + dots(MC.how, T.behaviours);
    return `<section class="map-print light" aria-hidden="true">
      <header><h1>${esc(st.name_on_page || MC.heading)}</h1><p>${esc(fill(P.role, { role, company }))}${R.band ? " · " + esc(fill(P.band, { band: R.band })) : ""}</p>${map.gap_sentence ? `<p class="pr-gap">${esc(map.gap_sentence)}</p>` : ""}</header>
      <div class="pr-cols">${cols}</div>
      <div class="pr-tree"><h2>${esc(P.tree)}</h2><div class="pr-row">${tree}</div>
      <p class="pr-note">${MapModel.STATES.map(s => `<span class="sdot ${stCls(s)}"></span>${esc(MC.states[s])}`).join(" ")} <span class="sdot st-built"></span>${esc(MC.shippedLegend)}. ${esc(P.note)} ${esc(fill(P.printed, { date: MapModel.dateWords(todayIso()) }))}</p></div>
    </section>`;
  }

  // ---------- 1c. Networking (v19 B5, owner's pick N6; reshaped by the owner's feedback of 2026-11-01) ----------
  // The pure parts are web/network.js. With nothing to go on (no About you answer, no résumé, no role chosen on the
  // site or in the link) the screen starts with the About you questions, drawn in place by the shell's
  // AtlasUI.youInline, then opens on the role the answers point to (defaultRole); a person who skips them all gets the
  // default role, never the questions twice. Then: the role (a searchable Pick over every role) and the people types
  // as tabs across the full width of the page (three for everyone; "An alum in the role" fourth for an address with a
  // campus flag; "Faculty on campus" fifth when that flag's roster is loaded, 2026-11-04), wrapping below the width they need, never scrolling. Left: who to look for, with no lead (titles
  // by level, the five employers with the most open postings of the role and a link to Find jobs with the role set, or
  // the professors, the most gaps covered first, each row a link to the professor card) and the intake box. Right,
  // wider and sticky: the prep card for the type on: the company or the professor (a Pick), where to find them (the
  // searches, narrowed to that company, as bare links; for faculty, the professor's name linked to the card), and the
  // suggested approach (what to lead with, the ask, three questions specific to the person, the role and the
  // company) with a Copy button for the plain text. The employers are the
  // role's own open postings; with a résumé the fit is the matcher's, as the rail reads it (matchRole). The hash keeps
  // role, type and target (replaceState). No event is sent from here, and nothing is stored but what #/you stores.
  // Network on campus, for an address whose flag opens a roster: the professors come from that campus's public roster
  // (Catalog.loadCatalog), each with the classes they teach this term and, with a résumé, the gaps of this role those
  // classes cover, read the way classes.js reads a card (Catalog.cardTags, gapsCovered, instructorGaps); with none,
  // the role's core asks they teach (Network.askRows), so the list sorts by that instead of by name.
  const fieldJobsCache = {};
  const fieldJobsOf = gid => fieldJobsCache[gid] ||= Atlas.fieldJobs(gid).catch(e => { delete fieldJobsCache[gid]; console.error(e); return []; });
  // one read per campus entry (the flag's roster: Cornell Tech for cornell, IE New York for ienyc once its switch is on
  // and its files exist), through the class picker's own Catalog.loadCatalog
  const rosterP = {};
  const roster = cm => rosterP[cm.id] ||= Promise.all([Catalog.loadCatalog(cm), Atlas.genericSkills().catch(() => new Set())]).then(([data, generic]) => { const cards = Catalog.collapse(data); return { data, generic, cards, reads: Object.fromEntries(cards.map(c => [c.key, Catalog.cardTags(c, data.tags)])) }; }).catch(e => { delete rosterP[cm.id]; throw e; });
  async function campusProfs(cm, gaps) {
    const { data, generic, cards, reads } = await roster(cm);
    const covered = gaps ? Object.fromEntries(cards.map(c => [c.key, Catalog.gapsCovered(reads[c.key].teaches, gaps, generic)])) : {};
    return data.professors.map(p => { const mine = Catalog.instructorCards(cards, { slug: p.slug, name: p.name }); return { slug: p.slug, name: p.name, title: p.title, affiliation: p.affiliation, codes: [...new Set(mine.flatMap(c => c.codes))], gaps: gaps ? Catalog.instructorGaps(mine, covered).map(g => ({ id: g.id, name: g.name })) : [] }; })
      .filter(p => p.codes.length).sort((a, b) => b.gaps.length - a.gaps.length || a.name.localeCompare(b.name));
  }
  // the role to open with: the one chosen elsewhere, else the top role of the field the answers and résumé point to,
  // else of the biggest field
  async function defaultRole(ix) {
    const ff = (state.you || state.resume) ? await fitFields().catch(() => null) : null;
    const first = ff && [...ff.fields][0];
    const g = ix.groups.find(x => x.id === first) || ix.groups.filter(x => x.nOpen != null).sort((a, b) => b.nOpen - a.nOpen)[0] || ix.groups[0];
    const roles = g.roles.map(id => ix.roles[id]).filter(Boolean).sort((a, b) => b.nOpen - a.nOpen);
    return roles.length ? roles[0].id : Object.keys(ix.roles)[0];
  }
  // whether any About you question has an answer: the shell's AtlasUI.youAnswered when it is there, else the same
  // read of state.you (where, stage or a field)
  const youAnsweredHere = () => window.AtlasUI && typeof AtlasUI.youAnswered === "function" ? !!AtlasUI.youAnswered() : (y => !!(y.where || y.stage || (y.fields || []).length))(state.you || {});
  let nwGateDone = false;   // the questions were drawn once this visit: a person who skips them all is not asked again
  // the evidence sentences of some skills ({ id: groups }), for the hiring manager's posting question; a skill whose
  // sentences fail to load has none (the product set carries its own; the MBA set reads one cached file)
  const evidenceOf = (R, ids) => Promise.all(ids.map(id => R.evidence(id).then(e => [id, e || {}], () => [id, {}]))).then(Object.fromEntries);
  async function networkScreen() {
    const C = Network.COPY, AP = C.approach;
    crumbs([[CM.home, "#/home"], [C.crumb, null]]); showAside(null);
    page(`<h1>${esc(C.heading)}</h1><p class="lead">${esc(CM.loadingRoles)}</p>`);
    const ix = await Atlas.index(); await Atlas.product().catch(console.error);
    const here = () => Routes.parseRoute(location.hash).name === "network";
    if (!here()) return;
    const q = Routes.parseRoute(location.hash).query, roleOk = id => !!(id && ix.roles[id]);
    let chosen = chosenRole(); if (chosen && !roleOk(chosen)) chosen = Atlas.productKey(chosen);
    // the gate: nothing to go on, so the About you questions come first, right here; when they are done, this screen
    // again, for the role the answers point to
    if (!nwGateDone && !roleOk(q.role) && !roleOk(chosen) && !state.resume && !youAnsweredHere() && window.AtlasUI && typeof AtlasUI.youInline === "function") {
      nwGateDone = true;
      page(`<p class="eyebrow">${esc(C.crumb)}</p><h1>${esc(C.heading)}</h1><p class="lead">${esc(C.gateLead)}</p><div id="nw-you" class="nw-you"></div>`);
      AtlasUI.youInline($("#nw-you"), { onDone: () => { if (here()) networkScreen(); } });
      return;
    }
    // the campus gate: the alum type for any campus flag, Faculty on campus for a flag with a loaded roster; the
    // alumni searches carry the flag's school filter (Network.SCHOOLS)
    const gate = campusGate(), types = Network.types(gate.flag, gate.open);
    const s = { role: q.role, type: q.type, key: q.target || null };
    if (!roleOk(s.role)) s.role = roleOk(chosen) ? chosen : await defaultRole(ix);
    if (!types.some(t => t.id === s.type)) s.type = types[0].id;
    // the Role choices: every role, field by field, the biggest roles first; the field is the hint the search reads too
    const roleOptions = ix.groups.flatMap(g => g.roles.map(id => ix.roles[id]).filter(Boolean).sort((a, b) => b.nOpen - a.nOpen).map(r => ({ value: r.id, label: r.label, hint: g.label })));
    const writeHash = () => { const p = new URLSearchParams({ role: s.role, type: s.type }); if (s.key) p.set("target", s.key); const next = "#/network?" + p; if (location.hash !== next) history.replaceState(null, "", location.pathname + location.search + next); };
    let token = 0;
    // the context for the role on: the role file, the field's postings, the fit, the professors, the skills generic
    // to the role set (no question names one) and the evidence sentences of the skills the questions may name
    const load = async () => {
      const t = ++token;
      const R = await Atlas.role(s.role); const fieldJobs = await fieldJobsOf(R.role.group);
      const m = state.resume ? await matchRole(s.role).catch(e => { console.error(e); return null; }) : null;
      let profs = [], rosterFailed = false;
      if (gate.open) { try { profs = await campusProfs(gate.campus, m ? gapRows(rowsOf(m.r), m.R) : Network.askRows(ix, R, Atlas.TIER.core)); } catch (e) { console.error(e); rosterFailed = true; } }
      const rg = state.resume && !m ? await rough().catch(() => null) : null;
      const generic = await Atlas.genericSkills().catch(() => new Set());
      const o = { flag: gate.flag, roster: gate.open, shown: rg ? rg.shown : null, profs, fieldJobs, core: Atlas.TIER.core, generic };
      const K0 = Network.ctx(ix, R, m ? m.r : null, o);
      const evidence = await evidenceOf(R, [...new Set([...K0.craftGaps.slice(0, 6), ...K0.craft.slice(0, 10)].map(x => x.id))]);
      if (t !== token) return null;
      return { R, K: Network.ctx(ix, R, m ? m.r : null, { ...o, evidence }), rosterFailed };
    };
    let X = null, picks = [];
    const draw = () => {
      picks.forEach(p => p.destroy()); picks = [];   // a Pick listens on the document; the old ones go with the old page
      const { R, K, rosterFailed } = X, role = R.role, type = Network.typeOf(s.type);
      const targets = Network.targetsOf(s.type, K);
      if (targets.length && !targets.some(t => t.key === s.key)) s.key = targets[0].key;
      if (!targets.length) s.key = null;
      const target = targets.length ? targets.find(t => t.key === s.key).row : null;
      writeHash();
      const W = Network.who(s.type, K), outs = Network.where(s.type, K, target), S = Network.say(s.type, K, target);
      const tabs = `<div class="tabs nw-tabs" role="tablist">${types.map(t => `<button type="button" role="tab" class="${t.id === s.type ? "on" : ""}" aria-selected="${t.id === s.type}" data-type="${esc(t.id)}">${esc(t.label)}</button>`).join("")}</div>`;
      // who to look for: one line per level, the five employers with the most open postings of the role and the way
      // to the rest in Find jobs, or the professors
      const lv = W.levels.length ? `<ul class="plain nw-lv">${W.levels.map(l => `<li><b>${esc(l.label)}</b> · ${l.titles.map(x => `${esc(x.title)} <span class="muted">(${esc(x.company)})</span>`).join(" · ")}</li>`).join("")}</ul>` : "";
      const emps = W.employers.length ? `<div class="list nw-emps">${W.employers.map(e => `<div class="r"><span class="t">${esc(e.company)}</span><span class="n">${esc(fill(CM.nOpen, { n: fmt(e.nOpen) }))}</span><span class="m">${esc(e.roles.slice(0, 4).join(", "))}</span></div>`).join("")}</div><p class="nw-more"><a href="${esc(Network.jobsHref(K))}">${esc(C.moreJobs)}</a></p>` : "";
      // with a résumé, the gaps a professor's classes cover; without one, the role's core asks they teach
      const profRow = p => { const xs = p.read ? p.covers : p.asks, n = xs.length ? esc(fill(p.read ? C.gapsOf : C.teachesOf, { n: xs.length, m: p.read ? p.nGaps : p.nAsks })) : esc(p.codes.slice(0, 2).join(", ")); return `<a class="r" href="#/professor/${encodeURIComponent(p.slug)}"><span class="t">${esc(p.name)}</span><span class="n">${n}</span><span class="m">${esc(p.line)}${xs.length ? esc(fill(p.read ? C.covers : C.teachesNames, { names: xs.map(g => g.name).join(", ") })) : ""}</span></a>`; };
      const profs = !W.profs ? "" : W.profs.length ? `<div class="list nw-emps">${W.profs.slice(0, 8).map(profRow).join("")}</div>${W.profs.length > 8 ? `<p class="small muted">${esc(fill(C.moreProfs, { n: fmt(W.profs.length - 8) }))}</p>` : ""}` : rosterFailed ? `<p class="small muted">${esc(C.rosterFailed)}</p>` : "";
      const who = `<section class="nw-sec"><h2>${esc(C.who)}</h2>${W.lead ? `<p>${esc(W.lead)}</p>` : ""}${lv}${emps}${profs}</section>`;
      // the prep card: the company or the professor, where to find them, the suggested approach and its Copy button
      const pickHtml = targets.length ? `<div class="dlabel nw-target"><span>${esc(s.type === "faculty" ? C.professor : C.company)}</span><div id="nw-target"></div></div>` : "";
      // where to find them: the links alone (owner's feedback 2026-11-01); faculty have none, the professor's name
      // under the Pick links to the card
      const where = s.type === "faculty" ? (target ? `<p class="nw-prof"><a href="#/professor/${encodeURIComponent(target.slug)}">${esc(target.name)} →</a></p>` : "")
        : `<h3>${esc(C.where)}</h3>${outs.length ? `<ul class="nw-outs">${outs.map(o => `<li><a href="${esc(o.href)}" target="_blank" rel="noopener">${esc(o.label)} ↗</a></li>`).join("")}</ul>` : `<p class="small muted">${esc(C.noWhere)}</p>`}`;
      const addResume = state.resume ? "" : ` <a href="#/you">${esc(AP.addResume)}</a> ${esc(AP.addResumeAfter)}`;
      const approach = `<h3>${esc(AP.heading)}</h3><p class="small muted">${esc(AP.note)}</p>
        <div class="nw-ap"><p class="nw-k">${esc(AP.leadWith)}</p><p>${esc(S.leadWith)}${addResume}</p><p class="nw-k">${esc(AP.ask)}</p><p>${esc(S.ask)}</p><p class="nw-k">${esc(AP.questions)}</p><ol class="qs">${S.questions.map(x => `<li>${esc(x)}</li>`).join("")}</ol></div>
        <p class="acts-row"><button type="button" class="btn primary" id="nw-copy">${esc(AP.copy)}</button><span class="small muted" id="nw-copied" aria-live="polite"></span></p>`;
      const prep = `<section class="pcard" id="nw-prep"><p class="eyebrow">${esc(C.prep)} · ${esc(role.label)}</p><h2>${esc(type.label)}</h2>${pickHtml}${where}${approach}</section>`;
      page(`<p class="eyebrow">${esc(Network.fill(C.eyebrow, { role: role.label }))}</p><h1>${esc(C.heading)}</h1>
        <div class="nw-head"><div class="dlabel nw-role"><span>${esc(C.role)}</span><div id="nw-role"></div></div>${tabs}</div>
        <div class="nw"><div class="nw-main">${who}<div class="fit-wait">${applyBox("network", { always: true, role_id: role.id })}</div></div><aside class="nw-side" aria-label="${esc(C.sideAria)}">${prep}</aside></div>`);
      main.firstElementChild.classList.add("wide", "nw-page");
      // ---- the wiring ----
      wireWait(main, redraw);
      picks.push(Pick.mount($("#nw-role"), { options: roleOptions, value: role.id, placeholder: C.rolePlaceholder, label: C.role, onChange: v => { if (roleOk(v)) { s.role = v; s.key = null; reload(); } } }));
      if (targets.length) picks.push(Pick.mount($("#nw-target"), { options: targets.map(t => ({ value: t.key, label: t.label, hint: t.hint })), value: s.key, placeholder: s.type === "faculty" ? C.professorPlaceholder : C.companyPlaceholder, label: s.type === "faculty" ? C.professor : C.company, onChange: v => { if (v) { s.key = v; redraw(); } } }));
      main.querySelectorAll("[data-type]").forEach(b => b.onclick = () => { s.type = b.dataset.type; s.key = null; redraw(); });
      // Copy: the plain text of the approach (a head line, lead with, the ask, the questions), for an AI helper or notes
      const ok = $("#nw-copied");
      const said = m => { ok.textContent = m; setTimeout(() => { if (ok.isConnected) ok.textContent = ""; }, 2000); };
      const byHand = () => { const ta = document.createElement("textarea"); ta.value = S.pasteText; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); let done = false; try { done = document.execCommand("copy"); } catch { } ta.remove(); said(done ? AP.copied : AP.copyFailed); };
      $("#nw-copy").onclick = () => { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(S.pasteText).then(() => said(AP.copied), byHand); else byHand(); };
    };
    const redraw = () => keepScroll(draw);
    const reload = () => load().then(r => { if (r && here()) { X = r; redraw(); } }).catch(fail);
    X = await load(); if (X && here()) draw();
  }
  // a game: its own screen once built; until then, what it will be. A built game is web/games/<slug>.js, loaded
  // by index.html, which registers window.Games[slug] = { mount(el, ctx) } (contract in games/README.md)
  window.Games = window.Games || {};
  async function play(slug) {
    const gm = (await games()).find(g => g.slug === slug);
    if (!gm) return home();
    crumbs([[CM.home, "#/home"], [gm.title, null]]); showAside(null);
    const G = window.Games[slug];
    if (gm.status === "live" && G && G.mount) { main.innerHTML = ""; window.scrollTo(0, 0); return G.mount(main, { Atlas, game: gm, showAside, crumbs, esc }); }
    page(`<p class="eyebrow">${esc(Copy.games.comingSoon)}</p><h1>${esc(gm.title)}</h1><p class="lead">${esc(gm.tagline)}.</p>
      <div class="cover big"><img src="${esc(gm.cover)}" alt="${esc(fill(Copy.games.earlyDesign, { title: gm.title }))}" onerror="this.remove()"><span class="ph-t">${esc(gm.title)}</span></div>
      <div class="row" style="margin-top:16px"><a class="btn" href="#/home">${esc(CM.backHome)}</a><a class="btn quiet" href="#/explore">${esc(Copy.games.exploreRoles)}</a></div>`, true);
  }
  // ---------- 2. tell us about you: three questions and an optional resume, then a summary of what we know (Y3) ----------
  // Owner's decisions (2026-10-24): the program options are the ones Cornell Tech and IE New York offer, folded to the
  // five groups the postings can say something about (the beachhead: no law, PhD or undergrad for now, no "working");
  // the second question is the person's stage in the search, which decides what the role page's rail leads with
  // (the earlier "what are you looking for" question, owner's choice Y2, changed nothing on screen; this one does).
  const YOU = Copy.you, Q = YOU.questions;   // the questions, in order (web/copy.js): key, title, options as [id, label, examples]
  const WHERE = Object.fromEntries(Q[0].options.map(o => [o[0], o[1]])), WHERE_SHORT = YOU.whereShort;
  // a program id from an id or a label (the door's Tally form returns the label); "" when neither
  const whereId = v => { const t = String(v || "").trim(); if (WHERE[t]) return t; const hit = Q[0].options.find(o => o[1].toLowerCase() === t.toLowerCase()); return hit ? hit[0] : ""; };
  const STAGE = Object.fromEntries(Q[1].options.map(o => [o[0], o[1]])), STAGE_SHORT = YOU.stageShort;
  let wiz = null;
  // a door answer kept before About you read it (a visit from before 2026-11-01, or a door left by a reload) lands now,
  // under the same rule as keepDoor
  { const w = doorKept().where, next = WHERE[w] ? Routes.You.fromDoor(state.you, w) : null; if (next) { state.you = next; store.set("you", next); } }
  // a question's options as [id, label, examples]; the fields carry two example roles each (owner's choice Y1), so a
  // name like "Operations & general management" says what is inside
  function questionOpts(ix, q) {
    const examples = g => { const names = g.roles.map(r => (ix.roles[r] || {}).label).filter(Boolean).slice(0, 2); return names.length ? names.join(" · ") : g.id === "product" ? YOU.productExamples : ""; };
    return q.multi ? ix.groups.map(g => [g.id, g.label, examples(g)]) : q.options.map(([id, label, ex]) => [id, label, ex || ""]);
  }
  // About you answered: a program (not one the door filled in alone), a stage, a field, or a résumé on file (You.answered)
  const youAnswered = () => Routes.You.answered(state.you, state.resume);
  // About you in one line, for a screen that shows it beside its own content (home): what you study, your stage, your
  // fields, the résumé on file or not, and Edit to #/you
  function youLine(ix) {
    const y = state.you || {}, YI = YOU.inline;
    const fields = (y.fields || []).map(id => (ix.groups.find(g => g.id === id) || {}).label).filter(Boolean);
    const parts = [y.where ? esc(WHERE_SHORT[y.where] || WHERE[y.where]) : esc(YI.noWhere), y.stage ? esc(STAGE_SHORT[y.stage] || STAGE[y.stage]) : esc(YI.noStage),
      fields.length ? `<b>${esc(join(fields))}</b>` : esc(YI.noFields), state.resume ? esc(fill(YI.resumeOn, { name: state.resume.name })) : esc(YI.noResume)];
    return `<div class="strip" aria-label="${esc(YI.summaryAria)}"><span class="dotg"></span><span>${parts.join(" · ")}</span><a href="#/you">${esc(CM.edit)}</a></div>`;
  }
  // About you drawn inside `el` (owner's feedback 2026-11-01; home, and Networking through window.AtlasUI): the three
  // questions of #/you (Copy.you.questions: where, stage, fields), then the optional résumé drop, one step at a time,
  // saved to the same state.you and localStorage "you" as #/you after every answer, so leaving halfway keeps what was
  // answered. It opens on the first question not answered yet (You.firstStep: the door's program answer skips the first);
  // Back reaches the earlier ones. "Skip for now" on every step keeps what was answered and ends; Done on the résumé step
  // reads a dropped file first. Either way the door's mark on the program goes (the person has seen it), you_done goes
  // out as #/you sends it, and opts.onDone() runs. The résumé step is the shell's form (ids #drop, #file, #file-status),
  // so a page holds one of these, or one résumé form, at a time. Returns a promise (the index loads first).
  function youInline(el, opts) {
    const o = opts || {}, YI = YOU.inline;
    return Atlas.index().then(ix => {
      if (!el || !el.isConnected) return;
      const y0 = state.you || {};
      const a = { where: y0.where || null, stage: y0.stage || null, fields: new Set(y0.fields || []) };
      let i = Routes.You.firstStep(y0, Q.map(q => q.key)), seen = false;   // seen: the person picked a program here, or ended
      const save = () => { state.you = { ...(state.you || {}), where: a.where || null, stage: a.stage || null, fields: [...a.fields] }; if (seen) delete state.you.whereFrom; store.set("you", state.you); wiz = null; };
      const finish = async read => {
        if (read && pending && pending.words < 40) return;   // a file with too few words: its line stays on screen
        if (read) await takeResume();
        seen = true; save(); track("you_done");
        if (o.onDone) o.onDone();
      };
      const draw = () => {
        if (!el.isConnected) return;
        const q = Q[i], last = i === Q.length;
        const steps = `<div class="steps">${Array.from({ length: Q.length + 1 }, (_, k) => `<i class="${k <= i ? "done" : ""}"></i>`).join("")}</div>`;
        const nav = `<div class="row between yi-nav"><span>${i > 0 ? `<button type="button" class="btn quiet" data-yi="back">${esc(CM.back)}</button>` : ""}</span><span class="row"><button type="button" class="btn" data-yi="skip">${esc(YI.skip)}</button><button type="button" class="btn primary" data-yi="next">${esc(last ? YI.done : YOU.next)}</button></span></div>`;
        if (!last) {
          const on = id => q.multi ? a.fields.has(id) : a[q.key] === id;
          el.innerHTML = `<p class="small muted">${esc(YI.lead)}</p>${steps}<p class="eyebrow">${esc(fill(YOU.step, { i: i + 1, n: Q.length }))}</p><h3>${esc(q.title)}</h3>${q.hint ? `<p class="small muted">${esc(q.hint)}</p>` : ""}
            <div class="opts${q.multi ? " two" : ""}">${questionOpts(ix, q).map(([id, label, ex]) => `<button type="button" class="opt${on(id) ? " on" : ""}" data-opt="${esc(id)}" aria-pressed="${on(id)}">${esc(label)}${ex ? `<small>${esc(ex)}</small>` : ""}</button>`).join("")}</div>${nav}`;
          el.querySelectorAll("[data-opt]").forEach(b => b.onclick = () => {
            const id = b.dataset.opt;
            if (q.multi) { a.fields.has(id) ? a.fields.delete(id) : a.fields.add(id); save(); draw(); return; }
            a[q.key] = id; if (q.key === "where") seen = true; save(); i++; draw();
          });
        } else {
          el.innerHTML = `<p class="small muted">${esc(YI.lead)}</p>${steps}<p class="eyebrow">${esc(YOU.lastStep)}</p><h3>${esc(YOU.addResume)}</h3><p class="small muted">${esc(YOU.resumeLead)}</p>${resumeForm()}${nav}`;
          wireResumeForm();
        }
        const btn = k => el.querySelector(`[data-yi="${k}"]`);
        if (btn("back")) btn("back").onclick = () => { i--; draw(); };
        btn("skip").onclick = () => finish(false);
        btn("next").onclick = () => { if (last) { finish(true); return; } if (!q.multi && !a[q.key]) return; i++; draw(); };
      };
      draw();
    });
  }
  // the About you pieces other screens draw with (Networking, agent E's #/network): plain functions on one object
  window.AtlasUI = Object.assign(window.AtlasUI || {}, { youInline, youAnswered, youLine });
  // "#/you" is the summary once anything is known; "#/you?step=N" opens the wizard at one question to change it
  async function you() {
    const ix = await Atlas.index();
    if (!ix.roles[Atlas.productKey("pm")]) Atlas.product().then(() => { if (wiz && location.hash.startsWith("#/you")) you(); }).catch(() => { });   // the product field's example roles
    crumbs([[YOU.crumb, null]]); showAside(null);
    const { query } = Routes.parseRoute(location.hash);
    const editing = query.step != null;
    if (!editing && !wiz && (state.you || state.resume)) return youSummary(ix);
    // from the start screen's stage card (?from=start) the stage is answered already, so the wizard skips that question
    if (!wiz) wiz = { step: editing ? Math.max(0, Math.min(Q.length, Number(query.step) || 0)) : 0, back: editing, skipStage: query.from === "start" && !!(state.you || {}).stage, answers: { ...(state.you || {}), fields: new Set((state.you || {}).fields || []) } };
    const forward = () => { wiz.step++; if (wiz.step === 1 && wiz.skipStage) wiz.step++; }, backward = () => { wiz.step--; if (wiz.step === 1 && wiz.skipStage) wiz.step--; };
    const render = () => {
      const n = Q.length + 1, i = wiz.step;
      const steps = `<div class="steps">${Array.from({ length: n }, (_, k) => `<i class="${k <= i ? "done" : ""}"></i>`).join("")}</div>`;
      const after = wiz.back ? "#/you" : "#/explore";
      const nav = (nextLabel, nextAction) => `<div class="row between" style="margin-top:16px"><button type="button" class="btn quiet" id="back">${esc(CM.back)}</button><span class="row">${i === Q.length ? `<a class="btn" href="${after}" id="skip">${esc(YOU.skip)}</a>` : ""}<button type="button" class="btn primary" id="next">${esc(nextLabel)}</button></span></div>`;
      if (i < Q.length) {
        const q = Q[i];
        // the options with their examples (questionOpts); all eleven fields sit above the fold in two columns
        const opts = questionOpts(ix, q);
        const on = id => q.multi ? wiz.answers.fields.has(id) : wiz.answers[q.key] === id;
        page(`${steps}<p class="eyebrow">${esc(fill(YOU.step, { i: i + 1, n: Q.length }))}</p><h1>${esc(q.title)}</h1>${q.hint ? `<p class="lead">${esc(q.hint)}</p>` : ""}
          <div class="opts${q.multi ? " two" : ""}">${opts.map(([id, label, ex]) => `<button type="button" class="opt${on(id) ? " on" : ""}" data-opt="${esc(id)}" aria-pressed="${on(id)}">${esc(label)}${ex ? `<small>${esc(ex)}</small>` : ""}</button>`).join("")}</div>${nav(YOU.next)}`, true);
        if (q.multi) main.firstElementChild.classList.add("roomy");   // two columns of cards need more than the narrow column
        main.querySelectorAll("[data-opt]").forEach(b => b.onclick = () => { const id = b.dataset.opt; if (q.multi) { wiz.answers.fields.has(id) ? wiz.answers.fields.delete(id) : wiz.answers.fields.add(id); render(); } else { wiz.answers[q.key] = id; forward(); render(); } });
        $("#next").onclick = () => { if (!q.multi && !wiz.answers[q.key]) return; forward(); render(); };
        $("#back").onclick = () => { if (i === 0) { const b = wiz.back; wiz = null; location.hash = b ? "#/you" : "#/home"; } else { backward(); render(); } };
        return;
      }
      page(`${steps}<p class="eyebrow">${esc(YOU.lastStep)}</p><h1>${esc(YOU.addResume)}</h1>
        <p class="lead">${esc(YOU.resumeLead)}</p>
        ${resumeForm()}${nav(YOU.showRoles)}`, true);
      wireResumeForm();
      $("#back").onclick = () => { backward(); render(); };
      $("#skip").onclick = () => saveYou();
      $("#next").onclick = async () => { await takeResume(); saveYou(); location.hash = after; if (location.hash === after) you(); };
    };
    const saveYou = () => { state.you = { where: wiz.answers.where || null, stage: wiz.answers.stage || null, fields: [...wiz.answers.fields] }; store.set("you", state.you); wiz = null; track("you_done"); };
    render();
  }
  // What the system knows (owner's choice Y3, B and A): the answers with an edit link each, what the resume gave,
  // and the fields it all points to with the reason for each. "About you" in the top bar opens this, not question 1.
  async function youSummary(ix) {
    const y = state.you || {}, r = state.resume, rg = r ? await rough() : null;
    const { fields, why } = await fitFields();
    // a row is one link: clicking anywhere on it opens the page (owner's choice 2026-10-24); the label at the right says where
    const row = (t, m, link) => link ? `<a class="r" href="${link[1]}"><span class="t">${t}</span><span class="n">${link[0]}</span><span class="m">${m}</span></a>` : `<div class="r"><span class="t">${t}</span><span class="m">${m}</span></div>`;
    const chosen = (y.fields || []).map(id => (ix.groups.find(g => g.id === id) || {}).label).filter(Boolean);
    const answers = `<div class="list">${row(esc(YOU.study), y.where ? esc(WHERE[y.where]) : esc(YOU.notAnswered), [esc(CM.editLower), "#/you?step=0"])}${row(esc(YOU.stage), y.stage ? esc(STAGE[y.stage]) : esc(YOU.notAnswered), [esc(CM.editLower), "#/you?step=1"])}${row(esc(YOU.fields), chosen.length ? esc(chosen.join(", ")) : esc(YOU.noFields), [esc(CM.editLower), "#/you?step=2"])}</div>`;
    const closest = rg ? Object.entries(rg.scores).filter(([id, v]) => v > 0 && ix.roles[id]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => `<a href="#/role/${esc(id)}">${esc(ix.roles[id].label)}</a>`) : [];
    const resume = r ? `<div class="list">${row(esc(r.name), esc(fill(YOU.resumeLine, { words: fmt(r.words) })), [esc(YOU.replace), "#/you?step=3"])}${row(esc(YOU.closest), closest.length ? closest.join(" · ") : esc(YOU.noRole), null)}</div>` : `<p class="small muted" style="margin-top:8px">${esc(YOU.noResume)} <a class="link" href="#/you?step=3">${esc(YOU.addOne)}</a> ${esc(YOU.addOneAfter)}</p>`;
    const fieldRows = [...fields].map(id => ix.groups.find(g => g.id === id)).filter(Boolean).sort((a, b) => (b.nOpen || 0) - (a.nOpen || 0)).map(g => row(esc(g.label), esc(why.get(g.id)), [esc(CM.openArrow), "#/field/" + g.id]));
    // a person who knows the role (stage targeting) gets the role first (v16 step 2): a search over every role's label,
    // and the three roles closest to the resume once one is read
    const lead = Stage.youLead(y.stage);
    const roleOpts = Object.values(ix.roles).map(r => ({ id: r.id, label: r.label, group: (ix.groups.find(g => g.id === r.group) || {}).label || r.group }));
    const dup = new Set(roleOpts.map(r => r.label).filter((l, i, a) => a.indexOf(l) !== i));
    for (const r of roleOpts) r.name = dup.has(r.label) ? `${r.label} · ${r.group}` : r.label;
    const roleSearch = lead === "role-search" ? `<h2>${esc(YOU.roleSearch)}</h2><div class="role-search"><input type="search" id="role-q" list="role-names" placeholder="${esc(YOU.rolePlaceholder)}" aria-label="${esc(YOU.roleAria)}" autocomplete="off"><datalist id="role-names">${roleOpts.map(r => `<option value="${esc(r.name)}">`).join("")}</datalist><button type="button" class="btn primary" id="role-go">${esc(YOU.roleGo)}</button></div><p class="small muted" id="role-hint">${closest.length ? fill(esc(YOU.closestHint), { roles: closest.join(" · ") }) : esc(fill(YOU.roleHint, { roles: roleOpts.length, fields: ix.groups.length }))}</p>` : "";
    // what the games recorded, role by role (PLAN.md v12, decision 4)
    const GS = window.GameShell, roles = GS ? Object.entries(GS.record.read().roles) : [];
    let P = null; if (roles.some(([id]) => (ix.roles[id] || {}).set === "product" || id.startsWith("product."))) P = await Atlas.product().catch(() => null);
    const knowRows = roles.filter(([id]) => ix.roles[id]).map(([id, r]) => { const k = GS.record.summary(GS.record.read(), id, GS.record.asksOf(ix, P, id)); const parts = [k.total ? fill(YOU.asksKnown, { n: k.known.length, m: k.total }) : null, k.ladders.length ? fill(k.ladders.length === 1 ? YOU.ladderSorted : YOU.laddersSorted, { n: k.ladders.length }) : null, k.postings ? fill(k.postings === 1 ? YOU.postingRead : YOU.postingsRead, { n: k.postings }) : null, k.demand ? fill(k.demand === 1 ? YOU.pairSeen : YOU.pairsSeen, { n: k.demand }) : null].filter(Boolean); return { id, label: ix.roles[id].label, n: k.known.length, line: parts.join(" · ") || YOU.played, updated: r.updated || "" }; }).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map(x => row(esc(x.label), esc(x.line), [esc(CM.openLower), "#/role/" + x.id]));
    page(`<h1>${esc(YOU.heading)}</h1><p class="lead">${esc(YOU.lead)}</p>${roleSearch}
      <div class="two"><div><h2>${esc(YOU.answers)}</h2>${answers}</div><div><h2>${esc(YOU.resume)}</h2>${resume}</div></div>
      <h2>${esc(YOU.fitFields)}</h2>${fieldRows.length ? `<div class="list">${fieldRows.join("")}</div>` : `<p class="small muted">${esc(YOU.noFitFields)}</p>`}
      ${knowRows.length ? `<h2>${esc(YOU.games)}</h2><p class="small muted">${esc(YOU.gamesLead)}</p><div class="list you-know">${knowRows.join("")}</div>` : ""}
      <div class="row" style="margin-top:20px"><a class="btn primary" href="#/explore">${esc(YOU.exploreFields)}</a><button type="button" class="btn quiet" id="start-over">${esc(YOU.startOver)}</button></div>`);
    $("#start-over").onclick = () => { state.you = null; state.resume = null; state.rough = null; state.match = null; state.fit = null; store.set("you", null); store.set("resume", null); if (window.Infer) Infer.forget(); Atlas.useInferred(null, []); wiz = null; you(); };
    const rq = $("#role-q");
    if (rq) {
      const find = v => { const t = v.trim().toLowerCase(); if (!t) return null; return roleOpts.find(r => r.name.toLowerCase() === t) || roleOpts.find(r => r.label.toLowerCase() === t) || roleOpts.filter(r => r.name.toLowerCase().includes(t)).sort((a, b) => a.name.length - b.name.length)[0] || null; };
      const go = () => { const r = find(rq.value); if (r) location.hash = "#/role/" + r.id; else $("#role-hint").textContent = YOU.noSuchRole; };
      rq.onchange = () => { if (roleOpts.some(r => r.name === rq.value)) go(); };
      rq.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); go(); } };
      $("#role-go").onclick = go;
    }
  }
  // one line on Explore that says what we know and why each field is there (owner's choices Y3 A and E3)
  function profileStrip(ix, why) {
    const y = state.you || {}, label = id => (ix.groups.find(g => g.id === id) || {}).label || id;
    const chosen = [...why].filter(([, w]) => w === YOU.why.picked).map(([id]) => label(id));
    const fromResume = [...why].filter(([, w]) => w !== YOU.why.picked).map(([id]) => label(id));
    const parts = [y.where ? esc(WHERE_SHORT[y.where] || WHERE[y.where]) : null, y.stage ? esc(STAGE_SHORT[y.stage] || STAGE[y.stage]) : null, chosen.length ? `<b>${esc(join(chosen))}</b> ${esc(YOU.strip.chosen)}` : null, fromResume.length ? `<b>${esc(join(fromResume))}</b> ${esc(YOU.strip.fromResume)}` : state.resume ? esc(YOU.strip.noField) : esc(YOU.strip.noResume)].filter(Boolean);
    return `<div class="strip"><span class="dotg"></span><span>${parts.join(" · ")}</span><a href="#/you">${esc(CM.edit)}</a></div>`;
  }
  // the resume: a drop zone and what was read. A file only: the paste box went on 2026-11-01 (owner's feedback) from
  // every screen that draws this form (About you, home's inline questions, the fit screen, #/skills, the class picker)
  // and from the rail's own drop; the posting and course forms keep theirs (wireFileDrop)
  let pending = null;   // { text, name, words } read from a file but not yet taken
  function resumeForm() {
    const r = state.resume;
    return `<div class="drop" id="drop"><p><b>${esc(RF.drop)}</b> ${esc(RF.or)} <label class="link" for="file">${esc(RF.choose)}</label></p><input type="file" id="file" accept=".pdf,.docx,.txt,.md" hidden><p class="small muted" id="file-status">${r ? `${esc(fill(RF.using, { name: r.name, words: fmt(r.words) }))} <button type="button" class="linkish link" id="forget">${esc(RF.forget)}</button>` : ""}</p></div>`;
  }
  function wireResumeForm() {
    const drop = $("#drop"), status = $("#file-status");
    const read = async file => {
      status.textContent = fill(RF.reading, { name: file.name });
      processing("file");
      try {
        let text;
        if (/\.pdf$/i.test(file.name)) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
          const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; const t = [];
          for (let p = 1; p <= pdf.numPages; p++) { const pg = await pdf.getPage(p); const c = await pg.getTextContent(); t.push(c.items.map(i => i.str + (i.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+\n/g, "\n")); }
          text = t.join("\n");
        } else if (/\.docx$/i.test(file.name)) text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
        else text = await file.text();
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        pending = { text, name: file.name, words };
        processing(null);
        status.textContent = words < 40 ? fill(RF.fewWords, { name: file.name, words }) : fill(RF.read, { name: file.name, words: fmt(words) });
      } catch (e) { processing(null); status.textContent = fill(RF.cantRead, { message: e.message }); pending = null; }
    };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0] && !drop.classList.contains("busy")) read(e.dataTransfer.files[0]); };
    $("#file").onchange = e => { if (e.target.files[0] && !drop.classList.contains("busy")) read(e.target.files[0]); };
    const forget = $("#forget"); if (forget) forget.onclick = () => { state.resume = null; state.rough = null; state.match = null; state.fit = null; store.set("resume", null); if (window.Infer) Infer.forget(); Atlas.useInferred(null, []); status.textContent = RF.forgotten; };
  }
  // keep the file the form read (40 words or more); nothing new keeps what was stored
  // The processing state (owner, 2026-11-01: an upload that waits on the model read looked like it had not taken, so
  // people uploaded again). The drop zone turns into the list of steps with the one running marked, the Read button
  // reads "Reading…" and is disabled, and the zone takes no second file until the read is done; `step` null restores
  // the zone. The steps: file (the reader), match (the patterns' read), infer (the model read, up to 20 s).
  const STEPS = ["file", "match", "infer"];
  function processing(step) {
    const drop = $("#drop"); if (!drop) return;
    const btn = document.querySelector("#rail-read, #lf-read, #go, #cls-read, #next");
    let box = drop.querySelector(".proc");
    if (!step) { drop.classList.remove("busy"); if (box) box.remove(); if (btn && btn.dataset.label) { btn.textContent = btn.dataset.label; btn.disabled = false; delete btn.dataset.label; } return; }
    drop.classList.add("busy");
    if (!box) { box = document.createElement("div"); box.className = "proc"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); drop.appendChild(box); }
    const i = STEPS.indexOf(step);
    box.innerHTML = `<ul>${STEPS.map((k, j) => `<li class="${j < i ? "done" : j === i ? "now" : ""}"><span class="pm" aria-hidden="true">${j < i ? "✓" : j === i ? "" : "·"}</span>${esc(RF.steps[k])}</li>`).join("")}</ul><p class="small muted">${esc(RF.wait)}</p>`;
    if (btn && !btn.dataset.label) { btn.dataset.label = btn.textContent; btn.textContent = RF.working; btn.disabled = true; }
  }
  let taking = null;   // the read in flight: a second click or drop joins it instead of starting over
  function takeResume() { return taking || (taking = takeResumeNow().finally(() => { taking = null; })); }
  async function takeResumeNow() {
    const r = pending && pending.words >= 40 ? pending : null;
    if (!r) return false;
    processing("match");
    state.resume = r; store.set("resume", r); pending = null; state.match = null; state.rough = null; state.fit = null;
    Atlas.useInferred(r.text, []);
    track("resume_read");
    try {
      await rough();
      processing("infer");
      await inferResume();
    } finally { processing(null); }
    return true;
  }
  // The model read (web/infer.js, 2026-11-01): the skills the resume shows without naming them, after the patterns'
  // read (its `shown` tells the route what is already credited). Saved on the stored resume as `inferred` and bound to
  // its text for every matcher Atlas hands out (Atlas.useInferred), so the fit, the rail, the launcher, Find jobs, the
  // classes and Who to meet all read it. Awaited by takeResume (the "reading" state covers it; Infer gives up after
  // 20 s); [] when it is off, has no route or fails. Returns true when the read changed what the screens show.
  async function inferResume() {
    const r = state.resume; if (!r || !window.Infer) return false;
    const rg = await rough().catch(() => null); if (!rg || state.resume !== r) return false;
    const list = await Infer.read(r.text, [...rg.shown], "both");
    if (state.resume !== r) return false;
    r.inferred = list; store.set("resume", r); Atlas.useInferred(r.text, list);
    if (!list.length) return false;
    state.rough = null; state.match = null; state.fit = null; matchCache.clear(); for (const k of Object.keys(gapsCache)) delete gapsCache[k];
    await rough();
    return true;
  }
  // a resume stored before the model read (no `inferred` yet) is read once, in the background, and the screen redrawn
  if (state.resume && !Array.isArray(state.resume.inferred)) setTimeout(() => inferResume().then(changed => { if (changed) route(); }).catch(() => { }), 0);
  async function rough() { if (state.resume && !state.rough) state.rough = await Atlas.roughFit(state.resume.text); return state.rough; }
  // the fields that fit, each with its reason: the ones chosen, then those of the roles held and of the five roles
  // the resume reads closest to
  async function fitFields() {
    const ix = await Atlas.index(); const why = new Map();
    for (const id of (state.you || {}).fields || []) if (ix.groups.some(g => g.id === id)) why.set(id, YOU.why.picked);
    const rg = await rough();
    if (rg) {
      for (const h of rg.held) if (ix.roles[h] && !why.has(ix.roles[h].group)) why.set(ix.roles[h].group, fill(YOU.why.held, { role: ix.roles[h].label }));
      for (const [id] of Object.entries(rg.scores).sort((a, b) => b[1] - a[1]).slice(0, 5)) if (ix.roles[id] && rg.scores[id] > 0 && !why.has(ix.roles[id].group)) why.set(ix.roles[id].group, fill(YOU.why.close, { role: ix.roles[id].label }));
    }
    return { fields: new Set(why.keys()), why };
  }

  // ---------- 2b. Find jobs (v19 B4): one search over every open US posting of both role sets ----------
  // The rows are web/data/jobs_open.json (pipeline.jobs_open; column-oriented, loaded once per page and expanded by
  // Jobs.rowsOf); the logic is web/jobs.js (the owner's search_logic.md); the layout is the J4 mock. The hash is
  // the state (#/jobs?q=…&field=…&open=…), written with replaceState so Back is one step per screen, not per click.
  // With a résumé on file the rough read's skills (rough().shown) give each posting "N of the M skills this posting
  // asks for", never a percentage, and Fit is the default sort. The only event sent is posting_link, through the
  // document-level [data-posting] handler above, the way the role screen sends it.
  let jobsP = null;
  const jobsData = () => jobsP ||= Promise.all([Atlas.fetchJson("data/jobs_open.json"), Atlas.index()]).then(([D, ix]) => {
    const rows = Jobs.rowsOf(D), byId = new Map(rows.map(r => [r.id, r]));
    const roleLabel = id => Atlas.us((D.role_labels || {})[id] || (ix.roles[id] || {}).label || id);
    const fieldOf = id => (ix.roles[id] || {}).group || Jobs.fieldOfRole(id);
    const skillName = i => { const sk = ix.skillById[D.skill_ids[i]]; return sk ? sk.name : D.skill_ids[i]; };
    const ctx = { roleName: r => roleLabel(r.role), skillNames: r => r.skills.map(skillName), fieldOf };
    const fields = ix.groups.map(g => [g.id, Atlas.us(g.label)]);
    return { D, ix, rows, byId, ctx, roleLabel, fieldOf, skillName, fields };
  }).catch(e => { jobsP = null; throw e; });
  const JB = Copy.jobs;
  const groupLabel = g => g === "startup" ? JB.groupStartup : g === "mba_employer" ? JB.groupMBA : /^fortune(\d+)$/.test(String(g || "")) ? fill(JB.groupFortune, { n: RegExp.$1 }) : String(g || "");
  const KIND_ORDER = ["method", "technical", "knowledge", "tool", "practice", "behaviour", "credential"];
  const jobWho = r => r.intern ? JB.who.intern : r.entry === "mba" ? JB.who.mba : (r.entry === "pre_mba" || r.entry === "grad") ? JB.who.grads : null;
  const labelIn = (pairs, id) => (pairs.find(([v]) => v === id) || [, id])[1];
  // the role chosen elsewhere, for the role filter when a person arrives with none set: the role screen's (state.R),
  // else the first the class picker keeps in this browser (classes.roles), the same id gapsFor is handed
  const chosenRole = () => state.roleId || (store.get("classes.roles") || [])[0] || null;
  async function jobsScreen() {
    crumbs([[CM.home, "#/home"], [JB.heading, null]]); showAside(null);
    page(`<h1>${esc(JB.heading)}</h1><p class="lead">${esc(JB.loading)}</p>`);
    let J;
    try { J = await jobsData(); } catch (e) { console.error(e); page(`<h1>${esc(JB.heading)}</h1><p class="lead">${esc(JB.loadFailed)}</p>`); return; }
    const rg = state.resume ? await rough().catch(e => { console.error(e); return null; }) : null;
    if (Routes.parseRoute(location.hash).name !== "jobs") return;   // the person moved on while the file loaded
    const { D, ix, rows, byId, ctx, roleLabel, fieldOf, skillName, fields } = J;
    const have = rg ? rg.shown : null;   // the skill ids the résumé shows, or null without one
    const fieldLabel = id => labelIn(fields, id);
    const kindLabel = k => ((ix.M.meta.kinds || {})[k] || {}).label || k;
    const roleOk = id => !!id && D.roles.includes(id);
    // the state: the hash, with the chosen role when the person arrives with nothing set, and Fit with a résumé
    const s = Jobs.parseState(location.hash);
    if (!location.hash.includes("?")) { let r = chosenRole(); if (r && !roleOk(r)) r = Atlas.productKey(r); if (roleOk(r)) s.role = r; }
    if (s.role && !roleOk(s.role)) s.role = "";
    if (s.field && !fields.some(([id]) => id === s.field)) s.field = "";
    if (s.role && !s.field) s.field = fieldOf(s.role);
    if (s.role && s.field && fieldOf(s.role) !== s.field) s.role = "";
    if (have && !/[?&]sort=/.test(location.hash)) s.sort = "fit";
    if (s.sort === "fit" && !have) s.sort = "best";
    const writeHash = () => {
      let q = Jobs.stateQuery(s); if (have && s.sort === "best") q += (q ? "&" : "") + "sort=best";   // with a résumé, Best match is a choice, so it stays in the link
      const next = "#/jobs" + (q ? "?" + q : "");
      if (location.hash !== next) history.replaceState(null, "", location.pathname + location.search + next);
    };
    const note = have
      ? `${esc(JB.noteResume)} <a href="#/you">${esc(JB.noteResumeLink)}</a>.`
      : `<a href="#/you">${esc(JB.noteNoResume)}</a> ${esc(JB.noteNoResumeAfter)}`;
    const sortOptions = () => [...(have ? ["fit"] : []), "best", "company"].map(v => `<option value="${v}"${s.sort === v ? " selected" : ""}>${esc(JB.sorts[v])}</option>`).join("");
    page(`<h1>${esc(JB.heading)}</h1>
      <p class="lead">${esc(fill(JB.lead, { n: fmt(rows.length), m: fmt(D.companies.length) }))}</p>
      <form class="jsearch" id="jsearch" role="search"><input type="search" name="q" value="${esc(s.q)}" placeholder="${esc(JB.searchPlaceholder)}" aria-label="${esc(JB.searchAria)}"><input type="search" name="loc" value="${esc(s.loc)}" placeholder="${esc(JB.locPlaceholder)}" aria-label="${esc(JB.locAria)}"><button type="submit" class="btn primary">${esc(JB.search)}</button></form>
      <div class="jobs-grid">
        <div class="jrail"><div class="facets" id="jrail"></div><p class="small muted jnote">${note}</p></div>
        <section class="jmain" aria-label="${esc(JB.postingsAria)}"><div class="jhead"><p class="jcount" id="jcount"></p><label class="jsort">${esc(JB.sort)} <select id="jsort" aria-label="${esc(JB.sort)}">${sortOptions()}</select></label></div><div class="chips jactive" id="jactive"></div><div class="jlist" id="jlist"></div><div class="pager" id="jpager"></div></section>
      </div>`);
    const pageEl = main.querySelector(".page"); pageEl.classList.add("jobs-page");
    const form = $("#jsearch"), railEl = $("#jrail");
    // ---- the fit, the cards and the panel ----
    const fitOf = r => Jobs.fitOf(r, have, D.skill_ids);
    const tagOf = i => `<span class="tag${have && have.has(D.skill_ids[i]) ? " good" : ""}">${esc(skillName(i))}</span>`;
    const chips = r => {
      const ids = r.skills, N = 6, sorted = have ? [...ids].sort((a, b) => (have.has(D.skill_ids[b]) ? 1 : 0) - (have.has(D.skill_ids[a]) ? 1 : 0)) : ids;
      return `<div class="tags jtags">${sorted.slice(0, N).map(tagOf).join("")}${ids.length > N ? `<span class="tag thin">${esc(fill(JB.moreSkills, { n: ids.length - N }))}</span>` : ""}</div>`;
    };
    let fits = null, dupes = {}, lastSearched = [], moreCompanies = false;
    // a posting that lists many cities keeps its whole location in the panel; the card cuts it at a break
    const shortLoc = loc => loc.length > 64 ? loc.slice(0, 60).replace(/[\s;,]+[^\s;,]*$/, "") + "…" : loc;
    const card = r => {
      const w = jobWho(r), fit = fits && fits.get(r.id);
      return `<article class="jcard${s.open === r.id ? " on" : ""}" data-id="${esc(r.id)}">
        <div class="jtop"><div><p class="eyebrow">${esc(r.company)} · ${esc(groupLabel(r.group))}</p><h3 class="jt"><button type="button" class="linkish" data-open="${esc(r.id)}">${esc(r.title)}</button></h3></div><span class="tag thin lvl">${esc(Jobs.levelLabel(r))}</span></div>
        <p class="facts">${[fieldLabel(fieldOf(r.role)), roleLabel(r.role), shortLoc(r.location)].filter(Boolean).map(esc).join(" · ")}</p>
        ${w ? `<p class="small jwho">${esc(w)}.</p>` : ""}
        ${fit ? `<p class="small jfit">${esc(Jobs.fitLine(fit))}</p>` : ""}
        ${chips(r)}
      </article>`;
    };
    const panel = r => {
      const fit = have ? fitOf(r) : null, w = jobWho(r), n = dupes[r.id] || 0;
      const facts = [roleLabel(r.role), Jobs.levelLabel(r), r.location, r.remote ? JB.remote : null, r.sponsorship === "yes" ? JB.sponsorsVisa : null].filter(Boolean);
      const byKind = {}; for (const i of r.skills) { const sk = ix.skillById[D.skill_ids[i]]; (byKind[sk && KIND_ORDER.includes(sk.kind) ? sk.kind : "other"] ||= []).push(i); }
      const kinds = [...KIND_ORDER, "other"].filter(k => byKind[k]).map(k => `${k === "other" ? "" : `<p class="eyebrow kind">${esc(kindLabel(k))}</p>`}<div class="tags">${byKind[k].map(tagOf).join("")}</div>`).join("");
      return `<button type="button" class="close" aria-label="${esc(CM.close)}">×</button><div class="card jdetail">
        <p class="eyebrow">${esc(r.company)} · ${esc(groupLabel(r.group))}${r.sector ? " · " + esc(r.sector) : ""}</p><h2>${esc(r.title)}</h2>
        <p class="facts">${facts.map(esc).join(" · ")}</p>
        ${w ? `<p class="small jwho">${esc(w)}.</p>` : ""}
        ${fit ? `<p class="small">${esc(Jobs.fitLine(fit))}</p>` : `<p class="small muted"><a href="#/you">${esc(JB.addResume)}</a> ${esc(JB.addResumeAfter)}</p>`}
        <p class="jacts"><a class="btn primary" href="${esc(r.url)}" target="_blank" rel="noopener" data-posting="${esc(r.role)}">${esc(fill(JB.openAt, { company: r.company }))}</a></p>
        <h3>${esc(r.skills.length === 1 ? JB.skillAsks : fill(JB.skillsAsk, { n: fmt(r.skills.length) }))}</h3>${kinds}
        ${n ? `<p class="small muted">${esc(n === 1 ? JB.dupeOne : fill(JB.dupes, { n: fmt(n) }))} ${esc(fill(JB.dupeAfter, { company: r.company, where: r.location ? fill(JB.dupeWhere, { location: r.location }) : "" }))}</p>` : ""}
      </div>`;
    };
    const mark = () => pageEl.querySelectorAll(".jcard").forEach(c => c.classList.toggle("on", c.dataset.id === s.open));
    let panelFor = null;   // the posting the panel shows, so a filter change does not redraw it under the reader
    const drawPanel = () => {
      const r = s.open ? byId.get(s.open) : null;
      if (!r) { s.open = ""; panelFor = null; showAside(null); return; }
      if (panelFor === r.id && !aside.hidden) return;
      panelFor = r.id; showAside(panel(r));
      aside.querySelector(".close").onclick = () => { s.open = ""; panelFor = null; mark(); showAside(null); writeHash(); };
    };
    const openPosting = id => { s.open = id; mark(); drawPanel(); writeHash(); };
    // ---- the rail: each facet with the count it would leave on; one that would leave none is plain ----
    // which facets are open: Field always, so a person starts by picking a field (owner's feedback 2026-11-01); every
    // other facet only when the person opens it (owner's feedback 2026-11-01, second pass: neither a picked field nor a
    // role page's preset role opens one; the chips over the list show what is on). A person's own open and close are
    // kept until "Clear filters", which sets these defaults again.
    const openedFor = () => ({ field: true, role: false, level: false, entry: false, group: false, company: false, work: false });
    const opened = openedFor();
    railEl.addEventListener("toggle", e => { const d = e.target; if (d.dataset && d.dataset.group) opened[d.dataset.group] = d.open; }, true);
    const facetRow = (key, val, label, n, on) => {
      const dead = !on && !n;
      return `<button type="button" class="frow${on ? " on" : ""}${dead ? " dead" : ""}"${dead ? ` title="${esc(JB.dead)}" aria-disabled="true"` : ` data-key="${key}" data-val="${esc(String(val))}"`} aria-pressed="${on}">${esc(label)}<span class="n">${fmt(n)}</span></button>`;
    };
    const group = (key, label, pairs, counts, extra) => `<details data-group="${key}"${opened[key] ? " open" : ""}><summary>${esc(label)}</summary>${pairs.map(([v, l]) => facetRow(key, v, l, counts[v] || 0, key === "remote" || key === "sponsor" ? !!s[key] : s[key] === v)).join("")}${extra || ""}</details>`;
    const rail = (searched, f) => {
      const roleIds = s.field ? D.roles.filter(id => fieldOf(id) === s.field) : D.roles;
      const roles = roleIds.map(id => [id, roleLabel(id)]).sort((a, b) => a[1].localeCompare(b[1]));
      const levels = Jobs.LEVEL_WORDS.labels;
      const count = (facet, pairs) => Jobs.facetCounts(searched, f, facet, pairs.map(([v]) => v), ctx);
      // the companies in one pass over the rows the other filters keep: the twenty with the most postings, then all
      const cm = {}; for (const r of Jobs.filterJobs(searched, Object.assign({}, f, { company: "" }), ctx)) cm[r.company] = (cm[r.company] || 0) + 1;
      const all = Object.entries(cm).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const top = all.slice(0, 20); if (s.company && cm[s.company] && !top.some(([n]) => n === s.company)) top.push([s.company, cm[s.company]]);
      const shown = moreCompanies ? all : top;
      const more = all.length > shown.length ? `<button type="button" class="frow more" data-more-companies="1">${esc(JB.more)}<span class="n">${fmt(all.length)}</span></button>` : "";
      const work = `<details data-group="work"${opened.work ? " open" : ""}><summary>${esc(JB.facets.work)}</summary>${facetRow("remote", true, JB.remoteFacet, count("remote", [[true]])[true], s.remote)}${facetRow("sponsor", true, JB.sponsorFacet, count("sponsor", [[true]])[true], s.sponsor)}</details>`;
      return group("field", JB.facets.field, fields, count("field", fields)) + group("role", JB.facets.role, roles, count("role", roles)) + group("level", JB.facets.level, levels, count("level", levels))
        + group("entry", JB.facets.entry, Jobs.ENTRIES, count("entry", Jobs.ENTRIES)) + group("group", JB.facets.group, Jobs.EMPLOYERS, count("group", Jobs.EMPLOYERS))
        + group("company", JB.facets.company, shown.map(([n]) => [n, n]), cm, more) + work;
    };
    // ---- each filter that is on, as a chip an × removes: over the list (the facets but the search, which its box
    // shows), so a role page's preset role is plain while its facet is closed; and the empty state (all of them) ----
    const activeChips = () => {
      const out = [];
      if (s.q.trim()) out.push(["q", fill(JB.quoted, { q: s.q.trim() })]); if (s.loc.trim()) out.push(["loc", fill(JB.inLoc, { loc: s.loc.trim() })]);
      if (s.field) out.push(["field", fieldLabel(s.field)]); if (s.role) out.push(["role", roleLabel(s.role)]);
      if (s.level) out.push(["level", labelIn(levelsOf(), s.level)]); if (s.entry) out.push(["entry", labelIn(Jobs.ENTRIES, s.entry)]);
      if (s.group) out.push(["group", labelIn(Jobs.EMPLOYERS, s.group)]); if (s.company) out.push(["company", s.company]);
      if (s.remote) out.push(["remote", JB.remoteFacet]); if (s.sponsor) out.push(["sponsor", JB.sponsorFacet]);
      return out;
    };
    const levelsOf = () => Jobs.LEVEL_WORDS.labels;
    const chipHtml = ([k, l]) => `<button type="button" class="chip on" data-remove="${k}" aria-label="${esc(fill(JB.remove, { label: l }))}">${esc(l)} <span class="n">×</span></button>`;
    const emptyState = () => `<div class="jempty"><p><b>${esc(JB.empty)}</b></p><p class="small muted">${esc(JB.removeOne)}</p><div class="chips">${activeChips().map(chipHtml).join("")}</div></div>`;
    // ---- the draw: search, filter, dedupe, sort, page ----
    const draw = () => {
      const f = Jobs.filterOf(s);
      const searched = lastSearched = Jobs.searchJobs(rows, s.q, ctx);
      const d = Jobs.dedupe(Jobs.filterJobs(searched, f, ctx)); dupes = d.dupes;
      fits = have ? new Map(d.rows.map(r => [r.id, fitOf(r)])) : null;
      const list = Jobs.sortJobs(d.rows, s.sort, fits), pg = Jobs.pageOf(list, s.page); s.page = pg.page;
      const active = !!(s.q.trim() || s.loc.trim() || Jobs.isFiltered(f));
      $("#jcount").innerHTML = esc(pg.total > Jobs.PAGE ? fill(JB.showing, { from: fmt(pg.from), to: fmt(pg.to), total: fmt(pg.total) }) : pg.total === 1 ? JB.posting : fill(JB.postings, { n: fmt(pg.total) })) + (active ? ` · <button type="button" class="linkish link" data-clear="1">${esc(JB.clearFilters)}</button>` : "");
      const on = pg.rows.length ? activeChips().filter(([k]) => k !== "q" && k !== "loc") : [];
      $("#jactive").innerHTML = on.map(chipHtml).join(""); $("#jactive").hidden = !on.length;
      $("#jlist").innerHTML = pg.rows.length ? pg.rows.map(card).join("") : emptyState();
      $("#jpager").innerHTML = pg.pages > 1 ? `<button type="button" class="btn" data-page="-1"${pg.page === 1 ? " disabled" : ""}>${esc(fill(JB.previous, { n: Jobs.PAGE }))}</button><span>${esc(fill(JB.pageOf, { p: fmt(pg.page), n: fmt(pg.pages) }))}</span><button type="button" class="btn" data-page="1"${pg.page === pg.pages ? " disabled" : ""}>${esc(fill(JB.next, { n: Jobs.PAGE }))}</button>` : "";
      railEl.innerHTML = rail(searched, f);
      drawPanel(); writeHash();
    };
    const syncInputs = () => { form.q.value = s.q; form.loc.value = s.loc; $("#jsort").value = s.sort; };
    const change = () => { s.page = 1; draw(); };
    const toggleFacet = (key, val) => {
      if (key === "remote" || key === "sponsor") s[key] = !s[key];
      else if (key === "field") { s.field = s.field === val ? "" : val; if (s.role && s.field && fieldOf(s.role) !== s.field) s.role = ""; }
      else if (key === "role") { s.role = s.role === val ? "" : val; if (s.role) s.field = fieldOf(s.role); }
      else s[key] = s[key] === val ? "" : val;
      change();
    };
    // ---- the wiring: one listener on the page, gone with it ----
    let timer = null;
    const readForm = () => { const q = form.q.value, loc = form.loc.value; if (q === s.q && loc === s.loc) return; s.q = q; s.loc = loc; change(); };
    form.onsubmit = e => { e.preventDefault(); clearTimeout(timer); readForm(); };
    form.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(readForm, 300); });
    $("#jsort").onchange = e => { s.sort = e.target.value; change(); };
    pageEl.addEventListener("click", e => {
      const t = e.target;
      if (t.closest("[data-clear]")) { const b = Jobs.blankState(); for (const k of Jobs.KEYS) if (k !== "sort" && k !== "open") s[k] = b[k]; Object.assign(opened, openedFor()); moreCompanies = false; syncInputs(); draw(); return; }
      const rm = t.closest("[data-remove]"); if (rm) { s[rm.dataset.remove] = Jobs.blankState()[rm.dataset.remove]; syncInputs(); change(); return; }
      if (t.closest("[data-more-companies]")) { moreCompanies = true; opened.company = true; railEl.innerHTML = rail(lastSearched, Jobs.filterOf(s)); return; }
      const fb = t.closest("[data-key]"); if (fb) { toggleFacet(fb.dataset.key, fb.dataset.val); return; }
      const pb = t.closest("[data-page]"); if (pb) { if (pb.disabled) return; s.page += Number(pb.dataset.page); draw(); $("#jlist").scrollIntoView({ block: "start" }); return; }
      const ob = t.closest("[data-open]"); if (ob) { openPosting(ob.dataset.open); return; }
      const c = t.closest(".jcard"); if (c && !t.closest("a")) openPosting(c.dataset.id);
    });
    draw();
  }

  // ---------- 3. explore: fields as circles ----------
  const sizeClass = n => n >= 4000 ? "s4" : n >= 1500 ? "s3" : n >= 600 ? "s2" : "s1";
  async function explore() {
    const ix = await Atlas.index(), EX = Copy.explore;
    crumbs([[EX.crumb, null]]); showAside(null);
    const focus = new URLSearchParams(location.hash.split("?")[1] || "").get("field");
    if (focus) SkillMap.setMode("map");
    const ff = (state.you || state.resume) ? await fitFields() : null, fit = ff ? ff.fields : null;
    // the map's colours (owner's decision 2026-10-24): the skills the roles of the fields that fit ask for, green when
    // the rough read of the resume shows them, blue when not; nothing without a resume
    const rg = state.resume ? await rough() : null;
    let overlay = null;
    if (rg && fit && fit.size) {
      const asked = new Set();
      for (const gid of fit) for (const rid of ((ix.groups.find(g => g.id === gid) || {}).roles || [])) { const r = ix.roles[rid]; if (!r) continue; for (const a of [...r.definingList, ...r.asks]) if (a.share >= Atlas.TIER.common && ix.skillById[a.id] && !["credentials", "domain"].includes(ix.skillById[a.id].cluster)) asked.add(a.id); }
      overlay = { have: new Set([...asked].filter(id => rg.shown.has(id))), todo: new Set([...asked].filter(id => !rg.shown.has(id))) };
    }
    const render = () => {
      // every field, the ones that fit first (owner's decision 2026-10-24: no "For you" filter)
      const all = [...ix.groups].sort((a, b) => ((fit && fit.has(b.id)) - (fit && fit.has(a.id))) || (b.nOpen || 0) - (a.nOpen || 0));
      const groups = all;
      const nRoles = all.reduce((a, g) => a + g.roles.length, 0);
      const chips = fit ? profileStrip(ix, ff.why) : "";
      const asMap = SkillMap.mode() === "map";
      const view = `<div class="filters explore-row">${asMap ? `<input class="sm-find" id="sm-find" type="search" placeholder="${esc(EX.findSkill)}" list="sm-names" aria-label="${esc(EX.findSkill)}"><datalist id="sm-names"></datalist>` : ""}<div class="seg views" role="group" aria-label="${esc(EX.viewAria)}"><button type="button" class="${asMap ? "" : "on"}" aria-pressed="${!asMap}" id="v-grid" title="${esc(EX.gridView)}">▦</button><button type="button" class="${asMap ? "on" : ""}" aria-pressed="${asMap}" id="v-map" title="${esc(EX.mapView)}">⊞</button></div></div>`;
      const pg = all.find(g => g.set === "product"), mg = all.find(g => g.set === "mba");
      const dates = tip(fill(EX.countsTip, { date: mg.generated, product: pg.generated ? fill(EX.countsTipProduct, { date: pg.generated, n: fmt(pg.nWorld) }) : "" }));
      const nOpen = g => g.nOpen == null ? EX.loading : fill(CM.nOpen, { n: fmt(g.nOpen) });
      const inner = g => `${esc(g.label)}<span class="n">${esc(nOpen(g))}</span>`;
      // a field card (owner's choice E2): the name, two or three of its roles marked as examples, one number; the ones
      // that fit carry their reason. The bar that compared the fields' counts went on 2026-11-01 (owner: it added nothing)
      const card = g => {
        const names = g.roles.map(r => (ix.roles[r] || {}).label).filter(Boolean), ex = names.slice(0, 3), more = names.length - ex.length, isFit = !!(fit && fit.has(g.id));
        return `<a class="fcard${isFit ? " you" : ""}" href="#/field/${esc(g.id)}"><span class="t">${esc(g.label)}</span><span class="m">${names.length ? `${esc(fill(EX.example, { names: ex.join(" · ") }))}${more > 0 ? esc(fill(more === 1 ? EX.moreRole : EX.moreRoles, { n: more })) : ""}` : esc(EX.loading)}</span><span class="n">${esc(nOpen(g))}${isFit ? ` · <span class="why">${esc(ff.why.get(g.id))}</span>` : ""}</span></a>`;
      };
      if (asMap) {
        // the fields on the skill map: a field's own skills beside it, the skills every field asks for in the middle
        const key = overlay ? `<span><i class="sw have"></i> ${esc(EX.key.have)}</span><span><i class="sw todo"></i> ${esc(EX.key.todo)}</span><span><i class="sw quiet"></i> ${esc(EX.key.quiet)}</span>` : `<span><i class="sw top"></i> ${esc(EX.key.top)}</span><span><i class="sw quiet"></i> ${esc(EX.key.rest)}</span>${fit && fit.size ? `<span><i class="sw you"></i> ${esc(EX.key.you)}</span>` : ""}`;
        page(`<h1>${esc(EX.heading)}</h1>
          <p class="lead">${esc(fill(EX.counts, { fields: all.length, roles: nRoles || 56 }))} ${esc(EX.mapLead)} ${dates}</p>${chips}${view}
          <div id="sm-plan"></div>
          <div class="sm-stage" id="sm-stage"></div>
          <p class="key swkey">${key}<button type="button" class="linkish link" id="sm-all">${esc(SkillMap.allShown() ? EX.fieldsAlone : EX.allSkills)}</button></p>`);
        main.firstElementChild.classList.add("wide");
        $("#sm-all").onclick = () => { SkillMap.showAll(!SkillMap.allShown()); $("#sm-all").textContent = SkillMap.allShown() ? EX.fieldsAlone : EX.allSkills; };
        const SIZE = { s1: 0.66, s2: 0.76, s3: 0.88, s4: 1 };
        SkillMap.stage($("#sm-stage"), { groups: all.map(g => ({ id: g.id, cls: sizeClass(g.nOpen || 0), you: !!(fit && fit.has(g.id)), inner: inner(g) })), sizeOf: g => SIZE[g.cls], fit, onlyFit: false, focus, aside, showAside, overlay });
        // the route planner (PLAN.md v12, SP2-C) lives in skillmap.js; the role in the hash (?role=) is its target
        SkillMap.planner($("#sm-plan"), { role: new URLSearchParams(location.hash.split("?")[1] || "").get("role") }).catch(console.error);
        SkillMap.names().then(ns => { const dl = $("#sm-names"); if (dl) dl.innerHTML = ns.map(n => `<option value="${esc(n)}">`).join(""); });
        const f = $("#sm-find"); f.onchange = () => SkillMap.find(f.value);
        $("#v-grid").onclick = () => { SkillMap.setMode("grid"); SkillMap.leave(); showAside(null); render(); };
        $("#v-map").onclick = () => { };
        return;
      }
      page(`<h1>${esc(EX.heading)}</h1>
        <p class="lead">${esc(fill(EX.counts, { fields: all.length, roles: nRoles || 56 }))} ${esc(EX.pickField)}${fit && fit.size ? " " + esc(EX.fitFirst) : ""} ${dates}</p>${chips}${view}
        <div class="fcards">${groups.map(card).join("")}</div>`);
      $("#v-map").onclick = () => { SkillMap.setMode("map"); render(); };
      $("#v-grid").onclick = () => { };
    };
    render();
    if (ix.groups.find(g => g.id === "product").nOpen == null) Atlas.product().then(() => { if (location.hash.startsWith("#/explore")) render(); }).catch(console.error);
  }

  // ---------- 3b. a field: its roles ----------
  async function field(id) {
    const ix = await Atlas.index();
    const g = ix.groups.find(x => x.id === id);
    if (!g) return explore();
    if (g.set === "product") await Atlas.product();
    const FD = Copy.explore.field;
    crumbs([[Copy.explore.crumb, "#/explore"], [g.label, null]]); showAside(null);
    const roles = g.roles.map(r => ix.roles[r]).sort((a, b) => b.nOpen - a.nOpen);
    const line = r => {
      const byId = r.set === "tech" ? ix.techSkillById : ix.skillById;   // the tech set's skills are in its own index
      const names = (r.definingList.length ? r.definingList : r.asks).slice(0, 2).map(x => (byId[x.id] || (state.R && state.R.skillById[x.id]) || { name: x.id }).name.replace(/\s*\(.*?\)/g, ""));
      return fill(r.definingList.length ? FD.standsOut : FD.asksMost, { names: join(names) });
    };
    const when = esc(fill(FD.when, { refreshed: g.generated ? fill(g.set === "product" ? FD.scraped : FD.refreshed, { date: g.generated }) : "", world: g.set === "product" ? fill(FD.world, { n: fmt(g.nWorld) }) : "" }));
    const rg = state.resume ? await rough() : null;
    const mark = r => !rg ? "" : rg.held.includes(r.id) ? ` · <span style="color:var(--primary)">${esc(FD.held)}</span>` : rg.scores[r.id] >= 0.6 ? ` · <span style="color:var(--primary)">${esc(FD.close)}</span>` : "";
    const anyMark = rg && roles.some(r => mark(r));
    // half and half (owner's decision 2026-10-24): the roles on the left, the field's skills on lanes on the right;
    // hovering a role lights its skills; a dot opens the skill card
    const closed = g.set !== "product" ? FD.recent : FD.open;
    // the chart and the skill map are the product and MBA sets' until their evals cover the tech set: a tech field lists its roles
    const charted = g.set !== "tech";
    page(`<div class="field-split"><div>
      <h1>${esc(g.label)}</h1>
      <p class="lead">${esc(roles.length === 1 ? FD.role : fill(FD.roles, { n: fmt(roles.length) }))} · <span data-measure="${when}">${esc(fill(FD.openPostings, { n: fmt(roles.reduce((a, r) => a + r.nOpen, 0)) }))}</span>. ${esc(FD.biggestFirst)}${anyMark ? " " + esc(FD.green) : ""}${charted ? ` <a href="#/explore?field=${esc(g.id)}" data-map>${esc(fill(FD.map, { field: g.label }))}</a>` : ""}</p>
      <div class="list">${roles.map(r => `<a class="r" href="#/role/${esc(r.id)}" data-role="${esc(r.id)}"><span class="t">${esc(r.label)}</span><span class="n">${esc(fill(CM.nOpen, { n: fmt(r.nOpen) }))}</span><span class="m">${r.blurb ? esc(r.blurb) + " " : ""}${esc(productLine(g, r, line))}${mark(r)}</span></a>`).join("")}</div>
      ${charted ? `<p class="small muted" style="margin-top:12px">${esc(FD.hover)}</p>` : ""}
      </div><div${charted ? "" : " hidden"}>
      <div class="chart-stage" id="chart"></div>
      <p class="small muted chart-x">${esc(fill(FD.axis, { field: g.label }))} <span class="mark" data-measure="${esc(fill(FD.axisMeasure, { postings: closed, field: g.label }))}">ⓘ</span>${rg ? ` · <span class="sw have"></span> ${esc(FD.have)} · <span class="sw todo"></span> ${esc(FD.todo)}` : ""}</p>
      </div></div>`);
    main.firstElementChild.classList.add("wide");
    if (!charted) return;
    SkillMap.chart($("#chart"), { field: g.id, label: g.label, roles, shown: rg ? rg.shown : null, aside, showAside });
    main.querySelectorAll("[data-role]").forEach(a => { a.onmouseenter = () => SkillMap.chartLight(a.dataset.role); a.onmouseleave = () => SkillMap.chartLight(null); });
  }
  function productLine(g, r, line) {
    if (g.set !== "product") return line(r);
    return fill(Copy.explore.field.asksMost, { names: join(r.asks.slice(0, 2).map(x => x.id).map(id => (state.R && state.R.skillById[id] ? state.R.skillById[id].name : nameFromProduct(id)).replace(/\s*\(.*?\)/g, ""))) });
  }
  let productNames = null;
  function nameFromProduct(id) { return (productNames && productNames[id]) || id; }
  Atlas.product().then(P => { productNames = Object.fromEntries(P.G.skills.map(s => [s.id, s.name])); }).catch(() => { });

  // ---------- 4. a role: the skill grid, the side panel, the postings ----------
  async function loadRole(id) {
    if (!state.ixGroups) state.ixGroups = (await Atlas.index()).groups;
    if (state.roleId !== id) { state.R = await Atlas.role(id); state.roleId = id; RoleFilters.reset(state, defaultLevel()); state.selected = null; state.query = ""; state.shown = PAGE; state.evTab = null; state.match = null; state.more = false; state.areaOpen = null; state.areaMore = new Set(); state.tab = "skills"; state.empOpen = new Set(); state.fit = null; state.gapOpen = null; state.wait = null; state.gapClasses = null; state.postingOpen = false; }
    const ix = await Atlas.index(); return ix.groups.find(x => x.id === state.R.role.group);
  }
  // a student looks at the entry grade first; everyone else at every level
  const defaultLevel = () => (state.you && WHERE[state.you.where]) ? "entry" : "all";
  async function roleScreen(id) {
    const g = await loadRole(id); const R = state.R;
    const { query } = Routes.parseRoute(location.hash);   // "#/role/fpa?tab=skills": the fit screen's link lands on the painted list
    if (["skills", "postings", "also"].includes(query.tab)) state.tab = query.tab;
    crumbs([[Copy.explore.crumb, "#/explore"], [g.label, "#/field/" + g.id], [R.role.label, null]]);
    state.group = g;
    renderRole();
  }
  const DIMS = {
    level: j => state.level === "all" || Atlas.stepOf(j) === state.level,
    // visa sponsorship as the posting states it (PLAN.md v16, step 8): the chip keeps the postings that say they sponsor
    sponsor: j => !state.sponsor || j.sponsorship === "yes",
    grads: j => !state.grads || !!(j.entry || j.intern),
    employer: j => state.employer === "all" || Atlas.employerType(j) === state.employer,
    sector: j => state.sector.size === 0 || state.sector.has(j.sector),
    company: j => state.company.size === 0 || state.company.has(j.company),
    country: j => (state.country.size === 0 || state.country.has(j.country)) && (!state.remote || j.remote),
  };
  const jobsExcept = (dim, level) => state.R.jobs.filter(j => Object.entries(DIMS).every(([k, fn]) => k === dim || (k === "level" && level != null ? (level === "all" || Atlas.stepOf(j) === level) : fn(j))));
  const sliceOf = level => jobsExcept(null, level);
  // every filter but the level: what the Filters button counts and the drawer holds (RoleFilters, beside the routes)
  const activeCount = () => RoleFilters.active(state);
  const toggle = (set, v) => { set.has(v) ? set.delete(v) : set.add(v); state.shown = PAGE; };
  const keepScroll = fn => { const y = window.scrollY; fn(); window.scrollTo(0, y); };
  // the filters in the drawer show as removable chips beside the Filters button while the drawer is closed
  function activeChips(R) {
    const emp = state.employer === "all" ? [] : [[(R.employerTypes.find(e => e[0] === state.employer) || [])[1] || state.employer, 'data-emp="all"']];
    const grads = state.grads ? [[RL.grads, 'id="grads"']] : [];
    const extra = [...[...state.sector].map(v => [v, `data-sector="${esc(v)}"`]), ...[...state.company].map(v => [v, `data-company="${esc(v)}"`]), ...[...state.country].map(v => [v, `data-country="${esc(v)}"`]), ...(state.remote ? [[RL.remote, 'id="remote"']] : [])];
    return [...emp, ...grads, ...extra].map(([v, attr]) => `<button type="button" class="chip on" ${attr} aria-label="${esc(fill(RL.removeFilter, { name: v }))}">${esc(v)} <span aria-hidden="true">×</span></button>`).join("");
  }
  // The filters drawer (owner's choice R2, 2026-10-19): employers, who it is for, industry, employer name, location.
  // The level stays on the page as a segmented control. Every count reflects the other filters (owner's choice 7A).
  function drawerHtml(R, countBy) {
    const group = (label, inner) => `<div class="fgroup"><span class="lbl">${label}</span><div class="chips" style="margin:4px 0 0">${inner}</div></div>`;
    const chipsOf = (items, set, attr, allLabel) => `${allLabel ? `<button type="button" class="chip${set.size ? "" : " on"}" data-${attr}="__all">${allLabel}</button>` : ""}${items.map(([v, n]) => `<button type="button" class="chip${set.has(v) ? " on" : ""}" data-${attr}="${esc(v)}">${esc(v)}<span class="n">${fmt(n)}</span></button>`).join("")}`;
    const empCounts = countBy(jobsExcept("employer"), Atlas.employerType), empAll = jobsExcept("employer").length;
    const emp = `<button type="button" class="chip${state.employer === "all" ? " on" : ""}" data-emp="all">${esc(CM.all)}<span class="n">${fmt(empAll)}</span></button>` + R.employerTypes.map(([id, label]) => `<button type="button" class="chip${state.employer === id ? " on" : ""}" data-emp="${id}">${esc(label)}<span class="n">${fmt(empCounts[id] || 0)}</span></button>`).join("");
    const grads = R.set !== "product" ? group(esc(RL.drawer.who), `<button type="button" class="chip${state.grads ? " on" : ""}" id="grads">${esc(RL.grads)}<span class="n">${fmt(jobsExcept("grads").filter(j => j.entry || j.intern).length)}</span></button>`) : "";
    const sec = Object.entries(countBy(jobsExcept("sector"), j => j.sector)).filter(([v]) => v && v !== "Startup (unclassified)").sort((a, b) => b[1] - a[1]).slice(0, 10);
    const cm = countBy(jobsExcept("company"), j => j.company); const q = state.companyQuery.trim().toLowerCase();
    const picked = [...state.company].map(v => [v, cm[v] || 0]);
    const options = q ? Object.entries(cm).filter(([c]) => c.toLowerCase().includes(q) && !state.company.has(c)).sort((a, b) => b[1] - a[1]).slice(0, 12) : [];
    const cn = Object.entries(countBy(jobsExcept("country"), j => j.country)).filter(([v]) => v).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const remoteN = jobsExcept("country").filter(j => j.remote && (state.country.size === 0 || state.country.has(j.country))).length;
    const remote = `<button type="button" class="chip${state.remote ? " on" : ""}" id="remote">${esc(RL.remote)}<span class="n">${fmt(remoteN)}</span></button>`;
    const D = RL.drawer;
    return `<div class="drawer-back" id="drawer-back"></div><div class="drawer" role="dialog" aria-label="${esc(RL.filters)}" id="drawer">
      <div class="drawer-h"><h2>${esc(RL.filters)}</h2><button type="button" class="close" id="drawer-close" aria-label="${esc(CM.close)}">×</button></div>
      ${group(esc(D.employers), emp)}${grads}
      ${group(esc(D.industry), chipsOf(sec, state.sector, "sector", esc(D.allIndustries)))}
      ${POSTINGS ? `<div class="fgroup"><span class="lbl">${esc(D.employer)}</span><input type="search" id="company-q" placeholder="${esc(D.employerName)}" aria-label="${esc(D.employerName)}" value="${esc(state.companyQuery)}" autocomplete="off"><div class="chips" style="margin:4px 0 0">${picked.map(([v, n]) => `<button type="button" class="chip on" data-company="${esc(v)}">${esc(v)}<span class="n">${fmt(n)}</span></button>`).join("")}${options.map(([v, n]) => `<button type="button" class="chip" data-company="${esc(v)}">${esc(v)}<span class="n">${fmt(n)}</span></button>`).join("")}${!picked.length && !q ? `<span class="small muted">${esc(D.typeName)}</span>` : ""}</div></div>` : ""}
      ${R.country ? group(esc(D.location), `<span class="small muted">${esc(fill(D.countryOnly, { country: R.country }))}</span>${remote}`) : group(esc(D.location), chipsOf(cn, state.country, "country", esc(D.anywhere)) + remote)}
      <div class="row between drawer-f">${RoleFilters.changed(state, defaultLevel()) ? `<button type="button" class="btn quiet" id="reset-filters">${esc(CM.resetFilters)}</button>` : "<span></span>"}<button type="button" class="btn primary" id="drawer-done">${esc(CM.done)}</button></div>
    </div>`;
  }
  // The skills a role asks for, by area (owner's choice R3, 2026-10-19): one panel per skill area, the skills most
  // postings ask for open in it, the rest behind "more"; every panel starts closed (owner's feedback 2026-11-01). "Expand
  // all" opens every panel and every fold, which lays the whole list out ranked; "Collapse all" takes it back.
  const RL = Copy.role, TIER_LABEL = RL.tiers;
  // the fit's two states as the skill map draws them (owner's feedback 2026-11-01): a green dot for a skill on the
  // resume, a blue one for a gap; the legend, the role's rows and the fit screen's rows share it
  const fitDot = k => k === "have" || k === "gap" ? `<i class="sw ${k === "have" ? "have" : "todo"}" aria-hidden="true"></i>` : "";
  function skillRow(R, s, n, m) {
    const on = state.selected && state.selected.kind === "skill" && state.selected.id === s.id;
    const paint = m ? (m.matched.has(s.id) ? " have" : m.presumed.has(s.id) ? "" : m.required.has(s.id) ? " gap" : "") : "";
    const marks = (s.defining ? `<span class="mark" data-measure="${esc(RL.defining)}">◆</span>` : "") + (s.grows ? `<span class="mark" data-measure="${esc(RL.grows)}">↗</span>` : "");
    const known = state.known && state.known.has(s.id) ? `<span class="known" data-measure="${esc(RL.known)}">✓</span>` : "";
    const through = s.carriers && s.carriers.length ? `<span class="m">${esc(fill(RL.through, { names: s.carriers.slice(0, 2).map(k => (R.skillById[k] || { name: k }).name).join(", ") }))}${s.carriersFallback ? " " + esc(RL.inField) : ""}</span>` : "";
    return `<button type="button" class="srow${on ? " on" : ""}${paint}" data-skill="${esc(s.id)}"><span class="nm">${fitDot(paint.trim())}${esc(s.name)}${marks}${known}${s.area ? `<span class="m">${esc(s.area)}</span>` : through}</span><span class="bar" data-measure="${esc(fill(RL.barMeasure, { share: pct(s.share), n: fmt(n), name: s.name }))}"><i style="width:${Math.round(s.share * 100)}%"></i></span></button>`;
  }
  function areaPanel(R, a, n, m, flat) {
    const core = a.skills.filter(s => s.tier === 0), first = core.length && !flat ? core : a.skills, folded = core.length && !flat ? a.skills.filter(s => s.tier > 0) : [];
    const more = state.areaMore.has(a.cluster);
    const rowsOf = (list, labelled) => { let last = -1, h = ""; for (const s of list) { if (labelled && s.tier !== last) { h += `<span class="tierlab">${TIER_LABEL[s.tier]}</span>`; last = s.tier; } h += skillRow(R, s, n, m); } return h; };
    const fold = folded.length ? (more ? rowsOf(folded, true) + `<button type="button" class="linkish link more" data-more="${esc(a.cluster)}">${esc(RL.showFewer)}</button>` : `<button type="button" class="linkish link more" data-more="${esc(a.cluster)}">${esc(fill(RL.showMoreFewer, { n: folded.length }))}</button>`) : "";
    const n2 = a.behaviours ? `<span class="n">${esc(a.summary)}</span>` : `<span class="n">${esc(fill(a.skills.length === 1 ? RL.skill : RL.skills, { n: fmt(a.skills.length) }))}</span>`;
    return `<details class="areabox${a.behaviours ? " behaviours" : ""}" data-area="${esc(a.cluster)}"${flat || state.areaOpen.has(a.cluster) ? " open" : ""}><summary><span class="t">${esc(a.label)}</span>${n2}</summary><div class="srows">${rowsOf(first, flat || !core.length)}${fold}</div></details>`;
  }
  // the whole list laid out, painted: the course screen shows what a syllabus covers on it
  function flatSkills(R, slice, m) { const { areas, stats } = Atlas.areas(R, slice); return areas.length ? `<div class="areas">${areas.map(a => areaPanel(R, a, stats.n, m, true)).join("")}</div>` : `<p class="notice">${esc(RL.noMatch)}</p>`; }
  // the game a role's "Practise" opens (PLAN.md v12, entry points): Know the role
  const PRACTISE = "know-the-role";
  // the lead says what the data says: what sets the role apart, what leads the asks, which tools (owner's choice X1)
  function roleLead(areas) {
    const core = areas.flatMap(a => a.skills).filter(s => s.tier === 0).sort((a, b) => b.share - a.share);
    if (!core.length) return RL.fewMatch;
    const def = core.filter(s => s.defining).slice(0, 2), top = core.filter(s => !s.defining && s.kind !== "behaviour" && s.cluster !== "tools" && s.cluster !== "domain").slice(0, 3), tools = core.filter(s => s.cluster === "tools").slice(0, 2);
    const names = xs => join(xs.map(s => s.name.replace(/\s*\(.*?\)/g, "")));   // "Office suite (Excel, …)" reads as "Office suite" here
    const parts = [def.length ? fill(def.length === 1 ? RL.apartOne : RL.apart, { names: names(def) }) : "", top.length ? fill(RL.leadAsks, { names: names(top) }) : "", tools.length ? fill(tools.length === 1 ? RL.tool : RL.tools, { names: names(tools) }) : ""].filter(Boolean);
    return cap(parts.join("; ")) + ".";
  }
  const allExpanded = areas => areas.every(a => state.areaOpen.has(a.cluster) && (state.areaMore.has(a.cluster) || !a.skills.some(s => s.tier > 0) || !a.skills.some(s => s.tier === 0)));
  function renderRole() {
    const R = state.R, role = R.role, slice = sliceOf();
    const { areas, stats } = Atlas.areas(R, slice);
    // every area starts closed; the person opens what they want, or "Expand all" (owner's feedback 2026-11-01)
    if (state.areaOpen == null) state.areaOpen = new Set();
    const open = slice.filter(j => j.open);
    const nClosed = R.jobs.length - R.jobs.filter(j => j.open).length;
    const countBy = (jobs, fn) => { const m = {}; for (const j of jobs) { const k = fn(j); if (k != null) m[k] = (m[k] || 0) + 1; } return m; };
    const employers = esc(fill(role.nCompanies === 1 ? RL.employer : RL.employers, { n: fmt(role.nCompanies) }));
    const facts = R.set === "product" ? `<span data-measure="${esc(fill(RL.openUSMeasure, { n: fmt(role.nOpen), world: fmt(role.nWorld) }))}">${esc(fill(RL.openUS, { n: fmt(role.nOpen) }))}</span> · ${employers}` : `<span data-measure="${esc(fill(RL.openMeasure, { n: fmt(open.length), closed: nClosed ? fill(RL.closedMeasure, { n: fmt(nClosed) }) : "" }))}">${esc(fill(RL.open, { n: fmt(R.jobs.filter(j => j.open).length) }))}</span> · ${employers}`;
    const lead = roleLead(areas);
    // the Know-your-role record (PLAN.md v12, decision 4): the asks the player got right in a game, as ✓ on the list
    // and as a card beside the action row
    const GS = window.GameShell, asks = GS ? GS.record.asksOf({ roles: { [role.id]: role }, M: { skills: R.skills } }, { G: { skills: R.skills } }, role.id) : [];
    state.known = new Set(GS ? GS.record.knowledge(role.id, asks).known : []);
    const know = GS ? GS.knowCard({ roleId: role.id, label: role.label, asks, nameOf: id => (R.skillById[id] || { name: id }).name, practise: ids => `#/play/${PRACTISE}?role=${encodeURIComponent(role.id)}&skills=${encodeURIComponent(ids.slice(0, 8).join(","))}` }) : "";
    // the fit paints the list whenever one is read for this view (no toggle: owner's decision 2026-10-24)
    const fit = fitFor(), m = fit ? state.match : null;
    const nAct = activeCount();
    const seg = `<div class="seg" role="group" aria-label="${esc(RL.levelAria)}"><button type="button" class="${state.level === "all" ? "on" : ""}" aria-pressed="${state.level === "all"}" data-level="all">${esc(RL.allLevels)}</button>${Atlas.STEPS.map(s => `<button type="button" class="${state.level === s ? "on" : ""}" aria-pressed="${state.level === s}" data-level="${s}">${esc(R.stepLabels[s])}</button>`).join("")}</div>`;
    // "Says it sponsors" (PLAN.md v16, step 8): postings that say they sponsor a visa; shown once the data carries the fact
    const hasSponsorship = R.jobs.some(j => j.sponsorship != null);
    const nSponsor = hasSponsorship ? jobsExcept("sponsor").filter(j => j.sponsorship === "yes").length : 0;
    const sponsorChip = hasSponsorship ? `<button type="button" class="chip${state.sponsor ? " on" : ""}" id="sponsor-chip" aria-pressed="${state.sponsor}" data-measure="${esc(fill(RL.sponsorsMeasure, { n: fmt(nSponsor), m: fmt(jobsExcept("sponsor").length), no: R.jobs.some(j => j.sponsorship === "no") ? fill(RL.sponsorsNo, { n: fmt(jobsExcept("sponsor").filter(j => j.sponsorship === "no").length) }) : "" }))}">${esc(RL.sponsors)}<span class="n">${fmt(nSponsor)}</span></button>` : "";
    const filters = `<div class="filters">${seg}${sponsorChip}<button type="button" class="btn filters-btn${nAct ? " on" : ""}" id="more-filters" aria-expanded="${state.more}">${esc(RL.filters)}${nAct ? `<span class="n">${nAct}</span>` : ""}</button>${!state.more ? activeChips(R) : ""}</div>${state.more ? drawerHtml(R, countBy) : ""}`;
    const expanded = allExpanded(areas);
    const listHead = `<div class="listhead"><h2>${esc(RL.listHeading)} ${tip(RL.listTip)}</h2><span class="small muted">${esc(stats.n === 1 ? RL.oneInView : fill(RL.inView, { n: fmt(stats.n) }))}</span>${areas.length ? `<button type="button" class="linkish link" id="expand-all">${esc(expanded ? RL.collapseAll : RL.expandAll)}</button>` : ""}</div>`;
    const skillList = areas.length ? `<div class="areas">${areas.map(a => areaPanel(R, a, stats.n, m)).join("")}</div>` : `<p class="notice">${esc(RL.noMatch)}</p>`;

    const creds = R.skills.filter(s => s.cluster === "credentials" && stats.share(s.id) >= 0.1).map(s => ({ s, v: stats.share(s.id) })).sort((a, b) => b.v - a.v).slice(0, 6);
    const doms = R.skills.filter(s => s.cluster === "domain" && stats.share(s.id) >= 0.1).map(s => ({ s, v: stats.share(s.id) })).sort((a, b) => b.v - a.v).slice(0, 6);
    const credChip = x => `<span class="tag" data-measure="${esc(fill(RL.credMeasure, { share: pct(x.v), n: fmt(stats.n), name: x.s.name }))}">${esc(x.s.name)}</span>`;
    let summary = "";
    if (creds.length) { const w = inWords(creds[0].v), more = creds.slice(1, 3); summary = `${fill(esc(/posting$/.test(w) ? RL.credAskOne : RL.credAsk), { words: cap(esc(w)), name: low(esc(creds[0].s.name)) })}${more.length ? fill(esc(RL.credMore), { names: join(more.map(x => low(esc(x.s.name)))) }) : ""}.`; }
    if (doms.length) summary += " " + fill(esc(RL.industries), { names: join(doms.slice(0, 3).map(x => esc(x.s.name))) });
    const also = (creds.length || doms.length) ? `<p class="lead" style="margin-top:14px">${summary}</p>${creds.length ? `<h3>${esc(RL.credentials)}</h3><div class="tags">${creds.map(credChip).join("")}</div>` : ""}${doms.length ? `<h3>${esc(RL.industriesHeading)}</h3><div class="tags">${doms.map(credChip).join("")}</div>` : ""}` : "";
    // postings (owner's choice R6): open only, grouped by employer; employers hiring graduates and interns first
    // (MBA set), then the employers with the most postings. One posting stands alone; several fold under the employer.
    const q = state.query.trim().toLowerCase();
    const rank = j => j.entry === "mba" ? 0 : j.intern ? 1 : (j.entry === "pre_mba" || j.entry === "grad") ? 2 : 3;
    const list = open.filter(j => !q || (j.company + " " + j.title + " " + (j.location || "")).toLowerCase().includes(q)).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
    const byEmp = new Map(); for (const j of list) { const e = byEmp.get(j.company) || { company: j.company, jobs: [], rank: 9 }; e.jobs.push(j); e.rank = Math.min(e.rank, rank(j)); byEmp.set(j.company, e); }
    const emps = [...byEmp.values()].sort((a, b) => a.rank - b.rank || b.jobs.length - a.jobs.length || a.company.localeCompare(b.company));
    const shownEmps = emps.slice(0, state.shown);
    const who = j => esc(j.intern ? RL.internship : j.entry === "mba" ? RL.forMBA : (j.entry === "pre_mba" || j.entry === "grad") ? RL.forGrads : "");
    const jobRow = (j, withCompany) => `<button type="button" class="r${state.selected && state.selected.kind === "posting" && state.selected.id === j.id ? " on" : ""}" data-job="${j.id}"><span class="t">${esc(j.title)}</span><span class="n">${esc(levelLabel(R, j))}</span><span class="m">${withCompany ? esc(j.company) + (j.location ? " · " : "") : ""}${j.location ? esc(j.location) : ""}${who(j)}</span></button>`;
    const empBox = e => e.jobs.length === 1 ? jobRow(e.jobs[0], true) : `<details class="empbox" data-emp-open="${esc(e.company)}"${state.empOpen.has(e.company) ? " open" : ""}><summary><span class="t">${esc(e.company)}</span><span class="n">${esc(fill(e.jobs.length === 1 ? Copy.jobs.posting : Copy.jobs.postings, { n: fmt(e.jobs.length) }))}</span><span class="m">${esc(e.jobs[0].title)}${e.jobs[0].location ? " · " + esc(e.jobs[0].location) : ""}${who(e.jobs[0])}${e.jobs.length > 1 ? " · …" : ""}</span></summary><div class="list">${e.jobs.map(j => jobRow(j, false)).join("")}</div></details>`;
    const postings = `<input type="search" id="q" placeholder="${esc(RL.searchPostings)}" aria-label="${esc(RL.searchAria)}" value="${esc(state.query)}" autocomplete="off">
      <div class="list" id="postings">${shownEmps.map(empBox).join("") || `<p class="small muted" style="padding:10px 0">${esc(RL.noOpenMatch)}</p>`}</div>
      <p class="small muted" style="margin-top:8px">${esc(fill(RL.postingsFoot, { employers: fill(emps.length === 1 ? RL.employer : RL.employers, { n: fmt(emps.length) }), postings: fill(list.length === 1 ? RL.openPosting : RL.openPostings, { n: fmt(list.length) }), grads: R.set === "mba" ? RL.gradsFirst : "" }))} ${emps.length > shownEmps.length ? `<button type="button" class="linkish link" id="more">${esc(fill(RL.showMoreEmployers, { n: fmt(Math.min(20, emps.length - shownEmps.length)) }))}</button>` : ""}</p>`;
    const TABS = [["skills", RL.tabs.skills, null], ...(POSTINGS ? [["postings", RL.tabs.postings, open.length]] : []), ...(also ? [["also", RL.tabs.also, null]] : [])];
    if (!TABS.some(t => t[0] === state.tab)) state.tab = "skills";
    const tabs = `<div class="tabs" role="tablist">${TABS.map(([k, l, n]) => `<button type="button" role="tab" class="${state.tab === k ? "on" : ""}" aria-selected="${state.tab === k}" data-tab="${k}">${esc(l)}${n != null ? `<span class="n">${fmt(n)}</span>` : ""}</button>`).join("")}</div>`;
    const body = state.tab === "postings" ? postings : state.tab === "also" ? also : listHead + skillList;
    // the title, one sentence on what the job is (web/data/role_blurbs.json), the facts (open postings and employers
    // alone since 2026-11-01: the country and the entry grade went), the data's lead sentence
    page(`<h1>${esc(role.label)}</h1><p class="facts">${facts}</p>
      <p class="lead">${role.blurb ? esc(role.blurb) + " " : ""}${lead}</p>${know}
      ${filters}${tabs}${body}`);
    main.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { state.tab = b.dataset.tab; keepScroll(renderRole); });
    main.querySelectorAll("details.empbox").forEach(d => d.ontoggle = () => { d.open ? state.empOpen.add(d.dataset.empOpen) : state.empOpen.delete(d.dataset.empOpen); });
    main.querySelectorAll("[data-level]").forEach(b => b.onclick = () => { state.level = b.dataset.level; state.shown = PAGE; keepScroll(renderRole); });
    main.querySelectorAll("[data-emp]").forEach(b => b.onclick = () => { state.employer = b.dataset.emp; state.shown = PAGE; keepScroll(renderRole); });
    $("#more-filters").onclick = () => { state.more = !state.more; keepScroll(renderRole); };
    const closeDrawer = () => { state.more = false; keepScroll(renderRole); };
    for (const id of ["#drawer-close", "#drawer-back", "#drawer-done"]) { const el = $(id); if (el) el.onclick = closeDrawer; }
    main.querySelectorAll("details.areabox").forEach(d => d.ontoggle = () => { d.open ? state.areaOpen.add(d.dataset.area) : state.areaOpen.delete(d.dataset.area); const b = $("#expand-all"); if (b) b.textContent = allExpanded(areas) ? RL.collapseAll : RL.expandAll; });
    main.querySelectorAll("[data-more]").forEach(b => b.onclick = () => { toggle(state.areaMore, b.dataset.more); keepScroll(renderRole); });
    main.querySelectorAll("details[data-k]").forEach(d => d.ontoggle = () => { d.open ? state.open.add(d.dataset.k) : state.open.delete(d.dataset.k); });
    const xa = $("#expand-all"); if (xa) xa.onclick = () => { const all = allExpanded(areas); state.areaOpen = new Set(all ? [] : areas.map(a => a.cluster)); state.areaMore = new Set(all ? [] : areas.map(a => a.cluster)); keepScroll(renderRole); };
    const gr = $("#grads"); if (gr) gr.onclick = () => { state.grads = !state.grads; state.shown = PAGE; keepScroll(renderRole); };
    const sp = $("#sponsor-chip"); if (sp) sp.onclick = () => { state.sponsor = !state.sponsor; state.shown = PAGE; keepScroll(renderRole); };
    main.querySelectorAll("[data-sector]").forEach(b => b.onclick = () => { b.dataset.sector === "__all" ? state.sector.clear() : toggle(state.sector, b.dataset.sector); keepScroll(renderRole); });
    main.querySelectorAll("[data-country]").forEach(b => b.onclick = () => { b.dataset.country === "__all" ? state.country.clear() : toggle(state.country, b.dataset.country); keepScroll(renderRole); });
    main.querySelectorAll("[data-company]").forEach(b => b.onclick = () => { toggle(state.company, b.dataset.company); state.companyQuery = ""; keepScroll(renderRole); });
    const rem = $("#remote"); if (rem) rem.onclick = () => { state.remote = !state.remote; keepScroll(renderRole); };
    const rst = $("#reset-filters"); if (rst) rst.onclick = () => { RoleFilters.reset(state, defaultLevel()); state.shown = PAGE; keepScroll(renderRole); };
    const cq = $("#company-q"); if (cq) cq.oninput = () => { state.companyQuery = cq.value; keepScroll(renderRole); const el = $("#company-q"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); };
    main.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }));
    main.querySelectorAll("[data-job]").forEach(b => b.onclick = () => select({ kind: "posting", id: Number(b.dataset.job) }));
    const qi = $("#q"); if (qi) qi.oninput = () => { state.query = qi.value; state.shown = PAGE; const y = window.scrollY; renderRole(); window.scrollTo(0, y); $("#q").focus(); $("#q").setSelectionRange(qi.value.length, qi.value.length); };
    const more = $("#more"); if (more) more.onclick = () => { state.shown += 20; const y = window.scrollY; renderRole(); window.scrollTo(0, y); };
    showRail(() => railHtml(R, fitFor()));
    renderAside();
    if (state.resume && !fit) ensureFit();
  }
  function levelLabel(R, j) { const lad = R.ladders && R.ladders[j.ladder]; return (lad && lad.levels[j.level]) || R.levelLabels[j.level] || j.level; }

  function select(sel, onFit) {
    const same = state.selected && sel && state.selected.kind === sel.kind && state.selected.id === sel.id;
    state.selected = same ? null : sel; state.cardMore = false;
    const y = window.scrollY;
    if (onFit || location.hash.endsWith("/fit")) { main.querySelectorAll("[data-skill]").forEach(b => b.classList.toggle("on", !!(state.selected && b.dataset.skill === state.selected.id && b.classList.contains("skill")))); renderAside(); }
    else renderRole();
    window.scrollTo(0, y);
  }

  // ---------- the side panel ----------
  function renderAside() {
    const R = state.R, sel = state.selected;
    if (!sel) { showAside(null); return; }   // nothing selected: no panel, or the rail's own content (owner's choice R8, 2026-10-19)
    // over the rail a card gets "← Back" instead of ×
    const over = html => railBase ? `<button type="button" class="close back" aria-label="${esc(Copy.games.back)}">${esc(CM.back)}</button>` + html.replace(`<button type="button" class="close" aria-label="${esc(CM.close)}">×</button>`, "") : html;
    if (sel.kind === "posting") { showAside(over(postingCard(R, R.jobs.find(j => j.id === sel.id)))); wire(); return; }
    const ev = evCache[sel.id];
    showAside(over(skillCard(R, R.skillById[sel.id], sliceOf(), ev))); wire();
    // evidence sentences come from a separate file for the MBA set: draw the card again when they arrive
    if (!ev) R.evidence(sel.id).then(e => { evCache[sel.id] = e || {}; if (state.selected === sel) { const y = aside.scrollTop; renderAside(); aside.scrollTop = y; } }).catch(console.error);
  }
  const evCache = {};
  const redrawCard = () => { const y = aside.scrollTop; renderAside(); aside.scrollTop = y; };
  function wire() {
    aside.querySelector(".close").onclick = () => select(null);
    aside.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }));
    aside.querySelectorAll("[data-job]").forEach(b => b.onclick = () => select({ kind: "posting", id: Number(b.dataset.job) }));
    aside.querySelectorAll("[data-ev]").forEach(b => b.onclick = () => { state.evTab = b.dataset.ev; redrawCard(); });
    aside.querySelectorAll("[data-ctab]").forEach(b => b.onclick = () => { state.cardTab = state.cardTab === b.dataset.ctab ? null : b.dataset.ctab; redrawCard(); });
    const cm = aside.querySelector("#card-more"); if (cm) cm.onclick = () => { state.cardMore = !state.cardMore; redrawCard(); };
    aside.querySelectorAll("details[data-k]").forEach(d => d.ontoggle = () => { d.open ? state.open.add(d.dataset.k) : state.open.delete(d.dataset.k); });
  }
  const disc = (k, label, inner) => `<details class="disc" data-k="${k}"${state.open.has(k) ? " open" : ""}><summary>${label}</summary><div class="disc-body">${inner}</div></details>`;
  const quoteHtml = q => `<blockquote class="quote">“${esc(q.text.length > 260 ? q.text.slice(0, 257) + "…" : q.text)}”<span class="src">${esc(q.company)} · ${POSTINGS ? `<a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.title)}</a>` : esc(q.title)}</span></blockquote>`;
  const evGroup = ev => { const groups = EV_GROUPS.filter(([k]) => (ev[k] || []).length); if (!groups.length) return null; const want = state.evTab || STEP_TO_EV[state.level] || "early"; return groups.some(([k]) => k === want) ? want : groups[0][0]; };
  function firstQuote(ev) {
    if (!ev) return `<p class="small muted">${esc(RL.loadingQuote)}</p>`;
    const g = evGroup(ev); return g ? quoteHtml(ev[g][0]) : "";
  }
  function evidenceHtml(ev) {
    if (!ev) return `<p class="small muted">${esc(RL.loadingQuotes)}</p>`;
    const groups = EV_GROUPS.filter(([k]) => (ev[k] || []).length);
    if (!groups.length) return `<p class="small muted">${esc(RL.noQuotes)}</p>`;
    const tab = evGroup(ev);
    return `<div class="evtabs">${groups.map(([k, lab]) => `<button type="button" class="chip${tab === k ? " on" : ""}" data-ev="${k}">${esc(lab)}</button>`).join("")}</div>` +
      ev[tab].slice(0, 3).map(quoteHtml).join("");
  }
  // A skill's ladder is flat ({associate, mid, senior, lead}: product skills) or keyed by industry ladder
  // ({corporate: {...}, bank: {...}}: MBA skills, rungs the postings do not support are absent). The card shows the
  // role's own industry; when that one is not written, another industry's, named as such.
  const LADDER_ORDER = ["corporate", "bank", "consulting"];
  function ladderHtml(R, s, here) {
    const L = s.ladder;
    if (!L) return `<p class="small muted">${esc(RL.noLadder)}</p>`;
    const flat = LADDER_KEYS.some(([k]) => typeof L[k] === "string");
    const ind = flat ? null : L[R.role.ladder] ? R.role.ladder : LADDER_ORDER.find(k => L[k]) || Object.keys(L)[0];
    const rungs = flat ? L : L[ind];
    const lv = (ind && R.ladders && R.ladders[ind] && R.ladders[ind].levels) || {};
    const rows = LADDER_KEYS.filter(([k]) => flat || rungs[k]).map(([k, lab]) => `<span class="lv${here === k ? " here" : ""}">${esc(lv[k] || lab)}</span><span>${esc(rungs[k] || "")}</span>`).join("");
    const name = k => (((R.ladders || {})[k] || {}).label || k).toLowerCase();
    const other = ind && ind !== R.role.ladder ? `<p class="small muted">${esc(fill(RL.otherLadder, { other: name(ind), own: name(R.role.ladder) }))}</p>` : "";
    return other + `<div class="ladder">${rows}</div>`;
  }
  // The skill card (owner's choice R7, 2026-10-19): the first fold is the definition, one line of share in words,
  // the three biggest sub-skills and one quote, under 100 words. The rest sits behind four tabs in the same order
  // on every card: In postings · By level · Build it · Related. No tab is open until one is clicked.
  const CTABS = Object.entries(Copy.role.cardTabs);
  function skillCard(R, s, slice, ev) {
    const st = Atlas.shares(slice), ss = Atlas.subShares(slice, s.id);
    const subsMeta = (s.subskills || (R.subs[s.id] || []).map(x => ({ id: x.id, name: x.name, example: "" }))).map(sub => ({ ...sub, v: ss.share(sub.id) })).sort((a, b) => b.v - a.v);
    const m = state.match && state.match.roleId === R.role.id ? state.match : null;
    const subRow = (sub, withEx) => `<div class="sub${m ? (m.subs.has(sub.id) ? " have" : m.required.has(s.id) && !m.presumed.has(s.id) ? " miss" : "") : ""}"><span class="nm">${esc(sub.name)}</span><span class="pct" data-measure="${esc(fill(RL.subMeasure, { share: pct(sub.v), skill: s.name }))}">${pct(sub.v)}</span>${withEx && sub.example ? `<span class="ex">${esc(sub.example)}</span>` : ""}</div>`;
    const rest = subsMeta.slice(3);
    const subs = subsMeta.length ? `<h3>${esc(RL.mostlyMeans)}</h3><div class="subs">${(state.cardMore ? subsMeta : subsMeta.slice(0, 3)).map(sub => subRow(sub, state.cardMore)).join("")}</div>${rest.length ? `<button type="button" class="linkish link more" id="card-more">${esc(state.cardMore ? RL.showFewer : fill(RL.showMore, { n: rest.length }))}</button>` : ""}` : "";
    const w = inWords(st.share(s.id));
    const share = `<p class="small">${esc(fill(/posting$/.test(w) ? RL.shareLineOne : RL.shareLine, { words: cap(w) }))} ${tip(fill(RL.shareTip, { share: pct(st.share(s.id)), n: fmt(st.n), skill: s.name, all: pct(s.share), set: R.set === "mba" ? RL.allMBA : R.set === "tech" ? RL.allTech : RL.allProduct }))}</p>`;
    const here = state.level === "all" ? null : { entry: "associate", mid: "mid", senior: "senior", lead: "lead" }[state.level];
    const ladder = ladderHtml(R, s, here);
    const bs = buildSteps(s, R.role.ladder, true), ladName = k => (((R.ladders || {})[k] || {}).label || k).toLowerCase();
    const build = bs.steps.length ? (bs.ind && bs.ind !== R.role.ladder ? `<p class="small muted">${esc(fill(RL.otherLadder, { other: ladName(bs.ind), own: ladName(R.role.ladder) }))}</p>` : "") + `<ul class="plain">${bs.steps.map(b => `<li>${stepHtml(b)}</li>`).join("")}</ul>` : `<p class="small muted">${esc(R.role.ladder === "consulting" && s.build && !Array.isArray(s.build) ? RL.consultingHold : RL.noBuild)}</p>`;
    // What the skill means here and how it is shown (PLAN.md v14, decisions 3 and 6): the field entry's reading when the
    // role's field has one, else one sentence from the evidence file; a behaviour or a practice names the carriers the
    // role's postings pick. Every sentence comes from the data through web/evidence_text.js; `signals` left the card.
    const T = textOf(R.kinds), field = R.role.group, fieldLabel = (g => (g && g.label) || field)((state.ixGroups || []).find(x => x.id === field));
    const keys = Atlas.fieldKeys(R), hasOverride = !!(s.fields && s.fields[keys[0]]);   // the role's own reading, when its field's does not fit it
    const reads = T.reads(s, keys), kindLabel = ((R.kinds || {})[s.kind] || {}).label || "";
    const cs = s.kind === "behaviour" || s.kind === "practice" ? Atlas.carriers(R, slice, s.id) : null;
    const carrierTags = cs && cs.ids.length ? `<p class="small" style="margin:8px 0 0">${esc(RL.shownThrough)}${cs.fallback ? ` <span class="subtle">${esc(fill(RL.inFieldNamed, { field: fieldLabel.toLowerCase() }))}</span>` : ""}: <span class="tags inline">${cs.ids.map(k => `<button type="button" class="tag" data-skill="${esc(k)}">${esc(R.skillById[k].name)}</button>`).join("")}</span></p>` : "";
    const means = `${reads ? `<p class="small reads"><b>${esc(hasOverride ? fill(RL.forRole, { role: R.role.label }) : fill(RL.inFieldLabel, { field: fieldLabel.toLowerCase() }))}:</b> ${esc(reads)}</p>` : `<p class="small muted">${esc(T.summary(s))}</p>`}${carrierTags}`;
    const lineHere = T.line(s, keys);
    const showIt = `<p class="small" style="margin:10px 0 0"><b>${esc(T.how(s.kind || "method"))}</b></p>${s.kind !== "behaviour" ? `<p class="small">${esc(fill(RL.lineShows, { where: lineHere.source === "field" ? (lineHere.role ? fill(RL.lineForRole, { role: R.role.label }) : fill(RL.lineInField, { field: fieldLabel.toLowerCase() })) : "" }))} <em>“${esc(lineHere.text)}”</em></p>` : cs && cs.ids.length ? `<p class="small">${esc(fill(RL.lineCarries, { names: R.skillById[cs.ids[0]].name + (cs.ids[1] ? RL.or + R.skillById[cs.ids[1]].name : "") }))} <em>“${esc(lineHere.text)}”</em></p>` : ""}`;
    const withSkill = slice.filter(j => j.open && j.skills.includes(s.id)).slice(0, 6);
    const postings = withSkill.length ? `<div class="list">${withSkill.map(j => `<button type="button" class="r" data-job="${j.id}"><span class="t">${esc(j.title)}</span><span class="n">${esc(levelLabel(R, j))}</span><span class="m">${esc(j.company)}</span></button>`).join("")}</div>` : `<p class="small muted">${esc(RL.noOpenAsks)}</p>`;
    const visible = new Set(Atlas.grid(R, slice).rows.flat(2).map(x => x.id));
    const related = R.edges.filter(e => (e.source === s.id || e.target === s.id)).map(e => ({ id: e.source === s.id ? e.target : e.source, w: e.jaccard })).filter(x => visible.has(x.id) && x.id !== s.id).sort((a, b) => b.w - a.w).slice(0, 6);
    const def = R.role.defining.has(s.id) ? ` · <span class="mark" data-measure="${esc(RL.defining)}">${esc(RL.definesRole)}</span>` : "";
    const bodies = {
      postings: `<h3>${esc(RL.howSay)}</h3>${evidenceHtml(ev)}${POSTINGS ? `<h3>${esc(RL.postingsAsk)}</h3>${postings}` : ""}`,
      ladder: `<h3>${esc(RL.atLevel)}</h3>${ladder}`,
      build: `<h3>${esc(RL.howShow)}</h3>${showIt}<h3>${esc(RL.howBuild)}</h3>${build}`,
      related: `<h3>${esc(RL.together)}</h3>${related.length ? `<div class="tags">${related.map(r => `<button type="button" class="tag" data-skill="${esc(r.id)}">${esc(R.skillById[r.id].name)}</button>`).join("")}</div>` : `<p class="small muted">${esc(RL.noRelated)}</p>`}`,
    };
    const tabs = `<div class="tabs card-tabs" role="tablist">${CTABS.map(([k, l]) => `<button type="button" role="tab" class="${state.cardTab === k ? "on" : ""}" aria-selected="${state.cardTab === k}" data-ctab="${k}">${esc(l)}</button>`).join("")}</div>`;
    return `<button type="button" class="close" aria-label="${esc(CM.close)}">×</button><div class="card">
      <p class="eyebrow">${kindLabel ? esc(kindLabel) + " · " : ""}${esc(R.clusters[s.cluster].label)}${def}</p><h2>${esc(s.name)}</h2>
      ${s.what ? `<p class="what">${esc(s.what)}</p>` : ""}
      ${share}${means}${subs}
      <div id="quote1">${firstQuote(ev)}</div>
      ${tabs}${state.cardTab ? `<div class="card-body">${bodies[state.cardTab]}</div>` : ""}
    </div>`;
  }
  function postingCard(R, j) {
    if (!j) return `<button type="button" class="close" aria-label="${esc(CM.close)}">×</button><p class="empty">${esc(RL.notInRole)}</p>`;
    const byArea = {}; for (const k of j.skills) { const s = R.skillById[k]; if (s) (byArea[s.cluster] ||= []).push(s); }
    const subNames = (j.sub || []).map(id => { for (const [sid, list] of Object.entries(R.subs)) { const f = list.find(x => x.id === id); if (f) return { sid, name: f.name }; } return null; }).filter(Boolean);
    const who = j.intern ? RL.who.intern : j.entry === "mba" ? RL.who.mba : (j.entry === "pre_mba" || j.entry === "grad") ? RL.who.grads : null;
    const nSkills = j.skills.filter(k => R.skillById[k] && R.skillById[k].cluster !== "credentials").length;
    return `<button type="button" class="close" aria-label="${esc(CM.close)}">×</button><div class="card">
      <p class="eyebrow">${esc(j.company)}${j.rank ? ` · ${esc(fill(RL.fortune, { n: j.rank }))}` : ""}</p><h2>${esc(j.title)}</h2>
      <p class="facts">${esc(levelLabel(R, j))}${j.location ? " · " + esc(j.location) : ""}${j.remote ? esc(RL.remoteFact) : ""}${j.yoe ? esc(fill(RL.yearsAsked, { n: j.yoe })) : ""}${j.industry ? " · " + esc(j.industry) : ""}</p>
      ${who ? `<p class="small" style="color:var(--primary)">${esc(who)}${j.entry_src === "firm" || j.entry_src === "category" ? esc(RL.whoGrade) : ""}.</p>` : ""}
      ${j.snippet ? `<p class="small muted">${esc(j.snippet)}…</p>` : ""}
      ${POSTINGS ? `<p><a class="link" href="${esc(j.url)}" target="_blank" rel="noopener">${esc(RL.openPostingLink)}</a></p>` : ""}
      <h3>${esc(fill(nSkills === 1 ? RL.skillAsked : RL.skillsAsked, { n: fmt(nSkills) }))}</h3>
      ${Object.entries(byArea).sort((a, b) => b[1].length - a[1].length).map(([c, ss]) => `<p class="small muted" style="margin:8px 0 2px">${esc(R.clusters[c].label)}</p><div class="tags">${ss.map(s => `<button type="button" class="tag" data-skill="${esc(s.id)}">${esc(s.name)}</button>`).join("")}</div>`).join("")}
      ${subNames.length ? `<h3>${esc(RL.specificAsks)}</h3><div class="tags">${subNames.map(x => `<button type="button" class="tag" data-skill="${esc(x.sid)}">${esc(x.name)}</button>`).join("")}</div>` : ""}
    </div>`;
  }

  // ---------- 5. your fit: read once for the rail and the fit screen ----------
  const BANDS = Object.entries(CM.bands);
  const bandName = k => (BANDS.find(b => b[0] === k) || [])[1];
  // the view the fit is read on: the role, the level and every other filter
  const fitKey = level => [state.roleId, level, state.employer, state.grads, state.sponsor, [...state.sector].join(), [...state.company].join(), [...state.country].join(), state.remote].join("|");
  const fitFor = level => state.fit && state.fit.key === fitKey(level == null ? state.level : level) && state.resume && state.fit.resume === state.resume.text ? state.fit : null;
  // The matcher on the current view (the way the bands were calibrated: Atlas.matcher). Returns the rows by status,
  // the band now and the band if the top gaps were evidenced, and sets state.match (what the skills list paints).
  async function computeFit(R, level) {
    const role = R.role, slice = sliceOf(level);
    const { M, bands, group } = await Atlas.matcher(R);
    const extra = [state.grads ? RL.grads.toLowerCase() : null, state.sponsor ? RL.sponsors.toLowerCase() : null, state.employer !== "all" ? (R.employerTypes.find(e => e[0] === state.employer) || [])[1] : null, ...state.sector, ...state.company, ...state.country, state.remote ? RL.remote.toLowerCase() : null].filter(Boolean);
    const label = `${role.label}${level === "all" ? "" : " · " + R.stepLabels[level]}${extra.length ? " · " + extra.join(", ") : ""}`;
    const r = M.match(state.resume.text, { jobs: slice, familyJobs: R.jobs, label }, { level: LEVEL_OPT[level], ladder: R.role.ladder });
    const rows = r.rows, by = st => rows.filter(x => x.status === st).sort((a, b) => (a.tier === b.tier ? b.w - a.w : a.tier === "core" ? -1 : b.tier === "core" ? 1 : a.tier === "common" ? -1 : 1));
    // `through`: a behaviour shown through a carrier skill the resume evidences (PLAN.md v14, decision 1)
    // `inferred`: a skill the model read found in a line that does not name it (web/infer.js); shown, part credit
    const evid = by("evidenced"), trans = by("transferable"), through = by("through"), inferred = by("inferred"), thin = by("thin"), presumed = by("presumed"), gaps = by("gap").filter(x => x.tier !== "diff");
    const required = new Set(); for (const x of rows) { if (x.tier === "diff") continue; if (x.slot === "__ai") r.ai.forEach(k => required.add(k)); else if (x.slot !== "__domain") required.add(x.id); }
    state.match = { roleId: role.id, matched: new Set([...evid, ...trans, ...through, ...inferred].map(x => x.id).filter(k => R.skillById[k])), required, presumed: new Set(presumed.map(x => x.id)), subs: r.subs };
    const band = Matcher.bandOf(r.overall, bands, group), bandNext = Matcher.bandOf(r.whatIf, bands, group);
    const core = rows.filter(x => x.tier === "core"), coreHave = core.filter(x => x.status === "evidenced" || x.status === "transferable" || x.status === "through" || x.status === "inferred");
    const coreGaps = core.filter(x => x.status === "gap" || x.status === "thin").sort((a, b) => b.w - a.w);
    return { key: fitKey(level), resume: state.resume.text, roleId: role.id, level, r, slice, bands, group, band, bandNext, evid, trans, through, inferred, thin, presumed, gaps, core, coreHave, coreGaps, extra, label };
  }
  // the gap rows of a fit as the class picker and the rail's "Classes that cover your gaps" read them: core and common
  // asks the resume does not show (status gap or thin), the industry and AI slots left out
  const gapRows = (f, R) => [...f.coreGaps, ...f.gaps.filter(x => x.tier !== "core"), ...f.thin.filter(x => x.tier !== "core")].filter(x => x.slot !== "__domain" && x.slot !== "__ai" && R.skillById[x.id]).map(x => ({ id: x.id, name: x.slotName, tier: x.tier, w: x.w }));
  const gapsCache = {};
  async function gapsFor(roleId) {
    if (!state.resume) return null;
    const f0 = fitFor(); const R0 = state.R;
    if (f0 && f0.roleId === roleId && R0) return { roleId, label: R0.role.label, level: f0.level, gaps: gapRows(f0, R0) };
    const key = roleId + "|" + state.resume.text;
    if (gapsCache[key]) return gapsCache[key];
    const R = await Atlas.role(roleId); const { M } = await Atlas.matcher(R);
    const level = defaultLevel(), slice = level === "all" ? R.jobs : R.jobs.filter(j => Atlas.stepOf(j) === level);
    const r = M.match(state.resume.text, { jobs: slice, familyJobs: R.jobs, label: R.role.label }, { level: LEVEL_OPT[level], ladder: R.role.ladder });
    const rows = r.rows, by = st => rows.filter(x => x.status === st && x.tier !== "diff");
    const f = { coreGaps: rows.filter(x => x.tier === "core" && (x.status === "gap" || x.status === "thin")).sort((a, b) => b.w - a.w), gaps: by("gap"), thin: by("thin") };
    return gapsCache[key] = { roleId, label: R.role.label, level, gaps: gapRows(f, R) };
  }
  // the courses that cover the gaps of the fit on screen (ClassScreens.coverGaps), read once per fit and kept on state;
  // the rail and the fit screen draw themselves again when it arrives
  function gapClassesFor(fit, R, redraw) {
    if (!window.ClassScreens || !fit) return null;
    const key = fit.key + "|" + fit.resume;
    const gc = state.gapClasses;
    if (gc && gc.key === key) return gc.pending ? null : gc;
    const gaps = gapRows(fit, R);
    state.gapClasses = { key, pending: true };
    ClassScreens.coverGaps(gaps).then(res => { if (!state.gapClasses || state.gapClasses.key !== key) return; state.gapClasses = { key, ...res }; redraw(); }).catch(e => { console.error(e); if (state.gapClasses && state.gapClasses.key === key) state.gapClasses = { key, closed: null, failed: true }; });
    return null;
  }
  // the rail reads the fit for the current view when the resume is there; the list is drawn again once it is read
  let fitting = null;
  function ensureFit() {
    const key = fitKey(); if (fitting === key) return; fitting = key;
    const R = state.R;
    computeFit(R, state.level).then(f => { fitting = null; if (state.R !== R || fitKey() !== key) return; state.fit = f; keepScroll(renderRole); }).catch(e => { fitting = null; console.error(e); });
  }

  // ---------- the rail: the legend, the person and this role, what to do with it ----------
  // one legend everywhere, rows left out when they do not apply (owner's decision 2026-10-24)
  function legendHtml(rows) {
    const L = CM.legend, mark = { share: '<i class="b"></i>', defining: "◆", grows: "↗", have: fitDot("have"), gap: fitDot("gap"), presumed: "◌", known: "✓", other: "⟲", through: "⤷", inferred: "◈" };
    return `<section class="rs"><h3 class="rh">${esc(L.heading)}</h3><div class="legend">${rows.map(k => `<span class="k">${mark[k]}</span><span>${esc(L[k])}</span>`).join("")}</div></section>`;
  }
  // The intake box (v19 B5; one box everywhere since v18 step 1: the rail's three placeholders, the fit screen's foot,
  // the launcher, the networking screen, the class picker's foot), its copy the pure table Intake beside Stage. The
  // form is Tally's when CONFIG.TALLY has the box's kind (its own line; a light and a dark copy, mountForm picks;
  // web/doors.js mounts it in wireWait, the native form as the fallback), else the native one. Either way the box is the kind `intake_<surface>` (Intake.kindOf): the native
  // Notify me sends the email, the surface, the role on screen, the stage, the program group and the fields picked
  // through Doors.nativeSubmit with that source, and the event of the same name follows; Tally's form carries the
  // surface, the source, the role and the email as hidden fields, and the screen sends the event when Tally reports
  // the submit. "Got it" stays in this browser (the boxes sent from are kept in localStorage under `waitlist`, the key
  // from before; never the email). The atlas promises nothing it does not do itself.
  const joined = () => store.get("waitlist") || {};
  const intakeDone = what => !!joined()[what];
  const markDone = what => store.set("waitlist", { ...joined(), [what]: new Date().toISOString().slice(0, 10) });
  const intakeForm = (what, roleId) => `<form class="apply-form" data-wait-form="${esc(what)}"${roleId ? ` data-wait-role="${esc(roleId)}"` : ""}><input type="email" required placeholder="${esc(Door.COPY.emailPlaceholder)}" aria-label="${esc(Intake.email)}" autocomplete="email" value="${esc(doorKept().email)}"><button type="submit" class="btn primary">${esc(Intake.button)}</button></form>`;
  // opts.always: drawn whether or not state.wait names it (the fit screen, the launcher, the networking screen, the
  // picker); opts.role_id: the role to record instead of the role screen's (the picker's chosen role)
  function applyBox(what, opts) {
    opts = opts || {};
    if (!opts.always && state.wait !== what) return "";
    const done = intakeDone(what), tally = !done && !!(window.Doors && Doors.formIdFor(Intake.kindOf(what), null, formTheme()));
    if (!done && window.Capture) Capture.cta(Intake.kindOf(what), "shown", intakeCtx(what, opts.role_id));   // its "done" is the intake_<surface> event
    // with a Tally id the slot waits for wireWait; its line keeps the page still until the form draws
    const form = done ? `<p class="small" style="margin:6px 0 0"><b>${esc(Intake.done)}</b></p>`
      : tally ? `<div class="apply-slot" data-wait-slot="${esc(what)}"${opts.role_id ? ` data-wait-role="${esc(opts.role_id)}"` : ""}></div><p class="small muted apply-loading">${esc(CM.loadingForm)}</p>`
      : intakeForm(what, opts.role_id);
    return `<div class="wait apply"><b>${esc(Intake.heading)}</b><p class="small">${esc(Intake.line[Intake.surfaceOf(what)])}</p>${form}<p class="small muted" style="margin:6px 0 0">${esc(Intake.privacy)}${opts.always || done ? "" : ` <a href="#/" data-wait-close>${esc(CM.notNow)}</a>`}</p></div>`;
  }
  const waitHtml = what => applyBox(what);
  // the context an intake box sends: the role on screen (or the box's own), the stage, the program group, the fields
  const intakeCtx = (what, roleId) => ({ ...waitCtx(), ...(roleId ? { role_id: roleId } : {}), surface: Intake.surfaceOf(what) });
  // the boxes inside `el`: a native form sends the email once on submit, the box says so, and `redraw` draws the
  // screen again; a slot gets Tally's form (Doors.mount), the native form in its place after three seconds without a
  // load, and the same "Got it" when Tally reports the submit
  function wireWait(el, redraw) {
    const wireForms = scope => scope.querySelectorAll("[data-wait-form]").forEach(f => f.onsubmit = async e => {
      e.preventDefault(); const what = f.dataset.waitForm, input = f.querySelector("input[type=email]"), btn = f.querySelector("button");
      if (!input.value.trim()) return; btn.disabled = true; btn.textContent = CM.sending;
      const ctx = intakeCtx(what, f.dataset.waitRole);
      const ok = window.Doors ? await Doors.nativeSubmit(Intake.kindOf(what), { email: input.value, role: ctx.role_id, ctx }) : false;
      if (ok) { markDone(what); redraw(); }   // the box stays, now saying "Got it"
      else { btn.disabled = false; btn.textContent = Intake.button; input.setCustomValidity(CM.sendFailed); input.reportValidity(); input.oninput = () => input.setCustomValidity(""); }
    });
    wireForms(el);
    unmount(false);
    el.querySelectorAll("[data-wait-slot]").forEach(slot => {
      const what = slot.dataset.waitSlot, roleId = slot.dataset.waitRole || null, kind = Intake.kindOf(what), ctx = intakeCtx(what, roleId);
      const dropLoading = () => { const p = slot.nextElementSibling; if (p && p.classList.contains("apply-loading")) p.remove(); };
      mountForm(slot, kind, {
        hidden: { surface: ctx.surface, source: kind, role: ctx.role_id, email: doorKept().email },
        native: () => intakeForm(what, roleId),
        onLoaded: dropLoading,
        onFallback: () => { dropLoading(); wireForms(slot); },
        onSubmitted: () => { markDone(what); track(kind, ctx); redraw(); },
      });
    });
  }
  // the open postings of this view that ask for a skill, as links (decision 8 of the pass: shown to a person with a resume)
  function postingLinks(R, slice, id, n) {
    const open = slice.filter(j => j.open && j.url && j.skills.includes(id)).slice(0, n || 3);
    return open.length ? `<span class="plinks">${esc(RL.rail.postingsAsking)} ${open.map(j => `<a href="${esc(j.url)}" target="_blank" rel="noopener" data-posting="${esc(R.role.id)}" title="${esc(j.title)}">${esc(j.company)} ↗</a>`).join(" · ")}</span>` : "";
  }
  function railHtml(R, fit) {
    const role = R.role, y = state.you || {}, stage = y.stage;
    const painted = !!fit && state.match && state.match.roleId === role.id;
    const legend = legendHtml(["share", ...(role.definingList.length ? ["defining"] : []), "grows", ...(state.known && state.known.size ? ["known"] : []), ...(painted ? ["have", "gap", ...(fit.presumed.length ? ["presumed"] : []), ...(fit.trans.length ? ["other"] : []), ...(fit.through && fit.through.length ? ["through"] : []), ...(fit.inferred && fit.inferred.length ? ["inferred"] : [])] : [])]);
    const RR = RL.rail;
    // the rail ends in one link into the class picker with this role chosen (classes.js reads ?role= and adds it to
    // the roles on file); it replaced "Do something with this" and "Then" (practice, a course, events) on 2026-11-01
    const cta = window.ClassScreens ? `<section class="rs"><div class="acts"><a href="#/classes?role=${encodeURIComponent(role.id)}">${esc(RR.findClasses)}</a></div></section>` : "";
    const drop = `<div class="drop" id="drop"><p><b>${esc(RF.dropShort)}</b> ${esc(RF.or)} <label class="link" for="file">${esc(RF.choose)}</label></p><input type="file" id="file" accept=".pdf,.docx,.txt,.md" hidden><p class="small muted" id="file-status"></p></div><p style="margin-top:8px"><button type="button" class="btn primary" id="rail-read">${esc(RF.readFit)}</button></p>`;
    if (!state.resume) {
      if (!y.where && !y.stage) return legend + `<section class="rs"><h3 class="rh">${esc(RR.howFit)}</h3><p>${esc(RR.dropLead)}</p>${drop}<p><a href="#/you">${esc(RR.orAnswer)}</a> ${esc(RR.orAnswerAfter)}</p></section>` + cta;
      // answers, no resume: the answers as a strip, then the drop (the entry-grade facts and the "Add your resume"
      // sentences went on 2026-11-01)
      const strip = `<div class="strip"><span class="dotg"></span><span>${[y.where ? esc(WHERE_SHORT[y.where]) : null, stage ? esc(STAGE_SHORT[stage]) : null, (y.fields || []).length ? `<b>${esc(join((y.fields || []).map(id => ((state.ixGroups || []).find(x => x.id === id) || { label: id }).label)))}</b>` : null].filter(Boolean).join(" · ")}</span><a href="#/you">${esc(CM.edit)}</a></div>`;
      const blocks = { drop };
      const body = Stage.railBlocks(stage, false).filter(k => blocks[k]).map(k => blocks[k]).join("");
      return legend + `<section class="rs"><h3 class="rh">${esc(RR.forYou)}</h3>${strip}${body}</section>` + cta;
    }
    if (!fit) return legend + `<section class="rs"><h3 class="rh">${esc(fill(RR.yourFit, { name: state.resume.name }))}</h3><p class="small muted">${esc(RR.reading)}</p></section>` + cta;
    // the resume is read: the band, one sentence, every gap among the skills most postings ask for
    const { band, bandNext, core, coreHave, coreGaps, bands, group } = fit;
    const scale = band ? `<div class="band">${BANDS.map(([k], i) => `<i class="${k === band ? "on" : i < BANDS.findIndex(b => b[0] === band) ? "past" : ""}"></i>`).join("")}</div><div class="bandl">${BANDS.map(([k, l]) => `<span class="${k === band ? "on" : ""}">${l}</span>`).join("")}</div>` : `<p class="small muted">${esc((bands.no_bands || {})[group] ? RR.smallSample : RR.noBands)}</p>`;
    const P = postingFor(role.id), pAsks = P ? new Set([...P.found].filter(k => R.skillById[k] && R.skillById[k].cluster !== "credentials")) : null, pSum = pAsks ? postingSummary(pAsks, fit) : null;
    const postingLine = pSum ? `<p class="lead-rail posting"><b class="g">${pSum.n}</b> ${esc(fill(RR.postingLine, { m: pSum.m }))} <a href="#/role/${esc(role.id)}/fit">${esc(RR.thisPosting)}</a> ${esc(RR.postingLineAfter)}</p>` : "";
    const line = (core.length ? `<p class="lead-rail">${esc(RR.youShow)} <b class="g">${coreHave.length}</b> ${esc(fill(RR.ofMost, { m: core.length }))}${coreGaps.length ? `; <b class="a">${coreGaps.length}</b> ${esc(coreGaps.length === 1 ? RR.isGap : RR.areGaps)}` : ""}.</p>` : `<p class="small muted">${esc(RR.fewMatch)}</p>`);
    // the model read's part of that count (web/infer.js), marked as the legend marks it; the lines are on the fit screen
    const coreInf = coreHave.filter(x => x.status === "inferred").length;
    const infLine = coreInf ? `<p class="small muted">◈ ${esc(fill(RR.inferredLine, { n: coreInf }))} <a href="#/role/${esc(role.id)}/fit">${esc(RR.inferredSee)}</a></p>` : "";
    const slotWhy = x => x.slot === "__domain" ? esc(fill(RR.industry, { names: fit.r.industries.slice(0, 3).map(d => d.name).join(", ") })) : x.slot === "__ai" ? esc(fill(RR.ai, { names: fit.r.ai.map(k => R.skillById[k] ? R.skillById[k].name : k).join(", ") })) : "";
    const gc = gapClassesFor(fit, R, () => showAside(null));
    const classLinks = id => { const cs = gc && gc.byGap && gc.byGap[id]; return cs && cs.length ? `<span class="plinks">${esc(RR.classesCover)} ${cs.slice(0, 3).map(c => `<a href="#/classes?role=${encodeURIComponent(role.id)}&open=${encodeURIComponent(c.code)}">${esc(c.code)}</a>`).join(" · ")}</span><br>` : ""; };
    const gapRow = x => { const openRow = state.gapOpen === x.slot; const gt = gapText(R, x, fit); const ex = slotWhy(x) || (gt ? `${esc(gt.gap)}${x.kind !== "behaviour" ? ` ${esc(RR.lineShows)} <em>“${esc(gt.line.text)}”</em>` : ""}` : (x.build && x.build[0] ? stepHtml(x.build[0]) : esc(RR.openSkillHow))); return `<li class="${openRow ? "open" : ""}"><button type="button" class="t" data-gap="${esc(x.slot)}"><span>${esc(x.slotName)}</span><span class="n">${pct(x.w)}</span></button>${openRow ? `<div class="ex">${ex}${R.skillById[x.id] ? `<br>${classLinks(x.id)}${postingLinks(R, fit.slice, x.id, 3)}` : ""}<br><button type="button" class="linkish link" data-wait="show">${esc(RR.helpBuild)}</button> · <button type="button" class="linkish link" data-wait="positioning">${esc(RR.helpPosition)}</button>${R.skillById[x.id] ? ` · <button type="button" class="linkish link" data-skill="${esc(x.id)}">${esc(RR.openSkill)}</button>` : ""}</div>` : ""}</li>`; };
    // the classes that cover the most core gaps (step 3 of the pass): three links into the picker with the course open;
    // when the roster cannot be read here, one line from the campus file and the picker's link
    const termName = (window.ClassScreens && ClassScreens.termLabel()) || "Spring 2027";
    const classesHead = `<h3 class="rh" style="margin-top:14px">${esc(RR.classesHeading)}</h3>`;
    const classesBlock = !coreGaps.length ? "" : !gc ? `${classesHead}<p class="small muted">${esc(fill(RR.readingRoster, { term: termName }))}</p>`
      : gc.closed ? `${classesHead}<p class="small muted">${esc(gc.closed)} <a href="#/classes?role=${encodeURIComponent(role.id)}">${esc(fill(RR.termClasses, { term: termName }))}</a></p>`
      : gc.top && gc.top.length ? `${classesHead}<ul class="gaps classes">${gc.top.map(c => `<li><a class="t" href="#/classes?role=${encodeURIComponent(role.id)}&open=${encodeURIComponent(c.codes[0])}"><span>${esc(c.codes[0])} · ${esc(c.title)}</span><span class="n">${c.covered.length}</span></a><div class="ex">${esc(fill(RR.covers, { names: c.covered.map(g => g.name).join(", ") }))}</div></li>`).join("")}</ul><p class="small muted" style="margin-top:6px"><a href="#/classes?role=${encodeURIComponent(role.id)}">${esc(fill(RR.allClasses, { term: termName }))}</a></p>`
      : gc.failed ? "" : `${classesHead}<p class="small muted">${esc(fill(RR.noClass, { term: termName }))} <a href="#/classes?role=${encodeURIComponent(role.id)}">${esc(RR.seeRoster)}</a></p>`;
    const gapsHtml = coreGaps.length ? `<h3 class="rh" style="margin-top:14px">${esc(RR.needsEvidence)}</h3><ul class="gaps">${coreGaps.map(gapRow).join("")}</ul>${waitHtml("show")}${waitHtml("positioning")}${bandNext && bandNext !== band ? `<p class="small muted" style="margin-top:8px">${esc(fill(coreGaps.length === 1 ? RR.evidenceOne : RR.evidenceThree, { band: bandName(bandNext) }))}</p>` : ""}${classesBlock}` : `<p class="small muted" style="margin-top:10px">${esc(RR.nothingMissing)}</p>`;
    const n = fit.evid.length + fit.trans.length + (fit.inferred || []).length;
    const you = `<section class="rs"><h3 class="rh">${esc(fill(RR.yourFit, { name: state.resume.name }))} · <a href="#/you?step=3">${esc(CM.change)}</a></h3>${scale}${postingLine}${line}${infLine}${gapsHtml}<p style="margin-top:12px"><a href="#/role/${esc(role.id)}/fit">${esc(n === 1 ? RR.seeAllOne : fill(RR.seeAll, { n }))}</a></p></section>`;
    return legend + you + cta;
  }
  function wireRail() {
    if ($("#drop")) { wireResumeForm(); const b = $("#rail-read"); if (b) b.onclick = async () => { if (await takeResume()) { state.fit = null; keepScroll(renderRole); } else $("#file-status").textContent = RF.nothing; }; }
    aside.querySelectorAll("[data-gap]").forEach(b => b.onclick = () => { state.gapOpen = state.gapOpen === b.dataset.gap ? null : b.dataset.gap; showAside(null); });
    aside.querySelectorAll("[data-wait]").forEach(b => b.onclick = e => { e.preventDefault(); state.wait = state.wait === b.dataset.wait ? null : b.dataset.wait; showAside(null); });
    aside.querySelectorAll("[data-wait-close]").forEach(b => b.onclick = e => { e.preventDefault(); state.wait = null; showAside(null); });
    wireWait(aside, () => showAside(null));
    aside.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }));
  }
  // the persona lines are templates (Copy.fit.persona); the bold part is marked after escaping
  const FT = Copy.fit, bold = s => s.replace(/\[\[/g, "<b>").replace(/\]\]/g, "</b>");
  const PERSONA = {
    experienced_in_role: (p, field) => bold(esc(fill(FT.persona.experienced, { level: `[[${Matcher.LADDER_LABEL[p.level]}]]`, field, roleYears: fmtYears(p.pmYears), years: fmtYears(p.years) }))),
    pivoter: (p, field) => bold(esc(fill(FT.persona.pivoter, { field: `[[${field}]]`, from: p.backgrounds.length ? p.backgrounds.map(b => Matcher.VIA_LABEL[b] || b).join(", ") : FT.persona.anotherField, years: fmtYears(p.years) }))),
    new_to_role: (p, field) => bold(esc(fill(FT.persona.newToRole, { field: `[[${field}]]`, intern: p.pmIntern ? FT.persona.withIntern : "", other: p.years >= 1 ? fill(FT.persona.otherWork, { years: fmtYears(p.years) }) : "" }))),
  };
  const fmtYears = y => y < 1 ? FT.underYear : fill(FT.years, { n: Math.round(y * 2) / 2 });
  async function fitScreen(id) {
    const g = await loadRole(id); const R = state.R, role = R.role;
    crumbs([[Copy.explore.crumb, "#/explore"], [g.label, "#/field/" + g.id], [role.label, "#/role/" + role.id], [FT.crumb, null]]);
    if (!state.resume) {
      page(`<p class="eyebrow">${esc(fill(FT.eyebrow, { role: role.label }))}</p><h1>${esc(FT.addResume)}</h1><p class="lead">${esc(fill(FT.addLead, { role: role.label }))}</p>${resumeForm()}<div class="row" style="margin-top:12px"><button type="button" class="btn primary" id="go">${esc(RF.readFit)}</button><a class="btn quiet" href="#/role/${esc(role.id)}">${esc(FT.backRole)}</a></div>`, true);
      showAside(null); wireResumeForm();
      $("#go").onclick = async () => { if (await takeResume()) fitScreen(id); else $("#file-status").textContent = RF.nothing; };
      return;
    }
    const level = state.fitLevel || state.level;
    const f = fitFor(level) || (state.fit = await computeFit(R, level));
    if (fitScreen.tracked !== role.id) { fitScreen.tracked = role.id; track("fit", { role_id: role.id }); }   // once per role per visit
    // a pasted posting on file for this role (PLAN.md v16, step 9): the skills it names come first, marked; the band
    // stays the role's (one document, a band calibrated on the role)
    const P = postingFor(role.id), asks = P ? new Set([...P.found].filter(k => R.skillById[k] && R.skillById[k].cluster !== "credentials")) : null;
    const { r, band, evid, trans, thin, presumed, gaps, core, extra } = f, through = f.through || [], inferred = f.inferred || [], coreHave = f.coreHave.length;
    const field = g.label.toLowerCase();
    const p = r.profile;
    const gcF = gapClassesFor(f, R, () => { if (location.hash.endsWith("/fit")) keepScroll(() => fitScreen(id)); });
    const verdict = band ? `<p class="small">${esc(bandName(band))} ${tip(FT.bandsTip)}</p>` : "";
    const st = r.standing;
    const standing = st ? `<p class="small">${esc(st.above ? fill(FT.standingAbove, { level: Matcher.LADDER_LABEL[st.level], years: fmtYears(st.years) }) : fill(FT.standingAt, { years: fmtYears(st.years) }))}${st.employers.length ? esc(fill(FT.standingEmployer, { employer: st.employers[0] })) : ""}. ${st.presumed ? bold(esc(st.presumed === 1 ? FT.presumedOne : fill(FT.presumedMany, { n: `[[${st.presumed}]]` }))) : ""}</p>` : "";
    const unread = r.parsed.roles.length === 0 && r.parsed.lines >= 15 ? `<div class="notice"><b>${esc(FT.noDates)}</b> ${esc(FT.noDatesLine)}</div>` : "";
    const placeholder = r.parsed.placeholderDates && r.parsed.roles.some(x => x.placeholder) ? `<div class="notice"><b>${esc(FT.placeholders)}</b> ${esc(FT.placeholdersLine)}</div>` : "";
    // the two slots that stand for a group of skills get plain words: which industry, which kind of AI work
    const slotWhy = x => x.slot === "__domain" ? " " + esc(fill(FT.industry, { names: r.industries.slice(0, 4).map(d => d.name).join(", ") })) : x.slot === "__ai" ? " " + esc(fill(FT.ai, { names: r.ai.map(k => R.skillById[k] ? R.skillById[k].name : k).join(", ") })) : "";
    const tag = (x, cls) => R.skillById[x.id] ? `<button type="button" class="tag ${cls}" data-skill="${esc(x.id)}">${esc(x.slotName)}${cls === "amber" ? ` <span class="subtle">${esc(FT.otherWords)}</span>` : ""}</button>` : `<span class="tag ${cls}">${esc(x.slotName)}</span>`;
    const yoeAsk = r.creds.filter(c => c.id.startsWith("yoe_")).sort((a, b) => b.w - a.w)[0];
    const creds = r.creds.filter(c => !c.id.startsWith("yoe_"));
    if (yoeAsk) creds.unshift({ name: fill(FT.yearsAsked, { years: yoeAsk.name.replace(" experience", ""), you: fmtYears(p.years) }), w: yoeAsk.w, have: yoeAsk.have });
    const credLine = creds.length ? `<p class="small">${creds.map(c => `<span class="${c.have ? "" : "muted"}" style="${c.have ? "color:var(--primary)" : ""}">${c.have ? "✓" : "○"} ${esc(c.name)}</span>`).join(" · ")}</p>` : "";
    const indLine = r.industries.length ? `<p class="small muted">${esc(FT.industriesHiring)} ${r.industries.slice(0, 8).map(d => `<span style="${d.have ? "color:var(--primary)" : ""}">${d.have ? (d.inferred ? "◈ " : "✓ ") : ""}${esc(d.name)} ${pct(d.w)}</span>`).join(" · ")}. ${esc(FT.oneEnough)}</p>` : "";
    const sayIt = trans.length ? disc("sayit", esc(fill(FT.sayIt, { field, n: trans.length })), `<ul class="plain">${trans.slice(0, 5).map(x => { const gt = gapText(R, x, f); return `<li><b>${esc(x.slotName)}</b>${x.lines[0] ? `<br>“${esc(x.lines[0].text.slice(0, 160))}”` : ""}${gt && gt.reads ? `<br>${esc(fill(FT.inFieldMeans, { field }))} ${esc(gt.reads)}` : ""}${gt ? `<br>${esc(FT.postingsSayLike)} <b>${esc(gt.line.text)}</b>` : ""}</li>`; }).join("")}</ul>`) : "";
    const thinNamed = evid.filter(x => !x.depth);
    const thinDisc = thinNamed.length ? disc("thin", esc(fill(FT.thin, { n: thinNamed.length })), `<p class="small muted">${esc(FT.thinLead)}</p><ul class="plain">${thinNamed.slice(0, 5).map(x => { const gt = gapText(R, x, f); return `<li>${esc(x.name)}${gt ? ` — ${esc(gt.thin)}` : ""}${(R.subs[x.id] || []).filter(s => !r.subs.has(s.id)).length ? ` ${esc(FT.mention)} ${(R.subs[x.id] || []).filter(s => !r.subs.has(s.id)).slice(0, 3).map(s => esc(s.name)).join(" · ")}` : ""}</li>`; }).join("")}</ul>`) : "";
    // the model read's skills, each with the line that suggested it and why (the legend's promise: the line is below);
    // an industry it inferred is listed too, as the industry slot reads it
    const infInd = r.industries.filter(d => d.inferred);
    const infItems = [...inferred.map(x => ({ name: x.slotName === x.name ? x.name : `${x.slotName}: ${x.name}`, ...(x.inferred || {}) })), ...infInd.filter(d => !inferred.some(x => x.id === d.id)).map(d => ({ name: `${FT.inferredIndustry}: ${d.name}`, ...d.inferred }))];
    const infDisc = infItems.length ? disc("inferred", esc(fill(FT.inferred, { n: infItems.length })), `<p class="small muted">${esc(FT.inferredLead)}</p><ul class="plain">${infItems.map(x => `<li><span class="mark">◈</span> <b>${esc(x.name)}</b>${x.line ? `<br>“${esc(x.line.slice(0, 200))}”` : ""}${x.why ? `<br><span class="muted">${esc(x.why)}</span>` : ""}</li>`).join("")}</ul>`) : "";
    const unmapped = r.unmapped.length ? disc("unmapped", esc(fill(FT.unmapped, { n: r.unmapped.length })), `<ul class="plain">${r.unmapped.map(t => `<li class="muted">${esc(t)}</li>`).join("")}</ul>`) : "";
    // two ranked columns (owner's choice F2): what you show and what is still to show, five each at rest, ranked by
    // how many postings ask, the bar for weight; a mark says "said in other words" or "presumed from a role you held"
    const fitRow = x => {
      const k = x.status === "evidenced" ? "have" : x.status === "transferable" ? "have" : x.status === "through" ? "have" : x.status === "inferred" ? "have" : x.status === "presumed" ? "thin" : x.status === "thin" ? "thin" : "gap";
      const measure = x.status === "through" ? fill(FT.marks.through, { name: x.throughName || "that skill" }) : x.status === "transferable" ? FT.marks.transferable : x.status === "inferred" ? fill(FT.marks.inferred, { line: ((x.inferred || {}).line || "").slice(0, 160) }) : x.status === "presumed" ? FT.marks.presumed : x.status === "thin" ? FT.marks.thin : null;
      const mark = measure ? `<span class="mark" data-measure="${esc(measure)}">${{ through: "⤷", transferable: "⟲", inferred: "◈", presumed: "◌", thin: "○" }[x.status]}</span>` : "";
      const pmark = asks && asks.has(x.id) ? `<span class="ptag" data-measure="${esc(fill(FT.postingAsks, { name: x.slotName }))}">${esc(FT.postingTag)}</span>` : "";
      const inner = `<span class="nm">${fitDot(k)}${esc(x.slotName)}${mark}${pmark}</span><span class="bar" data-measure="${esc(fill(FT.barMeasure, { share: pct(x.w), name: x.slotName, most: x.tier === "core" ? FT.mostOfThem : "" }))}"><i style="width:${Math.round(x.w * 100)}%"></i></span>`;
      const cs = k === "gap" && gcF && gcF.byGap && gcF.byGap[x.id];
      const classes = cs && cs.length ? `<span class="plinks">${esc(FT.classesCover)} ${cs.slice(0, 3).map(c => `<a href="#/classes?role=${encodeURIComponent(role.id)}&open=${encodeURIComponent(c.code)}">${esc(c.code)}</a>`).join(" · ")}</span>` : "";
      const links = [classes, k === "gap" && R.skillById[x.id] ? postingLinks(R, f.slice, x.id, 2) : ""].filter(Boolean).join("<br>");
      return (R.skillById[x.id] ? `<button type="button" class="srow ${k}" data-skill="${esc(x.id)}">${inner}</button>` : `<div class="srow ${k}">${inner}</div>`) + (links ? `<p class="small muted plinks-row">${links}</p>` : "");
    };
    const col = (key, title, items, empty, foot) => { const more = state.fitMore.has(key), shown = more ? items : items.slice(0, 5); return `<div><h3>${esc(title)} <span class="n">${items.length}</span></h3>${items.length ? `<div class="srows">${shown.map(fitRow).join("")}</div>${items.length > 5 ? `<button type="button" class="linkish link more" data-fitmore="${key}">${esc(more ? FT.showFewer : fill(FT.more, { n: items.length - 5 }))}</button>` : ""}` : `<p class="small muted">${esc(empty)}</p>`}${foot || ""}</div>`; };
    const byPosting = (a, b) => (asks ? (asks.has(b.id) - asks.has(a.id)) : 0) || b.w - a.w;
    const showItems = [...evid, ...trans, ...through, ...inferred].sort(byPosting).concat(presumed), stillItems = [...gaps, ...thin].map(x => x).sort(byPosting);
    const sayLink = trans.length ? `<p class="small" style="margin-top:8px"><button type="button" class="linkish link" id="say-it">${esc(fill(FT.sayItButton, { field }))}</button></p>` : "";
    const showTab = `<div class="fitcols">${col("show", FT.already, showItems, FT.nothingYet, sayLink)}${col("gaps", FT.needsEvidence, stillItems, FT.nothingAmong)}</div>`;
    const detailTab = `${infDisc}${sayIt}${thinDisc}<h3>${esc(FT.credentials)}</h3>${credLine + indLine || `<p class="small muted">${esc(FT.noneAsked)}</p>`}${unmapped}`;
    const FTABS = [["show", FT.tabs.show, null], ["details", FT.tabs.details, null]];
    const fitTabs = `<div class="tabs" role="tablist">${FTABS.map(([k, l, n]) => `<button type="button" role="tab" class="${state.fitTab === k ? "on" : ""}" aria-selected="${state.fitTab === k}" data-ftab="${k}">${esc(l)}${n != null ? `<span class="n">${fmt(n)}</span>` : ""}</button>`).join("")}</div>`;
    const fitBody = state.fitTab === "details" ? detailTab : showTab;
    const ctx = `<div class="row between fit-top"><p class="eyebrow">${esc(fill(FT.eyebrow, { role: role.label }))}${extra.length ? " · " + esc(extra.join(", ")) : ""}</p><span class="small muted ctx"><select id="fit-level" aria-label="${esc(RL.levelAria)}">${["all", ...Atlas.STEPS].map(s => `<option value="${s}"${level === s ? " selected" : ""}>${esc(s === "all" ? FT.allLevels : R.stepLabels[s])}</option>`).join("")}</select> · ${esc(state.resume.name)} · <a href="#/role/${esc(role.id)}/fit" id="change">${esc(CM.change)}</a></span></div>`;
    // "Have a posting? Paste it." under the resume: a drop-or-paste box; with one on file, what it asks for and the count
    const pSum = asks ? postingSummary(asks, f) : null;
    const postingBox = `<div class="posting-box">${P ? `<p class="small">${bold(esc(fill(pSum.m === 1 ? FT.postingLineOne : FT.postingLine, { name: `[[${P.name}]]`, m: pSum.m, n: `[[${pSum.n}]]` })))} <button type="button" class="linkish link" id="posting-change">${esc(FT.pasteAnother)}</button> · <button type="button" class="linkish link" id="posting-forget">${esc(FT.forgetPosting)}</button></p>` : `<details class="disc" id="posting-disc"${state.postingOpen ? " open" : ""}><summary>${esc(FT.havePosting)}</summary><div class="disc-body"><p class="small muted">${esc(FT.postingLead)}</p>${postingForm()}<div class="row" style="margin:10px 0 4px"><button type="button" class="btn primary" id="go">${esc(FT.readPosting)}</button></div></div></details>`}</div>`;
    page(`${ctx}${unread}${placeholder}${verdict}
      <p class="lead">${PERSONA[p.persona](p, field)} ${bold(esc(fill(FT.youShow, { count: `[[${coreHave} of ${core.length}]]`, role: role.label })))}</p>${standing}${postingBox}
      ${fitTabs}${fitBody}
      <div class="fit-wait">${applyBox("fit", { always: true })}</div>
      <p class="small muted" style="margin-top:20px"><a href="#/role/${esc(role.id)}">${esc(fill(FT.backTo, { role: role.label }))}</a>${esc(FT.backAfter)}</p>`);
    wireWait(main, () => keepScroll(() => fitScreen(id)));
    main.querySelectorAll("[data-ftab]").forEach(b => b.onclick = () => { state.fitTab = b.dataset.ftab; keepScroll(() => fitScreen(id)); });
    main.querySelectorAll("[data-fitmore]").forEach(b => b.onclick = () => { toggle(state.fitMore, b.dataset.fitmore); keepScroll(() => fitScreen(id)); });
    const si = $("#say-it"); if (si) si.onclick = () => { state.fitTab = "details"; state.open.add("sayit"); fitScreen(id); };
    $("#fit-level").onchange = e => { state.fitLevel = e.target.value; state.level = e.target.value; state.fit = null; fitScreen(id); };
    main.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }, true));
    main.querySelectorAll("details[data-k]").forEach(d => d.ontoggle = () => { d.open ? state.open.add(d.dataset.k) : state.open.delete(d.dataset.k); });
    $("#change").onclick = e => { e.preventDefault(); state.resume = null; state.fit = null; fitScreen(id); };
    const pd = $("#posting-disc"); if (pd) { pd.ontoggle = () => { state.postingOpen = pd.open; }; if (pd.open) wireFileDrop(async t => { await takePosting(role.id, t); fitScreen(id); }); else pd.addEventListener("toggle", () => { if (pd.open) wireFileDrop(async t => { await takePosting(role.id, t); fitScreen(id); }); }, { once: true }); }
    const pc = $("#posting-change"); if (pc) pc.onclick = () => { state.posting = null; store.set("posting", null); state.postingOpen = true; fitScreen(id); };
    const pf = $("#posting-forget"); if (pf) pf.onclick = () => { state.posting = null; store.set("posting", null); state.postingOpen = false; fitScreen(id); };
    renderAside();
  }
  // the posting on file (PLAN.md v16, step 9): kept in localStorage under `posting` like `course`, per role
  function postingFor(roleId) {
    if (!state.posting) { const saved = store.get("posting"); if (saved) state.posting = { ...saved, found: new Set(saved.found), subs: new Set(saved.subs || []) }; }
    return state.posting && state.posting.roleId === roleId ? state.posting : null;
  }
  async function takePosting(roleId, t) {
    const r = await Atlas.readPosting(t.text);
    state.posting = { roleId, name: t.name, text: t.text, found: r.found, subs: r.subs, lines: r.lines };
    store.set("posting", { roleId, name: t.name, text: t.text, found: [...r.found], subs: [...r.subs], lines: r.lines });
    state.postingOpen = false;
  }
  function postingForm() {
    return `<div class="drop" id="drop"><p><b>${esc(FT.dropPosting)}</b> ${esc(RF.or)} <label class="link" for="file">${esc(RF.choose)}</label></p><input type="file" id="file" accept=".pdf,.docx,.txt,.md" hidden><p class="small muted" id="file-status"></p></div>
      <p class="small muted">${esc(FT.pastePosting)}</p><textarea id="paste" rows="6" aria-label="${esc(FT.postingAria)}" placeholder="${esc(FT.postingPlaceholder)}"></textarea>`;
  }
  // "N of the M skills this posting asks for are on your resume": M is the posting's skills that are this role's
  // (credentials left out), N those the fit shows (evidenced, in other words, or through a carrier)
  function postingSummary(asks, f) {
    const shown = new Set([...f.evid, ...f.trans, ...(f.through || [])].map(x => x.id));
    const m = asks.size, n = [...asks].filter(k => shown.has(k)).length;
    return { m, n };
  }

  // ---------- 6. check a course: which of the role's skills a syllabus teaches ----------
  async function courseScreen(id) {
    const g = await loadRole(id); const R = state.R, role = R.role;
    const CO = FT.course;
    crumbs([[Copy.explore.crumb, "#/explore"], [g.label, "#/field/" + g.id], [role.label, "#/role/" + role.id], [CO.crumb, null]]);
    if (!state.course) { const saved = store.get("course"); if (saved) state.course = { ...saved, found: new Set(saved.found) }; }
    const c = state.course && state.course.roleId === role.id ? state.course : null;
    // what a course can show, by kind (PLAN.md v14, decision 5); a course saved before the split is split here
    const split = c ? (c.teaches ? { teaches: c.teaches, named: c.named } : Atlas.courseSplit(c.found, R.skillById)) : null;
    const form = `<div class="drop" id="drop"><p><b>${esc(CO.drop)}</b> ${esc(RF.or)} <label class="link" for="file">${esc(RF.choose)}</label></p><input type="file" id="file" accept=".pdf,.docx,.txt,.md" hidden><p class="small muted" id="file-status">${c ? esc(fill(CO.read, { name: c.name })) : ""}</p></div>
      <p class="small muted">${esc(CO.paste)}</p><textarea id="paste" rows="6" aria-label="${esc(CO.aria)}" placeholder="${esc(CO.placeholder)}">${c ? esc(c.text) : ""}</textarea>
      <div class="row" style="margin:12px 0 4px"><button type="button" class="btn primary" id="go">${esc(CO.button)}</button><span class="small muted">${esc(CM.noLeave)}</span></div>`;
    let result = "";
    if (c) {
      const slice = sliceOf(); const { rows } = Atlas.grid(R, slice);
      const inGrid = rows.flat(2); const showable = x => Atlas.COURSE_KINDS.has((R.skillById[x.id] || {}).kind);
      // taught: skills of the four kinds a course can show; named: behaviours and practices the text mentions, listed apart,
      // not painted, not counted; "does not cover" is the craft among the most-asked skills that the text does not name
      const taught = inGrid.filter(x => split.teaches.has(x.id)), named = inGrid.filter(x => split.named.has(x.id)), core = rows[0].flat(), coreTaught = core.filter(x => split.teaches.has(x.id)), notTaught = core.filter(x => showable(x) && !split.teaches.has(x.id));
      const m = state.match && state.match.roleId === role.id ? state.match : null;
      const gapsCovered = m ? taught.filter(x => m.required.has(x.id) && !m.matched.has(x.id)) : [];
      state.paint = { roleId: role.id, matched: new Set(taught.map(x => x.id)), required: new Set(core.filter(showable).map(x => x.id)), presumed: new Set(), subs: new Set(Object.values(c.ev || {}).flatMap(e => [...(e.subs || [])])) };
      const tagOf = x => `<button type="button" class="tag good" data-skill="${esc(x.id)}">${esc(x.name)}${x.defining ? " ◆" : ""} <span class="subtle">${pct(x.share)}</span></button>`;
      const T5 = textOf(R.kinds);
      const namedHtml = named.length ? `<h2>${esc(CO.named)}</h2><div class="tags">${named.map(x => `<button type="button" class="tag" data-skill="${esc(x.id)}">${esc(x.name)} <span class="subtle">${pct(x.share)}</span></button>`).join("")}</div><p class="small muted">${esc(T5.how("behaviour"))} ${esc(CO.namedNote)} <a href="#/role/${esc(role.id)}/fit">${esc(CO.yourFit)}</a>.</p>` : "";
      result = taught.length || named.length ? `${taught.length ? `<h2>${esc(CO.teaches)}</h2><div class="tags">${taught.map(tagOf).join("")}</div>
        <p class="small muted">${esc(fill(CO.coreLine, { n: coreTaught.length, m: core.filter(showable).length, role: role.label }))}${gapsCovered.length ? " " + esc(fill(gapsCovered.length === 1 ? CO.coversOne : CO.coversMany, { n: gapsCovered.length, names: gapsCovered.map(x => x.name).join(", ") })) : m ? " " + esc(CO.coversNone) : ` <a href="#/role/${esc(role.id)}/fit">${esc(CO.checkFit)}</a> ${esc(CO.checkFitAfter)}`} ${esc(CO.shareNote)}</p>` : `<p class="notice">${esc(CO.noSkill)}</p>`}${namedHtml}
        ${notTaught.length ? `<h2>${esc(CO.notCover)}</h2><div class="tags">${notTaught.map(x => `<button type="button" class="tag bad" data-skill="${esc(x.id)}">${esc(x.name)}${x.defining ? " ◆" : ""}</button>`).join("")}</div><p class="small muted">${esc(CO.notCoverNote)}</p>` : ""}
        <h2>${esc(CO.onList)}</h2><p class="small muted">${esc(CO.onListNote)}</p>${flatSkills(R, slice, state.paint)}` : `<div class="notice"><b>${esc(CO.noneFound)}</b> ${esc(c.lines < 3 ? CO.tooShort : CO.checkText)}</div>`;
    }
    page(`<p class="eyebrow">${esc(fill(CO.eyebrow, { role: role.label }))}</p><h1>${esc(CO.heading)}</h1><p class="lead">${esc(fill(CO.lead, { role: role.label }))}</p>${form}${result}<p class="small muted" style="margin-top:12px"><a href="#/role/${esc(role.id)}">${esc(fill(FT.backTo, { role: role.label }))}</a></p>`);
    wireFileDrop(async text => { const r = await Atlas.readCourse(text.text); track("course_read", { role_id: role.id }); state.course = { roleId: role.id, name: text.name, text: text.text, found: r.found, teaches: r.teaches, named: r.named, ev: r.ev, lines: r.lines }; store.set("course", { roleId: role.id, name: text.name, text: text.text, found: [...r.found], ev: {}, lines: r.lines }); courseScreen(id); });
    main.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }, true));
    renderAside();
  }
  // a drop zone plus a paste box, for any text; `onText({ text, name })` runs when the person clicks the button
  function wireFileDrop(onText) {
    wireResumeForm();
    $("#go").onclick = async () => {
      const pasted = ($("#paste") || {}).value || "";
      const r = pasted.trim().length >= 20 ? { text: pasted, name: RF.pastedName } : pending ? pending : null;
      if (!r) { $("#file-status").textContent = RF.nothingText; return; }
      pending = null; await onText(r);
    };
  }

  // ---------- 7. prepare for an event: who is in the room, what to say, what to build ----------
  const EV = Copy.fit.event, EVENTS = Object.keys(EV.kinds).map(k => [k, EV.kinds[k], EV.kindLines[k]]);
  async function eventScreen(gid) {
    const ix = await Atlas.index(); const g = ix.groups.find(x => x.id === gid);
    const GENERIC = await Atlas.genericSkills();
    if (!g) return explore();
    if (g.set === "product") await Atlas.product();
    const kind = (location.hash.split("?")[1] || "networking").split("&")[0];
    crumbs([[Copy.explore.crumb, "#/explore"], [g.label, "#/field/" + g.id], [EV.crumb, null]]); showAside(null);
    const roles = g.roles.map(r => ix.roles[r]).sort((a, b) => b.nOpen - a.nOpen);
    const nameOf = id => (ix.skillById[id] || (productNames ? { name: productNames[id] } : null) || { name: id }).name;
    // what sets a role apart: its defining skills, else its most asked skills that are not generic to every role
    const marks = r => (r.definingList.length ? r.definingList : r.asks.filter(a => !GENERIC.has(a.id) && ix.skillById[a.id] && !["credentials", "domain"].includes(ix.skillById[a.id].cluster))).slice(0, 2).map(a => a.id);
    const rg = state.resume ? await rough() : null;
    const coreOf = r => r.asks.filter(a => a.share >= Atlas.TIER.core && ix.skillById[a.id] && ix.skillById[a.id].cluster !== "credentials").map(a => a.id);
    const chips = `<div class="chips">${EVENTS.map(([k, t]) => `<a class="chip${kind === k ? " on" : ""}" href="#/field/${esc(g.id)}/event?${k}">${esc(t)}</a>`).join("")}</div>`;
    let body = "";
    const nOpen = r => esc(fill(CM.nOpen, { n: fmt(r.nOpen) }));
    if (kind === "networking") {
      body = `<h2>${esc(EV.inRoom)}</h2><p class="small muted">${esc(fill(EV.inRoomLead, { field: g.label.toLowerCase() }))}</p>
        <div class="list">${roles.map(r => `<a class="r" href="#/role/${esc(r.id)}"><span class="t">${esc(r.label)}</span><span class="n">${nOpen(r)}</span><span class="m">${esc(fill(EV.askAbout, { names: marks(r).map(id => nameOf(id).toLowerCase()).join(", ") || EV.askWeek }))}</span></a>`).join("")}</div>
        <h2>${esc(EV.sayAbout)}</h2>${rg ? sayAboutYou(roles, rg, coreOf, nameOf, GENERIC) : `<p class="small muted"><a href="#/you">${esc(EV.addResume)}</a> ${esc(EV.addResumeSay)}</p>`}
        <h2>${esc(EV.employers)}</h2><div id="employers"><p class="small muted">${esc(EV.loadingPostings)}</p></div>`;
    } else if (kind === "roundtable") {
      // owner's choice E5: the resume lines once at the top, then one card per role, the first open
      body = `${rg ? `<h2>${esc(EV.yourLines)}</h2><div id="yourlines"><p class="small muted">${esc(EV.readingRoles)}</p></div>` : ""}
        <h2>${esc(EV.roleByRole)}</h2><p class="small muted">${rg ? esc(EV.roleByRoleLead) : `<a href="#/you">${esc(EV.addResume)}</a> ${esc(EV.roleByRoleNoResume)}`}</p>
        <div id="roundtable">${roles.map((r, i) => rg ? '' : `<details class="empbox"${i === 0 ? " open" : ""}><summary><span class="t">${esc(r.label)}</span><span class="n">${nOpen(r)}</span><span class="m">${esc(fill(EV.mostAsk, { names: join(coreOf(r).filter(id => !GENERIC.has(id)).slice(0, 3).map(id => nameOf(id))) }))}</span></summary><div class="box-body"><p class="small muted">${esc(fill(EV.mostAskList, { names: coreOf(r).filter(id => !GENERIC.has(id)).slice(0, 6).map(id => nameOf(id)).join(", ") }))} <a href="#/role/${esc(r.id)}">${esc(EV.openRole)}</a></p></div></details>`).join("")}${rg ? `<p class="small muted">${esc(EV.readingRoles)}</p>` : ""}</div>`;
    } else {
      // what to build: the skills most roles of the field ask for that the resume does not show, with the build step where one is written
      const count = {}; for (const r of roles) for (const id of coreOf(r)) count[id] = (count[id] || 0) + 1;
      const cands = Object.entries(count).filter(([id]) => !GENERIC.has(id) && (!rg || !rg.shown.has(id))).sort((a, b) => b[1] - a[1]).slice(0, 5);
      body = `<h2>${esc(EV.build)}</h2><p class="small muted">${rg ? esc(EV.buildLead) : `${esc(EV.buildNoResume)} <a href="#/you">${esc(EV.addResume)}</a> ${esc(EV.buildNoResumeAfter)}`}</p>
        <ol class="next">${cands.map(([id, n]) => { const sk = ix.skillById[id] || {}; const steps = roles.filter(r => coreOf(r).includes(id)).map(r => buildSteps(sk, r.ladder).steps).find(x => x.length) || []; return `<li><b>${esc(nameOf(id))}</b><span class="why">${esc(n === 1 ? EV.askedByOne : fill(EV.askedByMany, { n }))}${steps.length ? ` ${stepHtml(practise(steps))}` : " " + esc(EV.noStep)}</span></li>`; }).join("") || `<li>${esc(EV.nothingLeft)}</li>`}</ol>`;
    }
    page(`<h1>${esc(EV.heading)}</h1><p class="lead">${esc(fill(EV.lead, { field: g.label }))}</p>${chips}${body}`);
    if (kind === "roundtable" && rg) Atlas.fieldMatches(g.id, state.resume.text).then(res => {
      if (!location.hash.startsWith(`#/field/${g.id}/event`)) return;
      const el = $("#roundtable"); if (!el) return;
      const askName = x => x.slot === "__domain" ? EV.industryKnown : x.slot === "__ai" ? EV.aiWork : x.slotName;
      const per = roles.map(r => { const rows = res[r.id].rows.filter(x => x.tier !== "diff");
        return { r, have: rows.filter(x => (x.status === "evidenced" || x.status === "transferable") && !GENERIC.has(x.slot)).sort((a, b) => b.w - a.w).slice(0, 3), ask: rows.filter(x => (x.status === "gap" || x.status === "thin") && !GENERIC.has(x.slot)).sort((a, b) => b.w - a.w).slice(0, 2) }; });
      // the lines: each resume line that shows a skill, once, with how many of the roles it fits
      const lines = new Map();
      for (const { have } of per) for (const x of have) if (x.lines[0]) { const t = x.lines[0].text, e = lines.get(t) || { text: t, skills: new Set(), roles: 0, say: null }; e.skills.add(x.name); e.roles++; if (x.status === "transferable") { const s = ix.skillById[x.id]; if (s) e.say = textOf(ix.M.meta.kinds).line(s, [`role:${r.family}`, r.group]).text; } lines.set(t, e); }
      const top = [...lines.values()].sort((a, b) => b.roles - a.roles).slice(0, 3);
      const yl = $("#yourlines"); if (yl) yl.innerHTML = top.length ? `<ol class="next">${top.map(e => `<li><b>${esc([...e.skills].slice(0, 2).join(", "))}</b>: “${esc(e.text.length > 160 ? e.text.slice(0, 157) + "…" : e.text)}”<span class="why">${esc(fill(EV.fits, { n: e.roles, m: roles.length }))}${e.say ? ` ${esc(EV.sayLike)} <b>${esc(e.say)}</b>` : ""}</span></li>`).join("")}</ol>` : `<p class="small muted">${esc(EV.noLines)}</p>`;
      el.innerHTML = per.map(({ r, have, ask }, i) => {
        const summary = `${esc(have.length ? fill(EV.leadWith, { names: join(have.slice(0, 2).map(x => x.name)) }) : EV.nothingLead)}${ask.length ? esc(fill(EV.mayAsk, { names: join(ask.map(askName)) })) : ""}`;
        const line = x => x.lines[0] ? `<span class="small muted">“${esc(x.lines[0].text.length > 120 ? x.lines[0].text.slice(0, 117) + "…" : x.lines[0].text)}”</span>` : "";
        return `<details class="empbox"${i === 0 ? " open" : ""}><summary><span class="t">${esc(r.label)}</span><span class="n">${nOpen(r)}</span><span class="m">${summary}</span></summary><div class="box-body">${have.length ? `<ul class="plain">${have.map(x => `<li><b>${esc(x.name)}</b> <span class="subtle" data-measure="${esc(fill(EV.roleMeasure, { share: pct(x.w), role: r.label }))}">${pct(x.w)}</span> ${line(x)}</li>`).join("")}</ul>` : `<p class="small muted">${esc(EV.showsNone)}</p>`}${ask.length ? `<p class="small muted">${esc(fill(EV.mayAskList, { names: ask.map(askName).join(", ") }))}</p>` : ""}<p class="small"><a href="#/role/${esc(r.id)}">${esc(EV.openRole)}</a></p></div></details>`; }).join("");
    }).catch(e => { const el = $("#roundtable"); if (el) el.insertAdjacentHTML("afterbegin", `<p class="notice">${esc(EV.readFailed)}</p>`); console.error(e); });
    if (kind === "networking") Atlas.fieldJobs(g.id).then(jobs => { if (!location.hash.startsWith(`#/field/${g.id}/event`)) return; const by = {}; for (const j of jobs) if (j.open) { const e = by[j.company] ||= { n: 0, roles: new Set() }; e.n++; e.roles.add(j.family); } const top = Object.entries(by).sort((a, b) => b[1].n - a[1].n).slice(0, 12); const el = $("#employers"); if (el) { const draw = all => { el.innerHTML = `<div class="list">${top.slice(0, all ? 12 : 5).map(([c, e]) => `<div class="r"><span class="t">${esc(c)}</span><span class="n">${esc(fill(CM.nOpen, { n: fmt(e.n) }))}</span><span class="m">${[...e.roles].map(f => esc((ix.roles[f] || {}).label || f)).slice(0, 4).join(", ")}</span></div>`).join("")}</div>${top.length > 5 ? `<p class="small" style="margin-top:8px"><button type="button" class="linkish link" id="emp-all">${esc(all ? EV.fewer : fill(EV.allN, { n: top.length }))}</button></p>` : ""}`; const b = $("#emp-all"); if (b) b.onclick = () => draw(!all); }; draw(false); } }).catch(e => { const el = $("#employers"); if (el) el.innerHTML = `<p class="small muted">${esc(EV.loadFailed)}</p>`; console.error(e); });
  }
  function sayAboutYou(roles, rg, coreOf, nameOf, GENERIC) {
    const count = {}; for (const r of roles) for (const id of coreOf(r)) if (rg.shown.has(id) && !GENERIC.has(id)) count[id] = (count[id] || 0) + 1;
    const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return top.length ? `<p class="small muted">${esc(EV.fromResume)}</p><div class="tags">${top.map(([id]) => `<span class="tag good">${esc(nameOf(id))}</span>`).join("")}</div>` : `<p class="small muted">${esc(EV.noSkillYet)}</p>`;
  }

  // ---------- about the data ----------
  const niceDate = d => { const [y, m, day] = String(d || "").split("-"); const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return m && day ? `${Number(day)} ${names[Number(m) - 1]} ${y}` : esc(d); };
  // employers by where they come from: the Fortune 500 list, venture-backed startups, and the employers added for the MBA set
  const origins = cs => { const n = { fortune: 0, startup: 0, mba: 0 }; for (const c of cs) n[c.group === "startup" ? "startup" : c.group === "mba_employer" ? "mba" : "fortune"]++; return n; };
  // About (v19 B5): what the site is (the four verbs), what it counts (from the data), how it reads a posting, and
  // privacy (the funnel events, the list kept true to web/capture.js EVENTS; the email; the resume text once to the model read, web/infer.js)
  async function about() {
    const [ix, counts] = await Promise.all([Atlas.index(), openCounts()]);
    const AB = Copy.about;
    crumbs([[AB.crumb, null]]); showAside(null);
    const M = ix.M, o = origins(M.meta.companies), n = homeCounts(ix, counts);   // the same open count as home and Find jobs
    const top = (cs, k) => cs.slice().sort((a, b) => b.n - a.n).slice(0, k).map(c => `${esc(c.name)} <span class="muted">${fmt(c.n)}</span>`).join(" · ");
    const fact = (v, l) => `<div class="fact"><b>${v}</b><span>${esc(l)}</span></div>`;
    let nClasses = null, productPart = `<p class="small muted">${esc(AB.productLoading)}</p>`;
    const term = (window.ClassScreens && ClassScreens.termLabel()) || "Spring 2027";
    const render = () => page(`<div id="about"><h1>${esc(AB.heading)}</h1>
      <p class="lead">${esc(AB.lead)}</p>
      <h3>${esc(AB.jobs)}</h3>
      <p class="small">${esc(AB.jobsLine)}</p>
      <h3>${esc(AB.skills)}</h3>
      <p class="small">${esc(AB.skillsLine)}</p>
      <h3>${esc(AB.classes)}</h3>
      <p class="small">${esc(fill(AB.classesLine, { term }))}</p>
      <h3>${esc(AB.network)}</h3>
      <p class="small">${esc(AB.networkLine)}</p>
      <h3>${esc(AB.count)}</h3>
      <div class="about-facts">${fact(fmt(n.nOpen), AB.facts.open)}${fact(fmt(n.nCompanies), AB.facts.employers)}${fact(fmt(n.nRoles), AB.facts.roles)}${fact(nClasses == null ? "—" : fmt(nClasses), fill(AB.facts.classes, { term }))}</div>
      <p class="small">${esc(fill(AB.countLine, { date: niceDate(M.meta.generated), fortune: fmt(o.fortune), startups: fmt(o.startup), mba: fmt(o.mba) }))}</p>
      ${disc("about-top", esc(AB.topEmployers), `<p>${top(M.meta.companies, 15)}</p>`)}
      <h3>${esc(AB.howRead)}</h3>
      <p class="small">${esc(AB.howReadLine)}</p>
      <p class="small">${esc(AB.editorial)}</p>
      <h3>${esc(AB.privacy)}</h3>
      <p class="small">${esc(AB.privacyEvents)}</p>
      <p class="small">${esc(AB.privacyEmail)}</p>
      <h3>${esc(AB.product)}</h3>${productPart}</div>`, true);
    render();
    Atlas.product().then(P => { const G = P.G; productPart = `<p class="small">${esc(fill(AB.productLine, { n: fmt(G.meta.n_jobs), us: fmt(G.jobs.filter(j => j.country === M.meta.country).length), families: Object.keys(G.families).filter(f => G.jobs.some(j => j.family === f)).length, companies: fmt(G.meta.n_companies), date: niceDate(G.meta.generated) }))}</p>${disc("about-top-product", esc(AB.topCompanies), `<p>${top(G.meta.companies, 15)}</p>`)}`; if (location.hash.startsWith("#/about")) render(); }).catch(console.error);
    if (window.Catalog) Catalog.loadCatalog().then(d => { nClasses = d.classes.length; if (location.hash.startsWith("#/about")) render(); }).catch(() => { });
  }

  // the footer is the "About the data" link alone (owner's feedback 2026-11-01): the count and the refresh date it
  // carried live on #/about, from the same number as home and Find jobs

  route();
})();
