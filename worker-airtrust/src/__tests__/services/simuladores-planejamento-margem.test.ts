import { describe, it, expect } from 'vitest';

function resolveMargemDias(
  dbConfigValue: number | null | undefined,
  requestPayloadValue: string | number | null | undefined
): number {
  const defaultMargem = dbConfigValue ?? 90;
  let margemDias = defaultMargem;
  
  if (requestPayloadValue !== undefined && requestPayloadValue !== null && requestPayloadValue !== '') {
    margemDias = Number(requestPayloadValue);
  }
  
  return margemDias;
}

describe('Simuladores Planejamento Configuração de Antecedência', () => {
  it('1. Empresa sem configuração (null/undefined): usa 90 dias (fallback seguro)', () => {
    expect(resolveMargemDias(null, undefined)).toBe(90);
    expect(resolveMargemDias(undefined, undefined)).toBe(90);
  });

  it('2. Empresa configurada: usa valor configurado', () => {
    expect(resolveMargemDias(45, undefined)).toBe(45);
    expect(resolveMargemDias(120, undefined)).toBe(120);
  });

  it('3. Alteração de configuração muda a janela de planejamento (via payload overriden ou config alterada)', () => {
    // Config alterada
    expect(resolveMargemDias(60, undefined)).toBe(60);
    
    // Requisição explícita na API sobrepõe configuração da empresa
    expect(resolveMargemDias(45, 30)).toBe(30);
    expect(resolveMargemDias(90, '15')).toBe(15);
  });
});
