# Per-Company Data-Key Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Market requests use a cloud company's own `data.alpha_vantage`/`data.polygon` keys (fallback to global config), instead of global keys only.

**Architecture:** A pure `createMarketKeyResolver` (unit-tested) injected with a `readCompanyKey` (secrets) + `resolveCompanyId`; wired into `app.ts` by moving `secretService` creation above the market router.

**Tech Stack:** Express 5, Drizzle, Vitest, existing `secretService` (`getByName` + `resolveSecretValue`), `selectProvidersForTier`.

**Spec:** `docs/superpowers/specs/2026-06-03-per-company-data-keys-design.md`

---

### Task 1: Pure resolver + tests

**Files:**
- Create: `server/src/services/market-key-resolver.ts`
- Test: `server/src/services/__tests__/market-key-resolver.test.ts`

- [ ] **Step 1: Failing test**

Create `server/src/services/__tests__/market-key-resolver.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createMarketKeyResolver } from "../market-key-resolver.js";

const global = { alphaVantageApiKey: "GAV", polygonApiKey: "GPOLY" };
const reqWith = (companyId?: string) => ({ actor: { companyId } }) as any;

describe("createMarketKeyResolver", () => {
  it("self-host returns global keys and never reads company secrets", async () => {
    const readCompanyKey = vi.fn();
    const resolve = createMarketKeyResolver({ isCloudMode: false, globalKeys: global, readCompanyKey, resolveCompanyId: () => "c1" });
    expect(await resolve(reqWith("c1"))).toEqual(global);
    expect(readCompanyKey).not.toHaveBeenCalled();
  });

  it("cloud with no company returns empty keys", async () => {
    const resolve = createMarketKeyResolver({ isCloudMode: true, globalKeys: global, readCompanyKey: vi.fn(), resolveCompanyId: () => undefined });
    expect(await resolve(reqWith(undefined))).toEqual({});
  });

  it("cloud uses company key for polygon and falls back to global for alpha_vantage", async () => {
    const readCompanyKey = vi.fn(async (_c: string, name: string) => (name === "data.polygon" ? "CPOLY" : null));
    const resolve = createMarketKeyResolver({ isCloudMode: true, globalKeys: global, readCompanyKey, resolveCompanyId: () => "c1" });
    expect(await resolve(reqWith("c1"))).toEqual({ alphaVantageApiKey: "GAV", polygonApiKey: "CPOLY" });
  });

  it("cloud: a read error falls back to global without throwing", async () => {
    const readCompanyKey = vi.fn(async () => { throw new Error("boom"); });
    const resolve = createMarketKeyResolver({ isCloudMode: true, globalKeys: global, readCompanyKey, resolveCompanyId: () => "c1" });
    expect(await resolve(reqWith("c1"))).toEqual(global);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm --filter @paperclipai/server exec vitest run src/services/__tests__/market-key-resolver.test.ts` → FAIL.

- [ ] **Step 3: Implement**

Create `server/src/services/market-key-resolver.ts`:
```ts
export interface MarketKeys {
  alphaVantageApiKey?: string;
  polygonApiKey?: string;
}

export interface MarketKeyResolverDeps {
  isCloudMode: boolean;
  globalKeys: MarketKeys;
  readCompanyKey: (companyId: string, name: string) => Promise<string | null>;
  resolveCompanyId: (req: { actor: any }) => string | undefined;
}

export function createMarketKeyResolver(deps: MarketKeyResolverDeps) {
  return async function resolveKeys(req: { actor: any }): Promise<MarketKeys> {
    if (!deps.isCloudMode) return { ...deps.globalKeys };
    const companyId = deps.resolveCompanyId(req);
    if (!companyId) return {};

    async function readOrNull(name: string): Promise<string | null> {
      try {
        return await deps.readCompanyKey(companyId!, name);
      } catch {
        return null;
      }
    }

    const [av, poly] = await Promise.all([
      readOrNull("data.alpha_vantage"),
      readOrNull("data.polygon"),
    ]);
    return {
      alphaVantageApiKey: av ?? deps.globalKeys.alphaVantageApiKey,
      polygonApiKey: poly ?? deps.globalKeys.polygonApiKey,
    };
  };
}
```

- [ ] **Step 4: Run, verify PASS (4 tests)**

Run: `pnpm --filter @paperclipai/server exec vitest run src/services/__tests__/market-key-resolver.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/market-key-resolver.ts server/src/services/__tests__/market-key-resolver.test.ts
git commit -m "feat(market): per-company data-key resolver (pure, tested)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Wire into app.ts

**Files:**
- Modify: `server/src/app.ts`

- [ ] **Step 1: Read the current wiring**

READ `server/src/app.ts` around lines 324–410. Note: the market router is registered at ~326 with inline `resolveTier` (which computes a companyId from `req.actor.companyId ?? companyIds?.[0]`) and an inline `resolveKeys` (global keys + `TODO(plan5)`). `const secrets = secretService(db)` is created LATER (~366). `appConfig.alphaVantageApiKey`/`polygonApiKey` hold the global keys.

- [ ] **Step 2: Reorder + wire**

1. Move the `const secrets = secretService(db);` creation (line ~366) to BEFORE the `api.use('/market', ...)` registration. (Only move the `secretService(db)` line; the `apiKeySecretsAdapter` object can stay where it is as long as it still has `secrets` in scope — verify nothing else breaks ordering.)
2. Add a `readCompanyKey` helper near it:
```ts
    const readCompanyKey = async (companyId: string, name: string): Promise<string | null> => {
      try {
        const secret = await secrets.getByName(companyId, name);
        if (!secret) return null;
        const value = await secrets.resolveSecretValue(companyId, secret.id);
        return value ?? null;
      } catch (err) {
        logger.debug({ err, companyId, name }, "per-company market key read failed; falling back to global");
        return null;
      }
    };
```
> Confirm the exact signature of `secrets.resolveSecretValue` by reading `server/src/services/secrets.ts` (the returned `resolveSecretValue`). It is `resolveSecretValue(companyId, secretId, version?, context?)` returning the plaintext string. Pass only what's required; adjust if the signature differs.
3. Extract the company-id heuristic into a shared local function so `resolveTier` and the key resolver agree:
```ts
    const resolveMarketCompanyId = (req: { actor: any }): string | undefined => {
      const companyIds = Array.isArray(req.actor.companyIds) ? req.actor.companyIds : undefined;
      return req.actor.companyId ?? companyIds?.[0];
    };
```
   Use `resolveMarketCompanyId(req)` inside the existing `resolveTier` (replacing the inline duplicate), preserving its existing multi-membership debug log.
4. Replace the inline `resolveKeys` with:
```ts
    resolveKeys: createMarketKeyResolver({
      isCloudMode: appConfig.isCloudMode,
      globalKeys: {
        alphaVantageApiKey: appConfig.alphaVantageApiKey,
        polygonApiKey: appConfig.polygonApiKey,
      },
      readCompanyKey,
      resolveCompanyId: resolveMarketCompanyId,
    }),
```
   and DELETE the `TODO(plan5)` comment block.
5. Add the import at the top of `app.ts`:
```ts
import { createMarketKeyResolver } from "./services/market-key-resolver.js";
```

- [ ] **Step 3: Build**

Run: `pnpm --filter "@paperclipai/server..." build`
Expected: PASS; `server/dist/index.js` produced. Fix any ordering/type errors you introduced.

- [ ] **Step 4: Run existing market tests (no regression)**

Run: `pnpm --filter @paperclipai/server exec vitest run src/routes 2>&1 | tail -15` (or specifically any `market*.test.ts`). Expected: still PASS. If a market test asserted the old global-only behavior, update it ONLY if the spec change requires it (note what you changed).

- [ ] **Step 5: Commit**

```bash
git add server/src/app.ts
git commit -m "feat(market): resolve per-company data keys in market router wiring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Verify + roadmap

**Files:** Modify `docs/stockpilot/ROADMAP.md`

- [ ] **Step 1:** Run `pnpm --filter @paperclipai/server exec vitest run src/services/__tests__/market-key-resolver.test.ts && pnpm --filter "@paperclipai/server..." build` → PASS.
- [ ] **Step 2:** In ROADMAP §7b mark item 5 ✅ done; in §3 "Not built yet", remove/replace the per-company data-key resolution bullet (the `TODO(plan5)` is resolved).
- [ ] **Step 3:** Commit:
```bash
git add docs/stockpilot/ROADMAP.md
git commit -m "docs: mark per-company data-key resolution done (queue item #5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review notes
- **Spec coverage:** resolver behavior (Task 1: self-host/no-company/fallback/error cases), wiring + reorder + shared company-id heuristic + remove TODO (Task 2), verify+docs (Task 3). Covered.
- **Consistency:** `createMarketKeyResolver(deps)` signature identical across Task 1 def/test and Task 2 usage. Secret names `data.alpha_vantage`/`data.polygon` match the api-keys route. `resolveSecretValue` signature flagged for confirmation against `secrets.ts`.
- **Risk:** moving `secretService(db)` earlier — implementer must verify nothing else depends on its original position; build + tests are the guard.
