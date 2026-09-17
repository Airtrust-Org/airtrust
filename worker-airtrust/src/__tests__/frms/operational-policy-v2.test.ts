import { describe, expect, it } from 'vitest';
import {
  computeFlightHoursDelta, computeImcDelta, computeLandingsDeltaPoints,
  computeRecoveryCredit, computeTemperatureDeltaPoints, resolveOperationalPolicyV2,
} from '../../lib/frms/operational-policy-v2';

const values: Record<string, number> = {
  FRMS_V2_ENABLED:1, LANDINGS_NEUTRAL_MAX:8, LANDINGS_PENALTY_PER_EXCESS:.5, LANDINGS_PENALTY_CAP_POINTS:4,
  TEMP_BAND1_MIN_C:30,TEMP_BAND2_MIN_C:32,TEMP_BAND3_MIN_C:34,TEMP_BAND4_MIN_C:36,
  TEMP_BAND1_DELTA_POINTS:-.5,TEMP_BAND2_DELTA_POINTS:-1,TEMP_BAND3_DELTA_POINTS:-1.5,TEMP_BAND4_DELTA_POINTS:-2,TEMP_PENALTY_CAP_POINTS:2,
  IMC_VISIBILITY_THRESHOLD_M:5000,IMC_CEILING_THRESHOLD_FT:1500,IMC_DEPARTURE_DELTA_POINTS:-.5,IMC_ARRIVAL_DELTA_POINTS:-.75,IMC_LEG_CAP_POINTS:1,IMC_DAY_CAP_POINTS:3,
  RECOVERY_HOTEL_MAX_POINTS:4,RECOVERY_ONSITE_MAX_POINTS:1.5,RECOVERY_IMMEDIATE_CALLOUT_MULTIPLIER:.75,RECOVERY_NO_WORK_MIN_HOURS:12,
  RECOVERY_ABSOLUTE_REST_MIN_HOURS:4,RECOVERY_ABSOLUTE_REST_MID_HOURS:6,RECOVERY_ABSOLUTE_REST_FULL_HOURS:8,RECOVERY_ABSOLUTE_REST_LOW_FACTOR:.5,RECOVERY_ABSOLUTE_REST_MID_FACTOR:.75,
  HV_CREDIT_THRESHOLD_MINUTES:120,HV_CREDIT_MAX_POINTS:2,HV_NEUTRAL_MAX_MINUTES:420,HV_PENALTY_PER_EXCESS_HOUR_POINTS:2,HV_PENALTY_CAP_POINTS:4,
  PRESENTATION_NIGHT_START_HOUR:22,PRESENTATION_NIGHT_END_HOUR:2,PRESENTATION_NIGHT_DELTA_POINTS:-.5,
  ACCUMULATION_WINDOW_MODE:0,ACCUMULATION_USE_MONTH_CALENDAR:1,ACCUMULATION_USE_YEAR_CALENDAR:1,ACCUMULATION_USE_28D_ROLLING:0,ACCUMULATION_USE_365D_ROLLING:0,
};
const p = resolveOperationalPolicyV2(values);

describe('FRMS Operational Policy V2', () => {
  it.each([[8,0],[9,-.5],[10,-1],[12,-2],[16,-4],[20,-4]])('landings %i => %f', (n,d)=>expect(computeLandingsDeltaPoints(n,p)).toBe(d));
  it.each([[29.9,0],[30,-.5],[32,-1],[34,-1.5],[36,-2],[45,-2]])('temperature %f => %f', (t,d)=>expect(computeTemperatureDeltaPoints(t,p)).toBe(d));
  it('classifies IMC from METAR visibility/ceiling and caps per leg/day', () => {
    const metar = 'METAR SBME 171200Z 09010KT 3000 RA BKN008 24/22 Q1012=';
    const result = computeImcDelta(Array.from({length:4},(_,i)=>({legId:String(i),departureRawMetar:metar,arrivalRawMetar:metar})),p);
    expect(result.legs[0].departure.condition).toBe('IMC');
    expect(result.legs[0].arrival.condition).toBe('IMC');
    expect(result.legs[0].totalDelta).toBe(-1);
    expect(result.totalDelta).toBe(-3);
  });
  it('does not infer VMC when METAR is missing', () => expect(computeImcDelta([{legId:'1'}],p).legs[0].departure.condition).toBe('INDETERMINATE'));
  it('credits hotel/base on the first eligible day and never OFF_DUTY', () => {
    expect(computeRecoveryCredit({activityType:'STANDBY_HOME_HOTEL',absoluteRestHours:8,noWorkHours:12},p).creditPoints).toBe(4);
    expect(computeRecoveryCredit({activityType:'STANDBY_ONSITE',absoluteRestHours:8,noWorkHours:12},p).creditPoints).toBe(1.5);
    expect(computeRecoveryCredit({activityType:'STANDBY_HOME_HOTEL',absoluteRestHours:8,noWorkHours:12,immediateCalloutRequired:true},p).creditPoints).toBe(3);
    expect(computeRecoveryCredit({activityType:'OFF_DUTY',absoluteRestHours:8,noWorkHours:24},p).creditPoints).toBe(0);
  });
  it('generates D+1 HV credit and applies it only against HV penalty', () => {
    expect(computeFlightHoursDelta(0,0,p).generatedCreditForNextDayPoints).toBe(2);
    expect(computeFlightHoursDelta(60,0,p).generatedCreditForNextDayPoints).toBe(1);
    expect(computeFlightHoursDelta(420,0,p).netDeltaPoints).toBe(0);
    expect(computeFlightHoursDelta(480,0,p).netDeltaPoints).toBe(-2);
    expect(computeFlightHoursDelta(480,1,p).netDeltaPoints).toBe(-1);
    expect(computeFlightHoursDelta(540,0,p).netDeltaPoints).toBe(-4);
  });
});
