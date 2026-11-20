'use client';

// Staged progress for AI calls. The steps mirror what the live path actually does; callers pass
// data-specific wording ("Reading 9 documents…"). Steps advance on a timer and the last one holds
// until the real (or sample) answer arrives.
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SAMPLE_DELAY_MS } from '@/lib/sample-timing';

export type ReasoningKind = 'narrative' | 'draft' | 'ask' | 'reextract';

const DEFAULT: Record<ReasoningKind, string[]> = {
  narrative: ['Reading fields extracted with AI_EXTRACT', 'Applying the credit policy tolerances in SQL', 'Listing open conditions', 'Writing the QC narrative with AI_COMPLETE'],
  draft: ['Reading the condition and borrower details', 'Choosing the documents that would clear it', 'Drafting a plain-language request with AI_COMPLETE'],
  reextract: ['Putting the file back on the pipeline queue', 'Parsing the PDF with AI_PARSE_DOCUMENT', 'Classifying the document type with AI_CLASSIFY', 'Extracting fields and confidence scores with AI_EXTRACT', 'Re-running the checks, conditions and QC narrative'],
  ask: ['Searching this loan file with Cortex Search', 'Ranking document and condition excerpts', 'Answering with AI_COMPLETE, citing sources'],
};

export function Reasoning({ kind, steps: custom }: { kind: ReasoningKind; steps?: string[] }) {
  const steps = custom ?? DEFAULT[kind];
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - t0), 100);
    return () => window.clearInterval(id);
  }, []);
  const per = SAMPLE_DELAY_MS[kind] / steps.length;
  const step = Math.min(steps.length - 1, Math.floor(elapsed / per));

  return (
    <div className="rounded-xl p-4 border" style={{ background: 'var(--ai-soft)', borderColor: 'color-mix(in srgb, var(--ai) 25%, transparent)' }} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--ai)' }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />Working on it
        </div>
        <span className="text-[11px] mono muted">{(elapsed / 1000).toFixed(1)}s</span>
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => {
          const state = i < step ? 'done' : i === step ? 'active' : 'todo';
          return (
            <li key={s} className="flex items-center gap-2.5 text-[13px] transition-opacity" style={{ opacity: state === 'todo' ? 0.45 : 1 }}>
              <span className="w-5 h-5 rounded-full grid place-items-center shrink-0 border"
                style={state === 'done' ? { background: 'var(--ai)', borderColor: 'var(--ai)', color: 'var(--surface)' } : { borderColor: state === 'active' ? 'var(--ai)' : 'var(--line)' }}>
                {state === 'done' ? <Check className="w-3 h-3" aria-hidden /> : state === 'active' ? <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--ai)' }} /> : null}
              </span>
              <span className={state === 'active' ? 'font-medium' : ''}>{s}{state === 'active' ? '…' : ''}</span>
            </li>
          );
        })}
      </ol>
      <div className="h-1 rounded-full mt-4 overflow-hidden" style={{ background: 'color-mix(in srgb, var(--ai) 15%, transparent)' }} aria-hidden>
        <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${Math.min(96, (elapsed / SAMPLE_DELAY_MS[kind]) * 100)}%`, background: 'var(--ai)' }} />
      </div>
    </div>
  );
}
