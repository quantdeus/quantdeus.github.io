PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS analytics_events (
 event_id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, day_utc TEXT NOT NULL,
 site_id TEXT NOT NULL CHECK(site_id IN ('quantdeus-main','quantdeus-pages')),
 event_type TEXT NOT NULL CHECK(event_type IN ('page_view','outbound_click','cta_click','site_search','content_view','form_submit_success')),
 path TEXT NOT NULL, referrer_host TEXT, source TEXT NOT NULL DEFAULT 'direct', campaign TEXT,
 visitor_id TEXT NOT NULL, session_id TEXT NOT NULL, user_agent_class TEXT NOT NULL DEFAULT 'unknown',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_events_day_site ON analytics_events(day_utc,site_id);
CREATE INDEX IF NOT EXISTS idx_events_day_path ON analytics_events(day_utc,path);
CREATE INDEX IF NOT EXISTS idx_events_visitor_day ON analytics_events(day_utc,visitor_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON analytics_events(session_id);
CREATE TABLE IF NOT EXISTS analytics_visitors_daily (
 day_utc TEXT NOT NULL, site_id TEXT NOT NULL, visitor_id TEXT NOT NULL, first_seen_at TEXT NOT NULL,
 PRIMARY KEY(day_utc,site_id,visitor_id)
);
CREATE INDEX IF NOT EXISTS idx_visitors_daily_site_day ON analytics_visitors_daily(site_id,day_utc);
CREATE TABLE IF NOT EXISTS analytics_sessions (
 session_id TEXT PRIMARY KEY, site_id TEXT NOT NULL, visitor_id TEXT NOT NULL, started_at TEXT NOT NULL, day_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_day_site ON analytics_sessions(day_utc,site_id);
