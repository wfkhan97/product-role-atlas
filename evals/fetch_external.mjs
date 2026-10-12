// Fetch the published sample resumes that evals/external_sources.json marks "fetch": "script" into
// evals/resumes/external/ (gitignored). One request per file, two seconds apart. Files already there are kept.
//
//   node evals/fetch_external.mjs            # fetch what is missing
//   node evals/fetch_external.mjs --list     # show what would be fetched
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "resumes", "external");
const list = JSON.parse(fs.readFileSync(path.join(here, "external_sources.json"))).filter(e => e.fetch === "script");
const MAGIC = { pdf: b => b.subarray(0, 5).toString() === "%PDF-", docx: b => b[0] === 0x50 && b[1] === 0x4b };
const MAX = 5 * 1024 * 1024;
fs.mkdirSync(dir, { recursive: true });
for (const e of list) {
  const file = path.join(dir, `${e.id}.${e.file_type}`);
  if (process.argv.includes("--list")) { console.log(e.id.padEnd(44), e.file_type, e.url); continue; }
  if (fs.existsSync(file)) { console.log("have ", e.id); continue; }
  try {
    const res = await fetch(e.url, { headers: { "User-Agent": "product-role-atlas-evals/1.0 (fetches published sample resumes once for parser tests)" }, redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX) throw new Error(`too large (${buf.length} bytes)`);
    if (!MAGIC[e.file_type](buf)) throw new Error("not a " + e.file_type + " file");
    fs.writeFileSync(file, buf);
    console.log("saved", e.id, buf.length, "bytes");
  } catch (err) { console.log("FAIL ", e.id, String(err.message)); }
  await new Promise(r => setTimeout(r, 2000));
}
