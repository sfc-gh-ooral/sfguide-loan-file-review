import type { Metadata } from 'next';
import { Bricolage_Grotesque, Geist_Mono, Public_Sans } from 'next/font/google';
import './globals.css';
import Shell from '@/components/Shell';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-bricolage' });
const sans = Public_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-public' });
const mono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: 'Lintora File Desk · Mortgage loan file review (Snowflake example)',
  description: 'Extract borrower documents, verify them against the loan application, and clear conditions faster. Synthetic data.',
};

// Applies a saved light/dark choice before first paint so the page doesn't flash.
const THEME = "try{var t=localStorage.getItem('lfr-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME }} /></head>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
