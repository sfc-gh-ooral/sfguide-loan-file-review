// Checks on the bundled sample data and the Sample-mode timing. Run with `npm test`
// (Node's built-in test runner; no extra dependencies, no Snowflake account).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { SAMPLE_DELAY_MS } from '../lib/sample-timing.ts';
import { STAGES } from '../lib/types.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const pipeline = json('lib/mock/pipeline.json');
const loans: { loanId: string; stage: string; openConditions: number; docsReceived: number }[] = pipeline.loans;
const active = loans.filter((l) => l.stage !== 'Closed');

test('Sample AI delays stay within 4-8 s, including the ±600 ms jitter', () => {
  for (const [surface, ms] of Object.entries(SAMPLE_DELAY_MS)) {
    assert.ok(ms - 600 >= 4000 && ms + 600 <= 8000, `${surface}: ${ms} ms`);
  }
});

test('pipeline KPIs match the loans they summarize', () => {
  assert.equal(pipeline.kpis.activeLoans, active.length);
  assert.equal(pipeline.kpis.openConditions, active.reduce((s: number, l) => s + l.openConditions, 0));
  assert.ok(pipeline.kpis.docsExtracted <= pipeline.kpis.docsReceived);
});

test('stage counts add up and use the known stages', () => {
  for (const s of pipeline.byStage) {
    assert.ok((STAGES as readonly string[]).includes(s.stage), s.stage);
    assert.equal(s.loans, loans.filter((l) => l.stage === s.stage).length, s.stage);
  }
});

test('every loan ID has the format the API accepts', () => {
  for (const l of loans) assert.match(l.loanId, /^LN-\d{6}$/);
});

test('every per-loan sample file belongs to a loan in the pipeline', () => {
  const ids = new Set(loans.map((l) => l.loanId));
  const dir = new URL('../public/mock/loans/', import.meta.url);
  assert.ok(existsSync(dir));
  for (const f of readdirSync(dir)) assert.ok(ids.has(f.replace(/\.json$/, '')), f);
});

test('sample data carries no account host names or real Snowflake query IDs', () => {
  const files = ['lib/mock/pipeline.json', 'lib/mock/qc.json', 'public/mock/answers.json', 'public/mock/drafts.json',
    ...readdirSync(new URL('../public/mock/loans/', import.meta.url)).map((f) => `public/mock/loans/${f}`)];
  for (const f of files) {
    const text = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /snowflakecomputing\.com|privatelink/i, f);
    assert.doesNotMatch(text, /\b01[0-9a-f]{6}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/, f);
  }
});
