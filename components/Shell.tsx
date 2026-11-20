'use client';

// App frame: the cobalt icon rail (bottom tabs on phones), the work bar with loan jump box,
// environment badge, theme toggle and user chip, and the disclaimer.
import { ClipboardCheck, FileSearch, Info, LayoutDashboard, MessagesSquare, Moon, Search, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { LogoMark } from '@/components/Brand';
import { ModeChip } from '@/components/ModeChip';
import { HOSTED_EXAMPLE } from '@/lib/hosted';

const NAV = [
  { href: '/', label: 'Pipeline', icon: LayoutDashboard },
  { href: '/loan', label: 'Loan file', icon: FileSearch },
  { href: '/qc', label: 'QC', icon: ClipboardCheck },
  { href: '/ask', label: 'Ask', icon: MessagesSquare },
];
const TITLE: Record<string, string> = { '/': 'Pipeline', '/loan': 'Loan file', '/qc': 'QC sampling', '/ask': 'Ask the file' };
const REPO = 'https://github.com/sfc-gh-ooral/sfguide-loan-file-review';

function ThemeToggle() {
  const [dark, setDark] = useState<boolean>();
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setDark(t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches);
  }, []);
  if (dark === undefined) return <span className="w-[34px]" />;
  const flip = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('lfr-theme', next); } catch { /* private mode */ }
    setDark(!dark);
  };
  return (
    <button className="btn btn-ghost !px-2" onClick={flip} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

function Crumb() {
  const pathname = usePathname().replace(/\/$/, '') || '/';
  const id = useSearchParams().get('id');
  return (
    <div className="min-w-0">
      <div className="text-[11px] muted truncate">Halvaren Home Lending · data as of Nov 19, 2026</div>
      <div className="text-[15px] font-semibold truncate" style={{ fontFamily: 'var(--font-display)' }}>
        {TITLE[pathname] ?? 'Lintora'}{id && pathname !== '/' && <span className="muted font-medium"> / <span className="mono text-[13px]">{id}</span></span>}
      </div>
    </div>
  );
}

function JumpBox() {
  const router = useRouter();
  const [q, setQ] = useState('');
  return (
    <form className="relative hidden lg:block" role="search" onSubmit={(e) => {
      e.preventDefault();
      const n = q.trim().toUpperCase().replace(/^LN-?/, '');
      if (/^\d{6}$/.test(n)) { router.push(`/loan?id=LN-${n}`); setQ(''); }
      else if (q.trim()) router.push(`/?q=${encodeURIComponent(q.trim())}`);
    }}>
      <Search className="w-4 h-4 muted absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
      <input className="input w-64 !pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to loan or borrower" aria-label="Jump to loan or borrower" />
    </form>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [about, setAbout] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!about) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbout(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [about]);
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.replace(/\/$/, '') === href);

  return (
    <div className="min-h-screen">
      <nav aria-label="Main navigation" className="fixed z-40 bg-rail flex md:flex-col md:inset-y-0 md:left-0 md:w-[76px] md:py-4 md:px-2 md:gap-1
        inset-x-0 bottom-0 h-[64px] md:h-auto px-2 items-center md:items-stretch justify-around md:justify-start" style={{ boxShadow: '0 0 0 1px rgba(255,255,255,.04)' }}>
        <Link href="/" className="hidden md:flex justify-center mb-4 no-underline" aria-label="Lintora File Desk, pipeline"><LogoMark size={36} /></Link>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className="rail-btn flex-1 md:flex-none">
            <Icon className="w-5 h-5" aria-hidden />{label}
          </Link>
        ))}
        <button className="rail-btn hidden md:flex md:mt-auto" onClick={() => setAbout(true)} aria-haspopup="dialog"><Info className="w-5 h-5" aria-hidden />About</button>
      </nav>

      <div className="md:pl-[76px] pb-[72px] md:pb-0 min-w-0">
        {HOSTED_EXAMPLE && (
          <div role="note" className="px-4 md:px-6 py-1.5 text-xs border-b" style={{ background: 'var(--cobalt-soft)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
            <strong style={{ color: 'var(--ink)' }}>Hosted example on synthetic data.</strong> Runs in your browser with no Snowflake account; AI text is captured from the live pipeline and labeled as a sample.{' '}
            <a href={REPO} className="underline underline-offset-2">Run it in your account</a>
          </div>
        )}
        <header className="sticky top-0 z-30 h-14 flex items-center gap-3 px-4 md:px-6 border-b" style={{ background: 'var(--canvas)', borderColor: 'var(--line)' }}>
          <span className="md:hidden"><LogoMark size={28} /></span>
          <Suspense fallback={<div className="min-w-0" />}><Crumb /></Suspense>
          <div className="ml-auto flex items-center gap-2">
            <JumpBox />
            <ModeChip />
            <ThemeToggle />
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l" style={{ borderColor: 'var(--line)' }} title="Fictional user for this example">
              <span className="w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold text-white" style={{ background: 'linear-gradient(135deg,#1F3FBF,#0F9DB0)' }} aria-hidden>RO</span>
              <span className="hidden xl:block leading-tight"><span className="block text-xs font-semibold">Renata Okonkwo</span><span className="block text-[11px] muted">Loan processor</span></span>
            </div>
            <button className="btn btn-ghost !px-2 md:hidden" onClick={() => setAbout(true)} aria-label="About this example"><Info className="w-4 h-4" /></button>
          </div>
        </header>
        <main key={pathname} className="fade-up px-4 md:px-6 py-5 max-w-[1480px] mx-auto">{children}</main>
        <footer className="px-4 md:px-6 pb-6 text-[11px] muted max-w-[1480px] mx-auto">
          Lintora and Halvaren Home Lending are fictional. Synthetic data and illustrative logic; not underwriting, credit, legal, regulatory or compliance advice. AI narratives and drafts are suggestions for human review.
        </footer>
      </div>

      {about && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setAbout(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="about-title" className="panel fade-up max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3"><LogoMark /><h2 id="about-title" className="text-lg font-semibold">Lintora File Desk</h2></div>
              <button ref={closeRef} className="btn btn-ghost !px-2" onClick={() => setAbout(false)} aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm ink-2 mb-2">A Snowflake example for mortgage loan processors and QC reviewers. Borrower documents are parsed, classified and extracted with Cortex AI functions, then checked against the application with SQL tolerance rules.</p>
            <p className="text-sm ink-2 mb-3">All borrowers, lenders and documents are synthetic. This is not a Snowflake product and isn&apos;t supported by Snowflake Support.</p>
            <a className="btn" href={REPO} target="_blank" rel="noreferrer">View the repository</a>
          </div>
        </div>
      )}
    </div>
  );
}
