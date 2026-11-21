import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Date logic (follow-ups, weekly stats) is timezone and daylight-saving
// sensitive, so tests always run in a zone that observes DST, whatever the
// machine or CI runner uses. Set here so the test workers inherit it.
process.env.TZ = "Europe/Athens";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // Fresh mock state for every test so tests cannot leak into each other.
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/main.tsx",
        "src/**/*.styles.ts",
        "src/assets/**",
        "src/locales/**",
        "src/types/**",
      ],
      reporter: ["text", "html"],
    },
  },
});
