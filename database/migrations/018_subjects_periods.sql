-- 018 : Matières et périodes d'évaluation (étape 4)
--
-- Matières : catalogue global de l'établissement (code unique), affectées
-- ensuite aux classes via class_subjects (019). Le coefficient par défaut est
-- facultatif : l'établissement peut ne pas pondérer par matière.
--
-- Périodes d'évaluation : entièrement configurables (trimestres, semestres,
-- ou tout autre découpage). Aucun nombre codé en dur. Le chevauchement des
-- périodes d'une même année est interdit (validation applicative
-- sérialisée par un SELECT ... FOR UPDATE sur l'année — MariaDB n'offre pas
-- de contrainte d'exclusion). Le verrouillage empêche les nouvelles saisies
-- et modifications non autorisées sans supprimer les résultats existants.
--
-- Permissions du module pédagogique :
--   admin    : toutes les permissions ci-dessous
--   teacher  : consultation des matières, gestion des évaluations et des notes
--              (côté serveur : limitées à ses classes et matières affectées)
--   reception: aucune permission pédagogique

CREATE TABLE IF NOT EXISTS subjects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  default_coefficient DECIMAL(4, 2) UNSIGNED NULL, -- NULL = pas de pondération par matière
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_subjects_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_subjects_coeff CHECK (default_coefficient IS NULL OR default_coefficient > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_subjects_active ON subjects (is_active);

CREATE TABLE IF NOT EXISTS grading_periods (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_year_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL,
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gp_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_gp_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_grading_periods UNIQUE (school_year_id, name),
  -- Clé composite requise par la FK (grading_period_id, school_year_id) de 020.
  CONSTRAINT uq_gp_id_year UNIQUE (id, school_year_id),
  CONSTRAINT uq_grading_periods_order UNIQUE (school_year_id, display_order),
  CONSTRAINT chk_gp_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_gp_order CHECK (display_order > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_gp_year ON grading_periods (school_year_id);
CREATE INDEX idx_gp_dates ON grading_periods (start_date, end_date);

INSERT INTO permissions (code, label) VALUES
  ('subjects.view', 'Consulter les matières'),
  ('subjects.manage', 'Gérer les matières'),
  ('periods.manage', 'Gérer les périodes d''évaluation'),
  ('assessments.view', 'Consulter les évaluations et les notes'),
  ('assessments.manage', 'Créer et modifier ses évaluations'),
  ('grades.manage', 'Saisir les notes de ses évaluations'),
  ('grades.correct', 'Corriger les notes après verrouillage'),
  ('grades.lock', 'Verrouiller et déverrouiller les évaluations')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code IN (
  'subjects.view','subjects.manage','periods.manage','assessments.view',
  'assessments.manage','grades.manage','grades.correct','grades.lock'
)
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'teacher' AND p.code IN ('subjects.view','assessments.view','assessments.manage','grades.manage')
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;
