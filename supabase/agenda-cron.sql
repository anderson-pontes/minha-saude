-- Operational setup, applied after the reviewed agenda migration and worker deployment.
-- Secrets are provisioned separately in Vault; no secret values belong in this file.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$begin
 if not exists(select 1 from vault.decrypted_secrets where name='agenda_cron_secret') or not exists(select 1 from vault.decrypted_secrets where name='agenda_project_url') then raise exception 'Provision agenda Vault secrets first';end if;
end $$;
select cron.schedule('minha-saude-processar-lembretes','* * * * *',$job$
 select net.http_post(
  url:=(select decrypted_secret from vault.decrypted_secrets where name='agenda_project_url')||'/functions/v1/processar-lembretes',
  headers:=jsonb_build_object('Content-Type','application/json','x-agenda-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='agenda_cron_secret')),
  body:='{}'::jsonb,timeout_milliseconds:=55000
 );
$job$);
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notificacoes') then alter publication supabase_realtime add table public.notificacoes;end if;
end $$;
