import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const brokerConnections = pgTable(
  "broker_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    broker: text("broker").notNull(),
    credentialsEncrypted: text("credentials_encrypted"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("broker_connections_company_id_idx").on(table.companyId),
  }),
);
