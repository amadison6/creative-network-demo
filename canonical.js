(()=>{
  "use strict";

  // Creative Network canonical runtime.
  // One permanent URL, one runtime layer, Git history preserves older builds.
  const VERSION="v32";
  const CACHE="32-canonical";

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const byId=id=>nodes.find(n=>n.id===id);

  // ---------- styles ----------
  const style=document.createElement("style");
  style.textContent=`
    #layerEmpty.hidden,#layerEmpty:empty{display:none!important}
    .canonical-scroll-row{
      display:flex!important;flex-wrap:nowrap!important;gap:8px;
      overflow-x:auto!important;overflow-y:hidden!important;
      max-width:100%!important;min-width:0!important;padding-bottom:5px;
      -webkit-overflow-scrolling:touch;scrollbar-width:thin;scroll-snap-type:x proximity
    }
    .canonical-scroll-row>*{flex:0 0 auto!important;scroll-snap-align:start}
    .canonical-scroll-row::-webkit-scrollbar{height:5px}
    .canonical-scroll-row::-webkit-scrollbar-thumb{background:#39414d;border-radius:99px}
    .canonical-constellation-label{
      fill:#dce1e9;font-size:12px;font-weight:800;letter-spacing:.16em;
      text-transform:uppercase;opacity:.76;pointer-events:none;
      paint-order:stroke;stroke:#0b0c0f;stroke-width:5px;stroke-linejoin:round
    }
    .canonical-constellation-sub{
      fill:#768190;font-size:8px;letter-spacing:.12em;text-transform:uppercase;
      opacity:.72;pointer-events:none
    }
    .node.canonical-band-hub circle{
      fill:#332f27!important;stroke:#dfc68d!important;stroke-width:2.5!important;
      stroke-dasharray:none!important
    }
    .node.canonical-studio-hub circle{
      fill:#1f2d29!important;stroke:#8fc3a4!important;stroke-width:2.4!important;
      stroke-dasharray:none!important
    }
    .node.canonical-venue-hub circle{
      fill:#282637!important;stroke:#a896d8!important;stroke-width:2.4!important;
      stroke-dasharray:none!important
    }
    .edge.membership{stroke:#988762!important;stroke-width:1.6!important;stroke-dasharray:none!important;opacity:.6!important}
    .edge.budding{stroke:#596576;stroke-width:1.25;stroke-dasharray:2 5;opacity:.44}
    .edge.potential{stroke:#596576;stroke-width:1.05;stroke-dasharray:8 7;opacity:.27}
    #gravityBtn.active{background:#1f2e40;border-color:#557aa6;color:#dcecff}
    .canonical-photo-card{
      border:1px solid #2b303b;border-radius:14px;padding:12px;background:#171a21;margin:10px 0 14px
    }
    .canonical-photo-row{display:flex;gap:12px;align-items:center}
    .canonical-photo-preview{
      width:96px;height:96px;border-radius:50%;border:1px dashed #465061;background:#101218;
      display:flex;align-items:center;justify-content:center;overflow:hidden;flex:0 0 96px;
      color:#7f8998;font-size:10px;text-align:center
    }
    .canonical-photo-preview img{width:100%;height:100%;object-fit:cover}
    .canonical-photo-actions{display:flex;flex-direction:column;gap:8px;align-items:flex-start;min-width:0}
    .canonical-upload-btn{
      border:0;border-radius:9px;padding:9px 12px;background:#f0d49a;color:#17130d;
      font-size:12px;font-weight:800;cursor:pointer
    }
    .canonical-remove-btn{
      border:1px solid #3b424f;border-radius:9px;padding:8px 10px;background:#1b1e25;color:#d8dde5;
      font-size:11px;font-weight:700;cursor:pointer
    }
    .canonical-photo-status{font-size:10px;color:#7f8998;line-height:1.4}
    .canonical-profile-photo{
      width:112px;height:112px;border-radius:50%;object-fit:cover;border:2px solid #39414d;
      display:block;margin:6px auto 14px
    }
  `;
  document.head.appendChild(style);

  // ---------- helpers ----------
  function searchOk(n){
    const q=($("#search")?.value||"").trim().toLowerCase();
    if(!q)return true;
    return [
      n.name,n.artistName,n.artist,n.role,n.hub,n.bio,n.location,n.resources,
      n.frequentPeople,n.history,n.bookingContact,n.talentBuyer,n.audienceFit,
      n.potentialShowNotes,n.organization,n.market
    ].filter(Boolean).join(" ").toLowerCase().includes(q);
  }

  function isGroupNode(n){
    if(!n)return false;
    const name=String(n.name||"").trim().toLowerCase();
    const role=String(n.role||"").trim().toLowerCase();
    return n.profileType==="collective" || n.type==="collective" || !!n.collectiveType ||
      name==="god's contraband" || name==="gods contraband" || name==="professor what trio" ||
      role.includes("band / collective") || role.includes("band / trio") ||
      role==="band" || role==="collective" || role==="trio";
  }

  // Keep group entities OUT of the ordinary node array.
  // They are only inserted while the Bands / Collectives filter is active.
  const GROUP_REGISTRY=nodes.filter(isGroupNode);
  function setGroupNodesActive(active){
    const ids=new Set(GROUP_REGISTRY.map(g=>g.id));
    for(let i=nodes.length-1;i>=0;i--){
      if(ids.has(nodes[i]?.id))nodes.splice(i,1);
    }
    if(active){
      for(const g of GROUP_REGISTRY){
        if(!nodes.some(n=>n.id===g.id))nodes.push(g);
      }
    }
  }
  setGroupNodesActive(false);

  const groupNodes=()=>GROUP_REGISTRY;
  const studioNodes=()=>nodes.filter(n=>n.profileType==="studio");
  const venueNodes=()=>nodes.filter(n=>n.profileType==="venue");

  function membersForGroup(c){
    if(!c)return[];
    const listed=Array.isArray(c.members)
      ? c.members.map(x=>String(x).trim().toLowerCase())
      : String(c.members||"").split(/[·,;|]/).map(x=>x.trim().toLowerCase()).filter(Boolean);

    return nodes.filter(n=>{
      if(!n||isGroupNode(n)||["studio","venue"].includes(n.profileType))return false;
      const cname=String(c.name||"").toLowerCase();
      if(c.hub==="God's Contraband"||cname.includes("god's contraband")||cname.includes("gods contraband")){
        if(n.id==="solomon"||String(n.name||"").toLowerCase()==="solomon")return false;
        return n.id==="uh_sar"||(n.tags||[]).includes("God's Contraband")||n.hub==="God's Contraband";
      }
      if(c.hub==="Professor What Trio"||cname.includes("professor what")){
        return ["cam","balam","drew"].includes(n.id);
      }
      const aliases=[n.id,n.name,n.artistName,n.artist].filter(Boolean).map(x=>String(x).toLowerCase());
      return (listed.length&&aliases.some(x=>listed.includes(x))) ||
        n.hub===c.hub || (n.tags||[]).includes(c.name) || (n.tags||[]).includes(c.hub);
    });
  }

  function membershipsFor(n){
    if(!n||isGroupNode(n))return[];
    return groupNodes().filter(c=>membersForGroup(c).some(m=>m.id===n.id));
  }

  function linkedInfra(n,type){
    const ids=new Set(nodes.filter(x=>x.profileType===type).map(x=>x.id));
    return edges.flatMap(([a,b])=>{
      if(a===n.id&&ids.has(b))return[byId(b)];
      if(b===n.id&&ids.has(a))return[byId(a)];
      return[];
    }).filter(Boolean);
  }

  function addEdge(a,b,stage="budding"){
    if(!byId(a)||!byId(b))return;
    if(!edges.some(e=>(e[0]===a&&e[1]===b)||(e[0]===b&&e[1]===a)))edges.push([a,b,stage]);
  }

  function seedNode(obj){
    const existing=byId(obj.id);
    if(existing){Object.assign(existing,obj);return existing}
    nodes.push(obj);
    if(typeof offsets!=="undefined"&&!offsets[obj.id])offsets[obj.id]=[0,0];
    return obj;
  }

  function hash01(s){
    let h=2166136261;
    for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}
    return((h>>>0)%10000)/10000;
  }

  // ---------- normalize groups ----------
  groupNodes().forEach(n=>{n.profileType="collective";n.type="collective"});

  // ---------- seed studios ----------
  const studios=[
    {
      id:"studio_downtown_rehearsals",name:"Downtown Rehearsals",role:"Rehearsal / Recording Space",
      profileType:"studio",type:"hubnode",r:30,tags:["All","Studios"],hub:"Studio Spaces",
      location:"Downtown Los Angeles",capacity:"About 10 people max",
      access:"Access currently comes through Balam",availability:"Private / by arrangement",
      frequentPeople:"Balam · uh_sar · Dante · Drew (historical) · God's Contraband",
      resources:"Drums · multiple guitar amps · multiple bass amps · 16-channel Focusrite setup",
      rates:"TBD",
      history:"Balam has rented the room for more than a decade. Dante used to share the lease. Drew was also a long-time tenant. Most of God's Contraband was recorded here.",
      bio:"Long-running rehearsal and recording room central to the God's Contraband recording process. Public demo intentionally keeps the exact address private."
    },
    {
      id:"studio_drew_hollywood",name:"Drew's Hollywood Studio",role:"Recording / Creative Studio",
      profileType:"studio",type:"hubnode",r:30,tags:["All","Studios"],hub:"Studio Spaces",
      location:"Hollywood, Los Angeles",capacity:"TBD",
      access:"Drew primary; Cam shares the space; Balam also uses it",availability:"TBD",
      frequentPeople:"Drew · Cam · Balam",resources:"Equipment inventory still needs to be mapped",
      rates:"TBD",history:"Drew moved into his own Hollywood studio after being a long-time Downtown Rehearsals tenant.",
      bio:"Hollywood studio used by Drew, Cam, and Balam."
    },
    {
      id:"studio_jonah",name:"Jonah's Studio",role:"Recording Studio",
      profileType:"studio",type:"hubnode",r:29,tags:["All","Studios"],hub:"Studio Spaces",
      location:"TBD",capacity:"TBD",access:"Jonah",availability:"TBD",
      frequentPeople:"Jonah",resources:"TBD — needs an exploratory visit / conversation",rates:"TBD",
      history:"Known studio resource in Jonah's orbit; details are not mapped yet.",
      bio:"Studio to explore further."
    },
    {
      id:"studio_the_school",name:"The School",role:"Private Creative / Rehearsal Room",
      profileType:"studio",type:"hubnode",r:31,tags:["All","Studios"],hub:"Studio Spaces",
      location:"Los Angeles",capacity:"Roughly 3× the size of Downtown Rehearsals",
      access:"uh_sar controls access",availability:"Weekdays after 5 PM",
      frequentPeople:"uh_sar · Free · Solomon",
      resources:"Fender Jazz Bass · Fender Telecaster · 64-key Nord · 2 medium KRK monitors · Akai MPC Mini · Solomon's bass · Solomon's microphone",
      rates:"Private / not commercially priced",
      history:"uh_sar and Free work here often. Solomon has also used the room.",
      bio:"Large creative room at the family school. Public demo intentionally omits the street address."
    },
    {
      id:"studio_diontae_inglewood",name:"Diontae's Inglewood Space",role:"Private Creative / Recording Space",
      profileType:"studio",type:"hubnode",r:29,tags:["All","Studios"],hub:"Studio Spaces",
      location:"Inglewood",capacity:"TBD",access:"Private / by arrangement",
      availability:"TBD",frequentPeople:"Diontae · God's Contraband",
      resources:"TBD",rates:"Private",history:"God's Contraband uses the space sometimes.",
      bio:"Private residential creative space. Exact residential details are intentionally excluded."
    }
  ];
  studios.forEach(seedNode);

  addEdge("studio_downtown_rehearsals","balam","strong");
  addEdge("studio_downtown_rehearsals","uh_sar","strong");
  addEdge("studio_downtown_rehearsals","dante","strong");
  addEdge("studio_downtown_rehearsals","drew","budding");
  addEdge("studio_drew_hollywood","drew","strong");
  addEdge("studio_drew_hollywood","cam","strong");
  addEdge("studio_drew_hollywood","balam","strong");
  addEdge("studio_the_school","uh_sar","strong");
  addEdge("studio_the_school","free","strong");
  addEdge("studio_the_school","solomon","budding");
  addEdge("studio_jonah","jonah","strong");
  addEdge("studio_diontae_inglewood","diontae","strong");
  addEdge("studio_diontae_inglewood","uh_sar","budding");

  // Jonah is a person, not his studio.
  const jonah=byId("jonah"); if(jonah)jonah.profileType="musician";

  // ---------- seed Isis / ICE9 ----------
  seedNode({
    id:"isis",name:"Isis",artistName:"ICE9",artist:"ICE9",
    role:"Rapper · Painter · Graffiti Artist · Sculptor",
    profileType:"artist",type:"bridge",r:25,
    tags:["All","Rising Artists","Visual","Connectors"],hub:"LA Visual Art Scene",
    relationship:"Budding creative relationship",
    connection:"Connected through Free and ZekeUltra; potential future visual-art and live-show collaborator.",
    network:"Bridge into a broader visual-art / gallery community.",
    instagram:"https://www.instagram.com/handofisis?stkn=NjZqcWVhbnZ2dG14",
    eventLink:"https://partiful.com/e/cI43ocb5DeayrLzwQbko?c=Byft4AfX",
    nextOpportunity:"Explore an art-gallery / visual-art role at a future God's Contraband or Light Show event.",
    bio:"Rapper and multidisciplinary visual artist working across painting, graffiti, and sculpture."
  });
  addEdge("uh_sar","isis","budding");
  addEdge("free","isis","strong");
  addEdge("zeke","isis","budding");

  // ---------- seed Gold-Diggers ----------
  seedNode({
    id:"venue_gold_diggers",name:"Gold-Diggers",role:"Live Music Venue · Bar · Recording Complex",
    profileType:"venue",type:"hubnode",r:34,tags:["All","Venues"],hub:"East Hollywood",
    relationship:"Warm venue path",connection:"Brit and okay coleman! recently performed here.",
    network:"Potential live-show node with an existing warm path through artists already in the network.",
    location:"5632 Santa Monica Blvd, Los Angeles, CA 90038",
    address:"5632 Santa Monica Blvd, Los Angeles, CA 90038",
    capacity:"175",bookingEmail:"bookinginfo@gold-diggers.com",
    website:"https://gold-diggers.com/",
    bio:"East Hollywood live-music venue, bar, hotel, and recording complex."
  });
  addEdge("venue_gold_diggers","brit","strong");
  addEdge("venue_gold_diggers","okay","strong");

  // ---------- stages + group membership ----------
  edges.forEach(e=>{
    if(e[2]==="future")e[2]="potential";
    else if(!e[2])e[2]="budding";
  });
  groupNodes().forEach(c=>membersForGroup(c).forEach(m=>addEdge(c.id,m.id,"membership")));

  // ---------- persistent photos ----------
  try{
    const raw=localStorage.getItem("creativeNetworkProfileOverrides");
    if(raw){
      const saved=JSON.parse(raw);
      nodes.forEach(n=>{
        if(saved[n.id]?.photo)n.photo=saved[n.id].photo;
      });
    }
  }catch(e){console.warn("Profile override read failed",e)}

  // ---------- view controls ----------
  const viewsHost=$(".views")||$(".view-buttons")||$(".view-tabs")||$(".sidebar");
  const relationshipBtn=$('.viewbtn[data-view="relationship"]');
  const hubsBtn=$('.viewbtn[data-view="hubs"]');

  function ensureViewButton(id,label,view){
    let b=$("#"+id);
    if(!b){
      b=document.createElement("button");
      b.id=id;b.className="viewbtn";b.dataset.view=view;b.textContent=label;
      if(hubsBtn)hubsBtn.insertAdjacentElement("afterend",b);
      else viewsHost?.appendChild(b);
    }
    return b;
  }
  const studioBtn=ensureViewButton("studioViewBtn","Studio View","studios");
  const venueBtn=ensureViewButton("venueViewBtn","Venue View","venues");

  // remove obsolete infrastructure filters if an earlier browser-persisted DOM ever includes them
  $$('.filter[data-filter="Studios"],.filter[data-filter="Venues"]').forEach(b=>b.remove());

  // Gravity control
  const orbitBtn=$("#orbitBtn");
  let gravityBtn=$("#gravityBtn");
  if(orbitBtn&&!gravityBtn){
    gravityBtn=document.createElement("button");
    gravityBtn.className="version-btn";gravityBtn.id="gravityBtn";gravityBtn.textContent="◌ Gravity";
    gravityBtn.title="Experimental: connected profiles exert a subtle pull in Orbit mode";
    orbitBtn.insertAdjacentElement("afterend",gravityBtn);
  }

  // ---------- scrollable top/button rows ----------
  function makeScrollable(){
    const rows=new Set();
    $$(".viewbtn,.filter,#orbitBtn,#gravityBtn,.version-btn").forEach(el=>el.parentElement&&rows.add(el.parentElement));
    $$("button").forEach(btn=>{
      const t=[btn.id,btn.title,btn.getAttribute("aria-label"),btn.textContent].filter(Boolean).join(" ").toLowerCase();
      if(t.includes("minimize")||t.includes("collapse")||t.includes("fit screen")||t.includes("fullscreen")){
        if(btn.parentElement)rows.add(btn.parentElement);
      }
    });
    rows.forEach(row=>{
      const direct=[...row.children].filter(ch=>ch.matches?.("button,.viewbtn,.filter,.version-btn"));
      if(direct.length>=2)row.classList.add("canonical-scroll-row");
    });
  }
  makeScrollable();
  new MutationObserver(makeScrollable).observe(document.body,{childList:true,subtree:true});

  // ---------- positions ----------
  const studioHubPos={
    studio_downtown_rehearsals:[245,235],
    studio_drew_hollywood:[505,185],
    studio_jonah:[770,240],
    studio_the_school:[330,525],
    studio_diontae_inglewood:[700,520]
  };
  Object.entries(studioHubPos).forEach(([id,p])=>relationshipPos[id]=p);
  relationshipPos.venue_gold_diggers=[500,350];
  relationshipPos.isis=relationshipPos.isis||[785,470];

  function bandHubPositions(){
    const cs=groupNodes(),out={},count=Math.max(1,cs.length);
    cs.forEach((c,i)=>{
      const a=-Math.PI/2+(i/count)*Math.PI*2;
      const rx=count===1?0:205,ry=count===1?0:145;
      out[c.id]=[500+Math.cos(a)*rx,360+Math.sin(a)*ry];
    });
    return out;
  }

  const basePos=pos;
  pos=function(n){
    if(currentView==="studios"){
      if(n.profileType==="studio")return studioHubPos[n.id]||relationshipPos[n.id]||[500,360];
      const linked=linkedInfra(n,"studio");
      if(linked.length){
        const centers=linked.map(s=>studioHubPos[s.id]||relationshipPos[s.id]||[500,360]);
        const cx=centers.reduce((a,p)=>a+p[0],0)/centers.length;
        const cy=centers.reduce((a,p)=>a+p[1],0)/centers.length;
        const a=hash01(n.id)*Math.PI*2;
        const r=linked.length===1?86:36;
        return[cx+Math.cos(a)*r,cy+Math.sin(a)*r];
      }
    }
    if(currentView==="venues"){
      if(n.profileType==="venue")return n.id==="venue_gold_diggers"?[500,350]:relationshipPos[n.id]||[500,360];
      if(n.id==="brit")return[395,465];
      if(n.id==="okay")return[605,465];
    }
    if(currentView==="relationship"&&currentFilter==="Bands & Collectives"){
      const hubs=bandHubPositions();
      if(isGroupNode(n))return hubs[n.id]||[500,360];
      const ms=membershipsFor(n);
      if(ms.length){
        const centers=ms.map(c=>hubs[c.id]||[500,360]);
        const cx=centers.reduce((a,p)=>a+p[0],0)/centers.length;
        const cy=centers.reduce((a,p)=>a+p[1],0)/centers.length;
        const a=hash01(n.id)*Math.PI*2;
        const r=ms.length===1?108:45;
        return[cx+Math.cos(a)*r,cy+Math.sin(a)*r];
      }
    }
    return basePos(n);
  };

  // ---------- one visibility authority ----------
  visibleNode=function(n){
    if(!n||!searchOk(n))return false;

    if(currentView==="studios"){
      if(n.profileType==="studio")return true;
      if(isGroupNode(n)||n.profileType==="venue")return false;
      return linkedInfra(n,"studio").length>0;
    }

    if(currentView==="venues"){
      if(n.profileType==="venue")return true;
      if(isGroupNode(n)||n.profileType==="studio")return false;
      return linkedInfra(n,"venue").length>0;
    }

    if(currentView==="relationship"&&currentFilter==="Bands & Collectives"){
      if(isGroupNode(n))return true;
      if(["studio","venue"].includes(n.profileType))return false;
      return membershipsFor(n).length>0;
    }

    // Relationship All / ordinary filters + Creative Hubs: people only.
    if(isGroupNode(n)||["studio","venue"].includes(n.profileType))return false;
    if(currentFilter==="All")return true;
    return (n.tags||[]).includes(currentFilter);
  };

  // infrastructure never orbits
  const basePrimeOrbit=primeOrbit;
  primeOrbit=function(){
    basePrimeOrbit();
    nodes.filter(n=>isGroupNode(n)||["studio","venue"].includes(n.profileType)).forEach(n=>delete orbitConfig[n.id]);
  };

  // ---------- constellation labels / decoration / node photos ----------
  function clearLegacyLabels(){
    $(".v22-constellation-label,.v22-constellation-sub,.v27-cluster-label,.v28-cluster-label,.v31-constellation-label,.v31-constellation-sub,.canonical-constellation-label,.canonical-constellation-sub",viewport).forEach(el=>el.remove());
  }

  // DOM-level safety guard: the legacy renderer can still emit old band nodes even when
  // the data-level visibility function says not to. Treat the rendered DOM as the final
  // authority so group bubbles cannot leak into View All.
  function renderedNodeIsGroup(g){
    if(!g)return false;
    const n=byId(g.dataset.id);
    if(isGroupNode(n))return true;
    const text=String(g.textContent||"").replace(/\s+/g," ").trim().toLowerCase();
    return text.includes("god's contraband") ||
      text.includes("gods contraband") ||
      text.includes("professor what trio") ||
      text.includes("band / collective") ||
      text.includes("band / trio");
  }

  function enforceGroupDomState(){
    const showGroups=currentView==="relationship"&&currentFilter==="Bands & Collectives";
    const groupIds=new Set();

    $(".node",viewport).forEach(g=>{
      if(!renderedNodeIsGroup(g))return;
      if(g.dataset.id)groupIds.add(g.dataset.id);

      if(showGroups){
        g.style.removeProperty("display");
        g.classList.add("canonical-band-hub");
      }else{
        // Important: hide rather than only relying on visibleNode(), because the original
        // renderer has its own older group visibility path.
        g.style.setProperty("display","none","important");
        g.classList.remove("canonical-band-hub");
      }
    });

    $(".edge",viewport).forEach(line=>{
      const touchesGroup=groupIds.has(line.dataset.a)||groupIds.has(line.dataset.b);
      if(!touchesGroup)return;
      if(showGroups)line.style.removeProperty("display");
      else line.style.setProperty("display","none","important");
    });
  }

  function drawConstellations(){
    clearLegacyLabels();
    if(currentView!=="relationship"||currentFilter!=="All")return;
    groupNodes().forEach(c=>{
      const members=membersForGroup(c).filter(n=>$('.node[data-id="'+n.id+'"]',viewport));
      if(members.length<2)return;
      const pts=members.map(n=>motionState[n.id]||ensureMotionState(n)).filter(Boolean);
      if(!pts.length)return;
      const cx=pts.reduce((a,p)=>a+p.x,0)/pts.length;
      const minY=Math.min(...pts.map(p=>p.y));
      const label=make("text",{x:cx,y:minY-46,class:"canonical-constellation-label","text-anchor":"middle"});
      label.textContent=c.name;viewport.appendChild(label);
      const sub=make("text",{x:cx,y:minY-31,class:"canonical-constellation-sub","text-anchor":"middle"});
      sub.textContent=members.length+" MEMBER CONSTELLATION";viewport.appendChild(sub);
    });
  }

  function decorateNodes(){
    $$(".node",viewport).forEach(g=>{
      const n=byId(g.dataset.id);if(!n)return;
      g.classList.toggle("canonical-band-hub",isGroupNode(n)&&currentView==="relationship"&&currentFilter==="Bands & Collectives");
      g.classList.toggle("canonical-studio-hub",n.profileType==="studio"&&currentView==="studios");
      g.classList.toggle("canonical-venue-hub",n.profileType==="venue"&&currentView==="venues");

      if(n.photo&&!g.querySelector(".canonical-node-photo")){
        const c=g.querySelector("circle");if(!c)return;
        const cx=Number(c.getAttribute("cx")||0),cy=Number(c.getAttribute("cy")||0),r=Number(c.getAttribute("r")||20);
        const svgNS="http://www.w3.org/2000/svg";
        const defs=viewport.ownerSVGElement?.querySelector("defs")||document.createElementNS(svgNS,"defs");
        if(!defs.parentNode)viewport.ownerSVGElement?.prepend(defs);
        const clipId="photoClip_"+String(n.id).replace(/[^a-zA-Z0-9_-]/g,"_");
        if(!document.getElementById(clipId)){
          const clip=document.createElementNS(svgNS,"clipPath");clip.id=clipId;
          const cc=document.createElementNS(svgNS,"circle");
          cc.setAttribute("cx",cx);cc.setAttribute("cy",cy);cc.setAttribute("r",Math.max(1,r-2));
          clip.appendChild(cc);defs.appendChild(clip);
        }
        const im=document.createElementNS(svgNS,"image");
        im.setAttribute("class","canonical-node-photo");
        im.setAttribute("href",n.photo);im.setAttribute("x",cx-r);im.setAttribute("y",cy-r);
        im.setAttribute("width",r*2);im.setAttribute("height",r*2);
        im.setAttribute("preserveAspectRatio","xMidYMid slice");
        im.setAttribute("clip-path","url(#"+clipId+")");
        c.insertAdjacentElement("afterend",im);
        const initial=g.querySelector(".initial");if(initial)initial.style.display="none";
      }
    });
  }

  const baseRender=render;
  render=function(){
    const showGroups=currentView==="relationship"&&currentFilter==="Bands & Collectives";
    setGroupNodesActive(showGroups);
    baseRender();
    requestAnimationFrame(()=>{
      enforceGroupDomState();
      clearLegacyLabels();
      drawConstellations();
      decorateNodes();
      enforceGroupDomState();
      const empty=$("#layerEmpty");
      if(empty && !(currentView==="venues"&&venueNodes().length===0))empty.style.display="none";
    });
  };

  // ---------- view/filter behavior ----------
  function activateView(view){
    currentView=view;currentFilter="All";
    if(view!=="relationship"&&orbitMode)setOrbitMode(false);
    $$(".viewbtn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
    $$(".filter").forEach(b=>b.classList.toggle("active",b.dataset.filter==="All"));
    const ex=$("#viewExplainer");
    if(ex){
      if(view==="relationship")ex.innerHTML="<strong>Relationship View</strong><br>People are primary. Bands and collectives appear only as constellation labels until the Bands / Collectives filter is selected.";
      else if(view==="hubs")ex.innerHTML="<strong>Creative Hubs</strong><br>People cluster by scene, project, community, and creative orbit.";
      else if(view==="studios")ex.innerHTML="<strong>Studio View</strong><br>Each studio is a hub. People cluster around the spaces they use; people tied to multiple rooms sit between them.";
      else ex.innerHTML="<strong>Venue View</strong><br>Track rooms you could play, warm booking paths, capacity, rate history, and potential shows.";
    }
    Object.values(motionState||{}).forEach(s=>{if(s){s.vx*=.25;s.vy*=.25}});
    render();
    if(typeof focusSelectedAtCurrentZoom==="function")focusSelectedAtCurrentZoom();
  }

  $$(".viewbtn").forEach(btn=>{
    btn.onclick=()=>activateView(btn.dataset.view||"relationship");
  });

  $$(".filter").forEach(btn=>{
    btn.onclick=()=>{
      currentView="relationship";currentFilter=btn.dataset.filter||"All";
      $$(".viewbtn").forEach(b=>b.classList.toggle("active",b.dataset.view==="relationship"));
      $$(".filter").forEach(b=>b.classList.toggle("active",b===btn));
      if(currentFilter==="Bands & Collectives"&&orbitMode)setOrbitMode(false);
      const ex=$("#viewExplainer");
      if(ex)ex.innerHTML=currentFilter==="Bands & Collectives"
        ? "<strong>Bands / Collectives</strong><br>Group nodes appear only here. Each band node connects directly to its members."
        : "<strong>Relationship View</strong><br>People are primary. Bands and collectives stay as constellation labels in View All.";
      if(typeof triggerFilterDrift==="function")triggerFilterDrift();
      if(orbitMode)primeOrbit();
      render();
      if(typeof focusSelectedAtCurrentZoom==="function")focusSelectedAtCurrentZoom();
    };
  });

  // ---------- gravity ----------
  let gravityMode=false;
  if(gravityBtn){
    gravityBtn.onclick=()=>{
      gravityMode=!gravityMode;
      if(gravityMode&&!orbitMode)setOrbitMode(true);
      gravityBtn.classList.toggle("active",gravityMode);
      gravityBtn.textContent=gravityMode?"● Gravity":"◌ Gravity";
    };
  }
  function gravityFrame(){
    if(gravityMode&&orbitMode&&currentView==="relationship"){
      const visibleIds=new Set(nodes.filter(visibleNode).map(n=>n.id));
      edges.forEach(([a,b,stage])=>{
        if(!visibleIds.has(a)||!visibleIds.has(b))return;
        const na=byId(a),nb=byId(b);
        if(!na||!nb||isGroupNode(na)||isGroupNode(nb)||["studio","venue"].includes(na.profileType)||["studio","venue"].includes(nb.profileType))return;
        const sa=motionState[a]||ensureMotionState(na),sb=motionState[b]||ensureMotionState(nb);
        let dx=sb.x-sa.x,dy=sb.y-sa.y,d=Math.hypot(dx,dy);if(d<1)return;
        const weight=stage==="strong"?1:(stage==="budding"?.36:.06);
        const force=Math.min(.0038,weight*.0025*Math.max(.35,Math.min(1.5,d/180)));
        dx/=d;dy/=d;sa.vx+=dx*force;sa.vy+=dy*force;sb.vx-=dx*force;sb.vy-=dy*force;
      });
    }
    requestAnimationFrame(gravityFrame);
  }
  requestAnimationFrame(gravityFrame);

  // ---------- profile photo upload ----------
  let photoTarget=null;

  async function compressPhoto(file){
    const url=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{
        const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=url;
      });
      let w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
      const scale=Math.min(1,720/Math.max(w,h));
      w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));
      const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
      canvas.getContext("2d").drawImage(img,0,0,w,h);
      return canvas.toDataURL("image/jpeg",.82);
    }finally{URL.revokeObjectURL(url)}
  }

  function persistPhoto(n,src,change){
    if(src)n.photo=src;else delete n.photo;
    try{
      const raw=localStorage.getItem("creativeNetworkProfileOverrides");
      const data=raw?JSON.parse(raw):{};
      data[n.id]={...(data[n.id]||{}),photo:src||""};
      localStorage.setItem("creativeNetworkProfileOverrides",JSON.stringify(data));
      if(typeof persistEditedProfiles==="function")persistEditedProfiles();
      if(typeof persistCustomProfileIfNeeded==="function")persistCustomProfileIfNeeded(n);
      if(typeof queueNetworkChange==="function")queueNetworkChange({
        type:"profile_photo_update",profileId:n.id,profileName:n.name,change,
        note:"Photo stored locally in this browser in the static prototype."
      });
    }catch(e){console.warn("Photo persistence failed",e)}
    render();showProfile(n);
  }

  function ensureEditPhotoCard(){
    const modal=$("#editProfileModal");if(!modal||$("#canonicalPhotoCard"))return;
    const card=document.createElement("div");card.id="canonicalPhotoCard";card.className="canonical-photo-card";
    card.innerHTML=
      '<div class="section-title">Profile picture</div>'+
      '<div class="canonical-photo-row">'+
        '<div class="canonical-photo-preview" id="canonicalPhotoPreview"><span>No photo</span></div>'+
        '<div class="canonical-photo-actions">'+
          '<button class="canonical-upload-btn" id="canonicalPhotoUploadBtn" type="button">Upload profile picture</button>'+
          '<button class="canonical-remove-btn" id="canonicalPhotoRemoveBtn" type="button">Remove picture</button>'+
          '<div class="canonical-photo-status" id="canonicalPhotoStatus">Stored only in this browser for now.</div>'+
          '<input type="file" id="canonicalPhotoFile" accept="image/*" hidden>'+
        '</div>'+
      '</div>';
    const grid=$(".form-grid",modal);
    if(grid)grid.insertAdjacentElement("beforebegin",card);else modal.appendChild(card);

    const input=$("#canonicalPhotoFile");
    $("#canonicalPhotoUploadBtn").onclick=()=>input.click();
    input.onchange=async()=>{
      const file=input.files?.[0];if(!file||!photoTarget)return;
      $("#canonicalPhotoStatus").textContent="Preparing image…";
      try{
        const src=await compressPhoto(file);
        persistPhoto(photoTarget,src,photoTarget.photo?"replaced":"added");
      }catch(e){$("#canonicalPhotoStatus").textContent="Could not read that image. Try JPG or PNG."}
      input.value="";
    };
    $("#canonicalPhotoRemoveBtn").onclick=()=>photoTarget&&persistPhoto(photoTarget,"","removed");
  }

  function refreshEditPhoto(n){
    ensureEditPhotoCard();photoTarget=n;
    const p=$("#canonicalPhotoPreview"),s=$("#canonicalPhotoStatus");
    if(p)p.innerHTML=n?.photo?'<img src="'+n.photo+'" alt="Profile picture">':'<span>No photo</span>';
    if(s)s.textContent="Upload, replace, or remove this profile picture. Stored only in this browser for now.";
  }

  const baseOpenEdit=openEditProfile;
  openEditProfile=function(n){
    photoTarget=n;baseOpenEdit(n);
    requestAnimationFrame(()=>refreshEditPhoto(n));
  };

  const baseShowProfile=showProfile;
  showProfile=function(n){
    photoTarget=n;baseShowProfile(n);
    const pane=$("#profile");if(!pane)return;

    pane.querySelectorAll(".canonical-profile-photo,.canonical-direct-photo").forEach(x=>x.remove());
    if(n.photo){
      const img=document.createElement("img");
      img.className="canonical-profile-photo";img.src=n.photo;img.alt=(n.name||"")+" profile picture";
      pane.prepend(img);
    }

    const actions=$(".profile-actions",pane);
    const wrap=document.createElement("div");wrap.className="canonical-direct-photo";wrap.style.margin="10px 0 14px";
    wrap.innerHTML=
      '<button class="canonical-upload-btn" type="button">'+(n.photo?"Replace profile picture":"Upload profile picture")+'</button>'+
      '<input type="file" accept="image/*" hidden>';
    if(actions)actions.insertAdjacentElement("beforebegin",wrap);else pane.appendChild(wrap);
    const input=wrap.querySelector("input");
    wrap.querySelector("button").onclick=()=>input.click();
    input.onchange=async()=>{
      const file=input.files?.[0];if(!file)return;
      const src=await compressPhoto(file);
      persistPhoto(n,src,n.photo?"replaced":"added");
    };

    // Public-safe extra cards
    if(n.id==="isis"&&!pane.querySelector(".canonical-isis-extra")){
      const d=document.createElement("div");d.className="canonical-isis-extra";
      d.innerHTML='<div class="section-title">Current Opportunity</div>'+
        '<div class="card"><div class="k">Upcoming event</div><div class="v"><a href="'+n.eventLink+'" target="_blank" rel="noopener noreferrer">Open Partiful event</a></div></div>'+
        '<div class="card" style="margin-top:10px"><div class="k">Potential collaboration</div><div class="v">'+n.nextOpportunity+'</div></div>';
      if(actions)actions.insertAdjacentElement("beforebegin",d);else pane.appendChild(d);
    }
    if(n.id==="venue_gold_diggers"&&!pane.querySelector(".canonical-venue-extra")){
      const d=document.createElement("div");d.className="canonical-venue-extra";
      d.innerHTML='<div class="section-title">Venue Details</div>'+
        '<div class="card"><div class="k">Address</div><div class="v">'+n.address+'</div></div>'+
        '<div class="card" style="margin-top:10px"><div class="k">Capacity</div><div class="v">'+n.capacity+'</div></div>'+
        '<div class="card" style="margin-top:10px"><div class="k">Booking</div><div class="v"><a href="mailto:'+n.bookingEmail+'">'+n.bookingEmail+'</a></div></div>'+
        '<div class="card" style="margin-top:10px"><div class="k">Warm path</div><div class="v">Brit + okay coleman! performed here recently.</div></div>';
      if(actions)actions.insertAdjacentElement("beforebegin",d);else pane.appendChild(d);
    }
  };

  ensureEditPhotoCard();

  // Keep the group visibility rule enforced even if legacy animation/render code mutates
  // the SVG after the canonical render callback.
  const groupDomGuard=new MutationObserver(()=>{
    requestAnimationFrame(()=>{
      enforceGroupDomState();
      if(currentView==="relationship"&&currentFilter==="All"){
        const hasLabel=$(".canonical-constellation-label",viewport);
        if(!hasLabel)drawConstellations();
      }
    });
  });
  groupDomGuard.observe(viewport,{childList:true,subtree:true});
  enforceGroupDomState();

  // ---------- release history ----------
  const sub=$(".sidebar .sub");
  if(sub)sub.textContent="Creative Network Demo · canonical";
  if(typeof APP_RELEASES!=="undefined"&&!APP_RELEASES.some(r=>r.version==="v32.2")){
    APP_RELEASES.unshift({
      version:"v32.2",file:null,date:"2026-09-18",title:"Band nodes removed from default data layer",
      notes:[
        "Band / collective entities are removed from the ordinary node array and only inserted while the Bands / Collectives filter is active",
        "One permanent URL remains the latest build; Git history preserves recoverable older versions",
        "View All hides band bubbles and shows constellation labels only",
        "Bands / Collectives reveals group nodes with member connections",
        "Studio and Venue views are first-class infrastructure views",
        "Top control rows scroll horizontally",
        "Profile picture upload is available from profile and Edit Profile"
      ]
    });
  }

  // Initial state: Relationship / All, with clean constellation behavior.
  currentView=currentView||"relationship";
  if(currentView==="relationship"&&!currentFilter)currentFilter="All";
  render();
})();