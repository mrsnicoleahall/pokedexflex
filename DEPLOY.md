# Deploying PokeDexFlex

The app is **Cloudflare Workers** (serverless) — no FTP, no server. `wrangler deploy` bundles
the Worker + the built React client and pushes them to Cloudflare's edge.

## Already done (in the repo / your account)
- ✅ D1 database `pokedexflex` created; real `database_id` wired into `wrangler.jsonc`.
- ✅ R2 bucket `pokedexflex-sprites` created (binding stays `SPRITES` — ignore wrangler's suggested `pokedexflex_sprites`).
- ✅ `main` is the deployable branch (renamed to `pokedexflex`, all phases merged).
- ✅ Custom-domain routes for `pokedexflex.com` + `www.` added to `wrangler.jsonc`.

## The remaining steps — run these yourself (they need your Cloudflare login)
> Claude can't run these: `deploy`/`--remote` need your authenticated Cloudflare account
> (a `wrangler login` OAuth), and `secret put` means typing a secret value, which Claude won't do.

```bash
cd ~/Projects/PokeWebBank
git checkout main          # deployable branch
npx wrangler login         # if not already logged in with a full-access account

# 1. Create the tables in the REAL database + seed reference data
npx wrangler d1 migrations apply pokedexflex --remote
npx wrangler d1 execute pokedexflex --remote --file=data/seed.sql          # 1025 species
npx wrangler d1 execute pokedexflex --remote --file=data/events-seed.sql   # event distributions
#   (do NOT run data/demo-seed.sql in production — it's a local demo user)

# 2. Deploy the Worker (creates it), then set secrets (Worker must exist first)
npm run build
npx wrangler deploy
npx wrangler secret put SESSION_SECRET     # paste a long random string (e.g. `openssl rand -base64 32`)
npx wrangler secret put RESEND_API_KEY     # from resend.com — see the SECURITY note below
```

## SECURITY — set `RESEND_API_KEY` before real users log in
Without `RESEND_API_KEY`, `src/worker/auth/email.ts` falls back to **dev mode, which returns the
magic-link in the API response**. That's fine locally but in production it would hand anyone a
login link. Get a free Resend account, verify the `pokedexflex.com` sending domain, and set the
key as a secret. (Or swap in Cloudflare Email Routing — ask Claude to wire it if preferred.)

## Custom domain
The `routes` block in `wrangler.jsonc` attaches `pokedexflex.com` + `www.` on deploy (your zone is
already in Cloudflare). To smoke-test on the free `*.workers.dev` URL first, comment those two
`routes` lines out, deploy, test, then uncomment and redeploy.

## Housekeeping
- Rotate any Cloudflare API token or R2 access key that was ever pasted into a chat.
- After deploy, hit the `*.workers.dev` URL (or the domain) and run the onboarding flow to confirm
  D1 + R2 + sessions work end to end.
