# AirTrust - Incidente Critico: Modelos de Sessao sem Manobras

Data da apuracao: 2026-06-16  
Escopo: Modelos de sessao, fichas de simulador, login e PR #59  
Status: restauracao de dados bloqueada; mitigacao de codigo preparada

## Veredito

A perda e real em producao: a tabela `modelos_sessao_manobras` esta vazia para todos os modelos ativos auditados. Nao houve escrita em producao nesta fase.

A recuperacao operacional dos dados nao deve ser aplicada ainda. As fontes versionadas cobrem parte relevante dos modelos, mas a fonte completa e verificavel para todos os 52 modelos ativos ainda nao foi provada em nivel de linha. Qualquer restauracao parcial criaria risco regulatorio e risco de avaliacao com conteudo incorreto.

## Regras de seguranca cumpridas

- SIGVOOS nao foi retomado.
- FRMS e `frms-source-policy.ts` nao foram alterados.
- Nenhuma migracao, DDL, DML, `DELETE`, `TRUNCATE`, `UPDATE` ou carga de dados foi aplicada em producao.
- A apuracao remota usou apenas consultas `SELECT`/`PRAGMA`; os resultados reportaram `rows_written: 0`.
- Nenhum dado pessoal foi incluido neste relatorio.

## Estado de producao observado

Resumo de producao:

| Metrica | Valor |
| --- | ---: |
| Modelos ativos | 52 |
| Modelos ativos sem links em `modelos_sessao_manobras` | 52 |
| Links ativos em `modelos_sessao_manobras` | 0 |
| Links soft-deleted em `modelos_sessao_manobras` | 0 |
| Manobras ativas no catalogo | 393 |
| Manobras soft-deleted no catalogo | 81 |
| Fichas ativas | 75 |
| Fichas ativas sem manobras | 20 |
| Fichas assinadas sem manobras | 1 |

Distribuicao por tenant:

| Empresa | Modelos ativos | Modelos sem links |
| ---: | ---: | ---: |
| 6 | 51 | 51 |
| 8 | 1 | 1 |

Catalogo de manobras ativo:

| Empresa | Aeronave | Tipo de sessao | Manobras |
| ---: | --- | --- | ---: |
| 6 | n/a | CHECK | 44 |
| 6 | AW139 | TREINAMENTO | 147 |
| 6 | SK76 | PER | 22 |
| 6 | SK76 | TREINAMENTO | 180 |

## Impacto

- A tela de avaliacao falhava com ficha sem manobras apos tentativa de populacao automatica.
- Criacao e edicao de fichas podiam mascarar a ausencia do modelo, inclusive por fallback generico.
- O fluxo de assinatura podia avancar sobre ficha sem itens avaliativos.
- Sessoes compartilhadas com `gera_ficha=true` podiam criar fichas sem manobras quando o modelo estava zerado.

## Mitigacao de codigo preparada

Foram preparadas guardas para impedir que o sistema continue criando, avaliando ou assinando fichas vazias:

- `GET /simuladores/fichas/:id` nao cria mais manobras genericas `ORD-*`; retorna erro 409 quando nao ha modelo ou quando o modelo nao tem manobras.
- `PUT /simuladores/fichas/:id` bloqueia atualizacao de manobra inexistente e bloqueia recalc de status quando a ficha nao tem manobras.
- `POST /simuladores/fichas/:id/assinar` bloqueia assinatura de ficha sem manobras.
- Criacao/edicao de sessao compartilhada bloqueia `gera_ficha=true` quando o modelo de sessao nao tem manobras ativas.
- O modal de avaliacao exibe a mensagem do backend e nao tenta reprocessar ficha vazia.
- Login recebeu timeout controlado para evitar travamento quando `/auth/empresas` fica indisponivel.

Essas mudancas nao restauram dados historicos; elas reduzem dano futuro ate a restauracao controlada.

## Fontes de recuperacao avaliadas

Fontes versionadas com vinculos de modelo/manobra foram localizadas em migracoes como:

- `0180_implement_periodico_aw139.sql`
- `0220_seed_sk76_modelos_iniciais.sql`
- `0222_seed_sk76_manobras_e_modelos_periodicos.sql`
- `0296_fap07_fap13_manobras.sql`
- `0299_loft_chk_manobras.sql`
- `0300_loft_off_not_e_fap_refs.sql`
- `0373_fix_sk76_inicial_modelos_sem_manobras.sql`
- `0382_create_sk76_semestral_sessions.sql`
- `0383_split_night_training_onshore_offshore.sql`

O problema: ha modelos atuais com codigos renomeados ou criados depois das fontes originais, alem do modelo piloto da empresa 8. Por isso, ainda nao existe mapa completo e aprovado de `modelo_codigo -> manobra_codigo -> ordem -> tripulante` para todos os 52 modelos ativos.

Staging nao e fonte confiavel: tambem esta sem links e sem manobras ativas suficientes para restauracao.

## Dry-run preparado

Foi adicionado o gerador read-only:

`scripts/validation/dry-run-modelos-sessao-manobras-recovery.mjs`

Ele emite SQL somente-leitura para:

- recontar modelos/fichas afetados;
- classificar modelos por fonte candidata;
- marcar modelos cuja fonte de restauracao ainda nao esta provada.

Esse dry-run nao gera comandos de escrita e nao deve ser tratado como script de aplicacao. A restauracao real so deve nascer depois de snapshot, reconciliacao linha a linha e aprovacao explicita.

## PR #59 e login

O PR #59 foi mergeado em `main` antes desta fase:

- PR: `https://github.com/airtrustsystem-alt/airtrust/pull/59`
- Merge commit: `4fb1416d855241a07432fabbd83695fb09406d9e`
- Merge em: 2026-06-16T17:35:34Z

A correcao local de login preparada nesta fase adiciona timeout para `/api/auth/login` e tolerancia controlada para falha em `/api/auth/empresas`, sem alterar politica de autenticacao.

## Validacoes executadas

Passaram:

- `npx vitest run src/react-app/components/modals/ModalAvaliarFicha.test.tsx`
- `npx vitest run src/__tests__/qualificacoes-historico-status-utils.test.ts src/react-app/components/modals/ModalRenovarQualificacao.test.tsx`
- `cd worker-airtrust && npx vitest run src/__tests__/routes/simuladores-fichas-tenant-write.test.ts src/__tests__/routes/simuladores-shared-session-routes.test.ts src/__tests__/routes/qualificacoes-historico-renovadas.test.ts`
- `npm run build`
- `npm run lint`
- `cd worker-airtrust && npx tsc --noEmit --pretty false`
- `git diff --check`
- `bash scripts/audit-dangerous-ops.sh` passou com aviso preexistente em scripts de sincronizacao local.
- `bash scripts/check-tracked-secrets.sh`
- `node scripts/validation/dry-run-modelos-sessao-manobras-recovery.mjs`

Nao passou por condicao preexistente:

- `cd worker-airtrust && npm run types` falhou porque `worker-configuration.d.ts` ja existe e o Wrangler se recusou a sobrescrever arquivo nao gerado por ele.
- `bash scripts/validation/audit-sensitive-files.sh` falhou por inventario ja rastreado de SQLs/backups/arquivos legados no repositorio; nao foi causado pelos novos arquivos desta fase.

## Proxima fase segura

1. Criar snapshot/backup verificavel do D1 de producao.
2. Gerar mapa completo de restauracao a partir de fontes versionadas e/ou snapshot historico, sem dados pessoais.
3. Executar dry-run linha a linha em copia local/staging.
4. Revisar divergencias por modelo e por ordem.
5. Solicitar autorizacao explicita e separada para qualquer escrita em producao.
6. Aplicar apenas script idempotente, com `INSERT` condicionado a ausencia do link e sem `DELETE`/`TRUNCATE`.

Enquanto a fonte completa nao for provada, o status correto da restauracao e: bloqueada.
