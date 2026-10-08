// Fixed namespace: no caller-selected database/table names and no legacy reads.
const tables = new Set(['profiles','work_schema_meta','work_migration_batches','work_hubs','work_projects','work_tasks','work_task_people','work_task_dependencies','work_task_resources','work_source_aliases','work_calendar_links','work_changes','work_operation_requests','work_event_metadata','work_calendar_cursors','work_calendar_outbox']);
export function testSQL(sql) {
  // Keep quoted values/comments unchanged. Rewrite only known identifiers.
  return sql.replace(/'(?:''|[^'])*'|--[^\n]*|\b[a-zA-Z_][a-zA-Z0-9_]*\b/g, token => {
    if(tables.has(token)) return 'dev_'+token;
    if(token.startsWith('idx_work_')) return 'dev_'+token;
    if(token.startsWith('work_')) throw new Error('unmapped_test_identifier');
    return token;
  });
}
export function testDatabase(db) {
  if(!db?.prepare || !db?.batch) throw new Error('test_database_missing');
  return {
    prepare(sql) { return db.prepare(testSQL(sql)); },
    batch(statements) { return db.batch(statements); }
  };
}
