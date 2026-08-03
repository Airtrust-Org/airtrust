/**
 * AUDITORIA HELPER
 * Funções para registrar operações críticas no sistema
 */

import { publishDomainEvent, type DomainEventTipo } from '../shared/domainEvents';

interface AuditoriaParams {
  db: D1Database;
  tabela: string;
  acao: 'INSERT' | 'UPDATE' | 'DELETE' | 'BULK_UPDATE' | 'CONVOCACAO_EMAIL' | 'IMPERSONATE';
  registro_id: string | number;
  usuario_id?: string;
  usuario_nome?: string;
  dados_anteriores?: unknown;
  dados_novos?: unknown;
  ip_address?: string;
  user_agent?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isAtivo(record: Record<string, unknown> | null): boolean {
  if (!record) return false;
  const ativo = record.ativo;
  if (ativo === true || ativo === 1 || ativo === '1') return true;
  return (
    String(record.status || '')
      .trim()
      .toUpperCase() === 'ATIVO'
  );
}

function resolveFuncionarioEvent(
  tabela: string,
  acao: AuditoriaParams['acao'],
  dadosAnteriores: unknown,
  dadosNovos: unknown,
): { tipo: DomainEventTipo; empresaId: string | number } | null {
  if (tabela !== 'funcionarios' || !['INSERT', 'UPDATE'].includes(acao)) return null;

  const anterior = asRecord(dadosAnteriores);
  const novo = asRecord(dadosNovos);
  const empresaId = novo?.empresa_id ?? anterior?.empresa_id;
  if (empresaId === undefined || empresaId === null || empresaId === '') return null;

  if (acao === 'INSERT') {
    return { tipo: 'FUNCIONARIO_CRIADO', empresaId: empresaId as string | number };
  }

  const reativado = !isAtivo(anterior) && isAtivo(novo);
  return {
    tipo: reativado ? 'FUNCIONARIO_REATIVADO' : 'FUNCIONARIO_ATUALIZADO',
    empresaId: empresaId as string | number,
  };
}

async function emitirEventoFuncionario(params: AuditoriaParams): Promise<void> {
  const evento = resolveFuncionarioEvent(
    params.tabela,
    params.acao,
    params.dados_anteriores,
    params.dados_novos,
  );
  if (!evento) return;

  try {
    await publishDomainEvent(params.db, 'funcionarios', evento.tipo, {
      empresa_id: evento.empresaId,
      origem_modulo: 'funcionarios',
      origem_usuario_id: params.usuario_id,
      funcionario_id: String(params.registro_id),
    });
  } catch (error) {
    console.error('[Auditoria] Erro ao publicar evento de funcionário:', error);
  }
}

/**
 * Registra uma operação no log legado e na trilha central. Falhas de
 * observabilidade nunca revertem a mutação principal.
 */
export async function registrarAuditoria(params: AuditoriaParams): Promise<void> {
  const {
    db,
    tabela,
    acao,
    registro_id,
    usuario_id = null,
    usuario_nome = null,
    dados_anteriores = null,
    dados_novos = null,
    ip_address = null,
    user_agent = null,
  } = params;

  const writeLegacy = async () =>
    db
      .prepare(
        `INSERT INTO auditoria (
          usuario_id, usuario_nome, acao, tabela_afetada, registro_id,
          dados_antes, dados_depois, ip_address, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
      )
      .bind(
        usuario_id,
        usuario_nome,
        acao,
        tabela,
        String(registro_id),
        dados_anteriores ? JSON.stringify(dados_anteriores) : null,
        dados_novos ? JSON.stringify(dados_novos) : null,
        ip_address,
        user_agent,
      )
      .run();

  const writeCentral = async () =>
    db
      .prepare(
        `INSERT INTO auditoria_avancada_v2 (
          tabela, acao, registro_id, dados_anteriores, dados_novos,
          usuario_id, ip_address, user_agent, origem, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'api', datetime('now'))`,
      )
      .bind(
        tabela,
        acao,
        String(registro_id),
        dados_anteriores ? JSON.stringify(dados_anteriores) : null,
        dados_novos ? JSON.stringify(dados_novos) : null,
        usuario_id,
        ip_address,
        user_agent,
      )
      .run();

  const writes = await Promise.allSettled([writeLegacy(), writeCentral()]);
  for (const result of writes) {
    if (result.status === 'rejected') {
      console.error('[Auditoria] Erro ao registrar:', result.reason);
    }
  }

  await emitirEventoFuncionario(params);
}

/**
 * Extrai informações do usuário do contexto Hono
 */
export function extrairUsuarioAuditoria(c: {
  get: (key: string) => unknown;
  req: { header: (name: string) => string | undefined };
}): {
  usuario_id?: string;
  usuario_nome?: string;
  ip_address?: string;
  user_agent?: string;
} {
  const user = c.get('user') as { id?: number; nome?: string; email?: string } | undefined;
  const usuario_id = user?.id?.toString();
  const usuario_nome = user?.nome || user?.email;
  const ip_address = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for');
  const user_agent = c.req.header('user-agent');

  return { usuario_id, usuario_nome, ip_address, user_agent };
}
