# AirTrust Sanitization Phase 5C Git Preservation Plan Report

Data local: 2026-06-14

Escopo: preservar localmente a pilha de 32 commits e preparar plano de reconciliacao Git com o commit remoto ausente, sem executar merge, rebase, pull, reset, push, deploy, migrations, staging ou producao.

## Veredito

**PRESERVADO PARA RECONCILIAR**

A pilha local foi preservada com uma branch local e uma tag leve local apontando exatamente para o `HEAD` atual. Nenhuma troca de branch foi feita.

## Estado Inicial

| Item | Valor |
|---|---|
| Branch ativa | `main` |
| `HEAD` | `0003ffb0392665633f421c3831200438f5aa199d` |
| `origin/main` | `e4db4ba02a2532c2c3b51a230cfdb27bc78e4c26` |
| Divergencia `origin/main...HEAD` | `1 32` |
| Status Git | `main...origin/main [ahead 32, behind 1]` |

Working tree inicial e final continuam sujas, com arquivos tracked modificados e arquivos untracked de docs/artefatos. Esta fase nao tentou limpar, descartar, stagear ou commitar nada.

## Preservacao Criada

### Branch local

Branch criada:

```text
safety/airtrust-local-sanitization-stack-20260614
```

Comando executado:

```text
git branch safety/airtrust-local-sanitization-stack-20260614 HEAD
```

Verificacao:

| Ref | SHA |
|---|---|
| `HEAD` | `0003ffb0392665633f421c3831200438f5aa199d` |
| `safety/airtrust-local-sanitization-stack-20260614` | `0003ffb0392665633f421c3831200438f5aa199d` |

Resultado: a branch de preservacao aponta exatamente para o `HEAD` preservado.

### Tag local leve

Tag criada:

```text
safety-airtrust-local-stack-20260614
```

Comando executado:

```text
git tag safety-airtrust-local-stack-20260614 HEAD
```

Verificacao:

| Ref | SHA |
|---|---|
| `HEAD` | `0003ffb0392665633f421c3831200438f5aa199d` |
| `safety-airtrust-local-stack-20260614` | `0003ffb0392665633f421c3831200438f5aa199d` |

Resultado: a tag leve local aponta exatamente para o `HEAD` preservado.

## Commit Remoto Ausente

Commit:

```text
e4db4ba0 chore(ui): simplify top header controls
```

Metadados:

| Campo | Valor |
|---|---|
| SHA completo | `e4db4ba02a2532c2c3b51a230cfdb27bc78e4c26` |
| Autor | `Filipe Daumas <airtrust-system@gmail.com>` |
| AuthorDate | `Sun Jun 14 17:34:28 2026 -0300` |
| CommitDate | `Sun Jun 14 17:34:28 2026 -0300` |

Arquivos alterados:

```text
M src/react-app/components/AppLayout.tsx
```

Estatistica:

```text
src/react-app/components/AppLayout.tsx | 36 ++++++++++++----------------------
1 file changed, 12 insertions(+), 24 deletions(-)
```

Resumo tecnico do diff remoto:

- remove imports nao usados de icones e componentes de notificacao;
- adiciona constante `PREVIEW_BADGE_CLASS`;
- aumenta o tamanho visual do logo no header;
- padroniza badges `PREVIA` em SGSO/MRO;
- transforma `Atualizar app` e alternancia de tema em botoes icon-only no header desktop;
- remove `NotificacoesEscala` e `NotificacoesSistema` do header desktop;
- remove entrada mobile de notificacoes.

## Analise De Conflito Com Os 32 Commits Locais

### Arquivo em comum

O commit remoto ausente altera somente:

```text
src/react-app/components/AppLayout.tsx
```

A pilha local de 32 commits tambem altera esse arquivo em:

```text
c92ba493 feat(controle-voos): fechar bloqueios de readiness N1 para piloto interno
```

Estatistica local nesse arquivo:

```text
src/react-app/components/AppLayout.tsx | 2 --
1 file changed, 2 deletions(-)
```

Esse commit local remove o badge `PREVIA` de `Controle de Voos` no menu desktop e mobile.

### Risco de conflito entre commits

Risco estimado: **medio e localizado**.

Motivos:

- ambos os lados alteram `src/react-app/components/AppLayout.tsx`;
- o commit local muda somente o badge de `Controle de Voos`;
- o commit remoto muda o header, imports, botoes de topo, notificacoes e badges de SGSO/MRO;
- os hunks nao parecem semanticamente opostos, mas ficam no mesmo componente e em regioes proximas de navegacao/header;
- um cherry-pick ou merge pode exigir revisao manual de `AppLayout.tsx`.

### Branding/assets

Nao foi detectado conflito direto entre `e4db4ba0` e os arquivos de branding/assets:

- `index.html`
- `public/app.webmanifest`
- `public/favicon.ico`
- `public/android-chrome-192x192.png`
- `public/android-chrome-512x512.png`
- `public/apple-touch-icon.png`
- `public/favicon-16x16.png`
- `public/favicon-32x32.png`

O commit remoto nao toca esses arquivos.

## Alteracao Equivalente Ja Existe Nos 32 Commits Locais?

**Nao como commit historico.**

Evidencia:

```text
git log --oneline --stat origin/main..HEAD -- src/react-app/components/AppLayout.tsx
```

Resultado relevante:

```text
c92ba493 feat(controle-voos): fechar bloqueios de readiness N1 para piloto interno
src/react-app/components/AppLayout.tsx | 2 --
```

Ou seja, nos 32 commits locais, `AppLayout.tsx` contem apenas a remocao dos badges de `Controle de Voos`; nao contem o pacote completo de simplificacao do header feito por `e4db4ba0`.

## Alteracao Equivalente Ja Existe Na Working Tree?

**Sim, em grande parte, mas nao commitada.**

A working tree atual possui modificacao local em `src/react-app/components/AppLayout.tsx` que replica a maior parte do diff de `e4db4ba0` sobre o `HEAD` local:

- `PREVIEW_BADGE_CLASS` existe no arquivo atual;
- `NotificacoesSistema` e `NotificacoesEscala` nao aparecem mais no arquivo atual;
- `themeStateLabel` nao aparece mais no arquivo atual;
- o header desktop usa `aria-label`/`title` para `Atualizar app`;
- SGSO/MRO usam `PREVIEW_BADGE_CLASS`;
- a diferenca residual contra `origin/main` fica concentrada na remocao local do badge `PREVIA` de `Controle de Voos`.

Isto sugere que a mudanca remota foi provavelmente reaplicada ou recriada localmente como alteracao nao commitada. Mesmo assim, ela ainda nao faz parte dos 32 commits preservados.

## Risco De Push

**Alto.**

Motivos:

1. `main` esta `ahead 32, behind 1`;
2. ha divergencia bidirecional real;
3. ha working tree suja, incluindo `src/react-app/components/AppLayout.tsx`;
4. os relatorios das Fases 4, 5A, 5B e 5C ainda nao foram commitados;
5. um push direto de `main` pode ser rejeitado ou exigir decisao de integracao inadequada.

## Recomendacao Objetiva Para A Proxima Fase

### Recomendacao principal

**c) cherry-pick do commit remoto**

Motivo: o remoto ausente e um commit unico, pequeno e restrito a `src/react-app/components/AppLayout.tsx`. Um cherry-pick controlado e mais proporcional do que merge/rebase para integrar exatamente esse delta, desde que a proxima fase trate explicitamente a working tree suja antes de aplicar qualquer operacao.

Condicoes para a proxima fase:

- preservar ou revisar a alteracao nao commitada atual em `AppLayout.tsx`;
- nao perder a remocao local dos badges de `Controle de Voos`;
- aplicar `e4db4ba0` de forma controlada ou confirmar que ele ja esta semanticamente incorporado;
- rodar validacoes focadas apos a reconciliacao.

### Alternativas

**a) merge controlado**

Viavel, mas menos proporcional para 1 commit remoto. Pode ser usado se a estrategia desejada for preservar explicitamente a topologia com merge commit.

**b) rebase controlado**

Tecnicamente possivel, mas maior risco operacional para uma pilha local de 32 commits. Nao e recomendado como primeiro caminho.

**d) manter branch separada e abrir PR**

Recomendado depois de reconciliar o commit remoto e estabilizar a working tree. A branch de preservacao ja existe para proteger a pilha local antes dessa decisao.

**e) escalar revisao humana**

Recomendado para revisar `src/react-app/components/AppLayout.tsx`, porque a working tree atual parece conter uma reaplicacao nao commitada do commit remoto.

## Confirmacoes De Nao Execucao

Confirmado nesta fase:

- nenhum push foi executado;
- nenhum pull foi executado;
- nenhum merge foi executado;
- nenhum rebase foi executado;
- nenhum reset foi executado;
- nenhum checkout destrutivo foi executado;
- nenhum deploy foi executado;
- nenhuma migration foi aplicada;
- staging nao foi tocado;
- producao nao foi tocada;
- Cloudflare, D1 remoto, R2 e secrets nao foram executados ou acessados;
- `git add .` e `git add -A` nao foram usados;
- nenhum commit foi criado;
- nenhum codigo funcional foi alterado;
- nenhum script ou workflow foi alterado;
- nenhuma migration `0411` foi criada;
- SIGVOOS, FRMS, RBAC e multi-tenant nao foram alterados.

## Conclusao Operacional

A pilha local esta preservada por branch e tag locais em `0003ffb0392665633f421c3831200438f5aa199d`. A reconciliacao ainda nao foi executada.

O proximo passo recomendado e uma fase dedicada para tratar `src/react-app/components/AppLayout.tsx` e integrar o commit remoto `e4db4ba0` de forma controlada, preferencialmente via cherry-pick ou equivalente manual validado, sem ampliar a pilha de commits documentais antes da reconciliacao.
