-- 015 : Affectations professeur / classe (structure minimale pour l'appel en classe)
-- Un professeur ne peut réaliser l'appel que sur les classes qui lui sont affectées.
-- Historique conservé : une affectation terminée reçoit assigned_to, jamais supprimée physiquement.
CREATE TABLE IF NOT EXISTS teacher_class_assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  school_year_id INT UNSIGNED NOT NULL,
  subject VARCHAR(80) NULL,
  assigned_from DATE NOT NULL,
  assigned_to DATE NULL, -- NULL = affectation en cours
  assigned_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active_key TINYINT(1) GENERATED ALWAYS AS (CASE WHEN assigned_to IS NULL THEN 1 ELSE NULL END) STORED,
  CONSTRAINT uq_assignment_active UNIQUE (teacher_id, class_id, school_year_id, active_key),
  CONSTRAINT fk_tca_teacher FOREIGN KEY (teacher_id) REFERENCES users(id),
  CONSTRAINT fk_tca_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  -- La classe doit appartenir à l'année scolaire de l'affectation.
  CONSTRAINT fk_tca_class_year FOREIGN KEY (class_id, school_year_id)
    REFERENCES classes(id, school_year_id),
  CONSTRAINT fk_tca_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_tca_dates CHECK (assigned_to IS NULL OR assigned_to >= assigned_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_tca_teacher ON teacher_class_assignments (teacher_id);
CREATE INDEX idx_tca_class ON teacher_class_assignments (class_id);
CREATE INDEX idx_tca_year ON teacher_class_assignments (school_year_id);
