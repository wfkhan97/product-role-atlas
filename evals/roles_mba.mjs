// Reference reader of web/data/roles_mba.json: the title rules of the MBA role set, read from data alone.
// It shows the resume thread how to use the file, and evals/run_pipeline.py checks that it gives the same role and
// level as pipeline/roles_mba.py on every title we hold.
//
//   import { createRoles } from "./roles_mba.mjs";  const R = createRoles(rules);
//   R.family("Associate, Healthcare M&A", { category: "Investment banking" })   -> "ib_associate"
//   R.level("Vice President", { company: "Goldman Sachs Group" })              -> "senior"   (a bank grade)
//   R.entry("Associate", { company: "McKinsey & Company", category: "Strategy consulting" })
//                                              -> { entry: "mba", intern: false, source: "firm" }   (who enters at this title)
//   echo '[{"title": "...", "company": "...", "category": null, "industry": null}]' | node evals/roles_mba.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function createRoles(rules) {
  const rx = p => new RegExp(p, rules.flags);
  const any = list => list.length ? rx(list.map(p => `(?:${p})`).join("|")) : null;
  const fams = rules.families.map(f => ({ ...f, rx: any(f.patterns), ex: any(f.exclude) }));
  const P = rules.product, pFams = P.families.map(f => ({ id: f.id, rx: rx(f.pattern) }));
  const pRx = { exclude: rx(P.exclude), keep: rx(P.keep), nonproduct: rx(P.nonproduct), food: rx(P.food), manage: rx(P.product_manage) };
  const productFamily = t => (pFams.find(f => f.rx.test(t)) || {}).id || null;
  const productOk = t => !!productFamily(t) && !pRx.food.test(t) && !(pRx.exclude.test(t) && !pRx.keep.test(t)) && !(pRx.nonproduct.test(t) && !pRx.manage.test(t));
  const junk = rx(rules.junk), consultant = rx(rules.consultant), consultantEx = rx(rules.consultant_exclude);
  const employerEx = rx(rules.employer_exclude), realEstateEx = rx(rules.real_estate_exclude), corpDevNamed = rx(rules.corp_dev_named);
  const employerRules = Object.fromEntries(Object.entries(rules.employer_rules).map(([c, list]) => [c, list.map(r => ({ family: r.family, rx: rx(r.pattern) }))]));
  const first = new Set(rules.employer_first), named = new Set(rules.named_first), banks = new Set(rules.banks), consulting = new Set(rules.consulting_categories);
  const ladders = Object.fromEntries(Object.entries(rules.ladders).map(([k, l]) => [k, l.grades.map(g => ({ level: g.level, rx: rx(g.pattern) }))]));
  const cos = rx(rules.chief_of_staff), ldpStaff = rx(rules.ldp_staff);
  const houseRank = rx(rules.house_rank), houseStaff = rx(rules.house_staff);
  const big = new Set(rules.big_employers), deal = rx(rules.deal), campusRank = rx(rules.campus_rank), techStaff = rx(rules.tech_staff);
  const mbaWord = rx(rules.mba_word), programGrade = new RegExp(rules.program_grade, "gi");
  const E = rules.entry, own = (o, k) => (k != null && Object.hasOwn(o, k) ? o[k] : undefined);  // an employer may be called "Constructor"
  const entryFirms = Object.fromEntries(E.firms.map(f => [f.firm.toLowerCase(), f.titles.map(t => ({ ...t, rx: rx(t.pattern), families: t.families !== undefined ? t.families : f.families !== undefined ? f.families : ["management_consultant"] }))]));
  const entryCats = Object.fromEntries(E.categories.map(c => [c.category, { ...c, titles: c.titles.map(t => ({ ...t, rx: rx(t.pattern), no: t.not ? rx(t.not) : null })) }]));
  const tIntern = rx(E.title.intern), tNotForThem = rx(E.title.not_for_them), tPhd = rx(E.title.phd), tMbaNot = rx(E.title.mba_not), tPre = rx(E.title.pre), tMba = rx(E.title.mba);
  const tSummerAssociate = rx(E.title.summer_associate), tCampus = rx(E.title.campus), tCampusNot = rx(E.title.campus_not);
  const xMba = rx(E.text.mba), xMbaNot = rx(E.text.mba_not), xUndergrad = rx(E.text.undergrad), xWeak = rx(E.text.weak), xWeakNot = rx(E.text.weak_not);
  const sector = new RegExp(rules.sector, "gi"), bankCats = new Set(rules.bank_categories), lastResort = rx(rules.last_resort.pattern);

  function general(t) {
    for (const f of fams) {
      if (!f.rx.test(t) || (f.ex && f.ex.test(t))) continue;
      if ((f.id === "ib_associate" || f.id === "corporate_banking") && techStaff.test(t)) continue;
      if (f.product_gate && !(productOk(t) && productFamily(t) === f.product_gate)) continue;
      return f.id;
    }
    return null;
  }
  function employer(t, category) {
    if (consulting.has(category) && consultant.test(t)) return consultantEx.test(t) ? null : "management_consultant";
    if (bankCats.has(category) && deal.test(t) && !techStaff.test(t)) t = t.replace(sector, " ");
    if (category === "Strategy consulting" && houseRank.test(t)) return houseStaff.test(t) ? null : "management_consultant";
    if (employerEx.test(t) || (category === "Real estate" && realEstateEx.test(t))) return null;
    const hit = (employerRules[category] || []).find(r => r.rx.test(t));
    return hit ? hit.family : null;
  }
  // who: { category, industry, company } of the employer, each optional (rules.employers has them for employers we hold)
  function family(title, who = {}) {
    let t = title || "";
    if (junk.test(t)) return null;
    const firm = who.company ? who.company.split(/\s+/)[0] : "";
    if (firm.length >= 4 && t.toLowerCase().startsWith(firm.toLowerCase() + " ")) t = t.slice(firm.length + 1);
    const g = general(t);
    const isBig = big.has(who.company);
    if (first.has(who.category) && !named.has(g) && !isBig) { const f = employer(t, who.category); if (f) return g && campusRank.test(t) && !deal.test(t) ? g : f; }
    if (g === "corp_dev" && (isBig || (who.company && banks.has(who.company.toLowerCase()))) && (who.category == null || who.category === "Investment banking") && !corpDevNamed.test(t)) return "ib_associate";
    if (g) return g;
    let f = employer(t, who.category);
    if (f && isBig && !(deal.test(t) || campusRank.test(t))) f = null;
    return f || (lastResort.test(t) ? rules.last_resort.family : null);
  }
  function ladder(title, who = {}, fam) {
    const b = rules.ladders.bank.applies;
    if (b.categories.includes(who.category) || b.industries.includes(who.industry) || (who.company && banks.has(who.company.toLowerCase()))) return "bank";
    if (consulting.has(who.category) && (fam === undefined ? family(title, who) : fam) === "management_consultant") return "consulting";
    return "corporate";
  }
  function level(title, who = {}, fam) {
    let t = title || "";
    if (fam === undefined) fam = family(t, who);
    const which = ladder(t, who, fam);
    if (fam === "ldp" && !ldpStaff.test(t)) return "associate";
    t = t.replace(cos, "CoS");
    if (mbaWord.test(t)) t = t.replace(programGrade, "program");
    const hit = ladders[which].find(g => g.rx.test(t));
    return hit ? hit.level : "mid";
  }
  // Who enters at this title: { entry: "mba" | "pre_mba" | null, intern, source }. See rules.entry.about.
  // opts: { text } the cleaned posting text, { yoe } the years of experience the posting asks for; both optional.
  function textAudience(text) {
    let found = null;
    for (const m of text.matchAll(new RegExp(E.text.student, "gi"))) {
      const end = m.index + m[0].length, a = text.lastIndexOf("\n", m.index - 1) + 1, b = text.indexOf("\n", end);
      const line = text.slice(Math.max(a, m.index - 200), Math.min(b >= 0 ? b : text.length, end + 200));
      if (xMba.test(line)) {
        if (xMbaNot.test(line)) continue;
        if (!xUndergrad.test(line)) return "mba";
      }
      found = "pre_mba";
    }
    return found;
  }
  function entry(title, who = {}, opts = {}) {
    const t0 = title || "";
    const fam = family(t0, who), lvl = level(t0, who, fam);
    const firm = who.company ? who.company.split(/\s+/)[0] : "";
    const t = firm.length >= 4 && t0.toLowerCase().startsWith(firm.toLowerCase() + " ") ? t0.slice(firm.length + 1) : t0;
    const intern = tIntern.test(t), saysMba = tMba.test(t) && !tMbaNot.test(t);
    const out = (entry, i, source) => ({ entry, intern: i, source });
    if (tNotForThem.test(t) || (tPhd.test(t) && !saysMba)) return out(null, intern, null);
    for (const row of own(entryFirms, (who.company || "").toLowerCase()) || [])
      if ((row.families === null || row.families.includes(fam)) && row.rx.test(t)) return out(row.entry, row.intern === undefined ? intern : row.intern, "firm");
    if (tPre.test(t) && !tCampusNot.test(t)) return out("pre_mba", intern, "title");
    if (saysMba) return out("mba", intern, "title");
    if (E.title.no_mark_levels.includes(lvl)) return out(null, intern, null);
    const text = opts.text;
    if (text && (intern || E.text.student_levels.includes(lvl))) { const a = textAudience(text); if (a) return out(a, intern, "text"); }
    const cat = own(entryCats, who.category);
    if (cat && cat.families.includes(fam) && !(cat.max_yoe != null && opts.yoe != null && opts.yoe > cat.max_yoe))
      for (const row of cat.titles)
        if (row.rx.test(t) && !(row.no && row.no.test(t)) && (row.level === undefined || row.level === lvl)) return out(row.entry, row.intern === undefined ? intern : row.intern, "category");
    if (tSummerAssociate.test(t)) return out("mba", true, "title");
    if (text && E.text.weak_levels.includes(lvl) && !xWeakNot.test(t) && xWeak.test(text)) return out("pre_mba", intern, "text");
    if ((intern || tCampus.test(t) || fam === "ldp") && !tCampusNot.test(t)) return out("pre_mba", intern, "title");
    return out(null, intern, null);
  }
  const label = (lvl, which = "corporate") => rules.ladders[which].levels[lvl] || rules.level_labels[lvl];
  return { family, ladder, level, label, entry };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const R = createRoles(JSON.parse(fs.readFileSync(path.join(here, "../web/data/roles_mba.json"))));
  const rows = JSON.parse(fs.readFileSync(0, "utf8"));
  process.stdout.write(JSON.stringify(rows.map(r => { const f = R.family(r.title, r), e = R.entry(r.title, r, { text: r.text, yoe: r.yoe }); return [f, R.level(r.title, r, f), R.ladder(r.title, r, f), e.entry, e.intern, e.source]; })));
}
