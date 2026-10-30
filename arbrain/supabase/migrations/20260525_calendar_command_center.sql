-- Mission Control Calendar Command Center
-- Google Calendar remains the source of truth. These tables are local mirrors,
-- preferences, sync state, and task links.

CREATE TABLE IF NOT EXISTS calendar_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('personal', 'business')),
  google_calendar_id text NOT NULL,
  summary text NOT NULL,
  description text,
  background_color text,
  foreground_color text,
  access_role text,
  time_zone text,
  selected boolean NOT NULL DEFAULT true,
  hidden boolean NOT NULL DEFAULT false,
  primary_calendar boolean NOT NULL DEFAULT false,
  sync_enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_email, google_calendar_id)
);

CREATE TABLE IF NOT EXISTS calendar_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email text NOT NULL,
  google_calendar_id text NOT NULL,
  sync_token text,
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  stale boolean NOT NULL DEFAULT false,
  watch_channel_id text,
  watch_resource_id text,
  watch_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_email, google_calendar_id)
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_event_id text NOT NULL,
  title text NOT NULL DEFAULT 'Sin titulo',
  description text NOT NULL DEFAULT '',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  account_type text NOT NULL DEFAULT 'personal',
  calendar_id text NOT NULL,
  calendar_name text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  synced_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS account_email text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS ical_uid text,
  ADD COLUMN IF NOT EXISTS html_link text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS time_zone text,
  ADD COLUMN IF NOT EXISTS color_id text,
  ADD COLUMN IF NOT EXISTS transparency text,
  ADD COLUMN IF NOT EXISTS visibility text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS recurring_event_id text,
  ADD COLUMN IF NOT EXISTS original_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurrence jsonb,
  ADD COLUMN IF NOT EXISTS attendees jsonb,
  ADD COLUMN IF NOT EXISTS reminders jsonb,
  ADD COLUMN IF NOT EXISTS organizer jsonb,
  ADD COLUMN IF NOT EXISTS creator jsonb,
  ADD COLUMN IF NOT EXISTS hangout_link text,
  ADD COLUMN IF NOT EXISTS conference_data jsonb,
  ADD COLUMN IF NOT EXISTS extended_properties jsonb,
  ADD COLUMN IF NOT EXISTS google_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS etag text,
  ADD COLUMN IF NOT EXISTS raw jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Edición del alumno: la migración original rellenaba account_email de filas históricas con las
-- cuentas de su autor. Una base nueva no tiene filas previas; solo se conserva el relleno del calendario.
UPDATE calendar_events
SET google_calendar_id = COALESCE(google_calendar_id, calendar_id)
WHERE google_calendar_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_google_event_account_idx
  ON calendar_events (google_event_id, account_type);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_source_event_idx
  ON calendar_events (account_email, google_calendar_id, google_event_id);

CREATE INDEX IF NOT EXISTS calendar_events_range_idx
  ON calendar_events (start_at, end_at);

CREATE TABLE IF NOT EXISTS task_calendar_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  account_email text NOT NULL,
  google_calendar_id text NOT NULL,
  google_event_id text NOT NULL,
  link_type text NOT NULL DEFAULT 'scheduled_block',
  created_by_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, account_email, google_calendar_id, google_event_id)
);

ALTER TABLE calendar_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_calendar_links ENABLE ROW LEVEL SECURITY;

-- Reads are primarily served through authenticated API routes with service role.
-- These permissive read policies keep future client-side read paths available
-- without exposing writes to browsers.
DROP POLICY IF EXISTS calendar_sources_read_authenticated ON calendar_sources;
CREATE POLICY calendar_sources_read_authenticated
  ON calendar_sources FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS calendar_events_read_authenticated ON calendar_events;
CREATE POLICY calendar_events_read_authenticated
  ON calendar_events FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS task_calendar_links_read_authenticated ON task_calendar_links;
CREATE POLICY task_calendar_links_read_authenticated
  ON task_calendar_links FOR SELECT
  TO authenticated
  USING (true);
