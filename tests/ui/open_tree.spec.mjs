// The open tree (2026-11-11, behind CONFIG.OPEN_TREE_ENABLED): a visitor with no session gives an email, a résumé and
// a role and gets the tree on #/map, two projects under it and, with a form id, the booking card. The flag and the
// form id are set in the page by an init script (on, off, with and without an id), whatever web/config.js holds. Nothing
// here calls a function: the tree is grounded in the browser. OPEN_SHOTS=1 saves the screens under
// data/experiments/scratch/open-tree/shots/ (gitignored).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test, expect, unexpected } from "./fixtures.mjs";

const require = createRequire(import.meta.url);
const Copy = require("../../web/copy.js"), MC = Copy.map, O = MC.open;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "data", "experiments", "scratch", "open-tree", "shots");
const TEXT = fs.readFileSync(path.join(ROOT, "pipeline", "apprentice", "examples", "pmm-nyc", "profile.md"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
const RESUME = JSON.stringify({ name: "resume.pdf", text: TEXT, words: TEXT.split(/\s+/).length, inferred: [], aiRead: false });
const EMAIL = "ui-harness@gmail.com";
const hashOf = page => page.evaluate(() => location.hash);
const flags = extra => [x => { let v; Object.defineProperty(window, "CONFIG", { configurable: true, get: () => v, set: c => { v = c; if (c) Object.assign(c, x); } }); }, extra];
const shot = async (page, name) => { if (process.env.OPEN_SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}-${test.info().project.name}.png`), fullPage: true }); } };

async function visitorAt(visitor, hash, config = { OPEN_TREE_ENABLED: true, OPEN_QUESTS_ENABLED: false, BOOKING_TALLY: null }, storage = {}, open = null) {
  const page = await visitor.open({ storage: { "door.email": "", "door.where": "", "door.seen": "1", resume: RESUME, ...storage } });
  page.posts = []; page.api = [];
  const ctx = page.context();
  if (config) await ctx.addInitScript(...flags(config));
  await ctx.route("**/api/**", r => {
    const p = new URL(r.request().url()).pathname; page.api.push(p);
    if (p === "/api/open" && open) { page.asked = (page.asked || []).concat([r.request().postDataJSON()]); return r.fulfill({ status: open.status || 200, contentType: "application/json", body: JSON.stringify(open.body || {}) }); }
    return r.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });
  await ctx.route(/\.supabase\.co\/rest\/v1\//, r => { if (r.request().method() === "POST") { page.posts.push({ table: new URL(r.request().url()).pathname.split("/").pop(), row: r.request().postDataJSON() }); return r.fulfill({ status: 201, body: "" }); } return r.continue(); });
  await page.goto("/" + hash);
  await page.locator("#main .page h1").first().waitFor({ state: "visible" });
  return page;
}
async function build(page) {
  await page.fill("#tr-email", EMAIL);
  await page.click("#tr-build");
  await page.locator("#open-preview .op-card").first().waitFor({ state: "visible" });
}

test("flag off: #/map with no session is the invited sign-in, as before", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map", { OPEN_TREE_ENABLED: false, OPEN_QUESTS_ENABLED: false });
  await expect.poll(() => hashOf(page)).toMatch(/^#\/signin/);
});

test("an email, a résumé and a role give the tree, two projects and no booking card without a form id", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm");
  await expect(page.locator("#main h1")).toHaveText(O.heading);
  await expect(page.locator("#tr-role")).toHaveValue("pmm");
  // no email: the form says so and nothing is built
  await page.click("#tr-build");
  await expect(page.locator("#tr-out")).toHaveText(O.badEmail);
  await shot(page, "form");
  await build(page);
  expect(await hashOf(page)).toBe("#/map/tree");
  await expect(page.locator("#main .map-head h1")).toHaveText(MC.treeHeading);
  await expect(page.locator("#open-preview .op-card")).toHaveCount(2);
  await expect(page.locator("#open-preview h2")).toHaveText(O.previewHeading);
  for (const card of await page.locator("#open-preview .op-card").all()) {
    await expect(card.locator("h3")).not.toBeEmpty();
    expect(await card.locator("ol, ul, a, button, textarea").count(), "a title and a line, no plan").toBe(0);
  }
  await expect(page.locator("#open-book")).toHaveCount(0);
  // the one page: no Quests link, no way into the side-project flow
  await expect(page.locator(".mapnav a")).toHaveCount(0);
  await expect(page.locator('a[href^="#/map/start"], a[href^="#/map/quests"]')).toHaveCount(0);
  // the email went to the waitlist under `build`; the résumé and the tree went nowhere
  const wait = page.posts.filter(p => p.table === "waitlist");
  expect(wait.map(p => [p.row.email, p.row.source, p.row.role_id])).toEqual([[EMAIL, "build", "pmm"]]);
  expect(JSON.stringify(page.posts)).not.toContain(TEXT.slice(200, 260));
  expect(page.api, "no function is called").toEqual([]);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("open.tree")));
  expect(kept.email).toBe(EMAIL); expect(kept.map.role.id).toBe("pmm"); expect(kept.map.student.self_serve).toBe(true);
  await shot(page, "tree");
  expect(unexpected(page.consoleErrors)).toEqual([]);
});

test("the tree stays on a reload; the quest pages and #/map/start come back to it; Forget it clears it", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm");
  await build(page);
  await page.reload();
  await page.locator("#open-preview .op-card").first().waitFor({ state: "visible" });
  for (const h of ["#/map/start", "#/map/quests", "#/map/start/write", "#/map"]) {
    await page.evaluate(x => { location.hash = x; }, h);
    await expect.poll(() => hashOf(page)).toBe("#/map/tree");
    await expect(page.locator("#main .map-head h1")).toHaveText(MC.treeHeading);
  }
  expect(page.api.filter(p => /quests|tree/.test(p))).toEqual([]);
  await page.click("#open-forget");
  await expect(page.locator("#main h1")).toHaveText(O.heading);
  expect(await page.evaluate(() => localStorage.getItem("open.tree"))).toBeNull();
});

test("with a form id the booking card follows the two projects and links to the Tally form", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm", { OPEN_TREE_ENABLED: true, OPEN_QUESTS_ENABLED: false, BOOKING_TALLY: "wA1b2C" });
  await build(page);
  await expect(page.locator("#open-book h2")).toHaveText(O.book.heading);
  await expect(page.locator("#open-book")).toContainText("$60");
  await expect(page.locator("#open-book")).not.toContainText(/black friday|sale|% off/i);
  const u = new URL(await page.locator("#open-book-link").getAttribute("href"));
  expect(u.origin + u.pathname).toBe("https://tally.so/r/wA1b2C");
  expect(u.searchParams.get("email")).toBe(EMAIL); expect(u.searchParams.get("role")).toBe("pmm");
  expect(await page.evaluate(() => { const a = document.querySelector("#open-preview"), b = document.querySelector("#open-book"), t = document.querySelector("#map-body"); return !!(t.compareDocumentPosition(a) & 4) && !!(a.compareDocumentPosition(b) & 4); }), "tree, then the projects, then the card").toBe(true);
  await shot(page, "booking");
});

test("a role outside the standards file still gets two projects, from the tree", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=treasury");
  await build(page);
  await expect(page.locator("#open-preview .op-card")).toHaveCount(2);
});

test("as config.js ships: Build skills in the top bar opens the form, and an invited person finds the sign-in under it", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/skills", null);
  await page.click("#verbs a[href='#/map']");
  await expect(page.locator("#main h1")).toHaveText(O.heading);
  expect(await hashOf(page)).toBe("#/map");
  await page.click(`#main a[href="#/signin?next=${encodeURIComponent("#/map")}"]`);
  await page.locator("#main #si").waitFor();
  await page.goto("/#/home"); await page.locator("#main .home-page .verbs a.verb").first().waitFor();
  await expect(page.locator("#main .home-page")).not.toContainText(Copy.home.verbs.build.invite);
});

// ---------- the build quests (CONFIG.OPEN_QUESTS_ENABLED): /api/open stubbed with projects as the function returns them ----------
const KIT = JSON.parse(fs.readFileSync(path.join(ROOT, "web", "data", "build_kit.json"), "utf8"));
const project = (i, title, skills) => ({
  id: `p${i}`, title, ship: "A public page that shows the positioning of three freight apps.",
  atlas_skills: skills, steps: ["Pick three apps your old customers used.", "Copy each home page headline and pitch.", "Ask the assistant to compare them in a table.", "Publish the page and share the link."],
  prompt: "Help me write a positioning teardown of three freight software products. Compare their headlines and the proof each offers.",
  build_with: { kind: "chat_pages", examples: KIT.kinds.find(k => k.id === "chat_pages").examples.slice(0, 2).map(e => e.name) }, live_on: { host: KIT.hosts.find(h => !h.needs).id }, needs_database: false,
  why_role: { text: "Product marketers own positioning.", posting_quote: null }, why_person: { text: "You sold logistics software.", resume_quote: null },
});
const PROJECTS = [project(1, "A positioning teardown of three freight apps", ["positioning_messaging", "gtm"]), project(2, "A launch brief for a partner program", ["gtm", "cross_functional"]), project(3, "A buyer persona page for freight forwarders", ["market_research"])];
const QUESTS_ON = { OPEN_TREE_ENABLED: true, OPEN_QUESTS_ENABLED: true, BOOKING_TALLY: "wA1b2C" };

test("build quests on: the tree is followed by three written quests, each opens on the Quests page with its steps, and a mark stays in this browser", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm", QUESTS_ON, {}, { body: { ok: true, projects: PROJECTS, model: "claude-opus-5-5", dropped: [] } });
  await expect(page.locator("#main .tr-keeps")).toHaveText(O.keepsQuests);
  await page.selectOption("#tr-tech", "no_code");
  await page.fill("#tr-email", EMAIL);
  await page.click("#tr-build");
  await page.locator("#open-quests .op-quest").first().waitFor({ state: "visible" });
  await expect(page.locator("#open-quests .op-quest h3")).toHaveText(PROJECTS.map(p => p.title));
  await expect(page.locator("#open-preview")).toHaveCount(0);
  await expect(page.locator("#open-book")).toHaveCount(1);
  // what went to the function: the email, the résumé, the role and the answer; once
  expect(page.asked.length).toBe(1);
  expect(page.asked[0]).toMatchObject({ email: EMAIL, roles: ["pmm"], tech: "no_code" });
  expect(page.asked[0].text).toContain(TEXT.slice(200, 260));
  await expect(page.locator(".mapnav a")).toHaveText([MC.nav.quests, MC.nav.tree]);
  await shot(page, "quests-tree");
  // a quest opens on the Quests page as a build card: its steps, no résumé story card anywhere
  await page.locator("#open-quests .op-quest").nth(1).click();
  await expect.poll(() => hashOf(page)).toMatch(/^#\/map\/quests\?q=side-/);
  await expect(page.locator("#main .q-now")).toContainText(PROJECTS[1].title);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("open.tree")));
  expect(kept.cards.map(c => c.kind)).toEqual(["side_project", "side_project", "side_project"]);
  expect(JSON.stringify(kept.cards)).not.toContain('"story"');
  await expect(page.locator('a[href^="#/map/start"]')).toHaveCount(0);
  await page.locator("#main .q-now [data-act='start']").click();
  await expect(page.locator("#main .q-now")).toContainText(PROJECTS[1].steps[0]);
  await shot(page, "quests-card");
  const id = decodeURIComponent((await hashOf(page)).split("q=")[1]);
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("open.tree")))).mine[id].choice).toBe("start");
  // a reload keeps the quests and the mark and asks nothing again
  await page.reload();
  await expect(page.locator("#main .q-now")).toContainText(PROJECTS[1].title);
  expect(page.asked.length).toBe(1);
  expect(page.api.filter(p => p === "/api/quests" || p === "/api/tree")).toEqual([]);
  expect(unexpected(page.consoleErrors)).toEqual([]);
});

test("build quests on, the function at its cap: the two no-model projects show with a line that says why, and a reload does not ask again", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm", QUESTS_ON, {}, { status: 429, body: { error: "rate_limited", scope: "day" } });
  await build(page);
  await expect(page.locator("#open-preview .op-card")).toHaveCount(2);
  await expect(page.locator("#open-why")).toHaveText(O.questsLimited);
  await expect(page.locator("#open-retry")).toHaveCount(0);
  await expect(page.locator(".mapnav a")).toHaveCount(0);
  await page.reload();
  await page.locator("#open-preview .op-card").first().waitFor({ state: "visible" });
  expect(page.asked.length).toBe(1);
});

test("build quests on, the function failing: the fallback offers Try again, which asks once more", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm", QUESTS_ON, {}, { status: 502, body: { error: "upstream" } });
  await build(page);
  await expect(page.locator("#open-why")).toContainText(O.questsFailed);
  await page.click("#open-retry");
  await expect.poll(() => page.asked.length).toBe(2);
});
