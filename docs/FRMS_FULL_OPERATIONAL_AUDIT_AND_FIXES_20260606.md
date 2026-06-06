# FRMS — Auditoria Operacional Completa e Correções (2026-06-06)

**Ferramenta/modelo:** Opus 4.8 — modo auditoria crítica + correção controlada.
**Data:** 2026-06-06
**Autor:** Auditoria automatizada orientada a invariantes operacionais e evidência real (tela/API/banco).

---

## 1. Contexto

O FRMS passou por um *rebuild* operacional para adotar **SIGVOOS como fonte canônica** no recorte
`2026-01-01` a `2026-06-05` (timezone `America/Sao_Paulo`). Commits conhecidos:

- `dd7600c` rebuild operational data from sigvoos
- `bdb0730` clear orphan alerts from sigvoos rebuild
- `809ba57` enforce sigvoos as canonical operational source
- `d2c011e` correct 7d and 365d accumulated flight hours in month view
- `1ab74f1` restore admin scope and canonical accumulated data **(HEAD)**

Sintoma reportado: na tela FRMS mensal de junho/2026, a coluna `MÊS` mostrava valores positivos,
porém `7 DIAS = 0h00` e `365 DIAS = 0h00` para **todos** os tripulantes (ex.: Dieter `MÊS=40h01`,
`7 DIAS=0h00`, `365 DIAS=0h00`).

## 2. Falha da auditoria anterior

A auditoria anterior não cruzou **versão deployada em produção** × **HEAD local** × **estado real do
banco**. O resultado é que correções já commitadas foram tratadas como "em produção" sem verificação
empírica. Esta auditoria assume o FRMS **errado até prova** e valida cada número com `SELECT` read-only
no banco de produção e reprodução da query exata do código.

## 3. Escopo

Inventário FRMS; matriz UI×API×SQL×Banco×Regra dos campos críticos; 30 invariantes operacionais;
casos sentinela reais (Dieter + 8 tripulantes da tela); colunas `7 DIAS`/`365 DIAS`; FIRA remanescente
(525); SIGVOOS/FIRA/MANUAL; coleta de Fadiga Diária; rolling/acúmulo; alertas; testes; correções.

## 4. Ambiente e versão — **DIVERGÊNCIA CRÍTICA**

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD local | `1ab74f1` |
| origin/main | `1ab74f1` |
| HEAD == origin/main | **SIM** |
| **Versão em PRODUÇÃO** | `2026-06-06T01:31:12Z-d2c011e` |
| **Commit em produção** | `d2c011e` |
| Health | HTTP 200 `healthy` (db ok ~355ms, storage ok ~145ms) |

> **Achado P0:** Produção roda **`d2c011e`**, mas o HEAD/origin é **`1ab74f1`**. **Produção está 1 commit
> atrás.** As correções de fonte canônica do `MÊS` e da coleta de Fadiga Diária estão **commitadas em
> `1ab74f1` mas NÃO deployadas**. Logo, defeitos operacionais já corrigidos no código **continuam vivos
> em produção**.

## 5. Regras de segurança aplicadas

Nenhuma migration; nenhuma escrita em banco (somente `SELECT` local/remoto); nenhum deploy; nenhum push;
sem `git add .`; sem mascarar erro com clamp/fallback/hardcode; FIRA não reclassificado como operacional;
SIGVOOS inválido não promovido. **Confirmado ao final (seções 27–28).**

## 6. Inventário FRMS (núcleo relevante)

| Área | Arquivo | Função/Rota | Responsabilidade |
|---|---|---|---|
| Acúmulo frota (mês/rolling) | `worker-airtrust/src/lib/frms/db-service-acumulo.ts` | `buscarAcumuloFrota`, `buscarAcumuloTripulante` | Calcula `MÊS`/`7d`/`365d`/`dia` da tabela de tripulantes |
| Política de fonte | `worker-airtrust/src/lib/frms/frms-source-policy.ts` | `buildCanonicalOperationalSourceSql`, `resolveFrmsSourceStatus` | Define SIGVOOS como canônico; FIRA/MANUAL não operacional |
| Snapshot operacional | `worker-airtrust/src/routes/frms-operational-snapshot.ts` | rota | Cards superiores / contadores |
| Fadiga acumulada | `worker-airtrust/src/routes/frms-fadiga-acumulada.ts` | rota | Acumulados legais por tripulante |
| Coleta fadiga (check-in) | `src/react-app/hooks/useFadigaCheckin.ts`, `worker-airtrust/src/routes/frms-fadiga-checkin.ts` | `useFadigaPainel`, `/frms/daily-fatigue` | Painel de fadiga diária da equipe |
| Controle operacional | `src/react-app/pages/frms/FrmsControleOperacional.tsx` | página | Tela operacional + filtro técnico |
| Alertas | `worker-airtrust/src/lib/frms/db-service-alertas.ts`, tabela `frms_alerta` | — | Alertas por limite (7d/mês/365d/dia/repouso) |
| Rolling | tabela `frms_acumulo_rolling` | — | Snapshot por tripulante/data, fonte de `7d/365d/dia` |

## 7. Causa-raiz das colunas `7 DIAS` e `365 DIAS` zeradas — **RESOLVIDO**

**Cadeia de evidência (produção, read-only):**

1. O modo mês de `buscarAcumuloFrota` (até `bdb0730`) **hardcodava** `hv_365d_min=0`, `pct_365d=0`,
   `hv_dia_min=0`, `pct_dia=0` e calculava `hv_7d_min` contra uma janela de fim de mês **no futuro**
   (para o mês corrente), retornando 0.
2. `d2c011e` corrigiu via **`LEFT JOIN frms_acumulo_rolling`** (snapshot mais recente por tripulante).
3. Tabela `frms_acumulo_rolling` em produção: **262 linhas, 18 tripulantes, max_ref `2026-06-05`,
   251 com 7d>0, 256 com 365d>0** — não está vazia.
4. Reproduzindo a **query exata do código `d2c011e`** contra produção, todos retornam **7d/365d > 0**:

| Tripulante | MÊS (min) | 7 DIAS (min) | 365 DIAS (min) | ar_ref |
|---|---|---|---|---|
| Dieter Johny Kühr | 2401 (40h01) | 864 (14h24) | 6091 (101h31) | 2026-06-05 |
| Paloma G. Magioli | 1537 | 1361 | 4439 | 2026-05-30 |
| Karl Martin Kühr | 1234 | 1234 | 7623 | 2026-06-05 |
| José A. G. Marinho | 1234 | 1234 | 3709 | 2026-06-05 |
| Fernando La Rocque | 864 | 864 | 6918 | 2026-06-05 |
| Gabriel F. Barreto | 327 | 327 | 3798 | 2026-06-05 |
| Antonio L. S. Ramos | 327 | 327 | 2166 | 2026-06-05 |
| Ramon Godinho Bastos | 17 | 17 | 32 | 2026-06-05 |
| Caio C. S. Alcantara | 17 | 17 | 17 | 2026-06-05 |

> **Causa-raiz:** o print do sintoma foi tirado na versão de produção **`bdb0730`
> (2026-06-06T00:43:55Z)**, **anterior** ao deploy de `d2c011e` (01:31:12Z). Com `d2c011e` já em
> produção, `7 DIAS`/`365 DIAS` **já retornam valores corretos**. Bug de **query/hardcode**, já
> deployado e corrigido. **Não é bug de frontend, fallback nem janela atual.**

## 8. Achado crítico residual — `MÊS` contaminado por FIRA em produção

Em `d2c011e` (produção atual) o `MÊS` soma **todas as fontes**; o filtro canônico
`UPPER(j.origem)='SIGVOOS'` foi adicionado apenas em **`1ab74f1` (não deployado)**.

Jornadas de junho/2026 do Dieter (id 7), produção:

| Data | Fonte | Jornada | HV | Nota |
|---|---|---|---|---|
| 2026-06-01 | **FIRA** | 595 | **1537 (25h37)** | não operacional + HV>jornada |
| 2026-06-02 | SIGVOOS | 375 | 189 | ok |
| 2026-06-03 | SIGVOOS | 451 | 282 | ok |
| 2026-06-04 | SIGVOOS | 462 | 190 | ok |
| 2026-06-05 | SIGVOOS | 316 | 203 | ok |

- `MÊS` produção (todas as fontes) = **2401 min (40h01)**
- HV só SIGVOOS canônico = **864 min (14h24)**
- HV FIRA = **1537 min** → **contamina o `MÊS`**

Consequências em produção (`d2c011e`):
- **Viola invariantes #7/#8** (FIRA não operacional alimenta card/coluna operacional).
- **Viola invariante #12** (fontes diferentes por coluna): `MÊS=40h01` (todas as fontes) mas
  `7 DIAS=14h24` (rolling, só SIGVOOS) — internamente incoerente na mesma linha.

> **Status do código:** **já corrigido em `1ab74f1`** (filtro canônico no `MÊS`, `HAVING` sobre soma
> canônica). Com `1ab74f1`, Dieter `MÊS = 864 (14h24)`, consistente com `7 DIAS`. **Pendente apenas
> de deploy** (fora do escopo permitido nesta fase).

## 9. Matriz resumida UI × API × SQL × Banco × Regra (campos críticos)

| Campo UI | Hook/Rota | Fonte SQL | Tabela | Regra | Estado |
|---|---|---|---|---|---|
| `MÊS` | `buscarAcumuloFrota` (mês) | `SUM(hv) WHERE data∈mês AND origem=SIGVOOS`¹ | `frms_jornada` | só canônico | ✅ HEAD / ⚠️ prod contamina FIRA |
| `7 DIAS` | idem (LEFT JOIN rolling) | `ar.hv_7_dias_min` | `frms_acumulo_rolling` | só SIGVOOS | ✅ |
| `365 DIAS` | idem | `ar.hv_365_dias_min` | `frms_acumulo_rolling` | só SIGVOOS | ✅ |
| `DIA` | idem | `ar.hv_dia_min` | `frms_acumulo_rolling` | só SIGVOOS | ✅ |
| Fadiga diária (equipe) | `useFadigaPainel` → `/frms/daily-fatigue?scope=team` | endpoint | check-ins | data normalizada, sem fallback mudo | ✅ HEAD / ⚠️ prod |
| Alertas abertos (badge) | `frms_alerta` | `resolvido=0 AND deleted_at IS NULL` | `frms_alerta` | só SIGVOOS, sem órfão | ✅ |

¹ filtro `origem=SIGVOOS` presente em `1ab74f1`; ausente em `d2c011e` (produção).

## 10. Casos sentinela reais

- **Dieter:** ver seções 7 e 8. `2026-06-01` = FIRA não operacional (HV bruto 1537/jorn 595);
  `2026-06-02..05` = SIGVOOS operacional. Rolling `2026-06-05`: 7d=864, 365d=6091 — exclui FIRA ✓.
- **Paloma, Karl, Marinho, La Rocque, Gabriel, Ramos, Ramon, Caio:** todos com `MÊS/7d/365d > 0` na
  query de produção (tabela seção 7). Predominância SIGVOOS no recorte abr–jun.

## 11. Achados críticos

- **C1 (P0):** Produção 1 commit atrás (`d2c011e` vs HEAD `1ab74f1`) — correções operacionais não vivas.
- **C2 (P0):** `MÊS` contaminado por FIRA não operacional em produção (Dieter 2401 vs 864 canônico).
  Corrigido em `1ab74f1`, pendente deploy.

## 12. Achados médios

- **M1:** Inconsistência interna de fonte por linha em produção (`MÊS` todas-fontes × `7d/365d` rolling).
  Mesma origem que C2; resolvido por `1ab74f1`.
- **M2:** Dados históricos FIRA com `HV>jornada`/`jornada=0` (seção 13) permanecem no banco como
  histórico; isolados do operacional pelo filtro canônico, mas pendentes de **saneamento de dados**
  (fase própria com escrita autorizada).

## 13. Achados baixos

- **B1:** No mapeamento do mês, `(row.x as number) || 0` converte rolling NULL → 0. Risco residual baixo
  pois a base do `FROM` é `SELECT DISTINCT tripulante_id FROM frms_acumulo_rolling` (todo tripulante tem
  ao menos um snapshot, então o LEFT JOIN "mais recente" sempre casa). Recomendado log/telemetria se NULL.
- **B2:** 134 jornadas `MANUAL` com `horas_voo_minutos` NULL no recorte — corretamente fora do operacional,
  mas convém rótulo explícito de "MANUAL sem HV".

## 14. Colunas `7d`/`365d` — conclusão

**RESOLVIDO em produção** por `d2c011e` (LEFT JOIN rolling). Valores reais não-zero confirmados por
`SELECT` + reprodução de query (seção 7). Tabela rolling íntegra (max_ref 2026-06-05).

## 15. FIRA remanescente (525) — explicação objetiva

Distribuição temporal (produção):

| Mês | FIRA | SIGVOOS |
|---|---|---|
| 2026-01 | 175 | 0 |
| 2026-02 | 201 | 8 |
| 2026-03 | 109 | 11 |
| 2026-04 | 36 | 86 |
| 2026-05 | 2 | 130 |
| 2026-06 | 2 | 26 |

- **92% dos FIRA (485/525) estão em jan–mar**, período **anterior à cobertura SIGVOOS** (SIGVOOS só ganha
  volume a partir de abril). FIRA e SIGVOOS são **temporalmente disjuntos**.
- **FIRA com SIGVOOS no mesmo dia (mesmo tripulante): 0.**
- **FIRA com SIGVOOS em janela ±1 dia: 19** (casos de fronteira, ex. Dieter 06-01 ↔ SIGVOOS 06-02).
- **FIRA sem qualquer SIGVOOS adjacente: 506.**

**Classificação:**
- **A — `FIRA_HISTORICO_SUBSTITUIDO_POR_SIGVOOS` (fronteira ±1d):** 19.
- **B — `FIRA_SEM_SIGVOOS_CORRESPONDENTE` (histórico real):** 506.
- C/D/E/F/G/H/I: não evidenciados como classes materiais (0 same-day; rebuild priorizou SIGVOOS — ver §18).

> **Por que ainda há tanto FIRA?** Porque são **histórico legítimo pré-SIGVOOS** (jan–mar/2026). Não há
> SIGVOOS para substituí-los. **Não alimentam rolling** (§18) **nem alertas** (§19). O único ponto onde
> ainda impactam é o `MÊS` em produção `d2c011e` (§8), corrigido por `1ab74f1`.

## 16. SIGVOOS / FIRA / MANUAL (recorte 2026-01-01 a 2026-06-05)

| Fonte | Registros | Σ HV (min) |
|---|---|---|
| FIRA | 525 | 100486 |
| MANUAL | 134 | NULL |
| SIGVOOS | 261 | 53981 |

SIGVOOS é a fonte operacional; FIRA/MANUAL não operacionais pela política canônica.

## 17. Coleta de Fadiga Diária

Fluxo: `useFadigaPainel(data)` → `/frms/daily-fatigue?date=...&scope=team`. `1ab74f1` corrigiu:
- **Normalização de data** BR `dd/mm/yyyy` → ISO `yyyy-mm-dd` (`normalizeFadigaPainelDate`).
- Caminho de request padronizado com `scope=team` (`buildFadigaPainelRequestPath`).
- **Erro explícito** quando o endpoint devolve escopo individual ou formato inesperado, em vez de
  retornar lista vazia silenciosa (respeita invariante #13 — ausência de dado não vira vazio mudo).
- Filtro de `status='no_duty'`.
- Testes adicionados (`FrmsCheckinFadiga.test.tsx`, +135 linhas).

> **Estado:** corrigido em **`1ab74f1`** (HEAD), com testes. **Pendente de deploy** (produção `d2c011e`
> ainda usa o caminho antigo: data BR enviada sem normalização e payload mismatch silencioso).

## 18. Rolling / acúmulo

- `frms_acumulo_rolling`: 262 linhas, 18 tripulantes, max_ref `2026-06-05`. Atualizado pós-rebuild.
- **Composição de fonte:** cruzando rolling com jornadas do mesmo dia, **100% SIGVOOS (261), zero FIRA**.
  Confirma invariante #5 (FIRA não operacional não alimenta rolling).
- `7d/365d/dia` da tabela mensal vêm exclusivamente do rolling (snapshot mais recente por tripulante).

## 19. Alertas

- **Abertos (não deletados, `resolvido=0`): 85** — bate com o badge "85 alertas abertos" da UI.
- **Origem das jornadas vinculadas aos 85 abertos: 100% SIGVOOS.** Zero FIRA. Zero órfãos
  (`jornada_id` inexistente/soft-deleted = 0). Invariantes #6/#29 satisfeitos.

## 20. Testes existentes e lacunas

Cobertura relevante **já presente em HEAD** (`1ab74f1`/`d2c011e`):
- `acumulo-frota-rolling-fields.test.ts` — modo mês propaga 7d/365d/dia do rolling; verifica filtro
  canônico (`UPPER(COALESCE(j.origem,''))='SIGVOOS'`); **`ignora FIRA e MANUAL no hv_mes_min mensal`**
  (invariante #7); `nivel_max` considera pct_365d/pct_dia; `HAVING > 0`.
- `acumulo-tripulante-source-policy.test.ts` — ignora FIRA/MANUAL no bloco mensal individual.
- `frms-source-policy*.test.ts`, `frms-source-policy-rolling.test.ts` — política canônica e rolling.
- `frms-fadiga-acumulada-contract.test.ts`, `FrmsCheckinFadiga.test.tsx` — contrato e coleta de fadiga.

Resultado da suíte FRMS worker: **233/233 PASS** (19 arquivos).

**Lacuna real:** não há **teste de guarda de paridade versão-deploy** (que detectaria C1). Isso é
processo de CI/CD, não unidade — registrado como recomendação operacional.

## 21. Correções aplicadas nesta auditoria

**Nenhuma alteração de código foi necessária.** Todas as correções operacionais já estavam commitadas
em HEAD (`1ab74f1`) com testes verdes. Esta auditoria entrega:
- Este documento (`docs/FRMS_FULL_OPERATIONAL_AUDIT_AND_FIXES_20260606.md`).
- Validação empírica read-only contra produção.

## 22. Correções não aplicadas e por quê

- **Deploy de `1ab74f1` para produção** — **fora do escopo** (regras 4/5: sem deploy/push). É a ação
  necessária para eliminar C1/C2/M1 em produção.
- **Saneamento dos FIRA históricos com `HV>jornada`/`jornada=0`** — exige **escrita em banco**;
  proibido nesta fase (regras 2/13). Proposto na seção 23.

## 23. Plano de saneamento futuro (requer autorização explícita)

1. **Deploy de `1ab74f1`** (elimina contaminação do `MÊS` e normaliza coleta de fadiga). Pré-requisito.
2. **Saneamento de dados FIRA inválidos** (fase própria, com backup + dry-run + autorização):
   - Marcar/segregar os 13 FIRA com `HV>jornada` (incl. 5 com `jornada=0`) como histórico inválido
     não exibível, **sem** promovê-los a operacional e **sem** reclassificar para SIGVOOS.
   - Avaliar rótulo de UI para os 506 FIRA históricos pré-SIGVOOS (jan–mar) como "histórico/auditoria".
3. **Guarda de CI**: checagem de paridade entre commit deployado e HEAD antes de fechar incidentes FRMS.

## 24. Riscos remanescentes

- **R1 (alto até deploy):** `MÊS` em produção continua somando FIRA (Dieter 40h01 vs 14h24 real).
- **R2 (médio):** coleta de fadiga em produção ainda sem normalização de data/erro explícito.
- **R3 (baixo):** dados históricos FIRA inconsistentes permanecem no banco (isolados do operacional).

## 25. Checklist manual autenticado (pendência não bloqueante)

Após deploy de `1ab74f1`, validar logado na UF FRMS junho/2026:
- [ ] Dieter `MÊS ≈ 14h24` (864 min), não 40h01.
- [ ] `7 DIAS`/`365 DIAS` não-zero e coerentes com rolling.
- [ ] Aba Fadiga Diária (Equipe) carrega para data BR e exibe erro claro se payload divergente.
- [ ] Badge de alertas = 85 (ou valor coerente com `frms_alerta resolvido=0`).
- [ ] Nenhum FIRA aparecendo como fonte principal quando há SIGVOOS válido.

## 26. Conclusão

O sintoma `7 DIAS`/`365 DIAS = 0h00` **já está resolvido em produção** (`d2c011e`); o print era de
`bdb0730`. O defeito operacional **vivo** é a **contaminação do `MÊS` por FIRA não operacional** em
produção, porque a correção (`1ab74f1`) **não foi deployada**. SIGVOOS é priorizado corretamente no
rolling e nos alertas; os 525 FIRA são histórico pré-SIGVOOS e não alimentam rolling/alertas. Nenhuma
correção de código foi necessária (já em HEAD com testes verdes); a ação pendente é **deploy autorizado**
e, em fase posterior, **saneamento de dados FIRA históricos**.

## 27. Confirmação de escrita em banco

**Nenhuma escrita em banco** foi executada. Todas as consultas D1 (local/remoto) foram **`SELECT`**
read-only (`rows_written: 0`, `changed_db: false` em todas as execuções).

## 28. Confirmação de migrations

**Nenhuma migration** foi criada ou executada.

---

### Validações executadas

- `npx tsc --noEmit` → **PASS** (exit 0)
- `npm run lint` → **PASS** (url guard, tracked-secrets, auth-boundaries)
- `cd worker-airtrust && npx vitest run src/__tests__/frms/` → **233/233 PASS** (19 arquivos)

### Status final

**AMARELO** — código e backend coerentes e testados (HEAD verde); `7d/365d` resolvidos em produção;
rolling e alertas íntegros (SIGVOOS, sem órfãos); FIRA isolado do operacional no rolling/alertas.
**Ressalva bloqueante para produção:** o `MÊS` segue contaminado por FIRA até o **deploy de `1ab74f1`**,
e há **saneamento de dados FIRA históricos** pendente de fase própria com escrita autorizada.
