export class ApiError extends Error {
  status: number;
  code: string;
  fieldErrors?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: options.method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  return handleResponse<T>(res);
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  return handleResponse<T>(res);
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = 'Une erreur est survenue.';
    let fieldErrors: Record<string, string[]> | undefined;
    try {
      const data = await res.json();
      if (data?.error) {
        code = data.error.code ?? code;
        message = data.error.message ?? message;
        fieldErrors = data.error.details;
      }
    } catch {
      // réponse non JSON : conserver le message générique
    }
    // Session expirée ou invalide : redirection vers la connexion, sauf pour
    // les appels d'authentification eux-mêmes (évite une boucle de redirection).
    if (res.status === 401 && code !== 'UNKNOWN' && typeof window !== 'undefined') {
      const requested = res.url || '';
      const isAuthCall = requested.includes('/auth/login') || requested.includes('/auth/me') || requested.includes('/auth/logout');
      if (!isAuthCall) {
        window.location.replace('/login');
      }
    }
    throw new ApiError(res.status, code, message, fieldErrors);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload,
};
