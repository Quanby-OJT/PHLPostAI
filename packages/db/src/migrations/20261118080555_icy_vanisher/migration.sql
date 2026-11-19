CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "channels" ("code", "name", "is_enabled", "config")
VALUES (
	'web-widget',
	'Website chat widget',
	true,
	'{"allowedOrigins": ["http://localhost", "http://localhost:3001"]}'
)
ON CONFLICT ("code") DO NOTHING;
