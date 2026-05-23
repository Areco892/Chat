const messagesEl = document.querySelector("#messages");
const messageForm = document.querySelector("#messageForm");
const messageInput = document.querySelector("#messageInput");
const nameInput = document.querySelector("#nameInput");
const statusEl = document.querySelector("#connectionStatus");
const userListEl = document.querySelector("#userList");
const userCountEl = document.querySelector("#userCount");

let socket;
let currentUser = null;
let serverUrlPromise = null;

connect();
showEmptyState();

messageForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();
  if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify({ type: "message", text }));
  messageInput.value = "";
  messageInput.focus();
});

nameInput.addEventListener("change", () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "rename", name: nameInput.value }));
});

async function connect() {
  const webSocketUrl = await getWebSocketUrl();
  socket = new WebSocket(webSocketUrl);

  setStatus("Connecting", "connecting");

  socket.addEventListener("open", () => {
    setStatus("Connected", "connected");
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "welcome") {
      currentUser = data.user;
      nameInput.value = currentUser.name;
      renderUsers(data.users);
      clearMessages();
      data.history.forEach(renderMessage);
      showEmptyState();
      return;
    }

    if (data.type === "message") {
      renderMessage(data);
      return;
    }

    if (data.type === "presence") {
      renderPresence(data.text);
      renderUsers(data.users);
      return;
    }

    if (data.type === "users") {
      renderUsers(data.users);
    }
  });

  socket.addEventListener("close", () => {
    setStatus("Offline", "offline");
    renderPresence("Connection lost. Reconnecting soon.");
    window.setTimeout(connect, 1600);
  });
}

async function getWebSocketUrl() {
  if (!serverUrlPromise) {
    serverUrlPromise = loadWebSocketUrl();
  }

  return serverUrlPromise;
}

async function loadWebSocketUrl() {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });

    if (response.ok) {
      const config = await response.json();
      const webSocketUrl = toWebSocketUrl(config.chatServerUrl);

      if (webSocketUrl) return webSocketUrl;
    }
  } catch {
    // Static/local development can still use the current host fallback.
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}`;
}

function toWebSocketUrl(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl);

    if (url.protocol === "https:") url.protocol = "wss:";
    if (url.protocol === "http:") url.protocol = "ws:";

    return url.toString();
  } catch {
    return "";
  }
}

function renderMessage(message) {
  removeEmptyState();

  const item = document.createElement("article");
  item.className = "message";

  if (currentUser && message.user.id === currentUser.id) {
    item.classList.add("mine");
  }

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const name = document.createElement("span");
  name.className = "message-name";
  name.style.color = message.user.color;
  name.textContent = message.user.name;

  const time = document.createElement("time");
  time.dateTime = message.sentAt;
  time.textContent = formatTime(message.sentAt);

  const text = document.createElement("div");
  text.className = "message-text";
  text.textContent = message.text;

  meta.append(name, time);
  item.append(meta, text);
  messagesEl.append(item);
  scrollToBottom();
}

function renderPresence(text) {
  removeEmptyState();

  const item = document.createElement("div");
  item.className = "presence";
  item.textContent = text;
  messagesEl.append(item);
  scrollToBottom();
}

function renderUsers(users) {
  userListEl.replaceChildren();
  userCountEl.textContent = users.length;

  users.forEach((user) => {
    const item = document.createElement("li");

    const dot = document.createElement("span");
    dot.className = "user-dot";
    dot.style.background = user.color;

    const name = document.createElement("span");
    name.className = "user-name";
    name.textContent = user.name;

    item.append(dot, name);
    userListEl.append(item);
  });
}

function setStatus(text, state) {
  statusEl.textContent = text;
  statusEl.className = `status-pill ${state}`;
}

function clearMessages() {
  messagesEl.replaceChildren();
}

function showEmptyState() {
  if (messagesEl.children.length > 0) return;

  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = "No messages yet. Start the room with something simple.";
  messagesEl.append(empty);
}

function removeEmptyState() {
  const empty = messagesEl.querySelector(".empty-state");
  if (empty) empty.remove();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function formatTime(value) {
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
