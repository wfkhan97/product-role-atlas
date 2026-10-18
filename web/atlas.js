/* Atlas data layer: the two role sets (product, mba) behind one interface. Pure data, no DOM.
   Files: data/graph_mba.json (index) + data/graph_mba/<role>.json (one role's postings, on demand) + _evidence.json;
   data/graph.json (the product set, one file); data/subskills*.json; data/bands*.json. */
window.Atlas = (function () {
  "use strict";
  const cache = {};
  const fetchJson = url => cache[url] ||= fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });
  const STEP_OF = { associate: "entry", mid: "mid", senior: "senior", staff: "lead", group: "lead", director: "lead", vp: "lead", cpo: "lead" };
  const STEPS = ["entry", "mid", "senior", "lead"];
  const EMPLOYER_TYPES = [["large", "Large companies", g => /^fortune/.test(g)], ["startup", "Startups", g => g === "startup"], ["firm", "Consulting, banks and funds", g => g === "mba_employer"]];
  const CRED_PREFIX = "yoe_";
  const TIER = { core: 0.5, common: 0.25, some: 0.1 };
  const GROW = { ratio: 1.5, floor: 0.02, min: 0.15 };
  const PRODUCT_GROUP = { id: "product", label: "Product", set: "product" };

  function decode(G, jobs) {
    for (const j of jobs) {
      if (j.skills.length && typeof j.skills[0] === "number") j.skills = j.skills.map(i => G.skill_ids[i]);
      j.sub = (j.sub || []).map(i => typeof i === "number" ? G.sub_ids[i] : i);
      if (j.w == null) j.w = 1;
      if (j.open == null) j.open = true;
    }
    return jobs;
  }

  // ---------- the index: groups and roles of both sets ----------
  let indexP = null;
  function index() {
    return indexP ||= Promise.all([fetchJson("data/graph_mba.json"), fetchJson("data/subskills_mba.json")]).then(([M, SUBS]) => {
      const roles = {}, groups = [];
      for (const g of M.groups) {
        if (g.id === "product") continue;   // the product field opens the product role set instead (owner's choice 3A)
        groups.push({ id: g.id, label: g.label, set: "mba", roles: g.families, nOpen: g.families.reduce((a, f) => a + M.roles[f].n_open, 0) });
        for (const f of g.families) {
          const r = M.roles[f];
          roles[f] = { id: f, set: "mba", group: g.id, label: r.label, nOpen: r.n_open, n: r.n, nCompanies: r.n_companies, ladder: r.ladder, defining: new Set(r.defining.map(d => d.id)), definingList: r.defining, asks: r.asks, credentials: r.credentials, small: r.small, file: r.file, entry: r.entry };
        }
      }
      groups.push({ ...PRODUCT_GROUP, roles: [], nOpen: null });
      return { M, SUBS, roles, groups, skillById: Object.fromEntries(M.skills.map(s => [s.id, s])) };
    });
  }

  // ---------- the product set: one file, loaded when the Product field or a product role is opened ----------
  let productP = null;
  function product() {
    return productP ||= Promise.all([fetchJson("data/graph.json"), fetchJson("data/subskills.json"), index()]).then(([G, SUBS, ix]) => {
      decode(G, G.jobs);
      const byFamily = {};
      for (const j of G.jobs) (byFamily[j.family] ||= []).push(j);
      const pg = ix.groups.find(g => g.id === "product");
      pg.roles = Object.keys(G.families).filter(f => byFamily[f]);
      pg.nOpen = G.jobs.length;
      for (const f of pg.roles) {
        const jobs = byFamily[f];
        const top = G.skills.filter(s => s.cluster !== "credentials").map(s => ({ id: s.id, share: s.by_family[f] || 0 })).sort((a, b) => b.share - a.share);
        ix.roles[f] = { id: f, set: "product", group: "product", label: G.families[f], nOpen: jobs.length, n: jobs.length, nCompanies: new Set(jobs.map(j => j.company)).size, ladder: "product", defining: new Set(), definingList: [], asks: top, credentials: [], small: false, jobs };
      }
      return { G, SUBS, skillById: Object.fromEntries(G.skills.map(s => [s.id, s])) };
    });
  }

  // ---------- one role: its postings, skills, sub-skills, evidence ----------
  async function role(id) {
    const ix = await index();
    if (!ix.roles[id]) await product();
    const r = ix.roles[id];
    if (!r) throw new Error("unknown role " + id);
    if (r.set === "product") {
      const P = await product();
      const G = P.G;
      return { role: r, set: "product", jobs: r.jobs, skills: G.skills, skillById: P.skillById, clusters: G.clusters, subs: P.SUBS, edges: G.edges, levelLabels: G.level_labels, stepLabels: { entry: "Entry", mid: "Product Manager", senior: "Senior", lead: "Lead and up" }, evidence: async sid => (P.skillById[sid] || {}).evidence || {}, employerTypes: EMPLOYER_TYPES.slice(0, 2), country: null };
    }
    const file = await fetchJson("data/" + r.file);
    const jobs = decode(ix.M, file.jobs);
    const lv = ix.M.ladders[r.ladder].levels;
    return { role: r, set: "mba", jobs, skills: ix.M.skills, skillById: ix.skillById, clusters: ix.M.clusters, subs: ix.SUBS, edges: ix.M.edges, levelLabels: ix.M.level_labels, stepLabels: { entry: lv.associate || "Entry", mid: lv.mid || "Manager", senior: lv.senior || "Senior", lead: "Leadership" }, evidence: async sid => ((await fetchJson("data/" + ix.M.meta.evidence))[sid]) || {}, employerTypes: EMPLOYER_TYPES, country: ix.M.meta.country, ladders: ix.M.ladders };
  }

  // ---------- statistics on a set of postings ----------
  function shares(jobs) {
    let n = 0; const cnt = {};
    for (const j of jobs) { n += j.w; for (const k of j.skills) cnt[k] = (cnt[k] || 0) + j.w; }
    return { n: jobs.length, w: n, share: id => (cnt[id] || 0) / (n || 1), cnt };
  }
  function subShares(jobs, sid) {
    const withSkill = jobs.filter(j => j.skills.includes(sid)); let n = 0; const cnt = {};
    for (const j of withSkill) { n += j.w; for (const k of j.sub) cnt[k] = (cnt[k] || 0) + j.w; }
    return { n: withSkill.length, share: id => (cnt[id] || 0) / (n || 1) };
  }
  const stepOf = j => STEP_OF[j.level] || "mid";
  const employerType = j => (EMPLOYER_TYPES.find(([, , fn]) => fn(j.group)) || ["other"])[0];

  // The skill grid: rows = how many postings in the slice ask for the skill; columns = asked at every level, or
  // asked more as you move up (at least GROW.ratio times as often in leadership postings as in entry ones, over the
  // whole role so that a level filter re-ranks without moving skills between columns).
  function grid(R, slice) {
    const st = shares(slice);
    const all = shares(R.jobs), entry = shares(R.jobs.filter(j => stepOf(j) === "entry")), lead = shares(R.jobs.filter(j => stepOf(j) === "lead"));
    const grows = id => { const l = lead.share(id), e = entry.share(id); return l >= GROW.ratio * Math.max(GROW.floor, e) && l >= GROW.min; };
    const rows = [[[], []], [[], []], [[], []]];
    for (const s of R.skills) {
      if (s.cluster === "credentials" || s.id.startsWith(CRED_PREFIX)) continue;
      const sh = st.share(s.id);
      const tier = sh >= TIER.core ? 0 : sh >= TIER.common ? 1 : sh >= TIER.some ? 2 : null;
      if (tier === null) continue;
      rows[tier][grows(s.id) ? 1 : 0].push({ id: s.id, name: s.name, cluster: s.cluster, share: sh, defining: R.role.defining.has(s.id) });
    }
    for (const row of rows) for (const cell of row) cell.sort((a, b) => b.share - a.share);
    return { rows, stats: st, all };
  }

  // ---------- the matcher (web/match.js, untouched) for one role, built the way the bands were calibrated ----------
  const matchers = {};
  async function matcher(R) {
    if (matchers[R.role.id]) return matchers[R.role.id];
    const ix = await index();
    if (R.set === "product") {
      const [P, TAX, bands] = await Promise.all([product(), fetchJson("data/taxonomy.json"), fetchJson("data/bands.json")]);
      const M = Matcher.createMatcher({ taxonomy: TAX, subskills: P.SUBS, graph: P.G, distinct: (bands.scoring || {}).distinct || undefined });
      return matchers[R.role.id] = { M, bands, group: R.role.group, familyJobs: R.jobs };
    }
    const [TAX, ROLES, bands] = await Promise.all([fetchJson("data/taxonomy_mba.json"), fetchJson("data/roles_mba.json"), fetchJson("data/bands_mba.json")]);
    // the mean share of each skill across the 50 roles: what "distinctive for this role" is measured against
    const fams = Object.keys(ix.M.families), baseline = {};
    for (const s of ix.M.skills) baseline[s.id] = fams.reduce((a, f) => a + ((s.by_family || {})[f] || 0), 0) / fams.length;
    const M = Matcher.createMatcher({ taxonomy: TAX, subskills: ix.SUBS, graph: { ...ix.M, jobs: R.jobs }, roles: ROLES, distinct: { ...((bands.scoring || {}).distinct || {}), baseline } });
    return matchers[R.role.id] = { M, bands, group: (bands.group_of || {})[R.role.id] || R.role.group, familyJobs: R.jobs };
  }

  // ---------- a rough read of a resume against every role, from the index alone (no role files) ----------
  // Returns { held: [role ids the person held], scores: { role id: share of the role's main asks the resume shows } }.
  // It ranks fields and roles; the band of fit comes from the full matcher on the role screen.
  let roughM = null;
  async function roughFit(text) {
    const ix = await index();
    if (!roughM) { const [TAX, ROLES] = await Promise.all([fetchJson("data/taxonomy_mba.json"), fetchJson("data/roles_mba.json")]); roughM = Matcher.createMatcher({ taxonomy: TAX, subskills: ix.SUBS, graph: { ...ix.M, jobs: [] }, roles: ROLES }); }
    const parsed = roughM.readRoles(roughM.parseResume(text)); const ev = roughM.tag(parsed);
    const shown = new Set(Object.entries(ev).filter(([, e]) => e.strength >= 2).map(([id]) => id));
    const held = [...new Set(parsed.roles.map(r => r.roleFamily).filter(Boolean))];
    const scores = {};
    const score = asks => { const core = asks.filter(a => a.share >= TIER.core && ix.skillById[a.id] && ix.skillById[a.id].cluster !== "credentials"); return core.length ? core.filter(a => shown.has(a.id)).length / core.length : 0; };
    for (const [id, r] of Object.entries(ix.roles)) scores[id] = score(r.set === "mba" ? [...r.definingList, ...r.asks] : r.asks);
    return { held, scores, shown, years: parsed.totalYears, isStudent: parsed.isStudent };
  }

  return { index, product, role, shares, subShares, grid, stepOf, employerType, matcher, roughFit, STEPS, EMPLOYER_TYPES, TIER, GROW, fetchJson };
})();
