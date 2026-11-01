// web/network.js: the pure parts of Who to meet (owner's pick N6, reshaped by the owner's feedback of 2026-11-01), on a
// synthetic role and on the real Product Manager. The types, the context, who and where (the Cornell alumni search),
// the suggested approach (never a school but the alum's ask; never a behaviour, a generic skill or a credential in a
// question) and the Pick targets.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web, root, realAtlas } from "./_load.mjs";

const N = require(path.join(web, "network.js"));

// a small index and role in the shape Atlas gives: one field, three employers, postings at five levels; a behaviour
// (Collaboration), a generic practice (Stakeholder management) and a credential among the asks
const sk = (id, name, kind, cluster, subskills) => [id, { id, name, kind, cluster: cluster || "craft", ...(subskills ? { subskills } : {}) }];
const IX = {
  M: { level_labels: { associate: "Analyst / associate", mid: "Manager", senior: "Senior manager", staff: "Lead / principal", director: "Director" } },
  skillById: Object.fromEntries([sk("a", "Forecasting", "method"), sk("b", "Budgeting & planning", "method", null, [{ id: "b1", name: "Annual operating plan" }, { id: "b2", name: "Rolling forecasts" }]), sk("c", "Stakeholder management", "practice"), sk("d", "Modeling (Excel, Anaplan)", "tool"), sk("e", "Variance analysis", "method"), sk("col", "Collaboration & teamwork", "behaviour", "leadership"), sk("mba", "MBA", "credential", "credentials")]),
  groups: [{ id: "finance", label: "Finance & accounting", roles: ["fpa"] }],
  roles: { fpa: { id: "fpa", label: "FP&A Manager", group: "finance", nOpen: 5, definingList: [{ id: "a", share: 0.9 }], asks: [{ id: "mba", share: 0.8 }, { id: "col", share: 0.75 }, { id: "b", share: 0.7 }, { id: "c", share: 0.6 }, { id: "d", share: 0.55 }, { id: "e", share: 0.3 }] } },
};
const GENERIC = new Set(["c"]);
const job = (id, company, title, level, extra) => ({ id, company, title, level, ladder: "corporate", family: "fpa", open: true, url: `https://example.com/${id}`, skills: [], sub: [], ...extra });
const R = {
  role: IX.roles.fpa, set: "mba", levelLabels: IX.M.level_labels, ladders: { corporate: { levels: IX.M.level_labels } },
  jobs: [job(1, "Acme", "FP&A Manager", "mid", { skills: ["b", "e", "col"], sub: ["b2"] }), job(2, "Acme", "Director, FP&A", "director", { sponsorship: "yes", skills: ["b", "e"] }), job(3, "Globex", "Senior FP&A Manager", "senior", { skills: ["a"] }), job(4, "Globex", "Lead FP&A Analyst", "staff"), job(5, "Initech", "FP&A Analyst", "associate"), job(6, "Initech", "Old posting", "mid", { open: false })],
};
const FIT = { rows: [{ id: "a", slotName: "Forecasting", tier: "core", status: "evidenced", w: 0.9 }, { id: "b", slotName: "Budgeting & planning", tier: "core", status: "gap", w: 0.7 }, { id: "c", slotName: "Stakeholder management", tier: "core", status: "through", w: 0.6 }, { id: "d", slotName: "Modeling (Excel, Anaplan)", tier: "core", status: "thin", w: 0.55 }, { id: "e", slotName: "Variance analysis", tier: "common", status: "gap", w: 0.3 }, { id: "col", slotName: "Collaboration & teamwork", tier: "core", status: "gap", w: 0.75 }] };
const PROFS = [{ slug: "sam-roster", name: "Sam Roster", title: "unknown", codes: ["TEST 3030"], gaps: [] }, { slug: "pat-example", name: "Pat Example", title: "Professor", codes: ["TEST 1010", "TEST 2020"], gaps: [{ id: "b", name: "Budgeting & planning" }, { id: "zz", name: "Other" }] }];
const H = { professor: "#/professor/" };
const O = extra => ({ generic: GENERIC, ...(extra || {}) });
const sentences = s => String(s).split(/[.?!]\s+|[.?!]$/).map(x => x.trim()).filter(Boolean);
const wordsOf = s => s.split(/\s+/).filter(Boolean).length;
// the names a question must never hold: every behaviour, credential and generic skill, as written and as a sentence says it
const banned = (ix, generic) => Object.values(ix.skillById).filter(s => s.kind === "behaviour" || s.kind === "credential" || s.cluster === "credentials" || generic.has(s.id)).map(s => N.short(s.name).toLowerCase()).filter(n => n.length >= 3);
const reOf = n => new RegExp(`(^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}($|[^a-z])`, "i");
const assertNoBanned = (qs, names, where) => { for (const q of qs) for (const n of names) assert.ok(!reOf(n).test(q), `${where}: "${q}" names "${n}"`); };
const assertRules = (S, type, where) => {
  const all = [S.leadWith, S.ask, ...S.questions];
  for (const s of all) {
    assert.ok(!/cornell|campus/i.test(s), `${where}: "${s}" names the campus`);
    assert.ok(!/school/i.test(s.replace(/your school/g, "")), `${where}: "${s}" names a school`);
    assert.ok(!/%|\bscore\b/i.test(s), `${where}: "${s}" is a score or a percentage`);
    for (const sentence of sentences(s)) assert.ok(wordsOf(sentence) <= 20, `${where}: "${sentence}" is over 20 words`);
  }
  if (type !== "alum") assert.ok(!all.some(s => /school/i.test(s)), `${where}: only the alum's ask says "your school"`);
};

// ---------- the types ----------
test("four types for any school, five with a Cornell address; faculty is the one that needs it; no classmate", () => {
  assert.deepEqual(N.types(false).map(t => t.id), ["hm", "inrole", "recruiter", "alum"]);
  assert.deepEqual(N.types(true).map(t => t.id), ["hm", "inrole", "recruiter", "alum", "faculty"]);
  assert.equal(N.typeOf("faculty").cornell, true);
  assert.equal(N.typeOf("peer").id, "hm", "the classmate type is gone: its id falls back to the first type");
  for (const t of N.TYPES) assert.ok(t.label && !("good" in t), `${t.id} has a label and no description line`);
});

// ---------- the context ----------
test("ctx reads the fit's core rows; leads with craft skills only; the craft asks and gaps leave out behaviours, generic skills and credentials", () => {
  const C = N.ctx(IX, R, FIT, O());
  assert.equal(C.fit.n, 2); assert.equal(C.fit.m, 5);
  assert.deepEqual(C.fit.gaps.map(g => g.id), ["col", "b", "d"]);
  assert.deepEqual(C.lead.map(s => s.id), ["a"], "Stakeholder management is shown but generic: not a lead");
  assert.equal(C.lead[0].said, "forecasting", "a method reads lower case mid-sentence");
  assert.deepEqual(C.craft.map(a => a.id), ["a", "b", "d", "e"], "defining first; no behaviour, generic skill or credential");
  assert.equal(C.craft.find(a => a.id === "d").said, "Modeling", "a tool keeps its capital; the brackets go");
  assert.deepEqual(C.craftGaps.map(g => g.id), ["b", "d"]);
  assert.equal(C.read, true);
  assert.ok(C.shownAll.includes("a") && C.shownAll.includes("c"));
  assert.equal(C.field.label, "Finance & accounting");
  assert.equal(C.postings.length, 5, "open postings only");
  assert.deepEqual(C.employers.map(e => [e.company, e.nOpen]), [["Acme", 2], ["Globex", 2], ["Initech", 1]]);
  assert.deepEqual(C.levels.map(l => l.level), ["associate", "mid", "senior", "staff", "director"], "in ladder order");
  assert.deepEqual(C.senior.map(l => l.level), ["staff", "director"]);
  assert.deepEqual(C.profs, [], "no profs without cornell");
});

test("ctx without a fit reads the role's asks against the skills shown; without those, nothing is read", () => {
  const C = N.ctx(IX, R, null, O({ shown: new Set(["b"]) }));
  assert.equal(C.fit.m, 5, "the asks at the core share, the credential skipped");
  assert.equal(C.fit.n, 1); assert.deepEqual(C.lead.map(s => s.id), ["b"]); assert.equal(C.read, true);
  const C0 = N.ctx(IX, R, null, O());
  assert.equal(C0.fit.n, 0); assert.deepEqual(C0.lead, []); assert.equal(C0.read, false);
});

test("ctx counts each employer's open postings of this role (most first); the field's postings add the other roles it posts; profs sort by gaps covered", () => {
  const field = [...R.jobs, job(7, "Acme", "Treasury Manager", "mid", { family: "treasury" }), job(8, "Nobody", "FP&A Manager", "mid")];
  const C2 = N.ctx({ ...IX, roles: { ...IX.roles, treasury: { id: "treasury", label: "Treasurer" } } }, R, FIT, O({ fieldJobs: field }));
  assert.deepEqual(C2.employers[0], { company: "Acme", nOpen: 2, roles: ["FP&A Manager", "Treasurer"] }, "the role's own count; the field adds roles");
  assert.ok(!C2.employers.some(e => e.company === "Nobody"), "only employers that post this role");
  const C = N.ctx(IX, R, FIT, O({ cornell: true, profs: PROFS }));
  assert.deepEqual(C.profs.map(p => p.slug), ["pat-example", "sam-roster"], "the most gaps covered first");
  assert.deepEqual(C.profs[0].covers.map(g => g.id), ["b"]);
  assert.deepEqual(C.profs[0].teach.map(g => g.said), ["budgeting & planning"]);
});

// ---------- who, the Find jobs link, the targets ----------
test("who gives the lead, the titles by level and the five employers; no note; faculty sorted by gaps covered", () => {
  const C = N.ctx(IX, R, FIT, O({ cornell: true, profs: PROFS }));
  const hm = N.who("hm", C);
  assert.equal(hm.lead, "Titles one or two levels above FP&A Manager, at the companies hiring it now.");
  assert.deepEqual(hm.levels.map(l => l.label), ["Lead / principal", "Director"]);
  assert.equal(hm.employers.length, 3); assert.ok(!("note" in hm));
  assert.deepEqual(N.who("inrole", C).levels.map(l => l.level), ["associate", "mid", "senior"]);
  for (const t of N.types(true)) assert.ok(!("note" in N.who(t.id, C)), `${t.id}: no note`);
  const f = N.who("faculty", C);
  assert.deepEqual(f.profs.map(p => p.name), ["Pat Example", "Sam Roster"]);
  assert.equal(f.profs[1].line, "Title not on the roster", "unknown is not a fact");
  const noSenior = N.ctx(IX, { ...R, jobs: R.jobs.filter(j => j.level === "mid") }, FIT, O());
  assert.equal(N.who("hm", noSenior).lead, "No senior FP&A Manager posting is open now. Look one level up: Senior manager.");
});

test("jobsHref opens Find jobs with the field and the role set, in the order jobs.js writes them", () => {
  const J = require(path.join(web, "jobs.js"));
  const C = N.ctx(IX, R, FIT, O());
  assert.equal(N.jobsHref(C), "#/jobs?field=finance&role=fpa");
  const s = J.parseState(N.jobsHref(C));
  assert.equal(s.role, "fpa"); assert.equal(s.field, "finance");
  assert.equal("#/jobs?" + J.stateQuery(s), N.jobsHref(C), "the jobs screen keeps the link as it is");
});

test("targetsOf: the employers by open postings ('Acme · 2 open') for the employer types, the professors for faculty", () => {
  const C = N.ctx(IX, R, FIT, O({ cornell: true, profs: PROFS }));
  assert.deepEqual(N.targetsOf("hm", C).map(t => t.key), ["Acme", "Globex", "Initech"]);
  assert.equal(N.targetsOf("recruiter", C)[0].label, "Acme · 2 open");
  assert.deepEqual(N.targetsOf("hm", C)[0].row, { company: "Acme" });
  const f = N.targetsOf("faculty", C);
  assert.deepEqual(f.map(t => t.key), ["pat-example", "sam-roster"]);
  assert.equal(f[0].hint, "covers 1 of your gaps"); assert.equal(f[1].hint, "TEST 3030");
});

test("with no résumé, the professors sort by the role's core asks their classes teach, then name, and say so", () => {
  assert.deepEqual(N.askRows(IX, R, 0.5).map(a => [a.id, a.tier]), [["a", "core"], ["col", "core"], ["b", "core"], ["c", "core"], ["d", "core"]], "the core asks, the credential left out");
  // the roster read against the asks: Zed teaches two asks, Pat one, Sam none
  const rows = [{ slug: "sam", name: "Sam Roster", codes: ["T 3"], gaps: [] }, { slug: "pat", name: "Pat Example", codes: ["T 1"], gaps: [{ id: "b", name: "Budgeting & planning" }] }, { slug: "zed", name: "Zed Last", codes: ["T 2"], gaps: [{ id: "a", name: "Forecasting" }, { id: "d", name: "Modeling" }] }];
  const C = N.ctx(IX, R, null, O({ cornell: true, profs: rows }));
  assert.equal(C.read, false);
  assert.deepEqual(C.profs.map(p => [p.slug, p.asks.length]), [["zed", 2], ["pat", 1], ["sam", 0]], "most asks taught first, not by name");
  const f = N.who("faculty", C).profs;
  assert.deepEqual([f[0].asks.length, f[0].nAsks, f[0].read], [2, 5, false]);
  assert.equal(N.fill(N.COPY.teachesOf, { n: 2, m: 5 }), "teaches 2 of 5 asks");
  assert.equal(N.targetsOf("faculty", C)[0].hint, "teaches 2 of 5 asks");
  // with a résumé the gaps sort stays
  const Cr = N.ctx(IX, R, FIT, O({ cornell: true, profs: rows }));
  assert.deepEqual(Cr.profs.map(p => [p.slug, p.covers.length]), [["pat", 1], ["zed", 1], ["sam", 0]], "gaps covered (Forecasting is shown, so Zed covers one), then name");
});

// ---------- where ----------
test("the alum search is LinkedIn's people search filtered to the three Cornell schools, as the owner tested it", () => {
  assert.deepEqual(N.CORNELL_SCHOOLS, ["3554137", "3523", "3323650"]);
  assert.equal(N.liAlumni('"Product Manager"'), "https://www.linkedin.com/search/results/people/?keywords=%22Product%20Manager%22&origin=FACETED_SEARCH&schoolFilter=%5B%223554137%22%2C%223523%22%2C%223323650%22%5D");
  const C = N.ctx(IX, R, FIT, O());
  const alum = N.where("alum", C, H);
  assert.equal(alum[0].href, N.liAlumni('"FP&A Manager"'));
  assert.equal(alum[1].href, N.liAlumni('Acme "FP&A Manager"'), "the company-narrowed variant keeps the school filter");
  assert.ok(alum.every(r => !/Add your school/.test(r.what)), "no instructions to add the school by hand");
  const one = N.where("alum", C, H, { company: "Globex" });
  assert.deepEqual(one.map(r => r.href), [N.liAlumni('"FP&A Manager"'), N.liAlumni('Globex "FP&A Manager"')]);
});

test("where builds LinkedIn searches with the query encoded, narrowed to the company picked, each with what it opens", () => {
  const C = N.ctx(IX, R, FIT, O({ cornell: true, profs: PROFS }));
  const hm = N.where("hm", C, H);
  assert.equal(hm.length, 3, "one per top employer with no company picked");
  assert.equal(hm[0].href, "https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent('Acme ("Lead" OR "principal" OR "Director") "FP&A Manager"'));
  assert.ok(hm[0].what.endsWith("LinkedIn needs an account."));
  assert.equal(N.where("hm", C, H, { company: "Globex" }).length, 1, "a company narrows to it");
  const rec = N.where("recruiter", C, H, { company: "Acme" });
  assert.ok(rec.some(r => r.label === "Handshake"));
  assert.ok(rec.filter(r => r.href.startsWith("https://example.com/")).every(r => r.label.startsWith("Acme")), "the postings of the company picked");
  assert.deepEqual(N.where("faculty", C, H).map(r => [r.href, r.external]), [["#/professor/pat-example", false], ["#/professor/sam-roster", false]]);
  assert.equal(N.where("faculty", C, { professor: p => "/p/" + p.slug }, PROFS[1])[0].href, "/p/pat-example", "H.professor may be a function");
  for (const t of N.types(true)) for (const r of N.where(t.id, C, H)) { assert.ok(r.label && r.href && r.what, `${t.id}: a label, a link and what it opens`); if (r.href.includes("linkedin.com")) assert.ok(r.what.includes("LinkedIn needs an account."), `${t.id}: the account line`); }
});

// ---------- the company, the approach ----------
test("companyOf reads what a company's postings stress against the role at large, and the person's gaps they name", () => {
  const C = N.ctx(IX, R, FIT, O());
  const P = N.companyOf(C, "Acme");
  assert.equal(P.n, 2);
  assert.deepEqual(P.stress.map(a => a.id), ["e", "b"], "Variance analysis: 2 of 2 against 0.3 of the role");
  assert.deepEqual(P.gaps.map(g => g.id), ["b"]);
  assert.deepEqual(P.levels.map(l => [l.level, l.n]), [["mid", 1], ["director", 1]]);
  assert.equal(N.companyOf(C, null).n, 0);
});

test("say: lead with, the ask, three specific questions; the words come from the data", () => {
  const C = N.ctx(IX, R, FIT, O({ cornell: true, profs: PROFS }));
  const hm = N.say("hm", C, { company: "Acme" });
  assert.equal(hm.leadWith, "Your résumé shows forecasting. Most FP&A Manager postings ask for it.");
  assert.equal(hm.ask, "Could I have 20 minutes to hear what Acme looks for in an FP&A Manager hire?");
  assert.equal(hm.questions[0], "Your FP&A Manager posting asks for budgeting & planning, rolling forecasts in particular. How does that show up in a first year?", "the company's posting, its sub-skill");
  assert.match(hm.questions[1], /^My résumé shows forecasting; your FP&A Manager postings stress variance analysis\./);
  assert.match(hm.questions[2], /^I am still building Modeling\. Which of your 2 open FP&A Manager roles/);
  const rec = N.say("recruiter", C, { company: "Acme" });
  assert.equal(rec.questions[0], "Acme has 2 open FP&A Manager postings. Which teams take new grads first?");
  assert.equal(rec.questions[1], "Of those, one sits at the Manager level. What gets a résumé past your first screen there?");
  const inr = N.say("inrole", C, { company: "Acme" });
  assert.match(inr.questions[1], /^My résumé does not show budgeting & planning yet\. How did you build it before you joined Acme\?$/);
  const fac = N.say("faculty", C, PROFS[1]);
  assert.equal(fac.ask, "Could I have 15 minutes to ask whether TEST 1010 covers budgeting & planning?");
  assert.match(fac.questions[0], /^FP&A Manager postings ask for budgeting & planning, rolling forecasts in particular\. How much of that does TEST 1010 cover\?$/);
  assert.equal(N.say("alum", C, null).ask, "Could I have 20 minutes to hear how you got from your school to FP&A Manager?");
  // a short sentence of the company's posting, when the evidence holds one
  const ev = { b: { early: [{ text: "Own the annual budget cycle with the business units.", company: "Acme", title: "FP&A Manager", url: "u" }] } };
  assert.equal(N.say("hm", N.ctx(IX, R, FIT, O({ evidence: ev })), { company: "Acme" }).questions[0], "Your FP&A Manager posting says “own the annual budget cycle with the business units”. What does that look like in a first year?");
  // no résumé: nothing is claimed about it
  const C0 = N.ctx(IX, R, null, O());
  const S0 = N.say("inrole", C0, { company: "Acme" });
  assert.equal(N.say("hm", C0, null).leadWith, "Lead with the work you have done closest to forecasting and budgeting & planning.");
  assert.ok(!S0.questions.some(q => /résumé/.test(q)), "no résumé, no sentence about it");
});

test("say holds the rules for every type and target: 20 words, no school but the alum's ask, no behaviour, generic skill or credential", () => {
  const C = N.ctx(IX, R, FIT, O({ cornell: true, profs: PROFS }));
  const names = banned(IX, GENERIC);
  assert.ok(names.includes("collaboration & teamwork") && names.includes("stakeholder management") && names.includes("mba"));
  for (const C1 of [C, N.ctx(IX, R, null, O({ cornell: true, profs: PROFS }))]) for (const t of N.types(true)) for (const target of t.id === "faculty" ? [null, PROFS[1], PROFS[0]] : [null, { company: "Globex" }, { company: "Initech" }]) {
    const S = N.say(t.id, C1, target);
    assert.equal(S.questions.length, 3, `${t.id}: three questions`);
    assert.ok([15, 20].includes(S.mins));
    assertRules(S, t.id, t.id);
    assertNoBanned(S.questions, names, t.id);
    assert.ok(S.pasteText.includes(S.ask) && S.questions.every(q => S.pasteText.includes(q)) && S.pasteText.includes(S.leadWith), `${t.id}: the paste text holds it all`);
    assert.ok(S.pasteText.startsWith(N.typeOf(t.id).label + " · "));
  }
});

test("every sentence of every COPY string is at most 20 words; none is a score or a percentage", () => {
  const flat = o => Object.values(o).flatMap(v => v && typeof v === "object" ? flat(v) : [v]).filter(v => typeof v === "string");
  for (const s of flat(N.COPY)) { for (const sentence of sentences(s)) assert.ok(wordsOf(sentence) <= 20, `"${sentence}" is over 20 words`); assert.ok(!/%|\bscore\b/i.test(s), `"${s}"`); }
  assert.equal(N.COPY.heading, "Who to meet");
  for (const k of ["lead", "leadNoResume", "openWith", "listen", "follow", "message", "add", "onList", "list"]) assert.ok(!(k in N.COPY), `${k} is gone`);
});

// ---------- the real data ----------
test("on the real Product Manager, with the sample PM résumé and with none: the context, every type's approach holds the rules", async () => {
  const Atlas = realAtlas();
  const ix = await Atlas.index(); await Atlas.product();
  const R = await Atlas.role("product.pm");
  const generic = await Atlas.genericSkills();
  const { M } = await Atlas.matcher(R);
  const text = fs.readFileSync(path.join(root, "evals", "resumes", "experienced_pm.txt"), "utf8");
  const fit = M.match(text, { jobs: R.jobs, familyJobs: R.jobs, label: R.role.label }, { ladder: R.role.ladder });
  const names = banned(ix, generic);
  assert.ok(names.includes("written & verbal communication") && names.includes("cross-functional leadership"), "the generic and behaviour names the owner saw are banned");
  assert.throws(() => assertNoBanned(["How much of your week goes to Cross-functional leadership?"], names, "the owner's example"), "the check catches the owner's example");
  for (const f of [fit, null]) {
    const C = N.ctx(ix, R, f, { cornell: true, profs: PROFS, generic, core: Atlas.TIER.core });
    assert.equal(C.role.label, "Product Manager"); assert.equal(C.field.id, "product");
    assert.ok(C.employers.length > 5 && C.employers[0].nOpen >= C.employers[1].nOpen, "employers by open postings");
    if (f) assert.ok(C.lead.length >= 2, "the PM résumé gives two or three skills to lead with");
    for (const t of N.types(true)) {
      assert.ok(N.who(t.id, C).lead, `${t.id}: who`);
      for (const r of N.where(t.id, C, H)) assert.ok(r.href && r.what, `${t.id}: where`);
      for (const target of t.id === "faculty" ? [null, PROFS[1]] : [null, ...C.employers.slice(0, 4).map(e => ({ company: e.company }))]) {
        const S = N.say(t.id, C, target);
        assertRules(S, t.id, `${t.id} ${target ? target.company || target.slug : ""}`);
        assertNoBanned(S.questions, names, `${t.id} ${target ? target.company || target.slug : ""}`);
        assert.equal(new Set(S.questions).size, 3, `${t.id}: three different questions`);
      }
    }
  }
  // an MBA role too (its own generic skills, ladders and defining skills), with no résumé
  const RM = await Atlas.role("strategy_manager"), CM = N.ctx(ix, RM, null, { generic, core: Atlas.TIER.core });
  for (const t of N.types(false)) for (const target of [null, ...CM.employers.slice(0, 3).map(e => ({ company: e.company }))]) {
    const S = N.say(t.id, CM, target);
    assertRules(S, t.id, `MBA ${t.id}`); assertNoBanned(S.questions, names, `MBA ${t.id}`);
  }
});
