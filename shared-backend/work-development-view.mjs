import {browserWorkClient} from './work-development-client.mjs';
const root=document.querySelector('#workDevelopment');
const sourceApp=root.dataset.view;
const client=browserWorkClient(sourceApp);
let state=null,busy=false,selected='';
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statuses=['Open','In Progress','Waiting','Backlog','Done','Archived'];
function feedback(message){document.querySelector('#feedback').textContent=message;}
function options(items,id){return items.map(x=>`<option value="${e(x.id)}" ${x.id===id?'selected':''}>${e(x.title||x.notes||x.id)}</option>`).join('');}
function render(){
  const tasks=state.tasks.filter(t=>t.status!=='Archived');
  if(!tasks.some(t=>t.id===selected))selected=tasks[0]?.id||'';
  const task=tasks.find(t=>t.id===selected);
  root.innerHTML=`<header><h1>${sourceApp==='network-hq'?'Network HQ':'Task Manager'} · Development</h1><p>Synthetic test data. Changes here do not update your live tasks or Google Calendar.</p><button id="refresh">Refresh</button>${sourceApp==='network-hq'?'<form action="/api/work-development-session" method="post"><button>Open Task Manager test view</button></form>':''}<p id="feedback" role="status" aria-live="polite">Loaded version ${state.version}</p></header>
  <div class="columns"><section><h2>Tasks</h2>${tasks.map(t=>`<button class="task" data-task="${e(t.id)}" aria-pressed="${t.id===selected}"><strong>${e(t.title)}</strong><span>${e(t.status)} · ${e(state.projects.find(p=>p.id===t.project_id)?.title||'')}</span></button>`).join('')||'<p>No tasks yet.</p>'}
  <form id="create"><h2>Add task</h2><label>Title<input name="title" required maxlength="500"></label><label>Project<select name="project" required>${options(state.projects)}</select></label><button ${!state.projects.length?'disabled':''}>Create task</button></form>
  <form id="createProject"><h2>Add project</h2><label>Title<input name="title" required maxlength="200"></label><label>Hub<select name="hub" required>${options(state.hubs)}</select></label><button ${!state.hubs.length?'disabled':''}>Create project</button></form>
  <form id="createHub"><h2>Add hub</h2><label>Title<input name="title" required maxlength="160"></label><button>Create hub</button></form></section>
  <section>${task?`<h2>Edit task</h2><form id="edit"><label>Title<input name="title" required maxlength="500" value="${e(task.title)}"></label><label>Status<select name="status">${statuses.map(s=>`<option ${s===task.status?'selected':''}>${s}</option>`).join('')}</select></label><label>Project<select name="project">${options(state.projects,task.project_id)}</select></label><label>Major task<select name="parent"><option value="">None — keep as major task</option>${options(tasks.filter(t=>t.id!==task.id&&!t.parent_task_id&&t.project_id===task.project_id),task.parent_task_id)}</select></label><label>Notes<textarea name="notes" maxlength="5000">${e(task.notes)}</textarea></label>
  <fieldset><legend>People</legend>${(state.testProfiles||[]).map(p=>`<label><input type="checkbox" name="people" value="${e(p.id)}" ${state.taskPeople.some(x=>x.task_id===task.id&&x.profile_id===p.id)?'checked':''}>${e(p.notes||p.id)}</label>`).join('')}</fieldset>
  <fieldset><legend>Depends on</legend>${tasks.filter(t=>t.id!==task.id).map(t=>`<label><input type="checkbox" name="depends" value="${e(t.id)}" ${state.dependencies.some(x=>x.task_id===task.id&&x.depends_on_task_id===t.id)?'checked':''}>${e(t.title)}</label>`).join('')}</fieldset>
  <button>Save changes</button></form><button id="complete">${task.status==='Done'?'Reopen task':'Complete task'}</button>
  <h3>Files</h3><p>Links point to Google Drive; files stay there.</p>${state.resources.filter(r=>r.task_id===task.id).map(r=>`<p>${e(r.label)} · ${e(r.url)}</p>`).join('')}<form id="resource"><label>Label<input name="label" required></label><label>Drive URL<input name="url" type="url" required></label><label>Drive file ID<input name="fileId" required></label><button>Add Drive reference</button></form>`:'<h2>Select or create a task</h2>'}
  <h2>Linked events</h2>${state.events.map(event=>{const v=JSON.parse(event.event_json);return `<p>${e(v.summary||'Event')} · ${e(event.sync_status)}</p>`;}).join('')||'<p>No linked test events. Live Calendar integration is pending.</p>'}</section></div>`;
  document.querySelector('#refresh').onclick=()=>run(async()=>{state=await client.refresh();});
  root.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>{selected=b.dataset.task;render();});
  document.querySelector('#createHub').onsubmit=submit(f=>client.edit({action:'hub.create',patch:{title:f.get('title')}}));
  document.querySelector('#createProject').onsubmit=submit(f=>client.edit({action:'project.create',patch:{title:f.get('title'),hub_id:f.get('hub')}}));
  document.querySelector('#create').onsubmit=submit(f=>client.edit({action:'task.create',patch:{title:f.get('title'),project_id:f.get('project')}}));
  if(task){
    const projectSelect=document.querySelector('#edit select[name="project"]');
    projectSelect.onchange=()=>{
      const parentSelect=document.querySelector('#edit select[name="parent"]');
      parentSelect.innerHTML='<option value="">None — keep as major task</option>'+options(tasks.filter(t=>t.id!==task.id&&!t.parent_task_id&&t.project_id===projectSelect.value));
    };
    document.querySelector('#edit').onsubmit=submit(f=>client.edit({action:'task.update',entityId:task.id,patch:{title:f.get('title'),status:f.get('status'),project_id:f.get('project'),parent_task_id:f.get('parent')||null,designation:f.get('parent')?'micro':'major',notes:f.get('notes')},links:{people:f.getAll('people'),dependsOn:f.getAll('depends')}}));
    document.querySelector('#complete').onclick=()=>run(()=>client.edit({action:'task.update',entityId:task.id,patch:{status:task.status==='Done'?'Open':'Done'}}));
    document.querySelector('#resource').onsubmit=submit(f=>client.edit({action:'task.update',entityId:task.id,patch:{},links:{resources:[...state.resources.filter(r=>r.task_id===task.id).map(r=>({label:r.label,url:r.url,external_id:r.external_id,resource_type:r.resource_type})),{label:f.get('label'),url:f.get('url'),external_id:f.get('fileId'),resource_type:'google_drive'}]}}));
  }
}
function submit(action){return ev=>{ev.preventDefault();const form=new FormData(ev.currentTarget);return run(()=>action(form));};}
async function run(action){
  if(busy)return;busy=true;
  const previousButtons=new Map([...root.querySelectorAll('button')].map(b=>[b,b.disabled]));
  root.querySelectorAll('button').forEach(b=>b.disabled=true);
  feedback('Saving…');
  try {const out=await action();if(out?.state)state=out.state;render();feedback('Saved. Refresh the other view to see this change.');}
  catch(error){feedback(error.status===409?'This data changed in another view. Your change was not applied. Refresh before reviewing and trying again.':`Could not apply this change: ${error.message}`);}
  finally {busy=false;for(const [button,disabled]of previousButtons)if(button.isConnected)button.disabled=disabled;}
}
try{state=await client.refresh();render();}catch(error){root.textContent=`Development view is unavailable: ${error.message}. Your live data has not changed.`;}
