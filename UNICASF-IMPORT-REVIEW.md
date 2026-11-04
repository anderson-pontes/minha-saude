# Importação UNICASF — revisão de 04/11/2026

**Importação remota concluída após autorização em 04/11/2026.** Criados: 202 estabelecimentos, 1.186 profissionais, 61 especialidades, um convênio UNICASF, 629 contatos, 275 endereços e 6.640 vínculos. As 17 identidades profissionais pendentes e seus 68 vínculos foram excluídos da gravação e preservados na auditoria. Uma especialidade preexistente foi mantida (62 no banco). Evidências: data/unicasf-review/remote-execution.json, remote-validation.json e supabase/applied-unicasf.json. As seções iniciais abaixo documentam a revisão anterior à execução.

## Resultado dos documentos

| Indicador | Resultado |
| --- | ---: |
| Páginas físicas de Belém | 69/69 |
| Páginas físicas de Ananindeua | 6/6 |
| Blocos de prestadores em Belém | 242 (185 estabelecimentos, 57 profissionais com cadastro próprio) |
| Blocos de prestadores em Ananindeua | 18 estabelecimentos |
| Estabelecimentos únicos por CNPJ válido | 202 |
| Candidatos a profissionais após conciliação | 1.203 |
| Identidades profissionais completas | 1.187 |
| Profissionais aptos à importação | 1.186 |
| Identidades profissionais incompletas | 16 |
| Identidade com conflito de nomes | 1 |
| Especialidades | 61 |
| Convênios | 1, UNICASF Saúde |
| Vínculos extraídos, incluindo pendentes | 6.708 |
| Vínculos com ambas as pontas aptas | 6.640 |
| Vínculos dependentes dos profissionais pendentes | 68 |

Os 1.203 candidatos não são uma garantia de 1.203 pessoas diferentes: as 16 identificações incompletas permanecem separadas para revisão. Não houve fusão por nome. Uma pessoa jurídica encontrada nos dois municípios é reutilizada pelo CNPJ, preservando suas unidades.

| Vínculo extraído | Quantidade |
| --- | ---: |
| Profissional × estabelecimento | 1.367 |
| Profissional × estabelecimento × convênio | 1.367 |
| Profissional × especialidade | 1.297 |
| Profissional × estabelecimento × especialidade | 1.443 |
| Estabelecimento × especialidade | 975 |
| Estabelecimento × convênio | 202 |
| Profissional × convênio em cadastro próprio | 57 |

O credenciamento institucional não gera credenciamento global do profissional. Serviços como ultrassonografia, tomografia, ressonância e RPG ficam no texto de serviços e na auditoria; não entram indiscriminadamente no catálogo de especialidades. Áreas pediátricas sem profissional nominal também são preservadas.

## Pendências que precisam de revisão

- O arquivo de Ananindeua tem **6 páginas físicas**, mas seus rodapés dizem **/7**. Todas as páginas recebidas foram processadas; não é possível afirmar que a rede documental esteja completa. O modo estrito bloqueia execução enquanto essa advertência existir.
- Há **16 candidatos com conselho/UF/número incompletos**. Os nomes, campos originais e páginas estão em `data/unicasf-review/import.entities.csv` e no JSON. Não foram completados com UF presumida.
- Na página 51 de Belém, **Francisco Dias de Lucena** e **Francisco Lucena Neto** compartilham **CRM-PA 15361**. A identidade inteira fica pendente; nenhum dos nomes é escolhido automaticamente para gravação.
- Existem **3 ocorrências de CEP ausente** e **3 campos de telefone vazios**. Os dados originais são preservados; esses campos opcionais não são inventados e, isoladamente, não bloqueiam o estabelecimento.
- Não há linhas de corpo sem classificação. Todo texto integral, inclusive preâmbulo, páginas, coordenadas e campos vazios, está preservado no JSON de auditoria.

`import.csv` reúne 20 alertas por documento/registro/página. `import.entities.csv` permite revisar cada entidade e suas fontes. As advertências de registros e as pendências de entidades têm granularidades diferentes: um bloco pode conter vários profissionais incompletos.

## Diagnóstico da arquitetura e do banco

Frontend React/TypeScript/Vite; persistência Supabase/PostgreSQL via `@supabase/supabase-js`. Não há backend FastAPI nem ORM. As funções `save_network_entity`, `network_document` e `search_network` são a camada existente de gravação e consulta. Foram examinadas as migrations de fundação, rede e acesso compartilhado, permissões, categorias, formulários, detalhes, buscas, contatos e testes existentes.

O modelo já contém estabelecimentos, profissionais, especialidades, convênios, contatos, endereços e tabelas de associação. `user_id` é autor histórico; usuários ativos consultam a rede compartilhada. Administração exige perfil admin ativo, e favoritos são pessoais. O importador mantém esse modelo.

A consulta remota agregada, somente leitura, retornou: **0 estabelecimentos, 0 profissionais, 1 especialidade e 0 convênios**. A consulta mínima ao nome da especialidade não encontrou correspondência no catálogo extraído. Assim, o inventário sugere **1.450 entidades aptas novas e 0 reutilizações**, além das 17 identidades profissionais pendentes. Esse inventário é uma fotografia; deve ser reconferido pelo preview transacional após a migration, antes da execução. A especialidade existente é preservada.

A tentativa inicial de consultar registros completos foi rejeitada pela revisão automática por possível exposição de dados. A alternativa reduzida (contagens e nome do catálogo de especialidades) foi aprovada e foi suficiente para este inventário. Não foi tentado contornar a rejeição nem buscar contatos ou registros completos remotamente.

## Migration preparada, ainda não aplicada remotamente

`supabase/migrations/20261104232122_unicasf_import.sql`:

- CNPJ e índice único em estabelecimentos; tipo profissional e índice de registros em profissionais.
- Extensão da tabela de endereços para endereço próprio de um profissional OU estabelecimento, com FK e validação de exclusividade. Não cria clínica fictícia para profissionais autônomos.
- Credenciamentos e especialidades por profissional/estabelecimento, ligados ao vínculo institucional real. Remover esse vínculo remove suas associações locais; editar os mesmos vínculos os preserva.
- Auditoria `network_import_runs` com payload integral, digest do artefato, autor, resultados e IDs. Leitura de auditoria restrita a administradores; entidades e vínculos seguem a leitura compartilhada existente.
- Preview somente leitura; execução transacional; resolução por CNPJ/conselho/UF/número; correspondências fracas ou múltiplas exigem revisão. Inserções de entidades reutilizam `save_network_entity`; enriquecimentos são aditivos, sem substituir coleções existentes ou dados manuais por valores vazios.
- Reimportação pelo mesmo digest devolve o resultado anterior. Outro digest ainda reutiliza identidades e evita duplicar contatos, endereços e vínculos.
- Consultas e detalhes expõem endereços próprios e convênios/especialidades por local. O filtro de convênio também encontra profissionais que só têm cobertura institucional. A busca materializa os documentos uma vez por consulta.
- Ajuste da gravação existente para preservar vínculos selecionados e atualizar suas observações, evitando perder os credenciamentos locais durante edição.

Nenhum `TRUNCATE`, exclusão em massa, recriação de tabela ou substituição dos cadastros existentes faz parte da importação. Não executar `db push` indiscriminadamente: o histórico manual anterior do projeto exige aplicar/reconciliar apenas a migration nova revisada.

## Executar a simulação

Na raiz da aplicação (`minha-saude/`):

```powershell
python -m pip install -r scripts/imports/requirements.txt
npm.cmd run import:unicasf -- --file "data/Belém-UNICASF-13mar2026.pdf" --file "data/Ananindeua-UNICASF-13mar2026.pdf" --dry-run --offline --report data/unicasf-review/import
```

PyMuPDF 1.26.7 é a única biblioteca adicionada; fica isolada do frontend. Nesta sessão foi instalada em `.tools/python` no workspace externo e acessada por `PYTHONPATH`. Não foram adicionados pacotes npm.

`--offline` produz extração e auditoria sem conexão ao banco; informa expressamente que não reconciliou registros remotos. `--strict` retorna código 2 se houver pendências, depois de gerar os relatórios.

Após aplicação autorizada da migration, configurar no processo `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_ACCESS_JWT` (JWT de acesso de administrador ativo). Não colocar JWT ou chave privilegiada em `VITE_*`. O CLI não requer service role nem senha de banco.

```powershell
npm.cmd run import:unicasf -- --from-json data/unicasf-review/import.json --dry-run --strict --report data/unicasf-review/import
```

O preview é uma função `STABLE` com consultas SELECT e foi exercitado dentro de `BEGIN READ ONLY`. Não cria auditoria nem altera tabelas. O relatório informa entidades novas, existentes e pendentes; IDs e fontes permitem revisar cada decisão.

## Execução definitiva — somente depois da autorização

Conferir/corrigir o JSON auditável, executar novo dry-run e revisar o digest SHA-256 apresentado. Para uma importação integral estrita, resolver todos os alertas críticos, incluindo a divergência de páginas. Não remover advertências do JSON sem verificar/corrigir a fonte e registrar a decisão.

```powershell
npm.cmd run import:unicasf -- --from-json data/unicasf-review/import.json --execute --strict --approved-sha256 "DIGEST_EXATO_DO_DRY_RUN_REVISADO" --report data/unicasf-review/import
```

O comando acima **bloqueia o material atual**. Caso o usuário autorize expressamente importar apenas a parte apta de um documento potencialmente incompleto, a execução sem `--strict` pula as 17 identidades pendentes e seus 68 vínculos, mantendo tudo na auditoria. A execução parcial foi posteriormente autorizada pelo usuário e concluída. Sem o digest aprovado, o CLI recusa qualquer execução. A transação é integral: falha em um filho reverte todo o lote.

## Arquivos criados e modificados

Criados: `scripts/imports/unicasf.py`, `scripts/imports/requirements.txt`, `scripts/imports/test_unicasf.py`, `scripts/import_unicasf.py`, `scripts/import-unicasf.mjs`, `scripts/test-unicasf.mjs`, `tests/import-unicasf.spec.ts`, a migration nova, este relatório e os arquivos JSON/CSV em `data/unicasf-review/`.

Modificados: `package.json` (comandos), `.gitignore` (temporários), `scripts/test-shared-access.mjs` (mantém o teste da transição histórica isolado das migrations posteriores), `src/lib/network.ts` (campos estruturados), `src/components/network.tsx` (tipo profissional nos cards), `src/pages/entity-detail.tsx` (CNPJ, tipo profissional, convênios locais e mensagem de acesso compartilhado) e `README.md` (entrada para este relatório).

## Evidências e limites

O teste PostgreSQL local importa os dois PDFs integralmente, com uma Bianca e uma especialidade manuais preexistentes. Verifica preview read-only, bloqueio estrito, rollback após inserções, preservação de notas/contatos/especialidade manual, duas formas de reimportação, BRASMEDE com 38 profissionais e especialidades por local, Bianca única com CLINICASF/endereço próprio, filtros, edição pela camada existente e leitura por viewer, além de recusas para viewer em gravação, bloqueado e anon.

O teste Edge usa as RPCs reais no PostgreSQL local por um adaptador HTTP, com autenticação controlada. Confere os detalhes de Bianca e CLINICASF, endereço, convênio local e CNPJ. Não equivale a login Auth real, deploy ou validação da produção. Os resultados finais estão em `data/unicasf-review/local-integration.json` e no relatório de validação; a checagem remota das funções de listagem, filtros e detalhes foi concluída em remote-validation.json.

| Verificação | Resultado |
| --- | --- |
| Parser determinístico e regressões dos documentos | 4 métodos de teste aprovados, cobrindo os casos agrupados |
| Fundação, fase 2 e acesso compartilhado | Aprovados em PostgreSQL local |
| Importação completa, reimportação, transações e RLS | Aprovados; evidência em `local-integration.json` |
| CLI estrito e digest de autorização | Aprovados; modo estrito sai com código 2 e execução com digest incorreto é recusada antes de acessar o banco |
| TypeScript, lint e build de produção | Aprovados |
| Interface UNICASF no Edge com a versão final | Aprovada |
| Regressão completa da interface | 29/30 aprovados; o cenário do formulário em 390 px falhou uma vez e passou na repetição isolada, sem alteração. A causa da intermitência não foi estabelecida |

O relatório `data/unicasf-review/validation.json` diferencia os testes locais das limitações remotas. Observações de idade/atendimento são mantidas no vínculo com o local. Uma unidade que oferece apenas um serviço sem especialidade nominal não herda especialidades de outras clínicas do profissional.

## Execução remota e verificação final

Aplicadas as migrations 20261104232122_unicasf_import e 20261104232741_unicasf_upload_transport. A segunda cria somente uma área privada de transferência, sem permissões para anon/authenticated e com RLS habilitada e forçada. O limite HTTP recusou o lote completo (413); a transferência passou a usar 26 blocos, reconstruídos e conferidos por checksum antes da função transacional.

O dry-run remoto, em transação READ ONLY, encontrou 1.450 novos, zero existentes e 17 pendentes. A execução criou os 1.450 cadastros aptos. O JSON integral está em network_import_runs, associado ao digest autorizado. Os 26 blocos foram removidos após confirmação da auditoria; a tabela privada está vazia.

Verificação remota: zero vínculos, contatos ou endereços faltantes; zero CNPJs e registros profissionais duplicados; BRASMEDE com 38 profissionais; Bianca única com endereço próprio e CLINICASF; CRM conflitante excluído. Filtros retornaram 1.186 profissionais pelo convênio, 33 estabelecimentos por Belém/Nazaré/convênio, 47 por Cardiologia e um pelo vínculo de Bianca. Repetição: already_imported=true, contagens mantidas e uma única auditoria. A API reconheceu as funções e recusou acesso anônimo.

O teste adicional npm.cmd run test:import-transport aprovou reconstrução exata, preview somente leitura, recusa de conteúdo corrompido e bloqueio dos clientes. Lint e verificação de diferenças também passaram.

Para futuras execuções via CLI autenticado, usar etapas separadas:

```powershell
node scripts/import-unicasf-remote.mjs --upload
node scripts/import-unicasf-remote.mjs --dry-run
node scripts/import-unicasf-remote.mjs --execute --approved-sha256 0dc2ea3ad205c328a251282b3115651956891d69a82474b7cd6b5ecb3a5add9d
```

O upload grava somente dados temporários privados; o dry-run permanece estritamente somente leitura; a execução exige o digest revisado. Nenhuma credencial ou lote completo é impresso. O frontend atualizado permanece no repositório: não houve novo deploy nem validação de login Auth real nesta etapa.

A auditoria mantém o aviso anterior de [proteção de senhas comprometidas desabilitada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) e uma informação de [RLS sem política](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) na tabela privada: o bloqueio de todos os clientes é intencional. Nenhuma configuração de Auth foi alterada.
