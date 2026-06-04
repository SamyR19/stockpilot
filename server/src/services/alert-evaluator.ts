import type { StockQuote, EarningsEvent } from "@stockpilotai/market-data";

export type AlertConditionType =
  | "price_above" | "price_below" | "percent_change" | "volume_spike" | "earnings_date";

export interface AlertRuleInput {
  ticker: string;
  conditionType: AlertConditionType;
  threshold: string | null | undefined;
}

export interface EvalContext {
  now: Date;
  quote?: StockQuote;
  earnings?: EarningsEvent[];
  volumeBaseline?: number;
}

export interface EvalResult {
  fired: boolean;
  value: string | null;
}

const NO: EvalResult = { fired: false, value: null };

function num(threshold: string | null | undefined): number | null {
  if (threshold == null || threshold.trim() === "") return null;
  const n = Number(threshold);
  return Number.isFinite(n) ? n : null;
}

export function evaluateRule(rule: AlertRuleInput, ctx: EvalContext): EvalResult {
  switch (rule.conditionType) {
    case "price_above": {
      const t = num(rule.threshold);
      if (t == null || !ctx.quote) return NO;
      return ctx.quote.price >= t ? { fired: true, value: String(ctx.quote.price) } : NO;
    }
    case "price_below": {
      const t = num(rule.threshold);
      if (t == null || !ctx.quote) return NO;
      return ctx.quote.price <= t ? { fired: true, value: String(ctx.quote.price) } : NO;
    }
    case "percent_change": {
      const t = num(rule.threshold);
      if (t == null || !ctx.quote) return NO;
      return Math.abs(ctx.quote.changePercent) >= t
        ? { fired: true, value: String(ctx.quote.changePercent) } : NO;
    }
    case "volume_spike": {
      const t = num(rule.threshold);
      if (t == null || !ctx.quote || ctx.volumeBaseline == null || ctx.volumeBaseline <= 0) return NO;
      return ctx.quote.volume >= t * ctx.volumeBaseline
        ? { fired: true, value: String(ctx.quote.volume) } : NO;
    }
    case "earnings_date": {
      const days = num(rule.threshold) ?? 7;
      if (!ctx.earnings || ctx.earnings.length === 0) return NO;
      const horizon = ctx.now.getTime() + days * 24 * 60 * 60 * 1000;
      const hit = ctx.earnings.find(
        (e) => e.reportDate.getTime() >= ctx.now.getTime() && e.reportDate.getTime() <= horizon,
      );
      return hit ? { fired: true, value: hit.reportDate.toISOString() } : NO;
    }
    default:
      return NO;
  }
}
