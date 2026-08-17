// Shim — the derivation lives in api/_shared/meeting-numbering.ts (the stricter
// side of the boundary, per the re-homing principle; generate-minutes is the
// serverless consumer). The UI and dashboard reach it through here.
export * from '../../api/_shared/meeting-numbering'
