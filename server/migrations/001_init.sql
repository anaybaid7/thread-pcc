-- THREAD schema v1. Idempotent: safe to run more than once.
-- Scenario content is versioned and immutable once seeded; attempts reference the exact version they were played on,
-- so an earlier attempt can always be inspected and replayed without being overwritten.

create table if not exists scenarios (
  id          text primary key,
  title       text not null,
  subtitle    text not null,
  created_at  timestamptz not null default now()
);

create table if not exists scenario_versions (
  id            bigint generated always as identity primary key,
  scenario_id   text not null references scenarios (id),
  version       integer not null,
  content_hash  text not null,
  definition    jsonb not null,
  created_at    timestamptz not null default now(),
  unique (scenario_id, version)
);

create table if not exists resident_profiles (
  id                   bigint generated always as identity primary key,
  scenario_version_id  bigint not null unique references scenario_versions (id),
  resident_key         text not null,
  display_name         text not null,
  profile              jsonb not null,
  baseline             jsonb not null,
  synthetic            boolean not null default true check (synthetic)
);

create table if not exists scenario_events (
  id                   bigint generated always as identity primary key,
  scenario_version_id  bigint not null references scenario_versions (id),
  node_id              text not null,
  event_key            text not null,
  seq                  integer not null,
  sim_day              integer not null,
  sim_clock            text not null,
  kind                 text not null check (kind in ('observation', 'documentation', 'action', 'unknown')),
  source               text not null,
  body                 jsonb not null,
  unique (scenario_version_id, node_id, event_key)
);

create table if not exists simulation_attempts (
  id                   uuid primary key,
  scenario_version_id  bigint not null references scenario_versions (id),
  course               text not null,
  replay_of            uuid references simulation_attempts (id),
  phase                text not null check (phase in ('prebrief', 'playing', 'decision', 'handover', 'complete')),
  revision             integer not null default 0,
  state                jsonb not null,
  total_score          integer check (total_score between 0 and 100),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  completed_at         timestamptz
);
create index if not exists simulation_attempts_recent_idx on simulation_attempts (created_at desc);
create index if not exists simulation_attempts_version_idx on simulation_attempts (scenario_version_id);
create index if not exists simulation_attempts_replay_idx on simulation_attempts (replay_of);

-- Append-only log of everything that happened in an attempt.
create table if not exists attempt_events (
  id          bigint generated always as identity primary key,
  attempt_id  uuid not null references simulation_attempts (id),
  seq         integer not null,
  type        text not null check (type in ('started', 'event_revealed', 'decision_made', 'handover_drafted', 'handover_submitted')),
  event_key   text,
  revision    integer not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (attempt_id, seq)
);

create table if not exists player_decisions (
  id                   bigint generated always as identity primary key,
  attempt_id           uuid not null references simulation_attempts (id),
  decision_key         text not null,
  node_id              text not null,
  choice_key           text not null,
  input                jsonb not null,
  -- The evidence available when the decision was made: the only evidence it is scored on.
  evidence_event_keys  text[] not null,
  sim_day              integer not null,
  sim_clock            text not null,
  created_at           timestamptz not null default now(),
  unique (attempt_id, decision_key)
);

create table if not exists handover_drafts (
  id               uuid primary key,
  attempt_id       uuid not null references simulation_attempts (id),
  kind             text not null check (kind in ('draft', 'submitted')),
  source           text not null check (source in ('gemini', 'template', 'player')),
  model            text,
  fallback_reason  text,
  facts            jsonb not null,
  fact_keys        text[] not null,
  draft            jsonb not null,
  validation       jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists handover_drafts_attempt_idx on handover_drafts (attempt_id, created_at);

create table if not exists decision_scores (
  id                 bigint generated always as identity primary key,
  attempt_id         uuid not null references simulation_attempts (id),
  decision_id        bigint references player_decisions (id),
  handover_draft_id  uuid references handover_drafts (id),
  criterion          text not null check (criterion in ('recognition', 'communication', 'evidence', 'handover')),
  item               text not null,
  earned             integer not null,
  max                integer not null,
  reason             text not null,
  check (earned between 0 and max),
  check ((decision_id is null) <> (handover_draft_id is null))
);
create index if not exists decision_scores_attempt_idx on decision_scores (attempt_id);

create table if not exists debrief_results (
  attempt_id  uuid primary key references simulation_attempts (id),
  total       integer not null check (total between 0 and 100),
  breakdown   jsonb not null,
  debrief     jsonb not null,
  created_at  timestamptz not null default now()
);
