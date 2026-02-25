-- ========== PART 2: tenants limits (sinkron) ==========
-- kita pakai: tenants.limit_sessions, tenants.limit_messages_per_day
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS limit_sessions INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS limit_messages_per_day INT NOT NULL DEFAULT 50;

-- ========== PART 3: webhooks + deliveries ==========
CREATE TABLE IF NOT EXISTS webhooks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  url VARCHAR(500) NOT NULL,
  secret VARCHAR(120) NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_webhooks_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  webhook_url VARCHAR(500) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  payload_json JSON NOT NULL,
  status ENUM('queued','sending','retry','delivered','failed') NOT NULL DEFAULT 'queued',
  attempt_count INT NOT NULL DEFAULT 0,
  last_attempt_at DATETIME NULL,
  delivered_at DATETIME NULL,
  last_response_code INT NULL,
  last_response_body TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_whd_status (status),
  KEY idx_whd_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========== PART 4: broadcast jobs + items ==========
CREATE TABLE IF NOT EXISTS broadcast_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  session_key VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  message_type ENUM('text','image','video','document') NOT NULL DEFAULT 'text',
  text_body TEXT NULL,
  delay_ms INT NOT NULL DEFAULT 1000,
  status ENUM('queued','running','done','cancelled') NOT NULL DEFAULT 'queued',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_bj_tenant (tenant_id),
  KEY idx_bj_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS broadcast_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  broadcast_job_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  to_number VARCHAR(30) NOT NULL,
  status ENUM('queued','sending','sent','failed') NOT NULL DEFAULT 'queued',
  wa_message_id VARCHAR(80) NULL,
  last_error TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  sent_at DATETIME NULL,
  finished_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_bi_job (broadcast_job_id),
  KEY idx_bi_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
