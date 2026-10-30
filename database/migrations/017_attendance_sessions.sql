-- 017 : Appel en classe — séances et présences (module B)
--
-- Identité d'une séance : (classe, date scolaire, numéro de séance).
-- La contrainte UNIQUE empêche la création concurrente de plusieurs appels
-- actifs pour la même séance : le second INSERT échoue (ER_DUP_ENTRY) et
-- l'API répond 409. Une modification d'appel met à jour la ligne existante
-- (UNIQUE (session_id, student_id) + upsert), jamais une deuxième ligne.
--
-- Les élèves listés pour une séance sont ceux réellement inscrits dans la
-- classe à la date de la séance (enrollment_date <= date et sortie absente
-- ou postérieure) : un élève inscrit après la date n'apparaît pas
-- rétroactivement comme absent.
--
-- Également : horaires de référence des séances (facultatifs) pour le
-- rapprochement, ajoutés à school_settings sans toucher aux colonnes existantes.

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  class_id INT UNSIGNED NOT NULL,
  school_year_id INT UNSIGNED NOT NULL,
  session_date DATE NOT NULL,
  slot TINYINT UNSIGNED NOT NULL,               -- numéro de séance dans la journée (1, 2, …)
  teacher_id INT UNSIGNED NULL,                 -- professeur ayant réalisé l'appel
  status ENUM('draft','submitted') NOT NULL DEFAULT 'draft',
  created_by INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_attendance_session UNIQUE (class_id, session_date, slot),
  CONSTRAINT fk_att_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_att_class_year FOREIGN KEY (class_id, school_year_id)
    REFERENCES classes(id, school_year_id),
  CONSTRAINT fk_att_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_att_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_att_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_att_slot CHECK (slot BETWEEN 1 AND 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_att_date ON attendance_sessions (session_date);
CREATE INDEX idx_att_class_date ON attendance_sessions (class_id, session_date);
CREATE INDEX idx_att_teacher ON attendance_sessions (teacher_id);
CREATE INDEX idx_att_status ON attendance_sessions (status);

CREATE TABLE IF NOT EXISTS attendance_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  status ENUM('PRESENT','ABSENT','LATE','EXCUSED') NOT NULL,
  comment VARCHAR(255) NULL,                    -- justification (obligatoire pour EXCUSED)
  created_by INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_attendance_record UNIQUE (session_id, student_id),
  CONSTRAINT fk_attrec_session FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_attrec_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_attrec_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_attrec_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_attrec_student ON attendance_records (student_id);
CREATE INDEX idx_attrec_status ON attendance_records (status);

-- Horaires de référence des séances pour le rapprochement (facultatif).
-- Format JSON : {"1":"07:30","2":"09:45",...} — heure locale Indian/Antananarivo.
-- Sans cette configuration, les comparaisons horaires du rapprochement sont
-- signalées comme impossibles plutôt que devinées.
ALTER TABLE school_settings
  ADD COLUMN slot_start_times JSON NULL AFTER document_footer;
