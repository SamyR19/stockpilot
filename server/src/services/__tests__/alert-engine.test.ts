import { describe, it, expect, vi } from "vitest";
import { createAlertEngine } from "../alert-engine.js";

function makeDbStub(rules: any[]) {
  const inserted: any[] = [];
  const updated: any[] = [];
  const db: any = {
    select: () => ({ from: () => ({ where: () => Promise.resolve(rules) }) }),
    insert: () => ({ values: (v: any) => { inserted.push(v); return Promise.resolve(); } }),
    update: () => ({ set: (s: any) => ({ where: () => { updated.push(s); return Promise.resolve(); } }) }),
  };
  return { db, inserted, updated };
}
const quote = (over: any = {}) => ({ ticker: "AAPL", price: 100, change: 0, changePercent: 0, volume: 0, currency: "USD", marketState: "REGULAR", timestamp: new Date(), provider: "yahoo-finance", ...over });

describe("alertEngine.tick", () => {
  it("fires a price_above rule once and stamps last_triggered_at", async () => {
    const rules = [{ id: "r1", companyId: "c1", ticker: "AAPL", conditionType: "price_above", threshold: "90", active: true, lastTriggeredAt: null }];
    const { db, inserted, updated } = makeDbStub(rules);
    const marketClient = { getQuote: vi.fn().mockResolvedValue(quote({ price: 100 })) } as any;
    const engine = createAlertEngine(db, { marketClient, cooldownMinutes: 360 });
    const r = await engine.tick(new Date("2026-06-03T12:00:00Z"));
    expect(r.fired).toBe(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].ruleId).toBe("r1");
    expect(updated).toHaveLength(1);
    expect(marketClient.getQuote).toHaveBeenCalledTimes(1);
  });

  it("respects cooldown (does not re-fire within window)", async () => {
    const recent = new Date("2026-06-03T11:00:00Z");
    const rules = [{ id: "r1", companyId: "c1", ticker: "AAPL", conditionType: "price_above", threshold: "90", active: true, lastTriggeredAt: recent }];
    const { db, inserted } = makeDbStub(rules);
    const marketClient = { getQuote: vi.fn().mockResolvedValue(quote({ price: 100 })) } as any;
    const engine = createAlertEngine(db, { marketClient, cooldownMinutes: 360 });
    const r = await engine.tick(new Date("2026-06-03T12:00:00Z"));
    expect(r.fired).toBe(0);
    expect(inserted).toHaveLength(0);
    expect(marketClient.getQuote).not.toHaveBeenCalled();
  });

  it("dedupes quote fetches per ticker and isolates per-ticker errors", async () => {
    const rules = [
      { id: "r1", companyId: "c1", ticker: "AAPL", conditionType: "price_above", threshold: "90", active: true, lastTriggeredAt: null },
      { id: "r2", companyId: "c1", ticker: "AAPL", conditionType: "price_below", threshold: "200", active: true, lastTriggeredAt: null },
      { id: "r3", companyId: "c1", ticker: "BAD", conditionType: "price_above", threshold: "1", active: true, lastTriggeredAt: null },
    ];
    const { db, inserted } = makeDbStub(rules);
    const getQuote = vi.fn((t: string) => t === "BAD" ? Promise.reject(new Error("429")) : Promise.resolve(quote({ ticker: t, price: 100 })));
    const engine = createAlertEngine(db, { marketClient: { getQuote } as any, cooldownMinutes: 360 });
    const r = await engine.tick(new Date());
    expect(getQuote).toHaveBeenCalledTimes(2);
    expect(r.fired).toBe(2);
    expect(r.errors).toBe(1);
    expect(inserted).toHaveLength(2);
  });
});
