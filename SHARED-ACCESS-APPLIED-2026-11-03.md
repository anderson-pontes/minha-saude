# Acesso compartilhado aplicado — 03/11/2026

Migração e bootstrap concluídos pelo MCP autenticado no projeto `qvkgadxyyzyjeiwjykgr`. A versão remota gerada foi **20261104015446_shared_access**, aplicada em 03/11/2026, aproximadamente 22h54 em São Paulo (04/11 em UTC). O arquivo local foi renomeado para refletir o histórico remoto, sem mudar seu conteúdo aprovado ou SHA-256.

A conta `andersonpinheiro.developer@gmail.com` está com perfil **admin / active**. O cadastro público e as demais configurações de Auth não foram alterados.

## Integridade e permissões

- Auditoria anterior à aplicação reconfirmou 12 tabelas, 48 políticas por proprietário, uma especialidade e uma conta Auth. A cópia lógica dos dados, funções, colunas, constraints, índices, grants e triggers foi salva em `supabase/backups.local/pre-shared-access-2026-11-03.json`, ignorada pelo Git. Não é snapshot completo nem backup de Auth.
- Após a aplicação: 13 tabelas com RLS, 49 políticas, zero constraints inválidas e zero grants de tabela extras para anon/authenticated.
- A especialidade existente manteve UUID, autoria e fingerprint `b54f7ee797162f6a1e9f0d53cec1ec19`.
- Os grants de execução pública da função `rls_auto_enable()` foram removidos. Os dois avisos correspondentes desapareceram dos advisors.
- HTTP confirmou que `private` não está exposto: 406 / PGRST106. As quatro RPCs `get_my_profile`, `admin_list_users`, `admin_set_access` e `search_network` existem e rejeitam chamada anônima: 401 / 42501.

## Testes remotos

`supabase/validate-shared-access-remote.sql` passou no PostgreSQL remoto usando papéis e claims controlados. Verificou criação/leitura/edição/exclusão por administrador, vínculos entre autores, consulta por viewer, favoritos individuais, negação de escrita direta e por RPC, bloqueio, revogação com a mesma identidade, proteção contra autopromoção e negação anônima. Todas as identidades e registros de teste foram revertidos com ROLLBACK.

A conferência posterior confirmou uma conta Auth, um perfil e a mesma especialidade; médicos, estabelecimentos e favoritos continuam vazios. Nenhum dado de teste persistiu.

## Histórico e próximos passos

Histórico remoto: `20261028231442_phase2_network` e `20261104015446_shared_access`. A fundação continua aplicada manualmente, fora do histórico remoto: não executar `db push` indiscriminadamente. O rollback permanece em `supabase/rollback/`, separado das migrações, e preserva sua proteção contra vínculos entre autores.

O frontend/PWA ainda precisa ser publicado na Vercel existente. Login e chamadas com JWTs reais, recuperação de senha e instalação/atualização em aparelhos físicos continuam pendentes. O advisor de proteção contra senhas vazadas permanece aberto; sua configuração não foi alterada.

Registro estruturado: `supabase/applied-shared-access.json`. O usuário já autorizou a conclusão das pendências; a migração não está mais aguardando autenticação nem aprovação.
