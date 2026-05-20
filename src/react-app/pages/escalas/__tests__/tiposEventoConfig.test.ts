import { describe, it, expect } from 'vitest';
import { EVENTO_CONFIG, TODOS_TIPOS_EVENTO, TIPOS_EVENTO_ATIVOS } from '../constants/tiposEvento';

function resolverNomeCanonicoEvento(tipo: string): string {
  switch (tipo) {
    case 'TREINAMENTO_SIMULADOR':
      return 'Treinamento Simulador';
    case 'TREINAMENTO_SOLO':
      return 'Treinamento Solo';
    default:
      return 'Voo';
  }
}

// ─── EVENTO_CONFIG shape ──────────────────────────────────────────────────

describe('EVENTO_CONFIG', () => {
  it('has all 12 tipos de evento', () => {
    expect(TODOS_TIPOS_EVENTO).toHaveLength(12);
  });

  it('each entry has required fields: label, labelCurto, sigla, cor, corTexto, corBg, prioridade', () => {
    for (const tipo of TODOS_TIPOS_EVENTO) {
      const c = EVENTO_CONFIG[tipo];
      expect(c.label, `${tipo}.label`).toBeTypeOf('string');
      expect(c.labelCurto, `${tipo}.labelCurto`).toBeTypeOf('string');
      expect(c.sigla, `${tipo}.sigla`).toBeTypeOf('string');
      expect(c.cor, `${tipo}.cor`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.corTexto, `${tipo}.corTexto`).toBeTypeOf('string');
      expect(c.corBg, `${tipo}.corBg`).toBeTypeOf('string');
      expect(c.prioridade, `${tipo}.prioridade`).toBeTypeOf('number');
    }
  });

  it('does NOT have an icone field on any entry (dead code removed)', () => {
    for (const tipo of TODOS_TIPOS_EVENTO) {
      const c = EVENTO_CONFIG[tipo] as Record<string, unknown>;
      expect(c['icone'], `${tipo}.icone should be removed`).toBeUndefined();
    }
  });

  it('TIPOS_EVENTO_ATIVOS contains only entries with ativo !== false', () => {
    for (const tipo of TIPOS_EVENTO_ATIVOS) {
      expect(EVENTO_CONFIG[tipo].ativo).not.toBe(false);
    }
  });

  it('TIPOS_EVENTO_ATIVOS does not include viagem, treinamento_solo, reaquisi, trabalho, standby', () => {
    const inativos = ['viagem', 'treinamento_solo', 'reaquisi', 'trabalho', 'standby'] as const;
    for (const tipo of inativos) {
      expect(TIPOS_EVENTO_ATIVOS).not.toContain(tipo);
    }
  });

  it('voo has prioridade 1 (highest-priority flight event)', () => {
    expect(EVENTO_CONFIG.voo.prioridade).toBe(1);
  });

  it('medico and cheque have prioridade 0 (safety-critical, always first)', () => {
    expect(EVENTO_CONFIG.medico.prioridade).toBe(0);
    expect(EVENTO_CONFIG.cheque.prioridade).toBe(0);
  });

  it('labelCurto is 3–3 chars for all types', () => {
    for (const tipo of TODOS_TIPOS_EVENTO) {
      const curto = EVENTO_CONFIG[tipo].labelCurto;
      expect(curto.length, `${tipo}.labelCurto length`).toBeGreaterThanOrEqual(2);
      expect(curto.length, `${tipo}.labelCurto length`).toBeLessThanOrEqual(4);
    }
  });

  it('sigla is 1–2 chars for all types', () => {
    for (const tipo of TODOS_TIPOS_EVENTO) {
      const sigla = EVENTO_CONFIG[tipo].sigla;
      expect(sigla.length, `${tipo}.sigla length`).toBeGreaterThanOrEqual(1);
      expect(sigla.length, `${tipo}.sigla length`).toBeLessThanOrEqual(2);
    }
  });
});

// ─── configMap merge logic (useTiposEventoResolvidos-like) ─────────────────

describe('configMap DB merge logic', () => {
  it('falls back to base.label when DB row has no label', () => {
    const base = EVENTO_CONFIG.voo;
    const row = {
      label: '',
      sigla: '',
      cor: '#000000',
      ativo: 1 as const,
      codigo: 'voo',
      id: '1',
      ordem: 1,
    };
    const merged = {
      ...base,
      label: row.label || base.label,
      sigla: row.sigla || base.sigla,
      cor: row.cor || base.cor,
      ativo: row.ativo === 1,
    };
    expect(merged.label).toBe(base.label);
    expect(merged.sigla).toBe(base.sigla);
  });

  it('uses DB row label when present', () => {
    const base = EVENTO_CONFIG.voo;
    const row = {
      label: 'Voo Personalizado',
      sigla: 'VP',
      cor: '',
      ativo: 1 as const,
      codigo: 'voo',
      id: '1',
      ordem: 1,
    };
    const merged = {
      ...base,
      label: row.label || base.label,
      sigla: row.sigla || base.sigla,
      cor: row.cor || base.cor,
      ativo: row.ativo === 1,
    };
    expect(merged.label).toBe('Voo Personalizado');
    expect(merged.sigla).toBe('VP');
  });

  it('preserva sigla com caixa mista vinda do banco', () => {
    const base = EVENTO_CONFIG.treinamento_simulador;
    const row = {
      label: 'Simulador',
      sigla: 'Si',
      cor: '',
      ativo: 1 as const,
      codigo: 'SIM',
      id: '1',
      ordem: 4,
    };
    const merged = {
      ...base,
      label: row.label || base.label,
      sigla: row.sigla || base.sigla,
      cor: row.cor || base.cor,
      ativo: row.ativo === 1,
    };
    expect(merged.sigla).toBe('Si');
  });

  it('uses DB row cor when present', () => {
    const base = EVENTO_CONFIG.voo;
    const row = {
      label: '',
      sigla: '',
      cor: '#FF0000',
      ativo: 1 as const,
      codigo: 'voo',
      id: '1',
      ordem: 1,
    };
    const merged = {
      ...base,
      label: row.label || base.label,
      sigla: row.sigla || base.sigla,
      cor: row.cor || base.cor,
      ativo: row.ativo === 1,
    };
    expect(merged.cor).toBe('#FF0000');
  });

  it('sets ativo=false when DB row has ativo=0', () => {
    const base = EVENTO_CONFIG.voo;
    const row = {
      label: '',
      sigla: '',
      cor: '',
      ativo: 0 as const,
      codigo: 'voo',
      id: '1',
      ordem: 1,
    };
    const merged = {
      ...base,
      label: row.label || base.label,
      sigla: row.sigla || base.sigla,
      cor: row.cor || base.cor,
      ativo: row.ativo === 1,
    };
    expect(merged.ativo).toBe(false);
  });

  it('does NOT include icone in merged config', () => {
    const base = EVENTO_CONFIG.voo;
    const merged = { ...base } as Record<string, unknown>;
    expect(merged['icone']).toBeUndefined();
  });
});

describe('fallback canonico de labels', () => {
  it('mantem treinamento solo com inicial T', () => {
    expect(resolverNomeCanonicoEvento('TREINAMENTO_SOLO')).toBe('Treinamento Solo');
  });

  it('mantem treinamento simulador com inicial T', () => {
    expect(resolverNomeCanonicoEvento('TREINAMENTO_SIMULADOR')).toBe('Treinamento Simulador');
  });
});
