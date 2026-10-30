# Minha Saúde — refinamento de UX e formulários

Data: 29/10/2026. Refinamento da aplicação existente, com prioridade ao cadastro pelo celular. Paleta, autenticação, rotas, dados e salvamento transacional da fase 2 foram preservados.

## Alterações implementadas

### Contatos e máscaras

- Cards com resumo de identificação, número formatado, tipo e indicador principal. Um contato é expandido para editar; os demais ficam compactos. Inclusão abaixo dos contatos existentes e remoção com confirmação para contatos preenchidos.
- Seleção visual de WhatsApp, celular, telefone fixo, e-mail e outro, com ícones e estado selecionado. Contatos antigos do tipo site continuam editáveis.
- Máscara durante a digitação: `(91) 3333-4444` e `(91) 98844-9970`. Colagem com ou sem pontuação e `+55`; edição no meio do número; exclusão parcial; teclado telefônico.
- Internacional com DDI explícito, sem limitar o número a 11 dígitos. Formatação/validação internacional pela biblioteca `libphonenumber-js`; máscara/cursor por `react-imask`.
- Campo de e-mail com tipo e teclado próprios, validação contextual e exemplos. Outros contatos permitem texto livre.
- Identificação com sugestões de recepção, consultas, exames, emergência e outros departamentos; descrições personalizadas continuam possíveis.
- Apenas um contato pode ser marcado como principal no formulário. Observações opcionais ficam recolhidas.
- Formatação visual, normalização, validação, links `tel:` e WhatsApp estão separados em funções reutilizáveis e testadas.

### Contrato de persistência

| Informação | Na interface | No payload enviado à RPC |
| --- | --- | --- |
| Telefone brasileiro | `(91) 98844-9970` | `91988449970` |
| Brasil com DDI colado | `+55 (91) 98844-9970` é apresentado com máscara nacional | `91988449970` |
| Internacional | `+44 20 7946 0018` nos detalhes | `+442079460018` |
| CEP | `66055-030` | `66055030` |
| Site sem protocolo | `clinica.com.br` pode ser digitado | `https://clinica.com.br/` |

O DDD 55 não é confundido com o DDI brasileiro. Links brasileiros usam `tel:+55…` e `https://wa.me/55…`, sem duplicar o código do país. Números antigos com ou sem pontuação são formatados ao ler. Não foi executada conversão em massa dos registros existentes; a normalização ocorre quando o usuário salva um formulário.

O MCP foi consultado antes das mudanças: `contacts.value`, identificação, notas e CEP já usam texto, o principal usa booleano e a RPC `save_network_entity(text,uuid,jsonb)` está presente. Os dois contatos existentes no momento da inspeção continham somente dígitos. **Nenhuma migração, alteração de RLS ou escrita no Supabase real foi necessária para este refinamento.**

### Formulário progressivo

- Cinco etapas mantidas para estabelecimento, com ícones, indicador ativo e etapas concluídas no desktop.
- No celular, somente etapa atual, nome e barra de progresso; botões Voltar e Continuar preservam os campos e validam o contexto antes de avançar.
- Salvar continua disponível, inclusive para o cadastro mínimo. Ao salvar, todas as etapas são verificadas e o primeiro erro é exibido junto do campo; contatos e endereços inválidos são expandidos para correção.
- Resumo opcional com nome, tipo e quantidades de contatos, endereços, especialidades, médicos e convênios. Seus atalhos voltam à etapa correspondente.
- Ações respeitam a navegação inferior e a safe area. Aviso de alterações não salvas, bloqueio de duplo envio, carregamento e tratamento de falha foram preservados.
- Labels permanecem visíveis; campos obrigatórios são indicados; descrições e observações usam áreas menores. Site aceita domínio sem protocolo, com normalização para HTTPS e rejeição de protocolos inadequados.

### Endereços e associações

- CEP com máscara e consulta automática após oito dígitos, debounce, timeout e cancelamento de respostas antigas. Há ação de consulta/repetição explícita.
- Estados distintos para consulta em andamento, CEP não encontrado e serviço indisponível. O preenchimento manual permite salvar mesmo quando o serviço falha.
- Respostas da consulta não sobrescrevem campos que o usuário alterou durante a requisição. Endereços existentes com correções manuais não são reconsultados simplesmente ao abrir a edição.
- Campos organizados em até duas colunas no desktop e uma no celular; UF é selecionável; endereço principal, resumo compacto, edição e remoção com confirmação.
- Seletores reutilizáveis para especialidades, médicos, locais e convênios, com busca, seleção indicada, chips e remoção. Os cadastros rápidos ficam em memória até o salvamento transacional do conjunto.
- Observações de dias, horários e atendimento ficam no vínculo do médico; notas de cobertura ficam no vínculo do convênio, separadas do cadastro do plano.

### Consulta e dashboard

- Novo cadastro usa opções com ícone próprio, título, descrição, cor suave e indicador de navegação. Desktop centralizado em duas colunas; celular em bottom sheet. Escape, fechar, clique externo, foco contido e retorno ao botão de origem verificados.
- Detalhes com localização resumida no cabeçalho, contatos compactos com números formatados, ações condicionais de ligar/WhatsApp/e-mail/site e cópia do valor exibido.
- Endereços separados em linhas legíveis, CEP com máscara, referência e Maps. Especialidades e convênios em chips; médicos e demais informações na coluna secundária do desktop.
- Dashboard mobile com banner menor, busca destacada, duas colunas de acesso rápido e estados vazios menores. Últimos cadastros usam linhas compactas com atalhos de detalhes e contato.
- Busca por telefone/CEP digitados com máscara é normalizada antes de consultar os valores armazenados sem pontuação.

## Componentes e arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/contact-utils.ts` | Formatação, normalização, validação e construção de links |
| `src/components/masked-inputs.tsx` | PhoneInput e CepInput |
| `src/components/form-fields.tsx` | Label, obrigatoriedade, ajuda e erro acessível |
| `src/components/contact-form-card.tsx` | Card dinâmico e seleção visual do tipo |
| `src/components/address-form.tsx` | CEP automático, campos, resumo e confirmação |
| `src/components/form-stepper.tsx` | Navegação responsiva e progresso |
| `src/components/entity-select.tsx` | Seleção múltipla e cadastro rápido reutilizáveis |
| `src/components/registration-type-picker.tsx` | Seletor visual de novo cadastro |
| `src/components/network.tsx` | Diálogos, retorno de foco, contatos e cards formatados |
| `src/pages/entity-form.tsx` | Integração das etapas e payload normalizado |
| `src/pages/entity-detail.tsx` | Detalhes e contatos legíveis |
| `src/pages/home.tsx` | Dashboard compacto e atalhos |
| `src/pages/network-directory.tsx`, `src/lib/network.ts` | Seletor compartilhado, busca e links normalizados |
| `src/refinement.css`, `src/main.tsx` | Estilos do refinamento e importação |
| `package.json`, `package-lock.json` | Dependências fixadas e comando de teste dos utilitários |
| `scripts/test-contact-utils.mjs` | Testes de normalização, validação e compatibilidade |
| `tests/fixtures/network.ts` | Fixture compartilhada de banco local e transporte controlado |
| `tests/foundation.spec.ts`, `tests/network.spec.ts`, `tests/refinement.spec.ts` | Regressão e aceitação em cinco larguras |

## Verificação

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:contacts
npm.cmd run test:db
npm.cmd run build
npm.cmd run test:e2e
```

**Resultado final:** TypeScript, lint, build, utilitários de contato e testes PostgreSQL aprovados. A suíte consolidada de interface concluiu **24 testes aprovados**, em aproximadamente 99 segundos, com **zero falhas, zero testes ignorados e zero testes instáveis**. Capturas de contato mobile, detalhes, dashboard e seletor desktop foram inspecionadas visualmente; o seletor está centralizado no desktop e ancorado na base do celular.

- Utilitários testam BR e internacional, DDI/DDD 55, máscaras, quantidade de dígitos, formato de e-mail, URLs seguras, CEP e integridade de números antigos.
- Os testes de interface cobrem digitação, colagem, cursor, exclusão parcial, troca de tipo sem perder o valor, validação de incompletos, três contatos, edição, remoção, contato principal e armazenamento normalizado no PostgreSQL local.
- Fluxo completo de estabelecimento em **360, 390, 430, 768 e 1440 px**: contatos, endereço, especialidades, médico, convênio, salvar, detalhes, editar, recarregar, consultas, favoritos e exclusão preservando os cadastros compartilhados. Verificada ausência de overflow horizontal.
- Também há testes de CEP automático, correção manual durante a consulta, CEP ausente, indisponibilidade do serviço, compatibilidade com dados antigos, links, cópia, seletor visual, centralização, Escape, clique externo e retorno de foco.
- Testes de banco da fase 2 continuam executando migrações, transações, RLS e integridade em PostgreSQL efêmero. Os novos testes de interface usam as mesmas RPCs SQL nesse banco, com autenticação e HTTP controlados; não criam dados no Supabase real.
- Capturas em `test-results/refined-contacts-{largura}.png`, `phase2-form-{largura}.png`, `phase2-detail-{largura}.png`, `refined-picker-{largura}.png` e `refined-dashboard-{largura}.png`. Pasta ignorada pelo Git. Resultado consolidado em `test-results/refinement-summary.json`.

## Limitações

- As validações de telefone confirmam estrutura e comprimento, não que uma linha existe ou recebe ligações/WhatsApp.
- A consulta real ao ViaCEP depende do serviço; os testes controlam sucesso, ausência e falha, preservando preenchimento manual.
- O teste completo com login Auth real pelo navegador continua separado dos testes locais com autenticação controlada. Não foram usadas credenciais reais nem realizadas alterações em contas.
- Registros antigos não são regravados ao consultar. Números com formatos ambíguos permanecem visíveis integralmente; a correção pode ser feita durante uma edição explícita. A busca numérica normalizada atende valores armazenados sem máscara; formatos históricos arbitrários podem exigir busca pelo nome ou ajuste no cadastro.
- O build mantém o aviso de tamanho do bundle principal, agora incluindo a biblioteca de metadados telefônicos. Otimização adicional de divisão de bundles permanece possível.

Bibliotecas: [React IMask](https://imask.js.org/api/modules/react_imask.html) `7.6.1` e [libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js) `1.13.15`, com versões fixadas e lockfile atualizado.
