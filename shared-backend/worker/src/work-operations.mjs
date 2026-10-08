// DEVELOPMENT API. The verified Phase 1 copy cannot be edited through this module.
export class WorkError extends Error {
  constructor(code, status = 400) { super(code); this.status = status; }
}
export const query = (db, sql, ...args) => db.prepare(sql).bind(...args);
export const rows = async (db, sql, ...args) => (await query(db, sql, ...args).all()).results || [];
export const stable = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
export function requireValue(ok, code, status = 400) { if (!ok) throw new WorkError(code, status); }
export async function requireIsolated(db, env) {
  const marker = await query(db, 'SELECT value FROM work_schema_meta WHERE key=?', 'phase2_environment').first();
  requireValue(env.WORK_WRITE_MODE === 'isolated-test' && marker?.value === 'isolated-test', 'phase2_writes_disabled', 423);
  const imported = await query(db, 'SELECT COUNT(*) AS n FROM work_migration_batches').first();
  requireValue(!Number(imported?.n), 'migration_checkpoint_is_read_only', 423);
}
export async function version(db) {
  return Number((await db.prepare('SELECT COALESCE(MAX(sequence),0) AS n FROM work_operation_requests').first())?.n || 0);
}
export async function snapshot(db) {
  const before = await version(db);
  const names = { hubs:'work_hubs', projects:'work_projects', tasks:'work_tasks', taskPeople:'work_task_people', dependencies:'work_task_dependencies', resources:'work_task_resources', sourceAliases:'work_source_aliases', events:'work_event_metadata' };
  const out = { version: before, stage: 'phase2-isolated-development' };
  for (const [key, table] of Object.entries(names)) out[key] = await rows(db, `SELECT * FROM ${table}`);
  requireValue(before === await version(db), 'snapshot_changed_retry', 409);
  return out;
}
const stringFields = new Set(['title','summary','color','area','goal_id','milestone_id','display_id','classification_status','classification_confidence','proposed_designation','proposed_parent_task_id','duration_estimate','earliest_start','target_date','due_text','due_date','timing_note','next_action','waiting_on','notes','effort']);
const nullableFields = new Set(['goal_id','milestone_id','display_id','parent_project_id','parent_task_id','due_date','classification_confidence','proposed_designation','proposed_parent_task_id','today_rank']);
const taskFields = new Set([...stringFields].filter(k => !['summary','color'].includes(k)).concat(['hub_id','project_id','parent_task_id','designation','status','priority','micro_done','flow_phase','flow_order','timing_type','today_rank']));
const projectFields = new Set(['title','summary','color','area','goal_id','hub_id','parent_project_id','priority','archived']);
const hubFields = new Set(['title','summary','color','priority','archived']);
const tableFor = { task:'work_tasks', project:'work_projects', hub:'work_hubs' };
function patchFor(kind, value) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'patch_required');
  const allowed = {task:taskFields,project:projectFields,hub:hubFields}[kind];
  for (const [key, v] of Object.entries(value)) {
    requireValue(allowed.has(key), 'immutable_or_unknown_field:' + key);
    if (v === null && nullableFields.has(key)) continue;
    if (stringFields.has(key) || /_id$/.test(key)) requireValue(typeof v === 'string' && v.length <= (key==='notes'?5000:1200), 'invalid_field:' + key);
    else if (['priority','flow_order','today_rank'].includes(key)) requireValue(Number.isSafeInteger(v), 'invalid_integer:' + key);
    else if (['archived','micro_done'].includes(key)) requireValue(v === 0 || v === 1, 'invalid_boolean:' + key);
    else requireValue(typeof v === 'string', 'invalid_field:' + key);
  }
  return value;
}
function graphAcyclic(edges) {
  const graph = new Map();
  for (const [from,to] of edges) { if (!graph.has(from)) graph.set(from,[]); graph.get(from).push(to); }
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    requireValue(!visiting.has(id), 'dependency_cycle');
    if (visited.has(id)) return;
    visiting.add(id); for (const next of graph.get(id)||[]) visit(next); visiting.delete(id); visited.add(id);
  }
  for (const id of graph.keys()) visit(id);
}
export function validateState(s, profiles) {
  const hubs = new Map(s.hubs.map(x=>[x.id,x])), projects = new Map(s.projects.map(x=>[x.id,x])), tasks = new Map(s.tasks.map(x=>[x.id,x]));
  for (const [kind,entities] of [['hub',s.hubs],['project',s.projects],['task',s.tasks]]) for (const item of entities) {
    requireValue(typeof item.title === 'string' && item.title.trim().length > 0, kind+'_title_required');
    if (kind !== 'task') requireValue(item.priority >= 1 && item.priority <= 99,'invalid_priority');
  }
  for (const p of s.projects) {
    requireValue(hubs.has(p.hub_id), 'hub_not_found');
    if (p.parent_project_id) {
      const parent = projects.get(p.parent_project_id);
      requireValue(parent && parent.hub_id === p.hub_id, 'invalid_project_parent');
    }
  }
  graphAcyclic(s.projects.filter(p=>p.parent_project_id).map(p=>[p.id,p.parent_project_id]));
  for (const t of s.tasks) {
    requireValue(/^task_[a-zA-Z0-9_-]+$/.test(t.id), 'canonical_task_id_required');
    requireValue(projects.get(t.project_id)?.hub_id === t.hub_id, 'task_project_hub_mismatch');
    requireValue(['major','micro','outcome'].includes(t.designation), 'invalid_designation');
    requireValue(['Open','In Progress','Waiting','Backlog','Done','Archived'].includes(t.status), 'invalid_status');
    requireValue(Number.isInteger(t.priority) && t.priority >= 1 && t.priority <= 3, 'invalid_priority');
    requireValue(['now','next','later','waiting'].includes(t.flow_phase), 'invalid_flow_phase');
    requireValue(['hard','target','dependency','flexible'].includes(t.timing_type), 'invalid_timing_type');
    requireValue(t.designation === 'micro' ? !!t.parent_task_id : !t.parent_task_id, 'invalid_microtask_parent');
    if (t.parent_task_id) {
      const parent=tasks.get(t.parent_task_id);
      requireValue(parent && parent.id!==t.id && !parent.parent_task_id && parent.designation !== 'micro' && parent.project_id===t.project_id, 'invalid_microtask_parent');
    }
    if (t.proposed_parent_task_id) requireValue(tasks.has(t.proposed_parent_task_id) && t.proposed_parent_task_id!==t.id, 'invalid_proposed_parent');
  }
  const displayIds=s.tasks.map(t=>t.display_id).filter(Boolean);
  requireValue(new Set(displayIds).size === displayIds.length, 'duplicate_display_id');
  for (const link of s.taskPeople) requireValue(tasks.has(link.task_id) && profiles.has(link.profile_id), 'invalid_profile_link');
  for (const dep of s.dependencies) requireValue(tasks.has(dep.task_id) && tasks.has(dep.depends_on_task_id) && dep.task_id!==dep.depends_on_task_id && dep.dependency_type==='finish_to_start', 'invalid_dependency');
  graphAcyclic(s.dependencies.map(d=>[d.task_id,d.depends_on_task_id]));
  for (const resource of s.resources) {
    requireValue(tasks.has(resource.task_id), 'resource_task_missing');
    let url; try { url=new URL(resource.url); } catch { throw new WorkError('invalid_resource_url'); }
    requireValue(url.protocol==='https:', 'resource_https_required');
    requireValue(typeof resource.label==='string' && resource.label.length<=1200, 'invalid_resource_label');
    requireValue(resource.resource_type==='link' || resource.resource_type==='google_drive','metadata_reference_only');
    if(resource.resource_type==='google_drive') requireValue(resource.external_id && ['drive.google.com','docs.google.com'].includes(url.hostname),'invalid_drive_reference');
  }
}
export async function requestContext(db, body) {
  requireValue(body && typeof body==='object' && !Array.isArray(body), 'invalid_request');
  requireValue(typeof body.operationId==='string' && /^[a-zA-Z0-9:_-]{8,160}$/.test(body.operationId), 'operation_id_required');
  requireValue(['network-hq','task-manager','google-calendar','recovery'].includes(body.sourceApp), 'invalid_source_app');
  const fingerprint=stable(body);
  const previous=await query(db,'SELECT * FROM work_operation_requests WHERE operation_id=?',body.operationId).first();
  if(previous) { requireValue(previous.fingerprint===fingerprint,'operation_id_reused',409); return {replay:JSON.parse(previous.result_json)}; }
  requireValue(Number.isSafeInteger(body.expectedVersion) && body.expectedVersion===await version(db),'state_revision_conflict',409);
  return {fingerprint,nextVersion:body.expectedVersion+1};
}
export async function commitOperation(db, body, context, statements, result) {
  const now=new Date().toISOString();
  const lock=query(db,'INSERT INTO work_operation_requests (sequence,operation_id,fingerprint,result_json,source_app,created_at) VALUES (?,?,?,?,?,?)',context.nextVersion,body.operationId,context.fingerprint,JSON.stringify(result),body.sourceApp,now);
  try { await db.batch([lock,...statements]); }
  catch(error) {
    const prior=await query(db,'SELECT * FROM work_operation_requests WHERE operation_id=?',body.operationId).first();
    if(prior && prior.fingerprint===context.fingerprint) return JSON.parse(prior.result_json);
    if(await version(db)!==body.expectedVersion) throw new WorkError('state_revision_conflict',409);
    throw error;
  }
  return result;
}
export function change(db,body,kind,id,before,after,revision,index=0) {
  return query(db,`INSERT INTO work_changes (id,entity_type,entity_id,action,before_json,after_json,source_app,entity_revision,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,body.operationId+':'+index,kind,id,body.action,before?JSON.stringify(before):null,JSON.stringify(after),body.sourceApp,revision,body.operationId+':'+index,new Date().toISOString());
}
function aggregate(s,id) { return {...s.tasks.find(t=>t.id===id),people:s.taskPeople.filter(p=>p.task_id===id),dependencies:s.dependencies.filter(d=>d.task_id===id),resources:s.resources.filter(r=>r.task_id===id)}; }
export async function mutateWork(db,body) {
  const context=await requestContext(db,body); if(context.replay) return context.replay;
  const before=await snapshot(db); requireValue(before.version===body.expectedVersion,'state_revision_conflict',409);
  const after=structuredClone(before), now=new Date().toISOString();
  const [kind,verb]=String(body.action||'').split('.');
  requireValue(['create','update'].includes(verb) && tableFor[kind],'unsupported_operation');
  const key={task:'tasks',project:'projects',hub:'hubs'}[kind],collection=after[key];
  const original=verb==='update'?collection.find(x=>x.id===body.entityId):null;
  if(verb==='update') {
    requireValue(original,'entity_not_found',404);
    requireValue(body.expectedRevision===original.revision,'entity_revision_conflict',409);
  }
  const patch=patchFor(kind,body.patch), id=original?.id || kind+'_'+crypto.randomUUID().replaceAll('-','');
  const defaults=kind==='task'?{designation:'major',status:'Open',priority:2,area:'',micro_done:0,classification_status:'verified',flow_phase:'later',flow_order:999,timing_type:'flexible',title:'',project_id:'',hub_id:'',parent_task_id:null}: {title:'',summary:'',color:'',priority:50,archived:0,...(kind==='project'?{area:'',hub_id:'',parent_project_id:null}: {})};
  const next={...(original||defaults),...patch,id,revision:(original?.revision||0)+1,created_at:original?.created_at||now,updated_at:now};
  if(kind==='task') {
    const parent=after.tasks.find(t=>t.id===next.parent_task_id), project=after.projects.find(p=>p.id===next.project_id);
    if(parent) {next.designation='micro';next.project_id=parent.project_id;next.hub_id=parent.hub_id;}
    else if(project) next.hub_id=project.hub_id;
    next.last_change_source=body.sourceApp;
    next.completed_at=next.status==='Done'?original?.completed_at||now:null;
    next.archived_at=next.status==='Archived'?original?.archived_at||now:null;
  } else next.archived_at=next.archived?original?.archived_at||now:null;
  if(original) Object.assign(original,next);else collection.push(next);
  // Moving a parent moves its descendants, retaining all canonical IDs.
  if(kind==='project') {
    const moving=new Set([id]);let changed=true;
    while(changed) {changed=false;for(const p of after.projects)if(moving.has(p.parent_project_id)&&!moving.has(p.id)){moving.add(p.id);changed=true;}}
    for(const p of after.projects)if(p.id!==id && moving.has(p.id) && p.hub_id!==next.hub_id) Object.assign(p,{hub_id:next.hub_id,revision:p.revision+1,updated_at:now});
    for(const t of after.tasks)if(moving.has(t.project_id)&&t.hub_id!==next.hub_id) Object.assign(t,{hub_id:next.hub_id,revision:t.revision+1,updated_at:now,last_change_source:body.sourceApp});
  }
  if(kind==='task') {
    for(const child of after.tasks)if(child.parent_task_id===id && (child.project_id!==next.project_id||child.hub_id!==next.hub_id)) Object.assign(child,{project_id:next.project_id,hub_id:next.hub_id,revision:child.revision+1,updated_at:now,last_change_source:body.sourceApp});
    const links=body.links||{};
    requireValue(Object.keys(links).every(k=>['people','dependsOn','resources'].includes(k)),'unknown_links');
    if(links.people!==undefined) {
      requireValue(Array.isArray(links.people)&&links.people.length<=50&&new Set(links.people).size===links.people.length&&links.people.every(x=>typeof x==='string'),'invalid_people');
      after.taskPeople=after.taskPeople.filter(p=>p.task_id!==id).concat(links.people.map(profile_id=>({task_id:id,profile_id,role:'',created_at:now})));
    }
    if(links.dependsOn!==undefined) {
      requireValue(Array.isArray(links.dependsOn)&&links.dependsOn.length<=50&&new Set(links.dependsOn).size===links.dependsOn.length,'invalid_dependencies');
      after.dependencies=after.dependencies.filter(d=>d.task_id!==id).concat(links.dependsOn.map(depends_on_task_id=>({task_id:id,depends_on_task_id,dependency_type:'finish_to_start',created_at:now})));
    }
    if(links.resources!==undefined) {
      requireValue(Array.isArray(links.resources)&&links.resources.length<=30,'invalid_resources');
      after.resources=after.resources.filter(r=>r.task_id!==id).concat(links.resources.map(r=>{
        requireValue(r && Object.keys(r).every(k=>['label','url','resource_type','external_id'].includes(k)),'metadata_reference_only');
        return {id:'resource_'+crypto.randomUUID(),task_id:id,label:r.label||'',url:r.url,resource_type:r.resource_type||'link',external_id:r.external_id||null,metadata_json:null,created_at:now,updated_at:now};
      }));
    }
  } else requireValue(!body.links,'links_only_on_tasks');
  const profiles=new Set((await rows(db,'SELECT id FROM profiles WHERE archived_at IS NULL')).map(p=>p.id));
  validateState(after,profiles);
  const statements=[];let index=0;
  for(const [entityKind,k] of [['hub','hubs'],['project','projects'],['task','tasks']]) for(const item of after[k]) {
    const old=before[k].find(x=>x.id===item.id);
    if(old && stable(old)===stable(item)) continue;
    if(old) {
      const fields=Object.keys(item).filter(f=>f!=='id');
      statements.push(query(db,`UPDATE ${tableFor[entityKind]} SET ${fields.map(f=>f+'=?').join(',')} WHERE id=?`,...fields.map(f=>item[f]),item.id));
    } else {
      const fields=Object.keys(item);
      statements.push(query(db,`INSERT INTO ${tableFor[entityKind]} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,...fields.map(f=>item[f])));
    }
    statements.push(change(db,body,entityKind,item.id,entityKind==='task'&&old?aggregate(before,item.id):old,entityKind==='task'?aggregate(after,item.id):item,item.revision,index++));
  }
  if(kind==='task') for(const [k,table] of [['taskPeople','work_task_people'],['dependencies','work_task_dependencies'],['resources','work_task_resources']]) {
    if(stable(before[k])===stable(after[k])) continue;
    statements.push(query(db,`DELETE FROM ${table} WHERE task_id=?`,id));
    for(const item of after[k].filter(x=>x.task_id===id)) {const fields=Object.keys(item);statements.push(query(db,`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,...Object.values(item)));}
  }
  return commitOperation(db,body,context,statements,{ok:true,version:context.nextVersion,entityId:id,revision:next.revision});
}
