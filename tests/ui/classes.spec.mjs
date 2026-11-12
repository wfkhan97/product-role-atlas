// Find classes and the campus gate: the fixes of 2026-11-06 (the usability pass, cluster "Find classes and the campus
// gate"), on both viewports. Every context stubs the Supabase REST POSTs (fixtures.mjs); nothing here submits a form.
//   - the role rail draws its classes link only for an address that opens a roster
//   - a bounce from Find classes or a professor says why on home, once, with a link to the door
//   - the picker: a lead line and focus on the role box, the dates from the campus entry, a résumé read with no role,
//     focus kept across redraws, the detail panel's focus and Esc, Back from a professor, the empty list's filters,
//     the gap names, the role list's order and labels, the band tag's contrast
//   - a professor opened from the Faculty tab: the crumb goes back to Networking, and the tab says what "asks" are
import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, gotoHash, waitForScreen } from "./fixtures.mjs";

const RESUME = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "evals", "resumes", "grad_student_new.txt");
const hashOf = page => page.evaluate(() => location.hash);
// the picker drawn with its list (the heading alone draws before the roster is read)
async function picker(page, hash = "#/classes") {
  await gotoHash(page, hash);
  await page.locator("#main #cls-list").waitFor();
  return page;
}
const roleBox = page => page.locator("#cls-add input");
const focusIn = (page, sel) => page.evaluate(s => !!document.activeElement && !!document.activeElement.closest(s), sel);
const focused = (page, sel) => page.evaluate(s => document.activeElement === document.querySelector(s), sel);
// the résumé file on the picker's drop: the choice alone keeps it and draws the picker again
async function readResume(page) {
  await page.locator("#cls-resume #file").setInputFiles(RESUME);
  await expect(page.locator("#cls-resume")).toHaveCount(0);
}
// pick a role in the role box with the keyboard, as a person types it
async function pickRole(page, text) {
  await roleBox(page).click();
  await roleBox(page).fill(text);
  await page.keyboard.press("Enter");
  await expect(page.locator(".cls-roles .chip.on").first()).toBeVisible();
}

// ---------- the campus gate ----------
test("rail: the classes link shows only to an address that opens a roster", async ({ visitor }) => {
  const gmail = await visitor.general();
  await gotoHash(gmail, "#/role/pm");
  await gmail.locator("#aside section.rs").first().waitFor({ state: "attached" });
  await expect(gmail.locator("#aside a[href^='#/classes']")).toHaveCount(0);
  const cornell = await visitor.campus();
  await gotoHash(cornell, "#/role/pm");
  await cornell.locator("#aside section.rs").first().waitFor({ state: "attached" });
  await expect(cornell.locator("#aside a[href^='#/classes?role=']")).toHaveCount(1);
});

for (const hash of ["#/classes", "#/professor/keith-cowing"]) {
  test(`bounce: ${hash} sends a gmail address home with one line that says why, and only that once`, async ({ visitor }) => {
    const page = await visitor.general();
    await expect(page.locator(".home-bounce")).toHaveCount(0);
    await gotoHash(page, hash);
    await expect.poll(() => hashOf(page)).toBe("#/home");
    const line = page.locator("#main .home-bounce");
    await expect(line).toBeVisible();
    await expect(line).toContainText("Find classes is for Cornell email addresses today.");
    await expect(line.locator("a")).toHaveAttribute("href", "#/");
    // home again with no bounce: no line
    await gotoHash(page, "#/jobs"); await page.locator("#main h1").first().waitFor();
    await gotoHash(page, "#/home"); await waitForScreen(page, "home");
    await expect(page.locator(".home-bounce")).toHaveCount(0);
  });
}

test("bounce: Skip on the door of a #/classes deep link lands home with the line; its link opens the door", async ({ visitor }) => {
  const page = await visitor.open();
  await page.goto("/#/classes");
  await waitForScreen(page, "door");
  await page.locator("#main section.door a.door-skip:visible").first().click();
  await waitForScreen(page, "home");
  await expect(page.locator("#main .home-bounce")).toBeVisible();
  await page.locator("#main .home-bounce a").click();
  await waitForScreen(page, "door");
});

test("bounce: a Cornell address opens Find classes, and home draws no line", async ({ visitor }) => {
  const page = await visitor.campus();
  await expect(page.locator(".home-bounce")).toHaveCount(0);
  await picker(page);
  expect(await hashOf(page)).toBe("#/classes");
});

// ---------- the picker ----------
test("picker: no role yet, a lead line says what a role does, focus is on the role box, and the dates show", async ({ visitor }) => {
  const page = await picker(await visitor.campus());
  await expect(page.locator("#main h1")).toHaveText("Pick your classes");
  await expect(page.locator("#main .cls-lead")).toHaveText("Pick a role first. Each class then shows how well it fits that role.");
  await expect.poll(() => focusIn(page, "#cls-add")).toBe(true);
  await expect(page.locator("#cls-add ul.pick-list")).toBeHidden();   // focus alone does not open the list
  await expect(page.locator("#main .cls-dates")).toHaveText("Pre-enrollment: Nov 10–12. The roster can change until Nov 16.");
});

test("picker: Read my fit with no role keeps a line in the résumé row's place and puts focus on the role box", async ({ visitor }) => {
  const page = await picker(await visitor.campus());
  await readResume(page);
  const line = page.locator("#cls-norole");
  await expect(line).toHaveText("Résumé read. Pick a role above to see your gaps.");
  await expect.poll(() => focusIn(page, "#cls-add")).toBe(true);
});

test("picker: a role and a résumé name the gaps under the gap line", async ({ visitor }) => {
  const page = await picker(await visitor.campus(), "#/classes?role=product.pm");
  await readResume(page);
  const names = page.locator("#main .cls-gapnames");
  await expect(names).toBeVisible({ timeout: 20_000 });
  await expect(names).toContainText(/^Your gaps: .+\.$/);
});

test("picker: typing \"product manager\" lists Product Manager first, and the two Product Marketing Managers apart", async ({ visitor }) => {
  const page = await picker(await visitor.campus());
  await roleBox(page).click();
  await roleBox(page).fill("product manager");
  const opts = page.locator("#cls-add li[role='option']");
  await expect(opts.first()).toHaveText(/^Product Manager\b/);
  const labels = await opts.evaluateAll(els => els.map(e => e.firstChild.textContent.trim()));
  expect(new Set(labels).size).toBe(labels.length);
  expect(labels.filter(l => l.startsWith("Product Marketing Manager (")).length).toBe(2);
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
  await expect(page.locator(".cls-roles .chip.on").first()).toContainText("Product Manager");
  await expect(page.locator(".cls-roles .chip.on").first()).not.toContainText("Marketing");
});

test("picker: the role list opens on a click, not on focus, and axe finds no listbox fault while it is open", async ({ visitor }) => {
  const page = await picker(await visitor.campus());
  const list = page.locator("#cls-add ul.pick-list");
  await roleBox(page).focus();
  await expect(list).toBeHidden();
  await roleBox(page).click();
  await expect(list).toBeVisible();
  await expect(roleBox(page)).toHaveAttribute("aria-controls", await list.getAttribute("id"));
  await expect(list).toHaveAttribute("aria-label", /.+/);
  await page.keyboard.press("ArrowDown");
  await expect(roleBox(page)).toHaveAttribute("aria-activedescendant", /-0$/);
  const r = await new AxeBuilder({ page }).include("#cls-add").analyze();
  const ids = r.violations.map(v => v.id);
  for (const id of ["aria-input-field-name", "scrollable-region-focusable", "aria-required-attr"]) expect(ids, id).not.toContain(id);
  // the empty list: its note row is presentation, so the listbox still holds only options
  await roleBox(page).fill("zzzz");
  await expect(list.locator(".pick-none")).toBeVisible();
  const r2 = await new AxeBuilder({ page }).include("#cls-add").analyze();
  expect(r2.violations.map(v => v.id).filter(id => /aria|scrollable/.test(id))).toEqual([]);
});

test("picker: focus stays on the control after each redraw (role, subject, facet, Covers a gap, sort)", async ({ visitor }) => {
  const page = await picker(await visitor.campus());
  await pickRole(page, "Product Manager");
  await expect.poll(() => focusIn(page, "#cls-add")).toBe(true);
  // a subject chip, by the keyboard
  const subj = page.locator("[data-subject]").nth(1); const s = await subj.getAttribute("data-subject");
  await subj.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(`[data-subject="${s}"].on`)).toBeVisible();
  expect(await focused(page, `[data-subject="${s}"]`)).toBe(true);
  await page.locator('[data-subject=""]').focus(); await page.keyboard.press("Enter");
  expect(await focused(page, '[data-subject=""]')).toBe(true);
  // a facet chip: open Days, then Enter on its first day
  await page.locator('[data-facet="days"] > summary').focus(); await page.keyboard.press("Enter");
  const day = page.locator('[data-facet-key="days"]').first(); const v = await day.getAttribute("data-val");
  await day.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(`[data-facet-key="days"][data-val="${v}"].chip.on`)).toBeVisible();
  expect(await focused(page, `[data-facet-key="days"][data-val="${v}"]`)).toBe(true);
  await page.keyboard.press("Enter");   // off again
  // the sort
  await page.locator("#cls-sort").focus();
  await page.locator("#cls-sort").selectOption("relevance");
  await page.locator("#cls-sort").dispatchEvent("change");
  expect(await focused(page, "#cls-sort")).toBe(true);
});

test("picker: Covers a gap keeps focus after its redraw", async ({ visitor }) => {
  const page = await picker(await visitor.campus(), "#/classes?role=product.pm");
  await readResume(page);
  const gap = page.locator("#cls-gap");
  await expect(gap).toBeVisible({ timeout: 20_000 });
  await gap.focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#cls-gap.on")).toBeVisible();
  expect(await focused(page, "#cls-gap")).toBe(true);
});

test("picker: the detail panel takes focus on its heading, Esc closes it, and focus goes back to the card", async ({ visitor }) => {
  const page = await picker(await visitor.campus());
  const open = page.locator(".cls-card [data-open]").first(); const key = await open.getAttribute("data-open");
  await open.click();
  await expect(page.locator("#aside #cls-detail-h")).toBeVisible();
  await expect.poll(() => focused(page, "#aside #cls-detail-h")).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#aside #cls-detail-h")).toHaveCount(0);
  expect(await focused(page, `.cls-card [data-open="${key}"]`)).toBe(true);
});

test("picker: Back from a professor opened in the detail panel does not open the panel again", async ({ visitor }) => {
  const page = await picker(await visitor.campus());
  // the first card whose panel names a professor with a profile
  const card = page.locator(".cls-card", { has: page.locator("a[data-prof]") }).first();
  await card.locator("[data-open]").click();
  await page.locator("#aside a[href^='#/professor/']").first().click();
  await expect.poll(() => hashOf(page)).toMatch(/^#\/professor\//);
  await page.locator("#main h1").first().waitFor();
  await page.goBack();
  await page.locator("#main #cls-list").waitFor();
  await expect(page.locator("#aside #cls-detail-h")).toHaveCount(0);
  await expect(page.locator(".cls-card.on")).toHaveCount(0);
});

test("picker: an empty list names the filters that emptied it, and Clear filters brings every class back", async ({ visitor }) => {
  const page = await picker(await visitor.campus());
  const all = await page.locator(".cls-card").count();
  const subj = await page.locator("[data-subject]").nth(1).getAttribute("data-subject");
  await page.locator(`[data-subject="${subj}"]`).click();
  await page.locator("#cls-q").fill("zzzz");
  const empty = page.locator("#cls-list .cls-empty");
  await expect(empty).toContainText(`No class matches the search “zzzz” and the subject ${subj}.`);
  await page.locator("#cls-clear").click();
  await expect(page.locator(".cls-card")).toHaveCount(all);
  await expect(page.locator("#cls-q")).toHaveValue("");
  // a facet alone: the line names the facet, not the search
  await page.locator('[data-facet="days"] > summary').click();
  await page.locator('[data-facet-key="days"]').last().click();
  await page.locator("#cls-q").fill("zzzz");
  await expect(empty).toContainText("the Days filter");
});

for (const scheme of ["light", "dark"]) {
  test(`picker: the band tags on the cards reach 4.5:1 (${scheme}), on a selected card too`, async ({ visitor }) => {
    const page = await visitor.campus();
    await page.emulateMedia({ colorScheme: scheme });
    await picker(page, "#/classes?role=product.pm");
    await expect(page.locator(".cls-rel > .tag.good").first()).toBeVisible();
    // select the first card with a high band, so the tag sits on the selected card's tint
    await page.locator(".cls-card", { has: page.locator(".cls-rel > .tag.good") }).first().locator("[data-open]").click();
    const r = await new AxeBuilder({ page }).include(".cls-list").withRules(["color-contrast"]).analyze();
    const hits = r.violations.flatMap(v => v.nodes.map(n => n.target.join(" "))).filter(t => /tag/.test(t));
    expect(hits).toEqual([]);
  });
}

// ---------- the Faculty tab and the professor card ----------
test("faculty: the tab says what the count means, and a professor opened from it has a crumb back to Networking", async ({ visitor }) => {
  const page = await visitor.campus();
  await gotoHash(page, "#/network?role=product.pm&type=faculty");
  // a visitor with no answers meets three questions first; Skip passes them
  const skip = page.locator("#main button", { hasText: "Skip for now" });
  await expect(skip.or(page.locator("#main a.r[href^='#/professor/']").first())).toBeVisible({ timeout: 20_000 });
  if (await skip.isVisible()) await skip.click();
  const row = page.locator("#main a.r[href^='#/professor/']").first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#main")).toContainText("skills this role's postings ask for most");
  await expect(page.locator("#main")).not.toContainText(/teaches \d+ of \d+ asks/);
  const from = await hashOf(page);
  await row.click();
  await expect.poll(() => hashOf(page)).toMatch(/^#\/professor\//);
  const first = page.locator("#crumbs a").first();
  await expect(first).toHaveText("Networking");
  await expect(first).toHaveAttribute("href", from);
  await first.click();
  await expect.poll(() => hashOf(page)).toBe(from);
});

test("professor: opened from Find classes, the crumb says Classes", async ({ visitor }) => {
  const page = await picker(await visitor.campus());
  await page.locator(".cls-card a[data-prof]").first().click();
  await expect.poll(() => hashOf(page)).toMatch(/^#\/professor\//);
  await expect(page.locator("#crumbs a").first()).toHaveText("Find classes");
  await expect(page.locator("#crumbs a").first()).toHaveAttribute("href", "#/classes");
});
