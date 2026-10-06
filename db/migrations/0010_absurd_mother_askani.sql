CREATE TABLE IF NOT EXISTS "auth_rate_limits" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_rate_limits_window_idx" ON "auth_rate_limits" USING btree ("window_start");