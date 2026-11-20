// Shared shapes for both data sources (bundled sample files and live Snowflake).
export type Source = 'mock' | 'live';
export interface Provenance { source: Source; latencyMs?: number }

export const STAGES = ['Application', 'Processing', 'Underwriting', 'Conditional approval', 'Clear to close', 'Closed'] as const;

export const DOC_TYPE_LABEL: Record<string, string> = {
  loan_application: 'Loan application', pay_stub: 'Pay stub', w2: 'W-2', bank_statement: 'Bank statement',
  appraisal: 'Appraisal', title_commitment: 'Title commitment', closing_disclosure: 'Closing disclosure',
};

export type CheckStatus = 'Pass' | 'Fail' | 'Pending';

export interface PipelineLoan {
  loanId: string; borrower: string; purpose: string; program: string; amount: number; stage: string; processor: string;
  applicationDate: string; targetCloseDate: string; daysToClose: number | null;
  openConditions: number; failedChecks: string[]; pendingChecks: number; docsReceived: number; ready: boolean; escalated: boolean;
}
export interface Pipeline {
  provenance: Provenance;
  kpis: { activeLoans: number; openConditions: number; avgDaysToClose: number | null; docsReceived: number; docsExtracted: number;
    typeAccuracy: number | null; readyToClear: number; lastRun: string | null };
  byStage: { stage: string; loans: number; openConditions: number }[];
  loans: PipelineLoan[];
}

export interface DocDetail {
  docId: string; fileName: string; docType: string | null; receivedAt: string; source: string;
  text: string | null; fields: Record<string, string>; scores: Record<string, number>;
  deposits: { date: string; description: string; amount: string }[]; url: string;
}
export interface Check {
  checkId: string; checkName: string; applicationValue: string | null; documentValue: string | null;
  sourceDoc: string | null; sourceType: string; status: CheckStatus; detail: string | null;
}
export interface Condition {
  conditionId: string; category: string; description: string; status: string; source: string; openedAt: string; clearedAt: string | null;
}
export interface ChecklistItem { docType: string; needed: number; requiredNow: boolean; received: number; extracted: number; minScore: number | null }
export interface QcReview { narrative: string; model: string; generatedAt: string; facts: string; provenance?: Provenance }
export interface LoanAction {
  loanId: string; action: 'clear' | 'request' | 'escalate'; conditionId?: string; comment?: string; message?: string; actedAt?: string;
}
export interface LoanFile {
  provenance: Provenance;
  loan: { loanId: string; borrower: string; address: string; amount: number; estimatedValue: number; purpose: string; program: string;
    rate: number; stage: string; applicationDate: string; targetCloseDate: string; processor: string; daysToClose: number | null };
  checklist: ChecklistItem[]; checks: Check[]; conditions: Condition[]; docs: DocDetail[];
  actions: LoanAction[]; qc: QcReview | null;
}

export interface QcBoard {
  provenance: Provenance;
  findingsByType: { type: string; historical: number; current: number }[];
  monthly: { month: string; reviewed: number; withFinding: number }[];
  sample: { loanId: string; borrower: string; stage: string; failed: string[]; openConditions: number }[];
  policy: { ruleId: string; ruleName: string; threshold: number; description: string }[];
}

export interface Draft { message: string; provenance: Provenance }
export interface Citation { id: string; sourceType: string; name: string; date: string; snippet: string }
export interface Answer { answer: string; citations: Citation[]; provenance: Provenance }
