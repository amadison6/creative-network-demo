import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Dispatcher reference reviewed from private Library connector source v2.
// No installation secret, private spreadsheet IDs or source export is included.
const dispatcher="function doPost(event) {\n  try {\n    const payload = JSON.parse(\n      (event && event.postData && event.postData.contents) || \"{}\",\n    );\n    requireSecret_(payload.secret);\n    if (/^work_calendar_(get|delta|patch)$/.test(payload.action)) {\n      return json_(handleWorkCalendarAction(payload, true));\n    }\n\n    if (payload.action === \"list\") {\n      return json_(listNetworkSnapshot_());\n    }\n    if (payload.action === \"complete\") {\n      return json_(completeTask_(String(payload.taskId || \"\")));\n    }\n    if (payload.action === \"calendar_status\") {\n      return json_(calendarStatus_());\n    }\n    if (payload.action === \"calendar_list\") {\n      return json_(calendarList_(payload.start, payload.end));\n    }\n    if (payload.action === \"calendar_upsert\") {\n      return json_(calendarUpsert_(payload.schedule));\n    }\n    if (payload.action === \"calendar_sync_batch\") {\n      return json_(calendarSyncBatch_(payload.schedule));\n    }\n    return json_({ ok: false, error: \"unsupported_action\" });\n  } catch (error) {\n    return json_({\n      ok: false,\n      error: error && error.message ? error.message : \"bridge_error\",\n    });\n  }\n}";
const calls=[],props=new Map([['WORK_CALENDAR_TEST_ENABLED','true'],['WORK_CALENDAR_TEST_ID','fixture-calendar']]);
let httpStatus=200;
const context={
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key)})},
  ScriptApp:{getOAuthToken:()=> 'test-only-oauth'},
  UrlFetchApp:{fetch:(url,options)=>{calls.push({url,options});return {getResponseCode:()=>httpStatus,getContentText:()=>JSON.stringify({id:'fixture-event',etag:'fixture-etag',items:[],nextSyncToken:'fixture-cursor'})};}},
  json_:value=>value,
  requireSecret_:value=>{if(value!=='synthetic-test-secret')throw new Error('unauthorized');},
  listNetworkSnapshot_:()=>({ok:true,legacy:'list'}),
  completeTask_:()=>({ok:true,legacy:'complete'}),
  calendarStatus_:()=>({ok:true,legacy:'calendar_status'}),
  calendarList_:()=>({ok:true,legacy:'calendar_list'}),
  calendarUpsert_:()=>({ok:true,legacy:'calendar_upsert'}),
  calendarSyncBatch_:()=>({ok:true,legacy:'calendar_sync_batch'})
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../google-calendar-bridge-extension.gs',import.meta.url),'utf8')+'\n'+dispatcher,context);
const call=payload=>context.doPost({postData:{contents:JSON.stringify({secret:'synthetic-test-secret',calendarId:'fixture-calendar',...payload})}});
let checks=0;function equal(actual,expected){assert.equal(actual,expected);checks++;}
for(const action of ['list','complete','calendar_status','calendar_list','calendar_upsert','calendar_sync_batch'])equal(call({action}).legacy,action);
equal(call({action:'work_calendar_get',secret:'wrong',eventId:'fixture-event'}).error,'unauthorized');equal(calls.length,0);
equal(context.handleWorkCalendarAction({},false).status,403);
equal(call({action:'work_calendar_get',calendarId:'unapproved-calendar',eventId:'fixture-event'}).status,423);
equal(call({action:'work_calendar_patch',eventId:'fixture-event',patch:{summary:'Fixture'}}).status,400);
equal(call({action:'work_calendar_patch',eventId:'fixture-event',etag:'fixture-etag',patch:{attendees:[]}}).status,400);
equal(call({action:'work_calendar_patch',eventId:'fixture-event',etag:'fixture-etag',patch:{summary:'Fixture'}}).ok,true);
equal(calls.at(-1).options.headers['If-Match'],'fixture-etag');
equal(calls.at(-1).options.headers.Authorization,'Bearer test-only-oauth');
httpStatus=412;equal(call({action:'work_calendar_patch',eventId:'fixture-event',etag:'old-etag',patch:{summary:'Fixture'}}).status,412);
httpStatus=200;equal(call({action:'work_calendar_delta',syncToken:'cursor',pageToken:'page'}).page.nextSyncToken,'fixture-cursor');
equal(new URL(calls.at(-1).url).searchParams.get('syncToken'),'cursor');equal(new URL(calls.at(-1).url).searchParams.get('showDeleted'),'true');
props.set('WORK_CALENDAR_TEST_ENABLED','false');equal(call({action:'work_calendar_get',eventId:'fixture-event'}).status,423);
console.log(JSON.stringify({pass:true,checks,legacyHandlersPreserved:true,authBeforeDispatch:true,liveGoogleCalls:0}));

