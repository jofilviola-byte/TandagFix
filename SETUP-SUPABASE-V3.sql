-- TandagFix v6 — messaging upgrades.
-- Run AFTER SETUP-SUPABASE.sql and SETUP-SUPABASE-V2.sql, in the Supabase SQL Editor.

-- 1. Message attachments + read receipts -------------------------------------------------
alter table public.messages add column if not exists attachment_path text;
alter table public.messages add column if not exists read_at timestamptz;
create index if not exists messages_booking_created_idx on public.messages (booking_id, created_at);

-- Recipients (not the sender) may mark a message as read. Senders keep their own rows untouched.
drop policy if exists "messages participants mark read" on public.messages;
create policy "messages participants mark read" on public.messages
  for update to authenticated
  using (
    sender_id <> auth.uid() and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.customer_id = auth.uid() or public.is_booking_provider(b.provider_sample_id) or public.is_admin())
    )
  )
  with check (
    sender_id <> auth.uid() and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.customer_id = auth.uid() or public.is_booking_provider(b.provider_sample_id) or public.is_admin())
    )
  );

-- 2. Realtime for the chat inbox ---------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- 3. Private bucket for chat photos ------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', false)
on conflict (id) do nothing;

-- Files are stored as <booking_uuid>/<timestamp>.jpg so participants can be checked.
drop policy if exists "chat images upload participant" on storage.objects;
create policy "chat images upload participant" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-images' and exists (
      select 1 from public.bookings b
      where b.id::text = (storage.foldername(name))[1]
        and (b.customer_id = auth.uid() or public.is_booking_provider(b.provider_sample_id) or public.is_admin())
    )
  );

drop policy if exists "chat images read participant" on storage.objects;
create policy "chat images read participant" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-images' and exists (
      select 1 from public.bookings b
      where b.id::text = (storage.foldername(name))[1]
        and (b.customer_id = auth.uid() or public.is_booking_provider(b.provider_sample_id) or public.is_admin())
    )
  );

-- 4. Optional: expose unread counts for the signed-in user --------------------------------
create or replace function public.my_unread_messages()
returns bigint
language sql stable security definer set search_path = public as
$$
  select count(*)
  from public.messages m
  join public.bookings b on b.id = m.booking_id
  where m.sender_id <> auth.uid()
    and m.read_at is null
    and (b.customer_id = auth.uid() or public.is_booking_provider(b.provider_sample_id))
$$;
grant execute on function public.my_unread_messages() to authenticated;
