// web/index.html: every local script and stylesheet the shell names exists on disk, and so does every file the token
// stylesheet imports. The site has no build step, so a hosted copy of web/ serves exactly these paths (README,
// "Hosting"); a tag that names a missing file is a blank page in production and nothing else catches it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { root } from "./_load.mjs";

const web = path.join(root, "web");
const html = fs.readFileSync(path.join(web, "index.html"), "utf8");
const remote = s => /^(https?:)?\/\//.test(s) || s.startsWith("data:");
const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];

// the local src of every <script> and the local href of every <link rel="stylesheet">
function localAssets(text) {
  const out = [];
  for (const tag of text.match(/<script\b[^>]*>/g) || []) { const src = attr(tag, "src"); if (src && !remote(src)) out.push(src); }
  for (const tag of text.match(/<link\b[^>]*>/g) || []) {
    const href = attr(tag, "href"), rel = attr(tag, "rel") || "";
    if (href && !remote(href) && /\bstylesheet\b/.test(rel)) out.push(href);
  }
  return out;
}
// the files a stylesheet imports with @import "x" or @import url(x), relative to the stylesheet
function imports(file) {
  const dir = path.dirname(file), text = fs.readFileSync(file, "utf8");
  return [...text.matchAll(/@import\s+(?:url\()?["']?([^"')\s;]+)["']?\)?/g)].map(m => m[1]).filter(s => !remote(s)).map(s => path.join(dir, s));
}

test("every local script and stylesheet in web/index.html exists", () => {
  const assets = localAssets(html);
  assert.ok(assets.length >= 10, `expected the shell to name its scripts and styles, found ${assets.length}`);
  for (const a of assets) {
    assert.ok(!a.startsWith("/"), `${a}: an absolute path breaks a hosted copy served under a prefix; use a relative one`);
    assert.ok(fs.existsSync(path.join(web, a)), `${a} is named in web/index.html but missing under web/`);
  }
});

test("every file the token stylesheet imports exists", () => {
  const seen = new Set();
  const walk = file => { for (const f of imports(file)) { if (seen.has(f)) continue; seen.add(f); assert.ok(fs.existsSync(f), `${path.relative(web, f)} is imported but missing`); walk(f); } };
  for (const a of localAssets(html).filter(a => a.endsWith(".css"))) walk(path.join(web, a));
  assert.ok(seen.size >= 5, `expected the token stylesheet to import its parts, found ${seen.size}`);
});

test("the remote scripts pin a version", () => {
  for (const tag of html.match(/<script\b[^>]*>/g) || []) {
    const src = attr(tag, "src");
    if (src && remote(src)) assert.match(src, /@\d+\.\d+\.\d+|\/\d+\.\d+\.\d+\//, `${src} names no exact version`);
  }
});
