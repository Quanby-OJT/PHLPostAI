CREATE TABLE "inquiry_categories" (
	"code" text PRIMARY KEY,
	"name" text NOT NULL,
	"is_eligible" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "is_eligible" boolean;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "language" text;