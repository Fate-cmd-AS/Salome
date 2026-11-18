-- Salomé : base de données Supabase (à coller une fois dans SQL Editor, puis « Run »).
-- Principe : chaque commerce a ses membres (propriétaire, gérant·e). Les données sont des
-- « enregistrements » (ventes, dépenses, clôtures…) synchronisés en temps réel entre téléphones.
-- Anti-triche : rien ne peut être supprimé, la gérante ne peut pas modifier une clôture, une
-- dépense ou un mouvement de stock déjà envoyé, et chaque version est gardée dans un historique.

create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager')),
  name text not null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table if not exists public.records (
  business_id uuid not null references public.businesses(id) on delete cascade,
  collection text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (business_id, collection, id)
);
create index if not exists records_updated on public.records (business_id, updated_at);

create table if not exists public.record_history (
  hid bigserial primary key,
  business_id uuid not null,
  collection text not null,
  id text not null,
  op text not null,
  data jsonb,
  at timestamptz not null default now(),
  by uuid
);

-- ---------- fonctions d'accès ----------
create or replace function public.member_role(b uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from members where business_id = b and user_id = auth.uid()
$$;

create or replace function public.can_write(b uuid, coll text, rid text, is_insert boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r text := member_role(b);
begin
  if r = 'owner' then return true; end if;
  if r <> 'manager' or r is null then return false; end if;
  -- la gérante peut ajouter : ventes, dépenses, stock, clôture, pointage, journal, sa fiche
  if is_insert then
    return coll in ('sales', 'expenses', 'stockMoves', 'closes', 'attendance', 'log', 'products', 'reminders')
      or (coll = 'people' and rid = auth.uid()::text);
  end if;
  -- et modifier seulement : vente (annulation, confirmation), pointage (départ), rappel (lu/fait), stock d'un article
  return coll in ('sales', 'attendance', 'reminders', 'products');
end $$;

create or replace function public.create_business(p_name text, p_owner_name text) returns json
language plpgsql security definer set search_path = public as $$
declare b uuid; code text;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  loop
    code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
    exit when not exists (select 1 from businesses where invite_code = code);
  end loop;
  insert into businesses (name, invite_code, created_by) values (p_name, code, auth.uid()) returning id into b;
  insert into members (business_id, user_id, role, name) values (b, auth.uid(), 'owner', p_owner_name);
  return json_build_object('business_id', b, 'invite_code', code);
end $$;

create or replace function public.join_business(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  select id into b from businesses where invite_code = upper(trim(p_code));
  if b is null then raise exception 'Code inconnu'; end if;
  insert into members (business_id, user_id, role, name) values (b, auth.uid(), 'manager', p_name)
    on conflict (business_id, user_id) do nothing;
  return b;
end $$;

create or replace function public.new_invite_code(b uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if member_role(b) <> 'owner' then raise exception 'réservé au propriétaire'; end if;
  code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6));
  update businesses set invite_code = code where id = b;
  return code;
end $$;

-- historique de chaque version (personne ne peut le modifier)
create or replace function public.log_record() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  insert into record_history (business_id, collection, id, op, data, by)
    values (new.business_id, new.collection, new.id, tg_op, new.data, auth.uid());
  return new;
end $$;
drop trigger if exists records_history on public.records;
create trigger records_history before insert or update on public.records
  for each row execute function public.log_record();

-- ---------- sécurité (RLS) ----------
alter table public.businesses enable row level security;
alter table public.members enable row level security;
alter table public.records enable row level security;
alter table public.record_history enable row level security;

drop policy if exists biz_read on public.businesses;
create policy biz_read on public.businesses for select using (member_role(id) is not null);
drop policy if exists mem_read on public.members;
create policy mem_read on public.members for select using (member_role(business_id) is not null);
drop policy if exists rec_read on public.records;
create policy rec_read on public.records for select using (member_role(business_id) is not null);
drop policy if exists rec_insert on public.records;
create policy rec_insert on public.records for insert with check (can_write(business_id, collection, id, true));
drop policy if exists rec_update on public.records;
create policy rec_update on public.records for update
  using (can_write(business_id, collection, id, false)) with check (can_write(business_id, collection, id, false));
drop policy if exists hist_read on public.record_history;
create policy hist_read on public.record_history for select using (member_role(business_id) = 'owner');
-- aucune politique DELETE : personne ne peut effacer.

-- droits sur les tables (les nouveaux projets Supabase ne les donnent plus par défaut)
grant usage on schema public to anon, authenticated;
grant select on public.businesses, public.members to authenticated;
grant select, insert, update on public.records to authenticated;
grant select on public.record_history to authenticated;
grant execute on function public.member_role(uuid), public.can_write(uuid, text, text, boolean),
  public.create_business(text, text), public.join_business(text, text), public.new_invite_code(uuid) to authenticated;

-- temps réel
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null; end $$;
