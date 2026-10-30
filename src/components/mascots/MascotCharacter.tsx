'use client';

import type { MascotAnimationName } from '@/stores/appearanceStore';

/**
 * Mascotte SVG animée à l'aspect volumique / « 3D » (ressource 100 % locale,
 * aucune dépendance externe). Le volume est obtenu avec des dégradés SVG :
 * - tête : dégradé radial décalé (lumière en haut à gauche, ombre sur les bords) ;
 * - tenue : dégradé linéaire vertical plus une ombre portée de la tête ;
 * - yeux : iris en dégradé + deux reflets (rendu « glossy ») ;
 * - sol : ellipse floutée en dégradé radial (contact doux).
 * Les animations restent des keyframes CSS (globals.css) ; les noms de classes
 * et les exports sont inchangés pour ne rien casser.
 */

export type MascotEarType = 'human' | 'cat' | 'lion' | 'panda' | 'rabbit' | 'badger';

export interface MascotDesign {
  id: string;
  name: string;
  /** Type d'oreilles / tête animale. */
  ears: MascotEarType;
  /** Couleur principale du corps ou des cheveux. */
  main: string;
  /** Couleur de la tenue scolaire (t-shirt). */
  outfit: string;
  /** Couleur du short (style cartoon à contours épais). */
  shorts?: string;
  /** Couleur des baskets. */
  shoes?: string;
  /** Élément tenu en main (livre, calculatrice, fiole). */
  accessory?: 'book' | 'calc' | 'flask';
  pigtails?: boolean;
}

export const MASCOTS: MascotDesign[] = [
  { id: 'blaireau', name: 'Blaireau', ears: 'badger', main: '#FBFAF4', outfit: '#E23B3B', shorts: '#3BA7E0', shoes: '#D6342C' },
  { id: 'garcon', name: 'Petit garçon', ears: 'human', main: '#8D5A3B', outfit: '#2F5FA8' },
  { id: 'fille', name: 'Petite fille', ears: 'human', main: '#4A2F23', outfit: '#B04A5A', pigtails: true },
  { id: 'lion', name: 'Lion', ears: 'lion', main: '#E8A13D', outfit: '#C97B2D' },
  { id: 'chat', name: 'Chat', ears: 'cat', main: '#8E8E93', outfit: '#6D6D72' },
  { id: 'panda', name: 'Panda', ears: 'panda', main: '#F5F5F0', outfit: '#3A3A3A' },
  { id: 'lapin', name: 'Lapin', ears: 'rabbit', main: '#EDE0D4', outfit: '#A5B4CC' },
  { id: 'lecture', name: 'Lecture', ears: 'human', main: '#5C3A21', outfit: '#3E7C59', accessory: 'book' },
  { id: 'maths', name: 'Mathématiques', ears: 'human', main: '#2E2A26', outfit: '#5566B0', accessory: 'calc' },
  { id: 'sciences', name: 'Sciences', ears: 'human', main: '#6B4423', outfit: '#7C5CBF', accessory: 'flask' },
];

export const MASCOT_ANIMATIONS: { id: MascotAnimationName; label: string }[] = [
  { id: 'idle', label: 'Respiration' },
  { id: 'wave', label: 'Saluer' },
  { id: 'bounce', label: 'Saut' },
  { id: 'cheer', label: 'Célébrer' },
  { id: 'think', label: 'Réfléchir' },
  { id: 'read', label: 'Lire' },
  { id: 'dance', label: 'Danser' },
  { id: 'walk', label: 'Marcher' },
];

export function getMascot(id: string | null | undefined): MascotDesign {
  return MASCOTS.find((m) => m.id === id) ?? MASCOTS[0];
}

/** Éclaircit (pct > 0) ou assombrit (pct < 0) une couleur hex. */
function shade(hex: string, pct: number): string {
  const n = hex.replace('#', '');
  const v = parseInt(n.length === 3 ? n.split('').map((c) => c + c).join('') : n, 16);
  const clamp = (x: number) => Math.max(0, Math.min(255, x));
  const r = clamp((v >> 16) + Math.round(2.55 * pct));
  const g = clamp(((v >> 8) & 0xff) + Math.round(2.55 * pct));
  const b = clamp((v & 0xff) + Math.round(2.55 * pct));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

interface Props {
  design: MascotDesign;
  animation?: MascotAnimationName;
  /** Taille en px (défaut 120). */
  size?: number;
  /** Désactive toute animation (mouvements limités). */
  reducedMotion?: boolean;
}

export default function MascotCharacter({ design, animation = 'idle', size = 120, reducedMotion = false }: Props) {
  const animClass = reducedMotion ? '' : `mascot-anim-${animation}`;
  // Identifiants de dégradés uniques par mascotte (plusieurs instances cohabitent).
  const uid = design.id;
  const isBadger = design.ears === 'badger';
  // Contour épai caractéristique du style cartoon (type blaireau de l'image).
  const OUTLINE = '#2A2020';
  const headLight = shade(design.ears === 'panda' ? '#FFFFFF' : design.main, 22);
  const headDark = shade(design.ears === 'panda' ? '#FFFFFF' : design.main, -22);
  const outfitLight = shade(design.outfit, 18);
  const outfitDark = shade(design.outfit, -18);

  return (
    <svg
      width={size}
      height={size * 1.15}
      viewBox="0 0 120 138"
      role="img"
      aria-label={`Mascotte ${design.name}`}
      className={animClass}
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Volume de la tête : lumière décalée en haut à gauche. */}
        <radialGradient id={`head-${uid}`} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor={headLight} />
          <stop offset="55%" stopColor={design.ears === 'panda' ? '#FFFFFF' : design.main} />
          <stop offset="100%" stopColor={headDark} />
        </radialGradient>
        {/* Volume de la tenue : lumière du haut, ombre du bas. */}
        <linearGradient id={`body-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={outfitLight} />
          <stop offset="60%" stopColor={design.outfit} />
          <stop offset="100%" stopColor={outfitDark} />
        </linearGradient>
        {/* Reflet spéculaire de la tête. */}
        <radialGradient id={`gloss-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        {/* Iris « glossy ». */}
        <radialGradient id={`iris-${uid}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#5A5A5A" />
          <stop offset="45%" stopColor="#2B2B2B" />
          <stop offset="100%" stopColor="#141414" />
        </radialGradient>
        {/* Ombre de contact au sol. */}
        <radialGradient id={`shadow-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(31,36,48,0.30)" />
          <stop offset="70%" stopColor="rgba(31,36,48,0.10)" />
          <stop offset="100%" stopColor="rgba(31,36,48,0)" />
        </radialGradient>
        <filter id={`soft-${uid}`} x="-40%" y="-120%" width="180%" height="340%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* Ombre au sol floutée */}
      <ellipse cx="60" cy="130" rx="32" ry="7" fill={`url(#shadow-${uid})`} filter={`url(#soft-${uid})`} />

      {/* Oreilles animales derrière la tête */}
      {design.ears === 'cat' && (
        <g>
          <path d="M28 34 L22 8 L48 22 Z" fill={headDark} />
          <path d="M92 34 L98 8 L72 22 Z" fill={headDark} />
          <path d="M30 28 L27 14 L41 21 Z" fill="#F6C9C0" />
          <path d="M90 28 L93 14 L79 21 Z" fill="#F6C9C0" />
        </g>
      )}
      {design.ears === 'lion' && (
        <g>
          {Array.from({ length: 10 }).map((_, i) => {
            const a = (i / 10) * Math.PI * 2;
            const x = 60 + Math.cos(a) * 34;
            const y = 36 + Math.sin(a) * 34;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="11"
                fill={i % 2 === 0 ? design.outfit : outfitDark}
                opacity="0.95"
              />
            );
          })}
          <circle cx="60" cy="36" r="36" fill={`url(#gloss-${uid})`} opacity="0.35" />
        </g>
      )}
      {design.ears === 'panda' && (
        <g>
          <circle cx="30" cy="14" r="12" fill="#3A3A3A" />
          <circle cx="90" cy="14" r="12" fill="#3A3A3A" />
          <circle cx="27" cy="10" r="3" fill="#5A5A5A" />
          <circle cx="87" cy="10" r="3" fill="#5A5A5A" />
        </g>
      )}
      {design.ears === 'rabbit' && (
        <g className={animClass ? 'mascot-part-ears' : ''}>
          <ellipse cx="42" cy="-6" rx="9" ry="24" fill={`url(#body-${uid})`} />
          <ellipse cx="78" cy="-6" rx="9" ry="24" fill={`url(#body-${uid})`} />
          <ellipse cx="42" cy="-6" rx="4.5" ry="17" fill="#F6C9C0" />
          <ellipse cx="78" cy="-6" rx="4.5" ry="17" fill="#F6C9C0" />
        </g>
      )}

      {/* Corps (tenue scolaire) */}
      {isBadger ? (
        <g className={animClass ? 'mascot-part-body' : ''}>
          {/* T-shirt rouge, style cartoon à contours épais */}
          <path d="M37 66 Q60 57 83 66 L85 98 Q60 106 35 98 Z" fill={design.outfit} stroke={OUTLINE} strokeWidth="2.5" strokeLinejoin="round" />
          {/* Col du t-shirt */}
          <path d="M51 63 Q60 70 69 63" fill="none" stroke={OUTLINE} strokeWidth="2.5" strokeLinecap="round" />
          {/* Short bleu */}
          <path d="M39 97 L81 97 L79 115 Q70 118 63 116 L60 108 L57 116 Q50 118 41 115 Z" fill={design.shorts ?? '#3BA7E0'} stroke={OUTLINE} strokeWidth="2.5" strokeLinejoin="round" />
        </g>
      ) : (
        <g className={animClass ? 'mascot-part-body' : ''}>
          <path d="M38 66 Q60 58 82 66 L86 104 Q60 112 34 104 Z" fill={`url(#body-${uid})`} stroke={OUTLINE} strokeWidth="2.5" strokeLinejoin="round" />
          {/* Ombre portée de la tête sur le torse */}
          <path d="M44 66 Q60 74 76 66 Q60 80 44 66 Z" fill="rgba(0,0,0,0.14)" />
          {design.ears === 'human' ? (
            <path d="M52 64 L60 74 L68 64 L66 92 L54 92 Z" fill="#FFFFFF" opacity="0.88" />
          ) : (
            <ellipse cx="60" cy="82" rx="9" ry="11" fill="#FFFFFF" opacity="0.6" />
          )}
          {/* Boutons */}
          <circle cx="60" cy="86" r="2" fill="rgba(255,255,255,0.85)" />
          <circle cx="60" cy="96" r="2" fill="rgba(255,255,255,0.7)" />
          {/* Reflet latéral du torse */}
          <path d="M42 70 Q38 88 40 102 Q44 104 46 103 Q43 86 46 71 Z" fill="rgba(255,255,255,0.16)" />
        </g>
      )}

      {/* Bras gauche */}
      {isBadger ? (
        <g className={animClass ? 'mascot-part-arm' : ''}>
          <path d="M39 70 Q27 82 31 95" stroke={OUTLINE} strokeWidth="9" fill="none" strokeLinecap="round" />
          <circle cx="31" cy="95" r="5.5" fill={OUTLINE} />
        </g>
      ) : (
        <path d="M38 70 Q26 82 30 96" stroke={outfitDark} strokeWidth="9" fill="none" strokeLinecap="round" />
      )}

      {/* Bras droit (animé pour wave/cheer/dance) */}
      <g className={animClass === 'mascot-anim-wave' ? 'mascot-part-arm-wave' : animClass ? 'mascot-part-arm' : ''}>
        {isBadger ? (
          <>
            <path d="M82 68 Q95 58 94 44" stroke={OUTLINE} strokeWidth="9" fill="none" strokeLinecap="round" />
            <circle cx="94" cy="44" r="5.5" fill={OUTLINE} />
          </>
        ) : (
          <path d="M82 70 Q94 82 90 96" stroke={outfitDark} strokeWidth="9" fill="none" strokeLinecap="round" />
        )}
      </g>

      {/* Jambes */}
      {isBadger ? (
        <g>
          <path d="M50 112 L50 121" stroke={OUTLINE} strokeWidth="8" strokeLinecap="round" />
          <path d="M70 112 L70 121" stroke={OUTLINE} strokeWidth="8" strokeLinecap="round" />
          {/* Baskets rouges à semelle blanche */}
          <path d="M41 126 Q41 119 48 119 L54 119 Q60 119 60 125 L60 127 Q50 132 41 127 Z" fill={design.shoes ?? '#D6342C'} stroke={OUTLINE} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M60 126 Q60 119 67 119 L73 119 Q80 119 80 125 L80 127 Q70 132 60 127 Z" fill={design.shoes ?? '#D6342C'} stroke={OUTLINE} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M42 126.5 Q50 130.5 59 126.5" stroke="#FFFFFF" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M61 126.5 Q70 130.5 79 126.5" stroke="#FFFFFF" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <ellipse cx="48" cy="122" rx="3" ry="1.6" fill="rgba(255,255,255,0.5)" />
          <ellipse cx="68" cy="122" rx="3" ry="1.6" fill="rgba(255,255,255,0.5)" />
        </g>
      ) : (
        <>
          <path d="M50 106 L50 126" stroke="#3A3A3A" strokeWidth="9" strokeLinecap="round" />
          <path d="M70 106 L70 126" stroke="#3A3A3A" strokeWidth="9" strokeLinecap="round" />
          <ellipse cx="50" cy="128" rx="9" ry="4.5" fill="#262626" stroke={OUTLINE} strokeWidth="1.5" />
          <ellipse cx="70" cy="128" rx="9" ry="4.5" fill="#262626" stroke={OUTLINE} strokeWidth="1.5" />
          {/* Reflet des chaussures */}
          <ellipse cx="48" cy="127" rx="3.5" ry="1.6" fill="rgba(255,255,255,0.25)" />
          <ellipse cx="68" cy="127" rx="3.5" ry="1.6" fill="rgba(255,255,255,0.25)" />
        </>
      )}

      {/* Tête */}
      <g className={animClass ? 'mascot-part-head' : ''}>
        {isBadger ? (
          <>
            {/* Oreilles noires arrondies */}
            <circle cx="34" cy="13" r="9" fill={OUTLINE} stroke={OUTLINE} strokeWidth="2.5" />
            <circle cx="86" cy="13" r="9" fill={OUTLINE} stroke={OUTLINE} strokeWidth="2.5" />
            {/* Tête blanche à contour épais */}
            <circle cx="60" cy="37" r="29" fill="#FBFAF4" stroke={OUTLINE} strokeWidth="2.5" />
            {/* Rayures noires caractéristiques du blaireau */}
            <path d="M50 9 Q36 21 39 41 Q40 52 50 54 Q46 34 55 11 Z" fill={OUTLINE} />
            <path d="M70 9 Q84 21 81 41 Q80 52 70 54 Q74 34 65 11 Z" fill={OUTLINE} />
            {/* Yeux bleus */}
            <circle cx="49" cy="37" r="5" fill="#2E7FD6" stroke="#101010" strokeWidth="1.4" />
            <circle cx="71" cy="37" r="5" fill="#2E7FD6" stroke="#101010" strokeWidth="1.4" />
            <circle cx="49" cy="37.5" r="2.2" fill="#101010" />
            <circle cx="71" cy="37.5" r="2.2" fill="#101010" />
            <circle cx="47.6" cy="35.2" r="1.5" fill="#FFFFFF" />
            <circle cx="69.6" cy="35.2" r="1.5" fill="#FFFFFF" />
            {/* Nez noir */}
            <ellipse cx="60" cy="46" rx="4.5" ry="3.2" fill="#1A1414" />
            {/* Sourire + langue */}
            <path d="M53 51 Q60 60 67 51" stroke="#1A1414" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <ellipse cx="60" cy="56.5" rx="4" ry="2.4" fill={design.outfit} />
          </>
        ) : (
          <>
        {design.pigtails && (
          <g>
            <circle cx="18" cy="42" r="10" fill={headDark} />
            <circle cx="102" cy="42" r="10" fill={headDark} />
            <circle cx="15" cy="39" r="4" fill={headLight} opacity="0.6" />
            <circle cx="99" cy="39" r="4" fill={headLight} opacity="0.6" />
            <circle cx="18" cy="42" r="4" fill="#F6C9C0" />
            <circle cx="102" cy="42" r="4" fill="#F6C9C0" />
          </g>
        )}
        <circle cx="60" cy="38" r="28" fill={`url(#head-${uid})`} stroke={OUTLINE} strokeWidth="2.5" />
        {/* Reflet spéculaire haut-gauche */}
        <ellipse cx="48" cy="24" rx="13" ry="8" fill={`url(#gloss-${uid})`} />
        {/* Cheveux / pelage supérieur */}
        {design.ears === 'human' && (
          <path d="M32 34 Q60 4 88 34 Q74 22 60 24 Q46 22 32 34 Z" fill={design.main} />
        )}
        {design.ears === 'lion' && <path d="M34 30 Q60 8 86 30 Q60 20 34 30 Z" fill={design.outfit} />}
        {/* Yeux « glossy » */}
        <ellipse cx="50" cy="38" rx="5" ry="5.5" fill={`url(#iris-${uid})`} />
        <ellipse cx="70" cy="38" rx="5" ry="5.5" fill={`url(#iris-${uid})`} />
        <circle cx="48.2" cy="35.8" r="1.9" fill="#FFFFFF" />
        <circle cx="68.2" cy="35.8" r="1.9" fill="#FFFFFF" />
        <circle cx="52" cy="40.5" r="0.9" fill="rgba(255,255,255,0.65)" />
        <circle cx="72" cy="40.5" r="0.9" fill="rgba(255,255,255,0.65)" />
        {/* Joues */}
        <circle cx="42" cy="46" r="4" fill="#F6B5B0" opacity="0.7" />
        <circle cx="78" cy="46" r="4" fill="#F6B5B0" opacity="0.7" />
        {/* Museau + sourire */}
        {(design.ears === 'cat' || design.ears === 'lion' || design.ears === 'rabbit' || design.ears === 'panda') && (
          <path d="M57 47 L63 47 L60 50 Z" fill="#4A4A4A" />
        )}
        <path d="M52 52 Q60 59 68 52" stroke="#4A4A4A" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {/* Moustaches du chat */}
        {design.ears === 'cat' && (
          <g stroke="#6D6D72" strokeWidth="1.5" strokeLinecap="round">
            <path d="M40 44 L28 42" />
            <path d="M40 48 L28 50" />
            <path d="M80 44 L92 42" />
            <path d="M80 48 L92 50" />
          </g>
        )}
        {/* Lunettes sciences */}
        {design.accessory === 'flask' && (
          <g>
            <circle cx="50" cy="38" r="8" fill="none" stroke="#5566B0" strokeWidth="2.5" />
            <circle cx="70" cy="38" r="8" fill="none" stroke="#5566B0" strokeWidth="2.5" />
            <path d="M58 38 L62 38" stroke="#5566B0" strokeWidth="2.5" />
          </g>
        )}
          </>
        )}
      </g>

      {/* Accessoires tenus devant (livre / calculatrice / fiole) */}
      {design.accessory === 'book' && (
        <g className={animClass === 'mascot-anim-read' ? 'mascot-part-book' : ''}>
          <path d="M40 84 L60 90 L80 84 L80 102 L60 108 L40 102 Z" fill="#FFF8E7" stroke="#C9A24B" strokeWidth="2" />
          <path d="M60 90 L60 108" stroke="#C9A24B" strokeWidth="2" />
          <path d="M42 86 L58 91 L58 105 L42 100 Z" fill="rgba(201,162,75,0.18)" />
        </g>
      )}
      {design.accessory === 'calc' && (
        <g>
          <rect x="48" y="84" width="24" height="20" rx="3" fill="#33383F" />
          <rect x="48" y="84" width="24" height="7" rx="3" fill="#4A5058" />
          <rect x="51" y="87" width="18" height="6" rx="1" fill="#9FCE9B" />
          {[0, 1, 2].map((r) =>
            [0, 1, 2].map((c) => (
              <circle key={`${r}${c}`} cx={54 + c * 6} cy={97 + r * 2.2} r="0.9" fill="#DDD" />
            ))
          )}
        </g>
      )}
      {design.accessory === 'flask' && (
        <g>
          <path d="M54 82 L66 82 L72 104 Q60 110 48 104 Z" fill="#DDEEFF" stroke="#7C5CBF" strokeWidth="2" />
          <path d="M51 98 Q60 103 69 98 L72 104 Q60 110 48 104 Z" fill="#9BD1F5" />
          <ellipse cx="57" cy="92" rx="2.5" ry="5" fill="rgba(255,255,255,0.55)" />
        </g>
      )}
    </svg>
  );
}
