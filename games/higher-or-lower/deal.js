#!/usr/bin/env node
/* Higher or lower: the reference deal, run against the real data through web/atlas.js.
   The game (web/games/higher-or-lower.js) must deal the same way; the functions below are written so they can be
   copied into it as they are (no node APIs inside them).

   node games/higher-or-lower/deal.js                  every playable role, its pool size
   node games/higher-or-lower/deal.js pm fpa --seed 7  a perfect-play deal of 12 pairs for each role
   node games/higher-or-lower/deal.js --hop --seed 7   a field-hop deal of 12 pairs
   node games/higher-or-lower/deal.js --sim            perfect-play chain length and a "guess toward the middle" player */
"use strict";
const fs = require("fs"), path = require("path");
const WEB = path.join(__dirname, "..", "..", "web");
const Atlas = require(path.join(WEB, "atlas.js"))({ load: url => JSON.parse(fs.readFileSync(path.join(WEB, url), "utf8")), Matcher: null });

// ---------- the rules (README, "Pair selection and the difficulty ramp") ----------
const MIN_SHARE = 0.10;          // Atlas.TIER.some: the lowest row of the role screen, so every card is on it
const HOP_MIN_SHARE = 0.02;      // field hop: a role card needs at least 2%
const MIN_GAP = 8;               // points, on the rounded shares the player sees
const BANDS = [[0, 25, 100], [3, 15, 30], [6, 10, 20], [10, 8, 14]];   // [from streak, min gap, max gap]
const HOP_RUN = 4;               // field hop: comparisons on one skill before the skill changes
const RANKS = [[0, "Cover letter skimmer"], [3, "Job board regular"], [6, "Sharp recruiter"], [10, "Hiring committee"], [15, "Head of talent"], [25, "Walking atlas"]];
const band = streak => { const b = BANDS.filter(x => streak >= x[0]).pop(); return { lo: b[1], hi: b[2] }; };
const rankOf = streak => RANKS.filter(r => streak >= r[0]).pop()[1];
const pct = share => Math.round(share * 100);
const playableSkill = s => s.cluster !== "credentials" && !s.id.startsWith("yoe_");

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (rng, xs) => xs[Math.floor(rng() * xs.length)];

// ---------- the playable roles, keyed by set ("mba:fpa", "product:pm") ----------
// MBA roles come from ix.M.roles, not ix.roles: Atlas.product() writes the product families into ix.roles, and the
// product family "pmm" overwrites the MBA role "pmm" there. The MBA pmm is left out of the game (its #/role link
// opens the product family once the product set is loaded), and so are small roles (fewer than meta.shares.small).
function playableRoles(ix, P) {
  const M = ix.M, small = (M.meta.shares || {}).small || 60, out = [];
  const label = Object.fromEntries(ix.groups.map(g => [g.id, g.label]));
  for (const g of M.groups) {
    if (g.id === "product") continue;
    for (const f of g.families) {
      const r = M.roles[f];
      if (r.small || r.n < small || (P && P.G.families[f])) continue;   // pmm: same id as a product family
      const shares = {};
      for (const s of M.skills) if (playableSkill(s) && s.by_family && s.by_family[f] != null) shares[s.id] = pct(s.by_family[f]);
      out.push({ key: "mba:" + f, set: "mba", id: f, label: r.label, group: g.id, groupLabel: label[g.id], n: r.n, shares });
    }
  }
  if (P) for (const f of Object.keys(P.G.families)) {
    const r = ix.roles[f]; if (!r || r.set !== "product" || r.n < small) continue;
    const shares = {};
    for (const s of P.G.skills) if (playableSkill(s) && s.by_family && s.by_family[f] != null) shares[s.id] = pct(s.by_family[f]);
    out.push({ key: "product:" + f, set: "product", id: f, label: r.label, group: "product", groupLabel: "Product", n: r.n, shares });
  }
  return out;
}

// ---------- one role: skills of one role, the hidden card becomes the left card ----------
// A card is { skill, share } (share in whole points). Returns { first, next(left, streak) -> card | null }.
function oneRoleDeck(role, rng) {
  const pool = Object.entries(role.shares).filter(([, v]) => v >= pct(MIN_SHARE)).map(([skill, share]) => ({ skill, share }));
  const used = new Set();
  const open = (c, extra) => { const up = pool.some(o => !used.has(o.skill) && o.skill !== extra && o.share - c.share >= MIN_GAP), dn = pool.some(o => !used.has(o.skill) && o.skill !== extra && c.share - o.share >= MIN_GAP); return up && dn; };
  const mids = pool.filter(c => open(c, c.skill));
  const first = pick(rng, mids.length ? mids : pool); used.add(first.skill);
  function next(left, streak) {
    let { lo, hi } = band(streak);
    for (let relax = 0; relax < 4; relax++) {
      const cands = pool.filter(c => !used.has(c.skill) && Math.abs(c.share - left.share) >= lo && Math.abs(c.share - left.share) <= hi);
      if (cands.length) {
        const up = cands.filter(c => c.share > left.share), dn = cands.filter(c => c.share < left.share);
        const side = (rng() < 0.5 && up.length) || !dn.length ? up : dn;   // the answer is a coin flip when both are possible
        const keepsOpen = side.filter(c => open(c, c.skill));             // and the next pair can still go either way
        const card = pick(rng, keepsOpen.length ? keepsOpen : side); used.add(card.skill); return card;
      }
      hi += 6; lo = Math.max(MIN_GAP, lo - 4); if (relax === 2) hi = 100;
    }
    return null;   // the deck is out: the run ends as "every pair dealt" (README, edge cases)
  }
  return { first, next, pool };
}

// ---------- field hop: one skill across roles of different fields ----------
// A card is { role (key), skill, share }. The skill changes every HOP_RUN comparisons; its first card is shown.
function hopSkills(roles) {
  const ids = new Set(roles.flatMap(r => Object.keys(r.shares)));
  return [...ids].filter(id => {
    const vals = roles.map(r => r.shares[id]).filter(v => v != null);   // a role without the skill has no card, not 0%
    return vals.filter(v => v >= pct(MIN_SHARE)).length >= 6 && Math.max(...vals) - Math.min(...vals) >= 30;
  });
}
function hopDeck(roles, rng) {
  const byKey = Object.fromEntries(roles.map(r => [r.key, r]));
  const skills = hopSkills(roles), usedSkills = new Set();
  let skill = null, used = new Set(), run = 0;
  const cardsOf = sid => roles.filter(r => r.shares[sid] != null && r.shares[sid] >= pct(HOP_MIN_SHARE)).map(r => ({ role: r.key, skill: sid, share: r.shares[sid] }));
  function newSkill() {
    const left = skills.filter(s => !usedSkills.has(s)); if (!left.length) return null;
    skill = pick(rng, left); usedSkills.add(skill); used = new Set(); run = 0;
    const cards = cardsOf(skill), mids = cards.filter(c => cards.some(o => o.share - c.share >= 25) && cards.some(o => c.share - o.share >= 25));
    const first = pick(rng, mids.length ? mids : cards); used.add(first.role); return first;
  }
  const first = newSkill();
  function next(left, streak) {
    if (run >= HOP_RUN) { const fresh = newSkill(); if (!fresh) return null; return { reset: fresh, ...nextFrom(fresh, streak) }; }
    return nextFrom(left, streak);
  }
  function nextFrom(left, streak) {
    let { lo, hi } = band(streak); const all = cardsOf(skill).filter(c => !used.has(c.role));
    const otherField = all.filter(c => byKey[c.role].group !== byKey[left.role].group);
    const base = otherField.length ? otherField : all;
    for (let relax = 0; relax < 4; relax++) {
      const cands = base.filter(c => Math.abs(c.share - left.share) >= lo && Math.abs(c.share - left.share) <= hi);
      if (cands.length) {
        const up = cands.filter(c => c.share > left.share), dn = cands.filter(c => c.share < left.share);
        const side = (rng() < 0.5 && up.length) || !dn.length ? up : dn;
        const card = pick(rng, side); used.add(card.role); run++; return { card };
      }
      hi += 6; lo = Math.max(MIN_GAP, lo - 4); if (relax === 2) hi = 100;
    }
    run = HOP_RUN; return next(left, streak);   // nothing left on this skill: change skill
  }
  return { first, next };
}

// ---------- CLI ----------
async function main() {
  const args = process.argv.slice(2), seed = +(args[args.indexOf("--seed") + 1] || 7);
  const ix = await Atlas.index(), P = await Atlas.product();
  const roles = playableRoles(ix, P), byId = Object.fromEntries(roles.map(r => [r.id, r]));
  const name = id => (ix.skillById[id] || P.skillById[id] || {}).name || id;
  if (args.includes("--sim")) {
    const rng = mulberry32(seed), lens = [], mid = [];
    for (const r of roles) for (let k = 0; k < 20; k++) { const d = oneRoleDeck(r, rng); let left = d.first, s = 0, c; while (s < 200 && (c = d.next(left, s))) { s++; left = c; } lens.push(s); }
    for (const r of roles) for (let k = 0; k < 200; k++) {
      const d = oneRoleDeck(r, rng), med = d.pool.map(c => c.share).sort((a, b) => a - b)[Math.floor(d.pool.length / 2)];
      let left = d.first, s = 0, c; while ((c = d.next(left, s))) { if ((c.share > left.share) !== (left.share < med)) break; s++; left = c; } mid.push(s);
    }
    const q = (xs, p) => xs.slice().sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];
    console.log(`${roles.length} playable roles. Perfect play, ${lens.length} runs: shortest deck ${Math.min(...lens)} pairs, median ${q(lens, 0.5)}.`);
    console.log(`"Guess toward the middle" player, ${mid.length} runs: median streak ${q(mid, 0.5)}, 90th percentile ${q(mid, 0.9)}, best ${Math.max(...mid)}.`);
    console.log(`Field-hop skills: ${hopSkills(roles).length}.`);
    return;
  }
  if (args.includes("--hop")) {
    const rng = mulberry32(seed), d = hopDeck(roles, rng), lab = k => { const r = roles.find(x => x.key === k); return `${r.label} (${r.groupLabel})`; };
    let left = d.first; console.log(`Field hop, seed ${seed}. ${name(left.skill)}: ${lab(left.role)} ${left.share}%`);
    for (let s = 0; s < 12; s++) { const o = d.next(left, s); if (!o) break; if (o.reset) { left = o.reset; console.log(`  new skill ${name(left.skill)}: ${lab(left.role)} ${left.share}%`); }
      console.log(`  ${String(s + 1).padStart(2)}. ${lab(left.role)} ${left.share}% vs ${lab(o.card.role)} ${o.card.share}%  ${o.card.share > left.share ? "higher" : "lower"}`); left = o.card; }
    return;
  }
  const ids = args.filter(a => !a.startsWith("--") && a !== String(seed));
  if (!ids.length) { for (const r of roles) console.log(`${r.key.padEnd(32)} ${r.label.padEnd(42)} n=${String(r.n).padStart(5)}  pool ${Object.values(r.shares).filter(v => v >= 10).length}`); console.log(`${roles.length} playable roles`); return; }
  for (const id of ids) {
    const r = byId[id]; if (!r) { console.log(`not playable: ${id}`); continue; }
    const rng = mulberry32(seed), d = oneRoleDeck(r, rng); let left = d.first;
    console.log(`${r.label}, ${r.n} postings, seed ${seed}. First card: ${name(left.skill)} ${left.share}%`);
    for (let s = 0; s < 12; s++) { const c = d.next(left, s); if (!c) break; console.log(`  ${String(s + 1).padStart(2)}. ${name(left.skill)} ${left.share}% vs ${name(c.skill)} ${c.share}%  gap ${Math.abs(c.share - left.share)}  ${c.share > left.share ? "higher" : "lower"}  -> ${rankOf(s + 1)}`); left = c; }
  }
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { playableRoles, oneRoleDeck, hopDeck, hopSkills, band, rankOf, mulberry32, BANDS, RANKS, MIN_GAP };
