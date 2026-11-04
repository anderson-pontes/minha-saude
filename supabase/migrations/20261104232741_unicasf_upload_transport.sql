begin;
-- Temporary transport data only. No browser or authenticated user can read this table.
create table private.network_import_chunks (
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 chunk_index integer not null check(chunk_index>=0),
 chunk_count integer not null check(chunk_count>0 and chunk_count<=10000),
 compact_md5 text not null check(compact_md5 ~ '^[a-f0-9]{32}$'),
 data text not null check(length(data)<=240000),
 created_at timestamptz not null default now(),
 primary key(content_sha256,chunk_index),
 check(chunk_index<chunk_count)
);
alter table private.network_import_chunks enable row level security;
alter table private.network_import_chunks force row level security;
revoke all on private.network_import_chunks from public,anon,authenticated;
commit;
