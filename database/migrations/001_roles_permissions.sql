-- 001 : Rôles et permissions
CREATE TABLE IF NOT EXISTS roles (
  id TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS permissions (
  id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  label VARCHAR(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TINYINT UNSIGNED NOT NULL,
  permission_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rôles du socle (étape 1). Les espaces professeur / accueil seront développés plus tard.
INSERT INTO roles (code, label) VALUES
  ('admin', 'Administrateur'),
  ('teacher', 'Professeur'),
  ('reception', 'Agent d''accueil')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Permissions du socle administrateur
INSERT INTO permissions (code, label) VALUES
  ('dashboard.view', 'Consulter le tableau de bord'),
  ('users.manage', 'Gérer les comptes utilisateurs'),
  ('school_years.manage', 'Gérer les années scolaires'),
  ('academics.manage', 'Gérer les niveaux et les classes'),
  ('settings.manage', 'Gérer les paramètres de l''établissement'),
  ('audit.view', 'Consulter les journaux d''audit')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Seul l'administrateur possède les permissions du socle.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'admin'
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;
