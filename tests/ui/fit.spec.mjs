// The fit screen, the course screen, the games and Explore: the fixes of 2026-11-06 (the usability pass, cluster
// "the fit screen, the course screen, the games and Explore"). Both projects. Every context stubs the Supabase REST
// POSTs (fixtures.mjs) and here /api/infer too (503: the reader did not answer), so no résumé text leaves the machine.
// No Tally form is submitted; the intake boxes are only read.
//   - the course screen shows the level and a control to change it, and never counts "0 of the 0"
//   - the fit screen draws class links only for a visitor whose address opens a roster
//   - the rail names what its "N of M" counts and how many skills in all still need evidence, as the fit screen does
//   - a link leads to the course screen from the fit screen and from the rail
//   - a new visitor finds the game on a role page; the launcher links to the field map; the two screens differ in name
//   - the intake boxes say each line once and never "coming soon"
//   - the counts agree across Find jobs, home, the launcher, Explore, the role page and the skill card
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, gotoHash, waitForScreen, GENERAL_EMAIL, CAMPUS_EMAIL } from "./fixtures.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEXT = fs.readFileSync(path.join(ROOT, "evals", "resumes", "grad_student_new.txt"), "utf8");
const RESUME = JSON.stringify({ text: TEXT, name: "grad_student_new.txt", words: TEXT.split(/\s+/).length, inferred: [], aiRead: false });
const SYLLABUS = "PM 610 Product Management. Topics: product strategy, roadmapping, prioritization and trade-offs, market and competitive analysis, A/B testing and experimentation, SQL for product analytics, user research and customer interviews, writing product requirements.";
const ROLE = "product.pm";

async function visit(visitor, { email = GENERAL_EMAIL, resume = false, hash = "#/home" } = {}) {
  const page = await visitor.open({ storage: { "door.email": email, "door.where": "", "door.seen": "1", ...(resume ? { resume: RESUME } : {}) } });
  await page.route(/\/api\/infer$/, route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"stub"}' }));
  await page.goto("/#/home");
  await waitForScreen(page, "home");
  if (hash !== "#/home") await gotoHash(page, hash);
  return page;
}
const num = s => Number(String(s).replace(/[^0-9]/g, ""));
const text = loc => loc.evaluate(el => el.textContent.replace(/\s+/g, " ").trim());

// ---------- the course screen (B-06, "0 of the 0" at Entry) ----------
test("the course screen at Entry shows the level with a control, and never counts \"0 of the 0\"", async ({ visitor }) => {
  const page = await visit(visitor, { hash: `#/role/${ROLE}` });
  await page.locator('#main [data-level="entry"]').click();
  await expect(page.locator('#main [data-level="entry"]')).toHaveAttribute("aria-pressed", "true");
  await gotoHash(page, `#/role/${ROLE}/course`);
  await page.locator("#main #paste").fill(SYLLABUS);
  await page.locator("#main #go").click();
  await expect(page.locator("#main h2").first()).toBeVisible();
  const control = page.locator("#main [data-course-level]");
  expect(await control.count()).toBeGreaterThan(1);
  await expect(page.locator('#main [data-course-level="entry"]')).toHaveAttribute("aria-pressed", "true");
  const body = await text(page.locator("#main"));
  expect(body).not.toMatch(/\b0 of the 0\b/);
  expect(body).toMatch(/\d+ of the [1-9]\d* skills/);
  // the control changes the level the count reads
  await page.locator('#main [data-course-level="all"]').click();
  await expect(page.locator('#main [data-course-level="all"]')).toHaveAttribute("aria-pressed", "true");
});

// ---------- the fit screen's class links (the campus gate, as the rail has it) ----------
for (const [who, email, want] of [["a gmail visitor", GENERAL_EMAIL, false], ["a Cornell visitor", CAMPUS_EMAIL, true]]) {
  test(`the fit screen draws class links only for a visitor whose address opens a roster: ${who}`, async ({ visitor }) => {
    const page = await visit(visitor, { email, resume: true, hash: `#/role/${ROLE}/fit` });
    await page.locator("#main .fitcols").waitFor();
    const links = page.locator('#main a[href^="#/classes"]');
    if (want) await expect.poll(() => links.count(), { timeout: 20_000 }).toBeGreaterThan(0);
    else { await page.waitForLoadState("networkidle"); await page.waitForTimeout(1500); expect(await links.count()).toBe(0); }
  });
}

// ---------- the rail's count and the fit screen's columns (B-04, B-19), the course links (B-05) ----------
test("the rail names what its N of M counts and the full count, with links to the fit and course screens; the fit screen agrees", async ({ visitor }) => {
  const page = await visit(visitor, { resume: true, hash: `#/role/${ROLE}` });
  const lead = page.locator("#aside .lead-rail").first();
  await lead.waitFor({ state: "attached" });
  const [, , m] = (await text(lead)).match(/You show (\d+) of the (\d+) skills/).map(Number);
  const note = page.locator("#aside [data-rail-counts]");
  await note.waitFor({ state: "attached" });
  const said = await text(note);
  expect(said).toMatch(new RegExp(`the ${m} skills most asked for at all levels`));
  const still = num(said.match(/(\d+) skills? in all still needs? evidence/)[1]);
  expect(await note.locator(`a[href="#/role/${ROLE}/fit"]`).count()).toBe(1);
  expect(await page.locator(`#aside a[href="#/role/${ROLE}/course"]`).count()).toBeGreaterThan(0);
  await gotoHash(page, `#/role/${ROLE}/fit`);
  await page.locator("#main .fitcols").waitFor();
  const cols = page.locator("#main .fitcols h3 .n");
  expect(num(await cols.nth(1).textContent())).toBe(still);
  expect(await text(page.locator("#main p.lead b", { hasText: / of \d+$/ }).first())).toMatch(new RegExp(` of ${m}$`));
  // the line under the lead says the lead counts only the most-asked skills
  await expect(page.locator("#main [data-fit-note]")).toContainText(String(m));
  expect(await page.locator(`#main a[href="#/role/${ROLE}/course"]`).count()).toBeGreaterThan(0);
});

// ---------- the rail's "Or answer {n} questions" and the event screen's "Add your résumé" come back ----------
test("the rail's \"Or answer\" link opens the questions and comes back to the role after them", async ({ visitor }) => {
  const page = await visit(visitor, { hash: `#/role/${ROLE}` });
  const link = page.locator("#aside a", { hasText: /^Or answer \d+ questions$/ });
  await link.waitFor({ state: "attached" });
  expect(decodeURIComponent((await link.getAttribute("href")).split("next=")[1])).toBe(`#/role/${ROLE}`);   // drawn with its return, no click-time rewrite
  await link.dispatchEvent("click");   // on a phone the rail sits off-screen; the click itself is what counts
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#\/you\?step=0&next=/);
  for (let k = 0; k < 2; k++) await page.locator("#main .opt").first().click();
  await page.locator("#main .opt").first().click();
  await page.locator("#main #next").click();
  await page.locator("#main #drop").waitFor();
  await page.locator("#main #skip").click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#/role/${ROLE}`);
});

test("the event screen's \"Add your résumé\" links come back to the event screen", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/field/marketing/event" });
  const link = page.locator("#main a[data-resume-link]").first();
  await link.waitFor({ state: "attached" });
  await link.dispatchEvent("click");
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#\/you\?step=\d+&next=/);
  expect(decodeURIComponent((await page.evaluate(() => location.hash)).split("next=")[1])).toMatch(/^#\/field\/marketing\/event/);
});

// ---------- the games (B-09) ----------
test("a new visitor's role page has a way into the game", async ({ visitor }) => {
  const page = await visit(visitor, { hash: `#/role/${ROLE}` });
  const link = page.locator('#main a[href^="#/play/know-the-role"]');
  await expect(link.first()).toBeVisible();
  await expect(link.first()).toContainText("Know the role");
});

// ---------- the expand-all control (B-15) ----------
test("the role page's areas can all open at once from one labelled control", async ({ visitor }) => {
  const page = await visit(visitor, { hash: `#/role/${ROLE}` });
  const b = page.locator("#main #expand-all");
  await expect(b).toHaveText("Expand all");
  await b.click();
  await expect(page.locator("#main #expand-all")).toHaveText("Collapse all");
  expect(await page.locator("#main details.areabox:not([open])").count()).toBe(0);
});

// ---------- the two Explore screens (B-10) ----------
test("the launcher links to the field map, and the two screens carry different names", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/skills" });
  await page.locator("#main #lf-body").waitFor();
  const link = page.locator('#main a[href^="#/explore"]');
  await expect(link.first()).toBeVisible();
  const launcher = await text(page.locator("#main h1"));
  await link.first().click();
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#\/explore/);
  await expect(page.locator("#main .page h1")).not.toHaveText(launcher);   // the new screen drawn, not the old one still there
  const explore = await text(page.locator("#main h1"));
  expect(explore).not.toBe(launcher);
  expect(explore).not.toMatch(/explore/i);
  expect(await text(page.locator("#crumbs .here"))).not.toMatch(/explore/i);
});

// ---------- the intake boxes (B-18, C-17) ----------
for (const [where, hash] of [["the fit screen", `#/role/${ROLE}/fit`], ["Networking", `#/network?role=${ROLE}`]]) {
  test(`the intake box on ${where} says each line once and never "coming soon"`, async ({ visitor }) => {
    const page = await visit(visitor, { resume: true, hash });
    const box = page.locator("#main .fit-wait .wait.apply").first();
    await box.waitFor({ state: "attached" });
    await page.waitForTimeout(500);
    const own = await text(box);
    expect(own).not.toMatch(/coming soon/i);
    expect(own).not.toMatch(/GradBuddy is/);
    const copy = await page.evaluate(() => window.Copy.intake);
    const lines = [...Object.values(copy.line), copy.privacy];
    const inForm = await box.locator("iframe").count();
    for (const l of lines) {
      const n = own.split(l).length - 1;
      expect(n, l).toBeLessThanOrEqual(1);
      if (inForm) expect(n, `the form says it: ${l}`).toBe(0);
    }
  });
}

// ---------- one number per thing (B-16) ----------
test("the counts agree: Find jobs' lead and its count, home, the launcher, Explore, the role page and the skill card", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/jobs" });
  // Find jobs: the lead's number is the count shown plus the repeats folded into one
  await expect(page.locator("#main p.lead").first()).toContainText("Search");
  const lead = await text(page.locator("#main p.lead").first());
  const total = num(lead.match(/Search ([\d,]+) open/)[1]);
  await expect(page.locator("#jcount")).toContainText("of");
  const count = await text(page.locator("#jcount"));
  const shown = num(count.match(/of ([\d,]+) postings/)[1]);
  const folded = num((count.match(/([\d,]+) repeats?/) || [0, "0"])[1]);
  expect(shown + folded).toBe(total);
  // the role count: the launcher, Explore, home and the skill card say the same number (home names none until the
  // product set's roles are counted)
  await gotoHash(page, "#/skills");
  await page.locator("#main #lf-body").waitFor();
  const roles = num((await text(page.locator("#main p.lead").first())).match(/from (\d+)/)[1]);
  await gotoHash(page, "#/explore");
  await expect(page.locator("#main p.lead").first()).toContainText(`${roles} roles`);
  await gotoHash(page, "#/home");
  await waitForScreen(page, "home");
  await expect(page.locator('#main a.verb[data-verb="skills"]')).toContainText(`Explore ${roles} roles`);
  await expect(page.locator('#main a.verb[data-verb="skills"]')).not.toContainText("over");
  await page.evaluate(() => sessionStorage.setItem("explore-view", JSON.stringify("map")));
  await gotoHash(page, "#/explore");
  await page.locator("#main #sm-find").waitFor();
  await page.locator("#main #sm-find").fill("Roadmapping");
  await page.locator("#main #sm-find").dispatchEvent("change");
  const card = page.locator("#aside .sm-card .facts");
  await card.waitFor({ state: "attached" });
  const said = await text(card);
  expect(said).not.toMatch(/MBA/);
  expect(said).toContain(`${roles} roles`);
  // the role page: the facts say the open US postings; the list head names what its larger number counts
  await gotoHash(page, `#/role/${ROLE}`);
  await page.locator("#main .listhead").waitFor();
  const facts = page.locator("#main p.facts [data-measure]").first();
  const world = num((await facts.getAttribute("data-measure")).match(/([\d,]+) worldwide/)[1]);
  const head = await text(page.locator("#main .listhead .small.muted"));
  expect(num(head.match(/([\d,]+) /)[1])).toBe(world);
  expect(head).toMatch(/worldwide/);
});

// ---------- one h1 per screen; the "How you work" row inside its box (2026-11-08) ----------
test("the fit screen with a résumé has exactly one h1, the eyebrow that names the role", async ({ visitor }) => {
  const page = await visit(visitor, { resume: true, hash: `#/role/${ROLE}/fit` });
  await page.locator("#main .fitcols").waitFor();
  expect(await page.locator("#main h1").count()).toBe(1);
  await expect(page.locator("#main h1")).toHaveClass(/eyebrow/);
});

test("the role page's \"How you work\" count stays inside its row", async ({ visitor }) => {
  const page = await visit(visitor, { resume: true, hash: `#/role/${ROLE}` });
  const sum = page.locator("#main details.areabox.behaviours > summary");
  await sum.waitFor();
  const [n, s] = await Promise.all([sum.locator(".n").boundingBox(), sum.boundingBox()]);
  expect(n.x + n.width).toBeLessThanOrEqual(s.x + s.width + 0.5);
});
