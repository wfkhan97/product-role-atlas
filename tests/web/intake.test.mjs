// web/app.js Intake: the pure table behind the intake box (v19 B5), the one call to action the rail, the fit screen,
// the launcher, the networking screen and the class picker end in. Every string is under 20 words a sentence, says
// no banned word and nothing about a cohort, a price, a date or applying; the sources are capture.js's list, and the
// kind of a box (intake_<surface>, v19 B7) is one of them.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web } from "./_load.mjs";

const { Intake, Stage } = require(path.join(web, "app.js"));
const Capture = require(path.join(web, "capture.js"))({});

function strings(x, out = []) {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) x.forEach(v => strings(v, out));
  else if (x && typeof x === "object") Object.values(x).forEach(v => strings(v, out));
  return out;
}
const all = () => [...strings({ heading: Intake.heading, line: Intake.line, email: Intake.email, button: Intake.button, done: Intake.done, privacy: Intake.privacy }), Intake.gapsLine("Product Manager")];

test("the table holds every string the box draws, with one line per surface", () => {
  for (const k of ["heading", "email", "button", "done", "privacy"]) assert.ok(Intake[k] && typeof Intake[k] === "string", k);
  assert.deepEqual(Object.keys(Intake.line), ["skills", "network", "classes"]);
  assert.equal(Intake.heading, "GradBuddy is coming soon.");
  assert.equal(Intake.button, "Notify me");
  assert.ok(/^Got it\./.test(Intake.done));
  assert.ok(!/\{/.test(Intake.gapsLine("FP&A Manager")) && Intake.gapsLine("FP&A Manager").includes("FP&A Manager"));
  assert.equal(Stage.cta("looking", "rail"), Intake.heading, "the rail's call to action is the intake box");
});

test("the surface of a source: the rail's placeholders and the fit screen are skills; classes and network their own", () => {
  for (const w of ["show", "build", "ways", "fit", "start"]) assert.equal(Intake.surfaceOf(w), "skills", w);
  assert.equal(Intake.surfaceOf("classes"), "classes");
  assert.equal(Intake.surfaceOf("network"), "network");
});

test("no string says cohort, paid, apply, sign in or a date, and none uses utilize, leverage, facilitate, via or in order to", () => {
  const banned = [/\bcohort\b/i, /\bpaid\b/i, /\bapply\b/i, /\bapplied\b/i, /\bapplication/i, /\bsign[ -]?in\b/i, /\bNov 14\b/i, /\butili[sz]e/i, /\bleverage/i, /\bfacilitate/i, /\bvia\b/i, /\bin order to\b/i, /%|\bscore\b/i];
  for (const s of all()) for (const re of banned) assert.ok(!re.test(s), `${re} in "${s}"`);
});

test("no sentence runs over 20 words", () => {
  for (const s of all()) for (const sentence of s.split(/[.!?]+/)) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    assert.ok(words.length <= 20, `${words.length} words: "${sentence.trim()}"`);
  }
});

test("SOURCES is capture.js's list, so a click goes out only from a source the database accepts; every box sends as intake_<surface> (B7)", () => {
  assert.deepEqual(Intake.SOURCES, Capture.SOURCES);
  for (const s of ["door", "intake_skills", "intake_classes", "intake_network"]) assert.ok(Intake.SOURCES.includes(s), s);
  assert.ok(!Capture.SOURCES.includes("network"), "the networking box's source is intake_network, never a bare network");
  for (const w of ["show", "build", "ways", "fit", "start"]) assert.equal(Intake.kindOf(w), "intake_skills", w);
  assert.equal(Intake.kindOf("classes"), "intake_classes");
  assert.equal(Intake.kindOf("network"), "intake_network");
  for (const w of ["show", "build", "ways", "fit", "classes", "network"]) assert.ok(Intake.SOURCES.includes(Intake.kindOf(w)), `the kind of ${w} is a source`);
});
