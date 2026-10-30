'use client';

import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, useMediaQuery, useTheme } from '@mui/material';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmColor?: 'primary' | 'error' | 'warning';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  confirmColor = 'primary',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth fullScreen={fullScreen}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Annuler
        </Button>
        <Button onClick={onConfirm} variant="contained" color={confirmColor} disabled={loading}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
