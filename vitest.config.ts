import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  // Read all migrations in the `migrations` directory so they can be applied
  // to the local test D1 database (see tests/setup/apply-migrations.ts).
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        // The `AI` binding has no local simulator (Cloudflare always routes it
        // remotely), which would otherwise make every test run try to open an
        // authenticated remote-proxy session. Tests never exercise the real
        // AI call (see src/worker/import/vision.ts), so disable that here.
        remoteBindings: false,
        miniflare: {
          // Test-only binding so the setup file can apply migrations.
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/setup/apply-migrations.ts"],
    },
  };
});
