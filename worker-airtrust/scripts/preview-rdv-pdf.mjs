/**
 * Gera um PDF fictício do RDV Petrobras e renderiza páginas em PNG
 * para inspeção visual local. Não versionar a saída.
 *
 * Uso (na raiz do repo ou em worker-airtrust):
 *   node --experimental-strip-types worker-airtrust/scripts/preview-rdv-pdf.mjs
 *   # ou, após build/tsc path: npx tsx ...
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const outDir = join(repoRoot, 'artifacts/rdv-pdf-preview');

const { gerarRelatorioPetrobrasPdf } = await import(
  pathToFileURL(resolve(__dirname, '../src/services/controle-voos/rdv-pdf.ts')).href
);

const longObs =
  'Observacao ficticia para inspecao visual do wrap automatico. ' +
  'Detalhe operacional alfa beta gamma delta epsilon zeta eta theta iota kappa. '.repeat(25);

const data = {
  empresa_nome: 'Operadora Ficticia AirTrust Demo',
  base: 'SBFZ',
  contrato: 'CTR-DEMO-2026',
  cliente: 'Contratante Ficticio Petrobras Demo',
  data_voo: '2026-07-18',
  prefixo: 'PP-DEM',
  modelo_aeronave: 'AW139',
  numero_voo: 'DEMO-42',
  numero_relatorio: 'RDV-DEMO-0001',
  numero_sap: 'SAP-DEMO-77',
  tripulantes: Array.from({ length: 12 }, (_, i) => ({
    nome:
      i === 0
        ? 'Comandante Ficticio com Nome Extremamente Extenso Para Validar Quebra de Linha na Celula'
        : `Tripulante Demo ${i + 1} Sobrenome Longo Para Wrap`,
    codigo_anac: `9${String(10000 + i)}`,
    funcao: i === 0 ? 'COMANDANTE' : i === 1 ? 'COPILOTO' : 'MECANICO DE VOO',
  })),
  etapas: Array.from({ length: 8 }, (_, i) => ({
    numero_etapa: i + 1,
    origem_icao: i % 2 === 0 ? 'SBFZ' : 'SBJE',
    destino_icao: i % 2 === 0 ? 'SBJE' : 'SBFZ',
    horario_motor_ligado: '07:50',
    horario_decolagem: `0${8 + (i % 2)}:${String(10 + i).padStart(2, '0')}`,
    horario_pouso: `0${9 + (i % 2)}:${String(5 + i).padStart(2, '0')}`,
    horario_motor_desligado: '10:00',
    tempo_decolagem_pouso: '00:45',
    tempo_total: '01:05',
    pousos_diurnos: 1,
    pousos_noturnos: 0,
    pax: 2 + i,
    payload: 80 + i * 10,
    combustivel_inicio: 900 - i * 20,
    combustivel_fim: 780 - i * 20,
  })),
  abastecimentos: Array.from({ length: 6 }, (_, i) => ({
    fornecedor: `Fornecedor Demo Extenso ${i + 1} Combustiveis Aviacao Ltda`,
    localidade: i % 2 === 0 ? 'SBFZ — pátio norte fictício' : 'SBJE — base remota fictícia',
    combustivel_abastecido: 150 + i * 15,
    unidade: 'L',
    numero_ce: `CE-DEMO-${i + 1}`,
    data_hora: `2026-07-18T0${i}:30:00Z`,
  })),
  totais: {
    horas_voadas: 8.4,
    numero_pousos: 8,
    ciclos: 8,
    combustivel_decolagem: 900,
    combustivel_pouso: 640,
    combustivel_consumo: 260,
    pob: 8,
    carga_kg: 240,
  },
  ocorrencias: longObs,
  divergencias:
    'Divergencia ficticia: consumo reportado diverge levemente do esperado em trechos 3 e 5; ' +
    'justificativa operacional registrada apenas para teste de paginacao e wrap.',
  aprovacoes: [
    { tipo_aprovacao: 'COMANDANTE', status: 'APROVADO', created_at: '2026-07-18T11:00:00Z' },
    { tipo_aprovacao: 'COORDENACAO', status: 'REVISAO_INICIADA', created_at: '2026-07-18T12:00:00Z' },
    { tipo_aprovacao: 'COORDENACAO', status: 'APROVADO', created_at: '2026-07-18T13:00:00Z' },
    { tipo_aprovacao: 'COMERCIAL', status: 'APROVADO', created_at: '2026-07-18T14:00:00Z' },
    { tipo_aprovacao: 'CONTRATANTE', status: 'APROVADO', created_at: '2026-07-18T15:00:00Z' },
  ],
  status_workflow: 'FINALIZADO',
  versao: 4,
  gerado_em: new Date().toISOString(),
  identificador_interno: 'RDV-DEMO-FICT-v4',
  hash_integridade: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
};

mkdirSync(outDir, { recursive: true });
const pdfBytes = await gerarRelatorioPetrobrasPdf(data);
const pdfPath = join(outDir, 'rdv-demo-ficticio.pdf');
writeFileSync(pdfPath, pdfBytes);
console.log('PDF:', pdfPath, `(${pdfBytes.byteLength} bytes)`);

const pdftoppm = spawnSync(
  'pdftoppm',
  ['-png', '-r', '140', pdfPath, join(outDir, 'page')],
  { encoding: 'utf8' },
);
if (pdftoppm.status !== 0) {
  console.error(pdftoppm.stderr || pdftoppm.stdout);
  console.error('pdftoppm falhou — PDF gerado mesmo assim.');
  process.exit(pdftoppm.status || 1);
}
console.log('PNGs em', outDir);
