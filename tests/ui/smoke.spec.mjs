// Every state on both viewports reaches home (or the door, for a fresh visitor), with no console error the site
// does not expect locally, and the WCAG 2.1 A/AA violation count in the test's annotations.
import { test, expect, axe, unexpected, gotoHash, waitForScreen } from "./fixtures.mjs";

// the home cards each state draws: Find classes only for an address whose campus has a roster (app.js Door.verbs)
const CARDS = { campus: ["jobs", "skills", "classes", "network"], general: ["jobs", "skills", "network"], signedIn: null };

for (const state of ["fresh", "campus", "general", "signedIn"]) {
  test(`${state}: #/home draws`, async ({ visitor }) => {
    const page = await visitor[state]();
    await gotoHash(page, "#/home");
    if (state === "fresh") {
      // a deep link bounces to the door once (Door.bounce): the door draws over #/home
      await waitForScreen(page, "door");
      await expect(page.locator("#main section.door h1")).toBeVisible();
    } else {
      await waitForScreen(page, "home");
      const keys = await page.locator("#main .verbs a.verb").evaluateAll(as => as.map(a => a.dataset.verb));
      if (CARDS[state]) expect(keys).toEqual(CARDS[state]);
      else expect(keys.length).toBeGreaterThanOrEqual(3);
    }
    const v = await axe(page, `${state} #/home`);
    test.info().annotations.push({ type: "axe-count", description: String(v.length) });
    expect(unexpected(page.consoleErrors), JSON.stringify(page.consoleErrors, null, 1)).toEqual([]);
  });
}

test("the local functions answer their health lines", async ({ request }) => {
  for (const p of ["/api/tree", "/api/infer"]) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(200);
    expect(r.headers()["content-type"], p).toContain("application/json");
    expect((await r.json()).ok, p).toBe(true);
  }
});
