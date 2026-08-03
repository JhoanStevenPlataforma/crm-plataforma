--
-- Replace the binary `sales.administrator` flag with a three-value role enum,
-- and add the access helpers the ownership RLS policies build on.
--
-- Written by hand on purpose: `supabase db diff` renders a column swap as
-- DROP + ADD, which would silently discard who the current administrators are.
--

create type public.sales_role as enum ('admin', 'manager', 'rep');

alter table public.sales
    add column role public.sales_role not null default 'rep'::public.sales_role;

-- Preserve the existing administrators. Everyone else starts as a plain rep;
-- promoting the sales managers is a deliberate act done from the Users screen.
update public.sales
set role = case
    when administrator then 'admin'::public.sales_role
    else 'rep'::public.sales_role
end;

--
-- Access helpers. SQL + STABLE so the planner can inline them and evaluate
-- them once per statement; SECURITY DEFINER because public.sales is itself
-- under RLS and an invoker-rights function would recurse.
--

create or replace function public.current_sale_id() returns bigint
    language sql stable security definer
    set search_path to ''
    as $$
  select id
  from public.sales
  where user_id = auth.uid()
    and disabled = false;
$$;

create or replace function public.current_sales_role() returns public.sales_role
    language sql stable security definer
    set search_path to ''
    as $$
  select role
  from public.sales
  where user_id = auth.uid()
    and disabled = false;
$$;

create or replace function public.can_manage_all() returns boolean
    language sql stable security definer
    set search_path to ''
    as $$
  select exists (
    select 1
    from public.sales
    where user_id = auth.uid()
      and disabled = false
      and role in ('admin'::public.sales_role, 'manager'::public.sales_role)
  );
$$;

grant all on function public.can_manage_all() to anon;
grant all on function public.can_manage_all() to authenticated;
grant all on function public.can_manage_all() to service_role;

grant all on function public.current_sale_id() to anon;
grant all on function public.current_sale_id() to authenticated;
grant all on function public.current_sale_id() to service_role;

grant all on function public.current_sales_role() to anon;
grant all on function public.current_sales_role() to authenticated;
grant all on function public.current_sales_role() to service_role;

--
-- Rewrite everything that still reads or writes `administrator`, before the
-- column disappears. plpgsql bodies are not dependency-tracked by Postgres,
-- so dropping the column first would leave these broken at runtime instead of
-- failing loudly here.
--

create or replace function public.is_admin() returns boolean
    language sql stable security definer
    set search_path to ''
    as $$
  select exists (
    select 1
    from public.sales
    where user_id = auth.uid()
      and disabled = false
      and role = 'admin'::public.sales_role
  );
$$;

create or replace function public.handle_new_user() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  sales_count int;
begin
  select count(id) into sales_count
  from public.sales;

  insert into public.sales (first_name, last_name, email, user_id, role)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    case when sales_count > 0 then 'rep'::public.sales_role else 'admin'::public.sales_role end
  );
  return new;
end;
$$;

-- Route the ownership default through current_sale_id() so a disabled account
-- cannot stamp new rows with its own id.
create or replace function public.set_sales_id_default() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
BEGIN
  IF NEW.sales_id IS NULL THEN
    NEW.sales_id := public.current_sale_id();
  END IF;
  RETURN NEW;
END;
$$;

alter table public.sales drop column administrator;
