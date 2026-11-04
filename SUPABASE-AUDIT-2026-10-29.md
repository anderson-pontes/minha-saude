# Auditoria Supabase — 29/10/2026

Auditoria somente leitura pelo MCP autenticado, no projeto `qvkgadxyyzyjeiwjykgr`. Nenhuma migração, ativação de perfil, alteração de Auth ou publicação foi executada.

## Estado confirmado

- API: `https://qvkgadxyyzyjeiwjykgr.supabase.co`.
- 12 tabelas públicas, todas com RLS, 101 colunas e 70 constraints validadas.
- 48 políticas: SELECT/INSERT/UPDATE/DELETE por proprietário, exclusivamente para `authenticated`. Nenhuma política adicional inesperada.
- Todas as tabelas possuem `user_id uuid NOT NULL DEFAULT auth.uid()`; associações usam FKs compostas com autoria. As 12 FKs de usuário usam atualmente `ON DELETE CASCADE`.
- Nenhuma view pública. Sete funções públicas; RPCs da aplicação são invoker, com search_path vazio e sem execução anônima. Os predicados de proprietário nas RPCs de salvamento, detalhes e pesquisa precisam ser substituídos pela proposta compartilhada.
- Os 12 triggers `audit_fields` preservam autoria e created_at em atualizações. O event trigger `ensure_rls` utiliza `rls_auto_enable()`; a função retorna `event_trigger`, não uma RPC de aplicação.
- Histórico remoto registra somente `20261028231442_phase2_network`; a fundação tem histórico manual. Não usar db push indiscriminado.
- Uma conta Auth existente: `andersonpinheiro.developer@gmail.com`, correspondente ao primeiro administrador escolhido. `profiles` ainda não existe.
- Consulta pública GET `/auth/v1/settings`: HTTP 200, `disable_signup=true`, e-mail habilitado e usuários anônimos desabilitados. Não foi tentado cadastro nem alterada configuração.
- Role `anon`: sem SELECT nas tabelas e sem EXECUTE em `search_network`. Confirmado também em transação read only com role anon.

## Dados e integridade

| Entidade | Quantidade exata |
| --- | ---: |
| Especialidades | 1 |
| Estabelecimentos, médicos, convênios, contatos, endereços e favoritos | 0 em cada tabela |

As associações estão vazias na inspeção das tabelas. A especialidade existente tem UUID `7be0b824-74be-4588-b332-e1c8ec9d8ad5` e autoria `a1208fbc-d580-4639-996b-f5332067fb28`. Fingerprint MD5 da representação JSONB completa da linha: `b54f7ee797162f6a1e9f0d53cec1ec19`. Usar contagem, UUID, autoria e fingerprint para comparar imediatamente antes/depois da aplicação. Este registro de auditoria não substitui backup recuperável.

## Achados e tratamento

1. **Privilégios extras em `doctor_health_plans`:** authenticated possui TRUNCATE, REFERENCES, TRIGGER e MAINTAIN, além de CRUD. As demais tabelas concedem somente CRUD. A migração proposta já revoga todos os grants de public/anon/authenticated e concede somente CRUD. Foi acrescentada regressão local que reproduz TRUNCATE/REFERENCES/TRIGGER antes da atualização e verifica a remoção depois; passou. Não foi executado TRUNCATE remoto. [Grants e RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
2. **Dois avisos dos advisors para `rls_auto_enable()`:** EXECUTE concedido a anon e authenticated em função SECURITY DEFINER de event trigger. Isso não demonstra exploração pela API; o tipo de retorno é event_trigger. A revogação condicional já consta na proposta, preservando o event trigger e sua execução pelo owner. [Aviso anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [aviso authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
3. **Proteção contra senhas vazadas desativada:** aviso de Auth. Não foi alterada nesta auditoria; avaliar disponibilidade no plano e habilitação no painel. [Orientação Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
4. **Oito índices sem uso registrado:** aviso informativo de desempenho, coerente com a base quase vazia. Nenhum índice foi removido. [Orientação do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Compatibilidade e consultas React

A estrutura observada corresponde aos nomes e políticas esperados pela migração preparada; não foi necessário alterar seu SQL. SHA-256 permanece `83ac55f64da09f52e67147c35e26df7e52efe617b7355d86375151690f5c408d`.

No React preparado, `useNetwork` chama `search_network`, `useEntity` chama `network_document`, e exclusões usam o UUID sem predicado de autor. `user_id` permanece nas mutações de favoritos pessoais e nas chaves de cache por sessão. A visibilidade depende do perfil consultado no servidor, além das políticas do banco. As funções atualmente em produção ainda implementam ownership; o novo frontend depende da migração.

## Plano pronto para aprovação

1. Reconfirmar baseline e disponibilidade de backup recuperável; manter o frontend atual durante a atualização do banco.
2. Aplicar apenas `supabase/migrations/20261030010619_shared_access.sql`, que preserva registros, UUIDs e autoria, cria perfis bloqueados por padrão, estabelece leitura para membros ativos e escrita somente para admins, mantém favoritos pessoais e restringe grants.
3. Executar `supabase/bootstrap-first-admin.sql` para ativar exclusivamente a conta escolhida como admin. As outras contas futuras continuam bloqueadas até autorização.
4. Comparar integridade, grants, políticas e advisors. Executar validação controlada de admin/viewer/bloqueado sem modificar registros reais; testes autenticados remotos com JWTs continuam pendentes.
5. Publicar o frontend/PWA somente após autorização específica para deploy e validação do banco. Rollback manual está em `supabase/rollback/` e aborta se houver vínculos ou favoritos entre autores incompatíveis com ownership.

Validação desta auditoria: `node scripts/test-shared-access.mjs` e `npm.cmd run lint` aprovados. Os 29 testes de aplicação e 6 de PWA descritos no relatório geral são os resultados locais anteriores, não testes remotos desta auditoria.

Limites: a lista de schemas expostos da configuração gerenciada do Data API não aparece em `pgrst.db_schemas` nem nas configurações SQL do authenticator. Conferir no painel que `private` não esteja exposto após sua criação. Não foram inspecionados backups pelo painel nem executados testes com novas contas/JWTs em produção. Nenhum dado real foi alterado.
