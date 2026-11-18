-- Correctif 1 : droits d'accès aux tables (les nouveaux projets Supabase ne les donnent plus par défaut).
-- À coller dans SQL Editor puis Run. Sans danger si on le relance.
grant usage on schema public to anon, authenticated;
grant select on public.businesses, public.members to authenticated;
grant select, insert, update on public.records to authenticated;
grant select on public.record_history to authenticated;
grant execute on function public.member_role(uuid), public.can_write(uuid, text, text, boolean),
  public.create_business(text, text), public.join_business(text, text), public.new_invite_code(uuid) to authenticated;
