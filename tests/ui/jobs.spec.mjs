// Find jobs: the fixes of 2026-11-06 (the usability pass, cluster "Find jobs: the Fit sort and the card facts"). Every
// context stubs the Supabase REST POSTs (fixtures.mjs); nothing here submits a form. The Fit order itself is a unit
// test (tests/web/jobs.test.mjs); this spec checks what the page draws.
//   - every card's facts line names a field, the MBA set's Product Manager postings too (B-32: they had none)
//   - the Product field filter lists them as well
//   - the Filters link is for a phone: a desktop does not show it
//   - the sort a person starts on: Newest without a résumé, Fit with one, Newest second in the menu (2026-11-08)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, gotoHash, waitForScreen, GENERAL_EMAIL } from "./fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEXT = fs.readFileSync(path.join(ROOT, "evals", "resumes", "grad_student_new.txt"), "utf8");
const RESUME = JSON.stringify({ text: TEXT, name: "grad_student_new.txt", words: TEXT.split(/\s+/).length, inferred: [], aiRead: false });

async function general(visitor) {
  const page = await visitor.open({ storage: { "door.email": GENERAL_EMAIL, "door.where": "", "door.seen": "1" } });
  await page.goto("/#/home");
  await waitForScreen(page, "home");
  return page;
}
const factsLines = page => page.$$eval("#jlist .jcard .facts", ps => ps.map(p => p.textContent.trim()));

test("every card's facts line has three parts: field, role and location", async ({ visitor }) => {
  const page = await general(visitor);
  await gotoHash(page, "#/jobs?sort=company");
  await page.locator(".jcard").first().waitFor();
  const lines = await factsLines(page);
  expect(lines.length).toBeGreaterThan(0);
  for (const l of lines) expect(l.split(" · ").length, l).toBeGreaterThanOrEqual(3);
});

test("the MBA set's Product Manager postings name the Product field", async ({ visitor }) => {
  const page = await general(visitor);
  // product_manager is the MBA set's role (the product set's is product.pm); the index gives it no field
  await gotoHash(page, "#/jobs?role=product_manager");
  await page.locator(".jcard").first().waitFor();
  const lines = await factsLines(page);
  expect(lines.length).toBeGreaterThan(0);
  for (const l of lines) expect(l, "the field comes first").toMatch(/^Product · Product Manager · /);
});

// the Product filter keeps the MBA set's Product Manager postings (2026-11-08: the filter gave them no field, so it
// dropped them while their cards said Product). One such posting, found in the file, is listed under the filter.
test("the Product field filter lists the MBA set's Product Manager postings", async ({ visitor }) => {
  const page = await general(visitor);
  await gotoHash(page, "#/jobs");
  await page.locator(".jcard").first().waitFor();
  const r = await page.evaluate(async () => {
    const rows = window.Jobs.rowsOf(await (await fetch("data/jobs_open.json")).json());
    const r = window.Jobs.dedupe(rows).rows.find(x => x.role === "product_manager");
    return { id: r.id, company: r.company };
  });
  await gotoHash(page, `#/jobs?field=product&company=${encodeURIComponent(r.company)}`);
  await page.locator(".jcard").first().waitFor();
  let card = page.locator(`.jcard[data-id="${r.id}"]`);
  // a company with more than a page of product postings: step through the pages until the posting shows
  for (let i = 0; i < 40 && !(await card.count()); i++) {
    const next = page.locator('#jpager [data-page="1"]:not([disabled])');
    if (!(await next.count())) break;
    await next.click();
  }
  await expect(card).toHaveCount(1);
  await expect(card.locator(".facts")).toHaveText(/^Product · Product Manager · /);
});

const sortMenu = page => page.$eval("#jsort", el => ({ value: el.value, options: [...el.options].map(o => o.value) }));

test("without a résumé the list opens on Newest, the first choice of the sort", async ({ visitor }) => {
  const page = await general(visitor);
  await gotoHash(page, "#/jobs");
  await page.locator(".jcard").first().waitFor();
  expect(await sortMenu(page)).toEqual({ value: "newest", options: ["newest", "best", "company"] });
  expect(await page.evaluate(() => location.hash), "the default sort stays out of the link").toBe("#/jobs");
  // the cards run newest first: no dated card sits under an older one
  const days = await page.evaluate(async () => {
    const rows = window.Jobs.rowsOf(await (await fetch("data/jobs_open.json")).json()), by = new Map(rows.map(r => [r.id, r]));
    return [...document.querySelectorAll("#jlist .jcard")].map(c => (window.Jobs.dateOf(by.get(c.dataset.id)) || {}).date || "");
  });
  expect(days.length).toBeGreaterThan(1);
  expect(days.filter(Boolean)).toEqual([...days.filter(Boolean)].sort().reverse());
});

test("with a résumé the list opens on Fit and Newest is the second choice", async ({ visitor }) => {
  const page = await visitor.open({ storage: { "door.email": GENERAL_EMAIL, "door.where": "", "door.seen": "1", resume: RESUME } });
  await page.goto("/#/home");
  await waitForScreen(page, "home");
  await gotoHash(page, "#/jobs");
  await page.locator(".jcard").first().waitFor();
  expect(await sortMenu(page)).toEqual({ value: "fit", options: ["fit", "newest", "best", "company"] });
  await page.locator("#jsort").selectOption("newest");
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#/jobs?sort=newest");
});

test("desktop: the Filters link is not shown; the filters sit beside the postings", async ({ visitor }, info) => {
  test.skip(info.project.name !== "desktop", "the desktop project");
  const page = await general(visitor);
  await gotoHash(page, "#/jobs");
  await page.locator(".jcard").first().waitFor();
  await expect(page.locator(".jfilters-link")).toBeHidden();
  await expect(page.locator("#jfilters")).toBeVisible();
});
