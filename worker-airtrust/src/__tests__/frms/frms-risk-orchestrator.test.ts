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
});
