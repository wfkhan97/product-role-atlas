/* Networking: the pure parts of "Who to meet" (owner's pick N6, 2026-10-31). The people a grad student meets for one
   role, and what the site builds for each from the data it has: the role's asks, the fit's gaps and shown skills, the
   postings' titles and levels, the employers hiring the role, and the campus roster when the door's email opens it.
   The site names no person outside that roster. Every "where" is a search the person runs, built from data, with a
   line that says what it opens. No draft names a school: the opener is "I am a grad student." everywhere.
   No DOM, no fetch, no storage: every function takes the index (`ix`), a role (`R` from Atlas.role), a fit or plain
   arrays, and gives structures and plain-text strings the screen draws. Loads as a classic script (window.Network)
   and in node (require("web/network.js")). Nothing here is a score or a percentage.
   The fixed strings are web/copy.js (Copy.network): COPY and TYPES here are views over that table; the sentences
   say(), who() and count() build from the data stay here. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root.Copy || require("./copy.js"));
  else root.Network = factory(root.Copy);
})(typeof self !== "undefined" ? self : this, function (Copy) {
  "use strict";
  const enc = encodeURIComponent;
  const fmt = n => Number(n || 0).toLocaleString("en-US");
  const join = xs => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];
  const fill = Copy.fill;
  // "a" or "an" before a name, by its sound ("an FP&A Manager", "a Product Manager", "an HR Manager")
  const an = x => (/^[AEIOU]/i.test(x) || /^[FHLMNRSX](?![a-z])/.test(x) ? "an " : "a ") + x;
  const An = x => an(x).replace(/^a/, "A");
  // a skill name as a sentence says it: the examples in brackets dropped ("ERP & finance systems (SAP, Oracle)")
  const short = name => String(name || "").replace(/\s*\(.*?\)/g, "").trim();

  // ---------- the people types ----------
  // id, label, what each is good for (one line, Copy.network.types); cornell: true means the type shows only when the
  // door opens Cornell
  const TYPES = ["hm", "inrole", "recruiter", "alum", "peer", "faculty"].map(id => ({ id, label: Copy.network.types[id].label, good: Copy.network.types[id].good, ...(id === "faculty" ? { cornell: true } : {}) }));
  const types = cornell => TYPES.filter(t => cornell || !t.cornell);
  const typeOf = id => TYPES.find(t => t.id === id) || TYPES[0];

  // the screen's strings (web/copy.js, Copy.network); {name} slots are filled with fill()
  const COPY = Copy.network;
  const WHO = COPY.whoLines, WHERE = COPY.whereLines, SAY = COPY.say;

  // ---------- the context: one role, the person's fit, the employers, the titles, the professors ----------
  const LEVELS = ["associate", "mid", "senior", "staff", "group", "director", "vp", "cpo"];
  const SENIOR = new Set(["staff", "group", "director", "vp", "cpo"]);   // the lead step, as Atlas.stepOf reads it
  const SHOWN = new Set(["evidenced", "transferable", "through"]);
  const skill = (ix, id) => (ix.skillById || {})[id] || null;
  const credential = (ix, id) => { const s = skill(ix, id); return !s || s.cluster === "credentials"; };
  // the skills most of the role's postings ask for, from the index: defining first, then the asks at the core share
  const coreAsks = (ix, role, core) => [...(role.definingList || []), ...(role.asks || [])].filter(a => a.share >= core && !credential(ix, a.id)).map(a => ({ id: a.id, name: skill(ix, a.id).name, share: a.share }));
  // the level label of a posting, as the role page shows it (its ladder's word, else the set's)
  const levelLabel = (ix, R, j) => { const lad = R.ladders && R.ladders[j.ladder]; return (lad && lad.levels[j.level]) || (R.levelLabels || {})[j.level] || ((ix.M || {}).level_labels || {})[j.level] || j.level; };
  const lv = l => { const i = LEVELS.indexOf(l); return i < 0 ? LEVELS.length : i; };
  // o: { cornell, shown: Set of skill ids (a rough read, when no fit), profs: campus roster rows, fieldJobs: the
  // field's postings (Atlas.fieldJobs) for the employers' counts across the field, core: the core share (0.5) }
  function ctx(ix, R, fit, o) {
    o = o || {};
    const role = R.role, core = o.core || 0.5;
    const field = ix.groups.find(g => g.id === role.group) || null;
    const asks = coreAsks(ix, role, core);
    // the fit: the match result's core rows when there is one, else the role's asks read against the skills shown
    let F;
    if (fit && fit.rows) {
      const rows = fit.rows.filter(x => x.tier === "core");
      const shown = rows.filter(x => SHOWN.has(x.status)).map(x => ({ id: x.id, name: x.slotName || x.name, share: x.w, status: x.status }));
      const gaps = rows.filter(x => !SHOWN.has(x.status)).sort((a, b) => (b.w || 0) - (a.w || 0)).map(x => ({ id: x.id, name: x.slotName || x.name, share: x.w, status: x.status }));
      F = { n: shown.length, m: rows.length, gaps, shown, real: true };
    } else {
      const have = o.shown instanceof Set ? o.shown : new Set(o.shown || (fit && fit.shown) || []);
      const shown = asks.filter(a => have.has(a.id)).map(a => ({ ...a, status: "evidenced" })), gaps = asks.filter(a => !have.has(a.id));
      F = { n: shown.length, m: asks.length, gaps, shown, real: false };
    }
    // what to lead with: the skills the résumé shows directly, else any it shows, by share
    const direct = F.shown.filter(s => s.status === "evidenced");
    const say = [...(direct.length ? direct : F.shown)].sort((a, b) => (b.share || 0) - (a.share || 0)).slice(0, 3);
    // the role's marks: what sets it apart in its field (its defining skills), else the asks after the first three
    const defining = (role.definingList || []).filter(d => !credential(ix, d.id)).map(d => skill(ix, d.id).name);
    const marks = defining.length ? defining.slice(0, 3) : asks.slice(3, 6).map(a => a.name);
    // the postings open now, the employers by their open postings, the titles by level
    const postings = (R.jobs || []).filter(j => j.open !== false);
    const employers = employersOf(ix, role, postings, o.fieldJobs);
    const byLevel = {};
    for (const j of postings) {
      const l = byLevel[j.level] ||= { level: j.level, label: levelLabel(ix, R, j), n: 0, titles: [] };
      l.n++;
      if (l.titles.length < 5 && !l.titles.some(t => t.title === j.title)) l.titles.push({ title: j.title, company: j.company });
    }
    const levels = Object.values(byLevel).sort((a, b) => lv(a.level) - lv(b.level));
    const senior = levels.filter(l => SENIOR.has(l.level)), junior = levels.filter(l => !SENIOR.has(l.level));
    // the professors: the campus roster rows, each with the gaps of this role their classes cover
    const gapIds = new Set(F.gaps.map(g => g.id));
    const profs = (o.cornell ? o.profs || [] : []).map(p => ({ ...p, codes: p.codes || [], gaps: p.gaps || [], covers: (p.gaps || []).filter(g => gapIds.has(g.id)) }));
    const build = F.gaps.slice(0, 3);
    // the word for each level on this role's ladder, for "one level up"
    const levelLabels = Object.fromEntries(LEVELS.map(l => [l, levelLabel(ix, R, { level: l, ladder: role.ladder })]));
    return { role, field, asks, fit: F, say, marks, employers, levels, senior, junior, postings, profs, build, levelLabels, cornell: !!o.cornell };
  }
  // the employers hiring the role, by open postings: with the field's postings, each carries its open count across
  // the field and the roles it posts; without, the role's own postings
  function employersOf(ix, role, postings, fieldJobs) {
    const own = new Set(postings.map(j => j.company));
    const by = {};
    const jobs = fieldJobs && fieldJobs.length ? fieldJobs.filter(j => j.open !== false && own.has(j.company)) : postings;
    for (const j of jobs) { const e = by[j.company] ||= { company: j.company, nOpen: 0, roles: new Set() }; e.nOpen++; e.roles.add(j.family); }
    const labelOf = f => { const r = ix.roles[f] || ix.roles["product." + f]; return r ? r.label : role.label; };
    return Object.values(by).map(e => ({ company: e.company, nOpen: e.nOpen, roles: [...e.roles].map(labelOf).filter((x, i, a) => a.indexOf(x) === i) })).sort((a, b) => b.nOpen - a.nOpen || a.company.localeCompare(b.company));
  }
  const gap = (C, i) => short((C.fit.gaps[i] || C.fit.gaps[0] || { name: "the skills most postings ask for" }).name);
  const ask = (C, i) => short((C.asks[i] || C.asks[0] || { name: "the skills most postings ask for" }).name);
  const mark = (C, i) => short(C.marks[i] || C.marks[0] || ask(C, 3));
  const emp = (C, i) => (C.employers[i] || C.employers[0] || { company: "a company hiring this role" }).company;
  const nTitles = levels => levels.reduce((n, l) => n + l.n, 0);
  const nextLevel = C => { const top = C.levels.length ? C.levels[C.levels.length - 1].level : "mid"; const l = LEVELS[Math.min(lv(top) + 1, LEVELS.length - 1)]; const w = (C.levelLabels || {})[l]; return w && w !== l ? w : "one level up"; };
  // "unknown" and the roster's footnotes are not facts (as the professor card reads them)
  const fact = v => v && v !== "unknown" && !/per roster|course descriptions only/i.test(v) ? v : null;
  const profLine = p => fact(p.title) || fact(p.affiliation) || "Title not on the roster";

  // ---------- who to look for ----------
  // { lead, levels: [{ label, titles: [{ title, company }] }], employers, note, profs?, skills? }
  function who(type, C) {
    const R = C.role.label, nE = C.employers.length;
    const rows = levels => levels.map(l => ({ level: l.level, label: l.label, n: l.n, titles: l.titles.slice(0, 3) }));
    if (type === "hm") return { lead: `Titles one or two levels above ${R}, at the companies hiring it now.`, levels: rows(C.senior), employers: C.employers.slice(0, 5), note: C.senior.length ? `${nE} ${nE === 1 ? "employer posts" : "employers post"} ${R} now. The five with the most open postings:` : `No senior ${R} posting is open now. Look one level up: ${nextLevel(C)}.` };
    if (type === "inrole") return { lead: `The title ${R} itself, at the companies hiring it now.`, levels: rows(C.junior), employers: C.employers.slice(0, 5), note: C.junior.length ? WHO.fiveEmployers : `The open ${R} postings are at ${join(C.levels.map(l => l.label))}.` };
    if (type === "recruiter") { const spons = C.postings.filter(p => p.sponsorship === "yes").length; return { lead: `Recruiters for ${R} roles at the companies with the most open postings.`, levels: [], employers: C.employers.slice(0, 5), note: spons ? `${fmt(spons)} of the ${fmt(C.postings.length)} open ${R} postings say they sponsor a visa.` : `The open ${R} postings do not say they sponsor a visa. Ask.` }; }
    if (type === "faculty") return { lead: C.profs.length ? `The professors whose classes this term cover most of your ${C.fit.gaps.length} ${R} gaps.` : WHO.facultyWait, levels: [], employers: [], note: C.profs.length ? WHO.openProfessor : null, profs: C.profs.map(p => ({ slug: p.slug, name: p.name, line: profLine(p), codes: p.codes, covers: p.covers, nGaps: C.fit.gaps.length })) };
    if (type === "alum") return { lead: `Alumni of your school with the title ${R}, or one level up.`, levels: rows(C.levels), employers: C.employers.slice(0, 3), note: WHO.startEmployers };
    if (type === "peer") return { lead: `Classmates who aim at ${R}. Compare notes on the skills most postings ask for.`, levels: [], employers: [], note: C.build.length ? `Skills most ${R} postings ask for that your résumé does not show yet. Split them:` : `Your résumé shows the skills most ${R} postings ask for. Compare how you show them.`, skills: C.build.map(b => ({ id: b.id, name: b.name })) };
    return { lead: "", levels: [], employers: [], note: null };
  }
  // one line of what the data holds for a type, so the person can see which guides have the most in them
  function count(type, C) {
    const nE = C.employers.length, t = (n, w) => `${fmt(n)} ${n === 1 ? w : w + "s"}`;
    if (type === "hm") return C.senior.length ? `${t(nTitles(C.senior), "senior title")} · ${t(nE, "employer")}` : t(nE, "employer");
    if (type === "inrole") return `${t(nTitles(C.junior), "title")} · ${t(nE, "employer")}`;
    if (type === "recruiter") return `${t(nE, "employer")} · ${t(C.postings.length, "open posting")}`;
    if (type === "faculty") return `${t(C.profs.length, "professor")} · ${C.profs.filter(p => p.covers.length).length} cover a gap`;
    if (type === "alum") return `${t(nE, "employer")} hiring the role`;
    if (type === "peer") return `${t(C.build.length, "skill")} to split`;
    return "";
  }

  // ---------- where to find them: searches built from data, each with what it opens ----------
  const liPeople = q => `https://www.linkedin.com/search/results/people/?keywords=${enc(q)}`;
  const liSchool = (slug, q) => `https://www.linkedin.com/school/${enc(slug)}/people/?keywords=${enc(q)}`;
  // the level words of the two nearest senior levels with open postings, as LinkedIn keywords ("Lead" OR "principal")
  const levelWords = C => [...new Set(C.senior.slice(0, 2).flatMap(l => l.label.split(" / ")))].slice(0, 4);
  const seniorQuery = (C, company) => { const w = levelWords(C); return `${company} ${w.length ? "(" + w.map(x => `"${x}"`).join(" OR ") + ") " : ""}"${C.role.label}"`; };
  const out = (label, href, what, external) => ({ label, href, what, external: external !== false });
  const profHref = (H, p) => typeof H.professor === "function" ? H.professor(p) : `${H.professor || "#/professor/"}${enc(p.slug)}`;
  const classHref = (H, code) => typeof H.classes === "function" ? H.classes(code) : `${H.classes || "#/classes"}?open=${enc(code)}`;
  // H: { professor, classes, skills } the screen's own links; target narrows the employer types to one company
  function where(type, C, H, target) {
    H = H || {};
    const R = C.role.label, cos = target && target.company ? [target.company] : C.employers.slice(0, 3).map(e => e.company);
    const rows = [];
    const v = c => ({ role: R, company: c, linkedin: COPY.linkedin });
    if (type === "hm") cos.forEach(c => rows.push(out(fill(WHERE.leads, v(c)), liPeople(seniorQuery(C, c)), fill(WHERE.hm, v(c)))));
    if (type === "inrole") cos.forEach(c => rows.push(out(`${c} · ${R}`, liPeople(`${c} "${R}"`), fill(WHERE.inrole, v(c)))));
    if (type === "recruiter") {
      cos.forEach(c => rows.push(out(fill(WHERE.recruiters, v(c)), liPeople(`${c} recruiter "${C.field ? C.field.label.split(" & ")[0] : R}"`), fill(WHERE.recruiter, v(c)))));
      C.postings.filter(p => p.url && (!target || p.company === target.company)).slice(0, 3).forEach(p => rows.push(out(`${p.company} · ${p.title}`, p.url, WHERE.posting)));
      rows.push(out(WHERE.handshake, "https://app.joinhandshake.com/", WHERE.handshakeLine));
    }
    if (type === "alum") {
      rows.push(out(fill(WHERE.peopleSearch, v("")), liPeople(`"${R}"`), fill(WHERE.alum, v(""))));
      cos.slice(0, 2).forEach(c => rows.push(out(`${c} · ${R}`, liPeople(`${c} "${R}"`), fill(WHERE.alumAt, v(c)))));
    }
    if (type === "faculty") (target && target.slug ? [target] : C.profs).forEach(p => rows.push(out(`${p.name} →`, profHref(H, p), WHERE.professor, false)));
    if (type === "peer") {
      if (C.cornell) C.profs.flatMap(p => p.codes).filter((c, i, a) => a.indexOf(c) === i).slice(0, 4).forEach(code => rows.push(out(`${code} →`, classHref(H, code), WHERE.classInPicker, false)));
      rows.push(out(WHERE.skills, H.skills || "#/explore", WHERE.skillsLine, false));
    }
    return rows;
  }

  // ---------- what to say: the opener, the ask, three questions, what to listen for, the follow-up ----------
  // target: { company } for a company, a professor row for faculty, null for none. The school is never named.
  function say(type, C, target) {
    const R = C.role.label, co = target && target.company ? target.company : emp(C, 0);
    // a professor target is a roster row: the context's copy of it carries the gaps it covers
    const prof = type === "faculty" ? (target && target.slug ? C.profs.find(p => p.slug === target.slug) || { codes: [], gaps: [], covers: [], ...target } : C.profs[0]) || null : null;
    const code = prof && prof.codes[0] ? prof.codes[0] : "the class";
    const pg = prof ? short(((prof.covers || [])[0] || (prof.gaps || [])[0] || { name: gap(C, 0) }).name) : gap(C, 0), pg2 = prof ? short(((prof.covers || [])[1] || { name: gap(C, 1) }).name) : gap(C, 1);
    const g1 = gap(C, 0), g2 = gap(C, 1), g3 = gap(C, 2), a1 = ask(C, 0), m1 = mark(C, 0);
    // the questions name three different skills: a gap other than the mark, an ask other than the marks
    const marks = C.marks.map(short), gq = C.fit.gaps.map(g => short(g.name)).find(x => x !== m1) || g1, aq = C.asks.map(a => short(a.name)).find(x => !marks.includes(x) && x !== gq) || a1;
    const e = C.employers.find(x => x.company === co);
    const b1 = C.build[0] ? short(C.build[0].name) : g2, b2 = C.build[1] ? short(C.build[1].name) : g3;
    const intro = SAY.intro;
    const aim = type === "hm" || type === "recruiter" ? `I am looking at ${R} roles at ${co}.` : `I want to work as ${an(R)}.`;
    const proof = C.say.length ? `My résumé shows ${join(C.say.map(s => short(s.name)))}.` : C.fit.n ? `I show ${C.fit.n} of the ${C.fit.m} skills most ${R} postings ask for.` : `I am building the skills most ${R} postings ask for.`;
    const A = {
      hm: `Could I have 20 minutes to hear what you look for in ${an(R)} hire?`,
      inrole: SAY.inroleAsk,
      recruiter: `Could I have 15 minutes to hear how ${co} hires for ${R} roles?`,
      faculty: `Could I have 15 minutes to ask whether ${code} covers ${pg}?`,
      alum: `Could I have 20 minutes to hear how you got from your school to ${R}?`,
      peer: `Want to compare notes on ${g1} this week?`,
    };
    const Q = {
      hm: [`How do you judge ${m1} in an interview?`, `What does ${gq} look like in a first year on your team?`, `Most ${R} postings ask for ${aq}. What does it mean on your team?`],
      inrole: [`How much of your week goes to ${a1}?`, `Where did you learn ${g1}?`, `What did you wish you knew about ${m1} before you started?`],
      recruiter: [`Which teams at ${co} hire for ${R} first?`, `How does ${co} screen for ${a1}?`, e ? `${co} has ${fmt(e.nOpen)} open postings now. Which fit a new grad?` : `Which of your open ${R} roles fit a new grad?`],
      faculty: [`Does ${code} cover ${pg} the way ${R} postings ask for it?`, `Which project in ${code} could show ${pg} on a résumé?`, `Who else teaches ${pg2} this term?`],
      alum: [`What helped most on the way from your school to ${R}?`, `Which class or project helped most with ${g1}?`, target && target.company ? `Who at ${co} should I talk to next?` : "Who should I talk to next?"],
      peer: [`How are you showing ${g1} on your résumé?`, `Which of ${join(C.employers.slice(0, 3).map(x => x.company))} are you looking at?`, `Want to split ${b1} and ${b2} and swap notes?`],
    };
    const uniq = xs => xs.filter((x, i, a) => a.indexOf(x) === i);
    const L = {
      faculty: `Listen for how ${code} covers ${join(uniq([pg, pg2]))}. Those are your gaps.`,
      peer: `Listen for what they show that you do not: ${join(uniq([g1, g2]))}.`,
      default: C.fit.gaps.length ? `Listen for ${join(uniq([g1, g2, g3]))}. Your résumé does not show them yet.` : "Listen for what they wish they had known in their first year.",
    };
    const next = { hm: `read up on ${g1}`, inrole: `read up on ${g1}`, recruiter: `look at the open ${R} roles at ${co}`, faculty: `look at ${code} in the picker`, alum: `read up on ${g1}`, peer: `send you my notes on ${b1}` }[type];
    const mins = type === "recruiter" || type === "faculty" ? 15 : 20;
    const follow = type === "peer" ? `Thanks for today. I will ${next}. Same time next week?` : `Thank you for the ${mins} minutes today. I will ${next}. Is there one more person I should talk to?`;
    const subject = type === "faculty" ? `A question about ${code}` : type === "peer" ? `${R}: compare notes?` : `${An(R)} question from a grad student`;
    return { intro, aim, proof, ask: A[type] || A.hm, questions: Q[type] || Q.hm, listen: L[type] || L.default, follow, subject, mins, close: type === "peer" ? SAY.thanks : SAY.thankYou };
  }
  // the message draft, as plain text the person can copy; name: what the person typed, kept in the browser
  const draft = (S, name) => [fill(SAY.subject, { subject: S.subject }), "", fill(SAY.hi, { name: name && String(name).trim() ? String(name).trim() : SAY.there }), "", `${S.intro} ${S.aim} ${S.proof}`, "", S.ask, "", S.close || SAY.thankYou].join("\n");
  // the targets a type can pick: companies for the employer types, professors for faculty, none for a classmate
  const targetsOf = (type, C) => type === "faculty" ? C.profs.map(p => ({ key: p.slug, label: p.name, row: p })) : type === "peer" ? [] : C.employers.map(e => ({ key: e.company, label: `${e.company} · ${fmt(e.nOpen)} open`, row: { company: e.company } }));
  // the page lead: "You show N of the M skills most <role> postings ask for. These people can help with the rest."
  const lead = C => fill(COPY.lead, { n: C.fit.n, m: C.fit.m, role: C.role.label });

  // ---------- the list of planned chats: pure over arrays; the screen keeps the array ----------
  // an item: { role, type, key, label }; two items are the same chat when role, type and key agree
  const same = (a, b) => a.role === b.role && a.type === b.type && (a.key || null) === (b.key || null);
  const listHas = (list, item) => (list || []).some(x => same(x, item));
  const listAdd = (list, item) => listHas(list, item) ? [...(list || [])] : [...(list || []), { role: item.role, type: item.type, key: item.key || null, label: item.label || "" }];
  const listRemove = (list, item) => (list || []).filter(x => !same(x, item));

  return { TYPES, COPY, types, typeOf, ctx, who, count, where, say, draft, targetsOf, lead, listAdd, listRemove, listHas, liPeople, liSchool, fill, an, join, short };
});
