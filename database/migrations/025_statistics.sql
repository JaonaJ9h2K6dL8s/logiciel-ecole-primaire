-- 025 : Statistiques et centre de pilotage (étape 8)
--
-- Lecture seule : aucune table ajoutée ni modifiée, aucune donnée existante
-- touchée. Tous les indicateurs sont calculés à la demande (agrégats SQL)
-- à partir des tables des modules existants — aucun chiffre fictif, aucun
-- agrégat matérialisé à invalider.
--
-- Permission dédiée, distincte de dashboard.view (tableau de bord simple) :
-- l'administrateur peut l'accorder aux rôles de son choix depuis la gestion
-- des comptes.

INSERT INTO permissions (code, label) VALUES
  ('statistics.view', 'Consulter les statistiques et le centre de pilotage')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Administration : accès complet par défaut.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code = 'statistics.view'
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;

-- Professeurs : consultation (même logique que report_cards.view ; les
-- données sont globales à l'établissement).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'teacher' AND p.code = 'statistics.view'
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;
