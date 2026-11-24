import { cloudflareTest } from "@cloudflare/vitest-plugin";

// @cloudflare/vitest-pool-workers was renamed to @cloudflare/vitest-plugin
// (>=1.0). The plugin exposes cloudflareTest as a Vite plugin; the old
// defineWorkersConfig / .../config entrypoint no longer exists.
export default {
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.toml" },
      miniflare: {
        // Test-only binding. Does not go into wrangler.toml and does
        // not conflict with the production secret of the same name.
        bindings: {
          BITQUERY_KEY: "test-key-not-a-real-secret",
        },
      },
    }),
  ],
};
