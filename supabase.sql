-- StudyCircle database schema
create extension if not exists pgcrypto;

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 80),
  subject text not null check (char_length(subject) between 2 and 50),
  description text,
  session_date date not null,
  session_time time not null,
  location text not null check (char_length(location) between 2 and 100),
  max_members integer not null default 6 check (max_members between 2 and 30),
  created_by uuid not null references auth.users(id) on delete cascade,
  creator_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.session_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique(session_id, user_id)
);

alter table public.study_sessions enable row level security;
alter table public.session_members enable row level security;

grant select, insert, update, delete on table public.study_sessions to authenticated;
grant select, insert, delete on table public.session_members to authenticated;

create policy "Authenticated users can view sessions"
on public.study_sessions for select to authenticated using (true);

create policy "Users can create their own sessions"
on public.study_sessions for insert to authenticated
with check ((select auth.uid()) = created_by);

create policy "Creators can update their sessions"
on public.study_sessions for update to authenticated
using ((select auth.uid()) = created_by)
with check ((select auth.uid()) = created_by);

create policy "Creators can delete their sessions"
on public.study_sessions for delete to authenticated
using ((select auth.uid()) = created_by);

create policy "Authenticated users can view memberships"
on public.session_members for select to authenticated using (true);

create policy "Users can join as themselves"
on public.session_members for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can leave their own memberships"
on public.session_members for delete to authenticated
using ((select auth.uid()) = user_id);

-- Add both tables to realtime only if they are not already members.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'study_sessions'
  ) then
    alter publication supabase_realtime add table public.study_sessions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_members'
  ) then
    alter publication supabase_realtime add table public.session_members;
  end if;
end $$;
