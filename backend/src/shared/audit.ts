import { getPool } from '../database/pool';

export interface AuditEntry {
  actorId?: number | null;
  actorUsername?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | number | null;
  result?: 'success' | 'failure';
  details?: Record<string, unknown> | null;
  ip?: string | null;
}

/**
 * Journalisation des opérations sensibles.
 * Ne jamais passer de mot de passe, secret ou jeton dans `details`.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO audit_logs (actor_id, actor_username, action, entity_type, entity_id, result, details, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.actorId ?? null,
        entry.actorUsername ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId !== undefined && entry.entityId !== null ? String(entry.entityId) : null,
        entry.result ?? 'success',
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ip ?? null,
      ]
    );
  } catch (err) {
    // L'audit ne doit jamais faire échouer l'opération métier, mais l'erreur est visible côté serveur
    console.error('[audit] échec d\'écriture du journal :', err);
  }
}
