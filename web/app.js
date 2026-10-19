/* Role atlas — the screens. Routes (hash): #/ start (the games, then see what jobs ask for) · #/play/<game> · #/you (next step) · #/explore · #/field/<group> · #/role/<role> ·
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

  // ---------- router ----------
  const state = { roleId: null, R: null, level: "all", employer: "all", selected: null, query: "", shown: 40, evTab: null, open: new Set(), you: null, resume: null, rough: null, match: null, fitLevel: null, course: null, paint: null, sector: new Set(), company: new Set(), country: new Set(), remote: false, more: false, companyQuery: "", grads: false };
  // what the person told us and the resume they dropped stay in this browser only (nothing is uploaded)
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  state.you = store.get("you"); state.resume = store.get("resume");
  const LEVEL_OPT = { entry: "associate", mid: "mid", senior: "senior", lead: "lead" };
  function route() {
    const parts = location.hash.split("?")[0].replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const [a, b, c] = parts;
    const go = { "": start, you: you, explore: explore, field: () => c === "event" ? eventScreen(b) : field(b), role: () => c === "fit" ? fitScreen(b) : c === "course" ? courseScreen(b) : roleScreen(b), play: () => play(b), about: about }[a || ""];
    SkillMap.leave();
    (go || start)().catch(fail);
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
    const focus = new URLSearchParams(location.hash.split("?")[1] || "").get("field");
    if (focus) SkillMap.setMode("map");
    const fit = (state.you || state.resume) ? await fitFields() : null;
    let onlyFit = !!(fit && fit.size);
    const render = () => {
      const all = [...ix.groups].sort((a, b) => (b.nOpen || 0) - (a.nOpen || 0));
      const groups = onlyFit ? all.filter(g => fit.has(g.id)) : all;
      const nRoles = all.reduce((a, g) => a + g.roles.length, 0);
      const chips = fit ? `<div class="chips"><span class="lbl">Showing</span><button type="button" class="chip${onlyFit ? " on" : ""}" id="c-fit">Fields that fit you<span class="n">${fit.size}</span></button><button type="button" class="chip${onlyFit ? "" : " on"}" id="c-all">All fields</button>${state.resume ? `<span class="small muted" style="margin-left:8px">From your answers and ${esc(state.resume.name)}.</span>` : fit.size ? '<span class="small muted" style="margin-left:8px">From your answers. <a href="#/you">Add a resume</a> to add the fields it points to.</span>' : '<span class="small muted" style="margin-left:8px">You picked no field yet. <a href="#/you">Tell us about you</a>.</span>'}</div>` : "";
      const asMap = SkillMap.mode() === "map";
      const view = `<div class="chips"><span class="lbl">View</span><button type="button" class="chip${asMap ? " on" : ""}" id="v-map">Skill map</button><button type="button" class="chip${asMap ? "" : " on"}" id="v-grid">Circles</button>${asMap ? '<span class="gap"></span><input class="sm-find" id="sm-find" type="search" placeholder="Find a skill" list="sm-names" aria-label="Find a skill"><datalist id="sm-names"></datalist>' : ""}</div>`;
      const inner = g => `${esc(g.label)}<span class="n">${g.nOpen == null ? "loading…" : fmt(g.nOpen) + " open"}${g.roles.length ? " · " + plural(g.roles.length, "role", "roles") : ""}</span>`;
      if (asMap) {
        // the fields on the skill map: a field's own skills beside it, the skills every field asks for in the middle
        page(`<h1>Explore the roles</h1>
          <p class="lead">${all.length} fields, ${nRoles || 56} roles, and the skills their postings ask for. Each field's own skills sit beside it; skills every field asks for sit in the middle. Hover a field, click a skill, or open a field.</p>${chips}${view}
          <div class="sm-stage" id="sm-stage"></div>
          ${fit && fit.size ? '<p class="key">Green: the fields your answers and resume point to.</p>' : ""}`);
        main.firstElementChild.classList.add("wide");
        const SIZE = { s1: 0.66, s2: 0.76, s3: 0.88, s4: 1 };
        SkillMap.stage($("#sm-stage"), { groups: all.map(g => ({ id: g.id, cls: sizeClass(g.nOpen || 0), you: !!(fit && fit.has(g.id)), inner: inner(g) })), sizeOf: g => SIZE[g.cls], fit, onlyFit, focus, aside, showAside });
        SkillMap.names().then(ns => { const dl = $("#sm-names"); if (dl) dl.innerHTML = ns.map(n => `<option value="${esc(n)}">`).join(""); });
        const f = $("#sm-find"); f.onchange = () => SkillMap.find(f.value);
        $("#v-grid").onclick = () => { SkillMap.setMode("grid"); SkillMap.leave(); showAside(null); render(); };
        const cf = $("#c-fit"), ca = $("#c-all"); if (cf) { cf.onclick = () => { onlyFit = true; render(); }; ca.onclick = () => { onlyFit = false; render(); }; }
        return;
      }
      page(`<h1>Explore the roles</h1>
        <p class="lead">${all.length} fields, ${nRoles || 56} roles. The size of a field is how many postings are open now. Open one.</p>${chips}${view}
        <div class="bubbles">${groups.map(g => `<a class="bubble ${sizeClass(g.nOpen || 0)}${fit && fit.has(g.id) ? " you" : ""}" href="#/field/${esc(g.id)}">${esc(g.label)}<span class="n">${g.nOpen == null ? "loading…" : fmt(g.nOpen) + " open"}${g.roles.length ? " · " + plural(g.roles.length, "role", "roles") : ""}</span></a>`).join("")}</div>
        ${fit && fit.size && !onlyFit ? '<p class="key" style="text-align:center">Green: the fields your answers and resume point to.</p>' : ""}`);
      $("#v-map").onclick = () => { SkillMap.setMode("map"); render(); };
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
      <p class="lead">${plural(roles.length, "role", "roles")}, ${fmt(roles.reduce((a, r) => a + r.nOpen, 0))} open postings${where}. Roles are sorted by open postings.${anyMark ? " The green notes are a rough read of your resume; open a role for your band of fit." : ""} <a href="#/explore?field=${esc(g.id)}" data-map>See ${esc(g.label)} on the skill map →</a></p>
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
    if (state.roleId !== id) { state.R = await Atlas.role(id); state.roleId = id; state.level = defaultLevel(); state.employer = "all"; state.selected = null; state.query = ""; state.shown = 40; state.evTab = null; state.match = null; state.sector = new Set(); state.company = new Set(); state.country = new Set(); state.remote = false; state.more = false; state.companyQuery = ""; state.grads = false; }
    const ix = await Atlas.index(); return ix.groups.find(x => x.id === state.R.role.group);
  }
  // a student looks at the entry grade first; everyone else at every level
  const defaultLevel = () => (state.you && ["mba", "grad", "undergrad"].includes(state.you.where)) ? "entry" : "all";
  async function roleScreen(id) {
    const g = await loadRole(id); const R = state.R;
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
  const toggle = (set, v) => { set.has(v) ? set.delete(v) : set.add(v); state.shown = 40; };
  const keepScroll = fn => { const y = window.scrollY; fn(); window.scrollTo(0, y); };
  // the filters behind "More filters" show as removable chips in the row when the sheet is closed
  function activeExtra() {
    const items = [...state.sector].map(v => [v, "sector"]), co = [...state.company].map(v => [v, "company"]), cn = [...state.country].map(v => [v, "country"]);
    const all = [...items, ...co, ...cn, ...(state.remote ? [["Remote", "remote"]] : [])];
    return all.map(([v, k]) => `<button type="button" class="chip on" ${k === "remote" ? 'id="remote"' : `data-${k}="${esc(v)}"`} aria-label="Remove filter ${esc(v)}">${esc(v)} <span aria-hidden="true">×</span></button>`).join("");
  }
  // the sheet: industry, employer, location. Every count reflects the other filters (owner's choice 7A).
  function moreSheet(R, countBy) {
    const group = (label, items, set, attr, allLabel) => `<div class="fgroup"><span class="lbl">${label}</span><div class="chips" style="margin:4px 0 0">${allLabel ? `<button type="button" class="chip${set.size ? "" : " on"}" data-${attr}="__all">${allLabel}</button>` : ""}${items.map(([v, n]) => `<button type="button" class="chip${set.has(v) ? " on" : ""}" data-${attr}="${esc(v)}">${esc(v)}<span class="n">${fmt(n)}</span></button>`).join("")}</div></div>`;
    const sec = Object.entries(countBy(jobsExcept("sector"), j => j.sector)).filter(([v]) => v && v !== "Startup (unclassified)").sort((a, b) => b[1] - a[1]).slice(0, 10);
    const cm = countBy(jobsExcept("company"), j => j.company); const q = state.companyQuery.trim().toLowerCase();
    const picked = [...state.company].map(v => [v, cm[v] || 0]);
    const options = q ? Object.entries(cm).filter(([c]) => c.toLowerCase().includes(q) && !state.company.has(c)).sort((a, b) => b[1] - a[1]).slice(0, 12) : [];
    const cn = Object.entries(countBy(jobsExcept("country"), j => j.country)).filter(([v]) => v).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const remoteN = jobsExcept("country").filter(j => j.remote && (state.country.size === 0 || state.country.has(j.country))).length;
    return `<div class="sheet">
      ${group("Industry", sec, state.sector, "sector", "All industries")}
      <div class="fgroup"><span class="lbl">Employer</span><input type="search" id="company-q" placeholder="Employer name" aria-label="Employer name" value="${esc(state.companyQuery)}" autocomplete="off"><div class="chips" style="margin:4px 0 0">${picked.map(([v, n]) => `<button type="button" class="chip on" data-company="${esc(v)}">${esc(v)}<span class="n">${fmt(n)}</span></button>`).join("")}${options.map(([v, n]) => `<button type="button" class="chip" data-company="${esc(v)}">${esc(v)}<span class="n">${fmt(n)}</span></button>`).join("")}${!picked.length && !q ? '<span class="small muted">Type a name to pick an employer.</span>' : ""}</div></div>
      ${R.country ? `<div class="fgroup"><span class="lbl">Location</span><div class="chips" style="margin:4px 0 0"><span class="small muted">${esc(R.country)} only.</span><button type="button" class="chip${state.remote ? " on" : ""}" id="remote">Remote<span class="n">${fmt(remoteN)}</span></button></div></div>` : group("Location", cn, state.country, "country", "Anywhere") + `<div class="chips" style="margin:-4px 0 0"><button type="button" class="chip${state.remote ? " on" : ""}" id="remote">Remote<span class="n">${fmt(remoteN)}</span></button></div>`}
      ${extraCount() ? '<p class="small" style="margin:10px 0 0"><button type="button" class="linkish link" id="clear-extra">Clear these filters</button></p>' : ""}
    </div>`;
  }
  function renderRole() {
    const R = state.R, role = R.role, slice = sliceOf();
    const { rows, stats } = Atlas.grid(R, slice);
    const open = slice.filter(j => j.open);
    const nClosed = R.jobs.length - R.jobs.filter(j => j.open).length;
    const countBy = (jobs, fn) => { const m = {}; for (const j of jobs) { const k = fn(j); if (k != null) m[k] = (m[k] || 0) + 1; } return m; };
    const levelCounts = countBy(jobsExcept("level"), Atlas.stepOf), levelAll = jobsExcept("level").length;
    const empCounts = countBy(jobsExcept("employer"), Atlas.employerType), empAll = jobsExcept("employer").length;
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
        <a class="action" href="#/role/${esc(role.id)}/course"><span class="t">Check a course</span><span class="d">Drop a syllabus. See which of these skills it teaches.</span></a>
        <a class="action" href="#/field/${esc(role.group)}/event"><span class="t">Prepare for an event</span><span class="d">Networking, employer roundtable or hackathon.</span></a>
      </div>
      <div class="chips"><span class="lbl">Level</span>${chip(state.level === "all", "All levels", levelAll, 'data-level="all"')}${Atlas.STEPS.map(s => chip(state.level === s, R.stepLabels[s], levelCounts[s] || 0, `data-level="${s}"`)).join("")}${R.set === "mba" ? chip(state.grads, "Graduates and interns", jobsExcept("grads").filter(j => j.entry || j.intern).length, 'id="grads"') : ""}
        <span class="gap"></span><span class="lbl">Employers</span>${chip(state.employer === "all", "All", empAll, 'data-emp="all"')}${R.employerTypes.map(([id, label]) => chip(state.employer === id, label, empCounts[id] || 0, `data-emp="${id}"`)).join("")}
        <span class="gap"></span>${chip(state.more, "More filters" + (state.more ? " ▴" : " ▾"), extraCount() || null, 'id="more-filters"')}${!state.more ? activeExtra() : ""}</div>${state.more ? moreSheet(R, countBy) : ""}
      ${stats.n ? grid : '<p class="notice">No postings match these filters.</p>'}
      <p class="key">${plural(stats.n, "posting", "postings")} in this view. Open a skill to see what it means and how postings say it. The blue bar is the share of postings that ask for it.${state.match && state.match.roleId === role.id ? " Green border: your resume shows it. Amber dashed border: a gap." : ""}</p>
      ${also}${postings}`);
    main.querySelectorAll("[data-level]").forEach(b => b.onclick = () => { state.level = b.dataset.level; state.shown = 40; renderRole(); });
    main.querySelectorAll("[data-emp]").forEach(b => b.onclick = () => { state.employer = b.dataset.emp; state.shown = 40; renderRole(); });
    $("#more-filters").onclick = () => { state.more = !state.more; keepScroll(renderRole); };
    const gr = $("#grads"); if (gr) gr.onclick = () => { state.grads = !state.grads; state.shown = 40; keepScroll(renderRole); };
    main.querySelectorAll("[data-sector]").forEach(b => b.onclick = () => { b.dataset.sector === "__all" ? state.sector.clear() : toggle(state.sector, b.dataset.sector); keepScroll(renderRole); });
    main.querySelectorAll("[data-country]").forEach(b => b.onclick = () => { b.dataset.country === "__all" ? state.country.clear() : toggle(state.country, b.dataset.country); keepScroll(renderRole); });
    main.querySelectorAll("[data-company]").forEach(b => b.onclick = () => { toggle(state.company, b.dataset.company); state.companyQuery = ""; keepScroll(renderRole); });
    const rem = $("#remote"); if (rem) rem.onclick = () => { state.remote = !state.remote; keepScroll(renderRole); };
    const clr = $("#clear-extra"); if (clr) clr.onclick = () => { state.sector.clear(); state.company.clear(); state.country.clear(); state.remote = false; state.companyQuery = ""; keepScroll(renderRole); };
    const cq = $("#company-q"); if (cq) cq.oninput = () => { state.companyQuery = cq.value; keepScroll(renderRole); const el = $("#company-q"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); };
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
  function gridHtml(R, rows, paintWith) {
    const m = paintWith || (state.match && state.match.roleId === R.role.id ? state.match : null);
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
  function skillCard(R, s, slice) {
    const st = Atlas.shares(slice), ss = Atlas.subShares(slice, s.id);
    const subsMeta = s.subskills || (R.subs[s.id] || []).map(x => ({ id: x.id, name: x.name, example: "" }));
    const m = state.match && state.match.roleId === R.role.id ? state.match : null;
    const subs = subsMeta.map(sub => `<div class="sub${m ? (m.subs.has(sub.id) ? " have" : m.required.has(s.id) && !m.presumed.has(s.id) ? " miss" : "") : ""}"><span class="nm">${esc(sub.name)}</span><span class="pct" title="share of postings asking for ${esc(s.name)} that mention this">${pct(ss.share(sub.id))}</span>${sub.example ? `<span class="ex">${esc(sub.example)}</span>` : ""}</div>`).join("");
    const here = state.level === "all" ? null : { entry: "associate", mid: "mid", senior: "senior", lead: "lead" }[state.level];
    const ladder = ladderHtml(R, s, here);
    const bs = buildSteps(s, R.role.ladder, true), ladName = k => (((R.ladders || {})[k] || {}).label || k).toLowerCase();
    const build = bs.steps.length ? (bs.ind && bs.ind !== R.role.ladder ? `<p class="small muted">Shown from the ${esc(ladName(bs.ind))} ladder; this skill has none yet for ${esc(ladName(R.role.ladder))}.</p>` : "") + `<ul class="plain">${bs.steps.map(b => `<li>${stepHtml(b)}</li>`).join("")}</ul>` : `<p class="small muted">${R.role.ladder === "consulting" && s.build && !Array.isArray(s.build) ? "Build steps for consulting roles are on hold until a source is agreed." : "Build steps for this skill are not written yet."}</p>`;
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
    const scale = band ? `<div class="band">${BANDS.map(([k], i) => `<i class="${k === band ? "on" : i < BANDS.findIndex(b => b[0] === band) ? "past" : ""}"></i>`).join("")}</div><div class="bandl">${BANDS.map(([k, l]) => `<span class="${k === band ? "on" : ""}">${l}</span>`).join("")}</div><div class="verdict">${bandName(band)}</div>` : `<div class="notice"><b>We cannot yet say how you fit ${esc(role.label)}.</b> ${esc((bands.no_bands || {})[group] ? "Our sample of resumes for this group of roles is too small to set bands of fit." : "This group of roles has no bands of fit yet.")} Below is what you show and what is missing, without a verdict.</div>`;
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
        <h2>On the skill grid</h2><p class="small muted">Green border: the course names it. Amber dashed: most postings ask for it and the course does not name it.</p>${gridHtml(R, rows, state.paint)}` : `<div class="notice"><b>We found none of this role's skills in that text.</b> ${c.lines < 3 ? "The text is very short; paste the topics or the week-by-week plan." : "Paste the list of topics, or check that the text is a course description."}</div>`;
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
