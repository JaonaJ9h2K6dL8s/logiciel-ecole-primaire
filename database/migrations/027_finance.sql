-- 027 : Module de gestion financière — tarifs, frais dus, paiements, reçus, annulations (étape 11)
--
-- Non destructif : uniquement des créations de tables et d'index, insertion de
-- permissions. Aucune donnée existante n'est modifiée ou supprimée.
-- Montants : BIGINT en unités entières d'ariary (MGA) — aucun calcul en flottant.
-- Idempotent : toutes les instructions sont reprises sans erreur (IF NOT EXISTS,
-- ON DUPLICATE KEY UPDATE), conformément aux conventions du projet.

-- ========================= PERMISSIONS =========================

INSERT INTO permissions (code, label) VALUES
  ('finance.view', 'Consulter la situation financière'),
  ('finance.fees.manage', 'Gérer les tarifs de frais'),
  ('finance.charges.manage', 'Émettre et gérer les frais dus des élèves'),
  ('finance.payments.record', 'Enregistrer les paiements'),
  ('finance.receipts.view', 'Consulter et réimprimer les reçus'),
  ('finance.payments.cancel.request', 'Demander l’annulation d’un paiement'),
  ('finance.payments.cancel.approve', 'Approuver ou refuser les annulations de paiement'),
  ('finance.reports.view', 'Consulter les rapports financiers')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Accès financier refusé par défaut : seul le rôle admin obtient les permissions.
-- Aucun rôle comptable global n'est créé (décision documentée dans le rapport) ;
-- l'habilitation fine se fait par configuration explicite des rôles existants.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code IN (
  'finance.view', 'finance.fees.manage', 'finance.charges.manage', 'finance.payments.record',
  'finance.receipts.view', 'finance.payments.cancel.request', 'finance.payments.cancel.approve',
  'finance.reports.view'
)
ON DUPLICATE KEY UPDATE role_id = role_permissions.role_id;

-- ========================= TARIFS DE FRAIS =========================

CREATE TABLE IF NOT EXISTS fee_tariffs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_year_id INT UNSIGNED NOT NULL,
  level_id INT UNSIGNED NULL,
  class_id INT UNSIGNED NULL,
  fee_category ENUM('registration','tuition','exam','supplies','transport','canteen','other')
    NOT NULL DEFAULT 'other',
  name VARCHAR(150) NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  frequency ENUM('once','monthly','quarterly','annual','custom') NOT NULL DEFAULT 'once',
  applies_from DATE NULL,
  applies_to DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  description VARCHAR(500) NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Clé de périmètre générée : classe, sinon niveau, sinon 0 (toute l'année).
  -- Sert à l'unicité (anti-doublons) malgré les NULL.
  scope_key INT UNSIGNED AS (IFNULL(class_id, IFNULL(level_id, 0))) STORED,
  CONSTRAINT chk_tariff_amount CHECK (amount > 0),
  CONSTRAINT chk_tariff_dates CHECK (applies_from IS NULL OR applies_to IS NULL OR applies_to >= applies_from),
  CONSTRAINT chk_tariff_scope CHECK (level_id IS NULL OR class_id IS NULL),
  CONSTRAINT uq_tariff UNIQUE (school_year_id, fee_category, name, scope_key),
  CONSTRAINT fk_tariff_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tariff_level FOREIGN KEY (level_id) REFERENCES levels(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tariff_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tariff_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_tariff_year_active ON fee_tariffs (school_year_id, is_active);

-- ========================= FRAIS DUS DES ÉLÈVES =========================

CREATE TABLE IF NOT EXISTS student_fees (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id INT UNSIGNED NOT NULL,
  school_year_id INT UNSIGNED NOT NULL,
  class_id INT UNSIGNED NULL,          -- classe de l'élève au moment de l'émission (historique conservé)
  tariff_id INT UNSIGNED NULL,         -- origine : tarif utilisé (NULL = frais individuel)
  fee_category ENUM('registration','tuition','exam','supplies','transport','canteen','other')
    NOT NULL DEFAULT 'other',
  name VARCHAR(150) NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  due_date DATE NULL,
  status ENUM('pending','partial','paid','cancelled') NOT NULL DEFAULT 'pending',
  paid_amount BIGINT UNSIGNED NOT NULL DEFAULT 0,  -- maintenu en transaction (paiements confirmés)
  batch_id VARCHAR(40) NULL,           -- trace de la génération en lot
  notes VARCHAR(500) NULL,
  cancelled_at DATETIME NULL,
  cancelled_by INT UNSIGNED NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_sf_amount CHECK (amount > 0 AND paid_amount >= 0 AND paid_amount <= amount),
  CONSTRAINT chk_sf_status CHECK (status <> 'paid' OR paid_amount = amount),
  CONSTRAINT fk_sf_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sf_year FOREIGN KEY (school_year_id) REFERENCES school_years(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sf_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL,
  CONSTRAINT fk_sf_tariff FOREIGN KEY (tariff_id) REFERENCES fee_tariffs(id) ON DELETE SET NULL,
  CONSTRAINT fk_sf_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sf_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_sf_year_status ON student_fees (school_year_id, status);
CREATE INDEX IF NOT EXISTS idx_sf_student ON student_fees (student_id);
CREATE INDEX IF NOT EXISTS idx_sf_class_due ON student_fees (class_id, due_date);
CREATE INDEX IF NOT EXISTS idx_sf_tariff ON student_fees (tariff_id);
CREATE INDEX IF NOT EXISTS idx_sf_batch ON student_fees (batch_id);

-- ========================= PAIEMENTS =========================

CREATE TABLE IF NOT EXISTS finance_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_fee_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  method ENUM('cash','mvola','orange_money','airtel_money','bank_transfer','cheque','other') NOT NULL,
  reference VARCHAR(120) NULL,
  payer_name VARCHAR(150) NULL,
  comment VARCHAR(500) NULL,
  status ENUM('confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
  idempotency_key VARCHAR(64) NULL,    -- anti double-soumission (unique si fourni)
  recorded_by INT UNSIGNED NOT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  cancelled_by INT UNSIGNED NULL,
  CONSTRAINT chk_pay_amount CHECK (amount > 0),
  CONSTRAINT uq_pay_idem UNIQUE (idempotency_key),
  CONSTRAINT fk_pay_fee FOREIGN KEY (student_fee_id) REFERENCES student_fees(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pay_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pay_recorder FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pay_canceller FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pay_fee ON finance_payments (student_fee_id);
CREATE INDEX IF NOT EXISTS idx_pay_student ON finance_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_pay_status_date ON finance_payments (status, recorded_at);
CREATE INDEX IF NOT EXISTS idx_pay_method ON finance_payments (method);

-- ========================= REÇUS =========================

-- Séquence numérotée par année, verrouillée en transaction (FOR UPDATE) :
-- jamais de collision, jamais de réutilisation après annulation.
CREATE TABLE IF NOT EXISTS finance_receipt_sequences (
  year SMALLINT UNSIGNED PRIMARY KEY,
  last_number BIGINT UNSIGNED NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS finance_receipts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id INT UNSIGNED NOT NULL UNIQUE,
  receipt_number VARCHAR(30) NOT NULL UNIQUE,
  school_name VARCHAR(150) NOT NULL,   -- instantané (school_settings au moment de l'émission)
  student_name VARCHAR(220) NOT NULL,
  matricule VARCHAR(20) NOT NULL,
  class_name VARCHAR(80) NULL,
  year_label VARCHAR(30) NOT NULL,
  fee_name VARCHAR(150) NOT NULL,
  payer_name VARCHAR(150) NULL,
  amount BIGINT UNSIGNED NOT NULL,
  amount_in_words VARCHAR(400) NOT NULL,
  method ENUM('cash','mvola','orange_money','airtel_money','bank_transfer','cheque','other') NOT NULL,
  reference VARCHAR(120) NULL,
  balance_after BIGINT UNSIGNED NOT NULL,
  agent_name VARCHAR(120) NOT NULL,
  issued_by INT UNSIGNED NOT NULL,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reprint_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_reprint_at DATETIME NULL,
  last_reprint_by INT UNSIGNED NULL,
  CONSTRAINT fk_receipt_payment FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_receipt_issuer FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_receipt_reprinter FOREIGN KEY (last_reprint_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_receipt_issued_at ON finance_receipts (issued_at);

-- ========================= ANNULATIONS DE PAIEMENT =========================

CREATE TABLE IF NOT EXISTS finance_payment_cancellations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id INT UNSIGNED NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  requested_by INT UNSIGNED NOT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by INT UNSIGNED NULL,
  approved_at DATETIME NULL,
  rejection_reason VARCHAR(500) NULL,
  replacement_payment_id INT UNSIGNED NULL,  -- référence d'un paiement de remplacement éventuel
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_cxl_reason CHECK (CHAR_LENGTH(TRIM(reason)) > 0),
  CONSTRAINT fk_cxl_payment FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cxl_requester FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cxl_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cxl_replacement FOREIGN KEY (replacement_payment_id) REFERENCES finance_payments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cxl_status ON finance_payment_cancellations (status, requested_at);
CREATE INDEX IF NOT EXISTS idx_cxl_payment ON finance_payment_cancellations (payment_id);
