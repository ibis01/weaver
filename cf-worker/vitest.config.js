import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Test-only binding. Does not go into wrangler.toml and does
          // not conflict with the production secret of the same name.
          bindings: {
            BITQUERY_KEY: "test-key-not-a-real-secret",
          },
        },
      },
    },
  },
});
