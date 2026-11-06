// Find jobs: the fixes of 2026-11-06 (the usability pass, cluster "Find jobs: the Fit sort and the card facts"). Every
// context stubs the Supabase REST POSTs (fixtures.mjs); nothing here submits a form. The Fit order itself is a unit
// test (tests/web/jobs.test.mjs); this spec checks what the page draws.
//   - every card's facts line names a field, the MBA set's Product Manager postings too (B-32: they had none)
//   - the Filters link is for a phone: a desktop does not show it
import { test, expect, gotoHash, waitForScreen, GENERAL_EMAIL } from "./fixtures.mjs";

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

test("desktop: the Filters link is not shown; the filters sit beside the postings", async ({ visitor }, info) => {
  test.skip(info.project.name !== "desktop", "the desktop project");
  const page = await general(visitor);
  await gotoHash(page, "#/jobs");
  await page.locator(".jcard").first().waitFor();
  await expect(page.locator(".jfilters-link")).toBeHidden();
  await expect(page.locator("#jfilters")).toBeVisible();
});
