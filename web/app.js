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
    headings: Copy.intake.headings,
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
    // the box's heading: what comes next for its surface (2026-11-06), never "GradBuddy is coming soon" on GradBuddy
    headingOf: what => Copy.intake.headings[Intake.surfaceOf(what)] || Copy.intake.heading,
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
    // a link of the door's own chrome (the top bar's verbs, the brand, the footer's About) passes the door as "Skip for
    // now" does (owner, 2026-11-06): the hash it lands on, the door itself read as home; null for a link off the site's
    // hashes, which the browser follows as it is
    pass: href => { const h = String(href || ""); return /^#\//.test(h) ? Door.next(h) : null; },
    // the door's line under the email (2026-11-06: only a campus with a loaded roster opens anything, so the line names
    // those campuses, from the same list Door.opens reads); "" when none has a roster, and the line is not drawn
    schoolLine: campuses => {
      const names = [...new Set((campuses || []).filter(c => c && c.catalog && c.flag).map(c => Copy.network.schools[c.flag]).filter(Boolean))];
      return names.length ? Copy.fill(Copy.door.school, { schools: names.join(" or ") }) : "";
    },
    // the line home shows after a roster screen sent the visitor there: the campuses whose address opens Find classes,
    // from the same list as schoolLine; with none, that Find classes is not open
    bounceLine: campuses => {
      const names = [...new Set((campuses || []).filter(c => c && c.catalog && c.flag).map(c => Copy.network.schools[c.flag]).filter(Boolean))];
      return names.length ? Copy.fill(Copy.home.classesOnly, { schools: names.join(" or ") }) : Copy.home.classesClosed;
    },
    // a count in words, rounded down so the sentence stays true until the next refresh: 25,950 -> "25 thousand",
    // 1,502 -> "1,500"
    thousands: n => n >= 1000 ? `${Math.floor(n / 1000)} thousand` : Door.hundreds(n),
    hundreds: n => (Math.floor(n / 100) * 100).toLocaleString("en-US"),
    // the four home cards in order, with the line each one builds from the counts ({ nOpen, nCompanies, nRoles }: open
    // US postings of every role set the site shows, the employers behind them, the roles in the index, exact, or 0 while
    // the product set's are not counted yet, when the line names no number); Find classes is open only when
    // the email opens a roster (Door.opens), and the screens draw the open cards alone (2026-11-04: no grayed card)
    verbs(email, counts, domains, campuses) {
      const c = counts || {}, V = Copy.home.verbs, fill = Copy.fill;
      return [
        { key: "jobs", href: "#/jobs", title: V.jobs.title, line: fill(V.jobs.line, { jobs: Door.thousands(c.nOpen || 0), companies: Door.hundreds(c.nCompanies || 0) }), open: true },
        { key: "skills", href: "#/skills", title: V.skills.title, line: c.nRoles ? fill(V.skills.line, { roles: c.nRoles }) : V.skills.lineAll, open: true },
        { key: "classes", href: "#/classes", title: V.classes.title, line: V.classes.line, open: Door.opens(email, domains, campuses) },
        { key: "network", href: "#/network", title: V.network.title, line: V.network.line, open: true },
      ];
    },
    // Build skills (#/map) put after Explore careers, in the top bar and on home (owner, 2026-11-11), when `on`; with
    // `invite` the card's line ends by saying the section opens by invite. The list itself is not changed.
    withBuild(verbs, on, invite) {
      const out = [...(verbs || [])]; if (!on) return out;
      const B = Copy.home.verbs.build;
      out.splice(out.findIndex(v => v.key === "skills") + 1, 0, { key: "build", href: "#/map", title: B.title, line: invite ? `${B.line} ${B.invite}` : B.line, open: true });
      return out;
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
    // the inline wizard's bar and its label (2026-11-06): one bar per question and one for the résumé, and the label
    // counts the same steps, so "Step 2 of 4" sits over four bars with two filled. `i` is the step (0-based), `n` the
    // number of questions; the résumé step is i === n.
    steps: (i, n) => { const total = n + 1, I = Copy.you.inline; return { bars: total, done: i + 1, label: Copy.fill(i < n ? I.step : I.lastStep, { i: i + 1, n: total }) }; },
    // where a link that carries `next` goes back to (the sign-in, and the résumé step since 2026-11-06): a hash of this
    // site, never the sign-in; null for anything else (another origin, a script, an empty value)
    back: q => { const n = String(q || ""); return /^#\/(?!signin)[a-z][a-z0-9_/?=&.%+-]*$/i.test(n) ? n : null; },
    // the "Add your résumé" link of a screen that should get its place back (Find jobs, Networking): the résumé step
    // alone (index n, after the n questions) with the screen's own hash as `next`; About you itself carries none
    resumeHref: (n, hash) => { const h = You.returnTo(hash); return `#/you?step=${n}` + (h ? `&next=${encodeURIComponent(h)}` : ""); },
    // the wizard's way out: the `next` it was opened with when it is a safe hash (and not About you again), else the
    // old ending (the summary after an edit, Explore after the whole wizard)
    returnTo: next => { const n = You.back(next); return n && !/^#\/you\b/.test(n) ? n : null; },
    after: (next, editing) => You.returnTo(next) || (editing ? "#/you" : "#/explore"),
    // the model read answered for this résumé (2026-11-06): only then does its line name the AI reader. `aiRead` is
    // set by inferResume; a résumé kept from before it counts as read when the read found something
    aiRead: r => !!r && (r.aiRead === true || (r.aiRead == null && Array.isArray(r.inferred) && r.inferred.length > 0)),
    fromDoor: (y, where) => { const v = y || {}; if (!where || (v.where && v.whereFrom !== "door") || v.where === where) return null; return { fields: [], stage: null, ...v, where, whereFrom: "door" }; },
  };
  // The fit's counts as the rail and the fit screen say them (2026-11-06): the rail's "N of M" counts the skills most
  // postings ask for (tier core) alone, the fit screen's two lists count every skill. `f` is computeFit's result.
  // core: M; coreHave: N; have: the "Already on your résumé" list; still: the "Needs more evidence" list (gaps of every
  // tier but the differentiators, and the skills named without the work that shows them).
  const FitCounts = {
    of: f => ({ core: f.core.length, coreHave: f.coreHave.length, have: f.evid.length + f.trans.length + (f.through || []).length + (f.inferred || []).length + f.presumed.length, still: f.gaps.length + f.thin.length }),
    // the rail's two sentences under "N of M": what the count takes (`level` the step label, or null at all levels) and
    // how many skills in all still need evidence
    railLines: (c, level) => {
      const RR = Copy.role.rail, fill = Copy.fill;
      return {
        what: fill(RR.whatCounts, { m: c.core, where: level ? fill(RR.atLevel, { level }) : RR.atAll }),
        still: c.still === 0 ? RR.stillNone : c.still === 1 ? RR.stillOne : fill(RR.stillMany, { n: c.still }),
      };
    },
  };
  // The course screen's count (2026-11-06): the skills most postings ask for at the level on screen that a course can
  // show; when no such skill leads at that level (Product Manager at Entry: every leading skill is a way of working),
  // the count takes all levels and says so. `atLevel` and `atAll` are the core rows ({ id }) of the two slices,
  // `showable(x)` says a course can show it. Returns { core, all: true when the count took all levels }.
  const CourseCore = {
    pick: (atLevel, atAll, showable, level) => {
      const here = atLevel.filter(showable);
      return here.length || level === "all" ? { core: here, all: level === "all" } : { core: atAll.filter(showable), all: true, fellBack: true };
    },
  };
  // The breadcrumbs (2026-11-06): one rule for every route, section then screen. The section is the top bar's verb the
  // screen sits under, named as the top bar names it; a section's own screen is the section alone; a screen under no
  // verb (About, About you, the sign-in) is the screen alone; the door and home have none (the brand is home). The
  // section is where the person came from when the screen's first crumb links to another section's screen (a professor
  // opened from Networking): that crumb keeps its own hash, so the tab and the role come back. The top bar's current
  // mark is the same section. `items` are the screen's own crumbs ([label, href or null]); a leading Home is dropped. A
  // screen with no crumbs of its own under a section shows the section alone. Build skills (2026-11-10, decision K) is
  // the map's own section: its key is `build`, its address #/map (SECTION_HREF).
  const SECTION_OF = { jobs: "jobs", skills: "skills", map: "build", explore: "skills", field: "skills", role: "skills", fit: "skills", course: "skills", play: "skills", network: "network", event: "network", classes: "classes", professor: "classes" };
  const SECTIONS = new Set(["jobs", "skills", "build", "network", "classes"]);
  const SECTION_HREF = { build: "#/map" };
  const Crumbs = {
    SECTION_OF,
    trail(name, items) {
      if (name === "door" || name === "home") return { section: null, items: [] };
      let rest = (items || []).filter(it => it && it[0] !== Copy.common.home);
      const from = rest[0] && rest[0][1] ? parseRoute(rest[0][1]).name : null;
      const section = SECTIONS.has(from) ? from : SECTION_OF[name] || null;
      if (!section) return { section: null, items: rest };
      const label = Copy.common.bar[section];
      if (name === section || !rest.length) return { section, items: [[label, null]] };
      let href = SECTION_HREF[section] || "#/" + section;
      if (SECTIONS.has(from)) { href = rest[0][1]; rest = rest.slice(1); }
      return { section, items: [[label, href], ...rest] };
    },
  };
  // The theme button: a press always changes what is on screen. From the device's theme it goes to the other one, and
  // the next press goes back to following the device (2026-11-08; before, light and dark took turns and the device's
  // theme never came back but by clearing the site's storage). Its name says what a press does. `dark`: the device is dark.
  const Theme = {
    STATES: ["system", "light", "dark"],
    next: (now, dark) => now === "system" ? (dark ? "light" : "dark") : "system",
    label: (now, dark) => { const to = Theme.next(now, dark), C = Copy.common; return to === "system" ? C.themeToDevice : Copy.fill(C.themeTo, { theme: C.themeNames[to] }); },
  };
  // The open form's steps (#/map/find/<step>, 2026-11-12; the portfolio flow, 2026-11-27): one question per screen for
  // a visitor with no session (and, with SKILL_TREE_ENABLED off, for everyone). The answers kept in this browser
  // (open.flow), what each step still lacks, the role the fit screen's link names, the roles' type-ahead, the places a
  // field shows work on and the answers as POST /api/open takes them (web/quests.js cleanAnswers).
  //   steps(quests)            the steps in order; without the build quests, tech, tools and share are left out
  //   step(id)                 a step's id from an address: the old "accounts" is "share"
  //   clean(v)                 a stored value as the form reads it (anything else dropped)
  //   missing(step, c)         what the step lacks for c = { roles, resume, tech, email }, or null; tools and share
  //                            can be skipped
  //   firstMissing(steps, c, before)  the first step that lacks something (only those before `before` when given)
  //   preselect(roles, id, fieldOf)   the roles with `id` first: kept beside roles of its field, else alone
  //   named(roles)             the roles with `name`: the label, and its field beside it when two roles share a label
  //   hits(roles, picked, q, field)   the type-ahead: the label typed in full first, then a label starting with what
  //                            was typed, then one starting with its first word, then the rest (web/pick.js filter);
  //                            roles of another field than `field` left out; six at most
  //   fieldPlaces(kit, field)  the kit's places of type social or page for the field, in file order
  //   shownPlaces(flow, kit, field)  the places tapped, or the kit's default ones (LinkedIn) before any tap
  //   fieldKinds(kit, field, tech)   the kit's kinds for the field (web/quests.js fieldKinds)
  //   answers(flow, kit, field)      { tech, tools, own_tools, try_new, places, own_places, portfolio: { host, note } }
  const LIM = { ownTools: 300, ownPlaces: 200, note: 120 };
  const normWords = s => String(s || "").toLowerCase().replace(/[^a-z0-9&+ ]+/g, " ").replace(/\s+/g, " ").trim();
  const OpenFlow = {
    STEPS: ["roles", "resume", "tech", "tools", "share", "email"],
    LIM,
    steps: quests => quests ? [...OpenFlow.STEPS] : ["roles", "resume", "email"],
    step: id => id === "accounts" ? "share" : id,
    emailOk: e => { const t = String(e == null ? "" : e).trim(); return t.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t); },
    clean(v) {
      const o = v && typeof v === "object" && !Array.isArray(v) ? v : {};
      const text = (x, n) => typeof x === "string" ? x.slice(0, n) : "";
      const roles = Array.isArray(o.roles) ? [...new Set(o.roles.filter(x => typeof x === "string" && x))].slice(0, 4) : [];
      const tech = Object.hasOwn(Copy.map.flow.tech.options, o.tech) ? o.tech : null;
      const tools = {};
      if (o.tools && typeof o.tools === "object" && !Array.isArray(o.tools)) for (const [k, x] of Object.entries(o.tools)) if (x === "use" && k) tools[k] = "use";
      const places = Array.isArray(o.places) ? [...new Set(o.places.filter(x => typeof x === "string" && x))].slice(0, 20) : null;
      const pf = o.portfolio && typeof o.portfolio === "object" && !Array.isArray(o.portfolio) ? o.portfolio : {};
      const portfolio = { has: pf.has === true || pf.has === false ? pf.has : null, host: typeof pf.host === "string" && pf.host ? pf.host : null, note: text(pf.note, LIM.note) };
      const try_new = o.try_new === true || o.try_new === false ? o.try_new : null;
      return { roles, tech, tools, own_tools: text(o.own_tools, LIM.ownTools), try_new, places, own_places: text(o.own_places, LIM.ownPlaces), portfolio,
        email: typeof o.email === "string" ? o.email.slice(0, 320) : "", posting: typeof o.posting === "string" ? o.posting.slice(0, 20000) : "" };
    },
    missing(step, c) {
      const x = c || {};
      if (step === "roles") return (x.roles || []).length ? null : "roles";
      if (step === "resume") return x.resume ? null : "resume";
      if (step === "tech") return x.tech ? null : "tech";
      if (step === "email") return OpenFlow.emailOk(x.email) ? null : "email";
      return null;
    },
    firstMissing(steps, c, before) {
      for (const s of steps) { if (s === before) return null; if (OpenFlow.missing(s, c)) return s; }
      return null;
    },
    preselect(roles, id, fieldOf) {
      const rs = (roles || []).filter(r => r !== id);
      if (!id) return [...(roles || [])];
      return rs.length && fieldOf(rs[0]) === fieldOf(id) ? [id, ...rs].slice(0, 4) : [id];
    },
    named(roles) {
      const n = {};
      for (const r of roles || []) { const k = normWords(r.label); n[k] = (n[k] || 0) + 1; }
      return (roles || []).map(r => ({ ...r, name: n[normWords(r.label)] > 1 && r.fieldLabel ? `${r.label} (${r.fieldLabel})` : r.label }));
    },
    hits(roles, picked, q, field) {
      const words = normWords(q).split(" ").filter(Boolean); if (!words.length) return [];
      const typed = words.join(" "), mine = new Set(picked || []);
      const hit = r => { const l = normWords(r.label), f = normWords(r.fieldLabel); return words.every(w => l.includes(w) || f.includes(w)); };
      const rank = r => { const l = normWords(r.label); return l === typed ? 0 : l.startsWith(typed) ? 1 : l.startsWith(words[0]) ? 2 : l.includes(typed) ? 3 : 4; };
      return (roles || []).filter(r => !mine.has(r.id) && (!field || r.field === field) && hit(r))
        .map((r, i) => [r, rank(r), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]).slice(0, 6);
    },
    // the kit's kinds for the field, in file order; a code kind only for a person who reads or writes code (the same
    // rule as web/quests.js fieldKinds, which the browser uses; repeated here so this table loads in node alone)
    fieldKinds: (kit, field, tech) => ((kit && kit.kinds) || []).filter(k => (k.fields === "all" || (Array.isArray(k.fields) && k.fields.includes(field))) && (!k.code || tech === "read_code" || tech === "write_code")).map(k => k.id),
    fieldPlaces: (kit, field) => ((kit && kit.places) || []).filter(p => (p.type === "social" || p.type === "page") && (p.fields === "all" || (Array.isArray(p.fields) && p.fields.includes(field)))),
    shownPlaces(flow, kit, field) {
      const ids = OpenFlow.fieldPlaces(kit, field).map(p => p.id);
      if (Array.isArray(flow && flow.places)) return flow.places.filter(id => ids.includes(id));
      return ((kit && kit.places) || []).filter(p => p.default && ids.includes(p.id)).map(p => p.id);
    },
    answers(flow, kit, field) {
      const f = OpenFlow.clean(flow), hosts = ((kit && kit.portfolio_hosts) || []).map(h => h.id);
      const has = f.portfolio.has === true, kinds = new Set(OpenFlow.fieldKinds(kit, field, f.tech));
      const tools = Object.fromEntries(Object.keys(f.tools).filter(k => kinds.has(k)).map(k => [k, "use"]));
      return { tech: f.tech, tools, own_tools: f.own_tools.trim(), try_new: f.try_new, places: OpenFlow.shownPlaces(f, kit, field), own_places: f.own_places.trim(),
        portfolio: { host: has && hosts.includes(f.portfolio.host) ? f.portfolio.host : null, note: has ? f.portfolio.note.trim() : "" } };
    },
  };
  return { parseRoute, Stage, Intake, Door, RoleFilters, You, FitCounts, CourseCore, Crumbs, Theme, OpenFlow };
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

  // ---------- theme: the device decides until the person presses the button (Routes.Theme) ----------
  const GLYPH = { system: "◐", dark: "●", light: "○" };
  let theme = "system"; try { theme = localStorage.getItem("theme") || "system"; } catch { }
  const deviceDark = () => { try { return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches); } catch { return false; } };
  function applyTheme(t) { theme = Routes.Theme.STATES.includes(t) ? t : "system"; if (theme === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme; const b = $("#theme"), name = Routes.Theme.label(theme, deviceDark()); b.textContent = GLYPH[theme]; b.title = name; b.setAttribute("aria-label", name); }
  applyTheme(theme);
  // the name says what a press does, which turns on the device's theme: it is said again when the device changes
  try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(theme)); } catch { }
  $("#theme").onclick = () => { applyTheme(Routes.Theme.next(theme, deviceDark())); try { localStorage.setItem("theme", theme); } catch { } remountForms(); };

  // ---------- shell helpers ----------
  const main = $("#main"), aside = $("#aside"), shell = $("#shell");
  // every screen's crumbs go through Routes.Crumbs (one rule: section, then screen), and the top bar marks that section
  function crumbs(given) { const t = Routes.Crumbs.trail(screenNow, given), items = t.items; markVerb(t.section); $("#crumbs").innerHTML = items.map((it, i) => (i ? '<span class="sep">/</span>' : "") + (it[1] ? `<a href="${esc(it[1])}">${esc(it[0])}</a>` : `<span class="here">${esc(it[0])}</span>`)).join(""); document.title = (items.length ? items[items.length - 1][0] + " · " : "") + CM.title; }
  // The side column has two modes. Elsewhere it is an overlay that opens on a selection (owner's choice 8B). On a
  // role screen it is the rail (owner's decision 2026-10-24): always there, holding the legend, the person's fit and
  // the things to do with the role; a skill or posting card draws over it with "← Back". Under the breakpoint in
  // style.css the rail collapses to an edge tab and opens as the overlay.
  let railBase = null;   // a function that draws the rail's own content, so a toggle inside it redraws from the current state
  const railTab = document.createElement("button"); railTab.type = "button"; railTab.className = "rail-tab"; railTab.textContent = CM.railTab; railTab.setAttribute("aria-controls", "aside"); railTab.setAttribute("aria-expanded", "false"); railTab.onclick = () => railTab.setAttribute("aria-expanded", String(shell.classList.toggle("rail-open"))); shell.appendChild(railTab);
  function showRail(base) { railBase = base; shell.classList.add("with-rail"); aside.classList.add("rail"); }
  function leaveRail() { railBase = null; shell.classList.remove("with-rail", "rail-open"); railTab.setAttribute("aria-expanded", "false"); aside.classList.remove("rail"); }
  // asideEsc: the close of a screen's own panel (Find jobs' posting), run by Esc; any showAside(null) clears it
  let asideEsc = null;
  // a phone (640 px and under, style.css): the side panel covers the screen there, so a posting's panel is modal
  const phoneMq = (() => { try { return window.matchMedia ? window.matchMedia("(max-width: 640px)") : null; } catch { return null; } })();
  const onPhone = () => !!(phoneMq && phoneMq.matches);
  // Tab and Shift+Tab go round a modal box's own controls (enabled and shown) and never reach the page behind it;
  // focus outside the box goes to its first control. The feedback sheet and a posting's panel on a phone use it.
  const TAB_STOPS = 'button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])';
  function trapTab(box, e) {
    const els = [...box.querySelectorAll(TAB_STOPS)].filter(el => !el.disabled && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1], at = document.activeElement;
    if (!box.contains(at)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
    else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
  }
  // the dialog a posting's panel is (drawPanel sets it); any other use of the aside goes without it
  const asideDialog = on => { for (const a of ["role", "aria-labelledby", "aria-modal"]) aside.removeAttribute(a); if (on) { aside.setAttribute("role", "dialog"); aside.setAttribute("aria-labelledby", on); aside.setAttribute("aria-modal", String(onPhone())); } };
  // a window that crosses 640 px while a posting is open: the panel is modal again, or no longer
  try { if (phoneMq) { const sync = () => { if (aside.getAttribute("role") === "dialog") aside.setAttribute("aria-modal", String(onPhone())); }; if (phoneMq.addEventListener) phoneMq.addEventListener("change", sync); else if (phoneMq.addListener) phoneMq.addListener(sync); } } catch { }
  function showAside(html) {
    asideDialog(null);
    if (html == null) { asideEsc = null; if (railBase) { const y = aside.hidden ? 0 : aside.scrollTop; aside.hidden = false; aside.innerHTML = railBase(); aside.scrollTop = y; wireRail(); return; } aside.hidden = true; shell.classList.remove("with-aside"); aside.innerHTML = ""; return; }
    aside.hidden = false; if (!railBase) shell.classList.add("with-aside"); aside.innerHTML = html; aside.scrollTop = 0;
    // a card drawn into the rail: at 1180px and under the rail is off the canvas until its tab opens it, so it opens here
    if (railBase && !shell.classList.contains("rail-open")) { shell.classList.add("rail-open"); railTab.setAttribute("aria-expanded", "true"); }
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
    // a posting's panel covers a phone's screen: Tab stays in it (the feedback sheet over it keeps its own)
    if (e.key === "Tab" && asideEsc && !aside.hidden && !fbOpen && onPhone()) { trapTab(aside, e); return; }
    if (e.key !== "Escape") return;
    if (fbOpen) return;   // the feedback dialog is on top and closes itself; what is under it stays
    if (tipFor) { hideTip(); return; }
    if (state.more && $("#drawer")) { state.more = false; keepScroll(renderRole); return; }
    if (asideEsc && !aside.hidden) { asideEsc(); return; }
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
  // The saved state (the visitor journey, step 3, 2026-11-05; web/state.js): with accounts on and a session, the
  // About-you answers, the hearts and each read go up to the person's own rows; at sign-in and at every page load
  // the server's copy fills what this browser lacks and the browser's answers go up. Nothing here runs otherwise.
  const stateOn = () => accountsOn() && !!window.State && !!Auth.stored();
  const hearts = () => { const h = store.get("hearts"); return Array.isArray(h) ? h : []; };
  const keepHearts = list => store.set("hearts", [...new Set(list)]);
  // The hearts' control (step 5, 2026-11-05): one list, the card's heart and the open role's the same. A press keeps
  // the role in this browser at once and, with a session, in the person's own row (State.heart; a failed call is
  // mended by the next restore's merge). With accounts on and no session, the open role says to sign in to keep it,
  // without leaving the page: the first personal act of decision 1. Capture.cta("heart"): shown once per screen that
  // draws a heart, click on a press, done when it turned on. Off accounts, the heart still works, in this browser.
  const hearted = id => hearts().includes(id);
  const HT = Copy.heart;
  function heartHtml(id, opts) {
    const o = opts || {}, on = hearted(id), role = o.label || id, aria = fill(on ? HT.unsaveAria : HT.saveAria, { role });
    // with words on it (the open role's Save), the name starts with those words (B-24); the title keeps the sentence
    const name = o.save ? fill(on ? HT.savedRoleAria : HT.saveRoleAria, { role }) : aria;
    const icon = `<span class="hi" aria-hidden="true">${on ? "♥" : "♡"}</span>`;
    return `<button type="button" class="heart${on ? " on" : ""}${o.save ? " heart-save" : ""}" data-heart="${esc(id)}" data-label="${esc(role)}" aria-pressed="${on}" aria-label="${esc(name)}" title="${esc(aria)}">${icon}${o.save ? ` ${esc(on ? HT.saved : HT.save)}` : ""}</button>`;
  }
  // the line under the open role's Save: kept here, sign in to keep it on your account (accounts on, no session)
  const heartNote = id => hearted(id) && accountsOn() && !Auth.stored() ? `${esc(HT.kept)} <a href="${esc(signinHref())}" data-heart-signin>${esc(HT.signIn)}</a>` : "";
  function toggleHeart(id) {
    const on = !hearted(id);
    if (window.Capture) Capture.cta("heart", "click", { role_id: id });
    keepHearts(on ? [...hearts(), id] : hearts().filter(x => x !== id));
    if (on && window.Capture) Capture.cta("heart", "done", { role_id: id });
    if (stateOn()) State.heart(Auth.stored(), id, on);
    paintHearts(document);
  }
  // every heart of that id on the page follows the list; the note under the open role too
  function paintHearts(root) {
    root.querySelectorAll("[data-heart]").forEach(b => { const had = b === document.activeElement, fresh = document.createElement("span"); fresh.innerHTML = heartHtml(b.dataset.heart, { label: b.dataset.label, save: b.classList.contains("heart-save") }); const nb = fresh.firstElementChild; b.replaceWith(nb); if (had) nb.focus(); });
    root.querySelectorAll("[data-heart-note]").forEach(p => { p.innerHTML = heartNote(p.dataset.heartNote); p.hidden = !p.innerHTML; });
    wireHearts(root, true);
  }
  function wireHearts(root, repaint) {
    root.querySelectorAll("[data-heart]").forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); toggleHeart(b.dataset.heart); });
    if (!repaint && root.querySelector("[data-heart]") && window.Capture) Capture.cta("heart", "shown", { role_id: state.roleId });
  }
  // a role row with its heart beside it (the heart is no part of the row's link)
  const heartRow = (id, label, rowHtml) => `<div class="rw">${rowHtml}${heartHtml(id, { label })}</div>`;
  const hashOf = r => r.hash ? Promise.resolve(r.hash) : State.hash(r.text).then(h => { if (h && state.resume === r) { r.hash = h; store.set("resume", r); } return h; });
  const syncProfile = () => { if (!stateOn()) return; State.saveProfile(Auth.stored(), state.you, { resume_hash: (state.resume || {}).hash || null }); };
  async function saveReadFor(m, r) {
    if (!stateOn() || !m || !m.r || !r) return;
    try {
      const h = await hashOf(r); if (!h || state.resume !== r) return;
      const { skills, gaps } = State.readRows(m.r);
      await State.saveRead(Auth.stored(), { resume_hash: h, role_id: m.roleId, band: m.band, skills, gaps, inferred: r.inferred || [] });
      syncProfile();
    } catch (e) { console.error(e); }
  }
  async function restoreState(s) {
    if (!accountsOn() || !window.State || !s) return;
    try {
      const remote = await State.load(s);
      const m = State.merge({ you: state.you, hearts: hearts() }, remote || {});
      if (m.you && !(state.you && (state.you.where || state.you.stage || (state.you.fields || []).length))) { state.you = m.you; store.set("you", m.you); }
      keepHearts(m.hearts);
      if (m.up.you) State.saveProfile(s, m.up.you, { resume_hash: (state.resume || {}).hash || null });
      for (const id of m.up.hearts) State.heart(s, id, true);
    } catch (e) { console.error(e); }
  }
  let restoredOnce = false;   // the page load's restore runs from route(), once every definition below exists
  const waitCtx = () => ({ role_id: state.roleId, stage: (state.you || {}).stage, program: (state.you || {}).where, fields: (state.you || {}).fields || [] });
  // a posting link (decision 8 of the pass: visible on the fit screen and the rail's gap rows for a person with a resume)
  document.addEventListener("click", e => { const a = e.target.closest("[data-posting]"); if (a) track("posting_link", { role_id: a.dataset.posting }); });
  const LEVEL_OPT = { entry: "associate", mid: "mid", senior: "senior", lead: "lead" };
  // what the Spring 2027 screens (classes.js) draw with; gapsFor hands them the person's gaps for a role (step 3 of the
  // demand-gen pass): the fit on screen when it is this role's, else the matcher at the default level, cached per role;
  // applyBox, applyLine and wireApply draw the intake box at the picker's foot (v18 step 1, the intake since v19 B5);
  // resumeForm, wireResume and hasResume let the picker hold the shell's resume form when none is on file (v19 B3, C1)
  const shellCtx = { crumbs, page, showAside, gapsFor: roleId => gapsFor(roleId), applyBox: (what, opts) => applyBox(what, opts), applyLine: label => Intake.gapsLine(label), wireApply: (el, redraw) => wireWait(el, redraw), resumeForm: () => resumeForm(), wireResume: after => wireResumeForm(after), hasResume: () => !!state.resume, flag: () => campusGate().flag };
  // what the door kept, in this browser only: the email, the program group, and that the door was seen once
  // the door's answers; with a session (the code sign-in, 2026-11-05) the verified address wins over the typed one
  const doorKept = () => { try { const s = accountsOn() ? Auth.stored() : null; return { email: (s && s.email) || localStorage.getItem("door.email") || "", where: localStorage.getItem("door.where") || "", seen: localStorage.getItem("door.seen") === "1" }; } catch { return { email: "", where: "", seen: false }; } };
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
  // (Routes.Crumbs.SECTION_OF; the crumbs move the mark when the screen came from another section, markVerb)
  // Build skills (#/map, decision K of 2026-11-10) follows Explore careers for every visitor (buildBar, 2026-11-11: an
  // invited person with no session saw no door at all); a click with no session lands on the sign-in, which says the
  // section opens by invite and how to ask for one. Home draws the same entry as a card (Door.withBuild).
  function topBar(name) {
    const el = $("#verbs"); if (!el) return;
    const verbs = Door.withBuild(Door.verbs(doorKept().email, {}, null, CAMPUSES || []).filter(v => v.open), buildBar());
    el.innerHTML = verbs.map(v => `<a class="toplink" href="${esc(v.href)}" data-verb="${esc(v.key)}">${esc(Door.COPY.bar[v.key] || v.title)}</a>`).join("") + feedbackLink(name) + guideLink(name) + whoHtml(name);
    markVerb(Routes.Crumbs.SECTION_OF[name] || null);
    const out = el.querySelector("[data-signout]"); if (out) out.onclick = () => signOutNow();
    const fb = el.querySelector("[data-feedback]"); if (fb) fb.onclick = () => openFeedback({ prompted: false });
    const ff = $("#foot-feedback"); if (ff) ff.hidden = !feedbackOn() || name === "door";
    const gl = el.querySelector("[data-guide]"); if (gl) gl.onclick = () => Guide.relaunch(name, guideCtx());
    const fg = $("#foot-guide"); if (fg) fg.hidden = !guideShown(name);
  }
  function markVerb(on) {
    for (const a of document.querySelectorAll("#verbs a.toplink[data-verb]")) { const is = a.dataset.verb === on; a.classList.toggle("on", is); if (is) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); }
  }
  // the signed-in address and Sign out at the bar's end, or Sign in; nothing when accounts are off (the map's own
  // sign-in stays on its screens)
  function whoHtml(name) {
    if (!accountsOn()) return "";
    const S = Copy.signin, s = Auth.stored();
    if (s) return `<span class="who" title="${esc(s.email || "")}">${esc(s.email || S.signedIn)}<button type="button" class="linkish link" data-signout>${esc(S.signOut)}</button></span>`;
    return name === "signin" || name === "door" ? "" : `<span class="who"><a class="toplink" href="#/signin?next=${encodeURIComponent(location.hash || "#/home")}">${esc(S.signIn)}</a></span>`;
  }
  async function signOutNow() { mapHeld = null; mapUi = null; await Auth.signOut(); if (Routes.parseRoute(location.hash).name === "map") location.hash = "#/skills"; else route(); }
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
  // the visitor journey's sign-in for everyone (step 2, 2026-11-05): email plus a six-digit code, asked at the first
  // personal act (the résumé read), the door's own form instead of Tally's
  const accountsOn = () => !!((window.CONFIG || {}).ACCOUNTS_ENABLED && window.Auth);
  // ---------- feedback (the visitor journey, step 6, 2026-11-05; web/feedback.js, pipeline/sql/2026-11-05_feedback.sql) ----------
  // A persistent Feedback link in the top bar and the footer opens a small sheet: the sentence (at most 500
  // characters), an email only if wanted (empty; the address of the session or the door is one press away, "Use …",
  // owner's decision 4a of 2026-11-06, so the privacy line stays true), Send; an address that is not an email stops
  // Send with one line. The prompt opens the same
  // sheet once per browser after twelve meaningful actions or six minutes of visible time, never on the door or the
  // sign-in nor within a minute of signing in; shown counts as asked; again after thirty days with new actions; and
  // once more at the first tree opened (Feedback.due is the rule, pure and tested). The funnel reads the link as the
  // call to action `feedback` and the prompt as `feedback_prompt`. Nothing draws with CONFIG.FEEDBACK_ENABLED off.
  const feedbackOn = () => !!((window.CONFIG || {}).FEEDBACK_ENABLED && window.Feedback);
  const FB = Copy.feedback;
  const feedbackLink = name => feedbackOn() && name !== "door" ? `<button type="button" class="toplink linkish" data-feedback>${esc(FB.link)}</button>` : "";
  let fbOpen = false;
  function openFeedback(opts) {
    if (!feedbackOn() || fbOpen) return;
    const o = opts || {}, prompted = !!o.prompted, id = prompted ? "feedback_prompt" : "feedback";
    const screen = Routes.parseRoute(location.hash).name, sess = window.Auth ? Auth.stored() : null;
    const onFile = Feedback.offer("", o.email || (sess && sess.email) || doorKept().email || "");
    const lead = o.lead || (o.why === "tree" ? FB.treeLead : prompted ? FB.promptLead : FB.lead);
    fbOpen = true;
    // the control that opened the sheet gets focus back when it closes, whatever closes it (C-10); a prompt opened by
    // the timer has none, so focus goes to the Feedback link in the top bar
    const opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    // a native <dialog>, shown modal: the browser makes the page behind it inert, draws the scrim (::backdrop) and
    // closes it on Escape
    const wrap = document.createElement("div");
    wrap.innerHTML = `<dialog class="fb-box" aria-labelledby="fb-h" id="fb-box">
      <div class="fb-h"><h2 id="fb-h">${esc(FB.heading)}</h2>${UI.close(FB.close, { id: "fb-close" })}</div>
      <p class="m-0 small muted">${esc(lead)}</p>
      <label class="fb-lab"><textarea id="fb-text" maxlength="${Feedback.LIMITS.text}" placeholder="${esc(FB.placeholder)}" aria-label="${esc(FB.heading)}"></textarea><span id="fb-count">${esc(fill(FB.count, { n: 0, max: Feedback.LIMITS.text }))}</span></label>
      <label class="fb-lab">${esc(FB.emailLabel)}<input type="email" id="fb-email" maxlength="${Feedback.LIMITS.email}" value="" autocomplete="email"></label>
      ${onFile ? `<p class="fb-use"><button type="button" class="linkish link" id="fb-use">${esc(fill(FB.useEmail, { email: onFile }))}</button></p>` : ""}
      <p class="m-0 small muted">${esc(FB.privacy)}</p>
      ${linkedinUrl() ? `<p class="m-0 small fb-connect"><a href="${esc(linkedinUrl())}" target="_blank" rel="noopener" id="fb-connect">${esc(FB.connect)}</a></p>` : ""}
      <div class="fb-f"><button type="button" class="btn quiet" id="fb-later">${esc(FB.notNow)}</button><button type="button" class="btn primary" id="fb-send">${esc(FB.send)}</button></div>
      <p class="small fb-out" id="fb-out" aria-live="polite"></p>
    </dialog>`;
    document.body.appendChild(wrap);
    const box = wrap.querySelector("#fb-box");
    const close = () => {
      if (!fbOpen) return;
      fbOpen = false; wrap.remove();
      const back = opener && opener.isConnected ? opener : document.querySelector(".top [data-feedback]");
      if (back) back.focus();
    };
    // Tab and Shift+Tab go round the sheet's own controls (a modal dialog alone lets Tab out to the browser's bar);
    // Escape is the dialog's own (its close event); a press on the scrim, outside the box, closes it too
    box.addEventListener("keydown", e => { if (e.key === "Tab") trapTab(box, e); });
    box.addEventListener("close", close);
    box.addEventListener("click", e => { if (e.target !== box) return; const r = box.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); });
    for (const sel of ["#fb-close", "#fb-later"]) wrap.querySelector(sel).onclick = close;
    if (box.showModal) box.showModal(); else box.setAttribute("open", "");
    const ta = wrap.querySelector("#fb-text"), out = wrap.querySelector("#fb-out"), btn = wrap.querySelector("#fb-send"), em = wrap.querySelector("#fb-email");
    const use = wrap.querySelector("#fb-use");
    // a bad address marks the field invalid and points it at the line that says why; typing or "Use …" clears both
    const emailFine = () => { em.removeAttribute("aria-invalid"); em.removeAttribute("aria-describedby"); };
    em.addEventListener("input", emailFine);
    if (use) use.onclick = () => { em.value = onFile; use.parentElement.hidden = true; out.textContent = ""; emailFine(); em.focus(); };
    ta.oninput = () => { wrap.querySelector("#fb-count").textContent = fill(FB.count, { n: ta.value.length, max: Feedback.LIMITS.text }); };
    btn.onclick = async () => {
      const text = ta.value.trim();
      if (!text) { out.textContent = FB.empty; ta.focus(); return; }
      if (!Feedback.emailOk(em.value)) { out.textContent = FB.badEmail; em.setAttribute("aria-invalid", "true"); em.setAttribute("aria-describedby", "fb-out"); em.focus(); return; }
      if (window.Capture) Capture.cta(id, "click", { role_id: state.roleId });
      btn.disabled = true; out.textContent = FB.sending;
      const ok = await Feedback.send({ text, email: em.value, screen, prompted, session: window.Capture ? Capture.session() : null, visitor: window.Capture ? Capture.visitor() : null, user_id: sess ? sess.uid : null });
      if (!ok) { out.textContent = FB.failed; btn.disabled = false; return; }
      if (window.Capture) Capture.cta(id, "done", { role_id: state.roleId });
      out.textContent = FB.thanks; ta.value = ""; ta.disabled = true; btn.hidden = true; const later = wrap.querySelector("#fb-later"); later.textContent = FB.close; later.focus();
      setTimeout(() => { if (fbOpen) close(); }, 2500);
    };
    ta.focus();
    if (window.Capture) Capture.cta(id, "shown", { role_id: state.roleId });
  }
  // the prompt: checked when a screen draws and every thirty seconds while the page is visible; the tree's own at the
  // first self-serve map drawn (treeOpened)
  function maybePrompt(name, opts) {
    if (!feedbackOn() || fbOpen || !window.Capture) return false;
    if (window.Guide && Guide.isOpen()) return false;   // the prompt never lands on a tip
    const o = opts || {}, now = Date.now();
    const d = Feedback.due({ now, screen: name, actions: Capture.actions(), visibleMs: Capture.visible(), signedInAt: Feedback.signedInAt(), asked: Feedback.asked(), treeOpened: !!o.treeOpened, treeAsked: Feedback.treeAsked() });
    if (!d.due) return false;
    if (d.why === "tree") Feedback.markTreeAsked(); else Feedback.markAsked(now, Capture.actions());
    openFeedback({ prompted: true, why: d.why });
    return true;
  }
  setInterval(() => { if (document.visibilityState === "visible") maybePrompt(Routes.parseRoute(location.hash).name); }, 30000);
  // ---------- the guide (the usability pass of 2026-11-06; web/guide.js) ----------
  // A screen's tips on its first visit (route() calls Guide.after once the screen has drawn; while a run is due or open
  // the feedback prompt waits), and "Show me around" beside Feedback in the top bar and in the footer, which replays the
  // screen's tips. Shown only with CONFIG.GUIDE_ENABLED and on a screen with tips (never the door).
  const guideOn = () => !!((window.CONFIG || {}).GUIDE_ENABLED && window.Guide);
  const guideShown = name => guideOn() && name !== "door" && Guide.has(name);
  const guideCtx = () => ({ campus: campusGate().open, resume: !!state.resume, signedIn: !!(window.Auth && Auth.stored()), config: window.CONFIG, busy: fbOpen || !!document.querySelector("#drawer") });
  const guideLink = name => guideShown(name) ? `<button type="button" class="toplink linkish" data-guide title="${esc(Copy.guide.relaunchAria)}">${esc(Copy.guide.relaunch)}</button>` : "";
  const noteSignedIn = () => { if (window.Feedback) Feedback.signedIn(Date.now()); };
  // where the sign-in returns to: a hash of this site, never the sign-in itself
  const nextHash = q => Routes.You.back(q) || "#/home";   // the same rule as the résumé step's `next` (Routes.You.back)
  const signinHref = () => `#/signin?next=${encodeURIComponent(location.hash || "#/home")}`;
  const toHash = h => location.replace(location.pathname + location.search + h);   // replaced, not pushed: Back leaves as it came
  let screenNow = null;   // the screen route() drew last (the door's chrome reads it)
  let bouncedFrom = null; // the roster screen route() just sent home (Door.reach): home says why, once
  function route() {
    if (!CAMPUSES) { campusesP.then(route); return; }   // the campus gate reads the campus list: once, before the first draw
    // a magic link lands with its tokens in the hash (#access_token=…, or #/map#access_token=…): web/auth.js keeps the
    // session and the hash becomes #/map before anything parses it; a spent or expired link lands on the sign-in
    const landed = window.Auth && mapsOn() ? Auth.takeHash(location.hash) : null;
    // the map's own address the sign-in was asked from (maps.next, kept by signinScreen) comes back after the link
    if (landed) { let back = "#/map"; if (landed === "session") { try { back = MapGate.landing(localStorage.getItem("maps.next")); localStorage.removeItem("maps.next"); } catch { } } history.replaceState(null, "", location.pathname + location.search + (landed === "session" ? back : "#/signin?expired=1")); if (landed === "session") noteSignedIn(); }
    const parsed = Routes.parseRoute(location.hash);
    if (!restoredOnce) { restoredOnce = true; if (stateOn()) restoreState(Auth.stored()); }   // step 3: the server's copy, once per page
    unmount(true);
    // a deep link bounces to the door once (v19 B2): the hash stays, the door draws over it, and Continue or Skip
    // (Door.next) lands on the hash. The sign-in and the map never bounce: an invited person comes from the email.
    const invited = mapsOn() && (parsed.name === "signin" || parsed.name === "map");
    // #/classes and #/professor/<slug> are home for a visitor whose address opens no roster (Door.reach, 2026-11-04):
    // the URL is rewritten too, so the address bar never says a screen the person cannot reach
    const name0 = !invited && Door.bounce(location.hash, doorKept().seen || returned(location.hash)) ? "door" : parsed.name;
    const name = Door.reach(name0, campusGate().open), { id, slug } = parsed.params;
    // home then says why, once (bouncedFrom: home() reads it and clears it)
    if (name !== name0) { bouncedFrom = name0; toHash("#/home"); return; }
    // #/jobs, #/skills and #/network exist so the hrefs never change: #/jobs is Find jobs (B4), #/skills the launcher
    // and #/network Who to meet (B5); #/explore, a field and the event screen stay at their routes
    const go = { door, home, jobs: jobsScreen, skills: skillsScreen, network: networkScreen, you, explore, field: () => field(id), event: () => eventScreen(id), role: () => roleScreen(id), fit: () => fitScreen(id), course: () => courseScreen(id), play: () => play(slug), about, classes: () => ClassScreens.classes(shellCtx), professor: () => ClassScreens.professor(slug, shellCtx), signin: () => mapsOn() ? signinScreen() : ClassScreens.signin(shellCtx), map: mapScreen }[name];
    screenNow = name; SkillMap.leave(); leaveRail(); topBar(name);
    // every route is a screen event (2026-11-05, web/capture.js SCREENS; the drop-off report counts them): the launcher
    // sends the same event Explore sends, since it is the screen that picks a role; the door sends `door` (v19 B7) and
    // `door_passed` itself when Continue or Skip goes through; the rest carry the id on screen
    const ctx = { door: { surface: "door" }, field: { field_id: id }, event: { field_id: id }, role: { role_id: id }, play: { role_id: slug } }[name] || {};
    const ev = window.Capture ? Capture.screen(name) : null;
    if (ev) track(ev, ctx);
    go().then(() => { if (Routes.parseRoute(location.hash).name !== name) return; if (!(guideOn() && Guide.after(name, guideCtx()))) maybePrompt(name); }).catch(fail);
  }
  window.addEventListener("hashchange", route);
  { const ff = $("#foot-feedback"); if (ff) { ff.textContent = FB.link; ff.hidden = !feedbackOn(); ff.onclick = () => openFeedback({ prompted: false }); } }
  { const fg = $("#foot-guide"); if (fg) { fg.textContent = Copy.guide.relaunch; fg.title = Copy.guide.relaunchAria; fg.onclick = () => Guide.relaunch(screenNow, guideCtx()); } }
  { const fa = document.querySelector("footer.foot a[href='#/about']"); if (fa) fa.textContent = Copy.about.heading; }   // the page's own name

  // ---------- 1. the door and home (v19 B2) ----------
  // the games list, for a game's own screen (web/data/games.json)
  let gamesP = null;
  const games = () => gamesP ||= Atlas.fetchJson("data/games.json").catch(() => []);
  // the role count every screen says (2026-11-06): the roles the index lists, the product set's among them once its
  // file is loaded (the launcher, Explore and the skill card count the same). Home says the exact number too
  // (2026-11-08; it said "over 60", rounded down, while the launcher said 69): until the product file is in
  // (productCounted) its line names no number, and it draws the line again when the file arrives, so no smaller
  // number shows first
  const roleCount = ix => Object.keys(ix.roles).length;
  const productCounted = ix => ix.groups.some(g => g.set === "product" && g.roles.length > 0);
  // The one count of open postings every screen says (owner's feedback 2026-11-01: home said "over 31 thousand" while
  // the footer said 25,950, the MBA set alone): the open US postings of every role set the site shows that Find jobs
  // searches, and the employers behind them. data/jobs_meta.json carries the numbers beside the Find jobs file (B4;
  // pipeline.jobs_open asserts n_open is the row count of jobs_open.json and tests/web/jobs.test.mjs checks it), so
  // home, #/about and the Find jobs lead (rows.length, nCompanies) agree. With the tech set switched off
  // (CONFIG.TECH_ENABLED) the counts are the meta's without_tech, the same rows jobsData keeps. When the meta file is
  // missing the Find jobs file itself is counted, never another index's number. Home says it in words, rounded down.
  let jobsMetaP = null;
  const jobsMeta = () => jobsMetaP ||= Atlas.fetchJson("data/jobs_meta.json").catch(() => null);
  const techShown = () => !!(window.CONFIG || {}).TECH_ENABLED;
  const openCounts = () => jobsMeta().then(jm => { const c = jm && (techShown() || !jm.by_set || !jm.by_set.tech ? jm : jm.without_tech); return c && c.n_open > 0 && c.n_companies > 0 ? { nOpen: c.n_open, nCompanies: c.n_companies }
    : jobsData().then(J => ({ nOpen: J.rows.length, nCompanies: J.nCompanies })).catch(() => ({ nOpen: 0, nCompanies: 0 })); });
  const homeCounts = (ix, n) => ({ nOpen: n.nOpen, nCompanies: n.nCompanies, nRoles: productCounted(ix) ? roleCount(ix) : 0 });
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
  // "Skip for now" with nothing typed (the Tally door's own Skip, and the door's chrome): what the door kept stays,
  // the door counts as seen, and door_passed goes out as the native Skip sends it
  function skipDoor() { const k = doorKept(); keepDoor(k.email, k.where); track("door_passed", doorCtx(k.where)); }
  // On the door, the top bar's verbs, the brand and the footer's About pass the door as "Skip for now" does and land
  // where they point (owner, 2026-11-06; before, the hash changed and the door drew again). A cold deep link still
  // meets the door once (Door.bounce): only a click from the door's own chrome passes it.
  document.addEventListener("click", e => {
    if (screenNow !== "door" || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("#verbs a[href], header a.brand[href], footer.foot a[href]");
    const to = a && Door.pass(a.getAttribute("href")); if (!to) return;
    e.preventDefault(); skipDoor();
    if (location.hash === to) route(); else location.hash = to;
  });
  // The door: what GradBuddy is, what is inside, then the form: Tally's when CONFIG.TALLY.door is set (web/doors.js
  // mounts it, with the native form as the fallback after three seconds), else the native one: an email and the program
  // question, Continue, Skip for now. Both buttons keep what was typed (keepDoor) and go where the person was headed
  // (Door.next); Continue with an address also sends it with the source `door` (Doors.nativeSubmit), Skip sends
  // nothing. `door_passed` goes out when either button goes through, or when Tally reports the form submitted.
  async function door() {
    crumbs([]); showAside(null);
    const kept = doorKept();
    const C = Door.COPY, school = Door.schoolLine(CAMPUSES || []);
    const nativeForm = () => `<form class="door-form" id="door-form" novalidate="">
          <label class="dlabel">${esc(C.email)}<input type="email" name="email" placeholder="${esc(C.emailPlaceholder)}" autocomplete="email" value="${esc(kept.email)}"></label>
          <label class="dlabel">${esc(C.where)}<select name="where"><option value="">${esc(C.pick)}</option>${Q[0].options.map(([id, label]) => `<option value="${esc(id)}"${kept.where === id ? " selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
          ${school ? `<p class="m-0 small muted">${esc(school)}</p>` : ""}
          <p class="door-acts"><button type="submit" class="btn primary">${esc(C.button)}</button><a class="door-skip" href="${esc(Door.next(location.hash))}" id="door-skip">${esc(C.skip)}</a></p>
        </form>`;
    const tally = !accountsOn() && !!(window.Doors && Doors.formIdFor("door", null, formTheme()));   // with accounts, the door is its own form
    page(`<section class="door">
        <h1>${esc(C.heading)}</h1>
        ${C.intro.map(t => `<p class="lead">${esc(t)}</p>`).join("")}
        <p class="lead">${esc(C.inside)}</p>
        <div class="door-slot" id="door-slot">${tally ? "" : nativeForm()}</div>${tally ? `<p class="small muted door-loading" id="door-loading">${esc(CM.loadingForm)}</p>
        <p class="door-acts door-tally-acts" id="door-tally-acts"><a class="door-skip" href="${esc(Door.next(location.hash))}" id="door-tally-skip">${esc(C.skip)}</a></p>` : ""}
        ${tally ? "" : `<p class="small muted door-privacy">${esc(C.privacy)}</p>`}
      </section>`, true);
    const go = () => { const next = Door.next(location.hash); if (location.hash === next) route(); else location.hash = next; };
    const passed = where => track("door_passed", doorCtx(where));
    // the site's own Skip under the Tally slot (2026-11-06): the native Skip with no form to read, so what the door kept
    // stays and the door counts as seen; the native fallback brings its own Skip, and this one goes
    const tallySkip = $("#door-tally-skip");
    if (tallySkip) tallySkip.onclick = e => { e.preventDefault(); skipDoor(); go(); };
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
      onFallback: () => { dropLoading(); const acts = $("#door-tally-acts"); if (acts) acts.remove(); wireNative(); },
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
      // the top bar drew before the return was kept: draw it again, so a campus address shows Find classes at once
      if (ret.email || ret.where) { keepDoor(ret.email, whereId(ret.where)); history.replaceState(null, "", location.pathname + location.search + Doors.clearQuery(location.hash)); topBar("home"); }
    }
    // after a bounce from Find classes or a professor (Door.reach), one line says who the screen is for and links to
    // the door (#/), where the email can change; a visit to home without a bounce draws no line
    const bounced = bouncedFrom; bouncedFrom = null;
    const [ix, n] = await Promise.all([Atlas.index(), openCounts()]);
    const C = Door.COPY;
    const bounceLine = bounced ? Door.bounceLine(CAMPUSES || []) : "";
    let doneHere = false;   // finished or skipped the inline questions on this visit: the summary, even with nothing answered
    const drawYou = () => {
      const body = $("#home-you-body"); if (!body) return;
      if (doneHere || youAnswered()) body.innerHTML = youLine(ix);
      else youInline(body, { onDone: () => { doneHere = true; drawYou(); } }).catch(console.error);
    };
    const render = () => {
      // Build skills is a card too (owner, 2026-11-11); a visitor who cannot sign in yet reads that it opens by invite
      const cards = Door.withBuild(Door.verbs(doorKept().email, homeCounts(ix, n), null, CAMPUSES || []).filter(v => v.open), buildBar(), !accountsOn() && !Auth.stored() && !openOn())
        .map(v => `<a class="verb" href="${esc(v.href)}" data-verb="${esc(v.key)}"><span class="t">${esc(v.title)}</span><span class="d">${esc(v.line)}</span></a>`);
      page(`<h1>${esc(C.home)}</h1>${bounceLine ? `<p class="notice home-bounce" role="status">${esc(bounceLine)} <a href="#/">${esc(Copy.home.changeEmail)}</a></p>` : ""}<div class="verbs n${cards.length}">${cards.join("")}</div>
        <section class="home-you" aria-labelledby="home-you-h"><h2 id="home-you-h">${esc(YOU.inline.heading)}</h2><div id="home-you-body"></div></section>`);
      main.firstElementChild.classList.add("home-page");
      main.querySelectorAll("a.verb[data-verb]").forEach(a => a.onclick = () => a.dataset.verb === "build" ? (window.Capture && Capture.cta("home_build", "click")) : track("home_" + a.dataset.verb, { surface: a.dataset.verb }));
      drawYou();
    };
    render();
    // the role count with the product set's roles: only the card's line changes, so the questions below stay as they are
    Atlas.product().then(() => {
      if (Routes.parseRoute(location.hash).name !== "home") return;
      const v = Door.verbs(doorKept().email, homeCounts(ix, n), null, CAMPUSES || []).find(x => x.key === "skills"), d = main.querySelector('a.verb[data-verb="skills"] .d');
      if (v && d) d.textContent = v.line;
    }).catch(() => { });
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
    matchCache.set(key, out);
    saveReadFor(out, state.resume);   // the read goes up once per résumé and role (step 3); nothing waits on it
    return out;
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
    // The launcher opens for everyone; the map has its own section, Build skills (decision K, 2026-11-10, revising
    // E1). No sign-in line here since 2026-11-12: the sign-in opens by its own address (#/signin) only.
    const ix = await Atlas.index(); await Atlas.product().catch(console.error);   // the Product tile carries its roles
    if (!here()) return;
    const F = Launcher.fields(ix), q0 = Routes.parseRoute(location.hash).query;
    const s = { q: q0.q || "", field: F.some(f => f.id === q0.field) ? q0.field : null, change: false };
    const writeHash = () => { const p = new URLSearchParams(); if (s.q.trim()) p.set("q", s.q.trim()); if (s.field) p.set("field", s.field); const next = "#/skills" + (p.toString() ? "?" + p : ""); if (location.hash !== next) history.replaceState(null, "", location.pathname + location.search + next); };
    // ---- the left two thirds: the search, the tiles, a field's roles ----
    const row = (r, withField) => `<a class="r" href="#/role/${esc(r.id)}"><span class="t">${esc(r.label)}</span><span class="n">${esc(Launcher.fill(C.open, { open: fmt(r.nOpen) }))}</span><span class="m">${withField && r.field ? esc(r.field.label) + " · " : ""}${r.asks.length ? esc(Launcher.fill(C.asks, { asks: r.asks.join(", ") })) : ""}</span></a>`;
    const tiles = on => `<div class="fcards lf-tiles">${F.map(f => `<button type="button" class="fcard${on === f.id ? " on" : ""}" data-field="${esc(f.id)}" aria-pressed="${on === f.id}"><span class="t">${esc(f.label)}</span><span class="n">${esc(Launcher.fill(f.roles.length === 1 ? C.tileOne : C.tile, { roles: f.roles.length, open: fmt(f.nOpen) }))}</span></button>`).join("")}</div>`;
    const left = () => {
      if (s.q.trim()) { const hits = Launcher.searchRoles(ix, s.q); return hits.length ? `<p class="lf-lab">${esc(Launcher.hitsLine(hits.length))}</p><div class="list">${hits.map(r => row(r, true)).join("")}</div>` : `<p class="lf-lab">${esc(C.noHit)}</p>${tiles(null)}`; }
      // a picked field's roles take the tiles' place (owner, 2026-11-01), with the way back to the tiles above them
      const f = F.find(x => x.id === s.field);
      if (f) return `<p class="lf-lab"><button type="button" class="linkish link lf-back" id="lf-back">${esc(C.backToFields)}</button></p><section class="lf-field"><h2>${esc(f.label)}</h2><p class="small muted">${esc(Launcher.fill(f.roles.length === 1 ? C.fieldLineOne : C.fieldLine, { roles: f.roles.length, open: fmt(f.nOpen) }))}</p><div class="list">${f.roles.map(r => row(r, false)).join("")}</div></section>`;
      return `<p class="lf-lab">${esc(C.pickField)}</p>${tiles(null)}`;
    };
    // ---- the right third: the résumé form, or the light match once it is read ----
    let light = null;   // closestFits for the résumé on file
    const you = `<p class="small muted lf-you"><a href="#/you">${esc(C.you)}</a></p>`;
    const right = () => {
      if (!state.resume || s.change) return `<section class="lf-step"><h2>${esc(C.resume.heading)}</h2><p class="small muted">${esc(C.resume.privacy)}</p>${resumeForm()}${you}</section>`;
      const onFile = `<p class="small muted">${esc(state.resume.name)} · ${esc(Routes.You.aiRead(state.resume) ? C.resume.onFile : C.resume.onFileLocal)} · <button type="button" class="linkish link" id="lf-change">${esc(C.resume.change)}</button></p>`;
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
    // focus follows the person (B-12): a tile hands it to the field's first role, the way back to the tile it came from
    const wireLeft = () => {
      main.querySelectorAll("[data-field]").forEach(b => b.onclick = () => { s.field = b.dataset.field; s.q = ""; $("#lf-q").value = ""; drawLeft(); const r = main.querySelector("#lf-body .lf-field a.r"); if (r) r.focus(); });
      const back = $("#lf-back"); if (back) back.onclick = () => { const was = s.field; s.field = null; drawLeft(); const t = was && main.querySelector(`#lf-body [data-field="${CSS.escape(was)}"]`); if (t) t.focus(); };
    };
    const drawLeft = () => { $("#lf-body").innerHTML = left(); wireLeft(); writeHash(); };
    const wireRight = () => {
      if ($("#drop")) wireResumeForm(() => { s.change = false; drawRight(); });
      const ch = $("#lf-change"); if (ch) ch.onclick = () => { s.change = true; drawRight(); const p = $("#file-pick"); if (p) p.focus(); };
    };
    const drawRight = () => {
      $("#lf-side").innerHTML = right(); wireRight();
      if (state.resume && !s.change && (!light || light.text !== state.resume.text)) { const text = state.resume.text; closestFits(ix).then(res => { if (!here() || !state.resume || state.resume.text !== text) return; light = res; drawRight(); }).catch(e => { console.error(e); if (here()) { light = { text, failed: true, chosen: null, rows: [] }; $("#lf-side").innerHTML = right(); wireRight(); } }); }
    };
    page(`<h1>${esc(C.heading)}</h1><p class="lead lf-lead">${esc(Launcher.lead(ix))} <a href="#/explore?view=map" class="lf-map">${esc(C.mapLink)}</a></p>
      <div class="lf"><div class="lf-side" id="lf-side"></div><section class="lf-main" aria-label="${esc(C.rolesAria)}"><input type="search" class="lf-q" id="lf-q" value="${esc(s.q)}" placeholder="${esc(C.search)}" aria-label="${esc(C.searchLabel)}" autocomplete="off"><div id="lf-body"></div></section></div>`);
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
  // #/signin, invited mode: what Build skills is, an email, Email me a code, then the sent state with the code box (the
  // email's link works too), the refused line (with a way
  // to ask for an invite and the way back to Explore careers) or the failure. A session already on file goes to the
  // map, or to the map's own address the sign-in came from (?next=, MapGate.landing). GoTrue sends the link to an
  // existing user only (web/auth.js), and always to #/map: the next hash waits in maps.next until the link lands.
  async function signinScreen() {
    const S = Copy.signin;
    crumbs([[S.crumb, null]]); showAside(null);
    if (accountsOn()) { codeSignin(); return; }
    const q = Routes.parseRoute(location.hash).query, next = MapGate.landing(q.next);
    if (Auth.stored()) { toHash(next); return; }
    const expired = q.expired === "1";
    page(`<h1>${esc(S.heading)}</h1><p class="lead">${esc(S.mapLine)}</p><p>${esc(S.lead)}</p>${expired ? `<p class="si-no">${esc(S.expired)}</p>` : ""}
      <form class="si" id="si" novalidate><input type="email" id="si-email" required autocomplete="email" placeholder="${esc(S.emailPlaceholder)}" aria-label="${esc(S.email)}"><button class="btn primary" type="submit" id="si-send">${esc(S.button)}</button></form>
      <div class="si-out" id="si-out" aria-live="polite"></div>
      <p class="small muted si-note">${esc(S.note)} <a href="#/skills" id="si-explore">${esc(S.explore)}</a></p>`, true);
    const out = $("#si-out"), send = $("#si-send");
    $("#si").onsubmit = async e => {
      e.preventDefault();
      const email = $("#si-email").value.trim();
      send.disabled = true; out.innerHTML = `<p class="small muted">${esc(S.sending)}</p>`;
      try { if (next !== "#/map") localStorage.setItem("maps.next", next); else localStorage.removeItem("maps.next"); } catch { }   // no stale page from an earlier send
      const r = await Auth.sendLink(email);
      send.disabled = false;
      if (Routes.parseRoute(location.hash).name !== "signin") return;
      const refused = !r.ok && r.message === S.refused;
      const ask = refused && feedbackOn() ? `<button type="button" class="linkish link" id="si-ask">${esc(S.askInvite)}</button> · ` : "";
      // sent: the email carries a code and a link, so the page takes the code here (the link lands on #/map as before)
      out.innerHTML = r.ok ? `<div class="wait"><b>${esc(S.sent)}</b><p class="small muted">${esc(fill(S.sentTo, { email }))} ${esc(S.sentLink)}</p></div>
          <form class="si" id="si-codeform" novalidate><input type="text" id="si-code" class="si-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="${esc(S.codePlaceholder)}" aria-label="${esc(S.code)}"><button class="btn primary" type="submit" id="si-verify">${esc(S.verify)}</button></form>
          <div class="si-out" id="si-codeout" aria-live="polite"></div>`
        : `<p class="si-no">${esc(r.message || S.failed)}</p>${refused ? `<p class="small si-ask">${ask}<a href="#/skills">${esc(S.explore)}</a></p>` : ""}`;
      const ex = $("#si-explore"); if (ex) ex.hidden = refused;   // the way back once: under the refused line when it shows
      const b = $("#si-ask"); if (b) b.onclick = () => openFeedback({ prompted: false, lead: FB.inviteLead, email });
      const cf = $("#si-codeform");
      if (cf) {
        const cout = $("#si-codeout"), vb = $("#si-verify");
        cf.onsubmit = async ev => {
          ev.preventDefault();
          vb.disabled = true; cout.innerHTML = `<p class="small muted">${esc(S.verifying)}</p>`;
          const v = await Auth.verifyCode(email, $("#si-code").value);
          if (Routes.parseRoute(location.hash).name !== "signin") return;
          if (!v.ok) { vb.disabled = false; cout.innerHTML = `<p class="si-no">${esc(v.message || S.codeWrong)}</p>`; return; }
          try { localStorage.removeItem("maps.next"); } catch { }   // the code lands here; no link will read it
          toHash(next); if (location.hash === next) route();
        };
        setTimeout(() => { const i = $("#si-code"); if (i) i.focus(); }, 0);
      }
    };
  }
  // the code flow (step 2): the email, then the six-digit code, then back to where the person came from (?next=);
  // a session on file goes there at once. The verified address is kept as the door's, so the campus rule reads it.
  function codeSignin() {
    const S = Copy.signin, next = nextHash(Routes.parseRoute(location.hash).query.next);
    if (Auth.stored()) { toHash(next); return; }
    if (window.Capture) Capture.cta("signin", "shown");
    let email = doorKept().email || "";
    const draw = (step, msg) => {
      page(`<h1>${esc(S.heading)}</h1><p class="lead">${esc(S.codeLead)}</p>${msg ? `<p class="si-no">${esc(msg)}</p>` : ""}
        ${step === "email" ? `<form class="si" id="si" novalidate><input type="email" id="si-email" required autocomplete="email" placeholder="${esc(S.codeEmailPlaceholder)}" aria-label="${esc(S.email)}" value="${esc(email)}"><button class="btn primary" type="submit" id="si-send">${esc(S.codeButton)}</button></form>`
          : `<div class="wait"><b>${esc(fill(S.codeSent, { email }))}</b></div>
             <form class="si" id="si" novalidate><input type="text" id="si-code" class="si-code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="${esc(S.codePlaceholder)}" aria-label="${esc(S.code)}"><button class="btn primary" type="submit" id="si-send">${esc(S.verify)}</button></form>
             <p class="si-again"><button type="button" class="linkish link" id="si-again">${esc(S.another)}</button><button type="button" class="linkish link" id="si-change">${esc(S.changeEmail)}</button></p>`}
        <div class="si-out" id="si-out" aria-live="polite"></div>
        <p class="small muted si-note">${esc(S.codeNote)} <a href="#/skills">${esc(S.explore)}</a></p>`, true);
      const here = () => Routes.parseRoute(location.hash).name === "signin";
      const send = $("#si-send"), out = $("#si-out");
      if (step === "email") {
        $("#si").onsubmit = async e => {
          e.preventDefault(); email = $("#si-email").value.trim();
          send.disabled = true; out.innerHTML = `<p class="small muted">${esc(S.sending)}</p>`;
          const r = await Auth.sendCode(email);
          if (!here()) return;
          if (r.ok) { if (window.Capture) Capture.cta("signin", "click"); draw("code"); } else draw("email", r.message || S.failed);
        };
        setTimeout(() => { const i = $("#si-email"); if (i) i.focus(); }, 0);
      } else {
        $("#si").onsubmit = async e => {
          e.preventDefault(); const code = $("#si-code").value;
          send.disabled = true; out.innerHTML = `<p class="small muted">${esc(S.verifying)}</p>`;
          const r = await Auth.verifyCode(email, code);
          if (!here()) return;
          if (!r.ok) { draw("code", r.message || S.codeWrong); return; }
          try { localStorage.setItem("door.email", r.session.email || email); localStorage.setItem("door.seen", "1"); } catch { }
          if (window.Capture) Capture.cta("signin", "done");
          noteSignedIn();
          await restoreState(r.session);   // the server's copy fills this browser; this browser's answers go up
          out.innerHTML = `<p class="small">${esc(fill(S.done, { email: r.session.email || email }))}</p>`;
          toHash(next); if (location.hash === next) route();
        };
        $("#si-again").onclick = async () => { const r = await Auth.sendCode(email); if (here()) draw("code", r.ok ? null : (r.message || S.failed)); };
        $("#si-change").onclick = () => draw("email");
        setTimeout(() => { const i = $("#si-code"); if (i) i.focus(); }, 0);
      }
    };
    draw("email");
  }
  // #/map, the Build skills section (decision K, 2026-11-10): it walks a person through what is missing, in order.
  // Without a session, the sign-in, which comes back to the same address (MapGate.signinHash); with a session and no
  // map file, the tree form as the section's first step (with TREE_ENABLED off, the waiting line); with a map, its two
  // pages (below; #/map and the old #/map?tab=tree become #/map/quests and #/map/tree in place). MAPS_ENABLED off: the
  // launcher. The top bar holds the way to the other sections, so no screen here repeats it.
  async function mapScreen() {
    const MC = Copy.map;
    crumbs([]); showAside(null);
    if (!mapsOn()) { toHash("#/skills"); return; }
    // the skill tree off (CONFIG.SKILL_TREE_ENABLED, 2026-11-27): #/map is the open flow for everyone, a session
    // included; no map file is read and no tree, Quests page or #/map/start draws
    if (!skillTreeOn() && openOn()) { await openScreen(); return; }
    page(`<h1>${esc(MC.heading)}</h1><p class="lead">${esc(MC.loading)}</p>`, true);
    const g = await mapGate();
    if (Routes.parseRoute(location.hash).name !== "map") return;
    // no session: the open tree when its flag is on (2026-11-11; below), else the sign-in with the map's own address
    if (g.gate === "signin") { if (openOn()) { await openScreen(); return; } toHash(MapGate.signinHash(location.hash)); return; }
    const out = `<button type="button" class="linkish link" id="map-out">${esc(MC.signOut)}</button>`;
    const build = Routes.parseRoute(location.hash).query.build === "1";
    // "Start a side project" (2026-11-11): #/map/start with the flag on, and the first step for a person with no map
    // yet; with the flag off #/map/start lands on the Quests page below (or the tree form when there is no map)
    const startAsked = Routes.parseRoute(location.hash).parts[1] === "start";
    if (questsOn() && (g.gate === "map" || g.gate === "waiting") && (startAsked || (g.gate === "waiting" && !build))) {
      if (!startAsked) history.replaceState(null, "", location.pathname + location.search + "#/map/start");
      await startScreen(g.map, out);
      return;
    }
    if (g.gate === "map" && !(build && treeOn() && selfServe(g.map))) {
      const ix = await Atlas.index().catch(e => { console.error(e); return null; });   // what a skill is, its area, the co-asked pairs
      const R0 = Routes.parseRoute(location.hash);
      if (R0.name !== "map") return;
      const sub = R0.parts[1] === "tree" || (R0.parts[1] !== "quests" && R0.query.tab === "tree") ? "tree" : "quests";
      const p = new URLSearchParams(R0.search); p.delete("tab");
      const want = `#/map/${sub}` + (p.toString() ? "?" + p : "");
      if (location.hash !== want) history.replaceState(null, "", location.pathname + location.search + want);
      drawMap(g.map, ix, out);
      if (selfServe(g.map)) setTimeout(() => { if (Routes.parseRoute(location.hash).name === "map") maybePrompt("map", { treeOpened: true }); }, 1500);
    } else if (treeOn() && (g.gate === "waiting" || g.gate === "map")) {
      await treeForm(out, !g.map);
      if (Routes.parseRoute(location.hash).name !== "map") return;
    } else {
      page(`<h1>${esc(MC.heading)}</h1><p class="lead">${esc(g.gate === "failed" ? MC.failed : MC.waiting)}</p><p class="small muted">${out}</p>`, true);
      main.firstElementChild.classList.add("roomy");
    }
    $("#map-out").onclick = async () => { mapHeld = null; mapUi = null; await Auth.signOut(); location.hash = "#/skills"; };
  }
  // ---------- the self-serve tree (the visitor journey, step 4, 2026-11-05) ----------
  // A signed-in person with no map builds one here: the résumé on file (or the drop zone), a field, the role the tree
  // builds on, up to three more roles of the field, a posting to paste if they have one. POST /api/tree grounds the
  // class with the atlas's own modules and writes maps/<uid>/map.json; the map screen then reads it as any map. A map
  // the owner wrote by hand is never overwritten (409): the form says so. The site's own map carries
  // student.self_serve, and its screen gets the line "Built from your résumé on …" with the way back here (?build=1).
  const treeOn = () => mapsOn() && !!(window.CONFIG || {}).TREE_ENABLED;
  // who sees a door into the map: the top bar's Build skills and the fit screen's "Get your tree" (decision K,
  // 2026-11-10). The tree must be on, and the person must be able to sign in: anyone with accounts on, else only a
  // session on this browser (the invited map users). A visitor who cannot sign in never sees a door that refuses them.
  const buildOn = () => treeOn() && (accountsOn() || !!Auth.stored() || openOn());
  // The open tree (2026-11-11, CONFIG.OPEN_TREE_ENABLED): a visitor with no session gives an email, a résumé and the
  // roles, and the tree is grounded in this browser (web/apprentice.js, loaded then) and kept in localStorage under
  // open.tree; nothing is written to the maps bucket and no function is called. The email goes to the waitlist table
  // under its `build` source. Under the tree: two projects from the tree and the standards file (web/preview.js, no
  // model) and the booking card (CONFIG.BOOKING_TALLY). The quest pages and #/map/start stay a session's.
  const openOn = () => treeOn() && !!(window.CONFIG || {}).OPEN_TREE_ENABLED;
  const OPEN_KEY = "open.tree";
  // The open tree's build quests (2026-11-11, CONFIG.OPEN_QUESTS_ENABLED): once the tree is built, POST /api/open asks
  // Claude Opus 5.5 for three portfolio projects (the generator of /api/quests, no session; web/api/open.js holds the
  // caps). They become cards of the map held in this browser (Quests.cardOf). With SKILL_TREE_ENABLED on they are the
  // Quests page a signed-in person has, with Start, Mark shipped and Skip kept in open.tree; off, they are the three
  // cards of #/map/projects and the one picked (projectsScreen). When the function refuses or fails, the two projects
  // of web/preview.js show instead.
  const openQuestsOn = () => openOn() && !!(window.CONFIG || {}).OPEN_QUESTS_ENABLED;
  // The skill tree and its pages (CONFIG.SKILL_TREE_ENABLED, 2026-11-27, owner): off, #/map is the open flow for
  // everyone, a session included (mapScreen): the questions, then #/map/projects. The tree is still grounded here,
  // since the projects aim at its gaps; no page draws it.
  const skillTreeOn = () => !!(window.CONFIG || {}).SKILL_TREE_ENABLED;
  // the owner's booking page for a free session (CONFIG.SESSION_URL): an http(s) address, else null and no line
  const linkedinUrl = () => { const u = (window.CONFIG || {}).LINKEDIN_URL; return typeof u === "string" && /^https?:\/\/[^\s"'<>]+$/i.test(u.trim()) ? u.trim() : null; };
  // the help line under the projects: the free session and, with a booking form, the paid one (the form's own page)
  const helpLine = held => {
    const P = Copy.map.open.projects, u = sessionUrl(); if (!u) return "";
    const paid = Preview.bookingHref((window.CONFIG || {}).BOOKING_TALLY, { email: (held || {}).email || "", role: (((held || {}).map || {}).role || {}).id || "" });
    const a = (href, id, text) => `<a href="${esc(href)}" target="_blank" rel="noopener" id="${id}">${esc(text)}</a>`;
    return `<p class="pj-help">${fill(esc(paid ? P.session : P.sessionOne), { free: a(u, "pj-session", P.sessionFree), paid: paid ? a(paid, "pj-session-paid", P.sessionPaid) : "" })}</p>`;
  };
  const sessionUrl = () => { const u = (window.CONFIG || {}).SESSION_URL; return typeof u === "string" && /^https?:\/\/[^\s"'<>]+$/i.test(u.trim()) ? u.trim() : null; };
  let openHeld = null, apprenticeP = null, standardsP = null, openWriting = null;
  const openKeep = held => { if (openHeld === held) store.set(OPEN_KEY, held); };   // never a tree the visitor forgot
  const openMap = held => { let m = { ...held.map, cards: [], worlds: [] }; for (const c of (openQuestsOn() && held.cards) || []) m = Quests.addSide(m, c); return m; };
  // the answers as /api/open takes them: the ones kept with the tree (2026-11-27), else a tree kept before (tech alone)
  const heldAnswers = held => held.answers || { tech: held.tech || null };
  // One write: the first one, or "None of these" (`ask`: { feedback, avoid }) with what should be different and the
  // titles already shown. The new cards replace the old ones and the pick; a failure keeps the old cards.
  const OPEN_WRITE_MS = 95000;
  function writeOpen(held, ask) {
    return openWriting ||= (async () => {
      const cta = ask ? "open_none" : "open_quests";
      held.asked = todayIso(); held.why = null; held.ask = ask ? { feedback: ask.feedback || "" } : null; openKeep(held);
      if (window.Capture) Capture.cta(cta, "click");
      try {
        const body = { email: held.email, text: state.resume.text, roles: held.roles || [held.map.role.id], posting: held.posting || "", answers: heldAnswers(held) };
        if (ask) { body.feedback = String(ask.feedback || "").slice(0, Quests.LIMITS.feedback); body.avoid = (ask.avoid || []).slice(-Quests.LIMITS.avoid); }
        // the function stops at 80 s; a request still open after OPEN_WRITE_MS is given up here, and Try again is offered
        const stop = new AbortController(), timer = setTimeout(() => stop.abort(), OPEN_WRITE_MS);
        let r, kit;
        try { [r, kit] = await Promise.all([fetch("api/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: stop.signal }), buildKit()]); }
        finally { clearTimeout(timer); }
        if (!r.ok) throw Object.assign(new Error(`open ${r.status}`), { limited: r.status === 429 });
        const j = await r.json(), cards = [];
        let m = { ...held.map, cards: [], worlds: [] };
        for (const p of j.projects || []) { const c = Quests.cardOf(p, m, { kit, date: todayIso(), model: j.model }); cards.push(c); m = Quests.addSide(m, c); }
        if (!cards.length) throw new Error("open: no project");
        held.seen = [...new Set([...(held.seen || []), ...(held.cards || []).map(c => c.title)])].slice(-Quests.LIMITS.avoid);
        held.cards = cards; held.pick = null; held.ask = null; openKeep(held);
        if (window.Capture) Capture.cta(cta, "done");
        return "ok";
      } catch (e) { console.error(e); held.why = e.limited ? "limited" : "failed"; openKeep(held); return held.why; }
    })().finally(() => { openWriting = null; });
  }
  const loadApprentice = () => window.Apprentice ? Promise.resolve() : (apprenticeP ||= new Promise((res, rej) => {
    const el = document.createElement("script"); el.src = "apprentice.js"; el.onload = () => res();
    el.onerror = () => { apprenticeP = null; el.remove(); rej(new Error("apprentice.js did not load")); };
    document.head.appendChild(el);
  }));
  const openTree = () => { const h = openHeld || (openHeld = store.get(OPEN_KEY)); return h && h.map && h.map.role && h.map.tree && Array.isArray(h.map.tree.nodes) ? h : null; };
  // #/map in the open flow. The form (#/map/find/<step>) whenever the address names a step. With the skill tree off
  // (2026-11-27): #/map/projects and #/map/projects/<id> while projects are held here; every other address of the map
  // (#/map, #/map/tree, #/map/quests, #/map/start, ?build=1) lands on them, a bare #/map on the one picked; with
  // nothing held, or a role named in the address (the fit screen's link), the first question. With the tree on, as
  // before: the form while there is no tree, on ?build=1 and on a step, else the tree held in this browser.
  async function openScreen() {
    const R0 = Routes.parseRoute(location.hash), held = openTree(), sub = R0.parts[1];
    if (sub === "find") { await openForm(held); return; }
    if (!skillTreeOn()) {
      if (!held || R0.query.role) { await openForm(held); return; }
      const has = id => (held.cards || []).some(c => c.id === id);
      const id = sub === "projects" ? R0.parts[2] || null : !sub && !R0.query.build && held.pick && has(held.pick) ? held.pick : null;
      const want = "#/map/projects" + (id ? "/" + encodeURIComponent(id) : "");
      if (location.hash !== want) history.replaceState(null, "", location.pathname + location.search + want);
      await projectsScreen(held, id);
      return;
    }
    if (!held || R0.query.build === "1") { await openForm(held); return; }
    const ix = await Atlas.index().catch(e => { console.error(e); return null; });
    if (Routes.parseRoute(location.hash).name !== "map") return;
    // The tree, and the Quests page once the build quests are written (their marks live in this browser). The
    // side-project flow needs a session, so #/map/start comes to the tree, as the Quests page does with no quest.
    const map = openMap(held), page_ = map.cards.length && sub === "quests" ? "quests" : "tree";
    const p = new URLSearchParams(R0.search); p.delete("tab"); if (page_ === "tree") p.delete("q");
    const want = `#/map/${page_}` + (p.toString() ? "?" + p : "");
    if (location.hash !== want) history.replaceState(null, "", location.pathname + location.search + want);
    drawMap(map, ix, "", true);
    drawOpenNext(held, ix);
  }
  // ---------- the open form (#/map/find/<step>, 2026-11-12; the portfolio flow, 2026-11-27; the pure parts are Routes.OpenFlow) ----------
  // One question per screen, the side-project flow's look and its steps (stepFrame, techStep, toolsStep, shareStep):
  // the roles (the main role first, then up to three more of its field), the résumé with a posting tucked away, how
  // technical, the tools (what they use, the kit's kinds for the field, open to a new tool), where they would show the
  // work (the three only with the build quests on; they only steer the model), then the email and "Find my projects".
  // The answers stay in this browser (open.flow) and each step is an address, so Back and a reload keep the place.
  // Next is never a dead button: pressed with something missing, it says what beside it. The tree is grounded here as
  // before (web/apprentice.js); the answers go with the résumé to POST /api/open (writeOpen).
  const OPEN_FLOW_KEY = "open.flow";
  let openShown = false, openStepAt = null;
  async function openForm(held) {
    const prevStep = openStepAt;
    const S = Copy.map.flow, O = Copy.map.open, OF = Routes.OpenFlow;
    const atFind = () => { const R = Routes.parseRoute(location.hash); return R.name === "map" && R.parts[1] === "find"; };
    const R0 = Routes.parseRoute(location.hash);
    const [ix, kit] = await Promise.all([Atlas.index(), openQuestsOn() ? buildKit() : null]);
    if (Routes.parseRoute(location.hash).name !== "map") return;
    await Atlas.product().catch(e => console.error(e));   // the Product field's roles; without the file the field is left out
    if (Routes.parseRoute(location.hash).name !== "map") return;
    const F = treeRoles(ix, true), roles = OF.named(roleIndex(F, ix));
    const roleOf = id => roles.find(r => r.id === id) || null;
    const steps = OF.steps(openQuestsOn());
    // the answers: this browser's, else the tree held here (a rebuild starts from it); unknown roles dropped
    const saved = store.get(OPEN_FLOW_KEY);
    const flow = OF.clean(saved || (held ? { ...(held.flow || {}), roles: held.roles, email: held.email, posting: held.posting } : null));
    flow.roles = flow.roles.filter(roleOf);
    if (!flow.email) flow.email = (held || {}).email || doorKept().email || "";
    const picked = R0.query.role;   // the fit screen's link names the role
    if (picked && roleOf(picked)) flow.roles = OF.preselect(flow.roles, picked, id => (roleOf(id) || {}).field);
    const save = () => store.set(OPEN_FLOW_KEY, flow);
    save();
    const s = { q: "", err: "", errStep: null, browse: null, change: false, busy: false };
    const ctx = () => ({ roles: flow.roles, resume: !!state.resume, tech: flow.tech, email: flow.email });
    const stepNow = () => { const p = OF.step(Routes.parseRoute(location.hash).parts[2]); return steps.includes(p) ? p : steps[0]; };
    const to = step => location.pathname + location.search + "#/map/find/" + step;
    // into the form from #/map, ?build=1, an old address (accounts) or a step it cannot reach yet: the address becomes
    // the step, replaced
    { const want = atFind() ? stepNow() : steps[0], reach = OF.firstMissing(steps, ctx(), want) || want;
      if (!atFind() || location.hash !== "#/map/find/" + reach) history.replaceState(null, "", to(reach)); }
    const focusAsk = () => { const h = main.querySelector(".sp-ask"); if (h) h.focus({ preventScroll: true }); };
    const go = step => { history.pushState(null, "", to(step)); s.err = ""; s.errStep = null; draw(); window.scrollTo(0, 0); focusAsk(); };
    const missLine = k => ({ roles: O.roles.noRole, resume: O.resume.noResume, tech: O.noTech, email: O.badEmail })[k];
    const head = step => `<h1 class="sp-kicker">${esc(O.heading)}</h1>${step === steps[0] ? `<p class="sp-intro">${esc(O.lead)}</p>` : ""}`;
    const ask = (text, lead) => `<h2 class="sp-ask" tabindex="-1">${esc(text)}</h2>${lead ? `<p class="sp-hint">${esc(lead)}</p>` : ""}`;
    const errHtml = () => s.err ? esc(s.err) + (s.errStep && s.errStep !== stepNow() ? ` <button type="button" class="linkish link" id="sp-fix">${esc(O.last.goThere)}</button>` : "") : "";
    const field0 = () => flow.roles.length ? roleOf(flow.roles[0]).field : null;
    const fieldLabel = id => (roles.find(r => r.field === id) || {}).fieldLabel || (F.find(f => f.id === id) || {}).label || "";
    const draw = () => {
      if (!atFind()) return;
      const step = stepNow();
      crumbs([[O.heading, null]]); showAside(null);
      const f = field0(), fl = fieldLabel(f);
      const html = ({ roles: rolesHtml, resume: resumeHtml, tech: () => stepFrame({ steps, step: "tech", inner: head("tech") + techStep(flow, "h2"), err: errHtml() }), tools: () => stepFrame({ steps, step: "tools", inner: head("tools") + toolsStep(flow, kit, f, fl, "h2"), err: errHtml() }), share: () => stepFrame({ steps, step: "share", inner: head("share") + shareStep(flow, kit, f, "h2"), err: errHtml() }), email: emailHtml })[step]();
      page(html, true);
      main.firstElementChild.classList.add("roomy", "sp-page", "of-page");
      openStepAt = step;
      const back = $("#sp-back"); if (back) back.onclick = () => go(steps[steps.indexOf(step) - 1]);
      const fix = $("#sp-fix"); if (fix) fix.onclick = () => go(s.errStep);
      const nx = $("#sp-go");
      if (nx) nx.onclick = () => {
        if (step === "email") { find(); return; }
        const m = OF.missing(step, ctx());
        if (m) { s.err = missLine(m); s.errStep = step; draw(); const b = $("#sp-go"); if (b) b.focus(); return; }
        go(steps[steps.indexOf(step) + 1]);
      };
      ({ roles: wireRoles, resume: wireResume, tech: () => wireTechStep(flow, () => { save(); go("tools"); }), tools: () => wireToolsStep(flow, save, () => { save(); draw(); }), share: () => wireShareStep(flow, kit, f, save, () => { save(); draw(); }), email: wireEmail })[step]();
    };

    // ---------- a. the roles: the main role (a search, or a field and its roles as chips), then more of its field ----------
    function rolesHtml() {
      const A = S.aim, R = O.roles, f0 = field0(), full = flow.roles.length >= 4;
      const chips = flow.roles.map(id => `<span class="chip on sp-role">${esc(roleOf(id).name)}<button type="button" data-drop="${esc(id)}" aria-label="${esc(fill(A.remove, { role: roleOf(id).name }))}">×</button></span>`).join("");
      const search = `<div class="sp-ta"><input type="search" id="sp-q" role="combobox" aria-expanded="false" aria-controls="sp-hitbox" aria-autocomplete="list" value="${esc(s.q)}" placeholder="${esc(A.search)}" aria-label="${esc(A.searchLabel)}" autocomplete="off"${full ? " disabled" : ""}><div id="sp-hits"></div></div>`;
      if (!f0) {
        const f = F.find(x => x.id === s.browse);
        const fieldBtns = F.map(x => `<button type="button" class="chip" data-browse="${esc(x.id)}" aria-pressed="${s.browse === x.id}">${esc(x.label)}</button>`).join("");
        const list = f ? `<p class="sp-or" id="sp-browse-h">${esc(fill(R.fieldRoles, { field: f.label }))}</p><div class="sp-quick" role="group" aria-labelledby="sp-browse-h">${roles.filter(r => r.field === f.id).map(r => `<button type="button" class="chip" data-toggle="${esc(r.id)}" aria-pressed="false">${esc(r.label)}</button>`).join("")}</div>` : "";
        return stepFrame({ steps, step: "roles", err: errHtml(), inner: `${head("roles")}${ask(R.title, R.lead)}${search}
          <p class="sp-or">${esc(R.browse)}</p><div class="sp-quick sp-fields" role="group" aria-label="${esc(R.browseAria)}">${fieldBtns}</div>
          <div id="sp-browse">${list}</div>` });
      }
      const fl = fieldLabel(f0), more = roles.filter(r => r.field === f0 && r.id !== flow.roles[0]);
      return stepFrame({ steps, step: "roles", err: errHtml(), inner: `${head("roles")}${ask(R.title)}
        <div class="sp-picked">${chips}</div>
        <p class="sp-or" id="sp-more-h">${esc(fill(R.more, { field: fl }))}</p>
        <div class="sp-quick" id="sp-browse" role="group" aria-labelledby="sp-more-h">${more.map(r => { const on = flow.roles.includes(r.id); return `<button type="button" class="chip" data-toggle="${esc(r.id)}" aria-pressed="${on}"${!on && full ? " disabled" : ""}>${esc(r.label)}</button>`; }).join("")}</div>
        ${full ? `<p class="small muted">${esc(A.full)}</p>` : `<div class="sp-more-q">${search}</div>`}
        <p class="sp-one" id="sp-one">${esc(fill(R.oneField, { field: fl }))} <button type="button" class="linkish link" id="sp-over">${esc(R.startOver)}</button></p>` });
    }
    const hitsNow = () => OF.hits(roles, flow.roles, s.q, field0());
    // the hits under the search box: a listbox the box owns. The first hit is marked from the start (Enter adds the
    // marked one), the arrow keys move the mark and wrap, Escape empties the box.
    function drawHits() {
      const box = $("#sp-hits"), i = $("#sp-q"); if (!box) return;
      const h = hitsNow(), typed = !!s.q.trim();
      s.hi = h.length ? Math.max(0, Math.min(s.hi || 0, h.length - 1)) : 0;
      box.innerHTML = !typed ? "" : h.length ? `<ul class="sp-hitlist" id="sp-hitbox" role="listbox" aria-label="${esc(S.aim.searchLabel)}">${h.map((r, n) => `<li role="presentation"><button type="button" role="option" id="sp-hit-${n}" aria-selected="${n === s.hi}"${n === s.hi ? ` class="active"` : ""} data-add="${esc(r.id)}">${esc(r.name)}${r.name === r.label ? ` <span class="small muted">${esc(r.fieldLabel)}</span>` : ""}</button></li>`).join("")}</ul>` : `<p class="small muted" role="status">${esc(S.aim.none)}</p>`;
      box.querySelectorAll("[data-add]").forEach(b => b.onclick = () => add(b.dataset.add, "#sp-q"));
      if (i) {
        i.setAttribute("aria-expanded", String(typed && h.length > 0));
        if (typed && h.length) { i.setAttribute("aria-activedescendant", "sp-hit-" + s.hi); }
        else i.removeAttribute("aria-activedescendant");
      }
    }
    function add(id, refocus) {
      const r = roleOf(id), f0 = field0(); if (!r) return;
      if (flow.roles.includes(id)) return;
      if (flow.roles.length >= 4) { s.err = S.aim.full; s.errStep = "roles"; draw(); return; }
      if (f0 && r.field !== f0) { s.err = fill(S.aim.otherField, { field: fieldLabel(f0) }); s.errStep = "roles"; draw(); return; }
      flow.roles.push(id); save(); s.q = ""; s.hi = 0; s.err = ""; s.errStep = null; s.browse = null; draw();
      const i = refocus && $(refocus); if (i) i.focus();
    }
    const drop = id => { flow.roles = flow.roles.filter(x => x !== id); save(); s.err = ""; s.errStep = null; draw(); };
    function wireRoles() {
      const i = $("#sp-q");
      if (i) {
        i.oninput = () => { s.q = i.value; s.hi = 0; drawHits(); };
        i.onkeydown = e => {
          const h = s.q.trim() ? hitsNow() : [];
          if (e.key === "Enter") { e.preventDefault(); const r = h[s.hi || 0] || h[0]; if (r) add(r.id, "#sp-q"); }
          else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && h.length) { e.preventDefault(); s.hi = ((s.hi || 0) + (e.key === "ArrowDown" ? 1 : -1) + h.length) % h.length; drawHits(); const on = $("#sp-hit-" + s.hi); if (on) on.scrollIntoView({ block: "nearest" }); }
          else if (e.key === "Escape" && s.q) { e.preventDefault(); s.q = ""; i.value = ""; s.hi = 0; drawHits(); }
        };
        drawHits();
      }
      main.querySelectorAll("[data-drop]").forEach(b => b.onclick = () => { drop(b.dataset.drop); const q = $("#sp-q") || main.querySelector("[data-toggle]"); if (q) q.focus(); });
      main.querySelectorAll("[data-browse]").forEach(b => b.onclick = () => { s.browse = s.browse === b.dataset.browse ? null : b.dataset.browse; draw(); const n = main.querySelector(`[data-browse="${CSS.escape(b.dataset.browse)}"]`); if (n) n.focus(); });
      main.querySelectorAll("[data-toggle]").forEach(b => b.onclick = () => {
        const id = b.dataset.toggle, first = !flow.roles.length;
        if (flow.roles.includes(id)) drop(id); else add(id);
        const n = main.querySelector(`[data-toggle="${CSS.escape(id)}"]`) || (first && $("#sp-q"));
        if (n) n.focus();
      });
      const over = $("#sp-over"); if (over) over.onclick = () => { flow.roles = []; save(); s.q = ""; s.err = ""; s.errStep = null; s.browse = null; draw(); const q = $("#sp-q"); if (q) q.focus(); };
    }

    // ---------- b. the résumé, and a posting tucked away ----------
    function resumeHtml() {
      const R = O.resume, T = Copy.map.tree, r = state.resume;
      const zone = r && !s.change ? `<p class="sp-file"><span>${esc(fill(T.onFile, { name: r.name }))}</span> <button type="button" class="linkish link" id="sp-change">${esc(T.change)}</button></p>` : resumeForm();
      return stepFrame({ steps, step: "resume", err: errHtml(), inner: `${head("resume")}${ask(R.title, R.lead)}${zone}
        <details class="disc sp-posting" id="sp-posting"${flow.posting ? " open" : ""}><summary>${esc(R.posting)}</summary><div class="disc-body"><textarea id="sp-posting-text" maxlength="20000" aria-label="${esc(R.posting)}" placeholder="${esc(O.postingHint)}">${esc(flow.posting)}</textarea></div></details>` });
    }
    function wireResume() {
      if ($("#drop")) wireResumeForm(() => { s.change = false; s.err = ""; s.errStep = null; draw(); });
      const ch = $("#sp-change"); if (ch) ch.onclick = () => { s.change = true; draw(); const p = $("#file-pick"); if (p) p.focus(); };
      const t = $("#sp-posting-text"); if (t) t.oninput = () => { flow.posting = t.value.slice(0, 20000); save(); };
    }

    // ---------- f. the email, last, and "Find my projects" ----------
    function emailHtml() {
      return stepFrame({ steps, step: "email", nextLabel: s.busy ? O.finding : O.find, err: errHtml(), live: true, inner: `${head("email")}${ask(O.last.title)}
        <label class="tr-lab">${esc(O.email)}<input type="email" id="sp-email" autocomplete="email" inputmode="email" maxlength="320" placeholder="${esc(O.emailHint)}" value="${esc(flow.email)}"${s.errStep === "email" ? ` aria-invalid="true" aria-describedby="sp-err"` : ""}></label>
        <p class="small sp-privacy">${esc(openQuestsOn() ? O.keepsQuests : O.keeps)}</p>` });
    }
    function wireEmail() {
      const em = $("#sp-email");
      em.oninput = () => { flow.email = em.value; save(); };
      em.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); find(); } };
      if (s.busy) { const b = $("#sp-go"); b.disabled = true; }
    }
    // the build: every step checked in order, the tree grounded here and kept here; the email goes to the waitlist.
    // With the skill tree off the projects page is next, else the tree (the build quests above it).
    const find = async () => {
      if (s.busy) return;
      const m = OF.firstMissing(steps, ctx());
      if (m) { s.err = missLine(m); s.errStep = m; draw(); const f = m === "email" ? $("#sp-email") : $("#sp-fix"); if (f) f.focus(); return; }
      const email = flow.email.trim();
      if (window.Capture) Capture.cta("open_tree", "click");
      s.busy = true; s.err = ""; s.errStep = null; draw();
      const st = $("#sp-status"); if (st) st.textContent = O.finding;
      const quests = openQuestsOn();
      try {
        await loadApprentice();
        const g = await Apprentice.ground({ A: Atlas, Matcher, EvidenceText }, { profile: state.resume.text, roles: [...flow.roles], posting: flow.posting || "", today: todayIso() });
        const { map } = Apprentice.selfServeMap(g, { campus: (campusGate().campus || {}).label || null, date: todayIso() });
        const keep = quests ? { tech: flow.tech, tools: { ...flow.tools }, own_tools: flow.own_tools, try_new: flow.try_new, places: flow.places, own_places: flow.own_places, portfolio: { ...flow.portfolio } } : {};
        openHeld = { email, map, roles: [...flow.roles], posting: (flow.posting || "").slice(0, 20000), flow: keep, answers: quests ? OF.answers(flow, kit, field0()) : null, cards: null, mine: {}, asked: null, why: null, pick: null, seen: [] };
        store.set(OPEN_KEY, openHeld);   // a browser that refuses storage keeps it for this page
      } catch (e) { console.error(e); s.busy = false; if (atFind()) { s.err = O.failed; s.errStep = "email"; draw(); } return; }
      if (window.Capture) { Capture.waitlist(email, "build", { role_id: flow.roles[0] }); Capture.cta("open_tree", "done"); }
      s.busy = false;
      if (!atFind()) return;
      const next = skillTreeOn() ? "#/map/tree" : "#/map/projects";
      toHash(next); if (location.hash === next) route();
    };

    draw();
    if (prevStep && prevStep !== stepNow()) focusAsk();   // Back or Forward between steps: the question takes focus
    if (!openShown && window.Capture) { openShown = true; Capture.cta("open_tree", "shown"); }
  }

  // ---------- the projects (#/map/projects and #/map/projects/<id>, SKILL_TREE_ENABLED off, 2026-11-27) ----------
  // The three cards the function wrote (a waiting state while it writes; it can take most of a minute), each with its
  // level, what you ship, the skills it builds, what to build with and where it shows, and "Pick this one". On a phone
  // the cards are one row that snaps, one card per screen width, with dots and Previous and Next; on a wide screen,
  // three columns. "None of these" asks what should be different and writes three new ones (writeOpen with feedback
  // and the titles shown). The function off or failing: the two projects of web/preview.js in the same frame, without
  // Pick. The picked project's page has the steps (ticks kept here), the starter prompt, the share suggestion and the
  // project guide to download (web/project_guide.js). Everything stays in open.tree.
  const atProjects = () => { const R = Routes.parseRoute(location.hash); return R.name === "map" && R.parts[1] === "projects"; };
  const levelWord = c => Copy.map.open.projects.levels[c.project_level] || "";
  // a skill's name: the tree's, the atlas's, the product graph's; an id none of them knows is read as words, never shown raw
  const idWords = id => { const w = String(id || "").replace(/^[a-z]+\./, "").replace(/_/g, " ").trim(); return w ? w[0].toUpperCase() + w.slice(1) : ""; };
  const skillNames = (held, c, ix) => { const t = held.map.tree || {}, names = Object.fromEntries([...(t.nodes || []), ...(t.behaviours || []), ...(t.more || [])].map(n => [n.id, n.name])); return (c.atlas_skills || []).map(id => names[id] || ((ix && ix.skillById[id]) || {}).name || (productNames || {})[id] || idWords(id)); };
  const toolTag = t => t.own ? ` <span class="pj-tag">(${esc(Copy.map.open.projects.yours)})</span>` : t.free ? ` <span class="pj-tag">(${esc(t.free)})</span>` : "";
  const toolWords = t => `${esc(t.name)}${toolTag(t)}`;
  // copy a text to the clipboard; the line beside the button says it went, then clears; a copy the browser refused
  // says to copy by hand and stays
  const COPIED_MS = 4000;
  async function copyText(text, out) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      try { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove(); } catch { ok = false; }
    }
    if (!out) return;
    out.textContent = ok ? Copy.map.open.picked.copied : Copy.map.open.picked.copyFailed;
    clearTimeout(out._t);
    if (ok) out._t = setTimeout(() => { out.textContent = ""; }, COPIED_MS);
  }
  async function projectsScreen(held, id) {
    const O = Copy.map.open, P = O.projects;
    const [ix, kit] = await Promise.all([Atlas.index().catch(e => { console.error(e); return null; }), buildKit().catch(e => { console.error(e); return null; })]);
    if (!atProjects()) return;
    if (id) { pickedScreen(held, id, ix, kit); return; }
    const role = held.map.role.label || "";
    const ui = { none: false, feedback: (held.ask && held.ask.feedback) || "", at: 0 };
    const writing = () => !!openWriting;
    const cardsNow = () => openQuestsOn() ? held.cards || [] : [];
    const whyHtml = () => !held.why ? "" : `<p class="pj-why" id="open-why" role="status">${esc(held.why === "limited" ? P.limited : P.failed)}${held.why === "failed" && state.resume ? ` <button type="button" class="linkish link" id="open-retry">${esc(P.retry)}</button>` : ""}</p>`;
    const foot = () => {
      return `${helpLine(held)}
        <p class="small muted pj-kept">${esc(P.kept)} <a href="#/map/find/roles">${esc(P.change)}</a> · <button type="button" class="linkish link" id="open-forget">${esc(P.forget)}</button></p>`;
    };
    const card = (c, i, n) => `<article class="pj-card" role="group" aria-roledescription="slide" aria-label="${esc(fill(P.slideAria, { n: i + 1, m: n }))}" data-card="${esc(c.id)}">
        ${levelWord(c) ? `<p class="pj-level lv-${esc(c.project_level)}">${esc(levelWord(c))}</p>` : ""}<h2>${esc(c.title)}</h2>
        <p class="pj-ship"><b>${esc(P.youShip)}</b> ${esc(c.ship)}</p>
        <p class="pj-skills"><b>${esc(P.builds)}</b> ${skillNames(held, c, ix).map(n => `<span class="chip">${esc(n)}</span>`).join(" ")}</p>
        <dl class="pj-recipe"><div><dt>${esc(P.buildWith)}</dt><dd>${(c.build_with || []).map(b => `${esc(b.name)}<small>${(b.tools || []).map(toolWords).join(", ")}</small>`).join("")}</dd></div>
          <div><dt>${esc(P.showOn)}</dt><dd>${(c.live_on || []).map(l => esc(l.name)).join(", ")}</dd></div></dl>
        <p class="pj-go"><button type="button" class="btn primary" data-pick="${esc(c.id)}">${esc(P.pick)}</button></p></article>`;
    const carousel = (inner, n) => `<div class="pj-car" role="region" aria-roledescription="carousel" aria-label="${esc(P.carouselAria)}">
        <div class="pj-row" id="pj-row">${inner}</div>
        ${n > 1 ? `<div class="pj-ctl"><button type="button" class="btn pj-arrow" id="pj-prev" aria-label="${esc(P.prev)}">←</button><span class="pj-dots">${Array.from({ length: n }, (_, i) => `<button type="button" class="pj-dot" data-dot="${i}" aria-label="${esc(fill(P.dotAria, { n: i + 1 }))}"${i === ui.at ? ` aria-current="true"` : ""}></button>`).join("")}</span><button type="button" class="btn pj-arrow" id="pj-next" aria-label="${esc(P.next)}">→</button></div>` : ""}</div>`;
    const draw = async () => {
      if (!atProjects()) return;
      crumbs([[P.heading, null]]); showAside(null);
      const cards = cardsNow();
      let body;
      if (writing()) body = `<div class="wait pj-wait" id="open-writing" role="status">${UI.spinner()}<div><b>${esc(held.ask ? P.rewriting : P.writing)}</b><p class="small muted">${esc(P.keepOpen)}</p></div></div>`;
      else if (cards.length) {
        body = `<p class="lead">${esc(fill(P.lead, { role }))}</p>${carousel(cards.map((c, i) => card(c, i, cards.length)).join(""), cards.length)}${whyHtml()}
          <section class="pj-none" id="pj-none">${ui.none ? `<label class="tr-lab" for="pj-fb">${esc(P.noneTitle)}</label><textarea id="pj-fb" maxlength="${Quests.LIMITS.feedback}" placeholder="${esc(P.noneHint)}">${esc(ui.feedback)}</textarea>
            <p><button type="button" class="btn primary" id="pj-rewrite">${esc(P.rewrite)}</button></p>` : `<p><button type="button" class="btn" id="pj-none-open" aria-expanded="false">${esc(P.none)}</button></p>`}</section>`;
      } else {
        let standards = null;
        try { standards = await (standardsP ||= fetch("data/standards.json").then(r => r.ok ? r.json() : null)); } catch (e) { console.error(e); standardsP = null; }
        if (!atProjects()) return;
        const opts = Preview.pick(held.map, { standards, skillById: ix ? ix.skillById : null });
        const fb = o => `<article class="pj-card" role="group" aria-roledescription="slide" aria-label="${esc(fill(P.slideAria, { n: opts.indexOf(o) + 1, m: opts.length }))}"><h2>${esc(o.title)}</h2><p class="pj-ship">${esc(o.text)}</p>${o.skills.length ? `<p class="pj-skills"><b>${esc(P.builds)}</b> ${o.skills.map(n => `<span class="chip">${esc(n)}</span>`).join(" ")}</p>` : ""}</article>`;
        body = `<div id="open-preview"><h2 class="pj-sub">${esc(P.fallbackHeading)}</h2><p class="small muted">${esc(fill(P.fallbackLead, { role }))}</p>${opts.length ? carousel(opts.map(fb).join(""), opts.length) : ""}</div>${whyHtml()}`;
        if (window.Capture && opts.length) Capture.cta("open_preview", "shown");
      }
      page(`<div class="pj"><h1>${esc(P.heading)}</h1>${body}${foot()}</div>`);
      main.firstElementChild.classList.add("pj-page");
      wire();
    };
    // the row's place: the card nearest the row's left edge sets the dots; the buttons scroll by one card
    function wireRow() {
      const row = $("#pj-row"); if (!row) return;
      const n = row.children.length;
      const at = () => Math.max(0, Math.min(n - 1, Math.round(row.scrollLeft / Math.max(1, row.clientWidth))));
      const show = i => { const c = row.children[i]; if (c) row.scrollTo({ left: c.offsetLeft - row.offsetLeft, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); };
      const mark = () => { ui.at = at(); main.querySelectorAll("[data-dot]").forEach(d => { if (+d.dataset.dot === ui.at) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current"); }); const p = $("#pj-prev"), x = $("#pj-next"); if (p) p.disabled = ui.at === 0; if (x) x.disabled = ui.at === n - 1; };
      row.addEventListener("scroll", () => { clearTimeout(row._t); row._t = setTimeout(mark, 60); }, { passive: true });
      main.querySelectorAll("[data-dot]").forEach(d => d.onclick = () => show(+d.dataset.dot));
      const p = $("#pj-prev"), x = $("#pj-next");
      if (p) p.onclick = () => show(Math.max(0, at() - 1));
      if (x) x.onclick = () => show(Math.min(n - 1, at() + 1));
      if (ui.at) show(ui.at);
      mark();
    }
    function wire() {
      wireRow();
      main.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => {
        if (window.Capture) Capture.cta("open_pick", "click");
        held.pick = b.dataset.pick; openKeep(held);
        location.hash = "#/map/projects/" + encodeURIComponent(b.dataset.pick);
      });
      const no = $("#pj-none-open"); if (no) no.onclick = () => { ui.none = true; if (window.Capture) Capture.cta("open_none", "shown"); draw().then(() => { const t = $("#pj-fb"); if (t) t.focus(); }); };
      const fb = $("#pj-fb"); if (fb) fb.oninput = () => { ui.feedback = fb.value; };
      const rw = $("#pj-rewrite"); if (rw) rw.onclick = () => rewrite({ feedback: ui.feedback });
      const retry = $("#open-retry"); if (retry) retry.onclick = () => held.ask || (held.cards || []).length ? rewrite({ feedback: (held.ask && held.ask.feedback) || ui.feedback }) : first();
      const forget = $("#open-forget"); if (forget) forget.onclick = () => { openHeld = null; store.set(OPEN_KEY, null); store.set(OPEN_FLOW_KEY, null); mapUi = null; toHash("#/map/find/roles"); route(); };
    }
    const after = async p => { await draw(); const r = await p; if (!atProjects() || openHeld !== held) return; ui.none = r !== "ok" && ui.none; await draw(); const h = main.querySelector(".pj h1"); if (r === "ok" && h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } };
    const rewrite = ask => after(writeOpen(held, { feedback: ask.feedback, avoid: [...(held.seen || []), ...(held.cards || []).map(c => c.title)] }));
    const first = () => after(writeOpen(held));
    // the first write: nothing written yet and no failure kept (a reload during a write asks again); a write already
    // under way is waited for
    if (openWriting) after(openWriting);
    else if (openQuestsOn() && state.resume && !(held.cards || []).length && !held.why) first();
    else await draw();
  }
  function pickedScreen(held, id, ix, kit) {
    const O = Copy.map.open, P = O.projects, K = O.picked;
    const c = (held.cards || []).find(x => x.id === id);
    if (!c || !openQuestsOn()) {
      crumbs([[P.heading, "#/map/projects"]]); showAside(null);
      page(`<div class="pj"><h1>${esc(P.heading)}</h1><p class="lead">${esc(K.gone)}</p><p><a class="btn primary" href="#/map/projects">${esc(K.toAll)}</a></p></div>`);
      return;
    }
    if (held.pick !== id) { held.pick = id; openKeep(held); }
    crumbs([[P.heading, "#/map/projects"], [c.title, null]]); showAside(null);
    const ticks = ticksOf(c.id), role = held.map.role.label || "";
    const link = (name, url) => /^https?:\/\//i.test(String(url || "")) ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name);
    const tools = (c.build_with || []).map(b => `<p><b>${esc(b.name)}</b></p><ul class="pj-tools">${(b.tools || []).map(t => `<li>${link(t.name, t.url)}${toolTag(t)}</li>`).join("")}</ul>`).join("");
    const live = (c.live_on || []).map(l => `<p><b>${link(l.name, l.url)}</b>${l.note ? `<br><span class="muted">${esc(l.note)}</span>` : ""}</p>`).join("");
    const sh = c.share;
    page(`<div class="pj pj-one">
      <p class="pj-backrow"><a href="#/map/projects" id="pj-back">← ${esc(K.back)}</a></p>
      ${levelWord(c) ? `<p class="pj-level lv-${esc(c.project_level)}">${esc(levelWord(c))}</p>` : ""}<h1 tabindex="-1">${esc(c.title)}</h1>
      <p class="lead"><b>${esc(P.youShip)}</b> ${esc(c.ship)}</p>
      <p class="pj-skills"><b>${esc(P.builds)}</b> ${skillNames(held, c, ix).map(n => `<span class="chip">${esc(n)}</span>`).join(" ")}</p>
      <section class="pj-dl"><h2>${esc(K.guideHeading)}</h2><p>${esc(K.downloadLead)}</p><p><button type="button" class="btn primary" id="pj-download">${esc(K.download)}</button></p>
        <p>${esc(K.assistLead)}</p><p class="pj-dl-row"><button type="button" class="btn" id="pj-brief-copy">${esc(K.copyBrief)}</button> <button type="button" class="btn" id="pj-brief-dl">${esc(K.downloadBrief)}</button> <span class="small muted" aria-live="polite" id="pj-brief-out"></span></p></section>
      <div class="pj-two"><section><h2>${esc(K.whyRole)}</h2><p>${esc(c.why_role.text)}</p></section><section><h2>${esc(K.whyYou)}</h2><p>${esc(c.why_person.text)}</p></section></div>
      <section><h2>${esc(K.steps)}</h2><p class="small muted">${esc(K.stepsNote)}</p><ol class="pj-steps">${c.steps.map((st, i) => `<li><label${ticks[i] ? ` class="done"` : ""}><input type="checkbox" data-step="${i}"${ticks[i] ? " checked" : ""}> <span>${esc(st)}</span></label></li>`).join("")}</ol></section>
      <section><h2>${esc(K.prompt)}</h2><p class="small muted">${esc(K.promptLead)}</p><pre class="pj-pre" id="pj-prompt">${esc(c.prompt)}</pre>
        <p class="pj-copyrow"><button type="button" class="btn" data-copy="pj-prompt" aria-label="${esc(K.copyPrompt)}">${esc(K.copy)}</button> <span class="small muted" aria-live="polite" id="pj-prompt-out"></span></p></section>
      <div class="pj-two"><section><h2>${esc(P.buildWith)}</h2>${tools}</section><section><h2>${esc(P.showOn)}</h2>${live}</section></div>
      ${sh ? `<section><h2>${esc(K.share)}</h2><p><b>${link(sh.label, sh.url)}</b>: ${esc(sh.how)}</p>${sh.post ? `<h3>${esc(K.post)}</h3><pre class="pj-pre" id="pj-post">${esc(sh.post)}</pre>
        <p class="pj-copyrow"><button type="button" class="btn" data-copy="pj-post" aria-label="${esc(K.copyPost)}">${esc(K.copy)}</button> <span class="small muted" aria-live="polite" id="pj-post-out"></span></p>` : ""}</section>` : ""}
      <p class="pj-foot"><a href="#/map/projects">${esc(K.back)}</a></p>
      ${helpLine(held)}
    </div>`);
    main.firstElementChild.classList.add("pj-page");
    main.querySelectorAll(".pj-steps input[data-step]").forEach(b => b.onchange = () => { const t = ticksOf(c.id); t[+b.dataset.step] = b.checked; keepTicks(c.id, t); b.closest("label").classList.toggle("done", b.checked); });
    main.querySelectorAll("[data-copy]").forEach(b => b.onclick = () => { const el = $("#" + b.dataset.copy); if (el) copyText(el.textContent, $(`#${b.dataset.copy}-out`)); });
    // the guide (one HTML file) and the brief for an AI assistant (Markdown): built here, saved by the browser
    const guideOpts = () => ({ kit, role: { id: held.map.role.id, label: role }, answers: heldAnswers(held), date: todayIso(), skills: skillNames(held, c, ix) });
    const save = (text, type, name) => {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement("a"); a.href = url; a.download = name; a.hidden = true;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    };
    $("#pj-download").onclick = () => {
      if (window.Capture) Capture.cta("open_download", "click");
      save(ProjectGuide.html(c, guideOpts()), "text/html;charset=utf-8", ProjectGuide.filename(c));
      if (window.Capture) Capture.cta("open_download", "done");
    };
    $("#pj-brief-dl").onclick = () => {
      if (window.Capture) Capture.cta("open_brief", "click");
      save(ProjectGuide.brief(c, guideOpts()), "text/markdown;charset=utf-8", ProjectGuide.filename(c, "md"));
    };
    $("#pj-brief-copy").onclick = () => { if (window.Capture) Capture.cta("open_brief", "click"); copyText(ProjectGuide.brief(c, guideOpts()), $("#pj-brief-out")); };
  }

  // above the open tree: the written projects or the two from web/preview.js, then the booking card (only with a form id)
  async function drawOpenNext(held, ix) {
    const O = Copy.map.open, el = $("#open-next"); if (!el) return;
    const bookHref = Preview.bookingHref((window.CONFIG || {}).BOOKING_TALLY, { email: held.email, role: held.map.role.id });
    const bookHtml = bookHref ? `<section class="op-book" id="open-book"><h2>${esc(O.book.heading)}</h2><p>${esc(O.book.line)}</p><p><a class="btn primary" id="open-book-link" href="${esc(bookHref)}" target="_blank" rel="noopener">${esc(O.book.button)}</a></p></section>` : "";
    const wireBook = () => { const b = $("#open-book-link"); if (b) { if (window.Capture) Capture.cta("open_book", "shown"); b.onclick = () => { if (window.Capture) Capture.cta("open_book", "click"); }; } };
    let note = "";
    if (openQuestsOn()) {
      const cards = held.cards || [];
      if (cards.length) {
        // the tree page lists the quests (each opens on the Quests page); the Quests page shows them itself
        const row = c => `<a class="op-card op-quest" href="${esc(questHref(c.id))}"><h3>${esc(c.title)}</h3><p>${esc(c.ship)}</p><p class="small muted">${esc(fill(O.builds, { skills: skillNames(held, c, ix).join(", ") }))}</p></a>`;
        el.innerHTML = (mapUi && mapUi.page === "tree" ? `<section class="op-prev" id="open-quests"><h2>${esc(O.questsHeading)}</h2><p class="small muted">${esc(O.questsLead)}</p><div class="op-grid">${cards.map(row).join("")}</div></section>` : "") + bookHtml;
        wireBook(); return;
      }
      if (state.resume && (openWriting || held.asked !== todayIso())) {
        el.innerHTML = `<section class="op-prev" id="open-writing" role="status"><h2>${esc(O.questsHeading)}</h2><p>${esc(O.writing)}</p></section>${bookHtml}`;
        wireBook();
        const r = await writeOpen(held);
        if (r === "ok") { if (Routes.parseRoute(location.hash).name === "map" && openHeld === held) route(); return; }
        if ($("#open-next") !== el) return;
      }
      if (held.why) note = `<p class="small muted" id="open-why">${esc(held.why === "limited" ? O.questsLimited : O.questsFailed)}${held.why === "failed" && state.resume ? ` <button type="button" class="linkish link" id="open-retry">${esc(O.retry)}</button>` : ""}</p>`;
    }
    let standards = null;
    try { standards = await (standardsP ||= fetch("data/standards.json").then(r => r.ok ? r.json() : null)); } catch (e) { console.error(e); standardsP = null; }
    if ($("#open-next") !== el) return;
    const opts = Preview.pick(held.map, { standards, skillById: ix ? ix.skillById : null });
    const card = o => `<article class="op-card"><h3>${esc(o.title)}</h3><p>${esc(o.text)}</p>${o.skills.length ? `<p class="small muted">${esc(fill(O.builds, { skills: o.skills.join(", ") }))}</p>` : ""}</article>`;
    el.innerHTML = (opts.length ? `<section class="op-prev" id="open-preview"><h2>${esc(opts.length > 1 ? O.previewHeading : O.previewOne)}</h2><p class="small muted">${esc(fill(O.previewLead, { role: held.map.role.label || "" }))}</p><div class="op-grid">${opts.map(card).join("")}</div>${note}</section>` : note)
      + bookHtml;
    if (window.Capture && opts.length) Capture.cta("open_preview", "shown");
    wireBook();
    const retry = $("#open-retry"); if (retry) retry.onclick = () => { held.asked = null; held.why = null; openKeep(held); drawOpenNext(held, ix); };
  }
  // the top bar's entry: shown to every visitor while the tree is on, so an invited person finds the way in
  const buildBar = () => treeOn();
  const selfServe = map => !!(map && map.student && map.student.self_serve);
  // the open flow offers every role set (`open`): the Product field (2026-11-12) and the tech set's fields
  // (2026-11-27), since its tree is grounded in this browser and /api/open grounds tech roles too ("tech.<family>",
  // one field per request); the signed-in form and the side-project flow stay on the MBA set, the one /api/tree bundles
  const treeRoles = (ix, open) => Launcher.fields(ix).map(f => ({ ...f, roles: f.roles.filter(r => open || !["product", "tech"].includes((ix.roles[r.id] || {}).set)) })).filter(f => f.roles.length);
  // `first`: the person has no map yet, so the form is Build skills' first step and says what comes after it; with a
  // map (?build=1), it builds the tree again. A visitor with no session gets the open form instead (openForm, below).
  async function treeForm(out, first) {
    const T = Copy.map.tree, here = () => Routes.parseRoute(location.hash).name === "map";
    const ix = await Atlas.index(); if (!here()) return;
    const F = treeRoles(ix);
    const picked = Routes.parseRoute(location.hash).query.role, pre = picked ? F.find(f => f.roles.some(r => r.id === picked)) : null;   // the fit screen's link names the role
    const s = { field: pre ? pre.id : null, role: pre ? picked : null, also: [], change: false };
    const draw = () => {
      const r = state.resume;
      const f = F.find(x => x.id === s.field);
      const resume = r && !s.change ? `<p class="small muted">${esc(fill(T.onFile, { name: r.name }))} <button type="button" class="linkish link" id="tr-change">${esc(T.change)}</button></p>`
        : resumeForm();
      const roles = f ? `<label class="tr-lab">${esc(T.role)}<select id="tr-role"><option value="">${esc(T.pickRole)}</option>${f.roles.map(x => `<option value="${esc(x.id)}"${s.role === x.id ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>
        ${s.role ? `<fieldset class="tr-also"><legend>${esc(T.also)}</legend>${f.roles.filter(x => x.id !== s.role).map(x => `<label><input type="checkbox" value="${esc(x.id)}"${s.also.includes(x.id) ? " checked" : ""}${!s.also.includes(x.id) && s.also.length >= 3 ? " disabled" : ""}> ${esc(x.label)}</label>`).join("")}</fieldset>` : ""}` : "";
      page(`<h1>${esc(first ? T.firstHeading : T.heading)}</h1><p class="lead">${esc(first ? T.firstLead : T.lead)}</p>
        <section class="tr-form">
          <h2>${esc(T.resume)}</h2>${resume}
          <label class="tr-lab">${esc(T.field)}<select id="tr-field"><option value="">${esc(T.pickField)}</option>${F.map(x => `<option value="${esc(x.id)}"${s.field === x.id ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select></label>
          <div id="tr-roles">${roles}</div>
          <label class="tr-lab">${esc(T.posting)}<textarea id="tr-posting" maxlength="20000" placeholder="${esc(T.postingHint)}"></textarea></label>
          <p><button type="button" class="btn primary" id="tr-build" data-reads${state.resume && s.role ? "" : " disabled"}>${esc(T.build)}</button></p>
          <p class="small tr-out" id="tr-out" aria-live="polite"></p>
        </section>
        <p class="small muted">${out}</p>`, true);
      main.firstElementChild.classList.add("roomy");
      if ($("#drop")) wireResumeForm(() => { s.change = false; draw(); });
      const ch = $("#tr-change"); if (ch) ch.onclick = () => { s.change = true; draw(); };
      $("#tr-field").onchange = e => { s.field = e.target.value || null; s.role = null; s.also = []; draw(); };
      const role = $("#tr-role"); if (role) role.onchange = e => { s.role = e.target.value || null; s.also = s.also.filter(id => id !== s.role); draw(); };
      main.querySelectorAll("#tr-roles input[type=checkbox]").forEach(b => b.onchange = () => { s.also = b.checked ? [...s.also, b.value].slice(0, 3) : s.also.filter(id => id !== b.value); draw(); });
      $("#tr-build").onclick = buildTree;
    };
    const buildTree = async () => {
      if (!state.resume) { $("#tr-out").textContent = T.noResume; return; }
      const sess = await Auth.session(); if (!sess) { toHash(signinHref()); return; }
      if (window.Capture) Capture.cta("tree", "click");
      const btn = $("#tr-build"), outEl = $("#tr-out");
      btn.disabled = true; outEl.textContent = T.building;
      const body = { text: state.resume.text, roles: [s.role, ...s.also], posting: ($("#tr-posting") || {}).value || "", campus: (campusGate().campus || {}).label || undefined };
      let r;
      try { r = await fetch("api/tree", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${sess.access_token}` }, body: JSON.stringify(body) }); }
      catch (e) { console.error(e); r = null; }
      if (!here()) return;
      if (r && r.ok) {
        if (window.Capture) Capture.cta("tree", "done");
        mapHeld = null; outEl.textContent = T.built;
        toHash("#/map/quests"); if (location.hash === "#/map/quests") route();
        return;
      }
      outEl.textContent = r && r.status === 409 ? T.byHand : r && r.status === 401 ? T.signedOut : T.failed;
      btn.disabled = false;
    };
    draw();
    if (window.Capture) Capture.cta("tree", "shown");
  }

  // ---------- "Start a side project" (#/map/start/<step>, 2026-11-11; the pure parts are web/quests.js) ----------
  // One question per screen: the roles (a), what you bring (b: the résumé and its band in words, the extras), how
  // technical (c), the tools (d), where the work shows (e), then three side projects a model writes (f). A person
  // with no map gets the tree first (POST /api/tree, unchanged), from a and b; a self-serve map whose roles changed is
  // built again. The answers stay in this browser (quests.flow) so a reload keeps the place; the extras stay in this
  // page only. Nothing leaves the browser but the final request: the résumé text, the extras and the answers go once
  // to POST /api/quests, which keeps neither the résumé nor the extras. A pick adds the card to the map, and the person
  // lands on it as the now card, opened.
  const questsOn = () => treeOn() && !!(window.CONFIG || {}).QUESTS_ENABLED;
  const START_STEPS = ["aim", "bring", "tech", "tools", "share", "pick"];
  const FLOW_KEY = "quests.flow", OPTS_KEY = "quests.options";
  // the extras, [{ name, text }]: kept in this tab only (sessionStorage, so a reload keeps them and closing the tab
  // drops them), never in localStorage and never on a server
  const EXTRAS_KEY = "quests.extras";
  let startExtras = (() => { try { const v = JSON.parse(sessionStorage.getItem(EXTRAS_KEY)); return Array.isArray(v) ? v.filter(x => x && typeof x.text === "string") : []; } catch { return []; } })();
  const keepExtras = () => { try { sessionStorage.setItem(EXTRAS_KEY, JSON.stringify(startExtras)); } catch { } };
  let kitP = null;
  const buildKit = () => kitP ||= Atlas.fetchJson("data/build_kit.json");
  // the answers kept (quests.flow), as the open form reads its own (Routes.OpenFlow.clean); an old accounts answer is dropped
  const flowOf = () => { const f = Routes.OpenFlow.clean(store.get(FLOW_KEY)); delete f.email; delete f.posting; return f; };
  const byHandMap = map => !!map && (map.cards || []).some(c => c && c.kind !== "story" && c.kind !== "side_project");
  const mapRoles = map => ((map && map.role_class && map.role_class.roles) || []).map(r => r.id);
  // ---------- one question per screen: what "Start a side project" and the open form share (2026-11-12) ----------
  // stepFrame: the progress bar, Back and "Step n of m", the step's own html, Next with what is missing beside it (`err`,
  // html already escaped) and, under it, `foot` (the sign-out line of a session). techStep, toolsStep and shareStep
  // draw steps c to e from the answers `flow` (Routes.OpenFlow.clean); `h` is the question's heading tag (the open
  // form has its own h1 above it). Their wire functions set the answer and call back (`saved` for typed text, which
  // never redraws, `changed` for a tap, which does).
  function stepFrame({ steps, step, inner, nextOk = true, nextLabel = Copy.map.flow.next, err = "", foot = "", wide = false, noNext = false, live = false }) {
    const S = Copy.map.flow, i = steps.indexOf(step), m = steps.length;
    const back = i > 0 ? `<button type="button" class="linkish link" id="sp-back">${esc(S.back)}</button>` : "<span></span>";
    const next = noNext ? "" : `<div class="sp-next"><button type="button" class="btn primary lg" id="sp-go" data-reads${nextOk ? "" : " disabled"}>${esc(nextLabel)}</button>${err ? `<span class="sp-err" id="sp-err" role="alert">${err}</span>` : ""}${live ? `<span class="small muted" id="sp-status" aria-live="polite"></span>` : ""}</div>`;
    return `<div class="sp${wide ? " wide" : ""}"><div class="sp-prog" role="progressbar" aria-label="${esc(S.progressAria)}" aria-valuemin="1" aria-valuemax="${m}" aria-valuenow="${i + 1}"><i style="width:${Math.round((i + 1) / m * 100)}%"></i></div>
        <div class="sp-nav">${back}<span class="small muted">${esc(fill(S.stepOf, { n: i + 1, m }))}</span></div>${inner}${next}${foot ? `<p class="small muted sp-out">${foot}</p>` : ""}</div>`;
  }
  const askTag = (h, text, cls = "") => `<${h}${h === "h1" ? "" : ` class="sp-ask${cls}" tabindex="-1"`}>${esc(text)}</${h}>`;
  function techStep(flow, h = "h1") {
    const C = Copy.map.flow.tech;
    return `${askTag(h, C.title)}<div class="sp-opts" role="radiogroup" aria-label="${esc(C.title)}">${Quests.TECH.map(t => `<button type="button" role="radio" class="sp-opt radio${flow.tech === t ? " on" : ""}" aria-checked="${flow.tech === t}" data-tech="${t}"><span class="box" aria-hidden="true"></span><b>${esc(C.options[t])}</b></button>`).join("")}</div>`;
  }
  const wireTechStep = (flow, picked) => main.querySelectorAll("[data-tech]").forEach(b => b.onclick = () => { flow.tech = b.dataset.tech; picked(); });
  // d. the tools (2026-11-27): what the person already uses, typed; the kit's kinds for the field as taps (a code kind
  // only for a person who reads code); open to a new tool. Nothing is required.
  function toolsStep(flow, kit, field, fieldLabel, h = "h1") {
    const T = Copy.map.flow.tools, kinds = Routes.OpenFlow.fieldKinds(kit, field, flow.tech).map(id => kit.kinds.find(k => k.id === id));
    const pressed = v => flow.try_new === v;
    return `${askTag(h, T.title)}<textarea class="sp-text" id="sp-own-tools" rows="2" maxlength="${Routes.OpenFlow.LIM.ownTools}" aria-label="${esc(T.title)}" placeholder="${esc(T.ownHint)}">${esc(flow.own_tools)}</textarea>
      <h3 class="sp-sub" id="sp-kinds-h">${esc(fieldLabel ? fill(T.kinds, { field: fieldLabel }) : T.kindsAll)}</h3><p class="sp-hint small">${esc(T.kindsLead)}</p>
      <ul class="sp-taps" aria-labelledby="sp-kinds-h">${kinds.map(k => { const on = flow.tools[k.id] === "use"; return `<li><button type="button" class="sp-tap${on ? " on" : ""}" data-kind="${esc(k.id)}" aria-pressed="${on}"><span class="box" aria-hidden="true"></span><span><b>${esc(k.label)}</b><small>${esc(k.examples.map(e => e.name).join(", "))}</small></span></button></li>`; }).join("")}</ul>
      <h3 class="sp-sub" id="sp-try-h">${esc(T.tryNew)}</h3>
      <div class="seg sp-seg sp-yn" role="group" aria-labelledby="sp-try-h">${[[true, T.yes], [false, T.no]].map(([v, l]) => `<button type="button" data-try="${v}" aria-pressed="${pressed(v)}"${pressed(v) ? ` class="on"` : ""}>${esc(l)}</button>`).join("")}</div>
      <p class="small muted sp-note">${esc(T.tryNewLine)}</p>`;
  }
  function wireToolsStep(flow, saved, changed) {
    const t = $("#sp-own-tools"); if (t) t.oninput = () => { flow.own_tools = t.value.slice(0, Routes.OpenFlow.LIM.ownTools); saved(); };
    main.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => { const k = b.dataset.kind; if (flow.tools[k] === "use") delete flow.tools[k]; else flow.tools[k] = "use"; changed(); const n = main.querySelector(`[data-kind="${CSS.escape(k)}"]`); if (n) n.focus(); });
    main.querySelectorAll("[data-try]").forEach(b => b.onclick = () => { const v = b.dataset.try === "true"; flow.try_new = flow.try_new === v ? null : v; changed(); const n = main.querySelector(`[data-try="${v}"]`); if (n) n.focus(); });
  }
  // e. where the work shows (2026-11-27, in the accounts step's place): the kit's places for the field as taps, LinkedIn
  // tapped until the person taps something; other places typed; a portfolio site and where it lives, with a note
  function shareStep(flow, kit, field, h = "h1") {
    const C = Copy.map.flow.share, OF = Routes.OpenFlow, on = new Set(OF.shownPlaces(flow, kit, field)), pf = flow.portfolio || {};
    const yn = (attr, cur) => [[true, C.yes], [false, C.no]].map(([v, l]) => `<button type="button" data-${attr}="${v}" aria-pressed="${cur === v}"${cur === v ? ` class="on"` : ""}>${esc(l)}</button>`).join("");
    return `${askTag(h, C.title)}<p class="sp-hint">${esc(C.lead)}</p>
      <div class="sp-quick" role="group" aria-label="${esc(C.placesAria)}">${OF.fieldPlaces(kit, field).map(p => `<button type="button" class="chip" data-place="${esc(p.id)}" aria-pressed="${on.has(p.id)}" title="${esc(p.note || "")}">${esc(p.label)}</button>`).join("")}</div>
      <label class="tr-lab sp-lab">${esc(C.own)}<input type="text" id="sp-own-places" maxlength="${OF.LIM.ownPlaces}" placeholder="${esc(C.ownHint)}" value="${esc(flow.own_places)}"></label>
      <h3 class="sp-sub" id="sp-pf-h">${esc(C.portfolio)}</h3>
      <div class="seg sp-seg sp-yn" role="group" aria-labelledby="sp-pf-h">${yn("pf", pf.has)}</div>
      ${pf.has === true ? `<p class="sp-or" id="sp-host-h">${esc(C.host)}</p><div class="sp-quick" role="group" aria-labelledby="sp-host-h">${(kit.portfolio_hosts || []).map(x => `<button type="button" class="chip" data-host="${esc(x.id)}" aria-pressed="${pf.host === x.id}">${esc(x.label)}</button>`).join("")}</div>
        <label class="tr-lab sp-lab">${esc(C.note)}<input type="text" id="sp-pf-note" maxlength="${OF.LIM.note}" placeholder="${esc(C.noteHint)}" value="${esc(pf.note || "")}"></label>` : ""}`;
  }
  function wireShareStep(flow, kit, field, saved, changed) {
    const OF = Routes.OpenFlow;
    flow.portfolio = flow.portfolio || { has: null, host: null, note: "" };
    main.querySelectorAll("[data-place]").forEach(b => b.onclick = () => {
      const id = b.dataset.place, now = OF.shownPlaces(flow, kit, field);
      flow.places = now.includes(id) ? now.filter(x => x !== id) : [...now, id];
      changed(); const n = main.querySelector(`[data-place="${CSS.escape(id)}"]`); if (n) n.focus();
    });
    const o = $("#sp-own-places"); if (o) o.oninput = () => { flow.own_places = o.value.slice(0, OF.LIM.ownPlaces); saved(); };
    main.querySelectorAll("[data-pf]").forEach(b => b.onclick = () => { const v = b.dataset.pf === "true"; flow.portfolio.has = flow.portfolio.has === v ? null : v; changed(); const n = main.querySelector(`[data-pf="${v}"]`); if (n) n.focus(); });
    main.querySelectorAll("[data-host]").forEach(b => b.onclick = () => { const id = b.dataset.host; flow.portfolio.host = flow.portfolio.host === id ? null : id; changed(); const n = main.querySelector(`[data-host="${CSS.escape(id)}"]`); if (n) n.focus(); });
    const nt = $("#sp-pf-note"); if (nt) nt.oninput = () => { flow.portfolio.note = nt.value.slice(0, OF.LIM.note); saved(); };
  }
  // every role of the fields `F` once, with its field (the role's group, as the atlas checks a class) and its label
  function roleIndex(F, ix) {
    const roles = [], seen = new Set();
    for (const f of F) for (const r of f.roles) if (!seen.has(r.id)) { seen.add(r.id); const g = (ix.roles[r.id] || {}).group || f.id; roles.push({ id: r.id, label: r.label, field: g, fieldLabel: ((ix.groups.find(x => x.id === g) || {}).label) || f.label }); }
    return roles;
  }
  // the type-ahead: the roles not picked yet, ranked (Routes.OpenFlow.hits); the side-project flow keeps every field in
  // the list and says why a role of another field cannot join
  const roleHits = (roles, picked, q) => Routes.OpenFlow.hits(roles, picked, q, null);

  async function startScreen(map, out) {
    const S = Copy.map.flow, MC = Copy.map, here = () => Routes.parseRoute(location.hash).parts[1] === "start" && Routes.parseRoute(location.hash).name === "map";
    const [ix, kit] = await Promise.all([Atlas.index(), buildKit()]);
    if (!here()) return;
    const roles = roleIndex(treeRoles(ix), ix);
    const roleOf = id => roles.find(r => r.id === id) || { id, label: (ix.roles[id] || {}).label || id, field: (ix.roles[id] || {}).group || null, fieldLabel: "" };
    const flow = flowOf();
    const fixed = byHandMap(map);
    if (map && (fixed || !flow.roles.length)) flow.roles = mapRoles(map).slice(0, 4);
    const save = () => store.set(FLOW_KEY, flow);
    save();
    const s = { q: "", err: "", band: null, bandFor: null, busy: false, msg: "", change: false };
    const stepNow = () => { const p = Routes.OpenFlow.step(Routes.parseRoute(location.hash).parts[2]); return START_STEPS.includes(p) ? p : "aim"; };
    if (Routes.parseRoute(location.hash).parts[2] === "accounts") history.replaceState(null, "", location.pathname + location.search + "#/map/start/share");   // the old step's address
    const fieldNow = () => flow.roles[0] ? roleOf(flow.roles[0]).field : null;
    const go = step => { history.pushState(null, "", location.pathname + location.search + "#/map/start/" + step); s.err = ""; s.msg = ""; draw(); window.scrollTo(0, 0); };
    const canGo = step => step === "aim" || ((flow.roles.length > 0) && (step === "bring" || !!state.resume));
    const frame = (step, inner, nextOk = true, nextLabel = S.next) => stepFrame({ steps: START_STEPS, step, inner, nextOk, nextLabel, err: s.err ? esc(s.err) : "", foot: out, wide: step === "pick", noNext: step === "pick" });
    const draw = () => {
      if (!here()) return;
      let step = stepNow();
      if (!canGo(step)) { step = flow.roles.length ? "bring" : "aim"; history.replaceState(null, "", location.pathname + location.search + "#/map/start/" + step); }
      crumbs([[S.heading, null]]); showAside(null);
      const html = ({ aim: aimHtml, bring: bringHtml, tech: techHtml, tools: toolsHtml, share: shareHtml, pick: pickHtml })[step]();
      page(html, true);
      main.firstElementChild.classList.add("roomy", "sp-page");
      const o = $("#map-out"); if (o) o.onclick = async () => { mapHeld = null; mapUi = null; await Auth.signOut(); location.hash = "#/skills"; };
      const back = $("#sp-back"); if (back) back.onclick = () => go(START_STEPS[START_STEPS.indexOf(step) - 1]);
      const nx = $("#sp-go"); if (nx) nx.onclick = () => { if (step === "bring" && !state.resume) { s.err = S.bring.noResume; draw(); return; } go(START_STEPS[START_STEPS.indexOf(step) + 1]); };
      ({ aim: wireAim, bring: wireBring, tech: wireTech, tools: wireTools, share: wireShare, pick: wirePick })[step]();
    };

    // ---------- a. the roles ----------
    const field0 = () => flow.roles.length ? roleOf(flow.roles[0]).field : null;
    const chip = id => `<span class="chip on sp-role">${esc(roleOf(id).label)}${fixed ? "" : `<button type="button" data-drop="${esc(id)}" aria-label="${esc(fill(S.aim.remove, { role: roleOf(id).label }))}">×</button>`}</span>`;
    const hits = () => roleHits(roles, flow.roles, s.q);
    function aimHtml() {
      const A = S.aim;
      if (fixed) return frame("aim", `<h1>${esc(A.title)}</h1><p class="sp-hint">${esc(A.fixed)}</p><div class="sp-picked">${flow.roles.map(chip).join("")}</div>`);
      const hearted = hearts().filter(id => roles.some(r => r.id === id) && !flow.roles.includes(id));
      const f0 = field0();
      const quick = hearted.length ? `<p class="sp-or">${esc(A.hearted)}</p><div class="sp-quick">${hearted.map(id => { const r = roleOf(id), off = (f0 && r.field !== f0) || flow.roles.length >= 4; return `<button type="button" class="chip" data-add="${esc(id)}"${off ? " disabled" : ""}>${esc(r.label)}</button>`; }).join("")}</div>` : "";
      // a seam: the person's saved jobs join the quick picks here once a saved-jobs store exists (PLAN.md, Later)
      return frame("aim", `<h1>${esc(A.title)}</h1><p class="sp-hint">${esc(A.lead)}</p>
        <div class="sp-ta"><input type="search" id="sp-q" value="${esc(s.q)}" placeholder="${esc(A.search)}" aria-label="${esc(A.searchLabel)}" autocomplete="off"${flow.roles.length >= 4 ? " disabled" : ""}><div id="sp-hits"></div></div>
        <div class="sp-picked">${flow.roles.map(chip).join("")}</div>${flow.roles.length >= 4 ? `<p class="small muted">${esc(A.full)}</p>` : ""}${quick}`, flow.roles.length > 0);
    }
    function drawHits() {
      const box = $("#sp-hits"); if (!box) return;
      const h = hits(), f0 = field0();
      box.innerHTML = !s.q.trim() ? "" : h.length ? `<ul role="listbox">${h.map(r => `<li><button type="button" data-add="${esc(r.id)}"${f0 && r.field !== f0 ? ` disabled title="${esc(fill(Copy.map.flow.aim.otherField, { field: roleOf(flow.roles[0]).fieldLabel }))}"` : ""}>${esc(r.label)} <span class="small muted">${esc(r.fieldLabel)}</span></button></li>`).join("")}</ul>` : `<p class="small muted">${esc(Copy.map.flow.aim.none)}</p>`;
      box.querySelectorAll("[data-add]").forEach(b => b.onclick = () => add(b.dataset.add));
    }
    function add(id) {
      const r = roleOf(id), f0 = field0();
      if (flow.roles.includes(id) || flow.roles.length >= 4) return;
      if (f0 && r.field !== f0) { s.err = fill(S.aim.otherField, { field: roleOf(flow.roles[0]).fieldLabel }); draw(); return; }
      flow.roles.push(id); save(); s.q = ""; s.err = ""; s.band = null; store.set(OPTS_KEY, null); draw();
      const i = $("#sp-q"); if (i) i.focus();
    }
    function wireAim() {
      const i = $("#sp-q");
      if (i) { i.oninput = () => { s.q = i.value; drawHits(); }; i.onkeydown = e => { if (e.key === "Enter") { const h = hits().filter(r => !field0() || r.field === field0()); if (h[0]) add(h[0].id); } }; drawHits(); }
      main.querySelectorAll(".sp-quick [data-add]").forEach(b => b.onclick = () => add(b.dataset.add));
      main.querySelectorAll("[data-drop]").forEach(b => b.onclick = () => { flow.roles = flow.roles.filter(x => x !== b.dataset.drop); save(); s.band = null; store.set(OPTS_KEY, null); draw(); });
    }

    // ---------- b. what you bring ----------
    const extrasClip = () => Quests.clipExtras(startExtras.map(x => x.text));
    function bringHtml() {
      const B = S.bring, r = state.resume, first = flow.roles[0] ? roleOf(flow.roles[0]) : null;
      const band = s.band && s.bandFor === (r ? r.text.length + ":" + flow.roles[0] : null) ? `<p class="sp-band">${fill(esc(B.band), { band: `<b>${esc(s.band)}</b>`, role: esc(first ? first.label : "") })}</p>` : "";
      const resume = r && !s.change ? `<p class="sp-file"><span>${esc(fill(B.onFile, { name: r.name }))}</span> <button type="button" class="linkish link" id="sp-change">${esc(B.replace)}</button></p>`
        : resumeForm();
      const ex = extrasClip();
      const extras = `<section class="sp-more"><h2>${esc(B.more)}</h2><p class="small muted">${esc(B.moreLead)}</p>
        <p><button type="button" class="btn" id="sp-xpick">${esc(B.choose)}</button><input type="file" id="sp-xfile" accept=".pdf,.docx,.txt,.md" multiple hidden tabindex="-1"></p>
        <ul class="sp-xlist">${startExtras.map((x, i) => `<li>${esc(fill(B.added, { name: x.name, chars: fmt(x.text.length) }))} <button type="button" class="linkish link" data-xdrop="${i}">${esc(B.drop)}</button></li>`).join("")}</ul>
        <p class="small sp-xstatus" id="sp-xstatus" aria-live="polite">${ex.cut ? esc(fill(B.cut, { cap: fmt(Quests.LIMITS.extras) })) : ""}</p>
        <p class="small sp-privacy">${esc(B.privacy)}</p></section>`;
      return frame("bring", `<h1>${esc(B.title)}</h1><h2 class="sp-sub">${esc(B.resume)}</h2>${band}${resume}${extras}`, !!state.resume);
    }
    async function readBand() {
      const r = state.resume, rid = flow.roles[0]; if (!r || !rid) return;
      const key = r.text.length + ":" + rid; if (s.bandFor === key) return;
      try {
        if (map && map.read && map.read.band_label && mapRoles(map)[0] === rid) s.band = map.read.band_label;
        else {
          const R = await Atlas.role(rid); const { M, bands, group } = await Atlas.matcher(R);
          const fit = M.match(r.text, { jobs: R.jobs, familyJobs: R.jobs, label: R.role.label }, { ladder: R.role.ladder });
          s.band = (CM.bands || {})[Matcher.bandOf(fit.overall, bands, group)] || null;
        }
        s.bandFor = key;
        if (here() && stepNow() === "bring" && s.band) draw();
      } catch (e) { console.error(e); }
    }
    function wireBring() {
      if ($("#drop")) wireResumeForm(() => { s.change = false; s.band = null; s.bandFor = null; store.set(OPTS_KEY, null); draw(); });
      const ch = $("#sp-change"); if (ch) ch.onclick = () => { s.change = true; draw(); };
      const pick = $("#sp-xpick"), input = $("#sp-xfile"), st = $("#sp-xstatus");
      pick.onclick = () => input.click();
      input.onchange = async () => {
        for (const f of [...input.files]) {
          st.textContent = fill(S.bring.reading, { name: f.name });
          try { const t = (await fileText(f)).trim(); if (t) { startExtras.push({ name: f.name, text: t }); keepExtras(); } else throw new Error("empty"); }
          catch (e) { console.error(e); st.textContent = fill(S.bring.cantRead, { name: f.name }); return; }
        }
        draw();
      };
      main.querySelectorAll("[data-xdrop]").forEach(b => b.onclick = () => { startExtras.splice(+b.dataset.xdrop, 1); keepExtras(); draw(); });
      readBand();
    }

    // ---------- c to e: how technical, the tools, where the work shows (shared with the open form) ----------
    const techHtml = () => frame("tech", techStep(flow), !!flow.tech);
    const wireTech = () => wireTechStep(flow, () => { save(); store.set(OPTS_KEY, null); go("tools"); });
    const toolsHtml = () => frame("tools", toolsStep(flow, kit, fieldNow(), flow.roles[0] ? roleOf(flow.roles[0]).fieldLabel : ""));
    const wireTools = () => wireToolsStep(flow, () => { save(); store.set(OPTS_KEY, null); }, () => { save(); store.set(OPTS_KEY, null); draw(); });
    const shareHtml = () => frame("share", shareStep(flow, kit, fieldNow()));
    const wireShare = () => wireShareStep(flow, kit, fieldNow(), () => { save(); store.set(OPTS_KEY, null); }, () => { save(); store.set(OPTS_KEY, null); draw(); });

    // ---------- f. the three side projects ----------
    const nodeOf = id => { const t = (map && map.tree) || {}; return [...(t.nodes || []), ...(t.behaviours || [])].find(n => n.id === id) || null; };
    const optionChip = id => { const n = nodeOf(id) || { name: id, state: "must build" }; return `<span class="chip q-skill" title="${esc(MC.states[n.state] || n.state)}"><span class="sdot ${stCls(n.state)}" aria-hidden="true"></span>${esc(n.name || id)}</span>`; };
    function pickHtml() {
      const P = S.pick, o = store.get(OPTS_KEY);
      const projects = o && Array.isArray(o.projects) ? o.projects : [];
      let inner = `<h1>${esc(P.title)}</h1>`;
      if (s.busy) inner += `<div class="wait sp-wait" role="status"><b>${esc(s.msg)}</b><p class="small muted">${esc(P.writingNote)}</p></div>`;
      else if (projects.length) {
        inner += `<p class="sp-hint">${esc(P.lead)}</p><div class="sp-choices">${projects.map(p => {
          const kind = kit.kinds.find(k => k.id === p.build_with.kind) || { label: p.build_with.kind }, place = kit.places.find(x => x.id === p.live_on.place) || { label: p.live_on.place };
          const tools = (p.build_with.tools || p.build_with.examples.map(name => ({ name }))).map(t => `${esc(t.name)}${t.own ? ` (${esc(MC.open.projects.yours)})` : t.free ? ` (${esc(t.free)})` : ""}`).join(", ");
          return `<article class="sp-choice" data-project="${esc(p.id)}"><h2>${esc(p.title)}</h2><p class="q-ship"><b>${esc(MC.youShip)}</b>${esc(p.ship)}</p>
            <div class="q-chips">${p.atlas_skills.map(optionChip).join("")}</div>
            <dl class="sp-recipe"><div><dt>${esc(P.buildWith)}</dt><dd>${esc(kind.label)}<small>${tools}</small></dd></div><div><dt>${esc(P.liveOn)}</dt><dd>${esc(place.label)}</dd></div></dl>
            <p><button type="button" class="btn primary" data-pick="${esc(p.id)}">${esc(P.choose)}</button></p></article>`;
        }).join("")}</div>
        <p class="sp-again"><button type="button" class="btn" id="sp-more">${esc(P.more)}</button>${o.left != null ? ` <span class="small muted">${esc(fill(P.left, { left: o.left }))}</span>` : ""}</p>`;
      }
      if (s.msg && !s.busy) inner += `<p class="sp-err" role="alert">${esc(s.msg)}</p>${projects.length ? "" : `<p><button type="button" class="btn primary" id="sp-more">${esc(P.more)}</button></p>`}`;
      return frame("pick", inner);
    }
    const post = async (url, sess, payload) => { try { return await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${sess.access_token}` }, body: JSON.stringify(payload) }); } catch (e) { console.error(e); return null; } };
    async function writeProjects() {
      const P = S.pick;
      if (!state.resume) { s.msg = P.noResume; draw(); return; }
      if (!flow.roles.length) { s.msg = P.noRoles; draw(); return; }
      const sess = await Auth.session(); if (!sess) { toHash(signinHref()); return; }
      s.busy = true; s.msg = "";
      // the tree first: no map yet, or a self-serve map whose roles changed (POST /api/tree, unchanged)
      const same = map && mapRoles(map).join(",") === flow.roles.join(",");
      if (!map || (!fixed && !same)) {
        s.msg = P.building; draw();
        const r = await post("api/tree", sess, { text: state.resume.text, roles: flow.roles, campus: (campusGate().campus || {}).label || undefined });
        if (!here()) return;
        if (!r || !r.ok) { s.busy = false; s.msg = r && r.status === 409 ? P.byHand : r && r.status === 401 ? P.signedOut : P.failed; draw(); return; }
        mapHeld = null;
        try { map = await Auth.readMap(sess); if (map) mapHeld = { uid: sess.uid, map }; } catch (e) { console.error(e); }
        if (!here()) return;
        if (!map) { s.busy = false; s.msg = P.failed; draw(); return; }
      }
      s.msg = P.writing; draw();
      const r = await post("api/quests", sess, { mode: "write", text: state.resume.text, extras: extrasClip().text, answers: Routes.OpenFlow.answers(flow, kit, fieldNow()) });
      let j = null; try { j = r ? await r.json() : null; } catch { j = null; }
      if (!here()) return;
      s.busy = false;
      if (r && r.ok && j && Array.isArray(j.projects)) { store.set(OPTS_KEY, { projects: j.projects, left: j.left, date: todayIso() }); s.msg = ""; }
      else s.msg = !r ? P.failed : r.status === 429 ? fill(P.capped, { cap: (j && j.cap) || Quests.CAP }) : r.status === 422 ? P.noValid : r.status === 401 ? P.signedOut : P.failed;
      draw();
    }
    async function pickProject(id) {
      const P = S.pick, sess = await Auth.session(); if (!sess) { toHash(signinHref()); return; }
      main.querySelectorAll("[data-pick]").forEach(b => { b.disabled = true; if (b.dataset.pick === id) b.textContent = P.picking; });
      const r = await post("api/quests", sess, { mode: "pick", id });
      let j = null; try { j = r ? await r.json() : null; } catch { j = null; }
      if (!here()) return;
      if (r && r.ok && j && j.card) {
        mapHeld = null; mapUi = null; store.set(OPTS_KEY, null); startExtras = []; keepExtras();
        const h = `#/map/quests?q=${encodeURIComponent(j.card)}`;
        toHash(h); if (location.hash === h) route();
        return;
      }
      if (r && r.status === 410) store.set(OPTS_KEY, null);
      s.msg = !r ? P.failed : r.status === 410 ? P.expired : r.status === 409 ? P.full : r.status === 401 ? P.signedOut : P.failed;
      draw();
    }
    function wirePick() {
      const o = store.get(OPTS_KEY);
      main.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => pickProject(b.dataset.pick));
      const more = $("#sp-more"); if (more) more.onclick = () => { store.set(OPTS_KEY, null); writeProjects(); };
      if (!s.busy && !s.msg && !(o && Array.isArray(o.projects) && o.projects.length)) writeProjects();
    }
    draw();
  }

  // ---------- 1b''. The map screen (the pure parts are web/map.js), two pages since 2026-11-10 ----------
  // #/map/quests (the default; #/map and the old #/map?tab=tree come here or to the tree): one quest at a time in the
  // now card, which opens in place; the slim path (a line of numbered dots per level, nothing gated); up next. Its
  // controls are the person's own: Start, Mark shipped (with the link to the live thing), Skip with Undo, written to
  // maps/<uid>/feedback/<card>.json (web/auth.js), and they count at once (MapModel.worlds). #/map/tree: the legend
  // bar with How you work at its right end, Tree · List (the trunk and branches, or the read in words), the node
  // panel in the aside. No time estimate shows anywhere (the owner, 2026-11-10: the estimates are not verified). The
  // map file is the truth for the owner's marks (shipped, declined); the screen never rewrites it. Print draws the
  // one-page sheet (@media print).
  let mapUi = null;   // { map, M (the index as map.js reads it), tree, page, view, mine, now, open, shipping, skipped, … }
  const SVG_NS = "http://www.w3.org/2000/svg";
  const stCls = s => ({ "shows": "st-shows", "shows in other words": "st-other", "must evidence better": "st-half", "must build": "st-build" })[s] || "st-build";
  const lookCls = n => n.shipped ? "st-built" : stCls(n.state);
  const lookWords = n => n.shipped ? n.shipped.label : Copy.map.states[n.state] || n.state;
  const sdot = n => `<span class="sdot ${lookCls(n)}" aria-hidden="true"></span>`;
  const diamond = `<svg class="mk-p" width="9" height="9" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 0 8 4 4 8 0 4Z"/></svg>`;
  const chevron = `<svg class="mk-s" width="11" height="8" viewBox="0 0 11 8" aria-hidden="true"><path d="M1.5 6.5 5.5 2.5 9.5 6.5"/></svg>`;
  const hostOf = url => { try { return new URL(url).host.replace(/^www\./, ""); } catch { return String(url || ""); } };
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
  const levelWords = w => w.label ? `${w.head} · ${w.label}` : w.head;
  const questHref = id => `#/map/quests?q=${encodeURIComponent(id)}`;
  // the quest the now card shows goes in the address (replaced, so Back leaves the map as it came)
  const keepNow = id => { const p = new URLSearchParams(Routes.parseRoute(location.hash).search); p.set("q", id); history.replaceState(null, "", location.pathname + location.search + "#/map/quests?" + p); };
  // the steps ticked on a card, kept in this browser only (a convenience; nothing goes up)
  const stepsKey = id => "map.steps." + id;
  const ticksOf = id => { try { const v = JSON.parse(localStorage.getItem(stepsKey(id))); return Array.isArray(v) ? v : []; } catch { return []; } };
  const keepTicks = (id, v) => { try { localStorage.setItem(stepsKey(id), JSON.stringify(v)); } catch { } };

  // The person's own marks, one feedback file per card, read once per page load and kept beside the map (mapHeld)
  async function readMine(map) {
    const s = await Auth.session(); if (!s) return {};
    const out = {};
    await Promise.all((map.cards || []).map(c => Auth.readFeedback(s, c.id).then(o => { if (o) out[c.id] = o; }).catch(e => console.error(e))));
    return out;
  }

  // `anon`: the open tree (openScreen): the Skill tree page alone, no quest page, no sign-out, and above the tree the
  // slot the projects (or the line that they are being written) and the booking card fill (drawOpenNext), so they
  // are the first thing after the last step (2026-11-12); on the Quests page the slot (the booking card) follows it
  function drawMap(map, ix, out, anon) {
    const MC = Copy.map, st = map.student || {}, role = (map.role || {}).label || "", company = (map.company || {}).name || "";
    const M = ix ? { skillById: ix.skillById, edges: ix.M.edges, clusters: ix.M.clusters, reads: (s, keys) => textOf(ix.M.meta.kinds).reads(s, keys) } : {};
    const R0 = Routes.parseRoute(location.hash), sub = R0.parts[1] === "tree" ? "tree" : "quests";
    const held = mapHeld && mapHeld.map === map ? mapHeld : null;
    if (held && !held.mine) held.mine = {};
    mapUi = { map, M, page: sub, view: R0.query.view === "list" ? "list" : "tree", anon: !!anon, mine: anon ? (openHeld.mine ||= {}) : held ? held.mine : {}, now: R0.query.q || null, open: !!R0.query.q, shipping: null, draft: "", linkErr: false, saveErr: null, busy: false, skipped: null, panel: null, catalog: null, why: {}, lines: {} };
    mapUi.tree = MapModel.classTree(map, mapUi.mine);
    crumbs([[MC.nav[sub], null]]);   // Build skills / Quests, or Build skills / Skill tree
    const name = st.name_on_page;
    const h1 = sub === "tree" ? (name ? fill(MC.treeTitle, { name }) : MC.treeHeading) : (name ? fill(MC.questsTitle, { name }) : MC.questsHeading);
    const lead = sub === "tree" ? (role ? fill(mapUi.tree.roles.length > 1 ? MC.treeSub : MC.treeSubOne, { role }) : "") : (role ? (company ? fill(MC.roleAt, { role, company }) : role + ".") : "");
    page(`<div class="map-head"><h1>${esc(h1)}</h1>${lead ? `<p class="map-lead">${esc(lead)}</p>` : ""}</div>
      <nav class="mapnav" aria-label="${esc(MC.navAria)}">${(anon && !(map.cards || []).length ? [] : ["quests", "tree"]).map(p => `<a href="#/map/${p}"${p === sub ? ` class="on" aria-current="page"` : ""}>${esc(MC.nav[p])}</a>`).join("")}<span class="sp"></span><span class="map-top">${questsOn() && !anon && sub === "quests" ? `<a class="btn primary map-start" href="#/map/start">${esc(MC.startSide)}</a>` : ""}<button type="button" class="btn sm map-print-btn" id="map-print">${esc(MC.print)}</button></span></nav>
      ${anon && sub === "tree" ? `<div id="open-next"></div>` : ""}<div id="map-body"></div>
      ${anon && sub !== "tree" ? `<div id="open-next"></div>` : ""}${anon ? `<p class="small muted map-only">${esc((map.cards || []).length ? MC.open.keptQuests : MC.open.kept)} <button type="button" class="linkish link" id="open-forget">${esc(MC.open.forget)}</button></p>` : `<p class="small muted map-only">${esc(MC.only)} ${out}</p>`}
      ${treeOn() && selfServe(map) ? `<p class="small muted map-self">${esc(fill(MC.tree.self, { date: MapModel.dateWords(map.published) }))} <a href="#/map?build=1">${esc(MC.tree.again)}</a></p>` : ""}
      <div id="map-print-sheet"></div>`);
    main.firstElementChild.classList.add("wide", "map-page");
    $("#map-print").onclick = () => window.print();
    const forget = $("#open-forget"); if (forget) forget.onclick = () => { openHeld = null; store.set(OPEN_KEY, null); store.set(OPEN_FLOW_KEY, null); mapUi = null; route(); };
    drawBody();
    if (held && !held.mineRead) {
      held.mineRead = true;
      readMine(map).then(mine => { for (const k in mine) if (!(k in held.mine)) held.mine[k] = mine[k]; if (onMap() && mapUi.map === map) { mapUi.tree = MapModel.classTree(map, mapUi.mine); drawBody(); } });
    }
  }
  function drawBody() {
    if (!onMap()) return;
    if (mapUi.page === "tree") drawTreePage(); else drawQuests();
    const sheet = $("#map-print-sheet"); if (sheet) sheet.innerHTML = printSheet();
  }

  // ---------- the Quests page: the now card, the slim path, up next ----------
  function drawQuests() {
    const MC = Copy.map, W = mapWorlds(), body = $("#map-body");
    const m = MapModel.nowQuest(W, mapUi.now);
    if (!m) {
      // a self-serve map with no story card has no quest yet; with the flag on, the box offers a side project
      body.innerHTML = questsOn() && !mapUi.anon ? `<section class="q-empty" id="q-empty"><p>${esc(MC.emptySide)}</p><p><a class="btn primary" href="#/map/start">${esc(MC.startSide)}</a></p><p><a href="#/map/tree">${esc(MC.emptyTree)}</a></p></section>`
        : `<section class="q-empty" id="q-empty"><p>${esc(MC.empty)}</p><p><a href="#/map/tree">${esc(MC.emptyTree)}</a></p></section>`;
      return;
    }
    mapUi.now = m.id;
    const w = MapModel.missionOf(W, m.id).world;
    const sk = mapUi.skipped && MapModel.cardsById(mapUi.map)[mapUi.skipped];
    const note = sk ? `<p class="q-note" aria-live="polite">${esc(fill(MC.skippedNote, { title: sk.title }))} <button type="button" class="linkish link" data-undo>${esc(MC.undo)}</button></p>` : "";
    body.innerHTML = note + nowCard(m, w, W) + `<div class="q-below">${pathHtml(W, m.id)}${upNextHtml(W, m.id)}</div>`;
    wireQuests(m, W);
  }
  function skillChip(id) {
    const s = MapModel.skillInfo(mapUi.map, mapUi.M, id, mapUi.mine);
    return `<span class="chip q-skill" title="${esc(lookWords(s))}">${sdot(s)}${esc(s.name)}</span>`;
  }
  function nowCard(m, w, W) {
    const MC = Copy.map, K = MC.card, c = m.card, st = m.state, story = MapModel.storyOf(c);
    const open = mapUi.open || st === "started" || mapUi.shipping === c.id;
    const one = MapModel.shipLine(c.ship);
    const tag = (st === "open" ? "" : `<span class="q-tag q-${st}">${esc(MC.questStates[st])}</span>`) + (c.kind === "side_project" ? `<span class="small muted q-by">${esc(MC.sideTag)}</span>` : "");
    let h = `<article class="q-now q-${st}${open ? " open" : ""}" aria-label="${esc(MC.nowAria)}" data-card="${esc(c.id)}">
      <div class="q-top"><span class="eyebrow">${esc(fill(MC.now, { level: levelWords(w) }))}</span>${tag}</div>
      <h2>${esc(c.title)}</h2>
      ${one ? `<p class="q-ship"><b>${esc(MC.youShip)}</b>${esc(one)}</p>` : ""}
      ${(c.atlas_skills || []).length ? `<div class="q-chips">${c.atlas_skills.slice(0, 3).map(skillChip).join("")}</div>` : ""}`;
    if (st === "shipped") {
      const when = m.shippedOn ? fill(MC.shippedOn, { date: MapModel.dateWords(m.shippedOn) }) : "";
      h += `<p class="q-live">${m.link ? `${esc(MC.liveAt)} <a href="${esc(safeUrl(m.link))}" target="_blank" rel="noopener">${esc(m.link.replace(/^https?:\/\//, ""))}</a> · ` : ""}${esc(when)}</p>`;
    }
    if (open) h += openedHtml(m, story, one);
    h += actionsHtml(m, W, open);
    return h + `</article>`;
  }
  // the opened quest: the full ship text when the line cut it; the new optional fields when the card has them (steps,
  // prompt, build_with, live_on); a story card's working parts; then one closed "Why this quest"
  function openedHtml(m, story, one) {
    const MC = Copy.map, K = MC.card, S = K.story, c = m.card, map = mapUi.map, company = (map.company || {}).name || "";
    const full = String(c.ship || "").trim();
    let h = `<div class="q-open">`;
    if (full && full !== one) h += `<p class="q-full">${esc(full)}</p>`;
    if (story) {
      h += `<div class="q-line"><p class="k">${esc(S.lineToday)}</p><q>${esc(story.line)}</q><p class="k">${esc(fill(S.todayState, { state: (MC.states[story.state] || story.state).toLowerCase() }))}</p></div>`;
      if (story.slots.length) h += `<section class="q-sect"><h3>${esc(S.shows)}</h3><ul class="slots">${story.slots.map(x => `<li><b>${esc(S.slots[x.key] || x.key)}</b> ${esc(x.items.join(", "))}</li>`).join("")}</ul></section>`;
      h += `<section class="q-sect q-try"><h3>${esc(S.tryIt)}</h3><p class="small muted">${esc(S.tryHint)}</p><textarea id="story-line" maxlength="400" aria-label="${esc(S.tryAria)}" placeholder="${esc(S.tryPlaceholder)}">${esc(mapUi.lines[c.id] || "")}</textarea><p class="story-read" id="story-read" aria-live="polite"></p></section>`;
    }
    if (Array.isArray(c.steps) && c.steps.length) {
      const t = ticksOf(c.id);
      h += `<section class="q-sect"><h3>${esc(K.steps)}</h3><ul class="q-checks">${c.steps.map((x, i) => `<li><label class="${t[i] ? "done" : ""}"><input type="checkbox" data-step="${i}"${t[i] ? " checked" : ""}><span>${esc(x)}</span></label></li>`).join("")}</ul></section>`;
    }
    const tools = (head, xs) => Array.isArray(xs) && xs.length ? `<section class="q-sect"><h3>${esc(head)}</h3><ul class="q-tools">${xs.map(x => `<li><b>${esc(x.name || "")}</b>${x.note ? ` <span class="muted">${esc(x.note)}</span>` : ""}</li>`).join("")}</ul></section>` : "";
    h += tools(K.buildWith, c.build_with) + tools(K.liveOn, c.live_on);
    if (typeof c.prompt === "string" && c.prompt) h += `<section class="q-sect"><h3>${esc(story ? S.practice : K.prompt)}</h3><pre class="prompt" id="q-prompt">${esc(c.prompt)}</pre><p class="q-copy"><button type="button" class="btn" id="q-copy">${esc(story ? S.copy : K.copy)}</button><span class="small muted" id="q-copied"></span></p></section>`;
    // the why, folded: each line cut to its first sentence, with its quote; then what the card cites
    const first = MapModel.firstSentence;
    const rows = [];
    if (story && (story.reads_as || story.what)) { const field = ((map.role_class || {}).label || "").replace(/ roles$/, ""); rows.push([field ? fill(S.means, { field }) : S.meansPlain, esc(first(story.reads_as || story.what))]); }
    if (c.why_role && c.why_role.text) rows.push([K.whyRole, esc(first(c.why_role.text)) + (c.why_role.posting_quote ? ` <q>${esc(c.why_role.posting_quote)}</q>` : "")]);
    if (c.why_company && c.why_company.text) rows.push([company || K.whyCompany, esc(first(c.why_company.text)) + (c.why_company.url ? ` <a href="${esc(safeUrl(c.why_company.url))}" target="_blank" rel="noopener">${esc(hostOf(c.why_company.url))}</a>` : "")]);
    if (c.why_person && c.why_person.text) rows.push([K.whyYou, esc(first(c.why_person.text)) + (c.why_person.profile_quote && !story ? ` <q>${esc(c.why_person.profile_quote)}</q>` : "")]);
    if ((c.classes || []).length) rows.push([K.classes, `<span id="map-classes">${classList(c)}</span>`]);
    if (c.users) rows.push([K.users, esc(c.users)]);
    if (story) rows.push([K.sources, `<a href="#/role/${esc((map.role || {}).id || "")}">${esc(fill(S.fromAtlas, { role: (map.role || {}).label || "" }))}</a>`]);
    else if ((c.sources || []).length) rows.push([K.sources, `<ul class="src">${c.sources.map(s => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.title)}</a>${s.read ? ` <span class="subtle">· ${esc(fill(K.read, { date: MapModel.dateWords(s.read) }))}</span>` : ""}</li>`).join("")}</ul>`]);
    if (rows.length) h += `<details class="q-why" id="q-why"${mapUi.why[c.id] ? " open" : ""}><summary>${esc(K.why)}</summary><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl></details>`;
    return h + `</div>`;
  }
  function actionsHtml(m, W, open) {
    const MC = Copy.map, c = m.card, st = m.state, next = MapModel.upNext(W, m.id, 1)[0];
    const busy = mapUi.busy ? " disabled" : "";
    const err = mapUi.saveErr === c.id ? `<p class="small q-err" role="alert">${esc(MC.saveFailed)}</p>` : "";
    const fold = st === "started" ? "" : `<button type="button" class="linkish link" data-act="fold">${esc(open ? MC.hide : MC.details)}</button>`;
    const nextBtn = cls => next ? `<button type="button" class="btn${cls}" data-q="${esc(next.id)}">${esc(MC.nextQuest)}</button>` : "";
    if (mapUi.shipping === c.id) {
      return `<form class="q-shipform" id="q-ship" novalidate><label for="q-link">${esc(m.kind === "story" ? MC.linkStory : MC.linkLabel)}</label>
        <div class="r"><input id="q-link" type="url" inputmode="url" autocomplete="url" maxlength="500" placeholder="${esc(MC.linkHint)}" value="${esc(mapUi.draft)}"${mapUi.linkErr ? ` aria-invalid="true" aria-describedby="q-linkerr"` : ""}>
        <button class="btn primary" type="submit"${busy}>${esc(mapUi.busy ? MC.saving : MC.markShipped)}</button><button type="button" class="linkish link" data-act="notyet">${esc(MC.notYet)}</button></div>
        ${mapUi.linkErr ? `<p class="small q-err" id="q-linkerr">${esc(MC.linkBad)}</p>` : ""}${err}</form>`;
    }
    let a;
    if (m.locked) a = nextBtn(" primary") + fold;
    else if (st === "open") a = `<button type="button" class="btn primary lg" data-act="start"${busy}>${esc(MC.start)}</button><button type="button" class="linkish link" data-act="skip"${busy}>${esc(MC.skip)}</button>${fold}`;
    else if (st === "started") a = `<button type="button" class="btn primary lg" data-act="ship"${busy}>${esc(MC.markShipped)}</button><button type="button" class="linkish link" data-act="skip"${busy}>${esc(MC.skip)}</button>`;
    else if (st === "shipped") a = nextBtn(" primary") + fold + `<button type="button" class="linkish link" data-act="unship"${busy}>${esc(MC.notShipped)}</button>`;
    else a = `<button type="button" class="btn primary" data-act="back"${busy}>${esc(MC.bringBack)}</button>${nextBtn("")}`;
    return `<div class="q-actions">${a}</div>${err}`;
  }
  function pathHtml(W, nowId) {
    const MC = Copy.map;
    return `<nav class="q-path" aria-label="${esc(MC.pathAria)}">${W.worlds.map(w => `<div class="lvl">
      <div class="lvl-name"><span class="nm">${w.optional || w.side ? "" : `<i>${esc(String(w.num))}</i>`}${esc(w.optional || w.side ? levelWords(w) : w.label)}</span></div>
      <div class="line${w.optional ? " reach" : ""}${w.missions.length < 3 ? " few" : ""}">${w.missions.map(m => `<button type="button" class="dot q-${m.state}${m.id === nowId ? " cur" : ""}${m.kind === "story" ? " story" : ""}" data-q="${esc(m.id)}" title="${esc(m.card.title)}" aria-label="${esc(m.card.title + ". " + MC.questStates[m.state] + ".")}"${m.id === nowId ? ` aria-current="step"` : ""}>${m.state === "shipped" ? `<span aria-hidden="true">✓</span>` : m.i}</button>`).join("")}</div>
    </div>`).join("")}</nav>`;
  }
  function upNextHtml(W, nowId) {
    const MC = Copy.map, next = MapModel.upNext(W, nowId, 3);
    return `<section class="q-next"><h3>${esc(MC.upNext)}</h3>${next.length ? `<ul>${next.map(m => `<li><button type="button" data-q="${esc(m.id)}">${esc(m.card.title)}</button></li>`).join("")}</ul>` : `<p class="small muted">${esc(MC.allDone)}</p>`}</section>`;
  }
  function wireQuests(m, W) {
    const body = $("#map-body"), c = m.card, story = MapModel.storyOf(c);
    const go = id => { mapUi.now = id; mapUi.open = false; mapUi.shipping = null; mapUi.linkErr = false; mapUi.saveErr = null; keepNow(id); drawQuests(); const card = main.querySelector(".q-now"); if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: "start" }); };
    body.querySelectorAll("[data-q]").forEach(b => b.onclick = () => go(b.dataset.q));
    const undo = body.querySelector("[data-undo]");
    if (undo) undo.onclick = async () => { const id = mapUi.skipped, prev = mapUi.skipPrev; mapUi.skipped = null; await mark(id, prev === "start" ? "start" : "open"); mapUi.now = id; keepNow(id); drawQuests(); };
    const act = (k, f) => { const b = body.querySelector(`[data-act="${k}"]`); if (b) b.onclick = f; };
    act("fold", () => { mapUi.open = !mapUi.open; drawQuests(); });
    act("start", async () => { mapUi.open = true; await mark(c.id, "start"); drawQuests(); });
    act("ship", () => { mapUi.shipping = c.id; mapUi.draft = ""; mapUi.linkErr = false; drawQuests(); const i = $("#q-link"); if (i) i.focus(); });
    act("notyet", () => { mapUi.shipping = null; mapUi.linkErr = false; drawQuests(); });
    act("unship", async () => { await mark(c.id, "start"); mapUi.open = true; drawQuests(); });
    act("back", async () => { await mark(c.id, "open"); drawQuests(); });
    act("skip", async () => {
      const prev = (MapModel.ownChoice(mapUi.mine[c.id]) || {}).choice || null;
      if (!(await mark(c.id, "skip"))) { drawQuests(); return; }
      mapUi.skipped = c.id; mapUi.skipPrev = prev; mapUi.open = false;
      const next = MapModel.upNext(mapWorlds(), c.id, 1)[0];
      if (next) { mapUi.now = next.id; keepNow(next.id); }
      drawQuests();
    });
    const form = $("#q-ship");
    if (form) {
      const input = $("#q-link");
      input.oninput = () => { mapUi.draft = input.value; };
      form.onsubmit = async e => {
        e.preventDefault();
        const link = Auth.cleanLink(input.value);
        if (!link) { mapUi.linkErr = true; drawQuests(); const i = $("#q-link"); if (i) i.focus(); return; }
        mapUi.linkErr = false;
        if (await mark(c.id, "shipped", link)) { mapUi.shipping = null; mapUi.open = false; }
        drawQuests();
      };
    }
    body.querySelectorAll(".q-checks input[data-step]").forEach(b => b.onchange = () => { const t = ticksOf(c.id); t[+b.dataset.step] = b.checked; keepTicks(c.id, t); b.closest("label").classList.toggle("done", b.checked); });
    const why = $("#q-why"); if (why) why.ontoggle = () => { mapUi.why[c.id] = why.open; };
    const copy = $("#q-copy"), pre = $("#q-prompt"), said = $("#q-copied");
    if (copy && pre) copy.onclick = async () => {
      try { await navigator.clipboard.writeText(pre.textContent); if (said) said.textContent = story ? Copy.map.card.story.copied : Copy.map.card.copied; }
      catch { const range = document.createRange(); range.selectNodeContents(pre); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
    };
    if (story) storyControls(c, story);
    // the class titles from the class roster (Catalog), once per page; the codes stand until they load
    if (!story && (c.classes || []).length && $("#map-classes") && window.Catalog) {
      if (!mapUi.catalog) mapUi.catalog = Catalog.loadCatalog().then(d => Object.fromEntries(d.classes.map(k => [k.code, k.title || ""]))).catch(e => { console.error(e); return {}; });
      mapUi.catalog.then(t => { mapUi.titles = t; const el = $("#map-classes"); if (el && mapUi.now === c.id) el.innerHTML = classList(c); });
    }
  }
  // one mark written to the person's own folder, then kept here; true when it went up
  async function mark(cardId, choice, link) {
    mapUi.busy = true; mapUi.saveErr = null;
    let ok = false;
    try {
      const obj = Auth.feedbackObject(cardId, choice, link, todayIso());
      // the open tree keeps a mark in this browser (open.tree); a session writes it to the person's folder
      if (mapUi.anon) { mapUi.mine[cardId] = obj; openKeep(openHeld); }
      else { const s = await Auth.session(); if (!s) throw new Error("No session"); await Auth.writeFeedback(s, cardId, obj); }
      mapUi.mine[cardId] = obj; ok = true;
      mapUi.tree = MapModel.classTree(mapUi.map, mapUi.mine);
    } catch (e) { console.error(e); mapUi.saveErr = cardId; }
    mapUi.busy = false;
    return ok;
  }
  // The story card's two controls. The box reads the new line with the matcher of the map's role, the way the fit
  // page read the résumé (Atlas.matcher), on its own: the row's status for the card's skill becomes one of the four
  // states (MapModel.lineState). Nothing is stored and nothing is sent.
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
        if (my === seq && mapUi && mapUi.now === c.id && $("#story-read") === out) show(state, S.result[state] || "");
      } catch (e) { console.error(e); if (my === seq) show(null, ""); }
    };
    if (box) {
      box.oninput = () => { mapUi.lines[c.id] = box.value; clearTimeout(timer); timer = setTimeout(() => readLine(box.value), 450); };
      if (box.value) readLine(box.value);
    }
  }
  function classList(c) {
    const codes = c.classes || [], t = mapUi.titles || {};
    return codes.map(code => `<span class="q-class"><code>${esc(code)}</code> ${esc(t[code] || "")}</span>`).join("");
  }

  // ---------- the Skill tree page: the legend bar, How you work, Tree · List ----------
  function drawTreePage() {
    const MC = Copy.map, T = mapUi.tree, body = $("#map-body");
    const how = T.behaviours.slice().sort((a, b) => MapModel.rankOf(a.state) - MapModel.rankOf(b.state));
    const howRow = n => { const qs = MapModel.questsOf(mapUi.map, n.id), q = qs[0];
      return `<li>${sdot(n)}<span><button type="button" class="linkish" data-node="${esc(n.id)}">${esc(n.name)}</button><small>${esc(lookWords(n))}${q ? ` · <a href="${esc(questHref(q.id))}">${esc(q.title)}</a>` : n.state === "shows" ? "" : ` · ${esc(MC.howNone)}`}</small></span></li>`; };
    body.innerHTML = `<div class="lgwrap"><div class="legend-bar" role="note">${MapModel.STATES.map(s => `<span class="${stCls(s)}"><span class="sdot"></span>${esc(MC.states[s])}</span>`).join("")}<span class="st-built"><span class="sdot"></span>${esc(MC.shippedLegend)}</span><span>${diamond} ${esc(MC.postingNames)}</span><span>${chevron} ${esc(MC.senior)}</span>${how.length ? `<span class="sp"></span><button type="button" class="linkish link lb-how" id="map-how" aria-expanded="false" aria-controls="map-howpop">${esc(MC.how)}</button>` : ""}</div>
      ${how.length ? `<div class="how-pop" id="map-howpop" role="dialog" aria-label="${esc(MC.how)}" hidden><h3>${esc(MC.how)}</h3><p>${esc(MC.howLead)}</p><ul>${how.map(howRow).join("")}</ul></div>` : ""}</div>
      <div class="seg map-view" role="group" aria-label="${esc(MC.viewAria)}">${["tree", "list"].map(v => `<button type="button" data-view="${v}" aria-pressed="${mapUi.view === v}"${mapUi.view === v ? ` class="on"` : ""}>${esc(MC.view[v])}</button>`).join("")}</div>
      <div id="map-view"></div>`;
    const btn = $("#map-how"), pop = $("#map-howpop");
    if (btn && pop) {
      btn.onclick = e => { e.stopPropagation(); howOpen(pop.hidden); };
      pop.querySelectorAll("[data-node]").forEach(b => b.onclick = () => { howOpen(false); openNode(b.dataset.node); });
    }
    body.querySelectorAll("[data-view]").forEach(b => b.onclick = () => {
      mapUi.view = b.dataset.view; closePanel();
      const p = new URLSearchParams(Routes.parseRoute(location.hash).search); if (mapUi.view === "list") p.set("view", "list"); else p.delete("view");
      history.replaceState(null, "", location.pathname + location.search + "#/map/tree" + (p.toString() ? "?" + p : ""));
      drawTreePage();
    });
    if (mapUi.view === "list") drawList(); else drawTree();
  }
  function howOpen(on) {
    const btn = $("#map-how"), pop = $("#map-howpop"); if (!btn || !pop) return;
    pop.hidden = !on; btn.setAttribute("aria-expanded", String(on));
  }
  document.addEventListener("click", e => { const pop = $("#map-howpop"); if (pop && !pop.hidden && !pop.contains(e.target)) howOpen(false); });
  // List: the read in words (R31), the band as its headline, what you bring under its lines, the posting's gaps with
  // the quest that builds each; no gaps column when the posting named none
  function drawList() {
    const MC = Copy.map, role = (mapUi.map.role || {}).label || "", R = MapModel.readLines(mapUi.map, mapUi.M, mapUi.mine), view = $("#map-view");
    const skill = s => { const n = MapModel.skillInfo(mapUi.map, mapUi.M, s.id, mapUi.mine); return `<button type="button" class="linkish" data-node="${esc(s.id)}" title="${esc(lookWords(n))}">${sdot(n)}${esc(s.name)}</button>`; };
    const groups = R.groups.map(g => `<li>${g.line ? `<q class="rd-line">${esc(g.line)}</q>` : ""}<span class="rd-skills">${g.skills.map(skill).join("")}</span></li>`).join("");
    const gaps = R.gaps.map(g => `<li>${skill(g)}<small>${esc(MC.states[g.state] || "")} · ${g.mission ? `<a href="${esc(questHref(g.mission.id))}">${esc(g.mission.title)}</a>` : esc(g.none)}</small></li>`).join("");
    view.innerHTML = `<section class="rd">
      ${R.headline ? `<p class="rd-band">${fill(esc(MC.band), { band: `<b>${esc(R.band)}</b>`, role: esc(role) })}</p>` : ""}
      ${role ? `<p class="small muted rd-sub">${esc(fill(MC.readSub, { role }))}</p>` : ""}
      <div class="rd-cols${gaps ? "" : " one"}">
        <div><h2>${esc(MC.brings)}</h2><ul class="rd-list">${groups}</ul></div>
        ${gaps ? `<div><h2>${esc(MC.gaps)}</h2><p class="small muted rd-hint">${esc(MC.gapsHint)}</p><ul class="rd-list rd-gaps">${gaps}</ul></div>` : ""}
      </div></section>`;
    view.querySelectorAll("[data-node]").forEach(b => b.onclick = () => openNode(b.dataset.node));
  }

  // ---------- T4, the tree: the trunk and its branches ----------
  function drawTree() {
    const MC = Copy.map, T = mapUi.tree, L = MapModel.treeLayout(T, 816), view = $("#map-view");
    view.innerHTML = `<div class="t4-scroll"><div class="t4-host"></div></div><p class="t2-cap">${esc(MC.treeCap)}</p>
      <div class="t2-links"><button type="button" id="map-more">${esc(MC.more)}</button></div>`;
    const svg = svgEl("svg", { class: "t4", width: L.width, height: L.height, viewBox: `0 0 ${L.width} ${L.height}`, role: "group", "aria-label": fill(MC.treeAria, { label: T.label.toLowerCase() || "" }) }, view.querySelector(".t4-host"));
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
    $("#map-more").onclick = openMore;
    markTree();
  }
  // the open node, its co-asked nodes and the lines between them: on the tree only while the node panel is open
  function markTree() {
    const svg = main.querySelector("svg.t4"); if (!svg) return;
    const co = $("#map-co"); co.innerHTML = "";
    main.querySelectorAll(".t4 .node").forEach(x => x.classList.remove("sel", "co"));
    const id = mapUi.panel && mapUi.panel.kind === "node" ? mapUi.panel.id : null; if (!id) return;
    const L = MapModel.treeLayout(mapUi.tree, 816), at = Object.fromEntries(L.nodes.map(n => [n.id, n]));
    const self = main.querySelector(`.t4 [data-node="${CSS.escape(id)}"]`); if (self) self.classList.add("sel");
    for (const o of MapModel.coAsked(mapUi.map, mapUi.M, id)) {
      const el = main.querySelector(`.t4 [data-node="${CSS.escape(o)}"]`); if (el) el.classList.add("co");
      const a = at[id], b = at[o]; if (!a || !b) continue;
      // a gentle bow, so a line between two neighbors never hides under the tree's own strokes
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, k = Math.max(30, Math.min(60, len * 0.3));
      let px = -dy / len, py = dx / len; if (px < 0 || (px === 0 && py < 0)) { px = -px; py = -py; }
      svgEl("path", { d: `M${a.x},${a.y} Q${(a.x + b.x) / 2 + px * k},${(a.y + b.y) / 2 + py * k} ${b.x},${b.y}` }, co);
    }
  }

  // ---------- the side panel (the Skill tree page) ----------
  function panel(html, p) {
    mapUi.panel = p;
    showAside(`${UI.close(CM.close)}${html}`);
    aside.querySelector(".close").onclick = closePanel;
    markTree();
  }
  function closePanel() {
    if (!mapUi) return;
    const had = mapUi.panel; mapUi.panel = null; showAside(null);
    if (had && $("#map-body")) markTree();
  }
  // the node panel: name, state in words, the line that showed it, what it is, the roles that ask, "asked together
  // with" (three, drawn on the tree while open), the quests that build it (each a link to the Quests page)
  function openNode(id, fromMore) {
    if (!mapUi) return;
    const MC = Copy.map, N = MC.node, s = MapModel.skillInfo(mapUi.map, mapUi.M, id, mapUi.mine), company = (mapUi.map.company || {}).name || "";
    const co = MapModel.coAsked(mapUi.map, mapUi.M, id), cards = MapModel.questsOf(mapUi.map, id), W = mapWorlds();
    const lineHead = s.state === "must evidence better" ? N.lineHalf : s.state === "shows in other words" ? N.lineOther : N.lineShows;
    const mk = [s.posting_names && company ? `<span>${diamond} ${esc(fill(N.postingNames, { company }))}</span>` : "", s.grows ? `<span>${chevron} ${esc(N.senior)}</span>` : ""].join("");
    const roles = s.roles.map(roleLabel);
    const row = c => { const hit = MapModel.missionOf(W, c.id); return `<a class="r" href="${esc(questHref(c.id))}"><span class="t">${esc(c.title)}</span><span class="m">${esc(hit ? levelWords(hit.world) : "")}</span>${hit ? `<span class="n">${esc(MC.questStates[hit.mission.state])}</span>` : ""}</a>`; };
    panel((fromMore ? `<button type="button" class="backlink" data-back="more">${esc(MC.moreBack)}</button>` : "") +
      (s.area_label ? `<p class="eyebrow">${esc(s.area_label)}</p>` : "") +
      `<h2 class="t2p">${esc(s.name)}</h2><p class="t2-state ${lookCls(s)}"><span class="nd" aria-hidden="true"></span>${esc(lookWords(s))}</p>` +
      (mk ? `<div class="t2-mk">${mk}</div>` : "") +
      (s.shipped && s.shipped.date ? `<p class="t2-since">${esc(fill(N.since, { date: s.shipped.words, title: s.shipped.title }))}</p>` : "") +
      (s.line ? `<div class="rs"><h3 class="rh">${esc(lineHead)}</h3><q>${esc(s.line)}</q>${s.through ? `<p class="small muted">${esc(fill(N.through, { name: s.through }))}</p>` : ""}</div>` : "") +
      (s.what ? `<div class="rs"><h3 class="rh">${esc(N.what)}</h3><p class="what">${esc(s.what)}</p></div>` : "") +
      (roles.length ? `<div class="rs"><h3 class="rh">${esc(N.roles)}</h3><div class="chips">${roles.map(r => `<span class="chip">${esc(r)}</span>`).join("")}</div></div>` : "") +
      (co.length ? `<div class="rs"><h3 class="rh">${esc(N.together)}</h3><div class="co-l">${co.map(c => `<button type="button" data-node="${esc(c)}"><span class="ln" aria-hidden="true"></span>${esc(MapModel.skillInfo(mapUi.map, mapUi.M, c).name)}</button>`).join("")}</div></div>` : "") +
      `<div class="rs"><h3 class="rh">${esc(N.quests)}</h3>${cards.length ? `<div class="list">${cards.map(row).join("")}</div>` : `<p>${esc(MC.noQuest)}</p>`}</div>`,
      { kind: "node", id });
    aside.querySelectorAll("[data-node]").forEach(b => b.onclick = () => openNode(b.dataset.node));
    const back = aside.querySelector("[data-back]"); if (back) back.onclick = openMore;
  }
  function openMore() {
    const MC = Copy.map, list = mapUi.tree.more.map(m => MapModel.skillInfo(mapUi.map, mapUi.M, m.id, mapUi.mine)).sort((a, b) => MapModel.rankOf(a.state) - MapModel.rankOf(b.state));
    const first = mapUi.tree.roles[0];
    panel(`<h2 class="t2p">${esc(MC.more)}</h2>${first ? `<p class="empty">${esc(fill(MC.moreLead, { role: first.label }))}</p>` : ""}
      <div class="list more-l">${list.map(n => `<button class="r" type="button" data-node="${esc(n.id)}"><span class="t">${sdot(n)}${esc(n.name)}</span><span class="m">${esc(lookWords(n))}</span></button>`).join("")}</div>`, { kind: "more" });
    aside.querySelectorAll("[data-node]").forEach(b => b.onclick = () => openNode(b.dataset.node, true));
  }
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !mapUi || Routes.parseRoute(location.hash).name !== "map") return;
    const pop = $("#map-howpop"); if (pop && !pop.hidden) { howOpen(false); const b = $("#map-how"); if (b) b.focus(); return; }
    if (mapUi.panel && !aside.hidden) closePanel();
  });

  // ---------- the print page: one landscape sheet (@media print in style.css) ----------
  // The levels as columns, each quest's title, track, state and three lines of what ships (no time estimate); the
  // tree's states as a row of dots. On screen it stays hidden; it carries the light tokens so any printer reads it.
  function printSheet() {
    const MC = Copy.map, P = MC.printPage, map = mapUi.map, st = map.student || {}, role = (map.role || {}).label || "", company = (map.company || {}).name || "";
    const R = MapModel.readLines(map, mapUi.M, mapUi.mine), W = mapWorlds(), T = mapUi.tree;
    const cols = W.worlds.map(w => `<section><h2>${esc(levelWords(w))}</h2>
      ${w.missions.map(m => `<div class="pr-card q-${m.state}"><span class="t">${esc(m.card.title)}</span><span class="m">${esc([trackLabel(m.card.track), m.state === "open" ? "" : MC.questStates[m.state]].filter(Boolean).join(" · "))}</span><span class="ship">${esc(m.card.ship || "")}</span></div>`).join("")}</section>`).join("");
    const dots = (label, nodes) => nodes.length ? `<div class="pr-grp"><h3>${esc(label)}</h3>${nodes.map(n => `<span class="pr-node">${sdot(n)}${esc(n.name)}</span>`).join("")}</div>` : "";
    const tree = dots(P.trunk, T.trunk) + dots(P.shared, T.shared) + T.branches.map(b => dots(b.role.label, b.own)).join("") + dots(MC.how, T.behaviours);
    const who = role ? (company ? fill(P.role, { role, company }) : role) : "";
    return `<section class="map-print light" aria-hidden="true">
      <header><h1>${esc(st.name_on_page || MC.heading)}</h1><p>${esc(who)}${R.band ? (who ? " · " : "") + esc(fill(P.band, { band: R.band })) : ""}</p>${map.gap_sentence ? `<p class="pr-gap">${esc(map.gap_sentence)}</p>` : ""}</header>
      ${cols ? `<div class="pr-cols">${cols}</div>` : ""}
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
  // reads: the MBA reading; readsTech: joined with the tech reading, for a tech role (Catalog.tagsFor)
  const roster = cm => rosterP[cm.id] ||= Promise.all([Catalog.loadCatalog(cm), Atlas.genericSkills().catch(() => new Set())]).then(([data, generic]) => { const cards = Catalog.collapse(data); const readsOf = t => Object.fromEntries(cards.map(c => [c.key, Catalog.cardTags(c, Catalog.tagsFor(data, t))])); return { data, generic, cards, reads: readsOf(false), readsTech: readsOf(true) }; }).catch(e => { delete rosterP[cm.id]; throw e; });
  async function campusProfs(cm, gaps, tech = false) {
    const { data, generic, cards, reads: mbaReads, readsTech } = await roster(cm); const reads = tech ? readsTech : mbaReads;
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
    // about and lean: what Pick.closest reads when nothing matches (the usability pass of 2026-11-06: "data" and
    // "software" found nothing): the role's blurb and the craft skills its postings ask for at the core share; lean, how
    // much of its core asks is technical, for a word no role holds ("software")
    const coreSkills = r => [...(r.definingList || []), ...(r.asks || [])].filter(a => a.share >= Atlas.TIER.core).map(a => ix.skillById[a.id]).filter(Boolean);
    const roleOptions = ix.groups.flatMap(g => g.roles.map(id => ix.roles[id]).filter(Boolean).sort((a, b) => b.nOpen - a.nOpen).map(r => { const cs = coreSkills(r); return { value: r.id, label: r.label, hint: g.label, about: [r.blurb || "", ...cs.filter(x => !["behaviour", "credential", "tool"].includes(x.kind) && x.cluster !== "credentials").map(x => x.name)], lean: cs.filter(x => x.kind === "technical").length }; }));
    // the note that the tech set comes later goes once the set is shown (TECH_ENABLED)
    const roleHelp = { closest: 3, lead: C.roleClosest, notes: [fill(C.roleFields, { fields: ix.groups.map(g => g.label).join(", ") }), ...(techShown() ? [] : [C.roleLater])] };
    const writeHash = () => { const p = new URLSearchParams({ role: s.role, type: s.type }); if (s.key) p.set("target", s.key); const next = "#/network?" + p; if (location.hash !== next) history.replaceState(null, "", location.pathname + location.search + next); };
    let token = 0;
    // the context for the role on: the role file, the field's postings, the fit, the professors, the skills generic
    // to the role set (no question names one) and the evidence sentences of the skills the questions may name
    const load = async () => {
      const t = ++token;
      const R = await Atlas.role(s.role); const fieldJobs = await fieldJobsOf(R.role.group);
      const m = state.resume ? await matchRole(s.role).catch(e => { console.error(e); return null; }) : null;
      let profs = [], rosterFailed = false;
      if (gate.open) { try { profs = await campusProfs(gate.campus, m ? gapRows(rowsOf(m.r), m.R) : Network.askRows(ix, R, Atlas.TIER.core), R.set === "tech"); } catch (e) { console.error(e); rosterFailed = true; } }
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
      // the types are tabs (usability pass 2026-11-06, the Networking tabs): one Tab stop (the type chosen), the arrow
      // keys, Home and End move and choose; the page under them is the tab panel
      const tabs = `<div class="tabs nw-tabs" role="tablist" aria-label="${esc(C.typesAria)}">${types.map(t => `<button type="button" role="tab" id="nw-tab-${esc(t.id)}" aria-controls="nw-panel" tabindex="${t.id === s.type ? 0 : -1}" class="${t.id === s.type ? "on" : ""}" aria-selected="${t.id === s.type}" data-type="${esc(t.id)}">${esc(t.label)}</button>`).join("")}</div>`;
      // who to look for: one line per level, the five employers with the most open postings of the role and the way
      // to the rest in Find jobs, or the professors
      const lv = W.levels.length ? `<ul class="plain nw-lv">${W.levels.map(l => `<li><b>${esc(l.label)}</b> · ${l.titles.map(x => `${esc(x.title)} <span class="muted">(${esc(x.company)})</span>`).join(" · ")}</li>`).join("")}</ul>` : "";
      const emps = W.employers.length ? `<div class="list nw-emps">${W.employers.map(e => `<div class="r"><span class="t">${esc(e.company)}</span><span class="n">${esc(fill(CM.nOpen, { n: fmt(e.nOpen) }))}</span><span class="m">${esc(e.roles.slice(0, 4).join(", "))}</span></div>`).join("")}</div><p class="nw-more"><a href="${esc(Network.jobsHref(K))}">${esc(C.moreJobs)}</a></p>` : "";
      // with a résumé, the gaps a professor's classes cover; without one, the role's core asks they teach
      // the skill names as the middle of a sentence says them (W.profs names: Network.inText, the usability pass of 2026-11-06)
      const profRow = p => { const xs = p.read ? p.covers : p.asks, n = xs.length ? esc(fill(p.read ? C.gapsOf : C.teachesOf, { n: xs.length, m: p.read ? p.nGaps : p.nAsks })) : esc(p.codes.slice(0, 2).join(", ")); return `<a class="r" href="#/professor/${encodeURIComponent(p.slug)}"><span class="t">${esc(p.name)}</span><span class="n">${n}</span><span class="m">${esc(p.line)}${xs.length ? esc(fill(p.read ? C.covers : C.teachesNames, { names: p.names.join(", ") })) : ""}</span></a>`; };
      const profs = !W.profs ? "" : W.profs.length ? `<div class="list nw-emps">${W.profs.slice(0, 8).map(profRow).join("")}</div>${W.profs.length > 8 ? `<p class="small muted">${esc(fill(C.moreProfs, { n: fmt(W.profs.length - 8) }))}</p>` : ""}` : rosterFailed ? `<p class="small muted">${esc(C.rosterFailed)}</p>` : "";
      const who = `<section class="nw-sec"><h2>${esc(C.who)}</h2>${W.lead ? `<p>${esc(W.lead)}</p>` : ""}${lv}${emps}${profs}</section>`;
      // the prep card: the company or the professor, where to find them, the suggested approach and its Copy button
      const pickHtml = targets.length ? `<div class="dlabel nw-target"><span>${esc(s.type === "faculty" ? C.professor : C.company)}</span><div id="nw-target"></div></div>` : "";
      // where to find them: the links alone (owner's feedback 2026-11-01); faculty have none, the professor's name
      // under the Pick links to the card
      const where = s.type === "faculty" ? (target ? `<p class="nw-prof"><a href="#/professor/${encodeURIComponent(target.slug)}">${esc(target.name)} →</a></p>` : "")
        : `<h3>${esc(C.where)}</h3>${outs.length ? `<ul class="nw-outs">${outs.map(o => `<li><a href="${esc(o.href)}" target="_blank" rel="noopener">${esc(o.label)} ↗</a></li>`).join("")}</ul>` : `<p class="small muted">${esc(C.noWhere)}</p>`}`;
      const addResume = state.resume ? "" : ` <a href="${esc(resumeHref())}" data-resume-link>${esc(AP.addResume)}</a> ${esc(AP.addResumeAfter)}`;
      const approach = `<h3>${esc(AP.heading)}</h3><p class="small muted">${esc(AP.note)}</p>
        <div class="nw-ap"><p class="nw-k">${esc(AP.leadWith)}</p><p>${esc(S.leadWith)}${addResume}</p><p class="nw-k">${esc(AP.ask)}</p><p>${esc(S.ask)}</p><p class="nw-k">${esc(AP.questions)}</p><ol class="qs">${S.questions.map(x => `<li>${esc(x)}</li>`).join("")}</ol></div>
        <p class="acts-row"><button type="button" class="btn primary" id="nw-copy">${esc(AP.copy)}</button><span class="small muted" id="nw-copied" aria-live="polite"></span></p>`;
      const prep = `<section class="pcard" id="nw-prep"><p class="eyebrow">${esc(C.prep)} · ${esc(role.label)}</p><h2>${esc(type.label)}</h2>${pickHtml}${where}${approach}</section>`;
      page(`<p class="eyebrow">${esc(Network.fill(C.eyebrow, { role: role.label }))}</p><h1>${esc(C.heading)}</h1>
        <div class="nw-head"><div class="dlabel nw-role"><span>${esc(C.role)}</span><div id="nw-role"></div></div>${tabs}</div>
        <div class="nw" role="tabpanel" id="nw-panel" aria-labelledby="nw-tab-${esc(s.type)}"><aside class="nw-side" aria-label="${esc(C.sideAria)}">${prep}</aside><div class="nw-main">${who}<div class="fit-wait">${applyBox("network", { always: true, role_id: role.id })}</div></div></div>`);
      main.firstElementChild.classList.add("wide", "nw-page");
      // ---- the wiring ----
      wireWait(main, redraw);
      const rolePick = Pick.mount($("#nw-role"), { options: roleOptions, value: role.id, placeholder: C.rolePlaceholder, label: C.role, noMatch: C.roleNoMatch, help: roleHelp, onChange: v => { if (roleOk(v)) { s.role = v; s.key = null; s.focusNext = "role"; reload(); } } });
      picks.push(rolePick);
      const targetPick = targets.length ? Pick.mount($("#nw-target"), { options: targets.map(t => ({ value: t.key, label: t.label, hint: t.hint })), value: s.key, placeholder: s.type === "faculty" ? C.professorPlaceholder : C.companyPlaceholder, label: s.type === "faculty" ? C.professor : C.company, onChange: v => { if (v) { s.key = v; s.focusNext = "target"; setTimeout(redraw, 0); } } }) : null;
      if (targetPick) picks.push(targetPick);
      const choose = id => { if (id === s.type) { const b = main.querySelector(`[data-type="${CSS.escape(id)}"]`); if (b) b.focus(); return; } s.type = id; s.key = null; s.focusNext = "type"; redraw(); };
      main.querySelectorAll("[data-type]").forEach(b => b.onclick = () => choose(b.dataset.type));
      main.querySelector(".nw-tabs").onkeydown = e => {
        const ids = types.map(t => t.id), i = ids.indexOf(e.target.dataset.type); if (i < 0) return;
        const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 }[e.key]; if (j == null) return;
        e.preventDefault(); choose(ids[(j + ids.length) % ids.length]);
      };
      // focus after the draw (the Networking focus fix, 2026-11-06): the control the person used, drawn anew
      const next = s.focusNext; s.focusNext = null;
      if (next === "type") { const b = main.querySelector(`[data-type="${CSS.escape(s.type)}"]`); if (b) b.focus({ preventScroll: true }); }
      else if (next === "target") (targetPick || rolePick).focus();
      else if (next === "role") rolePick.focus();
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
      <div class="mt-4 row"><a class="btn" href="#/home">${esc(CM.backHome)}</a><a class="btn quiet" href="#/explore">${esc(Copy.games.exploreRoles)}</a></div>`, true);
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
  // "Add your résumé" on Find jobs and Networking (2026-11-06): the résumé step alone, and back to the same address
  // after the read. The href is set again at the click, since those screens rewrite their hash as the person types.
  const resumeHref = () => Routes.You.resumeHref(Q.length, location.hash);
  document.addEventListener("click", e => { const a = e.target && e.target.closest ? e.target.closest("a[data-resume-link]") : null; if (a) a.setAttribute("href", resumeHref()); }, true);
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
  // Back reaches the earlier ones. "Skip for now" on every step keeps what was answered and ends; on the résumé step
  // a chosen file is kept and ends it, and Done ends it with what is on file. Either way the door's mark on the
  // program goes (the person has seen it), you_done goes out as #/you sends it, and opts.onDone() runs. The résumé step
  // is the shell's form (ids #drop, #file, #file-status), so a page holds one of these, or one résumé form, at a time. Returns a promise (the index loads first).
  function youInline(el, opts) {
    const o = opts || {}, YI = YOU.inline;
    return Atlas.index().then(ix => {
      if (!el || !el.isConnected) return;
      const y0 = state.you || {};
      const a = { where: y0.where || null, stage: y0.stage || null, fields: new Set(y0.fields || []) };
      let i = Routes.You.firstStep(y0, Q.map(q => q.key)), seen = false;   // seen: the person picked a program here, or ended
      const save = () => { state.you = { ...(state.you || {}), where: a.where || null, stage: a.stage || null, fields: [...a.fields] }; if (seen) delete state.you.whereFrom; store.set("you", state.you); wiz = null; syncProfile(); };
      let ended = false;   // Skip, Done and a chosen file each end it, once
      const finish = () => {
        if (ended) return; ended = true;
        seen = true; save(); track("you_done");
        if (o.onDone) o.onDone();
      };
      const draw = () => {
        if (!el.isConnected) return;
        const q = Q[i], last = i === Q.length;
        const S = Routes.You.steps(i, Q.length);
        const steps = `<div class="steps">${Array.from({ length: S.bars }, (_, k) => `<i class="${k < S.done ? "done" : ""}"></i>`).join("")}</div>`;
        const nav = `<div class="row between yi-nav"><span>${i > 0 ? `<button type="button" class="btn quiet" data-yi="back">${esc(CM.back)}</button>` : ""}</span><span class="row"><button type="button" class="btn" data-yi="skip">${esc(YI.skip)}</button><button type="button" class="btn primary" data-yi="next" data-reads>${esc(last ? YI.done : YOU.next)}</button></span></div>`;
        if (!last) {
          const on = id => q.multi ? a.fields.has(id) : a[q.key] === id;
          el.innerHTML = `<p class="small muted">${esc(YI.lead)}</p>${steps}<p class="eyebrow">${esc(S.label)}</p><h3>${esc(q.title)}</h3>${q.hint ? `<p class="small muted">${esc(q.hint)}</p>` : ""}
            <div class="opts${q.multi ? " two" : ""}">${questionOpts(ix, q).map(([id, label, ex]) => `<button type="button" class="opt${on(id) ? " on" : ""}" data-opt="${esc(id)}" aria-pressed="${on(id)}">${esc(label)}${ex ? `<small>${esc(ex)}</small>` : ""}</button>`).join("")}</div>${nav}`;
          el.querySelectorAll("[data-opt]").forEach(b => b.onclick = () => {
            const id = b.dataset.opt;
            if (q.multi) { a.fields.has(id) ? a.fields.delete(id) : a.fields.add(id); save(); draw(); return; }
            a[q.key] = id; if (q.key === "where") seen = true; save(); i++; draw();
          });
        } else {
          el.innerHTML = `<p class="small muted">${esc(YI.lead)}</p>${steps}<p class="eyebrow">${esc(S.label)}</p><h3>${esc(YOU.addResume)}</h3><p class="small muted">${esc(YOU.resumeLead)}</p>${resumeForm()}${nav}`;
          wireResumeForm(finish);   // a chosen file is kept and ends it, as Done did
        }
        const btn = k => el.querySelector(`[data-yi="${k}"]`);
        if (btn("back")) btn("back").onclick = () => { i--; draw(); };
        btn("skip").onclick = () => finish();
        btn("next").onclick = () => { if (last) { finish(); return; } if (!q.multi && !a[q.key]) return; i++; draw(); };
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
    if (wiz && wiz.hash !== location.hash && editing) wiz = null;   // a new link into the wizard starts it again
    if (!wiz) wiz = { hash: location.hash, step: editing ? Math.max(0, Math.min(Q.length, Number(query.step) || 0)) : 0, back: editing, after: Routes.You.after(query.next, editing), next: Routes.You.returnTo(query.next), skipStage: query.from === "start" && !!(state.you || {}).stage, answers: { ...(state.you || {}), fields: new Set((state.you || {}).fields || []) } };
    if (wiz.first == null) wiz.first = wiz.step;
    const forward = () => { wiz.step++; if (wiz.step === 1 && wiz.skipStage) wiz.step++; }, backward = () => { wiz.step--; if (wiz.step === 1 && wiz.skipStage) wiz.step--; };
    const render = () => {
      const i = wiz.step, S = Routes.You.steps(i, Q.length);   // the bar and its label count the same steps (You.steps)
      const steps = `<div class="steps">${Array.from({ length: S.bars }, (_, k) => `<i class="${k < S.done ? "done" : ""}"></i>`).join("")}</div>`;
      const after = wiz.after;
      // Back from the step a return link opened goes back to that screen
      const leave = () => { if (wiz.next && i === wiz.first) { const n = wiz.next; wiz = null; location.hash = n; return true; } return false; };
      const nav = (nextLabel, nextAction) => `<div class="mt-4 row between"><button type="button" class="btn quiet" id="back">${esc(CM.back)}</button><span class="row">${i === Q.length ? `<a class="btn" href="${after}" id="skip">${esc(YOU.skip)}</a>` : ""}<button type="button" class="btn primary" id="next" data-reads>${esc(nextLabel)}</button></span></div>`;
      if (i < Q.length) {
        const q = Q[i];
        // the options with their examples (questionOpts); all eleven fields sit above the fold in two columns
        const opts = questionOpts(ix, q);
        const on = id => q.multi ? wiz.answers.fields.has(id) : wiz.answers[q.key] === id;
        page(`${steps}<p class="eyebrow">${esc(S.label)}</p><h1>${esc(q.title)}</h1>${q.hint ? `<p class="lead">${esc(q.hint)}</p>` : ""}
          <div class="opts${q.multi ? " two" : ""}">${opts.map(([id, label, ex]) => `<button type="button" class="opt${on(id) ? " on" : ""}" data-opt="${esc(id)}" aria-pressed="${on(id)}">${esc(label)}${ex ? `<small>${esc(ex)}</small>` : ""}</button>`).join("")}</div>${nav(YOU.next)}`, true);
        if (q.multi) main.firstElementChild.classList.add("roomy");   // two columns of cards need more than the narrow column
        main.querySelectorAll("[data-opt]").forEach(b => b.onclick = () => { const id = b.dataset.opt; if (q.multi) { wiz.answers.fields.has(id) ? wiz.answers.fields.delete(id) : wiz.answers.fields.add(id); render(); } else { wiz.answers[q.key] = id; forward(); render(); } });
        $("#next").onclick = () => { if (!q.multi && !wiz.answers[q.key]) return; forward(); render(); };
        $("#back").onclick = () => { if (leave()) return; if (i === 0) { const b = wiz.back; wiz = null; location.hash = b ? "#/you" : "#/home"; } else { backward(); render(); } };
        return;
      }
      page(`${steps}<p class="eyebrow">${esc(S.label)}</p><h1>${esc(YOU.addResume)}</h1>
        <p class="lead">${esc(YOU.resumeLead)}</p>
        ${resumeForm()}${nav(wiz.next ? YOU.readBack : YOU.showRoles)}`, true);
      // a chosen file is kept and moves on as Next does; Next moves on with the résumé on file, or none
      const onward = () => { saveYou(); location.hash = after; if (location.hash === after) you(); };
      wireResumeForm(onward);
      $("#back").onclick = () => { if (leave()) return; backward(); render(); };
      $("#skip").onclick = () => saveYou();
      $("#next").onclick = onward;
    };
    const saveYou = () => { state.you = { where: wiz.answers.where || null, stage: wiz.answers.stage || null, fields: [...wiz.answers.fields] }; store.set("you", state.you); wiz = null; track("you_done"); syncProfile(); };
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
    const resume = r ? `<div class="list">${row(esc(r.name), esc(fill(Routes.You.aiRead(r) ? YOU.resumeLine : YOU.resumeLineLocal, { words: fmt(r.words) })), [esc(YOU.replace), "#/you?step=3"])}${row(esc(YOU.closest), closest.length ? closest.join(" · ") : esc(YOU.noRole), null)}</div>` : `<p class="mt-2 small muted">${esc(YOU.noResume)} <a class="link" href="#/you?step=3">${esc(YOU.addOne)}</a> ${esc(YOU.addOneAfter)}</p>`;
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
    // the roles the person hearted (step 5), each with its heart so one can go from here
    const savedRows = hearts().filter(id => ix.roles[id]).map(id => heartRow(id, ix.roles[id].label, row(esc(ix.roles[id].label), esc((ix.groups.find(g => g.id === ix.roles[id].group) || {}).label || ""), [esc(CM.openLower), "#/role/" + id])));
    page(`<h1>${esc(YOU.heading)}</h1><p class="lead">${esc(YOU.lead)}</p>${roleSearch}
      <div class="two"><div><h2>${esc(YOU.answers)}</h2>${answers}</div><div><h2>${esc(YOU.resume)}</h2>${resume}</div></div>
      <h2>${esc(YOU.savedRoles)}</h2>${savedRows.length ? `<div class="list">${savedRows.join("")}</div>` : `<p class="small muted">${esc(YOU.noSaved)}</p>`}
      <h2>${esc(YOU.fitFields)}</h2>${fieldRows.length ? `<div class="list">${fieldRows.join("")}</div>` : `<p class="small muted">${esc(YOU.noFitFields)}</p>`}
      ${knowRows.length ? `<h2>${esc(YOU.games)}</h2><p class="small muted">${esc(YOU.gamesLead)}</p><div class="list you-know">${knowRows.join("")}</div>` : ""}
      ${stateOn() ? `<section class="you-saved"><p class="small muted">${esc(YOU.savedLine)}</p><p><button type="button" class="linkish link" id="you-forget">${esc(YOU.forget)}</button> <span class="small muted">${esc(YOU.forgetLine)}</span></p><p class="small" id="you-forget-out" aria-live="polite"></p></section>` : ""}
      <div class="mt-5 row"><a class="btn primary" href="#/explore">${esc(YOU.exploreFields)}</a><button type="button" class="btn quiet" id="start-over" aria-expanded="false" aria-controls="so-ask">${esc(YOU.startOver)}</button></div>
      <div class="confirm-row" id="so-ask" role="group" aria-labelledby="so-q" hidden><p id="so-q">${esc(YOU.startOverAsk)}</p><button type="button" class="btn primary" id="so-yes">${esc(YOU.startOverYes)}</button><button type="button" class="btn quiet" id="so-keep">${esc(YOU.startOverKeep)}</button></div>`);
    wireHearts(main);
    // the forget button (step 3): the person's rows in the three tables go; this browser keeps its own copy
    const fg = $("#you-forget"); if (fg) fg.onclick = async () => { const out = $("#you-forget-out"); fg.disabled = true; out.textContent = YOU.forgetting; const done = await State.forget(Auth.stored()); out.textContent = done ? YOU.forgotten : YOU.forgetFailed; fg.disabled = !done; if (done) keepHearts([]); };
    // Start over asks once (2026-11-06): Keep changes nothing and gives focus back to the button
    const so = $("#start-over"), ask = $("#so-ask");
    so.onclick = () => { ask.hidden = false; so.setAttribute("aria-expanded", "true"); $("#so-keep").focus(); };
    $("#so-keep").onclick = () => { ask.hidden = true; so.setAttribute("aria-expanded", "false"); so.focus(); };
    $("#so-yes").onclick = () => { state.you = null; state.resume = null; state.rough = null; state.match = null; state.fit = null; store.set("you", null); store.set("resume", null); if (window.Infer) Infer.forget(); Atlas.useInferred(null, []); wiz = null; you(); };
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
  // Choosing or dropping a file is the whole act (2026-11-12, the owner: "it takes an extra couple of clicks or it gets
  // lost"): a résumé of 40 words or more is kept at once (takeResume) and the screen's `after()` runs, the step its
  // "Read it" button used to take; under 40 words the status says so and nothing is kept. Nothing waits between the
  // pick and the keep, so no other screen can take a file this one read. While a file is read a redraw draws the zone
  // in its processing state (`reading`), and the line about a file it did not keep stays until the screen changes
  // (`note`): a redraw never shows an empty zone for a file the person just chose.
  let reading = null;   // { name, step } while a résumé file is read and kept
  let note = null;      // { at, text }: the last pick's line when nothing was kept
  const screenAt = () => location.hash.split("?")[0];
  const wordsOf = text => text.trim() ? text.trim().split(/\s+/).length : 0;
  const fileStatus = t => { const el = $("#file-status"); if (el) el.textContent = t; };
  function resumeForm() {
    const r = state.resume;
    // the first personal act (step 2): with accounts on and no session, the drop zone is the sign-in's door
    if (accountsOn() && !Auth.stored() && !r) { const S = Copy.signin; return `<div class="si-gate" id="drop-gate"><b>${esc(S.gateHeading)}</b><p class="small muted">${esc(S.gateLine)}</p><a class="btn primary" href="${esc(signinHref())}">${esc(S.gateButton)}</a></div>`; }
    return resumeZone(RF.drop, r ? `${esc(fill(RF.using, { name: r.name, words: fmt(r.words) }))} <button type="button" class="linkish link" id="forget">${esc(RF.forget)}</button>` : "");
  }
  // the résumé's drop zone as it stands: busy while a file is read, the last line about a file it did not keep
  function resumeZone(heading, status = "") {
    if (reading) return dropZone(heading, esc(fill(RF.reading, { name: reading.name })), reading.step);
    if (note && note.at === screenAt()) return dropZone(heading, esc(note.text));
    return dropZone(heading, status);
  }
  // The one drop zone (usability pass 2026-11-06, B-02): drag and drop, or "choose a file", a real button that opens the
  // file dialog on Enter and Space (the input stays hidden; a label is not a Tab stop). `status` is HTML, already escaped;
  // `busy`, a step of STEPS, draws it in the processing state.
  function dropZone(heading, status = "", busy = null) {
    return `<div class="drop${busy ? " busy" : ""}" id="drop"><p><b>${esc(heading)}</b> ${esc(RF.or)} <button type="button" class="linkish link" id="file-pick" aria-controls="file">${esc(RF.choose)}</button></p><input type="file" id="file" accept=".pdf,.docx,.txt,.md" hidden tabindex="-1"><p class="small muted" id="file-status">${status}</p>${busy ? `<div class="proc" role="status" aria-live="polite">${procHtml(busy)}</div>` : ""}</div>`;
  }
  // a file's text, read in the browser: a PDF with pdf.js, a .docx with mammoth, anything else as text. The résumé
  // form and the side-project flow's "Add more about you" both read files with it; nothing leaves the browser here.
  async function fileText(file) {
    if (/\.pdf$/i.test(file.name)) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; const t = [];
      for (let p = 1; p <= pdf.numPages; p++) { const pg = await pdf.getPage(p); const c = await pg.getTextContent(); t.push(c.items.map(i => i.str + (i.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+\n/g, "\n")); }
      return t.join("\n");
    }
    if (/\.docx$/i.test(file.name)) return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    return await file.text();
  }
  // the zone's hands: a drop, "choose a file" and the input; `onFile(file)` gets each file while the zone is not busy.
  // The input is emptied after each choice, so the same file chosen again is read again (a browser fires no change
  // for an unchanged value).
  function wireDrop(onFile) {
    const drop = $("#drop"); if (!drop) return false;   // the sign-in's door stands in its place
    const take = file => { if (file && !drop.classList.contains("busy")) onFile(file); };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); take(e.dataTransfer.files[0]); };
    const pick = $("#file-pick"); if (pick) pick.onclick = () => { if (!drop.classList.contains("busy")) $("#file").click(); };
    $("#file").onchange = e => { const f = e.target.files[0]; e.target.value = ""; take(f); };
    return true;
  }
  // the résumé form: a chosen file is read and kept, then `after()` runs when the person is still on the same screen
  function wireResumeForm(after) {
    if (!wireDrop(async file => {
      const at = screenAt(); note = null;
      reading = { name: file.name, step: "file" };
      fileStatus(fill(RF.reading, { name: file.name })); processing("file");
      const end = line => { reading = null; processing(null); if (line) { note = { at, text: line }; fileStatus(line); } };
      let r;
      try { const text = await fileText(file); r = { text, name: file.name, words: wordsOf(text) }; }
      catch (e) { end(fill(RF.cantRead, { message: e.message })); return; }
      if (r.words < 40) { end(fill(RF.fewWords, { name: r.name, words: r.words })); return; }
      const ok = await takeResume(r).catch(e => { console.error(e); return false; });
      end(null);
      if (!ok) return;
      fileStatus(fill(RF.read, { name: r.name, words: fmt(r.words) }));
      if (after && screenAt() === at) after();
    })) return;
    if (reading) processing(reading.step);   // drawn again mid-read: the buttons wait too
    const forget = $("#forget"); if (forget) forget.onclick = () => { state.resume = null; state.rough = null; state.match = null; state.fit = null; store.set("resume", null); if (window.Infer) Infer.forget(); Atlas.useInferred(null, []); note = null; fileStatus(RF.forgotten); };
  }
  // The processing state (owner, 2026-11-01: an upload that waits on the model read looked like it had not taken, so
  // people uploaded again). The drop zone turns into the list of steps with the one running marked, every button marked
  // `data-reads` (the one that acts on what was read: Next, Done, Build) is disabled, and the zone takes no second file
  // until the read is done; `step` null restores the zone and each button as it was. The steps: file (the reader),
  // match (the patterns' read), infer (the model read, up to 20 s).
  const STEPS = ["file", "match", "infer"];
  const procHtml = step => { const i = STEPS.indexOf(step); return `<ul>${STEPS.map((k, j) => `<li class="${j < i ? "done" : j === i ? "now" : ""}"><span class="pm" aria-hidden="true">${j < i ? "✓" : j === i ? "" : "·"}</span>${esc(RF.steps[k])}</li>`).join("")}</ul><p class="small muted">${esc(RF.wait)}</p>`; };
  function processing(step) {
    if (reading && step) reading.step = step;
    const drop = $("#drop"), btns = document.querySelectorAll("[data-reads]");
    if (!step) {
      if (drop) { drop.classList.remove("busy"); const box = drop.querySelector(".proc"); if (box) box.remove(); }
      btns.forEach(b => { if (b.dataset.was) { b.disabled = b.dataset.was === "off"; delete b.dataset.was; } });
      return;
    }
    if (drop) {
      drop.classList.add("busy");
      let box = drop.querySelector(".proc");
      if (!box) { box = document.createElement("div"); box.className = "proc"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); drop.appendChild(box); }
      box.innerHTML = procHtml(step);
    }
    btns.forEach(b => { if (!b.dataset.was) { b.dataset.was = b.disabled ? "off" : "on"; b.disabled = true; } });
  }
  let taking = null;   // the read in flight: a second call joins it instead of starting over
  // keep `r` ({ text, name, words }, 40 words or more) as the résumé; false when nothing was kept. With accounts on and
  // no session, the read waits for the sign-in (the zone is the sign-in's door then; the rail's own zone lands here).
  function takeResume(r) {
    if (!r || r.words < 40) return Promise.resolve(false);
    if (accountsOn() && !Auth.stored() && !state.resume) { toHash(signinHref()); return Promise.resolve(false); }
    return taking || (taking = takeResumeNow(r).finally(() => { taking = null; }));
  }
  async function takeResumeNow(r) {
    processing("match");
    state.resume = r; store.set("resume", r); state.match = null; state.rough = null; state.fit = null;
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
    // with the tech set on, the read may also name its own skills ("all"), and what its patterns found is found too
    const all = !!(window.CONFIG || {}).TECH_ENABLED && !!rg.shownT;
    const set = all ? "all" : "both";
    const list = await Infer.read(r.text, all ? [...new Set([...rg.shown, ...rg.shownT])] : [...rg.shown], set);
    if (state.resume !== r) return false;
    // Infer keeps an answer only when the route gave one, under the set it was asked for (an empty answer too)
    r.inferred = list; r.aiRead = list.length > 0 || !!Infer.cached(r.text, set);
    store.set("resume", r); Atlas.useInferred(r.text, list);
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

  // ---------- 2b. Find jobs (v19 B4): one search over every open US posting of every role set the site shows ----------
  // The rows are web/data/jobs_open.json (pipeline.jobs_open; column-oriented, loaded once per page and expanded by
  // Jobs.rowsOf); the logic is web/jobs.js (the owner's search_logic.md); the layout is the J4 mock. The hash is
  // the state (#/jobs?q=…&field=…&open=…), written with replaceState so Back is one step per screen, not per click.
  // With a résumé on file the rough read's skills (rough().shown) give each posting "N of the M skills this posting
  // asks for", never a percentage, and Fit is the default sort; without one the default is Newest. The only event sent is posting_link, through the
  // document-level [data-posting] handler above, the way the role screen sends it. With the tech set switched off
  // (CONFIG.TECH_ENABLED) its rows and roles leave here, before anything counts them, so neither the lead nor a facet
  // names a set the site hides.
  let jobsP = null;
  const jobsData = () => jobsP ||= Promise.all([Atlas.fetchJson("data/jobs_open.json"), Atlas.index()]).then(([file, ix]) => {
    const techBit = Object.assign({}, Jobs.FLAGS, file.flags || {}).tech;
    const D = techShown() ? file : { ...file, rows: (file.rows || []).filter(r => !(r[6] & techBit)) };
    const rows = Jobs.rowsOf(D), byId = new Map(rows.map(r => [r.id, r]));
    if (!techShown()) D.roles = D.roles.filter(id => !id.startsWith("tech."));   // after rowsOf: the rows index the whole list
    const nCompanies = new Set(rows.map(r => r.company)).size;
    const roleLabel = id => Atlas.us((D.role_labels || {})[id] || (ix.roles[id] || {}).label || id);
    // one field per role for the filter, its counts, the rail and the card (Jobs.fieldLookup): the MBA set's
    // product_manager and product_strategy are in the Product field like the product set's roles
    const fieldOf = Jobs.fieldLookup(ix);
    // a skill's name from the MBA index, else the tech index's (a skill only tech postings ask for)
    const skillName = i => { const id = D.skill_ids[i], sk = ix.skillById[id] || ix.techSkillById[id]; return sk ? sk.name : id; };
    const fields = ix.groups.map(g => [g.id, Atlas.us(g.label)]);
    // the card's field (B-32, 2026-11-06), from the same lookup the filter reads
    const fieldName = r => { const f = fieldOf(r.role); return f ? labelIn(fields, f) : ""; };
    // the file's own year, which "Starts {year} or later" counts from (Jobs.ENTRIES)
    const year = Number(String(D.generated || "").slice(0, 4)) || new Date().getFullYear();
    // roles that share a label filter as one (Jobs.roleKey): product.pm and product_manager, product.pmm and pmm
    const ctx = { roleName: r => roleLabel(r.role), skillNames: r => r.skills.map(skillName), fieldOf, fieldName, year, roleKey: Jobs.roleKey(D), roleIds: D.roles };
    return { D, ix, rows, byId, ctx, roleLabel, fieldOf, skillName, fields, nCompanies };
  }).catch(e => { jobsP = null; throw e; });
  const JB = Copy.jobs;
  const groupLabel = g => g === "startup" ? JB.groupStartup : g === "mba_employer" ? JB.groupMBA : /^fortune(\d+)$/.test(String(g || "")) ? fill(JB.groupFortune, { n: RegExp.$1 }) : String(g || "");
  const KIND_ORDER = ["method", "technical", "knowledge", "tool", "practice", "behaviour", "credential"];
  // the card's who line; a graduate title that names its start year says it ("A job for new graduates, starting 2027")
  const jobWho = r => {
    const kind = r.intern ? "intern" : r.entry === "mba" ? "mba" : (r.entry === "pre_mba" || r.entry === "grad" || r.grad) ? "grads" : null;
    return kind && kind !== "intern" && r.start ? fill(JB.who[kind + "_start"], { year: r.start }) : kind ? JB.who[kind] : null;
  };
  const labelIn = (pairs, id) => (pairs.find(([v]) => v === id) || [, id])[1];
  // the role chosen elsewhere, for the role filter when a person arrives with none set: the role screen's (state.R),
  // else the first the class picker keeps in this browser (classes.roles), the same id gapsFor is handed
  const chosenRole = () => state.roleId || (store.get("classes.roles") || [])[0] || null;
  async function jobsScreen() {
    crumbs([[CM.home, "#/home"], [JB.heading, null]]); showAside(null);
    // while the file loads (14 MB before compression): the page's own layout in grey, so nothing jumps when the
    // postings land; the words are there for a screen reader
    const K = UI.skel, bone = `<div class="jcard skel-card" aria-hidden="true">${K("w30")}${K("w70", "tall")}${K("w50")}${K("w90")}</div>`;
    page(`<h1>${esc(JB.heading)}</h1><p class="lead" role="status">${esc(JB.loading)}</p>
      <div class="jsearch" aria-hidden="true">${K("box")}${K("box")}${K("box", "btnw")}</div>
      <div class="jobs-grid" aria-hidden="true"><div class="jmain"><div class="jlist">${bone.repeat(4)}</div></div><div class="jrail">${K("w50")}${K("w90")}${K("w70")}${K("w90")}${K("w50")}</div></div>`);
    main.querySelector(".page").classList.add("jobs-page");
    let J;
    try { J = await jobsData(); } catch (e) { console.error(e); page(`<h1>${esc(JB.heading)}</h1><p class="lead">${esc(JB.loadFailed)}</p>`); return; }
    const rg = state.resume ? await rough().catch(e => { console.error(e); return null; }) : null;
    if (Routes.parseRoute(location.hash).name !== "jobs") return;   // the person moved on while the file loaded
    const { D, ix, rows, byId, ctx, roleLabel, fieldOf, skillName, fields, nCompanies } = J;
    const have = rg ? rg.shown : null;   // the skill ids the résumé shows, or null without one
    const fieldLabel = id => labelIn(fields, id);
    const kindLabel = k => ((ix.M.meta.kinds || {})[k] || {}).label || k;
    const roleOk = id => !!id && D.roles.includes(id);
    // the state: the hash, with the chosen role when the person arrives with nothing set; a link that names no sort
    // opens on Fit with a résumé and on Newest without one
    const sort0 = Jobs.defaultSort(have), s = Jobs.parseState(location.hash, sort0);
    if (!location.hash.includes("?")) { let r = chosenRole(); if (r && !roleOk(r)) r = Atlas.productKey(r); if (roleOk(r)) s.role = r; }
    if (s.role && !roleOk(s.role)) s.role = "";
    if (s.field && !fields.some(([id]) => id === s.field)) s.field = "";
    if (s.role && !s.field) s.field = fieldOf(s.role);   // the id's own field: a link to the MBA pmm opens Marketing
    if (s.role) s.role = ctx.roleKey(s.role);   // then the role's key: role=product_manager is product.pm's filter
    if (s.role && s.field && !Jobs.roleInField(s.role, s.field, ctx)) s.role = "";
    if (s.sort === "fit" && !have) s.sort = sort0;
    const writeHash = () => {
      const q = Jobs.stateQuery(s, sort0);   // the default sort stays out of the link; any other is a choice and stays in it
      const next = "#/jobs" + (q ? "?" + q : "");
      if (location.hash !== next) history.replaceState(null, "", location.pathname + location.search + next);
    };
    const note = have
      ? `${esc(JB.noteResume)} <a href="${esc(resumeHref())}" data-resume-link>${esc(JB.noteResumeLink)}</a>.`
      : `<a href="${esc(resumeHref())}" data-resume-link>${esc(JB.noteNoResume)}</a> ${esc(JB.noteNoResumeAfter)}`;
    const sortOptions = () => Jobs.sortChoices(have).map(v => `<option value="${v}"${s.sort === v ? " selected" : ""}>${esc(JB.sorts[v])}</option>`).join("");
    page(`<h1>${esc(JB.heading)}</h1>
      <p class="lead">${esc(fill(JB.lead, { n: fmt(rows.length), m: fmt(nCompanies) }))}</p>
      <form class="jsearch" id="jsearch" role="search"><input type="search" name="q" value="${esc(s.q)}" placeholder="${esc(JB.searchPlaceholder)}" aria-label="${esc(JB.searchAria)}"><input type="search" name="loc" value="${esc(s.loc)}" placeholder="${esc(JB.locPlaceholder)}" aria-label="${esc(JB.locAria)}"><button type="submit" class="btn primary">${esc(JB.search)}</button></form>
      <div class="chips jquick" id="jquick" role="group" aria-label="${esc(JB.quickAria)}"></div>
      <div class="jobs-grid">
        <section class="jmain" aria-label="${esc(JB.postingsAria)}"><button type="button" class="linkish link jfilters-link" data-to-filters="1">${esc(JB.filtersLink)}</button><div class="jhead"><p class="jcount" id="jcount"></p><label class="jsort">${esc(JB.sort)} <select id="jsort" aria-label="${esc(JB.sort)}">${sortOptions()}</select></label></div><div class="jnotes" id="jnotes"></div><div class="chips jactive" id="jactive"></div><div class="jlist" id="jlist"></div><div class="pager" id="jpager"></div></section>
        <div class="jrail" id="jfilters" role="region" aria-label="${esc(JB.filtersAria)}" tabindex="-1"><div class="facets" id="jrail"></div><p class="small muted jnote">${note}</p></div>
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
        <p class="facts">${[...Jobs.cardFacts(r, ctx, shortLoc(r.location)), Jobs.dateLine(r)].filter(Boolean).map(esc).join(" · ")}</p>
        ${w ? `<p class="small jwho">${esc(w)}.</p>` : ""}
        ${fit ? `<p class="small jfit">${esc(Jobs.fitLine(fit))}</p>` : ""}
        ${chips(r)}
      </article>`;
    };
    const panel = r => {
      const fit = have ? fitOf(r) : null, w = jobWho(r), n = dupes[r.id] || 0;
      const facts = [roleLabel(r.role), Jobs.levelLabel(r), r.location, r.remote ? JB.remote : null, r.yoe ? fill(JB.yearsFact, { n: r.yoe }) : null, r.clearance ? JB.clearanceFact : null, r.sponsorship === "yes" ? JB.sponsorsVisa : r.sponsorship === "no" ? JB.noSponsorVisa : null, Jobs.dateLine(r)].filter(Boolean);
      const byKind = {}; for (const i of r.skills) { const sk = ix.skillById[D.skill_ids[i]] || ix.techSkillById[D.skill_ids[i]]; (byKind[sk && KIND_ORDER.includes(sk.kind) ? sk.kind : "other"] ||= []).push(i); }
      const kinds = [...KIND_ORDER, "other"].filter(k => byKind[k]).map(k => `${k === "other" ? "" : `<p class="eyebrow kind">${esc(kindLabel(k))}</p>`}<div class="tags">${byKind[k].map(tagOf).join("")}</div>`).join("");
      return `${UI.close(CM.close)}<div class="card jdetail">
        <p class="eyebrow">${esc(r.company)} · ${esc(groupLabel(r.group))}${r.sector ? " · " + esc(r.sector) : ""}</p><h2 id="jdetail-h" tabindex="-1">${esc(r.title)}</h2>
        <p class="facts">${facts.map(esc).join(" · ")}</p>
        ${w ? `<p class="small jwho">${esc(w)}.</p>` : ""}
        ${fit ? `<p class="small">${esc(Jobs.fitLine(fit))}</p>` : `<p class="small muted"><a href="${esc(resumeHref())}" data-resume-link>${esc(JB.addResume)}</a> ${esc(JB.addResumeAfter)}</p>`}
        <p class="jacts"><a class="btn primary" href="${esc(r.url)}" target="_blank" rel="noopener" data-posting="${esc(r.role)}">${esc(fill(JB.openAt, { company: r.company }))}</a></p>
        <h3>${esc(r.skills.length === 1 ? JB.skillAsks : fill(JB.skillsAsk, { n: fmt(r.skills.length) }))}</h3>${kinds}
        ${n ? `<p class="small muted">${esc(n === 1 ? JB.dupeOne : fill(JB.dupes, { n: fmt(n) }))} ${esc(fill(JB.dupeAfter, { company: r.company, where: r.location ? fill(JB.dupeWhere, { location: r.location }) : "" }))}</p>` : ""}
      </div>`;
    };
    const mark = () => pageEl.querySelectorAll(".jcard").forEach(c => c.classList.toggle("on", c.dataset.id === s.open));
    let panelFor = null;   // the posting the panel shows, so a filter change does not redraw it under the reader
    // The panel (usability pass 2026-11-06, B-12): opened from a card, it takes focus on its heading; × or Esc closes it
    // and focus goes back to the card's title
    const closePanel = () => {
      const id = s.open; s.open = ""; panelFor = null; mark(); showAside(null); writeHash();
      const back = id && pageEl.querySelector(`.jcard [data-open="${CSS.escape(id)}"]`); if (back) back.focus();
    };
    const drawPanel = () => {
      const r = s.open ? byId.get(s.open) : null;
      if (!r) { s.open = ""; panelFor = null; showAside(null); return; }
      if (panelFor === r.id && !aside.hidden) return;
      panelFor = r.id; showAside(panel(r)); asideEsc = closePanel;
      asideDialog("jdetail-h");   // role="dialog", named by its heading; modal on a phone, where it covers the screen
      aside.querySelector(".close").onclick = closePanel;
    };
    const openPosting = id => { s.open = id; mark(); drawPanel(); writeHash(); const h = $("#jdetail-h"); if (h) h.focus(); };
    // ---- the rail: each facet with the count it would leave on; one that would leave none is plain ----
    // which facets are open: Field always, so a person starts by picking a field (owner's feedback 2026-11-01); every
    // other facet only when the person opens it (owner's feedback 2026-11-01, second pass: neither a picked field nor a
    // role page's preset role opens one; the chips over the list show what is on). A person's own open and close are
    // kept until "Clear filters", which sets these defaults again.
    const openedFor = () => ({ field: true, role: false, level: false, entry: false, years: false, sector: false, group: false, sponsor: false, company: false, work: false });
    const opened = openedFor();
    railEl.addEventListener("toggle", e => { const d = e.target; if (d.dataset && d.dataset.group) opened[d.dataset.group] = d.open; }, true);
    const facetRow = (key, val, label, n, on) => {
      const dead = !on && !n;
      return `<button type="button" class="frow${on ? " on" : ""}${dead ? " dead" : ""}"${dead ? ` title="${esc(JB.dead)}" aria-disabled="true"` : ` data-key="${key}" data-val="${esc(String(val))}"`} aria-pressed="${on}">${esc(label)}<span class="n">${fmt(n)}</span></button>`;
    };
    const group = (key, label, pairs, counts, extra, lead) => `<details data-group="${key}"${opened[key] ? " open" : ""}><summary>${esc(label)}</summary>${lead || ""}${pairs.map(([v, l]) => facetRow(key, v, l, counts[v] || 0, key === "remote" ? !!s[key] : s[key] === v)).join("")}${extra || ""}</details>`;
    const rail = (searched, f) => {
      // one row per key: two ids with one label are one role, its count both ids' postings (in the field, when one is on)
      const roleIds = [...new Set((s.field ? D.roles.filter(id => fieldOf(id) === s.field) : D.roles).map(ctx.roleKey))];
      const roles = roleIds.map(id => [id, roleLabel(id)]).sort((a, b) => a[1].localeCompare(b[1]));
      const levels = levelsOf();
      const count = (facet, pairs) => Jobs.facetCounts(searched, f, facet, pairs.map(([v]) => v), ctx);
      // the companies in one pass over the rows the other filters keep: the twenty with the most postings, then all
      const cm = {}; for (const r of Jobs.filterJobs(searched, Object.assign({}, f, { company: "" }), ctx)) cm[r.company] = (cm[r.company] || 0) + 1;
      const all = Object.entries(cm).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const top = all.slice(0, 20); if (s.company && cm[s.company] && !top.some(([n]) => n === s.company)) top.push([s.company, cm[s.company]]);
      const shown = moreCompanies ? all : top;
      const more = all.length > shown.length ? `<button type="button" class="frow more" data-more-companies="1">${esc(JB.more)}<span class="n">${fmt(all.length)}</span></button>` : "";
      const work = `<details data-group="work"${opened.work ? " open" : ""}><summary>${esc(JB.facets.work)}</summary>${facetRow("remote", true, JB.remoteFacet, count("remote", [[true]])[true], s.remote)}${facetRow("noclear", true, JB.noclearFacet, count("noclear", [[true]])[true], s.noclear)}</details>`;
      // the employer's industry (companies[].sector), most postings first, over the rows the other filters keep
      const sm = {}; for (const r of Jobs.filterJobs(searched, Object.assign({}, f, { sector: "" }), ctx)) if (r.sector) sm[r.sector] = (sm[r.sector] || 0) + 1;
      const sectors = Object.keys(sm).sort((a, b) => sm[b] - sm[a] || a.localeCompare(b)); if (s.sector && !sm[s.sector]) sectors.push(s.sector);
      // visa sponsorship (2026-11-08): its own group, two values of one key like Level
      const sponsors = Jobs.SPONSOR.map(v => [v, JB.sponsor[v]]), entries = Jobs.ENTRIES(ctx.year);
      return group("field", JB.facets.field, fields, count("field", fields)) + group("role", JB.facets.role, roles, count("role", roles)) + group("level", JB.facets.level, levels, count("level", levels))
        + group("entry", JB.facets.entry, entries, count("entry", entries)) + group("years", JB.facets.years, Jobs.YEARS, count("years", Jobs.YEARS), "", `<p class="small muted">${esc(JB.yearsNote)}</p>`)
        + group("sector", JB.facets.sector, sectors.map(v => [v, v]), sm) + group("group", JB.facets.group, Jobs.EMPLOYERS, count("group", Jobs.EMPLOYERS))
        + group("sponsor", JB.facets.sponsor, sponsors, count("sponsor", sponsors))
        + group("company", JB.facets.company, shown.map(([n]) => [n, n]), cm, more) + work;
    };
    // ---- each filter that is on, as a chip an × removes: over the list (the facets but the search, which its box
    // shows), so a role page's preset role is plain while its facet is closed; and the empty state (all of them) ----
    const activeChips = () => {
      const out = [];
      if (s.q.trim()) out.push(["q", fill(JB.quoted, { q: s.q.trim() })]); if (s.loc.trim()) out.push(["loc", fill(JB.inLoc, { loc: s.loc.trim() })]);
      if (s.field) out.push(["field", fieldLabel(s.field)]); if (s.role) out.push(["role", roleLabel(s.role)]);
      if (s.level) out.push(["level", labelIn(levelsOf(), s.level)]); if (s.entry) out.push(["entry", labelIn(Jobs.ENTRIES(ctx.year), s.entry)]);
      if (s.years) out.push(["years", labelIn(Jobs.YEARS, s.years)]); if (s.sector) out.push(["sector", s.sector]);
      if (s.group) out.push(["group", labelIn(Jobs.EMPLOYERS, s.group)]); if (s.company) out.push(["company", s.company]);
      if (s.remote) out.push(["remote", JB.remoteFacet]); if (s.sponsor) out.push(["sponsor", JB.sponsorChip[s.sponsor] || s.sponsor]); if (s.noclear) out.push(["noclear", JB.noclearFacet]);
      return out;
    };
    // the Level facet's words follow the picked field: the tech set's while a tech field is on, else the business ones
    const levelsOf = () => Jobs.levelLabels(s.field && (ix.groups.find(g => g.id === s.field) || {}).set === "tech" ? "tech" : "mba");
    const chipHtml = ([k, l]) => `<button type="button" class="chip on" data-remove="${k}" aria-label="${esc(fill(JB.remove, { label: l }))}">${esc(l)} <span class="n">×</span></button>`;
    // ---- the quick filters under the search box (2026-11-08): the same state as their rail rows, with the same
    // data-key and data-val, so one click handler and toggleFacet serve both; each shows the count it would leave on ----
    const QUICK = [["sponsor", "yes", JB.quick.sponsor], ["entry", "grads", JB.quick.grads], ["remote", true, JB.quick.remote]];
    const quick = (searched, f) => QUICK.map(([key, val, label]) => {
      const on = key === "remote" ? !!s.remote : s[key] === val, n = Jobs.facetCounts(searched, f, key, [val], ctx)[val] || 0, dead = !on && !n;
      return `<button type="button" class="chip${on ? " on" : ""}${dead ? " dead" : ""}"${dead ? ` title="${esc(JB.dead)}" aria-disabled="true"` : ` data-key="${key}" data-val="${esc(String(val))}"`} aria-pressed="${on}">${esc(label)}<span class="n">${fmt(n)}</span></button>`;
    }).join("");
    // ---- the lines over the list (2026-11-08): that the list matches all but one of the search's words, and the
    // filters the search's words name, each a button that turns its filter on and takes those words out of the search.
    // A hint whose filter is on already is not shown ----
    let hints = [];
    const hintOn = h => h.key === "remote" ? !!s.remote : s[h.key] === h.val;
    const hintFilter = h => h.key === "remote" ? JB.quick.remote : h.key === "sponsor" ? JB.quick.sponsor : labelIn(Jobs.ENTRIES(ctx.year), h.val);
    const hintHtml = (h, i) => {
      const [a, b] = fill(JB.hint, { what: fill(JB.hintWhat[h.key === "entry" ? h.val : h.key], { year: ctx.year + 1 }), filter: "\u0000" }).split("\u0000");
      return `${esc(a)}<button type="button" class="linkish link" data-hint="${i}">${esc(hintFilter(h))}</button>${esc(b || "")}`;
    };
    const notes = relaxed => (relaxed ? `<p class="small muted">${esc(JB.relaxed)}</p>` : "") + (hints.length ? `<p class="small jhint">${hints.map(hintHtml).join(" ")}</p>` : "");
    const useHint = h => { if (h.key === "remote") s.remote = true; else s[h.key] = h.val; s.q = Jobs.dropWords(s.q, h.at); syncInputs(); change(); };
    const emptyState = () => `<div class="jempty"><p><b>${esc(JB.empty)}</b></p><p class="small muted">${esc(JB.removeOne)}</p><div class="chips">${activeChips().map(chipHtml).join("")}</div></div>`;
    // ---- the draw: search, filter, dedupe, sort, page ----
    // Focus after a draw (B-12): the rail, the chips and the pager are drawn anew, so the control the person used is
    // found again by its key; one that is gone hands focus to its facet's heading, the first chip or the search box
    const focusKeyOf = el => {
      if (!el || !pageEl.contains(el)) return null;
      const d = el.dataset || {};
      // the same key and value sit in the strip and on the rail: the one found again is in the container the person used
      if (d.key) {
        const inQuick = !!el.closest("#jquick"), at = `[data-key="${CSS.escape(d.key)}"][data-val="${CSS.escape(d.val)}"]`;
        return inQuick ? { sel: `#jquick ${at}`, near: "#jquick .chip" } : { sel: `#jrail ${at}`, near: `details[data-group="${CSS.escape(d.key === "remote" || d.key === "noclear" ? "work" : d.key)}"] > summary` };
      }
      if (d.hint) return { sel: "#jnotes [data-hint]", near: "#jsearch input[name=q]" };
      if (d.remove) return { sel: `[data-remove="${CSS.escape(d.remove)}"]`, near: "#jactive [data-remove], #jsearch input[name=q]" };
      if (d.page) return { sel: `[data-page="${CSS.escape(d.page)}"]:not([disabled])`, near: "#jpager [data-page]:not([disabled])" };
      if (d.clear) return { sel: "#jsearch input[name=q]" };
      if (d.moreCompanies) return { sel: 'details[data-group="company"] > button.frow:nth-of-type(21)', near: 'details[data-group="company"] > summary' };
      if (el.tagName === "SUMMARY" && el.parentElement.dataset.group) return { sel: `details[data-group="${CSS.escape(el.parentElement.dataset.group)}"] > summary` };
      return null;
    };
    const refocus = k => { if (!k) return; const el = pageEl.querySelector(k.sel) || (k.near && pageEl.querySelector(k.near)); if (el) el.focus({ preventScroll: true }); };
    const draw = () => {
      const want = focusKeyOf(document.activeElement);
      const f = Jobs.filterOf(s);
      // the search, and when no posting has every word, the postings that miss one (Jobs.searchJobsRelaxed)
      const found = Jobs.searchJobsRelaxed(rows, s.q, ctx), searched = lastSearched = found.rows;
      const d = Jobs.dedupe(Jobs.filterJobs(searched, f, ctx)); dupes = d.dupes;
      fits = have ? new Map(d.rows.map(r => [r.id, fitOf(r)])) : null;
      const list = Jobs.sortJobs(d.rows, s.sort, fits), pg = Jobs.pageOf(list, s.page); s.page = pg.page;
      const active = !!(s.q.trim() || s.loc.trim() || Jobs.isFiltered(f));
      const nFolded = Object.values(dupes).reduce((a, k) => a + k, 0);   // the lead counts these too (2026-11-06)
      $("#jcount").innerHTML = esc(pg.total > Jobs.PAGE ? fill(JB.showing, { from: fmt(pg.from), to: fmt(pg.to), total: fmt(pg.total) }) : pg.total === 1 ? JB.posting : fill(JB.postings, { n: fmt(pg.total) })) + (nFolded ? " · " + esc(nFolded === 1 ? JB.foldedOne : fill(JB.folded, { n: fmt(nFolded) })) : "") + (active ? ` · <button type="button" class="linkish link" data-clear="1">${esc(JB.clearFilters)}</button>` : "");
      const on = pg.rows.length ? activeChips().filter(([k]) => k !== "q" && k !== "loc") : [];
      $("#jactive").innerHTML = on.map(chipHtml).join(""); $("#jactive").hidden = !on.length;
      hints = Jobs.queryHints(s.q, ctx.year).filter(h => !hintOn(h));
      const nt = $("#jnotes"); nt.innerHTML = notes(found.relaxed && pg.rows.length > 0); nt.hidden = !nt.innerHTML;
      $("#jlist").innerHTML = pg.rows.length ? pg.rows.map(card).join("") : emptyState();
      $("#jpager").innerHTML = pg.pages > 1 ? `<button type="button" class="btn" data-page="-1"${pg.page === 1 ? " disabled" : ""}>${esc(fill(JB.previous, { n: Jobs.PAGE }))}</button><span>${esc(fill(JB.pageOf, { p: fmt(pg.page), n: fmt(pg.pages) }))}</span><button type="button" class="btn" data-page="1"${pg.page === pg.pages ? " disabled" : ""}>${esc(fill(JB.next, { n: Jobs.PAGE }))}</button>` : "";
      railEl.innerHTML = rail(searched, f); $("#jquick").innerHTML = quick(searched, f);
      drawPanel(); writeHash(); refocus(want);
    };
    const syncInputs = () => { form.q.value = s.q; form.loc.value = s.loc; $("#jsort").value = s.sort; };
    const change = () => { s.page = 1; draw(); };
    const toggleFacet = (key, val) => {
      if (key === "remote" || key === "noclear") s[key] = !s[key];
      else if (key === "field") { s.field = s.field === val ? "" : val; if (s.role && s.field && !Jobs.roleInField(s.role, s.field, ctx)) s.role = ""; }
      else if (key === "role") { s.role = s.role === val ? "" : val; if (s.role && !(s.field && Jobs.roleInField(s.role, s.field, ctx))) s.field = fieldOf(s.role); }
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
      // on a phone the filters sit after the postings (markup order): this link, shown only there, scrolls to them and moves focus there (usability pass 2026-11-06)
      if (t.closest("[data-to-filters]")) { const r = $("#jfilters"); r.scrollIntoView({ block: "start" }); r.focus({ preventScroll: true }); return; }
      if (t.closest("[data-clear]")) { const b = Jobs.blankState(); for (const k of Jobs.KEYS) if (k !== "sort" && k !== "open") s[k] = b[k]; Object.assign(opened, openedFor()); moreCompanies = false; syncInputs(); draw(); return; }
      const rm = t.closest("[data-remove]"); if (rm) { s[rm.dataset.remove] = Jobs.blankState()[rm.dataset.remove]; syncInputs(); change(); return; }
      if (t.closest("[data-more-companies]")) { const want = focusKeyOf(document.activeElement); moreCompanies = true; opened.company = true; railEl.innerHTML = rail(lastSearched, Jobs.filterOf(s)); refocus(want); return; }
      const hb = t.closest("[data-hint]"); if (hb) { const h = hints[Number(hb.dataset.hint)]; if (h) useHint(h); return; }
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
    const hq = new URLSearchParams(location.hash.split("?")[1] || ""), focus = hq.get("field");
    // a phone opens on the field cards (2026-11-08): the map has room for few field names there and drops the biggest
    // ones. An explicit ask still opens the map there: the launcher's ?view=map, a link to one field (?field=), or the
    // view toggle (remembered for the session, SkillMap.mode)
    if (focus || hq.get("view") === "map") SkillMap.setMode("map");   // the launcher's "See all fields on a skill map"
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
      const view = `<div class="filters explore-row">${asMap ? `<input class="sm-find" id="sm-find" type="search" placeholder="${esc(EX.findSkill)}" list="sm-names" aria-label="${esc(EX.findSkill)}"><datalist id="sm-names"></datalist>` : ""}<div class="seg views" role="group" aria-label="${esc(EX.viewAria)}"><button type="button" class="${asMap ? "" : "on"}" aria-pressed="${!asMap}" id="v-grid" aria-label="${esc(EX.gridView)}" title="${esc(EX.gridView)}">▦</button><button type="button" class="${asMap ? "on" : ""}" aria-pressed="${asMap}" id="v-map" aria-label="${esc(EX.mapView)}" title="${esc(EX.mapView)}">⊞</button></div></div>`;
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
          <p class="lead">${esc(fill(EX.counts, { fields: all.length, roles: nRoles || roleCount(ix) }))} ${esc(EX.mapLead)} ${dates}</p>${chips}${view}
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
      const saved = hearts().filter(id => ix.roles[id]);   // the hearts (step 5): where to find them again
      const savedStrip = saved.length ? `<p class="small saved-strip"><span class="hi" aria-hidden="true">♥</span> ${esc(EX.saved)} ${saved.map(id => `<a href="#/role/${esc(id)}">${esc(ix.roles[id].label)}</a>`).join(" · ")}</p>` : "";
      page(`<h1>${esc(EX.heading)}</h1>
        <p class="lead">${esc(fill(EX.counts, { fields: all.length, roles: nRoles || roleCount(ix) }))} ${esc(EX.pickField)}${fit && fit.size ? " " + esc(EX.fitFirst) : ""} ${dates}</p>${chips}${savedStrip}${view}
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
    const mark = r => !rg ? "" : rg.held.includes(r.id) ? ` · <span class="fg-primary">${esc(FD.held)}</span>` : rg.scores[r.id] >= 0.6 ? ` · <span class="fg-primary">${esc(FD.close)}</span>` : "";
    const anyMark = rg && roles.some(r => mark(r));
    // half and half (owner's decision 2026-10-24): the roles on the left, the field's skills on lanes on the right;
    // hovering a role lights its skills; a dot opens the skill card
    const closed = g.set !== "product" ? FD.recent : FD.open;
    // the chart and the skill map are the product and MBA sets' until their evals cover the tech set: a tech field lists its roles
    const charted = g.set !== "tech";
    page(`<div class="field-split"><div>
      <h1>${esc(g.label)}</h1>
      <p class="lead">${esc(roles.length === 1 ? FD.role : fill(FD.roles, { n: fmt(roles.length) }))} · <span data-measure="${when}">${esc(fill(FD.openPostings, { n: fmt(roles.reduce((a, r) => a + r.nOpen, 0)) }))}</span>. ${esc(FD.biggestFirst)}${anyMark ? " " + esc(FD.green) : ""}${charted ? ` <a href="#/explore?field=${esc(g.id)}" data-map>${esc(fill(FD.map, { field: g.label }))}</a>` : ""}</p>
      <div class="list">${roles.map(r => heartRow(r.id, r.label, `<a class="r" href="#/role/${esc(r.id)}" data-role="${esc(r.id)}"><span class="t">${esc(r.label)}</span><span class="n">${esc(fill(CM.nOpen, { n: fmt(r.nOpen) }))}</span><span class="m">${r.blurb ? esc(r.blurb) + " " : ""}${esc(productLine(g, r, line))}${mark(r)}</span></a>`)).join("")}</div>
      ${charted ? `<p class="mt-3 small muted">${esc(FD.hover)}</p>` : ""}
      </div><div${charted ? "" : " hidden"}>
      <div class="chart-stage" id="chart"></div>
      <p class="small muted chart-x">${esc(fill(FD.axis, { field: g.label }))} <span class="mark" data-measure="${esc(fill(FD.axisMeasure, { postings: closed, field: g.label }))}">ⓘ</span>${rg ? ` · <span class="sw have"></span> ${esc(FD.have)} · <span class="sw todo"></span> ${esc(FD.todo)}` : ""}</p>
      </div></div>`);
    main.firstElementChild.classList.add("wide");
    wireHearts(main);
    if (!charted) return;
    SkillMap.chart($("#chart"), { field: g.id, label: g.label, roles, shown: rg ? rg.shown : null, aside, showAside });
    // a pointer that hovers lights a role's skills while over its row; a tap (SkillMap.tapped) lights them on the first
    // tap and opens the role on the second, and a tap outside the rows and the chart puts the light out (2026-11-08)
    let tapLit = null;
    main.querySelectorAll("[data-role]").forEach(a => {
      a.onpointerenter = e => { if (e.pointerType !== "touch") SkillMap.chartLight(a.dataset.role); };
      a.onpointerleave = e => { if (e.pointerType !== "touch" && !tapLit) SkillMap.chartLight(null); };
      a.addEventListener("click", e => {
        if (!SkillMap.tapped() || tapLit === a.dataset.role) return;
        e.preventDefault(); tapLit = a.dataset.role; SkillMap.chartLight(tapLit);
      });
    });
    main.firstElementChild.addEventListener("click", e => {
      if (tapLit && SkillMap.tapped() && !e.target.closest("[data-role]") && !e.target.closest("#chart")) { tapLit = null; SkillMap.chartLight(null); }
    });
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
  let gamesList = null;
  // a student looks at the entry grade first; everyone else at every level
  const defaultLevel = () => (state.you && WHERE[state.you.where]) ? "entry" : "all";
  async function roleScreen(id) {
    const g = await loadRole(id); const R = state.R;
    if (!gamesList) gamesList = await games();   // the game's title and minutes for the way in (cached, small)
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
    const group = (label, inner) => `<div class="fgroup"><span class="lbl">${label}</span><div class="m-0 mt-1 chips">${inner}</div></div>`;
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
      <div class="drawer-h"><h2>${esc(RL.filters)}</h2>${UI.close(CM.close, { id: "drawer-close" })}</div>
      ${group(esc(D.employers), emp)}${grads}
      ${group(esc(D.industry), chipsOf(sec, state.sector, "sector", esc(D.allIndustries)))}
      ${POSTINGS ? `<div class="fgroup"><span class="lbl">${esc(D.employer)}</span><input type="search" id="company-q" placeholder="${esc(D.employerName)}" aria-label="${esc(D.employerName)}" value="${esc(state.companyQuery)}" autocomplete="off"><div class="m-0 mt-1 chips">${picked.map(([v, n]) => `<button type="button" class="chip on" data-company="${esc(v)}">${esc(v)}<span class="n">${fmt(n)}</span></button>`).join("")}${options.map(([v, n]) => `<button type="button" class="chip" data-company="${esc(v)}">${esc(v)}<span class="n">${fmt(n)}</span></button>`).join("")}${!picked.length && !q ? `<span class="small muted">${esc(D.typeName)}</span>` : ""}</div></div>` : ""}
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
    const n2 = a.behaviours ? `<span class="n">${esc(waysLine(a.skills))}</span>` : `<span class="n">${esc(fill(a.skills.length === 1 ? RL.skill : RL.skills, { n: fmt(a.skills.length) }))}</span>`;
    return `<details class="areabox${a.behaviours ? " behaviours" : ""}" data-area="${esc(a.cluster)}"${flat || state.areaOpen.has(a.cluster) ? " open" : ""}><summary><span class="t">${esc(a.label)}</span>${n2}</summary><div class="srows">${rowsOf(first, flat || !core.length)}${fold}</div></details>`;
  }
  // the "How you work" row's summary (2026-11-06: two short sentences, from Copy.role.ways): the three ways of working
  // most postings in this view ask for, with their shares
  const waysLine = list => fill(RL.ways, { list: list.slice(0, 3).map(s => `${s.name.toLowerCase()} ${pct(s.share)}`).join(", ") + (list.length > 3 ? ", …" : "") });
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
    // with no game record yet, the card is one line into the game (2026-11-06: a new visitor found no way in)
    const game = (gamesList || []).find(x => x.slug === PRACTISE);
    const know = GS ? GS.knowCard({ roleId: role.id, label: role.label, asks, nameOf: id => (R.skillById[id] || { name: id }).name, practise: ids => `#/play/${PRACTISE}?role=${encodeURIComponent(role.id)}&skills=${encodeURIComponent(ids.slice(0, 8).join(","))}`,
      first: game ? { href: `#/play/${PRACTISE}?role=${encodeURIComponent(role.id)}`, text: fill(RL.tryGame, { title: game.title, minutes: game.minutes }) } : null }) : "";
    // the fit paints the list whenever one is read for this view (no toggle: owner's decision 2026-10-24)
    const fit = fitFor(), m = fit ? state.match : null;
    const nAct = activeCount();
    const seg = `<div class="seg" role="group" aria-label="${esc(RL.levelAria)}"><button type="button" class="${state.level === "all" ? "on" : ""}" aria-pressed="${state.level === "all"}" data-level="all">${esc(RL.allLevels)}</button>${Atlas.STEPS.map(s => `<button type="button" class="${state.level === s ? "on" : ""}" aria-pressed="${state.level === s}" data-level="${s}">${esc(R.stepLabels[s])}</button>`).join("")}</div>`;
    // "Says it sponsors" (PLAN.md v16, step 8): postings that say they sponsor a visa; shown once the data carries the fact
    const hasSponsorship = R.jobs.some(j => j.sponsorship != null);
    const nSponsor = hasSponsorship ? jobsExcept("sponsor").filter(j => j.sponsorship === "yes").length : 0;
    const sponsorChip = hasSponsorship ? `<button type="button" class="chip${state.sponsor ? " on" : ""}" id="sponsor-chip" aria-pressed="${state.sponsor}" data-measure="${esc(fill(RL.sponsorsMeasure, { n: fmt(nSponsor), m: fmt(jobsExcept("sponsor").length), no: R.jobs.some(j => j.sponsorship === "no") ? fill(RL.sponsorsNo, { n: fmt(jobsExcept("sponsor").filter(j => j.sponsorship === "no").length) }) : "" }))}">${esc(RL.sponsors)}<span class="n">${fmt(nSponsor)}</span></button>` : "";
    const filters = `<div class="filters">${seg}${sponsorChip}<button type="button" class="btn sm filters-btn${nAct ? " on" : ""}" id="more-filters" aria-expanded="${state.more}">${esc(RL.filters)}${nAct ? `<span class="n">${nAct}</span>` : ""}</button>${!state.more ? activeChips(R) : ""}</div>${state.more ? drawerHtml(R, countBy) : ""}`;
    const expanded = allExpanded(areas);
    // the list's number beside the facts' open US count says what it counts (2026-11-06): the product set's open
    // postings worldwide (unless a country is picked), the business set's postings of the year, open and closed
    const inView = stats.n === 1 ? RL.oneInView : fill(R.set === "product" ? (state.country.size ? RL.inView : RL.inViewWorld) : nClosed ? RL.inViewYear : RL.inView, { n: fmt(stats.n) });
    const listHead = `<div class="listhead"><h2>${esc(RL.listHeading)} ${tip(RL.listTip)}</h2><span class="small muted">${esc(inView)}</span>${areas.length ? `<button type="button" class="linkish link" id="expand-all">${esc(expanded ? RL.collapseAll : RL.expandAll)}</button>` : ""}</div>`;
    const skillList = areas.length ? `<div class="areas">${areas.map(a => areaPanel(R, a, stats.n, m)).join("")}</div>` : `<p class="notice">${esc(RL.noMatch)}</p>`;

    const creds = R.skills.filter(s => s.cluster === "credentials" && stats.share(s.id) >= 0.1).map(s => ({ s, v: stats.share(s.id) })).sort((a, b) => b.v - a.v).slice(0, 6);
    const doms = R.skills.filter(s => s.cluster === "domain" && stats.share(s.id) >= 0.1).map(s => ({ s, v: stats.share(s.id) })).sort((a, b) => b.v - a.v).slice(0, 6);
    const credChip = x => `<span class="tag" data-measure="${esc(fill(RL.credMeasure, { share: pct(x.v), n: fmt(stats.n), name: x.s.name }))}">${esc(x.s.name)}</span>`;
    let summary = "";
    if (creds.length) { const w = inWords(creds[0].v), more = creds.slice(1, 3); summary = `${fill(esc(/posting$/.test(w) ? RL.credAskOne : RL.credAsk), { words: cap(esc(w)), name: low(esc(creds[0].s.name)) })}${more.length ? fill(esc(RL.credMore), { names: join(more.map(x => low(esc(x.s.name)))) }) : ""}.`; }
    if (doms.length) summary += " " + fill(esc(RL.industries), { names: join(doms.slice(0, 3).map(x => esc(x.s.name))) });
    const also = (creds.length || doms.length) ? `<p class="mt-3-5 lead">${summary}</p>${creds.length ? `<h3>${esc(RL.credentials)}</h3><div class="tags">${creds.map(credChip).join("")}</div>` : ""}${doms.length ? `<h3>${esc(RL.industriesHeading)}</h3><div class="tags">${doms.map(credChip).join("")}</div>` : ""}` : "";
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
      <div class="list" id="postings">${shownEmps.map(empBox).join("") || `<p class="py-2-5 small muted">${esc(RL.noOpenMatch)}</p>`}</div>
      <p class="mt-2 small muted">${esc(fill(RL.postingsFoot, { employers: fill(emps.length === 1 ? RL.employer : RL.employers, { n: fmt(emps.length) }), postings: fill(list.length === 1 ? RL.openPosting : RL.openPostings, { n: fmt(list.length) }), grads: R.set === "mba" ? RL.gradsFirst : "" }))} ${emps.length > shownEmps.length ? `<button type="button" class="linkish link" id="more">${esc(fill(RL.showMoreEmployers, { n: fmt(Math.min(20, emps.length - shownEmps.length)) }))}</button>` : ""}</p>`;
    const TABS = [["skills", RL.tabs.skills, null], ...(POSTINGS ? [["postings", RL.tabs.postings, open.length]] : []), ...(also ? [["also", RL.tabs.also, null]] : [])];
    if (!TABS.some(t => t[0] === state.tab)) state.tab = "skills";
    const tabs = `<div class="tabs" role="tablist">${TABS.map(([k, l, n]) => `<button type="button" role="tab" class="${state.tab === k ? "on" : ""}" aria-selected="${state.tab === k}" data-tab="${k}">${esc(l)}${n != null ? `<span class="n">${fmt(n)}</span>` : ""}</button>`).join("")}</div>`;
    const body = state.tab === "postings" ? postings : state.tab === "also" ? also : listHead + skillList;
    // the title, one sentence on what the job is (web/data/role_blurbs.json), the facts (open postings and employers
    // alone since 2026-11-01: the country and the entry grade went), the data's lead sentence
    page(`<div class="role-head"><h1>${esc(role.label)}</h1>${heartHtml(role.id, { label: role.label, save: true })}</div><p class="facts">${facts}</p>
      <p class="small muted heart-note" data-heart-note="${esc(role.id)}"${heartNote(role.id) ? "" : " hidden"}>${heartNote(role.id)}</p>
      <p class="lead">${role.blurb ? esc(role.blurb) + " " : ""}${lead}</p>${know}
      ${filters}${tabs}${body}`);
    wireHearts(main);
    main.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { state.tab = b.dataset.tab; keepScroll(renderRole); });
    main.querySelectorAll("details.empbox").forEach(d => d.ontoggle = () => { d.open ? state.empOpen.add(d.dataset.empOpen) : state.empOpen.delete(d.dataset.empOpen); });
    main.querySelectorAll("[data-level]").forEach(b => b.onclick = () => { state.level = b.dataset.level; state.fitLevel = null; state.shown = PAGE; keepScroll(renderRole); });
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
    const over = html => railBase ? `<button type="button" class="close back" aria-label="${esc(Copy.games.back)}">${esc(CM.back)}</button>` + html.replace(`${UI.close(CM.close)}`, "") : html;
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
    const carrierTags = cs && cs.ids.length ? `<p class="m-0 mt-2 small">${esc(RL.shownThrough)}${cs.fallback ? ` <span class="subtle">${esc(fill(RL.inFieldNamed, { field: fieldLabel.toLowerCase() }))}</span>` : ""}: <span class="tags inline">${cs.ids.map(k => `<button type="button" class="tag" data-skill="${esc(k)}">${esc(R.skillById[k].name)}</button>`).join("")}</span></p>` : "";
    const means = `${reads ? `<p class="small reads"><b>${esc(hasOverride ? fill(RL.forRole, { role: R.role.label }) : fill(RL.inFieldLabel, { field: fieldLabel.toLowerCase() }))}:</b> ${esc(reads)}</p>` : `<p class="small muted">${esc(T.summary(s))}</p>`}${carrierTags}`;
    const lineHere = T.line(s, keys);
    const showIt = `<p class="m-0 mt-2-5 small"><b>${esc(T.how(s.kind || "method"))}</b></p>${s.kind !== "behaviour" ? `<p class="small">${esc(fill(RL.lineShows, { where: lineHere.source === "field" ? (lineHere.role ? fill(RL.lineForRole, { role: R.role.label }) : fill(RL.lineInField, { field: fieldLabel.toLowerCase() })) : "" }))} <em>“${esc(lineHere.text)}”</em></p>` : cs && cs.ids.length ? `<p class="small">${esc(fill(RL.lineCarries, { names: R.skillById[cs.ids[0]].name + (cs.ids[1] ? RL.or + R.skillById[cs.ids[1]].name : "") }))} <em>“${esc(lineHere.text)}”</em></p>` : ""}`;
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
    return `${UI.close(CM.close)}<div class="card">
      <p class="eyebrow">${kindLabel ? esc(kindLabel) + " · " : ""}${esc(R.clusters[s.cluster].label)}${def}</p><h2>${esc(s.name)}</h2>
      ${s.what ? `<p class="what">${esc(s.what)}</p>` : ""}
      ${share}${means}${subs}
      <div id="quote1">${firstQuote(ev)}</div>
      ${tabs}${state.cardTab ? `<div class="card-body">${bodies[state.cardTab]}</div>` : ""}
    </div>`;
  }
  function postingCard(R, j) {
    if (!j) return `${UI.close(CM.close)}<p class="empty">${esc(RL.notInRole)}</p>`;
    const byArea = {}; for (const k of j.skills) { const s = R.skillById[k]; if (s) (byArea[s.cluster] ||= []).push(s); }
    const subNames = (j.sub || []).map(id => { for (const [sid, list] of Object.entries(R.subs)) { const f = list.find(x => x.id === id); if (f) return { sid, name: f.name }; } return null; }).filter(Boolean);
    const who = j.intern ? RL.who.intern : j.entry === "mba" ? RL.who.mba : (j.entry === "pre_mba" || j.entry === "grad") ? RL.who.grads : null;
    const nSkills = j.skills.filter(k => R.skillById[k] && R.skillById[k].cluster !== "credentials").length;
    return `${UI.close(CM.close)}<div class="card">
      <p class="eyebrow">${esc(j.company)}${j.rank ? ` · ${esc(fill(RL.fortune, { n: j.rank }))}` : ""}</p><h2>${esc(j.title)}</h2>
      <p class="facts">${esc(levelLabel(R, j))}${j.location ? " · " + esc(j.location) : ""}${j.remote ? esc(RL.remoteFact) : ""}${j.yoe ? esc(fill(RL.yearsAsked, { n: j.yoe })) : ""}${j.industry ? " · " + esc(j.industry) : ""}</p>
      ${who ? `<p class="fg-primary small">${esc(who)}${j.entry_src === "firm" || j.entry_src === "category" ? esc(RL.whoGrade) : ""}.</p>` : ""}
      ${j.snippet ? `<p class="small muted">${esc(j.snippet)}…</p>` : ""}
      ${POSTINGS ? `<p><a class="link" href="${esc(j.url)}" target="_blank" rel="noopener">${esc(RL.openPostingLink)}</a></p>` : ""}
      <h3>${esc(fill(nSkills === 1 ? RL.skillAsked : RL.skillsAsked, { n: fmt(nSkills) }))}</h3>
      ${Object.entries(byArea).sort((a, b) => b[1].length - a[1].length).map(([c, ss]) => `<p class="m-0 mt-2 mb-0-5 small muted">${esc(R.clusters[c].label)}</p><div class="tags">${ss.map(s => `<button type="button" class="tag" data-skill="${esc(s.id)}">${esc(s.name)}</button>`).join("")}</div>`).join("")}
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
  // the native box: the line, the form, the privacy line (and "Not now" where the box can close)
  const intakeNative = (what, roleId, notNow) => `<p class="small">${esc(Intake.line[Intake.surfaceOf(what)])}</p>${intakeForm(what, roleId)}<p class="m-0 mt-1-5 small muted">${esc(Intake.privacy)}${notNow ? " " + notNow : ""}</p>`;
  const intakeForm = (what, roleId) => `<form class="apply-form" data-wait-form="${esc(what)}"${roleId ? ` data-wait-role="${esc(roleId)}"` : ""}><input type="email" required placeholder="${esc(Door.COPY.emailPlaceholder)}" aria-label="${esc(Intake.email)}" autocomplete="email" value="${esc(doorKept().email)}"><button type="submit" class="btn primary">${esc(Intake.button)}</button></form>`;
  // opts.always: drawn whether or not state.wait names it (the fit screen, the launcher, the networking screen, the
  // picker); opts.role_id: the role to record instead of the role screen's (the picker's chosen role)
  function applyBox(what, opts) {
    opts = opts || {};
    if (!opts.always && state.wait !== what) return "";
    const done = intakeDone(what), tally = !done && !!(window.Doors && Doors.formIdFor(Intake.kindOf(what), null, formTheme()));
    if (!done && window.Capture) Capture.cta(Intake.kindOf(what), "shown", intakeCtx(what, opts.role_id));   // its "done" is the intake_<surface> event
    // with a Tally id the slot waits for wireWait; its line keeps the page still until the form draws
    // Tally's form says the line and the privacy line itself (2026-11-06: the box said both twice), so the box draws
    // them only around the native form, which is also what the slot falls back to
    const notNow = opts.always || done ? "" : `<a href="#/" data-wait-close>${esc(CM.notNow)}</a>`;
    const body = done ? `<p class="small">${esc(Intake.line[Intake.surfaceOf(what)])}</p><p class="m-0 mt-1-5 small"><b>${esc(Intake.done)}</b></p>${notNow ? `<p class="m-0 mt-1-5 small muted">${notNow}</p>` : ""}`
      : tally ? `<div class="apply-slot" data-wait-slot="${esc(what)}"${opts.role_id ? ` data-wait-role="${esc(opts.role_id)}"` : ""}></div><p class="small muted apply-loading">${esc(CM.loadingForm)}</p>${notNow ? `<p class="m-0 mt-1-5 small muted">${notNow}</p>` : ""}`
      : intakeNative(what, opts.role_id, notNow);
    return `<div class="wait apply"><b>${esc(Intake.headingOf(what))}</b>${body}</div>`;
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
        native: () => intakeNative(what, roleId),
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
    // only for a visitor whose address opens a roster (campusGate, as the top bar): for anyone else #/classes goes home
    const classesOpen = !!window.ClassScreens && campusGate().open;
    // and a link to the course screen for everyone (2026-11-06: no link led there)
    const cta = `<section class="rs"><div class="acts">${classesOpen ? `<a href="#/classes?role=${encodeURIComponent(role.id)}">${esc(RR.findClasses)}</a>` : ""}<a href="#/role/${esc(role.id)}/course">${esc(RR.checkCourse)}</a></div></section>`;
    const drop = `<div id="rail-drop">${resumeZone(RF.dropShort)}</div>`;
    if (!state.resume) {
      if (!y.where && !y.stage) return legend + `<section class="rs"><h3 class="rh">${esc(RR.howFit)}</h3><p>${esc(RR.dropLead)}</p>${drop}<p><a href="${esc(Routes.You.resumeHref(0, location.hash))}" data-answer-link>${esc(fill(RR.orAnswer, { n: Q.length }))}</a> ${esc(RR.orAnswerAfter)}</p></section>` + cta;
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
    // what that count takes, and every skill that still needs evidence, the number the fit screen's list carries
    const RC = Routes.FitCounts.railLines(Routes.FitCounts.of(fit), fit.level === "all" ? null : R.stepLabels[fit.level]);
    const counts = core.length ? `<p class="small muted" data-rail-counts>${esc(RC.what)} ${esc(RC.still)} <a href="#/role/${esc(role.id)}/fit">${esc(RR.stillSee)}</a></p>` : "";
    // the model read's part of that count (web/infer.js), marked as the legend marks it; the lines are on the fit screen
    const coreInf = coreHave.filter(x => x.status === "inferred").length;
    const infLine = coreInf ? `<p class="small muted">◈ ${esc(fill(RR.inferredLine, { n: coreInf }))} <a href="#/role/${esc(role.id)}/fit">${esc(RR.inferredSee)}</a></p>` : "";
    const slotWhy = x => x.slot === "__domain" ? esc(fill(RR.industry, { names: fit.r.industries.slice(0, 3).map(d => d.name).join(", ") })) : x.slot === "__ai" ? esc(fill(RR.ai, { names: fit.r.ai.map(k => R.skillById[k] ? R.skillById[k].name : k).join(", ") })) : "";
    const gc = gapClassesFor(fit, R, () => showAside(null));
    const classLinks = id => { const cs = classesOpen && gc && gc.byGap && gc.byGap[id]; return cs && cs.length ? `<span class="plinks">${esc(RR.classesCover)} ${cs.slice(0, 3).map(c => `<a href="#/classes?role=${encodeURIComponent(role.id)}&open=${encodeURIComponent(c.code)}">${esc(c.code)}</a>`).join(" · ")}</span><br>` : ""; };
    const gapRow = x => { const openRow = state.gapOpen === x.slot; const gt = gapText(R, x, fit); const ex = slotWhy(x) || (gt ? `${esc(gt.gap)}${x.kind !== "behaviour" ? ` ${esc(RR.lineShows)} <em>“${esc(gt.line.text)}”</em>` : ""}` : (x.build && x.build[0] ? stepHtml(x.build[0]) : esc(RR.openSkillHow))); return `<li class="${openRow ? "open" : ""}"><button type="button" class="t" data-gap="${esc(x.slot)}"><span>${esc(x.slotName)}</span><span class="n">${pct(x.w)}</span></button>${openRow ? `<div class="ex">${ex}${R.skillById[x.id] ? `<br>${classLinks(x.id)}${postingLinks(R, fit.slice, x.id, 3)}` : ""}<br><button type="button" class="linkish link" data-wait="show">${esc(RR.helpBuild)}</button> · <button type="button" class="linkish link" data-wait="positioning">${esc(RR.helpPosition)}</button>${R.skillById[x.id] ? ` · <button type="button" class="linkish link" data-skill="${esc(x.id)}">${esc(RR.openSkill)}</button>` : ""}</div>` : ""}</li>`; };
    // the classes that cover the most core gaps (step 3 of the pass): three links into the picker with the course open;
    // when the roster cannot be read here, one line from the campus file and the picker's link
    const termName = (window.ClassScreens && ClassScreens.termLabel()) || "Spring 2027";
    const classesHead = `<h3 class="mt-3-5 rh">${esc(RR.classesHeading)}</h3>`;
    const classesBlock = !coreGaps.length || !classesOpen ? "" : !gc ? `${classesHead}<p class="small muted">${esc(fill(RR.readingRoster, { term: termName }))}</p>`
      : gc.closed ? `${classesHead}<p class="small muted">${esc(gc.closed)} <a href="#/classes?role=${encodeURIComponent(role.id)}">${esc(fill(RR.termClasses, { term: termName }))}</a></p>`
      : gc.top && gc.top.length ? `${classesHead}<ul class="gaps classes">${gc.top.map(c => `<li><a class="t" href="#/classes?role=${encodeURIComponent(role.id)}&open=${encodeURIComponent(c.codes[0])}"><span>${esc(c.codes[0])} · ${esc(c.title)}</span><span class="n">${c.covered.length}</span></a><div class="ex">${esc(fill(RR.covers, { names: c.covered.map(g => g.name).join(", ") }))}</div></li>`).join("")}</ul><p class="mt-1-5 small muted"><a href="#/classes?role=${encodeURIComponent(role.id)}">${esc(fill(RR.allClasses, { term: termName }))}</a></p>`
      : gc.failed ? "" : `${classesHead}<p class="small muted">${esc(fill(RR.noClass, { term: termName }))} <a href="#/classes?role=${encodeURIComponent(role.id)}">${esc(RR.seeRoster)}</a></p>`;
    const gapsHtml = coreGaps.length ? `<h3 class="mt-3-5 rh">${esc(RR.needsEvidence)}</h3><ul class="gaps">${coreGaps.map(gapRow).join("")}</ul>${waitHtml("show")}${waitHtml("positioning")}${bandNext && bandNext !== band ? `<p class="mt-2 small muted">${esc(fill(coreGaps.length === 1 ? RR.evidenceOne : RR.evidenceThree, { band: bandName(bandNext) }))}</p>` : ""}${classesBlock}` : "";
    // with no gap among them, the rail says so right under the lead line, before the count of what still needs evidence
    // (2026-11-08: it came last, after "11 skills in all still need evidence", and read as a contradiction)
    const allShown = core.length && !coreGaps.length ? `<p class="small muted">${esc(fill(RR.nothingMissing, { m: core.length }))}</p>` : "";
    const n = fit.evid.length + fit.trans.length + (fit.inferred || []).length;
    // "change" goes to the résumé step and back to this role (Routes.You.resumeHref; the wizard honours &next=)
    const you = `<section class="rs"><h3 class="rh">${esc(fill(RR.yourFit, { name: state.resume.name }))} · <a href="${esc(resumeHref())}">${esc(CM.change)}</a></h3>${scale}${postingLine}${line}${allShown}${counts}${infLine}${gapsHtml}<p class="mt-3"><a href="#/role/${esc(role.id)}/fit">${esc(n === 1 ? RR.seeAllOne : fill(RR.seeAll, { n }))}</a></p></section>`;
    return legend + you + cta;
  }
  function wireRail() {
    if ($("#drop")) wireResumeForm(() => { state.fit = null; keepScroll(renderRole); });
    aside.querySelectorAll("[data-gap]").forEach(b => b.onclick = () => { state.gapOpen = state.gapOpen === b.dataset.gap ? null : b.dataset.gap; showAside(null); });
    aside.querySelectorAll("[data-wait]").forEach(b => b.onclick = e => { e.preventDefault(); state.wait = state.wait === b.dataset.wait ? null : b.dataset.wait; showAside(null); });
    aside.querySelectorAll("[data-wait-close]").forEach(b => b.onclick = e => { e.preventDefault(); state.wait = null; showAside(null); });
    wireWait(aside, () => showAside(null));
    aside.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }));
  }
  // the persona lines are templates (Copy.fit.persona); the bold part is marked after escaping
  const treeShown = new Set();   // the roles whose fit screen showed "Get your tree" this visit
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
      page(`<p class="eyebrow">${esc(fill(FT.eyebrow, { role: role.label }))}</p><h1>${esc(FT.addResume)}</h1><p class="lead">${esc(fill(FT.addLead, { role: role.label }))}</p>${resumeForm()}<div class="mt-3 row"><a class="btn quiet" href="#/role/${esc(role.id)}">${esc(FT.backRole)}</a></div>`, true);
      showAside(null); wireResumeForm(() => fitScreen(id));
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
    // class links only for a visitor whose address opens a roster (campusGate, as the rail and the top bar): for anyone
    // else #/classes goes home (2026-11-06)
    const classesOpen = !!window.ClassScreens && campusGate().open;
    const gcF = classesOpen ? gapClassesFor(f, R, () => { if (location.hash.endsWith("/fit")) keepScroll(() => fitScreen(id)); }) : null;
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
    const sayLink = trans.length ? `<p class="mt-2 small"><button type="button" class="linkish link" id="say-it">${esc(fill(FT.sayItButton, { field }))}</button></p>` : "";
    const courseLink = `<p class="mt-2 small"><a href="#/role/${esc(role.id)}/course">${esc(FT.checkCourse)}</a></p>`;
    const showTab = `<div class="fitcols">${col("show", FT.already, showItems, FT.nothingYet, sayLink)}${col("gaps", FT.needsEvidence, stillItems, FT.nothingAmong, courseLink)}</div>`;
    const detailTab = `${infDisc}${sayIt}${thinDisc}<h3>${esc(FT.credentials)}</h3>${credLine + indLine || `<p class="small muted">${esc(FT.noneAsked)}</p>`}${unmapped}`;
    const FTABS = [["show", FT.tabs.show, null], ["details", FT.tabs.details, null]];
    const fitTabs = `<div class="tabs" role="tablist">${FTABS.map(([k, l, n]) => `<button type="button" role="tab" class="${state.fitTab === k ? "on" : ""}" aria-selected="${state.fitTab === k}" data-ftab="${k}">${esc(l)}${n != null ? `<span class="n">${fmt(n)}</span>` : ""}</button>`).join("")}</div>`;
    const fitBody = state.fitTab === "details" ? detailTab : showTab;
    const ctx = `<div class="row between fit-top"><h1 class="eyebrow">${esc(fill(FT.eyebrow, { role: role.label }))}${extra.length ? " · " + esc(extra.join(", ")) : ""}</h1><span class="small muted ctx"><select id="fit-level" aria-label="${esc(RL.levelAria)}">${["all", ...Atlas.STEPS].map(s => `<option value="${s}"${level === s ? " selected" : ""}>${esc(s === "all" ? FT.allLevels : R.stepLabels[s])}</option>`).join("")}</select> · ${esc(state.resume.name)} · <a href="#/role/${esc(role.id)}/fit" id="change">${esc(CM.change)}</a></span></div>`;
    // "Have a posting? Paste it." under the resume: a drop-or-paste box; with one on file, what it asks for and the count
    const pSum = asks ? postingSummary(asks, f) : null;
    const postingBox = `<div class="posting-box">${P ? `<p class="small">${bold(esc(fill(pSum.m === 1 ? FT.postingLineOne : FT.postingLine, { name: `[[${P.name}]]`, m: pSum.m, n: `[[${pSum.n}]]` })))} <button type="button" class="linkish link" id="posting-change">${esc(FT.pasteAnother)}</button> · <button type="button" class="linkish link" id="posting-forget">${esc(FT.forgetPosting)}</button></p>` : `<details class="disc" id="posting-disc"${state.postingOpen ? " open" : ""}><summary>${esc(FT.havePosting)}</summary><div class="disc-body"><p class="small muted">${esc(FT.postingLead)}</p>${postingForm()}<div class="m-0 mt-2-5 mb-1 row"><button type="button" class="btn primary" id="go" data-reads>${esc(FT.readPosting)}</button></div></div></details>`}</div>`;
    // "Get your tree" (step 5, 2026-11-05): the self-serve tree of step 4, offered where the read is; it needs a
    // session, so with none the link goes through the sign-in and back to the form with this role picked. Only with
    // the tree on and a sign-in anyone can use (or a session already held). cta get_tree: shown once per role per
    // visit, click on the press; its done is the tree form's own.
    const treeHref = `#/map?build=1&role=${encodeURIComponent(role.id)}`;
    const treeCta = buildOn() && skillTreeOn() ? `<div class="tree-cta"><b>${esc(FT.tree.heading)}</b><p class="small muted">${esc(fill(FT.tree.lead, { role: role.label }))}</p><a class="btn primary" id="get-tree" href="${esc(Auth.stored() || openOn() ? treeHref : `#/signin?next=${encodeURIComponent(treeHref)}`)}">${esc(FT.tree.button)}</a></div>` : "";
    page(`${ctx}${unread}${placeholder}${verdict}
      <p class="lead">${PERSONA[p.persona](p, field)} ${bold(esc(fill(FT.youShow, { count: `[[${coreHave} of ${core.length}]]`, role: role.label })))}</p>${core.length ? `<p class="small muted" data-fit-note>${esc(fill(FT.colsNote, { m: core.length }))}</p>` : ""}${standing}${postingBox}
      ${fitTabs}${fitBody}
      ${treeCta}
      <div class="fit-wait">${applyBox("fit", { always: true })}</div>
      <p class="mt-5 small muted"><a href="#/role/${esc(role.id)}">${esc(fill(FT.backTo, { role: role.label }))}</a>${esc(FT.backAfter)}</p>`);
    wireWait(main, () => keepScroll(() => fitScreen(id)));
    const gt = $("#get-tree"); if (gt) { gt.onclick = () => { if (window.Capture) Capture.cta("get_tree", "click", { role_id: role.id }); }; if (!treeShown.has(role.id)) { treeShown.add(role.id); if (window.Capture) Capture.cta("get_tree", "shown", { role_id: role.id }); } }
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
    return `${dropZone(FT.dropPosting)}
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
    const form = `${dropZone(CO.drop, c ? esc(fill(CO.read, { name: c.name })) : "")}
      <p class="small muted">${esc(CO.paste)}</p><textarea id="paste" rows="6" aria-label="${esc(CO.aria)}" placeholder="${esc(CO.placeholder)}">${c ? esc(c.text) : ""}</textarea>
      <div class="m-0 mt-3 mb-1 row"><button type="button" class="btn primary" id="go" data-reads>${esc(CO.button)}</button><span class="small muted">${esc(CM.noLeave)}</span></div>`;
    // the level the count reads (2026-11-06: the role page's level carried over unseen), with a control to change it
    const seg = `<div class="seg course-level" role="group" aria-label="${esc(CO.level)}">${["all", ...Atlas.STEPS].map(s => `<button type="button" class="${state.level === s ? "on" : ""}" aria-pressed="${state.level === s}" data-course-level="${s}">${esc(s === "all" ? RL.allLevels : R.stepLabels[s])}</button>`).join("")}</div>`;
    let result = "";
    if (c) {
      const slice = sliceOf(); const { rows } = Atlas.grid(R, slice);
      const inGrid = rows.flat(2); const showable = x => Atlas.COURSE_KINDS.has((R.skillById[x.id] || {}).kind);
      // the skills most postings ask for that a course can show, at this level; with none there, at all levels, said so
      const pick = Routes.CourseCore.pick(rows[0].flat(), state.level === "all" ? rows[0].flat() : Atlas.grid(R, sliceOf("all")).rows[0].flat(), showable, state.level);
      // taught: skills of the four kinds a course can show; named: behaviours and practices the text mentions, listed apart,
      // not painted, not counted; "does not cover" is the craft among the most-asked skills that the text does not name
      const taught = inGrid.filter(x => split.teaches.has(x.id)), named = inGrid.filter(x => split.named.has(x.id)), core = pick.core, coreTaught = core.filter(x => split.teaches.has(x.id)), notTaught = core.filter(x => !split.teaches.has(x.id));
      const m = state.match && state.match.roleId === role.id ? state.match : null;
      const gapsCovered = m ? taught.filter(x => m.required.has(x.id) && !m.matched.has(x.id)) : [];
      state.paint = { roleId: role.id, matched: new Set(taught.map(x => x.id)), required: new Set(core.map(x => x.id)), presumed: new Set(), subs: new Set(Object.values(c.ev || {}).flatMap(e => [...(e.subs || [])])) };
      const tagOf = x => `<button type="button" class="tag good" data-skill="${esc(x.id)}">${esc(x.name)}${x.defining ? " ◆" : ""} <span class="subtle">${pct(x.share)}</span></button>`;
      const T5 = textOf(R.kinds);
      const namedHtml = named.length ? `<h2>${esc(CO.named)}</h2><div class="tags">${named.map(x => `<button type="button" class="tag" data-skill="${esc(x.id)}">${esc(x.name)} <span class="subtle">${pct(x.share)}</span></button>`).join("")}</div><p class="small muted">${esc(T5.how("behaviour"))} ${esc(CO.namedNote)} <a href="#/role/${esc(role.id)}/fit">${esc(CO.yourFit)}</a>.</p>` : "";
      result = taught.length || named.length ? `${taught.length ? `<h2>${esc(CO.teaches)}</h2><div class="tags">${taught.map(tagOf).join("")}</div>
        <p class="small muted">${pick.fellBack ? esc(fill(CO.coreNone, { level: R.stepLabels[state.level] })) + " " : ""}${esc(fill(CO.coreLine, { n: coreTaught.length, m: core.length, role: role.label }))}${gapsCovered.length ? " " + esc(fill(gapsCovered.length === 1 ? CO.coversOne : CO.coversMany, { n: gapsCovered.length, names: gapsCovered.map(x => x.name).join(", ") })) : m ? " " + esc(CO.coversNone) : ` <a href="#/role/${esc(role.id)}/fit">${esc(CO.checkFit)}</a> ${esc(CO.checkFitAfter)}`} ${esc(CO.shareNote)}</p>` : `<p class="notice">${esc(CO.noSkill)}</p>`}${namedHtml}
        ${notTaught.length ? `<h2>${esc(CO.notCover)}</h2><div class="tags">${notTaught.map(x => `<button type="button" class="tag bad" data-skill="${esc(x.id)}">${esc(x.name)}${x.defining ? " ◆" : ""}</button>`).join("")}</div><p class="small muted">${esc(CO.notCoverNote)}</p>` : ""}
        <h2>${esc(CO.onList)}</h2><p class="small muted">${esc(CO.onListNote)}</p>${flatSkills(R, slice, state.paint)}` : `<div class="notice"><b>${esc(CO.noneFound)}</b> ${esc(c.lines < 3 ? CO.tooShort : CO.checkText)}</div>`;
    }
    page(`<p class="eyebrow">${esc(fill(CO.eyebrow, { role: role.label }))}</p><h1>${esc(CO.heading)}</h1><p class="lead">${esc(fill(CO.lead, { role: role.label }))}</p><div class="filters">${seg}</div>${form}${result}<p class="mt-3 small muted"><a href="#/role/${esc(role.id)}">${esc(fill(FT.backTo, { role: role.label }))}</a></p>`);
    wireFileDrop(async text => { const r = await Atlas.readCourse(text.text); track("course_read", { role_id: role.id }); state.course = { roleId: role.id, name: text.name, text: text.text, found: r.found, teaches: r.teaches, named: r.named, ev: r.ev, lines: r.lines }; store.set("course", { roleId: role.id, name: text.name, text: text.text, found: [...r.found], ev: {}, lines: r.lines }); courseScreen(id); });
    main.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }, true));
    main.querySelectorAll("[data-course-level]").forEach(b => b.onclick = () => { state.level = b.dataset.courseLevel; state.fitLevel = null; state.fit = null; keepScroll(() => courseScreen(id)); });
    renderAside();
  }
  // a drop zone plus a paste box, for any text; `onText({ text, name })` runs when the person clicks the button. The
  // file waits here for the button (a paste can stand in for it), in this form's own `held`: never a résumé, never
  // another screen's.
  function wireFileDrop(onText) {
    let held = null;
    wireDrop(async file => {
      fileStatus(fill(RF.reading, { name: file.name })); processing("file");
      try {
        const text = await fileText(file), words = wordsOf(text);
        held = { text, name: file.name, words }; processing(null);
        fileStatus(words < 40 ? fill(RF.fewWords, { name: file.name, words }) : fill(RF.read, { name: file.name, words: fmt(words) }));
      } catch (e) { processing(null); held = null; fileStatus(fill(RF.cantRead, { message: e.message })); }
    });
    $("#go").onclick = async () => {
      const pasted = ($("#paste") || {}).value || "";
      const r = pasted.trim().length >= 20 ? { text: pasted, name: RF.pastedName } : held;
      if (!r) { fileStatus(RF.nothingText); return; }
      held = null; await onText(r);
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
    // a posting names its role by family ("pm" in the product set, the role's id elsewhere): the label, never the id
    const labels = Object.fromEntries(roles.flatMap(r => [[r.id, r.label], [r.family, r.label]]));
    const roleLabel = f => labels[f] || (ix.roles[f] || {}).label || "";
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
        <h2>${esc(EV.sayAbout)}</h2>${rg ? sayAboutYou(roles, rg, coreOf, nameOf, GENERIC) : `<p class="small muted"><a href="${esc(resumeHref())}" data-resume-link>${esc(EV.addResume)}</a> ${esc(EV.addResumeSay)}</p>`}
        <h2>${esc(EV.employers)}</h2><div id="employers"><p class="small muted">${esc(EV.loadingPostings)}</p></div>`;
    } else if (kind === "roundtable") {
      // owner's choice E5: the resume lines once at the top, then one card per role, the first open
      body = `${rg ? `<h2>${esc(EV.yourLines)}</h2><div id="yourlines"><p class="small muted">${esc(EV.readingRoles)}</p></div>` : ""}
        <h2>${esc(EV.roleByRole)}</h2><p class="small muted">${rg ? esc(EV.roleByRoleLead) : `<a href="${esc(resumeHref())}" data-resume-link>${esc(EV.addResume)}</a> ${esc(EV.roleByRoleNoResume)}`}</p>
        <div id="roundtable">${roles.map((r, i) => rg ? '' : `<details class="empbox"${i === 0 ? " open" : ""}><summary><span class="t">${esc(r.label)}</span><span class="n">${nOpen(r)}</span><span class="m">${esc(fill(EV.mostAsk, { names: join(coreOf(r).filter(id => !GENERIC.has(id)).slice(0, 3).map(id => nameOf(id))) }))}</span></summary><div class="box-body"><p class="small muted">${esc(fill(EV.mostAskList, { names: coreOf(r).filter(id => !GENERIC.has(id)).slice(0, 6).map(id => nameOf(id)).join(", ") }))} <a href="#/role/${esc(r.id)}">${esc(EV.openRole)}</a></p></div></details>`).join("")}${rg ? `<p class="small muted">${esc(EV.readingRoles)}</p>` : ""}</div>`;
    } else {
      // what to build: the skills most roles of the field ask for that the resume does not show, with the build step where one is written
      const count = {}; for (const r of roles) for (const id of coreOf(r)) count[id] = (count[id] || 0) + 1;
      const cands = Object.entries(count).filter(([id]) => !GENERIC.has(id) && (!rg || !rg.shown.has(id))).sort((a, b) => b[1] - a[1]).slice(0, 5);
      body = `<h2>${esc(EV.build)}</h2><p class="small muted">${rg ? esc(EV.buildLead) : `${esc(EV.buildNoResume)} <a href="${esc(resumeHref())}" data-resume-link>${esc(EV.addResume)}</a> ${esc(EV.buildNoResumeAfter)}`}</p>
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
    if (kind === "networking") Atlas.fieldJobs(g.id).then(jobs => { if (!location.hash.startsWith(`#/field/${g.id}/event`)) return; const by = {}; for (const j of jobs) if (j.open) { const e = by[j.company] ||= { n: 0, roles: new Set() }; e.n++; e.roles.add(j.family); } const top = Object.entries(by).sort((a, b) => b[1].n - a[1].n).slice(0, 12); const el = $("#employers"); if (el) { const draw = all => { el.innerHTML = `<div class="list">${top.slice(0, all ? 12 : 5).map(([c, e]) => `<div class="r"><span class="t">${esc(c)}</span><span class="n">${esc(fill(CM.nOpen, { n: fmt(e.n) }))}</span><span class="m">${[...e.roles].map(roleLabel).filter(Boolean).slice(0, 4).map(esc).join(", ")}</span></div>`).join("")}</div>${top.length > 5 ? `<p class="mt-2 small"><button type="button" class="linkish link" id="emp-all">${esc(all ? EV.fewer : fill(EV.allN, { n: top.length }))}</button></p>` : ""}`; const b = $("#emp-all"); if (b) b.onclick = () => draw(!all); }; draw(false); } }).catch(e => { const el = $("#employers"); if (el) el.innerHTML = `<p class="small muted">${esc(EV.loadFailed)}</p>`; console.error(e); });
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
  // About (v19 B5): what the site is (the verbs this visitor has: Door.verbs, the open ones; Find classes and the alumni
  // line only for an address that opens them), what it counts (from the data), how it reads a posting, and privacy (the
  // funnel events, the list kept true to web/capture.js EVENTS; the email; the resume text once to the model read,
  // web/infer.js). The page draws once: the class count and the product set arrive late and fill their own cells
  // (#ab-classes, #ab-roles, #ab-product), so the scroll and an open list stay as they are (2026-11-06).
  async function about() {
    const [ix, counts] = await Promise.all([Atlas.index(), openCounts()]);
    const AB = Copy.about;
    crumbs([[AB.crumb, null]]); showAside(null);
    const M = ix.M, o = origins(M.meta.companies), n = homeCounts(ix, counts);   // the same open count as home and Find jobs
    const top = (cs, k) => cs.slice().sort((a, b) => b.n - a.n).slice(0, k).map(c => `${esc(c.name)} <span class="muted">${fmt(c.n)}</span>`).join(" · ");
    const fact = (v, l, id) => `<div class="fact"${id ? ` id="${id}"` : ""}><b>${v}</b><span>${esc(l)}</span></div>`;
    const term = (window.ClassScreens && ClassScreens.termLabel()) || "Spring 2027";
    const gate = campusGate(), verbs = Door.verbs(doorKept().email, {}, null, CAMPUSES || []).filter(v => v.open);
    const classesOpen = verbs.some(v => v.key === "classes");
    page(`<div id="about"><h1>${esc(AB.heading)}</h1>
      <p class="lead">${esc(AB.lead)} ${esc(AB.counts[verbs.length] || "")}</p>
      <h3>${esc(AB.jobs)}</h3>
      <p class="small">${esc(techShown() ? AB.jobsLineTech : AB.jobsLine)}</p>
      <h3>${esc(AB.skills)}</h3>
      <p class="small">${esc(AB.skillsLine)}</p>
      ${classesOpen ? `<h3>${esc(AB.classes)}</h3>
      <p class="small">${esc(fill(AB.classesLine, { term }))}</p>` : ""}
      <h3>${esc(AB.network)}</h3>
      <p class="small">${esc(AB.networkLine)}${gate.flag ? " " + esc(AB.networkAlumni) : ""}</p>
      <h3>${esc(AB.count)}</h3>
      <div class="about-facts">${fact(fmt(n.nOpen), AB.facts.open)}${fact(fmt(n.nCompanies), AB.facts.employers)}${fact(fmt(roleCount(ix)), AB.facts.roles, "ab-roles")}${classesOpen ? fact("—", fill(AB.facts.classes, { term }), "ab-classes") : ""}</div>
      <p class="small">${esc(fill(AB.countLine, { date: niceDate(M.meta.generated), fortune: fmt(o.fortune), startups: fmt(o.startup), mba: fmt(o.mba) }))}</p>
      ${disc("about-top", esc(AB.topEmployers), `<p>${top(M.meta.companies, 15)}</p>`)}
      <h3>${esc(AB.howRead)}</h3>
      <p class="small">${esc(AB.howReadLine)}</p>
      <p class="small">${esc(AB.editorial)}</p>
      <h3>${esc(AB.privacy)}</h3>
      <p class="small">${esc(AB.privacyEvents)}</p>
      <p class="small">${esc(AB.privacyEmail)}</p>${accountsOn() ? `<p class="small">${esc(AB.privacySaved)}</p>` : ""}${feedbackOn() ? `<p class="small">${esc(AB.privacyFeedback)}</p>` : ""}
      <h3>${esc(AB.product)}</h3><div id="ab-product"><p class="small muted">${esc(AB.productLoading)}</p></div></div>`, true);
    const cell = sel => location.hash.startsWith("#/about") ? main.querySelector(sel) : null;
    // the product set's roles join the index's when it loads (roleCount): the roles fact counts them in its own cell
    Atlas.product().then(P => { const r = cell("#ab-roles b"); if (r) r.textContent = fmt(roleCount(ix)); const G = P.G, el = cell("#ab-product"); if (el) el.innerHTML = `<p class="small">${esc(fill(AB.productLine, { n: fmt(G.meta.n_jobs), us: fmt(G.jobs.filter(j => j.country === M.meta.country).length), families: Object.keys(G.families).filter(f => G.jobs.some(j => j.family === f)).length, companies: fmt(G.meta.n_companies), date: niceDate(G.meta.generated) }))}</p>${disc("about-top-product", esc(AB.topCompanies), `<p>${top(G.meta.companies, 15)}</p>`)}`; }).catch(console.error);
    if (window.Catalog && classesOpen) Catalog.loadCatalog().then(d => { const el = cell("#ab-classes b"); if (el) el.textContent = fmt(d.classes.length); }).catch(() => { });
  }

  // the footer is the About link alone (owner's feedback 2026-11-01; named as the page since 2026-11-06): the count
  // and the refresh date it carried live on #/about, from the same number as home and Find jobs

  route();
})();
