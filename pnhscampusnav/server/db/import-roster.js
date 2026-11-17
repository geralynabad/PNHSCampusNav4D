// Usage:  node server/db/import-roster.js roster.csv
// CSV header row required: id_number,type,last_name,first_name
//   type is "lrn" for students or "staff" for teachers/staff.
require("dotenv").config();
const fs = require("fs");
const pool = require("./pool");

const LRN_RE = /^\d{12}$/;
const STAFF_ID_RE = /^[A-Za-z0-9-]{4,20}$/;

async function main() {
  const file = process.argv[2];
  if (!file) { console.error("Usage: node server/db/import-roster.js roster.csv"); process.exit(1); }
  const lines = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const header = lines.shift().split(",").map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  if (["id_number", "type", "last_name", "first_name"].some((c) => col(c) < 0)) {
    console.error("Header must be: id_number,type,last_name,first_name"); process.exit(1);
  }
  let ok = 0, skipped = 0;
  for (const line of lines) {
    const f = line.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
    const id = f[col("id_number")].toUpperCase();
    const type = f[col("type")].toLowerCase();
    const last = f[col("last_name")], first = f[col("first_name")];
    const valid = (type === "lrn" && LRN_RE.test(id)) || (type === "staff" && STAFF_ID_RE.test(id));
    if (!valid || !last || !first) { skipped++; console.warn("Skipped:", line); continue; }
    await pool.query(
      `INSERT INTO school_roster (id_number, id_type, last_name, first_name) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id_type = VALUES(id_type), last_name = VALUES(last_name), first_name = VALUES(first_name)`,
      [id, type, last, first]
    );
    ok++;
  }
  console.log(`Imported ${ok} record(s), skipped ${skipped}.`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });