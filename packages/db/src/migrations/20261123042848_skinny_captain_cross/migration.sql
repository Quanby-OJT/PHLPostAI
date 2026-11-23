CREATE TABLE "status_explanations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"status_code" text NOT NULL,
	"language" text NOT NULL,
	"explanation" text NOT NULL,
	"next_steps" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_explanations_code_language_uq" UNIQUE("status_code","language")
);
