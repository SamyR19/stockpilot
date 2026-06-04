import { pgTable, uuid, text, timestamp, boolean, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const ALERT_CONDITION_TYPES = ["price_above", "price_below", "percent_change", "volume_spike", "earnings_date"] as const;
export type AlertConditionType = typeof ALERT_CONDITION_TYPES[number];

export const alertRules = pgTable(
  "alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    conditionType: text("condition_type").notNull().$type<AlertConditionType>(),
    threshold: text("threshold"),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("alert_rules_company_id_idx").on(table.companyId),
    conditionTypeCheck: check("alert_rules_condition_type_check", sql`condition_type IN ('price_above', 'price_below', 'percent_change', 'volume_spike', 'earnings_date')`),
  }),
);
