import { describe, it, expect } from 'vitest';
import { parseFira } from '../../lib/frms/fira-parser';

const DOW = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

function montarFiraCompacta(opts?: {
  totalJornada?: string;
  totalVoo?: string;
  diaComMovimento?: number;
}) {
  const totalJornada = opts?.totalJornada ?? '31:30';
  const totalVoo = opts?.totalVoo ?? '17:13';
  const diaComMovimento = opts?.diaComMovimento;

  const dias: string[] = [];
  for (let i = 1; i <= 28; i++) {
    const dd = String(i).padStart(2, '0');
    const dow = DOW[(i - 1) % DOW.length];

    if (diaComMovimento && i === diaComMovimento) {
      dias.push(`${dd} ${dow} ES SBME 06:00 08:00 2:00 1:30`);
      continue;
    }

    dias.push(`${dd} ${dow} - - - - - -`);
  }

  return [
    'COSTA DO SOL TÁXI AÉREO 11.223.764/0001-62 Ano 2026 Mês FEVEREIRO Base Contratual',
    `CAIO CESAR SIMOES DE ALCANTARA 144338 TRIPULANTE RIO DE JANEIRO Dia ${dias.join(' ')} ${totalJornada} ${totalVoo} Totais do Mês`,
  ].join('\n');
}

describe('parseFira (modo compacto)', () => {
  it('normaliza totais para 0:00 quando não há movimento operacional', () => {
    const texto = montarFiraCompacta({ totalJornada: '31:30', totalVoo: '17:13' });
    const result = parseFira(texto);

    expect(result.cabecalho.canac).toBe('144338');
    expect(result.dias).toHaveLength(28);
    expect(result.totalJornadaMes).toBe('0:00');
    expect(result.totalVooMes).toBe('0:00');
    expect(result.erros.some((e) => e.includes('Divergência nos totais de HV'))).toBe(false);
  });

  it('mantém totais declarados quando existe movimento operacional real', () => {
    const texto = montarFiraCompacta({
      totalJornada: '2:00',
      totalVoo: '1:30',
      diaComMovimento: 3,
    });
    const result = parseFira(texto);

    expect(result.totalJornadaMes).toBe('2:00');
    expect(result.totalVooMes).toBe('1:30');
    expect(result.erros.some((e) => e.includes('Divergência nos totais de HV'))).toBe(false);
  });
});

describe('parseFira (extração CANAC/ANAC robusta)', () => {
  it('extrai CANAC quando vem com label e pontuação na mesma linha do TRIPULANTE', () => {
    const texto = [
      'COSTA DO SOL TÁXI AÉREO',
      'Ano',
      '2026',
      'Mês',
      'FEVEREIRO',
      'CAIO CESAR SIMOES DE ALCANTARA CANAC: 95.168-1 TRIPULANTE',
      'Local',
      '-',
      'Totais do Mês:',
      '0:00',
      '0:00',
    ].join('\n');

    const result = parseFira(texto);

    expect(result.cabecalho.canac).toBe('951681');
    expect(result.cabecalho.mes).toBe(2);
    expect(result.cabecalho.ano).toBe(2026);
  });

  it('nao confunde o rodape 02/08/2021 com o mes ABRIL do cabecalho', () => {
    const texto = [
      'COSTA DO SOL TÁXI AÉREO 11.223.764/0001-62',
      'Ano 2026',
      'Mês ABRIL',
      'DIETER JOHNY KÜHR 108495 TRIPULANTE',
      'RIO DE JANEIRO',
      'Totais do Mês:',
      '86:46',
      '55:47',
      'Data de Revisão: 02/08/2021',
    ].join('\n');

    const result = parseFira(texto);

    expect(result.cabecalho.mes).toBe(4);
    expect(result.cabecalho.mesNome).toBe('ABRIL');
    expect(result.cabecalho.ano).toBe(2026);
  });
});
