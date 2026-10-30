-- Canvas v3 migration
-- Branch: levy/canvas-v3
-- Created: 2026-05-18
-- Idempotent: safe to re-run

-- Extend tabla draw (mantener v2 compat)
ALTER TABLE draw
  ADD COLUMN IF NOT EXISTS schema_version int DEFAULT 2,
  ADD COLUMN IF NOT EXISTS theme text DEFAULT 'dark' CHECK (theme IN ('light','dark','mono','system')),
  ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb;

-- Comments anclados (Miro-like)
CREATE TABLE IF NOT EXISTS draw_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid REFERENCES draw(page_id) ON DELETE CASCADE,
  element_id text,                          -- nullable: comment puede estar en punto libre
  x double precision,
  y double precision,
  parent_comment_id uuid REFERENCES draw_comments(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id),
  body text NOT NULL,
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_draw_comments_page ON draw_comments(page_id);
CREATE INDEX IF NOT EXISTS idx_draw_comments_element ON draw_comments(page_id, element_id) WHERE element_id IS NOT NULL;

-- Asset library
CREATE TABLE IF NOT EXISTS draw_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  url text NOT NULL,
  mime_type text NOT NULL,
  width int,
  height int,
  tags text[] DEFAULT '{}',
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_draw_assets_user_recent ON draw_assets(user_id, last_used_at DESC NULLS LAST);

-- Ops log (audit + recovery + agente vs humano)
CREATE TABLE IF NOT EXISTS draw_ops_log (
  id bigserial PRIMARY KEY,
  page_id uuid REFERENCES draw(page_id) ON DELETE CASCADE,
  actor text NOT NULL CHECK (actor IN ('human','agent','system')),
  actor_id text,
  expected_version int,
  resulting_version int,
  ops jsonb NOT NULL,
  applied_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_draw_ops_log_page_version ON draw_ops_log(page_id, resulting_version);

-- RLS: comments por usuario auth
ALTER TABLE draw_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS draw_comments_read ON draw_comments;
CREATE POLICY draw_comments_read ON draw_comments FOR SELECT
  USING (true);  -- todos los autenticados pueden leer comments de pages que ven
DROP POLICY IF EXISTS draw_comments_write ON draw_comments;
CREATE POLICY draw_comments_write ON draw_comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);
DROP POLICY IF EXISTS draw_comments_update ON draw_comments;
CREATE POLICY draw_comments_update ON draw_comments FOR UPDATE
  USING (auth.uid() = author_id);
DROP POLICY IF EXISTS draw_comments_delete ON draw_comments;
CREATE POLICY draw_comments_delete ON draw_comments FOR DELETE
  USING (auth.uid() = author_id);

ALTER TABLE draw_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS draw_assets_read ON draw_assets;
CREATE POLICY draw_assets_read ON draw_assets FOR SELECT
  USING (true);
DROP POLICY IF EXISTS draw_assets_write ON draw_assets;
CREATE POLICY draw_assets_write ON draw_assets FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);  -- agent ops sin user_id

-- ops_log es server-only, no expone RLS publico
ALTER TABLE draw_ops_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS draw_ops_log_read ON draw_ops_log;
CREATE POLICY draw_ops_log_read ON draw_ops_log FOR SELECT USING (true);
-- inserts solo via service role (no policy needed, service bypasses RLS)
