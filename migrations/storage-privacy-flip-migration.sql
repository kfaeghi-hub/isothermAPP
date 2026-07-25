-- storage-privacy-flip-migration.sql
-- STORAGE PRIVACY PASS step 3 (approved 2026-07-24). Applied via apply_migration
-- name `storage_privacy_flip` — deliberately LAST, after the path-aware signed-URL
-- code was deployed and verified live (steps 1-2). This is the moment anonymous
-- access dies.
--
-- 1. equipment-files client-upload policies. finding-photos already carried
--    is_staff()-gated INSERT/SELECT/DELETE (fp_*); equipment-files had NONE —
--    client-side attachment upload had nothing granting it (untested path,
--    silently broken; discovered in this pass). Mirror the fp_* trio so both
--    client-upload buckets behave identically. Reads do NOT need SELECT policies
--    (signed URLs are token-validated, not RLS-validated) — the SELECT policy
--    exists for parity with fp_select and future direct reads by staff.
--    is_staff() = role in (admin, developer, owner, user) — internal only;
--    the client role can neither upload nor delete.
--
-- 2. Flip all five buckets private. Files stay in place; the raw
--    /object/public/... form 404s from here on. In-app access mints short-lived
--    signed URLs via api/get-file-url (documents 10 min, photos 60 min).

create policy ef_insert on storage.objects for insert
  with check (bucket_id = 'equipment-files' and is_staff());
create policy ef_select on storage.objects for select
  using (bucket_id = 'equipment-files' and is_staff());
create policy ef_delete on storage.objects for delete
  using (bucket_id = 'equipment-files' and is_staff());

update storage.buckets set public = false
 where id in ('site-reports', 'meeting-minutes', 'checklists', 'finding-photos', 'equipment-files');
