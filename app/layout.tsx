import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Semi SSR Root Import Repro',
  description: 'Minimal Next.js 16 repro for Semi UI root import crashing SSR on Node 21+',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
