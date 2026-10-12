/* Product Role Atlas — static D3 app. Data: data/graph.json, data/taxonomy.json, data/subskills.json */
(async function () {
  const [G, TAX, SUBS] = await Promise.all([
    fetch("data/graph.json").then(r => r.json()),
    fetch("data/taxonomy.json").then(r => r.json()),
    fetch("data/subskills.json").then(r => r.json()),
  ]);
  // decode compact encodings: skill / sub-skill indices and fund ids back to the strings the app uses
  const FUND_NAME = Object.fromEntries((G.funds || G.meta.funds || []).map(f => [f.id, f.name]));
  for (const j of G.jobs) {
    j.skills = j.skills.map(i => typeof i === "number" ? G.skill_ids[i] : i);
    j.sub = (j.sub || []).map(i => typeof i === "number" ? G.sub_ids[i] : i);
    j.investors = (j.investors || []).map(f => FUND_NAME[f] || f);
  }
  for (const c of G.meta.companies) c.investors = (c.investors || []).map(f => FUND_NAME[f] || f);
  const CL = G.clusters;
  const skillById = Object.fromEntries(G.skills.map(s => [s.id, s]));
  const subById = {}; for (const [sid, list] of Object.entries(SUBS)) for (const sub of list) subById[sub.id] = { ...sub, parent: sid };
  const MIN_SHARE = 0.03;
  const CRED = id => id.startsWith("yoe_");
  const SOFT = new Set(["ownership", "adaptability", "collaboration", "communication", "influence", "problem_solving", "customer_obsession", "product_sense", "execution"]);
  const EV_GROUPS = [["early", "Associate / PM"], ["senior", "Senior"], ["staff", "Staff / Principal"], ["lead", "Group / Director+"]];
  const LADDER_KEYS = [["associate", "Associate"], ["mid", "PM"], ["senior", "Senior"], ["lead", "Lead+"]];
  const LEVEL_TO_LADDER = { associate: "associate", mid: "mid", senior: "senior", staff: "lead", group: "lead", director: "lead", vp: "lead", cpo: "lead" };
  const YOE_BUCKETS = [["0-2", "Up to 2 yrs", y => y <= 2], ["3-4", "3–4 yrs", y => y >= 3 && y <= 4], ["5-6", "5–6 yrs", y => y >= 5 && y <= 6], ["7-9", "7–9 yrs", y => y >= 7 && y <= 9], ["10+", "10+ yrs", y => y >= 10], ["none", "Not stated", y => y == null]];
  const DEGREES = [["bachelors", "Bachelor's"], ["masters_mba", "Master's / MBA"], ["cs_engineering_degree", "CS / engineering"], ["phd", "PhD"]];
  const SPEC_LABEL = { growth: "Growth", platform: "Platform", ai_ml: "AI / ML", data: "Data", payments_fintech: "Payments & fintech", consumer: "Consumer", enterprise_b2b: "Enterprise / B2B", hardware_devices: "Hardware & devices", health: "Health", security_identity: "Security & identity", ads_marketing: "Ads & marketing", supply_chain_ops: "Supply chain & ops", commerce: "Commerce" };
  const groupLabel = { fortune50: "Fortune 1–50", fortune100: "Fortune 51–100", fortune250: "Fortune 101–250", fortune500: "Fortune 251–500", startup: "VC-backed startups", a16z: "a16z-backed", sequoia: "Sequoia-backed" };
  const STAGES = ["Seed", "Series A", "Series B", "Series C", "Series D", "Series E", "Series F", "Series G", "Unknown"];
  const GROUPS = Object.keys(groupLabel).filter(g => G.jobs.some(j => j.group === g));
  const COLUMNS = ["craft", "discovery", "analytics", "technical", "gtm", "leadership", "delivery", "domain", "tools"];
  const LANES = [["Entry level", "asked for across levels, from associate up"], ["Mid-career", "weighted toward PM / senior postings"], ["Senior & staff", "weighted toward senior / staff / principal"], ["Leadership", "weighted toward group / director / VP"]];
  const AX3 = {
    tech_comm: { label: "Kind of role", lo: "Marketing & growth", hi: "Technical & platform" },
    ic_mgmt: { label: "Which path", lo: "Staff / principal path", hi: "Director / VP path" },
    common: { label: "How common", lo: "Rarely asked", hi: "In most postings" },
    cluster: { label: "Skill area", lo: "", hi: "" },
  };
  const VIEWS = {
    "3d": { hint: "Drag to rotate · scroll to zoom · up = asked for at more senior levels" },
    career: { hint: "Columns: skill area. Rows: how senior the postings that ask for it tend to be." },
    common: { left: "Rarely asked for", right: "In most postings", hint: "Right = asked for in a larger share of this slice. Up = more senior." },
    ic_mgmt: { left: "Staff / principal path", right: "Director / VP path", hint: "Right = shows up far more in director+ postings than in staff/principal ones. Up = more senior." },
    tech_comm: { left: "Marketing & growth roles", right: "Technical & platform roles", hint: "Right = asked for more in TPM/platform/AI postings than in PMM/growth ones. Up = more senior." },
    free: { hint: "Clustered by what tends to be asked for together." },
  };

  const defaults = () => ({ family: new Set(["pm"]), level: new Set(), group: new Set(GROUPS), sector: new Set(), company: new Set(), country: new Set(), remote: false, yoe: new Set(), spec: new Set(), degree: new Set(), fund: new Set(), stage: new Set() });
  const state = { ...defaults(), clustersOff: new Set(), selectedSkill: null, selectedJob: null, subFocus: null, jobQuery: "", companyQuery: "", match: null, fundQuery: "", axis: "career", subs: "selected", evTab: "senior", ax3: { x: "tech_comm", z: "ic_mgmt" }, rot: { yaw: -0.6, pitch: 0.35 }, zoom3: 1, spin: false, openDisc: new Set() };

  // ---------- theme: the device decides unless the user overrides (GradBuddy D-14) ----------
  const themeSel = document.querySelector("#theme");
  let savedTheme = null; try { savedTheme = localStorage.getItem("theme"); } catch { }
  function applyTheme(t) { if (t === "dark" || t === "light") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; themeSel.value = t || "system"; }
  applyTheme(savedTheme);
  themeSel.onchange = () => { applyTheme(themeSel.value); try { localStorage.setItem("theme", themeSel.value); } catch { } update(); };
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => update());
  const isLight = () => getComputedStyle(document.documentElement).colorScheme.includes("light");
  // cluster colours are data colours; in light mode they are darkened so they still read against the page
  const clColor = id => isLight() ? d3.color(CL[id].color).darker(0.75).formatHex() : CL[id].color;

  const $ = s => document.querySelector(s);
  const fmtPct = v => Math.round(v * 100) + "%";
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const COL_SHORT = { craft: "Craft", discovery: "Discovery", analytics: "Data", technical: "Technical", gtm: "GTM", leadership: "Leadership", delivery: "Delivery", domain: "Domain", tools: "Tools", credentials: "Credentials" };
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- filtering ----------
  const DIMS = {
    family: j => state.family.size === 0 || state.family.has(j.family),
    level: j => state.level.size === 0 || state.level.has(j.level),
    group: j => state.group.has(j.group),
    sector: j => state.sector.size === 0 || state.sector.has(j.sector),
    company: j => state.company.size === 0 || state.company.has(j.company),
    country: j => (state.country.size === 0 || state.country.has(j.country)) && (!state.remote || j.remote),
    yoe: j => state.yoe.size === 0 || YOE_BUCKETS.some(([id, , fn]) => state.yoe.has(id) && fn(j.yoe)),
    spec: j => state.spec.size === 0 || j.specs.some(s => state.spec.has(s)),
    degree: j => state.degree.size === 0 || [...state.degree].every(d => j.skills.includes(d)),
    fund: j => state.fund.size === 0 || (j.investors || []).some(f => state.fund.has(f)),
    stage: j => state.stage.size === 0 || state.stage.has(j.stage),
  };
  function jobsExcept(dim) { return G.jobs.filter(j => Object.entries(DIMS).every(([k, fn]) => k === dim || fn(j))); }
  function sliceJobs() { return jobsExcept(null); }
  function sliceStats(jobs) {
    const n = jobs.length || 1, cnt = {};
    for (const j of jobs) for (const k of j.skills) cnt[k] = (cnt[k] || 0) + 1;
    return { n: jobs.length, share: id => (cnt[id] || 0) / n, cnt };
  }
  function subStats(jobs, sid) {
    const withSkill = jobs.filter(j => j.skills.includes(sid)); const n = withSkill.length || 1, cnt = {};
    for (const j of withSkill) for (const k of (j.sub || [])) cnt[k] = (cnt[k] || 0) + 1;
    return { n: withSkill.length, share: id => (cnt[id] || 0) / n };
  }

  // ---------- header / about ----------
  const companiesByGroup = {};
  for (const c of G.meta.companies) (companiesByGroup[c.group] ||= []).push(c);
  const nFunds = new Set(G.jobs.flatMap(j => j.investors || [])).size;
  $("#about-body").innerHTML = `
    <p>${G.meta.n_jobs.toLocaleString()} open product roles at ${G.meta.n_companies} companies: the Fortune 500 plus startups backed by ${nFunds} venture funds. Scraped ${G.meta.generated}.</p>
    <p class="muted">Each line of a resume is read against the same taxonomy used to tag the postings. A skill counts when a work, project or course line shows it, not just when a word appears. The match result is a map of what to evidence next, not a verdict.</p>
    <p class="muted">Postings are pulled from each company's public careers API, filtered to product-related titles, and tagged against a hand-built taxonomy of ${G.skills.length} skills and ${Object.values(SUBS).reduce((a, b) => a + b.length, 0)} sub-skills using keyword rules. Shares are "what fraction of postings in the current slice mention this". Vertical position is the share-weighted average level at which a skill is asked for (rank-spread; rare skills are pulled toward the middle). "Which path" compares director-and-above postings with staff/principal ones; "Kind of role" compares TPM/platform/AI postings with PMM/growth ones. Industries are Fortune's own labels grouped into sectors; startups are classed by their investor's vertical where known. Sub-skills, level ladders and learning routes are editorial; quoted sentences come from the postings.</p>
    ${Object.keys(groupLabel).filter(g => companiesByGroup[g]).map(g => { const cs = companiesByGroup[g]; return `<h3>${groupLabel[g]} · ${cs.length} companies · ${cs.reduce((a, c) => a + c.n, 0)} postings</h3>
      <p class="small">${cs.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || b.n - a.n).map(c => `${c.rank ? "#" + c.rank + " " : ""}${esc(c.name)}${c.stage && c.stage !== "Unknown" ? " <span class='muted'>" + esc(c.stage) + "</span>" : ""} <span class="muted">(${c.n})</span>`).join(" · ")}</p>`; }).join("")}`;
  $("#btn-about").onclick = e => { e.preventDefault(); openModal("#about-modal", e.currentTarget); };
  $("#about-close").onclick = () => closeModal("#about-modal");

  // ---------- chips ----------
  function chipEl(label, n, on) {
    const c = document.createElement("button"); c.type = "button";
    c.className = "chip" + (on ? " on" : ""); c.setAttribute("aria-pressed", on ? "true" : "false");
    c.innerHTML = `${esc(label)}${n != null ? `<span class="n">${n}</span>` : ""}`;
    return c;
  }
  function chipSet(el, items, set, { allowEmpty = true, allLabel = null } = {}) {
    el.innerHTML = "";
    if (allLabel) {
      const all = chipEl(allLabel, items.reduce((a, b) => a + b.n, 0), set.size === 0);
      all.onclick = () => { set.clear(); state.selectedJob = null; update(); }; el.appendChild(all);
    }
    for (const it of items) {
      const c = chipEl(it.label, it.n, set.has(it.id));
      c.onclick = () => { if (set.has(it.id)) { if (allowEmpty || set.size > 1) set.delete(it.id); } else set.add(it.id); state.selectedJob = null; update(); };
      el.appendChild(c);
    }
  }
  // the strip at the top of the rail: every filter that narrows the slice, each removable in place
  function renderActiveFilters() {
    const items = [];
    const add = (label, remove) => items.push({ label, remove });
    const d = defaults();
    if (!(state.family.size === 1 && state.family.has("pm"))) for (const f of state.family) add(G.families[f], () => { if (state.family.size > 1) state.family.delete(f); else state.family = d.family; });
    for (const l of state.level) add(G.level_labels[l], () => state.level.delete(l));
    if (state.group.size < GROUPS.length) for (const g of state.group) add(groupLabel[g], () => { if (state.group.size > 1) state.group.delete(g); else state.group = new Set(GROUPS); });
    for (const s of state.sector) add(s, () => state.sector.delete(s));
    for (const f of state.fund) add("Backed by " + f, () => state.fund.delete(f));
    for (const s of state.stage) add(s, () => state.stage.delete(s));
    for (const c of state.company) add(c, () => state.company.delete(c));
    for (const c of state.country) add(c, () => state.country.delete(c));
    if (state.remote) add("Remote", () => { state.remote = false; });
    for (const y of state.yoe) add(YOE_BUCKETS.find(b => b[0] === y)[1], () => state.yoe.delete(y));
    for (const s of state.spec) add(SPEC_LABEL[s], () => state.spec.delete(s));
    for (const dg of state.degree) add(skillById[dg].name, () => state.degree.delete(dg));
    const sec = $("#active-filters"), el = $("#active-chips"); el.innerHTML = "";
    sec.hidden = items.length === 0;
    // a filter set from elsewhere (a company picked in the detail panel) lives inside "More filters": open it so the chip is visible
    const inner = state.sector.size + state.fund.size + state.stage.size + state.company.size + state.country.size + state.yoe.size + state.spec.size + state.degree.size + (state.remote ? 1 : 0) + (state.group.size < GROUPS.length ? 1 : 0);
    if (inner && !state.moreOpened) { $("#more-filters").open = true; state.moreOpened = true; }
    if (!inner) state.moreOpened = false;
    for (const it of items) {
      const c = chipEl(it.label, null, true); c.removeAttribute("aria-pressed"); c.setAttribute("aria-label", `Remove filter ${it.label}`);
      c.insertAdjacentHTML("beforeend", `<span class="x" aria-hidden="true">×</span>`);
      c.onclick = () => { it.remove(); state.selectedJob = null; update(); };
      el.appendChild(c);
    }
  }
  function countBy(jobs, fn) { const m = {}; for (const j of jobs) { const k = fn(j); if (k != null) m[k] = (m[k] || 0) + 1; } return m; }

  function renderControls() {
    renderActiveFilters();
    let m = countBy(jobsExcept("family"), j => j.family);
    chipSet($("#family-chips"), Object.entries(G.families).map(([id, label]) => ({ id, label, n: m[id] || 0 })).filter(x => x.n > 0), state.family, { allowEmpty: false });
    m = countBy(jobsExcept("level"), j => j.level);
    chipSet($("#level-chips"), G.levels.filter(id => m[id] > 0).map(id => ({ id, label: G.level_labels[id], n: m[id] })), state.level, { allLabel: "All levels" });
    m = countBy(jobsExcept("group"), j => j.group);
    chipSet($("#group-chips"), GROUPS.map(id => ({ id, label: groupLabel[id], n: m[id] || 0 })), state.group, { allowEmpty: false });
    m = countBy(jobsExcept("sector"), j => j.sector);
    chipSet($("#sector-chips"), (G.sectors || []).filter(x => m[x] > 0).sort((x, y) => m[y] - m[x]).map(id => ({ id, label: id, n: m[id] })), state.sector, { allLabel: "All industries" });
    // investors: multi-select chips (top 18 by count, or those matching the search), startups only
    const fj = jobsExcept("fund"); const fc = {};
    for (const j of fj) for (const f of (j.investors || [])) fc[f] = (fc[f] || 0) + 1;
    const fq = state.fundQuery.trim().toLowerCase();
    let fundItems = Object.entries(fc).filter(([f]) => !fq || f.toLowerCase().includes(fq)).sort((x, y) => y[1] - x[1]);
    if (!fq) fundItems = fundItems.filter(([f]) => state.fund.has(f) || fundItems.indexOf(fundItems.find(z => z[0] === f)) < 18);
    chipSet($("#fund-chips"), fundItems.map(([id, n]) => ({ id, label: id, n })), state.fund, { allLabel: fq ? null : "Any investor" });
    const sj2 = jobsExcept("stage"); const stc = {};
    for (const j of sj2) if (j.stage) stc[j.stage] = (stc[j.stage] || 0) + 1;
    chipSet($("#stage-chips"), STAGES.filter(s => stc[s] > 0).map(id => ({ id, label: id, n: stc[id] })), state.stage, { allLabel: "Any stage" });
    // company: selected chips + search dropdown
    m = countBy(jobsExcept("company"), j => j.company);
    chipSet($("#company-chips"), [...state.company].map(id => ({ id, label: id, n: m[id] || 0 })), state.company, {});
    const q = state.companyQuery.trim().toLowerCase(); const dd = $("#company-options");
    if (q) {
      const opts = Object.entries(m).filter(([c]) => c.toLowerCase().includes(q) && !state.company.has(c)).sort((a, b) => b[1] - a[1]).slice(0, 12);
      dd.hidden = opts.length === 0; dd.innerHTML = opts.map(([c, n]) => `<button type="button" class="opt" data-c="${esc(c)}"><span>${esc(c)}</span><span class="c">${n}</span></button>`).join("");
      dd.querySelectorAll(".opt").forEach(o => o.onclick = () => { state.company.add(o.dataset.c); state.companyQuery = ""; $("#company-search").value = ""; update(); });
    } else dd.hidden = true;
    m = countBy(jobsExcept("country"), j => j.country);
    const top = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([id, n]) => ({ id, label: id, n }));
    const cEl = $("#country-chips"); chipSet(cEl, top, state.country, { allLabel: "Anywhere" });
    const rem = chipEl("Remote", jobsExcept("country").filter(j => j.remote && (state.country.size === 0 || state.country.has(j.country))).length, state.remote); rem.onclick = () => { state.remote = !state.remote; update(); }; cEl.appendChild(rem);
    const yj = jobsExcept("yoe");
    chipSet($("#yoe-chips"), YOE_BUCKETS.map(([id, label, fn]) => ({ id, label, n: yj.filter(j => fn(j.yoe)).length })), state.yoe, { allLabel: "Any" });
    m = countBy(jobsExcept("spec"), j => j.specs.length ? j.specs[0] : null); const sj = jobsExcept("spec");
    chipSet($("#spec-chips"), Object.keys(SPEC_LABEL).map(id => ({ id, label: SPEC_LABEL[id], n: sj.filter(j => j.specs.includes(id)).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n), state.spec, { allLabel: "Any" });
    const dj = jobsExcept("degree");
    chipSet($("#degree-chips"), DEGREES.map(([id, label]) => ({ id, label, n: dj.filter(j => j.skills.includes(id)).length })), state.degree, { allLabel: "Any" });
    const leg = $("#cluster-legend"); leg.innerHTML = "";
    for (const [id, c] of Object.entries(CL)) {
      const r = document.createElement("button"); r.type = "button"; r.className = "row" + (state.clustersOff.has(id) ? " off" : "");
      r.setAttribute("aria-pressed", state.clustersOff.has(id) ? "false" : "true");
      r.innerHTML = `<span class="swatch" style="background:${clColor(id)}"></span>${esc(c.label)}`;
      r.onclick = () => { state.clustersOff.has(id) ? state.clustersOff.delete(id) : state.clustersOff.add(id); update(); };
      leg.appendChild(r);
    }
    document.querySelectorAll("#axis-toggle .chip").forEach(b => { const on = b.dataset.axis === state.axis; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.onclick = () => { state.axis = b.dataset.axis; buildGraph(sliceStats(sliceJobs())); renderControls(); }; });
    document.querySelectorAll("[data-subs]").forEach(b => { const on = b.dataset.subs === state.subs; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.onclick = () => { state.subs = b.dataset.subs; buildGraph(sliceStats(sliceJobs())); renderControls(); }; });
    $("#axis-hint").textContent = VIEWS[state.axis].hint;
    $("#axes3d").style.display = state.axis === "3d" ? "" : "none";
    for (const k of ["x", "z"]) {
      const sel = $("#ax-" + k);
      if (!sel.options.length) for (const [id, v] of Object.entries(AX3)) { const o = document.createElement("option"); o.value = id; o.textContent = v.label; sel.appendChild(o); }
      sel.value = state.ax3[k];
      sel.onchange = () => { state.ax3[k] = sel.value; buildGraph(sliceStats(sliceJobs())); };
    }
    $("#reset-view").onclick = () => { state.rot = { yaw: -0.6, pitch: 0.35 }; state.zoom3 = 1; render3d(); };
    $("#spin-view").onclick = () => { state.spin = !state.spin; $("#spin-view").classList.toggle("on", state.spin); if (state.spin) spinLoop(); };
  }
  $("#company-search").oninput = e => { state.companyQuery = e.target.value; renderControls(); };
  $("#fund-search").oninput = e => { state.fundQuery = e.target.value; renderControls(); };
  $("#clear-filters").onclick = () => { Object.assign(state, defaults()); state.selectedJob = null; state.companyQuery = ""; state.fundQuery = ""; $("#company-search").value = ""; $("#fund-search").value = ""; update(); };

  // ---------- job list ----------
  function renderJobList(jobs) {
    const q = state.jobQuery.toLowerCase();
    const list = jobs.filter(j => !q || (j.company + " " + j.title + " " + j.location).toLowerCase().includes(q)).slice(0, 200);
    const el = $("#job-list"); el.innerHTML = "";
    for (const j of list) {
      const d = document.createElement("button"); d.type = "button"; d.className = "job" + (state.selectedJob === j.id ? " on" : "");
      d.setAttribute("aria-pressed", state.selectedJob === j.id ? "true" : "false");
      d.innerHTML = `<div>${esc(j.title)}</div><div class="c">${esc(j.company)}${j.location ? " · " + esc(j.location) : ""}</div>`;
      d.onclick = () => { state.selectedJob = state.selectedJob === j.id ? null : j.id; state.selectedSkill = null; update(); };
      el.appendChild(d);
    }
    if (jobs.length > list.length) { const m = document.createElement("div"); m.className = "job c"; m.textContent = `… ${jobs.length - list.length} more, refine the search`; el.appendChild(m); }
  }
  $("#job-search").oninput = e => { state.jobQuery = e.target.value; renderJobList(sliceJobs()); };

  // ---------- graph ----------
  const svg = d3.select("#graph");
  const gRoot = svg.append("g");
  const gLanes = gRoot.append("g").attr("class", "lane");
  const gAxis = gRoot.append("g").attr("class", "axis");
  const gLinks = gRoot.append("g");
  const gSatLinks = gRoot.append("g");
  const gNodes = gRoot.append("g");
  let sim = null, nodeSel = null, linkSel = null, satLinkSel = null, nodes = [], links = [], satLinks = [];
  const pos = {};

  function drawFrame(width, height, pad) {
    gLanes.selectAll("*").remove(); gAxis.selectAll("*").remove();
    if (state.axis === "free" || state.axis === "3d") return;
    const innerH = height - pad.top - pad.bottom;
    // seniority lanes (quartiles of the seniority rank), bottom = earliest
    for (let i = 0; i < 4; i++) {
      const y0 = pad.top + (1 - (i + 1) / 4) * innerH;
      gLanes.append("rect").attr("x", pad.left - 6).attr("y", y0).attr("width", width - pad.left - pad.right + 12).attr("height", innerH / 4);
      // lane name in the left gutter, right-aligned, so it never sits under a node
      gLanes.append("text").attr("x", pad.left - 12).attr("y", y0 + innerH / 8 + 4).attr("text-anchor", "end").text(LANES[i][0]).append("title").text(LANES[i][1]);
    }
    if (state.axis === "career") {
      const cols = COLUMNS.filter(c => !state.clustersOff.has(c));
      const cw = (width - pad.left - pad.right) / cols.length;
      const rows = cw < 95 ? 3 : 2;   // headers staggered on two (or three, when narrow) rows so neighbouring names never touch
      cols.forEach((c, i) => {
        gLanes.append("text").attr("class", "col").attr("x", pad.left + cw * (i + 0.5)).attr("y", pad.top - 8 - 16 * (rows - 1 - (i % rows))).attr("text-anchor", "middle").style("fill", clColor(c)).text(COL_SHORT[c] || CL[c].label).append("title").text(CL[c].label);
        if (i) gLanes.append("line").attr("x1", pad.left + cw * i).attr("x2", pad.left + cw * i).attr("y1", pad.top).attr("y2", height - pad.bottom).attr("stroke", "rgba(255,255,255,0.06)");
      });
    } else {
      const a = VIEWS[state.axis];
      gAxis.append("text").attr("class", "end").attr("x", pad.left).attr("y", height - pad.bottom + 22).text("← " + a.left);
      gAxis.append("text").attr("class", "end").attr("x", width - pad.right).attr("y", height - pad.bottom + 22).attr("text-anchor", "end").text(a.right + " →");
    }
  }

  // ---------- 3D projection ----------
  const gFrame = gRoot.insert("g", ":first-child").attr("class", "frame");
  let view3 = null;   // { width, height, S, f }
  function coord3(d, cols, maxShare) {
    const ax = k => {
      const which = state.ax3[k];
      if (which === "common") return (d.share / maxShare) * 2 - 1;
      if (which === "cluster") return cols.length > 1 ? (cols.indexOf(d.cluster) / (cols.length - 1)) * 2 - 1 : 0;
      return d.axes[which];
    };
    return { x: ax("x"), y: d.axes.seniority * 2 - 1, z: ax("z") };
  }
  function project(p) {
    const { yaw, pitch } = state.rot;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy;           // rotate around Y
    const y2 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp;               // rotate around X
    const f = 3.2, s = f / (f + z2);
    const S = Math.min(view3.width, view3.height) * 0.36 * state.zoom3;
    return { sx: view3.width / 2 + x1 * s * S, sy: view3.height / 2 - y2 * s * S, s, depth: z2 };
  }
  function drawFrame3d() {
    gFrame.selectAll("*").remove();
    if (state.axis !== "3d") return;
    const L = (a, b, cls) => { const p = project(a), q = project(b); gFrame.append("line").attr("class", cls || "").attr("x1", p.sx).attr("y1", p.sy).attr("x2", q.sx).attr("y2", q.sy); };
    const T = (p3, text, cls, anchor) => { const p = project(p3); gFrame.append("text").attr("class", cls || "").attr("x", p.sx).attr("y", p.sy).attr("text-anchor", anchor || "middle").text(text); };
    const c = [-1, 1];
    // vertical edges + floor/ceiling
    for (const x of c) for (const z of c) L({ x, y: -1, z }, { x, y: 1, z });
    for (const y of c) { for (const x of c) L({ x, y, z: -1 }, { x, y, z: 1 }); for (const z of c) L({ x: -1, y, z }, { x: 1, y, z }); }
    // seniority lanes as dashed horizontal rectangles
    for (let i = 1; i < 4; i++) { const y = -1 + i / 2; for (const x of c) L({ x, y, z: -1 }, { x, y, z: 1 }, "lane-line"); for (const z of c) L({ x: -1, y, z }, { x: 1, y, z }, "lane-line"); }
    LANES.forEach(([name], i) => T({ x: -1.08, y: -1 + (i + 0.5) / 2, z: -1 }, name, "", "end"));
    const X = AX3[state.ax3.x], Z = AX3[state.ax3.z];
    T({ x: -1, y: -1.14, z: -1 }, X.lo ? "← " + X.lo : X.label, "axis-end", "start"); T({ x: 1, y: -1.14, z: -1 }, X.hi ? X.hi + " →" : "", "axis-end", "end");
    T({ x: 1.06, y: -1.14, z: -1 }, Z.lo ? "↙ " + Z.lo : Z.label, "axis-end", "start"); T({ x: 1.06, y: -1.14, z: 1 }, Z.hi ? Z.hi + " ↗" : "", "axis-end", "start");
    if (state.ax3.x === "cluster" || state.ax3.z === "cluster") {
      const cols = COLUMNS.filter(cc => !state.clustersOff.has(cc));
      cols.forEach((cc, i) => { const t = cols.length > 1 ? (i / (cols.length - 1)) * 2 - 1 : 0; const p3 = state.ax3.x === "cluster" ? { x: t, y: 1.1, z: -1 } : { x: 1.1, y: 1.1, z: t }; const p = project(p3); gFrame.append("text").attr("x", p.sx).attr("y", p.sy).attr("text-anchor", "middle").style("fill", clColor(cc)).text(COL_SHORT[cc] || CL[cc].label); });
    }
  }
  function render3d() {
    if (state.axis !== "3d" || !view3) return;
    for (const n of nodes) {
      if (n.sat) { const pp = n.parent; n.p3 = { x: pp.p3.x + n.off.x, y: pp.p3.y + n.off.y, z: pp.p3.z + n.off.z }; }
      const q = project(n.p3); n.x = q.sx; n.y = q.sy; n.ps = q.s; n.depth = q.depth;
    }
    drawFrame3d();
    nodeSel.sort((a, b) => b.depth - a.depth);   // far first
    nodeSel.attr("transform", d => `translate(${d.x},${d.y})`).style("opacity", d => 0.55 + 0.45 * Math.max(0, Math.min(1, (1.6 - d.depth) / 3.2)));
    nodeSel.select("circle").attr("r", d => d.r * d.ps);
    nodeSel.select("text").attr("dy", d => -d.r * d.ps - 4);
    linkSel.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    satLinkSel.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    declutter();
  }
  // ---------- labels: show a label only where it has room; bigger / selected / matched nodes win ----------
  const LBL_H = 14;
  let lblMinX = 2;
  function declutter() {
    if (!nodeSel) return;
    const box = svg.node().getBoundingClientRect(); const W = box.width || 900;
    const prio = d => {
      if (d.id === state.selectedSkill || (d.sat && d.subId === state.subFocus)) return 1e6;
      if (d.sat) return state.subs === "all" ? -1 : (state.match && state.match.subs.has(d.subId) ? 50 : 10) + d.share;
      const m = state.match; const hot = m && (m.matched.has(d.id) || m.required.has(d.id));
      if (d.share < 0.3 && !hot) return -1;                       // small nodes label only on hover
      return (hot ? 1000 : 0) + d.share * 100 + (d.ps || 1);
    };
    const boxes = [];
    const cands = nodes.filter(n => n.lw).map(n => ({ n, p: prio(n) })).filter(c => c.p >= 0).sort((a, b) => b.p - a.p);
    const shown = new Set();
    const hits = b => boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    for (const { n } of cands) {
      const r = n.r * (n.ps || 1), lw = n.lw + 4;
      let x0 = n.x - lw / 2; x0 = Math.max(lblMinX, Math.min(W - lw - 2, x0));   // keep the label inside the canvas and out of the lane gutter
      // try above the dot, then below it
      const above = { x0, x1: x0 + lw, y0: n.y - r - 4 - LBL_H, y1: n.y - r - 4, dy: -r - 4 };
      const below = { x0, x1: x0 + lw, y0: n.y + r + 4, y1: n.y + r + 4 + LBL_H, dy: r + 4 + LBL_H - 3 };
      const b = !hits(above) ? above : !hits(below) ? below : null;
      if (!b) continue;
      boxes.push(b); shown.add(n.id); n.lx = x0 + lw / 2 - n.x; n.ldy = b.dy;
    }
    nodeSel.classed("lbl", d => shown.has(d.id)).select("text").attr("x", d => shown.has(d.id) ? d.lx : 0).attr("dy", d => shown.has(d.id) ? d.ldy : -d.r * (d.ps || 1) - 4);
  }
  function relax3d(ns, iters = 60) {
    // push overlapping dots apart in 3D (cheap O(n^2); ~100 nodes)
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
        const a = ns[i], b = ns[j]; const dx = b.p3.x - a.p3.x, dy = b.p3.y - a.p3.y, dz = b.p3.z - a.p3.z;
        const d = Math.hypot(dx, dy, dz) || 1e-4, min = (a.r + b.r + 10) / (Math.min(view3.width, view3.height) * 0.36);
        if (d < min) { const push = (min - d) / d * 0.5; a.p3.x -= dx * push; a.p3.y -= dy * push * 0.3; a.p3.z -= dz * push; b.p3.x += dx * push; b.p3.y += dy * push * 0.3; b.p3.z += dz * push; }
      }
      for (const n of ns) { n.p3.x = Math.max(-1, Math.min(1, n.p3.x)); n.p3.y = Math.max(-1, Math.min(1, n.p3.y)); n.p3.z = Math.max(-1, Math.min(1, n.p3.z)); }
    }
  }
  let spinning = false;
  function spinLoop() { if (spinning) return; spinning = true; const step = () => { if (!state.spin || state.axis !== "3d") { spinning = false; return; } state.rot.yaw += 0.004; render3d(); requestAnimationFrame(step); }; requestAnimationFrame(step); }
  const zoomBehaviour = d3.zoom().scaleExtent([0.4, 4]).on("zoom", e => gRoot.attr("transform", e.transform));
  const rotateBehaviour = d3.drag().on("start", () => svg.classed("grabbing", true)).on("drag", e => { state.rot.yaw += e.dx * 0.006; state.rot.pitch = Math.max(-1.3, Math.min(1.3, state.rot.pitch + e.dy * 0.006)); render3d(); }).on("end", () => svg.classed("grabbing", false));
  function installInteraction() {
    svg.on(".zoom", null).on(".drag", null).on("wheel.zoom3", null);
    if (state.axis === "3d") {
      gRoot.attr("transform", null);
      svg.classed("grab", true).call(rotateBehaviour).on("wheel.zoom3", e => { e.preventDefault(); state.zoom3 = Math.max(0.4, Math.min(3, state.zoom3 * (e.deltaY < 0 ? 1.08 : 0.92))); render3d(); });
    } else { svg.classed("grab", false).call(zoomBehaviour); }
  }

  function bindNodes(stats) {
    linkSel = gLinks.selectAll("line").data(links, d => (d.source.id ?? d.source) + "|" + (d.target.id ?? d.target));
    linkSel.exit().remove();
    linkSel = linkSel.enter().append("line").attr("class", "link").merge(linkSel).attr("stroke-width", d => 0.5 + d.w * 5);
    if (state.axis === "3d") { const byId = Object.fromEntries(nodes.map(n => [n.id, n])); for (const l of links) { if (typeof l.source === "string") l.source = byId[l.source]; if (typeof l.target === "string") l.target = byId[l.target]; } }
    satLinkSel = gSatLinks.selectAll("line").data(satLinks, d => d.source.id);
    satLinkSel.exit().remove();
    satLinkSel = satLinkSel.enter().append("line").attr("class", "satlink").merge(satLinkSel);
    nodeSel = gNodes.selectAll("g.node").data(nodes, d => d.id);
    nodeSel.exit().remove();
    const enter = nodeSel.enter().append("g").attr("class", "node").attr("tabindex", 0).attr("role", "button");
    enter.append("circle"); enter.append("title"); enter.append("text").attr("text-anchor", "middle");
    nodeSel = enter.merge(nodeSel);
    nodeSel.on(".drag", null);
    nodeSel.select("circle").attr("r", d => d.r).attr("fill", d => d.sat ? d3.color(clColor(d.cluster)).darker(0.6).formatHex() : clColor(d.cluster));
    nodeSel.select("text").text(d => d.name).attr("dy", d => -d.r - 4).each(function (d) { d.lw = this.getComputedTextLength(); });
    const label = d => d.sat ? `${d.name} — mentioned in ${fmtPct(d.share)} of postings asking for ${d.parent.name}` : `${d.name} — ${fmtPct(d.share)} of postings`;
    nodeSel.select("title").text(label); nodeSel.attr("aria-label", label);
    nodeSel.on("mouseenter focus", e => d3.select(e.currentTarget).classed("hover", true)).on("mouseleave blur", e => d3.select(e.currentTarget).classed("hover", false));
    nodeSel.on("keydown", (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.dispatchEvent(new MouseEvent("click", { bubbles: true })); } });
    nodeSel.on("click", (e, d) => {
      e.stopPropagation();
      if (d.sat) { state.selectedSkill = d.parent.id; state.subFocus = d.subId; state.selectedJob = null; renderDetail(); paint(); return; }
      state.selectedSkill = state.selectedSkill === d.id ? null : d.id; state.subFocus = null; state.selectedJob = null;
      if (state.subs === "selected") buildGraph(stats); else paint();
      renderDetail();
    });
  }

  function buildGraph(stats) {
    const jobs = sliceJobs();
    const vis = G.skills.filter(s => !state.clustersOff.has(s.cluster) && !CRED(s.id) && stats.share(s.id) >= MIN_SHARE);
    const visIds = new Set(vis.map(s => s.id));
    const box = svg.node().getBoundingClientRect();
    const width = box.width || 900, height = box.height || 600;
    const scale = Math.min(width, height) / 720;
    const laneView = state.axis !== "free" && state.axis !== "3d";
    const pad = { top: state.axis === "career" ? 52 : 24, bottom: 44, left: laneView ? 132 : 60, right: 40 };
    lblMinX = laneView ? pad.left - 4 : 2;
    const maxShare = Math.max(0.05, ...vis.map(s => stats.share(s.id)));
    const cols = COLUMNS.filter(c => !state.clustersOff.has(c)); const cw = (width - pad.left - pad.right) / Math.max(1, cols.length);
    const clusterIds = Object.keys(CL);
    const cx = id => width / 2 + Math.cos((clusterIds.indexOf(id) / clusterIds.length) * 2 * Math.PI) * width * 0.3;
    const cy = id => height / 2 + Math.sin((clusterIds.indexOf(id) / clusterIds.length) * 2 * Math.PI) * height * 0.3;
    const innerW = width - pad.left - pad.right, innerH = height - pad.top - pad.bottom;
    const tx = d => state.axis === "free" ? cx(d.cluster)
      : state.axis === "career" ? pad.left + cw * (cols.indexOf(d.cluster) + 0.5) + (d.axes.ic_mgmt) * cw * 0.3
      : state.axis === "common" ? pad.left + 20 + (d.share / maxShare) * (innerW - 40)
      : pad.left + (d.axes[state.axis] + 1) / 2 * innerW;
    const ty = d => state.axis === "free" ? cy(d.cluster) : pad.top + 14 + (1 - d.axes.seniority) * (innerH - 28);
    nodes = vis.map(s => Object.assign(pos[s.id] ||= {}, { id: s.id, name: s.name, cluster: s.cluster, share: stats.share(s.id), axes: s.axes, r: (3 + 19 * Math.sqrt(stats.share(s.id))) * scale, sat: false }));
    for (const n of nodes) if (n.x === undefined || state.axis !== "3d" && n.from3d) { n.x = tx(n) + (Math.random() - 0.5) * 30; n.y = ty(n) + (Math.random() - 0.5) * 30; n.from3d = false; }
    if (state.axis === "3d") for (const n of nodes) n.from3d = true;
    // satellites: sub-skills of the selected skill, or of every visible skill
    satLinks = [];
    const parents = state.subs === "all" ? nodes : state.subs === "selected" && state.selectedSkill && visIds.has(state.selectedSkill) ? nodes.filter(n => n.id === state.selectedSkill) : [];
    for (const p of parents) {
      const ss = subStats(jobs, p.id);
      for (const sub of (SUBS[p.id] || [])) {
        const sh = ss.share(sub.id);
        const key = "sat:" + sub.id;
        const n = Object.assign(pos[key] ||= { x: p.x + (Math.random() - 0.5) * 40, y: p.y + (Math.random() - 0.5) * 40 }, { id: key, subId: sub.id, name: sub.name, cluster: p.cluster, share: sh, parent: p, r: (2 + 9 * Math.sqrt(sh)) * scale, sat: true });
        nodes.push(n); satLinks.push({ source: n, target: p });
      }
    }
    links = G.edges.filter(e => visIds.has(e.source.id ?? e.source) && visIds.has(e.target.id ?? e.target)).map(e => ({ source: e.source.id ?? e.source, target: e.target.id ?? e.target, w: e.jaccard }));
    drawFrame(width, height, pad);
    if (state.axis !== "3d") gFrame.selectAll("*").remove();
    installInteraction();
    if (sim) sim.stop();
    if (state.axis === "3d") {
      view3 = { width, height };
      const parentsOnly = nodes.filter(n => !n.sat);
      for (const n of parentsOnly) n.p3 = coord3(n, cols, maxShare);
      relax3d(parentsOnly);
      nodes.filter(n => n.sat).forEach((n, i, arr) => { const sibs = arr.filter(s => s.parent === n.parent); const k = sibs.indexOf(n), m = sibs.length; const ang = (k / m) * 2 * Math.PI; const rad = 0.12 + 0.02 * m; n.off = { x: Math.cos(ang) * rad, y: Math.sin(ang * 1.7) * 0.06, z: Math.sin(ang) * rad }; });
      bindNodes(stats);
      render3d();
      paint();
      return;
    }
    const positional = state.axis !== "free";
    sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(d => 90 + 90 * (1 - d.w * 3)).strength(positional ? 0 : d => Math.min(0.6, d.w * 1.5)))
      .force("sat", d3.forceLink(satLinks).distance(d => d.target.r + d.source.r + 14 * scale).strength(1))
      .force("charge", d3.forceManyBody().strength(d => d.sat ? -6 : positional ? -20 : -90 * scale))
      .force("collide", d3.forceCollide(d => d.r + (d.sat ? 5 : positional ? 10 : 16) * scale).iterations(3))
      .force("x", d3.forceX(d => d.sat ? d.parent.x : tx(d)).strength(d => d.sat ? 0.02 : positional ? 0.7 : 0.14))
      .force("y", d3.forceY(d => d.sat ? d.parent.y : ty(d)).strength(d => d.sat ? 0.02 : positional ? 0.7 : 0.14))
      .alpha(0.9).alphaDecay(0.035);

    bindNodes(stats);
    nodeSel.style("opacity", null);
    nodeSel.call(d3.drag().on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; }).on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
    let tickN = 0;
    sim.on("tick", () => {
      for (const n of nodes) if (!n.sat) { n.x = Math.max(pad.left + n.r, Math.min(width - pad.right - n.r, n.x)); n.y = Math.max(pad.top + n.r, Math.min(height - pad.bottom - n.r, n.y)); }
      linkSel.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      satLinkSel.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
      if (++tickN % 3 === 0) declutter();
    }).on("end", declutter);
    paint();
  }
  svg.on("click", () => { const had = state.selectedSkill; state.selectedSkill = null; state.selectedJob = null; state.subFocus = null; if (had && state.subs === "selected") buildGraph(sliceStats(sliceJobs())); else paint(); renderDetail(); renderJobList(sliceJobs()); });

  function paint() {
    const job = state.selectedJob ? G.jobs.find(j => j.id === state.selectedJob) : null;
    const jobSkills = job ? new Set(job.skills) : null;
    const jobSubs = job ? new Set(job.sub || []) : null;
    const neighbours = new Set();
    if (state.selectedSkill) for (const l of links) { const s = l.source.id ?? l.source, t = l.target.id ?? l.target; if (s === state.selectedSkill) neighbours.add(t); if (t === state.selectedSkill) neighbours.add(s); }
    const m = state.match;
    const positional = state.axis !== "free";
    const sel3 = state.axis === "3d" && state.selectedSkill;
    nodeSel.attr("class", d => {
      let c = "node" + (d.sat ? " sat" : d.share < 0.3 ? " small" : "");
      if (d.sat) {
        if (state.selectedSkill && d.parent.id !== state.selectedSkill) c += " dim";
        if (d.subId === state.subFocus) c += " selected";
        if (m && m.subs.has(d.subId)) c += " matched"; else if (m && m.required.has(d.parent.id)) c += " gap";
        if (jobSubs && !jobSubs.has(d.subId)) c += " dim";
        return c;
      }
      if (state.selectedSkill) c += d.id === state.selectedSkill ? " selected" : neighbours.has(d.id) ? "" : " dim";
      else if (jobSkills) c += jobSkills.has(d.id) ? " selected" : " dim";
      if (m) { if (m.matched.has(d.id)) c += " matched"; else if (m.required.has(d.id)) c += " gap"; }
      return c;
    });
    linkSel.attr("class", d => { const s = d.source.id ?? d.source, t = d.target.id ?? d.target; const hi = state.selectedSkill && (s === state.selectedSkill || t === state.selectedSkill); return "link" + (hi ? " hi" : positional ? " hidden-link" : ""); });
    declutter();
  }

  // ---------- detail panel ----------
  function bar(label, v, color) { return `<div class="bar"><span>${esc(label)}</span><div class="track"><div class="fill" style="width:${Math.round(v * 100)}%;background:${color || "var(--secondary)"}"></div></div><span class="v">${fmtPct(v)}</span></div>`; }
  function tag(id, cls = "") { const s = skillById[id]; return `<button type="button" class="tag ${cls}" data-skill="${id}"><span class="dot" style="background:${clColor(s.cluster)}"></span>${esc(s.name)}</button>`; }
  // disclosures (GradBuddy D-15): one-word trigger, opens in place; open state survives a re-render
  function disc(key, label, inner) { return `<details class="disc" data-k="${key}"${state.openDisc.has(key) ? " open" : ""}><summary>${label}</summary><div class="disc-body">${inner}</div></details>`; }
  function wireDiscs(root) { root.querySelectorAll("details[data-k]").forEach(d => { d.ontoggle = () => { d.open ? state.openDisc.add(d.dataset.k) : state.openDisc.delete(d.dataset.k); }; }); }
  function selectSkill(id) { state.selectedSkill = id; state.selectedJob = null; state.subFocus = null; if (state.subs === "selected") buildGraph(sliceStats(sliceJobs())); else paint(); renderDetail(); }
  function wireTags(root) { root.querySelectorAll(".tag[data-skill]").forEach(t => t.onclick = () => selectSkill(t.dataset.skill)); }
  function currentLadderKey() { if (state.level.size === 1) return LEVEL_TO_LADDER[[...state.level][0]]; return null; }

  function renderSkill(s, jobs, stats) {
    const withSkill = jobs.filter(j => j.skills.includes(s.id));
    const comp = {}; for (const j of withSkill) comp[j.company] = (comp[j.company] || 0) + 1;
    const topComp = Object.entries(comp).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const related = links.filter(l => (l.source.id ?? l.source) === s.id || (l.target.id ?? l.target) === s.id).map(l => ({ id: (l.source.id ?? l.source) === s.id ? (l.target.id ?? l.target) : (l.source.id ?? l.source), w: l.w })).sort((a, b) => b.w - a.w).slice(0, 8);
    const levelsWithData = G.levels.filter(l => jobs.filter(j => j.level === l).length >= 8);
    const m = state.match; const haveSubs = m ? m.subs : null;
    const ss = subStats(jobs, s.id);
    const subsHtml = (s.subskills || []).map(sub => {
      const cls = (haveSubs ? (haveSubs.has(sub.id) ? " have" : " miss") : "") + (state.subFocus === sub.id ? " focus" : "");
      return `<div class="sub${cls}" id="sub-${sub.id}"><span class="name">${esc(sub.name)}</span><span class="pct" title="share of postings asking for ${esc(s.name)} that mention this">${fmtPct(ss.share(sub.id))}</span><span class="ex">${esc(sub.example)}</span></div>`;
    }).join("");
    const here = currentLadderKey();
    const ladder = s.ladder ? `<div class="ladder">${LADDER_KEYS.map(([k, lab]) => `<span class="lv${here === k ? " here" : ""}">${lab}</span><span>${esc(s.ladder[k])}</span>`).join("")}</div>` : "";
    const ev = s.evidence || {};
    const evGroups = EV_GROUPS.filter(([k]) => (ev[k] || []).length);
    if (evGroups.length && !evGroups.some(([k]) => k === state.evTab)) state.evTab = evGroups[0][0];
    const evHtml = evGroups.length ? `<div class="evtabs">${evGroups.map(([k, lab]) => `<button type="button" class="chip${state.evTab === k ? " on" : ""}" aria-pressed="${state.evTab === k}" data-ev="${k}">${lab}</button>`).join("")}</div>
      ${(ev[state.evTab] || []).map(q => `<blockquote class="quote">“${esc(q.text)}”<span class="src">${esc(q.company)} · <a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.title)}</a></span></blockquote>`).join("")}` : "";
    const build = (s.build || []).length ? `<ul class="build">${s.build.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : "";
    const signals = (s.signals || []).length ? `<p class="muted" style="margin:10px 0 0">Resume lines that show it</p><ul class="signals">${s.signals.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : "";
    const secs = (G.sectors || []).map(sec => { const sj = jobs.filter(j => j.sector === sec); return { sec, v: sj.length >= 15 ? sj.filter(j => j.skills.includes(s.id)).length / sj.length : null }; }).filter(x => x.v !== null).sort((x, y) => y.v - x.v);
    const where = `<p class="muted" style="margin:0 0 4px">By level</p><div class="bars">${levelsWithData.map(l => { const lj = jobs.filter(j => j.level === l); return bar(G.level_labels[l], lj.filter(j => j.skills.includes(s.id)).length / lj.length); }).join("")}</div>
      ${secs.length > 1 ? `<p class="muted" style="margin:12px 0 4px">By industry</p><div class="bars">${secs.slice(0, 8).map(x => bar(x.sec, x.v)).join("")}</div>` : ""}
      <p class="muted" style="margin:12px 0 4px">By company group</p><div class="bars">${GROUPS.map(g => bar(groupLabel[g], s.by_group[g] || 0)).join("")}</div>`;
    const postings = `<p class="muted" style="margin:0 0 4px">Companies asking most</p><div class="rows">${topComp.map(([c, n]) => `<div class="r"><button type="button" class="link-ish" data-company="${esc(c)}" title="Filter the map to ${esc(c)}">${esc(c)}</button><span class="c">${plural(n, "posting", "postings")}</span></div>`).join("")}</div>
      <p class="muted" style="margin:12px 0 4px">Example postings</p><div class="rows">${withSkill.slice(0, 6).map(j => `<div class="r"><a href="${esc(j.url)}" target="_blank" rel="noopener">${esc(j.title)}</a><span class="c">${esc(j.company)}</span></div>`).join("")}</div>`;
    // resting state: what it is, how often, what it breaks down into. Everything explanatory is one click away.
    return `<div class="detail"><div class="kicker" style="color:${clColor(s.cluster)}">${esc(CL[s.cluster].label)}</div><h2>${esc(s.name)}</h2>
      ${s.what ? `<p class="what">${esc(s.what)}</p>` : ""}
      <div class="big">${fmtPct(stats.share(s.id))}</div><div class="facts">of ${plural(stats.n, "posting", "postings")} in this slice ask for it · ${fmtPct(s.share)} across all ${G.meta.n_jobs.toLocaleString()}</div>
      ${subsHtml ? `<h3>What it breaks down into</h3>${haveSubs ? `<p class="subgap"><span class="have">✓ evidenced in your text</span> · <span class="miss">not evidenced</span></p>` : ""}${subsHtml}` : ""}
      <div class="disc-row">
        ${ladder ? disc("ladder", "At each level", ladder) : ""}
        ${evHtml ? disc("sources", "Sources", evHtml) : ""}
        ${disc("where", "Where it's asked", where)}
        ${build || signals ? disc("build", "How to build it", build + signals) : ""}
        ${disc("postings", "Postings", postings)}
      </div>
      <h3>Often appears with</h3><div class="taglist">${related.map(r => tag(r.id)).join("") || "<span class='muted small'>none in this slice</span>"}</div></div>`;
  }

  function renderDetail() {
    const el = $("#detail"); const jobs = sliceJobs(); const stats = sliceStats(jobs);
    if (state.selectedJob) {
      const j = G.jobs.find(x => x.id === state.selectedJob);
      const byCluster = {};
      for (const k of j.skills) { const s = skillById[k]; (byCluster[s.cluster] ||= []).push(k); }
      const subSet = new Set(j.sub || []);
      el.innerHTML = `<div class="detail"><h2>${esc(j.title)}</h2><div class="kicker">${esc(j.company)}${j.rank ? " (#" + j.rank + ")" : ""} · ${groupLabel[j.group]}${(j.investors || []).length ? " · backed by " + j.investors.map(esc).join(", ") : ""}${j.stage && j.stage !== "Unknown" ? " · " + esc(j.stage) : ""}${j.industry ? " · " + esc(j.industry) : ""}${j.location ? " · " + esc(j.location) : ""}${j.remote ? " · remote" : ""}</div>
        <p class="small">${esc(G.level_labels[j.level])} · ${esc(G.families[j.family])}${j.yoe ? ` · asks for ${j.yoe}+ years` : ""}${j.specs.length ? " · " + j.specs.map(s => SPEC_LABEL[s] || s).map(esc).join(", ") : ""}</p>
        <p class="small muted">${esc(j.snippet)}…</p>
        <p><a href="${esc(j.url)}" target="_blank" rel="noopener">Open the posting ↗</a></p>
        <h3>${j.skills.filter(k => !CRED(k)).length} requirements found</h3>
        ${Object.entries(byCluster).sort((a, b) => b[1].length - a[1].length).map(([c, ks]) => `<div class="small muted" style="margin-top:8px">${esc(CL[c].label)}</div><div class="taglist">${ks.map(k => tag(k, state.match ? (state.match.matched.has(k) ? "good" : "bad") : "")).join("")}</div>`).join("")}
        ${subSet.size ? `<h3>Specific asks in this posting</h3><div class="taglist">${[...subSet].map(id => subById[id] ? `<span class="tag" data-skill="${subById[id].parent}" title="${esc(skillById[subById[id].parent].name)}">${esc(subById[id].name)}</span>` : "").join("")}</div>` : ""}
        <button id="match-this" class="outline wide">Match my resume against this role</button></div>`;
      $("#match-this").onclick = e => openMatch(j.id);
      wireTags(el); return;
    }
    if (state.selectedSkill) {
      el.innerHTML = renderSkill(skillById[state.selectedSkill], jobs, stats);
      el.querySelectorAll("[data-ev]").forEach(t => t.onclick = () => { state.evTab = t.dataset.ev; renderDetail(); });
      el.querySelectorAll("[data-company]").forEach(t => { t.onclick = () => { state.company = new Set([t.dataset.company]); update(); $(".rail.left").scrollTop = 0; }; });
      wireTags(el); wireDiscs(el);
      const f = state.subFocus && el.querySelector("#sub-" + state.subFocus); if (f) f.scrollIntoView({ block: "center" }); else el.scrollTop = 0;
      return;
    }
    const top = G.skills.filter(s => !CRED(s.id)).map(s => ({ s, v: stats.share(s.id) })).sort((a, b) => b.v - a.v).slice(0, 12);
    const yoe = jobs.filter(j => j.yoe).map(j => j.yoe).sort((a, b) => a - b);
    const med = yoe.length ? yoe[Math.floor(yoe.length / 2)] : null;
    const famLabel = [...state.family].map(f => G.families[f]).join(" / ");
    const lvlLabel = state.level.size ? [...state.level].map(l => G.level_labels[l]).join(" / ") : "all levels";
    const active = [state.sector.size ? [...state.sector].join(", ") : null, state.company.size ? [...state.company].join(", ") : null, state.country.size ? [...state.country].join(", ") : null, state.remote ? "remote" : null, state.yoe.size ? [...state.yoe].join("/") + " yrs" : null, state.spec.size ? [...state.spec].map(s => SPEC_LABEL[s]).join(", ") : null, state.degree.size ? [...state.degree].map(d => skillById[d].name).join(", ") : null, state.fund.size ? "backed by " + [...state.fund].join(", ") : null, state.stage.size ? [...state.stage].join("/") : null].filter(Boolean);
    const lad = state.level.size === 0 && state.family.size === 1 ? ladder(jobs) : "";
    el.innerHTML = `<div class="detail"><h2>${esc(famLabel)}</h2><div class="facts">${esc(lvlLabel)} · ${plural(stats.n, "posting", "postings")} · ${plural(new Set(jobs.map(j => j.company)).size, "company", "companies")}${med ? ` · median ask ${med}+ years` : ""}</div>
      ${active.length ? `<p class="active-filters">${esc(active.join(" · "))}</p>` : ""}
      <a class="ask" href="#" id="ask-match">${state.match ? "Match again or against something else →" : "Match your resume to see what's missing →"}</a>
      <h3>Most requested</h3><div class="bars">${top.map(t => bar(t.s.name, t.v, clColor(t.s.cluster))).join("")}</div>
      ${lad ? `<div class="disc-row">${disc("moveup", "What changes as you move up", lad)}</div>` : ""}</div>`;
    $("#ask-match").onclick = e => { e.preventDefault(); openMatch(state.selectedJob); };
    wireTags(el); wireDiscs(el);
  }
  function ladder(jobs) {
    const lv = G.levels.filter(l => jobs.filter(j => j.level === l).length >= 8);
    if (lv.length < 2) return "";
    const st = Object.fromEntries(lv.map(l => [l, sliceStats(jobs.filter(j => j.level === l))]));
    let html = "";
    for (let i = 1; i < lv.length; i++) {
      const a = st[lv[i - 1]], b = st[lv[i]];
      const gain = G.skills.filter(s => !CRED(s.id)).map(s => ({ s, d: b.share(s.id) - a.share(s.id) })).filter(x => x.d > 0.08).sort((x, y) => y.d - x.d).slice(0, 4);
      if (!gain.length) continue;
      html += `<div class="small" style="margin:6px 0 4px"><strong>${esc(G.level_labels[lv[i - 1]])} → ${esc(G.level_labels[lv[i]])}</strong></div><div class="taglist">${gain.map(g => tag(g.s.id) + `<span class="muted small" style="align-self:center">+${Math.round(g.d * 100)}pts</span>`).join("")}</div>`;
    }
    return html;
  }

  // ---------- matching ----------
  let matchText = "";
  async function readFile(file) {
    $("#file-status").textContent = `Reading ${file.name}…`;
    try {
      if (/\.pdf$/i.test(file.name)) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        const t = [];
        for (let p = 1; p <= pdf.numPages; p++) { const pg = await pdf.getPage(p); const c = await pg.getTextContent(); t.push(c.items.map(i => i.str + (i.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+\n/g, "\n")); }
        matchText = t.join("\n");
      } else if (/\.docx$/i.test(file.name)) matchText = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
      else matchText = await file.text();
      const words = matchText.trim() ? matchText.trim().split(/\s+/).length : 0;
      // a scanned PDF has pictures of text and nothing to read
      $("#file-status").textContent = words < 40 ? `${file.name} — only ${words} words could be read. If this is a scan, paste the text of your resume in the box.` : `${file.name} — ${words.toLocaleString()} words read.`;
    } catch (e) { $("#file-status").textContent = "Could not read that file: " + e.message; matchText = ""; }
  }
  const drop = $("#drop");
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); };
  $("#file").onchange = e => { if (e.target.files[0]) readFile(e.target.files[0]); };

  function targetOptions(preselect) {
    const sel = $("#match-target"); sel.innerHTML = "";
    const add = (v, label) => { const o = document.createElement("option"); o.value = v; o.textContent = label; sel.appendChild(o); };
    for (const f of Object.keys(G.families)) for (const l of ["__all", ...G.levels]) {
      const n = G.jobs.filter(j => j.family === f && (l === "__all" || j.level === l)).length;
      if (n >= 5) add(`agg:${f}:${l}`, `${G.families[f]} — ${l === "__all" ? "all levels" : G.level_labels[l]} (${n} postings)`);
    }
    const cur = sliceJobs();
    if (cur.length >= 5 && cur.length < G.jobs.length) add("slice", `Current filters (${cur.length} postings)`);
    const og = document.createElement("optgroup"); og.label = "Specific postings in the current slice"; sel.appendChild(og);
    for (const j of cur.slice(0, 300)) { const o = document.createElement("option"); o.value = "job:" + j.id; o.textContent = `${j.company} — ${j.title}`; og.appendChild(o); }
    if (preselect) sel.value = "job:" + preselect;
    else if (cur.length >= 5 && cur.length < G.jobs.length) sel.value = "slice";
    else if (state.family.size === 1) sel.value = `agg:${[...state.family][0]}:${state.level.size === 1 ? [...state.level][0] : "__all"}`;
  }
  // modals: focus moves in on open, back to the opener on close; Escape closes
  let modalOpener = null;
  function openModal(id, opener) { modalOpener = opener || document.activeElement; const m = $(id); m.hidden = false; (m.querySelector("textarea, select, input:not([hidden]), button:not(.close)") || m.querySelector(".modal-card")).focus(); }
  function closeModal(id) { $(id).hidden = true; if (modalOpener && modalOpener.focus) modalOpener.focus(); modalOpener = null; }
  document.addEventListener("keydown", e => { if (e.key === "Escape") for (const id of ["#match-modal", "#about-modal"]) if (!$(id).hidden) closeModal(id); });
  for (const id of ["#match-modal", "#about-modal"]) $(id).addEventListener("click", e => { if (e.target === $(id)) closeModal(id); });
  function openMatch(jobId) { targetOptions(jobId); openModal("#match-modal"); }
  $("#btn-match").onclick = () => openMatch(state.selectedJob);
  $("#match-close").onclick = () => closeModal("#match-modal");

  const MATCH = Matcher.createMatcher({ taxonomy: TAX, subskills: SUBS, graph: G });
  const PERSONA_TEXT = {
    experienced_in_role: p => `Reads as a <b>${esc(Matcher.LADDER_LABEL[p.level])}</b> product profile: ${fmtYears(p.pmYears)} in product roles, ${fmtYears(p.years)} overall.`,
    pivoter: p => `Reads as a <b>career pivot into product</b> from ${p.backgrounds.length ? esc(p.backgrounds.map(b => Matcher.VIA_LABEL[b] || b).join(", ")) : "another field"}: ${fmtYears(p.years)} of experience, none yet under a product title.`,
    new_to_role: p => `Reads as <b>early-career, new to product</b>${p.pmIntern ? " with a product internship" : ""}${p.years >= 1 ? `, ${fmtYears(p.years)} of other work` : ""}.`,
  };
  const fmtYears = y => y < 1 ? "under a year" : `${Math.round(y * 2) / 2} yrs`;
  const STATUS_CLS = { evidenced: "good", transferable: "amber", presumed: "thin", thin: "thin", gap: "bad" };
  function rowTag(row, cls) { return skillById[row.id] ? tag(row.id, cls) : `<span class="tag ${cls}">${esc(row.slotName)}</span>`; }
  function meter(label, v, sub) { return `<div class="meter"><div class="lbl">${label}</div><div class="val">${v == null ? "–" : fmtPct(v)}</div><div class="bar"><i style="width:${Math.round((v || 0) * 100)}%"></i></div><div class="sub">${sub}</div></div>`; }

  function renderMatch(r, label, isJob) {
    const p = r.profile; const rows = r.rows;
    const by = st => rows.filter(x => x.status === st).sort((a, b) => (a.tier === b.tier ? b.w - a.w : a.tier === "core" ? -1 : b.tier === "core" ? 1 : a.tier === "common" ? -1 : 1));
    const evid = by("evidenced"), trans = by("transferable"), thin = by("thin"), gaps = by("gap"), presumed = by("presumed");
    const st = r.standing;
    // a person who held this role at or above the target level: say so before the number
    const standingNote = st ? ` You held this role${st.above ? ` above this level (${esc(Matcher.LADDER_LABEL[st.level])}, ${fmtYears(st.years)})` : ` at this level for ${fmtYears(st.years)}`}${st.employers.length ? `, and we hold ${esc(st.employers[0])}'s own postings` : ""}. ${st.presumed ? `<b>${st.presumed}</b> ${st.presumed === 1 ? "requirement is" : "requirements are"} presumed from that; your resume does not show ${st.presumed === 1 ? "it" : "them"}.` : ""}` : "";
    const coreRows = rows.filter(x => x.tier === "core"); const coreHave = coreRows.filter(x => x.status === "evidenced" || x.status === "transferable").length;
    const col = r.overall >= 0.7 ? "var(--primary)" : "var(--warning)";
    const shareOf = w => fmtPct(w);
    const list = (xs, n) => xs.slice(0, n).map(x => esc(x.slotName)).join(", ") + (xs.length > n ? ` and ${xs.length - n} more` : "");
    const levelNote = r.targetLevel && r.targetLevel !== p.level && p.persona === "experienced_in_role" ? (isJob ? ` This posting is a ${esc(Matcher.LADDER_LABEL[r.targetLevel])} role; the ladder notes below describe that bar.` : ` You chose the ${esc(Matcher.LADDER_LABEL[r.targetLevel])} bar; the ladder notes below describe that bar.`) : "";
    const thinNamed = evid.filter(x => !x.depth);
    const mainGaps = gaps.filter(g => g.tier !== "diff");
    const yoeAsk = r.creds.filter(c => c.id.startsWith("yoe_")).sort((a, b) => b.w - a.w)[0];
    const creds = r.creds.filter(c => !c.id.startsWith("yoe_"));
    if (yoeAsk) creds.unshift({ id: "yoe", name: `${yoeAsk.name.replace(" experience", "")} experience asked (you: ${fmtYears(p.years)})`, w: yoeAsk.w, have: yoeAsk.have, detail: null });
    const missSubs = id => (SUBS[id] || []).filter(s => !r.subs.has(s.id)).map(s => s.name);
    const evItem = x => `<li>${rowTag(x, STATUS_CLS[x.status])}${x.tier === "core" ? ` <span class="muted small">core · asked in ${shareOf(x.w)}</span>` : ` <span class="muted small">asked in ${shareOf(x.w)}</span>`}${x.lines[0] ? `<span class="q">${esc(x.lines[0].text.slice(0, 160))}</span>` : ""}${x.status === "transferable" && x.signals[0] ? `<span class="say">Postings say it like: <b>${esc(x.signals[0])}</b> <span class="muted">(via ${esc(x.via.map(v => Matcher.VIA_LABEL[v] || v).join(", "))})</span></span>` : ""}${x.ladder ? `<span class="ladder small"><span class="muted">At ${esc(Matcher.LADDER_LABEL[r.targetLevel])}:</span> ${esc(x.ladder)}</span>` : ""}</li>`;
    // Say so when the job history could not be read: the score then counts no roles and no years.
    const unread = r.parsed.roles.length === 0 && r.parsed.lines >= 15 ? `<p class="small" style="margin:0 0 10px;padding:8px 10px;border:1px solid var(--warning);border-radius:8px"><b>We did not find any jobs with dates in this text.</b> Roles and years are not counted in this result. Put each job title and its dates on one line (for example "Product Manager, Acme, 2021 – 2024"), or paste the text of your resume.</p>` : "";
    // A template still has its placeholder years ("20XX"): the jobs are read, the years are not.
    const placeholder = r.parsed.placeholderDates && r.parsed.roles.some(x => x.placeholder) ? `<p class="small" style="margin:0 0 10px;padding:8px 10px;border:1px solid var(--warning);border-radius:8px"><b>Some dates in this text are placeholders ("20XX").</b> We read those jobs, but we cannot count their years. Write the real years to get a correct level.</p>` : "";
    const res = $("#match-results"); res.hidden = false;
    res.innerHTML = unread + placeholder + `
      <div class="score-row"><div class="ring" style="background:conic-gradient(${col} ${r.overall * 360}deg, var(--muted) 0)"><span>${fmtPct(r.overall)}</span></div>
        <div><p class="headline">${PERSONA_TEXT[p.persona](p)}${levelNote}${standingNote}</p>
        <p class="muted small" style="margin:0">Against <b>${esc(label)}</b>${isJob ? "" : ` (${r.req.n.toLocaleString()} postings)`}: <b>${coreHave} of ${coreRows.length}</b> must-haves evidenced${coreRows.some(x => x.status === "thin") ? ` (${coreRows.filter(x => x.status === "thin").length} only named)` : ""}${thin.length ? `; ${thin.length} ${thin.length === 1 ? "skill" : "skills"} named but not shown` : ""}${mainGaps.length ? `; missing ${list(mainGaps, 3)}` : "; nothing important missing"}.
        ${r.whatIfSkills.length ? `Evidence ${r.whatIfSkills.length === 1 ? "that one" : `those ${r.whatIfSkills.length === 3 ? "three" : "two"}`} alone and this reads <b>${fmtPct(r.whatIf)}</b>.` : ""}</p></div></div>
      <div class="meters">
        ${meter("Must-haves", r.core, `${coreRows.length} skills in over half of postings`)}
        ${meter("Common asks", r.common, `${rows.filter(x => x.tier === "common").length} skills in 25–50% of postings`)}
        ${meter("Depth", r.depth, `evidenced skills shown with specifics or an outcome`)}
      </div>
      ${creds.length ? `<div class="credrow">${creds.map(c => `<span class="${c.have ? "ok" : "no"}" title="asked in ${shareOf(c.w)} of postings">${c.have ? "✓" : "○"} ${esc(c.name)}${c.detail ? ` <span class="muted">(${esc(c.detail)})</span>` : ""}</span>`).join("")}</div>` : ""}
      ${r.industries.length ? `<p class="muted small" style="margin:8px 0 0">Industries hiring for this: ${r.industries.slice(0, 8).map(d => `<span class="${d.have ? "ok" : ""}" style="${d.have ? "color:var(--primary)" : ""}">${d.have ? "✓ " : ""}${esc(d.name)} ${shareOf(d.w)}</span>`).join(" · ")}. One industry is enough; the others are context, not gaps.</p>` : ""}
      <div class="cols" style="margin-top:14px">
        <div><h4>Evidenced <span class="muted small">(${evid.length})</span></h4><div class="taglist">${evid.map(x => rowTag(x, "good")).join("") || "<span class='muted small'>Nothing yet.</span>"}</div>
          ${trans.length ? `<h4 style="margin-top:12px">Transferable <span class="muted small">(${trans.length}) — real, but said in another field's words</span></h4><div class="taglist">${trans.map(x => rowTag(x, "amber")).join("")}</div>` : ""}
          ${presumed.length ? `<h4 style="margin-top:12px">Presumed from roles you held <span class="muted small">(${presumed.length})</span></h4><div class="taglist">${presumed.map(x => rowTag(x, "thin")).join("")}</div><p class="muted small" style="margin:4px 0 0">People who hold this role do these. Your resume does not show them, so they earn part credit. A line of evidence earns full credit.</p>` : ""}
          ${thin.length ? `<h4 style="margin-top:12px">Named, not shown <span class="muted small">(${thin.length})</span></h4><div class="taglist">${thin.map(x => rowTag(x, "thin")).join("")}</div><p class="muted small" style="margin:4px 0 0">Listed as a word, or hinted at, but no work or project line shows it.</p>` : ""}</div>
        <div><h4>Gaps <span class="muted small">(most important first)</span></h4><div class="taglist">${gaps.filter(g => g.tier !== "diff").map(x => rowTag(x, "bad")).join("") || "<span class='muted small'>No gaps among the core and common asks.</span>"}</div>
          ${gaps.some(g => g.tier === "diff") ? `<p class="muted small" style="margin:8px 0 0">Differentiators you don't show (asked in 10–25%): ${gaps.filter(g => g.tier === "diff").map(x => esc(x.slotName)).join(", ")}.</p>` : ""}
          ${r.extras.length ? `<p class="muted small" style="margin:8px 0 0">You also show ${r.extras.length} skills this target rarely asks for: ${r.extras.slice(0, 8).map(e => esc(e.name)).join(", ")}.</p>` : ""}</div>
      </div>
      ${trans.length ? `<div class="learn"><strong>Say it in product words</strong><p class="muted small" style="margin:4px 0 0">These lines already show the skill. Rewrite them the way postings phrase it so a screener sees it too.</p><ul class="evlist">${trans.slice(0, 5).map(evItem).join("")}</ul></div>` : ""}
      ${presumed.length ? `<div class="learn"><strong>Show what you already do</strong><p class="muted small" style="margin:4px 0 0">Add one line for each of these. Start with the ones asked for most.</p><ol>${presumed.slice(0, 6).map(x => `<li>${esc(x.slotName)} <span class="muted small">— asked in ${shareOf(x.w)} of postings${x.tier === "core" ? ", core" : ""}${x.signals && x.signals[0] ? `. Postings say it like: <b>${esc(x.signals[0])}</b>` : ""}</span></li>`).join("")}</ol></div>` : ""}
      ${gaps.filter(g => g.tier !== "diff").length ? `<div class="learn"><strong>${p.persona === "new_to_role" ? "Build next" : "Learn or evidence next"}</strong><ol>${gaps.filter(g => g.tier !== "diff").slice(0, 5).map(x => `<li>${rowTag(x, "bad").replace('class="tag bad"', 'class="tag bad" style="border:0;padding:0"')} <span class="muted small">— asked in ${shareOf(x.w)} of postings${x.tier === "core" ? ", core" : ""}</span>${x.build[0] ? `<div class="small">${esc(x.build[0])}</div>` : ""}${x.signals[0] ? `<div class="muted small">A line that would show it: “${esc(x.signals[0])}”</div>` : ""}</li>`).join("")}</ol></div>` : ""}
      ${thinNamed.length ? `<div class="learn"><strong>Evidenced, but thin</strong><p class="muted small" style="margin:4px 0 6px">You show these, but without the specifics or outcomes postings ask about.</p><ol>${thinNamed.slice(0, 5).map(x => `<li>${esc(x.name)}${missSubs(x.id).length ? ` <span class="muted small">— add: ${missSubs(x.id).slice(0, 3).map(esc).join(" · ")}</span>` : ""}${x.ladder ? `<div class="muted small">At ${esc(Matcher.LADDER_LABEL[r.targetLevel])}: ${esc(x.ladder)}</div>` : ""}</li>`).join("")}</ol></div>` : ""}
      ${evid.some(x => x.ladder) ? `<details class="more"><summary>What each evidenced skill looks like at the ${esc(Matcher.LADDER_LABEL[r.targetLevel])} bar</summary><ul class="evlist">${evid.filter(x => x.ladder).slice(0, 12).map(evItem).join("")}</ul></details>` : ""}
      ${r.unmapped.length ? `<details class="more"><summary>${r.unmapped.length} lines we could not map to any requirement</summary><ul class="evlist">${r.unmapped.map(t => `<li class="muted">${esc(t)}</li>`).join("")}</ul><p class="muted small">If these are product work, name the skill the way postings do: roadmap, discovery, launch, metrics, stakeholders.</p></details>` : ""}
      ${r.soft.length ? `<p class="muted small" style="margin-top:14px">Also asked for, not scored because resumes rarely state them outright: ${r.soft.map(s => (s.have ? "✓ " : "") + esc(s.name)).join(" · ")}</p>` : ""}
      <p class="muted small" style="margin-top:12px">Close this window to see evidenced (green ring) and missing (amber dashed ring) requirements on the map. Click any skill for its sub-skills, with the ones you've evidenced ticked.</p>`;
    wireTags(res);
    res.querySelectorAll(".tag[data-skill]").forEach(t => { const f = t.onclick; t.onclick = () => { closeModal("#match-modal"); f(); }; });
    const required = new Set(); for (const x of rows) { if (x.tier === "diff") continue; if (x.slot === "__ai") r.ai.forEach(id => required.add(id)); else if (x.slot !== "__domain") required.add(x.id); }
    state.match = { matched: new Set([...evid, ...trans].map(x => x.id).filter(id => skillById[id])), required, subs: r.subs, label };
  }

  $("#run-match").onclick = () => {
    const text = ($("#paste").value + "\n" + matchText).trim();
    if (text.length < 40) { $("#file-status").textContent = "Add a file or paste some text first."; return; }
    const v = $("#match-target").value; const isJob = v.startsWith("job:");
    let target, levelOpt;
    if (isJob) {
      const j = G.jobs.find(x => String(x.id) === v.slice(4));
      target = { job: j, jobs: [j], familyJobs: G.jobs.filter(x => x.family === j.family), label: `${j.title} at ${j.company}` };
      levelOpt = LEVEL_TO_LADDER[j.level]; state.selectedJob = j.id; state.selectedSkill = null;
    } else if (v === "slice") { target = { jobs: sliceJobs(), label: "the current filters" }; state.selectedJob = null; }
    else {
      const [, f, l] = v.split(":");
      target = { jobs: G.jobs.filter(x => x.family === f && (l === "__all" || x.level === l)), label: `${G.families[f]} — ${l === "__all" ? "all levels" : G.level_labels[l]}` };
      levelOpt = l === "__all" ? undefined : LEVEL_TO_LADDER[l]; state.family = new Set([f]); state.level = l === "__all" ? new Set() : new Set([l]); state.selectedJob = null;
    }
    const r = MATCH.match(text, target, { level: levelOpt });
    renderMatch(r, target.label, isJob);
    update();
  };

  function update() {
    renderControls();
    const jobs = sliceJobs();
    $("#hud-count").textContent = `${plural(jobs.length, "posting", "postings")} · ${plural(new Set(jobs.map(j => j.company)).size, "company", "companies")}`;
    renderJobList(jobs);
    buildGraph(sliceStats(jobs));
    renderDetail();
  }
  window.addEventListener("resize", () => buildGraph(sliceStats(sliceJobs())));
  update();
  requestAnimationFrame(() => buildGraph(sliceStats(sliceJobs())));
})();
