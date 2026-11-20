// Captures the no-account sample data from the running app in Live mode, so Sample mode shows
// exactly what the live pipeline produced on this synthetic data (fields, scores, checks, AI text).
// Usage: start `npm run dev` with .env.local configured, then `node scripts/capture-sample.mjs`.
import { mkdirSync, writeFileSync } from 'node:fs';

const APP = process.env.APP_URL ?? 'http://localhost:3000';
const SUGGESTED = {
  _default: ["What's the borrower's verified monthly income?", 'Is anything missing or inconsistent in this file?'],
  'LN-260101': ['How does the stated income compare with the pay stubs and W-2?'],
  'LN-260102': ['Which deposits on the bank statements are not payroll?'],
  'LN-260103': ['When was the appraisal done, and when does the loan close?'],
  'LN-260104': ['What are the final loan terms on the closing disclosure?'],
};
const STORY = Object.keys(SUGGESTED).filter((k) => k !== '_default');

async function call(op, args = []) {
  const res = await fetch(`${APP}/api/data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, args }) });
  const json = await res.json();
  if (!res.ok) throw new Error(`${op} ${JSON.stringify(args)}: ${json.error}`);
  if (json.provenance?.source !== 'live') throw new Error(`${op} did not come from Live mode`);
  return json;
}
const strip = (x) => { const { provenance, ...rest } = x; return { provenance: { source: 'mock' }, ...rest, _liveLatencyMs: provenance?.latencyMs }; };

mkdirSync('public/mock/loans', { recursive: true });
const pipeline = await call('pipeline');
writeFileSync('lib/mock/pipeline.json', JSON.stringify(strip(pipeline)));
writeFileSync('lib/mock/qc.json', JSON.stringify(strip(await call('qc'))));
const ids = pipeline.loans.map((l) => l.loanId);
const files = {};
for (const id of ids) {
  const file = strip(await call('loan', [id]));
  for (const d of file.docs) d.url = ''; // presigned URLs expire; the app falls back to the bundled copy
  file.actions = [];
  files[id] = file;
  writeFileSync(`public/mock/loans/${id}.json`, JSON.stringify(file));
}
console.log(`Captured pipeline, QC and ${ids.length} loan files`);

// Borrower-message drafts for every open condition on the story loans.
const drafts = {}, dlat = [];
for (const id of STORY) for (const c of files[id].conditions.filter((k) => k.status !== 'Cleared')) {
  const d = await call('draft', [id, c.conditionId]);
  dlat.push(d.provenance.latencyMs);
  drafts[`${id}|${c.conditionId}`] = d.message;
}
writeFileSync('public/mock/drafts.json', JSON.stringify(drafts));

// Answers: suggested questions for the story loans and 12 others, 4 at a time.
const others = ids.filter((i) => !STORY.includes(i)).slice(0, 12);
const jobs = [...STORY, ...others].flatMap((id) => [...(SUGGESTED[id] ?? []), ...SUGGESTED._default].map((q) => [id, q]));
const answers = {}, latency = [];
for (let i = 0; i < jobs.length; i += 4) {
  await Promise.all(jobs.slice(i, i + 4).map(async ([id, q]) => {
    const a = await call('ask', [id, q]);
    latency.push(a.provenance.latencyMs);
    answers[`${id}|${q}`] = { answer: a.answer, citations: a.citations };
  }));
}
writeFileSync('public/mock/answers.json', JSON.stringify(answers));
const nar = [];
for (const id of STORY) nar.push((await call('narrative', [id])).provenance.latencyMs);
const med = (a) => { a.sort((x, y) => x - y); return `${a[0]}/${a[a.length >> 1]}/${a.at(-1)}`; };
console.log(`Captured ${Object.keys(drafts).length} drafts (ms ${med(dlat)}), ${jobs.length} answers (ms ${med(latency)}), narrative ms ${med(nar)}`);
