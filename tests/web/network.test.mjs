// web/network.js: the pure parts of Who to meet (owner's pick N6), on a synthetic role and on the real Product Manager.
// The types, the context, who and where, what to say (never naming a school), the draft and the list helpers.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web, realAtlas } from "./_load.mjs";

const N = require(path.join(web, "network.js"));

// a small index and role in the shape Atlas gives: one field, three employers, postings at four levels
const sk = (id, name, cluster) => [id, { id, name, cluster: cluster || "craft" }];
const IX = {
  M: { level_labels: { associate: "Analyst / associate", mid: "Manager", senior: "Senior manager", staff: "Lead / principal", director: "Director" } },
  skillById: Object.fromEntries([sk("a", "Forecasting"), sk("b", "Budgeting & planning"), sk("c", "Stakeholder management"), sk("d", "Modeling (Excel, Anaplan)"), sk("e", "Variance analysis"), sk("mba", "MBA", "credentials")]),
  groups: [{ id: "finance", label: "Finance & accounting", roles: ["fpa"] }],
  roles: { fpa: { id: "fpa", label: "FP&A Manager", group: "finance", nOpen: 5, definingList: [{ id: "a", share: 0.9 }], asks: [{ id: "mba", share: 0.8 }, { id: "b", share: 0.7 }, { id: "c", share: 0.6 }, { id: "d", share: 0.55 }, { id: "e", share: 0.3 }] } },
};
const job = (id, company, title, level, extra) => ({ id, company, title, level, ladder: "corporate", family: "fpa", open: true, url: `https://example.com/${id}`, skills: [], ...extra });
const R = {
  role: IX.roles.fpa, set: "mba", levelLabels: IX.M.level_labels, ladders: { corporate: { levels: IX.M.level_labels } },
  jobs: [job(1, "Acme", "FP&A Manager", "mid"), job(2, "Acme", "Director, FP&A", "director", { sponsorship: "yes" }), job(3, "Globex", "Senior FP&A Manager", "senior"), job(4, "Globex", "Lead FP&A Analyst", "staff"), job(5, "Initech", "FP&A Analyst", "associate"), job(6, "Initech", "Old posting", "mid", { open: false })],
};
const FIT = { rows: [{ id: "a", slotName: "Forecasting", tier: "core", status: "evidenced", w: 0.9 }, { id: "b", slotName: "Budgeting & planning", tier: "core", status: "gap", w: 0.7 }, { id: "c", slotName: "Stakeholder management", tier: "core", status: "through", w: 0.6 }, { id: "d", slotName: "Modeling (Excel, Anaplan)", tier: "core", status: "thin", w: 0.55 }, { id: "e", slotName: "Variance analysis", tier: "common", status: "gap", w: 0.3 }] };
const PROFS = [{ slug: "pat-example", name: "Pat Example", title: "Professor", codes: ["TEST 1010", "TEST 2020"], gaps: [{ id: "b", name: "Budgeting & planning" }, { id: "zz", name: "Other" }] }, { slug: "sam-roster", name: "Sam Roster", title: "unknown", codes: ["TEST 3030"], gaps: [] }];
const H = { professor: "#/professor/", classes: "#/classes", skills: "#/explore" };
const sentences = s => String(s).split(/[.?!]\s+|[.?!]$/).map(x => x.trim()).filter(Boolean);
const wordsOf = s => s.split(/\s+/).filter(Boolean).length;

// ---------- the types ----------
test("five types for any school, six with a Cornell address; faculty is the one that needs it", () => {
  assert.deepEqual(N.types(false).map(t => t.id), ["hm", "inrole", "recruiter", "alum", "peer"]);
  assert.deepEqual(N.types(true).map(t => t.id), ["hm", "inrole", "recruiter", "alum", "peer", "faculty"]);
  assert.equal(N.typeOf("faculty").cornell, true);
  assert.equal(N.typeOf("nope").id, "hm", "an unknown id falls back to the first type");
  for (const t of N.TYPES) assert.ok(t.good && t.label, `${t.id} has a label and a line`);
});

// ---------- the context ----------
test("ctx reads the fit's core rows: N of M, the gaps by share, the skills to lead with", () => {
  const C = N.ctx(IX, R, FIT);
  assert.equal(C.fit.n, 2); assert.equal(C.fit.m, 4);
  assert.deepEqual(C.fit.gaps.map(g => g.id), ["b", "d"]);
  assert.deepEqual(C.say.map(s => s.id), ["a"], "lead with what the résumé shows directly");
  assert.deepEqual(C.marks, ["Forecasting"], "the defining skill is the mark");
  assert.equal(C.field.label, "Finance & accounting");
  assert.equal(C.postings.length, 5, "open postings only");
  assert.deepEqual(C.employers.map(e => [e.company, e.nOpen]), [["Acme", 2], ["Globex", 2], ["Initech", 1]]);
  assert.deepEqual(C.employers[0].roles, ["FP&A Manager"]);
  assert.deepEqual(C.levels.map(l => l.level), ["associate", "mid", "senior", "staff", "director"], "in ladder order");
  assert.equal(C.levels[1].label, "Manager");
  assert.deepEqual(C.senior.map(l => l.level), ["staff", "director"]);
  assert.deepEqual(C.junior.map(l => l.level), ["associate", "mid", "senior"]);
  assert.deepEqual(C.profs, [], "no profs without cornell");
  assert.equal(C.cornell, false);
});

test("ctx without a fit reads the role's asks against the skills shown; without those, every ask is a gap", () => {
  const C = N.ctx(IX, R, null, { shown: new Set(["c"]) });
  assert.equal(C.fit.m, 4, "the asks at the core share, the credential skipped");
  assert.equal(C.fit.n, 1);
  assert.deepEqual(C.say.map(s => s.id), ["c"]);
  const C0 = N.ctx(IX, R, null);
  assert.equal(C0.fit.n, 0); assert.equal(C0.fit.gaps.length, 4); assert.deepEqual(C0.say, []);
});

test("ctx with cornell carries the roster rows with the gaps of this role they cover; with the field's postings the employers count across it", () => {
  const C = N.ctx(IX, R, FIT, { cornell: true, profs: PROFS });
  assert.equal(C.profs.length, 2);
  assert.deepEqual(C.profs[0].covers.map(g => g.id), ["b"]);
  assert.deepEqual(C.profs[1].covers, []);
  const field = [...R.jobs, job(7, "Acme", "Treasury Manager", "mid", { family: "treasury" }), job(8, "Nobody", "FP&A Manager", "mid")];
  const C2 = N.ctx(IX, R, FIT, { fieldJobs: field });
  assert.deepEqual(C2.employers[0], { company: "Acme", nOpen: 3, roles: ["FP&A Manager"] }, "the field's open count; a role the index lacks reads as this role");
  assert.ok(!C2.employers.some(e => e.company === "Nobody"), "only employers that post this role");
});

// ---------- who, count ----------
test("who gives the lead, the titles by level, the employers and a note per type", () => {
  const C = N.ctx(IX, R, FIT, { cornell: true, profs: PROFS });
  const hm = N.who("hm", C);
  assert.deepEqual(hm.levels.map(l => l.label), ["Lead / principal", "Director"]);
  assert.deepEqual(hm.levels[0].titles, [{ title: "Lead FP&A Analyst", company: "Globex" }]);
  assert.equal(hm.employers.length, 3);
  assert.match(hm.note, /^3 employers post FP&A Manager now/);
  assert.deepEqual(N.who("inrole", C).levels.map(l => l.level), ["associate", "mid", "senior"]);
  assert.equal(N.who("recruiter", C).note, "1 of the 5 open FP&A Manager postings say they sponsor a visa.");
  assert.equal(N.who("alum", C).employers.length, 3);
  assert.deepEqual(N.who("peer", C).skills.map(s => s.id), ["b", "d"]);
  const f = N.who("faculty", C);
  assert.equal(f.profs.length, 2); assert.equal(f.profs[1].line, "Title not on the roster", "unknown is not a fact");
  const noSenior = N.ctx(IX, { ...R, jobs: R.jobs.filter(j => j.level === "mid") }, FIT);
  assert.equal(N.who("hm", noSenior).note, "No senior FP&A Manager posting is open now. Look one level up: Senior manager.");
  assert.equal(N.who("recruiter", noSenior).note, "The open FP&A Manager postings do not say they sponsor a visa. Ask.");
});

test("count is one line of what the data holds for a type", () => {
  const C = N.ctx(IX, R, FIT, { cornell: true, profs: PROFS });
  assert.equal(N.count("hm", C), "2 senior titles · 3 employers");
  assert.equal(N.count("inrole", C), "3 titles · 3 employers");
  assert.equal(N.count("recruiter", C), "3 employers · 5 open postings");
  assert.equal(N.count("faculty", C), "2 professors · 1 cover a gap");
  assert.equal(N.count("alum", C), "3 employers hiring the role");
  assert.equal(N.count("peer", C), "2 skills to split");
});

// ---------- where ----------
test("where builds LinkedIn searches with the query encoded, each with what it opens and the account line", () => {
  const C = N.ctx(IX, R, FIT, { cornell: true, profs: PROFS });
  const hm = N.where("hm", C, H);
  assert.equal(hm.length, 3, "one per top employer");
  assert.equal(hm[0].href, "https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent('Acme ("Lead" OR "principal" OR "Director") "FP&A Manager"'));
  assert.ok(!hm[0].href.includes('"') && !hm[0].href.includes("&A"), "the query is encoded");
  assert.ok(hm[0].what.endsWith("LinkedIn needs an account."));
  assert.equal(hm[0].external, true);
  assert.equal(N.where("hm", C, H, { company: "Globex" }).length, 1, "a target narrows to one company");
  const rec = N.where("recruiter", C, H);
  assert.ok(rec.some(r => r.label === "Handshake"));
  assert.ok(rec.filter(r => r.href.startsWith("https://example.com/")).length <= 3, "at most three postings");
  const alum = N.where("alum", C, H);
  assert.ok(alum[0].what.includes("Add your school under School in the filters."));
  const fac = N.where("faculty", C, H);
  assert.deepEqual(fac.map(r => [r.href, r.external]), [["#/professor/pat-example", false], ["#/professor/sam-roster", false]]);
  assert.equal(N.where("faculty", C, { professor: p => "/p/" + p.slug }, PROFS[0])[0].href, "/p/pat-example", "H.professor may be a function");
  const peer = N.where("peer", C, H);
  assert.ok(peer.some(r => r.href === "#/explore"));
  assert.ok(peer.some(r => r.href === "#/classes?open=" + encodeURIComponent("TEST 1010")), "the classes of the roster with a Cornell address");
  assert.ok(!N.where("peer", N.ctx(IX, R, FIT), H).some(r => r.href.startsWith("#/classes")), "no class links without it");
  for (const t of N.types(true)) for (const r of N.where(t.id, C, H)) { assert.ok(r.label && r.href && r.what, `${t.id}: a label, a link and what it opens`); if (r.href.includes("linkedin.com")) assert.ok(r.what.includes("LinkedIn needs an account."), `${t.id}: the account line`); }
});

// ---------- say ----------
test("say never names a school; the opener is a grad student; every sentence is at most 20 words", () => {
  const C = N.ctx(IX, R, FIT, { cornell: true, profs: PROFS });
  const targets = [null, { company: "Globex" }];
  for (const t of N.types(true)) for (const target of t.id === "faculty" ? [null, PROFS[0]] : targets) {
    const S = N.say(t.id, C, target);
    assert.equal(S.intro, "I am a grad student.");
    assert.equal(S.questions.length, 3, `${t.id}: three questions`);
    for (const k of ["aim", "proof", "ask", "listen", "follow", "subject", "close"]) assert.ok(typeof S[k] === "string" && S[k].length, `${t.id}: ${k}`);
    assert.ok([15, 20].includes(S.mins));
    const all = [S.intro, S.aim, S.proof, S.ask, ...S.questions, S.listen, S.follow, S.subject, S.close];
    for (const s of all) {
      assert.ok(!/cornell|campus/i.test(s), `${t.id}: "${s}" names the campus`);
      assert.ok(!/school/i.test(s.replace(/your school/g, "")), `${t.id}: "${s}" names a school`);
      assert.ok(!/%/.test(s), `${t.id}: "${s}" is a percentage`);
      for (const sentence of sentences(s)) assert.ok(wordsOf(sentence) <= 20, `${t.id}: "${sentence}" is over 20 words`);
    }
    if (t.id !== "alum") assert.ok(!all.some(s => /school/i.test(s)), `${t.id}: only the alum line says "your school"`);
  }
  assert.equal(N.say("hm", C, { company: "Globex" }).aim, "I am looking at FP&A Manager roles at Globex.");
  assert.equal(N.say("inrole", C, null).aim, "I want to work as an FP&A Manager.");
  assert.equal(N.say("hm", C, null).proof, "My résumé shows Forecasting.");
  assert.equal(N.say("hm", C, null).subject, "An FP&A Manager question from a grad student");
  assert.equal(N.say("faculty", C, PROFS[0]).ask, "Could I have 15 minutes to ask whether TEST 1010 covers Budgeting & planning?");
  assert.equal(N.say("peer", C, null).listen, "Listen for what they show that you do not: Budgeting & planning and Modeling.", "the bracketed examples are dropped");
  assert.equal(N.say("alum", C, null).ask, "Could I have 20 minutes to hear how you got from your school to FP&A Manager?");
  const C0 = N.ctx(IX, R, null);
  assert.equal(N.say("hm", C0, null).proof, "I am building the skills most FP&A Manager postings ask for.", "no skills shown: no empty list");
  const full = N.ctx(IX, R, { rows: FIT.rows.map(r => ({ ...r, status: "evidenced" })) });
  assert.equal(N.say("hm", full, null).listen, "Listen for what they wish they had known in their first year.", "no gaps: nothing to listen for from the résumé");
});

test("every sentence of every COPY string and type line is at most 20 words; none is a score or a percentage", () => {
  const strings = Object.values(N.COPY).concat(N.TYPES.flatMap(t => [t.label, t.good]));
  for (const s of strings) { for (const sentence of sentences(s)) assert.ok(wordsOf(sentence) <= 20, `"${sentence}" is over 20 words`); assert.ok(!/%|\bscore\b/i.test(s), `"${s}"`); }
  const C = N.ctx(IX, R, FIT);
  assert.equal(N.lead(C), "You show 2 of the 4 skills most FP&A Manager postings ask for. These people can help with the rest.");
  assert.equal(N.COPY.heading, "Who to meet");
});

// ---------- the draft, the targets, the list ----------
test("draft starts with the subject and greets by name when given, else 'there'", () => {
  const S = N.say("hm", N.ctx(IX, R, FIT), { company: "Acme" });
  const d = N.draft(S, "Sam");
  assert.ok(d.startsWith("Subject: An FP&A Manager question from a grad student\n"));
  assert.ok(d.includes("\nHi Sam,\n"));
  assert.ok(d.includes(`${S.intro} ${S.aim} ${S.proof}`));
  assert.ok(d.endsWith("\nThank you."));
  assert.ok(N.draft(S, "").includes("\nHi there,\n"));
  assert.ok(N.draft(S, "  ").includes("\nHi there,\n"));
  assert.ok(!/cornell|campus|school/i.test(d));
});

test("targetsOf: companies for the employer types, professors for faculty, none for a classmate", () => {
  const C = N.ctx(IX, R, FIT, { cornell: true, profs: PROFS });
  assert.deepEqual(N.targetsOf("hm", C).map(t => t.key), ["Acme", "Globex", "Initech"]);
  assert.equal(N.targetsOf("hm", C)[0].label, "Acme · 2 open");
  assert.deepEqual(N.targetsOf("hm", C)[0].row, { company: "Acme" });
  assert.deepEqual(N.targetsOf("faculty", C).map(t => t.key), ["pat-example", "sam-roster"]);
  assert.deepEqual(N.targetsOf("peer", C), []);
});

test("the list helpers are pure over arrays and tell chats apart by role, type and key", () => {
  const a = { role: "fpa", type: "hm", key: "Acme", label: "Acme" }, b = { role: "fpa", type: "hm", key: null };
  let list = [];
  list = N.listAdd(list, a);
  assert.deepEqual(list, [a]);
  assert.equal(N.listHas(list, a), true);
  assert.equal(N.listHas(list, b), false, "no key is another chat");
  assert.equal(N.listHas(list, { role: "fpa", type: "hm", key: "Acme" }), true, "the label is not part of the identity");
  const same = N.listAdd(list, { ...a, label: "x" });
  assert.equal(same.length, 1, "adding the same chat twice keeps one");
  assert.notEqual(same, list, "a new array");
  list = N.listAdd(list, b);
  assert.deepEqual(list.map(x => x.key), ["Acme", null]);
  assert.equal(list[1].label, "", "a missing label is empty");
  list = N.listRemove(list, a);
  assert.deepEqual(list, [{ role: "fpa", type: "hm", key: null, label: "" }]);
  assert.deepEqual(N.listRemove(list, a), list, "removing what is not there changes nothing");
  assert.deepEqual(N.listAdd(null, a), [a]);
});

// ---------- the real data ----------
test("on the real Product Manager: the context, every type's say and draft hold the rules", async () => {
  const Atlas = realAtlas();
  const ix = await Atlas.index();
  const R = await Atlas.role("product.pm");
  for (const fit of [null, { rows: [] }]) {
    const C = N.ctx(ix, R, fit, { cornell: true, profs: PROFS });
    assert.equal(C.role.label, "Product Manager");
    assert.equal(C.field.id, "product");
    assert.ok(C.employers.length > 5 && C.employers[0].nOpen >= C.employers[1].nOpen, "employers by open postings");
    assert.ok(C.levels.length >= 4 && C.senior.length && C.junior.length);
    assert.ok(C.levels.every(l => l.label && l.label !== l.level), "level labels, not keys");
    if (!fit) assert.ok(C.fit.m >= 5 && C.fit.n === 0, "no fit: the asks are the gaps");
    for (const t of N.types(true)) {
      const w = N.who(t.id, C); assert.ok(w.lead, `${t.id}: who`);
      assert.ok(N.count(t.id, C), `${t.id}: count`);
      for (const r of N.where(t.id, C, H)) assert.ok(r.href && r.what, `${t.id}: where`);
      for (const target of t.id === "faculty" ? [null, PROFS[0]] : [null, { company: C.employers[1].company }]) {
        const S = N.say(t.id, C, target);
        const all = [S.intro, S.aim, S.proof, S.ask, ...S.questions, S.listen, S.follow, S.subject, S.close];
        for (const s of all) {
          assert.ok(!/cornell|campus/i.test(s) && !/school/i.test(s.replace(/your school/g, "")), `${t.id}: "${s}" names a school`);
          assert.ok(!/%/.test(s), `${t.id}: "${s}"`);
          for (const sentence of sentences(s)) assert.ok(wordsOf(sentence) <= 20, `${t.id}: "${sentence}" is over 20 words`);
        }
        assert.ok(N.draft(S, "Sam").startsWith("Subject: "));
      }
    }
  }
});
