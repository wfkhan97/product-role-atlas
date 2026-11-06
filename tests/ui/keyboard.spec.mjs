// Keyboard and contrast: the fixes of 2026-11-06 (the usability pass, cluster "keyboard and contrast"). Real key
// presses (page.keyboard.press) and reads of document.activeElement. Every context stubs the Supabase REST POSTs
// (fixtures.mjs); nothing here submits a form, and the feedback sheet is closed without Send.
//   - "choose a file" is a Tab stop on every résumé drop zone, and Enter or Space opens the file dialog
//   - Find jobs: the posting panel takes focus, Esc closes it and focus goes back to the card; a facet keeps focus
//   - the launcher: a field tile hands focus to the field's first role, and the way back to its tile
//   - Networking: the person types are tabs (arrow keys, Home, End, one Tab stop); a choice keeps focus
//   - the feedback sheet keeps Tab inside it and gives focus back to the link that opened it
//   - axe: no link-in-text-block, label-content-name-mismatch or color-contrast on these screens, in both themes
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, gotoHash, waitForScreen, axe, GENERAL_EMAIL, CAMPUS_EMAIL } from "./fixtures.mjs";

const RESUME_TEXT = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "evals", "resumes", "grad_student_new.txt"), "utf8");
const RESUME = JSON.stringify({ text: RESUME_TEXT, name: "grad_student_new.txt", words: RESUME_TEXT.split(/\s+/).filter(Boolean).length });
const desktopOnly = info => test.skip(info.project.name !== "desktop", "keyboard paths: the desktop project");

// a visitor past the door (gmail or campus), with a résumé kept or not, in a theme ("light", "dark") or the device's
async function visit(visitor, { email = GENERAL_EMAIL, resume = false, theme = null, hash = "#/home" } = {}) {
  const storage = { "door.email": email, "door.where": "", "door.seen": "1", ...(resume ? { resume: RESUME } : {}), ...(theme ? { theme } : {}) };
  const page = await visitor.open({ storage });
  await page.goto("/#/home");
  await waitForScreen(page, "home");
  if (hash !== "#/home") await gotoHash(page, hash);
  return page;
}
const active = page => page.evaluate(() => { const a = document.activeElement; return a ? { tag: a.tagName, id: a.id, text: (a.textContent || "").trim().slice(0, 80), key: a.dataset ? { ...a.dataset } : {} } : null; });
const activeIn = (page, sel) => page.evaluate(s => !!document.activeElement && !!document.activeElement.closest(s), sel);
const activeIs = (page, sel) => page.evaluate(s => document.activeElement === document.querySelector(s), sel);
// Tab from the top of the page until `sel` has focus; the number of presses, or null after `max`
async function tabTo(page, sel, max = 120) {
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  for (let i = 1; i <= max; i++) { await page.keyboard.press("Tab"); if (await activeIs(page, sel)) return i; }
  return null;
}

// ---------- "choose a file" on every résumé drop zone ----------
const DROPS = [
  ["the fit screen", "#/role/pm/fit"],
  ["the role rail", "#/role/pm"],
  ["the launcher", "#/skills"],
  ["About you", "#/you?step=3"],
];
for (const [name, hash] of DROPS) {
  test(`drop zone, ${name}: Tab reaches "choose a file" and Enter opens the file dialog`, async ({ visitor }, info) => {
    desktopOnly(info);
    const page = await visit(visitor, { hash });
    await page.locator("#drop").first().waitFor();
    const pick = page.locator("#drop #file-pick");
    await expect(pick, "a real button").toHaveCount(1);
    await expect(pick).toHaveText("choose a file");
    expect(await tabTo(page, "#drop #file-pick"), "Tab reaches it").not.toBeNull();
    // the ring from the tokens: a 2 px outline while it has keyboard focus
    expect(await pick.evaluate(e => getComputedStyle(e).outlineStyle + " " + getComputedStyle(e).outlineWidth)).toBe("solid 2px");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), page.keyboard.press("Enter")]);
    expect(chooser.isMultiple()).toBe(false);
  });
}
test("drop zone: Space on \"choose a file\" opens the file dialog too, and the file it gives is read", async ({ visitor }, info) => {
  desktopOnly(info);
  const page = await visit(visitor, { hash: "#/role/pm/fit" });
  await page.locator("#drop #file-pick").focus();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }), page.keyboard.press("Space")]);
  await chooser.setFiles(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "evals", "resumes", "grad_student_new.txt"));
  await expect(page.locator("#file-status")).toContainText(/words/);
});

// ---------- Find jobs: the posting panel and the facets ----------
test("Find jobs: Enter on a card moves focus to the panel's heading; Esc closes it and focus goes back to the card", async ({ visitor }, info) => {
  desktopOnly(info);
  const page = await visit(visitor, { hash: "#/jobs" });
  const open = page.locator("#main .jcard [data-open]").first();
  await open.waitFor();
  const id = await open.getAttribute("data-open");
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#aside")).toBeVisible();
  expect(await activeIn(page, "#aside"), "focus is inside the panel").toBe(true);
  expect(await active(page)).toMatchObject({ tag: "H2" });
  await page.keyboard.press("Escape");
  await expect(page.locator("#aside")).toBeHidden();
  expect(await active(page)).toMatchObject({ key: { open: id } });
  // × closes it the same way
  await page.keyboard.press("Enter");
  await expect(page.locator("#aside")).toBeVisible();
  await page.locator("#aside .close").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#aside")).toBeHidden();
  expect(await active(page)).toMatchObject({ key: { open: id } });
});
test("Find jobs: Enter on a facet redraws the list and focus stays on that facet", async ({ visitor }, info) => {
  desktopOnly(info);
  const page = await visit(visitor, { hash: "#/jobs?field=" });
  const facet = page.locator('#jrail .frow[data-key="field"]').nth(1);
  await facet.waitFor();
  const val = await facet.getAttribute("data-val");
  await facet.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(`#jrail .frow[data-key="field"][data-val="${val}"]`)).toHaveAttribute("aria-pressed", "true");
  expect(await active(page)).toMatchObject({ tag: "BUTTON", key: { key: "field", val } });
  // and off again
  await page.keyboard.press("Enter");
  await expect(page.locator(`#jrail .frow[data-key="field"][data-val="${val}"]`)).toHaveAttribute("aria-pressed", "false");
  expect(await active(page)).toMatchObject({ key: { key: "field", val } });
});

// ---------- the launcher: the field tiles ----------
test("launcher: Enter on a field tile moves focus to its first role; Back to all fields puts it on the tile", async ({ visitor }, info) => {
  desktopOnly(info);
  const page = await visit(visitor, { hash: "#/skills" });
  const tile = page.locator("#lf-body [data-field]").first();
  await tile.waitFor();
  const field = await tile.getAttribute("data-field");
  await tile.focus();
  await page.keyboard.press("Enter");
  await page.locator("#lf-body .lf-field").waitFor();
  expect(await activeIs(page, "#lf-body .lf-field .list a.r"), "the first role has focus").toBe(true);
  await page.locator("#lf-back").focus();
  await page.keyboard.press("Enter");
  expect(await active(page)).toMatchObject({ key: { field } });
});

// ---------- Networking: the person types and the Company box ----------
test("Networking: the types are tabs: one Tab stop, Enter keeps focus, the arrows, Home and End move and select", async ({ visitor }, info) => {
  desktopOnly(info);
  const page = await visit(visitor, { email: CAMPUS_EMAIL, hash: "#/network?role=product.pm" });
  const tabs = page.locator("#main .nw-tabs [role=tab]");
  await tabs.first().waitFor();
  const n = await tabs.count();
  expect(n).toBeGreaterThan(2);
  const ids = await tabs.evaluateAll(els => els.map(e => e.dataset.type));
  const selected = () => page.locator('#main .nw-tabs [role=tab][aria-selected="true"]').getAttribute("data-type");
  // one Tab stop: the selected tab alone has tabindex 0
  expect(await tabs.evaluateAll(els => els.map(e => e.tabIndex))).toEqual(ids.map((_, i) => i === 0 ? 0 : -1));
  await expect(page.locator("#main [role=tabpanel]")).toHaveCount(1);
  // Enter on the second type: it is chosen and keeps focus
  await tabs.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect.poll(selected).toBe(ids[1]);
  expect(await active(page)).toMatchObject({ key: { type: ids[1] } });
  // Right, Left, End, Home
  await page.keyboard.press("ArrowRight");
  await expect.poll(selected).toBe(ids[2]);
  expect(await active(page)).toMatchObject({ key: { type: ids[2] } });
  await page.keyboard.press("ArrowLeft");
  await expect.poll(selected).toBe(ids[1]);
  expect(await active(page)).toMatchObject({ key: { type: ids[1] } });
  await page.keyboard.press("End");
  await expect.poll(selected).toBe(ids[n - 1]);
  expect(await active(page)).toMatchObject({ key: { type: ids[n - 1] } });
  await page.keyboard.press("ArrowRight");   // wraps to the first
  await expect.poll(selected).toBe(ids[0]);
  await page.keyboard.press("End"); await page.keyboard.press("Home");
  await expect.poll(selected).toBe(ids[0]);
  expect(await active(page)).toMatchObject({ key: { type: ids[0] } });
});
test("Networking: a company chosen in the Company box by keyboard keeps focus in the box", async ({ visitor }, info) => {
  desktopOnly(info);
  const page = await visit(visitor, { hash: "#/network?role=product.pm" });
  const box = page.locator("#main #nw-target input");
  await box.waitFor();
  const before = await box.inputValue();
  await box.focus();
  await page.keyboard.press("Backspace");   // the box selects its text on focus: clear it to list every company
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.locator("#main #nw-target input").inputValue()).not.toBe(before);
  expect(await activeIs(page, "#main #nw-target input"), "focus is back in the Company box").toBe(true);
});

// ---------- the feedback sheet ----------
test("feedback: Tab and Shift+Tab stay inside the sheet; Esc and Not now give focus back to the Feedback link", async ({ visitor }, info) => {
  desktopOnly(info);
  const page = await visit(visitor, { hash: "#/explore" });
  const opener = page.locator(".top [data-feedback]").first();
  await opener.waitFor();
  await opener.focus();
  await page.keyboard.press("Enter");
  await page.locator("#fb-box").waitFor();
  expect(await activeIs(page, "#fb-text")).toBe(true);
  for (let i = 0; i < 8; i++) { await page.keyboard.press("Tab"); expect(await activeIn(page, "#fb-box"), `Tab ${i + 1} stays in the sheet`).toBe(true); }
  for (let i = 0; i < 8; i++) { await page.keyboard.press("Shift+Tab"); expect(await activeIn(page, "#fb-box"), `Shift+Tab ${i + 1} stays in the sheet`).toBe(true); }
  await page.keyboard.press("Escape");
  await expect(page.locator("#fb-box")).toHaveCount(0);
  expect(await opener.evaluate(e => e === document.activeElement), "Esc: focus on the Feedback link").toBe(true);
  await page.keyboard.press("Enter");
  await page.locator("#fb-box").waitFor();
  await page.locator("#fb-later").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#fb-box")).toHaveCount(0);
  expect(await opener.evaluate(e => e === document.activeElement), "Not now: focus on the Feedback link").toBe(true);
});

// ---------- names: the Explore view buttons, the heart, the rail tab ----------
test("Explore: the two view buttons have names in words", async ({ visitor }, info) => {
  desktopOnly(info);
  const page = await visit(visitor, { hash: "#/explore" });
  await expect(page.getByRole("button", { name: "Fields as cards" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Skill map" })).toHaveCount(1);
});
test("role page: the heart's name starts with its visible words, before and after a press", async ({ visitor }, info) => {
  desktopOnly(info);
  const page = await visit(visitor, { hash: "#/role/pm" });
  const heart = page.locator("#main .role-head .heart");
  await heart.waitFor();
  expect(await heart.getAttribute("aria-label")).toMatch(/^Save role\b/);
  await heart.focus();
  await page.keyboard.press("Enter");
  const after = page.locator("#main .role-head .heart");
  await expect(after).toHaveAttribute("aria-pressed", "true");
  expect(await after.getAttribute("aria-label")).toMatch(/^Saved\b/);
  expect(await activeIs(page, "#main .role-head .heart"), "the press keeps focus on the heart").toBe(true);
});
test("role page on a phone: the rail tab's name is its visible words", async ({ visitor }, info) => {
  test.skip(info.project.name !== "phone", "the rail tab shows on a phone");
  const page = await visit(visitor, { hash: "#/role/pm" });
  const tab = page.locator(".rail-tab");
  await tab.waitFor();
  await expect(page.getByRole("button", { name: /^Your fit/ })).toHaveCount(1);
  await expect(tab).toHaveAttribute("aria-expanded", "false");
  await tab.click();
  await expect(tab).toHaveAttribute("aria-expanded", "true");
});

// ---------- axe: in-text links, names, contrast, in both themes ----------
const RULES = ["link-in-text-block", "label-content-name-mismatch", "color-contrast"];
const SCREENS = [
  ["Find jobs", "#/jobs", "#main .jcard", {}],
  ["the launcher", "#/skills", "#lf-body [data-field]", {}],
  ["Networking", "#/network?role=product.pm", "#main .nw-tabs", { email: CAMPUS_EMAIL }],
  ["Networking, faculty", "#/network?role=product.pm&type=faculty", "#main .nw-tabs", { email: CAMPUS_EMAIL }],
  ["the role page", "#/role/pm", "#main .role-head .heart", {}],
  ["the fit screen", "#/role/pm/fit", "#main #drop", {}],
  ["a field page", "#/field/marketing", "#main .field-split .list a.r", {}],
  ["Find classes with a résumé", "#/classes?role=product.pm", "#main .cls-gapnames", { email: CAMPUS_EMAIL, resume: true }],
  ["the sign-in", "#/signin", "#main #si", {}],
  ["About you", "#/you?step=3", "#main #drop", {}],
  ["the game", "#/play/know-the-role?role=pm", "#gm-play", {}],
];
for (const theme of ["light", "dark"]) {
  for (const [name, hash, ready, o] of SCREENS) {
    test(`axe, ${theme}: ${name} has no ${RULES.join(", ")} violation`, async ({ visitor }, info) => {
      test.skip(info.project.name !== "desktop" && name !== "the role page", "axe: the desktop project, and the role page (its rail tab) on a phone");
      const page = await visit(visitor, { ...o, theme, hash });
      await page.locator(ready).first().waitFor({ state: "attached" });
      await page.waitForTimeout(300);
      // the site's own nodes: a node inside an iframe (the Tally form of the "tell me when" box) is the third party's
      const v = (await axe(page, `${theme} ${name}`)).filter(x => RULES.includes(x.id)).map(x => ({ ...x, nodes: x.nodes.filter(n => n.target.length === 1) })).filter(x => x.nodes.length);
      expect(v.map(x => `${x.id}: ${x.nodes.map(n => n.target.join(" ")).slice(0, 4).join(" | ")}`)).toEqual([]);
    });
  }
}
