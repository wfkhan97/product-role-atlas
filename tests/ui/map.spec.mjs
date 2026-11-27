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

// `map` null: no map file yet (a 404 from the bucket). `ready`: what the screen draws when it is done. `extra`: more
// localStorage keys (a résumé on file).
async function signedIn(visitor, hash = "#/map", map = EXAMPLE, { ready = "#map-body > *", extra = {} } = {}) {
  const page = await visitor.open({ storage: { "maps.session": JSON.stringify(SESSION), "door.email": SESSION.email, "door.where": "", "door.seen": "1", ...extra } });
  page.files = {}; page.writes = [];
  // the map's two pages without "Start a side project" (QUESTS_ENABLED is on in web/config.js since 2026-11-11;
  // tests/ui/quests.spec.mjs has the flow): the flag is off in the page
  // tests/ui/quests.spec.mjs has the flow): the flag is off in the page; the skill tree is on (SKILL_TREE_ENABLED, off in
  // web/config.js since 2026-11-27, when #/map is the open flow for a session too: open_projects.spec.mjs)
  await page.context().addInitScript(() => { let v; Object.defineProperty(window, "CONFIG", { configurable: true, get: () => v, set: c => { v = c; if (c) { c.QUESTS_ENABLED = false; c.SKILL_TREE_ENABLED = true; } } }); });
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
  await page.locator(ready).first().waitFor();
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

// ---------- Build skills, the map's own section (decision K, 2026-11-10) ----------
const BAR = Copy.common.bar;
const crumbsOf = page => page.locator("#crumbs a, #crumbs .here").allInnerTexts();
const barShot = async (page, name, info) => { if (!process.env.MAP_SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-${name}.png`), clip: { x: 0, y: 0, width: page.viewportSize().width, height: 140 } }); };

test("Build skills: the top bar shows it after Explore careers for a session, marked on the map, with the crumbs Build skills / Quests and / Skill tree", async ({ visitor }, info) => {
  const page = await signedIn(visitor);
  const verbs = page.locator("#verbs a.toplink[data-verb]");
  await expect(verbs).toHaveText([BAR.jobs, BAR.skills, BAR.build, BAR.classes, BAR.network]);
  const build = page.locator("#verbs a[data-verb='build']");
  await expect(build).toHaveAttribute("href", "#/map");
  await expect(page.locator("#verbs [aria-current='page']")).toHaveText(BAR.build);
  await expect.poll(() => crumbsOf(page)).toEqual([BAR.build, MC.nav.quests]);
  await expect(page.locator("#crumbs a").first()).toHaveAttribute("href", "#/map");
  await expect(page.locator(".map-top a"), "no link to the launcher on the map head").toHaveCount(0);
  await barShot(page, "topbar", info);
  await page.locator(".mapnav a", { hasText: MC.nav.tree }).click();
  await expect.poll(() => crumbsOf(page)).toEqual([BAR.build, MC.nav.tree]);
  await expect(page.locator("#verbs [aria-current='page']")).toHaveText(BAR.build);
  // the launcher marks Explore careers, not Build skills
  await page.locator("#verbs a[data-verb='skills']").click();
  await page.locator("#lf-body").waitFor();
  await expect(page.locator("#verbs [aria-current='page']")).toHaveText(BAR.skills);
  expect(unexpected(page.consoleErrors)).toEqual([]);
});

// The invited path, with the open tree off in the page (2026-11-11: OPEN_TREE_ENABLED is on in web/config.js, and with
// it #/map with no session is the open tree's form, tests/ui/open_tree.spec.mjs). These three keep the flag-off rule.
const OPEN_OFF = () => { let v; Object.defineProperty(window, "CONFIG", { configurable: true, get: () => v, set: c => { v = c; if (c) c.OPEN_TREE_ENABLED = false; } }); };
test("Build skills: a visitor with no session sees Build skills in the top bar; it leads to the sign-in, and the launcher draws no sign-in line", async ({ visitor }) => {
  const page = await visitor.open({ storage: { "door.email": "someone@example.com", "door.where": "", "door.seen": "1" } });
  await page.context().addInitScript(OPEN_OFF);
  await page.goto("/#/skills");
  await page.locator("#lf-body").waitFor();
  await expect(page.locator("#verbs a.toplink[data-verb]")).toHaveText([BAR.jobs, BAR.skills, BAR.build, BAR.network]);
  await expect(page.locator("#main .lf-slot")).toHaveCount(0);
  await page.click("#verbs a[href='#/map']");
  await expect.poll(() => hashOf(page)).toBe("#/signin?next=" + encodeURIComponent("#/map"));
  await expect(page.locator("#main")).toContainText(Copy.signin.mapLine);
});

// 2026-11-12: the welcome screen's "Invited to Build skills?" line is gone (no visible sign-in while accounts are off)
test("The welcome screen draws no sign-in line", async ({ visitor }, info) => {
  const page = await visitor.open({ storage: {} });
  await page.goto("/#/home");
  await page.locator("#main section.door").waitFor();
  await expect(page.locator("#door-invited")).toHaveCount(0);
  await expect(page.locator('#main a[href^="#/signin"]')).toHaveCount(0);
  await shot(page, "welcome", info);
});

test("Build skills: no session goes to the sign-in with the map's page as next, so it comes back there", async ({ visitor }) => {
  const page = await visitor.open({ storage: { "door.email": "someone@example.com", "door.where": "", "door.seen": "1" } });
  await page.context().addInitScript(OPEN_OFF);
  await page.goto("/#/map/tree?view=list");
  await expect.poll(() => hashOf(page)).toBe("#/signin?next=" + encodeURIComponent("#/map/tree?view=list"));
  await page.locator("#main #si").waitFor();
});

test("Build skills: #/skills no longer sends a map owner to the map, and draws no map line", async ({ visitor }) => {
  const page = await signedIn(visitor);
  await page.evaluate(() => { location.hash = "#/skills"; });
  await page.locator("#lf-body .lf-tiles").waitFor();
  await page.waitForTimeout(500);   // a redirect would come after the map read
  expect(await hashOf(page)).toBe("#/skills");
  await expect(page.locator("#main .lf-slot")).toHaveCount(0);
  await expect(page.locator("#main h1")).toHaveText(Copy.skills.heading);
});

test("Build skills: a session with no map lands on the tree form as the first step, and reuses the résumé already on file", async ({ visitor }, info) => {
  const resume = { name: "resume.pdf", text: "Product marketing manager. Ran positioning and launches." };
  const page = await signedIn(visitor, "#/map", null, { ready: "#main .tr-form", extra: { resume: JSON.stringify(resume) } });
  await expect(page.locator("#main h1")).toHaveText(MC.tree.firstHeading);
  await expect(page.locator("#main .lead")).toHaveText(MC.tree.firstLead);
  await expect.poll(() => crumbsOf(page)).toEqual([BAR.build]);
  await expect(page.locator("#verbs [aria-current='page']")).toHaveText(BAR.build);
  await expect(page.locator(".tr-form")).toContainText(Copy.fill(MC.tree.onFile, { name: resume.name }));
  await expect(page.locator(".tr-form #drop")).toHaveCount(0);
  await expect(page.locator("#tr-field")).toBeVisible();
  await expect(page.locator("#main a[href^='#/skills']"), "no link to the launcher: the top bar has it").toHaveCount(0);
  await shot(page, "first-step-form", info);
  expect(unexpected(page.consoleErrors)).toEqual([]);
});

// 2026-11-11: the sign-in email leads with a six-digit code, so the invited page asks for it (the link still works)
test("Sign in: an invited address gets the code box; a wrong code says so, the right one lands on the page it came from", async ({ visitor }, info) => {
  const page = await visitor.open({ storage: { "door.email": "someone@example.com", "door.where": "", "door.seen": "1" } });
  await page.context().addInitScript(OPEN_OFF);
  const token = ["x", Buffer.from(JSON.stringify({ sub: UID, email: SESSION.email })).toString("base64url"), "y"].join(".");
  const calls = [];
  await page.context().route(/\.supabase\.co\//, route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname.endsWith("/auth/v1/otp")) { calls.push(["otp", JSON.parse(req.postData())]); return route.fulfill({ status: 200, contentType: "application/json", body: "{}" }); }
    if (url.pathname.endsWith("/auth/v1/verify")) {
      const b = JSON.parse(req.postData()); calls.push(["verify", b]);
      return b.token === "919061" ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access_token: token, refresh_token: "r", expires_in: 3600, user: { id: UID, email: SESSION.email } }) })
        : route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error_code: "otp_expired", msg: "Token has expired or is invalid" }) });
    }
    const m = /\/storage\/v1\/object\/(?:authenticated\/)?maps\/(.+)$/.exec(url.pathname);
    if (m && req.method() === "GET") return m[1] === `${UID}/map.json` ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(EXAMPLE) }) : route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    return route.fulfill({ status: 200, contentType: "application/json", body: req.method() === "GET" ? "[]" : "{}" });
  });
  await page.goto("/#/map/tree");
  await page.locator("#main #si").waitFor();
  await expect(page.locator("#main")).toContainText(Copy.signin.mapLine);
  await expect(page.locator("#si-send")).toHaveText(Copy.signin.button);
  await page.fill("#si-email", SESSION.email);
  await page.click("#si-send");
  await expect(page.locator("#si-out .wait b")).toHaveText(Copy.signin.sent);
  await expect(page.locator("#si-code")).toBeFocused();
  await shot(page, "signin-code", info);
  expect(calls[0]).toEqual(["otp", { email: SESSION.email, create_user: false }]);
  await page.fill("#si-code", "000000");
  await page.click("#si-verify");
  await expect(page.locator("#si-codeout .si-no")).toBeVisible();
  await page.fill("#si-code", "919061");
  await page.click("#si-verify");
  await expect.poll(() => hashOf(page)).toBe("#/map/tree");
  await page.locator("#map-body > *").first().waitFor();
});
