// The résumé return path: the fixes of 2026-11-06 (the usability pass, cluster "the résumé return path"). Both
// projects. Every context stubs the Supabase REST POSTs (fixtures.mjs) and here /api/infer too, so no résumé text
// leaves the machine: a 503 (the reader did not answer) unless a test asks for a 200.
//   - "Add your résumé" on Find jobs and on Networking's prep card opens the résumé step alone and comes back to the
//     same address after the read; a bad `next` falls back to the old ending
//   - the role rail counts the wizard's questions; the #/you wizard's label counts its bars
//   - the résumé line names the AI reader only when /api/infer answered
//   - Start over asks first, and Keep changes nothing
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, gotoHash, waitForScreen, GENERAL_EMAIL, CAMPUS_EMAIL } from "./fixtures.mjs";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "evals", "resumes", "grad_student_new.txt");
// the body web/api/infer.js sends on a 200: { inferred: [{ id, line, why }], model, ms }
const ANSWER = JSON.stringify({ inferred: [], model: "stub", ms: 1 });

async function visit(visitor, { email = GENERAL_EMAIL, storage = {}, hash = "#/home", infer = 503 } = {}) {
  const page = await visitor.open({ storage: { "door.email": email, "door.where": "", "door.seen": "1", ...storage } });
  page.inferCalls = 0;
  await page.route(/\/api\/infer$/, route => { page.inferCalls++; return infer === 200 ? route.fulfill({ status: 200, contentType: "application/json", body: ANSWER }) : route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"stub"}' }); });
  await page.goto("/#/home");
  await waitForScreen(page, "home");
  if (hash !== "#/home") await gotoHash(page, hash);
  return page;
}
const hashOf = page => page.evaluate(() => location.hash);
// give the file to the résumé step's drop zone and press its main button
async function giveResume(page) {
  await page.locator("#main #drop #file").setInputFiles(FILE);
  await expect(page.locator("#main #file-status")).toContainText(/words/);
  await page.locator("#main #next").click();
}

test("Find jobs: \"Add your résumé\" opens the résumé step and comes back to the same search with fit lines", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/jobs?q=analyst&entry=mba" });
  const card = page.locator("#main .jcard [data-open]").first();
  await card.waitFor();
  await card.click();
  const link = page.locator("#aside a[data-resume-link]");
  await expect(link).toBeVisible();
  await link.click();
  await expect.poll(() => hashOf(page)).toMatch(/^#\/you\?step=3&next=/);
  await expect(page.locator("#main #drop")).toBeVisible();   // the résumé step alone, not question 1
  await giveResume(page);
  await expect.poll(() => hashOf(page)).toMatch(/^#\/jobs\?q=analyst&entry=mba/);
  await expect(page.locator("#jsearch input[name=q]")).toHaveValue("analyst");
  await expect(page.locator("#main .jcard .jfit").first()).toBeVisible();
});

test("Find jobs: the rail note's link carries the search too", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/jobs?q=analyst&entry=mba" });
  const link = page.locator("#main a[data-resume-link]").first();
  await link.waitFor({ state: "attached" });
  await link.dispatchEvent("click");   // on a phone the note sits under the postings; the click itself is what counts
  await expect.poll(() => hashOf(page)).toMatch(/^#\/you\?step=3&next=/);
  expect(decodeURIComponent((await hashOf(page)).split("next=")[1])).toMatch(/^#\/jobs\?q=analyst&entry=mba/);
});

test("Networking: \"Add your résumé\" on the prep card comes back to the same role and type with the card drawn", async ({ visitor }) => {
  const start = "#/network?role=product.pm&type=recruiter";
  const page = await visit(visitor, { email: CAMPUS_EMAIL, hash: start });
  const link = page.locator("#nw-prep a[data-resume-link]");
  await link.waitFor();
  const before = await hashOf(page);
  await link.click();
  await expect.poll(() => hashOf(page)).toMatch(/^#\/you\?step=3&next=/);
  await giveResume(page);
  await expect.poll(() => hashOf(page)).toBe(before);
  expect(before.startsWith(start)).toBe(true);
  await expect(page.locator("#nw-prep")).toBeVisible();
  await expect(page.locator("#nw-prep a[data-resume-link]")).toHaveCount(0);   // the résumé is on file now
});

for (const [name, next] of [["another origin", "https://evil.example/#/jobs"], ["the sign-in", "#/signin"]]) {
  test(`a bad next (${name}) falls back to the old ending`, async ({ visitor }) => {
    const page = await visit(visitor, { hash: `#/you?step=3&next=${encodeURIComponent(next)}` });
    await page.locator("#main #drop").waitFor();
    await giveResume(page);
    await expect.poll(() => hashOf(page)).toBe("#/you");
    expect(page.url().startsWith("http://localhost")).toBe(true);
  });
}

test("About you from the top bar keeps the old ending: the whole wizard ends on Explore", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/you" });
  for (let k = 0; k < 2; k++) { await page.locator("#main .opt").first().click(); }
  await page.locator("#main .opt").first().click();
  await page.locator("#main #next").click();
  await page.locator("#main #drop").waitFor();
  await giveResume(page);
  await expect.poll(() => hashOf(page)).toBe("#/explore");
});

test("the role rail counts the wizard's questions", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/you?step=0" });
  const bars = await page.locator("#main .steps i").count();
  await gotoHash(page, "#/role/pm");
  const link = page.locator("a[data-answer-link]", { hasText: /^Or answer/ });
  await link.waitFor({ state: "attached" });
  expect((await link.textContent()).trim()).toBe(`Or answer ${bars - 1} questions`);
});

test("the #/you wizard's label counts the same steps as its bar, on every step", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/you?step=0" });
  for (let i = 0; i < 4; i++) {
    await gotoHash(page, `#/you?step=${i}`);
    await page.locator("#main .steps").waitFor();
    const bars = await page.locator("#main .steps i").count(), done = await page.locator("#main .steps i.done").count();
    const label = await page.locator("#main .eyebrow").first().textContent();
    const m = label.match(/Step (\d+) of (\d+)/);
    expect(m, label).not.toBeNull();
    expect([+m[1], +m[2]]).toEqual([done, bars]);
  }
});

for (const status of [503, 200]) {
  test(`the résumé line names the AI reader only when it answered (${status})`, async ({ visitor }) => {
    const page = await visit(visitor, { hash: "#/skills", infer: status });
    await page.locator("#main #drop #file").setInputFiles(FILE);
    await expect(page.locator("#main #file-status")).toContainText(/words/);
    await page.locator("#lf-read").click();
    const line = page.locator("#lf-side p.small.muted").first();
    await expect(line).toContainText("read in your browser");
    expect(page.inferCalls).toBe(1);
    if (status === 200) await expect(line).toContainText("AI reader"); else await expect(line).not.toContainText("AI reader");
    await gotoHash(page, "#/you");
    const row = page.locator("#main .list .r", { hasText: "grad_student_new.txt" });
    await expect(row).toContainText("read in your browser");
    if (status === 200) await expect(row).toContainText("AI reader"); else await expect(row).not.toContainText("AI reader");
  });
}

test("Start over asks first; Keep changes nothing; Start over then forgets", async ({ visitor }) => {
  const resume = JSON.stringify({ text: "x ".repeat(60), name: "kept.txt", words: 60, inferred: [] });
  const you = JSON.stringify({ where: "business", stage: "looking", fields: [] });
  const page = await visit(visitor, { storage: { resume, you }, hash: "#/you" });
  const so = page.locator("#start-over");
  await so.click();
  await expect(page.locator("#so-ask")).toBeVisible();
  await expect(page.locator("#so-ask")).toContainText("Start over? This forgets your answers and your résumé on this device.");
  await page.locator("#so-keep").click();
  await expect(page.locator("#so-ask")).toBeHidden();
  expect(await page.evaluate(() => [localStorage.getItem("resume") !== null && localStorage.getItem("resume") !== "null", localStorage.getItem("you")])).toEqual([true, you]);
  await expect(page.locator("#main h1")).toHaveText("About you");
  await so.click();
  await page.locator("#so-yes").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("resume") || "null"))).toBeNull();
});
