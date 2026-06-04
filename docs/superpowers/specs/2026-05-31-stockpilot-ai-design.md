# StockPilot AI — Design Spec

**Date:** 2026-05-31
**Status:** Approved

---

## What We're Building

StockPilot AI is an open-source operating system for managing teams of AI agents as personal Wall Street employees. It is a fork of Paperclip, extended with finance-domain roles, read-only portfolio connections, market data adapters, and a hosted cloud version with Stripe billing.

Target users: casual retail investors, young adults learning to manage their portfolio, and serious DIY investors who want Wall Street-quality research without Wall Street fees.

**It does not trade on your behalf. Ever.** It reads, researches, and advises.

---

## Section 1 — Overall Architecture

### Deployment Model
Single monorepo forked from Paperclip. One environment variable — `STOCKPILOT_MODE` — switches between `selfhost` and `cloud`.

- **selfhost:** runs locally, embedded PostgreSQL, user brings their own AI and data API keys, no billing
- **cloud:** hosted at stockpilotai.com, Supabase PostgreSQL, Stripe billing, managed or bring-your-own keys

Same codebase, same GitHub repo, same open source license.

### License
> **SUPERSEDED (2026-06-03): the owner chose MIT, not AGPL.** The repo is MIT. The original AGPL rationale below is kept for historical context only.

~~**AGPL** — anyone can use, self-host, and modify freely. If they run it as a hosted service they must open source their changes. Protects against competitors copying the cloud version.~~

### Open Source + Cloud Model
Mirrors the Cal.com / Supabase pattern:
- Public GitHub repo — self-hosters clone and run for free
- Hosted cloud version — users sign up at stockpilotai.com, pay via Stripe or bring keys
- Community can contribute new agent roles, data adapters, and skills

---

## Section 2 — What We Change From Paperclip

### Leave completely alone
- Heartbeat engine (agent wake/work/sleep cycle)
- Task/issue system
- Agent hierarchy and org chart
- Budget enforcement
- Plugin system
- Database schema and API structure
- Auth system (better-auth)

### Rebrand
- Product name → StockPilot AI
- CLI command → `stockpilot`
- NPM scope → `@stockpilotai`
- Colors, logo, favicon → financial dark theme
- All "Paperclip" UI references replaced

### Add on top
- Finance-specific agent roles with pre-written skills
- Read-only portfolio broker connections
- Market data adapters
- New UI pages (Watchlist, Reports, Alerts, Portfolio, Routine Builder)
- Pre-built market routines
- Stripe billing + API key management (cloud mode only)
- Free tier limits via feature flags
- `STOCKPILOT_MODE` environment variable and feature flag system

### Nothing deleted
No Paperclip functionality is removed. Everything is additive.

---

## Section 3 — Portfolio & Market Data Connections

### Portfolio Connections (strictly read-only)
| Source | Method |
|--------|--------|
| Robinhood | Unofficial open source API library |
| Charles Schwab | Official OAuth developer API |
| Yahoo Finance | Manual portfolio data (public) |
| Manual CSV import | User exports from any broker, uploads to app |

The app can read: holdings, cost basis, current value, transaction history.
The app **cannot** place, modify, or cancel any trade. This is enforced at the integration layer and communicated clearly in the UI.

### Market Data Adapters
| Provider | Tier | Cost |
|----------|------|------|
| Yahoo Finance | Free (all tiers) | Free, no key needed |
| Alpha Vantage | Bring-your-own + Subscription | Free tier available |
| Polygon.io | Bring-your-own + Subscription | Free tier available |

Free tier users get Yahoo Finance only. Paid and bring-your-own users unlock Alpha Vantage and Polygon.

---

## Section 4 — Agent Roles & Skills

Pre-built personas users assign to their AI agents. Each role ships with a pre-written skill file (system prompt) in the open source repo.

| Role | Responsibility |
|------|---------------|
| **Equity Analyst** | Deep dives on individual stocks — fundamentals, valuation, competitive position |
| **News Sentinel** | Monitors news feeds, flags material events affecting holdings |
| **Quant Analyst** | Technical analysis, pattern recognition, screens for setups |
| **Risk Manager** | Watches concentration, volatility, drawdown — issues warnings |
| **Macro Researcher** | Tracks Fed decisions, interest rates, economic data |
| **Portfolio Manager** | CEO agent — synthesizes all others into a weekly briefing |
| **Earnings Scout** | Tracks upcoming earnings for watchlist, preps pre-earnings analysis |

New roles can be contributed by the open source community as skill files.

### Tier Access
- **Free:** News Sentinel only, limited runs per month (~10-20)
- **Bring your own keys:** All roles unlocked, unlimited runs (limited by user's own API spend)
- **Subscription:** All roles unlocked, unlimited runs, we cover AI and data costs

---

## Section 5 — API Keys & Billing Model

### Two Separate Key Types
1. **AI keys** — powers the agent's brain (Claude, Gemini, OpenAI, etc.)
2. **Data keys** — powers what agents see (Alpha Vantage, Polygon, etc.)

### Tiers

**Free (no keys required):**
- Brain: small allocation covered by StockPilot
- Data: Yahoo Finance only (free, no key)
- 1 agent role (News Sentinel)
- 10-20 heartbeat runs/month

**Bring Your Own Keys:**
- Brain: user pastes their own Claude/Gemini/OpenAI API key
- Data: user pastes their own Alpha Vantage or Polygon key (both have free tiers)
- All roles unlocked
- Unlimited runs
- Pay nothing to StockPilot

**Subscription (Stripe):**
- Brain: StockPilot covers it
- Data: StockPilot covers it
- All roles unlocked
- Unlimited runs
- No keys needed

### Onboarding UX
Bring-your-own-keys users get a step-by-step key connection wizard — minimizes friction for non-technical users.

---

## Section 6 — Database & Cloud Infrastructure

### Database
- **Self-hosted:** embedded PostgreSQL (PGLite) — zero setup, runs automatically
- **Cloud:** Supabase PostgreSQL — free to start, scales well
- ORM: Drizzle (unchanged from Paperclip)
- Data isolation: enforced by existing `company_id` scoping on every table

### New Database Tables
```sql
-- Watchlist tickers per user
watchlist_tickers (id, company_id, ticker, added_at, notes)

-- Research reports produced by agents
research_reports (id, company_id, issue_id, ticker, type, content, recommendation, target_price, created_at)

-- Market alert rules
alert_rules (id, company_id, ticker, condition_type, threshold, agent_id, active, created_at)

-- Alert firings
alert_events (id, rule_id, company_id, ticker, triggered_at, value, notified)

-- Connected broker accounts
broker_connections (id, company_id, broker, credentials_encrypted, last_synced_at, active)

-- Subscription state (cloud mode only)
subscriptions (id, company_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
```

### Cloud Hosting Stack
| Layer | Service |
|-------|---------|
| App + API | Vercel (Fluid Compute) |
| Database | Supabase PostgreSQL |
| File storage | Vercel Blob (reports, CSV uploads, agent outputs) |
| Background jobs | Vercel Cron (heartbeat scheduling) |
| Billing | Stripe |

### Self-Host Setup
```bash
git clone https://github.com/SamyR19/paperclip
cd paperclip
pnpm install
pnpm dev   # embedded Postgres starts automatically
```
External PostgreSQL optional via `DATABASE_URL` env var.

---

## Section 7 — UI Changes

### Theme
- Dark financial theme: deep navy background, green for gains, red for losses, clean monospace number rendering
- Candlestick/chart logo and favicon
- All Paperclip branding replaced

### New Pages
| Page | Content |
|------|---------|
| **Portfolio** | Connected broker holdings, current value, gain/loss, allocation breakdown |
| **Watchlist** | Tracked tickers, live prices, agent commentary per ticker |
| **Reports** | Library of agent-generated research reports, searchable by ticker |
| **Alerts** | Active alert rules, recent firings, earnings notifications |
| **Market Routine Builder** | Visual interface for setting up recurring agent jobs |

### Modified Existing Pages
- Agent setup → adds pre-built role picker (choose from the 7 roles)
- Task detail → adds `ticker`, `sector`, `recommendation` fields
- Dashboard → becomes financial overview: market status, portfolio snapshot, agent activity feed

### Language Changes
Non-technical language throughout:
- "Heartbeats" → "Routines"
- "Issues" → "Research Tasks"
- "Company" → "Workspace"

---

## Section 8 — Feature Flag System

`STOCKPILOT_MODE=selfhost|cloud` controls which features are active.

| Feature | selfhost | cloud/free | cloud/keys | cloud/subscription |
|---------|----------|------------|------------|-------------------|
| All agent roles | ✓ | News Sentinel only | ✓ | ✓ |
| Unlimited runs | ✓ | ✗ (20/mo) | ✓ | ✓ |
| Alpha Vantage / Polygon | ✓ | ✗ | ✓ | ✓ |
| Stripe billing UI | ✗ | ✓ | ✓ | ✓ |
| Managed AI keys | ✗ | ✗ | ✗ | ✓ |
| Broker OAuth connections | ✓ | ✓ | ✓ | ✓ |

---

## MCP Server (Future)
Not in initial scope. After real users are acquired, an MCP server layer would allow StockPilot to connect to tools like Claude Desktop, Cowork, or other MCP-compatible clients. Architecture already supports this via Paperclip's existing MCP package.

---

## What This Is Not
- Not a trading bot
- Not financial advice
- Not a replacement for a licensed financial advisor
- Agents cannot execute, modify, or view order history beyond read permissions

---

## New Environment Variables

```env
# Mode
STOCKPILOT_MODE=selfhost                    # or "cloud"

# Market Data
ALPHA_VANTAGE_API_KEY=
POLYGON_API_KEY=

# Broker Connections
SCHWAB_CLIENT_ID=
SCHWAB_CLIENT_SECRET=

# Billing (cloud only)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=

# Storage (cloud only)
BLOB_READ_WRITE_TOKEN=
```
