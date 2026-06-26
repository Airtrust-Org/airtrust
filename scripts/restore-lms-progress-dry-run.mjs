/**
 * restore-lms-progress-dry-run.mjs
 *
 * Ferramenta de recuperação auditável de progresso LMS — DRY-RUN APENAS.
 *
 * Este script:
 *   - Lê os casos dos alunos afetados definidos neste arquivo
 *   - Classifica cada caso (RESTORE_PROGRESS_ONLY / MANUAL_COMPLETION_REQUIRES_APPROVAL / etc.)
 *   - Produz um plano de restauração em JSON sem escrever nada
 *   - Gera as queries SQL de aplicação para revisão humana
 *
 * NÃO executa nenhuma escrita.
 * Para aplicar: revisar o output, obter aprovação, e executar as queries
 * manualmente com o gestor responsável.
 *
 * Uso:
 *   node scripts/restore-lms-progress-dry-run.mjs
 *   node scripts/restore-lms-progress-dry-run.mjs --json  (output JSON puro)
 *
 * Mecanismo de auditoria:
 *   A tabela audit_logs (migration 0332) é usada para rastrear operações reais.
 *   Não é necessária migration nova — os campos detalhes (JSON) suportam
 *   motivo, evidencia, operador e dry_run.
 */

const DRY_RUN_VERSION = '20260626-001';
const GENERATED_AT = new Date().toISOString();

// ── Definições de classificação ──────────────────────────────────────────────

const CLASSIFICATION = {
  RESTORE_PROGRESS_ONLY: 'RESTORE_PROGRESS_ONLY',
  MANUAL_COMPLETION_REQUIRES_APPROVAL: 'MANUAL_COMPLETION_REQUIRES_APPROVAL',
  NEEDS_MORE_EVIDENCE: 'NEEDS_MORE_EVIDENCE',
  NO_EVIDENCE_AVAILABLE: 'NO_EVIDENCE_AVAILABLE',
};

// ── Casos de alunos afetados ─────────────────────────────────────────────────
// Baseado nos relatos operacionais do incidente.
// NOTA: matricula_id, funcionario_id e curso_id são placeholders.
// O administrador deve preencher com os IDs reais antes de executar as queries.

const AFFECTED_CASES = [
  // ─────────────────────────────────────────────────────────────────────────
  // Bruno Justino
  // ─────────────────────────────────────────────────────────────────────────
  {
    aluno: 'Bruno Justino',
    curso: 'AW139 - Manutenção',
    classification: CLASSIFICATION.RESTORE_PROGRESS_ONLY,
    relato: 'Aluno chegou até o módulo 4',
    targetLessonLocation: '40/380',      // estimativa: módulo 4 ≈ 40/380 (confirmar com pacote real)
    targetProgressPct: 11,               // round(40/380*100) = 11%
    targetStatus: 'EM_ANDAMENTO',
    targetLessonStatus: 'incomplete',
    gerarQualificacao: false,
    evidencia: 'Relato verbal confirmado pelo gestor (ref: incidente 2026-06-25)',
    observacoes: 'RESTORE_PROGRESS_ONLY — não concluir, não gerar qualificação',
    matriculaId: null,                   // PREENCHER: id em lms_matriculas
    funcionarioId: null,                 // PREENCHER: id em funcionarios
    cursoId: null,                       // PREENCHER: id em lms_cursos
    empresaId: null,                     // PREENCHER: empresa_id
  },
  {
    aluno: 'Bruno Justino',
    curso: 'PT6C-67C / PT6 - Manutenção',
    classification: CLASSIFICATION.RESTORE_PROGRESS_ONLY,
    relato: 'Aluno chegou até o módulo 2',
    targetLessonLocation: '18/108',      // estimativa: módulo 2 ≈ 18/108 (confirmar com pacote real)
    targetProgressPct: 17,               // round(18/108*100) = 17%
    targetStatus: 'EM_ANDAMENTO',
    targetLessonStatus: 'incomplete',
    gerarQualificacao: false,
    evidencia: 'Relato verbal confirmado pelo gestor (ref: incidente 2026-06-25)',
    observacoes: 'RESTORE_PROGRESS_ONLY — não concluir, não gerar qualificação',
    matriculaId: null,
    funcionarioId: null,
    cursoId: null,
    empresaId: null,
  },
  {
    aluno: 'Bruno Justino',
    curso: 'HUMS-VXP',
    classification: CLASSIFICATION.MANUAL_COMPLETION_REQUIRES_APPROVAL,
    relato: 'Aluno relatou que concluiu o curso',
    targetLessonLocation: '92/92',
    targetProgressPct: 100,
    targetStatus: 'CONCLUIDO',
    targetLessonStatus: 'passed',
    gerarQualificacao: true,
    evidencia: 'PENDENTE — exige aprovação formal do gestor + evidência documentada',
    observacoes: 'MANUAL_COMPLETION_REQUIRES_APPROVAL — não agir sem aprovação formal',
    matriculaId: null,
    funcionarioId: null,
    cursoId: null,
    empresaId: null,
  },
  {
    aluno: 'Bruno Justino',
    curso: 'MGM - Manual Geral de Manutenção',
    classification: CLASSIFICATION.MANUAL_COMPLETION_REQUIRES_APPROVAL,
    relato: 'Aluno relatou que concluiu o curso',
    targetLessonLocation: '98/98',
    targetProgressPct: 100,
    targetStatus: 'CONCLUIDO',
    targetLessonStatus: 'passed',
    gerarQualificacao: true,
    evidencia: 'PENDENTE — exige aprovação formal do gestor + evidência documentada',
    observacoes: 'MANUAL_COMPLETION_REQUIRES_APPROVAL — não agir sem aprovação formal',
    matriculaId: null,
    funcionarioId: null,
    cursoId: null,
    empresaId: null,
  },
  {
    aluno: 'Bruno Justino',
    curso: 'SGSO para Manutenção',
    classification: CLASSIFICATION.MANUAL_COMPLETION_REQUIRES_APPROVAL,
    relato: 'Aluno relatou que concluiu o curso',
    targetLessonLocation: '64/64',
    targetProgressPct: 100,
    targetStatus: 'CONCLUIDO',
    targetLessonStatus: 'passed',
    gerarQualificacao: true,
    evidencia: 'PENDENTE — exige aprovação formal do gestor + evidência documentada',
    observacoes: 'MANUAL_COMPLETION_REQUIRES_APPROVAL — não agir sem aprovação formal',
    matriculaId: null,
    funcionarioId: null,
    cursoId: null,
    empresaId: null,
  },
  {
    aluno: 'Bruno Justino',
    curso: 'Treinamento técnico Integração Manutenção',
    classification: CLASSIFICATION.MANUAL_COMPLETION_REQUIRES_APPROVAL,
    relato: 'Aluno relatou que concluiu o curso',
    targetLessonLocation: '52/52',
    targetProgressPct: 100,
    targetStatus: 'CONCLUIDO',
    targetLessonStatus: 'passed',
    gerarQualificacao: true,
    evidencia: 'PENDENTE — exige aprovação formal do gestor + evidência documentada',
    observacoes: 'MANUAL_COMPLETION_REQUIRES_APPROVAL — não agir sem aprovação formal',
    matriculaId: null,
    funcionarioId: null,
    cursoId: null,
    empresaId: null,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Alan Cortes
  // ─────────────────────────────────────────────────────────────────────────
  {
    aluno: 'Alan Cortes',
    curso: 'AW139 - Manutenção',
    classification: CLASSIFICATION.RESTORE_PROGRESS_ONLY,
    relato: 'Aluno passou o módulo 6 e voltou ao início (regressão)',
    targetLessonLocation: '60/380',      // estimativa: módulo 6 ≈ 60/380 (confirmar com pacote real)
    targetProgressPct: 16,               // round(60/380*100) = 16%
    targetStatus: 'EM_ANDAMENTO',
    targetLessonStatus: 'incomplete',
    gerarQualificacao: false,
    evidencia: 'Regressão confirmada pelo relato (passou módulo 6, voltou ao início)',
    observacoes: 'RESTORE_PROGRESS_ONLY — restaurar para pós-módulo 6 sem concluir',
    matriculaId: null,
    funcionarioId: null,
    cursoId: null,
    empresaId: null,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Francisco Altermir / Altemir
  // ─────────────────────────────────────────────────────────────────────────
  {
    aluno: 'Francisco Altermir',
    curso: 'Inspeção IIO & APRS',
    classification: CLASSIFICATION.MANUAL_COMPLETION_REQUIRES_APPROVAL,
    relato: 'Aluno relatou que concluiu o curso',
    targetLessonLocation: '80/80',
    targetProgressPct: 100,
    targetStatus: 'CONCLUIDO',
    targetLessonStatus: 'passed',
    gerarQualificacao: true,
    evidencia: 'PENDENTE — exige aprovação formal do gestor + evidência documentada',
    observacoes: 'MANUAL_COMPLETION_REQUIRES_APPROVAL — não agir sem aprovação formal',
    matriculaId: null,
    funcionarioId: null,
    cursoId: null,
    empresaId: null,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Wagner Domas
  // ─────────────────────────────────────────────────────────────────────────
  {
    aluno: 'Wagner Domas',
    curso: 'AW139 - Manutenção',
    classification: CLASSIFICATION.NEEDS_MORE_EVIDENCE,
    relato: 'Aluno avançado / fazendo prova (vago)',
    targetLessonLocation: null,          // DESCONHECIDO — aguardar evidência
    targetProgressPct: null,
    targetStatus: null,
    targetLessonStatus: null,
    gerarQualificacao: false,
    evidencia: 'INSUFICIENTE — relato vago, sem posição específica ou score documentado',
    observacoes: 'NEEDS_MORE_EVIDENCE — não agir até obter posição específica',
    matriculaId: null,
    funcionarioId: null,
    cursoId: null,
    empresaId: null,
  },
];

// ── Geração do plano de restauração ─────────────────────────────────────────

function generateRestorePlan(cases) {
  return cases.map((c, index) => {
    const actionable = c.classification === CLASSIFICATION.RESTORE_PROGRESS_ONLY;
    const requiresApproval = c.classification === CLASSIFICATION.MANUAL_COMPLETION_REQUIRES_APPROVAL;
    const needsEvidence = c.classification === CLASSIFICATION.NEEDS_MORE_EVIDENCE;

    const queries = generateSqlQueries(c);

    return {
      caseIndex: index + 1,
      aluno: c.aluno,
      curso: c.curso,
      classification: c.classification,
      relato: c.relato,
      evidencia: c.evidencia,
      observacoes: c.observacoes,
      idsRequired: {
        matriculaId: c.matriculaId ?? 'PREENCHER_ANTES_DE_APLICAR',
        funcionarioId: c.funcionarioId ?? 'PREENCHER_ANTES_DE_APLICAR',
        cursoId: c.cursoId ?? 'PREENCHER_ANTES_DE_APLICAR',
        empresaId: c.empresaId ?? 'PREENCHER_ANTES_DE_APLICAR',
      },
      proposedState: {
        targetLessonLocation: c.targetLessonLocation,
        targetProgressPct: c.targetProgressPct,
        targetStatus: c.targetStatus,
        targetLessonStatus: c.targetLessonStatus,
        gerarQualificacao: c.gerarQualificacao,
      },
      canApplyAutomatically: actionable && !requiresApproval && !needsEvidence,
      requiresHumanApproval: requiresApproval,
      blockedBy: needsEvidence ? 'NEEDS_MORE_EVIDENCE' : requiresApproval ? 'AWAITING_APPROVAL' : null,
      queries: queries,
    };
  });
}

function generateSqlQueries(c) {
  if (c.classification === CLASSIFICATION.NEEDS_MORE_EVIDENCE) {
    return {
      note: 'Sem queries — aguardar evidência antes de prosseguir',
      queries: [],
    };
  }

  if (c.classification === CLASSIFICATION.MANUAL_COMPLETION_REQUIRES_APPROVAL) {
    // ATENÇÃO: PATCH /api/lms/matriculas/:id/status foi endurecido (PR #159 / 2026-06-26).
    // Para cursos SCORM:
    //   - Exige papel ADMIN (manager recebe 403)
    //   - Exige evidência SCORM robusta (lesson_status=passed) — sem ela retorna 409 SCORM_COMPLETION_REJECTED
    // NÃO é possível concluir estes casos apenas com relato verbal.
    //
    // PROCESSO CORRETO para MANUAL_COMPLETION_REQUIRES_APPROVAL:
    //   1. Obter aprovação formal documentada do gestor (admin) com evidência anexada.
    //   2. Garantir que o pacote SCORM do curso está publicado corretamente no R2.
    //   3. Solicitar ao aluno que retome e conclua o curso no player — a conclusão
    //      SCORM será registrada automaticamente via POST /scorm/commit.
    //   4. Se os dados foram perdidos por bug de pacote e a retomada é impossível:
    //      a) Admin restaura manualmente o estado SCORM em lms_progresso_scorm
    //         (lesson_status='passed', lesson_location='{total}/{total}', score_raw ≥ mastery_score)
    //         usando o snapshot do step 1 + SQL equivalente ao step 3 abaixo com lesson_status='passed'.
    //      b) Após restaurar o estado SCORM, usar POST /api/lms/matriculas/{matriculaId}/finalizar
    //         — que valida automaticamente a evidência e, se aprovada, conclui e gera qualificação.
    //   NÃO usar PATCH /status diretamente sem evidência SCORM — resultado: 409.
    return {
      note: [
        'MANUAL_COMPLETION_REQUIRES_APPROVAL — sem queries automáticas.',
        'PATCH /status agora exige admin + evidência SCORM (lesson_status=passed). Ver comentário no código.',
        'Processo: obter aprovação formal → corrigir pacote → retomada pelo aluno → /finalizar.',
        'Ou: restaurar estado SCORM manualmente (admin) → POST /finalizar.',
      ].join(' '),
      queries: [
        {
          step: '0_BLOQUEADO_sem_evidencia_SCORM',
          note: 'Não executar. Ver instruções no campo note acima.',
          endpoint_obsoleto: 'PATCH /api/lms/matriculas/{matriculaId}/status — retornará 409 sem evidência SCORM',
          endpoint_correto: 'POST /api/lms/matriculas/{matriculaId}/finalizar — após restaurar estado SCORM',
        },
      ],
    };
  }

  if (c.classification === CLASSIFICATION.RESTORE_PROGRESS_ONLY) {
    const matriculaId = c.matriculaId ?? '{PREENCHER_MATRICULA_ID}';
    const empresaId = c.empresaId ?? '{PREENCHER_EMPRESA_ID}';
    const loc = c.targetLessonLocation ?? '{CONFIRMAR_LOCATION}';
    const pct = c.targetProgressPct ?? '{CONFIRMAR_PCT}';
    const ts = new Date().toISOString();

    const suspendDataExample = JSON.stringify({
      pos: loc.split('/')[0] ?? 0,
      totalSlides: loc.split('/')[1] ?? 0,
      restoredAt: ts,
      restoredBy: 'admin',
      reason: c.relato,
    });

    return {
      note: 'Queries de restauração — dry-run. Revisar antes de aplicar. Substituir placeholders pelos IDs reais.',
      queries: [
        {
          step: '1_snapshot_antes',
          description: 'Capturar estado atual ANTES de qualquer alteração',
          sql: `SELECT m.id, m.status, m.progresso_pct, m.data_inicio, m.data_conclusao,
       ps.lesson_status, ps.lesson_location, ps.suspend_data, ps.cmi_json
FROM lms_matriculas m
LEFT JOIN lms_progresso_scorm ps ON ps.matricula_id = m.id
WHERE m.id = ${matriculaId} AND m.empresa_id = ${empresaId};`,
        },
        {
          step: '2_update_matricula',
          description: 'Atualizar matrícula — só avança progresso, nunca regride',
          sql: `UPDATE lms_matriculas
SET progresso_pct = MAX(COALESCE(progresso_pct, 0), ${pct}),
    status = CASE WHEN status = 'CONCLUIDO' THEN 'CONCLUIDO' ELSE 'EM_ANDAMENTO' END,
    data_inicio = COALESCE(data_inicio, datetime('now')),
    updated_at = datetime('now')
WHERE id = ${matriculaId}
  AND empresa_id = ${empresaId}
  AND status <> 'CONCLUIDO';`,
        },
        {
          step: '3_upsert_progresso_scorm',
          description: 'Atualizar estado SCORM — preservar posição mais forte',
          sql: `INSERT INTO lms_progresso_scorm (matricula_id, empresa_id, lesson_status, lesson_location, suspend_data, cmi_json, last_commit_at)
VALUES (
  ${matriculaId},
  ${empresaId},
  'incomplete',
  '${loc}',
  '${suspendDataExample.replace(/'/g, "''")}',
  '{"core":{"lesson_location":"${loc}","lesson_status":"incomplete","suspend_data":"${suspendDataExample.replace(/"/g, '\\"').replace(/'/g, "''")}"}}',
  datetime('now')
)
ON CONFLICT (matricula_id) DO UPDATE SET
  lesson_status = CASE
    WHEN lesson_status IN ('passed', 'completed') THEN lesson_status
    ELSE 'incomplete'
  END,
  lesson_location = CASE
    WHEN (
      CAST(SUBSTR(lesson_location, 1, INSTR(lesson_location||'/', '/') - 1) AS INTEGER)
      >= CAST(SUBSTR('${loc}', 1, INSTR('${loc}', '/') - 1) AS INTEGER)
    ) THEN lesson_location
    ELSE '${loc}'
  END,
  suspend_data = CASE
    WHEN lesson_status IN ('passed', 'completed') THEN suspend_data
    ELSE '${suspendDataExample.replace(/'/g, "''")}'
  END,
  last_commit_at = datetime('now'),
  updated_at = datetime('now');`,
        },
        {
          step: '4_audit_log',
          description: 'Registrar operação em audit_logs — OBRIGATÓRIO',
          sql: `INSERT INTO audit_logs (
  user_id, action, entity_type, entity_id, empresa_id,
  old_values, new_values, detalhes, created_at
) VALUES (
  {PREENCHER_USER_ID_OPERADOR},
  'LMS_PROGRESS_RESTORE',
  'lms_matriculas',
  ${matriculaId},
  ${empresaId},
  '{PREENCHER: snapshot do step 1 como JSON}',
  '{"progresso_pct": ${pct}, "lesson_location": "${loc}", "status": "EM_ANDAMENTO"}',
  '{"motivo": "${c.relato.replace(/'/g, "''")}",
    "evidencia": "${c.evidencia.replace(/'/g, "''")}",
    "operador": "{PREENCHER_NOME_GESTOR}",
    "aprovado_por": "{PREENCHER_NOME_GESTOR}",
    "dry_run": false,
    "version": "${DRY_RUN_VERSION}"}',
  datetime('now')
);`,
        },
      ],
    };
  }

  return { note: 'Sem queries para esta classificação', queries: [] };
}

// ── Sumário ──────────────────────────────────────────────────────────────────

function generateSummary(plan) {
  const byClassification = {};
  for (const c of Object.values(CLASSIFICATION)) {
    byClassification[c] = plan.filter((p) => p.classification === c).length;
  }

  const actionable = plan.filter((p) => p.canApplyAutomatically).length;
  const blocked = plan.filter((p) => p.blockedBy).length;

  return {
    total: plan.length,
    byClassification,
    actionableWithReview: actionable,
    blockedPendingApproval: plan
      .filter((p) => p.requiresHumanApproval)
      .map((p) => `${p.aluno} — ${p.curso}`),
    blockedPendingEvidence: plan
      .filter((p) => p.blockedBy === 'NEEDS_MORE_EVIDENCE')
      .map((p) => `${p.aluno} — ${p.curso}`),
    idsToFill: plan.filter((p) => !p.idsRequired.matriculaId || p.idsRequired.matriculaId === 'PREENCHER_ANTES_DE_APLICAR').length,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const plan = generateRestorePlan(AFFECTED_CASES);
const summary = generateSummary(plan);

const output = {
  meta: {
    version: DRY_RUN_VERSION,
    generatedAt: GENERATED_AT,
    dryRun: true,
    warning: 'Este é um DRY-RUN. Nenhuma escrita foi realizada. Revisar todos os IDs e queries antes de aplicar.',
    auditMechanism: 'audit_logs (migration 0332) — nenhuma migration nova necessária',
  },
  summary,
  plan,
  nextSteps: [
    '1. Executar SQL de descoberta (Block 1 do relatório) para obter matriculaId, funcionarioId, cursoId, empresaId reais',
    '2. Preencher os IDs nos casos RESTORE_PROGRESS_ONLY',
    '3. Capturar snapshot do estado atual (step 1 de cada caso)',
    '4. Revisar as queries com o gestor responsável',
    '5. Para MANUAL_COMPLETION_REQUIRES_APPROVAL: obter aprovação formal documentada',
    '6. Para NEEDS_MORE_EVIDENCE: obter posição específica do aluno Wagner Domas',
    '7. Aplicar apenas após aprovação — nunca automaticamente sem revisão humana',
    '8. Verificar audit_logs após cada aplicação',
  ],
};

const isJsonMode = process.argv.includes('--json');

if (isJsonMode) {
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
} else {
  process.stdout.write('\n=== RESTORE LMS PROGRESS — DRY-RUN ===\n');
  process.stdout.write(`Versão: ${DRY_RUN_VERSION}\n`);
  process.stdout.write(`Gerado em: ${GENERATED_AT}\n`);
  process.stdout.write('\nATENÇÃO: DRY-RUN — nenhuma escrita foi realizada.\n\n');

  process.stdout.write('── SUMÁRIO ──────────────────────────────\n');
  process.stdout.write(`Total de casos: ${summary.total}\n`);
  for (const [cls, count] of Object.entries(summary.byClassification)) {
    if (count > 0) process.stdout.write(`  ${cls}: ${count}\n`);
  }
  process.stdout.write(`\nExecutáveis com revisão: ${summary.actionableWithReview}\n`);
  process.stdout.write(`IDs a preencher: ${summary.idsToFill}\n`);

  if (summary.blockedPendingApproval.length > 0) {
    process.stdout.write('\nAguardando aprovação formal:\n');
    for (const item of summary.blockedPendingApproval) {
      process.stdout.write(`  - ${item}\n`);
    }
  }

  if (summary.blockedPendingEvidence.length > 0) {
    process.stdout.write('\nAguardando evidência adicional:\n');
    for (const item of summary.blockedPendingEvidence) {
      process.stdout.write(`  - ${item}\n`);
    }
  }

  process.stdout.write('\n── PRÓXIMOS PASSOS ──────────────────────\n');
  for (const step of output.nextSteps) {
    process.stdout.write(`${step}\n`);
  }

  process.stdout.write('\nPara saída JSON completa com queries: node scripts/restore-lms-progress-dry-run.mjs --json\n\n');
}
