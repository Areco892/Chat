const http = require("http");
const WebSocket = require("ws");
const db = require("./db");
const room = require("./roomManager");

const port = process.env.PORT || 3000;
let chatRoomId = null;

const server = http.createServer((request, response) => {
  if (request.url === "/" || request.url === "/health") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8"
    });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  response.writeHead(404, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify({ error: "Not found" }));
});

const wss = new WebSocket.Server({ server });

wss.on("connection", async (socket, request) => {
  const user = room.addClient(socket);
  const history = await getHistory();
  const clientId = getClientId(request);

  if (db.isEnabled() && clientId) {
    try {
      const storedUser = await db.getOrCreateGuestUser(user, clientId);
      user.dbId = storedUser.id;
      user.id = storedUser.id;
      user.name = storedUser.name;
      user.color = storedUser.color;
    } catch (error) {
      console.error("Failed to create chat user:", error);
    }
  }

  send(socket, {
    type: "welcome",
    user,
    history,
    users: room.getUsers()
  });

  broadcastPresence(`${user.name} joined`);

  socket.on("message", async (rawMessage) => {
    let data;

    try {
      data = JSON.parse(rawMessage);
    } catch {
      return;
    }

    if (data.type === "rename") {
      const updatedUser = room.renameUser(socket, data.name);
      if (updatedUser) {
        updateStoredUserName(updatedUser);
        broadcastPresence(`${updatedUser.name} is here`);
        broadcastUsers();
      }
      return;
    }

    if (data.type === "message") {
      const currentUser = room.getUser(socket);
      const text = sanitizeMessage(data.text);

      if (!currentUser || !text) return;

      const message = await createMessage(currentUser, text);

      room.addMessage(message);
      broadcast(message);
    }
  });

  socket.on("close", () => {
    const departedUser = room.removeClient(socket);
    if (departedUser) {
      broadcastPresence(`${departedUser.name} left`);
      broadcastUsers();
    }
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use.`);
    console.error(`Stop the other server or start this app with another port, for example:`);
    console.error(`$env:PORT=3001; npm start`);
    process.exit(1);
  }

  throw error;
});

initializeDatabase().finally(() => {
  server.listen(port, () => {
    console.log(`Chat server running at http://localhost:${port}`);
  });
});

function broadcast(message) {
  const encoded = JSON.stringify(message);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(encoded);
    }
  });
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function broadcastPresence(text) {
  broadcast({
    type: "presence",
    text,
    users: room.getUsers(),
    count: room.getClientCount(),
    sentAt: new Date().toISOString()
  });
}

function broadcastUsers() {
  broadcast({
    type: "users",
    users: room.getUsers(),
    count: room.getClientCount()
  });
}

function sanitizeMessage(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function getClientId(request) {
  try {
    const url = new URL(request.url, "ws://localhost");
    return sanitizeClientId(url.searchParams.get("clientId"));
  } catch {
    return "";
  }
}

function sanitizeClientId(value) {
  return String(value || "")
    .trim()
    .slice(0, 100);
}

async function initializeDatabase() {
  if (!db.isEnabled()) {
    console.log("DATABASE_URL is not set. Message history will use memory only.");
    return;
  }

  try {
    chatRoomId = await db.getDefaultRoomId();

    if (!chatRoomId) {
      console.warn("No chat room found. Create a row in chat_rooms before using database history.");
    }
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }
}

async function getHistory() {
  if (!db.isEnabled() || !chatRoomId) {
    return room.getHistory();
  }

  try {
    return await db.getRecentMessages(chatRoomId);
  } catch (error) {
    console.error("Failed to load message history:", error);
    return room.getHistory();
  }
}

async function createMessage(user, text) {
  if (db.isEnabled() && chatRoomId) {
    try {
      const savedMessage = await db.saveMessage({ user, chatRoomId, text });
      if (savedMessage) return savedMessage;
    } catch (error) {
      console.error("Failed to save message:", error);
    }
  }

  return {
    id: `${Date.now()}-${user.id}`,
    type: "message",
    user,
    text,
    sentAt: new Date().toISOString()
  };
}

async function updateStoredUserName(user) {
  if (!db.isEnabled() || !user.dbId) return;

  try {
    await db.updateUserName(user.dbId, user.name);
  } catch (error) {
    console.error("Failed to update user name:", error);
  }
}
