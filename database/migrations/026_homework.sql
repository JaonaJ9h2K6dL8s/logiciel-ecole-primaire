-- 026 : Module de gestion des devoirs et exercices (étape 10)
--
-- Non destructif : ajout de tables et d'une colonne nullable sur assessments
-- (traçage de l'intégration d'un devoir vers le module officiel des notes).
-- Aucune donnée existante n'est modifiée. Suppression physique évitée :
-- un devoir avec historique est archivé, jamais effacé.

-- ========================= PERMISSIONS =========================

INSERT INTO permissions (code, label) VALUES
  ('homework.view', 'Consulter les devoirs et exercices'),
  ('homework.manage', 'Créer et gérer les devoirs et exercices')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Administration : accès complet.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code IN ('homework.view', 'homework.manage')
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;

-- Professeurs : consultation et gestion (le serveur restreint ensuite
-- chaque action aux classes et matières affectées au professeur).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'teacher' AND p.code IN ('homework.view', 'homework.manage')
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;

-- ========================= DEVOIRS =========================

CREATE TABLE IF NOT EXISTS homework (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_year_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  teacher_id INT UNSIGNED NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  homework_type ENUM('homework','classwork','exam_revision','group_work','reading',
                     'corrected_exercise','practice_sheet','optional')
    NOT NULL DEFAULT 'homework',
  publish_date DATE NULL,
  due_date DATE NULL,
  estimated_minutes INT UNSIGNED NULL,
  max_score DECIMAL(5,2) NULL,
  status ENUM('draft','published','closed','archived') NOT NULL DEFAULT 'draft',
  corrections_published TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_hw_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_hw_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_hw_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_hw_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_hw_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_hw_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_hw_dates CHECK (publish_date IS NULL OR due_date IS NULL OR due_date >= publish_date)
);

CREATE INDEX IF NOT EXISTS idx_hw_year_status ON homework (school_year_id, status);
CREATE INDEX IF NOT EXISTS idx_hw_class_due ON homework (class_id, due_date);
CREATE INDEX IF NOT EXISTS idx_hw_subject ON homework (subject_id);
CREATE INDEX IF NOT EXISTS idx_hw_teacher ON homework (teacher_id);

-- Historique des changements de statut (devoir ou remise d'élève).
CREATE TABLE IF NOT EXISTS homework_status_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  homework_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NULL,
  old_status VARCHAR(30) NULL,
  new_status VARCHAR(30) NOT NULL,
  note VARCHAR(255) NULL,
  changed_by INT UNSIGNED NOT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hsh_homework FOREIGN KEY (homework_id) REFERENCES homework(id) ON DELETE CASCADE,
  CONSTRAINT fk_hsh_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  CONSTRAINT fk_hsh_actor FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_hsh_homework ON homework_status_history (homework_id, changed_at);

-- ========================= QUESTIONS =========================

CREATE TABLE IF NOT EXISTS homework_questions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  homework_id INT UNSIGNED NOT NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 1,
  question_type ENUM('free_text','calculation','short_answer','mcq','true_false',
                     'fill_blank','multi_part') NOT NULL DEFAULT 'free_text',
  statement TEXT NOT NULL,
  instructions TEXT NULL,
  points DECIMAL(5,2) NULL,
  options_json JSON NULL,
  expected_answer TEXT NULL,
  pedagogical_explanation TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hq_homework FOREIGN KEY (homework_id) REFERENCES homework(id) ON DELETE CASCADE,
  CONSTRAINT chk_hq_points CHECK (points IS NULL OR points >= 0)
);

CREATE INDEX IF NOT EXISTS idx_hq_homework ON homework_questions (homework_id, display_order);

-- ========================= AFFECTATIONS ÉLÈVES =========================

CREATE TABLE IF NOT EXISTS homework_assignments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  homework_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  assigned_by INT UNSIGNED NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_ha UNIQUE (homework_id, student_id),
  CONSTRAINT fk_ha_homework FOREIGN KEY (homework_id) REFERENCES homework(id) ON DELETE CASCADE,
  CONSTRAINT fk_ha_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ha_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ha_actor FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ha_student ON homework_assignments (student_id);

-- ========================= REMISES ET CORRECTIONS =========================

CREATE TABLE IF NOT EXISTS homework_submissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  homework_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  status ENUM('todo','started','submitted','late','graded','not_submitted')
    NOT NULL DEFAULT 'todo',
  submitted_at DATETIME NULL,
  recorded_by INT UNSIGNED NULL,
  comment TEXT NULL,
  feedback TEXT NULL,
  indicative_score DECIMAL(5,2) NULL,
  graded_by INT UNSIGNED NULL,
  graded_at DATETIME NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_hs UNIQUE (homework_id, student_id),
  CONSTRAINT fk_hs_homework FOREIGN KEY (homework_id) REFERENCES homework(id) ON DELETE CASCADE,
  CONSTRAINT fk_hs_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_hs_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_hs_grader FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_hs_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_hs_status ON homework_submissions (homework_id, status);
CREATE INDEX IF NOT EXISTS idx_hs_student ON homework_submissions (student_id);

-- ========================= INTÉGRATION AUX NOTES OFFICIELLES =========================

-- Traçage : un devoir intégré aux notes officielles crée UNE évaluation liée.
-- Idempotent : reprise possible si la migration avait été partiellement appliquée.
ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS homework_id INT UNSIGNED NULL;
ALTER TABLE assessments
  ADD FOREIGN KEY IF NOT EXISTS fk_asmt_homework
  (homework_id) REFERENCES homework(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_asmt_homework ON assessments (homework_id);
