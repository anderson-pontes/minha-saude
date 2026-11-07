# Correção dos filtros — Minha Saúde

O usuário abre “Filtrar minha rede”, escolhe filtros consultando `network_lookup` e `network_locations`, e aplica o rascunho para atualizar a listagem com `browse_network`. As consultas e os relacionamentos existentes foram preservados.

## Causa e correção

O componente anterior colocava a lista dentro do campo, no fluxo do formulário, com `position: relative`. Sua abertura aumentava o conteúdo rolável e deslocava os campos seguintes. Tipo e Status usavam selects HTML diferentes dos outros filtros.

`FilterSelect` agora reúne as duas variantes: Radix Select para Tipo, Status e UF; Radix Popover com pesquisa interna e listbox para Especialidade, Médico/profissional, Convênio, Cidade e Bairro. A largura segue o acionador; listas extensas têm rolagem interna; Radix mede colisões e escolhe a posição acima ou abaixo.

O modal existente usa `<dialog>` nativo. O portal é inserido dentro desse dialog, como irmão da área rolável, mantendo a camada modal e a interação. A área `.filter-scroll` limita as colisões para preservar cabeçalho e rodapé. Fora de dialogs, o portal usa o body e os limites da viewport. Não há posicionamento manual por coordenadas ou z-index extremo.

Todos os acionadores têm altura de 44 px, raio de 10 px, ChevronDown e estados de foco, abertura, seleção e limpeza consistentes. A variante pesquisável mantém o valor escolhido no acionador e o texto de busca dentro da lista. Debounce de 250 ms, cache e cancelamento das consultas existentes são mantidos; opções de uma busca anterior ficam indisponíveis enquanto a nova busca carrega. Falhas mostram ação de tentar novamente.

Escape fecha somente o dropdown e devolve foco ao campo; uma segunda pressão fecha o modal. Selecionar ou clicar fora fecha a lista. Rascunho, aplicação, limpeza, contagem e filtros previamente aplicados permanecem no formulário existente. Selecionar novamente o mesmo estado ou cidade não limpa dependentes; ao mudar, mantém-se a regra anterior de limpar os filtros subordinados.

## Arquivos

- `src/components/filter-select.tsx`: componente compartilhado e primitivas Radix.
- `src/components/filter-combobox.tsx`: adaptação das consultas existentes ao componente.
- `src/components/network-filters.tsx`: substituição de Tipo e Status e proteção contra atualização sem mudança.
- `src/product-design.css`: aparência e limites das listas flutuantes.
- `package.json` e `package-lock.json`: versões exatas de Radix Popover e Select.
- `tests/filter-selects.spec.ts`: geometria, foco, teclado, listas extensas, colisões e recuperação de falha.
- `tests/filter-touch.spec.ts`: seleção por toque e aplicação dos filtros em 360 e 390 px.
- `tests/explorer.spec.ts` e `tests/network.spec.ts`: adaptação à pesquisa interna.
- Scripts de preparação/auditoria: diretório de evidências `data/filter-selects`.

## Verificação

Os testes de navegador usam Edge e consultas reais em PostgreSQL local PGlite, com HTTP/Auth interceptados pela fixture. Abrangem 360, 390, 768, 1024, 1440 e 1920 px; cada campo é aberto individualmente e sua largura/altura, os limites da viewport e a estabilidade da altura e do scrollHeight do formulário são medidos. Também verificam busca, seleção por teclado, retorno de foco, Escape, clique externo, dependências, aplicação, limpeza, reabertura e recuperação após HTTP 403 controlado.

Um cenário adicional de 390 × 560 px confirma abertura acima do campo, seleção no fim da lista e preservação do rodapé. Capturas usam dados sintéticos e animações desativadas para inspeção visual.

Resultados: suíte completa com **70 testes aprovados**; após os ajustes finais de teclado e proteção da seleção vazia, **16 testes direcionados aprovados**, incluindo dois novos cenários de toque emulado (360 e 390 px). São 72 cenários de navegador distintos. TypeScript, ESLint, build de produção e `git diff --check` passaram. Os seis testes de PWA em Edge e Chrome também passaram. As evidências visuais estão em `data/filter-selects/screenshots`.

## Publicação e verificação pública

- URL: https://minha-saude-cyan.vercel.app
- Target: production. Status: **READY**. Framework: Vite, Node 24.
- Projeto confirmado: `prj_1KcFEBw4fH3S2vBPysE6TkYxFczD`, equipe `anderson-pontes-projects`.
- Deployment: `dpl_3aPvyWD7tshxcSVmpSvFWd2v2z8n`.
- Método: Build Output API v3 estático, `--prebuilt`; somente os 35 arquivos estáticos revisados, sem PDFs, dados de prestadores ou arquivos de ambiente.
- Os 35 hashes dos arquivos públicos conferem com o build local. Página de login renderizada no Edge, sem erros de JavaScript.
- Oito verificações públicas de rotas, manifest, service worker e ícones passaram.
- Consulta de logs do novo deployment: zero registros de nível error na janela de dez minutos consultada. Essa consulta não representa monitoramento contínuo nem inclui os logs do Supabase.
- Manifesto de publicação e auditoria: `data/filter-selects/deployment-inputs.json` e `data/filter-selects/production-assets.json`.

Nenhuma migration ou alteração no banco Supabase é necessária para esta correção. Os testes funcionais autenticados são locais; a verificação pública de produção não usa credenciais de um usuário real.
