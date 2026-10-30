-- 032 : Zone Élèves — œuvres d'élèves (dessins/coloriages)
CREATE TABLE IF NOT EXISTS student_artworks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  title VARCHAR(120) NOT NULL,
  image_path VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sa_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Réparation : la contrainte uq_classes_id_year (migration 012, ALTER TABLE)
-- n'est pas reproductible telle quelle sur SQLite ; or les FK de
-- annual_decisions / enrollments référencent classes(id, school_year_id) et
-- exigent un index UNIQUE sur ce couple. Nom inédit => idempotent sur MySQL
-- comme sur SQLite (le runner SQLite avale déjà les "already exists").
CREATE UNIQUE INDEX uq_classes_id_year_support ON classes (id, school_year_id);

-- Données de test idempotentes (uniquement si la base est vide) :
-- 1 niveau, 1 année scolaire, 1 classe, 2 élèves actifs + inscriptions.
-- (placées AVANT le CREATE INDEX : en cas de ré-exécution partielle, les
-- données sont réconciliées avant que l'index déjà existant ne stoppe le reste.)
INSERT INTO levels (name, order_index)
SELECT 'CP', 1
WHERE NOT EXISTS (SELECT 1 FROM levels WHERE name = 'CP');

INSERT INTO school_years (label, start_date, end_date, is_active)
SELECT '2025-2026', '2025-09-01', '2026-07-15', 1
WHERE NOT EXISTS (SELECT 1 FROM school_years WHERE label = '2025-2026');

INSERT INTO classes (name, level_id, school_year_id)
SELECT 'CP A', (SELECT id FROM levels WHERE name = 'CP'), (SELECT id FROM school_years WHERE label = '2025-2026')
WHERE NOT EXISTS (SELECT 1 FROM classes WHERE name = 'CP A');

INSERT INTO students (matricule, last_name, first_names, sex, status)
SELECT 'ELV-900001', 'Rakoto', 'Mila', 'F', 'active'
WHERE NOT EXISTS (SELECT 1 FROM students WHERE matricule = 'ELV-900001');

INSERT INTO students (matricule, last_name, first_names, sex, status)
SELECT 'ELV-900002', 'Rabe', 'Tovy', 'M', 'active'
WHERE NOT EXISTS (SELECT 1 FROM students WHERE matricule = 'ELV-900002');

INSERT INTO enrollments (student_id, school_year_id, class_id, enrollment_date, status)
SELECT s.id, (SELECT id FROM school_years WHERE label = '2025-2026'),
       (SELECT id FROM classes WHERE name = 'CP A'), '2025-09-01', 'active'
FROM students s
WHERE s.matricule IN ('ELV-900001', 'ELV-900002')
  AND NOT EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = s.id AND e.status = 'active'
  );

CREATE INDEX idx_sa_student ON student_artworks (student_id);
