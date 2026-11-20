'use client';

// Loan file: document checklist, application vs documents with mismatches and their source,
// conditions with clear / request document (AI-drafted message) / escalate, and the source documents.
import { ArrowUpRight, Check, CheckCircle2, Circle, ExternalLink, Mail, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Reasoning } from '@/components/Reasoning';
import { Card, Confidence, Flag, Markdown, PoweredBy, SampleAiBadge, SourceBadge, StatusPill, Thinking, usd } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { data } from '@/lib/client';
import { HOSTED_EXAMPLE } from '@/lib/hosted';
import { DOC_TYPE_LABEL, type Check as LoanCheck, type Condition, type DocDetail, type LoanFile } from '@/lib/types';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const LABEL = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const MONEY = new Set(['income', 'deposit', 'value', 'amount']);
const fmt = (c: LoanCheck, v: string | null) => (v === null ? '—' : MONEY.has(c.checkId) && /^-?[\d.]+$/.test(v) ? usd(Number(v)) : c.checkId === 'appraisal' && /^\d+$/.test(v) ? `${v} days` : v);

/** Splits the document text into plain and highlighted runs for each extracted value found in it. */
function highlight(text: string, fields: Record<string, string>, active: string | null): ReactNode[] {
  const marks: { start: number; end: number; key: string }[] = [];
  const lower = text.toLowerCase();
  for (const [key, raw] of Object.entries(fields)) {
    const v = raw.trim();
    if (v.length < 3 || /^(none|no|yes|n\/a)$/i.test(v)) continue;
    const num = Number(v.replace(/[$,]/g, ''));
    const variants = [v, v.replace(/^\$/, ''), num ? num.toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''].filter((x) => x.length >= 3);
    for (const needle of variants) {
      const at = lower.indexOf(needle.toLowerCase());
      if (at >= 0 && !marks.some((m) => at < m.end && at + needle.length > m.start)) { marks.push({ start: at, end: at + needle.length, key }); break; }
    }
  }
  marks.sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let pos = 0;
  marks.forEach((m, i) => {
    out.push(text.slice(pos, m.start));
    out.push(<mark key={i} className={`hl ${active === m.key ? 'on' : ''}`} title={LABEL(m.key)}>{text.slice(m.start, m.end)}</mark>);
    pos = m.end;
  });
  out.push(text.slice(pos));
  return out;
}

function DocPanel({ doc }: { doc: DocDetail }) {
  const [active, setActive] = useState<string | null>(null);
  const href = doc.url || `${BASE}/documents/${doc.fileName}`;
  const entries = Object.entries(doc.fields);
  return (
    <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
      <div className="space-y-2 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs muted">{doc.docId} · received {doc.receivedAt.replace('T', ' ')} · {doc.source}</div>
          <a className="text-xs underline inline-flex items-center gap-1" href={href} target="_blank" rel="noreferrer">Open original PDF <ExternalLink className="w-3 h-3" /></a>
        </div>
        <div className="flex gap-1.5 flex-wrap"><PoweredBy>AI_PARSE_DOCUMENT</PoweredBy><PoweredBy>AI_CLASSIFY</PoweredBy></div>
        <div className="doc-paper tabular" aria-label="Parsed document text with extracted values highlighted">{highlight(doc.text ?? '', doc.fields, active)}</div>
      </div>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2 mb-2"><span className="text-sm font-semibold">Extracted fields</span><PoweredBy>AI_EXTRACT</PoweredBy></div>
        {entries.length ? (
          <div className="space-y-1">
            {entries.map(([k, v]) => (
              <div key={k} className="rounded-lg px-2 py-1.5" style={{ background: active === k ? 'var(--accent-soft)' : undefined }}
                onMouseEnter={() => setActive(k)} onMouseLeave={() => setActive(null)} tabIndex={0} onFocus={() => setActive(k)} onBlur={() => setActive(null)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wide muted font-semibold">{LABEL(k)}</span><Confidence score={doc.scores[k]} />
                </div>
                <div className="text-sm break-words">{v || '—'}</div>
              </div>
            ))}
          </div>
        ) : <p className="text-sm muted">Not extracted yet.</p>}
        {doc.deposits.length > 0 && (
          <div className="pt-2">
            <div className="text-[11px] uppercase tracking-wide muted font-semibold px-2 mb-1">Deposits (table extraction)</div>
            <div className="relative overflow-x-auto"><table className="data-table"><tbody>
              {doc.deposits.map((l, i) => {
                const payroll = /PAYROLL|DIR DEP/i.test(l.description);
                return <tr key={i}><td className="text-xs whitespace-nowrap">{l.date}</td><td className="text-xs">{l.description}{!payroll && <> <Flag tone="var(--warning)">Not payroll</Flag></>}</td>
                  <td className="text-right tabular text-xs">{l.amount}</td></tr>;
              })}
            </tbody></table></div>
          </div>
        )}
        <p className="text-[11px] muted mt-2">Hover a field to see where it came from in the document.</p>
      </div>
    </div>
  );
}

function RequestDialog({ file, cond, onClose, onSent }: { file: LoanFile; cond: Condition; onClose: () => void; onSent: (msg: string) => Promise<void> }) {
  const [msg, setMsg] = useState<string>();
  const [sample, setSample] = useState(false);
  const [ms, setMs] = useState<number>();
  const [err, setErr] = useState<string>();
  useEffect(() => {
    data.draft(file.loan.loanId, cond.conditionId)
      .then((d) => { setMsg(d.message); setSample(d.provenance.source === 'mock'); setMs(d.provenance.latencyMs); })
      .catch((e) => setErr(String(e.message)));
  }, [file.loan.loanId, cond.conditionId]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="req-title" className="card fade-up max-w-xl w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h2 id="req-title" className="text-base font-semibold">Request a document from {file.loan.borrower}</h2>
          <button className="btn !px-2" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs muted mb-3">{cond.conditionId}: {cond.description}</p>
        <div className="flex gap-2 flex-wrap mb-2">{sample && <SampleAiBadge />}<PoweredBy>AI_COMPLETE</PoweredBy>
          {ms !== undefined && <SourceBadge p={{ source: 'live', latencyMs: ms }} />}</div>
        {err ? <p className="text-sm" style={{ color: 'var(--negative)' }}>{err}</p> : msg === undefined ? <Reasoning kind="draft" /> : (
          <>
            <textarea className="input w-full text-sm" rows={11} value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Message to the borrower" />
            <p className="text-[11px] muted mt-1">AI draft. Edit before sending. This example records the request; it doesn&apos;t send email.</p>
            <div className="flex gap-2 justify-end mt-3">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={() => onSent(msg)}><Send className="w-4 h-4" />Record request</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LoanView() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id') ?? 'LN-260101';
  const [rev, setRev] = useState(0);
  const { data: file, error, loading } = useAsync(() => data.loan(id), [id, rev]);
  const { data: pipe } = useAsync(() => data.pipeline(), []);
  const ids = useMemo(() => (pipe?.loans ?? []).map((l) => l.loanId).sort(), [pipe]);
  const [docId, setDocId] = useState<string | null>(params.get('doc'));
  const [req, setReq] = useState<Condition | null>(null);
  const [escalating, setEscalating] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { setDocId(params.get('doc')); }, [params]);

  if (loading && !file) return <Thinking label={`Loading ${id}`} />;
  if (error) return <Card title="Could not load the loan"><p className="text-sm">{error}</p></Card>;
  if (!file || 'notFound' in (file as object)) return <Card title="Loan not found"><p className="text-sm">No loan {id}.</p></Card>;
  const L = file.loan;
  const doc = file.docs.find((d) => d.docId === docId) ?? file.docs[0];
  const act = async (a: Parameters<typeof data.act>[0]) => { await data.act(a); setRev((r) => r + 1); };
  const failed = file.checks.filter((c) => c.status === 'Fail');
  const pending = file.checks.filter((c) => c.status === 'Pending');
  const open = file.conditions.filter((c) => c.status !== 'Cleared');
  const ready = L.stage === 'Conditional approval' && !failed.length && !pending.length && !open.length;
  const escalated = file.actions.filter((a) => a.action === 'escalate');
  const show = (d: string | null) => { if (d) { setDocId(d); document.getElementById('documents')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">{L.loanId} · {L.borrower}</h1>
          <p className="text-sm muted">{L.purpose} · {L.program} at {L.rate.toFixed(3)}% · {usd(L.amount)} · {L.address}</p>
          <p className="text-sm muted">Stage <strong style={{ color: 'var(--text)' }}>{L.stage}</strong> · applied {L.applicationDate} · target closing {L.targetCloseDate}
            {L.daysToClose !== null && ` (${L.daysToClose} days)`} · processor {L.processor}</p>
          <div className="flex gap-1.5 flex-wrap mt-1.5">
            {failed.map((c) => <Flag key={c.checkId}>{c.checkName} mismatch</Flag>)}
            {ready && <Flag tone="var(--positive)">Ready to clear to close</Flag>}
            {escalated.length > 0 && <Flag tone="var(--ai)">Escalated to underwriter</Flag>}
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select className="input" aria-label="Open loan" value={id} onChange={(e) => router.push(`/loan?id=${e.target.value}`)}>
            {(ids.length ? ids : [id]).map((c) => <option key={c}>{c}</option>)}
          </select>
          <Link className="btn" href={`/ask?id=${id}`}>Ask this file</Link>
          <SourceBadge p={file.provenance} />
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] gap-4">
        <Card title="Document checklist" right={<PoweredBy>stage + stream + task</PoweredBy>} className="min-w-0">
          <ul className="space-y-1.5">
            {file.checklist.map((c) => {
              const ok = c.extracted >= c.needed;
              const first = file.docs.find((d) => d.docType === c.docType);
              return (
                <li key={c.docType} className="flex items-center justify-between gap-2 text-sm">
                  <button className="flex items-center gap-2 text-left disabled:cursor-default" disabled={!first} onClick={() => show(first?.docId ?? null)}>
                    {ok ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--positive)' }} aria-hidden />
                      : <Circle className="w-4 h-4 shrink-0" style={{ color: c.requiredNow ? 'var(--warning)' : 'var(--muted)' }} aria-hidden />}
                    <span className={first ? 'underline-offset-2 hover:underline' : ''}>{DOC_TYPE_LABEL[c.docType]}</span>
                  </button>
                  <span className="flex items-center gap-1.5 text-xs muted whitespace-nowrap">
                    {c.extracted}/{c.needed}{!ok && (c.requiredNow ? <Flag tone="var(--warning)">Missing</Flag> : ' · later stage')}
                    {c.minScore !== null && <Confidence score={c.minScore} />}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] muted mt-2">Extracted / required. Percent is the lowest AI_EXTRACT confidence among that type&apos;s fields.</p>
        </Card>

        <Card title="Application vs documents" right={<PoweredBy>SQL tolerance rules</PoweredBy>} className="min-w-0">
          <div className="relative overflow-x-auto">
            <table className="data-table min-w-[620px]">
              <thead><tr><th>Check</th><th>Application</th><th>Documents</th><th>Source</th><th>Result</th></tr></thead>
              <tbody>
                {file.checks.map((c) => (
                  <tr key={c.checkId} style={{ background: c.status === 'Fail' ? 'color-mix(in srgb, var(--negative) 8%, transparent)' : undefined }}>
                    <td className="font-medium text-sm">{c.checkName}{c.detail && <div className="text-[11px] muted font-normal">{c.detail}</div>}</td>
                    <td className="tabular text-sm">{fmt(c, c.applicationValue)}</td>
                    <td className="tabular text-sm" style={{ color: c.status === 'Fail' ? 'var(--negative)' : undefined, fontWeight: c.status === 'Fail' ? 600 : undefined }}>{fmt(c, c.documentValue)}</td>
                    <td className="text-xs">{c.sourceDoc ? <button className="underline" onClick={() => show(c.sourceDoc)}>{DOC_TYPE_LABEL[c.sourceType]} {c.sourceDoc}</button> : <span className="muted">{DOC_TYPE_LABEL[c.sourceType]}</span>}</td>
                    <td><StatusPill status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] muted mt-2">Tolerances come from the CREDIT_POLICY table; change a threshold there and the checks change with it. On this synthetic data set, failures were planted for the walkthrough.</p>
        </Card>
      </div>

      <Card title={`Conditions (${open.length} open)`} right={<button className="btn" onClick={() => setEscalating(true)}><ArrowUpRight className="w-4 h-4" />Escalate to underwriter</button>}>
        {escalating && (
          <form className="flex gap-2 flex-wrap mb-3" onSubmit={async (e) => { e.preventDefault(); await act({ loanId: id, action: 'escalate', comment: note || 'Escalated for underwriter review' }); setEscalating(false); setNote(''); }}>
            <input className="input flex-1 min-w-[200px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the underwriter" aria-label="Escalation note" maxLength={1000} autoFocus />
            <button className="btn btn-primary" type="submit">Escalate</button>
            <button className="btn" type="button" onClick={() => setEscalating(false)}>Cancel</button>
          </form>
        )}
        <div className="relative overflow-x-auto">
          <table className="data-table min-w-[640px]">
            <thead><tr><th>Condition</th><th>Source</th><th>Status</th><th className="text-right">Action</th></tr></thead>
            <tbody>
              {file.conditions.map((c) => (
                <tr key={c.conditionId}>
                  <td className="text-sm"><span className="text-[11px] muted">{c.conditionId} · {c.category} · opened {c.openedAt}</span><div>{c.description}</div></td>
                  <td className="text-xs">{c.source === 'Rule' ? <Flag tone="var(--accent)">Tolerance rule</Flag> : 'Underwriting'}</td>
                  <td><StatusPill status={c.status} />{c.clearedAt && <div className="text-[11px] muted">{c.clearedAt}</div>}</td>
                  <td className="text-right whitespace-nowrap">
                    {c.status !== 'Cleared' && <span className="inline-flex gap-1.5">
                      <button className="btn btn-ai !py-1 text-xs" onClick={() => setReq(c)}><Mail className="w-3.5 h-3.5" />Request document</button>
                      <button className="btn !py-1 text-xs" onClick={() => act({ loanId: id, action: 'clear', conditionId: c.conditionId })}><Check className="w-3.5 h-3.5" />Clear</button>
                    </span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {file.actions.length > 0 && (
          <ul className="space-y-1 text-sm border-t pt-2 mt-3" style={{ borderColor: 'var(--border)' }}>
            {file.actions.map((a, i) => <li key={i}><span className="text-xs muted">{a.actedAt}</span> · {a.action === 'clear' ? `Cleared ${a.conditionId}`
              : a.action === 'request' ? `Requested a document for ${a.conditionId}` : `Escalated to underwriter: ${a.comment}`}</li>)}
          </ul>
        )}
        {HOSTED_EXAMPLE && <p className="text-[11px] muted mt-2">In this hosted example, decisions stay in your browser tab.</p>}
      </Card>

      <Card title="Documents" className="min-w-0">
        <div id="documents" className="flex gap-2 overflow-x-auto pb-2 mb-2 scroll-mt-20" role="tablist" aria-label="Documents">
          {file.docs.map((d) => (
            <button key={d.docId} role="tab" aria-selected={d.docId === doc?.docId} onClick={() => setDocId(d.docId)}
              className={`btn whitespace-nowrap ${d.docId === doc?.docId ? 'btn-primary' : ''}`}>
              {DOC_TYPE_LABEL[d.docType ?? ''] ?? 'Queued'} <span className="text-[10px] opacity-75">{d.docId}</span>
            </button>
          ))}
        </div>
        {doc ? <DocPanel key={doc.docId} doc={doc} /> : <p className="text-sm muted">No documents yet.</p>}
      </Card>

      {file.qc && (
        <Card title="QC narrative" right={<>{file.provenance.source === 'mock' && <SampleAiBadge />}<PoweredBy>AI_COMPLETE</PoweredBy><Link className="text-xs underline" href={`/qc?id=${id}`}>QC sampling</Link></>}>
          <Markdown text={file.qc.narrative} />
          <p className="text-[11px] muted mt-2">AI narrative from {file.qc.model}, generated {file.qc.generatedAt} by the pipeline. Review before acting.</p>
        </Card>
      )}

      {req && <RequestDialog file={file} cond={req} onClose={() => setReq(null)}
        onSent={async (message) => { await act({ loanId: id, action: 'request', conditionId: req.conditionId, message }); setReq(null); }} />}
    </div>
  );
}

export default function LoanPage() {
  return <Suspense fallback={<Thinking label="Loading" />}><LoanView /></Suspense>;
}
