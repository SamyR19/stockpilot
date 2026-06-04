import { eq } from "drizzle-orm";
import { alertRules, alertEvents } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import type { StockQuote, EarningsEvent } from "@stockpilotai/market-data";
import { evaluateRule, type AlertConditionType } from "./alert-evaluator.js";
import { logger } from "../middleware/logger.js";

interface MarketClientLike {
  getQuote(ticker: string): Promise<StockQuote>;
  getEarningsCalendar?(ticker: string): Promise<EarningsEvent[]>;
}

export interface AlertEngineDeps {
  marketClient: MarketClientLike;
  cooldownMinutes: number;
}

export interface TickResult { evaluated: number; fired: number; errors: number; }

interface RuleRow {
  id: string; companyId: string; ticker: string;
  conditionType: AlertConditionType; threshold: string | null;
  active: boolean; lastTriggeredAt: Date | null;
}

export function createAlertEngine(db: Db, deps: AlertEngineDeps) {
  const cooldownMs = deps.cooldownMinutes * 60 * 1000;

  async function tick(now: Date): Promise<TickResult> {
    const rules = (await db.select().from(alertRules).where(eq(alertRules.active, true))) as RuleRow[];
    const result: TickResult = { evaluated: 0, fired: 0, errors: 0 };

    const due = rules.filter((r) => !r.lastTriggeredAt || now.getTime() - r.lastTriggeredAt.getTime() >= cooldownMs);
    const tickers = Array.from(new Set(due.map((r) => r.ticker)));

    const quotes = new Map<string, StockQuote>();
    const earningsByTicker = new Map<string, EarningsEvent[]>();
    const needEarnings = new Set(due.filter((r) => r.conditionType === "earnings_date").map((r) => r.ticker));

    for (const ticker of tickers) {
      try {
        quotes.set(ticker, await deps.marketClient.getQuote(ticker));
        if (needEarnings.has(ticker) && deps.marketClient.getEarningsCalendar) {
          earningsByTicker.set(ticker, await deps.marketClient.getEarningsCalendar(ticker));
        }
      } catch (err) {
        result.errors += 1;
        logger.warn({ err, ticker }, "alert engine: market fetch failed for ticker");
      }
    }

    for (const rule of due) {
      result.evaluated += 1;
      const quote = quotes.get(rule.ticker);
      const earnings = earningsByTicker.get(rule.ticker);
      if (rule.conditionType === "earnings_date" ? !earnings : !quote) continue;
      const { fired, value } = evaluateRule(rule, { now, quote, earnings });
      if (!fired) continue;
      try {
        await db.insert(alertEvents).values({
          ruleId: rule.id, companyId: rule.companyId, ticker: rule.ticker, value, notified: false,
        });
        await db.update(alertRules).set({ lastTriggeredAt: now }).where(eq(alertRules.id, rule.id));
        result.fired += 1;
      } catch (err) {
        result.errors += 1;
        logger.error({ err, ruleId: rule.id }, "alert engine: failed to record event");
      }
    }
    return result;
  }

  return { tick };
}
