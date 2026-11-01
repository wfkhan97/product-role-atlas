// web/copy.js and the copy rule (v19 B6): the table loads in node, its views (Door.COPY, Intake, Launcher.COPY,
// Network.COPY, the jobs words) read from it, fill() fills a slot and leaves an unknown one alone, and the three files
// the screens own (web/copy.js, web/data/sp27_campus.json, web/data/games.json) have no sentence over 20 words, no
// passive construction and no stoplist word. The checker is evals/copy_lib.mjs, the same one evals/copy.mjs runs.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web, readJson } from "./_load.mjs";
import { strings, checkAll, sentences, wordCount, passives, stoplisted, OWNER_WORDS } from "../../evals/copy_lib.mjs";

const Copy = require(path.join(web, "copy.js"));

test("the table has every group the screens read, and fill() fills {slots}", () => {
  for (const k of ["common", "door", "home", "intake", "you", "explore", "role", "fit", "jobs", "skills", "network", "classes", "signin", "map", "about", "games"]) assert.ok(Copy[k] && typeof Copy[k] === "object", k);
  assert.equal(Copy.fill("{n} of {m}", { n: 2, m: 5 }), "2 of 5");
  assert.equal(Copy.fill("{n} of {m}", { n: 0 }), "0 of {m}", "an unfilled slot stays as it is, never undefined");
  assert.equal(Copy.fill("no slots", {}), "no slots");
});

test("the views read from the table: Door.COPY, Intake, Launcher.COPY, Network.COPY and the jobs words", () => {
  const { Door, Intake } = require(path.join(web, "app.js"));
  const L = require(path.join(web, "launcher.js")), N = require(path.join(web, "network.js")), J = require(path.join(web, "jobs.js"));
  assert.equal(Door.COPY.heading, Copy.door.heading);
  assert.equal(Door.COPY.home, Copy.home.heading);
  assert.equal(Door.COPY.bar, Copy.common.bar);
  assert.equal(Door.verbs("", { nOpen: 1000, nCompanies: 100, nRoles: 10 })[0].title, Copy.home.verbs.jobs.title);
  assert.equal(Intake.heading, Copy.intake.heading);
  assert.equal(Intake.line, Copy.intake.line);
  assert.equal(Intake.gapsLine("X"), Copy.fill(Copy.intake.gapsLine, { label: "X" }));
  assert.equal(L.COPY, Copy.skills);
  assert.equal(L.BAND_LABEL, Copy.common.bands);
  assert.equal(N.COPY, Copy.network);
  assert.deepEqual(N.TYPES.map(t => t.label), Object.values(Copy.network.types).map(t => t.label));
  assert.equal(J.fitLine({ n: 1, m: 2 }), Copy.fill(Copy.jobs.fitLine, { n: 1, m: 2 }));
  assert.deepEqual(J.ENTRIES.map(([, l]) => l), Object.values(Copy.jobs.entries));
});

test("the checker: sentences, words, passives and the stoplist", () => {
  assert.deepEqual(sentences("One. Two? Three!"), ["One", "Two", "Three"]);
  assert.equal(wordCount("Pick a role from {roles} in {fields} fields"), 8, "a slot is one word");
  assert.equal(wordCount("Open on the class roster ↗"), 5, "a bare arrow is not a word");
  assert.deepEqual(passives("Nothing is uploaded."), ["is uploaded"]);
  assert.deepEqual(passives("The roster is not loaded yet."), ["is not loaded"]);
  assert.deepEqual(passives("We read it in your browser. Your campus stays here."), []);
  assert.deepEqual(passives("This is red and that is indeed the need."), [], "red, indeed and need are not participles");
  assert.deepEqual(stoplisted("We leverage data via tools in order to utilize them and facilitate work."), ["utilize", "leverage", "facilitate", "in order to", "via"]);
  assert.deepEqual(stoplisted("Via Veneto is a street"), ["via"]);
  assert.equal(checkAll([{ path: "x", text: "Open `code that is written here` and https://example.com/is-listed" }]).length, 0, "code spans and URLs are skipped");
});

test("the three gated files have no long sentence, no passive and no stoplist word", () => {
  const files = [["web/copy.js", Copy], ["web/data/sp27_campus.json", readJson("sp27_campus.json")], ["web/data/games.json", readJson("games.json")]];
  for (const [name, value] of files) {
    const list = strings(value);
    assert.ok(list.length > 0, `${name} has strings`);
    const off = checkAll(list, OWNER_WORDS[name]);
    assert.deepEqual(off.map(o => `${o.path} [${o.rule}] ${o.hit}`), [], `${name}: every string follows the rule`);
  }
});

test("the owner's own words skip the length rule only while they are the live text, and nothing else does", () => {
  const live = Object.fromEntries(strings(Copy).map(e => [e.path, e.text]));
  for (const [p, text] of Object.entries(OWNER_WORDS["web/copy.js"])) {
    assert.equal(live[p], text, `${p}: the exception names the string web/copy.js holds`);
    assert.ok(checkAll([{ path: p, text }]).some(o => o.rule === "long"), `${p} runs over the rule, so it needs the exception`);
  }
  const ex = OWNER_WORDS["web/copy.js"], p = "door.inside";
  assert.equal(checkAll([{ path: p, text: ex[p] }], ex).length, 0);
  assert.equal(checkAll([{ path: p, text: ex[p] + " and more words" }], ex).filter(o => o.rule === "long").length, 1, "an edited text meets the rule again");
  assert.equal(checkAll([{ path: "door.heading", text: ex[p] }], ex).filter(o => o.rule === "long").length, 1, "the same words at another path meet the rule");
  assert.deepEqual(Object.keys(OWNER_WORDS), ["web/copy.js"], "only the screen table carries owner's words");
});

test("no screen string says utilize, leverage, facilitate, via or in order to, and no fit line carries a percentage", () => {
  const list = strings(Copy);
  for (const { path: p, text } of list) {
    assert.ok(!/\butili[sz]|\bleverag|\bfacilitat|\bvia\b|\bin order to\b/i.test(text), `${p}: "${text}"`);
    if (/^(fit|skills|network)\./.test(p) && /\{n\}/.test(text)) assert.ok(!/%|\bscore\b/i.test(text), `${p} reads N of M, never a score: "${text}"`);
  }
});
