// The UI harness (tests/README.md, "The UI harness"): tests/ui/serve.mjs serves web/ and its two functions on
// localhost:8787, and every spec runs twice, as a phone and as a desktop. Not in CI: it needs a browser.
import { defineConfig } from "@playwright/test";

const PORT = +process.env.PORT || 8787;
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.mjs$/,
  outputDir: "../../test-results/ui",
  reporter: "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  use: { baseURL: `http://localhost:${PORT}`, screenshot: "only-on-failure", trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
  ],
  webServer: { command: "node tests/ui/serve.mjs", cwd: "../..", port: PORT, reuseExistingServer: true, timeout: 20_000, env: { PORT: String(PORT) } },
});
