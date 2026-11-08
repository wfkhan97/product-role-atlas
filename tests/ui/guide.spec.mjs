// The guide (web/guide.js, the usability pass of 2026-11-06): each screen's tips on a first visit, in the state the step
// table names (fresh, campus, general; with and without a résumé), as a phone and as a desktop. The flag is forced on
// in the page (an init script sets CONFIG.GUIDE_ENABLED as config.js assigns CONFIG), never in web/config.js. Every
// context stubs the Supabase REST POSTs (fixtures.mjs); the cta rows are caught here and never leave the machine, and
// POST /api/infer answers 503. No Tally form is submitted.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { test, expect, gotoHash, axe, GENERAL_EMAIL, CAMPUS_EMAIL } from "./fixtures.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const Copy = require("../../web/copy.js");
const GuideTable = require("../../web/guide.js")({});
const G = Copy.guide;
const TEXT = fs.readFileSync(path.join(ROOT, "evals", "resumes", "grad_student_new.txt"), "utf8");
const RESUME = JSON.stringify({ text: TEXT, name: "grad_student_new.txt", words: TEXT.split(/\s+/).length, inferred: [], aiRead: false });
const ROLE = "product.pm";

// the flag on, in the page only: config.js assigns window.CONFIG, and the setter adds the flag to what it assigns
const FLAG_ON = () => {
  let v;
  Object.defineProperty(window, "CONFIG", { configurable: true, get: () => v, set: x => { v = x; if (x) x.GUIDE_ENABLED = true; } });
};
// the flag off, whatever web/config.js ships (it ships on since 2026-11-07)
const FLAG_OFF = () => {
  let v;
  Object.defineProperty(window, "CONFIG", { configurable: true, get: () => v, set: x => { v = x; if (x) x.GUIDE_ENABLED = false; } });
};
// a page in one state: email (null: fresh, the door), a résumé or not, the guide's seen-state, more storage
async function visit(visitor, { email = GENERAL_EMAIL, resume = false, hash = "#/home", seen = null, storage = {}, flag = true } = {}) {
  const kv = { ...(email ? { "door.email": email, "door.where": "", "door.seen": "1" } : {}), ...(resume ? { resume: RESUME } : {}), ...(seen ? { "guide.seen": JSON.stringify(seen) } : {}), ...storage };
  const page = await visitor.open({ storage: kv });
  const ctx = page.context();
  await ctx.addInitScript(flag ? FLAG_ON : FLAG_OFF);
  await ctx.route("**/api/infer", r => r.request().method() === "POST" ? r.fulfill({ status: 503, body: "{}" }) : r.continue());
  page.rows = [];
  await ctx.route(/\.supabase\.co\/rest\/v1\/events/, r => { if (r.request().method() === "POST") { try { const b = r.request().postDataJSON(); for (const x of [].concat(b)) page.rows.push(x); } catch { } } return r.fulfill({ status: 201, body: "" }); });
  await page.goto("/" + hash);
  return page;
}
const ctaRows = page => page.rows.filter(r => /^cta_/.test(r.name) && /^guide_/.test(r.cta || "")).map(r => `${r.name} ${r.cta} ${r.screen}`);
const card = page => page.locator(".guide-card");
const isPhone = info => info.project.name === "phone";

// the steps the table gives this state, kept when a target is in the page: in the DOM, a box larger than zero, inside
// the page's width (read here in the test, not from the guide)
async function expectedSteps(page, screen, ctxState) {
  const rows = GuideTable.STEPS.filter(r => r.screen === screen && (!r.when || r.when(ctxState)));
  const out = [];
  for (const r of rows) {
    const sel = await page.evaluate(sels => {
      for (const s of sels) { const e = document.querySelector(s); if (!e) continue; const q = e.getBoundingClientRect(); if (q.width > 0 && q.height > 0 && q.left >= -1 && q.right <= document.documentElement.clientWidth + 1) return s; }
      return null;
    }, r.target);
    if (sel) out.push({ id: r.id, sel });
  }
  return out;
}
// one tip on screen: the count, the copy, the target in the viewport after the scroll, focus in the card, the dim or
// the sheet; returns the target's selector
async function checkTip(page, info, screen, i, n, step) {
  await expect(page.locator("#guide-n")).toHaveText(Copy.fill(G.count, { i, n }));
  await expect(page.locator("#guide-t")).toHaveText(G.steps[screen][step.id].title);
  await expect(page.locator("#guide-b")).toHaveText(G.steps[screen][step.id].body);
  await expect(page.locator('.guide-card [data-g="back"]')).toBeVisible({ visible: i > 1 });
  await expect(page.locator('.guide-card [data-g="next"]')).toHaveText(i === n ? G.done : G.next);
  await expect.poll(() => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; }, step.sel), { message: `${screen}.${step.id}: ${step.sel} in the viewport` }).toBe(true);
  expect(await page.evaluate(() => { const c = document.querySelector(".guide-card"); return !!c && c.contains(document.activeElement); }), "focus is in the card").toBe(true);
  if (isPhone(info)) {
    await expect(card(page)).toHaveClass(/guide-sheet/);
    await expect(page.locator(".guide-hole")).toHaveCount(0);
    await expect(page.locator(step.sel).first()).toHaveClass(/guide-ring/);
    await expect.poll(() => page.evaluate(sel => document.querySelector(sel).getBoundingClientRect().top < document.querySelector(".guide-card").getBoundingClientRect().top, step.sel), { message: `${step.sel} starts above the sheet` }).toBe(true);
  } else {
    await expect(page.locator(".guide-hole")).toHaveCount(1);
    await expect.poll(() => page.evaluate(sel => { const t = document.querySelector(sel).getBoundingClientRect(), h = document.querySelector(".guide-hole").getBoundingClientRect(); return Math.abs(t.left - 4 - h.left) < 2 && Math.abs(t.top - 4 - h.top) < 2 && Math.abs(t.width + 8 - h.width) < 2; }, step.sel), { message: `the hole sits on ${step.sel}` }).toBe(true);
    const inView = await page.evaluate(() => { const r = document.querySelector(".guide-card").getBoundingClientRect(); return r.left >= 15 && r.top >= 15 && r.right <= innerWidth - 15 && r.bottom <= innerHeight - 15; });
    expect(inView, "the card stays inside the window").toBe(true);
  }
}
// a whole run: every tip, Next then Done; the cta rows for it
async function walk(page, info, screen, ctxState, { min = 1, absent = [] } = {}) {
  await expect(card(page)).toBeVisible({ timeout: 15_000 });
  const steps = await expectedSteps(page, screen, ctxState);
  expect(steps.length, `${screen}: steps present`).toBeGreaterThanOrEqual(min);
  for (const id of absent) expect(steps.map(s => s.id), `${screen}.${id} has no target in this state`).not.toContain(id);
  for (let i = 1; i <= steps.length; i++) {
    await checkTip(page, info, screen, i, steps.length, steps[i - 1]);
    await page.locator('.guide-card [data-g="next"]').click();
  }
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator(".guide-hole")).toHaveCount(0);
  const want = [`cta_shown guide_${screen} ${screen}`, ...(steps.length > 1 ? [`cta_click guide_${screen} ${screen}`] : []), `cta_done guide_${screen} ${screen}`];
  await expect.poll(() => ctaRows(page)).toEqual(want);
  // the run marks the screen seen at the table's version (jobs ships at 2 since the quick filters)
  const version = await page.evaluate(s => Guide.SCREENS[s].version, screen);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("guide.seen")))[screen]).toBe(version);
  return steps;
}
const C = (resume, extra = {}) => ({ resume, config: { FEEDBACK_ENABLED: true, GUIDE_ENABLED: true }, ...extra });

// ---------- every screen of the table, in the states it names ----------
test("door (fresh): no tip, no guide row, no seen-state (the door's own copy is the guide there)", async ({ visitor }) => {
  const page = await visit(visitor, { email: null, hash: "#/" });
  await page.locator("#main section.door").waitFor();
  await page.waitForTimeout(1500);
  await expect(page.locator(".guide-card, .guide-sheet, .guide-hole, .guide-ring")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("guide.seen"))).toBeNull();
  expect(ctaRows(page)).toEqual([]);
});

for (const [label, email] of [["general", GENERAL_EMAIL], ["campus", CAMPUS_EMAIL]]) {
  test(`home (${label}): the verbs, About you's questions, then the relaunch link (the footer's on a phone)`, async ({ visitor }, info) => {
    const page = await visit(visitor, { email });
    const steps = await walk(page, info, "home", C(false), { min: 3 });
    expect(steps.map(s => s.id)).toEqual(["verbs", "you", "relaunch"]);
    expect(steps[2].sel).toBe(isPhone(info) ? "#foot-guide" : "#verbs [data-guide]");
  });
}

test("home (general, every question answered): no About you tip on the summary box", async ({ visitor }, info) => {
  const page = await visit(visitor, { storage: { you: JSON.stringify({ where: "business", stage: "looking", fields: ["marketing"] }) } });
  const steps = await walk(page, info, "home", C(false), { min: 2, absent: ["you"] });
  expect(steps.map(s => s.id)).toEqual(["verbs", "relaunch"]);
});
test("classes (campus, no role): the role box, the résumé, the subjects; no band without a role", async ({ visitor }, info) => {
  const page = await visit(visitor, { email: CAMPUS_EMAIL, hash: "#/classes" });
  const steps = await walk(page, info, "classes", C(false), { min: 3, absent: ["band", "gaps"] });
  expect(steps.map(s => s.id)).toEqual(["role", "resume", "subjects"]);
  await expect(page.locator("#cls-add ul.pick-list")).toBeHidden();   // the run hands focus back to the role box; the list stays shut
});
test("classes (campus, a role, no résumé): role, band, résumé, subjects", async ({ visitor }, info) => {
  const page = await visit(visitor, { email: CAMPUS_EMAIL, hash: `#/classes?role=${ROLE}` });
  const steps = await walk(page, info, "classes", C(false), { min: 4 });
  expect(steps.map(s => s.id)).toEqual(["role", "band", "resume", "subjects"]);
});
test("classes (campus, a role and a résumé): role, band, gaps, subjects", async ({ visitor }, info) => {
  const page = await visit(visitor, { email: CAMPUS_EMAIL, resume: true, hash: `#/classes?role=${ROLE}` });
  const steps = await walk(page, info, "classes", C(true), { min: 4, absent: ["resume"] });
  expect(steps.map(s => s.id)).toEqual(["role", "band", "gaps", "subjects"]);
});

for (const resume of [false, true]) {
  const tag = resume ? "a résumé" : "no résumé";
  test(`jobs (general, ${tag}): search, quick filters, fields, ${resume ? "cardFit" : "card"}`, async ({ visitor }, info) => {
    const page = await visit(visitor, { resume, hash: "#/jobs" });
    const steps = await walk(page, info, "jobs", C(resume), { min: 4 });
    expect(steps.map(s => s.id)).toEqual(["search", "quick", "fields", resume ? "cardFit" : "card"]);
  });
  test(`skills (general, ${tag}): fields, search, ${resume ? "resumeFit" : "resume"}`, async ({ visitor }, info) => {
    const page = await visit(visitor, { resume, hash: "#/skills" });
    const steps = await walk(page, info, "skills", C(resume), { min: 3 });
    expect(steps.map(s => s.id)).toEqual(["fields", "search", resume ? "resumeFit" : "resume"]);
  });
  test(`role (general, ${tag}): level, areas, ${resume ? "railFit" : "rail"} (the rail tab on a phone)`, async ({ visitor }, info) => {
    const page = await visit(visitor, { resume, hash: `#/role/${ROLE}` });
    const steps = await walk(page, info, "role", C(resume), { min: 3 });
    expect(steps.map(s => s.id)).toEqual(["level", "areas", resume ? "railFit" : "rail"]);
    expect(steps[2].sel).toBe(isPhone(info) ? ".rail-tab" : resume ? "#aside.rail .lead-rail" : "#rail-read");
  });
}

test("fit (general, a résumé): level, counts, links, posting, once the columns draw", async ({ visitor }, info) => {
  const page = await visit(visitor, { resume: true, hash: `#/role/${ROLE}/fit` });
  const steps = await walk(page, info, "fit", C(true), { min: 3 });
  expect(steps.map(s => s.id).filter(id => id !== "links")).toEqual(["level", "counts", "posting"]);
});
test("fit (general, no résumé): the columns never draw, so no tip shows and the screen stays unseen", async ({ visitor }) => {
  const page = await visit(visitor, { hash: `#/role/${ROLE}/fit` });
  await page.locator("#main .page h1, #main h1").first().waitFor();
  await page.waitForTimeout(4000);
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("guide.seen"))).toBeNull();
});

test("explore (general, the cards): views, cards; no Find a skill", async ({ visitor }, info) => {
  const page = await visit(visitor, { hash: "#/explore" });
  const steps = await walk(page, info, "explore", C(false), { min: 2, absent: ["find"] });
  expect(steps.map(s => s.id)).toEqual(["views", "cards"]);
});
test("explore (general, the skill map): views, Find a skill; no cards", async ({ visitor }, info) => {
  const page = await visit(visitor, { hash: "#/explore?view=map" });
  const steps = await walk(page, info, "explore", C(false), { min: 2, absent: ["cards"] });
  expect(steps.map(s => s.id).sort()).toEqual(["find", "views"]);
});
test("field (general, a business field): roles, chart, heart", async ({ visitor }, info) => {
  const page = await visit(visitor, { hash: "#/field/marketing" });
  const steps = await walk(page, info, "field", C(false), { min: 3 });
  expect(steps.map(s => s.id)).toEqual(["roles", "chart", "heart"]);
});
test("network (general, past the questions gate with a role): role, types, prep, copy, once the prep card draws", async ({ visitor }, info) => {
  const page = await visit(visitor, { hash: `#/network?role=${ROLE}` });
  const steps = await walk(page, info, "network", C(false), { min: 4 });
  expect(steps.map(s => s.id)).toEqual(["role", "types", "prep", "copy"]);
});
test("network (general, at the questions gate): the prep card never draws, so no tip shows and the screen stays unseen", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/network" });
  await page.locator("#nw-you").waitFor();
  await page.waitForTimeout(4000);
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("guide.seen"))).toBeNull();
});
test("you (general, the questions): the answers and the bar; no summary steps", async ({ visitor }, info) => {
  const page = await visit(visitor, { hash: "#/you" });
  const steps = await walk(page, info, "you", C(false), { min: 2, absent: ["answers", "resume"] });
  expect(steps.map(s => s.id)).toEqual(["opts", "steps"]);
});
test("you (general, a résumé: the summary): the answers and the résumé link; no wizard steps", async ({ visitor }, info) => {
  const page = await visit(visitor, { resume: true, hash: "#/you" });
  const steps = await walk(page, info, "you", C(true), { min: 2, absent: ["opts", "steps"] });
  expect(steps.map(s => s.id)).toEqual(["answers", "resume"]);
});
test("course (general, no course read): the level, the description box; no result yet", async ({ visitor }, info) => {
  const page = await visit(visitor, { hash: `#/role/${ROLE}/course` });
  const steps = await walk(page, info, "course", C(false), { min: 2, absent: ["result"] });
  expect(steps.map(s => s.id)).toEqual(["level", "read"]);
});
test("play (general, a live game): the rounds (once one starts), the board, the rules and Quit, once the board draws; the game stays open", async ({ visitor }, info) => {
  const page = await visit(visitor, { hash: `#/play/know-the-role?role=${ROLE}` });
  const steps = await walk(page, info, "play", C(false), { min: 2 });
  expect(steps.map(s => s.id).filter(id => id !== "round")).toEqual(["body", "tools"]);   // the dots draw once a round starts
  expect(await page.evaluate(() => location.hash)).toMatch(/^#\/play\/know-the-role/);
});
test("play: Esc skips the tips and does not quit the game", async ({ visitor }) => {
  const page = await visit(visitor, { hash: `#/play/know-the-role?role=${ROLE}` });
  await expect(card(page)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(card(page)).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => location.hash)).toMatch(/^#\/play\/know-the-role/);
});
test("professor (campus, no role): the classes and what the profile holds; no gaps without a role", async ({ visitor }, info) => {
  // a professor with a profile: the first one a class's detail panel links to (Find classes already seen)
  const page = await visit(visitor, { email: CAMPUS_EMAIL, hash: "#/classes", seen: { classes: 2 } });   // classes ships at 2
  await page.locator("#main #cls-list").waitFor();
  await page.locator(".cls-card", { has: page.locator("a[data-prof]") }).first().locator("[data-open]").click();
  const href = await page.locator("#aside a[href^='#/professor/']").first().getAttribute("href");
  await page.evaluate(h => { location.hash = h; }, href);
  const steps = await walk(page, info, "professor", C(false), { min: 1, absent: ["gaps"] });
  expect(steps.map(s => s.id)).toContain("classes");
});
for (const [kind, id] of [["networking", "employers"], ["roundtable", "roundtable"], ["hackathon", "build"]]) {
  test(`event (general, ${kind}): the kinds, then the ${id} block only`, async ({ visitor }, info) => {
    const page = await visit(visitor, { hash: `#/field/marketing/event?${kind}` });
    const steps = await walk(page, info, "event", C(false), { min: 2 });
    expect(steps.map(s => s.id)).toEqual(["kinds", id]);
  });
}
for (const [label, email] of [["general", GENERAL_EMAIL], ["campus", CAMPUS_EMAIL]]) {
  test(`about (${label}): the counts, the employers, then Feedback (the footer's when the top bar's is past the edge)`, async ({ visitor }, info) => {
    const page = await visit(visitor, { email, hash: "#/about" });
    const steps = await walk(page, info, "about", C(false), { min: 3 });
    expect(steps.map(s => s.id)).toEqual(["facts", "employers", "feedback"]);
    expect(["#verbs [data-feedback]", "#foot-feedback"]).toContain(steps[2].sel);
    if (!isPhone(info)) expect(steps[2].sel).toBe("#verbs [data-feedback]");
  });
}

// ---------- the controls ----------
test("Back goes to the previous tip and hides on the first", async ({ visitor }, info) => {
  const page = await visit(visitor, { hash: "#/jobs" });
  await expect(card(page)).toBeVisible({ timeout: 15_000 });
  await page.locator('.guide-card [data-g="next"]').click();
  await expect(page.locator("#guide-n")).toHaveText(Copy.fill(G.count, { i: 2, n: 4 }));   // Find jobs has four tips
  await page.locator('.guide-card [data-g="back"]').click();
  await expect(page.locator("#guide-n")).toHaveText(Copy.fill(G.count, { i: 1, n: 4 }));
  await expect(page.locator('.guide-card [data-g="back"]')).toBeHidden();
  void info;
});

test("Esc skips: the card goes, guide_skip done with the screen, focus back in the page, and a second visit shows nothing", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/jobs" });
  await expect(card(page)).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(card(page)).toHaveCount(0);
  await expect.poll(() => ctaRows(page)).toEqual(["cta_shown guide_jobs jobs", "cta_done guide_skip jobs"]);
  expect(await page.evaluate(() => document.activeElement && document.activeElement.matches("#main h1"))).toBe(true);
  await gotoHash(page, "#/about");
  await expect(card(page)).toBeVisible({ timeout: 15_000 });
  await page.locator('.guide-card [data-g="skip"]').click();
  await gotoHash(page, "#/jobs");
  await page.locator("#jsearch").waitFor();
  await page.waitForTimeout(3500);
  await expect(card(page)).toHaveCount(0);
  expect(ctaRows(page).filter(r => r.includes("guide_jobs")).length, "no second shown").toBe(1);
});

test("× and a click outside the card skip too; a click on the target ends the run and goes through", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/jobs" });
  await expect(card(page)).toBeVisible({ timeout: 15_000 });
  await page.locator('.guide-card [data-g="close"]').click();
  await expect(card(page)).toHaveCount(0);
  await page.locator("footer.foot #foot-guide").click();
  await expect(card(page)).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(card(page)).toHaveCount(0);
  await page.locator("footer.foot #foot-guide").click();
  await expect(card(page)).toBeVisible();
  await page.locator('#jsearch input[name="q"]').click();
  await expect(card(page)).toHaveCount(0);
  await page.keyboard.type("analyst");
  await expect(page.locator('#jsearch input[name="q"]')).toHaveValue(/analyst/);
  await expect.poll(() => ctaRows(page)).toEqual([
    "cta_shown guide_jobs jobs", "cta_done guide_skip jobs",
    "cta_click guide_relaunch jobs", "cta_shown guide_jobs jobs", "cta_done guide_skip jobs",
    "cta_click guide_relaunch jobs", "cta_shown guide_jobs jobs", "cta_click guide_jobs jobs",
  ]);
});

test("Tab and Shift+Tab stay among the card's buttons", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/jobs" });
  await expect(card(page)).toBeVisible({ timeout: 15_000 });
  await page.locator('.guide-card [data-g="next"]').click();   // Back shows on the second tip
  const inCard = () => page.evaluate(() => { const c = document.querySelector(".guide-card"); return c.contains(document.activeElement) && document.activeElement !== c ? document.activeElement.dataset.g : null; });
  const seen = [];
  for (let k = 0; k < 6; k++) { await page.keyboard.press("Tab"); seen.push(await inCard()); }
  expect(seen.every(Boolean), `Tab: ${seen}`).toBe(true);
  expect(new Set(seen)).toEqual(new Set(["close", "skip", "back", "next"]));
  for (let k = 0; k < 5; k++) { await page.keyboard.press("Shift+Tab"); expect(await inCard()).toBeTruthy(); }
  expect(await page.locator(".guide-card").getAttribute("role")).toBe("dialog");
  expect(await page.locator(".guide-card").getAttribute("aria-modal")).toBe("false");
  expect(await page.locator(".guide-card").getAttribute("aria-labelledby")).toBe("guide-t");
  expect(await page.evaluate(() => [...document.querySelectorAll("[inert]")].length), "the page is never inert").toBe(0);
});

test("a version bump re-shows a seen screen once", async ({ visitor }, info) => {
  const page = await visit(visitor, { hash: "#/jobs", seen: { home: 1, jobs: 2 } });   // jobs ships at 2 since the quick filters
  await page.locator("#jsearch").waitFor();
  await page.waitForTimeout(3500);
  await expect(card(page)).toHaveCount(0);
  // the table's version raised in the page (a lower stored version is 0, which reads as unseen)
  await page.evaluate(() => { Guide.SCREENS.home.version = 2; });
  await gotoHash(page, "#/home");
  await expect(card(page)).toBeVisible({ timeout: 15_000 });
  await page.locator('.guide-card [data-g="skip"]').click();
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("guide.seen")))).toEqual({ home: 2, jobs: 2 });
  await gotoHash(page, "#/jobs");
  await page.locator("#jsearch").waitFor();
  await gotoHash(page, "#/home");
  await page.waitForTimeout(3500);
  await expect(card(page)).toHaveCount(0);
  expect(ctaRows(page)).toEqual(["cta_shown guide_home home", "cta_done guide_skip home"]);
  void info;
});

test("the relaunch link: beside Feedback and in the footer; it replays the screen's tips and sends guide_relaunch", async ({ visitor }, info) => {
  const page = await visit(visitor, { hash: "#/skills", seen: { home: 1, skills: 1 } });
  await page.locator("#lf-q").waitFor();
  await page.waitForTimeout(1500);
  await expect(card(page)).toHaveCount(0);
  const top = page.locator("#verbs [data-guide]");
  await expect(top).toHaveText(G.relaunch);
  await expect(page.locator("#verbs [data-feedback] + [data-guide]")).toHaveCount(1);
  await expect(page.locator("#foot-guide")).toBeVisible();
  if (isPhone(info)) await page.locator("#foot-guide").click(); else await top.click();
  await expect(card(page)).toBeVisible();
  await expect(page.locator("#guide-n")).toHaveText(Copy.fill(G.count, { i: 1, n: 3 }));
  await expect.poll(() => ctaRows(page)).toEqual(["cta_click guide_relaunch skills", "cta_shown guide_skills skills"]);
});

test("the relaunch link with no tip in the page: one card says so, Close shuts it, nothing is sent", async ({ visitor }) => {
  const page = await visit(visitor, { hash: `#/role/${ROLE}/fit` });
  await page.locator("#main h1").first().waitFor();
  await page.locator("#foot-guide").click();
  await expect(page.locator(".guide-none")).toContainText(G.none);
  await page.locator(".guide-none button").click();
  await expect(page.locator(".guide-none")).toHaveCount(0);
  expect(ctaRows(page)).toEqual([]);
});

test("the flag off: no tip, no relaunch link", async ({ visitor }) => {
  const page = await visit(visitor, { flag: false, hash: "#/jobs" });
  await page.locator("#jsearch").waitFor();
  await page.waitForTimeout(3500);
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator("[data-guide]")).toHaveCount(0);
  await expect(page.locator("#foot-guide")).toBeHidden();
  expect(ctaRows(page)).toEqual([]);
});

test("the door shows no relaunch link", async ({ visitor }) => {
  const page = await visit(visitor, { email: null, hash: "#/" });
  await page.locator("#main section.door").waitFor();
  await expect(page.locator("[data-guide]")).toHaveCount(0);
  await expect(page.locator("#foot-guide")).toBeHidden();
});

test("a route change mid-run removes the overlay at once and sends nothing more", async ({ visitor }) => {
  const page = await visit(visitor, { hash: "#/jobs" });
  await expect(card(page)).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => { location.hash = "#/about"; });
  await expect(page.locator(".guide-card, .guide-hole")).toHaveCount(0, { timeout: 500 });
  expect(ctaRows(page)).toEqual(["cta_shown guide_jobs jobs"]);
});

test("the feedback prompt does not open while a run is due or open; it does on a screen already seen", async ({ visitor }) => {
  const storage = { "journey.actions": "50" };   // past the prompt's twelve actions
  const page = await visit(visitor, { hash: "#/jobs", storage });
  await expect(card(page)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1000);
  await expect(page.locator("#fb-box")).toHaveCount(0);
  const control = await visit(visitor, { hash: "#/jobs", storage, seen: { home: 1, jobs: 2 } });
  await expect(control.locator("#fb-box")).toBeVisible({ timeout: 10_000 });
  await expect(card(control)).toHaveCount(0);
});

// ---------- accessibility ----------
for (const [screen, hash, resume] of [["home", "#/home", false], ["jobs", "#/jobs", false], ["role", `#/role/${ROLE}`, true]]) {
  test(`axe (WCAG 2.1 A and AA): the guide open on ${screen} adds no violation`, async ({ visitor }) => {
    const page = await visit(visitor, { hash, resume });
    await expect(card(page)).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(600);
    const key = v => v.nodes.map(n => `${v.id} ${n.target.join(" ")}`);
    const open = (await axe(page, `${screen} with the guide`)).flatMap(key);
    await page.locator('.guide-card [data-g="skip"]').click();
    await expect(card(page)).toHaveCount(0);
    const closed = new Set((await axe(page, `${screen} without`)).flatMap(key));
    expect(open.filter(k => !closed.has(k)), "violations the guide adds").toEqual([]);
    expect(open.filter(k => /guide/.test(k)), "none on the guide's own nodes").toEqual([]);
  });
}
