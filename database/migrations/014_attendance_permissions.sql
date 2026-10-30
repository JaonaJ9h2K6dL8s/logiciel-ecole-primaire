-- 014 : Permissions des modules Pointage et Appel (étape 3)
-- Principe du moindre privilège :
--   admin      : toutes les permissions du socle + élèves + pointage + appel + rapprochement
--   reception  : pointage (effectuer + consulter) uniquement
--   teacher    : appel en classe (ses classes autorisées uniquement) + consultation
INSERT INTO permissions (code, label) VALUES
  ('entry_punches.manage', 'Effectuer et corriger les pointages d''entrée/sortie'),
  ('entry_punches.view', 'Consulter l''historique des pointages'),
  ('attendance.manage', 'Réaliser l''appel en classe'),
  ('attendance.view', 'Consulter les appels et les présences'),
  ('attendance.reconcile', 'Consulter le rapprochement pointage / appel'),
  ('attendance.correct', 'Corriger ou rouvrir un appel validé')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Administrateur : toutes les nouvelles permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code IN (
  'entry_punches.manage','entry_punches.view','attendance.manage','attendance.view','attendance.reconcile','attendance.correct'
)
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;

-- Agent d'accueil : pointage uniquement
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'reception' AND p.code IN ('entry_punches.manage','entry_punches.view')
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;

-- Professeur : appel en classe (côté serveur, limité à ses classes affectées)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'teacher' AND p.code IN ('attendance.manage','attendance.view')
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;
