-- MiraFlow AI — Schéma initial (multi-tenant SaaS messagerie QR)
create type plan_id as enum ('starter', 'business', 'agency', 'enterprise');
create type org_status as enum ('trial', 'active', 'past_due', 'suspended', 'deleted');
create type app_role as enum ('owner', 'admin', 'supervisor', 'agent', 'analyst');
create type session_status as enum ('init', 'qr_required', 'connecting', 'connected', 'unstable', 'disconnected', 'revoked');
create type conv_status as enum ('new', 'open', 'pending', 'resolved', 'archived');
create type msg_direction as enum ('in', 'out');
create type msg_type as enum ('text', 'image', 'audio', 'video', 'document', 'carousel', 'location');
create type msg_status as enum ('queued', 'sent', 'delivered', 'read', 'failed');
create type campaign_status as enum ('draft', 'review', 'scheduled', 'running', 'paused', 'stopped', 'done');
create type agent_mode as enum ('suggestion', 'autonome');
create type suggestion_status as enum ('pending', 'accepted', 'modified', 'rejected');
create type request_status as enum ('pending', 'approved', 'rejected');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  sector text,
  size text,
  country text default 'Tunisie',
  currency text default 'TND',
  plan plan_id not null default 'starter',
  status org_status not null default 'trial',
  trial_ends_at timestamptz default now() + interval '14 days',
  mrr numeric(10,2) default 0,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  email text not null,
  role app_role not null default 'agent',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table sessions_qr (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  phone text,
  device text,
  status session_status not null default 'init',
  latency_ms int default 0,
  last_seen_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  phone text not null,
  name text not null,
  stage text default 'Nouveau',
  score int default 0,
  tags text[] default '{}',
  segment text,
  consent_marketing boolean default true,
  consent_at timestamptz default now(),
  unsubscribed boolean default false,
  notes text default '',
  created_at timestamptz not null default now(),
  unique (org_id, phone)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  session_id uuid references sessions_qr(id) on delete set null,
  status conv_status not null default 'new',
  assignee_id uuid references profiles(id) on delete set null,
  unread_count int default 0,
  last_message_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction msg_direction not null,
  type msg_type not null default 'text',
  body text default '',
  media_url text,
  status msg_status not null default 'queued',
  reply_to_id uuid references messages(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_messages_conv on messages(conversation_id, created_at);
create index idx_conv_org on conversations(org_id, last_message_at desc);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  goal text,
  status campaign_status not null default 'draft',
  audience jsonb default '{}',
  content text default '',
  media jsonb default '{}',
  scheduled_at timestamptz,
  timezone text default 'Africa/Tunis',
  window_start time, window_end time,
  follow_up boolean default false,
  follow_up_msg text,
  stop_on_reply boolean default false,
  four_eyes boolean default false,
  stats jsonb default '{"eligible":0,"sent":0,"delivered":0,"read":0,"replies":0,"unsub":0}',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text default '',
  active boolean default false,
  version int default 1,
  graph jsonb not null default '{"nodes":[],"edges":[]}',
  runs int default 0,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);
create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  status text not null default 'running',
  log jsonb default '[]',
  error text,
  started_at timestamptz default now(),
  finished_at timestamptz
);

create table ai_agents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  name text not null,
  mode agent_mode not null default 'suggestion',
  threshold int default 85,
  active boolean default true,
  config jsonb default '{}',
  unique (org_id, key)
);

create table ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  agent_id uuid references ai_agents(id) on delete set null,
  body text not null,
  confidence numeric(4,3),
  status suggestion_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table knowledge_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  type text,
  size_kb int,
  status text default 'indexed',
  chunks int default 0,
  version int default 1,
  created_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  number text not null,
  plan plan_id not null,
  amount numeric(10,2) not null,
  currency text default 'TND',
  status text default 'paid',
  period_start date, period_end date,
  created_at timestamptz not null default now()
);

create table signup_requests (
  id uuid primary key default gen_random_uuid(),
  business text not null,
  contact text not null,
  email text not null,
  phone text,
  country text default 'Tunisie',
  plan plan_id not null default 'starter',
  kind text default 'trial',
  message text,
  status request_status not null default 'pending',
  reject_reason text,
  created_at timestamptz not null default now()
);

create table promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  kind text not null default 'percent',
  value numeric(10,2) not null,
  plan plan_id,
  max_uses int default 100,
  used int default 0,
  expires_at timestamptz,
  active boolean default true,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  org_id uuid references organizations(id) on delete cascade,
  actor text,
  action text not null,
  target text,
  meta jsonb default '{}',
  created_at timestamptz not null default now()
);

create or replace function public.my_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table sessions_qr enable row level security;
alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table campaigns enable row level security;
alter table workflows enable row level security;
alter table workflow_runs enable row level security;
alter table ai_agents enable row level security;
alter table ai_suggestions enable row level security;
alter table knowledge_docs enable row level security;
alter table invoices enable row level security;
alter table signup_requests enable row level security;
alter table promo_codes enable row level security;
alter table audit_log enable row level security;

create policy org_isolation on organizations for all using (id = public.my_org_id()) with check (id = public.my_org_id());
create policy org_isolation on profiles for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy org_isolation on sessions_qr for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy org_isolation on contacts for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy org_isolation on conversations for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy org_isolation on messages for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy org_isolation on campaigns for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy org_isolation on workflows for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy org_isolation on workflow_runs for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy org_isolation on ai_agents for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy org_isolation on ai_suggestions for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy org_isolation on knowledge_docs for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy org_isolation on invoices for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy org_isolation on audit_log for all using (org_id = public.my_org_id()) with check (org_id = public.my_org_id());
create policy read_promo on promo_codes for select using (auth.role() = 'authenticated');
create policy insert_signup on signup_requests for insert with check (true);

insert into organizations (name, slug, sector, size, plan, status, mrr)
values ('Pâtisserie Dar El Baraka', 'dar-el-baraka', 'Commerce alimentaire', '1-10', 'business', 'active', 79);

insert into ai_agents (org_id, key, name, mode, threshold)
select o.id, k, n, 'suggestion', 85 from organizations o,
  (values ('sales','Commercial'),('support','Support'),('tech','Technique'),
          ('rdv','Rendez-vous'),('supervisor','Superviseur'),('analyst','Analyste'),
          ('translate','Traduction'),('vision','Analyse d''images')) as t(k,n)
where o.slug = 'dar-el-baraka';

insert into sessions_qr (org_id, name, phone, device, status, latency_ms)
select o.id, 'Principal', '+216 98 456 123', 'iPhone 15 Pro', 'connected', 42 from organizations o where o.slug = 'dar-el-baraka';

insert into promo_codes (code, kind, value, plan, max_uses, used, expires_at, active) values
  ('BIENVENUE-20', 'percent', 20, null, 100, 14, now() + interval '60 days', true),
  ('RAMADAN-25', 'percent', 25, null, 50, 31, now() + interval '30 days', true),
  ('AGENCE-10', 'percent', 10, 'agency', 200, 8, now() + interval '90 days', true),
  ('ETE-15', 'percent', 15, null, 50, 50, now() - interval '10 days', false),
  ('FIDELITE-30', 'amount', 30, 'business', 40, 22, now() + interval '45 days', true);

insert into signup_requests (business, contact, email, phone, plan, kind, message) values
  ('Clinique Dentaire Sourire', 'Dr Ines Trabelsi', 'contact@clinique-sourire.tn', '+216 71 452 890', 'business', 'trial', 'Automatiser les confirmations de rendez-vous.'),
  ('Boutique Médina Home', 'Sami Ben Ammar', 'sami@medinahome.com', '+216 98 233 145', 'starter', 'demo', 'Démo du studio campagnes.'),
  ('Agence Voyage Carthage', 'Leila Mansour', 'leila@carthage-travel.tn', '+216 70 685 210', 'agency', 'trial', '12 comptes clients, marque blanche requise.');;
