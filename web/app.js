/* Role atlas — the screens. Routes (hash): #/ the door (welcome, an email, what you study; everyone can skip) · #/home (the four verbs) ·
   #/jobs (Find jobs: one search over every open posting, v19 B4) · #/skills, #/network (the verbs; until v19 B5 lands they draw the closest screen that exists: see route()) · #/play/<game> ·
   #/you · #/explore · #/field/<group> · #/role/<role> · #/about · #/classes, #/professor/<slug>, #/signin (classes.js).
   Data comes from atlas.js; the side panel (owner's choice 8B) shows a skill or a posting. */
// The route: the hash read into the screen to show, its path parts and its query. Pure, no DOM; UMD like atlas.js,
// so node loads it alone (tests/web/routes.test.mjs): require("web/app.js").parseRoute.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.Routes = factory(); root.Stage = root.Routes.Stage; root.Apply = root.Routes.Apply; root.Door = root.Routes.Door; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const SCREENS = { "": "door", home: "home", jobs: "jobs", skills: "skills", network: "network", you: "you", explore: "explore", field: "field", role: "role", play: "play", about: "about", classes: "classes", professor: "professor", signin: "signin" };
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
  // explore or a game.
  const STAGES = ["looking", "targeting", "curious"];
  const Stage = {
    STAGES,
    // what the About you summary leads with
    youLead: stage => stage === "targeting" ? "role-search" : "answers",
    // the rail's blocks in order, for a person with answers (and, when `resume`, a resume read): sentences and actions;
    // ACTIONS says which keys are something to do. "drop" is the resume drop zone; "gaps-drop" the same drop offered to
    // see the gaps; "gaps" the gap rows; "practise" a game; the rest the rail's standing links
    railBlocks: (stage, resume) => resume ? ["band", "line", "gaps", "fit-link", "practise", "course", "event", "classes"]
      : stage === "curious" ? ["facts", "practise", "course", "event", "classes"]
      : stage === "targeting" ? ["ask", "gaps-drop", "facts", "practise", "course", "event", "classes"]
      : ["facts", "ask", "drop", "practise", "course", "event", "classes"],
    ACTIONS: new Set(["drop", "gaps-drop", "gaps", "fit-link", "practise", "course", "event", "classes", "role-search", "explore", "fields"]),
    // the first action a screen offers for a stage: "you" is About you, anything else the rail
    firstAction(stage, screen, resume) {
      if (screen === "you") return this.youLead(stage) === "role-search" ? "role-search" : resume || stage === "curious" ? "fields" : "drop";   // curious: the fields and Explore, no resume asked
      return this.railBlocks(stage, resume).find(k => this.ACTIONS.has(k)) || null;
    },
    // the first call to action a screen ends in, for a stage: the cohort application box, the same for every stage and
    // every screen by the owner's decision of 2026-10-26 (v18, step 1); its heading, so the eval can read what it says
    cta: (stage, screen) => Apply.heading,
  };
  // The cohort application box (v18, step 1): the one call to action the start screen, the rail, the fit screen and the
  // class picker end in, in place of the waitlist. The copy is the owner's, exactly; the price is never here. Pure, so
  // evals/stage.mjs can check that what every stage sees begins "Cohort 1".
  const Apply = {
    heading: "Cohort 1: ship two projects aimed at the role you want",
    line: "Five Cornell Tech and IE New York students. Six weeks, a session a week, paid. You leave with two or three shipped projects pointed at your target role and the people who should see them. Applications close Nov 14.",
    noteLabel: "The role you want, in your words",
    button: "Apply",
    done: "Applied. Wally replies within two days.",
    privacy: "Nothing you upload leaves your browser. If you apply we keep your email, the sentence you typed and the role you were looking at, nothing else.",
    // the one data-built line over the picker's box, when a role is chosen and the person's fit leaves gaps
    gapsLine: label => `These are your gaps for ${label}. Cohort 1 closes gaps like these with real projects.`,
    // where a click can come from (the same list as web/capture.js SOURCES): the rail's three placeholders, the fit
    // screen's foot, the class picker's foot; "start" was the start screen's box, gone with v19 B2, kept so the list
    // matches the database check
    SOURCES: ["show", "build", "ways", "fit", "start", "classes"],
  };
  // The door (#/) and home (#/home), v19 B2. The door is a welcome screen, not a gate: everyone can skip it, and the
  // email is capture and routing, never a credential (nothing behind it is private, no screen says "sign in"). Pure:
  // every string on the two screens is here so tests/web/door.test.mjs and the copy pass (B6) read them from one place,
  // and the four functions touch no DOM and no storage. The screens store the answers (door.email, door.where,
  // door.seen) in localStorage; the email never goes in the URL, and nothing is sent anywhere (B7 adds the form).
  const Door = {
    COPY: {
      heading: "Welcome to GradBuddy.",
      intro: ["GradBuddy helps grad students find the right jobs, build the skills those jobs ask for, and meet the right people.", "We have spent the past few weeks on a few of those pieces. They are ready to share."],
      // {roles} is the role count from the index, rounded down to a multiple of 10 (Door.inside)
      inside: "Inside: jobs for grad students, over {roles} roles, Spring 2027 classes at Cornell Tech, and who to meet on campus.",
      email: "Your email", emailPlaceholder: "user@school.edu",
      where: "What are you studying?", pick: "Pick one",
      cornell: "Some parts are for Cornell students. A Cornell address opens them.",
      button: "Continue", skip: "Skip for now",
      privacy: "We keep your email to send you what we build. Nothing you upload later leaves your browser.",
      home: "What do you want to do?",
      more: "More about you",
      // the grayed Find classes card: the line, then a link to the door in the middle of the second sentence
      closed: "For Cornell students for now.", closedLink: "Enter a Cornell address", closedAfter: "to open it.",
      bar: { jobs: "Find jobs", skills: "Explore roles", classes: "Find classes", network: "Networking" },   // the top bar's short labels
    },
    // a Cornell NetID address and nothing else (owner's decision 2, 2026-10-29): two or three letters then one to four
    // digits at cornell.edu, any case, spaces around it ignored. john.smith@cornell.edu, an alumni address and a
    // gmail address are kept like any other email but open nothing.
    opens: email => /^[a-z]{2,3}[0-9]{1,4}@cornell\.edu$/i.test(String(email || "").trim()),
    // the route after the door: the deep link the person arrived on, unless that is the door itself
    next: target => { const t = String(target || ""); return t && parseRoute(t).name !== "door" ? t : "#/home"; },
    // a deep link goes to the door first, once: any route but the door while door.seen is not set
    bounce: (hash, seen) => !seen && parseRoute(hash).name !== "door",
    // a count in words, rounded down so the sentence stays true until the next refresh: 25,950 -> "25 thousand",
    // 1,502 -> "1,500", 54 -> "50"
    thousands: n => n >= 1000 ? `${Math.floor(n / 1000)} thousand` : Door.hundreds(n),
    hundreds: n => (Math.floor(n / 100) * 100).toLocaleString("en-US"),
    tens: n => String(Math.floor(n / 10) * 10),
    inside: nRoles => Door.COPY.inside.replace("{roles}", Door.tens(nRoles)),
    // the four home cards in order, with the line each one builds from the counts ({ nOpen, nCompanies, nRoles }: open
    // US postings of both role sets, the employers behind them, the roles in the index); Find classes is closed unless
    // the email opens it
    verbs(email, counts) {
      const c = counts || {};
      return [
        { key: "jobs", href: "#/jobs", title: "Find jobs", line: `Search over ${Door.thousands(c.nOpen || 0)} open jobs in popular fields for grad students, from over ${Door.hundreds(c.nCompanies || 0)} companies.`, open: true },
        { key: "skills", href: "#/skills", title: "Explore roles & build skills", line: `Explore over ${Door.tens(c.nRoles || 0)} roles and see how your experience and skills match up.`, open: true },
        { key: "classes", href: "#/classes", title: "Find classes", line: "Pick Spring 2027 classes at Cornell Tech that build the skills your roles ask for.", open: Door.opens(email) },
        { key: "network", href: "#/network", title: "Networking", line: "Meet the faculty on campus whose classes build what your roles ask for.", open: true },
      ];
    },
  };
  return { parseRoute, Stage, Apply, Door };
});
(function () {
  "use strict";
  if (typeof document === "undefined") return;   // node loads this file for parseRoute alone
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = v => Math.round(v * 100) + "%";
  const fmt = n => Number(n).toLocaleString();
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
  const join = xs => xs.length > 1 ? xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1] : xs[0] || "";
  const cap = t => t.replace(/^./, c => c.toUpperCase()), low = t => t.replace(/^./, c => c.toLowerCase());
  const inWords = v => v >= 0.9 ? "nearly every posting" : v >= 0.66 ? "about 2 in 3 postings" : v >= 0.45 ? "about half of postings" : v >= 0.3 ? "about 1 in 3 postings" : v >= 0.2 ? "about 1 in 4 postings" : v >= 0.12 ? "about 1 in 7 postings" : "fewer than 1 in 8 postings";
  const EV_GROUPS = [["early", "Entry and mid-level"], ["senior", "Senior"], ["staff", "Lead / principal"], ["lead", "Director and up"]];
  const LADDER_KEYS = [["associate", "Entry"], ["mid", "Mid-level"], ["senior", "Senior"], ["lead", "Lead"]];
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
    return esc(b.text) + (title ? ` <span class="small muted">Source: ${src}${b.grounding === "input only" ? " (names the input, not the method)" : ""}.</span>` : "");
  }

  // ---------- theme: the device decides unless the person overrides ----------
  const THEMES = ["system", "dark", "light"], GLYPH = { system: "◐", dark: "●", light: "○" };
  let theme = "system"; try { theme = localStorage.getItem("theme") || "system"; } catch { }
  function applyTheme(t) { theme = THEMES.includes(t) ? t : "system"; if (theme === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; const b = $("#theme"); b.textContent = GLYPH[theme]; b.title = theme === "system" ? "Theme follows your device. Click to change." : `Theme: ${theme}. Click to change.`; }
  applyTheme(theme);
  $("#theme").onclick = () => { applyTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]); try { localStorage.setItem("theme", theme); } catch { } };

  // ---------- shell helpers ----------
  const main = $("#main"), aside = $("#aside"), shell = $("#shell");
  function crumbs(items) { $("#crumbs").innerHTML = items.map((it, i) => (i ? '<span class="sep">/</span>' : "") + (it[1] ? `<a href="${esc(it[1])}">${esc(it[0])}</a>` : `<span class="here">${esc(it[0])}</span>`)).join(""); document.title = (items.length ? items[items.length - 1][0] + " · " : "") + "Role atlas · GradBuddy"; }
  // The side column has two modes. Elsewhere it is an overlay that opens on a selection (owner's choice 8B). On a
  // role screen it is the rail (owner's decision 2026-10-24): always there, holding the legend, the person's fit and
  // the things to do with the role; a skill or posting card draws over it with "← Back". Under the breakpoint in
  // style.css the rail collapses to an edge tab and opens as the overlay.
  let railBase = null;   // a function that draws the rail's own content, so a toggle inside it redraws from the current state
  const railTab = document.createElement("button"); railTab.type = "button"; railTab.className = "rail-tab"; railTab.textContent = "Your fit"; railTab.setAttribute("aria-label", "Open the side panel"); railTab.onclick = () => shell.classList.toggle("rail-open"); shell.appendChild(railTab);
  function showRail(base) { railBase = base; shell.classList.add("with-rail"); aside.classList.add("rail"); }
  function leaveRail() { railBase = null; shell.classList.remove("with-rail", "rail-open"); aside.classList.remove("rail"); }
  function showAside(html) {
    if (html == null) { if (railBase) { const y = aside.hidden ? 0 : aside.scrollTop; aside.hidden = false; aside.innerHTML = railBase(); aside.scrollTop = y; wireRail(); return; } aside.hidden = true; shell.classList.remove("with-aside"); aside.innerHTML = ""; return; }
    aside.hidden = false; if (!railBase) shell.classList.add("with-aside"); aside.innerHTML = html; aside.scrollTop = 0;
  }
  function page(html, narrow) { main.innerHTML = `<div class="page${narrow ? " narrow" : ""}">${html}</div>`; window.scrollTo(0, 0); }
  function fail(e) { console.error(e); page(`<h1>Something did not load</h1><p class="lead">${esc(e.message)}. Reload the page; if it happens again, the data files may be missing.</p>`, true); showAside(null); }

  // ---------- tooltips (owner's choices X1 and X2, 2026-10-19) ----------
  // One box for the whole app. An ⓘ (`tip(text)`, a button with data-tip) opens it on click and never on hover;
  // Escape, a second click or a click elsewhere closes it. A visual measure (a bar, a mark: any element with
  // data-measure) explains what it shows and what that means while the pointer is over it.
  const tipBox = document.createElement("div"); tipBox.className = "tipbox"; tipBox.setAttribute("role", "tooltip"); tipBox.hidden = true; document.body.appendChild(tipBox);
  let tipFor = null, tipPinned = false;
  const tip = text => `<button type="button" class="tip" aria-label="What this means" aria-expanded="false" data-tip="${esc(text)}">i</button>`;
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
  // what the person told us and the resume they dropped stay in this browser only (nothing is uploaded)
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  state.you = store.get("you"); state.resume = store.get("resume");
  // Funnel counts (web/capture.js): an event name, the session id, the stage and the program group, a role or field id.
  // Never text, a skill id or a file name. Everything is a no-op when CONFIG.CAPTURE_ENABLED is off.
  const track = (name, ctx) => { if (window.Capture) Capture.event(name, { stage: (state.you || {}).stage, program: (state.you || {}).where, ...(ctx || {}) }); };
  const waitCtx = () => ({ role_id: state.roleId, stage: (state.you || {}).stage, program: (state.you || {}).where, fields: (state.you || {}).fields || [] });
  // a posting link (decision 8 of the pass: visible on the fit screen and the rail's gap rows for a person with a resume)
  document.addEventListener("click", e => { const a = e.target.closest("[data-posting]"); if (a) track("posting_link", { role_id: a.dataset.posting }); });
  const LEVEL_OPT = { entry: "associate", mid: "mid", senior: "senior", lead: "lead" };
  // what the Spring 2027 screens (classes.js) draw with; gapsFor hands them the person's gaps for a role (step 3 of the
  // demand-gen pass): the fit on screen when it is this role's, else the matcher at the default level, cached per role;
  // applyBox, applyLine and wireApply draw the application box at the picker's foot (v18, step 1); resumeForm, wireResume,
  // takeResume and hasResume let the picker hold the shell's resume form when none is on file (v19 B3, C1)
  const shellCtx = { crumbs, page, showAside, gapsFor: roleId => gapsFor(roleId), applyBox: (what, opts) => applyBox(what, opts), applyLine: label => Apply.gapsLine(label), wireApply: (el, redraw) => wireWait(el, redraw), resumeForm: () => resumeForm(), wireResume: () => wireResumeForm(), takeResume: () => takeResume(), hasResume: () => !!state.resume };
  // what the door kept, in this browser only: the email, the program group, and that the door was seen once
  const doorKept = () => { try { return { email: localStorage.getItem("door.email") || "", where: localStorage.getItem("door.where") || "", seen: localStorage.getItem("door.seen") === "1" }; } catch { return { email: "", where: "", seen: false }; } };
  // The four verbs in the top bar (v19 B2), drawn on every route: the current one marked, Find classes only when the
  // email on file opens it (Door.opens). The brand goes home. A screen the verbs will absorb (Explore, a field, a role,
  // its fit and course screens) marks Explore roles; an event screen marks Networking; the classes screens Find classes.
  const VERB_OF = { jobs: "jobs", skills: "skills", explore: "skills", field: "skills", role: "skills", fit: "skills", course: "skills", play: "skills", network: "network", event: "network", classes: "classes", professor: "classes" };
  function topBar(name) {
    const el = $("#verbs"); if (!el) return;
    const on = VERB_OF[name] || null;
    el.innerHTML = Door.verbs(doorKept().email, {}).filter(v => v.open).map(v => `<a class="toplink${on === v.key ? " on" : ""}" href="${esc(v.href)}"${on === v.key ? ' aria-current="page"' : ""}>${esc(Door.COPY.bar[v.key] || v.title)}</a>`).join("");
  }
  function route() {
    const parsed = Routes.parseRoute(location.hash);
    // a deep link bounces to the door once (v19 B2): the hash stays, the door draws over it, and Continue or Skip
    // (Door.next) lands on the hash
    const name = Door.bounce(location.hash, doorKept().seen) ? "door" : parsed.name, { id, slug } = parsed.params;
    // #/jobs, #/skills and #/network exist so the hrefs never change; #/jobs is Find jobs (B4); until B5 lands,
    // #/skills draws Explore (the fields, then a field's roles: the closest thing to "pick a role" today) and
    // #/network the event screen of the field that fits the person best, else the biggest field
    const go = { door, home, jobs: jobsScreen, skills: explore, network, you, explore, field: () => field(id), event: () => eventScreen(id), role: () => roleScreen(id), fit: () => fitScreen(id), course: () => courseScreen(id), play: () => play(slug), about, classes: () => ClassScreens.classes(shellCtx), professor: () => ClassScreens.professor(slug, shellCtx), signin: () => ClassScreens.signin(shellCtx) }[name];
    SkillMap.leave(); leaveRail(); topBar(name);
    const ev = { door: ["start"], explore: ["explore"], field: ["field", { field_id: id }], event: ["event_prep", { field_id: id }], role: ["role", { role_id: id }], classes: ["classes"], play: ["play", { role_id: slug }] }[name];
    if (ev) track(ev[0], ev[1]);
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
  // the home counts: the open US postings of both role sets and the employers behind them, from data/jobs_meta.json
  // (the counts pipeline.jobs_open writes beside the Find jobs file, 224 bytes; B4), else the MBA index's own meta
  // when that file is missing; and the roles. "Over" keeps the sentence true between refreshes.
  let jobsMetaP = null;
  const jobsMeta = () => jobsMetaP ||= Atlas.fetchJson("data/jobs_meta.json").catch(() => null);
  function homeCounts(ix, jm) {
    const ok = jm && jm.n_open > 0 && jm.n_companies > 0;
    return { nOpen: ok ? jm.n_open : ix.M.meta.n_open, nCompanies: ok ? jm.n_companies : ix.M.meta.n_companies, nRoles: roleCount(ix) };
  }
  // The door: what GradBuddy is, what is inside, an email and the program question, Continue, Skip for now. Both
  // buttons keep what was typed in this browser (door.email, door.where, door.seen) and go where the person was headed
  // (Door.next); a program answer also fills About you's first question. Nothing is sent anywhere (B7 adds the form).
  async function door() {
    crumbs([]); showAside(null);
    const ix = await Atlas.index(), kept = doorKept();
    const C = Door.COPY;
    page(`<section class="door">
        <h1>${esc(C.heading)}</h1>
        ${C.intro.map(t => `<p class="lead">${esc(t)}</p>`).join("")}
        <p class="lead">${esc(Door.inside(roleCount(ix)))}</p>
        <form class="door-form" id="door-form" novalidate="">
          <label class="dlabel">${esc(C.email)}<input type="email" name="email" placeholder="${esc(C.emailPlaceholder)}" autocomplete="email" value="${esc(kept.email)}"></label>
          <label class="dlabel">${esc(C.where)}<select name="where"><option value="">${esc(C.pick)}</option>${Q[0].options.map(([id, label]) => `<option value="${esc(id)}"${kept.where === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
          <p class="small muted" style="margin:0">${esc(C.cornell)}</p>
          <p class="door-acts"><button type="submit" class="btn primary">${esc(C.button)}</button><a class="door-skip" href="${esc(Door.next(location.hash))}" id="door-skip">${esc(C.skip)}</a></p>
        </form>
        <p class="small muted door-privacy">${esc(C.privacy)}</p>
      </section>`, true);
    const form = $("#door-form");
    const keep = () => {
      const email = form.email.value.trim(), where = form.where.value;
      try { localStorage.setItem("door.email", email); localStorage.setItem("door.where", where); localStorage.setItem("door.seen", "1"); } catch { }
      if (where && WHERE[where]) { state.you = { fields: [], stage: null, ...(state.you || {}), where }; store.set("you", state.you); wiz = null; }
    };
    const go = () => { const next = Door.next(location.hash); if (location.hash === next) route(); else location.hash = next; };
    form.onsubmit = e => { e.preventDefault(); const em = form.email; if (em.value.trim() && !em.checkValidity()) { em.reportValidity(); return; } keep(); go(); };
    $("#door-skip").onclick = e => { e.preventDefault(); keep(); go(); };
  }
  // Home: the four verbs as a 2×2 grid, one data-built line each; Find classes grayed until a Cornell address opens
  // it. The stage question is not here (v19, decision 8: About you, step 2).
  async function home() {
    crumbs([]); showAside(null);
    const [ix, jm] = await Promise.all([Atlas.index(), jobsMeta()]);
    const C = Door.COPY;
    const render = () => {
      const cards = Door.verbs(doorKept().email, homeCounts(ix, jm)).map(v => v.open
        ? `<a class="verb" href="${esc(v.href)}" data-verb="${esc(v.key)}"><span class="t">${esc(v.title)}</span><span class="d">${esc(v.line)}</span></a>`
        : `<div class="verb closed" aria-disabled="true" data-verb="${esc(v.key)}"><span class="t">${esc(v.title)}</span><span class="d">${esc(v.line)}</span><span class="gate">${esc(C.closed)} <a href="#/">${esc(C.closedLink)}</a> ${esc(C.closedAfter)}</span></div>`);
      page(`<h1>${esc(C.home)}</h1><div class="verbs">${cards.join("")}</div><p class="home-more"><a href="#/you">${esc(C.more)} →</a></p>`);
    };
    render();
  }
  // #/network until B5: the event screen of the field the person's answers and resume point to, else the biggest field
  async function network() {
    const ix = await Atlas.index();
    const ff = (state.you || state.resume) ? await fitFields() : null;
    const first = ff && [...ff.fields][0];
    const biggest = ix.groups.filter(g => g.nOpen != null).sort((a, b) => b.nOpen - a.nOpen)[0];
    return eventScreen(first || (biggest && biggest.id));
  }
  // a game: its own screen once built; until then, what it will be. A built game is web/games/<slug>.js, loaded
  // by index.html, which registers window.Games[slug] = { mount(el, ctx) } (contract in games/README.md)
  window.Games = window.Games || {};
  async function play(slug) {
    const gm = (await games()).find(g => g.slug === slug);
    if (!gm) return home();
    crumbs([["Home", "#/home"], [gm.title, null]]); showAside(null);
    const G = window.Games[slug];
    if (gm.status === "live" && G && G.mount) { main.innerHTML = ""; window.scrollTo(0, 0); return G.mount(main, { Atlas, game: gm, showAside, crumbs, esc }); }
    page(`<p class="eyebrow">Coming soon</p><h1>${esc(gm.title)}</h1><p class="lead">${esc(gm.tagline)}.</p>
      <div class="cover big"><img src="${esc(gm.cover)}" alt="${esc(gm.title)}, an early design" onerror="this.remove()"><span class="ph-t">${esc(gm.title)}</span></div>
      <div class="row" style="margin-top:16px"><a class="btn" href="#/home">← Home</a><a class="btn quiet" href="#/explore">Explore the roles</a></div>`, true);
  }
  // ---------- 2. tell us about you: three questions and an optional resume, then a summary of what we know (Y3) ----------
  // Owner's decisions (2026-10-24): the program options are the ones Cornell Tech and IE New York offer, folded to the
  // five groups the postings can say something about (the beachhead: no law, PhD or undergrad for now, no "working");
  // the second question is the person's stage in the search, which decides what the role page's rail leads with
  // (the earlier "what are you looking for" question, owner's choice Y2, changed nothing on screen; this one does).
  const Q = [
    { key: "where", title: "What are you studying?", options: [["business", "Business, management or finance", "MBA, Tech MBA, Master in Management, Master in Finance"], ["analytics", "Analytics or data science", "MSBA, Business Analytics & AI, Data Science & Decision Analytics, ORIE"], ["cs", "Computer science or software", "MEng CS, software engineering"], ["ece", "Electrical, hardware or systems", "MEng ECE, robotics, embedded"], ["infosci", "Information science, design or health/urban tech", "Connective Media, Health Tech, Urban Tech, MS Design Technology"]] },
    { key: "stage", title: "Where are you in your search?", options: [["looking", "I'm open to roles that fit me", "Show me what I have a shot at"], ["targeting", "I know the role I want", "Show me which of its skills I have and how to fill the gaps"], ["curious", "I just want to explore the jobs and skills data", "No resume needed"]] },
    { key: "fields", title: "Which fields interest you?", multi: true, hint: "Pick as many as you like, or none." },
  ];
  const WHERE = Object.fromEntries(Q[0].options.map(o => [o[0], o[1]])), WHERE_SHORT = { business: "Business", analytics: "Analytics", cs: "CS", ece: "ECE", infosci: "Info science" };
  const STAGE = Object.fromEntries(Q[1].options.map(o => [o[0], o[1]])), STAGE_SHORT = { looking: "open to roles that fit", targeting: "knows the role", curious: "exploring the data" };
  // the programs an engineering student is in open the technical area first on a role screen
  const TECHNICAL_PROGRAMS = ["cs", "ece", "infosci"];
  let wiz = null;
  // "#/you" is the summary once anything is known; "#/you?step=N" opens the wizard at one question to change it
  async function you() {
    const ix = await Atlas.index();
    if (!ix.roles[Atlas.productKey("pm")]) Atlas.product().then(() => { if (wiz && location.hash.startsWith("#/you")) you(); }).catch(() => { });   // the product field's example roles
    crumbs([["About you", null]]); showAside(null);
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
      const nav = (nextLabel, nextAction) => `<div class="row between" style="margin-top:16px"><button type="button" class="btn quiet" id="back">← Back</button><span class="row">${i === Q.length ? `<a class="btn" href="${after}" id="skip">Skip for now</a>` : ""}<button type="button" class="btn primary" id="next">${nextLabel}</button></span></div>`;
      if (i < Q.length) {
        const q = Q[i];
        // the fields carry two example roles each (owner's choice Y1), so a name like "Operations & general
        // management" says what is inside; all eleven sit above the fold in two columns
        const examples = g => { const names = g.roles.map(r => (ix.roles[r] || {}).label).filter(Boolean).slice(0, 2); return names.length ? names.join(" · ") : g.id === "product" ? "Product manager · Product marketing" : ""; };
        const opts = q.multi ? ix.groups.map(g => [g.id, g.label, examples(g)]) : q.options.map(([id, label, ex]) => [id, label, ex || ""]);
        const on = id => q.multi ? wiz.answers.fields.has(id) : wiz.answers[q.key] === id;
        page(`${steps}<p class="eyebrow">Question ${i + 1} of ${Q.length}</p><h1>${esc(q.title)}</h1>${q.hint ? `<p class="lead">${esc(q.hint)}</p>` : ""}
          <div class="opts${q.multi ? " two" : ""}">${opts.map(([id, label, ex]) => `<button type="button" class="opt${on(id) ? " on" : ""}" data-opt="${esc(id)}" aria-pressed="${on(id)}">${esc(label)}${ex ? `<small>${esc(ex)}</small>` : ""}</button>`).join("")}</div>${nav("Next →")}`, true);
        if (q.multi) main.firstElementChild.classList.add("roomy");   // two columns of cards need more than the narrow column
        main.querySelectorAll("[data-opt]").forEach(b => b.onclick = () => { const id = b.dataset.opt; if (q.multi) { wiz.answers.fields.has(id) ? wiz.answers.fields.delete(id) : wiz.answers.fields.add(id); render(); } else { wiz.answers[q.key] = id; forward(); render(); } });
        $("#next").onclick = () => { if (!q.multi && !wiz.answers[q.key]) return; forward(); render(); };
        $("#back").onclick = () => { if (i === 0) { const b = wiz.back; wiz = null; location.hash = b ? "#/you" : "#/home"; } else { backward(); render(); } };
        return;
      }
      page(`${steps}<p class="eyebrow">Last step, optional</p><h1>Add your resume</h1>
        <p class="lead">We read it in your browser to find the roles that fit what you have done. Nothing is uploaded.</p>
        ${resumeForm()}${nav("Show my roles →")}`, true);
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
    const answers = `<div class="list">${row("What you study", y.where ? esc(WHERE[y.where]) : "Not answered", ["edit", "#/you?step=0"])}${row("Where you are in your search", y.stage ? esc(STAGE[y.stage]) : "Not answered", ["edit", "#/you?step=1"])}${row("Fields you picked", chosen.length ? esc(chosen.join(", ")) : "None yet; your resume decides", ["edit", "#/you?step=2"])}</div>`;
    const closest = rg ? Object.entries(rg.scores).filter(([id, v]) => v > 0 && ix.roles[id]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => `<a href="#/role/${esc(id)}">${esc(ix.roles[id].label)}</a>`) : [];
    const resume = r ? `<div class="list">${row(esc(r.name), `${fmt(r.words)} words, read in your browser; nothing is uploaded`, ["replace", "#/you?step=3"])}${row("Your closest matches", closest.length ? closest.join(" · ") : "No role yet", null)}</div>` : `<p class="small muted" style="margin-top:8px">No resume yet. <a class="link" href="#/you?step=3">Add one</a> and we point you to the fields it fits.</p>`;
    const fieldRows = [...fields].map(id => ix.groups.find(g => g.id === id)).filter(Boolean).sort((a, b) => (b.nOpen || 0) - (a.nOpen || 0)).map(g => row(esc(g.label), esc(why.get(g.id)), ["open →", "#/field/" + g.id]));
    // a person who knows the role (stage targeting) gets the role first (v16 step 2): a search over every role's label,
    // and the three roles closest to the resume once one is read
    const lead = Stage.youLead(y.stage);
    const roleOpts = Object.values(ix.roles).map(r => ({ id: r.id, label: r.label, group: (ix.groups.find(g => g.id === r.group) || {}).label || r.group }));
    const dup = new Set(roleOpts.map(r => r.label).filter((l, i, a) => a.indexOf(l) !== i));
    for (const r of roleOpts) r.name = dup.has(r.label) ? `${r.label} · ${r.group}` : r.label;
    const roleSearch = lead === "role-search" ? `<h2>Open the role you want</h2><div class="role-search"><input type="search" id="role-q" list="role-names" placeholder="Type a role: FP&A, product manager, consultant…" aria-label="Find a role" autocomplete="off"><datalist id="role-names">${roleOpts.map(r => `<option value="${esc(r.name)}">`).join("")}</datalist><button type="button" class="btn primary" id="role-go">Open →</button></div><p class="small muted" id="role-hint">${closest.length ? `Closest to your resume: ${closest.join(" · ")}` : `${roleOpts.length} roles in ${ix.groups.length} fields. Add a resume and the three closest appear here.`}</p>` : "";
    // what the games recorded, role by role (PLAN.md v12, decision 4)
    const GS = window.GameShell, roles = GS ? Object.entries(GS.record.read().roles) : [];
    let P = null; if (roles.some(([id]) => (ix.roles[id] || {}).set === "product" || id.startsWith("product."))) P = await Atlas.product().catch(() => null);
    const knowRows = roles.filter(([id]) => ix.roles[id]).map(([id, r]) => { const k = GS.record.summary(GS.record.read(), id, GS.record.asksOf(ix, P, id)); const parts = [k.total ? `${k.known.length} of ${k.total} asks known` : null, k.ladders.length ? `${k.ladders.length} ${k.ladders.length === 1 ? "level ladder" : "level ladders"} sorted` : null, k.postings ? `${k.postings} ${k.postings === 1 ? "posting" : "postings"} read` : null, k.demand ? `${k.demand} demand ${k.demand === 1 ? "pair" : "pairs"} seen` : null].filter(Boolean); return { id, label: ix.roles[id].label, n: k.known.length, line: parts.join(" · ") || "played", updated: r.updated || "" }; }).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).map(x => row(esc(x.label), esc(x.line), ["open", "#/role/" + x.id]));
    page(`<h1>About you</h1><p class="lead">What you told us and what your resume shows. Change any answer; the fields below follow.</p>${roleSearch}
      <div class="two"><div><h2>Your answers</h2>${answers}</div><div><h2>Your resume</h2>${resume}</div></div>
      <h2>Fields that fit you, and why</h2>${fieldRows.length ? `<div class="list">${fieldRows.join("")}</div>` : '<p class="small muted">Pick a field or add a resume and they appear here.</p>'}
      ${knowRows.length ? `<h2>What you know, from the games</h2><p class="small muted">What the games recorded in this browser, role by role: the asks you got right, the level ladders you sorted, the postings you read, the demand pairs you saw.</p><div class="list you-know">${knowRows.join("")}</div>` : ""}
      <div class="row" style="margin-top:20px"><a class="btn primary" href="#/explore">Explore your fields →</a><button type="button" class="btn quiet" id="start-over">Start over</button></div>`);
    $("#start-over").onclick = () => { state.you = null; state.resume = null; state.rough = null; state.match = null; state.fit = null; store.set("you", null); store.set("resume", null); wiz = null; you(); };
    const rq = $("#role-q");
    if (rq) {
      const find = v => { const t = v.trim().toLowerCase(); if (!t) return null; return roleOpts.find(r => r.name.toLowerCase() === t) || roleOpts.find(r => r.label.toLowerCase() === t) || roleOpts.filter(r => r.name.toLowerCase().includes(t)).sort((a, b) => a.name.length - b.name.length)[0] || null; };
      const go = () => { const r = find(rq.value); if (r) location.hash = "#/role/" + r.id; else $("#role-hint").textContent = "No role by that name. Try a word of it, or pick from the list."; };
      rq.onchange = () => { if (roleOpts.some(r => r.name === rq.value)) go(); };
      rq.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); go(); } };
      $("#role-go").onclick = go;
    }
  }
  // one line on Explore that says what we know and why each field is there (owner's choices Y3 A and E3)
  function profileStrip(ix, why) {
    const y = state.you || {}, label = id => (ix.groups.find(g => g.id === id) || {}).label || id;
    const chosen = [...why].filter(([, w]) => w === "You picked it").map(([id]) => label(id));
    const fromResume = [...why].filter(([, w]) => w !== "You picked it").map(([id]) => label(id));
    const parts = [y.where ? esc(WHERE_SHORT[y.where] || WHERE[y.where]) : null, y.stage ? esc(STAGE_SHORT[y.stage] || STAGE[y.stage]) : null, chosen.length ? `<b>${esc(join(chosen))}</b> chosen` : null, fromResume.length ? `<b>${esc(join(fromResume))}</b> from your resume` : state.resume ? "no field from your resume yet" : "no resume yet"].filter(Boolean);
    return `<div class="strip"><span class="dotg"></span><span>${parts.join(" · ")}</span><a href="#/you">Edit</a></div>`;
  }
  // the resume: a drop zone, a paste box, what was read
  let pending = null;   // { text, name, words } read from a file but not yet taken
  function resumeForm() {
    const r = state.resume;
    return `<div class="drop" id="drop"><p><b>Drop a PDF, DOCX or TXT here</b> or <label class="link" for="file">choose a file</label></p><input type="file" id="file" accept=".pdf,.docx,.txt,.md" hidden><p class="small muted" id="file-status">${r ? `Using ${esc(r.name)} (${fmt(r.words)} words read). <button type="button" class="linkish link" id="forget">Forget it</button>` : ""}</p></div>
      <p class="small muted">Or paste the text of your resume:</p><textarea id="paste" rows="6" aria-label="Resume text" placeholder="Product Management Intern, FinServ Startup (Summer 2026)&#10;- Conducted 15 user interviews…"></textarea>`;
  }
  function wireResumeForm() {
    const drop = $("#drop"), status = $("#file-status");
    const read = async file => {
      status.textContent = `Reading ${file.name}…`;
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
        status.textContent = words < 40 ? `${file.name}: only ${words} words could be read. If this is a scan, paste the text of your resume instead.` : `${file.name}: ${fmt(words)} words read.`;
      } catch (e) { status.textContent = "Could not read that file: " + e.message; pending = null; }
    };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) read(e.dataTransfer.files[0]); };
    $("#file").onchange = e => { if (e.target.files[0]) read(e.target.files[0]); };
    const forget = $("#forget"); if (forget) forget.onclick = () => { state.resume = null; state.rough = null; state.match = null; state.fit = null; store.set("resume", null); status.textContent = "Forgotten."; };
  }
  // keep what the form holds: a pasted text wins over a dropped file; nothing new keeps what was stored
  async function takeResume() {
    const pasted = ($("#paste") || {}).value || "";
    const r = pasted.trim().length >= 40 ? { text: pasted, name: "pasted text", words: pasted.trim().split(/\s+/).length } : pending && pending.words >= 40 ? pending : null;
    if (!r) return false;
    state.resume = r; store.set("resume", r); pending = null; state.match = null; state.rough = null; state.fit = null;
    track("resume_read");
    await rough();
    return true;
  }
  async function rough() { if (state.resume && !state.rough) state.rough = await Atlas.roughFit(state.resume.text); return state.rough; }
  // the fields that fit, each with its reason: the ones chosen, then those of the roles held and of the five roles
  // the resume reads closest to
  async function fitFields() {
    const ix = await Atlas.index(); const why = new Map();
    for (const id of (state.you || {}).fields || []) if (ix.groups.some(g => g.id === id)) why.set(id, "You picked it");
    const rg = await rough();
    if (rg) {
      for (const h of rg.held) if (ix.roles[h] && !why.has(ix.roles[h].group)) why.set(ix.roles[h].group, `You held ${ix.roles[h].label}`);
      for (const [id] of Object.entries(rg.scores).sort((a, b) => b[1] - a[1]).slice(0, 5)) if (ix.roles[id] && rg.scores[id] > 0 && !why.has(ix.roles[id].group)) why.set(ix.roles[id].group, `Your resume reads close to ${ix.roles[id].label}`);
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
  const groupLabel = g => g === "startup" ? "Startup" : g === "mba_employer" ? "MBA employer" : /^fortune(\d+)$/.test(String(g || "")) ? "Fortune " + RegExp.$1 : String(g || "");
  const KIND_ORDER = ["method", "technical", "knowledge", "tool", "practice", "behaviour", "credential"];
  const jobWho = r => r.intern ? "An internship" : r.entry === "mba" ? "A job for MBA graduates" : r.entry === "pre_mba" ? "A job for new graduates" : null;
  const labelIn = (pairs, id) => (pairs.find(([v]) => v === id) || [, id])[1];
  // the role chosen elsewhere, for the role filter when a person arrives with none set: the role screen's (state.R),
  // else the first the class picker keeps in this browser (classes.roles), the same id gapsFor is handed
  const chosenRole = () => state.roleId || (store.get("classes.roles") || [])[0] || null;
  async function jobsScreen() {
    crumbs([["Home", "#/home"], ["Find jobs", null]]); showAside(null);
    page(`<h1>Find jobs</h1><p class="lead">Loading postings…</p>`);
    let J;
    try { J = await jobsData(); } catch (e) { console.error(e); page(`<h1>Find jobs</h1><p class="lead">The postings did not load. Reload the page to try again.</p>`); return; }
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
      ? `Each posting counts the skills it asks for that your résumé shows. Fit sorts by that count. Change your résumé in <a href="#/you">About you</a>.`
      : `<a href="#/you">Add your résumé</a> and each posting says how many of its skills you show.`;
    const sortOptions = () => [...(have ? [["fit", "Fit"]] : []), ["best", "Best match"], ["company", "Company A–Z"]].map(([v, l]) => `<option value="${v}"${s.sort === v ? " selected" : ""}>${l}</option>`).join("");
    page(`<h1>Find jobs</h1>
      <p class="lead">Search ${fmt(rows.length)} open US postings at ${fmt(D.companies.length)} companies.</p>
      <form class="jsearch" id="jsearch" role="search"><input type="search" name="q" value="${esc(s.q)}" placeholder="Search a title, company or skill" aria-label="Search"><input type="search" name="loc" value="${esc(s.loc)}" placeholder="City, state or remote" aria-label="Location"><button type="submit" class="btn primary">Search</button></form>
      <div class="jobs-grid">
        <div class="jrail"><div class="facets" id="jrail"></div><p class="small muted jnote">${note}</p></div>
        <section class="jmain" aria-label="Postings"><div class="jhead"><p class="jcount" id="jcount"></p><label class="jsort">Sort <select id="jsort" aria-label="Sort">${sortOptions()}</select></label></div><div class="jlist" id="jlist"></div><div class="pager" id="jpager"></div></section>
      </div>`);
    const pageEl = main.querySelector(".page"); pageEl.classList.add("jobs-page");
    const form = $("#jsearch"), railEl = $("#jrail");
    // ---- the fit, the cards and the panel ----
    const fitOf = r => Jobs.fitOf(r, have, D.skill_ids);
    const tagOf = i => `<span class="tag${have && have.has(D.skill_ids[i]) ? " good" : ""}">${esc(skillName(i))}</span>`;
    const chips = r => {
      const ids = r.skills, N = 6, sorted = have ? [...ids].sort((a, b) => (have.has(D.skill_ids[b]) ? 1 : 0) - (have.has(D.skill_ids[a]) ? 1 : 0)) : ids;
      return `<div class="tags jtags">${sorted.slice(0, N).map(tagOf).join("")}${ids.length > N ? `<span class="tag thin">+${ids.length - N} more</span>` : ""}</div>`;
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
      const facts = [roleLabel(r.role), Jobs.levelLabel(r), r.location, r.remote ? "remote" : null, r.sponsorship === "yes" ? "says it sponsors a visa" : null].filter(Boolean);
      const byKind = {}; for (const i of r.skills) { const sk = ix.skillById[D.skill_ids[i]]; (byKind[sk && KIND_ORDER.includes(sk.kind) ? sk.kind : "other"] ||= []).push(i); }
      const kinds = [...KIND_ORDER, "other"].filter(k => byKind[k]).map(k => `${k === "other" ? "" : `<p class="eyebrow kind">${esc(kindLabel(k))}</p>`}<div class="tags">${byKind[k].map(tagOf).join("")}</div>`).join("");
      return `<button type="button" class="close" aria-label="Close">×</button><div class="card jdetail">
        <p class="eyebrow">${esc(r.company)} · ${esc(groupLabel(r.group))}${r.sector ? " · " + esc(r.sector) : ""}</p><h2>${esc(r.title)}</h2>
        <p class="facts">${facts.map(esc).join(" · ")}</p>
        ${w ? `<p class="small jwho">${esc(w)}.</p>` : ""}
        ${fit ? `<p class="small">${esc(Jobs.fitLine(fit))}</p>` : `<p class="small muted"><a href="#/you">Add your résumé</a> and this line counts the skills you show.</p>`}
        <p class="jacts"><a class="btn primary" href="${esc(r.url)}" target="_blank" rel="noopener" data-posting="${esc(r.role)}">Open the posting at ${esc(r.company)} ↗</a></p>
        <h3>${plural(r.skills.length, "skill this posting asks for", "skills this posting asks for")}</h3>${kinds}
        ${n ? `<p class="small muted">${n === 1 ? "1 more posting" : `${fmt(n)} more postings`} with this title at ${esc(r.company)}${r.location ? ` in ${esc(r.location)}` : ""}. We show it once.</p>` : ""}
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
    const opened = { field: true, role: true, level: true, entry: true, group: false, company: false, work: true };
    railEl.addEventListener("toggle", e => { const d = e.target; if (d.dataset && d.dataset.group) opened[d.dataset.group] = d.open; }, true);
    const facetRow = (key, val, label, n, on) => {
      const dead = !on && !n;
      return `<button type="button" class="frow${on ? " on" : ""}${dead ? " dead" : ""}"${dead ? ' title="No posting matches this with the other filters on" aria-disabled="true"' : ` data-key="${key}" data-val="${esc(String(val))}"`} aria-pressed="${on}">${esc(label)}<span class="n">${fmt(n)}</span></button>`;
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
      const more = all.length > shown.length ? `<button type="button" class="frow more" data-more-companies="1">more…<span class="n">${fmt(all.length)}</span></button>` : "";
      const work = `<details data-group="work"${opened.work ? " open" : ""}><summary>Work</summary>${facetRow("remote", true, "Remote", count("remote", [[true]])[true], s.remote)}${facetRow("sponsor", true, "Says it sponsors a visa", count("sponsor", [[true]])[true], s.sponsor)}</details>`;
      return group("field", "Field", fields, count("field", fields)) + group("role", "Role", roles, count("role", roles)) + group("level", "Level", levels, count("level", levels))
        + group("entry", "Entry", Jobs.ENTRIES, count("entry", Jobs.ENTRIES)) + group("group", "Employer type", Jobs.EMPLOYERS, count("group", Jobs.EMPLOYERS))
        + group("company", "Company", shown.map(([n]) => [n, n]), cm, more) + work;
    };
    // ---- the empty state: each filter that is on, as a chip an × removes ----
    const activeChips = () => {
      const out = [];
      if (s.q.trim()) out.push(["q", `“${s.q.trim()}”`]); if (s.loc.trim()) out.push(["loc", `in ${s.loc.trim()}`]);
      if (s.field) out.push(["field", fieldLabel(s.field)]); if (s.role) out.push(["role", roleLabel(s.role)]);
      if (s.level) out.push(["level", labelIn(levelsOf(), s.level)]); if (s.entry) out.push(["entry", labelIn(Jobs.ENTRIES, s.entry)]);
      if (s.group) out.push(["group", labelIn(Jobs.EMPLOYERS, s.group)]); if (s.company) out.push(["company", s.company]);
      if (s.remote) out.push(["remote", "Remote"]); if (s.sponsor) out.push(["sponsor", "Says it sponsors a visa"]);
      return out;
    };
    const levelsOf = () => Jobs.LEVEL_WORDS.labels;
    const emptyState = () => `<div class="jempty"><p><b>No posting matches all of this.</b></p><p class="small muted">Remove one:</p><div class="chips">${activeChips().map(([k, l]) => `<button type="button" class="chip on" data-remove="${k}" aria-label="Remove ${esc(l)}">${esc(l)} <span class="n">×</span></button>`).join("")}</div></div>`;
    // ---- the draw: search, filter, dedupe, sort, page ----
    const draw = () => {
      const f = Jobs.filterOf(s);
      const searched = lastSearched = Jobs.searchJobs(rows, s.q, ctx);
      const d = Jobs.dedupe(Jobs.filterJobs(searched, f, ctx)); dupes = d.dupes;
      fits = have ? new Map(d.rows.map(r => [r.id, fitOf(r)])) : null;
      const list = Jobs.sortJobs(d.rows, s.sort, fits), pg = Jobs.pageOf(list, s.page); s.page = pg.page;
      const active = !!(s.q.trim() || s.loc.trim() || Jobs.isFiltered(f));
      $("#jcount").innerHTML = (pg.total > Jobs.PAGE ? `Showing ${fmt(pg.from)}–${fmt(pg.to)} of ${fmt(pg.total)} postings` : plural(pg.total, "posting", "postings")) + (active ? ` · <button type="button" class="linkish link" data-clear="1">Clear filters</button>` : "");
      $("#jlist").innerHTML = pg.rows.length ? pg.rows.map(card).join("") : emptyState();
      $("#jpager").innerHTML = pg.pages > 1 ? `<button type="button" class="btn" data-page="-1"${pg.page === 1 ? " disabled" : ""}>Previous ${Jobs.PAGE}</button><span>Page ${fmt(pg.page)} of ${fmt(pg.pages)}</span><button type="button" class="btn" data-page="1"${pg.page === pg.pages ? " disabled" : ""}>Next ${Jobs.PAGE}</button>` : "";
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
      if (t.closest("[data-clear]")) { const b = Jobs.blankState(); for (const k of Jobs.KEYS) if (k !== "sort" && k !== "open") s[k] = b[k]; syncInputs(); draw(); return; }
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
    const ix = await Atlas.index();
    crumbs([["Explore", null]]); showAside(null);
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
      const view = `<div class="filters explore-row">${asMap ? '<input class="sm-find" id="sm-find" type="search" placeholder="Find a skill" list="sm-names" aria-label="Find a skill"><datalist id="sm-names"></datalist>' : ""}<div class="seg views" role="group" aria-label="View"><button type="button" class="${asMap ? "" : "on"}" aria-pressed="${!asMap}" id="v-grid" title="Fields">▦</button><button type="button" class="${asMap ? "on" : ""}" aria-pressed="${asMap}" id="v-map" title="Skill map">⊞</button></div></div>`;
      const pg = all.find(g => g.set === "product"), mg = all.find(g => g.set === "mba");
      const dates = tip(`Counts are open postings in the US: business fields refreshed ${mg.generated}${pg.generated ? `, Product scraped ${pg.generated} (${fmt(pg.nWorld)} worldwide)` : ""}.`);
      const inner = g => `${esc(g.label)}<span class="n">${g.nOpen == null ? "loading…" : fmt(g.nOpen) + " open"}</span>`;
      // a field card (owner's choice E2): the name, two or three of its roles marked as examples, one number and a
      // bar that compares fields; the ones that fit carry their reason
      const max = Math.max(1, ...all.map(g => g.nOpen || 0));
      const card = g => {
        const names = g.roles.map(r => (ix.roles[r] || {}).label).filter(Boolean), ex = names.slice(0, 3), more = names.length - ex.length, isFit = !!(fit && fit.has(g.id));
        return `<a class="fcard${isFit ? " you" : ""}" href="#/field/${esc(g.id)}"><span class="t">${esc(g.label)}</span><span class="m">${names.length ? `e.g. ${esc(ex.join(" · "))}${more > 0 ? `, +${more} more ${more === 1 ? "role" : "roles"}` : ""}` : "loading…"}</span><span class="bar" data-measure="${g.nOpen == null ? "Loading" : fmt(g.nOpen)} open postings in ${esc(g.label)} now; the bar compares the fields."><i style="width:${Math.round(100 * (g.nOpen || 0) / max)}%"></i></span><span class="n">${g.nOpen == null ? "loading…" : fmt(g.nOpen) + " open"}${isFit ? ` · <span class="why">${esc(ff.why.get(g.id))}</span>` : ""}</span></a>`;
      };
      if (asMap) {
        // the fields on the skill map: a field's own skills beside it, the skills every field asks for in the middle
        const key = overlay ? `<span><i class="sw have"></i> Already on your resume</span><span><i class="sw todo"></i> Gaps these roles require</span><span><i class="sw quiet"></i> Other skills: hover for the name</span>` : `<span><i class="sw top"></i> The 35 skills most postings ask for</span><span><i class="sw quiet"></i> The rest: hover for the name</span>${fit && fit.size ? '<span><i class="sw you"></i> Fields your answers and resume point to</span>' : ""}`;
        page(`<h1>Explore the roles</h1>
          <p class="lead">${all.length} fields, ${nRoles || 56} roles. Hover a field to light up the skills that set it apart; click a skill to see who asks for it. ${dates}</p>${chips}${view}
          <div id="sm-plan"></div>
          <div class="sm-stage" id="sm-stage"></div>
          <p class="key swkey">${key}<button type="button" class="linkish link" id="sm-all">${SkillMap.allShown() ? "Show the fields alone" : "Show all skills"}</button></p>`);
        main.firstElementChild.classList.add("wide");
        $("#sm-all").onclick = () => { SkillMap.showAll(!SkillMap.allShown()); $("#sm-all").textContent = SkillMap.allShown() ? "Show the fields alone" : "Show all skills"; };
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
      page(`<h1>Explore the roles</h1>
        <p class="lead">${all.length} fields, ${nRoles || 56} roles. Pick a field.${fit && fit.size ? " The ones that fit you come first." : ""} ${dates}</p>${chips}${view}
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
    crumbs([["Explore", "#/explore"], [g.label, null]]); showAside(null);
    const roles = g.roles.map(r => ix.roles[r]).sort((a, b) => b.nOpen - a.nOpen);
    const line = r => {
      const names = (r.definingList.length ? r.definingList : r.asks).slice(0, 2).map(x => (ix.skillById[x.id] || (state.R && state.R.skillById[x.id]) || { name: x.id }).name.replace(/\s*\(.*?\)/g, ""));
      return (r.definingList.length ? "Stands out for " : "Asks most for ") + join(names);
    };
    const when = `Open postings in the US${g.generated ? `, ${g.set === "product" ? "scraped" : "refreshed"} ${esc(g.generated)}` : ""}${g.set === "product" ? `; ${fmt(g.nWorld)} worldwide` : ""}.`;
    const rg = state.resume ? await rough() : null;
    const mark = r => !rg ? "" : rg.held.includes(r.id) ? ' · <span style="color:var(--primary)">you held this role</span>' : rg.scores[r.id] >= 0.6 ? ' · <span style="color:var(--primary)">your resume reads close to it</span>' : "";
    const anyMark = rg && roles.some(r => mark(r));
    // half and half (owner's decision 2026-10-24): the roles on the left, the field's skills on lanes on the right;
    // hovering a role lights its skills; a dot opens the skill card
    const closed = g.set === "mba" ? "recent postings, open and closed over the last year" : "open postings";
    page(`<div class="field-split"><div>
      <h1>${esc(g.label)}</h1>
      <p class="lead">${plural(roles.length, "role", "roles")} · <span data-measure="${when}">${fmt(roles.reduce((a, r) => a + r.nOpen, 0))} open postings</span>. The biggest first.${anyMark ? " Green: a rough read of your resume; open a role for your band of fit." : ""} <a href="#/explore?field=${esc(g.id)}" data-map>See ${esc(g.label)} on the skill map →</a></p>
      <div class="list">${roles.map(r => `<a class="r" href="#/role/${esc(r.id)}" data-role="${esc(r.id)}"><span class="t">${esc(r.label)}</span><span class="n">${fmt(r.nOpen)} open</span><span class="m">${r.blurb ? esc(r.blurb) + " " : ""}${esc(productLine(g, r, line))}${mark(r)}</span></a>`).join("")}</div>
      <p class="small muted" style="margin-top:12px">Hover a role to light its skills on the right. Click a skill for what it means.</p>
      </div><div>
      <div class="chart-stage" id="chart"></div>
      <p class="small muted chart-x">% of ${esc(g.label)} postings that ask for the skill <span class="mark" data-measure="The share of ${esc(closed)} in ${esc(g.label)} that ask for the skill, averaged over the field's roles.">ⓘ</span>${rg ? ' · <span class="sw have"></span> already on your resume · <span class="sw todo"></span> gaps these roles require' : ""}</p>
      </div></div>`);
    main.firstElementChild.classList.add("wide");
    SkillMap.chart($("#chart"), { field: g.id, label: g.label, roles, shown: rg ? rg.shown : null, aside, showAside });
    main.querySelectorAll("[data-role]").forEach(a => { a.onmouseenter = () => SkillMap.chartLight(a.dataset.role); a.onmouseleave = () => SkillMap.chartLight(null); });
  }
  function productLine(g, r, line) {
    if (g.set !== "product") return line(r);
    return "Asks most for " + join(r.asks.slice(0, 2).map(x => x.id).map(id => (state.R && state.R.skillById[id] ? state.R.skillById[id].name : nameFromProduct(id)).replace(/\s*\(.*?\)/g, "")));
  }
  let productNames = null;
  function nameFromProduct(id) { return (productNames && productNames[id]) || id; }
  Atlas.product().then(P => { productNames = Object.fromEntries(P.G.skills.map(s => [s.id, s.name])); }).catch(() => { });

  // ---------- 4. a role: the skill grid, the side panel, the postings ----------
  async function loadRole(id) {
    if (!state.ixGroups) state.ixGroups = (await Atlas.index()).groups;
    if (state.roleId !== id) { state.R = await Atlas.role(id); state.roleId = id; state.level = defaultLevel(); state.employer = "all"; state.selected = null; state.query = ""; state.shown = PAGE; state.evTab = null; state.match = null; state.sector = new Set(); state.company = new Set(); state.country = new Set(); state.remote = false; state.more = false; state.companyQuery = ""; state.grads = false; state.areaOpen = null; state.areaMore = new Set(); state.tab = "skills"; state.empOpen = new Set(); state.fit = null; state.gapOpen = null; state.wait = null; state.gapClasses = null; state.sponsor = false; state.postingOpen = false; }
    const ix = await Atlas.index(); return ix.groups.find(x => x.id === state.R.role.group);
  }
  // a student looks at the entry grade first; everyone else at every level
  const defaultLevel = () => (state.you && WHERE[state.you.where]) ? "entry" : "all";
  async function roleScreen(id) {
    const g = await loadRole(id); const R = state.R;
    const { query } = Routes.parseRoute(location.hash);   // "#/role/fpa?tab=skills": the fit screen's link lands on the painted list
    if (["skills", "postings", "also"].includes(query.tab)) state.tab = query.tab;
    crumbs([["Explore", "#/explore"], [g.label, "#/field/" + g.id], [R.role.label, null]]);
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
  const extraCount = () => state.sector.size + state.company.size + state.country.size + (state.remote ? 1 : 0);
  // every filter but the level: what the Filters button counts and the drawer holds
  const activeCount = () => (state.employer === "all" ? 0 : 1) + (state.grads ? 1 : 0) + (state.sponsor ? 1 : 0) + extraCount();
  const toggle = (set, v) => { set.has(v) ? set.delete(v) : set.add(v); state.shown = PAGE; };
  const keepScroll = fn => { const y = window.scrollY; fn(); window.scrollTo(0, y); };
  // the filters in the drawer show as removable chips beside the Filters button while the drawer is closed
  function activeChips(R) {
    const emp = state.employer === "all" ? [] : [[(R.employerTypes.find(e => e[0] === state.employer) || [])[1] || state.employer, 'data-emp="all"']];
    const grads = state.grads ? [["Graduates and interns", 'id="grads"']] : [];
    const extra = [...[...state.sector].map(v => [v, `data-sector="${esc(v)}"`]), ...[...state.company].map(v => [v, `data-company="${esc(v)}"`]), ...[...state.country].map(v => [v, `data-country="${esc(v)}"`]), ...(state.remote ? [["Remote", 'id="remote"']] : [])];
    return [...emp, ...grads, ...extra].map(([v, attr]) => `<button type="button" class="chip on" ${attr} aria-label="Remove filter ${esc(v)}">${esc(v)} <span aria-hidden="true">×</span></button>`).join("");
  }
  // The filters drawer (owner's choice R2, 2026-10-19): employers, who it is for, industry, employer name, location.
  // The level stays on the page as a segmented control. Every count reflects the other filters (owner's choice 7A).
  function drawerHtml(R, countBy) {
    const group = (label, inner) => `<div class="fgroup"><span class="lbl">${label}</span><div class="chips" style="margin:4px 0 0">${inner}</div></div>`;
    const chipsOf = (items, set, attr, allLabel) => `${allLabel ? `<button type="button" class="chip${set.size ? "" : " on"}" data-${attr}="__all">${allLabel}</button>` : ""}${items.map(([v, n]) => `<button type="button" class="chip${set.has(v) ? " on" : ""}" data-${attr}="${esc(v)}">${esc(v)}<span class="n">${fmt(n)}</span></button>`).join("")}`;
    const empCounts = countBy(jobsExcept("employer"), Atlas.employerType), empAll = jobsExcept("employer").length;
    const emp = `<button type="button" class="chip${state.employer === "all" ? " on" : ""}" data-emp="all">All<span class="n">${fmt(empAll)}</span></button>` + R.employerTypes.map(([id, label]) => `<button type="button" class="chip${state.employer === id ? " on" : ""}" data-emp="${id}">${esc(label)}<span class="n">${fmt(empCounts[id] || 0)}</span></button>`).join("");
    const grads = R.set === "mba" ? group("Who it is for", `<button type="button" class="chip${state.grads ? " on" : ""}" id="grads">Graduates and interns<span class="n">${fmt(jobsExcept("grads").filter(j => j.entry || j.intern).length)}</span></button>`) : "";
    const sec = Object.entries(countBy(jobsExcept("sector"), j => j.sector)).filter(([v]) => v && v !== "Startup (unclassified)").sort((a, b) => b[1] - a[1]).slice(0, 10);
    const cm = countBy(jobsExcept("company"), j => j.company); const q = state.companyQuery.trim().toLowerCase();
    const picked = [...state.company].map(v => [v, cm[v] || 0]);
    const options = q ? Object.entries(cm).filter(([c]) => c.toLowerCase().includes(q) && !state.company.has(c)).sort((a, b) => b[1] - a[1]).slice(0, 12) : [];
    const cn = Object.entries(countBy(jobsExcept("country"), j => j.country)).filter(([v]) => v).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const remoteN = jobsExcept("country").filter(j => j.remote && (state.country.size === 0 || state.country.has(j.country))).length;
    const remote = `<button type="button" class="chip${state.remote ? " on" : ""}" id="remote">Remote<span class="n">${fmt(remoteN)}</span></button>`;
    return `<div class="drawer-back" id="drawer-back"></div><div class="drawer" role="dialog" aria-label="Filters" id="drawer">
      <div class="drawer-h"><h2>Filters</h2><button type="button" class="close" id="drawer-close" aria-label="Close">×</button></div>
      ${group("Employers", emp)}${grads}
      ${group("Industry", chipsOf(sec, state.sector, "sector", "All industries"))}
      ${POSTINGS ? `<div class="fgroup"><span class="lbl">Employer</span><input type="search" id="company-q" placeholder="Employer name" aria-label="Employer name" value="${esc(state.companyQuery)}" autocomplete="off"><div class="chips" style="margin:4px 0 0">${picked.map(([v, n]) => `<button type="button" class="chip on" data-company="${esc(v)}">${esc(v)}<span class="n">${fmt(n)}</span></button>`).join("")}${options.map(([v, n]) => `<button type="button" class="chip" data-company="${esc(v)}">${esc(v)}<span class="n">${fmt(n)}</span></button>`).join("")}${!picked.length && !q ? '<span class="small muted">Type a name to pick an employer.</span>' : ""}</div></div>` : ""}
      ${R.country ? group("Location", `<span class="small muted">${esc(R.country)} only.</span>${remote}`) : group("Location", chipsOf(cn, state.country, "country", "Anywhere") + remote)}
      <div class="row between drawer-f">${activeCount() ? '<button type="button" class="btn quiet" id="clear-extra">Clear all</button>' : "<span></span>"}<button type="button" class="btn primary" id="drawer-done">Done</button></div>
    </div>`;
  }
  // The skills a role asks for, by area (owner's choice R3, 2026-10-19): one panel per skill area, the skills most
  // postings ask for open in it, the rest behind "more"; the panel with the most of those is open at first. "Expand
  // all" opens every panel and every fold, which lays the whole list out ranked; "Collapse all" takes it back.
  const TIER_LABEL = ["Asked by most postings", "Asked by a quarter to a half of the postings", "Asked by one in ten to one in four postings"];
  function skillRow(R, s, n, m) {
    const on = state.selected && state.selected.kind === "skill" && state.selected.id === s.id;
    const paint = m ? (m.matched.has(s.id) ? " have" : m.presumed.has(s.id) ? "" : m.required.has(s.id) ? " gap" : "") : "";
    const marks = (s.defining ? `<span class="mark" data-measure="◆ sets this role apart: postings of this role ask for it far more often than postings of other roles do.">◆</span>` : "") + (s.grows ? `<span class="mark" data-measure="↗ asked more as you move up: at least 1.5 times as often in leadership postings as in entry-level ones.">↗</span>` : "");
    const known = state.known && state.known.has(s.id) ? `<span class="known" data-measure="✓ you know this one: you got it right in a game.">✓</span>` : "";
    const through = s.carriers && s.carriers.length ? `<span class="m">through ${esc(s.carriers.slice(0, 2).map(k => (R.skillById[k] || { name: k }).name).join(", "))}${s.carriersFallback ? " (in this field)" : ""}</span>` : "";
    return `<button type="button" class="srow${on ? " on" : ""}${paint}" data-skill="${esc(s.id)}"><span class="nm">${esc(s.name)}${marks}${known}${s.area ? `<span class="m">${esc(s.area)}</span>` : through}</span><span class="bar" data-measure="The bar is the share of postings that ask for this skill: ${pct(s.share)} of the ${fmt(n)} postings in this view ask for ${esc(s.name)}."><i style="width:${Math.round(s.share * 100)}%"></i></span></button>`;
  }
  function areaPanel(R, a, n, m, flat) {
    const core = a.skills.filter(s => s.tier === 0), first = core.length && !flat ? core : a.skills, folded = core.length && !flat ? a.skills.filter(s => s.tier > 0) : [];
    const more = state.areaMore.has(a.cluster);
    const rowsOf = (list, labelled) => { let last = -1, h = ""; for (const s of list) { if (labelled && s.tier !== last) { h += `<span class="tierlab">${TIER_LABEL[s.tier]}</span>`; last = s.tier; } h += skillRow(R, s, n, m); } return h; };
    const fold = folded.length ? (more ? rowsOf(folded, true) + `<button type="button" class="linkish link more" data-more="${esc(a.cluster)}">Show fewer</button>` : `<button type="button" class="linkish link more" data-more="${esc(a.cluster)}">Show ${folded.length} more, asked by fewer postings</button>`) : "";
    const n2 = a.behaviours ? `<span class="n">${esc(a.summary)}</span>` : `<span class="n">${plural(a.skills.length, "skill", "skills")}${core.length ? ` · ${core.length} in most postings` : ""}</span>`;
    return `<details class="areabox${a.behaviours ? " behaviours" : ""}" data-area="${esc(a.cluster)}"${flat || state.areaOpen.has(a.cluster) ? " open" : ""}><summary><span class="t">${esc(a.label)}</span>${n2}</summary><div class="srows">${rowsOf(first, flat || !core.length)}${fold}</div></details>`;
  }
  // the whole list laid out, painted: the course screen shows what a syllabus covers on it
  function flatSkills(R, slice, m) { const { areas, stats } = Atlas.areas(R, slice); return areas.length ? `<div class="areas">${areas.map(a => areaPanel(R, a, stats.n, m, true)).join("")}</div>` : '<p class="notice">No postings match these filters.</p>'; }
  // the game a role's "Practise" opens (PLAN.md v12, entry points): Know the role
  const PRACTISE = "know-the-role";
  // the lead says what the data says: what sets the role apart, what leads the asks, which tools (owner's choice X1)
  function roleLead(areas) {
    const core = areas.flatMap(a => a.skills).filter(s => s.tier === 0).sort((a, b) => b.share - a.share);
    if (!core.length) return "Few postings match this view; widen the filters to see what the role asks for.";
    const def = core.filter(s => s.defining).slice(0, 2), top = core.filter(s => !s.defining && s.kind !== "behaviour" && s.cluster !== "tools" && s.cluster !== "domain").slice(0, 3), tools = core.filter(s => s.cluster === "tools").slice(0, 2);
    const names = xs => xs.map(s => s.name.replace(/\s*\(.*?\)/g, ""));   // "Office suite (Excel, …)" reads as "Office suite" here
    const parts = [def.length ? `${join(names(def))} set${def.length === 1 ? "s" : ""} this role apart` : "", top.length ? `${join(names(top))} lead the asks` : "", tools.length ? `${join(names(tools))} ${tools.length === 1 ? "is the tool" : "are the tools"}` : ""].filter(Boolean);
    return cap(parts.join("; ")) + ".";
  }
  const allExpanded = areas => areas.every(a => state.areaOpen.has(a.cluster) && (state.areaMore.has(a.cluster) || !a.skills.some(s => s.tier > 0) || !a.skills.some(s => s.tier === 0)));
  function renderRole() {
    const R = state.R, role = R.role, slice = sliceOf();
    const { areas, stats } = Atlas.areas(R, slice);
    // the first area opens by itself; an engineering student sees the technical area first when the role has one
    if (state.areaOpen == null) { const tech = state.you && TECHNICAL_PROGRAMS.includes(state.you.where) && areas.find(a => a.cluster === "technical"); const firstArea = areas.find(a => !a.behaviours) || areas[0]; state.areaOpen = new Set(areas.length ? [(tech || firstArea).cluster] : []); }
    const open = slice.filter(j => j.open);
    const nClosed = R.jobs.length - R.jobs.filter(j => j.open).length;
    const countBy = (jobs, fn) => { const m = {}; for (const j of jobs) { const k = fn(j); if (k != null) m[k] = (m[k] || 0) + 1; } return m; };
    const where = R.country ? ` · ${esc(R.country)}` : "";
    const facts = R.set === "product" ? `<span data-measure="${fmt(role.nOpen)} open postings in the US; ${fmt(role.nWorld)} worldwide, and the skills below read all of them.">${fmt(role.nOpen)} open postings in the US</span> · ${plural(role.nCompanies, "employer", "employers")}` : `<span data-measure="${fmt(open.length)} open now${nClosed ? `; ${fmt(nClosed)} recently closed postings are counted in the shares too, so the skills reflect a year of hiring, not one week` : ""}.">${fmt(R.jobs.filter(j => j.open).length)} open postings</span> · ${plural(role.nCompanies, "employer", "employers")}${where}`;
    const lead = roleLead(areas);
    // the Know-your-role record (PLAN.md v12, decision 4): the asks the player got right in a game, as ✓ on the list
    // and as a card beside the action row
    const GS = window.GameShell, asks = GS ? GS.record.asksOf({ roles: { [role.id]: role }, M: { skills: R.skills } }, { G: { skills: R.skills } }, role.id) : [];
    state.known = new Set(GS ? GS.record.knowledge(role.id, asks).known : []);
    const know = GS ? GS.knowCard({ roleId: role.id, label: role.label, asks, nameOf: id => (R.skillById[id] || { name: id }).name, practise: ids => `#/play/${PRACTISE}?role=${encodeURIComponent(role.id)}&skills=${encodeURIComponent(ids.slice(0, 8).join(","))}` }) : "";
    // the fit paints the list whenever one is read for this view (no toggle: owner's decision 2026-10-24)
    const fit = fitFor(), m = fit ? state.match : null;
    const topEmployers = Object.entries(countBy(open, j => j.company)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
    const nEntry = open.filter(j => Atlas.stepOf(j) === "entry").length, nGrads = open.filter(j => j.entry || j.intern).length;
    const glance = `${lead} Entry grade: ${R.stepLabels.entry}, ${fmt(nEntry)} open at that grade${R.set === "mba" && nGrads ? `, ${fmt(nGrads)} for graduates and interns` : ""}.${topEmployers.length ? ` Top employers now: ${join(topEmployers)}.` : ""}`;
    const nAct = activeCount();
    const seg = `<div class="seg" role="group" aria-label="Level"><button type="button" class="${state.level === "all" ? "on" : ""}" aria-pressed="${state.level === "all"}" data-level="all">All levels</button>${Atlas.STEPS.map(s => `<button type="button" class="${state.level === s ? "on" : ""}" aria-pressed="${state.level === s}" data-level="${s}">${esc(R.stepLabels[s])}</button>`).join("")}</div>`;
    // "Says it sponsors" (PLAN.md v16, step 8): postings that say they sponsor a visa; shown once the data carries the fact
    const hasSponsorship = R.jobs.some(j => j.sponsorship != null);
    const nSponsor = hasSponsorship ? jobsExcept("sponsor").filter(j => j.sponsorship === "yes").length : 0;
    const sponsorChip = hasSponsorship ? `<button type="button" class="chip${state.sponsor ? " on" : ""}" id="sponsor-chip" aria-pressed="${state.sponsor}" data-measure="Postings that say they sponsor a visa; most postings say nothing either way. ${fmt(nSponsor)} of the ${fmt(jobsExcept("sponsor").length)} in this view say so${R.jobs.some(j => j.sponsorship === "no") ? `; ${fmt(jobsExcept("sponsor").filter(j => j.sponsorship === "no").length)} say they do not` : ""}.">Says it sponsors<span class="n">${fmt(nSponsor)}</span></button>` : "";
    const filters = `<div class="filters">${seg}${sponsorChip}<button type="button" class="btn filters-btn${nAct ? " on" : ""}" id="more-filters" aria-expanded="${state.more}">Filters${nAct ? `<span class="n">${nAct}</span>` : ""}</button>${!state.more ? activeChips(R) : ""}</div>${state.more ? drawerHtml(R, countBy) : ""}`;
    const expanded = allExpanded(areas);
    const listHead = `<div class="listhead"><h2>What the postings ask for ${tip("Skills are grouped by area and ranked by how many of the postings in this view ask for them. Open a skill to see what it means, what it breaks down into and how postings say it.")}</h2><span class="small muted">${plural(stats.n, "posting", "postings")} in this view</span>${areas.length ? `<button type="button" class="linkish link" id="expand-all">${expanded ? "Collapse all" : "Expand all"}</button>` : ""}</div>`;
    const skillList = areas.length ? `<div class="areas">${areas.map(a => areaPanel(R, a, stats.n, m)).join("")}</div>` : '<p class="notice">No postings match these filters.</p>';

    const creds = R.skills.filter(s => s.cluster === "credentials" && stats.share(s.id) >= 0.1).map(s => ({ s, v: stats.share(s.id) })).sort((a, b) => b.v - a.v).slice(0, 6);
    const doms = R.skills.filter(s => s.cluster === "domain" && stats.share(s.id) >= 0.1).map(s => ({ s, v: stats.share(s.id) })).sort((a, b) => b.v - a.v).slice(0, 6);
    const credChip = x => `<span class="tag" data-measure="${pct(x.v)} of the ${fmt(stats.n)} postings in this view ask for ${esc(x.s.name)}.">${esc(x.s.name)}</span>`;
    let summary = "";
    if (creds.length) { const w = inWords(creds[0].v), more = creds.slice(1, 3); summary = `${cap(w)} ${/posting$/.test(w) ? "asks" : "ask"} for ${low(esc(creds[0].s.name))}${more.length ? `; ${join(more.map(x => low(esc(x.s.name))))} also come up` : ""}.`; }
    if (doms.length) summary += ` Industries named most: ${join(doms.slice(0, 3).map(x => esc(x.s.name)))}. One is enough.`;
    const also = (creds.length || doms.length) ? `<p class="lead" style="margin-top:14px">${summary}</p>${creds.length ? `<h3>Degrees and credentials</h3><div class="tags">${creds.map(credChip).join("")}</div>` : ""}${doms.length ? `<h3>Industries</h3><div class="tags">${doms.map(credChip).join("")}</div>` : ""}` : "";
    // postings (owner's choice R6): open only, grouped by employer; employers hiring graduates and interns first
    // (MBA set), then the employers with the most postings. One posting stands alone; several fold under the employer.
    const q = state.query.trim().toLowerCase();
    const rank = j => j.entry === "mba" ? 0 : j.intern ? 1 : j.entry === "pre_mba" ? 2 : 3;
    const list = open.filter(j => !q || (j.company + " " + j.title + " " + (j.location || "")).toLowerCase().includes(q)).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
    const byEmp = new Map(); for (const j of list) { const e = byEmp.get(j.company) || { company: j.company, jobs: [], rank: 9 }; e.jobs.push(j); e.rank = Math.min(e.rank, rank(j)); byEmp.set(j.company, e); }
    const emps = [...byEmp.values()].sort((a, b) => a.rank - b.rank || b.jobs.length - a.jobs.length || a.company.localeCompare(b.company));
    const shownEmps = emps.slice(0, state.shown);
    const who = j => j.intern ? " · internship" : j.entry === "mba" ? " · for MBA graduates" : j.entry === "pre_mba" ? " · for new graduates" : "";
    const jobRow = (j, withCompany) => `<button type="button" class="r${state.selected && state.selected.kind === "posting" && state.selected.id === j.id ? " on" : ""}" data-job="${j.id}"><span class="t">${esc(j.title)}</span><span class="n">${esc(levelLabel(R, j))}</span><span class="m">${withCompany ? esc(j.company) + (j.location ? " · " : "") : ""}${j.location ? esc(j.location) : ""}${who(j)}</span></button>`;
    const empBox = e => e.jobs.length === 1 ? jobRow(e.jobs[0], true) : `<details class="empbox" data-emp-open="${esc(e.company)}"${state.empOpen.has(e.company) ? " open" : ""}><summary><span class="t">${esc(e.company)}</span><span class="n">${plural(e.jobs.length, "posting", "postings")}</span><span class="m">${esc(e.jobs[0].title)}${e.jobs[0].location ? " · " + esc(e.jobs[0].location) : ""}${who(e.jobs[0])}${e.jobs.length > 1 ? " · …" : ""}</span></summary><div class="list">${e.jobs.map(j => jobRow(j, false)).join("")}</div></details>`;
    const postings = `<input type="search" id="q" placeholder="Search by employer or title" aria-label="Search postings" value="${esc(state.query)}" autocomplete="off">
      <div class="list" id="postings">${shownEmps.map(empBox).join("") || '<p class="small muted" style="padding:10px 0">No open postings match.</p>'}</div>
      <p class="small muted" style="margin-top:8px">${plural(emps.length, "employer", "employers")}, ${plural(list.length, "open posting", "open postings")}${R.set === "mba" ? "; employers hiring graduates and interns first" : ""}. ${emps.length > shownEmps.length ? `<button type="button" class="linkish link" id="more">Show ${fmt(Math.min(20, emps.length - shownEmps.length))} more employers</button>` : ""}</p>`;
    const TABS = [["skills", "Skills", null], ...(POSTINGS ? [["postings", "Open postings", open.length]] : []), ...(also ? [["also", "Also asked for", null]] : [])];
    if (!TABS.some(t => t[0] === state.tab)) state.tab = "skills";
    const tabs = `<div class="tabs" role="tablist">${TABS.map(([k, l, n]) => `<button type="button" role="tab" class="${state.tab === k ? "on" : ""}" aria-selected="${state.tab === k}" data-tab="${k}">${l}${n != null ? `<span class="n">${fmt(n)}</span>` : ""}</button>`).join("")}</div>`;
    const body = state.tab === "postings" ? postings : state.tab === "also" ? also : listHead + skillList;
    // the title, one sentence on what the job is (web/data/role_blurbs.json), the facts, the data's lead sentence
    page(`<h1>${esc(role.label)}</h1><p class="facts">${facts} · entry grade: ${esc(R.stepLabels.entry)}, ${fmt(nEntry)} open</p>
      <p class="lead">${role.blurb ? esc(role.blurb) + " " : ""}${lead}</p>${know}
      ${filters}${tabs}${body}`);
    main.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { state.tab = b.dataset.tab; keepScroll(renderRole); });
    main.querySelectorAll("details.empbox").forEach(d => d.ontoggle = () => { d.open ? state.empOpen.add(d.dataset.empOpen) : state.empOpen.delete(d.dataset.empOpen); });
    main.querySelectorAll("[data-level]").forEach(b => b.onclick = () => { state.level = b.dataset.level; state.shown = PAGE; keepScroll(renderRole); });
    main.querySelectorAll("[data-emp]").forEach(b => b.onclick = () => { state.employer = b.dataset.emp; state.shown = PAGE; keepScroll(renderRole); });
    $("#more-filters").onclick = () => { state.more = !state.more; keepScroll(renderRole); };
    const closeDrawer = () => { state.more = false; keepScroll(renderRole); };
    for (const id of ["#drawer-close", "#drawer-back", "#drawer-done"]) { const el = $(id); if (el) el.onclick = closeDrawer; }
    main.querySelectorAll("details.areabox").forEach(d => d.ontoggle = () => { d.open ? state.areaOpen.add(d.dataset.area) : state.areaOpen.delete(d.dataset.area); const b = $("#expand-all"); if (b) b.textContent = allExpanded(areas) ? "Collapse all" : "Expand all"; });
    main.querySelectorAll("[data-more]").forEach(b => b.onclick = () => { toggle(state.areaMore, b.dataset.more); keepScroll(renderRole); });
    main.querySelectorAll("details[data-k]").forEach(d => d.ontoggle = () => { d.open ? state.open.add(d.dataset.k) : state.open.delete(d.dataset.k); });
    const xa = $("#expand-all"); if (xa) xa.onclick = () => { const all = allExpanded(areas); state.areaOpen = new Set(all ? [] : areas.map(a => a.cluster)); state.areaMore = new Set(all ? [] : areas.map(a => a.cluster)); keepScroll(renderRole); };
    const gr = $("#grads"); if (gr) gr.onclick = () => { state.grads = !state.grads; state.shown = PAGE; keepScroll(renderRole); };
    const sp = $("#sponsor-chip"); if (sp) sp.onclick = () => { state.sponsor = !state.sponsor; state.shown = PAGE; keepScroll(renderRole); };
    main.querySelectorAll("[data-sector]").forEach(b => b.onclick = () => { b.dataset.sector === "__all" ? state.sector.clear() : toggle(state.sector, b.dataset.sector); keepScroll(renderRole); });
    main.querySelectorAll("[data-country]").forEach(b => b.onclick = () => { b.dataset.country === "__all" ? state.country.clear() : toggle(state.country, b.dataset.country); keepScroll(renderRole); });
    main.querySelectorAll("[data-company]").forEach(b => b.onclick = () => { toggle(state.company, b.dataset.company); state.companyQuery = ""; keepScroll(renderRole); });
    const rem = $("#remote"); if (rem) rem.onclick = () => { state.remote = !state.remote; keepScroll(renderRole); };
    const clr = $("#clear-extra"); if (clr) clr.onclick = () => { state.sector.clear(); state.company.clear(); state.country.clear(); state.remote = false; state.companyQuery = ""; keepScroll(renderRole); };
    const cq = $("#company-q"); if (cq) cq.oninput = () => { state.companyQuery = cq.value; keepScroll(renderRole); const el = $("#company-q"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); };
    main.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }));
    main.querySelectorAll("[data-job]").forEach(b => b.onclick = () => select({ kind: "posting", id: Number(b.dataset.job) }));
    const qi = $("#q"); if (qi) qi.oninput = () => { state.query = qi.value; state.shown = PAGE; const y = window.scrollY; renderRole(); window.scrollTo(0, y); $("#q").focus(); $("#q").setSelectionRange(qi.value.length, qi.value.length); };
    const more = $("#more"); if (more) more.onclick = () => { state.shown += 20; const y = window.scrollY; renderRole(); window.scrollTo(0, y); };
    showRail(() => railHtml(R, state.group, fitFor(), stats, open));
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
    const over = html => railBase ? `<button type="button" class="close back" aria-label="Back">← Back</button>` + html.replace('<button type="button" class="close" aria-label="Close">×</button>', "") : html;
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
    if (!ev) return `<p class="small muted">Loading an example sentence…</p>`;
    const g = evGroup(ev); return g ? quoteHtml(ev[g][0]) : "";
  }
  function evidenceHtml(ev) {
    if (!ev) return `<p class="small muted">Loading example sentences…</p>`;
    const groups = EV_GROUPS.filter(([k]) => (ev[k] || []).length);
    if (!groups.length) return `<p class="small muted">No example sentences for this skill yet.</p>`;
    const tab = evGroup(ev);
    return `<div class="evtabs">${groups.map(([k, lab]) => `<button type="button" class="chip${tab === k ? " on" : ""}" data-ev="${k}">${lab}</button>`).join("")}</div>` +
      ev[tab].slice(0, 3).map(quoteHtml).join("");
  }
  // A skill's ladder is flat ({associate, mid, senior, lead}: product skills) or keyed by industry ladder
  // ({corporate: {...}, bank: {...}}: MBA skills, rungs the postings do not support are absent). The card shows the
  // role's own industry; when that one is not written, another industry's, named as such.
  const LADDER_ORDER = ["corporate", "bank", "consulting"];
  function ladderHtml(R, s, here) {
    const L = s.ladder;
    if (!L) return `<p class="small muted">The level ladder for this skill is not written yet.</p>`;
    const flat = LADDER_KEYS.some(([k]) => typeof L[k] === "string");
    const ind = flat ? null : L[R.role.ladder] ? R.role.ladder : LADDER_ORDER.find(k => L[k]) || Object.keys(L)[0];
    const rungs = flat ? L : L[ind];
    const lv = (ind && R.ladders && R.ladders[ind] && R.ladders[ind].levels) || {};
    const rows = LADDER_KEYS.filter(([k]) => flat || rungs[k]).map(([k, lab]) => `<span class="lv${here === k ? " here" : ""}">${esc(lv[k] || lab)}</span><span>${esc(rungs[k] || "")}</span>`).join("");
    const name = k => (((R.ladders || {})[k] || {}).label || k).toLowerCase();
    const other = ind && ind !== R.role.ladder ? `<p class="small muted">Shown from the ${esc(name(ind))} ladder; this skill has none yet for ${esc(name(R.role.ladder))}.</p>` : "";
    return other + `<div class="ladder">${rows}</div>`;
  }
  // The skill card (owner's choice R7, 2026-10-19): the first fold is the definition, one line of share in words,
  // the three biggest sub-skills and one quote, under 100 words. The rest sits behind four tabs in the same order
  // on every card: In postings · By level · Build it · Related. No tab is open until one is clicked.
  const CTABS = [["postings", "In postings"], ["ladder", "By level"], ["build", "Build it"], ["related", "Related"]];
  function skillCard(R, s, slice, ev) {
    const st = Atlas.shares(slice), ss = Atlas.subShares(slice, s.id);
    const subsMeta = (s.subskills || (R.subs[s.id] || []).map(x => ({ id: x.id, name: x.name, example: "" }))).map(sub => ({ ...sub, v: ss.share(sub.id) })).sort((a, b) => b.v - a.v);
    const m = state.match && state.match.roleId === R.role.id ? state.match : null;
    const subRow = (sub, withEx) => `<div class="sub${m ? (m.subs.has(sub.id) ? " have" : m.required.has(s.id) && !m.presumed.has(s.id) ? " miss" : "") : ""}"><span class="nm">${esc(sub.name)}</span><span class="pct" data-measure="${pct(sub.v)} of the postings in this view that ask for ${esc(s.name)} mention this.">${pct(sub.v)}</span>${withEx && sub.example ? `<span class="ex">${esc(sub.example)}</span>` : ""}</div>`;
    const rest = subsMeta.slice(3);
    const subs = subsMeta.length ? `<h3>Mostly means</h3><div class="subs">${(state.cardMore ? subsMeta : subsMeta.slice(0, 3)).map(sub => subRow(sub, state.cardMore)).join("")}</div>${rest.length ? `<button type="button" class="linkish link more" id="card-more">${state.cardMore ? "Show fewer" : `Show ${rest.length} more`}</button>` : ""}` : "";
    const w = inWords(st.share(s.id));
    const share = `<p class="small">${cap(w)} in this view ${/posting$/.test(w) ? "asks" : "ask"} for it. ${tip(`${pct(st.share(s.id))} of the ${fmt(st.n)} postings in this view ask for ${s.name}; ${pct(s.share)} of postings across ${R.set === "mba" ? "all MBA roles" : "all product roles"} do.`)}</p>`;
    const here = state.level === "all" ? null : { entry: "associate", mid: "mid", senior: "senior", lead: "lead" }[state.level];
    const ladder = ladderHtml(R, s, here);
    const bs = buildSteps(s, R.role.ladder, true), ladName = k => (((R.ladders || {})[k] || {}).label || k).toLowerCase();
    const build = bs.steps.length ? (bs.ind && bs.ind !== R.role.ladder ? `<p class="small muted">Shown from the ${esc(ladName(bs.ind))} ladder; this skill has none yet for ${esc(ladName(R.role.ladder))}.</p>` : "") + `<ul class="plain">${bs.steps.map(b => `<li>${stepHtml(b)}</li>`).join("")}</ul>` : `<p class="small muted">${R.role.ladder === "consulting" && s.build && !Array.isArray(s.build) ? "Build steps for consulting roles are on hold until a source is agreed." : "Build steps for this skill are not written yet."}</p>`;
    // What the skill means here and how it is shown (PLAN.md v14, decisions 3 and 6): the field entry's reading when the
    // role's field has one, else one sentence from the evidence file; a behaviour or a practice names the carriers the
    // role's postings pick. Every sentence comes from the data through web/evidence_text.js; `signals` left the card.
    const T = textOf(R.kinds), field = R.role.group, fieldLabel = (g => (g && g.label) || field)((state.ixGroups || []).find(x => x.id === field));
    const keys = Atlas.fieldKeys(R), hasOverride = !!(s.fields && s.fields[keys[0]]);   // the role's own reading, when its field's does not fit it
    const reads = T.reads(s, keys), kindLabel = ((R.kinds || {})[s.kind] || {}).label || "";
    const cs = s.kind === "behaviour" || s.kind === "practice" ? Atlas.carriers(R, slice, s.id) : null;
    const carrierTags = cs && cs.ids.length ? `<p class="small" style="margin:8px 0 0">Shown through${cs.fallback ? ` <span class="subtle">(in ${esc(fieldLabel.toLowerCase())})</span>` : ""}: <span class="tags inline">${cs.ids.map(k => `<button type="button" class="tag" data-skill="${esc(k)}">${esc(R.skillById[k].name)}</button>`).join("")}</span></p>` : "";
    const means = `${reads ? `<p class="small reads"><b>${hasOverride ? `For ${esc(R.role.label)}` : `In ${esc(fieldLabel.toLowerCase())}`}:</b> ${esc(reads)}</p>` : `<p class="small muted">${esc(T.summary(s))}</p>`}${carrierTags}`;
    const lineHere = T.line(s, keys);
    const showIt = `<p class="small" style="margin:10px 0 0"><b>${esc(T.how(s.kind || "method"))}</b></p>${s.kind !== "behaviour" ? `<p class="small">A line that shows it${lineHere.source === "field" ? (lineHere.role ? ` for ${esc(R.role.label)}` : ` in ${esc(fieldLabel.toLowerCase())}`) : ""}: <em>“${esc(lineHere.text)}”</em></p>` : cs && cs.ids.length ? `<p class="small">A line about ${esc(R.skillById[cs.ids[0]].name)}${cs.ids[1] ? ` or ${esc(R.skillById[cs.ids[1]].name)}` : ""} carries it: <em>“${esc(lineHere.text)}”</em></p>` : ""}`;
    const withSkill = slice.filter(j => j.open && j.skills.includes(s.id)).slice(0, 6);
    const postings = withSkill.length ? `<div class="list">${withSkill.map(j => `<button type="button" class="r" data-job="${j.id}"><span class="t">${esc(j.title)}</span><span class="n">${esc(levelLabel(R, j))}</span><span class="m">${esc(j.company)}</span></button>`).join("")}</div>` : `<p class="small muted">No open posting in this view asks for it.</p>`;
    const visible = new Set(Atlas.grid(R, slice).rows.flat(2).map(x => x.id));
    const related = R.edges.filter(e => (e.source === s.id || e.target === s.id)).map(e => ({ id: e.source === s.id ? e.target : e.source, w: e.jaccard })).filter(x => visible.has(x.id) && x.id !== s.id).sort((a, b) => b.w - a.w).slice(0, 6);
    const def = R.role.defining.has(s.id) ? ` · <span class="mark" data-measure="◆ sets this role apart: postings of this role ask for it far more often than postings of other roles do.">defines this role ◆</span>` : "";
    const bodies = {
      postings: `<h3>How postings say it</h3>${evidenceHtml(ev)}${POSTINGS ? `<h3>Postings that ask for it</h3>${postings}` : ""}`,
      ladder: `<h3>At each level</h3>${ladder}`,
      build: `<h3>How to show it</h3>${showIt}<h3>How to build it</h3>${build}`,
      related: `<h3>Often asked for together</h3>${related.length ? `<div class="tags">${related.map(r => `<button type="button" class="tag" data-skill="${esc(r.id)}">${esc(R.skillById[r.id].name)}</button>`).join("")}</div>` : '<p class="small muted">No skill is asked for together with it often enough to name.</p>'}`,
    };
    const tabs = `<div class="tabs card-tabs" role="tablist">${CTABS.map(([k, l]) => `<button type="button" role="tab" class="${state.cardTab === k ? "on" : ""}" aria-selected="${state.cardTab === k}" data-ctab="${k}">${l}</button>`).join("")}</div>`;
    return `<button type="button" class="close" aria-label="Close">×</button><div class="card">
      <p class="eyebrow">${kindLabel ? esc(kindLabel) + " · " : ""}${esc(R.clusters[s.cluster].label)}${def}</p><h2>${esc(s.name)}</h2>
      ${s.what ? `<p class="what">${esc(s.what)}</p>` : ""}
      ${share}${means}${subs}
      <div id="quote1">${firstQuote(ev)}</div>
      ${tabs}${state.cardTab ? `<div class="card-body">${bodies[state.cardTab]}</div>` : ""}
    </div>`;
  }
  function postingCard(R, j) {
    if (!j) return `<button type="button" class="close" aria-label="Close">×</button><p class="empty">That posting is not in this role.</p>`;
    const byArea = {}; for (const k of j.skills) { const s = R.skillById[k]; if (s) (byArea[s.cluster] ||= []).push(s); }
    const subNames = (j.sub || []).map(id => { for (const [sid, list] of Object.entries(R.subs)) { const f = list.find(x => x.id === id); if (f) return { sid, name: f.name }; } return null; }).filter(Boolean);
    const who = j.intern ? "An internship" : j.entry === "mba" ? "A job for MBA graduates" : j.entry === "pre_mba" ? "A job for new graduates" : null;
    return `<button type="button" class="close" aria-label="Close">×</button><div class="card">
      <p class="eyebrow">${esc(j.company)}${j.rank ? ` · Fortune #${j.rank}` : ""}</p><h2>${esc(j.title)}</h2>
      <p class="facts">${esc(levelLabel(R, j))}${j.location ? " · " + esc(j.location) : ""}${j.remote ? " · remote" : ""}${j.yoe ? ` · asks for ${j.yoe}+ years` : ""}${j.industry ? " · " + esc(j.industry) : ""}</p>
      ${who ? `<p class="small" style="color:var(--primary)">${who}${j.entry_src === "firm" || j.entry_src === "category" ? " at this employer's grade; the posting may also take experienced hires" : ""}.</p>` : ""}
      ${j.snippet ? `<p class="small muted">${esc(j.snippet)}…</p>` : ""}
      ${POSTINGS ? `<p><a class="link" href="${esc(j.url)}" target="_blank" rel="noopener">Open the posting ↗</a></p>` : ""}
      <h3>${plural(j.skills.filter(k => R.skillById[k] && R.skillById[k].cluster !== "credentials").length, "skill asked for", "skills asked for")}</h3>
      ${Object.entries(byArea).sort((a, b) => b[1].length - a[1].length).map(([c, ss]) => `<p class="small muted" style="margin:8px 0 2px">${esc(R.clusters[c].label)}</p><div class="tags">${ss.map(s => `<button type="button" class="tag" data-skill="${esc(s.id)}">${esc(s.name)}</button>`).join("")}</div>`).join("")}
      ${subNames.length ? `<h3>Specific asks in this posting</h3><div class="tags">${subNames.map(x => `<button type="button" class="tag" data-skill="${esc(x.sid)}">${esc(x.name)}</button>`).join("")}</div>` : ""}
    </div>`;
  }

  // ---------- 5. your fit: read once for the rail and the fit screen ----------
  const BANDS = [["different", "New to the field"], ["related", "Relevant foundation"], ["in_range", "Qualified for the role"], ["strong", "Strong match"]];
  const bandName = k => (BANDS.find(b => b[0] === k) || [])[1];
  // the view the fit is read on: the role, the level and every other filter
  const fitKey = level => [state.roleId, level, state.employer, state.grads, state.sponsor, [...state.sector].join(), [...state.company].join(), [...state.country].join(), state.remote].join("|");
  const fitFor = level => state.fit && state.fit.key === fitKey(level == null ? state.level : level) && state.resume && state.fit.resume === state.resume.text ? state.fit : null;
  // The matcher on the current view (the way the bands were calibrated: Atlas.matcher). Returns the rows by status,
  // the band now and the band if the top gaps were evidenced, and sets state.match (what the skills list paints).
  async function computeFit(R, level) {
    const role = R.role, slice = sliceOf(level);
    const { M, bands, group } = await Atlas.matcher(R);
    const extra = [state.grads ? "graduates and interns" : null, state.sponsor ? "says it sponsors" : null, state.employer !== "all" ? (R.employerTypes.find(e => e[0] === state.employer) || [])[1] : null, ...state.sector, ...state.company, ...state.country, state.remote ? "remote" : null].filter(Boolean);
    const label = `${role.label}${level === "all" ? "" : " · " + R.stepLabels[level]}${extra.length ? " · " + extra.join(", ") : ""}`;
    const r = M.match(state.resume.text, { jobs: slice, familyJobs: R.jobs, label }, { level: LEVEL_OPT[level], ladder: R.role.ladder });
    const rows = r.rows, by = st => rows.filter(x => x.status === st).sort((a, b) => (a.tier === b.tier ? b.w - a.w : a.tier === "core" ? -1 : b.tier === "core" ? 1 : a.tier === "common" ? -1 : 1));
    // `through`: a behaviour shown through a carrier skill the resume evidences (PLAN.md v14, decision 1)
    const evid = by("evidenced"), trans = by("transferable"), through = by("through"), thin = by("thin"), presumed = by("presumed"), gaps = by("gap").filter(x => x.tier !== "diff");
    const required = new Set(); for (const x of rows) { if (x.tier === "diff") continue; if (x.slot === "__ai") r.ai.forEach(k => required.add(k)); else if (x.slot !== "__domain") required.add(x.id); }
    state.match = { roleId: role.id, matched: new Set([...evid, ...trans, ...through].map(x => x.id).filter(k => R.skillById[k])), required, presumed: new Set(presumed.map(x => x.id)), subs: r.subs };
    const band = Matcher.bandOf(r.overall, bands, group), bandNext = Matcher.bandOf(r.whatIf, bands, group);
    const core = rows.filter(x => x.tier === "core"), coreHave = core.filter(x => x.status === "evidenced" || x.status === "transferable" || x.status === "through");
    const coreGaps = core.filter(x => x.status === "gap" || x.status === "thin").sort((a, b) => b.w - a.w);
    return { key: fitKey(level), resume: state.resume.text, roleId: role.id, level, r, slice, bands, group, band, bandNext, evid, trans, through, thin, presumed, gaps, core, coreHave, coreGaps, extra, label };
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
    const all = { share: ['<i class="b"></i>', "% of postings that ask for the skill"], defining: ["◆", "sets this role apart from other roles"], grows: ["↗", "asked more at senior levels"], have: ['<i class="b g"></i>', "already on your resume"], gap: ['<i class="b a"></i>', "a gap this role requires"], presumed: ["◌", "presumed from a role you held, not shown on your resume"], known: ["✓", "you got it right in a game"], other: ["⟲", "on your resume in other words; postings say it differently"], through: ["⤷", "a way of working, shown through a skill on your resume"] };
    return `<section class="rs"><h3 class="rh">How to read this</h3><div class="legend">${rows.map(k => `<span class="k">${all[k][0]}</span><span>${all[k][1]}</span>`).join("")}</div></section>`;
  }
  // The cohort application (v18, step 1): one box everywhere the waitlist was (the rail's three placeholders, the fit
  // screen's foot, the start screen, the class picker's foot), its copy the pure table Apply beside Stage. The email,
  // the optional sentence, where the click was and the role on screen go to the waitlist table through web/capture.js,
  // with the stage, the program group and the fields picked; "Applied" stays in this browser (the sources applied from
  // are kept in localStorage, never the email or the sentence). The atlas promises nothing it does not do itself.
  const joined = () => store.get("waitlist") || {};
  // opts.always: drawn whether or not state.wait names it (the fit screen, the start screen, the picker); opts.role_id:
  // the role to record instead of the role screen's (the picker's chosen role)
  function applyBox(what, opts) {
    opts = opts || {};
    if (!opts.always && state.wait !== what) return "";
    const done = !!joined()[what];
    const form = done ? `<p class="small" style="margin:6px 0 0"><b>${esc(Apply.done)}</b></p>` : `<form class="apply-form" data-wait-form="${esc(what)}"${opts.role_id ? ` data-wait-role="${esc(opts.role_id)}"` : ""}><input type="email" required placeholder="you@cornell.edu" aria-label="Your email" autocomplete="email"><input type="text" maxlength="200" placeholder="${esc(Apply.noteLabel)}" aria-label="${esc(Apply.noteLabel)} (optional, 200 characters)" autocomplete="off"><button type="submit" class="btn primary">${esc(Apply.button)}</button></form>`;
    return `<div class="wait apply"><b>${esc(Apply.heading)}</b><p class="small">${esc(Apply.line)}</p>${form}<p class="small muted" style="margin:6px 0 0">${esc(Apply.privacy)}${opts.always || done ? "" : ' <a href="#/" data-wait-close>Not now</a>'}</p></div>`;
  }
  const waitHtml = what => applyBox(what);
  // the forms inside `el`: on submit the email and the sentence go out once, the box says so, and `redraw` draws the
  // screen again
  function wireWait(el, redraw) {
    el.querySelectorAll("[data-wait-form]").forEach(f => f.onsubmit = async e => {
      e.preventDefault(); const what = f.dataset.waitForm, input = f.querySelector("input[type=email]"), note = f.querySelector("input[type=text]"), btn = f.querySelector("button");
      if (!input.value.trim()) return; btn.disabled = true; btn.textContent = "Applying…";
      const ctx = { ...waitCtx(), ...(f.dataset.waitRole ? { role_id: f.dataset.waitRole } : {}), note: note ? note.value : "" };
      const ok = window.Capture ? await Capture.waitlist(input.value, what, ctx) : false;
      if (ok) { store.set("waitlist", { ...joined(), [what]: new Date().toISOString().slice(0, 10) }); redraw(); }   // the box stays, now saying "Applied"
      else { btn.disabled = false; btn.textContent = Apply.button; input.setCustomValidity("That did not go through. Check the address and try again."); input.reportValidity(); input.oninput = () => input.setCustomValidity(""); }
    });
  }
  // the open postings of this view that ask for a skill, as links (decision 8 of the pass: shown to a person with a resume)
  function postingLinks(R, slice, id, n) {
    const open = slice.filter(j => j.open && j.url && j.skills.includes(id)).slice(0, n || 3);
    return open.length ? `<span class="plinks">Postings asking for it: ${open.map(j => `<a href="${esc(j.url)}" target="_blank" rel="noopener" data-posting="${esc(R.role.id)}" title="${esc(j.title)}">${esc(j.company)} ↗</a>`).join(" · ")}</span>` : "";
  }
  function railHtml(R, g, fit, stats, open) {
    const role = R.role, y = state.you || {}, stage = y.stage;
    const painted = !!fit && state.match && state.match.roleId === role.id;
    const legend = legendHtml(["share", ...(role.definingList.length ? ["defining"] : []), "grows", ...(state.known && state.known.size ? ["known"] : []), ...(painted ? ["have", "gap", ...(fit.presumed.length ? ["presumed"] : []), ...(fit.trans.length ? ["other"] : []), ...(fit.through && fit.through.length ? ["through"] : [])] : [])]);
    const acts = (extra = "") => `<section class="rs"><h3 class="rh">${fit ? "Then" : "Do something with this"}</h3><div class="acts">${extra}<a href="#/play/${PRACTISE}?role=${encodeURIComponent(role.id)}">Practise this role <span>· 2 min</span></a><a href="#/role/${esc(role.id)}/course">Check a course against this role <span>→</span></a><span class="act">Going to a ${esc(g.label.toLowerCase())} event? <span>${EVENTS.map(([k, t]) => `<a href="#/field/${esc(role.group)}/event?${k}">${esc(t.toLowerCase().replace(" or case competition", ""))}</a>`).join(" · ")}</span></span>${window.ClassScreens ? `<a href="#/classes?role=${encodeURIComponent(role.id)}">${esc((window.ClassScreens.termLabel && ClassScreens.termLabel()) || "Spring 2027")} classes that fit this role <span>→</span></a>` : ""}</div></section>`;
    const drop = `<div class="drop" id="drop"><p><b>Drop a PDF, DOCX or TXT</b> or <label class="link" for="file">choose a file</label></p><input type="file" id="file" accept=".pdf,.docx,.txt,.md" hidden><p class="small muted" id="file-status"></p></div><textarea id="paste" rows="3" aria-label="Resume text" placeholder="Or paste the text of your resume"></textarea><p style="margin-top:8px"><button type="button" class="btn primary" id="rail-read">Read my fit →</button></p>`;
    if (!state.resume) {
      if (!y.where && !y.stage) return legend + `<section class="rs"><h3 class="rh">How do you fit?</h3><p>Drop your resume and this panel reads it against these postings. Nothing leaves your browser.</p>${drop}<p><a href="#/you">Or answer two questions</a> to start from your program and the fields you like.</p></section>` + acts();
      // answers, no resume: the rail speaks from them (the stage decides what comes first)
      const nEntry = open.filter(j => Atlas.stepOf(j) === "entry"), nIntern = nEntry.filter(j => j.intern).length;
      const countBy = jobs => { const c = {}; for (const j of jobs) c[j.company] = (c[j.company] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([c]) => c); };
      const entryEmps = countBy(nEntry).slice(0, 4), topEmps = countBy(R.jobs.filter(j => j.open)).slice(0, 3).filter(c => !entryEmps.includes(c));
      const picked = (y.fields || []).includes(role.group) ? `This role is in ${esc(g.label)}, a field you picked. ` : "";
      const facts = `${picked}You are looking at the entry grade: <b>${fmt(nEntry.length)} open ${nEntry.length === 1 ? "posting" : "postings"}</b>${nIntern ? `, ${nIntern} of them internships` : ""}.${entryEmps.length ? ` Entry-grade employers now: ${esc(join(entryEmps))}.` : ""}${topEmps.length ? ` Across all levels ${esc(join(topEmps))} hire the most.` : ""}`;
      const ask = stage === "targeting" ? "Add your resume to see the gaps between it and this role." : "Add your resume to see which of these skills you already show and which are gaps.";
      const strip = `<div class="strip"><span class="dotg"></span><span>${[y.where ? esc(WHERE_SHORT[y.where]) : null, stage ? esc(STAGE_SHORT[stage]) : null, (y.fields || []).length ? `<b>${esc(join((y.fields || []).map(id => ((state.ixGroups || []).find(x => x.id === id) || { label: id }).label)))}</b>` : null].filter(Boolean).join(" · ")}</span><a href="#/you">Edit</a></div>`;
      const blocks = { facts: `<p>${facts}</p>`, ask: `<p>${ask}</p>`, drop, "gaps-drop": drop };
      const body = Stage.railBlocks(stage, false).filter(k => blocks[k]).map(k => blocks[k]).join("");
      return legend + `<section class="rs"><h3 class="rh">For you</h3>${strip}${body}</section>` + acts();
    }
    if (!fit) return legend + `<section class="rs"><h3 class="rh">Your fit · ${esc(state.resume.name)}</h3><p class="small muted">Reading your resume against these postings…</p></section>` + acts();
    // the resume is read: the band, one sentence, every gap among the skills most postings ask for
    const { band, bandNext, core, coreHave, coreGaps, bands, group } = fit;
    const scale = band ? `<div class="band">${BANDS.map(([k], i) => `<i class="${k === band ? "on" : i < BANDS.findIndex(b => b[0] === band) ? "past" : ""}"></i>`).join("")}</div><div class="bandl">${BANDS.map(([k, l]) => `<span class="${k === band ? "on" : ""}">${l}</span>`).join("")}</div>` : `<p class="small muted">${esc((bands.no_bands || {})[group] ? "Our sample of resumes for this group of roles is too small to set a band of fit." : "This group of roles has no band of fit yet.")}</p>`;
    const P = postingFor(role.id), pAsks = P ? new Set([...P.found].filter(k => R.skillById[k] && R.skillById[k].cluster !== "credentials")) : null, pSum = pAsks ? postingSummary(pAsks, fit) : null;
    const postingLine = pSum ? `<p class="lead-rail posting"><b class="g">${pSum.n}</b> of the ${pSum.m} skills <a href="#/role/${esc(role.id)}/fit">this posting</a> asks for are on your resume.</p>` : "";
    const line = (core.length ? `<p class="lead-rail">You show <b class="g">${coreHave.length}</b> of the ${core.length} skills most postings ask for${coreGaps.length ? `; <b class="a">${coreGaps.length}</b> ${coreGaps.length === 1 ? "is a gap" : "are gaps"}` : ""}.</p>` : `<p class="small muted">Few postings match this view; widen the filters.</p>`);
    const slotWhy = x => x.slot === "__domain" ? `Name an industry you have worked in; these postings are in ${fit.r.industries.slice(0, 3).map(d => esc(d.name)).join(", ")}.` : x.slot === "__ai" ? `Show one line of AI work: ${fit.r.ai.map(k => esc(R.skillById[k] ? R.skillById[k].name : k)).join(", ")}.` : "";
    const gc = gapClassesFor(fit, R, () => showAside(null));
    const classLinks = id => { const cs = gc && gc.byGap && gc.byGap[id]; return cs && cs.length ? `<span class="plinks">Classes that cover it: ${cs.slice(0, 3).map(c => `<a href="#/classes?role=${encodeURIComponent(role.id)}&open=${encodeURIComponent(c.code)}">${esc(c.code)}</a>`).join(" · ")}</span><br>` : ""; };
    const gapRow = x => { const openRow = state.gapOpen === x.slot; const gt = gapText(R, x, fit); const ex = slotWhy(x) || (gt ? `${esc(gt.gap)}${x.kind !== "behaviour" ? ` A line that shows it: <em>“${esc(gt.line.text)}”</em>` : ""}` : (x.build && x.build[0] ? stepHtml(x.build[0]) : "Open the skill for how postings say it.")); return `<li class="${openRow ? "open" : ""}"><button type="button" class="t" data-gap="${esc(x.slot)}"><span>${esc(x.slotName)}</span><span class="n">${pct(x.w)}</span></button>${openRow ? `<div class="ex">${ex}${R.skillById[x.id] ? `<br>${classLinks(x.id)}${postingLinks(R, fit.slice, x.id, 3)}` : ""}<br><button type="button" class="linkish link" data-wait="show">Help me show this →</button>${R.skillById[x.id] ? ` · <button type="button" class="linkish link" data-skill="${esc(x.id)}">Open the skill</button>` : ""}</div>` : ""}</li>`; };
    // the classes that cover the most core gaps (step 3 of the pass): three links into the picker with the course open;
    // when the roster cannot be read here, one line from the campus file and the picker's link
    const termName = esc((window.ClassScreens && ClassScreens.termLabel()) || "Spring 2027");
    const classesBlock = !coreGaps.length ? "" : !gc ? `<h3 class="rh" style="margin-top:14px">Classes that cover your gaps</h3><p class="small muted">Reading the ${termName} roster against your gaps…</p>`
      : gc.closed ? `<h3 class="rh" style="margin-top:14px">Classes that cover your gaps</h3><p class="small muted">${esc(gc.closed)} <a href="#/classes?role=${encodeURIComponent(role.id)}">${termName} classes →</a></p>`
      : gc.top && gc.top.length ? `<h3 class="rh" style="margin-top:14px">Classes that cover your gaps</h3><ul class="gaps classes">${gc.top.map(c => `<li><a class="t" href="#/classes?role=${encodeURIComponent(role.id)}&open=${encodeURIComponent(c.codes[0])}"><span>${esc(c.codes[0])} · ${esc(c.title)}</span><span class="n">${c.covered.length}</span></a><div class="ex">Covers ${esc(c.covered.map(g => g.name).join(", "))}</div></li>`).join("")}</ul><p class="small muted" style="margin-top:6px"><a href="#/classes?role=${encodeURIComponent(role.id)}">All ${termName} classes, sorted by gaps covered →</a></p>`
      : gc.failed ? "" : `<h3 class="rh" style="margin-top:14px">Classes that cover your gaps</h3><p class="small muted">No ${termName} class names one of your gaps in its description. <a href="#/classes?role=${encodeURIComponent(role.id)}">See the roster →</a></p>`;
    const gapsHtml = coreGaps.length ? `<h3 class="rh" style="margin-top:14px">Needs more evidence</h3><ul class="gaps">${coreGaps.map(gapRow).join("")}</ul>${waitHtml("show")}${bandNext && bandNext !== band ? `<p class="small muted" style="margin-top:8px">Evidence ${coreGaps.length === 1 ? "that one" : "the top three"} and your resume reads as “${bandName(bandNext)}”.</p>` : ""}${classesBlock}` : `<p class="small muted" style="margin-top:10px">Nothing important missing: you show every skill most postings ask for.</p>`;
    const n = fit.evid.length + fit.trans.length;
    const you = `<section class="rs"><h3 class="rh">Your fit · ${esc(state.resume.name)} · <a href="#/you?step=3">change</a></h3>${scale}${postingLine}${line}${gapsHtml}<p style="margin-top:12px"><a href="#/role/${esc(role.id)}/fit">See all ${n} ${n === 1 ? "skill" : "skills"} on your resume, matched to this role →</a></p></section>`;
    return legend + you + acts(`${coreGaps.length ? `<a href="#/play/${PRACTISE}?role=${encodeURIComponent(role.id)}&skills=${encodeURIComponent(coreGaps.slice(0, 8).map(x => x.id).filter(k => R.skillById[k]).join(","))}">Practise your gaps <span>· 2 min</span></a>` : ""}<a href="#/" data-wait="build">Build these skills <span>· Cohort 1</span></a><a href="#/" data-wait="ways">Ways to show your skills <span>· Cohort 1</span></a>${waitHtml("build")}${waitHtml("ways")}`);
  }
  function wireRail() {
    if ($("#drop")) { wireResumeForm(); const b = $("#rail-read"); if (b) b.onclick = async () => { if (await takeResume()) { state.fit = null; keepScroll(renderRole); } else $("#file-status").textContent = "Add a file or paste some text first."; }; }
    aside.querySelectorAll("[data-gap]").forEach(b => b.onclick = () => { state.gapOpen = state.gapOpen === b.dataset.gap ? null : b.dataset.gap; showAside(null); });
    aside.querySelectorAll("[data-wait]").forEach(b => b.onclick = e => { e.preventDefault(); state.wait = state.wait === b.dataset.wait ? null : b.dataset.wait; showAside(null); });
    aside.querySelectorAll("[data-wait-close]").forEach(b => b.onclick = e => { e.preventDefault(); state.wait = null; showAside(null); });
    wireWait(aside, () => showAside(null));
    aside.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }));
  }
  const PERSONA = {
    experienced_in_role: (p, field) => `Your resume reads as a <b>${esc(Matcher.LADDER_LABEL[p.level])}</b> ${esc(field)} profile: ${fmtYears(p.pmYears)} in the role, ${fmtYears(p.years)} of work overall.`,
    pivoter: (p, field) => `Your resume reads as a <b>move into ${esc(field)}</b> from ${p.backgrounds.length ? esc(p.backgrounds.map(b => Matcher.VIA_LABEL[b] || b).join(", ")) : "another field"}: ${fmtYears(p.years)} of work, none yet under this role's title.`,
    new_to_role: (p, field) => `Your resume reads as <b>early-career, new to ${esc(field)}</b>${p.pmIntern ? " with an internship in the role" : ""}${p.years >= 1 ? `, ${fmtYears(p.years)} of other work` : ""}.`,
  };
  const fmtYears = y => y < 1 ? "under a year" : `${Math.round(y * 2) / 2} years`;
  async function fitScreen(id) {
    const g = await loadRole(id); const R = state.R, role = R.role;
    crumbs([["Explore", "#/explore"], [g.label, "#/field/" + g.id], [role.label, "#/role/" + role.id], ["Your fit", null]]);
    if (!state.resume) {
      page(`<p class="eyebrow">Your fit · ${esc(role.label)}</p><h1>Add your resume</h1><p class="lead">We read it in your browser against what ${esc(role.label)} postings ask for. Nothing is uploaded.</p>${resumeForm()}<div class="row" style="margin-top:12px"><button type="button" class="btn primary" id="go">Read my fit →</button><a class="btn quiet" href="#/role/${esc(role.id)}">← Back to the role</a></div>`, true);
      showAside(null); wireResumeForm();
      $("#go").onclick = async () => { if (await takeResume()) fitScreen(id); else $("#file-status").textContent = "Add a file or paste some text first."; };
      return;
    }
    const level = state.fitLevel || state.level;
    const f = fitFor(level) || (state.fit = await computeFit(R, level));
    if (fitScreen.tracked !== role.id) { fitScreen.tracked = role.id; track("fit", { role_id: role.id }); }   // once per role per visit
    // a pasted posting on file for this role (PLAN.md v16, step 9): the skills it names come first, marked; the band
    // stays the role's (one document, a band calibrated on the role)
    const P = postingFor(role.id), asks = P ? new Set([...P.found].filter(k => R.skillById[k] && R.skillById[k].cluster !== "credentials")) : null;
    const { r, band, evid, trans, thin, presumed, gaps, core, extra } = f, through = f.through || [], coreHave = f.coreHave.length;
    const field = g.label.toLowerCase();
    const p = r.profile;
    const gcF = gapClassesFor(f, R, () => { if (location.hash.endsWith("/fit")) keepScroll(() => fitScreen(id)); });
    const verdict = band ? `<p class="small">${bandName(band)} ${tip("Bands come from how 300 sample resumes of people in and outside the role score. There is no pass mark; a band says how your resume reads next to theirs.")}</p>` : "";
    const st = r.standing;
    const standing = st ? `<p class="small">You held this role ${st.above ? `above this level (${esc(Matcher.LADDER_LABEL[st.level])}, ${fmtYears(st.years)})` : `at this level for ${fmtYears(st.years)}`}${st.employers.length ? `, and we hold ${esc(st.employers[0])}'s own postings` : ""}. ${st.presumed ? `<b>${st.presumed}</b> ${st.presumed === 1 ? "requirement is" : "requirements are"} presumed from that; your resume does not show ${st.presumed === 1 ? "it" : "them"}.` : ""}</p>` : "";
    const unread = r.parsed.roles.length === 0 && r.parsed.lines >= 15 ? `<div class="notice"><b>We found no jobs with dates in this text.</b> Roles and years are not counted. Put each job title and its dates on one line, for example "Analyst, Acme, 2021 – 2024".</div>` : "";
    const placeholder = r.parsed.placeholderDates && r.parsed.roles.some(x => x.placeholder) ? `<div class="notice"><b>Some dates in this text are placeholders ("20XX").</b> We read those jobs, but we cannot count their years.</div>` : "";
    // the two slots that stand for a group of skills get plain words: which industry, which kind of AI work
    const slotWhy = x => x.slot === "__domain" ? ` Name an industry you have worked in. These postings are in: ${r.industries.slice(0, 4).map(d => esc(d.name)).join(", ")}. One is enough.` : x.slot === "__ai" ? ` Show one line of AI work: ${r.ai.map(k => esc(R.skillById[k] ? R.skillById[k].name : k)).join(", ")}.` : "";
    const tag = (x, cls) => R.skillById[x.id] ? `<button type="button" class="tag ${cls}" data-skill="${esc(x.id)}">${esc(x.slotName)}${cls === "amber" ? ' <span class="subtle">(said in other words)</span>' : ""}</button>` : `<span class="tag ${cls}">${esc(x.slotName)}</span>`;
    const yoeAsk = r.creds.filter(c => c.id.startsWith("yoe_")).sort((a, b) => b.w - a.w)[0];
    const creds = r.creds.filter(c => !c.id.startsWith("yoe_"));
    if (yoeAsk) creds.unshift({ name: `${yoeAsk.name.replace(" experience", "")} experience asked (you: ${fmtYears(p.years)})`, w: yoeAsk.w, have: yoeAsk.have });
    const credLine = creds.length ? `<p class="small">${creds.map(c => `<span class="${c.have ? "" : "muted"}" style="${c.have ? "color:var(--primary)" : ""}">${c.have ? "✓" : "○"} ${esc(c.name)}</span>`).join(" · ")}</p>` : "";
    const indLine = r.industries.length ? `<p class="small muted">Industries hiring for this: ${r.industries.slice(0, 8).map(d => `<span style="${d.have ? "color:var(--primary)" : ""}">${d.have ? "✓ " : ""}${esc(d.name)} ${pct(d.w)}</span>`).join(" · ")}. One industry is enough; the others are context, not gaps.</p>` : "";
    const sayIt = trans.length ? disc("sayit", `Say it in ${esc(field)} words (${trans.length})`, `<ul class="plain">${trans.slice(0, 5).map(x => { const gt = gapText(R, x, f); return `<li><b>${esc(x.slotName)}</b>${x.lines[0] ? `<br>“${esc(x.lines[0].text.slice(0, 160))}”` : ""}${gt && gt.reads ? `<br>In ${esc(field)} this means: ${esc(gt.reads)}` : ""}${gt ? `<br>Postings say it like: <b>${esc(gt.line.text)}</b>` : ""}</li>`; }).join("")}</ul>`) : "";
    const thinNamed = evid.filter(x => !x.depth);
    const thinDisc = thinNamed.length ? disc("thin", `Shown, but without specifics (${thinNamed.length})`, `<p class="small muted">You show these, but not with the specifics or outcomes postings ask about.</p><ul class="plain">${thinNamed.slice(0, 5).map(x => { const gt = gapText(R, x, f); return `<li>${esc(x.name)}${gt ? ` — ${esc(gt.thin)}` : ""}${(R.subs[x.id] || []).filter(s => !r.subs.has(s.id)).length ? ` Mention: ${(R.subs[x.id] || []).filter(s => !r.subs.has(s.id)).slice(0, 3).map(s => esc(s.name)).join(" · ")}` : ""}</li>`; }).join("")}</ul>`) : "";
    const unmapped = r.unmapped.length ? disc("unmapped", `${r.unmapped.length} lines we could not read as a skill`, `<ul class="plain">${r.unmapped.map(t => `<li class="muted">${esc(t)}</li>`).join("")}</ul>`) : "";
    // two ranked columns (owner's choice F2): what you show and what is still to show, five each at rest, ranked by
    // how many postings ask, the bar for weight; a mark says "said in other words" or "presumed from a role you held"
    const fitRow = x => {
      const k = x.status === "evidenced" ? "have" : x.status === "transferable" ? "have" : x.status === "through" ? "have" : x.status === "presumed" ? "thin" : x.status === "thin" ? "thin" : "gap";
      const mark = x.status === "through" ? `<span class="mark" data-measure="⤷ shown through ${esc(x.throughName || "")}: a way of working is never a line of its own; the line on your resume about ${esc(x.throughName || "that skill")} shows it.">⤷</span>` : x.status === "transferable" ? `<span class="mark" data-measure="⟲ said in other words: your resume shows this in another field's words. Postings here say it differently; see Details for how.">⟲</span>` : x.status === "presumed" ? `<span class="mark" data-measure="◌ presumed: people who hold the role you held do this, so it earns part credit; your resume does not show it.">◌</span>` : x.status === "thin" ? `<span class="mark" data-measure="○ named, not shown: listed as a word, but no work, project or course line shows it.">○</span>` : "";
      const pmark = asks && asks.has(x.id) ? `<span class="ptag" data-measure="This posting asks for it: the text you pasted names ${esc(x.slotName)}.">this posting asks for it</span>` : "";
      const inner = `<span class="nm">${esc(x.slotName)}${mark}${pmark}</span><span class="bar" data-measure="${pct(x.w)} of the postings in this view ask for ${esc(x.slotName)}${x.tier === "core" ? ", most of them" : ""}."><i style="width:${Math.round(x.w * 100)}%"></i></span>`;
      const cs = k === "gap" && gcF && gcF.byGap && gcF.byGap[x.id];
      const classes = cs && cs.length ? `<span class="plinks">Classes that cover it: ${cs.slice(0, 3).map(c => `<a href="#/classes?role=${encodeURIComponent(role.id)}&open=${encodeURIComponent(c.code)}">${esc(c.code)}</a>`).join(" · ")}</span>` : "";
      const links = [classes, k === "gap" && R.skillById[x.id] ? postingLinks(R, f.slice, x.id, 2) : ""].filter(Boolean).join("<br>");
      return (R.skillById[x.id] ? `<button type="button" class="srow ${k}" data-skill="${esc(x.id)}">${inner}</button>` : `<div class="srow ${k}">${inner}</div>`) + (links ? `<p class="small muted plinks-row">${links}</p>` : "");
    };
    const col = (key, title, items, empty, foot) => { const more = state.fitMore.has(key), shown = more ? items : items.slice(0, 5); return `<div><h3>${title} <span class="n">${items.length}</span></h3>${items.length ? `<div class="srows">${shown.map(fitRow).join("")}</div>${items.length > 5 ? `<button type="button" class="linkish link more" data-fitmore="${key}">${more ? "Show fewer" : `+${items.length - 5} more`}</button>` : ""}` : `<p class="small muted">${empty}</p>`}${foot || ""}</div>`; };
    const byPosting = (a, b) => (asks ? (asks.has(b.id) - asks.has(a.id)) : 0) || b.w - a.w;
    const showItems = [...evid, ...trans, ...through].sort(byPosting).concat(presumed), stillItems = [...gaps, ...thin].map(x => x).sort(byPosting);
    const sayLink = trans.length ? `<p class="small" style="margin-top:8px"><button type="button" class="linkish link" id="say-it">Say it in ${esc(field)} words</button></p>` : "";
    const showTab = `<div class="fitcols">${col("show", "Already on your resume", showItems, "Nothing yet.", sayLink)}${col("gaps", "Needs more evidence", stillItems, "Nothing among the skills most postings ask for.")}</div>`;
    const detailTab = `${sayIt}${thinDisc}<h3>Credentials and industries</h3>${credLine + indLine || '<p class="small muted">None asked for in this view.</p>'}${unmapped}`;
    const FTABS = [["show", "Skills", null], ["details", "Details", null]];
    const fitTabs = `<div class="tabs" role="tablist">${FTABS.map(([k, l, n]) => `<button type="button" role="tab" class="${state.fitTab === k ? "on" : ""}" aria-selected="${state.fitTab === k}" data-ftab="${k}">${l}${n != null ? `<span class="n">${fmt(n)}</span>` : ""}</button>`).join("")}</div>`;
    const fitBody = state.fitTab === "details" ? detailTab : showTab;
    const ctx = `<div class="row between fit-top"><p class="eyebrow">Your fit · ${esc(role.label)}${extra.length ? " · " + esc(extra.join(", ")) : ""}</p><span class="small muted ctx"><select id="fit-level" aria-label="Level">${["all", ...Atlas.STEPS].map(s => `<option value="${s}"${level === s ? " selected" : ""}>${s === "all" ? "All levels" : esc(R.stepLabels[s])}</option>`).join("")}</select> · ${esc(state.resume.name)} · <a href="#/role/${esc(role.id)}/fit" id="change">change</a></span></div>`;
    // "Have a posting? Paste it." under the resume: a drop-or-paste box; with one on file, what it asks for and the count
    const pSum = asks ? postingSummary(asks, f) : null;
    const postingBox = `<div class="posting-box">${P ? `<p class="small"><b>${esc(P.name)}</b>: this posting asks for ${pSum.m} ${pSum.m === 1 ? "skill" : "skills"} of this role; <b>${pSum.n}</b> ${pSum.n === 1 ? "is" : "are"} on your resume. Those come first below, marked. <button type="button" class="linkish link" id="posting-change">Paste another</button> · <button type="button" class="linkish link" id="posting-forget">Forget it</button></p>` : `<details class="disc" id="posting-disc"${state.postingOpen ? " open" : ""}><summary>Have a posting? Paste it.</summary><div class="disc-body"><p class="small muted">We read it in your browser, like a syllabus: the skills it names come first in the lists below, with your resume's status for each. The band stays the role's. Nothing is uploaded.</p>${postingForm()}<div class="row" style="margin:10px 0 4px"><button type="button" class="btn primary" id="go">Read the posting →</button></div></div></details>`}</div>`;
    page(`${ctx}${unread}${placeholder}${verdict}
      <p class="lead">${PERSONA[p.persona](p, field)} You show <b>${coreHave} of ${core.length}</b> skills that most ${esc(role.label)} postings ask for.</p>${standing}${postingBox}
      ${fitTabs}${fitBody}
      <div class="fit-wait">${applyBox("fit", { always: true })}</div>
      <p class="small muted" style="margin-top:20px"><a href="#/role/${esc(role.id)}">← Back to ${esc(role.label)}</a>, with your fit marked on every skill.</p>`);
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
    return `<div class="drop" id="drop"><p><b>Drop the posting (PDF, DOCX or TXT)</b> or <label class="link" for="file">choose a file</label></p><input type="file" id="file" accept=".pdf,.docx,.txt,.md" hidden><p class="small muted" id="file-status"></p></div>
      <p class="small muted">Or paste the posting's text:</p><textarea id="paste" rows="6" aria-label="Posting text" placeholder="Senior Financial Analyst, FP&amp;A. You will own the monthly forecast, build driver-based models…"></textarea>`;
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
    crumbs([["Explore", "#/explore"], [g.label, "#/field/" + g.id], [role.label, "#/role/" + role.id], ["Check a course", null]]);
    if (!state.course) { const saved = store.get("course"); if (saved) state.course = { ...saved, found: new Set(saved.found) }; }
    const c = state.course && state.course.roleId === role.id ? state.course : null;
    // what a course can show, by kind (PLAN.md v14, decision 5); a course saved before the split is split here
    const split = c ? (c.teaches ? { teaches: c.teaches, named: c.named } : Atlas.courseSplit(c.found, R.skillById)) : null;
    const form = `<div class="drop" id="drop"><p><b>Drop a syllabus (PDF, DOCX or TXT)</b> or <label class="link" for="file">choose a file</label></p><input type="file" id="file" accept=".pdf,.docx,.txt,.md" hidden><p class="small muted" id="file-status">${c ? `Read: ${esc(c.name)}.` : ""}</p></div>
      <p class="small muted">Or paste the course description, the list of topics or the week-by-week plan:</p><textarea id="paste" rows="6" aria-label="Course text" placeholder="FIN 620 Corporate Financial Planning. Topics: budgeting cycles, rolling forecasts, variance analysis…">${c ? esc(c.text) : ""}</textarea>
      <div class="row" style="margin:12px 0 4px"><button type="button" class="btn primary" id="go">Read the course →</button><span class="small muted">Nothing is uploaded.</span></div>`;
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
      const namedHtml = named.length ? `<h2>Named, but a course cannot show these</h2><div class="tags">${named.map(x => `<button type="button" class="tag" data-skill="${esc(x.id)}">${esc(x.name)} <span class="subtle">${pct(x.share)}</span></button>`).join("")}</div><p class="small muted">${esc(T5.how("behaviour"))} A course shows craft; how you work is shown through work, on <a href="#/role/${esc(role.id)}/fit">your fit</a>.</p>` : "";
      result = taught.length || named.length ? `${taught.length ? `<h2>This course teaches</h2><div class="tags">${taught.map(tagOf).join("")}</div>
        <p class="small muted">${coreTaught.length} of the ${core.filter(showable).length} skills that most ${esc(role.label)} postings ask for and a course can show.${gapsCovered.length ? ` It covers ${gapsCovered.length === 1 ? "one" : gapsCovered.length} of your gaps: ${gapsCovered.map(x => esc(x.name)).join(", ")}.` : m ? " It covers none of your gaps for this role." : ` <a href="#/role/${esc(role.id)}/fit">Check your fit</a> to see which of your gaps it covers.`} The share is how many postings ask for the skill.</p>` : `<p class="notice">The text names no skill a course can show for this role.</p>`}${namedHtml}
        ${notTaught.length ? `<h2>It does not cover</h2><div class="tags">${notTaught.map(x => `<button type="button" class="tag bad" data-skill="${esc(x.id)}">${esc(x.name)}${x.defining ? " ◆" : ""}</button>`).join("")}</div><p class="small muted">Craft most postings ask for that the text does not name. A course can teach a skill without naming it the way postings do; open a skill to see how postings say it.</p>` : ""}
        <h2>On the skills list</h2><p class="small muted">Green: the course names it. Amber: most postings ask for it and the course does not name it. Ways of working are not painted: a course cannot show them.</p>${flatSkills(R, slice, state.paint)}` : `<div class="notice"><b>We found none of this role's skills in that text.</b> ${c.lines < 3 ? "The text is very short; paste the topics or the week-by-week plan." : "Paste the list of topics, or check that the text is a course description."}</div>`;
    }
    page(`<p class="eyebrow">Check a course · ${esc(role.label)}</p><h1>Check a course</h1><p class="lead">Drop a syllabus or paste the course description. We read it in your browser against the skills ${esc(role.label)} postings ask for.</p>${form}${result}<p class="small muted" style="margin-top:12px"><a href="#/role/${esc(role.id)}">← Back to ${esc(role.label)}</a></p>`);
    wireFileDrop(async text => { const r = await Atlas.readCourse(text.text); track("course_read", { role_id: role.id }); state.course = { roleId: role.id, name: text.name, text: text.text, found: r.found, teaches: r.teaches, named: r.named, ev: r.ev, lines: r.lines }; store.set("course", { roleId: role.id, name: text.name, text: text.text, found: [...r.found], ev: {}, lines: r.lines }); courseScreen(id); });
    main.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }, true));
    renderAside();
  }
  // a drop zone plus a paste box, for any text; `onText({ text, name })` runs when the person clicks the button
  function wireFileDrop(onText) {
    wireResumeForm();
    $("#go").onclick = async () => {
      const pasted = ($("#paste") || {}).value || "";
      const r = pasted.trim().length >= 20 ? { text: pasted, name: "pasted text" } : pending ? pending : null;
      if (!r) { $("#file-status").textContent = "Add a file or paste some text first."; return; }
      pending = null; await onText(r);
    };
  }

  // ---------- 7. prepare for an event: who is in the room, what to say, what to build ----------
  const EVENTS = [["networking", "Networking event", "Which roles will be in the room and what to ask them."], ["roundtable", "Employer roundtable", "Which of your experiences to bring up, role by role."], ["hackathon", "Hackathon or case competition", "What to build so it shows a skill these roles ask for."]];
  async function eventScreen(gid) {
    const ix = await Atlas.index(); const g = ix.groups.find(x => x.id === gid);
    const GENERIC = await Atlas.genericSkills();
    if (!g) return explore();
    if (g.set === "product") await Atlas.product();
    const kind = (location.hash.split("?")[1] || "networking").split("&")[0];
    crumbs([["Explore", "#/explore"], [g.label, "#/field/" + g.id], ["Prepare for an event", null]]); showAside(null);
    const roles = g.roles.map(r => ix.roles[r]).sort((a, b) => b.nOpen - a.nOpen);
    const nameOf = id => (ix.skillById[id] || (productNames ? { name: productNames[id] } : null) || { name: id }).name;
    // what sets a role apart: its defining skills, else its most asked skills that are not generic to every role
    const marks = r => (r.definingList.length ? r.definingList : r.asks.filter(a => !GENERIC.has(a.id) && ix.skillById[a.id] && !["credentials", "domain"].includes(ix.skillById[a.id].cluster))).slice(0, 2).map(a => a.id);
    const rg = state.resume ? await rough() : null;
    const coreOf = r => r.asks.filter(a => a.share >= Atlas.TIER.core && ix.skillById[a.id] && ix.skillById[a.id].cluster !== "credentials").map(a => a.id);
    const chips = `<div class="chips">${EVENTS.map(([k, t]) => `<a class="chip${kind === k ? " on" : ""}" href="#/field/${esc(g.id)}/event?${k}">${t}</a>`).join("")}</div>`;
    let body = "";
    if (kind === "networking") {
      body = `<h2>Who will be in the room</h2><p class="small muted">The ${esc(g.label.toLowerCase())} roles by how many postings are open now, with the one or two skills that set each apart. Ask about those.</p>
        <div class="list">${roles.map(r => `<a class="r" href="#/role/${esc(r.id)}"><span class="t">${esc(r.label)}</span><span class="n">${fmt(r.nOpen)} open</span><span class="m">Ask about: ${marks(r).map(id => esc(nameOf(id).toLowerCase())).join(", ") || "what a week looks like"}</span></a>`).join("")}</div>
        <h2>What to say about yourself</h2>${rg ? sayAboutYou(roles, rg, coreOf, nameOf, GENERIC) : `<p class="small muted"><a href="#/you">Add your resume</a> and we list the three skills you show that most of these roles ask for.</p>`}
        <h2>Employers hiring for these roles now</h2><div id="employers"><p class="small muted">Loading the postings of this field…</p></div>`;
    } else if (kind === "roundtable") {
      // owner's choice E5: the resume lines once at the top, then one card per role, the first open
      body = `${rg ? `<h2>Your lines for the room</h2><div id="yourlines"><p class="small muted">Reading your resume against these roles…</p></div>` : ""}
        <h2>Role by role</h2><p class="small muted">${rg ? "What to lead with for each role, and what they may ask about that your resume does not show." : `<a href="#/you">Add your resume</a> and we match your lines to each role. Without it, here is what most postings of each role ask for.`}</p>
        <div id="roundtable">${roles.map((r, i) => rg ? '' : `<details class="empbox"${i === 0 ? " open" : ""}><summary><span class="t">${esc(r.label)}</span><span class="n">${fmt(r.nOpen)} open</span><span class="m">Most postings ask for ${join(coreOf(r).filter(id => !GENERIC.has(id)).slice(0, 3).map(id => esc(nameOf(id))))}</span></summary><div class="box-body"><p class="small muted">Most postings ask for: ${coreOf(r).filter(id => !GENERIC.has(id)).slice(0, 6).map(id => esc(nameOf(id))).join(", ")}. <a href="#/role/${esc(r.id)}">Open the role →</a></p></div></details>`).join("")}${rg ? '<p class="small muted">Reading your resume against these roles…</p>' : ""}</div>`;
    } else {
      // what to build: the skills most roles of the field ask for that the resume does not show, with the build step where one is written
      const count = {}; for (const r of roles) for (const id of coreOf(r)) count[id] = (count[id] || 0) + 1;
      const cands = Object.entries(count).filter(([id]) => !GENERIC.has(id) && (!rg || !rg.shown.has(id))).sort((a, b) => b[1] - a[1]).slice(0, 5);
      body = `<h2>What to build</h2><p class="small muted">${rg ? "Skills most of these roles ask for that your resume does not show yet. A project that shows one is worth a line on your resume." : `Skills most of these roles ask for. <a href="#/you">Add your resume</a> and we leave out the ones you already show.`}</p>
        <ol class="next">${cands.map(([id, n]) => { const sk = ix.skillById[id] || {}; const steps = roles.filter(r => coreOf(r).includes(id)).map(r => buildSteps(sk, r.ladder).steps).find(x => x.length) || []; return `<li><b>${esc(nameOf(id))}</b><span class="why">Asked by most postings of ${n === 1 ? "one role" : n + " roles"} here.${steps.length ? ` ${stepHtml(practise(steps))}` : " No build step is written for this skill yet; open it on a role screen to see how postings say it."}</span></li>`; }).join("") || "<li>Nothing left: your resume shows what these roles ask for.</li>"}</ol>`;
    }
    page(`<h1>Prepare for an event</h1><p class="lead">${esc(g.label)} · which kind of event?</p>${chips}${body}`);
    if (kind === "roundtable" && rg) Atlas.fieldMatches(g.id, state.resume.text).then(res => {
      if (!location.hash.startsWith(`#/field/${g.id}/event`)) return;
      const el = $("#roundtable"); if (!el) return;
      const askName = x => x.slot === "__domain" ? "the industry you know" : x.slot === "__ai" ? "AI in your work" : x.slotName;
      const per = roles.map(r => { const rows = res[r.id].rows.filter(x => x.tier !== "diff");
        return { r, have: rows.filter(x => (x.status === "evidenced" || x.status === "transferable") && !GENERIC.has(x.slot)).sort((a, b) => b.w - a.w).slice(0, 3), ask: rows.filter(x => (x.status === "gap" || x.status === "thin") && !GENERIC.has(x.slot)).sort((a, b) => b.w - a.w).slice(0, 2) }; });
      // the lines: each resume line that shows a skill, once, with how many of the roles it fits
      const lines = new Map();
      for (const { have } of per) for (const x of have) if (x.lines[0]) { const t = x.lines[0].text, e = lines.get(t) || { text: t, skills: new Set(), roles: 0, say: null }; e.skills.add(x.name); e.roles++; if (x.status === "transferable") { const s = ix.skillById[x.id]; if (s) e.say = textOf(ix.M.meta.kinds).line(s, [`role:${r.family}`, r.group]).text; } lines.set(t, e); }
      const top = [...lines.values()].sort((a, b) => b.roles - a.roles).slice(0, 3);
      const yl = $("#yourlines"); if (yl) yl.innerHTML = top.length ? `<ol class="next">${top.map(e => `<li><b>${esc([...e.skills].slice(0, 2).join(", "))}</b>: “${esc(e.text.length > 160 ? e.text.slice(0, 157) + "…" : e.text)}”<span class="why">Fits ${e.roles} of ${roles.length} roles.${e.say ? ` Say it like: <b>${esc(e.say)}</b>` : ""}</span></li>`).join("")}</ol>` : '<p class="small muted">Your resume shows none of the skills most of these roles ask for yet. Open a role and check your fit to see what to evidence.</p>';
      el.innerHTML = per.map(({ r, have, ask }, i) => {
        const summary = `${have.length ? "Lead with " + esc(join(have.slice(0, 2).map(x => x.name))) : "Nothing to lead with yet"}${ask.length ? " · they may ask about " + esc(join(ask.map(askName))) : ""}`;
        const line = x => x.lines[0] ? `<span class="small muted">“${esc(x.lines[0].text.length > 120 ? x.lines[0].text.slice(0, 117) + "…" : x.lines[0].text)}”</span>` : "";
        return `<details class="empbox"${i === 0 ? " open" : ""}><summary><span class="t">${esc(r.label)}</span><span class="n">${fmt(r.nOpen)} open</span><span class="m">${summary}</span></summary><div class="box-body">${have.length ? `<ul class="plain">${have.map(x => `<li><b>${esc(x.name)}</b> <span class="subtle" data-measure="${pct(x.w)} of ${esc(r.label)} postings ask for it.">${pct(x.w)}</span> ${line(x)}</li>`).join("")}</ul>` : '<p class="small muted">Your resume shows none of the skills most of these postings ask for.</p>'}${ask.length ? `<p class="small muted">They may ask about: ${ask.map(x => esc(askName(x))).join(", ")}.</p>` : ""}<p class="small"><a href="#/role/${esc(r.id)}">Open the role →</a></p></div></details>`; }).join("");
    }).catch(e => { const el = $("#roundtable"); if (el) el.insertAdjacentHTML("afterbegin", '<p class="notice">Could not read your resume against these roles.</p>'); console.error(e); });
    if (kind === "networking") Atlas.fieldJobs(g.id).then(jobs => { if (!location.hash.startsWith(`#/field/${g.id}/event`)) return; const by = {}; for (const j of jobs) if (j.open) { const e = by[j.company] ||= { n: 0, roles: new Set() }; e.n++; e.roles.add(j.family); } const top = Object.entries(by).sort((a, b) => b[1].n - a[1].n).slice(0, 12); const el = $("#employers"); if (el) { const draw = all => { el.innerHTML = `<div class="list">${top.slice(0, all ? 12 : 5).map(([c, e]) => `<div class="r"><span class="t">${esc(c)}</span><span class="n">${fmt(e.n)} open</span><span class="m">${[...e.roles].map(f => esc((ix.roles[f] || {}).label || f)).slice(0, 4).join(", ")}</span></div>`).join("")}</div>${top.length > 5 ? `<p class="small" style="margin-top:8px"><button type="button" class="linkish link" id="emp-all">${all ? "Fewer" : `All ${top.length}`}</button></p>` : ""}`; const b = $("#emp-all"); if (b) b.onclick = () => draw(!all); }; draw(false); } }).catch(e => { const el = $("#employers"); if (el) el.innerHTML = `<p class="small muted">Could not load the postings.</p>`; console.error(e); });
  }
  function sayAboutYou(roles, rg, coreOf, nameOf, GENERIC) {
    const count = {}; for (const r of roles) for (const id of coreOf(r)) if (rg.shown.has(id) && !GENERIC.has(id)) count[id] = (count[id] || 0) + 1;
    const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return top.length ? `<p class="small muted">From your resume: the skills you show that most of these roles ask for. Lead with these.</p><div class="tags">${top.map(([id]) => `<span class="tag good">${esc(nameOf(id))}</span>`).join("")}</div>` : `<p class="small muted">Your resume does not yet show a skill that most of these roles ask for. Open a role and check your fit to see what to evidence.</p>`;
  }

  // ---------- about the data ----------
  const niceDate = d => { const [y, m, day] = String(d || "").split("-"); const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return m && day ? `${Number(day)} ${names[Number(m) - 1]} ${y}` : esc(d); };
  // employers by where they come from: the Fortune 500 list, venture-backed startups, and the employers added for the MBA set
  const origins = cs => { const n = { fortune: 0, startup: 0, mba: 0 }; for (const c of cs) n[c.group === "startup" ? "startup" : c.group === "mba_employer" ? "mba" : "fortune"]++; return n; };
  async function about() {
    const ix = await Atlas.index();
    crumbs([["About the data", null]]); showAside(null);
    const M = ix.M, o = origins(M.meta.companies);
    const top = (cs, n) => cs.slice().sort((a, b) => b.n - a.n).slice(0, n).map(c => `${esc(c.name)} <span class="muted">${fmt(c.n)}</span>`).join(" · ");
    const fact = (n, l) => `<div class="fact"><b>${n}</b><span>${l}</span></div>`;
    let productPart = `<p class="small muted">Loading the product set…</p>`;
    const render = () => page(`<div id="about"><h1>About the data</h1>
      <p class="lead">Every number here comes from job postings on employers' own careers pages, refreshed every week. The business roles show postings in the United States.</p>
      <div class="about-facts">${fact(fmt(M.meta.n_open), "open US postings")}${fact("50", "business roles")}${fact(fmt(M.meta.n_companies), "employers")}${fact(niceDate(M.meta.generated), "last refresh")}</div>
      <h3>Where the postings come from</h3>
      <p class="small">${fmt(o.fortune)} Fortune 500 companies, ${fmt(o.startup)} venture-backed startups, and ${fmt(o.mba)} employers that MBA students target: banks, consulting firms, investment funds, real-estate and consumer-goods companies.</p>
      ${disc("about-top", "Employers with the most postings", `<p>${top(M.meta.companies, 15)}</p>`)}
      <h3>How we read a posting</h3>
      <p class="small">Keyword rules read each posting against one list of skills. A share is the fraction of postings in the current view that ask for a skill. One employer counts for at most 5% of a role. A posting the employer takes down is closed: it is no longer listed, and it stays in the shares for a year.</p>
      <h3>What is ours</h3>
      <p class="small">Sub-skills, level ladders and build steps are editorial. Every quoted sentence comes from a posting.</p>
      <h3>What we count</h3>
      <p class="small">We count which screens a visit reaches (the start, a field, a role, a fit, a course, the classes, a game) under a random id for that browser session, and the emails that apply for the cohort with the role on screen and, if you apply, the sentence you type. No resume, syllabus, pasted posting, skill list or file name is ever sent.</p>
      <h3>Product roles</h3>${productPart}</div>`, true);
    render();
    Atlas.product().then(P => { const G = P.G; productPart = `<p class="small">${fmt(G.meta.n_jobs)} open postings worldwide (${fmt(G.jobs.filter(j => j.country === M.meta.country).length)} in the US, the count Explore shows) for ${Object.keys(G.families).filter(f => G.jobs.some(j => j.family === f)).length} product role families at ${fmt(G.meta.n_companies)} companies, refreshed ${niceDate(G.meta.generated)}.</p>${disc("about-top-product", "Companies with the most postings", `<p>${top(G.meta.companies, 15)}</p>`)}`; if (location.hash.startsWith("#/about")) render(); }).catch(console.error);
  }

  // the footer line: how many postings, and when they were last refreshed
  Atlas.index().then(ix => { const f = document.getElementById("foot-note"); if (f) f.textContent = `Built from ${fmt(ix.M.meta.n_open)} live job postings, refreshed weekly. Last refresh ${niceDate(ix.M.meta.generated)}.`; }).catch(console.error);

  route();
})();
