'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StudentIdentity } from '@/services/studentZone';

/**
 * Identité élève de la Zone Élèves (miroir du cookie httpOnly `student_zone`
 * posé par le backend). Persistée en sessionStorage : la session élève ne
 * survit pas à la fermeture de l'onglet.
 */
interface StudentZoneState {
  student: StudentIdentity | null;
  setStudent: (student: StudentIdentity | null) => void;
}

export const useStudentZoneStore = create<StudentZoneState>()(
  persist(
    (set) => ({
      student: null,
      setStudent: (student) => set({ student }),
    }),
    { name: 'student-zone', storage: createJSONStorage(() => sessionStorage) }
  )
);
