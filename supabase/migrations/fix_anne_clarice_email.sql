-- One-off fix: ANNE CLARICE DOMINGO HERRERA (GDX2023-0035) has a stray
-- leading space in her email (" clarice.gladex@gmail.com") in admin_accounts.
-- That malformed address never matches the external accounts API's
-- (correctly trimmed) email, so the 5-min syncEmployeeAccounts job skips
-- her — she never lands in SyncedEmployee and therefore can't log in.
-- Trim the leading/trailing whitespace so the next sync picks her up.
--
-- NOTE: admin_accounts_security.sql's restrict_anon_update trigger blocks
-- the anon role from changing email, so run this with the service_role key
-- (or a postgres role bypassing RLS), not the anon key from the frontend.

update public.admin_accounts
set email = btrim(email)
where employee_code = 'GDX2023-0035'
  and email is distinct from btrim(email);