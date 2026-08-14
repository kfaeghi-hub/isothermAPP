// MOVED to api/_shared/schedule-field-match.ts (2026-08-14, the matcher-wiring
// incident — see ARCHITECTURE: a capability is only as real as the live path that
// invokes it). The approve endpoint runs the matcher now, so it lives beside its
// caller; this shim keeps the test, the repoint script, and any client import
// working. One source of truth.
export * from '../../api/_shared/schedule-field-match'
