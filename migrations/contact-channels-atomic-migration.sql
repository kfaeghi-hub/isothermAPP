-- BUG 1 — a contact edit by a non-admin fails on uq_contact_phones_primary.
--
-- REPRODUCED, not inferred:
--   employee DELETE on contact_phones -> error: NONE, rows 1 -> 1
--   employee INSERT of a second primary -> duplicate key ... uq_contact_phones_primary
--
-- TWO INDEPENDENT DEFECTS, and fixing either alone leaves a real bug behind.
--
-- D1 — THE AUTHORIZATION MODEL WAS INCONSISTENT WITH ITSELF.
-- contact_phones and contact_emails granted SELECT/INSERT/UPDATE to is_staff()
-- but DELETE only to is_admin_or_dev() OR is_owner(). Removing a phone row is
-- part of EDITING A CONTACT, which staff may do; it is not the same act as
-- deleting the contact, which stays admin/owner. As written, the app showed
-- every staff user an edit form that could not perform an edit.
--
-- Worse, it failed SILENTLY. A DELETE filtered out by RLS removes zero rows and
-- returns NO ERROR, so the client's `if (error)` guard passed and it went on to
-- insert a duplicate primary. The user then sees a constraint about PHONES while
-- editing EMAILS, because the phones block runs first — a message that points
-- at neither the thing they touched nor the thing that is wrong.
--
-- D2 — THE WRITE WAS NOT ATOMIC. Delete-then-insert across two HTTP calls means
-- a failed insert leaves the contact with NO phone numbers at all. That is worse
-- than the error it was trying to avoid: a validation failure would have cost a
-- retry, this costs data.
--
-- The RPC below does the whole replacement in ONE transaction, and normalises
-- the primary flag so that even a client sending two primaries cannot violate
-- the index. The constraint stays as the last line of defence rather than the
-- first line of validation.

-- ── D1 ──────────────────────────────────────────────────────────────────────
drop policy if exists dir_delete on contact_phones;
create policy dir_delete on contact_phones for delete using (is_staff());

drop policy if exists dir_delete on contact_emails;
create policy dir_delete on contact_emails for delete using (is_staff());

-- ── D2 ──────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER (the default) is deliberate: the caller's RLS still applies,
-- so this function grants nobody anything the policies above do not already
-- allow. It buys atomicity, not authority.
create or replace function replace_contact_channels(
  p_contact_id uuid,
  p_phones     jsonb default '[]'::jsonb,
  p_emails     jsonb default '[]'::jsonb
) returns void
language plpgsql
as $$
declare
  v_owner uuid;
begin
  -- Refuse a contact that does not exist or that RLS hides from this caller,
  -- rather than quietly replacing nothing and reporting success.
  select id into v_owner from contacts where id = p_contact_id;
  if v_owner is null then
    raise exception 'No such contact, or it is not visible to you: %', p_contact_id
      using errcode = 'check_violation';
  end if;

  delete from contact_phones where contact_id = p_contact_id;
  delete from contact_emails where contact_id = p_contact_id;

  -- EXACTLY ONE PRIMARY, decided here rather than trusted from the client.
  -- row_number() over the declared order: the first row flagged primary wins;
  -- if the caller flagged none, the first row becomes primary, because a contact
  -- with channels and no primary renders as "no email" everywhere downstream.
  insert into contact_phones (contact_id, phone_type, number, extension, is_primary)
  select p_contact_id,
         coalesce(e->>'phone_type', 'office'),
         e->>'number',
         nullif(e->>'extension', ''),
         row_number() over (
           order by (coalesce((e->>'is_primary')::boolean, false)) desc, ord
         ) = 1
    from jsonb_array_elements(p_phones) with ordinality t(e, ord)
   where coalesce(e->>'number', '') <> '';

  insert into contact_emails (contact_id, label, email, is_primary)
  select p_contact_id,
         nullif(e->>'label', ''),
         e->>'email',
         row_number() over (
           order by (coalesce((e->>'is_primary')::boolean, false)) desc, ord
         ) = 1
    from jsonb_array_elements(p_emails) with ordinality t(e, ord)
   where coalesce(e->>'email', '') <> '';

  -- Keep the legacy single columns mirroring the primaries, in the SAME
  -- transaction. Doing it from the client left a window where the row said one
  -- thing and its channels said another.
  update contacts c set
    email = (select email  from contact_emails where contact_id = p_contact_id and is_primary),
    phone = (select number from contact_phones where contact_id = p_contact_id and is_primary)
  where c.id = p_contact_id;
end;
$$;

comment on function replace_contact_channels is
  'Atomically replaces a contact''s phone and email rows. Normalises is_primary to '
  'exactly one per list so a client cannot violate uq_contact_*_primary. '
  'SECURITY INVOKER: the caller''s RLS applies unchanged.';

select 'phones_delete' as policy, qual::text from pg_policies
 where tablename='contact_phones' and cmd='DELETE'
union all
select 'emails_delete', qual::text from pg_policies
 where tablename='contact_emails' and cmd='DELETE';

-- ── THE SAME ASYMMETRY, THREE MORE TABLES — AND WORSE THERE ────────────────
-- Auditing for the shape rather than the instance found company_roles,
-- company_trades and company_locations with the identical split: INSERT to
-- is_staff(), DELETE to admin/owner only. The company editor uses the same
-- delete-then-insert.
--
-- These are WORSE than the contact case, because there is no unique index to
-- trip. A staff user removing a role from a company gets a success message and
-- the role stays. Nothing ever complains. The only way to find out is to notice,
-- later, that the directory says something untrue — which on this system feeds
-- responsible-party grouping and report distribution.
--
-- Editing a company is a staff act; DELETING a company remains admin/owner, and
-- that policy is untouched.
drop policy if exists dir_delete on company_roles;
create policy dir_delete on company_roles for delete using (is_staff());

drop policy if exists dir_delete on company_trades;
create policy dir_delete on company_trades for delete using (is_staff());

drop policy if exists dir_delete on company_locations;
create policy dir_delete on company_locations for delete using (is_staff());

select tablename, qual::text as delete_policy from pg_policies
 where tablename in ('contact_phones','contact_emails','company_roles',
                     'company_trades','company_locations')
   and cmd='DELETE' order by tablename;
