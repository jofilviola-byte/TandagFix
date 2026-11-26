-- TandagFix starter database schema for Supabase (PostgreSQL)
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'customer' check (role in ('customer','provider','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  provider_sample_id text,
  provider_name text not null,
  service_category text not null,
  service_price numeric(10,2) not null default 0,
  platform_fee numeric(10,2) not null default 0,
  status text not null default 'Requested',
  service_date date,
  service_time text,
  service_address text not null default '',
  job_description text not null default '',
  payment_method text not null default 'Cash',
  gps_latitude double precision,
  gps_longitude double precision,
  created_at timestamptz not null default now()
);


-- Create a profile automatically at signup. The trigger only accepts customer/provider
-- metadata, so a client cannot self-assign the admin role.
create or replace function public.handle_new_tandagfix_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''),
          case when new.raw_user_meta_data->>'role' = 'provider' then 'provider' else 'customer' end)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_tandagfix_auth_user_created on auth.users;
create trigger on_tandagfix_auth_user_created
after insert on auth.users for each row execute procedure public.handle_new_tandagfix_user();

alter table public.profiles enable row level security;
alter table public.bookings enable row level security;

-- Signed-in users can view their own profile. New signups may choose customer/provider only.
drop policy if exists "profile select own" on public.profiles;
create policy "profile select own" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "profile insert own customer provider" on public.profiles;
create policy "profile insert own customer provider" on public.profiles for insert to authenticated with check (id = auth.uid() and role in ('customer','provider'));
-- No client-side profile update policy: role assignment must be controlled by an administrator.

drop policy if exists "booking select own customer" on public.bookings;
create policy "booking select own customer" on public.bookings for select to authenticated using (customer_id = auth.uid());
drop policy if exists "booking insert own customer" on public.bookings;
create policy "booking insert own customer" on public.bookings for insert to authenticated with check (customer_id = auth.uid());

-- To grant admin access, first create/sign up the account, then run this in Supabase SQL Editor:
-- update public.profiles p set role = 'admin'
-- from auth.users u where p.id = u.id and u.email = 'YOUR-ADMIN-EMAIL@example.com';
-- Provider approval and provider-side booking access need additional policies once provider records
-- are connected to auth user IDs. Do not expose the service_role key in browser code.
