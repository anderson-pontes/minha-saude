# Fundação do banco — aplicada e validada

Projeto confirmado no painel autenticado: **minha-saude**, referência `qvkgadxyyzyjeiwjykgr`. Configuração autorizada pelo usuário e concluída em 27/10/2026 pelo SQL Editor do Supabase. Antes da aplicação havia zero tabelas em public, nenhuma função set_audit_fields e nenhum histórico de migrações.

Executado o conteúdo de `migrations/20261027232704_foundation.sql`, com diferenças apenas de formatação e omissão do comentário inicial. Comparação normalizada antes da execução: 17.105 caracteres; fingerprint 3978571393, igual ao arquivo local. A transação terminou com sucesso. Não houve importação de dados, criação de usuários ou alteração de credenciais.

## Estrutura aplicada

| Tabela | Finalidade |
| --- | --- |
| establishments | Clínicas, hospitais, laboratórios, consultórios e outros locais |
| doctors | Profissionais, conselho e registro |
| specialties | Especialidades privadas por usuário |
| health_plans | Convênios privados por usuário |
| addresses | Endereços dos estabelecimentos |
| contacts | Contatos de um médico OU estabelecimento |
| doctor_specialties | Médicos × especialidades |
| doctor_establishments | Médicos × locais de atendimento |
| establishment_specialties | Locais × especialidades |
| establishment_health_plans | Locais × convênios |
| favorites | Favorito de um médico OU estabelecimento |

UUIDs, user_id vinculado a auth.users, created_at e updated_at em todas as tabelas. FKs compostas (user_id, entidade_id) impedem vínculos entre usuários diferentes. Unicidade nos relacionamentos, favoritos e nomes de especialidades/convênios por usuário. Índices de FKs, proprietário/nome e busca textual em português.

## Segurança e validação remota

- 11 tabelas com RLS habilitada e forçada; quatro políticas por tabela, 44 no total.
- SELECT/DELETE verificam auth.uid() = user_id; INSERT usa WITH CHECK; UPDATE usa USING e WITH CHECK.
- anon sem SELECT; authenticated possui CRUD condicionado às políticas. Sem uso de user_metadata na autorização.
- Auditoria com trigger SECURITY INVOKER, search_path vazio, preservação de proprietário/created_at e atualização de updated_at. Sem histórico completo de alterações nesta fase.
- As 11 consultas anônimas reais via API retornaram HTTP 401 / código 42501.
- Teste remoto com SET LOCAL ROLE authenticated: INSERT/SELECT/UPDATE pelo proprietário funcionaram; tentativa de forjar user_id foi rejeitada; outra identidade não leu nem atualizou o registro.
- Teste em transação com ROLLBACK: nenhum registro demonstrativo persistido.
- Aplicação em localhost:5173 consulta o banco com a sessão existente e exibe contagens zero/estado vazio, sem erro. Formulário /estabelecimentos/novo disponível.
- .env existente validado sem exibir valores; cadastro público já estava desativado (disable_signup=true).

## Histórico de migrações

A aplicação foi manual pelo SQL Editor porque o MCP local continuou com falha de autenticação. O SQL está versionado, mas o histórico supabase_migrations.schema_migrations não foi criado nem adulterado. **Não executar novamente o script ou db push neste banco.** Antes do primeiro deploy de schema pelo CLI/MCP, comparar o schema e reconciliar a versão 20261027232704 como já aplicada. Não recriar as tabelas.

`applied-foundation.json` registra método, versão, SHA-256 do arquivo e validações, sem credenciais.

## Pendências

Resolver conexão administrativa MCP/CLI e reconciliar histórico; gerar tipos TypeScript do schema real e executar advisors. Validar recuperação de senha e allowlist do domínio de produção quando houver deploy. Nenhuma alteração de Auth, SMTP, usuários, senhas ou Vercel foi executada.

Referências: https://supabase.com/docs/guides/database/postgres/row-level-security e https://supabase.com/docs/guides/auth/passwords.
