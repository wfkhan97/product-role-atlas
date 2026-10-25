// Evals for the taxonomy adapted to each role (PLAN.md v14): the sentences the screens build about a skill, the
// carriers picked per role, the grid's panels and the course reader's split. Data rules over every role of both sets,
// in pure functions the app runs, with no DOM. Exits 1 on a rule violation.
//
//   node evals/adaptive.mjs                 # every part
//   node evals/adaptive.mjs --only text     # one part: text (step 2), carriers (3), grid (4), course (5)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { loadGraph } from "./graph_mba.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "..");
const require = createRequire(import.meta.url);
const { createMatcher } = require(path.join(root, "web/match.js"));
const EvidenceText = require(path.join(root, "web/evidence_text.js"));
const J = f => JSON.parse(fs.readFileSync(path.join(root, f)));
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const PARTS = ["text", "carriers", "grid"];
if (only && !PARTS.includes(only)) { console.error(`--only takes one of ${PARTS.join(", ")}`); process.exit(2); }
let pass = 0, fail = 0; const bad = [];
const check = (ok, msg) => { ok ? pass++ : (fail++, bad.push(msg)); };
const words = t => t.trim().split(/\s+/).length;
const EMPTY = /undefined|null|\[|\]|\s;|\.\.|,\s*[.;]|\(\)|  /;

// Both role sets as the app sees them: the MBA index with every role file, and the product graph; the role's field is
// its group (product roles read the "product" entry). Skill nodes carry kind, how_shown, fields, signals.
const MBA = loadGraph(), ROLES = J("web/data/roles_mba.json"), PROD = J("web/data/graph.json");
const groupOf = Object.fromEntries(ROLES.groups.flatMap(g => g.families.map(f => [f, g.id])));
const roleSets = [
  { set: "mba", G: MBA, tax: J("web/data/taxonomy_mba.json"), subs: J("web/data/subskills_mba.json"), roles: ROLES, fams: Object.keys(MBA.families).filter(f => MBA.jobs.some(j => j.family === f)), group: f => groupOf[f], kinds: MBA.meta.kinds },
  { set: "product", G: PROD, tax: J("web/data/taxonomy.json"), subs: J("web/data/subskills.json"), roles: null, fams: Object.keys(PROD.families), group: () => "product", kinds: PROD.meta.kinds },
];

if (!only || only === "text") {
  // For every role of both sets and every ask of the role (a tenth of its postings or more), the builder returns a
  // line and a gap sentence under 40 words with no empty slot; the line is the field's where the field has an entry
  // (the product entry for a product role); a behaviour's gap sentence names a carrier the role's postings ask for.
  const counts = { field: 0, signals: 0, template: 0, roles: 0, rows: 0, noCarrier: 0 };
  for (const S of roleSets) {
    const M = createMatcher({ taxonomy: S.tax, subskills: S.subs, graph: S.G, roles: S.roles || undefined });
    const T = EvidenceText.create({ kinds: S.kinds }); const byId = Object.fromEntries(S.G.skills.map(s => [s.id, s]));
    const nameOf = id => (byId[id] || {}).name || id;
    for (const fam of S.fams) {
      const jobs = S.G.jobs.filter(j => j.family === fam); if (!jobs.length) continue; counts.roles++;
      const field = S.group(fam); const req = M.requirements({ jobs, label: fam });
      const rows = M.score({}, req, { level: "mid" }).rows.filter(x => !x.slot.startsWith("__"));
      for (const x of rows) {
        const s = byId[x.id]; if (!s) { check(false, `${S.set}/${fam}: row ${x.id} has no skill node`); continue; }
        counts.rows++;
        const l = T.line(s, field), g = T.gap(x, s, { shown: new Set(), nameOf }), th = T.thin(s);
        for (const [what, t] of [["line", l.text], ["gap", g], ["thin", th]]) {
          check(typeof t === "string" && t.length > 0 && words(t) < 40, `${S.set}/${fam}/${x.id}: ${what} is empty or 40 words or more: "${t}"`);
          check(!EMPTY.test(t), `${S.set}/${fam}/${x.id}: ${what} has an empty slot: "${t}"`);
        }
        if (l.source === "template") { // a digit may come from the data's own names ("5 whys", "SOC 2"), never from the template
          let t = l.text; for (const w of [].concat(...["artefacts", "counterparts", "measures", "verbs"].map(k => (s.how_shown || {})[k] || []))) t = t.split(w).join("");
          check(!/\d/.test(t), `${S.set}/${fam}/${x.id}: a template line invented a number: "${l.text}"`);
        }
        counts[l.source]++;
        const e = s.fields && s.fields[field];
        if (e) check(l.source === "field" && l.text === e.line, `${S.set}/${fam}/${x.id}: the field entry exists but the line is from ${l.source}`);
        if (S.set === "product" && s.fields && Object.keys(s.fields).length) check(l.source === "field" && l.field === "product", `product/${fam}/${x.id}: a product role must read the product entry`);
        if (x.kind === "behaviour") {
          // the sentence names a carrier whenever one was picked; a picked carrier is on the role's postings unless it is
          // the field entry's list standing in ("in this field"); a role whose postings carry none of the behaviour's
          // carriers at all gets the kind's rule with the artefacts, and is counted
          const named = (x.carriers || []).filter(k => g.includes(nameOf(k)));
          if (!(x.carriers || []).length) { counts.noCarrier++; check(/carries it\.$/.test(g), `${S.set}/${fam}/${x.id}: no carrier picked and no artefact named: "${g}"`); }
          else { check(named.length > 0, `${S.set}/${fam}/${x.id}: the behaviour's gap sentence names none of its carriers (${x.carriers.join(", ")}): "${g}"`);
            if (!x.carriersFallback) for (const k of named) check(req.share(k) > 0, `${S.set}/${fam}/${x.id}: carrier ${k} is on none of the role's postings`); }
        }
      }
    }
  }
  console.log(`text: ${counts.roles} roles, ${counts.rows} rows; lines from the field entry ${counts.field}, from signals ${counts.signals}, from a template ${counts.template}; behaviour rows with no carrier on the role's postings ${counts.noCarrier}`);
}

if (!only || only === "carriers") {
  // For every role of both sets and every behaviour or practice in its grid (asked by a tenth of the view's postings
  // or more), the carriers Atlas.carriers picks pass the 15% rule on the role's postings or fall back (the field
  // entry's list, or the two most asked); the fallbacks are counted; a top-row behaviour (asked by most postings) with
  // no carrier at all fails; the field entry read is the role's group's.
  const { Matcher: MM, atlasFactory } = await import("../tests/web/_load.mjs");
  const A = atlasFactory({ load: url => JSON.parse(fs.readFileSync(path.join(root, "web", url), "utf8")), Matcher: MM });
  const ix = await A.index(); await A.product();
  const counts = { roles: 0, rows: 0, role: 0, field: 0, any: 0, none: 0 };
  for (const id of Object.keys(ix.roles)) {
    const R = await A.role(id); const slice = R.jobs; if (!slice.length) continue; counts.roles++;
    const { rows } = A.grid(R, slice);
    rows.forEach((row, tier) => row.forEach(cell => { for (const x of cell) {
      const s = R.skillById[x.id]; if (!s || !(s.kind === "behaviour" || s.kind === "practice")) continue; counts.rows++;
      const c = A.carriers(R, slice, x.id); counts[c.source]++;
      check(c.ids.every(k => R.skillById[k] && MM.CARRIER_KINDS.has(R.skillById[k].kind)), `${id}/${x.id}: a carrier is not of a carrier kind: ${c.ids.join(", ")}`);
      check(c.ids.length <= MM.CARRIER_MAX, `${id}/${x.id}: ${c.ids.length} carriers, more than ${MM.CARRIER_MAX}`);
      if (c.source === "role") check(c.ids.length >= 2 && c.ids.every(k => c.shares[k] >= MM.CARRIER_MIN - 1e-9), `${id}/${x.id}: picked on the postings but a carrier is under the floor: ${c.ids.map(k => k + " " + (100 * c.shares[k]).toFixed(0) + "%").join(", ")}`);
      else if (c.source === "field") check(JSON.stringify(c.ids) === JSON.stringify(((s.fields || {})[R.role.group] || {}).shown_by.filter(k => R.skillById[k] && MM.CARRIER_KINDS.has(R.skillById[k].kind))), `${id}/${x.id}: the field fallback is not the role's field's list`);
      if (tier === 0 && s.kind === "behaviour") check(c.ids.length > 0, `${id}/${x.id}: a behaviour most postings ask for has no carrier at all`);
      check(c.field.length === 0 || !s.fields || !s.fields[R.role.group] || c.field.every(k => s.fields[R.role.group].shown_by.includes(k)), `${id}/${x.id}: the field entry read is not the role's group's`);
    } }));
  }
  console.log(`carriers: ${counts.roles} roles, ${counts.rows} behaviour or practice rows; picked on the role's postings ${counts.role}, the field's list standing in ${counts.field}, the two most asked under the floor ${counts.any}, none ${counts.none}`);
}

if (!only || only === "grid") {
  // Over every role of both sets: no behaviour sits in an area panel; the last panel is "How you work" exactly when a
  // behaviour is in the grid, holds every behaviour of the grid, and every row of it carries its carriers (or none
  // exist); the first panel holds a method or a defining skill; the generic skills lie within behaviours and practices.
  const { Matcher: MM, atlasFactory } = await import("../tests/web/_load.mjs");
  const A = atlasFactory({ load: url => JSON.parse(fs.readFileSync(path.join(root, "web", url), "utf8")), Matcher: MM });
  const ix = await A.index(); await A.product();
  const counts = { roles: 0, withPanel: 0, behaviourRows: 0, leadsWithMethod: 0 };
  for (const id of Object.keys(ix.roles)) {
    const R = await A.role(id); const slice = R.jobs; if (!slice.length) continue; counts.roles++;
    const { areas } = A.areas(R, slice); const { rows } = A.grid(R, slice);
    const inGrid = rows.flat(2); const behaviours = inGrid.filter(x => (R.skillById[x.id] || {}).kind === "behaviour");
    const panel = areas.find(a => a.behaviours); const others = areas.filter(a => !a.behaviours);
    for (const a of others) for (const x of a.skills) check((R.skillById[x.id] || {}).kind !== "behaviour", `${id}: behaviour ${x.id} sits in the ${a.label} panel`);
    check(!!panel === behaviours.length > 0, `${id}: the How you work panel ${panel ? "exists" : "is missing"} with ${behaviours.length} behaviours in the grid`);
    if (panel) {
      counts.withPanel++; counts.behaviourRows += panel.skills.length;
      check(areas[areas.length - 1] === panel, `${id}: the How you work panel is not last`);
      check(new Set(panel.skills.map(x => x.id)).size === behaviours.length && behaviours.every(b => panel.skills.some(x => x.id === b.id)), `${id}: the panel holds ${panel.skills.length} rows for ${behaviours.length} behaviours`);
      check(typeof panel.summary === "string" && panel.summary.length > 0 && !/undefined|NaN/.test(panel.summary), `${id}: the panel's summary is empty or broken: "${panel.summary}"`);
      for (const x of panel.skills) { const c = A.carriers(R, slice, x.id); check(JSON.stringify(x.carriers) === JSON.stringify(c.ids), `${id}/${x.id}: the row's carriers differ from carriers()`); }
    }
    // the first panel is the craft: a skill of a carrier kind (method, practice, technical, knowledge) or a defining one, never tools or behaviours alone
    if (others.length) { const first = others[0]; const ok = first.skills.some(x => x.defining || MM.CARRIER_KINDS.has((R.skillById[x.id] || {}).kind)); if (ok) counts.leadsWithMethod++; check(ok, `${id}: the first panel (${first.label}) holds neither a carrier-kind skill nor a defining skill`); }
  }
  // the generic skills (asked by most postings of half the roles) are measured, not listed: they must be behaviours and
  // practices in the main, never a tool or a credential; the composition is printed, since a data refresh moves it
  const generic = await A.genericSkills(); const gk = {}; for (const k of generic) { const kd = (ix.skillById[k] || {}).kind || "?"; (gk[kd] ||= []).push(k); }
  const soft = (gk.behaviour || []).length + (gk.practice || []).length;
  check(soft * 2 >= generic.size, `the generic skills are mostly not behaviours or practices: ${JSON.stringify(gk)}`);
  for (const k of generic) check(!["tool", "credential"].includes((ix.skillById[k] || {}).kind), `generic skill ${k} is a ${(ix.skillById[k] || {}).kind}`);
  console.log(`grid: ${counts.roles} roles, ${counts.withPanel} with a How you work panel holding ${counts.behaviourRows} rows; the first panel leads with a carrier-kind or defining skill in ${counts.leadsWithMethod}; ${generic.size} generic skills: ${Object.entries(gk).map(([k, v]) => `${k} ${v.length}${k === "behaviour" || k === "practice" ? "" : " (" + v.join(", ") + ")"}`).join(", ")}`);
}

for (const b of bad.slice(0, 40)) console.log("  FAIL " + b);
console.log(`adaptive: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
