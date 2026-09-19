/* Network HQ v65 — one playback signal for every profile music source. */
(function(){
"use strict";
const playing=new Map();
let iframeAPI=null,spotifyIframe=null,spotifyController=null,spotifyProfile="",spotifyLoading=false;
let scLoading=false,scReady=false,scFrame=null,scWidget=null,scProfile="";
function ids(list){return [...new Set((Array.isArray(list)?list:[list]).filter(x=>typeof x==="string"&&x.length))]}
function refresh(){
 const active=new Set();
 playing.forEach(state=>{if(state.on)state.people.forEach(id=>active.add(id))});
 document.querySelectorAll(".node[data-id]").forEach(node=>{
   node.classList.toggle("music-spinning",active.has(node.dataset.id));
 });
}
function set(source,people,on){
 if(typeof source!=="string"||!source)return;
 const group=ids(people);
 if(on&&group.length)playing.set(source,{people:group,on:true});
 else playing.delete(source);
 refresh();
}
function clear(source){set(source,[],false)}
function isPlaying(id){return [...playing.values()].some(s=>s.on&&s.people.includes(id))}
function disposeSpotifyEmbed(){
 if(spotifyController){try{spotifyController.destroy()}catch(_){}}
 spotifyController=null;spotifyIframe=null;spotifyProfile="";
 clear("spotify-embed");
}
function spotifyReady(api){
 iframeAPI=api;loadSpotifyIframe();
}
function loadSpotifyIframe(){
 if(!iframeAPI||!spotifyIframe||!spotifyIframe.isConnected)return;
 const iframe=spotifyIframe,person=spotifyProfile;
 const url=iframe.getAttribute("src")||"";
 const m=/^https:\/\/open\.spotify\.com\/embed\/(artist|album|track|playlist|show|episode)\/([a-zA-Z0-9]{22})/.exec(url);
 if(!m)return;
 const wrapper=document.createElement("div");
 wrapper.className="spotify-embed spotify-controlled-embed";
 iframe.replaceWith(wrapper);
 iframeAPI.createController(wrapper,{uri:"spotify:"+m[1]+":"+m[2],width:"100%",height:352},
   controller=>{
    if(!wrapper.isConnected||person!==spotifyProfile){
      try{controller.destroy()}catch(_){}
      return;
    }
    spotifyController=controller;
    controller.addListener("playback_started",()=>set("spotify-embed",[person],true));
    controller.addListener("playback_update",event=>{
      const data=event?.data||{};
      if(typeof data.isPaused==="boolean")set("spotify-embed",[person],!data.isPaused&&!data.isBuffering);
    });
   }
 );
}
function attachSpotifyEmbed(iframe,profileId){
 if(!iframe||!profileId)return;
 if(spotifyIframe===iframe)return;
 disposeSpotifyEmbed();spotifyIframe=iframe;spotifyProfile=profileId;
 if(iframeAPI){loadSpotifyIframe();return}
 if(spotifyLoading)return;
 spotifyLoading=true;
 const previous=window.onSpotifyIframeApiReady;
 window.onSpotifyIframeApiReady=api=>{
  if(typeof previous==="function")previous(api);
  spotifyReady(api);
 };
 const script=document.createElement("script");
 script.src="https://open.spotify.com/embed/iframe-api/v1";
 script.async=true;script.onerror=()=>{spotifyLoading=false};
 document.head.appendChild(script);
}
function detachSoundCloud(){
 if(scWidget&&window.SC?.Widget?.Events){
  for(const type of ["PLAY","PAUSE","FINISH"]){
   try{scWidget.unbind(window.SC.Widget.Events[type])}catch(_){}
  }
 }
 scWidget=null;scFrame=null;scProfile="";clear("soundcloud");
}
function bindSoundCloud(){
 if(!scReady||!scFrame||!scFrame.isConnected||!window.SC?.Widget)return;
 const frame=scFrame,person=scProfile;
 scWidget=window.SC.Widget(frame);
 const events=window.SC.Widget.Events;
 scWidget.bind(events.PLAY,()=>{if(scFrame===frame)set("soundcloud",[person],true)});
 scWidget.bind(events.PAUSE,()=>{if(scFrame===frame)clear("soundcloud")});
 scWidget.bind(events.FINISH,()=>{if(scFrame===frame)clear("soundcloud")});
}
function attachSoundCloud(iframe,profileId){
 if(!iframe||!profileId)return;
 if(scFrame===iframe)return;
 detachSoundCloud();scFrame=iframe;scProfile=profileId;
 if(scReady){bindSoundCloud();return}
 if(scLoading)return;
 scLoading=true;
 const script=document.createElement("script");
 script.src="https://w.soundcloud.com/player/api.js";script.async=true;
 script.onload=()=>{scReady=!!window.SC?.Widget;scLoading=false;bindSoundCloud()};
 script.onerror=()=>{scLoading=false};
 document.head.appendChild(script);
}
window.NetworkPlayback={set,clear,refresh,isPlaying,attachSpotifyEmbed,attachSoundCloud,disposeSpotifyEmbed,detachSoundCloud,_test:{playing,spotifyReady}};
})();