# Manual Portfolio Entry — Plan

> Subagent-driven. Additive feature: let users type in holdings (ticker, shares, avg cost) so Portfolio works without a broker connection. New `portfolio_holdings` table + CRUD API + Portfolio UI that computes market value from live quotes.

**Spec-in-brief:** A `portfolio_holdings` table (companyId, ticker, shares, avgCost, notes). A `/api/portfolio` router with company-scoped CRUD. On the Portfolio page, a "Your holdings" section to add/edit/delete positions; market value + gain/loss computed client-side from the existing `/api/market/quote/:ticker` endpoint. Does not change the existing broker/CSV flow.

---

### Task 1: DB table + migration

**Files:** Create `packages/db/src/migrations/0098_portfolio_holdings.sql`; Create `packages/db/src/schema/portfolio_holdings.ts`; Modify `packages/db/src/schema/index.ts`; Modify `packages/db/src/migrations/meta/_journal.json`.

- [ ] **Step 1: migration SQL** `0098_portfolio_holdings.sql`:
```sql
CREATE TABLE "portfolio_holdings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
  "ticker" text NOT NULL,
  "shares" numeric NOT NULL,
  "avg_cost" numeric,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "portfolio_holdings_company_id_idx" ON "portfolio_holdings" ("company_id");
```
- [ ] **Step 2: schema** `packages/db/src/schema/portfolio_holdings.ts`:
```ts
import { pgTable, uuid, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const portfolioHoldings = pgTable(
  "portfolio_holdings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    shares: numeric("shares").notNull(),
    avgCost: numeric("avg_cost"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("portfolio_holdings_company_id_idx").on(table.companyId),
  }),
);
```
- [ ] **Step 3:** In `packages/db/src/schema/index.ts` add `export { portfolioHoldings } from "./portfolio_holdings.js";` (match the existing export style/placement near other finance tables).
- [ ] **Step 4:** Add journal entry idx 98 to `packages/db/src/migrations/meta/_journal.json` mirroring the last entry (idx 97, tag `0097_enable_rls`): `{"idx":98,"version":"7","when":1780650000000,"tag":"0098_portfolio_holdings","breakpoints":true}`.
- [ ] **Step 5:** `pnpm --filter @paperclipai/db build` → PASS. Commit:
```bash
git add packages/db/src/migrations/0098_portfolio_holdings.sql packages/db/src/schema/portfolio_holdings.ts packages/db/src/schema/index.ts packages/db/src/migrations/meta/_journal.json
git commit -m "feat(db): portfolio_holdings table for manual positions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: CRUD API + test

**Files:** Create `server/src/routes/portfolio.ts`; Modify `server/src/app.ts` (mount it); Test `server/src/routes/__tests__/portfolio-holdings.test.ts`.

- [ ] **Step 1: route** `server/src/routes/portfolio.ts` — `createPortfolioRouter(db)` with `assertAuthenticated` guard (mirror `alerts.ts` structure) and:
  - `GET /:companyId/holdings` → list holdings for company (assertCompanyAccess), newest first.
  - `POST /:companyId/holdings` → body `{ ticker, shares, avgCost?, notes? }` (zod: ticker matches `/^[A-Z0-9.\-^=]{1,20}$/i`, shares a positive number-string, avgCost optional number-string). Insert (ticker uppercased). Return the row.
  - `PATCH /:companyId/holdings/:id` → update shares/avgCost/notes (assertCompanyAccess + scope by companyId). Return updated.
  - `DELETE /:companyId/holdings/:id` → delete (scoped). Return `{ ok: true }`.
  Use the `portfolioHoldings` import from `@paperclipai/db`, `eq`/`and`/`desc` from drizzle. Wrap handlers in try/catch → next(err). Numeric columns: accept numbers/strings, store as strings (drizzle numeric maps to string).
- [ ] **Step 2:** In `server/src/app.ts`, mount `api.use('/portfolio', createPortfolioRouter(db))` near the other finance routers (watchlist/alerts). Import it.
- [ ] **Step 3: test** `server/src/routes/__tests__/portfolio-holdings.test.ts` — mirror the harness in `server/src/routes/__tests__/alerts-events.test.ts` (actor `{ type:"board", source:"local_implicit" }`). Test: POST a holding returns 200 with the ticker; GET lists it. Use a stub Db with chainable select/insert. Run `pnpm --filter @paperclipai/server exec vitest run src/routes/__tests__/portfolio-holdings.test.ts` → PASS; then `tsc --noEmit` clean.
- [ ] **Step 4:** Build `pnpm --filter "@paperclipai/server..." build` → PASS. Commit:
```bash
git add server/src/routes/portfolio.ts server/src/app.ts server/src/routes/__tests__/portfolio-holdings.test.ts
git commit -m "feat(portfolio): CRUD API for manual holdings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Portfolio UI — add/edit/delete + live market value

**Files:** Create `ui/src/api/portfolio.ts`; Modify `ui/src/lib/queryKeys.ts`; Modify `ui/src/pages/Portfolio.tsx`.

- [ ] **Step 1:** READ `ui/src/pages/Portfolio.tsx`, `ui/src/api/broker.ts` (for `PortfolioHolding` + `api` client style), `ui/src/api/market.ts` (the quote endpoint — `/api/market/quote/:ticker`), `ui/src/lib/queryKeys.ts`, the toast (`useToastActions`), and how the page gets `selectedCompanyId`.
- [ ] **Step 2:** `ui/src/api/portfolio.ts`:
```ts
import { api } from "./client";
export interface ManualHolding { id: string; ticker: string; shares: string; avgCost: string | null; notes: string | null; }
export const portfolioApi = {
  listHoldings: (companyId: string) => api.get<ManualHolding[]>(`/portfolio/${encodeURIComponent(companyId)}/holdings`),
  addHolding: (companyId: string, data: { ticker: string; shares: string; avgCost?: string; notes?: string }) =>
    api.post<ManualHolding>(`/portfolio/${encodeURIComponent(companyId)}/holdings`, data),
  updateHolding: (companyId: string, id: string, data: Record<string, unknown>) =>
    api.patch<ManualHolding>(`/portfolio/${encodeURIComponent(companyId)}/holdings/${id}`, data),
  removeHolding: (companyId: string, id: string) =>
    api.delete<{ ok: true }>(`/portfolio/${encodeURIComponent(companyId)}/holdings/${id}`),
};
```
- [ ] **Step 3:** queryKeys: add `portfolio: { holdings: (companyId: string) => ["portfolio", companyId, "holdings"] as const }`.
- [ ] **Step 4:** On `Portfolio.tsx`, add a **"Your holdings"** card (above or below the broker section): a query for `portfolioApi.listHoldings`; an "Add holding" form (ticker, shares, avg cost) using a mutation → invalidate; each row shows ticker (mono), shares, avg cost, **current price + market value + gain/loss** computed from a live quote (fetch quotes per unique ticker via the market quote endpoint; `marketValue = shares*price`, `gain = (price-avgCost)*shares` with gain green / loss red — reuse the page's existing gain/loss styling); edit (inline or dialog) + delete (with confirm) buttons. Empty state via `EmptyState`. Match existing Portfolio styling; don't disturb the broker connections/CSV section.
- [ ] **Step 5:** `pnpm --filter @paperclipai/ui build` → PASS. Commit:
```bash
git add ui/src/api/portfolio.ts ui/src/lib/queryKeys.ts ui/src/pages/Portfolio.tsx
git commit -m "feat(portfolio): manual holdings UI with live market value + gain/loss

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: verify + roadmap
- [ ] `pnpm --filter "@paperclipai/server..." build && pnpm --filter @paperclipai/ui build` → PASS; run the portfolio route test.
- [ ] ROADMAP §7c: add a "Finance UX" note — manual portfolio entry done.
- [ ] Commit `docs: manual portfolio entry done`.
