// The rich-text schema + trio live in api/_shared/rich-text.ts (the
// strict-side rule: serverless consumers must not reach across an unproven
// boundary; the client tolerates it). This shim keeps client imports working.
// One source of truth.
export * from '../../api/_shared/rich-text'
