# Bring-Your-Own-Keys Onboarding Wizard — Design Spec

**Date:** 2026-06-03 · **Status:** Approved (defaults) · **Queue item:** #3 of 8

## Problem
The api-keys API exists (`apiKeysApi.list/set/remove`; AI providers anthropic/openai/gemini, data providers alpha_vantage/polygon; saving a `data` key bumps a cloud company to the `keys` tier) but there is no guided way to add keys — a new user faces a flat settings field. Add a **multi-step wizard** that walks the user through connecting an AI key (required to run agents) and an optional market-data key (better/unthrottled data).

## Approach
A self-contained wizard **dialog** composing the existing `apiKeysApi`. No backend changes. A pure provider-metadata module (unit-tested) drives the UI.

## Components

### 1. Provider metadata (pure) — `ui/src/lib/apiKeyProviders.ts`
```ts
export type KeyKind = "ai" | "data";
export interface KeyProviderMeta {
  kind: KeyKind; provider: string; label: string;
  helpUrl: string;       // where to get the key
  placeholder: string;   // input placeholder hint
}
export const AI_KEY_PROVIDERS: KeyProviderMeta[]   // anthropic, openai, gemini
export const DATA_KEY_PROVIDERS: KeyProviderMeta[] // alpha_vantage, polygon
export function isConnected(keys: string[], kind: KeyKind, provider: string): boolean // keys contains `${kind}.${provider}`
```
Unit-tested: list integrity + `isConnected` against names like `"ai.anthropic"`.

### 2. Wizard dialog — `ui/src/components/ApiKeysWizard.tsx`
Props `{ open, onOpenChange, companyId, onDone? }`. Loads current keys via `useQuery(apiKeysApi.list)`.
- **Step 1 — AI provider (required):** pick one of `AI_KEY_PROVIDERS` (radio/cards), paste key, "Save & continue" → `apiKeysApi.set(companyId, "ai", provider, value)`. Each provider shows its `helpUrl` ("Get a key →"). If an AI key is already connected, show ✓ and allow "Skip" / "Replace".
- **Step 2 — Market data (optional):** same for `DATA_KEY_PROVIDERS`; copy explains it unlocks higher-quality/unthrottled data (and, in cloud, the `keys` tier). "Skip" allowed.
- **Step 3 — Done:** summary listing connected keys (from a refreshed `list`), a "Finish" button calling `onDone?()` + closing.
- Saving invalidates the keys list query (`queryKeys` — add `apiKeys.list(companyId)` if missing) and the company tier/subscription query if one exists (so tier UI updates after a data key). Toasts via the app's `useToastActions`.
- Errors: failed save shows a toast and stays on the step (does not advance).

### 3. Entry point
Add a **"Connect API keys"** button to `ui/src/pages/CompanySettings.tsx` (near existing key/settings UI) that opens the wizard. (Keep it discoverable; deeper dashboard placement is a follow-up.)

## Reuse / consistency
Existing `Dialog`, `Button`, `Input`, `Select`/radio, `useToastActions`, `apiKeysApi`, `queryKeys`. Do not restyle existing settings UI; just add the button + dialog.

## Security
Keys are write-only through `apiKeysApi.set` (stored via the server secrets pipeline). The wizard NEVER displays stored key values (the list endpoint returns names only). Input fields use `type="password"`.

## Out of scope (v1)
- Auto-launching the wizard on first login (just a button for now).
- Per-key validation against the provider (we trust the user's paste; a "test key" call is a follow-up).
- Editing which provider is "active" if multiple AI keys exist.

## Testing
- Unit: `apiKeyProviders.test.ts` — provider lists non-empty + valid kinds; `isConnected` true/false cases.
- Build: `pnpm --filter @paperclipai/ui build` passes.
- Manual: open wizard → save an AI key → step 2 skip → Done shows the connected key; settings list reflects it.

## Success criteria
A user can connect an AI key (and optionally a data key) through a guided 3-step dialog built only on existing endpoints; the keys list + tier update; no key values are ever shown back.
