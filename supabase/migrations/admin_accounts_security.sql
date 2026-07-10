-- Security hardening for admin_accounts (pre-existing table in the SALES
-- project — rpdtoxxizhcbldarqbtz.supabase.co — not created by this repo's
-- other migrations). Confirmed via curl 2026-07-10 that the anon/publishable
-- key (VITE_ACCOUNTS_SUPABASE_ANON_KEY, bundled into the public frontend JS)
-- can UPDATE any column on any row with no restriction — e.g. a PATCH
-- setting is_active also silently succeeds at rewriting role/password_hash/
-- email if someone chose to send those.
--
-- "super_admin"/"admin" access is only a client-side role check (see
-- ADMIN_LIKE_ROLES in src/hooks/useAuth.js) — there's no real Supabase Auth
-- session backing it — so anyone with devtools and this public key could
-- otherwise grant themselves any role or take over any account. This
-- trigger doesn't touch RLS (unclear whether it's even enabled, and
-- flipping it blind risks breaking existing access); it runs regardless of
-- how the UPDATE was authorized, and only restricts requests actually
-- executing as the anon role, so SQL-Editor/service-role work (like the
-- password-reset migration below) is unaffected.

create or replace function public.admin_accounts_restrict_anon_update()
returns trigger as $$
begin
  if current_user = 'anon' and (
    new.full_name is distinct from old.full_name
    or new.email is distinct from old.email
    or new.employee_code is distinct from old.employee_code
    or new.password_hash is distinct from old.password_hash
    or new.role is distinct from old.role
    or new.team_name is distinct from old.team_name
    or new.department is distinct from old.department
  ) then
    raise exception 'Only is_active/last_login can be updated via the anon key';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists admin_accounts_restrict_anon_update_trg on public.admin_accounts;
create trigger admin_accounts_restrict_anon_update_trg
  before update on public.admin_accounts
  for each row
  execute function public.admin_accounts_restrict_anon_update();
