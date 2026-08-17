// MOVED to api/_shared/cx-counting.ts (2026-08-17, Cx Index export Phase 2):
// the generate-report endpoint computes the same percentages the page shows,
// and two copies of the counting rule is the exact defect Phase 1 fixed. The
// canonical module lives beside its server caller per the standing convention
// (meeting-numbering, schedule-field-match, unit-convert); this shim keeps the
// page, the tests, and every client import working. One source of truth.
export * from '../../api/_shared/cx-counting'
