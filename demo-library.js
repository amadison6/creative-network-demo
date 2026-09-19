/* Network HQ Demo Library v63 — original audio remains in the user's browser IndexedDB.
 * One record/Blob per track, linked to canonical collaborator IDs. No network uploads.
 */
(function(){
"use strict";
const DB_NAME="creativeNetworkAudioDemosV1", STORE="tracks";
const MAX_FILE=250*1024*1024;
let dbPromise=null,tracks=[],loaded=false,dbError="",playingId="",currentUrl="",player=null;
let getPeople=()=>[],getConnections=()=>[],refreshMap=()=>{},openPerson=()=>{};
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const fmtSize=n=>n>1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB";
const ext=file=>String(file?.name||"").split(".").pop().toLowerCase();
const SUPPORTED_EXTENSIONS=["mp3","wav","wave","m4a"];
const audioType=file=>ext(file)==="mp3"?"audio/mpeg":ext(file)==="m4a"?"audio/mp4":"audio/wav";
const audioFile=file=>!!file&&SUPPORTED_EXTENSIONS.includes(ext(file))&&file.size>0&&file.size<=MAX_FILE;
const fileError=file=>{
 if(!file||!SUPPORTED_EXTENSIONS.includes(ext(file)))return "Unsupported format. Choose MP3, WAV or M4A.";
 if(file.size<=0)return "This file is empty.";
 if(file.size>MAX_FILE)return "This file is "+fmtSize(file.size)+"; the browser-local limit is 250 MB per demo.";
 return "";
};
const clock=seconds=>Number.isFinite(seconds)?Math.floor(seconds/60)+":"+String(Math.floor(seconds%60)).padStart(2,"0"):"0:00";
function openDB(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  if(!("indexedDB" in window)){reject(Error("IndexedDB is unavailable in this browser."));return}
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"id"})};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error("Could not open local demo storage."));
 }).catch(err=>{dbPromise=null;throw err});
 return dbPromise;
}
async function getAll(){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,"readonly");
  const req=tx.objectStore(STORE).getAll();
  req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error||Error("Cannot read demos."));
 });
}
async function put(row){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,"readwrite");
  tx.objectStore(STORE).put(row);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error("Browser storage was full or unavailable."));
  tx.onabort=()=>reject(tx.error||Error("Demo save was interrupted."));
 });
}
async function remove(id){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,"readwrite");
  tx.objectStore(STORE).delete(id);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error("Cannot delete demo."));
 });
}
function normalizeCredits(ids){
 const valid=new Set(getPeople().map(p=>p.id));
 return [...new Set((ids||[]).filter(id=>valid.has(id)))];
}
function recordsFor(id){return tracks.filter(t=>t.collaborators?.includes(id))}
function personName(id){return getPeople().find(p=>p.id===id)?.name||id}
function htmlList(n,mode="all"){
 if(dbError)return '<p class="demo-error">'+esc(dbError)+'</p>';
 if(!loaded)return '<p class="demo-muted">Loading locally saved demos…</p>';
 const own=n.id==="uh_sar";
 const list=recordsFor(n.id).filter(t=>!own||mode!=="solo"||(t.collaborators||[]).every(id=>id==="uh_sar"))
  .filter(t=>!own||mode!=="shared"||(t.collaborators||[]).some(id=>id!=="uh_sar"))
  .sort((a,b)=>String(b.addedAt).localeCompare(String(a.addedAt)));
 return list.length?list.map(t=>'<article class="demo-track" data-demo-row="'+esc(t.id)+'">'+
   '<button class="demo-track-play" type="button" data-demo-play="'+esc(t.id)+'" aria-label="Play '+esc(t.title)+'">'+(playingId===t.id&&player&&!player.paused?'Ⅱ':'▶')+'</button>'+
   '<div class="demo-track-copy"><strong>'+esc(t.title)+'</strong>'+
   '<span>'+esc(t.filename||"Audio")+" · "+fmtSize(t.size||0)+(t.type==="audio/wav"?" · WAV":t.type==="audio/mpeg"?" · MP3":t.type==="audio/mp4"?" · M4A":"")+'</span>'+
   '<div class="demo-credit-list">'+(t.collaborators||[]).map(id=>'<button type="button" data-demo-person="'+esc(id)+'">'+esc(personName(id))+'</button>').join("")+'</div>'+
   (t.notes?'<p>'+esc(t.notes)+'</p>':"")+'</div>'+
   '<button type="button" class="demo-track-edit" data-demo-edit="'+esc(t.id)+'" aria-label="Edit demo details">Edit</button></article>').join(""):
   '<p class="demo-muted">'+(own&&mode==="solo"?"No solo demos or beats yet. Upload something and leave other collaborator boxes unchecked.":
     own&&mode==="shared"?"No collaborative sessions saved here yet. Select your collaborators during upload or edit a demo to link their profiles.":
     "No demos linked to this profile yet. Drop an MP3, WAV or M4A below to start a private playlist.")+'</p>';
}
function eligibleDemoArtist(p){
 if(!p||p.id==="uh_sar"||p.profileType==="studio"||p.profileType==="venue"||p.profileType==="filmmaker")return false;
 if(p.profileType==="collective")return true;
 const hay=[p.role,p.genres,p.instruments,...(p.tags||[])].filter(Boolean).join(" ");
 return /artist|rap|sing|songwrit|produc|music|vocal|guitar|bass|key|drum|horn|instrument|God's Contraband/i.test(hay);
}
function demoPartners(){
 const connected=new Set(getConnections().flatMap(([a,b,kind])=>{
  if(a==="uh_sar"&&b!=="uh_sar"&&kind!=="future")return[b];
  if(b==="uh_sar"&&a!=="uh_sar"&&kind!=="future")return[a];
  return[];
 }));
 const recorded=new Set(tracks.filter(t=>t.collaborators?.includes("uh_sar"))
  .flatMap(t=>t.collaborators||[]));
 return getPeople().filter(p=>eligibleDemoArtist(p)&&(connected.has(p.id)||recorded.has(p.id)))
  .sort((a,b)=>{
   const priority=id=>id==="gods_contraband_group"?0:id==="free"?1:id==="camille"?2:10;
   return priority(a.id)-priority(b.id)||a.name.localeCompare(b.name);
  });
}
function dashboard(){
 const self=getPeople().find(p=>p.id==="uh_sar")||{id:"uh_sar",name:"My Demos & Beats"};
 const partners=[self,...demoPartners()];
 const icon=p=>p.photo&&(/^(https:\/\/|data:image\/)/i).test(p.photo)?
   '<img src="'+esc(p.photo)+'" alt="" loading="lazy" referrerpolicy="no-referrer">':
   '<span>'+esc(p.id==="uh_sar"?"♪":p.name.split(/\s+/).map(s=>s[0]).join("").slice(0,2).toUpperCase())+'</span>';
 return '<div class="demo-dashboard"><div class="demo-dashboard-heading">My Demo Library · Collaborator Playlists</div>'+
 '<p class="demo-muted">Choose an artist you make music with to open their demo playlist. Your personal beats live separately below.</p>'+
 '<div class="demo-partner-grid">'+partners.map(p=>{
  const number=p.id==="uh_sar"?
   recordsFor("uh_sar").filter(t=>(t.collaborators||[]).every(id=>id==="uh_sar")).length:
   recordsFor(p.id).filter(t=>(t.collaborators||[]).includes("uh_sar")).length;
  return '<button type="button" class="demo-partner" data-demo-nav="'+esc(p.id)+'" aria-label="Open '+esc(p.id==="uh_sar"?"My Demos and Beats":p.name+" demos")+'">'+
   '<span class="demo-partner-photo">'+icon(p)+'</span><strong>'+esc(p.id==="uh_sar"?"My Demos & Beats":p.name)+'</strong>'+
   '<small>'+number+' '+(number===1?"demo":"demos")+'</small></button>';
 }).join("")+'</div></div>';
}
function choices(selected,omit=""){
 return getPeople().filter(p=>p.id!==omit&&p.profileType!=="venue"&&p.profileType!=="studio")
 .sort((a,b)=>a.name.localeCompare(b.name))
 .map(p=>'<label class="demo-credit-option" data-name="'+esc(p.name.toLowerCase())+'"><input type="checkbox" value="'+esc(p.id)+'"'+(selected.includes(p.id)?" checked":"")+'><span>'+esc(p.name)+'</span></label>').join("");
}
function listContent(n){
 if(n.id!=="uh_sar")return htmlList(n);
 const solo=loaded?recordsFor("uh_sar").filter(t=>(t.collaborators||[]).every(id=>id==="uh_sar")).length:0;
 const shared=loaded?recordsFor("uh_sar").filter(t=>(t.collaborators||[]).some(id=>id!=="uh_sar")).length:0;
 return '<div class="demo-list-heading" id="mySoloDemos">My Demos & Beats · '+solo+'</div>'+htmlList(n,"solo")+
 '<div class="demo-list-heading">Shared Sessions · '+shared+'</div>'+htmlList(n,"shared");
}
function section(n){
 const count=loaded?recordsFor(n.id).length:0;
 return '<div class="section-title">Demos'+(count?' · '+count:'')+'</div>'+
 '<section class="demo-library" data-demo-profile="'+esc(n.id)+'">'+
 (n.id==="uh_sar"?dashboard():"")+
 '<div class="demo-private-label">LOCAL UNRELEASED AUDIO · MP3 / WAV / M4A</div>'+
 '<p class="demo-muted">Each track appears on every linked collaborator’s playlist. Audio stays on this browser and is never uploaded to Network HQ.</p>'+
 '<div class="demo-list">'+listContent(n)+'</div>'+
 '<div class="demo-drop" role="button" tabindex="0" aria-label="Add MP3, WAV or M4A demos"><span class="demo-drop-icon">♪</span>'+
 '<strong>Drag & drop MP3, WAV or M4A files</strong><span>or click to choose multiple files · maximum 250 MB each</span></div>'+
 '<input class="demo-file-picker" type="file" accept=".mp3,.wav,.wave,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a" multiple hidden>'+
 '<details class="demo-credit-setup"><summary>Link collaborators for new uploads</summary>'+
 '<p class="demo-muted">This profile will be linked automatically. Check anyone else who worked on the demo; they’ll see the same track in their playlist.</p>'+
 '<input class="demo-credit-search" type="search" placeholder="Find a collaborator…" aria-label="Find demo collaborator">'+
 '<div class="demo-credit-options">'+choices([] ,n.id)+'</div></details>'+
 '<div class="demo-message" role="status" aria-live="polite"></div>'+
 '<p class="demo-safety">Private on this device, not encrypted or synced. Browser data clearing can erase demos. Keep your originals backed up; use a private computer/browser profile.</p>'+
 '</section>';
}
function bootPlayer(){
 if(player)return;
 const bar=document.createElement("div");bar.className="demo-now-playing";bar.id="demoNowPlaying";bar.hidden=true;
 bar.innerHTML='<div class="demo-player-heading"><div><span>NOW PLAYING · PRIVATE DEMO</span><strong id="demoPlayingTitle"></strong><small id="demoPlayingPeople"></small></div>'+
 '<button id="demoPlayerClose" aria-label="Stop and close demo">×</button></div>'+
 '<audio id="demoAudio" controls preload="metadata"></audio>'+
 '<div class="demo-player-note">Saved in this browser only. Music does not leave your device.</div>';
 document.body.appendChild(bar);
 player=bar.querySelector("audio");
 player.addEventListener("play",stateChanged);
 player.addEventListener("pause",stateChanged);
 player.addEventListener("ended",()=>{playingId="";stateChanged()});
 player.addEventListener("error",()=>{stateChanged();if(playingId)message("Audio playback failed. Download the file and try a local player.",true)});
 bar.querySelector("#demoPlayerClose").onclick=stop;
}
function stateChanged(){
 const active=!!(playingId&&player&&!player.paused&&!player.ended);
 const t=tracks.find(t=>t.id===playingId);
 if(window.NetworkPlayback?.set){
  window.NetworkPlayback.set("demo",active?t?.collaborators||[]:[],active);
 }else document.querySelectorAll(".node").forEach(node=>{
  const id=node.dataset.id;
  node.classList.toggle("demo-spinning",active&&!!t?.collaborators?.includes(id));
 });
 document.querySelectorAll(".demo-connection").forEach(edge=>{
  edge.classList.toggle("demo-connection-playing",active&&!!t?.collaborators?.includes(edge.dataset.a)&&!!t?.collaborators?.includes(edge.dataset.b));
 });
 document.querySelectorAll("[data-demo-play]").forEach(btn=>{
  btn.textContent=active&&btn.dataset.demoPlay===playingId?"Ⅱ":"▶";
 });
}
function stop(){
 if(player){player.pause();player.removeAttribute("src");player.load()}
 if(currentUrl){URL.revokeObjectURL(currentUrl);currentUrl=""}
 playingId="";$("demoNowPlaying").hidden=true;stateChanged();
}
function message(text,error=false,box=null){
 const node=box?.querySelector(".demo-message")||document.querySelector(".demo-library .demo-message");
 if(node){node.textContent=text;node.classList.toggle("demo-error",error)}
}
async function play(id){
 bootPlayer();
 const t=tracks.find(t=>t.id===id);if(!t)return;
 if(playingId===id){if(player.paused)try{await player.play()}catch(e){message("Playback failed: "+e.message,true)}else player.pause();return}
 stop();
 const url=URL.createObjectURL(t.blob);currentUrl=url;playingId=id;
 player.src=url;player.type=t.type||"";
 $("demoPlayingTitle").textContent=t.title;
 $("demoPlayingPeople").textContent=(t.collaborators||[]).map(personName).join(" × ");
 $("demoNowPlaying").hidden=false;
 try{await player.play()}catch(e){message("Press play on the demo player if autoplay was blocked: "+e.message,true)}
 stateChanged();
}
async function reload(){
 tracks=await getAll();loaded=true;dbError="";
 if(typeof refreshMap==="function")refreshMap();
 const pane=$("profile")?.querySelector(".demo-library");
 if(pane){const person=getPeople().find(p=>p.id===pane.dataset.demoProfile);if(person)redrawSection(person)}
}
function redrawSection(n){
 const old=$("profile")?.querySelector(".demo-library");
 if(!old||old.dataset.demoProfile!==n.id)return;
 const tmp=document.createElement("div");tmp.innerHTML=section(n);
 const next=tmp.querySelector(".demo-library");
 if(!next)return;
 const title=old.previousElementSibling;
 if(title?.classList?.contains("section-title"))title.textContent="Demos"+(recordsFor(n.id).length?" · "+recordsFor(n.id).length:"");
 old.replaceWith(next);bindProfile(n);
 stateChanged();
}
async function handleFiles(files,n,box){
 const list=Array.from(files||[]);if(!list.length)return;
 const invalid=list.map(f=>({file:f,error:fileError(f)})).filter(x=>x.error);
 if(invalid.length){
   message(invalid.map(x=>x.file.name+": "+x.error).join(" · "),true,box);
   return;
 }
 const selected=[...box.querySelectorAll('.demo-credit-option input:checked')].map(x=>x.value);
 const collabs=normalizeCredits([n.id,...selected]);if(!collabs.includes(n.id))collabs.unshift(n.id);
 message("Saving "+list.length+" demo(s) on this device…",false,box);
 let saved=0;
 for(const file of list){
  try{
   const id=typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():"demo_"+Date.now()+"_"+Math.random().toString(36).slice(2);
   const title=file.name.replace(/\.(mp3|wav|wave|m4a)$/i,"").replace(/[_]+/g," ").trim();
   await put({id,title:title||file.name,filename:file.name,type:audioType(file),size:file.size,
    blob:file,collaborators:collabs,notes:"",addedAt:new Date().toISOString()});
   saved++;
  }catch(e){message("Saved "+saved+" file(s). Could not save "+file.name+": "+(e.message||e),true,box);break}
 }
 await reload();
 const latest=$("profile")?.querySelector(".demo-library");
 if(saved&&latest)message("Saved "+saved+" demo(s). Shared with "+collabs.map(personName).join(", ")+".",false,latest);
}
function bindProfile(n){
 const box=$("profile")?.querySelector(".demo-library");
 if(!box||box.dataset.demoProfile!==n.id)return;
 const pick=box.querySelector(".demo-file-picker");
 const drop=box.querySelector(".demo-drop");
 drop.onclick=()=>pick.click();
 drop.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();pick.click()}};
 const incoming=e=>{e.preventDefault();drop.classList.remove("demo-over");handleFiles(e.dataTransfer.files,n,box)};
 drop.ondragover=e=>{e.preventDefault();drop.classList.add("demo-over")};
 drop.ondragleave=()=>drop.classList.remove("demo-over");
 drop.ondrop=incoming;
 pick.onchange=()=>{const files=pick.files;handleFiles(files,n,box);pick.value=""};
 const search=box.querySelector(".demo-credit-search");
 search.oninput=()=>{
  const q=search.value.toLowerCase().trim();
  box.querySelectorAll(".demo-credit-option").forEach(o=>o.hidden=!o.dataset.name.includes(q));
 };
 box.querySelectorAll("[data-demo-play]").forEach(btn=>btn.onclick=()=>play(btn.dataset.demoPlay));
 box.querySelectorAll("[data-demo-edit]").forEach(btn=>btn.onclick=()=>openEditor(btn.dataset.demoEdit));
 box.querySelectorAll("[data-demo-person]").forEach(btn=>btn.onclick=()=>openPerson(btn.dataset.demoPerson));
 box.querySelectorAll("[data-demo-nav]").forEach(btn=>btn.onclick=()=>{
  const id=btn.dataset.demoNav;
  if(id!=="uh_sar")openPerson(id);
  const pane=document.getElementById("profile");
  if(id==="uh_sar"){
   const solo=pane?.querySelector("#mySoloDemos");
   if(solo?.scrollIntoView)solo.scrollIntoView({behavior:"smooth",block:"nearest"});
  }else{
   const list=pane?.querySelector(".demo-library");
   if(list?.scrollIntoView)list.scrollIntoView({behavior:"smooth",block:"start"});
  }
 });
 stateChanged();
}
function bootEditor(){
 if($("demoEditModal"))return;
 const modal=document.createElement("div");modal.className="demo-edit-backdrop";modal.id="demoEditModal";modal.hidden=true;
 modal.innerHTML='<section class="demo-edit-panel" role="dialog" aria-modal="true" aria-labelledby="demoEditHeading">'+
 '<div class="demo-edit-header"><h3 id="demoEditHeading">Edit demo & collaborators</h3><button type="button" id="demoEditClose" aria-label="Close">×</button></div>'+
 '<label>Demo title<input id="demoEditTitle" maxlength="200"></label>'+
 '<label>Session notes<textarea id="demoEditNotes" rows="3" placeholder="Working title, key, BPM, date, next steps…"></textarea></label>'+
 '<label>Find collaborators<input id="demoEditSearch" type="search" placeholder="Search artists, producers, writers…"></label>'+
 '<div class="demo-edit-people" id="demoEditPeople"></div>'+
 '<div class="demo-message" id="demoEditStatus" role="status"></div>'+
 '<div class="demo-edit-actions"><button type="button" id="demoEditSave">Save & link profiles</button>'+
 '<button type="button" id="demoEditDownload">Download original</button>'+
 '<button type="button" id="demoEditDelete" class="demo-danger">Delete demo</button></div>'+
 '<p class="demo-muted">Deleting removes this single local copy from every collaborator’s playlist. It does not delete the original file on your computer.</p></section>';
 document.body.appendChild(modal);
 $("demoEditClose").onclick=()=>modal.hidden=true;
 modal.onclick=e=>{if(e.target===modal)modal.hidden=true};
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)modal.hidden=true});
}
function openEditor(id){
 bootEditor();const t=tracks.find(t=>t.id===id);if(!t)return;
 const modal=$("demoEditModal");modal.hidden=false;modal.dataset.id=id;
 $("demoEditTitle").value=t.title;$("demoEditNotes").value=t.notes||"";
 $("demoEditPeople").innerHTML=choices(t.collaborators||[]);
 $("demoEditStatus").textContent="";
 const q=$("demoEditSearch");q.value="";
 q.oninput=()=>{$("demoEditPeople").querySelectorAll(".demo-credit-option").forEach(o=>o.hidden=!o.dataset.name.includes(q.value.toLowerCase().trim()))};
 $("demoEditSave").onclick=async()=>{
  const credits=normalizeCredits([...$("demoEditPeople").querySelectorAll("input:checked")].map(x=>x.value));
  const title=$("demoEditTitle").value.trim();
  if(!title||!credits.length){$("demoEditStatus").textContent="Enter a title and at least one collaborator.";return}
  try{
   await put({...t,title,notes:$("demoEditNotes").value.trim(),collaborators:credits});
   modal.hidden=true;await reload();
   if(playingId===id){$("demoPlayingTitle").textContent=title;$("demoPlayingPeople").textContent=credits.map(personName).join(" × ");stateChanged()}
  }catch(e){$("demoEditStatus").textContent=e.message||String(e)}
 };
 $("demoEditDownload").onclick=()=>{
  const objectURL=URL.createObjectURL(t.blob),a=document.createElement("a");
  a.href=objectURL;a.download=t.filename||t.title+".wav";
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(objectURL),30000);
 };
 $("demoEditDelete").onclick=async()=>{
  if(!confirm('Delete "'+t.title+'" from ALL linked playlists on this browser?'))return;
  try{
   if(playingId===id)stop();
   await remove(id);modal.hidden=true;await reload();
  }catch(e){$("demoEditStatus").textContent=e.message||String(e)}
 };
}
function drawLinks(viewport,make,visible,ensureState,edgeEls){
 if(!loaded)return;
 const visibleIds=new Set(visible.map(n=>n.id)),unique=new Map();
 tracks.forEach(t=>{
  const ids=[...new Set((t.collaborators||[]).filter(id=>visibleIds.has(id)))];
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
   const pair=[ids[i],ids[j]].sort(),key=pair.join("\u0000");
   if(!unique.has(key))unique.set(key,pair);
  }
 });
 for(const [a,b] of [...unique.values()].slice(0,180)){
  const sa=ensureState(visible.find(n=>n.id===a)),sb=ensureState(visible.find(n=>n.id===b));
  if(!sa||!sb)continue;
  const line=make("line",{x1:sa.x,y1:sa.y,x2:sb.x,y2:sb.y,class:"edge demo-connection","data-a":a,"data-b":b});
  viewport.appendChild(line);edgeEls.push(line);
 }
}
function init(config){
 getPeople=config.getPeople||getPeople;
 getConnections=config.getConnections||getConnections;
 refreshMap=config.refreshMap||refreshMap;
 openPerson=config.openPerson||openPerson;
 bootPlayer();bootEditor();
 reload().catch(e=>{dbError="Local demo storage is unavailable: "+(e.message||e);loaded=true;refreshMap();
  const pane=$("profile")?.querySelector(".demo-library");
  if(pane){const n=getPeople().find(n=>n.id===pane.dataset.demoProfile);if(n)redrawSection(n)}
 });
}
window.NetworkDemos={init,section,bindProfile,drawLinks,recordsFor,isPlaying:id=>!!(playingId&&player&&!player.paused&&tracks.find(t=>t.id===playingId)?.collaborators.includes(id)),stateChanged,
 _test:{audioFile,audioType,fileError,normalizeCredits,recordsFor,demoPartners,dashboard,listContent,drawLinks,openDB,getAll,put,remove}};
})();