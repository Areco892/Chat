require("dotenv").config({ quiet: true });
const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL;
const historyLimit = 80;

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false
    })
  : null;

function isEnabled() {
  return Boolean(pool);
}

async function getOrCreateGuestUser(user, clientId) {
  if (!pool) return null;

  const result = await pool.query(
    `
      INSERT INTO users (client_id, username, password_hash, display_color)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (client_id) WHERE client_id IS NOT NULL
      DO UPDATE SET client_id = EXCLUDED.client_id
      RETURNING id, username, display_color
    `,
    [clientId, user.name, "anonymous", user.color]
  );

  const guest = result.rows[0];

  return {
    id: guest.id,
    name: guest.username,
    color: guest.display_color || user.color
  };
}

async function updateUserName(userId, name) {
  if (!pool || !userId) return;

  await pool.query(
    `
      UPDATE users
      SET username = $1
      WHERE id = $2
    `,
    [name, userId]
  );
}

async function getDefaultRoomId() {
  if (!pool) return null;

  const result = await pool.query(
    `
      SELECT id
      FROM chat_rooms
      ORDER BY created_at ASC
      LIMIT 1
    `
  );

  return result.rows[0]?.id || null;
}

async function getRecentMessages(chatRoomId) {
  if (!pool || !chatRoomId) return [];

  const result = await pool.query(
    `
      SELECT
        messages.id,
        messages.body,
        messages.sent_at,
        users.id AS user_id,
        users.username,
        users.display_color
      FROM messages
      JOIN users ON users.id = messages.user_id
      WHERE messages.chat_room_id = $1
      ORDER BY messages.sent_at DESC
      LIMIT $2
    `,
    [chatRoomId, historyLimit]
  );

  return result.rows.reverse().map(toClientMessage);
}

async function saveMessage({ user, chatRoomId, text }) {
  if (!pool || !user.dbId || !chatRoomId) return null;

  const result = await pool.query(
    `
      INSERT INTO messages (user_id, chat_room_id, body)
      VALUES ($1, $2, $3)
      RETURNING id, body, sent_at
    `,
    [user.dbId, chatRoomId, text]
  );

  const message = result.rows[0];

  return {
    id: message.id,
    type: "message",
    user,
    text: message.body,
    sentAt: message.sent_at.toISOString()
  };
}

function toClientMessage(row) {
  return {
    id: row.id,
    type: "message",
    user: {
      id: row.user_id,
      name: row.username,
      color: row.display_color || "#247ba0"
    },
    text: row.body,
    sentAt: row.sent_at.toISOString()
  };
}

function shouldUseSsl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname !== "localhost" && hostname !== "127.0.0.1";
  } catch {
    return true;
  }
}

module.exports = {
  isEnabled,
  getOrCreateGuestUser,
  updateUserName,
  getDefaultRoomId,
  getRecentMessages,
  saveMessage
};
