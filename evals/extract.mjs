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
    // pdf.js prints a warning about the canvas module when it loads; it needs no canvas to read text
    const say = [console.log, console.warn]; console.log = console.warn = () => {};
    let pdfjs; try { pdfjs = require("pdfjs-dist/legacy/build/pdf.js"); } finally { [console.log, console.warn] = say; }
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

// node evals/extract.mjs <file>   print a file's text as the app reads it (to read a sample before writing its expectations)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname) && process.argv[2]) console.log(await extractText(process.argv[2]));
