// web/map.js, the apprentice map's pure parts (the build plan's B3): the class tree, the T4 layout, "asked together
// with", the worlds with their k of n, the Q1 layout, the quests of a skill, the D1 read, the shipped look and the date
// in words, on a small synthetic map built here; then, when GradBuddy's example map is on this machine (CI has no
// GradBuddy folder), that it parses as version 2 with 19 nodes and three on the trunk and every mission is a card.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web } from "./_load.mjs";

const M = require(path.join(web, "map.js"));
const Copy = require(path.join(web, "copy.js"));
const MC = Copy.map;

// ---------- the synthetic map: a class of two roles, six nodes, two behaviors, four cards over three worlds ----------
const node = (id, place, roles, state, extra = {}) => ({ id, name: id.toUpperCase(), area: "gtm", area_label: "Go-to-market", place, roles, state, grows: false, posting_names: false, ...extra });
const card = (id, level, skills, extra = {}) => ({ id, level, track: "gtm", title: `Mission ${id}`, ship: "A page.", hours: 3, window: "an evening", why_role: { text: "R.", posting_quote: "q" }, why_company: { text: "C.", research_file: "x.md", url: "https://example.test/c" }, why_person: { text: "P.", profile_quote: "p" }, atlas_skills: skills, classes: [], sources: [{ title: "S", url: "https://example.test/s", read: "2026-10-26" }], ...extra });
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
      { n: 1, label: "Fundamentals", release: "I do", who: "A page.", clear: 2, missions: ["c-ship", "c-open"] },
      { n: 2, label: "Demos", release: "we do", who: "A day.", clear: 2, missions: ["c-decl"] },
      { n: 3, label: "One project", release: "you do", who: "Weeks.", clear: 1, missions: ["c-reply"] },
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

test("shippedLook: a shipped mission's skills read 'shows, shipped <date>' in words; others have none", () => {
  const map = synth();
  const look = M.shippedLook({ id: "o1" }, map);
  assert.equal(look.state, "shows");
  assert.equal(look.words, "November 14, 2026");
  assert.equal(look.card, "c-ship");
  assert.equal(look.label, Copy.fill(MC.shippedState, { date: "November 14, 2026" }));
  assert.equal(M.shippedLook({ id: "s1" }, map), null, "s1's missions have not shipped");
  const t = M.classTree(map);
  assert.deepEqual(t.nodes.filter(n => n.shipped).map(n => n.id), ["t1", "o1"], "the tree carries the fifth look on the shipped mission's skills");
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

test("worlds: k of n, a declined mission leaves n, the progress line in words, and you are here", () => {
  const W = M.worlds(synth());
  const [w1, w2, w3] = W.worlds;
  assert.deepEqual(w1.missions.map(m => [m.id, m.state, m.i]), [["c-ship", "shipped", 1], ["c-open", "open", 2]]);
  assert.equal(w1.n, 2); assert.equal(w1.clear, 2); assert.equal(w1.shipped, 1); assert.equal(w1.cleared, false);
  assert.equal(w1.progress, "One shipped. One more clears this world.");
  assert.equal(w1.clearLine, Copy.fill(MC.clearAll, { n: 2 }));
  assert.equal(w2.missions[0].state, "declined");
  assert.equal(w2.n, 0, "the declined mission leaves n");
  assert.equal(w2.clear, 0, "k is at most n");
  assert.equal(w2.clearLine, MC.clearNone);
  assert.equal(w2.progress, "Nothing shipped yet.");
  assert.equal(w3.missions[0].state, "changed");
  assert.equal(w3.clearLine, MC.clearOne);
  assert.equal(W.here, "c-open", "you are here moves past the shipped mission");
  // the same world without the decline: n counts it
  const undeclined = synth(); delete undeclined.cards[2].declined;
  assert.equal(M.worlds(undeclined).worlds[1].n, 1);
  // a second shipment clears World 1, and "you are here" moves on past the declined and changed missions
  const both = synth(); both.cards[1].shipped = "2026-11-20";
  const B = M.worlds(both);
  assert.equal(B.worlds[0].cleared, true);
  assert.equal(B.worlds[0].progress, "Cleared.");
  assert.equal(B.worlds[0].clearLine, MC.clearedLine);
  assert.equal(B.here, null, "nothing open or chosen is left");
  // the k of n line with k below n, and "two more"
  const six = synth(); six.worlds[0].missions = ["c-ship", "c-open", "a", "b", "c", "d"]; six.cards.push(...["a", "b", "c", "d"].map(id => card(id, 1, [])));
  six.cards[0].shipped = null;
  const S = M.worlds(six).worlds[0];
  assert.equal(S.clearLine, "Ship 2 of these 6 to clear this world.");
  assert.equal(S.progress, "Nothing shipped yet.");
  six.worlds[0].clear = 3; six.cards[0].shipped = "2026-11-14";
  assert.equal(M.worlds(six).worlds[0].progress, "One shipped. Two more clear this world.");
  for (const w of [...W.worlds, ...B.worlds, S]) assert.ok(!/\d/.test(w.progress), `the progress line is in words: ${w.progress}`);
});

test("worlds: the person's own answer marks a mission; the counts follow the file", () => {
  const map = synth();
  const chosen = M.worlds(map, { "c-open": { card: "c-open", choice: "build", note: "", date: "2026-11-04" } });
  assert.equal(chosen.worlds[0].missions[1].state, "chosen");
  assert.equal(chosen.worlds[0].missions[1].sent.choice, "build");
  assert.equal(chosen.here, "c-open", "a chosen mission is still where you are");
  const not = M.worlds(map, { "c-open": { card: "c-open", choice: "not", note: "", date: "2026-11-04" } });
  assert.equal(not.worlds[0].missions[1].state, "declined");
  assert.equal(not.worlds[0].n, 2, "n changes only when Wally republishes");
  assert.equal(not.here, null);
  const ship = M.worlds(map, { "c-ship": { card: "c-ship", choice: "not" } });
  assert.equal(ship.worlds[0].missions[0].state, "shipped", "the file's shipped wins over an answer");
  assert.deepEqual(M.MISSION_STATES, ["open", "chosen", "shipped", "declined", "changed"]);
});

test("questLayout: the worlds left to right, one stop per mission, a flag per world but the Reach, no arrow", () => {
  const map = synth();
  map.worlds.push({ n: "reach", label: "Reach", release: "you do", who: "No deadline.", clear: 0, optional: true, missions: ["c-r"] });
  map.cards.push(card("c-r", "reach", ["o1"]));
  const W = M.worlds(map), L = M.questLayout(W);
  assert.deepEqual(M.questLayout(W), L, "deterministic");
  assert.equal(L.stops.length, 5);
  assert.equal(L.flags.length, 3, "the Reach has no flag");
  assert.ok(W.worlds[3].optional);
  assert.equal(W.worlds[3].clearLine, MC.clearReach);
  for (let i = 1; i < L.columns.length; i++) assert.ok(L.columns[i].x > L.columns[i - 1].x + L.columns[i - 1].width, "columns in order, apart");
  for (const s of L.stops) { const c = L.columns[s.world]; assert.ok(s.x > c.x && s.x < c.x + c.width, `${s.id} inside its world`); }
  assert.ok(L.road.startsWith("M") && L.reach.startsWith("M"));
  assert.ok(!/marker|arrow/i.test(JSON.stringify(L)));
});

test("questsOf: the cards that name a skill, in world order", () => {
  const map = synth();
  assert.deepEqual(M.questsOf(map, "o1").map(c => c.id), ["c-ship", "c-open"]);
  assert.deepEqual(M.questsOf(map, "s1").map(c => c.id), ["c-open", "c-reply"]);
  assert.deepEqual(M.questsOf(map, "zz"), []);
});

test("readLines: the band headline, what you bring grouped by its line, the gaps with the mission that builds each", () => {
  const R = M.readLines(synth(), index);
  assert.equal(R.headline, "Relevant foundation for Role One.");
  assert.equal(R.band, "Relevant foundation");
  assert.deepEqual(R.groups.map(g => [g.line, g.skills.map(s => s.id)]), [["Ran the launch.", ["t2", "x9"]], ["Built a deck.", ["o2"]]]);
  assert.deepEqual(R.gaps.map(g => g.id), ["t1", "s1", "o1", "zz"]);
  const g = Object.fromEntries(R.gaps.map(x => [x.id, x]));
  assert.equal(g.t1.mission.id, "c-ship");
  assert.equal(g.s1.mission.id, "c-open", "each gap prefers a mission not named yet");
  assert.equal(g.o1.mission.id, "c-ship", "then the first that builds it");
  assert.equal(g.zz.mission, null);
  assert.equal(g.zz.none, MC.noMission);
  assert.equal(g.t1.world, "World 1");
  assert.equal(g.t1.sentence, "T1 in marketing.", "what it means in the first role's field");
  assert.equal(g.s1.sentence, "S1 for role one.", "the role's own reading first");
  assert.equal(g.o1.sentence, "What o1 is.", "else the definition");
  assert.equal(g.t1.name, "T1", "the map's name wins: a node draws even when the taxonomy renames it");
  const noBand = synth(); noBand.read.band_label = "";
  assert.equal(M.readLines(noBand, index).band, Copy.common.bands.related || "", "the band from the atlas's words when the file has only the id");
  // a declined mission builds nothing
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

// ---------- the real example, when GradBuddy is on this machine ----------
const EXAMPLE = path.join(process.env.HOME || "", "GradBuddy Project", "gradbuddy", "apprentice", "examples", "pmm-nyc", "map.json");
test("the example map: version 2, 19 nodes, three on the trunk, every mission a card", { skip: !fs.existsSync(EXAMPLE) && "the GradBuddy example is not on this machine" }, () => {
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
  assert.equal(W.worlds[0].clearLine, "Ship 2 of these 6 to clear this world.");
  assert.ok(W.here);
  const L = M.treeLayout(t, 816);
  assert.equal(L.nodes.length, 19);
  assert.equal(L.height, 628, "the approved mock's size");
  assert.ok(!/marker|arrow/i.test(JSON.stringify(L)));
  const R = M.readLines(map, {});
  assert.ok(R.gaps.length > 0 && R.gaps.length <= 8);
  assert.ok(R.headline.includes(map.read.band_label));
});
