import worker from './worker/src/phase2-worker.mjs';
import { testDatabase } from './work-test-boundary.mjs';

const paths=new Map([
  ['state',['GET','/v2/work/state']],
  ['operations',['POST','/v2/work/operations']],
  ['events/edit',['POST','/v2/work/events/edit']],
  ['events/resolve',['POST','/v2/work/events/resolve']]
]);
const json=(body,status)=>Response.json(body,{status,headers:{'cache-control':'private, no-store','vary':'Cookie','x-content-type-options':'nosniff'}});

// authorize must use a trusted server identity/session, never browser-supplied identity.
export async function workBrowserProxy(request,{env,sourceApp,authorize}) {
  if(!['network-hq','task-manager'].includes(sourceApp))return json({error:'invalid_view'},403);
  if(env.WORK_DEVELOPMENT_ENABLED!=='isolated-test')return json({error:'development_disabled'},423);
  const actor=await authorize(request);
  if(!actor?.id)return json({error:'owner_required'},403);
  const url=new URL(request.url);
  const suffix=url.pathname.split('/api/work-development/')[1];
  const route=paths.get(suffix);
  if(!route || request.method!==route[0] || url.search)return json({error:'not_found'},404);
  if(request.headers.get('sec-fetch-site')==='cross-site')return json({error:'same_origin_required'},403);
  let body;
  if(request.method==='POST') {
    if(request.headers.get('origin')!==url.origin)return json({error:'same_origin_required'},403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'json_required'},415);
    if(Number(request.headers.get('content-length')||0)>65536)return json({error:'request_too_large'},413);
    const raw=await request.text();
    if(new TextEncoder().encode(raw).length>65536)return json({error:'request_too_large'},413);
    try {body=JSON.parse(raw);}catch{return json({error:'invalid_json'},400);}
    if(!body || typeof body!=='object' || Array.isArray(body))return json({error:'invalid_request'},400);
    body={...body,sourceApp,actorId:actor.id};
  }
  if(!env.WORK_API_TOKEN)return json({error:'development_not_configured'},503);
  try {
    const DB=testDatabase(env.DB);
    const forwarded=new Request('https://internal.invalid'+route[1],{
      method:request.method,
      headers:{authorization:'Bearer '+env.WORK_API_TOKEN,'content-type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    // No Google provider is bound here: browser routes cannot invoke live Calendar.
    const result=await worker.fetch(forwarded,{DB,WORK_API_TOKEN:env.WORK_API_TOKEN,WORK_WRITE_MODE:'isolated-test'});
    const data=await result.json();
    if(result.ok && suffix==='state') {
      data.testProfiles=(await DB.prepare('SELECT id, notes FROM profiles WHERE archived_at IS NULL').all()).results;
      data.environment='synthetic-development';
    }
    return json(data,result.status);
  }catch{return json({error:'development_unavailable'},503);}
}
