import {
  calcularAtualizacaoDominio,
  normalizarPrioridadeRevisao,
  periodoQuinzena,
  pontuarCandidato,
  selecionarQuestoesDesafio,
  type CandidatoDesafio,
  type ConhecimentoConfianca,
  type DominioAtual,
} from './retencao';

const QUESTOES_POR_DESAFIO = 10;
const DESAFIOS_RECOMENDADOS_POR_QUINZENA = 2;
const MODELOS_CONHECIMENTO_ATIVO = ['AW139', 'SK76'] as const;

type Criticidade = CandidatoDesafio['criticidade'];

interface CandidatoRow {
  questao_id: number;
  item_id: number;
  topico_id: number;
  criticidade: Criticidade;
  nivel: number | null;
  proxima_revisao_em: string | null;
  ultima_exposicao_em: string | null;
  respondida_vezes: number;
  ultima_resposta_em: string | null;
}

interface SnapshotAlternativa {
  id: number;
  texto: string;
  ordem: number;
}

interface QuestaoSnapshot {
  questaoId: number;
  itemId: number;
  tipo: string;
  enunciado: string;
  explicacao: string;
  oQueGuardar: string | null;
  imagemR2Key: string | null;
  alternativaCorretaId: number;
  alternativas: SnapshotAlternativa[];
  topico: string;
  criticidade: Criticidade;
}

interface FonteSnapshot {
  tipoDocumento: string;
  titulo: string;
  revisao: string;
  secao: string | null;
  pagina: string | null;
  referencia: string | null;
}

interface ChallengeRow {
  id: number;
  empresa_id: number;
  funcionario_id: number;
  aeronave_modelo: string;
  periodo_chave: string;
  numero_desafio: number;
  numero_sequencial: number | null;
  topico_id: number | null;
  status: 'DISPONIVEL' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'EXPIRADO';
  disponivel_em: string;
  expira_em: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
  xp_concedido: number;
}

function numeroSequencialDesafio(desafio: ChallengeRow): number {
  return Number(desafio.numero_sequencial ?? desafio.numero_desafio);
}

function normalizarDesafio(desafio: ChallengeRow): ChallengeRow {
  return { ...desafio, numero_desafio: numeroSequencialDesafio(desafio) };
}

interface ChallengeQuestionRow {
  id: number;
  desafio_id: number;
  questao_id: number;
  item_id: number;
  ordem: number;
  questao_snapshot_json: string;
  fonte_snapshot_json: string | null;
  resposta_id: number | null;
  alternativa_id: number | null;
  correta: number | null;
  confianca: ConhecimentoConfianca | null;
  respondido_em: string | null;
}

export function normalizarModeloConhecimento(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  if (normalized === 'S76' || normalized === 'S-76') return 'SK76';
  return normalized;
}

export function modelosConhecimentoAtivoDisponiveis(): string[] {
  return [...MODELOS_CONHECIMENTO_ATIVO];
}

async function validarTopicoModelo(params: {
  db: D1Database;
  empresaId: number;
  modelo: string;
  topicoId: number;
}) {
  const { db, empresaId, modelo, topicoId } = params;
  const topico = await db
    .prepare(
      'SELECT id,nome,aeronave_modelo FROM conhecimento_ativo_topicos ' +
        'WHERE id=? AND empresa_id=? AND ativo=1 AND deleted_at IS NULL LIMIT 1',
    )
    .bind(topicoId, empresaId)
    .first<{ id: number; nome: string; aeronave_modelo: string | null }>();
  if (!topico) {
    const error = new Error('Área de conhecimento inválida ou indisponível');
    error.name = 'TOPICO_INVALIDO';
    throw error;
  }
  const modeloTopico = topico.aeronave_modelo
    ? normalizarModeloConhecimento(topico.aeronave_modelo)
    : null;
  if (modeloTopico !== modelo) {
    const error = new Error('Área de conhecimento não pertence ao modelo selecionado');
    error.name = 'TOPICO_FORA_ESCOPO';
    throw error;
  }
  return topico;
}

async function primeiroTopicoElegivel(
  db: D1Database,
  empresaId: number,
  modelo: string,
): Promise<number | null> {
  const row = await db
    .prepare(
      `
      SELECT t.id
      FROM conhecimento_ativo_topicos t
      WHERE t.empresa_id=?
        AND t.ativo=1
        AND t.deleted_at IS NULL
        AND UPPER(REPLACE(t.aeronave_modelo,'-',''))=?
        AND (
          SELECT COUNT(DISTINCT i.id)
          FROM conhecimento_ativo_itens i
          JOIN conhecimento_ativo_questoes q
            ON q.item_id=i.id AND q.empresa_id=i.empresa_id
          WHERE i.empresa_id=t.empresa_id
            AND i.topico_id=t.id
            AND i.status='APROVADO'
            AND i.ativo=1
            AND i.deleted_at IS NULL
            AND q.status='APROVADA'
            AND q.ativo=1
            AND q.deleted_at IS NULL
            AND LENGTH(TRIM(q.explicacao))>0
            AND EXISTS (
              SELECT 1
              FROM conhecimento_ativo_item_fontes jf
              JOIN conhecimento_ativo_fontes f
                ON f.id=jf.fonte_id AND f.empresa_id=jf.empresa_id
              WHERE jf.empresa_id=i.empresa_id
                AND jf.item_id=i.id
                AND jf.deleted_at IS NULL
                AND f.status='VIGENTE'
                AND f.deleted_at IS NULL
            )
            AND (
              SELECT COUNT(*)
              FROM conhecimento_ativo_alternativas a
              WHERE a.empresa_id=q.empresa_id
                AND a.questao_id=q.id
                AND a.deleted_at IS NULL
            )>=2
            AND (
              SELECT COUNT(*)
              FROM conhecimento_ativo_alternativas a
              WHERE a.empresa_id=q.empresa_id
                AND a.questao_id=q.id
                AND a.correta=1
                AND a.deleted_at IS NULL
            )=1
        )>=10
      ORDER BY t.ordem,t.nome
      LIMIT 1
    `,
    )
    .bind(empresaId, modelo.replace(/-/g, ''))
    .first<{ id: number }>();
  return row?.id ?? null;
}

async function buscarCandidatos(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
  modelo: string,
  topicoId: number | null,
): Promise<CandidatoRow[]> {
  const result = await db
    .prepare(
      `
      SELECT
        q.id AS questao_id,
        q.item_id,
        i.topico_id,
        i.criticidade,
        d.nivel,
        d.proxima_revisao_em,
        d.ultima_exposicao_em,
        (
          SELECT COUNT(*)
          FROM conhecimento_ativo_respostas r
          JOIN conhecimento_ativo_desafio_questoes dq
            ON dq.id=r.desafio_questao_id
          WHERE r.empresa_id=q.empresa_id
            AND r.funcionario_id=?
            AND dq.questao_id=q.id
        ) AS respondida_vezes,
        (
          SELECT MAX(r.respondido_em)
          FROM conhecimento_ativo_respostas r
          JOIN conhecimento_ativo_desafio_questoes dq
            ON dq.id=r.desafio_questao_id
          WHERE r.empresa_id=q.empresa_id
            AND r.funcionario_id=?
            AND dq.questao_id=q.id
        ) AS ultima_resposta_em
      FROM conhecimento_ativo_questoes q
      JOIN conhecimento_ativo_itens i
        ON i.id=q.item_id AND i.empresa_id=q.empresa_id
      LEFT JOIN conhecimento_ativo_dominio d
        ON d.empresa_id=q.empresa_id
       AND d.funcionario_id=?
       AND d.item_id=i.id
       AND d.deleted_at IS NULL
      WHERE q.empresa_id=?
        AND q.status='APROVADA'
        AND q.ativo=1
        AND q.deleted_at IS NULL
        AND LENGTH(TRIM(q.explicacao))>0
        AND i.status='APROVADO'
        AND i.ativo=1
        AND i.deleted_at IS NULL
        AND (i.aeronave_modelo IS NULL OR UPPER(REPLACE(i.aeronave_modelo,'-',''))=?)
        AND (? IS NULL OR i.topico_id=?)
        AND EXISTS (
          SELECT 1
          FROM conhecimento_ativo_item_fontes jf
          JOIN conhecimento_ativo_fontes f
            ON f.id=jf.fonte_id AND f.empresa_id=jf.empresa_id
          WHERE jf.empresa_id=q.empresa_id
            AND jf.item_id=i.id
            AND jf.deleted_at IS NULL
            AND f.status='VIGENTE'
            AND f.deleted_at IS NULL
        )
        AND (
          SELECT COUNT(*)
          FROM conhecimento_ativo_alternativas a
          WHERE a.empresa_id=q.empresa_id
            AND a.questao_id=q.id
            AND a.deleted_at IS NULL
        )>=2
        AND (
          SELECT COUNT(*)
          FROM conhecimento_ativo_alternativas a
          WHERE a.empresa_id=q.empresa_id
            AND a.questao_id=q.id
            AND a.correta=1
            AND a.deleted_at IS NULL
        )=1
      ORDER BY q.id
      LIMIT 500
    `,
    )
    .bind(
      funcionarioId,
      funcionarioId,
      funcionarioId,
      empresaId,
      modelo.replace(/-/g, ''),
      topicoId,
      topicoId,
    )
    .all<CandidatoRow>();

  return result.results || [];
}

function toCandidate(row: CandidatoRow): CandidatoDesafio {
  return {
    questaoId: row.questao_id,
    itemId: row.item_id,
    topicoId: row.topico_id,
    criticidade: row.criticidade,
    nivel: row.nivel,
    proximaRevisaoEm: row.proxima_revisao_em,
    ultimaExposicaoEm: row.ultima_exposicao_em,
    respondidaVezes: Number(row.respondida_vezes || 0),
    ultimaRespostaEm: row.ultima_resposta_em,
  };
}

function selecionarPersonalizado(
  candidatos: CandidatoRow[],
  quantidade: number,
  diversificarTopicos: boolean,
): CandidatoDesafio[] {
  return selecionarQuestoesDesafio(candidatos.map(toCandidate), quantidade, {
    diversificarTopicos,
  });
}

async function construirSnapshot(
  db: D1Database,
  empresaId: number,
  questaoId: number,
): Promise<{ questao: QuestaoSnapshot; fontes: FonteSnapshot[] }> {
  const row = await db
    .prepare(
      'SELECT q.id, q.item_id, q.tipo, q.enunciado, q.explicacao, q.o_que_guardar, ' +
        'q.imagem_r2_key, i.criticidade, t.nome AS topico ' +
        'FROM conhecimento_ativo_questoes q ' +
        'JOIN conhecimento_ativo_itens i ON i.id=q.item_id AND i.empresa_id=q.empresa_id ' +
        'JOIN conhecimento_ativo_topicos t ON t.id=i.topico_id AND t.empresa_id=i.empresa_id ' +
        "WHERE q.id=? AND q.empresa_id=? AND q.status='APROVADA' " +
        "AND q.ativo=1 AND q.deleted_at IS NULL AND i.status='APROVADO' " +
        'AND i.ativo=1 AND i.deleted_at IS NULL LIMIT 1',
    )
    .bind(questaoId, empresaId)
    .first<{
      id: number;
      item_id: number;
      tipo: string;
      enunciado: string;
      explicacao: string;
      o_que_guardar: string | null;
      imagem_r2_key: string | null;
      criticidade: Criticidade;
      topico: string;
    }>();

  if (!row) throw new Error('Questão aprovada não encontrada durante geração do desafio');
  if (!row.explicacao?.trim()) throw new Error('Questão aprovada sem explicação didática');

  const alternatives = await db
    .prepare(
      'SELECT id, texto, ordem, correta FROM conhecimento_ativo_alternativas ' +
        'WHERE empresa_id=? AND questao_id=? AND deleted_at IS NULL ORDER BY ordem',
    )
    .bind(empresaId, questaoId)
    .all<{ id: number; texto: string; ordem: number; correta: number }>();

  const rows = alternatives.results || [];
  const correct = rows.filter((alt) => alt.correta === 1);
  if (rows.length < 2 || correct.length !== 1) {
    throw new Error('Questão sem contrato válido de alternativas');
  }

  const sources = await db
    .prepare(
      'SELECT f.tipo_documento, f.titulo, f.revisao, jf.secao, jf.pagina, jf.referencia ' +
        'FROM conhecimento_ativo_item_fontes jf ' +
        'JOIN conhecimento_ativo_fontes f ON f.id=jf.fonte_id AND f.empresa_id=jf.empresa_id ' +
        'WHERE jf.empresa_id=? AND jf.item_id=? AND jf.deleted_at IS NULL ' +
        "AND f.status='VIGENTE' AND f.deleted_at IS NULL " +
        'ORDER BY jf.principal DESC, f.id',
    )
    .bind(empresaId, row.item_id)
    .all<{
      tipo_documento: string;
      titulo: string;
      revisao: string;
      secao: string | null;
      pagina: string | null;
      referencia: string | null;
    }>();

  if (!sources.results?.length) {
    throw new Error('Item aprovado sem fonte técnica vigente');
  }

  return {
    questao: {
      questaoId: row.id,
      itemId: row.item_id,
      tipo: row.tipo,
      enunciado: row.enunciado,
      explicacao: row.explicacao,
      oQueGuardar: row.o_que_guardar,
      imagemR2Key: row.imagem_r2_key,
      alternativaCorretaId: correct[0].id,
      alternativas: rows.map(({ id, texto, ordem }) => ({ id, texto, ordem })),
      topico: row.topico,
      criticidade: row.criticidade,
    },
    fontes: (sources.results || []).map((source) => ({
      tipoDocumento: source.tipo_documento,
      titulo: source.titulo,
      revisao: source.revisao,
      secao: source.secao,
      pagina: source.pagina,
      referencia: source.referencia,
    })),
  };
}

async function garantirQuantidadeQuestoesDesafio(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  desafio: ChallengeRow;
}) {
  const { db, empresaId, funcionarioId, desafio } = params;
  if (desafio.status === 'CONCLUIDO' || desafio.status === 'EXPIRADO') return;

  const existentes = await db
    .prepare(
      'SELECT questao_id,item_id,ordem FROM conhecimento_ativo_desafio_questoes ' +
        'WHERE empresa_id=? AND desafio_id=? AND deleted_at IS NULL ORDER BY ordem',
    )
    .bind(empresaId, desafio.id)
    .all<{ questao_id: number; item_id: number; ordem: number }>();
  const atuais = existentes.results || [];
  if (atuais.length >= QUESTOES_POR_DESAFIO) return;

  const itensUsados = new Set(atuais.map((row) => row.item_id));
  const candidatos = (
    await buscarCandidatos(db, empresaId, funcionarioId, desafio.aeronave_modelo, desafio.topico_id)
  ).filter((row) => !itensUsados.has(row.item_id));
  const faltantes = QUESTOES_POR_DESAFIO - atuais.length;
  const selecionadas = selecionarPersonalizado(candidatos, faltantes, desafio.topico_id == null);

  if (selecionadas.length < faltantes) {
    const error = new Error(
      `Conteúdo aprovado insuficiente para completar o desafio com ${QUESTOES_POR_DESAFIO} questões`,
    );
    error.name = 'CONTEUDO_INSUFICIENTE';
    throw error;
  }

  const maxOrdem = atuais.reduce((max, row) => Math.max(max, row.ordem), 0);
  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < selecionadas.length; index += 1) {
    const selected = selecionadas[index];
    const snapshot = await construirSnapshot(db, empresaId, selected.questaoId);
    statements.push(
      db
        .prepare(
          'INSERT INTO conhecimento_ativo_desafio_questoes ' +
            '(empresa_id,desafio_id,questao_id,item_id,ordem,questao_snapshot_json,fonte_snapshot_json) ' +
            'VALUES (?,?,?,?,?,?,?)',
        )
        .bind(
          empresaId,
          desafio.id,
          selected.questaoId,
          selected.itemId,
          maxOrdem + index + 1,
          JSON.stringify(snapshot.questao),
          JSON.stringify(snapshot.fontes),
        ),
    );
  }
  if (statements.length) await db.batch(statements);
}

export async function gerarOuObterDesafio(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  modeloSolicitado?: string | null;
  topicoSolicitado?: number | null;
  modoMisto?: boolean;
}): Promise<{ desafio: ChallengeRow; criado: boolean }> {
  const { db, empresaId, funcionarioId } = params;
  const modelos = modelosConhecimentoAtivoDisponiveis();
  const modelo = params.modeloSolicitado
    ? normalizarModeloConhecimento(params.modeloSolicitado)
    : modelos[0];
  if (!modelos.includes(modelo)) {
    const error = new Error('Modelo de aeronave não disponível no Conhecimento Ativo');
    error.name = 'AERONAVE_FORA_ESCOPO';
    throw error;
  }

  const modoMisto = params.modoMisto === true;
  const topicoId = modoMisto
    ? null
    : params.topicoSolicitado ?? (await primeiroTopicoElegivel(db, empresaId, modelo));
  if (!modoMisto && !topicoId) {
    const error = new Error('Não há área com conteúdo suficiente para este modelo');
    error.name = 'CONTEUDO_INSUFICIENTE';
    throw error;
  }
  if (topicoId) await validarTopicoModelo({ db, empresaId, modelo, topicoId });

  const periodo = periodoQuinzena();
  const existing = modoMisto
    ? await db
        .prepare(
          'SELECT * FROM conhecimento_ativo_desafios ' +
            'WHERE empresa_id=? AND funcionario_id=? AND aeronave_modelo=? ' +
            "AND periodo_chave=? AND topico_id IS NULL AND status IN ('DISPONIVEL','EM_ANDAMENTO') " +
            'AND deleted_at IS NULL ORDER BY COALESCE(numero_sequencial,numero_desafio) LIMIT 1',
        )
        .bind(empresaId, funcionarioId, modelo, periodo.chave)
        .first<ChallengeRow>()
    : await db
        .prepare(
          'SELECT * FROM conhecimento_ativo_desafios ' +
            'WHERE empresa_id=? AND funcionario_id=? AND aeronave_modelo=? ' +
            "AND periodo_chave=? AND topico_id=? AND status IN ('DISPONIVEL','EM_ANDAMENTO') " +
            'AND deleted_at IS NULL ORDER BY COALESCE(numero_sequencial,numero_desafio) LIMIT 1',
        )
        .bind(empresaId, funcionarioId, modelo, periodo.chave, topicoId)
        .first<ChallengeRow>();
  if (existing) {
    await garantirQuantidadeQuestoesDesafio({ db, empresaId, funcionarioId, desafio: existing });
    return { desafio: normalizarDesafio(existing), criado: false };
  }

  const count = await db
    .prepare(
      'SELECT COUNT(*) AS total FROM conhecimento_ativo_desafios ' +
        'WHERE empresa_id=? AND funcionario_id=? AND aeronave_modelo=? ' +
        'AND periodo_chave=? AND deleted_at IS NULL',
    )
    .bind(empresaId, funcionarioId, modelo, periodo.chave)
    .first<{ total: number }>();

  const numeroDesafio = Number(count?.total || 0) + 1;
  const numeroDesafioLegado = Math.min(numeroDesafio, DESAFIOS_RECOMENDADOS_POR_QUINZENA);

  const candidatos = await buscarCandidatos(db, empresaId, funcionarioId, modelo, topicoId);
  const selecionadas = selecionarPersonalizado(candidatos, QUESTOES_POR_DESAFIO, topicoId == null);

  if (selecionadas.length < QUESTOES_POR_DESAFIO) {
    const error = new Error(
      `Conteúdo aprovado insuficiente para gerar um desafio com ${QUESTOES_POR_DESAFIO} questões`,
    );
    error.name = 'CONTEUDO_INSUFICIENTE';
    throw error;
  }

  const insert = await db
    .prepare(
      'INSERT INTO conhecimento_ativo_desafios ' +
        '(empresa_id,funcionario_id,aeronave_modelo,periodo_chave,numero_desafio,numero_sequencial,topico_id,expira_em) ' +
        'VALUES (?,?,?,?,?,?,?,?) RETURNING id',
    )
    .bind(
      empresaId,
      funcionarioId,
      modelo,
      periodo.chave,
      numeroDesafioLegado,
      numeroDesafio,
      topicoId,
      periodo.fim,
    )
    .first<{ id: number }>();

  if (!insert?.id) throw new Error('Falha ao criar desafio técnico');

  try {
    const statements: D1PreparedStatement[] = [];
    for (let index = 0; index < selecionadas.length; index += 1) {
      const selected = selecionadas[index];
      const snapshot = await construirSnapshot(db, empresaId, selected.questaoId);
      statements.push(
        db
          .prepare(
            'INSERT INTO conhecimento_ativo_desafio_questoes ' +
              '(empresa_id,desafio_id,questao_id,item_id,ordem,questao_snapshot_json,fonte_snapshot_json) ' +
              'VALUES (?,?,?,?,?,?,?)',
          )
          .bind(
            empresaId,
            insert.id,
            selected.questaoId,
            selected.itemId,
            index + 1,
            JSON.stringify(snapshot.questao),
            JSON.stringify(snapshot.fontes),
          ),
      );
    }
    await db.batch(statements);
  } catch (error) {
    await db
      .prepare(
        "UPDATE conhecimento_ativo_desafios SET deleted_at=datetime('now'), updated_at=datetime('now') " +
          'WHERE id=? AND empresa_id=?',
      )
      .bind(insert.id, empresaId)
      .run();
    throw error;
  }

  const challenge = await db
    .prepare('SELECT * FROM conhecimento_ativo_desafios WHERE id=? AND empresa_id=?')
    .bind(insert.id, empresaId)
    .first<ChallengeRow>();
  if (!challenge) throw new Error('Desafio recém-criado não encontrado');
  return { desafio: normalizarDesafio(challenge), criado: true };
}

function parseQuestaoSnapshot(raw: string): QuestaoSnapshot {
  const parsed = JSON.parse(raw) as QuestaoSnapshot;
  if (!parsed || !Array.isArray(parsed.alternativas) || !parsed.enunciado) {
    throw new Error('Snapshot de questão inválido');
  }
  return parsed;
}

function parseFonteSnapshot(raw: string | null): FonteSnapshot[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw) as FonteSnapshot[];
  return Array.isArray(parsed) ? parsed : [];
}

export async function buscarDesafioParaFuncionario(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  desafioId: number;
}) {
  const { db, empresaId, funcionarioId, desafioId } = params;
  const desafio = await db
    .prepare(
      'SELECT * FROM conhecimento_ativo_desafios ' +
        'WHERE id=? AND empresa_id=? AND funcionario_id=? AND deleted_at IS NULL LIMIT 1',
    )
    .bind(desafioId, empresaId, funcionarioId)
    .first<ChallengeRow>();
  if (!desafio) return null;
  await garantirQuantidadeQuestoesDesafio({ db, empresaId, funcionarioId, desafio });

  const result = await db
    .prepare(
      'SELECT dq.id,dq.desafio_id,dq.questao_id,dq.item_id,dq.ordem, ' +
        'dq.questao_snapshot_json,dq.fonte_snapshot_json, ' +
        'r.id AS resposta_id,r.alternativa_id,r.correta,r.confianca,r.respondido_em ' +
        'FROM conhecimento_ativo_desafio_questoes dq ' +
        'LEFT JOIN conhecimento_ativo_respostas r ON r.desafio_questao_id=dq.id ' +
        'AND r.empresa_id=dq.empresa_id AND r.funcionario_id=? ' +
        'WHERE dq.desafio_id=? AND dq.empresa_id=? AND dq.deleted_at IS NULL ORDER BY dq.ordem',
    )
    .bind(funcionarioId, desafioId, empresaId)
    .all<ChallengeQuestionRow>();

  const questoes = (result.results || []).map((row) => {
    const snapshot = parseQuestaoSnapshot(row.questao_snapshot_json);
    const respondida = Boolean(row.resposta_id);
    return {
      id: row.id,
      ordem: row.ordem,
      itemId: row.item_id,
      tipo: snapshot.tipo,
      enunciado: snapshot.enunciado,
      imagemR2Key: snapshot.imagemR2Key,
      topico: snapshot.topico,
      criticidade: snapshot.criticidade,
      alternativas: snapshot.alternativas,
      resposta: respondida
        ? {
            alternativaId: row.alternativa_id,
            alternativaCorretaId: snapshot.alternativaCorretaId,
            correta: row.correta === 1,
            confianca: row.confianca,
            respondidoEm: row.respondido_em,
            explicacao: snapshot.explicacao,
            oQueGuardar: snapshot.oQueGuardar,
            fontes: parseFonteSnapshot(row.fonte_snapshot_json),
          }
        : null,
    };
  });

  return {
    ...normalizarDesafio(desafio),
    total_questoes: questoes.length,
    respondidas: questoes.filter((row) => row.resposta).length,
    questoes,
  };
}

async function atualizarDominio(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  itemId: number;
  correta: boolean;
  confianca: ConhecimentoConfianca;
}) {
  const { db, empresaId, funcionarioId, itemId, correta, confianca } = params;
  const current = await db
    .prepare(
      'SELECT nivel,exposicoes,acertos,erros FROM conhecimento_ativo_dominio ' +
        'WHERE empresa_id=? AND funcionario_id=? AND item_id=? AND deleted_at IS NULL LIMIT 1',
    )
    .bind(empresaId, funcionarioId, itemId)
    .first<DominioAtual>();

  const next = calcularAtualizacaoDominio(
    current || { nivel: 0, exposicoes: 0, acertos: 0, erros: 0 },
    correta,
    confianca,
  );
  const nextReview = new Date(Date.now() + next.proximaRevisaoDias * 86400000).toISOString();

  if (current) {
    await db
      .prepare(
        'UPDATE conhecimento_ativo_dominio SET nivel=?,exposicoes=?,acertos=?,erros=?, ' +
          "ultimo_resultado=?,ultima_confianca=?,ultima_exposicao_em=datetime('now'), " +
          "proxima_revisao_em=?,estado=?,updated_at=datetime('now') " +
          'WHERE empresa_id=? AND funcionario_id=? AND item_id=? AND deleted_at IS NULL',
      )
      .bind(
        next.nivel,
        next.exposicoes,
        next.acertos,
        next.erros,
        correta ? 'ACERTO' : 'ERRO',
        confianca,
        nextReview,
        next.estado,
        empresaId,
        funcionarioId,
        itemId,
      )
      .run();
  } else {
    await db
      .prepare(
        'INSERT INTO conhecimento_ativo_dominio ' +
          '(empresa_id,funcionario_id,item_id,nivel,exposicoes,acertos,erros,ultimo_resultado, ' +
          'ultima_confianca,ultima_exposicao_em,proxima_revisao_em,estado) ' +
          "VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),?,?)",
      )
      .bind(
        empresaId,
        funcionarioId,
        itemId,
        next.nivel,
        next.exposicoes,
        next.acertos,
        next.erros,
        correta ? 'ACERTO' : 'ERRO',
        confianca,
        nextReview,
        next.estado,
      )
      .run();
  }

  return { ...next, proximaRevisaoEm: nextReview };
}

async function finalizarSeCompleto(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  desafioId: number;
}) {
  const { db, empresaId, funcionarioId, desafioId } = params;
  const counts = await db
    .prepare(
      'SELECT COUNT(*) AS total, ' +
        'SUM(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END) AS respondidas ' +
        'FROM conhecimento_ativo_desafio_questoes dq ' +
        'LEFT JOIN conhecimento_ativo_respostas r ON r.desafio_questao_id=dq.id ' +
        'AND r.empresa_id=dq.empresa_id AND r.funcionario_id=? ' +
        'WHERE dq.empresa_id=? AND dq.desafio_id=? AND dq.deleted_at IS NULL',
    )
    .bind(funcionarioId, empresaId, desafioId)
    .first<{ total: number; respondidas: number | null }>();

  const total = Number(counts?.total || 0);
  const respondidas = Number(counts?.respondidas || 0);
  if (!total || respondidas < total) return { concluido: false, xpConcedido: 0 };

  const challenge = await db
    .prepare(
      'SELECT * FROM conhecimento_ativo_desafios WHERE id=? AND empresa_id=? ' +
        'AND funcionario_id=? AND deleted_at IS NULL LIMIT 1',
    )
    .bind(desafioId, empresaId, funcionarioId)
    .first<ChallengeRow>();
  if (!challenge) throw new Error('Desafio não encontrado');

  if (challenge.status !== 'CONCLUIDO') {
    await db
      .prepare(
        "UPDATE conhecimento_ativo_desafios SET status='CONCLUIDO',concluido_em=datetime('now'), " +
          "xp_concedido=100,updated_at=datetime('now') WHERE id=? AND empresa_id=? AND funcionario_id=?",
      )
      .bind(desafioId, empresaId, funcionarioId)
      .run();
    await db
      .prepare(
        'INSERT OR IGNORE INTO conhecimento_ativo_xp_eventos ' +
          '(empresa_id,funcionario_id,desafio_id,tipo,pontos,referencia_chave) ' +
          "VALUES (?,?,?,'DESAFIO_CONCLUIDO',100,?)",
      )
      .bind(empresaId, funcionarioId, desafioId, 'desafio:' + desafioId)
      .run();
  }

  const completed = await db
    .prepare(
      'SELECT COUNT(*) AS total FROM conhecimento_ativo_desafios ' +
        'WHERE empresa_id=? AND funcionario_id=? AND periodo_chave=? ' +
        "AND status='CONCLUIDO' AND deleted_at IS NULL",
    )
    .bind(empresaId, funcionarioId, challenge.periodo_chave)
    .first<{ total: number }>();
  if (Number(completed?.total || 0) >= DESAFIOS_RECOMENDADOS_POR_QUINZENA) {
    await db
      .prepare(
        'INSERT OR IGNORE INTO conhecimento_ativo_xp_eventos ' +
          '(empresa_id,funcionario_id,desafio_id,tipo,pontos,referencia_chave) ' +
          "VALUES (?,?,?,'QUINZENA_CONCLUIDA',150,?)",
      )
      .bind(empresaId, funcionarioId, desafioId, 'quinzena:' + challenge.periodo_chave)
      .run();
  }

  return { concluido: true, xpConcedido: challenge.status === 'CONCLUIDO' ? 0 : 100 };
}

export async function iniciarDesafio(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  desafioId: number;
}) {
  const { db, empresaId, funcionarioId, desafioId } = params;
  const result = await db
    .prepare(
      "UPDATE conhecimento_ativo_desafios SET status='EM_ANDAMENTO', " +
        "iniciado_em=COALESCE(iniciado_em,datetime('now')),updated_at=datetime('now') " +
        "WHERE id=? AND empresa_id=? AND funcionario_id=? AND status='DISPONIVEL' AND deleted_at IS NULL",
    )
    .bind(desafioId, empresaId, funcionarioId)
    .run();
  return Number(result.meta.changes || 0) > 0;
}

export async function responderQuestao(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
  desafioId: number;
  desafioQuestaoId: number;
  alternativaId: number;
  confianca: ConhecimentoConfianca;
  tempoRespostaMs?: number | null;
}) {
  const {
    db,
    empresaId,
    funcionarioId,
    desafioId,
    desafioQuestaoId,
    alternativaId,
    confianca,
    tempoRespostaMs,
  } = params;

  const challengeQuestion = await db
    .prepare(
      'SELECT dq.id,dq.questao_id,dq.item_id,dq.questao_snapshot_json,dq.fonte_snapshot_json ' +
        'FROM conhecimento_ativo_desafio_questoes dq ' +
        'JOIN conhecimento_ativo_desafios d ON d.id=dq.desafio_id AND d.empresa_id=dq.empresa_id ' +
        'WHERE dq.id=? AND dq.desafio_id=? AND dq.empresa_id=? AND dq.deleted_at IS NULL ' +
        "AND d.funcionario_id=? AND d.status IN ('DISPONIVEL','EM_ANDAMENTO') AND d.deleted_at IS NULL LIMIT 1",
    )
    .bind(desafioQuestaoId, desafioId, empresaId, funcionarioId)
    .first<{
      id: number;
      questao_id: number;
      item_id: number;
      questao_snapshot_json: string;
      fonte_snapshot_json: string | null;
    }>();
  if (!challengeQuestion) return null;

  const existing = await db
    .prepare(
      'SELECT correta,alternativa_id,confianca FROM conhecimento_ativo_respostas ' +
        'WHERE empresa_id=? AND desafio_questao_id=? AND funcionario_id=? LIMIT 1',
    )
    .bind(empresaId, desafioQuestaoId, funcionarioId)
    .first<{ correta: number; alternativa_id: number; confianca: ConhecimentoConfianca }>();

  const snapshot = parseQuestaoSnapshot(challengeQuestion.questao_snapshot_json);
  if (existing) {
    return {
      idempotente: true,
      correta: existing.correta === 1,
      alternativaId: existing.alternativa_id,
      alternativaCorretaId: snapshot.alternativaCorretaId,
      confianca: existing.confianca,
      explicacao: snapshot.explicacao,
      oQueGuardar: snapshot.oQueGuardar,
      fontes: parseFonteSnapshot(challengeQuestion.fonte_snapshot_json),
      conclusao: await finalizarSeCompleto({ db, empresaId, funcionarioId, desafioId }),
    };
  }

  const alternative = await db
    .prepare(
      'SELECT id,correta FROM conhecimento_ativo_alternativas ' +
        'WHERE id=? AND empresa_id=? AND questao_id=? AND deleted_at IS NULL LIMIT 1',
    )
    .bind(alternativaId, empresaId, challengeQuestion.questao_id)
    .first<{ id: number; correta: number }>();
  if (!alternative) {
    const error = new Error('Alternativa não pertence à questão do desafio');
    error.name = 'ALTERNATIVA_INVALIDA';
    throw error;
  }

  const correta = alternative.correta === 1;
  await db
    .prepare(
      'INSERT INTO conhecimento_ativo_respostas ' +
        '(empresa_id,desafio_questao_id,funcionario_id,alternativa_id,correta,confianca,tempo_resposta_ms) ' +
        'VALUES (?,?,?,?,?,?,?)',
    )
    .bind(
      empresaId,
      desafioQuestaoId,
      funcionarioId,
      alternativaId,
      correta ? 1 : 0,
      confianca,
      tempoRespostaMs ?? null,
    )
    .run();

  await db
    .prepare(
      "UPDATE conhecimento_ativo_desafios SET status='EM_ANDAMENTO', " +
        "iniciado_em=COALESCE(iniciado_em,datetime('now')),updated_at=datetime('now') " +
        "WHERE id=? AND empresa_id=? AND funcionario_id=? AND status='DISPONIVEL'",
    )
    .bind(desafioId, empresaId, funcionarioId)
    .run();

  const dominio = await atualizarDominio({
    db,
    empresaId,
    funcionarioId,
    itemId: challengeQuestion.item_id,
    correta,
    confianca,
  });
  const conclusao = await finalizarSeCompleto({ db, empresaId, funcionarioId, desafioId });

  return {
    idempotente: false,
    correta,
    alternativaId,
    alternativaCorretaId: snapshot.alternativaCorretaId,
    confianca,
    explicacao: snapshot.explicacao,
    oQueGuardar: snapshot.oQueGuardar,
    fontes: parseFonteSnapshot(challengeQuestion.fonte_snapshot_json),
    dominio,
    conclusao,
  };
}

function diagnosticoPorTopico(candidatos: CandidatoRow[], nowMs: number = Date.now()) {
  const itens = new Map<number, CandidatoDesafio>();
  for (const row of candidatos) {
    if (itens.has(row.item_id)) continue;
    itens.set(row.item_id, toCandidate(row));
  }

  const porTopico = new Map<
    number,
    {
      itensAvaliados: number;
      itensNovos: number;
      itensVencidos: number;
      itensFrageis: number;
      retencaoMedia: number | null;
      prioridadeRevisao: number;
    }
  >();

  const grupos = new Map<number, CandidatoDesafio[]>();
  for (const item of itens.values()) {
    if (item.topicoId == null) continue;
    const group = grupos.get(item.topicoId) || [];
    group.push(item);
    grupos.set(item.topicoId, group);
  }

  for (const [topicoId, group] of grupos) {
    const avaliados = group.filter((item) => item.nivel != null);
    const itensNovos = group.length - avaliados.length;
    const itensVencidos = avaliados.filter((item) => {
      if (!item.proximaRevisaoEm) return false;
      const reviewMs = Date.parse(item.proximaRevisaoEm);
      return Number.isFinite(reviewMs) && reviewMs <= nowMs;
    }).length;
    const itensFrageis = avaliados.filter((item) => Number(item.nivel) < 60).length;
    const retencaoMedia = avaliados.length
      ? Math.round(
          avaliados.reduce((sum, item) => sum + Number(item.nivel || 0), 0) / avaliados.length,
        )
      : null;
    const scores = group.map((item) => pontuarCandidato(item, nowMs));
    const mediaScore = scores.length
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;
    const maxScore = scores.length ? Math.max(...scores) : 0;
    const prioridadeRevisao = normalizarPrioridadeRevisao(mediaScore * 0.7 + maxScore * 0.3);

    porTopico.set(topicoId, {
      itensAvaliados: avaliados.length,
      itensNovos,
      itensVencidos,
      itensFrageis,
      retencaoMedia,
      prioridadeRevisao,
    });
  }

  return porTopico;
}

export async function resumoConhecimentoAtivo(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
}) {
  const { db, empresaId, funcionarioId } = params;
  const modelos = modelosConhecimentoAtivoDisponiveis();
  const periodo = periodoQuinzena();

  const desafios = await db
    .prepare(
      'SELECT id,aeronave_modelo,topico_id,COALESCE(numero_sequencial,numero_desafio) AS numero_desafio,status,disponivel_em,expira_em,concluido_em ' +
        'FROM conhecimento_ativo_desafios WHERE empresa_id=? AND funcionario_id=? ' +
        'AND periodo_chave=? AND deleted_at IS NULL ORDER BY aeronave_modelo,numero_desafio',
    )
    .bind(empresaId, funcionarioId, periodo.chave)
    .all();

  const xp = await db
    .prepare(
      'SELECT COALESCE(SUM(pontos),0) AS total FROM conhecimento_ativo_xp_eventos ' +
        'WHERE empresa_id=? AND funcionario_id=?',
    )
    .bind(empresaId, funcionarioId)
    .first<{ total: number }>();

  const dominio = await db
    .prepare(
      'SELECT estado,COUNT(*) AS total FROM conhecimento_ativo_dominio ' +
        'WHERE empresa_id=? AND funcionario_id=? AND deleted_at IS NULL GROUP BY estado',
    )
    .bind(empresaId, funcionarioId)
    .all<{ estado: string; total: number }>();

  const states: Record<string, number> = {
    NOVO: 0,
    APRENDENDO: 0,
    EM_REFORCO: 0,
    CONSOLIDADO: 0,
  };
  for (const row of dominio.results || []) states[row.estado] = Number(row.total || 0);

  return {
    periodo,
    modelos,
    desafios: desafios.results || [],
    xp: Number(xp?.total || 0),
    dominio: states,
    estimativaMinutos: 8,
  };
}

export async function mapaConhecimento(params: {
  db: D1Database;
  empresaId: number;
  funcionarioId: number;
}) {
  const { db, empresaId, funcionarioId } = params;
  const modelos = modelosConhecimentoAtivoDisponiveis();
  const placeholders = modelos.map(() => '?').join(',');
  const candidatosDiagnostico = (
    await Promise.all(
      modelos.map((modelo) => buscarCandidatos(db, empresaId, funcionarioId, modelo, null)),
    )
  ).flat();
  const diagnostico = diagnosticoPorTopico(candidatosDiagnostico);
  const result = await db
    .prepare(
      `
      SELECT
        t.id AS topico_id,
        t.nome,
        t.aeronave_modelo,
        COUNT(DISTINCT i.id) AS itens,
        COUNT(DISTINCT q.id) AS questoes,
        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1
          FROM conhecimento_ativo_respostas r
          JOIN conhecimento_ativo_desafio_questoes dq
            ON dq.id=r.desafio_questao_id
          WHERE r.empresa_id=q.empresa_id
            AND r.funcionario_id=?
            AND dq.questao_id=q.id
        ) THEN q.id END) AS respondidas,
        COUNT(DISTINCT CASE WHEN d.estado='CONSOLIDADO' THEN i.id END) AS consolidados,
        COUNT(DISTINCT CASE WHEN d.estado='EM_REFORCO' THEN i.id END) AS em_reforco,
        COUNT(DISTINCT CASE WHEN d.estado='APRENDENDO' THEN i.id END) AS aprendendo
      FROM conhecimento_ativo_topicos t
      JOIN conhecimento_ativo_itens i
        ON i.topico_id=t.id
       AND i.empresa_id=t.empresa_id
       AND i.status='APROVADO'
       AND i.ativo=1
       AND i.deleted_at IS NULL
      JOIN conhecimento_ativo_questoes q
        ON q.item_id=i.id
       AND q.empresa_id=i.empresa_id
       AND q.status='APROVADA'
       AND q.ativo=1
       AND q.deleted_at IS NULL
       AND LENGTH(TRIM(q.explicacao))>0
      LEFT JOIN conhecimento_ativo_dominio d
        ON d.item_id=i.id
       AND d.empresa_id=i.empresa_id
       AND d.funcionario_id=?
       AND d.deleted_at IS NULL
      WHERE t.empresa_id=?
        AND t.ativo=1
        AND t.deleted_at IS NULL
        AND UPPER(REPLACE(t.aeronave_modelo,'-','')) IN (${placeholders})
        AND EXISTS (
          SELECT 1
          FROM conhecimento_ativo_item_fontes jf
          JOIN conhecimento_ativo_fontes f
            ON f.id=jf.fonte_id AND f.empresa_id=jf.empresa_id
          WHERE jf.empresa_id=i.empresa_id
            AND jf.item_id=i.id
            AND jf.deleted_at IS NULL
            AND f.status='VIGENTE'
            AND f.deleted_at IS NULL
        )
        AND (
          SELECT COUNT(*)
          FROM conhecimento_ativo_alternativas a
          WHERE a.empresa_id=q.empresa_id
            AND a.questao_id=q.id
            AND a.deleted_at IS NULL
        )>=2
        AND (
          SELECT COUNT(*)
          FROM conhecimento_ativo_alternativas a
          WHERE a.empresa_id=q.empresa_id
            AND a.questao_id=q.id
            AND a.correta=1
            AND a.deleted_at IS NULL
        )=1
      GROUP BY t.id,t.nome,t.aeronave_modelo
      ORDER BY t.ordem,t.nome
    `,
    )
    .bind(
      funcionarioId,
      funcionarioId,
      empresaId,
      ...modelos.map((value) => value.replace(/-/g, '')),
    )
    .all<{
      topico_id: number;
      nome: string;
      aeronave_modelo: string | null;
      itens: number;
      questoes: number;
      respondidas: number;
      consolidados: number;
      em_reforco: number;
      aprendendo: number;
    }>();

  return (result.results || []).map((row) => {
    const questoes = Number(row.questoes || 0);
    const respondidas = Number(row.respondidas || 0);
    const stats = diagnostico.get(Number(row.topico_id));
    return {
      ...row,
      aeronave_modelo: row.aeronave_modelo
        ? normalizarModeloConhecimento(row.aeronave_modelo)
        : null,
      questoes,
      respondidas,
      questoes_restantes: Math.max(0, questoes - respondidas),
      desafios_estimados: Math.ceil(questoes / QUESTOES_POR_DESAFIO),
      disponivel_para_desafio: Number(row.itens || 0) >= QUESTOES_POR_DESAFIO,
      retencao_media: stats?.retencaoMedia ?? null,
      prioridade_revisao: stats?.prioridadeRevisao ?? 0,
      itens_avaliados: stats?.itensAvaliados ?? 0,
      itens_novos: stats?.itensNovos ?? Number(row.itens || 0),
      itens_vencidos: stats?.itensVencidos ?? 0,
      itens_frageis: stats?.itensFrageis ?? 0,
    };
  });
}
