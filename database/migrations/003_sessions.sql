-- 003 : Sessions serveur (révocables, avec expiration)
CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(64) NOT NULL PRIMARY KEY, -- SHA-256 du jeton (le jeton brut n'est jamais stocké)
  user_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
