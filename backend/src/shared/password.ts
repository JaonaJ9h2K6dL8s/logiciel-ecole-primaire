import { hash, verify } from '@node-rs/argon2';

// Argon2id — recommandé par OWASP. Paramètres par défaut sûrs (m=19456, t=2, p=1).
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

export async function verifyPassword(hashValue: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashValue, plain);
  } catch {
    return false;
  }
}

const COMMON_PASSWORDS = new Set([
  'password', 'motdepasse', '123456', '12345678', '123456789', 'azerty', 'qwerty',
  'admin', 'admin123', '1234', '12345', 'abc123', '000000', 'iloveyou', 'soleil',
]);

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) {
    return 'Le mot de passe doit contenir au moins 10 caractères.';
  }
  if (password.length > 128) {
    return 'Le mot de passe ne doit pas dépasser 128 caractères.';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Le mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre.';
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'Ce mot de passe est trop courant.';
  }
  return null;
}
