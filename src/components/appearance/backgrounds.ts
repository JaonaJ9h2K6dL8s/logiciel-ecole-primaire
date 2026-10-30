import type { BackgroundType } from '@/stores/appearanceStore';

/**
 * Catalogue de fonds (étape 22) — 100 % CSS local, aucune image externe.
 * Les motifs et scènes sont générés par gradients CSS discrets afin de ne
 * jamais gêner la lisibilité (surfaces de contenu opaques par ailleurs).
 */

export interface BackgroundDef {
  id: string;
  label: string;
  type: BackgroundType;
  /** Style CSS appliqué à la couche de fond. */
  css: React.CSSProperties;
  /** Miniature d'aperçu (identique au style final). */
  thumbCss: React.CSSProperties;
}

export const BACKGROUNDS: BackgroundDef[] = [
  // — Couleurs unies —
  { id: 'solid-blue', label: 'Bleu doux', type: 'solid', css: { background: '#D6E6F5' }, thumbCss: { background: '#D6E6F5' } },
  { id: 'solid-green', label: 'Vert clair', type: 'solid', css: { background: '#DDEEDD' }, thumbCss: { background: '#DDEEDD' } },
  { id: 'solid-cream', label: 'Crème', type: 'solid', css: { background: '#F5EFDF' }, thumbCss: { background: '#F5EFDF' } },
  { id: 'solid-pink', label: 'Rose poudré', type: 'solid', css: { background: '#F7E2E8' }, thumbCss: { background: '#F7E2E8' } },
  // — Dégradés doux —
  { id: 'grad-sky', label: 'Dégradé ciel', type: 'gradient', css: { background: 'linear-gradient(160deg, #DCEBFA 0%, #F3EAFB 100%)' }, thumbCss: { background: 'linear-gradient(160deg, #DCEBFA 0%, #F3EAFB 100%)' } },
  { id: 'grad-sun', label: 'Dégradé soleil', type: 'gradient', css: { background: 'linear-gradient(160deg, #FFF3D6 0%, #FFE0C2 100%)' }, thumbCss: { background: 'linear-gradient(160deg, #FFF3D6 0%, #FFE0C2 100%)' } },
  { id: 'grad-mint', label: 'Dégradé menthe', type: 'gradient', css: { background: 'linear-gradient(160deg, #DFF5EC 0%, #E7F0FB 100%)' }, thumbCss: { background: 'linear-gradient(160deg, #DFF5EC 0%, #E7F0FB 100%)' } },
  // — Motifs géométriques discrets —
  { id: 'pattern-dots', label: 'Petits points', type: 'pattern', css: { backgroundColor: '#F2F4F8', backgroundImage: 'radial-gradient(#C5CEDD 1.2px, transparent 1.2px)', backgroundSize: '22px 22px' }, thumbCss: { backgroundColor: '#F2F4F8', backgroundImage: 'radial-gradient(#C5CEDD 1.2px, transparent 1.2px)', backgroundSize: '10px 10px' } },
  { id: 'pattern-grid', label: 'Grille cahier', type: 'pattern', css: { backgroundColor: '#FBFBF6', backgroundImage: 'linear-gradient(#DCE3EE 1px, transparent 1px), linear-gradient(90deg, #DCE3EE 1px, transparent 1px)', backgroundSize: '26px 26px' }, thumbCss: { backgroundColor: '#FBFBF6', backgroundImage: 'linear-gradient(#DCE3EE 1px, transparent 1px), linear-gradient(90deg, #DCE3EE 1px, transparent 1px)', backgroundSize: '12px 12px' } },
  { id: 'pattern-diag', label: 'Chevrons doux', type: 'pattern', css: { backgroundColor: '#F4F1EA', backgroundImage: 'repeating-linear-gradient(45deg, #E3DCCB 0 10px, transparent 10px 24px)' }, thumbCss: { backgroundColor: '#F4F1EA', backgroundImage: 'repeating-linear-gradient(45deg, #E3DCCB 0 5px, transparent 5px 12px)' } },
  // — Ciel et nature —
  { id: 'scene-sky', label: 'Ciel et nuages', type: 'scene', css: { background: 'linear-gradient(180deg, #BBD9F2 0%, #E8F3FC 55%, #DCEFDD 100%)', position: 'relative' }, thumbCss: { background: 'linear-gradient(180deg, #BBD9F2 0%, #E8F3FC 55%, #DCEFDD 100%)' } },
  { id: 'scene-hills', label: 'Collines vertes', type: 'scene', css: { background: 'linear-gradient(180deg, #D9EDFA 0%, #D9EDFA 45%, #B7DCAB 46%, #9CCB8E 100%)' }, thumbCss: { background: 'linear-gradient(180deg, #D9EDFA 0%, #D9EDFA 45%, #B7DCAB 46%, #9CCB8E 100%)' } },
  { id: 'scene-sunset', label: 'Coucher de soleil', type: 'scene', css: { background: 'linear-gradient(180deg, #FCD9A8 0%, #F8B9C5 60%, #EF9BA8 100%)' }, thumbCss: { background: 'linear-gradient(180deg, #FCD9A8 0%, #F8B9C5 60%, #EF9BA8 100%)' } },
  // — Éducatif (formes) —
  { id: 'scene-school', label: 'Formes d école', type: 'scene', css: { backgroundColor: '#F3F0E9', backgroundImage: 'radial-gradient(circle at 12% 20%, #F6C6C6 18px, transparent 19px), radial-gradient(circle at 85% 15%, #C6D8F6 16px, transparent 17px), radial-gradient(circle at 75% 80%, #CDEBC9 20px, transparent 21px), radial-gradient(circle at 20% 85%, #F6E3B4 14px, transparent 15px), linear-gradient(#F3F0E9, #F3F0E9)' }, thumbCss: { backgroundColor: '#F3F0E9', backgroundImage: 'radial-gradient(circle at 20% 30%, #F6C6C6 6px, transparent 7px), radial-gradient(circle at 70% 25%, #C6D8F6 5px, transparent 6px), radial-gradient(circle at 60% 75%, #CDEBC9 6px, transparent 7px), radial-gradient(circle at 25% 70%, #F6E3B4 4px, transparent 5px)' } },
  { id: 'scene-abc', label: 'Alphabet ludique', type: 'scene', css: { backgroundColor: '#FDF6EC', backgroundImage: 'radial-gradient(circle at 10% 25%, #F3C4C4 10px, transparent 11px), radial-gradient(circle at 30% 65%, #C9E4F7 10px, transparent 11px), radial-gradient(circle at 55% 30%, #D8F0CB 10px, transparent 11px), radial-gradient(circle at 80% 70%, #F7E2B8 10px, transparent 11px), radial-gradient(circle at 90% 20%, #E5D4F5 10px, transparent 11px), radial-gradient(circle at 45% 90%, #F9D8E5 10px, transparent 11px)' }, thumbCss: { backgroundColor: '#FDF6EC', backgroundImage: 'radial-gradient(circle at 20% 35%, #F3C4C4 4px, transparent 5px), radial-gradient(circle at 50% 30%, #C9E4F7 4px, transparent 5px), radial-gradient(circle at 75% 60%, #D8F0CB 4px, transparent 5px), radial-gradient(circle at 35% 75%, #F7E2B8 4px, transparent 5px)' } },
];

export function getBackground(id: string | null | undefined): BackgroundDef | null {
  if (!id) return null;
  return BACKGROUNDS.find((b) => b.id === id) ?? null;
}

/** Groupes pour l'interface de sélection. */
export const BACKGROUND_GROUPS: { type: BackgroundType; label: string }[] = [
  { type: 'solid', label: 'Couleur unie' },
  { type: 'gradient', label: 'Dégradé doux' },
  { type: 'pattern', label: 'Motifs géométriques' },
  { type: 'scene', label: 'Ciel, nature et école' },
];
