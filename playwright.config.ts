import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  workers: 1,
  use: { channel: "chrome", headless: true },
  webServer: {
    command: ".venv/bin/python scripts/dev.py",
    url: "http://localhost:8001/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
  reporter: [["list"]],
});
