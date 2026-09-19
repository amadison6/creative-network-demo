/* Network HQ · v47 monthly-listener presentation.
 * Only displays measured snapshots from an authorized, user-configured feed.
 * No Spotify page scraping, speculative metrics, or fake zero values.
 */
(function(){
  "use strict";
  let feed={schemaVersion:1,provider:null,updatedAt:null,artists:{}};
  let started=false;
  let dashboardOpen=false;
  let loading=false;
  let error="";
  let checkedAt=null;
  const URL="./listener-stats.json";
  function escapeHTML(v){return String(v??"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
  function el(id){return document.getElementById(id)}
  function artistProfiles(){
    if(typeof nodes==="undefined"||typeof parseSpotifyLink!=="function")return [];
    return nodes.map(n=>({n,spotify:parseSpotifyLink(n.links?.Spotify)})).filter(x=>x.spotify?.kind==="artist");
  }
  function snapshots(item){
    if(!item || !Array.isArray(item.history))return [];
    const clean=item.history.filter(x=>x&&Number.isSafeInteger(x.value)&&x.value>=0&&
      typeof x.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x.date));
    clean.sort((a,b)=>a.date.localeCompare(b.date));
    return clean.filter((x,i)=>i===clean.length-1||x.date!==clean[i+1].date);
  }
  function observation(n,spotify){
    if(!spotify || spotify.kind!=="artist")return null;
    const item=feed.artists?.[n.id];
    if(!item || item.spotifyId!==spotify.id)return null;
    const samples=snapshots(item);
    if(!samples.length)return null;
    const latest=samples[samples.length-1];
    const prev=samples.length>1?samples[samples.length-2]:null;
    const diff=prev?latest.value-prev.value:null;
    const pct=prev&&prev.value>0?100*diff/prev.value:null;
    return {latest,prev,diff,pct,source:item.source||feed.provider||"Data provider"};
  }
  function format(v){return Number(v).toLocaleString("en-US")}
  function deltaView(o){
    if(!o || !o.prev)return '<span class="listener-wait">First snapshot · no previous check</span>';
    if(o.diff===0)return '<span class="listener-flat">→ 0 · 0.00% since previous snapshot</span>';
    const positive=o.diff>0;
    const pct=o.pct===null?"n/a":Math.abs(o.pct).toFixed(2)+"%";
    const sign=positive?"+":"−";
    return '<span class="'+(positive?"listener-up":"listener-down")+'">'+
      (positive?"▲":"▼")+' '+sign+format(Math.abs(o.diff))+' · '+
      (o.pct===null?"n/a":sign+pct)+' since previous snapshot</span>';
  }
  function asOf(o){return o?.latest.date||""}
  function renderContent(n,spotify){
    const o=observation(n,spotify);
    if(!o){
      return '<div class="listener-current">—</div>'+
        '<div class="listener-wait">No verified listener snapshots yet.</div>'+
        '<div class="listener-source">Automatic source not connected. Spotify login does not provide monthly-listener counts.</div>';
    }
    return '<div class="listener-current">'+format(o.latest.value)+'</div>'+
      '<div class="listener-caption">Monthly listeners · rolling 28 days</div>'+
      '<div class="listener-delta">'+deltaView(o)+'</div>'+
      '<div class="listener-source">'+escapeHTML(o.source)+' · '+escapeHTML(asOf(o))+
      (o.prev?' · previous: '+escapeHTML(o.prev.date):"")+'</div>';
  }
  function card(n,spotify){
    if(!spotify || spotify.kind!=="artist")return "";
    return '<div class="listener-card">'+
      '<div class="integration-heading"><strong>Monthly listeners</strong>'+
        '<span class="listener-pill">Audience watch</span></div>'+
      '<div id="listenerCardBody">'+renderContent(n,spotify)+'</div>'+
      '<div class="listener-actions">'+
        '<button id="listenerRefreshBtn" type="button" '+(loading?'disabled':'')+'>↻ Check latest snapshot</button>'+
        '<button id="listenerDashboardBtn" type="button">View artist watchlist</button>'+
      '</div>'+
      '<div id="listenerRefreshStatus" class="listener-source" aria-live="polite">'+
        (loading?"Checking snapshot feed…":error?escapeHTML(error):"Checks for new reported data while Network HQ is open.")+
      '</div></div>';
  }
  function updateCard(){
    const profile=typeof selected!=="undefined"?selected:null;
    const spotify=profile&&parseSpotifyLink(profile.links?.Spotify);
    const body=el("listenerCardBody");
    if(profile&&body){
      body.innerHTML=renderContent(profile,spotify);
      const status=el("listenerRefreshStatus");
      if(status)status.textContent=loading?"Checking snapshot feed…":error||
        (checkedAt?"Feed checked at "+checkedAt.toLocaleTimeString():"Waiting to check feed…");
      const btn=el("listenerRefreshBtn");if(btn)btn.disabled=loading;
    }
  }
  function bind(){
    const refresh=el("listenerRefreshBtn");
    if(refresh)refresh.onclick=()=>load();
    const all=el("listenerDashboardBtn");
    if(all)all.onclick=openDashboard;
  }
  async function load(){
    if(loading)return;
    loading=true;updateCard();renderDashboard();
    try{
      const r=await fetch(URL+"?t="+Date.now(),{cache:"no-store"});
      if(!r.ok)throw Error("Snapshot feed unavailable ("+r.status+").");
      const data=await r.json();
      if(!data || data.schemaVersion!==1 || typeof data.artists!=="object" || !data.artists || Array.isArray(data.artists))
        throw Error("Invalid snapshot feed.");
      feed=data;error="";checkedAt=new Date();
    }catch(e){
      error=e.message||"Could not check listener snapshot feed.";
    }finally{
      loading=false;updateCard();renderDashboard();
    }
  }
  function dashboardRow(n,spotify){
    const o=observation(n,spotify);
    return '<div class="listener-watch-row">'+
      '<div class="listener-watch-name"><strong>'+escapeHTML(n.artistName||n.name)+'</strong>'+
      '<a href="'+escapeHTML(spotify.url)+'" target="_blank" rel="noopener noreferrer">Spotify ↗</a></div>'+
      '<div class="listener-watch-value">'+(o?format(o.latest.value):"—")+'</div>'+
      '<div class="listener-watch-delta">'+(o?deltaView(o):'<span class="listener-wait">Not connected</span>')+'</div>'+
      '<div class="listener-watch-date">'+(o?escapeHTML(o.latest.date):"Awaiting source")+'</div></div>';
  }
  function renderDashboard(){
    const box=el("listenerWatchRows");
    if(!box)return;
    const profiles=artistProfiles();
    box.innerHTML=profiles.length?profiles.map(x=>dashboardRow(x.n,x.spotify)).join(""):
      '<p>No artist Spotify links have been saved yet.</p>';
    const caption=el("listenerWatchCaption");
    if(caption)caption.textContent=loading?"Refreshing snapshot feed…":
      error?error:feed.updatedAt?"Source: "+(feed.provider||"Music data")+
      " · Updated "+feed.updatedAt:"No licensed audience data source connected.";
  }
  function openDashboard(){
    if(!started)boot();
    dashboardOpen=true;
    const modal=el("listenerWatchModal");
    if(modal)modal.hidden=false;
    renderDashboard();
  }
  function closeDashboard(){
    dashboardOpen=false;
    const modal=el("listenerWatchModal");if(modal)modal.hidden=true;
  }
  function boot(){
    if(started)return;
    started=true;
    const modal=document.createElement("div");
    modal.id="listenerWatchModal";
    modal.className="listener-watch-backdrop";
    modal.hidden=true;
    modal.innerHTML='<section class="listener-watch-dialog" role="dialog" aria-modal="true" aria-labelledby="listenerWatchTitle">'+
      '<div class="listener-watch-head"><div><strong id="listenerWatchTitle">Audience Watch</strong>'+
      '<div>Monthly listeners · rolling 28 days</div></div>'+
      '<button id="listenerWatchClose" type="button" aria-label="Close audience watch">×</button></div>'+
      '<div class="listener-watch-rows" id="listenerWatchRows"></div>'+
      '<div class="listener-watch-bottom"><div id="listenerWatchCaption"></div>'+
      '<button type="button" id="listenerWatchRefresh">↻ Refresh reported data</button></div></section>';
    document.body.appendChild(modal);
    const nav=el("listenerWatchButton");
    if(nav)nav.onclick=openDashboard;
    el("listenerWatchClose").onclick=closeDashboard;
    el("listenerWatchRefresh").onclick=()=>load();
    modal.addEventListener("click",e=>{if(e.target===modal)closeDashboard()});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&dashboardOpen){e.preventDefault();closeDashboard()}});
    load();
    window.setInterval(()=>{if(!document.hidden)load()},60*60*1000);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden && checkedAt &&
      Date.now()-checkedAt.getTime()>60*60*1000)load()});
  }
  window.NetworkListeners={card,bind,boot,load,openDashboard,closeDashboard,
    _test:{snapshots,deltaView,observation}};
})();