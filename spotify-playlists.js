/* Network HQ v46 — cross-artist Spotify mix builder.
 * Uses the Spotify Premium session already authorized by spotify-full.js.
 * Drafts contain only tracks the user explicitly selects; no bulk catalog cache.
 */
(function () {
  "use strict";
  const DRAFT_KEY = "creativeNetworkMixDraftV1";
  const RETURN_KEY = "creativeNetworkMixReturn";
  const MAX_TRACKS = 500;
  let opened = false;
  let chosenProfile = "";
  let activeAlbum = "";
  let releases = [];
  let albumsPage = 0;
  let moreReleases = false;
  let albumTracks = [];
  let tracksPage = 0;
  let moreTracks = false;
  let loading = false;
  let status = "";
  let statusError = false;
  let successURL = "";
  let draft = [];
  let selectedAlbum = null;
  let releaseArtistId = "";

  function el(id) { return document.getElementById(id); }
  function spotify() { return window.NetworkSpotify; }
  function safe(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function spotifyLink(id, kind) {
    if (!/^[A-Za-z0-9]{22}$/.test(String(id || ""))) return "";
    if (!["artist", "album", "track", "playlist"].includes(kind)) return "";
    return "https://open.spotify.com/" + kind + "/" + id;
  }
  function artistProfiles() {
    if (typeof nodes === "undefined" || typeof parseSpotifyLink !== "function") return [];
    return nodes.map(function (profile) {
      return { profile: profile, spotify: parseSpotifyLink(profile.links && profile.links.Spotify) };
    }).filter(function (item) { return item.spotify && item.spotify.kind === "artist"; });
  }
  function readDraft() {
    try {
      const value = JSON.parse(localStorage.getItem(DRAFT_KEY) || "[]");
      if (!Array.isArray(value)) return [];
      return value.filter(function (t) {
        return t && /^[A-Za-z0-9]{22}$/.test(t.id) &&
          typeof t.name === "string" && typeof t.artist === "string";
      }).slice(0, MAX_TRACKS);
    } catch (_) { return []; }
  }
  function persistDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }
    catch (_) { notify("Browser storage is full. This draft may not persist after reload.", true); }
  }
  function notify(message, error) {
    status = message || "";
    statusError = !!error;
    const output = el("mixStatus");
    if (output) {
      output.textContent = status;
      output.classList.toggle("mix-error", statusError);
    }
  }
  function api(path, opts) {
    if (!spotify() || !spotify().isConnected()) {
      return Promise.reject(new Error("Connect your Spotify account through an artist profile first."));
    }
    return spotify().api(path, opts);
  }
  function albumName(a) { return String(a && a.name || "Untitled release"); }
  function duration(ms) {
    const seconds = Math.floor(Number(ms || 0) / 1000);
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  }
  function profileLabel(profile) { return profile.artistName || profile.name || "Artist"; }
  function updateCounts() {
    const count = el("mixCount");
    const toolbar = el("networkMixButton");
    const create = el("mixCreate");
    const clear = el("mixClear");
    if (count) count.textContent = draft.length + " / " + MAX_TRACKS + " tracks selected";
    if (toolbar) toolbar.textContent = "♫ Mix Builder" + (draft.length ? " · " + draft.length : "");
    if (create) create.disabled = loading || !draft.length || !spotify()?.isConnected() || !spotify()?.hasPlaylistScope();
    if (clear) clear.disabled = loading || !draft.length;
  }
  function renderConnection() {
    const box=el("mixConnection");
    if (!box) return;
    const connected=!!(spotify() && spotify().isConnected());
    const scoped=connected && spotify().hasPlaylistScope();
    box.innerHTML = scoped ?
      '<span class="mix-ok">Spotify connected · private playlist permission enabled</span>' :
      connected ?
      '<span>Spotify connected. Authorize the additional playlist permission to save mixes.</span>' +
      '<button type="button" id="mixReconnect">Authorize playlists</button>' :
      '<span>Connect Spotify Premium from an artist profile to browse releases and save a mix.</span>' +
      '<button type="button" id="mixConnect">Open artist profile</button>';
    const reconnect=el("mixReconnect");
    if (reconnect) reconnect.onclick=function () {
      if (loading) return;
      sessionStorage.setItem(RETURN_KEY,"1");
      spotify().reconnectForPlaylist(chosenProfile).catch(function (e) {
        sessionStorage.removeItem(RETURN_KEY);
        notify(e.message || "Spotify sign-in could not start.",true);
      });
    };
    const connect=el("mixConnect");
    if (connect) connect.onclick=function () {
      const profile=nodes.find(function(n){return n.id===chosenProfile;}) ||
        (artistProfiles()[0] && artistProfiles()[0].profile);
      close();
      if (profile) showProfile(profile);
    };
    updateCounts();
  }
  function renderArtists() {
    const select=el("mixArtist");
    if (!select) return;
    const list=artistProfiles();
    if (!list.some(function(x){return x.profile.id===chosenProfile;})) {
      chosenProfile=list[0] ? list[0].profile.id : "";
    }
    select.innerHTML=list.length?list.map(function(x){
      return '<option value="'+safe(x.profile.id)+'"'+
        (x.profile.id===chosenProfile?' selected':'')+'>'+
        safe(profileLabel(x.profile))+'</option>';
    }).join(""):'<option value="">No artist Spotify links saved yet</option>';
    select.disabled=loading || !list.length;
    if (list.length && el("mixArtistLink")) {
      const match=list.find(function(x){return x.profile.id===chosenProfile;});
      el("mixArtistLink").href=match ? match.spotify.url : "#";
      el("mixArtistLink").hidden=!match;
    }
  }
  function renderReleases() {
    const box=el("mixReleases");
    if(!box)return;
    box.innerHTML=releases.length?releases.map(function(a){
      const url=spotifyLink(a.id,"album");
      return '<div class="mix-release">'+
        '<div class="mix-release-label"><strong>'+safe(albumName(a))+'</strong>'+
        '<span>'+safe(a.album_type||"Release")+' · '+safe(a.release_date||"")+
        (a.total_tracks?' · '+a.total_tracks+' tracks':"")+'</span></div>'+
        '<div class="mix-row-actions">'+
          (url?'<a href="'+url+'" target="_blank" rel="noopener noreferrer" title="View on Spotify">Spotify ↗</a>':"")+
          '<button type="button" data-mix-album="'+safe(a.id)+'">Browse tracks</button>'+
        '</div></div>';
    }).join(""):'<p class="mix-muted">Choose a Spotify-linked artist to load their releases.</p>';
    const more=el("mixMoreReleases");
    if(more){more.hidden=!moreReleases;more.disabled=loading}
  }
  function trackRow(track, index) {
    const url=spotifyLink(track.id,"track");
    const picked=draft.some(function(item){return item.id===track.id;});
    const artist=(track.artists||[]).map(function(a){return a.name;}).join(", ")||
      profileLabel(nodes.find(function(n){return n.id===chosenProfile;})||{});
    return '<div class="mix-track">'+
      '<span class="mix-track-index">'+(index+1)+'</span>'+
      '<div class="mix-track-text"><strong>'+safe(track.name||"Untitled track")+'</strong>'+
      '<span>'+safe(artist)+' · '+duration(track.duration_ms)+'</span></div>'+
      (url?'<a href="'+url+'" target="_blank" rel="noopener noreferrer" title="Open track on Spotify">↗</a>':"")+
      '<button type="button" data-mix-add="'+safe(track.id)+'"'+
      (picked||draft.length>=MAX_TRACKS?' disabled':'')+'>'+
      (picked?'Added':'+ Add')+'</button></div>';
  }
  function renderTracks() {
    const box=el("mixTracks");
    if(!box)return;
    const title=el("mixReleaseTitle");
    if(title)title.textContent=selectedAlbum?'Tracks · '+albumName(selectedAlbum):'Tracks';
    const query=(el("mixTrackSearch")?.value||"").trim().toLowerCase();
    const filtered=albumTracks.filter(function(t){
      return !query||[t.name,...(t.artists||[]).map(function(a){return a.name;})]
        .join(" ").toLowerCase().includes(query);
    });
    box.innerHTML=filtered.length?filtered.map(trackRow).join(""):
      '<p class="mix-muted">'+(selectedAlbum?'No tracks match. Try another release or search.':'Choose a release on the left to browse its tracks.')+'</p>';
    const more=el("mixMoreTracks");
    if(more){more.hidden=!moreTracks;more.disabled=loading}
  }
  function renderDraft() {
    const box=el("mixDraft");
    if(!box)return;
    box.innerHTML=draft.length?draft.map(function(t,i){
      const url=spotifyLink(t.id,"track");
      return '<div class="mix-draft-track">'+
        '<span class="mix-draft-index">'+(i+1)+'</span>'+
        '<div class="mix-track-text"><strong>'+safe(t.name)+'</strong><span>'+
        safe(t.artist)+(t.album?' · '+safe(t.album):"")+'</span></div>'+
        (url?'<a href="'+url+'" target="_blank" rel="noopener noreferrer" aria-label="Open track on Spotify">↗</a>':"")+
        '<button type="button" data-mix-up="'+i+'"'+(!i?' disabled':'')+' aria-label="Move up">↑</button>'+
        '<button type="button" data-mix-down="'+i+'"'+(i===draft.length-1?' disabled':'')+' aria-label="Move down">↓</button>'+
        '<button type="button" data-mix-remove="'+i+'" aria-label="Remove track">×</button>'+
        '</div>';
    }).join(""):'<p class="mix-muted">Songs from different artists will appear here as you add them.</p>';
    updateCounts();
  }
  function renderResult() {
    const target=el("mixResult");
    if (!target) return;
    const parsed=successURL && /^https:\/\/open\.spotify\.com\/playlist\/[A-Za-z0-9]{22}$/.test(successURL);
    target.innerHTML=parsed?
      '<strong>Playlist created in Spotify.</strong> '+
      '<a href="'+successURL+'" target="_blank" rel="noopener noreferrer">Open playlist ↗</a>':
      "";
  }
  function setBusy(value) {
    loading=!!value;
    const buttons=document.querySelectorAll("#networkMixModal button");
    buttons.forEach(function(b){if(!b.dataset.mixClose)b.disabled=loading;});
    const artist=el("mixArtist");
    if(artist)artist.disabled=loading;
    updateCounts();
  }
  function normalizeTrack(t) {
    if(!t||!t.id||!(/^[A-Za-z0-9]{22}$/).test(t.id)||t.is_local)return null;
    return {
      id:t.id, uri:"spotify:track:"+t.id,
      name:String(t.name||"Untitled track"),
      artist:(t.artists||[]).map(function(a){return a.name||"";}).filter(Boolean).join(", ")||
        profileLabel(nodes.find(function(n){return n.id===chosenProfile;})||{}),
      album:albumName(selectedAlbum)
    };
  }
  async function loadReleases(reset) {
    if(loading)return;
    const list=artistProfiles();
    const item=list.find(function(x){return x.profile.id===chosenProfile;});
    if(!item){notify("This profile needs a Spotify artist link.",true);return;}
    if(!spotify()?.isConnected()){renderConnection();notify("Connect Spotify first to browse full catalogs.",true);return;}
    if(reset){
      releases=[];albumsPage=0;moreReleases=false;
      albumTracks=[];selectedAlbum=null;activeAlbum="";
      tracksPage=0;moreTracks=false;releaseArtistId=item.spotify.id;
      renderReleases();renderTracks();
    }
    const requestedId=item.spotify.id;
    const offset=albumsPage;
    setBusy(true);notify("Loading releases from Spotify…");
    try {
      const data=await api("/artists/"+requestedId+"/albums?include_groups=album,single,compilation&limit=20&offset="+offset);
      if(requestedId!==releaseArtistId)return;
      const incoming=(data && data.items || []).filter(function(a){
        return a && /^[A-Za-z0-9]{22}$/.test(a.id);
      });
      const seen=new Set(releases.map(function(x){return x.id;}));
      incoming.forEach(function(a){if(!seen.has(a.id)){releases.push(a);seen.add(a.id);}});
      albumsPage=offset+incoming.length;
      moreReleases=!!(data&&data.next);
      renderReleases();
      notify(releases.length?releases.length+" releases loaded. Choose one to browse songs.":"No releases found for this artist.");
    }catch(error){notify(error.message||"Could not load artist catalog.",true);}
    finally{setBusy(false);renderReleases();}
  }
  async function loadTracks(albumId,reset) {
    if(loading)return;
    const album=releases.find(function(a){return a.id===albumId;});
    if(!album){notify("Choose an available release.",true);return;}
    if(reset){
      selectedAlbum=album;activeAlbum=album.id;albumTracks=[];tracksPage=0;moreTracks=false;
      renderTracks();
    }
    const id=activeAlbum;
    const offset=tracksPage;
    setBusy(true);notify("Loading songs…");
    try {
      const data=await api("/albums/"+id+"/tracks?limit=50&offset="+offset);
      if(activeAlbum!==id)return;
      const incoming=(data && data.items || []).filter(function(t){
        return t && /^[A-Za-z0-9]{22}$/.test(t.id) && !t.is_local;
      });
      const seen=new Set(albumTracks.map(function(t){return t.id;}));
      incoming.forEach(function(t){if(!seen.has(t.id)){albumTracks.push(t);seen.add(t.id);}});
      tracksPage=offset+(data&&data.items||[]).length;
      moreTracks=!!(data&&data.next);
      renderTracks();
      notify(albumTracks.length+" tracks loaded. Add songs to your mix.");
    }catch(error){notify(error.message||"Could not load album tracks.",true);}
    finally{setBusy(false);renderTracks();}
  }
  async function savePlaylist() {
    if(loading)return;
    if(!draft.length){notify("Add at least one track to create a playlist.",true);return;}
    if(!spotify()?.isConnected()){renderConnection();notify("Connect Spotify first.",true);return;}
    if(!spotify().hasPlaylistScope()){renderConnection();notify("Authorize playlist permission before saving.",true);return;}
    const name=(el("mixName")?.value||"").trim();
    const description=(el("mixDescription")?.value||"").trim();
    if(!name){notify("Name your playlist first.",true);el("mixName")?.focus();return;}
    const confirmed=window.confirm("Create private Spotify playlist “"+name+"” with "+draft.length+
      " selected songs? Spotify will add it to your account.");
    if(!confirmed)return;
    const uris=draft.map(function(t){return t.uri;});
    setBusy(true);successURL="";renderResult();
    notify("Creating private playlist in your Spotify account…");
    let created=null;
    try {
      created=await api("/me/playlists",{method:"POST",body:{
        name:name.slice(0,100),public:false,description:description.slice(0,300)
      }});
      if(!created||!/^[A-Za-z0-9]{22}$/.test(created.id))throw Error("Spotify did not confirm playlist creation.");
      successURL=spotifyLink(created.id,"playlist");
      // Current Spotify API accepts at most 100 Spotify URIs per add request.
      for(let offset=0;offset<uris.length;offset+=100){
        notify("Adding songs "+(offset+1)+"–"+Math.min(offset+100,uris.length)+
          " of "+uris.length+"…");
        await api("/playlists/"+created.id+"/items",{
          method:"POST",body:{uris:uris.slice(offset,offset+100)}
        });
      }
      renderResult();
      notify("Saved "+uris.length+" songs to “"+name+"”. Open your new Spotify playlist.");
    }catch(error){
      renderResult();
      notify((created?"Spotify created a playlist, but not all songs may have been added. ":
        "Playlist was not created. ")+(error.message||"Please try again.")+
        (successURL?" Open the playlist using the link below before retrying.":""),true);
    }finally{setBusy(false);}
  }
  function open(profileId) {
    if(!el("networkMixModal"))boot();
    if(profileId && artistProfiles().some(function(x){return x.profile.id===profileId;})){
      const changed=chosenProfile!==profileId;
      chosenProfile=profileId;
      if(changed){releases=[];albumTracks=[];selectedAlbum=null;activeAlbum="";albumsPage=0;moreReleases=false;}
    }
    opened=true;
    const modal=el("networkMixModal");
    modal.hidden=false;
    renderArtists();renderConnection();renderReleases();renderTracks();renderDraft();renderResult();
    notify(status||"Choose an artist, explore releases, and collect songs across the network.");
    if(!releases.length&&spotify()?.isConnected()&&chosenProfile)loadReleases(true);
  }
  function close() {
    opened=false;
    const modal=el("networkMixModal");if(modal)modal.hidden=true;
  }
  function update() {
    if(!opened)return;
    renderArtists();renderConnection();renderDraft();renderResult();
  }
  function boot() {
    if(el("networkMixModal"))return;
    draft=readDraft();
    const toolbar=el("networkMixButton");
    if(toolbar)toolbar.onclick=function(){open();};
    const modal=document.createElement("div");
    modal.id="networkMixModal";
    modal.className="network-mix-backdrop";
    modal.hidden=true;
    modal.innerHTML=
      '<section class="network-mix-panel" role="dialog" aria-modal="true" aria-labelledby="mixTitle">'+
        '<header class="network-mix-head">'+
          '<div><strong id="mixTitle">Network HQ · Mix Builder</strong>'+
          '<p>Curate across the Spotify catalogs of artists already on your map.</p></div>'+
          '<button type="button" data-mix-close="true" id="mixClose" aria-label="Close playlist builder">×</button>'+
        '</header>'+
        '<div class="mix-connection" id="mixConnection"></div>'+
        '<div class="mix-two-columns">'+
          '<div class="mix-catalog">'+
            '<div class="mix-line"><label for="mixArtist">Browse artist</label>'+
              '<a id="mixArtistLink" target="_blank" rel="noopener noreferrer" href="#" hidden>Spotify ↗</a></div>'+
            '<select id="mixArtist" aria-label="Artist from your network"></select>'+
            '<div class="mix-section-head"><strong>Releases</strong>'+
              '<button type="button" id="mixRefresh">Refresh</button></div>'+
            '<div id="mixReleases" class="mix-release-list"></div>'+
            '<button type="button" id="mixMoreReleases" class="mix-more" hidden>Load more releases</button>'+
            '<div class="mix-section-head"><strong id="mixReleaseTitle">Tracks</strong></div>'+
            '<input id="mixTrackSearch" placeholder="Filter loaded songs…" aria-label="Filter loaded tracks">'+
            '<div id="mixTracks" class="mix-track-list"></div>'+
            '<button type="button" id="mixMoreTracks" class="mix-more" hidden>Load more tracks</button>'+
          '</div>'+
          '<div class="mix-selection">'+
            '<div class="mix-section-head"><strong>Your selection</strong><span id="mixCount"></span></div>'+
            '<div id="mixDraft" class="mix-draft"></div>'+
            '<button type="button" id="mixClear" class="mix-more">Clear selection</button>'+
            '<div class="mix-save">'+
              '<label for="mixName">Playlist name</label>'+
              '<input id="mixName" maxlength="100" placeholder="Network HQ · Across the Map">'+
              '<label for="mixDescription">Description (optional)</label>'+
              '<textarea id="mixDescription" maxlength="300" placeholder="A mix of artists connected through Network HQ…"></textarea>'+
              '<div class="mix-privacy">Private Spotify playlist · you choose each track</div>'+
              '<button type="button" id="mixCreate">Create playlist in Spotify</button>'+
              '<div id="mixResult" class="mix-result" aria-live="polite"></div>'+
            '</div>'+
          '</div>'+
        '</div>'+
        '<div class="mix-footer"><span id="mixStatus" aria-live="polite"></span>'+
        '<a href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer">Spotify ↗</a></div>'+
      '</section>';
    document.body.appendChild(modal);
    el("mixClose").onclick=close;
    modal.addEventListener("click",function(e){if(e.target===modal)close();});
    document.addEventListener("keydown",function(e){
      if(e.key==="Escape"&&opened){e.preventDefault();close();}
    });
    el("mixArtist").onchange=function(e){
      chosenProfile=e.target.value;
      loadReleases(true);renderArtists();
    };
    el("mixRefresh").onclick=function(){loadReleases(true);};
    el("mixMoreReleases").onclick=function(){loadReleases(false);};
    el("mixMoreTracks").onclick=function(){if(activeAlbum)loadTracks(activeAlbum,false);};
    el("mixTrackSearch").oninput=renderTracks;
    el("mixClear").onclick=function(){
      if(draft.length&&!window.confirm("Clear your locally saved mix selection?"))return;
      draft=[];persistDraft();renderDraft();renderTracks();
    };
    el("mixCreate").onclick=savePlaylist;
    modal.addEventListener("click",function(event){
      const btn=event.target.closest("button");
      if(!btn||btn.disabled||loading)return;
      const album=btn.dataset.mixAlbum;
      const track=btn.dataset.mixAdd;
      const up=btn.dataset.mixUp,down=btn.dataset.mixDown,remove=btn.dataset.mixRemove;
      if(album){loadTracks(album,true);return;}
      if(track){
        const item=albumTracks.find(function(t){return t.id===track;});
        const normalized=normalizeTrack(item);
        if(!normalized)return;
        if(draft.some(function(t){return t.id===normalized.id;})){
          notify("That exact recording is already in your mix.");return;
        }
        if(draft.length>=MAX_TRACKS){notify("This mix is at its 500-track limit.",true);return;}
        draft.push(normalized);persistDraft();renderDraft();renderTracks();
        notify("Added “"+normalized.name+"” to your mix.");
        return;
      }
      const index=up!==undefined?Number(up):down!==undefined?Number(down):
        remove!==undefined?Number(remove):-1;
      if(index<0||index>=draft.length)return;
      if(remove!==undefined)draft.splice(index,1);
      else {
        const target=index+(up!==undefined?-1:1);
        if(target<0||target>=draft.length)return;
        const t=draft[index];draft[index]=draft[target];draft[target]=t;
      }
      persistDraft();renderDraft();renderTracks();
    });
    renderArtists();renderDraft();renderConnection();
    updateCounts();
  }
  function onAuthReady() {
    if(sessionStorage.getItem(RETURN_KEY)==="1"){
      sessionStorage.removeItem(RETURN_KEY);
      open();
    }else update();
  }
  window.NetworkPlaylists={
    boot:boot,open:open,close:close,onAuthReady:onAuthReady,
    update:update
  };
})();
