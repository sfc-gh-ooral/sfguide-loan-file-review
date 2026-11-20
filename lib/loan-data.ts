// One interface, two implementations: lib/mock-data.ts (bundled synthetic captures) and
// lib/live-data.ts (Snowflake). Every screen goes through it.
import type { Answer, Draft, LoanAction, LoanFile, Pipeline, QcBoard, QcReview, Reextract } from './types';

export interface LoanData {
  pipeline(): Promise<Pipeline>;
  loan(loanId: string): Promise<LoanFile | null>;
  qc(): Promise<QcBoard>;
  /** Re-run the AI QC narrative for one loan. */
  narrative(loanId: string): Promise<QcReview>;
  /** Draft a borrower message asking for what a condition needs. */
  draft(loanId: string, conditionId: string): Promise<Draft>;
  /** Ask a question over one loan's documents and conditions. */
  ask(loanId: string, question: string): Promise<Answer>;
  /** Re-run AI_PARSE_DOCUMENT, AI_CLASSIFY and AI_EXTRACT on one document through the pipeline. */
  reextract(loanId: string, docId: string): Promise<Reextract>;
  /** Record a processor decision: clear a condition, request a document, or escalate. */
  act(action: LoanAction): Promise<{ ok: true }>;
}

export const MODEL = process.env.SNOWFLAKE_COMPLETE_MODEL ?? 'claude-sonnet-4-5';

/** Questions offered on "Ask the file". Sample mode has captured live answers for these. */
export const SUGGESTED: Record<string, string[]> = {
  _default: ["What's the borrower's verified monthly income?", 'Is anything missing or inconsistent in this file?'],
  'LN-260101': ['How does the stated income compare with the pay stubs and W-2?'],
  'LN-260102': ['Which deposits on the bank statements are not payroll?'],
  'LN-260103': ['When was the appraisal done, and when does the loan close?'],
  'LN-260104': ['What are the final loan terms on the closing disclosure?'],
};
export const suggestedFor = (id: string) => [...(SUGGESTED[id] ?? []), ...SUGGESTED._default];
export const STORY_LOANS = ['LN-260101', 'LN-260102', 'LN-260103', 'LN-260104'];
