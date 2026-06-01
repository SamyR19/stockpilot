import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const watchlistTickers = pgTable(
  "watchlist_tickers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    notes: text("notes"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("watchlist_tickers_company_id_idx").on(table.companyId),
    tickerIdx: index("watchlist_tickers_ticker_idx").on(table.ticker),
    companyTickerUniq: uniqueIndex("watchlist_tickers_company_ticker_uniq").on(table.companyId, table.ticker),
  }),
);
