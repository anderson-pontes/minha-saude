# Minha Saúde — filtros, cards e rede dos convênios

O convênio continua uma entidade central. A listagem exibe um resumo compacto; `/convenios/:id` permite explorar estabelecimentos, profissionais e especialidades em páginas de 12 registros. A identidade clara, branca e verde-petróleo foi preservada.

## Componentes e experiência

- `src/pages/network-directory.tsx`: um único botão de cadastro por categoria, busca adequada aos convênios, quatro ordenações, alternância Cards/Tabela e chips removíveis. Busca, ordenação e filtros permanecem na URL; alternar a visualização preserva inclusive a página.
- `src/components/network-filters.tsx`: três grupos de filtros, edição em rascunho, aplicação explícita, contador e rodapé fixo. Limpar não altera resultados até confirmar. Alterar UF/cidade informa quando os campos dependentes são limpos.
- `src/components/filter-combobox.tsx` e `src/lib/explorer.ts`: combobox único por critério, busca remota com debounce de 250 ms, seleção identificada, opção Todos, limpeza, navegação por teclado, carregamento e tentativa novamente. Busca de profissionais limitada a 20 opções; localidades limitadas a 30, pesquisáveis.
- `src/components/dialog.tsx`: modal nativo com Escape, foco contido, retorno ao acionador e bloqueio da rolagem do fundo. O corpo dos filtros rola internamente; o rodapé não cobre os campos.
- `src/components/network.tsx`: cards com altura natural, favorito no cabeçalho, até três especialidades e indicador do restante, um estabelecimento e indicador dos demais, localização resumida e ação principal. Editar/Excluir ficam em opções secundárias; exclusão mantém confirmação e permissões.
- `src/pages/health-plan-detail.tsx` e `entity-detail.tsx`: cabeçalho e quatro indicadores, abas com busca, cidade, especialidade, tipo quando aplicável, ordenação e paginação no servidor. Uma especialidade abre os respectivos estabelecimentos ou profissionais. Abas também aceitam setas, Home e End.
- `src/lib/network.ts` e `src/refinement.css`: respostas compactas no catálogo, consulta específica de resumo para convênios, cache/abort existentes e grid baseado na largura do container, com até três colunas.

## Modelo e consultas

Os dados importados já estavam normalizados em `health_plans`, `establishments`, `doctors`, `specialties` e tabelas de vínculo. Não foi necessário migrar nomes concatenados, criar cópias de clínicas, recriar entidades ou alterar tabelas/colunas/RLS.

Foram aplicadas e registradas quatro migrations **de consultas**: `20261106014906_network_explorer`, `20261106235136_network_card_locations`, `20261106235500_network_search_contacts` e `20261106235906_network_search_contact_plan`. As complementares preservam o histórico das versões já aplicadas durante a validação.

- `health_plan_overview`: metadados e totais distintos, sem arrays de credenciados. Operadora e registro são lidos das observações existentes da importação; permanecem ausentes quando não informados nesse formato. O texto original é preservado.
- `health_plan_network`: vínculos filtrados e paginados no servidor.
- `browse_network`, `network_card` e `network_scoped_card`: filtragem antes de construir os resumos, listas relacionadas limitadas e endereço de atendimento compatível com o plano.
- `network_lookup` e `network_locations`: opções pequenas e pesquisa remota, sem baixar o catálogo de profissionais.

Um vínculo de um profissional com uma clínica **não** implica aceitação automática de todos os convênios da clínica. Vínculos diretos e vínculos específicos de profissional/local/plano são considerados explicitamente. Especialidades por local também são respeitadas. Todas as novas funções usam `SECURITY INVOKER`, conservam RLS e não permitem execução anônima.

## Verificação na base real

UNICASF: **202 estabelecimentos, 1.186 profissionais, 61 especialidades e 2 cidades**. O catálogo contém 62 especialidades ao todo; a especialidade adicional não foi indevidamente incluída no plano.

A resposta da listagem de convênios tem **712 bytes**; o resumo isolado, **649 bytes**. Nenhum deles contém a lista de estabelecimentos ou profissionais. Duas páginas consecutivas de profissionais retornaram 12 itens cada, sem sobreposição e sem locais fora dos vínculos explícitos do plano.

Medições de três amostras por operação, feitas dentro do PostgreSQL com papel `authenticated`, estão em `data/network-explorer/benchmark.json`. São tempos de banco; não incluem transporte de rede ou renderização. A busca combinada por cidade e especialidade foi otimizada após medição, mantendo os resultados. A busca também preserva telefone, e-mail, site e CNPJ.

| Consulta | Tempo no banco (ms) | Bytes da resposta |
|---|---:|---:|
| plan_list | 21.36 a 31.58 | 712 |
| overview | 10.52 a 11.7 | 649 |
| establishments | 42.41 a 52.16 | 15099 |
| doctors | 81.5 a 97.32 | 14014 |
| specialties | 17.31 a 18.28 | 2178 |
| filtered_doctors | 510.64 a 511.62 | 14091 |
| lookup | 21.75 a 22.21 | 1773 |
| directory | 35.05 a 40.08 | 13815 |

`data/network-explorer/validation.json` registra somente agregados. `supabase/validate-explorer-remote.sql` permite repetir a auditoria em transação somente de leitura. Nenhuma relação foi criada ou excluída por essas validações.

## Testes e evidências

Foram verificados 49 cenários de navegador: 48 passaram na execução completa; um atingiu timeout na captura de página inteira do Edge depois de todas as asserções funcionais passarem. Mantidas as asserções, a captura passou a registrar o viewport com animações desativadas, e o teste isolado passou. A execução final das sete verificações das telas alteradas passou integralmente. Também passaram os seis testes de PWA em Edge/Chrome, os quatro testes do parser e as suítes SQL, importação/reimportação, contatos, lint, TypeScript e build. Detalhes em `data/network-explorer/tests.json`.

- SQL: migrations completas em PGlite, contadores distintos, paginação e limites, ordenação, filtros combinados, escopo de local/especialidade/plano, opções remotas e acesso admin/viewer/bloqueado/anônimo.
- Navegador: fluxos reais de RPC local em PostgreSQL por trás das requisições HTTP interceptadas; as páginas de convênios não chamam `network_document` nem `search_network`.
- Desktop 1440 px, tablet 768 px e celular 390 px: card compacto, tabela, indicadores, abas, paginação, pesquisa e filtros; grid com três/duas/uma coluna e ausência de rolagem horizontal da página.
- Modal: rascunho não altera a URL, aplicação persiste, Escape descarta mudanças e devolve foco, seleção por teclado, dependências, chips e limpeza.
- Cards: limites e indicadores de relações numerosas, favorito, menu secundário e cancelamento da exclusão.
- Cadastros/edição, contatos, importação UNICASF, acesso compartilhado, dashboard, build, lint, TypeScript e PWA foram incluídos na validação.

Capturas de testes: `test-results/explorer-plans-{390,768,1440}.png`, `explorer-professionals-{390,768,1440}.png` e `explorer-filters-{390,1440}.png`. Usam dados sintéticos com 35 credenciados para testar múltiplas páginas; os totais da base real são os acima.

O login de uma conta real no aplicativo não foi automatizado. A verificação combina navegador isolado com autenticação controlada, SQL real na Supabase sob RLS e auditoria dos arquivos publicados.

## Publicação

Destino: https://minha-saude-cyan.vercel.app/convenios, projeto existente `anderson-pontes-projects/minha-saude`. O pacote contém somente arquivos estáticos do build; PDFs, dados de importação e arquivos de ambiente não são enviados. Os hashes e a tela de login são conferidos após publicar.

O aviso preexistente da Supabase sobre proteção contra senhas vazadas desativada continua registrado; não foram alteradas configurações de autenticação nesta tarefa.

Publicação concluída: `dpl_DqYZh67ncfG8mrQo32yhqX11az8B`. Os 35 arquivos conferidos corresponderam aos hashes do build; login renderizado sem erros JavaScript e oito recursos/rotas PWA aprovados. Evidências em `data/network-explorer/deployment.json` e `production-assets.json`.

[Card desktop](data/network-explorer/screenshots/plan-desktop.png) | [Card mobile](data/network-explorer/screenshots/plan-mobile.png) | [Filtros](data/network-explorer/screenshots/filters-desktop.png) | [Profissionais no tablet](data/network-explorer/screenshots/professionals-tablet.png)
