/* Network HQ v60: Untitled project links in browser storage, not in public seed data. */
(function(){
"use strict";
const KEY="creativeNetworkUntitledProjectsV1";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
function read(){try{const v=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(v)?v:[]}catch(_){return[]}}
function store(v){localStorage.setItem(KEY,JSON.stringify(v))}
function safeUrl(raw,embed=false){
 try{
  const u=new URL(String(raw||"").trim());
  if(u.protocol!=="https:"||!/(^|\.)untitled\.(stream|fm)$/.test(u.hostname.toLowerCase()))return"";
  if(embed&&(/^\/library(\/|$)/.test(u.pathname)||u.pathname==="/"))return"";
  return u.href;
 }catch(_){return""}
}
function embedUrl(raw){
 const s=String(raw||"").trim();if(!s)return"";
 const m=/<iframe\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/i.exec(s);
 return safeUrl((m?(m[1]||m[2]):s).replace(/&amp;/gi,"&"),true);
}
function normalized(p){
 const profileId=String(p.profileId||p.personId||"").trim().slice(0,150);
 const title=String(p.title||"").trim().slice(0,200);
 const url=safeUrl(p.url),embed=embedUrl(p.embed);
 if(!profileId||!title||!url||(p.embed&&!embed))return null;
 return {id:String(p.id||("untitled_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8))).slice(0,160),
  profileId,title,url,embed,projectId:String(p.projectId||"").trim().slice(0,160)};
}
function merge(payload){
 const p=normalized(payload);if(!p)return null;
 const rows=read();
 const i=rows.findIndex(r=>r.id===p.id||(r.profileId===p.profileId&&r.url===p.url));
 if(i>=0)rows[i]=Object.assign({},rows[i],p,{id:rows[i].id,embed:p.embed||rows[i].embed});
 else rows.push(p);
 store(rows);return p;
}
function forProfile(id){return read().filter(r=>r.profileId===id)}
function card(p){
 return '<article class="untitled-project" data-project-id="'+esc(p.id)+'"><strong>'+esc(p.title)+'</strong>'+
 (p.projectId?'<small>'+esc(p.projectId)+'</small>':"")+
 '<div class="untitled-actions"><a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">Open in Untitled ↗</a>'+
 (p.embed?'<button type="button" data-play="'+esc(p.id)+'">▶ Open player in Network HQ</button>':
 '<span class="untitled-muted">Embed code needed for in-app playback</span>')+
 (p.legacy?"":'<button type="button" data-edit="'+esc(p.id)+'">Edit</button>')+
 '</div><div class="untitled-player" data-player="'+esc(p.id)+'"></div></article>';
}
function section(n){
 const saved=forProfile(n.id);
 const legacy=safeUrl(n.links?.Untitled);
 const items=[...saved,...(legacy&&!saved.some(r=>r.url===legacy)?[{id:"legacy",title:"Existing Untitled link",url:legacy,embed:"",legacy:true}]:[])];
 return '<div class="section-title">Untitled · Project Library</div>'+
 '<section class="untitled-library" data-person-id="'+esc(n.id)+'">'+
 '<p class="untitled-muted">Your private library links stay in this browser; a share/embed player is separate. Untitled does not report pause/play to Network HQ, so record movement indicates its player is open until you close it.</p>'+
 (items.length?items.map(card).join(""):'<p class="untitled-muted">No Untitled project saved yet.</p>')+
 '<button type="button" data-new>＋ Add Untitled project</button>'+
 '<div class="untitled-form" hidden>'+
 '<label>Album / project name<input data-title placeholder="God’s Contraband — Self-Titled"></label>'+
 '<label>Untitled library / share link<input data-url placeholder="https://untitled.stream/..."></label>'+
 '<label>Project identifier (optional)<input data-project placeholder="gc_self_titled"></label>'+
 '<label>Untitled share embed code / embed URL (optional)<textarea data-embed rows="2" placeholder="Copy exact iframe from Share → Embed"></textarea></label>'+
 '<p class="untitled-muted">Your /library/project/ URL is an owner library link, not an embeddable player. Do not publish unreleased music accidentally.</p>'+
 '<div class="untitled-actions"><button data-save type="button">Save</button><button data-cancel type="button">Cancel</button></div>'+
 '<div data-message class="untitled-message" aria-live="polite"></div></div></section>';
}
function bindProfile(n){
 const box=$("profile")?.querySelector(".untitled-library");
 if(!box||box.dataset.personId!==n.id)return;
 const form=box.querySelector(".untitled-form");
 let editId="";
 const field=k=>box.querySelector("[data-"+k+"]");
 function fill(r){
  field("title").value=r?.title||"";field("url").value=r?.url||"";
  field("project").value=r?.projectId||"";field("embed").value=r?.embed||"";
 }
 field("new").onclick=()=>{editId="";fill(null);form.hidden=false;field("title").focus()};
 field("cancel").onclick=()=>{editId="";form.hidden=true};
 field("save").onclick=()=>{
  const p=merge({id:editId,profileId:n.id,title:field("title").value,
   url:field("url").value,projectId:field("project").value,embed:field("embed").value});
  if(!p){field("message").textContent="Enter a name and valid Untitled HTTPS link; check the embed URL if provided.";return}
  showProfile(n);
 };
 box.querySelectorAll("[data-edit]").forEach(btn=>btn.onclick=()=>{
  const p=forProfile(n.id).find(x=>x.id===btn.dataset.edit);
  if(p){editId=p.id;fill(p);form.hidden=false}
 });
 box.querySelectorAll("[data-play]").forEach(btn=>btn.onclick=()=>{
  const p=forProfile(n.id).find(x=>x.id===btn.dataset.play);
  const spot=box.querySelector('[data-player="'+btn.dataset.play+'"]');
  if(!p?.embed||!spot)return;
  const source="untitled:"+n.id;
  if(spot.querySelector("iframe")){
   spot.replaceChildren();
   btn.textContent="▶ Open player in Network HQ";
   window.NetworkPlayback?.clear(source);
   return;
  }
  box.querySelectorAll("[data-player]").forEach(other=>other.replaceChildren());
  box.querySelectorAll("[data-play]").forEach(button=>button.textContent="▶ Open player in Network HQ");
  const frame=document.createElement("iframe");
  frame.src=p.embed;frame.title="Untitled player · "+p.title;
  frame.loading="lazy";frame.allow="autoplay; encrypted-media; clipboard-write; picture-in-picture";
  frame.allowFullscreen=true;
  frame.referrerPolicy="no-referrer";frame.className="untitled-frame";
  spot.replaceChildren(frame);btn.textContent="× Close player";
  // This source represents the open Untitled player, not verified playback:
  // cross-origin Untitled embeds expose no supported pause/play event.
  window.NetworkPlayback?.set(source,[n.id],true);
 });
}
function importFromHash(){
 const h=window.location.hash||"";
 if(!h.startsWith("#untitled="))return null;
 try{
  const p=merge(JSON.parse(decodeURIComponent(h.slice("#untitled=".length))));
  if(!p)throw Error("Invalid project");
  window.history.replaceState(null,"",window.location.pathname+window.location.search);
  return p.profileId;
 }catch(e){console.warn("Untitled import failed",e.message);return null}
}
window.NetworkUntitled={section,bindProfile,importFromHash,_test:{read,merge,forProfile,safeUrl,embedUrl}};
})();