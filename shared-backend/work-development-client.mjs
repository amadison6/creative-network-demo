import {workViewClient} from './work-view-client.mjs';
export function browserWorkClient(sourceApp,fetchImpl=fetch) {
  return workViewClient({sourceApp,async send(path,method,body) {
    const suffix=path.replace('/v2/work/','');
    const response=await fetchImpl('/api/work-development/'+suffix,{method,credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    return {ok:response.ok,status:response.status,body:await response.json()};
  }});
}
