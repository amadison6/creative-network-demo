-- Phase 2 DEVELOPMENT ONLY: not applied to production.
-- No legacy tables, file bytes, active-batch flags or production routes are changed.
CREATE TABLE IF NOT EXISTS work_operation_requests (
  sequence INTEGER PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  result_json TEXT NOT NULL,
  source_app TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_event_metadata (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  task_id TEXT,
  project_id TEXT,
  event_json TEXT NOT NULL,
  base_json TEXT NOT NULL,
  remote_etag TEXT,
  sync_status TEXT NOT NULL CHECK(sync_status IN ('synced','pending','conflict','cancelled','missing')),
  conflict_json TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(task_id) REFERENCES work_tasks(id) ON DELETE RESTRICT,
  FOREIGN KEY(project_id) REFERENCES work_projects(id) ON DELETE RESTRICT,
  UNIQUE(calendar_id,external_event_id)
);

CREATE TABLE IF NOT EXISTS work_calendar_cursors (
  calendar_id TEXT PRIMARY KEY,
  sync_token TEXT,
  updated_at TEXT NOT NULL
);

-- Outbox intent is saved in the same transaction as an app edit.
CREATE TABLE IF NOT EXISTS work_calendar_outbox (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_revision INTEGER NOT NULL,
  desired_json TEXT NOT NULL,
  base_etag TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','sent','conflict','superseded')),
  created_at TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES work_event_metadata(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_work_calendar_outbox_pending ON work_calendar_outbox(status,event_id);
