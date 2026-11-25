CREATE TABLE "assistant_settings" (
	"key" text PRIMARY KEY,
	"value" jsonb NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "retrieval_score" real;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "groundedness_result" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "output_tokens" integer;