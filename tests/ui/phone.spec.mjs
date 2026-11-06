// The phone layout: the fixes of 2026-11-06 (the usability pass, cluster "phone layout"), at 390×844 only. Every
// context stubs the Supabase REST POSTs (fixtures.mjs); nothing here submits a form.
//   - no route scrolls sideways (the role page's "How you work" row was 1,246 px wide; the field cards 421 px)
//   - the role page's rail tab and its Filters drawer open inside the screen and close again
//   - the Networking prep card and the first posting on Find jobs start within one screen of the top
//   - Find jobs has a Filters link over the postings that goes to the filters
//   - the launcher's résumé box comes before the field tiles
//   - the top bar takes two rows at most, with every verb on it
//   - the skill map's labels do not overlap, and no screen tells a phone to hover
//   - the posting panel and the skill card fit the screen
//   - the game board wraps whole words and keeps its checkboxes clear of the words
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, gotoHash, waitForScreen, GENERAL_EMAIL } from "./fixtures.mjs";

test.beforeEach(({}, info) => { test.skip(info.project.name !== "phone", "the phone layout: the phone project only"); });

const W = 390, H = 844;   // the phone project's viewport (playwright.config.mjs), --phone-width × --phone-height in web/tokens/spacing.css
// two rows of the top bar: twice --topbar-height (52 px, web/tokens/spacing.css), the one-row bar's height on a desktop
const TWO_ROWS = 2 * 52;
const RESUME_TEXT = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "evals", "resumes", "grad_student_new.txt"), "utf8");
const RESUME = JSON.stringify({ text: RESUME_TEXT, name: "grad_student_new.txt", words: RESUME_TEXT.split(/\s+/).filter(Boolean).length });

// a gmail visitor past the door, with or without a résumé kept (the site keeps it in localStorage "resume")
async function general(visitor, { resume = false } = {}) {
  const storage = { "door.email": GENERAL_EMAIL, "door.where": "", "door.seen": "1", ...(resume ? { resume: RESUME } : {}) };
  const page = await visitor.open({ storage });
  await page.goto("/#/home");
  await waitForScreen(page, "home");
  return page;
}
const box = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y + scrollY, right: b.right, bottom: b.bottom + scrollY, w: b.width, h: b.height }; }, sel);
const scrollWidth = page => page.evaluate(() => document.documentElement.scrollWidth);
const inside = b => b && b.x >= -0.5 && b.right <= W + 0.5;

// ---------- no route scrolls sideways ----------
// each route with the selector it draws once its content is in (the field cards, the postings, the board…)
const ROUTES = [
  ["#/home", "#main .home-page .verbs a.verb"],
  ["#/jobs", "#main .jcard"],
  ["#/skills", "#main .lf-tiles .fcard"],
  ["#/explore", "#main .fcards .fcard"],
  ["#/field/marketing", "#main .field-split .list a.r"],
  ["#/field/product", "#main .field-split .list a.r"],
  ["#/role/product.pm", "#main .areabox"],
  ["#/network?role=product.pm", "#main #nw-prep"],
  ["#/you", "#main h1"],
  ["#/about", "#main h1"],
  ["#/play/know-the-role?role=product.pm", "#main .gm-head"],
];
for (const [hash, ready] of ROUTES) {
  test(`overflow: ${hash} is no wider than the phone`, async ({ visitor }) => {
    const page = await general(visitor);
    await gotoHash(page, hash);
    await page.locator(ready).first().waitFor();
    await page.waitForTimeout(400);   // a late redraw (the product set, the chart) has its turn
    expect(await scrollWidth(page)).toBe(W);
  });
}
test("overflow: #/explore as the skill map is no wider than the phone", async ({ visitor }) => {
  const page = await general(visitor);
  await page.evaluate(() => sessionStorage.setItem("explore-view", JSON.stringify("map")));
  await gotoHash(page, "#/explore");
  await page.locator("#sm-stage .sm-field").first().waitFor();
  expect(await scrollWidth(page)).toBe(W);
});
test("overflow: #/role/product.pm/fit with a résumé is no wider than the phone", async ({ visitor }) => {
  const page = await general(visitor, { resume: true });
  await gotoHash(page, "#/role/product.pm/fit");
  await page.locator("#main .page .eyebrow, #main .page h1").first().waitFor();   // the fit screen heads itself with an eyebrow
  await page.waitForTimeout(800);
  expect(await scrollWidth(page)).toBe(W);
});
// About you's summary (the guide's verifier, 2026-11-06): with every question answered and a résumé, the answers and the
// résumé sat side by side and the résumé's row ran to x=402 (the page 404 px wide)
test("overflow: #/you as the summary, every question answered and a résumé, is no wider than the phone", async ({ visitor }) => {
  const you = JSON.stringify({ where: "business", stage: "looking", fields: ["marketing"] });
  const page = await visitor.open({ storage: { "door.email": GENERAL_EMAIL, "door.where": "", "door.seen": "1", resume: RESUME, you } });
  await page.goto("/#/you");
  await page.locator('#main a[href="#/you?step=3"]').first().waitFor();
  await page.waitForTimeout(400);
  expect(await scrollWidth(page)).toBe(W);
});
// the Faculty tab (cluster 3's verifier, 2026-11-06): each professor row's count line did not wrap, 600 px wide
test("overflow: #/network's Faculty on campus tab as a Cornell visitor is no wider than the phone", async ({ visitor }) => {
  const page = await visitor.campus();
  await gotoHash(page, "#/network?role=product.pm&type=faculty");
  await page.locator("#main .nw-emps a.r").first().waitFor();
  await page.waitForTimeout(400);
  expect(await scrollWidth(page)).toBe(W);
});
test("overflow: #/classes as a Cornell visitor is no wider than the phone", async ({ visitor }) => {
  const page = await visitor.campus();
  await gotoHash(page, "#/classes");
  await page.locator("#main #cls-list").waitFor();
  expect(await scrollWidth(page)).toBe(W);
});

// ---------- the role page: the rail tab and the Filters drawer ----------
test("role page: the rail tab and the Filters drawer open inside the screen, and both close", async ({ visitor }) => {
  const page = await general(visitor);
  await gotoHash(page, "#/role/product.pm");
  await page.locator("#main .areabox").first().waitFor();
  const tab = page.locator(".rail-tab");
  await expect(tab).toBeVisible();
  expect(inside(await box(page, ".rail-tab")), "the rail tab is inside the screen").toBe(true);
  await tab.click();
  await expect(page.locator("#shell")).toHaveClass(/rail-open/);
  await page.waitForTimeout(300);   // the slide (0.2 s)
  expect(inside(await box(page, "#aside")), "the open rail is inside the screen").toBe(true);
  expect(inside(await box(page, ".rail-tab")), "the tab that closes it is inside the screen").toBe(true);
  await tab.click();
  await expect(page.locator("#shell")).not.toHaveClass(/rail-open/);

  await page.locator("#more-filters").click();
  await page.locator("#drawer").waitFor();
  expect(inside(await box(page, "#drawer")), "the drawer is inside the screen").toBe(true);
  await page.locator("#drawer-close").click();   // a tap on its own close button, not Esc
  await expect(page.locator("#drawer")).toHaveCount(0);
});

// ---------- what a person came for, within one screen ----------
// One screen: the phone's height, 844 px. The prep card and the first posting are what the screen is for, so the top
// of each must show without a scroll.
test("networking: the prep card starts within one screen of the top", async ({ visitor }) => {
  const page = await general(visitor);
  await gotoHash(page, "#/network?role=product.pm");
  await page.locator("#nw-prep").waitFor();
  const prep = await box(page, "#nw-prep"), who = await box(page, ".nw-main .nw-sec");
  expect(prep.y, "the prep card's top").toBeLessThan(H);
  expect(prep.y, "the prep card comes before Who to look for").toBeLessThan(who.y);
});
test("jobs: the first posting starts within one screen of the top, before the filters", async ({ visitor }) => {
  const page = await general(visitor);
  await gotoHash(page, "#/jobs");
  await page.locator(".jcard").first().waitFor();
  const card = await box(page, ".jcard"), rail = await box(page, ".jrail");
  expect(card.y, "the first posting's top").toBeLessThan(H);
  expect(card.y, "the postings come before the filters").toBeLessThan(rail.y);
});
// cluster 3's verifier, 2026-11-06: nothing over the postings pointed to the filters, which sit after the 50 cards
test("jobs: a Filters link over the postings scrolls to the filters and moves focus there", async ({ visitor }) => {
  const page = await general(visitor);
  await gotoHash(page, "#/jobs");
  await page.locator(".jcard").first().waitFor();
  const link = page.locator(".jfilters-link"), first = await box(page, ".jcard");
  await expect(link).toBeVisible();
  expect((await box(page, ".jfilters-link")).y, "the link comes before the first posting").toBeLessThan(first.y);
  await link.click();
  await expect.poll(() => page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("jfilters");
  const rail = await page.evaluate(() => document.querySelector("#jfilters").getBoundingClientRect().top);
  expect(rail, "the filters' top is on the screen").toBeGreaterThanOrEqual(-1);
  expect(rail).toBeLessThan(H);
});
test("launcher: the résumé box comes before the field tiles", async ({ visitor }) => {
  const page = await general(visitor);
  await gotoHash(page, "#/skills");
  await page.locator(".lf-tiles .fcard").first().waitFor();
  await page.locator("#lf-side .lf-step").first().waitFor();
  const side = await box(page, "#lf-side"), tile = await box(page, ".lf-tiles .fcard");
  expect(side.y, "the résumé box's top").toBeLessThan(tile.y);
  expect(side.y).toBeLessThan(H);
});

// ---------- the top bar ----------
for (const hash of ["#/classes", "#/network?role=product.pm"]) {
  test(`top bar: two rows at most on ${hash}, with every verb on it`, async ({ visitor }) => {
    const page = await visitor.campus();
    await gotoHash(page, hash);
    await page.locator("#main h1").first().waitFor();
    const top = await box(page, ".top");
    expect(top.h, `the bar's height (two rows: ${TWO_ROWS} px)`).toBeLessThanOrEqual(TWO_ROWS);
    const verbs = page.locator("#verbs a.toplink[href^='#/']:not([href^='#/signin'])");
    await expect(verbs).toHaveCount(4);
    for (const v of await verbs.all()) await expect(v).toBeVisible();
    // a verb past the edge is one swipe away: the strip scrolls, it never clips
    const strip = await page.evaluate(() => { const n = document.querySelector("#verbs"); return { sw: n.scrollWidth, cw: n.clientWidth, ox: getComputedStyle(n).overflowX }; });
    if (strip.sw > strip.cw) expect(strip.ox).toBe("auto");
    expect(await scrollWidth(page)).toBe(W);
  });
}

// ---------- the skill map ----------
// the labels a person reads on the map: the field names (the text of each field's circle) and the SVG names and area
// words; none of the boxes may cross another
async function mapLabels(page) {
  return page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll("#sm-stage .sm-field")) {
      if (getComputedStyle(a).fontSize === "0px") continue;
      const r = document.createRange(); r.selectNodeContents(a); const b = r.getBoundingClientRect();
      if (b.width && b.height) out.push({ t: a.textContent, b: [b.left, b.top, b.right, b.bottom] });
    }
    for (const t of document.querySelectorAll("#sm-stage svg text.sm-name:not(.lens), #sm-stage svg text.sm-area")) {
      if (getComputedStyle(t).display === "none" || t.getAttribute("visibility") === "hidden") continue;
      const b = t.getBoundingClientRect(); if (b.width && b.height) out.push({ t: t.textContent, b: [b.left, b.top, b.right, b.bottom] });
    }
    return out;
  });
}
const crosses = (p, q) => p[0] < q[2] - 1 && q[0] < p[2] - 1 && p[1] < q[3] - 1 && q[1] < p[3] - 1;
test("skill map: no label crosses another, and the lead does not say hover", async ({ visitor }) => {
  const page = await general(visitor);
  await page.evaluate(() => sessionStorage.setItem("explore-view", JSON.stringify("map")));
  await gotoHash(page, "#/explore");
  await page.locator("#sm-stage .sm-field").first().waitFor();
  await page.waitForTimeout(400);
  const labels = await mapLabels(page);
  expect(labels.filter(l => /\S/.test(l.t)).length, "the map still names fields and skills").toBeGreaterThan(5);
  const pairs = [];
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) if (crosses(labels[i].b, labels[j].b)) pairs.push(`${labels[i].t} × ${labels[j].t}`);
  expect(pairs, "labels that cross").toEqual([]);
  await expect(page.locator("#main .lead")).not.toContainText(/hover/i);
  await expect(page.locator("#main .key")).not.toContainText(/hover/i);
  // every field keeps its name for a screen reader, shown or not
  for (const a of await page.locator("#sm-stage .sm-field").all()) expect(((await a.getAttribute("aria-label")) || (await a.textContent()) || "").trim()).not.toBe("");
});
test("field page: the chart hint does not tell a phone to hover", async ({ visitor }) => {
  const page = await general(visitor);
  await gotoHash(page, "#/field/marketing");
  await page.locator("#main .field-split .list a.r").first().waitFor();
  await expect(page.locator("#main .field-split")).not.toContainText(/hover/i);
});

// ---------- the posting panel and the skill card ----------
test("panels: the posting panel and the skill card fit the screen", async ({ visitor }) => {
  const page = await general(visitor);
  await gotoHash(page, "#/jobs");
  await page.locator(".jcard").first().click();
  await expect(page.locator("#aside")).toBeVisible();
  await page.waitForTimeout(300);
  expect(inside(await box(page, "#aside")), "the posting panel").toBe(true);
  expect(await scrollWidth(page), "the page behind keeps the phone's width").toBe(W);
  expect(await page.evaluate(() => { const a = document.querySelector("#aside"); return a.scrollWidth <= a.clientWidth; }), "nothing in the panel runs past its edge").toBe(true);

  await page.evaluate(() => sessionStorage.setItem("explore-view", JSON.stringify("map")));
  await gotoHash(page, "#/explore");
  await page.locator("#sm-find").fill("Stakeholder management");
  await page.locator("#sm-find").dispatchEvent("change");
  await expect(page.locator("#aside .sm-card")).toBeVisible();
  await page.waitForTimeout(300);
  expect(inside(await box(page, "#aside")), "the skill card").toBe(true);
  expect(await page.evaluate(() => { const a = document.querySelector("#aside"); return a.scrollWidth <= a.clientWidth; }), "the shares are not cut").toBe(true);
});

// ---------- the game board ----------
test("game board: options wrap whole words, the checkbox stays clear of them, the title shows whole", async ({ visitor }) => {
  const page = await general(visitor);
  await gotoHash(page, "#/play/know-the-role?role=product.pm");
  await page.getByRole("button", { name: /^Play/ }).click();   // the start screen's one primary button
  await page.locator(".ktr-board .ktr-tile").first().waitFor();
  expect(await scrollWidth(page), "the board is no wider than the phone").toBe(W);
  const tiles = await page.evaluate(() => [...document.querySelectorAll(".ktr-board .ktr-tile")].map(t => {
    const tb = t.getBoundingClientRect(), cb = t.querySelector(".ktr-check").getBoundingClientRect();
    // the words: every line box of the tile's text, read through a Range over its text nodes
    const rects = []; for (const n of t.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const r = document.createRange(); r.selectNodeContents(n); rects.push(...[...r.getClientRects()].map(x => [x.left, x.top, x.right, x.bottom])); }
    return { name: t.textContent.trim(), tile: [tb.left, tb.top, tb.right, tb.bottom], check: [cb.left, cb.top, cb.right, cb.bottom], rects, over: t.scrollWidth > t.clientWidth };
  }));
  expect(tiles.length).toBe(12);
  for (const t of tiles) {
    expect(t.over, `${t.name}: no word runs past the tile`).toBe(false);
    for (const r of t.rects) expect(r[2] <= t.tile[2] - 1, `${t.name}: a line ends inside the tile`).toBe(true);
    expect(t.rects.some(r => crosses(r, t.check)), `${t.name}: the checkbox covers no word`).toBe(false);
    expect(t.check[0] >= t.tile[0] && t.check[2] <= t.tile[2], `${t.name}: the checkbox is inside its tile`).toBe(true);
  }
  // no word is split: each word of the name sits whole on one line (a Range per word has one line box)
  const split = await page.evaluate(() => {
    const out = [];
    for (const t of document.querySelectorAll(".ktr-board .ktr-tile")) for (const n of t.childNodes) {
      if (n.nodeType !== 3) continue;
      const s = n.textContent; let i = 0;
      for (const w of s.split(/(\s+)/)) { if (w.trim()) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); const lines = new Set([...r.getClientRects()].map(x => Math.round(x.top))); if (lines.size > 1 && !w.includes("-")) out.push(w); } i += w.length; }
    }
    return out;
  });
  expect(split, "words broken across lines").toEqual([]);
  expect(await page.evaluate(() => { const b = document.querySelector(".gm-title b"); return b.getBoundingClientRect().right <= document.querySelector(".gm-title").getBoundingClientRect().right + 0.5; }), "the game's name shows whole").toBe(true);
});
