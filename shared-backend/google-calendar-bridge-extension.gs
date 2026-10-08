/**
 * DEVELOPMENT ONLY. Do not replace the existing Apps Script doPost or auth code.
 * After its EXISTING secret check, dispatch the three work_calendar_* actions
 * here. Existing Calendar/Drive actions and OAuth authorization stay intact.
 * Before installation, obtain/review the exact deployed source and manifest.
 */
function handleWorkCalendarAction(payload, ownerAuthorized) {
  if(ownerAuthorized!==true)return {ok:false,status:403,error:'owner_required'};
  var props=PropertiesService.getScriptProperties();
  var enabled=props.getProperty('WORK_CALENDAR_TEST_ENABLED')==='true';
  var calendarId=String(payload.calendarId||'');
  var allowed=props.getProperty('WORK_CALENDAR_TEST_ID');
  if(!enabled || !allowed || calendarId!==allowed)return {ok:false,status:423,error:'work_calendar_disabled'};
  var actions=['work_calendar_get','work_calendar_delta','work_calendar_patch'];
  if(actions.indexOf(payload.action)<0)return {ok:false,status:400,error:'unsupported_action'};
  var base='https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(calendarId)+'/events';
  var options={method:'get',muteHttpExceptions:true,headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()}};
  var url=base;
  if(payload.action==='work_calendar_delta') {
    var query=['showDeleted=true','singleEvents=false','maxResults=250'];
    if(payload.syncToken)query.push('syncToken='+encodeURIComponent(payload.syncToken));
    if(payload.pageToken)query.push('pageToken='+encodeURIComponent(payload.pageToken));
    url+='?'+query.join('&');
  } else {
    if(typeof payload.eventId!=='string'||!payload.eventId)return {ok:false,status:400,error:'event_id_required'};
    url+='/'+encodeURIComponent(payload.eventId);
    if(payload.action==='work_calendar_patch') {
      if(typeof payload.etag!=='string'||!payload.etag)return {ok:false,status:400,error:'etag_required'};
      var patch=payload.patch;
      var fields=['summary','description','location','start','end'];
      if(!patch || Object.keys(patch).some(function(k){return fields.indexOf(k)<0;}))return {ok:false,status:400,error:'invalid_patch'};
      options.method='patch';options.contentType='application/json';options.payload=JSON.stringify(patch);options.headers['If-Match']=payload.etag;
    }
  }
  var response=UrlFetchApp.fetch(url,options),status=response.getResponseCode();
  if(status<200 || status>=300)return {ok:false,status:status,error:'calendar_http_'+status};
  var value=JSON.parse(response.getContentText());
  return payload.action==='work_calendar_delta'?{ok:true,page:value}:{ok:true,event:value};
}
