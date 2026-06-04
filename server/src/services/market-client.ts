import { MarketDataClient } from "@stockpilotai/market-data";
import type { StockQuote, EarningsEvent } from "@stockpilotai/market-data";
import { ALPHA_VANTAGE_API_KEY, POLYGON_API_KEY } from "../config.js";

/** Thin wrapper that adapts MarketDataClient to the single-ticker interface expected by the alert engine. */
export interface AlertMarketClient {
  getQuote(ticker: string): Promise<StockQuote>;
  getEarningsCalendar(ticker: string): Promise<EarningsEvent[]>;
}

export function createDefaultMarketClient(): AlertMarketClient {
  const client = new MarketDataClient({
    alphaVantageApiKey: ALPHA_VANTAGE_API_KEY,
    polygonApiKey: POLYGON_API_KEY,
  });
  return {
    getQuote: (ticker) => client.getQuote(ticker),
    getEarningsCalendar: (ticker) => client.getEarningsCalendar([ticker]),
  };
}
