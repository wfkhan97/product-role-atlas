// web/games/wheres-the-demand.js: rank the fields. The entities, the two deals, the scorer and the takeaway, on the
// real web/data/ files. The screens are not tested.
import test from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { require, web, realAtlas } from "./_load.mjs";

const L = require(path.join(web, "games", "wheres-the-demand.js"));
const A = realAtlas(), ix = await A.index();
const E = L.entities(ix);

test("entities: the MBA fields with open postings and their roles, the small roles left out, product never on a card", () => {
  assert.ok(E.fields.length >= 5);
  assert.ok(E.fields.every(f => f.kind === "field" && f.n > 0 && f.roles > 0 && f.id !== "product"));
  assert.ok(E.roles.every(r => r.kind === "role" && r.n > 0 && !ix.M.roles[r.id].small && E.byField[r.field].includes(r)));
  for (const f of E.fields) assert.deepEqual(E.byField[f.id].map(r => r.n), E.byField[f.id].map(r => r.n).sort((a, b) => b - a), `${f.id}: largest first`);
});

test("dealFields: five fields with distinct counts, the player's field among them, the true order largest first, a seed repeats", () => {
  const b = L.dealFields(E, L.seeded(5), { field: "analytics" });
  assert.equal(b.kind, "fields");
  assert.equal(b.items.length, L.N);
  assert.ok(b.items.some(c => c.id === "analytics"), "the player's field is on the board");
  assert.equal(new Set(b.items.map(c => c.n)).size, L.N, "no two cards share a count");
  assert.deepEqual(b.order.map(c => c.id), b.items.slice().sort((x, y) => y.n - x.n).map(c => c.id));
  assert.deepEqual(L.dealFields(E, L.seeded(5), { field: "analytics" }).items.map(c => c.id), b.items.map(c => c.id));
  assert.equal(L.dealFields(E, L.seeded(5), { field: "no-such" }).items.length, L.N, "an unknown field just means five others");
});

test("dealRoles: the field's roles first, topped up from other fields when it has fewer than five, distinct counts", () => {
  const big = E.fields.find(f => E.byField[f.id].length >= L.N), small = E.fields.find(f => E.byField[f.id].length < L.N);
  const b = L.dealRoles(E, big.id, L.seeded(1));
  assert.equal(b.items.length, L.N);
  assert.ok(b.items.every(c => c.field === big.id) && !b.mixed, "a big field fills its own board");
  assert.equal(new Set(b.items.map(c => c.n)).size, L.N);
  const m = L.dealRoles(E, small.id, L.seeded(1));
  assert.equal(m.items.length, L.N);
  assert.ok(m.mixed, "a small field's board is topped up");
  assert.equal(m.items.filter(c => c.field === small.id).length, new Set(E.byField[small.id].map(r => r.n)).size, "every role of the small field is on it");
  const others = m.order.filter(c => c.field !== small.id);
  assert.ok(others.every(c => c.n >= Math.min(...others.map(o => o.n))), "the top-up roles are the largest left");
});

test("scoreOrder: a card is in place when the player put it where the counts put it; the takeaway names the worst miss", () => {
  const items = [["a", 500], ["b", 400], ["c", 300], ["d", 200], ["e", 100]].map(([id, n]) => ({ kind: "field", id, label: id.toUpperCase(), n, roles: 2, href: "#" }));
  const board = { kind: "fields", items, order: items.slice() };
  const perfect = L.scoreOrder(board, ["a", "b", "c", "d", "e"]);
  assert.equal(perfect.inPlace, 5);
  assert.ok(L.partsText(L.takeaway(perfect).parts).startsWith("A has 1.3× the open postings of B"));
  const swapped = L.scoreOrder(board, ["b", "a", "c", "e", "d"]);
  assert.equal(swapped.inPlace, 1);
  assert.deepEqual(swapped.rows.map(r => r.at), [2, 1, 3, 5, 4]);
  const off = L.scoreOrder(board, ["e", "a", "b", "c", "d"]);
  assert.equal(off.inPlace, 0);
  const t = L.takeaway(off);
  assert.equal(t.card.id, "e", "E was put 1st and is 5th: the furthest from its place");
  assert.ok(L.partsText(t.parts).startsWith("You had E 1st; it is 5th. A has 5× the open postings of E: 500 against 100, over 2 and 2 roles."), L.partsText(t.parts));
});

test("gapLine: roles say the employers, fewer employers first when that is the surprise; fields say the roles", () => {
  const w = { kind: "role", label: "IB Associate", n: 621, employers: 57 }, l = { kind: "role", label: "Investment Manager", n: 230, employers: 112 };
  assert.equal(L.partsText(L.gapLine(w, l)), "IB Associate has 2.7× the open postings of Investment Manager: 621 against 230, from fewer employers: 57 against 112.");
  assert.equal(L.partsText(L.gapLine({ ...w, employers: 200 }, l)), "IB Associate has 2.7× the open postings of Investment Manager: 621 against 230, from 200 and 112 employers.");
  assert.equal(L.partsText(L.gapLine({ kind: "field", label: "Operations", n: 5199, roles: 5 }, { kind: "field", label: "Sales", n: 3372, roles: 4 })), "Operations has 1.5× the open postings of Sales: 5,199 against 3,372, over 5 and 4 roles.");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22].map(L.ord), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
});
