-- Correctif 2 : génération du code d'invitation sans l'extension pgcrypto.
-- À coller dans SQL Editor puis Run. Sans danger si on le relance.

create or replace function public.create_business(p_name text, p_owner_name text) returns json
language plpgsql security definer set search_path = public as $$
declare b uuid; code text;
begin
  if auth.uid() is null then raise exception 'non connecté'; end if;
  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from businesses where invite_code = code);
  end loop;
  insert into businesses (name, invite_code, created_by) values (p_name, code, auth.uid()) returning id into b;
  insert into members (business_id, user_id, role, name) values (b, auth.uid(), 'owner', p_owner_name);
  return json_build_object('business_id', b, 'invite_code', code);
end $$;

create or replace function public.new_invite_code(b uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if member_role(b) <> 'owner' then raise exception 'réservé au propriétaire'; end if;
  code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  update businesses set invite_code = code where id = b;
  return code;
end $$;

