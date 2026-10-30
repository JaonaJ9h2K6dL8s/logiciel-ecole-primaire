-- 006 : Classes rattachées à un niveau et à une année scolaire
CREATE TABLE IF NOT EXISTS classes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  level_id INT UNSIGNED NOT NULL,
  school_year_id INT UNSIGNED NOT NULL,
  capacity SMALLINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_classes_level FOREIGN KEY (level_id) REFERENCES levels(id),
  CONSTRAINT fk_classes_school_year FOREIGN KEY (school_year_id) REFERENCES school_years(id),
  CONSTRAINT uq_classes_per_year UNIQUE (name, school_year_id, level_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_classes_year ON classes (school_year_id);
CREATE INDEX idx_classes_level ON classes (level_id);
CREATE INDEX idx_classes_active ON classes (is_active);
