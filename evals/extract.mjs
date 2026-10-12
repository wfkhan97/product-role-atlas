// Read a resume file the way the app does (web/app.js readFile): pdf.js text items for PDF, mammoth raw text
// for DOCX, the file itself for text. PDF and DOCX need `npm install` in evals/ (see evals/package.json).
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
export const READABLE = /\.(txt|pdf|docx)$/i;

export async function extractText(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".pdf") {
    const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, verbosity: 0 }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const c = await (await pdf.getPage(p)).getTextContent();
      pages.push(c.items.map(i => i.str + (i.hasEOL ? "\n" : " ")).join("").replace(/[ \t]+\n/g, "\n"));
    }
    return pages.join("\n");
  }
  if (ext === ".docx") return (await require("mammoth").extractRawText({ buffer: fs.readFileSync(file) })).value;
  return fs.readFileSync(file, "utf8");
}
