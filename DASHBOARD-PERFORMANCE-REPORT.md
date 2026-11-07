# Dashboard — diagnóstico e correção de 05/11/2026

**Correção aplicada no Supabase e publicada em produção em 05/11/2026.** A interface nova, com RPC compacta, skeletons, cache e erros por seção, está ativa em [minha-saude-cyan.vercel.app](https://minha-saude-cyan.vercel.app). Foram validados 43 testes da aplicação, seis de PWA e os hashes dos 35 arquivos estáticos publicados. Não houve alteração de cadastros ou favoritos.

## Evidência antes da alteração

As duas seções chamavam `/rest/v1/rpc/search_network`, com seis recentes e quatro favoritos. Apesar do limite, a função montava `network_document` para todos os aproximadamente 1.451 cadastros, incluindo seus relacionamentos, antes de filtrar favoritos, ordenar e paginar. Cada `network_document` fazia diversas consultas, algumas construindo listas de centenas de profissionais de uma especialidade ou convênio. Isso multiplicava o trabalho mesmo quando quase nenhum registro seria exibido.

Os logs HTTP reais do Supabase, na janela de 24 horas inspecionada antes da correção, registraram:

| Endpoint | HTTP | Ocorrências | Tempo médio upstream | Máximo |
| --- | --- | ---: | ---: | ---: |
| search_network | 500 | 29 | 8.011,7 ms | 8.066 ms |
| search_network | 200 | 44 | 1.513,2 ms | 7.032 ms |
| get_my_profile | 200 | 54 | 10,7 ms | 55 ms |
| network_summary | 200 | 24 | 16,2 ms | 140 ms |
| token | 200 | 15 | 24,1 ms | 97 ms |

Todos os 39 eventos de cancelamento PostgreSQL `57014` encontrados na consulta de diagnóstico referenciavam `search_network`. O role autenticado tinha `statement_timeout=8s`, coerente com os erros HTTP. A estatística de consultas bem-sucedidas tinha pico de 6.830 ms; ela não contabiliza as consultas canceladas. Autenticação e resumo eram rápidos na maioria das chamadas; não eram o gargalo principal.

O retry padrão do frontend repetia a consulta cara e prolongava o estado de loading. O cache também era limpo em todo evento de Auth, inclusive `SIGNED_IN` repetido e refresh sem mudança de usuário. Isso podia provocar novas consultas e remontar telas sem necessidade.

## Medição reproduzível antes/depois

Medições no banco real, em transação READ ONLY, com role `authenticated`, três execuções por operação. O relógio é medido dentro do PostgreSQL, excluindo inicialização do CLI e trânsito HTTP. Não são tempos de carregamento completo da página.

| Operação | Antes, média | Depois, média | Resposta antes/depois |
| --- | ---: | ---: | ---: |
| Seis recentes | 6.128,02 ms | 13,21 ms | 17.530 / 3.688 bytes |
| Favoritos, dois existentes | 6.051,64 ms | 5,88 ms | 32.587 / 1.826 bytes |
| Resumo | 0,98 ms | 0,92 ms | 78 / 78 bytes |
| RPC antiga: recentes | 6.128,02 ms | 29,90 ms | contrato completo preservado |
| RPC antiga: favoritos | 6.051,64 ms | 36,66 ms | contrato completo preservado |

Arquivos: `data/dashboard-performance/before.json`, `after.json` e os SQL correspondentes. O benchmark pode ser repetido com `node scripts/benchmark-dashboard.mjs before` ou `after`; o nome “before” descreve a operação antiga, não restaura a função anterior.

## Banco e API

Migration aplicada e registrada: `20261105000050_dashboard_performance`.

- `dashboard_network(section,size)` seleciona primeiro os IDs de uma seção, com limite máximo de 12. Favoritos pessoais são filtrados antes de montar os cards.
- `network_card(type,id)` retorna os campos usados no resumo: dados essenciais, contato principal e WhatsApp, um endereço, até três especialidades e até três nomes de locais. Não retorna o grafo completo de hospitais, médicos ou convênios. A tela de detalhes continua usando `network_document`.
- `search_network` ganha um caminho rápido para consultas sem filtros relacionais/textuais, incluindo as duas consultas usadas pelo frontend anterior. Mantém a resposta completa e o comportamento da listagem. Filtros complexos preservam o caminho existente; esta correção não afirma otimizar toda busca textual da rede.
- Índices de ordenação compartilhada em `(created_at desc,id)` nas quatro categorias. Índices anteriores começavam pelo autor, que não filtra mais a rede compartilhada.
- As funções continuam `SECURITY INVOKER`, com autorização de membro ativo e RLS existentes. Nenhum cadastro, favorito, permissão, timeout global ou configuração de Auth foi alterado.

A validação remota confirmou: seis recentes com os mesmos IDs da RPC anterior, dois favoritos compatíveis com os favoritos pessoais do usuário, limites dos cards, 202 estabelecimentos, 1.186 profissionais, 62 especialidades e um convênio preservados; RPC nova sem acesso anônimo.

## Requisições e autenticação no frontend

- Reutiliza TanStack Query, sem bibliotecas novas. As seções têm chaves distintas e consultas independentes, cache fresco por 60 segundos, retenção por cinco minutos e sem refetch automático no foco para os dados do catálogo.
- Criar um cadastro ou alterar favoritos usa as invalidações existentes; as novas consultas compartilham o prefixo `network`. Voltar ao Dashboard reutiliza o cache.
- Leituras usam o `AbortSignal` do Query e timeout configurável `VITE_READ_TIMEOUT_MS`, padrão de 15 segundos, entre um e 60 segundos. Desmontar a tela cancela consultas obsoletas. Escritas não recebem deadline automático para não comunicar cancelamento como se uma gravação necessariamente tivesse sido revertida.
- Retry limitado a uma nova tentativa, com backoff, para falhas transitórias. Sem retry automático para 401/403, validações, cancelamento, timeout e `57014`.
- Consultas aguardam sessão e perfil autorizado. Erros do perfil não provocam polling infinito; conexão pausada sem perfil não deixa um spinner indefinido. Falta de acesso continua bloqueando a rede.
- Cache privado é limpo quando a identidade muda ou a sessão termina, preservando-o quando apenas o token/evento de login é renovado para a mesma conta. Respostas antigas da inicialização não substituem uma sessão mais nova.

## Estados visuais

Skeletons por seção, cores discretas, layout mobile/desktop e respeito a movimento reduzido. Uma consulta ativa após três segundos mostra aviso de lentidão; três segundos não são um erro. Falhas exibem título e descrição contextualizados, e o botão reexecuta somente sua seção. O botão fica visível e desabilitado durante retry. Dados anteriores são mantidos numa falha de revalidação, identificados como anteriores. Listas vazias válidas têm mensagens próprias.

O wrapper HTTP de desenvolvimento emite duração, método, caminho sem query string, status e identificador de correlação disponível. Não emite cabeçalhos de autorização, corpo da requisição, resposta com registros, senha ou token. O evento `minha-saude:request` e o console `[Minha Saúde HTTP]` permitem cruzar DevTools e logs. A instrumentação é desativada no build de produção.

## Network do navegador e limites de observação

O acesso à sessão Chrome do usuário não estava disponível: o host de automação de navegador recusou conexão. O inventário global de janelas também foi rejeitado pela revisão automática por possível exposição de conteúdo particular sem relação com o Dashboard. Não foram extraídos tokens nem inspecionadas páginas particulares.

A investigação usou os logs HTTP reais do serviço para o diagnóstico de produção. Os testes de interface capturam requests/responses no Edge isolado, com Auth controlado e as RPCs reais em PostgreSQL local através do adaptador HTTP de testes. `data/dashboard-performance/browser-network.json` registra duas respostas 200, uma por seção, sem dados pessoais. Esse teste valida o fluxo e a ausência de chamadas redundantes na navegação; seus tempos locais não são apresentados como latência HTTP da sessão real do usuário.

## Verificações

- TypeScript, ESLint e build de produção aprovados.
- Fundação, fase 2 e acesso compartilhado: regressão de banco aprovada.
- `node scripts/test-dashboard-db.mjs`: 1.500 cadastros, favoritos pessoais entre admin/viewer, acesso anônimo recusado, contatos limitados, zero chamadas de detalhe completo no Dashboard e exatamente seis chamadas para uma página de seis registros pela RPC antiga.
- Testes de Dashboard: sucesso rápido, vazios, consulta lenta e recuperação, HTTP 500/401/403, rede indisponível, deadline, cancelamento no unmount, falha com cache, skeletons em 390 px e movimento reduzido, gate de Auth, navegação com cache, inclusão/remoção de favorito e novo cadastro.
- PWA: seis testes aprovados em Edge e Chrome.
- Regressão completa da aplicação: 43 testes aprovados, incluindo os 13 cenários de Dashboard; resultado final em `data/dashboard-performance/validation.json`.
- Publicação real: 35 arquivos com hash idêntico ao build testado, login renderizado no Edge isolado sem erro JavaScript, oito verificações HTTP de rotas/PWA aprovadas.

## Arquivos

Alterados: `src/pages/home.tsx`, `src/lib/network.ts`, `src/lib/supabase.ts`, `src/lib/auth.tsx`, `src/lib/access.tsx`, `src/App.tsx`, `src/refinement.css`, `.env.example`, `package.json`, `tests/fixtures/network.ts` e `tests/foundation.spec.ts`.

Criados: `src/lib/requests.ts`, `src/lib/rpc.ts`, `src/components/dashboard-state.tsx`, `tests/dashboard.spec.ts`, `scripts/test-dashboard-db.mjs`, `scripts/benchmark-dashboard.mjs`, `scripts/prepare-vercel-static.mjs`, `scripts/audit-dashboard-deployment.mjs`, a migration, `supabase/validate-dashboard-remote.sql`, `supabase/applied-dashboard-performance.json`, este relatório e os artefatos em `data/dashboard-performance/`. O README aponta para esta conclusão.

## Publicação

A publicação foi concluída no projeto existente `prj_1KcFEBw4fH3S2vBPysE6TkYxFczD`, implantação `dpl_GZYRYH2p18aq5THKK2XUEajV2xKz`, promovida ao domínio já utilizado. A implantação anterior `dpl_47imKLDTHUg8jbTUcDLmSeWfTJDX` foi preservada para eventual rollback.

O builder local da Vercel encontrou `EPERM` ao criar symlinks no Windows. Foi utilizado o [formato oficial Build Output API v3](https://vercel.com/docs/build-output-api/configuration), com somente os arquivos estáticos do build já validado. O empacotamento verifica o projeto Supabase e rejeita configuração de testes/placeholders. Não foram enviados PDFs, dados de prestadores, SQLs ou arquivos de ambiente; nenhuma chave de bypass de proteção foi criada. Cabeçalhos, deep links, assets e PWA foram verificados no domínio público.

O login real do usuário no Minha Saúde não foi automatizado nem suas credenciais foram solicitadas: a validação de produção cobriu o build servido e a renderização do login, complementada pelas consultas reais como `authenticated` e pelos testes funcionais com Auth controlado. Se o PWA estiver aberto numa versão anterior, aceitar a atualização ou recarregar para usar a interface nova.

A auditoria de segurança manteve somente o aviso anterior de [proteção contra senhas comprometidas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Não foi introduzido aviso de segurança nesta migration nem alterada a configuração de Auth.
