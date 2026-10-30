/**
 * Service « Zone Élèves ».
 * Utilise des appels fetch dédiés (credentials: 'include') plutôt que le client
 * générique de api.ts : une session élève absente ne doit PAS déclencher la
 * redirection automatique vers /login prévue pour la session prof.
 */

export interface StudentIdentity {
  id: number;
  fullName: string;
  className: string | null;
}

export interface BookInfo {
  id: string;
  slug: string;
  title: string;
  level: 'CP' | 'CE1' | 'CE2';
  pages: number;
  coverColor: string;
}

/** Page de livre : SVG inline ou image servie par l'API. */
export type BookPage = { type: 'svg'; content: string } | { type: 'image'; url: string };

export interface ColoringPageInfo {
  id: string;
  name: string;
}

export interface ArtworkInfo {
  id: number;
  title: string;
  createdAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/students-zone${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = 'Une erreur est survenue.';
    try {
      const data = await res.json();
      message = data?.error?.message ?? message;
    } catch {
      // réponse non JSON
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const studentZoneApi = {
  login: (studentId: number) =>
    request<StudentIdentity>('/login', { method: 'POST', body: JSON.stringify({ studentId }) }),
  logout: () => request<{ ok: boolean }>('/logout', { method: 'POST' }),
  getClasses: () => request<{ classes: { id: number; name: string }[] }>('/classes'),
  getStudents: (classId: number) =>
    request<{ students: { id: number; fullName: string }[] }>(`/students?classId=${classId}`),
  getBooks: () => request<{ books: BookInfo[] }>('/books'),
  getBookPages: (slug: string) =>
    request<{ pages: BookPage[] }>(`/books/${encodeURIComponent(slug)}/pages`),
  getColoringPages: () => request<{ pages: ColoringPageInfo[] }>('/coloring-pages'),
  getColoringSvg: async (id: string): Promise<string> => {
    const res = await fetch(`/api/v1/students-zone/coloring/${encodeURIComponent(id)}`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Coloriage introuvable.');
    return res.text();
  },
  getArtworks: () => request<{ artworks: ArtworkInfo[] }>('/artworks'),
  saveArtwork: (title: string, dataUrl: string) =>
    request<{ id: number }>('/artworks', { method: 'POST', body: JSON.stringify({ title, dataUrl }) }),
  artworkFileUrl: (id: number) => `/api/v1/students-zone/artworks/${id}/file`,
};
