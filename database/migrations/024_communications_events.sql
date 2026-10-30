-- 024 : Communications parents, événements scolaires et annonces internes (étape 7)
--
-- Module A : historique des communications école <-> responsables légaux.
-- Module B : événements scolaires (catégories, classes, participants nominatifs).
-- Module C : annonces internes ciblées (aucun canal externe automatique).
--
-- Aucune modification destructive : tables additives, historique conservé.
-- La participation à un événement est distincte du pointage d'entrée et de
-- l'appel en classe (tables existantes inchangées).

-- ========================= MODULE A : COMMUNICATIONS =========================

CREATE TABLE IF NOT EXISTS parent_contact_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  guardian_id INT UNSIGNED NOT NULL,
  school_year_id INT UNSIGNED NOT NULL,
  occurred_at DATETIME NOT NULL,
  direction ENUM('school_to_parent','parent_to_school','joint') NOT NULL,
  channel ENUM('call','visit','meeting','sms','whatsapp','other') NOT NULL,
  subject ENUM('absence','tardiness','grades','behavior','discipline','administrative','meeting','other') NOT NULL,
  summary TEXT NULL,
  action_decided VARCHAR(500) NULL,
  followup_due_date DATE NULL,
  followup_status ENUM('todo','ongoing','resolved','cancelled') NOT NULL DEFAULT 'todo',
  created_by INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pcl_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pcl_guardian FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pcl_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pcl_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pcl_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_pcl_student_date ON parent_contact_logs (student_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_pcl_followup ON parent_contact_logs (followup_status, followup_due_date);
CREATE INDEX IF NOT EXISTS idx_pcl_occurred ON parent_contact_logs (occurred_at);
CREATE INDEX IF NOT EXISTS idx_pcl_year ON parent_contact_logs (school_year_id);

-- Historique append-only des changements de statut / date de suivi.
CREATE TABLE IF NOT EXISTS parent_contact_followups (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contact_id INT UNSIGNED NOT NULL,
  followup_status ENUM('todo','ongoing','resolved','cancelled') NOT NULL,
  followup_due_date DATE NULL,
  note VARCHAR(500) NULL,
  changed_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pcf_contact FOREIGN KEY (contact_id) REFERENCES parent_contact_logs(id) ON DELETE CASCADE,
  CONSTRAINT fk_pcf_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_pcf_contact ON parent_contact_followups (contact_id, created_at);

-- ========================= MODULE B : ÉVÉNEMENTS =========================

CREATE TABLE IF NOT EXISTS school_event_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  color VARCHAR(20) NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_secat_name UNIQUE (name)
);

-- Catégories de base demandées (configurables ensuite par l'administration).
INSERT INTO school_event_categories (name, sort_order) VALUES
  ('Réunion des parents', 1),
  ('Ménage collectif', 2),
  ('Grand goûter', 3),
  ('Fête scolaire', 4),
  ('Activité pédagogique', 5),
  ('Réunion du personnel', 6),
  ('Distribution des bulletins', 7),
  ('Autre événement', 8);

CREATE TABLE IF NOT EXISTS school_events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  category_id INT UNSIGNED NOT NULL,
  description TEXT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  location VARCHAR(150) NULL,
  school_year_id INT UNSIGNED NOT NULL,
  audience ENUM('all_students','selected_classes','parents','staff') NOT NULL DEFAULT 'selected_classes',
  organizer_id INT UNSIGNED NULL,
  logistics TEXT NULL,
  budget_estimated DECIMAL(12,2) NULL,
  status ENUM('draft','planned','completed','cancelled','archived') NOT NULL DEFAULT 'draft',
  summary TEXT NULL,
  created_by INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_se_category FOREIGN KEY (category_id) REFERENCES school_event_categories(id) ON DELETE RESTRICT,
  CONSTRAINT fk_se_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_se_organizer FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_se_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_se_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_se_start ON school_events (start_at);
CREATE INDEX IF NOT EXISTS idx_se_status ON school_events (status, start_at);
CREATE INDEX IF NOT EXISTS idx_se_category ON school_events (category_id);
CREATE INDEX IF NOT EXISTS idx_se_year ON school_events (school_year_id);

CREATE TABLE IF NOT EXISTS school_event_classes (
  event_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (event_id, class_id),
  CONSTRAINT fk_sec_event FOREIGN KEY (event_id) REFERENCES school_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_sec_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sec_class ON school_event_classes (class_id);

-- Participants nominatifs : présence saisie uniquement par un utilisateur
-- (jamais déduite de la classe de l'élève), distincte du pointage scolaire.
CREATE TABLE IF NOT EXISTS school_event_participants (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  confirmed TINYINT(1) NOT NULL DEFAULT 0,
  attendance ENUM('unknown','present','absent') NOT NULL DEFAULT 'unknown',
  notes VARCHAR(255) NULL,
  recorded_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_separt UNIQUE (event_id, student_id),
  CONSTRAINT fk_separt_event FOREIGN KEY (event_id) REFERENCES school_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_separt_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_separt_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_separt_student ON school_event_participants (student_id);

-- ========================= MODULE C : ANNONCES =========================

CREATE TABLE IF NOT EXISTS school_announcements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  content TEXT NOT NULL,
  author_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  created_by INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sann_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sann_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sann_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sa_status ON school_announcements (status, published_at);
CREATE INDEX IF NOT EXISTS idx_sa_expires ON school_announcements (expires_at);

-- Destinataires : une ligne = soit un rôle, soit une classe.
CREATE TABLE IF NOT EXISTS school_announcement_targets (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  announcement_id INT UNSIGNED NOT NULL,
  role_id TINYINT UNSIGNED NULL,
  class_id INT UNSIGNED NULL,
  CONSTRAINT uq_sat_role CHECK (role_id IS NULL OR class_id IS NULL),
  CONSTRAINT fk_sat_announcement FOREIGN KEY (announcement_id) REFERENCES school_announcements(id) ON DELETE CASCADE,
  CONSTRAINT fk_sat_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sat_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sat_class ON school_announcement_targets (class_id);
CREATE INDEX IF NOT EXISTS idx_sat_role ON school_announcement_targets (role_id);

-- ========================= PERMISSIONS =========================

INSERT INTO permissions (code, label) VALUES
  ('parent_contacts.view', 'Consulter les communications avec les parents'),
  ('parent_contacts.manage', 'Enregistrer et modifier les communications avec les parents'),
  ('school_events.view', 'Consulter les événements scolaires'),
  ('school_events.manage', 'Créer et modifier les événements scolaires'),
  ('school_events.manage_participants', 'Gérer les participants et les présences d''un événement'),
  ('school_announcements.view', 'Consulter les annonces internes'),
  ('school_announcements.manage', 'Créer, publier et archiver les annonces internes')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Administration : accès complet
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code IN (
  'parent_contacts.view','parent_contacts.manage',
  'school_events.view','school_events.manage','school_events.manage_participants',
  'school_announcements.view','school_announcements.manage'
)
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;

-- Professeur : communications limitées côté serveur à ses classes affectées
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'teacher' AND p.code IN (
  'parent_contacts.view','parent_contacts.manage',
  'school_events.view','school_events.manage','school_events.manage_participants',
  'school_announcements.view'
)
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;

-- Agent d'accueil : consultation seule (événements et annonces)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'reception' AND p.code IN ('school_events.view','school_announcements.view')
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;
