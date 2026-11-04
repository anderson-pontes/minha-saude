# Revisão das pendências — 03/11/2026

## Correções concluídas localmente

- ESLint atualizado para 10.14.0. Overrides explícitos de `minimatch` 11.0.4 e `glob` 14.0.3 removem os avisos moderados nas ferramentas. As APIs usadas por ESLint/Workbox foram verificadas por lint, build e testes do PWA. Node.js limitado à linha 24, a partir de 24.16.0.
- As telas de autenticação, dashboard, diretório, detalhes, formulário e administração carregam sob demanda. Metadados de navegação e categorias foram separados das consultas e telas. O diálogo do PWA não importa mais todo o módulo de rede/contatos.
- SDK Supabase separado em chunk de 214 kB. Bundle principal: **407,18 kB / 129,02 kB gzip**, antes **934,18 kB / 267,56 kB gzip**. O build não emite mais o aviso de chunk acima de 500 kB. Esses números não representam o total de JavaScript transferido; há dependências e telas adicionais, e o PWA continua fazendo precache dos arquivos estáticos.
- Mensagem offline informa que o usuário precisa reconectar e tentar salvar novamente; não promete envio automático ou fila offline.
- Resultados Playwright da aplicação e PWA usam diretórios separados. O teste de cache distingue domínio/caminhos da API dos arquivos estáticos do SDK. O build também é verificado pela renderização real do formulário de login.
- `npm run audit:pwa` passa a retornar erro para HTML no lugar dos recursos PWA. Verifica manifest, SW, MIME/cache, PNGs/dimensões e deep links. Aceita URL alternativa: `npm run audit:pwa -- http://127.0.0.1:4176`.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| ESLint | Aprovado |
| TypeScript e build de produção | Aprovados, sem aviso de tamanho |
| Utilitários de contato | Aprovados |
| Fundação/fase 2/acesso compartilhado em PostgreSQL local PGlite | Aprovados |
| Regressão da aplicação, Edge, 360–1440 px | 29 aprovados |
| Build PWA, Edge e Chrome | 6 aprovados |
| Auditoria HTTP contra build local | 8 recursos aprovados |
| npm audit completo | 4 baixos; 0 moderados, altos ou críticos |
| npm audit --omit=dev | 0 avisos |

As execuções finais de browser encerraram normalmente fora do sandbox restrito. Não foi necessário alterar a política de encerramento do Playwright. A nova auditoria HTTP foi exercitada tanto no build válido local quanto na produção inválida.

Os quatro avisos baixos vêm de uma única vulnerabilidade transitiva de `deepmerge` 4.3.1, na cadeia `vite-plugin-pwa` → Workbox → node-resolve. Não há versão mais recente publicada no npm na consulta desta revisão. Não foi aplicado downgrade forçado do PWA. Acompanhar [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

## Produção e banco: execução ainda pendente

Consulta pública a `https://minha-saude-cyan.vercel.app`: login e deep link respondem HTML corretamente. **Manifest, SW e quatro ícones retornam HTML em vez do recurso esperado**; `npm run audit:pwa` retorna código 1 com seis falhas. Isso confirma que o PWA local ainda não está entregue na publicação atual.

A migração `20261104015446_shared_access.sql`, bootstrap e rollback foram preservados. A última auditoria privilegiada do banco continua sendo a de 29/10/2026. Não houve nova inspeção privilegiada, aplicação SQL, ativação de administrador, alteração de Auth ou deploy nesta revisão.

O usuário informou que conectou Supabase/Vercel, mas as ferramentas desses serviços não foram disponibilizadas ao executor desta conversa. O CLI Supabase também não encontrou sessão autenticada. A alternativa pelo navegador foi interrompida pelo controle de automação, que não conseguiu identificar a URL do Chrome com segurança. Não foram extraídos tokens do navegador nem inseridas credenciais no repositório.

Para retomar, disponibilizar as ferramentas autenticadas do Supabase e da Vercel nesta conversa (pode ser necessário reabri-la após conectar). Continuar do plano já preparado, sem refazer as correções locais:

1. Reconfirmar projeto `qvkgadxyyzyjeiwjykgr`, baseline, backup recuperável, schemas expostos e usuário administrador escolhido.
2. Aplicar somente a migração de acesso compartilhado e o bootstrap existente. Não reaplicar a fundação nem executar `db push` indiscriminado, por causa do histórico manual.
3. Conferir integridade, grants/RLS e perfis; validar admin/viewer/bloqueado com sessões reais e proteção dos dados existentes.
4. Publicar o build na Vercel existente, preservando as variáveis públicas Supabase e o domínio atual. Só publicar depois de confirmar a ativação do banco.
5. Executar `npm run audit:pwa`, login e recuperação de senha reais. Instalação e atualização Android/iOS físicos continuam exigindo os dispositivos.

Não classificar os testes locais como validação remota, nem este registro como comprovante de backup ou publicação.
