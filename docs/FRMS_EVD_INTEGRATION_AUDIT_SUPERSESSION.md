# Nota de Supersessão — FRMS_EVD_COORDINATION_INTEGRATION_AUDIT.md

**Data:** 2026-05-29  
**Supersedido por:** commits `c96c2d6` (Window A) e `06c5601` (Window B) em `origin/main`

---

Este documento registra quais achados do `FRMS_EVD_COORDINATION_INTEGRATION_AUDIT.md` foram
**endereçados** pelo "EVD FRMS Coordination Visibility Pack" e quais permanecem em aberto.
O arquivo original **não foi apagado** — permanece como registro histórico da análise pré-implementação.

---

## Achados endereçados (não mais válidos como pendências)

| Seção | Achado original | Estado atual |
|---|---|---|
| 3.3 | `FrmsControleOperacional.tsx` — NÃO EXISTE | ✅ Criado: `src/react-app/pages/frms/FrmsControleOperacional.tsx` |
| 3.4 | Rota `frms-operational-snapshot.ts` — NÃO EXISTE | ⚠️ Rota backend ainda não existe; tela usa endpoint existente `/api/frms/operational-snapshot` se disponível |
| 4 (tabela) | Link EVD → FRMS por tripulante — NAO_IMPLEMENTADO | ✅ Implementado: badge F é link para `/frms/controle-operacional?data_inicio=...&funcionario_id=...` |
| RISCO 2 | Dado estimado sem destaque visual no EVD | ✅ Endereçado: badge exibe `SC Est.` quando `status === 'not_submitted' && dataSource === 'default_estimate'` |
| 8 (tabela) | Label "Estimado" — falta no badge SC | ✅ Implementado: marker `Est.` exibido no badge quando `dataSource === 'default_estimate'` |
| 3.3 / 6 (Q5) | "FrmsControleOperacional não existe" | ✅ Existe; aceita deep link com `?data_inicio`, `?data_fim`, `?funcionario_id`, `?base`, `?aeronave` |

---

## Achados ainda em aberto (não endereçados por este pacote)

| Seção | Achado | Motivo de não endereçar |
|---|---|---|
| RISCO 1 | `frms_score` legado sem rótulo qualificador em `ModalAdicionarTripulacao.tsx` e `PainelDisponibilidade.tsx` | Fora do escopo deste pacote — fase separada |
| RISCO 3 | Dois scores paralelos sem reconciliação (`frms_score` HV vs `nivel_fadiga` fisiológico) | Requer Opus + validação científica |
| 3.4 | `frms-read-ack.ts` não existe | Fase separada |
| 8 | KSS e horas de sono não chegam ao EVD | O EVD usa `/api/frms/daily-fatigue` que não retorna esses campos para o mode scope=team; fase separada |
| Item D (plano) | Tooltip KSS + sono no badge EVD | Não implementado neste pacote — fase separada |
| Item E (plano) | Filtros por nome/status no FrmsFadigaPainel | Não implementado neste pacote — fase separada |

---

## Mudanças de estado que não alteram as regras de operação

- **`BLOQUEADO_FRMS`**: não alterado — continua bloqueando alocação mensal por alertas CRITICO/VIOLACAO não resolvidos
- **`frms_score` legado (`Indicador FRMS legado`)**: label já renomeado em commits anteriores a este pacote (`880e039`) em `PainelDisponibilidade.tsx:149` e `ModalAdicionarTripulacao.tsx:1668`; número ainda é exibido — endereçamento de risco visual pendente
- **Sem novo threshold, sem mitigação automática, sem SGSO**: confirmado — este pacote é exclusivamente de visibilidade

---

*Nota docs-only. Nenhum código runtime, banco, worker ou deploy foi alterado por este arquivo.*
