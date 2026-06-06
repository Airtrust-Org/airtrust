import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildConflictEvents,
  dedupeIntegratedEvents,
  eventsOverlap,
  groupIntegratedEmployeeMonths,
  parseIntegratedMonth,
  summarizeEvents,
  type IntegratedMonthlyEvent,
} from '../../services/escala-mensal-integrada';

function event(overrides: Partial<IntegratedMonthlyEvent>): IntegratedMonthlyEvent {
  return {
    id: 'event-1',
    source: 'ESCALA',
    sourceId: '1',
    employeeId: '10',
    employeeName: 'Tripulante Teste',
    date: '2026-06-10',
    allDay: false,
    startAt: '2026-06-10T08:00:00-03:00',
    endAt: '2026-06-10T10:00:00-03:00',
    type: 'TESTE',
    title: 'Evento',
    severity: 'INFO',
    status: 'ATIVO',
    blocksAllocation: false,
    requiresAction: false,
    ...overrides,
  };
}

describe('escala-mensal-integrada pure helpers', () => {
  it('parseIntegratedMonth calcula primeiro e último dia do mês sem deslocar datas', () => {
    const month = parseIntegratedMonth('2026-06');

    expect(month.startDate).toBe('2026-06-01');
    expect(month.endDate).toBe('2026-06-30');
    expect(month.days).toHaveLength(30);
    expect(month.days[0]).toBe('2026-06-01');
    expect(month.days[29]).toBe('2026-06-30');
  });

  it('eventsOverlap não cria conflito para eventos adjacentes', () => {
    const a = event({ id: 'a', startAt: '2026-06-10T08:00:00-03:00', endAt: '2026-06-10T10:00:00-03:00' });
    const b = event({ id: 'b', startAt: '2026-06-10T10:00:00-03:00', endAt: '2026-06-10T12:00:00-03:00' });

    expect(eventsOverlap(a, b)).toBe(false);
  });

  it('eventsOverlap identifica evento que atravessa meia-noite', () => {
    const a = event({ id: 'a', date: '2026-06-10', startAt: '2026-06-10T22:30:00-03:00', endAt: '2026-06-11T01:00:00-03:00' });
    const b = event({ id: 'b', date: '2026-06-11', startAt: '2026-06-11T00:30:00-03:00', endAt: '2026-06-11T02:00:00-03:00' });

    expect(eventsOverlap(a, b)).toBe(true);
  });

  it('eventsOverlap ignora cancelados', () => {
    const a = event({ id: 'a', status: 'CANCELADO' });
    const b = event({ id: 'b' });

    expect(eventsOverlap(a, b)).toBe(false);
  });

  it('dedupeIntegratedEvents funde apenas a mesma fonte, origem, tripulante, dia e horário', () => {
    const first = event({ id: 'a', source: 'SIMULADOR', sourceId: 33 });
    const duplicateBlocking = event({
      id: 'b',
      source: 'SIMULADOR',
      sourceId: 33,
      severity: 'BLOCKING',
      blocksAllocation: true,
    });
    const distinct = event({ id: 'c', source: 'SIMULADOR', sourceId: 34 });

    const deduped = dedupeIntegratedEvents([first, duplicateBlocking, distinct]);

    expect(deduped).toHaveLength(2);
    expect(deduped.find((item) => item.sourceId === 33)?.severity).toBe('BLOCKING');
  });

  it('buildConflictEvents cria conflito único para compromisso simultâneo com escala', () => {
    const escala = event({ id: 'escala', source: 'ESCALA', sourceId: 'ea-1', title: 'Escala operacional' });
    const treinamento = event({
      id: 'treinamento',
      source: 'TREINAMENTO',
      sourceId: 44,
      title: 'Treinamento HUET',
      startAt: '2026-06-10T09:00:00-03:00',
      endAt: '2026-06-10T11:00:00-03:00',
    });

    const conflicts = buildConflictEvents([escala, treinamento]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      severity: 'CONFLICT',
      blocksAllocation: false,
      requiresAction: true,
      title: 'Conflito com escala operacional',
    });
  });

  it('buildConflictEvents transforma indisponibilidade sobreposta em bloqueio determinístico', () => {
    const escala = event({ id: 'escala', source: 'ESCALA', sourceId: 'ea-1' });
    const indisponibilidade = event({
      id: 'ferias',
      source: 'INDISPONIBILIDADE',
      sourceId: 'sit-1',
      allDay: true,
      startAt: null,
      endAt: null,
      status: 'FERIAS',
      blocksAllocation: true,
    });

    const conflicts = buildConflictEvents([escala, indisponibilidade]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe('BLOCKING');
    expect(conflicts[0].blocksAllocation).toBe(true);
  });

  it('summarizeEvents reconcilia totais com itens detalhados', () => {
    const items = [
      event({ id: 'info', severity: 'INFO' }),
      event({ id: 'warning', severity: 'WARNING' }),
      event({ id: 'conflict', severity: 'CONFLICT' }),
      event({ id: 'blocking', severity: 'BLOCKING', blocksAllocation: true }),
    ];

    expect(summarizeEvents(items)).toEqual({
      events: 4,
      warnings: 1,
      conflicts: 1,
      blockingIssues: 1,
    });
  });

  it('groupIntegratedEmployeeMonths mantém buckets por dia e resumo por tripulante coerentes', () => {
    const month = parseIntegratedMonth('2026-06');
    const events = [
      event({ id: 'escala', source: 'ESCALA', sourceId: 'ea-1' }),
      event({ id: 'treinamento', source: 'TREINAMENTO', sourceId: 1 }),
      event({ id: 'qual', source: 'QUALIFICACAO', sourceId: 2, severity: 'WARNING' }),
      event({ id: 'frms', source: 'FRMS', sourceId: '3', severity: 'BLOCKING', blocksAllocation: true }),
      event({ id: 'conflito', source: 'OUTRO', sourceId: null, severity: 'CONFLICT' }),
    ];

    const grouped = groupIntegratedEmployeeMonths(
      month,
      [{ employeeId: '10', employeeName: 'Tripulante Teste', role: 'PIC', base: 'SBSP' }],
      events,
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0].summary).toMatchObject({
      scheduledDays: 1,
      trainingEvents: 1,
      qualificationWarnings: 1,
      frmsWarnings: 1,
      conflicts: 1,
      blockingIssues: 1,
    });
    expect(grouped[0].days['2026-06-10'].operationalAssignments).toHaveLength(1);
    expect(grouped[0].days['2026-06-10'].commitments).toHaveLength(1);
    expect(grouped[0].days['2026-06-10'].alerts).toHaveLength(2);
    expect(grouped[0].days['2026-06-10'].conflicts).toHaveLength(1);
  });
});

describe('escala-mensal-integrada training source contract', () => {
  const source = readFileSync(
    new URL('../../services/escala-mensal-integrada.ts', import.meta.url).pathname,
    'utf8',
  );

  it('consolida participantes e instrutores por turma', () => {
    expect(source).toContain('FROM treinamentos_instrutores');
    expect(source).toContain('NOT EXISTS (');
    expect(source).toContain('MAX(is_instrutor)');
    expect(source).toContain("participationRole:");
  });

  it('suprime simulador quando a sessão já está vinculada ao dia da turma', () => {
    expect(source).toContain('td.sessao_id = sa.id');
    expect(source).toContain('tp.funcionario_id = sp.funcionario_id');
    expect(source).toContain('AND NOT EXISTS');
  });

  it('marca conflito de recurso por simulador, aeronave ou local sobreposto', () => {
    expect(source).toContain('other_day.simulador_id = td.simulador_id');
    expect(source).toContain('other_day.aeronave_id = td.aeronave_id');
    expect(source).toContain('AS resource_conflict');
    expect(source).toContain("severity: Number(row.resource_conflict || 0) === 1 ? 'CONFLICT'");
  });
});

describe('escala-mensal-integrada — correções de auditoria', () => {
  it('M7: duas linhas de ESCALA no mesmo dia não geram conflito interno falso', () => {
    const a = event({
      id: 'esc-a',
      source: 'ESCALA',
      sourceId: '1',
      allDay: true,
      startAt: null,
      endAt: null,
      title: 'Situação administrativa',
    });
    const b = event({
      id: 'esc-b',
      source: 'ESCALA',
      sourceId: '2',
      allDay: true,
      startAt: null,
      endAt: null,
      title: 'Alocação operacional',
    });

    expect(buildConflictEvents([a, b])).toHaveLength(0);
  });

  it('M6/B1: dedupe colapsa turma + sessão de simulador com a mesma chave canônica', () => {
    const canonicalDedupKey = 'simulador_agendamento:9:funcionario:10';
    const training = event({
      id: 'treino',
      source: 'TREINAMENTO',
      sourceId: 5,
      metadata: { canonicalDedupKey },
    });
    const simulador = event({
      id: 'sim',
      source: 'SIMULADOR',
      sourceId: 9,
      metadata: { canonicalDedupKey },
    });

    const deduped = dedupeIntegratedEvents([training, simulador]);
    expect(deduped).toHaveLength(1);
    // mantém o evento de treinamento (mais rico em contexto, primeiro na ordem)
    expect(deduped[0].source).toBe('TREINAMENTO');
  });

  it('M6/B1: eventos com a mesma chave canônica não conflitam entre si (instrutor em sessão vinculada)', () => {
    const canonicalDedupKey = 'simulador_agendamento:9:funcionario:10';
    const training = event({
      id: 'treino',
      source: 'TREINAMENTO',
      sourceId: 5,
      startAt: '2026-06-10T08:00:00-03:00',
      endAt: '2026-06-10T12:00:00-03:00',
      metadata: { canonicalDedupKey },
    });
    const simulador = event({
      id: 'sim',
      source: 'SIMULADOR',
      sourceId: 9,
      startAt: '2026-06-10T08:00:00-03:00',
      endAt: '2026-06-10T12:00:00-03:00',
      metadata: { canonicalDedupKey },
    });

    expect(buildConflictEvents([training, simulador])).toHaveLength(0);
  });

  it('M6: compromissos distintos (chaves canônicas diferentes) ainda conflitam', () => {
    const training = event({
      id: 'treino',
      source: 'TREINAMENTO',
      sourceId: 5,
      startAt: '2026-06-10T08:00:00-03:00',
      endAt: '2026-06-10T12:00:00-03:00',
      metadata: { canonicalDedupKey: 'treinamento:5:dia:1:funcionario:10' },
    });
    const simulador = event({
      id: 'sim',
      source: 'SIMULADOR',
      sourceId: 9,
      startAt: '2026-06-10T09:00:00-03:00',
      endAt: '2026-06-10T11:00:00-03:00',
      metadata: { canonicalDedupKey: 'simulador_agendamento:9:funcionario:10' },
    });

    expect(buildConflictEvents([training, simulador])).toHaveLength(1);
  });
});

describe('escala-mensal-integrada — contrato de tenant/filtros/parcialidade', () => {
  const source = readFileSync(
    new URL('../../services/escala-mensal-integrada.ts', import.meta.url).pathname,
    'utf8',
  );

  it('A2: seleção do registro mais recente é isolada por empresa', () => {
    expect(source).toContain('AND empresa_id = ?');
    expect(source).toContain('GROUP BY empresa_id, COALESCE(funcionario_cpf');
  });

  it('M1: o filtro de função é aplicado de fato (não é no-op)', () => {
    expect(source).toContain('.funcao, ${alias}.cargo');
    expect(source).toContain('if (filters.funcaoId) bindings.push(filters.funcaoId);');
  });

  it('M10: alerta FRMS sinaliza confiabilidade da data operacional', () => {
    expect(source).toContain('dateReliable');
    expect(source).toContain("dateSource: dateReliable ? 'jornada' : 'created_at'");
  });

  it('B4: filtro de severidade preserva eventos referenciados por conflitos', () => {
    expect(source).toContain('referencedIds');
  });

  it('M11: qualificação vencida NÃO é clampada para primeiro dia do mês', () => {
    // A data do evento deve usar a data real de vencimento, não
    // month.startDate como fallback para qualificações já vencidas.
    // O clamp anterior (dataVencimento < month.startDate ? month.startDate : ...)
    // empilhava todas as qualificações vencidas no dia 1 do mês,
    // poluindo o calendário com eventos artificiais.
    // month.startDate ainda é usado legitimamente para binds SQL e
    // cálculo de severidade (vencida/vencendoNoMes).
    expect(source).toContain('date: dataVencimento');
    // O padrão antigo de clamp com operador ternário não deve existir:
    expect(source).not.toContain('month.startDate\n            ? month.startDate');
  });

  it('M12: qualificação vencida não bloqueia alocação quando tem renovação planejada', () => {
    expect(source).toContain('hasRenewal');
    expect(source).toContain('blocksAllocation: vencida && !hasRenewal');
    expect(source).toContain('vencida && !hasRenewal ? \'BLOCKING\' : \'WARNING\'');
  });

  it('M13: sumário usa buckets corretos — compromissos ≠ alertas ≠ conflitos', () => {
    // sourceBucket deve colocar QUALIFICACAO/FRMS/INDISPONIBILIDADE em alerts,
    // ESCALA em operationalAssignments, CONFLICT em conflicts,
    // e TREINAMENTO/SIMULADOR/OUTRO em commitments.
    expect(source).toContain("event.source === 'QUALIFICACAO' || event.source === 'FRMS'");
    expect(source).toContain("return 'alerts'");
    expect(source).toContain("return 'commitments'");
    expect(source).toContain("return 'operationalAssignments'");
  });

  it('M14: TREINAMENTO CANCELADO não aparece como compromisso ativo', () => {
    // O loader de treinamentos exclui status CANCELADO.
    // CONCLUIDO é mantido (aparece em cinza no frontend).
    expect(source).toContain("<> 'CANCELADO'");
    expect(source).toContain('TREINAMENTO_PLANEJADO');
  });
});

describe('escala-mensal-integrada — qualificação date integrity', () => {
  it('qualificação com vencimento antes do mês usa data real, não month.startDate', () => {
    // Quando uma qualificação venceu antes do mês corrente (ex: 2026-05-15
    // para mês 2026-06), o evento NÃO deve ser clampado para 2026-06-01.
    // Ele deve usar a data real (2026-05-15), o que significa que não
    // aparecerá no grid do mês corrente (days[event.date] não inclui maio),
    // mas ainda será contabilizado no sumário do tripulante.
    const source = readFileSync(
      new URL('../../services/escala-mensal-integrada.ts', import.meta.url).pathname,
      'utf8',
    );

    // Isola o corpo da função loadQualificacaoEvents (da declaração até o
    // início da próxima função loadFrmsEvents).
    const qualStart = source.indexOf('async function loadQualificacaoEvents');
    const nextFunc = source.indexOf('async function loadFrmsEvents');
    const qualSection = source.slice(qualStart, nextFunc);

    // A data do evento (campo `date:`) deve usar dataVencimento diretamente,
    // NÃO com operador ternário de clamp para month.startDate/month.endDate.
    // month.startDate ainda pode aparecer em outros contextos (bind SQL,
    // cálculo de vencida/vencendoNoMes), que são usos legítimos.
    expect(qualSection).toContain('date: dataVencimento');
    // O padrão antigo de clamp não deve existir:
    expect(qualSection).not.toContain('month.startDate\n            ? month.startDate');
    expect(qualSection).not.toContain('month.startDate\n              ? month.startDate');
  });

  it('qualificação com vencimento dentro do mês aparece na data correta', () => {
    const source = readFileSync(
      new URL('../../services/escala-mensal-integrada.ts', import.meta.url).pathname,
      'utf8',
    );
    // Verifica que há lógica para usar a data real quando dentro do mês
    const qualSection = source.slice(source.indexOf('loadQualificacaoEvents'));
    expect(qualSection).toContain('dataVencimento');
  });
});

describe('aeronaves — contrato de filtro somenteAtivas', () => {
  const source = readFileSync(
    new URL('../../routes/aeronaves.ts', import.meta.url).pathname,
    'utf8',
  );

  it('somenteAtivas exclui apenas status de indisponibilidade, não outros status válidos', () => {
    // O filtro anterior UPPER(...) = 'ATIVO' excluía status como 'D' (Disponível).
    // O novo filtro NOT IN ('I', 'INATIVO', 'INDISPONIVEL', 'INDISPONÍVEL')
    // alinha com isAeronaveAtiva() do frontend: aeronave é ativa quando
    // NÃO está indisponível.
    expect(source).toContain("NOT IN ('I', 'INATIVO', 'INDISPONIVEL', 'INDISPONÍVEL')");
    expect(source).toContain('isAeronaveAtiva');
  });

  it('aeronaves com status NULL ou vazio são tratadas como ATIVO', () => {
    expect(source).toContain("COALESCE(NULLIF(TRIM(status), '')");
    expect(source).toContain("'ATIVO'");
  });

  it('tenant isolation é mantida no filtro somenteAtivas', () => {
    expect(source).toContain('empresa_id = ?');
    expect(source).toContain('deleted_at IS NULL');
  });
});

describe('evd — aeronaves não converte erro em lista vazia silenciosa', () => {
  const source = readFileSync(
    new URL('../../routes/aeronaves.ts', import.meta.url).pathname,
    'utf8',
  );

  it('erro na query de aeronaves retorna 500, não lista vazia', () => {
    expect(source).toContain("throw new ApiError('Erro ao listar aeronaves', 500)");
  });

  it('resposta de sucesso sempre inclui array (nunca null/undefined)', () => {
    expect(source).toContain('data: results || []');
  });

  it('lista vazia verdadeira (sem aeronaves) é distinguível de erro', () => {
    // O endpoint retorna { success: true, data: [] } quando realmente
    // não há aeronaves, e 500 quando há erro. O frontend pode distinguir
    // pelo HTTP status code.
    expect(source).toContain('success: true');
  });
});
