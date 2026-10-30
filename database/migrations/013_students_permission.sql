-- 013 : Permission du module Élèves (étape 2)
INSERT INTO permissions (code, label) VALUES
  ('students.manage', 'Gérer les élèves, responsables légaux et inscriptions')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code = 'students.manage'
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;
