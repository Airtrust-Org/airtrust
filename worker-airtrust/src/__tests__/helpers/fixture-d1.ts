/**
 * Dependency-free, in-memory D1 test double for the gestor-operational-
 * domain-rbac test suite. Deliberately NOT a real SQL engine — earlier
 * attempts using node:sqlite (unavailable on CI's Node 20) and
 * better-sqlite3 (native binding crashed the CI test-runner worker
 * process) both failed for portability reasons unrelated to the guard's
 * own logic. This is a small, purpose-built executor that recognizes the
 * exact query shapes issued by operational-domain-access.ts,
 * employee-sector-access.ts (the manager-scope query only — this guard
 * always resolves scope via the 'manager' branch), and
 * admin-operational-domain-rbac.ts, and computes results directly from
 * plain JS fixture arrays. No new dependency, no native code, zero
 * portability risk.
 *
 * Every query the guard issues is enumerated below with a comment showing
 * the real SQL it stands in for, so drift is easy to catch on review.
 */

export interface Fixtures {
  empresas: Array<{ id: number; nome?: string; operational_domain_rbac_enabled: unknown }>;
  /** empresa_ids for which the empresas flag query throws, simulating a real D1 query failure (timeout, unreadable table). */
  empresasQueryFailsFor?: number[];
  dominios: Array<{ codigo: string; nome?: string; ativo: 0 | 1 }>;
  setores: Array<{
    id: number;
    empresa_id: number;
    nome?: string;
    ativo: 0 | 1;
    deleted_at?: string | null;
    dominio_codigo?: string | null;
  }>;
  setoresGestores: Array<{
    empresa_id: number;
    setor_id: number;
    usuario_id: number;
    ativo: 0 | 1;
    deleted_at?: string | null;
  }>;
  qualificacoesCategorias?: Array<{
    id: number;
    empresa_id: number;
    ativo: 0 | 1;
    deleted_at?: string | null;
    dominio_codigo?: string | null;
    nome?: string | null;
  }>;
  qualificacoesTipos?: Array<{
    id: number;
    empresa_id: number;
    categoria_id?: number | null;
    /** Explicit per-tipo domain override (migration 0454) — see resolveResourceDomain's precedence. */
    dominio_codigo?: string | null;
    nome?: string | null;
    ativo?: 0 | 1;
    deleted_at?: string | null;
  }>;
  qualificacoesTiposSetores?: Array<{
    tipo_id: number;
    setor_id: number;
    empresa_id: number;
    deleted_at?: string | null;
  }>;
  qualificacoesHistorico?: Array<{
    id: number;
    empresa_id: number;
    categoria_id?: number | null;
    funcionario_id?: number | null;
    /** FK to qualificacoesTipos — used by resolveResourceDomain's snapshot-vs-tipo classification fallback. */
    qualificacao_id?: number | null;
    deleted_at?: string | null;
  }>;
  lmsCursos?: Array<{
    id: number;
    empresa_id: number;
    deleted_at?: string | null;
    dominio_codigo?: string | null;
    titulo?: string | null;
  }>;
  funcionarios?: Array<{
    id: number;
    empresa_id: number;
    setor_id?: number | null;
    deleted_at?: string | null;
  }>;
  simuladorAgendamentos?: Array<{
    id: number;
    empresa_id: number;
    funcionario_id?: number | null;
    deleted_at?: string | null;
  }>;
  fichasSessao?: Array<{
    id: number;
    empresa_id: number;
    colaborador_id_aluno?: number | null;
    deleted_at?: string | null;
  }>;
  sessoesParticipantes?: Array<{
    id: number;
    sessao_id: number;
    funcionario_id: number;
    deleted_at?: string | null;
  }>;
  usuarios?: Array<{ id: number; email?: string; deleted_at?: string | null }>;
  usuariosEmpresas?: Array<{ usuario_id: number; empresa_id: number; role: string }>;
}

interface D1LikeStatement {
  bind: (...args: unknown[]) => D1LikeStatement;
  first: <T = unknown>() => Promise<T | null>;
  all: <T = unknown>() => Promise<{ results: T[] }>;
  run: () => Promise<{ meta: { changes: number; last_row_id: number } }>;
}

export interface TestD1 {
  prepare: (sql: string) => D1LikeStatement;
  fixtures: Fixtures;
}

function activeSetor(f: Fixtures, id: number, empresaId: number) {
  return f.setores.find(
    (s) => s.id === id && s.empresa_id === empresaId && s.ativo === 1 && !s.deleted_at,
  );
}

export function createFixtureDb(fixtures: Fixtures): TestD1 {
  const f: Fixtures = {
    qualificacoesCategorias: [],
    qualificacoesTipos: [],
    qualificacoesHistorico: [],
    lmsCursos: [],
    funcionarios: [],
    simuladorAgendamentos: [],
    fichasSessao: [],
    sessoesParticipantes: [],
    usuarios: [],
    usuariosEmpresas: [],
    ...fixtures,
  };

  function execute(sql: string, args: unknown[]): unknown {
    // employee-sector-access.ts: tableHasColumn('setores_gestores', 'usuario_id'/'gestor_id')
    if (sql.includes('pragma_table_info(')) {
      return { all: [{ name: 'usuario_id' }, { name: 'gestor_id' }] };
    }

    // operational-domain-access.ts / lms-ead-ssot.ts: tableHasColumn/hasColumn
    // schema-drift checks (Item 3) — fixtures always model the modern
    // schema, so these report the columns as present.
    if (sql.includes('PRAGMA table_info(qualificacoes_tipos)')) {
      // Fixtures always model the modern schema (post migration 0454):
      // dominio_codigo is the explicit, optional per-tipo override used to
      // disambiguate tipos under a mixed-domain categoria (e.g. "EAD").
      return {
        all: [
          { name: 'id' },
          { name: 'empresa_id' },
          { name: 'categoria_id' },
          { name: 'dominio_codigo' },
        ],
      };
    }
    if (sql.includes('PRAGMA table_info(qualificacoes_categorias)')) {
      return { all: [{ name: 'id' }, { name: 'empresa_id' }, { name: 'dominio_codigo' }] };
    }
    if (sql.includes('PRAGMA table_info(lms_cursos)')) {
      return { all: [{ name: 'id' }, { name: 'empresa_id' }, { name: 'dominio_codigo' }] };
    }

    // employee-sector-access.ts Path 1 (usuario_id, modern path).
    if (
      sql.includes('FROM setores_gestores sg') &&
      sql.includes('sg.usuario_id = ?') &&
      !sql.includes('notificacoes_convocacao_cc_gestores')
    ) {
      const [empresaId, userId] = args as [number, number];
      const rows = f.setoresGestores
        .filter(
          (sg) =>
            sg.empresa_id === empresaId &&
            sg.usuario_id === userId &&
            sg.ativo === 1 &&
            !sg.deleted_at &&
            activeSetor(f, sg.setor_id, empresaId),
        )
        .map((sg) => ({ setor_id: sg.setor_id }));
      return { all: dedupe(rows, (r) => r.setor_id) };
    }

    // employee-sector-access.ts Path 2 (legacy gestor_id fallback) — always
    // empty in these fixtures; the modern usuario_id path is what's tested.
    if (sql.includes('notificacoes_convocacao_cc_gestores')) {
      return { all: [] };
    }

    // operational-domain-access.ts: isTenantRbacEnabled
    if (sql.includes('FROM empresas WHERE id')) {
      const [empresaId] = args as [number];
      if (f.empresasQueryFailsFor?.includes(empresaId)) {
        throw new Error('simulated D1 query failure');
      }
      const empresa = f.empresas.find((e) => e.id === empresaId);
      return { first: empresa ? { operational_domain_rbac_enabled: empresa.operational_domain_rbac_enabled } : null };
    }

    // operational-domain-access.ts: activeDomainCodes
    if (sql.includes('SELECT codigo FROM dominios_operacionais')) {
      return { all: f.dominios.filter((d) => d.ativo === 1).map((d) => ({ codigo: d.codigo })) };
    }

    // operational-domain-access.ts: resolveOperationalAccess's per-setor domain query
    if (sql.includes('SELECT DISTINCT dominio_codigo') && sql.includes('FROM setores')) {
      const [empresaId, ...setorIds] = args as number[];
      const rows = f.setores
        .filter(
          (s) =>
            s.empresa_id === empresaId &&
            setorIds.includes(s.id) &&
            s.ativo === 1 &&
            !s.deleted_at &&
            s.dominio_codigo,
        )
        .map((s) => ({ dominio_codigo: s.dominio_codigo as string }));
      return { all: dedupe(rows, (r) => r.dominio_codigo) };
    }

    // operational-domain-access.ts: resolveResourceDomain('qualificacao_tipo', ...)
    if (sql.includes('FROM qualificacoes_tipos qt')) {
      const [id, empresaId] = args as [number, number];
      const tipo = f.qualificacoesTipos!.find(
        (t) => t.id === id && t.empresa_id === empresaId && !t.deleted_at,
      );
      const categoria = tipo?.categoria_id
        ? f.qualificacoesCategorias!.find((c) => c.id === tipo.categoria_id)
        : null;
      return { first: tipo ? { dominio_codigo: categoria?.dominio_codigo ?? null } : null };
    }

    // operational-domain-access.ts: resolveResourceDomain('qualificacao_historico'|'qualificacao_certificado', ...)
    if (sql.includes('FROM qualificacoes_historico qh')) {
      const [id, empresaId] = args as [number, number];
      const hist = f.qualificacoesHistorico!.find(
        (h) => h.id === id && h.empresa_id === empresaId && !h.deleted_at,
      );
      const categoriaHist = hist?.categoria_id
        ? f.qualificacoesCategorias!.find((c) => c.id === hist.categoria_id)
        : null;
      // Mirrors resolveResourceDomain's COALESCE(qc_hist, qt.dominio_codigo, qc_tipo):
      // 1) historico's own categoria snapshot, 2) explicit per-tipo override
      // (migration 0454 — disambiguates a mixed-domain categoria like "EAD"),
      // 3) the tipo's own categoria as a stale-snapshot fallback.
      const tipo = hist?.qualificacao_id
        ? f.qualificacoesTipos!.find((t) => t.id === hist.qualificacao_id && !t.deleted_at)
        : null;
      const categoriaTipo = tipo?.categoria_id
        ? f.qualificacoesCategorias!.find((c) => c.id === tipo.categoria_id)
        : null;
      const funcionario = hist?.funcionario_id
        ? f.funcionarios!.find((fn) => fn.id === hist.funcionario_id)
        : null;
      return {
        first: hist
          ? {
              dominio_codigo:
                categoriaHist?.dominio_codigo ?? tipo?.dominio_codigo ?? categoriaTipo?.dominio_codigo ?? null,
              setor_id: funcionario?.setor_id ?? null,
            }
          : null,
      };
    }

    // operational-domain-access.ts: resolveResourceDomain('simulador_sessao', ...)
    if (sql.includes('FROM simulador_agendamentos sa')) {
      const [id, empresaId] = args as [number, number];
      const sessao = f.simuladorAgendamentos!.find(
        (s) => s.id === id && s.empresa_id === empresaId && !s.deleted_at,
      );
      const funcionario = sessao?.funcionario_id
        ? f.funcionarios!.find((fn) => fn.id === sessao.funcionario_id)
        : null;
      return { first: sessao ? { setor_id: funcionario?.setor_id ?? null } : null };
    }

    // operational-domain-access.ts: resolveResourceDomain('simulador_sessao', ...)
    // — participantes list (plural, whole-session operations)
    if (sql.includes('FROM sessoes_participantes sp') && sql.includes('sp.sessao_id = ?')) {
      const [empresaId, sessaoId] = args as [number, number];
      const rows = f.sessoesParticipantes!
        .filter((sp) => sp.sessao_id === sessaoId && !sp.deleted_at)
        .map((sp) => f.funcionarios!.find((fn) => fn.id === sp.funcionario_id && fn.empresa_id === empresaId))
        .filter((fn): fn is NonNullable<typeof fn> => Boolean(fn))
        .map((fn) => ({ setor_id: fn.setor_id ?? null }));
      return { all: rows };
    }

    // operational-domain-access.ts: resolveResourceDomain('simulador_sessao_participante', ...)
    // — single participante (per-participant operations)
    if (sql.includes('FROM sessoes_participantes sp') && sql.includes('sp.id = ?')) {
      const [empresaId, participanteId] = args as [number, number];
      const sp = f.sessoesParticipantes!.find((row) => row.id === participanteId && !row.deleted_at);
      const funcionario = sp
        ? f.funcionarios!.find((fn) => fn.id === sp.funcionario_id && fn.empresa_id === empresaId)
        : null;
      return { first: sp ? { setor_id: funcionario?.setor_id ?? null } : null };
    }

    // operational-domain-access.ts: resolveResourceDomain('simulador_ficha', ...)
    if (sql.includes('FROM fichas_sessao fs')) {
      const [id, empresaId] = args as [number, number];
      const ficha = f.fichasSessao!.find((x) => x.id === id && x.empresa_id === empresaId && !x.deleted_at);
      const funcionario = ficha?.colaborador_id_aluno
        ? f.funcionarios!.find((fn) => fn.id === ficha.colaborador_id_aluno)
        : null;
      return { first: ficha ? { setor_id: funcionario?.setor_id ?? null } : null };
    }

    // admin-operational-domain-rbac.ts: POST /classify — fetch-before-update
    // for lms_cursos. Must be checked BEFORE the more generic
    // resolveResourceDomain('lms_curso', ...) match below, since both start
    // with "FROM lms_cursos WHERE id" — this one additionally selects `id`.
    if (sql.includes('SELECT id, dominio_codigo FROM lms_cursos')) {
      const [id, empresaId] = args as [number, number];
      const row = f.lmsCursos!.find((c) => c.id === id && c.empresa_id === empresaId && !c.deleted_at);
      return { first: row ? { id: row.id, dominio_codigo: row.dominio_codigo ?? null } : null };
    }

    // operational-domain-access.ts: resolveResourceDomain('lms_curso', ...)
    if (sql.includes('FROM lms_cursos WHERE id')) {
      const [id, empresaId] = args as [number, number];
      const curso = f.lmsCursos!.find((c) => c.id === id && c.empresa_id === empresaId && !c.deleted_at);
      return { first: curso ? { dominio_codigo: curso.dominio_codigo ?? null } : null };
    }

    // operational-domain-access.ts: resolveResourceDomain('funcionario', ...)
    if (sql.includes('FROM funcionarios f') && sql.includes('LEFT JOIN setores s')) {
      const [id, empresaId] = args as [number, number];
      const func = f.funcionarios!.find((x) => x.id === id && x.empresa_id === empresaId && !x.deleted_at);
      if (!func) return { first: null };
      const setor = func.setor_id ? f.setores.find((s) => s.id === func.setor_id) : null;
      return {
        first: { dominio_codigo: setor?.dominio_codigo ?? null, setor_id: func.setor_id ?? null },
      };
    }

    // operational-domain-access.ts: resolveOperationalReadScope's
    // classified-setores narrowing (Item 1)
    if (sql.includes('SELECT id FROM setores') && sql.includes('dominio_codigo IS NOT NULL')) {
      const [empresaId, ...setorIds] = args as number[];
      const rows = f.setores
        .filter(
          (s) =>
            s.empresa_id === empresaId &&
            setorIds.includes(s.id) &&
            s.ativo === 1 &&
            !s.deleted_at &&
            s.dominio_codigo,
        )
        .map((s) => ({ id: s.id }));
      return { all: rows };
    }

    // operational-domain-access.ts: resolveManagedSectorDomainFallback's
    // qualificacoes_tipos_setores → categoria domain lookup
    if (sql.includes('FROM qualificacoes_tipos_setores qts')) {
      const [setorId, empresaId] = args as [number, number];
      const links = (f.qualificacoesTiposSetores || []).filter(
        (qts) => qts.setor_id === setorId && qts.empresa_id === empresaId && !qts.deleted_at,
      );
      const domains = new Set(
        links
          .map((link) => {
            const tipo = (f.qualificacoesTipos || []).find(
              (qt) => qt.id === link.tipo_id && qt.empresa_id === empresaId && !qt.deleted_at,
            );
            if (!tipo || tipo.categoria_id == null) return null;
            const categoria = (f.qualificacoesCategorias || []).find((qc) => qc.id === tipo.categoria_id);
            return categoria?.dominio_codigo ?? null;
          })
          .filter((d): d is string => Boolean(d)),
      );
      return { all: [...domains].map((dominio_codigo) => ({ dominio_codigo })) };
    }

    // operational-domain-access.ts: assertSetorWithinOperationalScope
    if (sql.includes('SELECT dominio_codigo FROM setores')) {
      const [setorId, empresaId] = args as [number, number];
      const setor = activeSetor(f, setorId, empresaId);
      return { first: setor ? { dominio_codigo: setor.dominio_codigo ?? null } : null };
    }

    // operational-domain-access.ts: assertQualificacaoAtribuicaoWithinOperationalScope
    // — single-funcionario setor lookup
    if (sql.includes('SELECT setor_id FROM funcionarios')) {
      const [id, empresaId] = args as [number, number];
      const func = f.funcionarios!.find((x) => x.id === id && x.empresa_id === empresaId && !x.deleted_at);
      return { first: func ? { setor_id: func.setor_id ?? null } : null };
    }

    // operational-domain-access.ts: assertQualificacaoAtribuicaoWithinOperationalScope's
    // tipo→categoria domain lookup shares the same query shape (and result
    // shape) as resolveResourceDomain('qualificacao_tipo', ...) above — the
    // 'FROM qualificacoes_tipos qt' case earlier in this function already
    // handles it.

    // operational-domain-access.ts: assertFuncionarioIdsWithinOperationalScope
    if (sql.includes('SELECT id, setor_id FROM funcionarios') && sql.includes('id IN (')) {
      const empresaId = args[args.length - 1] as number;
      const funcionarioIds = args.slice(0, -1) as number[];
      const rows = f.funcionarios!.filter(
        (fn) => funcionarioIds.includes(fn.id) && fn.empresa_id === empresaId && !fn.deleted_at,
      );
      return { all: rows.map((fn) => ({ id: fn.id, setor_id: fn.setor_id ?? null })) };
    }

    // admin-operational-domain-rbac.ts: GET /unclassified listings
    if (sql.includes('SELECT id, nome FROM setores') && sql.includes('ORDER BY nome')) {
      const [empresaId] = args as [number];
      const rows = f.setores
        .filter((s) => s.empresa_id === empresaId && s.ativo === 1 && !s.deleted_at && !s.dominio_codigo)
        .map((s) => ({ id: s.id, nome: s.nome ?? null }));
      return { all: rows };
    }
    if (sql.includes('SELECT id, nome FROM qualificacoes_categorias') && sql.includes('ORDER BY nome')) {
      const [empresaId] = args as [number];
      const rows = f.qualificacoesCategorias!
        .filter((c) => c.empresa_id === empresaId && c.ativo === 1 && !c.deleted_at && !c.dominio_codigo)
        .map((c) => ({ id: c.id, nome: c.nome ?? null }));
      return { all: rows };
    }
    if (sql.includes('SELECT id, titulo FROM lms_cursos') && sql.includes('ORDER BY titulo')) {
      const [empresaId] = args as [number];
      const rows = f.lmsCursos!
        .filter((c) => c.empresa_id === empresaId && !c.deleted_at && !c.dominio_codigo)
        .map((c) => ({ id: c.id, titulo: c.titulo ?? null }));
      return { all: rows };
    }
    // admin-operational-domain-rbac.ts: GET /unclassified — tipos genuinely
    // blocked (no per-tipo override AND their own categoria unclassified).
    if (sql.includes('FROM qualificacoes_tipos tipo') && sql.includes('ORDER BY tipo.nome')) {
      const [empresaId] = args as [number];
      const rows = f.qualificacoesTipos!
        .filter(
          (t) => t.empresa_id === empresaId && (t.ativo ?? 1) === 1 && !t.deleted_at && !t.dominio_codigo,
        )
        .filter((t) => {
          if (!t.categoria_id) return true;
          const categoria = f.qualificacoesCategorias!.find((c) => c.id === t.categoria_id);
          return !categoria?.dominio_codigo;
        })
        .map((t) => ({ id: t.id, nome: t.nome ?? null }));
      return { all: rows };
    }

    // admin-operational-domain-rbac.ts: POST /classify — fetch-before-update
    if (sql.includes('SELECT id, dominio_codigo FROM setores')) {
      const [id, empresaId] = args as [number, number];
      const row = f.setores.find((s) => s.id === id && s.empresa_id === empresaId && !s.deleted_at);
      return { first: row ? { id: row.id, dominio_codigo: row.dominio_codigo ?? null } : null };
    }
    if (sql.includes('SELECT id, dominio_codigo FROM qualificacoes_categorias')) {
      const [id, empresaId] = args as [number, number];
      const row = f.qualificacoesCategorias!.find(
        (c) => c.id === id && c.empresa_id === empresaId && !c.deleted_at,
      );
      return { first: row ? { id: row.id, dominio_codigo: row.dominio_codigo ?? null } : null };
    }
    if (sql.includes('SELECT id, dominio_codigo FROM qualificacoes_tipos')) {
      const [id, empresaId] = args as [number, number];
      const row = f.qualificacoesTipos!.find(
        (t) => t.id === id && t.empresa_id === empresaId && !t.deleted_at,
      );
      return { first: row ? { id: row.id, dominio_codigo: row.dominio_codigo ?? null } : null };
    }
    // admin-operational-domain-rbac.ts: POST /classify — the actual write
    if (sql.includes('UPDATE setores SET dominio_codigo')) {
      const [dominioCodigo, id, empresaId] = args as [string, number, number];
      const row = f.setores.find((s) => s.id === id && s.empresa_id === empresaId);
      if (row) row.dominio_codigo = dominioCodigo;
      return { run: { changes: row ? 1 : 0 } };
    }
    if (sql.includes('UPDATE qualificacoes_categorias SET dominio_codigo')) {
      const [dominioCodigo, id, empresaId] = args as [string, number, number];
      const row = f.qualificacoesCategorias!.find((c) => c.id === id && c.empresa_id === empresaId);
      if (row) row.dominio_codigo = dominioCodigo;
      return { run: { changes: row ? 1 : 0 } };
    }
    if (sql.includes('UPDATE lms_cursos SET dominio_codigo')) {
      const [dominioCodigo, id, empresaId] = args as [string, number, number];
      const row = f.lmsCursos!.find((c) => c.id === id && c.empresa_id === empresaId);
      if (row) row.dominio_codigo = dominioCodigo;
      return { run: { changes: row ? 1 : 0 } };
    }
    if (sql.includes('UPDATE qualificacoes_tipos SET dominio_codigo')) {
      const [dominioCodigo, id, empresaId] = args as [string, number, number];
      const row = f.qualificacoesTipos!.find((t) => t.id === id && t.empresa_id === empresaId);
      if (row) row.dominio_codigo = dominioCodigo;
      return { run: { changes: row ? 1 : 0 } };
    }

    // admin-operational-domain-rbac.ts readiness: countInvalidDominioCodigo
    // (Fix 2 — dominio_codigo desconhecido / domínio inativo em uso).
    // Must be checked BEFORE the three "AS n" handlers below, since this
    // shares the same FROM-table + "AS n" substrings but a different WHERE
    // shape (dominio_codigo IS NOT NULL AND [NOT] EXISTS ... do_c).
    if (sql.includes('dominios_operacionais do_c')) {
      const tableMatch = sql.match(/FROM (\w+) t\b/);
      const table = tableMatch?.[1];
      const [empresaId] = args as [number];
      const isDesconhecido = sql.includes('NOT EXISTS');

      const rowsByTable: Record<string, Array<{ empresa_id: number; ativo?: 0 | 1; deleted_at?: string | null; dominio_codigo?: string | null }>> = {
        setores: f.setores,
        qualificacoes_categorias: f.qualificacoesCategorias || [],
        lms_cursos: f.lmsCursos || [],
      };
      const rows = table ? rowsByTable[table] || [] : [];
      const activeCodes = new Set(f.dominios.filter((d) => d.ativo === 1).map((d) => d.codigo));

      const n = rows.filter((row) => {
        if (row.empresa_id !== empresaId || row.deleted_at) return false;
        if (table !== 'lms_cursos' && row.ativo !== 1) return false;
        if (!row.dominio_codigo) return false;
        const knownActive = activeCodes.has(row.dominio_codigo);
        const knownAtAll = f.dominios.some((d) => d.codigo === row.dominio_codigo);
        return isDesconhecido ? !knownAtAll : knownAtAll && !knownActive;
      }).length;

      return { first: { n } };
    }

    // admin-operational-domain-rbac.ts readiness: setores_sem_dominio
    if (sql.includes('FROM setores') && sql.includes('dominio_codigo IS NULL') && sql.includes('AS n')) {
      const [empresaId] = args as [number];
      const n = f.setores.filter(
        (s) => s.empresa_id === empresaId && s.ativo === 1 && !s.deleted_at && !s.dominio_codigo,
      ).length;
      return { first: { n } };
    }

    // admin-operational-domain-rbac.ts readiness: categorias_sem_dominio
    if (sql.includes('FROM qualificacoes_categorias') && sql.includes('AS n')) {
      const [empresaId] = args as [number];
      const n = f.qualificacoesCategorias!.filter(
        (c) => c.empresa_id === empresaId && c.ativo === 1 && !c.deleted_at && !c.dominio_codigo,
      ).length;
      return { first: { n } };
    }

    // admin-operational-domain-rbac.ts readiness: cursos_sem_classificacao
    if (sql.includes('FROM lms_cursos') && sql.includes('AS n')) {
      const [empresaId] = args as [number];
      const n = f.lmsCursos!.filter(
        (c) => c.empresa_id === empresaId && !c.deleted_at && !c.dominio_codigo,
      ).length;
      return { first: { n } };
    }

    // admin-operational-domain-rbac.ts readiness: gestores_sem_setor
    if (sql.includes('usuarios_empresas ue')) {
      const [empresaId] = args as [number];
      const n = f.usuariosEmpresas!.filter((ue) => {
        if (ue.empresa_id !== empresaId) return false;
        if (!['manager', 'gestor', 'compliance'].includes(ue.role.toLowerCase())) return false;
        const usuario = f.usuarios!.find((u) => u.id === ue.usuario_id && !u.deleted_at);
        if (!usuario) return false;
        const hasActiveSetor = f.setoresGestores.some(
          (sg) =>
            sg.empresa_id === ue.empresa_id &&
            sg.usuario_id === ue.usuario_id &&
            sg.ativo === 1 &&
            !sg.deleted_at,
        );
        return !hasActiveSetor;
      }).length;
      return { first: { n } };
    }

    // admin-operational-domain-rbac.ts: activate/deactivate
    if (sql.includes('UPDATE empresas SET operational_domain_rbac_enabled')) {
      const enabled = sql.includes('= 1') ? 1 : 0;
      const [empresaId] = args as [number];
      const empresa = f.empresas.find((e) => e.id === empresaId);
      if (empresa) empresa.operational_domain_rbac_enabled = enabled as 0 | 1;
      return { run: { changes: empresa ? 1 : 0 } };
    }

    throw new Error(`fixture-d1: unrecognized query — ${sql}`);
  }

  function makeStatement(sql: string, boundArgs: unknown[]): D1LikeStatement {
    return {
      bind: (...args: unknown[]) => makeStatement(sql, args),
      first: async <T,>() => {
        const result = execute(sql, boundArgs) as { first?: T | null };
        return (result.first ?? null) as T | null;
      },
      all: async <T,>() => {
        const result = execute(sql, boundArgs) as { all?: T[] };
        return { results: (result.all ?? []) as T[] };
      },
      run: async () => {
        const result = execute(sql, boundArgs) as { run?: { changes: number } };
        return {
          meta: { changes: result.run?.changes ?? 0, last_row_id: 0 },
        };
      },
    };
  }

  return {
    fixtures: f,
    prepare: (sql: string) => makeStatement(sql, []),
  };
}

function dedupe<T>(rows: T[], keyFn: (row: T) => unknown): T[] {
  const seen = new Set<unknown>();
  const out: T[] = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
