// The chrome, the feedback box, the sign-in and About: the fixes of 2026-11-06 (the usability pass, cluster
// "feedback, the sign-in, About and the chrome"). Every context stubs the Supabase REST POSTs (fixtures.mjs), and
// here also POST /api/infer (503) and POST */auth/v1/otp, so no email goes out; the feedback rows are caught, never
// sent. The strings come from web/copy.js, so a copy edit moves the spec with it.
import { createRequire } from "node:module";
import { test, expect, gotoHash, waitForScreen, GENERAL_EMAIL, CAMPUS_EMAIL } from "./fixtures.mjs";
import { sentences, wordCount, MAX_WORDS } from "../../evals/copy_lib.mjs";

const require = createRequire(import.meta.url);
const Copy = require("../../web/copy.js");
const hashOf = page => page.evaluate(() => location.hash);

// a visitor past the door, with POST /api/infer at 503 and the GoTrue send answered by `otp` ({ status, body })
async function visit(visitor, { email = GENERAL_EMAIL, hash = "#/home", otp = { status: 200, body: {} }, storage = {} } = {}) {
  const page = await visitor.open({ storage: { "door.email": email, "door.where": "", "door.seen": "1", ...storage } });
  const ctx = page.context();
  await ctx.route("**/api/infer", r => r.request().method() === "POST" ? r.fulfill({ status: 503, body: "{}" }) : r.continue());
  page.otpCalls = [];
  await ctx.route(/\/auth\/v1\/otp/, r => { page.otpCalls.push(r.request().postDataJSON()); return r.fulfill({ status: otp.status, contentType: "application/json", body: JSON.stringify(otp.body) }); });
  page.rows = [];
  await ctx.route(/\.supabase\.co\/rest\/v1\/feedback/, r => { if (r.request().method() === "POST") page.rows.push(r.request().postDataJSON()); return r.fulfill({ status: 201, body: "" }); });
  await page.goto("/#/home");
  await waitForScreen(page, "home");
  if (hash !== "#/home") await gotoHash(page, hash);
  return page;
}
const openSheet = async page => { await page.locator(".top [data-feedback]").first().click(); await page.locator("#fb-box").waitFor(); };

// ---------- the feedback box ----------
test("feedback: the email box opens empty; one press offers the door's address, and only then does the row carry it", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/jobs" });
  await openSheet(page);
  await expect(page.locator("#fb-email")).toHaveValue("");
  const use = page.locator("#fb-use");
  await expect(use).toBeVisible();
  await expect(use).toContainText(GENERAL_EMAIL);
  await page.locator("#fb-text").fill("The first sentence.");
  await page.locator("#fb-send").click();
  await expect.poll(() => page.rows.length).toBe(1);
  expect(page.rows[0].email, "no press, no email").toBeUndefined();
  await expect(page.locator("#fb-box")).toHaveCount(0, { timeout: 6000 });
  await openSheet(page);
  await page.locator("#fb-use").click();
  await expect(page.locator("#fb-email")).toHaveValue(GENERAL_EMAIL);
  await page.locator("#fb-text").fill("The second sentence.");
  await page.locator("#fb-send").click();
  await expect.poll(() => page.rows.length).toBe(2);
  expect(page.rows[1].email).toBe(GENERAL_EMAIL);
});

test("feedback: an address that is not an email stops Send with one line, and focus goes to the field", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/jobs" });
  await openSheet(page);
  await page.locator("#fb-text").fill("Test sentence.");
  await page.locator("#fb-email").fill("not-an-email");
  await page.locator("#fb-send").click();
  await expect(page.locator("#fb-out")).toHaveText(Copy.feedback.badEmail);
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe("fb-email");
  await page.waitForTimeout(300);
  expect(page.rows.length, "nothing sent").toBe(0);
});

// ---------- the sign-in and the map gate ----------
test("sign-in: one line says what the map is; a refused send shows a way to ask for an invite and the way back", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/signin", otp: { status: 422, body: { code: 422, error_code: "otp_disabled", msg: "Signups not allowed for otp" } } });
  await waitForScreen(page, "signin");
  await expect(page.locator("#main")).toContainText(Copy.signin.mapLine);
  await page.locator("#si-email").fill("nobody@example.com");
  await page.locator("#si-send").click();
  await expect(page.locator("#si-out .si-no")).toHaveText(Copy.signin.refused);
  const ask = page.locator("#si-out #si-ask");
  await expect(ask).toBeVisible();
  await expect(page.locator("#si-out a[href='#/skills']")).toBeVisible();
  await expect(page.locator("#main a[href='#/skills']:visible"), "the way back drawn once").toHaveCount(1);
  await ask.click();
  await page.locator("#fb-box").waitFor();
  await expect(page.locator("#fb-box")).toContainText(Copy.feedback.inviteLead);
});

test("the launcher's invite line says what the invite is for", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/skills" });
  await expect(page.locator("#main .lf-slot")).toContainText(Copy.map.invite);
  expect(Copy.map.invite).toMatch(/map/i);
});

test("the map gate: #/map?build=1&role=… as a visitor lands on the sign-in with next carried", async ({ visitor }) => {
  const page = await visit(visitor);
  await gotoHash(page, "#/map?build=1&role=product.pm");
  await expect.poll(() => hashOf(page)).toBe("#/signin?next=" + encodeURIComponent("#/map?build=1&role=product.pm"));
  await waitForScreen(page, "signin");
});

test("sign-in: a rate limit says to wait, never to check the connection", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/signin", otp: { status: 429, body: { code: 429, error_code: "over_email_send_rate_limit", msg: "Email rate limit exceeded" } } });
  await waitForScreen(page, "signin");
  await page.locator("#si-email").fill("someone@example.com");
  await page.locator("#si-send").click();
  await expect(page.locator("#si-out .si-no")).toHaveText(Copy.signin.rateLimited);
});

// ---------- About ----------
test("About: a late class count keeps the scroll and the open employer list", async ({ visitor }) => {
  const page = await visitor.open({ storage: { "door.email": CAMPUS_EMAIL, "door.where": "", "door.seen": "1" } });
  let release; const held = new Promise(r => { release = r; });
  await page.context().route(/data\/catalog\/cornell_tech\.json/, async r => { await held; await r.continue(); });
  await page.goto("/#/about");
  await page.locator("#main h1").waitFor();
  await page.locator("details.disc[data-k='about-top'] > summary").click();
  await expect(page.locator("details.disc[data-k='about-top']")).toHaveAttribute("open", "");
  const y0 = await page.evaluate(() => { window.scrollTo(0, Math.min(600, document.documentElement.scrollHeight - innerHeight)); return window.scrollY; });
  expect(y0).toBeGreaterThan(0);
  await page.waitForTimeout(3000);
  release();
  await expect(page.locator("#ab-classes b")).not.toHaveText("—", { timeout: 20_000 });
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - y0)).toBeLessThan(3);
  await expect(page.locator("details.disc[data-k='about-top']")).toHaveAttribute("open", "");
});

test("About: the footer link and the page share one name; the count line has no sentence over the limit", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/about" });
  await page.locator("#main h1").waitFor();
  await expect(page.locator("footer.foot a[href='#/about']")).toHaveText(await page.locator("#main h1").innerText());
  const text = await page.locator("#main #about").innerText();
  const long = text.split("\n").flatMap(sentences).filter(s => wordCount(s) > MAX_WORDS);
  expect(long).toEqual([]);
});

test("About opened directly shows the same roles count Explore shows", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/explore" });
  await expect(page.locator("#main .lead").first()).toContainText(/\d+ roles/);
  const explore = (await page.locator("#main .lead").first().innerText()).match(/(\d[\d,]*) roles/)[1];
  const about = await visit(visitor, { hash: "#/about" });
  await about.reload();
  await about.locator("#main h1").waitFor();
  await expect(about.locator(".about-facts .fact", { hasText: Copy.about.facts.roles }).locator("b")).toHaveText(explore, { timeout: 15_000 });
});

test("About counts the verbs this visitor has, and names alumni only for a campus address", async ({ visitor }) => {
  const general = await visit(visitor, { hash: "#/about" });
  await general.locator("#main h1").waitFor();
  const lead = await general.locator("#main .lead").first().innerText();
  expect(lead).toContain(Copy.about.counts[3]);
  await expect(general.locator("#main")).not.toContainText(/alumni/i);
  await expect(general.locator("#main h3", { hasText: Copy.about.classes })).toHaveCount(0);
  const campus = await visit(visitor, { email: CAMPUS_EMAIL, hash: "#/about" });
  await campus.locator("#main h1").waitFor();
  expect(await campus.locator("#main .lead").first().innerText()).toContain(Copy.about.counts[4]);
  await expect(campus.locator("#main")).toContainText(/alumni/i);
});

// ---------- the top bar ----------
test("the current mark: a professor opened from Networking marks Networking", async ({ visitor }) => {
  const page = await visit(visitor, { email: CAMPUS_EMAIL, hash: "#/network?role=product.pm&type=faculty" });
  const skip = page.locator("#main button", { hasText: "Skip for now" });
  await expect(skip.or(page.locator("#main a.r[href^='#/professor/']").first())).toBeVisible({ timeout: 20_000 });
  if (await skip.isVisible()) await skip.click();
  await page.locator("#main a.r[href^='#/professor/']").first().click();
  await expect.poll(() => hashOf(page)).toMatch(/^#\/professor\//);
  await expect(page.locator("#verbs [aria-current='page']")).toHaveText(Copy.common.bar.network);
});

test("the chrome links share one style: Feedback in the top bar as the other links, the footer's two alike", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/jobs" });
  const style = loc => loc.evaluate(e => { const s = getComputedStyle(e); return { color: s.color, weight: s.fontWeight, size: s.fontSize, line: s.textDecorationLine }; });
  const other = await style(page.locator("#verbs a.toplink:not(.on)").first());
  expect(await style(page.locator("#verbs [data-feedback]"))).toEqual(other);
  expect(await style(page.locator("#foot-feedback"))).toEqual(await style(page.locator("footer.foot a[href='#/about']")));
});

test("the theme button names the theme now, and every press changes the page", async ({ visitor }) => {
  for (const scheme of ["light", "dark"]) {
    const page = await visit(visitor, { hash: "#/jobs" });
    await page.emulateMedia({ colorScheme: scheme });
    const btn = page.locator("#theme");
    const read = () => page.evaluate(() => ({ label: document.querySelector("#theme").getAttribute("aria-label"), bg: getComputedStyle(document.body).backgroundColor }));
    let was = await read();
    expect(was.label, "the first state is the device's").toBe(Copy.fill(Copy.common.themeLabel, { theme: Copy.common.themeNames.system }));
    for (let i = 1; i <= 3; i++) {
      await btn.click();
      const now = await read();
      expect(now.label, `${scheme} press ${i}: the name changes`).not.toBe(was.label);
      expect(now.bg, `${scheme} press ${i}: the page changes`).not.toBe(was.bg);
      was = now;
    }
  }
});

test("the crumbs follow one rule: the section as the top bar names it, then the screen", async ({ visitor }) => {
  const page = await visit(visitor, { email: CAMPUS_EMAIL });
  const crumbs = () => page.locator("#crumbs a, #crumbs .here").allInnerTexts();
  for (const [hash, want] of [["#/jobs", [Copy.common.bar.jobs]], ["#/skills", [Copy.common.bar.skills]], ["#/network", [Copy.common.bar.network]], ["#/classes", [Copy.common.bar.classes]], ["#/about", [Copy.about.heading]]]) {
    await gotoHash(page, hash);
    await page.locator("#main h1").first().waitFor();
    await expect.poll(crumbs, hash).toEqual(want);
  }
  await gotoHash(page, "#/role/product.pm");
  await page.locator("#main h1").first().waitFor();
  await expect.poll(async () => (await crumbs())[0]).toBe(Copy.common.bar.skills);
  await expect(page.locator("#verbs [aria-current='page']")).toHaveText(Copy.common.bar.skills);
});

test("the skill map's key swatch is a round dot, not the top bar", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/explore" });
  await page.locator("#v-map").click();
  const sw = page.locator(".swkey i.sw.top");
  await sw.waitFor();
  const box = await sw.evaluate(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return { w: r.width, h: r.height, radius: s.borderRadius }; });
  expect(Math.abs(box.w - box.h)).toBeLessThan(1);
  expect(box.w).toBeLessThan(16);
  expect(box.radius).toBe("50%");
});
