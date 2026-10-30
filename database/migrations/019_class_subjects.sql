-- 019 : Affectation des matières aux classes (étape 4)
--
-- Une classe n'enseigne pas nécessairement toutes les matières du catalogue :
-- chaque ligne explicite (classe, matière) de l'année de la classe autorise
-- l'évaluation. Un professeur responsable peut être désigné par matière/classe ;
-- à défaut (teacher_id NULL), tout professeur affecté à la classe via
-- teacher_class_assignments peut y enseigner et évaluer cette matière
-- (règle documentée : l'affectation matière est facultative et plus précise).
--
-- Le coefficient de la matière dans la classe prime sur le coefficient par
-- défaut du catalogue s'il est renseigné.

CREATE TABLE IF NOT EXISTS class_subjects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  teacher_id INT UNSIGNED NULL,
  coefficient DECIMAL(4, 2) UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- La classe doit appartenir à une année scolaire (clé composite posée par 012).
  CONSTRAINT fk_cs_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cs_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cs_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cs_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_class_subjects UNIQUE (class_id, subject_id),
  CONSTRAINT chk_cs_coeff CHECK (coefficient IS NULL OR coefficient > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_cs_class ON class_subjects (class_id);
CREATE INDEX idx_cs_subject ON class_subjects (subject_id);
CREATE INDEX idx_cs_teacher ON class_subjects (teacher_id);
