-- Nothing wrote to activity_log before this migration; clear any stray rows so the
-- NOT NULL program_id below can be added.
DELETE FROM "activity_log";--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'linked';--> statement-breakpoint
ALTER TYPE "public"."activity_action" ADD VALUE 'unlinked';--> statement-breakpoint
ALTER TYPE "public"."activity_entity" ADD VALUE 'checklist_item';--> statement-breakpoint
ALTER TYPE "public"."activity_entity" ADD VALUE 'whiteboard';--> statement-breakpoint
DROP INDEX IF EXISTS "activity_log_entity_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "activity_log_org_idx";--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "program_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_log" ADD COLUMN "entity_name" varchar(500) DEFAULT '' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_org_created_idx" ON "activity_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_program_created_idx" ON "activity_log" USING btree ("program_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_project_created_idx" ON "activity_log" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_task_created_idx" ON "activity_log" USING btree ("task_id","created_at");