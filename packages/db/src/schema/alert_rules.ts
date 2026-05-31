import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const alertRules = pgTable(
  "alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    conditionType: text("condition_type").notNull(),
    threshold: text("threshold"),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("alert_rules_company_id_idx").on(table.companyId),
  }),
);
