'use client';

// QC sampling: findings by type (12 months of post-closing QC plus today's failed checks),
// the pre-closing sample, and an AI QC narrative per loan.
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Reasoning } from '@/components/Reasoning';
import { Card, Flag, Markdown, PoweredBy, SampleAiBadge, SourceBadge, Thinking } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { data } from '@/lib/client';
import type { QcReview } from '@/lib/types';

function Narrative({ loanId }: { loanId: string }) {
  const { data: file, loading } = useAsync(() => data.loan(loanId), [loanId]);
  const [review, setReview] = useState<QcReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  useEffect(() => { setReview(null); setErr(undefined); }, [loanId]);
  if (loading || !file) return <Thinking label={`Loading ${loanId}`} />;
  const r = review ?? file.qc;
  const p = review?.provenance ?? file.provenance;
  const regenerate = async () => {
    setBusy(true); setErr(undefined);
    try { setReview(await data.narrative(loanId)); } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); }
  };
  return (
    <Card title={`QC narrative · ${loanId} · ${file.loan.borrower}`} right={<>{p.source === 'mock' && <SampleAiBadge />}<PoweredBy>AI_COMPLETE</PoweredBy></>}>
      {busy ? <Reasoning kind="narrative" /> : r ? (
        <>
          <div className="flex gap-2 flex-wrap mb-2">{file.checks.filter((c) => c.status !== 'Pass').map((c) =>
            <Flag key={c.checkId} tone={c.status === 'Fail' ? 'var(--negative)' : 'var(--muted)'}>{c.checkName}: {c.status}</Flag>)}
            <SourceBadge p={p} /></div>
          <Markdown text={r.narrative} />
          <p className="text-[11px] muted mt-2">AI narrative from {r.model}, generated {r.generatedAt}. Review before acting.</p>
        </>
      ) : <p className="text-sm muted">No narrative yet.</p>}
      {err && <p className="text-sm mt-2" style={{ color: 'var(--negative)' }}>{err}</p>}
      <div className="flex gap-2 mt-3 flex-wrap">
        <button className="btn btn-ai" disabled={busy} onClick={regenerate}><RefreshCw className="w-4 h-4" />Regenerate</button>
        <Link className="btn" href={`/loan?id=${loanId}`}>Open loan file</Link>
      </div>
    </Card>
  );
}

function QcView() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: qc, error, loading } = useAsync(() => data.qc(), []);
  const selected = params.get('id') ?? qc?.sample[0]?.loanId;
  if (loading) return <Thinking label="Loading QC sampling" />;
  if (error || !qc) return <Card title="Could not load QC sampling"><p className="text-sm">{error}</p></Card>;
  const rate = qc.monthly.map((m) => ({ ...m, rate: Math.round((m.withFinding / m.reviewed) * 1000) / 10 }));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">QC sampling</h1>
          <p className="text-sm muted">Pre-closing sample: every loan at conditional approval or later, with the same tolerance checks and an AI QC narrative.</p>
        </div>
        <div className="flex gap-2 flex-wrap"><PoweredBy>SQL tolerance rules</PoweredBy><SourceBadge p={qc.provenance} /></div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Findings by type" className="min-w-0">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={qc.findingsByType} layout="vertical" margin={{ left: 10, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                <YAxis type="category" dataKey="type" width={130} tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="historical" name="Post-closing QC, last 12 months" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                <Bar dataKey="current" name="Failed checks in the pipeline today" fill="var(--chart-5)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Post-closing QC: share of reviewed loans with a finding (%)" className="min-w-0">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rate} margin={{ left: -14, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12 }} />
                <Line dataKey="rate" name="Loans with a finding (%)" stroke="var(--chart-4)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] muted">Synthetic history of {qc.monthly.reduce((a, m) => a + m.reviewed, 0)} reviewed loans.</p>
        </Card>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-4">
        <Card title={`Pre-closing sample (${qc.sample.length} loans)`} className="min-w-0">
          <div className="relative overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="data-table min-w-[460px]">
              <thead><tr><th>Loan</th><th>Stage</th><th>Findings</th></tr></thead>
              <tbody>
                {qc.sample.map((s) => (
                  <tr key={s.loanId} className="click" onClick={() => router.push(`/qc?id=${s.loanId}`)}
                    style={{ background: s.loanId === selected ? 'var(--accent-soft)' : undefined }}>
                    <td><button className="font-medium text-left" onClick={() => router.push(`/qc?id=${s.loanId}`)}>{s.loanId}</button><div className="text-[11px] muted">{s.borrower}</div></td>
                    <td className="text-xs">{s.stage}</td>
                    <td><div className="flex gap-1 flex-wrap">{s.failed.map((f) => <Flag key={f}>{f}</Flag>)}
                      {!s.failed.length && <span className="text-[11px] muted">No finding{s.openConditions ? ` · ${s.openConditions} open conditions` : ''}</span>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-4 min-w-0">
          {selected && <Narrative loanId={selected} />}
          <Card title="Credit policy tolerances">
            <dl className="text-sm">
              {qc.policy.map((p) => (
                <div key={p.ruleId} className="flex justify-between gap-3 py-1.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                  <dt><span className="font-medium">{p.ruleName}</span><div className="text-[11px] muted">{p.description}</div></dt>
                  <dd className="tabular font-semibold whitespace-nowrap">{p.ruleId === 'appraisal' ? `${p.threshold} days` : p.ruleId === 'amount' ? `$${p.threshold}` : `${Math.round(p.threshold * 100)}%`}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] muted mt-2">Stored in the CREDIT_POLICY table and read by the LOAN_CHECKS view. Illustrative values, not a credit policy.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function QcPage() {
  return <Suspense fallback={<Thinking label="Loading" />}><QcView /></Suspense>;
}
