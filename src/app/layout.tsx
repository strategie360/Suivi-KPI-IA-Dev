import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Suivi KPI IA Dev",
  description: "Suivi de l'impact de l'IA sur la charge de développement, ticket par ticket."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
