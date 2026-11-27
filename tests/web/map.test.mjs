// web/map.js, the apprentice map's pure parts: the class tree, the T4 layout, "asked together with", the levels with
// their k of n and the person's own marks (start, shipped, skip; the old shapes read too), up next and the now quest,
// the "You ship" line, the quests of a skill, the read, the shipped look and the date in words, on a small synthetic
// map built here; then the tracked example (pipeline/apprentice/examples/pmm-nyc/): it parses as version 2 with 19
// nodes and three on the trunk, and every quest is a card.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, root, web } from "./_load.mjs";

const M = require(path.join(web, "map.js"));
const Copy = require(path.join(web, "copy.js"));
const MC = Copy.map;

// ---------- the synthetic map: a class of two roles, six nodes, two behaviors, four cards over three worlds ----------
const node = (id, place, roles, state, extra = {}) => ({ id, name: id.toUpperCase(), area: "gtm", area_label: "Go-to-market", place, roles, state, grows: false, posting_names: false, ...extra });
const card = (id, level, skills, extra = {}) => ({ id, level, track: "gtm", title: `Quest ${id}`, ship: "A page.", hours: 3, window: "an evening", why_role: { text: "R.", posting_quote: "q" }, why_company: { text: "C.", research_file: "x.md", url: "https://example.test/c" }, why_person: { text: "P.", profile_quote: "p" }, atlas_skills: skills, classes: [], sources: [{ title: "S", url: "https://example.test/s", read: "2026-10-26" }], ...extra });
function synth() {
  return {
    version: 2, published: "2026-11-03",
    student: { slug: "x", name_on_page: "Pat Example" },
    role_class: { id: "c", label: "Two roles", field: "marketing", roles: [{ id: "r2", label: "Role Two", first: false }, { id: "r1", label: "Role One", first: true }] },
    role: { id: "r1", label: "Role One" }, company: { name: "Acme", url: "https://example.test" },
    posting: { url: "https://example.test/p", title: "Role One", names: ["t1", "o2"] },
    tree: {
      nodes: [
        node("t1", "trunk", ["r1", "r2"], "must build", { grows: true, posting_names: true }),
        node("t2", "trunk", ["r1", "r2"], "shows", { line: "Ran the launch." }),
        node("s1", "shared", ["r1"], "must evidence better", { line: "Wrote a page." }),
        node("s2", "shared", ["r2"], "must build"),
        node("o1", "own", ["r1"], "must build"),
        node("o2", "own", ["r2"], "shows in other words", { line: "Built a deck.", through: "T2" }),
      ],
      behaviours: [node("h1", "trunk", ["r1", "r2"], "shows"), node("h2", "trunk", ["r1", "r2"], "must build")],
      more: [{ id: "m1", name: "M1", state: "must build" }, { id: "t1", name: "T1", state: "must build" }],
    },
    read: { band: "related", band_label: "Relevant foundation", brings: [
      { id: "t2", name: "T2", state: "shows", line: "Ran the launch." },
      { id: "x9", name: "X9", state: "shows", line: "Ran the launch." },
      { id: "o2", name: "O2", state: "shows in other words", line: "Built a deck." },
    ], marked_gaps: ["t1", "s1", "o1", "zz"] },
    worlds: [
      { n: 1, label: "Fundamentals", who: "A page.", clear: 2, missions: ["c-ship", "c-open"] },
      { n: 2, label: "Demos", who: "A day.", clear: 2, missions: ["c-decl"] },
      { n: 3, label: "One project", who: "Weeks.", clear: 1, missions: ["c-reply"] },
    ],
    cards: [
      card("c-ship", 1, ["o1", "t1"], { shipped: "2026-11-14" }),
      card("c-open", 1, ["t2", "s1", "o1"]),
      card("c-decl", 2, ["s2"], { declined: true }),
      card("c-reply", 3, ["o2", "s1"], { changed: "2026-11-11", reply: { text: "Redrawn.", date: "2026-11-11" } }),
    ],
  };
}
const index = {
  skillById: {
    t1: { id: "t1", name: "T1 from the taxonomy", what: "What t1 is.", fields: { marketing: { reads_as: "T1 in marketing." } } },
    s1: { id: "s1", name: "S1", what: "What s1 is.", fields: { "role:r1": { reads_as: "S1 for role one." }, marketing: { reads_as: "S1 in marketing." } } },
    o1: { id: "o1", name: "O1", what: "What o1 is." },
  },
  edges: [
    { source: "t1", target: "s1", jaccard: 0.30 },
    { source: "o1", target: "t1", jaccard: 0.50 },
    { source: "t1", target: "t2", jaccard: 0.10 },
    { source: "t1", target: "s2", jaccard: 0.10 },
    { source: "t1", target: "m1", jaccard: 0.90 },   // m1 is off the tree
    { source: "h1", target: "t1", jaccard: 0.80 },   // a behavior is not a tree node
  ],
};

test("dateWords: an ISO date in words", () => {
  assert.equal(M.dateWords("2026-11-14"), "November 14, 2026");
  assert.equal(M.dateWords("2026-01-03"), "January 3, 2026");
  assert.equal(M.dateWords(""), "");
  assert.equal(M.dateWords("soon"), "soon");
});

test("classTree: the trunk, shared and own nodes with their places and states; the first role's branch first", () => {
  const t = M.classTree(synth());
  assert.deepEqual(t.roles.map(r => r.id), ["r1", "r2"], "the first role leads, then the class's order");
  assert.equal(t.first, "r1");
  assert.deepEqual(t.trunk.map(n => n.id), ["t1", "t2"]);
  assert.deepEqual(t.shared.map(n => n.id), ["s1", "s2"]);
  assert.deepEqual(t.branches.map(b => [b.role.id, b.own.map(n => n.id)]), [["r1", ["o1"]], ["r2", ["o2"]]]);
  assert.equal(t.nodes.length, 6);
  assert.deepEqual(t.nodes.map(n => n.state), ["must build", "shows", "must evidence better", "must build", "must build", "shows in other words"]);
  assert.deepEqual(t.behaviours.map(n => n.id), ["h1", "h2"], "behaviors are the How you work line, not nodes");
  assert.deepEqual(t.more.map(m => m.id), ["m1"], "a more skill that is also a node stays off the more list");
  assert.ok(t.nodes.find(n => n.id === "t1").posting_names && t.nodes.find(n => n.id === "t1").grows);
});

test("shippedLook: a shipped quest's skills read 'shows, shipped <date>' in words; others have none", () => {
  const map = synth();
  const look = M.shippedLook({ id: "o1" }, map);
  assert.equal(look.state, "shows");
  assert.equal(look.words, "November 14, 2026");
  assert.equal(look.card, "c-ship");
  assert.equal(look.label, Copy.fill(MC.shippedState, { date: "November 14, 2026" }));
  assert.equal(M.shippedLook({ id: "s1" }, map), null, "s1's missions have not shipped");
  const t = M.classTree(map);
  assert.deepEqual(t.nodes.filter(n => n.shipped).map(n => n.id), ["t1", "o1"], "the tree carries the fifth look on the shipped quest's skills");
  // a self-marked shipped quest gives its skills the fifth look too, with its own date
  const own = { "c-open": { card: "c-open", choice: "shipped", link: "https://x.example", date: "2026-11-10" } };
  assert.equal(M.shippedLook({ id: "t2" }, map, own).words, "November 10, 2026");
  assert.deepEqual(M.classTree(map, own).nodes.filter(n => n.shipped).map(n => n.id), ["t1", "t2", "s1", "o1"]);
  assert.equal(M.shippedLook({ id: "t2" }, map, { "c-open": { choice: "start" } }), null, "a start is not a shipment");
  assert.ok(M.skillInfo(map, index, "t2", own).shipped);
  // two shipped missions: the earliest date
  map.cards[1].shipped = "2026-11-02";
  assert.equal(M.shippedLook({ id: "o1" }, map).words, "November 2, 2026");
});

test("treeLayout: trunk nodes on the trunk's x, own nodes beside their role's stem, shared beside the trunk", () => {
  const t = M.classTree(synth()), L = M.treeLayout(t, 816);
  assert.deepEqual(M.treeLayout(t, 816), L, "deterministic");
  assert.equal(L.width, 816);
  const at = id => L.nodes.find(n => n.id === id);
  for (const id of ["t1", "t2"]) {
    assert.equal(at(id).x, L.trunkX, `${id} sits on the trunk`);
    assert.equal(at(id).tick, null, "a trunk node needs no tick");
    assert.ok(at(id).y >= L.trunk.y && at(id).y <= L.trunk.y + L.trunk.height, `${id} inside the bar`);
  }
  assert.equal(L.trunk.x + L.trunk.width / 2, L.trunkX);
  for (const b of L.branches) {
    const own = L.nodes.filter(n => n.place === "own" && n.role === b.role);
    assert.ok(own.length, b.role);
    for (const n of own) {
      assert.ok(n.x > b.stem.x, "beside the stem, never on its stroke");
      assert.equal(n.x - b.stem.x, 24);
      assert.equal(n.tick.x1, b.stem.x, "the tick leaves the stem");
      assert.ok(n.tick.x2 < n.x - n.r, "the tick stops short of the disc");
      assert.ok(n.y >= b.stem.y2 && n.y <= b.stem.y1, "within the stem's height");
    }
  }
  assert.equal(L.branches[0].role, "r1"); assert.ok(L.branches[0].first);
  assert.ok(L.branches[0].stem.x < L.branches[1].stem.x, "the first role's branch on the left");
  assert.ok(at("s1").x < L.trunkX && at("s2").x > L.trunkX, "the first role's shared skills on its side (left)");
  for (const id of ["s1", "s2"]) assert.equal(Math.abs(at(id).tick.x1 - L.trunkX), L.trunk.width / 2, "a shared tick leaves the trunk's edge");
  const json = JSON.stringify(L);
  assert.ok(!/marker|arrow/i.test(json), "no marker or arrow in the layout");
  assert.ok(L.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
});

test("coAsked: the strongest co-asked skills among the tree's nodes, three at most", () => {
  const map = synth();
  assert.deepEqual(M.coAsked(map, index, "t1"), ["o1", "s1", "s2"], "m1 is off the tree and h1 a behavior; ties by id");
  assert.deepEqual(M.coAsked(map, index, "t1", 1), ["o1"]);
  assert.deepEqual(M.coAsked(map, { M: { edges: index.edges } }, "o1"), ["t1"], "the index's own M.edges read the same");
  assert.deepEqual(M.coAsked(map, index, "zz"), []);
  assert.deepEqual(M.coAsked(map, {}, "t1"), []);
});

test("worlds: each level's head and name, its quests with their states, and you are here; nothing gated, nothing clears", () => {
  const W = M.worlds(synth());
  const [w1, w2, w3] = W.worlds;
  assert.deepEqual(w1.missions.map(m => [m.id, m.state, m.i]), [["c-ship", "shipped", 1], ["c-open", "open", 2]]);
  assert.equal(w1.head, "Level 1"); assert.equal(w1.label, MC.levels[1], "the copy's level name, never the file's label");
  assert.equal(w2.missions[0].state, "skipped", "the owner's declined reads as skipped");
  assert.ok(w2.missions[0].locked, "a file mark has no own controls");
  assert.equal(w3.missions[0].state, "open", "changed and reply draw nothing of their own");
  assert.equal(W.here, "c-open", "you are here moves past the shipped quest");
  for (const k of ["clear", "n", "shipped", "cleared", "clearLine", "progress", "who"]) assert.ok(!(k in w1), `no ${k}: no level clears (2026-11-10)`);
  const both = synth(); both.cards[1].shipped = "2026-11-20";
  assert.equal(M.worlds(both).here, "c-reply", "past the shipped and the skipped; the changed quest is still open");
  const done = synth(); done.cards[1].shipped = "2026-11-20"; done.cards[3].shipped = "2026-11-21";
  assert.equal(M.worlds(done).here, null, "nothing open or started is left");
  const reach = synth(); reach.worlds.push({ n: "reach", label: "Reach", who: "No deadline.", clear: 0, optional: true, missions: ["c-r"] }); reach.cards.push(card("c-r", "reach", ["o1"]));
  const R = M.worlds(reach).worlds[3];
  assert.ok(R.optional); assert.equal(R.head, MC.reachHead); assert.equal(R.label, MC.levels.reach);
  const v1 = synth(); delete v1.worlds;
  assert.deepEqual(M.worlds(v1).worlds.map(w => w.missions.map(m => m.id)), [["c-ship", "c-open"], ["c-decl"], ["c-reply"]], "a file without worlds: one level per card level");
});

test("ownChoice and questState: the new shape, the old shapes, and the file first", () => {
  assert.deepEqual(M.ownChoice({ card: "x", choice: "shipped", link: "https://a.example/b", date: "2026-11-10" }), { choice: "shipped", link: "https://a.example/b", date: "2026-11-10" });
  assert.deepEqual(M.ownChoice({ card: "x", choice: "start", date: "2026-11-10" }), { choice: "start", link: null, date: "2026-11-10" });
  assert.equal(M.ownChoice({ card: "x", choice: "build", note: "Yes.", date: "2026-11-04" }).choice, "start", "the old build reads as start");
  assert.equal(M.ownChoice({ card: "x", choice: "not", note: "", date: "2026-11-04" }).choice, "skip", "the old not reads as skip");
  for (const o of [{ choice: "change", note: "Shorter." }, { choice: "open" }, { choice: "maybe" }, null, "x", {}]) assert.equal(M.ownChoice(o), null, JSON.stringify(o));
  assert.equal(M.ownChoice({ choice: "start", link: "https://x.example" }).link, null, "a link only on shipped");
  const c = card("q", 1, []);
  assert.equal(M.questState(c, null), "open");
  assert.equal(M.questState(c, { choice: "start" }), "started");
  assert.equal(M.questState(c, { choice: "shipped", link: "https://x.example" }), "shipped");
  assert.equal(M.questState(c, { choice: "skip" }), "skipped");
  assert.equal(M.questState(c, { choice: "change" }), "open");
  assert.equal(M.questState({ ...c, shipped: "2026-11-01" }, { choice: "skip" }), "shipped", "the file's shipped wins over a mark");
  assert.equal(M.questState({ ...c, declined: true }, { choice: "start" }), "skipped", "the file's declined wins over a mark");
  assert.deepEqual(M.QUEST_STATES, ["open", "started", "shipped", "skipped"]);
});

test("worlds: the person's own marks set the state at once; the old shapes read too", () => {
  const map = synth();
  const started = M.worlds(map, { "c-open": { card: "c-open", choice: "start", date: "2026-11-10" } });
  assert.equal(started.worlds[0].missions[1].state, "started");
  assert.equal(started.here, "c-open", "a started quest is still where you are");
  const shipped = M.worlds(map, { "c-open": { card: "c-open", choice: "shipped", link: "https://x.example/p", date: "2026-11-10" } });
  const m = shipped.worlds[0].missions[1];
  assert.equal(m.state, "shipped"); assert.equal(m.link, "https://x.example/p"); assert.equal(m.shippedOn, "2026-11-10"); assert.equal(m.locked, false);
  assert.equal(shipped.here, "c-reply");
  const skipped = M.worlds(map, { "c-open": { card: "c-open", choice: "skip", date: "2026-11-10" } });
  assert.equal(skipped.worlds[0].missions[1].state, "skipped");
  assert.equal(skipped.here, "c-reply", "you are here moves past a skipped quest");
  assert.equal(M.worlds(map, { "c-open": { choice: "not", note: "" } }).worlds[0].missions[1].state, "skipped", "an old not reads as skip");
  assert.equal(M.worlds(map, { "c-open": { choice: "build", note: "" } }).worlds[0].missions[1].state, "started", "an old build reads as start");
  assert.equal(M.worlds(map, { "c-open": { choice: "change", note: "x" } }).worlds[0].missions[1].state, "open", "an old change reads as nothing");
  assert.equal(M.worlds(map, { "c-ship": { choice: "skip" } }).worlds[0].missions[0].state, "shipped", "the file's shipped wins over a mark");
});

test("upNext and nowQuest: the quests still to do after this one, around to the start; the asked quest or you are here", () => {
  const map = synth(), W = M.worlds(map);
  assert.deepEqual(M.upNext(W, "c-open").map(m => m.id), ["c-reply"], "shipped and skipped quests drop out");
  assert.deepEqual(M.upNext(W, "c-reply").map(m => m.id), ["c-open"], "around to the start");
  assert.deepEqual(M.upNext(W, "c-open", 0), []);
  assert.equal(M.nowQuest(W, null).id, "c-open");
  assert.equal(M.nowQuest(W, "c-ship").id, "c-ship", "an asked quest, even a shipped one");
  assert.equal(M.nowQuest(W, "nope").id, "c-open");
  assert.equal(M.nowQuest(M.worlds({ cards: [], worlds: [] }), null), null, "no quest: the empty page");
});

test("shipLine: the first sentence, cut at a clause or a word to at most 16 words", () => {
  assert.equal(M.shipLine("A page."), "A page.");
  assert.equal(M.shipLine("A one-page read of Agentio in the atlas's terms: to whom (performance marketers at brands), against what alternative, and why."), "A one-page read of Agentio in the atlas's terms.");
  assert.equal(M.shipLine("A plain account of what the models do (match, price, review) and which claims are company-reported, with one sentence per claim."), "A plain account of what the models do.");
  assert.equal(M.shipLine("Six weekly issues, published on a public page with an email list, each turning one public fact into something a marketer can use."), "Six weekly issues, published on a public page with an email list.");
  assert.equal(M.shipLine("One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen."), "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen…");
  assert.equal(M.shipLine("One line, rewritten so it shows. Paste it on the card: the read runs here."), "One line, rewritten so it shows.", "the first sentence only");
  assert.equal(M.shipLine(""), "");
  assert.equal(M.firstSentence("The posting names it twice. Most postings ask for it."), "The posting names it twice.");
  assert.equal(M.firstSentence("No full stop"), "No full stop");
  const ex = JSON.parse(fs.readFileSync(path.join(root, "pipeline", "apprentice", "examples", "pmm-nyc", "map.json"), "utf8"));
  for (const c of ex.cards) { const l = M.shipLine(c.ship); assert.ok(l.split(" ").length <= M.SHIP_WORDS, `${c.id}: ${l}`); assert.ok(!/[(:;]$/.test(l.replace(/[.…]$/, "")), `${c.id} ends cleanly: ${l}`); }
});

test("questsOf: the cards that name a skill, in level order", () => {
  const map = synth();
  assert.deepEqual(M.questsOf(map, "o1").map(c => c.id), ["c-ship", "c-open"]);
  assert.deepEqual(M.questsOf(map, "s1").map(c => c.id), ["c-open", "c-reply"]);
  assert.deepEqual(M.questsOf(map, "zz"), []);
});

test("readLines: the band headline, what you bring grouped by its line, the gaps with the quest that builds each", () => {
  const R = M.readLines(synth(), index);
  assert.equal(M.readLines(synth(), index, { "c-open": { choice: "skip" } }).gaps.find(g => g.id === "s1").mission.id, "c-reply", "a skipped quest builds nothing");
  assert.equal(R.headline, "Relevant foundation for Role One.");
  assert.equal(R.band, "Relevant foundation");
  assert.deepEqual(R.groups.map(g => [g.line, g.skills.map(s => s.id)]), [["Ran the launch.", ["t2", "x9"]], ["Built a deck.", ["o2"]]]);
  assert.deepEqual(R.gaps.map(g => g.id), ["t1", "s1", "o1", "zz"]);
  const g = Object.fromEntries(R.gaps.map(x => [x.id, x]));
  assert.equal(g.t1.mission.id, "c-ship");
  assert.equal(g.s1.mission.id, "c-open", "each gap prefers a mission not named yet");
  assert.equal(g.o1.mission.id, "c-ship", "then the first that builds it");
  assert.equal(g.zz.mission, null);
  assert.equal(g.zz.none, MC.noQuest);
  assert.equal(g.t1.world, "Level 1");
  assert.equal(g.t1.sentence, "T1 in marketing.", "what it means in the first role's field");
  assert.equal(g.s1.sentence, "S1 for role one.", "the role's own reading first");
  assert.equal(g.o1.sentence, "What o1 is.", "else the definition");
  assert.equal(g.t1.name, "T1", "the map's name wins: a node draws even when the taxonomy renames it");
  const noBand = synth(); noBand.read.band_label = "";
  assert.equal(M.readLines(noBand, index).band, Copy.common.bands.related || "", "the band from the atlas's words when the file has only the id");
  // a declined quest builds nothing
  const decl = synth(); decl.read.marked_gaps = ["s2"];
  assert.equal(M.readLines(decl, index).gaps[0].mission, null);
});

test("skillInfo: a skill from the tree, the more list, what you bring or the index; the shipped look on any", () => {
  const map = synth();
  const o2 = M.skillInfo(map, index, "o2");
  assert.equal(o2.name, "O2"); assert.equal(o2.place, "own"); assert.ok(o2.onTree); assert.equal(o2.through, "T2"); assert.equal(o2.line, "Built a deck.");
  const m1 = M.skillInfo(map, index, "m1");
  assert.ok(m1.more); assert.ok(!m1.onTree); assert.equal(m1.state, "must build");
  const h1 = M.skillInfo(map, index, "h1");
  assert.ok(h1.behaviour); assert.ok(!h1.onTree);
  const x9 = M.skillInfo(map, index, "x9");
  assert.equal(x9.state, "shows"); assert.equal(x9.line, "Ran the launch.");
  assert.ok(M.skillInfo(map, index, "o1").shipped, "a shipped mission's skill carries the fifth look");
  assert.ok(M.skillInfo(map, index, "o2").posting_names, "the posting names it");
  assert.equal(M.skillInfo(map, index, "nope").name, "nope");
});

// ---------- the tracked example ----------
const EXAMPLE = path.join(root, "pipeline", "apprentice", "examples", "pmm-nyc", "map.json");
test("the example map: version 2, 19 nodes, three on the trunk, every quest a card", () => {
  const map = JSON.parse(fs.readFileSync(EXAMPLE, "utf8"));
  assert.equal(map.version, 2);
  const t = M.classTree(map);
  assert.equal(t.nodes.length, 19);
  assert.equal(t.trunk.length, 3);
  assert.equal(t.first, "pmm");
  assert.equal(t.branches[0].role.id, "pmm");
  assert.equal(t.behaviours.length, 6);
  const ids = new Set(map.cards.map(c => c.id));
  const W = M.worlds(map);
  for (const w of W.worlds) for (const m of w.missions) assert.ok(ids.has(m.id), `${m.id} is a card`);
  for (const w of map.worlds) for (const id of w.missions) assert.ok(ids.has(id), `${id} is a card`);
  assert.equal(W.worlds[0].missions.length, 8, "two story cards and six build cards");
  assert.deepEqual(W.worlds.map(w => `${w.head} · ${w.label}`), ["Level 1 · Fundamentals", "Level 2 · Demos", "Level 3 · One real project", "Reach · Optional"]);
  assert.deepEqual(W.worlds[0].missions.slice(0, 2).map(m => m.kind), ["story", "story"], "Level 1 opens with the story cards");
  assert.ok(M.storyOf(W.worlds[0].missions[0].card).prompt.includes("[ ]"));
  assert.ok(W.here);
  const L = M.treeLayout(t, 816);
  assert.equal(L.nodes.length, 19);
  assert.equal(L.height, 628, "the approved mock's size");
  assert.ok(!/marker|arrow/i.test(JSON.stringify(L)));
  const R = M.readLines(map, {});
  assert.ok(R.gaps.length > 0 && R.gaps.length <= 8);
  assert.ok(R.headline.includes(map.read.band_label));
});

// ---------- the story cards ----------
test("storyOf reads a story card's parts and null for a build card; lineState maps the matcher's status; a quest carries its kind", () => {
  const map = synth();
  const story = { id: "s1-s1", kind: "story", level: 1, track: "gtm", title: "S1, said so it shows", ship: "One line.", hours: 1, window: "an hour", skill: "s1", state: "must evidence better", line: "Wrote a page.", what: "W.", reads_as: "R.", shown_by: { artefacts: ["plan"], verbs: [], measures: ["users"], counterparts: ["sales"] }, prompt: "P [ ]", why_role: { text: "R." }, why_person: { text: "P.", profile_quote: "Wrote a page." }, atlas_skills: ["s1"], classes: [], sources: [] };
  map.cards.unshift(story); map.worlds[0].missions.unshift("s1-s1");
  const s = M.storyOf(story);
  assert.deepEqual(s.slots.map(x => [x.key, x.items]), [["artefacts", ["plan"]], ["counterparts", ["sales"]], ["measures", ["users"]]], "an empty slot is left out, the order fixed");
  assert.equal(s.skill, "s1"); assert.equal(s.state, "must evidence better"); assert.equal(s.reads_as, "R."); assert.equal(s.prompt, "P [ ]");
  assert.equal(M.storyOf(map.cards[1]), null, "a build card has no story");
  assert.equal(M.storyOf({ kind: "story", atlas_skills: ["o1"], state: "nope" }).skill, "o1", "the skill from atlas_skills when the card names none");
  assert.deepEqual(["evidenced", "through", "transferable", "thin", "presumed", "gap", "zz"].map(M.lineState), ["shows", "shows", "shows in other words", "must evidence better", "must evidence better", "must build", "must build"]);
  const W = M.worlds(map);
  assert.deepEqual(W.worlds[0].missions.map(m => [m.id, m.kind]), [["s1-s1", "story"], ["c-ship", "build"], ["c-open", "build"]]);
  assert.ok(!("release" in W.worlds[0]), "no release label");
  assert.ok(!("who" in W.worlds[0]), "no duration line on the screen's model");
  assert.equal(W.here, "s1-s1", "you are here: the first open mission, the story card");
});

// the owner's words of 2026-11-10: no "mission", no "Wally", no "World", no clearing and no time estimate on the map
test("the map's copy: no mission, no Wally, no World, no clear, no duration word", () => {
  const walk = (v, p, out) => { if (typeof v === "string") out.push([p, v]); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`, out); return out; };
  // the one exception (owner, 2026-11-27): the open flow's "Having trouble?" line names the owner and the session's
  // length, in the owner's words; it is a call with a person, not a project, so no project states a length of time
  const OWNER_LINE = { "map.open.projects.session": "Having trouble or want to dive deeper? Book a {free} or {paid} with Wally.", "map.open.projects.sessionOne": "Having trouble or want to dive deeper? Book a {free} with Wally." };
  for (const [p, t] of walk(MC, "map", [])) {
    if (OWNER_LINE[p]) { assert.equal(t, OWNER_LINE[p], `${p} is the owner's line as given`); continue; }
    assert.doesNotMatch(t, /\bmissions?\b|\bWally\b|\bWorld\b/i, `${p}: ${t}`);
    if (!p.startsWith("map.tree.")) assert.doesNotMatch(t, /\bclear(s|ed)?\b|\b(hour|hours|evening|morning|week|weeks|day|days)\b/i, `${p}: ${t}`);
  }
});
