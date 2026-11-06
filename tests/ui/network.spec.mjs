// Networking: the fixes of 2026-11-06 (the usability pass, cluster "Networking"), as a phone and as a desktop. Every
// context stubs the Supabase REST POSTs (fixtures.mjs) and here /api/infer too (503); nothing here submits a form.
//   - the Role box, when nothing matches "data" or "software": the closest roles, the fields, the roles that come later
//   - "Who to look for": the level rows' titles come from the employers listed under them
//   - the recruiter's posting links are entry-level postings for a new grad's chat
//   - the Product Marketing Manager's level rows never say "Product Manager"
//   - a professor's row names the skills in lower case mid-sentence, an acronym or a proper noun aside
import { test, expect, gotoHash, waitForScreen, GENERAL_EMAIL, CAMPUS_EMAIL } from "./fixtures.mjs";

async function visit(visitor, hash, { email = GENERAL_EMAIL } = {}) {
  const page = await visitor.open({ storage: { "door.email": email, "door.where": "", "door.seen": "1" } });
  await page.route(/\/api\/infer$/, route => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"stub"}' }));
  await page.goto("/#/home");
  await waitForScreen(page, "home");
  await gotoHash(page, hash);
  await page.locator("#main #nw-prep").waitFor();
  return page;
}
const SENIOR = /\b(sr\.?|senior|principal|staff|lead|director|head|vp|vice president|chief)\b/i;
const PROPER = /^(Python|Excel|Salesforce|Google|Microsoft|Amazon|Adobe|Oracle|Apple|Medicare|Medicaid|Agile)\b/;

for (const q of ["data", "software"]) {
  test(`the Role box: "${q}" matches no role, and the list shows the closest roles, the fields and the roles that come later`, async ({ visitor }) => {
    const page = await visit(visitor, "#/network?role=product.pm");
    const box = page.locator("#main #nw-role input");
    await box.click();
    await box.fill(q);
    const list = page.locator("#main #nw-role .pick-list");
    await expect(list).toBeVisible();
    await expect(list.locator(".pick-none")).toContainText("No role has that name");
    const roles = await list.locator("li[role=option]").allTextContents();
    expect(roles.length, "the closest roles").toBeGreaterThan(0);
    if (q === "data") expect(roles.join(" | ")).toContain("Business Analytics Manager");
    await expect(list.locator(".pick-note").first()).toContainText("Product");
    await expect(list.locator(".pick-note").last()).toContainText("Engineering, design and legal roles come later");
    // a closest role picks like any option
    const first = await list.locator("li[role=option]").first().evaluate(li => li.firstChild.textContent.trim());
    await list.locator("li[role=option]").first().click();
    await expect(page.locator("#main .eyebrow").first()).toHaveText(`Networking · ${first}`);
  });
}

test("Who to look for: each level row's titles come from the employers listed under it, when those employers post at that level", async ({ visitor }) => {
  const page = await visit(visitor, "#/network?role=product.pm&type=hm");
  const listed = new Set((await page.locator("#main .nw-emps .r .t").allTextContents()).map(s => s.trim()));
  expect(listed.size).toBe(5);
  const rows = await page.locator("#main .nw-lv li").evaluateAll(els => els.map(li => ({ label: li.querySelector("b").textContent, cos: [...li.querySelectorAll(".muted")].map(s => s.textContent.replace(/^\(|\)$/g, "")) })));
  expect(rows.length).toBeGreaterThan(0);
  // the rows of the levels the five employers post at (every level but the rarest) lead with one of them
  const led = rows.filter(r => listed.has(r.cos[0]));
  expect(led.length, JSON.stringify(rows)).toBeGreaterThanOrEqual(rows.length - 1);
});

test("the recruiter's posting links are entry-level postings, not senior ones", async ({ visitor }) => {
  const page = await visit(visitor, "#/network?role=product.pm&type=recruiter");
  const labels = await page.locator("#main .nw-outs a").evaluateAll(as => as.filter(a => !/linkedin\.com|joinhandshake\.com/.test(a.href)).map(a => a.textContent.replace(/\s*↗\s*$/, "")));
  expect(labels.length).toBe(3);
  for (const l of labels) expect(l, "a senior posting in a new grad's chat").not.toMatch(SENIOR);
});

test("the Product Marketing Manager's level rows never say \"Product Manager\"", async ({ visitor }) => {
  for (const type of ["inrole", "hm"]) {
    const page = await visit(visitor, `#/network?role=product.pmm&type=${type}`);
    const labels = await page.locator("#main .nw-lv li b").allTextContents();
    expect(labels.length, type).toBeGreaterThan(0);
    expect(labels, type).not.toContain("Product Manager");
  }
});

test("a professor's row names the skills in lower case mid-sentence", async ({ visitor }) => {
  const page = await visit(visitor, "#/network?role=product.pm&type=faculty", { email: CAMPUS_EMAIL });
  const lines = await page.locator("#main .nw-emps a.r .m").allTextContents();
  const names = lines.filter(l => l.includes(" · teaches ")).flatMap(l => l.split(" · teaches ")[1].split(", "));
  expect(names.length, "rows that name what they teach").toBeGreaterThan(0);
  for (const n of names) expect(/^[A-Z][a-z]/.test(n) && !PROPER.test(n), `"${n}" starts with a capital mid-sentence`).toBe(false);
});
