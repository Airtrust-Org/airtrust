# LMS SCORM — Isolamento de localStorage por matrícula/ciclo

**Data:** 2026-08-27 · **Branch:** `fix/scorm-localstorage-isolation`

## Causa raiz

Os pacotes SCORM de Manutenção/Tripulação gravam estado de progresso/quiz/score
em `localStorage` com chaves fixas por **curso/versão**, sem identidade da
matrícula ou ciclo:

| Pacote | Chave em `app.js` | Chave em `scorm_api.js` (fallback) |
|---|---|---|
| MCQ | `MNT_MCQ_MANUTENCAO_STATE_REVLMS_20260728` | `MNT_MCQ_MANUTENCAO_SCORM12_STATE_REVLMS_20260728` |
| MOM | `MNT_MOM_MANUTENCAO_STATE_REVLMS_20260728` | `MNT_MOM_MANUTENCAO_SCORM12_STATE_REVLMS_20260728` |
| MGM | `AIRTRUST_<storageKey>_STATE` | `MNT_MGM_MANUTENCAO_SCORM12_STATE_REVLMS_20260728` |
| SGSO | `MNT_SGSO_MANUTENCAO_STATE_REVLMS_20260728` | `MNT_SGSO_MANUTENCAO_SCORM12_STATE_REVLMS_20260728` |
| PT6C | (sem storage em app.js) | `PT6C67C_MANUTENCAO_SCORM12_STATE_REVLMS_20260815` |
| HUMS-VXP | `ead_<curso>_revlms20260728_` (prefixo) | `MNT_HUMS_VXP_SCORM12_STATE_REVLMS_20260728` |
| MEL | `airtrust:${data.id}:state` | `airtrust-scorm-local-mnt-mel-minimum-equipment-list-rev01d-20260811` |

Como `localStorage` é compartilhado por origem no navegador, **um aluno que
abre o curso depois de outro herda o estado do anterior** (slides concluídos,
quiz, score). No MEL, `loadState()` faz união dos slides locais com os do LMS,
agravando o efeito (aluno novo abre "80/80" porque outro aluno percorreu o MEL
naquele navegador).

## Prova dinâmica (produção, 2026-08-27)

Matrícula **248** (Francisco Sergio Nascimento da Costa — MCQ), estado no
servidor `NAO_INICIADO` (`progresso: null`):

1. Confirmado servidor sem progresso.
2. `localStorage` da origem do pacote continha as chaves não-isoladas acima.
3. Ao semear a chave `MNT_MCQ_MANUTENCAO_STATE_REVLMS_20260728` com estado
   "completado por outro aluno" e reabrir, o pacote exibiu **"Tela 69 de 69",
   "99%", "69/69"** — herdando o estado apesar de o servidor não ter progresso.
4. Chaves removidas após a evidência; servidor permaneceu `NAO_INICIADO`.

## Correção

Duas partes, obrigatoriamente nesta ordem:

### 1. Wrapper (worker)

`worker-airtrust/src/services/lms-scorm-local-resume.ts` agora expõe no `window`
do frame pai:

```js
window.MATRICULA_ID = MATRICULA_ID;
window.CICLO_ID = CICLO_ID;
window.NUMERO_CICLO = NUMERO_CICLO;
```

Os pacotes (iframe same-origin) leem `window.parent.MATRICULA_ID` /
`window.parent.CICLO_ID`.

### 2. Pacotes (R2)

`scripts/scorm-storage-isolation/patch-package.mjs` envolve a definição de chave
de cada `app.js`/`scorm_api.js` com `__scopeStorageKey__(...)`, produzindo:

```
<BASE_KEY>:m<matricula_id>:c<ciclo_id>
```

- Sem matrícula (standalone/preview): `<BASE_KEY>:standalone`.
- Não faz `localStorage.clear()` — apenas isola; chaves antigas ficam órfãs e
  deixam de ser lidas (a fonte de verdade passa a ser o servidor).

### Aplicação

```bash
# 1) Deploy do worker (exposição dos IDs) — PR/merge governado primeiro.
# 2) Dry-run:
node scripts/scorm-storage-isolation/apply-to-r2.mjs --bucket airtrust-storage-staging
# 3) Aplicar (após validação em staging):
node scripts/scorm-storage-isolation/apply-to-r2.mjs --bucket airtrust-storage --confirm
```

## Garantias pós-correção

- Matrícula nova **não** herda estado de outra.
- Retomada da MESMA matrícula continua funcionando (servidor `suspend_data` +
  chave escopada).
- Novo ciclo não herda ciclo anterior (`ciclo_id` entra na chave).
- Dois alunos sequenciais no mesmo navegador não compartilham progresso/quiz/score.

## Testes

```bash
node --test scripts/__tests__/scorm-storage-isolation-patch-package.test.mjs
cd worker-airtrust && npx vitest run src/__tests__/services/lms-scorm-local-resume.test.ts
```

## Limitações

- A correção dos pacotes é feita **por cima** dos objetos ativos no R2 (não cria
  nova versão `_candidates`). Migração para nova versão versionada exigiria
  atualizar `lms_cursos.scorm_package_r2_prefix` (escrita D1, fora do escopo
  autorizado).
- Chaves órfãs (pré-correção) não são migradas; são ignoradas e podem ser
  removidas futuramente por política de storage.
