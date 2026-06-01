import { api } from "./client";

export interface StockQuote {
  ticker: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap?: number
  fiftyTwoWeekHigh?: number
  fiftyTwoWeekLow?: number
  currency: string
  marketState: 'PRE' | 'REGULAR' | 'POST' | 'CLOSED' | 'UNKNOWN'
  timestamp: string
  provider: string
}

export interface NewsItem {
  title: string
  summary: string
  url: string
  source: string
  publishedAt: string
  tickers: string[]
  sentiment?: 'positive' | 'negative' | 'neutral'
  provider: string
}

export interface HistoricalPrice {
  date: string
  open: number
  high: number
  low: number
  close: number
  adjClose?: number
  volume: number
}

export interface EarningsEvent {
  ticker: string
  companyName?: string
  reportDate: string
  estimatedEPS?: number
  actualEPS?: number
  fiscalQuarter?: string
  provider: string
}

export const marketApi = {
  getQuote: (ticker: string) =>
    api.get<StockQuote>(`/market/quote/${encodeURIComponent(ticker)}`),

  getNews: (ticker: string, limit = 10) =>
    api.get<NewsItem[]>(`/market/news/${encodeURIComponent(ticker)}?limit=${limit}`),

  getHistory: (ticker: string, from: string, to: string) =>
    api.get<HistoricalPrice[]>(`/market/history/${encodeURIComponent(ticker)}?from=${from}&to=${to}`),

  getEarningsCalendar: (tickers: string[]) =>
    api.get<EarningsEvent[]>(`/market/earnings-calendar?tickers=${tickers.map(encodeURIComponent).join(',')}`),
};
