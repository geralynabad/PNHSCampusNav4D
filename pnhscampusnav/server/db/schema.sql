CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'staff', 'student') NOT NULL,
  id_number VARCHAR(30) NULL UNIQUE,
  approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved',
  approved_at TIMESTAMP NULL,
  approved_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS school_roster (
  id INT AUTO_INCREMENT PRIMARY KEY,
  id_number VARCHAR(30) NOT NULL,
  id_type ENUM('lrn', 'staff') NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  claimed_by INT NULL,
  UNIQUE KEY uq_roster_id (id_number, id_type),
  FOREIGN KEY (claimed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS buildings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  -- Polygon footprint for the 3D building block, stored as a JSON array of
  -- [lat, lng] vertex pairs (no textures/photos — just an extruded shape).
  footprint JSON,
  -- Extrusion height in meters. NULL until an admin sets a real footprint.
  height_m DOUBLE DEFAULT 9
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS classrooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  building_id INT NOT NULL,
  room_number VARCHAR(50) NOT NULL,
  name VARCHAR(150),
  floor VARCHAR(50),
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
  INDEX idx_classrooms_building (building_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS location_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  lat DOUBLE NOT NULL,
  lng DOUBLE NOT NULL,
  accuracy DOUBLE,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_logs_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  key_name VARCHAR(60) PRIMARY KEY,
  value LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
