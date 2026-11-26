INSERT INTO "risk_indicators" ("code", "name", "weight")
VALUES
  ('lookalike_domain', 'Link resembles an official PHLPost domain', 1),
  ('unofficial_sender', 'Sender name is outside the official PHLPost list', 1),
  ('unofficial_payment_channel', 'Payment channel is outside the official PHLPost list', 1)
ON CONFLICT ("code") DO NOTHING;
