-- 016 : Pointages d'entrée / sortie de l'établissement (module A)
--
-- Horodatage : les instants sont produits par le serveur uniquement (jamais le navigateur).
-- Le pool mysql2 est configuré avec timezone '+03:00' (Indian/Antananarivo) : les DATETIME
-- stockés représentent l'heure légale malgache. `school_date` est une colonne générée
-- DATE(occurred_at) : date scolaire locale, indexée pour les recherches et rapports.
--
-- Anti-doublons :
--   - idempotency_key UNIQUE : une requête répétée (double clic, retry réseau) renvoie
--     l'événement d'origine au lieu d'en créer un second.
--   - Les transitions (arrivée sans sortie intermédiaire, sortie sans arrivée, etc.)
--     sont vérifiées dans la transaction avec SELECT ... FOR UPDATE sur l'élève,
--     ce qui sérialise les pointages concurrents d'un même élève.
--
-- Corrections : une correction ne modifie jamais l'original. La ligne d'origine passe
-- à status='corrected' et une nouvelle ligne validée est créée (corrects_punch_id),
-- avec le motif et les valeurs conservés dans entry_punch_corrections.

CREATE TABLE IF NOT EXISTS entry_punches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  school_year_id INT UNSIGNED NOT NULL,
  event_type ENUM('ARRIVAL','EXIT') NOT NULL,
  occurred_at DATETIME(3) NOT NULL,                       -- instant officiel de l'événement (serveur)
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), -- instant d'enregistrement (serveur)
  punched_by INT UNSIGNED NOT NULL,
  device_label VARCHAR(80) NULL,                          -- poste / appareil, informatif
  idempotency_key VARCHAR(64) NOT NULL UNIQUE,
  correlation_id VARCHAR(64) NULL,
  school_date DATE GENERATED ALWAYS AS (DATE(occurred_at)) STORED,
  status ENUM('valid','corrected') NOT NULL DEFAULT 'valid',
  corrects_punch_id BIGINT UNSIGNED NULL,                 -- ligne de remplacement issue d'une correction
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_punch_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_punch_year FOREIGN KEY (school_year_id) REFERENCES school_years(id),
  CONSTRAINT fk_punch_user FOREIGN KEY (punched_by) REFERENCES users(id),
  CONSTRAINT fk_punch_corrects FOREIGN KEY (corrects_punch_id) REFERENCES entry_punches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_punch_school_date ON entry_punches (school_date);
CREATE INDEX idx_punch_student_date ON entry_punches (student_id, school_date);
CREATE INDEX idx_punch_event_type ON entry_punches (event_type);
CREATE INDEX idx_punch_year ON entry_punches (school_year_id);
CREATE INDEX idx_punch_correlation ON entry_punches (correlation_id);

-- Journal des corrections : valeurs originales et de remplacement conservées, motif obligatoire.
CREATE TABLE IF NOT EXISTS entry_punch_corrections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  punch_id BIGINT UNSIGNED NOT NULL,
  replacement_punch_id BIGINT UNSIGNED NOT NULL,
  corrected_by INT UNSIGNED NOT NULL,
  reason VARCHAR(255) NOT NULL,
  old_values JSON NOT NULL,
  new_values JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_epc_punch FOREIGN KEY (punch_id) REFERENCES entry_punches(id),
  CONSTRAINT fk_epc_replacement FOREIGN KEY (replacement_punch_id) REFERENCES entry_punches(id),
  CONSTRAINT fk_epc_user FOREIGN KEY (corrected_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
