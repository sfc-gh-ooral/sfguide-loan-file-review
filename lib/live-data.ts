// Live mode: every screen reads the objects sql/setup.sql created. Server only.
// All user input reaches Snowflake as bind variables.
import { MODEL, type LoanData } from './loan-data';
import { query } from './snowflake';
import type { Check, CheckStatus, DocDetail, LoanFile, Pipeline, QcBoard, QcReview } from './types';

type Row = Record<string, unknown>;
const S = (v: unknown) => (v === null || v === undefined ? null : String(v));
const N = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const J = <T,>(v: unknown, d: T): T => {
  if (v === null || v === undefined) return d;
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return d; } }
  return v as T;
};
const flat = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, v === null ? '' : String(v)]));

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = Date.now();
  const r = await fn();
  return [r, Date.now() - t0];
}

const NARRATIVE_PROMPT = 'You are a mortgage quality control reviewer. Using only these facts, write a QC narrative: first a 2-sentence '
  + 'overview of the file, then up to 3 short bullet points starting with "- " covering each failed or pending check '
  + '(name the document it came from) and the recommended next step. Thresholds come from the lender\'s own credit policy table; do not attribute them to agencies or loan programs. If every check passes and no conditions are open, '
  + 'say the file appears ready to clear to close. Do not invent facts or amounts. Facts: ';

export const liveData: LoanData = {
  async pipeline() {
    const [[rows, meta], ms] = await timed(() => Promise.all([
      query<Row>(`WITH chk AS (SELECT loan_id, ARRAY_AGG(IFF(status = 'Fail', check_name, NULL)) AS failed, COUNT_IF(status = 'Pending') AS pending
                               FROM LOAN_CHECKS GROUP BY loan_id),
                       cnd AS (SELECT loan_id, COUNT_IF(status <> 'Cleared') AS open_n FROM CONDITIONS GROUP BY loan_id),
                       doc AS (SELECT loan_id, COUNT(*) AS n FROM DOCUMENTS GROUP BY loan_id),
                       esc AS (SELECT DISTINCT loan_id FROM APP.LOAN_ACTIONS WHERE action = 'escalate')
                  SELECT l.loan_id, l.borrower_name, l.purpose, l.program, l.loan_amount, l.stage, l.processor,
                         TO_CHAR(l.application_date) AS ad, TO_CHAR(l.target_close_date) AS td,
                         IFF(l.stage = 'Closed', NULL, DATEDIFF('day', (SELECT as_of_date FROM CONFIG), l.target_close_date)) AS days,
                         COALESCE(cnd.open_n, 0) AS open_n, chk.failed, chk.pending, COALESCE(doc.n, 0) AS docs, esc.loan_id IS NOT NULL AS escalated
                  FROM LOANS l LEFT JOIN chk ON chk.loan_id = l.loan_id LEFT JOIN cnd ON cnd.loan_id = l.loan_id
                  LEFT JOIN doc ON doc.loan_id = l.loan_id LEFT JOIN esc ON esc.loan_id = l.loan_id
                  ORDER BY l.target_close_date, l.loan_id`),
      query<Row>(`SELECT (SELECT COUNT_IF(p.doc_type = d.labeled_doc_type) / NULLIF(COUNT(*), 0) FROM DOC_PARSED p JOIN DOCUMENTS d ON d.doc_id = p.doc_id) AS acc,
                         (SELECT TO_CHAR(MAX(processed_at), 'YYYY-MM-DD HH24:MI') FROM DOC_PARSED) AS last_run,
                         (SELECT COUNT(*) FROM DOCUMENTS) AS received, (SELECT COUNT(*) FROM DOC_FIELDS) AS extracted`),
    ]));
    const loans = rows.map((r) => {
      const failed = J<string[]>(r.FAILED, []).filter(Boolean);
      const open = N(r.OPEN_N)!, pending = N(r.PENDING) ?? 0, stage = S(r.STAGE)!;
      return {
        loanId: S(r.LOAN_ID)!, borrower: S(r.BORROWER_NAME)!, purpose: S(r.PURPOSE)!, program: S(r.PROGRAM)!, amount: N(r.LOAN_AMOUNT)!,
        stage, processor: S(r.PROCESSOR)!, applicationDate: S(r.AD)!, targetCloseDate: S(r.TD)!, daysToClose: N(r.DAYS),
        openConditions: open, failedChecks: failed, pendingChecks: pending, docsReceived: N(r.DOCS)!, escalated: r.ESCALATED === true,
        ready: stage === 'Conditional approval' && !failed.length && !pending && !open,
      };
    });
    const active = loans.filter((l) => l.stage !== 'Closed');
    const days = active.map((l) => l.daysToClose).filter((d): d is number => d !== null);
    const m = meta[0];
    return {
      provenance: { source: 'live', latencyMs: ms }, loans,
      byStage: ['Application', 'Processing', 'Underwriting', 'Conditional approval', 'Clear to close', 'Closed'].map((stage) => ({
        stage, loans: loans.filter((l) => l.stage === stage).length,
        openConditions: loans.filter((l) => l.stage === stage).reduce((a, l) => a + l.openConditions, 0) })),
      kpis: { activeLoans: active.length, openConditions: active.reduce((a, l) => a + l.openConditions, 0),
        avgDaysToClose: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
        docsReceived: N(m.RECEIVED)!, docsExtracted: N(m.EXTRACTED)!, typeAccuracy: N(m.ACC), readyToClear: loans.filter((l) => l.ready).length,
        lastRun: S(m.LAST_RUN) },
    } satisfies Pipeline;
  },

  async loan(loanId) {
    const t0 = Date.now();
    const [l, list, checks, conds, docs, acts, qc] = await Promise.all([
      query<Row>(`SELECT l.*, TO_CHAR(application_date) AS ad, TO_CHAR(target_close_date) AS td,
                         IFF(stage = 'Closed', NULL, DATEDIFF('day', (SELECT as_of_date FROM CONFIG), target_close_date)) AS days
                  FROM LOANS l WHERE loan_id = ?`, [loanId]),
      query<Row>('SELECT * FROM LOAN_CHECKLIST WHERE loan_id = ?', [loanId]),
      query<Row>('SELECT * FROM LOAN_CHECKS WHERE loan_id = ?', [loanId]),
      query<Row>(`SELECT condition_id, category, description, status, source, TO_CHAR(opened_at) AS o, TO_CHAR(cleared_at) AS c
                  FROM CONDITIONS WHERE loan_id = ? ORDER BY status DESC, source DESC, opened_at, condition_id`, [loanId]),
      query<Row>(`SELECT d.doc_id, d.file_name, p.doc_type, TO_CHAR(d.received_at, 'YYYY-MM-DD"T"HH24:MI') AS received_at, d.source,
                         p.parsed_text, f.fields, f.scores, f.line_items, GET_PRESIGNED_URL(@LOAN_DOCS, d.file_name, 3600) AS url
                  FROM DOCUMENTS d LEFT JOIN DOC_PARSED p ON p.doc_id = d.doc_id LEFT JOIN DOC_FIELDS f ON f.doc_id = d.doc_id
                  WHERE d.loan_id = ? ORDER BY d.received_at, d.doc_id`, [loanId]),
      query<Row>(`SELECT action, condition_id, comment, message, TO_CHAR(acted_at, 'YYYY-MM-DD HH24:MI') AS at
                  FROM APP.LOAN_ACTIONS WHERE loan_id = ? ORDER BY acted_at`, [loanId]),
      query<Row>(`SELECT narrative, model, TO_CHAR(generated_at, 'YYYY-MM-DD HH24:MI') AS g, facts FROM QC_REVIEWS WHERE loan_id = ?`, [loanId]),
    ]);
    if (!l.length) return null;
    const r = l[0];
    const ORDER = ['income', 'employer', 'borrower', 'deposit', 'appraisal', 'value', 'amount', 'address'];
    const docList: DocDetail[] = docs.map((d) => ({
      docId: S(d.DOC_ID)!, fileName: S(d.FILE_NAME)!, docType: S(d.DOC_TYPE), receivedAt: S(d.RECEIVED_AT)!, source: S(d.SOURCE)!,
      text: S(d.PARSED_TEXT), fields: flat(J(d.FIELDS, {})),
      scores: Object.fromEntries(Object.entries(J<Record<string, { score: number }>>(d.SCORES, {})).map(([k, v]) => [k, v.score])),
      deposits: (() => { const li = J<{ date?: string[]; description?: string[]; amount?: string[] }>(d.LINE_ITEMS, {});
        return (li.description ?? []).map((desc, i) => ({ date: li.date?.[i] ?? '', description: desc, amount: li.amount?.[i] ?? '' })); })(),
      url: S(d.URL) ?? '',
    }));
    const q = qc[0];
    const file: LoanFile = {
      provenance: { source: 'live', latencyMs: Date.now() - t0 },
      loan: { loanId, borrower: S(r.BORROWER_NAME)!, address: S(r.PROPERTY_ADDRESS)!, amount: N(r.LOAN_AMOUNT)!, estimatedValue: N(r.ESTIMATED_VALUE)!,
        purpose: S(r.PURPOSE)!, program: S(r.PROGRAM)!, rate: N(r.INTEREST_RATE)!, stage: S(r.STAGE)!, applicationDate: S(r.AD)!,
        targetCloseDate: S(r.TD)!, processor: S(r.PROCESSOR)!, daysToClose: N(r.DAYS) },
      checklist: list.map((c) => ({ docType: S(c.DOC_TYPE)!, needed: N(c.NEEDED)!, requiredNow: c.REQUIRED_NOW === true,
        received: N(c.RECEIVED)!, extracted: N(c.EXTRACTED)!, minScore: N(c.MIN_SCORE) }))
        .sort((a, b) => Object.keys(DOC_ORDER).indexOf(a.docType) - Object.keys(DOC_ORDER).indexOf(b.docType)),
      checks: checks.map((c): Check => ({ checkId: S(c.CHECK_ID)!, checkName: S(c.CHECK_NAME)!, applicationValue: S(c.APPLICATION_VALUE),
        documentValue: S(c.DOCUMENT_VALUE), sourceDoc: S(c.SOURCE_DOC), sourceType: S(c.SOURCE_TYPE)!, status: S(c.STATUS) as CheckStatus,
        detail: S(c.DETAIL) })).sort((a, b) => ORDER.indexOf(a.checkId) - ORDER.indexOf(b.checkId)),
      conditions: conds.map((c) => ({ conditionId: S(c.CONDITION_ID)!, category: S(c.CATEGORY)!, description: S(c.DESCRIPTION)!,
        status: S(c.STATUS)!, source: S(c.SOURCE)!, openedAt: S(c.O)!, clearedAt: S(c.C) })),
      docs: docList,
      actions: acts.map((a) => ({ loanId, action: S(a.ACTION) as 'clear', conditionId: S(a.CONDITION_ID) ?? undefined,
        comment: S(a.COMMENT) ?? undefined, message: S(a.MESSAGE) ?? undefined, actedAt: S(a.AT) ?? undefined })),
      qc: q ? { narrative: S(q.NARRATIVE)!, model: S(q.MODEL)!, generatedAt: S(q.G)!, facts: S(q.FACTS)! } : null,
    };
    return file;
  },

  async qc() {
    const [[types, monthly, sample, policy], ms] = await timed(() => Promise.all([
      query<Row>(`WITH cur AS (
                    SELECT CASE WHEN check_id IN ('income', 'employer') THEN 'Income calculation' WHEN check_id = 'deposit' THEN 'Asset documentation'
                                WHEN check_id IN ('appraisal', 'value') THEN 'Appraisal' WHEN check_id = 'borrower' THEN 'Credit documentation'
                                ELSE 'Title and closing' END AS t, COUNT(*) AS n
                    FROM LOAN_CHECKS WHERE status = 'Fail' GROUP BY 1),
                  hist AS (SELECT finding_type AS t, COUNT(*) AS n FROM QC_FINDINGS WHERE finding_type <> 'No finding' GROUP BY 1)
                  SELECT COALESCE(h.t, c.t) AS t, COALESCE(h.n, 0) AS h, COALESCE(c.n, 0) AS c FROM hist h FULL JOIN cur c ON c.t = h.t ORDER BY h DESC`),
      query<Row>(`SELECT TO_CHAR(review_month, 'YYYY-MM') AS m, COUNT(*) AS n, COUNT_IF(finding_type <> 'No finding') AS f
                  FROM QC_FINDINGS GROUP BY 1 ORDER BY 1`),
      query<Row>(`SELECT l.loan_id, l.borrower_name, l.stage,
                         ARRAY_AGG(DISTINCT IFF(c.status = 'Fail', c.check_name, NULL)) AS failed, ANY_VALUE(COALESCE(k.n, 0)) AS open_n
                  FROM LOANS l JOIN LOAN_CHECKS c ON c.loan_id = l.loan_id
                  LEFT JOIN (SELECT loan_id, COUNT(*) AS n FROM CONDITIONS WHERE status <> 'Cleared' GROUP BY loan_id) k ON k.loan_id = l.loan_id
                  WHERE l.stage IN ('Conditional approval', 'Clear to close', 'Closed')
                  GROUP BY l.loan_id, l.borrower_name, l.stage ORDER BY l.loan_id`),
      query<Row>('SELECT rule_id, rule_name, threshold, description FROM CREDIT_POLICY ORDER BY rule_id'),
    ]));
    return {
      provenance: { source: 'live', latencyMs: ms },
      findingsByType: types.map((t) => ({ type: S(t.T)!, historical: N(t.H)!, current: N(t.C)! })),
      monthly: monthly.map((m) => ({ month: S(m.M)!, reviewed: N(m.N)!, withFinding: N(m.F)! })),
      sample: sample.map((s) => ({ loanId: S(s.LOAN_ID)!, borrower: S(s.BORROWER_NAME)!, stage: S(s.STAGE)!,
        failed: J<string[]>(s.FAILED, []).filter(Boolean), openConditions: N(s.OPEN_N)! }))
        .sort((a, b) => b.failed.length - a.failed.length || a.loanId.localeCompare(b.loanId)),
      policy: policy.map((p) => ({ ruleId: S(p.RULE_ID)!, ruleName: S(p.RULE_NAME)!, threshold: N(p.THRESHOLD)!, description: S(p.DESCRIPTION)! })),
    } satisfies QcBoard;
  },

  async narrative(loanId) {
    const [rows, ms] = await timed(() => query<Row>(
      `SELECT facts, AI_COMPLETE(?, ? || facts) AS n, TO_CHAR(CURRENT_TIMESTAMP(), 'YYYY-MM-DD HH24:MI') AS g FROM LOAN_FACT_SHEET WHERE loan_id = ?`,
      [MODEL, NARRATIVE_PROMPT, loanId]));
    if (!rows.length) throw new Error(`No facts for ${loanId}`);
    const r = rows[0];
    return { narrative: J<string>(r.N, S(r.N)!), model: MODEL, generatedAt: S(r.G)!, facts: S(r.FACTS)!,
      provenance: { source: 'live', latencyMs: ms } } satisfies QcReview;
  },

  async draft(loanId, conditionId) {
    const [rows, ms] = await timed(() => query<Row>(
      `SELECT AI_COMPLETE(?, 'You are a mortgage loan processor at Halvaren Home Lending writing to a borrower. Write a short, friendly email '
         || '(greeting, 2-4 sentences, a bulleted list of exactly what to send, sign-off from ' || l.processor || ', Loan Processor). '
         || 'Explain plainly why it is needed, without jargon or blame, and do not mention internal rules, scores or thresholds. '
         || 'Do not invent amounts or dates beyond these facts. Borrower: ' || l.borrower_name || '. Loan ' || l.loan_id
         || '. Condition: ' || c.description) AS m
       FROM CONDITIONS c JOIN LOANS l ON l.loan_id = c.loan_id WHERE c.loan_id = ? AND c.condition_id = ?`,
      [MODEL, loanId, conditionId]));
    if (!rows.length) throw new Error(`No condition ${conditionId} on ${loanId}`);
    return { message: J<string>(rows[0].M, S(rows[0].M)!), provenance: { source: 'live', latencyMs: ms } };
  },

  async ask(loanId, question) {
    const t0 = Date.now();
    const req = JSON.stringify({ query: question, columns: ['source_id', 'source_type', 'source_name', 'source_date', 'chunk'],
      filter: { '@eq': { loan_id: loanId } }, limit: 6 });
    const hits = await query<Row>(`SELECT PARSE_JSON(SNOWFLAKE.CORTEX.SEARCH_PREVIEW('LOAN_REVIEW_DEMO.LOANS.LOAN_FILE_SEARCH', ?)):results AS r`, [req]);
    const results = J<Row[]>(hits[0]?.R, []);
    const context = results.map((h, i) => `[${i + 1}] (${h.source_type}, ${h.source_name}, ${h.source_date})\n${h.chunk}`).join('\n\n');
    const prompt = 'You answer questions for a mortgage loan processor using only the loan file excerpts below. Cite sources inline as [1], [2]. '
      + 'When asked for monthly income, compute it from the pay stub (gross pay this period times pay periods per year, divided by 12) and show the arithmetic. '
      + `If the excerpts do not contain the answer, say so. Keep it under 150 words.\n\nQuestion: ${question}\n\nExcerpts:\n${context}`;
    const out = await query<Row>('SELECT AI_COMPLETE(?, ?) AS a', [MODEL, prompt]);
    return {
      answer: J<string>(out[0].A, S(out[0].A)!),
      citations: results.map((h, i) => ({ id: String(i + 1), sourceType: S(h.source_type)!, name: S(h.source_name)!, date: S(h.source_date)!,
        snippet: (S(h.chunk) ?? '').slice(0, 280) })),
      provenance: { source: 'live', latencyMs: Date.now() - t0 },
    };
  },

  async act(a) {
    await query(`INSERT INTO APP.LOAN_ACTIONS (loan_id, action, condition_id, comment, message) VALUES (?, ?, ?, ?, ?)`,
      [a.loanId, a.action, a.conditionId ?? null, a.comment ?? null, a.message ?? null]);
    if (a.action === 'clear' && a.conditionId) {
      await query(`UPDATE CONDITIONS SET status = 'Cleared', cleared_at = (SELECT as_of_date FROM CONFIG) WHERE loan_id = ? AND condition_id = ?`,
        [a.loanId, a.conditionId]);
    }
    if (a.action === 'request' && a.conditionId) {
      await query(`UPDATE CONDITIONS SET status = 'Requested' WHERE loan_id = ? AND condition_id = ? AND status = 'Open'`, [a.loanId, a.conditionId]);
    }
    return { ok: true };
  },
};

const DOC_ORDER: Record<string, number> = { loan_application: 0, pay_stub: 1, w2: 2, bank_statement: 3, appraisal: 4, title_commitment: 5, closing_disclosure: 6 };
