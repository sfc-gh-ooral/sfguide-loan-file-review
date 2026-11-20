'use client';

// QC sampling: findings by type (12 months of post-closing QC plus today's failed checks), the
// monthly finding rate, the pre-closing sample, and an AI QC narrative per loan.
import { ClipboardCheck, FileWarning, Gauge, RefreshCw, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Reasoning } from '@/components/Reasoning';
import { ChartTip, ErrorState, Flag, Kpi, Markdown, PageSkeleton, Panel, PoweredBy, SampleAiBadge, Skeleton, SourceBadge, Streamed } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { data } from '@/lib/client';
import type { QcReview } from '@/lib/types';

function Narrative({ loanId }: { loanId: string }) {
  const { data: file, loading, error } = useAsync(() => data.loan(loanId), [loanId]);
  const [review, setReview] = useState<QcReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  useEffect(() => { setReview(null); setErr(undefined); }, [loanId]);
  if (error) return <ErrorState title={`Could not load ${loanId}`} detail={error} />;
  if (loading || !file) return <div className="panel p-4 space-y-3"><Skeleton className="h-5 w-56" /><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-4/6" /><Skeleton className="h-24" /></div>;
  const r = review ?? file.qc;
  const p = review?.provenance ?? file.provenance;
  const fields = file.docs.reduce((a, d) => a + Object.keys(d.fields).length, 0);
  const regenerate = async () => {
    setBusy(true); setErr(undefined);
    try { setReview(await data.narrative(loanId)); } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); }
  };
  return (
    <Panel eyebrow={`QC narrative · ${loanId}`} title={file.loan.borrower} right={<>{p.source === 'mock' && <SampleAiBadge />}<PoweredBy>AI_COMPLETE</PoweredBy></>}>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {file.checks.filter((c) => c.status !== 'Pass').map((c) => <Flag key={c.checkId} tone={c.status === 'Fail' ? 'highlight' : 'muted'}>{c.checkName}: {c.status}</Flag>)}
        {file.checks.every((c) => c.status === 'Pass') && <Flag tone="pass">All {file.checks.length} checks pass</Flag>}
        <SourceBadge p={p} />
      </div>
      {busy ? (
        <Reasoning kind="narrative" steps={[`Reading ${fields} fields extracted from ${file.docs.length} documents`, `Applying ${file.checks.length} credit policy tolerances in SQL`,
          `Listing ${file.conditions.filter((c) => c.status !== 'Cleared').length} open conditions`, 'Writing the QC narrative with AI_COMPLETE']} />
      ) : r ? (
        <div className="rounded-xl p-4" style={{ background: 'var(--ai-soft)' }}>{review ? <Streamed text={r.narrative} /> : <Markdown text={r.narrative} />}</div>
      ) : <p className="text-sm muted">No narrative yet for this loan.</p>}
      {r && !busy && <p className="text-[11px] muted mt-2">AI narrative from {r.model}, generated {r.generatedAt}. Review before acting.</p>}
      {err && <p className="text-sm mt-2" style={{ color: 'var(--fail)' }}>{err}</p>}
      <div className="flex gap-2 mt-3 flex-wrap">
        <button className="btn btn-ai" disabled={busy} onClick={regenerate}><RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />Regenerate narrative</button>
        <Link className="btn" href={`/loan?id=${loanId}`}>Open loan file</Link>
      </div>
    </Panel>
  );
}

function QcView() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: qc, error, loading, reload } = useAsync(() => data.qc(), []);
  const selected = params.get('id') ?? qc?.sample[0]?.loanId;
  if (loading) return <PageSkeleton label="Loading QC sampling" />;
  if (error || !qc) return <ErrorState title="Could not load QC sampling" detail={error} onRetry={reload} />;
  const rate = qc.monthly.map((m) => ({ month: m.month.slice(2).replace('-', '/'), rate: Math.round((m.withFinding / m.reviewed) * 1000) / 10 }));
  const reviewed = qc.monthly.reduce((a, m) => a + m.reviewed, 0);
  const withFinding = qc.monthly.reduce((a, m) => a + m.withFinding, 0);
  const current = qc.findingsByType.reduce((a, f) => a + f.current, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow" style={{ color: 'var(--cobalt)' }}>Quality control</div>
          <h1 className="text-[26px] font-bold leading-tight">QC sampling</h1>
          <p className="text-sm ink-2 max-w-2xl">Pre-closing sample: every loan at conditional approval or later, with the same tolerance checks and an AI QC narrative. History is twelve months of post-closing reviews.</p>
        </div>
        <div className="flex gap-1.5 flex-wrap"><PoweredBy>SQL tolerance rules</PoweredBy><SourceBadge p={qc.provenance} /></div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi label="Reviewed, 12 months" value={String(reviewed)} icon={<ClipboardCheck className="w-3.5 h-3.5" />} spark={qc.monthly.map((m) => m.reviewed)} sparkLabel="Loans reviewed per month" sub="Post-closing QC reviews per month" />
        <Kpi label="With a finding" value={`${Math.round((withFinding / reviewed) * 1000) / 10}%`} tone="wait" icon={<FileWarning className="w-3.5 h-3.5" />}
          spark={rate.map((r) => r.rate)} sparkLabel="Share of reviewed loans with a finding, per month" sub={`${withFinding} of ${reviewed} reviewed loans`} />
        <Kpi label="Pre-closing sample" value={String(qc.sample.length)} icon={<Gauge className="w-3.5 h-3.5" />} sub={`${qc.sample.filter((s) => s.failed.length).length} with a failed check`} />
        <Kpi label="Failed checks today" value={String(current)} tone="fail" icon={<ShieldCheck className="w-3.5 h-3.5" />} sub="Across the active pipeline" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel eyebrow="Findings by type" title="Where QC finds problems">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={qc.findingsByType} layout="vertical" margin={{ left: 4, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="type" width={136} tick={{ fontSize: 11.5, fill: 'var(--ink-2)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'color-mix(in srgb, var(--cobalt) 6%, transparent)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Bar dataKey="historical" name="Post-closing QC, 12 months" fill="var(--s1)" radius={[0, 5, 5, 0]} barSize={10} />
                <Bar dataKey="current" name="Failed checks in the pipeline today" fill="var(--s3)" radius={[0, 5, 5, 0]} barSize={10} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel eyebrow="Trend" title="Share of reviewed loans with a finding">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rate} margin={{ left: -14, right: 10, top: 6 }}>
                <defs><linearGradient id="qcrate" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--s1)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--s1)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<ChartTip unit="%" />} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Area dataKey="rate" name="Loans with a finding" stroke="var(--s1)" strokeWidth={2} fill="url(#qcrate)" dot={{ r: 2.5, fill: 'var(--s1)' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] muted">Synthetic history of {reviewed} reviewed loans.</p>
        </Panel>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <Panel pad={false} eyebrow="Pre-closing sample" title={`${qc.sample.length} loans`}>
            <ul className="border-t max-h-[480px] overflow-y-auto" style={{ borderColor: 'var(--line)' }}>
              {qc.sample.map((s) => {
                const on = s.loanId === selected;
                return (
                  <li key={s.loanId}>
                    <button onClick={() => router.push(`/qc?id=${s.loanId}`)} aria-current={on || undefined}
                      className="w-full text-left px-4 py-2.5 border-b flex items-center gap-3 transition-colors hover:bg-[var(--surface-2)]"
                      style={{ borderColor: 'var(--line)', background: on ? 'var(--cobalt-soft)' : undefined, boxShadow: on ? 'inset 3px 0 0 var(--cobalt)' : undefined }}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold truncate">{s.borrower}</span>
                        <span className="block text-[11px] muted"><span className="mono">{s.loanId}</span> · {s.stage}</span>
                      </span>
                      <span className="flex gap-1 flex-wrap justify-end">
                        {s.failed.map((f) => <Flag key={f} tone="highlight">{f}</Flag>)}
                        {!s.failed.length && <span className="text-[11px] muted">{s.openConditions ? `${s.openConditions} open cond.` : 'No finding'}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel eyebrow="CREDIT_POLICY table" title="Tolerances">
            <dl className="text-sm">
              {qc.policy.map((p) => (
                <div key={p.ruleId} className="flex justify-between gap-3 py-2 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                  <dt className="min-w-0"><span className="font-semibold text-[13px]">{p.ruleName}</span><div className="text-[11px] muted">{p.description}</div></dt>
                  <dd className="mono font-semibold whitespace-nowrap">{p.ruleId === 'appraisal' ? `${p.threshold} days` : p.ruleId === 'amount' ? `$${p.threshold}` : `${Math.round(p.threshold * 100)}%`}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] muted mt-2">Read by the LOAN_CHECKS view. Illustrative values, not a credit policy.</p>
          </Panel>
        </div>
        <div className="min-w-0 xl:sticky xl:top-[72px]">{selected && <Narrative loanId={selected} />}</div>
      </div>
    </div>
  );
}

export default function QcPage() {
  return <Suspense fallback={<PageSkeleton label="Loading" />}><QcView /></Suspense>;
}
