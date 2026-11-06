// node pipeline/apprentice/ground.mjs <slug>  ->  grounding.json and grounding.md in the student's folder.
// It reads intake.md, posting.md and profile.md, the atlas's web/data/ and the Spring 2027 roster (config.json).
// It writes what the atlas knows about the role, how it reads the profile, and which classes cover the gaps.
// Then the class of roles (the intake's `roles:`): each role's core and common skills and read, the class tree, the
// posting's names and the read the map leads with. The atlas's own modules do the reading (web/atlas.js,
// web/match.js, web/catalog.js, web/evidence_text.js), loaded from this repository; the pure part is
// web/apprentice.js (Apprentice.ground), which the site's function runs too. Nothing here calls a model.
import fs from "fs";
import path from "path";
import { studentDir, readIntake, roleIds, read, isBlank, prose, list, writeJson, atlas, apprentice, roster, rosterLabel, atlasRoot, config, rel, die } from "./_lib.mjs";

const Apprentice = apprentice();

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

// ---------- the role, the skills, the tracks, the person's read, the posting, the class tree and the read ----------
// The pure part lives in web/apprentice.js (the site's function runs the same code for a signed-in person).
let g;
try { g = await Apprentice.ground({ A, Matcher, EvidenceText }, { profile, roles: roleList, posting }); }
catch (e) { die(e.code === "unknown_role" ? e.message : e.code ? `intake.md: ${e.message}` : e.stack || e.message); }
const { role, tracks, skills, person, tree, read: readOut, role_class: roleClass } = g;
const skillById = Object.fromEntries(skills.map(s => [s.id, s]));
const readRows = person.read;
const treeNodes = tree.nodes, treeBehaviours = tree.behaviours, more = tree.more;
const classRoles = roleClass.roles;
const postingSkills = g.posting.skills_named, postingNames = new Set(g.posting.names);
const gaps = readRows.filter(r => r.state !== "shows" && r.state !== "shows in other words").map(r => ({ id: r.id, name: r.label, tier: r.tier, w: r.share }));
const R = await A.role(roleList[0]);
const grid = A.grid(R, R.jobs);

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
const grounding = { generated: g.generated, atlas: g.atlas, student: { slug, campus, program: ans.program || null, name_on_page: ans.name_on_page || null },
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
