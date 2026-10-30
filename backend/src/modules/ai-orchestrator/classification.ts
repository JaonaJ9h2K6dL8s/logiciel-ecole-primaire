/**
 * Classification locale (zéro appel réseau) d'une demande :
 * matière, niveau et complexité, par mots-clés français / malgache.
 */

export type Subject = 'math' | 'francais' | 'malagasy' | 'sciences' | 'histoire-geo' | 'lecture-ecriture' | 'general';
export type Level = 'CE1' | 'CE2' | 'CM1' | 'CM2' | null;
export type Complexity = 'simple' | 'moyen' | 'complexe';

export interface Classification {
  subject: Subject;
  level: Level;
  complexity: Complexity;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const SUBJECT_KEYWORDS: [Subject, string[]][] = [
  ['math', ['math', 'calcul', 'addition', 'soustraction', 'multiplication', 'division', 'fraction', 'nombre', 'geometrie', 'mesure', 'probleme', 'figure', 'perimetre', 'aire', 'dizaine', 'unite', 'kajy', 'isa', 'ambinany']],
  ['malagasy', ['malagasy', 'teny', 'sokajin-teny', 'feo', 'hevitra', 'tantara malagasy', 'ohabolana']],
  ['francais', ['francais', 'grammaire', 'conjugaison', 'verbe', 'adjectif', 'nom commun', 'orthographe', 'accord', 'phrase', 'redaction', 'dictée', 'dictee', 'ponctuation', 'sujet', 'complement']],
  ['lecture-ecriture', ['lecture', 'lire', 'ecrire', 'ecriture', 'syllabe', 'alphabet', 'copye', 'écriture']],
  ['sciences', ['science', 'nature', 'plante', 'animal', 'corps humain', 'eau', 'air', 'sante', 'hygiene', 'environnement', 'zana-borona', 'biby']],
  ['histoire-geo', ['histoire', 'geographie', 'carte', 'madagascar like', 'royaume', 'colonisation', 'independance', 'region', 'commune', 'fleuve', 'climat', 'planisphere']],
];

const LEVEL_KEYWORDS: [Level, string[]][] = [
  ['CE1', ['ce1', 'eleve de ce1', 'classe de ce1']],
  ['CE2', ['ce2', 'eleve de ce2', 'classe de ce2']],
  ['CM1', ['cm1', 'eleve de cm1', 'classe de cm1']],
  ['CM2', ['cm2', 'eleve de cm2', 'classe de cm2']],
];

const COMPLEX_WORDS = ['analyse', 'compare', 'redige', 'planifie', 'sequence', 'progression', 'differencie', 'evaluation', 'synthese', 'justifie', 'demonstre', 'programme'];
const EXERCISE_WORDS = ['exercice', 'evaluation', 'interrogation', 'quiz', 'controle', 'fiche', 'corrige'];

export function classify(text: string): Classification {
  const t = norm(text);
  let subject: Subject = 'general';
  for (const [subj, words] of SUBJECT_KEYWORDS) {
    if (words.some((w) => t.includes(w))) {
      subject = subj;
      break;
    }
  }
  let level: Level = null;
  for (const [lv, words] of LEVEL_KEYWORDS) {
    if (words.some((w) => t.includes(w))) {
      level = lv;
      break;
    }
  }
  let complexity: Complexity = 'moyen';
  if (t.length < 60 && !COMPLEX_WORDS.some((w) => t.includes(w))) complexity = 'simple';
  if (COMPLEX_WORDS.filter((w) => t.includes(w)).length >= 2 || (t.length > 300 && COMPLEX_WORDS.some((w) => t.includes(w)))) complexity = 'complexe';
  return { subject, level, complexity };
}

/** Catégorie de routage (voir ROUTING_RULES dans orchestrator.ts). */
export type RouteCategory = 'math' | 'francais' | 'analyse' | 'exercices' | 'simple' | 'defaut';

export function routeCategory(c: Classification, text: string): RouteCategory {
  const t = norm(text);
  if (EXERCISE_WORDS.some((w) => t.includes(w))) return 'exercices';
  if (c.subject === 'math') return 'math';
  if (c.subject === 'francais' || c.subject === 'malagasy' || c.subject === 'lecture-ecriture') return 'francais';
  if (c.subject === 'sciences' || c.subject === 'histoire-geo') return 'analyse';
  if (c.complexity === 'simple') return 'simple';
  return 'defaut';
}
