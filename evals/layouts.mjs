// Layout variants of a sample resume: the same content written the ways real resumes are written.
// The matcher must read each variant like the original (same roles, years, persona, level, about the same score).
// Samples write a role as "Title, Employer (2019 - 2022)" and bullets as "- text"; each variant rewrites those.

const ROLE = /^(.+?), ([^,(]+?) \((\d{4}) - (\d{4}|Present)\)$/;
const mapRoles = (text, f) => text.split("\n").map(l => { const m = l.match(ROLE); return m ? f(m[1], m[2], m[3], m[4]) : l; }).join("\n");
const bullets = (text, glyph) => text.replace(/^- /gm, glyph);
const wrap = (text, width) => text.split("\n").map(l => {
  if (!/^[•▪] /.test(l) || l.length <= width) return l;
  const words = l.split(" "); const out = []; let cur = "";
  for (const w of words) { if ((cur + " " + w).length > width && cur) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
  return [...out, cur].join("\n");
}).join("\n");

export const VARIANTS = {
  dates_mm_yyyy: t => mapRoles(t, (title, emp, a, b) => `${title}, ${emp}   01/${a}   –   ${b === "Present" ? "Present" : "01/" + b}`),
  dates_month_names: t => mapRoles(t, (title, emp, a, b) => `${title}, ${emp} | Jan ${a} - ${b === "Present" ? "Present" : "Jan " + b}`),
  // a PDF that breaks the year in two after the month: "Jan 20 19 - Jan 20 22"
  dates_year_split: t => mapRoles(t, (title, emp, a, b) => `${title}, ${emp} | Jan ${a.slice(0, 2)} ${a.slice(2)} - ${b === "Present" ? "Present" : "Jan " + b.slice(0, 2) + " " + b.slice(2)}`),
  dates_no_parens: t => mapRoles(t, (title, emp, a, b) => `${title}, ${emp}   ${a} – ${b}`),
  employer_line_above: t => mapRoles(t, (title, emp, a, b) => `${emp.toUpperCase()}   New York, NY\n${title}   ${a} – ${b}`),
  employer_first: t => mapRoles(t, (title, emp, a, b) => `${emp} — ${title} (${a} - ${b})`),
  bullets_dot: t => bullets(t, "•   "),
  bullets_square: t => bullets(t, "▪ "),
  bullets_wrapped: t => wrap(bullets(t, "• "), 95),
  crlf: t => t.replace(/\n/g, "\r\n"),
  spaced_hyphens: t => t.replace(/([a-z])-([a-z])/g, "$1 - $2"),
  // a PDF text layer that sets the ligatures apart: "pro fi t", "work fl ow", "for   fi nance"
  ligatures_split: t => t.replace(/ (fi|fl)(?=[a-z]{2})/g, "   $1 ").replace(/([a-z])(ffi|ffl|ff|fi|fl)(?=[a-z])/g, "$1 $2 "),
  // a Word text box or a side column whose heading lands inside the work history: the later jobs then sit under
  // "Key Skills", with the title on its own line above the employer and dates
  side_heading_inside_jobs: t => { let n = 0; return mapRoles(t, (title, emp, a, b) => `${++n === 2 ? "Key Skills\n" : ""}${title}\n${emp}, New York, NY | ${a} to ${b}`); },
  headings_long: t => t.replace(/^EXPERIENCE$/m, "PROFESSIONAL EXPERIENCE").replace(/^SKILLS$/m, "TECHNICAL PROFICIENCY").replace(/^EDUCATION$/m, "EDUCATION & CREDENTIALS"),
  headings_title_case: t => t.replace(/^(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|PROJECTS|COURSEWORK)$/gm, h => h[0] + h.slice(1).toLowerCase()),
  // what a text layer of a one-page PDF often looks like: all of the above at once
  pdf_like: t => wrap(bullets(mapRoles(t, (title, emp, a, b) => `${emp.toUpperCase()}   New York, NY\n${title}   01/${a}   –   ${b === "Present" ? "Present" : "01/" + b}`), "•   "), 110).replace(/([a-z])-([a-z])/g, "$1 - $2"),
};

export function variants(text) {
  if (!text.split("\n").some(l => ROLE.test(l))) return []; // no dated roles to rewrite (a course list)
  return Object.entries(VARIANTS).map(([name, f]) => ({ name, text: f(text) }));
}
