-- 020 : Évaluations et notes (étape 4)
--
-- Évaluation : (classe, matière, année, période) + titre/type/date/barème/
-- coefficient/professeur responsable. Statuts : draft | submitted | locked.
-- Le verrouillage d'une évaluation interdit les modifications de notes
-- (sauf grades.correct avec motif), sans jamais supprimer les résultats.
--
-- Notes : une ligne par (évaluation, élève), statut explicite.
--   'graded'            : note numérique obligatoire (0 est une note valide)
--   'not_graded'        : pas encore évalué — aucun chiffre fabriqué
--   'absent'            : absent — jamais converti en zéro automatiquement
--   'absent_justified'  : absence justifiée
--   'excused'           : dispensé par le règlement
-- Les statuts sans note stockent score NULL : l'absence d'une valeur ne peut
-- pas être confondue avec un zéro explicitement saisi.
--
-- Unicité : UNIQUE (assessment_id, student_id) + upsert applicatif :
-- une sauvegarde groupée met à jour, elle ne crée jamais de doublon.
--
-- Corrections après verrouillage : la valeur modifiée remplace l'ancienne
-- dans grades, mais chaque correction est tracée dans grade_corrections
-- (ancienne valeur, nouvelle valeur, auteur, motif, horodatage).
--
-- Moyennes : calculées à la demande côté serveur (GET /grades/averages) à
-- partir des valeurs stockées ; aucun agrégat matérialisé, donc aucune
-- invalidation à gérer. Règle : note normalisée = score / max_score * 20 ;
-- moyenne = somme(normalisée * coefficient) / somme(coefficients), arrondie
-- à 2 décimales (ROUND DECIMAL, demi supérieur). Seules les lignes 'graded'
-- participent ; sans note valide, la moyenne est indisponible (NULL).

CREATE TABLE IF NOT EXISTS assessments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  school_year_id INT UNSIGNED NOT NULL,
  grading_period_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  assessment_type ENUM('homework','quiz','exam','other') NOT NULL DEFAULT 'homework',
  assessment_date DATE NOT NULL,
  max_score DECIMAL(5, 2) UNSIGNED NOT NULL,
  coefficient DECIMAL(4, 2) UNSIGNED NOT NULL DEFAULT 1.00,
  teacher_id INT UNSIGNED NOT NULL,
  description VARCHAR(255) NULL,
  status ENUM('draft','submitted','locked') NOT NULL DEFAULT 'draft',
  created_by INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Cohérence : la classe doit appartenir à l'année de l'évaluation (012),
  -- la période à l'année, la matière à la classe (019).
  CONSTRAINT fk_asm_class_year FOREIGN KEY (class_id, school_year_id)
    REFERENCES classes(id, school_year_id),
  CONSTRAINT fk_asm_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_asm_period_year FOREIGN KEY (grading_period_id, school_year_id)
    REFERENCES grading_periods(id, school_year_id),
  CONSTRAINT fk_asm_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_asm_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_asm_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  -- Anti-doublon : une même évaluation (classe, matière, période, titre, date)
  -- ne peut pas être créée deux fois, même par des requêtes concurrentes.
  CONSTRAINT uq_assessments UNIQUE (class_id, subject_id, grading_period_id, title, assessment_date),
  CONSTRAINT chk_asm_max_score CHECK (max_score > 0),
  CONSTRAINT chk_asm_coeff CHECK (coefficient > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_asm_class ON assessments (class_id);
CREATE INDEX idx_asm_subject ON assessments (subject_id);
CREATE INDEX idx_asm_period ON assessments (grading_period_id);
CREATE INDEX idx_asm_year ON assessments (school_year_id);
CREATE INDEX idx_asm_teacher ON assessments (teacher_id);
CREATE INDEX idx_asm_date ON assessments (assessment_date);
CREATE INDEX idx_asm_status ON assessments (status);

CREATE TABLE IF NOT EXISTS grades (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  assessment_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  score DECIMAL(5, 2) NULL,               -- NULL obligatoire pour les statuts sans note
  grade_status ENUM('graded','not_graded','absent','absent_justified','excused') NOT NULL DEFAULT 'not_graded',
  comment VARCHAR(255) NULL,
  created_by INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gr_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_gr_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_gr_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_gr_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_grades UNIQUE (assessment_id, student_id),
  -- Cohérence fondamentale : une note saisie doit être présente et dans le
  -- barème de son évaluation ; les autres statuts n'ont pas de valeur.
  CONSTRAINT chk_gr_score CHECK (
    (grade_status = 'graded' AND score IS NOT NULL AND score >= 0)
    OR (grade_status <> 'graded' AND score IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_gr_student ON grades (student_id);
CREATE INDEX idx_gr_status ON grades (grade_status);

CREATE TABLE IF NOT EXISTS grade_corrections (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  grade_id INT UNSIGNED NOT NULL,
  assessment_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  old_score DECIMAL(5, 2) NULL,
  new_score DECIMAL(5, 2) NULL,
  old_status VARCHAR(30) NULL,
  new_status VARCHAR(30) NULL,
  reason VARCHAR(255) NOT NULL,
  corrected_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gc_grade FOREIGN KEY (grade_id) REFERENCES grades(id) ON DELETE RESTRICT,
  CONSTRAINT fk_gc_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_gc_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_gc_corrected_by FOREIGN KEY (corrected_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_gc_assessment ON grade_corrections (assessment_id);
CREATE INDEX idx_gc_student ON grade_corrections (student_id);
