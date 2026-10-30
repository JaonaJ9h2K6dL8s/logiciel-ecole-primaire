import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Zone Élèves',
  description: 'Espace lecture et coloriage pour les élèves',
};

export default function ElevesLayout({ children }: { children: React.ReactNode }) {
  return <div className="eleves-zone">{children}</div>;
}
