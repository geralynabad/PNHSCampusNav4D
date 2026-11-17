const jwt = require("jsonwebtoken");
const pool = require("./db/pool");
const { JWT_SECRET } = require("./middleware/auth");

const activeUsers = new Map();

function broadcastActiveUsers(io) {
  io.to("admins").emit("active-users", Array.from(activeUsers.values()));
}

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    let authedUser = null;

    socket.on("authenticate", (token, ack) => {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        authedUser = payload;
        socket.data.user = payload;
        if (payload.role === "admin") {
          socket.join("admins");
          socket.emit("active-users", Array.from(activeUsers.values()));
        }
        if (typeof ack === "function") ack({ ok: true });
      } catch (err) {
        socket.emit("auth-error", "Invalid or expired session. Please log in again.");
        if (typeof ack === "function") ack({ ok: false });
      }
    });

    socket.on("location-update", async ({ lat, lng, accuracy }) => {
      if (!authedUser) return;
      if (typeof lat !== "number" || typeof lng !== "number") return;

      const entry = {
        id: authedUser.id,
        full_name: authedUser.full_name,
        role: authedUser.role,
        lat,
        lng,
        accuracy: accuracy ?? null,
        updated_at: new Date().toISOString(),
        socketId: socket.id,
      };
      const isNew = !activeUsers.has(authedUser.id);
      activeUsers.set(authedUser.id, entry);

      try {
        await pool.query(
          "INSERT INTO location_logs (user_id, lat, lng, accuracy) VALUES (?, ?, ?, ?)",
          [authedUser.id, lat, lng, accuracy ?? null]
        );
      } catch (err) {
        console.error("Failed to write location log:", err.message);
      }

      broadcastActiveUsers(io);
    });

    socket.on("location-stop", () => {
      if (authedUser) {
        activeUsers.delete(authedUser.id);
        broadcastActiveUsers(io);
      }
    });

    socket.on("disconnect", () => {
      if (authedUser && activeUsers.get(authedUser.id)?.socketId === socket.id) {
        activeUsers.delete(authedUser.id);
        broadcastActiveUsers(io);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
