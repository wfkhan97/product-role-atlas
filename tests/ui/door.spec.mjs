// The door's fixes of 2026-11-06 (the usability pass, cluster "the door"), on both viewports:
//   - the door's own chrome (the top bar's verbs, the brand, the footer's About) passes the door as "Skip for now" does
//     and lands where it points; a cold deep link still meets the door once
//   - the Tally door has the site's own "Skip for now" under the form, with Tally loaded and with Tally blocked
//   - right after the Tally return with a Cornell address, the top bar shows Find classes without a reload
//   - About you on home: the label counts the same steps as the bar
import { test, expect, gotoHash, waitForScreen } from "./fixtures.mjs";

const seen = page => page.evaluate(() => localStorage.getItem("door.seen"));
const hashOf = page => page.evaluate(() => location.hash);
// the screen drawn once the door is gone: the door's section away and a heading in its place
async function landed(page, hash) {
  await expect.poll(() => hashOf(page)).toBe(hash);
  await expect(page.locator("#main section.door")).toHaveCount(0);
  await expect(page.locator("#main h1").first()).toBeVisible();
  expect(await seen(page)).toBe("1");
}

const CHROME = [
  ["the top bar's Find jobs", "#verbs a[href='#/jobs']", "#/jobs"],
  ["the top bar's Explore careers", "#verbs a[href='#/skills']", "#/skills"],
  ["the top bar's Networking", "#verbs a[href='#/network']", "#/network"],
  ["the brand", "header a.brand", "#/home"],
  ["the footer's About", "footer.foot a[href='#/about']", "#/about"],
];
for (const [what, sel, hash] of CHROME) {
  test(`door: ${what} passes the door and lands on ${hash}`, async ({ visitor }) => {
    const page = await visitor.fresh();
    expect(await seen(page)).toBeNull();
    await page.locator(sel).click();
    await landed(page, hash);
  });
}

test("door: a cold deep link still meets the door once, and its top bar link to the same screen passes it", async ({ visitor }) => {
  const page = await visitor.open();
  await page.goto("/#/jobs");
  await waitForScreen(page, "door");
  await page.locator("#verbs a[href='#/jobs']").click();
  await landed(page, "#/jobs");
});

for (const blocked of [false, true]) {
  test(`door: the site's own Skip under the Tally slot passes the door (Tally ${blocked ? "blocked" : "as it loads"})`, async ({ visitor }) => {
    const page = await visitor.open();
    if (blocked) await page.context().route(/tally\.so/, r => r.abort());
    await page.goto("/#/");
    await waitForScreen(page, "door");
    const skips = page.locator("#main section.door a.door-skip:visible");
    await expect(skips).toHaveCount(1);
    // the site's own Skip is there while the Tally form loads (or fails to): a visitor never waits on Tally to get in
    await expect(page.locator("#door-tally-skip")).toBeVisible();
    if (blocked) {
      // the native fallback draws once the slot is in view for three seconds: it brings its own Skip, and the site's goes
      await page.locator("#door-slot").scrollIntoViewIfNeeded();
      await expect(page.locator("#door-form")).toBeVisible({ timeout: 10_000 });
      await expect(skips).toHaveCount(1);
    }
    await skips.first().click();
    await waitForScreen(page, "home");
    await landed(page, "#/home");
  });
}

test("door: the native line under the email names the campus whose address opens Find classes", async ({ visitor }) => {
  const page = await visitor.open();
  await page.context().route(/tally\.so/, r => r.abort());
  await page.goto("/#/");
  await waitForScreen(page, "door");
  await page.locator("#door-slot").scrollIntoViewIfNeeded();
  await expect(page.locator("#door-form")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#door-form")).toContainText("A Cornell email also opens Find classes.");
  await expect(page.locator("#door-form")).not.toContainText("A school address opens them");
});

test("home: right after the Tally return with a Cornell address, the top bar shows Find classes", async ({ visitor }) => {
  const page = await visitor.campus();   // #/home?email=…@cornell.edu&where= in a fresh browser, no reload
  await expect(page.locator("#verbs a[href='#/classes']")).toBeVisible();
  expect(await hashOf(page)).toBe("#/home");
});

test("home: About you's label counts the same steps as its bar, at every step", async ({ visitor }) => {
  const page = await visitor.general();
  const body = page.locator("#home-you-body");
  const check = async i => {
    await expect(body.locator(".eyebrow")).toContainText(`Step ${i} of 4`);
    await expect(body.locator(".steps i")).toHaveCount(4);
    await expect(body.locator(".steps i.done")).toHaveCount(i);
  };
  await check(1);
  await body.locator("[data-opt]").first().click();   // the program
  await check(2);
  await body.locator("[data-opt]").first().click();   // the stage
  await check(3);
  await body.locator("[data-yi='next']").click();      // no field: on to the résumé
  await check(4);
});
