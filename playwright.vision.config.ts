// Historical <=1.68 synthetic VisionPanel page harness. Owner-only /vision UI acceptance now uses scripts/test-status-pilot.mjs; this page suite is superseded.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/vision-browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:3014", browserName: "chromium", trace: "off" },
  reporter: [["list"], ["json", { outputFile: "artifacts/vision-ui-results.json" }]],
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3014",
    url: "http://127.0.0.1:3014/vision",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DASHBOARD_DEMO_MODE: "1", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
