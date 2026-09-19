/* Network HQ v52 · Event Radar
 * Browser-local event ledger linked to existing canonical map profiles.
 * No automatic Partiful / Instagram / DICE discovery, no private data access.
 */
(function(){
  "use strict";
  const KEY="creativeNetworkEventRadarV1";
  let open=false,editing="",filter="all",booted=false;
  function el(id){return document.getElementById(id)}
  function safe(x){return String(x??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/'/g,"&#39;")}
  function profiles(){return typeof nodes!=="undefined"?nodes:[]}
  function read(){try{const v=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(v)?v:[]}catch(_){return []}}
  function save(v){localStorage.setItem(KEY,JSON.stringify(v))}
  function uid(){return "er_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,9)}
  function dateOK(v){if(!v)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+"T12:00:00");return !Number.isNaN(d.getTime())&&d.getFullYear()===+v.slice(0,4)&&d.getMonth()+1===+v.slice(5,7)&&d.getDate()===+v.slice(8,10)}
  function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
  function urlInfo(raw){
    if(!raw)return {url:"",key:""};
    try{
      const u=new URL(raw);
      if(u.protocol!=="https:"&&u.protocol!=="http:")return null;
      const host=u.hostname.toLowerCase();
      if(host==="partiful.com"||host==="www.partiful.com"){
        const parsed=typeof parsePartifulLink==="function"?parsePartifulLink(raw):null;
        if(!parsed||parsed.kind!=="event")return null;
        return {url:parsed.url,key:"partiful:"+parsed.id};
      }
      if(!host)return null;
      u.hash="";
      return {url:u.href,key:u.href};
    }catch(_){return null}
  }
  function keyOf(record){
    const info=urlInfo(record?.url||"");return info?.key||"";
  }
  function synced(){
    const all=read(),byKey=new Map();
    all.forEach(e=>{const k=keyOf(e);if(k)byKey.set(k,e)});
    let changed=false;
    profiles().forEach(p=>{
      const urls=Array.isArray(p.partifulEvents)?p.partifulEvents:[];
      urls.forEach(raw=>{
        const info=urlInfo(raw);
        if(!info?.key.startsWith("partiful:"))return;
        const existing=byKey.get(info.key);
        if(existing){
          if(!existing.profileIds?.includes(p.id)){
            existing.profileIds=[...new Set([...(existing.profileIds||[]),p.id])];
            changed=true;
          }
          return;
        }
        const e={id:uid(),title:"Partiful event linked to "+(p.artistName||p.name),
          date:"",time:"",url:info.url,profileIds:[p.id],role:"Associated",
          source:"Saved Partiful link",notes:"Event date and host have not been verified.",
          seen:true,hidden:false,addedAt:new Date().toISOString()};
        all.push(e);byKey.set(info.key,e);changed=true;
      });
    });
    if(changed)save(all);
    updateNav(all);
    return all;
  }
  function upcoming(e){return !e.date||e.date>=today()}
  function count(id){
    return read().filter(e=>!e.hidden&&!e.seen&&upcoming(e)&&e.profileIds?.includes(id)).length;
  }
  function updateNav(list){
    const btn=el("networkEventRadarButton");if(!btn)return;
    const num=(list||read()).filter(e=>!e.hidden&&!e.seen&&upcoming(e)).length;
    btn.textContent="◈ Event Radar"+(num?" · "+num:"");
    btn.title=num?num+" unreviewed network events":"Events linked to your network";
  }
  function labelDate(e){
    if(!e.date)return "Date not recorded";
    const parts=e.date.split("-").map(Number);
    const d=new Date(parts[0],parts[1]-1,parts[2]);
    return d.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric",year:"numeric"})+(e.time?" · "+e.time:"");
  }
  function people(e){
    return (e.profileIds||[]).map(id=>profiles().find(p=>p.id===id)?.name).filter(Boolean);
  }
  function eventRow(e,profileView){
    const names=people(e);
    return '<div class="radar-event'+(!e.seen&&upcoming(e)?' radar-unread':'')+'">'+
      '<div class="radar-event-top"><strong>'+safe(e.title)+'</strong>'+
      (!e.seen&&upcoming(e)?'<span class="radar-new">NEW</span>':'')+'</div>'+
      '<div class="radar-event-date">'+safe(labelDate(e))+'</div>'+
      '<div class="radar-event-meta">'+safe(e.role||"Associated")+' · '+safe(names.join(", ")||"No person linked")+
      ' · '+safe(e.source||"Added manually")+'</div>'+
      (e.notes?'<div class="radar-event-note">'+safe(e.notes)+'</div>':"")+
      '<div class="radar-event-buttons">'+
      (e.url?'<a href="'+safe(e.url)+'" target="_blank" rel="noopener noreferrer">Open event ↗</a>':"")+
      (profileView?'<button data-radar-profile-open="true" type="button">Event Radar ↗</button>':
      '<button data-radar-edit="'+safe(e.id)+'" type="button">Edit</button>')+
      (!e.seen?'<button data-radar-seen="'+safe(e.id)+'" type="button">Mark seen</button>':'')+
      (!profileView?'<button data-radar-hide="'+safe(e.id)+'" type="button">Remove</button>':'')+
      '</div></div>';
  }
  function section(n){
    const list=synced().filter(e=>!e.hidden&&e.profileIds?.includes(n.id))
      .sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999")).slice(0,8);
    const newCount=count(n.id);
    return '<div class="section-title">Event Radar'+(newCount?' · '+newCount+' new':'')+'</div>'+
      '<div class="radar-profile-card">'+
      '<div class="radar-profile-head">Events connected to '+safe(n.name)+'</div>'+
      (list.length?list.map(e=>eventRow(e,true)).join(""):
        '<div class="radar-muted">No events linked yet. Save an event when you learn someone is hosting or performing.</div>')+
      '<button type="button" id="radarAddForProfile">＋ Add or link event</button>'+
      '</div>';
  }
  function bindProfile(n){
    const btn=el("radarAddForProfile");
    if(btn)btn.onclick=()=>openRadar(n.id);
    document.querySelectorAll("#profile [data-radar-profile-open]").forEach(b=>b.onclick=()=>openRadar(n.id));
    document.querySelectorAll("#profile [data-radar-seen]").forEach(b=>b.onclick=()=>modify(b.dataset.radarSeen,"seen"));
  }
  function render(){
    const modal=el("networkEventRadarModal");if(!modal||modal.hidden)return;
    const list=synced().filter(e=>!e.hidden);
    const active=list.filter(upcoming);
    const newCount=active.filter(e=>!e.seen).length;
    el("radarSummary").textContent=list.length+" linked event"+(list.length===1?"":"s")+
      " · "+active.length+" upcoming / undated"+(newCount?" · "+newCount+" new":"");
    let chosen=list;
    if(filter==="upcoming")chosen=list.filter(upcoming);
    if(filter==="new")chosen=list.filter(e=>!e.seen&&upcoming(e));
    if(filter==="needsdate")chosen=list.filter(e=>!e.date);
    chosen.sort((a,b)=>{
      if(!a.date&&!b.date)return (b.addedAt||"").localeCompare(a.addedAt||"");
      if(!a.date)return 1;if(!b.date)return -1;
      return a.date.localeCompare(b.date);
    });
    el("radarItems").innerHTML=chosen.length?chosen.map(e=>eventRow(e,false)).join(""):
      '<div class="radar-muted">No events in this view. Add a known event or link one from a profile.</div>';
    document.querySelectorAll("#networkEventRadarModal [data-radar-filter]").forEach(b=>{
      b.classList.toggle("active",b.dataset.radarFilter===filter);
    });
    el("radarSubmit").textContent=editing?"Save event changes":"Add to Event Radar";
    el("radarCancelEdit").hidden=!editing;
  }
  function status(message,isError=false){
    const box=el("radarStatus");
    if(box){box.textContent=message;box.classList.toggle("radar-error",isError)}
  }
  function resetForm(profileId=""){
    editing="";
    for(const id of ["radarTitle","radarDate","radarTime","radarUrl","radarNotes"])el(id).value="";
    el("radarProfile").value=profileId||profiles()[0]?.id||"";
    el("radarRole").value="Hosting";
    status("Events are saved locally. No Partiful or Instagram account is connected.");
    if(open)render();
  }
  function edit(id){
    const e=read().find(x=>x.id===id);if(!e)return;
    editing=e.id;
    el("radarTitle").value=e.title||"";
    el("radarDate").value=e.date||"";
    el("radarTime").value=e.time||"";
    el("radarUrl").value=e.url||"";
    el("radarNotes").value=e.notes||"";
    el("radarProfile").value=e.profileIds?.[0]||"";
    el("radarRole").value=["Hosting","Performing","Organizing","Attending","Associated"].includes(e.role)?e.role:"Associated";
    status("Editing an existing event. If multiple people share its link, it stays one event.");
    render();el("radarTitle").focus();
  }
  function upsert(){
    const title=el("radarTitle").value.trim(),date=el("radarDate").value.trim(),
      time=el("radarTime").value.trim(),raw=el("radarUrl").value.trim(),
      profileId=el("radarProfile").value,role=el("radarRole").value,
      notes=el("radarNotes").value.trim();
    if(!title){status("Add an event title.",true);el("radarTitle").focus();return}
    if(!profiles().some(p=>p.id===profileId)){status("Choose a person or organization already on the map.",true);return}
    if(!dateOK(date)){status("The event date is invalid.",true);return}
    const link=urlInfo(raw);
    if(!link){status("Use a valid http(s) event URL. Partiful links must be /e/ invitations.",true);return}
    let list=read(),current=list.find(x=>x.id===editing);
    if(link.key){
      const matching=list.find(x=>x.id!==editing&&keyOf(x)===link.key);
      if(matching){
        matching.profileIds=[...new Set([...(matching.profileIds||[]),profileId,...(current?.profileIds||[])])];
        // Never overwrite previously entered date/title with a blank field.
        if(title&&!/^Partiful event linked to /.test(title))matching.title=title;
        if(date)matching.date=date;
        if(time)matching.time=time;
        if(notes)matching.notes=notes;
        if(role!=="Associated")matching.role=role;
        matching.seen=false;matching.hidden=false;
        if(current)list=list.filter(x=>x.id!==current.id);
        save(list);
        resetForm(profileId);refresh();status("Linked the existing event to this profile—no duplicate created.");
        return;
      }
    }
    if(current){
      Object.assign(current,{title,date,time,url:link.url,role,notes,profileIds:[...new Set([...(current.profileIds||[]),profileId])],hidden:false});
    }else{
      list.push({id:uid(),title,date,time,url:link.url,role,notes,profileIds:[profileId],
        seen:false,hidden:false,source:"Added manually",addedAt:new Date().toISOString()});
    }
    save(list);resetForm(profileId);refresh();status("Event saved to your network.");
  }
  function refresh(){
    updateNav(read());
    render();
    if(typeof selected!=="undefined"&&selected&&typeof showProfile==="function")showProfile(selected);
    else if(typeof window.render==="function")window.render();
    else if(typeof nodes!=="undefined"&&typeof window.NetworkEvents?.refreshMap==="function")window.NetworkEvents.refreshMap();
  }
  function modify(id,method){
    const list=read(),e=list.find(x=>x.id===id);if(!e)return;
    if(method==="seen")e.seen=true;
    if(method==="hide"){
      if(!window.confirm("Remove this event from Event Radar? Existing Partiful links on profiles will be preserved."))return;
      e.hidden=true;e.seen=true;
    }
    save(list);refresh();
  }
  function openRadar(profileId=""){
    if(!booted)boot();
    open=true;el("networkEventRadarModal").hidden=false;
    resetForm(profileId);
    render();
  }
  function close(){open=false;const modal=el("networkEventRadarModal");if(modal)modal.hidden=true}
  function boot(){
    if(booted)return;booted=true;
    const modal=document.createElement("div");
    modal.id="networkEventRadarModal";modal.className="radar-backdrop";modal.hidden=true;
    modal.innerHTML='<section class="radar-dialog" role="dialog" aria-modal="true" aria-labelledby="radarTitleHeading">'+
      '<div class="radar-head"><div><strong id="radarTitleHeading">◈ Event Radar</strong>'+
      '<p id="radarSummary">Events in your creative network</p></div>'+
      '<button type="button" id="radarClose" aria-label="Close Event Radar">×</button></div>'+
      '<div class="radar-columns"><div class="radar-list-pane">'+
      '<div class="radar-tabs"><button type="button" data-radar-filter="all">All</button>'+
      '<button type="button" data-radar-filter="upcoming">Upcoming</button>'+
      '<button type="button" data-radar-filter="new">New</button>'+
      '<button type="button" data-radar-filter="needsdate">Needs date</button></div>'+
      '<div id="radarItems" class="radar-items"></div></div>'+
      '<form id="radarForm" class="radar-form"><strong>Add or update an event</strong>'+
      '<p>Associate an event with someone already on your map. No public-event discovery is connected yet.</p>'+
      '<label for="radarProfile">Person / organization</label><select id="radarProfile" required></select>'+
      '<label for="radarRole">Connection to event</label><select id="radarRole">'+
      '<option>Hosting</option><option>Performing</option><option>Organizing</option><option>Attending</option><option>Associated</option></select>'+
      '<label for="radarTitle">Event title</label><input id="radarTitle" required placeholder="Show, art opening, listening party…">'+
      '<div class="radar-dates"><div><label for="radarDate">Date (if known)</label><input id="radarDate" type="date"></div>'+
      '<div><label for="radarTime">Time (optional)</label><input id="radarTime" type="time"></div></div>'+
      '<label for="radarUrl">Event URL</label><input id="radarUrl" type="url" placeholder="Partiful, DICE, Eventbrite, Instagram…">'+
      '<label for="radarNotes">Notes</label><textarea id="radarNotes" rows="3" placeholder="Who invited you? What is confirmed?"></textarea>'+
      '<div class="radar-form-actions"><button id="radarSubmit" type="submit">Add to Event Radar</button>'+
      '<button type="button" id="radarCancelEdit" hidden>Cancel edit</button></div>'+
      '<div id="radarStatus" class="radar-muted" aria-live="polite"></div>'+
      '<div class="radar-disclosure">Source: manual entries and Partiful links you saved on profiles. This prototype does not scan people’s accounts, detect all events, or send background push alerts.</div>'+
      '</form></div></section>';
    document.body.appendChild(modal);
    const select=el("radarProfile");
    select.innerHTML=profiles().map(p=>'<option value="'+safe(p.id)+'">'+safe(p.name)+'</option>').join("");
    const entry=el("networkEventRadarButton");
    if(entry)entry.onclick=()=>openRadar();
    el("radarClose").onclick=close;
    modal.addEventListener("click",e=>{
      if(e.target===modal){close();return}
      const btn=e.target.closest("button");if(!btn||btn.disabled)return;
      if(btn.dataset.radarFilter){filter=btn.dataset.radarFilter;render();return}
      if(btn.dataset.radarEdit){edit(btn.dataset.radarEdit);return}
      if(btn.dataset.radarSeen){modify(btn.dataset.radarSeen,"seen");return}
      if(btn.dataset.radarHide){modify(btn.dataset.radarHide,"hide");return}
    });
    el("radarForm").addEventListener("submit",e=>{e.preventDefault();upsert()});
    el("radarCancelEdit").onclick=()=>resetForm(el("radarProfile").value);
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&open){e.preventDefault();close()}});
    synced();
  }
  window.NetworkEvents={boot,sync:synced,count,section,bindProfile,open:openRadar,close,refreshMap:()=>{if(typeof window.render==="function")window.render();},
    _test:{dateOK,urlInfo,upcoming,keyOf,labelDate}};
})();