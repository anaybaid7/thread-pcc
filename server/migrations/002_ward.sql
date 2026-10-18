-- THREAD schema v2: the ward workflows. Idempotent.
-- A workspace is one demo ward. Its state is never stored: it is replayed from the seed plus the append-only list of
-- commands people sent, so every screen can be reproduced and every flag traced.

create table if not exists workspaces (
  id          uuid primary key,
  seq         integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists workspace_commands (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references workspaces (id),
  seq           integer not null,
  command       jsonb not null,
  -- The ward clock after the command, in minutes since Monday 00:00 of the demo week.
  ward_now      integer not null,
  created_at    timestamptz not null default now(),
  unique (workspace_id, seq)
);

create table if not exists sbar_drafts (
  id               uuid primary key,
  workspace_id     uuid not null references workspaces (id),
  concern_id       text not null,
  source           text not null check (source in ('gemini', 'template')),
  model            text,
  fallback_reason  text,
  facts            jsonb not null,
  draft            jsonb not null,
  validation       jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists sbar_drafts_workspace_idx on sbar_drafts (workspace_id, created_at);
