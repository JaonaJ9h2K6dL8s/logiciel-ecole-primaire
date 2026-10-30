'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import StopOutlinedIcon from '@mui/icons-material/StopOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { aiOrchestratorApi, type OrchestratorConversation } from '@/services/aiOrchestrator';
import { useAuthStore } from '@/stores/authStore';
import PageHeader from '@/components/admin/PageHeader';

// Chat IA branché sur l'orchestrateur multi-IA : l'utilisateur ne choisit
// JAMAIS le fournisseur — le backend sélectionne automatiquement (règles de
// routage + fallback) et n'expose que le nom du fournisseur sous la bulle.

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  provider?: string | null;
}

const SUGGESTIONS = [
  'Explique les fractions à un élève de CM2.',
  'Prépare une leçon sur les adjectifs qualificatifs.',
  'Donne-moi cinq exercices de mathématiques avec leurs corrigés.',
  'Calcule 34 + 28, explique à un élève de CE2.',
  'Prépare une leçon de sciences sur l’eau pour le CE1.',
];

/** Rendu Markdown léger (sans dépendance) : titres, listes, gras, code. */
function MarkdownLite({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  const key = () => `b${blocks.length}`;

  const renderInline = (s: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    while ((m = regex.exec(s)) !== null) {
      if (m.index > last) parts.push(s.slice(last, m.index));
      const token = m[0];
      if (token.startsWith('**')) {
        parts.push(<b key={`i${k++}`}>{token.slice(2, -2)}</b>);
      } else {
        parts.push(
          <Box key={`i${k++}`} component="code" sx={{ px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: '0.9em' }}>
            {token.slice(1, -1)}
          </Box>
        );
      }
      last = m.index + token.length;
    }
    if (last < s.length) parts.push(s.slice(last));
    return parts;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <Box key={key()} component="pre" sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1, overflowX: 'auto', fontSize: '0.85rem' }}>
          {buf.join('\n')}
        </Box>
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      blocks.push(
        <Typography key={key()} variant={level <= 2 ? 'subtitle1' : 'subtitle2'} fontWeight={700} sx={{ mt: 1 }}>
          {renderInline(h[2])}
        </Typography>
      );
      i += 1;
      continue;
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <Box key={key()} component="ul" sx={{ pl: 3, my: 0.5 }}>
          {items.map((it, ii) => (
            <Box key={ii} component="li" sx={{ mb: 0.25 }}>
              {renderInline(it)}
            </Box>
          ))}
        </Box>
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <Box key={key()} component="ol" sx={{ pl: 3, my: 0.5 }}>
          {items.map((it, ii) => (
            <Box key={ii} component="li" sx={{ mb: 0.25 }}>
              {renderInline(it)}
            </Box>
          ))}
        </Box>
      );
      continue;
    }
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|\s*[-*•]\s|\s*\d+[.)]\s|```|\|)/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <Typography key={key()} variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: 0.5 }}>
        {renderInline(para.join('\n'))}
      </Typography>
    );
  }
  return <Stack spacing={0.25}>{blocks}</Stack>;
}

export default function AiChatPage() {
  const user = useAuthStore((s) => s.user);
  const allowed = user?.permissions.includes('pedagogical_ai.use') ?? false;

  const [conversations, setConversations] = useState<OrchestratorConversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const refreshConversations = useCallback(() => {
    aiOrchestratorApi
      .conversations()
      .then((r) => setConversations(r.conversations))
      .catch(() => {
        // liste facultative : une erreur ne bloque pas le chat
      });
  }, []);

  useEffect(() => {
    if (allowed) refreshConversations();
  }, [allowed, refreshConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const openConversation = useCallback(async (id: number) => {
    setSidebarOpen(false);
    setError(null);
    try {
      const r = await aiOrchestratorApi.messages(id);
      setConversationId(id);
      setMessages(
        r.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content, provider: m.provider }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversation inaccessible.');
    }
  }, []);

  const newConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
  }, []);

  const removeConversation = useCallback(
    async (id: number) => {
      try {
        await aiOrchestratorApi.deleteConversation(id);
      } catch {
        // ignore
      }
      if (id === conversationId) newConversation();
      refreshConversations();
    },
    [conversationId, newConversation, refreshConversations]
  );

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || loading) return;
      setError(null);
      setInput('');
      setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
      setLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const data = await aiOrchestratorApi.chat(text, conversationId ?? undefined, controller.signal);
        setConversationId(data.conversationId);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: data.reply, provider: data.provider };
          return next;
        });
        refreshConversations();
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        setMessages((prev) => {
          const next = [...prev];
          if (next.length && next[next.length - 1].role === 'assistant' && next[next.length - 1].content === '') {
            next.pop();
          }
          return next;
        });
        if (!aborted) {
          setError(err instanceof Error ? err.message : 'Le service IA est injoignable. Réessaie.');
          setInput(text);
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [input, loading, conversationId, refreshConversations]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  if (!allowed) {
    return (
      <Box>
        <PageHeader title="Chat IA" subtitle="Assistant pédagogique conversationnel" />
        <Alert severity="warning">Vous n&apos;êtes pas autorisé à utiliser l&apos;assistant IA pédagogique.</Alert>
      </Box>
    );
  }

  const sidebar = (
    <Box sx={{ width: 260, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 1.5 }}>
        <Button fullWidth variant="outlined" startIcon={<AddOutlinedIcon />} onClick={newConversation}>
          Nouveau chat
        </Button>
      </Box>
      <Divider />
      <List dense sx={{ flex: 1, overflowY: 'auto' }}>
        {conversations.map((c) => (
          <ListItem
            key={c.id}
            disablePadding
            secondaryAction={
              <IconButton
                edge="end"
                size="small"
                aria-label="Supprimer"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeConversation(c.id);
                }}
              >
                <DeleteOutlinedIcon fontSize="small" />
              </IconButton>
            }
          >
            <ListItemButton selected={c.id === conversationId} onClick={() => void openConversation(c.id)}>
              <ListItemText primary={c.title} primaryTypographyProps={{ noWrap: true, variant: 'body2' }} />
            </ListItemButton>
          </ListItem>
        ))}
        {conversations.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            Aucune conversation enregistrée.
          </Typography>
        )}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: { xs: 'calc(100vh - 200px)', md: 'calc(100vh - 140px)' }, minHeight: 480 }}>
      <Box sx={{ display: { xs: 'none', md: 'block' }, borderRight: 1, borderColor: 'divider', height: '100%' }}>{sidebar}</Box>
      <Drawer anchor="left" open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
        {sidebar}
      </Drawer>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, px: { xs: 1, md: 2 } }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 1 }}>
          <IconButton sx={{ display: { md: 'none' } }} onClick={() => setSidebarOpen(true)} aria-label="Conversations">
            <MenuOutlinedIcon />
          </IconButton>
          <PageHeader title="Chat IA" subtitle="Assistant pédagogique — fournisseur choisi automatiquement" />
        </Stack>

        {error && (
          <Alert severity="warning" sx={{ mb: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Paper variant="outlined" ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', p: 2, bgcolor: 'background.default' }}>
          {messages.length === 0 ? (
            <Stack spacing={2} alignItems="center" justifyContent="center" sx={{ height: '100%', textAlign: 'center' }}>
              <AutoAwesomeOutlinedIcon color="primary" sx={{ fontSize: 44 }} />
              <Typography variant="h6">Posez votre question en langage naturel</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
                Explications, leçons, exercices corrigés, évaluations… Le meilleur moteur disponible est choisi automatiquement ; les réponses
                restent des propositions à vérifier.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap sx={{ maxWidth: 720 }}>
                {SUGGESTIONS.map((s) => (
                  <Chip key={s} label={s} onClick={() => send(s)} sx={{ mb: 0.5 }} />
                ))}
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={1.5}>
              {messages.map((m, idx) => (
                <Box key={idx} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <Box
                    sx={{
                      maxWidth: { xs: '92%', sm: '80%' },
                      px: 2,
                      py: 1.25,
                      borderRadius: 2,
                      bgcolor: m.role === 'user' ? 'primary.main' : 'background.paper',
                      color: m.role === 'user' ? 'primary.contrastText' : 'text.primary',
                      border: m.role === 'user' ? 'none' : 1,
                      borderColor: 'divider',
                      display: 'flex',
                      gap: 1,
                      alignItems: 'flex-start',
                    }}
                  >
                    {m.role === 'assistant' && <AutoAwesomeOutlinedIcon fontSize="small" color="primary" sx={{ mt: 0.25 }} />}
                    {m.role === 'user' && <PersonOutlinedIcon fontSize="small" sx={{ mt: 0.25, order: 2 }} />}
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      {m.role === 'assistant' ? <MarkdownLite text={m.content} /> : <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{m.content}</Typography>}
                      {m.role === 'assistant' && m.provider && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          via {m.provider}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Box>
              ))}
              {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, py: 1.25, borderRadius: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                      Réflexion en cours…
                    </Typography>
                  </Stack>
                </Box>
              )}
            </Stack>
          )}
        </Paper>

        <Box sx={{ pt: 1.5 }}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
            placeholder="Écrivez votre question… (Ctrl+Entrée = envoyer)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                void send();
              }
            }}
            disabled={loading}
          />
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Réponses générées par IA — à vérifier avant utilisation en classe.
            </Typography>
            {loading ? (
              <Button variant="outlined" color="secondary" startIcon={<StopOutlinedIcon />} onClick={stop}>
                Interrompre
              </Button>
            ) : (
              <Button variant="contained" endIcon={<SendOutlinedIcon />} onClick={() => void send()} disabled={!input.trim()}>
                Envoyer
              </Button>
            )}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
