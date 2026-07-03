# Costa do Sol / AirTrust — Matriz V6.1 Plano de Revisão das Fichas Restantes 20260703

**Data-base:** 2026-07-03
**Caráter:** Documental / read-only. Tabela objetiva de status e recomendação.

---

## Tabela Objetiva dos 12 Modelos Fora do Escopo V6

| # | Modelo | Tipo | Aeronave | Status Atual | Problema Principal | Fonte Regulatória / FAP | Recomendação | Prioridade |
|---|---|---|---|---|---|---|---|---|
| 1 | `A139-S-01/02` | Semestral noturno | AW139 | Ativo | 22 LOFT-NOT genéricos, 0 códigos AW139, 3 CRM (20-21-22), 0 NOTECHS | PTO Rev. 10, FAP 05.2 | `CONVERTER_18_NOTECHS` | **Crítica** |
| 2 | `A139-S-02/02` | Semestral check IFR | AW139 | Ativo | 22 LOFT-CHK genéricos, 0 códigos AW139, 5 CRM (04/16/20/21/22), 0 NOTECHS | PTO Rev. 10, FAP 06 | `CONVERTER_18_NOTECHS` | **Crítica** |
| 3 | `A139-REQ-01` | Reaquisição | AW139 | Ativo | 17 LOFT-CHK + 5 operacionais, 5 CRM (04/16/20/21/22), 0 NOTECHS | RBAC 61 — PENDENTE | `CONVERTER_18_NOTECHS` | **Alta** |
| 4 | `S76-REQ-01` | Reaquisição | S76 | Ativo | **`S76-CRM-01` + `S76-COM-01` + `S76-ATC-01` como manobras**, CRM legado, 0 NOTECHS | RBAC 61 — PENDENTE | `CONVERTER_18_NOTECHS` | **Alta** |
| 5 | `TRE-INST` | Instrutor | — | Ativo | Sem fonte regulatória. Natureza híbrida (técnica + instrucional) | **PENDENTE_FONTE_REGULATORIA** | `REVISAR_REGULATORIAMENTE` | **Alta** |
| 6 | `CRED-EXA` | Examinador | — | Ativo | Sem fonte regulatória. Maior risco regulatório | **PENDENTE_FONTE_REGULATORIA** | `REVISAR_REGULATORIAMENTE` | **Alta** |
| 7 | `A139-NOT-02` | Noturno offshore | AW139 | Ativo | Mistura LOFT-NOT + LOFT-OFF, 2 CRM, 2 códigos AW139, 0 NOTECHS | FAP 05.2, FAP 14 | `CONVERTER_18_NOTECHS` | Média |
| 8 | `A139-NOT-01` | Noturno onshore | AW139 | Ativo | 22 LOFT-NOT genéricos, 3 CRM, 0 códigos AW139, 0 NOTECHS | FAP 05.2 | `CONVERTER_18_NOTECHS` | Média |
| 9 | `S76-NOT-02` | Noturno offshore | S76 | Ativo | Mistura S76-LOFT + LOFT-OFF + S76, 3 CRM, 0 NOTECHS | FAP 05.2, FAP 14 | `MANTER_COM_AJUSTE_MÍNIMO`/`CONVERTER` | Média |
| 10 | `S76-NOT-01` | Noturno onshore | S76 | Ativo | S76-LOFT* com alguns códigos S76, 4 CRM legado, 0 NOTECHS | FAP 05.2 | `MANTER_COM_AJUSTE_MÍNIMO` | Média |
| 11 | `SK76-S-02/02` | Semestral check | SK76 | **Confirmar** | Cópia do AW139, descrições incorretas, 5 CRM, 0 códigos SK76, 0 NOTECHS | PTO SK76 — PENDENTE | `REVISAR_REGULATORIAMENTE` | Confirmar |
| 12 | `SK76-S-01/02` | Semestral noturno | SK76 | **Confirmar** | Cópia do AW139, 3 CRM, 0 códigos SK76, 0 NOTECHS | PTO SK76 — PENDENTE | `REVISAR_REGULATORIAMENTE` | Confirmar |

---

## Resumo por Classificação V6.1

| Classificação | Quantidade | Modelos |
|---|---|---|
| `CONVERTER_18_NOTECHS` | 6 | `A139-S-01/02`, `A139-S-02/02`, `A139-REQ-01`, `S76-REQ-01`, `A139-NOT-01`, `A139-NOT-02` |
| `MANTER_COM_AJUSTE_MÍNIMO` | 2 | `S76-NOT-01`, `S76-NOT-02` |
| `REVISAR_REGULATORIAMENTE` | 4 | `TRE-INST`, `CRED-EXA`, `SK76-S-01/02`, `SK76-S-02/02` |
| `LEGADO_FORMAL` | 0 | — (pode se aplicar a SK76 semestral se owner confirmar não-uso) |
| `DESCONTINUAR_FORMALMENTE` | 0 | — |

---

## Pendências Regulatórias Bloqueantes

| # | Pendência | Impacto | Quem Resolve |
|---|---|---|---|
| 1 | FAP de Instrutor não localizada | Bloqueia `TRE-INST` | Owner |
| 2 | FAP/IS de Examinador não localizada | Bloqueia `CRED-EXA` | Owner |
| 3 | RBAC 61 — requisitos de reaquisição | Afeta `A139-REQ-01`, `S76-REQ-01` | Owner / Equipe técnica |
| 4 | PTO SK76 não localizado | Afeta todos os SK76 | Owner |
| 5 | Confirmação de uso operacional SK76 semestral | Determina se converte ou legada | Owner |

---

## Ordem Recomendada de Revisão

| Ordem | Modelos | Motivo |
|---|---|---|
| 1º | `A139-S-01/02`, `A139-S-02/02` | Maior risco para PTO Rev. 10. Menor dependência de fontes externas |
| 2º | `A139-REQ-01`, `S76-REQ-01` | `S76-REQ-01` é a ficha mais degradada (CRM como manobra) |
| 3º | `S76-NOT-01`, `S76-NOT-02` | Menos esforço (já têm base de códigos específicos) |
| 4º | `A139-NOT-01`, `A139-NOT-02` | Requer seleção completa de pool AW139 |
| 5º | `TRE-INST`, `CRED-EXA` | Dependem de fontes regulatórias externas |
| 6º | `SK76-S-01/02`, `SK76-S-02/02` | Dependem de confirmação do owner |

---

## Confirmações

- ✅ Apenas documento `.md` criado.
- ✅ Nenhuma implementação, migration, DML, deploy.
- ✅ Produção intocada.
- ✅ PR #241 preservado como draft parcial.
