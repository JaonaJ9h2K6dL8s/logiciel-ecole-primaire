/**
 * Client du multi-IA (orchestrateur). Aucune clé API côté front : le backend
 * choisit seul le fournisseur. Deux sessions possibles : prof (cookie de
 * session) ou élève (cookie student_zone) — credentials: 'include' dans
 * les deux cas.
 */

export interface OrchestratorConversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrchestratorMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  provider: string | null;
  model: string | null;
  createdAt: string;
}

export interface ChatResponse {
  conversationId: number;
  reply: string;
  provider: string;
  subject: string;
  level: string | null;
}

export interface ProviderStatus {
  id: string;
  label: string;
  available: boolean;
  hasKey: boolean;
  healthy: boolean;
  free: boolean;
  model: string;
  costPer1M: { in: number; out: number };
  dayCost: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/ai-orchestrator${path}`, {
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
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

export const aiOrchestratorApi = {
  chat: (message: string, conversationId?: number, signal?: AbortSignal) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId }),
      signal,
    }),
  conversations: () => request<{ conversations: OrchestratorConversation[] }>('/conversations'),
  createConversation: (title: string) =>
    request<{ conversation: { id: number; title: string } }>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  messages: (id: number) => request<{ messages: OrchestratorMessage[] }>(`/conversations/${id}/messages`),
  deleteConversation: (id: number) => request<{ ok: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),
  status: () => request<{ providers: ProviderStatus[]; dailyBudgetUsd: number }>('/status'),
};
