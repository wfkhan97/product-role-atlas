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
  dates_no_parens: t => mapRoles(t, (title, emp, a, b) => `${title}, ${emp}   ${a} – ${b}`),
  employer_line_above: t => mapRoles(t, (title, emp, a, b) => `${emp.toUpperCase()}   New York, NY\n${title}   ${a} – ${b}`),
  employer_first: t => mapRoles(t, (title, emp, a, b) => `${emp} — ${title} (${a} - ${b})`),
  bullets_dot: t => bullets(t, "•   "),
  bullets_square: t => bullets(t, "▪ "),
  bullets_wrapped: t => wrap(bullets(t, "• "), 95),
  crlf: t => t.replace(/\n/g, "\r\n"),
  spaced_hyphens: t => t.replace(/([a-z])-([a-z])/g, "$1 - $2"),
  headings_long: t => t.replace(/^EXPERIENCE$/m, "PROFESSIONAL EXPERIENCE").replace(/^SKILLS$/m, "TECHNICAL PROFICIENCY").replace(/^EDUCATION$/m, "EDUCATION & CREDENTIALS"),
  headings_title_case: t => t.replace(/^(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|PROJECTS|COURSEWORK)$/gm, h => h[0] + h.slice(1).toLowerCase()),
  // what a text layer of a one-page PDF often looks like: all of the above at once
  pdf_like: t => wrap(bullets(mapRoles(t, (title, emp, a, b) => `${emp.toUpperCase()}   New York, NY\n${title}   01/${a}   –   ${b === "Present" ? "Present" : "01/" + b}`), "•   "), 110).replace(/([a-z])-([a-z])/g, "$1 - $2"),
};

export function variants(text) {
  if (!text.split("\n").some(l => ROLE.test(l))) return []; // no dated roles to rewrite (a course list)
  return Object.entries(VARIANTS).map(([name, f]) => ({ name, text: f(text) }));
}
