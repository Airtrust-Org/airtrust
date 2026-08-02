import { Hono } from 'hono';
import { rateLimiter, rateLimitPresets } from '../../middleware/rate-limit';
import type { Env } from '../../types';
import { calcularDataVencimento } from '../../utils/qualificacoes-expiration';

const validacao = new Hono<{ Bindings: Env }>();

type TipoTreinamento = 'INICIAL' | 'RECORRENTE' | 'SEMESTRAL' | 'UPGRADE' | 'ESPECIFICO';

function toPositiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeTipoTreinamento(value?: string | null): TipoTreinamento | undefined {
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

function resolveCargaHorariaCertificado(params: {
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

  if (tipoTreinamento === 'RECORRENTE' || tipoTreinamento === 'SEMESTRAL') {
    return cargaRecorrente || cargaPadrao || cargaInicial || cargaHistorico;
  }

  if (tipoTreinamento === 'INICIAL') {
    return cargaInicial || cargaPadrao || cargaRecorrente || cargaHistorico;
  }

  return cargaPadrao || cargaRecorrente || cargaInicial || cargaHistorico;
}

/**
 * GET /api/certificados/validar/:hash
 * Endpoint PÚBLICO (sem autenticação) para validar certificados
 * Retorna JSON com dados do certificado validado
 */
validacao.get('/:hash', rateLimiter(rateLimitPresets.certificateValidation), async (c) => {
  const { hash } = c.req.param();
  const db = c.env.DB;

  try {
    // Validar formato do hash (16 caracteres hexadecimais)
    if (!/^[A-F0-9]{16}$/i.test(hash)) {
      return c.json(
        {
          success: false,
          valido: false,
          mensagem: 'Código de verificação inválido (formato incorreto)',
        },
        400,
      );
    }

    console.log(`[VALIDAÇÃO] Verificando certificado com hash: ${hash}`);

    // Buscar certificados ativos de qualificacoes_historico que têm documento gerado
    // Usa a tabela documentos que é onde os certificados PDF são armazenados
    const { results } = await db
      .prepare(
        `
      SELECT 
        d.id,
        qh.numero_certificado,
        d.created_at,
        qh.data_conclusao,
        qh.data_vencimento,
        qh.validade_meses,
        qh.carga_horaria,
        qh.instrutor,
        qh.tipo_treinamento,
        f.nome as funcionario_nome,
        f.cpf as funcionario_cpf,
        f.codigo_anac,
        qt.nome as qualificacao_nome,
        qh.qualificacao_codigo as qualificacao_codigo,
        qt.categoria as qualificacao_categoria,
        qt.carga_horaria as qualificacao_carga_padrao,
        qt.carga_horaria_inicial as qualificacao_carga_inicial,
        qt.carga_horaria_recorrente as qualificacao_carga_recorrente,
        qt.validade as qualificacao_validade,
        COALESCE(qt.vencimento_fim_mes, 0) as vencimento_fim_mes,
        e.nome as empresa_nome
      FROM qualificacoes_historico qh
      INNER JOIN documentos d ON d.id = qh.certificado_arquivo_id
      INNER JOIN funcionarios f ON qh.funcionario_id = f.id
      INNER JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id
      INNER JOIN empresas e ON qh.empresa_id = e.id
      WHERE qh.deleted_at IS NULL
        AND d.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND qh.certificado_arquivo_id IS NOT NULL
        AND qh.numero_certificado IS NOT NULL
      ORDER BY d.created_at DESC
      LIMIT 1000
    `,
      )
      .all();

    console.log(`[VALIDAÇÃO] Encontrados ${results.length} certificados para verificar`);

    // Verificar hash para cada certificado
    for (const cert of results) {
      const certHash = await gerarHashCertificado({
        funcionario_cpf: cert.funcionario_cpf as string,
        qualificacao_codigo: cert.qualificacao_codigo as string,
        data_conclusao: cert.data_conclusao as string,
        numero_certificado: cert.numero_certificado as string,
      });

      if (certHash === hash.toUpperCase()) {
        console.log(`[VALIDAÇÃO] ✅ Certificado encontrado! ID: ${cert.id}`);

        const dataConclusao = String(cert.data_conclusao || '').trim();
        const validadeMesesNumero = Number(cert.validade_meses || cert.qualificacao_validade || 0);
        const vencimentoFimMes = Number(cert.vencimento_fim_mes || 0) === 1 ? 1 : 0;
        const cargaHorariaAtual = resolveCargaHorariaCertificado({
          tipoTreinamento: cert.tipo_treinamento as string | null,
          cargaHistorico: cert.carga_horaria,
          cargaInicial: cert.qualificacao_carga_inicial,
          cargaRecorrente: cert.qualificacao_carga_recorrente,
          cargaPadrao: cert.qualificacao_carga_padrao,
        });
        const dataVencimentoPersistido = String(cert.data_vencimento || '')
          .trim()
          .split('T')[0];
        const dataVencimentoAtual =
          dataVencimentoPersistido ||
          (dataConclusao && validadeMesesNumero > 0
            ? calcularDataVencimento(dataConclusao, validadeMesesNumero, vencimentoFimMes)
            : null);

        // Calcular validade em meses
        let validadeMeses = 'Indeterminada';
        if (dataConclusao && dataVencimentoAtual) {
          const conclusao = new Date(`${dataConclusao}T00:00:00Z`);
          const vencimento = new Date(`${dataVencimentoAtual}T00:00:00Z`);
          let meses = (vencimento.getFullYear() - conclusao.getFullYear()) * 12;
          meses += vencimento.getMonth() - conclusao.getMonth();

          if (meses <= 0) {
            validadeMeses = 'Indeterminada';
          } else if (meses === 1) {
            validadeMeses = '1 mês';
          } else {
            validadeMeses = `${meses} meses`;
          }
        }

        return c.json({
          success: true,
          valido: true,
          certificado: {
            numero: cert.numero_certificado,
            funcionario_nome: cert.funcionario_nome,
            funcionario_cpf: mascarCPF(cert.funcionario_cpf as string),
            codigo_anac: cert.codigo_anac || 'N/A',
            instrutor_nome: cert.instrutor || 'N/A',
            instrutor_codigo_anac: 'N/A',
            qualificacao_tipo: cert.qualificacao_categoria || 'N/A',
            qualificacao_nome: cert.qualificacao_nome,
            qualificacao_codigo: cert.qualificacao_codigo,
            categoria: cert.qualificacao_categoria || 'N/A',
            carga_horaria: cargaHorariaAtual ? `${cargaHorariaAtual} horas` : 'N/A',
            data_emissao: dataConclusao || cert.created_at,
            data_conclusao: dataConclusao || null,
            data_validade: dataVencimentoAtual,
            data_vencimento: dataVencimentoAtual
              ? formatarData(dataVencimentoAtual as string)
              : 'Indeterminada',
            validade: validadeMeses,
            empresa_nome: cert.empresa_nome,
            hash: certHash,
            tipo_treinamento: cert.tipo_treinamento || 'RECORRENTE',
          },
        });
      }
    }

    // Hash não encontrado
    console.log(`[VALIDAÇÃO] ❌ Hash não encontrado: ${hash}`);
    return c.json(
      {
        success: false,
        valido: false,
        mensagem: 'Certificado não encontrado. Verifique se o código foi digitado corretamente.',
      },
      404,
    );
  } catch (error) {
    console.error('[VALIDAÇÃO] Erro ao validar certificado:', error);
    return c.json(
      {
        success: false,
        valido: false,
        error: 'Erro ao validar certificado',
        mensagem: 'Ocorreu um erro ao processar sua solicitação. Tente novamente.',
      },
      500,
    );
  }
});

/**
 * Mascara CPF para privacidade (ex: ***.***.***-05)
 */
function mascarCPF(cpf: string): string {
  const limpo = cpf.replace(/\D/g, '');
  if (limpo.length !== 11) return '***.***.***-**';
  return `***.***.***-${limpo.slice(-2)}`;
}

/**
 * Formata data ISO para pt-BR
 */
function formatarData(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return 'Data inválida';
  }
}

/**
 * Gera hash SHA-256 (mesma função do pdf-generator)
 */
async function gerarHashCertificado(data: {
  funcionario_cpf: string;
  qualificacao_codigo: string;
  data_conclusao: string;
  numero_certificado: string;
}): Promise<string> {
  try {
    // Limpar CPF (remover formatação)
    const cpfLimpo = data.funcionario_cpf.replace(/[.\-\s]/g, '');
    const str = `${cpfLimpo}${data.qualificacao_codigo}${data.data_conclusao}${data.numero_certificado}`;

    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(str);

    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16)
      .toUpperCase();

    return hashHex;
  } catch (error) {
    console.error('Erro ao gerar hash:', error);
    return 'ERROR000000000';
  }
}

export default validacao;
