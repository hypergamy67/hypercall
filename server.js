"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { WebSocketServer, WebSocket } = require("ws");

const ROOT = __dirname;
const DATA_DIR = process.env.HYPERGAMY_DATA_DIR
  ? path.resolve(process.env.HYPERGAMY_DATA_DIR)
  : path.join(ROOT, "data");
const PORT = Number(process.env.PORT) || 4173;
const SESSION_DAYS = 30;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_AVATAR_BYTES = 256 * 1024;
const MAX_SOCKET_BYTES = 32 * 1024;
const SESSION_COOKIE = "hypergamy_session";
const USERNAME_PATTERN = /^[a-z0-9_]{2,24}$/;
const SHOP_ITEMS = [
  { id: "ocean", name: "Deep Ocean", kind: "theme", price: 1800, description: "Cool blue panels and a bright aqua accent." },
  { id: "amethyst", name: "Amethyst", kind: "theme", price: 2200, description: "A rich violet palette with soft lavender highlights." },
  { id: "sunset", name: "Solar Flare", kind: "theme", price: 2000, description: "Warm sunset colors with a golden glow." },
  { id: "aurora", name: "Aurora", kind: "effect", price: 2400, description: "A drifting, colorful glow in your chat space." },
  { id: "stardust", name: "Stardust", kind: "effect", price: 1600, description: "A subtle field of twinkling stars." },
];
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};

fs.mkdirSync(DATA_DIR, { recursive: true });
const database = new DatabaseSync(path.join(DATA_DIR, "hypergamy.sqlite"));
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    display_name TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS friend_requests (
    from_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    to_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (from_username, to_username),
    CHECK (from_username <> to_username)
  );
  CREATE TABLE IF NOT EXISTS friendships (
    user_a TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    user_b TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_a, user_b),
    CHECK (user_a < user_b)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    recipient TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_conversation_idx
    ON messages(sender, recipient, id);
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 32),
    owner_username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, username)
  );
  CREATE TABLE IF NOT EXISTS group_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    sender TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS group_messages_conversation_idx
    ON group_messages(group_id, id);
  CREATE TABLE IF NOT EXISTS game_sessions (
    username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
    game_type TEXT NOT NULL,
    state_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS game_challenges (
    id TEXT PRIMARY KEY,
    challenger TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    opponent TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    bet INTEGER NOT NULL CHECK (bet > 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
    winner TEXT REFERENCES users(username) ON DELETE SET NULL,
    outcome TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_cosmetics (
    username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
    owned_json TEXT NOT NULL DEFAULT '[]',
    equipped_theme TEXT,
    equipped_effect TEXT
  );
`);
const userColumns = new Set(database.prepare("PRAGMA table_info(users)").all().map((column) => column.name));
if (!userColumns.has("avatar_data")) database.exec("ALTER TABLE users ADD COLUMN avatar_data BLOB");
if (!userColumns.has("avatar_mime")) database.exec("ALTER TABLE users ADD COLUMN avatar_mime TEXT");
if (!userColumns.has("display_name")) database.exec("ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''");
if (!userColumns.has("game_balance")) database.exec("ALTER TABLE users ADD COLUMN game_balance INTEGER NOT NULL DEFAULT 10000");

const peerSockets = new Map();
const activeCalls = new Map();
const loginAttempts = new Map();
const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_SOCKET_BYTES });

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getCookie(request, name) {
  const cookies = request.headers.cookie || "";
  const item = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!item) return "";
  try {
    return decodeURIComponent(item.slice(name.length + 1));
  } catch {
    return "";
  }
}

function makeSessionCookie(token, request) {
  const secure = request.headers["x-forwarded-proto"] === "https";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(request) {
  const secure = request.headers["x-forwarded-proto"] === "https";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
}

function json(response, status, value, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  response.end(JSON.stringify(value));
}

function fail(response, status, message) {
  json(response, status, { error: message });
}

function checkOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid JSON object.");
    return body;
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

async function readAvatar(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_AVATAR_BYTES) {
      const error = new Error("Profile pictures must be 256 KB or smaller.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const image = Buffer.concat(chunks);
  if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "image/jpeg"
    || image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) {
    const error = new Error("Choose a valid JPEG profile picture.");
    error.status = 400;
    throw error;
  }
  return image;
}

function getUserForRequest(request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const now = Date.now();
  const session = database.prepare(
    "SELECT username FROM sessions WHERE token_hash = ? AND expires_at > ?",
  ).get(hashToken(token), now);
  if (!session) {
    database.prepare("DELETE FROM sessions WHERE token_hash = ? OR expires_at <= ?").run(hashToken(token), now);
    return null;
  }
  return session.username;
}

function createSession(username, request, response) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_DAYS * 86400000;
  database.prepare("INSERT INTO sessions (token_hash, username, expires_at) VALUES (?, ?, ?)")
    .run(hashToken(token), username, expiresAt);
  response.setHeader("Set-Cookie", makeSessionCookie(token, request));
}

function userExists(username) {
  return Boolean(database.prepare("SELECT 1 FROM users WHERE username = ?").get(username));
}

function orderedPair(first, second) {
  return first < second ? [first, second] : [second, first];
}

function areFriends(first, second) {
  const [userA, userB] = orderedPair(first, second);
  return Boolean(database.prepare(
    "SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ?",
  ).get(userA, userB));
}

function canViewAvatar(viewer, target) {
  if (viewer === target || areFriends(viewer, target)) return true;
  return Boolean(database.prepare(`
    SELECT 1 FROM group_members AS viewer_group
    JOIN group_members AS target_group ON target_group.group_id = viewer_group.group_id
    WHERE viewer_group.username = ? AND target_group.username = ?
  `).get(viewer, target));
}

function userState(username) {
  const friends = database.prepare(`
    SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS username
    FROM friendships WHERE user_a = ? OR user_b = ? ORDER BY username
  `).all(username, username, username).map((row) => row.username);
  const incoming = database.prepare(
    "SELECT from_username AS username FROM friend_requests WHERE to_username = ? ORDER BY created_at",
  ).all(username).map((row) => row.username);
  const outgoing = database.prepare(
    "SELECT to_username AS username FROM friend_requests WHERE from_username = ? ORDER BY created_at",
  ).all(username).map((row) => row.username);
  const groupPeople = database.prepare(`
    SELECT DISTINCT other.username
    FROM group_members AS own
    JOIN group_members AS other ON other.group_id = own.group_id
    WHERE own.username = ?
  `).all(username).map((row) => row.username);
  const people = [...new Set([username, ...friends, ...incoming, ...outgoing, ...groupPeople])];
  const messages = database.prepare(`
    SELECT sender AS "from", recipient AS "to", text, created_at AS time
    FROM messages
    WHERE (sender = ? OR recipient = ?)
      AND (sender IN (${people.map(() => "?").join(",")}) OR recipient IN (${people.map(() => "?").join(",")}))
    ORDER BY id
  `).all(username, username, ...people, ...people);
  const groups = database.prepare(`
    SELECT groups.id, groups.name, groups.owner_username AS owner
    FROM groups
    JOIN group_members ON group_members.group_id = groups.id
    WHERE group_members.username = ?
    ORDER BY groups.created_at, groups.id
  `).all(username);
  for (const group of groups) {
    group.members = database.prepare(`
      SELECT username FROM group_members WHERE group_id = ? ORDER BY joined_at, username
    `).all(group.id).map((member) => member.username);
  }
  const groupMessages = database.prepare(`
    SELECT group_messages.id, group_messages.group_id AS groupId,
      group_messages.sender AS "from", group_messages.text, group_messages.created_at AS time
    FROM group_messages
    JOIN group_members ON group_members.group_id = group_messages.group_id
    WHERE group_members.username = ?
    ORDER BY group_messages.id
  `).all(username);
  const profiles = database.prepare(`
    SELECT username, display_name AS displayName, avatar_data IS NOT NULL AS hasAvatar
    FROM users WHERE username IN (${people.map(() => "?").join(",")})
  `).all(...people);
  const profileByUser = new Map(profiles.map((profile) => [profile.username, profile]));
  const userProfile = profileByUser.get(username);
  return {
    user: {
      username,
      displayName: userProfile.displayName || username,
      hasAvatar: Boolean(userProfile.hasAvatar),
      friends,
      incoming,
      outgoing,
      joinedAt: database.prepare("SELECT joined_at FROM users WHERE username = ?").get(username).joined_at,
      messages: {},
    },
    people: people.map((name) => {
      const profile = profileByUser.get(name);
      return { username: name, displayName: profile.displayName || name, hasAvatar: Boolean(profile.hasAvatar) };
    }),
    cosmetics: cosmeticsSnapshot(username),
    messages: messages.map((message) => ({ ...message, time: Number(message.time) })),
    groups,
    groupMessages: groupMessages.map((message) => ({ ...message, id: Number(message.id), time: Number(message.time) })),
  };
}

function rateLimit(request) {
  const key = request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter((time) => now - time < 10 * 60 * 1000);
  if (recent.length >= 30) return false;
  recent.push(now);
  loginAttempts.set(key, recent);
  return true;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function safeEqual(first, second) {
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sendToUser(username, message) {
  let delivered = 0;
  for (const socket of peerSockets.get(username) || []) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      delivered += 1;
    }
  }
  return delivered;
}

function refreshUserConnections(username) {
  const friends = database.prepare(`
    SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS username
    FROM friendships WHERE user_a = ? OR user_b = ?
  `).all(username, username, username);
  const groupMembers = database.prepare(`
    SELECT DISTINCT other.username
    FROM group_members AS own
    JOIN group_members AS other ON other.group_id = own.group_id
    WHERE own.username = ?
  `).all(username);
  for (const recipient of new Set([username, ...friends.map((friend) => friend.username), ...groupMembers.map((member) => member.username)])) {
    sendToUser(recipient, { type: "state:refresh" });
  }
}

function sendSocketError(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "error", message }));
}

function handleSocketMessage(username, socket, data) {
  let message;
  try {
    message = JSON.parse(data.toString("utf8"));
  } catch {
    sendSocketError(socket, "Invalid real-time message.");
    return;
  }
  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    sendSocketError(socket, "Invalid real-time message.");
    return;
  }

  if (message.type === "chat:message") {
    sendToUser(message.to, { type: "chat:refresh" });
    return;
  }
  if (message.type === "chat:typing") {
    if (typeof message.isTyping !== "boolean") {
      sendSocketError(socket, "Invalid typing status.");
      return;
    }
    if (typeof message.to === "string" && USERNAME_PATTERN.test(message.to)
      && message.to !== username && areFriends(username, message.to)) {
      sendToUser(message.to, { type: "chat:typing", from: username, to: message.to, isTyping: message.isTyping });
      return;
    }
    if (typeof message.groupId === "string" && /^[0-9a-f-]{36}$/.test(message.groupId)) {
      const membership = database.prepare(
        "SELECT 1 FROM group_members WHERE group_id = ? AND username = ?",
      ).get(message.groupId, username);
      if (!membership) {
        sendSocketError(socket, "You are not a member of that group.");
        return;
      }
      const members = database.prepare(
        "SELECT username FROM group_members WHERE group_id = ? AND username != ?",
      ).all(message.groupId, username);
      for (const member of members) {
        sendToUser(member.username, {
          type: "chat:typing",
          from: username,
          groupId: message.groupId,
          isTyping: message.isTyping,
        });
      }
      return;
    }
    sendSocketError(socket, "Choose a valid friend or group for typing status.");
    return;
  }
  if (message.type === "presence:refresh") {
    sendToUser(username, { type: "state:refresh" });
    return;
  }

  const callTypes = new Set([
    "call:invite", "call:accept", "call:reject", "call:offer", "call:answer", "call:ice", "call:end",
  ]);
  if (!callTypes.has(message.type)) {
    sendSocketError(socket, "Unsupported real-time message.");
    return;
  }
  const callId = typeof message.callId === "string" && /^[a-zA-Z0-9-]{16,80}$/.test(message.callId)
    ? message.callId
    : "";
  if (!callId) {
    sendSocketError(socket, "Invalid call identifier.");
    return;
  }
  let call = activeCalls.get(callId);
  if (message.type === "call:invite") {
    if (call) {
      sendSocketError(socket, "That call is already active.");
      return;
    }
    if (!["audio", "video"].includes(message.mediaType)) {
      sendSocketError(socket, "Unsupported call type.");
      return;
    }
    const invited = Array.isArray(message.participants) ? message.participants : [message.to];
    const participants = [...new Set(invited)];
    if (participants.length < 1 || participants.length > 5
      || participants.some((name) => typeof name !== "string" || !USERNAME_PATTERN.test(name)
        || name === username || !userExists(name) || !areFriends(username, name))) {
      sendSocketError(socket, "Choose between 1 and 5 of your friends for a call.");
      return;
    }
    const online = participants.filter((name) => peerSockets.has(name));
    if (!online.length) {
      sendSocketError(socket, "None of those friends are online right now.");
      return;
    }
    call = {
      initiator: username,
      participants: new Set([username, ...online]),
      accepted: new Set([username]),
      createdAt: Date.now(),
    };
    activeCalls.set(callId, call);
    for (const name of online) {
      sendToUser(name, {
        type: "call:invite",
        from: username,
        callId,
        mediaType: message.mediaType,
        members: [username, ...online],
      });
    }
    sendToUser(username, { type: "call:ringing", callId, members: [username, ...online] });
    return;
  } else {
    if (!call || !call.participants.has(username)) {
      sendSocketError(socket, "This call has ended or is no longer available.");
      return;
    }
    if (message.type === "call:accept" || message.type === "call:reject") {
      if (username === call.initiator || !call.participants.has(username)) {
        sendSocketError(socket, "There is no incoming call for this user.");
        return;
      }
      if (message.type === "call:accept") {
        if (call.accepted.has(username)) return;
        call.accepted.add(username);
        const existing = [...call.accepted].filter((member) => member !== username);
        for (const member of existing) {
          sendToUser(member, { type: "call:accept", from: username, to: member, callId });
          sendToUser(username, { type: "call:accept", from: member, to: username, callId });
        }
        return;
      }
      call.participants.delete(username);
      call.accepted.delete(username);
      for (const member of call.accepted) {
        sendToUser(member, { type: "call:reject", from: username, to: member, callId });
      }
      if (call.participants.size <= 1) activeCalls.delete(callId);
      return;
    }
    if (message.type === "call:end") {
      if (username === call.initiator) {
        activeCalls.delete(callId);
        for (const member of call.participants) {
          if (member !== username) sendToUser(member, { type: "call:end", from: username, to: member, callId, roomEnded: true });
        }
      } else {
        call.participants.delete(username);
        call.accepted.delete(username);
        for (const member of call.accepted) {
          sendToUser(member, { type: "call:end", from: username, to: member, callId, roomEnded: call.participants.size <= 1 });
        }
        if (call.participants.size <= 1) activeCalls.delete(callId);
      }
      return;
    }
    const target = typeof message.to === "string" ? message.to : "";
    if (!USERNAME_PATTERN.test(target) || target === username
      || !call.participants.has(target) || !call.accepted.has(username) || !call.accepted.has(target)) {
      sendSocketError(socket, "Calls can only connect people who accepted this call.");
      return;
    }
    if (message.type === "call:offer" && username >= target) {
      sendSocketError(socket, "Invalid call offer sender.");
      return;
    }
    if (message.type === "call:answer" && username <= target) {
      sendSocketError(socket, "Invalid call answer sender.");
      return;
    }
  }
  const payload = { type: message.type, from: username, to: message.to, callId };
  if (message.type === "call:offer" || message.type === "call:answer") {
    if (typeof message.description?.sdp !== "string" || message.description.sdp.length > 20000) {
      sendSocketError(socket, "Invalid call negotiation data.");
      return;
    }
    payload.description = message.description;
  }
  if (message.type === "call:ice") {
    if (typeof message.candidate?.candidate !== "string" || message.candidate.candidate.length > 4000) {
      sendSocketError(socket, "Invalid connection candidate.");
      return;
    }
    payload.candidate = message.candidate;
  }
  sendToUser(message.to, payload);
}

function gameBalance(username) {
  return database.prepare("SELECT game_balance FROM users WHERE username = ?").get(username).game_balance;
}

function cosmeticsSnapshot(username) {
  database.prepare("INSERT OR IGNORE INTO user_cosmetics (username) VALUES (?)").run(username);
  const row = database.prepare(
    "SELECT owned_json, equipped_theme, equipped_effect FROM user_cosmetics WHERE username = ?",
  ).get(username);
  return {
    items: SHOP_ITEMS,
    owned: JSON.parse(row.owned_json),
    theme: row.equipped_theme,
    effect: row.equipped_effect,
  };
}

function handleShopAction(body, username) {
  if (!["buy", "equip"].includes(body.action) || typeof body.itemId !== "string") {
    const error = new Error("Choose an item and a valid shop action.");
    error.status = 400;
    throw error;
  }
  const resetting = body.itemId === "default-theme" || body.itemId === "no-effect";
  const item = SHOP_ITEMS.find((entry) => entry.id === body.itemId);
  if (!resetting && !item) {
    const error = new Error("That shop item does not exist.");
    error.status = 404;
    throw error;
  }

  const owned = cosmeticsSnapshot(username).owned;
  if (body.action === "buy") {
    if (!item) {
      const error = new Error("That item cannot be purchased.");
      error.status = 400;
      throw error;
    }
    if (owned.includes(item.id)) {
      const error = new Error("You already own this item.");
      error.status = 409;
      throw error;
    }
    database.exec("BEGIN");
    try {
      const debit = database.prepare(
        "UPDATE users SET game_balance = game_balance - ? WHERE username = ? AND game_balance >= ?",
      ).run(item.price, username, item.price);
      if (debit.changes !== 1) {
        const error = new Error("You do not have enough credits for this item.");
        error.status = 400;
        throw error;
      }
      database.prepare("UPDATE user_cosmetics SET owned_json = ? WHERE username = ?")
        .run(JSON.stringify([...owned, item.id]), username);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return { result: `${item.name} added to your collection.` };
  }

  if (resetting) {
    const kind = body.itemId === "default-theme" ? "theme" : "effect";
    database.prepare(`UPDATE user_cosmetics SET equipped_${kind === "theme" ? "theme" : "effect"} = NULL WHERE username = ?`)
      .run(username);
  } else {
    if (!owned.includes(item.id)) {
      const error = new Error("Buy this item before equipping it.");
      error.status = 403;
      throw error;
    }
    database.prepare(`UPDATE user_cosmetics SET equipped_${item.kind === "theme" ? "theme" : "effect"} = ? WHERE username = ?`)
      .run(item.id, username);
  }
  return { result: resetting ? "Your appearance was reset." : `${item.name} equipped.` };
}

function activeGame(username) {
  const row = database.prepare(
    "SELECT game_type, state_json FROM game_sessions WHERE username = ?",
  ).get(username);
  return row ? { type: row.game_type, ...JSON.parse(row.state_json) } : null;
}

function saveGame(username, game) {
  if (!game) {
    database.prepare("DELETE FROM game_sessions WHERE username = ?").run(username);
    return;
  }
  const { type, ...state } = game;
  database.prepare(`
    INSERT INTO game_sessions (username, game_type, state_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      game_type = excluded.game_type,
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
  `).run(username, type, JSON.stringify(state), Date.now());
}

function gameSnapshot(username, result = "") {
  let game = activeGame(username);
  if (game?.type === "crash" && Date.now() >= game.startedAt + Math.log(game.crashAt) * 7000) {
    result = `Crashed at ${game.crashAt.toFixed(2)}× — bet lost.`;
    saveGame(username, null);
    game = null;
  }
  let visibleGame = null;
  if (game?.type === "mines") {
    visibleGame = {
      type: game.type,
      bet: game.bet,
      mineCount: game.mineCount,
      revealed: game.revealed,
      multiplier: minesMultiplier(game.mineCount, game.revealed.length),
    };
  } else if (game?.type === "blackjack") {
    visibleGame = {
      type: game.type,
      bet: game.bet,
      playerHand: game.playerHand,
      dealerHand: game.phase === "playing" ? [game.dealerHand[0]] : game.dealerHand,
      phase: game.phase,
    };
  } else if (game?.type === "crash") {
    visibleGame = { type: game.type, bet: game.bet, startedAt: game.startedAt };
  }
  const challenges = database.prepare(`
    SELECT id, challenger, opponent, bet, status, winner, outcome, created_at AS createdAt
    FROM game_challenges
    WHERE ((opponent = ? OR challenger = ?) AND status = 'pending' AND created_at >= ?)
      OR ((challenger = ? OR opponent = ?) AND status != 'pending' AND created_at >= ?)
    ORDER BY created_at DESC LIMIT 10
  `).all(username, username, Date.now() - 86400000, username, username, Date.now() - 86400000);
  return {
    balance: gameBalance(username),
    activeGame: visibleGame,
    result,
    challenges,
    shop: cosmeticsSnapshot(username),
  };
}

function minesMultiplier(mineCount, safePicks) {
  let probability = 1;
  for (let index = 0; index < safePicks; index += 1) {
    probability *= (25 - mineCount - index) / (25 - index);
  }
  return Math.floor((0.97 / probability) * 100) / 100;
}

function makeDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) {
      deck.push({ rank, suit });
    }
  }
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(index + 1);
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

function blackjackValue(hand) {
  let total = 0;
  let aces = 0;
  for (const { rank } of hand) {
    if (rank === "A") {
      total += 11;
      aces += 1;
    } else {
      total += ["J", "Q", "K"].includes(rank) ? 10 : Number(rank);
    }
  }
  while (total > 21 && aces) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function drawCard(game) {
  return game.deck.pop();
}

async function handleGameAction(request, response, username) {
  const body = await readJson(request);
  const action = body.action;
  const balance = gameBalance(username);
  if (typeof action !== "string") return fail(response, 400, "Choose a valid game action.");
  if (action === "challenge:create") {
    const target = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
    const bet = body.bet;
    if (!USERNAME_PATTERN.test(target) || target === username || !areFriends(username, target)) {
      return fail(response, 403, "You can only challenge a friend.");
    }
    if (!Number.isSafeInteger(bet) || bet < 1 || bet > 1000000 || bet > balance) {
      return fail(response, 400, "Enter a valid bet within your available balance.");
    }
    if (activeGame(username)) return fail(response, 409, "Finish your current game before challenging a friend.");
    const id = crypto.randomUUID();
    database.prepare(`
      INSERT INTO game_challenges (id, challenger, opponent, bet, status, created_at)
      VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(id, username, target, bet, Date.now());
    sendToUser(target, { type: "games:refresh" });
    return json(response, 201, { ...gameSnapshot(username), challengeId: id, result: `Coin-flip challenge sent to @${target}.` });
  }
  const challengeMatch = action.match(/^challenge:(accept|decline)$/);
  if (challengeMatch) {
    const id = typeof body.challengeId === "string" && /^[0-9a-f-]{36}$/.test(body.challengeId) ? body.challengeId : "";
    const challenge = id ? database.prepare(`
      SELECT id, challenger, opponent, bet, status, created_at
      FROM game_challenges WHERE id = ? AND opponent = ?
    `).get(id, username) : null;
    if (!challenge || challenge.status !== "pending" || activeGame(username)
      || Date.now() - challenge.created_at > 86400000) {
      return fail(response, 409, "That game challenge is no longer available.");
    }
    if (challengeMatch[1] === "decline") {
      database.prepare("UPDATE game_challenges SET status = 'declined' WHERE id = ? AND status = 'pending'").run(id);
      sendToUser(challenge.challenger, { type: "games:refresh" });
      return json(response, 200, { ...gameSnapshot(username), result: "Challenge declined." });
    }
    if (activeGame(challenge.challenger)) return fail(response, 409, "Your friend is still finishing another game.");
    if (gameBalance(challenge.challenger) < challenge.bet || gameBalance(username) < challenge.bet) {
      return fail(response, 400, "One player no longer has enough play credits for this bet.");
    }
    const outcome = crypto.randomInt(2) ? "heads" : "tails";
    const winner = outcome === "heads" ? challenge.challenger : username;
    database.exec("BEGIN");
    try {
      database.prepare("UPDATE users SET game_balance = game_balance - ? WHERE username IN (?, ?)")
        .run(challenge.bet, challenge.challenger, username);
      database.prepare("UPDATE users SET game_balance = game_balance + ? WHERE username = ?")
        .run(challenge.bet * 2, winner);
      database.prepare("UPDATE game_challenges SET status = 'accepted', winner = ?, outcome = ? WHERE id = ? AND status = 'pending'")
        .run(winner, outcome, id);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    sendToUser(challenge.challenger, { type: "games:refresh" });
    sendToUser(username, { type: "games:refresh" });
    const result = `${outcome === "heads" ? "Heads" : "Tails"} — ${winner === username ? "you won" : `@${challenge.challenger} won`} ${challenge.bet.toLocaleString()} credits from each player.`;
    return json(response, 200, { ...gameSnapshot(username, result), winner, outcome });
  }
  if (action === "trade") {
    const target = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
    const amount = body.amount;
    if (!USERNAME_PATTERN.test(target) || target === username || !areFriends(username, target)) {
      return fail(response, 403, "You can only trade play credits with a friend.");
    }
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) {
      return fail(response, 400, "Enter a whole-number amount from 1 to 1,000,000.");
    }
    if (amount > balance) return fail(response, 400, "You do not have enough play credits.");
    const targetBalance = gameBalance(target);
    if (targetBalance + amount > 1000000000) return fail(response, 400, "That trade would exceed the play-credit limit.");
    database.exec("BEGIN");
    try {
      database.prepare("UPDATE users SET game_balance = game_balance - ? WHERE username = ?").run(amount, username);
      database.prepare("UPDATE users SET game_balance = game_balance + ? WHERE username = ?").run(amount, target);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    sendToUser(username, { type: "games:refresh" });
    sendToUser(target, { type: "games:refresh" });
    return json(response, 200, { ...gameSnapshot(username), result: `Sent ${amount.toLocaleString()} play credits to @${target}.` });
  }

  if (action === "coinflip") {
    if (activeGame(username)) return fail(response, 409, "Finish your current game first.");
    const bet = body.bet;
    if (!Number.isSafeInteger(bet) || bet < 1 || bet > 1000000 || bet > balance) {
      return fail(response, 400, "Enter a valid bet within your available balance.");
    }
    if (!["heads", "tails"].includes(body.side)) return fail(response, 400, "Choose heads or tails.");
    const outcome = crypto.randomInt(2) ? "heads" : "tails";
    const won = body.side === outcome;
    const payout = won ? bet * 2 : 0;
    database.prepare("UPDATE users SET game_balance = game_balance - ? + ? WHERE username = ?")
      .run(bet, payout, username);
    return json(response, 200, {
      ...gameSnapshot(username),
      outcome,
      won,
      result: `${outcome === "heads" ? "Heads" : "Tails"} — ${won ? `you won ${payout.toLocaleString()} credits.` : "you lost your bet."}`,
    });
  }

  const current = activeGame(username);
  if (action.endsWith(":start")) {
    if (current) return fail(response, 409, "Finish your current game first.");
    const bet = body.bet;
    if (!Number.isSafeInteger(bet) || bet < 1 || bet > 1000000 || bet > balance) {
      return fail(response, 400, "Enter a valid bet within your available balance.");
    }
    if (action === "mines:start") {
      const mineCount = body.mineCount;
      if (!Number.isInteger(mineCount) || mineCount < 1 || mineCount > 24) {
        return fail(response, 400, "Choose between 1 and 24 mines.");
      }
      const mines = new Set();
      while (mines.size < mineCount) mines.add(crypto.randomInt(25));
      database.prepare("UPDATE users SET game_balance = game_balance - ? WHERE username = ?").run(bet, username);
      saveGame(username, { type: "mines", bet, mineCount, mines: [...mines], revealed: [] });
      return json(response, 200, { ...gameSnapshot(username), result: "Pick a safe tile, then cash out whenever you like." });
    }
    if (action === "blackjack:start") {
      const game = { type: "blackjack", bet, deck: makeDeck(), playerHand: [], dealerHand: [], phase: "playing" };
      game.playerHand.push(drawCard(game), drawCard(game));
      game.dealerHand.push(drawCard(game), drawCard(game));
      database.prepare("UPDATE users SET game_balance = game_balance - ? WHERE username = ?").run(bet, username);
      const playerNatural = blackjackValue(game.playerHand) === 21;
      const dealerNatural = blackjackValue(game.dealerHand) === 21;
      if (playerNatural || dealerNatural) {
        saveGame(username, null);
        const payout = playerNatural && dealerNatural ? bet : playerNatural ? Math.floor(bet * 2.5) : 0;
        if (payout) database.prepare("UPDATE users SET game_balance = game_balance + ? WHERE username = ?").run(payout, username);
        const result = playerNatural && dealerNatural ? "Both have blackjack — push." :
          playerNatural ? `Blackjack! You won ${payout.toLocaleString()} credits.` : "Dealer has blackjack — bet lost.";
        return json(response, 200, { ...gameSnapshot(username), result, dealerHand: game.dealerHand });
      }
      saveGame(username, game);
      return json(response, 200, { ...gameSnapshot(username), result: "" });
    }
    if (action === "crash:start") {
      const random = crypto.randomInt(1000000) / 1000000;
      const crashAt = Math.max(1.01, Math.min(100, Math.floor((0.99 / (1 - random)) * 100) / 100));
      database.prepare("UPDATE users SET game_balance = game_balance - ? WHERE username = ?").run(bet, username);
      saveGame(username, { type: "crash", bet, crashAt, startedAt: Date.now() });
      return json(response, 200, { ...gameSnapshot(username), result: "Cash out before the multiplier crashes." });
    }
    return fail(response, 400, "Unknown game.");
  }

  if (!current) return fail(response, 409, "You do not have an active game.");
  if (action === "mines:pick" && current.type === "mines") {
    const tile = body.tile;
    if (!Number.isInteger(tile) || tile < 0 || tile > 24 || current.revealed.includes(tile)) {
      return fail(response, 400, "Choose an unrevealed tile.");
    }
    if (current.mines.includes(tile)) {
      saveGame(username, null);
      const snapshot = gameSnapshot(username, `Mine! You lost ${current.bet.toLocaleString()} credits.`);
      snapshot.revealedTiles = [...current.revealed, tile];
      snapshot.mineHit = tile;
      return json(response, 200, snapshot);
    }
    current.revealed.push(tile);
    saveGame(username, current);
    return json(response, 200, {
      ...gameSnapshot(username, "Safe! Pick again or cash out."),
      revealedTiles: current.revealed,
      cashout: Math.floor(current.bet * minesMultiplier(current.mineCount, current.revealed.length)),
    });
  }
  if (action === "mines:cashout" && current.type === "mines") {
    if (!current.revealed.length) return fail(response, 400, "Reveal at least one safe tile before cashing out.");
    const payout = Math.floor(current.bet * minesMultiplier(current.mineCount, current.revealed.length));
    saveGame(username, null);
    database.prepare("UPDATE users SET game_balance = game_balance + ? WHERE username = ?").run(payout, username);
    return json(response, 200, { ...gameSnapshot(username, `Cashed out ${payout.toLocaleString()} credits.`), payout });
  }
  if ((action === "blackjack:hit" || action === "blackjack:stand") && current.type === "blackjack" && current.phase === "playing") {
    if (action === "blackjack:hit") {
      current.playerHand.push(drawCard(current));
      if (blackjackValue(current.playerHand) > 21) {
        saveGame(username, null);
        return json(response, 200, {
          ...gameSnapshot(username, "Bust — bet lost."),
          dealerHand: current.dealerHand,
          playerHand: current.playerHand,
        });
      }
      saveGame(username, current);
      return json(response, 200, { ...gameSnapshot(username), result: "" });
    }
    while (blackjackValue(current.dealerHand) < 17 && current.deck.length) current.dealerHand.push(drawCard(current));
    const playerTotal = blackjackValue(current.playerHand);
    const dealerTotal = blackjackValue(current.dealerHand);
    const payout = playerTotal > dealerTotal || dealerTotal > 21 ? current.bet * 2 : playerTotal === dealerTotal ? current.bet : 0;
    saveGame(username, null);
    if (payout) database.prepare("UPDATE users SET game_balance = game_balance + ? WHERE username = ?").run(payout, username);
    const result = payout > current.bet ? `You won ${payout.toLocaleString()} credits.` :
      payout ? "Push — your bet was returned." : "Dealer wins — bet lost.";
    return json(response, 200, {
      ...gameSnapshot(username, result),
      dealerHand: current.dealerHand,
      playerHand: current.playerHand,
    });
  }
  if (action === "crash:cashout" && current.type === "crash") {
    const elapsed = Date.now() - current.startedAt;
    const multiplier = Math.floor(Math.exp((elapsed / 1000) * (1 / 7)) * 100) / 100;
    const crashed = Date.now() >= current.startedAt + Math.log(current.crashAt) * 7000 || multiplier >= current.crashAt;
    saveGame(username, null);
    if (crashed) return json(response, 200, { ...gameSnapshot(username, `Crashed at ${current.crashAt.toFixed(2)}× — bet lost.`), crashed: true });
    const payout = Math.floor(current.bet * multiplier);
    database.prepare("UPDATE users SET game_balance = game_balance + ? WHERE username = ?").run(payout, username);
    return json(response, 200, {
      ...gameSnapshot(username, `Cashed out at ${multiplier.toFixed(2)}× — won ${payout.toLocaleString()} credits.`),
      payout,
      multiplier,
    });
  }
  return fail(response, 409, "That action does not match your active game.");
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;
  const method = request.method;

  if (method === "POST" && (pathname === "/api/signup" || pathname === "/api/signin")) {
    if (!rateLimit(request)) return fail(response, 429, "Too many sign-in attempts. Try again later.");
    const body = await readJson(request);
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!USERNAME_PATTERN.test(username)) return fail(response, 400, "Use 2–24 letters, numbers, or underscores.");
    if (password.length < 8 || password.length > 128) return fail(response, 400, "Password keys must be 8–128 characters.");

    if (pathname === "/api/signup") {
      if (userExists(username)) return fail(response, 409, "User already exists. Try another username.");
      const salt = crypto.randomBytes(16);
      const passwordHash = hashPassword(password, salt);
      database.prepare(
        "INSERT INTO users (username, password_salt, password_hash, joined_at) VALUES (?, ?, ?, ?)",
      ).run(username, salt.toString("base64"), passwordHash.toString("hex"), Date.now());
    } else {
      const user = database.prepare(
        "SELECT password_salt, password_hash FROM users WHERE username = ?",
      ).get(username);
      if (!user || !safeEqual(hashPassword(password, Buffer.from(user.password_salt, "base64")).toString("hex"), user.password_hash)) {
        return fail(response, 401, "Username or password key is incorrect.");
      }
    }

    createSession(username, request, response);
    return json(response, pathname === "/api/signup" ? 201 : 200, userState(username));
  }

  const username = getUserForRequest(request);
  if (pathname === "/api/session" && method === "DELETE") {
    const token = getCookie(request, SESSION_COOKIE);
    if (token) database.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    response.setHeader("Set-Cookie", clearSessionCookie(request));
    return json(response, 200, { ok: true });
  }
  if (!username) return fail(response, 401, "Sign in to continue.");

  if (pathname === "/api/games" && method === "GET") return json(response, 200, gameSnapshot(username));
  if (pathname === "/api/games/action" && method === "POST") {
    try {
      await handleGameAction(request, response, username);
    } catch (error) {
      console.error("Hypercall game action failed:", error);
      if (!response.headersSent) fail(response, error.status || 500, error.status ? error.message : "The game action could not be completed.");
      else response.destroy();
    }
    return;
  }
  if (pathname === "/api/shop/action" && method === "POST") {
    try {
      const body = await readJson(request);
      const result = handleShopAction(body, username);
      sendToUser(username, { type: "games:refresh" });
      return json(response, 200, { ...gameSnapshot(username, result.result), result: result.result });
    } catch (error) {
      console.error("Hypercall shop action failed:", error);
      return fail(response, error.status || 500, error.status ? error.message : "The shop action could not be completed.");
    }
  }

  if (pathname === "/api/profile" && method === "PUT") {
    const body = await readJson(request);
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName || displayName.length > 32 || /[\u0000-\u001f\u007f]/.test(displayName)) {
      return fail(response, 400, "Display names must be 1–32 characters and cannot contain control characters.");
    }
    database.prepare("UPDATE users SET display_name = ? WHERE username = ?").run(displayName, username);
    refreshUserConnections(username);
    return json(response, 200, userState(username));
  }

  const avatarMatch = pathname.match(/^\/api\/avatar\/([a-z0-9_]{2,24})$/);
  if (avatarMatch && method === "GET") {
    const target = avatarMatch[1];
    if (!canViewAvatar(username, target)) return fail(response, 403, "You cannot view this profile picture.");
    const picture = database.prepare(
      "SELECT avatar_data, avatar_mime FROM users WHERE username = ?",
    ).get(target);
    if (!picture?.avatar_data) return fail(response, 404, "No profile picture is set.");
    response.writeHead(200, {
      "Content-Type": picture.avatar_mime,
      "Content-Length": picture.avatar_data.length,
      "Cache-Control": "private, no-store",
    });
    response.end(picture.avatar_data);
    return;
  }
  if (pathname === "/api/avatar" && method === "PUT") {
    const image = await readAvatar(request);
    database.prepare("UPDATE users SET avatar_data = ?, avatar_mime = 'image/jpeg' WHERE username = ?")
      .run(image, username);
    refreshUserConnections(username);
    return json(response, 200, userState(username));
  }
  if (pathname === "/api/avatar" && method === "DELETE") {
    database.prepare("UPDATE users SET avatar_data = NULL, avatar_mime = NULL WHERE username = ?")
      .run(username);
    refreshUserConnections(username);
    return json(response, 200, userState(username));
  }
  if (pathname === "/api/session" && method === "GET") return json(response, 200, userState(username));
  if (pathname === "/api/groups" && method === "POST") {
    const body = await readJson(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const members = Array.isArray(body.members) ? [...new Set(body.members)] : [];
    if (!name || name.length > 32) return fail(response, 400, "Group names must be 1–32 characters.");
    if (members.length < 1 || members.length > 19
      || members.some((member) => typeof member !== "string" || !USERNAME_PATTERN.test(member)
        || member === username || !areFriends(username, member))) {
      return fail(response, 400, "Choose 1–19 of your friends for the group.");
    }

    const groupId = crypto.randomUUID();
    const createdAt = Date.now();
    database.exec("BEGIN");
    try {
      database.prepare(
        "INSERT INTO groups (id, name, owner_username, created_at) VALUES (?, ?, ?, ?)",
      ).run(groupId, name, username, createdAt);
      const addMember = database.prepare(
        "INSERT INTO group_members (group_id, username, joined_at) VALUES (?, ?, ?)",
      );
      addMember.run(groupId, username, createdAt);
      for (const member of members) addMember.run(groupId, member, createdAt);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    for (const member of [username, ...members]) sendToUser(member, { type: "state:refresh" });
    return json(response, 201, { ...userState(username), createdGroupId: groupId });
  }
  const groupMessageMatch = pathname.match(/^\/api\/groups\/([0-9a-f-]{36})\/messages$/);
  if (groupMessageMatch && method === "POST") {
    const groupId = groupMessageMatch[1];
    const membership = database.prepare(
      "SELECT 1 FROM group_members WHERE group_id = ? AND username = ?",
    ).get(groupId, username);
    if (!membership) return fail(response, 403, "You are not a member of this group.");
    const body = await readJson(request);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 2000) return fail(response, 400, "Messages must be 1–2000 characters.");
    const createdAt = Date.now();
    const result = database.prepare(
      "INSERT INTO group_messages (group_id, sender, text, created_at) VALUES (?, ?, ?, ?)",
    ).run(groupId, username, text, createdAt);
    const message = {
      id: Number(result.lastInsertRowid),
      groupId,
      from: username,
      text,
      time: createdAt,
    };
    const members = database.prepare(
      "SELECT username FROM group_members WHERE group_id = ?",
    ).all(groupId);
    for (const member of members) sendToUser(member.username, { type: "state:refresh" });
    return json(response, 201, { message });
  }
  if (pathname === "/api/friend-requests" && method === "POST") {
    const body = await readJson(request);
    const target = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    if (!USERNAME_PATTERN.test(target)) return fail(response, 400, "Enter a valid username.");
    if (target === username) return fail(response, 400, "You cannot add yourself.");
    if (!userExists(target)) return fail(response, 404, "No account has that username.");
    if (areFriends(username, target)) return fail(response, 409, "You are already friends.");
    const existing = database.prepare(
      "SELECT from_username FROM friend_requests WHERE (from_username = ? AND to_username = ?) OR (from_username = ? AND to_username = ?)",
    ).get(username, target, target, username);
    if (existing?.from_username === target) {
      const [userA, userB] = orderedPair(username, target);
      database.prepare("DELETE FROM friend_requests WHERE (from_username = ? AND to_username = ?) OR (from_username = ? AND to_username = ?)")
        .run(username, target, target, username);
      database.prepare("INSERT INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)")
        .run(userA, userB, Date.now());
      sendToUser(target, { type: "state:refresh" });
      return json(response, 200, userState(username));
    }
    if (existing) return fail(response, 409, "A friend request is already pending.");
    database.prepare("INSERT INTO friend_requests (from_username, to_username, created_at) VALUES (?, ?, ?)")
      .run(username, target, Date.now());
    sendToUser(target, { type: "state:refresh" });
    return json(response, 201, userState(username));
  }

  const requestMatch = pathname.match(/^\/api\/friend-requests\/([a-z0-9_]{2,24})\/(accept|ignore)$/);
  if (requestMatch && method === "POST") {
    const sender = requestMatch[1];
    const action = requestMatch[2];
    const requestExists = database.prepare(
      "SELECT 1 FROM friend_requests WHERE from_username = ? AND to_username = ?",
    ).get(sender, username);
    if (!requestExists) return fail(response, 404, "Friend request not found.");
    database.prepare("DELETE FROM friend_requests WHERE from_username = ? AND to_username = ?")
      .run(sender, username);
    if (action === "accept") {
      const [userA, userB] = orderedPair(username, sender);
      database.prepare("INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)")
        .run(userA, userB, Date.now());
    }
    sendToUser(sender, { type: "state:refresh" });
    return json(response, 200, userState(username));
  }

  if (pathname === "/api/messages" && method === "GET") {
    const other = (url.searchParams.get("with") || "").trim().toLowerCase();
    if (!USERNAME_PATTERN.test(other) || !areFriends(username, other)) {
      return fail(response, 403, "You can only view conversations with friends.");
    }
    const messages = database.prepare(`
      SELECT sender AS "from", recipient AS "to", text, created_at AS time
      FROM messages
      WHERE (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?)
      ORDER BY id
    `).all(username, other, other, username);
    return json(response, 200, { messages: messages.map((message) => ({ ...message, time: Number(message.time) })) });
  }

  if (pathname === "/api/messages" && method === "POST") {
    const body = await readJson(request);
    const target = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!USERNAME_PATTERN.test(target) || !areFriends(username, target)) {
      return fail(response, 403, "You can only message friends.");
    }
    if (!text || text.length > 2000) return fail(response, 400, "Messages must be 1–2000 characters.");
    const createdAt = Date.now();
    const result = database.prepare(
      "INSERT INTO messages (sender, recipient, text, created_at) VALUES (?, ?, ?, ?)",
    ).run(username, target, text, createdAt);
    const message = { id: Number(result.lastInsertRowid), from: username, to: target, text, time: createdAt };
    sendToUser(target, { type: "chat:refresh", from: username });
    return json(response, 201, { message });
  }

  return fail(response, 404, "API route not found.");
}

const server = http.createServer(async (request, response) => {
  setSecurityHeaders(response);
  if (!checkOrigin(request)) return fail(response, 403, "Cross-site requests are not allowed.");
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    try {
      await handleApi(request, response, url);
    } catch (error) {
      console.error("Hypercall API error:", error);
      if (!response.headersSent) fail(response, error.status || 500, error.status ? error.message : "The request could not be completed.");
      else response.destroy();
    }
    return;
  }

  const files = new Map([["/", "index.html"], ["/index.html", "index.html"], ["/app.js", "app.js"], ["/styles.css", "styles.css"], ["/hyperanruf-logo.png", "hyperanruf-logo.png"]]);
  const filename = files.get(url.pathname);
  if (!filename || request.method !== "GET") return fail(response, filename ? 405 : 404, "Not found.");
  fs.readFile(path.join(ROOT, filename), (error, content) => {
    if (error) {
      console.error(`Could not read ${filename}:`, error);
      return fail(response, 500, "Could not load the app.");
    }
    response.writeHead(200, {
      "Content-Type": types[path.extname(filename)],
      "Cache-Control": "no-store",
    });
    response.end(content);
  });
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const username = getUserForRequest(request);
  if (url.pathname !== "/realtime" || !username || !checkOrigin(request)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
    webSocketServer.emit("connection", webSocket, request, username);
  });
});

webSocketServer.on("connection", (socket, _request, username) => {
  if (!peerSockets.has(username)) peerSockets.set(username, new Set());
  peerSockets.get(username).add(socket);
  socket.send(JSON.stringify({ type: "connected" }));
  socket.on("message", (data) => handleSocketMessage(username, socket, data));
  socket.on("error", (error) => console.error("Hypercall WebSocket error:", error.message));
  socket.on("close", () => {
    const sockets = peerSockets.get(username);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) peerSockets.delete(username);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Hypercall is running on port ${PORT}.`);
  console.log(`Chat data is stored locally in ${path.join(DATA_DIR, "hypergamy.sqlite")}`);
});

function shutdown() {
  webSocketServer.close();
  server.close(() => {
    database.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
