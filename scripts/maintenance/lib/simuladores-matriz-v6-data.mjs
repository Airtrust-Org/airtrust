import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');

const DOC_V5 = path.join(ROOT, 'docs', 'analysis', 'COSTA_DO_SOL_MATRIZ_V5_FINAL_REVISAVEL_20260703.md');
const DOC_V3 = path.join(ROOT, 'docs', 'analysis', 'COSTA_DO_SOL_MATRIZ_V3_FINAL_REVISAVEL_20260703.md');
const NOTECHS_SUMMARY = path.join(
  ROOT,
  'docs',
  'analysis',
  'NOTECHS_MODELOS_MANOBRAS_SUMMARY_20260702.md',
);
const SOURCE_MAP = path.join(
  ROOT,
  'scripts',
  'operations',
  'modelos-sessao-manobras-empresa6-source-map.json',
);

const EXPLICIT_MANEUVERS = {
  'A139-PNO-01': {
    codigo: 'A139-PNO-01',
    nome: 'Pouso normal',
    fase_voo: 'pouso',
    fap_refs: 'FAP05.2 H4.3',
    tipo_aeronave: 'AW139',
    tipo_sessao: 'TREINAMENTO',
    categoria: 'POUSO',
    origem_documental: 'V6 correcao adicional de unicidade',
  },
  'A139-AUT-02': {
    codigo: 'A139-AUT-02',
    nome: 'Flare e recuperação avançada da autorrotação',
    fase_voo: 'autorrotacao',
    fap_refs: '-',
    tipo_aeronave: 'AW139',
    tipo_sessao: 'TREINAMENTO',
    categoria: 'EMERGENCIA',
    origem_documental: 'V6 variacao tecnica real para evitar duplicidade',
  },
  'A139-RPM-02': {
    codigo: 'A139-RPM-02',
    nome: 'Gerenciamento avançado de energia e RPM em flare/recuperação',
    fase_voo: 'autorrotacao',
    fap_refs: '-',
    tipo_aeronave: 'AW139',
    tipo_sessao: 'TREINAMENTO',
    categoria: 'EMERGENCIA',
    origem_documental: 'V6 variacao tecnica real para evitar duplicidade',
  },
};

const REPLACEMENTS = {
  'SK76-I-03/12': {
    16: { codigo: 'S76-ILS-00' },
    17: { codigo: 'S76-VOR-00' },
    18: { codigo: 'S76-CKL-01' },
  },
  'SK76-I-05/12': {
    17: { codigo: '76-DUACZ' },
    18: { codigo: 'S76-CKL-01' },
  },
  'SK76-I-06/12': {
    17: { codigo: '76-MOTCZ' },
    18: { codigo: 'S76-CKL-02' },
  },
  'SK76-I-08/12': {
    17: { codigo: 'S76-MGL-33' },
    18: { codigo: 'S76-MOH-35' },
  },
  'SK76-I-09/12': {
    17: { codigo: 'S76-SFE-10' },
    18: { codigo: 'S76-BCS-10' },
  },
  'SK76-I-10/12': {
    17: { codigo: 'S76-LDP-00' },
    18: { codigo: '76-APXAL' },
  },
  'A139-I-01/12': {
    16: { codigo: 'A139-PNO-01' },
  },
  'A139-I-03/12': {
    17: { codigo: 'A139-MOD-01' },
    18: { codigo: 'A139-FMA-02' },
  },
  'A139-I-05/12': {
    17: { codigo: 'WAR-IDL-16' },
    18: { codigo: 'A139-CKL-02' },
  },
  'A139-I-06/12': {
    17: { codigo: 'A139-CKL-03' },
    18: { codigo: 'A139-OEI-01' },
  },
  'A139-I-07/12': {
    17: { codigo: 'CAU-APO-38' },
    18: { codigo: 'A139-MOD-01' },
  },
  'A139-I-08/12': {
    17: { codigo: 'A139-AUT-02' },
    18: { codigo: 'A139-RPM-02' },
  },
  'A139-I-09/12': {
    17: { codigo: 'CAU-2FP-74' },
    18: { codigo: 'CAU-EFP-75' },
  },
};

const SHARED_PERIODIC_MODELS = new Set(['SK76-P-CHECK', 'A139-P-LOFT/CHECK', 'A139-P-LOFT/OFFSHORE']);

const SK76_SEMESTRAL_MODELS = [
  {
    modelCode: 'SK76-S-01/02',
    modelName: 'Semestral Noturno SK76',
    aircraft: 'SK76',
    kind: 'semestral',
    sourceFile: 'COSTA_DO_SOL_MATRIZ_V6_1_FICHAS_RESTANTES_FINAL_REVISAVEL_20260703.md',
    sourceHeading: 'SK76-S-01/02',
    rows: [
      { ordem: 1, codigo: 'S76-CKL-01', nome: 'Checklist e preparação noturna', fase_voo: 'preparacao', fap_refs: 'FAP05.2 C2.1/C2.2', observacao: '' },
      { ordem: 2, codigo: 'S76-NVF-00', nome: 'Procedimentos normais VFR noturno', fase_voo: 'preparacao', fap_refs: 'FAP05.2 H4.1/H4.3', observacao: '' },
      { ordem: 3, codigo: 'S76-HOV-00', nome: 'Hover e taxi noturno', fase_voo: 'hover_taxi', fap_refs: 'FAP05.2 H2.3', observacao: '' },
      { ordem: 4, codigo: 'S76-DNR-01', nome: 'Decolagem normal noturna', fase_voo: 'decolagem', fap_refs: 'FAP05.2 H4.2', observacao: '' },
      { ordem: 5, codigo: 'S76-SUB-01', nome: 'Subida controlada noturna', fase_voo: 'subida', fap_refs: '-', observacao: '' },
      { ordem: 6, codigo: 'S76-PWR-01', nome: 'Controle de potência e torque', fase_voo: 'cruzeiro', fap_refs: 'FAP05.2 H4.1', observacao: '' },
      { ordem: 7, codigo: 'S76-NDL-00', nome: 'Navegação tática com referência noturna', fase_voo: 'navegacao', fap_refs: 'PTO Rev. 10', observacao: 'fonte do operador' },
      { ordem: 8, codigo: '76-FALGC', nome: 'Falha de gerador DC em voo noturno', fase_voo: 'evento_eletrico', fap_refs: '-', observacao: 'QRH interno' },
      { ordem: 9, codigo: '76-FALFF', nome: 'Falha de alimentação feeder/bateria', fase_voo: 'evento_eletrico', fap_refs: '-', observacao: 'QRH interno' },
      { ordem: 10, codigo: '76-MOTCZ', nome: 'Falha de motor em cruzeiro', fase_voo: 'evento_motor', fap_refs: 'FAP05.2 H7.9', observacao: '' },
      { ordem: 11, codigo: 'S76-XFD-20', nome: 'Crossfeed total após falha de motor', fase_voo: 'procedimento', fap_refs: '-', observacao: 'QRH interno' },
      { ordem: 12, codigo: 'S76-AUT-70', nome: 'Autorotação', fase_voo: 'emergencia', fap_refs: 'FAP05.2 H7.1', observacao: '' },
      { ordem: 13, codigo: 'S76-ILS-00', nome: 'Aproximação ILS noturna', fase_voo: 'aproximacao_ifr', fap_refs: 'FAP06 IAP3.2', observacao: '' },
      { ordem: 14, codigo: 'S76-RNV-00', nome: 'Aproximação RNAV/GPS noturna', fase_voo: 'aproximacao_ifr', fap_refs: 'FAP06 IAP2.2', observacao: '' },
      { ordem: 15, codigo: 'S76-ARN-01', nome: 'Arremetida noturna', fase_voo: 'missed_approach', fap_refs: 'FAP06 IAP2.3', observacao: '' },
      { ordem: 16, codigo: 'S76-APN-01', nome: 'Aproximação normal visual noturna', fase_voo: 'aproximacao', fap_refs: 'FAP05.2 H4.3', observacao: '' },
      { ordem: 17, codigo: 'S76-PNO-01', nome: 'Pouso normal noturno', fase_voo: 'pouso', fap_refs: 'FAP05.2 H4.3', observacao: '' },
      { ordem: 18, codigo: 'S76-LDP-00', nome: 'Pouso/decolagem em helideck', fase_voo: 'encerramento', fap_refs: 'FAP14 Offshore', observacao: '' },
    ],
  },
  {
    modelCode: 'SK76-S-02/02',
    modelName: 'Semestral Check IFR SK76',
    aircraft: 'SK76',
    kind: 'semestral',
    sourceFile: 'COSTA_DO_SOL_MATRIZ_V6_1_FICHAS_RESTANTES_FINAL_REVISAVEL_20260703.md',
    sourceHeading: 'SK76-S-02/02',
    rows: [
      { ordem: 1, codigo: 'S76-CKL-01', nome: 'Checklist e preparação IFR', fase_voo: 'preparacao', fap_refs: 'FAP05.2 C2.1/C2.2', observacao: '' },
      { ordem: 2, codigo: 'S76-NIF-00', nome: 'Procedimentos normais IFR', fase_voo: 'preparacao_ifr', fap_refs: 'FAP06 CIR.5', observacao: '' },
      { ordem: 3, codigo: 'S76-ILS-00', nome: 'Aproximação ILS', fase_voo: 'aproximacao_ifr', fap_refs: 'FAP06 IAP3.2', observacao: '' },
      { ordem: 4, codigo: 'S76-RNV-00', nome: 'Aproximação RNAV/GPS', fase_voo: 'aproximacao_ifr', fap_refs: 'FAP06 IAP2.2', observacao: '' },
      { ordem: 5, codigo: 'S76-VOR-00', nome: 'Aproximação VOR/NDB', fase_voo: 'aproximacao_ifr', fap_refs: 'FAP06 IAP2.2', observacao: '' },
      { ordem: 6, codigo: 'S76-CKL-02', nome: 'Aplicação de checklist anormal', fase_voo: 'procedimento', fap_refs: 'FAP05.2 C2.3', observacao: '' },
      { ordem: 7, codigo: 'S76-MGP-33', nome: 'Pressão de óleo da MGB em faixa de cautela', fase_voo: 'evento_sistemas', fap_refs: '-', observacao: 'QRH interno' },
      { ordem: 8, codigo: '76-MOTCZ', nome: 'Falha de motor em cruzeiro', fase_voo: 'evento_motor', fap_refs: 'FAP05.2 H7.9', observacao: '' },
      { ordem: 9, codigo: 'S76-XFD-20', nome: 'Crossfeed total após falha de motor', fase_voo: 'procedimento', fap_refs: '-', observacao: 'QRH interno' },
      { ordem: 10, codigo: 'S76-AUT-70', nome: 'Autorotação', fase_voo: 'emergencia', fap_refs: 'FAP05.2 H7.1', observacao: '' },
      { ordem: 11, codigo: 'S76-LGE-44', nome: 'Falha de extensão do trem de pouso', fase_voo: 'evento_pouso', fap_refs: '-', observacao: 'QRH interno' },
      { ordem: 12, codigo: 'S76-FFL-32', nome: 'Filtro de combustível obstruído', fase_voo: 'evento_combustivel', fap_refs: '-', observacao: 'QRH interno' },
      { ordem: 13, codigo: 'S76-FFM-32', nome: 'Fluxo de combustível fora do normal', fase_voo: 'evento_combustivel', fap_refs: '-', observacao: 'QRH interno' },
      { ordem: 14, codigo: 'S76-NRO-00', nome: 'Nr overspeed na subida', fase_voo: 'evento_rotor', fap_refs: '-', observacao: 'QRH interno' },
      { ordem: 15, codigo: 'S76-NRL-00', nome: 'Nr low na subida', fase_voo: 'evento_rotor', fap_refs: '-', observacao: 'QRH interno' },
      { ordem: 16, codigo: 'S76-CST-00', nome: 'Estol de compressor em cruzeiro', fase_voo: 'evento_motor', fap_refs: '-', observacao: 'QRH interno' },
      { ordem: 17, codigo: 'S76-ARN-01', nome: 'Arremetida IFR', fase_voo: 'decisao', fap_refs: 'FAP06 IAP2.3', observacao: '' },
      { ordem: 18, codigo: 'S76-LDP-00', nome: 'Pouso/decolagem em helideck', fase_voo: 'encerramento', fap_refs: 'FAP14 Offshore', observacao: '' },
    ],
  },
];

// ============================================================================
// Fichas restantes V6.1 — 8 fichas operacionais convertidas para 18 técnicas
// + 15 NOTECHS (padrão notechs.ts), conforme
// docs/analysis/COSTA_DO_SOL_MATRIZ_V6_1_FICHAS_RESTANTES_FINAL_REVISAVEL_20260703.md
// seções 4.1-4.8. As 15 NOTECHS não entram em `rows` (mesmo padrão de
// SK76_SEMESTRAL_MODELS) — o vínculo automático de NOTECHS por ficha é feito
// em runtime pelo backend (worker-airtrust/src/routes/simuladores-fichas.ts),
// não por este loader. Aqui só vivem as 18 manobras técnicas por ficha.
//
// Zero códigos novos: todos os 18 itens de cada ficha reaproveitam códigos já
// existentes no catálogo (AW139: A139-*/CAU-*/WAR-*/OPS-*/FLY-*; S76/SK76:
// S76-*/76-*), conforme a tabela "Zero códigos novos necessários" da seção 8
// do doc de fichas restantes.
// ============================================================================

const RESTANTES_SOURCE_FILE = 'COSTA_DO_SOL_MATRIZ_V6_1_FICHAS_RESTANTES_FINAL_REVISAVEL_20260703.md';

const FICHAS_RESTANTES_MODELS = [
  {
    modelCode: 'A139-S-01/02',
    modelName: 'Semestral Noturno AW139',
    aircraft: 'AW139',
    kind: 'semestral',
    sourceFile: RESTANTES_SOURCE_FILE,
    sourceHeading: 'A139-S-01/02',
    rows: [
      { ordem: 1, codigo: 'A139-CKL-01', nome: 'Normal checklist — preparação noturna', fase_voo: 'preparacao', fap_refs: 'FAP05.2 C2.1/C2.2', observacao: 'Adaptado para contexto noturno' },
      { ordem: 2, codigo: 'FLY-BAS-X3', nome: 'Hover e taxi com referência noturna', fase_voo: 'hover_taxi', fap_refs: 'FAP05.2 H2.3', observacao: 'Iluminação externa e referências visuais noturnas' },
      { ordem: 3, codigo: 'OPS-NRM-X2', nome: 'Decolagem normal noturna', fase_voo: 'decolagem', fap_refs: 'FAP05.2 H4.2', observacao: 'Com iluminação de heliponto' },
      { ordem: 4, codigo: 'FLY-BAS-X1', nome: 'Controle geral VFR noturno', fase_voo: 'cruzeiro_noturno', fap_refs: 'FAP05.2', observacao: 'Referências visuais limitadas' },
      { ordem: 5, codigo: 'A139-MOD-01', nome: 'Seleção de modos AFCS em condição noturna', fase_voo: 'cruzeiro_automacao', fap_refs: '-', observacao: 'Automação em baixa luminosidade' },
      { ordem: 6, codigo: 'OPS-NAV-X1', nome: 'Navegação FMS noturna', fase_voo: 'navegacao', fap_refs: 'FAP06 CIR.5', observacao: 'Navegação com referência instrumental' },
      { ordem: 7, codigo: 'CAU-DCG-53', nome: 'Single DC GEN failure em voo noturno', fase_voo: 'evento_eletrico', fap_refs: 'QRH AW139', observacao: 'Carga elétrica em voo noturno' },
      { ordem: 8, codigo: 'A139-CKL-02', nome: 'Aplicação do QRH para caution noturna', fase_voo: 'qrh', fap_refs: '-', observacao: 'Identificação de CAS em baixa luminosidade' },
      { ordem: 9, codigo: 'CAU-FLO-73', nome: 'Fuel low em rota noturna', fase_voo: 'evento_combustivel', fap_refs: 'QRH AW139', observacao: 'Decisão de alternado noturno' },
      { ordem: 10, codigo: 'WAR-OUT-15', nome: 'Engine failure em voo noturno', fase_voo: 'evento_motor', fap_refs: 'QRH AW139', observacao: 'Perfil OEI com referência noturna limitada' },
      { ordem: 11, codigo: 'CAU-LIC-60', nome: 'OEI limit timer em condição noturna', fase_voo: 'monitoramento_oei', fap_refs: 'QRH AW139', observacao: 'Gerenciamento de tempo OEI' },
      { ordem: 12, codigo: 'A139-OEI-01', nome: 'Perfil OEI noturno', fase_voo: 'perfil_oei', fap_refs: '-', observacao: 'Planejamento de pouso com ILS' },
      { ordem: 13, codigo: 'OPS-APP-X1', nome: 'Aproximação de precisão noturna', fase_voo: 'aproximacao_ifr', fap_refs: 'FAP06 IAP3.2', observacao: 'ILS noturno como recurso' },
      { ordem: 14, codigo: 'OPS-APP-X3', nome: 'Missed approach noturno', fase_voo: 'missed_approach', fap_refs: 'FAP06 IAP2.3', observacao: 'Arremetida com referência limitada' },
      { ordem: 15, codigo: 'OPS-NRM-X1', nome: 'Procedimentos normais — pouso noturno', fase_voo: 'pouso', fap_refs: 'FAP05.2 H4.3', observacao: 'Iluminação de heliponto/pista', rpea_refs: ['690-2.44C.1E'] },
      { ordem: 16, codigo: 'A139-ARN-01', nome: 'Arremetida noturna com NVG/NVIS', fase_voo: 'arremetida', fap_refs: '-', observacao: 'Se aplicável ao equipamento' },
      { ordem: 17, codigo: 'WAR-GEN-11', nome: 'Dual DC GEN failure — contingência noturna', fase_voo: 'evento_eletrico_avancado', fap_refs: 'QRH AW139', observacao: 'Cenário de perda elétrica total à noite' },
      { ordem: 18, codigo: 'A139-EST-01', nome: 'Estacionamento e corte pós-voo noturno', fase_voo: 'pos_pouso', fap_refs: 'FAP05.2 H4.5/C2.3', observacao: 'Iluminação pós-pouso' },
    ],
  },
  {
    modelCode: 'A139-S-02/02',
    modelName: 'Semestral Check IFR AW139',
    aircraft: 'AW139',
    kind: 'semestral',
    sourceFile: RESTANTES_SOURCE_FILE,
    sourceHeading: 'A139-S-02/02',
    rows: [
      { ordem: 1, codigo: 'A139-CKL-01', nome: 'Normal checklist e preparação IFR', fase_voo: 'preparacao', fap_refs: 'FAP05.2 C2.1/C2.2', observacao: 'Verificação pré-voo IFR', rpea_refs: ['690-2.46C.6'] },
      { ordem: 2, codigo: 'OPS-NAV-X1', nome: 'Programação FMS e planejamento de rota', fase_voo: 'preparacao_ifr', fap_refs: 'FAP06 CIR.5', observacao: 'Rota, alternado, mínimos' },
      { ordem: 3, codigo: 'OPS-NAV-X2', nome: 'Uso AP e automação normal IFR', fase_voo: 'preparacao_decolagem', fap_refs: 'FAP06 CIR.3/CIR.5', observacao: 'Configuração de modos' },
      { ordem: 4, codigo: 'FLY-BAS-X2', nome: 'Controle geral IFR — saída e enroute', fase_voo: 'saida_enroute_ifr', fap_refs: 'FAP05.2', observacao: 'Manutenção de proa/altitude' },
      { ordem: 5, codigo: 'OPS-NAV-X4', nome: 'SID e STAR', fase_voo: 'saida_chegada_ifr', fap_refs: 'FAP06 CIR.3', observacao: 'Cumprimento de procedimentos publicados' },
      { ordem: 6, codigo: 'OPS-NAV-X3', nome: 'Holding pattern', fase_voo: 'espera_ifr', fap_refs: 'FAP06 CIR.7', observacao: 'Espera publicada' },
      { ordem: 7, codigo: 'CAU-APO-38', nome: 'AP OFF — retomada de voo manual IFR', fase_voo: 'evento_afcs', fap_refs: 'QRH AW139', observacao: 'Transição AP→manual' },
      { ordem: 8, codigo: 'CAU-FMS-51', nome: 'FMS failure — navegação convencional', fase_voo: 'evento_navegacao', fap_refs: 'QRH AW139', observacao: 'Navegação sem FMS' },
      { ordem: 9, codigo: 'CAU-AHR-47', nome: 'AHRS failure — voo com instrumentos parciais', fase_voo: 'evento_avionics', fap_refs: 'QRH AW139', observacao: 'Instrumentos standby' },
      { ordem: 10, codigo: 'FLY-BAS-X4', nome: 'Recuperação de atitudes anormais IFR', fase_voo: 'recuperacao', fap_refs: '-', observacao: 'Após falha de instrumentos' },
      { ordem: 11, codigo: 'OPS-APP-X2', nome: 'Aproximação de não-precisão (NPA)', fase_voo: 'aproximacao_ifr', fap_refs: 'FAP06 IAP2.2', observacao: 'RNAV/VOR' },
      { ordem: 12, codigo: 'OPS-APP-X3', nome: 'Missed approach — NPA', fase_voo: 'missed_approach', fap_refs: 'FAP06 IAP2.3', observacao: 'Abaixo dos mínimos' },
      { ordem: 13, codigo: 'OPS-APP-X1', nome: 'Aproximação de precisão (ILS)', fase_voo: 'reaproximacao_ifr', fap_refs: 'FAP06 IAP3.2', observacao: 'ILS até DA/DH', rpea_refs: ['690-2.44C.1E'] },
      { ordem: 14, codigo: 'WAR-OUT-15', nome: 'Engine failure em IFR', fase_voo: 'evento_motor', fap_refs: 'QRH AW139', observacao: 'OEI em IMC' },
      { ordem: 15, codigo: 'CAU-LIC-60', nome: 'OEI limit timer — decisão de alternado', fase_voo: 'oei_decisao', fap_refs: 'QRH AW139', observacao: 'Planejamento IFR OEI' },
      { ordem: 16, codigo: 'WAR-GER-27', nome: 'Landing gear emergency — pouso', fase_voo: 'trem_pouso', fap_refs: 'QRH AW139', observacao: 'Preparação para pouso anormal' },
      { ordem: 17, codigo: 'A139-POU-01', nome: 'Pouso monomotor IFR', fase_voo: 'pouso_oei', fap_refs: '-', observacao: 'Pouso após cenário OEI' },
      { ordem: 18, codigo: 'A139-EST-01', nome: 'Procedimentos pós-voo e encerramento', fase_voo: 'pos_pouso', fap_refs: 'FAP05.2 H4.5/C2.3', observacao: 'Fechamento do check' },
    ],
  },
  {
    modelCode: 'A139-REQ-01',
    modelName: 'Reaquisição AW139',
    aircraft: 'AW139',
    kind: 'reaquisicao',
    sourceFile: RESTANTES_SOURCE_FILE,
    sourceHeading: 'A139-REQ-01',
    rows: [
      { ordem: 1, codigo: 'A139-CKL-01', nome: 'Normal checklist — verificação de procedimentos', fase_voo: 'preparacao', fap_refs: 'FAP05.2 C2.1/C2.2', observacao: 'Retomada de disciplina de checklist' },
      { ordem: 2, codigo: 'FLY-BAS-X3', nome: 'Hover e taxi — controle básico', fase_voo: 'hover_taxi', fap_refs: 'FAP05.2 H2.3', observacao: 'Verificação de controle essencial' },
      { ordem: 3, codigo: 'OPS-NRM-X2', nome: 'Decolagem normal — perfil padrão', fase_voo: 'decolagem', fap_refs: 'FAP05.2 H4.2', observacao: 'Retomada de perfil de decolagem' },
      { ordem: 4, codigo: 'FLY-BAS-X1', nome: 'Controle geral VFR', fase_voo: 'cruzeiro_visual', fap_refs: 'FAP05.2', observacao: 'Proficiência em voo básico' },
      { ordem: 5, codigo: 'A139-PWR-01', nome: 'Controle de potência e parâmetros', fase_voo: 'cruzeiro', fap_refs: 'FAP05.2 H4.1', observacao: 'Verificação de parâmetros de motor' },
      { ordem: 6, codigo: 'OPS-NRM-X1', nome: 'Procedimentos normais — circuito e pouso', fase_voo: 'circuito_pouso', fap_refs: 'FAP05.2 H4.3', observacao: 'Pouso normal' },
      { ordem: 7, codigo: 'A139-ARN-01', nome: 'Arremetida normal', fase_voo: 'arremetida', fap_refs: '-', observacao: 'Decisão de arremeter' },
      { ordem: 8, codigo: 'OPS-NAV-X2', nome: 'Uso AP e navegação básica', fase_voo: 'navegacao', fap_refs: 'FAP06 CIR.3/CIR.5', observacao: 'Retomada de automação' },
      { ordem: 9, codigo: 'FLY-BAS-X2', nome: 'Controle geral IFR — voo por instrumentos', fase_voo: 'ifr_basico', fap_refs: 'FAP05.2', observacao: 'Proficiência IFR' },
      { ordem: 10, codigo: 'OPS-APP-X1', nome: 'Aproximação de precisão', fase_voo: 'aproximacao_ifr', fap_refs: 'FAP06 IAP3.2', observacao: 'ILS/RNP' },
      { ordem: 11, codigo: 'OPS-APP-X3', nome: 'Missed approach', fase_voo: 'missed_approach', fap_refs: 'FAP06 IAP2.3', observacao: 'Arremetida IFR' },
      { ordem: 12, codigo: 'WAR-OUT-15', nome: 'Engine failure — procedimento OEI', fase_voo: 'evento_motor', fap_refs: 'QRH AW139', observacao: 'Falha de motor — item essencial' },
      { ordem: 13, codigo: 'CAU-LIC-60', nome: 'OEI limit timer — gerenciamento', fase_voo: 'monitoramento_oei', fap_refs: 'QRH AW139', observacao: 'Decisão OEI' },
      { ordem: 14, codigo: 'CAU-FLO-73', nome: 'Fuel low — decisão de alternado', fase_voo: 'evento_combustivel', fap_refs: 'QRH AW139', observacao: 'Gerenciamento de combustível' },
      { ordem: 15, codigo: 'WAR-FIR-21', nome: 'Engine fire — ações de memória', fase_voo: 'emergencia_fogo', fap_refs: 'QRH AW139', observacao: 'Item essencial de emergência' },
      { ordem: 16, codigo: 'FLY-BAS-17', nome: 'Autorotação — recuperação básica', fase_voo: 'emergencia', fap_refs: '-', observacao: 'Autorotação para terra' },
      { ordem: 17, codigo: 'WAR-GER-27', nome: 'Landing gear emergency', fase_voo: 'trem_pouso', fap_refs: 'QRH AW139', observacao: 'Emergência de trem' },
      { ordem: 18, codigo: 'A139-EST-01', nome: 'Encerramento e procedimentos pós-voo', fase_voo: 'pos_pouso', fap_refs: 'FAP05.2 H4.5/C2.3', observacao: 'Fechamento' },
    ],
  },
  {
    modelCode: 'S76-REQ-01',
    modelName: 'Reaquisição S76',
    aircraft: 'SK76',
    kind: 'reaquisicao',
    sourceFile: RESTANTES_SOURCE_FILE,
    sourceHeading: 'S76-REQ-01',
    rows: [
      { ordem: 1, codigo: 'S76-CKL-01', nome: 'Checklist normal — disciplina operacional', fase_voo: 'preparacao', fap_refs: 'FAP05.2 C2.1/C2.2', observacao: 'Retomada de procedimentos' },
      { ordem: 2, codigo: 'S76-NVF-00', nome: 'Procedimentos normais VFR', fase_voo: 'preparacao', fap_refs: 'FAP05.2 H4.1/H4.3', observacao: 'Voo normal básico' },
      { ordem: 3, codigo: 'S76-HOV-00', nome: 'Hover e taxi — controle essencial', fase_voo: 'hover_taxi', fap_refs: 'FAP05.2 H2.3', observacao: 'Verificação de controle' },
      { ordem: 4, codigo: 'S76-DNR-01', nome: 'Decolagem normal', fase_voo: 'decolagem', fap_refs: 'FAP05.2 H4.2', observacao: 'Perfil de decolagem padrão' },
      { ordem: 5, codigo: 'S76-SUB-01', nome: 'Subida controlada visual', fase_voo: 'subida', fap_refs: '-', observacao: 'Perfil normal' },
      { ordem: 6, codigo: 'S76-PWR-01', nome: 'Controle de potência e torque', fase_voo: 'cruzeiro', fap_refs: 'FAP05.2 H4.1', observacao: 'Parâmetros de motor' },
      { ordem: 7, codigo: 'S76-CRV-01', nome: 'Curvas e controle de atitude', fase_voo: 'manobras_visuais', fap_refs: '-', observacao: 'Manobrabilidade básica' },
      { ordem: 8, codigo: 'S76-APN-01', nome: 'Aproximação normal visual', fase_voo: 'aproximacao', fap_refs: 'FAP05.2 H4.3', observacao: 'Perfil de aproximação' },
      { ordem: 9, codigo: 'S76-PNO-01', nome: 'Pouso normal', fase_voo: 'pouso', fap_refs: 'FAP05.2 H4.3', observacao: 'Pouso padrão' },
      { ordem: 10, codigo: 'S76-ARN-01', nome: 'Arremetida normal', fase_voo: 'arremetida', fap_refs: '-', observacao: 'Decisão de arremeter' },
      { ordem: 11, codigo: 'S76-TDP-00', nome: 'Decolagem classe 2 — TDP', fase_voo: 'decolagem_offshore', fap_refs: 'FAP05.2 H4.2', observacao: 'Perfil TDP (PC2/Classe 2)', rpea_refs: ['690-2.9C.4'] },
      { ordem: 12, codigo: 'S76-NDT-00', nome: 'Navegação diurna tática', fase_voo: 'navegacao', fap_refs: '-', observacao: 'Navegação básica' },
      { ordem: 13, codigo: 'S76-ILS-00', nome: 'Aproximação ILS', fase_voo: 'aproximacao_ifr', fap_refs: 'FAP06 IAP3.2', observacao: 'Proficiência IFR' },
      { ordem: 14, codigo: 'S76-RNV-00', nome: 'Aproximação RNAV/GPS', fase_voo: 'aproximacao_ifr', fap_refs: 'FAP06 IAP2.2', observacao: 'Navegação PBN' },
      { ordem: 15, codigo: '76-MOTCZ', nome: 'Falha de motor em cruzeiro', fase_voo: 'evento_motor', fap_refs: 'FAP05.2 H7.9', observacao: 'Item essencial de emergência' },
      { ordem: 16, codigo: 'S76-XFD-20', nome: 'Crossfeed total após falha de motor', fase_voo: 'procedimento', fap_refs: '-', observacao: 'Combustível pós-falha' },
      { ordem: 17, codigo: 'S76-AUT-70', nome: 'Autorotação', fase_voo: 'emergencia', fap_refs: 'FAP05.2 H7.1', observacao: 'Controle de energia' },
      { ordem: 18, codigo: 'S76-LDP-00', nome: 'Pouso/decolagem em heliponto', fase_voo: 'pouso', fap_refs: 'FAP14 Offshore', observacao: 'Operação de heliponto' },
    ],
  },
  {
    modelCode: 'A139-NOT-01',
    modelName: 'Noturno Onshore AW139',
    aircraft: 'AW139',
    kind: 'noturno',
    sourceFile: RESTANTES_SOURCE_FILE,
    sourceHeading: 'A139-NOT-01',
    rows: [
      { ordem: 1, codigo: 'A139-CKL-01', nome: 'Checklist e preparação para voo noturno', fase_voo: 'preparacao_noturna', fap_refs: 'FAP05.2 C2.1/C2.2', observacao: 'Equipamentos noturnos, iluminação' },
      { ordem: 2, codigo: 'FLY-BAS-X3', nome: 'Hover e taxi com referência noturna limitada', fase_voo: 'hover_taxi', fap_refs: 'FAP05.2 H2.3', observacao: 'Uso de iluminação externa' },
      { ordem: 3, codigo: 'OPS-NRM-X2', nome: 'Decolagem normal noturna', fase_voo: 'decolagem', fap_refs: 'FAP05.2 H4.2', observacao: 'Perfil de saída noturno' },
      { ordem: 4, codigo: 'FLY-BAS-X1', nome: 'Controle VFR noturno', fase_voo: 'cruzeiro_noturno', fap_refs: 'FAP05.2', observacao: 'Adaptação visual noturna' },
      { ordem: 5, codigo: 'A139-MOD-01', nome: 'Modos AFCS em condição noturna', fase_voo: 'cruzeiro_automacao', fap_refs: '-', observacao: 'Automação noturna' },
      { ordem: 6, codigo: 'OPS-NAV-X1', nome: 'Navegação FMS noturna', fase_voo: 'navegacao', fap_refs: 'FAP06 CIR.5', observacao: 'Navegação instrumental' },
      { ordem: 7, codigo: 'CAU-DCG-53', nome: 'Single DC GEN failure — carga elétrica noturna', fase_voo: 'evento_eletrico', fap_refs: 'QRH AW139', observacao: 'Impacto nos sistemas noturnos' },
      { ordem: 8, codigo: 'A139-CKL-02', nome: 'Aplicação do QRH em condição noturna', fase_voo: 'qrh', fap_refs: '-', observacao: 'Leitura de CAS/QRH com pouca luz' },
      { ordem: 9, codigo: 'CAU-FLO-73', nome: 'Fuel low — decisão noturna', fase_voo: 'evento_combustivel', fap_refs: 'QRH AW139', observacao: 'Alternado em condições noturnas' },
      { ordem: 10, codigo: 'WAR-OUT-15', nome: 'Engine failure noturno', fase_voo: 'evento_motor', fap_refs: 'QRH AW139', observacao: 'OEI com referência limitada' },
      { ordem: 11, codigo: 'CAU-LIC-60', nome: 'OEI limit timer — planejamento noturno', fase_voo: 'monitoramento_oei', fap_refs: 'QRH AW139', observacao: 'Tempo até pouso noturno' },
      { ordem: 12, codigo: 'A139-OEI-01', nome: 'Perfil OEI — planejamento de emergência noturno', fase_voo: 'perfil_oei', fap_refs: '-', observacao: 'Seleção de área de pouso' },
      { ordem: 13, codigo: 'OPS-APP-X1', nome: 'Aproximação ILS noturna', fase_voo: 'aproximacao_ifr', fap_refs: 'FAP06 IAP3.2', observacao: 'Uso de auxílios de aproximação' },
      { ordem: 14, codigo: 'OPS-APP-X4', nome: 'Aproximação grande ângulo noturna', fase_voo: 'aproximacao', fap_refs: '-', observacao: 'Aproximação típica noturna' },
      { ordem: 15, codigo: 'A139-ARN-01', nome: 'Arremetida noturna', fase_voo: 'arremetida', fap_refs: '-', observacao: 'Transição para IMC noturno' },
      { ordem: 16, codigo: 'OPS-NRM-X1', nome: 'Pouso noturno — procedimentos normais', fase_voo: 'pouso', fap_refs: 'FAP05.2 H4.3', observacao: 'Iluminação de pouso' },
      { ordem: 17, codigo: 'WAR-GEN-11', nome: 'Dual DC GEN failure noturno', fase_voo: 'evento_eletrico_avancado', fap_refs: 'QRH AW139', observacao: 'Perda elétrica total à noite' },
      { ordem: 18, codigo: 'A139-EST-01', nome: 'Encerramento pós-voo noturno', fase_voo: 'pos_pouso', fap_refs: 'FAP05.2 H4.5/C2.3', observacao: 'Corte e iluminação' },
    ],
  },
  {
    modelCode: 'A139-NOT-02',
    modelName: 'Noturno Offshore AW139',
    aircraft: 'AW139',
    kind: 'noturno',
    sourceFile: RESTANTES_SOURCE_FILE,
    sourceHeading: 'A139-NOT-02',
    rows: [
      { ordem: 1, codigo: 'A139-CKL-01', nome: 'Checklist e preparação offshore noturna', fase_voo: 'preparacao', fap_refs: 'FAP14 Offshore, FAP05.2 C2.1/C2.2', observacao: 'Equipamentos offshore + noturno' },
      { ordem: 2, codigo: 'OPS-OFF-X1', nome: 'Navegação offshore — planejamento de rota para UM', fase_voo: 'planejamento', fap_refs: 'FAP14 Offshore', observacao: 'Rota para Unidade Marítima' },
      { ordem: 3, codigo: 'FLY-BAS-X3', nome: 'Hover e taxi — helideck noturno', fase_voo: 'hover_helideck', fap_refs: 'FAP05.2 H2.3', observacao: 'Operação em helideck iluminado' },
      { ordem: 4, codigo: 'OPS-NRM-X2', nome: 'Decolagem offshore noturna', fase_voo: 'decolagem', fap_refs: 'FAP05.2 H4.2', observacao: 'Perfil de saída do helideck (PC2E/CAT A Offshore)', rpea_refs: ['690-2.9C.4'] },
      { ordem: 5, codigo: 'OPS-NAV-X1', nome: 'Navegação FMS em rota offshore', fase_voo: 'enroute', fap_refs: 'FAP06 CIR.5, FAP14 Offshore', observacao: 'Navegação para UM' },
      { ordem: 6, codigo: 'FLY-BAS-X1', nome: 'Controle VFR em rota offshore noturna', fase_voo: 'cruzeiro', fap_refs: 'FAP05.2', observacao: 'Voo de cruzeiro' },
      { ordem: 7, codigo: 'OPS-OFF-X2', nome: 'Aproximação offshore a Unidade Marítima', fase_voo: 'aproximacao_offshore', fap_refs: 'FAP14 Offshore', observacao: 'Aproximação à UM à noite' },
      { ordem: 8, codigo: 'OPS-APP-X4', nome: 'Aproximação grande ângulo — helideck', fase_voo: 'aproximacao', fap_refs: '-', observacao: 'Perfil de aproximação offshore' },
      { ordem: 9, codigo: 'CAU-FLO-73', nome: 'Fuel low em rota offshore', fase_voo: 'evento_combustivel', fap_refs: 'QRH AW139', observacao: 'Decisão de retorno/alternado' },
      { ordem: 10, codigo: 'WAR-OUT-15', nome: 'Engine failure em contexto offshore', fase_voo: 'evento_motor', fap_refs: 'QRH AW139', observacao: 'OEI em rota offshore' },
      { ordem: 11, codigo: 'CAU-LIC-60', nome: 'OEI limit timer — decisão offshore', fase_voo: 'monitoramento_oei', fap_refs: 'QRH AW139', observacao: 'Retorno ou amerissagem' },
      { ordem: 12, codigo: 'WAR-GEN-11', nome: 'Dual DC GEN failure offshore', fase_voo: 'evento_eletrico', fap_refs: 'QRH AW139', observacao: 'Perda elétrica em rota' },
      { ordem: 13, codigo: 'A139-CKL-02', nome: 'QRH para emergência offshore noturna', fase_voo: 'qrh', fap_refs: '-', observacao: 'Procedimentos QRH' },
      { ordem: 14, codigo: 'OPS-APP-X1', nome: 'Aproximação ILS para retorno à costa', fase_voo: 'aproximacao_ifr', fap_refs: 'FAP06 IAP3.2', observacao: 'Retorno IFR ao continente' },
      { ordem: 15, codigo: 'OPS-APP-X3', nome: 'Missed approach offshore', fase_voo: 'missed_approach', fap_refs: 'FAP06 IAP2.3', observacao: 'Arremetida no helideck' },
      { ordem: 16, codigo: 'OPS-NRM-X1', nome: 'Pouso em helideck noturno', fase_voo: 'pouso_offshore', fap_refs: 'FAP14 Offshore', observacao: 'Pouso com iluminação do helideck (PC2E/CAT A)', rpea_refs: ['690-2.9C.4'] },
      { ordem: 17, codigo: 'FLY-BAS-17', nome: 'Autorotação em proximidade da água', fase_voo: 'emergencia', fap_refs: '-', observacao: 'Ditching / amerissagem' },
      { ordem: 18, codigo: 'A139-EST-01', nome: 'Encerramento pós-voo offshore', fase_voo: 'pos_pouso', fap_refs: 'FAP05.2 H4.5/C2.3', observacao: 'Fechamento no helideck' },
    ],
  },
  {
    modelCode: 'S76-NOT-01',
    modelName: 'Noturno Onshore S76',
    aircraft: 'SK76',
    kind: 'noturno',
    sourceFile: RESTANTES_SOURCE_FILE,
    sourceHeading: 'S76-NOT-01',
    rows: [
      { ordem: 1, codigo: 'S76-CKL-01', nome: 'Checklist e preparação noturna', fase_voo: 'preparacao', fap_refs: 'FAP05.2 C2.1/C2.2', observacao: 'Preparação para voo noturno' },
      { ordem: 2, codigo: 'S76-NVF-00', nome: 'Procedimentos normais VFR noturno', fase_voo: 'preparacao_voo_normal', fap_refs: 'FAP05.2 H4.1/H4.3', observacao: 'Voo visual noturno' },
      { ordem: 3, codigo: 'S76-HOV-00', nome: 'Hover e taxi noturno', fase_voo: 'hover_taxi', fap_refs: 'FAP05.2 H2.3', observacao: 'Controle com referência limitada' },
      { ordem: 4, codigo: 'S76-DNR-01', nome: 'Decolagem normal noturna', fase_voo: 'decolagem', fap_refs: 'FAP05.2 H4.2', observacao: 'Perfil de decolagem' },
      { ordem: 5, codigo: 'S76-SUB-01', nome: 'Subida controlada noturna', fase_voo: 'subida', fap_refs: '-', observacao: 'Transição para cruzeiro' },
      { ordem: 6, codigo: 'S76-PWR-01', nome: 'Controle de potência e torque', fase_voo: 'cruzeiro', fap_refs: 'FAP05.2 H4.1', observacao: 'Monitoramento noturno' },
      { ordem: 7, codigo: 'S76-NDL-00', nome: 'Navegação diurna limitada — adaptação noturna', fase_voo: 'navegacao', fap_refs: '-', observacao: 'Navegação com referência reduzida' },
      { ordem: 8, codigo: '76-FALGC', nome: 'Falha de gerador DC — elétrica noturna', fase_voo: 'evento_eletrico', fap_refs: '-', observacao: 'QRH interno — carga elétrica noturna' },
      { ordem: 9, codigo: '76-FALFF', nome: 'Falha de alimentação feeder/bateria', fase_voo: 'evento_eletrico', fap_refs: '-', observacao: 'QRH interno — sistema elétrico noturno' },
      { ordem: 10, codigo: '76-FLWNR', nome: 'Vazão de combustível anormal', fase_voo: 'evento_combustivel', fap_refs: '-', observacao: 'QRH interno — monitoramento noturno' },
      { ordem: 11, codigo: '76-MOTCZ', nome: 'Falha de motor em cruzeiro', fase_voo: 'evento_motor', fap_refs: 'FAP05.2 H7.9', observacao: 'Item essencial' },
      { ordem: 12, codigo: 'S76-CKL-03', nome: 'Aplicação do ECL para falha de motor', fase_voo: 'ecl', fap_refs: 'FAP05.2 H7.4', observacao: 'ECL em condição noturna' },
      { ordem: 13, codigo: 'S76-OEI-01', nome: 'Perfil OEI noturno', fase_voo: 'perfil_oei', fap_refs: '-', observacao: 'Planejamento de pouso' },
      { ordem: 14, codigo: 'S76-APN-01', nome: 'Aproximação normal noturna', fase_voo: 'aproximacao', fap_refs: 'FAP05.2 H4.3', observacao: 'Perfil visual noturno' },
      { ordem: 15, codigo: 'S76-PNO-01', nome: 'Pouso normal noturno', fase_voo: 'pouso', fap_refs: 'FAP05.2 H4.3', observacao: 'Pouso com iluminação' },
      { ordem: 16, codigo: 'S76-ARN-01', nome: 'Arremetida noturna', fase_voo: 'arremetida', fap_refs: '-', observacao: 'Transição para IMC noturno' },
      { ordem: 17, codigo: 'S76-AUT-70', nome: 'Autorotação', fase_voo: 'emergencia', fap_refs: 'FAP05.2 H7.1', observacao: 'Controle de energia' },
      { ordem: 18, codigo: 'S76-EST-01', nome: 'Encerramento pós-voo noturno', fase_voo: 'pos_pouso', fap_refs: 'FAP05.2 H4.5/C2.3', observacao: 'Corte e estacionamento' },
    ],
  },
  {
    modelCode: 'S76-NOT-02',
    modelName: 'Noturno Offshore S76',
    aircraft: 'SK76',
    kind: 'noturno',
    sourceFile: RESTANTES_SOURCE_FILE,
    sourceHeading: 'S76-NOT-02',
    rows: [
      { ordem: 1, codigo: 'S76-CKL-01', nome: 'Checklist e preparação offshore noturna', fase_voo: 'preparacao', fap_refs: 'FAP14 Offshore, FAP05.2 C2.1/C2.2', observacao: 'Equipamentos offshore' },
      { ordem: 2, codigo: 'S76-TDP-00', nome: 'Decolagem classe 2 — helideck noturno', fase_voo: 'decolagem_offshore', fap_refs: 'FAP05.2 H4.2, FAP14 Offshore', observacao: 'Perfil TDP (PC2/Classe 2)', rpea_refs: ['690-2.9C.4'] },
      { ordem: 3, codigo: 'S76-HOV-00', nome: 'Hover e posicionamento no helideck', fase_voo: 'hover', fap_refs: 'FAP05.2 H2.3', observacao: 'Helideck iluminado' },
      { ordem: 4, codigo: 'S76-NVF-00', nome: 'Cruzeiro — procedimentos normais offshore', fase_voo: 'cruzeiro', fap_refs: 'FAP05.2 H4.1/H4.3', observacao: 'Rota para UM' },
      { ordem: 5, codigo: 'S76-PWR-01', nome: 'Controle de potência em rota offshore', fase_voo: 'cruzeiro', fap_refs: 'FAP05.2 H4.1', observacao: 'Parâmetros de motor' },
      { ordem: 6, codigo: '76-FLWNR', nome: 'Vazão de combustível — monitoramento offshore', fase_voo: 'evento_combustivel', fap_refs: '-', observacao: 'QRH interno — autonomia offshore' },
      { ordem: 7, codigo: '76-MOTCZ', nome: 'Falha de motor em rota offshore', fase_voo: 'evento_motor', fap_refs: 'FAP05.2 H7.9', observacao: 'OEI em rota' },
      { ordem: 8, codigo: 'S76-CKL-03', nome: 'Aplicação do ECL para falha de motor offshore', fase_voo: 'ecl', fap_refs: 'FAP05.2 H7.4', observacao: 'Procedimentos' },
      { ordem: 9, codigo: 'S76-OEI-01', nome: 'Perfil OEI — retorno à costa', fase_voo: 'perfil_oei', fap_refs: '-', observacao: 'Planejamento de retorno' },
      { ordem: 10, codigo: 'S76-XFD-20', nome: 'Crossfeed total — gerenciamento de combustível', fase_voo: 'procedimento', fap_refs: '-', observacao: 'Pós-falha de motor' },
      { ordem: 11, codigo: '76-FALGC', nome: 'Falha de gerador DC offshore', fase_voo: 'evento_eletrico', fap_refs: '-', observacao: 'QRH interno — sistema elétrico' },
      { ordem: 12, codigo: 'S76-LDP-00', nome: 'Pouso em helideck', fase_voo: 'pouso_offshore', fap_refs: 'FAP14 Offshore', observacao: 'Aproximação e pouso' },
      { ordem: 13, codigo: 'S76-APO-01', nome: 'Aproximação offshore a Unidade Marítima', fase_voo: 'aproximacao_offshore', fap_refs: 'FAP14 Offshore', observacao: 'Aproximação à UM' },
      { ordem: 14, codigo: 'S76-ARO-01', nome: 'Arremetida offshore', fase_voo: 'missed_approach_offshore', fap_refs: 'FAP14 Offshore', observacao: 'Arremetida no helideck' },
      { ordem: 15, codigo: '76-AUTAG', nome: 'Autorotação para a água', fase_voo: 'ditching', fap_refs: 'FAP05.2 Emergências, FAP14 Offshore', observacao: 'Autorotação água' },
      { ordem: 16, codigo: 'S76-DIT-71', nome: 'Ditching com potência', fase_voo: 'ditching', fap_refs: 'FAP05.2 Emergências, FAP14 Offshore', observacao: 'Amerissagem controlada' },
      { ordem: 17, codigo: 'S76-FLU-01', nome: 'Flutuabilidade e evacuação aquática', fase_voo: 'pos_ditching', fap_refs: 'FAP14 Offshore', observacao: 'Procedimentos pós-amerissagem' },
      { ordem: 18, codigo: 'S76-EST-01', nome: 'Encerramento pós-voo offshore', fase_voo: 'pos_pouso', fap_refs: 'FAP05.2 H4.5/C2.3', observacao: 'Fechamento' },
    ],
  },
];

// ============================================================================
// Aliases RPEA ("Lista analisada") -> PQ-C / escopo do mandato (canônico).
// Ambos referem-se ao mesmo requisito IOGP 690-2, com sufixo de letra
// diferente entre as duas planilhas-fonte. O identificador PQ-C é usado como
// canônico em referencias_json.item (ver
// docs/analysis/COSTA_DO_SOL_RPEA_PQC_CROSSWALK_AUDITORIA_20260703.md, seção 2.4).
// ============================================================================

const RPEA_ALIAS_MAP = {
  '690-2.43BA': '690-2.43BB',
  '690-2.43C.1A': '690-2.43C.1B',
  '690-2.43C.2': '690-2.43C.2A',
  '690-2.44C.1C': '690-2.44C.1E',
  '690-2.44C.3': '690-2.44C.3B',
  '690-2.45BA': '690-2.45BB',
};

export const RPEA_PENDING_GAPS = [
  {
    item: '690-2.50C.2',
    descricao: 'Variação de aproximação/pouso offshore para embarcação pequena/média em movimento',
    status: 'PENDENTE_OWNER',
  },
  {
    item: '690-2.51C.1',
    descricao: 'Control guarding durante embarque/desembarque com rotores girando',
    status: 'TREINAMENTO_OPERACIONAL_SEPARADO',
  },
  {
    item: '690-2.51C.2',
    descricao: 'Restrição física dos comandos quando o outro piloto sai/retorna do assento',
    status: 'TREINAMENTO_OPERACIONAL_SEPARADO',
  },
  {
    item: '690-2.43C.2A',
    descricao: 'Fidelidade visual FSTD / fonte Journey Logs incompatível',
    status: 'PENDENTE_FONTE',
  },
];

export function normalizeRpeaAlias(code) {
  const trimmed = String(code || '').trim();
  return RPEA_ALIAS_MAP[trimmed] || trimmed;
}

function buildRpeaReferenceEntries(row) {
  if (!Array.isArray(row.rpea_refs) || row.rpea_refs.length === 0) return [];
  return row.rpea_refs.map((code) => ({
    tipo: 'OUTRO',
    documento: 'RPEA/PQ-C IOGP 690-2',
    item: normalizeRpeaAlias(code),
    descricao: row.nome,
    url: null,
    status: 'CONFIRMADA',
  }));
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function stripTicks(value) {
  return String(value || '').replace(/`/g, '').trim();
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseMarkdownTables(text, headingMatcher) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = headingMatcher(line);
    if (heading) {
      current = { heading, lines: [], table: [] };
      sections.push(current);
      continue;
    }

    if (current) {
      current.lines.push(line);
      if (/^\|/.test(line) && lines[index + 1] && /^\|---/.test(lines[index + 1])) {
        index += 1;
        while (lines[index + 1] && /^\|/.test(lines[index + 1])) {
          index += 1;
          current.table.push(
            lines[index]
              .split('|')
              .slice(1, -1)
              .map((cell) => cell.trim()),
          );
        }
      }
    }
  }

  return sections;
}

function extractSectionRange(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`missing_section_start:${startMarker}`);
  }
  const end = endMarker ? text.indexOf(endMarker, start) : -1;
  return end === -1 ? text.slice(start) : text.slice(start, end);
}

function buildRegistryFromSources() {
  const registry = new Map();

  function add(entry) {
    const existing = registry.get(entry.codigo);
    if (!existing) {
      registry.set(entry.codigo, entry);
      return;
    }

    for (const key of ['nome', 'fase_voo', 'fap_refs', 'tipo_aeronave', 'categoria', 'origem_documental']) {
      if ((!existing[key] || existing[key] === '-') && entry[key] && entry[key] !== '-') {
        existing[key] = entry[key];
      }
    }
  }

  for (const entry of Object.values(EXPLICIT_MANEUVERS)) {
    add({ ...entry });
  }

  for (const model of SK76_SEMESTRAL_MODELS) {
    for (const row of model.rows) {
      add({
        codigo: row.codigo,
        nome: row.nome,
        fase_voo: row.fase_voo,
        fap_refs: row.fap_refs,
        tipo_aeronave: 'SK76',
        categoria: inferCategoria(row.codigo),
        origem_documental: model.sourceFile,
      });
    }
  }

  for (const model of FICHAS_RESTANTES_MODELS) {
    for (const row of model.rows) {
      add({
        codigo: row.codigo,
        nome: row.nome,
        fase_voo: row.fase_voo,
        fap_refs: row.fap_refs,
        tipo_aeronave: model.aircraft,
        categoria: inferCategoria(row.codigo),
        origem_documental: model.sourceFile,
      });
    }
  }

  const initialText = extractSectionRange(
    read(DOC_V5),
    '## 5. Matriz final S76/SK76 Inicial',
    '## 7. Matriz S76/SK76 Periodico',
  );
  const initialSections = parseMarkdownTables(initialText, (line) =>
    line.startsWith('### Sessao') ? line.slice(4).trim() : null,
  );

  let aircraft = 'SK76';
  for (const section of initialSections) {
    if (section.heading.includes('AW139') || section.lines.some((line) => line.includes('AW139'))) {
      aircraft = 'AW139';
    }
    for (const row of section.table) {
      if (row.length < 9) continue;
      add({
        codigo: stripTicks(row[1]),
        nome: stripTicks(row[2]),
        fase_voo: stripTicks(row[3]),
        fap_refs: stripTicks(row[7] || '-'),
        tipo_aeronave: aircraft,
        categoria: inferCategoria(stripTicks(row[1])),
        origem_documental: path.basename(DOC_V5),
      });
    }
  }

  const periodicSections = parseMarkdownTables(read(DOC_V3), (line) =>
    line.startsWith('### ') ? line.slice(4).trim() : null,
  );
  for (const section of periodicSections) {
    for (const row of section.table) {
      if (row.length < 9) continue;
      add({
        codigo: stripTicks(row[1]),
        nome: stripTicks(row[2]),
        fase_voo: '',
        fap_refs: stripTicks(row[6] || '-'),
        tipo_aeronave: inferAircraftFromCode(stripTicks(row[1])),
        categoria: inferCategoria(stripTicks(row[1])),
        origem_documental: path.basename(DOC_V3),
      });
    }
  }

  add({
    codigo: 'S76-VOR-00',
    nome: 'Aproximação VOR/NDB',
    fase_voo: 'aproximacao_ifr',
    fap_refs: 'FAP06 IAP2.2',
    tipo_aeronave: 'SK76',
    categoria: 'POUSO',
    origem_documental: '0262_sk76_periodico_ciclos.sql',
  });
  add({
    codigo: 'S76-LDP-00',
    nome: 'Pouso Classe 2 - Helideck (Committal Point)',
    fase_voo: 'aproximacao_offshore',
    fap_refs: 'FAP14 Offshore',
    tipo_aeronave: 'SK76',
    categoria: 'POUSO',
    origem_documental: '0262_sk76_periodico_ciclos.sql',
  });

  return registry;
}

function inferCategoria(codigo) {
  if (codigo.startsWith('NOTECHS-')) return 'NOTECHS';
  if (codigo.includes('LOFT')) return 'LOFT';
  if (/CKL|QRH|ECL/.test(codigo)) return 'PROCEDIMENTO';
  if (/APP|APX|ILS|VOR|RNV|LDP|TDP|POU|APO|ARO|MIS/.test(codigo)) return 'POUSO';
  if (/MOT|OEI|EEC|DECU|FIR|FUM|SMK|AUT|RPM|MGB|TR|SER|HYD|HYP/.test(codigo)) return 'EMERGENCIA';
  return 'TREINAMENTO';
}

function inferAircraftFromCode(codigo) {
  if (codigo.startsWith('A139') || codigo.startsWith('CAU-') || codigo.startsWith('WAR-') || codigo.startsWith('OPS-') || codigo.startsWith('FLY-')) {
    return 'AW139';
  }
  if (codigo.startsWith('S76') || codigo.startsWith('76-')) {
    return 'SK76';
  }
  return 'MISTO';
}

function normalizeObservation(text) {
  const value = stripTicks(text || '');
  return value === '-' ? '' : value;
}

function buildInitialModels(registry) {
  const initialText = extractSectionRange(
    read(DOC_V5),
    '## 5. Matriz final S76/SK76 Inicial',
    '## 7. Matriz S76/SK76 Periodico',
  );
  const sections = parseMarkdownTables(initialText, (line) =>
    line.startsWith('### Sessao') ? line.slice(4).trim() : null,
  );
  const models = [];
  let sectionName = 'SK76';

  for (const section of sections) {
    if (section.heading.includes('Familiarização / Checklist Normal / Voo Normal') && models.length >= 12) {
      sectionName = 'AW139';
    }
    if (section.table.length === 0) continue;
    const match = section.heading.match(/Sessao\s+(\d{2})\/12\s+—\s+(.+)$/i);
    if (!match) continue;

    const number = match[1];
    const title = match[2];
    const modelCode = sectionName === 'AW139' ? `A139-I-${number}/12` : `SK76-I-${number}/12`;
    const aircraft = sectionName === 'AW139' ? 'AW139' : 'SK76';
    const rows = section.table.map((row) => ({
      ordem: Number(row[0]),
      codigo: stripTicks(row[1]),
      nome: stripTicks(row[2]),
      fase_voo: stripTicks(row[3]),
      fap_refs: stripTicks(row[7] || '-'),
      observacao: normalizeObservation(row[8]),
      carater: number === '12' ? 'avaliativo' : 'treinamento',
    }));

    models.push({
      modelCode,
      modelName: `${number}/12 - ${title}`,
      aircraft,
      kind: 'inicial',
      sourceFile: path.basename(DOC_V5),
      sourceHeading: section.heading,
      rows,
    });
  }

  return applyReplacements(models, registry);
}

function buildPeriodicModels(registry) {
  const sections = parseMarkdownTables(read(DOC_V3), (line) =>
    line.startsWith('### ') ? line.slice(4).trim() : null,
  );
  const models = [];

  for (const section of sections) {
    if (!section.heading.startsWith('Ciclo ')) continue;
    const modelLine = section.lines.find((line) => line.includes('Modelo-base auditado:'));
    if (!modelLine || section.table.length === 0) continue;
    const modelCode = stripTicks(modelLine.split(':').slice(1).join(':').replace(/\.$/, ''));
    const aircraft = modelCode.startsWith('A139') ? 'AW139' : 'SK76';
    const rows = section.table.map((row) => ({
      ordem: Number(row[0]),
      codigo: stripTicks(row[1]),
      nome: stripTicks(row[2]),
      fase_voo: '',
      fap_refs: stripTicks(row[6] || '-'),
      observacao: normalizeObservation(row[8]),
      carater: modelCode.includes('CHECK') ? 'avaliativo' : 'treinamento',
    }));

    for (const row of rows) {
      if (row.codigo === 'S76-LOFT-15') {
        row.nome = 'Aplicacao do ECL';
      }
    }

    const existing = models.find((item) => item.modelCode === modelCode);
    if (!existing) {
      models.push({
        modelCode,
        modelName: section.heading,
        aircraft,
        kind: 'periodico',
        sourceFile: path.basename(DOC_V3),
        sourceHeading: section.heading,
        rows,
      });
      continue;
    }

    // Mantem somente a primeira definicao idêntica por modelo reutilizado.
    const existingSignature = JSON.stringify(
      existing.rows.map((row) => [row.ordem, row.codigo, row.carater]),
    );
    const incomingSignature = JSON.stringify(rows.map((row) => [row.ordem, row.codigo, row.carater]));
    if (existingSignature !== incomingSignature && !SHARED_PERIODIC_MODELS.has(modelCode)) {
      throw new Error(`periodic_model_conflict:${modelCode}`);
    }
  }

  return applyReplacements(models, registry);
}

function buildSemestralModels() {
  return SK76_SEMESTRAL_MODELS.map((model) => ({
    ...model,
    rows: model.rows.map((row) => ({ ...row })),
  }));
}

function buildFichasRestantesModels() {
  return FICHAS_RESTANTES_MODELS.map((model) => ({
    ...model,
    rows: model.rows.map((row) => ({ ...row })),
  }));
}

function applyReplacements(models, registry) {
  return models.map((model) => {
    const replacementByOrder = REPLACEMENTS[model.modelCode] || {};
    const rows = model.rows.map((row) => {
      const override = replacementByOrder[row.ordem];
      if (!override) return row;
      const explicit = EXPLICIT_MANEUVERS[override.codigo];
      const ref = explicit || registry.get(override.codigo);
      if (!ref) {
        throw new Error(`missing_replacement_reference:${model.modelCode}:${row.ordem}:${override.codigo}`);
      }

      return {
        ...row,
        codigo: override.codigo,
        nome: override.nome || ref.nome,
        fase_voo: override.fase_voo || ref.fase_voo || row.fase_voo,
        fap_refs: override.fap_refs || ref.fap_refs || row.fap_refs,
        observacao: row.observacao,
      };
    });

    return { ...model, rows };
  });
}

function validateModels(models) {
  const issues = [];
  for (const model of models) {
    if (model.rows.length !== 18) {
      issues.push(`row_count:${model.modelCode}:${model.rows.length}`);
    }
    const codes = model.rows.map((row) => row.codigo);
    const uniqueCodes = new Set(codes);
    if (uniqueCodes.size !== codes.length) {
      issues.push(`duplicate_codes:${model.modelCode}`);
    }
    if (model.aircraft === 'AW139' && codes.some((code) => code.startsWith('S76') || code.startsWith('76-'))) {
      issues.push(`aircraft_mix:${model.modelCode}:contains_s76`);
    }
    if (model.aircraft === 'SK76' && codes.some((code) => code.startsWith('A139') || code.startsWith('CAU-') || code.startsWith('WAR-'))) {
      issues.push(`aircraft_mix:${model.modelCode}:contains_aw139`);
    }
  }
  return issues;
}

function readSourceMapSummary() {
  const sourceMap = JSON.parse(read(SOURCE_MAP));
  return {
    allowlistModels: sourceMap.allowlist_models || [],
    currentRows: sourceMap.rows || [],
    meta: sourceMap.meta || {},
  };
}

export function loadSimuladoresMatrizV6Data() {
  const registry = buildRegistryFromSources();
  const initialModels = buildInitialModels(registry);
  const periodicModels = buildPeriodicModels(registry);
  const semestralModels = buildSemestralModels();
  const fichasRestantesModels = buildFichasRestantesModels();
  const models = [...initialModels, ...periodicModels, ...semestralModels, ...fichasRestantesModels];
  const issues = validateModels(models);
  const notechsSummary = read(NOTECHS_SUMMARY);
  const sourceMapSummary = readSourceMapSummary();

  return {
    generatedAt: new Date().toISOString(),
    models,
    registry,
    issues,
    rpeaPendingGaps: RPEA_PENDING_GAPS.map((gap) => ({ ...gap })),
    notechsCodes: Array.from({ length: 15 }, (_, index) => `NOTECHS-${String(index + 1).padStart(2, '0')}`),
    notechsSummary,
    sourceMapSummary,
  };
}

// Tokens com item/seção extraível (documento curto + resto da string como item).
const STRUCTURED_SOURCE_PATTERN =
  /^(FAP\s*\d+(?:\.\d+)?|RBAC\s*\d+|IS\s*\d+(?:-\d+)?[A-Z]?)\s*(.*)$/i;

/**
 * Classifica um token de fonte (um item de `fap_refs`, separado por vírgula)
 * em {tipo, documento, item, status}, usando o enum já validado em
 * `ManobraSchema.referencias_json` (worker-airtrust/src/routes/simuladores-shared.ts):
 * FAP/RBAC/IS/PTO têm tipo dedicado; QRH/AFM/FCTM/MGO/MOM idem; fontes internas
 * do operador sem tipo dedicado no schema (SOP, FTV-*, PRG-OPS-*) caem em
 * `OPERADOR`. Retorna `null` quando o token não é reconhecido — o chamador
 * decide o fallback (mantém compatibilidade com o comportamento anterior).
 */
function classifySourceToken(token) {
  const structured = token.match(STRUCTURED_SOURCE_PATTERN);
  if (structured) {
    const documento = structured[1].replace(/\s+/g, ' ').trim();
    const item = structured[2] ? structured[2].trim() || null : null;
    const upper = documento.toUpperCase();
    const tipo = upper.startsWith('FAP') ? 'FAP' : upper.startsWith('RBAC') ? 'RBAC' : 'IS';
    return { tipo, documento, item, status: 'CONFIRMADA' };
  }

  const upper = token.toUpperCase();
  const documento = token.trim();
  // PTO/QRH/AFM/FCTM/MGO/MOM já têm tipo dedicado no schema — fonte interna do
  // operador, não publicamente confirmável a partir deste repositório.
  if (upper.startsWith('PTO')) return { tipo: 'PTO', documento, item: null, status: 'FONTE_OPERADOR' };
  if (upper.startsWith('QRH')) return { tipo: 'QRH', documento, item: null, status: 'FONTE_OPERADOR' };
  if (upper.startsWith('AFM')) return { tipo: 'AFM', documento, item: null, status: 'FONTE_OPERADOR' };
  if (upper.startsWith('FCTM')) return { tipo: 'FCTM', documento, item: null, status: 'FONTE_OPERADOR' };
  if (upper.startsWith('MGO')) return { tipo: 'MGO', documento, item: null, status: 'FONTE_OPERADOR' };
  if (upper.startsWith('MOM')) return { tipo: 'MOM', documento, item: null, status: 'FONTE_OPERADOR' };
  // SOP, FTV-*, PRG-OPS-* etc.: fonte interna sem tipo dedicado no schema.
  if (upper.startsWith('SOP') || upper.startsWith('FTV') || upper.startsWith('PRG-OPS')) {
    return { tipo: 'OPERADOR', documento, item: null, status: 'FONTE_OPERADOR' };
  }
  return null;
}

export function buildRowReferencias(row) {
  const refs = [];
  const value = String(row.fap_refs || '').trim();
  if (value && value !== '-') {
    for (const token of value.split(',').map((item) => item.trim()).filter(Boolean)) {
      const classified = classifySourceToken(token) || {
        tipo: 'OUTRO',
        documento: token,
        item: null,
        status: 'CONFIRMADA',
      };
      refs.push({ ...classified, descricao: row.nome, url: null });
    }
  }

  if (refs.length === 0 && /^(76-|S76-)/.test(row.codigo) && inferCategoria(row.codigo) === 'EMERGENCIA') {
    refs.push({
      tipo: 'OPERADOR',
      documento: 'QRH/AFM/FCTM/MGO/MOM',
      item: null,
      descricao: row.nome,
      url: null,
      status: 'FONTE_OPERADOR',
    });
  }

  refs.push(...buildRpeaReferenceEntries(row));

  return refs.length ? refs : null;
}

export function buildModelMetadataObservacoes(model, row) {
  const parts = [`tipo_item=tecnica`];
  if (row.fase_voo) parts.push(`fase_voo=${slugify(row.fase_voo)}`);
  if (row.carater) parts.push(`carater=${row.carater}`);
  if (row.fap_refs && row.fap_refs !== '-') parts.push(`fap_refs=${row.fap_refs.replace(/\s+/g, '')}`);
  if (row.observacao) parts.push(`nota=${row.observacao.replace(/;/g, ',')}`);
  parts.push(`matriz_v6_modelo=${model.modelCode}`);
  return parts.join('; ');
}
