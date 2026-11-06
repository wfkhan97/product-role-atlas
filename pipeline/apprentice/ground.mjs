// node pipeline/apprentice/ground.mjs <slug>  ->  grounding.json and grounding.md in the student's folder.
// It reads intake.md, posting.md and profile.md, the atlas's web/data/ and the Spring 2027 roster (config.json).
// It writes what the atlas knows about the role, how it reads the profile, and which classes cover the gaps.
// Then the class of roles (the intake's `roles:`): each role's core and common skills and read, the class tree, the
// posting's names and the read the map leads with. The atlas's own modules do the reading (web/atlas.js,
// web/match.js, web/catalog.js, web/evidence_text.js), loaded from this repository. Nothing here calls a model.
import fs from "fs";
import path from "path";
import { studentDir, readIntake, roleIds, read, isBlank, prose, list, writeJson, atlas, roster, rosterLabel, atlasRoot, config, today, rel, die } from "./_lib.mjs";

const slug = process.argv[2];
const dir = studentDir(slug);
const intakeText = read(path.join(dir, "intake.md"));
if (!intakeText) die(`${rel(dir)}/intake.md is missing`);
const intake = readIntake(intakeText);
const ans = intake.answers;
const roleList = roleIds(ans);
if (!roleList.length) die("intake.md: `roles:` is empty. Give one to three atlas role ids, such as pmm.");
if (roleList.length > 4) die(`intake.md: \`roles:\` holds ${roleList.length} ids. A class holds four at most.`);
if (new Set(roleList).size !== roleList.length) die("intake.md: `roles:` names a role twice.");

// posting.md and profile.md: split out of the intake when the student left them empty
const postingFile = path.join(dir, "posting.md"), profileFile = path.join(dir, "profile.md");
if (isBlank(read(postingFile))) fs.writeFileSync(postingFile, `# Posting\n\n${ans.posting_title || ""}\n${ans.posting_url || ""}\n\n${prose(intake.sections["2"])}\n`);
if (isBlank(read(profileFile))) fs.writeFileSync(profileFile, `# Profile\n\n${prose(intake.sections["3"])}\n\n## What I have built\n\n${prose(intake.sections["4"])}\n\n## The strangest fit\n\n${prose(intake.sections["6"])}\n${prose(intake.sections["9"]) ? `\n## More about you\n\n${prose(intake.sections["9"])}\n` : ""}`);
const posting = read(postingFile), profile = read(profileFile);

const { A, Matcher, Catalog, EvidenceText } = atlas();
const pct = v => `${Math.round(100 * v)}%`;

// ---------- the role ----------
const ix = await A.index();
let R;
try { R = await A.role(roleList[0]); } catch (e) { die(`The atlas has no role "${roleList[0]}": ${e.message}`); }
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
    // the slots a line that shows it fills (pipeline/evidence.json); the story cards name them (assemble.mjs)
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

// ---------- the person's read: the atlas matcher on profile.md, the way the fit page runs it on a résumé ----------
const { M, bands, group } = await A.matcher(R);
const fit = M.match(profile, { jobs: R.jobs, familyJobs: R.jobs, label: R.role.label }, { ladder: R.role.ladder });
const band = Matcher.bandOf(fit.overall, bands, group);
const BAND_LABEL = { different: "New to the field", related: "Relevant foundation", in_range: "Qualified for the role", strong: "Strong match" };
// the atlas's four states, in its words: shows (evidenced, or shown through a carrier) · said in other words
// (transferable) · named, not shown or presumed from a role held (thin, presumed) · a gap (gap)
const STATE = { evidenced: "shows", through: "shows", transferable: "shows in other words", thin: "must evidence better", presumed: "must evidence better", gap: "must build" };
const WORDS = { evidenced: "evidenced: a line of work shows it", through: "shown through a way of working on the résumé", transferable: "said in other words: shown in another field's words", thin: "named, not shown", presumed: "presumed from a role held, not shown", gap: "a gap this role requires" };
// a line of work: a bullet, the summary or the profile's prose (never a course, a degree, a skills list, a title or
// a heading), at least six words, not shouted. The story cards (assemble.mjs) rewrite one of these.
const WORK_KINDS = new Set(["bullet", "summary", "other"]);
const isWorkLine = l => WORK_KINDS.has(l.kind) && l.text.split(/\s+/).length >= 6 && l.text.replace(/[^A-Za-z]/g, "").length > 0 && l.text !== l.text.toUpperCase();
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
const gaps = readRows.filter(r => r.state !== "shows" && r.state !== "shows in other words").map(r => ({ id: r.id, name: r.label, tier: r.tier, w: r.share }));

// ---------- the posting, read as the pipeline reads one ----------
const postingRead = await A.readPosting(posting);
const postingSkills = [...postingRead.found].filter(id => R.skillById[id]).map(id => ({ id, label: R.skillById[id].name, asked_by_role: !!skillById[id] }));
const postingNames = new Set(postingSkills.map(s => s.id));

// ---------- the class of roles: the class tree (R22 to R26) and the read the map leads with (R31) ----------
// Per role: its core and common skills (credentials out) and the matcher's read of the same profile. The tree's nodes
// are the union of the roles' core skills; behaviors leave the nodes for one "How you work" line; a node sits on the
// trunk when every role asks for it, on a shared branch when two or more do, on a role's own branch when one does;
// its state is the best state across the roles that ask for it. `more` is the first role's common tier, off the tree.
const STATE_ORDER = ["shows", "shows in other words", "must evidence better", "must build"];
const classRoles = [];
for (const [i, rid] of roleList.entries()) {
  let RR = R;
  if (i > 0) { try { RR = await A.role(rid); } catch (e) { die(`The atlas has no role "${rid}": ${e.message}`); } }
  if (RR.role.group !== R.role.group) die(`intake.md: ${rid} sits in the field "${RR.role.group}", not "${R.role.group}". A class holds one field.`);
  const g = RR === R ? grid : A.grid(RR, RR.jobs);
  let fitR = fit, bandR = band;
  if (RR !== R) {
    const mm = await A.matcher(RR);
    fitR = mm.M.match(profile, { jobs: RR.jobs, familyJobs: RR.jobs, label: RR.role.label }, { ladder: RR.role.ladder });
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
const PLACE_RANK = { trunk: 0, shared: 1, own: 2 };
treeNodes.sort((a, b) => PLACE_RANK[a.place] - PLACE_RANK[b.place] || b.roles.length - a.roles.length || a.name.localeCompare(b.name));
const onTree = new Set([...treeNodes, ...treeBehaviours].map(n => n.id));
const firstRole = classRoles[0];
const more = firstRole.common.filter(s => s.kind !== "behaviour" && !onTree.has(s.id)).map(s => ({ id: s.id, name: s.name, state: (firstRole.reads[s.id] || {}).state || "must build" }));
const tree = { nodes: treeNodes, behaviours: treeBehaviours, more };
const shows = st => st === "shows" || st === "shows in other words";
const readOut = {
  band, band_label: person.band_label,
  // every skill the first role's read found, core or common, with the line that showed it
  brings: readRows.filter(r => shows(r.state)).map(r => ({ id: r.id, name: r.label, state: r.state, line: r.lines[0] || null })),
  // the posting's gaps on the tree, in the tree's order, at most eight
  marked_gaps: treeNodes.filter(n => n.posting_names && !shows(n.state)).map(n => n.id).slice(0, 8),
  how_you_work: { shows: treeBehaviours.filter(n => shows(n.state)).map(n => n.id), rest: treeBehaviours.filter(n => !shows(n.state)).map(n => n.id) },
};

// ---------- the classes: the Spring 2027 roster through the atlas course reader, against the person's gaps ----------
const campus = ans.campus || "Cornell Tech";
let classes;
if (/\bIE\b/i.test(campus)) classes = { campus, note: `no roster loaded for ${campus}` };
else {
  const rows = roster();
  if (!rows) classes = { campus, note: `no roster at ${rosterLabel}` };
  else {
    const campusFile = path.join(atlasRoot, "web/data/sp27_campus.json");
    const thresholds = fs.existsSync(campusFile) ? ((JSON.parse(fs.readFileSync(campusFile, "utf8")).campuses || []).find(c => c.id === config.campusId) || {}).relevance : null;
    const gridRows = Catalog.rowsOf(grid);
    const covering = [];
    for (const c of rows) {
      const text = [c.description, c.outcomes].filter(Boolean).join("\n");
      if (!text.trim()) continue;
      const rc = await A.readCourse(text);
      const covered = Catalog.gapsCovered(rc.teaches, gaps);
      if (!covered.length) continue;
      const rel_ = Catalog.relevanceScore(rc.found, gridRows);
      covering.push({ code: c.code, title: c.title, instructors: c.instructors || [], eligibility: c.eligibilityCategory || null, url: c.rosterUrl || null,
        covers: covered.map(g => ({ id: g.id, label: g.name, tier: g.tier })), relevance: thresholds ? Catalog.relevanceBand(rel_.score, thresholds) : null, names: [...rc.teaches].filter(id => skillById[id]) });
    }
    covering.sort((a, b) => b.covers.filter(g => g.tier === "core").length - a.covers.filter(g => g.tier === "core").length || b.covers.length - a.covers.length || a.code.localeCompare(b.code));
    const byCode = Object.fromEntries(rows.map(c => [c.code, c]));
    const own = codes => list(codes).map(code => { const c = byCode[code.toUpperCase()]; return c ? { code: c.code, title: c.title, instructors: c.instructors || [] } : { code, title: null, note: `not in the ${config.term} roster` }; });
    classes = { campus, term: config.term, roster: rosterLabel, roster_n: rows.length, covering, own: { current: own(ans.current_courses), spring: own(ans.spring_courses) } };
  }
}

// ---------- write ----------
const grounding = { generated: today(), atlas: { path: ".", generated: ix.M.meta.generated, country: ix.M.meta.country }, student: { slug, campus, program: ans.program || null, name_on_page: ans.name_on_page || null },
  company: { name: list(ans.companies)[0] || null, url: ans.company_url || null }, posting: { url: ans.posting_url || null, title: ans.posting_title || null, skills_named: postingSkills, names: [...postingNames] },
  role, tracks, skills, person, classes, role_class: roleClass, tree, read: readOut };
writeJson(path.join(dir, "grounding.json"), grounding);

const md = [];
md.push(`# Grounding for ${slug} · ${role.label} · ${grounding.generated}`, "");
md.push(`Read from the job atlas, this repository's \`web/data/\` (postings as of ${grounding.atlas.generated}, ${grounding.atlas.country}). Nothing here came from a model.`, "");
md.push(`## The role`, "");
md.push(`**${role.label}** (\`${role.id}\`, field ${role.field}): ${role.postings_n} postings from ${role.companies_n} employers. Startups ${pct(role.employers.startup.share)}, large companies ${pct(role.employers.large.share)}, consulting, banks and funds ${pct(role.employers.firm.share)}, other ${pct(role.employers.other.share)}.`);
if (role.defining.length) md.push(`What sets the role apart from other roles: ${role.defining.map(id => skillById[id] ? skillById[id].label : id).join(", ")}.`);
md.push("", `## The skills, and what each means in this field`, "");
md.push(`Core = asked by most postings (half or more); common = by many (a quarter or more). Share = postings that ask. Kind = how a person shows it (${Object.entries(R.kinds || {}).map(([k, v]) => `${v.label || k}: ${v.form || ""}`).join("; ")}).`, "");
for (const t of tracks) {
  md.push(`### Track · ${t.label} (\`${t.atlas_area}\`)`, "");
  for (const id of t.skills) { const s = skillById[id]; if (!s) continue; md.push(`- **${s.label}** (\`${s.id}\`, ${s.kind_label}, ${s.tier}, ${pct(s.share)}${s.grows ? ", asked more at senior levels" : ""}${s.defining ? ", sets the role apart" : ""}). ${s.what || ""}${s.reads_as ? ` In this field: ${s.reads_as}` : ""}`); }
  md.push("");
}
const offTrack = skills.filter(s => !tracks.some(t => t.skills.includes(s.id)));
if (offTrack.length) { md.push(`### Asked, outside the tracks`, ""); for (const s of offTrack) md.push(`- **${s.label}** (\`${s.id}\`, ${s.kind_label}, ${s.tier}, ${pct(s.share)}, area ${s.area_label}). ${s.what || ""}`); md.push(""); }
md.push(`## The person's read`, "");
md.push(`The atlas matcher on \`profile.md\`: **${person.band_label}** for this role (the band, never a score). ${person.years.toFixed(1)} years of work read; roles held: ${person.roles_held.map(r => `${r.title} (${r.years.toFixed(1)} y${r.intern ? ", internship" : ""})`).join("; ") || "none dated"}.`, "");
for (const [state, label] of [["shows", "Shows"], ["shows in other words", "Shows in other words"], ["must evidence better", "Must evidence better"], ["must build", "Must build"]]) {
  const rows = readRows.filter(r => r.state === state);
  md.push(`### ${label} (${rows.length})`, "");
  for (const r of rows) md.push(`- **${r.label}** (\`${r.id}\`, ${r.tier}, ${pct(r.share)}): ${r.atlas_words}${r.through ? ` (${r.through})` : ""}${r.lines.length ? ` — "${r.lines[0]}"` : ""}`);
  md.push("");
}
md.push(`## The posting, read by the atlas`, "");
md.push(postingSkills.length ? postingSkills.map(s => `${s.label}${s.asked_by_role ? "" : " (not among the role's core or common asks)"}`).join(", ") : "no skill named", "");
md.push(`## The classes`, "");
if (classes.note) md.push(classes.note, "");
else {
  md.push(`${classes.term} roster (${classes.roster_n} classes, \`${classes.roster}\`) through the atlas course reader. A class stays when it covers one of the person's gaps. A gap counts when the description names a method, technical, knowledge or tool skill. A behavior or a practice never counts.`, "");
  for (const c of classes.covering) md.push(`- **${c.code} · ${c.title}** (${c.instructors.join(", ") || "instructor not listed"}; ${c.eligibility || "eligibility not listed"}${c.relevance ? `; relevance ${c.relevance}` : ""}): covers ${c.covers.map(g => `${g.label} (${g.tier})`).join(", ")}`);
  md.push("", `### The student's own classes`, "");
  md.push(`Current: ${classes.own.current.map(c => c.title ? `${c.code} ${c.title}` : `${c.code} (${c.note})`).join("; ") || "none listed"}.`);
  md.push(`${classes.term}: ${classes.own.spring.map(c => c.title ? `${c.code} ${c.title}` : `${c.code} (${c.note})`).join("; ") || "none listed"}.`, "");
}
const nameOf = id => { const n = [...treeNodes, ...treeBehaviours].find(x => x.id === id) || readRows.find(x => x.id === id); return n ? n.name || n.label : id; };
const roleLabel = id => (classRoles.find(r => r.id === id) || {}).label || id;
const nodeLine = n => `- **${n.name}** (\`${n.id}\`): ${n.state}${n.posting_names ? "; the posting names it" : ""}${n.grows ? "; asked more at senior levels" : ""}${n.line ? ` — "${n.line}"` : ""}`;
md.push(`## The class tree`, "");
md.push(`${roleClass.label}: ${classRoles.map(r => `${r.label} (${r.band_label})`).join(", ")}. The map builds on ${classRoles[0].label}.`);
md.push(`The nodes are every core skill of the class, credentials out. A node shows its best state across the roles.`, "");
md.push(`### Trunk: every role asks for these`, "", ...treeNodes.filter(n => n.place === "trunk").map(nodeLine), "");
md.push(`### Shared: two or more roles ask for these`, "", ...treeNodes.filter(n => n.place === "shared").map(n => nodeLine(n) + ` (${n.roles.map(roleLabel).join(", ")})`), "");
for (const r of classRoles) { const own = treeNodes.filter(n => n.place === "own" && n.roles[0] === r.id); if (own.length) md.push(`### Own: only ${r.label} asks for these`, "", ...own.map(nodeLine), ""); }
md.push(`### How you work`, "", ...treeBehaviours.map(nodeLine), "");
md.push(`### More skills these roles sometimes ask for`, "", more.map(s => `${s.name} (${s.state})`).join(", ") || "none", "");
md.push(`## The read`, "");
md.push(`**${readOut.band_label}** for ${classRoles[0].label}. The map never shows a count.`, "");
md.push(`What you already bring: ${readOut.brings.map(b => b.name).join(", ") || "nothing the read found yet"}.`);
md.push(`The gaps the quests aim at: ${readOut.marked_gaps.map(nameOf).join(", ") || "none on the tree"}.`);
md.push(`How you work, shown: ${readOut.how_you_work.shows.map(nameOf).join(", ") || "none"}. Not shown yet: ${readOut.how_you_work.rest.map(nameOf).join(", ") || "none"}.`, "");
fs.writeFileSync(path.join(dir, "grounding.md"), md.join("\n"));
console.log(`wrote ${rel(dir)}/grounding.json and grounding.md: ${role.label}, ${role.postings_n} postings; ${tracks.length} tracks; ${skills.length} core and common skills; person ${person.band_label}; ${classes.covering ? classes.covering.length + " classes cover a gap" : classes.note}`);
console.log(`class ${roleClass.label}: ${classRoles.length} roles, ${treeNodes.length} tree nodes (trunk ${treeNodes.filter(n => n.place === "trunk").length}, shared ${treeNodes.filter(n => n.place === "shared").length}, own ${treeNodes.filter(n => n.place === "own").length}), ${treeBehaviours.length} behaviors, ${more.length} more. The read brings ${readOut.brings.length} skills and marks ${readOut.marked_gaps.length} gaps.`);
