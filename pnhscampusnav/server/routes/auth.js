const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { JWT_SECRET, requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid username or password" });
    if (user.approval_status === "pending") {
      return res.status(403).json({ error: "Your account is waiting for admin approval." });
    }
    if (user.approval_status === "rejected") {
      return res.status(403).json({ error: "Your account registration was not approved. Please contact the school administrator." });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid username or password" });
    const token = jwt.sign(
      { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
      JWT_SECRET,
      { expiresIn: "12h" }
    );
    res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
});

// ---- School-record validation (LRN for students, Staff ID for staff) ----
const LRN_RE = /^\d{12}$/;                  // Learner Reference Number: 12 digits
const STAFF_ID_RE = /^[A-Za-z0-9-]{4,20}$/; // adjust if your school's staff IDs look different
const norm = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

router.post("/register", async (req, res) => {
  let conn;
  try {
    const { full_name, username, password, role, id_number } = req.body || {};
    if (!full_name || !username || !password) {
      return res.status(400).json({ error: "Full name, username, and password are required" });
    }
    const allowedRole = role === "staff" ? "staff" : "student";
    const idType = allowedRole === "staff" ? "staff" : "lrn";
    const idLabel = allowedRole === "staff" ? "Staff ID" : "LRN";
    const id = String(id_number || "").trim().toUpperCase();

    if (!id) return res.status(400).json({ error: `${idLabel} is required` });
    if (idType === "lrn" && !LRN_RE.test(id)) {
      return res.status(400).json({ error: "LRN must be exactly 12 digits" });
    }
    if (idType === "staff" && !STAFF_ID_RE.test(id)) {
      return res.status(400).json({ error: "Staff ID must be 4-20 letters, numbers, or dashes" });
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // The ID must exist in the school's roster, with a matching name.
    const [rosterRows] = await conn.query(
      "SELECT * FROM school_roster WHERE id_number = ? AND id_type = ? FOR UPDATE",
      [id, idType]
    );
    const entry = rosterRows[0];
    const typed = norm(full_name);
    const nameOk = entry && typed.includes(norm(entry.last_name)) && typed.includes(norm(entry.first_name));
    if (!entry || !nameOk) {
      await conn.rollback();
      return res.status(403).json({
        error: `Your ${idLabel} and name do not match the school records. Check them or ask the school office.`,
      });
    }
    if (entry.claimed_by) {
      await conn.rollback();
      return res.status(409).json({ error: `This ${idLabel} already has an account. Ask the school admin if this is a mistake.` });
    }
    const [claimedUsers] = await conn.query("SELECT id FROM users WHERE id_number = ?", [id]);
    if (claimedUsers[0]) {
      await conn.rollback();
      return res.status(409).json({ error: `This ${idLabel} already has a registration request.` });
    }

    const [taken] = await conn.query("SELECT id FROM users WHERE username = ?", [username]);
    if (taken[0]) {
      await conn.rollback();
      return res.status(409).json({ error: "Username already taken" });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await conn.query(
      "INSERT INTO users (full_name, username, password_hash, role, id_number, approval_status) VALUES (?, ?, ?, ?, ?, 'pending')",
      [full_name, username, password_hash, allowedRole, id]
    );
    await conn.commit();

    res.status(202).json({ pending: true, message: "Registration submitted. An administrator must approve your account before you can sign in." });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch (e) { /* ignore */ } }
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error during registration" });
  } finally {
    if (conn) conn.release();
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
