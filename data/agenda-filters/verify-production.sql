begin read only;
do $$begin
 if not exists(select 1 from public.profiles where status='active') then raise exception 'No active member available for verification';end if;
 perform set_config('request.jwt.claim.sub',(select id::text from public.profiles where status='active' order by id limit 1),true);
end$$;
set local role authenticated;
with recursive pages(category,n,payload) as (
 select category,1,public.network_lookup_page(category) from unnest(array['doctors','establishments','health_plans']) category
 union all
 select category,n+1,public.network_lookup_page(category,'',payload#>>'{next_cursor,name}',(payload#>>'{next_cursor,id}')::uuid)
 from pages where (payload->>'has_more')::boolean and n<1000
), records as (
 select category,item->>'id' id from pages cross join lateral jsonb_array_elements(payload->'items') item
)
select p.category,count(*) pages,max((payload->>'total')::int) total,
 (select count(*) from records r where r.category=p.category) loaded,
 (select count(distinct id) from records r where r.category=p.category) unique_loaded,
 bool_or(not (payload->>'has_more')::boolean) reached_end,
 max(jsonb_array_length(payload->'items')) maximum_page_size
from pages p group by p.category order by p.category;
