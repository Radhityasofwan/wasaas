export const SQL_SCHEMA = `
/* =========================================================
   WA SaaS - FULL SCHEMA (MySQL 8)
   Target fitur:
   - Multi sesi/device (Baileys sessions)
   - Single message + Inbox (chat UI)
   - Broadcast/Blast with delay (queue DB)
   - Media (image/document/video/location metadata)
   - API Key + Webhook
   - Limits (message/session limit per plan, enforced by app)
   - Plan + Subscription + Payment
   - Admin dashboard settings
   - Push notification subscriptions (PWA)
   ========================================================= */

/* ---------- TENANTS (multi-tenant SaaS) ---------- */
CREATE TABLE IF NOT EXISTS tenants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- USERS ---------- */
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NULL,
  role ENUM('admin','owner','member') NOT NULL DEFAULT 'owner',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_tenant (tenant_id),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- PLANS (paket) ---------- */
CREATE TABLE IF NOT EXISTS plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  price_monthly INT UNSIGNED NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'IDR',

  /* Limits */
  limit_sessions INT UNSIGNED NOT NULL DEFAULT 1,
  limit_messages_daily INT UNSIGNED NOT NULL DEFAULT 50,
  limit_broadcast_daily INT UNSIGNED NOT NULL DEFAULT 1,
  limit_contacts INT UNSIGNED NOT NULL DEFAULT 1000,

  /* Feature flags */
  feature_api TINYINT(1) NOT NULL DEFAULT 1,
  feature_webhook TINYINT(1) NOT NULL DEFAULT 1,
  feature_inbox TINYINT(1) NOT NULL DEFAULT 1,
  feature_broadcast TINYINT(1) NOT NULL DEFAULT 1,
  feature_media TINYINT(1) NOT NULL DEFAULT 1,

  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- SUBSCRIPTIONS ---------- */
CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  status ENUM('trial','active','past_due','canceled','expired') NOT NULL DEFAULT 'trial',
  start_at DATETIME NOT NULL,
  end_at DATETIME NULL,
  renewal_at DATETIME NULL,

  /* Snapshot limits (freeze limits at subscription time) */
  limit_sessions INT UNSIGNED NOT NULL DEFAULT 1,
  limit_messages_daily INT UNSIGNED NOT NULL DEFAULT 50,
  limit_broadcast_daily INT UNSIGNED NOT NULL DEFAULT 1,
  limit_contacts INT UNSIGNED NOT NULL DEFAULT 1000,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_subs_tenant (tenant_id),
  KEY idx_subs_plan (plan_id),
  CONSTRAINT fk_subs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_subs_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- PAYMENTS (pembayaran) ---------- */
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  subscription_id BIGINT UNSIGNED NULL,
  provider ENUM('manual','midtrans','xendit','other') NOT NULL DEFAULT 'manual',
  provider_ref VARCHAR(120) NULL,
  amount INT UNSIGNED NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'IDR',
  status ENUM('pending','paid','failed','refunded','expired') NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  meta_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_pay_tenant (tenant_id),
  KEY idx_pay_sub (subscription_id),
  KEY idx_pay_provider_ref (provider_ref),
  CONSTRAINT fk_pay_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_pay_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- BAILEYS SESSIONS (multi-device) ---------- */
CREATE TABLE IF NOT EXISTS wa_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  session_key VARCHAR(64) NOT NULL,
  label VARCHAR(120) NULL,

  status ENUM('created','connecting','connected','disconnected','logged_out','error') NOT NULL DEFAULT 'created',
  phone_number VARCHAR(32) NULL,
  wa_me_jid VARCHAR(80) NULL,
  last_seen_at DATETIME NULL,
  last_error TEXT NULL,

  /* Counters (enforced in app) */
  messages_sent_today INT UNSIGNED NOT NULL DEFAULT 0,
  broadcasts_sent_today INT UNSIGNED NOT NULL DEFAULT 0,
  counters_date DATE NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_wa_session_key (session_key),
  KEY idx_wa_tenant (tenant_id),
  KEY idx_wa_user (user_id),
  CONSTRAINT fk_wa_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_wa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- CONTACTS (untuk UI inbox) ---------- */
CREATE TABLE IF NOT EXISTS wa_contacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  session_key VARCHAR(64) NOT NULL,
  jid VARCHAR(80) NOT NULL,
  phone_number VARCHAR(32) NULL,
  display_name VARCHAR(160) NULL,
  last_message_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_contact (tenant_id, session_key, jid),
  KEY idx_contact_tenant (tenant_id),
  KEY idx_contact_session (session_key),
  CONSTRAINT fk_contact_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- CHATS (thread per contact/group) ---------- */
CREATE TABLE IF NOT EXISTS wa_chats (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  session_key VARCHAR(64) NOT NULL,
  remote_jid VARCHAR(80) NOT NULL,
  chat_type ENUM('private','group','broadcast') NOT NULL DEFAULT 'private',
  title VARCHAR(160) NULL,
  unread_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_message_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_chat (tenant_id, session_key, remote_jid),
  KEY idx_chat_tenant (tenant_id),
  KEY idx_chat_session (session_key),
  KEY idx_chat_last (last_message_at),
  CONSTRAINT fk_chat_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- MESSAGES (inbox + single send + status) ---------- */
CREATE TABLE IF NOT EXISTS wa_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  session_key VARCHAR(64) NOT NULL,
  chat_id BIGINT UNSIGNED NULL,

  direction ENUM('in','out') NOT NULL,
  remote_jid VARCHAR(80) NOT NULL,
  wa_message_id VARCHAR(140) NULL,

  message_type ENUM('text','image','video','document','audio','location','sticker','unknown') NOT NULL DEFAULT 'text',
  text_body TEXT NULL,

  media_mime VARCHAR(120) NULL,
  media_name VARCHAR(255) NULL,
  media_size BIGINT UNSIGNED NULL,
  media_url TEXT NULL,         /* nanti: link storage (local/s3) */
  media_sha256 VARCHAR(128) NULL,

  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,

  status ENUM('queued','sent','delivered','read','failed') NOT NULL DEFAULT 'sent',
  error_text TEXT NULL,

  raw_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_msg_tenant (tenant_id),
  KEY idx_msg_session (session_key),
  KEY idx_msg_chat (chat_id),
  KEY idx_msg_remote (remote_jid),
  KEY idx_msg_created (created_at),
  CONSTRAINT fk_msg_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_chat FOREIGN KEY (chat_id) REFERENCES wa_chats(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- BROADCAST JOBS (blast + delay) ---------- */
CREATE TABLE IF NOT EXISTS broadcast_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  session_key VARCHAR(64) NOT NULL,

  name VARCHAR(160) NULL,
  message_type ENUM('text','image','video','document','location') NOT NULL DEFAULT 'text',
  text_body TEXT NULL,

  /* media metadata if needed */
  media_path TEXT NULL,       /* path lokal upload sementara */
  media_mime VARCHAR(120) NULL,
  media_name VARCHAR(255) NULL,

  /* delay */
  delay_ms INT UNSIGNED NOT NULL DEFAULT 2000,
  scheduled_at DATETIME NULL,

  status ENUM('draft','queued','running','paused','done','failed','canceled') NOT NULL DEFAULT 'draft',
  total_targets INT UNSIGNED NOT NULL DEFAULT 0,
  sent_count INT UNSIGNED NOT NULL DEFAULT 0,
  failed_count INT UNSIGNED NOT NULL DEFAULT 0,

  last_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_bj_tenant (tenant_id),
  KEY idx_bj_user (user_id),
  KEY idx_bj_session (session_key),
  KEY idx_bj_status (status),
  KEY idx_bj_sched (scheduled_at),
  CONSTRAINT fk_bj_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_bj_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- BROADCAST ITEMS (queue row) ---------- */
CREATE TABLE IF NOT EXISTS broadcast_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  session_key VARCHAR(64) NOT NULL,

  to_number VARCHAR(32) NOT NULL,        /* 62xxxx */
  to_jid VARCHAR(80) NULL,              /* 62xxxx@s.whatsapp.net */
  status ENUM('queued','sending','sent','failed','skipped') NOT NULL DEFAULT 'queued',

  /* Update untuk Reply Tracking */
  wa_message_id VARCHAR(140) NULL,
  reply_status ENUM('none', 'replied') NOT NULL DEFAULT 'none',
  reply_received_at DATETIME NULL,

  try_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  sent_at DATETIME NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_bi_job (job_id),
  KEY idx_bi_status (status),
  KEY idx_bi_session (session_key),
  KEY idx_bi_msgid (wa_message_id),
  CONSTRAINT fk_bi_job FOREIGN KEY (job_id) REFERENCES broadcast_jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_bi_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- API KEYS ---------- */
CREATE TABLE IF NOT EXISTS api_keys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  scopes_json JSON NULL,
  last_used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_api_tenant (tenant_id),
  KEY idx_api_user (user_id),
  KEY idx_api_revoked (revoked_at),
  CONSTRAINT fk_api_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_api_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- WEBHOOKS ---------- */
CREATE TABLE IF NOT EXISTS webhooks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  url TEXT NOT NULL,
  secret VARCHAR(120) NOT NULL,
  events_json JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_wh_tenant (tenant_id),
  KEY idx_wh_user (user_id),
  KEY idx_wh_active (is_active),
  CONSTRAINT fk_wh_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_wh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- WEBHOOK DELIVERY LOG ---------- */
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  webhook_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  event_name VARCHAR(80) NOT NULL,
  payload_json JSON NOT NULL,
  http_status INT UNSIGNED NULL,
  response_body TEXT NULL,
  try_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('queued','sent','failed') NOT NULL DEFAULT 'queued',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_wd_webhook (webhook_id),
  KEY idx_wd_status (status),
  CONSTRAINT fk_wd_webhook FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE,
  CONSTRAINT fk_wd_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- PUSH SUBSCRIPTIONS (PWA notifications) ---------- */
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  user_agent VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_push_tenant (tenant_id),
  KEY idx_push_user (user_id),
  KEY idx_push_active (is_active),
  CONSTRAINT fk_push_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- SITE SETTINGS (admin config website) ---------- */
CREATE TABLE IF NOT EXISTS site_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  setting_key VARCHAR(120) NOT NULL,
  setting_value TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_setting (tenant_id, setting_key),
  CONSTRAINT fk_setting_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- AUDIT LOG (admin monitoring) ---------- */
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  meta_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_audit_tenant (tenant_id),
  KEY idx_audit_user (user_id),
  KEY idx_audit_action (action),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- AUTO REPLY RULES ---------- */
CREATE TABLE IF NOT EXISTS auto_reply_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  session_key VARCHAR(64) NULL,
  keyword VARCHAR(255) NOT NULL,
  match_type ENUM('exact','contains','startswith') NOT NULL DEFAULT 'exact',
  reply_text TEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_ar_tenant (tenant_id),
  CONSTRAINT fk_ar_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* =========================================================
   BARU: MODUL TEMPLATE & AUTO FOLLOW UP
   ========================================================= */

/* ---------- MESSAGE TEMPLATES ---------- */
CREATE TABLE IF NOT EXISTS message_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  
  message_type ENUM('text','image','video','document','audio','location') NOT NULL DEFAULT 'text',
  text_body TEXT NULL,
  
  /* Optional media */
  media_mime VARCHAR(120) NULL,
  media_name VARCHAR(255) NULL,
  media_url TEXT NULL,
  
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_tpl_tenant (tenant_id),
  CONSTRAINT fk_tpl_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- FOLLOWUP CAMPAIGNS (Aturan Penjadwalan) ---------- */
CREATE TABLE IF NOT EXISTS followup_campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  session_key VARCHAR(64) NOT NULL,
  
  name VARCHAR(160) NOT NULL,
  template_id BIGINT UNSIGNED NULL,

  /* Logika waktu pengiriman: delay (H+X) dan jam pengiriman (18:00) */
  delay_days INT UNSIGNED NOT NULL DEFAULT 0,
  target_time TIME NULL, 

  /* Kondisi eksekusi: hanya kirim jika status pesan terakhir memenuhi kriteria ini */
  trigger_condition ENUM('always', 'unreplied', 'unread') NOT NULL DEFAULT 'unreplied',
  
  status ENUM('active','paused','completed') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_fc_tenant (tenant_id),
  KEY idx_fc_session (session_key),
  CONSTRAINT fk_fc_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_fc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fc_template FOREIGN KEY (template_id) REFERENCES message_templates(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- FOLLOWUP TARGETS (Queue Target per Nomor) ---------- */
CREATE TABLE IF NOT EXISTS followup_targets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  tenant_id BIGINT UNSIGNED NOT NULL,
  session_key VARCHAR(64) NOT NULL,
  
  to_number VARCHAR(32) NOT NULL,
  to_jid VARCHAR(80) NULL,

  /* Status Eksekusi Terhadap Nomor Tersebut */
  status ENUM('queued','sent','delivered','read','replied','failed','canceled') NOT NULL DEFAULT 'queued',

  scheduled_at DATETIME NOT NULL, /* Kapan tepatnya akan dieksekusi (dihitung saat insert ke tabel ini) */
  sent_at DATETIME NULL,
  wa_message_id VARCHAR(140) NULL, /* Diisi saat berhasil terkirim agar bisa dilacak read/replied-nya */
  last_error TEXT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_ft_campaign (campaign_id),
  KEY idx_ft_status (status),
  KEY idx_ft_sched (scheduled_at),
  KEY idx_ft_msgid (wa_message_id),
  CONSTRAINT fk_ft_campaign FOREIGN KEY (campaign_id) REFERENCES followup_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_ft_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

/* ---------- SEED: default tenant + owner user + default plan + trial subscription ---------- */
INSERT IGNORE INTO tenants (id, name, slug, is_active) VALUES (1, 'Default Tenant', 'default', 1);

INSERT IGNORE INTO users (id, tenant_id, full_name, email, password_hash, role, is_active)
VALUES (1, 1, 'Owner', 'owner@local.test', NULL, 'owner', 1);

INSERT IGNORE INTO plans (id, code, name, price_monthly, currency, limit_sessions, limit_messages_daily, limit_broadcast_daily, limit_contacts,
feature_api, feature_webhook, feature_inbox, feature_broadcast, feature_media, is_active)
VALUES (1, 'starter', 'Starter', 0, 'IDR', 2, 100, 2, 2000, 1, 1, 1, 1, 1, 1);

INSERT IGNORE INTO subscriptions (id, tenant_id, plan_id, status, start_at, end_at, renewal_at,
limit_sessions, limit_messages_daily, limit_broadcast_daily, limit_contacts)
VALUES (1, 1, 1, 'trial', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), DATE_ADD(NOW(), INTERVAL 30 DAY),
2, 100, 2, 2000);
`