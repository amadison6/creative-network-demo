import {verifyWorkOwnerSession} from '../../lib/work/work-owner-session.mjs';

export function taskManagerWorkHandler({env=process.env,fetchImpl=fetch}={}) {
  return async (req,res)=>{
    const host=env.WORK_DEVELOPMENT_APP_ORIGIN;
    let base;
    try {base=new URL(host);if(base.protocol!=='https:'||base.pathname!=='/'||base.search||base.hash)throw new Error();}
    catch{res.statusCode=503;res.end(JSON.stringify({error:'development_not_configured'}));return;}
    const incoming=new URL(req.url,base);
    const operation=incoming.pathname.split('/api/work-development/')[1];
    const headers=new Headers();for(const [name,value]of Object.entries(req.headers||{}))if(typeof value==='string')headers.set(name,value);
    let raw='';
    if(req.method==='POST'){
      raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
    }
    const request=new Request(base.origin+'/api/work-development/'+operation,{method:req.method,headers,...(raw?{body:raw}:{})});
    const actor=await verifyWorkOwnerSession(request,{secret:env.WORK_DEVELOPMENT_SESSION_KEY,ownerId:env.WORK_DEVELOPMENT_OWNER_ID});
    let result;
    if(env.WORK_DEVELOPMENT_ENABLED!=='isolated-test')result=Response.json({error:'development_disabled'},{status:423});
    else if(!actor)result=Response.json({error:'owner_required'},{status:403});
    else {
      const allowed=new Map([['state','GET'],['operations','POST'],['events/edit','POST'],['events/resolve','POST']]);
      if(incoming.origin!==base.origin || incoming.search || allowed.get(operation)!==req.method)result=Response.json({error:'not_found'},{status:404});
      else if(headers.get('sec-fetch-site')==='cross-site'||(req.method==='POST'&&headers.get('origin')!==base.origin))result=Response.json({error:'same_origin_required'},{status:403});
      else if(req.method==='POST'&&!headers.get('content-type')?.startsWith('application/json'))result=Response.json({error:'json_required'},{status:415});
      else if(new TextEncoder().encode(raw).length>65536)result=Response.json({error:'request_too_large'},{status:413});
      else if(!env.WORK_API_TOKEN||!env.WORK_DEVELOPMENT_SITES_AUTH)result=Response.json({error:'development_transport_not_bound'},{status:503});
      else try {
        // Fixed existing Site origin; configuration cannot redirect credentials.
        const upstream='https://creative-network-map.ausarmadison.chatgpt.site/api/work-development-machine/'+operation;
        const remote=await fetchImpl(upstream,{method:req.method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{
          authorization:'Bearer '+env.WORK_API_TOKEN,
          'OAI-Sites-Authorization':env.WORK_DEVELOPMENT_SITES_AUTH,
          'content-type':'application/json',cookie:(headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-work-dev='))||'',
          'x-work-development-origin':base.origin
        },...(raw?{body:raw}:{})});
        const data=await remote.json();result=Response.json(data,{status:remote.status});
      }catch{result=Response.json({error:'development_transport_unavailable'},{status:503});}
    }
    res.statusCode=result.status;res.setHeader('content-type','application/json');res.setHeader('cache-control','private, no-store');res.end(await result.text());
  };
}
export default taskManagerWorkHandler();
