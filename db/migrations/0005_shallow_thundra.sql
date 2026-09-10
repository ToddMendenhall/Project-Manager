ALTER TABLE "portfolios" ADD COLUMN "sort_order" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "sort_order" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "sort_order" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "sort_order" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill so existing Board columns keep their current newest-first order
-- instead of every row tying at the 0 default (negative epoch seconds, so
-- ascending sort_order still shows the newest row first, same as every
-- Board query's prior `desc(createdAt)`).
UPDATE "portfolios" SET "sort_order" = -extract(epoch from "created_at");--> statement-breakpoint
UPDATE "programs" SET "sort_order" = -extract(epoch from "created_at");--> statement-breakpoint
UPDATE "projects" SET "sort_order" = -extract(epoch from "created_at");--> statement-breakpoint
UPDATE "tasks" SET "sort_order" = -extract(epoch from "created_at");