// The map's two pages (2026-11-10), signed in without a real session: a made-up session in localStorage (maps.session,
// far from expiry, so Auth.session() never refreshes it) and every request to the Supabase project answered here. The
// map file is the tracked example (pipeline/apprentice/examples/pmm-nyc/map.json); the person's feedback files live in
// a dict for the test, so Start, Mark shipped and Skip write there and read back. Nothing reaches the real project,
// and no hook in web/ is needed: the stub is the network. MAP_SHOTS=1 also saves the review screenshots under
// data/experiments/scratch/map-redesign/shots/ (gitignored).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test, expect, unexpected } from "./fixtures.mjs";

const require = createRequire(import.meta.url);
const Copy = require("../../web/copy.js"), MC = Copy.map;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, "pipeline", "apprentice", "examples", "pmm-nyc", "map.json"), "utf8"));
const SHOTS = path.join(ROOT, "data", "experiments", "scratch", "map-redesign", "shots");
const UID = "00000000-0000-4000-8000-00000000c0de";
const SESSION = { access_token: "ui-harness-token", refresh_token: "", expires_at: 4102444800, uid: UID, email: "ui-harness@cornell.edu" };
const TITLES = EXAMPLE.cards.map(c => c.title);
const hashOf = page => page.evaluate(() => location.hash);

async function signedIn(visitor, hash = "#/map", map = EXAMPLE) {
  const page = await visitor.open({ storage: { "maps.session": JSON.stringify(SESSION), "door.email": SESSION.email, "door.where": "", "door.seen": "1" } });
  page.files = {}; page.writes = [];
  await page.context().route(/\.supabase\.co\//, route => {
    const req = route.request(), url = new URL(req.url());
    const m = /\/storage\/v1\/object\/(?:authenticated\/)?maps\/(.+)$/.exec(url.pathname);
    if (m && req.method() === "GET") {
      const body = m[1] === `${UID}/map.json` ? JSON.stringify(map) : page.files[m[1]];
      return body ? route.fulfill({ status: 200, contentType: "application/json", body }) : route.fulfill({ status: 404, contentType: "application/json", body: '{"message":"Object not found"}' });
    }
    if (m && req.method() === "POST") { page.files[m[1]] = req.postData(); page.writes.push({ path: m[1], body: JSON.parse(req.postData()) }); return route.fulfill({ status: 200, contentType: "application/json", body: '{"Key":"x"}' }); }
    if (/\/rest\/v1\//.test(url.pathname)) return route.fulfill({ status: req.method() === "POST" ? 201 : 200, contentType: "application/json", body: req.method() === "POST" ? "" : "[]" });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/" + hash);
  await page.locator("#map-body > *").first().waitFor();
  return page;
}
const visible = page => page.locator("body").innerText();
const shot = async (page, name, info) => { if (!process.env.MAP_SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-${name}.png`), fullPage: true }); };
const noBannedWords = async page => {
  const text = await visible(page);
  expect(text).not.toMatch(/\bmissions?\b/i);
  expect(text).not.toMatch(/\bWally\b/);
  expect(text).not.toMatch(/\bWorld\b/);
};

test("Quests: #/map lands on #/map/quests with the now card, the path and up next; no legend, no clear, no duration", async ({ visitor }, info) => {
  const page = await signedIn(visitor);
  await expect.poll(() => hashOf(page)).toBe("#/map/quests");
  const now = page.locator(".q-now");
  await expect(now.locator("h2")).toHaveText(EXAMPLE.cards[0].title);
  await expect(now).toContainText(MC.youShip);
  await expect(now).toContainText("Level 1 · Fundamentals");
  await expect(now.locator(".q-chips .chip")).toHaveCount(1);
  await expect(page.locator(".mapnav > a")).toHaveText([MC.nav.quests, MC.nav.tree]);
  await expect(page.locator(".q-path .lvl")).toHaveCount(4);
  await expect(page.locator(".q-path .dot.cur")).toHaveCount(1);
  await expect(page.locator(".q-next li")).toHaveCount(3);
  await expect(page.locator(".legend-bar")).toHaveCount(0);
  await expect(now.locator("details")).toHaveCount(0);
  const text = await visible(page);
  expect(text).not.toMatch(/clear/i);
  let parts = (await page.locator(".q-now, .q-path, .q-next").allInnerTexts()).join("\n");
  for (const t of TITLES) parts = parts.split(t).join(" ");   // a card's own title may say "six-week"; the screen adds no duration
  expect(parts).not.toMatch(/\b(hour|hours|evening|morning|week|weeks|day)\b/i);
  await noBannedWords(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "the page never scrolls sideways").toBe(true);
  await shot(page, "quests-closed", info);
  expect(unexpected(page.consoleErrors)).toEqual([]);
});

test("Quests: a dot swaps the now card; opening shows the full ship text and a closed Why this quest", async ({ visitor }, info) => {
  const page = await signedIn(visitor);
  const battle = EXAMPLE.cards.find(c => c.id === "l2-battlecard");
  await page.locator(`.q-path .dot[data-q="l2-battlecard"]`).click();
  await expect(page.locator(".q-now h2")).toHaveText(battle.title);
  await expect.poll(() => hashOf(page)).toBe("#/map/quests?q=l2-battlecard");
  await expect(page.locator(".q-now .q-chips .chip")).toHaveCount(3);
  await page.getByRole("button", { name: MC.details }).click();
  await expect(page.locator(".q-full")).toHaveText(battle.ship);
  const why = page.locator("details.q-why");
  await expect(why).toBeVisible();
  await expect(why.locator("summary")).toHaveText(MC.card.why);
  expect(await why.evaluate(d => d.open)).toBe(false);
  await expect(why.locator("dl")).toBeHidden();
  await why.locator("summary").click();
  await expect(why.locator("dt")).toContainText([MC.card.whyRole, "Agentio", MC.card.whyYou]);
  await noBannedWords(page);
  await shot(page, "quests-open", info);
});

test("Quests: Start, then Mark shipped asks for a link, refuses a bad one and shows the good one; the dot and the tree follow", async ({ visitor }, info) => {
  const page = await signedIn(visitor, "#/map/quests?q=l1-gtm");
  await page.getByRole("button", { name: MC.start, exact: true }).click();
  await expect(page.locator(".q-now .q-tag")).toHaveText(MC.questStates.started);
  await expect(page.locator(".q-path .dot.q-started")).toHaveCount(1);
  expect(page.writes.at(-1)).toMatchObject({ path: `${UID}/feedback/l1-gtm.json`, body: { card: "l1-gtm", choice: "start" } });
  await page.getByRole("button", { name: MC.markShipped }).click();
  const input = page.locator("#q-link");
  await expect(input).toBeFocused();
  await input.fill("not a link");
  await page.locator("#q-ship button[type=submit]").click();
  await expect(page.locator("#q-linkerr")).toHaveText(MC.linkBad);
  expect(page.writes.length).toBe(1);
  await shot(page, "quests-shipping", info);
  await page.locator("#q-link").fill("me.github.io/agentio-positioning");
  await page.locator("#q-ship button[type=submit]").click();
  await expect(page.locator(".q-live a")).toHaveAttribute("href", "https://me.github.io/agentio-positioning");
  await expect(page.locator(".q-now .q-tag")).toHaveText(MC.questStates.shipped);
  await expect(page.locator(`.q-path .dot[data-q="l1-gtm"]`)).toHaveClass(/q-shipped/);
  const last = page.writes.at(-1).body;
  expect(Object.keys(last)).toEqual(["card", "choice", "link", "date"]);
  expect(last).toMatchObject({ card: "l1-gtm", choice: "shipped", link: "https://me.github.io/agentio-positioning" });
  // the mark stays through a reload (read back from the file) and gives its skills the shipped look on the tree
  await page.reload();
  await expect(page.locator(`.q-path .dot[data-q="l1-gtm"]`)).toHaveClass(/q-shipped/);
  await page.locator(".mapnav a", { hasText: MC.nav.tree }).click();
  await expect(page.locator(`.t4 [data-node="gtm"]`)).toHaveClass(/st-built/);
  expect(unexpected(page.consoleErrors)).toEqual([]);
});

test("Quests: Skip moves on and says so with Undo; Undo brings the quest back as it was", async ({ visitor }) => {
  const page = await signedIn(visitor);
  const first = EXAMPLE.cards[0];
  await page.getByRole("button", { name: MC.skip, exact: true }).click();
  await expect(page.locator(".q-note")).toContainText(Copy.fill(MC.skippedNote, { title: first.title }));
  await expect(page.locator(".q-now h2")).toHaveText(EXAMPLE.cards[1].title);
  await expect(page.locator(`.q-path .dot[data-q="${first.id}"]`)).toHaveClass(/q-skipped/);
  expect(page.writes.at(-1).body).toMatchObject({ card: first.id, choice: "skip" });
  await page.locator(".q-note").getByRole("button", { name: MC.undo }).click();
  await expect(page.locator(".q-note")).toHaveCount(0);
  await expect(page.locator(".q-now h2")).toHaveText(first.title);
  await expect(page.locator(`.q-path .dot[data-q="${first.id}"]`)).not.toHaveClass(/q-skipped/);
  expect(page.writes.at(-1).body).toMatchObject({ card: first.id, choice: "open" });
});

test("Skill tree: the legend bar, How you work in a popover, Tree and List; the gap's quest links back to Quests", async ({ visitor }, info) => {
  const page = await signedIn(visitor, "#/map/tree");
  await expect(page.locator(".legend-bar")).toContainText(MC.states["must build"]);
  await expect(page.locator("svg.t4 .node")).toHaveCount(19);
  await expect(page.locator(".t2-cap")).toHaveText(MC.treeCap);
  await expect(page.locator("#map-more")).toHaveText(MC.more);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "the tree scrolls in its own box, the page never").toBe(true);
  await shot(page, "tree", info);
  const how = page.locator("#map-how"), pop = page.locator("#map-howpop");
  await expect(pop).toBeHidden();
  await how.click();
  await expect(pop).toBeVisible();
  await expect(how).toHaveAttribute("aria-expanded", "true");
  await expect(pop.locator("li")).toHaveCount(EXAMPLE.tree.behaviours.length);
  await shot(page, "tree-how", info);
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
  await page.getByRole("button", { name: MC.view.list }).click();
  await expect.poll(() => hashOf(page)).toBe("#/map/tree?view=list");
  await expect(page.locator(".rd-band")).toContainText(EXAMPLE.read.band_label);
  await expect(page.locator(".rd h2")).toHaveText([MC.brings, MC.gaps]);
  const link = page.locator(".rd-gaps a").first();
  await expect(link).toHaveAttribute("href", /^#\/map\/quests\?q=/);
  await noBannedWords(page);
  await shot(page, "list", info);
  // the node panel's quests link to the Quests page
  await page.getByRole("button", { name: MC.view.tree }).click();
  await page.locator(`.t4 [data-node="gtm"]`).click();
  await expect(page.locator(".aside")).toContainText(MC.node.quests);
  await expect(page.locator(".aside .list a.r").first()).toHaveAttribute("href", /^#\/map\/quests\?q=/);
  await noBannedWords(page);
  await shot(page, "tree-node", info);
  await page.locator(".aside .list a.r").first().click();
  await expect(page.locator(".q-now")).toBeVisible();
  expect(unexpected(page.consoleErrors).map(e => e.text)).toEqual([]);
});

test("the old #/map?tab=tree lands on #/map/tree, and #/map/quests keeps ?q=", async ({ visitor }) => {
  const page = await signedIn(visitor, "#/map?tab=tree");
  await expect.poll(() => hashOf(page)).toBe("#/map/tree");
  await expect(page.locator("svg.t4")).toBeVisible();
  await expect(page.locator(".mapnav > a.on")).toHaveText(MC.nav.tree);
});

test("a self-serve map with no quest and no posting: a calm empty Quests page, and a List with no gaps column", async ({ visitor }, info) => {
  const map = { ...EXAMPLE, student: { slug: null, name_on_page: null, campus: "Cornell Tech", program: null, self_serve: true }, company: null, gap_sentence: null, worlds: [], cards: [], read: { ...EXAMPLE.read, marked_gaps: [] } };
  const page = await signedIn(visitor, "#/map/quests", map);
  await expect(page.locator(".q-empty")).toContainText(MC.empty);
  await expect(page.locator(".q-empty a")).toHaveAttribute("href", "#/map/tree");
  await expect(page.locator(".map-head h1")).toHaveText(MC.questsHeading);
  await expect(page.locator(".map-lead")).toHaveText(EXAMPLE.role.label + ".");
  await shot(page, "quests-empty", info);
  await page.locator(".q-empty a").click();
  await page.getByRole("button", { name: MC.view.list }).click();
  await expect(page.locator(".rd h2")).toHaveText([MC.brings]);
  await expect(page.locator(".rd-cols.one")).toHaveCount(1);
  // the print sheet names the role alone, never "{role} at "
  expect(await page.locator(".map-print header p").first().evaluate(p => p.textContent)).toBe(`${EXAMPLE.role.label} · ${Copy.fill(MC.printPage.band, { band: EXAMPLE.read.band_label })}`);
  await noBannedWords(page);
});
