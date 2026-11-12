// The open tree (2026-11-11, behind CONFIG.OPEN_TREE_ENABLED): a visitor with no session answers the open form, one
// question per screen at #/map/find/<step> (2026-11-12: the roles, the résumé, with the build quests on how technical,
// the tools and the accounts, then the email), and gets the projects first, then the tree they come from and, with a
// form id, the booking card. The flags and the form id are set in the page by an init script, whatever web/config.js
// holds. Without the build quests nothing here calls a function: the tree is grounded in the browser; with them,
// /api/open is stubbed. OPEN_SHOTS=1 saves the screens under data/experiments/scratch/open-tree/shots/ (gitignored).
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
  await ctx.route("**/api/**", async r => {
    const p = new URL(r.request().url()).pathname; page.api.push(p);
    if (p === "/api/open" && open) { page.asked = (page.asked || []).concat([r.request().postDataJSON()]); if (open.hold) await open.hold; return r.fulfill({ status: open.status || 200, contentType: "application/json", body: JSON.stringify(open.body || {}) }); }
    return r.fulfill({ status: 503, contentType: "application/json", body: "{}" });
  });
  await ctx.route(/\.supabase\.co\/rest\/v1\//, r => { if (r.request().method() === "POST") { page.posts.push({ table: new URL(r.request().url()).pathname.split("/").pop(), row: r.request().postDataJSON() }); return r.fulfill({ status: 201, body: "" }); } return r.continue(); });
  await page.goto("/" + hash);
  await page.locator("#main .page h1").first().waitFor({ state: "visible" });
  return page;
}
const step = page => hashOf(page).then(h => (/^#\/map\/find\/(\w+)/.exec(h) || [])[1] || null);
const next = page => page.click("#sp-go");
const at = async (page, name) => { await expect.poll(() => step(page)).toBe(name); await page.locator(".sp-ask").waitFor(); };
// from the roles step (a role picked) to the email, the answers of steps c to e when the build quests are on
async function walk(page, { tech = "no_code", tools = {}, accounts = {} } = {}) {
  await at(page, "roles"); await next(page);
  await at(page, "resume"); await next(page);
  if (await page.evaluate(() => !!window.CONFIG.OPEN_QUESTS_ENABLED)) {
    await at(page, "tech"); await page.click(`[data-tech="${tech}"]`);
    await at(page, "tools"); for (const [k, v] of Object.entries(tools)) await page.click(`[data-kind="${k}"][data-v="${v}"]`); await next(page);
    await at(page, "accounts"); for (const [k, v] of Object.entries(accounts)) await page.click(`[data-acc="${k}"][data-v="${v}"]`); await next(page);
  }
  await at(page, "email");
}
async function build(page, answers) {
  await walk(page, answers);
  await page.fill("#sp-email", EMAIL);
  await page.click("#sp-go");
  await page.locator("#open-preview .op-card, #open-quests .op-quest, #open-writing").first().waitFor({ state: "visible" });
}
const before = (page, a, b) => page.evaluate(([x, y]) => { const p = document.querySelector(x), q = document.querySelector(y); return !!(p && q && (p.compareDocumentPosition(q) & 4)); }, [a, b]);

test("flag off: #/map with no session is the invited sign-in, as before", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map", { OPEN_TREE_ENABLED: false, OPEN_QUESTS_ENABLED: false });
  await expect.poll(() => hashOf(page)).toMatch(/^#\/signin/);
});

test("the steps, build quests off: the fit screen's role, the résumé, the email; a missing email is said beside the button; the projects come before the tree", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm");
  await at(page, "roles");
  await expect(page.locator("#main h1")).toHaveText(O.heading);
  await expect(page.locator("#main .sp-intro")).toHaveText(O.lead);
  await expect(page.locator(".sp-ask")).toHaveText(O.roles.title);
  await expect(page.locator(".sp-prog")).toHaveAttribute("aria-valuemax", "3");
  await expect(page.locator(".sp-picked .sp-role")).toHaveCount(1);
  await expect(page.locator(`[data-drop="pmm"]`)).toBeVisible();
  for (const old of [MC.tree.build, "Get your skill tree", MC.tree.building]) await expect(page.locator("#main")).not.toContainText(old);
  await shot(page, "step-roles");
  await next(page);
  await at(page, "resume");
  await expect(page.locator(".sp-ask")).toBeFocused();
  await expect(page.locator("#sp-posting")).not.toHaveAttribute("open", "");
  await next(page);
  await at(page, "email");
  await expect(page.locator(".sp-prog")).toHaveAttribute("aria-valuenow", "3");
  await expect(page.locator("#sp-go")).toHaveText(O.find);
  await expect(page.locator("#main .sp-privacy")).toHaveText(O.keeps);
  // no email: Next is no dead button, it says what is missing beside it and nothing is built
  await expect(page.locator("#sp-go")).toBeEnabled();
  await page.click("#sp-go");
  await expect(page.locator("#sp-err")).toHaveText(O.badEmail);
  await expect(page.locator("#sp-email")).toBeFocused();
  await shot(page, "step-email");
  await page.fill("#sp-email", EMAIL);
  await page.click("#sp-go");
  await page.locator("#open-preview .op-card").first().waitFor({ state: "visible" });
  expect(await hashOf(page)).toBe("#/map/tree");
  await expect(page.locator("#main .map-head h1")).toHaveText(MC.treeHeading);
  await expect(page.locator("#open-preview .op-card")).toHaveCount(2);
  await expect(page.locator("#open-preview h2")).toHaveText(O.previewHeading);
  expect(await before(page, "#open-preview", "#map-body"), "the projects first, then the tree").toBe(true);
  for (const card of await page.locator("#open-preview .op-card").all()) {
    await expect(card.locator("h3")).not.toBeEmpty();
    expect(await card.locator("ol, ul, a, button, textarea").count(), "a title and a line, no plan").toBe(0);
  }
  await expect(page.locator("#open-book")).toHaveCount(0);
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

test("the roles step: Next says a role is missing; the search adds one; a field shows its roles as chips; a role of another field says why", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map");
  await at(page, "roles");
  expect(await hashOf(page)).toBe("#/map/find/roles");
  await next(page);
  await expect(page.locator("#sp-err")).toHaveText(O.roles.noRole);
  await at(page, "roles");
  await page.fill("#sp-q", "product marketing");
  await page.locator("#sp-hits [data-add='pmm']").click();
  await expect(page.locator(`[data-drop="pmm"]`)).toBeVisible();
  await expect(page.locator("#sp-err")).toHaveCount(0);
  // the field of the first role opens: its roles as toggle chips, pmm pressed
  await expect(page.locator(`#sp-browse [data-toggle="pmm"]`)).toHaveAttribute("aria-pressed", "true");
  const mine = page.locator("#sp-browse [data-toggle][aria-pressed='false']").first();
  const second = await mine.getAttribute("data-toggle");
  await mine.click();
  await expect(page.locator(`[data-drop="${second}"]`)).toBeVisible();
  await expect(page.locator(`#sp-browse [data-toggle="${second}"]`)).toBeFocused();
  // another field: its roles show; one of them says the roles are of one field
  const fid = await page.locator(".sp-fields [data-browse][aria-pressed='false']").first().getAttribute("data-browse");
  const other = page.locator(`.sp-fields [data-browse="${fid}"]`);
  await other.click();
  await expect(other).toHaveAttribute("aria-pressed", "true");
  await expect(other).toBeFocused();
  await page.locator("#sp-browse [data-toggle]").first().click();
  await expect(page.locator("#sp-err")).toContainText(Copy.map.flow.aim.otherField.split(".")[0]);
  await expect(page.locator(".sp-picked .sp-role")).toHaveCount(2);
  await shot(page, "step-roles-browse");
  // the × removes; the answers are in open.flow
  await page.click(`[data-drop="${second}"]`);
  await expect(page.locator(".sp-picked .sp-role")).toHaveCount(1);
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("open.flow")))).roles).toEqual(["pmm"]);
});

// ---------- the résumé step: one choice is the whole act (fix/resume-upload, 2026-11-12), now on its own screen ----------
const T = MC.tree;
const FILE = path.join(ROOT, "evals", "resumes", "grad_student_new.txt");
const SHORT = { name: "short.txt", mimeType: "text/plain", buffer: Buffer.from("Product marketing intern, two summers.") };
const NONE = { resume: "null" };   // no résumé on file
const onFile = page => page.locator("#main .sp-file", { hasText: Copy.fill(T.onFile, { name: "grad_student_new.txt" }) });
const kept = page => page.evaluate(() => (JSON.parse(localStorage.getItem("resume")) || {}).name || null);
// the step drawn again: back to the roles and on to the résumé
async function redraw(page) {
  await page.click("#sp-back"); await at(page, "roles");
  await next(page); await at(page, "resume");
}
async function toResume(page) { await at(page, "roles"); await next(page); await at(page, "resume"); }

test("one choice of a file keeps the résumé: no Read button, the step says it is on file and Next goes on", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm", undefined, NONE);
  await toResume(page);
  await expect(page.locator("#tr-read, #read")).toHaveCount(0);
  // no file yet: Next says so
  await next(page);
  await expect(page.locator("#sp-err")).toHaveText(O.resume.noResume);
  await page.locator("#main #drop #file").setInputFiles(FILE);
  await expect(onFile(page)).toBeVisible();
  expect(await kept(page)).toBe("grad_student_new.txt");
  await next(page);
  await at(page, "email");
  await page.fill("#sp-email", EMAIL);
  await page.click("#sp-go");
  await page.locator("#open-preview .op-card").first().waitFor({ state: "visible" });
  expect(await hashOf(page)).toBe("#/map/tree");
  expect(unexpected(page.consoleErrors)).toEqual([]);
});

test("a redraw of the step between the choice and Next keeps the file, during the read and after it", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm", undefined, NONE);
  await toResume(page);
  let release; const held = new Promise(r => { release = r; });
  await page.route(/\/api\/infer$/, async r => { await held; return r.fulfill({ status: 503, contentType: "application/json", body: "{}" }); });
  await page.locator("#main #drop #file").setInputFiles(FILE);
  await expect(page.locator("#main #drop.busy .proc")).toBeVisible();
  await redraw(page);
  await expect(page.locator("#main #drop:not(.busy)")).toHaveCount(0);
  await expect(onFile(page).or(page.locator("#main #drop.busy .proc"))).toBeVisible();
  release();
  await expect(onFile(page)).toBeVisible();
  await redraw(page);
  await expect(onFile(page)).toBeVisible();
  await expect(page.locator("#main #drop")).toHaveCount(0);
  await next(page);
  await at(page, "email");
});

test("the same file can be chosen twice: the input is emptied after each choice, and a short file keeps nothing", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm", undefined, NONE);
  await toResume(page);
  const input = page.locator("#main #drop #file");
  await input.setInputFiles(SHORT);
  await expect(page.locator("#file-status")).toHaveText(Copy.fill(Copy.common.resume.fewWords, { name: "short.txt", words: 5 }));
  expect(await input.inputValue(), "emptied: choosing short.txt again fires a change").toBe("");
  expect(await kept(page)).toBeNull();
  await redraw(page);   // the line about the short file stays through a redraw
  await expect(page.locator("#file-status")).toHaveText(Copy.fill(Copy.common.resume.fewWords, { name: "short.txt", words: 5 }));
  await page.locator("#main #drop #file").setInputFiles(FILE);
  await expect(onFile(page)).toBeVisible();
  // "Use another", then the same file again: kept again
  await page.locator("#sp-change").click();
  await page.locator("#main #drop #file").setInputFiles(FILE);
  await expect(onFile(page)).toBeVisible();
  expect(await kept(page)).toBe("grad_student_new.txt");
});

test("the posting is tucked away and optional; what is typed in it stays through a reload", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm");
  await toResume(page);
  await expect(page.locator("#sp-posting-text")).toBeHidden();
  await page.locator("#sp-posting summary").click();
  await page.fill("#sp-posting-text", "We need positioning and launches.");
  await page.reload();
  await at(page, "resume");
  await expect(page.locator("#sp-posting")).toHaveAttribute("open", "");
  await expect(page.locator("#sp-posting-text")).toHaveValue("We need positioning and launches.");
});

test("the tree stays on a reload; the quest pages and #/map/start come back to it; Forget it clears it and the answers", async ({ visitor }) => {
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
  // ?build=1 (the tree's own "Build it again") opens the form on its first step with the answers kept
  await page.evaluate(() => { location.hash = "#/map?build=1"; });
  await at(page, "roles");
  await expect(page.locator(`[data-drop="pmm"]`)).toBeVisible();
  await page.evaluate(() => { location.hash = "#/map/tree"; });
  await page.click("#open-forget");
  await at(page, "roles");
  await expect(page.locator("#main h1")).toHaveText(O.heading);
  expect(await page.evaluate(() => [localStorage.getItem("open.tree"), JSON.parse(localStorage.getItem("open.flow")).roles])).toEqual([null, []]);
});

test("with a form id the booking card follows the two projects and links to the Tally form, all before the tree", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm", { OPEN_TREE_ENABLED: true, OPEN_QUESTS_ENABLED: false, BOOKING_TALLY: "wA1b2C" });
  await build(page);
  await expect(page.locator("#open-book h2")).toHaveText(O.book.heading);
  await expect(page.locator("#open-book")).toContainText("$60");
  await expect(page.locator("#open-book")).not.toContainText(/black friday|sale|% off/i);
  const u = new URL(await page.locator("#open-book-link").getAttribute("href"));
  expect(u.origin + u.pathname).toBe("https://tally.so/r/wA1b2C");
  expect(u.searchParams.get("email")).toBe(EMAIL); expect(u.searchParams.get("role")).toBe("pmm");
  expect(await before(page, "#open-preview", "#open-book") && await before(page, "#open-book", "#map-body"), "the projects, the card, then the tree").toBe(true);
  await shot(page, "booking");
});

test("a role outside the standards file still gets two projects, from the tree", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=treasury");
  await build(page);
  await expect(page.locator("#open-preview .op-card")).toHaveCount(2);
});

test("as config.js ships: Build skills in the top bar opens the form, and no sign-in shows on it, the launcher, home or the door; #/signin still opens", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/skills", null);
  await page.locator("#lf-body").waitFor();
  await expect(page.locator("#main .lf-slot")).toHaveCount(0);
  await expect(page.locator('#main a[href^="#/signin"]')).toHaveCount(0);
  await page.click("#verbs a[href='#/map']");
  await at(page, "roles");
  await expect(page.locator("#main h1")).toHaveText(O.heading);
  await expect(page.locator('#main a[href^="#/signin"]')).toHaveCount(0);
  await expect(page.locator("#main")).not.toContainText(/sign in/i);
  await page.goto("/#/home"); await page.locator("#main .home-page .verbs a.verb").first().waitFor();
  await expect(page.locator("#main .home-page")).not.toContainText(Copy.home.verbs.build.invite);
  await expect(page.locator('#main a[href^="#/signin"]')).toHaveCount(0);
  await page.goto("/#/signin"); await page.locator("#main #si").waitFor();
  const door = await visitor.open({ storage: {} });
  await door.goto("/#/"); await door.locator("#main section.door").waitFor();
  await expect(door.locator("#door-invited")).toHaveCount(0);
  await expect(door.locator('#main a[href^="#/signin"]')).toHaveCount(0);
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

test("build quests on: six steps, the answers go with the résumé, the writing line and then three quests come before the tree; each opens on the Quests page", async ({ visitor }) => {
  let release; const hold = new Promise(r => { release = r; });
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm", QUESTS_ON, {}, { hold, body: { ok: true, projects: PROJECTS, model: "claude-opus-5-5", dropped: [] } });
  await at(page, "roles");
  await expect(page.locator(".sp-prog")).toHaveAttribute("aria-valuemax", "6");
  await next(page); await at(page, "resume"); await next(page);
  // c: a radio group; Next without a choice says what is missing; a choice moves on by itself
  await at(page, "tech");
  await expect(page.locator(".sp-opts[role=radiogroup] [role=radio]")).toHaveCount(4);
  await next(page);
  await expect(page.locator("#sp-err")).toHaveText(O.noTech);
  await page.click(`[data-tech="no_code"]`);
  // d and e can be skipped: Next reads "Skip this" until something is marked
  await at(page, "tools");
  await expect(page.locator("#sp-go")).toHaveText(MC.flow.skipStep);
  await page.click(`[data-kind="chat_pages"][data-v="use"]`);
  await expect(page.locator(`[data-kind="chat_pages"][data-v="use"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`[data-kind="chat_pages"][data-v="use"]`)).toBeFocused();
  await expect(page.locator("#sp-go")).toHaveText(MC.flow.next);
  await next(page);
  await at(page, "accounts");
  await page.click(`[data-acc="github"][data-v="have"]`);
  await next(page);
  await at(page, "email");
  await expect(page.locator("#main .sp-privacy")).toHaveText(O.keepsQuests);
  // a reload keeps the step and every answer; Back walks the steps back with them
  await page.fill("#sp-email", EMAIL);
  await page.reload();
  await at(page, "email");
  await expect(page.locator("#sp-email")).toHaveValue(EMAIL);
  await page.goBack(); await at(page, "accounts");
  await expect(page.locator(`[data-acc="github"][data-v="have"]`)).toHaveAttribute("aria-pressed", "true");
  await page.goBack(); await at(page, "tools");
  await page.goBack(); await at(page, "tech");
  await expect(page.locator(`[data-tech="no_code"]`)).toHaveAttribute("aria-checked", "true");
  await page.goForward(); await page.goForward(); await page.goForward(); await at(page, "email");
  await page.click("#sp-go");
  // the line that they are being written comes first, above the tree
  await page.locator("#open-writing").waitFor({ state: "visible" });
  await expect(page.locator("#open-writing")).toContainText(O.writing);
  expect(await before(page, "#open-writing", "#map-body"), "the writing line before the tree").toBe(true);
  release();
  await page.locator("#open-quests .op-quest").first().waitFor({ state: "visible" });
  await expect(page.locator("#open-quests h2")).toHaveText(O.questsHeading);
  await expect(page.locator("#open-quests .op-quest h3")).toHaveText(PROJECTS.map(p => p.title));
  expect(await before(page, "#open-quests", "#map-body"), "the projects before the tree").toBe(true);
  await expect(page.locator("#open-preview")).toHaveCount(0);
  await expect(page.locator("#open-book")).toHaveCount(1);
  // what went to the function: the email, the résumé, the role and the three answers; once
  expect(page.asked.length).toBe(1);
  expect(page.asked[0]).toMatchObject({ email: EMAIL, roles: ["pmm"], answers: { tech: "no_code", tools: { chat_pages: "use" }, accounts: { github: "have" } } });
  expect(page.asked[0].text).toContain(TEXT.slice(200, 260));
  const held = await page.evaluate(() => JSON.parse(localStorage.getItem("open.tree")));
  expect([held.tech, held.tools, held.accounts], "kept on the tree for the next day's ask").toEqual(["no_code", { chat_pages: "use" }, { github: "have" }]);
  await expect(page.locator(".mapnav a")).toHaveText([MC.nav.quests, MC.nav.tree]);
  await shot(page, "quests-tree");
  // a quest opens on the Quests page as a build card: its steps, no résumé story card anywhere
  await page.locator("#open-quests .op-quest").nth(1).click();
  await expect.poll(() => hashOf(page)).toMatch(/^#\/map\/quests\?q=side-/);
  await expect(page.locator("#main .q-now")).toContainText(PROJECTS[1].title);
  expect(await before(page, "#map-body", "#open-book"), "on the Quests page the card follows the quest").toBe(true);
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

test("build quests on: a step's address out of reach lands on the first step that lacks an answer", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map/find/email", QUESTS_ON, { "open.flow": JSON.stringify({ roles: ["pmm"], email: EMAIL }) });
  await at(page, "tech");
  await page.click(`[data-tech="ai_tools"]`);
  await at(page, "tools");
  await page.evaluate(() => { location.hash = "#/map/find/email"; });
  await at(page, "email");
  await expect(page.locator("#sp-email")).toHaveValue(EMAIL);
  const none = await visitorAt(visitor, "#/map/find/tools", QUESTS_ON, { resume: "null" });
  await at(none, "roles");
  expect(page.asked || []).toEqual([]);
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
