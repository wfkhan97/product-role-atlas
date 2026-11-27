// web/ui.js: the shared components' render helpers, and the shell and stylesheet that go with them. Each helper
// returns the markup its rule in style.css draws; a screen never writes that markup itself.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { web, require } from "./_load.mjs";

const UI = require(path.join(web, "ui.js"));
const css = fs.readFileSync(path.join(web, "style.css"), "utf8");
const html = fs.readFileSync(path.join(web, "index.html"), "utf8");

test("cx joins strings, arrays and { name: condition }, and drops what is falsy", () => {
  assert.equal(UI.cx("a", null, ["b", false, "c"], { d: true, e: 0 }), "a b c d");
  assert.equal(UI.cx(), "");
});

test("attrs escapes values, writes a bare name for true and drops false, null and undefined", () => {
  assert.equal(UI.attrs({ id: "x", title: 'a "b" <c>', disabled: true, hidden: false, "data-x": null }), ' id="x" title="a &quot;b&quot; &lt;c&gt;" disabled');
});

test("btn: a button by default, a link with href, its kind and size as classes, the label escaped", () => {
  assert.equal(UI.btn("Next"), '<button type="button" class="btn">Next</button>');
  assert.equal(UI.btn("Go <on>", { kind: "primary", size: "lg", id: "go", disabled: true }), '<button type="button" class="btn primary lg" id="go" disabled>Go &lt;on&gt;</button>');
  assert.equal(UI.btn("Back", { kind: "quiet", href: "#/home" }), '<a class="btn quiet" href="#/home">Back</a>');
  assert.match(UI.btn("<b>x</b>", { html: true, size: "sm" }), /class="btn sm"><b>x<\/b></);
});

test("close is the one × with its name; the string a screen can find and replace", () => {
  assert.equal(UI.close("Close"), '<button type="button" class="close" aria-label="Close">×</button>');
  assert.equal(UI.close("Close", { id: "fb-close" }), '<button type="button" class="close" id="fb-close" aria-label="Close">×</button>');
});

test("chip: a span that names, a button that toggles with aria-pressed, a link, a pick with its ×", () => {
  assert.equal(UI.chip("SQL"), '<span class="chip">SQL</span>');
  assert.equal(UI.chip("Remote", { pressed: true, count: "4,988" }), '<button type="button" class="chip on" aria-pressed="true">Remote<span class="n">4,988</span></button>');
  assert.equal(UI.chip("Remote", { pressed: false }), '<button type="button" class="chip" aria-pressed="false">Remote</button>');
  assert.match(UI.chip("Roundtable", { href: "#/x", on: true }), /^<a class="chip on" href="#\/x" aria-current="page">/);
  assert.match(UI.chip("PMM", { on: true, remove: "Remove PMM" }), /<span class="chip on chip-pick">PMM<button type="button" class="chip-x" aria-label="Remove PMM">×<\/button><\/span>/);
});

test("pill, eyebrow, spinner, callout, status and field draw their classes", () => {
  assert.equal(UI.pill("Beginner"), '<span class="pill">Beginner</span>');
  assert.equal(UI.pill("Intermediate", "blue"), '<span class="pill blue">Intermediate</span>');
  assert.equal(UI.eyebrow("Skills", "h3"), '<h3 class="eyebrow">Skills</h3>');
  assert.equal(UI.eyebrow("Skills", "script"), '<p class="eyebrow">Skills</p>');
  assert.equal(UI.spinner(), '<span class="spinner" aria-hidden="true"></span>');
  assert.equal(UI.callout({ title: "Writing", body: "<p>Keep this open.</p>", spinner: true, role: "status" }), '<div class="callout busy" role="status"><span class="spinner" aria-hidden="true"></span><div><b>Writing</b><p>Keep this open.</p></div></div>');
  assert.equal(UI.status("Add a role", { tone: "error", id: "e" }), '<p class="status error" id="e" role="alert">Add a role</p>');
  assert.equal(UI.status("Copied."), '<p class="status" aria-live="polite">Copied.</p>');
  assert.equal(UI.field({ label: "Email", id: "em", type: "email", placeholder: "you@school.edu" }), '<label class="field"><span class="field-label">Email</span><input type="email" placeholder="you@school.edu" id="em"></label>');
  assert.match(UI.field({ type: "select", value: "b", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] }), /<option value="b" selected>B<\/option>/);
});

test("the shell loads ui.js before every screen's script, and sets a chosen theme before the stylesheet", () => {
  const at = f => html.indexOf(`<script src="${f}"></script>`);
  assert.ok(at("ui.js") > 0 && at("ui.js") < at("pick.js") && at("ui.js") < at("app.js"));
  assert.ok(html.indexOf('localStorage.getItem("theme")') > 0 && html.indexOf('localStorage.getItem("theme")') < html.indexOf('href="style.css"'));
});

test("style.css has one rule set per component, on the tokens, and no second copy", () => {
  for (const sel of [".btn {", ".btn.sm {", ".btn.lg {", "button.close {", ".chip {", ".seg {", ".sr-only {", ".status {"]) {
    assert.equal(css.split("\n" + sel).length - 1, 1, `${sel} is defined once`);
  }
  assert.match(css, /\.btn:disabled, \.btn\[aria-disabled="true"\] \{ opacity: 0\.5;/);
  assert.match(css, /\.chip\.on, \.chip\[aria-pressed="true"\] \{/);
  // a screen sizes a button with .sm or .lg, never with a rule of its own
  assert.ok(!/\.(wait|guide-f|sm-plan|sp-next|q-actions) \.btn(\.big)? \{[^}]*(padding|min-height)/.test(css), "a screen resizes .btn with its own rule");
  // depth and motion come from the tokens: no literal black shadow or scrim
  assert.ok(!/rgba\(0, 0, 0/.test(css), "a literal black shadow or scrim in style.css");
  // the open flow's step frame is scoped to its page: the Skill path game's page carries the same class name
  assert.ok(!/^\.sp (\{|h1)/m.test(css), "a bare .sp rule in style.css");
});
