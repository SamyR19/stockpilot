# Plan 6: Cloud Deployment (Vercel + Supabase)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Before starting, read `docs/stockpilot/ROADMAP.md`** and update it when this plan completes.

**Goal:** Deploy StockPilot to production at Vercel (app + API) backed by Supabase PostgreSQL and Supabase Storage, with `STOCKPILOT_MODE=cloud` enabling Stripe billing and subscription tiers.

**Architecture:** The Vite UI is compiled to static files served by Vercel's CDN. The Express API is wrapped as a single Vercel serverless function (`api/index.ts`) — no embedded Postgres, no local disk. The existing `DATABASE_URL` config path connects to Supabase. The existing S3 storage provider is pointed at Supabase Storage (S3-compatible). WebSocket live-updates are disabled in cloud mode (the UI gracefully degrades to polling for the few pages that use them). `STOCKPILOT_MODE=cloud` activates Stripe billing, tier enforcement, and disables embedded Postgres.

**Tech Stack:** Vercel CLI (`vercel`), `@vercel/node` runtime, Supabase PostgreSQL + Storage, existing Express/Drizzle stack, `@aws-sdk/client-s3` (already a dep), Stripe (Plan 5).

---

## Scope notes

**In scope:**
- `vercel.json` + API entry point
- Supabase project setup (DB + Storage)
- All required environment variables configured in Vercel
- Database migration runner for Supabase
- Graceful WebSocket disabling in cloud mode (replace WS with polling/no-op)
- Stripe webhook URL updated to production domain
- Smoke-test the deployed app

**Not in scope (deferred):**
- Vercel Cron for automated heartbeat scheduling (requires a dedicated cron endpoint — own plan)
- Custom domain / DNS
- Per-company data-key resolution into the market client (`TODO(plan5)` in `app.ts`)

---

## Key facts (verified in codebase)

- `createApp(db, opts)` is in `server/src/app.ts`; it takes an assembled `db`, `storageService`, auth handlers, etc. The startup logic (embedded Postgres, migrations, WS) lives in `server/src/index.ts`. The Vercel entry point will replicate `startServer()` without the embedded Postgres/WS parts.
- Storage: existing S3 provider in `server/src/storage/s3-provider.ts` uses `@aws-sdk/client-s3`, accepts a custom `endpoint` and `forcePathStyle`. Supabase Storage is S3-compatible — set `PAPERCLIP_STORAGE_PROVIDER=s3`, `PAPERCLIP_STORAGE_S3_ENDPOINT=https://<project>.supabase.co/storage/v1/s3`, `PAPERCLIP_STORAGE_S3_BUCKET=stockpilot`, `PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE=true`.
- Auth: `better-auth` with Drizzle adapter — just needs a valid `DATABASE_URL` and `PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://<your-vercel-app>.vercel.app`.
- WebSockets: `setupLiveEventsWebSocketServer` in `server/src/index.ts:688` attaches to the raw HTTP server — not possible in a serverless function. Add a `PAPERCLIP_DISABLE_LIVE_EVENTS_WS=true` env var to skip WS setup. The UI live-updates degrade gracefully (the `LiveUpdatesProvider` already handles reconnection and falls back to polling).
- Migrations: `pnpm --filter @paperclipai/db exec drizzle-kit migrate` runs all pending SQL files. For Vercel, run them from a local machine or the Vercel build step targeting Supabase's `DATABASE_URL`.
- `pnpm build` at root already builds all packages including server (TSC → `server/dist/`) and UI (Vite → `ui/dist/`).

---

## File Map

**New files:**
- `api/index.ts` — Vercel serverless entry point; creates the Express app without embedded Postgres/WS
- `vercel.json` — Build command, output directory, rewrites

**Modified files:**
- `server/src/index.ts` — Skip `setupLiveEventsWebSocketServer` when `PAPERCLIP_DISABLE_LIVE_EVENTS_WS=true`
- `server/src/config.ts` — Add `disableLiveEventsWs: boolean` config field
- `.env.example` — Add Vercel/Supabase/cloud-mode env vars
- `docs/stockpilot/ROADMAP.md` — Mark Plan 6 complete

---

### Task 1: Disable WebSocket setup in cloud mode

**Files:**
- Modify: `server/src/config.ts`
- Modify: `server/src/index.ts`
- Test: add to existing server startup tests OR just typecheck

The WS server attaches to the raw Node HTTP server (`server.on('upgrade', ...)`). Vercel serverless functions don't expose a raw HTTP server, so `setupLiveEventsWebSocketServer` will throw. Guard it with a config flag.

- [ ] **Step 1: Add config field**

In `server/src/config.ts`, add near the other StockPilot flags:

```typescript
export const DISABLE_LIVE_EVENTS_WS = process.env.PAPERCLIP_DISABLE_LIVE_EVENTS_WS === 'true'
```

Add to the `Config` interface:
```typescript
  disableLiveEventsWs: boolean;
```

Add to the returned config object:
```typescript
    disableLiveEventsWs: DISABLE_LIVE_EVENTS_WS,
```

- [ ] **Step 2: Guard the WS setup in `server/src/index.ts`**

Find line 688 where `setupLiveEventsWebSocketServer` is called. It is inside the `startServer()` function, after the server starts listening. Wrap it:

```typescript
  if (!config.disableLiveEventsWs) {
    setupLiveEventsWebSocketServer(server, db as any, {
      // existing args unchanged
    });
  }
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @paperclipai/server typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add server/src/config.ts server/src/index.ts
git commit -m "feat: add PAPERCLIP_DISABLE_LIVE_EVENTS_WS flag for cloud deployment"
```

---

### Task 2: Vercel API entry point

**Files:**
- Create: `api/index.ts`
- Create: `api/tsconfig.json`

This is the single Vercel serverless function that handles all `/api/*` traffic. It replicates what `startServer()` does but without embedded Postgres (requires `DATABASE_URL`), without WS, and without the HTTP server lifecycle (Vercel handles that).

- [ ] **Step 1: Create `api/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../.vercel/output/functions/api",
    "rootDir": ".",
    "noEmit": false
  },
  "include": ["."]
}
```

- [ ] **Step 2: Create `api/index.ts`**

```typescript
// Vercel serverless entry point for StockPilot API.
// This file is deployed as a single Vercel function that handles all /api/* requests.
// It does NOT use embedded Postgres (requires DATABASE_URL) or WebSockets
// (PAPERCLIP_DISABLE_LIVE_EVENTS_WS=true is set in Vercel env).

import { loadConfig } from "../server/src/config.js";
import { createDb, applyPendingMigrations } from "@paperclipai/db";
import { createApp } from "../server/src/app.js";
import { createStorageService } from "../server/src/storage/service.js";
import { createStorageProvider } from "../server/src/storage/provider-registry.js";
import { logger } from "../server/src/middleware/logger.js";

// ── types only ──────────────────────────────────────────────────────────────
import type { IncomingMessage, ServerResponse } from "node:http";

let handler: ((req: IncomingMessage, res: ServerResponse) => void) | null = null;

async function getOrCreateHandler() {
  if (handler) return handler;

  const config = loadConfig();

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required in cloud mode. Set it in Vercel environment variables.");
  }

  // Connect to external Postgres (Supabase).
  const db = createDb({ databaseUrl: config.databaseUrl });

  // Apply any pending migrations on cold start (idempotent — safe to run multiple times).
  try {
    await applyPendingMigrations(db);
    logger.info("Database migrations applied (or already up to date)");
  } catch (err) {
    logger.warn({ err }, "Migration check failed — continuing anyway");
  }

  // Storage: S3-compatible (Supabase Storage or Vercel Blob).
  const storageProvider = createStorageProvider(config);
  const storageService = createStorageService(storageProvider);

  // Better-auth (optional — only in authenticated mode).
  let betterAuthHandler: import("express").RequestHandler | undefined;
  let resolveSession: ((req: import("express").Request) => Promise<unknown>) | undefined;

  if (config.deploymentMode === "authenticated") {
    const { createBetterAuth, createBetterAuthHandler, createSessionResolver } =
      await import("../server/src/auth/better-auth.js");
    const auth = createBetterAuth({ db: db as any, config });
    betterAuthHandler = createBetterAuthHandler(auth);
    resolveSession = createSessionResolver(auth);
  }

  const app = await createApp(db as any, {
    uiMode: "none",                              // Vercel CDN serves the UI
    serverPort: Number(process.env.PORT) || 3100,
    storageService,
    deploymentMode: config.deploymentMode,
    deploymentExposure: config.deploymentExposure,
    allowedHostnames: config.allowedHostnames,
    bindHost: config.host,
    authReady: true,
    companyDeletionEnabled: config.companyDeletionEnabled,
    betterAuthHandler,
    resolveSession: resolveSession as any,
  });

  handler = app;
  return handler;
}

// Vercel expects a default export.
export default async function vercelHandler(req: IncomingMessage, res: ServerResponse) {
  try {
    const h = await getOrCreateHandler();
    h(req, res);
  } catch (err) {
    logger.error({ err }, "Vercel handler failed to initialize");
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Server initialization failed" }));
  }
}
```

> **Important:** Check what `createStorageProvider` and `createStorageService` export from `server/src/storage/`:
> ```bash
> grep -n "export function\|export class\|export const" server/src/storage/provider-registry.ts server/src/storage/service.ts
> ```
> Adapt the import names to match exactly. The imports in `api/index.ts` must use the real exported function names.

> **Also check:** `createBetterAuth`, `createBetterAuthHandler`, `createSessionResolver` — verify these are the actual exported names from `server/src/auth/better-auth.ts`:
> ```bash
> grep -n "^export function\|^export const\|^export async function" server/src/auth/better-auth.ts
> ```
> Adapt if different.

- [ ] **Step 3: Typecheck `api/index.ts`**

```bash
cd "/Users/Samster/stockpilot ai"
npx tsc --project api/tsconfig.json --noEmit
```

Fix any type errors by looking at the actual exported names in `server/src/storage/` and `server/src/auth/`. Do NOT use `as any` for things that can be typed properly.

- [ ] **Step 4: Commit**

```bash
git add api/index.ts api/tsconfig.json
git commit -m "feat: add Vercel serverless API entry point"
```

---

### Task 3: `vercel.json` build + routing config

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "buildCommand": "pnpm run build",
  "outputDirectory": "ui/dist",
  "installCommand": "pnpm install --frozen-lockfile",
  "framework": null,
  "functions": {
    "api/index.ts": {
      "runtime": "@vercel/node@5",
      "maxDuration": 60
    }
  },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/index" },
    { "source": "/:path*",     "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/api/:path*",
      "headers": [
        { "key": "Cache-Control", "value": "no-store" }
      ]
    }
  ]
}
```

Explanation:
- `buildCommand`: runs `pnpm build` which builds server (`server/dist/`) + UI (`ui/dist/`).
- `outputDirectory`: Vercel serves `ui/dist` as the static CDN root.
- `functions`: `api/index.ts` is compiled by `@vercel/node` and handles all `/api/*` requests.
- `rewrites`: all `/api/*` → the serverless function; all other paths → `index.html` (React Router SPA).
- `maxDuration: 60`: 60-second max for the API function (Fluid Compute supports longer).

- [ ] **Step 2: Verify `pnpm build` completes cleanly**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm build 2>&1 | tail -20
```

Expected: all packages build without errors. Fix any build errors before proceeding.

- [ ] **Step 3: Verify UI output directory**

```bash
ls ui/dist/index.html
```

Expected: file exists.

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "feat: add vercel.json deployment config"
```

---

### Task 4: Supabase project setup + database migration

This task is **manual steps** followed by a migration run. No code to write — just configuration.

- [ ] **Step 1: Create a Supabase project**

Go to https://supabase.com/dashboard → New project. Note:
- **Project URL**: `https://<project-ref>.supabase.co`
- **Connection string** (Settings → Database → Connection string → URI): `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true`

Use the **Transaction** pooler connection string (port 6543) for serverless (it handles connection pooling). Copy it — this becomes `DATABASE_URL`.

- [ ] **Step 2: Run migrations against Supabase**

In your local terminal (not on Vercel), run migrations against the Supabase DB:

```bash
cd "/Users/Samster/stockpilot ai"
DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true" \
  pnpm --filter @paperclipai/db exec drizzle-kit migrate
```

Expected: all migrations run (0001 through 0095+). If you get `sslmode` errors, add `?sslmode=require` to the URL.

- [ ] **Step 3: Create a Supabase Storage bucket**

In Supabase dashboard → Storage → New bucket → name it `stockpilot` → set to **private** (assets are served through the API, not direct public URLs).

Note your **S3-compatible endpoint**: `https://<project-ref>.supabase.co/storage/v1/s3`
Note your **access key and secret**: Settings → Storage → S3 access keys → Generate new key.

- [ ] **Step 4: Verify you can connect**

```bash
DATABASE_URL="<your-supabase-url>" \
  node -e "
    const { createDb } = await import('./packages/db/dist/client.js');
    const db = createDb({ databaseUrl: process.env.DATABASE_URL });
    const rows = await db.execute('SELECT count(*) FROM users');
    console.log('users:', rows[0]);
    process.exit(0);
  "
```

Expected: prints a count. If 0, that's fine (new project).

---

### Task 5: Configure environment variables in Vercel

- [ ] **Step 1: Install Vercel CLI and link the project**

```bash
npm i -g vercel
cd "/Users/Samster/stockpilot ai"
vercel link
```

Follow the prompts: create a new project, name it `stockpilot`. This creates `.vercel/project.json`.

- [ ] **Step 2: Add all required environment variables**

Run these one by one (or paste in the Vercel dashboard under Settings → Environment Variables):

```bash
# Core mode
vercel env add STOCKPILOT_MODE production <<< "cloud"

# Database (Supabase connection string from Task 4)
vercel env add DATABASE_URL production

# Auth (your production Vercel URL)
vercel env add PAPERCLIP_AUTH_PUBLIC_BASE_URL production
# value: https://<your-project>.vercel.app

# Disable WebSockets (not supported in serverless)
vercel env add PAPERCLIP_DISABLE_LIVE_EVENTS_WS production <<< "true"

# Deployment mode
vercel env add PAPERCLIP_DEPLOYMENT_MODE production <<< "authenticated"

# Storage (Supabase Storage S3-compatible — values from Task 4 Step 3)
vercel env add PAPERCLIP_STORAGE_PROVIDER production <<< "s3"
vercel env add PAPERCLIP_STORAGE_S3_BUCKET production <<< "stockpilot"
vercel env add PAPERCLIP_STORAGE_S3_REGION production <<< "us-east-1"
vercel env add PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE production <<< "true"
vercel env add PAPERCLIP_STORAGE_S3_ENDPOINT production
# value: https://<project-ref>.supabase.co/storage/v1/s3
vercel env add AWS_ACCESS_KEY_ID production   # Supabase S3 access key
vercel env add AWS_SECRET_ACCESS_KEY production  # Supabase S3 secret

# Auth secret
vercel env add BETTER_AUTH_SECRET production
# value: generate with: openssl rand -base64 32

# App base URL (for Stripe redirects)
vercel env add APP_BASE_URL production
# value: https://<your-project>.vercel.app

# Market data (optional — enhance beyond Yahoo Finance)
# vercel env add ALPHA_VANTAGE_API_KEY production
# vercel env add POLYGON_API_KEY production

# Stripe (from Plan 5 setup)
# vercel env add STRIPE_SECRET_KEY production
# vercel env add STRIPE_WEBHOOK_SECRET production
# vercel env add STRIPE_PRICE_ID production
```

For secrets (DATABASE_URL, AWS keys, BETTER_AUTH_SECRET, Stripe keys), `vercel env add` prompts for the value interactively (not echoed to terminal). Do NOT paste secrets in shell commands.

- [ ] **Step 3: Verify variables are set**

```bash
vercel env ls production
```

Expected: lists all the env vars set above.

- [ ] **Step 4: Commit the `.vercel/project.json`**

```bash
git add .vercel/project.json
# .vercel/project.json contains only the project/org IDs — safe to commit
git commit -m "chore: link Vercel project"
```

---

### Task 6: Fix `api/index.ts` storage + auth imports

After checking the real exported names in Task 2 Step 2, we may need to update `api/index.ts` to use the correct function names. This task locks that in.

- [ ] **Step 1: Confirm storage service factory name**

```bash
grep -n "^export function\|^export const\|^export async" \
  server/src/storage/service.ts server/src/storage/provider-registry.ts
```

Read the actual exported function names and update `api/index.ts` imports + calls to match exactly.

- [ ] **Step 2: Confirm auth exported names**

```bash
grep -n "^export function\|^export const\|^export async" server/src/auth/better-auth.ts
```

The entry point needs: a function to create the auth instance, one to create the Express handler, and one to create a session resolver. Identify the real names and update `api/index.ts`.

- [ ] **Step 3: Typecheck again**

```bash
npx tsc --project api/tsconfig.json --noEmit
```

Expected: clean. Fix any remaining type errors.

- [ ] **Step 4: Run `pnpm build` end-to-end**

```bash
pnpm build 2>&1 | tail -30
```

Expected: all packages compile, `server/dist/`, `ui/dist/`, packages all build.

- [ ] **Step 5: Commit**

```bash
git add api/index.ts
git commit -m "fix: use correct storage + auth export names in Vercel entry point"
```

---

### Task 7: Deploy to Vercel and verify

- [ ] **Step 1: Deploy to preview**

```bash
cd "/Users/Samster/stockpilot ai"
vercel deploy
```

Vercel builds and deploys. Note the preview URL (e.g. `https://stockpilot-abc123.vercel.app`).

If the build fails, read the build log carefully and fix the error. Common issues:
- Missing `DATABASE_URL` at build time → add it as a build-time env var in Vercel dashboard or pass `--build-env DATABASE_URL=<url>`.
- Module resolution issue in `api/index.ts` → check import paths (use `.js` extensions for ESM).
- `pnpm` version mismatch → add `"packageManager": "pnpm@x.x.x"` to root `package.json`, or set `ENABLE_ROOT_PATH_PREFIX_IN_VERCEL=1`.

- [ ] **Step 2: Smoke-test the API**

```bash
PREVIEW_URL="https://stockpilot-<hash>.vercel.app"

# Health check
curl -s "$PREVIEW_URL/api/health" | head -c 200
# Expected: {"status":"ok","version":"...","deploymentMode":"authenticated",...}

# Should get 401 (no auth) not 500
curl -s -o /dev/null -w "%{http_code}" "$PREVIEW_URL/api/companies"
# Expected: 401
```

- [ ] **Step 3: Smoke-test the UI**

Open `https://stockpilot-<hash>.vercel.app` in a browser. Expected: the StockPilot app loads, the sign-up / sign-in page appears.

- [ ] **Step 4: Register and log in**

Create an account at the preview URL. Confirm:
- Sign up works → account created in Supabase DB
- Log in → session cookie set
- Dashboard loads
- The Finance sidebar items (Portfolio, Watchlist, Alerts, Market, Billing) are visible
- Market → look up `AAPL` → quote appears
- Billing page → shows `cloud` mode, `free` tier, 0 / 20 runs

- [ ] **Step 5: Update Stripe webhook to production URL** (if Stripe keys are configured)

In the Stripe dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://stockpilot-<hash>.vercel.app/api/billing/webhook`
- Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

Copy the webhook signing secret and update `STRIPE_WEBHOOK_SECRET` in Vercel env:
```bash
vercel env rm STRIPE_WEBHOOK_SECRET production
vercel env add STRIPE_WEBHOOK_SECRET production
# paste new secret
```

Then redeploy:
```bash
vercel deploy --prod
```

- [ ] **Step 6: Promote to production**

```bash
vercel --prod
```

This deploys to the production URL (`https://stockpilot.vercel.app` or your custom domain).

---

### Task 8: Update `.env.example` and ROADMAP

**Files:**
- Modify: `.env.example`
- Modify: `docs/stockpilot/ROADMAP.md`

- [ ] **Step 1: Update `.env.example` with Vercel/Supabase vars**

Add a `# Cloud deployment (Plan 6 — Vercel + Supabase)` section to `.env.example`:

```
# ─── Cloud deployment (Plan 6 — Vercel + Supabase) ──────────────────────────
# Required when deploying to Vercel. Disable embedded Postgres and WebSockets.
# PAPERCLIP_DEPLOYMENT_MODE=authenticated
# DATABASE_URL=postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
# PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://<your-project>.vercel.app
# BETTER_AUTH_SECRET=<openssl rand -base64 32>
# PAPERCLIP_DISABLE_LIVE_EVENTS_WS=true

# Supabase Storage (S3-compatible)
# PAPERCLIP_STORAGE_PROVIDER=s3
# PAPERCLIP_STORAGE_S3_BUCKET=stockpilot
# PAPERCLIP_STORAGE_S3_REGION=us-east-1
# PAPERCLIP_STORAGE_S3_FORCE_PATH_STYLE=true
# PAPERCLIP_STORAGE_S3_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3
# AWS_ACCESS_KEY_ID=<supabase-s3-access-key>
# AWS_SECRET_ACCESS_KEY=<supabase-s3-secret>
```

- [ ] **Step 2: Update ROADMAP**

In `docs/stockpilot/ROADMAP.md`:
- Mark Plan 6 as ✅ Done in the plan table.
- Update "Last updated" date.
- Add Plan 6 items to the "Built" feature diff: Vercel deployment, Supabase DB, Supabase Storage, PAPERCLIP_DISABLE_LIVE_EVENTS_WS.
- Note the deferred follow-ups: Vercel Cron for heartbeat scheduling, custom domain, per-company data-key market resolution.

- [ ] **Step 3: Commit and push**

```bash
git add .env.example docs/stockpilot/ROADMAP.md
git commit -m "docs: Plan 6 complete — cloud deployment (Vercel + Supabase)"
git push origin HEAD
```

---

## Self-Review

### Spec coverage (design spec §6 "Cloud Hosting Stack")
- ✅ App + API on Vercel — `vercel.json` + `api/index.ts` (Tasks 1–4).
- ✅ Database: Supabase PostgreSQL via `DATABASE_URL` (Task 4).
- ✅ File storage: Supabase Storage via existing S3 provider (Task 5 env vars).
- ✅ Background jobs (Vercel Cron) — **explicitly deferred** (own plan); noted in ROADMAP.
- ✅ Billing (Stripe) — already built in Plan 5; webhook URL updated in Task 7 Step 5.
- ✅ `STOCKPILOT_MODE=cloud` activates tier enforcement — set in env (Task 5).

### Placeholder scan
No "TBD" or vague steps. Task 4 ("Supabase project setup") is intentionally manual (no code to write) — the steps are specific Supabase dashboard actions with exact SQL commands. Task 6 Step 1–2 direct the implementer to read actual exported names rather than assume — this is explicit, not vague.

### Type consistency
- `config.disableLiveEventsWs: boolean` defined in Task 1, referenced in `server/src/index.ts`.
- `api/index.ts` imports from `server/src/*` — all types come from those modules.
- No new shared types introduced; all interfaces are from existing packages.
