-- ── 011_webhooks.sql ─────────────────────────────────────────────────────────
-- Webhook configuration per store + delivery log

-- Add webhook fields to stores
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS webhook_url        TEXT,
  ADD COLUMN IF NOT EXISTS webhook_secret     TEXT,
  ADD COLUMN IF NOT EXISTS webhook_events     TEXT[] DEFAULT ARRAY['audit_complete'],
  ADD COLUMN IF NOT EXISTS webhook_enabled    BOOLEAN NOT NULL DEFAULT FALSE;

-- Delivery log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  event           TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  response_status INTEGER,
  response_body   TEXT,
  success         BOOLEAN     NOT NULL DEFAULT FALSE,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_store_idx ON webhook_deliveries(store_id, created_at DESC);

-- RLS
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_deliveries_own" ON webhook_deliveries
  FOR ALL TO authenticated
  USING  (store_id IN (SELECT id FROM stores WHERE user_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE user_id = auth.uid()));
