import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
    // Fresh mock state for every test so tests cannot leak into each other.
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    // Values the code reads from process.env. Nothing here is a real secret and
    // nothing in the test suite talks to a real database or external service.
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-jwt-secret",
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      FRONTEND_URL: "http://localhost:5173",
      BACKEND_URL: "http://localhost:3000",
      BLOB_READ_WRITE_TOKEN: "test-blob-token",
      DOTENV_CONFIG_QUIET: "true",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/server.ts", "src/types/**"],
      reporter: ["text", "html"],
    },
  },
});
