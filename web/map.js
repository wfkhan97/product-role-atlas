/* The apprentice map's pure parts (the build plan's B3): what #/map draws, read from a version 2 map file (section 4
   of the plan) and the atlas's own index. No DOM, no fetch: a classic script that also loads in node,
   require("web/map.js") (tests/web/map.test.mjs). The screen is app.js's mapScreen; every string is Copy.map.
     classTree(map)               the class tree: the trunk, the shared and own nodes with their places and states, the
                                  branches per role in the class's order with the first role first (R22 to R26)
     treeLayout(tree, width)      coordinates for T4: the trunk as a bar, trunk nodes on it, shared nodes on ticks beside
                                  it, a stem per role with its own nodes on short ticks; nothing threaded on a stroke
     coAsked(map, index, id, n)   the strongest co-asked skills among the tree's nodes, from the index's edges (R25)
     worlds(map, mine)            per world: the missions with their states, clear (k), n (declined missions off it),
                                  shipped, cleared, the progress line in words; and "you are here" (R27 to R29)
     questLayout(ws)              coordinates for Q1: the worlds left to right, the stops, the flags, the road
     questsOf(map, id)            the cards whose atlas_skills name the skill, in world order
     readLines(map, index)        D1: the band headline, what you bring with its lines, the marked gaps with the mission
                                  that builds each (R31)
     storyOf(card)                a story card's parts (the skill, its state, the line as it stands, what it means here,
                                  the slots a line that shows it fills, the practice prompt), or null for a build card
     lineState(status)            the matcher's status of one line read on its own, as one of the four states
     shippedLook(node, map)       the fifth look for a node a shipped mission built, with the date in words (R30)
     dateWords("2026-11-14")      "November 14, 2026"
   The map is read, never written: the owner's republish sets shipped, changed, declined and reply. The person's own
   feedback (`mine`, one object per card the screen has read) only marks a stop; the counts follow the file. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.Copy || require("./copy.js"));
  else root.MapModel = factory(root.Copy);
})(typeof self !== "undefined" ? self : this, function (Copy) {
  "use strict";
  const fill = Copy.fill, C = () => Copy.map;
  const STATES = ["shows", "shows in other words", "must evidence better", "must build"];
  const RANK = { "shows": 0, "shows in other words": 1, "must evidence better": 2, "must build": 3 };
  const MISSION_STATES = ["open", "chosen", "shipped", "declined", "changed"];
  const CHOICE_STATE = { build: "chosen", not: "declined", change: "changed" };
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const list = x => Array.isArray(x) ? x : [];
  const byId = xs => Object.fromEntries(list(xs).filter(x => x && x.id).map(x => [x.id, x]));
  const rankOf = s => s in RANK ? RANK[s] : 3;

  // "2026-11-14" -> "November 14, 2026"; anything else as it is
  function dateWords(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    return m && +m[2] >= 1 && +m[2] <= 12 ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : String(iso || "");
  }
  // a small count in words at the start of a sentence ("One", "Two"), the digit past ten
  const numWord = n => (C().numbers || [])[n] || String(n);

  // ---------- the cards and the worlds they sit in ----------
  const cardsById = map => byId((map || {}).cards);
  // the worlds in the file, or one per level for a file without them (a version 1 map)
  function worldList(map) {
    if (list(map.worlds).length) return map.worlds;
    const levels = [...new Set(list(map.cards).map(c => c.level))];
    return levels.map(l => ({ n: l, label: l === "reach" ? C().reachHead : "", who: "", clear: l === "reach" ? 0 : 1, optional: l === "reach", missions: list(map.cards).filter(c => c.level === l).map(c => c.id) }));
  }
  const missionOrder = map => worldList(map).flatMap(w => list(w.missions));
  function worldOfCard(map, cardId) { return worldList(map).find(w => list(w.missions).includes(cardId)) || null; }

  // ---------- the class tree ----------
  // The trunk (every role in the class asks), the shared nodes (two or more) and each role's own (one). The roles keep
  // the class's order with the first role first; a node's state is the file's, which is already the best across the
  // class (R26); a node a shipped mission built carries the fifth look as `shipped`.
  function classTree(map) {
    const rc = map.role_class || {}, t = map.tree || {};
    let roles = list(rc.roles).map(r => ({ id: r.id, label: r.label || r.id, first: !!r.first }));
    if (!roles.length && map.role) roles = [{ id: map.role.id, label: map.role.label || map.role.id, first: true }];
    if (roles.length && !roles.some(r => r.first)) roles[0].first = true;
    roles = roles.filter(r => r.first).slice(0, 1).concat(roles.filter(r => !r.first));
    roles.forEach((r, i) => { r.first = i === 0; });
    const first = roles.length ? roles[0].id : null;
    const shape = (n, kind) => {
      const node = {
        id: n.id, name: n.name || n.id, area: n.area || null, area_label: n.area_label || null, kind,
        place: n.place === "trunk" || n.place === "shared" || n.place === "own" ? n.place : "own",
        roles: list(n.roles).filter(r => roles.some(x => x.id === r)), state: STATES.includes(n.state) ? n.state : "must build",
        line: n.line || null, through: n.through || null, grows: !!n.grows, posting_names: !!n.posting_names,
      };
      node.shipped = shippedLook(node, map);
      return node;
    };
    const nodes = list(t.nodes).map(n => shape(n, "skill"));
    const behaviours = list(t.behaviours).map(n => shape(n, "behaviour"));
    const more = list(t.more).filter(m => !nodes.some(n => n.id === m.id)).map(m => ({ id: m.id, name: m.name || m.id, state: STATES.includes(m.state) ? m.state : "must build", kind: "more" }));
    const trunk = nodes.filter(n => n.place === "trunk"), shared = nodes.filter(n => n.place === "shared");
    // an own node sits on the branch of the one role that asks for it; a node naming no role of the class goes to the first
    const ownOf = n => n.roles[0] || first;
    const branches = roles.map(r => ({ role: r, own: nodes.filter(n => n.place === "own" && ownOf(n) === r.id) }));
    return { roles, first, label: rc.label || "", field: rc.field || null, nodes, trunk, shared, branches, behaviours, more };
  }

  // ---------- T4: the tree's coordinates ----------
  // Fixed sizes, so the names stay 14 px when the side panel opens; the page scrolls sideways instead. The numbers are
  // the approved mock's (T4.js: an 816 by 628 tree for four roles with at most four own skills each), generalized:
  // the crowns grow with the longest branch, the shared rows with the longer side, the trunk with its nodes.
  const T = { width: 816, margin: 16, crown: 228, top: 64, gap: 50, trunkGap: 50, bar: 16, forkDrop: 72, sharedDrop: 42, tick: 24, sharedOff: 62, trunkPad: 8, groundPad: 20, groundW: 120, rOwn: 9, rShared: 10, rTrunk: 12 };
  function treeLayout(tree, width) {
    const W = Math.max(480, Math.round(width || T.width)), TX = Math.round(W / 2 + 12);
    const n = tree.branches.length, maxOwn = Math.max(1, ...tree.branches.map(b => b.own.length));
    const CB = T.top + (maxOwn - 1) * T.gap, FORK = CB + T.forkDrop, SY = FORK + T.sharedDrop;
    // the shared nodes the first role asks for sit on its side (left), the rest on the right
    const left = tree.shared.filter(s => s.roles.includes(tree.first)), right = tree.shared.filter(s => !s.roles.includes(tree.first));
    const rows = Math.max(left.length, right.length);
    const TY = SY + rows * T.gap + (rows ? T.trunkPad : 0);
    const GROUND = TY + Math.max(0, tree.trunk.length - 1) * T.trunkGap + T.groundPad;
    const H = GROUND + 22;
    const span = W - T.margin - T.crown;
    const nodes = [], branches = [];
    tree.branches.forEach((b, i) => {
      const x = Math.round(n === 1 ? T.margin : T.margin + i * span / (n - 1));
      const top = CB - Math.max(0, b.own.length - 1) * T.gap;
      branches.push({
        role: b.role.id, label: b.role.label, first: b.role.first,
        sweep: `M${TX},${FORK + 4} C${TX},${FORK - 30} ${x},${FORK - 12} ${x},${CB + 26}`,
        stem: { x, y1: CB + 26, y2: top - 8 }, text: { x: x - 6, y: top - 30 },
      });
      b.own.forEach((node, k) => {
        const y = top + k * T.gap, nx = x + T.tick;
        nodes.push({ id: node.id, place: "own", role: b.role.id, x: nx, y, r: T.rOwn, side: "r", tick: { x1: x, y1: y, x2: nx - 10, y2: y, first: b.role.first } });
      });
    });
    left.forEach((node, k) => { const y = SY + k * T.gap; nodes.push({ id: node.id, place: "shared", role: null, x: TX - T.sharedOff, y, r: T.rShared, side: "l", tick: { x1: TX - T.bar, y1: y, x2: TX - T.sharedOff + 10, y2: y, first: false } }); });
    right.forEach((node, k) => { const y = SY + k * T.gap; nodes.push({ id: node.id, place: "shared", role: null, x: TX + T.sharedOff, y, r: T.rShared, side: "r", tick: { x1: TX + T.bar, y1: y, x2: TX + T.sharedOff - 10, y2: y, first: false } }); });
    // the trunk's own skills inside the bar, the names alternating sides
    tree.trunk.forEach((node, k) => nodes.push({ id: node.id, place: "trunk", role: null, x: TX, y: TY + k * T.trunkGap, r: T.rTrunk, side: k % 2 ? "l" : "r", tick: null }));
    return {
      width: W, height: H, trunkX: TX,
      trunk: { x: TX - T.bar, y: FORK, width: 2 * T.bar, height: GROUND - FORK },
      ground: { x1: TX - T.groundW, x2: TX + T.groundW, y: GROUND + 8 },
      branches, nodes,
    };
  }

  // ---------- "asked together with" (R25) ----------
  // the n skills most often asked together with this one, among the tree's nodes, strongest first (the index's
  // co-asked pairs, by Jaccard); ties by id so a test can assert the order
  function coAsked(map, index, skillId, n = 3) {
    const onTree = new Set(list((map.tree || {}).nodes).map(x => x.id));
    const edges = list((index && (index.edges || (index.M && index.M.edges))) || []);
    const best = {};
    for (const e of edges) {
      const other = e.source === skillId ? e.target : e.target === skillId ? e.source : null;
      if (!other || other === skillId || !onTree.has(other)) continue;
      const j = Number(e.jaccard) || 0;
      if (!(other in best) || j > best[other]) best[other] = j;
    }
    return Object.entries(best).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([id]) => id);
  }

  // ---------- the quests ----------
  // the cards whose atlas_skills name the skill, in world order (a card in no world last, in the file's order)
  function questsOf(map, skillId) {
    const order = missionOrder(map), at = id => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
    return list(map.cards).filter(c => list(c.atlas_skills).includes(skillId)).sort((a, b) => at(a.id) - at(b.id));
  }
  // one mission's state: the file first (shipped, declined, changed), then the person's own last answer, else open
  function missionState(card, sent) {
    if (card.shipped) return "shipped";
    if (card.declined) return "declined";
    if (card.changed) return "changed";
    if (sent && CHOICE_STATE[sent.choice]) return CHOICE_STATE[sent.choice];
    return "open";
  }
  // the clear line and the progress line, in words (R28, R31: the only numbers are "Ship 2 of these 6")
  function clearLine(w) {
    const M = C();
    if (w.optional) return M.clearReach;
    if (w.cleared) return M.clearedLine;
    if (w.n === 0) return M.clearNone;
    if (w.n === 1) return M.clearOne;
    if (w.clear >= w.n) return fill(M.clearAll, { n: w.n });
    return fill(M.clearSome, { k: w.clear, n: w.n });
  }
  function progressLine(w) {
    const M = C();
    if (w.optional) return w.shipped ? M.reachDone : M.reachNone;
    if (w.cleared) return M.cleared;
    if (!w.shipped) return M.nothingYet;
    const left = w.clear - w.shipped;
    return fill(left === 1 ? M.moreOne : M.moreMany, { shipped: numWord(w.shipped), left: numWord(left) });
  }
  // Per world: the missions in order with their states, clear (k, at most n), n (the missions the file has not
  // declined), shipped, cleared; then "you are here": the first open or chosen mission across the worlds. `mine` is
  // the person's own feedback by card id, as the screen read it; it marks a stop and never moves a count.
  function worlds(map, mine) {
    const cards = cardsById(map), own = mine || {};
    const ws = worldList(map).map(w => {
      const optional = !!w.optional || w.n === "reach";
      const missions = list(w.missions).filter(id => cards[id]).map((id, i) => {
        const card = cards[id], sent = own[id] && own[id].choice ? own[id] : null;
        return { id, i: i + 1, card, kind: card.kind === "story" ? "story" : "build", state: missionState(card, sent), sent };
      });
      const live = missions.filter(m => !m.card.declined);
      const n = live.length, shipped = live.filter(m => m.card.shipped).length;
      const clear = optional ? 0 : Math.min(Math.max(0, Number(w.clear) || 0), n);
      const world = { num: w.n, label: w.label || "", who: w.who || "", optional, missions, n, clear, shipped, cleared: !optional && n > 0 && shipped >= clear };
      world.head = optional ? C().reachHead : fill(C().worldHead, { n: w.n });
      world.clearLine = clearLine(world);
      world.progress = progressLine(world);
      return world;
    });
    const here = (ws.flatMap(w => w.missions).find(m => m.state === "open" || m.state === "chosen") || {}).id || null;
    return { worlds: ws, here };
  }
  function missionOf(ws, cardId) {
    for (const w of ws.worlds) { const m = w.missions.find(x => x.id === cardId); if (m) return { world: w, mission: m }; }
    return null;
  }

  // ---------- Q1: the overworld's coordinates ----------
  // The worlds left to right along one road; a world is as wide as its missions need (the mock's 430 for six, 210 for
  // one). Stops zigzag inside their world; a world with one mission holds it in the middle. A flag ends each world but
  // the Reach, and the road runs dashed into the Reach.
  const Q = { gap: 14, mid: 112, hi: 74, lo: 150, r: 18, min: 210, max: 460, per: 50, base: 130, top: 100, svgH: 214, h: 384 };
  function questLayout(ws) {
    const cols = [];
    let x = 0;
    for (const w of ws.worlds) {
      const width = Math.max(Q.min, Math.min(Q.max, Q.base + Q.per * w.missions.length));
      cols.push({ x, width }); x += width + Q.gap;
    }
    const width = Math.max(0, x - Q.gap), stops = [], flags = [];
    ws.worlds.forEach((w, ci) => {
      const c = cols[ci], n = w.missions.length;
      w.missions.forEach((m, i) => {
        const sx = n === 1 ? c.x + (c.width - 40) / 2 : c.x + 44 + i * ((c.width - 110) / (n - 1));
        stops.push({ id: m.id, world: ci, i: m.i, x: Math.round(sx), y: n === 1 ? Q.mid : (i % 2 ? Q.lo : Q.hi), r: Q.r });
      });
      if (!w.optional) flags.push({ world: ci, x: c.x + c.width - 26, y: Q.mid });
    });
    const road = [], reach = [];
    ws.worlds.forEach((w, ci) => {
      const pts = stops.filter(s => s.world === ci).map(s => [s.x, s.y]);
      if (w.optional) { reach.push(...pts); return; }
      road.push(...pts);
      const f = flags.find(f => f.world === ci); if (f) road.push([f.x, f.y]);
    });
    const lastFlag = flags[flags.length - 1];
    return { width, height: Q.h, top: Q.top, svgHeight: Q.svgH, columns: cols, stops, flags, road: smooth(road), reach: reach.length && lastFlag ? smooth([[lastFlag.x, lastFlag.y], ...reach]) : "" };
  }
  // a smooth line through the points (Catmull-Rom as cubic curves)
  function smooth(pts) {
    if (!pts.length) return "";
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  // ---------- one skill, wherever it comes from ----------
  // What the screen says about a skill id: the class tree's record first, then the "more" list, then what you bring,
  // then the index (a card may name a skill that is on none of them). `what` is the index's reading for the first
  // role's field (reads_as), else its definition; a skill the taxonomy no longer has keeps the map's name.
  function fieldKeys(map) {
    const rc = map.role_class || {}, first = (list(rc.roles).find(r => r.first) || map.role || {}).id;
    return [first ? `role:${first}` : null, rc.field || null].filter(Boolean);
  }
  function readsOf(index, skill, keys) {
    if (!skill) return null;
    if (index && typeof index.reads === "function") { const r = index.reads(skill, keys); if (r) return r; }
    const f = skill.fields || {};
    for (const k of keys) if (f[k] && f[k].reads_as) return f[k].reads_as;
    return null;
  }
  function skillInfo(map, index, id) {
    const t = map.tree || {}, rec = byId(list(t.nodes).concat(list(t.behaviours)))[id], more = byId(t.more)[id], bring = byId((map.read || {}).brings)[id];
    const sk = index && index.skillById ? index.skillById[id] || null : null;
    const clusters = index && (index.clusters || (index.M && index.M.clusters)) || {};
    const base = rec || more || bring || {};
    const state = STATES.includes(base.state) ? base.state : "must build";
    const area = (rec && rec.area) || (sk && sk.cluster) || null;
    const info = {
      id, name: base.name || (sk && sk.name) || id, state, place: rec ? rec.place : null, onTree: !!(rec && list(t.nodes).some(n => n.id === id)),
      behaviour: !!(rec && list(t.behaviours).some(n => n.id === id)), more: !rec && !!more,
      area, area_label: (area && clusters[area] && clusters[area].label) || (rec && rec.area_label) || null,
      roles: rec ? list(rec.roles) : [], line: (rec && rec.line) || (bring && bring.line) || null, through: (rec && rec.through) || null,
      grows: !!(rec && rec.grows), posting_names: !!(rec && rec.posting_names) || list((map.posting || {}).names).includes(id),
      what: readsOf(index, sk, fieldKeys(map)) || (sk && sk.what) || null,
    };
    info.shipped = shippedLook(info, map);
    return info;
  }

  // ---------- D1: the read (R31) ----------
  // The band in words as the headline; what you bring, grouped under the résumé line that showed it; the marked gaps,
  // each with the mission that builds it (the first in world order not already named for an earlier gap, so the gaps
  // do not all point at one mission; a mission the file declined builds nothing) or "No mission builds it yet".
  function readLines(map, index) {
    const rd = map.read || {}, M = C();
    const role = (map.role || {}).label || "";
    const band = rd.band_label || ((Copy.common || {}).bands || {})[rd.band] || "";
    const brings = list(rd.brings).map(b => ({ id: b.id, name: b.name || b.id, state: STATES.includes(b.state) ? b.state : "shows", line: b.line || "" }));
    const groups = [];
    for (const b of brings) { let g = groups.find(x => x.line === b.line); if (!g) groups.push(g = { line: b.line, skills: [] }); g.skills.push(b); }
    const cards = cardsById(map), order = missionOrder(map).filter(id => cards[id] && !cards[id].declined), used = new Set();
    const gaps = list(rd.marked_gaps).slice(0, 8).map(id => {
      const s = skillInfo(map, index, id);
      const ms = order.filter(cid => list(cards[cid].atlas_skills).includes(id));
      const m = ms.find(cid => !used.has(cid)) || ms[0] || null;
      if (m) used.add(m);
      const w = m ? worldOfCard(map, m) : null;
      return { id, name: s.name, state: s.state, sentence: s.what, mission: m ? cards[m] : null, world: w ? (w.n === "reach" || w.optional ? M.reachHead : fill(M.worldHead, { n: w.n })) : null, none: m ? null : M.noMission };
    });
    return { band, role, headline: band && role ? fill(M.band, { band, role }) : band, brings, groups, gaps };
  }

  // ---------- the story cards (World 1): one line of the résumé, rewritten so the skill shows ----------
  // The generator writes them (pipeline/apprentice/assemble.mjs); the screen draws the line as it stands, the slots
  // and the prompt, and reads a new line live with the matcher. The matcher's status of a line read on its own maps
  // to the four states the way the generator maps a résumé's (ground.mjs, STATE).
  const SLOT_KEYS = ["artefacts", "verbs", "counterparts", "measures"];
  const LINE_STATE = { evidenced: "shows", through: "shows", transferable: "shows in other words", thin: "must evidence better", presumed: "must evidence better", gap: "must build" };
  const lineState = status => LINE_STATE[status] || "must build";
  function storyOf(card) {
    if (!card || card.kind !== "story") return null;
    const h = card.shown_by || {};
    return {
      skill: card.skill || (list(card.atlas_skills)[0] || null), state: STATES.includes(card.state) ? card.state : "must evidence better",
      line: card.line || "", what: card.what || null, reads_as: card.reads_as || null,
      slots: SLOT_KEYS.map(k => ({ key: k, items: list(h[k]).map(String) })).filter(s => s.items.length),
      prompt: card.prompt || "",
    };
  }

  // ---------- P1: the fifth look (R30) ----------
  // a node a shipped mission built reads "shows, shipped <date>": the earliest shipped card that names it
  function shippedLook(node, map) {
    const id = node && node.id; if (!id) return null;
    const hits = list((map || {}).cards).filter(c => c.shipped && list(c.atlas_skills).includes(id)).sort((a, b) => String(a.shipped).localeCompare(String(b.shipped)));
    if (!hits.length) return null;
    const c = hits[0];
    return { state: "shows", look: "shipped", date: c.shipped, words: dateWords(c.shipped), card: c.id, title: c.title || "", label: fill(C().shippedState, { date: dateWords(c.shipped) }) };
  }

  return { STATES, RANK, MISSION_STATES, CHOICE_STATE, rankOf, dateWords, numWord, classTree, treeLayout, coAsked, worlds, missionOf, missionState, questLayout, questsOf, readLines, shippedLook, skillInfo, fieldKeys, worldOfCard, worldList, cardsById, storyOf, lineState, SLOT_KEYS };
});
