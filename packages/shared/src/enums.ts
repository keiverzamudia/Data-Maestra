export const ItemStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  MERGED: 'MERGED',
  REJECTED: 'REJECTED',
} as const;

export type ItemStatus = (typeof ItemStatus)[keyof typeof ItemStatus];

export const SourceRecordStatus = {
  IMPORTED: 'IMPORTED',
  NORMALIZED: 'NORMALIZED',
  MATCHED: 'MATCHED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  LINKED: 'LINKED',
  IGNORED: 'IGNORED',
} as const;

export type SourceRecordStatus = (typeof SourceRecordStatus)[keyof typeof SourceRecordStatus];

export const MatchStatus = {
  NEW: 'NEW',
  AUTO_CANDIDATE: 'AUTO_CANDIDATE',
  PENDING_REVIEW: 'PENDING_REVIEW',
  CONFIRMED_SAME: 'CONFIRMED_SAME',
  CONFIRMED_DIFFERENT: 'CONFIRMED_DIFFERENT',
  IGNORED: 'IGNORED',
} as const;

export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];

export const ApprovalAction = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  RETURN: 'RETURN',
  REQUEST_CHANGES: 'REQUEST_CHANGES',
} as const;

export type ApprovalAction = (typeof ApprovalAction)[keyof typeof ApprovalAction];

export const RelationType = {
  EQUIVALENT: 'EQUIVALENT',
  SIMILAR: 'SIMILAR',
  SUPERSEDED: 'SUPERSEDED',
  COMPONENT_OF: 'COMPONENT_OF',
  ACCESSORY_OF: 'ACCESSORY_OF',
} as const;

export type RelationType = (typeof RelationType)[keyof typeof RelationType];

export const MatchDecisionAction = {
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  DEFERRED: 'DEFERRED',
} as const;

export type MatchDecisionAction = (typeof MatchDecisionAction)[keyof typeof MatchDecisionAction];

export const DataQualitySeverity = {
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO',
} as const;

export type DataQualitySeverity = (typeof DataQualitySeverity)[keyof typeof DataQualitySeverity];

export const ImportRunStatus = {
  CREATED: 'CREATED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  COMPLETED_WITH_ERRORS: 'COMPLETED_WITH_ERRORS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type ImportRunStatus = (typeof ImportRunStatus)[keyof typeof ImportRunStatus];
