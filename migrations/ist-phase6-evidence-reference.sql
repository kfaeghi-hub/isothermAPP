-- IST — EVIDENCE BECOMES A REFERENCE, NOT AN UPLOAD.
--
-- SUPERSEDES the phase-2 constraint `ist_prerequisites_yes_needs_document`,
-- which required a row in the in-app documentation register before a
-- prerequisite could be marked YES.
--
-- THE MODEL WAS WRONG FOR THE FIRM'S PRACTICE. Documents live in ShareSync. The
-- app is the record of TESTING; ShareSync is the record of DOCUMENTS. A
-- constraint that demanded in-app custody of the evidence was not enforcing
-- rigour, it was demanding the firm move its document store — and the reliable
-- outcome of a control that is expensive to satisfy honestly is that it gets
-- satisfied dishonestly.
--
-- The claim still has to name its evidence. What changes is WHERE the evidence
-- may live:
--
--   YES  requires document_id (register row) OR a non-empty evidence_reference
--        (free text: title + location, as the firm writes it —
--         "S537 Verification Cert — ShareSync /2.Bldg_Docs/5.Certs/")
--   NO   free
--   N/A  free
--
-- This is the same shape the issued Scarborough report already uses: its
-- pre-completed-test table NAMES the documentation ("10-Fire Alarm System
-- Verification Report- Rev1") rather than embedding it. The document was telling
-- us the model and the first implementation did not listen.

begin;

alter table ist_prerequisites
  add column if not exists evidence_reference text;

comment on column ist_prerequisites.evidence_reference IS
  'Free-text pointer to where the supporting document lives — title and location as the firm writes it. Satisfies YES on its own; the app never requires custody of the evidence.';

-- Replace the old constraint. Dropped by name rather than edited, so a database
-- that somehow missed phase 2 lands in the same final state either way.
alter table ist_prerequisites drop constraint if exists ist_prerequisites_yes_needs_document;

alter table ist_prerequisites add constraint ist_prerequisites_yes_needs_evidence
  check (
    state <> 'yes'
    or document_id is not null
    or (evidence_reference is not null and length(btrim(evidence_reference)) > 0)
  );

comment on constraint ist_prerequisites_yes_needs_evidence on ist_prerequisites is
  'YES must name its evidence: either a register document, or a free-text reference to where the document lives. A claim points at something; it does not have to own it.';

commit;
