-- Correctif 4 : seul le propriétaire peut autoriser l'export Excel (un gérant ne peut pas se l'attribuer).
-- À coller dans SQL Editor puis Run. Sans danger si on le relance.

-- historique de chaque version (personne ne peut le modifier)
create or replace function public.log_record() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- seul le propriétaire peut donner le droit d'export Excel : un gérant ne peut pas se l'attribuer
  if new.collection = 'people' and member_role(new.business_id) = 'manager' then
    new.data := new.data - 'canExport';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  insert into record_history (business_id, collection, id, op, data, by)
    values (new.business_id, new.collection, new.id, tg_op, new.data, auth.uid());
  return new;
end $$;
