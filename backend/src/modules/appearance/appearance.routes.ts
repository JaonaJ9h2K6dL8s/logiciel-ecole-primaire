import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../../database/pool';
import { asyncHandler, badRequest } from '../../shared/errors';
import { requireAuth } from '../../middleware/auth';
import { APPEARANCE_DEFAULTS, appearanceSettingsSchema, type AppearanceSettingsInput } from './appearance.schemas';

/**
 * Préférences d'apparence personnelles (étape 22).
 * - Lecture/écriture STRICTEMENT limitées à l'utilisateur de la session :
 *   aucun paramètre userId n'est accepté, l'identité vient de req.user.
 * - Aucune donnée scolaire n'est concernée : préférences visuelles pures.
 * - Une ligne par utilisateur (UNIQUE user_id) ; GET renvoie les défauts si
 *   aucune préférence n'existe encore (upsert à l'écriture).
 */
export const appearanceRouter = Router();

const COLUMNS: { key: keyof AppearanceSettingsInput; column: string }[] = [
  { key: 'primaryColor', column: 'primary_color' },
  { key: 'secondaryColor', column: 'secondary_color' },
  { key: 'accentColor', column: 'accent_color' },
  { key: 'themeMode', column: 'theme_mode' },
  { key: 'backgroundType', column: 'background_type' },
  { key: 'backgroundId', column: 'background_id' },
  { key: 'backgroundOpacity', column: 'background_opacity' },
  { key: 'backgroundScope', column: 'background_scope' },
  { key: 'borderRadius', column: 'border_radius' },
  { key: 'selectedMascotId', column: 'selected_mascot_id' },
  { key: 'mascotAnimation', column: 'mascot_animation' },
  { key: 'mascotCarouselEnabled', column: 'mascot_carousel_enabled' },
  { key: 'mascotCarouselInterval', column: 'mascot_carousel_interval' },
  { key: 'mascotEnabled', column: 'mascot_enabled' },
];

const idParamSchema = z.object({}).strict();

appearanceRouter.use(requireAuth);

appearanceRouter.get(
  '/settings',
  asyncHandler(async (req, res) => {
    idParamSchema.parse({});
    const [rows] = await getPool().query(
      `SELECT ${COLUMNS.map((c) => c.column).join(', ')} FROM user_appearance_settings WHERE user_id = ? LIMIT 1`,
      [req.user!.id]
    );
    const row = (rows as Record<string, unknown>[])[0];
    if (!row) {
      res.json({ settings: {} });
      return;
    }
    // Conversion snake_case -> camelCase ; les 0/1 MySQL deviennent booléens.
    const settings: Record<string, unknown> = {};
    for (const c of COLUMNS) {
      const v = row[c.column];
      if (v === null || v === undefined) continue;
      if (c.column === 'mascot_carousel_enabled' || c.column === 'mascot_enabled') {
        settings[c.key] = Number(v) === 1;
      } else {
        settings[c.key] = v;
      }
    }
    res.json({ settings });
  })
);

appearanceRouter.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const parsed = appearanceSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Préférences d'apparence invalides.", parsed.error.flatten().fieldErrors);
    }
    const input = parsed.data;

    // Upsert d'une seule ligne par utilisateur : les champs non fournis sont
    // écrasés à NULL (retour au défaut) — comportement documenté de PUT.
    const values: Record<string, unknown> = {};
    for (const c of COLUMNS) {
      const v = input[c.key];
      values[c.column] = v === undefined ? null : v;
    }
    const cols = COLUMNS.map((c) => c.column);
    const placeholders = cols.map(() => '?').join(', ');
    const updates = cols.map((c) => `${c} = VALUES(${c})`).join(', ');
    await getPool().query(
      `INSERT INTO user_appearance_settings (user_id, ${cols.join(', ')}) VALUES (?, ${placeholders})
       ON DUPLICATE KEY UPDATE ${updates}`,
      // VALUES(col) relit les valeurs de l'INSERT : seuls user_id + colonnes sont liés.
      [req.user!.id, ...cols.map((c) => values[c])]
    );

    res.json({ settings: input, defaults: APPEARANCE_DEFAULTS });
  })
);
