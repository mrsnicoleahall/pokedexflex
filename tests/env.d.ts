declare namespace Cloudflare {
  interface Env {
    // Defined in `vitest.config.ts` via the `TEST_MIGRATIONS` miniflare binding.
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
