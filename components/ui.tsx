'use client';

// Shared UI kit for Lintora: panels, KPI tiles, pills, badges, skeletons, empty/error states,
// a chart tooltip, a streaming text reveal and a small markdown renderer for AI text.
import { AlertTriangle, Bot, CheckCircle2, CircleDashed, Clock3, Database, Inbox, Sparkles, Timer, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import type { Provenance } from '@/lib/types';

export const usd = (x: number | null | undefined, digits = 2) =>
  x === null || x === undefined ? '—' : `$${x.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits })}`;
export const money = (x: number): string =>
  x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : x >= 1e3 ? `$${Math.round(x / 1e3)}K` : `$${Math.round(x)}`;

export function Panel({ title, eyebrow, right, children, className = '', pad = true, id }:
  { title?: ReactNode; eyebrow?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section id={id} className={`panel ${className}`}>
      {(title || right || eyebrow) && (
        <div className="panel-head">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && <h2 className="text-[15px] font-semibold leading-snug">{title}</h2>}
          </div>
          {right && <div className="flex items-center gap-1.5 flex-wrap">{right}</div>}
        </div>
      )}
      <div className={pad ? 'p-4' : 'pt-3'}>{children}</div>
    </section>
  );
}

export function Pill({ children, color, bg, title, style }: { children: ReactNode; color: string; bg: string; title?: string; style?: CSSProperties }) {
  return <span title={title} className="pill" style={{ color, background: bg, ...style }}>{children}</span>;
}

const STATUS: Record<string, { c: string; bg: string; icon: typeof CheckCircle2 }> = {
  Pass: { c: 'var(--pass)', bg: 'var(--pass-soft)', icon: CheckCircle2 },
  Cleared: { c: 'var(--pass)', bg: 'var(--pass-soft)', icon: CheckCircle2 },
  Fail: { c: 'var(--fail)', bg: 'var(--fail-soft)', icon: XCircle },
  Open: { c: 'var(--wait)', bg: 'var(--wait-soft)', icon: CircleDashed },
  Pending: { c: 'var(--muted)', bg: 'var(--surface-2)', icon: Clock3 },
  Requested: { c: 'var(--ai)', bg: 'var(--ai-soft)', icon: Clock3 },
};
export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.Pending;
  const Icon = s.icon;
  return <Pill color={s.c} bg={s.bg}><Icon className="w-3 h-3" aria-hidden />{status}</Pill>;
}
export type Tone = 'fail' | 'pass' | 'wait' | 'ai' | 'cobalt' | 'highlight' | 'muted';
const TONE: Record<Tone, [string, string]> = {
  fail: ['var(--fail)', 'var(--fail-soft)'], pass: ['var(--pass)', 'var(--pass-soft)'], wait: ['var(--wait)', 'var(--wait-soft)'],
  ai: ['var(--ai)', 'var(--ai-soft)'], cobalt: ['var(--cobalt)', 'var(--cobalt-soft)'], highlight: ['var(--highlight-ink)', 'var(--highlight-soft)'],
  muted: ['var(--muted)', 'var(--surface-2)'],
};
export function Flag({ children, tone = 'fail', icon }: { children: ReactNode; tone?: Tone; icon?: ReactNode }) {
  const [c, bg] = TONE[tone];
  return <Pill color={c} bg={bg}>{icon}{children}</Pill>;
}
export function Confidence({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return null;
  const tone: Tone = score >= 0.9 ? 'pass' : score >= 0.8 ? 'cobalt' : 'wait';
  return <span title="AI_EXTRACT confidence score"><Flag tone={tone}>{Math.round(score * 100)}%</Flag></span>;
}

/** Names the Snowflake capability behind a component. Only used for features run in Live mode. */
export function PoweredBy({ children }: { children: ReactNode }) {
  return <Pill color="var(--cobalt)" bg="var(--cobalt-soft)"><Sparkles className="w-3 h-3" aria-hidden />Powered by {children}</Pill>;
}
export function SampleAiBadge() {
  return <Pill color="var(--wait)" bg="var(--wait-soft)" title="Captured from the live pipeline; not generated now"><Bot className="w-3 h-3" aria-hidden />Sample AI response</Pill>;
}
export function SourceBadge({ p }: { p?: Provenance }) {
  if (!p) return null;
  if (p.source === 'mock') return <Pill color="var(--muted)" bg="var(--surface-2)"><Database className="w-3 h-3" aria-hidden />Sample data</Pill>;
  return (
    <Pill color="var(--pass)" bg="var(--pass-soft)" title="Measured round trip from the app server to Snowflake">
      <Timer className="w-3 h-3" aria-hidden />Live{p.latencyMs !== undefined ? ` · ${p.latencyMs.toLocaleString()} ms` : ''}
    </Pill>
  );
}

/** Counts up to the value once on first paint. Non-numeric parts (%, $, " / ") are kept. */
export function CountUp({ value }: { value: string }) {
  const m = value.match(/^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/);
  const target = m ? Number(m[2].replace(/,/g, '')) : 0;
  const decimals = m?.[2].includes('.') ? m[2].split('.')[1].length : 0;
  const [n, setN] = useState(m ? 0 : target);
  useEffect(() => {
    if (!m) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(target); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / 600); setN(target * (1 - (1 - k) ** 3)); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  if (!m) return <>{value}</>;
  return <>{m[1]}{n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{m[3]}</>;
}

export function Kpi({ label, value, sub, icon, spark, sparkLabel, tone = 'cobalt' }:
  { label: string; value: string; sub?: ReactNode; icon?: ReactNode; spark?: number[]; sparkLabel?: string; tone?: Tone }) {
  const color = TONE[tone][0];
  return (
    <div className="panel p-4 relative overflow-hidden transition-shadow hover:shadow-lg group">
      <div className="flex items-center gap-2 eyebrow">
        {icon && <span className="w-6 h-6 rounded-md grid place-items-center" style={{ background: TONE[tone][1], color }}>{icon}</span>}{label}
      </div>
      <div className="flex items-end justify-between gap-2 mt-2">
        <div className="text-[28px] leading-none font-bold tabular" style={{ fontFamily: 'var(--font-display)' }}><CountUp value={value} /></div>
        {spark && spark.length > 1 && (
          <div className="w-24 h-10 shrink-0" role="img" aria-label={sparkLabel}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                <defs><linearGradient id={`sp-${label.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
                <Area dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp-${label.replace(/\W/g, '')})`} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {sub && <div className="text-xs muted mt-2 leading-snug">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />;
}
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-label={label}>
      <Skeleton className="h-8 w-72" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-40" />
      <div className="grid lg:grid-cols-3 gap-3"><Skeleton className="h-72 lg:col-span-2" /><Skeleton className="h-72" /></div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}
export function ErrorState({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  return (
    <div className="panel p-6 flex gap-4 items-start" role="alert">
      <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--fail-soft)', color: 'var(--fail)' }}><AlertTriangle className="w-5 h-5" /></span>
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {detail && <p className="text-sm muted mt-1 break-words">{detail}</p>}
        {onRetry && <button className="btn mt-3" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  );
}
export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="py-10 px-4 text-center">
      <span className="w-11 h-11 rounded-2xl grid place-items-center mx-auto mb-3" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}><Inbox className="w-5 h-5" /></span>
      <div className="text-sm font-semibold">{title}</div>
      {detail && <p className="text-xs muted mt-1 max-w-sm mx-auto">{detail}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Recharts tooltip in the Lintora style. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ChartTip({ active, payload, label, unit = '' }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="panel px-3 py-2 text-xs" style={{ borderLeft: '3px solid var(--cobalt)' }}>
      <div className="font-semibold mb-1">{label}</div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 tabular">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color ?? p.fill }} />{p.name}: <strong>{p.value}{unit}</strong>
        </div>
      ))}
    </div>
  );
}

/** Reveals text word by word, like a streamed model response. */
export function useStream(text: string | undefined, wordsPerTick = 3) {
  const [n, setN] = useState(0);
  const words = useRef<string[]>([]);
  useEffect(() => {
    words.current = text ? text.split(/(\s+)/) : [];
    if (!text) { setN(0); return; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(words.current.length); return; }
    setN(0);
    const id = window.setInterval(() => setN((k) => { const next = k + wordsPerTick * 2; if (next >= words.current.length) window.clearInterval(id); return next; }), 30);
    return () => window.clearInterval(id);
  }, [text, wordsPerTick]);
  const done = !text || n >= words.current.length;
  return { shown: done ? text ?? '' : words.current.slice(0, n).join(''), done };
}
export function Streamed({ text }: { text: string }) {
  const { shown, done } = useStream(text);
  return <div className={done ? '' : 'caret'}><Markdown text={shown} /></div>;
}

// Minimal markdown: bold headings, lists, tables, bold/italic and [n] citation chips. React escapes text.
function inline(s: string, key: number): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*|\[\d+\])/g).filter(Boolean);
  return <span key={key}>{parts.map((p, i) =>
    p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong>
      : /^\[\d+\]$/.test(p) ? <span key={i} className="cite">{p}</span>
        : (p.startsWith('_') && p.endsWith('_')) || (p.startsWith('*') && p.endsWith('*')) ? <em key={i}>{p.slice(1, -1)}</em> : p)}</span>;
}
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim())); i++; }
      const body = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      if (body.length) out.push(<table key={k++}><thead><tr>{body[0].map((c, j) => <th key={j}>{inline(c, j)}</th>)}</tr></thead>
        <tbody>{body.slice(1).map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, j)}</td>)}</tr>)}</tbody></table>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items: string[] = [];
      while (i < lines.length) {
        if (/^\s*([-*]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '')); i++; continue; }
        if (!lines[i].trim() && i + 1 < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i + 1])) { i++; continue; }
        break;
      }
      const li = items.map((t, j) => <li key={j}>{inline(t, j)}</li>);
      out.push(ordered ? <ol key={k++}>{li}</ol> : <ul key={k++}>{li}</ul>);
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(l)) { i++; continue; }
    if (/^#{1,4}\s/.test(l)) { out.push(<p key={k++}><strong>{l.replace(/^#+\s/, '')}</strong></p>); i++; continue; }
    if (l.trim()) out.push(<p key={k++}>{inline(l, 0)}</p>);
    i++;
  }
  return <div className="prose-ai text-[13.5px] leading-relaxed">{out}</div>;
}
