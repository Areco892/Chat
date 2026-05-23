const http = require("http");
const path = require("path");
const fs = require("fs");
const WebSocket = require("ws");
const room = require("./roomManager");

const port = process.env.PORT || 3000;
const clientDir = path.join(__dirname, "..", "chat-client");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = http.createServer((request, response) => {
  const requestPath = request.url === "/" ? "/index.html" : request.url;
  const filePath = path.normalize(path.join(clientDir, requestPath));

  if (!filePath.startsWith(clientDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream"
    });
    response.end(content);
  });
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (socket) => {
  const user = room.addClient(socket);

  send(socket, {
    type: "welcome",
    user,
    history: room.getHistory(),
    users: room.getUsers()
  });

  broadcastPresence(`${user.name} joined`);

  socket.on("message", (rawMessage) => {
    let data;

    try {
      data = JSON.parse(rawMessage);
    } catch {
      return;
    }

    if (data.type === "rename") {
      const updatedUser = room.renameUser(socket, data.name);
      if (updatedUser) {
        broadcastPresence(`${updatedUser.name} is here`);
        broadcastUsers();
      }
      return;
    }

    if (data.type === "message") {
      const currentUser = room.getUser(socket);
      const text = sanitizeMessage(data.text);

      if (!currentUser || !text) return;

      const message = {
        id: `${Date.now()}-${currentUser.id}`,
        type: "message",
        user: currentUser,
        text,
        sentAt: new Date().toISOString()
      };

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

server.listen(port, () => {
  console.log(`Chat app running at http://localhost:${port}`);
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
