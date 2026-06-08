-- threadwick studio — Supabase schema (Postgres + Row-Level Security).
--
-- Cloud is additive. These tables back optional sign-in, cross-device sync, and
-- read-only sharing. The portable project JSON (the output of projectToFile in
-- src/core/model.ts) is stored verbatim in `data` / `snapshot`, so a row is itself
-- a valid export file and "export everything" stays trivial.
--
-- Apply via the Supabase SQL editor or `supabase db` (CLI). Phase 1 (the auth
-- shell) does not read or write these tables; they're defined up front so the
-- data layer is reviewable before any sync code exists.

-- ============================================================================
-- projects — one row per Project, owned by a user. (Used from Phase 2: sync.)
-- ============================================================================
create table if not exists public.projects (
  id          text primary key,                                   -- == Project.id
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null default '',                           -- denormalized for listing
  data        jsonb not null,                                     -- = projectToFile(project)
  deleted_at  timestamptz,                                        -- tombstone (delete-sync)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()                  -- server-stamped LWW key
);

create index if not exists projects_owner_idx on public.projects (owner_id);

-- Server-stamp updated_at on every write, so last-write-wins ordering is immune
-- to client clock skew across devices.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then new.created_at := now(); end if; -- server-authoritative
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch
  before insert or update on public.projects
  for each row execute function public.touch_updated_at();

alter table public.projects enable row level security;

create policy "projects: owner selects" on public.projects
  for select using (owner_id = auth.uid());
create policy "projects: owner inserts" on public.projects
  for insert with check (owner_id = auth.uid());
create policy "projects: owner updates" on public.projects
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "projects: owner deletes" on public.projects
  for delete using (owner_id = auth.uid());

-- ============================================================================
-- shares — read-only published-version links. (Used from Phase 3: sharing.)
-- ============================================================================
create table if not exists public.shares (
  token       text primary key,                                   -- unguessable URL capability
  project_id  text not null,                                      -- informational; snapshot is self-contained
  owner_id    uuid not null references auth.users (id) on delete cascade,
  snapshot    jsonb not null,                                     -- frozen ProjectFile: published version only
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists shares_owner_idx on public.shares (owner_id);

alter table public.shares enable row level security;

-- Owners manage their own shares. Anonymous visitors never select from the table
-- directly — reads go through get_share() below.
create policy "shares: owner all" on public.shares
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Public, unauthenticated read by exact token. SECURITY DEFINER bypasses RLS but
-- only ever returns a single non-revoked snapshot for an exact token match — no
-- table-enumeration surface.
create or replace function public.get_share(share_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select snapshot from public.shares
  where token = share_token and revoked = false;
$$;

grant execute on function public.get_share(text) to anon, authenticated;

-- NOTE (Phase 3): the token is the only secret guarding a share. Generate it with
-- high entropy (e.g. crypto.randomUUID) and consider adding an expiry column for
-- defense in depth — get_share has no rate limiting.
