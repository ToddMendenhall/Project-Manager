CREATE TABLE IF NOT EXISTS "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"status" "status" DEFAULT 'not_started' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"assignee_id" uuid,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "task_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ALTER COLUMN "task_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "checklist_item_id" uuid;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "checklist_item_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checklist_items_task_idx" ON "checklist_items" USING btree ("task_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attachments" ADD CONSTRAINT "attachments_checklist_item_id_checklist_items_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_checklist_item_id_checklist_items_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_checklist_item_idx" ON "attachments" USING btree ("checklist_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_checklist_item_idx" ON "comments" USING btree ("checklist_item_id");--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_exactly_one_parent" CHECK (("attachments"."task_id" is not null) <> ("attachments"."checklist_item_id" is not null));--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_exactly_one_parent" CHECK (("comments"."task_id" is not null) <> ("comments"."checklist_item_id" is not null));