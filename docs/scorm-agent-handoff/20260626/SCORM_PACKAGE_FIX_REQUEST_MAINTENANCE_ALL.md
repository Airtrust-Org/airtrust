# SCORM PACKAGE FIX REQUEST — MANUTENÇÃO (TODOS OS CURSOS)
## AirTrust LMS — 2026-06-26

Este documento cobre todos os cursos de Manutenção listados no incidente. Para AW139 há documento dedicado. Referência ao contrato técnico: `SCORM_PACKAGE_COMMUNICATION_CONTRACT.md`.

---

## 1. Cursos em escopo

| prioridade | curso | total_slides (fixture) | classificação atual |
|---|---|---|---|
| 1 | AW139 - Manutenção | 380 | `REAL_PACKAGE_EXPORT_REQUIRED` — ver doc dedicado |
| 2 | PT6C-67C / PT6 - Manutenção | 108 | `REAL_PACKAGE_EXPORT_REQUIRED` |
| 2 | MGM - Manual Geral de Manutenção | 98 | `REAL_PACKAGE_EXPORT_REQUIRED` |
| 2 | HUMS-VXP | 92 | `REAL_PACKAGE_EXPORT_REQUIRED` |
| 2 | SGSO para Manutenção | 64 | `REAL_PACKAGE_EXPORT_REQUIRED` |
| 2 | Treinamento técnico Integração Manutenção | 52 | `REAL_PACKAGE_EXPORT_REQUIRED` |
| 2 | Inspeção IIO & APRS | 80 | `REAL_PACKAGE_EXPORT_REQUIRED` |
| 3 | MCQ - Manual de Controle de Qualidade | 84 | `REAL_PACKAGE_EXPORT_REQUIRED` |
| 3 | MOM - Manual da Organização de Manutenção | 76 | `REAL_PACKAGE_EXPORT_REQUIRED` |
| 3 | HUMS | 88 | `REAL_PACKAGE_EXPORT_REQUIRED` |
| 3 | Heliwise | 45 | `REAL_PACKAGE_EXPORT_REQUIRED` |

Nota: `total_slides` são valores das fixtures de teste local. Podem diferir do pacote real. Confirmar após exportação do R2.

---

## 2. Problemas comuns a todos os cursos

Os sintomas abaixo foram observados operacionalmente para múltiplos cursos:

### 2.1 Progresso travado ou inconsistente

- **Sintoma**: aluno avança, fecha o curso, reabre e o progresso visual não corresponde à posição real
- **Causa**: `lesson_location` não no formato `{n}/{total}` esperado pelo worker, ou não gravado a cada slide
- **Exigência**: `LMSSetValue("cmi.core.lesson_location", "{n}/{total}")` em cada transição de slide

### 2.2 Retomada falha (volta ao início)

- **Sintoma**: aluno fecha o curso e ao reabrir começa do slide 1
- **Causa**: `suspend_data` não gravado, ou `LMSFinish` não chamado, ou pacote não lê `suspend_data` no `LMSInitialize`
- **Exigência**: gravar `suspend_data` em cada commit; ler no initialize; chamar `LMSFinish` antes de fechar

### 2.3 Conclusão não registrada

- **Sintoma**: aluno completou o curso mas status não mudou para CONCLUIDO no LMS
- **Causa**: `lesson_status = passed/completed` não gravado no slide final, ou gravado mas sem `LMSCommit` + `LMSFinish` depois
- **Exigência**: sequência obrigatória no slide final: `SetValue(lesson_status, passed)` → `Commit` → `Finish`

---

## 3. Matriz de exigências por curso

Para cada curso abaixo, o agente SCORM DEVE:

### PT6C-67C / PT6 - Manutenção (108 slides)

| campo | padrão |
|---|---|
| `lesson_location` | `"{n}/108"` |
| `suspend_data` | JSON com posição + progresso por módulo |
| Aluno afetado | Bruno Justino (até módulo 2 = ~18/108) |
| Caso | `RESTORE_PROGRESS_ONLY` após auditoria do pacote |

### MGM - Manual Geral de Manutenção (98 slides)

| campo | padrão |
|---|---|
| `lesson_location` | `"{n}/98"` |
| `suspend_data` | JSON com posição + progresso |
| Aluno afetado | Bruno Justino (relatou conclusão) |
| Caso | `MANUAL_COMPLETION_REQUIRES_APPROVAL` |

### HUMS-VXP (92 slides)

| campo | padrão |
|---|---|
| `lesson_location` | `"{n}/92"` |
| `suspend_data` | JSON com posição + progresso |
| Aluno afetado | Bruno Justino (relatou conclusão) |
| Caso | `MANUAL_COMPLETION_REQUIRES_APPROVAL` |

### SGSO para Manutenção (64 slides)

| campo | padrão |
|---|---|
| `lesson_location` | `"{n}/64"` |
| `suspend_data` | JSON com posição + progresso |
| Aluno afetado | Bruno Justino (relatou conclusão) |
| Caso | `MANUAL_COMPLETION_REQUIRES_APPROVAL` |

### Treinamento técnico Integração Manutenção (52 slides)

| campo | padrão |
|---|---|
| `lesson_location` | `"{n}/52"` |
| `suspend_data` | JSON com posição + progresso |
| Aluno afetado | Bruno Justino (relatou conclusão) |
| Caso | `MANUAL_COMPLETION_REQUIRES_APPROVAL` |

### Inspeção IIO & APRS (80 slides)

| campo | padrão |
|---|---|
| `lesson_location` | `"{n}/80"` |
| `suspend_data` | JSON com posição + progresso |
| Aluno afetado | Francisco Altermir (relatou conclusão) |
| Caso | `MANUAL_COMPLETION_REQUIRES_APPROVAL` |

### MCQ - Manual de Controle de Qualidade (84 slides)

| campo | padrão |
|---|---|
| `lesson_location` | `"{n}/84"` |
| `suspend_data` | JSON com posição + progresso |
| Aluno afetado | sem caso reportado neste momento |

### MOM - Manual da Organização de Manutenção (76 slides)

| campo | padrão |
|---|---|
| `lesson_location` | `"{n}/76"` |
| `suspend_data` | JSON com posição + progresso |
| Aluno afetado | sem caso reportado neste momento |

### HUMS (88 slides)

| campo | padrão |
|---|---|
| `lesson_location` | `"{n}/88"` |
| `suspend_data` | JSON com posição + progresso |
| Aluno afetado | sem caso reportado neste momento |

### Heliwise (45 slides)

| campo | padrão |
|---|---|
| `lesson_location` | `"{n}/45"` |
| `suspend_data` | JSON com posição + progresso |
| Aluno afetado | verificar se ativo |

---

## 4. Checklist de auditoria por pacote

Para cada pacote exportado do R2, executar:

```
[ ] imsmanifest.xml presente na raiz do zip
[ ] launch file listado no imsmanifest.xml e presente no zip
[ ] LMSInitialize("") no código JavaScript
[ ] LMSSetValue("cmi.core.lesson_location", ...) no código
[ ] LMSSetValue("cmi.suspend_data", ...) no código
[ ] LMSSetValue("cmi.core.lesson_status", ...) no código
[ ] LMSCommit("") no código
[ ] LMSFinish("") no código
[ ] alert() ausente
[ ] suspend_data lido no LMSInitialize
[ ] lesson_location no formato {n}/{total}
[ ] lesson_status = "passed"/"completed" apenas no slide final
[ ] Nenhum slide em branco
[ ] Nenhum asset 404
[ ] Teste de retomada OK
[ ] Teste de conclusão OK
```

Preencher e incluir no relatório de entrega.

---

## 5. Packages locais disponíveis no workspace (não são Manutenção)

Para referência, os pacotes disponíveis localmente em `Arquivos - EAD/` NÃO são cursos de Manutenção:

| pacote local | classificação | observação |
|---|---|---|
| CGA - Conhecimentos Gerais de Aeronaves | `PACKAGE_REPACKAGING_REQUIRED` | `alert()` presente; sem `lesson_location`/`suspend_data` |
| Emergências Gerais | `PACKAGE_REPACKAGING_REQUIRED` | Idem |
| Operações Offshore | `PACKAGE_REPACKAGING_REQUIRED` | Idem |
| Operações PBN | `PACKAGE_REPACKAGING_REQUIRED` | Idem |

Esses pacotes locais exigem reempacotamento independente. Não são bloqueadores para os cursos de Manutenção, mas seguem o mesmo contrato técnico.

---

## 6. Ordem de prioridade de entrega

1. **AW139 - Manutenção** — urgente (3 alunos afetados, maior curso)
2. **PT6C-67C** — urgente (Bruno Justino, módulo 2)
3. **MGM, HUMS-VXP, SGSO, Integração, IIO & APRS** — alta prioridade
4. **MCQ, MOM, HUMS, Heliwise** — prioridade normal

---

## 7. Entregável esperado por curso

Para cada curso:

1. `{slug}-v{versao}.zip` — pacote corrigido
2. `{slug}-v{versao}-test-report.md` — relatório de teste cobrindo checklist do item 4
3. SHA256 do `.zip`
4. Arquivo `checksums.txt` consolidado com todos os pacotes

Entregar em: `tmp/scorm-packages-audit/20260626/`

---

## 8. Bloqueios atuais

Todos os pacotes de Manutenção estão bloqueados em:

```
REAL_PACKAGE_EXPORT_REQUIRED
```

O agente SCORM não pode auditar nem corrigir sem receber os `.zip` exportados do R2.

Passo necessário antes de qualquer trabalho do agente SCORM:

1. Exportar cada pacote do R2 para `tmp/scorm-packages-audit/20260626/{slug}/`
2. Entregar os arquivos ao agente SCORM com este documento como briefing
3. O agente devolve os pacotes corrigidos nos entregáveis listados acima
4. Revisão humana do relatório de teste antes de qualquer publicação em produção
