# Minha Saúde — relatório da fase 2

Data: 28/10/2026. **Migração autorizada pelo usuário, aplicada via MCP e validada no PostgreSQL remoto.**

## Auditoria e causa dos problemas

- Projeto existente preservado: React, TypeScript, Vite, TanStack Query, Supabase Auth, estilos teal/navy, sidebar, navegação inferior e configuração SPA.
- A listagem original mostrava apenas `id` e `name` em artigos sem link. Não havia rota `/estabelecimentos/:id`, componente de detalhes nem consulta por UUID. Portanto, o problema principal de visualização era a ausência da implementação, e não uma política RLS impedindo a consulta.
- O formulário anterior fazia uma inserção simples e voltava à listagem. Não existiam edição, exclusão, contatos ou vínculos pela interface.
- A pesquisa original filtrava no navegador apenas os 100 registros mais recentes de cada categoria, pelo nome.
- MCP confirmou o projeto `qvkgadxyyzyjeiwjykgr`, o mesmo projeto configurado para a aplicação. A auditoria remota foi somente leitura.
- As 11 tabelas da fundação têm RLS e 44 políticas de proprietário, com `auth.uid()` em `USING` e `WITH CHECK` quando aplicável. As FKs compostas incluem `user_id`, impedindo vínculos entre contas.
- A fundação foi aplicada manualmente pelo SQL Editor. O histórico de migrações remoto está vazio; o registro local dessa aplicação está em `supabase/applied-foundation.json`. **Não executar novamente a fundação nem aplicar `db push` indiscriminadamente.**

## Implementação

- CRUD de estabelecimentos, médicos, especialidades e convênios, com rotas de listagem, novo, detalhes e edição. Contatos, endereços e relações são criados, editados e removidos no formulário da entidade.
- Detalhes reais por UUID, carregamento direto e recarregamento, dados relacionados, estados de erro e registro ausente/indisponível. A leitura de estabelecimentos e médicos também admite o schema da fundação enquanto a fase 2 aguarda aplicação.
- Formulário de estabelecimento em cinco etapas: gerais; contatos; endereços; especialidades; médicos e convênios. O médico tem formulário próprio com etapas equivalentes para contatos, especialidades e locais/convênios.
- Múltiplos telefones fixos, celulares, WhatsApp, e-mail e outros contatos; departamento, principal e observações. Múltiplos endereços, referência, principal e CEP com consulta ViaCEP e edição manual.
- Seleção pesquisável com chips, remoção e cadastro rápido de especialidades, médicos e convênios. Novos registros rápidos ficam no formulário e só são persistidos quando o conjunto é salvo. Selecionar um médico existente reutiliza o ID.
- Observações por atendimento e por convênio; múltiplas especialidades e locais por médico; favoritos; status ativo/inativo.
- Proteção contra duplo envio, aviso de alterações não salvas em navegação e recarregamento, manutenção dos campos em caso de erro e detecção de edição concorrente pelo `updated_at`.
- `/cadastros`, Minha Rede de Saúde: categorias, busca por dados relacionados e sem diferenciação de acentos/maiúsculas, filtros combináveis na URL, ordenação, paginação de 12 itens no servidor, cards e tabela no desktop. No celular, tabela é substituída por cards e filtros abrem em painel modal.
- Cards e detalhes com links `tel:`, `mailto:`, WhatsApp com DDI brasileiro, cópia de contato e Google Maps. Sites externos só são abertos com protocolo HTTP/HTTPS.
- Dashboard com busca universal, menu de novo cadastro, acessos rápidos, contagens reais, favoritos e últimos registros. Loading skeletons, estados vazios e mensagens de falha/sucesso.

## Migração aplicada

Arquivo: [20261028231442_phase2_network.sql](supabase/migrations/20261028231442_phase2_network.sql).

SHA-256 do SQL revisado: `4a00abdf534c2f23acd05c7b02d482a329b543981e6056ffc46726cb63421474`.

Aplicação concluída conforme o plano aprovado:

1. Reconfirmar projeto, schema e ausência de aplicação prévia da fase 2.
2. Aplicar **somente** a migração da fase 2 via MCP, com registro no histórico. Não recriar a fundação.
3. Conferir 12 tabelas e 48 políticas de proprietário, grants, funções e advisors.
4. Validar o transporte real Supabase/PostgREST e as operações com dados controlados, preservando registros reais. Testes que precisem de duas sessões Auth reais dependem de contas de teste apropriadas.

O MCP registrou a versão `20261028231442`, nome `phase2_network`. O arquivo local foi renomeado de `20261028001042_phase2_network.sql` para essa versão, sem alterar o SQL aprovado. Evidência em [applied-phase2.json](supabase/applied-phase2.json). A fundação não foi reaplicada.

Conteúdo da migração:

- Acrescenta nome fantasia, site, descrição e status; referência e principal em endereços; notas de contato e de vínculos; tipo celular.
- Cria `doctor_health_plans`, com FKs compostas, índices e quatro políticas RLS.
- Acrescenta índices por usuário/data para consultas recentes.
- Cria `save_network_entity`, `network_document`, `search_network`, `network_summary` e normalização da pesquisa. Todas são `SECURITY INVOKER`, com `search_path` fixo e execução restrita a `authenticated`.
- O salvamento do agregado ocorre em uma transação RPC. Erro em qualquer filho ou novo vínculo reverte o conjunto inteiro. A exclusão de uma entidade remove apenas seus dados próprios e vínculos por cascata; não apaga as entidades compartilhadas.
- Não remove dados existentes nem altera configuração de autenticação. Defaults mantêm os registros existentes ativos.

## Evidências de testes

Comandos executados na raiz da aplicação:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run test:db
npm.cmd run test:e2e
```

- TypeScript, lint e build aprovados. O Vite informa um aviso de bundle principal acima de 500 kB; isso não impediu o build. A divisão adicional do bundle continua como otimização possível.
- Suíte consolidada de interface: **14 testes aprovados**, incluindo as quatro larguras, em aproximadamente um minuto.
- `test:db`: PostgreSQL efêmero PGlite executa a fundação e a migração completa da fase 2. Valida 12 tabelas/48 políticas, CRUD, rollback incluindo novos cadastros aninhados, edição concorrente, duplicação de vínculos, contatos e endereços, busca por relações/acento/cidade/bairro/convênio, filtros combinados, paginação, favoritos e preservação das entidades compartilhadas. Exercita duas identidades, bloqueio de FK entre contas, tentativa de ler/alterar/excluir registro alheio, acesso anônimo e sessão ausente.
- Playwright/Edge: fluxo completo nas larguras **360, 390, 430 e 1440 px**: criar médico; criar estabelecimento com dois telefones, WhatsApp, endereço, duas especialidades, médico e convênio; detalhes; edição com campos relacionados carregados; recarregamento; contatos/mapa; consultas; favoritos; cancelar e confirmar exclusão; integridade dos registros compartilhados; ausência de overflow horizontal.
- Testes adicionais cobrem login/recuperação/logout, erro de consulta, falha de salvamento com campos preservados e nova tentativa, navegação com alterações não salvas, cadastros rápidos aninhados, CRUD de especialidades/convênios, consulta CEP com correção manual e detalhes compatíveis com o schema anterior.
- Os testes de interface usam autenticação controlada e um adaptador HTTP para o PostgreSQL local que executa as mesmas funções SQL da migração. **Não equivalem a uma validação contra Supabase Auth/PostgREST hospedados.** Esses testes de interface não acessam o banco remoto.
- Após a autorização, [validate-phase2-remote.sql](supabase/validate-phase2-remote.sql) foi executado no PostgreSQL hospedado. Passaram CRUD das quatro entidades, agregado com três contatos/endereço/vínculos, busca relacionada e sem acentos, filtros combinados, paginação, favoritos, atualização concorrente, reversão de erro aninhado e exclusão preservando entidades compartilhadas. Duas identidades temporárias verificaram RLS em todas as 12 tabelas, RPCs, atualização/exclusão alheias e FKs entre contas. A transação inteira foi revertida; não restaram usuários nem registros de teste. O estabelecimento real existente permaneceu preservado.
- Metadados remotos confirmaram **12 tabelas com RLS, 48 políticas e cinco funções `SECURITY INVOKER`**, com `search_path` fixo, execução autenticada permitida e execução anônima negada.
- A API HTTPS foi verificada com a publishable key já configurada: as novas RPCs são reconhecidas pelo schema cache e respondem `401/42501` a chamadas anônimas; a nova tabela também bloqueia leitura anônima. A validação com duas identidades usou roles/claims PostgreSQL controladas, sem efetuar login Auth real.
- Capturas em `test-results/dashboard-{largura}.png`, `phase2-form-{largura}.png`, `phase2-detail-{largura}.png` e `phase2-network-{largura}.png`. Essa pasta é ignorada pelo Git; as capturas de dashboard e detalhes em 360 px foram inspecionadas visualmente.

## Arquivos principais

| Arquivo | Mudança |
| --- | --- |
| `src/App.tsx` | Rotas CRUD e central; data router necessário ao bloqueio de navegação |
| `src/lib/network.ts` | Tipos, consultas, RPC, compatibilidade da leitura e links de contato/mapa |
| `src/components/network.tsx` | Cards, ações, favoritos, confirmação, contato e diálogos |
| `src/pages/entity-form.tsx` | Formulários progressivos e cadastro rápido |
| `src/pages/entity-detail.tsx` | Detalhes reais e relações |
| `src/pages/network-directory.tsx` | Central, filtros, paginação, cards/tabela |
| `src/pages/home.tsx` | Dashboard e navegação para a central |
| `src/components/feedback.tsx`, `src/index.css` | Skeletons e apresentação responsiva |
| `src/pages/establishment-form.tsx` | Formulário antigo removido; substituído por `entity-form.tsx` |
| `scripts/prepare-phase2.py` | Reproduz o SQL local, sem aplicar mudanças remotas |
| `supabase/applied-phase2.json`, `supabase/validate-phase2-remote.sql`, `scripts/check-remote-api.mjs` | Registro da aplicação e validações no PostgreSQL/API hospedados |
| `scripts/test-phase2.mjs`, `scripts/test-database.mjs` | Verificação PostgreSQL local da fase 2 e fundação |
| `tests/network.spec.ts`, `tests/foundation.spec.ts` | Fluxos da fase 2 e regressão da autenticação |
| `package.json`, `README.md`, `PHASE2-REPORT.md` | Comandos e documentação |

## Pendências e limites

1. **Aplicação remota concluída.** As novas funções estão disponíveis no banco configurado. O histórico da fundação continua manual e precisa ser reconciliado antes de `db push`; a fase 2 já consta no histórico remoto.
2. O PostgreSQL remoto, os grants, as políticas e o schema cache foram validados. Resta a conferência do fluxo completo pelo HTTP autenticado/browser com login Auth real; os fluxos completos de interface passaram localmente e o isolamento remoto passou com duas roles/claims controladas.
3. A busca é paginada no servidor e não transfere toda a rede ao navegador. Filtros por relações/termos examinam documentos relacionados no servidor; para volumes grandes, considerar índice de pesquisa agregado e medir planos/latência. Os índices existentes foram preservados.
4. A disponibilidade real do ViaCEP e o envio de e-mails do Auth dependem dos respectivos serviços; os testes exercitam respostas controladas.
5. Advisors remotos apontaram avisos preexistentes: função `public.rls_auto_enable()` `SECURITY DEFINER` executável por `anon` e `authenticated`, e proteção contra senhas vazadas desativada. Não alterei esses objetos/configurações sem revisão. Referências: [permissões da função](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [acesso autenticado](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Advisors de desempenho registraram índices ainda não utilizados; nenhum índice foi removido por esse motivo.
