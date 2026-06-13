// ============================================================
// MRO/Manutenção — Dados Mockados para Protótipo
// TODOS os dados são fictícios e puramente demonstrativos.
// ============================================================

export interface MroAeronave {
  id: string; matricula: string; modelo: string; fabricante: string;
  anoFabricacao: number; serialNumber: string; categoria: string;
  configAssentos: string; motorModelo: string; apuModelo: string;
  mtow: string; totalHoras: number; totalCiclos: number;
  ultimaManutencao: string; proximaManutencao: string;
  status: 'operando' | 'em-manutencao' | 'aog' | 'reserva'; base: string;
  observacoes?: string;
}

export type ComponentStatus = 'instalado' | 'removido' | 'estoque' | 'oficina';

export interface MroComponente {
  id: string; partNumber: string; serialNumber: string; descricao: string;
  ata: string; localizacao: string; aeronaveId: string | null;
  status: ComponentStatus; tso: number; tsi: number;
  dataInstalacao: string | null; dataRemocao: string | null;
  vidaLimite: number | null; vidaRestante: number | null;
  criticidade: 'baixa' | 'media' | 'alta' | 'critica';
}

export interface MroOs {
  id: string; numero: string;
  tipo: 'preventiva' | 'corretiva' | 'modificacao' | 'inspecao' | 'componente';
  status: 'aberta' | 'em-andamento' | 'aguardando-material' | 'aguardando-aprovacao' | 'concluida' | 'cancelada';
  aeronaveId: string; titulo: string; descricao: string; ata: string;
  motivo: string; dataEmissao: string; dataPrevista: string;
  dataConclusao: string | null; oficina: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'critica';
  referenciaTecnica?: string; assinatura?: string;
}

export interface MroVencimento {
  id: string; aeronaveId: string; ata: string; tarefa: string;
  tipoControle: 'HT' | 'FC' | 'CY' | 'DY' | 'MO'; referencia: string;
  limite: number; atual: number; proximoVencimento: string;
  saldo: number; unidade: string;
  criticidade: 'baixa' | 'media' | 'alta' | 'critica'; ultimoCumprimento: string;
}

export interface MroItemEstoque {
  id: string; partNumber: string; descricao: string; almoxarifado: string;
  lote: string; validade: string; saldo: number; estoqueMinimo: number;
  unidade: string; status: 'ok' | 'baixo' | 'critico' | 'vencido';
  aplicabilidade: string; valorUnitario?: string;
}

export interface MroRegistroTecnico {
  id: string; aeronaveId: string; osNumero: string; data: string;
  servico: string; referenciaTecnica: string; liberador: string;
  crmLiberador: string; status: 'pendente' | 'aprovado' | 'rejeitado';
  tipo: 'manutencao' | 'inspecao' | 'alteracao' | 'reparo';
}

export const MOCK_AERONAVES: MroAeronave[] = [
  { id:'anv-001', matricula:'PR-ATX', modelo:'ATR 72-600', fabricante:'ATR (Airbus/Leonardo)', anoFabricacao:2018, serialNumber:'MSN-1402', categoria:'Transporte Aéreo Regular', configAssentos:'70Y', motorModelo:'PW127M', apuModelo:'Honeywell GTCP 36-150', mtow:'23.000 kg', totalHoras:12450.7, totalCiclos:9876, ultimaManutencao:'2026-05-15', proximaManutencao:'2026-08-15', status:'operando', base:'CGH', observacoes:'Check A cumprido em 15/05. Próximo Check A previsto para 15/08.' },
  { id:'anv-002', matricula:'PR-MTN', modelo:'Embraer E195-E2', fabricante:'Embraer', anoFabricacao:2022, serialNumber:'MSN-190.00891', categoria:'Transporte Aéreo Regular', configAssentos:'132Y', motorModelo:'PW1921G', apuModelo:'Honeywell HGT750', mtow:'61.500 kg', totalHoras:4820.3, totalCiclos:3210, ultimaManutencao:'2026-06-01', proximaManutencao:'2026-07-01', status:'operando', base:'GRU' },
  { id:'anv-003', matricula:'PP-MRO', modelo:'Cessna 208B Grand Caravan', fabricante:'Textron Aviation', anoFabricacao:2020, serialNumber:'208B-5678', categoria:'Táxi Aéreo / Carga', configAssentos:'9Y / Cargo', motorModelo:'PT6A-140', apuModelo:'N/A', mtow:'3.629 kg', totalHoras:2890.1, totalCiclos:4520, ultimaManutencao:'2026-04-20', proximaManutencao:'2026-07-20', status:'em-manutencao', base:'SDU', observacoes:'Em manutenção programada desde 10/06. Substituição da hélice. Previsão de retorno: 17/06.' },
];

export const MOCK_COMPONENTES: MroComponente[] = [
  { id:'cmp-001', partNumber:'PWC-3074550-01', serialNumber:'SN-88421', descricao:'Bomba Hidráulica Principal', ata:'29-10', localizacao:'LH MLG Wheel Well', aeronaveId:'anv-001', status:'instalado', tso:4520.5, tsi:4520.5, dataInstalacao:'2025-09-15', dataRemocao:null, vidaLimite:10000, vidaRestante:5479.5, criticidade:'alta' },
  { id:'cmp-002', partNumber:'AHA-1182-S', serialNumber:'SN-77102', descricao:'Atuador do Trem de Pouso Principal (LH)', ata:'32-31', localizacao:'LH MLG Actuator', aeronaveId:'anv-001', status:'instalado', tso:8760.0, tsi:2980.0, dataInstalacao:'2026-01-20', dataRemocao:null, vidaLimite:12000, vidaRestante:3240.0, criticidade:'critica' },
  { id:'cmp-003', partNumber:'816370-1', serialNumber:'SN-99201', descricao:'Válvula de Controle de Fluxo de Combustível', ata:'28-20', localizacao:'Engine Pylon LH', aeronaveId:'anv-001', status:'instalado', tso:11200.0, tsi:5100.0, dataInstalacao:'2025-06-01', dataRemocao:null, vidaLimite:15000, vidaRestante:3800.0, criticidade:'alta' },
  { id:'cmp-004', partNumber:'DAP-2900-1', serialNumber:'SN-66340', descricao:'Painel de Controle de Cabine', ata:'21-30', localizacao:'Cockpit Overhead Panel', aeronaveId:'anv-001', status:'instalado', tso:12450.7, tsi:8900.0, dataInstalacao:'2024-03-01', dataRemocao:null, vidaLimite:null, vidaRestante:null, criticidade:'baixa' },
  { id:'cmp-005', partNumber:'SPS-8800-T', serialNumber:'SN-55431', descricao:'Sensor de Proximidade — Porta de Carga', ata:'52-71', localizacao:'FWD Cargo Door', aeronaveId:'anv-001', status:'removido', tso:8900.0, tsi:0, dataInstalacao:null, dataRemocao:'2026-06-10', vidaLimite:null, vidaRestante:null, criticidade:'media' },
  { id:'cmp-006', partNumber:'UTAS-3888390-1', serialNumber:'SN-99001', descricao:'Pack de Ar Condicionado (PACK 1)', ata:'21-51', localizacao:'FWD Belly Fairing', aeronaveId:'anv-002', status:'instalado', tso:4820.3, tsi:4820.3, dataInstalacao:'2022-01-01', dataRemocao:null, vidaLimite:20000, vidaRestante:15179.7, criticidade:'alta' },
  { id:'cmp-007', partNumber:'EMB-170-40261', serialNumber:'SN-88002', descricao:'Unidade de Controle de Voo (FCC-A)', ata:'27-00', localizacao:'FWD Electronics Bay', aeronaveId:'anv-002', status:'instalado', tso:4820.3, tsi:4820.3, dataInstalacao:'2022-01-01', dataRemocao:null, vidaLimite:null, vidaRestante:null, criticidade:'critica' },
  { id:'cmp-008', partNumber:'SAFT-405CH-2', serialNumber:'SN-77123', descricao:'Bateria Principal (Ni-Cd 24V 44Ah)', ata:'24-30', localizacao:'FWD Electronics Bay', aeronaveId:'anv-002', status:'instalado', tso:2410.0, tsi:2410.0, dataInstalacao:'2025-09-01', dataRemocao:null, vidaLimite:5000, vidaRestante:2590.0, criticidade:'media' },
  { id:'cmp-009', partNumber:'CRANE-60-1050-1', serialNumber:'SN-55900', descricao:'Bomba de Combustível Auxiliar (LH)', ata:'28-22', localizacao:'LH Wing Tank', aeronaveId:'anv-002', status:'estoque', tso:0, tsi:0, dataInstalacao:null, dataRemocao:null, vidaLimite:8000, vidaRestante:8000, criticidade:'alta' },
  { id:'cmp-010', partNumber:'HONEY-7020205-1', serialNumber:'SN-44550', descricao:'Transmissor de Pressão de Óleo (Engine #1)', ata:'79-30', localizacao:'Engine #1', aeronaveId:'anv-002', status:'instalado', tso:3500.0, tsi:3500.0, dataInstalacao:'2024-11-01', dataRemocao:null, vidaLimite:null, vidaRestante:null, criticidade:'baixa' },
  { id:'cmp-011', partNumber:'PT6A-140-901', serialNumber:'SN-MOT-112', descricao:'Conjunto de Partida do Motor', ata:'80-10', localizacao:'Engine Accessory Section', aeronaveId:'anv-003', status:'instalado', tso:2890.1, tsi:2890.1, dataInstalacao:'2020-01-01', dataRemocao:null, vidaLimite:3600, vidaRestante:709.9, criticidade:'critica' },
  { id:'cmp-012', partNumber:'HARTZELL-HC-E4N-3P', serialNumber:'SN-PROP-078', descricao:'Hélice — 4 pás, velocidade constante', ata:'61-10', localizacao:'Nose — Propeller Assembly', aeronaveId:'anv-003', status:'oficina', tso:2890.1, tsi:0, dataInstalacao:null, dataRemocao:'2026-06-10', vidaLimite:4000, vidaRestante:0, criticidade:'critica' },
  { id:'cmp-013', partNumber:'COLLINS-622-5132-001', serialNumber:'SN-33301', descricao:'Rádio VHF Com (VHF-2100)', ata:'23-12', localizacao:'Cockpit Radio Rack', aeronaveId:null, status:'estoque', tso:0, tsi:0, dataInstalacao:null, dataRemocao:null, vidaLimite:null, vidaRestante:null, criticidade:'media' },
  { id:'cmp-014', partNumber:'HONEY-964-0452-001', serialNumber:'SN-22209', descricao:'EGPWS Computer (MK V-A)', ata:'34-40', localizacao:'FWD Electronics Bay', aeronaveId:null, status:'estoque', tso:0, tsi:0, dataInstalacao:null, dataRemocao:null, vidaLimite:null, vidaRestante:null, criticidade:'alta' },
  { id:'cmp-015', partNumber:'MEGGITT-25-8-011-1', serialNumber:'SN-10987', descricao:'Sensor de Temperatura de Freio (LH inboard)', ata:'32-42', localizacao:'LH MLG — Inboard Brake', aeronaveId:'anv-001', status:'instalado', tso:5670.0, tsi:5670.0, dataInstalacao:'2025-03-01', dataRemocao:null, vidaLimite:8000, vidaRestante:2330.0, criticidade:'media' },
  { id:'cmp-016', partNumber:'LIEBHERR-8046A0001-01', serialNumber:'SN-44412', descricao:'Atuador do Flap Inboard (RH)', ata:'27-50', localizacao:'RH Wing — Flap Track 2', aeronaveId:'anv-002', status:'instalado', tso:4820.3, tsi:4820.3, dataInstalacao:'2022-01-01', dataRemocao:null, vidaLimite:15000, vidaRestante:10179.7, criticidade:'alta' },
  { id:'cmp-017', partNumber:'PARKER-372200-1003', serialNumber:'SN-55678', descricao:'Unidade de Potência Hidráulica (HPU)', ata:'29-00', localizacao:'AFT Belly Fairing', aeronaveId:null, status:'oficina', tso:0, tsi:0, dataInstalacao:null, dataRemocao:null, vidaLimite:12000, vidaRestante:12000, criticidade:'critica' },
  { id:'cmp-018', partNumber:'DU-1080-MFD', serialNumber:'SN-88901', descricao:'Display Multifuncional (MFD) #2', ata:'31-60', localizacao:'Cockpit Instrument Panel', aeronaveId:'anv-003', status:'instalado', tso:2890.1, tsi:2890.1, dataInstalacao:'2020-01-01', dataRemocao:null, vidaLimite:null, vidaRestante:null, criticidade:'baixa' },
  { id:'cmp-019', partNumber:'GENERIC-FILTER-99', serialNumber:'SN-FLT-331', descricao:'Elemento Filtrante — Sistema de Combustível', ata:'28-20', localizacao:'Engine Fuel Filter Housing', aeronaveId:'anv-001', status:'instalado', tso:1200.0, tsi:1200.0, dataInstalacao:'2026-05-15', dataRemocao:null, vidaLimite:1500, vidaRestante:300.0, criticidade:'media' },
  { id:'cmp-020', partNumber:'GENERIC-PUMP-AUX', serialNumber:'SN-AUX-441', descricao:'Bomba Elétrica Auxiliar — Combustível', ata:'28-22', localizacao:'LH Wing Root', aeronaveId:'anv-002', status:'removido', tso:1200.0, tsi:0, dataInstalacao:null, dataRemocao:'2026-06-05', vidaLimite:5000, vidaRestante:0, criticidade:'alta' },
];

export const MOCK_OS: MroOs[] = [
  { id:'os-001', numero:'OS-2026-0101', tipo:'preventiva', status:'aberta', aeronaveId:'anv-001', titulo:'Check A — ATR 72 (750 FH)', descricao:'Check A programado conforme MPD. Inspeção visual geral, troca de filtros, lubrificação.', ata:'05-10', motivo:'Programado — MPD Task 05-10-01', dataEmissao:'2026-06-01', dataPrevista:'2026-06-20', dataConclusao:null, oficina:'Hangar 2 — MRO Base', prioridade:'media', referenciaTecnica:'MPD-AT72-05-10 / AMM 12-20-01' },
  { id:'os-002', numero:'OS-2026-0102', tipo:'corretiva', status:'em-andamento', aeronaveId:'anv-001', titulo:'Substituição Sensor de Proximidade — Porta de Carga', descricao:'Sensor de proximidade da porta de carga dianteira com falha intermitente. Substituir.', ata:'52-71', motivo:'Piloto relatou indicação intermitente de "DOOR OPEN"', dataEmissao:'2026-06-10', dataPrevista:'2026-06-14', dataConclusao:null, oficina:'Hangar 2 — MRO Base', prioridade:'alta', referenciaTecnica:'MM-AT72-52-71-01 / AMM 52-71-01' },
  { id:'os-003', numero:'OS-2026-0103', tipo:'componente', status:'aguardando-material', aeronaveId:'anv-003', titulo:'Substituição da Hélice — Cessna 208B', descricao:'Hélice removida para overhaul. Aguardando chegada da hélice de reposição (PN: HARTZELL-HC-E4N-3P).', ata:'61-10', motivo:'Vida limite atingida — overhaul obrigatório', dataEmissao:'2026-06-10', dataPrevista:'2026-06-17', dataConclusao:null, oficina:'Hangar 1 — Manutenção Leve', prioridade:'critica', referenciaTecnica:'MM-C208-61-10-01 / Hartzell SB 2025-03' },
  { id:'os-004', numero:'OS-2026-0104', tipo:'inspecao', status:'concluida', aeronaveId:'anv-002', titulo:'Inspeção Diária — Pré-Voo E195-E2', descricao:'Inspeção diária conforme GMM. Walk-around, fluidos, pneus.', ata:'05-20', motivo:'Rotina diária', dataEmissao:'2026-06-12', dataPrevista:'2026-06-12', dataConclusao:'2026-06-12', oficina:'Rampa GRU', prioridade:'baixa', referenciaTecnica:'GMM-E195 / AMM 05-20-01', assinatura:'CMA 123456' },
  { id:'os-005', numero:'OS-2026-0105', tipo:'modificacao', status:'aberta', aeronaveId:'anv-002', titulo:'SB 190-34-0123 — Atualização Software FMS', descricao:'Service Bulletin mandatório: atualização do software do FMS para versão 24.1. Correção de bug de rota RNAV.', ata:'34-60', motivo:'SB mandatório — ANAC AD 2026-05-01', dataEmissao:'2026-06-05', dataPrevista:'2026-06-25', dataConclusao:null, oficina:'Hangar 2 — Avionics Shop', prioridade:'alta', referenciaTecnica:'SB 190-34-0123 / AD 2026-05-01' },
  { id:'os-006', numero:'OS-2026-0106', tipo:'corretiva', status:'em-andamento', aeronaveId:'anv-002', titulo:'Substituição Bomba Combustível Aux (LH)', descricao:'Bomba auxiliar LH com queda de pressão acima do limite. Remover e instalar unidade de estoque.', ata:'28-22', motivo:'Queda de pressão detectada durante teste de bancada', dataEmissao:'2026-06-08', dataPrevista:'2026-06-13', dataConclusao:null, oficina:'Hangar 2 — MRO Base', prioridade:'alta', referenciaTecnica:'MM-E195-28-22-01 / AMM 28-22-01' },
  { id:'os-007', numero:'OS-2026-0107', tipo:'preventiva', status:'concluida', aeronaveId:'anv-001', titulo:'Substituição Elemento Filtrante — Combustível', descricao:'Troca preventiva do elemento filtrante principal de combustível.', ata:'28-20', motivo:'Programado — cada 1500 FH', dataEmissao:'2026-05-15', dataPrevista:'2026-05-15', dataConclusao:'2026-05-15', oficina:'Hangar 2 — MRO Base', prioridade:'media', referenciaTecnica:'MM-AT72-28-20-01 / AMM 28-20-01', assinatura:'CMA 123456' },
  { id:'os-008', numero:'OS-2026-0108', tipo:'inspecao', status:'aguardando-aprovacao', aeronaveId:'anv-003', titulo:'Inspeção Especial — Após Raio', descricao:'Aeronave reportada em voo próximo a tempestade elétrica. Inspeção de fuselagem, antenas e sistemas elétricos.', ata:'05-50', motivo:'Relato do piloto — trovoada em rota', dataEmissao:'2026-06-11', dataPrevista:'2026-06-12', dataConclusao:null, oficina:'Hangar 1 — Manutenção Leve', prioridade:'alta', referenciaTecnica:'MM-C208-05-50-01 / AMM 05-50-01' },
  { id:'os-009', numero:'OS-2026-0109', tipo:'preventiva', status:'aberta', aeronaveId:'anv-002', titulo:'Check de Compassagem Magnética', descricao:'Calibração e verificação da bússola magnética standby.', ata:'34-10', motivo:'Programado — semestral', dataEmissao:'2026-06-13', dataPrevista:'2026-06-18', dataConclusao:null, oficina:'Hangar 2 — Avionics Shop', prioridade:'baixa', referenciaTecnica:'MM-E195-34-10-01 / AMM 34-10-01' },
  { id:'os-010', numero:'OS-2026-0110', tipo:'corretiva', status:'cancelada', aeronaveId:'anv-001', titulo:'Inspeção de Vibração — Motor #2', descricao:'Tripulação reportou vibração acima do normal no motor #2 em cruzeiro.', ata:'71-00', motivo:'Relato da tripulação', dataEmissao:'2026-06-07', dataPrevista:'2026-06-09', dataConclusao:null, oficina:'Hangar 2 — MRO Base', prioridade:'alta', referenciaTecnica:'MM-AT72-71-00-01 / P&W SB 31600' },
  { id:'os-011', numero:'OS-2026-0111', tipo:'componente', status:'aguardando-material', aeronaveId:'anv-001', titulo:'Substituição Bateria Principal (Ni-Cd)', descricao:'Bateria principal atingiu 85% da vida útil. Substituição preventiva.', ata:'24-30', motivo:'Programado — substituição por vida útil', dataEmissao:'2026-06-13', dataPrevista:'2026-06-22', dataConclusao:null, oficina:'Hangar 2 — MRO Base', prioridade:'media', referenciaTecnica:'MM-AT72-24-30-01 / AMM 24-30-01' },
  { id:'os-012', numero:'OS-2026-0112', tipo:'inspecao', status:'concluida', aeronaveId:'anv-003', titulo:'Inspeção de 100 Horas — Motor', descricao:'Inspeção de 100 horas do motor PT6A-140 conforme manual.', ata:'72-00', motivo:'Programado — cada 100 FH', dataEmissao:'2026-05-20', dataPrevista:'2026-05-25', dataConclusao:'2026-05-24', oficina:'Hangar 1 — Manutenção Leve', prioridade:'media', referenciaTecnica:'MM-C208-72-00-01 / P&W SB 31600', assinatura:'CMA 789012' },
];

export const MOCK_VENCIMENTOS: MroVencimento[] = [
  { id:'ven-001', aeronaveId:'anv-001', ata:'05-10', tarefa:'Check A — 750 FH', tipoControle:'HT', referencia:'MPD-AT72-05-10', limite:750, atual:700, proximoVencimento:'2026-07-01', saldo:50, unidade:'FH', criticidade:'media', ultimoCumprimento:'2026-05-15' },
  { id:'ven-002', aeronaveId:'anv-001', ata:'32-31', tarefa:'Overhaul Atuador Trem Principal (LH)', tipoControle:'FC', referencia:'MM-AT72-32-31-01', limite:12000, atual:11850, proximoVencimento:'2026-07-20', saldo:150, unidade:'FC', criticidade:'critica', ultimoCumprimento:'2025-08-01' },
  { id:'ven-003', aeronaveId:'anv-001', ata:'28-20', tarefa:'Substituição Elemento Filtrante Combustível', tipoControle:'FH', referencia:'MM-AT72-28-20-01', limite:1500, atual:1200, proximoVencimento:'2026-09-01', saldo:300, unidade:'FH', criticidade:'media', ultimoCumprimento:'2026-05-15' },
  { id:'ven-004', aeronaveId:'anv-001', ata:'29-10', tarefa:'Substituição Bomba Hidráulica Principal', tipoControle:'FH', referencia:'MM-AT72-29-10-02', limite:10000, atual:9340, proximoVencimento:'2026-11-01', saldo:660, unidade:'FH', criticidade:'baixa', ultimoCumprimento:'2025-09-01' },
  { id:'ven-005', aeronaveId:'anv-001', ata:'24-30', tarefa:'Substituição Bateria Principal', tipoControle:'DY', referencia:'MM-AT72-24-30-01', limite:730, atual:710, proximoVencimento:'2026-06-30', saldo:20, unidade:'dias', criticidade:'alta', ultimoCumprimento:'2024-07-01' },
  { id:'ven-006', aeronaveId:'anv-002', ata:'21-51', tarefa:'Overhaul PACK 1 Ar Condicionado', tipoControle:'FC', referencia:'MM-E195-21-51-01', limite:20000, atual:16000, proximoVencimento:'2027-01-15', saldo:4000, unidade:'FC', criticidade:'baixa', ultimoCumprimento:'2025-06-01' },
  { id:'ven-007', aeronaveId:'anv-002', ata:'24-30', tarefa:'Substituição Bateria Principal (Ni-Cd)', tipoControle:'FH', referencia:'MM-E195-24-30-01', limite:5000, atual:4870, proximoVencimento:'2026-07-10', saldo:130, unidade:'FH', criticidade:'alta', ultimoCumprimento:'2025-09-01' },
  { id:'ven-008', aeronaveId:'anv-002', ata:'27-50', tarefa:'Inspeção Atuador Flap Inboard (RH)', tipoControle:'MO', referencia:'MM-E195-27-50-02', limite:24, atual:23, proximoVencimento:'2026-07-01', saldo:1, unidade:'meses', criticidade:'critica', ultimoCumprimento:'2024-07-01' },
  { id:'ven-009', aeronaveId:'anv-002', ata:'34-60', tarefa:'SB 190-34-0123 — Software FMS (mandatório AD)', tipoControle:'DY', referencia:'AD-2026-05-01', limite:90, atual:85, proximoVencimento:'2026-06-30', saldo:5, unidade:'dias', criticidade:'critica', ultimoCumprimento:'2026-03-31' },
  { id:'ven-010', aeronaveId:'anv-002', ata:'05-10', tarefa:'Check A — 600 FH', tipoControle:'FH', referencia:'MPD-E195-05-10', limite:600, atual:570, proximoVencimento:'2026-06-28', saldo:30, unidade:'FH', criticidade:'media', ultimoCumprimento:'2026-06-01' },
  { id:'ven-011', aeronaveId:'anv-003', ata:'72-00', tarefa:'Inspeção de 100 Horas — Motor', tipoControle:'FH', referencia:'MM-C208-72-00-01', limite:100, atual:90, proximoVencimento:'2026-06-25', saldo:10, unidade:'FH', criticidade:'alta', ultimoCumprimento:'2026-05-24' },
  { id:'ven-012', aeronaveId:'anv-003', ata:'61-10', tarefa:'Overhaul Hélice Hartzell', tipoControle:'FH', referencia:'MM-C208-61-10-01', limite:4000, atual:3980, proximoVencimento:'2026-06-15', saldo:20, unidade:'FH', criticidade:'critica', ultimoCumprimento:'2025-01-01' },
  { id:'ven-013', aeronaveId:'anv-003', ata:'80-10', tarefa:'Substituição Conjunto de Partida do Motor', tipoControle:'FH', referencia:'MM-C208-80-10-01', limite:3600, atual:3520, proximoVencimento:'2026-08-10', saldo:80, unidade:'FH', criticidade:'alta', ultimoCumprimento:'2025-02-01' },
  { id:'ven-014', aeronaveId:'anv-001', ata:'32-42', tarefa:'Inspeção Sensor Temperatura Freio (LH Inboard)', tipoControle:'FC', referencia:'MM-AT72-32-42-01', limite:8000, atual:7990, proximoVencimento:'2026-06-20', saldo:10, unidade:'FC', criticidade:'critica', ultimoCumprimento:'2025-09-01' },
  { id:'ven-015', aeronaveId:'anv-002', ata:'34-10', tarefa:'Calibração Bússola Magnética Standby', tipoControle:'MO', referencia:'MM-E195-34-10-01', limite:6, atual:5.5, proximoVencimento:'2026-07-01', saldo:0.5, unidade:'meses', criticidade:'baixa', ultimoCumprimento:'2026-01-01' },
];

export const MOCK_ESTOQUE: MroItemEstoque[] = [
  { id:'est-001', partNumber:'PWC-3074550-01', descricao:'Bomba Hidráulica Principal (ATR 72)', almoxarifado:'ALM-01 — CGH', lote:'L-2026-0551', validade:'2028-06-01', saldo:2, estoqueMinimo:1, unidade:'un', status:'ok', aplicabilidade:'ATR 72-600', valorUnitario:'R$ 12.500,00' },
  { id:'est-002', partNumber:'SAFT-405CH-2', descricao:'Bateria Ni-Cd 24V 44Ah', almoxarifado:'ALM-01 — CGH', lote:'L-2025-8801', validade:'2027-12-01', saldo:1, estoqueMinimo:2, unidade:'un', status:'baixo', aplicabilidade:'E195-E2', valorUnitario:'R$ 8.900,00' },
  { id:'est-003', partNumber:'GENERIC-FILTER-99', descricao:'Elemento Filtrante — Combustível', almoxarifado:'ALM-01 — CGH', lote:'L-2026-0120', validade:'2029-03-01', saldo:12, estoqueMinimo:5, unidade:'un', status:'ok', aplicabilidade:'Genérica', valorUnitario:'R$ 340,00' },
  { id:'est-004', partNumber:'HONEY-964-0452-001', descricao:'EGPWS Computer (MK V-A)', almoxarifado:'ALM-02 — GRU', lote:'L-2025-7730', validade:'N/A', saldo:0, estoqueMinimo:1, unidade:'un', status:'critico', aplicabilidade:'Multi-aeronave', valorUnitario:'R$ 45.000,00' },
  { id:'est-005', partNumber:'AHA-1182-S', descricao:'Atuador Trem de Pouso Principal (LH)', almoxarifado:'ALM-03 — SDU', lote:'L-2025-9900', validade:'N/A', saldo:0, estoqueMinimo:1, unidade:'un', status:'critico', aplicabilidade:'ATR 72', valorUnitario:'R$ 34.200,00' },
  { id:'est-006', partNumber:'HARTZELL-HC-E4N-3P', descricao:'Hélice 4 pás — Cessna 208B', almoxarifado:'ALM-03 — SDU', lote:'L-2026-0440', validade:'N/A', saldo:1, estoqueMinimo:1, unidade:'un', status:'ok', aplicabilidade:'Cessna 208B', valorUnitario:'R$ 28.700,00' },
  { id:'est-007', partNumber:'SPS-8800-T', descricao:'Sensor de Proximidade — Porta Carga', almoxarifado:'ALM-01 — CGH', lote:'L-2026-0021', validade:'2028-01-01', saldo:3, estoqueMinimo:2, unidade:'un', status:'ok', aplicabilidade:'ATR 72', valorUnitario:'R$ 1.890,00' },
  { id:'est-008', partNumber:'816370-1', descricao:'Válvula Controle Fluxo Combustível', almoxarifado:'ALM-01 — CGH', lote:'L-2025-6650', validade:'N/A', saldo:1, estoqueMinimo:2, unidade:'un', status:'baixo', aplicabilidade:'ATR 72', valorUnitario:'R$ 6.300,00' },
  { id:'est-009', partNumber:'CRANE-60-1050-1', descricao:'Bomba Combustível Auxiliar (LH)', almoxarifado:'ALM-02 — GRU', lote:'L-2026-1120', validade:'2028-09-01', saldo:2, estoqueMinimo:1, unidade:'un', status:'ok', aplicabilidade:'E195-E2', valorUnitario:'R$ 9.100,00' },
  { id:'est-010', partNumber:'EMB-170-40261', descricao:'Unidade de Controle de Voo (FCC-A)', almoxarifado:'ALM-02 — GRU', lote:'L-2025-5500', validade:'N/A', saldo:1, estoqueMinimo:1, unidade:'un', status:'ok', aplicabilidade:'E195-E2', valorUnitario:'R$ 52.000,00' },
  { id:'est-011', partNumber:'PARKER-372200-1003', descricao:'Unidade de Potência Hidráulica (HPU)', almoxarifado:'ALM-02 — GRU', lote:'L-2025-3340', validade:'N/A', saldo:0, estoqueMinimo:1, unidade:'un', status:'critico', aplicabilidade:'E195-E2', valorUnitario:'R$ 38.900,00' },
  { id:'est-012', partNumber:'COLLINS-622-5132-001', descricao:'Rádio VHF Com (VHF-2100)', almoxarifado:'ALM-02 — GRU', lote:'L-2026-2001', validade:'N/A', saldo:3, estoqueMinimo:1, unidade:'un', status:'ok', aplicabilidade:'Multi-aeronave', valorUnitario:'R$ 11.400,00' },
  { id:'est-013', partNumber:'MEGGITT-25-8-011-1', descricao:'Sensor Temperatura de Freio', almoxarifado:'ALM-01 — CGH', lote:'L-2026-0310', validade:'2028-05-01', saldo:4, estoqueMinimo:2, unidade:'un', status:'ok', aplicabilidade:'ATR 72', valorUnitario:'R$ 2.150,00' },
  { id:'est-014', partNumber:'PT6A-140-901', descricao:'Conjunto de Partida do Motor', almoxarifado:'ALM-03 — SDU', lote:'L-2025-9914', validade:'2027-11-01', saldo:1, estoqueMinimo:1, unidade:'un', status:'ok', aplicabilidade:'Cessna 208B', valorUnitario:'R$ 5.800,00' },
  { id:'est-015', partNumber:'LIEBHERR-8046A0001-01', descricao:'Atuador Flap Inboard (RH)', almoxarifado:'ALM-02 — GRU', lote:'L-2025-7710', validade:'N/A', saldo:1, estoqueMinimo:1, unidade:'un', status:'ok', aplicabilidade:'E195-E2', valorUnitario:'R$ 41.600,00' },
  { id:'est-016', partNumber:'DAP-2900-1', descricao:'Painel de Controle de Cabine', almoxarifado:'ALM-01 — CGH', lote:'L-2025-4410', validade:'N/A', saldo:0, estoqueMinimo:1, unidade:'un', status:'critico', aplicabilidade:'ATR 72', valorUnitario:'R$ 7.200,00' },
  { id:'est-017', partNumber:'HONEY-7020205-1', descricao:'Transmissor Pressão de Óleo (Engine #1)', almoxarifado:'ALM-02 — GRU', lote:'L-2026-2210', validade:'2028-04-01', saldo:5, estoqueMinimo:2, unidade:'un', status:'ok', aplicabilidade:'E195-E2', valorUnitario:'R$ 1.650,00' },
  { id:'est-018', partNumber:'DU-1080-MFD', descricao:'Display Multifuncional (MFD)', almoxarifado:'ALM-03 — SDU', lote:'L-2025-6001', validade:'N/A', saldo:1, estoqueMinimo:1, unidade:'un', status:'ok', aplicabilidade:'Cessna 208B', valorUnitario:'R$ 18.200,00' },
  { id:'est-019', partNumber:'UTAS-3888390-1', descricao:'Pack Ar Condicionado (PACK 1)', almoxarifado:'ALM-02 — GRU', lote:'L-2026-5001', validade:'N/A', saldo:1, estoqueMinimo:1, unidade:'un', status:'ok', aplicabilidade:'E195-E2', valorUnitario:'R$ 62.000,00' },
  { id:'est-020', partNumber:'GENERIC-PUMP-AUX', descricao:'Bomba Elétrica Auxiliar — Combustível', almoxarifado:'ALM-01 — CGH', lote:'L-2025-8820', validade:'2027-06-01', saldo:2, estoqueMinimo:2, unidade:'un', status:'ok', aplicabilidade:'E195-E2 / ATR 72', valorUnitario:'R$ 4.700,00' },
];

export const MOCK_REGISTROS_TECNICOS: MroRegistroTecnico[] = [
  { id:'rt-001', aeronaveId:'anv-001', osNumero:'OS-2026-0107', data:'2026-05-15', servico:'Substituição do elemento filtrante de combustível conforme MM-AT72-28-20-01. Filtro antigo descartado. Teste de estanqueidade OK.', referenciaTecnica:'MM-AT72-28-20-01 / AMM 28-20-01', liberador:'Carlos A. Menezes', crmLiberador:'CMA 123456', status:'aprovado', tipo:'manutencao' },
  { id:'rt-002', aeronaveId:'anv-001', osNumero:'OS-2026-0101', data:'2026-06-13', servico:'Check A em andamento. Lubrificação de superfícies de comando concluída. Pendente: inspeção de motores.', referenciaTecnica:'MPD-AT72-05-10 / AMM 12-20-01', liberador:'Carlos A. Menezes', crmLiberador:'CMA 123456', status:'pendente', tipo:'manutencao' },
  { id:'rt-003', aeronaveId:'anv-003', osNumero:'OS-2026-0112', data:'2026-05-24', servico:'Inspeção de 100 horas do motor PT6A-140. Compressão dentro dos limites. Filtro de óleo substituído. Sem discrepâncias.', referenciaTecnica:'MM-C208-72-00-01 / P&W SB 31600', liberador:'Marcos R. Vieira', crmLiberador:'MRV 789012', status:'aprovado', tipo:'inspecao' },
  { id:'rt-004', aeronaveId:'anv-002', osNumero:'OS-2026-0104', data:'2026-06-12', servico:'Inspeção diária pré-voo. Walk-around sem anormalidades. Níveis de óleo e hidráulico OK. Pneus calibrados.', referenciaTecnica:'GMM-E195 / AMM 05-20-01', liberador:'Ana P. Lopes', crmLiberador:'APL 345678', status:'aprovado', tipo:'inspecao' },
  { id:'rt-005', aeronaveId:'anv-002', osNumero:'OS-2026-0106', data:'2026-06-12', servico:'Substituição da bomba de combustível auxiliar (LH) em andamento. Bomba removida. Aguardando instalação da unidade do estoque.', referenciaTecnica:'MM-E195-28-22-01 / AMM 28-22-01', liberador:'Carlos A. Menezes', crmLiberador:'CMA 123456', status:'pendente', tipo:'manutencao' },
  { id:'rt-006', aeronaveId:'anv-003', osNumero:'OS-2026-0108', data:'2026-06-11', servico:'Inspeção especial após relato de trovoada. Fuselagem sem danos visíveis. Continuidade elétrica das antenas verificada.', referenciaTecnica:'MM-C208-05-50-01 / AMM 05-50-01', liberador:'Marcos R. Vieira', crmLiberador:'MRV 789012', status:'pendente', tipo:'inspecao' },
  { id:'rt-007', aeronaveId:'anv-001', osNumero:'OS-2026-0102', data:'2026-06-11', servico:'Sensor de proximidade da porta de carga removido. Teste de continuidade: falha intermitente confirmada.', referenciaTecnica:'MM-AT72-52-71-01 / AMM 52-71-01', liberador:'Carlos A. Menezes', crmLiberador:'CMA 123456', status:'pendente', tipo:'reparo' },
  { id:'rt-008', aeronaveId:'anv-002', osNumero:'OS-2026-0105', data:'2026-06-10', servico:'Preparação para SB 190-34-0123. Software FMS versão 24.1 recebido. Aguardando janela de manutenção para upload.', referenciaTecnica:'SB 190-34-0123 / AD 2026-05-01', liberador:'Ana P. Lopes', crmLiberador:'APL 345678', status:'pendente', tipo:'alteracao' },
];

export function getAeronaveById(id: string): MroAeronave | undefined {
  return MOCK_AERONAVES.find((a) => a.id === id);
}
export function getComponentesByAeronaveId(aeronaveId: string): MroComponente[] {
  return MOCK_COMPONENTES.filter((c) => c.aeronaveId === aeronaveId);
}
export function getOsByAeronaveId(aeronaveId: string): MroOs[] {
  return MOCK_OS.filter((o) => o.aeronaveId === aeronaveId);
}
export function getVencimentosByAeronaveId(aeronaveId: string): MroVencimento[] {
  return MOCK_VENCIMENTOS.filter((v) => v.aeronaveId === aeronaveId);
}
export function getRegistrosTecnicosByAeronaveId(aeronaveId: string): MroRegistroTecnico[] {
  return MOCK_REGISTROS_TECNICOS.filter((r) => r.aeronaveId === aeronaveId);
}
export function getOsByNumero(numero: string): MroOs | undefined {
  return MOCK_OS.find((o) => o.numero === numero);
}
