// Shared adapter for development views. send is an owner-authenticated same-origin
// server proxy, never a browser bearer token. Existing production apps do not import this.
export function workViewClient({sourceApp,send}) {
  if(!['network-hq','task-manager'].includes(sourceApp))throw new Error('invalid_view');
  let state=null;
  async function request(path,method='GET',body=null) {
    const result=await send(path,method,body);
    if(!result.ok) {const error=new Error(result.body.error||'request_failed');error.status=result.status;throw error;}
    return result.body;
  }
  return {
    async refresh() {state=await request('/v2/work/state');return structuredClone(state);},
    async edit({action,entityId,patch,links,operationId=crypto.randomUUID()}) {
      if(!state)throw new Error('refresh_required');
      const kind=action.split('.')[0],key={task:'tasks',project:'projects',hub:'hubs'}[kind];
      const entity=(state[key]||[]).find(x=>x.id===entityId);
      const body={operationId,sourceApp,action,expectedVersion:state.version,...(entityId?{entityId,expectedRevision:entity?.revision}:{}),patch,...(links?{links}:{})};
      const result=await request('/v2/work/operations','POST',body);
      state=await request('/v2/work/state');return {result,state:structuredClone(state)};
    },
    async editEvent({entityId,patch,operationId=crypto.randomUUID()}) {
      if(!state)throw new Error('refresh_required');
      const event=state.events.find(x=>x.id===entityId);
      const result=await request('/v2/work/events/edit','POST',{operationId,sourceApp,action:'event.edit',entityId,expectedRevision:event?.revision,expectedVersion:state.version,patch});
      state=await request('/v2/work/state');return {result,state:structuredClone(state)};
    }
  };
}
