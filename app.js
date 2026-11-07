(() => {
  const STORAGE_KEY = "hypergamy.local.v1";
  const app = document.getElementById("app");
  const icons = {
    home: '<svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V20h-6v-6h-4v6H4z"/></svg>',
    message: '<svg viewBox="0 0 24 24"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-5.5A7.5 7.5 0 1 1 20 11.5Z"/></svg>',
    games: '<svg viewBox="0 0 24 24"><path d="M7 5h10a4 4 0 0 1 3.8 2.8l1.1 3.5a4 4 0 0 1-6.2 4.4l-2.1-1.4h-3.2l-2.1 1.4a4 4 0 0 1-6.2-4.4l1.1-3.5A4 4 0 0 1 7 5Z"/><path d="M7 8v5M4.5 10.5h5M16 9h.01M18.5 12h.01"/></svg>',
    person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.5-4 3-6 7-6s6.5 2 7 6"/></svg>',
    add: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="m9.7 3.8.5-1h3.6l.5 1a2 2 0 0 0 2.8 1l1-.5 2.5 2.5-.5 1a2 2 0 0 0 1 2.8l1 .5v3.6l-1 .5a2 2 0 0 0-1 2.8l.5 1-2.5 2.5-1-.5a2 2 0 0 0-2.8 1l-.5 1h-3.6l-.5-1a2 2 0 0 0-2.8-1l-1 .5-2.5-2.5.5-1a2 2 0 0 0-1-2.8l-1-.5v-3.6l1-.5a2 2 0 0 0 1-2.8l-.5-1 2.5-2.5 1 .5a2 2 0 0 0 2.8-1Z"/><circle cx="12" cy="12" r="3"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M6.6 3.5 9.5 3l2 4.7-2 1.8a15 15 0 0 0 5 5l1.8-2 4.7 2-.5 2.9a3 3 0 0 1-3.2 2.5A17.5 17.5 0 0 1 4.1 6.7a3 3 0 0 1 2.5-3.2Z"/></svg>',
    video: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="m3 11 18-8-7 18-3.5-7.5L3 11Z"/><path d="M10.5 13.5 15 9"/></svg>',
    smile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.3 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/></svg>',
    micOff: '<svg viewBox="0 0 24 24"><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9V5a3 3 0 0 0-5.8-1M5 10a7 7 0 0 0 12 5M19 10a7 7 0 0 1-.2 1.6M12 17v5m-4 0h8M3 3l18 18"/></svg>',
    more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  };

  function loadStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        users: {},
        session: null,
        settings: parsed.settings || { theme: "dark", compact: false },
      };
    } catch (error) {
      console.error("Could not read Hypercall local data.", error);
      return { users: {}, session: null, settings: { theme: "dark", compact: false } };
    }
  }

  let store = loadStore();
  let activeTab = "messages";
  let authMode = "create";
  let selectedUser = null;
  let selectedGroup = null;
  let modal = "";
  let requestedCallMedia = "audio";
  let search = "";
  let toastTimer;
  let realtimeSocket = null;
  let refreshTimer = null;
  let statePollTimer = null;
  let activeCall = null;
  let cosmetics = { owned: [], theme: null, effect: null };
  let gameState = null;
  let gameLoading = false;
  let gameActionLoading = false;
  let gameError = "";
  let gameResult = "";
  let coinFlipAnimation = null;
  let gameLossEffect = "";
  let gameLossTimer = null;
  let shopOpen = false;
  let selectedGame = null;
  let crashPollTimer = null;
  let crashDisplayTimer = null;
  const typingUsers = new Map();
  const typingExpiryTimers = new Map();
  let ringtoneContext = null;
  let ringtoneTimer = null;
  const ringtoneOscillators = new Set();
  window.addEventListener("pointerdown", () => {
    if (!("AudioContext" in window) || ringtoneContext) return;
    ringtoneContext = new AudioContext();
    ringtoneContext.resume().catch((error) => console.warn("Could not enable incoming-call audio:", error));
  }, { once: true });

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings: store.settings }));
      return true;
    } catch (error) {
      console.error("Could not save Hypercall local data.", error);
      notify("Could not save changes in this browser.");
      return false;
    }
  }

  function currentUser() {
    return store.session ? store.users[store.session] || null : null;
  }

  function normalize(value) {
    return value.trim().toLocaleLowerCase();
  }

  async function apiRequest(path, options = {}) {
    const headers = { ...options.headers };
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    const response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return result;
  }

  function applyRemoteState(state) {
    const user = { ...state.user, messages: {} };
    if (store.session !== user.username) resetGameState();
    const people = {};
    for (const person of state.people || []) {
      people[person.username] = {
        username: person.username,
        displayName: person.displayName || person.username,
        hasAvatar: Boolean(person.hasAvatar),
        friends: [],
        incoming: [],
        outgoing: [],
        messages: {},
      };
    }
    people[user.username] = user;
    for (const message of state.messages || []) {
      const threadId = conversationId(message.from, message.to);
      if (!user.messages[threadId]) user.messages[threadId] = [];
      user.messages[threadId].push({
        from: message.from,
        text: message.text,
        time: Number(message.time),
      });
    }
    store.groups = Object.fromEntries((state.groups || []).map((group) => [group.id, { ...group, messages: [] }]));
    for (const message of state.groupMessages || []) {
      store.groups[message.groupId]?.messages.push(message);
    }
    cosmetics = state.cosmetics || { owned: [], theme: null, effect: null };
    store.users = people;
    store.session = user.username;
    return user;
  }

  async function syncRemoteState() {
    if (!store.session) return false;
    try {
      applyRemoteState(await apiRequest("/api/session"));
      render();
      return true;
    } catch (error) {
      if (error.status === 401) {
        closeRealtime();
        resetGameState();
        store.users = {};
        store.session = null;
        renderAuth();
        notify("Your session ended. Sign in again.");
      } else {
        console.error("Could not sync Hypercall state:", error);
        notify("Could not sync with Hypercall. Your saved chats remain on the host PC.");
      }
      return false;
    }
  }

  function sendRealtime(message) {
    if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) return false;
    realtimeSocket.send(JSON.stringify(message));
    return true;
  }

  function connectRealtime() {
    closeRealtime();
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    realtimeSocket = new WebSocket(`${protocol}//${location.host}/realtime`);
    realtimeSocket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        console.error("Received invalid Hypercall real-time data.");
        return;
      }
      if (message.type === "state:refresh" || message.type === "chat:refresh") {
        syncRemoteState();
      } else if (message.type === "chat:typing") {
        updateTypingUser(message);
      } else if (message.type === "games:refresh") {
        loadGameState();
      } else {
        handleCallSignal(message);
      }
    });
    realtimeSocket.addEventListener("close", () => {
      if (store.session) {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(connectRealtime, 2500);
      }
    });
    realtimeSocket.addEventListener("error", () => console.warn("Hypercall real-time connection interrupted."));
    statePollTimer = setInterval(() => {
      if (realtimeSocket?.readyState !== WebSocket.OPEN) syncRemoteState();
    }, 5000);
  }

  function closeRealtime() {
    clearTimeout(refreshTimer);
    clearInterval(statePollTimer);
    statePollTimer = null;
    if (realtimeSocket) {
      realtimeSocket.onclose = null;
      realtimeSocket.close();
      realtimeSocket = null;
    }
  }

  function typingContext() {
    if (selectedGroup) return `group:${selectedGroup}`;
    if (selectedUser) return `dm:${selectedUser}`;
    return null;
  }

  function sendTypingStatus(context, isTyping) {
    if (!context) return;
    if (context.startsWith("group:")) {
      sendRealtime({ type: "chat:typing", groupId: context.slice(6), isTyping });
    } else if (context.startsWith("dm:")) {
      sendRealtime({ type: "chat:typing", to: context.slice(3), isTyping });
    }
  }

  function bindTypingInput(input, context) {
    let active = false;
    let lastSentAt = 0;
    const stop = () => {
      if (!active) return;
      sendTypingStatus(context, false);
      active = false;
    };
    input.addEventListener("input", () => {
      if (!input.value.trim()) {
        stop();
        return;
      }
      if (!active || Date.now() - lastSentAt >= 1200) {
        sendTypingStatus(context, true);
        active = true;
        lastSentAt = Date.now();
      }
    });
    input.addEventListener("blur", stop);
    return stop;
  }

  function updateTypingUser(message) {
    const context = message.groupId ? `group:${message.groupId}` : `dm:${message.to}`;
    if (!message.from || message.from === currentUser()?.username || context === "dm:undefined") return;
    if (!typingUsers.has(context)) typingUsers.set(context, new Set());
    const users = typingUsers.get(context);
    users.delete(message.from);
    const timerKey = `${context}:${message.from}`;
    clearTimeout(typingExpiryTimers.get(timerKey));
    if (message.isTyping) {
      users.add(message.from);
      typingExpiryTimers.set(timerKey, setTimeout(() => {
        users.delete(message.from);
        typingExpiryTimers.delete(timerKey);
        if (!users.size) typingUsers.delete(context);
        updateTypingIndicator();
      }, 4500));
    } else if (!users.size) {
      typingUsers.delete(context);
    }
    updateTypingIndicator();
  }

  function updateTypingIndicator() {
    const indicator = document.getElementById("typing-indicator");
    const users = [...(typingUsers.get(typingContext()) || [])];
    if (!indicator) return;
    if (!users.length) {
      indicator.textContent = "";
      indicator.classList.remove("visible");
      return;
    }
    const names = users.map((name) => `@${name}`);
    const message = names.length === 1 ? `${names[0]} is typing` :
      names.length === 2 ? `${names[0]} and ${names[1]} are typing` :
        `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]} are typing`;
    indicator.textContent = message;
    indicator.classList.add("visible");
  }

  function startRingtone() {
    stopRingtone();
    if (!("AudioContext" in window) || !activeCall?.incoming) return;
    ringtoneContext ||= new AudioContext();
    const context = ringtoneContext;
    context.resume().then(() => {
      if (!activeCall?.incoming || ringtoneContext !== context) return;
      const playTone = (frequency, startAt, duration) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.025);
        gain.gain.setValueAtTime(0.12, startAt + duration - 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        ringtoneOscillators.add(oscillator);
        oscillator.addEventListener("ended", () => {
          oscillator.disconnect();
          gain.disconnect();
          ringtoneOscillators.delete(oscillator);
        }, { once: true });
        oscillator.start(startAt);
        oscillator.stop(startAt + duration);
      };
      const ring = () => {
        if (!activeCall?.incoming || ringtoneContext !== context) return;
        const now = context.currentTime;
        playTone(740, now, 0.24);
        playTone(587, now + 0.28, 0.32);
      };
      ring();
      ringtoneTimer = setInterval(ring, 1400);
    }).catch((error) => {
      console.warn("Could not play the incoming-call sound:", error);
      stopRingtone();
    });
  }

  function stopRingtone() {
    clearInterval(ringtoneTimer);
    ringtoneTimer = null;
    for (const oscillator of ringtoneOscillators) {
      try { oscillator.stop(); } catch {}
    }
    ringtoneOscillators.clear();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function initials(value) {
    return (value || "?").trim().slice(0, 2).toUpperCase();
  }

  function displayName(username) {
    return store.users?.[username]?.displayName || username;
  }

  function avatar(name, color = "purple", size = "") {
    const hasPhoto = Boolean(store.users?.[name]?.hasAvatar);
    const photo = hasPhoto ? `<img class="avatar-photo" src="/api/avatar/${encodeURIComponent(name)}" alt="">` : "";
    return `<span class="avatar ${color} ${size} ${hasPhoto ? "has-photo" : ""}" aria-hidden="true">${photo}<span class="avatar-initials">${escapeHtml(initials(displayName(name)))}</span><i></i></span>`;
  }

  function allUsers() {
    return Object.values(store.users);
  }

  function contacts() {
    const user = currentUser();
    return user ? (user.friends || []).map((name) => store.users[name]).filter(Boolean) : [];
  }

  function conversationId(first, second) {
    return [first, second].sort().join("::");
  }

  function messagesWith(other) {
    const user = currentUser();
    if (!user || !other) return [];
    return user.messages[conversationId(user.username, other.username)] || [];
  }

  function groupMessagesWith(group) {
    return group?.messages || [];
  }

  function icon(name, extra = "") {
    return `<span class="icon ${extra}">${icons[name]}</span>`;
  }

  function notify(message) {
    let node = document.querySelector("body > .toast");
    if (!node) {
      node = document.createElement("div");
      node.className = "toast";
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 2800);
  }

  function openModal(type, mediaType = "audio") {
    modal = type;
    requestedCallMedia = mediaType;
    render();
    const input = document.querySelector(".modal input");
    if (input) input.focus();
  }

  function closeModal() {
    if (modal === "call" && activeCall) {
      finishCall(true);
      return;
    }
    modal = "";
    render();
  }

  function callMessage(to, type, extra = {}) {
    if (!activeCall) return false;
    const sent = sendRealtime({ type, to, callId: activeCall.id, ...extra });
    if (!sent) notify("The real-time connection is offline. Try again in a moment.");
    return sent;
  }

  function setCallStatus(message) {
    if (!activeCall) return;
    activeCall.status = message;
    const status = document.getElementById("call-status");
    if (status) status.textContent = message;
  }

  function updateCallParticipantStatus() {
    if (!activeCall) return;
    for (const username of activeCall.members) {
      const peer = activeCall.peers.get(username);
      const hasVideo = activeCall.remoteStreams.get(username)?.getVideoTracks()
        .some((track) => track.readyState === "live" && track.enabled);
      const status = username === currentUser()?.username
        ? "You"
        : peer?.connectionState === "connected" ? hasVideo ? "Video connected" : "Voice connected"
          : activeCall.incoming ? "Calling you" : "Connecting…";
      document.getElementById(`call-tile-${username}`)?.querySelector(".call-member-label small")?.replaceChildren(status);
      document.getElementById(`call-member-row-${username}`)?.querySelector("small")?.replaceChildren(username === currentUser()?.username ? "You" : peer?.connectionState === "connected" ? "In voice" : "Connecting");
    }
  }

  function attachCallMedia() {
    if (!activeCall) return;
    const me = currentUser()?.username;
    const selfVideo = document.getElementById("call-video-self");
    const selfTile = document.querySelector(".self-tile");
    if (selfVideo) {
      selfVideo.srcObject = activeCall.localStream || null;
      selfVideo.hidden = !activeCall.localStream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled);
      if (selfTile) selfTile.classList.toggle("remote-ready", !selfVideo.hidden);
      if (!selfVideo.hidden) selfVideo.play().catch(() => {});
    }
    for (const username of activeCall.members.filter((member) => member !== me)) {
      const peerVideo = document.getElementById(`call-video-${username}`);
      const peerAudio = document.getElementById(`call-audio-${username}`);
      const remote = activeCall.remoteStreams.get(username);
      const hasVideo = remote?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled && !track.muted);
      const tile = document.getElementById(`call-tile-${username}`);
      if (peerVideo) {
        peerVideo.srcObject = remote || null;
        peerVideo.hidden = !hasVideo;
        if (hasVideo) peerVideo.play().catch(() => {});
      }
      if (tile) tile.classList.toggle("remote-ready", Boolean(hasVideo));
      if (peerAudio) {
        peerAudio.srcObject = hasVideo ? null : remote || null;
        if (!hasVideo && remote) peerAudio.play().catch(() => {});
      }
    }
    updateCallParticipantStatus();
  }

  async function createCallPeer(username, { createVideoTransceiver = true } = {}) {
    if (activeCall.peers.has(username)) return activeCall.peers.get(username);
    const call = activeCall;
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.cloudflare.com:3478" },
        { urls: "stun:stun.l.google.com:19302" },
      ],
    });
    call.peers.set(username, peer);
    call.remoteStreams.set(username, new MediaStream());
    for (const track of call.localStream.getAudioTracks()) peer.addTrack(track, call.localStream);
    if (createVideoTransceiver) {
      const videoTransceiver = peer.addTransceiver("video", { direction: "sendrecv" });
      const localVideo = call.localStream.getVideoTracks().find((track) => track.readyState === "live");
      if (localVideo) await videoTransceiver.sender.replaceTrack(localVideo);
      call.videoSenders.set(username, videoTransceiver.sender);
    }
    peer.addEventListener("track", (event) => {
      if (activeCall !== call || call.peers.get(username) !== peer) return;
      const remote = call.remoteStreams.get(username);
      for (const track of event.streams[0]?.getTracks() || [event.track]) {
        if (!remote.getTracks().some((existing) => existing.id === track.id)) remote.addTrack(track);
        track.addEventListener("mute", attachCallMedia);
        track.addEventListener("unmute", attachCallMedia);
      }
      attachCallMedia();
    });
    peer.addEventListener("icecandidate", (event) => {
      if (activeCall !== call || !event.candidate) return;
      const candidate = event.candidate.toJSON();
      if (call.signalingStarted.has(username)) callMessage(username, "call:ice", { candidate });
      else {
        if (!call.pendingLocalCandidates.has(username)) call.pendingLocalCandidates.set(username, []);
        call.pendingLocalCandidates.get(username).push(candidate);
      }
    });
    peer.addEventListener("connectionstatechange", () => {
      if (activeCall !== call || call.peers.get(username) !== peer) return;
      if (peer.connectionState === "connected") setCallStatus(`Connected · ${call.peers.size} friend${call.peers.size === 1 ? "" : "s"}`);
      else if (peer.connectionState === "failed") setCallStatus(`Could not connect to @${username}. This network may need a TURN relay.`);
      else if (peer.connectionState === "disconnected") setCallStatus(`Connection to @${username} interrupted…`);
      updateCallParticipantStatus();
    });
    return peer;
  }

  async function startPeerOffer(username) {
    if (!activeCall || currentUser().username >= username || activeCall.offersStarted.has(username)) return;
    activeCall.offersStarted.add(username);
    const peer = await createCallPeer(username);
    activeCall.signalingStarted.add(username);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    callMessage(username, "call:offer", { description: peer.localDescription });
    for (const candidate of activeCall.pendingLocalCandidates.get(username) || []) {
      callMessage(username, "call:ice", { candidate });
    }
    activeCall.pendingLocalCandidates.delete(username);
  }

  async function addQueuedCandidates(username, peer) {
    for (const candidate of activeCall.pendingRemoteCandidates.get(username) || []) {
      await peer.addIceCandidate(candidate);
    }
    activeCall.pendingRemoteCandidates.delete(username);
  }

  async function getCallMedia(mediaType) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone and camera need a secure HTTPS link or localhost.");
    }
    if (mediaType !== "video") return navigator.mediaDevices.getUserMedia({ audio: true });
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch (cameraError) {
      console.warn("Could not access a camera when starting the call; falling back to audio:", cameraError);
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      notify("No camera is available right now. The call will continue as voice; try the camera button during the call.");
      return audioStream;
    }
  }

  function newCallState({ id, members, mediaType, incoming }) {
    const username = currentUser().username;
    return {
      id,
      members: [...new Set(members)],
      mediaType,
      incoming,
      isCaller: !incoming,
      status: incoming ? "Incoming call…" : "Requesting microphone…",
      localStream: null,
      peers: new Map(),
      videoSenders: new Map(),
      remoteStreams: new Map(),
      pendingLocalCandidates: new Map(),
      pendingRemoteCandidates: new Map(),
      signalingStarted: new Set(),
      offersStarted: new Set(),
      invitedBy: incoming ? members.find((member) => member !== username) : null,
    };
  }

  async function toggleCallCamera() {
    const call = activeCall;
    if (!call || call.cameraBusy) return;
    call.cameraBusy = true;
    render();
    let newTrack = null;
    let existingTrack = null;
    try {
      existingTrack = call.localStream?.getVideoTracks().find((track) => track.readyState === "live");
      if (!existingTrack) {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access requires HTTPS or localhost.");
        }
        const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        newTrack = cameraStream.getVideoTracks()[0] || null;
        if (!newTrack) throw new Error("No camera was found on this device.");
        if (activeCall !== call) {
          newTrack.stop();
          return;
        }
        call.localStream.addTrack(newTrack);
      }
      const trackToSend = existingTrack ? null : newTrack;
      try {
        await Promise.all([...call.videoSenders.values()].map((sender) => sender.replaceTrack(trackToSend)));
      } catch (error) {
        await Promise.all([...call.videoSenders.values()].map((sender) => sender.replaceTrack(existingTrack || null).catch(() => {})));
        throw error;
      }
      if (existingTrack) {
        call.localStream.removeTrack(existingTrack);
        existingTrack.stop();
      }
      attachCallMedia();
    } catch (error) {
      if (newTrack) {
        await Promise.all([...call.videoSenders.values()].map((sender) => sender.replaceTrack(null).catch(() => {})));
        if (call.localStream?.getTracks().includes(newTrack)) call.localStream.removeTrack(newTrack);
      }
      newTrack?.stop();
      console.error("Could not switch the Hypercall camera:", error);
      notify(error.name === "NotAllowedError"
        ? "Allow camera access in your browser settings, then try again."
        : error.name === "NotFoundError"
          ? "No camera was found on this device."
          : error.message || "Could not switch the camera.");
    } finally {
      call.cameraBusy = false;
      if (activeCall === call) {
        attachCallMedia();
        render();
      }
    }
  }

  async function startCall(target, mediaType = "audio") {
    const usernames = [...new Set(Array.isArray(target) ? target : [target])];
    if (!usernames.length || usernames.length > 5 || usernames.some((name) => !currentUser()?.friends.includes(name))) {
      notify("Choose between 1 and 5 of your friends.");
      return;
    }
    if (activeCall) return notify("Finish your current call before starting another.");
    if (!sendRealtime({ type: "presence:refresh" })) return notify("The real-time connection is still starting. Try again.");
    if (!Array.isArray(target)) {
      selectedUser = usernames[0];
      selectedGroup = null;
      activeTab = "messages";
    }
    activeCall = newCallState({ id: crypto.randomUUID(), members: [currentUser().username, ...usernames], mediaType, incoming: false });
    modal = "call";
    render();
    try {
      activeCall.localStream = await getCallMedia(mediaType);
      activeCall.status = `Calling ${usernames.length} friend${usernames.length === 1 ? "" : "s"}…`;
      render();
      attachCallMedia();
      sendRealtime({
        type: "call:invite",
        to: usernames[0],
        participants: usernames,
        callId: activeCall.id,
        mediaType,
      });
    } catch (error) {
      console.error("Could not start Hypercall call:", error);
      finishCall(false);
      notify(error.name === "NotAllowedError" ? "Allow microphone and camera access to start the call." : error.message || "Could not start the call.");
    }
  }

  async function startGroupCall(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const participants = new FormData(form).getAll("participants").map(String);
    const mediaType = new FormData(form).get("mediaType") === "video" ? "video" : "audio";
    if (!participants.length) {
      const error = document.getElementById("group-call-error");
      if (error) error.textContent = "Choose at least one friend.";
      return;
    }
    if (participants.length > 5) {
      const error = document.getElementById("group-call-error");
      if (error) error.textContent = "Group calls support up to 6 people, including you.";
      return;
    }
    modal = "";
    render();
    await startCall(participants, mediaType);
  }

  async function acceptCall() {
    if (!activeCall?.incoming) return;
    stopRingtone();
    try {
      activeCall.localStream = await getCallMedia(activeCall.mediaType);
      activeCall.incoming = false;
      activeCall.status = "Joining call…";
      modal = "call";
      render();
      attachCallMedia();
      callMessage(activeCall.invitedBy, "call:accept");
    } catch (error) {
      console.error("Could not answer Hypercall call:", error);
      finishCall(true, "call:reject");
      notify(error.name === "NotAllowedError" ? "Allow microphone and camera access to answer." : error.message || "Could not answer the call.");
    }
  }

  function closePeer(username) {
    if (!activeCall) return;
    activeCall.peers.get(username)?.close();
    activeCall.peers.delete(username);
    activeCall.videoSenders.delete(username);
    activeCall.remoteStreams.delete(username);
    activeCall.pendingLocalCandidates.delete(username);
    activeCall.pendingRemoteCandidates.delete(username);
  }

  function finishCall(notifyPeer = true, signal = "call:end") {
    const call = activeCall;
    if (!call) return;
    stopRingtone();
    if (notifyPeer && realtimeSocket?.readyState === WebSocket.OPEN) {
      const to = call.invitedBy || call.members.find((member) => member !== currentUser()?.username);
      if (to) realtimeSocket.send(JSON.stringify({ type: signal, to, callId: call.id }));
    }
    for (const peer of call.peers.values()) peer.close();
    for (const track of call.localStream?.getTracks() || []) track.stop();
    activeCall = null;
    modal = "";
    render();
  }

  async function handleCallSignal(message) {
    if (message.type === "error") {
      const callError = activeCall?.isCaller && activeCall.peers.size === 0;
      if (callError) finishCall(false);
      notify(message.message || "Real-time service error.");
      return;
    }
    if (message.type === "call:invite") {
      if (activeCall) {
        sendRealtime({ type: "call:reject", to: message.from, callId: message.callId });
        return;
      }
      activeCall = newCallState({
        id: message.callId,
        members: message.members || [message.from, currentUser().username],
        mediaType: message.mediaType,
        incoming: true,
      });
      activeCall.invitedBy = message.from;
      selectedUser = message.from;
      selectedGroup = null;
      activeTab = "messages";
      modal = "call";
      render();
      startRingtone();
      notify(`Incoming ${message.mediaType} call from ${displayName(message.from)}.`);
      return;
    }
    if (!activeCall || message.callId !== activeCall.id) return;
    try {
      if (message.type === "call:ringing") {
        activeCall.members = message.members || activeCall.members;
        setCallStatus(`Ringing ${activeCall.members.length - 1} friend${activeCall.members.length === 2 ? "" : "s"}…`);
        return;
      }
      if (message.type === "call:accept" && message.to === currentUser().username) {
        if (!activeCall.members.includes(message.from)) activeCall.members.push(message.from);
        if (currentUser().username < message.from) await startPeerOffer(message.from);
        attachCallMedia();
        return;
      }
      if (message.type === "call:offer" && message.to === currentUser().username && activeCall.members.includes(message.from)) {
        const peer = await createCallPeer(message.from, { createVideoTransceiver: false });
        if (peer.remoteDescription) return;
        await peer.setRemoteDescription(message.description);
        const videoTransceiver = peer.getTransceivers().find((transceiver) =>
          transceiver.mid !== null && transceiver.receiver.track.kind === "video"
        );
        if (videoTransceiver) {
          videoTransceiver.direction = "sendrecv";
          const localVideo = activeCall.localStream?.getVideoTracks().find((track) => track.readyState === "live");
          if (localVideo) await videoTransceiver.sender.replaceTrack(localVideo);
          activeCall.videoSenders.set(message.from, videoTransceiver.sender);
        }
        await addQueuedCandidates(message.from, peer);
        activeCall.signalingStarted.add(message.from);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        callMessage(message.from, "call:answer", { description: peer.localDescription });
        for (const candidate of activeCall.pendingLocalCandidates.get(message.from) || []) {
          callMessage(message.from, "call:ice", { candidate });
        }
        activeCall.pendingLocalCandidates.delete(message.from);
        return;
      }
      if (message.type === "call:answer" && message.to === currentUser().username) {
        const peer = activeCall.peers.get(message.from);
        if (peer && !peer.remoteDescription) {
          await peer.setRemoteDescription(message.description);
          await addQueuedCandidates(message.from, peer);
        }
        return;
      }
      if (message.type === "call:ice" && message.to === currentUser().username && message.candidate) {
        const peer = activeCall.peers.get(message.from);
        if (peer?.remoteDescription) await peer.addIceCandidate(message.candidate);
        else {
          if (!activeCall.pendingRemoteCandidates.has(message.from)) activeCall.pendingRemoteCandidates.set(message.from, []);
          activeCall.pendingRemoteCandidates.get(message.from).push(message.candidate);
        }
        return;
      }
      if ((message.type === "call:reject" || message.type === "call:end") && message.to === currentUser().username) {
        if (message.roomEnded || (message.type === "call:reject" && activeCall.members.length <= 2)) {
          finishCall(false);
        } else {
          closePeer(message.from);
          activeCall.members = activeCall.members.filter((member) => member !== message.from);
          attachCallMedia();
          setCallStatus(`@${message.from} ${message.type === "call:reject" ? "declined" : "left"} the call`);
        }
        if (message.type === "call:reject") notify(`${displayName(message.from)} declined the call.`);
      }
    } catch (error) {
      console.error("Hypercall call setup error:", error);
      closePeer(message.from);
      notify(`Could not connect to @${message.from}.`);
    }
  }

  function renderAuth() {
    app.innerHTML = `
      <main class="auth-screen">
        <div class="auth-art">
          <div class="art-orb orb-one"></div><div class="art-orb orb-two"></div>
          <div class="art-grid"></div>
          <div class="auth-art-copy">
            <div class="auth-brand"><img class="auth-logo" src="/hyperanruf-logo.png" alt="Original Hypergamy graphic"><span>Hypercall</span></div>
            <p class="eyebrow">YOUR SPACE TO TALK</p>
            <h1>Good conversations<br>start <em>somewhere.</em></h1>
            <p class="art-caption">A little corner of the internet, made for your people.</p>
            <div class="art-note"><span class="pulse"></span> Your people are one message away</div>
          </div>
          <div class="art-footer">A quieter kind of connected.</div>
        </div>
        <section class="auth-panel">
          <div class="auth-mobile-brand"><img class="auth-logo small" src="/hyperanruf-logo.png" alt=""><span>Hypercall</span></div>
          <div class="auth-card">
            <div class="auth-icon">${icon("message")}</div>
            <p class="eyebrow">WELCOME TO HYPERCALL</p>
            <h2>${authMode === "create" ? "Make yourself<br>at home." : "Welcome<br>back."}</h2>
            <p class="auth-subtitle">${authMode === "create" ? "Choose a username and password key for your account on this Hypercall server." : "Sign in to this Hypercall server with your username and password key."}</p>
            <div class="auth-mode-switch"><button type="button" class="${authMode === "create" ? "active" : ""}" data-auth-mode="create">Create account</button><button type="button" class="${authMode === "signin" ? "active" : ""}" data-auth-mode="signin">Sign in</button></div>
            <form id="auth-form">
              <label for="username">YOUR USERNAME</label>
              <div class="input-wrap"><span>@</span><input id="username" name="username" maxlength="24" autocomplete="username" placeholder="something memorable" required></div>
              <label for="password" class="password-label">YOUR PASSWORD KEY</label>
              <div class="input-wrap"><span>◆</span><input id="password" name="password" type="password" minlength="8" maxlength="128" autocomplete="${authMode === "create" ? "new-password" : "current-password"}" placeholder="At least 8 characters" required></div>
              ${authMode === "create" ? `<label for="password-confirm" class="password-label confirm-label">CONFIRM PASSWORD KEY</label><div class="input-wrap"><span>◆</span><input id="password-confirm" name="passwordConfirm" type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="Type it again" required></div>` : ""}
              <p class="field-error" id="auth-error" aria-live="polite"></p>
              <button class="primary-btn full" type="submit">${authMode === "create" ? "Create account" : "Sign in"} <span>→</span></button>
            </form>
            <div class="auth-divider"><span>JUST SO YOU KNOW</span></div>
            <p class="local-note">${icon("settings")} Accounts and chats are shared through this app's server. Use a unique password key.</p>
          </div>
          <p class="auth-bottom">Anyone with this server's join link can create an account.</p>
        </section>
      </main>`;
    document.getElementById("auth-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.getElementById("username");
      const username = normalize(input.value);
      const error = document.getElementById("auth-error");
      const passwordInput = document.getElementById("password");
      const password = passwordInput.value;
      const submit = event.currentTarget.querySelector('button[type="submit"]');
      if (!/^[a-z0-9_]{2,24}$/.test(username)) {
        error.textContent = "Use 2–24 letters, numbers, or underscores.";
        input.focus();
        return;
      }
      if (password.length < 8) {
        error.textContent = "Your password key must be at least 8 characters.";
        passwordInput.focus();
        return;
      }
      if (authMode === "create" && password !== document.getElementById("password-confirm").value) {
        error.textContent = "The password keys do not match.";
        document.getElementById("password-confirm").focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = authMode === "create" ? "Creating account…" : "Signing in…";
      try {
        const endpoint = authMode === "create" ? "/api/signup" : "/api/signin";
        const state = await apiRequest(endpoint, {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
        applyRemoteState(state);
        connectRealtime();
        persist();
        render();
      } catch (hashError) {
        error.textContent = hashError.message || "Could not securely process the password key.";
        passwordInput.focus();
      } finally {
        if (submit.isConnected) {
          submit.disabled = false;
          submit.innerHTML = `${authMode === "create" ? "Create account" : "Sign in"} <span>→</span>`;
        }
      }
    });
    document.querySelectorAll("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => {
      authMode = button.dataset.authMode;
      renderAuth();
    }));
  }

  function render() {
    document.body.dataset.theme = cosmetics.theme || (store.settings.theme === "light" ? "light" : "dark");
    document.body.dataset.effect = cosmetics.effect || "none";
    document.body.classList.toggle("compact", Boolean(store.settings.compact));
    clearInterval(crashPollTimer);
    clearInterval(crashDisplayTimer);
    crashPollTimer = null;
    crashDisplayTimer = null;
    if (!currentUser()) {
      renderAuth();
      return;
    }
    const user = currentUser();
    const people = contacts();
    if (selectedUser && !people.some((person) => person.username === selectedUser)) selectedUser = null;
    if (selectedGroup && !store.groups?.[selectedGroup]) selectedGroup = null;
    app.innerHTML = `
      <main class="app-shell ${activeCall || activeTab === "friends" || activeTab === "games" || selectedUser || selectedGroup ? "mobile-chat" : ""}">
        <aside class="rail">
          <img class="rail-logo" src="/hyperanruf-logo.png" alt="Hypercall">
          <div class="rail-divider"></div>
          <button class="rail-btn active" title="Home">${icon("home")}</button>
          <button class="rail-btn ${activeTab === "messages" ? "selected" : ""}" data-tab="messages" title="Messages">${icon("message")}<span class="rail-indicator"></span></button>
          <button class="rail-btn ${activeTab === "friends" ? "selected" : ""}" data-tab="friends" title="Friends">${icon("person")}${user.incoming.length ? '<span class="rail-dot"></span>' : ""}</button>
          <button class="rail-btn ${activeTab === "games" ? "selected" : ""}" data-tab="games" title="Games">${icon("games")}</button>
          <button class="rail-btn add-server" data-action="add-friend" title="Add a friend">${icon("add")}</button>
          <div class="rail-bottom"><button class="rail-btn" data-action="settings" title="Settings">${icon("settings")}</button></div>
        </aside>
        <aside class="sidebar">
          <div class="sidebar-head">
            <div><p class="eyebrow">YOUR SPACE</p><h1>Hypercall <span class="chevron">⌄</span></h1></div>
            <button class="icon-btn subtle" data-action="add-friend" title="Add friend">${icon("add")}</button>
          </div>
          <div class="sidebar-search">${icon("search")}<input id="sidebar-search" placeholder="Find a conversation" value="${escapeHtml(search)}"></div>
          <div class="sidebar-scroll">
            <button class="section-link ${activeTab === "messages" ? "current" : ""}" data-tab="messages">${icon("message")}<span>Messages</span></button>
            <button class="section-link ${activeTab === "friends" ? "current" : ""}" data-tab="friends">${icon("person")}<span>Friends</span>${user.incoming.length ? `<b class="count-pill">${user.incoming.length}</b>` : ""}</button>
            <button class="section-link ${activeTab === "games" ? "current" : ""}" data-tab="games">${icon("games")}<span>Games</span></button>
            <div class="section-title"><span>DIRECT MESSAGES</span><button class="tiny-add" data-action="add-friend" aria-label="Add friend">${icon("add")}</button></div>
            ${people.length ? people.filter((person) => person.username.includes(normalize(search))).map((person, i) => {
              const last = messagesWith(person).slice(-1)[0];
              return `<button class="dm-link ${selectedUser === person.username && activeTab === "messages" ? "current" : ""}" data-user="${escapeHtml(person.username)}">${avatar(person.username, ["purple", "mint", "coral", "blue", "gold"][i % 5])}<span class="dm-info"><strong>${escapeHtml(displayName(person.username))}</strong><small>${last ? escapeHtml(last.text) : `@${escapeHtml(person.username)}`}</small></span><span class="online-dot"></span></button>`;
            }).join("") : `<div class="empty-sidebar"><span class="empty-symbol">${icon("message")}</span><p>No conversations yet</p><button data-action="add-friend">Find your people</button></div>`}
            <div class="section-title"><span>GROUP CHATS</span><button class="tiny-add" data-action="create-group" aria-label="Create a group">${icon("add")}</button></div>
            ${Object.values(store.groups || {}).filter((group) => group.name.toLocaleLowerCase().includes(normalize(search))).map((group) => {
              const last = groupMessagesWith(group).slice(-1)[0];
              return `<button class="dm-link ${selectedGroup === group.id && activeTab === "messages" ? "current" : ""}" data-group="${escapeHtml(group.id)}">${avatar(group.name, "blue")}<span class="dm-info"><strong>${escapeHtml(group.name)}</strong><small>${last ? `${escapeHtml(displayName(last.from))}: ${escapeHtml(last.text)}` : `${group.members.length} members`}</small></span></button>`;
            }).join("")}
          </div>
          <div class="user-strip">
            ${avatar(user.username, "purple")}
            <div class="user-details"><strong>${escapeHtml(displayName(user.username))}</strong><span>@${escapeHtml(user.username)}</span></div>
            <button class="icon-btn" data-action="settings" title="Settings">${icon("settings")}</button>
            <button class="icon-btn" data-action="logout" title="Sign out">${icon("more")}</button>
          </div>
        </aside>
        <section class="main-panel">${activeCall ? renderCallWorkspace() : activeTab === "friends" ? renderFriends() : activeTab === "games" ? renderGames() : renderChat()}</section>
        ${renderModal()}
      </main>`;
    bindApp();
    scrollMessages();
    updateTypingIndicator();
    if (activeCall) attachCallMedia();
    if (activeTab === "games") {
      if (!gameState && !gameLoading && !gameError) loadGameState();
      else if (gameState?.activeGame?.type === "crash") startCrashTimers();
    }
  }

  function renderChat() {
    const user = currentUser();
    const group = selectedGroup ? store.groups[selectedGroup] : null;
    const person = selectedUser ? store.users[selectedUser] : null;
    if (group) return renderGroupChat(group);
    if (!person) {
      return `<div class="welcome-content">
        <div class="welcome-glow"></div><div class="welcome-emblem">${icon("message")}</div>
        <p class="eyebrow">A LITTLE MORE HUMAN</p><h2>It's better<br><em>with your people.</em></h2>
        <p class="welcome-copy">Find a friend and start a conversation. Your messages are saved on this Hypercall server.</p>
        <button class="primary-btn" data-action="add-friend">Add your first friend <span>→</span></button>
        <div class="welcome-foot">${avatar(user.username, "purple", "small")}<span>Welcome in, <strong>${escapeHtml(displayName(user.username))}</strong></span></div>
      </div>`;
    }

    function renderGroupChat(group) {
      const messages = groupMessagesWith(group);
      return `<header class="chat-header"><button class="mobile-back icon-btn" data-action="mobile-back" aria-label="Back to conversations">‹</button>
        <div class="chat-person">${avatar(group.name, "blue")}<div><h2>${escapeHtml(group.name)}</h2><span>${group.members.length} members</span></div></div>
        <div class="chat-actions"><button class="icon-btn" data-action="group-call" data-media="audio" title="Start a group call">${icon("phone")}</button><button class="icon-btn" data-action="group-call" data-media="video" title="Video group call">${icon("video")}</button></div>
      </header>
      <div class="message-area" id="message-area">
        <div class="chat-intro">${avatar(group.name, "blue", "large")}<h2>${escapeHtml(group.name)}</h2><p>${group.members.map((member) => escapeHtml(displayName(member))).join(", ")}</p><span class="intro-tag">GROUP CHAT</span></div>
        <div class="message-list">${messages.map((message, index) => {
          const own = message.from === currentUser().username;
          const prior = messages[index - 1];
          const grouped = prior && prior.from === message.from && message.time - prior.time < 300000;
          const time = new Date(message.time);
          return `<article class="message ${grouped ? "grouped" : ""}">${grouped ? '<span class="hover-time">' + time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + "</span>" : avatar(message.from, own ? "purple" : "mint")}<div class="message-body">${!grouped ? `<div class="message-meta"><strong>${escapeHtml(displayName(message.from))}</strong><time>${time.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>` : ""}<p>${escapeHtml(message.text).replace(/\n/g, "<br>")}</p></div></article>`;
        }).join("")}</div>
      </div>
      <div class="typing-indicator" id="typing-indicator" aria-live="polite"></div><form class="composer" id="group-message-form"><textarea id="group-message-input" rows="1" maxlength="2000" placeholder="Message ${escapeHtml(group.name)}"></textarea><div class="composer-tools"><button type="button" class="icon-btn" data-action="emoji" title="Add a smile">${icon("smile")}</button><button class="send-btn" type="submit" title="Send message" aria-label="Send message">${icon("send")}</button></div></form>`;
    }
    const messages = messagesWith(person);
    const colorIndex = contacts().findIndex((contact) => contact.username === person.username);
    return `<header class="chat-header"><button class="mobile-back icon-btn" data-action="mobile-back" aria-label="Back to conversations">‹</button>
      <div class="chat-person">${avatar(person.username, ["purple", "mint", "coral", "blue", "gold"][Math.max(0, colorIndex) % 5])}<div><h2>${escapeHtml(displayName(person.username))}</h2><span>@${escapeHtml(person.username)}</span></div></div>
      <div class="chat-actions"><button class="icon-btn" data-action="call" data-media="audio" title="Voice call">${icon("phone")}</button><button class="icon-btn" data-action="call" data-media="video" title="Video call">${icon("video")}</button><span class="header-divider"></span><button class="icon-btn" data-action="friend-info" title="Friend details">${icon("person")}</button></div>
    </header>
    <div class="message-area" id="message-area">
      <div class="chat-intro">${avatar(person.username, ["purple", "mint", "coral", "blue", "gold"][Math.max(0, colorIndex) % 5], "large")}<h2>${escapeHtml(displayName(person.username))}</h2><p>@${escapeHtml(person.username)} · This is the beginning of your conversation.</p><span class="intro-tag">JUST THE TWO OF YOU</span></div>
      <div class="message-list">${messages.map((message, index) => {
        const own = message.from === user.username;
        const prior = messages[index - 1];
        const grouped = prior && prior.from === message.from && message.time - prior.time < 300000;
        const time = new Date(message.time);
        return `<article class="message ${grouped ? "grouped" : ""}">${grouped ? '<span class="hover-time">' + time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + "</span>" : avatar(message.from, own ? "purple" : ["mint", "coral", "blue", "gold"][Math.max(0, colorIndex) % 4])}<div class="message-body">${!grouped ? `<div class="message-meta"><strong>${escapeHtml(displayName(message.from))}</strong><time>${time.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div>` : ""}<p>${escapeHtml(message.text).replace(/\n/g, "<br>")}</p></div></article>`;
      }).join("")}</div>
    </div>
    <div class="typing-indicator" id="typing-indicator" aria-live="polite"></div><form class="composer" id="message-form"><button type="button" class="composer-add" data-action="add-friend" title="Add friend">${icon("add")}</button><textarea id="message-input" rows="1" maxlength="2000" placeholder="Message @${escapeHtml(person.username)}"></textarea><div class="composer-tools"><button type="button" class="icon-btn" data-action="emoji" title="Add a smile">${icon("smile")}</button><button class="send-btn" type="submit" title="Send message" aria-label="Send message">${icon("send")}</button></div></form>`;
  }

  function renderCallWorkspace() {
    const me = currentUser().username;
    const members = activeCall.members;
    const others = members.filter((member) => member !== me);
    const isVideo = activeCall.mediaType === "video"
      || activeCall.localStream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled)
      || [...activeCall.remoteStreams.values()].some((stream) => stream.getVideoTracks().some((track) => track.readyState === "live" && track.enabled));
    const title = others.length > 1 ? "Group call" : displayName(others[0] || activeCall.invitedBy || "");
    const tiles = members.map((username) => {
      const self = username === me;
      const peer = activeCall.peers.get(username);
      const state = self
        ? (activeCall.incoming ? "Incoming call" : "You")
        : peer?.connectionState === "connected" ? "Voice connected"
          : activeCall.incoming ? "Calling you" : "Connecting…";
      const audioMuted = self && activeCall.localStream?.getAudioTracks()[0]?.enabled === false;
      return `<div class="call-member-tile ${self ? "self-tile" : ""}" id="call-tile-${username}">
        <video id="call-video-${self ? "self" : username}" autoplay ${self ? "muted" : ""} playsinline hidden></video>
        ${!self ? `<audio id="call-audio-${username}" autoplay></audio>` : ""}
        <span class="call-member-avatar">${avatar(username, self ? "purple" : "blue", "call-avatar")}</span>
        <div class="call-member-label"><strong>${self ? "You" : escapeHtml(displayName(username))}</strong><small>${self ? state : `@${escapeHtml(username)} · ${state}`}</small></div>
        <span class="call-mic-indicator ${audioMuted ? "muted" : ""}" aria-label="${audioMuted ? "Muted" : "Microphone on"}">${icon(audioMuted ? "micOff" : "mic")}</span>
      </div>`;
    }).join("");
    const memberRows = members.map((username) => {
      const self = username === me;
      const peer = activeCall.peers.get(username);
      const state = self ? "You" : peer?.connectionState === "connected" ? "In voice" : "Connecting";
      return `<div class="call-member-row" id="call-member-row-${username}">${avatar(username, self ? "purple" : "blue", "small")}<span><strong>${self ? "You" : escapeHtml(displayName(username))}</strong><small>${self ? state : `@${escapeHtml(username)} · ${state}`}</small></span><i class="online-dot"></i></div>`;
    }).join("");
    return `<section class="call-workspace">
      <div class="call-workspace-main">
        <div class="call-stage-area ${isVideo ? "video-call" : "voice-call"}">
          <div class="call-stage-topbar"><span class="call-live-dot ${activeCall.incoming ? "incoming" : ""}"></span><span>${activeCall.incoming ? "INCOMING CALL" : isVideo ? "VIDEO CALL" : "VOICE CALL"}</span><span class="call-stage-divider"></span><strong id="call-status">${escapeHtml(activeCall.status || (activeCall.incoming ? "Incoming call…" : "Calling…"))}</strong></div>
          <h2 class="call-stage-title">${escapeHtml(title)}</h2>
          <div class="call-stage-participants">${tiles}</div>
          <div class="call-controls">${activeCall.incoming
            ? `<button class="call-control-btn decline" data-action="call-reject" title="Decline call">${icon("close")}<span>Decline</span></button><button class="call-control-btn answer" data-action="call-accept" title="Answer call">${icon("phone")}<span>Answer</span></button>`
            : `<button class="call-control-btn ${activeCall.localStream?.getAudioTracks()[0]?.enabled === false ? "active" : ""}" data-action="call-mute" aria-pressed="${activeCall.localStream?.getAudioTracks()[0]?.enabled === false}" title="Toggle microphone">${icon(activeCall.localStream?.getAudioTracks()[0]?.enabled === false ? "micOff" : "mic")}<span>${activeCall.localStream?.getAudioTracks()[0]?.enabled === false ? "Unmute" : "Mute"}</span></button><button class="call-control-btn ${activeCall.localStream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled) ? "active" : ""}" data-action="call-camera" aria-pressed="${Boolean(activeCall.localStream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled))}" ${activeCall.cameraBusy ? "disabled" : ""} title="Toggle camera">${icon("video")}<span>${activeCall.cameraBusy ? "Camera…" : activeCall.localStream?.getVideoTracks().some((track) => track.readyState === "live" && track.enabled) ? "Camera off" : "Camera on"}</span></button><button class="call-control-btn hangup" data-action="call-end" title="Leave call">${icon("phone")}<span>Leave call</span></button>`}
          </div>
        </div>
        <div class="call-chat-pane">${renderChat()}</div>
      </div>
      <aside class="call-members-panel"><h3>MEMBERS <span>${members.length}</span></h3>${memberRows}<p class="call-members-note">Your microphone and camera controls are below the call.</p></aside>
    </section>`;
  }

  function renderFriends() {
    const user = currentUser();
    const people = contacts();
    return `<div class="friends-page">
      <header class="friends-header"><div><p class="eyebrow">YOUR CIRCLE</p><h2>Friends</h2><p>Good people make a good space.</p></div><div class="friends-header-actions"><button class="secondary-btn small-btn" data-action="group-call">${icon("phone")} Group call</button><button class="primary-btn small-btn" data-action="add-friend">${icon("add")} Add friend</button></div></header>
      <div class="friend-tabs"><button class="tab active">All friends <span>${people.length}</span></button><button class="tab" data-action="show-requests">Pending ${user.incoming.length ? `<span class="request-count">${user.incoming.length}</span>` : ""}</button></div>
      ${user.incoming.length ? `<section class="friend-section"><h3>FRIEND REQUESTS <span>${user.incoming.length}</span></h3>${user.incoming.map((name) => `<div class="friend-row">${avatar(name, "gold")}<div class="friend-row-info"><strong>${escapeHtml(displayName(name))}</strong><small>@${escapeHtml(name)} wants to connect</small></div><div class="friend-row-actions"><button class="accept-btn" data-action="accept" data-user="${escapeHtml(name)}">Accept</button><button class="icon-btn" data-action="ignore" data-user="${escapeHtml(name)}" title="Ignore request">${icon("close")}</button></div></div>`).join("")}</section>` : ""}
      <section class="friend-section"><h3>ALL FRIENDS <span>${people.length}</span></h3>${people.length ? people.map((person, i) => `<div class="friend-row">${avatar(person.username, ["purple", "mint", "coral", "blue", "gold"][i % 5])}<div class="friend-row-info"><strong>${escapeHtml(displayName(person.username))}</strong><small>@${escapeHtml(person.username)}</small></div><div class="friend-row-actions"><button class="icon-btn friend-msg" data-user="${escapeHtml(person.username)}" title="Message">${icon("message")}</button><button class="icon-btn" data-action="call" data-media="audio" data-user="${escapeHtml(person.username)}" title="Call">${icon("phone")}</button></div></div>`).join("") : `<div class="friend-empty"><div class="empty-symbol">${icon("person")}</div><h3>Your circle starts here.</h3><p>Add a username to send your first friend request.</p><button class="secondary-btn" data-action="add-friend">Find a friend</button></div>`}</section>
      <p class="local-disclaimer">${icon("settings")} Accounts and conversations are shared by this Hypercall server.</p>
    </div>`;
  }

  function formatCredits(amount) {
    return `${Number(amount || 0).toLocaleString()} credits`;
  }

  function renderGameCard(game, title, description) {
    return `<button class="game-card" data-game-select="${game}"><span class="game-card-icon">${icon(game === "blackjack" ? "more" : game === "crash" ? "games" : game === "mines" ? "search" : "smile")}</span><strong>${title}</strong><small>${description}</small><span class="game-card-play">Play →</span></button>`;
  }

  function renderPlayingCards(cards) {
    return (cards || []).map((card) => `<span class="playing-card ${["♥", "♦"].includes(card.suit) ? "red" : ""}"><strong>${escapeHtml(card.rank)}</strong><small>${escapeHtml(card.suit)}</small></span>`).join("");
  }

  function blackjackScore(cards) {
    let total = 0;
    let aces = 0;
    for (const card of cards || []) {
      if (card.rank === "A") {
        total += 11;
        aces += 1;
      } else {
        total += ["J", "Q", "K"].includes(card.rank) ? 10 : Number(card.rank);
      }
    }
    while (total > 21 && aces) {
      total -= 10;
      aces -= 1;
    }
    return total;
  }

  function renderGames() {
    if (!gameState) {
      const status = gameError
        ? `<p class="game-load-error" role="alert">${escapeHtml(gameError)}</p><button class="secondary-btn" data-action="games-retry">Try again</button>`
        : `<p>${gameLoading ? "Loading your play-credit balance…" : "Preparing your play-credit balance…"}</p>`;
      return `<section class="games-page"><p class="eyebrow">PLAY TOGETHER</p><h2>Games</h2>${status}</section>`;
    }
    const active = gameState.activeGame;
    const selected = active?.type || selectedGame;
    const result = gameResult || gameState.result;
    const messages = result ? `<p class="game-result" role="status">${escapeHtml(result)}</p>` : "";
    const challenges = gameState.challenges || [];
    if (shopOpen && !selected) return renderShop(messages);
    if (!selected) {
      const friendOptions = contacts().map((person) => `<option value="${escapeHtml(person.username)}">${escapeHtml(displayName(person.username))} (@${escapeHtml(person.username)})</option>`).join("");
      const challengeRows = challenges.map((challenge) => {
        const incoming = challenge.opponent === currentUser().username && challenge.status === "pending";
        const opponent = incoming ? challenge.challenger : challenge.opponent;
        const resultText = challenge.status === "pending"
          ? incoming ? `@${escapeHtml(challenge.challenger)} challenged you for ${formatCredits(challenge.bet)}.` : `Challenge sent to @${escapeHtml(challenge.opponent)} for ${formatCredits(challenge.bet)}.`
          : `${challenge.outcome === "heads" ? "Heads" : "Tails"} — ${challenge.winner === currentUser().username ? "You won" : `@${escapeHtml(challenge.winner || opponent)} won`} ${formatCredits(challenge.bet)} from each.`;
        return `<div class="challenge-row"><div><strong>${resultText}</strong><small>${challenge.status === "pending" ? "Coin flip challenge" : "Completed challenge"}</small></div>${incoming ? `<button class="primary-btn small-btn" data-game-action="challenge:accept" data-challenge-id="${escapeHtml(challenge.id)}">Accept</button><button class="secondary-btn small-btn" data-game-action="challenge:decline" data-challenge-id="${escapeHtml(challenge.id)}">Decline</button>` : ""}</div>`;
      }).join("");
      return `<section class="games-page">
        <header class="games-header"><div><p class="eyebrow">JUST FOR FUN</p><h2>Games</h2><p>Play with virtual credits. No real money, deposits, or cash-outs.</p></div><div class="games-header-actions"><button class="secondary-btn" data-action="shop-open">Hypercall Shop</button><div class="game-balance"><small>YOUR BALANCE</small><strong>${formatCredits(gameState.balance)}</strong></div></div></header>
        ${messages}
        <div class="games-grid">${renderGameCard("crash", "Crash", "Cash out before the multiplier stops.")}${renderGameCard("blackjack", "Blackjack", "Beat the dealer to 21.")}${renderGameCard("mines", "Mines", "Reveal safe tiles and build your multiplier.")}${renderGameCard("coinflip", "Coin flip", "Pick heads or tails.")}</div>
        <section class="game-social"><h3>PLAY WITH FRIENDS</h3>${contacts().length ? `<form id="trade-form" class="trade-form"><select name="to" aria-label="Friend to send credits to" required><option value="">Choose a friend to trade credits</option>${friendOptions}</select><input name="amount" type="number" min="1" max="${Math.max(1, gameState.balance)}" placeholder="Amount" aria-label="Credits to send" required><button class="secondary-btn" type="submit">Send credits</button></form>` : `<p>Add friends first to trade play credits or send a coin-flip challenge.</p>`}
          ${challengeRows ? `<div class="challenge-list">${challengeRows}</div>` : ""}
        </section><p class="game-disclaimer">Every account starts with 10,000 virtual credits. Credits have no cash value and cannot be purchased, withdrawn, or exchanged for real money.</p>
      </section>`;
    }

    const back = `<header class="games-subheader"><button class="secondary-btn small-btn" data-action="games-home">‹ All games</button><div class="game-balance compact-balance"><small>YOUR BALANCE</small><strong>${formatCredits(gameState.balance)}</strong></div></header>`;
    const betInput = `<label>BET<input name="bet" type="number" min="1" max="${Math.max(1, gameState.balance)}" value="100" required></label>`;
    let panel = "";
    if (selected === "coinflip") {
      const flip = coinFlipAnimation;
      const coin = flip ? `<div class="coin-flip-stage" role="status" aria-label="${flip.spinning ? "Flipping coin" : `Coin landed on ${flip.outcome}`}" aria-live="polite"><div class="casino-coin ${flip.spinning ? `is-flipping flip-${flip.outcome || "heads"}` : `landed-${flip.outcome}`}"><span class="coin-face coin-heads">H</span><span class="coin-face coin-tails">T</span></div></div>` : `<div class="coin-flip-stage"><div class="casino-coin coin-idle"><span class="coin-face coin-heads">H</span><span class="coin-face coin-tails">T</span></div></div>`;
      panel = `<h2>Coin flip</h2><p>Choose your side. A winning flip pays 2× your bet.</p>${coin}
        <form id="coinflip-form" class="game-form">${betInput}<label>YOUR SIDE<select name="side"><option value="heads">Heads</option><option value="tails">Tails</option></select></label><button class="primary-btn" type="submit" ${gameActionLoading ? "disabled" : ""}>${gameActionLoading ? "Flipping…" : "Flip coin"}</button></form>
        ${contacts().length ? `<form id="challenge-form" class="game-form friend-challenge-form"><h3>Challenge a friend</h3><select name="to" aria-label="Friend to challenge" required><option value="">Choose a friend</option>${contacts().map((person) => `<option value="${escapeHtml(person.username)}">${escapeHtml(displayName(person.username))} (@${escapeHtml(person.username)})</option>`).join("")}</select><label>BET<input name="bet" type="number" min="1" max="${Math.max(1, gameState.balance)}" value="100" required></label><button class="secondary-btn" type="submit">Send challenge</button></form>` : ""}
        ${messages}`;
    } else if (selected === "mines") {
      if (active?.type === "mines") {
        const revealed = new Set(gameState.revealedTiles || active.revealed || []);
        const mineHit = gameState.mineHit;
        const shownMine = mineHit === undefined ? "" : `<span class="mine-result">Mine</span>`;
        panel = `<h2>Mines</h2><p>${active.mineCount} mines · Current cash-out: <strong>${formatCredits(Math.floor(active.bet * active.multiplier))}</strong></p><div class="mines-grid">${Array.from({ length: 25 }, (_, tile) => mineHit === tile ? `<span class="mine-tile mine-hit">${shownMine}</span>` : `<button class="mine-tile ${revealed.has(tile) ? "safe" : ""}" data-game-action="mines:pick" data-tile="${tile}" ${revealed.has(tile) ? "disabled" : ""}>${revealed.has(tile) ? "✓" : "?"}</button>`).join("")}</div><button class="primary-btn" data-game-action="mines:cashout" ${revealed.size ? "" : "disabled"}>Cash out ${formatCredits(Math.floor(active.bet * active.multiplier))}</button>${messages}`;
      } else {
        panel = `<h2>Mines</h2><p>Pick a bet and mine count. You lose the bet if you reveal a mine.</p><form id="mines-start-form" class="game-form">${betInput}<label>MINES<select name="mineCount">${[1, 3, 5, 10, 15, 20, 24].map((count) => `<option value="${count}" ${count === 3 ? "selected" : ""}>${count}</option>`).join("")}</select></label><button class="primary-btn" type="submit">Start mines</button></form>${messages}`;
      }
    } else if (selected === "blackjack") {
      if (active?.type === "blackjack") {
        const dealer = active.dealerHand || [];
        panel = `<h2>Blackjack</h2><p>Bet ${formatCredits(active.bet)} · Dealer stands on 17.</p><div class="blackjack-table"><div><strong>DEALER ${active.phase === "playing" ? "" : `· ${blackjackScore(dealer)}`}</strong><div class="playing-cards">${renderPlayingCards(dealer)}${active.phase === "playing" ? '<span class="playing-card card-hidden">?</span>' : ""}</div></div><div><strong>YOU · ${blackjackScore(active.playerHand)}</strong><div class="playing-cards">${renderPlayingCards(active.playerHand)}</div></div></div><div class="game-button-row"><button class="secondary-btn" data-game-action="blackjack:hit">Hit</button><button class="primary-btn" data-game-action="blackjack:stand">Stand</button></div>${messages}`;
      } else {
        panel = `<h2>Blackjack</h2><p>Beat the dealer without going over 21. Blackjack pays 3:2.</p><form id="blackjack-start-form" class="game-form">${betInput}<button class="primary-btn" type="submit">Deal cards</button></form>${gameState.playerHand ? `<div class="blackjack-table"><div><strong>DEALER · ${blackjackScore(gameState.dealerHand)}</strong><div class="playing-cards">${renderPlayingCards(gameState.dealerHand)}</div></div><div><strong>YOU · ${blackjackScore(gameState.playerHand)}</strong><div class="playing-cards">${renderPlayingCards(gameState.playerHand)}</div></div></div>` : ""}${messages}`;
      }
    } else if (selected === "crash") {
      if (active?.type === "crash") {
        const multiplier = Math.exp((Date.now() - active.startedAt) / 7000);
        panel = `<h2>Crash</h2><p>Bet ${formatCredits(active.bet)}. Cash out before the round crashes.</p><div class="crash-flight-area" aria-label="Rocket flying as the multiplier climbs"><div class="crash-stars"></div><div class="crash-rocket" id="crash-rocket"><span class="rocket-flame"></span><svg viewBox="0 0 64 64" aria-hidden="true"><path class="rocket-body" d="M37 5C25 12 19 23 19 35l10 10c12 0 23-6 30-18C63 17 58 8 52 3l-15 2Z"/><circle class="rocket-window" cx="44" cy="21" r="5"/><path class="rocket-fin" d="m19 31-10 5 1 11 12-4m9 2-5 12 11 1 5-10"/><path class="rocket-nose" d="M37 5 52 3"/></svg></div></div><div class="crash-multiplier" id="crash-multiplier">${multiplier.toFixed(2)}×</div><button class="primary-btn" data-game-action="crash:cashout">Cash out</button>${messages}`;
      } else {
        panel = `<h2>Crash</h2><p>Start a round, then cash out before it crashes. The multiplier grows over time.</p><form id="crash-start-form" class="game-form">${betInput}<button class="primary-btn" type="submit">Start round</button></form>${messages}`;
      }
    }
    return `<section class="games-page"><div class="games-subheader-wrap">${back}</div>${renderGameLossEffect()}<div class="game-panel">${panel}</div><p class="game-disclaimer">Play credits only — no real-money betting, deposits, or cash-outs.</p></section>`;
  }

  function renderShop(messages) {
    const shop = gameState.shop;
    const owned = new Set(shop.owned);
    const renderItem = (item) => {
      const isOwned = owned.has(item.id);
      const equipped = item.kind === "theme" ? shop.theme === item.id : shop.effect === item.id;
      const preview = item.kind === "theme"
        ? `<span class="shop-preview theme-preview theme-${item.id}"><i></i><i></i><i></i></span>`
        : `<span class="shop-preview effect-preview effect-${item.id}"><i>✦</i><i>✧</i><i>·</i></span>`;
      const action = equipped
        ? `<button class="secondary-btn shop-action" disabled>Equipped</button>`
        : isOwned
          ? `<button class="secondary-btn shop-action" data-shop-action="equip" data-item-id="${item.id}">Equip</button>`
          : `<button class="primary-btn shop-action" data-shop-action="buy" data-item-id="${item.id}" ${gameActionLoading || gameState.balance < item.price ? "disabled" : ""}>${gameActionLoading ? "Please wait…" : `Buy · ${formatCredits(item.price)}`}</button>`;
      return `<article class="shop-card">${preview}<div class="shop-card-copy"><span class="shop-kind">${item.kind === "theme" ? "COLOR THEME" : "VISUAL EFFECT"}</span><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p></div>${action}</article>`;
    };
    const resetTheme = `<button class="secondary-btn shop-reset" data-shop-action="equip" data-item-id="default-theme" ${shop.theme ? "" : "disabled"}>Use default colors</button>`;
    const resetEffect = `<button class="secondary-btn shop-reset" data-shop-action="equip" data-item-id="no-effect" ${shop.effect ? "" : "disabled"}>Turn effects off</button>`;
    return `<section class="games-page shop-page"><header class="games-header"><div><p class="eyebrow">MAKE IT YOURS</p><h2>Hypercall Shop</h2><p>Unlock color themes and subtle effects with your play credits. Purchases stay on your account.</p></div><div class="games-header-actions"><button class="secondary-btn" data-action="shop-close">‹ Back to games</button><div class="game-balance"><small>YOUR BALANCE</small><strong>${formatCredits(gameState.balance)}</strong></div></div></header>${messages}<div class="shop-section-heading"><div><h3>Color themes</h3><p>Change the look of the whole app.</p></div>${resetTheme}</div><div class="shop-grid">${shop.items.filter((item) => item.kind === "theme").map(renderItem).join("")}</div><div class="shop-section-heading effects-heading"><div><h3>Visual effects</h3><p>Add a little motion and atmosphere.</p></div>${resetEffect}</div><div class="shop-grid">${shop.items.filter((item) => item.kind === "effect").map(renderItem).join("")}</div><p class="game-disclaimer">Shop items use virtual play credits only and have no cash value.</p></section>`;
  }

  async function loadGameState() {
    if (gameLoading || !currentUser()) return;
    gameLoading = true;
    gameError = "";
    try {
      gameState = await apiRequest("/api/games");
      if (gameState.activeGame) selectedGame = gameState.activeGame.type;
      gameResult = gameState.result || "";
      render();
    } catch (error) {
      console.error("Could not load game balance:", error);
      gameError = error.message || "Could not load your games.";
      render();
      notify(error.message || "Could not load your games.");
    } finally {
      gameLoading = false;
    }
  }

  function resetGameState() {
    clearInterval(crashPollTimer);
    clearInterval(crashDisplayTimer);
    crashPollTimer = null;
    crashDisplayTimer = null;
    gameState = null;
    gameLoading = false;
    gameActionLoading = false;
    gameError = "";
    gameResult = "";
    coinFlipAnimation = null;
    clearGameLossEffect();
    shopOpen = false;
    selectedGame = null;
  }

  function showGameLoss(effect) {
    gameLossEffect = effect;
    clearTimeout(gameLossTimer);
    gameLossTimer = setTimeout(() => {
      gameLossEffect = "";
      gameLossTimer = null;
      if (activeTab === "games") render();
    }, 2200);
  }

  function clearGameLossEffect() {
    gameLossEffect = "";
    clearTimeout(gameLossTimer);
    gameLossTimer = null;
  }

  function renderGameLossEffect() {
    if (!gameLossEffect) return "";
    const effects = {
      crash: ["🚀", "The rocket crashed"],
      coinflip: ["🪙", "The coin landed the other way"],
      mines: ["💥", "You hit a mine"],
      blackjack: ["🃏", "Not this hand"],
    };
    const [icon, label] = effects[gameLossEffect] || ["✦", "Not this time"];
    return `<div class="game-loss-effect loss-${gameLossEffect}" role="status"><span class="loss-icon" aria-hidden="true">${icon}</span><strong>${label}</strong></div>`;
  }

  async function submitGameAction(action, values = {}, submitButton = null) {
    if (gameActionLoading) return;
    const coinFlip = action === "coinflip";
    gameActionLoading = true;
    if (submitButton) submitButton.disabled = true;
    if (coinFlip) {
      coinFlipAnimation = { outcome: "heads", spinning: true };
      render();
    }
    try {
      const shopAction = action.startsWith("shop:");
      const requestAction = shopAction ? action.slice(5) : action;
      const result = await apiRequest(shopAction ? "/api/shop/action" : "/api/games/action", {
        method: "POST",
        body: JSON.stringify({ action: requestAction, ...values }),
      });
      gameState = result;
      if (result.shop) cosmetics = result.shop;
      if (coinFlip || (action === "challenge:accept" && result.outcome)) {
        coinFlipAnimation = { outcome: result.outcome, won: result.won, spinning: true };
        gameResult = "";
        render();
        await new Promise((resolve) => setTimeout(resolve, 1500));
        coinFlipAnimation.spinning = false;
      }
      gameResult = result.result || "";
      if (action.startsWith("crash:") && !result.activeGame) {
        clearInterval(crashPollTimer);
        clearInterval(crashDisplayTimer);
        crashPollTimer = null;
        crashDisplayTimer = null;
      }
      if (result.crashed || /bet lost|you lost|dealer wins/i.test(gameResult)) {
        const effect = action.startsWith("crash") ? "crash"
          : action.startsWith("mines") ? "mines"
            : action.startsWith("blackjack") ? "blackjack"
              : "coinflip";
        showGameLoss(effect);
      }
      if (result.activeGame) selectedGame = result.activeGame.type;
      else if (action.startsWith("challenge:")) selectedGame = null;
      else if (action.startsWith("shop:")) selectedGame = null;
      else if (action.includes(":")) selectedGame = action.split(":")[0];
      if (action.startsWith("shop:")) shopOpen = true;
      render();
    } catch (error) {
      console.error(`Could not complete game action ${action}:`, error);
      notify(error.message || "Could not complete that game action.");
      if (submitButton?.isConnected) submitButton.disabled = false;
      if (coinFlip) {
        coinFlipAnimation = null;
        gameResult = "";
        render();
      }
    } finally {
      gameActionLoading = false;
      if (action.startsWith("shop:") || coinFlip) render();
    }
  }

  function startCrashTimers() {
    clearInterval(crashPollTimer);
    clearInterval(crashDisplayTimer);
    const updateMultiplier = () => {
      const active = gameState?.activeGame;
      const display = document.getElementById("crash-multiplier");
      if (active?.type === "crash" && display) {
        const multiplier = Math.exp((Date.now() - active.startedAt) / 7000);
        display.textContent = `${multiplier.toFixed(2)}×`;
        const rocket = document.getElementById("crash-rocket");
        if (rocket) {
          const progress = Math.min(1, Math.log(multiplier) / Math.log(8));
          rocket.style.setProperty("--rocket-x", `${progress * 72}%`);
          rocket.style.setProperty("--rocket-y", `-${progress * 66}%`);
        }
      }
    };
    updateMultiplier();
    crashDisplayTimer = setInterval(updateMultiplier, 100);
    crashPollTimer = setInterval(async () => {
      if (gameLoading) return;
      gameLoading = true;
      try {
        const state = await apiRequest("/api/games");
        if (!state.activeGame) {
          gameState = state;
          gameResult = state.result || "Round crashed — bet lost.";
          showGameLoss("crash");
          clearInterval(crashPollTimer);
          clearInterval(crashDisplayTimer);
          crashPollTimer = null;
          crashDisplayTimer = null;
          render();
        }
      } catch (error) {
        console.error("Could not check the crash round:", error);
        notify("Could not check whether the crash round is still live.");
        clearInterval(crashPollTimer);
        crashPollTimer = null;
      } finally {
        gameLoading = false;
      }
    }, 500);
  }

  function renderModal() {
    if (!modal) return "";
    if (modal === "create-group") {
      const friends = contacts();
      return `<div class="modal-backdrop" data-action="backdrop"><section class="modal group-call-picker" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close icon-btn" data-action="close" aria-label="Close">${icon("close")}</button><p class="eyebrow">YOUR PEOPLE, TOGETHER</p><h2 id="modal-title">Create a group</h2><p>Name the group and pick friends to start a shared chat.</p>
        ${friends.length ? `<form id="create-group-form"><label for="group-name">GROUP NAME</label><div class="input-wrap"><input id="group-name" name="name" maxlength="32" placeholder="Weekend plans" required></div><div class="group-call-friends">${friends.map((person) => `<label class="group-call-friend">${avatar(person.username, "purple", "small")}<span><strong>${escapeHtml(displayName(person.username))}</strong><small>@${escapeHtml(person.username)}</small></span><input type="checkbox" name="members" value="${escapeHtml(person.username)}"></label>`).join("")}</div><p class="field-error" id="create-group-error" aria-live="polite"></p><button class="primary-btn full" type="submit">Create group</button></form>` : `<div class="friend-empty"><p>Add friends before creating a group chat.</p><button class="secondary-btn" data-action="add-friend">Add a friend</button></div>`}
        <div class="modal-hint">Choose at least one friend. Group messages are saved and shared with all members.</div></section></div>`;
    }
    if (modal === "group-call-select") {
      const friends = contacts();
      return `<div class="modal-backdrop" data-action="backdrop"><section class="modal group-call-picker" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close icon-btn" data-action="close" aria-label="Close">${icon("close")}</button><p class="eyebrow">GET TOGETHER</p><h2 id="modal-title">Start a group call</h2><p>Choose up to 5 friends to call with you. Friends need to be online to answer.</p>
        ${friends.length ? `<form id="group-call-form"><div class="group-call-friends">${friends.map((person) => `<label class="group-call-friend">${avatar(person.username, "purple", "small")}<span><strong>${escapeHtml(displayName(person.username))}</strong><small>@${escapeHtml(person.username)}</small></span><input type="checkbox" name="participants" value="${escapeHtml(person.username)}"></label>`).join("")}</div><label class="group-call-type-label" for="group-call-type">Call type</label><select class="group-call-type" id="group-call-type" name="mediaType"><option value="audio" ${requestedCallMedia === "audio" ? "selected" : ""}>Voice call</option><option value="video" ${requestedCallMedia === "video" ? "selected" : ""}>Video call</option></select><p class="field-error" id="group-call-error" aria-live="polite"></p><button class="primary-btn full" type="submit">Start group call</button></form>` : `<div class="friend-empty"><p>Add friends before starting a group call.</p><button class="secondary-btn" data-action="add-friend">Add a friend</button></div>`}
        <div class="modal-hint">Calls support up to 6 people total. Some networks may block direct call connections.</div></section></div>`;
    }
    if (modal === "add-friend") {
      return `<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close icon-btn" data-action="close" aria-label="Close">${icon("close")}</button><div class="modal-mark">${icon("person")}</div><p class="eyebrow">MAKE A CONNECTION</p><h2 id="modal-title">Find your people.</h2><p>Enter someone's exact Hypercall username to send a friend request.</p><form id="friend-form"><label for="friend-username">THEIR USERNAME</label><div class="input-wrap"><span>@</span><input id="friend-username" name="username" maxlength="24" placeholder="their username" required></div><p class="field-error" id="friend-error" aria-live="polite"></p><button class="primary-btn full" type="submit">Send friend request <span>→</span></button></form><div class="modal-hint">Anyone with the join link can create an account.</div></section></div>`;
    }
    if (modal === "settings") {
      return `<div class="modal-backdrop" data-action="backdrop"><section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close icon-btn" data-action="close" aria-label="Close">${icon("close")}</button><p class="eyebrow">MAKE IT YOURS</p><h2 id="modal-title">Settings</h2><p>A few little things to make this space feel like you.</p>
        <div class="setting-row display-name-row"><div><strong>Display name</strong><small>Change how your name appears. Your username stays the same.</small></div><form id="display-name-form"><input name="displayName" aria-label="Display name" maxlength="32" value="${escapeHtml(currentUser().displayName || currentUser().username)}" required><button class="secondary-btn" type="submit">Save</button></form></div><p class="field-error" id="display-name-error" aria-live="polite"></p>
        <div class="setting-row"><div><strong>Profile picture</strong><small>Choose a photo from your device gallery.</small></div><div class="profile-picture-control"><label class="secondary-btn" for="profile-picture-input">Choose photo</label><input id="profile-picture-input" class="avatar-file-input" type="file" accept="image/jpeg,image/png,image/webp"><button class="text-btn" type="button" data-action="remove-avatar" ${currentUser().hasAvatar ? "" : "disabled"}>Remove</button></div></div>
        <div class="setting-row"><div><strong>Appearance</strong><small>Choose the look that feels right.</small></div><select id="theme-select"><option value="dark" ${store.settings.theme !== "light" ? "selected" : ""}>Midnight</option><option value="light" ${store.settings.theme === "light" ? "selected" : ""}>Daylight</option></select></div>
        <div class="setting-row"><div><strong>Compact messages</strong><small>Tighter spacing in conversations.</small></div><label class="switch"><input id="compact-select" type="checkbox" ${store.settings.compact ? "checked" : ""}><span></span></label></div>
        <div class="setting-account">${avatar(currentUser().username, "purple")}<div><strong>${escapeHtml(displayName(currentUser().username))}</strong><small>@${escapeHtml(currentUser().username)}</small></div><button class="text-btn" data-action="logout">Sign out</button></div><div class="modal-hint">Your profile picture is resized before upload and shared with your friends and group members.</div></section></div>`;
    }
    if (modal === "call") return "";
    if (modal === "friend-info") {
      const person = store.users[selectedUser];
      return `<div class="modal-backdrop" data-action="backdrop"><section class="modal call-modal" role="dialog" aria-modal="true"><button class="modal-close icon-btn" data-action="close" aria-label="Close">${icon("close")}</button>${avatar(person.username, "mint", "large")}<p class="eyebrow">YOUR FRIEND</p><h2>${escapeHtml(displayName(person.username))}</h2><p>@${escapeHtml(person.username)}</p><button class="secondary-btn full" data-action="close">Done</button></section></div>`;
    }
    if (modal === "emoji") return "";
    return "";
  }

  function bindApp() {
    app.querySelectorAll(".avatar-photo").forEach((photo) => photo.addEventListener("error", () => {
      photo.closest(".avatar")?.classList.remove("has-photo");
      photo.remove();
    }, { once: true }));
    app.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      if (activeTab === "friends") {
        selectedUser = null;
        selectedGroup = null;
      }
      render();
    }));
    app.querySelectorAll("[data-game-select]").forEach((button) => button.addEventListener("click", () => {
      clearGameLossEffect();
      selectedGame = button.dataset.gameSelect;
      gameResult = "";
      render();
    }));
    app.querySelectorAll("[data-game-action]").forEach((button) => button.addEventListener("click", () => {
      const values = {};
      if (button.dataset.challengeId) values.challengeId = button.dataset.challengeId;
      if (button.dataset.tile !== undefined) values.tile = Number(button.dataset.tile);
      submitGameAction(button.dataset.gameAction, values, button);
    }));
    app.querySelectorAll("[data-shop-action]").forEach((button) => button.addEventListener("click", () => {
      submitGameAction(`shop:${button.dataset.shopAction}`, { itemId: button.dataset.itemId }, button);
    }));
    app.querySelectorAll("[data-user]").forEach((button) => button.addEventListener("click", (event) => {
      const target = event.currentTarget;
      if (target.dataset.action === "accept" || target.dataset.action === "ignore") return;
      selectedUser = target.dataset.user;
      selectedGroup = null;
      activeTab = "messages";
      render();
    }));
    app.querySelectorAll("[data-group]").forEach((button) => button.addEventListener("click", (event) => {
      selectedGroup = event.currentTarget.dataset.group;
      selectedUser = null;
      activeTab = "messages";
      render();
    }));
    app.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", (event) => {
      const action = event.currentTarget.dataset.action;
      if (action === "add-friend") openModal("add-friend");
      else if (action === "create-group") openModal("create-group");
      else if (action === "settings") openModal("settings");
      else if (action === "games-home") {
        clearGameLossEffect();
        selectedGame = null;
        gameResult = "";
        render();
      }
      else if (action === "games-retry") {
        gameError = "";
        render();
      }
      else if (action === "shop-open") {
        shopOpen = true;
        render();
      }
      else if (action === "shop-close") {
        shopOpen = false;
        render();
      }
      else if (action === "remove-avatar") removeProfilePicture();
      else if (action === "close") closeModal();
      else if (action === "backdrop" && event.target === event.currentTarget) closeModal();
      else if (action === "call") startCall(event.currentTarget.dataset.user || selectedUser, event.currentTarget.dataset.media || "audio");
      else if (action === "group-call") openModal("group-call-select", event.currentTarget.dataset.media || "audio");
      else if (action === "call-accept") acceptCall();
      else if (action === "call-reject") finishCall(true, "call:reject");
      else if (action === "call-end") finishCall(true);
      else if (action === "call-mute") {
        const track = activeCall?.localStream?.getAudioTracks()[0];
        if (track) {
          track.enabled = !track.enabled;
          const button = event.currentTarget;
          button.classList.toggle("active", !track.enabled);
          button.setAttribute("aria-pressed", String(!track.enabled));
          button.innerHTML = `${icon(track.enabled ? "mic" : "micOff")}<span>${track.enabled ? "Mute" : "Unmute"}</span>`;
          const indicator = document.querySelector(".self-tile .call-mic-indicator");
          indicator?.classList.toggle("muted", !track.enabled);
          indicator?.setAttribute("aria-label", track.enabled ? "Microphone on" : "Muted");
          if (indicator) indicator.innerHTML = icon(track.enabled ? "mic" : "micOff");
        }
      }       else if (action === "call-camera") toggleCallCamera();
      else if (action === "friend-info") openModal("friend-info");
      else if (action === "mobile-back") {
        selectedUser = null;
        selectedGroup = null;
        activeTab = "messages";
        render();
      }
      else if (action === "logout") {
        apiRequest("/api/session", { method: "DELETE" }).catch((error) => console.error("Could not sign out:", error));
        if (activeCall) finishCall(true);
        closeRealtime();
        resetGameState();
        store.users = {};
        store.groups = {};
        store.session = null;
        selectedUser = null;
        selectedGroup = null;
        modal = "";
        render();
      } else if (action === "accept") acceptRequest(event.currentTarget.dataset.user);
      else if (action === "ignore") ignoreRequest(event.currentTarget.dataset.user);
      else if (action === "show-requests") {
        document.querySelector(".friend-section")?.scrollIntoView({ behavior: "smooth" });
      } else if (action === "emoji") insertEmoji();
    }));
    const finder = document.getElementById("sidebar-search");
    if (finder) finder.addEventListener("input", (event) => {
      search = event.target.value;
      const cursor = event.target.selectionStart;
      render();
      const next = document.getElementById("sidebar-search");
      next.focus();
      next.setSelectionRange(cursor, cursor);
    });
    const messageForm = document.getElementById("message-form");
    if (messageForm) {
      const input = document.getElementById("message-input");
      const stopTyping = bindTypingInput(input, `dm:${selectedUser}`);
      input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          messageForm.requestSubmit();
        }
      });
      messageForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        stopTyping();
        const text = input.value.trim();
        if (!text || !selectedUser) return;
        const user = currentUser();
        const id = conversationId(user.username, selectedUser);
        const recipient = selectedUser;
        input.disabled = true;
        try {
          const result = await apiRequest("/api/messages", {
            method: "POST",
            body: JSON.stringify({ to: recipient, text }),
          });
          if (!user.messages[id]) user.messages[id] = [];
          user.messages[id].push(result.message);
          sendRealtime({ type: "chat:message", to: recipient });
          render();
          document.getElementById("message-input")?.focus();
        } catch (error) {
          notify(error.message || "Could not send message.");
          input.disabled = false;
          input.focus();
        }
      });
    }
    const friendForm = document.getElementById("friend-form");
    if (friendForm) friendForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = normalize(new FormData(friendForm).get("username"));
      const error = document.getElementById("friend-error");
      const submit = friendForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        applyRemoteState(await apiRequest("/api/friend-requests", {
          method: "POST",
          body: JSON.stringify({ username }),
        }));
        notify("Friend request sent.");
        closeModal();
      } catch (requestError) {
        error.textContent = requestError.message || "Could not send friend request.";
      } finally {
        if (submit.isConnected) submit.disabled = false;
      }
    });
    const createGroupForm = document.getElementById("create-group-form");
    if (createGroupForm) createGroupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(createGroupForm);
      const name = String(formData.get("name") || "").trim();
      const members = formData.getAll("members").map(String);
      const error = document.getElementById("create-group-error");
      const submit = createGroupForm.querySelector('button[type="submit"]');
      if (!members.length) {
        error.textContent = "Choose at least one friend.";
        return;
      }
      submit.disabled = true;
      try {
        const state = await apiRequest("/api/groups", {
          method: "POST",
          body: JSON.stringify({ name, members }),
        });
        applyRemoteState(state);
        selectedGroup = state.createdGroupId;
        selectedUser = null;
        activeTab = "messages";
        modal = "";
        render();
      } catch (requestError) {
        error.textContent = requestError.message || "Could not create the group.";
      } finally {
        if (submit.isConnected) submit.disabled = false;
      }
    });
    const groupCallForm = document.getElementById("group-call-form");
    if (groupCallForm) groupCallForm.addEventListener("submit", startGroupCall);
    const gameForms = [
      ["coinflip-form", "coinflip", ["bet", "side"]],
      ["mines-start-form", "mines:start", ["bet", "mineCount"]],
      ["blackjack-start-form", "blackjack:start", ["bet"]],
      ["crash-start-form", "crash:start", ["bet"]],
      ["trade-form", "trade", ["to", "amount"]],
      ["challenge-form", "challenge:create", ["to", "bet"]],
    ];
    for (const [id, action, fields] of gameForms) {
      const form = document.getElementById(id);
      if (!form) continue;
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form));
        for (const field of ["bet", "mineCount", "amount"]) {
          if (values[field] !== undefined) values[field] = Number(values[field]);
        }
        submitGameAction(action, Object.fromEntries(fields.map((field) => [field, values[field]])), form.querySelector('button[type="submit"]'));
      });
    }
    const displayNameForm = document.getElementById("display-name-form");
    if (displayNameForm) displayNameForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = displayNameForm.elements.namedItem("displayName");
      const error = document.getElementById("display-name-error");
      const submit = displayNameForm.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        applyRemoteState(await apiRequest("/api/profile", {
          method: "PUT",
          body: JSON.stringify({ displayName: input.value }),
        }));
        render();
        notify("Display name updated.");
      } catch (requestError) {
        error.textContent = requestError.message || "Could not update your display name.";
      } finally {
        if (submit.isConnected) submit.disabled = false;
      }
    });
    const pictureInput = document.getElementById("profile-picture-input");
    if (pictureInput) pictureInput.addEventListener("change", uploadProfilePicture);
    const groupMessageForm = document.getElementById("group-message-form");
    if (groupMessageForm) {
      const input = document.getElementById("group-message-input");
      const stopTyping = bindTypingInput(input, `group:${selectedGroup}`);
      input.addEventListener("input", () => {
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          groupMessageForm.requestSubmit();
        }
      });
      groupMessageForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        stopTyping();
        const text = input.value.trim();
        const groupId = selectedGroup;
        if (!text || !groupId) return;
        input.disabled = true;
        try {
          const result = await apiRequest(`/api/groups/${encodeURIComponent(groupId)}/messages`, {
            method: "POST",
            body: JSON.stringify({ text }),
          });
          store.groups[groupId]?.messages.push(result.message);
          render();
          document.getElementById("group-message-input")?.focus();
        } catch (error) {
          notify(error.message || "Could not send group message.");
          input.disabled = false;
          input.focus();
        }
      });
    }
    const themeSelect = document.getElementById("theme-select");
    if (themeSelect) themeSelect.addEventListener("change", (event) => {
      store.settings.theme = event.target.value;
      persist();
      render();
    });
    const compactSelect = document.getElementById("compact-select");
    if (compactSelect) compactSelect.addEventListener("change", (event) => {
      store.settings.compact = event.target.checked;
      persist();
      render();
    });
  }

  async function acceptRequest(username) {
    try {
      applyRemoteState(await apiRequest(`/api/friend-requests/${encodeURIComponent(username)}/accept`, { method: "POST" }));
      notify(`You and @${username} are friends.`);
      render();
    } catch (error) {
      notify(error.message || "Could not accept friend request.");
    }
  }

  async function ignoreRequest(username) {
    try {
      applyRemoteState(await apiRequest(`/api/friend-requests/${encodeURIComponent(username)}/ignore`, { method: "POST" }));
      render();
    } catch (error) {
      notify(error.message || "Could not ignore friend request.");
    }
  }

  async function uploadProfilePicture(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      notify("Choose a JPEG, PNG, or WebP image smaller than 10 MB.");
      input.value = "";
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 40000000) {
        bitmap.close();
        notify("That image is too large to use as a profile picture.");
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const side = Math.min(bitmap.width, bitmap.height);
      const left = (bitmap.width - side) / 2;
      const top = (bitmap.height - side) / 2;
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, left, top, side, side, 0, 0, 256, 256);
      bitmap.close();

      let blob;
      for (const quality of [0.86, 0.72, 0.58]) {
        blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= 256 * 1024) break;
      }
      if (!blob || blob.size > 256 * 1024) {
        notify("That picture could not be compressed small enough. Try another image.");
        return;
      }
      const state = await apiRequest("/api/avatar", {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      applyRemoteState(state);
      render();
      notify("Profile picture updated.");
    } catch (error) {
      console.error("Could not update profile picture:", error);
      notify(error.message || "Could not update profile picture.");
    } finally {
      input.value = "";
    }
  }

  async function removeProfilePicture() {
    try {
      applyRemoteState(await apiRequest("/api/avatar", { method: "DELETE" }));
      render();
      notify("Profile picture removed.");
    } catch (error) {
      console.error("Could not remove profile picture:", error);
      notify(error.message || "Could not remove profile picture.");
    }
  }

  function insertEmoji() {
    const input = document.getElementById("message-input");
    if (!input) return;
    input.value += " 🙂";
    input.focus();
    input.dispatchEvent(new Event("input"));
  }

  function scrollMessages() {
    const area = document.getElementById("message-area");
    if (area) area.scrollTop = area.scrollHeight;
  }

  render();
  apiRequest("/api/session").then((state) => {
    applyRemoteState(state);
    connectRealtime();
    render();
  }).catch((error) => {
    if (error.status !== 401) {
      console.error("Could not restore Hypercall session:", error);
      notify("Could not connect to Hypercall server.");
    }
    resetGameState();
    store.users = {};
    store.session = null;
    renderAuth();
  });
})();
