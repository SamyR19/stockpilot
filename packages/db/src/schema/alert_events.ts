import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { alertRules } from "./alert_rules.js";
import { companies } from "./companies.js";

export const alertEvents = pgTable(
  "alert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id").notNull().references(() => alertRules.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
    value: text("value"),
    notified: boolean("notified").notNull().default(false),
  },
  (table) => ({
    companyIdIdx: index("alert_events_company_id_idx").on(table.companyId),
    ruleIdIdx: index("alert_events_rule_id_idx").on(table.ruleId),
  }),
);
