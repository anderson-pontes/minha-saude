begin;
create or replace function private.agenda_sync_reminders() returns trigger language plpgsql security definer set search_path='' as $$
declare offset_minutes integer; channel_name text;
begin
 -- Trigger is not a general privileged API: its owner must match the authenticated writer.
 if auth.uid() is not null and new.user_id<>auth.uid() then raise exception 'Acesso não permitido' using errcode='42501';end if;
 -- A confirmation or an additional offset does not re-arm an existing reminder.
 if TG_OP='UPDATE' and new.inicio_em=old.inicio_em and new.status in ('agendado','confirmado') and old.status in ('agendado','confirmado') then
  update public.agendamento_lembretes set status='cancelado',reserva=null
   where agendamento_id=new.id and status in ('pendente','processando') and not (antecedencia_minutos=any(new.antecedencias));
  if new.inicio_em>now() then
   foreach offset_minutes in array new.antecedencias loop
    if not (offset_minutes=any(old.antecedencias)) then
     foreach channel_name in array array['interno','push'] loop
      insert into public.agendamento_lembretes(agendamento_id,user_id,revisao,antecedencia_minutos,executar_em,canal)
      values(new.id,new.user_id,new.revisao,offset_minutes,new.inicio_em-make_interval(mins=>offset_minutes),channel_name) on conflict do nothing;
     end loop;
    end if;
   end loop;
  end if;
  return new;
 end if;
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
commit;
