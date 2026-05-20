/**
 * Funções utilitárias compartilhadas entre as rotas principais e admin
 * de qualificacoes-certificados.
 */
import type { D1Database } from '@cloudflare/workers-types';

// ─── Tipos locais ────────────────────────────────────────────────────────────

export interface Documento {
  id: number;
  uuid: string;
  funcionario_id: number;
  nome_arquivo: string;
  tipo: string;
  tamanho: number;
  r2_key: string;
  descricao?: string | null;
  created_at: string;
  deleted_at?: string | null;
}

export type CertificadosStorageColumns = {
  pastaVirtualHasDocumentoId: boolean;
  pastaVirtualHasCertificacaoId: boolean;
  pastaVirtualHasEmpresaId: boolean;
  documentosHasEmpresaId: boolean;
};

export interface HistoricoRow {
  id: number;
  funcionario_id: number;
  data_conclusao: string | null;
  data_vencimento: string | null;
  certificado_arquivo_id: number | null;
  qualificacao_nome: string | null;
  codigo: string | null;
  funcionario_matricula: string | null;
}

export interface CertificadoPessoaData {
  nome: string;
  cpf: string;
  codigoAnac: string;
  matricula: string;
  funcao: string;
}

type FuncionarioLookupRow = {
  id: number;
  nome?: string | null;
  guerra?: string | null;
  cpf?: string | null;
  codigo_anac?: string | null;
  matricula?: string | null;
  funcao?: string | null;
};

// ─── Helpers de formatação ───────────────────────────────────────────────────

export function formatDateToYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function sanitizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, '_') // Substitui espaços por underscore
    .toUpperCase()
    .substring(0, 30); // Limite de 30 caracteres
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function normalizeIdentifier(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

async function listFuncionariosByEmpresa(
  db: D1Database,
  empresaId: number,
): Promise<FuncionarioLookupRow[]> {
  const result = await db
    .prepare(
      `SELECT id, nome, guerra, cpf, codigo_anac, matricula, funcao
         FROM funcionarios
        WHERE empresa_id = ?
          AND deleted_at IS NULL
        ORDER BY updated_at DESC, id DESC`,
    )
    .bind(empresaId)
    .all<FuncionarioLookupRow>();

  return result.results || [];
}

export async function resolveFuncionarioInstrutorNaEmpresa(
  db: D1Database,
  params: {
    empresaId: number;
    nomeInstrutor?: string | null;
    cpfInstrutor?: string | null;
    matriculaInstrutor?: string | null;
  },
): Promise<FuncionarioLookupRow | null> {
  const cpfBusca = normalizeDigits(String(params.cpfInstrutor || ''));
  const matriculaBusca = normalizeIdentifier(String(params.matriculaInstrutor || ''));
  const nomeBusca = normalizeSearchText(String(params.nomeInstrutor || ''));

  if (!cpfBusca && !matriculaBusca && !nomeBusca) {
    return null;
  }

  const funcionarios = await listFuncionariosByEmpresa(db, params.empresaId);

  if (cpfBusca) {
    const foundByCpf = funcionarios.find(
      (funcionario) => normalizeDigits(funcionario.cpf || '') === cpfBusca,
    );
    if (foundByCpf) return foundByCpf;
  }

  if (matriculaBusca) {
    const foundByMatricula = funcionarios.find(
      (funcionario) => normalizeIdentifier(funcionario.matricula || '') === matriculaBusca,
    );
    if (foundByMatricula) return foundByMatricula;
  }

  if (!nomeBusca) {
    return null;
  }

  const foundByExactName = funcionarios.find(
    (funcionario) =>
      normalizeSearchText(funcionario.nome || '') === nomeBusca ||
      normalizeSearchText(funcionario.guerra || '') === nomeBusca,
  );
  if (foundByExactName) return foundByExactName;

  // Nome de guerra único: retorna o cadastro; se houver homônimos, prefira o nome civil mais completo
  if (nomeBusca) {
    const byGuerra = funcionarios.filter(
      (funcionario) => normalizeSearchText(funcionario.guerra || '') === nomeBusca,
    );
    if (byGuerra.length === 1) return byGuerra[0];
    if (byGuerra.length > 1) {
      return byGuerra.sort(
        (a, b) => (b.nome?.length || 0) - (a.nome?.length || 0) || (b.id || 0) - (a.id || 0),
      )[0];
    }
  }

  const tokensBusca = nomeBusca.split(' ').filter(Boolean);
  if (!tokensBusca.length) {
    return null;
  }

  return (
    funcionarios.find((funcionario) => {
      const nomeFuncionario = normalizeSearchText(funcionario.nome || '');
      const guerraFuncionario = normalizeSearchText(funcionario.guerra || '');
      const searchable = `${nomeFuncionario} ${guerraFuncionario}`.trim();
      return (
        searchable.includes(nomeBusca) ||
        nomeBusca.includes(nomeFuncionario) ||
        (guerraFuncionario && nomeBusca.includes(guerraFuncionario)) ||
        tokensBusca.every((token) => searchable.includes(token))
      );
    }) || null
  );
}

export function toBase64Safe(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export async function getCertificadosStorageColumns(
  db: D1Database,
): Promise<CertificadosStorageColumns> {
  const [
    pastaVirtualHasDocumentoId,
    pastaVirtualHasCertificacaoId,
    pastaVirtualHasEmpresaId,
    documentosHasEmpresaId,
  ] = await Promise.all([
    tableHasColumn(db, 'pasta_virtual', 'documento_id'),
    tableHasColumn(db, 'pasta_virtual', 'certificacao_id'),
    tableHasColumn(db, 'pasta_virtual', 'empresa_id'),
    tableHasColumn(db, 'documentos', 'empresa_id'),
  ]);

  return {
    pastaVirtualHasDocumentoId,
    pastaVirtualHasCertificacaoId,
    pastaVirtualHasEmpresaId,
    documentosHasEmpresaId,
  };
}

export async function insertCertificadoNaPastaVirtual(
  db: D1Database,
  storageColumns: CertificadosStorageColumns,
  params: {
    funcionarioId: number;
    documentoId: number;
    historicoId: number;
    empresaId: number | null;
    r2Key: string;
    nomeArquivo: string;
    descricao: string;
  },
): Promise<void> {
  const columns = ['funcionario_id'];
  const values = ['?'];
  const bindings: Array<string | number | null> = [params.funcionarioId];

  if (storageColumns.pastaVirtualHasDocumentoId) {
    columns.push('documento_id');
    values.push('?');
    bindings.push(params.documentoId);
  }

  if (storageColumns.pastaVirtualHasCertificacaoId) {
    columns.push('certificacao_id');
    values.push('?');
    bindings.push(params.historicoId);
  }

  if (storageColumns.pastaVirtualHasEmpresaId) {
    columns.push('empresa_id');
    values.push('?');
    bindings.push(params.empresaId);
  }

  columns.push(
    'tipo_documento',
    'categoria',
    'caminho_arquivo',
    'nome_arquivo',
    'dataupload',
    'descricao',
    'created_at',
  );
  values.push('?', '?', '?', '?', "datetime('now')", '?', "datetime('now')");
  bindings.push(
    'CERTIFICADO',
    'Certificados de Qualificação',
    params.r2Key,
    params.nomeArquivo,
    params.descricao,
  );

  await db
    .prepare(`INSERT INTO pasta_virtual (${columns.join(', ')}) VALUES (${values.join(', ')})`)
    .bind(...bindings)
    .run();
}

export async function backfillCertificadoAtualNaPastaVirtual(
  db: D1Database,
  storageColumns: CertificadosStorageColumns,
  params: {
    historicoId: number;
    funcionarioId: number;
    certificadoArquivoId: number | null;
    empresaId: number | null;
  },
): Promise<void> {
  if (!storageColumns.pastaVirtualHasCertificacaoId || !params.certificadoArquivoId) {
    return;
  }

  const documento = await db
    .prepare('SELECT r2_key FROM documentos WHERE id = ? AND deleted_at IS NULL')
    .bind(params.certificadoArquivoId)
    .first<{ r2_key?: string | null }>();

  if (!documento?.r2_key) {
    return;
  }

  const setParts = ['certificacao_id = ?'];
  const bindings: Array<number | string | null> = [params.historicoId];

  if (storageColumns.pastaVirtualHasEmpresaId) {
    setParts.push('empresa_id = COALESCE(empresa_id, ?)');
    bindings.push(params.empresaId);
  }

  bindings.push(params.funcionarioId, documento.r2_key);

  await db
    .prepare(
      `UPDATE pasta_virtual
          SET ${setParts.join(', ')},
              updated_at = datetime('now')
        WHERE funcionario_id = ?
          AND caminho_arquivo = ?
          AND deleted_at IS NULL
          AND (certificacao_id IS NULL OR certificacao_id = ?)`,
    )
    .bind(...bindings, params.historicoId)
    .run();
}

export function inferImageMimeType(pathOrUrl: string, fallback = 'image/png'): string {
  if (/\.jpe?g($|\?)/i.test(pathOrUrl)) return 'image/jpeg';
  if (/\.gif($|\?)/i.test(pathOrUrl)) return 'image/gif';
  if (/\.webp($|\?)/i.test(pathOrUrl)) return 'image/webp';
  if (/\.svg($|\?)/i.test(pathOrUrl)) return 'image/svg+xml';
  if (/\.png($|\?)/i.test(pathOrUrl)) return 'image/png';
  return fallback;
}

export async function resolveImageDataUrl(
  bucket: R2Bucket,
  imageUrl?: string | null,
): Promise<string> {
  if (!imageUrl) return '';
  if (imageUrl.startsWith('data:')) return imageUrl;

  if (imageUrl.startsWith('/api/assets/')) {
    const key = imageUrl.replace('/api/assets/', '');
    const object = await bucket.get(key);
    if (!object) return '';

    const arrayBuffer = await object.arrayBuffer();
    const mimeType = object.httpMetadata?.contentType || inferImageMimeType(key);
    return `data:${mimeType};base64,${toBase64Safe(arrayBuffer)}`;
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    const response = await fetch(imageUrl);
    if (!response.ok) return '';

    const arrayBuffer = await response.arrayBuffer();
    const mimeType = response.headers.get('content-type') || inferImageMimeType(imageUrl);
    return `data:${mimeType};base64,${toBase64Safe(arrayBuffer)}`;
  }

  return '';
}

export async function resolveCertificadoContext(
  db: D1Database,
  historicoId: number,
): Promise<{
  historico: HistoricoRow;
  nomeFuncionario: string;
  cpf: string;
  codigo: string;
  dataBase: Date;
  dataStr: string;
  r2KeyPrefix: string;
}> {
  const row = await db
    .prepare(
      `SELECT
        qh.id,
        qh.funcionario_id,
        qh.data_conclusao,
        qh.data_vencimento,
        qh.certificado_arquivo_id,
        qt.nome as qualificacao_nome,
        qt.codigo as codigo,
        f.cpf as funcionario_cpf,
        f.nome as funcionario_nome
       FROM qualificacoes_historico qh
       LEFT JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
       LEFT JOIN qualificacoes_tipos qt
         ON qt.id = qh.qualificacao_id
        AND qt.deleted_at IS NULL
       WHERE qh.id = ? AND qh.deleted_at IS NULL`,
    )
    .bind(historicoId)
    .first<HistoricoRow>();

  if (!row) {
    console.warn(
      `[certificados] historicoId=${historicoId} não encontrado em qualificacoes_historico`,
    );
    throw new Error('Histórico de qualificação não encontrado');
  }

  const cpfRaw = (row as unknown as { funcionario_cpf?: string }).funcionario_cpf || '';
  const cpf = cpfRaw.replace(/\D/g, '') || 'SEM_CPF';
  const nomeFuncionarioRaw =
    (row as unknown as { funcionario_nome?: string }).funcionario_nome || '';
  const nomeFuncionario = sanitizarNome(nomeFuncionarioRaw) || 'SEM_NOME';
  const codigo = row.codigo || 'SEM_CODIGO';

  let dataBase: Date;
  if (row.data_conclusao) {
    dataBase = new Date(row.data_conclusao);
  } else if (row.data_vencimento) {
    dataBase = new Date(row.data_vencimento);
  } else {
    console.error(`[certificados] ERRO: historico_id=${row.id} sem data_conclusao/data_vencimento`);
    throw new Error(
      'Impossível gerar certificado: qualificação não possui data de conclusão ou vencimento.',
    );
  }

  const dataStr = formatDateToYMD(dataBase);
  const r2KeyPrefix = `CERT-${nomeFuncionario}-${codigo}-${dataStr}`;

  return { historico: row, nomeFuncionario, cpf, codigo, dataBase, dataStr, r2KeyPrefix };
}

export async function resolveInstrutorCertificadoData(
  db: D1Database,
  params: {
    empresaId: number;
    nomeInstrutor?: string | null;
    fallbackFuncao?: string | null;
  },
): Promise<CertificadoPessoaData | null> {
  const nomeInstrutor = String(params.nomeInstrutor || '').trim();
  if (!nomeInstrutor) return null;

  const instrutor = await resolveFuncionarioInstrutorNaEmpresa(db, {
    empresaId: params.empresaId,
    nomeInstrutor,
  });

  return {
    nome: String(instrutor?.nome || nomeInstrutor).trim(),
    cpf: String(instrutor?.cpf || '').trim(),
    codigoAnac: String(instrutor?.codigo_anac || '').trim(),
    matricula: String(instrutor?.matricula || '').trim(),
    funcao: String(instrutor?.funcao || params.fallbackFuncao || 'Instrutor').trim(),
  };
}

function injectInstrutorPrintStyle(templateHtml: string): string {
  const isStructuredCertificateTemplate =
    /class=["'][^"']*cert-page[^"']*["']/i.test(templateHtml) &&
    /class=["'][^"']*info-grid[^"']*["']/i.test(templateHtml) &&
    /class=["'][^"']*training-box[^"']*["']/i.test(templateHtml) &&
    /class=["'][^"']*program-section[^"']*["']/i.test(templateHtml);

  const style = isStructuredCertificateTemplate
    ? `<style id="airtrust-instrutor-a4-fix">
  @page { size: A4 portrait; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 210mm;
    height: 297mm !important;
    min-height: 297mm;
    max-height: 297mm !important;
  }
  body {
    overflow: hidden !important;
    background: #ffffff !important;
  }
  .cert-page {
    width: 210mm !important;
    height: 297mm !important;
    min-height: 297mm !important;
    max-height: 297mm !important;
    box-sizing: border-box !important;
    display: grid !important;
    grid-template-rows: auto auto auto auto minmax(0, 1fr) auto !important;
    padding: 16mm 18mm 14mm !important;
    gap: 22px !important;
    overflow: hidden !important;
    align-content: start !important;
  }
  .header {
    padding-bottom: 12px !important;
  }
  .header img {
    max-height: 96px !important;
    max-width: 280px !important;
  }
  .header-title .company {
    font-size: 13pt !important;
  }
  .header-title .subt {
    font-size: 8.3pt !important;
    margin-top: 2px !important;
  }
  .main-title {
    font-size: 26pt !important;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
  }
  .main-title + .main-sub {
    margin-top: 12px !important;
  }
  .main-sub {
    font-size: 9.6pt !important;
    line-height: 1.34 !important;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
  }
  .info-grid {
    grid-template-columns: 1fr 1fr !important;
    gap: 16px 18px !important;
  }
  .info-item {
    min-height: 58px !important;
    padding: 12px 14px !important;
  }
  .info-item .label {
    font-size: 7.1pt !important;
  }
  .info-item .value {
    font-size: 9.3pt !important;
    line-height: 1.24 !important;
    margin-top: 4px !important;
  }
  .training-box {
    padding: 14px 16px !important;
    border-radius: 14px !important;
    box-shadow: none !important;
  }
  .training-box .qual-name {
    font-size: 13.5pt !important;
    line-height: 1.2 !important;
  }
  .training-box .qual-meta {
    font-size: 8pt !important;
    line-height: 1.3 !important;
    margin-top: 5px !important;
  }
  .program-section {
    min-height: 0 !important;
    padding: 10px 12px 8px !important;
    overflow: hidden !important;
    display: flex !important;
    flex-direction: column !important;
  }
  .program-label {
    font-size: 7pt !important;
    margin-bottom: 6px !important;
    padding-bottom: 4px !important;
  }
  .program-content {
    column-count: 2 !important;
    column-gap: 16px !important;
    column-fill: auto !important;
    font-size: 6.6pt !important;
    line-height: 1.16 !important;
    max-height: none !important;
    overflow: hidden !important;
    flex: 1 1 auto !important;
  }
  .program-item {
    margin-bottom: 2px !important;
    break-inside: avoid !important;
  }
  .descricao-section {
    margin-top: 4px !important;
    padding: 6px 8px !important;
  }
  .footer {
    padding-top: 10px !important;
    gap: 10px !important;
    align-items: flex-end !important;
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
  }
  .qr-code {
    width: 56px !important;
    height: 56px !important;
  }
  .qr-info {
    font-size: 6.2pt !important;
    line-height: 1.24 !important;
  }
  .sig-box {
    min-width: 72mm !important;
    padding: 9px 12px !important;
  }
  .sig-box strong {
    font-size: 7.6pt !important;
    line-height: 1.1 !important;
  }
  .sig-box span {
    font-size: 6.6pt !important;
    line-height: 1.2 !important;
  }
</style>`
    : `<style id="airtrust-instrutor-a4-fix">
  @page { size: A4 portrait; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 210mm;
    height: 297mm !important;
    min-height: 297mm;
    max-height: 297mm !important;
  }
  body {
    overflow: hidden !important;
    background: #ffffff !important;
  }
  .certificate-page, .page, .a4-page, .cert-page {
    page-break-after: avoid !important;
    break-after: avoid-page !important;
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
    width: 210mm !important;
    height: 297mm !important;
    min-height: 297mm !important;
    max-height: 297mm !important;
    box-sizing: border-box !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-start !important;
    padding: 10mm 12mm 8mm !important;
    gap: 10px !important;
    overflow: hidden !important;
    align-content: start !important;
  }
  .header {
    padding-bottom: 8px !important;
  }
  .header img {
    max-height: 52px !important;
    max-width: 180px !important;
  }
  .main-title {
    font-size: 20pt !important;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
  }
  .main-sub {
    font-size: 8.2pt !important;
    line-height: 1.22 !important;
    margin-top: 0 !important;
  }
  .info-grid {
    gap: 8px !important;
  }
  .info-item {
    min-height: 0 !important;
    padding: 6px 8px !important;
  }
  .info-item .value {
    font-size: 8.4pt !important;
    line-height: 1.15 !important;
  }
  .training-box {
    padding: 10px 12px !important;
    box-shadow: none !important;
  }
  .training-box .qual-name {
    font-size: 11.5pt !important;
  }
  .training-box .qual-meta {
    font-size: 7pt !important;
    line-height: 1.18 !important;
  }
  .program-section {
    min-height: 0 !important;
    max-height: none !important;
    padding: 8px 10px 6px !important;
    overflow: hidden !important;
    flex: 1 1 auto !important;
  }
  .program-label {
    margin-bottom: 4px !important;
    padding-bottom: 3px !important;
  }
  .program-content {
    column-gap: 12px !important;
    column-fill: auto !important;
    font-size: 6.8pt !important;
    line-height: 1.12 !important;
    max-height: none !important;
    overflow: hidden !important;
    flex: 1 1 auto !important;
  }
  .program-item {
    margin-bottom: 0 !important;
  }
  .descricao-section {
    margin-top: 4px !important;
    padding: 6px 8px !important;
  }
  .footer {
    margin-top: auto !important;
    padding-top: 6px !important;
    gap: 8px !important;
    flex: 0 0 auto !important;
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
  }
  .qr-code {
    width: 48px !important;
    height: 48px !important;
  }
  .qr-info {
    font-size: 6pt !important;
    line-height: 1.2 !important;
  }
  .sig-box {
    min-width: 58mm !important;
    padding: 6px 8px !important;
  }
  .sig-box strong {
    font-size: 7.3pt !important;
    line-height: 1.1 !important;
  }
  .sig-box span {
    font-size: 6.2pt !important;
    line-height: 1.15 !important;
  }
</style>`;

  if (templateHtml.includes('airtrust-instrutor-a4-fix')) {
    return templateHtml;
  }

  if (/<\/head>/i.test(templateHtml)) {
    return templateHtml.replace(/<\/head>/i, `${style}</head>`);
  }

  return `${style}${templateHtml}`;
}

export function adaptTemplateHtmlForSinglePageA4(templateHtml: string): string {
  return injectInstrutorPrintStyle(templateHtml);
}

export function adaptTemplateHtmlForInstrutor(templateHtml: string): string {
  const sentence =
    'Certificamos que o profissional abaixo ministrou, como instrutor, o treinamento descrito neste documento.';

  let result = templateHtml
    .replace(
      /(<[^>]+class=["'][^"']*main-sub[^"']*["'][^>]*>)[\s\S]*?(<\/div>)/i,
      `$1${sentence}$2`,
    )
    .replace(
      /Certificamos que o\(a\) profissional abaixo concluiu com aproveitamento[:\s]*o?\s*treinamento descrito neste documento\.?/gi,
      sentence,
    )
    .replace(
      /Certificamos que o\(a\) profissional abaixo concluiu com aproveitamento\s*o treinamento:?/gi,
      sentence,
    )
    .replace(
      /Certificamos que o profissional abaixo concluiu com aproveitamento[:\s]*o?\s*treinamento descrito neste documento\.?/gi,
      sentence,
    )
    .replace(
      /Certificamos que o profissional abaixo concluiu com aproveitamento\s*o treinamento:?/gi,
      sentence,
    )
    .replace(
      /Certificamos que o profissional abaixo ministrou,\s*como instrutor,\s*o seguinte treinamento:\s*o?\s*treinamento descrito neste documento\.?/gi,
      sentence,
    )
    .replace(
      /Certificamos que o profissional abaixo ministrou,\s*como instrutor,\s*o seguinte treinamento:?/gi,
      sentence,
    )
    .replace(
      /Certificamos que o profissional abaixo ministrou, como instrutor, o treinamento descrito neste documento\.\s*o treinamento descrito neste documento\.?/gi,
      sentence,
    )
    .replace(/>FUNCIONÁRIO</g, '>INSTRUTOR<')
    .replace(/>Funcionário</g, '>Instrutor<');

  result = adaptTemplateHtmlForSinglePageA4(result);

  return result;
}

export type TipoTreinamento = 'INICIAL' | 'RECORRENTE' | 'SEMESTRAL' | 'UPGRADE' | 'ESPECIFICO';

export async function tableHasColumn(
  db: D1Database,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const columns = await db.prepare(`PRAGMA table_info(${tableName})`).all<{ name: string }>();
  return (columns.results || []).some((column) => column.name === columnName);
}

export function toPositiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeQualificacaoCodigo(value?: string | null): string {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function buildQualificacaoCodigoFallbacks(value?: string | null): string[] {
  const codigo = normalizeQualificacaoCodigo(value);
  if (!codigo) return [];

  const fallbacks = [codigo];
  if (codigo.endsWith('-SEM')) {
    fallbacks.push(codigo.slice(0, -4));
  }

  return fallbacks;
}

export function buildConteudoProgramaticoCertificadoHtml(value?: string | null): string {
  return String(value || '')
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `<span class="program-item">• ${item}</span>`)
    .join('');
}

export function buildDescricaoSectionHtml(descricao?: string | null): string {
  const text = String(descricao || '').trim();
  if (!text) return '';
  return `<div class="descricao-section"><div class="descricao-label">Descrição</div><div class="descricao-text">${text}</div></div>`;
}

export async function resolveConteudoProgramaticoCertificado(
  db: D1Database,
  params: {
    conteudoProgramatico?: string | null;
    qualificacaoCodigo?: string | null;
    empresaId?: number | null;
  },
): Promise<string | null> {
  const conteudoDireto = String(params.conteudoProgramatico || '').trim();
  if (conteudoDireto) {
    return conteudoDireto;
  }

  const codigos = buildQualificacaoCodigoFallbacks(params.qualificacaoCodigo);
  if (codigos.length === 0) {
    return null;
  }

  const empresaId = params.empresaId ?? null;
  const tiposHasEmpresaId =
    empresaId != null ? await tableHasColumn(db, 'qualificacoes_tipos', 'empresa_id') : false;

  if (tiposHasEmpresaId && empresaId != null) {
    for (const codigo of codigos) {
      const row = await db
        .prepare(
          `SELECT conteudo_programatico
             FROM qualificacoes_tipos
            WHERE deleted_at IS NULL
              AND empresa_id = ?
              AND UPPER(COALESCE(codigo, '')) = ?
              AND COALESCE(TRIM(conteudo_programatico), '') != ''
            ORDER BY id DESC
            LIMIT 1`,
        )
        .bind(empresaId, codigo)
        .first<{ conteudo_programatico?: string | null }>();

      const conteudo = String(row?.conteudo_programatico || '').trim();
      if (conteudo) {
        return conteudo;
      }
    }
  }

  if (!tiposHasEmpresaId) {
    for (const codigo of codigos) {
      const row = await db
        .prepare(
          `SELECT conteudo_programatico
             FROM qualificacoes_tipos
            WHERE deleted_at IS NULL
              AND UPPER(COALESCE(codigo, '')) = ?
              AND COALESCE(TRIM(conteudo_programatico), '') != ''
            ORDER BY id DESC
            LIMIT 1`,
        )
        .bind(codigo)
        .first<{ conteudo_programatico?: string | null }>();

      const conteudo = String(row?.conteudo_programatico || '').trim();
      if (conteudo) {
        return conteudo;
      }
    }
  }

  return null;
}

export function normalizeTipoTreinamento(value?: string | null): TipoTreinamento | undefined {
  if (!value) return undefined;

  const normalized = value
    .toString()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  if (normalized === 'SEMESTRAL') return 'SEMESTRAL';
  if (normalized === 'PERIODICO') return 'RECORRENTE';
  if (normalized === 'RECORRENTE') return 'RECORRENTE';
  if (normalized === 'INICIAL') return 'INICIAL';
  if (normalized === 'UPGRADE') return 'UPGRADE';
  if (normalized === 'ESPECIFICO') return 'ESPECIFICO';

  return undefined;
}

export function resolveCargaHorariaCertificado(params: {
  tipoTreinamento?: string | null;
  cargaHistorico?: unknown;
  cargaInicial?: unknown;
  cargaRecorrente?: unknown;
  cargaPadrao?: unknown;
}): number | undefined {
  const cargaInicial = toPositiveNumber(params.cargaInicial);
  const cargaRecorrente = toPositiveNumber(params.cargaRecorrente);
  const cargaPadrao = toPositiveNumber(params.cargaPadrao);
  const cargaHistorico = toPositiveNumber(params.cargaHistorico);
  const tipoTreinamento = normalizeTipoTreinamento(params.tipoTreinamento);

  if (cargaHistorico) {
    return cargaHistorico;
  }

  if (tipoTreinamento === 'RECORRENTE' || tipoTreinamento === 'SEMESTRAL') {
    return cargaRecorrente || cargaPadrao || cargaInicial;
  }

  if (tipoTreinamento === 'INICIAL') {
    return cargaInicial || cargaPadrao || cargaRecorrente;
  }

  return cargaPadrao || cargaRecorrente || cargaInicial;
}
