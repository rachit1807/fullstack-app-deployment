import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  workers: 1,
  timeout: 30370,
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3037",
    headless: true,
  },
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command:
          "NODE_ENV=test SESSION_SECRET=local-test-session-secret PORT=3037 npm start",
        url: "http://127.0.0.1:3037/api/health",
        reuseExistingServer: true,
      },
});
