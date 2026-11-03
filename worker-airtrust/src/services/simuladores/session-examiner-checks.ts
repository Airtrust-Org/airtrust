import {
  findExaminadorElegivel,
  findFichaEspecial,
  findTipoAeronaveDeFichaDaSessao,
  insertFichaEspecial,
  insertSessaoChecks,
  listCodigosChecksAtuais,
  mapModelosEspeciais,
  softDeleteFichaEspecial,
  softDeleteSessaoChecks,
  updateSessaoCheckFields,
  type FichaEspecialRow,
} from '../../repositories/simuladores/session-checks-repository';
import { audit } from './shared';

/**
 * Fase "examinador + checks + fichas especiais" do PUT /sessoes/:id.
 * Movida de routes/simuladores-sessoes-update.ts sem mudar regras, ordem de
 * escrita nem textos de erro (fixada por simuladores-sessoes-update-checks.characterization.test).
 */

type Id = string | number;

/** Campos do corpo do PUT usados por esta fase. */
export interface SessaoChecksBody {
  examinador_id?: unknown;
  checks?: unknown;
  instrutor_id?: unknown;
  tipo_aeronave?: unknown;
  data?: unknown;
  gerar_ficha_examinador?: unknown;
}

/** Colunas da sessão (lidas antes do UPDATE) usadas por esta fase. */
export interface SessaoChecksRow {
  examinador_id?: unknown;
  is_check?: unknown;
  instrutor_id?: unknown;
  data?: unknown;
}

export interface ExaminadorChecksIntent {
  /** undefined = não veio no corpo; null = removido; número = informado. */
  examinadorIdBodyRaw: number | null | undefined;
  wantsCheck: 0 | 1;
  /** Só atualiza examinador/is_check/vínculos quando o corpo traz examinador_id ou checks. */
  shouldUpdate: boolean;
}

export function planExaminadorChecks(body: SessaoChecksBody): ExaminadorChecksIntent {
  const examinadorIdBodyRaw =
    body.examinador_id === undefined
      ? undefined
      : body.examinador_id === null
        ? null
        : Number(body.examinador_id);
  return {
    examinadorIdBodyRaw,
    wantsCheck: examinadorIdBodyRaw ? 1 : 0,
    shouldUpdate: body.examinador_id !== undefined || body.checks !== undefined,
  };
}

export type SyncExaminadorChecksResult =
  | { ok: true; examinadorIdBodyRaw: number | null | undefined }
  | { ok: false; status: 400; error: string };

/**
 * CHECKS COM EXAMINADORES
 * - Se examinador_id informado: is_check=1
 * - Se examinador_id removido: is_check=0 e soft-delete vínculos
 * - Atualiza vínculos em sessoes_checks
 */
export async function syncExaminadorChecks(
  db: D1Database,
  params: {
    empresaId: number;
    sessaoId: Id;
    sessao: SessaoChecksRow;
    body: SessaoChecksBody;
    checksNormalizados: number[];
  },
): Promise<SyncExaminadorChecksResult> {
  const { empresaId, sessaoId, sessao, body, checksNormalizados } = params;
  const { examinadorIdBodyRaw, wantsCheck, shouldUpdate } = planExaminadorChecks(body);

  if (!shouldUpdate) return { ok: true, examinadorIdBodyRaw };

  // Validar examinador quando presente
  if (examinadorIdBodyRaw) {
    const examinador = await findExaminadorElegivel(db, examinadorIdBodyRaw, empresaId);
    if (!examinador) {
      return { ok: false, status: 400, error: 'Examinador inválido' };
    }
  }

  // Se tiver examinador, exige checks (pelo menos 1)
  if (examinadorIdBodyRaw && checksNormalizados.length === 0) {
    return { ok: false, status: 400, error: 'Selecione pelo menos 1 check ao informar examinador' };
  }

  // Atualizar campos na sessão
  await updateSessaoCheckFields(db, sessaoId, empresaId, examinadorIdBodyRaw || null, wantsCheck);

  // Soft delete vínculos existentes (e resultados ligados a eles)
  await softDeleteSessaoChecks(db, sessaoId);

  // Inserir vínculos novos (se for check)
  if (wantsCheck && checksNormalizados.length > 0) {
    await insertSessaoChecks(db, sessaoId, checksNormalizados);
  }

  await audit(db, {
    tabela: 'simulador_agendamentos',
    acao: 'UPDATE_CHECK_FIELDS',
    registro_id: sessaoId,
    dados_anteriores: {
      examinador_id: sessao.examinador_id,
      is_check: sessao.is_check,
    },
    dados_novos: {
      examinador_id: examinadorIdBodyRaw || null,
      is_check: wantsCheck,
      checks: checksNormalizados,
    },
  });

  return { ok: true, examinadorIdBodyRaw };
}

/** Ficha especial já assinada, concluída ou fora de AVALIACAO_PENDENTE não pode ser apagada. */
export function isFichaEspecialUtilizada(ficha: FichaEspecialRow): boolean {
  return Boolean(
    ficha.assinatura_aluno_timestamp ||
      ficha.assinatura_instrutor_timestamp ||
      ficha.assinatura_aluno_imagem ||
      ficha.assinatura_instrutor_imagem ||
      ficha.data_conclusao ||
      (ficha.status && ficha.status !== 'AVALIACAO_PENDENTE'),
  );
}

/**
 * FICHAS ESPECIAIS: TREINAMENTO DE INSTRUTOR / CREDENCIAMENTO DE EXAMINADOR
 * Executado independentemente de syncExaminadorChecks mudar algo.
 * Condições (OR):
 *   1. Flag explícita no body: gerar_ficha_examinador
 *   2. Codes FAP13 presentes nos checks atuais da sessão
 */
export async function syncFichasEspeciais(
  db: D1Database,
  params: {
    empresaId: number;
    sessaoId: Id;
    sessao: SessaoChecksRow;
    body: SessaoChecksBody;
    examinadorIdBodyRaw: number | null | undefined;
  },
): Promise<void> {
  const { empresaId, sessaoId, sessao, body, examinadorIdBodyRaw } = params;
  const instrutorEspecial = body.instrutor_id !== undefined ? body.instrutor_id : sessao.instrutor_id;
  if (!instrutorEspecial) return;

  // Buscar códigos dos checks atuais da sessão
  const codsAtuais = (await listCodigosChecksAtuais(db, sessaoId)).map((codigo) =>
    String(codigo || '').toUpperCase(),
  );

  // Buscar template_ids dos modelos especiais
  const tplMap = await mapModelosEspeciais(db, empresaId);

  // Inferir tipo_aeronave das fichas existentes
  let tipoAeronaveEsp: unknown = body.tipo_aeronave || null;
  if (!tipoAeronaveEsp) {
    tipoAeronaveEsp = await findTipoAeronaveDeFichaDaSessao(db, sessaoId, empresaId);
  }
  const dataEsp = body.data || sessao.data;
  const examinadorEsp =
    examinadorIdBodyRaw !== undefined ? examinadorIdBodyRaw : (sessao.examinador_id ?? null);

  const fichasEsp = [
    {
      modelo: 'CRED-EXA',
      ativo: body.gerar_ficha_examinador === true || codsAtuais.some((c) => c.startsWith('FAP13')),
    },
  ];

  for (const esp of fichasEsp) {
    const existe = await findFichaEspecial(db, {
      sessaoId,
      alunoId: instrutorEspecial,
      tipoSessao: esp.modelo,
      empresaId,
    });

    if (!esp.ativo) {
      if (existe && !isFichaEspecialUtilizada(existe)) {
        await softDeleteFichaEspecial(db, existe.id, empresaId);
      }
      continue;
    }

    if (!existe) {
      await insertFichaEspecial(db, {
        uuid: crypto.randomUUID(),
        sessaoId,
        alunoId: instrutorEspecial,
        instrutorId: examinadorEsp || instrutorEspecial,
        tipoSessao: esp.modelo,
        tipoAeronave: tipoAeronaveEsp,
        dataSessao: dataEsp,
        templateId: tplMap.get(esp.modelo) ?? null,
        empresaId,
      });
    }
  }
}
