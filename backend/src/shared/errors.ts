export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Authentification requise') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Accès refusé') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Ressource introuvable') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (msg: string) => new AppError(409, 'CONFLICT', msg);
export const tooManyRequests = (msg: string) => new AppError(429, 'TOO_MANY_REQUESTS', msg);

export function asyncHandler(
  fn: (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<unknown>
) {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// Traduction d'erreurs MySQL courantes en messages compréhensibles, sans fuite technique
function translateMysqlError(err: Error & { code?: string; sqlMessage?: string }): AppError | null {
  switch (err.code) {
    case 'ER_DUP_ENTRY':
      return conflict('Cette valeur existe déjà (contrainte d’unicité).');
    case 'ER_NO_REFERENCED_ROW_2':
      return badRequest('La ressource référencée n’existe pas.');
    case 'ER_ROW_IS_REFERENCED_2':
      return conflict('Impossible de supprimer : cet élément est référencé par d’autres données.');
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return badRequest('Données invalides (contrainte de validation).');
    case 'ECONNREFUSED':
      return new AppError(503, 'DB_UNAVAILABLE', 'Base de données injoignable.');
    case 'ER_ACCESS_DENIED_ERROR':
      return new AppError(503, 'DB_ACCESS_DENIED', 'Accès base de données refusé.');
    case 'ER_BAD_DB_ERROR':
      return new AppError(503, 'DB_NOT_FOUND', 'Base de données inexistante.');
    default:
      return null;
  }
}

// Signature Express obligatoire à 4 arguments pour errorHandler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: import('express').Request, res: import('express').Response, _next: import('express').NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  // Validation Zod : renvoyer un 400 structuré plutôt qu'un 500.
  if (err instanceof Error && err.name === 'ZodError') {
    const zodErr = err as import('zod').ZodError;
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Données invalides.',
        details: zodErr.flatten().fieldErrors,
      },
    });
    return;
  }

  const translated = err instanceof Error ? translateMysqlError(err as Error & { code?: string }) : null;
  if (translated) {
    res.status(translated.status).json({ error: { code: translated.code, message: translated.message } });
    return;
  }

  // Erreur inattendue : message générique, détails uniquement dans la console serveur
  console.error('[backend] Erreur inattendue :', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Erreur interne du serveur.' } });
}
