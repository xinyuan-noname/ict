# check · 云端数据基线（华为云 RDS for MySQL 8.0）
#
# 用途：
#   1. RDS 实例创建后的初始化脚本；
#   2. 数据面从 file store 迁移到 sqlstore 时的字段契约；
#   3. 数据审计与容量评估。
#
# 说明：当前 Demo 运行时默认使用 server/data/*.json 文件存储，
#       以便无云资源时离线评审；本 schema 是 RDS 迁移基线。

CREATE DATABASE IF NOT EXISTS `check_app`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

USE `check_app`;

-- ---------------------------------------------------------------------------
-- 身份与会话（对应 domain.UserProfile / domain.Session）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `user_id`        VARCHAR(64)  NOT NULL,
  `open_id`        VARCHAR(128) NOT NULL,
  `union_id`       VARCHAR(128) NULL,
  `display_name`   VARCHAR(64)  NULL,
  `avatar_url`     VARCHAR(512) NULL,
  `status`         ENUM('active','disabled') NOT NULL DEFAULT 'active',
  `created_at`     DATETIME(3)  NOT NULL,
  `last_login_at`  DATETIME(3)  NOT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_users_open_id` (`open_id`),
  KEY `idx_users_status` (`status`)
) ENGINE=InnoDB COMMENT='华为账号用户档案，open_id 为唯一外部键';

CREATE TABLE IF NOT EXISTS `sessions` (
  `token_hash`      CHAR(64)     NOT NULL,
  `user_id`         VARCHAR(64)  NOT NULL,
  `platform`        ENUM('android','ios','windows','web','wechat') NOT NULL,
  `issued_at`       DATETIME(3)  NOT NULL,
  `expires_at`      DATETIME(3)  NOT NULL,
  `revoked_at`      DATETIME(3)  NULL,
  `last_active_at`  DATETIME(3)  NULL,
  PRIMARY KEY (`token_hash`),
  KEY `idx_sessions_user` (`user_id`),
  KEY `idx_sessions_expiry` (`expires_at`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB COMMENT='只存 HMAC-SHA256 摘要，不存会话原文';

CREATE TABLE IF NOT EXISTS `auth_codes` (
  `code_digest`  CHAR(64)    NOT NULL,
  `expires_at`   DATETIME(3) NOT NULL,
  `consumed_at`  DATETIME(3) NULL,
  PRIMARY KEY (`code_digest`),
  KEY `idx_auth_codes_expiry` (`expires_at`)
) ENGINE=InnoDB COMMENT='授权码一次性消费（CAS）';

CREATE TABLE IF NOT EXISTS `auth_events` (
  `event_id`    VARCHAR(64)  NOT NULL,
  `event_type`  ENUM('login_success','login_failure','logout','credential_invalid') NOT NULL,
  `user_id`     VARCHAR(64)  NULL,
  `platform`    VARCHAR(16)  NOT NULL DEFAULT 'unknown',
  `error_code`  VARCHAR(16)  NULL,
  `trace_id`    VARCHAR(64)  NOT NULL,
  `occurred_at` DATETIME(3)  NOT NULL,
  PRIMARY KEY (`event_id`),
  KEY `idx_auth_events_time` (`occurred_at`),
  KEY `idx_auth_events_trace` (`trace_id`),
  KEY `idx_auth_events_user` (`user_id`)
) ENGINE=InnoDB COMMENT='已脱敏审计事件，不含授权码/凭证/密钥';

-- ---------------------------------------------------------------------------
-- 健康清单（对应 checkStore / domain.Check*）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `check_profiles` (
  `user_id`     VARCHAR(64) NOT NULL,
  `height_cm`   INT         NOT NULL,
  `weight_g`    INT         NOT NULL,
  `age`         INT         NOT NULL,
  `gender`      ENUM('male','female','other') NOT NULL,
  `updated_at`  DATETIME(3) NOT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `check_water_records` (
  `record_id`  VARCHAR(64) NOT NULL,
  `user_id`    VARCHAR(64) NOT NULL,
  `day`        DATE        NOT NULL,
  `ml`         INT         NOT NULL,
  `unit_name`  VARCHAR(32) NULL,
  `amount`     INT         NULL,
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`record_id`),
  KEY `idx_water_user_day` (`user_id`, `day`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `check_med_items` (
  `item_id`   VARCHAR(64) NOT NULL,
  `user_id`   VARCHAR(64) NOT NULL,
  `name`      VARCHAR(64) NOT NULL,
  `dosage`    VARCHAR(64) NOT NULL,
  `slots`     JSON        NOT NULL,
  `status`    ENUM('active','stopped') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`item_id`),
  KEY `idx_med_user` (`user_id`, `status`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `check_med_doses` (
  `dose_id`   VARCHAR(64) NOT NULL,
  `item_id`   VARCHAR(64) NOT NULL,
  `user_id`   VARCHAR(64) NOT NULL,
  `day`       DATE        NOT NULL,
  `slot`      VARCHAR(16) NOT NULL,
  `late`      TINYINT(1)  NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`dose_id`),
  UNIQUE KEY `uk_med_dose` (`item_id`, `day`, `slot`),
  KEY `idx_med_dose_user_day` (`user_id`, `day`)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 积分、签到与成就（对应 rewards / sport）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reward_ledger` (
  `entry_id`   VARCHAR(64) NOT NULL,
  `user_id`    VARCHAR(64) NOT NULL,
  `kind`       VARCHAR(32) NOT NULL,
  `points`     INT         NOT NULL,
  `ref_id`     VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`entry_id`),
  KEY `idx_ledger_user_time` (`user_id`, `created_at`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `checkins` (
  `user_id`     VARCHAR(64) NOT NULL,
  `day`         DATE        NOT NULL,
  `points`      INT         NOT NULL,
  `created_at`  DATETIME(3) NOT NULL,
  PRIMARY KEY (`user_id`, `day`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `sport_records` (
  `record_id`   VARCHAR(64) NOT NULL,
  `user_id`     VARCHAR(64) NOT NULL,
  `type`        ENUM('walking','cycling','running') NOT NULL,
  `day`         DATE        NOT NULL,
  `distance_m`  INT         NOT NULL,
  `duration_s`  INT         NOT NULL,
  `steps`       INT         NOT NULL,
  `continuous`  TINYINT(1)  NOT NULL DEFAULT 1,
  `created_at`  DATETIME(3) NOT NULL,
  PRIMARY KEY (`record_id`),
  KEY `idx_sport_user_day` (`user_id`, `day`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `sport_achievements` (
  `user_id`        VARCHAR(64) NOT NULL,
  `achievement_id` VARCHAR(64) NOT NULL,
  `status`         ENUM('locked','unlocked','granting','granted') NOT NULL,
  `progress`       INT         NOT NULL DEFAULT 0,
  `need`           INT         NOT NULL DEFAULT 1,
  `points`         INT         NOT NULL DEFAULT 0,
  `granted_points` INT         NOT NULL DEFAULT 0,
  `updated_at`     DATETIME(3) NOT NULL,
  PRIMARY KEY (`user_id`, `achievement_id`)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 同步出站队列（对应 syncEngine 的增量批次）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sync_outbox` (
  `seq`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    VARCHAR(64) NOT NULL,
  `entity`     VARCHAR(32) NOT NULL,
  `op`         VARCHAR(16) NOT NULL,
  `payload`    JSON        NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `consumed_at` DATETIME(3) NULL,
  PRIMARY KEY (`seq`),
  KEY `idx_outbox_user` (`user_id`, `consumed_at`)
) ENGINE=InnoDB;

-- 演示账号由应用侧首次登录自动建档，不预置密码或真实个人信息。
