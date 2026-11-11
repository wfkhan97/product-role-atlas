/* The apprentice map's pure parts (the build plan's B3): what #/map draws, read from a version 2 map file (section 4
   of the plan) and the atlas's own index. No DOM, no fetch: a classic script that also loads in node,
   require("web/map.js") (tests/web/map.test.mjs). The screen is app.js's mapScreen; every string is Copy.map.
     classTree(map)               the class tree: the trunk, the shared and own nodes with their places and states, the
                                  branches per role in the class's order with the first role first (R22 to R26)
     treeLayout(tree, width)      coordinates for T4: the trunk as a bar, trunk nodes on it, shared nodes on ticks beside
                                  it, a stem per role with its own nodes on short ticks; nothing threaded on a stroke
     coAsked(map, index, id, n)   the strongest co-asked skills among the tree's nodes, from the index's edges (R25)
     worlds(map, mine)            per level: its head and name, the quests with their states (open, started, shipped,
                                  skipped); "you are here", the first quest neither shipped nor skipped; the level
                                  "side" (the side projects a person picked, web/quests.js) has a head and no number
     ownChoice(obj)               the person's own mark from a feedback file, old shapes read too; questState(card, mine)
     upNext(ws, id, n), nowQuest(ws, asked)   the quests after this one still to do; the quest the now card shows
     shipLine(ship), firstSentence(text)      "You ship" in one line of at most 16 words; a why line's first sentence
     questsOf(map, id)            the cards whose atlas_skills name the skill, in level order
     readLines(map, index, mine)  the read (the Skill tree page's List): the band headline, what you bring with its
                                  lines, the marked gaps with the quest that builds each (R31)
     storyOf(card)                a story card's parts (the skill, its state, the line as it stands, what it means here,
                                  the slots a line that shows it fills, the practice prompt), or null for a build card
     lineState(status)            the matcher's status of one line read on its own, as one of the four states
     shippedLook(node, map, mine) the fifth look for a node a shipped quest built, with the date in words (R30)
     dateWords("2026-11-14")      "November 14, 2026"
   The map is read, never written: the owner's republish sets shipped and declined (changed and reply draw nothing).
   The person's own marks (`mine`, one feedback object per card) count as the file's do: a self-marked shipped quest
   gives its skills the fifth look; a skipped one builds nothing. No level is gated, so none clears. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.Copy || require("./copy.js"));
  else root.MapModel = factory(root.Copy);
})(typeof self !== "undefined" ? self : this, function (Copy) {
  "use strict";
  const fill = Copy.fill, C = () => Copy.map;
  const STATES = ["shows", "shows in other words", "must evidence better", "must build"];
  const RANK = { "shows": 0, "shows in other words": 1, "must evidence better": 2, "must build": 3 };
  const QUEST_STATES = ["open", "started", "shipped", "skipped"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const list = x => Array.isArray(x) ? x : [];
  const byId = xs => Object.fromEntries(list(xs).filter(x => x && x.id).map(x => [x.id, x]));
  const rankOf = s => s in RANK ? RANK[s] : 3;

  // "2026-11-14" -> "November 14, 2026"; anything else as it is
  function dateWords(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    return m && +m[2] >= 1 && +m[2] <= 12 ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : String(iso || "");
  }

  // ---------- the cards and the worlds they sit in ----------
  const cardsById = map => byId((map || {}).cards);
  // the worlds in the file, or one per level for a file without them (a version 1 map)
  function worldList(map) {
    if (list(map.worlds).length) return map.worlds;
    const levels = [...new Set(list(map.cards).map(c => c.level))];
    return levels.map(l => ({ n: l, label: l === "reach" ? C().reachHead : "", optional: l === "reach", missions: list(map.cards).filter(c => c.level === l).map(c => c.id) }));
  }
  const missionOrder = map => worldList(map).flatMap(w => list(w.missions));
  function worldOfCard(map, cardId) { return worldList(map).find(w => list(w.missions).includes(cardId)) || null; }

  // ---------- the class tree ----------
  // The trunk (every role in the class asks), the shared nodes (two or more) and each role's own (one). The roles keep
  // the class's order with the first role first; a node's state is the file's, which is already the best across the
  // class (R26); a node a shipped quest built carries the fifth look as `shipped`.
  function classTree(map, mine) {
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
      node.shipped = shippedLook(node, map, mine);
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
  // the cards whose atlas_skills name the skill, in level order (a card in no level last, in the file's order)
  function questsOf(map, skillId) {
    const order = missionOrder(map), at = id => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
    return list(map.cards).filter(c => list(c.atlas_skills).includes(skillId)).sort((a, b) => at(a.id) - at(b.id));
  }
  // The person's own mark on a quest, from their feedback file: { choice: "start" | "shipped" | "skip", link, date },
  // or null. The files written before 2026-11-10 read too: "build" as start, "not" as skip, "change" as nothing; "open"
  // is the undo, and reads as nothing.
  const OLD_CHOICE = { build: "start", not: "skip" };
  function ownChoice(obj) {
    if (!obj || typeof obj !== "object") return null;
    const c = OLD_CHOICE[obj.choice] || obj.choice;
    if (!["start", "shipped", "skip"].includes(c)) return null;
    return { choice: c, link: c === "shipped" && typeof obj.link === "string" && obj.link ? obj.link : null, date: typeof obj.date === "string" ? obj.date : null };
  }
  // one quest's state: the file first (the owner's shipped, and declined as skipped), then the person's own mark
  const OWN_STATE = { start: "started", shipped: "shipped", skip: "skipped" };
  function questState(card, mine) {
    if (card.shipped) return "shipped";
    if (card.declined) return "skipped";
    const o = ownChoice(mine);
    return o ? OWN_STATE[o.choice] : "open";
  }
  // the date a quest shipped on: the file's, else the person's own mark
  function shippedOn(card, mine) {
    if (card.shipped) return String(card.shipped);
    const o = ownChoice(mine);
    return o && o.choice === "shipped" ? o.date || "" : null;
  }
  // Per level: the quests in order with their states; then "you are here": the first quest neither shipped nor skipped,
  // across the levels in order. `mine` is the person's own feedback by card id. No level is gated and none clears
  // (2026-11-10): a file's worlds[].clear is read past.
  function worlds(map, mine) {
    const cards = cardsById(map), own = mine || {};
    const ws = worldList(map).map(w => {
      const side = w.n === "side";   // the side projects the person picked (2026-11-11): no number, first on the path
      const optional = !side && (!!w.optional || w.n === "reach");
      const missions = list(w.missions).filter(id => cards[id]).map((id, i) => {
        const card = cards[id], m = own[id] || null, o = ownChoice(m);
        return { id, i: i + 1, card, kind: card.kind === "story" ? "story" : "build", state: questState(card, m), own: o, locked: !!(card.shipped || card.declined), shippedOn: shippedOn(card, m), link: (o || {}).link || null };
      });
      return { num: w.n, head: side ? C().sideHead : optional ? C().reachHead : fill(C().levelHead, { n: w.n }), label: side ? "" : levelName(w, optional), optional, side, missions };
    });
    const here = (ws.flatMap(w => w.missions).find(m => m.state === "open" || m.state === "started") || {}).id || null;
    return { worlds: ws, here };
  }
  // A level's name on screen: the copy's for the four levels (2026-11-10: the file's labels carry durations, and the
  // screen shows none), else the file's label.
  function levelName(w, optional) {
    const L = C().levels || {};
    return (optional ? L.reach : L[w.n]) || w.label || "";
  }
  function missionOf(ws, cardId) {
    for (const w of ws.worlds) { const m = w.missions.find(x => x.id === cardId); if (m) return { world: w, mission: m }; }
    return null;
  }
  const flatQuests = ws => ws.worlds.flatMap(w => w.missions);
  // the quests after this one that are still open or started, in order and around to the start, at most n
  function upNext(ws, fromId, n = 3) {
    const all = flatQuests(ws), i = all.findIndex(m => m.id === fromId);
    const order = i < 0 ? all : all.slice(i + 1).concat(all.slice(0, i));
    return order.filter(m => m.state === "open" || m.state === "started").slice(0, n);
  }
  // the quest the now card shows: the asked one if it is on the map, else "you are here", else the first
  function nowQuest(ws, asked) {
    const all = flatQuests(ws);
    return (asked && all.find(m => m.id === asked)) || all.find(m => m.id === ws.here) || all[0] || null;
  }

  // ---------- the words of a quest card, cut short ----------
  // "You ship" in one line: the first sentence of `ship`, cut at a clause (a colon, a semicolon, a dash, an opening
  // bracket or a comma after six words) or else at a word, so it holds at most 16 words; a cut mid-clause ends in "…"
  const SHIP_WORDS = 16;
  function firstSentence(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    const m = /^(.+?[.?!])(?=\s+[A-Z“"(]|$)/.exec(t);
    return m ? m[1] : t;
  }
  function shipLine(ship) {
    const s = firstSentence(ship).replace(/[.?!]+$/, "");
    if (!s) return "";
    const words = s.split(" ");
    if (words.length <= SHIP_WORDS) return s + ".";
    const head = words.slice(0, SHIP_WORDS).join(" ");
    const hard = /^(.*?)\s*(?::|;| — | – | \()/.exec(head);
    if (hard && hard[1].split(" ").length >= 3) return hard[1].replace(/[,.]+$/, "") + ".";
    const comma = head.lastIndexOf(",");
    if (comma > 0 && head.slice(0, comma).split(" ").length >= 6) return head.slice(0, comma) + ".";
    return head.replace(/[,;:.]+$/, "") + "…";
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
  function skillInfo(map, index, id, mine) {
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
    info.shipped = shippedLook(info, map, mine);
    return info;
  }

  // ---------- D1: the read (R31) ----------
  // The band in words as the headline; what you bring, grouped under the résumé line that showed it; the marked gaps,
  // each with the quest that builds it (the first in level order not already named for an earlier gap, so the gaps
  // do not all point at one quest; a skipped quest builds nothing) or "No quest builds it yet".
  function readLines(map, index, mine) {
    const rd = map.read || {}, M = C();
    const role = (map.role || {}).label || "";
    const band = rd.band_label || ((Copy.common || {}).bands || {})[rd.band] || "";
    const brings = list(rd.brings).map(b => ({ id: b.id, name: b.name || b.id, state: STATES.includes(b.state) ? b.state : "shows", line: b.line || "" }));
    const groups = [];
    for (const b of brings) { let g = groups.find(x => x.line === b.line); if (!g) groups.push(g = { line: b.line, skills: [] }); g.skills.push(b); }
    const own = mine || {}, cards = cardsById(map), order = missionOrder(map).filter(id => cards[id] && questState(cards[id], own[id]) !== "skipped"), used = new Set();
    const gaps = list(rd.marked_gaps).slice(0, 8).map(id => {
      const s = skillInfo(map, index, id);
      const ms = order.filter(cid => list(cards[cid].atlas_skills).includes(id));
      const m = ms.find(cid => !used.has(cid)) || ms[0] || null;
      if (m) used.add(m);
      const w = m ? worldOfCard(map, m) : null;
      return { id, name: s.name, state: s.state, sentence: s.what, mission: m ? cards[m] : null, world: w ? (w.n === "side" ? M.sideHead : w.n === "reach" || w.optional ? M.reachHead : fill(M.levelHead, { n: w.n })) : null, none: m ? null : M.noQuest };
    });
    return { band, role, headline: band && role ? fill(M.band, { band, role }) : band, brings, groups, gaps };
  }

  // ---------- the story cards (Level 1): one line of the résumé, rewritten so the skill shows ----------
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
  // a node a shipped quest built reads "shows, shipped <date>": the earliest shipped card that names it, shipped in the
  // file or marked shipped by the person (mine)
  function shippedLook(node, map, mine) {
    const id = node && node.id; if (!id) return null;
    const own = mine || {};
    const hits = list((map || {}).cards).map(c => ({ c, on: shippedOn(c, own[c.id]) })).filter(h => h.on != null && list(h.c.atlas_skills).includes(id)).sort((a, b) => a.on.localeCompare(b.on));
    if (!hits.length) return null;
    const { c, on } = hits[0];
    return { state: "shows", look: "shipped", date: on, words: dateWords(on), card: c.id, title: c.title || "", label: on ? fill(C().shippedState, { date: dateWords(on) }) : C().shippedLegend };
  }

  return { STATES, RANK, QUEST_STATES, rankOf, dateWords, classTree, treeLayout, coAsked, worlds, missionOf, ownChoice, questState, shippedOn, upNext, nowQuest, shipLine, firstSentence, SHIP_WORDS, questsOf, readLines, shippedLook, skillInfo, fieldKeys, worldOfCard, worldList, cardsById, storyOf, lineState, SLOT_KEYS };
});
