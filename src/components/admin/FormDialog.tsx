'use client';

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, useMediaQuery, useTheme } from '@mui/material';

interface FormDialogProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
}

export default function FormDialog({
  open,
  title,
  children,
  saving,
  onClose,
  onSubmit,
  submitLabel,
}: FormDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>{children}</DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Annuler
        </Button>
        <Button onClick={onSubmit} variant="contained" disabled={saving}>
          {submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
