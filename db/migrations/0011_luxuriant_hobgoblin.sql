ALTER TABLE "whiteboards" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "whiteboards" ADD COLUMN "program_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whiteboards_project_idx" ON "whiteboards" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whiteboards_program_idx" ON "whiteboards" USING btree ("program_id");--> statement-breakpoint
ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_at_most_one_link" CHECK (num_nonnulls("whiteboards"."project_id", "whiteboards"."program_id") <= 1);