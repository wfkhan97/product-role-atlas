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
