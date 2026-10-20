/* Role atlas — Explore as a skill map. The 11 fields sit on a ring, neighbours by what their postings ask for; every
   skill of both role sets (the MBA index carries all 278, the 98 product skills under the same ids) sits near the
   fields that ask for it most, so a field's own skills gather beside it and the skills every field asks for gather in
   the middle. Lines join skills that postings ask for together (graph_mba.json edges, Jaccard). Hover a field to light
   up its skills; click a skill for a short card whose roles and fields are links.
   Colours keep their meaning: blue = how often the postings of the field in view ask for a skill; green = you; skill
   areas are text. Desktop only, like the rest. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = v => Math.round(v * 100) + "%";
  const LAYOUT_KEY = "skillmap-layout-v5", MODE_KEY = "explore-view", A = 2.1, TOP_N = 25, R_FIELD = 0.125;
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  // the view (fields or map) lasts a session: the map is never remembered as the default (owner's choice E1)
  const session = { get(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { } } };

  let data = null, P = null;
  const ui = { el: null, groups: [], fit: null, onlyFit: false, focus: null, hover: null, selected: null, showAside: null, sizeOf: () => 1, all: false };

  // ---------- what a field asks for: the mean share of a skill over the field's roles ----------
  function fieldShares(M) {
    const out = {};
    for (const g of M.groups) {
      const v = {};
      for (const s of M.skills) v[s.id] = g.families.reduce((a, f) => a + ((s.by_family || {})[f] || 0), 0) / (g.families.length || 1);
      out[g.id] = v;
    }
    return out;
  }
  function productShares() {   // the product field is the product role set (six families), once it is loaded
    const fams = Object.keys(P.G.families), v = {};
    for (const s of P.G.skills) v[s.id] = fams.reduce((a, f) => a + ((s.by_family || {})[f] || 0), 0) / fams.length;
    return v;
  }

  // ---------- layout: fields on a ring by similarity, skills pulled towards the fields that ask for them ----------
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function computeLayout(M, FS) {
    const gids = M.groups.map(g => g.id), sk = M.skills.map(s => s.id);
    const vec = g => sk.map(id => FS[g][id]), norm = v => Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
    const cos = (a, b) => { const va = vec(a), vb = vec(b); return va.reduce((s, x, i) => s + x * vb[i], 0) / norm(va) / norm(vb); };
    // order the ring greedily: start from the field with the most roles, then always the most similar one left
    const order = [gids.slice().sort((a, b) => M.groups.find(g => g.id === b).families.length - M.groups.find(g => g.id === a).families.length)[0]];
    while (order.length < gids.length) { const last = order[order.length - 1]; order.push(gids.filter(g => !order.includes(g)).sort((a, b) => cos(last, b) - cos(last, a))[0]); }
    const field = {};
    order.forEach((g, i) => { const t = -Math.PI / 2 + (i / order.length) * Math.PI * 2; field[g] = [A / 2 + Math.cos(t) * (A / 2 - R_FIELD - 0.03), 0.5 + Math.sin(t) * (0.5 - R_FIELD - 0.02)]; });
    // a skill's home: the fields' positions weighted by how much each asks for it, sharpened so a field's own skills
    // land beside it and the skills everyone asks for land in the middle
    const rand = rng(11), n = sk.length, x = new Float64Array(n), y = new Float64Array(n), hx = new Float64Array(n), hy = new Float64Array(n);
    sk.forEach((id, i) => {
      const ws = gids.map(g => FS[g][id] || 0), mean = ws.reduce((a, b) => a + b, 0) / ws.length || 1e-9;
      const lift = ws.map(w => Math.pow(w / mean, 3)), tot = lift.reduce((a, b) => a + b, 0) || 1;
      let tx = 0, ty = 0; gids.forEach((g, j) => { tx += field[g][0] * lift[j] / tot; ty += field[g][1] * lift[j] / tot; });
      hx[i] = A / 2 + (tx - A / 2) * 0.82; hy[i] = 0.5 + (ty - 0.5) * 0.82;   // a little towards the middle, inside the ring
      x[i] = hx[i] + (rand() - 0.5) * 0.04; y[i] = hy[i] + (rand() - 0.5) * 0.04;
    });
    const k2 = Math.pow(0.028, 2), discs = gids.map(g => field[g]);
    for (let it = 0; it < 260; it++) {
      const step = 0.012 * (1 - it / 260) + 0.0008;
      for (let i = 0; i < n; i++) {
        let fx = (hx[i] - x[i]) * 0.35, fy = (hy[i] - y[i]) * 0.35;
        for (let j = 0; j < n; j++) { if (j === i) continue; const ex = x[i] - x[j], ey = y[i] - y[j], d2 = ex * ex + ey * ey; if (d2 > 0.01 || d2 === 0) continue; fx += ex * k2 / d2; fy += ey * k2 / d2; }
        // keep every dot out from under the field circles
        for (const [cx, cy] of discs) { const ex = x[i] - cx, ey = y[i] - cy, d = Math.sqrt(ex * ex + ey * ey) || 1e-3, min = R_FIELD + 0.025; if (d < min) { fx += ex / d * (min - d) * 4; fy += ey / d * (min - d) * 4; } }
        const m = Math.sqrt(fx * fx + fy * fy) || 1, s = Math.min(m, step); x[i] = Math.min(A - 0.01, Math.max(0.01, x[i] + fx / m * s)); y[i] = Math.min(0.99, Math.max(0.01, y[i] + fy / m * s));
      }
    }
    return { field, skill: Object.fromEntries(sk.map((id, i) => [id, [+x[i].toFixed(4), +y[i].toFixed(4)]])) };
  }

  async function load() {
    if (data) return data;
    const ix = await Atlas.index(), M = ix.M, FS = fieldShares(M);
    const sig = M.skills.length + ":" + M.groups.length + ":" + (M.meta.generated || "");
    let L = null; try { const c = JSON.parse(sessionStorage.getItem(LAYOUT_KEY)); if (c && c.sig === sig) L = c.L; } catch { }
    if (!L) { L = computeLayout(M, FS); try { sessionStorage.setItem(LAYOUT_KEY, JSON.stringify({ sig, L })); } catch { } }
    const nodes = M.skills.map(s => ({ id: s.id, name: s.name, cluster: s.cluster, share: s.share || 0, x: L.skill[s.id][0], y: L.skill[s.id][1] }));
    const byId = Object.fromEntries(nodes.map(nd => [nd.id, nd])), adj = {};
    const edges = M.edges.filter(e => byId[e.source] && byId[e.target]);
    for (const e of edges) { (adj[e.source] ||= []).push([e.target, e.jaccard]); (adj[e.target] ||= []).push([e.source, e.jaccard]); }
    for (const k in adj) adj[k].sort((a, b) => b[1] - a[1]);
    data = { nodes, byId, edges, adj, field: L.field, FS, M, ix, top: {} };
    Atlas.product().then(p => { P = p; data.FS = { ...data.FS, product: productShares() }; data.top = {}; draw(); }).catch(() => { });
    return data;
  }
  function topSkills(gid) {
    if (!gid) return null; if (data.top[gid]) return data.top[gid];
    // what the field asks for more than the others do: its share, weighed by how many times the mean field's it is
    const v = data.FS[gid] || {}, gs = Object.keys(data.FS).filter(g => g in data.field);
    const mean = id => gs.reduce((a, g) => a + (data.FS[g][id] || 0), 0) / gs.length || 1e-9;
    const score = Object.entries(v).filter(([id, w]) => w >= 0.05 && data.byId[id]).map(([id, w]) => [id, w, w * Math.min(4, w / mean(id))]);
    return (data.top[gid] = new Map(score.sort((a, b) => b[2] - a[2]).slice(0, TOP_N).map(([id, w]) => [id, w])));
  }
  const groupLabel = gid => (data.ix.groups.find(g => g.id === gid) || data.M.groups.find(g => g.id === gid) || {}).label || gid;

  // ---------- drawing: the lines and dots as one SVG, the fields as the page's own circles on top ----------
  function draw() {
    if (!data || !ui.el || !document.body.contains(ui.el)) return;
    const stage = ui.el, w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    const sc = Math.min(w / A, h), ox = (w - A * sc) / 2, oy = (h - sc) / 2;
    const px = p => [ox + p[0] * sc, oy + p[1] * sc], at = id => px([data.byId[id].x, data.byId[id].y]);
    const lit = ui.hover || ui.focus, hl = topSkills(lit), maxW = hl ? Math.max(...hl.values()) : 1;
    const sel = ui.selected, near = new Set(sel ? (data.adj[sel] || []).slice(0, 6).map(a => a[0]) : []);
    const seg = list => list.map(([a, b]) => `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`).join("");
    const edgeSeg = es => seg(es.map(e => [at(e.source), at(e.target)]));
    // at rest the map is the fields alone (owner's choice E1): a lit field shows its skills, a picked skill its
    // neighbours, and "Show all skills" brings every dot and the web of lines back
    const all = ui.all || !!sel, shown = all ? data.nodes : hl ? data.nodes.filter(nd => hl.has(nd.id)) : [];
    let svg = `<svg class="sm-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`;
    if (ui.all) svg += `<path class="sm-e" d="${edgeSeg(data.edges)}"/>`;
    if (hl && !sel && data.field[lit]) { const f = px(data.field[lit]); svg += `<path class="sm-spoke" d="${seg([...hl.keys()].map(id => [f, at(id)]))}"/>`; }
    if (sel) svg += `<path class="sm-e sel" d="${edgeSeg(data.edges.filter(e => (e.source === sel && near.has(e.target)) || (e.target === sel && near.has(e.source))))}"/>`;
    svg += shown.map(nd => {
      const wv = hl && hl.get(nd.id), cls = "sm-n" + (wv ? " hl" : "") + (nd.id === sel ? " sel" : near.has(nd.id) ? " near" : ""), [cx, cy] = at(nd.id);
      return `<circle class="${cls}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(2 + 4.5 * Math.sqrt(nd.share)).toFixed(1)}"${wv ? ` style="opacity:${(0.5 + 0.5 * wv / maxW).toFixed(2)}"` : ""} data-sk="${esc(nd.id)}"/>`;
    }).join("");
    // names: the picked skill and its neighbours, or the five skills that most set a lit field apart
    const named = sel ? [sel, ...near] : hl ? [...hl.keys()].slice(0, 5) : [];
    svg += named.map(id => { const [a, b] = at(id); return `<text class="sm-name${id === sel ? " sel" : ""}" x="${(a + 7).toFixed(1)}" y="${(b + 4).toFixed(1)}">${esc(data.byId[id].name)}</text>`; }).join("");
    svg += "</svg>";
    const bubbles = ui.groups.map(g => {
      const f = data.field[g.id]; if (!f) return "";
      const [cx, cy] = px(f), d = Math.round(sc * 2 * R_FIELD * ui.sizeOf(g)), dim = ui.onlyFit && ui.fit && !ui.fit.has(g.id);
      return `<a class="bubble sm-field ${g.cls}${g.you ? " you" : ""}${dim ? " dim" : ""}${g.id === lit ? " lit" : ""}" href="#/field/${esc(g.id)}" data-g="${esc(g.id)}" style="left:${(cx - d / 2).toFixed(0)}px;top:${(cy - d / 2).toFixed(0)}px;width:${d}px;height:${d}px">${g.inner}</a>`;
    }).join("");
    stage.innerHTML = svg + bubbles;
  }

  // ---------- the short card for a skill: who asks for it, as links ----------
  function card(id) {
    const nd = data.byId[id]; if (!nd) return "";
    const s = data.ix.skillById[id] || {}, ix = data.ix, rows = [];
    for (const [rid, r] of Object.entries(ix.roles)) {
      const share = r.set === "product" ? (P ? ((P.skillById[id] || {}).by_family || {})[r.family] || 0 : 0) : (s.by_family || {})[r.family] || 0;
      if (share > 0) rows.push({ id: rid, label: r.label, group: r.group, share });
    }
    rows.sort((a, b) => b.share - a.share);
    const topFields = Object.keys(data.FS).filter(g => g in data.field).map(g => [g, data.FS[g][id] || 0]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const together = (data.adj[id] || []).slice(0, 6), area = (data.M.clusters[nd.cluster] || {}).label || nd.cluster;
    return `<button type="button" class="close" data-sk-clear aria-label="Close">×</button><div class="sm-card"><p class="eyebrow">${esc(area)}</p><h3 class="sm-title">${esc(nd.name)}</h3>
      ${s.what ? `<p class="small">${esc(s.what)}</p>` : ""}
      <p class="facts">${pct(nd.share)} of postings across the 50 MBA roles ask for it</p>
      ${rows.length ? `<p class="sm-h">Asked for most by</p><div class="list">${rows.slice(0, 5).map(r => `<a class="r" href="#/role/${esc(r.id)}"><span class="t">${esc(r.label)}</span><span class="n">${pct(r.share)}</span><span class="m">${esc(groupLabel(r.group))}</span></a>`).join("")}</div>` : ""}
      ${topFields.length ? `<p class="sm-h">Fields that ask for it most</p><div class="tags">${topFields.map(([g]) => `<a class="tag" href="#/field/${esc(g)}">${esc(groupLabel(g))}</a>`).join("")}</div>` : ""}
      ${together.length ? `<p class="sm-h">Often asked for together</p><div class="tags">${together.map(([t]) => `<button type="button" class="tag" data-sk="${esc(t)}">${esc(data.byId[t].name)}</button>`).join("")}</div>` : ""}</div>`;
  }
  function select(id) { ui.selected = id && data.byId[id] ? id : null; tip(null); draw(); if (ui.showAside) ui.showAside(ui.selected ? card(ui.selected) : null); }

  // ---------- the name of the dot under the pointer ----------
  function tip(c) {
    let t = document.getElementById("sm-tip");
    if (!t) { t = document.createElement("div"); t.id = "sm-tip"; t.className = "sm-tip"; t.hidden = true; document.body.appendChild(t); }
    if (!c) { t.hidden = true; return; }
    const r = c.getBoundingClientRect(); t.textContent = data.byId[c.dataset.sk].name; t.style.left = (r.right + 6) + "px"; t.style.top = (r.top - 8) + "px"; t.hidden = false;
  }

  function wireStage(stage) {
    if (window.ResizeObserver) new ResizeObserver(() => draw()).observe(stage);   // the side panel opening narrows it
    stage.addEventListener("click", e => { const c = e.target.closest("circle[data-sk]"); if (c) select(c.dataset.sk === ui.selected ? null : c.dataset.sk); else if (!e.target.closest("a")) select(null); });
    stage.addEventListener("mouseover", e => {
      const c = e.target.closest("circle[data-sk]"); tip(c);
      if (c) return;                                   // a dot keeps the field that is lit
      const b = e.target.closest("a[data-g]"), g = b ? b.dataset.g : null;
      if (g !== ui.hover) { ui.hover = g; if (!ui.selected) draw(); }
    });
    stage.addEventListener("mouseleave", () => { tip(null); if (ui.hover) { ui.hover = null; if (!ui.selected) draw(); } });
  }
  let rz = 0; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(draw, 120); });

  // ---------- what app.js calls ----------
  // stage(el, { groups: [{ id, cls, you, inner }], sizeOf, fit, onlyFit, focus, aside, showAside })
  async function stage(el, opts) {
    await load();
    Object.assign(ui, { el, groups: opts.groups, sizeOf: opts.sizeOf || (() => 1), fit: opts.fit || null, onlyFit: !!opts.onlyFit, focus: opts.focus || null, showAside: opts.showAside, hover: null });
    if (opts.aside && !opts.aside.dataset.smWired) {
      opts.aside.addEventListener("click", e => { const t = e.target.closest("[data-sk],[data-sk-clear]"); if (!t || !ui.el) return; select(t.hasAttribute("data-sk-clear") ? null : t.dataset.sk); });
      opts.aside.dataset.smWired = "1";
    }
    wireStage(el); draw();
    if (ui.selected && ui.showAside) ui.showAside(card(ui.selected));
  }
  async function find(name) {
    await load(); const q = String(name || "").trim().toLowerCase(); if (!q) return false;
    const nd = data.nodes.find(x => x.name.toLowerCase() === q) || data.nodes.find(x => x.name.toLowerCase().startsWith(q)) || data.nodes.find(x => x.name.toLowerCase().includes(q));
    if (nd) select(nd.id); return !!nd;
  }
  async function names() { await load(); return data.nodes.map(nd => nd.name).sort(); }
  function leave() { ui.el = null; ui.selected = null; ui.hover = null; ui.showAside = null; if (data) tip(null); }
  const mode = () => session.get(MODE_KEY, "grid"), setMode = m => session.set(MODE_KEY, m);
  const showAll = v => { ui.all = !!v; draw(); }, allShown = () => ui.all;
  // read-only, for games that use the map as a board (web/games/skill-path.js): positions, links and field shares;
  // FS gains the product field once the product set has loaded
  async function board() { await load(); return { nodes: data.nodes, byId: data.byId, adj: data.adj, field: data.field, rField: R_FIELD, A, get FS() { return data.FS; } }; }
  window.SkillMap = { stage, find, names, leave, mode, setMode, showAll, allShown, board };
})();
