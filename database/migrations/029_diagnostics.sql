-- 029 : Module d'évaluation diagnostique — tests, compétences, questions,
-- tentatives, réponses (étape 14)
--
-- Non destructif : uniquement des créations de tables et d'index, insertion de
-- permissions. Aucune donnée existante n'est modifiée ou supprimée.
-- Idempotent : IF NOT EXISTS / ON DUPLICATE KEY UPDATE, conformément aux
-- conventions du projet.
--
-- Distinction métier : un test diagnostique n'est ni une composition, ni une
-- note de bulletin, ni un devoir — aucune écriture dans assessments/grades.

-- ========================= PERMISSIONS =========================

INSERT INTO permissions (code, label) VALUES
  ('diagnostics.view', 'Consulter les évaluations diagnostiques et leurs résultats'),
  ('diagnostics.manage', 'Créer, animer et corriger les évaluations diagnostiques')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Admin : tous les droits. Professeur : gestion et consultation limitées à ses
-- classes (le cloisonnement par classe est appliqué côté serveur).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin', 'teacher') AND p.code IN ('diagnostics.view', 'diagnostics.manage')
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;

-- ========================= TESTS DIAGNOSTIQUES =========================

CREATE TABLE IF NOT EXISTS diagnostic_tests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  school_year_id INT UNSIGNED NOT NULL,
  level_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  duration_minutes SMALLINT UNSIGNED NULL,
  opens_at DATETIME NULL,
  closes_at DATETIME NULL,
  status ENUM('draft','published','closed','archived') NOT NULL DEFAULT 'draft',
  -- Seuils pédagogiques configurables (%) : avancé >= advanced_min,
  -- intermédiaire >= intermediate_min, débutant en dessous.
  -- Données insuffisantes : ratio de réponses renseignées < min_answered_pct.
  threshold_intermediate_min TINYINT UNSIGNED NOT NULL DEFAULT 40,
  threshold_advanced_min TINYINT UNSIGNED NOT NULL DEFAULT 70,
  min_answered_pct TINYINT UNSIGNED NOT NULL DEFAULT 50,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_diag_test (class_id, subject_id, title),
  CONSTRAINT fk_dt_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_dt_level FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE RESTRICT,
  CONSTRAINT fk_dt_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_dt_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_dt_author FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_dt_th1 CHECK (threshold_intermediate_min BETWEEN 0 AND 100),
  CONSTRAINT chk_dt_th2 CHECK (threshold_advanced_min BETWEEN 0 AND 100),
  CONSTRAINT chk_dt_th3 CHECK (min_answered_pct BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_dt_class ON diagnostic_tests (class_id, status);
CREATE INDEX IF NOT EXISTS idx_dt_subject ON diagnostic_tests (subject_id);

-- ========================= COMPÉTENCES MESURÉES =========================

CREATE TABLE IF NOT EXISTS diagnostic_competencies (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  test_id INT UNSIGNED NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(200) NOT NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT uq_dc UNIQUE (test_id, code),
  CONSTRAINT fk_dc_test FOREIGN KEY (test_id) REFERENCES diagnostic_tests(id) ON DELETE CASCADE
);

-- ========================= QUESTIONS =========================

-- Types auto-corrigés : single_choice, multiple_choice, true_false,
-- short_answer (comparaison normalisée). Type à correction manuelle : open.
CREATE TABLE IF NOT EXISTS diagnostic_questions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  test_id INT UNSIGNED NOT NULL,
  competency_id INT UNSIGNED NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 1,
  question_type ENUM('single_choice','multiple_choice','true_false','short_answer','open')
    NOT NULL DEFAULT 'single_choice',
  statement TEXT NOT NULL,
  points DECIMAL(5,2) NOT NULL DEFAULT 1,
  options_json JSON NULL,
  -- Réponses attendues : JSON (indice/indices de choix, tableau de variantes
  -- acceptées pour short_answer, booléen pour true_false).
  expected_answer JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dq_test FOREIGN KEY (test_id) REFERENCES diagnostic_tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_dq_comp FOREIGN KEY (competency_id) REFERENCES diagnostic_competencies(id) ON DELETE SET NULL,
  CONSTRAINT chk_dq_points CHECK (points >= 0)
);

CREATE INDEX IF NOT EXISTS idx_dq_test ON diagnostic_questions (test_id, display_order);

-- ========================= TENTATIVES =========================

-- Une seule tentative par élève et par test : uq_da empêche la double
-- soumission et le double calcul. Les seuils sont snapshotés dans la
-- tentative pour conserver l'historique même si le test évolue ensuite.
CREATE TABLE IF NOT EXISTS diagnostic_attempts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  test_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  status ENUM('in_progress','submitted') NOT NULL DEFAULT 'in_progress',
  started_by INT UNSIGNED NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME NULL,
  submitted_by INT UNSIGNED NULL,
  score DECIMAL(6,2) NULL,
  max_score DECIMAL(6,2) NULL,
  percentage DECIMAL(5,2) NULL,
  answered_count INT UNSIGNED NOT NULL DEFAULT 0,
  question_count INT UNSIGNED NOT NULL DEFAULT 0,
  level ENUM('debutant','intermediaire','avance','insufficient_data') NULL,
  threshold_intermediate_min TINYINT UNSIGNED NULL,
  threshold_advanced_min TINYINT UNSIGNED NULL,
  min_answered_pct TINYINT UNSIGNED NULL,
  results_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_da UNIQUE (test_id, student_id),
  CONSTRAINT fk_da_test FOREIGN KEY (test_id) REFERENCES diagnostic_tests(id) ON DELETE CASCADE,
  CONSTRAINT fk_da_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_da_starter FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_da_submitter FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_da_student ON diagnostic_attempts (student_id, status);

-- ========================= RÉPONSES =========================

CREATE TABLE IF NOT EXISTS diagnostic_answers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attempt_id INT UNSIGNED NOT NULL,
  question_id INT UNSIGNED NOT NULL,
  answer_json JSON NULL,
  is_correct TINYINT(1) NULL,
  points_earned DECIMAL(5,2) NULL,
  -- Correction manuelle (questions « open ») par le professeur.
  manually_graded TINYINT(1) NOT NULL DEFAULT 0,
  graded_by INT UNSIGNED NULL,
  graded_at DATETIME NULL,
  CONSTRAINT uq_dans UNIQUE (attempt_id, question_id),
  CONSTRAINT fk_dans_attempt FOREIGN KEY (attempt_id) REFERENCES diagnostic_attempts(id) ON DELETE CASCADE,
  CONSTRAINT fk_dans_question FOREIGN KEY (question_id) REFERENCES diagnostic_questions(id) ON DELETE CASCADE,
  CONSTRAINT fk_dans_grader FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_dans_points CHECK (points_earned IS NULL OR points_earned >= 0)
);

CREATE INDEX IF NOT EXISTS idx_dans_attempt ON diagnostic_answers (attempt_id);
