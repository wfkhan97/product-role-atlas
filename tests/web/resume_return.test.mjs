// The résumé return path (usability pass 2026-11-06, cluster "the résumé return path"): the pure rules in web/app.js
// Routes.You behind "Add your résumé" on Find jobs and Networking, the wizard's way out, the résumé line and the copy.
//   - You.back: a hash of this site, never the sign-in (the rule the sign-in's `next` uses too)
//   - You.resumeHref / You.returnTo / You.after: the résumé step alone, then back to the hash the link came from
//   - You.aiRead: the résumé line names the AI reader only when the model read answered
//   - the copy: one spelling ("résumé"), the rail's count of questions from the wizard's own table
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web } from "./_load.mjs";
import { strings } from "../../evals/copy_lib.mjs";

const Copy = require(path.join(web, "copy.js"));
globalThis.Copy = Copy;
const { You } = require(path.join(web, "app.js"));
const Q = Copy.you.questions.length;

test("You.back keeps a hash of this site and refuses the sign-in, another origin and a script", () => {
  for (const h of ["#/jobs?q=analyst&entry=mba&sort=fit", "#/network?role=product.pm&type=recruiter", "#/jobs?q=data+analyst", "#/home"]) assert.equal(You.back(h), h, h);
  for (const h of ["#/signin", "#/signin?next=%23%2Fhome", "https://evil.example/#/jobs", "//evil.example", "javascript:alert(1)", "#/jobs?q=<b>", "", null, undefined]) assert.equal(You.back(h), null, String(h));
});

test("You.resumeHref opens the résumé step alone and carries the screen's own hash as next", () => {
  const h = "#/jobs?q=analyst&entry=mba&sort=fit";
  assert.equal(You.resumeHref(Q, h), `#/you?step=${Q}&next=${encodeURIComponent(h)}`);
  assert.equal(You.resumeHref(Q, "#/you"), `#/you?step=${Q}`, "About you carries no next to itself");
  assert.equal(You.resumeHref(Q, "#/signin"), `#/you?step=${Q}`, "nor to the sign-in");
});

test("You.after: back to a safe next; else the old ending (the summary after an edit, Explore after the wizard)", () => {
  assert.equal(You.after("#/jobs?q=analyst&entry=mba", true), "#/jobs?q=analyst&entry=mba");
  assert.equal(You.after("#/network?role=product.pm&type=recruiter", false), "#/network?role=product.pm&type=recruiter");
  for (const bad of ["https://evil.example/", "#/signin", "#/you?step=0", undefined]) {
    assert.equal(You.after(bad, true), "#/you", String(bad));
    assert.equal(You.after(bad, false), "#/explore", String(bad));
    assert.equal(You.returnTo(bad), null, String(bad));
  }
});

test("You.aiRead: the résumé line names the AI reader only when the model read answered", () => {
  assert.equal(You.aiRead(null), false);
  assert.equal(You.aiRead({ inferred: [], aiRead: false }), false, "the route did not answer (a 503 locally)");
  assert.equal(You.aiRead({ inferred: [], aiRead: true }), true, "it answered and found nothing new");
  assert.equal(You.aiRead({ inferred: [{ id: "x" }] }), true, "a résumé kept from before the flag, with an answer");
  assert.equal(You.aiRead({ inferred: [] }), false, "a résumé kept from before the flag, with nothing");
  assert.match(Copy.you.resumeLine, /AI reader/); assert.doesNotMatch(Copy.you.resumeLineLocal, /AI reader/);
  assert.match(Copy.skills.resume.onFile, /AI reader/); assert.doesNotMatch(Copy.skills.resume.onFileLocal, /AI reader/);
});

test("the page wizard's label counts the same steps as its bar (You.steps), on every step", () => {
  for (let i = 0; i <= Q; i++) { const S = You.steps(i, Q), [, a, b] = S.label.match(/Step (\d+) of (\d+)/); assert.equal(+a, S.done); assert.equal(+b, S.bars); }
  assert.equal(Copy.you.step, undefined, "the old \"Question {i} of 3\" string is gone");
});

test("the rail counts the wizard's questions, and every screen string spells it résumé", () => {
  assert.equal(Copy.fill(Copy.role.rail.orAnswer, { n: Q }), `Or answer ${Q} questions`);
  const off = strings(Copy).filter(e => /\bresumes?\b/i.test(e.text)).map(e => e.path);
  assert.deepEqual(off, []);
});

test("Start over asks once, with Start over and Keep", () => {
  assert.match(Copy.you.startOverAsk, /^Start over\? This forgets your answers and your résumé on this device\.$/);
  assert.equal(Copy.you.startOverYes, "Start over"); assert.equal(Copy.you.startOverKeep, "Keep");
});

// the role rail after a read (2026-11-08): "change" went to a literal #/you?step=3 and never came back to the role;
// with no gap among the most-asked skills, "all shown" came after "N skills in all still need evidence"
test("the rail's \"change\" goes to the résumé step and back to the role; \"all shown\" comes before the still-needed count", async () => {
  const fs = await import("fs");
  const app = fs.readFileSync(path.join(web, "app.js"), "utf8");
  assert.doesNotMatch(app, /<a href="#\/you\?step=3">\$\{esc\(CM\.change\)\}/);
  assert.match(app, /RR\.yourFit, \{ name: state\.resume\.name \}\)\)\} · <a href="\$\{esc\(resumeHref\(\)\)\}">\$\{esc\(CM\.change\)\}<\/a>/);
  assert.equal(You.resumeHref(Q, "#/role/product.pm"), `#/you?step=${Q}&next=${encodeURIComponent("#/role/product.pm")}`);
  assert.match(app, /\$\{line\}\$\{allShown\}\$\{counts\}/, "the all-shown line sits between the lead line and the counts");
  assert.equal(Copy.role.rail.nothingMissing, "You show all {m} skills most postings ask for.");
});
