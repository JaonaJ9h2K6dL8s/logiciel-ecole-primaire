'use client';

import { Box, Button, Typography } from '@mui/material';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';

interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Box sx={{ py: 8, textAlign: 'center' }}>
      <InboxOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
      <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
        {message}
      </Typography>
      {actionLabel && onAction && (
        <Button variant="contained" sx={{ mt: 2 }} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
