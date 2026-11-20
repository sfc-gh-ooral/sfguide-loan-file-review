// No-account mode: responses captured from the live app on the same synthetic data
// (scripts/capture-sample.mjs), so Sample and Live show the same numbers and AI text.
// Decisions you make are kept in memory for this session only.
import type { LoanData } from './loan-data';
import pipelineJson from './mock/pipeline.json';
import qcJson from './mock/qc.json';
import { jitter, SAMPLE_DELAY_MS } from './sample-timing';
import type { Answer, LoanAction, LoanFile, Pipeline, QcBoard } from './types';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const actions: LoanAction[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

async function load<T>(path: string): Promise<T | null> {
  if (typeof window === 'undefined') {
    // Server (local dev in Sample mode): read the same files from public/.
    const { readFile } = await import('node:fs/promises');
    try { return JSON.parse(await readFile(`${process.cwd()}/public/mock/${path}`, 'utf8')) as T; } catch { return null; }
  }
  const res = await fetch(`${BASE}/mock/${path}`);
  return res.ok ? ((await res.json()) as T) : null;
}

let answers: Record<string, Omit<Answer, 'provenance'>> | null = null;
let drafts: Record<string, string> | null = null;
const cleared = (loanId: string) => new Set(actions.filter((a) => a.loanId === loanId && a.action === 'clear').map((a) => a.conditionId));
const requested = (loanId: string) => new Set(actions.filter((a) => a.loanId === loanId && a.action === 'request').map((a) => a.conditionId));

export const mockData: LoanData = {
  async pipeline() {
    const p = clone(pipelineJson as unknown as Pipeline);
    p.provenance = { source: 'mock' };
    for (const l of p.loans) {
      const n = cleared(l.loanId).size;
      if (n) { l.openConditions = Math.max(0, l.openConditions - n); p.kpis.openConditions = Math.max(0, p.kpis.openConditions - n); }
      if (actions.some((a) => a.loanId === l.loanId && a.action === 'escalate')) l.escalated = true;
    }
    return p;
  },
  async loan(id) {
    if (!/^LN-\d{6}$/.test(id)) return null;
    const file = await load<LoanFile>(`loans/${id}.json`);
    if (!file) return null;
    file.provenance = { source: 'mock' };
    const c = cleared(id), r = requested(id);
    for (const k of file.conditions) {
      if (c.has(k.conditionId)) { k.status = 'Cleared'; k.clearedAt = '2026-11-19'; }
      else if (r.has(k.conditionId) && k.status === 'Open') k.status = 'Requested';
    }
    file.actions = [...file.actions, ...actions.filter((a) => a.loanId === id)];
    return file;
  },
  async qc() {
    const q = clone(qcJson as unknown as QcBoard);
    q.provenance = { source: 'mock' };
    return q;
  },
  async narrative(id) {
    const file = await load<LoanFile>(`loans/${id}.json`);
    await sleep(jitter(SAMPLE_DELAY_MS.narrative));
    if (!file?.qc) throw new Error('No sample narrative for this loan');
    return { ...file.qc, provenance: { source: 'mock' } };
  },
  async draft(id, conditionId) {
    drafts ??= (await load<Record<string, string>>('drafts.json')) ?? {};
    await sleep(jitter(SAMPLE_DELAY_MS.draft));
    const hit = drafts[`${id}|${conditionId}`];
    return { message: hit ?? 'Sample mode has captured borrower messages only for the open conditions on the four story loans (LN-260101 to LN-260104). Run the app in Live mode to draft a message for any condition.',
      provenance: { source: 'mock' } };
  },
  async ask(id, question) {
    answers ??= (await load<Record<string, Omit<Answer, 'provenance'>>>('answers.json')) ?? {};
    await sleep(jitter(SAMPLE_DELAY_MS.ask));
    const hit = answers[`${id}|${question}`];
    if (hit) return { ...hit, provenance: { source: 'mock' } };
    return { answer: 'Sample mode has captured answers only for the suggested questions on this loan. Pick one of them, or run the app in Live mode to ask anything about the loan file.',
      citations: [], provenance: { source: 'mock' } };
  },
  async act(a) {
    actions.push({ ...a, actedAt: '2026-11-19 ' + new Date().toTimeString().slice(0, 5) });
    return { ok: true };
  },
};
