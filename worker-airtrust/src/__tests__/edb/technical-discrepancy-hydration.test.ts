import { describe, expect, it } from 'vitest';
import { hydrateEdbTechnicalDiscrepancyLedger } from '../../repositories/edb/edb-technical-discrepancy-hydration';
import { getEdbTechnicalDiscrepancyStatus } from '../../services/edb/technical-discrepancy-ledger';

const BASE = {
  identity: {
    discrepancyId: 'disc-1',
    revisionId: 'rev-1',
    description: 'Hydraulic leak observed after shutdown',
    detectedBy: { actorRef: 'employee:42', displayName: 'PIC Example' },
    detectedAt: '2026-09-05T12:00:00.000Z',
    createdAt: '2026-09-05T12:01:00.000Z',
  },
  events: [],
};

describe('eDB technical discrepancy persisted hydration', () => {
  it('replays a valid append-only history through the domain guards', () => {
    const hydrated = hydrateEdbTechnicalDiscrepancyLedger({
      ...BASE,
      events: [
        {
          type: 'DEFERRED_ACTION_AUTHORIZED',
          eventId: 'evt-1',
          reason: 'Controlled deferral',
          limitationOrControl: 'Inspect before next flight',
          authorizedBy: { actorRef: 'maintenance:7', displayName: 'Maintenance Control' },
          occurredAt: '2026-09-05T12:10:00.000Z',
          reference: 'MX-DEF-001',
        },
        {
          type: 'CORRECTIVE_ACTION_RECORDED',
          eventId: 'evt-2',
          correctiveActionId: 'ca-1',
          description: 'Seal replaced and leak check satisfactory',
          performedBy: { actorRef: 'mechanic:9', displayName: 'Mechanic Example' },
          occurredAt: '2026-09-05T13:00:00.000Z',
          reference: 'WO-1001',
        },
        {
          type: 'RETURN_TO_SERVICE_RECORDED',
          eventId: 'evt-3',
          approvalId: 'rts-1',
          correctiveActionId: 'ca-1',
          description: 'Return to service recorded',
          approvedBy: { actorRef: 'inspector:3', displayName: 'Inspector Example' },
          occurredAt: '2026-09-05T13:30:00.000Z',
          reference: 'RTS-1001',
        },
      ],
    });

    expect(hydrated.events).toHaveLength(3);
    expect(getEdbTechnicalDiscrepancyStatus(hydrated)).toBe('RETURN_TO_SERVICE_RECORDED');
  });

  it('rejects an unknown persisted event type instead of ignoring it', () => {
    expect(() =>
      hydrateEdbTechnicalDiscrepancyLedger({
        ...BASE,
        events: [{ type: 'EDIT_OR_DELETE_ORIGINAL', eventId: 'evt-x' }],
      }),
    ).toThrow('EDB_DISCREPANCY_EVENT_TYPE_INVALID');
  });

  it('rejects duplicate persisted event identifiers', () => {
    const event = {
      type: 'CORRECTIVE_ACTION_RECORDED',
      eventId: 'evt-1',
      correctiveActionId: 'ca-1',
      description: 'Correction',
      performedBy: { actorRef: 'mechanic:9', displayName: 'Mechanic Example' },
      occurredAt: '2026-09-05T13:00:00.000Z',
      reference: null,
    };

    expect(() =>
      hydrateEdbTechnicalDiscrepancyLedger({ ...BASE, events: [event, event] }),
    ).toThrow('Duplicate technical discrepancy eventId');
  });

  it('rejects persisted events that move backward in time', () => {
    expect(() =>
      hydrateEdbTechnicalDiscrepancyLedger({
        ...BASE,
        events: [
          {
            type: 'CORRECTIVE_ACTION_RECORDED',
            eventId: 'evt-1',
            correctiveActionId: 'ca-1',
            description: 'Correction',
            performedBy: { actorRef: 'mechanic:9', displayName: 'Mechanic Example' },
            occurredAt: '2026-09-05T13:00:00.000Z',
            reference: null,
          },
          {
            type: 'DEFERRED_ACTION_AUTHORIZED',
            eventId: 'evt-2',
            reason: 'Late replayed deferral',
            limitationOrControl: null,
            authorizedBy: { actorRef: 'maintenance:7', displayName: 'Maintenance Control' },
            occurredAt: '2026-09-05T12:30:00.000Z',
            reference: null,
          },
        ],
      }),
    ).toThrow('Technical discrepancy ledger must be chronological');
  });

  it('rejects return to service that does not reference the latest corrective action', () => {
    expect(() =>
      hydrateEdbTechnicalDiscrepancyLedger({
        ...BASE,
        events: [
          {
            type: 'CORRECTIVE_ACTION_RECORDED',
            eventId: 'evt-1',
            correctiveActionId: 'ca-1',
            description: 'First correction',
            performedBy: { actorRef: 'mechanic:9', displayName: 'Mechanic Example' },
            occurredAt: '2026-09-05T13:00:00.000Z',
            reference: null,
          },
          {
            type: 'CORRECTIVE_ACTION_RECORDED',
            eventId: 'evt-2',
            correctiveActionId: 'ca-2',
            description: 'Follow-up correction',
            performedBy: { actorRef: 'mechanic:9', displayName: 'Mechanic Example' },
            occurredAt: '2026-09-05T13:10:00.000Z',
            reference: null,
          },
          {
            type: 'RETURN_TO_SERVICE_RECORDED',
            eventId: 'evt-3',
            approvalId: 'rts-1',
            correctiveActionId: 'ca-1',
            description: 'Wrong corrective action target',
            approvedBy: { actorRef: 'inspector:3', displayName: 'Inspector Example' },
            occurredAt: '2026-09-05T13:20:00.000Z',
            reference: null,
          },
        ],
      }),
    ).toThrow('Return to service must reference the latest corrective action');
  });
});
