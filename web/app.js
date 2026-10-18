/* Role atlas — the screens. Routes (hash): #/ start · #/you (next step) · #/explore · #/field/<group> · #/role/<role> ·
   #/about. Data comes from atlas.js; the side panel (owner's choice 8B) shows a skill or a posting. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = v => Math.round(v * 100) + "%";
  const fmt = n => Number(n).toLocaleString();
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
  const inWords = v => v >= 0.9 ? "nearly every posting" : v >= 0.66 ? "about 2 in 3 postings" : v >= 0.45 ? "about half of postings" : v >= 0.3 ? "about 1 in 3 postings" : v >= 0.2 ? "about 1 in 4 postings" : v >= 0.12 ? "about 1 in 7 postings" : "fewer than 1 in 8 postings";
  const EV_GROUPS = [["early", "Entry and mid-level"], ["senior", "Senior"], ["staff", "Lead / principal"], ["lead", "Director and up"]];
  const LADDER_KEYS = [["associate", "Entry"], ["mid", "Mid-level"], ["senior", "Senior"], ["lead", "Lead"]];
  const STEP_TO_EV = { entry: "early", mid: "early", senior: "senior", lead: "staff" };

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

  // ---------- router ----------
  const state = { roleId: null, R: null, level: "all", employer: "all", selected: null, query: "", shown: 40, evTab: null, open: new Set(), you: null, resume: null, rough: null, match: null, fitLevel: null };
  // what the person told us and the resume they dropped stay in this browser only (nothing is uploaded)
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  state.you = store.get("you"); state.resume = store.get("resume");
  const LEVEL_OPT = { entry: "associate", mid: "mid", senior: "senior", lead: "lead" };
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const [a, b, c] = parts;
    const go = { "": start, you: you, explore: explore, field: () => field(b), role: () => c === "fit" ? fitScreen(b) : roleScreen(b), about: about }[a || ""];
    (go || start)().catch(fail);
  }
  window.addEventListener("hashchange", route);

  // ---------- 1. first visit ----------
  async function start() {
    crumbs([]); showAside(null);
    page(`<h1>See what jobs ask for, and how you fit</h1>
      <p class="lead">Built from live job postings for 56 kinds of roles, from banking to product. Nothing you upload leaves your browser.</p>
      <div class="choices">
        <a class="choice rec" href="#/you"><div class="t">Tell us about you</div><div class="d">Three questions and an optional resume. We pick the roles that fit you and show how you compare.</div><span class="tag">About 2 minutes →</span></a>
        <a class="choice" href="#/explore"><div class="t">Explore the roles</div><div class="d">Browse by field, open a role, and see what its postings ask for. You can check your fit later.</div><span class="tag">No sign-up →</span></a>
      </div>`, true);
  }
  // ---------- 2. tell us about you: three questions and an optional resume ----------
  const Q = [
    { key: "where", title: "Where are you right now?", options: [["mba", "In an MBA programme"], ["grad", "In another master's or PhD programme"], ["undergrad", "In undergrad"], ["working", "Working, thinking about a change"]] },
    { key: "want", title: "What are you looking for?", options: [["job", "A full-time job after graduation"], ["intern", "An internship"], ["look", "Just a look around"]] },
    { key: "fields", title: "Which fields interest you?", multi: true, hint: "Pick as many as you like, or none. We add the fields your resume points to." },
  ];
  let wiz = null;
  async function you() {
    const ix = await Atlas.index();
    crumbs([["About you", null]]); showAside(null);
    if (!wiz) wiz = { step: 0, answers: { ...(state.you || {}), fields: new Set((state.you || {}).fields || []) } };
    const render = () => {
      const n = Q.length + 1, i = wiz.step;
      const steps = `<div class="steps">${Array.from({ length: n }, (_, k) => `<i class="${k <= i ? "done" : ""}"></i>`).join("")}</div>`;
      const nav = (nextLabel, nextAction) => `<div class="row between" style="margin-top:16px"><button type="button" class="btn quiet" id="back">← Back</button><span class="row">${i === Q.length ? '<a class="btn" href="#/explore" id="skip">Skip for now</a>' : ""}<button type="button" class="btn primary" id="next">${nextLabel}</button></span></div>`;
      if (i < Q.length) {
        const q = Q[i];
        const opts = q.multi ? ix.groups.map(g => [g.id, g.label]) : q.options;
        const on = id => q.multi ? wiz.answers.fields.has(id) : wiz.answers[q.key] === id;
        page(`${steps}<p class="eyebrow">Question ${i + 1} of ${Q.length}</p><h1>${esc(q.title)}</h1>${q.hint ? `<p class="lead">${esc(q.hint)}</p>` : ""}
          <div class="opts">${opts.map(([id, label]) => `<button type="button" class="opt${on(id) ? " on" : ""}" data-opt="${esc(id)}" aria-pressed="${on(id)}">${esc(label)}</button>`).join("")}</div>${nav("Next →")}`, true);
        main.querySelectorAll("[data-opt]").forEach(b => b.onclick = () => { const id = b.dataset.opt; if (q.multi) { wiz.answers.fields.has(id) ? wiz.answers.fields.delete(id) : wiz.answers.fields.add(id); render(); } else { wiz.answers[q.key] = id; wiz.step++; render(); } });
        $("#next").onclick = () => { if (!q.multi && !wiz.answers[q.key]) return; wiz.step++; render(); };
        $("#back").onclick = () => { if (i === 0) location.hash = "#/"; else { wiz.step--; render(); } };
        return;
      }
      page(`${steps}<p class="eyebrow">Last step, optional</p><h1>Add your resume</h1>
        <p class="lead">We read it in your browser to find the roles that fit what you have done. Nothing is uploaded.</p>
        ${resumeForm()}${nav("Show my roles →")}`, true);
      wireResumeForm();
      $("#back").onclick = () => { wiz.step--; render(); };
      $("#skip").onclick = () => saveYou();
      $("#next").onclick = async () => { await takeResume(); saveYou(); location.hash = "#/explore"; };
    };
    const saveYou = () => { state.you = { where: wiz.answers.where || null, want: wiz.answers.want || null, fields: [...wiz.answers.fields] }; store.set("you", state.you); wiz = null; };
    render();
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
  // the fields that fit: the ones chosen, plus those of the roles held and of the five roles the resume reads closest to
  async function fitFields() {
    const ix = await Atlas.index(); const out = new Set((state.you || {}).fields || []);
    const rg = await rough();
    if (rg) { for (const h of rg.held) if (ix.roles[h]) out.add(ix.roles[h].group); for (const [id] of Object.entries(rg.scores).sort((a, b) => b[1] - a[1]).slice(0, 5)) if (ix.roles[id] && rg.scores[id] > 0) out.add(ix.roles[id].group); }
    return out;
  }

  // ---------- 3. explore: fields as circles ----------
  const sizeClass = n => n >= 4000 ? "s4" : n >= 1500 ? "s3" : n >= 600 ? "s2" : "s1";
  async function explore() {
    const ix = await Atlas.index();
    crumbs([["Explore", null]]); showAside(null);
    const fit = (state.you || state.resume) ? await fitFields() : null;
    let onlyFit = !!(fit && fit.size);
    const render = () => {
      const all = [...ix.groups].sort((a, b) => (b.nOpen || 0) - (a.nOpen || 0));
      const groups = onlyFit ? all.filter(g => fit.has(g.id)) : all;
      const nRoles = all.reduce((a, g) => a + g.roles.length, 0);
      const chips = fit ? `<div class="chips"><span class="lbl">Showing</span><button type="button" class="chip${onlyFit ? " on" : ""}" id="c-fit">Fields that fit you<span class="n">${fit.size}</span></button><button type="button" class="chip${onlyFit ? "" : " on"}" id="c-all">All fields</button>${state.resume ? `<span class="small muted" style="margin-left:8px">From your answers and ${esc(state.resume.name)}.</span>` : fit.size ? '<span class="small muted" style="margin-left:8px">From your answers. <a href="#/you">Add a resume</a> to add the fields it points to.</span>' : '<span class="small muted" style="margin-left:8px">You picked no field yet. <a href="#/you">Tell us about you</a>.</span>'}</div>` : "";
      page(`<h1>Explore the roles</h1>
        <p class="lead">${all.length} fields, ${nRoles || 56} roles. The size of a field is how many postings are open now. Open one.</p>${chips}
        <div class="bubbles">${groups.map(g => `<a class="bubble ${sizeClass(g.nOpen || 0)}${fit && fit.has(g.id) ? " you" : ""}" href="#/field/${esc(g.id)}">${esc(g.label)}<span class="n">${g.nOpen == null ? "loading…" : fmt(g.nOpen) + " open"}${g.roles.length ? " · " + plural(g.roles.length, "role", "roles") : ""}</span></a>`).join("")}</div>
        ${fit && fit.size && !onlyFit ? '<p class="key" style="text-align:center">Green: the fields your answers and resume point to.</p>' : ""}`);
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
    const where = g.set === "mba" ? " in the US" : "";
    const rg = state.resume ? await rough() : null;
    const mark = r => !rg ? "" : rg.held.includes(r.id) ? ' · <span style="color:var(--primary)">you held this role</span>' : rg.scores[r.id] >= 0.6 ? ' · <span style="color:var(--primary)">your resume reads close to it</span>' : "";
    const anyMark = rg && roles.some(r => mark(r));
    page(`<h1>${esc(g.label)}</h1>
      <p class="lead">${plural(roles.length, "role", "roles")}, ${fmt(roles.reduce((a, r) => a + r.nOpen, 0))} open postings${where}. Roles are sorted by open postings.${anyMark ? " The green notes are a rough read of your resume; open a role for your band of fit." : ""}</p>
      <div class="list">${roles.map(r => `<a class="r" href="#/role/${esc(r.id)}"><span class="t">${esc(r.label)}</span><span class="n">${fmt(r.nOpen)} open</span><span class="m">${esc(productLine(g, r, line))}${mark(r)}</span></a>`).join("")}</div>`);
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
    if (state.roleId !== id) { state.R = await Atlas.role(id); state.roleId = id; state.level = defaultLevel(); state.employer = "all"; state.selected = null; state.query = ""; state.shown = 40; state.evTab = null; state.match = null; }
    const ix = await Atlas.index(); return ix.groups.find(x => x.id === state.R.role.group);
  }
  // a student looks at the entry grade first; everyone else at every level
  const defaultLevel = () => (state.you && ["mba", "grad", "undergrad"].includes(state.you.where)) ? "entry" : "all";
  async function roleScreen(id) {
    const g = await loadRole(id); const R = state.R;
    crumbs([["Explore", "#/explore"], [g.label, "#/field/" + g.id], [R.role.label, null]]);
    renderRole();
  }
  const sliceOf = () => state.R.jobs.filter(j => (state.level === "all" || Atlas.stepOf(j) === state.level) && (state.employer === "all" || Atlas.employerType(j) === state.employer));
  function renderRole() {
    const R = state.R, role = R.role, slice = sliceOf();
    const { rows, stats } = Atlas.grid(R, slice);
    const open = slice.filter(j => j.open);
    const nClosed = R.jobs.length - R.jobs.filter(j => j.open).length;
    const levelCounts = {}; for (const j of R.jobs.filter(j => state.employer === "all" || Atlas.employerType(j) === state.employer)) levelCounts[Atlas.stepOf(j)] = (levelCounts[Atlas.stepOf(j)] || 0) + 1;
    const empCounts = {}; for (const j of R.jobs.filter(j => state.level === "all" || Atlas.stepOf(j) === state.level)) empCounts[Atlas.employerType(j)] = (empCounts[Atlas.employerType(j)] || 0) + 1;
    const chip = (on, label, n, attrs) => `<button type="button" class="chip${on ? " on" : ""}" aria-pressed="${on}" ${attrs}>${esc(label)}${n != null ? `<span class="n">${fmt(n)}</span>` : ""}</button>`;
    const where = R.country ? ` · ${esc(R.country)}` : "";
    const facts = `${fmt(R.jobs.filter(j => j.open).length)} open postings${nClosed ? ` (${fmt(nClosed)} recently closed are counted too)` : ""} · ${plural(role.nCompanies, "employer", "employers")}${where}`;
    const defNote = role.definingList.length ? ` ◆ marks what sets this role apart from other roles.` : "";
    const grid = gridHtml(R, rows);

    const creds = R.skills.filter(s => s.cluster === "credentials" && stats.share(s.id) >= 0.1).map(s => ({ s, v: stats.share(s.id) })).sort((a, b) => b.v - a.v).slice(0, 6);
    const doms = R.skills.filter(s => s.cluster === "domain" && stats.share(s.id) >= 0.1).map(s => ({ s, v: stats.share(s.id) })).sort((a, b) => b.v - a.v).slice(0, 6);
    const also = (creds.length || doms.length) ? `<h2>Also asked for</h2><p class="small muted">${creds.length ? `Credentials and experience: ${creds.map(x => `${esc(x.s.name)} (${pct(x.v)})`).join(", ")}.` : ""} ${doms.length ? `Industries: ${doms.map(x => `${esc(x.s.name)} (${pct(x.v)})`).join(", ")}. One industry is enough.` : ""}</p>` : "";
    // postings: open only; for new graduates and interns first (MBA set), then by employer
    const q = state.query.trim().toLowerCase();
    const rank = j => j.entry === "mba" ? 0 : j.intern ? 1 : j.entry === "pre_mba" ? 2 : 3;
    const list = open.filter(j => !q || (j.company + " " + j.title + " " + (j.location || "")).toLowerCase().includes(q)).sort((a, b) => rank(a) - rank(b) || a.company.localeCompare(b.company));
    const shown = list.slice(0, state.shown);
    const postings = `<h2>Open postings</h2>
      <input type="search" id="q" placeholder="Search by employer or title" aria-label="Search postings" value="${esc(state.query)}" autocomplete="off">
      <div class="list" id="postings">${shown.map(j => `<button type="button" class="r${state.selected && state.selected.kind === "posting" && state.selected.id === j.id ? " on" : ""}" data-job="${j.id}"><span class="t">${esc(j.title)}</span><span class="n">${esc(levelLabel(R, j))}</span><span class="m">${esc(j.company)}${j.location ? " · " + esc(j.location) : ""}${j.intern ? " · internship" : j.entry === "mba" ? " · for MBA graduates" : j.entry === "pre_mba" ? " · for new graduates" : ""}</span></button>`).join("") || '<p class="small muted" style="padding:10px 0">No open postings match.</p>'}</div>
      <p class="small muted" style="margin-top:8px">Showing ${fmt(shown.length)} of ${fmt(list.length)}${R.set === "mba" ? ". Postings for graduates and interns first." : ""} ${list.length > shown.length ? '<button type="button" class="linkish link" id="more">Show more</button>' : ""}</p>`;
    page(`<h1>${esc(role.label)}</h1><p class="facts">${facts}</p>
      <p class="lead">What the postings ask for. Rows: how many postings ask for a skill. Right column: skills asked for more as you move up.${defNote}</p>
      <div class="actions">
        <a class="action primary" href="#/role/${esc(role.id)}/fit"><span class="t">How do I fit?</span><span class="d">${state.resume ? `Using ${esc(state.resume.name)}. See your band of fit and what to evidence next.` : "Drop your resume. See your band of fit and what to evidence next."}</span></a>
        <span class="action soon" aria-disabled="true"><span class="t">Check a course</span><span class="d">Drop a syllabus. See which of these skills it teaches. Coming later.</span></span>
        <span class="action soon" aria-disabled="true"><span class="t">Prepare for an event</span><span class="d">Networking, employer roundtable or hackathon. Coming later.</span></span>
      </div>
      <div class="chips"><span class="lbl">Level</span>${chip(state.level === "all", "All levels", R.jobs.length, 'data-level="all"')}${Atlas.STEPS.map(s => chip(state.level === s, R.stepLabels[s], levelCounts[s] || 0, `data-level="${s}"`)).join("")}
        <span class="gap"></span><span class="lbl">Employers</span>${chip(state.employer === "all", "All", null, 'data-emp="all"')}${R.employerTypes.map(([id, label]) => chip(state.employer === id, label, empCounts[id] || 0, `data-emp="${id}"`)).join("")}</div>
      ${stats.n ? grid : '<p class="notice">No postings match these filters.</p>'}
      <p class="key">${plural(stats.n, "posting", "postings")} in this view. Open a skill to see what it means and how postings say it. The blue bar is the share of postings that ask for it.${state.match && state.match.roleId === role.id ? " Green border: your resume shows it. Amber dashed border: a gap." : ""}</p>
      ${also}${postings}`);
    main.querySelectorAll("[data-level]").forEach(b => b.onclick = () => { state.level = b.dataset.level; state.shown = 40; renderRole(); });
    main.querySelectorAll("[data-emp]").forEach(b => b.onclick = () => { state.employer = b.dataset.emp; state.shown = 40; renderRole(); });
    main.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }));
    main.querySelectorAll("[data-job]").forEach(b => b.onclick = () => select({ kind: "posting", id: Number(b.dataset.job) }));
    const qi = $("#q"); qi.oninput = () => { state.query = qi.value; state.shown = 40; const y = window.scrollY; renderRole(); window.scrollTo(0, y); $("#q").focus(); $("#q").setSelectionRange(qi.value.length, qi.value.length); };
    const more = $("#more"); if (more) more.onclick = () => { state.shown += 40; const y = window.scrollY; renderRole(); window.scrollTo(0, y); };
    renderAside();
  }
  const AREA_ORDER = ["finance", "deals", "real_estate", "strategy", "analytics", "craft", "discovery", "gtm", "marketing", "sales", "operations", "people", "risk", "leadership", "delivery", "technical", "tools", "domain"];
  const areaOrder = (R, c) => { const i = AREA_ORDER.indexOf(c); return i < 0 ? 99 : i; };
  const ROWS = [["Nearly every posting", "over half of the postings ask for it"], ["Many postings", "a quarter to a half"], ["Some postings", "one in ten to one in four"]];
  const COLS = [["Asked at every level", "from the first grade up"], ["Asked more as you move up", "at least 1.5 times as often in leadership postings"]];
  function gridHtml(R, rows) {
    const m = state.match && state.match.roleId === R.role.id ? state.match : null;
    const cell = items => {
      let last = null, h = "";
      for (const s of [...items].sort((a, b) => (areaOrder(R, a.cluster) - areaOrder(R, b.cluster)) || b.share - a.share)) {
        if (s.cluster !== last) { h += `<span class="area">${esc(R.clusters[s.cluster].label)}</span>`; last = s.cluster; }
        const on = state.selected && state.selected.kind === "skill" && state.selected.id === s.id;
        const paint = m ? (m.matched.has(s.id) ? " have" : m.presumed.has(s.id) ? "" : m.required.has(s.id) ? " gap" : "") : "";
        h += `<button type="button" class="skill${on ? " on" : ""}${paint}" data-skill="${esc(s.id)}"><span>${esc(s.name)}${s.defining ? ' <span class="def" title="defines this role">◆</span>' : ""}</span><span class="pct">${pct(s.share)}</span><span class="bar"><i style="width:${Math.round(s.share * 100)}%"></i></span></button>`;
      }
      return `<div class="cell">${h || '<span class="subtle">—</span>'}</div>`;
    };
    return `<div class="grid"><div class="h"></div>${COLS.map(([t, d]) => `<div class="h"><b>${t}</b>${d}</div>`).join("")}${ROWS.map(([t, d], i) => `<div class="rh"><b>${t}</b>${d}</div>${cell(rows[i][0])}${cell(rows[i][1])}`).join("")}</div>`;
  }
  function levelLabel(R, j) { const lad = R.ladders && R.ladders[j.ladder]; return (lad && lad.levels[j.level]) || R.levelLabels[j.level] || j.level; }

  function select(sel, onFit) {
    const same = state.selected && sel && state.selected.kind === sel.kind && state.selected.id === sel.id;
    state.selected = same ? null : sel;
    const y = window.scrollY;
    if (onFit || location.hash.endsWith("/fit")) { main.querySelectorAll("[data-skill]").forEach(b => b.classList.toggle("on", !!(state.selected && b.dataset.skill === state.selected.id && b.classList.contains("skill")))); renderAside(); }
    else renderRole();
    window.scrollTo(0, y);
  }

  // ---------- the side panel ----------
  function renderAside() {
    const R = state.R, sel = state.selected;
    if (!sel) { showAside(`<p class="eyebrow">Details</p><p class="empty">Open a skill to see what it means, what it breaks down into and how postings say it. Open a posting to see everything it asks for.</p>`); return; }
    if (sel.kind === "posting") { showAside(postingCard(R, R.jobs.find(j => j.id === sel.id))); wire(); return; }
    showAside(skillCard(R, R.skillById[sel.id], sliceOf())); wire();
    // evidence sentences come from a separate file for the MBA set: fill them in when they arrive
    R.evidence(sel.id).then(ev => { if (state.selected === sel) { const el = aside.querySelector("#evidence"); if (el) { el.innerHTML = evidenceHtml(ev); wire(); } } }).catch(console.error);
  }
  function wire() {
    aside.querySelector(".close").onclick = () => select(null);
    aside.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }));
    aside.querySelectorAll("[data-job]").forEach(b => b.onclick = () => select({ kind: "posting", id: Number(b.dataset.job) }));
    aside.querySelectorAll("[data-ev]").forEach(b => b.onclick = () => { state.evTab = b.dataset.ev; renderAside(); });
    aside.querySelectorAll("details[data-k]").forEach(d => d.ontoggle = () => { d.open ? state.open.add(d.dataset.k) : state.open.delete(d.dataset.k); });
  }
  const disc = (k, label, inner) => `<details class="disc" data-k="${k}"${state.open.has(k) ? " open" : ""}><summary>${label}</summary><div class="disc-body">${inner}</div></details>`;
  function evidenceHtml(ev) {
    const groups = EV_GROUPS.filter(([k]) => (ev[k] || []).length);
    if (!groups.length) return `<p class="small muted">No example sentences for this skill yet.</p>`;
    const want = state.evTab || STEP_TO_EV[state.level] || "early";
    const tab = groups.some(([k]) => k === want) ? want : groups[0][0];
    return `<div class="evtabs">${groups.map(([k, lab]) => `<button type="button" class="chip${tab === k ? " on" : ""}" data-ev="${k}">${lab}</button>`).join("")}</div>` +
      ev[tab].slice(0, 3).map(q => `<blockquote class="quote">“${esc(q.text.length > 260 ? q.text.slice(0, 257) + "…" : q.text)}”<span class="src">${esc(q.company)} · <a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.title)}</a></span></blockquote>`).join("");
  }
  function skillCard(R, s, slice) {
    const st = Atlas.shares(slice), ss = Atlas.subShares(slice, s.id);
    const subsMeta = s.subskills || (R.subs[s.id] || []).map(x => ({ id: x.id, name: x.name, example: "" }));
    const m = state.match && state.match.roleId === R.role.id ? state.match : null;
    const subs = subsMeta.map(sub => `<div class="sub${m ? (m.subs.has(sub.id) ? " have" : m.required.has(s.id) && !m.presumed.has(s.id) ? " miss" : "") : ""}"><span class="nm">${esc(sub.name)}</span><span class="pct" title="share of postings asking for ${esc(s.name)} that mention this">${pct(ss.share(sub.id))}</span>${sub.example ? `<span class="ex">${esc(sub.example)}</span>` : ""}</div>`).join("");
    const here = state.level === "all" ? null : { entry: "associate", mid: "mid", senior: "senior", lead: "lead" }[state.level];
    const ladder = s.ladder ? `<div class="ladder">${LADDER_KEYS.map(([k, lab]) => `<span class="lv${here === k ? " here" : ""}">${lab}</span><span>${esc(s.ladder[k] || "")}</span>`).join("")}</div>` : `<p class="small muted">The level ladder for this skill is not written yet.</p>`;
    const build = (s.build || []).length ? `<ul class="plain">${s.build.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : `<p class="small muted">Build steps for this skill are not written yet.</p>`;
    const signals = (s.signals || []).length ? `<p class="small muted" style="margin:10px 0 0">Resume lines that show it</p><ul class="plain">${s.signals.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : "";
    const withSkill = slice.filter(j => j.open && j.skills.includes(s.id)).slice(0, 6);
    const postings = withSkill.length ? `<div class="list">${withSkill.map(j => `<button type="button" class="r" data-job="${j.id}"><span class="t">${esc(j.title)}</span><span class="n">${esc(levelLabel(R, j))}</span><span class="m">${esc(j.company)}</span></button>`).join("")}</div>` : `<p class="small muted">No open posting in this view asks for it.</p>`;
    const visible = new Set(Atlas.grid(R, slice).rows.flat(2).map(x => x.id));
    const related = R.edges.filter(e => (e.source === s.id || e.target === s.id)).map(e => ({ id: e.source === s.id ? e.target : e.source, w: e.jaccard })).filter(x => visible.has(x.id) && x.id !== s.id).sort((a, b) => b.w - a.w).slice(0, 6);
    const def = R.role.defining.has(s.id) ? ` · <span title="asked for far more in this role than in other roles">defines this role ◆</span>` : "";
    return `<button type="button" class="close" aria-label="Close">×</button><div class="card">
      <p class="eyebrow">${esc(R.clusters[s.cluster].label)}${def}</p><h2>${esc(s.name)}</h2>
      ${s.what ? `<p class="what">${esc(s.what)}</p>` : ""}
      <p class="facts">${inWords(st.share(s.id))} in this view ask for it (${pct(st.share(s.id))} of ${fmt(st.n)}) · ${pct(s.share)} across ${R.set === "mba" ? "all 50 roles" : "all product roles"}</p>
      ${subs ? `<h3>What it breaks down into</h3><div class="subs">${subs}</div>` : ""}
      <h3>How postings say it</h3><div id="evidence"><p class="small muted">Loading example sentences…</p></div>
      ${disc("ladder", "At each level", ladder)}
      ${disc("build", "How to build it", build + signals)}
      ${disc("postings", "Postings that ask for it", postings)}
      ${related.length ? `<h3>Often asked for together</h3><div class="tags">${related.map(r => `<button type="button" class="tag" data-skill="${esc(r.id)}">${esc(R.skillById[r.id].name)}</button>`).join("")}</div>` : ""}
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
    const slice = R.jobs.filter(j => (level === "all" || Atlas.stepOf(j) === level) && (state.employer === "all" || Atlas.employerType(j) === state.employer));
    const { M, bands, group } = await Atlas.matcher(R);
    const label = `${role.label}${level === "all" ? "" : " · " + R.stepLabels[level]}`;
    const r = M.match(state.resume.text, { jobs: slice, familyJobs: R.jobs, label }, { level: LEVEL_OPT[level] });
    const rows = r.rows, by = st => rows.filter(x => x.status === st).sort((a, b) => (a.tier === b.tier ? b.w - a.w : a.tier === "core" ? -1 : b.tier === "core" ? 1 : a.tier === "common" ? -1 : 1));
    const evid = by("evidenced"), trans = by("transferable"), thin = by("thin"), presumed = by("presumed"), gaps = by("gap").filter(x => x.tier !== "diff");
    const required = new Set(); for (const x of rows) { if (x.tier === "diff") continue; if (x.slot === "__ai") r.ai.forEach(k => required.add(k)); else if (x.slot !== "__domain") required.add(x.id); }
    state.match = { roleId: role.id, matched: new Set([...evid, ...trans].map(x => x.id).filter(k => R.skillById[k])), required, presumed: new Set(presumed.map(x => x.id)), subs: r.subs };
    const band = Matcher.bandOf(r.overall, bands, group), bandNext = Matcher.bandOf(r.whatIf, bands, group);
    const bandName = k => (BANDS.find(b => b[0] === k) || [])[1];
    const core = rows.filter(x => x.tier === "core"), coreHave = core.filter(x => x.status === "evidenced" || x.status === "transferable").length;
    const field = g.label.toLowerCase();
    const p = r.profile;
    const scale = band ? `<div class="band">${BANDS.map(([k], i) => `<i class="${k === band ? "on" : i < BANDS.findIndex(b => b[0] === band) ? "past" : ""}"></i>`).join("")}</div><div class="bandl">${BANDS.map(([k, l]) => `<span class="${k === band ? "on" : ""}">${l}</span>`).join("")}</div><div class="verdict">${bandName(band)}</div>` : `<div class="notice"><b>We cannot yet say how you fit ${esc(role.label)}.</b> ${esc((bands.no_bands || {})[group] ? "Our sample of resumes for this group of roles is too small to set bands of fit." : "This group of roles has no bands of fit yet.")} Below is what you show and what is missing, without a verdict.</div>`;
    const st = r.standing;
    const standing = st ? `<p class="small">You held this role ${st.above ? `above this level (${esc(Matcher.LADDER_LABEL[st.level])}, ${fmtYears(st.years)})` : `at this level for ${fmtYears(st.years)}`}${st.employers.length ? `, and we hold ${esc(st.employers[0])}'s own postings` : ""}. ${st.presumed ? `<b>${st.presumed}</b> ${st.presumed === 1 ? "requirement is" : "requirements are"} presumed from that; your resume does not show ${st.presumed === 1 ? "it" : "them"}.` : ""}</p>` : "";
    const unread = r.parsed.roles.length === 0 && r.parsed.lines >= 15 ? `<div class="notice"><b>We found no jobs with dates in this text.</b> Roles and years are not counted. Put each job title and its dates on one line, for example "Analyst, Acme, 2021 – 2024".</div>` : "";
    const placeholder = r.parsed.placeholderDates && r.parsed.roles.some(x => x.placeholder) ? `<div class="notice"><b>Some dates in this text are placeholders ("20XX").</b> We read those jobs, but we cannot count their years.</div>` : "";
    // the two slots that stand for a group of skills get plain words: which industry, which kind of AI work
    const slotWhy = x => x.slot === "__domain" ? ` Name an industry you have worked in. These postings are in: ${r.industries.slice(0, 4).map(d => esc(d.name)).join(", ")}. One is enough.` : x.slot === "__ai" ? ` Show one line of AI work: ${r.ai.map(k => esc(R.skillById[k] ? R.skillById[k].name : k)).join(", ")}.` : "";
    const next = gaps.slice(0, 3).map(x => `<li><b>${esc(x.slotName)}</b><span class="why">Asked in ${pct(x.w)} of postings${x.tier === "core" ? ", by most" : ""}.${slotWhy(x)}${x.signals && x.signals[0] ? ` A line that would show it: “${esc(x.signals[0])}”` : ""}${x.build && x.build[0] ? ` ${esc(x.build[0])}` : ""}</span></li>`).join("");
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
    const { rows: gridRows } = Atlas.grid(R, slice);
    page(`<p class="eyebrow">Your fit · ${esc(label)}</p>${unread}${placeholder}${scale}
      <p class="lead">${PERSONA[p.persona](p, field)} You show <b>${coreHave} of ${core.length}</b> skills that most ${esc(role.label)} postings ask for.</p>${standing}
      ${band ? '<p class="small muted">Bands come from how 300 sample resumes of people in and outside the role score. There is no pass mark; a band says how your resume reads next to theirs.</p>' : ""}
      <div class="chips"><span class="lbl">Level</span>${["all", ...Atlas.STEPS].map(s => `<button type="button" class="chip${level === s ? " on" : ""}" data-fitlevel="${s}">${s === "all" ? "All levels" : esc(R.stepLabels[s])}</button>`).join("")}<span class="gap"></span><span class="small muted">Using ${esc(state.resume.name)} · <a href="#/role/${esc(role.id)}/fit" id="change">change</a></span></div>
      ${gaps.length ? `<h2>Evidence next</h2><ol class="next">${next}</ol>${whatIf}` : `<h2>Nothing important missing</h2><p class="small muted">You show every skill that most postings ask for.</p>`}
      <h2>What you show</h2><div class="tags">${evid.map(x => tag(x, "good")).join("")}${trans.map(x => tag(x, "amber")).join("") || (evid.length ? "" : '<span class="small muted">Nothing yet.</span>')}</div>
      ${presumed.length ? `<h3>Presumed from roles you held</h3><div class="tags">${presumed.map(x => tag(x, "thin")).join("")}</div><p class="small muted">People who hold this role do these. Your resume does not show them, so they earn part credit.</p>` : ""}
      ${gaps.length ? `<h3>Gaps</h3><div class="tags">${gaps.map(x => tag(x, "bad")).join("")}</div>` : ""}
      ${thin.length ? `<h3>Named, not shown</h3><div class="tags">${thin.map(x => tag(x, "thin")).join("")}</div><p class="small muted">Listed as a word, but no work, project or course line shows it.</p>` : ""}
      ${sayIt}${thinDisc}${disc("creds", "Credentials and industries", credLine + indLine)}${unmapped}
      <h2>On the skill grid</h2><p class="small muted">Green border: your resume shows it. Amber dashed: a gap among the skills most postings ask for.</p>
      ${gridHtml(R, gridRows)}
      <p class="small muted" style="margin-top:12px"><a href="#/role/${esc(role.id)}">← Back to ${esc(role.label)}</a></p>`);
    main.querySelectorAll("[data-fitlevel]").forEach(b => b.onclick = () => { state.fitLevel = b.dataset.fitlevel; state.level = b.dataset.fitlevel; fitScreen(id); });
    main.querySelectorAll("[data-skill]").forEach(b => b.onclick = () => select({ kind: "skill", id: b.dataset.skill }, true));
    main.querySelectorAll("details[data-k]").forEach(d => d.ontoggle = () => { d.open ? state.open.add(d.dataset.k) : state.open.delete(d.dataset.k); });
    $("#change").onclick = e => { e.preventDefault(); state.resume = null; fitScreen(id); };
    renderAside();
  }

  // ---------- about the data ----------
  async function about() {
    const ix = await Atlas.index();
    crumbs([["About the data", null]]); showAside(null);
    const M = ix.M;
    const top = (cs, n) => cs.sort((a, b) => b.n - a.n).slice(0, n).map(c => `${esc(c.name)} <span class="muted">(${c.n})</span>`).join(" · ");
    let productPart = `<p class="small muted">Loading the product set…</p>`;
    const render = () => page(`<div id="about"><h1>About the data</h1>
      <p class="lead">Postings are pulled from each employer's public careers site, filtered to the titles of each role, and read against one list of skills with keyword rules. A share is the fraction of postings in the current view that ask for a skill. Sub-skills, level ladders and build steps are editorial; quoted sentences come from the postings.</p>
      <h3>Business roles (MBA set)</h3>
      <p class="small">${fmt(M.meta.n_open)} open US postings for 50 roles at ${fmt(M.meta.n_companies)} employers, refreshed ${esc(M.meta.generated)}. Recently closed postings stay in the statistics for a year and are not listed. One employer counts for at most 5% of a role.</p>
      <p class="small">Employers with most postings: ${top(M.meta.companies.slice(), 40)}</p>
      <h3>Product roles</h3>${productPart}</div>`);
    render();
    Atlas.product().then(P => { const G = P.G; productPart = `<p class="small">${fmt(G.meta.n_jobs)} open postings for 6 product role families at ${fmt(G.meta.n_companies)} companies (the Fortune 500 and venture-backed startups), scraped ${esc(G.meta.generated)}.</p><p class="small">Companies with most postings: ${top(G.meta.companies.slice(), 40)}</p>`; if (location.hash.startsWith("#/about")) render(); }).catch(console.error);
  }

  route();
})();
