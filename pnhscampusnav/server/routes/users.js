const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db/pool");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const ROLES = ["admin", "staff", "student"];

router.use(requireAuth, requireRole("admin"));

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, full_name, username, role, id_number, approval_status, created_at FROM users ORDER BY approval_status, role, full_name"
    );
    res.json({ users: rows });
  } catch (err) {
    console.error("List users error:", err);
    res.status(500).json({ error: "Server error loading users" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { full_name, username, password, role } = req.body || {};
    if (!full_name || !username || !password) {
      return res.status(400).json({ error: "full_name, username, and password are required" });
    }
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
    const [existing] = await pool.query("SELECT id FROM users WHERE username = ?", [username]);
    if (existing[0]) return res.status(409).json({ error: "Username already taken" });
    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (full_name, username, password_hash, role) VALUES (?, ?, ?, ?)",
      [full_name, username, password_hash, role]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ error: "Server error creating user" });
  }
});

router.put("/:id/approval", async (req, res) => {
  const status = req.body && req.body.status;
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Approval status must be approved or rejected" });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.query("SELECT * FROM users WHERE id = ? FOR UPDATE", [req.params.id]);
    const user = rows[0];
    if (!user) {
      await conn.rollback();
      return res.status(404).json({ error: "User not found" });
    }
    if (user.role === "admin") {
      await conn.rollback();
      return res.status(400).json({ error: "Admin accounts do not require approval" });
    }
    if (status === "approved" && user.id_number) {
      const idType = user.role === "staff" ? "staff" : "lrn";
      const [rosterRows] = await conn.query(
        "SELECT id, claimed_by FROM school_roster WHERE id_number = ? AND id_type = ? FOR UPDATE",
        [user.id_number, idType]
      );
      const entry = rosterRows[0];
      if (!entry) {
        await conn.rollback();
        return res.status(400).json({ error: "The submitted LRN or Staff ID is no longer in the school roster." });
      }
      if (entry.claimed_by && Number(entry.claimed_by) !== Number(user.id)) {
        await conn.rollback();
        return res.status(409).json({ error: "This LRN or Staff ID is already linked to another account." });
      }
      await conn.query("UPDATE school_roster SET claimed_by = ? WHERE id = ?", [user.id, entry.id]);
    }
    await conn.query(
      "UPDATE users SET approval_status = ?, approved_at = ?, approved_by = ? WHERE id = ?",
      [status, status === "approved" ? new Date() : null, status === "approved" ? req.user.id : null, req.params.id]
    );
    await conn.commit();
    res.json({ ok: true, approval_status: status });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch (rollbackErr) { console.error("Approval rollback error:", rollbackErr); } }
    console.error("Update approval error:", err);
    res.status(500).json({ error: "Server error updating account approval" });
  } finally {
    if (conn) conn.release();
  }
});

router.put("/:id/role", async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: "You cannot change your own role" });
    }
    await pool.query("UPDATE users SET role = ? WHERE id = ?", [role, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Update role error:", err);
    res.status(500).json({ error: "Server error updating role" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }
    await pool.query("DELETE FROM users WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ error: "Server error deleting user" });
  }
});

module.exports = router;
