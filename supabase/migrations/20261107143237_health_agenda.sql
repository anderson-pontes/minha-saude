begin;
create table public.preferencias_notificacao (
 user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 lembretes_ativos boolean not null default true, push_ativo boolean not null default false,
 antecedencias_padrao integer[] not null default '{1440}', timezone text not null default 'America/Belem',
 duracao_padrao integer not null default 30 check(duracao_padrao between 5 and 1440), updated_at timestamptz not null default now(),
 check(cardinality(antecedencias_padrao)<=12 and 0 < all(antecedencias_padrao) and 525600 >= all(antecedencias_padrao))
);
create table public.agendamentos (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 tipo text not null check(tipo in ('consulta','exame','retorno','procedimento','vacinacao','outro')),
 titulo text not null check(length(trim(titulo)) between 1 and 200), descricao text not null default '' check(length(descricao)<=4000),
 inicio_em timestamptz not null, fim_em timestamptz not null, timezone text not null default 'America/Belem',
 medico_id uuid references public.doctors(id) on delete set null, especialidade_id uuid references public.specialties(id) on delete set null,
 estabelecimento_id uuid references public.establishments(id) on delete set null, convenio_id uuid references public.health_plans(id) on delete set null,
 status text not null default 'agendado' check(status in ('agendado','confirmado','realizado','cancelado','nao_compareceu')),
 protocolo text not null default '' check(length(protocolo)<=200), observacoes text not null default '' check(length(observacoes)<=8000),
 orientacoes_preparo text not null default '' check(length(orientacoes_preparo)<=8000),
 antecedencias integer[] not null default '{1440}', revisao integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,user_id), check(fim_em>inicio_em and fim_em<=inicio_em+interval '7 days'),
 check(cardinality(antecedencias)<=12 and 0 < all(antecedencias) and 525600 >= all(antecedencias))
);
create index agenda_user_start on public.agendamentos(user_id,inicio_em);
create index agenda_user_status on public.agendamentos(user_id,status,inicio_em);
create index agenda_doctor on public.agendamentos(medico_id) where medico_id is not null;
create index agenda_establishment on public.agendamentos(estabelecimento_id) where estabelecimento_id is not null;
create index agenda_plan on public.agendamentos(convenio_id) where convenio_id is not null;
create index agenda_specialty on public.agendamentos(especialidade_id) where especialidade_id is not null;
create table public.agendamento_lembretes (
 id uuid primary key default gen_random_uuid(), agendamento_id uuid not null, user_id uuid not null,
 revisao integer not null, antecedencia_minutos integer not null check(antecedencia_minutos>0), executar_em timestamptz not null,
 canal text not null check(canal in ('interno','push')), status text not null default 'pendente' check(status in ('pendente','processando','concluido','cancelado','falhou')),
 tentativas integer not null default 0, reservado_em timestamptz, reserva uuid, processado_em timestamptz, enviado_em timestamptz,
 entrega text not null default 'nao_enviado' check(entrega in ('nao_enviado','persistido','aceito_pelo_push','sem_dispositivo','falhou')),
 ultimo_erro text, created_at timestamptz not null default now(),
 foreign key(agendamento_id,user_id) references public.agendamentos(id,user_id) on delete cascade,
 unique(agendamento_id,revisao,antecedencia_minutos,canal)
);
create index lembretes_due on public.agendamento_lembretes(executar_em,id) where status in ('pendente','processando');
create index lembretes_owner on public.agendamento_lembretes(user_id,agendamento_id);
create table public.notificacoes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 agendamento_id uuid references public.agendamentos(id) on delete cascade, lembrete_id uuid unique references public.agendamento_lembretes(id) on delete cascade,
 titulo text not null, mensagem text not null, tipo text not null default 'lembrete', lida_em timestamptz, created_at timestamptz not null default now()
);
create index notificacoes_user_date on public.notificacoes(user_id,created_at desc,id);
create index notificacoes_unread on public.notificacoes(user_id) where lida_em is null;
create index notificacoes_appointment on public.notificacoes(agendamento_id);
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 endpoint text not null unique check(length(endpoint) between 20 and 2048), p256dh text not null check(length(p256dh) between 40 and 200),
 auth text not null check(length(auth) between 10 and 100), dispositivo text not null default '' check(length(dispositivo)<=100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index push_user on public.push_subscriptions(user_id);
create table public.agendamento_push_entregas (
 lembrete_id uuid not null references public.agendamento_lembretes(id) on delete cascade,
 subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
 status text not null check(status in ('aceito','falhou','expirado')), tentativas integer not null default 1,
 updated_at timestamptz not null default now(), primary key(lembrete_id,subscription_id)
);
alter table public.agendamento_push_entregas enable row level security;
alter table public.agendamento_push_entregas force row level security;
revoke all on public.agendamento_push_entregas from public,anon,authenticated;
-- Expose only each user's data; administrative catalogue rights never grant agenda access.
do $$declare t text;begin
 foreach t in array array['agendamentos','preferencias_notificacao','agendamento_lembretes','notificacoes','push_subscriptions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('alter table public.%I force row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy own_read on public.%I for select to authenticated using(user_id=(select auth.uid()) and (select private.is_active_member()))',t);
 end loop;
 foreach t in array array['agendamentos','preferencias_notificacao'] loop
 execute format('grant insert,update,delete on public.%I to authenticated',t);
 execute format('create policy own_insert on public.%I for insert to authenticated with check(user_id=(select auth.uid()) and (select private.is_active_member()))',t);
 execute format('create policy own_update on public.%I for update to authenticated using(user_id=(select auth.uid()) and (select private.is_active_member())) with check(user_id=(select auth.uid()) and (select private.is_active_member()))',t);
 execute format('create policy own_delete on public.%I for delete to authenticated using(user_id=(select auth.uid()) and (select private.is_active_member()))',t);
 end loop;
end $$;
grant update(lida_em) on public.notificacoes to authenticated;
create policy own_update on public.notificacoes for update to authenticated using(user_id=(select auth.uid()) and (select private.is_active_member())) with check(user_id=(select auth.uid()) and (select private.is_active_member()));

create function private.agenda_validate() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Fuso horário inválido';end if;
 if TG_TABLE_NAME='agendamentos' then
  if TG_OP='UPDATE' then new.revisao:=old.revisao+1;new.user_id:=old.user_id;new.created_at:=old.created_at;end if;
  new.antecedencias:=array(select distinct x from unnest(new.antecedencias) x order by x);
 end if;
 new.updated_at:=now();return new;
end $$;
revoke all on function private.agenda_validate() from public,anon,authenticated;
create trigger agenda_validate before insert or update on public.agendamentos for each row execute function private.agenda_validate();
create trigger agenda_preferences_validate before insert or update on public.preferencias_notificacao for each row execute function private.agenda_validate();

create function private.agenda_sync_reminders() returns trigger language plpgsql security definer set search_path='' as $$
declare offset_minutes integer; channel_name text;
begin
 -- Trigger is not a general privileged API: its owner must match the authenticated writer.
 if auth.uid() is not null and new.user_id<>auth.uid() then raise exception 'Acesso não permitido' using errcode='42501';end if;
 if TG_OP='UPDATE' and new.inicio_em=old.inicio_em and new.status=old.status and new.antecedencias=old.antecedencias then return new;end if;
 update public.agendamento_lembretes set status='cancelado',reserva=null where agendamento_id=new.id and status in ('pendente','processando');
 if new.status in ('agendado','confirmado') and new.inicio_em>now() then
  foreach offset_minutes in array new.antecedencias loop
   foreach channel_name in array array['interno','push'] loop
    insert into public.agendamento_lembretes(agendamento_id,user_id,revisao,antecedencia_minutos,executar_em,canal)
    values(new.id,new.user_id,new.revisao,offset_minutes,new.inicio_em-make_interval(mins=>offset_minutes),channel_name) on conflict do nothing;
   end loop;
  end loop;
 end if;
 if TG_OP='UPDATE' and new.inicio_em<>old.inicio_em then
  insert into public.notificacoes(user_id,agendamento_id,titulo,mensagem,tipo) values(new.user_id,new.id,'Agendamento atualizado','Confira a nova data e horário na sua agenda.','reagendamento');
 end if;
 return new;
end $$;
revoke all on function private.agenda_sync_reminders() from public,anon,authenticated;
create trigger agenda_sync_reminders after insert or update on public.agendamentos for each row execute function private.agenda_sync_reminders();

create function public.agenda_save(p_id uuid,p_data jsonb,p_revision integer default null,p_allow_conflict boolean default false) returns uuid language plpgsql security invoker set search_path='' as $$
declare existing public.agendamentos; starts timestamptz; ends timestamptz; offsets integer[];
begin
 if not (select private.is_active_member()) then raise exception 'Acesso não permitido' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'/agenda',0));
 select * into existing from public.agendamentos where id=p_id for update;
 if existing.id is not null and p_revision is null then return existing.id;end if;
 if p_revision is not null and (existing.id is null or existing.revisao<>p_revision) then raise exception 'Este compromisso foi alterado em outra sessão. Reabra os detalhes antes de salvar.';end if;
 starts:=(p_data->>'inicio_em')::timestamptz;
 ends:=coalesce(nullif(p_data->>'fim_em','')::timestamptz,starts+make_interval(mins=>coalesce((select duracao_padrao from public.preferencias_notificacao where user_id=auth.uid()),30)));
 if not p_allow_conflict and coalesce(p_data->>'status','agendado') in ('agendado','confirmado') and exists(select 1 from public.agendamentos where id<>p_id and status in ('agendado','confirmado') and inicio_em<ends and fim_em>starts) then raise exception 'Conflito de horário: já existe um compromisso neste intervalo.' using errcode='P0001';end if;
 offsets:=case when p_data ? 'antecedencias' then array(select jsonb_array_elements_text(p_data->'antecedencias')::integer) else coalesce((select antecedencias_padrao from public.preferencias_notificacao where user_id=auth.uid()),array[1440]) end;
 insert into public.agendamentos(id,tipo,titulo,descricao,inicio_em,fim_em,timezone,medico_id,especialidade_id,estabelecimento_id,convenio_id,status,protocolo,observacoes,orientacoes_preparo,antecedencias)
 values(p_id,p_data->>'tipo',trim(p_data->>'titulo'),coalesce(p_data->>'descricao',''),starts,ends,coalesce(p_data->>'timezone','America/Belem'),nullif(p_data->>'medico_id','')::uuid,nullif(p_data->>'especialidade_id','')::uuid,nullif(p_data->>'estabelecimento_id','')::uuid,nullif(p_data->>'convenio_id','')::uuid,coalesce(p_data->>'status','agendado'),coalesce(p_data->>'protocolo',''),coalesce(p_data->>'observacoes',''),coalesce(p_data->>'orientacoes_preparo',''),offsets)
 on conflict(id) do update set tipo=excluded.tipo,titulo=excluded.titulo,descricao=excluded.descricao,inicio_em=excluded.inicio_em,fim_em=excluded.fim_em,timezone=excluded.timezone,medico_id=excluded.medico_id,especialidade_id=excluded.especialidade_id,estabelecimento_id=excluded.estabelecimento_id,convenio_id=excluded.convenio_id,status=excluded.status,protocolo=excluded.protocolo,observacoes=excluded.observacoes,orientacoes_preparo=excluded.orientacoes_preparo,antecedencias=excluded.antecedencias;
 return p_id;
end $$;

create function public.agenda_filtered(p_from timestamptz,p_to timestamptz,p_filters jsonb default '{}') returns setof public.agendamentos language sql stable security invoker set search_path='' as $$
 select a.* from public.agendamentos a where a.user_id=(select auth.uid()) and a.inicio_em<p_to and a.fim_em>p_from
 and (coalesce(p_filters->>'tipo','')='' or a.tipo=p_filters->>'tipo') and (coalesce(p_filters->>'status','')='' or a.status=p_filters->>'status')
 and (coalesce(p_filters->>'medico_id','')='' or a.medico_id=nullif(p_filters->>'medico_id','')::uuid)
 and (coalesce(p_filters->>'estabelecimento_id','')='' or a.estabelecimento_id=nullif(p_filters->>'estabelecimento_id','')::uuid)
 and (coalesce(p_filters->>'convenio_id','')='' or a.convenio_id=nullif(p_filters->>'convenio_id','')::uuid)
 and (coalesce(p_filters->>'upcoming','')<>'true' or (a.inicio_em>=now() and a.status in ('agendado','confirmado')))
$$;
create function public.agenda_browse(p_from timestamptz,p_to timestamptz,p_filters jsonb default '{}',p_page integer default 1,p_size integer default 100) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;begin
 if p_to<=p_from or p_to-p_from>interval '370 days' then raise exception 'Selecione um período de até um ano';end if;
 with filtered as materialized(select * from public.agenda_filtered(p_from,p_to,p_filters)), rows as (
 select a.*,d.name medico,e.name estabelecimento,h.name convenio from filtered a left join public.doctors d on d.id=a.medico_id left join public.establishments e on e.id=a.estabelecimento_id left join public.health_plans h on h.id=a.convenio_id order by a.inicio_em,a.id limit least(greatest(p_size,1),200) offset (greatest(p_page,1)-1)*least(greatest(p_size,1),200))
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(r) order by r.inicio_em,r.id) from rows r),'[]'),'total',(select count(*) from filtered),'summary',(select jsonb_build_object('proximos',count(*) filter(where inicio_em>=now() and status in ('agendado','confirmado')),'consultas',count(*) filter(where tipo='consulta' and status in ('agendado','confirmado')),'exames',count(*) filter(where tipo='exame' and status in ('agendado','confirmado')),'realizados',count(*) filter(where status='realizado')) from filtered)) into result;
 return result;
end $$;
create function public.agenda_detail(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(a)||jsonb_build_object('medico',d.name,'especialidade',s.name,'estabelecimento',e.name,'convenio',h.name,
 'addresses',coalesce((select jsonb_agg(to_jsonb(x)) from public.addresses x where x.establishment_id=a.estabelecimento_id),'[]'),
 'contacts',coalesce((select jsonb_agg(to_jsonb(x)) from public.contacts x where x.establishment_id=a.estabelecimento_id),'[]'),
 'reminders',coalesce((select jsonb_agg(to_jsonb(r) order by r.executar_em) from public.agendamento_lembretes r where r.agendamento_id=a.id and r.status<>'cancelado'),'[]'))
 from public.agendamentos a left join public.doctors d on d.id=a.medico_id left join public.specialties s on s.id=a.especialidade_id left join public.establishments e on e.id=a.estabelecimento_id left join public.health_plans h on h.id=a.convenio_id where a.id=p_id
$$;
create function public.agenda_status(p_id uuid,p_status text,p_revision integer) returns boolean language plpgsql security invoker set search_path='' as $$
begin update public.agendamentos set status=p_status where id=p_id and revisao=p_revision;if not found then raise exception 'Compromisso indisponível ou alterado em outra sessão';end if;return true;end $$;
create function public.agenda_delete(p_id uuid,p_revision integer) returns boolean language plpgsql security invoker set search_path='' as $$
begin delete from public.agendamentos where id=p_id and revisao=p_revision;if not found then raise exception 'Compromisso indisponível ou alterado em outra sessão';end if;return true;end $$;
create function public.agenda_preferences(p_data jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;begin
 if p_data is not null then
 insert into public.preferencias_notificacao(user_id) values(auth.uid()) on conflict do nothing;
 update public.preferencias_notificacao set lembretes_ativos=coalesce((p_data->>'lembretes_ativos')::boolean,lembretes_ativos),push_ativo=coalesce((p_data->>'push_ativo')::boolean,push_ativo),timezone=coalesce(p_data->>'timezone',timezone),duracao_padrao=coalesce((p_data->>'duracao_padrao')::integer,duracao_padrao),antecedencias_padrao=case when p_data ? 'antecedencias_padrao' then array(select jsonb_array_elements_text(p_data->'antecedencias_padrao')::integer) else antecedencias_padrao end where user_id=auth.uid();
 end if;
 select to_jsonb(p) into result from public.preferencias_notificacao p where user_id=auth.uid();
 return coalesce(result,jsonb_build_object('lembretes_ativos',true,'push_ativo',false,'timezone','America/Belem','antecedencias_padrao',array[1440],'duracao_padrao',30));
end $$;
create function public.agenda_notifications(p_page integer default 1) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc,n.id) from (select * from public.notificacoes order by created_at desc,id limit 20 offset (greatest(p_page,1)-1)*20)n),'[]'),'total',(select count(*) from public.notificacoes),'unread',(select count(*) from public.notificacoes where lida_em is null))
$$;
create function public.agenda_upcoming() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('week_count',(select count(*) from public.agendamentos where inicio_em>=now() and inicio_em<now()+interval '7 days' and status in ('agendado','confirmado')),
 'items',coalesce((select jsonb_agg(to_jsonb(r) order by r.inicio_em) from (select a.*,d.name medico,e.name estabelecimento from public.agendamentos a left join public.doctors d on d.id=a.medico_id left join public.establishments e on e.id=a.estabelecimento_id where a.inicio_em>=now() and a.status in ('agendado','confirmado') order by a.inicio_em,a.id limit 5)r),'[]'))
$$;
create function public.agenda_read_notifications(p_id uuid default null) returns void language sql security invoker set search_path='' as $$
 update public.notificacoes set lida_em=now() where lida_em is null and (p_id is null or id=p_id)
$$;
-- Registration is intentionally mediated by a restricted definer: clients cannot forge a user_id,
-- move another user's endpoint, or send arbitrary hosts to a privileged HTTP client.
create function private.agenda_subscription(p_data jsonb,p_remove boolean) returns void language plpgsql security definer set search_path='' as $$
declare endpoint_url text:=p_data->>'endpoint';begin
 if not (select private.is_active_member()) then raise exception 'Acesso não permitido' using errcode='42501';end if;
 if p_remove then delete from public.push_subscriptions where user_id=auth.uid() and endpoint=endpoint_url;return;end if;
 if endpoint_url !~ '^https://([a-z0-9-]+\.)*(push\.services\.mozilla\.com|fcm\.googleapis\.com|web\.push\.apple\.com|notify\.windows\.com)/' then raise exception 'Serviço de push não suportado';end if;
 if (select count(*) from public.push_subscriptions where user_id=auth.uid())>=10 and not exists(select 1 from public.push_subscriptions where user_id=auth.uid() and endpoint=endpoint_url) then raise exception 'Limite de dez dispositivos atingido';end if;
 insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,dispositivo) values(auth.uid(),endpoint_url,p_data->'keys'->>'p256dh',p_data->'keys'->>'auth',left(coalesce(p_data->>'dispositivo','Navegador'),100))
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,updated_at=now() where public.push_subscriptions.user_id=auth.uid();
 if not found then raise exception 'Dispositivo associado a outra conta. Desative o push na conta anterior.';end if;
end $$;
revoke all on function private.agenda_subscription(jsonb,boolean) from public,anon;
grant execute on function private.agenda_subscription(jsonb,boolean) to authenticated;
create function public.agenda_subscription(p_data jsonb,p_remove boolean default false) returns void language sql security invoker set search_path='' as $$select private.agenda_subscription(p_data,p_remove)$$;

-- Only service_role can claim/finish work. No browser can generate notifications or send push.
create function public.agenda_claim(p_limit integer default 30) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;begin
 update public.agendamento_lembretes set status='falhou',ultimo_erro='lease_expired_after_max_attempts',reserva=null where status='processando' and tentativas>=4 and reservado_em<now()-interval '5 minutes';
 update public.agendamento_lembretes r set status='cancelado',reserva=null where status in ('pendente','processando') and exists(select 1 from public.agendamentos a where a.id=r.agendamento_id and (a.status not in ('agendado','confirmado') or a.inicio_em<=now()));
 with due as(select r.id from public.agendamento_lembretes r join public.agendamentos a on a.id=r.agendamento_id join public.profiles m on m.id=r.user_id and m.status='active' left join public.preferencias_notificacao p on p.user_id=r.user_id
 where r.executar_em<=now() and a.inicio_em>now() and a.status in ('agendado','confirmado') and coalesce(p.lembretes_ativos,true)
 and (r.canal='interno' or coalesce(p.push_ativo,false)) and r.tentativas<4
 and (r.status='pendente' or (r.status='processando' and r.reservado_em<now()-interval '5 minutes'))
 order by r.executar_em,r.id limit least(greatest(p_limit,1),50) for update of r skip locked), claimed as(
 update public.agendamento_lembretes r set status='processando',tentativas=r.tentativas+1,reservado_em=now(),reserva=gen_random_uuid() from due where r.id=due.id returning r.*)
 select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from claimed c;
 return result;
end $$;
create function public.agenda_process(p_id uuid,p_token uuid,p_outcome text default null,p_error text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
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
 if p_outcome is not null then
 update public.agendamento_lembretes set status=case when p_outcome in ('aceito_pelo_push','sem_dispositivo') then 'concluido' when tentativas>=4 then 'falhou' else 'pendente' end,entrega=case when p_outcome in ('aceito_pelo_push','sem_dispositivo') then p_outcome else 'falhou' end,executar_em=case when p_outcome='falhou' then now()+make_interval(mins=>power(2,tentativas)::integer) else executar_em end,processado_em=now(),enviado_em=case when p_outcome='aceito_pelo_push' then now() else null end,ultimo_erro=left(p_error,100),reserva=null where id=r.id;
 return jsonb_build_object('finished',true);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth))),'[]') into subscriptions from public.push_subscriptions s where s.user_id=r.user_id and not exists(select 1 from public.agendamento_push_entregas d where d.subscription_id=s.id and d.lembrete_id=r.id and d.status='aceito');
 return jsonb_build_object('appointment',a.id,'subscriptions',subscriptions,'tag',r.id);
end $$;
create function public.agenda_push_result(p_id uuid,p_token uuid,p_subscription uuid,p_status text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_status not in ('aceito','falhou','expirado') then raise exception 'Invalid outcome';end if;
 if not exists(select 1 from public.agendamento_lembretes r join public.push_subscriptions s on s.user_id=r.user_id where r.id=p_id and r.reserva=p_token and r.status='processando' and s.id=p_subscription) then return;end if;
 insert into public.agendamento_push_entregas(lembrete_id,subscription_id,status) values(p_id,p_subscription,p_status) on conflict(lembrete_id,subscription_id) do update set status=excluded.status,tentativas=public.agendamento_push_entregas.tentativas+1,updated_at=now();
 if p_status='expirado' then delete from public.push_subscriptions where id=p_subscription;end if;
end $$;
-- Explicit API grants; PUBLIC execute is revoked for every agenda RPC.
do $$declare f record;begin
 for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'agenda_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.proname not in ('agenda_claim','agenda_process','agenda_push_result') then execute format('grant execute on function %s to authenticated',f.signature);end if;
 if exists(select 1 from pg_roles where rolname='service_role') then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;
 if exists(select 1 from pg_roles where rolname='service_role') then
 grant usage on schema public to service_role;
 grant select on public.profiles to service_role;
 grant all on public.agendamentos,public.agendamento_lembretes,public.notificacoes,public.preferencias_notificacao,public.push_subscriptions,public.agendamento_push_entregas to service_role;
 end if;
end $$;
commit;
