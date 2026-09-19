/* Network HQ Spotify Connect (v45)
 * Browser-only Authorization Code + PKCE; no client secret in this public site.
 * Tokens and PKCE verifier stay in sessionStorage, never the network profile DB.
 */
(function () {
  "use strict";
  const CLIENT_KEY = "creativeNetworkSpotifyClientId";
  const AUTH_KEY = "creativeNetworkSpotifySession";
  const PENDING_KEY = "creativeNetworkSpotifyPKCE";
  const RETURN_KEY = "creativeNetworkSpotifyReturnProfile";
  const SCOPES = "streaming user-modify-playback-state user-read-private";
  let player = null;
  let deviceId = "";
  let ready = false;
  let refreshInFlight = null;
  let sdkLoading = null;
  let currentSong = "";
  let paused = true;
  let message = "";
  let listenerAttached = false;

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function redirectURI() {
    return window.location.origin + window.location.pathname;
  }
  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(AUTH_KEY) || "null"); }
    catch (_) { return null; }
  }
  function clientId() {
    return (localStorage.getItem(CLIENT_KEY) || "").trim();
  }
  function authorized() {
    return !!(readSession() && clientId());
  }
  function setMessage(value) {
    message = String(value || "");
    refreshUI();
  }
  function errorMessage(error) {
    return error && error.message ? error.message : "Please try again.";
  }
  function saveSession(value) {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(value));
  }
  function clearSession() {
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(PENDING_KEY);
  }
  function base64url(bytes) {
    let value = "";
    for (const byte of bytes) value += String.fromCharCode(byte);
    return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  async function beginAuthorization(profileId) {
    const input = document.getElementById("spotifyDeveloperClient");
    const supplied = (input ? input.value : clientId()).trim();
    if (!/^[a-zA-Z0-9]{20,64}$/.test(supplied)) {
      setMessage("Enter your Spotify Developer Client ID (not your Client Secret).");
      if (input) input.focus();
      return;
    }
    if (!window.crypto || !crypto.subtle || !crypto.getRandomValues) {
      setMessage("Spotify sign-in requires a secure HTTPS page.");
      return;
    }
    localStorage.setItem(CLIENT_KEY, supplied);
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
    const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = base64url(new Uint8Array(digest));
    const redirect = redirectURI();
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({
      verifier: verifier, state: state, redirect: redirect, createdAt: Date.now()
    }));
    if (profileId) sessionStorage.setItem(RETURN_KEY, profileId);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: supplied,
      scope: SCOPES,
      redirect_uri: redirect,
      code_challenge_method: "S256",
      code_challenge: challenge,
      state: state
    });
    window.location.assign("https://accounts.spotify.com/authorize?" + params.toString());
  }
  async function tokenRequest(params) {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params)
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok || !data.access_token) {
      throw new Error("Spotify sign-in failed: " +
        (data.error_description || data.error || "HTTP " + response.status));
    }
    return data;
  }
  function acceptToken(data, previous) {
    saveSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token || (previous && previous.refresh_token) || "",
      expires_at: Date.now() + Math.max(1, Number(data.expires_in) || 3600) * 1000,
      client_id: clientId()
    });
  }
  async function accessToken(force) {
    const session = readSession();
    if (!session || !session.access_token || session.client_id !== clientId()) {
      throw new Error("Connect your Spotify account first.");
    }
    if (!force && session.expires_at > Date.now() + 60000) return session.access_token;
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async function () {
      if (!session.refresh_token) {
        clearSession();
        throw new Error("Spotify sign-in expired. Connect again.");
      }
      try {
        const fresh = await tokenRequest({
          grant_type: "refresh_token",
          refresh_token: session.refresh_token,
          client_id: clientId()
        });
        acceptToken(fresh, session);
        return fresh.access_token;
      } catch (error) {
        clearSession();
        throw error;
      }
    })();
    try { return await refreshInFlight; }
    finally { refreshInFlight = null; refreshUI(); }
  }
  async function spotifyAPI(path, options, retried) {
    const token = await accessToken(!!retried);
    const response = await fetch("https://api.spotify.com/v1" + path, {
      method: options && options.method || "GET",
      headers: Object.assign({
        Authorization: "Bearer " + token
      }, options && options.body ? { "Content-Type": "application/json" } : {}),
      body: options && options.body ? JSON.stringify(options.body) : undefined
    });
    if (response.status === 401 && !retried) return spotifyAPI(path, options, true);
    if (!response.ok) {
      let description = "";
      try {
        const data = await response.json();
        description = data.error && (data.error.message || data.error.reason) || "";
      } catch (_) {}
      if (response.status === 403) {
        throw new Error("Spotify declined playback (403). Check Premium, Developer app allowlist, and playback permissions." +
          (description ? " " + description : ""));
      }
      if (response.status === 429) throw new Error("Spotify rate/quota limit reached. Try again later.");
      throw new Error("Spotify playback error (" + response.status + "). " + description);
    }
    if (response.status === 204) return null;
    try { return await response.json(); } catch (_) { return null; }
  }
  function cleanCallbackURL() {
    const url = new URL(window.location.href);
    ["code", "state", "error", "error_description"].forEach(function (key) {
      url.searchParams.delete(key);
    });
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  async function finishAuthorizationCallback() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("code") && !params.has("error")) return false;
    const code = params.get("code");
    const state = params.get("state");
    const failure = params.get("error");
    cleanCallbackURL();
    if (failure) {
      sessionStorage.removeItem(PENDING_KEY);
      setMessage("Spotify authorization was not completed: " + failure);
      return true;
    }
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null"); }
    catch (_) {}
    sessionStorage.removeItem(PENDING_KEY);
    if (!pending || !pending.verifier || !state || state !== pending.state ||
        pending.redirect !== redirectURI() ||
        Date.now() - pending.createdAt > 10 * 60 * 1000) {
      setMessage("Spotify sign-in could not be verified. Connect again.");
      return true;
    }
    try {
      const data = await tokenRequest({
        client_id: clientId(),
        grant_type: "authorization_code",
        code: code,
        redirect_uri: pending.redirect,
        code_verifier: pending.verifier
      });
      acceptToken(data);
      const profileId = sessionStorage.getItem(RETURN_KEY);
      sessionStorage.removeItem(RETURN_KEY);
      if (profileId && typeof nodes !== "undefined" && typeof showProfile === "function") {
        const profile = nodes.find(function (n) { return n.id === profileId; });
        if (profile) showProfile(profile);
      }
      setMessage("Spotify account connected. Preparing full-song playback…");
      await checkAccountAndLoadSDK();
    } catch (error) {
      setMessage(errorMessage(error));
    }
    return true;
  }
  function playbackStatus() {
    if (!authorized()) return "Not connected";
    if (ready && deviceId) return currentSong || "Browser player ready";
    return message || "Preparing Spotify player…";
  }
  function refreshUI() {
    const live = document.getElementById("spotifyLiveStatus");
    const full = document.getElementById("spotifyFullPlay");
    const connect = document.getElementById("spotifyConnectBtn");
    const disconnect = document.getElementById("spotifyDisconnectBtn");
    const state = document.getElementById("spotifyAccountStatus");
    const input = document.getElementById("spotifyDeveloperClient");
    const card = document.getElementById("spotifyPremiumPanel");
    if (live) live.textContent = message || playbackStatus();
    if (connect) connect.hidden = authorized();
    if (disconnect) disconnect.hidden = !authorized();
    if (state) state.textContent = authorized() ?
      "Signed in · " + (ready ? "Browser player ready" : "Connecting to playback device") :
      "Spotify Premium and a Spotify Developer app are required.";
    if (input) input.disabled = authorized();
    if (full) {
      full.disabled = !authorized() || !ready;
      full.textContent = !authorized() ? "Connect to play full songs" :
        (ready ? "Play full songs here" : "Preparing player…");
    }
    if (card) card.dataset.spotifyReady = ready ? "true" : "false";
    const dock = document.getElementById("networkSpotifyDock");
    const song = document.getElementById("networkSpotifySong");
    const toggle = document.getElementById("networkSpotifyToggle");
    if (dock) dock.hidden = !authorized();
    if (song) song.textContent = playbackStatus();
    if (toggle) {
      toggle.disabled = !ready;
      toggle.textContent = paused ? "▶" : "Ⅱ";
      toggle.title = paused ? "Play or resume" : "Pause";
    }
    for (const id of ["networkSpotifyPrev", "networkSpotifyNext"]) {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = !ready;
    }
  }
  function renderCard(n, spotify) {
    const supported = spotify && ["artist", "album", "track", "playlist"].includes(spotify.kind);
    const text = !spotify ? "Save a Spotify link above to choose what to play." :
      !supported ? "Full playback supports artist, album, track and playlist links." :
      "Play " + spotify.kind + " through your Spotify Premium account in this browser.";
    return '<div class="spotify-full-card" id="spotifyPremiumPanel">' +
      '<div class="integration-heading"><strong>Spotify Connect · full songs</strong>' +
      '<span class="integration-status">Premium</span></div>' +
      '<p class="integration-help">' + escapeHTML(text) + '</p>' +
      '<div class="integration-input">' +
      '<input id="spotifyDeveloperClient" autocomplete="off" spellcheck="false" ' +
      'aria-label="Spotify Developer Client ID" placeholder="Paste Spotify Developer Client ID (not secret)" ' +
      'value="' + escapeHTML(clientId()) + '">' +
      '<button id="spotifyConnectBtn" type="button">Connect Spotify</button>' +
      '<button id="spotifyDisconnectBtn" type="button" hidden>Disconnect</button></div>' +
      '<div class="integration-output" id="spotifyAccountStatus">Checking Spotify…</div>' +
      '<div class="integration-actions">' +
      '<button id="spotifyFullPlay" type="button"' + (!supported ? " disabled" : "") +
      '>Play full songs here</button></div>' +
      '<div id="spotifyLiveStatus" class="integration-output" aria-live="polite"></div>' +
      '<p class="integration-help">One-time setup: create a Spotify Developer app, enable Web API and Web Playback SDK, and register this exact redirect URI: ' +
      '<code id="spotifyRedirectURI">' + escapeHTML(redirectURI()) + '</code> ' +
      '<button id="spotifyCopyRedirect" type="button">Copy URI</button>. ' +
      '<a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Developer dashboard ↗</a>. ' +
      'Only use the public Client ID; never paste a Client Secret. The map stores your ID locally and Spotify login tokens only for this browser tab.</p>' +
      '</div>';
  }
  function disconnect() {
    clearSession();
    if (player) {
      try { player.disconnect(); } catch (_) {}
    }
    player = null;
    ready = false;
    deviceId = "";
    currentSong = "";
    paused = true;
    setMessage("Disconnected Spotify account. Your artist links remain saved.");
  }
  function bindCard(n, spotify) {
    const connect = document.getElementById("spotifyConnectBtn");
    const disconnectBtn = document.getElementById("spotifyDisconnectBtn");
    const play = document.getElementById("spotifyFullPlay");
    const copy = document.getElementById("spotifyCopyRedirect");
    if (connect) connect.onclick = function () {
      beginAuthorization(n.id).catch(function (error) { setMessage(errorMessage(error)); });
    };
    if (disconnectBtn) disconnectBtn.onclick = disconnect;
    if (copy) copy.onclick = function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(redirectURI()).then(function () {
          setMessage("Copied the redirect URI.");
        }).catch(function () { setMessage("Select the URI above to copy it."); });
      } else setMessage("Select the redirect URI above and copy it.");
    };
    if (play) {
      play.disabled = !spotify || !["artist", "album", "track", "playlist"].includes(spotify.kind) ||
        !authorized() || !ready;
      play.onclick = function () {
        playContext(spotify).catch(function (error) { setMessage(errorMessage(error)); });
      };
    }
    refreshUI();
    // Unsupported Spotify content must remain disabled after status refresh.
    if (play && (!spotify || !["artist", "album", "track", "playlist"].includes(spotify.kind))) {
      play.disabled = true;
    }
  }
  async function checkAccountAndLoadSDK() {
    if (!authorized()) return;
    try {
      const account = await spotifyAPI("/me");
      if (account && account.product && account.product !== "premium") {
        setMessage("Full-song playback requires Spotify Premium on your connected account.");
        return;
      }
    } catch (error) {
      setMessage(errorMessage(error));
      return;
    }
    try { await initSDK(); }
    catch (error) { setMessage(errorMessage(error)); }
  }
  function initSDK() {
    if (ready) return Promise.resolve();
    if (sdkLoading) return sdkLoading;
    sdkLoading = new Promise(function (resolve, reject) {
      const timeout = setTimeout(function () {
        reject(new Error("Spotify player could not start. Try refreshing and allow protected media in your browser."));
      }, 18000);
      async function start() {
        if (!window.Spotify || !window.Spotify.Player) return;
        try {
          const token = await accessToken();
          if (!token) throw new Error("Reconnect Spotify.");
          if (player) {
            try { player.disconnect(); } catch (_) {}
            player = null;
          }
          player = new window.Spotify.Player({
            name: "Network HQ",
            getOAuthToken: function (callback) {
              accessToken().then(callback).catch(function (error) {
                setMessage(errorMessage(error));
                callback("");
              });
            },
            volume: 0.6
          });
          player.addListener("ready", function (event) {
            deviceId = event.device_id;
            ready = true;
            clearTimeout(timeout);
            setMessage("Browser player ready. Click Play full songs here.");
            resolve();
          });
          player.addListener("not_ready", function () {
            ready = false;
            deviceId = "";
            setMessage("Spotify playback device disconnected. Refresh to reconnect.");
          });
          for (const name of ["initialization_error", "authentication_error", "account_error"]) {
            player.addListener(name, function (event) {
              ready = false;
              const error = name === "account_error" ?
                "Spotify Premium is required for full-song playback." :
                "Spotify player: " + (event.message || name);
              clearTimeout(timeout);
              setMessage(error);
              reject(new Error(error));
            });
          }
          player.addListener("autoplay_failed", function () {
            setMessage("Browser blocked audio. Click Play full songs here again.");
          });
          player.addListener("player_state_changed", function (state) {
            if (!state) return;
            paused = !!state.paused;
            const track = state.track_window && state.track_window.current_track;
            if (track) currentSong = track.name + " · " +
              (track.artists || []).map(function (artist) { return artist.name; }).join(", ");
            refreshUI();
          });
          const connected = await player.connect();
          if (!connected) {
            clearTimeout(timeout);
            throw new Error("Spotify browser player did not connect. Check Premium and browser audio settings.");
          }
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      }
      if (window.Spotify && window.Spotify.Player) {
        start();
      } else {
        window.onSpotifyWebPlaybackSDKReady = start;
        let script = document.getElementById("networkSpotifySDK");
        if (!script) {
          script = document.createElement("script");
          script.id = "networkSpotifySDK";
          script.src = "https://sdk.scdn.co/spotify-player.js";
          script.async = true;
          script.onerror = function () {
            clearTimeout(timeout);
            reject(new Error("Could not load Spotify Web Playback SDK."));
          };
          document.head.appendChild(script);
        }
      }
    }).catch(function (error) {
      sdkLoading = null;
      throw error;
    });
    return sdkLoading;
  }
  async function playContext(spotify) {
    if (!spotify || !["artist", "album", "track", "playlist"].includes(spotify.kind)) {
      throw new Error("Choose an artist, album, track or playlist link.");
    }
    if (!ready || !deviceId || !player) {
      throw new Error("Spotify browser player is still connecting. Try again shortly.");
    }
    // Browser SDK requires a user gesture to activate audio on some browsers.
    if (typeof player.activateElement === "function") {
      try { player.activateElement(); } catch (_) {}
    }
    setMessage("Handing playback to your Network HQ browser player…");
    await spotifyAPI("/me/player", {
      method: "PUT", body: { device_ids: [deviceId], play: false }
    });
    const body = spotify.kind === "track" ?
      { uris: ["spotify:track:" + spotify.id] } :
      { context_uri: "spotify:" + spotify.kind + ":" + spotify.id };
    await spotifyAPI("/me/player/play?device_id=" + encodeURIComponent(deviceId), {
      method: "PUT", body: body
    });
    setMessage("Spotify received the playback command.");
  }
  function mountDock() {
    if (document.getElementById("networkSpotifyDock")) return;
    const dock = document.createElement("div");
    dock.id = "networkSpotifyDock";
    dock.className = "network-spotify-dock";
    dock.hidden = true;
    dock.innerHTML =
      '<div class="network-spotify-title">Spotify · Network HQ</div>' +
      '<div class="network-spotify-song" id="networkSpotifySong">Connecting…</div>' +
      '<div class="network-spotify-controls">' +
      '<button id="networkSpotifyPrev" type="button" aria-label="Previous track">◀◀</button>' +
      '<button id="networkSpotifyToggle" type="button" aria-label="Pause or play">▶</button>' +
      '<button id="networkSpotifyNext" type="button" aria-label="Next track">▶▶</button>' +
      '</div>';
    document.body.appendChild(dock);
    function control(id, fn) {
      document.getElementById(id).onclick = function () {
        if (!player || !ready) return;
        fn().catch(function (error) { setMessage(errorMessage(error)); });
      };
    }
    control("networkSpotifyPrev", function () { return player.previousTrack(); });
    control("networkSpotifyToggle", function () {
      if (typeof player.activateElement === "function") {
        try { player.activateElement(); } catch (_) {}
      }
      return player.togglePlay();
    });
    control("networkSpotifyNext", function () { return player.nextTrack(); });
  }
  async function boot() {
    mountDock();
    refreshUI();
    const wasCallback = await finishAuthorizationCallback();
    if (!wasCallback && authorized()) checkAccountAndLoadSDK();
    refreshUI();
  }
  window.NetworkSpotify = {
    renderCard: renderCard,
    bindCard: bindCard,
    boot: boot,
    disconnect: disconnect
  };
})();
