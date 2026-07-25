-- storage-url-to-path-migration.sql
-- STORAGE PRIVACY PASS step 1 (approved 2026-07-24). Applied via apply_migration
-- name `storage_url_to_path` AFTER the path-aware signing code deployed (the
-- deployed code handles both forms, so ordering is safe either way; the ruling's
-- staged order is code → migrate → verify → flip).
--
-- Converts the four stored full-public-URL columns to bucket-relative PATHS.
-- Signed URLs expire, so persisting URLs is wrong by construction — the app now
-- stores paths and mints short-lived signed URLs on demand (api/get-file-url).
-- Idempotent: only rows still carrying an http URL are touched. The ?t= cache
-- buster is stripped (obsolete — signed URLs are unique per mint).
-- Verified before writing: no stored path segment carries percent-encoding.

update site_reports
   set storage_url = regexp_replace(split_part(storage_url, '?', 1), '^.*/object/public/site-reports/', '')
 where storage_url like 'http%';
update site_reports
   set pdf_url = regexp_replace(split_part(pdf_url, '?', 1), '^.*/object/public/site-reports/', '')
 where pdf_url like 'http%';

update meetings
   set storage_url = regexp_replace(split_part(storage_url, '?', 1), '^.*/object/public/meeting-minutes/', '')
 where storage_url like 'http%';
update meetings
   set pdf_url = regexp_replace(split_part(pdf_url, '?', 1), '^.*/object/public/meeting-minutes/', '')
 where pdf_url like 'http%';

update finding_photos
   set storage_url = regexp_replace(split_part(storage_url, '?', 1), '^.*/object/public/finding-photos/', '')
 where storage_url like 'http%';

update equipment_attachments
   set storage_url = regexp_replace(split_part(storage_url, '?', 1), '^.*/object/public/equipment-files/', '')
 where storage_url like 'http%';
