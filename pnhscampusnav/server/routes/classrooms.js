const express = require("express");
const pool = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.room_number, c.name, c.floor, c.lat, c.lng,
              b.id AS building_id, b.name AS building_name
       FROM classrooms c JOIN buildings b ON b.id = c.building_id
       ORDER BY b.name, c.room_number`
    );
    res.json({ classrooms: rows });
  } catch (err) {
    console.error("List classrooms error:", err);
    res.status(500).json({ error: "Server error loading classrooms" });
  }
});

function parseFootprint(v) {
  if (typeof v === "string") { try { return JSON.parse(v); } catch (e) { return null; } }
  return v ?? null;
}

function serializeFootprint(footprint) {
  if (!Array.isArray(footprint) || footprint.length < 3) return null;
  return JSON.stringify(footprint);
}

router.get("/buildings", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM buildings ORDER BY name");
    res.json({ buildings: rows.map((b) => ({ ...b, footprint: parseFootprint(b.footprint) })) });
  } catch (err) {
    console.error("List buildings error:", err);
    res.status(500).json({ error: "Server error loading buildings" });
  }
});

router.post("/buildings", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { name, description, footprint, height_m } = req.body || {};
    if (!name) return res.status(400).json({ error: "Building name is required" });
    const [result] = await pool.query(
      "INSERT INTO buildings (name, description, footprint, height_m) VALUES (?, ?, ?, ?)",
      [name.trim(), description || null, serializeFootprint(footprint), height_m ?? 9]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("Create building error:", err);
    res.status(500).json({ error: "Server error creating building" });
  }
});

// PUT /api/classrooms/buildings/:id -> admin only. Used to attach/redraw a
// building's 3D footprint (polygon) and extrusion height after the fact.
router.put("/buildings/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { name, description, footprint, height_m } = req.body || {};
    const [rows] = await pool.query("SELECT * FROM buildings WHERE id = ?", [req.params.id]);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: "Building not found" });

    await pool.query(
      "UPDATE buildings SET name = ?, description = ?, footprint = ?, height_m = ? WHERE id = ?",
      [
        name ?? existing.name,
        description ?? existing.description,
        footprint !== undefined ? serializeFootprint(footprint) : serializeFootprint(parseFootprint(existing.footprint)),
        height_m ?? existing.height_m,
        req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Update building error:", err);
    res.status(500).json({ error: "Server error updating building" });
  }
});

router.delete("/buildings/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await pool.query("DELETE FROM buildings WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete building error:", err);
    res.status(500).json({ error: "Server error deleting building" });
  }
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { building_id, room_number, name, floor, lat, lng } = req.body || {};
    if (!building_id || !room_number || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: "building_id, room_number, lat, and lng are required" });
    }
    const [result] = await pool.query(
      "INSERT INTO classrooms (building_id, room_number, name, floor, lat, lng) VALUES (?, ?, ?, ?, ?, ?)",
      [building_id, room_number, name || null, floor || null, lat, lng]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("Create classroom error:", err);
    res.status(500).json({ error: "Server error creating classroom" });
  }
});

router.put("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { room_number, name, floor, lat, lng } = req.body || {};
    const [rows] = await pool.query("SELECT * FROM classrooms WHERE id = ?", [req.params.id]);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: "Classroom not found" });
    await pool.query(
      "UPDATE classrooms SET room_number = ?, name = ?, floor = ?, lat = ?, lng = ? WHERE id = ?",
      [
        room_number ?? existing.room_number,
        name ?? existing.name,
        floor ?? existing.floor,
        lat ?? existing.lat,
        lng ?? existing.lng,
        req.params.id,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Update classroom error:", err);
    res.status(500).json({ error: "Server error updating classroom" });
  }
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await pool.query("DELETE FROM classrooms WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete classroom error:", err);
    res.status(500).json({ error: "Server error deleting classroom" });
  }
});

module.exports = router;
