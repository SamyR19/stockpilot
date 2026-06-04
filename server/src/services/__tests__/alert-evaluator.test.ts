import { describe, it, expect } from "vitest";
import { evaluateRule, type AlertRuleInput, type EvalContext } from "../alert-evaluator.js";

const baseQuote = {
  ticker: "AAPL", price: 100, change: 1, changePercent: 2, volume: 1_000_000,
  currency: "USD", marketState: "REGULAR" as const, timestamp: new Date(), provider: "yahoo-finance" as const,
};
function rule(partial: Partial<AlertRuleInput>): AlertRuleInput {
  return { conditionType: "price_above", threshold: "90", ticker: "AAPL", ...partial };
}
const now = new Date("2026-06-03T12:00:00Z");

describe("evaluateRule", () => {
  it("price_above fires when price >= threshold", () => {
    expect(evaluateRule(rule({ conditionType: "price_above", threshold: "90" }), { quote: baseQuote, now }))
      .toEqual({ fired: true, value: "100" });
  });
  it("price_above does not fire below threshold", () => {
    expect(evaluateRule(rule({ conditionType: "price_above", threshold: "110" }), { quote: baseQuote, now }).fired).toBe(false);
  });
  it("price_below fires when price <= threshold", () => {
    expect(evaluateRule(rule({ conditionType: "price_below", threshold: "110" }), { quote: baseQuote, now }).fired).toBe(true);
  });
  it("percent_change uses absolute value", () => {
    const q = { ...baseQuote, changePercent: -5 };
    expect(evaluateRule(rule({ conditionType: "percent_change", threshold: "4" }), { quote: q, now }).fired).toBe(true);
  });
  it("earnings_date fires when an earnings report is within threshold days", () => {
    const ctx: EvalContext = { now, earnings: [{ ticker: "AAPL", reportDate: new Date("2026-06-06T00:00:00Z"), provider: "yahoo-finance" }] };
    expect(evaluateRule(rule({ conditionType: "earnings_date", threshold: "7" }), ctx).fired).toBe(true);
  });
  it("volume_spike needs a baseline (no false-fire without it)", () => {
    expect(evaluateRule(rule({ conditionType: "volume_spike", threshold: "2" }), { quote: baseQuote, now }).fired).toBe(false);
    expect(evaluateRule(rule({ conditionType: "volume_spike", threshold: "2" }), { quote: baseQuote, now, volumeBaseline: 400_000 }).fired).toBe(true);
  });
  it("missing/NaN threshold never fires", () => {
    expect(evaluateRule(rule({ conditionType: "price_above", threshold: undefined }), { quote: baseQuote, now }).fired).toBe(false);
  });
  it("missing quote never fires for quote-based conditions", () => {
    expect(evaluateRule(rule({ conditionType: "price_above", threshold: "1" }), { now }).fired).toBe(false);
  });
});
