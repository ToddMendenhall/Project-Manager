ALTER TABLE "comments" DROP CONSTRAINT "comments_exactly_one_parent";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "whiteboard_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_whiteboard_id_whiteboards_id_fk" FOREIGN KEY ("whiteboard_id") REFERENCES "public"."whiteboards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_whiteboard_idx" ON "comments" USING btree ("whiteboard_id");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_exactly_one_parent" CHECK (num_nonnulls("comments"."task_id", "comments"."checklist_item_id", "comments"."whiteboard_id") = 1);