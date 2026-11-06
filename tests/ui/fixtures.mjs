// The UI harness's test object: `test` with a `visitor` fixture that puts a page in one of four states, and the
// helpers gotoHash, waitForScreen and axe. Specs import { test, expect } from here.
//
// The keys the site keeps in localStorage, and where web/app.js sets them:
//   door.email, door.where, door.seen   keepDoor(), app.js line 546-547; home() calls it for the Tally return
//                                       #/home?email=…&where=… (app.js line 607-610), the native Continue and Skip
//                                       call it too (line 583, 587). doorKept() reads them (line 366).
//   maps.session                        web/auth.js KEY (line 37), written by keep() after the magic link lands
//                                       (Auth.takeHash, called by route(), app.js line 495-497) or after a code
//                                       (verifyCode). The code sign-in then sets door.email and door.seen (app.js line 799).
//
// Writes the site would send to production are stubbed: every POST to the Supabase REST API (/rest/v1/: the funnel
// events, the waitlist, feedback, the saved state) answers 201 here and never leaves the machine. Reads, GoTrue,
// Storage and the third-party scripts (Tally, cdnjs, Google Fonts) go through as they are.
import { test as base, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SESSION_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), ".session.json");
export const CAMPUS_EMAIL = "ui-harness@cornell.edu";
export const GENERAL_EMAIL = "ui-harness@gmail.com";

// The screen a route draws, read from what it puts on the page: the router sets no data-screen attribute, so each
// screen has a selector it draws only when it is done (the default: the page's h1 inside #main).
const SCREEN_READY = {
  door: "#main section.door",
  home: "#main .home-page .verbs a.verb",
  signin: "#main #si",
};
export async function waitForScreen(page, name) {
  await page.locator(SCREEN_READY[name] || "#main .page h1").first().waitFor({ state: "visible" });
  return page;
}
export async function gotoHash(page, hash) {
  const h = hash.startsWith("#") ? hash : "#" + hash;
  if (page.url().startsWith("http") && new URL(page.url()).pathname === "/") await page.evaluate(x => { location.hash = x; }, h);
  else await page.goto("/" + h);
  return page;
}
// WCAG 2.1 A and AA: the violations, never a failure (the audit decides what to fix)
export async function axe(page, name) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  if (name) base.info().annotations.push({ type: "axe", description: `${name}: ${r.violations.length} violations (${r.violations.map(v => v.id).join(", ") || "none"})` });
  return r.violations;
}

// console errors that are expected locally: the functions without their keys (503, 404 from /api/*), and loads a
// third party refused or the sandbox blocked
export const EXPECTED_CONSOLE = [/\/api\/(infer|tree)/, /status of (503|404)/, /net::ERR_(BLOCKED|FAILED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION)/, /tally\.so|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/];
export const unexpected = errors => errors.filter(e => !EXPECTED_CONSOLE.some(re => re.test(e.text) || re.test(e.url)));

export const test = base.extend({
  visitor: async ({ browser, baseURL }, use, info) => {
    const contexts = [];
    const open = async ({ storage = {} } = {}) => {
      const context = await browser.newContext({ ...info.project.use, baseURL });
      contexts.push(context);
      await context.route(/\.supabase\.co\/rest\/v1\//, route => route.request().method() === "POST" ? route.fulfill({ status: 201, body: "" }) : route.continue());
      await context.addInitScript(kv => {
        if (sessionStorage.getItem("ui-harness.seeded")) return;   // once per tab: a reload keeps what the site wrote
        localStorage.clear();
        for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
        sessionStorage.setItem("ui-harness.seeded", "1");
      }, storage);
      const page = await context.newPage();
      page.consoleErrors = [];
      page.on("console", m => { if (m.type() === "error") page.consoleErrors.push({ text: m.text(), url: (m.location() || {}).url || "" }); });
      page.on("pageerror", e => page.consoleErrors.push({ text: "pageerror: " + e.message, url: "" }));
      return page;
    };
    // the door passed the way the site passes it after Tally: the return #/home?email=…&where= (home() keeps it)
    const passDoor = async email => {
      const page = await open();
      await page.goto(`/#/home?email=${encodeURIComponent(email)}&where=`);
      await waitForScreen(page, "home");
      return page;
    };
    await use({
      // nothing stored: #/ draws the door
      fresh: async () => { const page = await open(); await page.goto("/#/"); await waitForScreen(page, "door"); return page; },
      // the door passed with a campus address: Find classes opens (Door.opens, web/config.js CAMPUS_DOMAINS)
      campus: () => passDoor(CAMPUS_EMAIL),
      // the door passed with an address of no campus: three verbs
      general: () => passDoor(GENERAL_EMAIL),
      // a session captured once from a real sign-in (tests/README.md); the door keys as the code sign-in sets them
      signedIn: async () => {
        if (!fs.existsSync(SESSION_FILE)) base.skip(true, "no tests/ui/.session.json: capture one (tests/README.md, \"The UI harness\")");
        const raw = fs.readFileSync(SESSION_FILE, "utf8").trim(), s = JSON.parse(raw);
        const page = await open({ storage: { "maps.session": raw, "door.email": s.email || "", "door.seen": "1" } });
        await page.goto("/#/home");
        await waitForScreen(page, "home");
        return page;
      },
      open,
    });
    for (const c of contexts) await c.close();
  },
});
export { expect };
