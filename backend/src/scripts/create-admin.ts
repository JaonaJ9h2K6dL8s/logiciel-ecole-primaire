import { getPool, closePool } from '../database/pool';
import { hashPassword, validatePasswordStrength } from '../shared/password';
import { runMigrations } from '../database/migrate';
import { env } from '../config/env';

/**
 * Création sécurisée du premier administrateur.
 *
 * Usage :
 *   npm run admin:create -- --username "directeur" --password "..." --name "Nom Complet"
 *
 * - Refuse si un administrateur actif existe déjà.
 * - Le mot de passe n'est jamais affiché ni journalisé.
 * - Les migrations sont exécutées d'abord si nécessaire.
 */
async function main() {
  const args = process.argv.slice(2);
  const getArg = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const username = getArg('username')?.trim();
  const password = getArg('password');
  const fullName = getArg('name')?.trim() ?? username;

  if (!username || !password) {
    console.error('Usage : npm run admin:create -- --username <identifiant> --password <motDePasse> --name "Nom Complet"');
    process.exit(1);
    return;
  }

  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username)) {
    console.error('Identifiant invalide : 3 à 50 caractères (lettres, chiffres, . _ -).');
    process.exit(1);
    return;
  }

  const weakness = validatePasswordStrength(password);
  if (weakness) {
    console.error(`Mot de passe refusé : ${weakness}`);
    process.exit(1);
    return;
  }

  await runMigrations(env.migrationsDir);

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [admins] = await conn.query(
      `SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.code = 'admin' AND u.is_active = 1`
    );
    const existingAdmins = (admins as { n: number }[])[0].n;
    if (existingAdmins > 0) {
      console.error('Refusé : un administrateur actif existe déjà. Utilisez la gestion des comptes dans l’application.');
      await conn.rollback();
      process.exit(1);
      return;
    }

    const [roleRows] = await conn.query(`SELECT id FROM roles WHERE code = 'admin' LIMIT 1`);
    const role = (roleRows as { id: number }[])[0];
    if (!role) {
      console.error('Rôle administrateur introuvable — exécutez les migrations.');
      await conn.rollback();
      process.exit(1);
      return;
    }

    const [dup] = await conn.query('SELECT id FROM users WHERE username = ?', [username]);
    if ((dup as unknown[]).length > 0) {
      console.error('Refusé : ce nom d’utilisateur est déjà pris.');
      await conn.rollback();
      process.exit(1);
      return;
    }

    const passwordHash = await hashPassword(password);
    await conn.query(
      'INSERT INTO users (username, full_name, role_id, password_hash) VALUES (?, ?, ?, ?)',
      [username, fullName, role.id, passwordHash]
    );

    await conn.commit();
    console.log(`Administrateur « ${username} » créé avec succès. Conservez le mot de passe en lieu sûr — il n’est stocké nulle part en clair.`);
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    console.error('Échec :', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    conn.release();
    await closePool();
  }
}

main().catch((err) => {
  console.error('Erreur fatale :', err instanceof Error ? err.message : err);
  process.exit(1);
});
