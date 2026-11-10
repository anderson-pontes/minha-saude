begin;
-- Independent catalogue pagination: never join personal appointments or filter by historical author.
create function public.network_lookup_page(
 p_category text,p_q text default '',p_after_name text default null,p_after_id uuid default null,p_limit integer default 20
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; page_size integer:=least(greatest(coalesce(p_limit,20),1),50);
begin
 if not (select private.is_active_member()) then raise insufficient_privilege;end if;
 if p_category not in ('specialties','doctors','health_plans','establishments') then raise exception 'Invalid lookup category' using errcode='22023';end if;
 if (p_after_name is null)<>(p_after_id is null) then raise exception 'Incomplete catalogue cursor' using errcode='22023';end if;
 execute format($query$
  with matching as materialized (
   select id,name,public.network_normalize(name) sort_name from public.%I
   where position(public.network_normalize($1) in public.network_normalize(name))>0
  ), page as materialized (
   select * from matching where $2::text is null or (sort_name,id)>($2,$3::uuid)
   order by sort_name,id limit $4+1
  ), visible as materialized (select * from page order by sort_name,id limit $4)
  select jsonb_build_object(
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by sort_name,id) from visible),'[]'::jsonb),
   'total',(select count(*) from matching),
   'has_more',(select count(*) from page)>$4,
   'next_cursor',case when (select count(*) from page)>$4 then (select jsonb_build_object('name',sort_name,'id',id) from visible order by sort_name desc,id desc limit 1) else null end
  )
 $query$,p_category) into result using left(trim(coalesce(p_q,'')),200),p_after_name,p_after_id,page_size;
 return result;
end $$;
revoke all on function public.network_lookup_page(text,text,text,uuid,integer) from public,anon;
grant execute on function public.network_lookup_page(text,text,text,uuid,integer) to authenticated;
commit;
