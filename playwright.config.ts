import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Passcode und Hash nur für die Tests. */
export const E2E_PASSCODE = "e2e-synthetischer-code";
const hash = execFileSync("node", ["scripts/hash-passcode.mjs"], { input: E2E_PASSCODE, encoding: "utf8" })
  .trim()
  .replace(/^PASSCODE_HASH=/, "");

const chromium = process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } } : {};

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  projects: [
    { name: "demo", testMatch: /demo\.spec\.ts/, use: { baseURL: "http://127.0.0.1:4174", ...chromium } },
    { name: "live", testMatch: /live\.spec\.ts/, use: { baseURL: "http://127.0.0.1:4175", ...chromium } },
  ],
  webServer: [
    {
      command: "node scripts/serve-preview.mjs 4174",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: false,
    },
    {
      command: "node apps/server/dist/index.mjs",
      url: "http://127.0.0.1:4175/health",
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        PORT: "4175",
        DATABASE_PATH: join(tmpdir(), `els-e2e-${Date.now()}.db`),
        SESSION_SECRET: "e2e-".repeat(10),
        PASSCODE_HASH: hash,
        PUBLIC_ORIGIN: "http://127.0.0.1:4175",
        WEB_DIST: "apps/web/dist",
        LOG_LEVEL: "warn",
      },
    },
  ],
});
