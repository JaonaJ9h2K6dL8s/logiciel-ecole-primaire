-- 031 : Préférences d'apparence et de mascottes par utilisateur (étape 22)
--
-- Non destructive : création d'une nouvelle table, aucune donnée existante
-- modifiée ou supprimée. Idempotent (CREATE TABLE IF NOT EXISTS), conformément
-- aux conventions du projet. Une seule ligne par utilisateur (UNIQUE user_id).
-- Les préférences sont strictement personnelles : lecture/écriture uniquement
-- via la session authentifiée (GET/PUT /appearance/settings).
--
-- NULL = valeur non personnalisée -> l'interface applique la valeur par défaut.
-- La colonne users.theme_preference (030) reste inchangée : le mode clair/
-- sombre est désormais porté par cette table (theme_mode), sans toucher aux
-- tables d'authentification existantes.

CREATE TABLE IF NOT EXISTS user_appearance_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  primary_color VARCHAR(7) NULL COMMENT 'Couleur principale #RRGGBB ; NULL = défaut',
  secondary_color VARCHAR(7) NULL COMMENT 'Couleur secondaire #RRGGBB ; NULL = défaut',
  accent_color VARCHAR(7) NULL COMMENT 'Couleur d''accentuation #RRGGBB ; NULL = défaut',
  theme_mode ENUM('light','dark','system') NULL DEFAULT NULL COMMENT 'Mode ; NULL = défaut (system)',
  background_type ENUM('none','solid','gradient','pattern','scene') NULL DEFAULT NULL COMMENT 'Type de fond ; NULL = aucun',
  background_id VARCHAR(64) NULL COMMENT 'Identifiant du fond choisi dans sa catégorie',
  background_opacity TINYINT UNSIGNED NULL COMMENT 'Intensité du fond 0-100 ; NULL = défaut',
  background_scope ENUM('dashboard','app') NULL DEFAULT NULL COMMENT 'Portée du fond ; NULL = dashboard',
  border_radius TINYINT UNSIGNED NULL COMMENT 'Arrondi global 0-24 px ; NULL = défaut',
  selected_mascot_id VARCHAR(32) NULL COMMENT 'Mascotte favorite ; NULL = défilement libre',
  mascot_animation VARCHAR(16) NULL COMMENT 'Animation préférée ; NULL = idle',
  mascot_carousel_enabled TINYINT(1) NULL COMMENT 'Défilement automatique ; NULL = activé',
  mascot_carousel_interval SMALLINT UNSIGNED NULL COMMENT 'Intervalle en secondes ; NULL = défaut (8)',
  mascot_enabled TINYINT(1) NULL COMMENT 'Mascottes visibles ; NULL = visibles',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_appearance_user (user_id),
  CONSTRAINT fk_appearance_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT 'Préférences d''apparence personnelles (thème, fond, mascottes)';
