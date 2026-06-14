// ============================================================
// Controle de Voos — Dados Mockados para Protótipo
// TODOS os dados são fictícios e puramente demonstrativos.
// Nenhuma informação exibida é real.
// ============================================================

// ---- Aeroportos / Plataformas ----
export interface Aeroporto {
  id: string;
  codigoIcao: string;
  codigoIata: string;
  nome: string;
  cidade: string;
  uf: string;
  tipo: 'aeroporto' | 'plataforma' | 'heliponto';
}

export const MOCK_AEROPORTOS: Aeroporto[] = [
  { id: 'apt-001', codigoIcao: 'SBRJ', codigoIata: 'SDU', nome: 'Santos Dumont', cidade: 'Rio de Janeiro', uf: 'RJ', tipo: 'aeroporto' },
  { id: 'apt-002', codigoIcao: 'SBGL', codigoIata: 'GIG', nome: 'Galeão — Tom Jobim', cidade: 'Rio de Janeiro', uf: 'RJ', tipo: 'aeroporto' },
  { id: 'apt-003', codigoIcao: 'SBSP', codigoIata: 'CGH', nome: 'Congonhas', cidade: 'São Paulo', uf: 'SP', tipo: 'aeroporto' },
  { id: 'apt-004', codigoIcao: 'SBGR', codigoIata: 'GRU', nome: 'Guarulhos', cidade: 'São Paulo', uf: 'SP', tipo: 'aeroporto' },
  { id: 'apt-005', codigoIcao: 'SBBH', codigoIata: 'PLU', nome: 'Pampulha', cidade: 'Belo Horizonte', uf: 'MG', tipo: 'aeroporto' },
  { id: 'apt-006', codigoIcao: 'SBME', codigoIata: 'MEA', nome: 'Macaé', cidade: 'Macaé', uf: 'RJ', tipo: 'aeroporto' },
  { id: 'apt-007', codigoIcao: 'SBJR', codigoIata: 'NVT', nome: 'Navegantes', cidade: 'Navegantes', uf: 'SC', tipo: 'aeroporto' },
  { id: 'apt-008', codigoIcao: 'SBFZ', codigoIata: 'FOR', nome: 'Fortaleza', cidade: 'Fortaleza', uf: 'CE', tipo: 'aeroporto' },
  { id: 'apt-009', codigoIcao: 'SBRF', codigoIata: 'REC', nome: 'Recife', cidade: 'Recife', uf: 'PE', tipo: 'aeroporto' },
  { id: 'apt-010', codigoIcao: 'SBPL01', codigoIata: '', nome: 'Plataforma P-01 (Bacia de Campos)', cidade: 'Offshore — Bacia de Campos', uf: 'RJ', tipo: 'plataforma' },
  { id: 'apt-011', codigoIcao: 'SBPL02', codigoIata: '', nome: 'Plataforma P-02 (Bacia de Santos)', cidade: 'Offshore — Bacia de Santos', uf: 'SP', tipo: 'plataforma' },
  { id: 'apt-012', codigoIcao: 'SBPL03', codigoIata: '', nome: 'Plataforma P-03 (Bacia de Campos)', cidade: 'Offshore — Bacia de Campos', uf: 'RJ', tipo: 'plataforma' },
];

// ---- Tipos de Voo ----
export interface TipoVoo {
  id: string;
  nome: string;
  descricao: string;
}

export const MOCK_TIPOS_VOO: TipoVoo[] = [
  { id: 'tv-001', nome: 'Regular', descricao: 'Voo de linha regular' },
  { id: 'tv-002', nome: 'Charter', descricao: 'Voo fretado / não regular' },
  { id: 'tv-003', nome: 'Ferry', descricao: 'Voo de translado sem passageiros' },
  { id: 'tv-004', nome: 'Offshore', descricao: 'Voo para plataforma marítima' },
  { id: 'tv-005', nome: 'Carga', descricao: 'Voo exclusivo de carga' },
  { id: 'tv-006', nome: 'Ambulância', descricao: 'Voo de emergência médica' },
];

// ---- Naturezas de Voo ----
export interface NaturezaVoo {
  id: string;
  nome: string;
  descricao: string;
}

export const MOCK_NATUREZAS_VOO: NaturezaVoo[] = [
  { id: 'nv-001', nome: 'Passageiro', descricao: 'Transporte de passageiros' },
  { id: 'nv-002', nome: 'Carga', descricao: 'Transporte de carga' },
  { id: 'nv-003', nome: 'Misto', descricao: 'Transporte misto (pax + carga)' },
  { id: 'nv-004', nome: 'Ambulância', descricao: 'Remoção aeromédica' },
];

// ---- Grupos de Indisponibilidade ----
export interface GrupoIndisponibilidade {
  id: string;
  nome: string;
}

export const MOCK_GRUPOS_INDISPONIBILIDADE: GrupoIndisponibilidade[] = [
  { id: 'gi-001', nome: 'Manutenção Programada' },
  { id: 'gi-002', nome: 'Manutenção Corretiva' },
  { id: 'gi-003', nome: 'AOG (Aircraft on Ground)' },
  { id: 'gi-004', nome: 'Hangaragem' },
  { id: 'gi-005', nome: 'Condição Meteorológica' },
  { id: 'gi-006', nome: 'Administrativo / Documentação' },
];

// ---- Causas de Indisponibilidade ----
export interface CausaIndisponibilidade {
  id: string;
  nome: string;
  grupoId: string;
}

export const MOCK_CAUSAS_INDISPONIBILIDADE: CausaIndisponibilidade[] = [
  { id: 'ci-001', nome: 'Check A / B / C programado', grupoId: 'gi-001' },
  { id: 'ci-002', nome: 'Substituição de componente (vida limite)', grupoId: 'gi-001' },
  { id: 'ci-003', nome: 'Falha de motor', grupoId: 'gi-002' },
  { id: 'ci-004', nome: 'Falha de trem de pouso', grupoId: 'gi-002' },
  { id: 'ci-005', nome: 'Falha elétrica / aviônicos', grupoId: 'gi-002' },
  { id: 'ci-006', nome: 'Pane seca (AOG)', grupoId: 'gi-003' },
  { id: 'ci-007', nome: 'Hangaragem programada', grupoId: 'gi-004' },
  { id: 'ci-008', nome: 'Teto abaixo do mínimo', grupoId: 'gi-005' },
  { id: 'ci-009', nome: 'Documentação vencida', grupoId: 'gi-006' },
];

// ---- Aeronaves ----
export interface AeronaveOperacional {
  id: string;
  matricula: string;
  modelo: string;
  status: 'disponivel' | 'em_voo' | 'indisponivel' | 'hangarada';
  base: string;
}

export const MOCK_AERONAVES: AeronaveOperacional[] = [
  { id: 'aero-001', matricula: 'PR-ATX', modelo: 'ATR 72-600', status: 'disponivel', base: 'SBRJ' },
  { id: 'aero-002', matricula: 'PR-MTN', modelo: 'Embraer E195-E2', status: 'em_voo', base: 'SBSP' },
  { id: 'aero-003', matricula: 'PP-MRO', modelo: 'Cessna 208B Grand Caravan', status: 'indisponivel', base: 'SBME' },
  { id: 'aero-004', matricula: 'PT-FRM', modelo: 'Embraer E175', status: 'disponivel', base: 'SBGL' },
  { id: 'aero-005', matricula: 'PR-OPS', modelo: 'ATR 42-500', status: 'hangarada', base: 'SBRJ' },
];

// ---- Tripulantes (Funcionários fictícios) ----
export type FuncaoTripulante = 'PIC' | 'SIC' | 'COM' | 'MEC';

export interface Tripulante {
  id: string;
  nome: string;
  matricula: string;
  funcao: FuncaoTripulante;
  designacao: string;
  status: 'disponivel' | 'em_voo' | 'folga' | 'indisponivel';
  qualificacaoModelo: string[];
  cmaValidade: string;
  asoValidade: string;
  frmsScore: number; // 0-100, > 70 = atenção, > 85 = bloqueado
  frmsStatus: 'ok' | 'atencao' | 'bloqueado';
  horasMes: number;
}

export const MOCK_TRIPULANTES: Tripulante[] = [
  { id: 'trip-001', nome: 'Cmt. Ricardo Albuquerque', matricula: 'MAT-001', funcao: 'PIC', designacao: 'Comandante', status: 'disponivel', qualificacaoModelo: ['ATR 72', 'ATR 42'], cmaValidade: '2027-03-15', asoValidade: '2026-12-01', frmsScore: 32, frmsStatus: 'ok', horasMes: 42.5 },
  { id: 'trip-002', nome: 'Cmt. Ana Carolina Souza', matricula: 'MAT-002', funcao: 'PIC', designacao: 'Comandante', status: 'disponivel', qualificacaoModelo: ['E195-E2', 'E175'], cmaValidade: '2026-08-20', asoValidade: '2026-10-15', frmsScore: 68, frmsStatus: 'atencao', horasMes: 55.0 },
  { id: 'trip-003', nome: 'Cop. Marcelo Nogueira', matricula: 'MAT-003', funcao: 'SIC', designacao: 'Co-piloto', status: 'disponivel', qualificacaoModelo: ['ATR 72'], cmaValidade: '2027-01-10', asoValidade: '2026-09-20', frmsScore: 15, frmsStatus: 'ok', horasMes: 38.2 },
  { id: 'trip-004', nome: 'Cop. Juliana Martins', matricula: 'MAT-004', funcao: 'SIC', designacao: 'Co-piloto', status: 'em_voo', qualificacaoModelo: ['E195-E2'], cmaValidade: '2026-11-05', asoValidade: '2026-11-05', frmsScore: 45, frmsStatus: 'ok', horasMes: 48.0 },
  { id: 'trip-005', nome: 'Cop. Thiago Ferreira', matricula: 'MAT-005', funcao: 'SIC', designacao: 'Co-piloto', status: 'disponivel', qualificacaoModelo: ['C208B', 'ATR 42'], cmaValidade: '2026-06-20', asoValidade: '2026-06-20', frmsScore: 88, frmsStatus: 'bloqueado', horasMes: 60.0 },
  { id: 'trip-006', nome: 'Com. Patrícia Oliveira', matricula: 'MAT-006', funcao: 'COM', designacao: 'Comissária', status: 'disponivel', qualificacaoModelo: [], cmaValidade: '2027-05-01', asoValidade: '2026-08-30', frmsScore: 25, frmsStatus: 'ok', horasMes: 35.0 },
  { id: 'trip-007', nome: 'Com. Rafael Santos', matricula: 'MAT-007', funcao: 'COM', designacao: 'Comissário', status: 'disponivel', qualificacaoModelo: [], cmaValidade: '2026-09-12', asoValidade: '2026-07-18', frmsScore: 55, frmsStatus: 'ok', horasMes: 40.5 },
  { id: 'trip-008', nome: 'Mec. Carlos Eduardo Lima', matricula: 'MAT-008', funcao: 'MEC', designacao: 'Mecânico de Voo', status: 'disponivel', qualificacaoModelo: ['ATR 72', 'E195-E2', 'C208B'], cmaValidade: '2027-02-28', asoValidade: '2026-11-10', frmsScore: 10, frmsStatus: 'ok', horasMes: 30.0 },
];

// ---- Status de Voo ----
export type StatusVoo = 'planejado' | 'liberado' | 'em_voo' | 'pousado' | 'concluido' | 'cancelado';

// ---- Voos ----
export interface Voo {
  id: string;
  prefixo: string;
  origemId: string;
  destinoId: string;
  naturezaId: string;
  tipoId: string;
  aeronaveId: string;
  horarioPrevisto: string;
  horarioChegadaPrevisto: string;
  horarioRealPartida: string | null;
  horarioRealChegada: string | null;
  dataProgramacao: string;
  status: StatusVoo;
  observacoes: string;
}

export const MOCK_VOOS: Voo[] = [
  { id: 'voo-001', prefixo: 'ATX-2101', origemId: 'apt-001', destinoId: 'apt-003', naturezaId: 'nv-001', tipoId: 'tv-001', aeronaveId: 'aero-001', horarioPrevisto: '2026-06-13T06:30:00', horarioChegadaPrevisto: '2026-06-13T07:45:00', horarioRealPartida: '2026-06-13T06:38:00', horarioRealChegada: '2026-06-13T07:50:00', dataProgramacao: '2026-06-13', status: 'concluido', observacoes: '' },
  { id: 'voo-002', prefixo: 'ATX-2102', origemId: 'apt-003', destinoId: 'apt-001', naturezaId: 'nv-001', tipoId: 'tv-001', aeronaveId: 'aero-001', horarioPrevisto: '2026-06-13T08:30:00', horarioChegadaPrevisto: '2026-06-13T09:45:00', horarioRealPartida: '2026-06-13T08:32:00', horarioRealChegada: '2026-06-13T09:48:00', dataProgramacao: '2026-06-13', status: 'concluido', observacoes: '' },
  { id: 'voo-003', prefixo: 'MTN-3101', origemId: 'apt-003', destinoId: 'apt-004', naturezaId: 'nv-001', tipoId: 'tv-001', aeronaveId: 'aero-002', horarioPrevisto: '2026-06-13T09:00:00', horarioChegadaPrevisto: '2026-06-13T10:00:00', horarioRealPartida: '2026-06-13T09:05:00', horarioRealChegada: '2026-06-13T10:02:00', dataProgramacao: '2026-06-13', status: 'concluido', observacoes: '' },
  { id: 'voo-004', prefixo: 'MTN-3102', origemId: 'apt-004', destinoId: 'apt-008', naturezaId: 'nv-001', tipoId: 'tv-001', aeronaveId: 'aero-002', horarioPrevisto: '2026-06-13T11:00:00', horarioChegadaPrevisto: '2026-06-13T14:00:00', horarioRealPartida: '2026-06-13T11:10:00', horarioRealChegada: null, dataProgramacao: '2026-06-13', status: 'em_voo', observacoes: 'Atraso de 10 min por tráfego em GRU' },
  { id: 'voo-005', prefixo: 'ATX-2105', origemId: 'apt-001', destinoId: 'apt-010', naturezaId: 'nv-001', tipoId: 'tv-004', aeronaveId: 'aero-001', horarioPrevisto: '2026-06-13T14:00:00', horarioChegadaPrevisto: '2026-06-13T15:15:00', horarioRealPartida: null, horarioRealChegada: null, dataProgramacao: '2026-06-13', status: 'liberado', observacoes: 'Offshore P-01 — tripulação confirmada' },
  { id: 'voo-006', prefixo: 'MRO-5101', origemId: 'apt-006', destinoId: 'apt-011', naturezaId: 'nv-002', tipoId: 'tv-004', aeronaveId: 'aero-003', horarioPrevisto: '2026-06-13T07:00:00', horarioChegadaPrevisto: '2026-06-13T08:00:00', horarioRealPartida: null, horarioRealChegada: null, dataProgramacao: '2026-06-13', status: 'cancelado', observacoes: 'Cancelado — aeronave PP-MRO indisponível (manutenção corretiva)' },
  { id: 'voo-007', prefixo: 'FRM-4101', origemId: 'apt-004', destinoId: 'apt-009', naturezaId: 'nv-003', tipoId: 'tv-001', aeronaveId: 'aero-004', horarioPrevisto: '2026-06-13T15:00:00', horarioChegadaPrevisto: '2026-06-13T18:00:00', horarioRealPartida: null, horarioRealChegada: null, dataProgramacao: '2026-06-13', status: 'planejado', observacoes: '' },
  { id: 'voo-008', prefixo: 'ATX-2108', origemId: 'apt-012', destinoId: 'apt-001', naturezaId: 'nv-001', tipoId: 'tv-004', aeronaveId: 'aero-001', horarioPrevisto: '2026-06-14T06:00:00', horarioChegadaPrevisto: '2026-06-14T07:15:00', horarioRealPartida: null, horarioRealChegada: null, dataProgramacao: '2026-06-14', status: 'planejado', observacoes: 'Retorno da P-03' },
  { id: 'voo-009', prefixo: 'MTN-3105', origemId: 'apt-001', destinoId: 'apt-007', naturezaId: 'nv-001', tipoId: 'tv-002', aeronaveId: 'aero-002', horarioPrevisto: '2026-06-14T08:00:00', horarioChegadaPrevisto: '2026-06-14T09:30:00', horarioRealPartida: null, horarioRealChegada: null, dataProgramacao: '2026-06-14', status: 'planejado', observacoes: 'Charter para Navegantes' },
  { id: 'voo-010', prefixo: 'FRM-4102', origemId: 'apt-005', destinoId: 'apt-003', naturezaId: 'nv-001', tipoId: 'tv-001', aeronaveId: 'aero-004', horarioPrevisto: '2026-06-14T10:00:00', horarioChegadaPrevisto: '2026-06-14T11:15:00', horarioRealPartida: null, horarioRealChegada: null, dataProgramacao: '2026-06-14', status: 'planejado', observacoes: '' },
];

// ---- Tripulação do Voo ----
export interface TripulacaoVoo {
  id: string;
  vooId: string;
  tripulanteId: string;
  funcao: FuncaoTripulante;
  horarioApresentacao: string;
  horarioDispensa: string;
}

export const MOCK_TRIPULACAO_VOO: TripulacaoVoo[] = [
  { id: 'tv-001', vooId: 'voo-001', tripulanteId: 'trip-001', funcao: 'PIC', horarioApresentacao: '2026-06-13T05:45:00', horarioDispensa: '2026-06-13T08:00:00' },
  { id: 'tv-002', vooId: 'voo-001', tripulanteId: 'trip-003', funcao: 'SIC', horarioApresentacao: '2026-06-13T05:45:00', horarioDispensa: '2026-06-13T08:00:00' },
  { id: 'tv-003', vooId: 'voo-002', tripulanteId: 'trip-001', funcao: 'PIC', horarioApresentacao: '2026-06-13T08:00:00', horarioDispensa: '2026-06-13T10:00:00' },
  { id: 'tv-004', vooId: 'voo-002', tripulanteId: 'trip-003', funcao: 'SIC', horarioApresentacao: '2026-06-13T08:00:00', horarioDispensa: '2026-06-13T10:00:00' },
  { id: 'tv-005', vooId: 'voo-003', tripulanteId: 'trip-002', funcao: 'PIC', horarioApresentacao: '2026-06-13T08:15:00', horarioDispensa: '2026-06-13T10:15:00' },
  { id: 'tv-006', vooId: 'voo-003', tripulanteId: 'trip-004', funcao: 'SIC', horarioApresentacao: '2026-06-13T08:15:00', horarioDispensa: '2026-06-13T10:15:00' },
  { id: 'tv-007', vooId: 'voo-004', tripulanteId: 'trip-002', funcao: 'PIC', horarioApresentacao: '2026-06-13T10:15:00', horarioDispensa: '2026-06-13T14:15:00' },
  { id: 'tv-008', vooId: 'voo-004', tripulanteId: 'trip-004', funcao: 'SIC', horarioApresentacao: '2026-06-13T10:15:00', horarioDispensa: '2026-06-13T14:15:00' },
  { id: 'tv-009', vooId: 'voo-005', tripulanteId: 'trip-001', funcao: 'PIC', horarioApresentacao: '2026-06-13T13:15:00', horarioDispensa: '2026-06-13T17:00:00' },
  { id: 'tv-010', vooId: 'voo-005', tripulanteId: 'trip-003', funcao: 'SIC', horarioApresentacao: '2026-06-13T13:15:00', horarioDispensa: '2026-06-13T17:00:00' },
  { id: 'tv-011', vooId: 'voo-005', tripulanteId: 'trip-006', funcao: 'COM', horarioApresentacao: '2026-06-13T13:15:00', horarioDispensa: '2026-06-13T17:00:00' },
  { id: 'tv-012', vooId: 'voo-007', tripulanteId: 'trip-005', funcao: 'SIC', horarioApresentacao: '2026-06-13T14:15:00', horarioDispensa: '2026-06-13T18:15:00' },
];

// ---- Status RDV ----
export type StatusRdv = 'rascunho' | 'finalizado' | 'cancelado';

// ---- RDV ----
// Operacional interno — sem valor jurídico. Não é RDV/DB oficial, eDB, registro ANAC, SDRMe ou assinatura regulatória.
export interface Rdv {
  id: string;
  numero: string;
  vooId: string;
  dataVoo: string;
  horarioDecolagemReal: string | null;
  horarioPousoReal: string | null;
  horasVoadas: number | null;
  numeroPousos: number | null;
  combustivelDecolagem: number | null;
  combustivelPouso: number | null;
  combustivelConsumo: number | null;
  ocorrencias: string;
  divergencias: string;
  status: StatusRdv;
  responsavelPreenchimentoNome: string | null; // preenchimento operacional interno, sem valor jurídico
}

export const MOCK_RDVS: Rdv[] = [
  {
    id: 'rdv-001', numero: 'RDV-20260613-001', vooId: 'voo-001', dataVoo: '2026-06-13',
    horarioDecolagemReal: '2026-06-13T06:38:00', horarioPousoReal: '2026-06-13T07:50:00',
    horasVoadas: 1.2, numeroPousos: 1,
    combustivelDecolagem: 1250, combustivelPouso: 680, combustivelConsumo: 570,
    ocorrencias: 'Nenhuma ocorrência relevante.', divergencias: '',
    status: 'finalizado', responsavelPreenchimentoNome: 'Cmt. Ricardo Albuquerque',
  },
  {
    id: 'rdv-002', numero: 'RDV-20260613-002', vooId: 'voo-002', dataVoo: '2026-06-13',
    horarioDecolagemReal: '2026-06-13T08:32:00', horarioPousoReal: '2026-06-13T09:48:00',
    horasVoadas: 1.27, numeroPousos: 1,
    combustivelDecolagem: 1180, combustivelPouso: 620, combustivelConsumo: 560,
    ocorrencias: 'Turbulência moderada na subida.', divergencias: 'Horário real difere do previsto em +3 min.',
    status: 'finalizado', responsavelPreenchimentoNome: 'Cmt. Ricardo Albuquerque',
  },
  {
    id: 'rdv-003', numero: 'RDV-20260613-003', vooId: 'voo-003', dataVoo: '2026-06-13',
    horarioDecolagemReal: '2026-06-13T09:05:00', horarioPousoReal: '2026-06-13T10:02:00',
    horasVoadas: 0.95, numeroPousos: 1,
    combustivelDecolagem: 1450, combustivelPouso: 820, combustivelConsumo: 630,
    ocorrencias: '', divergencias: '',
    status: 'finalizado', responsavelPreenchimentoNome: 'Cmt. Ana Carolina Souza',
  },
  {
    id: 'rdv-004', numero: 'RDV-20260613-004', vooId: 'voo-004', dataVoo: '2026-06-13',
    horarioDecolagemReal: '2026-06-13T11:10:00', horarioPousoReal: null,
    horasVoadas: null, numeroPousos: null,
    combustivelDecolagem: null, combustivelPouso: null, combustivelConsumo: null,
    ocorrencias: '', divergencias: '',
    status: 'rascunho', responsavelPreenchimentoNome: null,
  },
  {
    id: 'rdv-005', numero: 'RDV-20260613-005', vooId: 'voo-005', dataVoo: '2026-06-13',
    horarioDecolagemReal: null, horarioPousoReal: null,
    horasVoadas: null, numeroPousos: null,
    combustivelDecolagem: null, combustivelPouso: null, combustivelConsumo: null,
    ocorrencias: '', divergencias: '',
    status: 'rascunho', responsavelPreenchimentoNome: null,
  },
  {
    id: 'rdv-006', numero: 'RDV-20260613-006', vooId: 'voo-006', dataVoo: '2026-06-13',
    horarioDecolagemReal: null, horarioPousoReal: null,
    horasVoadas: null, numeroPousos: null,
    combustivelDecolagem: null, combustivelPouso: null, combustivelConsumo: null,
    ocorrencias: 'Voo cancelado por indisponibilidade da aeronave PP-MRO.', divergencias: '',
    status: 'cancelado', responsavelPreenchimentoNome: null,
  },
];

// ---- Jornadas (simuladas) ----
export interface Jornada {
  id: string;
  tripulanteId: string;
  vooId: string;
  dataJornada: string;
  horarioInicio: string;
  horarioFim: string;
  horasJornada: number;
  horasVoo: number;
  frmsScore: number;
  status: 'ok' | 'atencao' | 'bloqueado';
}

export const MOCK_JORNADAS: Jornada[] = [
  { id: 'jor-001', tripulanteId: 'trip-001', vooId: 'voo-001', dataJornada: '2026-06-13', horarioInicio: '05:45', horarioFim: '10:00', horasJornada: 4.25, horasVoo: 2.47, frmsScore: 32, status: 'ok' },
  { id: 'jor-002', tripulanteId: 'trip-003', vooId: 'voo-001', dataJornada: '2026-06-13', horarioInicio: '05:45', horarioFim: '10:00', horasJornada: 4.25, horasVoo: 2.47, frmsScore: 15, status: 'ok' },
  { id: 'jor-003', tripulanteId: 'trip-002', vooId: 'voo-003', dataJornada: '2026-06-13', horarioInicio: '08:15', horarioFim: '14:15', horasJornada: 6.0, horasVoo: 0.95, frmsScore: 68, status: 'atencao' },
  { id: 'jor-004', tripulanteId: 'trip-004', vooId: 'voo-003', dataJornada: '2026-06-13', horarioInicio: '08:15', horarioFim: '14:15', horasJornada: 6.0, horasVoo: 0.95, frmsScore: 45, status: 'ok' },
  { id: 'jor-005', tripulanteId: 'trip-005', vooId: 'voo-007', dataJornada: '2026-06-13', horarioInicio: '14:15', horarioFim: '18:15', horasJornada: 4.0, horasVoo: 3.0, frmsScore: 88, status: 'bloqueado' },
  { id: 'jor-006', tripulanteId: 'trip-008', vooId: 'voo-005', dataJornada: '2026-06-13', horarioInicio: '13:00', horarioFim: '17:00', horasJornada: 4.0, horasVoo: 1.25, frmsScore: 10, status: 'ok' },
];

// ---- Indisponibilidades ----
export type StatusIndisponibilidade = 'ativa' | 'encerrada';

export interface Indisponibilidade {
  id: string;
  aeronaveId: string;
  causaId: string;
  grupoId: string;
  dataInicio: string;
  dataFimPrevista: string;
  dataFimReal: string | null;
  status: StatusIndisponibilidade;
  observacao: string;
  osMroVinculada: string | null;
  voosImpactados: string[];
}

export const MOCK_INDISPONIBILIDADES: Indisponibilidade[] = [
  {
    id: 'ind-001', aeronaveId: 'aero-003', causaId: 'ci-003', grupoId: 'gi-002',
    dataInicio: '2026-06-10T08:00:00', dataFimPrevista: '2026-06-17T18:00:00', dataFimReal: null,
    status: 'ativa', observacao: 'Falha de motor detectada no pós-voo. Motor enviado para oficina.',
    osMroVinculada: 'OS-2026-0089', voosImpactados: ['voo-006'],
  },
  {
    id: 'ind-002', aeronaveId: 'aero-005', causaId: 'ci-007', grupoId: 'gi-004',
    dataInicio: '2026-06-12T06:00:00', dataFimPrevista: '2026-06-15T18:00:00', dataFimReal: null,
    status: 'ativa', observacao: 'Hangaragem programada para Check A.',
    osMroVinculada: 'OS-2026-0091', voosImpactados: [],
  },
  {
    id: 'ind-003', aeronaveId: 'aero-002', causaId: 'ci-005', grupoId: 'gi-002',
    dataInicio: '2026-06-13T00:00:00', dataFimPrevista: '2026-06-13T06:00:00', dataFimReal: '2026-06-13T05:30:00',
    status: 'encerrada', observacao: 'Falha intermitente no rádio VHF. Substituído e testado.',
    osMroVinculada: 'OS-2026-0092', voosImpactados: [],
  },
];

// ---- Hangaragem ----
export type StatusHangaragem = 'hangarada' | 'liberada';

export interface Hangaragem {
  id: string;
  aeronaveId: string;
  dataEntrada: string;
  dataSaida: string | null;
  motivo: string;
  osMroVinculada: string | null;
  status: StatusHangaragem;
}

export const MOCK_HANGARAGENS: Hangaragem[] = [
  { id: 'hang-001', aeronaveId: 'aero-005', dataEntrada: '2026-06-12T06:00:00', dataSaida: null, motivo: 'Check A programado — 500 FH', osMroVinculada: 'OS-2026-0091', status: 'hangarada' },
  { id: 'hang-002', aeronaveId: 'aero-003', dataEntrada: '2026-06-05T10:00:00', dataSaida: '2026-06-06T16:00:00', motivo: 'Inspeção de hélice — 2500 ciclos', osMroVinculada: 'OS-2026-0085', status: 'liberada' },
];

// ---- Cancelamentos / Atrasos ----
export interface CancelamentoAtraso {
  id: string;
  vooId: string;
  tipo: 'cancelamento' | 'atraso';
  motivo: string;
  tempoAtrasoMinutos: number | null;
}

export const MOCK_CANCELAMENTOS_ATRASOS: CancelamentoAtraso[] = [
  { id: 'ca-001', vooId: 'voo-006', tipo: 'cancelamento', motivo: 'Aeronave indisponível — falha de motor (AOG)', tempoAtrasoMinutos: null },
  { id: 'ca-002', vooId: 'voo-004', tipo: 'atraso', motivo: 'Tráfego aéreo em GRU', tempoAtrasoMinutos: 10 },
];

// ---- Alertas simulados ----
export interface AlertaOperacional {
  id: string;
  tipo: 'frms_bloqueado' | 'frms_atencao' | 'cma_vencido' | 'cma_proximo' | 'aso_vencido' | 'qualificacao_invalida' | 'aeronave_indisponivel' | 'conflito_escala';
  mensagem: string;
  gravidade: 'critico' | 'alerta' | 'info';
  entidadeId: string;
  entidadeTipo: 'tripulante' | 'aeronave' | 'voo';
}

export const MOCK_ALERTAS: AlertaOperacional[] = [
  { id: 'al-001', tipo: 'frms_bloqueado', mensagem: 'Cop. Thiago Ferreira — FRMS BLOQUEADO (score 88). Não pode ser alocado.', gravidade: 'critico', entidadeId: 'trip-005', entidadeTipo: 'tripulante' },
  { id: 'al-002', tipo: 'frms_atencao', mensagem: 'Cmt. Ana Carolina Souza — FRMS em atenção (score 68). Avaliar antes de alocar.', gravidade: 'alerta', entidadeId: 'trip-002', entidadeTipo: 'tripulante' },
  { id: 'al-003', tipo: 'cma_proximo', mensagem: 'Cop. Thiago Ferreira — CMA vence em 20/06/2026 (7 dias).', gravidade: 'alerta', entidadeId: 'trip-005', entidadeTipo: 'tripulante' },
  { id: 'al-004', tipo: 'aeronave_indisponivel', mensagem: 'PP-MRO (C208B) — Indisponível até 17/06. Voo MRO-5101 cancelado.', gravidade: 'critico', entidadeId: 'aero-003', entidadeTipo: 'aeronave' },
  { id: 'al-005', tipo: 'aeronave_indisponivel', mensagem: 'PR-OPS (ATR 42) — Hangarada até 15/06. Sem impacto em voos.', gravidade: 'info', entidadeId: 'aero-005', entidadeTipo: 'aeronave' },
];

// ---- Relatórios (cards) ----
export interface RelatorioCard {
  id: string;
  titulo: string;
  descricao: string;
  icone: string;
  fase: 'MVP' | 'Fase 2';
}

export const MOCK_RELATORIOS: RelatorioCard[] = [
  { id: 'rel-001', titulo: 'Voos por período', descricao: 'Lista de voos com filtro de data, status, origem/destino. Exportação CSV.', icone: 'Plane', fase: 'MVP' },
  { id: 'rel-002', titulo: 'Horas por aeronave', descricao: 'Total de horas voadas e ciclos por aeronave no período.', icone: 'Clock', fase: 'MVP' },
  { id: 'rel-003', titulo: 'Horas por tripulante', descricao: 'Horas de voo e jornada por tripulante no período.', icone: 'Users', fase: 'MVP' },
  { id: 'rel-004', titulo: 'RDVs pendentes', descricao: 'RDVs em rascunho ou aguardando validação.', icone: 'FileText', fase: 'MVP' },
  { id: 'rel-005', titulo: 'Cancelamentos e atrasos', descricao: 'Voos cancelados ou com atraso por motivo.', icone: 'AlertTriangle', fase: 'MVP' },
  { id: 'rel-006', titulo: 'Indisponibilidade', descricao: 'Tempo de indisponibilidade por aeronave, causa e grupo.', icone: 'BarChart3', fase: 'Fase 2' },
  { id: 'rel-007', titulo: 'Export APUS / Sigvoos', descricao: 'Exportação de dados no formato compatível com APUS RMCV e Sigvoos.', icone: 'Download', fase: 'Fase 2' },
  { id: 'rel-008', titulo: 'Jornadas por tripulante', descricao: 'Relatório de jornadas e horas por tripulante — disponível na Fase 2.', icone: 'TrendingUp', fase: 'Fase 2' },
];

// ---- Tabelas auxiliares agrupadas ----
export interface TabelaAuxiliar {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
  fase: 'MVP' | 'Fase 2';
  registros: number;
}

export const MOCK_TABELAS_AUXILIARES: TabelaAuxiliar[] = [
  { id: 'tab-001', nome: 'Aeroportos / Plataformas', descricao: 'Cadastro de aeroportos e plataformas offshore', icone: 'MapPin', fase: 'MVP', registros: MOCK_AEROPORTOS.length },
  { id: 'tab-002', nome: 'Tipos de Voo', descricao: 'Classificação de tipos de voo', icone: 'Tag', fase: 'MVP', registros: MOCK_TIPOS_VOO.length },
  { id: 'tab-003', nome: 'Naturezas de Voo', descricao: 'Natureza da operação', icone: 'Layers', fase: 'MVP', registros: MOCK_NATUREZAS_VOO.length },
  { id: 'tab-004', nome: 'Causas de Indisponibilidade', descricao: 'Catálogo de causas de aeronave indisponível', icone: 'AlertTriangle', fase: 'MVP', registros: MOCK_CAUSAS_INDISPONIBILIDADE.length },
  { id: 'tab-005', nome: 'Grupos de Indisponibilidade', descricao: 'Agrupamento de causas', icone: 'FolderTree', fase: 'MVP', registros: MOCK_GRUPOS_INDISPONIBILIDADE.length },
  { id: 'tab-006', nome: 'Motivos de Atraso / Cancelamento', descricao: 'Catálogo de motivos para relatórios', icone: 'Ban', fase: 'MVP', registros: 8 },
  { id: 'tab-007', nome: 'Terceirizados', descricao: 'Operadores terceirizados', icone: 'Building2', fase: 'Fase 2', registros: 3 },
  { id: 'tab-008', nome: 'Feriados / HOTRAM', descricao: 'Calendário e horários de transporte', icone: 'Calendar', fase: 'Fase 2', registros: 15 },
];

// ---- Helpers de lookup ----
export function getAeroportoById(id: string): Aeroporto | undefined {
  return MOCK_AEROPORTOS.find((a) => a.id === id);
}

export function getTipoVooById(id: string): TipoVoo | undefined {
  return MOCK_TIPOS_VOO.find((t) => t.id === id);
}

export function getNaturezaVooById(id: string): NaturezaVoo | undefined {
  return MOCK_NATUREZAS_VOO.find((n) => n.id === id);
}

export function getAeronaveById(id: string): AeronaveOperacional | undefined {
  return MOCK_AERONAVES.find((a) => a.id === id);
}

export function getTripulanteById(id: string): Tripulante | undefined {
  return MOCK_TRIPULANTES.find((t) => t.id === id);
}

export function getVooById(id: string): Voo | undefined {
  return MOCK_VOOS.find((v) => v.id === id);
}

export function getRdvByVooId(vooId: string): Rdv | undefined {
  return MOCK_RDVS.find((r) => r.vooId === vooId);
}

export function getTripulacaoByVooId(vooId: string): (TripulacaoVoo & { tripulante: Tripulante })[] {
  return MOCK_TRIPULACAO_VOO
    .filter((tv) => tv.vooId === vooId)
    .map((tv) => ({
      ...tv,
      tripulante: getTripulanteById(tv.tripulanteId)!,
    }))
    .filter((t) => t.tripulante);
}

export function getCausaById(id: string): CausaIndisponibilidade | undefined {
  return MOCK_CAUSAS_INDISPONIBILIDADE.find((c) => c.id === id);
}

export function getGrupoById(id: string): GrupoIndisponibilidade | undefined {
  return MOCK_GRUPOS_INDISPONIBILIDADE.find((g) => g.id === id);
}

export function getIndisponibilidadeById(id: string): Indisponibilidade | undefined {
  return MOCK_INDISPONIBILIDADES.find((i) => i.id === id);
}

export function getJornadasByTripulanteId(tripulanteId: string): Jornada[] {
  return MOCK_JORNADAS.filter((j) => j.tripulanteId === tripulanteId);
}

export function getAlertasByTipo(tipo: AlertaOperacional['tipo']): AlertaOperacional[] {
  return MOCK_ALERTAS.filter((a) => a.tipo === tipo);
}
