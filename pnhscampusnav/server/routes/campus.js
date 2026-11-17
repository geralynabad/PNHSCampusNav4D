const express = require("express");
const pool = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const KEY = "campus_boundary";

// GET /api/campus/boundary -> everyone (the map needs it to hide the surroundings)
router.get("/boundary", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT value FROM settings WHERE key_name = ?", [KEY]);
    let boundary = null;
    if (rows[0] && rows[0].value) {
      boundary = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
    }
    res.json({ boundary });
  } catch (err) {
    console.error("Get boundary error:", err);
    res.status(500).json({ error: "Server error loading campus boundary" });
  }
});

// PUT /api/campus/boundary -> admin only. Body: { boundary: [[lat,lng], ...] } or { boundary: null } to clear.
router.put("/boundary", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { boundary } = req.body || {};
    if (boundary !== null) {
      const valid =
        Array.isArray(boundary) &&
        boundary.length >= 3 &&
        boundary.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n)));
      if (!valid) return res.status(400).json({ error: "boundary must be at least 3 [lat, lng] points" });
    }
    if (boundary === null) {
      await pool.query("DELETE FROM settings WHERE key_name = ?", [KEY]);
    } else {
      await pool.query(
        "INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
        [KEY, JSON.stringify(boundary)]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Save boundary error:", err);
    res.status(500).json({ error: "Server error saving campus boundary" });
  }
});

// ---------- Walkways (used to draw the route guide) ----------
const WALKWAYS_KEY = "campus_walkways";

// GET /api/campus/walkways -> everyone (the student map routes along these)
router.get("/walkways", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT value FROM settings WHERE key_name = ?", [WALKWAYS_KEY]);
    let walkways = [];
    if (rows[0] && rows[0].value) {
      walkways = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
    }
    res.json({ walkways });
  } catch (err) {
    console.error("Get walkways error:", err);
    res.status(500).json({ error: "Server error loading walkways" });
  }
});

// PUT /api/campus/walkways -> admin only. Body: { walkways: [ [[lat,lng], ...], ... ] }
router.put("/walkways", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { walkways } = req.body || {};
    const validPoint = (p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n));
    const valid =
      Array.isArray(walkways) &&
      walkways.length <= 200 &&
      walkways.every((w) => Array.isArray(w) && w.length >= 2 && w.length <= 500 && w.every(validPoint));
    if (!valid) return res.status(400).json({ error: "walkways must be a list of paths, each with at least 2 [lat, lng] points" });
    await pool.query(
      "INSERT INTO settings (key_name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [WALKWAYS_KEY, JSON.stringify(walkways)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Save walkways error:", err);
    res.status(500).json({ error: "Server error saving walkways" });
  }
});

module.exports = router;
