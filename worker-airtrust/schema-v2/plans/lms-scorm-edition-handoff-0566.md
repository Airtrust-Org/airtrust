# Schema V2 0566 — Preservação imutável SCORM entre edições do MESMO ciclo

## Objetivo
Para CFIT 32/37, 37/37 e Código de Ética 2/61: abrir o pacote ATIVO,
preservando toda evidência histórica antes da primeira gravação.
Nenhuma conclusão/nota/certificado pode ser obtida pelo mapeamento da posição.

## Mudança
Nova tabela append-only `lms_scorm_edition_handoffs` com chave tenant,
matrícula, ciclo e SHA alvo, operação idempotente, actor e JSON do estado
anterior. O snapshot registra matrícula e ciclo anteriores, CMI completo,
diagnósticos, prefixo e SHA do pacote ativo no início do ciclo. Triggers
verificam a matrícula/ciclo ativo e pacote ACTIVE no
catálogo; UPDATE e DELETE são proibidos. Apenas DDL no change Schema V2,
sem espelho na cadeia regular `worker-airtrust/migrations`: zero backfills,
zero resets, zero D1/R2 remoto. O runtime possui rota administrativa e gates
de sessão, mas a feature flag `LMS_SCORM_EDITION_HANDOFF_ENABLED` fica
desligada por padrão. Nenhum ambiente deve ativá-la antes do apply governado e
da homologação de SHA exato.

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
sob condição de operation_id, preservando ciclo. A rota administrativa deriva
tenant, matrícula, ciclo, pacote ativo, SHA e plano do servidor. O launch recebe
somente um marcador de navegação validado, sem CMI, nota, unidades visitadas ou
conclusão da edição anterior. Após o recibo, novos tokens de asset ficam presos
ao ciclo/recibo atual e commits de sessões antigas são rejeitados.

Proibido habilitar externamente antes de: (a) teste SQLite de
atomicidade/concorrência, (b) teste autenticado de rota e sessão tenant/ciclo,
(c) E2E Chromium/WebKit com ZIP F5 e pacote legado, (d) validação de que o
marcador não altera progresso/evidência sem interação real, e (e) apply e
ativação governados com recovery. Qualificação anterior permanece intacta.
Uma segunda mudança de edição deve arquivar um novo evento, não sobrescrever
o primeiro. Nenhum reset improvisado de aluno real.
