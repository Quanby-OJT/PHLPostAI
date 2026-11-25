CREATE TABLE "kpi_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL,
	"version" integer NOT NULL,
	"method" jsonb NOT NULL,
	"baseline" jsonb,
	"target" real DEFAULT 0.7 NOT NULL,
	"approved_by" text NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_definitions_code_version_unique" UNIQUE("code","version")
);
--> statement-breakpoint
CREATE INDEX "kpi_definitions_effective_from_idx" ON "kpi_definitions" ("code","effective_from");--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_approved_by_users_id_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id");