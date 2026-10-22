# Schema V2 0566 — Preservação imutável SCORM entre edições do MESMO ciclo

## Objetivo
Para CFIT 32/37, 37/37 e Código de Ética 2/61: abrir o pacote ATIVO,
preservando toda evidência histórica antes da primeira gravação.
Nenhuma conclusão/nota/certificado pode ser obtida pelo mapeamento da posição.

## Mudança
Nova tabela append-only `lms_scorm_edition_handoffs` com chave tenant,
matrícula, ciclo e SHA alvo, operação idempotente, actor e JSON do estado
anterior. Triggers verificam a matrícula/ciclo ativo e pacote ACTIVE no
catálogo; UPDATE e DELETE são proibidos. Apenas DDL na migration: zero
backfills, zero resets, zero D1/R2 remoto. Código Writer não é montado
em rota/feature flag; permanece inerte até staging/QA autorizado.

## Pré-condições, postchecks, recuperação
Preflight somente leitura: baseline Schema V2, tabela ausente, tabelas
lms_matriculas/lms_matricula_ciclos/lms_scorm_package_versions/
lms_progresso_scorm/lms_completion_diagnostics_snapshots presentes,
ledger limpo, SHA exato e recuperação D1/Time Travel. Apply exclusivamente
pelo workflow Schema V2 oficial após grants e autorizações apropriadas.
Postcheck: tabela, unique, índices e triggers presentes; zero registros
novos e contagem de matrículas/CMI inalterada. Recovery: desativar
feature e reverter código; nunca DROP ou apagar prova imutável.

## Contrato de execução (bloqueios para habilitação)
Transação D1.batch insere snapshot e somente então zera dados correntes
sob condição de operation_id, preservando ciclo. Proibição de uso externo
antes de: (a) teste SQLite de atomicidade/concor­rência, (b) handoff autenticado
admin/tenant/ciclo, (c) revogação/invalidade de sessão de assets do pacote
anterior e pin SHA no commit, (d) exclusão da evidência anterior de qualquer
gate de conclusão, (e) E2E Chromium/WebKit com ZIP F5 e pacote legado, e
(f) ativação governada com recovery. Qualificação anterior permanece intacta.
Uma segunda mudança de edição deve arquivar um novo evento, não sobrescrever
o primeiro. Nenhum reset improvisado de aluno real.
