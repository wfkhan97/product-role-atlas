// What does it ask for: the ask and filler pools, computed from the repo data through web/atlas.js,
// the same way the game will. Read-only. Run from the repo root:  node games/what-it-asks/pools.js [role id ...]
// With no ids it prints one line per role; with ids it prints each role's asks and filler in full.
const fs = require("fs"), path = require("path");
const WEB = path.join(__dirname, "../../web/");
const Atlas = require(WEB + "atlas.js")({ load: u => JSON.parse(fs.readFileSync(path.join(WEB, u), "utf8")), Matcher: null });

const RULE = { ask: 0.40, filler: 0.10, fillerWide: 0.15, minFiller: 14, elsewhere: 0.40, lift: 2 };

async function pools() {
  const ix = await Atlas.index(), P = await Atlas.product();   // product() first, so `pmm` is the product role, as on its page
  const generic = await Atlas.genericSkills();
  const M = ix.M, G = P.G;
  const skip = s => s.cluster === "credentials" || s.id.startsWith("yoe_");
  // a skill's share in another openable, non-small MBA role (graph_mba.json skills[].by_family)
  const mbaElsewhere = (sid, self) => Object.entries((ix.skillById[sid] || {}).by_family || {}).filter(([f]) => f !== self && ix.roles[f] && ix.roles[f].set === "mba" && !ix.roles[f].small);
  const out = {};
  for (const r of Object.values(ix.roles)) {
    const skills = (r.set === "mba" ? M.skills : G.skills).filter(s => !skip(s));
    const share = s => (s.by_family || {})[r.id] || 0;
    const elsewhere = s => r.set === "mba" ? mbaElsewhere(s.id, r.id)
      : [...Object.entries(s.by_family || {}).filter(([f]) => f !== r.id), ...mbaElsewhere(s.id, r.id)];
    const asks = skills.filter(s => share(s) >= RULE.ask).map(s => ({ id: s.id, name: s.name, share: share(s), generic: generic.has(s.id) })).sort((a, b) => b.share - a.share);
    const fillerAt = max => skills.filter(s => share(s) <= max).map(s => {
      const [top] = elsewhere(s).sort((a, b) => b[1] - a[1]); const base = ix.baseline[s.id] || 0;
      if (!top || top[1] < RULE.elsewhere || (base && top[1] / base < RULE.lift)) return null;
      return { id: s.id, name: s.name, share: share(s), where: top[0], whereLabel: ix.roles[top[0]].label, whereShare: top[1], lift: base ? top[1] / base : null, sameField: ix.roles[top[0]].group === r.group };
    }).filter(Boolean);
    let max = RULE.filler, filler = fillerAt(max);
    if (filler.length < RULE.minFiller) { max = RULE.fillerWide; filler = fillerAt(max); }
    filler.sort((a, b) => b.whereShare - a.whereShare);
    out[r.id] = { id: r.id, label: r.label, set: r.set, group: r.group, n: r.n, nOpen: r.nOpen, nCompanies: r.nCompanies, small: r.small, fillerMax: max, asks, filler };
  }
  return { out, generic, meta: { mba: M.meta.generated, product: G.meta.generated } };
}

if (require.main === module) pools().then(({ out, generic, meta }) => {
  const pc = v => Math.round(v * 100) + "%", ids = process.argv.slice(2);
  console.log(`data: graph_mba.json ${meta.mba}, graph.json ${meta.product}; generic asks: ${[...generic].join(", ")}`);
  if (!ids.length) {
    console.log("role\tset\tpostings\tasks\tgeneric\tfiller\tfillerMax\tsameField\tsmall");
    for (const v of Object.values(out)) console.log([v.id, v.set, v.n, v.asks.length, v.asks.filter(a => a.generic).length, v.filler.length, pc(v.fillerMax), v.filler.filter(f => f.sameField).length, v.small].join("\t"));
    return;
  }
  for (const id of ids) {
    const v = out[id]; if (!v) { console.log("unknown role " + id); continue; }
    console.log(`\n${v.label} (${id}, ${v.set}): ${v.n} postings, ${v.nCompanies} companies; ${v.asks.length} asks, ${v.filler.length} filler (<= ${pc(v.fillerMax)})`);
    console.log("asks:   " + v.asks.map(a => `${a.name} ${pc(a.share)}${a.generic ? " (generic)" : ""}`).join("; "));
    console.log("filler: " + v.filler.map(f => `${f.name} ${pc(f.share)} | ${f.whereLabel} ${pc(f.whereShare)}${f.sameField ? " (same field)" : ""}`).join("; "));
  }
}).catch(e => { console.error(e); process.exit(1); });

module.exports = { pools, RULE };
