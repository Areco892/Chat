const historyLimit = 80;

const clients = new Map();
const history = [];

function addClient(socket) {
  const id = cryptoRandomId();
  const user = {
    id,
    name: `Guest ${id.slice(0, 4)}`,
    color: pickColor(id)
  };

  clients.set(socket, user);
  return user;
}

function removeClient(socket) {
  const user = clients.get(socket);
  clients.delete(socket);
  return user;
}

function getUser(socket) {
  return clients.get(socket);
}

function renameUser(socket, name) {
  const user = clients.get(socket);
  if (!user) return null;

  user.name = sanitizeName(name);
  return user;
}

function addMessage(message) {
  history.push(message);
  if (history.length > historyLimit) {
    history.shift();
  }
}

function getHistory() {
  return history;
}

function getUsers() {
  return Array.from(clients.values());
}

function getClientCount() {
  return clients.size;
}

function sanitizeName(value) {
  const fallback = "Guest";
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);

  return clean || fallback;
}

function pickColor(seed) {
  const palette = [
    "#247ba0",
    "#2a9d8f",
    "#7b61ff",
    "#d65a8a",
    "#e07a5f",
    "#3d5a80"
  ];

  const total = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[total % palette.length];
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2, 10);
}

module.exports = {
  addClient,
  removeClient,
  getUser,
  renameUser,
  addMessage,
  getHistory,
  getUsers,
  getClientCount
};
