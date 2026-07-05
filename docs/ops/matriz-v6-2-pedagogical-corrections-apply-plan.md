# Matriz V6.2 — Plano de Apply Controlado (Correções Pedagógicas)

> **Status**: Pronto para autorização. Produção NÃO aplicada.
> **SHA aprovado**: `a315e46aaf7f486bf574422b17b5171e1370fd54`
> **PR**: [#261](https://github.com/airtrustsystem-alt/airtrust/pull/261)
> **Data**: 2026-07-05

---

## 1. SHA aprovado

`a315e46aaf7f486bf574422b17b5171e1370fd54`

Este SHA incorpora:
- PR #261 merge commit (`efd13f6c`) — correções pedagógicas da Matriz V6.2
- Follow-up commit (`a315e46a`) — classificação explícita de `OPS-NOT-X1` e `INV-ETH-01` em `inferCategoria()`

## 2. Escopo permitido

| Tabela | Operações |
|---|---|
| `modelos_sessao` | INSERT/UPDATE |
| `modelos_sessao_manobras` | INSERT/UPDATE |
| `manobras` | INSERT/UPDATE |

## 3. Escopo proibido

- `fichas_sessao`
- `fichas_sessao_manobras`
- `simulador_agendamentos`
- `fichas_manobras_historico`
- Tabelas de avaliação
- `usuarios`, auth, RBAC
- LMS
- Qualificações

## 4. Mudanças esperadas

- **51 modelos** de sessão
- **918 técnicas** (18 por modelo)
- **15 NOTECHS** (fora das 18 técnicas)
- **6 ciclos IFR** renomeados para `IFR-emergências`
- **Novos códigos** no catálogo:
  - `OPS-NOT-X1` — Ilusão visual noturna / black hole effect (EMERGENCIA)
  - `A139-AUT-03` — Autorrotação noturna dedicada AW139 (EMERGENCIA)
  - `INV-ETH-01` — Postura ética e responsabilidade do instrutor (TREINAMENTO)
- **Distribuição**:
  - `OPS-NOT-X1` em 6 sessões: A139-NOT-01, A139-NOT-02, A139-S-01/02, S76-NOT-01, S76-NOT-02, SK76-S-01/02
  - `A139-AUT-03` em 2 sessões: A139-NOT-01, A139-S-01/02
  - `INV-ETH-01` em 1 sessão: TRE-INST
- **Preservações**:
  - `CRED-EXA` com 18 técnicas e rastreabilidade documental
  - Zero NOTECHS/INV-CRM/EXA-NTS dentro das técnicas
  - Tabelas históricas intocadas

## 5. Backup obrigatório pré-apply

Exportar antes de qualquer escrita:
- `modelos_sessao`
- `modelos_sessao_manobras`
- `manobras`
- `fichas_sessao`
- `fichas_sessao_manobras`
- `simulador_agendamentos`
- `fichas_manobras_historico`

## 6. Checks pré-apply

- [x] `origin/main` no SHA `a315e46aaf7f486bf574422b17b5171e1370fd54`
- [ ] Produção atual confirmada (contagens pré-apply)
- [ ] Backup completo realizado
- [x] Dry-run local: READY_FOR_REVIEW, 51/918/15, validation_issues: []
- [x] SQL gerado do script versionado (`generated_apply.sql`, 3341 linhas)
- [x] SQL sem `DELETE FROM`
- [x] SQL sem escrita em tabelas proibidas
- [ ] Autorização explícita do owner

## 7. Apply

Usar exclusivamente o script versionado:
```bash
node scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs --empresa-id <TARGET>
```

**Não improvisar SQL manual.**

## 8. Pós-apply

Validar com `POST_APPLY_VALIDATION.sql`:
- 51 modelos
- 918 técnicas
- 18 técnicas por modelo
- 15 NOTECHS
- Zero NOTECHS/INV-CRM/EXA-NTS nas técnicas
- `OPS-NOT-X1` nas 6 sessões
- `A139-AUT-03` nas 2 sessões
- `INV-ETH-01` em TRE-INST
- Ciclos IFR renomeados
- Tabelas históricas preservadas

## 9. Rollback

Restaurar `modelos_sessao`, `modelos_sessao_manobras`, `manobras` a partir do backup.
Validar com as mesmas queries. Não tocar fichas/histórico.

## 10. GO/NO-GO

| Condição | Estado |
|---|---|
| SHA confirmado | ✅ |
| Dry-run aprovado | ✅ |
| SQL revisado | ✅ |
| Backup pronto | ⬜ Pendente |
| Autorização owner | ⬜ **AGUARDANDO** |
| **Apply produção** | 🛑 **NO-GO até autorização** |

---

**Pacote de apply**: `artifacts/apply-plans/matriz-v6-2-pedagogical-corrections-20260705T184704Z-a315e46a/`
