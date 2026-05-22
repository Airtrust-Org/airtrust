# AIRTRUST v0.4-G15 — Disponibilidade EVD: Hard Block vs Soft Conflict + FRMS Explicativo

Data: 2026-05-22
Base: G13 commit `47707aa`
Escopo: `EvdPage.tsx`, `escalas-evd.ts`, `escalas-tripulantes-operacionais.ts`, `diagnose-evd-availability-frms.sh`

## 1) Problemas reportados

| # | Sintoma | Causa raiz |
|---|---|---|
| P0 | Alerta falso de ferias | POST `/api/evd` consultava `funcionario_ferias` sem `escala_alocacao_id IS NULL` |
| P1 | Escala mensal bloqueava duro a EDV | Conflitos de escala mensal retornavam `blocked: true` (hard error 400) |
| P2 | Justificativa FRMS sem identificar quem/por que | Mensagem generica sem nome do tripulante ou status FRMS |

## 2) Taxonomia: Hard Block vs Soft Conflict

### A) BLOQUEIO DURO REAL (impede salvar)
| Origem | Exemplo |
|---|---|
| `funcionario_ferias` com `escala_alocacao_id IS NULL` | Ferias lancadas no RH por gestor |
| CMA vencido / BLOQUEADO_CMA | Certificado de aptidao fisica |
| BLOQUEADO_FRMS | Alerta critico ou violacao FRMS ativo |
| Habilitacao modelo invalida | Tripulante sem hab. para AW139/SK76 |
| PIC = SIC | Mesmo tripulante em ambos os assentos |
| Aeronave inativa/manutencao | Status da aeronave != ATIVO |
| Duplicata EVD no mesmo intervalo | Tripulante ja alocado em outra EVD do dia |

### B) CONFLITO SUAVE / DIVERGENCIA MENSAL (permite salvar com aviso)
| Origem | Codigo | Descricao |
|---|---|---|
| Alocacao operacional em outra escala | `MONTHLY_AIRCRAFT_DIFFERENCE` | Tripulante alocado em aeronave X na escala, EVD usou aeronave Y |
| Situacao bloqueante em outra escala | `MONTHLY_SITUATION_CONFLICT` | Tripulante com SIMULADOR/MED em escala diferente da EVD |

Esses casos:
- Aparecem no dropdown com `[!] Conflito escala` no nome
- Salvam com sucesso, retornando `warnings` na resposta
- Geram aviso visual no formulario antes de salvar
- Nao impedem a designacao; a correcao na escala mensal e posterior

### C) NAO BLOQUEIA
| Origem | Decisao |
|---|---|
| Ferias geradas pela propria escala (`escala_alocacao_id IS NOT NULL`) | Ja tratado como situacao da escala; GET exclui com `IS NULL` |
| Situacao FOLGA | Sempre liberado |
| Mesmo escala (`mesmoEscalaAtual`) | Ja liberado desde G11 |
| Sem `escala_id` + alocacao operacional | Sem contexto para afirmar conflito |

## 3) Causa raiz do alerta falso de ferias (P0)

### Discrepancia GET vs POST (pre-G15)

| Endpoint | Query ferias | Comportamento |
|---|---|---|
| GET `/tripulantes-operacionais` | `AND ff.escala_alocacao_id IS NULL` | Excluia ferias da escala — correto |
| POST `/api/evd` | sem filtro `escala_alocacao_id` | Incluia ferias da escala — ERRADO |

Quando uma situacao FERIAS e adicionada a escala mensal via `escalas-alocacoes-helpers-internal.ts`:
1. Cria registro em `escala_alocacoes` (situacao_tipo = 'FERIAS', escala_id = X)
2. Cria registro em `funcionario_ferias` com `escala_alocacao_id = <id da alocacao>`

O GET excluia esse registro (IS NULL filter), mas o POST o encontrava e bloqueava com "em afastamento/ferias".

### Correcao
Adicionado `AND escala_alocacao_id IS NULL` na query de ferias do POST:
- Ferias lancadas pelo RH (escala_alocacao_id = NULL) → continuam bloqueando (correto)
- Ferias da escala (escala_alocacao_id != NULL) → ignoradas pelo POST (ja tratadas como situacao da escala)

## 4) Alteracoes por arquivo

### 4.1 `worker-airtrust/src/routes/escalas-evd.ts`

**`MonthlyAvailabilityResult` — novo campo:**
```ts
type MonthlyAvailabilityResult = {
  blocked: boolean;       // Hard block: ferias RH real
  soft_conflict?: boolean; // Soft conflict: divergencia escala mensal
  message?: string;
  conflict_code?: 'FERIAS_RH' | 'OTHER_ESCALA_OPERATIONAL' | 'OTHER_ESCALA_SITUACAO';
};
```

**Query ferias — fix:**
```sql
AND escala_alocacao_id IS NULL  -- NOVO: excluir ferias geradas pela propria escala
```

**Conflitos de escala mensal — de hard para soft:**
```ts
// Antes
return { blocked: true, message: MSG_OTHER_ESCALA_BLOCK };

// Depois
return { blocked: false, soft_conflict: true, message: MSG_OTHER_ESCALA_BLOCK,
         conflict_code: 'OTHER_ESCALA_OPERATIONAL' };
```

**`collectOperationalWarningsAndBlocks` — handle soft_conflict:**
```ts
if (availability.soft_conflict && availability.message) {
  warnings.push(`Conflito escala mensal: ${availability.message}`);
  requiresOperationalJustification = true;
}
```

### 4.2 `worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts`

**`TripulanteComQuinzena` — novos campos:**
```ts
soft_conflict?: boolean;
conflict_reason?: string | null;
conflict_code?: string | null;
```

**Map de conflitos — separacao hard block vs soft conflict:**
```ts
// Ferias RH: hard block (pode_ser_alocado: false)
if (conflito.origem === 'funcionario_ferias') {
  return { ...tripulante, pode_ser_alocado: false, motivo_bloqueio: ... };
}
// Escala mensal diferente: soft conflict (pode_ser_alocado: true, selecionavel com aviso)
return { ...tripulante, pode_ser_alocado: true, soft_conflict: true,
         conflict_reason: ..., conflict_code: ... };
```

### 4.3 `src/react-app/pages/escalas/EvdPage.tsx`

**Interface `TripulanteOperacionalItem` — novos campos:**
- `soft_conflict?: boolean`
- `conflict_reason?: string | null`
- `conflict_code?: string | null`

**Dropdown PIC/SIC — indicador de conflito:**
```tsx
const conflictNote = p.soft_conflict ? ' [!] Conflito escala' : '';
<option>... — {frms}{conflictNote}</option>
```

**Aviso de conflito mensal acima do form:**
```tsx
{(picSelecionado?.soft_conflict || sicSelecionado?.soft_conflict) && (
  <div>Conflito com escala mensal: ... A designacao sera salva com aviso.</div>
)}
```

**Justificativa FRMS — label e motivos explicitados:**
```tsx
// Antes
"Justificativa operacional FRMS (estruturada)"

// Depois
"Justificativa operacional FRMS (obrigatoria)"
+ lista: "• PIC [Nome]: [Status FRMS]"
        "• SIC [Nome]: [Status FRMS]"
```

**Mensagem de erro FRMS na validacao pre-submit:**
```ts
// Antes
'FRMS requer revisao operacional para PIC/SIC selecionado. Informe justificativa operacional...'

// Depois
'Justificativa operacional obrigatoria (min. 10 caracteres). Motivos: PIC [Nome]: [Status]; SIC [Nome]: [Status].'
```

### 4.4 `scripts/diagnose-evd-availability-frms.sh`

Novo resumo distinguindo:
- `tripulantes_aptos_sem_conflito` — elegiveis limpos
- `tripulantes_conflito_mensal` — elegiveis com soft conflict (selecionaveis com aviso)
- `tripulantes_bloqueados_duros` — ferias RH, CMA, hab. modelo
- `motivos_bloqueio_duro` — agrupados por texto
- `conflitos_escala_mensal_por_motivo` — agrupados por conflict_reason

## 5) Cenarios de teste

| Cenario | Comportamento esperado apos G15 |
|---|---|
| Tripulante na escala mensal correta | APTO, sem aviso |
| Tripulante em outra aeronave na escala mensal | Selecionavel com `[!] Conflito escala`, salva com warning |
| Tripulante em situacao bloqueante em outra escala | Selecionavel com `[!] Conflito escala`, salva com warning |
| Tripulante em ferias lancadas pelo RH | Hard block, nao aparece no dropdown |
| Tripulante em ferias da propria escala mensal | Liberado (ferias da escala: `escala_alocacao_id IS NOT NULL`) |
| PIC sem check-in FRMS (not_submitted) | `SC` + justificativa com nome: `PIC [Nome]: Sem check-in` |
| PIC sem jornada (no_duty) | `—` / "Sem jornada", sem bloqueio |
| SIC com FRMS attention | `ATN` + justificativa com `SIC [Nome]: Atencao` |
| Ambos PIC e SIC com FRMS relevante | Justificativa mostra motivos de ambos |

## 6) Limitacoes

- Sem migration nesta fase; nenhuma alteracao de schema.
- `funcionario_ferias` nao tem `empresa_id` — IDs de funcionarios sao unicos globalmente no D1.
- Conflitos de soft_conflict nao sao persistidos como registro estruturado (sem migration). O warning e retornado na resposta e pode ser registrado manualmente em `observacoes`.
- Se houver multiplos conflitos de escala para o mesmo tripulante, o Map last-write-wins pode mostrar apenas o ultimo. Sem impacto critico — todos sao soft conflicts.

## 7) Validacoes executadas

```
npm run build          ✓
tsc --noEmit           ✓ (frontend)
tsc -p worker-airtrust/tsconfig.json --noEmit  ✓ (backend)
bash -n diagnose-evd-availability-frms.sh      ✓
bash -n test-evd-functional.sh                 ✓
```

## 8) Proximo passo recomendado

- Deploy frontend Pages + Worker para producao (apos aprovacao do usuario).
- Verificar em producao se o alerta falso de ferias desapareceu.
- Considerar persistencia estruturada de conflitos mensais (nova tabela `evd_conflitos_mensais`) em fase futura, se necessario auditoria.
