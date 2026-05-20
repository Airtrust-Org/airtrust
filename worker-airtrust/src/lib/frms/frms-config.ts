import type { LimitesMap } from './types';

export interface FrmsConfig {
  minutosAntesApresentacao: number;
  horasSonoPadrao: number;
}

export const FRMS_CONFIG_DEFAULTS: FrmsConfig = {
  minutosAntesApresentacao: 90,
  horasSonoPadrao: 8,
};

export function resolverFrmsConfig(limites?: Partial<LimitesMap> | null): FrmsConfig {
  const minutosAntesApresentacao = Number(
    limites?.MINUTOS_ANTES_APRESENTACAO ?? FRMS_CONFIG_DEFAULTS.minutosAntesApresentacao,
  );
  const horasSonoPadrao = Number(
    limites?.HORAS_SONO_PADRAO ?? FRMS_CONFIG_DEFAULTS.horasSonoPadrao,
  );

  return {
    minutosAntesApresentacao:
      Number.isFinite(minutosAntesApresentacao) && minutosAntesApresentacao > 0
        ? minutosAntesApresentacao
        : FRMS_CONFIG_DEFAULTS.minutosAntesApresentacao,
    horasSonoPadrao:
      Number.isFinite(horasSonoPadrao) && horasSonoPadrao > 0
        ? horasSonoPadrao
        : FRMS_CONFIG_DEFAULTS.horasSonoPadrao,
  };
}
