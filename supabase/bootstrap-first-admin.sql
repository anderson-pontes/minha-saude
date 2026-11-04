-- Run only after audit and explicit approval. Never callable by the frontend.
begin;
do $$declare target uuid;begin
 select id into target from auth.users where lower(email)=lower('andersonpinheiro.developer@gmail.com');
 if target is null then raise exception 'The approved Auth account must exist before bootstrap';end if;
 if exists(select 1 from public.profiles where role='admin' and status='active' and id<>target) then raise exception 'Active administrators already exist; use administrative access management';end if;
 update public.profiles set role='admin',status='active' where id=target;
 if not found then raise exception 'Profile missing: migration must be applied first';end if;
end $$;
commit;
