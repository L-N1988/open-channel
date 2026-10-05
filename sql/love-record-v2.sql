-- Run in Supabase SQL Editor. Replace the two placeholder emails first.
-- Safe to re-run; existing records and allowlist members are preserved.
begin;

create extension if not exists pgcrypto;

create table if not exists public.allowed_emails (
  email text primary key
);

insert into public.allowed_emails (email)
values
  ('you@example.com'),
  ('lover@example.com')
on conflict (email) do nothing;

alter table public.allowed_emails enable row level security;

create or replace function public.is_love_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.allowed_emails
    where email = auth.jwt() ->> 'email'
  );
$$;

create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('movie', 'restaurant', 'city', 'ritual')),
  title text not null,
  status text not null default 'planned' check (status in ('planned', 'done')),
  planned_date date,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('photo', 'video')),
  title text not null,
  location text,
  memory_date date,
  note text,
  file_path text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('anniversary', 'festival', 'birthday', 'trip')),
  title text not null,
  event_date date not null,
  end_date date,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.todos enable row level security;
alter table public.memories enable row level security;
alter table public.events enable row level security;


-- Stage 1: richer records and optimistic revisions.
alter table public.memories drop constraint if exists memories_type_check;
alter table public.memories add constraint memories_type_check check (type in ('photo', 'video', 'moment', 'essay'));
alter table public.memories add column if not exists mood text check (mood in ('happy', 'calm', 'excited', 'tired', 'sad'));
alter table public.memories add column if not exists tags text[] not null default '{}';
alter table public.memories add column if not exists latitude double precision check (latitude between -90 and 90);
alter table public.memories add column if not exists longitude double precision check (longitude between -180 and 180);
alter table public.memories add column if not exists media jsonb not null default '[]' check (jsonb_typeof(media) = 'array');
alter table public.events add column if not exists recurrence text not null default 'none' check (recurrence in ('none', 'yearly'));

-- Stage 2: journals and daily itineraries.
create table if not exists public.journals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text,
  cover_color text not null default 'rose' check (cover_color in ('rose', 'blue', 'sage', 'lilac')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.memories add column if not exists journal_id uuid references public.journals(id) on delete restrict;
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_date date not null,
  end_date date not null,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create table if not exists public.trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete restrict,
  title text not null,
  item_date date not null,
  item_time time,
  position integer not null default 0 check (position >= 0),
  location text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);
create index if not exists memories_date_idx on public.memories(memory_date desc);
create index if not exists memories_journal_idx on public.memories(journal_id);
create index if not exists trip_items_trip_idx on public.trip_items(trip_id, item_date, position);

-- Keep revision values supplied by this client for idempotent network retries.
-- Other editors that do not update the revision get a server timestamp.
create or replace function public.touch_love_revision()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create or replace function public.check_love_dates()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'trip_items' then
    perform 1 from public.trips where id = new.trip_id
      and new.item_date between start_date and end_date for update;
    if not found then raise exception 'Itinerary date must be within the trip dates'; end if;
  elsif tg_table_name = 'trips' then
    if exists (select 1 from public.trip_items where trip_id = new.id
      and (item_date < new.start_date or item_date > new.end_date)) then
      raise exception 'Trip dates must include existing itinerary dates';
    end if;
  elsif tg_table_name = 'events' then
    if new.end_date < new.event_date then raise exception 'End date must follow start date'; end if;
    if new.recurrence = 'yearly' and new.end_date is not null and new.end_date <> new.event_date then
      raise exception 'Yearly anniversaries must be single-day events';
    end if;
  end if;
  return new;
end;
$$;

-- One shared archive for the two allowlisted accounts.
-- Do not grant access to allowed_emails; administrators edit it in SQL Editor.
do $$
declare table_name text;
begin
  foreach table_name in array array['todos', 'memories', 'events', 'journals', 'trips', 'trip_items'] loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "shared archive access" on public.%I', table_name);
    execute format('create policy "shared archive access" on public.%I for all to authenticated using (public.is_love_user()) with check (public.is_love_user())', table_name);
    execute format('drop trigger if exists love_revision on public.%I', table_name);
    execute format('create trigger love_revision before update on public.%I for each row execute function public.touch_love_revision()', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    if table_name in ('trips', 'trip_items', 'events') then
      execute format('drop trigger if exists love_dates on public.%I', table_name);
      execute format('create trigger love_dates before insert or update on public.%I for each row execute function public.check_love_dates()', table_name);
    end if;
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

revoke all on public.allowed_emails from anon, authenticated;
revoke all on function public.is_love_user() from public;
grant execute on function public.is_love_user() to authenticated;

-- Private original media; browser receives expiring signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('love-media', 'love-media', false, 104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shared archive media" on storage.objects;
create policy "shared archive media" on storage.objects for all to authenticated
using (bucket_id = 'love-media' and public.is_love_user())
with check (bucket_id = 'love-media' and public.is_love_user());

commit;
