DROP INDEX "subscriptions_company_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_company_id_uniq" ON "subscriptions" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_tickers_company_ticker_uniq" ON "watchlist_tickers" USING btree ("company_id","ticker");--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_condition_type_check" CHECK (condition_type IN ('price_above', 'price_below', 'percent_change', 'volume_spike', 'earnings_date'));