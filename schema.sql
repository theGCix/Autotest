-- =========================================================
-- TOPS Conocimiento — Esquema Supabase (Cloud + Local-first)
-- =========================================================
-- Ejecutar completo en: Supabase → SQL Editor → New query → Run.
--
-- Diseño: cada tabla guarda el registro original de la app tal cual
-- (columna payload jsonb), más una clave primaria y metadatos de
-- sincronización. Esto evita tener que migrar el esquema SQL cada vez
-- que se agrega un campo nuevo en app.js — solo se actualiza el JSON.

create extension if not exists "pgcrypto";

-- ---- función auxiliar: mantiene updated_at al día ----
create or replace function tops_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------
-- Tablas de solo-alta (una tablet nunca edita el registro
-- de otra tablet después de creado: auto tests, evaluaciones,
-- sugerencias, eventos de alta/baja, históricos legacy).
-- ---------------------------------------------------------

create table if not exists self_tests (
  id text primary key,
  payload jsonb not null,
  device_id text,
  synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists supervisor_evals (
  id text primary key,
  payload jsonb not null,
  device_id text,
  synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists chief_evals (
  id text primary key,
  payload jsonb not null,
  device_id text,
  synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists suggestions (
  id text primary key,
  payload jsonb not null,
  device_id text,
  synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists profile_events (
  id text primary key,
  payload jsonb not null,
  device_id text,
  synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists legacy_records (
  id text primary key,
  payload jsonb not null,
  device_id text,
  synced_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Tablas mutables (sí se editan: perfiles de personas y el
-- estado de "alcance" — qué temas sigue evaluando cada quien).
-- ---------------------------------------------------------

create table if not exists profiles (
  code text primary key,
  payload jsonb not null,
  device_id text,
  synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists scope_overrides (
  key text primary key,
  payload jsonb not null,
  device_id text,
  synced_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---- triggers: updated_at siempre lo pone el servidor ----
do $$
declare t text;
begin
  foreach t in array array['self_tests','supervisor_evals','chief_evals','suggestions','profile_events','legacy_records','profiles','scope_overrides']
  loop
    execute format('drop trigger if exists trg_touch_%1$s on %1$s', t);
    execute format('create trigger trg_touch_%1$s before insert or update on %1$s for each row execute function tops_touch_updated_at()', t);
  end loop;
end $$;

-- ---- índices útiles para el panel de supervisión/jefatura ----
create index if not exists idx_self_tests_worker on self_tests ((payload->>'workerCode'));
create index if not exists idx_sup_evals_worker on supervisor_evals ((payload->>'workerCode'));
create index if not exists idx_chief_evals_sup on chief_evals ((payload->>'supervisorCode'));
create index if not exists idx_suggestions_status on suggestions ((payload->>'status'));

-- ---------------------------------------------------------
-- Seguridad (RLS)
-- ---------------------------------------------------------
-- Estas tablets están en red aislada/controlada (VLAN dedicada, Kiosk
-- Mode) y cada una inicia sesión con su propia cuenta técnica de
-- Supabase Auth (ver README_SYNC.md). Por eso la política aquí es:
-- "cualquier usuario autenticado (una tablet o el panel admin) puede
-- leer y escribir" — NO el público/anónimo. Es un punto de partida
-- razonable para un solo sitio de planta; si más adelante hay varias
-- plantas/departamentos que no deban ver los datos entre sí, agregar
-- una columna "site_id" y condicionar estas políticas con ella.

do $$
declare t text;
begin
  foreach t in array array['self_tests','supervisor_evals','chief_evals','suggestions','profile_events','legacy_records','profiles','scope_overrides']
  loop
    execute format('alter table %1$s enable row level security', t);
    execute format('drop policy if exists %1$s_rw on %1$s', t);
    execute format(
      'create policy %1$s_rw on %1$s for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- ---------------------------------------------------------
-- Cuentas técnicas de dispositivo (crear manualmente)
-- ---------------------------------------------------------
-- Authentication → Users → Add user, por cada tablet:
--   tablet01@tops-conocimiento.local  (o el correo que definas)
--   contraseña fuerte, guardada en data/sync-config.js de ESA tablet.
-- No uses el código/PIN del operario para esto: es una cuenta del
-- dispositivo, no de una persona.
