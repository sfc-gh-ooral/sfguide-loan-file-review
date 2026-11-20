'use client';

// Loan file: a three-pane workspace. Left: document checklist with extraction progress. Centre:
// application vs documents (mismatches highlighted, with their source) and conditions with clear /
// request document (AI-drafted message) / escalate. Right: the document drawer with the parsed page
// and extracted fields. On narrow screens the drawer is a bottom sheet.
import { AlertOctagon, ArrowUpRight, Check, CheckCircle2, ChevronRight, CircleDashed, ExternalLink, FileText, Mail, MessagesSquare, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Reasoning } from '@/components/Reasoning';
import { Confidence, ErrorState, Flag, Markdown, PageSkeleton, Panel, PoweredBy, SampleAiBadge, SourceBadge, StatusPill, useStream, usd } from '@/components/ui';
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
    out.push(<mark key={i} className={`doc-hl ${active === m.key ? 'on' : ''}`} title={LABEL(m.key)}>{text.slice(m.start, m.end)}</mark>);
    pos = m.end;
  });
  out.push(text.slice(pos));
  return out;
}

function Ring({ value, total, tone }: { value: number; total: number; tone: string }) {
  const r = 9, c = 2 * Math.PI * r, k = total ? Math.min(1, value / total) : 0;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden className="shrink-0 -rotate-90">
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
      <circle cx="12" cy="12" r={r} fill="none" stroke={tone} strokeWidth="3" strokeDasharray={c} strokeDashoffset={c * (1 - k)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .6s' }} />
    </svg>
  );
}

function DocViewer({ doc, docs, onPick, onClose }: { doc: DocDetail; docs: DocDetail[]; onPick: (id: string) => void; onClose?: () => void }) {
  const [active, setActive] = useState<string | null>(null);
  const href = doc.url || `${BASE}/documents/${doc.fileName}`;
  const entries = Object.entries(doc.fields);
  return (
    <div key={doc.docId} className="drawer-in flex flex-col min-h-0 h-full">
      <div className="flex items-start justify-between gap-2 p-4 pb-3 border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="min-w-0">
          <div className="eyebrow">Document</div>
          <div className="text-[15px] font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{DOC_TYPE_LABEL[doc.docType ?? ''] ?? 'Queued for parsing'}</div>
          <div className="text-[11px] muted"><span className="mono">{doc.docId}</span> · received {doc.receivedAt.replace('T', ' ').slice(0, 16)} · {doc.source}</div>
        </div>
        <div className="flex items-center gap-1">
          <a className="btn btn-sm" href={href} target="_blank" rel="noreferrer">PDF <ExternalLink className="w-3 h-3" /></a>
          {onClose && <button className="btn btn-ghost btn-sm !px-1.5" onClick={onClose} aria-label="Close document"><X className="w-4 h-4" /></button>}
        </div>
      </div>
      <div className="px-4 pt-3 flex gap-1.5 overflow-x-auto pb-2" role="tablist" aria-label="Documents in this file">
        {docs.map((d) => (
          <button key={d.docId} role="tab" aria-selected={d.docId === doc.docId} onClick={() => onPick(d.docId)}
            className="btn btn-sm shrink-0" style={d.docId === doc.docId ? { background: 'var(--cobalt-soft)', borderColor: 'var(--cobalt)', color: 'var(--cobalt)' } : undefined}>
            {DOC_TYPE_LABEL[d.docType ?? '']?.replace('Closing disclosure', 'Closing disc.') ?? 'Queued'}<span className="mono text-[10px] opacity-70">{d.docId.slice(4)}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-3">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5"><span className="eyebrow">Extracted fields</span><PoweredBy>AI_EXTRACT</PoweredBy></div>
          {entries.length ? (
            <div className="grid grid-cols-2 gap-1.5">
              {entries.map(([k, v]) => (
                <div key={k} className="rounded-lg px-2.5 py-1.5 border cursor-default transition-colors min-w-0" tabIndex={0}
                  style={{ borderColor: active === k ? 'var(--highlight)' : 'var(--line)', background: active === k ? 'var(--highlight-soft)' : 'var(--surface)' }}
                  onMouseEnter={() => setActive(k)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(k)} onBlur={() => setActive(null)}>
                  <div className="flex items-center justify-between gap-1"><span className="text-[10.5px] uppercase tracking-wide muted font-semibold truncate">{LABEL(k)}</span><Confidence score={doc.scores[k]} /></div>
                  <div className="text-[13px] mono break-words">{v || '—'}</div>
                </div>
              ))}
            </div>
          ) : <p className="text-sm muted">Not extracted yet.</p>}
          {entries.length > 0 && <p className="text-[11px] muted mt-1.5">Hover a field to find it on the page.</p>}
        </div>
        {doc.deposits.length > 0 && (
          <div>
            <div className="eyebrow mb-1.5">Deposits (table extraction)</div>
            <div className="relative overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--line)' }}><table className="grid-table"><tbody>
              {doc.deposits.map((l, i) => {
                const payroll = /PAYROLL|DIR DEP/i.test(l.description);
                return <tr key={i}><td className="text-xs mono whitespace-nowrap">{l.date}</td><td className="text-xs">{l.description}{!payroll && <> <Flag tone="highlight">Not payroll</Flag></>}</td>
                  <td className="text-right mono text-xs">{l.amount}</td></tr>;
              })}
            </tbody></table></div>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap"><span className="eyebrow">Parsed page</span><span className="flex gap-1 flex-wrap"><PoweredBy>AI_PARSE_DOCUMENT</PoweredBy><PoweredBy>AI_CLASSIFY</PoweredBy></span></div>
          <div className="doc-page" aria-label="Parsed document text with extracted values highlighted">{highlight(doc.text ?? '', doc.fields, active)}</div>
        </div>
      </div>
    </div>
  );
}

function RequestDialog({ file, cond, onClose, onSent }: { file: LoanFile; cond: Condition; onClose: () => void; onSent: (msg: string) => Promise<void> }) {
  const [draft, setDraft] = useState<string>();
  const [msg, setMsg] = useState('');
  const [sample, setSample] = useState(false);
  const [ms, setMs] = useState<number>();
  const [err, setErr] = useState<string>();
  const { shown, done } = useStream(draft, 2);
  useEffect(() => {
    data.draft(file.loan.loanId, cond.conditionId)
      .then((d) => { setDraft(d.message); setMsg(d.message); setSample(d.provenance.source === 'mock'); setMs(d.provenance.latencyMs); })
      .catch((e) => setErr(String(e.message)));
  }, [file.loan.loanId, cond.conditionId]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  const first = file.loan.borrower.split(' ')[0];
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="req-title" className="panel drawer-in max-w-xl w-full p-5 max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-b-[14px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div><div className="eyebrow">Borrower request</div><h2 id="req-title" className="text-lg font-semibold">Ask {first} for what clears {cond.conditionId}</h2></div>
          <button className="btn btn-ghost !px-2" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs muted mb-3">{cond.category} · {cond.description}</p>
        <div className="flex gap-1.5 flex-wrap mb-3">{sample && <SampleAiBadge />}<PoweredBy>AI_COMPLETE</PoweredBy>{ms !== undefined && <SourceBadge p={{ source: 'live', latencyMs: ms }} />}</div>
        {err ? <ErrorState title="The draft didn't come back" detail={err} /> : draft === undefined ? (
          <Reasoning kind="draft" steps={[`Reading ${cond.conditionId} and ${first}'s loan details`, `Choosing the documents that would clear a ${cond.category.toLowerCase()} condition`, 'Drafting a plain-language request with AI_COMPLETE']} />
        ) : !done ? (
          <div className="rounded-xl border p-3 text-[13.5px] leading-relaxed whitespace-pre-wrap caret" style={{ borderColor: 'var(--line)', minHeight: 220 }}>{shown}</div>
        ) : (
          <>
            <textarea className="input w-full text-[13.5px]" rows={11} value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Message to the borrower" />
            <p className="text-[11px] muted mt-1">AI draft: edit before recording. This example records the request; it doesn&apos;t send email.</p>
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
  const { data: file, error, loading, reload } = useAsync(() => data.loan(id), [id], true);
  const { data: pipe } = useAsync(() => data.pipeline(), []);
  const ids = useMemo(() => (pipe?.loans ?? []).map((l) => [l.loanId, l.borrower] as const).sort(), [pipe]);
  const [docId, setDocId] = useState<string | null>(params.get('doc'));
  const [sheet, setSheet] = useState(false);
  const [req, setReq] = useState<Condition | null>(null);
  const [escalating, setEscalating] = useState(false);
  const [note, setNote] = useState('');
  const [toast, setToast] = useState<string>();
  useEffect(() => { setDocId(params.get('doc')); }, [params]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(undefined), 3500); return () => clearTimeout(t); }, [toast]);

  if (loading && !file) return <PageSkeleton label={`Loading ${id}`} />;
  if (error) return <ErrorState title={`Could not load ${id}`} detail={error} onRetry={reload} />;
  if (!file || 'notFound' in (file as object)) return <ErrorState title="Loan not found" detail={`There is no loan ${id} in this pipeline.`} />;
  const L = file.loan;
  const doc = file.docs.find((d) => d.docId === docId) ?? file.docs.find((d) => d.docId === file.checks.find((c) => c.status === 'Fail')?.sourceDoc) ?? file.docs[0];
  const act = async (a: Parameters<typeof data.act>[0], done: string) => { await data.act(a); reload(); setToast(done); };
  const failed = file.checks.filter((c) => c.status === 'Fail');
  const passed = file.checks.filter((c) => c.status === 'Pass');
  const pending = file.checks.filter((c) => c.status === 'Pending');
  const open = file.conditions.filter((c) => c.status !== 'Cleared');
  const ready = L.stage === 'Conditional approval' && !failed.length && !pending.length && !open.length;
  const escalated = file.actions.filter((a) => a.action === 'escalate');
  const show = (d: string | null) => { if (d) { setDocId(d); setSheet(true); } };
  const ltv = L.estimatedValue ? Math.round((L.amount / L.estimatedValue) * 1000) / 10 : null;

  return (
    <div className="space-y-4">
      <section className="panel overflow-hidden">
        <div className="p-4 md:p-5 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="mono text-xs px-2 py-0.5 rounded-md" style={{ background: 'var(--surface-2)' }}>{L.loanId}</span>
              <span className="text-xs muted">{L.stage} · {L.processor}</span>
              <SourceBadge p={file.provenance} />
            </div>
            <h1 className="text-[26px] font-bold leading-tight mt-1.5">{L.borrower}</h1>
            <p className="text-sm ink-2">{L.address}</p>
            <div className="flex gap-1.5 flex-wrap mt-2">
              {failed.map((c) => <Flag key={c.checkId} tone="highlight" icon={<AlertOctagon className="w-3 h-3" />}>{c.checkName} mismatch</Flag>)}
              {ready && <Flag tone="pass" icon={<CheckCircle2 className="w-3 h-3" />}>Ready to clear to close</Flag>}
              {escalated.length > 0 && <Flag tone="ai">Escalated to underwriter</Flag>}
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <select className="input max-w-[220px]" aria-label="Open another loan" value={id} onChange={(e) => router.push(`/loan?id=${e.target.value}`)}>
              {(ids.length ? ids : [[id, L.borrower] as const]).map(([c, b]) => <option key={c} value={c}>{c} · {b}</option>)}
            </select>
            <Link className="btn" href={`/ask?id=${id}`}><MessagesSquare className="w-4 h-4" />Ask this file</Link>
            <button className="btn" onClick={() => setEscalating((v) => !v)}><ArrowUpRight className="w-4 h-4" />Escalate</button>
          </div>
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-t" style={{ borderColor: 'var(--line)' }}>
          {[['Loan amount', usd(L.amount, 0)], ['Appraised value', usd(L.estimatedValue, 0)], ['LTV', ltv === null ? '—' : `${ltv}%`], ['Program', L.program], ['Rate', `${L.rate.toFixed(3)}%`],
            ['Target close', `${L.targetCloseDate}${L.daysToClose !== null ? ` · ${L.daysToClose} d` : ''}`]].map(([k, v]) => (
            <div key={k} className="px-4 py-3 border-r border-b lg:border-b-0 min-w-0" style={{ borderColor: 'var(--line)' }}>
              <dt className="eyebrow">{k}</dt><dd className="text-[13px] font-semibold mt-0.5 truncate" title={v}>{v}</dd>
            </div>
          ))}
        </dl>
        {escalating && (
          <form className="flex gap-2 flex-wrap p-4 border-t" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }} onSubmit={async (e) => {
            e.preventDefault(); await act({ loanId: id, action: 'escalate', comment: note || 'Escalated for underwriter review' }, 'Escalated to the underwriter'); setEscalating(false); setNote('');
          }}>
            <input className="input flex-1 min-w-[200px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should the underwriter look at?" aria-label="Escalation note" maxLength={1000} autoFocus />
            <button className="btn btn-primary" type="submit">Escalate to underwriter</button>
            <button className="btn" type="button" onClick={() => setEscalating(false)}>Cancel</button>
          </form>
        )}
      </section>

      <div className="grid lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_400px] gap-4 items-start">
        <Panel eyebrow="Checklist" title="Documents" right={<PoweredBy>stream + task</PoweredBy>} className="lg:sticky lg:top-[72px]">
          <ul className="space-y-1">
            {file.checklist.map((c) => {
              const ok = c.extracted >= c.needed;
              const first = file.docs.find((d) => d.docType === c.docType);
              const tone = ok ? 'var(--pass)' : c.requiredNow ? 'var(--wait)' : 'var(--muted)';
              return (
                <li key={c.docType}>
                  <button className="w-full flex items-center gap-2.5 text-left rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--surface-2)] disabled:hover:bg-transparent disabled:cursor-default"
                    disabled={!first} onClick={() => show(first?.docId ?? null)}>
                    <Ring value={c.extracted} total={c.needed} tone={tone} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium truncate">{DOC_TYPE_LABEL[c.docType]}</span>
                      <span className="block text-[11px] muted">{c.extracted}/{c.needed} extracted{!ok && (c.requiredNow ? ' · missing' : ' · later stage')}</span>
                    </span>
                    {c.minScore !== null && <Confidence score={c.minScore} />}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] muted mt-2">Percent is the lowest AI_EXTRACT confidence among that type&apos;s fields.</p>
        </Panel>

        <div className="space-y-4 min-w-0">
          <Panel pad={false} eyebrow={`${passed.length} of ${file.checks.length} checks pass`} title="Application vs documents" right={<PoweredBy>SQL tolerance rules</PoweredBy>}>
            <div className="px-4 pb-3">
              <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-2)' }} aria-hidden>
                <span style={{ width: `${(passed.length / file.checks.length) * 100}%`, background: 'var(--pass)' }} />
                <span style={{ width: `${(failed.length / file.checks.length) * 100}%`, background: 'var(--highlight)' }} />
              </div>
            </div>
            <ul className="border-t" style={{ borderColor: 'var(--line)' }}>
              {file.checks.map((c) => {
                const fail = c.status === 'Fail';
                return (
                  <li key={c.checkId} className="grid sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 py-3 border-b last:border-b-0 items-center"
                    style={{ borderColor: 'var(--line)', background: fail ? 'color-mix(in srgb, var(--highlight) 9%, transparent)' : undefined, boxShadow: fail ? 'inset 3px 0 0 var(--highlight)' : undefined }}>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold">{c.checkName}</div>
                      {c.detail && <div className="text-[11px] muted leading-snug">{c.detail}</div>}
                    </div>
                    <div className="min-w-0"><div className="text-[10.5px] muted uppercase tracking-wide font-semibold">Application</div><div className="mono text-[13px] break-words">{fmt(c, c.applicationValue)}</div></div>
                    <div className="min-w-0">
                      <div className="text-[10.5px] muted uppercase tracking-wide font-semibold">
                        {c.sourceDoc ? <button className="underline underline-offset-2 hover:text-[var(--cobalt)]" onClick={() => show(c.sourceDoc)}>{DOC_TYPE_LABEL[c.sourceType]} · {c.sourceDoc}</button> : DOC_TYPE_LABEL[c.sourceType]}
                      </div>
                      <div className="mono text-[13px] break-words">{fail ? <span className="hl-stroke font-semibold">{fmt(c, c.documentValue)}</span> : fmt(c, c.documentValue)}</div>
                    </div>
                    <div><StatusPill status={c.status} /></div>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] muted px-4 py-2.5 border-t" style={{ borderColor: 'var(--line)' }}>Tolerances come from the CREDIT_POLICY table; change a threshold there and the checks change with it.</p>
          </Panel>

          <Panel pad={false} eyebrow="Conditions" title={`${open.length} open · ${file.conditions.length - open.length} cleared`}>
            <ul className="border-t" style={{ borderColor: 'var(--line)' }}>
              {file.conditions.map((c) => (
                <li key={c.conditionId} className="px-4 py-3 border-b last:border-b-0 flex gap-3 flex-wrap items-start" style={{ borderColor: 'var(--line)' }}>
                  <span className="mt-0.5">{c.status === 'Cleared' ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--pass)' }} aria-hidden /> : <CircleDashed className="w-4 h-4" style={{ color: 'var(--wait)' }} aria-hidden />}</span>
                  <div className="min-w-0 flex-1 basis-[240px]">
                    <div className="text-[11px] muted flex gap-1.5 flex-wrap items-center"><span className="mono">{c.conditionId}</span> · {c.category} · opened {c.openedAt}
                      {c.source === 'Rule' && <Flag tone="cobalt">Tolerance rule</Flag>}</div>
                    <div className="text-[13px] mt-0.5">{c.description}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusPill status={c.status} />
                    {c.status !== 'Cleared' && <>
                      <button className="btn btn-ai btn-sm" onClick={() => setReq(c)}><Mail className="w-3.5 h-3.5" />Draft borrower request</button>
                      <button className="btn btn-sm" onClick={() => act({ loanId: id, action: 'clear', conditionId: c.conditionId }, `Cleared ${c.conditionId}`)}><Check className="w-3.5 h-3.5" />Clear</button>
                    </>}
                  </div>
                </li>
              ))}
              {file.conditions.length === 0 && <li className="px-4 py-6 text-sm muted text-center">No conditions on this file.</li>}
            </ul>
            {file.actions.length > 0 && (
              <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
                <div className="eyebrow mb-1.5">Activity</div>
                <ol className="space-y-1 text-[13px]">
                  {file.actions.map((a, i) => <li key={i} className="flex gap-2"><span className="mono text-[11px] muted shrink-0 pt-0.5">{a.actedAt}</span><span>{a.action === 'clear' ? `Cleared ${a.conditionId}`
                    : a.action === 'request' ? `Requested a document for ${a.conditionId}` : `Escalated to underwriter: ${a.comment}`}</span></li>)}
                </ol>
                {HOSTED_EXAMPLE && <p className="text-[11px] muted mt-1.5">In this hosted example, decisions stay in your browser tab.</p>}
              </div>
            )}
          </Panel>

          {file.qc && (
            <Panel eyebrow="Pre-closing QC" title="QC narrative" right={<>{file.provenance.source === 'mock' && <SampleAiBadge />}<PoweredBy>AI_COMPLETE</PoweredBy></>}>
              <div className="rounded-xl p-4" style={{ background: 'var(--ai-soft)' }}><Markdown text={file.qc.narrative} /></div>
              <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
                <p className="text-[11px] muted">AI narrative from {file.qc.model}, generated {file.qc.generatedAt} by the pipeline. Review before acting.</p>
                <Link className="btn btn-sm" href={`/qc?id=${id}`}>Open in QC sampling <ChevronRight className="w-3.5 h-3.5" /></Link>
              </div>
            </Panel>
          )}
        </div>

        {doc && (
          <aside className="panel hidden xl:flex flex-col xl:sticky xl:top-[72px] h-[calc(100vh-88px)] overflow-hidden" aria-label="Document drawer">
            <DocViewer doc={doc} docs={file.docs} onPick={setDocId} />
          </aside>
        )}
      </div>

      {doc && sheet && (
        <div className="xl:hidden fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setSheet(false)}>
          <div className="panel w-full h-[88vh] rounded-b-none flex flex-col overflow-hidden" role="dialog" aria-modal="true" aria-label="Document" onClick={(e) => e.stopPropagation()}>
            <DocViewer doc={doc} docs={file.docs} onPick={setDocId} onClose={() => setSheet(false)} />
          </div>
        </div>
      )}
      {doc && !sheet && (
        <button className="xl:hidden fixed right-4 bottom-[84px] md:bottom-4 z-30 btn btn-primary shadow-lg" onClick={() => setSheet(true)}><FileText className="w-4 h-4" />Documents ({file.docs.length})</button>
      )}

      {req && <RequestDialog file={file} cond={req} onClose={() => setReq(null)}
        onSent={async (message) => { const c = req; setReq(null); await act({ loanId: id, action: 'request', conditionId: c.conditionId, message }, `Request recorded for ${c.conditionId}`); }} />}
      {toast && <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-[84px] md:bottom-6 z-50 panel px-4 py-2.5 text-sm font-medium fade-up flex items-center gap-2"
        style={{ borderLeft: '3px solid var(--pass)' }}><CheckCircle2 className="w-4 h-4" style={{ color: 'var(--pass)' }} />{toast}</div>}
    </div>
  );
}

export default function LoanPage() {
  return <Suspense fallback={<PageSkeleton label="Loading" />}><LoanView /></Suspense>;
}
