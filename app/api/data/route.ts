import { NextResponse } from 'next/server';
import type { LoanData } from '@/lib/loan-data';
import { mockData } from '@/lib/mock-data';
import { isSnowflakeConfigured } from '@/lib/snowflake';

// One entry point for every screen. Uses Snowflake when .env.local is configured and the user
// hasn't switched to Sample mode (x-lfr-mode: sample); otherwise the bundled synthetic data.
// Live failures are returned as errors, never silently replaced with sample data.
const OPS = new Set<keyof LoanData>(['pipeline', 'loan', 'qc', 'narrative', 'draft', 'ask', 'act']);
const ID = /^LN-\d{6}$/;
const COND = /^[A-Z]-[A-Za-z0-9-]{3,32}$/;

export async function POST(request: Request) {
  const { op, args } = await request.json();
  if (!OPS.has(op) || !Array.isArray(args)) return NextResponse.json({ error: 'Unknown operation' }, { status: 400 });
  if (['loan', 'narrative', 'draft', 'ask'].includes(op) && !ID.test(String(args[0]))) return NextResponse.json({ error: 'Unknown loan' }, { status: 400 });
  if (op === 'draft' && !COND.test(String(args[1]))) return NextResponse.json({ error: 'Unknown condition' }, { status: 400 });
  if (op === 'ask' && (typeof args[1] !== 'string' || args[1].length > 500)) return NextResponse.json({ error: 'Question must be under 500 characters' }, { status: 400 });
  if (op === 'act') {
    const a = args[0];
    if (!ID.test(String(a?.loanId)) || !['clear', 'request', 'escalate'].includes(a?.action)
      || (a.conditionId !== undefined && !COND.test(String(a.conditionId)))
      || String(a.comment ?? '').length > 1000 || String(a.message ?? '').length > 4000)
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const wantSample = request.headers.get('x-lfr-mode') === 'sample';
  const impl: LoanData = isSnowflakeConfigured() && !wantSample ? (await import('@/lib/live-data')).liveData : mockData;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (impl[op as keyof LoanData] as (...a: any[]) => Promise<unknown>)(...args);
    return NextResponse.json(result ?? { notFound: true });
  } catch (error) {
    console.error(`${op} failed:`, error);
    return NextResponse.json({ error: String(error instanceof Error ? error.message : error) }, { status: 502 });
  }
}
