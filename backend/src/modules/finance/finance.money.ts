/**
 * Conversion de montants entiers en lettres (français) pour les reçus.
 * Aucune virgule flottante : les montants sont des entiers (ariary).
 */

const UNITS = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
];

const TENS: Record<number, string> = {
  2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante',
  6: 'soixante', 7: 'soixante', 8: 'quatre-vingt', 9: 'quatre-vingt',
};

function below100(n: number): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 7 || t === 9) {
    const base = t === 7 ? 'soixante' : 'quatre-vingt';
    return `${base}-${UNITS[10 + u]}`;
  }
  let word = TENS[t];
  if (u === 1 && t !== 8) word += '-et-un';
  else if (u > 0) word += `-${UNITS[u]}`;
  else if (t === 8) word += 's';
  return word;
}

function below1000(n: number): string {
  if (n < 100) return below100(n);
  const c = Math.floor(n / 100);
  const r = n % 100;
  let word = c > 1 ? `${UNITS[c]}-cent` : 'cent';
  if (r === 0 && c > 1) word += 's';
  if (r > 0) word += `-${below100(r)}`;
  return word;
}

/** Convertit un entier positif (0 .. 999 999 999 999) en mots français. */
export function numberToFrenchWords(input: number): string {
  if (!Number.isInteger(input) || input < 0 || input > 999_999_999_999) {
    throw new Error('Montant hors bornes pour la conversion en lettres.');
  }
  if (input === 0) return 'zéro';
  const scales: { div: number; s: string; invariable?: boolean }[] = [
    { div: 1_000_000_000, s: 'milliard' },
    { div: 1_000_000, s: 'million' },
    { div: 1_000, s: 'mille', invariable: true },
  ];
  const parts: string[] = [];
  let rest = input;
  for (const { div, s, invariable } of scales) {
    const q = Math.floor(rest / div);
    rest %= div;
    if (q === 0) continue;
    if (invariable) {
      parts.push(q === 1 ? 'mille' : `${below1000(q)}-mille`);
    } else {
      parts.push(`${below1000(q)}-${s}${q > 1 ? 's' : ''}`);
    }
  }
  if (rest > 0) parts.push(below1000(rest));
  return parts.join(' ');
}

/** Montant en lettres pour un reçu : « un million deux cent mille ariary ». */
export function amountInWordsMGA(amount: number): string {
  return `${numberToFrenchWords(amount)} ariary`;
}
