-- Lugares del Mundo — schema Supabase
-- Correr en el SQL editor del proyecto: https://supabase.com/dashboard/project/irryksaoygdklwtsjsru/sql

-- ── Sesiones ──────────────────────────────────────────────────────────────────
create table if not exists ldm_sessions (
  session_id   uuid        primary key,
  player_country text,
  start_level  text,
  created_at   timestamptz default now()
);

-- ── Respuestas (incluye comodines) ────────────────────────────────────────────
create table if not exists ldm_answers (
  id               uuid    default gen_random_uuid() primary key,
  session_id       uuid    not null references ldm_sessions(session_id),
  round_number     integer not null,
  level            text    not null,
  place_name       text    not null,
  correct_country  text    not null,
  selected_country text    not null,
  is_correct       boolean not null,
  is_wildcard      boolean default false,
  -- 'place_from_description' | 'country_from_flag' | null
  wildcard_type    text,
  reaction_time_ms integer not null,
  lives_after      integer not null,
  created_at       timestamptz default now()
);

-- ── Textos creativos finales ──────────────────────────────────────────────────
create table if not exists ldm_final_writeups (
  session_id   uuid    primary key references ldm_sessions(session_id),
  text         text    not null,
  hits         integer,
  rounds       integer,
  out_of_lives boolean,
  created_at   timestamptz default now()
);

-- ── Sugerencias de países a agregar ───────────────────────────────────────────
create table if not exists ldm_suggestions (
  id           uuid    default gen_random_uuid() primary key,
  session_id   uuid    references ldm_sessions(session_id),
  country      text    not null,
  created_at   timestamptz default now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table ldm_sessions     enable row level security;
alter table ldm_answers      enable row level security;
alter table ldm_final_writeups enable row level security;
alter table ldm_suggestions  enable row level security;

create policy anon_insert_sessions
  on ldm_sessions for insert to anon with check (true);

create policy anon_insert_answers
  on ldm_answers for insert to anon with check (true);

create policy anon_insert_writeups
  on ldm_final_writeups for insert to anon with check (true);

create policy anon_insert_suggestions
  on ldm_suggestions for insert to anon with check (true);

-- Para leer datos desde un admin futuro, agregar policies de select para service_role.
