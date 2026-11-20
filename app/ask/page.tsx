'use client';

// Ask the file: questions over one loan's documents and conditions, answered with citations.
import { Send } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Reasoning } from '@/components/Reasoning';
import { Card, Markdown, PoweredBy, SampleAiBadge, SourceBadge, Thinking } from '@/components/ui';
import { useAsync } from '@/components/useAsync';
import { suggestedFor } from '@/lib/loan-data';
import { data } from '@/lib/client';
import { DOC_TYPE_LABEL, type Answer } from '@/lib/types';

type Turn = { q: string; a?: Answer; error?: string };

function AskView() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id') ?? 'LN-260101';
  const { data: pipe } = useAsync(() => data.pipeline(), []);
  const loans = useMemo(() => {
    return (pipe?.loans ?? []).map((l) => [l.loanId, `${l.loanId} · ${l.borrower} · ${l.stage}`] as [string, string]).sort();
  }, [pipe]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true); setQ('');
    setTurns((t) => [...t, { q: question }]);
    try { const a = await data.ask(id, question); setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x))); }
    catch (e) { setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: String((e as Error).message) } : x))); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Ask the file</h1>
          <p className="text-sm muted">Answers come only from this loan&apos;s parsed documents and conditions, with citations.</p>
        </div>
        <div className="flex gap-2 flex-wrap"><PoweredBy>Cortex Search</PoweredBy><PoweredBy>AI_COMPLETE</PoweredBy></div>
      </div>
      <Card>
        <label className="text-xs muted block mb-1" htmlFor="loan">Loan</label>
        <select id="loan" className="input w-full" value={id} onChange={(e) => { setTurns([]); router.push(`/ask?id=${e.target.value}`); }}>
          {(loans.length ? loans : [[id, id]]).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
        </select>
        <div className="flex gap-2 flex-wrap mt-3">
          {suggestedFor(id).map((s) => <button key={s} className="btn btn-ai text-xs" disabled={busy} onClick={() => ask(s)}>{s}</button>)}
        </div>
      </Card>

      {turns.map((t, i) => (
        <div key={i} className="space-y-2">
          <div className="card p-3 text-sm font-medium ml-auto max-w-[85%] w-fit" style={{ background: 'var(--accent-soft)' }}>{t.q}</div>
          <Card right={t.a && <>{t.a.provenance.source === 'mock' && <SampleAiBadge />}<SourceBadge p={t.a.provenance} /></>}>
            {t.error ? <p className="text-sm" style={{ color: 'var(--negative)' }}>{t.error}</p> : !t.a ? <Reasoning kind="ask" /> : (
              <>
                <Markdown text={t.a.answer} />
                {t.a.citations.length > 0 && (
                  <ol className="mt-3 space-y-1.5 text-xs border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                    {t.a.citations.map((c) => (
                      <li key={c.id}><strong>[{c.id}]</strong> {DOC_TYPE_LABEL[c.sourceType] ?? (c.sourceType === 'condition' ? 'Condition' : c.sourceType)} · {c.name} · {c.date.slice(0, 16)}
                        <div className="muted line-clamp-2">{c.snippet}</div></li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </Card>
        </div>
      ))}

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input className="input flex-1 min-w-0 !py-2" placeholder="Ask about this loan file…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Question" maxLength={500} />
        <button className="btn btn-primary" disabled={busy || !q.trim()} type="submit"><Send className="w-4 h-4" />Ask</button>
      </form>
    </div>
  );
}

export default function AskPage() {
  return <Suspense fallback={<Thinking label="Loading" />}><AskView /></Suspense>;
}
