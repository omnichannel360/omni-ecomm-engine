-- ============================================================
-- Omni Ecomm Engine — schema ecomm_engine
-- Self-hosted Supabase on Hetzner (port 5433)
-- Stage isolation: each stage owns specific tables.
-- ============================================================

create schema if not exists ecomm_engine;
set search_path = ecomm_engine, public;

-- Drop in reverse FK order (idempotent during dev iteration)
drop table if exists ecomm_engine.sku_events cascade;
drop table if exists ecomm_engine.exports cascade;
drop table if exists ecomm_engine.notifications cascade;
drop table if exists ecomm_engine.approvals cascade;
drop table if exists ecomm_engine.audit_results cascade;
drop table if exists ecomm_engine.generated_images cascade;
drop table if exists ecomm_engine.ai_outputs cascade;
drop table if exists ecomm_engine.raw_assets cascade;
drop table if exists ecomm_engine.skus cascade;
drop table if exists ecomm_engine.prompt_templates cascade;
drop table if exists ecomm_engine.brand_settings cascade;
drop table if exists ecomm_engine.settings cascade;

-- ---- Stage 11 — settings (admin owned) ----
create table ecomm_engine.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table ecomm_engine.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  version int not null default 1,
  body text not null,
  schema_json jsonb,
  updated_at timestamptz not null default now()
);

create table ecomm_engine.brand_settings (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  palette jsonb,
  logo_url text,
  voice_guide text,
  updated_at timestamptz not null default now()
);
create unique index on ecomm_engine.brand_settings (client_id);

-- ---- Stage 1 — ingest owned ----
create table ecomm_engine.skus (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  source_url text not null,
  excel_path text,
  status text not null default 'INGESTED',
  current_stage text not null default 'ingest',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on ecomm_engine.skus (status);
create index on ecomm_engine.skus (client_id);

create table ecomm_engine.raw_assets (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references ecomm_engine.skus(id) on delete cascade,
  type text not null check (type in ('scrape','excel','image','other')),
  content_jsonb jsonb,
  file_path text,
  created_at timestamptz not null default now()
);
create index on ecomm_engine.raw_assets (sku_id);

-- ---- Stage 2 — process owned ----
create table ecomm_engine.ai_outputs (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references ecomm_engine.skus(id) on delete cascade,
  copy_jsonb jsonb,
  image_prompts_jsonb jsonb,
  model_used text,
  tokens_in int,
  tokens_out int,
  edited_copy_jsonb jsonb,
  edited_at timestamptz,
  edited_by text,
  created_at timestamptz not null default now()
);
create index on ecomm_engine.ai_outputs (sku_id);

-- ---- Stage 3 — generate owned ----
create table ecomm_engine.generated_images (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references ecomm_engine.skus(id) on delete cascade,
  slot text not null check (slot in ('hero','lifestyle_1','lifestyle_2','lifestyle_3','feature_infographic','trust_slide')),
  model text not null,
  prompt text,
  seed text,
  file_path text,
  width int,
  height int,
  fallback_reason text,
  generated_at timestamptz not null default now()
);
create index on ecomm_engine.generated_images (sku_id);

-- ---- Stage 4 — audit owned ----
create table ecomm_engine.audit_results (
  id uuid primary key default gen_random_uuid(),
  image_id uuid not null references ecomm_engine.generated_images(id) on delete cascade,
  check_name text not null,
  passed boolean not null,
  score numeric,
  reason text,
  created_at timestamptz not null default now()
);
create index on ecomm_engine.audit_results (image_id);

-- ---- Stage 7 — approval owned ----
create table ecomm_engine.approvals (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references ecomm_engine.skus(id) on delete cascade,
  token text not null unique,
  decision text check (decision in ('approved','regenerate','rejected','pending')),
  comments_jsonb jsonb,
  approver_email text,
  approved_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on ecomm_engine.approvals (sku_id);
create index on ecomm_engine.approvals (token);

-- ---- Stage 8 — notify owned ----
create table ecomm_engine.notifications (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid references ecomm_engine.skus(id) on delete set null,
  event text not null,
  channel text not null check (channel in ('email','slack','console')),
  recipient text,
  status text not null default 'pending',
  retry_count int not null default 0,
  error text,
  payload_jsonb jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index on ecomm_engine.notifications (sku_id);
create index on ecomm_engine.notifications (status);

-- ---- Stage 9 — export owned ----
create table ecomm_engine.exports (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references ecomm_engine.skus(id) on delete cascade,
  format text not null check (format in ('canva_csv','amazon_aplus','zip')),
  file_path text,
  downloaded_at timestamptz,
  created_at timestamptz not null default now()
);
create index on ecomm_engine.exports (sku_id);

-- ---- Audit trail (cross-stage read) ----
create table ecomm_engine.sku_events (
  id bigserial primary key,
  sku_id uuid not null references ecomm_engine.skus(id) on delete cascade,
  from_state text,
  to_state text,
  actor text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index on ecomm_engine.sku_events (sku_id);
create index on ecomm_engine.sku_events (created_at desc);

-- updated_at triggers
create or replace function ecomm_engine.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger skus_touch before update on ecomm_engine.skus
  for each row execute function ecomm_engine.touch_updated_at();
create trigger settings_touch before update on ecomm_engine.settings
  for each row execute function ecomm_engine.touch_updated_at();
create trigger brand_settings_touch before update on ecomm_engine.brand_settings
  for each row execute function ecomm_engine.touch_updated_at();

-- seed: minimal settings
insert into ecomm_engine.settings (key, value) values
  ('schema_version', to_jsonb(1)),
  ('image_generator_primary', '"banana"'),
  ('image_generator_fallback_enabled', 'false')
on conflict (key) do nothing;
