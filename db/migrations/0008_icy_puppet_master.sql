ALTER TABLE "attachments" DROP CONSTRAINT "attachments_exactly_one_parent";--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "whiteboard_id" uuid;--> statement-breakpoint
ALTER TABLE "whiteboards" ADD COLUMN "thumbnail" "bytea";--> statement-breakpoint
ALTER TABLE "whiteboards" ADD COLUMN "thumbnail_updated_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_whiteboard_id_whiteboards_id_fk" FOREIGN KEY ("whiteboard_id") REFERENCES "public"."whiteboards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_whiteboard_idx" ON "attachments" USING btree ("whiteboard_id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_exactly_one_parent" CHECK (num_nonnulls("attachments"."task_id", "attachments"."checklist_item_id", "attachments"."whiteboard_id") = 1);