import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cazadores de cuellos de botella",
  description: "Juego por equipos para aprender profiling, latencias y back pressure",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
