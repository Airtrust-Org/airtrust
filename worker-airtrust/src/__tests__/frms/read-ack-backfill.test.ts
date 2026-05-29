import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildFrmsReadAckBackfillPlan,
  mapLegacyReadAckAckToAudit,
  mapLegacyReadAckEventToDedicated,
  type LegacyFrmsFadigaEventoRow,
} from '../../lib/frms/read-ack-backfill';

const __dirname = dirname(fileURLToPath(import.meta.url));

const eventPayload = {
  id: 'frms_read_ack_6_2026-05-27_35_OUTRO_CONTEXTUAL',
  schema_version: 1,
  empresa_id: 6,
  data_operacional: '2026-05-27',
  funcionario_id: 35,
  funcionario_nome: 'Teste',
  event_type: 'OUTRO_CONTEXTUAL',
  severity: 'ATENCAO',
  status: 'ACKED',
  source: 'OPERATIONAL_SNAPSHOT',
  snapshot_status: 'ATENCAO',
  snapshot_alertas: ['JORNADA_FRMS_SEM_ESCALA'],
  checkin_status: 'PENDENTE',
  sleep_data_source: 'ESTIMADO',
  wake_data_source: 'AUSENTE',
  jornada_data_source: 'AUSENTE',
  fortnight_status: 'INCOMPLETO',
  created_at: '2026-05-28T19:50:37.000Z',
  acknowledged_at: '2026-05-28T19:55:00.280Z',
  acknowledged_by: 60,
  acknowledged_by_name: 'filipe.daumas@icloud.com',
  ack_note: 'Smoke controlado',
  limitations: ['Evento operacional de leitura e ciencia; nao representa mitigacao.'],
};

function legacyEvent(overrides: Partial<LegacyFrmsFadigaEventoRow> = {}): LegacyFrmsFadigaEventoRow {
  return {
    id: eventPayload.id,
    empresa_id: 6,
    tipo: 'FRMS_READ_ACK_EVENT',
    created_at: '2026-05-28 19:50:37',
    payload_json: JSON.stringify(eventPayload),
    ...overrides,
  };
}

function legacyAck(overrides: Partial<LegacyFrmsFadigaEventoRow> = {}): LegacyFrmsFadigaEventoRow {
  return {
    id: '75cad095-a84d-4501-b516-2d6fd844b803',
    empresa_id: 6,
    tipo: 'FRMS_READ_ACK_ACK',
    created_at: '2026-05-28 19:55:00',
    payload_json: JSON.stringify({
      schema_version: 1,
      event_id: eventPayload.id,
      acknowledged_at: '2026-05-28T19:55:00.280Z',
      acknowledged_by: 60,
      acknowledged_by_name: 'filipe.daumas@icloud.com',
      ack_note: 'Smoke controlado',
    }),
    ...overrides,
  };
}

describe('FRMS read/ack legacy backfill mapping', () => {
  it('mapeia evento legado para frms_read_ack_events', () => {
    const mapped = mapLegacyReadAckEventToDedicated(legacyEvent());
    expect('reason' in mapped).toBe(false);
    if ('reason' in mapped) return;
    expect(mapped.id).toBe(eventPayload.id);
    expect(mapped.empresa_id).toBe(6);
    expect(mapped.data_operacional).toBe('2026-05-27');
    expect(mapped.funcionario_id).toBe(35);
    expect(mapped.event_type).toBe('OUTRO_CONTEXTUAL');
    expect(mapped.severity).toBe('ATENCAO');
    expect(mapped.lifecycle_status).toBe('ACKED');
    expect(mapped.acknowledged_by).toBe(60);
    expect(JSON.parse(mapped.snapshot_payload_json).id).toBe(eventPayload.id);
  });

  it('preserva campos numericos nulos sem converter para zero', () => {
    const mapped = mapLegacyReadAckEventToDedicated(
      legacyEvent({
        payload_json: JSON.stringify({
          ...eventPayload,
          status: 'PENDING',
          acknowledged_at: null,
          acknowledged_by: null,
          ack_note: null,
        }),
      }),
    );
    expect('reason' in mapped).toBe(false);
    if ('reason' in mapped) return;
    expect(mapped.acknowledged_at).toBeNull();
    expect(mapped.acknowledged_by).toBeNull();
    expect(mapped.ack_note).toBeNull();
  });

  it('mapeia ACK legado para auditoria dedicada', () => {
    const payloads = new Map([[eventPayload.id, JSON.stringify(eventPayload)]]);
    const mapped = mapLegacyReadAckAckToAudit(legacyAck(), payloads);
    expect('reason' in mapped).toBe(false);
    if ('reason' in mapped) return;
    expect(mapped.event_id).toBe(eventPayload.id);
    expect(mapped.action).toBe('ACK');
    expect(mapped.actor_user_id).toBe(60);
    expect(mapped.payload_after_json).toContain(eventPayload.id);
  });

  it('ignora duplicata de evento dedicado', () => {
    const plan = buildFrmsReadAckBackfillPlan({
      legacyRows: [legacyEvent()],
      existingDedicatedEventIds: new Set([eventPayload.id]),
      existingAuditEventIds: new Set(),
    });
    expect(plan.events_to_insert).toHaveLength(0);
    expect(plan.skipped).toContainEqual({
      id: eventPayload.id,
      tipo: 'FRMS_READ_ACK_EVENT',
      reason: 'dedicated_event_exists',
    });
  });

  it('ignora duplicata de auditoria ACK', () => {
    const plan = buildFrmsReadAckBackfillPlan({
      legacyRows: [legacyEvent(), legacyAck()],
      existingDedicatedEventIds: new Set(),
      existingAuditEventIds: new Set([eventPayload.id]),
    });
    expect(plan.audits_to_insert).toHaveLength(0);
    expect(plan.skipped.some((item) => item.reason === 'audit_ack_exists')).toBe(true);
  });

  it('falha seguro em payload invalido', () => {
    const plan = buildFrmsReadAckBackfillPlan({
      legacyRows: [legacyEvent({ payload_json: '{invalid' })],
      existingDedicatedEventIds: new Set(),
      existingAuditEventIds: new Set(),
    });
    expect(plan.events_to_insert).toHaveLength(0);
    expect(plan.invalid_payloads).toEqual([
      { id: eventPayload.id, tipo: 'FRMS_READ_ACK_EVENT', reason: 'payload_json_invalido' },
    ]);
  });

  it('nao migra tipos fora do escopo', () => {
    const plan = buildFrmsReadAckBackfillPlan({
      legacyRows: [legacyEvent({ id: 'outro', tipo: 'OUTRO_TIPO' })],
      existingDedicatedEventIds: new Set(),
      existingAuditEventIds: new Set(),
    });
    expect(plan.events_to_insert).toHaveLength(0);
    expect(plan.skipped).toEqual([{ id: 'outro', tipo: 'OUTRO_TIPO', reason: 'tipo_nao_suportado' }]);
  });
});

describe('FRMS read/ack backfill script safety gates', () => {
  it('dry-run e o modo padrao e aceita limit opcional', () => {
    const repoRoot = resolve(__dirname, '../../../..');
    const result = spawnSync(
      'node',
      [
        '--input-type=module',
        '-e',
        "import { parseArgs } from './scripts/backfill-frms-read-ack-dedicated-storage.mjs'; console.log(JSON.stringify(parseArgs(['--empresa-id','6','--data-inicio','2026-05-27','--data-fim','2026-05-27','--limit','10'])));",
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      apply: false,
      empresaId: 6,
      dataInicio: '2026-05-27',
      dataFim: '2026-05-27',
      limit: 10,
    });
  });

  it('apply exige empresa_id/data_inicio/data_fim antes de qualquer execucao', () => {
    const repoRoot = resolve(__dirname, '../../../..');
    const result = spawnSync('node', ['scripts/backfill-frms-read-ack-dedicated-storage.mjs', '--apply'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--empresa-id inteiro positivo e obrigatorio');
  });

  it('SQL de insert preserva NULL para campos opcionais sem ator', () => {
    const repoRoot = resolve(__dirname, '../../../..');
    const result = spawnSync(
      'node',
      [
        '--input-type=module',
        '-e',
        "import { eventInsertSql } from './scripts/backfill-frms-read-ack-dedicated-storage.mjs'; console.log(eventInsertSql({id:'e1',empresa_id:6,data_operacional:'2026-05-27',funcionario_id:35,event_type:'OUTRO_CONTEXTUAL',severity:'ATENCAO',source:'OPERATIONAL_SNAPSHOT',lifecycle_status:'PENDING',snapshot_status:'ATENCAO',snapshot_alertas_json:'[]',data_sources_json:'{}',limitations_json:'[]',snapshot_payload_json:'{}',event_hash:'e1',created_at:'2026-05-28T19:50:37.000Z',created_by:null,acknowledged_at:null,acknowledged_by:null,ack_note:null}));",
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(", NULL, NULL, NULL, NULL, 1);");
  });

  it('SQL gerado para backfill nao altera legado nem executa remocao', () => {
    const mapped = mapLegacyReadAckEventToDedicated(legacyEvent());
    expect('reason' in mapped).toBe(false);
    if ('reason' in mapped) return;
    const sqlText = JSON.stringify(mapped).toUpperCase();
    expect(sqlText).not.toContain('DELETE');
    expect(sqlText).not.toContain('DROP');
    expect(sqlText).not.toContain('FRMS_FADIGA_EVENTO');
  });
});
