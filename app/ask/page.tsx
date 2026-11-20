'use client';

// Ask the file: questions over one loan's documents and conditions, answered with citations.
import { FileText, ListChecks, MessagesSquare, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Reasoning } from '@/components/Reasoning';
import { EmptyState, ErrorState, PageSkeleton, Panel, PoweredBy, SampleAiBadge, SourceBadge, Streamed } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { suggestedFor } from '@/lib/loan-data';
import { data } from '@/lib/client';
import { DOC_TYPE_LABEL, type Answer, type Citation } from '@/lib/types';

type Turn = { q: string; a?: Answer; error?: string };
const docIdOf = (c: Citation) => c.name.match(/DOC-\d{4}/)?.[0];

function AskView() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id') ?? 'LN-260101';
  const { data: pipe } = useAsync(() => data.pipeline(), []);
  const { data: file, error } = useAsync(() => data.loan(id), [id]);
  const loans = useMemo(() => (pipe?.loans ?? []).map((l) => [l.loanId, `${l.loanId} · ${l.borrower}`] as [string, string]).sort(), [pipe]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns]);
  const cites = turns.flatMap((t) => t.a?.citations ?? []);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true); setQ('');
    setTurns((t) => [...t, { q: question }]);
    try { const a = await data.ask(id, question); setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x))); }
    catch (e) { setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: String((e as Error).message) } : x))); }
    finally { setBusy(false); }
  };
  if (error) return <ErrorState title={`Could not load ${id}`} detail={error} />;
  if (!file) return <PageSkeleton label="Loading the loan file" />;
  const docs = file.docs.length, conds = file.conditions.length;

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
      <div className="space-y-4 min-w-0">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="eyebrow" style={{ color: 'var(--cobalt)' }}>Ask the file</div>
            <h1 className="text-[26px] font-bold leading-tight">{file.loan.borrower}</h1>
            <p className="text-sm ink-2">Answers come only from this loan&apos;s {docs} parsed documents and {conds} conditions, with citations.</p>
          </div>
          <div className="flex gap-1.5 flex-wrap"><PoweredBy>Cortex Search</PoweredBy><PoweredBy>AI_COMPLETE</PoweredBy></div>
        </div>

        <Panel>
          <div className="flex gap-2 flex-wrap items-center">
            <label className="text-xs muted" htmlFor="loan">Loan</label>
            <select id="loan" className="input flex-1 min-w-[200px]" value={id} onChange={(e) => { setTurns([]); router.push(`/ask?id=${e.target.value}`); }}>
              {(loans.length ? loans : [[id, id]]).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
            </select>
            <Link className="btn" href={`/loan?id=${id}`}>Open loan file</Link>
          </div>
          <div className="flex gap-2 flex-wrap mt-3">
            {suggestedFor(id).map((s) => <button key={s} className="btn btn-ai btn-sm !h-auto py-1.5 whitespace-normal text-left" disabled={busy} onClick={() => ask(s)}><Sparkles className="w-3.5 h-3.5 shrink-0" />{s}</button>)}
          </div>
        </Panel>

        {turns.length === 0 && (
          <div className="panel"><EmptyState title="Ask anything about this loan file" detail="Try a suggested question. Each answer cites the document or condition it came from." /></div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-2 fade-up">
            <div className="ml-auto max-w-[85%] w-fit rounded-2xl rounded-br-md px-4 py-2.5 text-[13.5px] font-medium text-white" style={{ background: 'var(--cobalt)' }}>{t.q}</div>
            <div className="panel p-4 rounded-bl-md">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--ai)' }}><MessagesSquare className="w-3.5 h-3.5" />Lintora</span>
                {t.a && <span className="flex gap-1.5 flex-wrap">{t.a.provenance.source === 'mock' && <SampleAiBadge />}<SourceBadge p={t.a.provenance} /></span>}
              </div>
              {t.error ? <p className="text-sm" style={{ color: 'var(--fail)' }}>{t.error}</p> : !t.a ? (
                <Reasoning kind="ask" steps={[`Searching ${docs} documents and ${conds} conditions with Cortex Search`, 'Ranking the most relevant excerpts', 'Answering with AI_COMPLETE, citing sources']} />
              ) : <Streamed text={t.a.answer} />}
            </div>
          </div>
        ))}
        <div ref={end} />

        <form className="flex gap-2 sticky bottom-[76px] md:bottom-4 z-10 panel p-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <input className="input flex-1 min-w-0 !border-0" placeholder="Ask about this loan file…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Question" maxLength={500} />
          <button className="btn btn-primary" disabled={busy || !q.trim()} type="submit"><Send className="w-4 h-4" />Ask</button>
        </form>
      </div>

      <Panel eyebrow="Sources" title={cites.length ? `${cites.length} citations` : 'Citations'} className="xl:sticky xl:top-[72px]">
        {cites.length === 0 ? <p className="text-[13px] muted">Citations from each answer appear here, linked to the document they came from.</p> : (
          <ol className="space-y-2.5 max-h-[70vh] overflow-y-auto">
            {cites.map((c, i) => {
              const d = docIdOf(c);
              return (
                <li key={i} className="rounded-xl border p-2.5" style={{ borderColor: 'var(--line)' }}>
                  <div className="flex items-center gap-2 text-[12px] font-semibold">
                    <span className="cite mono text-[10.5px] px-1.5 rounded" style={{ background: 'var(--ai-soft)', color: 'var(--ai)' }}>[{c.id}]</span>
                    {c.sourceType === 'condition' ? <ListChecks className="w-3.5 h-3.5 muted" /> : <FileText className="w-3.5 h-3.5 muted" />}
                    <span className="truncate">{DOC_TYPE_LABEL[c.sourceType] ?? (c.sourceType === 'condition' ? 'Condition' : c.sourceType)}</span>
                  </div>
                  <div className="text-[11px] muted mt-0.5 truncate">{c.name} · {c.date.slice(0, 10)}</div>
                  <div className="text-[11.5px] ink-2 mt-1 line-clamp-3 mono">{c.snippet}</div>
                  {d && <Link className="text-[11.5px] underline underline-offset-2 mt-1 inline-block" href={`/loan?id=${id}&doc=${d}`}>Open {d}</Link>}
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </div>
  );
}

export default function AskPage() {
  return <Suspense fallback={<PageSkeleton label="Loading" />}><AskView /></Suspense>;
}
