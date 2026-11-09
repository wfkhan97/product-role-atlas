// web/network.js: the pure parts of Who to meet (owner's pick N6, reshaped by the owner's feedback of 2026-11-01), on a
// synthetic role and on the real Product Manager. The types per campus flag, the context, who and where (the alumni
// search with the flag's school filter),
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
test("three types with no campus flag, the alum for any flag, faculty for a flag whose roster is loaded; no classmate", () => {
  assert.deepEqual(N.types(null, false).map(t => t.id), ["hm", "inrole", "recruiter"]);
  assert.deepEqual(N.types(null, true).map(t => t.id), ["hm", "inrole", "recruiter"], "no flag, no school types");
  assert.deepEqual(N.types("ienyc", false).map(t => t.id), ["hm", "inrole", "recruiter", "alum"], "IE before its roster: the alum, no faculty");
  assert.deepEqual(N.types("cornell", true).map(t => t.id), ["hm", "inrole", "recruiter", "alum", "faculty"]);
  assert.deepEqual(N.types("ienyc", true).map(t => t.id), ["hm", "inrole", "recruiter", "alum", "faculty"]);
  assert.equal(N.typeOf("faculty").roster, true); assert.equal(N.typeOf("alum").campus, true);
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
  assert.equal(C.craft.find(a => a.id === "d").said, "modeling", "a tool named with examples in brackets is a category: lower case, the brackets go");
  assert.deepEqual(C.craftGaps.map(g => g.id), ["b", "d"]);
  assert.equal(C.read, true);
  assert.ok(C.shownAll.includes("a") && C.shownAll.includes("c"));
  assert.equal(C.field.label, "Finance & accounting");
  assert.equal(C.postings.length, 5, "open postings only");
  assert.deepEqual(C.employers.map(e => [e.company, e.nOpen]), [["Acme", 2], ["Globex", 2], ["Initech", 1]]);
  assert.deepEqual(C.levels.map(l => l.level), ["associate", "mid", "senior", "staff", "director"], "in ladder order");
  assert.deepEqual(C.senior.map(l => l.level), ["staff", "director"]);
  assert.deepEqual(C.profs, [], "no profs without a roster");
  assert.deepEqual(N.ctx(IX, R, FIT, O({ flag: "cornell", roster: false, profs: PROFS })).profs, [], "a flag with no roster: no profs");
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
  const C = N.ctx(IX, R, FIT, O({ flag: "cornell", roster: true, profs: PROFS }));
  assert.deepEqual(C.profs.map(p => p.slug), ["pat-example", "sam-roster"], "the most gaps covered first");
  assert.deepEqual(C.profs[0].covers.map(g => g.id), ["b"]);
  assert.deepEqual(C.profs[0].teach.map(g => g.said), ["budgeting & planning"]);
});

// ---------- who, the Find jobs link, the targets ----------
test("who gives the titles by level and the five employers, with no lead (owner's feedback 2026-11-01) and no note; faculty sorted by gaps covered", () => {
  const C = N.ctx(IX, R, FIT, O({ flag: "cornell", roster: true, profs: PROFS }));
  const hm = N.who("hm", C);
  for (const t of N.types("cornell", true)) assert.equal(N.who(t.id, C).lead, "", `${t.id}: the list speaks for itself`);
  assert.deepEqual(hm.levels.map(l => l.label), ["Lead / principal", "Director"]);
  assert.equal(hm.employers.length, 3); assert.ok(!("note" in hm));
  assert.deepEqual(N.who("inrole", C).levels.map(l => l.level), ["associate", "mid", "senior"]);
  for (const t of N.types("cornell", true)) assert.ok(!("note" in N.who(t.id, C)), `${t.id}: no note`);
  const f = N.who("faculty", C);
  assert.deepEqual(f.profs.map(p => p.name), ["Pat Example", "Sam Roster"]);
  assert.equal(f.profs[1].line, "Title not on the roster", "unknown is not a fact");
  const noSenior = N.ctx(IX, { ...R, jobs: R.jobs.filter(j => j.level === "mid") }, FIT, O());
  assert.equal(N.who("hm", noSenior).lead, "No senior FP&A Manager posting is open now. Look one level up: Senior manager.", "the one line left: it stands in for an empty list");
});

test("jobsHref opens Find jobs with the field and the role set, in the order jobs.js writes them", () => {
  const J = require(path.join(web, "jobs.js"));
  const C = N.ctx(IX, R, FIT, O());
  assert.equal(N.jobsHref(C), "#/jobs?field=finance&role=fpa");
  const s = J.parseState(N.jobsHref(C));
  assert.equal(s.role, "fpa"); assert.equal(s.field, "finance");
  assert.equal("#/jobs?" + J.stateQuery(s), N.jobsHref(C), "the jobs screen keeps the link as it is");
});

test("targetsOf: the employers by open postings for the employer types, the name as the label and '2 open' as the hint (a pick left '· 2 open' in the box), the professors for faculty", () => {
  const C = N.ctx(IX, R, FIT, O({ flag: "cornell", roster: true, profs: PROFS }));
  assert.deepEqual(N.targetsOf("hm", C).map(t => t.key), ["Acme", "Globex", "Initech"]);
  assert.equal(N.targetsOf("recruiter", C)[0].label, "Acme");
  assert.equal(N.targetsOf("recruiter", C)[0].hint, "2 open");
  assert.deepEqual(N.targetsOf("hm", C)[0].row, { company: "Acme" });
  const f = N.targetsOf("faculty", C);
  assert.deepEqual(f.map(t => t.key), ["pat-example", "sam-roster"]);
  assert.equal(f[0].hint, "covers 1 of your gaps"); assert.equal(f[1].hint, "TEST 3030");
});

test("with no résumé, the professors sort by the role's core asks their classes teach, then name, and say so", () => {
  assert.deepEqual(N.askRows(IX, R, 0.5).map(a => [a.id, a.tier]), [["a", "core"], ["col", "core"], ["b", "core"], ["c", "core"], ["d", "core"]], "the core asks, the credential left out");
  // the roster read against the asks: Zed teaches two asks, Pat one, Sam none
  const rows = [{ slug: "sam", name: "Sam Roster", codes: ["T 3"], gaps: [] }, { slug: "pat", name: "Pat Example", codes: ["T 1"], gaps: [{ id: "b", name: "Budgeting & planning" }] }, { slug: "zed", name: "Zed Last", codes: ["T 2"], gaps: [{ id: "a", name: "Forecasting" }, { id: "d", name: "Modeling" }] }];
  const C = N.ctx(IX, R, null, O({ flag: "cornell", roster: true, profs: rows }));
  assert.equal(C.read, false);
  assert.deepEqual(C.profs.map(p => [p.slug, p.asks.length]), [["zed", 2], ["pat", 1], ["sam", 0]], "most asks taught first, not by name");
  const f = N.who("faculty", C).profs;
  assert.deepEqual([f[0].asks.length, f[0].nAsks, f[0].read], [2, 5, false]);
  // the count says what "asks" are in plain words (the usability pass, 2026-11-06: the Faculty tab's "asks")
  assert.equal(N.fill(N.COPY.teachesOf, { n: 2, m: 5 }), "teaches 2 of the 5 skills this role's postings ask for most");
  assert.equal(N.targetsOf("faculty", C)[0].hint, "teaches 2 of the 5 skills this role's postings ask for most");
  // with a résumé the gaps sort stays
  const Cr = N.ctx(IX, R, FIT, O({ flag: "cornell", roster: true, profs: rows }));
  assert.deepEqual(Cr.profs.map(p => [p.slug, p.covers.length]), [["pat", 1], ["zed", 1], ["sam", 0]], "gaps covered (Forecasting is shown, so Zed covers one), then name");
});

// ---------- where ----------
test("the alum search is LinkedIn's people search filtered to the flag's schools: Cornell's three, as the owner tested them", () => {
  assert.deepEqual(N.SCHOOLS.cornell, ["3554137", "3523", "3323650"]);
  assert.deepEqual(N.CORNELL_SCHOOLS, N.SCHOOLS.cornell);
  assert.deepEqual(N.SCHOOLS.ienyc, ["740718", "5141380", "2816303", "2816341"], "IE's four school pages, from the owner's search of 2026-11-04");
  assert.equal(N.liAlumni('"Product Manager"', "cornell"), "https://www.linkedin.com/search/results/people/?keywords=%22Product%20Manager%22&origin=FACETED_SEARCH&schoolFilter=%5B%223554137%22%2C%223523%22%2C%223323650%22%5D");
  const C = N.ctx(IX, R, FIT, O({ flag: "cornell" }));
  const alum = N.where("alum", C);
  assert.equal(alum[0].href, N.liAlumni('"FP&A Manager"', "cornell"));
  assert.equal(alum[0].label, "FP&A Manager · Cornell alumni");
  assert.equal(alum[1].href, N.liAlumni('Acme "FP&A Manager"', "cornell"), "the company-narrowed variant keeps the school filter");
  assert.equal(alum[1].label, "Acme · FP&A Manager · Cornell alumni");
  const one = N.where("alum", C, { company: "Globex" });
  assert.deepEqual(one.map(r => r.href), [N.liAlumni('"FP&A Manager"', "cornell"), N.liAlumni('Globex "FP&A Manager"', "cornell")]);
});

test("the school filter per flag: an empty id list builds the plain people search; the label names the flag's school", () => {
  assert.equal(N.liAlumni('"X"', "ienyc"), N.liPeople('"X"') + "&origin=FACETED_SEARCH&schoolFilter=" + encodeURIComponent(JSON.stringify(N.SCHOOLS.ienyc)), "the IE search carries IE's ids and no Cornell id");
  assert.ok(!N.liAlumni('"X"', "ienyc").includes("3554137"));
  assert.equal(N.liAlumni('"X"', null), N.liPeople('"X"'));
  assert.equal(N.liAlumni('"X"', "nowhere"), N.liPeople('"X"'));
  // with an IE id filled in, the IE search carries it and no Cornell id
  const keep = N.SCHOOLS.ienyc.slice();
  try {
    N.SCHOOLS.ienyc.splice(0, N.SCHOOLS.ienyc.length, "999");
    assert.equal(N.liAlumni('"X"', "ienyc"), N.liPeople('"X"') + "&origin=FACETED_SEARCH&schoolFilter=" + encodeURIComponent('["999"]'));
  } finally { N.SCHOOLS.ienyc.splice(0, N.SCHOOLS.ienyc.length, ...keep); }
  const ie = N.where("alum", N.ctx(IX, R, FIT, O({ flag: "ienyc" })));
  assert.equal(ie[0].label, "FP&A Manager · IE alumni");
  assert.ok(!ie.some(r => /cornell/i.test(r.label)), "an IE address sees no Cornell label");
  assert.equal(N.where("alum", N.ctx(IX, R, FIT, O()))[0].label, "FP&A Manager · alumni", "no flag: alumni, no school");
  assert.deepEqual(Object.keys(N.COPY.schools), ["cornell", "ienyc"]);
});

test("where builds LinkedIn searches with the query encoded, narrowed to the company picked: a label and a link, no line on what it opens", () => {
  const C = N.ctx(IX, R, FIT, O({ flag: "cornell", roster: true, profs: PROFS }));
  const hm = N.where("hm", C);
  assert.equal(hm.length, 3, "one per top employer with no company picked");
  assert.equal(hm[0].href, "https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent('Acme ("Lead" OR "principal" OR "Director") "FP&A Manager"'));
  assert.equal(N.where("hm", C, { company: "Globex" }).length, 1, "a company narrows to it");
  const rec = N.where("recruiter", C, { company: "Acme" });
  assert.ok(rec.some(r => r.label === "Handshake"));
  assert.ok(rec.filter(r => r.href.startsWith("https://example.com/")).every(r => r.label.startsWith("Acme")), "the postings of the company picked");
  assert.deepEqual(N.where("faculty", C), [], "faculty have no where: the professor's name links to the card");
  for (const t of N.types("cornell", true)) for (const r of N.where(t.id, C)) assert.deepEqual(Object.keys(r).sort(), ["href", "label"], `${t.id}: a label and a link, nothing more`);
  for (const k of ["whereNote", "linkedin"]) assert.ok(!(k in N.COPY), `${k} is gone`);
  for (const k of ["hm", "inrole", "recruiter", "posting", "handshakeLine", "alum", "alumAt", "professor"]) assert.ok(!(k in N.COPY.whereLines), `whereLines.${k} is gone`);
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
  const C = N.ctx(IX, R, FIT, O({ flag: "cornell", roster: true, profs: PROFS }));
  const hm = N.say("hm", C, { company: "Acme" });
  assert.equal(hm.leadWith, "Your résumé shows forecasting. Most FP&A Manager postings ask for it.");
  assert.equal(hm.ask, "Could I have 20 minutes to hear what Acme looks for in an FP&A Manager hire?");
  assert.equal(hm.questions[0], "Your FP&A Manager posting asks for budgeting & planning, rolling forecasts in particular. How does that show up in a first year?", "the company's posting, its sub-skill");
  assert.match(hm.questions[1], /^My résumé shows forecasting; your FP&A Manager postings stress variance analysis\./);
  assert.match(hm.questions[2], /^I am still building modeling\. Which of your 2 open FP&A Manager roles/);
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
  const C = N.ctx(IX, R, FIT, O({ flag: "cornell", roster: true, profs: PROFS }));
  const names = banned(IX, GENERIC);
  assert.ok(names.includes("collaboration & teamwork") && names.includes("stakeholder management") && names.includes("mba"));
  for (const C1 of [C, N.ctx(IX, R, null, O({ flag: "cornell", roster: true, profs: PROFS }))]) for (const t of N.types("cornell", true)) for (const target of t.id === "faculty" ? [null, PROFS[1], PROFS[0]] : [null, { company: "Globex" }, { company: "Initech" }]) {
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
    const C = N.ctx(ix, R, f, { flag: "cornell", roster: true, profs: PROFS, generic, core: Atlas.TIER.core });
    assert.equal(C.role.label, "Product Manager"); assert.equal(C.field.id, "product");
    assert.ok(C.employers.length > 5 && C.employers[0].nOpen >= C.employers[1].nOpen, "employers by open postings");
    if (f) assert.ok(C.lead.length >= 2, "the PM résumé gives two or three skills to lead with");
    for (const t of N.types("cornell", true)) {
      const W = N.who(t.id, C);
      assert.ok(W.levels.length || W.employers.length || (W.profs || []).length, `${t.id}: who`);
      for (const r of N.where(t.id, C)) assert.ok(r.href && r.label, `${t.id}: where`);
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
  for (const t of N.types("ienyc", false)) for (const target of [null, ...CM.employers.slice(0, 3).map(e => ({ company: e.company }))]) {
    const S = N.say(t.id, CM, target);
    assertRules(S, t.id, `MBA ${t.id}`); assertNoBanned(S.questions, names, `MBA ${t.id}`);
  }
});

// ---------- the usability pass of 2026-11-06 (cluster 8, Networking) ----------
// a role whose employers by open postings are not in alphabetical order: Zeta has the most, then Yotta; Acme and Beta,
// first in the alphabet, have one posting each. The set's ladder names its mid level after another role.
const IX2 = {
  M: { level_labels: { associate: "Analyst / associate", mid: "Manager", senior: "Senior manager", staff: "Lead / principal" } },
  skillById: Object.fromEntries([sk("a", "Process design & operational rigor", "method"), sk("k", "Metrics & KPIs", "method"), sk("ai", "AI / machine learning", "technical"), sk("x", "Excel modeling", "tool"), sk("py", "Python / R / scripting", "technical")]),
  groups: [{ id: "product", label: "Product", roles: ["product.pm", "product.pmm"] }],
  roles: { "product.pm": { id: "product.pm", label: "Product Manager", group: "product", definingList: [], asks: [{ id: "a", share: 0.8 }, { id: "k", share: 0.7 }, { id: "ai", share: 0.6 }] }, "product.pmm": { id: "product.pmm", label: "Product Marketing Manager", group: "product", definingList: [], asks: [{ id: "a", share: 0.8 }, { id: "k", share: 0.7 }, { id: "ai", share: 0.6 }] } },
};
const LADDER = { associate: "Associate / APM", mid: "Product Manager", senior: "Senior", staff: "Staff / Principal / Lead" };
const pj = (id, company, title, level, country) => ({ id, company, title, level, family: "pmm", open: true, url: `https://example.com/${id}`, country: country || "United States", skills: [], sub: [] });
const R2 = {
  role: IX2.roles["product.pmm"], levelLabels: LADDER,
  jobs: [pj(1, "Acme", "Acme Senior PMM", "senior"), pj(2, "Beta", "Beta PMM", "mid"), pj(3, "Yotta", "Principal PMM", "staff"), pj(4, "Yotta", "PMM, Ads", "mid"), pj(5, "Yotta", "Senior PMM, Ads", "senior"),
    pj(6, "Zeta", "Senior PMM, Cloud", "senior", "India"), pj(7, "Zeta", "Senior PMM, Devices", "senior"), pj(8, "Zeta", "PMM Intern", "associate"), pj(9, "Zeta", "PMM, Search", "mid"), pj(10, "Zeta", "Lead PMM", "staff")],
};

test("who: the level rows' titles come from the employers the list shows, most open postings first, a US posting first (C-15, titles from the alphabet's first companies)", () => {
  const C = N.ctx(IX2, R2, null, {});
  assert.deepEqual(C.employers.map(e => e.company), ["Zeta", "Yotta", "Acme", "Beta"]);
  const W = N.who("inrole", C), senior = W.levels.find(l => l.level === "senior");
  assert.deepEqual(senior.titles.map(t => t.company), ["Zeta", "Yotta", "Acme"], "one title per employer first, in the list's order");
  assert.equal(senior.titles[0].title, "Senior PMM, Devices", "Zeta's US posting before its posting in India");
  assert.equal(W.levels.find(l => l.level === "mid").titles[0].company, "Zeta", "not Beta, first in the alphabet");
  for (const l of N.who("hm", C).levels) assert.equal(l.titles[0].company, "Zeta", `${l.label}: the top employer's title leads`);
});

test("who: a listed employer's one posting abroad at a level sits behind a US title, rank order holding within each group", () => {
  // Zeta (the top employer) has only a posting in India at staff; Yotta's US staff posting leads the row, Zeta's follows
  const abroad = { ...R2, jobs: R2.jobs.map(j => j.id === 10 ? { ...j, country: "India" } : j) };
  const C = N.ctx(IX2, abroad, null, {});
  assert.equal(C.employers[0].company, "Zeta");
  const staff = N.who("hm", C).levels.find(l => l.level === "staff");
  assert.deepEqual(staff.titles.map(x => x.company), ["Yotta", "Zeta"], "the US title first, then the one abroad");
  const senior = C.levels.find(l => l.level === "senior");
  assert.deepEqual(senior.titles.map(x => x.company).slice(0, 3), ["Zeta", "Yotta", "Acme"], "a level with US postings keeps the rank order");
});

test("where: the recruiter's posting links are at the person's level, the entry level when none is given; no link twice (C-16, senior postings for a new grad)", () => {
  const C = N.ctx(IX2, R2, null, {});
  const links = o => N.where("recruiter", C, null, o).filter(r => r.href.startsWith("https://example.com/")).map(r => r.label);
  assert.deepEqual(links(), ["Zeta · PMM Intern", "Zeta · PMM, Search", "Yotta · PMM, Ads"], "entry level first, then the nearest level up, the top employers first");
  assert.deepEqual(links({ level: "staff" }), ["Zeta · Lead PMM", "Yotta · Principal PMM", "Zeta · Senior PMM, Devices"], "a person aiming at staff sees staff postings first");
  assert.deepEqual(N.where("recruiter", C, { company: "Yotta" }).filter(r => r.href.startsWith("https://example.com/")).map(r => r.label), ["Yotta · PMM, Ads", "Yotta · Senior PMM, Ads", "Yotta · Principal PMM"], "one company: its lowest level first");
  const twice = { ...R2, jobs: [...R2.jobs, { ...R2.jobs[7], id: 11 }] };
  const L = N.where("recruiter", N.ctx(IX2, twice, null, {}), null).map(r => r.label);
  assert.equal(new Set(L).size, L.length, "the same company and title are linked once");
});

test("a level row is never labelled with another role's name: the product ladder's \"Product Manager\" reads \"Manager\" on a PMM row (C-18)", () => {
  const C = N.ctx(IX2, R2, null, {});
  assert.deepEqual(C.levels.map(l => l.label), ["Associate / APM", "Manager", "Senior", "Staff / Principal / Lead"]);
  assert.equal(N.levelLabel(IX2, { ...R2, role: IX2.roles["product.pm"] }, { level: "mid" }), "Product Manager", "on the Product Manager's own rows the word is its own");
  assert.equal(C.levelLabels.mid, "Manager", "the hiring manager's \"one level up\" reads the same word");
  const noSet = { ...IX2, M: {} };
  assert.equal(N.levelLabel(noSet, R2, { level: "mid" }), "mid", "no set word: the level id, never the other role's name");
});

test("a professor's row names the skills as the middle of a sentence says them; an acronym keeps its capitals (C-19)", () => {
  assert.deepEqual(N.sentenceCase(["Process design & operational rigor", "Metrics & KPIs", "AI / machine learning", "Python / R / scripting", "Prioritization & trade-offs"]), ["process design & operational rigor", "metrics & KPIs", "AI / machine learning", "Python / R / scripting", "prioritization & trade-offs"]);
  assert.deepEqual(N.sentenceCase(["Excel modeling"], "tool"), ["Excel modeling"], "a tool keeps its capital");
  assert.deepEqual(N.sentenceCase(["Analytics tools (Amplitude, Mixpanel)"], "tool"), ["analytics tools"], "a tool named with examples in brackets is a category: lower case");
  assert.equal(N.inText("Tableau", "tool"), "Tableau");
  const profs = [{ slug: "p", name: "Pat", title: "Lecturer", codes: ["T 1"], gaps: [{ id: "a", name: "Process design & operational rigor" }, { id: "k", name: "Metrics & KPIs" }, { id: "ai", name: "AI / machine learning" }, { id: "zz", name: "Unknown Skill" }] }];
  const C = N.ctx(IX2, R2, null, { roster: true, profs, shown: [] });
  const P = N.who("faculty", C).profs[0];
  assert.deepEqual(P.names, ["process design & operational rigor", "metrics & KPIs", "AI / machine learning"]);
  for (const n of P.names) assert.ok(!/^[A-Z][a-z]/.test(n), `"${n}" starts with a capital mid-sentence`);
});

test("on the real Product Marketing Manager no level row says \"Product Manager\", and the titles come from the listed employers (C-15, C-18)", async () => {
  const Atlas = realAtlas();
  const ix = await Atlas.index(); await Atlas.product();
  const R = await Atlas.role("product.pmm"), C = N.ctx(ix, R, null, {});
  for (const t of ["hm", "inrole", "alum"]) for (const l of N.who(t, C).levels) assert.notEqual(l.label, "Product Manager", `${t}: ${l.level}`);
  const pm = N.ctx(ix, await Atlas.role("product.pm"), null, {});
  assert.ok(pm.levels.some(l => l.label === "Product Manager"), "the Product Manager keeps its own word");
  const W = N.who("hm", pm), listed = new Set(W.employers.map(e => e.company));
  for (const l of W.levels) {
    const any = pm.postings.some(j => j.level === l.level && listed.has(j.company));
    if (any) assert.ok(listed.has(l.titles[0].company), `${l.label}: "${l.titles[0].company}" is not a listed employer`);
  }
});
