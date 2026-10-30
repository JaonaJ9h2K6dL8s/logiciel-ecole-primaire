import type { Metadata, Viewport } from "next";
import "./globals.css";
import ThemeRegistry from "./ThemeRegistry";

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export const metadata: Metadata = {
  title: "Logiciel Scolaire",
  description: "Logiciel de gestion scolaire — socle technique",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
