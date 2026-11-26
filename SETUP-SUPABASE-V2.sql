-- TandagFix v2 schema. Run AFTER SETUP-SUPABASE.sql, in the Supabase SQL Editor.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

-- Admin links a provider account to a listing: update profiles set provider_sample_id='1' where id='<uid>';
alter table public.profiles add column if not exists provider_sample_id text;
alter table public.bookings
  add column if not exists local_id bigint unique,
  add column if not exists urgent boolean not null default false,
  add column if not exists payment_status text not null default 'Unpaid',
  add column if not exists receipt_path text;

-- Profiles: admins can read and manage everyone (role changes stay admin-only)
drop policy if exists "profile admin select" on public.profiles;
create policy "profile admin select" on public.profiles for select to authenticated using (public.is_admin());
drop policy if exists "profile admin update" on public.profiles;
create policy "profile admin update" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Bookings: customer, linked provider, admin
create or replace function public.is_booking_provider(sample_id text) returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'provider' and provider_sample_id = sample_id) $$;

drop policy if exists "booking update own customer" on public.bookings;
create policy "booking update own customer" on public.bookings for update to authenticated using (customer_id = auth.uid()) with check (customer_id = auth.uid());
drop policy if exists "booking provider select" on public.bookings;
create policy "booking provider select" on public.bookings for select to authenticated using (public.is_booking_provider(provider_sample_id));
drop policy if exists "booking provider update" on public.bookings;
create policy "booking provider update" on public.bookings for update to authenticated using (public.is_booking_provider(provider_sample_id)) with check (public.is_booking_provider(provider_sample_id));
drop policy if exists "booking admin all" on public.bookings;
create policy "booking admin all" on public.bookings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Protect prices, ownership and who may move a booking to which status
create or replace function public.guard_booking_update() returns trigger language plpgsql as $$
begin
  if public.is_admin() then return new; end if;
  if new.customer_id <> old.customer_id or new.service_price <> old.service_price
     or new.platform_fee <> old.platform_fee or new.provider_sample_id is distinct from old.provider_sample_id then
    raise exception 'Protected booking fields cannot be changed';
  end if;
  if auth.uid() = old.customer_id then
    if new.status <> old.status and not (new.status = 'Cancelled' and old.status in ('Requested','Accepted')) then
      raise exception 'Customers can only cancel Requested or Accepted bookings';
    end if;
    if new.payment_status <> old.payment_status and new.payment_status <> 'Receipt uploaded' then
      raise exception 'Customers cannot confirm their own payment';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_booking_update on public.bookings;
create trigger guard_booking_update before update on public.bookings for each row execute procedure public.guard_booking_update();

-- Booked time slots (no personal data) so the booking form can hide taken slots
create or replace function public.booked_slots(p_provider text, p_day date) returns setof text language sql stable security definer set search_path = public as
$$ select service_time from public.bookings where provider_sample_id = p_provider and service_date = p_day and status not in ('Cancelled','Declined') $$;
grant execute on function public.booked_slots(text, date) to anon, authenticated;

-- Reviews: only the customer of a Completed booking can review it
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  provider_sample_id text not null,
  customer_name text not null default '',
  rating int not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);
alter table public.reviews enable row level security;
drop policy if exists "reviews public read" on public.reviews;
create policy "reviews public read" on public.reviews for select to anon, authenticated using (true);
drop policy if exists "reviews insert completed own" on public.reviews;
create policy "reviews insert completed own" on public.reviews for insert to authenticated with check (
  customer_id = auth.uid() and exists (select 1 from public.bookings b where b.id = booking_id
    and b.customer_id = auth.uid() and b.status = 'Completed' and b.provider_sample_id = reviews.provider_sample_id));

-- Provider days off
create table if not exists public.availability (
  provider_sample_id text not null, day_off date not null, primary key (provider_sample_id, day_off));
alter table public.availability enable row level security;
drop policy if exists "availability read" on public.availability;
create policy "availability read" on public.availability for select to anon, authenticated using (true);
drop policy if exists "availability manage" on public.availability;
create policy "availability manage" on public.availability for all to authenticated
  using (public.is_booking_provider(provider_sample_id) or public.is_admin())
  with check (public.is_booking_provider(provider_sample_id) or public.is_admin());

-- Chat per booking
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now());
alter table public.messages enable row level security;
drop policy if exists "messages participants read" on public.messages;
create policy "messages participants read" on public.messages for select to authenticated using (
  public.is_admin() or exists (select 1 from public.bookings b where b.id = booking_id
    and (b.customer_id = auth.uid() or public.is_booking_provider(b.provider_sample_id))));
drop policy if exists "messages participants write" on public.messages;
create policy "messages participants write" on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and exists (select 1 from public.bookings b where b.id = booking_id
    and (b.customer_id = auth.uid() or public.is_booking_provider(b.provider_sample_id))));

-- ID verification (private storage + review table)
create table if not exists public.id_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null default '',
  file_path text not null,
  status text not null default 'Pending' check (status in ('Pending','Approved','Rejected')),
  created_at timestamptz not null default now());
alter table public.id_verifications enable row level security;
drop policy if exists "idv insert own" on public.id_verifications;
create policy "idv insert own" on public.id_verifications for insert to authenticated with check (user_id = auth.uid() and status = 'Pending');
drop policy if exists "idv read own or admin" on public.id_verifications;
create policy "idv read own or admin" on public.id_verifications for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "idv admin update" on public.id_verifications;
create policy "idv admin update" on public.id_verifications for update to authenticated using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public) values ('id-documents','id-documents',false), ('receipts','receipts',false) on conflict (id) do nothing;
drop policy if exists "private upload own folder" on storage.objects;
create policy "private upload own folder" on storage.objects for insert to authenticated with check (
  bucket_id in ('id-documents','receipts') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "private read own or admin" on storage.objects;
create policy "private read own or admin" on storage.objects for select to authenticated using (
  bucket_id in ('id-documents','receipts') and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "receipt read by provider" on storage.objects;
create policy "receipt read by provider" on storage.objects for select to authenticated using (
  bucket_id = 'receipts' and exists (select 1 from public.bookings b where b.receipt_path = name and public.is_booking_provider(b.provider_sample_id)));
