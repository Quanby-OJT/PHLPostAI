CREATE TABLE "customer_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"token_hash" text NOT NULL UNIQUE,
	"channel_code" text DEFAULT 'web-widget' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"consented_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
