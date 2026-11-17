const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const pool = require("./pool");

async function ensureUserColumns() {
  const [cols] = await pool.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'"
  );
  const names = new Set(cols.map((c) => c.COLUMN_NAME));
  if (!names.has("id_number")) await pool.query("ALTER TABLE users ADD COLUMN id_number VARCHAR(30) NULL UNIQUE");
  if (!names.has("approval_status")) await pool.query("ALTER TABLE users ADD COLUMN approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved'");
  if (!names.has("approved_at")) await pool.query("ALTER TABLE users ADD COLUMN approved_at TIMESTAMP NULL");
  if (!names.has("approved_by")) await pool.query("ALTER TABLE users ADD COLUMN approved_by INT NULL");
}


async function ensureSchema() {
  const schemaSql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  const withoutComments = schemaSql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
}

async function seedIfEmpty() {
  const [[{ count }]] = await pool.query("SELECT COUNT(*) AS count FROM users");
  if (count > 0) return;

  console.log("Seeding database with default accounts and sample campus data...");

  const seedUsers = [
    ["Admin Account", "admin", "admin123", "admin"],
    ["Sample Teacher", "staff1", "staff123", "staff"],
    ["Sample Student", "student1", "student123", "student"],
  ];
  for (const [full_name, username, plainPass, role] of seedUsers) {
    const password_hash = await bcrypt.hash(plainPass, 10);
    await pool.query(
      "INSERT INTO users (full_name, username, password_hash, role) VALUES (?, ?, ?, ?)",
      [full_name, username, password_hash, role]
    );
  }

  // Approximate campus center — see README section on replacing this with
  // real surveyed coordinates via the admin Classrooms tab.
  const CENTER_LAT = 11.1583;
  const CENTER_LNG = 124.9917;

  // Builds a simple axis-aligned rectangle footprint (placeholder 3D shape —
  // no texture/photo) around a center point, given half-widths in meters.
  function rectFootprint(lat, lng, halfWidthM, halfDepthM) {
    const dLat = halfDepthM / 111320;
    const dLng = halfWidthM / (111320 * Math.cos((lat * Math.PI) / 180));
    return [
      [lat - dLat, lng - dLng],
      [lat - dLat, lng + dLng],
      [lat + dLat, lng + dLng],
      [lat + dLat, lng - dLng],
      [lat - dLat, lng - dLng],
    ];
  }

  const [mainRes] = await pool.query(
    "INSERT INTO buildings (name, description, footprint, height_m) VALUES (?, ?, ?, ?)",
    [
      "Main Building",
      "Placeholder building — replace with the school's actual main building name and layout.",
      JSON.stringify(rectFootprint(CENTER_LAT + 0.0003, CENTER_LNG + 0.0003, 14, 9)),
      7, // placeholder: roughly a 2-story block
    ]
  );
  const [annexRes] = await pool.query(
    "INSERT INTO buildings (name, description, footprint, height_m) VALUES (?, ?, ?, ?)",
    [
      "Annex Building",
      "Placeholder annex building — replace with real building names on campus.",
      JSON.stringify(rectFootprint(CENTER_LAT - 0.0003, CENTER_LNG + 0.0004, 11, 8)),
      4, // placeholder: roughly a 1-story block
    ]
  );
  const [adminRes] = await pool.query(
    "INSERT INTO buildings (name, description, footprint, height_m) VALUES (?, ?, ?, ?)",
    [
      "Administration Building",
      "Placeholder admin building — principal's office, registrar, faculty room.",
      JSON.stringify(rectFootprint(CENTER_LAT, CENTER_LNG - 0.0003, 9, 7)),
      4,
    ]
  );

  const mainId = mainRes.insertId;
  const annexId = annexRes.insertId;
  const adminId = adminRes.insertId;

  const classrooms = [
    [mainId, "101", "Room 101", "1st Floor", CENTER_LAT + 0.0002, CENTER_LNG + 0.0002],
    [mainId, "102", "Room 102", "1st Floor", CENTER_LAT + 0.0002, CENTER_LNG + 0.0004],
    [mainId, "201", "Room 201", "2nd Floor", CENTER_LAT + 0.0004, CENTER_LNG + 0.0002],
    [mainId, "202", "Room 202", "2nd Floor", CENTER_LAT + 0.0004, CENTER_LNG + 0.0004],
    [annexId, "A1", "Computer Laboratory", "1st Floor", CENTER_LAT - 0.0003, CENTER_LNG + 0.0003],
    [annexId, "A2", "Science Laboratory", "1st Floor", CENTER_LAT - 0.0003, CENTER_LNG + 0.0005],
    [adminId, "ADM", "Principal's Office", "1st Floor", CENTER_LAT - 0.0001, CENTER_LNG - 0.0003],
    [adminId, "REG", "Registrar's Office", "1st Floor", CENTER_LAT + 0.0001, CENTER_LNG - 0.0003],
  ];
  for (const row of classrooms) {
    await pool.query(
      "INSERT INTO classrooms (building_id, room_number, name, floor, lat, lng) VALUES (?, ?, ?, ?, ?, ?)",
      row
    );
  }

  console.log("Seed complete.");
  console.log("Default accounts -> admin/admin123, staff1/staff123, student1/student123");
}

async function initDatabase() {
  await ensureSchema();
  await ensureUserColumns();
  await seedIfEmpty();
}

module.exports = { initDatabase };
