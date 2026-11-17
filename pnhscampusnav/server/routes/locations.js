const express = require("express");
const pool = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/history/:userId", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT l.id, l.lat, l.lng, l.accuracy, l.logged_at, u.full_name, u.role
       FROM location_logs l JOIN users u ON u.id = l.user_id
       WHERE l.user_id = ? ORDER BY l.logged_at DESC LIMIT 200`,
      [req.params.userId]
    );
    res.json({ history: rows });
  } catch (err) {
    console.error("Location history error:", err);
    res.status(500).json({ error: "Server error loading location history" });
  }
});

module.exports = router;
