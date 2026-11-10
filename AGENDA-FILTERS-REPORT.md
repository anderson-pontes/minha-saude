# Agenda — filtros com paginação e rolagem independente

## Diagnóstico

O seletor já utilizava Portal, mas não definia uma camada acima dos elementos posicionados do calendário. A consulta antiga `network_lookup` limitava o resultado a 20 itens e não fornecia cursor nem total: uma busca textual podia localizar um nome, porém a navegação não alcançava o restante do catálogo. A rolagem nas bordas do popup também podia atingir a página ou o calendário.

## Implementação

- `src/components/filter-select.tsx`: busca e rodapé fora da área rolável; contenção de roda do mouse nas bordas, cabeçalho e rodapé; opção selecionada fixada quando está fora dos resultados; carregamento incremental e recuperação de erro sem apagar opções já carregadas. Navegação por setas, Home/End, Enter, Escape e Tab; retorno do foco ao fechar. O contêiner rolável tem `tabIndex=-1` para evitar um ponto de Tab adicional criado pelo Chromium.
- `src/product-design.css`: camada compartilhada dos dropdowns, isolamento das camadas internas do calendário, altura limitada ao espaço disponível, opções com rolagem própria e ações de toque maiores em telas pequenas. O popup permanece ancorado ao campo, com correção de colisão e sem alterar as dimensões do calendário. Em formulários nativos, o Portal continua dentro do dialog e fora da área rolável.
- `src/components/searchable-paginated-combobox.tsx` e `src/lib/paginated-lookup.ts`: busca remota após 300 ms, cancelamento de requisições obsoletas, cache por usuário/categoria/busca, contrato validado, bloqueio de pedidos concorrentes e deduplicação por ID. A seleção usa o ID real e sua descrição permanece disponível fora da primeira página.
- `src/components/filter-combobox.tsx`: médicos, estabelecimentos, convênios e especialidades compartilham a implementação paginada. Tipo e status continuam seletores estáticos. Filtros geográficos mantêm sua implementação existente.
- `supabase/migrations/20261107235937_paginated_catalogue_lookup.sql`: nova RPC `network_lookup_page`, aplicada e registrada no projeto existente. Páginas de 20, limite máximo 50, cursor por nome normalizado e UUID, total dos resultados autorizados e indicador de próxima página. Busca sem distinção de acentos/maiúsculas. A função usa `SECURITY INVOKER`, associação ativa e as RLS existentes; não restringe autor histórico, situação cadastral ou existência de agendamentos. Nenhuma tabela, política ou cadastro foi substituído.

O rodapé mostra “Exibindo X de N” e “Exibir mais 20”. Ao atingir o fim, a ação desaparece. Uma falha na próxima página preserva os itens anteriores e permite tentar novamente. Alterar a busca inicia um cursor próprio; limpar a busca pode reutilizar páginas em cache. Alterar os filtros não muda o período nem o modo do calendário.

## Validação

- `scripts/test-paginated-lookup.mjs`: 1.054 médicos em 53 páginas, 1.053 estabelecimentos em 53 páginas e 47 convênios em três páginas; igualdade exata da sequência esperada, sem lacunas/duplicações. Verifica busca além do milésimo registro, acentos, registros inativos, autores diferentes, acesso admin/viewer, bloqueados/anônimos, cursores inválidos e limites.
- `tests/agenda-filters.spec.ts`: seis larguras (360, 390, 768, 1024, 1440 e 1920), toque, camada visível, dimensões do calendário, rolagem independente, busca/rodapé fixos, fim da lista, seleção fora da primeira página, cache, ausência de duplicações, erro/repetição e filtros combinados preservados nos quatro modos. Inclui seleção de um médico além do milésimo registro e prevenção de pedidos simultâneos.
- Capturas inspecionadas em `test-results/agenda-paginated-360.png` e `test-results/agenda-paginated-1440.png`.
- Lint, TypeScript/build, contratos da Agenda, worker, service worker e suítes de banco/RLS aprovados.
- Regressão completa: **91 testes de navegador aprovados**. Após o último ajuste CSS de toque e fonte no mobile, os dez testes de filtros/Agenda/toque passaram novamente e o build foi regenerado. PWA: seis testes locais aprovados.
- Banco real: consulta somente leitura com role `authenticated` e identidade de membro ativo; 1.186/1.186 médicos (60 páginas), 202/202 estabelecimentos (11 páginas) e 1/1 convênio, sem repetição e com todas as listas chegando ao fim. Evidência sem nomes ou identificadores pessoais: `data/agenda-filters/production-pagination.json`.
- Advisors antes/depois sem novos alertas. Permanece o aviso preexistente de proteção contra senhas vazadas desabilitada no Auth.
- API real: a nova RPC é reconhecida pelo PostgREST; acesso anônimo rejeitado com HTTP 401 / `42501` (`data/agenda-filters/production-api.json`).

## Publicação e limites

Interface publicada em **https://minha-saude-cyan.vercel.app/agenda**, deployment `dpl_FA3hVwdGfc17mRjgie4REe5hkrab`, estado `READY`, projeto e ambiente de produção existentes. Pacote exclusivamente estático, sem PDFs, dados do catálogo, SQL ou arquivos de ambiente.

Auditoria de produção: 45 arquivos com hashes iguais ao build local, login renderizado sem erros de JavaScript, nove verificações do PWA aprovadas e nenhum registro de erro retornado na consulta dos logs após o deploy. Evidências: `data/agenda-filters/deployment-inputs.json` e `production-assets.json`.

Os testes autenticados de navegador usam banco local com as migrations reais e transporte simulado; a consulta ao banco de produção verifica RLS e paginação reais. Não foi realizado login de uma pessoa real em produção. O teste automatizado de toque usa emulação; não substitui uma avaliação física de VoiceOver/TalkBack em aparelhos. Não há pendência de implementação para esta correção.
