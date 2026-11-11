CREATE DATABASE IF NOT EXISTS vitals_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE vitals_db;

CREATE TABLE IF NOT EXISTS mission_states (
  mission_id VARCHAR(64) PRIMARY KEY,
  payload JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS missions (
  mission_id VARCHAR(64) PRIMARY KEY,
  crew_name VARCHAR(120),
  current_day INT NOT NULL DEFAULT 0,
  mode VARCHAR(32) NOT NULL DEFAULT 'simulation',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_logs (
  mission_id VARCHAR(64) NOT NULL,
  day INT NOT NULL,
  payload JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mission_id, day)
);

CREATE TABLE IF NOT EXISTS telemetry_frames (
  mission_id VARCHAR(64) NOT NULL,
  day INT NOT NULL,
  hr INT,
  spo2 INT,
  temp DECIMAL(4,1),
  rad DECIMAL(8,2),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mission_id, day)
);

CREATE TABLE IF NOT EXISTS live_telemetry (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  mission_id VARCHAR(64) NOT NULL,
  source VARCHAR(24) NOT NULL DEFAULT 'simulation',
  mission_day INT NOT NULL DEFAULT 0,
  hr INT,
  spo2 DECIMAL(4,1),
  temp DECIMAL(4,1),
  observed_at_ms BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX live_telemetry_mission_time_idx (mission_id, observed_at_ms)
);

CREATE TABLE IF NOT EXISTS telemetry_alerts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  mission_id VARCHAR(64) NOT NULL,
  day INT NOT NULL DEFAULT 0,
  severity VARCHAR(16) NOT NULL,
  code VARCHAR(48) NOT NULL,
  source VARCHAR(24) NOT NULL DEFAULT 'simulation',
  text TEXT NOT NULL,
  occurred_at_ms BIGINT UNSIGNED NOT NULL,
  INDEX telemetry_alerts_mission_time_idx (mission_id, occurred_at_ms)
);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  mission_id VARCHAR(64) NOT NULL,
  day INT NOT NULL,
  severity VARCHAR(16) NOT NULL,
  text TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX alerts_mission_day_idx (mission_id, day)
);

CREATE TABLE IF NOT EXISTS comms_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  mission_id VARCHAR(64) NOT NULL,
  day INT NOT NULL,
  message_type VARCHAR(24) NOT NULL,
  severity VARCHAR(16),
  text TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX comms_messages_mission_day_idx (mission_id, day)
);

CREATE TABLE IF NOT EXISTS achievements (
  mission_id VARCHAR(64) NOT NULL,
  achievement_key VARCHAR(64) NOT NULL,
  unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mission_id, achievement_key)
);

CREATE TABLE IF NOT EXISTS flight_surgeon_notes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  mission_id VARCHAR(64) NOT NULL,
  day INT NOT NULL,
  alert_index INT,
  status VARCHAR(32) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  note TEXT NOT NULL,
  author VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX flight_surgeon_notes_mission_day_idx (mission_id, day)
);

CREATE TABLE IF NOT EXISTS mission_audit_events (
  event_id VARCHAR(64) PRIMARY KEY,
  mission_id VARCHAR(64) NOT NULL,
  mission_day INT NOT NULL DEFAULT 0,
  actor VARCHAR(120) NOT NULL,
  actor_role VARCHAR(32) NOT NULL DEFAULT 'crew',
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(48) NOT NULL,
  entity_id VARCHAR(128),
  before_values JSON,
  after_values JSON,
  occurred_at_ms BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX mission_audit_events_timeline_idx (mission_id, occurred_at_ms),
  INDEX mission_audit_events_entity_idx (mission_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS mission_telemetry (
  mission_id VARCHAR(64) NOT NULL,
  day INT NOT NULL,
  hr INT,
  spo2 INT,
  temp DECIMAL(4,1),
  rad DECIMAL(8,2),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mission_id, day)
);

CREATE TABLE IF NOT EXISTS mission_alerts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  mission_id VARCHAR(64) NOT NULL,
  day INT NOT NULL,
  severity VARCHAR(16) NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX mission_alerts_mission_day_idx (mission_id, day)
);

CREATE TABLE IF NOT EXISTS mission_comms (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  mission_id VARCHAR(64) NOT NULL,
  day INT NOT NULL,
  message_type VARCHAR(24) NOT NULL,
  severity VARCHAR(16),
  text TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX mission_comms_mission_day_idx (mission_id, day)
);

CREATE TABLE IF NOT EXISTS mission_achievements (
  mission_id VARCHAR(64) NOT NULL,
  achievement_key VARCHAR(64) NOT NULL,
  unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (mission_id, achievement_key)
);
