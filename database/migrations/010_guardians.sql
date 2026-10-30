-- 010 : Responsables légaux
-- Relationship : père, mère, tuteur légal ou autre (libellé libre dans student_guardians).
-- Téléphones : format local malgache (ex. 034 00 000 00) ou international (+261...).
CREATE TABLE IF NOT EXISTS guardians (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  last_name VARCHAR(80) NOT NULL,
  first_names VARCHAR(120) NOT NULL,
  relationship ENUM('father','mother','legal_guardian','other') NOT NULL DEFAULT 'other',
  phone_main VARCHAR(30) NOT NULL,
  phone_secondary VARCHAR(30) NULL,
  email VARCHAR(150) NULL,
  address VARCHAR(255) NULL,
  status ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_guardians_last_name ON guardians (last_name);
CREATE INDEX idx_guardians_phone ON guardians (phone_main);
