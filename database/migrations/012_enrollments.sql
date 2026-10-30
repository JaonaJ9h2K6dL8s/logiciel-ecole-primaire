-- 012 : Inscriptions (historique complet : plusieurs inscriptions par élève).
-- Statuts : active | transferred (changement de classe) | completed (année terminée / réinscription) | withdrawn (départ).
-- Unicité : une seule inscription active par élève et par année scolaire
-- (colonne générée + index unique ; NULL pour l'historique).

-- Index composite requis par la clé étrangère (class_id, school_year_id) ci-dessous.
-- Doit exister AVANT la création de la table enrollments (errno 150 sinon).
ALTER TABLE classes ADD UNIQUE KEY uq_classes_id_year (id, school_year_id);

CREATE TABLE IF NOT EXISTS enrollments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  school_year_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  enrollment_date DATE NOT NULL,
  status ENUM('active','transferred','completed','withdrawn') NOT NULL DEFAULT 'active',
  exit_date DATE NULL,
  exit_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  active_key VARCHAR(40) GENERATED ALWAYS AS (
    CASE WHEN status = 'active' THEN CONCAT(student_id, ':', school_year_id) ELSE NULL END
  ) STORED,
  CONSTRAINT uq_enrollment_active UNIQUE (active_key),
  CONSTRAINT fk_enroll_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_enroll_year FOREIGN KEY (school_year_id) REFERENCES school_years(id),
  CONSTRAINT fk_enroll_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  -- La classe doit appartenir à l'année scolaire de l'inscription (au niveau base).
  CONSTRAINT fk_enroll_class_year FOREIGN KEY (class_id, school_year_id)
    REFERENCES classes(id, school_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_enroll_student ON enrollments (student_id);
CREATE INDEX idx_enroll_class ON enrollments (class_id);
CREATE INDEX idx_enroll_year ON enrollments (school_year_id);
CREATE INDEX idx_enroll_status ON enrollments (status);
