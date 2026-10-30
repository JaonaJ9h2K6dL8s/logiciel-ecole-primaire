-- 030 : Préférence de thème individuelle (étape 19)
--
-- Non destructive : ajout d'une seule colonne, aucune donnée modifiée ou
-- supprimée. Idempotent (ADD COLUMN IF NOT EXISTS), conformément aux
-- conventions du projet.
--
-- NULL = aucune préférence explicite -> l'interface applique le défaut
-- « system » (suit le système d'exploitation). Le choix est personnel :
-- lecture/écriture uniquement via la session authentifiée (PATCH /auth/me/theme).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS theme_preference ENUM('light','dark','system') NULL DEFAULT NULL
  COMMENT 'Préférence de thème personnelle ; NULL = défaut (system)';
