import { describe, expect, it } from 'vitest';
import { orchestrateFrmsRisk } from '../../lib/frms/frms-risk-orchestrator';

const operationalBase = {
  sectorCount: 2, landingCount: 2, takeoffCount: 2, offshoreSectorCount: 0, offshoreShuttleSectorCount: 0,
  shortSectorCount: 0, shortOffshoreSectorCount: 0, shortOffshoreShuttleSectorCount: 0,
  averageSectorAirborneMin: 45, medianSectorAirborneMin: 45, maxLandingsRolling60Min: 2,
  maxLandingRatePerHour: 2, continuousShuttleBlockMaxMin: null, verifiedBreakAwayMaxMin: null,
  cap371PolicyTriggered: false, cap371BreakRequired: false, cap371BreakSatisfied: null,
  operationalDemandIndex: 29, level: 'LOW' as const, dataQuality: 'COMPLETE' as const, alerts: [], notes: [],
};
const environmentalBase = {
  level: 'NORMAL' as const, maxAmbientTempC: 25, minAmbientTempC: 25, maxRelativeHumidityPct: 70,
  maxWindSpeedKt: 5, maxHeatIndexC: null, minWindChillC: null, wbgtC: null,
  wbgtKind: 'UNAVAILABLE' as const, wbgtThresholdC: null, wbgtThresholdKind: 'UNAVAILABLE' as const,
  exposedMinutes: null, climateControlled: null, dataQuality: 'COMPLETE' as const, alerts: [], notes: [],
};

describe('FRMS risk orchestration', () => {
  it('never lets a good biological score compensate a legal violation', () => {
    const result = orchestrateFrmsRisk({
      compliance: [{ status: 'VIOLATION', actualMin: 500, resolved: null }], regulatoryProfileReady: true,
      biologicalLevel: 'NORMAL', operational: operationalBase, environmental: environmentalBase,
    });
    expect(result.overallLevel).toBe('VIOLATION');
    expect(result.automaticApprovalAllowed).toBe(false);
  });

  it('escalates high operational + high environment to critical', () => {
    const result = orchestrateFrmsRisk({
      compliance: [{ status: 'COMPLIANT', actualMin: 100, resolved: null }], regulatoryProfileReady: true,
      biologicalLevel: 'NORMAL',
      operational: { ...operationalBase, level: 'HIGH', operationalDemandIndex: 80 },
      environmental: { ...environmentalBase, level: 'HIGH' },
    });
    expect(result.overallLevel).toBe('CRITICAL');
    expect(result.alerts).toContain('OPERATIONAL_ENVIRONMENT_INTERACTION');
  });

  it('fails closed when regulatory profile is not documented', () => {
    const result = orchestrateFrmsRisk({
      compliance: [], regulatoryProfileReady: false, biologicalLevel: 'NORMAL', operational: operationalBase,
      environmental: environmentalBase,
    });
    expect(result.automaticApprovalAllowed).toBe(false);
    expect(result.alerts).toContain('PERFIL_REGULATORIO_NAO_CONFIGURADO');
  });

  const baseline = {
    compliance: [{ status: 'COMPLIANT' as const, actualMin: 60, resolved: null }],
    regulatoryProfileReady: true,
    biologicalLevel: 'NORMAL' as const,
    operational: operationalBase,
    environmental: environmentalBase,
  };

  it('requires evaluated rules, not merely a configured profile', () => {
    const result = orchestrateFrmsRisk({ ...baseline, compliance: [] });
    expect(result.complianceLevel).toBe('UNKNOWN');
    expect(result.overallLevel).toBe('UNKNOWN');
    expect(result.automaticApprovalAllowed).toBe(false);
    expect(result.alerts).toContain('REGULATORY_EVALUATIONS_MISSING');
  });

  it('fails closed if biological, operational or environmental evidence is unknown', () => {
    const unknowns = [
      { biologicalLevel: 'UNKNOWN' as const },
      { operational: { ...operationalBase, level: 'UNKNOWN' as const } },
      { environmental: { ...environmentalBase, level: 'UNKNOWN' as const } },
    ];
    for (const partial of unknowns) {
      const result = orchestrateFrmsRisk({ ...baseline, ...partial });
      expect(result.overallLevel).toBe('UNKNOWN');
      expect(result.automaticApprovalAllowed).toBe(false);
    }
  });

  it('preserves known high risk instead of masking it behind unknown evidence', () => {
    const result = orchestrateFrmsRisk({
      ...baseline, biologicalLevel: 'UNKNOWN',
      operational: { ...operationalBase, level: 'HIGH' },
    });
    expect(result.overallLevel).toBe('HIGH');
    expect(result.automaticApprovalAllowed).toBe(false);
    expect(result.alerts).toContain('BIOLOGICAL_EVIDENCE_MISSING');
  });

  it('requires complete source quality, preserving the complete-evidence path', () => {
    expect(orchestrateFrmsRisk(baseline).automaticApprovalAllowed).toBe(true);
    const partial = orchestrateFrmsRisk({
      ...baseline, environmental: { ...environmentalBase, dataQuality: 'PARTIAL' },
    });
    expect(partial.automaticApprovalAllowed).toBe(false);
    expect(partial.alerts).toContain('ENVIRONMENTAL_DATA_LOW_CONFIDENCE');
  });

  it('never allows automatic approval for elevated or high observed risk', () => {
    for (const level of ['MODERATE', 'HIGH'] as const) {
      const result = orchestrateFrmsRisk({
        ...baseline, operational: { ...operationalBase, level },
      });
      expect(result.overallLevel).toBe(level === 'MODERATE' ? 'ELEVATED' : 'HIGH');
      expect(result.automaticApprovalAllowed).toBe(false);
    }
  });
});
