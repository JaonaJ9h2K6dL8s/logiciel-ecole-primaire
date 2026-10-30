-- 008 : Journaux d'audit (insertion seule — pas de modification ni suppression applicative)
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id INT UNSIGNED NULL,
  actor_username VARCHAR(50) NULL,
  action VARCHAR(80) NOT NULL, -- ex: auth.login, users.create, school_years.activate...
  entity_type VARCHAR(60) NULL,
  entity_id VARCHAR(60) NULL,
  result ENUM('success','failure') NOT NULL DEFAULT 'success',
  details JSON NULL, -- jamais de mot de passe, secret ou jeton de session
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_audit_created ON audit_logs (created_at);
CREATE INDEX idx_audit_action ON audit_logs (action);
CREATE INDEX idx_audit_actor ON audit_logs (actor_id);
