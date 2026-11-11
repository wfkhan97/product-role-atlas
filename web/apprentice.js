/* The apprentice map's generator, the pure parts (2026-11-05): what the atlas knows about a class of roles and how it
   reads one person, the story cards World 1 opens with, and the map assembled from them. No DOM, no file, no network:
   a classic script that also loads in node, require("web/apprentice.js"), the way map.js does. The owner's scripts
   (pipeline/apprentice/ground.mjs, assemble.mjs) call it with the atlas read from disk and add the roster, the files and
   the hand-written cards; the site's function (web/api/tree.js) calls it for a signed-in person with the résumé text
   and the roles they picked, and writes the map to their folder. Nothing here calls a model.
     ground(deps, input)          Promise of the grounding without the classes and the student: the role, its tracks and
                                  skills, the person's read, the posting's names, the class of roles, the class tree and
                                  the read the map leads with. deps: { A, Matcher, EvidenceText } (the atlas's own
                                  modules); input: { profile, roles, posting, today }. Rejects with an Error whose
                                  `code` names the fault: no_roles, too_many_roles, dup_role, unknown_role, mixed_fields.
     storyCards(map, g, written)  World 1's story cards from the grounding (two at most), hand edits kept by id
     storyPrompt(parts)           the practice prompt of one story card
     assembleMap(map, g, date)    { map, declined, stories }: the map as version 2 from the map as written and the grounding
     selfServeMap(g, opts)        the map of a person with no written map: the story cards only, World 1 only, no company,
                                  no gap sentence; opts: { campus, program, date }
     WORLDS, STORY_STATES, STORY_MAX, BAND_LABEL, STATE */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Apprentice = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const today = () => new Date().toISOString().slice(0, 10);
  const fail = (code, message) => Object.assign(new Error(message), { code });

  // ---------- the words ----------
  const BAND_LABEL = { different: "New to the field", related: "Relevant foundation", in_range: "Qualified for the role", strong: "Strong match" };
  // the atlas's four states, in its words: shows (evidenced, or shown through a carrier) · said in other words
  // (transferable) · named, not shown or presumed from a role held (thin, presumed) · a gap (gap)
  const STATE = { evidenced: "shows", through: "shows", transferable: "shows in other words", thin: "must evidence better", presumed: "must evidence better", gap: "must build" };
  const WORDS = { evidenced: "evidenced: a line of work shows it", through: "shown through a way of working on the résumé", transferable: "said in other words: shown in another field's words", thin: "named, not shown", presumed: "presumed from a role held, not shown", gap: "a gap this role requires" };
  const STATE_ORDER = ["shows", "shows in other words", "must evidence better", "must build"];
  const PLACE_RANK = { trunk: 0, shared: 1, own: 2 };
  const shows = st => st === "shows" || st === "shows in other words";
  // a line of work: a bullet, the summary or the profile's prose (never a course, a degree, a skills list, a title or
  // a heading), at least six words, not shouted. The story cards rewrite one of these.
  const WORK_KINDS = new Set(["bullet", "summary", "other"]);
  const isWorkLine = l => WORK_KINDS.has(l.kind) && l.text.split(/\s+/).length >= 6 && l.text.replace(/[^A-Za-z]/g, "").length > 0 && l.text !== l.text.toUpperCase();

  // ---------- the grounding ----------
  // The role (the first of the class), its core and common skills with what each means in this field, the tracks (the
  // skill areas that cover the core), the person's read by the atlas matcher the way the fit page runs it, the posting
  // read as the pipeline reads one, the class of roles with each role's read, the class tree (R22 to R26) and the read
  // the map leads with (R31). The same object ground.mjs writes, less the classes and the student.
  async function ground({ A, Matcher, EvidenceText }, { profile, roles, posting, today: date } = {}) {
    const roleList = Array.isArray(roles) ? roles.map(r => String(r || "").trim()).filter(Boolean) : [];
    if (!roleList.length) throw fail("no_roles", "`roles:` is empty. Give one to four atlas role ids, such as pmm.");
    if (roleList.length > 4) throw fail("too_many_roles", `\`roles:\` holds ${roleList.length} ids. A class holds four at most.`);
    if (new Set(roleList).size !== roleList.length) throw fail("dup_role", "`roles:` names a role twice.");
    const profileText = String(profile || ""), postingText = String(posting || "");

    // ---------- the role ----------
    const ix = await A.index();
    let R;
    try { R = await A.role(roleList[0]); } catch (e) { throw fail("unknown_role", `The atlas has no role "${roleList[0]}": ${e.message}`); }
    const keys = A.fieldKeys(R);
    const T = EvidenceText.create({ kinds: R.kinds });
    const employers = { startup: 0, large: 0, firm: 0, other: 0 };
    for (const j of R.jobs) employers[A.employerType(j)] = (employers[A.employerType(j)] || 0) + 1;
    const n = R.jobs.length || 1;
    const role = {
      id: R.role.id, label: R.role.label, set: R.set, field: R.role.group, ladder: R.role.ladder || null,
      postings_n: R.jobs.length, open_n: R.jobs.filter(j => j.open).length, companies_n: R.role.nCompanies,
      employers: Object.fromEntries(Object.entries(employers).map(([k, v]) => [k, { n: v, share: v / n }])),
      defining: [...R.role.defining],
    };

    // ---------- the skills: core (asked by most postings) and common (by many), with what each means in this field ----------
    const grid = A.grid(R, R.jobs);
    const kindLabel = k => ((R.kinds || {})[k] || {}).label || k;
    const shownBy = h => Object.fromEntries(["artefacts", "verbs", "measures", "counterparts"].map(k => [k, Array.isArray((h || {})[k]) ? (h || {})[k].slice(0, 4) : []]));
    const skillRow = (s, tier) => {
      const sk = R.skillById[s.id] || {};
      return { id: s.id, label: s.name, kind: s.kind, kind_label: kindLabel(s.kind), tier, share: s.share, grows: s.grows || false, defining: s.defining,
        area: s.cluster, area_label: ((R.clusters || {})[s.cluster] || {}).label || s.cluster,
        what: sk.what || T.summary(sk) || null, reads_as: T.reads(sk, keys), line: T.line(sk, keys).text, how_shown: (sk.how_shown || {}).form || null,
        // the slots a line that shows it fills (pipeline/evidence.json); the story cards name them
        shown_by: shownBy(sk.how_shown) };
    };
    // the grid's right column is the atlas's "asked more at senior levels" mark
    const tierOf = row => [...row[0].map(s => ({ ...s, grows: false })), ...row[1].map(s => ({ ...s, grows: true }))].filter(s => s.kind !== "credential");
    const skills = [...tierOf(grid.rows[0]).map(s => skillRow(s, "core")), ...tierOf(grid.rows[1]).map(s => skillRow(s, "common"))];
    const skillById = Object.fromEntries(skills.map(s => [s.id, s]));

    // ---------- the tracks: the skill areas that cover the role's core skills (four to six), in the atlas's own order ----------
    const areas = A.areas(R, R.jobs).areas;
    const trackOf = a => ({ id: a.cluster, label: a.label, atlas_area: a.cluster, behaviours: !!a.behaviours, core: a.skills.filter(s => s.tier === 0).map(s => s.id), skills: a.skills.map(s => s.id) });
    let tracks = areas.filter(a => a.core > 0 && !a.merged).map(trackOf);
    for (const a of areas) if (tracks.length < 4 && !tracks.some(t => t.id === a.cluster)) tracks.push(trackOf(a));
    if (tracks.length > 6) tracks = tracks.slice(0, 6);

    // ---------- the person's read: the atlas matcher on the profile, the way the fit page runs it on a résumé ----------
    const { M, bands, group } = await A.matcher(R);
    const fit = M.match(profileText, { jobs: R.jobs, familyJobs: R.jobs, label: R.role.label }, { ladder: R.role.ladder });
    const band = Matcher.bandOf(fit.overall, bands, group);
    const readRows = fit.rows.filter(r => skillById[r.id] && (r.tier === "core" || r.tier === "common")).map(r => ({
      id: r.id, label: skillById[r.id].label, tier: r.tier, share: skillById[r.id].share, status: r.status, atlas_words: WORDS[r.status] || r.status, state: STATE[r.status] || "must build",
      through: r.throughName || null, lines: (r.lines || []).slice(0, 3).map(l => l.text), work_lines: (r.lines || []).filter(isWorkLine).slice(0, 3).map(l => l.text),
    }));
    const states = {};
    for (const r of readRows) (states[r.state] ||= []).push(r.id);
    const person = {
      band, band_label: BAND_LABEL[band] || "no bands for this field", years: fit.profile.years, persona: fit.profile.persona,
      roles_held: (fit.parsed.roles || []).filter(x => x.title).map(x => ({ title: x.title, years: x.years || 0, intern: !!x.isIntern })),
      read: readRows, states,
    };

    // ---------- the posting, read as the pipeline reads one ----------
    const postingRead = await A.readPosting(postingText);
    const postingSkills = [...postingRead.found].filter(id => R.skillById[id]).map(id => ({ id, label: R.skillById[id].name, asked_by_role: !!skillById[id] }));
    const postingNames = new Set(postingSkills.map(s => s.id));

    // ---------- the class of roles: the class tree (R22 to R26) and the read the map leads with (R31) ----------
    // Per role: its core and common skills (credentials out) and the matcher's read of the same profile. The tree's
    // nodes are the union of the roles' core skills; behaviors leave the nodes for one "How you work" line; a node sits
    // on the trunk when every role asks for it, on a shared branch when two or more do, on a role's own branch when one
    // does; its state is the best state across the roles that ask for it. `more` is the first role's common tier, off
    // the tree.
    const classRoles = [];
    for (const [i, rid] of roleList.entries()) {
      let RR = R;
      if (i > 0) { try { RR = await A.role(rid); } catch (e) { throw fail("unknown_role", `The atlas has no role "${rid}": ${e.message}`); } }
      if (RR.role.group !== R.role.group) throw fail("mixed_fields", `${rid} sits in the field "${RR.role.group}", not "${R.role.group}". A class holds one field.`);
      const g = RR === R ? grid : A.grid(RR, RR.jobs);
      let fitR = fit, bandR = band;
      if (RR !== R) {
        const mm = await A.matcher(RR);
        fitR = mm.M.match(profileText, { jobs: RR.jobs, familyJobs: RR.jobs, label: RR.role.label }, { ladder: RR.role.ladder });
        bandR = Matcher.bandOf(fitR.overall, mm.bands, mm.group);
      }
      const reads = {};
      for (const r of fitR.rows) reads[r.id] = { state: STATE[r.status] || "must build", status: r.status, line: (r.lines || [])[0] ? r.lines[0].text : null, through: r.throughName || null };
      const row = s => ({ id: s.id, name: s.name, kind: s.kind, area: s.cluster, share: +s.share.toFixed(3), grows: s.grows });
      classRoles.push({ id: RR.role.id, label: RR.role.label, first: RR === R, postings_n: RR.jobs.length, companies_n: RR.role.nCompanies, band: bandR, band_label: BAND_LABEL[bandR] || "no bands for this field",
        core: tierOf(g.rows[0]).map(row), common: tierOf(g.rows[1]).map(row), reads });
    }
    const fieldLabel = (ix.groups.find(x => x.id === R.role.group) || {}).label || R.role.group;
    const roleClass = { id: R.role.group, label: `${fieldLabel} roles`, field: R.role.group, roles: classRoles.map(r => ({ id: r.id, label: r.label, first: r.first, postings_n: r.postings_n, companies_n: r.companies_n, band: r.band, band_label: r.band_label,
      core: r.core, common: r.common, read: Object.entries(r.reads).filter(([id]) => r.core.some(s => s.id === id) || r.common.some(s => s.id === id)).map(([id, x]) => ({ id, ...x })) })) };
    const asking = id => classRoles.filter(r => r.core.some(s => s.id === id));
    const best = list_ => STATE_ORDER.find(st => list_.includes(st)) || "must build";
    const treeNodes = [], treeBehaviours = [];
    for (const id of [...new Set(classRoles.flatMap(r => r.core.map(s => s.id)))]) {
      const rs = asking(id);
      const s0 = rs[0].core.find(s => s.id === id);
      const reads = rs.map(r => r.reads[id]).filter(Boolean);
      const state = best(reads.map(x => x.state));
      const pick = reads.find(x => x.state === state) || {};
      const node = { id, name: s0.name, area: s0.area, area_label: ((R.clusters || {})[s0.area] || {}).label || s0.area,
        place: rs.length === classRoles.length ? "trunk" : rs.length >= 2 ? "shared" : "own", roles: rs.map(r => r.id), state,
        ...(pick.line ? { line: pick.line } : {}), ...(pick.through ? { through: pick.through } : {}),
        grows: rs.some(r => r.core.find(s => s.id === id).grows), posting_names: postingNames.has(id),
        share: Object.fromEntries(rs.map(r => [r.id, r.core.find(s => s.id === id).share])) };
      (s0.kind === "behaviour" ? treeBehaviours : treeNodes).push(node);
    }
    treeNodes.sort((a, b) => PLACE_RANK[a.place] - PLACE_RANK[b.place] || b.roles.length - a.roles.length || a.name.localeCompare(b.name));
    const onTree = new Set([...treeNodes, ...treeBehaviours].map(n => n.id));
    const firstRole = classRoles[0];
    const more = firstRole.common.filter(s => s.kind !== "behaviour" && !onTree.has(s.id)).map(s => ({ id: s.id, name: s.name, state: (firstRole.reads[s.id] || {}).state || "must build" }));
    const tree = { nodes: treeNodes, behaviours: treeBehaviours, more };
    const readOut = {
      band, band_label: person.band_label,
      // every skill the first role's read found, core or common, with the line that showed it
      brings: readRows.filter(r => shows(r.state)).map(r => ({ id: r.id, name: r.label, state: r.state, line: r.lines[0] || null })),
      // the posting's gaps on the tree, in the tree's order, at most eight
      marked_gaps: treeNodes.filter(n => n.posting_names && !shows(n.state)).map(n => n.id).slice(0, 8),
      how_you_work: { shows: treeBehaviours.filter(n => shows(n.state)).map(n => n.id), rest: treeBehaviours.filter(n => !shows(n.state)).map(n => n.id) },
    };

    return { generated: date || today(), atlas: { path: ".", generated: ix.M.meta.generated, country: ix.M.meta.country },
      posting: { url: null, title: null, skills_named: postingSkills, names: [...postingNames] },
      role, tracks, skills, person, role_class: roleClass, tree, read: readOut };
  }

  // ---------- the worlds ----------
  // The worlds are the levels in order (R27); a world clears after k of its n missions (R28). These are the defaults;
  // the owner may set another clear per world by hand, and the check refuses one above the count. World 1 opens with
  // the story cards, which walk the person through one line of their own; the build cards follow (2026-11-05).
  const WORLDS = [
    { n: 1, label: "Fundamentals", who: "Guided first: two lines of your own, then a page each. A few hours apiece.", clear: 2 },
    { n: 2, label: "Three demos in a day", who: "You build with help beside you. One day each.", clear: 2 },
    { n: 3, label: "One project, real users", who: "You build on your own, for real users. Four to eight weeks.", clear: 1 },
    { n: "reach", label: "Reach", who: "A product-sized project with no deadline. It never blocks a world.", clear: 0, optional: true },
  ];

  // ---------- the story cards (World 1, written here, never by the skill) ----------
  // A story card takes one skill the résumé half shows (must evidence better: named, not shown; shows in other words:
  // shown in another field's words) and asks for one line, rewritten so the atlas reads the skill as shown. The card
  // carries the line as it stands, what the skill means in this field, the slots a line that shows it fills (the
  // artefacts, verbs, measures and counterparts of pipeline/evidence.json) and a prompt the person can paste into any
  // model to practise the rewrite. The atlas reads the new line live, in the browser, with the same matcher that read
  // the résumé. Two at most: the posting's skills first, then the skills most postings ask for. Nothing is invented:
  // every word comes from the grounding, and the prompt tells the model to leave a blank where a number goes. The line
  // is a line of work (work_lines above): a course list or a skills list is never the line to rewrite.
  const STORY_STATES = ["must evidence better", "shows in other words"];
  const STORY_MAX = 2;
  const STATE_WORDS = { "must evidence better": "named, not shown", "shows in other words": "shown in another field's words" };
  const list = (xs, n = 3) => (xs || []).slice(0, n);
  // a skill's name mid-sentence: "positioning & messaging", but "AI / machine learning" keeps its acronym
  const lower = n => /^[A-Z]{2,}/.test(n) ? n : n[0].toLowerCase() + n.slice(1);
  const words = xs => { const l = list(xs); return l.length <= 1 ? l.join("") : l.slice(0, -1).join(", ") + " or " + l[l.length - 1]; };
  // "nearly every posting", "about 2 in 3 postings", ... (the fit page's words), never a percentage
  const shareWords = v => v >= 0.9 ? "Nearly every posting for {role} asks" : v >= 0.6 ? "About two in three postings for {role} ask" : v >= 0.45 ? "About half of the postings for {role} ask" : v >= 0.3 ? "About one in three postings for {role} ask" : v >= 0.22 ? "About one in four postings for {role} ask" : "Many postings for {role} ask";

  function storyPrompt({ skill, role, field, state, line, what, reads_as, shown_by }) {
    const h = shown_by || {};
    const p = [];
    p.push(`I am rewriting one line of my résumé for a ${role} role. The skill the line should show is "${skill}": ${what || "see below"}`);
    if (reads_as) p.push(`In ${field}, it means: ${reads_as}`);
    p.push(`The line today reads: "${line}". An automatic reader marks it "${STATE_WORDS[state] || state}".`);
    const slots = [];
    if (h.artefacts && h.artefacts.length) slots.push(`names the thing produced (${words(h.artefacts)})`);
    if (h.verbs && h.verbs.length) slots.push(`starts with a verb like ${words(h.verbs)}`);
    if (h.counterparts && h.counterparts.length) slots.push(`says who it was with (${words(h.counterparts)})`);
    if (h.measures && h.measures.length) slots.push(`gives a measure (${words(h.measures)})`);
    if (slots.length) p.push(`A line that shows it ${slots.join("; ")}.`);
    p.push(`Ask me three questions about what I actually did, one at a time. Then draft three versions of the line, each under 30 words, in the past tense. Never invent a number or a name: write [ ] where I must fill one in.`);
    return p.join("\n");
  }

  function storyCards(map, g, written = []) {
    const read = Array.isArray((g.person || {}).read) ? g.person.read : [];
    const nodes = Array.isArray((g.tree || {}).nodes) ? g.tree.nodes : [];
    const nodeOf = Object.fromEntries(nodes.map(n => [n.id, n]));
    const skillOf = Object.fromEntries((g.skills || []).map(s => [s.id, s]));
    const tracks = Array.isArray(map.tracks) ? map.tracks : [];
    const first = (g.role || {}).id;
    const kept = Object.fromEntries(written.filter(c => c && c.kind === "story").map(c => [c.id, c]));
    const picks = read
      .filter(r => STORY_STATES.includes(r.state) && nodeOf[r.id] && (r.work_lines || [])[0])
      .sort((a, b) => (nodeOf[b.id].posting_names ? 1 : 0) - (nodeOf[a.id].posting_names ? 1 : 0) || (b.share || 0) - (a.share || 0) || a.id.localeCompare(b.id))
      .slice(0, STORY_MAX);
    return picks.map(r => {
      const node = nodeOf[r.id], sk = skillOf[r.id] || {}, line = r.work_lines[0];
      const track = tracks.find(t => t.atlas_area === node.area) || tracks[0] || {};
      const name = node.name || r.label || r.id;
      const shown_by = sk.shown_by || { artefacts: [], verbs: [], measures: [], counterparts: [] };
      const prev = kept[`s1-${r.id}`] || {};
      const card = {
        id: `s1-${r.id}`, kind: "story", level: 1, track: track.id || null,
        title: `${name}, said so it shows`,
        ship: `One line of your résumé, rewritten so the atlas reads ${lower(name)} as shown. Paste it on the card: the read runs in your browser, with the reader that read your résumé.`,
        hours: 1, window: "one sitting",
        skill: r.id, state: r.state, line,
        what: sk.what || null, reads_as: sk.reads_as || null, shown_by,
        prompt: storyPrompt({ skill: name, role: (g.role || {}).label || first, field: (g.role_class || {}).label ? (g.role_class.label.replace(/ roles$/, "")) : (g.role || {}).field, state: r.state, line, what: sk.what, reads_as: sk.reads_as, shown_by }),
        why_role: { text: `${shareWords(r.share || 0).replace("{role}", (g.role || {}).label || "this role")} for ${lower(name)}.${node.posting_names ? " This posting names it." : ""}`, posting_quote: null },
        why_person: { text: r.state === "shows in other words" ? "Your line shows it in another field's words. Said in this field's words, it shows." : "Your line names the work but not what you produced or what changed. One line can.", profile_quote: line },
        atlas_skills: [r.id], classes: [],
        sources: [{ title: `${name} in the job atlas, ${(g.role || {}).label || ""}`.trim(), url: `#/role/${first}`, read: (g.atlas || {}).generated || (g.generated || null) }],
      };
      for (const k of ["shipped", "changed", "declined", "reply"]) if (prev[k] != null) card[k] = prev[k];
      return card;
    });
  }

  // ---------- the map ----------
  // The map as version 2 from the map as written and the grounding: { map, declined, stories }. Writes nothing.
  function assembleMap(map, g, date = today()) {
    const written = Array.isArray(map.cards) ? map.cards : [];
    const stories = storyCards(map, g, written);
    const cards = [...stories, ...written.filter(c => !(c && c.kind === "story"))];
    const declined = new Set(cards.filter(c => c.declined).map(c => c.id));
    const before = Object.fromEntries((Array.isArray(map.worlds) ? map.worlds : []).map(w => [String(w.n), w]));
    const worlds = [];
    for (const w of WORLDS) {
      const missions = cards.filter(c => String(c.level) === String(w.n)).map(c => c.id);   // the story cards first in World 1
      if (w.n === "reach" && !missions.length) continue;                           // the Reach exists only with its card
      const live = missions.filter(id => !declined.has(id)).length;                 // a declined mission leaves n (R29)
      // A clear the owner set by hand stays: one that is neither the default nor the default capped at the last count.
      const prev = before[String(w.n)];
      const lastAuto = prev ? Math.min(w.clear, (prev.missions || []).length) : null;
      const byHand = prev && Number.isInteger(prev.clear) && prev.clear !== w.clear && prev.clear !== lastAuto;
      worlds.push({ n: w.n, label: w.label, who: w.who, clear: byHand ? prev.clear : Math.min(w.clear, live), ...(w.optional ? { optional: true } : {}), missions });
    }
    // the side projects the person picked (web/quests.js, 2026-11-11) keep their own level, first on the path
    const sides = cards.filter(c => c && c.kind === "side_project").map(c => c.id);
    if (sides.length) worlds.unshift({ n: "side", label: (before.side || {}).label || "Your side project", missions: sides });

    // The deterministic parts first, then what the skill and the owner wrote, then anything else the file holds.
    const out = {
      version: 2, published: date, atlas_generated: (g.atlas || {}).generated || null,
      student: map.student,
      role_class: { id: g.role_class.id, label: g.role_class.label, field: g.role_class.field, roles: g.role_class.roles.map(r => ({ id: r.id, label: r.label, first: !!r.first })) },
      role: { id: g.role.id, label: g.role.label, postings_n: g.role.postings_n },
      company: map.company,
      posting: { ...(map.posting || {}), names: g.posting.names || [] },
      gap_sentence: map.gap_sentence,
      tree: g.tree, read: g.read,
      tracks: map.tracks,
      worlds, cards,
    };
    for (const [k, v] of Object.entries(map)) if (!(k in out) && k !== "levels") out[k] = v;   // `levels` was version 1
    return { map: out, declined, stories: stories.length };
  }

  // The map of a person who has no written map (the self-serve tier, 2026-11-05): the grounding's own tracks, the
  // story cards, World 1 alone (a world with no mission is left out), no company, no posting title, no gap sentence.
  // `student.self_serve` marks it, so a rebuild overwrites it and never a map the owner wrote by hand.
  function selfServeMap(g, { campus = null, program = null, date } = {}) {
    const written = {
      student: { slug: null, name_on_page: null, campus, program, self_serve: true },
      company: null, posting: { url: null, title: null }, gap_sentence: null,
      tracks: (g.tracks || []).map(t => ({ id: t.id, label: t.label, atlas_area: t.atlas_area })),
      cards: [],
    };
    const out = assembleMap(written, g, date);
    out.map.worlds = out.map.worlds.filter(w => w.missions.length);
    return out;
  }
  // a map the owner wrote: any card that is neither a story card nor a side project the person picked (2026-11-11)
  const byHand = map => !!map && Array.isArray(map.cards) && map.cards.some(c => c && c.kind !== "story" && c.kind !== "side_project");

  return { ground, storyCards, storyPrompt, assembleMap, selfServeMap, byHand, WORLDS, STORY_STATES, STORY_MAX, BAND_LABEL, STATE, isWorkLine };
});
