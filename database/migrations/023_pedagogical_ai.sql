-- 023 : Assistant IA pédagogique hybride (étape 6)
--
-- Accès réservé aux professeurs autorisés et à l'administration pédagogique.
-- Les élèves et les responsables n'ont aucun accès à ce module.
--
-- Confidentialité :
-- - Les clés API des fournisseurs vivent UNIQUEMENT dans l'environnement du
--   serveur : jamais en base, jamais dans les journaux, jamais au navigateur.
-- - ai_config stocke uniquement la configuration non secrète (fournisseur,
--   modèle, URL de base facultative) et le résultat du dernier contrôle.
-- - ai_documents conserve le TEXTE extrait (aperçu/corrigé par le prof) ;
--   le fichier original n'est pas conservé (limites de stockage) ; seule
--   l'empreinte de validation (taille, type) est gardée.
-- - ai_content : brouillons pédagogiques liés à leur auteur. Statuts :
--   generated (proposition IA) | edited (modifié par le prof) |
--   validated (accepté pour usage pédagogique) | archived.
--   Un brouillon privé n'est visible que de son auteur et de
--   l'administration (jamais partagé automatiquement).
--
-- Aucune table métier existante n'est modifiée. L'IA n'écrit jamais dans
-- notes, appréciations, bulletins ou décisions : toutes ses sorties sont
-- des propositions dans ai_content, à reprendre manuellement.

CREATE TABLE IF NOT EXISTS ai_config (
  id TINYINT UNSIGNED PRIMARY KEY,              -- singleton id = 1
  provider ENUM('none','openai','anthropic','ollama') NOT NULL DEFAULT 'none',
  model VARCHAR(120) NULL,
  base_url VARCHAR(300) NULL,                   -- surcharge facultative (proxy, local)
  last_check_ok TINYINT(1) NULL,                -- NULL = jamais testé
  last_check_at DATETIME NULL,
  last_check_message VARCHAR(300) NULL,
  updated_by INT UNSIGNED NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_aicfg_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO ai_config (id, provider) VALUES (1, 'none')
ON DUPLICATE KEY UPDATE id = id;

CREATE TABLE IF NOT EXISTS ai_documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uploaded_by INT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  extraction_method ENUM('plain','pdf','docx','none') NOT NULL,
  extraction_status ENUM('extracted','partial','failed','unsupported') NOT NULL,
  extracted_text MEDIUMTEXT NULL,               -- aperçu modifiable par le prof
  char_count INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_aidoc_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS idx_aidoc_uploader ON ai_documents (uploaded_by);
CREATE INDEX IF NOT EXISTS idx_aidoc_created ON ai_documents (created_at);

CREATE TABLE IF NOT EXISTS ai_content (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  author_id INT UNSIGNED NOT NULL,
  kind ENUM('course','exercises','explanation','remediation','fiche') NOT NULL,
  title VARCHAR(200) NOT NULL,
  subject_id INT UNSIGNED NULL,
  level_id INT UNSIGNED NULL,
  class_id INT UNSIGNED NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'fr',
  content JSON NOT NULL,                        -- sortie structurée, modifiable
  content_text MEDIUMTEXT NULL,                 -- copie texte (recherche/export)
  status ENUM('generated','edited','validated','archived') NOT NULL DEFAULT 'generated',
  source_document_id INT UNSIGNED NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_aic_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_aic_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  CONSTRAINT fk_aic_level FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE SET NULL,
  CONSTRAINT fk_aic_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_aic_source FOREIGN KEY (source_document_id) REFERENCES ai_documents(id) ON DELETE SET NULL,
  CONSTRAINT fk_aic_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX IF NOT EXISTS idx_aic_author ON ai_content (author_id);
CREATE INDEX IF NOT EXISTS idx_aic_kind_status ON ai_content (kind, status);
CREATE INDEX IF NOT EXISTS idx_aic_subject ON ai_content (subject_id);
CREATE INDEX IF NOT EXISTS idx_aic_title ON ai_content (title);
CREATE FULLTEXT INDEX IF NOT EXISTS ft_aic_text ON ai_content (title, content_text);

-- Permissions : usage professeurs + admin ; configuration = admin.
INSERT INTO permissions (code, label) VALUES
  ('pedagogical_ai.use', 'Utiliser l''assistant IA pédagogique'),
  ('pedagogical_ai.manage', 'Configurer l''assistant IA pédagogique')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code IN ('pedagogical_ai.use', 'pedagogical_ai.manage')
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'teacher' AND p.code = 'pedagogical_ai.use'
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;
