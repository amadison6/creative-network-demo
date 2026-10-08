import {consumeDevelopmentHandoff} from '../lib/work/work-session-handoff.mjs';
export default async function handler(req,res) {
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers||{}))if(typeof value==='string')headers.set(key,value);
  const raw=typeof req.body==='string'?req.body:new URLSearchParams(req.body||{}).toString();
  const request=new Request('https://master-task-ledger.vercel.app'+req.url,{method:req.method,headers,...(req.method==='POST'?{body:raw}:{})});
  const result=await consumeDevelopmentHandoff(request,process.env);
  res.statusCode=result.status;for(const [key,value]of result.headers)res.setHeader(key,value);res.end(await result.text());
}
