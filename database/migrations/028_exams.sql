-- 028 : Examens et devoirs surveillés (étape 12)
--
-- Couche de planification au-dessus de la table `assessments` (020), qui
-- reste l'unique source des évaluations et des notes. Ajouts strictement
-- additifs : aucune colonne modifiée ou supprimée, aucun enregistrement
-- touché.
--
-- 1) Types additionnels : 'composition' et 'ds' (devoir surveillé) viennent
--    compléter l'ENUM existant ('homework','quiz','exam','other'). Les
--    valeurs existantes et les lignes historiques sont inchangées.
-- 2) Planification : heure de début (TIME, facultative) et durée en minutes
--    (facultative) pour les épreuves organisées en classe. Nulles pour les
--    évaluations antérieures et pour les types sans créneau (homework...).
-- 3) Index pour le calendrier et le tableau de bord examens.
--
-- Les chevauchements d'épreuves (même classe, même jour, créneaux qui se
-- recouvrent) sont détectés et signalés par le module /exams ; ils restent
-- un avertissement, jamais un blocage automatique. La validation fine
-- (durée positive, heure cohérente, date dans la période) est assurée par
-- les schémas Zod et les routes existantes.

-- 1) Élargissement du type d'évaluation (MOD idempotent : même résultat si ré-exécuté)
ALTER TABLE assessments
  MODIFY assessment_type ENUM('homework','quiz','exam','other','composition','ds')
  NOT NULL DEFAULT 'homework';

-- 2) Créneau horaire (facultatif)
ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS start_time TIME NULL AFTER assessment_date,
  ADD COLUMN IF NOT EXISTS duration_minutes SMALLINT UNSIGNED NULL AFTER start_time;

-- 3) Index calendrier / tableau de bord
ALTER TABLE assessments
  ADD INDEX IF NOT EXISTS idx_asm_type_date (assessment_type, assessment_date),
  ADD INDEX IF NOT EXISTS idx_asm_class_date (class_id, assessment_date);
