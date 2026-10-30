-- 005 : Niveaux (CP, CE1, CE2, CM1, CM2 — libellés configurables par l'établissement)
CREATE TABLE IF NOT EXISTS levels (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  order_index SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_levels_order ON levels (order_index);
