import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EdbShadowAnalysisPanels from '../EdbShadowAnalysisPanels';

const categories = {
  FIELD_MISSING: 0,
  VALUE_MISMATCH: 1,
  UNIT_MISMATCH: 0,
  TIMEZONE_MISMATCH: 0,
  CREW_UNRESOLVED: 0,
  LEG_MISSING: 0,
  LEG_EXTRA: 0,
  ROLE_UNMAPPED: 0,
  PROVENANCE_CONFLICT: 0,
  TECHNICAL_STATUS_MISMATCH: 1,
  TENANT_SCOPE_ERROR: 0,
  POSSIBLE_CRITICAL_DIVERGENCE: 0,
  UNKNOWN_FIELD: 0,
};

const severities = {
  OBSERVATION: 0,
  LOW: 0,
  MEDIUM: 0,
  HIGH: 1,
  CRITICAL: 1,
};

function validAnalysisPayload() {
  return {
    shadowDivergence: {
      schemaVersion: 'edb.shadow-divergence.v1',
      caseResult: 'interrupted',
      recommendation: 'stop',
      maxSeverity: 'CRITICAL',
      findings: [
        {
          category: 'VALUE_MISMATCH',
          severity: 'HIGH',
          causeCode: 'SOURCE_CONFLICT',
          field: 'legs.0.personsOnBoard',
        },
        {
          category: 'TECHNICAL_STATUS_MISMATCH',
          severity: 'CRITICAL',
          causeCode: 'TECHNICAL_STATUS_STALE',
          field: 'technicalStatus.openDiscrepancyCount',
        },
      ],
      countsByCategory: categories,
      countsBySeverity: severities,
      causeCodes: ['SOURCE_CONFLICT', 'TECHNICAL_STATUS_STALE'],
      affectedFields: ['legs.0.personsOnBoard', 'technicalStatus.openDiscrepancyCount'],
      metrics: {
        comparisonFieldCount: 20,
        matchingFieldCount: 18,
        divergenceCount: 2,
        completenessFindingCount: 1,
        projectionFindingCount: 0,
        unknownFieldCount: 0,
      },
      readiness: {
        score: 42,
        status: 'not_ready',
        fieldAgreementPercent: 90,
        completenessPercent: 95,
      },
      evidence: { fingerprint: 'fingerprint-secret' },
    },
    technicalStatusShadow: {
      schemaVersion: 'edb.technical-status.shadow.v1',
      technicalStatusId: 'technical-secret-id',
      tenantId: 6,
      createdAt: '2026-08-02T16:00:00.000Z',
      officialEffect: 'NONE',
      statusAssertions: [
        {
          assertionId: 'assertion-secret-id',
          informationState: 'IMPORTED',
          status: 'RESTRICTED',
          source: {
            kind: 'MAINTENANCE_SYSTEM',
            reference: 'source-secret-reference',
          },
          evidenceReferences: ['evidence-secret'],
        },
      ],
      lastIntervention: {
        reference: 'last-secret-reference',
        description: 'Inspeção declarada em shadow',
        occurredAt: '2026-08-01T12:00:00.000Z',
        informationState: 'DECLARED',
        source: { kind: 'AIRTRUST_MANUAL', reference: 'source-secret-reference' },
        evidenceReferences: ['evidence-secret'],
      },
      nextIntervention: {
        reference: 'next-secret-reference',
        description: 'Próxima inspeção declarada',
        remainingLimits: [{ value: 12, unit: 'HOURS' }],
        informationState: 'DECLARED',
        source: { kind: 'AIRTRUST_MANUAL', reference: 'source-secret-reference' },
        evidenceReferences: ['evidence-secret'],
      },
      discrepancies: [
        {
          discrepancyId: 'discrepancy-secret-id',
          status: 'OPEN',
          events: [
            {
              eventId: 'event-secret-id',
              sequence: 1,
              eventType: 'DISCREPANCY_DECLARED',
              recordedAt: '2026-08-02T15:30:00.000Z',
              supersedesEventId: null,
              informationState: 'DECLARED',
              description: 'Vibração declarada para revisão',
              systemCode: 'ATA-65',
              correctiveAction: null,
              deferredItem: null,
              maintenanceAct: null,
              returnToService: null,
              futureSignature: {
                state: 'PENDING_FUTURE_OFFICIAL_ACT',
                purpose: 'DISCREPANCY_RECORD',
              },
              source: { kind: 'AIRTRUST_MANUAL', reference: 'source-secret-reference' },
              evidenceReferences: ['evidence-secret'],
            },
            {
              eventId: 'event-secret-id-2',
              sequence: 2,
              eventType: 'RETURN_TO_SERVICE_DECLARED',
              recordedAt: '2026-08-02T16:00:00.000Z',
              supersedesEventId: null,
              informationState: 'DECLARED',
              description: 'Acompanhamento declarado em shadow',
              systemCode: 'ATA-65',
              correctiveAction: {
                description: 'Substituição declarada',
                declaredAt: '2026-08-02T15:50:00.000Z',
                reference: 'corrective-secret-reference',
              },
              deferredItem: {
                authorizationReference: 'deferred-secret-reference',
                reason: 'Acompanhamento por limite declarado',
                dueAt: '2026-08-03T12:00:00.000Z',
                remainingLimits: [{ value: 3, unit: 'CYCLES' }],
              },
              maintenanceAct: {
                kind: 'DECLARED_SHADOW',
                occurredAt: '2026-08-02T15:55:00.000Z',
                organization: null,
                person: null,
              },
              returnToService: {
                state: 'DECLARED_SHADOW',
                reference: 'rts-secret-reference',
                officialEffect: 'NONE',
                maintenanceAct: null,
                futureSignature: {
                  state: 'PENDING_FUTURE_OFFICIAL_ACT',
                  purpose: 'RETURN_TO_SERVICE',
                },
              },
              futureSignature: {
                state: 'PENDING_FUTURE_OFFICIAL_ACT',
                purpose: 'RETURN_TO_SERVICE',
              },
              source: { kind: 'AIRTRUST_MANUAL', reference: 'source-secret-reference' },
              evidenceReferences: ['evidence-secret'],
            },
          ],
        },
      ],
      picAwareness: {
        state: 'PENDING',
        declaredAt: null,
        personReference: 'pic-secret-reference',
        evidenceReferences: ['evidence-secret'],
        futureSignature: {
          state: 'PENDING_FUTURE_OFFICIAL_ACT',
          purpose: 'PIC_AWARENESS',
        },
      },
    },
    technicalStatusFindings: [
      {
        code: 'TECHNICAL_PIC_AWARENESS_PENDING',
        severity: 'HIGH',
        path: 'picAwareness.state',
      },
    ],
  };
}

describe('EdbShadowAnalysisPanels', () => {
  it('exibe métricas agregadas, prontidão e situação técnica sem identificadores internos', () => {
    render(<EdbShadowAnalysisPanels rawPreviewData={validAnalysisPayload()} />);

    expect(screen.getByText('Interromper revisão shadow')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('Valor divergente: 1')).toBeInTheDocument();
    expect(screen.getByText('Situação técnica divergente: 1')).toBeInTheDocument();
    expect(screen.getByText('technicalStatus.openDiscrepancyCount')).toBeInTheDocument();
    expect(screen.getByText('RESTRICTED')).toBeInTheDocument();
    expect(screen.getByText('Acompanhamento declarado em shadow')).toBeInTheDocument();
    expect(screen.getByText('Ação corretiva: Substituição declarada')).toBeInTheDocument();
    expect(
      screen.getByText('Retorno ao serviço: DECLARED_SHADOW · efeito oficial: NENHUM'),
    ).toBeInTheDocument();
    expect(screen.getByText('TECHNICAL_PIC_AWARENESS_PENDING')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();

    const rendered = document.body.textContent || '';
    expect(rendered).not.toContain('fingerprint-secret');
    expect(rendered).not.toContain('discrepancy-secret-id');
    expect(rendered).not.toContain('assertion-secret-id');
    expect(rendered).not.toContain('source-secret-reference');
    expect(rendered).not.toContain('evidence-secret');
  });

  it('não presume análise quando o backend ainda não fornece os contratos opcionais', () => {
    render(<EdbShadowAnalysisPanels rawPreviewData={{}} />);

    expect(
      screen.getByText(/backend ainda não forneceu uma análise de divergências e prontidão/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/backend ainda não forneceu uma situação técnica shadow detalhada/i),
    ).toBeInTheDocument();
  });

  it('falha fechado quando um contrato opcional é incompatível', () => {
    render(
      <EdbShadowAnalysisPanels
        rawPreviewData={{
          shadowDivergence: { schemaVersion: 'edb.shadow-divergence.v0' },
          technicalStatusShadow: { schemaVersion: 'edb.technical-status.shadow.v0' },
          technicalStatusFindings: [{ code: 'INVALID', severity: 'HIGH', path: 'unsafe path' }],
        }}
      />,
    );

    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(screen.getByText(/análise de divergências.*não corresponde/i)).toBeInTheDocument();
    expect(screen.getByText(/situação técnica shadow.*não corresponde/i)).toBeInTheDocument();
    expect(screen.getByText(/achados técnicos sanitizados.*não corresponde/i)).toBeInTheDocument();
  });
});
