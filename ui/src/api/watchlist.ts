import { api } from "./client";

export interface WatchlistTicker {
  id: string
  ticker: string
  notes: string | null
  addedAt: string
}

export const watchlistApi = {
  list: (companyId: string) =>
    api.get<WatchlistTicker[]>(`/watchlist/${encodeURIComponent(companyId)}`),

  add: (companyId: string, ticker: string, notes?: string) =>
    api.post<WatchlistTicker>(`/watchlist/${encodeURIComponent(companyId)}`, { ticker, notes: notes ?? null }),

  remove: (companyId: string, ticker: string) =>
    api.delete<void>(`/watchlist/${encodeURIComponent(companyId)}/${encodeURIComponent(ticker)}`),
};
