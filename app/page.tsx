'use client';

// Pipeline: the stage line (loans and open conditions per stage), KPI tiles, the work queue with
// sort and filters, the files that need a human, closing horizon and processor workload.
import { AlertOctagon, ArrowDownUp, CalendarClock, CheckCircle2, ChevronRight, FileCheck2, Files, ListChecks, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTip, EmptyState, ErrorState, Flag, Kpi, PageSkeleton, Panel, PoweredBy, SourceBadge, money } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { data } from '@/lib/client';
import { STAGES, type Pipeline, type PipelineLoan } from '@/lib/types';

const ME = 'Renata Okonkwo';
const AS_OF = '2026-11-19';
type SortKey = 'loanId' | 'daysToClose' | 'openConditions' | 'amount';

/** Applications received per week for the last 10 weeks before the as-of date (from applicationDate). */
// Weekly series for the KPI sparklines, all from the loans in the pipeline payload. `by` picks the date
// (application, or target close for the forward view) and `value` what each loan adds (1, its open
// conditions, its documents). Index 0 is the oldest week; for `ahead`, the week starting AS_OF.
function weekly(loans: PipelineLoan[], by: (l: PipelineLoan) => string, value: (l: PipelineLoan) => number = () => 1, ahead = false) {
  const end = new Date(`${AS_OF}T00:00:00Z`).getTime();
  const weeks = Array(ahead ? 8 : 10).fill(0);
  for (const l of loans) {
    const w = Math.floor(((ahead ? -1 : 1) * (end - new Date(`${by(l)}T00:00:00Z`).getTime())) / (7 * 864e5));
    if (w >= 0 && w < weeks.length) weeks[ahead ? w : weeks.length - 1 - w] += value(l);
  }
  return weeks;
}
const weeklyApplications = (loans: PipelineLoan[]) => weekly(loans, (l) => l.applicationDate);

function StageLine({ p, active, onPick }: { p: Pipeline; active: string; onPick: (s: string) => void }) {
  const max = Math.max(...p.byStage.map((s) => s.loans));
  return (
    <section className="panel blueprint overflow-hidden" aria-label="Loans by stage">
      <div className="px-4 md:px-6 pt-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow" style={{ color: 'var(--cobalt)' }}>Stage line · {p.kpis.activeLoans} active loans</div>
          <h1 className="text-[26px] md:text-[30px] font-bold leading-tight mt-1">Every file, from application to keys.</h1>
          <p className="text-sm ink-2 mt-1 max-w-2xl">Borrower documents land on a stage; a stream and task parse, classify and extract each one, and SQL rules check it against the application. Pick a station to filter the queue.</p>
        </div>
        <div className="flex gap-1.5 flex-wrap"><PoweredBy>stage + stream + task</PoweredBy><SourceBadge p={p.provenance} /></div>
      </div>
      <div className="relative overflow-x-auto">
        <ol className="relative grid grid-cols-6 min-w-[720px] px-4 md:px-6 pt-8 pb-6">
          <span className="absolute left-[8%] right-[8%] top-[58px] h-[6px] rounded-full" style={{ background: 'linear-gradient(90deg, var(--cobalt), var(--s3))' }} aria-hidden />
          {p.byStage.map((s) => {
            const size = 26 + Math.round((s.loans / max) * 22);
            const on = active === s.stage;
            return (
              <li key={s.stage} className="relative flex flex-col items-center text-center">
                <button onClick={() => onPick(on ? 'active' : s.stage)} aria-pressed={on}
                  className="relative grid place-items-center rounded-full font-bold tabular transition-transform hover:scale-110"
                  style={{ width: size, height: size, marginTop: (48 - size) / 2, background: on ? 'var(--cobalt)' : 'var(--surface)', color: on ? 'var(--surface)' : 'var(--cobalt)',
                    border: '3px solid var(--cobalt)', boxShadow: on ? '0 0 0 6px color-mix(in srgb, var(--cobalt) 22%, transparent)' : 'var(--shadow)', fontFamily: 'var(--font-display)' }}
                  aria-label={`${s.stage}: ${s.loans} loans, ${s.openConditions} open conditions`}>
                  {s.loans}
                </button>
                <div className="mt-3 text-[13px] font-semibold leading-tight" style={{ marginTop: 12 + (48 - size) / 2 }}>{s.stage}</div>
                <div className="mt-1 text-[11px]">
                  {s.openConditions > 0 ? <Flag tone="wait">{s.openConditions} open conditions</Flag> : <span className="muted">no open conditions</span>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function PipelineView() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: p, error, loading, reload } = useAsync(() => data.pipeline(), []);
  const [stage, setStage] = useState('active');
  const [view, setView] = useState<'all' | 'attention' | 'ready' | 'mine'>('all');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'daysToClose', dir: 1 });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (p?.loans ?? []).filter((l) =>
      (stage === 'active' ? l.stage !== 'Closed' : stage === 'all' || l.stage === stage) &&
      (view === 'all' || (view === 'attention' ? l.failedChecks.length > 0 : view === 'ready' ? l.ready : l.processor === ME)) &&
      (!needle || l.loanId.toLowerCase().includes(needle) || l.borrower.toLowerCase().includes(needle)))
      .sort((a, b) => {
        const av = a[sort.key] ?? 1e9, bv = b[sort.key] ?? 1e9;
        return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
      });
  }, [p, stage, view, q, sort]);

  if (loading) return <PageSkeleton label="Loading the pipeline" />;
  if (error || !p) return <ErrorState title="Could not load the pipeline" detail={error} onRetry={reload} />;
  const k = p.kpis;
  const active = p.loans.filter((l) => l.stage !== 'Closed');
  const attention = active.filter((l) => l.failedChecks.length > 0);
  const horizon = [['0–7', 0, 7], ['8–14', 8, 14], ['15–21', 15, 21], ['22–28', 22, 28], ['29–35', 29, 35], ['36+', 36, 999]].map(([label, lo, hi]) => {
    const inB = active.filter((l) => l.daysToClose !== null && l.daysToClose >= (lo as number) && l.daysToClose <= (hi as number));
    return { label: `${label} d`, withConditions: inB.filter((l) => l.openConditions > 0).length, clean: inB.filter((l) => l.openConditions === 0).length };
  });
  const processors = [...new Set(active.map((l) => l.processor))].map((name) => {
    const mine = active.filter((l) => l.processor === name);
    return { name: name.split(' ')[0] + ' ' + name.split(' ').slice(-1)[0][0] + '.', loans: mine.length, openConditions: mine.reduce((a, l) => a + l.openConditions, 0) };
  }).sort((a, b) => b.loans - a.loans);
  const th = (key: SortKey, label: string, right = false) => (
    <th className={right ? 'text-right' : ''} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>{label}<ArrowDownUp className="w-3 h-3" aria-hidden /></button>
    </th>
  );

  return (
    <div className="space-y-4">
      <StageLine p={p} active={stage} onPick={setStage} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label="Active loans" value={String(k.activeLoans)} icon={<Files className="w-3.5 h-3.5" />} spark={weeklyApplications(p.loans)}
          sparkLabel="Applications received per week, last 10 weeks" sub={<>Sparkline: applications per week, last 10 weeks · <strong>{k.readyToClear}</strong> ready to clear</>} />
        <Kpi label="Open conditions" value={String(k.openConditions)} tone="wait" icon={<ListChecks className="w-3.5 h-3.5" />}
          spark={weekly(active, (l) => l.applicationDate, (l) => l.openConditions)} sparkLabel="Open conditions by application week, last 10 weeks"
          sub={<>Sparkline: open conditions by application week · <strong>{attention.length}</strong> files failed a tolerance check</>} />
        <Kpi label="Avg days to close" value={k.avgDaysToClose === null ? '—' : String(k.avgDaysToClose)} tone="cobalt" icon={<CalendarClock className="w-3.5 h-3.5" />}
          spark={weekly(active, (l) => l.targetCloseDate, () => 1, true)} sparkLabel="Scheduled closings per week, next 8 weeks"
          sub={<>Sparkline: scheduled closings per week, next 8 weeks · <strong>{active.filter((l) => l.daysToClose !== null && l.daysToClose <= 7).length}</strong> files close within 7 days</>} />
        <Kpi label="Documents extracted" value={`${k.docsExtracted} / ${k.docsReceived}`} tone="pass" icon={<FileCheck2 className="w-3.5 h-3.5" />}
          spark={weekly(p.loans, (l) => l.applicationDate, (l) => l.docsReceived)} sparkLabel="Documents received by application week, last 10 weeks"
          sub={<>Sparkline: documents by application week{k.typeAccuracy !== null && <> · AI_CLASSIFY matched the generator&apos;s label on <strong>{Math.round(k.typeAccuracy * 1000) / 10}%</strong> of documents</>}</>} />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
        <Panel pad={false} eyebrow="Work queue" title={`${rows.length} loan files`} right={<PoweredBy>SQL tolerance rules</PoweredBy>}>
          <div className="px-4 pb-3 flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 muted absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden />
              <input className="input w-full !pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by loan or borrower" aria-label="Filter by loan or borrower" />
            </div>
            <select aria-label="Stage" className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="active">Active stages</option><option value="all">All stages</option>
              {STAGES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <div className="flex rounded-[10px] border p-[3px] gap-[2px] flex-wrap" style={{ borderColor: 'var(--line)' }} role="radiogroup" aria-label="Show">
              {([['all', 'All'], ['attention', 'Failed a check'], ['ready', 'Ready'], ['mine', 'My files']] as const).map(([v, label]) => (
                <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)} className="px-2.5 h-7 rounded-[7px] text-xs font-semibold"
                  style={view === v ? { background: 'var(--cobalt-soft)', color: 'var(--cobalt)' } : { color: 'var(--muted)' }}>{label}</button>
              ))}
            </div>
          </div>
          <div className="relative overflow-x-auto max-h-[520px] overflow-y-auto border-t" style={{ borderColor: 'var(--line)' }}>
            {rows.length === 0 ? <EmptyState title="No files match these filters" detail="Clear the search or pick another stage." action={<button className="btn" onClick={() => { setQ(''); setView('all'); setStage('active'); }}>Reset filters</button>} /> : (
              <>
              <ul className="md:hidden">
                {rows.map((l) => (
                  <li key={l.loanId} className="border-b last:border-b-0" style={{ borderColor: 'var(--line)' }}>
                    <Link href={`/loan?id=${l.loanId}`} className="no-underline flex items-start gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="flex justify-between gap-2"><span className="font-semibold text-[13.5px] truncate">{l.borrower}</span><span className="mono text-[12px]">{money(l.amount)}</span></span>
                        <span className="block text-[11px] muted"><span className="mono">{l.loanId}</span> · {l.stage} · {l.daysToClose === null ? 'closed' : `${l.daysToClose} d to close`} · {l.openConditions} open</span>
                        <span className="flex gap-1 flex-wrap mt-1">
                          {l.failedChecks.map((f) => <Flag key={f} tone="highlight">{f}</Flag>)}
                          {l.ready && <Flag tone="pass">Ready to clear</Flag>}
                          {l.escalated && <Flag tone="ai">Escalated</Flag>}
                        </span>
                      </span>
                      <ChevronRight className="w-4 h-4 muted shrink-0 mt-1" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
              <table className="grid-table min-w-[760px] hidden md:table">
                <thead><tr>{th('loanId', 'Loan')}<th>Stage</th>{th('amount', 'Amount', true)}{th('daysToClose', 'Days to close', true)}{th('openConditions', 'Open cond.', true)}<th>Checks</th><th aria-label="Open" /></tr></thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.loanId} className="row-click" onClick={() => router.push(`/loan?id=${l.loanId}`)}>
                      <td>
                        <Link href={`/loan?id=${l.loanId}`} className="no-underline font-semibold" onClick={(e) => e.stopPropagation()}>{l.borrower}</Link>
                        <div className="text-[11px] muted"><span className="mono">{l.loanId}</span> · {l.program} · {l.processor}</div>
                      </td>
                      <td className="text-xs whitespace-nowrap">{l.stage}</td>
                      <td className="text-right mono text-[12.5px]">{money(l.amount)}</td>
                      <td className="text-right tabular">
                        {l.daysToClose === null ? <span className="muted">—</span> : <span className="font-semibold" style={{ color: l.daysToClose <= 7 ? 'var(--fail)' : undefined }}>{l.daysToClose}</span>}
                      </td>
                      <td className="text-right tabular">{l.openConditions || <span className="muted">0</span>}</td>
                      <td><div className="flex gap-1 flex-wrap">
                        {l.failedChecks.map((f) => <Flag key={f} tone="highlight" icon={<AlertOctagon className="w-3 h-3" />}>{f}</Flag>)}
                        {l.ready && <Flag tone="pass" icon={<CheckCircle2 className="w-3 h-3" />}>Ready to clear</Flag>}
                        {l.escalated && <Flag tone="ai">Escalated</Flag>}
                        {!l.failedChecks.length && !l.ready && <span className="text-[11px] muted">{l.pendingChecks ? `${l.pendingChecks} checks waiting on documents` : 'All checks pass'}</span>}
                      </div></td>
                      <td className="text-right"><ChevronRight className="w-4 h-4 muted inline" aria-hidden /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
          </div>
          <p className="text-[11px] muted px-4 py-2.5 border-t" style={{ borderColor: 'var(--line)' }}>A check fails when the application and the extracted documents disagree beyond the credit policy tolerance.{k.lastRun ? ` Last pipeline run ${k.lastRun}.` : ''}</p>
        </Panel>

        <div className="space-y-4 min-w-0">
          <Panel eyebrow="Needs a human" title={`${attention.length} files with a mismatch`}>
            <ul className="space-y-2">
              {attention.map((l) => (
                <li key={l.loanId}>
                  <Link href={`/loan?id=${l.loanId}`} className="no-underline flex items-center gap-3 p-2.5 rounded-xl border transition-colors hover:border-[var(--cobalt)]" style={{ borderColor: 'var(--line)' }}>
                    <span className="w-1.5 self-stretch rounded-full" style={{ background: 'var(--highlight)' }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{l.borrower}</span>
                      <span className="block text-[11px] muted"><span className="mono">{l.loanId}</span> · {l.stage} · closes in {l.daysToClose} d</span>
                      <span className="block mt-1"><span className="hl-stroke text-[11px] font-semibold">{l.failedChecks.join(', ')}</span></span>
                    </span>
                    <ChevronRight className="w-4 h-4 muted shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-[11px] muted mt-3">On this synthetic data set, these mismatches were planted for the walkthrough.</p>
          </Panel>
          <Panel eyebrow="Ready" title="Clear to close candidates">
            <ul className="space-y-1.5">
              {active.filter((l) => l.ready).map((l) => (
                <li key={l.loanId}><Link href={`/loan?id=${l.loanId}`} className="no-underline flex items-center justify-between gap-2 text-sm py-1">
                  <span className="flex items-center gap-2 min-w-0"><CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--pass)' }} aria-hidden /><span className="truncate">{l.borrower}</span></span>
                  <span className="mono text-[11px] muted">{l.loanId}</span></Link></li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel eyebrow="Closing horizon" title="Active files by days to target close">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={horizon} margin={{ left: -18, right: 8, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'color-mix(in srgb, var(--cobalt) 6%, transparent)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Bar dataKey="withConditions" name="With open conditions" stackId="a" fill="var(--s1)" />
                <Bar dataKey="clean" name="No open conditions" stackId="a" fill="var(--s3)" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel eyebrow="Workload" title="Active files and open conditions by processor">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={processors} layout="vertical" margin={{ left: 4, right: 12, top: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 12, fill: 'var(--ink-2)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'color-mix(in srgb, var(--cobalt) 6%, transparent)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Bar dataKey="loans" name="Active files" fill="var(--s1)" radius={[0, 5, 5, 0]} barSize={12} />
                <Bar dataKey="openConditions" name="Open conditions" fill="var(--s2)" radius={[0, 5, 5, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  return <Suspense fallback={<PageSkeleton label="Loading" />}><PipelineView /></Suspense>;
}
