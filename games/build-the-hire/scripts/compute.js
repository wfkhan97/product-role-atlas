// Build the hire: the reference model and every number in README.md and the mocks.
// Read-only. Loads the atlas through web/atlas.js (node mode) exactly as the browser will.
//   node games/build-the-hire/scripts/compute.js            the example draft (Product Manager, deal 130) and the rules
//   node games/build-the-hire/scripts/compute.js --all      plus every role: ceiling, must-haves alone, strategy simulation (about 3 minutes)
//   node games/build-the-hire/scripts/compute.js --role fpa --deal 7   any role and deal, played by the "ratio" strategy
"use strict";
const fs = require("fs"), path = require("path");
const WEB = path.join(__dirname, "../../../web/");
const Atlas = require(WEB + "atlas.js")({ load: u => JSON.parse(fs.readFileSync(WEB + u)), Matcher: {} });

const CFG = {
  budget: 10, slots: 6, hands: 8, handSize: 3,
  distinct: { floor: 0.2, full: 2 },              // = bands_mba.json scoring.distinct, the matcher's own setting
  priceCuts: [1.5, 2.5, 4],                        // lift cut points for 2, 3 and 4 points
  askedShare: 0.2,                                 // below this share a card is priced by the role that prizes it most
  peakMinShare: 0.25,                              // a role sets a price only where at least this share asks
  strong: { share: 0.25, lift: 1.5 },
  mustHave: { share: 0.4, lift: 1.5 },
  trap: { here: 0.2, there: 0.5, lift: 2 },
  topK: 5, matchCut: 0.5,
  ranks: [[0.95, "Head of talent"], [0.8, "Talent partner"], [0.5, "Hiring manager"], [0.25, "Recruiting coordinator"], [0, "Resume skimmer"]],
};
const factor = l => Math.max(CFG.distinct.floor, Math.min(1, CFG.distinct.floor + (1 - CFG.distinct.floor) * (l - 1) / (CFG.distinct.full - 1)));
const tier = l => 1 + CFG.priceCuts.filter(c => l >= c).length;
// xorshift32: the deal number is the seed, so a deal can be replayed and shared
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

async function load() {
  const ix = await Atlas.index(), P = await Atlas.product();
  const roles = Object.values(ix.roles);
  const skillsOf = r => r.set === "product" ? P.G.skills : ix.M.skills;
  const byId = r => r.set === "product" ? P.skillById : ix.skillById;
  const shareOf = (r, id) => { const s = byId(r)[id]; return s ? ((s.by_family || {})[r.id] || 0) : 0; };
  const playable = s => s.cluster !== "credentials" && s.cluster !== "domain" && !s.id.startsWith("yoe_");
  const peak = {};
  for (const r of roles) {
    if (r.small) continue;
    for (const s of skillsOf(r)) {
      if (!playable(s)) continue;
      const sh = shareOf(r, s.id), b = ix.baseline[s.id];
      if (!b || sh < CFG.peakMinShare) continue;
      const l = sh / b; if (!peak[s.id] || l > peak[s.id].lift) peak[s.id] = { role: r.id, share: sh, lift: l };
    }
  }
  return { ix, P, roles, skillsOf, shareOf, playable, peak };
}
function deck(D, r) {
  const cards = D.skillsOf(r).filter(D.playable).map(s => {
    const share = D.shareOf(r, s.id), base = D.ix.baseline[s.id] || 0, lift = base ? share / base : 0, pk = D.peak[s.id];
    const price = share >= CFG.askedShare ? tier(lift) : tier(pk ? pk.lift : 1);
    return { id: s.id, name: s.name, cluster: s.cluster, share, base, lift, worth: share * factor(lift), price, peak: pk };
  });
  const otherField = c => c.peak && c.peak.role !== r.id && (D.ix.roles[c.peak.role] || {}).group !== r.group;
  return {
    cards, byId: Object.fromEntries(cards.map(c => [c.id, c])),
    strong: cards.filter(c => c.share >= CFG.strong.share && c.lift >= CFG.strong.lift),
    mustHave: cards.filter(c => c.share >= CFG.mustHave.share && c.lift < CFG.mustHave.lift),
    trap: cards.filter(c => c.share < CFG.trap.here && c.peak && c.peak.share >= CFG.trap.there && c.peak.lift >= CFG.trap.lift && otherField(c)),
  };
}
const pickWeighted = (arr, rand, wf) => { const tot = arr.reduce((a, c) => a + wf(c), 0); let x = rand() * tot; for (const c of arr) { x -= wf(c); if (x <= 0) return c; } return arr[arr.length - 1]; };
function deal(K, seen, budget, rand) {
  const hand = [], fresh = a => a.filter(c => !seen.has(c.id) && !hand.some(h => h.id === c.id));
  const take = (arr, wf, kind) => { const a = fresh(arr); if (a.length) hand.push({ ...pickWeighted(a, rand, wf), kind }); };
  take(K.strong, c => c.worth, "strong"); take(K.mustHave, c => c.share, "must-have"); take(K.trap, c => c.peak.share, "trap");
  while (hand.length < CFG.handSize) { const a = fresh(K.cards).filter(c => c.share >= 0.1); if (!a.length) break; hand.push({ ...pickWeighted(a, rand, c => c.share), kind: "filler" }); }
  if (hand.length && hand.every(c => c.price > budget)) {   // always something to buy
    const a = fresh(K.cards).filter(c => c.price <= budget && c.share >= 0.25);
    if (a.length) { const i = hand.findIndex(c => c.kind === "must-have"); hand[i < 0 ? hand.length - 1 : i] = { ...pickWeighted(a, rand, c => c.share), kind: "must-have" }; }
  }
  for (let i = hand.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [hand[i], hand[j]] = [hand[j], hand[i]]; }
  return hand;
}
function play(K, strategy, seed) {
  const rand = rng(seed), seen = new Set(), hire = [], log = []; let budget = CFG.budget;
  for (let h = 0; h < CFG.hands && hire.length < CFG.slots && budget > 0; h++) {
    const hand = deal(K, seen, budget, rand); hand.forEach(c => seen.add(c.id));
    const can = hand.filter(c => c.price <= budget), c = can.length ? strategy(can, { budget, hire, slotsLeft: CFG.slots - hire.length }) : null;
    log.push({ hand, pick: c && c.id, budget });
    if (c) { hire.push(c); budget -= c.price; }
  }
  return { hire, budget, log };
}
// the match: per posting, need = weight of its five heaviest asks; got = weight of the hire's skills it names
function scorer(K, jobs) {
  const need = new Float64Array(jobs.length), w = new Float64Array(jobs.length), inv = {}; let W = 0;
  jobs.forEach((j, i) => { const ids = j.skills.filter(id => K.byId[id]); need[i] = ids.map(id => K.byId[id].worth).sort((a, b) => b - a).slice(0, CFG.topK).reduce((a, b) => a + b, 0); w[i] = j.w; W += j.w; for (const id of ids) (inv[id] ||= []).push(i); });
  const got = new Float64Array(jobs.length);
  const run = ids => { got.fill(0); const t = new Set(); for (const id of ids) { const c = K.byId[id]; if (!c || !inv[id]) continue; for (const i of inv[id]) { got[i] += c.worth; t.add(i); } } let s = 0, n = 0; for (const i of t) if (need[i] > 0 && got[i] >= CFG.matchCut * need[i] - 1e-12) { s += w[i]; n++; } return { share: W ? s / W : 0, n }; };
  return { score: ids => run(ids).share, count: ids => run(ids).n, need, inv };
}
const cost = h => h.reduce((a, c) => a + c.price, 0);
function best(S, pool) {   // greedy from several starts, then single swaps; within budget and slots
  const cands = pool.slice().sort((a, b) => b.worth - a.worth).slice(0, 30);
  const sc = h => S.score(h.map(c => c.id)) + 0.001 * h.reduce((a, c) => a + c.worth, 0);
  const grow = H => { for (;;) { let bb = null, bv = sc(H); for (const c of cands) { if (H.includes(c) || H.length >= CFG.slots || cost(H) + c.price > CFG.budget) continue; const v = sc([...H, c]); if (v > bv + 1e-9) { bv = v; bb = c; } } if (!bb) return H; H = [...H, bb]; } };
  const swap = H => { let imp = true; while (imp) { imp = false; const base = sc(H); for (let i = 0; i < H.length && !imp; i++) for (const c of cands) { if (H.includes(c)) continue; const h = [...H]; h[i] = c; if (cost(h) <= CFG.budget && sc(h) > base + 1e-9) { H = h; imp = true; break; } } } return H; };
  let top = null; for (const seed of [[], ...cands.slice(0, 8).map(c => [c])]) { const H = swap(grow(seed)); if (!top || sc(H) > sc(top)) top = H; }
  return { score: S.score(top.map(c => c.id)), ids: top.map(c => c.id), cost: cost(top) };
}
const rankOf = rel => CFG.ranks.find(([cut]) => rel >= cut)[1];
const STRATEGIES = {
  random: (() => { let r = rng(99); return can => can[Math.floor(r() * can.length)]; })(),
  cheapest: can => can.slice().sort((a, b) => a.price - b.price)[0],
  dearest: can => can.slice().sort((a, b) => b.price - a.price)[0],
  mustHave: can => can.find(c => c.kind === "must-have") || can[0],
  trap: can => can.find(c => c.kind === "trap") || can[0],
  worth: can => can.slice().sort((a, b) => b.worth - a.worth)[0],
  ratio: can => can.slice().sort((a, b) => b.worth / b.price - a.worth / a.price)[0],
};
// the example player of the mocks: takes SQL if offered early, else the strongest card that leaves room, else best value
const examplePlayer = (can, st) => { const t = can.find(c => c.id === "sql"); if (t && st.hire.length < 3) return t; const s = can.filter(c => c.kind === "strong" && st.budget - c.price >= Math.min(2, st.slotsLeft - 1)); if (s.length) return s.sort((a, b) => b.worth - a.worth)[0]; return STRATEGIES.ratio(can); };

const pct = v => (v * 100).toFixed(1) + "%";
async function report(D, roleId, seed, player) {
  const r = D.ix.roles[roleId], R = await Atlas.role(roleId), K = deck(D, r), S = scorer(K, R.jobs);
  const g = play(K, player, seed), ids = g.hire.map(c => c.id), score = S.score(ids);
  const offered = [...new Map(g.log.flatMap(h => h.hand).map(c => [c.id, c])).values()];   // hand cards carry their kind
  const bo = best(S, offered), mh = best(S, K.mustHave), ceil = best(S, K.cards.filter(c => c.share >= 0.1));
  console.log(`\n== ${r.label} (${roleId}, ${r.set}), deal ${seed}: ${R.jobs.length} postings, ${r.nCompanies} companies, small=${r.small}`);
  console.log(`pools: strong ${K.strong.length}, must-have ${K.mustHave.length}, trap ${K.trap.length}`);
  let so = [];
  g.log.forEach((h, i) => {
    console.log(`hand ${i + 1} (budget ${h.budget}):`); for (const c of h.hand) console.log(`   ${c.id === h.pick ? "HIRED" : "     "} ${c.name} [${c.kind}] ${c.price} pts · ${pct(c.share)} ask · ${c.lift.toFixed(2)}x · weight ${c.worth.toFixed(3)}${c.peak && c.peak.role !== roleId ? ` · peak ${D.ix.roles[c.peak.role].label} ${pct(c.peak.share)} ${c.peak.lift.toFixed(2)}x` : ""}`);
    if (h.pick) so.push(h.pick); console.log(`   so far: ${S.count(so)} postings (${pct(S.score(so))})`);
  });
  console.log(`score ${pct(score)} (${S.count(ids)} of ${R.jobs.length}); best from the cards dealt ${pct(bo.score)} [${bo.ids.join(", ")}] cost ${bo.cost} (${S.count(bo.ids)}); relative ${(score / (bo.score || 1)).toFixed(3)} -> ${rankOf(bo.score ? score / bo.score : 0)}`);
  for (const id of ids) console.log(`   without ${id}: ${pct(S.score(ids.filter(x => x !== id)))} (${S.count(ids.filter(x => x !== id))})`);
  const bp = g.hire.slice().sort((a, b) => b.worth - a.worth)[0]; console.log(`best pick (highest weight): ${bp.name}`);
  const over = g.hire.filter(c => c.share < 0.25 && c.price >= 2).sort((a, b) => b.price - a.price || a.share - b.share)[0]; console.log(`overspend: ${over ? over.name : "none"}`);
  const missed = offered.filter(c => !ids.includes(c.id) && c.kind === "strong").sort((a, b) => b.worth - a.worth)[0];
  if (missed && over) { const sw = ids.map(x => x === over.id ? missed.id : x); console.log(`got away: ${missed.name}; in place of ${over.name}: ${pct(S.score(sw))} (${S.count(sw)}), cost ${cost(sw.map(x => K.byId[x]))}`); }
  console.log(`must-haves alone: ${pct(mh.score)} [${mh.ids.join(", ")}]; role ceiling ${pct(ceil.score)} [${ceil.ids.join(", ")}] cost ${ceil.cost}`);
  return { K, S, R, g };
}

(async () => {
  const D = await load(), argv = process.argv.slice(2), arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  console.log("config", JSON.stringify(CFG));
  console.log(`roles in the game: ${D.roles.length} (${D.roles.filter(r => r.set === "mba").length} MBA, ${D.roles.filter(r => r.set === "product").length} product); small: ${D.roles.filter(r => r.small).map(r => `${r.id} (${r.n})`).join(", ")}`);
  console.log("note: ix.roles.pmm is the product PMM once Atlas.product() has loaded (id shared with the MBA marketing role)");
  if (arg("--role")) { await report(D, arg("--role"), +(arg("--deal") || 1), STRATEGIES.ratio); return; }
  const { K, S, R } = await report(D, "pm", 130, examplePlayer);
  // the two postings on the scorecard
  const hire = new Set(["sql", "prioritization", "cross_functional", "customer_obsession"]);
  for (const [company, title] of [["0G", "Enterprise Product Manager"], ["1Password", "Staff Product Manager, SaaS Manager"]]) {
    const j = R.jobs.find(x => x.company === company && x.title === title), top = j.skills.filter(i => K.byId[i]).sort((a, b) => K.byId[b].worth - K.byId[a].worth).slice(0, 5);
    const need = top.reduce((a, i) => a + K.byId[i].worth, 0), names = j.skills.filter(i => hire.has(i)), got = names.reduce((a, i) => a + K.byId[i].worth, 0), withRoad = got + (j.skills.includes("roadmap") ? K.byId.roadmap.worth : 0);
    console.log(`posting ${company} · ${title} · ${j.level} · ${j.group}: top five [${top.map(i => K.byId[i].name).join(", ")}] weigh ${need.toFixed(2)}; hire names [${names.join(", ")}] = ${(got / need * 100).toFixed(0)}%; with roadmapping ${(withRoad / need * 100).toFixed(0)}%`);
  }
  console.log("PM cards by kind:"); for (const k of ["strong", "mustHave", "trap"]) console.log(`  ${k}: ${K[k].map(c => `${c.name} ${c.price}`).join(", ")}`);
  if (!argv.includes("--all")) return;
  const rel = {}, rows = [];
  for (const r of D.roles) {
    const R2 = await Atlas.role(r.id), K2 = deck(D, r), S2 = scorer(K2, R2.jobs);
    const ceil = best(S2, K2.cards.filter(c => c.share >= 0.1)), mh = best(S2, K2.mustHave);
    const row = { id: r.id, n: R2.jobs.length, small: r.small, ceiling: ceil.score, mustHaveAlone: mh.score };
    for (const [nm, st] of Object.entries(STRATEGIES)) { let a = 0; for (let s = 1; s <= 20; s++) { const g = play(K2, st, s * 7919), off = [...new Map(g.log.flatMap(h => h.hand).map(c => [c.id, K2.byId[c.id]])).values()], b = best(S2, off).score, y = S2.score(g.hire.map(c => c.id)); (rel[nm] ||= []).push(b ? y / b : 0); a += y; } row[nm] = a / 20; }
    rows.push(row);
  }
  const q = (v, p) => v.slice().sort((a, b) => a - b)[Math.floor(p * (v.length - 1))];
  console.log("\nper role: ceiling, must-haves alone, mean score of random / must-have / ratio players over 20 deals");
  for (const x of rows.sort((a, b) => a.ceiling - b.ceiling)) console.log(`  ${x.id.padEnd(24)} n=${String(x.n).padStart(5)}${x.small ? " small" : "      "} ceiling ${pct(x.ceiling).padStart(6)} must-haves ${pct(x.mustHaveAlone).padStart(6)} | random ${pct(x.random).padStart(6)} must-have player ${pct(x.mustHave).padStart(6)} ratio ${pct(x.ratio).padStart(6)}`);
  const med = k => q(rows.map(x => x[k]), 0.5);
  console.log(`medians over roles: ceiling ${pct(med("ceiling"))}, must-haves alone ${pct(med("mustHaveAlone"))}`);
  console.log("score relative to the best hire from the cards dealt (all roles x 20 deals): p10 / p25 / median / p75 / p90");
  for (const [nm, v] of Object.entries(rel)) console.log(`  ${nm.padEnd(9)} ${[0.1, 0.25, 0.5, 0.75, 0.9].map(p => q(v, p).toFixed(2)).join(" / ")}`);
})();
