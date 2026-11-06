// Keyboard and contrast (the usability pass of 2026-11-06): the parts that live in strings. app.js draws the drop
// zone, the heart and the view buttons from these; tests/ui/keyboard.spec.mjs presses the keys in a browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { require, web } from "./_load.mjs";

const Copy = require(path.join(web, "copy.js"));
const app = fs.readFileSync(path.join(web, "app.js"), "utf8");
const css = fs.readFileSync(path.join(web, "style.css"), "utf8");

test("every drop zone is the one dropZone, whose \"choose a file\" is a button and not a label (a label is no Tab stop)", () => {
  assert.equal((app.match(/<div class="drop" id="drop">/g) || []).length, 1, "one drawing of the drop zone");
  assert.doesNotMatch(app, /<label class="link" for="file">/);
  assert.match(app, /<button type="button" class="linkish link" id="file-pick" aria-controls="file">\$\{esc\(RF\.choose\)\}<\/button>/);
  assert.match(app, /pick\.onclick = \(\) => \{ if \(!drop\.classList\.contains\("busy"\)\) \$\("#file"\)\.click\(\); \}/, "the button opens the file dialog, never while a read runs");
});

test("the open role's Save: its name starts with the words on the button, saved or not", () => {
  const H = Copy.heart, fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
  assert.ok(fill(H.saveRoleAria, { role: "Product Manager" }).startsWith(H.save));
  assert.ok(fill(H.savedRoleAria, { role: "Product Manager" }).startsWith(H.saved));
  assert.match(fill(H.saveRoleAria, { role: "Product Manager" }), /Product Manager/);
});

test("the Explore view buttons and the rail tab are named in words", () => {
  assert.equal(Copy.explore.gridView, "Fields as cards");
  assert.equal(Copy.explore.mapView, "Skill map");
  assert.match(app, /id="v-grid" aria-label="\$\{esc\(EX\.gridView\)\}"/);
  assert.match(app, /id="v-map" aria-label="\$\{esc\(EX\.mapView\)\}"/);
  assert.doesNotMatch(app, /railTab\.setAttribute\("aria-label"/, "the rail tab's name is its visible words");
});

test("in-text links carry an underline, and the game's key hint uses the primary button's own pairing", () => {
  assert.match(css, /:where\(p, li, dd, label, figcaption\) a:where\(:not\(\.btn\)\) \{ text-decoration: underline;/);
  const kbd = css.match(/\.gm \.btn\.primary kbd \{[^}]*\}/)[0];
  assert.match(kbd, /color: var\(--primary-foreground\)/);
  assert.doesNotMatch(kbd, /opacity/);
});
