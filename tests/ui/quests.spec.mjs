// "Start a side project" (#/map/start, 2026-11-11), signed in without a real session as map.spec.mjs is: a made-up
// session in localStorage and the Supabase project stubbed here. The flag is turned on in the page only (an init
// script sets QUESTS_ENABLED as config.js assigns CONFIG, on or off, whatever web/config.js holds). /api/tree and /api/quests are
// stubbed with fixtures: no model is called. MAP_SHOTS=1 saves the screens under
// data/experiments/scratch/map-redesign/shots-flow/ (gitignored).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test, expect, unexpected } from "./fixtures.mjs";

const require = createRequire(import.meta.url);
const Copy = require("../../web/copy.js"), MC = Copy.map, S = MC.flow;
const Quests = require("../../web/quests.js");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, "pipeline", "apprentice", "examples", "pmm-nyc", "map.json"), "utf8"));
const KIT = JSON.parse(fs.readFileSync(path.join(ROOT, "web", "data", "build_kit.json"), "utf8"));
const SHOTS = path.join(ROOT, "data", "experiments", "scratch", "map-redesign", "shots-flow");
const UID = "00000000-0000-4000-8000-00000000c0de";
const SESSION = { access_token: "ui-harness-token", refresh_token: "", expires_at: 4102444800, uid: UID, email: "ui-harness@cornell.edu" };
const TEXT = fs.readFileSync(path.join(ROOT, "pipeline", "apprentice", "examples", "pmm-nyc", "profile.md"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
const RESUME = JSON.stringify({ name: "resume.pdf", text: TEXT, words: TEXT.split(/\s+/).length, inferred: [], aiRead: false });
const hashOf = page => page.evaluate(() => location.hash);
// the map /api/tree would write: the example's tree and read, its story cards alone, marked self-serve
const STORIES = EXAMPLE.cards.filter(c => c.kind === "story");
const SELF = { ...EXAMPLE, student: { slug: null, name_on_page: null, campus: "Cornell Tech", program: null, self_serve: true }, company: null, gap_sentence: null, cards: STORIES, worlds: [{ n: 1, label: "Fundamentals", missions: STORIES.map(c => c.id) }] };
// three projects as the function returns them (already validated)
const project = (i, title, kind, host, skills) => ({
  id: `p${i}`, title, ship: "A public page that shows the positioning of three freight apps.",
  atlas_skills: skills, steps: ["Pick three apps your old customers used.", "Copy each home page headline and pitch.", "Ask the assistant to compare them in a table.", "Publish the page and share the link."],
  prompt: "Help me write a positioning teardown of three freight software products. Compare their headlines and the proof each offers.",
  build_with: { kind, examples: KIT.kinds.find(k => k.id === kind).examples.slice(0, 2).map(e => e.name) }, live_on: { host }, needs_database: false,
  why_role: { text: "Product marketers own positioning.", posting_quote: null }, why_person: { text: "You sold logistics software.", resume_quote: null },
});
const PROJECTS = [
  project(1, "A positioning teardown of three freight apps", "chat_pages", "github_pages", ["positioning_messaging", "gtm"]),
  project(2, "A launch brief for a partner program", "chat_pages", "claude_artifact", ["gtm", "cross_functional"]),
  project(3, "A buyer persona page for freight forwarders", "app_builders", "vercel", ["enterprise_saas"]),
];
const FLAG_OFF = () => { let v; Object.defineProperty(window, "CONFIG", { configurable: true, get: () => v, set: x => { v = x; if (x) x.QUESTS_ENABLED = false; } }); };
const FLAG_ON = () => { let v; Object.defineProperty(window, "CONFIG", { configurable: true, get: () => v, set: x => { v = x; if (x) x.QUESTS_ENABLED = true; } }); };

async function signedIn(visitor, hash, { map = null, flag = true, ready = "#main h1", extra = {} } = {}) {
  const page = await visitor.open({ storage: { "maps.session": JSON.stringify(SESSION), "door.email": SESSION.email, "door.where": "", "door.seen": "1", ...extra } });
  page.map = map; page.files = {}; page.calls = [];
  const ctx = page.context();
  await ctx.addInitScript(flag ? FLAG_ON : FLAG_OFF);
  await ctx.route(/\.supabase\.co\//, route => {
    const req = route.request(), url = new URL(req.url());
    const m = /\/storage\/v1\/object\/(?:authenticated\/)?maps\/(.+)$/.exec(url.pathname);
    if (m && req.method() === "GET") {
      const body = m[1] === `${UID}/map.json` ? (page.map ? JSON.stringify(page.map) : null) : page.files[m[1]];
      return body ? route.fulfill({ status: 200, contentType: "application/json", body }) : route.fulfill({ status: 404, contentType: "application/json", body: '{"message":"Object not found"}' });
    }
    if (m && req.method() === "POST") { page.files[m[1]] = req.postData(); return route.fulfill({ status: 200, contentType: "application/json", body: '{"Key":"x"}' }); }
    if (/\/rest\/v1\//.test(url.pathname)) return route.fulfill({ status: req.method() === "POST" ? 201 : 200, contentType: "application/json", body: req.method() === "POST" ? "" : "[]" });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await ctx.route("**/api/infer", r => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/tree", r => { const b = r.request().postDataJSON(); page.calls.push({ url: "tree", body: b }); page.map = SELF; return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, role: { id: "pmm" } }) }); });
  await ctx.route("**/api/quests", r => {
    const b = r.request().postDataJSON(); page.calls.push({ url: "quests", body: b });
    if (b.mode === "write") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, projects: PROJECTS, left: 4, cap: 5, model: "claude-opus-5-5" }) });
    const p = PROJECTS.find(x => x.id === b.id), card = Quests.cardOf(p, page.map, { kit: KIT, date: "2026-11-11" });
    page.map = Quests.addSide(page.map, card);
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, card: card.id }) });
  });
  await page.goto("/" + hash);
  await page.locator(ready).first().waitFor();
  return page;
}
const shot = async (page, name, info) => { if (!process.env.MAP_SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${info.project.name}-${name}.png`), fullPage: true }); };
const clean = async page => {
  const text = await page.locator("#main").innerText();
  expect(text).not.toMatch(/\bmissions?\b/i);
  expect(text).not.toMatch(/\b(minutes?|hours?|evenings?|weeks?|days?|months?)\b/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "the page never scrolls sideways").toBe(true);
};

test("Start a side project: a person with no map walks a to f, picks a project and lands on it as the now card, opened", async ({ visitor }, info) => {
  const page = await signedIn(visitor, "#/map", { extra: { resume: RESUME, hearts: JSON.stringify(["pmm"]) } });
  // Build skills leads into the flow: step a
  await expect.poll(() => hashOf(page)).toBe("#/map/start");
  await expect(page.locator(".sp h1")).toHaveText(S.aim.title);
  await expect(page.locator(".sp-prog")).toHaveAttribute("aria-valuenow", "1");
  await expect(page.locator("#sp-go")).toBeDisabled();
  await shot(page, "a-aim-empty", info);
  await page.locator(".sp-quick [data-add='pmm']").click();
  await page.locator("#sp-q").fill("brand");
  await page.locator("#sp-hits [data-add='brand_manager']").click();
  await expect(page.locator(".sp-picked .sp-role")).toHaveCount(2);
  await page.locator("#sp-q").fill("strategy");   // another field's roles are offered but disabled
  await expect(page.locator("#sp-hits button:disabled").first()).toBeVisible();
  await page.locator("#sp-q").fill("");
  await clean(page);
  await shot(page, "a-aim", info);
  await page.locator("#sp-go").click();
  // b: the résumé on file, the band in words, the extras with the privacy line
  await expect.poll(() => hashOf(page)).toBe("#/map/start/bring");
  await expect(page.locator(".sp h1")).toHaveText(S.bring.title);
  await expect(page.locator(".sp-file")).toContainText(Copy.fill(S.bring.onFile, { name: "resume.pdf" }));
  await expect(page.locator(".sp-band")).toContainText("for Product Marketing Manager");
  await expect(page.locator(".sp-privacy")).toHaveText(S.bring.privacy);
  await page.locator("#sp-xfile").setInputFiles({ name: "essay.txt", mimeType: "text/plain", buffer: Buffer.from("I ran a WhatsApp community of freight forwarders and wrote its weekly brief.") });
  await expect(page.locator(".sp-xlist li")).toContainText("essay.txt");
  await clean(page);
  await shot(page, "b-bring", info);
  await page.locator("#sp-go").click();
  // c: how technical; a choice moves on
  await expect(page.locator(".sp h1")).toHaveText(S.tech.title);
  await expect(page.locator(".sp-opt")).toHaveCount(4);
  await shot(page, "c-tech", info);
  await page.getByRole("radio", { name: S.tech.options.ai_tools }).click();
  // d: the kinds of AI tools, with examples as plain text
  await expect.poll(() => hashOf(page)).toBe("#/map/start/tools");
  await expect(page.locator(".sp-rows li")).toHaveCount(KIT.kinds.length);
  await expect(page.locator(".sp-rows")).toContainText("Claude Code, Cursor, Codex");
  await page.locator("[data-kind='chat_pages'][data-v='use']").click();
  await page.locator("[data-kind='app_builders'][data-v='learn']").click();
  await expect(page.locator("[data-kind='chat_pages'][data-v='use']")).toHaveAttribute("aria-pressed", "true");
  await clean(page);
  await shot(page, "d-tools", info);
  // a reload keeps the place and the answers
  await page.reload();
  await expect(page.locator(".sp h1")).toHaveText(S.tools.title);
  await expect(page.locator("[data-kind='chat_pages'][data-v='use']")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#sp-go").click();
  // e: the accounts
  await expect(page.locator(".sp h1")).toHaveText(S.accounts.title);
  await page.locator("[data-acc='github'][data-v='have']").click();
  await page.locator("[data-acc='supabase'][data-v='no']").click();
  await clean(page);
  await shot(page, "e-accounts", info);
  await page.locator("#sp-go").click();
  // f: the tree first (no map), then three projects
  await expect(page.locator(".sp-choice")).toHaveCount(3);
  expect(page.calls.map(c => c.url)).toEqual(["tree", "quests"]);
  expect(page.calls[0].body.roles).toEqual(["pmm", "brand_manager"]);
  const w = page.calls[1].body;
  expect([w.mode, w.answers.tech, w.answers.tools, w.answers.accounts.github]).toEqual(["write", "ai_tools", { chat_pages: "use", app_builders: "learn" }, "have"]);
  expect(w.extras).toContain("WhatsApp community");
  expect(w.text.length).toBeGreaterThan(200);
  await expect(page.locator(".sp-choice").first().locator(".q-chips .chip")).toHaveCount(2);
  await expect(page.locator(".sp-choice").first()).toContainText("GitHub Pages");
  await expect(page.locator(".sp-again")).toContainText(Copy.fill(S.pick.left, { left: 4 }));
  await clean(page);
  await shot(page, "f-pick", info);
  // the extras never reach localStorage
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("WhatsApp community of freight forwarders and wrote");
  expect(await page.evaluate(() => sessionStorage.getItem("quests.extras"))).toContain("WhatsApp community");
  await page.locator(".sp-choice").nth(1).getByRole("button", { name: S.pick.choose }).click();
  // the now card: the side project, opened, with its steps, prompt, build with and live on
  await expect.poll(() => hashOf(page)).toMatch(/^#\/map\/quests\?q=side-a-launch-brief/);
  const now = page.locator(".q-now");
  await expect(now.locator("h2")).toHaveText(PROJECTS[1].title);
  await expect(now.locator(".eyebrow")).toHaveText(Copy.fill(MC.now, { level: MC.sideHead }));
  await expect(now.locator(".q-checks li")).toHaveCount(4);
  await expect(now.locator("#q-prompt")).toHaveText(PROJECTS[1].prompt);
  await expect(now).toContainText(MC.card.buildWith);
  await expect(now).toContainText("A shared Claude artifact link");
  await expect(now).toContainText(MC.sideTag);
  await expect(page.locator(".q-path .lvl").first()).toContainText(MC.sideHead);
  await clean(page);
  await shot(page, "g-now-card", info);
  expect(await page.evaluate(() => sessionStorage.getItem("quests.extras"))).toBe("[]");   // the extras go with the pick
  expect(unexpected(page.consoleErrors).map(e => e.text)).toEqual([]);
});

test("Start a side project: with a map, the Quests page head offers it and the flow skips the tree when the roles stay", async ({ visitor }, info) => {
  const page = await signedIn(visitor, "#/map/quests", { map: SELF, ready: ".q-now", extra: { resume: RESUME } });
  const start = page.locator(".map-top a.map-start");
  await expect(start).toHaveText(MC.startSide);
  await shot(page, "quests-head", info);
  await start.click();
  await expect(page.locator(".sp h1")).toHaveText(S.aim.title);
  await expect(page.locator(".sp-picked .sp-role")).toHaveCount(SELF.role_class.roles.length);   // the map's roles, prefilled
  for (const step of ["tech", "tools", "accounts"]) { await page.evaluate(s => { location.hash = "#/map/start/" + s; }, step); await expect(page.locator(".sp-prog")).toBeVisible(); }
  await page.evaluate(() => { location.hash = "#/map/start/pick"; });
  await expect(page.locator(".sp-choice")).toHaveCount(3);
  expect(page.calls.map(c => c.url)).toEqual(["quests"]);
});

test("Start a side project: the empty Quests page offers it with the flag on", async ({ visitor }, info) => {
  const page = await signedIn(visitor, "#/map/quests", { map: { ...SELF, cards: [], worlds: [] }, ready: "#q-empty" });
  await expect(page.locator("#q-empty")).toContainText(MC.emptySide);
  await expect(page.locator("#q-empty a.btn")).toHaveAttribute("href", "#/map/start");
  await shot(page, "quests-empty", info);
});

test("Start a side project: the flag off draws no entry point, #/map/start falls back to Quests, and no map keeps today's tree form", async ({ visitor }) => {
  let page = await signedIn(visitor, "#/map/start", { map: SELF, flag: false, ready: ".q-now" });
  await expect.poll(() => hashOf(page)).toBe("#/map/quests");
  await expect(page.locator(".map-start")).toHaveCount(0);
  await expect(page.locator("#main")).not.toContainText(MC.startSide);
  page = await signedIn(visitor, "#/map", { flag: false, ready: "#main .tr-form", extra: { resume: RESUME } });
  await expect(page.locator("#main h1")).toHaveText(MC.tree.firstHeading);
  expect(await hashOf(page)).toBe("#/map");
});
