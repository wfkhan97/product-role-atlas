// web/gameshell.js `record`: the one games record, its normaliser and the per-game patch. The screens are not tested.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web } from "./_load.mjs";

const { record: R, info, pips, foot, results } = require(path.join(web, "gameshell.js"));

test("normalize: junk, a missing record and foreign shapes all give an empty record of the current version", () => {
  for (const raw of [null, undefined, 7, "x", [], { games: [1, 2] }, { games: { a: 3, b: "x" } }]) assert.deepEqual(R.normalize(raw), { v: R.VERSION, games: {}, roles: {} });
  assert.deepEqual(R.normalize({ v: 0, games: { cl: { best: 1 } }, roles: { pm: { asks: [] } }, junk: 1 }), { v: R.VERSION, games: { cl: { best: 1 } }, roles: { pm: { asks: [] } } });
});

test("noteGame: a patch merges into the game's entry and leaves the rest alone; played counts and dates the play", () => {
  let rec = R.noteGame(R.empty(), "cl", { best: 20 });
  rec = R.noteGame(rec, "gtr", { seen: ["a"] });
  assert.deepEqual(rec.games, { cl: { best: 20 }, gtr: { seen: ["a"] } });
  rec = R.noteGame(rec, "cl", { played: true, lastScore: 31 }, "2026-10-20");
  assert.deepEqual(rec.games.cl, { best: 20, lastScore: 31, plays: 1, last: "2026-10-20" });
  rec = R.noteGame(rec, "cl", { played: true }, "2026-10-21");
  assert.equal(rec.games.cl.plays, 2); assert.equal(rec.games.cl.last, "2026-10-21");
  assert.equal(R.noteGame(rec, "cl", { plays: "x", played: true }).games.cl.plays, 1, "a broken count starts again");
});

test("noteGame never changes its input, and gameOf reads an entry or an empty one", () => {
  const rec = R.empty(); R.noteGame(rec, "cl", { best: 1 });
  assert.deepEqual(rec.games, {});
  assert.deepEqual(R.gameOf({ games: { cl: { best: 1 } } }, "cl"), { best: 1 });
  assert.deepEqual(R.gameOf(null, "cl"), {});
});

test("info joins the rules, the keys (the shared convention unless given), the source and the storage note", () => {
  const t = info({ rules: "Rules.", source: "Source." });
  assert.ok(t.startsWith("Rules. Keys: 1 to 4 choose, Enter confirms, Esc quits. Source. "));
  assert.ok(t.endsWith("nothing is uploaded."));
  assert.equal(info({ rules: "R.", keys: false }), "R. Your results stay in this browser; nothing is uploaded.");
});

test("pips: done, now, the rest; marks paint finished rounds; no rounds means no pips", () => {
  const h = pips(1, 3);
  assert.ok(h.includes('class="done"') && h.includes('class="now"') && h.includes("2 of 3"));
  assert.ok(pips(2, 3, ["ok", "miss"]).includes('class="miss"'));
  assert.equal(pips(0, 0), "");
});

test("foot and results draw one primary, one quiet and the template's parts, escaping what they are given", () => {
  const f = foot({ primary: { id: "go", label: "Go", key: "Enter", href: "#/x\"y" }, quiet: { label: "Back" } });
  assert.ok(f.includes('class="btn primary" id="go" href="#/x&quot;y"') && f.includes("<kbd>Enter</kbd>") && f.includes('class="btn quiet"'));
  const r = results({ measure: "3 of 4", record: "up from 2", takeaway: "T", link: { href: "#/role/a", label: "Open <a>" }, why: "W" });
  for (const part of ['class="gm-measure"', "3 of 4", "up from 2", "Open &lt;a&gt; →", "<summary>Why</summary>"]) assert.ok(r.includes(part), part);
  assert.ok(!results({ measure: "x" }).includes("gm-why"));
});

test("pickDefault: the role in the hash first, else the profile's first field's largest role, else Product Manager, else the largest role", () => {
  const { pickDefault } = require(path.join(web, "gameshell.js"));
  const ix = { roles: { a: { nOpen: 10 }, b: { nOpen: 50 }, c: { nOpen: 5 }, "product.pm": { nOpen: 999 }, "product.tpm": { nOpen: 20 } }, groups: [{ id: "f1", roles: ["a", "b"] }, { id: "f2", roles: ["c"] }, { id: "product", roles: ["product.pm", "product.tpm"] }] };
  assert.equal(pickDefault(ix, null, "c"), "c", "the hash wins");
  assert.equal(pickDefault(ix, { fields: ["f1"] }, "c"), "c", "the hash wins over the profile");
  assert.equal(pickDefault(ix, null, "tpm"), "product.tpm", "a bare product family id finds the product role");
  assert.equal(pickDefault(ix, { fields: ["f1"] }, null), "b", "the first field's largest role");
  assert.equal(pickDefault(ix, { fields: ["nope", "f2"] }, null), "c", "an unknown field is skipped");
  assert.equal(pickDefault(ix, { fields: [] }, null), "product.pm");
  assert.equal(pickDefault(ix, null, "zzz"), "product.pm", "an unknown role in the hash is ignored");
  const can = new Set(["a", "c"]);
  assert.equal(pickDefault(ix, { fields: ["f1"] }, null, can), "a", "only the roles a game can play count");
  assert.equal(pickDefault(ix, null, "b", can), "a", "a hash role the game cannot play falls through to the largest playable one");
  assert.equal(pickDefault(ix, null, null, id => id === "c"), "c");
  assert.equal(pickDefault(ix, null, null, new Set()), null);
});

test("the Know-your-role record: noteRole merges sets, counts demand and never changes its input; summary reads it against the role's asks", () => {
  const empty = R.empty();
  let rec = R.noteRole(empty, "pm", { label: "PM", met: ["a", "b"], known: ["a"], postings: ["p1"] }, "2026-10-20");
  assert.deepEqual(empty.roles, {});
  rec = R.noteRole(rec, "pm", { known: ["c"], ladders: ["b"], demand: 2, postings: ["p1", "p2"] }, "2026-10-21");
  rec = R.noteRole(rec, "pm", { demand: 1 }, "2026-10-21");
  assert.deepEqual(rec.roles.pm, { met: ["a", "b", "c"], known: ["a", "c"], ladders: ["b"], postings: ["p1", "p2"], demand: 3, label: "PM", updated: "2026-10-21" });
  const k = R.summary(rec, "pm", ["a", "b", "d", "c"]);
  assert.deepEqual([k.known, k.met, k.missing, k.total, k.postings, k.demand, k.any], [["a", "c"], ["a", "b", "c"], ["b", "d"], 4, 2, 3, true]);
  assert.equal(R.summary(rec, "none", ["a"]).any, false);
  assert.deepEqual(R.noteRole(rec, "pm", { known: [3, null, "x"] }).roles.pm.known, ["a", "c", "x"], "only strings are kept");
});

test("asksOf: a role's asks are the skills at least the cut of its postings name, most asked first; product roles read the product set", () => {
  const ix = { roles: { pm: { set: "mba", family: "pm" }, "product.tpm": { set: "product", family: "tpm" } }, M: { skills: [{ id: "a", cluster: "craft", by_family: { pm: 0.9 } }, { id: "b", cluster: "craft", by_family: { pm: 0.41 } }, { id: "c", cluster: "craft", by_family: { pm: 0.39 } }, { id: "bachelors", cluster: "credentials", by_family: { pm: 0.8 } }, { id: "yoe_3", cluster: "craft", by_family: { pm: 0.8 } }] } };
  assert.deepEqual(R.asksOf(ix, null, "pm"), ["a", "b"]);
  assert.deepEqual(R.asksOf(ix, null, "pm", 0.3), ["a", "b", "c"]);
  assert.deepEqual(R.asksOf(ix, null, "product.tpm"), [], "no product set loaded");
  assert.deepEqual(R.asksOf(ix, { G: { skills: [{ id: "z", cluster: "craft", by_family: { tpm: 0.5 } }] } }, "product.tpm"), ["z"]);
  assert.deepEqual(R.asksOf(ix, null, "nope"), []);
});

test("knowLine: the first line of an end screen is the record and the change since last time", () => {
  const { knowLine } = require(path.join(web, "gameshell.js"));
  const before = { known: ["a"], total: 3 }, after = { known: ["a", "b"], total: 3 };
  assert.equal(knowLine(before, after, "PM"), "You know <b>2 of the 3</b> things PM postings ask for · up from 1.");
  assert.equal(knowLine(null, after, "PM"), "You know <b>2 of the 3</b> things PM postings ask for.");
  assert.equal(knowLine(after, before, "P<M"), "You know <b>1 of the 3</b> things P&lt;M postings ask for · down from 2.");
  assert.equal(knowLine(null, { known: [], total: 0 }, "PM"), "");
});
