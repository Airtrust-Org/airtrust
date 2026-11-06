import { employeeSectorSql, type EmployeeSectorAccess } from '../middleware/employee-sector-access';
import { normalizeSearchText } from '../utils/text-search';
import { withD1Retry } from '../utils/d1-resilience';

export type TrainingCommunication = {
  id: string;
  funcionario_id: number;
  funcionario_nome: string | null;
  setor_nome: string | null;
  qualificacao_tipo_id: number | null;
  curso_id: number | null;
  qualificacao_nome: string | null;
  status_compliance: string | null;
  tipo: string | null;
  destinatario: string | null;
  destinatario_fonte: 'REGISTRO_ENVIO' | 'CADASTRO_ATUAL' | null;
  status_envio: string | null;
  erro: string | null;
  enviado_em: string | null;
  gestor: boolean;
  origem: 'COMPLIANCE' | 'LMS_ALERTA' | 'LMS_CONVITE';
  setor_id: number | null;
  funcao_id: number | null;
};

export type TrainingCommunicationFilters = {
  funcionario_q?: string;
  treinamento_q?: string;
  canal?: 'EMAIL' | 'WHATSAPP';
  origem?: TrainingCommunication['origem'];
  resultado?: 'enviada' | 'erro' | 'sem_contato' | 'pendente';
  inicio?: string;
  fim?: string;
  setor_id?: number;
  funcao_id?: number;
  limit: number;
  offset: number;
};

function accentInsensitiveSql(column: 'funcionario_nome' | 'qualificacao_nome'): string {
  // SQLite LOWER/NOCASE não remove acentos portugueses. A busca antiga fazia isso
  // em JavaScript; manter essa semântica antes da paginação SQL.
  const pairs: Array<[string, string]> = [
    ['á', 'a'], ['à', 'a'], ['â', 'a'], ['ã', 'a'], ['ä', 'a'],
    ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'],
    ['í', 'i'], ['ì', 'i'], ['î', 'i'], ['ï', 'i'],
    ['ó', 'o'], ['ò', 'o'], ['ô', 'o'], ['õ', 'o'], ['ö', 'o'],
    ['ú', 'u'], ['ù', 'u'], ['û', 'u'], ['ü', 'u'], ['ç', 'c'],
  ];
  let result = `COALESCE(${column}, '')`;
  for (const [accent, plain] of pairs) {
    result = `REPLACE(REPLACE(${result}, '${accent}', '${plain}'), '${accent.toUpperCase()}', '${plain}')`;
  }
  return `LOWER(${result})`;
}

export function maskTrainingContact(value: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.includes('@')) {
    const [local, domain] = raw.split('@');
    return `${local?.slice(0, 1) || '*'}***@${domain || '***'}`;
  }
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 4 ? `***${digits.slice(-4)}` : '***';
}

/**
 * A trilha histórica do LMS está em audit_logs; a de Compliance, em
 * notificacoes_log. Uma consulta consolidada evita reenvios e migrations
 * de dados reais apenas para reconstruir os eventos já registrados.
 *
 * Cada canal de um alerta LMS vira uma linha distinta. ENVIADO significa
 * aceitação pelo provedor, NÃO confirmação de entrega/leitura.
 */
export async function listTrainingCommunications(
  db: D1Database,
  empresaId: number,
  access: EmployeeSectorAccess,
  tables: { notifications: boolean; audit: boolean },
  filters: TrainingCommunicationFilters,
): Promise<{ rows: TrainingCommunication[]; has_more: boolean }> {
  const scope = employeeSectorSql(access, 'f');
  const selects: string[] = [];
  const bindings: unknown[] = [];

  if (tables.notifications) {
    selects.push(`
      SELECT 'compliance:' || n.id AS id,
             f.id AS funcionario_id, f.nome AS funcionario_nome,
             json_extract(n.corpo, '$.setor_nome') AS setor_nome,
             CAST(json_extract(n.corpo, '$.qualificacao_tipo_id') AS INTEGER) AS qualificacao_tipo_id,
             CAST(json_extract(n.corpo, '$.curso_id') AS INTEGER) AS curso_id,
             json_extract(n.corpo, '$.qualificacao_nome') AS qualificacao_nome,
             json_extract(n.corpo, '$.status_compliance') AS status_compliance,
             n.tipo AS tipo, n.destinatario AS destinatario,
             'REGISTRO_ENVIO' AS destinatario_fonte,
             n.status AS status_envio, n.erro_mensagem AS erro,
             COALESCE(n.enviado_em, n.created_at) AS enviado_em,
             CASE WHEN n.assunto LIKE '[COMPLIANCE_GESTOR:%' THEN 1 ELSE 0 END AS gestor,
             'COMPLIANCE' AS origem, f.setor_id AS setor_id, f.funcao_id AS funcao_id
        FROM notificacoes_log n
        JOIN funcionarios f ON f.empresa_id = n.empresa_id
          AND f.id = CAST(CASE WHEN json_valid(n.corpo) THEN json_extract(n.corpo, '$.funcionario_id') END AS INTEGER)
       WHERE n.empresa_id = ?
         AND (n.assunto LIKE '[COMPLIANCE_TREINAMENTO:%'
              OR n.assunto LIKE '[COMPLIANCE_GESTOR:%')
         AND json_valid(n.corpo) = 1
         -- Coordination rows are not additional deliveries; preserve indeterminate
         -- pending reservations for operators to reconcile safely.
         AND (n.assunto NOT LIKE '[COMPLIANCE_TREINAMENTO:RESERVA:%'
              OR n.status IN ('pendente', 'processando'))
         AND ${scope.clause}`);
    bindings.push(empresaId, ...scope.bindings);
  }

  if (tables.audit) {
    selects.push(`
      SELECT 'lms:' || a.id || ':' || channel.canal AS id,
             f.id AS funcionario_id, f.nome AS funcionario_nome,
             NULL AS setor_nome,
             c.qualificacao_tipo_id AS qualificacao_tipo_id,
             CAST(json_extract(a.new_values, '$.curso_id') AS INTEGER) AS curso_id,
             COALESCE(json_extract(a.new_values, '$.curso_titulo'), c.titulo) AS qualificacao_nome,
             json_extract(a.new_values, '$.status_matricula') AS status_compliance,
             channel.canal AS tipo,
             CASE WHEN channel.canal = 'EMAIL' THEN
                 COALESCE(json_extract(a.new_values, '$.email_destinatario_mascarado'), f.email)
               ELSE COALESCE(json_extract(a.new_values, '$.whatsapp_destinatario_mascarado'), f.telefone)
             END AS destinatario,
             CASE WHEN (channel.canal = 'EMAIL' AND json_extract(a.new_values, '$.email_destinatario_mascarado') IS NOT NULL)
                    OR (channel.canal = 'WHATSAPP' AND json_extract(a.new_values, '$.whatsapp_destinatario_mascarado') IS NOT NULL)
               THEN 'REGISTRO_ENVIO' ELSE 'CADASTRO_ATUAL' END AS destinatario_fonte,
             CASE json_extract(a.new_values, channel.result_path)
               WHEN 'ENVIADO' THEN 'enviada'
               WHEN 'FALHA' THEN 'erro'
               WHEN 'PENDENTE' THEN 'pendente'
               WHEN 'SEM_EMAIL' THEN 'sem_contato'
               WHEN 'SEM_WHATSAPP' THEN 'sem_contato'
               ELSE 'desconhecido' END AS status_envio,
             NULL AS erro, a.created_at AS enviado_em, 0 AS gestor,
             CASE WHEN a.action IN ('LMS_MATRICULA_ALERTA', 'LMS_MATRICULA_ALERTA_PREPARADO') THEN 'LMS_ALERTA'
                  ELSE 'LMS_CONVITE' END AS origem,
             f.setor_id AS setor_id, f.funcao_id AS funcao_id
        FROM audit_logs a
        JOIN funcionarios f ON f.empresa_id = a.empresa_id
          AND f.id = CAST(CASE WHEN json_valid(a.new_values) THEN json_extract(a.new_values, '$.funcionario_id') END AS INTEGER)
        LEFT JOIN lms_cursos c ON c.id = CAST(CASE WHEN json_valid(a.new_values)
          THEN json_extract(a.new_values, '$.curso_id') END AS INTEGER)
          AND c.empresa_id = a.empresa_id
        JOIN (
          SELECT 'EMAIL' AS canal, '$.email_resultado' AS result_path
          UNION ALL SELECT 'WHATSAPP', '$.whatsapp_resultado'
        ) channel ON json_extract(a.new_values, channel.result_path) IS NOT NULL
       WHERE a.empresa_id = ?
         AND a.action IN (
           'LMS_MATRICULA_ALERTA', 'LMS_MATRICULA_CONVITE_EMAIL',
           'LMS_MATRICULA_ALERTA_PREPARADO', 'LMS_MATRICULA_CONVITE_EMAIL_PREPARADO'
         )
         AND (a.action NOT LIKE '%_PREPARADO' OR NOT EXISTS (
           SELECT 1 FROM audit_logs done
           WHERE done.empresa_id = a.empresa_id
             AND done.action = REPLACE(a.action, '_PREPARADO', '')
             AND done.entity_type = a.entity_type
             AND done.entity_id = a.entity_id
             AND json_valid(done.new_values) = 1
             AND json_extract(done.new_values, '$.tentativa_id') =
                 json_extract(a.new_values, '$.tentativa_id')
         ))
         AND a.entity_type = 'lms_matriculas'
         AND json_valid(a.new_values) = 1
         AND ${scope.clause}`);
    bindings.push(empresaId, ...scope.bindings);
  }

  if (!selects.length) return { rows: [], has_more: false };

  const where: string[] = ['funcionario_id > 0'];
  const terms: unknown[] = [];
  if (filters.funcionario_q?.trim()) {
    where.push(`${accentInsensitiveSql('funcionario_nome')} LIKE ?`);
    terms.push(`%${normalizeSearchText(filters.funcionario_q)}%`);
  }
  if (filters.treinamento_q?.trim()) {
    where.push(`${accentInsensitiveSql('qualificacao_nome')} LIKE ?`);
    terms.push(`%${normalizeSearchText(filters.treinamento_q)}%`);
  }
  if (filters.canal) {
    where.push('UPPER(COALESCE(tipo, \'\')) LIKE ?');
    terms.push(`${filters.canal}%`);
  }
  if (filters.origem) {
    where.push('origem = ?');
    terms.push(filters.origem);
  }
  if (filters.resultado) {
    where.push('status_envio = ?');
    terms.push(filters.resultado);
  }
  if (filters.inicio) {
    where.push('substr(enviado_em, 1, 10) >= ?');
    terms.push(filters.inicio);
  }
  if (filters.fim) {
    where.push('substr(enviado_em, 1, 10) <= ?');
    terms.push(filters.fim);
  }
  if (filters.setor_id) {
    where.push('setor_id = ?');
    terms.push(filters.setor_id);
  }
  if (filters.funcao_id) {
    where.push('funcao_id = ?');
    terms.push(filters.funcao_id);
  }

  const limit = Math.min(200, Math.max(1, filters.limit));
  const offset = Math.max(0, filters.offset);
  const sql = `WITH communications AS (${selects.join(' UNION ALL ')})
    SELECT * FROM communications
     WHERE ${where.join(' AND ')}
     ORDER BY enviado_em DESC, id DESC
     LIMIT ? OFFSET ?`;
  const result = await withD1Retry(() =>
    db
      .prepare(sql)
      .bind(...bindings, ...terms, limit + 1, offset)
      .all<Omit<TrainingCommunication, 'gestor'> & { gestor: number }>(),
  );
  const raw = result.results || [];
  return {
    rows: raw.slice(0, limit).map((row) => ({
      ...row,
      gestor: Boolean(row.gestor),
      destinatario: maskTrainingContact(row.destinatario),
    })),
    has_more: raw.length > limit,
  };
}
