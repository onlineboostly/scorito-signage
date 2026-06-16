import type { Metadata } from 'next';
import { Lora, Poppins } from 'next/font/google';
import AutoRefresh from '@/components/AutoRefresh';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Scorito · Bisharp',
  description: 'Scorito poolstand en wedstrijden van vandaag op het scherm',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl" className={`${poppins.variable} ${lora.variable}`}>
      <body className="h-full bg-bisharp-dark font-body text-bisharp-light antialiased">
        <AutoRefresh seconds={300} />
        {children}
      </body>
    </html>
  );
}
