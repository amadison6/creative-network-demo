/* Network HQ · shared music activity (v65).
 * Local audio, Spotify SDK / Spotify iFrame and SoundCloud widget provide
 * confirmed play/pause signals. Untitled does not expose documented events:
 * its record indicates the embedded player has been opened, until closed.
 */
(function(){
"use strict";
const sources=new Map();
let currentProfileId="",spotifyApi=null,spotifyLoading=false,scLoading=false;
const spotifyPending=new Map(),scPending=new Map();
const ids=people=>[...new Set((people||[]).filter(Boolean))];
function sync(){
 const active=new Set();
 for(const state of sources.values())if(state.playing)state.ids.forEach(id=>active.add(id));
 document.querySelectorAll(".node[data-id]").forEach(el=>{
  const on=active.has(el.dataset.id);
  el.classList.toggle("music-spinning",on);
  if(on)el.setAttribute("data-music-playing","true");
  else el.removeAttribute("data-music-playing");
 });
 return active;
}
function set(source,people,playing){
 if(!source)return;
 if(playing)sources.set(source,{ids:ids(people),playing:true});
 else sources.delete(source);
 sync();
}
function clear(source){if(source)sources.delete(source);sync()}
function enter(profileId){
 const id=String(profileId||"");
 if(id===currentProfileId)return;
 currentProfileId=id;
 for(const key of [...sources.keys()]){
  if(key.startsWith("spotify-embed:")||key.startsWith("soundcloud:")||key.startsWith("untitled:"))sources.delete(key);
 }
 sync();
}
function current(id){return[...sync()].includes(id)}
function loadSpotifyAPI(){
 if(spotifyApi||spotifyLoading)return;
 spotifyLoading=true;
 const previous=window.onSpotifyIframeApiReady;
 window.onSpotifyIframeApiReady=function(api){
  spotifyApi=api;
  spotifyLoading=false;
  if(typeof previous==="function")try{previous(api)}catch(error){console.warn("Existing Spotify iframe setup:",error)}
  for(const [id,entry]of spotifyPending){spotifyPending.delete(id);mountSpotify(entry)}
 };
 const script=document.createElement("script");
 script.src="https://open.spotify.com/embed/iframe-api/v1";
 script.async=true;
 script.onerror=()=>{spotifyLoading=false;spotifyPending.clear();console.warn("Spotify iFrame API unavailable. Standard Spotify embed remains available.")};
 document.head.appendChild(script);
}
function mountSpotify(entry){
 const{frame,profileId,spotify}=entry;
 if(!spotifyApi||!frame?.isConnected||currentProfileId!==profileId)return;
 if(!["artist","track","album","playlist","show","episode"].includes(spotify.kind))return;
 const mount=document.createElement("div");
 mount.className="spotify-embed-mount";
 try{
  spotifyApi.createController(mount,{
   uri:"spotify:"+spotify.kind+":"+spotify.id,
   width:"100%",height:352
  },controller=>{
   if(currentProfileId!==profileId||!mount.isConnected)return;
   const source="spotify-embed:"+profileId;
   controller.addListener("playback_started",()=>set(source,[profileId],true));
   controller.addListener("playback_update",event=>{
    const d=event?.data||{};
    set(source,[profileId],!d.isPaused&&!d.isBuffering);
   });
  });
  frame.replaceWith(mount);
 }catch(error){console.warn("Spotify iframe controller failed:",error);mount.replaceWith(frame)}
}
function bindSpotify(n,spotify){
 const frame=document.querySelector('#profile iframe.spotify-embed');
 if(!frame||!spotify)return;
 const entry={frame,profileId:n.id,spotify};
 if(spotifyApi)mountSpotify(entry);
 else{spotifyPending.set(n.id,entry);loadSpotifyAPI()}
}
function safeSoundCloud(raw){
 try{
  const u=new URL(String(raw||"").trim());
  if(u.protocol!=="https:"||!["soundcloud.com","www.soundcloud.com","on.soundcloud.com","m.soundcloud.com"].includes(u.hostname.toLowerCase()))return"";
  return u.href;
 }catch(_){return""}
}
function soundCloudCard(n){
 const url=safeSoundCloud(n.links?.SoundCloud);
 if(!url)return"";
 const playerUrl="https://w.soundcloud.com/player/?url="+encodeURIComponent(url)+"&auto_play=false&show_artwork=true";
 const esc=s=>String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
 return '<div class="section-title">SoundCloud · Listen</div>'+
 '<div class="integration-card"><iframe class="network-soundcloud-embed" title="SoundCloud player for '+esc(n.name)+'" src="'+esc(playerUrl)+'" loading="lazy" allow="autoplay" referrerpolicy="strict-origin-when-cross-origin"></iframe>'+
 '<div class="integration-actions"><a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Open on SoundCloud ↗</a></div></div>';
}
function mountSoundCloud(entry){
 const{frame,profileId}=entry;
 if(!frame?.isConnected||currentProfileId!==profileId||!window.SC?.Widget)return;
 try{
  const widget=window.SC.Widget(frame),events=window.SC.Widget.Events;
  const source="soundcloud:"+profileId;
  widget.bind(events.PLAY,()=>set(source,[profileId],true));
  widget.bind(events.PAUSE,()=>clear(source));
  widget.bind(events.FINISH,()=>clear(source));
  widget.bind(events.ERROR,()=>clear(source));
 }catch(e){console.warn("SoundCloud widget events unavailable:",e)}
}
function bindSoundCloud(n){
 const frame=document.querySelector("#profile iframe.network-soundcloud-embed");
 if(!frame)return;
 const entry={frame,profileId:n.id};
 if(window.SC?.Widget)mountSoundCloud(entry);
 else{
  scPending.set(n.id,entry);
  if(scLoading)return;
  scLoading=true;
  const script=document.createElement("script");
  script.src="https://w.soundcloud.com/player/api.js";script.async=true;
  script.onload=()=>{scLoading=false;for(const [id,x]of scPending){scPending.delete(id);mountSoundCloud(x)}};
  script.onerror=()=>{scLoading=false;scPending.clear()};
  document.head.appendChild(script);
 }
}
window.NetworkPlayback={set,clear,sync,enter,current,bindSpotify,bindSoundCloud,soundCloudCard,safeSoundCloud,
 _test:{sources,ids}};
})();