// node pipeline/apprentice/new.mjs <slug>  ->  data/apprentice/students/<slug>/ from INTAKE.md, with empty answers.
// node pipeline/apprentice/new.mjs <slug> --import  ->  the same folder copied from GradBuddy's apprentice/students/.
// The import is for students whose intake was taken in GradBuddy before the generator moved here. It reads the
// GradBuddy folder and never writes to it. Neither form overwrites a folder that exists. data/apprentice/ is gitignored.
import fs from "fs";
import path from "path";
import { here, studentsRoot, gradbuddyStudents, SLUG_RE, die, rel } from "./_lib.mjs";

const [slug, flag] = process.argv.slice(2);
if (!slug || !SLUG_RE.test(slug) || (flag && flag !== "--import")) die("usage: node pipeline/apprentice/new.mjs <slug> [--import]   (a slug is lowercase letters, digits and dashes)");
const dir = path.join(studentsRoot, slug);
if (fs.existsSync(dir)) die(`${rel(dir)} exists already; pick another slug or move that folder away`);

if (flag === "--import") {
  const src = path.join(gradbuddyStudents(), slug);
  if (!fs.existsSync(src)) die(`no folder ${src} to import`);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.cpSync(src, dir, { recursive: true, filter: f => path.basename(f) !== ".DS_Store" });
  const files = fs.readdirSync(dir, { recursive: true }).filter(f => fs.statSync(path.join(dir, f)).isFile());
  console.log(`imported ${rel(dir)}/ from GradBuddy: ${files.length} files. The GradBuddy folder is unchanged.`);
  console.log(`next: node pipeline/apprentice/ground.mjs ${slug}`);
} else {
  fs.mkdirSync(path.join(dir, "research"), { recursive: true });
  const intake = fs.readFileSync(path.join(here, "INTAKE.md"), "utf8").replace(/^slug:.*$/m, `slug: ${slug}`);
  fs.writeFileSync(path.join(dir, "intake.md"), intake);
  fs.writeFileSync(path.join(dir, "posting.md"), "<!-- posting.md: the posting's text, with its URL and title on the first lines. Left empty, ground.mjs copies section 2 of intake.md here. -->\n");
  fs.writeFileSync(path.join(dir, "profile.md"), "<!-- profile.md: the résumé or LinkedIn text the atlas matcher reads, plus what the student has built. Left empty, ground.mjs copies sections 3, 4 and 6 of intake.md here. -->\n");
  console.log(`created ${rel(dir)}/: intake.md (fill it in the week-0 session), posting.md, profile.md, research/`);
  console.log(`next: /apprentice-map ${slug}`);
}
