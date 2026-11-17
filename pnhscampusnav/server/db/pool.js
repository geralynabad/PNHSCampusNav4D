const mysql = require("mysql2/promise");

function envOr(key, fallback) {
  const val = process.env[key];
  return val === undefined ? fallback : val;
}

const pool = mysql.createPool({
  host: envOr("DB_HOST", "localhost"),
  port: Number(envOr("DB_PORT", 3306)),
  user: envOr("DB_USER", "pnhs_app"),
  password: envOr("DB_PASSWORD", "pnhs_app_pw"),
  database: envOr("DB_NAME", "pnhscampusnav"),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  // Many hosted MySQL services require an encrypted connection.
  // Set DB_SSL=true in the environment to turn it on.
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});

module.exports = pool;
