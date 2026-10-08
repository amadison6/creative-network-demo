import {issueWorkOwnerSession,verifyWorkOwnerSession} from './work-owner-session.mjs';
const taskOrigin='https://master-task-ledger.vercel.app';
const siteOrigin='https://creative-network-map.ausarmadison.chatgpt.site';
const fail=(error,status)=>Response.json({error},{status,headers:{'cache-control':'private, no-store'}});
export async function issueDevelopmentHandoff(request,{env,authorize}) {
  if(env.WORK_DEVELOPMENT_ENABLED!=='isolated-test')return fail('development_disabled',423);
  if(request.method!=='POST'||request.headers.get('origin')!==new URL(request.url).origin)return fail('same_origin_required',403);
  const actor=await authorize(request);
  if(!actor?.id || actor.id!==env.WORK_DEVELOPMENT_OWNER_ID)return fail('owner_required',403);
  if(env.WORK_DEVELOPMENT_APP_ORIGIN!==taskOrigin)return fail('development_not_configured',503);
  let token;
  try {token=await issueWorkOwnerSession({id:actor.id,audience:'task-manager',secret:env.WORK_DEVELOPMENT_SESSION_KEY});}
  catch{return fail('development_not_configured',503);}
  // This is an expiring owner session, not a Work/Google/Sites API credential.
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Open Task Manager development</title><h1>Open Task Manager development</h1><p>This opens synthetic test data.</p><form method="post" action="${taskOrigin}/api/work-development-session"><input type="hidden" name="session" value="${token}"><button>Continue</button></form></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','referrer-policy':'no-referrer','content-security-policy':`default-src 'none'; form-action ${taskOrigin}; base-uri 'none'; frame-ancestors 'none'`}});
}
export async function consumeDevelopmentHandoff(request,env) {
  if(env.WORK_DEVELOPMENT_ENABLED!=='isolated-test')return fail('development_disabled',423);
  if(request.method!=='POST'||request.headers.get('origin')!==siteOrigin)return fail('same_origin_required',403);
  if(new URL(request.url).origin!==taskOrigin||env.WORK_DEVELOPMENT_APP_ORIGIN!==taskOrigin)return fail('development_not_configured',503);
  if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return fail('form_required',415);
  const raw=await request.text();if(raw.length>4096)return fail('request_too_large',413);
  const token=new URLSearchParams(raw).get('session');
  if(!token || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return fail('owner_required',403);
  const actor=await verifyWorkOwnerSession(new Request(taskOrigin,{headers:{cookie:'__Host-work-dev='+token}}),{secret:env.WORK_DEVELOPMENT_SESSION_KEY,ownerId:env.WORK_DEVELOPMENT_OWNER_ID});
  if(!actor)return fail('owner_required',403);
  return new Response(null,{status:303,headers:{location:'/work-development','cache-control':'private, no-store','set-cookie':'__Host-work-dev='+token+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600'}});
}
