'use client';

// Pipeline: loans by stage, open conditions, days to close, and which files need attention.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Flag, Kpi, PoweredBy, SourceBadge, Thinking, usd } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { data } from '@/lib/client';
import { STAGES } from '@/lib/types';

export default function PipelinePage() {
  const { data: p, error, loading } = useAsync(() => data.pipeline(), []);
  const [stage, setStage] = useState('active');
  const [view, setView] = useState('all');
  const rows = useMemo(() => (p?.loans ?? []).filter((l) =>
    (stage === 'active' ? l.stage !== 'Closed' : stage === 'all' || l.stage === stage) &&
    (view === 'all' || (view === 'attention' ? l.failedChecks.length > 0 : l.ready))), [p, stage, view]);

  if (loading) return <Thinking label="Loading the pipeline" />;
  if (error || !p) return <Card title="Could not load the pipeline"><p className="text-sm">{error}</p></Card>;
  const k = p.kpis;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm muted">Borrower documents land on a stage; a stream and task parse, classify and extract each one, then SQL rules check it against the application.</p>
        </div>
        <div className="flex gap-2 flex-wrap"><PoweredBy>stage + stream + task</PoweredBy><SourceBadge p={p.provenance} /></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Active loans" value={k.activeLoans.toLocaleString()} sub={`${k.readyToClear} ready to clear to close`} />
        <Kpi label="Open conditions" value={k.openConditions.toLocaleString()} sub="Underwriting and rule-based, on active loans" />
        <Kpi label="Avg days to close" value={k.avgDaysToClose === null ? '—' : String(k.avgDaysToClose)} sub="Target closing date vs today, active loans" />
        <Kpi label="Documents extracted" value={`${k.docsExtracted.toLocaleString()} / ${k.docsReceived.toLocaleString()}`}
          sub={k.typeAccuracy !== null ? `AI_CLASSIFY matched the generator's label on ${Math.round(k.typeAccuracy * 1000) / 10}%` : undefined} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Loans and open conditions by stage" className="min-w-0">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={p.byStage.map((s) => ({ ...s, label: s.stage.replace('Conditional approval', 'Cond. approval') }))} margin={{ left: -18, right: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-2)' }} interval={0} angle={-20} textAnchor="end" height={46} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="loans" name="Loans" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="openConditions" name="Open conditions" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="lg:col-span-2 min-w-0" title="Loan files" right={<>
          <select aria-label="Stage" className="input text-xs" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="active">Active stages</option><option value="all">All stages</option>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select aria-label="Filter" className="input text-xs" value={view} onChange={(e) => setView(e.target.value)}>
            <option value="all">All files</option><option value="attention">Failed a check</option><option value="ready">Ready to clear to close</option>
          </select>
          <PoweredBy>SQL tolerance rules</PoweredBy>
        </>}>
          <div className="relative overflow-x-auto max-h-[460px] overflow-y-auto">
            <table className="data-table min-w-[700px]">
              <thead><tr><th>Loan</th><th>Stage</th><th className="text-right">Days to close</th><th className="text-right">Open cond.</th><th>Checks</th></tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.loanId} className="click">
                    <td>
                      <Link href={`/loan?id=${l.loanId}`} className="font-medium no-underline">{l.loanId} · {l.borrower}</Link>
                      <div className="text-[11px] muted">{l.purpose} · {usd(l.amount)} · {l.processor}</div>
                    </td>
                    <td className="text-xs whitespace-nowrap">{l.stage}</td>
                    <td className="text-right tabular" style={{ color: l.daysToClose !== null && l.daysToClose <= 7 ? 'var(--warning)' : undefined }}>{l.daysToClose ?? '—'}</td>
                    <td className="text-right tabular">{l.openConditions}</td>
                    <td><div className="flex gap-1 flex-wrap">
                      {l.failedChecks.map((f) => <Flag key={f}>{f}</Flag>)}
                      {l.ready && <Flag tone="var(--positive)">Ready to clear to close</Flag>}
                      {l.escalated && <Flag tone="var(--ai)">Escalated</Flag>}
                      {!l.failedChecks.length && !l.ready && <span className="text-[11px] muted">{l.pendingChecks ? `${l.pendingChecks} pending documents` : 'All checks pass'}</span>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] muted mt-2">{rows.length} loans. A check fails when the application and the extracted documents disagree beyond the credit policy tolerance.{k.lastRun ? ` Last pipeline run ${k.lastRun}.` : ''}</p>
        </Card>
      </div>
    </div>
  );
}
