import { pgTable, uuid, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const portfolioHoldings = pgTable(
  "portfolio_holdings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    shares: numeric("shares").notNull(),
    avgCost: numeric("avg_cost"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("portfolio_holdings_company_id_idx").on(table.companyId),
  }),
);
