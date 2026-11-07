# Agenda de Saúde — implementação e operação

## Resultado

A agenda pessoal foi implementada sobre o React/TypeScript e o Supabase existentes. Reutiliza Auth, controle de acesso, cadastros compartilhados, componentes de seleção, cache de consultas e o único service worker do PWA. Não existe backend adicional nem dados demonstrativos no código de produção.

O backend está aplicado no projeto `qvkgadxyyzyjeiwjykgr`, e a interface está publicada em **https://minha-saude-cyan.vercel.app/agenda**. A suíte final terminou com **83 testes de navegador aprovados**, além de **seis testes do PWA**.

## Funcionalidades

- Menu Agenda, calendário mensal e semanal com FullCalendar, visualizações Dia e Lista; lista como padrão inicial em telas pequenas.
- Hoje, navegação por período, clique no dia para iniciar cadastro, detalhes por evento, lista de mais eventos e distribuição de horários simultâneos.
- Indicadores agregados pela API, com período e fuso visíveis. Filtros combinados de tipo, status, médico, estabelecimento e convênio; paginação no servidor.
- Consulta, exame, retorno, procedimento, vacinação e outro. Status independentes: agendado, confirmado, realizado, cancelado e não compareceu.
- Criação, edição, reagendamento, cancelamento, confirmação, conclusão, não comparecimento e exclusão com confirmação.
- Formulário com proteção de alterações não salvas, título, horários, fuso, protocolo, observações e preparo. Duração padrão configurável; aviso de sobreposição permite confirmação explícita.
- Seleção pelos IDs reais do catálogo. Um profissional com apenas uma especialidade/local permite preenchimento automático; os demais vínculos aparecem como sugestões. O local selecionado permite consultar endereço e contatos.
- UUID estável no formulário e bloqueio de envio concorrente evitam criar cópias ao reenviar uma criação. Revisão otimista impede sobrescrever alterações de outra sessão.
- Lembretes padrão de 1.440 minutos, opções adicionais e minutos personalizados, sem repetição. Preferências individuais de fuso, duração, lembretes e push.
- Central persistida com contador, paginação, marcar como lida, marcar todas e abertura do compromisso. Realtime recebe novas notificações com filtro por proprietário; retorno à aba também atualiza a central.
- Próximos cinco compromissos e contagem dos próximos sete dias no dashboard.
- Exportação `.ics` com UID estável, revisão, datas UTC, escape e dobra de linhas; links individuais para Google Calendar e Outlook. Exportação unidirecional.
- Feedback de sucesso por toast e erros locais, preservando o restante da página. Respostas das consultas são validadas com Zod; um contrato inválido não derruba o dashboard.

O calendário busca o intervalo visível. Mês/Semana retornam até 200 eventos por página; Dia/Lista, 40. Havendo mais registros, a navegação de páginas permanece disponível. O backend limita a consulta a um ano e calcula os indicadores sem transferir todo o histórico. O painel de próximos compromissos usa uma consulta independente, limitada a cinco registros.

## Banco, migrations e segurança

Migrations já aplicadas e registradas no histórico:

1. `supabase/migrations/20261107143237_health_agenda.sql`.
2. `supabase/migrations/20261107145044_agenda_filter_delivery_refinements.sql`.
3. `supabase/migrations/20261107233407_agenda_preserve_reminders.sql`.

Tabelas: `agendamentos`, `agendamento_lembretes`, `notificacoes`, `push_subscriptions`, `preferencias_notificacao` e `agendamento_push_entregas`.

Agendamentos referenciam `auth.users`, `doctors`, `specialties`, `establishments` e `health_plans`. Os lembretes usam FK composta de agendamento e proprietário, evitando associação cruzada. Há validação de título, intervalos, fuso, duração e quantidade de lembretes, além de índices por proprietário/data/status, vínculos e fila pendente.

Todas as tabelas têm RLS habilitada e forçada. Agendamentos e preferências têm políticas separadas de leitura, inserção, atualização e exclusão, condicionadas ao próprio `auth.uid()` e ao acesso ativo. Ser administrador do catálogo não permite ler a agenda de outra pessoa.

O navegador não pode inserir lembretes ou notificações nem manipular resultados de entrega. Nas notificações, só recebe a permissão de atualizar `lida_em`, sob RLS. Subscriptions são registradas pela função privada com verificação de identidade, propriedade e limite de dez dispositivos; endpoints de provedores conhecidos são validados, e redirecionamentos HTTP são recusados pelo worker. Uma conta não pode assumir o endpoint de outra.

As RPCs usuais usam `SECURITY INVOKER`. Os auxiliares privilegiados de trigger/registro são restritos ao schema privado e verificam o proprietário. As RPCs de processamento são exclusivas de `service_role`, sem execução concedida a `PUBLIC`, `anon` ou `authenticated`.

## APIs

| RPC | Finalidade |
|---|---|
| `agenda_save` | Criação/edição, validação de sobreposição e revisão |
| `agenda_browse` / `agenda_filtered` | Período, filtros, paginação e agregações |
| `agenda_detail` | Detalhes, vínculos, endereço, contatos e lembretes |
| `agenda_status` / `agenda_delete` | Atualização de status e exclusão com revisão |
| `agenda_upcoming` | Próximos cinco e contagem dos próximos sete dias |
| `agenda_preferences` | Preferências do usuário |
| `agenda_notifications` / `agenda_read_notifications` | Central e leitura |
| `agenda_subscription` | Registro/remoção do dispositivo atual |
| `agenda_claim` / `agenda_process` / `agenda_push_result` | Reserva, processamento e resultados por dispositivo; uso exclusivo do backend |

## Lembretes, Cron e Edge Function

`supabase/functions/processar-lembretes/index.ts` executa o worker compartilhado em `supabase/functions/_shared/reminder-worker.mjs`.

O job `minha-saude-processar-lembretes` usa `* * * * *` e chama a função via `pg_net`. `supabase/agenda-cron.sql` contém a configuração operacional e a inclusão de notificações na publicação Realtime. `pg_cron` e `pg_net` foram habilitados no projeto.

O gateway JWT é desabilitado apenas nessa função, pois a chamada interna usa um segredo próprio. O handler aceita somente POST e valida `x-agenda-cron-secret` com comparação de hashes antes de criar o cliente privilegiado. Sem segredo, retorna 401. O Cron obtém o segredo de Supabase Vault; ele não aparece no SQL versionado.

O processamento usa `FOR UPDATE SKIP LOCKED`, reserva com token e lease de cinco minutos. O worker processa pequenos lotes com orçamento de 45 segundos. A reserva, o status, as preferências e a validade do compromisso são conferidos novamente antes dos efeitos externos. Há até quatro tentativas, com recuo em falhas transitórias. Reservas expiradas são recuperáveis; tokens antigos não podem finalizar trabalho novo.

Cada canal possui estado independente. A notificação interna é inserida com unicidade por lembrete. Push guarda resultados por dispositivo; dispositivos que já tiveram envio aceito não são reenviados em uma falha parcial. HTTP 404/410 remove a subscription inválida, preservando o histórico técnico de entrega. Registros e logs não incluem nomes, preparo, observações ou conteúdo médico.

Reagendamentos invalidam as reservas antigas e criam lembretes da nova revisão. Confirmar o compromisso preserva os lembretes atuais; adicionar um horário de aviso cria somente os novos offsets, sem recriar o aviso de 24 horas já processado. Cancelamento, realização ou não comparecimento cancelam lembretes futuros. O cálculo usa `TIMESTAMPTZ` e subtração exata de 24 horas; a interface converte os instantes para `America/Belem` por padrão. A frequência do Cron implica uma janela de processamento de aproximadamente um minuto, além das condições do provedor/dispositivo.

Validação real do backend: chamada sem segredo retornou 401; chamada autorizada retornou 200, sem falhas. O Cron registrou execuções `succeeded`, com respostas HTTP 200 e sem timeout. Essas verificações ocorreram sem semear compromissos de teste no banco de produção.

## VAPID, variáveis e PWA

| Variável | Destino |
|---|---|
| `VITE_VAPID_PUBLIC_KEY` | Frontend; configuração pública, também registrada na Vercel Production |
| `VAPID_PUBLIC_KEY` | Segredos da Edge Function |
| `VAPID_PRIVATE_KEY` | Exclusivamente segredos da Edge Function |
| `VAPID_SUBJECT` | Contato público HTTPS do aplicativo, na Edge Function |
| `AGENDA_CRON_SECRET` | Edge Function e Vault; autenticação interna |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Disponibilizadas pelo ambiente hospedado do Supabase; nunca usadas no navegador |

Vault usa os nomes `agenda_cron_secret` e `agenda_project_url`. As chaves foram geradas e provisionadas, sem valores no Git. O preparador `scripts/prepare-agenda-secrets.mjs` conserva as chaves do arquivo local existente, configura somente a chave pública no frontend e prepara SQL operacional em arquivo ignorado. O arquivo privado `.env.agenda.local` precisa ser preservado em armazenamento seguro; gerar outro par VAPID exigiria reativar os dispositivos com as novas chaves.

`public/push-events.js` é importado pelo service worker Workbox existente; não registra outro worker. Trata `push` e `notificationclick`, usa mensagem genérica na tela bloqueada, tag estável com `renotify:false`, URL restrita ao próprio domínio e foco/reutilização de janela aberta. Vercel serve esse script com MIME correto e revalidação. Respostas privadas do Supabase continuam fora do cache.

A permissão só é solicitada pelo botão **Ativar lembretes de consultas e exames**, nas preferências da agenda. Recusa ou ausência de suporte preserva as notificações internas. O usuário pode remover o dispositivo atual. O logout também tenta remover a subscription; a chamada ao backend tem prazo limitado para não prolongar indevidamente a saída.

### Limites de entrega

Aceitação pelo serviço de push é registrada como `aceito_pelo_push`, e não como entrega comprovada no aparelho. Sem permissão, compatibilidade ou conectividade, a central interna continua disponível. Os pushes usam TTL de cinco minutos. No iOS/iPadOS, o aplicativo pode precisar estar instalado e aberto pela tela inicial.

Os testes cobrem transporte simulado e múltiplos dispositivos sintéticos; nenhum dispositivo pessoal recebeu uma notificação de teste. A entrega física precisa ser confirmada depois de uma pessoa ativar push explicitamente num navegador compatível. Em falhas de rede ambíguas após aceitação externa, não é possível prometer exatamente um envio físico; os registros por dispositivo e a tag do service worker reduzem duplicações e alertas repetidos. Uma mensagem já aceita pelo provedor pode chegar após uma alteração posterior no compromisso.

## Arquivos principais

Frontend: `src/pages/agenda.tsx`, `src/pages/appointment-detail.tsx`, `src/lib/agenda.ts`, `src/lib/agenda-push.ts`, `src/agenda.css`; componentes `appointment-form`, `agenda-preferences`, `agenda-upcoming`, `agenda-toast` e `notification-bell`. Integrações em `App.tsx`, `main.tsx`, `app-layout.tsx`, `home.tsx` e `filter-select.tsx`.

Backend: as três migrations, `supabase/agenda-cron.sql`, `supabase/config.toml`, `supabase/functions/processar-lembretes/index.ts` e `supabase/functions/_shared/reminder-worker.mjs`.

PWA/build: `public/push-events.js`, `vite.config.ts`, `vercel.json`, dependências e lockfile, configuração de lint para separar Deno do frontend, templates `.env.example` e `supabase/functions/.env.example`, scripts de preparação/auditoria estática e de PWA. O watcher de desenvolvimento ignora artefatos de testes, dados e arquivos operacionais para evitar recargas de formulários causadas por arquivos gerados.

Testes/operação: `tests/agenda.spec.ts`, fixtures de rede e autenticação, `tests-pwa/pwa.spec.ts`, `tests-edge/web-push-crypto.ts`, `scripts/test-agenda-db.mjs`, `scripts/test-agenda-worker.mjs`, `scripts/test-agenda-sw.mjs`, `scripts/prepare-agenda-secrets.mjs`, `scripts/verify-agenda-worker.mjs`, `scripts/check-agenda-readiness.mjs`, `scripts/audit-agenda-routes.mjs` e `supabase/validate-agenda-remote.sql`. As execuções também atualizaram relatórios técnicos em `data/dashboard-performance` e `data/product-design`; os artefatos da agenda ficam em `data/agenda`.

## Verificação e publicação

TypeScript, ESLint e build de produção passaram. Os testes SQL da agenda verificam CRUD, isolamento inclusive de administradores, manipulação de IDs de outro usuário, lembrete de 24 horas, sobreposição, revisão, idempotência, reagendamento, cancelamento, exclusão, falha parcial por dispositivo, expiração, filtros combinados, duração padrão e fuso inválido. Os testes anteriores do banco também passaram.

O worker e o service worker têm testes próprios de resultados, falhas, segurança de endpoints, payload genérico e clique. `deno check` passou para a Edge Function. O teste criptográfico no Deno gerou e assinou uma requisição VAPID com payload `aes128gcm`, usando chaves sintéticas e sem envio externo.

A suíte de navegador e os seis testes de PWA incluem 360, 390, 768, 1024, 1440 e 1920 px, calendários preenchidos, seleção de vínculos, conflito, persistência, leitura de notificações, permissão negada, exportação UTC e a continuidade do dashboard diante de uma resposta inválida. A execução final completa passou nos 83 cenários, sem falhas, incluindo o caso legado de contatos que havia excedido o prazo numa execução anterior. Os seis cenários de PWA passaram no último build. Os testes autenticados usam respostas HTTP ligadas ao PostgreSQL local PGlite; não utilizam a conta pessoal de alguém em produção.

### Resultado do deploy

- Target: **production**. Status: **READY**. Framework: Vite / Node 24.
- Projeto: `prj_1KcFEBw4fH3S2vBPysE6TkYxFczD`, equipe `anderson-pontes-projects`.
- Deployment: `dpl_DeCEzDzJxMe8PBHAiBaRLzLdHPGz`.
- URL permanente: https://minha-saude-cyan.vercel.app.
- Build Output API v3 estático com `--prebuilt`; 45 arquivos revisados, sem PDFs, dados de prestadores, SQL ou arquivos de ambiente.
- Os 45 hashes públicos conferem com o build local. A chave pública VAPID está no bundle; a chave privada e o segredo do Cron não estão.
- Página de login renderizada no Edge sem erros de JavaScript. Nove verificações públicas de rotas, manifest, service worker, script de push e ícones passaram.
- `/agenda` e `/agenda/:id` redirecionaram para o login em um navegador sem sessão; nenhuma RPC privada de agenda foi chamada antes da autenticação.
- Consulta de logs do novo deployment: zero registros de nível error na janela de dez minutos consultada. Essa consulta não constitui monitoramento contínuo e não inclui os logs do Supabase.
- Evidências: `data/agenda/deployment-inputs.json`, `production-assets.json`, `production-routes.json`, `remote-readiness.json`, `worker-production.json` e capturas em `data/agenda/screenshots`.

Os advisors de segurança não acrescentaram avisos às verificações anteriores; permanece o aviso preexistente de proteção de senhas vazadas no Auth.

Para futuras publicações da interface neste projeto já provisionado:

```powershell
npm.cmd run test:agenda
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run test:pwa
node scripts/prepare-vercel-static.mjs data/agenda
npm.cmd exec --yes --package=vercel@65.12.0 -- vercel project inspect --non-interactive --scope anderson-pontes-projects
npm.cmd exec --yes --package=vercel@65.12.0 -- vercel deploy --prebuilt --prod --scope anderson-pontes-projects --yes
node scripts/audit-dashboard-deployment.mjs data/agenda
npm.cmd run audit:pwa -- https://minha-saude-cyan.vercel.app
```

Alterações no worker usam deploy explícito de `processar-lembretes` pelo Supabase CLI. As migrations acima já estão aplicadas: não reexecutar manualmente seu DDL em produção. Novas mudanças devem usar migrations incrementais. A configuração operacional do Cron consulta os segredos existentes no Vault.

Referências técnicas: [Supabase — execução agendada de Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [segurança de Edge Functions](https://supabase.com/docs/guides/functions/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) e [MDN — Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API).
