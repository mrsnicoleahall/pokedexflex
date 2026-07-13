import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	// `remoteBindings: false` keeps `npm run dev` fully local. The `AI` binding
	// has no local simulator, so with remote bindings enabled the dev server
	// tries to open an authenticated Cloudflare remote-proxy session and fails
	// without a login. Disabling it makes `env.AI` a local stub that errors only
	// when called — which the photo-import route handles as a graceful 503
	// ("vision recognition activates once deployed"). Real Workers AI runs in
	// production (deploy) or with `wrangler dev --remote` after logging in.
	plugins: [react(), cloudflare({ remoteBindings: false })],
});
