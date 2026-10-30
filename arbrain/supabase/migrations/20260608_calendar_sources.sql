-- calendar_sources: lista COMPLETA de calendarios de Google (no derivada de eventos).
-- Sin esta tabla, listMirrorCalendarSources() cae al fallback sourceFromEventRows()
-- que solo conoce calendarios CON eventos en el mirror, asi que un calendario vacio
-- no aparece como seleccionable al crear/editar un evento.
-- Poblada por claudeclaw/scripts/analytics/calendar_sync.sh (gog cal calendars).

CREATE TABLE IF NOT EXISTS calendar_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_email text NOT NULL,
  account_type text NOT NULL,
  google_calendar_id text NOT NULL,
  summary text,
  description text,
  background_color text,
  foreground_color text,
  access_role text,
  time_zone text,
  selected boolean DEFAULT true,
  hidden boolean DEFAULT false,
  primary_calendar boolean DEFAULT false,
  sync_enabled boolean DEFAULT true,
  last_seen_at timestamptz DEFAULT now(),
  UNIQUE (account_type, google_calendar_id)
);
