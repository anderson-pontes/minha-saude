# Minha Saúde — base compartilhada e PWA

**Atualiza??o de 03/11/2026: migra??o e bootstrap aplicados.** Consulte [o registro da aplica??o e das valida??es remotas](SHARED-ACCESS-APPLIED-2026-11-03.md). O restante deste relat?rio registra a proposta e o estado anterior ? aplica??o.

Data: 29/10/2026. **Implementação local preparada; nenhuma migração nova, ativação de perfil ou publicação foi executada em produção.**

## Diagnóstico e auditoria

O código anterior usava `user_id` tanto para autoria quanto para autorização: quatro políticas de proprietário em cada tabela, FKs compostas com `user_id`, predicados de proprietário nas RPCs e filtro adicional no React para detalhes/exclusão. Isso impedia uma base comum e vínculos entre registros de autores diferentes.

A inspeção local abrangeu as migrações da fundação/fase 2, seus registros de aplicação, funções SQL, relacionamentos, favoritos, Auth e consultas React. O histórico disponível registra a fundação aplicada manualmente e a fase 2 registrada como `20261028231442`, no projeto `qvkgadxyyzyjeiwjykgr`.

**Auditoria atual do banco remoto via MCP concluída em 29/10/2026, somente leitura.** Foram conferidos tabelas, autoria, FKs, políticas, funções, grants, triggers, usuários, migrações e advisors. O resultado está em [SUPABASE-AUDIT-2026-10-29.md](SUPABASE-AUDIT-2026-10-29.md). Foram confirmadas 12 tabelas com RLS, 48 políticas por proprietário e uma especialidade existente. A migração preparada já trata os grants extras encontrados em `doctor_health_plans` e a execução pública de `rls_auto_enable()`; seu conteúdo e hash permanecem inalterados. Configuração de schemas expostos e disponibilidade de backup no painel ainda requerem conferência antes da ativação/publicação.

O primeiro administrador informado para ativação é **andersonpinheiro.developer@gmail.com**. Sua conta foi confirmada no Auth, e é a única conta existente nesta auditoria. O signup público está desativado e o login anônimo está desabilitado. O bootstrap ainda não foi executado.

### Diagnóstico do PWA publicado

URL verificada: `https://minha-saude-cyan.vercel.app`.

| Caminho | HTTP | Content-Type observado |
| --- | --- | --- |
| `/login` | 200 | `text/html; charset=utf-8` |
| `/manifest.webmanifest` | 200 | `text/html; charset=utf-8` |
| `/sw.js` | 200 | `text/html; charset=utf-8` |
| `/icons/pwa-192.png` | 200 | `text/html; charset=utf-8` |

Os três recursos PWA retornam o HTML da SPA. No repositório também faltavam manifest, registro do Service Worker, PNGs de instalação e promoção/guia de instalação. Portanto, há ausência de recursos válidos e rewrite inadequado; não é possível atribuir o problema apenas à decisão do navegador de promover instalação.

Verificação reproduzível, somente leitura: `node scripts/audit-production-pwa.mjs`. A produção continuará com o comportamento anterior até um deploy autorizado.

## Modelo de acesso proposto

- `profiles`: ID de Auth, nome de exibição, papel `admin`/`viewer`, status `active`/`blocked` e timestamps.
- Todas as contas novas e os usuários existentes sem perfil recebem **viewer bloqueado**. Não existe promoção automática por e-mail, metadados editáveis ou localStorage.
- Autorização é consultada no banco em cada operação. Bloquear um perfil retira acesso nas consultas seguintes, mesmo com o mesmo JWT.
- A UI lê `get_my_profile`, verifica novamente ao voltar à janela e periodicamente a cada 15 segundos, e limpa consultas privadas quando as permissões mudam. Ela não concede acesso quando a verificação falha ou a migração está ausente.
- Administradores ativos consultam e modificam a base e gerenciam acessos. Viewers ativos consultam, usam contatos/mapas e gerenciam somente seus favoritos. Contas não autenticadas, ausentes ou bloqueadas não consultam a base.
- `user_id` das entidades permanece como **autoria histórica imutável**, preservada pelo trigger de auditoria. Não é mais predicado de leitura compartilhada.

### RLS e privilégios

| Grupo | SELECT | INSERT / UPDATE / DELETE |
| --- | --- | --- |
| 11 tabelas compartilhadas | perfil ativo | administrador ativo; nova autoria deve ser o próprio administrador |
| `favorites` | perfil ativo e `user_id = auth.uid()` | perfil ativo e favorito próprio |
| `profiles` | perfil próprio ou administrador ativo | sem grants diretos para `authenticated`; alteração por RPC protegida |

São **13 tabelas com RLS e 49 políticas** no esquema local após a migração. Não há política aberta `USING (true)` para qualquer conta autenticada.

Os helpers de autorização ficam no schema não exposto `private`, com `SECURITY DEFINER`, `search_path` fixo e consulta vinculada a `auth.uid()`. Essa consulta interna evita recursão nas políticas de perfis. Funções de trigger não são executáveis pelo frontend. Wrappers públicos permanecem `SECURITY INVOKER`, restritos ao papel autenticado; as operações administrativas verificam novamente o administrador no servidor.

`admin_list_users` devolve apenas ID, e-mail, nome de exibição, papel, status e timestamps, com paginação. Não devolve senhas, hashes, sessões, tokens ou metadados sensíveis. `admin_set_access` rejeita alteração das próprias permissões. Um lock transacional e um trigger protegem o último administrador ativo contra revogação/demissão/exclusão.

### Preservação e relacionamentos

- Nenhuma tabela existente é recriada, nenhum cadastro é apagado e nenhum `user_id` é reatribuído pela migração.
- FKs entre entidades passam de `(user_id, id)` para referência pelo UUID da entidade. Os UUIDs dos registros e relacionamentos existentes permanecem preservados.
- Índices por FK e unicidade global dos pares de associação permitem trabalhar com autores diferentes sem duplicar o vínculo.
- As FKs de autoria em entidades compartilhadas passam a `RESTRICT` na exclusão de conta Auth. Excluir uma conta autora não deve apagar a base por cascata; revogar acesso utiliza `status`, sem excluir a conta ou seus registros.
- Favoritos mantêm as colunas existentes e a propriedade individual. Apenas suas FKs para entidades são desacopladas da autoria da entidade, permitindo que um viewer favorite um estabelecimento criado por outro usuário.
- As RPCs de leitura e escrita deixam de filtrar cadastros pelo autor. O salvamento continua transacional e mantém favoritos do usuário atual, sem alterar os favoritos alheios.
- O React removeu o fallback antigo de detalhes por proprietário e o filtro de autor na exclusão. Filtros por `user_id` continuam apenas nas operações de favoritos e na identificação do perfil/cache pessoal.
- Nomes ou especialidades duplicados já existentes entre autores não são mesclados automaticamente: isso exigiria revisão para preservar referências e conteúdo.

## Migração, bootstrap e rollback

Proposta: [20261104015446_shared_access.sql](supabase/migrations/20261104015446_shared_access.sql).

SHA-256: `83ac55f64da09f52e67147c35e26df7e52efe617b7355d86375151690f5c408d`.

O SQL é idempotente para reexecução do modelo conhecido. Ele aborta diante de uma tabela de perfis desconhecida ou políticas extras não revisadas. Existe também uma revogação condicional da execução pública da antiga função `rls_auto_enable()`, preservando seu uso por trigger/owner, caso ela esteja presente.

Ativação inicial: [bootstrap-first-admin.sql](supabase/bootstrap-first-admin.sql), operação privilegiada sem endpoint frontend. Ela procura a conta explicitamente escolhida, não cria usuários, e não substitui administradores já existentes por engano. Não executar o bootstrap antes da revisão e autorização.

Rollback: [20261030010749_shared_access_rollback.sql](supabase/rollback/20261030010749_shared_access_rollback.sql). O arquivo está fora de `migrations/` para nunca ser aplicado automaticamente em sequência à evolução.

O rollback restaura RPCs/políticas de proprietário e FKs compostas sem apagar dados. **Ele aborta se já houver vínculos ou favoritos entre autores**, pois restaurar ownership nesse cenário exigiria reconciliação manual. Não apaga favoritos nem reatribui autoria para forçar uma reversão. O guard e a reversão em cenário compatível foram testados localmente.

## Interface

- Rotas de novo/edição e `/administracao/usuarios` têm guard administrativo, inclusive quando abertas por URL direta.
- Viewers não veem Novo cadastro, Editar, Excluir ou gerenciamento de acessos. Mantêm busca, detalhes, favoritos e ações de contato.
- Administração lista contas existentes, papel e status; oferece autorização de consulta, revogação e promoção com confirmação. A própria conta fica protegida contra alteração de permissões pelo seu usuário.
- Não foi criado cadastro público. Contas são criadas pelo administrador no Supabase Auth e permanecem bloqueadas até autorização.
- Menu da conta fornece acesso à administração quando autorizado e à instalação/instruções PWA.

## PWA implementado

- `vite-plugin-pwa` `2.0.0`, compatível com Vite 8, e Workbox `7.4.1`.
- Manifest com Minha Saúde, descrição solicitada, `/` como ID/start_url/scope, `standalone`, idioma pt-BR e cores teal/background preservadas.
- Ícones PNG 192 e 512, maskable 512 com área segura e Apple 180, gerados deterministicamente do favicon/logotipo existente. Nenhum ícone de demonstração foi usado.
- Registro único do Service Worker, precache de recursos estáticos com revisão e limpeza de versões antigas. O build gerou manifest, `sw.js`, Workbox e ícones.
- Supabase usa estratégia **NetworkOnly / no-store**. Consultas de saúde não são persistidas em Cache Storage nem por persister do React Query. A sessão Auth continua no mecanismo existente do Supabase, separado do cache de consultas.
- O shell pode abrir offline, mas cadastros exigem internet. O aplicativo mostra esse limite claramente; não há fila de gravações offline nem dados simulados.
- Atualização é oferecida ao usuário. Formulários com alterações não salvas impedem ativação pelo botão de atualização até salvar ou descartar.
- `beforeinstallprompt` é capturado e só executado após interação. Adiamento/recusa suprime o card por sete dias; instalação e modo standalone escondem a oferta.
- iOS/iPadOS recebem instruções manuais de Compartilhar → Adicionar à Tela de Início → Adicionar, sem botão que prometa instalação automática.
- Navegadores sem evento de instalação recebem instruções no menu. A promoção continua sendo decidida pelo navegador.
- Vercel exclui manifest, SW, Workbox, ícones e assets dos rewrites da SPA. Foram preparados MIME e cache headers próprios, incluindo `Service-Worker-Allowed: /` e SW sem cache persistente HTTP.

## Validações

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:contacts
npm.cmd run test:db
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:pwa
```

**Resultados locais finais:** TypeScript, lint, build, utilitários de contato e testes PostgreSQL aprovados; **29 testes da aplicação aprovados** (nenhum ignorado, instável ou com falha), além de **6 testes do PWA aprovados** no build em Chrome/Edge. A instalação nativa pela interface do sistema operacional não foi executada; a chamada de instalação e as escolhas do usuário foram exercitadas com eventos controlados.

O teste PostgreSQL usa perfis controlados de administrador, viewer, não autorizado e segundo administrador. Verifica leitura compartilhada, alterações diretas negadas ao viewer, RPC negada, bloqueio, favoritos independentes, impossibilidade de autopromoção, autoria preservada, vínculos entre autores, proteção do último admin, reexecução e rollback protegido. As políticas são exercitadas no PostgreSQL real em memória (PGlite), não apenas ocultando botões.

Os testes de UI usam transporte controlado que executa as mesmas funções SQL no PostgreSQL local. Incluem requisição HTTP direta de inserção negada pela RLS, guard de rotas, autorização/promoção/revogação, instalação somente após clique, adiamento, guia iOS e simulação de standalone. A regressão mantém os fluxos anteriores em 360, 390, 430, 768 e 1440 px.

O build PWA foi testado com **Edge e Chrome desktop reais**: manifest/MIME/ícones, roteamento, registro único do SW, cache somente estático, exclusão de respostas Supabase do cache, feedback offline e atualização local de versão com confirmação/reload. A alteração de versão foi simulada no servidor de teste localhost, sem deploy.

**Não foram declarados aprovados testes em Chrome Android ou Safari iOS físicos.** O guia iOS e standalone foram exercitados por emulação no Edge. Teclado nativo, status bar e instalação pela interface do sistema operacional ainda requerem dispositivos.

## Arquivos principais

| Arquivos | Finalidade |
| --- | --- |
| `supabase/migrations/20261104015446_shared_access.sql` | Perfis, helpers, RLS, FKs, RPCs e grants propostos |
| `supabase/bootstrap-first-admin.sql`, `supabase/audit-shared-access.sql`, `supabase/rollback/*` | Ativação explícita, auditoria e reversão protegida |
| `scripts/prepare-shared-access.py`, `scripts/test-shared-access.mjs` | Preparação local e verificação de permissões/integridade |
| `src/lib/access.tsx`, `src/pages/admin-users.tsx` | Perfil servidor, cache e administração |
| `src/lib/network.ts`, `src/components/network.tsx`, `src/App.tsx` | Consultas compartilhadas, guards e ações por perfil |
| `src/pages/home.tsx`, `src/pages/network-directory.tsx` | Opções administrativas condicionais e instalação |
| `src/components/pwa.tsx`, `src/lib/unsaved.ts`, `src/pages/entity-form.tsx` | Instalação, offline, atualização e proteção do formulário |
| `vite.config.ts`, `vercel.json`, `index.html`, `tsconfig.app.json`, `src/refinement.css` | Build PWA, MIME/rewrites, metadados e layout |
| `public/icons/*`, `scripts/generate-pwa-icons.mjs` | Ícones da identidade existente |
| `tests/access.spec.ts`, fixtures e testes anteriores ajustados | Perfis, instalação e regressão |
| `tests-pwa/pwa.spec.ts`, `playwright.pwa.config.ts`, `scripts/pwa-preview-server.mjs` | PWA real no build local, em Edge/Chrome |
| `scripts/audit-production-pwa.mjs` | Inspeção pública de produção, sem escrita |
| `package.json`, `package-lock.json`, `README.md` | Dependências, comandos e documentação |

## Plano de ativação e deploy — requer autorização

1. Disponibilizar/reconectar o MCP Supabase e reconfirmar o projeto. Executar a auditoria somente leitura, listar migrações, verificar usuários, grants, schema exposto, owners/bypass RLS e triggers. Confirmar a conta de primeiro administrador e conferir se signup público está desativado no Auth.
2. Confrontar o resultado com esta proposta. Se houver schema/permissões diferentes, ajustar o SQL e os testes antes de pedir aprovação do conteúdo final. Preparar backup/snapshot conforme os recursos do projeto.
3. Mediante autorização, aplicar **somente a nova migração** e a ativação explícita do administrador. Não reaplicar fundação/fase 2 nem executar `db push` indiscriminadamente: a fundação ainda tem histórico manual.
4. Conferir contagens/UUIDs/relações e políticas no remoto. Executar testes controlados com rollback e chamadas autenticadas diretas, sem excluir ou modificar dados reais. Os resultados locais não substituem essa validação.
5. Após autorização específica para publicação, executar `npm ci`, verificações e `npm run build`, configurar as variáveis públicas Supabase já existentes na Vercel e publicar. Nenhuma service key pode ser incluída no frontend.
6. Conferir em produção manifest JSON, PNGs, SW JavaScript, MIME/cache headers, deep links e uma única registration de escopo `/`. Validar login real como admin/viewer/bloqueado antes de conceder acesso aos demais usuários.
7. Autorizar viewers pela tela administrativa; testar instalação e atualização em Android/iOS físicos e modo standalone.

## Pendências e limites

- Auditoria MCP atual concluída, sem escrita. Aplicação de migração/bootstrap, validação remota com JWTs reais e deploy **não realizados** nesta sessão. Os testes de banco/UI descritos são locais; as requisições públicas à Vercel foram somente leitura.
- Primeiro administrador confirmado no Auth; ativação ainda depende da aplicação aprovada. Outros usuários receberão perfis bloqueados até autorização explícita.
- O frontend novo depende da migração de acesso. Não publicar esse build antes de preparar o banco e ativar o primeiro administrador.
- Revogação é imediata nas consultas do banco. A UI revalida em foco/intervalo e limpa a memória quando percebe a mudança; conteúdo já visto anteriormente não pode ser retirado retroativamente do usuário.
- Rollback após uso compartilhado exige revisão dos vínculos/favoritos entre autores; não há apagamento automático para contornar esse requisito.
- `npm audit` identificou quatro avisos **baixos** transitivos na cadeia de build `vite-plugin-pwa` → Workbox → `deepmerge` (versão publicada mais recente ainda 4.3.1). Não foi aplicado `audit fix --force`, que propõe downgrade incompatível. Referência: [advisory deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). O bundle principal também mantém aviso de tamanho.
- As instruções e eventos de instalação dependem do suporte do navegador e de HTTPS. Dispositivos móveis reais e a atualização após deploy de produção permanecem pendentes.

Referências técnicas: [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [Vite PWA](https://vite-pwa-org.netlify.app/guide/), [atualização com confirmação](https://vite-pwa-org.netlify.app/guide/prompt-for-update).
