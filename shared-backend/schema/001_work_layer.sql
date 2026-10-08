-- Phase 1: shared Work layer for Network HQ + Task Manager
-- Safety rule: these tables are additive. Do not DROP, rename, or rewrite existing
-- Network HQ profile, relationship, event, schedule, demo, asset, or resource tables.
--
-- Visible hierarchy: Hub -> Project -> Major Task -> Microtask
-- D1 stores structured data. Google Calendar remains the calendar-of-record for
-- linked events; Google Drive remains the file-of-record for linked documents.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS work_schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO work_schema_meta (key, value, updated_at)
VALUES ('work_schema_version', '1', datetime('now'));

CREATE TABLE IF NOT EXISTS work_migration_batches (
  batch_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_revision TEXT,
  status TEXT NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged','verified','active','failed','rolled_back')),
  expected_task_count INTEGER,
  imported_task_count INTEGER NOT NULL DEFAULT 0,
  checksum TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  verified_at TEXT,
  activated_at TEXT,
  rolled_back_at TEXT
);

CREATE TABLE IF NOT EXISTS work_hubs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 50,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS work_projects (
  id TEXT PRIMARY KEY,
  hub_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  goal_id TEXT,
  parent_project_id TEXT,
  color TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 50,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (hub_id) REFERENCES work_hubs(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (parent_project_id) REFERENCES work_projects(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS work_tasks (
  -- Immutable canonical identity, e.g. task_<hash/uuid>. Never use a legacy T-/A-
  -- display ID as the database identity.
  id TEXT PRIMARY KEY,
  display_id TEXT,
  hub_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  parent_task_id TEXT,
  title TEXT NOT NULL,
  designation TEXT NOT NULL DEFAULT 'major'
    CHECK (designation IN ('major','micro','outcome')),
  status TEXT NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open','In Progress','Waiting','Backlog','Done','Archived')),
  priority INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  area TEXT NOT NULL DEFAULT '',
  goal_id TEXT,
  milestone_id TEXT,
  micro_done INTEGER NOT NULL DEFAULT 0 CHECK (micro_done IN (0,1)),
  classification_status TEXT NOT NULL DEFAULT 'verified',
  classification_confidence TEXT,
  proposed_designation TEXT,
  proposed_parent_task_id TEXT,
  flow_phase TEXT NOT NULL DEFAULT 'later'
    CHECK (flow_phase IN ('now','next','later','waiting')),
  flow_order INTEGER NOT NULL DEFAULT 999,
  duration_estimate TEXT NOT NULL DEFAULT '',
  timing_type TEXT NOT NULL DEFAULT 'flexible'
    CHECK (timing_type IN ('hard','target','dependency','flexible')),
  earliest_start TEXT NOT NULL DEFAULT '',
  target_date TEXT NOT NULL DEFAULT '',
  due_text TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  timing_note TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  waiting_on TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'shared-work-backend',
  today_rank INTEGER,
  effort TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  last_change_source TEXT NOT NULL DEFAULT 'migration',
  migration_batch_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  archived_at TEXT,
  FOREIGN KEY (hub_id) REFERENCES work_hubs(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (project_id) REFERENCES work_projects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (parent_task_id) REFERENCES work_tasks(id) ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY (proposed_parent_task_id) REFERENCES work_tasks(id) ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY (migration_batch_id) REFERENCES work_migration_batches(batch_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CHECK (parent_task_id IS NULL OR parent_task_id <> id)
);

-- A display ID is only a human-facing label. Keep it unique inside the canonical
-- work layer, while source_aliases preserves collisions that existed in older stores.
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_tasks_display_id
  ON work_tasks(display_id) WHERE display_id IS NOT NULL AND display_id <> '';
CREATE INDEX IF NOT EXISTS idx_work_tasks_project ON work_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_work_tasks_hub ON work_tasks(hub_id);
CREATE INDEX IF NOT EXISTS idx_work_tasks_parent ON work_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_work_tasks_status ON work_tasks(status);
CREATE INDEX IF NOT EXISTS idx_work_tasks_flow ON work_tasks(project_id, flow_phase, flow_order);

CREATE TABLE IF NOT EXISTS work_task_people (
  task_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, profile_id),
  FOREIGN KEY (task_id) REFERENCES work_tasks(id) ON UPDATE CASCADE ON DELETE CASCADE
  -- profile_id intentionally has no FK in Phase 1. Network HQ profile table names
  -- are left untouched; the API validates canonical profile IDs.
);
CREATE INDEX IF NOT EXISTS idx_work_task_people_profile ON work_task_people(profile_id);

CREATE TABLE IF NOT EXISTS work_task_dependencies (
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  dependency_type TEXT NOT NULL DEFAULT 'finish_to_start',
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, depends_on_task_id),
  FOREIGN KEY (task_id) REFERENCES work_tasks(id) ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (depends_on_task_id) REFERENCES work_tasks(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS work_task_resources (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  resource_type TEXT NOT NULL DEFAULT 'link',
  external_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES work_tasks(id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_work_task_resources_task ON work_task_resources(task_id);

-- Maps every old source identity to the immutable canonical task ID. This is where
-- legacy collisions such as two unrelated records that once shared T-023 are kept safe.
CREATE TABLE IF NOT EXISTS work_source_aliases (
  source_name TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  canonical_task_id TEXT NOT NULL,
  source_status TEXT,
  source_revision TEXT,
  source_title_hash TEXT,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (source_name, source_record_id),
  FOREIGN KEY (canonical_task_id) REFERENCES work_tasks(id) ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_work_source_aliases_task ON work_source_aliases(canonical_task_id);

-- Calendar linkage metadata only. Calendar events remain owned by Google Calendar.
-- Two-way sync is activated in a later phase after the D1 work layer is verified.
CREATE TABLE IF NOT EXISTS work_calendar_links (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  project_id TEXT,
  provider TEXT NOT NULL DEFAULT 'google_calendar',
  calendar_id TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  external_etag TEXT,
  sync_status TEXT NOT NULL DEFAULT 'linked',
  last_synced_at TEXT,
  last_change_source TEXT,
  provider_updated_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES work_tasks(id) ON UPDATE CASCADE ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES work_projects(id) ON UPDATE CASCADE ON DELETE SET NULL,
  UNIQUE (provider, calendar_id, external_event_id)
);

CREATE TABLE IF NOT EXISTS work_changes (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  source_app TEXT NOT NULL,
  source_revision TEXT,
  entity_revision INTEGER NOT NULL,
  idempotency_key TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_work_changes_entity ON work_changes(entity_type, entity_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_changes_idempotency
  ON work_changes(idempotency_key) WHERE idempotency_key IS NOT NULL;
