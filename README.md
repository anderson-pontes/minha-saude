# Minha Saúde

Rede pessoal de saúde em React, TypeScript, Vite, Tailwind e Supabase. A raiz da aplicação é esta subpasta `minha-saude/`.

## Estado atual

Revisão de 03/11/2026: dependências moderadas corrigidas, telas sob demanda, bundle principal de 407 kB e verificações locais aprovadas. Consulte [o registro da conclusão local](PROJECT-STATUS-2026-11-03.md).

**Acesso compartilhado aplicado no Supabase e primeiro administrador ativado em 03/11/2026.** A migração remota `20261104015446_shared_access` e os testes PostgreSQL com rollback foram concluídos. Consulte [o registro da aplicação](SHARED-ACCESS-APPLIED-2026-11-03.md). **A publicação do frontend/PWA na Vercel ainda está pendente**, assim como validações com login Auth real e dispositivos físicos.

O refinamento de UX prioriza formulários mobile, máscaras de telefone/CEP separadas da persistência, contatos compactos, stepper responsivo, consulta automática de CEP, seletor visual de cadastro e detalhes formatados. Veja o [relatório do refinamento](UX-REFINEMENT-REPORT.md). Não há nova migração para essas alterações.

A fase 2 implementa CRUD, formulários progressivos, contatos/endereços, vínculos, favoritos, detalhes por UUID e a central `/cadastros`. A identidade visual e a autenticação existentes foram preservadas.

**A migração da fase 2 foi autorizada, aplicada no Supabase e validada em 28/10/2026.** CRUD, buscas, transações e isolamento entre dois usuários passaram no PostgreSQL remoto com rollback dos dados de teste. A API reconhece as novas funções e rejeita acesso anônimo. Leia o [relatório completo](PHASE2-REPORT.md) e o [registro da aplicação](supabase/applied-phase2.json).

O MCP confirmou o projeto `qvkgadxyyzyjeiwjykgr`. A fundação já existe remotamente, com 11 tabelas e 44 políticas RLS, mas foi aplicada manualmente e não consta no histórico remoto. [Registro da aplicação inicial](supabase/applied-foundation.json). **Não recriar a fundação nem executar `db push` antes de reconciliar seu histórico.**

## Executar

Requer Node.js 24.16 ou superior na linha 24 (mesma versão principal usada nas validações).

```powershell
npm.cmd install
Copy-Item .env.example .env.local
# Preencher localmente VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.
npm.cmd run dev
```

Use somente a publishable key no frontend. Nunca colocar `service_role`, secret key, token pessoal ou senha de banco em variáveis `VITE_*`.

## Rotas

- `/`: dashboard com busca, resumo, favoritos e últimos cadastros.
- `/cadastros`: Minha Rede de Saúde, com pesquisa, filtros na URL e paginação.
- `/estabelecimentos`, `/medicos`, `/especialidades`, `/convenios`: listagens; cada categoria possui `/novo`, `/:id` e `/:id/editar`.
- `/favoritos`: médicos e estabelecimentos favoritados.
- `/busca`: acesso compatível à central de pesquisa.
- `/login`, `/recuperar-senha`, `/redefinir-senha`: Supabase Auth.

## Verificar

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:contacts
npm.cmd run build
npm.cmd run test:db
npm.cmd run test:e2e
npm.cmd run test:pwa
npm.cmd run audit:pwa # Somente leitura; falha até os recursos PWA estarem publicados.
```

Os testes de banco usam PostgreSQL efêmero PGlite e verificam migrações, transações e RLS com duas identidades. Os testes de interface usam Edge headless e servidor Vite isolado em `4175`. A autenticação é controlada; o adaptador HTTP dos testes da fase 2 executa as funções reais da migração no banco local. Nenhum teste acessa contas ou registros remotos reais.

Capturas são geradas em `test-results/`, ignorado pelo Git. Em ambiente sem Edge, ajuste `channel` em `playwright.config.ts` para um navegador Playwright instalado. No Windows, o lançamento do Edge pode precisar de execução fora do sandbox restrito.

## Arquitetura

- `src/lib/auth.tsx`: sessão e limpeza do cache privado.
- `src/lib/network.ts`: tipos e acesso Supabase.
- `src/pages/entity-form.tsx`: formulários com etapas e novos cadastros relacionados em memória até salvar.
- `src/pages/entity-detail.tsx`: detalhes e contatos reais.
- `src/pages/network-directory.tsx`: busca, filtros, ordenação e paginação.
- `src/components/network.tsx`: cards, ações, confirmação e diálogos.
- `supabase/migrations/20261028231442_phase2_network.sql`: alterações aditivas e RPCs `SECURITY INVOKER`.
- `scripts/prepare-phase2.py`: reproduz a migração local; não executa SQL remoto.

A fase 2 consta no histórico remoto como `20261028231442`; o arquivo SQL local foi alinhado à versão gerada pelo MCP sem alterar seu conteúdo aprovado. `supabase/validate-phase2-remote.sql` registra o teste transacional executado remotamente; `node --env-file=.env scripts/check-remote-api.mjs` verifica a resolução das RPCs e o bloqueio anônimo por HTTPS. A navegação completa com login Auth real, SMTP, entrega de e-mails e disponibilidade externa do ViaCEP continuam dependendo da validação desses serviços e de uma sessão apropriada.
