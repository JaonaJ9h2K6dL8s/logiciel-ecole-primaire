/**
 * Utilitaires de temps — l'heure de référence est exclusivement celle du serveur.
 *
 * Le pool mysql2 est configuré avec timezone '+03:00' : les objets Date JavaScript
 * sont écrits en base sous forme d'heure légale Indian/Antananarivo. La date
 * scolaire (school_date) est donc calculée à partir de l'horloge serveur UTC
 * décalée de 3 h — jamais de l'horloge du navigateur.
 */

const APP_TZ_OFFSET_MS = 3 * 3600 * 1000; // Indian/Antananarivo : UTC+3, pas d'heure d'été

/** Date scolaire locale (AAAA-MM-JJ) du moment présent, selon l'horloge serveur. */
export function todayInAppTz(now: Date = new Date()): string {
  return new Date(now.getTime() + APP_TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** Instant présent (objet Date UTC, sérialisé en heure malgache par le pool). */
export function serverNow(): Date {
  return new Date();
}

/** Formate un instant en date scolaire AAAA-MM-JJ (heure malgache). */
export function toAppDateString(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toLocaleDateString('en-CA', { timeZone: 'Indian/Antananarivo' }); // en-CA => AAAA-MM-JJ
}

/** Minutes locales (heure malgache) d'un instant Date ou chaîne "AAAA-MM-JJ HH:MM:SS". */
export function minutesInAppTz(value: Date | string): number {
  const timePart =
    value instanceof Date
      ? value.toLocaleTimeString('en-GB', { timeZone: 'Indian/Antananarivo', hour12: false })
      : String(value);
  const m = /(\d{1,2}):(\d{2})/.exec(timePart);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}
