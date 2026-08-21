import { describe, it, expect } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { FrmsCoordQueuePanel } from '../components/FrmsCoordQueuePanel';
import type { FrmsOperationalSnapshotItem } from '../../../../hooks/useFrmsOperationalSnapshot';
import { MemoryRouter } from 'react-router-dom';

const createMockItem = (
  id: number,
  estado: FrmsOperationalSnapshotItem['estado_operacional'],
  nome: string,
  motivos: string[] = []
): FrmsOperationalSnapshotItem => ({
  empresa_id: 1,
  data_operacional: '2026-08-21',
  funcionario_id: id,
  tripulante_id: id,
  nome,
  nome_guerra: nome.split(' ')[0],
  funcao: 'PILOTO',
  base: 'SBJR',
  aeronave: 'PR-XXX',
  escalado: true,
  escala_source: 'EVD',
  hora_apresentacao: '08:00',
  hora_termino: '12:00',
  horas_voo_minutos: 120,
  duracao_jornada_minutos: 240,
  teve_jornada: true,
  checkin_status: 'RECEBIDO',
  checkin_horario: '07:30',
  kss_score: 3,
  horas_sono: 8,
  qualidade_sono: 4,
  hora_acordar: '06:30',
  fadiga_score: 1,
  status_operacional_checkin: 'APTO',
  effectiveness_pct: 95,
  nivel_fadiga_calculado: 'NORMAL',
  fatorizacao_status: 'CALCULADA',
  sleep_data_source: 'REAL',
  wake_data_source: 'REAL',
  jornada_data_source: 'REAL',
  jornada_origem: 'SIGVOOS',
  snapshot_status: 'OK',
  fortnight_indicator: null,
  alertas: [],
  estado_operacional: estado,
  motivos_principais: motivos,
  acao_recomendada_texto: 'Teste Ação',
});

describe('FrmsCoordQueuePanel', () => {
  it('renderiza loading state', () => {
    render(
      <MemoryRouter>
        <FrmsCoordQueuePanel items={[]} loading={true} />
      </MemoryRouter>
    );
    expect(screen.getByText('Sincronizando fila da coordenação...')).toBeInTheDocument();
  });

  it('renderiza empty state quando não há itens', () => {
    render(
      <MemoryRouter>
        <FrmsCoordQueuePanel items={[]} loading={false} />
      </MemoryRouter>
    );
    
    // O painel fica fechado por padrão quando não há itens críticos.
    // Expande para ver o empty state.
    const button = screen.getByRole('button', { name: /Atenção da Coordenação/i });
    fireEvent.click(button);

    expect(screen.getByText('Nenhuma jornada operacional localizada no recorte atual.')).toBeInTheDocument();
  });

  it('ordena itens por severidade e exibe badges', () => {
    const items = [
      createMockItem(1, 'NORMAL', 'Comandante Alpha'),
      createMockItem(2, 'CRITICO_VIOLACAO', 'Copiloto Beta', ['Limite excedido']),
      createMockItem(3, 'ATENCAO', 'Piloto Gama'),
      createMockItem(4, 'MITIGACAO_NECESSARIA', 'Piloto Delta', ['Fadiga crônica']),
    ];

    render(
      <MemoryRouter>
        <FrmsCoordQueuePanel items={items} loading={false} />
      </MemoryRouter>
    );

    // Como tem item acionável, o painel expande por padrão.
    // Vamos checar a ordem usando getAllByRole ou list items se tivéssemos feito uma lista,
    // mas podemos checar os nomes que devem aparecer.
    const names = screen.getAllByText(/Comandante Alpha|Copiloto Beta|Piloto Gama|Piloto Delta/);
    
    // Ordem esperada: CRITICO_VIOLACAO -> MITIGACAO_NECESSARIA -> ATENCAO -> NORMAL
    expect(names[0].textContent).toBe('Copiloto Beta');
    expect(names[1].textContent).toBe('Piloto Delta');
    expect(names[2].textContent).toBe('Piloto Gama');
    expect(names[3].textContent).toBe('Comandante Alpha');
  });

  it('exibe motivos principais', () => {
    const items = [
      createMockItem(1, 'MITIGACAO_NECESSARIA', 'Piloto Delta', ['Fadiga crônica', 'Efetividade baixa']),
    ];

    render(
      <MemoryRouter>
        <FrmsCoordQueuePanel items={items} loading={false} />
      </MemoryRouter>
    );

    expect(screen.getByText('Fadiga crônica')).toBeInTheDocument();
    expect(screen.getByText('Efetividade baixa')).toBeInTheDocument();
  });
});
