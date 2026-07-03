# Simuladores Matriz V6 - Implementation Report 20260703

## Veredito

- GO condicionado para PR draft.
- NO-GO para merge.
- NO-GO para producao.
- Status PDF: GO.

## Arquivos alterados/criados nesta entrega

- Script de manutencao:
  - `scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs`
  - `scripts/maintenance/lib/simuladores-matriz-v6-data.mjs`
- Testes:
  - `src/__tests__/simuladores-matriz-v6-data.test.ts`
  - `src/__tests__/generate-simuladores-matriz-v6-previews.test.ts`
- Documentacao:
  - `docs/analysis/COSTA_DO_SOL_MATRIZ_V6_OWNER_ACCEPTED_20260703.md`
  - `docs/analysis/SIMULADORES_MATRIZ_V6_IMPLEMENTATION_PREFLIGHT_20260703.md`
  - `docs/analysis/SIMULADORES_MATRIZ_V6_IMPLEMENTATION_REPORT_20260703.md`
- Previews PDF:
  - `docs/analysis/matriz-v6-pdf-previews-20260703/S76_SK76_INICIAL_01_12_20260703.pdf`
  - `docs/analysis/matriz-v6-pdf-previews-20260703/S76_SK76_LOFT_CHECK_12_12_20260703.pdf`
  - `docs/analysis/matriz-v6-pdf-previews-20260703/AW139_INICIAL_01_12_20260703.pdf`
  - `docs/analysis/matriz-v6-pdf-previews-20260703/AW139_LOFT_CHECK_12_12_20260703.pdf`

## Tabelas afetadas pelo plano V6

- `manobras`
- `modelos_sessao_manobras`

## Migrations criadas

- Nenhuma migration nova criada.
- Motivo: metadata suportada por `modelos_sessao_manobras.observacoes`; producao permanece bloqueada.

## Dry-run e estrategia de dados

- Modo padrao do script: `--dry-run`
- Apply protegido por confirmacao textual exata:
  - `APLICAR MATRIZ V6 COSTA DO SOL`
- Escopo tenant:
  - `--empresa-id 6`
- Dry-run executado:
  - `node scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs --dry-run --empresa-id 6`
- Resultado:
  - 39 modelos-alvo
  - 702 relacoes tecnicas alvo
  - 18 tecnicas distintas por modelo
  - 15 NOTECHS esperados fora das 18
  - source map atual confirma 22 tecnicas por modelo antes da V6
  - 0 duplicidades `modelo_id + manobra_id` nos validadores da V6
  - 0 hard delete proposto pelo script
  - 0 ficha finalizada tocada pelo escopo do script

## Escopo de modelos V6

| status | quantidade | descricao |
| --- | ---: | --- |
| incluidos | 39 | modelos Costa do Sol V6 cobertos |
| excluidos | 12 | modelos fora de escopo da matriz V6 Costa do Sol |
| total analisado | 51 | matriz historica/export read-only |

### Modelos excluidos e motivo

| modelo | aeronave/familia | motivo_exclusao | risco |
| --- | --- | --- | --- |
| `A139-NOT-01` | AW139 / noturno | trilha noturna fora do escopo fixado para a V6 | baixo |
| `A139-NOT-02` | AW139 / noturno | trilha noturna fora do escopo fixado para a V6 | baixo |
| `A139-REQ-01` | AW139 / reaquisicao | modelo de reaquisicao explicitamente preservado fora do escopo V6 | baixo |
| `A139-S-01/02` | AW139 / semestral | trilha semestral legada fora do pacote Costa do Sol V6 | medio |
| `A139-S-02/02` | AW139 / semestral | trilha semestral legada fora do pacote Costa do Sol V6 | medio |
| `CRED-EXA` | credenciamento / exame | modelo examinador/credenciamento, nao operacional Costa do Sol | baixo |
| `S76-NOT-01` | S76 / noturno | trilha noturna fora do escopo fixado para a V6 | baixo |
| `S76-NOT-02` | S76 / noturno | trilha noturna fora do escopo fixado para a V6 | baixo |
| `S76-REQ-01` | S76 / reaquisicao | modelo de reaquisicao explicitamente preservado fora do escopo V6 | baixo |
| `SK76-S-01/02` | SK76 / semestral | trilha semestral legada fora do pacote Costa do Sol V6 | medio |
| `SK76-S-02/02` | SK76 / semestral | trilha semestral legada fora do pacote Costa do Sol V6 | medio |
| `TRE-INST` | instrutor | trilha de treinamento de instrutor, fora do curriculo operacional Costa do Sol | baixo |

### Leitura de escopo

- Os 39 incluidos cobrem exatamente:
  - 24 modelos iniciais (`SK76-I-01/12` a `SK76-I-12/12` e `A139-I-01/12` a `A139-I-12/12`)
  - 15 modelos periodicos (`S76-P-C1/VFR`, `S76-P-C1/IFR`, `S76-P-C2/VFR`, `S76-P-C2/IFR`, `S76-P-C3/VFR`, `S76-P-C3/IFR`, `SK76-P-CHECK`, `A139-P-C1/VFR`, `A139-P-C1/IFR`, `A139-P-C2/VFR`, `A139-P-C2/IFR`, `A139-P-C3/VFR`, `A139-P-C3/IFR`, `A139-P-LOFT/OFFSHORE`, `A139-P-LOFT/CHECK`)
- Nenhum dos 12 excluidos corresponde a modelo inicial Costa do Sol, periodico Costa do Sol, `LOFT` inicial, `LOFT Check` inicial ou periodico que a V6 tenha prometido cobrir.
- Status de escopo: `OK_PARA_PR_DRAFT`.

## Testes e validacoes executados

- `node --check scripts/maintenance/lib/simuladores-matriz-v6-data.mjs`
- `node --check scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs`
- `npx vitest run src/__tests__/simuladores-matriz-v6-data.test.ts`
- `npx vitest run src/__tests__/generate-simuladores-matriz-v6-previews.test.ts`
- `npm run test:run`
  - Resultado: 125 arquivos de teste aprovados, 3 pulados, 1149 testes aprovados
- `npx tsc --noEmit --pretty false`
  - Resultado: passou
- `git diff --check`
  - Resultado: falhou em PDFs preexistentes sob `docs/analysis/notechs-previews-20260702/*.pdf`
  - Leitura: nao foi regressao desta tarefa; o problema ja estava no working tree anterior
  - Confirmacao adicional: os PDFs antigos aparecem no `git diff` local atual, mas nao fazem parte do conjunto V6 a commitar para o PR draft
  - Acao para PR draft: nao commitar esses PDFs nem os arquivos visuais congelados fora do escopo

## PDF / ficha - validacao de regressao

- Nenhum arquivo de layout PDF foi alterado nesta entrega.
- Nenhum componente visual de ficha foi alterado nesta entrega.
- Os 4 previews exigidos foram gerados com o gerador real `gerarPDFFichaCliente`.
- O harness de preview manteve:
  - 18 tecnicas
  - 15 NOTECHS adicionados pelo preview de modelo
  - NOTECHS depois das tecnicas
  - uma manobra por linha no gerador atual

## Riscos residuais

- Snapshot local detectado em `.wrangler` esta vazio/incompativel para validacao tenant-aware completa de apply local.
- Algumas substituicoes V6 alem da V5.1 abriram variacoes tecnicas reais pequenas para evitar duplicidade sem usar `-R`.
- Recomenda-se revisao operacional humana final antes de qualquer apply local em snapshot seeded.
- O working tree local possui sujeira preexistente em PDFs e arquivos visuais fora da V6; o PR draft deve isolar apenas os artefatos desta entrega.

## Rollback

- Sem remote apply.
- Sem DML remoto.
- Rollback planejado por soft delete logico dos vinculos V6 e reativacao do baseline documentado no source map.
- Catalogo novo deve permanecer se houver historico dependente; nao fazer hard delete.

## Confirmacoes obrigatorias

- Producao intocada: confirmado.
- Nenhuma migration remota: confirmado.
- Nenhum apply executado: confirmado.
- Nenhum deploy: confirmado.
- Nenhuma alteracao em fichas finalizadas: confirmado por escopo do script.
- NOTECHS fora das 18: confirmado por modelo de preview e validadores da matriz.
- `LOFT` e `LOFT Check` distintos: confirmado por nome de modelo e `carater=avaliativo`.
- `S76-VOR-00` e `S76-LDP-00` tratados como existentes: confirmado.
- AW139 e S76 nao foram misturados: confirmado pelos validadores da matriz.
- PR draft: permitido apos commit seletivo dos arquivos V6.
- Merge/producao: bloqueados ate revisao humana final e autorizacao explicita.
