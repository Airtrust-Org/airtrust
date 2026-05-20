/**
 * AUDITORIA HELPER
 * Funções para registrar operações críticas no sistema
 */

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

/**
 * Registra uma operação de auditoria no banco
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

  try {
    await db
      .prepare(
        `INSERT INTO auditoria (
          usuario_id, usuario_nome, acao, tabela_afetada, registro_id,
          dados_antes, dados_depois, ip_address, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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
  } catch (error) {
    // Log do erro mas não falhar a operação principal
    console.error('[Auditoria] Erro ao registrar:', error);
  }
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
