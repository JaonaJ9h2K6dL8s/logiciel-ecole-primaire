-- 033 : Orchestrateur multi-IA — conversations, messages et suivi d'usage.
-- Complète le module pedagogical-ai existant (ai_config, ai_content) sans le
-- modifier : aucune table existante n'est altérée.

CREATE TABLE IF NOT EXISTS ai_conversations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  role_context VARCHAR(20) NOT NULL DEFAULT 'teacher',
  student_id INT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL DEFAULT 'Conversation',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT UNSIGNED NOT NULL,
  role VARCHAR(10) NOT NULL,
  content TEXT NOT NULL,
  provider VARCHAR(40) NULL,
  model VARCHAR(80) NULL,
  tokens_in INT NOT NULL DEFAULT 0,
  tokens_out INT NOT NULL DEFAULT 0,
  latency_ms INT NOT NULL DEFAULT 0,
  error VARCHAR(300) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_aim_conversation FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  day DATE NOT NULL,
  provider VARCHAR(40) NOT NULL,
  model VARCHAR(80) NOT NULL,
  requests INT NOT NULL DEFAULT 0,
  tokens_in BIGINT NOT NULL DEFAULT 0,
  tokens_out BIGINT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  est_cost_usd DECIMAL(10,4) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_usage_day_provider_model (day, provider, model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_aic_user ON ai_conversations (user_id);
CREATE INDEX idx_aic_student ON ai_conversations (student_id);
CREATE INDEX idx_aim_conversation ON ai_messages (conversation_id);
CREATE INDEX idx_aim_created ON ai_messages (created_at);
