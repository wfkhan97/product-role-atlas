/* Role atlas — the screens. Routes (hash): #/ start (the games, then see what jobs ask for) · #/play/<game> · #/you (next step) · #/explore · #/field/<group> · #/role/<role> ·
   #/about. Data comes from atlas.js; the side panel (owner's choice 8B) shows a skill or a posting. */
// The route: the hash read into the screen to show, its path parts and its query. Pure, no DOM; UMD like atlas.js,
// so node loads it alone (tests/web/routes.test.mjs): require("web/app.js").parseRoute.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Routes = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const SCREENS = { "": "start", you: "you", explore: "explore", field: "field", role: "role", play: "play", about: "about" };
  // "#/role/pm/fit?x=1" -> { name: "fit", params: { id: "pm" }, query: { x: "1" }, parts: ["role", "pm", "fit"], search: "x=1" }.
  // An unknown first part, or a part that cannot be decoded ("%E0"), shows the start screen. `search` is the text
  // between the first and a second "?", as the screens read it.
  function parseRoute(hash) {
    const h = String(hash || "");
    let parts;
    try { parts = h.split("?")[0].replace(/^#\/?/, "").split("/").map(decodeURIComponent); }
    catch { return { name: "start", params: {}, query: {}, parts: [], search: "" }; }
    const [a, b, c] = parts;
    const search = h.split("?")[1] || "";
    const query = Object.fromEntries(new URLSearchParams(search));
    let name = Object.hasOwn(SCREENS, a || "") ? SCREENS[a || ""] : "start";
    if (name === "field" && c === "event") name = "event";
    if (name === "role" && (c === "fit" || c === "course")) name = c;
    const params = name === "play" ? { slug: b } : ["field", "event", "role", "fit", "course"].includes(name) ? { id: b } : {};
    return { name, params, query, parts, search };
  }
  return { parseRoute };
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
  function showAside(html) { if (html == null) { aside.hidden = true; shell.classList.remove("with-aside"); aside.innerHTML = ""; } else { aside.hidden = false; shell.classList.add("with-aside"); aside.innerHTML = html; aside.scrollTop = 0; } }
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
  const state = { roleId: null, R: null, level: "all", employer: "all", selected: null, query: "", shown: 40, evTab: null, open: new Set(), you: null, resume: null, rough: null, match: null, fitLevel: null, course: null, paint: null, sector: new Set(), company: new Set(), country: new Set(), remote: false, more: false, companyQuery: "", grads: false, areaOpen: null, areaMore: new Set(), tab: "skills", fitTab: "show", paintOn: true, empOpen: new Set(), cardTab: null, cardMore: false };
  const PAGE = 8;   // employers shown in the postings tab before "Show more"
  // what the person told us and the resume they dropped stay in this browser only (nothing is uploaded)
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  state.you = store.get("you"); state.resume = store.get("resume");
  const LEVEL_OPT = { entry: "associate", mid: "mid", senior: "senior", lead: "lead" };
  function route() {
    const { name, params: { id, slug } } = Routes.parseRoute(location.hash);
    const go = { start, you, explore, field: () => field(id), event: () => eventScreen(id), role: () => roleScreen(id), fit: () => fitScreen(id), course: () => courseScreen(id), play: () => play(slug), about }[name];
    SkillMap.leave();
    go().catch(fail);
  }
  window.addEventListener("hashchange", route);

  // ---------- 1. first visit ----------
  // the top two thirds: the games, as a carousel of cards (the list is data: web/data/games.json);
  // the bottom third: what the site does today, see what jobs ask for and how you fit
  let gamesP = null;
  const games = () => gamesP ||= Atlas.fetchJson("data/games.json").catch(() => []);
  async function start() {
    crumbs([]); showAside(null);
    const list = await games();
    const card = gm => `<a class="game" href="#/play/${esc(gm.slug)}"><span class="cover"><img src="${esc(gm.cover)}" alt="" loading="lazy" onerror="this.remove()"><span class="ph-t">${esc(gm.title)}</span></span>
      <span class="gt">${esc(gm.title)}</span><span class="gd">${esc(gm.tagline)}</span>${gm.status === "soon" ? '<span class="tag soon">Coming soon</span>' : '<span class="tag">Play →</span>'}</a>`;
    page(`<section class="start-games">
        <p class="eyebrow">Play your way in</p>
        <h1>What do MBAs go on to do after grad school?</h1>
        <p class="lead">Short games built on live job postings for 54 roles in 11 fields. Every round ends in a real role you can open.</p>
        <div class="carousel" aria-label="Games">
          <button type="button" class="car-btn prev" aria-label="Previous games">‹</button>
          <div class="car-track" id="car-track" tabindex="0">${list.map(card).join("")}</div>
          <button type="button" class="car-btn next" aria-label="More games">›</button>
        </div>
      </section>
      <section class="start-fit">
        <h2>See what jobs ask for, and how you fit</h2>
        <p class="lead">Nothing you upload leaves your browser.</p>
        <div class="choices">
          <a class="choice rec" href="#/you"><div class="t">Tell us about you</div><div class="d">Three questions and an optional resume. We pick the roles that fit you and show how you compare.</div><span class="tag">About 2 minutes →</span></a>
          <a class="choice" href="#/explore"><div class="t">Explore the roles</div><div class="d">Browse by field, open a role, and see what its postings ask for. You can check your fit later.</div><span class="tag">No sign-up →</span></a>
        </div>
      </section>`);
    main.firstElementChild.classList.add("wide", "start");
    const track = $("#car-track"), by = dir => track.scrollBy({ left: dir * track.clientWidth * 0.9, behavior: "smooth" });
    main.querySelector(".car-btn.prev").onclick = () => by(-1); main.querySelector(".car-btn.next").onclick = () => by(1);
    track.onkeydown = e => { if (e.key === "ArrowRight") { by(1); e.preventDefault(); } if (e.key === "ArrowLeft") { by(-1); e.preventDefault(); } };
  }
  // a game: its own screen once built; until then, what it will be. A built game is web/games/<slug>.js, loaded
  // by index.html, which registers window.Games[slug] = { mount(el, ctx) } (contract in games/README.md)
  window.Games = window.Games || {};
  async function play(slug) {
    const gm = (await games()).find(g => g.slug === slug);
    if (!gm) return start();
    crumbs([["Games", "#/"], [gm.title, null]]); showAside(null);
    const G = window.Games[slug];
    if (gm.status === "live" && G && G.mount) { main.innerHTML = ""; window.scrollTo(0, 0); return G.mount(main, { Atlas, game: gm, showAside, crumbs, esc }); }
    page(`<p class="eyebrow">Coming soon</p><h1>${esc(gm.title)}</h1><p class="lead">${esc(gm.tagline)}.</p>
      <div class="cover big"><img src="${esc(gm.cover)}" alt="${esc(gm.title)}, an early design" onerror="this.remove()"><span class="ph-t">${esc(gm.title)}</span></div>
      <div class="row" style="margin-top:16px"><a class="btn" href="#/">← All games</a><a class="btn quiet" href="#/explore">Explore the roles</a></div>`, true);
  }
  // ---------- 2. tell us about you: two questions and an optional resume (owner's choice Y2: the "what are you
  // looking for" question changed nothing on screen, so it is gone), then a summary of what we know (Y3) ----------
  const Q = [
    { key: "where", title: "Where are you right now?", options: [["mba", "In an MBA programme"], ["grad", "In another master's or PhD programme"], ["undergrad", "In undergrad"], ["working", "Working, thinking about a change"]] },
    { key: "fields", title: "Which fields interest you?", multi: true, hint: "Pick as many as you like, or none. We add the fields your resume points to." },
  ];
  const WHERE = Object.fromEntries(Q[0].options), WHERE_SHORT = { mba: "MBA", grad: "Master's or PhD", undergrad: "Undergrad", working: "Working" };
  let wiz = null;
  // "#/you" is the summary once anything is known; "#/you?step=N" opens the wizard at one question to change it
  async function you() {
    const ix = await Atlas.index();
    crumbs([["About you", null]]); showAside(null);
    const { query } = Routes.parseRoute(location.hash);
    const editing = query.step != null;
    if (!editing && !wiz && (state.you || state.resume)) return youSummary(ix);
    if (!wiz) wiz = { step: editing ? Math.max(0, Math.min(Q.length, Number(query.step) || 0)) : 0, back: editing, answers: { ...(state.you || {}), fields: new Set((state.you || {}).fields || []) } };
    const render = () => {
      const n = Q.length + 1, i = wiz.step;
      const steps = `<div class="steps">${Array.from({ length: n }, (_, k) => `<i class="${k <= i ? "done" : ""}"></i>`).join("")}</div>`;
      const after = wiz.back ? "#/you" : "#/explore";
      const nav = (nextLabel, nextAction) => `<div class="row between" style="margin-top:16px"><button type="button" class="btn quiet" id="back">← Back</button><span class="row">${i === Q.length ? `<a class="btn" href="${after}" id="skip">Skip for now</a>` : ""}<button type="button" class="btn primary" id="next">${nextLabel}</button></span></div>`;
      if (i < Q.length) {
        const q = Q[i];
        const opts = q.multi ? ix.groups.map(g => [g.id, g.label]) : q.options;
        const on = id => q.multi ? wiz.answers.fields.has(id) : wiz.answers[q.key] === id;
        page(`${steps}<p class="eyebrow">Question ${i + 1} of ${Q.length}</p><h1>${esc(q.title)}</h1>${q.hint ? `<p class="lead">${esc(q.hint)}</p>` : ""}
          <div class="opts">${opts.map(([id, label]) => `<button type="button" class="opt${on(id) ? " on" : ""}" data-opt="${esc(id)}" aria-pressed="${on(id)}">${esc(label)}</button>`).join("")}</div>${nav("Next →")}`, true);
        main.querySelectorAll("[data-opt]").forEach(b => b.onclick = () => { const id = b.dataset.opt; if (q.multi) { wiz.answers.fields.has(id) ? wiz.answers.fields.delete(id) : wiz.answers.fields.add(id); render(); } else { wiz.answers[q.key] = id; wiz.step++; render(); } });
        $("#next").onclick = () => { if (!q.multi && !wiz.answers[q.key]) return; wiz.step++; render(); };
        $("#back").onclick = () => { if (i === 0) { const b = wiz.back; wiz = null; location.hash = b ? "#/you" : "#/"; } else { wiz.step--; render(); } };
        return;
      }
      page(`${steps}<p class="eyebrow">Last step, optional</p><h1>Add your resume</h1>
        <p class="lead">We read it in your browser to find the roles that fit what you have done. Nothing is uploaded.</p>
        ${resumeForm()}${nav("Show my roles →")}`, true);
      wireResumeForm();
      $("#back").onclick = () => { wiz.step--; render(); };
      $("#skip").onclick = () => saveYou();
      $("#next").onclick = async () => { await takeResume(); saveYou(); location.hash = after; if (location.hash === after) you(); };
    };
    const saveYou = () => { state.you = { where: wiz.answers.where || null, fields: [...wiz.answers.fields] }; store.set("you", state.you); wiz = null; };
    render();
  }
  // What the system knows (owner's choice Y3, B and A): the answers with an edit link each, what the resume gave,
  // and the fields it all points to with the reason for each. "About you" in the top bar opens this, not question 1.
  async function youSummary(ix) {
    const y = state.you || {}, r = state.resume, rg = r ? await rough() : null;
    const { fields, why } = await fitFields();
    const row = (t, m, link) => `<div class="r"><span class="t">${t}</span>${link ? `<a class="n" href="${link[1]}">${link[0]}</a>` : ""}<span class="m">${m}</span></div>`;
    const chosen = (y.fields || []).map(id => (ix.groups.find(g => g.id === id) || {}).label).filter(Boolean);
    const answers = `<div class="list">${row("Where you are", y.where ? esc(WHERE[y.where]) : "Not answered", ["edit", "#/you?step=0"])}${row("Fields you picked", chosen.length ? esc(chosen.join(", ")) : "None yet; your resume decides", ["edit", "#/you?step=1"])}</div>`;
    const span = x => x.start ? ` ${x.start}${x.end && x.end !== x.start ? "–" + String(x.end).slice(2) : ""}` : "";
    const held = rg ? rg.roles.slice(0, 4).map(x => `${esc(x.title)}${span(x)}${x.intern ? " (internship)" : ""}`).join(" · ") : "";
    const closest = rg ? Object.entries(rg.scores).filter(([id, v]) => v > 0 && ix.roles[id]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => ix.roles[id].label) : [];
    const resume = r ? `<div class="list">${row(esc(r.name), `${fmt(r.words)} words, read in your browser; nothing is uploaded`, ["replace", "#/you?step=2"])}${row("Roles with dates", held || "None found. Put each job title and its dates on one line.", null)}${row("Reads closest to", closest.length ? esc(closest.join(", ")) : "No role yet", null)}</div>` : `<p class="small muted" style="margin-top:8px">No resume yet. <a class="link" href="#/you?step=2">Add one</a> and we point you to the fields it fits.</p>`;
    const fieldRows = [...fields].map(id => ix.groups.find(g => g.id === id)).filter(Boolean).sort((a, b) => (b.nOpen || 0) - (a.nOpen || 0)).map(g => row(esc(g.label), esc(why.get(g.id)), ["open", "#/field/" + g.id]));
    page(`<h1>About you</h1><p class="lead">What you told us and what your resume shows. Change any answer; the fields below follow.</p>
      <div class="two"><div><h2>Your answers</h2>${answers}</div><div><h2>Your resume</h2>${resume}</div></div>
      <h2>Fields that fit you, and why</h2>${fieldRows.length ? `<div class="list">${fieldRows.join("")}</div>` : '<p class="small muted">Pick a field or add a resume and they appear here.</p>'}
      <div class="row" style="margin-top:20px"><a class="btn primary" href="#/explore">Explore your fields →</a><button type="button" class="btn quiet" id="start-over">Start over</button></div>`);
    $("#start-over").onclick = () => { state.you = null; state.resume = null; state.rough = null; state.match = null; store.set("you", null); store.set("resume", null); wiz = null; you(); };
  }
  // one line on Explore that says what we know and why each field is there (owner's choices Y3 A and E3)
  function profileStrip(ix, why) {
    const y = state.you || {}, label = id => (ix.groups.find(g => g.id === id) || {}).label || id;
    const chosen = [...why].filter(([, w]) => w === "You picked it").map(([id]) => label(id));
    const fromResume = [...why].filter(([, w]) => w !== "You picked it").map(([id]) => label(id));
    const parts = [y.where ? esc(WHERE_SHORT[y.where] || WHERE[y.where]) : null, chosen.length ? `<b>${esc(join(chosen))}</b> chosen` : null, fromResume.length ? `<b>${esc(join(fromResume))}</b> from your resume` : state.resume ? "no field from your resume yet" : "no resume yet"].filter(Boolean);
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
    const forget = $("#forget"); if (forget) forget.onclick = () => { state.resume = null; state.rough = null; state.match = null; store.set("resume", null); status.textContent = "Forgotten."; };
  }
  // keep what the form holds: a pasted text wins over a dropped file; nothing new keeps what was stored
  async function takeResume() {
    const pasted = ($("#paste") || {}).value || "";
    const r = pasted.trim().length >= 40 ? { text: pasted, name: "pasted text", words: pasted.trim().split(/\s+/).length } : pending && pending.words >= 40 ? pending : null;
    if (!r) return false;
    state.resume = r; store.set("resume", r); pending = null; state.match = null; state.rough = null;
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

  // ---------- 3. explore: fields as circles ----------
  const sizeClass = n => n >= 4000 ? "s4" : n >= 1500 ? "s3" : n >= 600 ? "s2" : "s1";
  async function explore() {
    const ix = await Atlas.index();
    crumbs([["Explore", null]]); showAside(null);
    const focus = new URLSearchParams(location.hash.split("?")[1] || "").get("field");
    if (focus) SkillMap.setMode("map");
    const ff = (state.you || state.resume) ? await fitFields() : null, fit = ff ? ff.fields : null;
    let onlyFit = !!(fit && fit.size);
    const render = () => {
      const all = [...ix.groups].sort((a, b) => (b.nOpen || 0) - (a.nOpen || 0));
      const groups = onlyFit ? all.filter(g => fit.has(g.id)) : all;
      const nRoles = all.reduce((a, g) => a + g.roles.length, 0);
      const chips = fit ? profileStrip(ix, ff.why) : "";
      const asMap = SkillMap.mode() === "map";
      const showing = fit ? `<div class="seg" role="group" aria-label="Showing"><button type="button" class="${onlyFit ? "on" : ""}" aria-pressed="${onlyFit}" id="c-fit">For you</button><button type="button" class="${onlyFit ? "" : "on"}" aria-pressed="${!onlyFit}" id="c-all">All fields</button></div>` : "";
      const view = `<div class="filters explore-row">${showing}${asMap ? '<input class="sm-find" id="sm-find" type="search" placeholder="Find a skill" list="sm-names" aria-label="Find a skill"><datalist id="sm-names"></datalist>' : ""}<div class="seg views" role="group" aria-label="View"><button type="button" class="${asMap ? "" : "on"}" aria-pressed="${!asMap}" id="v-grid" title="Circles">◎</button><button type="button" class="${asMap ? "on" : ""}" aria-pressed="${asMap}" id="v-map" title="Skill map">⊞</button></div></div>`;
      const pg = all.find(g => g.set === "product"), mg = all.find(g => g.set === "mba");
      const dates = tip(`Counts are open postings in the US: business fields refreshed ${mg.generated}${pg.generated ? `, Product scraped ${pg.generated} (${fmt(pg.nWorld)} worldwide)` : ""}.`);
      const inner = g => `${esc(g.label)}<span class="n">${g.nOpen == null ? "loading…" : fmt(g.nOpen) + " open"}</span>`;
      if (asMap) {
        // the fields on the skill map: a field's own skills beside it, the skills every field asks for in the middle
        page(`<h1>Explore the roles</h1>
          <p class="lead">${all.length} fields, ${nRoles || 56} roles. Hover a field to light up the skills that set it apart; click a skill to see who asks for it. ${dates}</p>${chips}${view}
          <div class="sm-stage" id="sm-stage"></div>
          ${fit && fit.size ? '<p class="key">Green: the fields your answers and resume point to.</p>' : ""}`);
        main.firstElementChild.classList.add("wide");
        const SIZE = { s1: 0.66, s2: 0.76, s3: 0.88, s4: 1 };
        SkillMap.stage($("#sm-stage"), { groups: all.map(g => ({ id: g.id, cls: sizeClass(g.nOpen || 0), you: !!(fit && fit.has(g.id)), inner: inner(g) })), sizeOf: g => SIZE[g.cls], fit, onlyFit, focus, aside, showAside });
        SkillMap.names().then(ns => { const dl = $("#sm-names"); if (dl) dl.innerHTML = ns.map(n => `<option value="${esc(n)}">`).join(""); });
        const f = $("#sm-find"); f.onchange = () => SkillMap.find(f.value);
        $("#v-grid").onclick = () => { SkillMap.setMode("grid"); SkillMap.leave(); showAside(null); render(); };
        $("#v-map").onclick = () => { };
        const cf = $("#c-fit"), ca = $("#c-all"); if (cf) { cf.onclick = () => { onlyFit = true; render(); }; ca.onclick = () => { onlyFit = false; render(); }; }
        return;
      }
      page(`<h1>Explore the roles</h1>
        <p class="lead">${all.length} fields, ${nRoles || 56} roles. Pick a field. ${dates}</p>${chips}${view}
        <div class="bubbles">${groups.map(g => `<a class="bubble ${sizeClass(g.nOpen || 0)}${fit && fit.has(g.id) ? " you" : ""}" href="#/field/${esc(g.id)}" data-measure="The size of a field is how many postings are open now: ${g.nOpen == null ? "loading" : fmt(g.nOpen)} in ${esc(g.label)}, ${plural(g.roles.length, "role", "roles")}.">${inner(g)}</a>`).join("")}</div>
        ${onlyFit && !groups.length ? '<p class="small muted" style="text-align:center">No field yet. <a class="link" href="#/you">Tell us more</a>.</p>' : ""}
        ${fit && fit.size && !onlyFit ? '<p class="key" style="text-align:center">Green: the fields your answers and resume point to.</p>' : ""}`);
      $("#v-map").onclick = () => { SkillMap.setMode("map"); render(); };
      $("#v-grid").onclick = () => { };
      const cf = $("#c-fit"), ca = $("#c-all"); if (cf) { cf.onclick = () => { onlyFit = true; render(); }; ca.onclick = () => { onlyFit = false; render(); }; }
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
      const names = (r.definingList.length ? r.definingList : r.asks).slice(0, 2).map(x => (ix.skillById[x.id] || (state.R && state.R.skillById[x.id]) || { name: x.id }).name.toLowerCase());
      return (r.definingList.length ? "Defined by " : "Asks most for ") + names.join(" and ");
    };
    const when = `Open postings in the US${g.generated ? `, ${g.set === "product" ? "scraped" : "refreshed"} ${esc(g.generated)}` : ""}${g.set === "product" ? `; ${fmt(g.nWorld)} worldwide` : ""}.`;
    const rg = state.resume ? await rough() : null;
    const mark = r => !rg ? "" : rg.held.includes(r.id) ? ' · <span style="color:var(--primary)">you held this role</span>' : rg.scores[r.id] >= 0.6 ? ' · <span style="color:var(--primary)">your resume reads close to it</span>' : "";
    const anyMark = rg && roles.some(r => mark(r));
    page(`<h1>${esc(g.label)}</h1>
      <p class="lead">${plural(roles.length, "role", "roles")} · <span data-measure="${when}">${fmt(roles.reduce((a, r) => a + r.nOpen, 0))} open postings</span>. The biggest first.${anyMark ? " Green: a rough read of your resume; open a role for your band of fit." : ""} <a href="#/explore?field=${esc(g.id)}" data-map>See ${esc(g.label)} on the skill map →</a></p>
      <div class="list">${roles.map(r => `<a class="r" href="#/role/${esc(r.id)}"><span class="t">${esc(r.label)}</span><span class="n">${fmt(r.nOpen)} open</span><span class="m">${esc(productLine(g, r, line))}${mark(r)}</span></a>`).join("")}</div>
      <h2>Going to a ${esc(g.label.toLowerCase())} event?</h2>
      <div class="actions">${EVENTS.map(([k, t, d]) => `<a class="action" href="#/field/${esc(g.id)}/event?${k}"><span class="t">${t}</span><span class="d">${d}</span></a>`).join("")}</div>`);
  }
  function productLine(g, r, line) {
    if (g.set !== "product") return line(r);
    return "Asks most for " + r.asks.slice(0, 2).map(x => x.id).map(id => (state.R && state.R.skillById[id] ? state.R.skillById[id].name : nameFromProduct(id)).toLowerCase()).join(" and ");
  }
  let productNames = null;
  function nameFromProduct(id) { return (productNames && productNames[id]) || id; }
  Atlas.product().then(P => { productNames = Object.fromEntries(P.G.skills.map(s => [s.id, s.name])); }).catch(() => { });

  // ---------- 4. a role: the skill grid, the side panel, the postings ----------
  async function loadRole(id) {
    if (state.roleId !== id) { state.R = await Atlas.role(id); state.roleId = id; state.level = defaultLevel(); state.employer = "all"; state.selected = null; state.query = ""; state.shown = PAGE; state.evTab = null; state.match = null; state.sector = new Set(); state.company = new Set(); state.country = new Set(); state.remote = false; state.more = false; state.companyQuery = ""; state.grads = false; state.areaOpen = null; state.areaMore = new Set(); state.tab = "skills"; state.empOpen = new Set(); }
    const ix = await Atlas.index(); return ix.groups.find(x => x.id === state.R.role.group);
  }
  // a student looks at the entry grade first; everyone else at every level
  const defaultLevel = () => (state.you && ["mba", "grad", "undergrad"].includes(state.you.where)) ? "entry" : "all";
  async function roleScreen(id) {
    const g = await loadRole(id); const R = state.R;
    const { query } = Routes.parseRoute(location.hash);   // "#/role/fpa?tab=skills": the fit screen's link lands on the painted list
    if (["skills", "postings", "also"].includes(query.tab)) state.tab = query.tab;
    crumbs([["Explore", "#/explore"], [g.label, "#/field/" + g.id], [R.role.label, null]]);
    renderRole();
  }
  const DIMS = {
    level: j => state.level === "all" || Atlas.stepOf(j) === state.level,
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
  const activeCount = () => (state.employer === "all" ? 0 : 1) + (state.grads ? 1 : 0) + extraCount();
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
      <div class="fgroup"><span class="lbl">Employer</span><input type="search" id="company-q" placeholder="Employer name" aria-label="Employer name" value="${esc(state.companyQuery)}" autocomplete="off"><div class="chips" style="margin:4px 0 0">${picked.map(([v, n]) => `<button type="button" class="chip on" data-company="${esc(v)}">${esc(v)}<span class="n">${fmt(n)}</span></button>`).join("")}${options.map(([v, n]) => `<button type="button" class="chip" data-company="${esc(v)}">${esc(v)}<span class="n">${fmt(n)}</span></button>`).join("")}${!picked.length && !q ? '<span class="small muted">Type a name to pick an employer.</span>' : ""}</div></div>
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
    return `<button type="button" class="srow${on ? " on" : ""}${paint}" data-skill="${esc(s.id)}"><span class="nm">${esc(s.name)}${marks}${s.area ? `<span class="m">${esc(s.area)}</span>` : ""}</span><span class="bar" data-measure="The bar is the share of postings that ask for this skill: ${pct(s.share)} of the ${fmt(n)} postings in this view ask for ${esc(s.name)}."><i style="width:${Math.round(s.share * 100)}%"></i></span></button>`;
  }
  function areaPanel(R, a, n, m, flat) {
    const core = a.skills.filter(s => s.tier === 0), first = core.length && !flat ? core : a.skills, folded = core.length && !flat ? a.skills.filter(s => s.tier > 0) : [];
    const more = state.areaMore.has(a.cluster);
    const rowsOf = (list, labelled) => { let last = -1, h = ""; for (const s of list) { if (labelled && s.tier !== last) { h += `<span class="tierlab">${TIER_LABEL[s.tier]}</span>`; last = s.tier; } h += skillRow(R, s, n, m); } return h; };
    const fold = folded.length ? (more ? rowsOf(folded, true) + `<button type="button" class="linkish link more" data-more="${esc(a.cluster)}">Show fewer</button>` : `<button type="button" class="linkish link more" data-more="${esc(a.cluster)}">Show ${folded.length} more, asked by fewer postings</button>`) : "";
    return `<details class="areabox" data-area="${esc(a.cluster)}"${flat || state.areaOpen.has(a.cluster) ? " open" : ""}><summary><span class="t">${esc(a.label)}</span><span class="n">${plural(a.skills.length, "skill", "skills")}${core.length ? ` · ${core.length} in most postings` : ""}</span></summary><div class="srows">${rowsOf(first, flat || !core.length)}${fold}</div></details>`;
  }
  // the whole list laid out, painted: the course screen shows what a syllabus covers on it
  function flatSkills(R, slice, m) { const { areas, stats } = Atlas.areas(R, slice); return areas.length ? `<div class="areas">${areas.map(a => areaPanel(R, a, stats.n, m, true)).join("")}</div>` : '<p class="notice">No postings match these filters.</p>'; }
  const HELP_KEY = "help-role";
  // the lead says what the data says: what sets the role apart, what leads the asks, which tools (owner's choice X1)
  function roleLead(areas) {
    const core = areas.flatMap(a => a.skills).filter(s => s.tier === 0).sort((a, b) => b.share - a.share);
    if (!core.length) return "Few postings match this view; widen the filters to see what the role asks for.";
    const def = core.filter(s => s.defining).slice(0, 2), top = core.filter(s => !s.defining && s.cluster !== "tools" && s.cluster !== "domain").slice(0, 3), tools = core.filter(s => s.cluster === "tools").slice(0, 2);
    const names = xs => xs.map(s => s.name.replace(/\s*\(.*?\)/g, ""));   // "Office suite (Excel, …)" reads as "Office suite" here
    const parts = [def.length ? `${join(names(def))} set${def.length === 1 ? "s" : ""} this role apart` : "", top.length ? `${join(names(top))} lead the asks` : "", tools.length ? `${join(names(tools))} ${tools.length === 1 ? "is the tool" : "are the tools"}` : ""].filter(Boolean);
    return cap(parts.join("; ")) + ".";
  }
  const allExpanded = areas => areas.every(a => state.areaOpen.has(a.cluster) && (state.areaMore.has(a.cluster) || !a.skills.some(s => s.tier > 0) || !a.skills.some(s => s.tier === 0)));
  function renderRole() {
    const R = state.R, role = R.role, slice = sliceOf();
    const { areas, stats } = Atlas.areas(R, slice);
    if (state.areaOpen == null) state.areaOpen = new Set(areas.length ? [areas[0].cluster] : []);
    const open = slice.filter(j => j.open);
    const nClosed = R.jobs.length - R.jobs.filter(j => j.open).length;
    const countBy = (jobs, fn) => { const m = {}; for (const j of jobs) { const k = fn(j); if (k != null) m[k] = (m[k] || 0) + 1; } return m; };
    const where = R.country ? ` · ${esc(R.country)}` : "";
    const facts = R.set === "product" ? `<span data-measure="${fmt(role.nOpen)} open postings in the US; ${fmt(role.nWorld)} worldwide, and the skills below read all of them.">${fmt(role.nOpen)} open postings in the US</span> · ${plural(role.nCompanies, "employer", "employers")}` : `<span data-measure="${fmt(open.length)} open now${nClosed ? `; ${fmt(nClosed)} recently closed postings are counted in the shares too, so the skills reflect a year of hiring, not one week` : ""}.">${fmt(R.jobs.filter(j => j.open).length)} open postings</span> · ${plural(role.nCompanies, "employer", "employers")}${where}`;
    const lead = roleLead(areas);
    const fit = state.match && state.match.roleId === role.id ? state.match : null, m = fit && state.paintOn ? fit : null;
    const topEmployers = Object.entries(countBy(open, j => j.company)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
    const nEntry = open.filter(j => Atlas.stepOf(j) === "entry").length, nGrads = open.filter(j => j.entry || j.intern).length;
    const glance = `${lead} Entry grade: ${R.stepLabels.entry}, ${fmt(nEntry)} open at that grade${R.set === "mba" && nGrads ? `, ${fmt(nGrads)} for graduates and interns` : ""}.${topEmployers.length ? ` Top employers now: ${join(topEmployers)}.` : ""}`;
    const nAct = activeCount();
    const seg = `<div class="seg" role="group" aria-label="Level"><button type="button" class="${state.level === "all" ? "on" : ""}" aria-pressed="${state.level === "all"}" data-level="all">All levels</button>${Atlas.STEPS.map(s => `<button type="button" class="${state.level === s ? "on" : ""}" aria-pressed="${state.level === s}" data-level="${s}">${esc(R.stepLabels[s])}</button>`).join("")}</div>`;
    const filters = `<div class="filters">${seg}<button type="button" class="btn filters-btn${nAct ? " on" : ""}" id="more-filters" aria-expanded="${state.more}">Filters${nAct ? `<span class="n">${nAct}</span>` : ""}</button>${!state.more ? activeChips(R) : ""}</div>${state.more ? drawerHtml(R, countBy) : ""}`;
    const paintToggle = fit ? `<label class="small muted paint"><input type="checkbox" id="paint-fit"${state.paintOn ? " checked" : ""}> Show my fit</label>` : "";
    const expanded = allExpanded(areas);
    const help = store.get(HELP_KEY) ? "" : `<div class="help" id="help-role"><span><b>How to read this.</b> Skills are grouped by area and ranked by how many postings in this view ask for them; the bar is that share. ◆ marks what sets this role apart; ↗ means asked more at senior levels. Open a skill for what it means and how postings say it.</span><button type="button" class="linkish link" id="help-close">Don't show again</button></div>`;
    const listHead = `${help}<div class="listhead"><h2>What the postings ask for ${tip("Skills are grouped by area and ranked by how many of the postings in this view ask for them. Open a skill to see what it means, what it breaks down into and how postings say it.")}</h2><span class="small muted">${plural(stats.n, "posting", "postings")} in this view</span>${paintToggle}${areas.length ? `<button type="button" class="linkish link" id="expand-all">${expanded ? "Collapse all" : "Expand all"}</button>` : ""}</div>`;
    const skillList = areas.length ? `<div class="areas">${areas.map(a => areaPanel(R, a, stats.n, m)).join("")}</div>
      <p class="key">${role.definingList.length ? "◆ sets this role apart from other roles · " : ""}↗ asked more as you move up${m ? " · green: your resume shows it · amber: a gap" : ""}</p>` : '<p class="notice">No postings match these filters.</p>';

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
    const TABS = [["skills", "Skills", null], ["postings", "Open postings", open.length], ...(also ? [["also", "Also asked for", null]] : [])];
    if (!TABS.some(t => t[0] === state.tab)) state.tab = "skills";
    const tabs = `<div class="tabs" role="tablist">${TABS.map(([k, l, n]) => `<button type="button" role="tab" class="${state.tab === k ? "on" : ""}" aria-selected="${state.tab === k}" data-tab="${k}">${l}${n != null ? `<span class="n">${fmt(n)}</span>` : ""}</button>`).join("")}</div>`;
    const body = state.tab === "postings" ? postings : state.tab === "also" ? also : listHead + skillList;
    page(`<h1>${esc(role.label)} ${tip(glance)}</h1><p class="facts">${facts}</p>
      <p class="lead">${lead}</p>
      <div class="row acts"><a class="btn primary" href="#/role/${esc(role.id)}/fit">How do I fit?</a><a class="btn quiet" href="#/role/${esc(role.id)}/course">Check a course</a><a class="btn quiet" href="#/field/${esc(role.group)}/event">Prepare for an event</a></div>
      ${filters}${tabs}${body}`);
    main.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { state.tab = b.dataset.tab; keepScroll(renderRole); });
    const pf = $("#paint-fit"); if (pf) pf.onchange = () => { state.paintOn = pf.checked; keepScroll(renderRole); };
    main.querySelectorAll("details.empbox").forEach(d => d.ontoggle = () => { d.open ? state.empOpen.add(d.dataset.empOpen) : state.empOpen.delete(d.dataset.empOpen); });
    main.querySelectorAll("[data-level]").forEach(b => b.onclick = () => { state.level = b.dataset.level; state.shown = PAGE; keepScroll(renderRole); });
    main.querySelectorAll("[data-emp]").forEach(b => b.onclick = () => { state.employer = b.dataset.emp; state.shown = PAGE; keepScroll(renderRole); });
    $("#more-filters").onclick = () => { state.more = !state.more; keepScroll(renderRole); };
    const closeDrawer = () => { state.more = false; keepScroll(renderRole); };
    for (const id of ["#drawer-close", "#drawer-back", "#drawer-done"]) { const el = $(id); if (el) el.onclick = closeDrawer; }
    main.querySelectorAll("details.areabox").forEach(d => d.ontoggle = () => { d.open ? state.areaOpen.add(d.dataset.area) : state.areaOpen.delete(d.dataset.area); const b = $("#expand-all"); if (b) b.textContent = allExpanded(areas) ? "Collapse all" : "Expand all"; });
    main.querySelectorAll("[data-more]").forEach(b => b.onclick = () => { toggle(state.areaMore, b.dataset.more); keepScroll(renderRole); });
    const hc = $("#help-close"); if (hc) hc.onclick = () => { store.set(HELP_KEY, true); keepScroll(renderRole); };
    main.querySelectorAll("details[data-k]").forEach(d => d.ontoggle = () => { d.open ? state.open.add(d.dataset.k) : state.open.delete(d.dataset.k); });
    const xa = $("#expand-all"); if (xa) xa.onclick = () => { const all = allExpanded(areas); state.areaOpen = new Set(all ? [] : areas.map(a => a.cluster)); state.areaMore = new Set(all ? [] : areas.map(a => a.cluster)); keepScroll(renderRole); };
    const gr = $("#grads"); if (gr) gr.onclick = () => { state.grads = !state.grads; state.shown = PAGE; keepScroll(renderRole); };
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
    renderAside();
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
    if (!sel) { showAside(null); return; }   // nothing selected, no panel (owner's choice R8, 2026-10-19)
    if (sel.kind === "posting") { showAside(postingCard(R, R.jobs.find(j => j.id === sel.id))); wire(); return; }
    const ev = evCache[sel.id];
    showAside(skillCard(R, R.skillById[sel.id], sliceOf(), ev)); wire();
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
  const quoteHtml = q => `<blockquote class="quote">“${esc(q.text.length > 260 ? q.text.slice(0, 257) + "…" : q.text)}”<span class="src">${esc(q.company)} · <a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.title)}</a></span></blockquote>`;
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
    const share = `<p class="small">${cap(w)} in this view ${/posting$/.test(w) ? "asks" : "ask"} for it. ${tip(`${pct(st.share(s.id))} of the ${fmt(st.n)} postings in this view ask for ${s.name}; ${pct(s.share)} of postings across ${R.set === "mba" ? "all 50 roles" : "all product roles"} do.`)}</p>`;
    const here = state.level === "all" ? null : { entry: "associate", mid: "mid", senior: "senior", lead: "lead" }[state.level];
    const ladder = ladderHtml(R, s, here);
    const bs = buildSteps(s, R.role.ladder, true), ladName = k => (((R.ladders || {})[k] || {}).label || k).toLowerCase();
    const build = bs.steps.length ? (bs.ind && bs.ind !== R.role.ladder ? `<p class="small muted">Shown from the ${esc(ladName(bs.ind))} ladder; this skill has none yet for ${esc(ladName(R.role.ladder))}.</p>` : "") + `<ul class="plain">${bs.steps.map(b => `<li>${stepHtml(b)}</li>`).join("")}</ul>` : `<p class="small muted">${R.role.ladder === "consulting" && s.build && !Array.isArray(s.build) ? "Build steps for consulting roles are on hold until a source is agreed." : "Build steps for this skill are not written yet."}</p>`;
    const signals = (s.signals || []).length ? `<p class="small muted" style="margin:10px 0 0">Resume lines that show it</p><ul class="plain">${s.signals.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : "";
    const withSkill = slice.filter(j => j.open && j.skills.includes(s.id)).slice(0, 6);
    const postings = withSkill.length ? `<div class="list">${withSkill.map(j => `<button type="button" class="r" data-job="${j.id}"><span class="t">${esc(j.title)}</span><span class="n">${esc(levelLabel(R, j))}</span><span class="m">${esc(j.company)}</span></button>`).join("")}</div>` : `<p class="small muted">No open posting in this view asks for it.</p>`;
    const visible = new Set(Atlas.grid(R, slice).rows.flat(2).map(x => x.id));
    const related = R.edges.filter(e => (e.source === s.id || e.target === s.id)).map(e => ({ id: e.source === s.id ? e.target : e.source, w: e.jaccard })).filter(x => visible.has(x.id) && x.id !== s.id).sort((a, b) => b.w - a.w).slice(0, 6);
    const def = R.role.defining.has(s.id) ? ` · <span class="mark" data-measure="◆ sets this role apart: postings of this role ask for it far more often than postings of other roles do.">defines this role ◆</span>` : "";
    const bodies = {
      postings: `<h3>How postings say it</h3>${evidenceHtml(ev)}<h3>Postings that ask for it</h3>${postings}`,
      ladder: `<h3>At each level</h3>${ladder}`,
      build: `<h3>How to build it</h3>${build}${signals}`,
      related: `<h3>Often asked for together</h3>${related.length ? `<div class="tags">${related.map(r => `<button type="button" class="tag" data-skill="${esc(r.id)}">${esc(R.skillById[r.id].name)}</button>`).join("")}</div>` : '<p class="small muted">No skill is asked for together with it often enough to name.</p>'}`,
    };
    const tabs = `<div class="tabs card-tabs" role="tablist">${CTABS.map(([k, l]) => `<button type="button" role="tab" class="${state.cardTab === k ? "on" : ""}" aria-selected="${state.cardTab === k}" data-ctab="${k}">${l}</button>`).join("")}</div>`;
    return `<button type="button" class="close" aria-label="Close">×</button><div class="card">
      <p class="eyebrow">${esc(R.clusters[s.cluster].label)}${def}</p><h2>${esc(s.name)}</h2>
      ${s.what ? `<p class="what">${esc(s.what)}</p>` : ""}
      ${share}${subs}
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
      <p><a class="link" href="${esc(j.url)}" target="_blank" rel="noopener">Open the posting ↗</a></p>
      <h3>${plural(j.skills.filter(k => R.skillById[k] && R.skillById[k].cluster !== "credentials").length, "skill asked for", "skills asked for")}</h3>
      ${Object.entries(byArea).sort((a, b) => b[1].length - a[1].length).map(([c, ss]) => `<p class="small muted" style="margin:8px 0 2px">${esc(R.clusters[c].label)}</p><div class="tags">${ss.map(s => `<button type="button" class="tag" data-skill="${esc(s.id)}">${esc(s.name)}</button>`).join("")}</div>`).join("")}
      ${subNames.length ? `<h3>Specific asks in this posting</h3><div class="tags">${subNames.map(x => `<button type="button" class="tag" data-skill="${esc(x.sid)}">${esc(x.name)}</button>`).join("")}</div>` : ""}
    </div>`;
  }

  // ---------- 5. your fit: the band, what to evidence next, what you show ----------
  const BANDS = [["different", "Different field so far"], ["related", "Related background"], ["in_range", "In range for this role"], ["strong", "Reads like people in the role"]];
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
    const slice = sliceOf(level);
    const { M, bands, group } = await Atlas.matcher(R);
    const extra = [state.grads ? "graduates and interns" : null, state.employer !== "all" ? (R.employerTypes.find(e => e[0] === state.employer) || [])[1] : null, ...state.sector, ...state.company, ...state.country, state.remote ? "remote" : null].filter(Boolean);
    const label = `${role.label}${level === "all" ? "" : " · " + R.stepLabels[level]}${extra.length ? " · " + extra.join(", ") : ""}`;
    const r = M.match(state.resume.text, { jobs: slice, familyJobs: R.jobs, label }, { level: LEVEL_OPT[level], ladder: R.role.ladder });
    const rows = r.rows, by = st => rows.filter(x => x.status === st).sort((a, b) => (a.tier === b.tier ? b.w - a.w : a.tier === "core" ? -1 : b.tier === "core" ? 1 : a.tier === "common" ? -1 : 1));
    const evid = by("evidenced"), trans = by("transferable"), thin = by("thin"), presumed = by("presumed"), gaps = by("gap").filter(x => x.tier !== "diff");
    const required = new Set(); for (const x of rows) { if (x.tier === "diff") continue; if (x.slot === "__ai") r.ai.forEach(k => required.add(k)); else if (x.slot !== "__domain") required.add(x.id); }
    state.match = { roleId: role.id, matched: new Set([...evid, ...trans].map(x => x.id).filter(k => R.skillById[k])), required, presumed: new Set(presumed.map(x => x.id)), subs: r.subs };
    const band = Matcher.bandOf(r.overall, bands, group), bandNext = Matcher.bandOf(r.whatIf, bands, group);
    const bandName = k => (BANDS.find(b => b[0] === k) || [])[1];
    const core = rows.filter(x => x.tier === "core"), coreHave = core.filter(x => x.status === "evidenced" || x.status === "transferable").length;
    const field = g.label.toLowerCase();
    const p = r.profile;
    const scale = band ? `<div class="band">${BANDS.map(([k], i) => `<i class="${k === band ? "on" : i < BANDS.findIndex(b => b[0] === band) ? "past" : ""}"></i>`).join("")}</div><div class="bandl">${BANDS.map(([k, l]) => `<span class="${k === band ? "on" : ""}">${l}</span>`).join("")}</div><div class="verdict">${bandName(band)} ${tip("Bands come from how 300 sample resumes of people in and outside the role score. There is no pass mark; a band says how your resume reads next to theirs.")}</div>` : `<div class="notice"><b>We cannot yet say how you fit ${esc(role.label)}.</b> ${esc((bands.no_bands || {})[group] ? "Our sample of resumes for this group of roles is too small to set bands of fit." : "This group of roles has no bands of fit yet.")} Below is what you show and what is missing, without a verdict.</div>`;
    const st = r.standing;
    const standing = st ? `<p class="small">You held this role ${st.above ? `above this level (${esc(Matcher.LADDER_LABEL[st.level])}, ${fmtYears(st.years)})` : `at this level for ${fmtYears(st.years)}`}${st.employers.length ? `, and we hold ${esc(st.employers[0])}'s own postings` : ""}. ${st.presumed ? `<b>${st.presumed}</b> ${st.presumed === 1 ? "requirement is" : "requirements are"} presumed from that; your resume does not show ${st.presumed === 1 ? "it" : "them"}.` : ""}</p>` : "";
    const unread = r.parsed.roles.length === 0 && r.parsed.lines >= 15 ? `<div class="notice"><b>We found no jobs with dates in this text.</b> Roles and years are not counted. Put each job title and its dates on one line, for example "Analyst, Acme, 2021 – 2024".</div>` : "";
    const placeholder = r.parsed.placeholderDates && r.parsed.roles.some(x => x.placeholder) ? `<div class="notice"><b>Some dates in this text are placeholders ("20XX").</b> We read those jobs, but we cannot count their years.</div>` : "";
    // the two slots that stand for a group of skills get plain words: which industry, which kind of AI work
    const slotWhy = x => x.slot === "__domain" ? ` Name an industry you have worked in. These postings are in: ${r.industries.slice(0, 4).map(d => esc(d.name)).join(", ")}. One is enough.` : x.slot === "__ai" ? ` Show one line of AI work: ${r.ai.map(k => esc(R.skillById[k] ? R.skillById[k].name : k)).join(", ")}.` : "";
    const next = gaps.slice(0, 3).map(x => `<li><b>${esc(x.slotName)}</b><span class="why">Asked in ${pct(x.w)} of postings${x.tier === "core" ? ", by most" : ""}.${slotWhy(x)}${x.signals && x.signals[0] ? ` A line that would show it: “${esc(x.signals[0])}”` : ""}${x.build && x.build[0] ? ` ${stepHtml(x.build[0])}` : ""}</span></li>`).join("");
    const whatIf = gaps.length && bandNext && bandNext !== band ? `<p class="small muted">Evidence ${gaps.slice(0, 3).length === 1 ? "that one" : `those ${gaps.slice(0, 3).length === 3 ? "three" : "two"}`} and your resume reads as “${bandName(bandNext)}”.</p>` : "";
    const tag = (x, cls) => R.skillById[x.id] ? `<button type="button" class="tag ${cls}" data-skill="${esc(x.id)}">${esc(x.slotName)}${cls === "amber" ? ' <span class="subtle">(said in other words)</span>' : ""}</button>` : `<span class="tag ${cls}">${esc(x.slotName)}</span>`;
    const yoeAsk = r.creds.filter(c => c.id.startsWith("yoe_")).sort((a, b) => b.w - a.w)[0];
    const creds = r.creds.filter(c => !c.id.startsWith("yoe_"));
    if (yoeAsk) creds.unshift({ name: `${yoeAsk.name.replace(" experience", "")} experience asked (you: ${fmtYears(p.years)})`, w: yoeAsk.w, have: yoeAsk.have });
    const credLine = creds.length ? `<p class="small">${creds.map(c => `<span class="${c.have ? "" : "muted"}" style="${c.have ? "color:var(--primary)" : ""}">${c.have ? "✓" : "○"} ${esc(c.name)}</span>`).join(" · ")}</p>` : "";
    const indLine = r.industries.length ? `<p class="small muted">Industries hiring for this: ${r.industries.slice(0, 8).map(d => `<span style="${d.have ? "color:var(--primary)" : ""}">${d.have ? "✓ " : ""}${esc(d.name)} ${pct(d.w)}</span>`).join(" · ")}. One industry is enough; the others are context, not gaps.</p>` : "";
    const sayIt = trans.length ? disc("sayit", `Say it in ${esc(field)} words (${trans.length})`, `<ul class="plain">${trans.slice(0, 5).map(x => `<li><b>${esc(x.slotName)}</b>${x.lines[0] ? `<br>“${esc(x.lines[0].text.slice(0, 160))}”` : ""}${x.signals && x.signals[0] ? `<br>Postings say it like: <b>${esc(x.signals[0])}</b>` : ""}</li>`).join("")}</ul>`) : "";
    const thinNamed = evid.filter(x => !x.depth);
    const thinDisc = thinNamed.length ? disc("thin", `Shown, but without specifics (${thinNamed.length})`, `<p class="small muted">You show these, but not with the specifics or outcomes postings ask about.</p><ul class="plain">${thinNamed.slice(0, 5).map(x => `<li>${esc(x.name)}${(R.subs[x.id] || []).filter(s => !r.subs.has(s.id)).length ? ` — add: ${(R.subs[x.id] || []).filter(s => !r.subs.has(s.id)).slice(0, 3).map(s => esc(s.name)).join(" · ")}` : ""}</li>`).join("")}</ul>`) : "";
    const unmapped = r.unmapped.length ? disc("unmapped", `${r.unmapped.length} lines we could not read as a skill`, `<ul class="plain">${r.unmapped.map(t => `<li class="muted">${esc(t)}</li>`).join("")}</ul>`) : "";
    const showTab = `<div class="tags">${evid.map(x => tag(x, "good")).join("")}${trans.map(x => tag(x, "amber")).join("") || (evid.length ? "" : '<span class="small muted">Nothing yet.</span>')}</div>
      ${presumed.length ? `<h3>Presumed from roles you held</h3><div class="tags">${presumed.map(x => tag(x, "thin")).join("")}</div><p class="small muted">People who hold this role do these. Your resume does not show them, so they earn part credit.</p>` : ""}`;
    const gapTab = `${gaps.length ? `<div class="tags">${gaps.map(x => tag(x, "bad")).join("")}</div>` : '<p class="small muted">Nothing among the skills most postings ask for.</p>'}
      ${thin.length ? `<h3>Named, not shown</h3><div class="tags">${thin.map(x => tag(x, "thin")).join("")}</div><p class="small muted">Listed as a word, but no work, project or course line shows it.</p>` : ""}`;
    const detailTab = `${sayIt}${thinDisc}<h3>Credentials and industries</h3>${credLine + indLine || '<p class="small muted">None asked for in this view.</p>'}${unmapped}`;
    const FTABS = [["show", "You show", evid.length + trans.length], ["gaps", "Still to show", gaps.length + thin.length], ["details", "Details", null]];
    const fitTabs = `<div class="tabs" role="tablist">${FTABS.map(([k, l, n]) => `<button type="button" role="tab" class="${state.fitTab === k ? "on" : ""}" aria-selected="${state.fitTab === k}" data-ftab="${k}">${l}${n != null ? `<span class="n">${fmt(n)}</span>` : ""}</button>`).join("")}</div>`;
    const fitBody = state.fitTab === "gaps" ? gapTab : state.fitTab === "details" ? detailTab : showTab;
    const ctx = `<div class="row between fit-top"><p class="eyebrow">Your fit · ${esc(role.label)}${extra.length ? " · " + esc(extra.join(", ")) : ""}</p><span class="small muted ctx"><select id="fit-level" aria-label="Level">${["all", ...Atlas.STEPS].map(s => `<option value="${s}"${level === s ? " selected" : ""}>${s === "all" ? "All levels" : esc(R.stepLabels[s])}</option>`).join("")}</select> · ${esc(state.resume.name)} · <a href="#/role/${esc(role.id)}/fit" id="change">change</a></span></div>`;
    page(`${ctx}${unread}${placeholder}${scale}
      <p class="lead">${PERSONA[p.persona](p, field)} You show <b>${coreHave} of ${core.length}</b> skills that most ${esc(role.label)} postings ask for.</p>${standing}
      ${gaps.length ? `<h2>Evidence next</h2><ol class="next">${next}</ol>${whatIf}` : `<h2>Nothing important missing</h2><p class="small muted">You show every skill that most postings ask for.</p>`}
      ${fitTabs}${fitBody}
      <a class="card-link" href="#/role/${esc(role.id)}?tab=skills"><span class="t">See it on the skills list →</span><span class="d">Opens ${esc(role.label)} with your fit marked on every skill.</span></a>`);
    main.querySelectorAll("[data-ftab]").forEach(b => b.onclick = () => { state.fitTab = b.dataset.ftab; keepScroll(() => fitScreen(id)); });
    $("#fit-level").onchange = e => { state.fitLevel = e.target.value; state.level = e.target.value; fitScreen(id); };
    main.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }, true));
    main.querySelectorAll("details[data-k]").forEach(d => d.ontoggle = () => { d.open ? state.open.add(d.dataset.k) : state.open.delete(d.dataset.k); });
    $("#change").onclick = e => { e.preventDefault(); state.resume = null; fitScreen(id); };
    renderAside();
  }

  // ---------- 6. check a course: which of the role's skills a syllabus teaches ----------
  async function courseScreen(id) {
    const g = await loadRole(id); const R = state.R, role = R.role;
    crumbs([["Explore", "#/explore"], [g.label, "#/field/" + g.id], [role.label, "#/role/" + role.id], ["Check a course", null]]);
    if (!state.course) { const saved = store.get("course"); if (saved) state.course = { ...saved, found: new Set(saved.found) }; }
    const c = state.course && state.course.roleId === role.id ? state.course : null;
    const form = `<div class="drop" id="drop"><p><b>Drop a syllabus (PDF, DOCX or TXT)</b> or <label class="link" for="file">choose a file</label></p><input type="file" id="file" accept=".pdf,.docx,.txt,.md" hidden><p class="small muted" id="file-status">${c ? `Read: ${esc(c.name)}.` : ""}</p></div>
      <p class="small muted">Or paste the course description, the list of topics or the week-by-week plan:</p><textarea id="paste" rows="6" aria-label="Course text" placeholder="FIN 620 Corporate Financial Planning. Topics: budgeting cycles, rolling forecasts, variance analysis…">${c ? esc(c.text) : ""}</textarea>
      <div class="row" style="margin:12px 0 4px"><button type="button" class="btn primary" id="go">Read the course →</button><span class="small muted">Nothing is uploaded.</span></div>`;
    let result = "";
    if (c) {
      const slice = sliceOf(); const { rows } = Atlas.grid(R, slice);
      const inGrid = rows.flat(2);
      const taught = inGrid.filter(x => c.found.has(x.id)), core = rows[0].flat(), coreTaught = core.filter(x => c.found.has(x.id)), notTaught = core.filter(x => !c.found.has(x.id));
      const m = state.match && state.match.roleId === role.id ? state.match : null;
      const gapsCovered = m ? taught.filter(x => m.required.has(x.id) && !m.matched.has(x.id)) : [];
      state.paint = { roleId: role.id, matched: new Set(taught.map(x => x.id)), required: new Set(core.map(x => x.id)), presumed: new Set(), subs: new Set(Object.values(c.ev || {}).flatMap(e => [...(e.subs || [])])) };
      const tagOf = x => `<button type="button" class="tag good" data-skill="${esc(x.id)}">${esc(x.name)}${x.defining ? " ◆" : ""} <span class="subtle">${pct(x.share)}</span></button>`;
      result = taught.length ? `<h2>This course teaches</h2><div class="tags">${taught.map(tagOf).join("")}</div>
        <p class="small muted">${coreTaught.length} of the ${core.length} skills that most ${esc(role.label)} postings ask for.${gapsCovered.length ? ` It covers ${gapsCovered.length === 1 ? "one" : gapsCovered.length} of your gaps: ${gapsCovered.map(x => esc(x.name)).join(", ")}.` : m ? " It covers none of your gaps for this role." : ` <a href="#/role/${esc(role.id)}/fit">Check your fit</a> to see which of your gaps it covers.`} The share is how many postings ask for the skill.</p>
        ${notTaught.length ? `<h2>It does not cover</h2><div class="tags">${notTaught.map(x => `<button type="button" class="tag bad" data-skill="${esc(x.id)}">${esc(x.name)}${x.defining ? " ◆" : ""}</button>`).join("")}</div><p class="small muted">Skills most postings ask for that the text does not name. A course can teach a skill without naming it the way postings do; open a skill to see how postings say it.</p>` : ""}
        <h2>On the skills list</h2><p class="small muted">Green: the course names it. Amber: most postings ask for it and the course does not name it.</p>${flatSkills(R, slice, state.paint)}` : `<div class="notice"><b>We found none of this role's skills in that text.</b> ${c.lines < 3 ? "The text is very short; paste the topics or the week-by-week plan." : "Paste the list of topics, or check that the text is a course description."}</div>`;
    }
    page(`<p class="eyebrow">Check a course · ${esc(role.label)}</p><h1>Check a course</h1><p class="lead">Drop a syllabus or paste the course description. We read it in your browser against the skills ${esc(role.label)} postings ask for.</p>${form}${result}<p class="small muted" style="margin-top:12px"><a href="#/role/${esc(role.id)}">← Back to ${esc(role.label)}</a></p>`);
    wireFileDrop(async text => { const r = await Atlas.readCourse(text.text); state.course = { roleId: role.id, name: text.name, text: text.text, found: r.found, ev: r.ev, lines: r.lines }; store.set("course", { roleId: role.id, name: text.name, text: text.text, found: [...r.found], ev: {}, lines: r.lines }); courseScreen(id); });
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
      body = `<h2>Role by role: what to bring up</h2><p class="small muted">${rg ? "For each role, the skills most of its postings ask for that your resume shows (also the ones said in another field's words), with the line that shows it, and what they may ask about that it does not show." : `<a href="#/you">Add your resume</a> and we match your lines to each role. Without it, here is what most postings of each role ask for.`}</p>
        <div id="roundtable">${roles.map(r => `<h3><a href="#/role/${esc(r.id)}">${esc(r.label)}</a> <span class="muted small">${fmt(r.nOpen)} open</span></h3>${rg ? '<p class="small muted">Reading your resume against this role…</p>' : `<p class="small muted">Most postings ask for: ${coreOf(r).filter(id => !GENERIC.has(id)).slice(0, 4).map(id => esc(nameOf(id))).join(", ")}.</p>`}`).join("")}</div>`;
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
      el.innerHTML = roles.map(r => { const m = res[r.id]; const rows = m.rows.filter(x => x.tier !== "diff");
        const have = rows.filter(x => (x.status === "evidenced" || x.status === "transferable") && !GENERIC.has(x.slot)).sort((a, b) => b.w - a.w).slice(0, 3);
        const ask = rows.filter(x => (x.status === "gap" || x.status === "thin") && !GENERIC.has(x.slot)).sort((a, b) => b.w - a.w).slice(0, 2);
        const askName = x => x.slot === "__domain" ? "the industry you know" : x.slot === "__ai" ? "AI in your work" : x.slotName;
        const line = x => x.lines[0] ? `<span class="small muted">“${esc(x.lines[0].text.length > 160 ? x.lines[0].text.slice(0, 157) + "…" : x.lines[0].text)}”${x.status === "transferable" && x.signals[0] ? ` Say it like: <b>${esc(x.signals[0])}</b>` : ""}</span>` : "";
        return `<h3><a href="#/role/${esc(r.id)}">${esc(r.label)}</a> <span class="muted small">${fmt(r.nOpen)} open</span></h3>${have.length ? `<ul class="plain">${have.map(x => `<li><b>${esc(x.name)}</b> <span class="subtle">${pct(x.w)}</span> ${line(x)}</li>`).join("")}</ul>` : '<p class="small muted">Your resume shows none of the skills most of these postings ask for.</p>'}${ask.length ? `<p class="small muted">They may ask about: ${ask.map(x => esc(askName(x))).join(", ")}.</p>` : ""}`; }).join("");
    }).catch(e => { const el = $("#roundtable"); if (el) el.insertAdjacentHTML("afterbegin", '<p class="notice">Could not read your resume against these roles.</p>'); console.error(e); });
    if (kind === "networking") Atlas.fieldJobs(g.id).then(jobs => { if (!location.hash.startsWith(`#/field/${g.id}/event`)) return; const by = {}; for (const j of jobs) if (j.open) { const e = by[j.company] ||= { n: 0, roles: new Set() }; e.n++; e.roles.add(j.family); } const top = Object.entries(by).sort((a, b) => b[1].n - a[1].n).slice(0, 12); const el = $("#employers"); if (el) el.innerHTML = `<div class="list">${top.map(([c, e]) => `<div class="r"><span class="t">${esc(c)}</span><span class="n">${fmt(e.n)} open</span><span class="m">${[...e.roles].map(f => esc((ix.roles[f] || {}).label || f)).slice(0, 4).join(", ")}</span></div>`).join("")}</div>`; }).catch(e => { const el = $("#employers"); if (el) el.innerHTML = `<p class="small muted">Could not load the postings.</p>`; console.error(e); });
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
      <h3>Product roles</h3>${productPart}</div>`, true);
    render();
    Atlas.product().then(P => { const G = P.G; productPart = `<p class="small">${fmt(G.meta.n_jobs)} open postings worldwide (${fmt(G.jobs.filter(j => j.country === M.meta.country).length)} in the US, the count Explore shows) for 6 product role families at ${fmt(G.meta.n_companies)} companies, refreshed ${niceDate(G.meta.generated)}.</p>${disc("about-top-product", "Companies with the most postings", `<p>${top(G.meta.companies, 15)}</p>`)}`; if (location.hash.startsWith("#/about")) render(); }).catch(console.error);
  }

  // the footer line: how many postings, and when they were last refreshed
  Atlas.index().then(ix => { const f = document.getElementById("foot-note"); if (f) f.textContent = `Built from ${fmt(ix.M.meta.n_open)} live job postings, refreshed weekly. Last refresh ${niceDate(ix.M.meta.generated)}.`; }).catch(console.error);

  route();
})();
