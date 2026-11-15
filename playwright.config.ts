import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 240_000,
  workers: 1,
  use: { channel: "chrome", headless: true },
  webServer: {
    command: ".venv/bin/python scripts/dev.py",
    url: "http://localhost:3002",
    reuseExistingServer: !!process.env.PW_REUSE,
    timeout: 180_000,
  },
  reporter: [["list"]],
});
