import { WorkError, query, rows, stable, requireValue, requestContext, commitOperation, change, version } from './work-operations.mjs';

const editable = ['summary','description','location','start','end'];
export function eventFields(event) {
  const out={summary:event.summary||'',description:event.description||'',location:event.location||'',start:event.start||null,end:event.end||null,status:event.status||'confirmed'};
  return out;
}
function validateTimes(event) {
  const start=event.start, end=event.end;
  requireValue(start && end, 'event_times_required');
  const allDay=!!start.date;
  requireValue(allDay===!!end.date,'mixed_event_times');
  const pattern=allDay?/^\d{4}-\d{2}-\d{2}$/:/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/;
  const a=allDay?start.date:start.dateTime,b=allDay?end.date:end.dateTime;
  requireValue(typeof a==='string'&&typeof b==='string'&&pattern.test(a)&&pattern.test(b)&&Number.isFinite(Date.parse(a))&&Date.parse(b)>Date.parse(a),'invalid_event_range');
}
export function mergeEvent(base, local, remote) {
  const merged=structuredClone(remote), conflicts=[];
  for(const field of [...editable,'status']) {
    const localChanged=stable(local[field])!==stable(base[field]);
    const remoteChanged=stable(remote[field])!==stable(base[field]);
    if(localChanged && remoteChanged && stable(local[field])!==stable(remote[field])) conflicts.push(field);
    else if(localChanged) merged[field]=local[field];
  }
  if(remote.status==='cancelled' && stable(local)!==stable(base) && !conflicts.includes('status')) conflicts.push('status');
  return {merged,conflicts};
}
function outbox(db,id,revision,desired,etag,operationId,now) {
  return query(db,`INSERT INTO work_calendar_outbox (id,event_id,event_revision,desired_json,base_etag,status,created_at) VALUES (?,?,?,?,?,'pending',?)`,operationId+':outbox:'+id,id,revision,JSON.stringify(desired),etag,now);
}
export async function editEvent(db,body) {
  const context=await requestContext(db,body);if(context.replay)return context.replay;
  const before=await query(db,'SELECT * FROM work_event_metadata WHERE id=?',body.entityId).first();
  requireValue(before,'event_not_found',404);
  requireValue(before.revision===body.expectedRevision,'event_revision_conflict',409);
  requireValue(!['conflict','cancelled','missing'].includes(before.sync_status),'event_requires_review',409);
  requireValue(body.patch && Object.keys(body.patch).length>0 && Object.keys(body.patch).every(k=>editable.includes(k)),'invalid_event_patch');
  for(const field of ['summary','description','location'])if(field in body.patch)requireValue(typeof body.patch[field]==='string' && body.patch[field].length<=5000,'invalid_event_field');
  for(const field of ['start','end'])if(field in body.patch)requireValue(body.patch[field]&&typeof body.patch[field]==='object'&&!Array.isArray(body.patch[field])&&Object.keys(body.patch[field]).every(k=>['date','dateTime','timeZone'].includes(k))&&Object.values(body.patch[field]).every(v=>typeof v==='string'),'invalid_event_time');
  const event={...JSON.parse(before.event_json),...body.patch};validateTimes(event);
  const now=new Date().toISOString(),revision=before.revision+1;
  const after={...before,event_json:JSON.stringify(event),revision,sync_status:'pending',updated_at:now};
  const statements=[
    query(db,`UPDATE work_event_metadata SET event_json=?,revision=?,sync_status='pending',updated_at=? WHERE id=?`,after.event_json,revision,now,before.id),
    query(db,`UPDATE work_calendar_links SET sync_status='pending',revision=revision+1,last_change_source=?,updated_at=? WHERE id=?`,body.sourceApp,now,before.id),
    query(db,`UPDATE work_calendar_outbox SET status='superseded' WHERE event_id=? AND status='pending'`,before.id),
    outbox(db,before.id,revision,event,before.remote_etag,body.operationId,now),
    change(db,body,'event',before.id,before,after,revision)
  ];
  return commitOperation(db,body,context,statements,{ok:true,version:context.nextVersion,entityId:before.id,revision,syncStatus:'pending'});
}
export async function resolveEvent(db,body) {
  const context=await requestContext(db,body);if(context.replay)return context.replay;
  const before=await query(db,'SELECT * FROM work_event_metadata WHERE id=?',body.entityId).first();
  requireValue(before?.sync_status==='conflict','event_has_no_conflict',409);
  requireValue(body.expectedRevision===before.revision && body.reviewedEtag===before.remote_etag,'conflict_changed_review_again',409);
  requireValue(['remote','local'].includes(body.choice),'resolution_choice_required');
  const conflict=JSON.parse(before.conflict_json);
  requireValue(!conflict.fields.includes('recurrence'),'recurrence_requires_separate_design',409);
  requireValue(body.choice!=='local' || conflict.remote.status!=='cancelled','cannot_restore_cancelled_event',409);
  const desired=body.choice==='remote'?conflict.remote:conflict.local;
  const status=desired.status==='cancelled'?'cancelled':stable(desired)===stable(conflict.remote)?'synced':'pending';
  const now=new Date().toISOString(),revision=before.revision+1,after={...before,event_json:JSON.stringify(desired),sync_status:status,conflict_json:null,revision,updated_at:now};
  const statements=[
    query(db,`UPDATE work_event_metadata SET event_json=?,sync_status=?,conflict_json=NULL,revision=?,updated_at=? WHERE id=?`,after.event_json,status,revision,now,before.id),
    query(db,`UPDATE work_calendar_outbox SET status='superseded' WHERE event_id=? AND status IN ('conflict','pending')`,before.id),
    query(db,`UPDATE work_calendar_links SET sync_status=?,revision=revision+1,updated_at=? WHERE id=?`,status,now,before.id),
    change(db,body,'event',before.id,before,after,revision)
  ];
  if(status==='pending')statements.push(outbox(db,before.id,revision,desired,before.remote_etag,body.operationId,now));
  return commitOperation(db,body,context,statements,{ok:true,version:context.nextVersion,entityId:before.id,revision,syncStatus:status});
}
// Explicitly attach a known Calendar event; importing unrelated events never creates tasks.
export async function linkEvent(db,body,provider) {
  const context=await requestContext(db,body);if(context.replay)return context.replay;
  requireValue(typeof body.calendarId==='string'&&body.calendarId.length<=1024&&typeof body.externalEventId==='string'&&body.externalEventId.length<=1024,'event_identity_required');
  const remote=await provider.getEvent(body.calendarId,body.externalEventId);
  requireValue(remote.id===body.externalEventId && remote.etag && remote.status!=='cancelled','invalid_remote_event');
  requireValue(!remote.recurrence && !remote.recurringEventId,'recurring_event_requires_separate_design',409);
  validateTimes(remote);
  if(body.taskId)requireValue(await query(db,'SELECT id FROM work_tasks WHERE id=?',body.taskId).first(),'task_not_found');
  if(body.projectId)requireValue(await query(db,'SELECT id FROM work_projects WHERE id=?',body.projectId).first(),'project_not_found');
  const existing=await query(db,'SELECT * FROM work_event_metadata WHERE calendar_id=? AND external_event_id=?',body.calendarId,body.externalEventId).first();
  requireValue(!existing,'event_already_linked',409);
  const id='event_'+crypto.randomUUID().replaceAll('-',''),now=new Date().toISOString(),fields=JSON.stringify(eventFields(remote));
  const after={id,calendar_id:body.calendarId,external_event_id:remote.id,task_id:body.taskId||null,project_id:body.projectId||null,event_json:fields,base_json:fields,remote_etag:remote.etag,sync_status:'synced',revision:1,updated_at:now};
  return commitOperation(db,body,context,[
    query(db,`INSERT INTO work_event_metadata (id,calendar_id,external_event_id,task_id,project_id,event_json,base_json,remote_etag,sync_status,revision,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,...Object.values(after)),
    query(db,`INSERT INTO work_calendar_links (id,task_id,project_id,calendar_id,external_event_id,external_etag,sync_status,last_synced_at,last_change_source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,id,after.task_id,after.project_id,body.calendarId,remote.id,remote.etag,'synced',now,body.sourceApp,now,now),
    change(db,body,'event',id,null,after,1)
  ],{ok:true,version:context.nextVersion,entityId:id,revision:1});
}
export async function pullCalendar(db,body,provider) {
  const context=await requestContext(db,body);if(context.replay)return context.replay;
  requireValue(typeof body.calendarId==='string' && body.calendarId.length<=1024,'calendar_required');
  const cursor=await query(db,'SELECT sync_token FROM work_calendar_cursors WHERE calendar_id=?',body.calendarId).first();
  let syncToken=cursor?.sync_token||null, reset=false, events=[];
  async function collect(token) {
    const collected=[];let pageToken=null,seen=new Set();
    for(let page=0;page<100;page++) {
      const result=await provider.listEvents(body.calendarId,{syncToken:token,pageToken});
      requireValue(Array.isArray(result.items),'invalid_calendar_page',502);
      collected.push(...result.items);
      if(!result.nextPageToken) {requireValue(typeof result.nextSyncToken==='string' && result.nextSyncToken,'missing_sync_cursor',502);return {events:collected,token:result.nextSyncToken};}
      requireValue(!seen.has(result.nextPageToken),'calendar_pagination_loop',502);seen.add(result.nextPageToken);pageToken=result.nextPageToken;
    }
    throw new WorkError('calendar_page_limit',502);
  }
  let fetched;
  try{fetched=await collect(syncToken);}catch(error){if(error.status!==410 || !syncToken)throw error;reset=true;fetched=await collect(null);}
  events=fetched.events;
  const links=await rows(db,'SELECT * FROM work_event_metadata WHERE calendar_id=?',body.calendarId);
  const seen=new Set(),statements=[],now=new Date().toISOString();let index=0,changed=0,conflicts=0;
  for(const remote of events) {
    const before=links.find(e=>e.external_event_id===remote.id);if(!before)continue;seen.add(remote.id);
    requireValue(remote.etag || remote.status==='cancelled','remote_etag_required',502);
    if(remote.etag===before.remote_etag && before.sync_status!=='missing')continue;
    const local=JSON.parse(before.event_json),base=JSON.parse(before.base_json),incoming=remote.status==='cancelled'?{...base,status:'cancelled'}:eventFields(remote);
    if(incoming.status!=='cancelled')validateTimes(incoming);
    const result=mergeEvent(base,local,incoming),revision=before.revision+1;
    // An unresolved conflict cannot disappear merely because the next remote
    // change concerns a different field. Only explicit review can resolve it.
    if(before.sync_status==='conflict') {
      const previous=JSON.parse(before.conflict_json||'{}');
      result.conflicts=[...new Set([...result.conflicts,...(previous.fields||['unresolved'])])];
    }
    const recurring=remote.recurrence||remote.recurringEventId;
    if(recurring)result.conflicts.push('recurrence');
    const syncStatus=result.conflicts.length?'conflict':incoming.status==='cancelled'?'cancelled':stable(result.merged)!==stable(incoming)?'pending':'synced';
    const conflict=result.conflicts.length?JSON.stringify({fields:result.conflicts,base,local,remote:incoming}):null;
    const desired=result.conflicts.length?local:result.merged;
    const after={...before,event_json:JSON.stringify(desired),base_json:JSON.stringify(incoming),remote_etag:remote.etag||null,sync_status:syncStatus,conflict_json:conflict,revision,updated_at:now};
    statements.push(query(db,`UPDATE work_event_metadata SET event_json=?,base_json=?,remote_etag=?,sync_status=?,conflict_json=?,revision=?,updated_at=? WHERE id=?`,after.event_json,after.base_json,after.remote_etag,syncStatus,conflict,revision,now,before.id));
    statements.push(query(db,`UPDATE work_calendar_outbox SET status=? WHERE event_id=? AND status='pending'`,syncStatus==='conflict'?'conflict':'superseded',before.id));
    if(syncStatus==='pending')statements.push(outbox(db,before.id,revision,desired,remote.etag,body.operationId,now));
    statements.push(query(db,`UPDATE work_calendar_links SET external_etag=?,sync_status=?,last_synced_at=?,last_change_source='google-calendar',revision=revision+1,updated_at=? WHERE id=?`,after.remote_etag,syncStatus,now,now,before.id));
    statements.push(change(db,{...body,action:'calendar.pull'},'event',before.id,before,after,revision,index++));changed++;if(syncStatus==='conflict')conflicts++;
  }
  // Full resync absence is a review state, not permission to delete any local data.
  if(reset || !syncToken) for(const before of links)if(!seen.has(before.external_event_id)) {
    statements.push(query(db,`UPDATE work_event_metadata SET sync_status='missing',revision=revision+1,updated_at=? WHERE id=?`,now,before.id));
    statements.push(query(db,`UPDATE work_calendar_links SET sync_status='missing',revision=revision+1,updated_at=? WHERE id=?`,now,before.id));
    statements.push(query(db,`UPDATE work_calendar_outbox SET status='conflict' WHERE event_id=? AND status='pending'`,before.id));
    statements.push(change(db,{...body,action:'calendar.missing'},'event',before.id,before,{...before,sync_status:'missing'},before.revision+1,index++));changed++;
  }
  statements.push(query(db,`INSERT INTO work_calendar_cursors (calendar_id,sync_token,updated_at) VALUES (?,?,?) ON CONFLICT(calendar_id) DO UPDATE SET sync_token=excluded.sync_token,updated_at=excluded.updated_at`,body.calendarId,fetched.token,now));
  return commitOperation(db,body,context,statements,{ok:true,version:context.nextVersion,changed,conflicts,fullResync:reset});
}
export async function flushCalendar(db,body,provider) {
  const context=await requestContext(db,body);if(context.replay)return context.replay;
  const before=await query(db,'SELECT * FROM work_event_metadata WHERE id=?',body.entityId).first();
  requireValue(before?.sync_status==='pending','event_not_pending',409);
  const job=await query(db,`SELECT * FROM work_calendar_outbox WHERE event_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1`,before.id).first();
  requireValue(job && job.event_revision===before.revision,'outbox_revision_conflict',409);
  const desired=JSON.parse(job.desired_json),remote=await provider.getEvent(before.calendar_id,before.external_event_id);
  let saved=remote;
  if(stable(eventFields(remote))!==stable(desired)) {
    requireValue(remote.etag===job.base_etag && remote.status!=='cancelled' && !remote.recurrence && !remote.recurringEventId,'calendar_changed_pull_before_push',409);
    const patch=Object.fromEntries(editable.filter(k=>stable(desired[k])!==stable(eventFields(remote)[k])).map(k=>[k,desired[k]]));
    saved=await provider.patchEvent(before.calendar_id,before.external_event_id,patch,job.base_etag);
  }
  requireValue(saved.etag && stable(eventFields(saved))===stable(desired),'calendar_write_not_confirmed',502);
  const now=new Date().toISOString(),after={...before,base_json:JSON.stringify(eventFields(saved)),remote_etag:saved.etag,sync_status:'synced',revision:before.revision+1,updated_at:now};
  // If another app edit wins while the HTTP request runs, this transaction fails;
  // its durable intent remains. Retrying observes the remote echo before writing again.
  return commitOperation(db,body,context,[
    query(db,`UPDATE work_calendar_outbox SET status='sent' WHERE id=?`,job.id),
    query(db,`UPDATE work_event_metadata SET base_json=?,remote_etag=?,sync_status='synced',revision=?,updated_at=? WHERE id=?`,after.base_json,saved.etag,after.revision,now,before.id),
    query(db,`UPDATE work_calendar_links SET external_etag=?,sync_status='synced',last_synced_at=?,last_change_source=?,revision=revision+1,updated_at=? WHERE id=?`,saved.etag,now,body.sourceApp,now,before.id),
    change(db,{...body,action:'calendar.flush'},'event',before.id,before,after,after.revision)
  ],{ok:true,version:context.nextVersion,entityId:before.id,syncStatus:'synced'});
}

// Server-only transport. getAccessToken must use the existing owner-authorized
// connector/OAuth refresh mechanism. Never accept a token from browser input.
export function googleCalendarProvider({getAccessToken,fetchImpl=fetch}) {
  async function call(calendarId,path,method='GET',body=null,etag=null,params=null) {
    const url=new URL('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendarId)+'/events'+path);
    if(params)for(const [k,v] of Object.entries(params))if(v!==null&&v!==undefined)url.searchParams.set(k,String(v));
    const token=await getAccessToken();requireValue(typeof token==='string'&&token,'calendar_authorization_unavailable',503);
    const response=await fetchImpl(url,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json',...(etag?{'if-match':etag}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new WorkError('calendar_http_'+response.status,response.status);
    return response.json();
  }
  return {
    getEvent:(calendarId,id)=>call(calendarId,'/'+encodeURIComponent(id)),
    patchEvent:(calendarId,id,patch,etag)=>{requireValue(etag,'etag_required');return call(calendarId,'/'+encodeURIComponent(id),'PATCH',patch,etag);},
    listEvents:(calendarId,{syncToken,pageToken})=>call(calendarId,'','GET',null,null,{showDeleted:true,singleEvents:false,maxResults:250,syncToken,pageToken})
  };
}
