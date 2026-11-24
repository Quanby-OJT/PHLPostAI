CREATE TABLE "official_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "official_contacts_kind_value_uq" UNIQUE("kind","value"),
	CONSTRAINT "official_contacts_kind_check" CHECK ("kind" in ('domain', 'sender', 'payment-channel'))
);
--> statement-breakpoint
CREATE TABLE "risk_indicators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"code" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"weight" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scam_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"submission_id" uuid NOT NULL UNIQUE,
	"risk_level" text NOT NULL,
	"indicators" jsonb NOT NULL,
	"confidence" real NOT NULL,
	"guidance_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scam_assessments_risk_check" CHECK ("risk_level" in ('low', 'medium', 'high', 'uncertain')),
	CONSTRAINT "scam_assessments_indicators_check" CHECK (jsonb_typeof("indicators") = 'array'),
	CONSTRAINT "scam_assessments_confidence_check" CHECK ("confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "scam_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"conversation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content_masked" text NOT NULL,
	"extracted_urls" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scam_submissions_kind_check" CHECK ("kind" in ('text', 'link', 'email', 'image')),
	CONSTRAINT "scam_submissions_urls_check" CHECK (jsonb_typeof("extracted_urls") = 'array')
);
--> statement-breakpoint
CREATE INDEX "scam_submissions_conversation_idx" ON "scam_submissions" ("conversation_id");--> statement-breakpoint
ALTER TABLE "scam_assessments" ADD CONSTRAINT "scam_assessments_submission_id_scam_submissions_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "scam_submissions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "scam_submissions" ADD CONSTRAINT "scam_submissions_conversation_id_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;
--> statement-breakpoint
INSERT INTO "risk_indicators" ("code", "name", "weight") VALUES
	('payment_request', 'Request for payment', 1),
	('unofficial_domain', 'Domain outside the official list', 1),
	('suspicious_link', 'Unusual or unreadable link', 1),
	('prompt_injection', 'Instructions aimed at the assistant', 1),
	('information_request', 'Request for sensitive information', 1),
	('impersonation', 'Possible impersonation', 1),
	('urgency', 'Pressure to act quickly', 1)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
-- PHLPost's website and its published Track and Trace destination.
INSERT INTO "official_contacts" ("kind", "value") VALUES
	('domain', 'phlpost.gov.ph'),
	('domain', 'www.phlpost.gov.ph'),
	('domain', 'tracking.phlpost.gov.ph')
ON CONFLICT ("kind", "value") DO NOTHING;
