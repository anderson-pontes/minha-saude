# Minha Saúde — redesign de produto, cores e responsividade

Implementação de frontend que amplia o espaço útil, padroniza os cards por linha e reorganiza a navegação e os detalhes. Nenhuma dependência foi adicionada. Banco, contratos de API, autenticação, permissões e relações existentes foram preservados.

## Componentes alterados

| Componente | Mudança |
|---|---|
| `src/components/app-layout.tsx` e `src/App.tsx` | Layout extraído do roteador, container fluido, sidebar completa/compacta, drawer móvel com links para toda a rede. Guards e logout preservados. |
| `src/components/network.tsx` | Cards com quatro regiões, duas especialidades e `+N`, nomes limitados visualmente a duas linhas, favorito com estado de processamento e rodapé alinhado. |
| `src/components/search-field.tsx` | Busca reutilizável com Enter, limpeza explícita e skeletons da grade. |
| `src/pages/network-directory.tsx` | Cabeçalho compacto, categorias com rolagem interna, toolbar e limpeza dos filtros aplicados. Alternar visualização e pesquisar rapidamente preserva o estado correto da URL. |
| `src/components/detail-sections.tsx` | Contatos compactos e seções relacionadas com oito itens por página, total e navegação acessível. |
| `src/pages/entity-detail.tsx` | Colunas principal/secundária, proporção 60/40 conforme espaço útil, contatos e vínculos reorganizados. |
| `src/product-design.css` e `src/main.tsx` | Tokens semânticos, tipografia, contraste, grades por largura útil, foco e estados de interação. |
| Testes existentes e novos | Navegação móvel atualizada para drawer; limites das especialidades atualizados; verificações de geometria, volume e zoom nativo. |

## Estrutura e altura dos cards

Cada card separa cabeçalho, especialidades, informações principais e ações. A grade usa `align-items: stretch`; cada card é uma coluna flexível com `height: 100%` e rodapé com `margin-top: auto`. Assim, os cards **da mesma linha** compartilham altura e posição do rodapé, sem masonry nem altura fixa que corte conteúdo.

O mínimo de 280 px dos cards de profissionais evita variações excessivas em cadastros com poucos dados. O conteúdo continua determinando a altura final. Nome, estabelecimento e especialidades extensas têm limites de duas linhas; os textos completos permanecem no DOM, nos nomes acessíveis/títulos e nas páginas de detalhes. São exibidas duas especialidades e um badge com o restante. As demais relações continuam acessíveis nos detalhes.

O favorito possui área reservada no cabeçalho para não sobrepor o nome. Editar e excluir permanecem no menu secundário, sem transformar o card inteiro em link. A exclusão continua exigindo confirmação. Hover tem borda e sombra discretas; movimentos são removidos quando a preferência por movimento reduzido está ativa.

## Container e breakpoints

O antigo limite de 1.160 px foi substituído por largura de 100%, máximo de 2.600 px e paddings de 16 a 40 px. A sidebar ocupa 224 px a partir de 1.200 px; entre 768 e 1.199 px ocupa 72 px, com ícones e nomes acessíveis. Abaixo de 768 px, um drawer substitui a navegação lateral e a antiga barra inferior.

A grade responde à largura **do container**, descontando navegação e paddings: duas colunas a partir de 600 px úteis; três a partir de 940; quatro a partir de 1.260; cinco a partir de 1.660. Gap de 18 px. O resultado medido foi:

| Viewport | Largura útil da grade | Colunas |
|---:|---:|---:|
| 360 px | 328 px | 1 |
| 390 px | 358 px | 1 |
| 768 px | 664 px | 2 |
| 1.024 px | 911 px | 2 |
| 1.280 px | 1.005 px | 3 |
| 1.440 px | 1.158 px | 3 |
| 1.920 px | 1.619 px | 4 |
| 2.560 px | 2.256 px | 5 |

As medições por viewport estão em `data/product-design/layout-*.json`, incluindo alturas e posições dos rodapés. Os testes verificam ausência de overflow da página e uniformidade por linha. A tabela mantém rolagem horizontal própria.

## Paleta e acessibilidade

Tokens semânticos em `product-design.css`: primary `#0F766E`, hover `#115E59`, subtle `#E7F5F2`, secondary `#2563EB`, background `#F6F8FB`, superfície branca, heading `#10253F`, texto `#334155`, borda `#E2E8F0` e cores semânticas de sucesso, alerta e exclusão. Os novos componentes não contêm cores hexadecimais.

O texto secundário foi ajustado de `#64748B` para `#607086`: a combinação anterior tinha contraste aproximado de 4,47:1 sobre o novo fundo; a nova tem 4,75:1. Texto principal sobre branco: 10,35:1; primary sobre branco: 5,47:1. Essas medições de tokens não equivalem a uma certificação WCAG completa.

O drawer reutiliza o modal nativo: mantém o foco dentro dele, bloqueia a rolagem do fundo, fecha por Escape ou pelo overlay e restaura o foco ao acionador. Os links mantêm nomes acessíveis na sidebar compacta. Os filtros conservam o rascunho e a aplicação explícita.

## Detalhes e contatos

Os contatos passam a linhas com ícone, identificação, número, principal e ações. Fonte/observações permanecem disponíveis em expansão acessível. Ligar, WhatsApp, e-mail, site e copiar usam os componentes e a normalização existentes.

A coluna secundária mostra vínculos com nome, especialidade e convênios no local, quando existentes. As relações são exibidas em páginas de oito itens com total e foco no título ao navegar, em vez de montar uma lista indefinida na tela. A proporção 60/40 é aplicada a partir de 900 px úteis; abaixo disso, os blocos se reorganizam em uma coluna.

## Testes executados

- Suíte completa: **61 testes aprovados**.
- Após os ajustes finais de contraste, truncamento, foco e processamento do favorito: **14 verificações direcionadas aprovadas**, incluindo as oito larguras e o zoom.
- Cenário adicional: **2.000 profissionais**, duas páginas consecutivas solicitando e renderizando 12 registros cada. Aprovado. Total de **62 cenários distintos de navegador verificados**.
- **6 testes PWA aprovados**, em Edge e Chrome.
- Lint, TypeScript e build de produção aprovados.
- CRUD, permissão de administrador/consulta, bloqueio de acesso, favoritos, filtros combinados, alternância Cards/Tabela, busca por contatos, importação e cache do dashboard incluídos na regressão.

O zoom foi aplicado **nativamente** em 125%, 150% e 200%, por uma extensão de teste em perfil temporário do Edge usando [`chrome.tabs.setZoom`](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom). O nível real, o viewport e o `devicePixelRatio` foram conferidos. Por exemplo, em 200% o viewport CSS passou de 1.416 para 708 px e o DPR passou de 1 para 2. A extensão não faz parte do aplicativo nem do pacote publicado. Evidências em `data/product-design/zoom-*.json`.

## Limites desta entrega

- A paginação de vínculos nos detalhes é de apresentação: o endpoint existente ainda retorna as relações do registro. As listagens gerais e a rede dos convênios continuam com paginação no servidor. Não houve mudança de API nesta tarefa.
- Os testes de layout e zoom usam Edge isolado, com dados sintéticos e PostgreSQL local real por trás das requisições interceptadas. Não foi automatizado login de conta real em produção nem teste em aparelho físico/Safari. A publicação é verificada separadamente por hashes, renderização do login e recursos PWA.

## Evidências visuais

As imagens usam dados sintéticos com nomes extensos, cinco especialidades, múltiplos vínculos, campos ausentes e contatos de teste.

[Desktop amplo](data/product-design/screenshots/network-1920.png) · [Ultrawide](data/product-design/screenshots/network-2560.png) · [Mobile](data/product-design/screenshots/network-390.png) · [Detalhes](data/product-design/screenshots/detail-1440.png) · [Zoom nativo 200%](data/product-design/screenshots/zoom-200.png)

## Publicação

Destino: projeto existente `anderson-pontes-projects/minha-saude`, URL https://minha-saude-cyan.vercel.app. O pacote contém somente o build estático. Dados de importação, PDFs, perfis de teste, extensão de zoom e arquivos de ambiente ficam fora da publicação.

Deployment `dpl_6g5YfQqNTBKYaF6fMhLdENN1Wu7a` publicado e conferido: 35 arquivos com hashes idênticos ao build, login renderizado sem erros JavaScript e oito recursos/rotas PWA aprovados. Detalhes em `data/product-design/deployment.json`, `production-assets.json` e `tests.json`.
