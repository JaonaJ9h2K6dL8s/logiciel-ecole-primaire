import { getPool } from '../../database/pool';

/** Coût estimé cumulé du jour pour un fournisseur (USD). */
export async function providerDayCost(provider: string): Promise<number> {
  const [rows] = await getPool().query('SELECT est_cost_usd FROM ai_usage_daily WHERE day = CURDATE() AND provider = ?', [provider]);
  const row = (rows as { est_cost_usd: number }[])[0];
  return row ? Number(row.est_cost_usd) : 0;
}
