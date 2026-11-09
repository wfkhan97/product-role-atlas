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

// 2026-11-08: the phone order is the markup's, so Tab follows it; the desktop columns are pinned in the CSS
test("Find jobs, the launcher and Networking put their content first in the markup, with no CSS order on a phone", () => {
  const phone = css.match(/@media \(max-width: 900px\) \{\n  \.jobs-grid \.jfilters-link[^}]*\}\n\}/);
  assert.ok(phone, "the phone block");
  assert.doesNotMatch(css, /order: -1/, "no CSS reorder anywhere");
  const at = s => { const i = app.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('<section class="jmain"') < at('<div class="jrail" id="jfilters"'), "Find jobs: the postings before the filters");
  assert.ok(at('<div class="lf-side" id="lf-side">') < at('<section class="lf-main"'), "the launcher: the résumé box before the tiles");
  assert.ok(at('<aside class="nw-side"') < at('<div class="nw-main">'), "Networking: the prep card before Who to look for");
  const desk = css.match(/@media \(min-width: 901px\) \{[^@]*\}/)[0];
  for (const [sel, col] of [[".jobs-grid .jrail", 1], [".jobs-grid .jmain", 2], [".lf-main", 1], [".lf-side", 2], [".nw-main", 1], [".nw-side", 2]])
    assert.match(desk, new RegExp(sel.replace(/\./g, "\\.") + ` \\{ grid-column: ${col}; grid-row: 1; \\}`), `${sel} pinned to column ${col}, row 1`);
});

// 2026-11-08: a posting's panel covers a phone's screen, so it is a dialog that keeps Tab inside it, through the same
// trapTab the feedback sheet uses
test("the posting panel is a dialog and the keydown keeps Tab in it on a phone; the feedback sheet shares trapTab", () => {
  assert.match(app, /const phoneMq = [^\n]*matchMedia\("\(max-width: 640px\)"\)/);
  assert.match(app, /function trapTab\(box, e\)/);
  assert.match(app, /const TAB_STOPS = 'button, textarea, input, select, a\[href\], \[tabindex\]:not\(\[tabindex="-1"\]\)'/);
  assert.match(app, /aside\.setAttribute\("role", "dialog"\); aside\.setAttribute\("aria-labelledby", on\); aside\.setAttribute\("aria-modal", String\(onPhone\(\)\)\)/);
  assert.match(app, /asideEsc = closePanel;\n\s*asideDialog\("jdetail-h"\)/, "drawPanel makes the aside a dialog named by the heading");
  assert.match(app, /function showAside\(html\) \{\n\s*asideDialog\(null\);/, "any other use of the aside drops the dialog");
  assert.match(app, /if \(e\.key === "Tab" && asideEsc && !aside\.hidden && !fbOpen && onPhone\(\)\) \{ trapTab\(aside, e\); return; \}/);
  assert.match(app, /if \(e\.key === "Tab"\) trapTab\(box, e\);/, "the feedback sheet's loop is trapTab");
});

test("the phone's verb strip fades at its cut edge, and the fade goes at the end of its scroll where the browser can tell", () => {
  const phone = css.slice(css.indexOf("@media (max-width: 640px) {\n  header.top"));
  const strip = phone.slice(0, phone.indexOf("@keyframes verbs-fade"));
  assert.match(strip, /\.verbs-nav \{ -webkit-mask-image: linear-gradient\(to right, #000 calc\(100% - 28px\), transparent\); mask-image: linear-gradient\(to right, #000 calc\(100% - 28px\), transparent\); \}/);
  assert.match(strip, /@supports \(animation-timeline: scroll\(\)\) \{\s*\.verbs-nav \{ animation: verbs-fade linear both; animation-timeline: scroll\(self inline\); \}/);
  assert.match(css, /@keyframes verbs-fade \{[^]*?100% \{ -webkit-mask-image: none; mask-image: none; \}/);
});
