ALTER TABLE "attachments" ADD COLUMN "data" "bytea" NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" DROP COLUMN IF EXISTS "url";