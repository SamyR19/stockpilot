import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";

export const researchReports = pgTable(
  "research_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    ticker: text("ticker").notNull(),
    reportType: text("report_type").notNull().default("general"),
    content: text("content").notNull(),
    recommendation: text("recommendation"),
    targetPriceCents: integer("target_price_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("research_reports_company_id_idx").on(table.companyId),
    tickerIdx: index("research_reports_ticker_idx").on(table.ticker),
  }),
);
