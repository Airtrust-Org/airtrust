# FIXES-SAVING-AERONAVE-ESCALAS-20260309

Data: 09/03/2026  
Build: ✅ 0 erros  
Testes: ✅ 254 passou / 0 falhou

---

## Problema 1 — Salvamento lento nas Escalas

### Causa-raiz

**Backend — double-write sequencial:**  
`auditarTripulacao` e `auditarEvento` realizavam dois `await db.prepare(...).run()` em sequência. Cada `.run()` é uma chamada HTTP separada ao Cloudflare D1. Resultado: cada operação de POST/PUT/DELETE nas tripulações e eventos acrescentava 2 round-trips seriais ao D1.

**Frontend — `invalidateQueries` sequenciais:**  
`refreshEscalaData` em `useEscalasMutations.ts` executava 6 `await qc.invalidateQueries(...)` em sequência antes das refetch paralelas. Apesar de `invalidateQueries` ser principalmente síncrono (marca queries como stale), quando aguardado sequencialmente acumula microtasks desnecessárias e atrasa o início das refetches.

### Fixes aplicados

**`worker-airtrust/src/routes/escalas-tripulacoes.ts` — `auditarTripulacao`**  
Antes:

```ts
await db.prepare(`INSERT INTO escala_auditoria ...`).bind(...).run();
await db.prepare(`INSERT INTO auditoria_avancada_v2 ...`).bind(...).run();
```

Depois:

```ts
await Promise.all([
  db.prepare(`INSERT INTO escala_auditoria ...`).bind(...).run(),
  db.prepare(`INSERT INTO auditoria_avancada_v2 ...`).bind(...).run(),
]);
```

**Impacto:** As 2 queries ao D1 agora ocorrem em paralelo. Redução de ~50% no tempo de auditoria em POST/PUT/DELETE de tripulações (3 call sites).

**`worker-airtrust/src/routes/escalas-eventos.ts` — `auditarEvento`**  
Mesma transformação: double-write dentro do `try/catch` migrado para `Promise.all`.  
**Impacto:** Mesma redução em auditoria de eventos.

**`src/react-app/pages/escalas/hooks/queries/useEscalasMutations.ts` — `refreshEscalaData`**  
Antes:

```ts
await qc.invalidateQueries({ queryKey: escalasKeys.detail(escalaId) });
await qc.invalidateQueries({ queryKey: escalasKeys.calendarios(escalaId) });
await qc.invalidateQueries({ queryKey: escalasKeys.conflitos(escalaId) });
await qc.invalidateQueries({ queryKey: escalasKeys.alocacoes(escalaId) });
await qc.invalidateQueries({ queryKey: escalasKeys.cobertura(escalaId) });
await qc.invalidateQueries({ queryKey: escalasKeys.coberturaTripulantes(escalaId) });
await Promise.all([...refetchQueries...]);
```

Depois:

```ts
await Promise.all([
  qc.invalidateQueries({ queryKey: escalasKeys.detail(escalaId) }),
  qc.invalidateQueries({ queryKey: escalasKeys.calendarios(escalaId) }),
  qc.invalidateQueries({ queryKey: escalasKeys.conflitos(escalaId) }),
  qc.invalidateQueries({ queryKey: escalasKeys.alocacoes(escalaId) }),
  qc.invalidateQueries({ queryKey: escalasKeys.cobertura(escalaId) }),
  qc.invalidateQueries({ queryKey: escalasKeys.coberturaTripulantes(escalaId) }),
]);
await Promise.all([...refetchQueries...]);
```

**Impacto:** As 6 invalidações e as refetches iniciam imediatamente em paralelo, sem esperar cada `await` anterior completar.

---

## Problema 2 — Funcionário sem aeronave bloqueando alocação

### Causa-raiz

`getTripulantesOperacionaisPorModelo` em `worker-airtrust/src/shared/getTripulanteOperacional.ts` filtrava tripulantes com:

```sql
WHERE v.empresa_id = ?
  AND (
    EXISTS (SELECT 1 FROM funcionarios_aeronaves fa JOIN aeronaves a ... WHERE a.modelo IN aliases)
    OR UPPER(REPLACE(COALESCE(v.modelo_aeronave_id, ''), ' ', '')) IN (aliases)
    OR UPPER(REPLACE(COALESCE(v.aeronave_legacy, ''), ' ', '')) IN (aliases)
  )
```

Um funcionário com `modelo_aeronave_id = NULL`, sem `aeronave_legacy` e sem nenhuma linha em `funcionarios_aeronaves` **não satisfazia nenhuma condição** e era silenciosamente excluído. Ele nunca aparecia no modal de alocação.

A validação POST em `escalas-alocacoes.ts` (`verificarHabilitacaoModelo`) já estava correta — `if (!piloto.modelo_aeronave_id) return { habilitado: true }` — mas o funcionário nunca chegava ao modal para ser selecionado.

### Fix aplicado

**`worker-airtrust/src/shared/getTripulanteOperacional.ts`**

Adicionada 4ª condição OR ao WHERE:

```sql
OR (
  COALESCE(TRIM(v.modelo_aeronave_id), '') = ''
  AND COALESCE(TRIM(v.aeronave_legacy), '') = ''
  AND NOT EXISTS (
    SELECT 1 FROM funcionarios_aeronaves fa
    WHERE CAST(fa.funcionario_id AS TEXT) = CAST(v.funcionario_id AS TEXT)
      AND fa.deleted_at IS NULL
      AND COALESCE(fa.ativo, 1) = 1
  )
)
```

**Semântica:** "Incluir este funcionário se ele não tem nenhuma aeronave associada (null modelo, null legacy, nenhuma linha ativa em funcionarios_aeronaves) — ele pode voar em qualquer aeronave."

**Nenhum parâmetro adicional adicionado ao `.bind()`** — a cláusula é auto-contida.

**Impacto:** Funcionários sem aeronave definida agora aparecem no modal de alocação para qualquer modelo de aeronave e podem ser alocados normalmente.

---

## Arquivos modificados

| Arquivo                                                            | Tipo de fix                        |
| ------------------------------------------------------------------ | ---------------------------------- |
| `worker-airtrust/src/routes/escalas-tripulacoes.ts`                | Promise.all para auditoria         |
| `worker-airtrust/src/routes/escalas-eventos.ts`                    | Promise.all para auditoria         |
| `src/react-app/pages/escalas/hooks/queries/useEscalasMutations.ts` | Promise.all para invalidateQueries |
| `worker-airtrust/src/shared/getTripulanteOperacional.ts`           | OR clause sem-aeronave no SQL      |

## Validação

```
Build:  ✅ npm run build — ✓ built in 17.56s — 0 erros
Testes: ✅ 254 passed / 0 failed (17 test files)
```
