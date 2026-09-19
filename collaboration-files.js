/* Creative Network HQ · Private Collaboration Files v59
 * The public repository contains the reusable interface only. No private
 * Drive URLs or collaborator records are embedded here or fetched publicly.
 * Records are installed from a user-controlled one-time fragment or JSON import
 * and kept in this browser's localStorage (not an access-control boundary).
 */
(function(){
"use strict";
const KEY="creativeNetworkCollaborationFilesV1";
const HEADERS=["resourceId","personId","projectId","project","section","name","type","url","provider","notes","dateAdded","visibility"];
const SECTION_ORDER=["Collaboration Files","Visual References","Reference Decks","Production Notes","Video References"];
let activePerson="",editing="",initialized=false;
function el(id){return document.getElementById(id)}
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}
function read(){try{const records=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(records)?records:[]}catch(_){return []}}
function save(records){localStorage.setItem(KEY,JSON.stringify(records))}
function validUrl(raw){
  if(!raw)return "";
  try{const u=new URL(raw);return ["https:","http:"].includes(u.protocol)?u.href:""}catch(_){return ""}
}
function normalized(r){
 const obj=Array.isArray(r)?Object.fromEntries(HEADERS.map((key,i)=>[key,r[i]??""])):r;
 if(!obj||typeof obj!=="object")return null;
 const resourceId=String(obj.resourceId||obj.id||"").trim().slice(0,150);
 const personId=String(obj.personId||"").trim().slice(0,150);
 const name=String(obj.name||obj.resourceName||obj["Resource Name"]||"").trim().slice(0,250);
 const rawUrl=String(obj.url||"").trim();
 const url=validUrl(rawUrl);
 if(!personId||!name||(rawUrl&&!url))return null;
 return {
  resourceId:resourceId||"collab_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,9),
  personId,projectId:String(obj.projectId||"").trim().slice(0,150),
  project:String(obj.project||"Unassigned project").trim().slice(0,220),
  section:String(obj.section||"Other resources").trim().slice(0,100),
  name,type:String(obj.type||"Link").trim().slice(0,100),url,
  provider:String(obj.provider||"").trim().slice(0,120),
  notes:String(obj.notes||"").trim().slice(0,1300),
  dateAdded:String(obj.dateAdded||"").trim().slice(0,40),
  visibility:"Private"
 };
}
function parsePayload(raw){
 const input=typeof raw==="string"?JSON.parse(raw):raw;
 let rows=Array.isArray(input)?input:input?.rows||input?.values||input?.records;
 if(input?.v===1&&Array.isArray(input.r)){
   // Private one-time install packet: compact values reconstruct the existing
   // canonical Resource IDs, person and project, never a second entity.
   const sections=SECTION_ORDER;
   rows=input.r.map(([suffix,section,name,type,url,provider,notes])=>[
     String(input.prefix||"jordan_unstoppable_")+String(suffix||""),
     String(input.p||""),String(input.i||""),String(input.n||""),
     sections[Number(section)]||"Other resources",
     name||"",type||"",url||"",provider||"",notes||"",
     String(input.d||""),"Private"
   ]);
 }
 if(!Array.isArray(rows))throw Error("Paste the Collaboration Files JSON array or a sheet-values JSON object.");
 const ordered=rows.length&&Array.isArray(rows[0])&&String(rows[0][0]||"").trim()==="Resource ID"?rows.slice(1):rows;
 if(ordered.length>500)throw Error("Import is limited to 500 resources at a time.");
 const result=ordered.filter(row=>Array.isArray(row)?row.some(Boolean):true).map(normalized);
 if(result.some(r=>!r))throw Error("A record is missing its person ID or name, or has an invalid link.");
 return result;
}
function merge(newRows){
 const known=read(),existing=known.slice();
 let added=0,updated=0;
 newRows.forEach(row=>{
  const old=existing.findIndex(r=>r.resourceId===row.resourceId||
    !!row.url&&r.personId===row.personId&&r.url===row.url);
  if(old>=0){existing[old]=Object.assign({},existing[old],row,{resourceId:existing[old].resourceId});updated++}
  else{existing.push(row);added++}
 });
 save(existing);return {added,updated,total:existing.length};
}
function rowsFor(id){return read().filter(r=>r.personId===id)}
function thumbnail(url){
 const m=/^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)\//.exec(url||"");
 return m?"https://drive.google.com/thumbnail?id="+encodeURIComponent(m[1])+"&sz=w360":"";
}
function resourceCard(r){
 const href=r.url?'<a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer" class="collab-resource-link">Open ↗</a>':
  '<span class="collab-link-pending">Link not recorded</span>';
 const isImage=/^(image|photo|visual reference)$/i.test(r.type)||r.section==="Visual References";
 const preview=isImage?(r.url?'<a href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer" class="collab-thumb">':
   '<div class="collab-thumb">')+
  '<span class="collab-thumb-fallback">IMAGE · Open in Drive for full resolution</span>'+
  (thumbnail(r.url)?'<img src="'+esc(thumbnail(r.url))+'" alt="'+esc(r.name)+' preview" loading="lazy" referrerpolicy="no-referrer">':'')+
  (r.url?'</a>':'</div>'):"";
 const title=r.url?'<a class="collab-resource-title" href="'+esc(r.url)+'" target="_blank" rel="noopener noreferrer">'+esc(r.name)+'</a>':
  '<strong>'+esc(r.name)+'</strong>';
 return '<article class="collab-resource">'+preview+
 '<div class="collab-resource-info">'+title+
 '<div class="collab-resource-meta">'+esc(r.type||"Link")+(r.provider?" · "+esc(r.provider):"")+'</div>'+
 (r.notes?'<p>'+esc(r.notes)+'</p>':"")+
 '<div class="collab-resource-actions">'+href+
 '<button type="button" data-collab-edit="'+esc(r.resourceId)+'">Edit</button></div></div></article>';
}
function section(n){
 const list=rowsFor(n.id);
 const groups=new Map();
 list.forEach(r=>{
  const k=r.projectId||r.project;
  if(!groups.has(k))groups.set(k,{name:r.project||"Unassigned project",projectId:r.projectId,resources:[]});
  groups.get(k).resources.push(r);
 });
 return '<div class="section-title">Collaboration Files'+(list.length?' · '+list.length:'')+'</div>'+
 '<section class="collab-panel" data-person-id="'+esc(n.id)+'">'+
 '<div class="collab-private">PRIVATE WORKSPACE · STORED ONLY IN THIS BROWSER</div>'+
 '<p class="collab-intro">Creative work and references organized by collaborator and project. Not part of a public artist or filmmaker profile.</p>'+
 (list.length?[...groups.values()].map(group=>{
  const bySection=new Map();
  group.resources.forEach(r=>{
   const name=r.section||"Other resources";
   if(!bySection.has(name))bySection.set(name,[]);
   bySection.get(name).push(r);
  });
  const sections=[...bySection.keys()].sort((a,b)=>{
   const i=SECTION_ORDER.indexOf(a),j=SECTION_ORDER.indexOf(b);
   return (i<0?999:i)-(j<0?999:j)||a.localeCompare(b);
  });
  return '<div class="collab-project">'+
   '<div class="collab-project-title">'+esc(group.name)+'</div>'+
   (group.projectId?'<div class="collab-project-id">'+esc(group.projectId)+'</div>':"")+
   sections.map(category=>'<div class="collab-section-heading">'+esc(category)+'</div>'+
    '<div class="collab-resources">'+bySection.get(category).map(resourceCard).join("")+'</div>').join("")+
   '</div>';
 }).join(""):'<p class="collab-empty">No private collaboration files installed for this profile yet. Import existing records from the private Collaboration Files tab or add a new resource link.</p>')+
 '<div class="collab-actions"><button type="button" data-collab-add>＋ Add resource link</button>'+
 '<button type="button" data-collab-import>Import records</button>'+
 (list.length?'<button type="button" data-collab-export>Back up JSON</button>':"")+
 '</div><p class="collab-security">Only this browser stores these records. Google Drive still controls who can open each file. This is not password protection on a shared device; never publish private resources to the public site.</p>'+
 '</section>';
}
function status(text,error=false){
 const target=el("collabStatus");if(!target)return;
 target.textContent=text||"";target.classList.toggle("collab-error",error);
}
function populateProjects(personId,projectId=""){
 const select=el("collabProjectChoice");if(!select)return;
 const projects=[...new Map(rowsFor(personId).filter(r=>r.projectId||r.project)
 .map(r=>[r.projectId||r.project,{projectId:r.projectId,project:r.project}])).values()];
 select.innerHTML='<option value="">New or unlisted project</option>'+
 projects.map((p,i)=>'<option value="'+i+'">'+esc(p.project)+'</option>').join("");
 const index=projects.findIndex(p=>p.projectId===projectId);
 select.value=index>=0?String(index):"";
 select.onchange=()=>{
  const p=select.value===""?null:projects[Number(select.value)];
  if(p){el("collabProjectId").value=p.projectId;el("collabProject").value=p.project}
 };
}
function clearForm(personId){
 editing="";
 for(const id of ["collabResourceName","collabResourceUrl","collabNotes","collabType","collabProvider","collabProjectId","collabProject"])el(id).value="";
 el("collabSection").value="Visual References";
 populateProjects(personId);
 el("collabSave").textContent="Save resource link";
}
function edit(id){
 const r=read().find(x=>x.resourceId===id&&x.personId===activePerson);
 if(!r)return;
 editing=r.resourceId;
 el("collabResourceName").value=r.name;
 el("collabResourceUrl").value=r.url;
 el("collabNotes").value=r.notes;
 el("collabType").value=r.type;
 el("collabProvider").value=r.provider;
 el("collabProjectId").value=r.projectId;
 el("collabProject").value=r.project;
 el("collabSection").value=r.section;
 populateProjects(activePerson,r.projectId);
 el("collabSave").textContent="Save resource changes";
 showForm("add");
}
function showForm(which){
 el("collabAddForm").hidden=which!=="add";
 el("collabImportForm").hidden=which!=="import";
 el("collabExportForm").hidden=which!=="export";
 status("");
}
function open(personId,mode="add"){
 boot();
 activePerson=personId;
 const modal=el("collabModal");modal.hidden=false;
 const title=el("collabModalTitle");
 const person=[...(typeof nodes!=="undefined"?nodes:[])].find(n=>n.id===personId);
 title.textContent="Collaboration Files · "+(person?.name||personId);
 clearForm(personId);
 showForm(mode);
 if(mode==="import")el("collabJson").focus();
 else if(mode==="add")el("collabResourceName").focus();
}
function close(){const modal=el("collabModal");if(modal)modal.hidden=true}
function redraw(){
 if(typeof selected!=="undefined"&&selected&&selected.id===activePerson&&typeof showProfile==="function")showProfile(selected);
 else if(typeof selected!=="undefined"&&selected?.id===activePerson&&typeof showVenueProfile==="function")showVenueProfile(selected);
}
function saveForm(){
 const obj=normalized({resourceId:editing||"",personId:activePerson,projectId:el("collabProjectId").value,
 project:el("collabProject").value,section:el("collabSection").value,
 name:el("collabResourceName").value,type:el("collabType").value,
 url:el("collabResourceUrl").value,provider:el("collabProvider").value,
 notes:el("collabNotes").value,dateAdded:new Date().toISOString().slice(0,10)});
 if(!obj){status("Enter a resource name and a valid http(s) link, or leave the link blank until you have it.",true);return}
 merge([obj]);status("Saved locally.");close();redraw();
}
function importJson(){
 try{
  const raw=el("collabJson").value.trim(),records=parsePayload(raw);
  const out=merge(records);
  status(out.added+" new resource(s), "+out.updated+" updated. Private browser-only copy installed.");
  redraw();
 }catch(e){status(e.message||"Import failed.",true)}
}
function exportJson(){
 const json=JSON.stringify(rowsFor(activePerson),null,2);
 const blob=new Blob([json],{type:"application/json"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url;a.download="creative-network-collaboration-"+activePerson+".json";
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function bindProfile(n){
 const pane=el("profile");
 if(!pane)return;
 pane.querySelectorAll('.collab-panel[data-person-id]').forEach(panel=>{
  if(panel.dataset.personId!==n.id)return;
  panel.querySelectorAll("[data-collab-add]").forEach(b=>b.onclick=()=>open(n.id,"add"));
  panel.querySelectorAll("[data-collab-import]").forEach(b=>b.onclick=()=>open(n.id,"import"));
  panel.querySelectorAll("[data-collab-export]").forEach(b=>b.onclick=()=>{open(n.id,"export")});
  panel.querySelectorAll("[data-collab-edit]").forEach(b=>b.onclick=()=>{open(n.id,"add");edit(b.dataset.collabEdit)});
  panel.querySelectorAll(".collab-thumb img").forEach(img=>{
   img.onerror=()=>{img.remove()};
  });
 });
}
function boot(){
 if(initialized)return;initialized=true;
 const modal=document.createElement("div");
 modal.id="collabModal";modal.hidden=true;modal.className="collab-backdrop";
 modal.innerHTML='<section class="collab-dialog" role="dialog" aria-modal="true" aria-labelledby="collabModalTitle">'+
 '<div class="collab-dialog-head"><strong id="collabModalTitle">Collaboration Files</strong>'+
 '<button type="button" id="collabClose" aria-label="Close collaboration files">×</button></div>'+
 '<div class="collab-dialog-body">'+
 '<div id="collabAddForm" class="collab-form">'+
 '<p>Save a resource link into this private browser-only collaboration archive. File uploads to Drive are not connected yet.</p>'+
 '<label>Project</label><select id="collabProjectChoice"></select>'+
 '<label>Project name</label><input id="collabProject" placeholder="God’s Contraband — Unstoppable">'+
 '<label>Project ID</label><input id="collabProjectId" placeholder="gc_unstoppable">'+
 '<label>Section</label><select id="collabSection">'+
 SECTION_ORDER.concat(["Other resources"]).map(x=>'<option>'+esc(x)+'</option>').join("")+'</select>'+
 '<label>Resource name</label><input id="collabResourceName" placeholder="Current visual-reference deck">'+
 '<label>Type</label><input id="collabType" placeholder="Image, PDF, Google Doc, Canva, Video reference…">'+
 '<label>Resource link</label><input id="collabResourceUrl" type="url" placeholder="https://drive.google.com/...">'+
 '<label>Provider</label><input id="collabProvider" placeholder="Google Drive, Canva…">'+
 '<label>Notes</label><textarea id="collabNotes" rows="3"></textarea>'+
 '<button type="button" id="collabSave">Save resource link</button></div>'+
 '<div id="collabImportForm" class="collab-form" hidden>'+
 '<p>Paste JSON from the existing Collaboration Files sheet (columns A–L), or a backup exported from Network HQ. Matching Resource IDs and links update existing records rather than adding duplicates.</p>'+
 '<textarea id="collabJson" rows="10" placeholder="Paste JSON rows or records here"></textarea>'+
 '<button type="button" id="collabImport">Import into this browser</button></div>'+
 '<div id="collabExportForm" class="collab-form" hidden>'+
 '<p>Export the private resources for this collaborator as a JSON backup. Do not upload it to the public GitHub repository.</p>'+
 '<button type="button" id="collabExport">Download private JSON backup</button></div>'+
 '<div id="collabStatus" aria-live="polite"></div>'+
 '<p class="collab-security">This is local storage, not a login or encrypted vault. Private Google Drive files remain governed by their own sharing permissions.</p>'+
 '</div></section>';
 document.body.appendChild(modal);
 el("collabClose").onclick=close;
 modal.addEventListener("click",e=>{if(e.target===modal)close()});
 el("collabSave").onclick=saveForm;
 el("collabImport").onclick=importJson;
 el("collabExport").onclick=exportJson;
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)close()});
}
function importFromHash(){
 const hash=window.location.hash||"";
 if(!hash.startsWith("#collab="))return null;
 try{
  const encoded=hash.slice("#collab=".length);
  if(encoded.length>100000)throw Error("Collaboration import link is too large.");
  const binary=atob(encoded.replace(/-/g,"+").replace(/_/g,"/"));
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const text=new TextDecoder().decode(bytes);
  const records=parsePayload(text);
  const out=merge(records);
  window.history.replaceState(null,"",window.location.pathname+window.location.search);
  return Object.assign({},out,{personId:records.length===1?records[0].personId:
    records.every(r=>r.personId===records[0]?.personId)?records[0].personId:""});
 }catch(e){
  console.warn("Collaboration import failed:",e.message);
  return {error:e.message};
 }
}
window.NetworkCollab={section,bindProfile,open,boot,importFromHash,
 _test:{read,rowsFor,parsePayload,merge,thumbnail,resourceCard,normalized}};
})();