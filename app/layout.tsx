import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Strait of Hormuz — Live Transit Monitor",
  description: "Live vessel transit, carrier status, and Brent crude tracker for the Strait of Hormuz.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
