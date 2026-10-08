import { WorkError, requireIsolated, snapshot, mutateWork } from './work-operations.mjs';
import { editEvent, resolveEvent, linkEvent, pullCalendar, flushCalendar } from './calendar-sync.mjs';

function response(body,status=200) {return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});}
export default {
  async fetch(request,env) {
    if(!env.WORK_API_TOKEN || request.headers.get('authorization')!=='Bearer '+env.WORK_API_TOKEN)return response({error:'unauthorized'},401);
    try {
      await requireIsolated(env.DB,env);
      const path=new URL(request.url).pathname;
      if(request.method==='GET' && path==='/v2/work/state')return response(await snapshot(env.DB));
      if(request.method!=='POST')return response({error:'not_found'},404);
      if(Number(request.headers.get('content-length')||0)>65536)throw new WorkError('request_too_large',413);
      const raw=await request.text();if(raw.length>65536)throw new WorkError('request_too_large',413);
      let body;try{body=JSON.parse(raw);}catch{throw new WorkError('invalid_json');}
      if(path==='/v2/work/operations')return response(await mutateWork(env.DB,body));
      if(path==='/v2/work/events/edit')return response(await editEvent(env.DB,body));
      if(path==='/v2/work/events/resolve')return response(await resolveEvent(env.DB,body));
      if(path.startsWith('/v2/work/calendar/')) {
        // No default provider and no implicit OAuth connection or live Calendar writes.
        if(!env.CALENDAR_PROVIDER)throw new WorkError('calendar_provider_not_bound',503);
        const methods={link:linkEvent,pull:pullCalendar,flush:flushCalendar};
        const operation=methods[path.split('/').at(-1)];if(operation)return response(await operation(env.DB,body,env.CALENDAR_PROVIDER));
      }
      return response({error:'not_found'},404);
    } catch(error) {
      if(error instanceof WorkError)return response({error:error.message,reloadRequired:error.status===409},error.status);
      // Do not return database errors, request payloads or credentials.
      return response({error:'work_operation_failed'},500);
    }
  }
};
