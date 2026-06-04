# Bring-Your-Own-Keys Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** A guided 3-step dialog to connect an AI key (required) and optional market-data key, built on the existing `apiKeysApi`.

**Architecture:** Pure provider-metadata module (unit-tested) + an `ApiKeysWizard` dialog composing `apiKeysApi.list/set`, opened from a button on `CompanySettings.tsx`. No backend changes.

**Tech Stack:** React 19 + Vite, React Query v5, shadcn/ui, `ui/src/api/apiKeys.ts`.

**Spec:** `docs/superpowers/specs/2026-06-03-byok-wizard-design.md`

---

### Task 1: Provider metadata module + tests

**Files:**
- Create: `ui/src/lib/apiKeyProviders.ts`
- Test: `ui/src/lib/apiKeyProviders.test.ts`

- [ ] **Step 1: Failing test**

Create `ui/src/lib/apiKeyProviders.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { AI_KEY_PROVIDERS, DATA_KEY_PROVIDERS, isConnected } from "./apiKeyProviders";

describe("apiKeyProviders", () => {
  it("AI providers cover anthropic/openai/gemini", () => {
    expect(AI_KEY_PROVIDERS.map((p) => p.provider).sort()).toEqual(["anthropic", "gemini", "openai"]);
    expect(AI_KEY_PROVIDERS.every((p) => p.kind === "ai" && p.label && p.helpUrl)).toBe(true);
  });
  it("DATA providers cover alpha_vantage/polygon", () => {
    expect(DATA_KEY_PROVIDERS.map((p) => p.provider).sort()).toEqual(["alpha_vantage", "polygon"]);
    expect(DATA_KEY_PROVIDERS.every((p) => p.kind === "data")).toBe(true);
  });
  it("isConnected matches `${kind}.${provider}` names", () => {
    const keys = ["ai.anthropic", "data.polygon"];
    expect(isConnected(keys, "ai", "anthropic")).toBe(true);
    expect(isConnected(keys, "ai", "openai")).toBe(false);
    expect(isConnected(keys, "data", "polygon")).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm --filter @paperclipai/ui exec vitest run src/lib/apiKeyProviders.test.ts` → FAIL.

- [ ] **Step 3: Implement**

Create `ui/src/lib/apiKeyProviders.ts`:
```ts
export type KeyKind = "ai" | "data";
export interface KeyProviderMeta {
  kind: KeyKind;
  provider: string;
  label: string;
  helpUrl: string;
  placeholder: string;
}

export const AI_KEY_PROVIDERS: KeyProviderMeta[] = [
  { kind: "ai", provider: "anthropic", label: "Anthropic (Claude)", helpUrl: "https://console.anthropic.com/settings/keys", placeholder: "sk-ant-..." },
  { kind: "ai", provider: "openai", label: "OpenAI", helpUrl: "https://platform.openai.com/api-keys", placeholder: "sk-..." },
  { kind: "ai", provider: "gemini", label: "Google Gemini", helpUrl: "https://aistudio.google.com/app/apikey", placeholder: "AIza..." },
];

export const DATA_KEY_PROVIDERS: KeyProviderMeta[] = [
  { kind: "data", provider: "alpha_vantage", label: "Alpha Vantage", helpUrl: "https://www.alphavantage.co/support/#api-key", placeholder: "Your Alpha Vantage key" },
  { kind: "data", provider: "polygon", label: "Polygon.io", helpUrl: "https://polygon.io/dashboard/api-keys", placeholder: "Your Polygon key" },
];

export function isConnected(keys: string[], kind: KeyKind, provider: string): boolean {
  return keys.includes(`${kind}.${provider}`);
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm --filter @paperclipai/ui exec vitest run src/lib/apiKeyProviders.test.ts` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add ui/src/lib/apiKeyProviders.ts ui/src/lib/apiKeyProviders.test.ts
git commit -m "feat(keys): API key provider metadata + isConnected helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Wizard dialog + entry button

**Files:**
- Create: `ui/src/components/ApiKeysWizard.tsx`
- Modify: `ui/src/pages/CompanySettings.tsx`
- Modify (if needed): `ui/src/lib/queryKeys.ts`

- [ ] **Step 1: Learn the patterns**

READ `ui/src/api/apiKeys.ts` (already: `apiKeysApi.list/set/remove`), `ui/src/lib/queryKeys.ts` (check for an `apiKeys` key group; if absent add `apiKeys: { list: (companyId: string) => ["apiKeys", companyId] as const }`), `ui/src/context/ToastContext` (`useToastActions` → `pushToast({ title, body, tone })`), and an existing multi-step component `ui/src/components/OnboardingWizard.tsx` for step/dialog conventions. READ `ui/src/pages/CompanySettings.tsx` to find where to add a "Connect API keys" button and how it gets `companyId`.

- [ ] **Step 2: Build `ui/src/components/ApiKeysWizard.tsx`**

Requirements:
- Props `{ open: boolean; onOpenChange: (v: boolean) => void; companyId: string; onDone?: () => void }`.
- `const keysQuery = useQuery({ queryKey: queryKeys.apiKeys.list(companyId), queryFn: () => apiKeysApi.list(companyId), enabled: open })`. Treat `keysQuery.data?.keys ?? []` as the connected names.
- Local `step` state: `1 | 2 | 3`. Local `aiProvider`, `aiValue`, `dataProvider`, `dataValue`, `saving`.
- **Step 1 (AI, required):** render `AI_KEY_PROVIDERS` as selectable options; for the chosen one show a `type="password"` Input with its `placeholder`, and a "Get a key →" link to `helpUrl` (`target="_blank" rel="noreferrer"`). Show ✓ "Connected" for any provider already in keys (via `isConnected`). Buttons: "Save & continue" (calls save then `setStep(2)`); if an AI key already exists, also allow "Skip" → `setStep(2)`. Disable Save while `saving` or empty value.
- **Step 2 (data, optional):** same pattern for `DATA_KEY_PROVIDERS`, with copy: "Optional — connect a market-data key for higher-quality, unthrottled data." Buttons: "Save & continue" and "Skip". Both go to step 3.
- **Step 3 (done):** refetch/`invalidate` then list the connected keys (kind + provider labels), a "Finish" button → `onDone?.(); onOpenChange(false)`.
- Save helper:
```ts
async function saveKey(kind: "ai" | "data", provider: string, value: string) {
  setSaving(true);
  try {
    await apiKeysApi.set(companyId, kind, provider, value);
    await queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.list(companyId) });
    // if a subscription/tier query exists, invalidate it too (saving a data key can change tier)
    pushToast({ title: "Key saved", tone: "success" });
    return true;
  } catch {
    pushToast({ title: "Couldn't save key", body: "Check the key and try again.", tone: "error" });
    return false;
  } finally {
    setSaving(false);
  }
}
```
(Advance step only when `saveKey` returns true.) NEVER render stored key values — the list returns names only; inputs are `type="password"`.
- Use `@/components/ui/dialog`, `Button`, `Input` and match `OnboardingWizard.tsx` styling. Adjust `pushToast` arg shape to the real `useToastActions` signature.

- [ ] **Step 3: Add entry button to `CompanySettings.tsx`**

- `const [keysWizardOpen, setKeysWizardOpen] = useState(false)`.
- Add a "Connect API keys" `Button` in a sensible settings section.
- Render `<ApiKeysWizard open={keysWizardOpen} onOpenChange={setKeysWizardOpen} companyId={<the page's companyId>} />`.

- [ ] **Step 4: Build**

Run: `pnpm --filter @paperclipai/ui build` → PASS. Fix type errors (toast signature, queryKeys typing).

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/ApiKeysWizard.tsx ui/src/pages/CompanySettings.tsx ui/src/lib/queryKeys.ts
git commit -m "feat(keys): bring-your-own-keys onboarding wizard dialog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Verify + roadmap

**Files:** Modify `docs/stockpilot/ROADMAP.md`

- [ ] **Step 1:** Run `pnpm --filter @paperclipai/ui exec vitest run src/lib/apiKeyProviders.test.ts && pnpm --filter @paperclipai/ui build` → PASS.
- [ ] **Step 2:** In ROADMAP §7b mark item 3 ✅ done (BYO-keys wizard: provider metadata + `ApiKeysWizard` dialog from CompanySettings). Note follow-ups: auto-launch on first login, "test key" validation.
- [ ] **Step 3:** Commit:
```bash
git add docs/stockpilot/ROADMAP.md
git commit -m "docs: mark BYO-keys wizard done (queue item #3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review notes
- **Spec coverage:** provider metadata (Task 1), wizard 3 steps + save/invalidate/security (Task 2), entry point (Task 2 step 3), verify+docs (Task 3). Covered.
- **Consistency:** `apiKeysApi.set(companyId, kind, provider, value)` and `.list` match `ui/src/api/apiKeys.ts`. `isConnected(keys, kind, provider)` used in Task 2 matches Task 1. queryKey `apiKeys.list(companyId)` introduced consistently.
- **Execution note:** Task 2 is integration-heavy — read `ToastContext`, `queryKeys.ts`, `OnboardingWizard.tsx`, `CompanySettings.tsx` and reuse real signatures.
