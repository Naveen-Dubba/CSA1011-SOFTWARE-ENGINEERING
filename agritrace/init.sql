CREATE DATABASE IF NOT EXISTS agriculture_supply_chain;
USE agriculture_supply_chain;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','farmer','collection_center','processor','distributor','retailer','consumer') NOT NULL DEFAULT 'consumer',
  location VARCHAR(180),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
);
CREATE TABLE IF NOT EXISTS batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  trace_id VARCHAR(40) NOT NULL UNIQUE,
  produce_name VARCHAR(120) NOT NULL,
  category VARCHAR(80) NOT NULL,
  variety VARCHAR(100),
  quantity DECIMAL(12,2) NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT 'kg',
  harvest_date DATE,
  expiry_date DATE,
  farm_location VARCHAR(180),
  farmer_id INT NOT NULL,
  status ENUM('registered','collected','processing','approved','in_transit','delivered','available','rejected') DEFAULT 'registered',
  current_location VARCHAR(180),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (farmer_id) REFERENCES users(id), INDEX idx_batches_status(status), INDEX idx_batches_farmer(farmer_id)
);
CREATE TABLE IF NOT EXISTS quality_inspections (
  id INT AUTO_INCREMENT PRIMARY KEY, batch_id INT NOT NULL, inspector_id INT NOT NULL,
  inspection_date DATETIME DEFAULT CURRENT_TIMESTAMP, condition_note VARCHAR(180), temperature DECIMAL(5,2), moisture DECIMAL(5,2),
  grade VARCHAR(20), result ENUM('Pending','Approved','Rejected') DEFAULT 'Pending', remarks TEXT,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE, FOREIGN KEY (inspector_id) REFERENCES users(id), INDEX idx_quality_batch(batch_id)
);
CREATE TABLE IF NOT EXISTS shipments (
  id INT AUTO_INCREMENT PRIMARY KEY, shipment_id VARCHAR(40) NOT NULL UNIQUE, batch_id INT NOT NULL, distributor_id INT NOT NULL,
  vehicle_number VARCHAR(50), driver_name VARCHAR(120), source VARCHAR(180), destination VARCHAR(180), dispatch_date DATETIME,
  expected_delivery DATETIME, actual_delivery DATETIME, status ENUM('Preparing','Dispatched','In Transit','Delivered','Delayed','Cancelled') DEFAULT 'Preparing',
  FOREIGN KEY (batch_id) REFERENCES batches(id), FOREIGN KEY (distributor_id) REFERENCES users(id), INDEX idx_shipments_status(status)
);
CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY, batch_id INT NOT NULL, owner_id INT NOT NULL, location VARCHAR(180), quantity DECIMAL(12,2) NOT NULL,
  available_quantity DECIMAL(12,2) NOT NULL, storage_condition VARCHAR(120), received_date DATE, expiry_date DATE, status VARCHAR(30) DEFAULT 'Available',
  FOREIGN KEY (batch_id) REFERENCES batches(id), FOREIGN KEY (owner_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS traceability_records (
  id INT AUTO_INCREMENT PRIMARY KEY, batch_id INT NOT NULL, actor_id INT, action VARCHAR(120) NOT NULL, location VARCHAR(180), quantity DECIMAL(12,2), status VARCHAR(50), remarks TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE, FOREIGN KEY (actor_id) REFERENCES users(id), INDEX idx_trace_batch_created(batch_id, created_at)
);
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, title VARCHAR(150) NOT NULL, message VARCHAR(255) NOT NULL, is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
