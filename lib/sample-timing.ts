// Sample-mode response time per AI surface, in ms. Close to the live latencies measured on the
// example account (see README); a little jitter keeps it from feeling canned.
export const SAMPLE_DELAY_MS = { narrative: 7400, draft: 4600, ask: 4900, reextract: 7400 } as const;
export const jitter = (ms: number) => ms + Math.round((Math.random() - 0.5) * 1200);
