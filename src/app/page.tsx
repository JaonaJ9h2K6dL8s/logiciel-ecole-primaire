'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

export default function Home() {
  const router = useRouter();
  const checkSession = useAuthStore((s) => s.checkSession);

  useEffect(() => {
    checkSession().then((user) => {
      router.replace(user ? '/dashboard' : '/login');
    });
  }, [checkSession, router]);

  return null;
}
