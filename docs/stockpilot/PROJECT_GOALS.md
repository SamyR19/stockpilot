# StockPilot AI — Project Goals

> **What this file is:** The north star. Read it to understand *why* StockPilot exists and *what* it is trying to be. For the build plan and current status, see [`ROADMAP.md`](./ROADMAP.md). For what the underlying Paperclip code does, see [`PAPERCLIP_REFERENCE.md`](./PAPERCLIP_REFERENCE.md).

---

## One-liner

**StockPilot AI is an open-source operating system for managing a team of AI agents as your personal Wall Street employees.** It reads, researches, and advises on your portfolio and the market. **It never trades on your behalf.**

It is a fork of [Paperclip](./PAPERCLIP_REFERENCE.md) (an AI-agent company control plane), extended with finance-domain agent roles, read-only broker connections, market-data adapters, finance UI pages, and a hosted cloud tier with Stripe billing.

---

## Who it's for

- **Casual retail investors** who want Wall Street-quality research without Wall Street fees.
- **Young adults** learning to manage their own portfolio.
- **Serious DIY investors** who want a team of analyst agents working their watchlist around the clock.

## What it does

- Connects (read-only) to a user's brokerage or an imported CSV to see holdings, cost basis, value, and history.
- Pulls live market data (quotes, history, news, earnings) from Yahoo Finance (free) or Alpha Vantage / Polygon (with keys).
- Runs a team of finance AI agents (Equity Analyst, News Sentinel, Quant, Risk Manager, Macro Researcher, Portfolio Manager, Earnings Scout) on recurring "routines" that produce research reports and alerts.
- Surfaces it all through finance UI pages: Portfolio, Watchlist, Alerts, Market (and planned: Reports, Routine Builder).

## What it explicitly is NOT

- ❌ **Not a trading bot.** It cannot place, modify, or cancel any order. Read-only is enforced at the integration layer and stated clearly in the UI.
- ❌ **Not financial advice.** Not a replacement for a licensed advisor.
- ❌ **Not a Paperclip replacement.** Everything finance is *additive*; no Paperclip capability is deleted.

---

## Core principles (decision filter)

1. **Read-only, always.** Any feature that could place a trade is out of scope, period.
2. **Additive over destructive.** We layer finance on top of Paperclip; we don't rip Paperclip out. (When we *do* want to hide/remove Paperclip surface area, it's a deliberate, documented decision — see the "Paperclip surface to reconsider" section of the roadmap.)
3. **Open source + cloud.** Public repo anyone can self-host for free; a hosted cloud tier (Stripe) funds it. Mirrors the Cal.com / Supabase model.
4. **One codebase, two modes.** A single env var, `STOCKPILOT_MODE=selfhost|cloud`, switches behavior. No forks, no parallel branches.
5. **Community-extensible.** New agent roles, data adapters, and skills can be contributed as files.

---

## Success looks like

A self-hoster can clone the repo, run `pnpm dev`, connect a portfolio (or import a CSV), pick analyst agent roles, and wake up to a weekly briefing and price alerts — without paying anyone. And a non-technical user can sign up at the hosted cloud version, pay (or bring keys), and get the same thing with zero setup.

---

## Licensing note (open question — confirm before launch)

- The **design spec** (`docs/superpowers/specs/2026-05-31-stockpilot-ai-design.md`) specifies **AGPL** (protects the hosted cloud version from competitors).
- In conversation the owner mentioned **MIT**.

These conflict. **Do not assume one — confirm with the owner before publishing license terms.** Tracked in the roadmap's open-questions list.
