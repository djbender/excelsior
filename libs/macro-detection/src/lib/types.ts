export type ReasonCode =
  | 'VBA_PROJECT'
  | 'XLM_MACRO_SHEET'
  | 'ENCRYPTED'
  | 'UNPARSEABLE'
  | 'NOT_A_SPREADSHEET'
  | 'LIMIT_EXCEEDED';

export interface Reason {
  code: ReasonCode;
  detail: string;
}

export interface InspectionResult {
  verdict: 'accepted' | 'rejected';
  reasons: Reason[];
}
