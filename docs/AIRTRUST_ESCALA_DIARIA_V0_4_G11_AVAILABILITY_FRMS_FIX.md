# AIRTRUST v0.4-G11 — Correção de Disponibilidade EVD e Granularidade FRMS

Data: 2026-05-22  
Base: G10 audit commit `441c35fd`  
Escopo: `EvdPage.tsx`, `scripts/diagnose-evd-availability-frms.sh`

## 1) Problema corrigido

### P0 — Bloqueio indevido por ausência de `escala_id`
A EVD chamava `/api/escalas/tripulantes-operacionais` sem `escala_id`.
No backend, a lógica `mesmoEscalaAtual` (`conflito.escala_id === escalaId`) nunca era satisfeita (escalaId = undefined), convertendo toda alocação mensal base em bloqueio com motivo `Alocado em <prefixo> Q<N>`.

### P1 — FRMS indisponível por falha de qualquer endpoint
`frmsUnavailable = Boolean(frmsDailyError || frmsAlertsError)` — qualquer erro (incluindo falha menor do endpoint de alertas) derrubava o status de todos os tripulantes para "FRMS indisponível".

### P1b — `no_duty` não mapeado
Status `no_duty` do backend caia no default `OK`/`FRMS OK` na UI, mascarando tripulantes sem jornada.

## 2) Fonte do `escala_id`

A EVD deriva `escala_id` carregando `/api/escalas?mes=M&ano=Y` para a data selecionada.

Seleção por prioridade de status:
1. `publicada` (escala aprovada e publicada)
2. `aprovada`
3. `rascunho` (qualquer escala ativa do mês)
4. primeira da lista se nenhuma das acima

Se não houver escala para o mês: `escalaId = null` → aviso visual no formulário.

### Cenários de `escala_id`

| Situação | Resultado |
|---|---|
| Escala publicada do mês encontrada | `escala_id` enviado; alocações da mesma escala não bloqueiam |
| Só rascunho disponível | `escala_id` enviado; comportamento igual |
| Nenhuma escala no mês | `escala_id` omitido; aviso "Escala mensal não identificada..." exibido |
| Múltiplas escalas no mês | Usa prioridade `publicada > aprovada > rascunho > primeira` |

## 3) Alteração frontend (`EvdPage.tsx`)

### 3.1 Nova interface
```ts
interface EscalaMensal {
  id: string;
  mes: number;
  ano: number;
  status: string;
}
```

### 3.2 Carregamento da escala mensal
```tsx
const { data: escalasDoMesRaw } = useApi<EscalaMensal[]>(
  `/api/escalas?mes=${escalaMes}&ano=${escalaAno}`,
);
const escalaAtiva = useMemo(() => { /* prioridade publicada > aprovada > rascunho */ }, [escalasDoMesRaw]);
```

### 3.3 Inclusão do `escala_id` na URL
```tsx
const tripulantesUrl = aeronaveSelecionada
  ? `/api/escalas/tripulantes-operacionais?...${escalaId ? `&escala_id=${encodeURIComponent(escalaId)}` : ''}`
  : '';
```

### 3.4 Aviso quando escala não encontrada
Exibido dentro do formulário `EvdCreateForm` quando `!escalaId`:
> "Escala mensal não identificada para esta data; disponibilidade pode ficar restritiva."

### 3.5 Prop nova em `EvdCreateForm`
```tsx
escalaId: string | null;
```
Passada do componente pai: `escalaId={escalaAtiva?.id ?? null}`.

## 4) Alteração backend

**Nenhuma.** O backend (`escalas-tripulantes-operacionais.ts:323`) já implementa corretamente:
```ts
const mesmoEscalaAtual = escalaId && conflito.escala_id === escalaId;
if (mesmoEscalaAtual) { return { ...tripulante, pode_ser_alocado: true, ... }; }
```
A correção era exclusivamente frontend (enviar o parâmetro que estava faltando).

## 5) Tratamento FRMS granular

### Antes
```ts
const frmsUnavailable = Boolean(frmsDailyError || frmsAlertsError);
```
Qualquer falha derrubava todos os status.

### Depois
```ts
const frmsDailyUnavailable = Boolean(frmsDailyError);
const frmsAlertsUnavailable = Boolean(frmsAlertsError) && !frmsDailyError;
const frmsUnavailable = frmsDailyUnavailable;  // alias para compatibilidade
```

Consequências:
- `daily-fatigue` falha → banner âmbar "FRMS indisponível", coluna mostra `?`
- `alerts` falha isoladamente → nota discreta "Alertas FRMS indisponíveis; status diário carregado."
- Tabela de voos existentes usa `frmsDailyUnavailable` (não mais `frmsUnavailable`)

## 6) Mapeamento FRMS → EVD

| Status FRMS | Curto | Longo | Ação EVD |
|---|---|---|---|
| `normal` | `OK` | FRMS OK | sem ação |
| `attention` | `ATN` | Atenção | justificativa recomendada |
| `critical` | `REV` | Revisão operacional | justificativa obrigatória |
| `unfit_for_duty` | `REV` | Revisão operacional | bloqueio + justificativa |
| `not_submitted` | `SC` | Sem check-in | alerta + revisão |
| `no_duty` | `—` | Sem jornada | sem bloqueio EVD |
| sem signal (null) | `SC` | Sem check-in | alerta |
| erro técnico daily | `?` | Indisponível | banner âmbar |

Privacidade: KSS, horas de sono, sintomas, medicação, álcool e observações pessoais **não** são expostos na EVD.

## 7) Testes

### Testes de build/typecheck
```bash
npm run build
npx tsc --noEmit
npx tsc -p worker-airtrust/tsconfig.json --noEmit
bash -n scripts/diagnose-evd-availability-frms.sh
```

### Testes funcionais manuais projetados

| Cenário | Esperado após G11 |
|---|---|
| Tripulante alocado na escala mensal do mês | Aparece como APTO (não mais bloqueado por `mesmoEscalaAtual`) |
| Tripulante em férias/simulador | Permanece bloqueado (origem diferente) |
| Tripulante alocado em outra escala | Permanece bloqueado |
| `daily-fatigue` retorna `not_submitted` | Exibe `SC`, não "FRMS indisponível" |
| `daily-fatigue` retorna `no_duty` | Exibe `—` / "Sem jornada" |
| `alerts` endpoint falha, `daily-fatigue` OK | Nota discreta, status diário visível |
| `daily-fatigue` falha | Banner âmbar, coluna `?` |
| Sem escala mensal no mês | Aviso inline no formulário |

### Teste real com TOKEN
```bash
TOKEN=<jwt> DATE=2026-05-21 ESCALA_ID=<id> API_BASE=https://api.airtrust.online \
  bash scripts/diagnose-evd-availability-frms.sh
```
Status: **pendente** (TOKEN não disponível no ambiente de desenvolvimento).

## 8) Limitações

- A seleção de `escalaAtiva` usa prioridade de status; se houver múltiplas escalas `publicada` para o mesmo mês (caso incomum), usa a primeira da lista retornada pela API (ordenada `ano DESC, mes DESC`).
- Se a escala mensal não tiver alocações, `escala_id` é enviado mas `mesmoEscalaAtual` nunca é verdadeiro — sem efeito negativo.
- A correção não altera o cálculo FRMS, o schema do banco, ou qualquer cron/SIGVOOS.
- Nenhuma migration foi aplicada.
