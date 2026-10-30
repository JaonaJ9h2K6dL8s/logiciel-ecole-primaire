-- 022 : Résultats annuels et décisions de passage (étape 5)
--
-- Les résultats annuels (GET /annual-results) sont calculés à la demande :
-- moyenne annuelle pondérée = Σ(moyenne de période × coefficient matière
-- et pondération de période) / Σ(pondérations), uniquement sur les valeurs
-- valides — aucune période absente n'est convertie en zéro. Sans règles de
-- passage configurées par l'établissement, aucune décision n'est déduite :
-- la décision reste explicitement « pending ».
--
-- annual_decisions : décision administrative explicite prise par une
-- personne autorisée (annual_decisions.manage), justifiée si nécessaire et
-- auditée. Ce n'est jamais un calcul automatique.

CREATE TABLE IF NOT EXISTS annual_decisions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,             -- classe de fin d'année concernée
  school_year_id INT UNSIGNED NOT NULL,
  decision ENUM('promoted','repeats','other') NULL,  -- NULL = en attente de décision
  other_label VARCHAR(100) NULL,              -- libellé libre si decision = 'other'
  comment VARCHAR(500) NULL,
  decided_by INT UNSIGNED NULL,
  decided_at DATETIME NULL,
  created_by INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ad_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ad_class_year FOREIGN KEY (class_id, school_year_id)
    REFERENCES classes(id, school_year_id),
  CONSTRAINT fk_ad_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ad_decided_by FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ad_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ad_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  -- Une seule ligne décisionnelle par élève et par année (upsert applicatif).
  CONSTRAINT uq_annual_decisions UNIQUE (student_id, school_year_id),
  CONSTRAINT chk_ad_other CHECK (decision <> 'other' OR other_label IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_ad_year ON annual_decisions (school_year_id);
CREATE INDEX idx_ad_class ON annual_decisions (class_id);

-- Permissions (réutilise celles de 021) : rien à ajouter ici, la décision
-- annuelle est couverte par annual_decisions.manage / annual_results.view.
