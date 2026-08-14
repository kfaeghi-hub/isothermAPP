// MOVED to api/_shared/unit-convert.ts (2026-08-14, the matcher-wiring incident):
// the approve endpoint is the runtime consumer now, and api/ never runtime-imports
// src/lib (the unproven Vercel boundary recorded in api/intake.ts). This shim
// keeps every existing client import working; one source of truth lives there.
export * from '../../api/_shared/unit-convert'
