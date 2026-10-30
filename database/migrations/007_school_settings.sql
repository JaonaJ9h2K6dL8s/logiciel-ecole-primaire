-- 007 : Paramètres de l'établissement (ligne unique id = 1)
CREATE TABLE IF NOT EXISTS school_settings (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  school_name VARCHAR(150) NOT NULL DEFAULT 'Établissement Scolaire',
  address VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  email VARCHAR(150) NULL,
  logo TEXT NULL, -- dataURL (image encodée, max ~400 Ko) ou URL
  timezone VARCHAR(60) NOT NULL DEFAULT 'Indian/Antananarivo',
  document_header VARCHAR(255) NULL, -- en-tête des futurs documents imprimables
  document_footer VARCHAR(255) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_school_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO school_settings (id, school_name) VALUES (1, 'Établissement Scolaire')
ON DUPLICATE KEY UPDATE school_name = school_settings.school_name;
