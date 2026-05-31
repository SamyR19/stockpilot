# StockPilot AI — App Fork Plan

This document tracks the planned customizations to transform the Paperclip fork into **StockPilot AI** — an AI agent orchestration platform tailored for stock market research, trading strategy, and financial analysis workflows.

---

## Vision

StockPilot AI uses Paperclip's control plane to run **teams of specialized financial AI agents** that:
- Monitor markets, news, and social sentiment in real time
- Research stocks, sectors, and macroeconomic conditions
- Generate and backtest trading strategies
- Produce structured investment reports and alerts
- Coordinate multi-agent pipelines (research → analysis → decision → execution)

---

## Branding & Identity Changes

| Element | Original | StockPilot AI |
|---------|----------|---------------|
| Product name | Paperclip | StockPilot AI |
| CLI command | `paperclipai` | `stockpilot` |
| NPM scope | `@paperclipai` | `@stockpilotai` |
| Default company | — | StockPilot HQ |
| Color scheme | TBD | Financial dark theme (deep blue / green) |
| Logo / favicon | Paperclip | Chart / candlestick icon |
| UI title | Paperclip | StockPilot AI |

---

## Domain-Specific Agent Roles

Replace generic agent titles with finance-specialized roles:

| Paperclip Generic | StockPilot Specialized |
|------------------|----------------------|
| Agent | Analyst Agent |
| Worker | Research Agent |
| Reviewer | Risk Review Agent |
| CEO Agent | Chief Investment Agent |
| — | Market Scanner Agent |
| — | Sentiment Analysis Agent |
| — | Strategy Backtester Agent |
| — | Report Writer Agent |
| — | Alert Monitor Agent |

---

## New Issue/Task Labels

Add finance-domain labels alongside existing ones:

- `market-research`
- `fundamental-analysis`
- `technical-analysis`
- `sentiment-analysis`
- `backtest`
- `earnings-report`
- `risk-review`
- `strategy`
- `alert`
- `portfolio`
- `macro`
- `sector`

---

## New Routines (Recurring Jobs)

Pre-built routine templates specific to trading workflows:

| Routine | Schedule | Assigned Agent |
|---------|----------|---------------|
| Pre-market scan | 6:00 AM ET weekdays | Market Scanner Agent |
| Earnings calendar check | Daily | Research Agent |
| News sentiment sweep | Every 2 hours | Sentiment Agent |
| Portfolio health check | Market close (4:30 PM ET) | Risk Review Agent |
| Weekly strategy review | Mondays 8 AM | Chief Investment Agent |

---

## New Adapters / Integrations (Planned)

### Data Source Adapters

| Adapter | Data |
|---------|------|
| `alphavantage-adapter` | Price data, fundamentals, earnings |
| `newsapi-adapter` | Financial news headlines |
| `reddit-adapter` | r/wallstreetbets, r/stocks sentiment |
| `sec-edgar-adapter` | SEC filings (10-K, 10-Q, 8-K) |
| `polygon-adapter` | Real-time + historical market data |
| `finviz-adapter` | Stock screener data |

### Execution Adapters

| Adapter | Purpose |
|---------|---------|
| `alpaca-adapter` | Paper/live trade execution via Alpaca |
| `ibkr-adapter` | Interactive Brokers execution (future) |

---

## New Skills (Agent Training)

| Skill | Purpose |
|-------|---------|
| `stockpilot-core` | Core StockPilot workflow: how to pick, research, and report on stocks |
| `fundamental-analysis` | How to analyze balance sheets, income statements, P/E, EV/EBITDA |
| `technical-analysis` | Chart patterns, RSI, MACD, moving averages |
| `sentiment-analysis` | News + social media signal interpretation |
| `backtesting` | How to write and interpret strategy backtests |
| `risk-management` | Position sizing, stop-loss, portfolio concentration rules |
| `report-writing` | How to structure investment research reports |
| `earnings-playbook` | Pre/post earnings analysis workflow |

---

## UI Customizations

### Dashboard
- Replace generic "Company" dashboard with **Portfolio Overview**
- Add watchlist widget
- Add market status indicator (pre-market / open / after-hours / closed)
- Add P&L tracker for tracked positions

### Issues → Research Tasks
- Rename "Issue" → "Research Task" in UI copy
- Add fields: `ticker`, `sector`, `market cap`, `target price`, `recommendation (buy/hold/sell)`
- Add stock chart embed on task detail page

### Agents Page
- Show agent specialization badges
- Show agent's current assigned ticker(s)
- Show cost per analysis run

### New Pages
- `/watchlist` — Manage tracked tickers
- `/reports` — Structured output from Report Writer agents
- `/alerts` — Market alerts and triggers from Monitor agents
- `/strategies` — Backtest results and strategy library
- `/portfolio` — Position tracking (if execution adapters enabled)

---

## New API Endpoints (Planned)

```
GET  /api/market/quote/:ticker           # Live quote
GET  /api/market/news/:ticker            # Recent news
GET  /api/market/sentiment/:ticker       # Aggregated sentiment score
POST /api/research/trigger               # Manually trigger research run on a ticker
GET  /api/reports                        # List generated reports
GET  /api/reports/:id                    # Get report detail
GET  /api/watchlist                      # Company watchlist
POST /api/watchlist                      # Add ticker
DEL  /api/watchlist/:ticker              # Remove ticker
GET  /api/alerts                         # List active alerts
POST /api/alerts                         # Create alert rule
```

---

## Database Schema Additions

New tables to add on top of Paperclip schema:

```sql
-- Watchlist tickers per company
watchlist_tickers (id, company_id, ticker, added_at, notes)

-- Research reports produced by agents
research_reports (id, company_id, issue_id, ticker, type, content, recommendation, target_price, created_at)

-- Market alert rules
alert_rules (id, company_id, ticker, condition_type, threshold, agent_id, active, created_at)

-- Alert firings
alert_events (id, rule_id, company_id, ticker, triggered_at, value, notified)

-- Strategy backtest results
backtest_results (id, company_id, strategy_name, ticker, period_start, period_end, returns_pct, sharpe, max_drawdown, created_at)
```

---

## Environment Variables (New)

```env
# Market Data
ALPHA_VANTAGE_API_KEY=
POLYGON_API_KEY=
NEWS_API_KEY=

# Social Sentiment
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=

# Execution (optional)
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# StockPilot Config
STOCKPILOT_MARKET_TIMEZONE=America/New_York
STOCKPILOT_DEFAULT_WATCHLIST=AAPL,MSFT,GOOGL,TSLA,NVDA
```

---

## Implementation Phases

### Phase 1 — Rebrand & Cleanup
- [ ] Rename product to StockPilot AI throughout codebase
- [ ] Update CLI command from `paperclipai` → `stockpilot`
- [ ] Update UI branding (name, colors, favicon)
- [ ] Update package names and NPM scope
- [ ] Strip or repurpose Paperclip-specific skills

### Phase 2 — Finance Domain Layer
- [ ] Add `ticker`, `sector`, `recommendation` fields to issues
- [ ] Add watchlist table and API
- [ ] Add research reports table and API
- [ ] Add alert rules system
- [ ] Add market status indicator to UI

### Phase 3 — Agent Skills
- [ ] Write `stockpilot-core` skill
- [ ] Write `fundamental-analysis` skill
- [ ] Write `technical-analysis` skill
- [ ] Write `sentiment-analysis` skill
- [ ] Write `report-writing` skill

### Phase 4 — Data Adapters
- [ ] Build `alphavantage-adapter` (price, fundamentals)
- [ ] Build `newsapi-adapter` (headlines)
- [ ] Wire adapters into routine trigger system

### Phase 5 — UI Polish
- [ ] Portfolio overview dashboard
- [ ] Reports page
- [ ] Alerts page
- [ ] Watchlist management page
- [ ] Stock chart embed on task detail

### Phase 6 — Execution (Optional / Advanced)
- [ ] Alpaca paper trading adapter
- [ ] Position tracker
- [ ] P&L dashboard widget

---

## Notes & Decisions

- **Keep Paperclip's control plane intact** — the heartbeat model, atomic checkout, budget enforcement, governance, and plugin system are all valuable and should not be refactored away.
- **Extend, don't replace** — add domain tables and skills on top of the existing schema rather than replacing core entities.
- **Agent governance matters for finance** — the approval workflow is especially valuable here (e.g., require board sign-off before any live trade execution).
- **Start with paper trading** — use Alpaca's paper trading API before connecting to live funds.
- **Skills are the primary product differentiation** — the quality of `stockpilot-core` and domain-specific skills determines agent performance.
