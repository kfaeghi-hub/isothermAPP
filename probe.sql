select tablename, cmd, coalesce(with_check::text,'-') wc from pg_policies
 where tablename in ('company_roles','company_trades','company_locations') and cmd='INSERT';
