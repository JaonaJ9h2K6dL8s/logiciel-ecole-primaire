-- 009 : Élèves
-- Statut administratif : 'active' | 'departed' (départ) | 'archived' (archivage).
-- Aucune suppression physique : les dossiers sont conservés.
CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  matricule VARCHAR(20) NOT NULL UNIQUE,
  last_name VARCHAR(80) NOT NULL,
  first_names VARCHAR(120) NOT NULL,
  birth_date DATE NULL,
  sex ENUM('M','F') NULL,
  address VARCHAR(255) NULL,
  entry_date DATE NULL,
  status ENUM('active','departed','archived') NOT NULL DEFAULT 'active',
  created_by INT UNSIGNED NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_students_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_students_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_students_last_name ON students (last_name);
CREATE INDEX idx_students_first_names ON students (first_names);
CREATE INDEX idx_students_status ON students (status);

-- Compteur atomique de matricules (sérialise les créations concurrentes).
CREATE TABLE IF NOT EXISTS matricule_counters (
  scope VARCHAR(50) NOT NULL PRIMARY KEY,
  next_value BIGINT UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO matricule_counters (scope, next_value) VALUES ('student', 1)
ON DUPLICATE KEY UPDATE next_value = matricule_counters.next_value;
