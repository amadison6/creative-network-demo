import { rows, version, requireValue, stable } from './worker/src/work-operations.mjs';

// Read-only export. Recovery never deletes or replaces existing records here.
const tables=['work_schema_meta','work_migration_batches','work_hubs','work_projects','work_tasks','work_task_people','work_task_dependencies','work_task_resources','work_source_aliases','work_calendar_links','work_event_metadata','work_calendar_outbox','work_calendar_cursors','work_changes','work_operation_requests'];
export async function exportWorkCheckpoint(db) {
  const start=await version(db),data={};
  for(const table of tables)data[table]=await rows(db,`SELECT * FROM ${table}`);
  requireValue(start===await version(db),'export_changed_retry',409);
  const payload={format:'network-hq-work-checkpoint',schemaVersion:2,workVersion:start,exportedAt:new Date().toISOString(),tables:data};
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(payload)));
  return {payload,sha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')};
}
export async function verifyWorkCheckpoint(checkpoint) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(checkpoint.payload)));
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('')===checkpoint.sha256;
}
