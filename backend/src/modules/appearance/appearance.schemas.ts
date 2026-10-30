import { z } from 'zod';

/** Couleur hexadécimale stricte #RRGGBB (ou null pour revenir au défaut). */
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide (format attendu : #RRGGBB).');

// Valeurs par défaut partagées avec le frontend (src/stores/appearanceStore.ts).
export const APPEARANCE_DEFAULTS = {
  themeMode: 'system' as const,
  backgroundOpacity: 30,
  borderRadius: 12,
  mascotCarouselInterval: 8,
};

// Toutes les préférences sont facultatives : un champ absent/null revient au
// défaut. Le schéma est strict : aucun champ inattendu n'est accepté.
export const appearanceSettingsSchema = z
  .object({
    primaryColor: hexColor.nullable().optional(),
    secondaryColor: hexColor.nullable().optional(),
    accentColor: hexColor.nullable().optional(),
    themeMode: z.enum(['light', 'dark', 'system']).nullable().optional(),
    backgroundType: z.enum(['none', 'solid', 'gradient', 'pattern', 'scene']).nullable().optional(),
    backgroundId: z.string().trim().max(64).nullable().optional(),
    backgroundOpacity: z.number().int().min(0).max(100).nullable().optional(),
    backgroundScope: z.enum(['dashboard', 'app']).nullable().optional(),
    borderRadius: z.number().int().min(0).max(24).nullable().optional(),
    selectedMascotId: z.string().trim().max(32).nullable().optional(),
    mascotAnimation: z.enum(['idle', 'wave', 'bounce', 'cheer', 'think', 'read', 'dance', 'walk']).nullable().optional(),
    mascotCarouselEnabled: z.boolean().nullable().optional(),
    mascotCarouselInterval: z.number().int().min(3).max(60).nullable().optional(),
    mascotEnabled: z.boolean().nullable().optional(),
  })
  .strict();

export type AppearanceSettingsInput = z.infer<typeof appearanceSettingsSchema>;
