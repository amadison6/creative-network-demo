import { WorkError, requireValue } from './work-operations.mjs';

// Preserve the existing Google connection. callBridge adds NETWORK_BRIDGE_SECRET
// on the server. Never expose the bridge secret or a Google token in the browser.
// The existing deployed bridge does not yet expose these three new actions.
export function googleBridgeProvider({callBridge}) {
  async function call(action,args) {
    const result=await callBridge({action,...args});
    if(result.ok!==true)throw new WorkError(result.error||'calendar_bridge_failed',Number(result.status)||502);
    return result.event||result.page;
  }
  return {
    getEvent:(calendarId,eventId)=>call('work_calendar_get',{calendarId,eventId}),
    listEvents:(calendarId,{syncToken,pageToken})=>call('work_calendar_delta',{calendarId,syncToken,pageToken}),
    patchEvent:(calendarId,eventId,patch,etag)=>{requireValue(etag,'etag_required');return call('work_calendar_patch',{calendarId,eventId,patch,etag});}
  };
}
