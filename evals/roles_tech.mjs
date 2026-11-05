// Reference reader of web/data/roles_tech.json: the title rules of the tech role set (engineering, design, legal),
// read from data alone. It shows the resume reader how to use the file; evals/run_pipeline.py --roles tech checks
// that it gives the same role, level, ladder and entry mark as pipeline/roles_tech.py on every title we hold.
//
//   import { createRoles } from "./roles_tech.mjs";  const R = createRoles(rules);
//   R.family("Software Engineer, Machine Learning")                      -> "ml_engineer"
//   R.level("Vice President, Software Engineer", { company: "Goldman Sachs Group" })  -> "senior"   (a bank grade)
//   R.entry("Software Engineer, New Grad")                               -> { entry: "grad", intern: false, source: "title" }
//   echo '[{"title": "...", "company": "...", "industry": null}]' | node evals/roles_tech.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function createRoles(rules) {
  const rx = p => new RegExp(p, rules.flags);
  const any = list => list.length ? rx(list.map(p => `(?:${p})`).join("|")) : null;
  const fams = rules.families.map(f => ({ ...f, rx: any(f.patterns), ex: any(f.exclude) }));
  const P = rules.product, pFams = P.families.map(f => ({ id: f.id, rx: rx(f.pattern) }));
  const pRx = { exclude: rx(P.exclude), keep: rx(P.keep), nonproduct: rx(P.nonproduct), food: rx(P.food), manage: rx(P.product_manage), hardware: rx(P.hardware) };
  const pHardware = new Set(P.hardware_families);
  const productFamily = t => (pFams.find(f => f.rx.test(t)) || {}).id || null;
  const productOk = t => !!productFamily(t) && !(pHardware.has(productFamily(t)) && pRx.hardware.test(t)) && !pRx.food.test(t) && !(pRx.exclude.test(t) && !pRx.keep.test(t)) && !(pRx.nonproduct.test(t) && !pRx.manage.test(t));
  const notTheJob = rx(rules.not_the_job), customer = rx(rules.customer_facing), hardware = rx(rules.hardware), software = rx(rules.software_word), engWord = rx(rules.eng_word);
  const banks = new Set(rules.banks), bankIndustries = new Set(rules.bank_industries);
  const ladders = Object.fromEntries(Object.entries(rules.ladders).map(([k, l]) => [k, l.grades.map(g => ({ level: g.level, rx: rx(g.pattern) }))]));
  const mts = new RegExp(rules.mts, "gi"), setoff = rx(rules.bank_setoff), setoffNot = rx(rules.bank_setoff_not);
  const E = rules.entry, own = (o, k) => (k != null && Object.hasOwn(o, k) ? o[k] : undefined);
  const firms = Object.fromEntries(E.firms.map(f => [f.firm.toLowerCase(), f.titles.map(t => ({ ...t, rx: rx(t.pattern) }))]));
  const tIntern = rx(E.title.intern), tNot = rx(E.title.not_for_them), tGrad = rx(E.title.grad), xStudent = rx(E.text.student), xNot = rx(E.text.not_student);

  const productGate = t => productOk(t) && (productFamily(t) === "product_engineer" || !engWord.test(t));
  function family(title) {
    const t = title || "";
    if (notTheJob.test(t) || productGate(t)) return null;
    for (const f of fams) {
      if (!f.rx.test(t) || (f.ex && f.ex.test(t))) continue;
      if (f.engineering && (customer.test(t) || (hardware.test(t) && !software.test(t)))) continue;
      return f.id;
    }
    return null;
  }
  // who: { company, industry } of the employer, both optional
  function ladder(title, who = {}, fam) {
    if ((fam === undefined ? family(title) : fam) === "counsel") return "legal";
    if ((bankIndustries.has(who.industry) || banks.has((who.company || "").toLowerCase())) && ladders.bank.some(g => g.rx.test(title || ""))) return "bank";
    if (setoff.test(title || "") && !setoffNot.test(title || "")) return "bank";
    return "engineering";
  }
  function level(title, who = {}, fam) {
    const which = ladder(title, who, fam);
    const t = (title || "").replace(mts, "MTS");
    const hit = ladders[which].find(g => g.rx.test(t));
    return hit ? hit.level : "mid";
  }
  // Who enters at this title: { entry: "grad" | null, intern, source }. opts.text: the cleaned posting text, optional.
  function entry(title, who = {}, opts = {}) {
    const t = title || "";
    const fam = family(t), lvl = level(t, who, fam);
    const intern = tIntern.test(t), out = (entry, i, source) => ({ entry, intern: i, source });
    if (tNot.test(t)) return out(null, intern, null);
    for (const row of own(firms, (who.company || "").toLowerCase()) || []) if (row.rx.test(t)) return out("grad", row.intern === undefined ? intern : row.intern, "firm");
    if (intern || tGrad.test(t)) return out("grad", intern, "title");
    if (opts.text && E.text.levels.includes(lvl) && xStudent.test(opts.text) && !xNot.test(opts.text)) return out("grad", intern, "text");
    return out(null, intern, null);
  }
  const label = (lvl, which = "engineering") => rules.ladders[which].levels[lvl] || lvl;
  return { family, ladder, level, label, entry };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const R = createRoles(JSON.parse(fs.readFileSync(path.join(here, "../web/data/roles_tech.json"))));
  const rows = JSON.parse(fs.readFileSync(0, "utf8"));
  process.stdout.write(JSON.stringify(rows.map(r => { const f = R.family(r.title), e = R.entry(r.title, r, { text: r.text }); return [f, R.level(r.title, r, f), R.ladder(r.title, r, f), e.entry, e.intern, e.source]; })));
}
