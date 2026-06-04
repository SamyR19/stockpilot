# Per-Company Data-Key Resolution — Design Spec

**Date:** 2026-06-03 · **Status:** Approved (defaults) · **Queue item:** #5 of 8

## Problem
`server/src/app.ts` wires the market router's `resolveKeys` to **global config keys only**, with a `TODO(plan5)` to use each company's own stored data keys once a secret read-path existed. It now exists (`secretService.getByName` + `resolveSecretValue`). Implement per-company resolution so a cloud company that brought its own Alpha Vantage / Polygon key actually uses it for market data.

## Behavior
`resolveKeys(req)` returns `{ alphaVantageApiKey?, polygonApiKey? }`:
- **Self-host** (`!isCloudMode`): return the **global config keys** unchanged (no per-company lookup).
- **Cloud, no resolvable company**: return `{}` (free/Yahoo only — unchanged).
- **Cloud, with company**: read the company's secrets `data.alpha_vantage` and `data.polygon`; for each, use the company value if present, else fall back to the global config value. Return the merged keys.
- Tier gating is unchanged and still authoritative: `selectProvidersForTier(tier, keys)` already drops keys for the `free` tier, so resolving keys here is safe (a free company's keys are ignored downstream). A cloud company that saved a data key is already on the `keys` tier (set by the api-keys route).
- Secret-read failure for a key → treat as absent (fall back to global), log at debug; never throw out of `resolveKeys`.

## Design (isolated + testable)
New `server/src/services/market-key-resolver.ts`:
```ts
export interface MarketKeyResolverDeps {
  isCloudMode: boolean;
  globalKeys: { alphaVantageApiKey?: string; polygonApiKey?: string };
  // read a company secret's plaintext value by name, or null if absent/unreadable
  readCompanyKey: (companyId: string, name: string) => Promise<string | null>;
  // resolve the caller's companyId from the request actor (same heuristic as resolveTier)
  resolveCompanyId: (req: { actor: any }) => string | undefined;
}
export function createMarketKeyResolver(deps): (req) => Promise<{ alphaVantageApiKey?: string; polygonApiKey?: string }>;
```
- The function is pure over its injected `readCompanyKey`/`resolveCompanyId`, so it unit-tests without DB/secrets.

In `app.ts`:
- Move the `secretService(db)` creation (and a small `readCompanyKey` helper that does `getByName` → `resolveSecretValue`, returning null on miss/error) **above** the market-router registration.
- Build `resolveKeys` via `createMarketKeyResolver({ isCloudMode, globalKeys: { alphaVantageApiKey: appConfig.alphaVantageApiKey, polygonApiKey: appConfig.polygonApiKey }, readCompanyKey, resolveCompanyId })` and pass it to `createMarketRouter`.
- Reuse/extract the existing company-id heuristic from `resolveTier` into `resolveCompanyId` so both stay consistent (do not duplicate divergent logic).
- Remove the `TODO(plan5)` comment.

## Secret key names
Match the api-keys route: `data.alpha_vantage`, `data.polygon` (the keys saved by the BYO-keys wizard / api-keys API).

## Out of scope
- Per-company **AI** key resolution into agent runs (separate concern; this is market data only).
- Caching of resolved secrets beyond the market router's existing per-provider-signature `clientCache` (the cache key already incorporates the resolved key values).

## Testing
`market-key-resolver.test.ts`:
- self-host → returns global keys, never calls `readCompanyKey`.
- cloud, no company → `{}`.
- cloud, company with `data.polygon` only → polygon = company value, alphaVantage = global fallback.
- cloud, company key read throws → falls back to global, no throw.
Plus: `pnpm --filter "@paperclipai/server..." build` passes; existing market route tests still green.

## Success criteria
A cloud company with its own Polygon/Alpha Vantage key has its market requests use that key; companies without one fall back to global config; self-host is unchanged; tier gating intact.
