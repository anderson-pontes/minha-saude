begin read only; set local statement_timeout='90s';
do $actor$ declare actor uuid;begin select id into actor from public.profiles where role='admin' and status='active' order by created_at limit 1;perform set_config('request.jwt.claim.sub',actor::text,true);end $actor$;
set local role authenticated;
do $measure$ declare started timestamptz; result jsonb; samples jsonb:='[]';sample integer;begin
for sample in 1..3 loop
 started:=clock_timestamp(); result:=public.dashboard_network('recent',6);
 samples:=samples||jsonb_build_array(jsonb_build_object('operation','recent','sample',sample,'database_ms',round((extract(epoch from clock_timestamp()-started)*1000)::numeric,2),'response_bytes',octet_length(result::text),'items',jsonb_array_length(coalesce(result->'items','[]'))));
end loop;
for sample in 1..3 loop
 started:=clock_timestamp(); result:=public.dashboard_network('favorites',4);
 samples:=samples||jsonb_build_array(jsonb_build_object('operation','favorites','sample',sample,'database_ms',round((extract(epoch from clock_timestamp()-started)*1000)::numeric,2),'response_bytes',octet_length(result::text),'items',jsonb_array_length(coalesce(result->'items','[]'))));
end loop;
for sample in 1..3 loop
 started:=clock_timestamp(); result:=public.network_summary();
 samples:=samples||jsonb_build_array(jsonb_build_object('operation','summary','sample',sample,'database_ms',round((extract(epoch from clock_timestamp()-started)*1000)::numeric,2),'response_bytes',octet_length(result::text),'items',jsonb_array_length(coalesce(result->'items','[]'))));
end loop;
for sample in 1..3 loop
 started:=clock_timestamp(); result:=public.search_network('{}',1,6);
 samples:=samples||jsonb_build_array(jsonb_build_object('operation','legacy_recent','sample',sample,'database_ms',round((extract(epoch from clock_timestamp()-started)*1000)::numeric,2),'response_bytes',octet_length(result::text),'items',jsonb_array_length(coalesce(result->'items','[]'))));
end loop;
for sample in 1..3 loop
 started:=clock_timestamp(); result:=public.search_network('{"favorites":"true"}',1,4);
 samples:=samples||jsonb_build_array(jsonb_build_object('operation','legacy_favorites','sample',sample,'database_ms',round((extract(epoch from clock_timestamp()-started)*1000)::numeric,2),'response_bytes',octet_length(result::text),'items',jsonb_array_length(coalesce(result->'items','[]'))));
end loop;
perform set_config('minha_saude.benchmark',samples::text,true);end $measure$;
select current_setting('minha_saude.benchmark')::jsonb measurements;commit;