import {workBrowserProxy} from './work-browser-proxy.mjs';
import {verifyWorkOwnerSession} from './work-owner-session.mjs';
export async function workMachineProxy(request,env) {
  const fail=(error,status)=>Response.json({error},{status,headers:{'cache-control':'private, no-store'}});
  if(env.WORK_DEVELOPMENT_ENABLED!=='isolated-test')return fail('development_disabled',423);
  if(!env.WORK_API_TOKEN||request.headers.get('authorization')!=='Bearer '+env.WORK_API_TOKEN)return fail('unauthorized',401);
  if(!env.WORK_DEVELOPMENT_APP_ORIGIN || request.headers.get('x-work-development-origin')!==env.WORK_DEVELOPMENT_APP_ORIGIN)return fail('origin_not_configured',403);
  const actor=await verifyWorkOwnerSession(request,{secret:env.WORK_DEVELOPMENT_SESSION_KEY,ownerId:env.WORK_DEVELOPMENT_OWNER_ID});
  if(!actor)return fail('owner_required',403);
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/work-development-machine/'))return fail('not_found',404);
  url.pathname=url.pathname.replace('/api/work-development-machine/','/api/work-development/');
  const headers=new Headers(request.headers);
  headers.set('origin',url.origin);
  return workBrowserProxy(new Request(url,{method:request.method,headers,...(request.method==='POST'?{body:await request.text()}:{})}),{env,sourceApp:'task-manager',authorize:async()=>actor});
}
