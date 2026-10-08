import { requireIsolated, requireValue, rows, version } from './work-operations.mjs';
import { pullCalendar, flushCalendar } from './calendar-sync.mjs';

// Bind this to an authorized server scheduler only after live integration tests.
// No schedule, webhook channel or production provider is installed by this code.
export async function calendarCycle(env,calendarIds) {
  await requireIsolated(env.DB,env);
  requireValue(env.CALENDAR_PROVIDER,'calendar_provider_not_bound',503);
  requireValue(Array.isArray(calendarIds)&&calendarIds.length<=10&&calendarIds.every(id=>typeof id==='string'&&id.length<=1024),'invalid_calendar_list');
  const outcomes=[];
  async function body(action,extra){return {operationId:'cycle_'+crypto.randomUUID(),sourceApp:'google-calendar',action,expectedVersion:await version(env.DB),...extra};}
  for(const calendarId of calendarIds) {
    try {
      const pulled=await pullCalendar(env.DB,await body('calendar.pull',{calendarId}),env.CALENDAR_PROVIDER);
      outcomes.push({calendarId,pulled:true,changed:pulled.changed,conflicts:pulled.conflicts});
      const pending=await rows(env.DB,"SELECT id FROM work_event_metadata WHERE calendar_id=? AND sync_status='pending' LIMIT 50",calendarId);
      for(const event of pending) {
        try {await flushCalendar(env.DB,await body('calendar.flush',{entityId:event.id}),env.CALENDAR_PROVIDER);outcomes.push({eventId:event.id,sent:true});}
        catch(error) {outcomes.push({eventId:event.id,sent:false,error:error.message});}
      }
    } catch(error) {outcomes.push({calendarId,pulled:false,error:error.message});}
  }
  return {ok:outcomes.every(x=>x.pulled!==false&&x.sent!==false),outcomes};
}
