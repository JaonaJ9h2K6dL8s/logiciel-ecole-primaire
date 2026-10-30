'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Paper, Stack, TextField, Typography, IconButton } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { useRouter } from 'next/navigation';
import { useStudentZoneStore } from '@/stores/studentZoneStore';
import { aiOrchestratorApi } from '@/services/aiOrchestrator';

// Chat élève : interface très simple (grandes bulles rondes, fond pastel),
// même orchestrateur multi-IA avec role_context 'student' (quota 30/jour).
// Aucune clé API côté navigateur : le backend choisit le fournisseur.

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  provider?: string | null;
}

const IDEES = ['Aide-moi à calculer 34 + 28', 'Explique-moi les fractions', 'Raconte-moi une petite histoire à lire', 'C’est quoi un verbe ?'];

export default function EleveChatPage() {
  const router = useRouter();
  const { student } = useStudentZoneStore();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || loading) return;
      setError(null);
      setInput('');
      setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
      setLoading(true);
      try {
        const data = await aiOrchestratorApi.chat(text);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: data.reply, provider: data.provider };
          return next;
        });
      } catch (err) {
        setMessages((prev) => {
          const next = [...prev];
          if (next.length && next[next.length - 1].content === '') next.pop();
          return next;
        });
        setError(err instanceof Error ? err.message : 'Oups, réessaie dans un instant.');
        setInput(text);
      } finally {
        setLoading(false);
      }
    },
    [input, loading]
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FFF4E0 0%, #E0F4FF 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        p: 2,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%', maxWidth: 760, mb: 1 }}>
        <IconButton onClick={() => router.push('/eleves')} aria-label="Retour" sx={{ bgcolor: '#fff' }}>
          <ArrowBackIcon />
        </IconButton>
        <ChatBubbleOutlineIcon sx={{ color: '#8B6FD0', fontSize: 34 }} />
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#8B6FD0' }}>
          Discute avec ton copain malin !
        </Typography>
      </Stack>

      {student && (
        <Typography sx={{ color: '#3A3A3A', mb: 1 }}>
          Bonjour {student.fullName}, pose ta question !
        </Typography>
      )}

      {error && (
        <Paper sx={{ p: 1.5, mb: 1, bgcolor: '#FFE4E4', color: '#B03A3A', fontWeight: 600, maxWidth: 760 }}>{error}</Paper>
      )}

      <Paper
        ref={scrollRef}
        elevation={0}
        sx={{ width: '100%', maxWidth: 760, flex: 1, overflowY: 'auto', p: 2, bgcolor: 'rgba(255,255,255,0.75)', borderRadius: '28px', minHeight: 320 }}
      >
        {messages.length === 0 ? (
          <Stack spacing={1.5} alignItems="center" sx={{ mt: 4 }}>
            <Typography sx={{ color: '#3A3A3A', textAlign: 'center' }}>Choisis une idée ou écris ta question :</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>
              {IDEES.map((idee) => (
                <Button
                  key={idee}
                  onClick={() => send(idee)}
                  sx={{ bgcolor: '#fff', color: '#3A3A3A', borderRadius: 999, fontWeight: 700, textTransform: 'none', boxShadow: 1, mb: 1 }}
                >
                  {idee}
                </Button>
              ))}
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            {messages.map((m, idx) => (
              <Box key={idx} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <Box
                  sx={{
                    maxWidth: '85%',
                    px: 2.5,
                    py: 1.5,
                    borderRadius: '24px',
                    borderBottomRightRadius: m.role === 'user' ? 6 : 24,
                    borderBottomLeftRadius: m.role === 'assistant' ? 6 : 24,
                    bgcolor: m.role === 'user' ? '#3BA7E0' : '#FFFFFF',
                    color: m.role === 'user' ? '#fff' : '#3A3A3A',
                    fontSize: 18,
                    fontWeight: 600,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.content}
                  {m.role === 'assistant' && m.provider && (
                    <Typography variant="caption" sx={{ display: 'block', color: '#9A9A9A', fontWeight: 400 }}>
                      via {m.provider}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
            {loading && (
              <Box sx={{ display: 'flex' }}>
                <CircularProgress size={22} sx={{ color: '#8B6FD0' }} />
              </Box>
            )}
          </Stack>
        )}
      </Paper>

      <Stack direction="row" spacing={1} sx={{ width: '100%', maxWidth: 760, mt: 2 }}>
        <TextField
          fullWidth
          placeholder="Écris ta question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          disabled={loading}
          sx={{ bgcolor: '#fff', borderRadius: '24px', '& .MuiOutlinedInput-root': { borderRadius: '24px', fontSize: 18 } }}
        />
        <Button
          variant="contained"
          onClick={() => void send()}
          disabled={loading || !input.trim()}
          sx={{ bgcolor: '#8B6FD0', borderRadius: '999px', minWidth: 64, '&:hover': { bgcolor: '#7A5EC0' } }}
          aria-label="Envoyer"
        >
          <SendIcon />
        </Button>
      </Stack>
      <Typography variant="caption" sx={{ color: '#9A9A9A', mt: 1 }}>
        {messages.length >= 25 ? 'Encore un peu de questions aujourd’hui, puis reviens demain !' : 'Demande toujours à ton maître ou ta maîtresse si tu as un doute.'}
      </Typography>
    </Box>
  );
}
