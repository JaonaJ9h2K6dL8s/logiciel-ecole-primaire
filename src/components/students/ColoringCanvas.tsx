'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, Button, CircularProgress, IconButton, Tooltip } from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import { studentZoneApi } from '@/services/studentZone';
import { useStudentZoneStore } from '@/stores/studentZoneStore';

const PALETTE = [
  '#E23B3B', '#F2B84B', '#57B87B', '#3BA7E0',
  '#B565D8', '#F58CA6', '#8B5A2B', '#FFFFFF',
  '#5A5A5A', '#FF8C42', '#7ED6DF', '#222222',
];

/**
 * Coloriage instantané : clic sur une zone du SVG (fill="#FFFFFF" + data-zone)
 * pour la remplir avec la couleur sélectionnée. Export PNG via canvas.
 */
export default function ColoringCanvas({ templateId }: { templateId: string }) {
  const { student } = useStudentZoneStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [color, setColor] = useState(PALETTE[0]);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    studentZoneApi
      .getColoringSvg(templateId)
      .then((svg) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        const svgEl = containerRef.current.querySelector('svg');
        if (svgEl) {
          svgEl.removeAttribute('width');
          svgEl.removeAttribute('height');
          svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          svgEl.style.width = '100%';
          svgEl.style.height = '100%';
        }
        setTitle(templateId.charAt(0).toUpperCase() + templateId.slice(1));
      })
      .catch(() => setMessage('Coloriage introuvable.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const applyFill = (el: Element, value: string) => {
    if (!(el instanceof SVGElement)) return;
    // On ne remplit que les zones prévues (fond blanc + data-zone), jamais les traits.
    const isZone = el.getAttribute('data-zone') !== null;
    const fill = el.getAttribute('fill');
    if (isZone || fill === '#FFFFFF' || fill === '#ffffff' || fill === 'white') {
      el.setAttribute('fill', value);
    }
  };

  const onCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as Element;
      applyFill(target, color);
    },
    [color]
  );

  const serializeSvg = (): string | null => {
    const svgEl = containerRef.current?.querySelector('svg');
    if (!svgEl) return null;
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', '800');
    clone.setAttribute('height', '600');
    return new XMLSerializer().serializeToString(clone);
  };

  const svgToPngDataUrl = (svg: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas indisponible'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('Conversion impossible'));
      img.src = svgUrl;
    });

  const handleSave = async () => {
    const svg = serializeSvg();
    if (!svg) return;
    setSaving(true);
    setMessage(null);
    try {
      const dataUrl = await svgToPngDataUrl(svg);
      const res = await studentZoneApi.saveArtwork(`${title} — coloriage`, dataUrl);
      setSavedId(res.id);
      setMessage('Dessin enregistré ! Regarde-le dans « Mes dessins ».');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    const svg = serializeSvg();
    if (!svg) return;
    try {
      const dataUrl = await svgToPngDataUrl(svg);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${templateId}.png`;
      a.click();
    } catch {
      setMessage('Téléchargement impossible.');
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: '100%' }}>
      <Box
        ref={containerRef}
        onClick={onCanvasClick}
        sx={{
          width: 'min(94vw, 860px)',
          aspectRatio: '4 / 3',
          bgcolor: '#fff',
          borderRadius: '24px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          overflow: 'hidden',
          cursor: 'crosshair',
          display: 'flex',
          '& svg': { width: '100%', height: '100%' },
        }}
      />

      {loading && <CircularProgress size={52} sx={{ color: '#57B87B' }} />}

      {/* Palette ronde + gomme */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
        {PALETTE.map((c) => (
          <Box
            key={c}
            role="button"
            tabIndex={0}
            aria-label={`Couleur ${c}`}
            onClick={() => setColor(c)}
            onKeyDown={(e) => e.key === 'Enter' && setColor(c)}
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              bgcolor: c,
              border: color === c ? '4px solid #222' : '3px solid rgba(0,0,0,0.15)',
              cursor: 'pointer',
              boxShadow: color === c ? '0 0 0 3px #fff, 0 0 0 5px #222' : 'none',
              transition: 'transform .1s',
              '&:hover': { transform: 'scale(1.1)' },
            }}
          />
        ))}
        <Tooltip title="Gomme (remettre en blanc)">
          <IconButton
            onClick={() => setColor('#FFFFFF')}
            sx={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              bgcolor: color === '#FFFFFF' ? '#222' : '#EFEFEF',
              color: color === '#FFFFFF' ? '#fff' : '#333',
              border: '3px solid rgba(0,0,0,0.15)',
            }}
          >
            <UndoIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {message && (
        <Typography sx={{ fontWeight: 700, color: savedId ? '#2E7D32' : '#B03A3A' }}>{message}</Typography>
      )}

      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !student}
          sx={{ borderRadius: 999, fontSize: 20, textTransform: 'none', bgcolor: '#57B87B', px: 4, py: 1.5 }}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button
          variant="contained"
          onClick={handleDownload}
          sx={{ borderRadius: 999, fontSize: 20, textTransform: 'none', bgcolor: '#3BA7E0', px: 4, py: 1.5 }}
        >
          Télécharger
        </Button>
      </Box>
      {!student && (
        <Typography color="error" sx={{ fontWeight: 600 }}>
          Connecte-toi d&apos;abord dans la Zone Élèves pour enregistrer.
        </Typography>
      )}
    </Box>
  );
}
