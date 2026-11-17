require("dotenv").config();
const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { initDatabase } = require("./db/init");
const authRoutes = require("./routes/auth");
const classroomRoutes = require("./routes/classrooms");
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
app.use("/api/classrooms", classroomRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/campus", campusRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true, name: "PNHSCampusNav" }));

registerSocketHandlers(io);

initDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`PNHSCampusNav server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize the database. Is MySQL/MariaDB running and are");
    console.error("the DB_HOST/DB_USER/DB_PASSWORD/DB_NAME values in .env correct?");
    console.error(err);
    process.exit(1);
  });
