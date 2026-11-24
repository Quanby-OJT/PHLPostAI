CREATE TABLE "rate_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"file_name" text NOT NULL,
	"row_count" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"batch_id" uuid NOT NULL,
	"service_code" text NOT NULL,
	"service_name" text NOT NULL,
	"zone" text NOT NULL,
	"weight_min_g" integer NOT NULL,
	"weight_max_g" integer NOT NULL,
	"price_centavos" integer NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_batches_status_idx" ON "rate_batches" ("status");--> statement-breakpoint
CREATE INDEX "rate_entries_lookup_idx" ON "rate_entries" ("service_code","zone","status");--> statement-breakpoint
CREATE INDEX "rate_entries_batch_idx" ON "rate_entries" ("batch_id");--> statement-breakpoint
ALTER TABLE "rate_batches" ADD CONSTRAINT "rate_batches_submitted_by_users_id_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "rate_batches" ADD CONSTRAINT "rate_batches_reviewed_by_users_id_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "rate_entries" ADD CONSTRAINT "rate_entries_batch_id_rate_batches_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "rate_batches"("id") ON DELETE CASCADE;