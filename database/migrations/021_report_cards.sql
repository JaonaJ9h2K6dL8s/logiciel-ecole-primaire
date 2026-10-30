-- 021 : Bulletins scolaires (étape 5)
--
-- Bulletin : un par (élève, période). La classe et l'année du bulletin sont
-- celles de la classe notifiée à la génération (inscription en cours à la
-- fin de la période) : un changement de classe ultérieur ne modifie jamais
-- un bulletin existant.
--
-- États : draft (préparé, recalculable) | ready (vérifié par le professeur) |
-- validated (validé par la direction, valeurs figées) | locked (final) |
-- cancelled (annulation exceptionnelle audité).
--
-- Stratégie de fidélité : les lignes report_card_lines portent les valeurs
-- calculées au moment de la génération. À la validation, une révision
-- (report_card_revisions) fige un instantané JSON complet ; ensuite le
-- service compare à chaque consultation le recalcul source à l'instantané
-- et signale la dérive (sourceDrift) sans jamais modifier le bulletin
-- validé. Une correction (grades.correct sur une note source) impose une
-- procédure explicite de révision (POST /report-cards/:id/corrections),
-- motif obligatoire, historique conservé, revision incrémentée.
--
-- Appréciations : par matière (professeur de la matière) et générale
-- (professeur titulaire de la classe ou administration). Modifiables tant
-- que le bulletin n'est pas validé ; après validation, elles sont figées
-- dans l'instantané et toute retouche passe par la procédure de correction.
--
-- Moyenne générale : Σ(moyenne matière × coefficient matière) /
-- Σ(coefficients des matières prises en compte) — DECIMAL, arrondi final
-- 2 décimales, NULL (indisponible) si aucune matière évaluée. Une matière
-- sans note valide n'entre jamais dans le dénominateur.

CREATE TABLE IF NOT EXISTS subject_appreciations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  school_year_id INT UNSIGNED NOT NULL,
  grading_period_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  comment VARCHAR(500) NOT NULL,
  author_id INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sa_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sa_class_year FOREIGN KEY (class_id, school_year_id)
    REFERENCES classes(id, school_year_id),
  CONSTRAINT fk_sa_period_year FOREIGN KEY (grading_period_id, school_year_id)
    REFERENCES grading_periods(id, school_year_id),
  CONSTRAINT fk_sa_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sa_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sa_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  -- Une seule appréciation par (élève, matière, période).
  CONSTRAINT uq_subject_appreciation UNIQUE (student_id, subject_id, grading_period_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_sa_period ON subject_appreciations (grading_period_id);
CREATE INDEX idx_sa_student ON subject_appreciations (student_id);

CREATE TABLE IF NOT EXISTS report_cards (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  school_year_id INT UNSIGNED NOT NULL,
  grading_period_id INT UNSIGNED NOT NULL,
  status ENUM('draft','ready','validated','locked','cancelled') NOT NULL DEFAULT 'draft',
  general_average DECIMAL(5, 2) NULL,          -- NULL = moyenne indisponible
  total_coefficient DECIMAL(6, 2) NULL,        -- somme des coefficients pris en compte
  subjects_graded INT UNSIGNED NOT NULL DEFAULT 0,
  subjects_total INT UNSIGNED NOT NULL DEFAULT 0,
  general_comment VARCHAR(1000) NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  prepared_by INT UNSIGNED NULL,
  validated_by INT UNSIGNED NULL,
  validated_at DATETIME NULL,
  locked_by INT UNSIGNED NULL,
  locked_at DATETIME NULL,
  created_by INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rc_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rc_class_year FOREIGN KEY (class_id, school_year_id)
    REFERENCES classes(id, school_year_id),
  CONSTRAINT fk_rc_period_year FOREIGN KEY (grading_period_id, school_year_id)
    REFERENCES grading_periods(id, school_year_id),
  CONSTRAINT fk_rc_prepared_by FOREIGN KEY (prepared_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_rc_validated_by FOREIGN KEY (validated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_rc_locked_by FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_rc_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rc_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  -- Un seul bulletin par élève et par période (les requêtes concurrentes de
  -- génération se résolvent par upsert, jamais par doublon).
  CONSTRAINT uq_report_cards UNIQUE (student_id, grading_period_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_rc_period ON report_cards (grading_period_id);
CREATE INDEX idx_rc_class ON report_cards (class_id);
CREATE INDEX idx_rc_year ON report_cards (school_year_id);
CREATE INDEX idx_rc_status ON report_cards (status);

CREATE TABLE IF NOT EXISTS report_card_lines (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_card_id INT UNSIGNED NOT NULL,
  subject_id INT UNSIGNED NOT NULL,
  -- Copies de fidélité : le bulletin validé reste lisible même si la matière
  -- est renommée ou détachée de la classe plus tard.
  subject_name VARCHAR(100) NOT NULL,
  coefficient DECIMAL(4, 2) UNSIGNED NOT NULL,
  average DECIMAL(5, 2) NULL,                  -- NULL = matière non évaluée
  evaluations_count INT UNSIGNED NOT NULL DEFAULT 0,
  grading_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_rcl_card FOREIGN KEY (report_card_id) REFERENCES report_cards(id) ON DELETE CASCADE,
  CONSTRAINT fk_rcl_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  CONSTRAINT uq_report_card_lines UNIQUE (report_card_id, subject_id),
  CONSTRAINT chk_rcl_coeff CHECK (coefficient > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_rcl_subject ON report_card_lines (subject_id);

CREATE TABLE IF NOT EXISTS report_card_revisions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_card_id INT UNSIGNED NOT NULL,
  revision INT UNSIGNED NOT NULL,
  action ENUM('generated','ready','validated','locked','corrected','cancelled') NOT NULL,
  reason VARCHAR(500) NULL,                    -- motif obligatoire pour corrected/cancelled
  snapshot JSON NULL,                          -- instantané complet à la validation
  actor_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rcr_card FOREIGN KEY (report_card_id) REFERENCES report_cards(id) ON DELETE CASCADE,
  CONSTRAINT fk_rcr_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT
  -- Pas d'unicité (revision, action) : plusieurs générations peuvent avoir
  -- lieu au même numéro de révision (rafraîchissements successifs en brouillon).
  -- L'historique est append-only ; l'ordre est donné par created_at/id.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_rcr_card ON report_card_revisions (report_card_id);

-- Permissions du module bulletins.
INSERT INTO permissions (code, label) VALUES
  ('report_cards.view', 'Consulter les bulletins'),
  ('report_cards.manage', 'Préparer et modifier les bulletins'),
  ('report_cards.validate', 'Valider les bulletins'),
  ('report_cards.lock', 'Verrouiller les bulletins'),
  ('report_cards.correct', 'Corriger les bulletins verrouillés'),
  ('annual_results.view', 'Consulter les résultats annuels'),
  ('annual_decisions.manage', 'Statuer sur le passage des élèves')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Admin : toutes les permissions du module.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code IN (
  'report_cards.view','report_cards.manage','report_cards.validate','report_cards.lock',
  'report_cards.correct','annual_results.view','annual_decisions.manage'
);

-- Professeur : consultation bulletins + résultats annuels de ses classes,
-- préparation et appréciations de ses matières. Jamais la validation,
-- le verrouillage ni les décisions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'teacher' AND p.code IN (
  'report_cards.view','report_cards.manage','annual_results.view'
);
