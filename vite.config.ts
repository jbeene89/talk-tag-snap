// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
//
// MOBILE_BUILD=1 additionally emits an SPA shell (dist/client/index.html) so the client
// bundle can be packaged into the Capacitor app and run fully offline. The regular web
// build stays SSR and is unaffected.
const mobileBuild = Boolean(process.env.MOBILE_BUILD);

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    // Mobile: emit an SPA shell (dist/client/index.html) so the client bundle
    // can be packaged into the Capacitor app and run fully offline.
    ...(mobileBuild
      ? {
          spa: {
            enabled: true,
            prerender: { outputPath: "/index.html", crawlLinks: false, retryCount: 0 },
          },
        }
      : {}),
  },
  // Mobile: skip the Cloudflare/nitro deploy pipeline — its .output layout is
  // incompatible with TanStack's shell prerenderer, and the mobile bundle only
  // needs the client build anyway.
  ...(mobileBuild ? { nitro: false as const } : {}),
  vite: {
    plugins: [mcpPlugin()],
    ...(mobileBuild
      ? // Shell prerendering boots a vite preview server; bind it to IPv4 so it
        // also works in environments without IPv6.
        { preview: { host: "127.0.0.1" } }
      : {}),
  },
});
