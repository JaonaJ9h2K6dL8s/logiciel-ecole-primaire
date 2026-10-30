-- 004 : Années scolaires
-- Une seule année active à la fois : colonne générée NULL si inactive,
-- avec index UNIQUE (les valeurs NULL ne sont pas concernées par l'unicité).
CREATE TABLE IF NOT EXISTS school_years (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(20) NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  active_unique TINYINT(1) GENERATED ALWAYS AS (CASE WHEN is_active = 1 THEN 1 ELSE NULL END) STORED,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_school_year_dates CHECK (end_date > start_date),
  CONSTRAINT uq_school_year_active UNIQUE (active_unique)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_school_years_active ON school_years (is_active);
