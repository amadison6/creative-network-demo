import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../worker/src/phase2-worker.mjs';
import { workViewClient } from '../work-view-client.mjs';
import { fixture } from './d1-fixture.mjs';
import { WorkError, stable, snapshot } from '../worker/src/work-operations.mjs';
import { googleCalendarProvider } from '../worker/src/calendar-sync.mjs';
import { exportWorkCheckpoint, verifyWorkCheckpoint } from '../export-work-checkpoint.mjs';
import { googleBridgeProvider } from '../worker/src/google-bridge-provider.mjs';
import { calendarCycle } from '../worker/src/calendar-cycle.mjs';

const f=fixture(),env=f.env;let checks=0;
function check(a,b=true){assert.deepEqual(a,b);checks++;}
async function send(path,method='GET',body=null,options={}) {
  const res=await worker.fetch(new Request('https://isolated.invalid'+path,{method,headers:{authorization:'Bearer '+(options.token||env.WORK_API_TOKEN)},...(body!==null?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),{...env,...options.env});
  return {ok:res.ok,status:res.status,body:await res.json()};
}
let serial=0;
async function op(action,patch,entityId=null,links=undefined,extra={}) {
  const s=(await send('/v2/work/state')).body,kind=action.split('.')[0],entity=s[{hub:'hubs',project:'projects',task:'tasks'}[kind]]?.find(x=>x.id===entityId);
  return send('/v2/work/operations','POST',{operationId:'fixture_op_'+(++serial),sourceApp:'network-hq',action,expectedVersion:s.version,patch,...(entityId?{entityId,expectedRevision:entity?.revision}:{}),...(links?{links}:{}),...extra});
}
const legacy=()=>stable(f.sqlite.prepare('SELECT * FROM profiles').all());const sentinel=legacy();
check((await send('/v2/work/state','GET',null,{token:'wrong'})).status,401);
check((await send('/v2/work/state','GET',null,{env:{WORK_WRITE_MODE:undefined}})).status,423);
check((await send('/v2/work/operations','POST','{')).status,400);
check((await send('/v2/work/operations','POST','a'.repeat(65537))).status,413);
let r=await op('hub.create',{title:'Fixture hub'});check(r.ok);const hub=r.body.entityId;
r=await op('hub.create',{title:'Second hub'});const hub2=r.body.entityId;
r=await op('project.create',{title:'Fixture project',hub_id:hub});check(r.ok);const project=r.body.entityId;
r=await op('project.create',{title:'Child project',hub_id:hub,parent_project_id:project});check(r.ok);const childProject=r.body.entityId;
r=await op('project.create',{title:'Other project',hub_id:hub});const otherProject=r.body.entityId;
r=await op('task.create',{title:'Major',project_id:project});check(r.ok);const task=r.body.entityId;
r=await op('task.create',{title:'Micro',parent_task_id:task});check(r.ok);const micro=r.body.entityId;
r=await op('task.create',{title:'Other major',project_id:childProject});check(r.ok);const otherTask=r.body.entityId;
check((await op('task.create',{title:'Orphan micro',designation:'micro',project_id:project})).status,400);
check((await op('task.update',{id:'task_overwrite'},task)).status,400);
check((await op('task.update',{status:'bad'},task)).status,400);
check((await op('task.update',{parent_task_id:micro},task)).status,400);
check((await op('project.update',{parent_project_id:childProject},project)).status,400);
check((await op('task.update',{},task,{people:['missing']})).status,400);
check((await op('task.update',{},task,{resources:[{label:'bytes',url:'https://example.test',bytes:'forbidden'}]})).status,400);
check((await op('task.update',{},task,{resources:[{label:'unsafe',url:'javascript:alert(1)'}]})).status,400);
r=await op('task.update',{},task,{people:['person_fixture'],dependsOn:[otherTask],resources:[{label:'Fixture document',url:'https://drive.google.com/file/d/fixture-id/view',resource_type:'google_drive',external_id:'fixture-id'}]});check(r.ok);
check((await op('task.update',{},otherTask,{dependsOn:[task]})).status,400);
r=await op('task.update',{project_id:otherProject},task);check(r.ok);
let s=(await send('/v2/work/state')).body;
check(s.tasks.find(t=>t.id===micro).project_id,otherProject);check(s.taskPeople.length,1);check(s.resources.length,1);
r=await op('project.update',{hub_id:hub2},project);check(r.ok);
s=(await send('/v2/work/state')).body;
check(s.projects.find(p=>p.id===childProject).hub_id,hub2);check(s.tasks.find(t=>t.id===otherTask).hub_id,hub2);
r=await op('task.update',{micro_done:1},micro);check(r.ok);
r=await op('task.update',{status:'Done'},task);check(r.ok);
s=(await send('/v2/work/state')).body;check(!!s.tasks.find(t=>t.id===task).completed_at);
r=await op('task.update',{status:'Open'},task);check(r.ok);
s=(await send('/v2/work/state')).body;check(s.tasks.find(t=>t.id===task).completed_at,null);

// Two development view adapters, same canonical backend, stale edit rejected.
const network=workViewClient({sourceApp:'network-hq',send}),manager=workViewClient({sourceApp:'task-manager',send});
await network.refresh();await manager.refresh();
await network.edit({action:'task.update',entityId:task,patch:{notes:'Network view edit'}});
await assert.rejects(()=>manager.edit({action:'task.update',entityId:task,patch:{notes:'stale overwrite'}}),e=>e.status===409);checks++;
check((await manager.refresh()).tasks.find(t=>t.id===task).notes,'Network view edit');
await manager.edit({action:'task.update',entityId:task,patch:{notes:'Manager view edit'}});
check((await network.refresh()).tasks.find(t=>t.id===task).notes,'Manager view edit');

// Idempotency, simultaneous writes and transaction rollback.
s=(await send('/v2/work/state')).body;
const request={operationId:'fixture_replay_001',sourceApp:'task-manager',action:'task.update',expectedVersion:s.version,expectedRevision:s.tasks.find(t=>t.id===task).revision,entityId:task,patch:{title:'Retried title'}};
const first=await send('/v2/work/operations','POST',request),again=await send('/v2/work/operations','POST',request);check(again.body,first.body);
check((await send('/v2/work/operations','POST',{...request,patch:{title:'different'}})).status,409);
s=(await send('/v2/work/state')).body;
const concurrent={...request,expectedVersion:s.version,expectedRevision:s.tasks.find(t=>t.id===task).revision,patch:{title:'Concurrent'}};
const races=await Promise.all([send('/v2/work/operations','POST',{...concurrent,operationId:'fixture_race_one'}),send('/v2/work/operations','POST',{...concurrent,operationId:'fixture_race_two'})]);check(races.map(x=>x.status).sort(),[200,409]);
const beforeFailure=stable(await snapshot(env.DB));f.failBatch();check((await op('task.update',{notes:'must rollback'},task)).status,500);check(stable(await snapshot(env.DB)),beforeFailure);
check(legacy(),sentinel);

// Fake Calendar with etags and paginated incremental changes; no network calls.
let remote={id:'remote-fixture',etag:'v1',summary:'Session',description:'',location:'Studio',start:{dateTime:'2026-10-09T20:00:00-07:00'},end:{dateTime:'2026-10-09T21:00:00-07:00'},status:'confirmed',attendees:[{email:'fixture@example.invalid'}]};
let tokenIndex=0,patches=0,failList=false,expired=false,pages=[];
env.CALENDAR_PROVIDER={
  async getEvent(){return structuredClone(remote);},
  async patchEvent(calendar,id,patch,etag){if(etag!==remote.etag)throw new WorkError('calendar_http_412',412);patches++;remote={...remote,...patch,etag:'v'+(++tokenIndex+2)};return structuredClone(remote);},
  async listEvents(calendar,{syncToken,pageToken}) {
    pages.push({syncToken,pageToken});
    if(failList)throw new WorkError('calendar_http_503',503);
    if(expired && syncToken){expired=false;throw new WorkError('calendar_http_410',410);}
    if(!pageToken)return {items:[structuredClone(remote)],nextPageToken:'second'};
    return {items:[],nextSyncToken:'cursor-'+(++tokenIndex)};
  }
};
async function cal(action,extra={}){const state=(await send('/v2/work/state')).body;return send('/v2/work/calendar/'+action,'POST',{operationId:'calendar_op_'+(++serial),sourceApp:'google-calendar',action:'calendar.'+action,expectedVersion:state.version,...extra});}
r=await cal('link',{calendarId:'fixture-calendar',externalEventId:remote.id,taskId:task});check(r.ok);const eventId=r.body.entityId;
r=await cal('pull',{calendarId:'fixture-calendar'});check(r.ok);check(pages.at(-2).pageToken,null);check(pages.at(-1).pageToken,'second');
await network.refresh();await manager.refresh();
await network.editEvent({entityId:eventId,patch:{summary:'App edit'}});
check((await manager.refresh()).events.find(e=>e.id===eventId).sync_status,'pending');
r=await cal('flush',{entityId:eventId});check(r.ok);check(remote.summary,'App edit');check(patches,1);check(remote.attendees.length,1);
remote={...remote,location:'Direct Calendar edit',etag:'remote-direct'};
r=await cal('pull',{calendarId:'fixture-calendar'});check(r.ok);
check(JSON.parse((await network.refresh()).events.find(e=>e.id===eventId).event_json).location,'Direct Calendar edit');
check(JSON.parse((await manager.refresh()).events.find(e=>e.id===eventId).event_json).location,'Direct Calendar edit');
// Different-field edits merge; same-field edits preserve both versions for review.
await manager.editEvent({entityId:eventId,patch:{summary:'Local pending'}});
remote={...remote,location:'Remote non-conflicting',etag:'remote-independent'};
r=await cal('pull',{calendarId:'fixture-calendar'});check(r.ok);
s=(await send('/v2/work/state')).body;let e=s.events.find(x=>x.id===eventId);check(e.sync_status,'pending');check(JSON.parse(e.event_json).summary,'Local pending');check(JSON.parse(e.event_json).location,'Remote non-conflicting');
r=await cal('flush',{entityId:eventId});check(r.ok);check(remote.summary,'Local pending');
await network.refresh();await network.editEvent({entityId:eventId,patch:{summary:'Local collision'}});
remote={...remote,summary:'Remote collision',etag:'remote-conflict'};
r=await cal('pull',{calendarId:'fixture-calendar'});check(r.body.conflicts,1);
e=(await send('/v2/work/state')).body.events.find(x=>x.id===eventId);check(e.sync_status,'conflict');check(JSON.parse(e.conflict_json).local.summary,'Local collision');check(JSON.parse(e.conflict_json).remote.summary,'Remote collision');
remote={...remote,location:'Later unrelated remote edit',etag:'remote-after-conflict'};
r=await cal('pull',{calendarId:'fixture-calendar'});check(r.body.conflicts,1);
check((await cal('flush',{entityId:eventId})).status,409);
e=(await send('/v2/work/state')).body.events.find(x=>x.id===eventId);
async function resolve(choice,etag) {const state=(await send('/v2/work/state')).body;return send('/v2/work/events/resolve','POST',{operationId:'resolve_op_'+(++serial),sourceApp:'network-hq',action:'event.resolve',expectedVersion:state.version,entityId:eventId,expectedRevision:e.revision,reviewedEtag:etag,choice});}
check((await resolve('local','old-etag')).status,409);
r=await resolve('remote',e.remote_etag);check(r.ok);check(r.body.syncStatus,'synced');
await network.refresh();await network.editEvent({entityId:eventId,patch:{description:'Durable intent'}});
const pendingBefore=stable(f.sqlite.prepare('SELECT * FROM work_calendar_outbox').all());
const savedPatch=env.CALENDAR_PROVIDER.patchEvent;
env.CALENDAR_PROVIDER.patchEvent=async()=>{throw new WorkError('calendar_http_412',412);};
check((await cal('flush',{entityId:eventId})).status,412);check(stable(f.sqlite.prepare('SELECT * FROM work_calendar_outbox').all()),pendingBefore);
env.CALENDAR_PROVIDER.patchEvent=savedPatch;
// Crash after remote write but before local acknowledgment: retry recognizes echo.
f.failBatch();check((await cal('flush',{entityId:eventId})).status,500);
const patchesAfterCrash=patches;r=await cal('flush',{entityId:eventId});check(r.ok);check(patches,patchesAfterCrash);
// Failure never advances cursor or discards local data; expired token resync retains tasks.
const cursorBefore=f.sqlite.prepare('SELECT * FROM work_calendar_cursors').get();failList=true;check((await cal('pull',{calendarId:'fixture-calendar'})).status,503);check(f.sqlite.prepare('SELECT * FROM work_calendar_cursors').get(),cursorBefore);failList=false;
expired=true;r=await cal('pull',{calendarId:'fixture-calendar'});check(r.body.fullResync);check(f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_tasks').get().n,3);
// Remote cancellation affects schedule metadata, not task completion or deletion.
remote={id:remote.id,etag:'cancelled',status:'cancelled'};
r=await cal('pull',{calendarId:'fixture-calendar'});check(r.ok);check(f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_tasks').get().n,3);check(f.sqlite.prepare('SELECT status FROM work_tasks WHERE id=?').get(task).status,'Open');
check(legacy(),sentinel);

// HTTP transport preserves sync parameters, uses server auth and If-Match.
const cancelled=(await send('/v2/work/state')).body.events.find(x=>x.id===eventId);check(cancelled.sync_status,'cancelled');
remote={id:'all-day-fixture',etag:'all-day-v1',summary:'All-day fixture',start:{date:'2026-10-10'},end:{date:'2026-10-11'},status:'confirmed'};
r=await cal('link',{calendarId:'fixture-calendar',externalEventId:remote.id,taskId:task});check(r.ok);const allDayId=r.body.entityId;
await manager.refresh();await manager.editEvent({entityId:allDayId,patch:{summary:'All-day app edit'}});
r=await calendarCycle(env,['fixture-calendar']);check(r.ok);check(remote.summary,'All-day app edit');
remote={...remote,id:'recurring-fixture',recurrence:['RRULE:FREQ=WEEKLY']};check((await cal('link',{calendarId:'fixture-calendar',externalEventId:remote.id,taskId:task})).status,409);
const oldList=env.CALENDAR_PROVIDER.listEvents;
env.CALENDAR_PROVIDER.listEvents=async()=>({items:[],nextPageToken:'loop'});
const loopCursor=stable(f.sqlite.prepare('SELECT * FROM work_calendar_cursors').all());check((await cal('pull',{calendarId:'fixture-calendar'})).status,502);check(stable(f.sqlite.prepare('SELECT * FROM work_calendar_cursors').all()),loopCursor);
env.CALENDAR_PROVIDER.listEvents=oldList;
const captured=[];
const provider=googleCalendarProvider({getAccessToken:async()=> 'private-test-token',fetchImpl:async(url,options)=>{captured.push({url:String(url),options});return new Response(JSON.stringify({items:[],nextSyncToken:'test-token',etag:'test-etag'}),{status:200});}});
await provider.listEvents('calendar id',{syncToken:'cursor',pageToken:'page'});await provider.patchEvent('calendar id','event id',{summary:'HTTP test'},'etag-test');
check(new URL(captured[0].url).searchParams.get('syncToken'),'cursor');check(new URL(captured[0].url).searchParams.get('showDeleted'),'true');check(captured[1].options.headers['if-match'],'etag-test');check(captured[1].options.headers.authorization,'Bearer private-test-token');

const bridgeCalls=[],bridge=googleBridgeProvider({callBridge:async payload=>{bridgeCalls.push(payload);return {ok:true,event:{id:'fixture'},page:{items:[]}};}});
await bridge.patchEvent('fixture-calendar','fixture',{summary:'Bridge test'},'fixture-etag');check(bridgeCalls[0].action,'work_calendar_patch');check(bridgeCalls[0].etag,'fixture-etag');
// Export/recovery rehearsal preserves newer state before restoring old behavior.
const preserved={state:await snapshot(env.DB),changes:f.sqlite.prepare('SELECT * FROM work_changes').all(),outbox:f.sqlite.prepare('SELECT * FROM work_calendar_outbox').all(),requests:f.sqlite.prepare('SELECT * FROM work_operation_requests').all(),cursors:f.sqlite.prepare('SELECT * FROM work_calendar_cursors').all()};
const roundTrip=JSON.parse(JSON.stringify(preserved));check(stable(roundTrip),stable(preserved));
const backup=await exportWorkCheckpoint(env.DB);check(await verifyWorkCheckpoint(backup));
const tampered=structuredClone(backup);tampered.payload.workVersion++;check(await verifyWorkCheckpoint(tampered),false);
// Test restore into a fresh ephemeral DB; no production restore endpoint exists.
const restored=fixture();restored.sqlite.prepare('DELETE FROM work_schema_meta').run();restored.sqlite.exec('BEGIN');
for(const [table,items] of Object.entries(backup.payload.tables))for(const item of items){const fields=Object.keys(item);restored.sqlite.prepare('INSERT INTO '+table+' ('+fields.join(',')+') VALUES ('+fields.map(()=>'?').join(',')+')').run(...Object.values(item));}
restored.sqlite.exec('COMMIT');
check(stable(await snapshot(restored.DB)),stable(preserved.state));check(restored.sqlite.prepare('SELECT COUNT(*) AS n FROM work_changes').get().n,preserved.changes.length);
check((await send('/v2/work/operations','POST',request,{env:{WORK_WRITE_MODE:'disabled'}})).status,423);check(stable(await snapshot(env.DB)),stable(preserved.state));
// Even accidental mode enabling cannot mutate a migration checkpoint.
f.sqlite.prepare("INSERT INTO work_migration_batches (batch_id,source_name,status,created_at) VALUES ('checkpoint','fixture','verified','now')").run();
check((await send('/v2/work/state')).status,423);
const report={pass:true,checks,isolatedSqlite:true,liveWrites:0,liveCalendarCalls:0,twoDevelopmentViewAdapters:true,legacyDataUnchanged:legacy()===sentinel,productionCutover:false,scope:'shared editing + calendar contract/transport tests; not deployed or live OAuth verified'};
console.log(JSON.stringify(report,null,2));
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
