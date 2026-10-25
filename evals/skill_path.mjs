// Skill path (web/games/skill-path.js, games/skill-path/README.md): the card game's logic on today's data.
//
//   node evals/skill_path.mjs
//
// Loads web/atlas.js and the game's `logic` in node the way rough_fit.mjs loads atlas.js, and the skill map's own
// board (SkillMap.board() in web/skillmap.js: positions and field shares) with a stub window, so the numbers are the
// ones the browser computes. Checks the board, the README's example round (v12 rules: the budget is the shortest
// route plus two, a hop is good when the target asks for it, the round ends on an arrival skill), the random pool,
// and that no pairing ever leaves a player with no choice and no step back.
//
// The expected numbers are today's data. When a data refresh changes them, this prints the new values and fails:
// update the README (games/skill-path/README.md) and EXPECT below together, on a data/ branch (CLAUDE.md).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const here = path.dirname(fileURLToPath(import.meta.url)), web = path.join(here, "..", "web");
const require = createRequire(import.meta.url);
const Matcher = require(path.join(web, "match.js"));
const Atlas = require(path.join(web, "atlas.js"))({ load: f => JSON.parse(fs.readFileSync(path.join(web, f))), Matcher });
globalThis.window = globalThis.window || { addEventListener() { } };   // skillmap.js registers a resize listener at load
globalThis.Atlas = Atlas;
require(path.join(web, "skillmap.js"));
const { logic: L } = require(path.join(web, "games", "skill-path.js"));

const EXPECT = {
  board: { skills: 239, links: 927, pieces: 1, minLinks: 2 },
  pmArrivals: ["Roadmapping", "Product strategy", "Systems & architecture"],
  marketing: {
    start: "Marketing campaigns", par: 3, budget: 5, shortGood: 2,
    route: ["Marketing campaigns", "Consumer products & B2C", "Product discovery & validation", "Roadmapping"],
    played: [
      ["Advertising & media", ["Advertising & media", "Marketing measurement & attribution", "Creative development & agency management", "Consumer products & B2C"]],
      ["Consumer products & B2C", ["Marketing measurement & attribution", "Digital & performance marketing", "Creative development & agency management", "Consumer products & B2C"]],
      ["Product discovery & validation", ["Content & social media marketing", "E-commerce, retail & marketplaces", "Product discovery & validation", "Growth, funnels & retention"]],
      ["Roadmapping", ["Roadmapping ★", "Product strategy ★", "Prioritization & trade-offs", "Customer obsession / user empathy"]],
    ],
    result: { arrived: true, used: 4, hops: 4, good: 2 },
  },
  supply: {
    start: "Vendor, budget & contract management", par: 4, short: 2, good: 3,
    biggest: ["Risk & dependency management", "Program & project management", "Financial modeling & analysis", "Payments, fintech & banking", "Regulated industries & compliance", "Security & privacy"],
  },
  pool: { field: 465, role: 2208 },
  roles: 54,
};

const ix = await Atlas.index();
const SM = await window.SkillMap.board();
const P = await Atlas.product();
const generic = await Atlas.genericSkills();
const B = L.buildBoard(ix.M, generic);
const ctx = { ix, P, B, FS: SM.FS, fields: Object.keys(SM.FS).filter(g => g in SM.field), fieldIds: ix.M.groups.map(g => g.id) };
const N = id => (B.skill[id] || {}).name || id;
const ID = name => B.ids.find(id => N(id) === name);

let fails = 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(label, actual, expected) {
  const ok = same(actual, expected);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n     expected ${JSON.stringify(expected)}\n     now      ${JSON.stringify(actual)}`}`);
}

// ---------- the board ----------
check("board: skills, links, pieces, fewest links", { skills: B.ids.length, links: B.links, pieces: L.pieces(B), minLinks: Math.min(...B.ids.map(id => B.adj[id].length)) }, EXPECT.board);

// ---------- Marketing -> Product Manager (the README's round) ----------
const mk = L.setup(ctx, "field", "marketing", "product.pm");
check("pm arrival skills", mk.arrivals.map(N), EXPECT.pmArrivals);
check("Marketing start skill", N(mk.start), EXPECT.marketing.start);
check("Marketing -> pm par, budget, good hops on the shortest route", [mk.par, L.budgetFor(mk.par), mk.shortGood], [EXPECT.marketing.par, EXPECT.marketing.budget, EXPECT.marketing.shortGood]);
check("Marketing -> pm shortest route", mk.short.map(N), EXPECT.marketing.route);
{
  const R = L.newRound(mk), seen = [];
  for (const [pick] of EXPECT.marketing.played) {
    const op = L.options(R, B); seen.push([pick, op.list.map(c => N(c.id) + (c.end ? " ★" : ""))]);
    if (!L.hop(R, B, ID(pick))) break;
  }
  check("Marketing -> pm: the choices at each hop of the played route, ★ on the ones that end it", seen, EXPECT.marketing.played);
  const res = L.result(R);
  check("Marketing -> pm: arrived, hops used, good hops", { arrived: res.arrived, used: res.used, hops: res.hops, good: res.good }, EXPECT.marketing.result);
  check("Marketing -> pm: build next with nothing ticked is the route's skill the target asks for most", N(L.buildNext(R, B).id), "Roadmapping");
  L.tick(R, ID("Roadmapping"), true);
  check("Marketing -> pm: build next once Roadmapping is ticked", L.buildNext(R, B), { id: ID("Product discovery & validation"), why: "not-yet" });
  L.tick(R, ID("Product discovery & validation"), true);
  check("Marketing -> pm: with both read skills ticked (the rest are domain or not read), build next is the arrival reached", L.buildNext(R, B), { id: ID("Roadmapping"), why: "reached" });
}

// ---------- Supply chain & procurement -> Product Manager: the biggest blue number, out of hops ----------
const biggest = (R, su) => { const op = L.options(R, B); const arr = op.list.find(c => su.arrivals.includes(c.id)); return arr || op.list.slice().sort((a, b) => (su.share(b.id) || 0) - (su.share(a.id) || 0))[0]; };
const sc = L.setup(ctx, "field", "supply_chain", "product.pm");
check("Supply chain start skill, par", [N(sc.start), sc.par], [EXPECT.supply.start, EXPECT.supply.par]);
{
  const R = L.newRound(sc);
  while (R.phase === "choose") { const c = biggest(R, sc); if (!c) break; L.hop(R, B, c.id); }
  const res = L.result(R);
  check("Supply chain -> pm: biggest blue number route, out of hops, hops short, good hops", { route: R.path.slice(1).map(N), arrived: res.arrived, short: res.short, good: res.good }, { route: EXPECT.supply.biggest, arrived: false, short: EXPECT.supply.short, good: EXPECT.supply.good });
}

// ---------- the random pool ----------
const pairs = L.allPairings(ctx), pool = L.pool(pairs);
check(`random pool (a shortest route of ${L.POOL.min} to ${L.POOL.max} hops, no small role) from a field / from a role`, { field: pool.field.length, role: pool.role.length }, EXPECT.pool);
check("every pairing in the pool has a par in range and no small role", pool.field.concat(pool.role).filter(p => p.small || p.par < L.POOL.min || p.par > L.POOL.max).length, 0);

// ---------- every pickable role has three arrival skills ----------
const roles = L.pickable(ix);
check("pickable roles, roles without three arrival skills", [roles.length, roles.filter(r => L.arrivalSkills(B, ix.baseline, L.shareFn(ix, P, r)).length !== 3)], [EXPECT.roles, []]);

// ---------- no pairing leaves a player with no choice and no step back ----------
// Every playable pairing (par 1 or more), by four simulated players that take an arrival skill when one is shown:
// random hops (seeded), the biggest blue number, the hop nearest the target's arrival skills on the map, and a
// perfect player. At every turn there must be a choice or a step back; the perfect player always arrives.
{
  const at = id => SM.byId[id], dist2 = (id, f) => (at(id).x - f[0]) ** 2 + (at(id).y - f[1]) ** 2;
  const players = {
    random: (R, su, rnd) => { const op = L.options(R, B); const arr = op.list.find(c => su.arrivals.includes(c.id)); return arr || op.list[Math.floor(rnd() * op.list.length)]; },
    biggest,
    map: (R, su) => { const op = L.options(R, B), near = id => Math.min(...su.arrivals.map(t => dist2(id, [at(t).x, at(t).y]))); const arr = op.list.find(c => su.arrivals.includes(c.id)); return arr || op.list.slice().sort((a, b) => near(a.id) - near(b.id))[0]; },
    perfect: (R, su) => { const op = L.options(R, B); return op.list.slice().sort((a, b) => su.dist[a.id] - su.dist[b.id])[0]; },
  };
  let rounds = 0, stuck = [], backs = { random: 0, biggest: 0, map: 0, perfect: 0 }, arrivedAt = {}, goodAt = {}, hopsAt = {}, perfectMiss = 0;
  const all = [...pairs.field, ...pairs.role].filter(p => p.par != null && p.par >= 1);
  for (const p of all) {
    const su = L.setup(ctx, p.from, p.start, p.target);
    if (L.refusal(ix, p.from, p.start, p.target, su)) { stuck.push(`${p.from}:${p.start}>${p.target} refused`); continue; }
    for (const [who, play] of Object.entries(players)) {
      const R = L.newRound(su), rnd = L.rng(rounds + 1); rounds++;
      let backed = false;
      while (R.phase === "choose") {
        const op = L.options(R, B);
        if (!op.list.length && !op.back) { stuck.push(`${p.from}:${p.start}>${p.target} ${who} at ${R.cur}`); break; }
        if (!op.list.length) { L.stepBack(R, B); backed = true; continue; }
        L.hop(R, B, play(R, su, rnd).id);
      }
      if (backed) backs[who]++;
      const res = L.result(R);
      arrivedAt[who] = (arrivedAt[who] || 0) + (res.arrived ? 1 : 0); goodAt[who] = (goodAt[who] || 0) + res.good; hopsAt[who] = (hopsAt[who] || 0) + res.hops;
      if (who === "perfect" && !res.arrived) perfectMiss++;
    }
  }
  check(`no player is left with no choice and no step back (${rounds} simulated rounds)`, stuck.slice(0, 5), []);
  check("a perfect player always arrives", perfectMiss, 0);
  const n = all.length;
  console.log(`     ${n} pairings with par 1 or more; at par + 2 the share that arrive: ${Object.entries(arrivedAt).map(([k, v]) => `${k} ${Math.round(100 * v / n)}%`).join(", ")}; good hops per hop: ${Object.entries(goodAt).map(([k, v]) => `${k} ${(v / hopsAt[k]).toFixed(2)}`).join(", ")}; rounds with a step back: ${Object.entries(backs).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}

if (fails) {
  console.log(`\n${fails} check(s) failed. If the data changed (a refresh of web/data/graph_mba.json or graph.json), update games/skill-path/README.md and EXPECT in this file together, on a data/ branch.`);
  process.exit(1);
}
console.log("\nall checks pass");
