begin;
-- Preserve per-device technical delivery history when an expired subscription is removed.
alter table public.agendamento_push_entregas drop constraint agendamento_push_entregas_subscription_id_fkey;
create index agenda_delivery_device on public.agendamento_push_entregas(subscription_id);
create or replace function public.agenda_filtered(p_from timestamptz,p_to timestamptz,p_filters jsonb default '{}') returns setof public.agendamentos language sql stable security invoker set search_path='' as $$
 select a.* from public.agendamentos a where a.user_id=(select auth.uid()) and a.inicio_em<p_to and a.fim_em>p_from
 and (coalesce(p_filters->>'tipo','')='' or a.tipo=p_filters->>'tipo') and (coalesce(p_filters->>'status','')='' or a.status=p_filters->>'status' or (p_filters->>'status'='ativos' and a.status in ('agendado','confirmado')))
 and (coalesce(p_filters->>'medico_id','')='' or a.medico_id=nullif(p_filters->>'medico_id','')::uuid)
 and (coalesce(p_filters->>'estabelecimento_id','')='' or a.estabelecimento_id=nullif(p_filters->>'estabelecimento_id','')::uuid)
 and (coalesce(p_filters->>'convenio_id','')='' or a.convenio_id=nullif(p_filters->>'convenio_id','')::uuid)
 and (coalesce(p_filters->>'upcoming','')<>'true' or (a.inicio_em>=now() and a.status in ('agendado','confirmado')))
$$;
create or replace function public.agenda_process(p_id uuid,p_token uuid,p_outcome text default null,p_error text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.agendamento_lembretes; a public.agendamentos; subscriptions jsonb;begin
 select * into r from public.agendamento_lembretes where id=p_id;
 if not found then return null;end if;
 -- Lock appointment before reminder, matching the edit/cancel trigger lock order.
 select * into a from public.agendamentos where id=r.agendamento_id for update;
 select * into r from public.agendamento_lembretes where id=p_id for update;
 if r.status<>'processando' or r.reserva is distinct from p_token then return null;end if;
 if a.status not in ('agendado','confirmado') or a.inicio_em<=now() or not exists(select 1 from public.profiles where id=r.user_id and status='active') or exists(select 1 from public.preferencias_notificacao where user_id=r.user_id and (not lembretes_ativos or (r.canal='push' and not push_ativo))) then
 update public.agendamento_lembretes set status='cancelado',reserva=null where id=r.id;return null;end if;
 if r.canal='interno' then
 insert into public.notificacoes(user_id,agendamento_id,lembrete_id,titulo,mensagem) values(r.user_id,a.id,r.id,'Lembrete de saúde','Você tem um compromisso em '||to_char(a.inicio_em at time zone a.timezone,'DD/MM/YYYY, HH24:MI')||'. Abra a agenda para conferir os detalhes.') on conflict(lembrete_id) do nothing;
 update public.agendamento_lembretes set status='concluido',entrega='persistido',processado_em=now(),enviado_em=now() where id=r.id;
 return jsonb_build_object('interno',true);
 end if;
 if p_outcome='sem_dispositivo' and exists(select 1 from public.agendamento_push_entregas where lembrete_id=r.id and status='aceito') then p_outcome:='aceito_pelo_push';end if;
 if p_outcome is not null then
 update public.agendamento_lembretes set status=case when p_outcome in ('aceito_pelo_push','sem_dispositivo') then 'concluido' when tentativas>=4 then 'falhou' else 'pendente' end,entrega=case when p_outcome in ('aceito_pelo_push','sem_dispositivo') then p_outcome else 'falhou' end,executar_em=case when p_outcome='falhou' then now()+make_interval(mins=>power(2,tentativas)::integer) else executar_em end,processado_em=now(),enviado_em=case when p_outcome='aceito_pelo_push' then now() else null end,ultimo_erro=left(p_error,100),reserva=null where id=r.id;
 return jsonb_build_object('finished',true);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]') into subscriptions from public.push_subscriptions s where s.user_id=r.user_id and not exists(select 1 from public.agendamento_push_entregas d where d.subscription_id=s.id and d.lembrete_id=r.id and d.status='aceito');
 return jsonb_build_object('appointment',a.id,'subscriptions',subscriptions,'tag',r.id);
end $$;
commit;
