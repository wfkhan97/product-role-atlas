// The portfolio flow as it ships (2026-11-27, SKILL_TREE_ENABLED off): #/map is the open flow for everyone, the six
// questions at #/map/find/<step>, then three projects at #/map/projects (a row that snaps on a phone, three columns on
// a desktop), the one picked at #/map/projects/<id> with its steps, prompt and the project guide to download. The
// flags are set in the page by an init script, whatever web/config.js holds; /api/open is stubbed with projects as the
// function returns them, so no model is called. OPEN_SHOTS=1 saves the screens under
// data/experiments/scratch/open-projects/shots/ (gitignored).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test, expect, unexpected } from "./fixtures.mjs";

const require = createRequire(import.meta.url);
const Copy = require("../../web/copy.js"), MC = Copy.map, O = MC.open, P = O.projects, K = O.picked, F = MC.flow;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHOTS = path.join(ROOT, "data", "experiments", "scratch", "open-projects", "shots");
const KIT = JSON.parse(fs.readFileSync(path.join(ROOT, "web", "data", "build_kit.json"), "utf8"));
const TEXT = fs.readFileSync(path.join(ROOT, "pipeline", "apprentice", "examples", "pmm-nyc", "profile.md"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
const RESUME = JSON.stringify({ name: "resume.pdf", text: TEXT, words: TEXT.split(/\s+/).length, inferred: [], aiRead: false });
const EMAIL = "ui-harness@gmail.com";
const ON = { OPEN_TREE_ENABLED: true, OPEN_QUESTS_ENABLED: true, SKILL_TREE_ENABLED: false, BOOKING_TALLY: "wA1b2C", SESSION_URL: null };
const hashOf = page => page.evaluate(() => location.hash);
const flags = extra => [x => { let v; Object.defineProperty(window, "CONFIG", { configurable: true, get: () => v, set: c => { v = c; if (c) Object.assign(c, x); } }); }, extra];
const shot = async (page, name) => { if (process.env.OPEN_SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}-${test.info().project.name}.png`), fullPage: true }); } };
const tools = kind => KIT.kinds.find(k => k.id === kind).examples.slice(0, 2).map(e => ({ name: e.name, url: e.url, free: e.free, own: false }));
const project = (i, title, kind, place, level) => ({
  id: `p${i}`, level, title, ship: "A public page that compares how three freight apps pitch their product.",
  atlas_skills: ["positioning_messaging", "gtm"], steps: ["Pick three apps your old customers used.", "Copy each home page headline and pitch.", "Ask the assistant to compare them in a table.", "Publish the page and share the link."],
  prompt: "Help me write a positioning teardown of three freight software products. Compare their headlines and the proof each offers.",
  build_with: { kind, examples: tools(kind).map(t => t.name), tools: [...tools(kind), { name: "PowerPoint", url: null, free: null, own: true }] }, live_on: { place },
  share: { place: "linkedin", how: "Post the page with one screenshot and what surprised you.", post: "I compared how three freight apps pitch themselves. Here is my teardown." },
  why_role: { text: "Product marketers own positioning.", posting_quote: null }, why_person: { text: "You sold logistics software, so you know these buyers.", resume_quote: null },
});
const SET1 = [project(1, "A positioning teardown of three freight apps", "design_decks", "linkedin", "beginner"), project(2, "A launch brief for a partner program", "research", "notion_page", "beginner"), project(3, "A pricing page test plan for a tracker", "dashboards", "substack", "intermediate")];
const SET2 = [project(4, "A churn interview guide for freight teams", "research", "linkedin", "beginner"), project(5, "A competitor price sheet for three carriers", "design_decks", "linkedin", "beginner"), project(6, "A webinar funnel dashboard for a launch", "dashboards", "linkedin", "intermediate")];
const ok = projects => ({ status: 200, body: { ok: true, projects, model: "claude-opus-5-5", dropped: [] } });

// `answer(body, n)`: the stub's reply to the nth ask ({ status, body, hold }); `session`: a made-up session and the
// Supabase project stubbed (a person signed in, with a map file)
async function visitorAt(visitor, hash, { config = ON, storage = {}, answer = () => ok(SET1), session = null } = {}) {
  const base = { "door.email": "", "door.where": "", "door.seen": "1", resume: RESUME };
  if (session) Object.assign(base, { "maps.session": JSON.stringify(session), "door.email": session.email });
  const page = await visitor.open({ storage: { ...base, ...storage } });
  page.asked = []; page.api = []; page.posts = [];
  const ctx = page.context();
  await ctx.addInitScript(...flags(config));
  await ctx.route("**/api/**", async r => {
    const p = new URL(r.request().url()).pathname; page.api.push(p);
    if (p !== "/api/open") return r.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    const body = r.request().postDataJSON(); page.asked.push(body);
    const a = answer(body, page.asked.length);
    if (a.hold) await a.hold;
    return r.fulfill({ status: a.status || 200, contentType: "application/json", body: JSON.stringify(a.body || {}) });
  });
  await ctx.route(/\.supabase\.co\//, r => {
    const req = r.request(), url = new URL(req.url());
    if (/\/rest\/v1\//.test(url.pathname)) { if (req.method() === "POST") page.posts.push(url.pathname.split("/").pop()); return r.fulfill({ status: req.method() === "POST" ? 201 : 200, contentType: "application/json", body: req.method() === "POST" ? "" : "[]" }); }
    if (/\/storage\/v1\/object\//.test(url.pathname)) { page.api.push("storage"); return r.fulfill({ status: 404, contentType: "application/json", body: "{}" }); }
    return r.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/" + hash);
  await page.locator("#main .page h1").first().waitFor({ state: "visible" });
  return page;
}
const step = page => hashOf(page).then(h => (/^#\/map\/find\/(\w+)/.exec(h) || [])[1] || null);
const next = page => page.click("#sp-go");
const at = async (page, name) => { await expect.poll(() => step(page)).toBe(name); await page.locator(".sp-ask").waitFor(); };
// from the roles step (a role picked) to the projects page
async function walk(page, { tools: kinds = [], own = "", tryNew = null, places = [], ownPlaces = "", host = null, note = "" } = {}) {
  await at(page, "roles"); await next(page);
  await at(page, "resume"); await next(page);
  await at(page, "tech"); await page.click(`[data-tech="no_code"]`);
  await at(page, "tools");
  if (own) await page.fill("#sp-own-tools", own);
  for (const k of kinds) await page.click(`[data-kind="${k}"]`);
  if (tryNew !== null) await page.click(`[data-try="${tryNew}"]`);
  await next(page);
  await at(page, "share");
  for (const k of places) await page.click(`[data-place="${k}"]`);
  if (ownPlaces) await page.fill("#sp-own-places", ownPlaces);
  if (host) { await page.click(`[data-pf="true"]`); await page.click(`[data-host="${host}"]`); if (note) await page.fill("#sp-pf-note", note); }
  await next(page);
  await at(page, "email");
  await page.fill("#sp-email", EMAIL);
  await page.click("#sp-go");
  await expect.poll(() => hashOf(page)).toBe("#/map/projects");
}
const cards = page => page.locator("#pj-row .pj-card");

test("the roles step: the main role by search, more of its field by chip and by search; other fields left out with a line and Start over", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map");
  await at(page, "roles");
  await expect(page.locator(".sp-ask")).toHaveText(O.roles.title);
  // the audit's bug: "product manager" then Enter added Product Marketing Manager
  await page.fill("#sp-q", "product manager");
  await expect(page.locator("#sp-hits [data-add]").first()).toHaveAttribute("data-add", "product.pm");
  // two roles of one label are told apart by their field
  await expect(page.locator("#sp-hits")).toContainText("Product Marketing Manager (Marketing)");
  await expect(page.locator("#sp-hits")).toContainText("Product Marketing Manager (Product)");
  await page.fill("#sp-q", "product marketing manager");
  await page.locator("#sp-hits [data-add='pmm']").click();
  await expect(page.locator(".sp-picked .sp-role")).toHaveText([/Product Marketing Manager \(Marketing\)/]);
  await expect(page.locator("#sp-q")).toBeFocused();
  // the field is set: one visible line says so; the search leaves other fields out
  await expect(page.locator("#sp-one")).toContainText(Copy.fill(O.roles.oneField, { field: "Marketing" }));
  await page.fill("#sp-q", "product manager");
  await expect(page.locator("#sp-hits [data-add='product.pm']")).toHaveCount(0);
  await page.fill("#sp-q", "brand");
  await page.keyboard.press("Enter");
  await expect(page.locator(".sp-picked .sp-role")).toHaveCount(2);
  // a chip of the field adds a third
  const chip = page.locator("#sp-browse [data-toggle][aria-pressed='false']").first();
  const third = await chip.getAttribute("data-toggle");
  await chip.click();
  await expect(page.locator(`[data-drop="${third}"]`)).toBeVisible();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("open.flow")))).roles).toEqual(["pmm", "brand_manager", third]);
  await shot(page, "roles");
  // Start over clears the picks and every field comes back
  await page.click("#sp-over");
  await expect(page.locator(".sp-picked .sp-role")).toHaveCount(0);
  await expect(page.locator("#sp-one")).toHaveCount(0);
  await expect(page.locator(".sp-fields [data-browse='software']")).toBeVisible();   // the tech set's fields too
  await page.fill("#sp-q", "product manager");
  await expect(page.locator("#sp-hits [data-add='product.pm']")).toBeVisible();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("open.flow")))).roles).toEqual([]);
  expect(unexpected(page.consoleErrors)).toEqual([]);
});

test("the tools and share steps write their answers into the /api/open request; the old accounts address lands on share", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm");
  await at(page, "roles"); await next(page); await at(page, "resume"); await next(page);
  await at(page, "tech"); await page.click(`[data-tech="no_code"]`);
  await at(page, "tools");
  await expect(page.locator(".sp-ask")).toHaveText(F.tools.title);
  await expect(page.locator("#sp-own-tools")).toHaveAttribute("placeholder", F.tools.ownHint);
  await expect(page.locator("#sp-kinds-h")).toHaveText(Copy.fill(F.tools.kinds, { field: "Marketing" }));
  const kinds = await page.locator("[data-kind]").evaluateAll(bs => bs.map(b => b.dataset.kind));
  const Quests = require("../../web/quests.js");
  expect(kinds).toEqual(Quests.fieldKinds(KIT, "marketing", "no_code"));
  await expect(page.locator("[data-kind] [data-v]")).toHaveCount(0);   // no Use it / Want to learn pair
  await page.fill("#sp-own-tools", "PowerPoint, Google Sheets with Gemini");
  await page.click(`[data-kind="design_decks"]`);
  await expect(page.locator(`[data-kind="design_decks"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`[data-kind="design_decks"]`)).toBeFocused();
  await page.click(`[data-try="false"]`);
  await expect(page.locator(`[data-try="false"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#main")).toContainText(F.tools.tryNewLine);
  await shot(page, "tools");
  await next(page);
  await at(page, "share");
  await expect(page.locator(".sp-ask")).toHaveText(F.share.title);
  await expect(page.locator(`[data-place="linkedin"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`[data-place="kaggle"]`)).toHaveCount(0);
  await page.click(`[data-place="canva_link"]`);
  await page.fill("#sp-own-places", "Instagram");
  await expect(page.locator("[data-host]")).toHaveCount(0);
  await page.click(`[data-pf="true"]`);
  await expect(page.locator("[data-host]")).toHaveCount(KIT.portfolio_hosts.length);
  await page.click(`[data-host="squarespace"]`);
  await page.fill("#sp-pf-note", "jordanlee.com");
  await shot(page, "share");
  // a reload keeps every answer, and the old step's address lands here
  await page.evaluate(() => { location.hash = "#/map/find/accounts"; });
  await at(page, "share");
  await page.reload(); await at(page, "share");
  await expect(page.locator(`[data-host="squarespace"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#sp-pf-note")).toHaveValue("jordanlee.com");
  await next(page); await at(page, "email");
  await page.fill("#sp-email", EMAIL); await page.click("#sp-go");
  await expect.poll(() => page.asked.length).toBe(1);
  expect(page.asked[0].answers).toEqual({ tech: "no_code", tools: { design_decks: "use" }, own_tools: "PowerPoint, Google Sheets with Gemini", try_new: false, places: ["linkedin", "canva_link"], own_places: "Instagram", portfolio: { host: "squarespace", note: "jordanlee.com" } });
  expect(page.asked[0]).toMatchObject({ email: EMAIL, roles: ["pmm"] });
  expect(page.asked[0].feedback).toBeUndefined();
});

test("the three cards: a waiting state while the function writes, then level, title, what you ship, build with, show it on and Pick; the pick and its ticks stay through a reload", async ({ visitor }) => {
  let release; const hold = new Promise(r => { release = r; });
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm", { answer: () => ({ ...ok(SET1), hold }) });
  await walk(page, { own: "PowerPoint", tools: ["design_decks"] });
  await expect(page.locator("#open-writing")).toContainText(P.writing);
  await expect(page.locator("#open-writing")).toContainText(P.keepOpen);
  await expect(page.locator("#main")).not.toContainText(/\b(seconds?|minutes?)\b/i);
  await shot(page, "waiting");
  release();
  await expect(cards(page)).toHaveCount(3);
  const first = cards(page).first();
  await expect(first.locator(".pj-level")).toHaveText(P.levels.beginner);
  await expect(cards(page).nth(2).locator(".pj-level")).toHaveText(P.levels.intermediate);
  await expect(first.locator("h2")).toHaveText(SET1[0].title);
  await expect(first).toContainText(P.youShip);
  await expect(first).toContainText("Decks and visuals");
  await expect(first).toContainText(`Canva (${KIT.kinds.find(k => k.id === "design_decks").examples[0].free})`);
  await expect(first).toContainText(`PowerPoint (${P.yours})`);
  await expect(first).toContainText(P.showOn);
  await expect(cards(page).nth(1)).toContainText("A public Notion page");
  await expect(page.locator("[data-pick]")).toHaveCount(3);
  await expect(page.locator("#open-book")).toHaveCount(0);
  await expect(page.locator("#pj-session")).toHaveCount(0);   // SESSION_URL null: no line
  await expect(page.locator(".mapnav, #map-body")).toHaveCount(0);
  expect(page.api.filter(p => p === "/api/tree" || p === "/api/quests")).toEqual([]);
  await shot(page, "cards");
  // pick the second: its page
  await cards(page).nth(1).locator("[data-pick]").click();
  await expect.poll(() => hashOf(page)).toMatch(/^#\/map\/projects\/side-a-launch-brief/);
  await expect(page.locator(".pj-one h1")).toHaveText(SET1[1].title);
  await expect(page.locator(".pj-one")).toContainText(K.whyRole);
  await expect(page.locator(".pj-one")).toContainText(SET1[1].why_person.text);
  await expect(page.locator(".pj-steps li")).toHaveCount(4);
  await expect(page.locator("#pj-prompt")).toHaveText(SET1[1].prompt);
  await expect(page.locator("#pj-post")).toHaveText(SET1[1].share.post);
  await expect(page.locator(".pj-tools a").first()).toHaveAttribute("href", /^https:\/\//);
  await page.locator(".pj-steps input[data-step='1']").check();
  await shot(page, "picked");
  await page.reload();
  await expect(page.locator(".pj-one h1")).toHaveText(SET1[1].title);
  await expect(page.locator(".pj-steps input[data-step='1']")).toBeChecked();
  // #/map and the skill tree's old addresses come back to the pick or the projects, never a tree
  await page.evaluate(() => { location.hash = "#/map"; });
  await expect(page.locator(".pj-one h1")).toHaveText(SET1[1].title);
  for (const h of ["#/map/tree", "#/map/quests", "#/map/start", "#/map?build=1"]) {
    await page.evaluate(x => { location.hash = x; }, h);
    await expect.poll(() => hashOf(page)).toBe("#/map/projects");
    await expect(cards(page)).toHaveCount(3);
  }
  await page.click(`[data-pick="${(await page.evaluate(() => JSON.parse(localStorage.getItem("open.tree")).cards[0].id))}"]`);
  await page.locator("#pj-back").click();
  await expect.poll(() => hashOf(page)).toBe("#/map/projects");
  expect(page.asked.length, "nothing asked again").toBe(1);
  expect(unexpected(page.consoleErrors)).toEqual([]);
});

test("None of these: what should be different and the titles shown go to the function; three new ones replace the three; a 429 says today's limit", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm", { answer: (b, n) => n === 1 ? ok(SET1) : n === 2 ? ok(SET2) : { status: 429, body: { error: "rate_limited", scope: "email" } } });
  await walk(page);
  await expect(cards(page)).toHaveCount(3);
  await page.click("#pj-none-open");
  await expect(page.locator("#pj-fb")).toBeFocused();
  await expect(page.locator("label[for='pj-fb']")).toHaveText(P.noneTitle);
  await page.fill("#pj-fb", "Less writing, more numbers.");
  await shot(page, "none");
  await page.click("#pj-rewrite");
  await expect(cards(page).locator("h2")).toHaveText(SET2.map(p => p.title));
  expect(page.asked[1].feedback).toBe("Less writing, more numbers.");
  expect(page.asked[1].avoid).toEqual(SET1.map(p => p.title));
  expect(page.asked[1].answers).toEqual(page.asked[0].answers);
  // again: every title shown so far, six at most; the cap answers
  await page.click("#pj-none-open");
  await page.fill("#pj-fb", "Shorter.");
  await page.click("#pj-rewrite");
  await expect(page.locator("#open-why")).toHaveText(P.limited);
  expect(page.asked[2].avoid).toEqual([...SET1, ...SET2].map(p => p.title));
  await expect(cards(page).locator("h2")).toHaveText(SET2.map(p => p.title), { timeout: 2000 });
});

test("the download: one file named for the project, with its title and the portfolio part for the host the person named", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm");
  await walk(page, { host: "squarespace", note: "jordanlee.com" });
  await cards(page).first().locator("[data-pick]").click();
  await expect(page.locator("#pj-download")).toHaveText(K.download);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#pj-download")]);
  expect(dl.suggestedFilename()).toBe("project-guide-a-positioning-teardown-of-three-freight-apps.html");
  const text = fs.readFileSync(await dl.path(), "utf8");
  expect(text).toMatch(/^<!doctype html>/);
  expect(text).toContain(`<h1>${SET1[0].title}</h1>`);
  expect(text).toContain("Add it to your portfolio");
  expect(text).toContain("Open your portfolio in the Squarespace editor.");
  expect(text).toContain("Your site: jordanlee.com");
  expect(text).toContain(SET1[0].prompt);
  expect(text).not.toMatch(/\ssrc=|<link\b|@import/);
  // the file as a person opens it: it reads on this screen, with nothing fetched
  const file = await page.context().newPage();
  const reqs = []; file.on("request", r => { if (!r.url().startsWith("data:")) reqs.push(r.url()); });
  await file.setContent(text);
  await expect(file.locator("h1")).toHaveText(SET1[0].title);
  expect(await file.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll").toBe(true);
  await file.locator("input[data-tick='s0']").check();
  expect(reqs).toEqual([]);
  if (process.env.OPEN_SHOTS) await file.screenshot({ path: path.join(SHOTS, `guide-${test.info().project.name}.png`), fullPage: true });
});

test("the function failing: the two no-model projects in the same frame, without Pick, and Try again asks once more; the session line only with an address", async ({ visitor }) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm", { config: { ...ON, SESSION_URL: "https://cal.example.com/wally/30min" }, answer: (b, n) => n === 1 ? { status: 502, body: { error: "upstream" } } : ok(SET1) });
  await walk(page);
  await expect(page.locator("#open-preview .pj-card")).toHaveCount(2);
  await expect(page.locator("#open-preview [data-pick]")).toHaveCount(0);
  await expect(page.locator("#open-why")).toContainText(P.failed);
  const s = page.locator("#pj-session");
  await expect(s).toHaveText(P.session);
  await expect(s).toHaveAttribute("href", "https://cal.example.com/wally/30min");
  await expect(s).toHaveAttribute("target", "_blank");
  await shot(page, "fallback");
  await page.click("#open-retry");
  await expect(cards(page)).toHaveCount(3);
  await expect(page.locator("[data-pick]")).toHaveCount(3);
  expect(page.asked.length).toBe(2);
});

test("a signed-in person with the skill tree off gets the open flow on #/map: no map read, no tree, no Quests page", async ({ visitor }) => {
  const session = { access_token: "ui-harness-token", refresh_token: "", expires_at: 4102444800, uid: "00000000-0000-4000-8000-00000000c0de", email: "ui-harness@cornell.edu" };
  const page = await visitorAt(visitor, "#/map", { session });
  await at(page, "roles");
  await expect(page.locator("#main h1")).toHaveText(O.heading);
  for (const h of ["#/map/tree", "#/map/quests", "#/map/start"]) {
    await page.evaluate(x => { location.hash = x; }, h);
    await at(page, "roles");
  }
  await expect(page.locator(".mapnav, #map-body, .tr-form, a[href^='#/map/start']")).toHaveCount(0);
  expect(page.api.filter(p => p === "storage"), "the session's map file is never read").toEqual([]);
  // the fit screen draws no "Get your tree"
  await page.goto("/#/role/pmm/fit");
  await page.locator("#main .fitcols").first().waitFor();
  await expect(page.locator("#get-tree, .tree-cta")).toHaveCount(0);
});

test("the cards on a phone: one row that snaps, one card per screen, dots and Previous and Next as real buttons; three columns on a desktop", async ({ visitor }, info) => {
  const page = await visitorAt(visitor, "#/map?build=1&role=pmm");
  await walk(page);
  await expect(cards(page)).toHaveCount(3);
  const box = i => cards(page).nth(i).boundingBox();
  const vw = await page.evaluate(() => window.innerWidth);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "the page never scrolls sideways").toBe(true);
  if (info.project.name === "phone") {
    await expect(page.locator(".pj-car")).toHaveAttribute("aria-roledescription", "carousel");
    await expect(page.locator("#pj-prev")).toBeDisabled();
    await expect(page.locator("[data-dot]")).toHaveCount(3);
    await expect(page.locator("[data-dot='0']")).toHaveAttribute("aria-current", "true");
    const b0 = await box(0);
    expect(b0.width).toBeGreaterThan(vw * 0.8);
    expect((await box(1)).x).toBeGreaterThan(vw * 0.9);   // the second card waits at the edge, a sliver showing
    await page.click("#pj-next");
    await expect(page.locator("[data-dot='1']")).toHaveAttribute("aria-current", "true");
    await expect.poll(async () => Math.round((await box(1)).x)).toBeLessThan(40);
    await page.click("[data-dot='2']");
    await expect(page.locator("[data-dot='2']")).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#pj-next")).toBeDisabled();
    await page.click("#pj-prev");
    await expect(page.locator("[data-dot='1']")).toHaveAttribute("aria-current", "true");
    // a keyboard user reaches each card's Pick; the row brings it into view
    await page.locator("[data-pick]").nth(2).focus();
    await expect.poll(async () => Math.round((await box(2)).x)).toBeLessThan(40);
    await shot(page, "phone-cards");
  } else {
    await expect(page.locator(".pj-ctl")).toBeHidden();
    const [a, b, c] = [await box(0), await box(1), await box(2)];
    expect(Math.abs(a.y - b.y) < 2 && Math.abs(b.y - c.y) < 2, "three columns on one line").toBe(true);
    expect(c.x + c.width).toBeLessThanOrEqual(vw);
  }
});
