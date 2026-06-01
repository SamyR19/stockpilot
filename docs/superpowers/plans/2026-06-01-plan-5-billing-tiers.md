# Plan 5: Stripe Billing + Subscription Tier Enforcement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Before starting, read `docs/stockpilot/ROADMAP.md`** (source of truth) and update it when this plan completes.

**Goal:** Enforce the StockPilot subscription tiers (selfhost / cloud-free / cloud-keys / cloud-subscription) across agent roles, run limits, and market-data providers, and add Stripe billing + two-key API-key management for the cloud mode.

**Architecture:** The tier *model* already exists in `packages/feature-flags` (`getUserTier`, `canUseRole`, `FREE_TIER_MONTHLY_RUNS=20`, role lists). Plan 5 adds: (1) a server-side **subscription service** that resolves a company's tier from the `subscriptions` table; (2) **enforcement** at the three gates — agent role assignment, monthly run count, market-data provider selection; (3) **API-key management** (AI keys + data keys) layered on the existing secrets system, where saving a data key flips a company to the `keys` tier; (4) a **Stripe integration** (customer, checkout, customer portal, webhook → `subscriptions.status`); (5) **billing API routes** and a **Billing UI page**, both active only in cloud mode. Self-host mode is unaffected (always `selfhost` tier = everything unlocked, no billing UI).

**Tech Stack:** Express 5 + Drizzle ORM (server), `stripe` Node SDK (new dep), React 19 + React Query v5 + shadcn/ui (UI), Vitest (tests). Mode switch via `STOCKPILOT_MODE` / `config.isCloudMode`.

---

## Key facts (verified in codebase)

- `packages/feature-flags/src/index.ts` exports: `getMode`, `isCloud`, `isSelfHost`, `getUserTier(subscriptionStatus)`, `UserTier = 'selfhost'|'free'|'keys'|'subscription'`, `SubscriptionStatus = 'active'|'keys'|'past_due'|'canceled'|null`, `FREE_TIER_MONTHLY_RUNS = 20`, `FREE_TIER_AGENT_ROLES`, `ALL_AGENT_ROLES`, `AgentRole`, `getAllowedRoles(tier)`, `canUseRole(role, tier)`.
- `subscriptions` table (`packages/db/src/schema/subscriptions.ts`): `id, companyId (unique), stripeCustomerId, stripeSubscriptionId, status (default 'free'), plan, currentPeriodEnd, createdAt, updatedAt`. Exported from `@paperclipai/db`.
- `heartbeat_runs` table has `companyId`, `status`, `createdAt`, `startedAt` — use `createdAt` + `companyId` to count monthly runs.
- Auth: `assertAuthenticated(req)` + `assertCompanyAccess(req, companyId)` from `server/src/routes/authz.js`; uses `req.actor`.
- Config: `server/src/config.ts` exposes `isCloudMode`, `stockpilotMode`; add Stripe env vars there.
- Market router (`server/src/routes/market.ts`) is constructed in `server/src/app.ts` with global `alphaVantageApiKey`/`polygonApiKey` from config — Plan 5 makes provider selection **per-company + tier-aware**.
- No `stripe` dependency exists yet. Secrets system (`server/src/routes/secrets.ts`) stores encrypted secrets per company.

---

## File Map

**New backend files:**
- `server/src/services/subscription.ts` — resolve/read/write a company's subscription + tier
- `server/src/services/subscription.test.ts`
- `server/src/services/run-limit.ts` — count monthly runs, decide if a new run is allowed
- `server/src/services/run-limit.test.ts`
- `server/src/services/stripe-client.ts` — lazy Stripe SDK singleton (cloud only)
- `server/src/routes/billing.ts` — `/api/billing/*` (status, checkout, portal, webhook)
- `server/src/routes/billing.test.ts`
- `server/src/routes/api-keys.ts` — `/api/api-keys/*` (list/set/delete AI + data keys)
- `server/src/routes/api-keys.test.ts`

**Modified backend files:**
- `server/src/config.ts` — add `stripeSecretKey`, `stripeWebhookSecret`, `stripePriceId`, `appBaseUrl`
- `server/src/app.ts` — mount billing + api-keys routers; make market router tier-aware
- `server/src/routes/agents.ts` — enforce `canUseRole` on finance-role assignment
- `server/src/services/heartbeat.ts` (or the run-scheduling entry point) — enforce run limit before queueing
- `packages/feature-flags/src/index.ts` — add `canUseDataProvider(provider, tier)` helper

**New frontend files:**
- `ui/src/api/billing.ts` — billing API client
- `ui/src/api/apiKeys.ts` — api-keys client
- `ui/src/pages/Billing.tsx` — tier + usage + upgrade/manage (cloud only)
- `ui/src/hooks/useTier.ts` — React Query hook returning current tier + usage

**Modified frontend files:**
- `ui/src/lib/queryKeys.ts` — add `billing`, `apiKeys` keys
- `ui/src/lib/company-routes.ts` — add `billing` to `BOARD_ROUTE_ROOTS`
- `ui/src/App.tsx` — add `/billing` route
- `ui/src/components/Sidebar.tsx` — add "Billing" nav item under Finance (cloud mode only)

---

### Task 1: `feature-flags` data-provider gating helper

**Files:**
- Modify: `packages/feature-flags/src/index.ts`
- Test: `packages/feature-flags/src/index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/feature-flags/src/index.test.ts`:

```typescript
import { canUseDataProvider } from './index'

describe('canUseDataProvider', () => {
  it('allows yahoo-finance on every tier', () => {
    for (const tier of ['selfhost', 'free', 'keys', 'subscription'] as const) {
      expect(canUseDataProvider('yahoo-finance', tier)).toBe(true)
    }
  })
  it('restricts alpha-vantage and polygon to non-free tiers', () => {
    expect(canUseDataProvider('alpha-vantage', 'free')).toBe(false)
    expect(canUseDataProvider('polygon', 'free')).toBe(false)
    for (const tier of ['selfhost', 'keys', 'subscription'] as const) {
      expect(canUseDataProvider('alpha-vantage', tier)).toBe(true)
      expect(canUseDataProvider('polygon', tier)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @stockpilotai/feature-flags exec vitest run src/index.test.ts`
Expected: FAIL — `canUseDataProvider is not a function`.

- [ ] **Step 3: Implement the helper**

Append to `packages/feature-flags/src/index.ts`:

```typescript
export type DataProvider = 'yahoo-finance' | 'alpha-vantage' | 'polygon'

const FREE_TIER_DATA_PROVIDERS: readonly DataProvider[] = ['yahoo-finance']

export function canUseDataProvider(provider: DataProvider, tier: UserTier): boolean {
  if (tier === 'free') return FREE_TIER_DATA_PROVIDERS.includes(provider)
  return true
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @stockpilotai/feature-flags exec vitest run src/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/feature-flags/src/index.ts packages/feature-flags/src/index.test.ts
git commit -m "feat(feature-flags): add canUseDataProvider tier gate"
```

---

### Task 2: Subscription service (resolve a company's tier)

**Files:**
- Create: `server/src/services/subscription.ts`
- Create: `server/src/services/subscription.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/services/subscription.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { createSubscriptionService } from './subscription.js'

const COMPANY = '11111111-1111-1111-1111-111111111111'

function dbReturning(row: unknown) {
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (row ? [row] : []) }) }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [row] }) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [row] }) }) }),
  } as any
}

describe('subscription service', () => {
  it('returns selfhost tier in self-host mode regardless of row', () => {
    const svc = createSubscriptionService(dbReturning(null), { isCloudMode: false })
    expect(svc.tierFromStatus(null)).toBe('selfhost')
  })

  it('maps an active cloud subscription to the subscription tier', () => {
    const svc = createSubscriptionService(dbReturning(null), { isCloudMode: true })
    expect(svc.tierFromStatus('active')).toBe('subscription')
    expect(svc.tierFromStatus('keys')).toBe('keys')
    expect(svc.tierFromStatus('past_due')).toBe('free')
    expect(svc.tierFromStatus(null)).toBe('free')
  })

  it('reads the subscription row for a company', async () => {
    const row = { companyId: COMPANY, status: 'active', stripeCustomerId: 'cus_1' }
    const svc = createSubscriptionService(dbReturning(row), { isCloudMode: true })
    const sub = await svc.getForCompany(COMPANY)
    expect(sub?.status).toBe('active')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @paperclipai/server exec vitest run src/services/subscription.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `server/src/services/subscription.ts`:

```typescript
import { eq } from 'drizzle-orm'
import { subscriptions } from '@paperclipai/db'
import type { Db } from '@paperclipai/db'
import { getUserTier, type SubscriptionStatus, type UserTier } from '@stockpilotai/feature-flags'

export interface SubscriptionRow {
  companyId: string
  status: string
  plan: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  currentPeriodEnd: Date | null
}

export interface SubscriptionService {
  getForCompany(companyId: string): Promise<SubscriptionRow | null>
  tierFromStatus(status: SubscriptionStatus): UserTier
  tierForCompany(companyId: string): Promise<UserTier>
  setStatus(companyId: string, status: SubscriptionStatus, patch?: Partial<SubscriptionRow>): Promise<void>
  linkStripeCustomer(companyId: string, stripeCustomerId: string): Promise<void>
}

function normalizeStatus(raw: string | null | undefined): SubscriptionStatus {
  if (raw === 'active' || raw === 'keys' || raw === 'past_due' || raw === 'canceled') return raw
  return null
}

export function createSubscriptionService(db: Db, opts: { isCloudMode: boolean }): SubscriptionService {
  return {
    async getForCompany(companyId) {
      const rows = await db
        .select({
          companyId: subscriptions.companyId,
          status: subscriptions.status,
          plan: subscriptions.plan,
          stripeCustomerId: subscriptions.stripeCustomerId,
          stripeSubscriptionId: subscriptions.stripeSubscriptionId,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
        })
        .from(subscriptions)
        .where(eq(subscriptions.companyId, companyId))
        .limit(1)
      return rows[0] ?? null
    },

    tierFromStatus(status) {
      // getUserTier internally returns 'selfhost' when STOCKPILOT_MODE !== cloud
      return getUserTier(status)
    },

    async tierForCompany(companyId) {
      if (!opts.isCloudMode) return 'selfhost'
      const row = await this.getForCompany(companyId)
      return getUserTier(normalizeStatus(row?.status))
    },

    async setStatus(companyId, status, patch = {}) {
      const value = status ?? 'free'
      await db
        .insert(subscriptions)
        .values({ companyId, status: value, ...patch })
        .onConflictDoUpdate({
          target: subscriptions.companyId,
          set: { status: value, updatedAt: new Date(), ...patch },
        })
    },

    async linkStripeCustomer(companyId, stripeCustomerId) {
      await db
        .insert(subscriptions)
        .values({ companyId, status: 'free', stripeCustomerId })
        .onConflictDoUpdate({
          target: subscriptions.companyId,
          set: { stripeCustomerId, updatedAt: new Date() },
        })
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @paperclipai/server exec vitest run src/services/subscription.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/subscription.ts server/src/services/subscription.test.ts
git commit -m "feat: add subscription service for tier resolution"
```

---

### Task 3: Monthly run-limit service

**Files:**
- Create: `server/src/services/run-limit.ts`
- Create: `server/src/services/run-limit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/services/run-limit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createRunLimitService } from './run-limit.js'

const COMPANY = '11111111-1111-1111-1111-111111111111'

function dbWithCount(n: number) {
  return {
    select: () => ({ from: () => ({ where: async () => [{ count: n }] }) }),
  } as any
}

describe('run-limit service', () => {
  it('never limits non-free tiers', async () => {
    const svc = createRunLimitService(dbWithCount(999))
    expect(await svc.canStartRun(COMPANY, 'subscription')).toEqual({ allowed: true })
    expect(await svc.canStartRun(COMPANY, 'selfhost')).toEqual({ allowed: true })
    expect(await svc.canStartRun(COMPANY, 'keys')).toEqual({ allowed: true })
  })

  it('allows free tier under the monthly cap', async () => {
    const svc = createRunLimitService(dbWithCount(19))
    expect(await svc.canStartRun(COMPANY, 'free')).toEqual({ allowed: true })
  })

  it('blocks free tier at or over the monthly cap', async () => {
    const svc = createRunLimitService(dbWithCount(20))
    const result = await svc.canStartRun(COMPANY, 'free')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('monthly run limit')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @paperclipai/server exec vitest run src/services/run-limit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `server/src/services/run-limit.ts`:

```typescript
import { and, eq, gte, count } from 'drizzle-orm'
import { heartbeatRuns } from '@paperclipai/db'
import type { Db } from '@paperclipai/db'
import { FREE_TIER_MONTHLY_RUNS, type UserTier } from '@stockpilotai/feature-flags'

export interface RunLimitDecision {
  allowed: boolean
  reason?: string
  used?: number
  limit?: number
}

function startOfMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export interface RunLimitService {
  monthlyRunCount(companyId: string): Promise<number>
  canStartRun(companyId: string, tier: UserTier): Promise<RunLimitDecision>
}

export function createRunLimitService(db: Db): RunLimitService {
  return {
    async monthlyRunCount(companyId) {
      const rows = await db
        .select({ count: count() })
        .from(heartbeatRuns)
        .where(and(eq(heartbeatRuns.companyId, companyId), gte(heartbeatRuns.createdAt, startOfMonthUtc())))
      return Number(rows[0]?.count ?? 0)
    },

    async canStartRun(companyId, tier) {
      if (tier !== 'free') return { allowed: true }
      const used = await this.monthlyRunCount(companyId)
      if (used >= FREE_TIER_MONTHLY_RUNS) {
        return {
          allowed: false,
          reason: `Free tier monthly run limit reached (${FREE_TIER_MONTHLY_RUNS}). Upgrade or add your own API keys for unlimited runs.`,
          used,
          limit: FREE_TIER_MONTHLY_RUNS,
        }
      }
      return { allowed: true, used, limit: FREE_TIER_MONTHLY_RUNS }
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @paperclipai/server exec vitest run src/services/run-limit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/run-limit.ts server/src/services/run-limit.test.ts
git commit -m "feat: add monthly run-limit service for free tier"
```

---

### Task 4: Enforce run limit at scheduling time

**Files:**
- Modify: the run-scheduling entry point. First locate it:

- [ ] **Step 1: Find where runs are queued**

Run:
```bash
grep -rn "status: 'queued'\|status: \"queued\"\|insert(heartbeatRuns)\|enqueue" server/src/services/heartbeat.ts | head
```
Identify the function that inserts a `heartbeatRuns` row with status `queued` (the scheduling/enqueue point).

- [ ] **Step 2: Write a failing test for the guard**

Create `server/src/services/run-limit-guard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { assertRunAllowed } from './run-limit.js'

describe('assertRunAllowed', () => {
  it('throws RunLimitError when not allowed', () => {
    expect(() => assertRunAllowed({ allowed: false, reason: 'monthly run limit reached' }))
      .toThrowError(/monthly run limit/)
  })
  it('does nothing when allowed', () => {
    expect(() => assertRunAllowed({ allowed: true })).not.toThrow()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @paperclipai/server exec vitest run src/services/run-limit-guard.test.ts`
Expected: FAIL — `assertRunAllowed is not exported`.

- [ ] **Step 4: Add the guard + error to `run-limit.ts`**

Append to `server/src/services/run-limit.ts`:

```typescript
export class RunLimitError extends Error {
  readonly statusCode = 402 // Payment Required
  constructor(message: string) {
    super(message)
    this.name = 'RunLimitError'
  }
}

export function assertRunAllowed(decision: RunLimitDecision): void {
  if (!decision.allowed) {
    throw new RunLimitError(decision.reason ?? 'Run not allowed for the current plan tier')
  }
}
```

- [ ] **Step 5: Wire the guard into the enqueue path**

In the enqueue function found in Step 1, before inserting the `queued` row, add (using the services from Tasks 2–3, constructed once where the heartbeat service is initialized):

```typescript
// Tier + run-limit enforcement (no-op for selfhost/keys/subscription tiers)
const tier = await subscriptionService.tierForCompany(companyId)
assertRunAllowed(await runLimitService.canStartRun(companyId, tier))
```

Construct `subscriptionService`/`runLimitService` where the heartbeat service receives its `db` (pass `{ isCloudMode: config.isCloudMode }` to the subscription service). If the heartbeat service has no config access, thread `isCloudMode` through its constructor options.

- [ ] **Step 6: Map `RunLimitError` → HTTP 402**

In `server/src/middleware/` global error handler (find with `grep -rn "err.statusCode\|instanceof.*Error" server/src/middleware/*.ts | head`), ensure an error carrying `statusCode` returns that status. If the handler already honors `err.statusCode`, no change is needed; otherwise add:

```typescript
if (typeof (err as { statusCode?: number }).statusCode === 'number') {
  return res.status((err as { statusCode: number }).statusCode).json({ error: err.message })
}
```

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @paperclipai/server exec vitest run src/services/run-limit-guard.test.ts && pnpm --filter @paperclipai/server typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add server/src/services/run-limit.ts server/src/services/run-limit-guard.test.ts server/src/services/heartbeat.ts server/src/middleware
git commit -m "feat: enforce free-tier monthly run limit at scheduling time"
```

---

### Task 5: Enforce agent finance-role by tier

**Files:**
- Modify: `server/src/routes/agents.ts`
- Test: add to existing agents test or create `server/src/routes/agents-role-tier.test.ts`

- [ ] **Step 1: Locate the role assignment handler**

Run:
```bash
grep -n "role\|financeRole\|conditionType\|createAgent\|POST" server/src/routes/agents.ts | head -20
```
Find where an agent's finance role is set on create/update.

- [ ] **Step 2: Write a failing test**

Create `server/src/routes/agents-role-tier.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { assertRoleAllowedForTier } from './agents.js'

describe('assertRoleAllowedForTier', () => {
  it('allows news-sentinel on free tier', () => {
    expect(() => assertRoleAllowedForTier('news-sentinel', 'free')).not.toThrow()
  })
  it('blocks equity-analyst on free tier', () => {
    expect(() => assertRoleAllowedForTier('equity-analyst', 'free')).toThrowError(/upgrade/i)
  })
  it('allows any role on subscription tier', () => {
    expect(() => assertRoleAllowedForTier('equity-analyst', 'subscription')).not.toThrow()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @paperclipai/server exec vitest run src/routes/agents-role-tier.test.ts`
Expected: FAIL — `assertRoleAllowedForTier` not exported.

- [ ] **Step 4: Implement the guard and apply it**

Add to `server/src/routes/agents.ts` (export it for testing):

```typescript
import { canUseRole, type AgentRole, type UserTier } from '@stockpilotai/feature-flags'

export function assertRoleAllowedForTier(role: AgentRole, tier: UserTier): void {
  if (!canUseRole(role, tier)) {
    const err = new Error(`The "${role}" agent role requires a paid plan or your own API keys. Upgrade to unlock all roles.`) as Error & { statusCode?: number }
    err.statusCode = 403
    throw err
  }
}
```

In the create/update handler, when a finance `role` is provided, resolve the tier (inject `subscriptionService` into the agents router) and call `assertRoleAllowedForTier(role, await subscriptionService.tierForCompany(companyId))` before persisting. Only enforce when the provided role is one of `ALL_AGENT_ROLES` (ignore non-finance/legacy roles).

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @paperclipai/server exec vitest run src/routes/agents-role-tier.test.ts && pnpm --filter @paperclipai/server typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/agents.ts server/src/routes/agents-role-tier.test.ts
git commit -m "feat: gate finance agent roles by subscription tier"
```

---

### Task 6: API-key management (AI keys + data keys)

**Files:**
- Create: `server/src/routes/api-keys.ts`
- Create: `server/src/routes/api-keys.test.ts`
- Modify: `server/src/app.ts` (mount)

Stores two key types per company as named secrets via the existing secrets system. Setting a data key flips the company to the `keys` tier (cloud mode).

- [ ] **Step 1: Confirm the secrets service API**

Run:
```bash
grep -n "export function\|export class\|setSecret\|upsert\|createSecret" server/src/services/secrets*.ts server/src/secrets/*.ts | head
```
Use the same service the secrets router uses. The api-keys router wraps it with fixed key names: AI keys `ai.<provider>` (e.g. `ai.anthropic`), data keys `data.<provider>` (e.g. `data.alpha_vantage`).

- [ ] **Step 2: Write failing tests**

Create `server/src/routes/api-keys.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createApiKeysRouter } from './api-keys.js'

const COMPANY = '11111111-1111-1111-1111-111111111111'

const secrets = { setSecret: vi.fn(async () => ({ id: 's1' })), deleteSecretByName: vi.fn(async () => true), listKeyNames: vi.fn(async () => ['ai.anthropic']) }
const subscription = { setStatus: vi.fn(async () => {}), tierForCompany: vi.fn(async () => 'keys') }

function app() {
  const a = express()
  a.use(express.json())
  a.use((req, _res, next) => { (req as any).actor = { type: 'board', source: 'local_implicit' }; next() })
  a.use('/api/api-keys', createApiKeysRouter({ secrets: secrets as any, subscription: subscription as any, isCloudMode: true }))
  return a
}

describe('api-keys router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects unknown key kind', async () => {
    const res = await request(app()).post(`/api/api-keys/${COMPANY}`).send({ kind: 'bogus', provider: 'x', value: 'k' })
    expect(res.status).toBe(400)
  })

  it('stores an AI key', async () => {
    const res = await request(app()).post(`/api/api-keys/${COMPANY}`).send({ kind: 'ai', provider: 'anthropic', value: 'sk-test' })
    expect(res.status).toBe(201)
    expect(secrets.setSecret).toHaveBeenCalled()
  })

  it('storing a data key flips the company to keys tier in cloud mode', async () => {
    const res = await request(app()).post(`/api/api-keys/${COMPANY}`).send({ kind: 'data', provider: 'alpha_vantage', value: 'av-test' })
    expect(res.status).toBe(201)
    expect(subscription.setStatus).toHaveBeenCalledWith(COMPANY, 'keys')
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @paperclipai/server exec vitest run src/routes/api-keys.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the router**

Create `server/src/routes/api-keys.ts`:

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { assertAuthenticated, assertCompanyAccess } from './authz.js'

const AI_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const
const DATA_PROVIDERS = ['alpha_vantage', 'polygon'] as const

const setKeySchema = z.object({
  kind: z.enum(['ai', 'data']),
  provider: z.string().min(1),
  value: z.string().min(1).max(500),
})

interface ApiKeysDeps {
  secrets: { setSecret: (companyId: string, name: string, value: string) => Promise<unknown>; deleteSecretByName: (companyId: string, name: string) => Promise<boolean>; listKeyNames: (companyId: string) => Promise<string[]> }
  subscription: { setStatus: (companyId: string, status: 'keys') => Promise<void>; tierForCompany: (companyId: string) => Promise<string> }
  isCloudMode: boolean
}

function keyName(kind: 'ai' | 'data', provider: string): string {
  return `${kind}.${provider}`
}

export function createApiKeysRouter(deps: ApiKeysDeps): Router {
  const router = Router()
  router.use((req, res, next) => { try { assertAuthenticated(req); next() } catch (err) { next(err) } })

  // GET /api/api-keys/:companyId → names only (never values)
  router.get('/:companyId', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    const names = await deps.secrets.listKeyNames(companyId)
    return res.json({ keys: names.filter((n) => n.startsWith('ai.') || n.startsWith('data.')) })
  })

  // POST /api/api-keys/:companyId  body: { kind, provider, value }
  router.post('/:companyId', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    const parse = setKeySchema.safeParse(req.body)
    if (!parse.success) return res.status(400).json({ error: 'Invalid key payload' })
    const { kind, provider, value } = parse.data
    const valid = kind === 'ai' ? (AI_PROVIDERS as readonly string[]).includes(provider) : (DATA_PROVIDERS as readonly string[]).includes(provider)
    if (!valid) return res.status(400).json({ error: `Unknown ${kind} provider: ${provider}` })

    await deps.secrets.setSecret(companyId, keyName(kind, provider), value)
    if (kind === 'data' && deps.isCloudMode) {
      await deps.subscription.setStatus(companyId, 'keys')
    }
    return res.status(201).json({ ok: true })
  })

  // DELETE /api/api-keys/:companyId/:kind/:provider
  router.delete('/:companyId/:kind/:provider', async (req, res) => {
    const { companyId, kind, provider } = req.params
    assertCompanyAccess(req, companyId)
    if (kind !== 'ai' && kind !== 'data') return res.status(400).json({ error: 'Invalid kind' })
    const removed = await deps.secrets.deleteSecretByName(companyId, keyName(kind as 'ai' | 'data', provider))
    if (!removed) return res.status(404).json({ error: 'Key not found' })
    return res.status(204).send()
  })

  return router
}
```

> **Note for implementer:** The secrets service method names above (`setSecret`, `deleteSecretByName`, `listKeyNames`) are the *intended* interface. In Step 1 you confirmed the real method names — adapt the `ApiKeysDeps.secrets` shape and the construction in `app.ts` to the actual secrets service, adding thin wrapper functions if the real API differs. Do not bypass the secrets service with raw DB writes (keys must be encrypted).

- [ ] **Step 5: Mount in app.ts**

In `server/src/app.ts`, after the finance routers:

```typescript
import { createApiKeysRouter } from "./routes/api-keys.js";
// ... where db + services are available:
api.use('/api-keys', createApiKeysRouter({ secrets: apiKeySecretsAdapter, subscription: subscriptionService, isCloudMode: appConfig.isCloudMode }))
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @paperclipai/server exec vitest run src/routes/api-keys.test.ts && pnpm --filter @paperclipai/server typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/api-keys.ts server/src/routes/api-keys.test.ts server/src/app.ts
git commit -m "feat: add AI + data API-key management; data key sets keys tier"
```

---

### Task 7: Tier-aware market-data provider selection

**Files:**
- Modify: `server/src/routes/market.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/routes/market-tier.test.ts`

Make the market router resolve per-company keys + tier instead of using global config keys, and refuse Alpha Vantage/Polygon for the free tier.

- [ ] **Step 1: Write a failing test**

Create `server/src/routes/market-tier.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { selectProvidersForTier } from './market.js'

describe('selectProvidersForTier', () => {
  it('free tier gets yahoo only even if keys are present', () => {
    const cfg = selectProvidersForTier('free', { alphaVantageApiKey: 'av', polygonApiKey: 'pg' })
    expect(cfg).toEqual({})
  })
  it('keys/subscription/selfhost get the configured keys', () => {
    for (const tier of ['keys', 'subscription', 'selfhost'] as const) {
      expect(selectProvidersForTier(tier, { alphaVantageApiKey: 'av', polygonApiKey: 'pg' }))
        .toEqual({ alphaVantageApiKey: 'av', polygonApiKey: 'pg' })
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @paperclipai/server exec vitest run src/routes/market-tier.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement `selectProvidersForTier` and use per-request**

Add to `server/src/routes/market.ts`:

```typescript
import { canUseDataProvider, type UserTier } from '@stockpilotai/feature-flags'

export function selectProvidersForTier(
  tier: UserTier,
  keys: { alphaVantageApiKey?: string; polygonApiKey?: string },
): { alphaVantageApiKey?: string; polygonApiKey?: string } {
  const out: { alphaVantageApiKey?: string; polygonApiKey?: string } = {}
  if (keys.alphaVantageApiKey && canUseDataProvider('alpha-vantage', tier)) out.alphaVantageApiKey = keys.alphaVantageApiKey
  if (keys.polygonApiKey && canUseDataProvider('polygon', tier)) out.polygonApiKey = keys.polygonApiKey
  return out
}
```

Change `createMarketRouter` to accept a key/tier resolver instead of static keys: it receives `resolveKeys(companyId): Promise<{alphaVantageApiKey?, polygonApiKey?}>` (reads per-company data keys from the secrets service, falling back to global config keys in self-host) and `resolveTier(req): Promise<UserTier>`. For each request, build a `MarketDataClient` with `selectProvidersForTier(tier, keys)`. Cache clients per (companyId,tier) if desired, but correctness first.

- [ ] **Step 4: Update app.ts wiring**

In `server/src/app.ts`, pass the resolvers (self-host: tier is always `selfhost`, keys come from `appConfig`; cloud: tier from `subscriptionService.tierForCompany`, keys from the secrets service per company).

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @paperclipai/server exec vitest run src/routes/market-tier.test.ts && pnpm --filter @paperclipai/server typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/market.ts server/src/routes/market-tier.test.ts server/src/app.ts
git commit -m "feat: tier-aware market-data provider selection"
```

---

### Task 8: Stripe config + client

**Files:**
- Modify: `server/src/config.ts`
- Create: `server/src/services/stripe-client.ts`
- Add dep: `stripe`

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @paperclipai/server add stripe
```

- [ ] **Step 2: Add config fields**

In `server/src/config.ts`, add to the env reads near the other StockPilot vars:

```typescript
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || undefined
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || undefined
export const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || undefined
export const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173'
```

Add to the `Config` interface and the returned object:

```typescript
  stripeSecretKey: string | undefined;
  stripeWebhookSecret: string | undefined;
  stripePriceId: string | undefined;
  appBaseUrl: string;
```
```typescript
    stripeSecretKey: STRIPE_SECRET_KEY,
    stripeWebhookSecret: STRIPE_WEBHOOK_SECRET,
    stripePriceId: STRIPE_PRICE_ID,
    appBaseUrl: APP_BASE_URL,
```

- [ ] **Step 3: Implement the lazy client**

Create `server/src/services/stripe-client.ts`:

```typescript
import Stripe from 'stripe'

let cached: Stripe | null = null

export function getStripe(secretKey: string | undefined): Stripe {
  if (!secretKey) {
    const err = new Error('Stripe is not configured (STRIPE_SECRET_KEY missing)') as Error & { statusCode?: number }
    err.statusCode = 503
    throw err
  }
  if (!cached) {
    cached = new Stripe(secretKey, { apiVersion: '2024-06-20' })
  }
  return cached
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @paperclipai/server typecheck`
Expected: no errors. (If the SDK requires a different `apiVersion` literal, use the version the installed `stripe` types expect — read the error and set it.)

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/src/config.ts server/src/services/stripe-client.ts ../pnpm-lock.yaml
git commit -m "feat: add Stripe config and lazy client"
```

---

### Task 9: Billing routes (status, checkout, portal, webhook)

**Files:**
- Create: `server/src/routes/billing.ts`
- Create: `server/src/routes/billing.test.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write failing tests (status + webhook mapping)**

Create `server/src/routes/billing.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mapStripeStatusToSubscription } from './billing.js'

describe('mapStripeStatusToSubscription', () => {
  it('maps stripe statuses to internal subscription status', () => {
    expect(mapStripeStatusToSubscription('active')).toBe('active')
    expect(mapStripeStatusToSubscription('trialing')).toBe('active')
    expect(mapStripeStatusToSubscription('past_due')).toBe('past_due')
    expect(mapStripeStatusToSubscription('unpaid')).toBe('past_due')
    expect(mapStripeStatusToSubscription('canceled')).toBe('canceled')
    expect(mapStripeStatusToSubscription('incomplete_expired')).toBe('canceled')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @paperclipai/server exec vitest run src/routes/billing.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement the router**

Create `server/src/routes/billing.ts`:

```typescript
import { Router, raw } from 'express'
import type { SubscriptionStatus } from '@stockpilotai/feature-flags'
import { assertAuthenticated, assertCompanyAccess } from './authz.js'
import { getStripe } from '../services/stripe-client.js'
import { logger } from '../middleware/logger.js'
import type { SubscriptionService } from '../services/subscription.js'
import type { RunLimitService } from '../services/run-limit.js'

export function mapStripeStatusToSubscription(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    default:
      return null
  }
}

interface BillingDeps {
  subscription: SubscriptionService
  runLimit: RunLimitService
  config: { stripeSecretKey?: string; stripeWebhookSecret?: string; stripePriceId?: string; appBaseUrl: string; isCloudMode: boolean }
}

export function createBillingRouter(deps: BillingDeps): Router {
  const router = Router()

  // Stripe webhook FIRST — needs the raw body and no auth.
  router.post('/webhook', raw({ type: 'application/json' }), async (req, res) => {
    if (!deps.config.stripeWebhookSecret) return res.status(503).json({ error: 'Stripe webhook not configured' })
    const stripe = getStripe(deps.config.stripeSecretKey)
    const sig = req.headers['stripe-signature']
    let event
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig as string, deps.config.stripeWebhookSecret)
    } catch (err) {
      logger.warn({ err }, 'Stripe webhook signature verification failed')
      return res.status(400).json({ error: 'Invalid signature' })
    }
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as { id: string; status: string; customer: string; current_period_end?: number; metadata?: { companyId?: string } }
      const companyId = sub.metadata?.companyId
      if (companyId) {
        await deps.subscription.setStatus(companyId, mapStripeStatusToSubscription(sub.status), {
          stripeSubscriptionId: sub.id,
          stripeCustomerId: sub.customer,
          currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
        })
      }
    }
    return res.json({ received: true })
  })

  // Authenticated endpoints below.
  router.use((req, res, next) => { try { assertAuthenticated(req); next() } catch (err) { next(err) } })

  // GET /api/billing/:companyId/status → tier + usage
  router.get('/:companyId/status', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    const tier = await deps.subscription.tierForCompany(companyId)
    const used = await deps.runLimit.monthlyRunCount(companyId)
    const row = await deps.subscription.getForCompany(companyId)
    return res.json({
      tier,
      isCloudMode: deps.config.isCloudMode,
      monthlyRunsUsed: used,
      status: row?.status ?? 'free',
      currentPeriodEnd: row?.currentPeriodEnd ?? null,
    })
  })

  // POST /api/billing/:companyId/checkout → Stripe Checkout session URL
  router.post('/:companyId/checkout', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    if (!deps.config.isCloudMode) return res.status(400).json({ error: 'Billing is only available in cloud mode' })
    if (!deps.config.stripePriceId) return res.status(503).json({ error: 'Stripe price not configured' })
    const stripe = getStripe(deps.config.stripeSecretKey)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: deps.config.stripePriceId, quantity: 1 }],
      success_url: `${deps.config.appBaseUrl}/billing?status=success`,
      cancel_url: `${deps.config.appBaseUrl}/billing?status=cancel`,
      subscription_data: { metadata: { companyId } },
      metadata: { companyId },
    })
    return res.json({ url: session.url })
  })

  // POST /api/billing/:companyId/portal → Stripe Customer Portal URL
  router.post('/:companyId/portal', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    if (!deps.config.isCloudMode) return res.status(400).json({ error: 'Billing is only available in cloud mode' })
    const row = await deps.subscription.getForCompany(companyId)
    if (!row?.stripeCustomerId) return res.status(404).json({ error: 'No Stripe customer for this workspace' })
    const stripe = getStripe(deps.config.stripeSecretKey)
    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: `${deps.config.appBaseUrl}/billing`,
    })
    return res.json({ url: session.url })
  })

  return router
}
```

> **Webhook body note:** The webhook needs the raw body. Mount the billing router BEFORE any global `express.json()` body parser, OR ensure the `/webhook` route's `raw()` runs before JSON parsing. In `app.ts`, mount `createBillingRouter(...)` such that `/api/billing/webhook` is not pre-parsed as JSON (e.g. mount the webhook handler before the global JSON middleware, or exclude that path). Verify in Step 5.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @paperclipai/server exec vitest run src/routes/billing.test.ts`
Expected: PASS (mapping test).

- [ ] **Step 5: Mount in app.ts (raw body for webhook)**

In `server/src/app.ts`, find the global JSON parser (`grep -n "express.json()" server/src/app.ts`). Mount billing so the webhook path keeps a raw body — mount the billing router before the JSON parser, or add `app.use('/api/billing/webhook', express.raw({ type: 'application/json' }))` before the JSON parser and mount the rest normally. Then:

```typescript
import { createBillingRouter } from "./routes/billing.js";
api.use('/billing', createBillingRouter({ subscription: subscriptionService, runLimit: runLimitService, config: { stripeSecretKey: appConfig.stripeSecretKey, stripeWebhookSecret: appConfig.stripeWebhookSecret, stripePriceId: appConfig.stripePriceId, appBaseUrl: appConfig.appBaseUrl, isCloudMode: appConfig.isCloudMode } }))
```

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @paperclipai/server typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/billing.ts server/src/routes/billing.test.ts server/src/app.ts
git commit -m "feat: add Stripe billing routes (status, checkout, portal, webhook)"
```

---

### Task 10: Frontend — billing API client, query keys, route root

**Files:**
- Create: `ui/src/api/billing.ts`
- Create: `ui/src/api/apiKeys.ts`
- Modify: `ui/src/lib/queryKeys.ts`
- Modify: `ui/src/lib/company-routes.ts`

- [ ] **Step 1: Create billing API client**

Create `ui/src/api/billing.ts`:

```typescript
import { api } from "./client";

export interface BillingStatus {
  tier: 'selfhost' | 'free' | 'keys' | 'subscription'
  isCloudMode: boolean
  monthlyRunsUsed: number
  status: string
  currentPeriodEnd: string | null
}

export const billingApi = {
  status: (companyId: string) => api.get<BillingStatus>(`/billing/${encodeURIComponent(companyId)}/status`),
  checkout: (companyId: string) => api.post<{ url: string }>(`/billing/${encodeURIComponent(companyId)}/checkout`, {}),
  portal: (companyId: string) => api.post<{ url: string }>(`/billing/${encodeURIComponent(companyId)}/portal`, {}),
};
```

- [ ] **Step 2: Create api-keys client**

Create `ui/src/api/apiKeys.ts`:

```typescript
import { api } from "./client";

export interface ApiKeysList { keys: string[] }

export const apiKeysApi = {
  list: (companyId: string) => api.get<ApiKeysList>(`/api-keys/${encodeURIComponent(companyId)}`),
  set: (companyId: string, kind: 'ai' | 'data', provider: string, value: string) =>
    api.post<{ ok: true }>(`/api-keys/${encodeURIComponent(companyId)}`, { kind, provider, value }),
  remove: (companyId: string, kind: 'ai' | 'data', provider: string) =>
    api.delete<void>(`/api-keys/${encodeURIComponent(companyId)}/${kind}/${encodeURIComponent(provider)}`),
};
```

- [ ] **Step 3: Add query keys**

In `ui/src/lib/queryKeys.ts`, add before the closing `};`:

```typescript
  billing: { status: (companyId: string) => ["billing", "status", companyId] as const },
  apiKeys: { list: (companyId: string) => ["api-keys", companyId] as const },
```

- [ ] **Step 4: Register the route root**

In `ui/src/lib/company-routes.ts`, add `"billing"` to the `BOARD_ROUTE_ROOTS` set (so `/billing` resolves to `/:prefix/billing`).

- [ ] **Step 5: Add a regression test for the route root**

In `ui/src/lib/company-routes.test.ts`, extend the finance-routes test loop to include `"billing"` (it must resolve like the others).

- [ ] **Step 6: Typecheck + run route tests**

Run: `pnpm --filter @paperclipai/ui typecheck && pnpm --filter @paperclipai/ui exec vitest run src/lib/company-routes.test.ts`
Expected: no type errors; route tests pass.

- [ ] **Step 7: Commit**

```bash
git add ui/src/api/billing.ts ui/src/api/apiKeys.ts ui/src/lib/queryKeys.ts ui/src/lib/company-routes.ts ui/src/lib/company-routes.test.ts
git commit -m "feat: add billing + api-keys clients, query keys, billing route root"
```

---

### Task 11: Billing page + sidebar nav (cloud mode only)

**Files:**
- Create: `ui/src/pages/Billing.tsx`
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/components/Sidebar.tsx`

- [ ] **Step 1: Implement the Billing page**

Create `ui/src/pages/Billing.tsx`:

```tsx
import { useEffect } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { CreditCard, KeyRound, Zap } from "lucide-react"
import { useCompany } from "../context/CompanyContext"
import { useBreadcrumbs } from "../context/BreadcrumbContext"
import { queryKeys } from "../lib/queryKeys"
import { billingApi } from "../api/billing"
import { Button } from "@/components/ui/button"
import { EmptyState } from "../components/EmptyState"
import { PageSkeleton } from "../components/PageSkeleton"

const TIER_LABEL: Record<string, string> = {
  selfhost: "Self-hosted (all features)",
  free: "Free",
  keys: "Bring your own keys",
  subscription: "Subscription",
}

export function Billing() {
  const { selectedCompanyId } = useCompany()
  const { setBreadcrumbs } = useBreadcrumbs()

  useEffect(() => { setBreadcrumbs([{ label: "Billing" }]) }, [setBreadcrumbs])

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.billing.status(selectedCompanyId!),
    queryFn: () => billingApi.status(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  })

  const checkout = useMutation({
    mutationFn: () => billingApi.checkout(selectedCompanyId!),
    onSuccess: ({ url }) => { if (url) window.location.href = url },
  })
  const portal = useMutation({
    mutationFn: () => billingApi.portal(selectedCompanyId!),
    onSuccess: ({ url }) => { if (url) window.location.href = url },
  })

  if (!selectedCompanyId) return <EmptyState icon={CreditCard} message="Select a workspace to manage billing." />
  if (isLoading) return <PageSkeleton />
  if (!data) return <EmptyState icon={CreditCard} message="Billing is unavailable." />

  if (!data.isCloudMode) {
    return (
      <div className="space-y-6 p-6">
        <div><h1 className="text-xl font-semibold">Billing</h1></div>
        <EmptyState icon={Zap} message="You're self-hosting — all features are unlocked and there's nothing to pay. Add your own AI and data API keys under settings." />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your plan and usage</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Current plan</span>
          <span className="text-sm font-medium">{TIER_LABEL[data.tier] ?? data.tier}</span>
        </div>
        {data.tier === "free" && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Runs this month</span>
            <span className="text-sm tabular-nums">{data.monthlyRunsUsed} / 20</span>
          </div>
        )}
        {data.currentPeriodEnd && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Renews</span>
            <span className="text-sm">{new Date(data.currentPeriodEnd).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {data.tier === "subscription" ? (
          <Button onClick={() => portal.mutate()} disabled={portal.isPending}>
            <CreditCard className="h-4 w-4 mr-1.5" /> Manage subscription
          </Button>
        ) : (
          <Button onClick={() => checkout.mutate()} disabled={checkout.isPending}>
            <Zap className="h-4 w-4 mr-1.5" /> Upgrade to Subscription
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <KeyRound className="h-3.5 w-3.5" /> Prefer to pay nothing? Add your own AI and data API keys to unlock all roles and unlimited runs.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Add the route**

In `ui/src/App.tsx`, import `Billing` and add inside `boardRoutes()` before the catch-all:

```tsx
import { Billing } from "./pages/Billing";
// ...
<Route path="billing" element={<Billing />} />
```

- [ ] **Step 3: Add sidebar nav (cloud mode aware)**

In `ui/src/components/Sidebar.tsx`, add `CreditCard` to the lucide imports and a Billing item to the Finance section. Gate it on cloud mode: fetch billing status (or read a mode flag from the existing health/experimental query) and only render the Billing nav item when `isCloudMode` is true. Minimal approach — always render it; the page itself shows the self-host message. Prefer gating if a mode flag is readily available from an existing query.

```tsx
<SidebarNavItem to="/billing" label="Billing" icon={CreditCard} />
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @paperclipai/ui typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/Billing.tsx ui/src/App.tsx ui/src/components/Sidebar.tsx
git commit -m "feat: add Billing page and sidebar nav"
```

---

### Task 12: Docs + manual verification

**Files:**
- Modify: `docs/stockpilot/ROADMAP.md`
- Modify: `.env.example` (or `docs/.../env` reference) if present

- [ ] **Step 1: Document new env vars**

Add to the env reference (find with `ls .env.example server/.env.example 2>/dev/null`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `APP_BASE_URL`. If no example file exists, add a "Stripe (cloud mode)" subsection to `docs/stockpilot/ROADMAP.md` §4.

- [ ] **Step 2: Manual smoke test (self-host)**

```bash
pnpm dev
```
- Visit `/billing` → shows the self-host "all features unlocked" message.
- Confirm market quotes still work and agents/roles are unrestricted (selfhost tier).

- [ ] **Step 3: Update the roadmap**

In `docs/stockpilot/ROADMAP.md`: move Plan 5 to ✅ Done in the plan table; update the feature diff (Stripe billing, tier enforcement, API-key management now built); note any deferrals (e.g. cloud-mode end-to-end Stripe test requires real keys / Plan 6 deploy). Update "Last updated".

- [ ] **Step 4: Commit**

```bash
git add docs/stockpilot/ROADMAP.md .env.example
git commit -m "docs: document Stripe env vars and mark Plan 5 complete"
```

---

## Self-Review

### Spec coverage (design spec §5 + §8)
- ✅ Two key types (AI keys + data keys) — Task 6.
- ✅ Tiers: free / bring-your-own-keys / subscription — Tasks 2, 6, 9; selfhost always unlocked.
- ✅ Free tier: Yahoo only (Task 7), News Sentinel only (Task 5), ~20 runs/mo (Tasks 3–4).
- ✅ Bring-your-own-keys: all roles, unlimited runs, no charge — data key → `keys` tier (Task 6) bypasses run limit (Task 3) and unlocks providers (Task 7) and roles (Task 5).
- ✅ Subscription (Stripe): checkout, portal, webhook status sync — Tasks 8–9.
- ✅ Feature-flag gating per mode/tier — Task 1 + enforcement tasks; Stripe UI cloud-only (Task 11).
- ⚠️ Onboarding **wizard** (step-by-step key connection) — Task 6 provides the API + the Billing page hints at it, but a dedicated multi-step wizard UI is a follow-up (note in roadmap; not blocking).

### Placeholder scan
No "TBD"/"add error handling"-style placeholders. Two intentional "implementer: confirm the real method name" notes (secrets service in Task 6; enqueue point in Task 4; JSON-parser mount in Task 9) — these are explicit *lookups with a documented fallback*, not vague placeholders, because the exact private method/line is environment-specific.

### Type consistency
- `UserTier` (`selfhost|free|keys|subscription`) and `SubscriptionStatus` (`active|keys|past_due|canceled|null`) are used consistently from `@stockpilotai/feature-flags` across Tasks 1–11.
- `SubscriptionService` / `RunLimitService` interfaces defined in Tasks 2–3 are the same shapes injected in Tasks 4, 5, 9.
- `selectProvidersForTier` (Task 7) and `canUseDataProvider` (Task 1) agree on provider names (`alpha-vantage`, `polygon`, `yahoo-finance`).
