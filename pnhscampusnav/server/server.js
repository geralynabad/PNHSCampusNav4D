require("dotenv").config();
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { initDatabase } = require("./db/init");
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/classrooms");
const locationRoutes = require("./routes/locations");
const userRoutes = require("./routes/users");
const campusRoutes = require("./routes/campus");
const { registerSocketHandlers } = require("./socket");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/auth", authRoutes);
app.use("/api/classrooms", roomRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/campus", campusRoutes);

let databaseReady = false;

app.get("/api/health", (req, res) => {
  if (!databaseReady) {
    return res.status(503).json({ ok: false, name: "PNHSCampusNav", database: "initializing" });
  }
  res.json({ ok: true, name: "PNHSCampusNav", database: "ready" });
});

registerSocketHandlers(io);

async function initializeDatabaseWithRetry() {
  const maxAttempts = 12;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await initDatabase();
      databaseReady = true;
      console.log("Database initialized.");
      return;
    } catch (err) {
      console.error(`Database initialization attempt ${attempt}/${maxAttempts} failed:`, err.message);
      if (attempt === maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

server.listen(PORT, () => {
  console.log(`PNHSCampusNav server listening on port ${PORT}`);
});

initializeDatabaseWithRetry().catch((err) => {
  console.error("Failed to initialize the database after 12 attempts.");
  console.error("Verify the DB_* or Railway MYSQL* variables and MySQL networking.");
  console.error(err);
});
