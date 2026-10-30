-- 011 : Liaison élèves ↔ responsables (plusieurs responsables par élève,
-- un responsable peut suivre plusieurs enfants — pas d'obligation de distinct).
CREATE TABLE IF NOT EXISTS student_guardians (
  student_id INT UNSIGNED NOT NULL,
  guardian_id INT UNSIGNED NOT NULL,
  relationship_label VARCHAR(80) NULL, -- précision libre, ex. « tuteur au quotidien »
  is_primary_contact TINYINT(1) NOT NULL DEFAULT 0,
  is_legal_guardian TINYINT(1) NOT NULL DEFAULT 0,
  contact_allowed TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, guardian_id),
  CONSTRAINT fk_sg_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_sg_guardian FOREIGN KEY (guardian_id) REFERENCES guardians(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_sg_guardian ON student_guardians (guardian_id);
CREATE INDEX idx_sg_primary ON student_guardians (student_id, is_primary_contact);
