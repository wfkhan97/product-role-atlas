/* Networking: the pure parts of "Who to meet" (owner's pick N6, 2026-10-31). The people a grad student meets for one
   role, and what the site builds for each from the data it has: the role's asks, the fit's gaps and shown skills, the
   postings' titles and levels, the employers hiring the role, and the campus roster when the door's email opens it.
   The site names no person outside that roster. Every "where" is a search the person runs, built from data, with a
   line that says what it opens. No talking point names a school but the alum's ask ("your school").
   The prep card's "Suggested approach" (owner's feedback, 2026-11-01) is what say() builds: what to lead with (the
   skills the résumé shows that most of the role's postings ask for), the ask with its minutes, and three questions
   specific to this person, this role and this company. A question never names a behaviour (collaboration,
   ownership…), a skill generic to the role set (Atlas.genericSkills, passed in as `generic`) or a credential: those
   are what every posting says, so a question built on them says nothing. It names the role's craft asks, the
   person's craft gaps, what the company's own open postings stress more than the role's at large, their titles,
   levels and counts, the sub-skills those postings name and, when the screen passes them, a short sentence a posting
   of the company wrote (the evidence file).
   No DOM, no fetch, no storage: every function takes the index (`ix`), a role (`R` from Atlas.role), a fit or plain
   arrays, and gives structures and plain-text strings the screen draws. Loads as a classic script (window.Network)
   and in node (require("web/network.js")). Nothing here is a score or a percentage.
   Every template is web/copy.js (Copy.network): COPY and TYPES here are views over that table; this file picks the
   data that fills the slots. */
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
  // a skill name as a sentence says it: the examples in brackets dropped ("ERP & finance systems (SAP, Oracle)")
  const short = name => String(name || "").replace(/\s*\(.*?\)/g, "").trim();
  // mid-sentence, a skill or sub-skill name starts lower case ("roadmapping", "systems & architecture"); a tool keeps
  // its capital (Salesforce, Tableau), and so do an acronym (SQL, APIs) and the few proper nouns a name starts with
  const PROPER = /^(Python|Excel|Salesforce|Google|Microsoft|Amazon|Adobe|Oracle|Apple|Medicare|Medicaid|Agile)\b/;
  const inText = (name, kind) => { const n = short(name); return kind !== "tool" && /^[A-Z][a-z]/.test(n) && !PROPER.test(n) ? n[0].toLowerCase() + n.slice(1) : n; };
  const uniq = xs => xs.filter((x, i, a) => a.indexOf(x) === i);

  // ---------- the people types ----------
  // id and label (Copy.network.types); cornell: true means the type shows only when the door opens Cornell
  const TYPES = ["hm", "inrole", "recruiter", "alum", "faculty"].map(id => ({ id, label: Copy.network.types[id].label, ...(id === "faculty" ? { cornell: true } : {}) }));
  const types = cornell => TYPES.filter(t => cornell || !t.cornell);
  const typeOf = id => TYPES.find(t => t.id === id) || TYPES[0];

  // the screen's strings (web/copy.js, Copy.network); {name} slots are filled with fill()
  const COPY = Copy.network;
  const WHO = COPY.whoLines, WHERE = COPY.whereLines, AP = COPY.approach;

  // LinkedIn's ids for the three Cornell school pages (Cornell University, Cornell Tech and the Johnson school), as the
  // owner tested them on 2026-11-01. The alum search filters LinkedIn's people search to them with
  // origin=FACETED_SEARCH&schoolFilter=["…","…","…"], so the person need not add the school by hand.
  const CORNELL_SCHOOLS = ["3554137", "3523", "3323650"];

  // ---------- the context: one role, the person's fit, the employers, the titles, the professors ----------
  const LEVELS = ["associate", "mid", "senior", "staff", "group", "director", "vp", "cpo"];
  const SENIOR = new Set(["staff", "group", "director", "vp", "cpo"]);   // the lead step, as Atlas.stepOf reads it
  const SHOWN = new Set(["evidenced", "transferable", "through", "inferred"]);   // inferred: the model read (web/infer.js)
  const skill = (ix, id) => (ix.skillById || {})[id] || null;
  const credential = (ix, id) => { const s = skill(ix, id); return !s || s.cluster === "credentials" || s.kind === "credential"; };
  // a skill a question may name: in the index, neither a behaviour nor a credential, not generic to the role set
  const askable = (ix, id, generic) => { const s = skill(ix, id); return !!s && s.kind !== "behaviour" && !credential(ix, id) && !(generic && generic.has(id)); };
  // the skills most of the role's postings ask for, from the index: defining first, then the asks at the core share
  const coreAsks = (ix, role, core) => [...(role.definingList || []), ...(role.asks || [])].filter(a => a.share >= core && !credential(ix, a.id)).map(a => ({ id: a.id, name: skill(ix, a.id).name, share: a.share }));
  // the level label of a posting, as the role page shows it (its ladder's word, else the set's)
  const levelLabel = (ix, R, j) => { const lad = R.ladders && R.ladders[j.ladder]; return (lad && lad.levels[j.level]) || (R.levelLabels || {})[j.level] || ((ix.M || {}).level_labels || {})[j.level] || j.level; };
  const lv = l => { const i = LEVELS.indexOf(l); return i < 0 ? LEVELS.length : i; };
  // o: { cornell, shown: Set of skill ids (a rough read, when no fit), profs: campus roster rows, fieldJobs: the
  // field's postings (Atlas.fieldJobs) for the other roles each employer posts, core: the core share (0.5),
  // generic: Set of the skill ids generic to the role set (Atlas.genericSkills), evidence: { skill id: the evidence
  // groups R.evidence(id) gives } for the skills the screen loaded }
  function ctx(ix, R, fit, o) {
    o = o || {};
    const role = R.role, core = o.core || 0.5;
    const generic = o.generic instanceof Set ? o.generic : new Set(o.generic || []);
    const ok = id => askable(ix, id, generic);
    const said = id => { const s = skill(ix, id); return s ? inText(s.name, s.kind) : id; };
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
    // what to lead with: the craft skills the résumé shows (directly first), by share; a behaviour or a generic skill
    // is what every candidate claims, so it is not a lead
    const byShare = (a, b) => (b.share || 0) - (a.share || 0);
    const craftShown = F.shown.filter(s => ok(s.id)), direct = craftShown.filter(s => s.status === "evidenced");
    const lead = [...direct.sort(byShare), ...craftShown.filter(s => s.status !== "evidenced").sort(byShare)].slice(0, 3).map(s => ({ ...s, said: said(s.id) }));
    // the craft asks of the role: its defining skills first, then the rest by share; the craft gaps, by share
    const defIds = new Set((role.definingList || []).map(d => d.id));
    const craft = [...(role.definingList || []), ...[...(role.asks || [])].sort(byShare)].filter((a, i, all) => ok(a.id) && all.findIndex(b => b.id === a.id) === i).slice(0, 15).map(a => ({ id: a.id, share: a.share, said: said(a.id), defining: defIds.has(a.id) }));
    const craftGaps = F.gaps.filter(g => ok(g.id)).map(g => ({ ...g, said: said(g.id) }));
    // the postings open now, the employers by their open postings of this role, the titles by level
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
    // the professors: the campus roster rows, each with the gaps of this role their classes cover (the craft ones a
    // question may name as `teach`) and the role's core asks they teach (`asks`: with no résumé the roster rows are
    // read against askRows, so the list still sorts by what matters, not by name); the most gaps covered first with a
    // résumé, the most asks taught first without one, then by name
    const gapIds = new Set(F.gaps.map(g => g.id)), askIds = new Set(asks.map(a => a.id));
    const read0 = !!F.real || o.shown != null;
    const profs = (o.cornell ? o.profs || [] : []).map(p => { const covers = (p.gaps || []).filter(g => gapIds.has(g.id)); return { ...p, codes: p.codes || [], gaps: p.gaps || [], covers, asks: (p.gaps || []).filter(g => askIds.has(g.id)), teach: covers.filter(g => ok(g.id)).map(g => ({ ...g, said: said(g.id) })) }; })
      .sort((a, b) => (read0 ? b.covers.length - a.covers.length : b.asks.length - a.asks.length) || String(a.name).localeCompare(String(b.name)));
    // the word for each level on this role's ladder, for "one level up"
    const levelLabels = Object.fromEntries(LEVELS.map(l => [l, levelLabel(ix, R, { level: l, ladder: role.ladder })]));
    // a skill's sub-skills, with the name as a sentence says it: the words a posting's sub-skill tags (j.sub) stand for
    const subs = sid => { const s = skill(ix, sid); return ((s && s.subskills) || (ix.SUBS || {})[sid] || []).map(x => ({ id: x.id, said: inText(x.name, s && s.kind) })); };
    // read: a résumé was read (the fit, or the rough read's skills), so "your résumé does not show" is a fact
    const read = read0;
    // every skill the résumé shows, at any tier: a question never says "I am still building" one of them
    const shownAll = fit && fit.rows ? fit.rows.filter(x => SHOWN.has(x.status)).map(x => x.id) : F.shown.map(s => s.id);
    return { role, field, asks, fit: F, read, shownAll, lead, craft, craftGaps, employers, levels, senior, junior, postings, profs, levelLabels, subs, evidence: o.evidence || {}, cornell: !!o.cornell, level: j => levelLabel(ix, R, j) };
  }
  // the role's core asks as the gap rows the class picker reads (Catalog.gapsCovered: id, name, tier, w), so the
  // screen can read the roster against the role when there is no résumé to give gaps
  const askRows = (ix, R, core) => coreAsks(ix, R.role, core || 0.5).map(a => ({ id: a.id, name: a.name, tier: "core", w: a.share }));
  // the employers hiring the role, by its open postings (most first); with the field's postings, each also carries
  // the field's other roles it posts
  function employersOf(ix, role, postings, fieldJobs) {
    const by = {};
    for (const j of postings) (by[j.company] ||= { company: j.company, nOpen: 0, roles: new Set([role.family || role.id]) }).nOpen++;
    if (fieldJobs && fieldJobs.length) for (const j of fieldJobs) if (j.open !== false && by[j.company]) by[j.company].roles.add(j.family);
    const labelOf = f => { const r = ix.roles[f] || ix.roles["product." + f]; return r ? r.label : role.label; };
    return Object.values(by).map(e => ({ company: e.company, nOpen: e.nOpen, roles: uniq([...e.roles].map(labelOf)) })).sort((a, b) => b.nOpen - a.nOpen || a.company.localeCompare(b.company));
  }
  const nextLevel = C => { const top = C.levels.length ? C.levels[C.levels.length - 1].level : "mid"; const l = LEVELS[Math.min(lv(top) + 1, LEVELS.length - 1)]; const w = (C.levelLabels || {})[l]; return w && w !== l ? w : "one level up"; };
  // "unknown" and the roster's footnotes are not facts (as the professor card reads them)
  const fact = v => v && v !== "unknown" && !/per roster|course descriptions only/i.test(v) ? v : null;
  const profLine = p => fact(p.title) || fact(p.affiliation) || COPY.noTitle;

  // ---------- who to look for ----------
  // { lead, levels: [{ level, label, n, titles: [{ title, company }] }], employers: the five with the most open
  // postings of the role, profs (faculty only: the most gaps covered first, then by name) }
  function who(type, C) {
    const v = { role: C.role.label }, top = C.employers.slice(0, 5);
    const rows = levels => levels.map(l => ({ level: l.level, label: l.label, n: l.n, titles: l.titles.slice(0, 3) }));
    if (type === "hm") return { lead: C.senior.length ? fill(WHO.hm, v) : fill(WHO.hmNone, { ...v, next: nextLevel(C) }), levels: rows(C.senior), employers: top };
    if (type === "inrole") return { lead: fill(WHO.inrole, v), levels: rows(C.junior), employers: top };
    if (type === "recruiter") return { lead: fill(WHO.recruiter, v), levels: [], employers: top };
    if (type === "alum") return { lead: fill(WHO.alum, v), levels: rows(C.levels), employers: top };
    if (type === "faculty") return { lead: C.profs.length ? fill(C.read ? WHO.faculty : WHO.facultyNoResume, v) : WHO.facultyWait, levels: [], employers: [], profs: C.profs.map(p => ({ slug: p.slug, name: p.name, line: profLine(p), codes: p.codes, covers: p.covers, nGaps: C.fit.gaps.length, asks: p.asks, nAsks: C.asks.length, read: C.read })) };
    return { lead: "", levels: [], employers: [] };
  }
  // Find jobs with the role and its field already set ("See more companies"), in the order jobs.js stateQuery writes
  // them so the jobs screen keeps the link as it is
  const jobsHref = C => "#/jobs?" + new URLSearchParams(C.role.group ? { field: C.role.group, role: C.role.id } : { role: C.role.id });

  // ---------- where to find them: searches built from data, each with what it opens ----------
  const liPeople = q => `https://www.linkedin.com/search/results/people/?keywords=${enc(q)}`;
  // the alum search: the same people search filtered to the Cornell schools (the owner's tested URL, 2026-11-01)
  const liAlumni = q => `${liPeople(q)}&origin=FACETED_SEARCH&schoolFilter=${enc(JSON.stringify(CORNELL_SCHOOLS))}`;
  // the level words of the two nearest senior levels with open postings, as LinkedIn keywords ("Lead" OR "principal")
  const levelWords = C => [...new Set(C.senior.slice(0, 2).flatMap(l => l.label.split(" / ")))].slice(0, 4);
  const seniorQuery = (C, company) => { const w = levelWords(C); return `${company} ${w.length ? "(" + w.map(x => `"${x}"`).join(" OR ") + ") " : ""}"${C.role.label}"`; };
  const out = (label, href, what, external) => ({ label, href, what, external: external !== false });
  const profHref = (H, p) => typeof H.professor === "function" ? H.professor(p) : `${H.professor || "#/professor/"}${enc(p.slug)}`;
  // H: { professor } the screen's own link; target: { company } narrows the employer types to that company, a
  // professor row narrows faculty to that professor; with none, the three employers with the most open postings
  function where(type, C, H, target) {
    H = H || {};
    const R = C.role.label, one = !!(target && target.company), cos = one ? [target.company] : C.employers.slice(0, 3).map(e => e.company);
    const rows = [];
    const v = c => ({ role: R, company: c, linkedin: COPY.linkedin });
    if (type === "hm") cos.forEach(c => rows.push(out(fill(WHERE.leads, v(c)), liPeople(seniorQuery(C, c)), fill(WHERE.hm, v(c)))));
    if (type === "inrole") cos.forEach(c => rows.push(out(`${c} · ${R}`, liPeople(`${c} "${R}"`), fill(WHERE.inrole, v(c)))));
    if (type === "recruiter") {
      cos.forEach(c => rows.push(out(fill(WHERE.recruiters, v(c)), liPeople(`${c} recruiter "${C.field ? C.field.label.split(" & ")[0] : R}"`), fill(WHERE.recruiter, v(c)))));
      C.postings.filter(p => p.url && (!one || p.company === target.company)).slice(0, 3).forEach(p => rows.push(out(`${p.company} · ${p.title}`, p.url, WHERE.posting)));
      rows.push(out(WHERE.handshake, "https://app.joinhandshake.com/", WHERE.handshakeLine));
    }
    if (type === "alum") {
      rows.push(out(fill(WHERE.alumni, v("")), liAlumni(`"${R}"`), fill(WHERE.alum, v(""))));
      cos.slice(0, one ? 1 : 2).forEach(c => rows.push(out(fill(WHERE.alumniAt, v(c)), liAlumni(`${c} "${R}"`), fill(WHERE.alumAt, v(c)))));
    }
    if (type === "faculty") (target && target.slug ? [target] : C.profs).forEach(p => rows.push(out(`${p.name} →`, profHref(H, p), WHERE.professor, false)));
    return rows;
  }

  // ---------- one company, read from its open postings of the role ----------
  // { company, jobs, n, stress: the role's craft asks its postings name, by how much more often than the role's
  // postings at large (at least two postings, or its one), gaps: the person's craft gaps its postings name (most
  // named first), levels: its postings by level, lowest first }
  function companyOf(C, co) {
    const jobs = co ? C.postings.filter(j => j.company === co) : [], n = jobs.length;
    const k = id => jobs.filter(j => (j.skills || []).includes(id)).length;
    const stress = !n ? [] : C.craft.map(a => ({ ...a, k: k(a.id) })).filter(a => a.k >= Math.min(2, n) && a.k / n >= 0.25).map(a => ({ ...a, lift: a.share ? a.k / n / a.share : 1 })).sort((a, b) => b.lift - a.lift || b.k - a.k);
    const gaps = !n ? [] : C.craftGaps.map(g => ({ ...g, k: k(g.id) })).filter(g => g.k > 0).sort((a, b) => b.k - a.k);
    const by = {};
    for (const j of jobs) (by[j.level] ||= { level: j.level, label: C.level(j), n: 0 }).n++;
    return { company: co, jobs, n, k, stress, gaps, levels: Object.values(by).sort((a, b) => lv(a.level) - lv(b.level)) };
  }
  // the sub-skill of a skill its postings name most (the words the posting uses), or null
  function topSub(C, sid, jobs) {
    const mine = C.subs(sid), n = {};
    for (const j of jobs) if ((j.skills || []).includes(sid)) for (const x of j.sub || []) n[x] = (n[x] || 0) + 1;
    const best = mine.filter(x => n[x.id]).sort((a, b) => n[b.id] - n[a.id])[0];
    return best ? best.said : null;
  }
  // the company's posting that asks for a skill, the lowest level first (the one a new grad would read)
  const postingFor = (P, sid) => P.jobs.filter(j => (j.skills || []).includes(sid)).sort((a, b) => lv(a.level) - lv(b.level))[0] || null;
  // a sentence the company's postings wrote about the skill (the evidence file), one clause of at most `max` words
  function quoteFor(C, sid, co, max) {
    for (const q of Object.values(C.evidence[sid] || {}).flat()) {
      if (!q || q.company !== co || !q.text) continue;
      const t = String(q.text).trim().replace(/^[-•*\s]+/, "").replace(/[\s.;:,]+$/, "");
      if (t && !/[.?!;]\s|["“”]/.test(t) && t.split(/\s+/).length <= max) return { ...q, text: t[0].toLowerCase() + t.slice(1) };
    }
    return null;
  }

  // ---------- the suggested approach: what to lead with, the ask, three questions ----------
  const wordsIn = s => s.split(/\s+/).filter(Boolean).length;
  const fits = s => String(s).split(/[.?!]\s+|[.?!]$/).every(x => wordsIn(x) <= 20);
  // the first candidate that is there and keeps every sentence at 20 words or fewer, else the last one there
  const firstFit = (...xs) => xs.find(x => x && fits(x)) || xs.filter(Boolean).pop() || "";
  // target: { company } for the employer types, a professor row for faculty, null for the top employer or professor.
  // Gives { leadWith, leadSkills, ask, questions (three), mins, pasteText }; the school is named only in the alum's ask.
  function say(type, C, target) {
    const R = C.role.label, Q = AP.q[type] || AP.q.hm;
    const co = target && target.company ? target.company : (C.employers[0] || {}).company || null;
    const P = companyOf(C, type === "faculty" ? null : co);
    const prof = type === "faculty" ? (target && target.slug ? C.profs.find(p => p.slug === target.slug) || { codes: [], covers: [], teach: [], ...target } : C.profs[0]) || null : null;
    // the skills the questions name, each named once and none the résumé already shows: g1 the gap the company's
    // postings name most (else the top craft gap, else what the company stresses), emph what the company stresses
    // most against the role at large (else the role's top craft ask), g2 one more gap
    const taken = new Set([...C.lead.map(s => s.id), ...C.shownAll]);
    const pick = (...lists) => { for (const l of lists) for (const x of l || []) if (x && !taken.has(x.id)) { taken.add(x.id); return x; } return null; };
    const teach = prof ? prof.teach || [] : [];
    const g1 = type === "faculty" ? pick(teach, C.craftGaps, C.craft) : pick(P.gaps, C.craftGaps, P.stress, C.craft);
    const emph = type === "faculty" ? pick(teach, C.craftGaps, C.craft) : pick(P.stress, C.craft);
    const g2 = pick(C.craftGaps, C.craft);
    const sk = x => x ? x.said : AP.theSkills;
    const lead1 = C.lead[0] || null;
    const code = prof && prof.codes && prof.codes[0] ? prof.codes[0] : AP.theClass;
    const v = { role: R, aRole: an(R), company: co || "", n: fmt(P.n), code };
    const sub = x => { const w = x ? topSub(C, x.id, P.n ? P.jobs : C.postings) : null; return w ? fill(AP.sub, { sub: w }) : ""; };
    let questions;
    if (type === "inrole") {
      const lift = emph && emph.lift >= 1.2, subIn = emph ? topSub(C, emph.id, P.jobs) : null, title = (P.jobs.find(j => j.title !== R) || {}).title;
      questions = [
        P.n ? fill(lift ? Q.stress : Q.asks, { ...v, skill: sk(emph) }) : fill(Q.askRole, { ...v, skill: sk(emph) }),
        fill(C.read ? (P.n ? Q.gap : Q.gapRole) : (P.n ? Q.built : Q.builtRole), { ...v, skill: sk(g1) }),
        firstFit(subIn && fill(Q.sub, { ...v, sub: subIn, skill: sk(emph) }), title && fill(Q.title, { ...v, title }), fill(Q.week, { ...v, skill: sk(g2) })),
      ];
    } else if (type === "recruiter") {
      const low = P.levels[0];
      questions = [
        P.n ? fill(Q.count, v) : fill(Q.countRole, v),
        low ? fill(low.n === P.n ? Q.levelAll : low.n === 1 ? Q.levelOne : Q.level, { ...v, k: fmt(low.n), level: low.label }) : fill(Q.levelRole, v),
        fill(P.n ? Q.screen : Q.screenRole, { ...v, skill: sk(emph || g1) }),
      ];
    } else if (type === "alum") {
      const titles = uniq(P.jobs.slice().sort((a, b) => lv(a.level) - lv(b.level)).map(j => j.title)).slice(0, 2), low = C.junior[0] || C.levels[0];
      questions = [
        fill(Q.learned, { ...v, skill: sk(g1) }),
        titles.length > 1 ? firstFit(fill(Q.titles, { ...v, title: titles[0], title2: titles[1] }), fill(Q.titleOne, { ...v, title: titles[0] })) : titles.length ? fill(Q.titleOne, { ...v, title: titles[0] }) : low ? fill(Q.levelRole, { ...v, level: low.label }) : fill(Q.startRole, v),
        lead1 && C.read ? fill(co ? Q.choose : Q.chooseRole, { ...v, lead: lead1.said, skill: sk(emph) })
          : (w => firstFit(co && fill(Q.chooseNoLead, w), co && fill(Q.chooseNoLeadShort, w), !co && fill(Q.chooseRoleNoLead, w), fill(Q.chooseShort, w)))({ ...v, skill: sk(emph), skill2: sk(g2) }),
      ];
    } else if (type === "faculty") {
      questions = [
        fill(Q.covers, { ...v, skill: sk(g1), sub: sub(g1) }),
        fill(Q.project, { ...v, skill: sk(g1) }),
        fill(Q.other, { ...v, skill: sk(emph || g2) }),
      ];
    } else {
      // a hiring manager: the company's own posting (its sentence when the evidence holds a short one, else the
      // sub-skill it names), what its postings stress next to what the résumé shows, and the gap to learn on the job
      const job = g1 && P.n ? postingFor(P, g1.id) : null, maxQ = job ? 17 - wordsIn(job.title) : 0;
      const quote = job && maxQ >= 6 ? quoteFor(C, g1.id, co, maxQ) : null;
      questions = [
        firstFit(quote && fill(Q.quote, { ...v, title: quote.title, quote: quote.text }), job && fill(Q.posting, { ...v, title: job.title, skill: sk(g1), sub: (w => w ? fill(AP.sub, { sub: w }) : "")(topSub(C, g1.id, [job])) }), job && fill(Q.posting, { ...v, title: job.title, skill: sk(g1), sub: "" }), fill(Q.role, { ...v, skill: sk(g1) })),
        firstFit(lead1 && C.read && P.n && fill(Q.bridge, { ...v, lead: lead1.said, skill: sk(emph) }), P.n && fill(Q.stress, { ...v, skill: sk(emph) }), fill(Q.stressRole, { ...v, skill: sk(emph) })),
        firstFit(P.n && fill(C.read ? Q.learn : Q.teach, { ...v, skill: sk(g2) }), fill(Q.learnRole, { ...v, skill: sk(g2) })),
      ];
    }
    // what to lead with: the skills the résumé shows, and how often the company asks for the first
    const names = C.lead.map(s => s.said), kLead = lead1 && P.n ? P.k(lead1.id) : 0;
    const leadWith = names.length
      ? [fill(names.length === 1 ? AP.showsOne : AP.shows, { role: R, skills: join(names) }), kLead ? fill(AP.atCompany, { ...v, skill: lead1.said, k: fmt(kLead) }) : ""].filter(Boolean).join(" ")
      : C.read ? fill(AP.showsNone, { role: R, skill: sk(C.craft[0]) }) : fill(AP.noResume, { skills: join(C.craft.slice(0, 2).map(a => a.said)) || AP.theSkills });
    const A = AP.asks;
    const ask = type === "hm" ? fill(co ? A.hmAt : A.hm, v) : type === "recruiter" ? fill(co ? A.recruiter : A.recruiterNoCo, v) : type === "faculty" ? fill(A.faculty, { ...v, skill: sk(g1) }) : type === "alum" ? fill(A.alum, v) : fill(A.inrole, v);
    const mins = type === "recruiter" || type === "faculty" ? 15 : 20;
    // the plain text the Copy button gives: a head line, then the three parts, for Claude or the person's notes
    const head = [typeOf(type).label, type === "faculty" ? prof && prof.name : co, R].filter(Boolean).join(" · ");
    const pasteText = [head, "", `${AP.leadWith}: ${leadWith}`, "", `${AP.ask}: ${ask}`, "", `${AP.questions}:`, ...questions.map((q, i) => `${i + 1}. ${q}`)].join("\n");
    return { leadWith, leadSkills: names, ask, questions, mins, pasteText };
  }
  // the targets a type can pick (the Pick options): the employers by open postings for the employer types, the
  // professors (the most gaps covered first) for faculty
  const targetsOf = (type, C) => type === "faculty"
    ? C.profs.map(p => ({ key: p.slug, label: p.name, hint: C.read ? (p.covers.length ? fill(COPY.coversHint, { n: p.covers.length }) : p.codes.slice(0, 2).join(", ")) : p.asks.length ? fill(COPY.teachesOf, { n: p.asks.length, m: C.asks.length }) : p.codes.slice(0, 2).join(", "), row: p }))
    : C.employers.map(e => ({ key: e.company, label: fill(COPY.openLabel, { company: e.company, n: fmt(e.nOpen) }), row: { company: e.company } }));

  return { TYPES, COPY, CORNELL_SCHOOLS, types, typeOf, ctx, askRows, who, where, say, approach: say, companyOf, targetsOf, jobsHref, askable, liPeople, liAlumni, fill, an, join, short };
});
