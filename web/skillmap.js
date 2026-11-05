/* Role atlas — Explore as a skill map. The 11 fields sit on a ring, neighbours by what their postings ask for; every
   skill of both role sets (the MBA index carries all 278, the 98 product skills under the same ids) sits near the
   fields that ask for it most, so a field's own skills gather beside it and the skills every field asks for gather in
   the middle. Lines join skills that postings ask for together (graph_mba.json edges, Jaccard). Hover a field to light
   up its skills; click a skill for a short card whose roles and fields are links.
   Colours keep their meaning: blue = the postings' numbers (a lit field's skills; with a resume, the gaps your roles
   require); green = you (already on your resume); skill areas are text. Desktop only, like the rest.
   Owner's decisions (2026-10-24): every skill is on the map by default; the 35 most-asked skills are solid and
   named, a little fainter than the fields; the rest are a faint fill, named on hover (a lens names every dot near
   the pointer); with a resume and chosen fields the skills those roles ask for turn green (on the resume) or blue
   (not yet); no sub-skills on the map. `chart()` draws one field's skills on lanes for the field page. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pct = v => Math.round(v * 100) + "%";
  const LAYOUT_KEY = "skillmap-layout-v5", MODE_KEY = "explore-view", A = 2.1, TOP_N = 25, R_FIELD = 0.125, NAMED = 35, LENS = 60;
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
  // the view (fields or map) lasts a session: the map is never remembered as the default (owner's choice E1)
  const session = { get(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { } } };

  let data = null, P = null;
  const ui = { el: null, groups: [], fit: null, onlyFit: false, focus: null, hover: null, selected: null, showAside: null, sizeOf: () => 1, all: true, overlay: null, tf: null, labelled: new Set(), lens: [], chart: null, route: null };

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
  function productShares() {   // the product field is the product role set (its families with postings), once it is loaded
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
    const named = new Set(nodes.slice().sort((a, b) => b.share - a.share).slice(0, NAMED).map(nd => nd.id));   // solid and named at rest
    data = { nodes, byId, edges, adj, field: L.field, FS, M, ix, top: {}, named };
    Atlas.product().then(p => { P = p; data.FS = { ...data.FS, product: productShares() }; data.top = {}; draw(); drawChart(); }).catch(() => { });
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
  // names are placed greedily: a box per name, right of the dot, else left of it, never over a field or another name
  // `force` (the field chart, where every dot carries its name): when neither side is free, try a line above and below
  // on each side, and as a last resort place the name on the side with more room anyway; pos.dy is the shift down
  function labeller(blocked, bounds, force) {
    const placed = blocked.slice();
    const free = b => (!bounds || (b[0] >= bounds[0] && b[2] <= bounds[2])) && !placed.some(q => !(b[2] < q[0] || b[0] > q[2] || b[3] < q[1] || b[1] > q[3]));
    return (x, y, name, size) => {
      const w = name.length * (size || 11) * 0.56 + 4, h = (size || 11) + 4;
      const at = (dx, dy, anchor) => ({ x: anchor === "start" ? x + dx : x - dx, dy, anchor, box: anchor === "start" ? [x + dx, y + dy - h / 2, x + dx + w, y + dy + h / 2] : [x - dx - w, y + dy - h / 2, x - dx, y + dy + h / 2] });
      const tries = [at(7, 0, "start"), at(7, 0, "end"), ...(force ? [at(4, -h, "start"), at(4, h, "start"), at(4, -h, "end"), at(4, h, "end")] : [])];
      for (const t of tries) if (free(t.box)) { placed.push(t.box); return { x: t.x, dy: t.dy, anchor: t.anchor }; }
      if (!force) return null;
      const t = bounds && x + 7 + w > bounds[2] ? tries[1] : tries[0];
      placed.push(t.box); return { x: t.x, dy: 0, anchor: t.anchor };
    };
  }
  const AREA_MIN = 5;   // an area label needs this many dots to have a centre worth naming
  function draw() {
    if (!data || !ui.el || !document.body.contains(ui.el)) return;
    const stage = ui.el, w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    const sc = Math.min(w / A, h), ox = (w - A * sc) / 2, oy = (h - sc) / 2;
    ui.tf = { sc, ox, oy };
    const px = p => [ox + p[0] * sc, oy + p[1] * sc], at = id => px([data.byId[id].x, data.byId[id].y]);
    const lit = ui.hover || ui.focus, hl = topSkills(lit), maxW = hl ? Math.max(...hl.values()) : 1;
    const sel = ui.selected, near = new Set(sel ? (data.adj[sel] || []).slice(0, 6).map(a => a[0]) : []);
    const seg = list => list.map(([a, b]) => `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`).join("");
    const edgeSeg = es => seg(es.map(e => [at(e.source), at(e.target)]));
    const ov = ui.overlay;
    // every skill at rest (owner's decision 2026-10-24); "Show the fields alone" takes them away, a lit field or a
    // picked skill brings its own back
    // the planned route (PLAN.md v12, SP2-C): its skills and arrivals are shown whatever else is
    const rt = ui.route, onRoute = new Set(rt ? rt.path : []), arrive = new Set(rt ? rt.arrivals : []);
    const all = ui.all || !!sel, base = all ? data.nodes : hl ? data.nodes.filter(nd => hl.has(nd.id)) : [];
    const shown = rt ? [...base, ...data.nodes.filter(nd => (onRoute.has(nd.id) || arrive.has(nd.id)) && !base.includes(nd))] : base;
    const radius = nd => 3 + 6 * Math.sqrt(nd.share);
    let svg = `<svg class="sm-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`;
    if (ui.all) svg += `<path class="sm-e" d="${edgeSeg(data.edges)}"/>`;
    if (hl && !sel && data.field[lit]) { const f = px(data.field[lit]); svg += `<path class="sm-spoke" d="${seg([...hl.keys()].map(id => [f, at(id)]))}"/>`; }
    if (sel) svg += `<path class="sm-e sel" d="${edgeSeg(data.edges.filter(e => (e.source === sel && near.has(e.target)) || (e.target === sel && near.has(e.source))))}"/>`;
    // the planned route: a green line along it, drawn under the dots
    if (rt && rt.path.length > 1) svg += `<path class="sm-route" d="${rt.path.map((id, i) => { const [a, b] = at(id); return (i ? "L" : "M") + a.toFixed(1) + " " + b.toFixed(1); }).join("")}"/>`;
    svg += shown.map(nd => {
      const wv = hl && hl.get(nd.id);
      const state = ov ? (ov.have.has(nd.id) ? "have" : ov.todo.has(nd.id) ? "todo" : "quiet") : (data.named.has(nd.id) ? "top" : "quiet");
      const onR = onRoute.has(nd.id), onA = !onR && arrive.has(nd.id);
      const cls = "sm-n " + state + (wv && !ov ? " hl" : "") + (nd.id === sel ? " sel" : near.has(nd.id) ? " near" : "") + (onR ? (rt.ticks && rt.ticks.has(nd.id) ? " route" : " route gap") : onA ? " arrive" : ""), [cx, cy] = at(nd.id);
      return `<circle class="${cls}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(onR || onA ? 5 : radius(nd)).toFixed(1)}"${wv && !ov && !onR ? ` style="opacity:${(0.5 + 0.5 * wv / maxW).toFixed(2)}"` : ""} data-sk="${esc(nd.id)}"/>`;
    }).join("");
    // names: the picked skill and its neighbours first, then a lit field's five, then the coloured dots, then the
    // 35 most-asked (faint); the field circles are blocked so nothing is written over them
    const blocked = ui.groups.map(g => { const f = data.field[g.id]; if (!f) return null; const [cx, cy] = px(f), d = sc * 2 * R_FIELD * ui.sizeOf(g); return [cx - d / 2, cy - d / 2, cx + d / 2, cy + d / 2]; }).filter(Boolean);
    const place = labeller(blocked, [0, 0, w, h]), named = [], seen = new Set();
    const want = (id, cls) => { if (seen.has(id) || !data.byId[id] || !shown.includes(data.byId[id])) return; seen.add(id); named.push([id, cls]); };
    if (sel) { want(sel, "sel"); near.forEach(id => want(id, "")); }
    // the route's skills are always named, a ✓ on the ones the resume shows
    if (rt) { rt.path.forEach(id => want(id, "route")); rt.arrivals.forEach(id => want(id, "arrive")); }
    if (hl) [...hl.keys()].slice(0, 5).forEach(id => want(id, ""));
    if (ov) { ov.have.forEach(id => want(id, "have")); ov.todo.forEach(id => want(id, "todo")); }
    else data.named.forEach(id => want(id, "quiet"));
    ui.labelled = new Set();
    svg += named.map(([id, cls]) => { const [a, b] = at(id), nd = data.byId[id], pos = place(a, b, nd.name, 11); if (!pos) return ""; ui.labelled.add(id); return `<text class="sm-name${cls ? " " + cls : ""}" x="${pos.x.toFixed(1)}" y="${(b + 4).toFixed(1)}" text-anchor="${pos.anchor}">${cls === "route" && rt.ticks && rt.ticks.has(id) ? "✓ " : ""}${esc(nd.name)}</text>`; }).join("");
    // the skill areas as faint words at the centre of their dots, instead of colours (owner's choice, v9)
    if (ui.all) {
      const byArea = {}; for (const nd of data.nodes) (byArea[nd.cluster] ||= []).push(at(nd.id));
      svg += Object.entries(byArea).filter(([, pts]) => pts.length >= AREA_MIN).map(([c, pts]) => { const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length, label = ((data.M.clusters[c] || {}).label || c).toUpperCase(); const pos = place(cx - label.length * 3.4, cy, label, 10); return pos ? `<text class="sm-area" x="${pos.x.toFixed(1)}" y="${(cy + 3).toFixed(1)}" text-anchor="${pos.anchor}">${esc(label)}</text>` : ""; }).join("");
    }
    svg += `<g class="sm-lens"></g></svg>`;
    const bubbles = ui.groups.map(g => {
      const f = data.field[g.id]; if (!f) return "";
      const [cx, cy] = px(f), d = Math.round(sc * 2 * R_FIELD * ui.sizeOf(g)), dim = ui.onlyFit && ui.fit && !ui.fit.has(g.id);
      return `<a class="bubble sm-field ${g.cls}${g.you ? " you" : ""}${dim ? " dim" : ""}${g.id === lit ? " lit" : ""}" href="#/field/${esc(g.id)}" data-g="${esc(g.id)}" style="left:${(cx - d / 2).toFixed(0)}px;top:${(cy - d / 2).toFixed(0)}px;width:${d}px;height:${d}px">${g.inner}</a>`;
    }).join("");
    stage.innerHTML = svg + bubbles;
  }
  // the lens: every dot within LENS px of the pointer gets its name, drawn in its own group so nothing else moves
  function lens(mx, my) {
    if (!ui.el || !ui.tf) return;
    const g = ui.el.querySelector(".sm-lens"); if (!g) return;
    const { sc, ox, oy } = ui.tf, at = nd => [ox + nd.x * sc, oy + nd.y * sc];
    if (mx == null) { g.innerHTML = ""; return; }
    const shown = ui.all || ui.selected ? data.nodes : [];
    const hits = shown.filter(nd => !ui.labelled.has(nd.id)).map(nd => { const [x, y] = at(nd); const d = Math.hypot(x - mx, y - my); return d <= LENS ? [nd, x, y, d] : null; }).filter(Boolean).sort((a, b) => a[3] - b[3]).slice(0, 8);
    const place = labeller([]);
    g.innerHTML = hits.map(([nd, x, y]) => { const pos = place(x, y, nd.name, 11); return pos ? `<text class="sm-name lens" x="${pos.x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${pos.anchor}">${esc(nd.name)}</text>` : ""; }).join("");
  }

  // ---------- the short card for a skill: who asks for it, as links ----------
  function card(id) {
    const nd = data.byId[id]; if (!nd) return "";
    const s = data.ix.skillById[id] || {}, ix = data.ix, rows = [];
    for (const [rid, r] of Object.entries(ix.roles)) {
      if (r.set === "tech") continue;   // the skill map is the product and MBA sets' until its evals cover the tech set
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
    stage.addEventListener("mouseleave", () => { tip(null); lens(null); if (ui.hover) { ui.hover = null; if (!ui.selected) draw(); } });
    let raf = 0;
    stage.addEventListener("mousemove", e => { const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => lens(e.target.closest("a[data-g]") ? null : x, y)); });
  }
  let rz = 0; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { draw(); drawChart(); }, 120); });

  // ---------- what app.js calls ----------
  // stage(el, { groups: [{ id, cls, you, inner }], sizeOf, fit, onlyFit, focus, aside, showAside, overlay })
  // overlay: { have: Set, todo: Set } — the skills the person's roles ask for, split by whether the resume shows them
  async function stage(el, opts) {
    await load();
    Object.assign(ui, { el, groups: opts.groups, sizeOf: opts.sizeOf || (() => 1), fit: opts.fit || null, onlyFit: !!opts.onlyFit, focus: opts.focus || null, showAside: opts.showAside, hover: null, overlay: opts.overlay || null });
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
  function leave() { ui.el = null; ui.selected = null; ui.hover = null; ui.showAside = null; ui.overlay = null; ui.chart = null; ui.route = null; if (data) tip(null); }

  // ---------- the field chart: one field's skills on lanes (owner's decisions 2026-10-24) ----------
  // Across: the share of the field's postings that ask for the skill. Up: lanes in words. Which skills: Atlas.fieldChart
  // (owner's feedback 2026-11-01: the chart had 58 to 79 dots, most unnamed): at most 20, every one named, no
  // credentials or tools, at most three of the skills every field asks for. Without a resume the lanes are the kind
  // of skill: the field's craft (methods, technical skills, the industries that define a role), working with people
  // (kind practice; the people areas for a skill with no kind) and the three asked in every field. With a resume: the
  // gaps the field's roles require, and what is already on the resume (the rough read's `shown`).
  // chart(el, { field, label, roles: [ix roles], shown: Set|null, aside, showAside })
  const PEOPLE_AREAS = ["leadership", "delivery", "people"];
  async function chart(el, opts) {
    await load();
    const generic = await Atlas.genericSkills();
    ui.chart = { el, field: opts.field, label: opts.label, roles: opts.roles || [], shown: opts.shown || null, generic, lit: null };
    ui.showAside = opts.showAside;
    if (opts.aside && !opts.aside.dataset.smWired) {
      opts.aside.addEventListener("click", e => { const t = e.target.closest("[data-sk],[data-sk-clear]"); if (!t) return; selectChart(t.hasAttribute("data-sk-clear") ? null : t.dataset.sk); });
      opts.aside.dataset.smWired = "1";
    }
    if (window.ResizeObserver && !el.dataset.smWired) { new ResizeObserver(() => drawChart()).observe(el); el.dataset.smWired = "1"; }
    el.onclick = e => { const c = e.target.closest("circle[data-sk]"); selectChart(c ? (c.dataset.sk === ui.selected ? null : c.dataset.sk) : null); };
    el.onmouseover = e => tip(e.target.closest("circle[data-sk]"));
    el.onmouseleave = () => tip(null);
    drawChart();
  }
  function selectChart(id) { ui.selected = id && data.byId[id] ? id : null; tip(null); drawChart(); if (ui.showAside) ui.showAside(ui.selected ? card(ui.selected) : null); }
  // a role on the field page lights its skills (the ones a quarter or more of its postings ask for)
  function chartLight(roleId) { if (!ui.chart) return; const r = roleId && ui.chart.roles.find(x => x.id === roleId); ui.chart.lit = r ? new Set([...r.definingList, ...r.asks].filter(a => a.share >= Atlas.TIER.common).map(a => a.id)) : null; drawChart(); }
  // row: one of Atlas.fieldChart's rows; its lane "every" stays, "own" splits into craft and people
  function laneOfSkill(row) {
    const C = ui.chart, s = data.ix.skillById[row.id] || {}, nd = data.byId[row.id];
    if (C.shown) return C.shown.has(row.id) ? "have" : "todo";
    if (row.lane === "every") return "every";
    return s.kind ? (s.kind === "practice" ? "people" : "craft") : PEOPLE_AREAS.includes(nd.cluster) ? "people" : "craft";
  }
  function drawChart() {
    const C = ui.chart; if (!C || !data || !document.body.contains(C.el)) return;
    const FS = data.FS[C.field]; const w = C.el.clientWidth, h = C.el.clientHeight; if (!w || !h) return;
    const LN = Copy.explore.field.lanes;
    if (!FS) { C.el.innerHTML = `<p class="small muted" style="padding:16px">${esc(LN.loading)}</p>`; return; }
    const rows = Atlas.fieldChart({ shares: Object.fromEntries(Object.entries(FS).filter(([id]) => data.byId[id])), skillById: data.ix.skillById, roles: C.roles, generic: C.generic });
    const items = rows.map(r => ({ id: r.id, name: data.byId[r.id].name, share: r.share, lane: laneOfSkill(r) }));
    // a lane with no dot is left out (with a resume that shows every skill, say), so no empty band is drawn
    const lanes = (C.shown ? [[LN.todo, "todo"], [LN.have, "have"]] : [[Copy.fill(LN.craft, { field: C.label }), "craft"], [LN.people, "people"], [LN.every, "every"]]).filter(([, k]) => items.some(it => it.lane === k));
    const L = 16, R = 16, T = 12, B = 34, cw = w - L - R, ch = h - T - B;
    const X = v => L + v * cw;
    // a lane is as tall as its share of the dots, never under 64px, so a crowded lane gets the room
    const count = {}, idx = {}; for (const it of items) count[it.lane] = (count[it.lane] || 0) + 1;
    const MIN = 64, total = Math.max(1, items.length), raw = lanes.map(([, k]) => Math.max(MIN, ch * (count[k] || 0) / total)), sum = raw.reduce((a, b) => a + b, 0);
    const heights = raw.map(v => v * ch / sum), tops = heights.map((_, i) => T + heights.slice(0, i).reduce((a, b) => a + b, 0));
    let svg = `<svg class="sm-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`;
    lanes.forEach(([name], i) => { svg += `<rect class="ch-lane${i % 2 ? " alt" : ""}" x="${L}" y="${tops[i].toFixed(1)}" width="${cw}" height="${heights[i].toFixed(1)}"/><text class="sm-area ch-lane-name" x="${L + 8}" y="${(tops[i] + 15).toFixed(1)}">${esc(name.toUpperCase())}</text>`; });
    [0, .25, .5, .75, 1].forEach(v => { svg += `<line class="ch-grid" x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${T + ch + 4}"/><text class="ch-tick" x="${X(v)}" y="${T + ch + 18}" text-anchor="${v === 1 ? "end" : v === 0 ? "start" : "middle"}">${Math.round(v * 100)}%</text>`; });
    const blocked = lanes.map((_, i) => [L, tops[i], L + 170, tops[i] + 22]);
    const place = labeller(blocked, [L, T, L + cw, T + ch], true);   // forced: every dot on the chart carries its name
    // inside a lane the height says nothing: dots are spread down it in name order so the lane reads as a scatter,
    // not a staircase, and the names collide less
    const dots = [], names = [];
    for (const it of items.slice().sort((a, b) => a.name.localeCompare(b.name))) {
      const li = lanes.findIndex(([, k]) => k === it.lane); if (li < 0) continue;
      const n = count[it.lane], k = idx[it.lane] = (idx[it.lane] || 0) + 1;
      const x = X(it.share), y = tops[li] + 26 + ((k - 1) / Math.max(1, n - 1)) * (heights[li] - 40);
      const state = C.shown ? it.lane : "top", litCls = C.lit ? (C.lit.has(it.id) ? " lit" : " dim") : "", sel = it.id === ui.selected ? " sel" : "";
      dots.push(`<circle class="sm-n ${state}${litCls}${sel}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(3 + 5 * Math.sqrt(it.share)).toFixed(1)}" data-sk="${esc(it.id)}"/>`);
      const pos = place(x, y, it.name, 11); if (pos) names.push(`<text class="sm-name${C.shown ? " " + it.lane : ""}${litCls}${sel}" x="${pos.x.toFixed(1)}" y="${(y + 4 + (pos.dy || 0)).toFixed(1)}" text-anchor="${pos.anchor}">${esc(it.name)}</text>`);
    }
    svg += dots.join("") + names.join("") + "</svg>";
    C.el.innerHTML = svg;
  }

  // ---------- the route planner (PLAN.md v12, SP2-C): from a field to a role, the shortest route on the map, the
  // skills your resume shows ticked, build next; a tool, not a score. Uses the game's logic (window.SkillPath). ----------
  const plan = { from: null, to: null, su: null, ticks: null };
  async function planner(host, opts = {}) {
    await load();
    const SP = window.SkillPath; if (!host || !SP) return;
    const L = SP.logic, ix = data.ix, M = data.M;
    const fields = M.groups.map(g => g.id).filter(id => ix.groups.some(g => g.id === id));
    const roleLabel = id => (ix.roles[id] || {}).label || id, groupOf = id => (ix.roles[id] || {}).group;
    let you = null; try { you = JSON.parse(localStorage.getItem("you")); } catch { }
    if (!plan.from || !fields.includes(plan.from)) plan.from = ((you && you.fields) || []).find(f => fields.includes(f)) || (fields.includes("marketing") ? "marketing" : fields[0]);
    const want = opts.role && (ix.roles[opts.role] ? opts.role : ix.roles["product." + opts.role] ? "product." + opts.role : null);
    if (want) plan.to = want; else if (!plan.to || !ix.roles[plan.to]) plan.to = ix.roles["product.pm"] ? "product.pm" : Object.keys(ix.roles)[0];
    const render = () => {
      const fieldOpts = fields.map(g => `<option value="${esc(g)}"${g === plan.from ? " selected" : ""}>${esc(groupLabel(g))}</option>`).join("");
      const roleOpts = fields.map(g => { const rs = (ix.groups.find(x => x.id === g) || { roles: [] }).roles.filter(r => ix.roles[r]); return rs.length ? `<optgroup label="${esc(groupLabel(g))}">${rs.map(r => `<option value="${esc(r)}"${r === plan.to ? " selected" : ""}>${esc(roleLabel(r))}</option>`).join("")}</optgroup>` : ""; }).join("");
      host.innerHTML = `<div class="sm-plan" role="group" aria-label="Route planner"><span>Plan a route</span>
        <label>from <select id="sm-from" aria-label="From field">${fieldOpts}</select></label>
        <label>to <select id="sm-to" aria-label="To role">${roleOpts}</select></label>
        <button type="button" class="btn primary" id="sm-show">Show route</button>
        ${ui.route ? `<button type="button" class="linkish link" id="sm-clear">Clear</button>` : ""}
        <span class="sm-plan-out" id="sm-plan-out" aria-live="polite"></span></div>`;
      host.querySelector("#sm-from").onchange = e => { plan.from = e.target.value; };
      host.querySelector("#sm-to").onchange = e => { plan.to = e.target.value; };
      host.querySelector("#sm-show").onclick = show;
      const c = host.querySelector("#sm-clear"); if (c) c.onclick = () => { ui.route = null; plan.su = null; render(); draw(); };
    };
    const out = html => { const o = host.querySelector("#sm-plan-out"); if (o) o.innerHTML = html; };
    const line = () => {
      const su = plan.su, name = id => (data.byId[id] || {}).name || id, pct = v => v == null ? "not read" : Math.round(v * 100) + "%";
      const ticks = plan.ticks || new Set(), path = su.short;
      const route = path.map((id, i) => `${ticks.has(id) ? "<span class=\"you\">✓ </span>" : ""}${esc(name(id))}${i ? ` <span class="num">${pct(su.share(id))}</span>` : ""}`).join(" → ");
      const next = path.filter(id => !ticks.has(id) && su.share(id) != null && su.share(id) > 0 && !L.isDomain(data.M.skills.find(s => s.id === id))).sort((a, b) => su.share(b) - su.share(a))[0];
      const shown = ticks.size ? ` <span class="you">✓</span> ${ticks.size === 1 ? "a skill" : `${ticks.size} skills`} your resume shows.` : plan.ticks ? " Your resume shows none of them yet." : "";
      return `Shortest route from ${esc(groupLabel(plan.from))} to ${esc(roleLabel(plan.to))}: <b>${su.par} ${su.par === 1 ? "hop" : "hops"}</b>. ${route}. The blue number is the share of ${esc(roleLabel(plan.to))} postings that ask for it.${shown}${next ? ` Build next: <b>${esc(name(next))}</b> (<span class="num">${pct(su.share(next))}</span> of ${esc(roleLabel(plan.to))} postings).` : ""}`;
    };
    async function show() {
      out("Finding the route…");
      try {
        const [Pr, generic] = await Promise.all([Atlas.product(), Atlas.genericSkills()]);
        const B = L.buildBoard(M, generic), fs = Object.keys(data.FS).filter(g => g in data.field);
        const su = L.setup({ ix, P: Pr, B, FS: data.FS, fields: fs }, "field", plan.from, plan.to);
        const refuse = L.refusal(ix, "field", plan.from, plan.to, su);
        if (refuse) { ui.route = null; plan.su = null; draw(); render(); out(`<span class="warn">${refuse === "same-field" ? `${esc(roleLabel(plan.to))} is a ${esc(groupLabel(plan.from))} role: pick a role in another field.` : refuse === "par0" ? `${esc(groupLabel(plan.from))} already starts on one of the skills that set ${esc(roleLabel(plan.to))} apart: ${esc((data.byId[su.start] || {}).name || "")}.` : "No route on the board for this pairing."}</span>`); return; }
        plan.su = su; plan.ticks = null;
        ui.route = { path: su.short, arrivals: su.arrivals, ticks: new Set() };
        ui.focus = null;
        render(); draw(); out(line());
        const ev = await SP.tools.evidence(Atlas, plan.to).catch(() => null);
        if (ev && plan.su === su) { plan.ticks = new Set(su.short.filter(id => ev.has(id))); ui.route.ticks = plan.ticks; draw(); out(line()); }
      } catch (e) { console.error(e); out(`<span class="warn">Could not plan the route: ${esc(e && e.message || e)}.</span>`); }
    }
    render();
    if (plan.su && ui.route) out(line());
  }
  const mode = () => session.get(MODE_KEY, "grid"), setMode = m => session.set(MODE_KEY, m);
  const showAll = v => { ui.all = !!v; draw(); }, allShown = () => ui.all;
  // read-only, for games that use the map as a board (web/games/skill-path.js): positions, links and field shares;
  // FS gains the product field once the product set has loaded
  async function board() { await load(); return { nodes: data.nodes, byId: data.byId, adj: data.adj, field: data.field, rField: R_FIELD, A, get FS() { return data.FS; } }; }
  window.SkillMap = { stage, find, names, leave, mode, setMode, showAll, allShown, board, chart, chartLight, planner };
})();
