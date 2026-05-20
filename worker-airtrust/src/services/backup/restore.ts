import { type ModuloBackup } from '../../config/backup-modules';

interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
}

export class RestoreService {
  constructor(private env: Env) {}

  /**
   * Lista backups disponíveis
   */
  async listarBackups(limit = 20, offset = 0) {
    const query = `
      SELECT * FROM backups_controle
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const { results } = await this.env.DB.prepare(query).bind(limit, offset).all();
    return results;
  }

  /**
   * Obtém detalhes de um backup específico
   */
  async obterDetalhesBackup(uuid: string) {
    const backup = await this.env.DB.prepare('SELECT * FROM backups_controle WHERE uuid = ?')
      .bind(uuid)
      .first();

    if (!backup) throw new Error('Backup não encontrado');

    const logs = await this.env.DB.prepare(
      'SELECT id, backups_controle_id, nivel, mensagem, tabela_afetada, registros_processados, detalhes, timestamp AS created_at FROM backups_logs WHERE backups_controle_id = ? ORDER BY id ASC',
    )
      .bind(backup.id)
      .all();

    return { ...backup, logs: logs.results };
  }

  /**
   * Restaura um backup (completo ou parcial)
   */
  async restaurarBackup(uuid: string, modulos?: ModuloBackup[]) {
    // 1. Validar backup
    const backup = await this.env.DB.prepare('SELECT * FROM backups_controle WHERE uuid = ?')
      .bind(uuid)
      .first();

    if (!backup) throw new Error('Backup não encontrado');
    if (backup.status !== 'CONCLUIDO') {
      throw new Error('Apenas backups concluídos podem ser restaurados');
    }

    // 2. Determinar módulos a restaurar
    const modulosDisponiveis = JSON.parse(backup.modulos_incluidos as string) as ModuloBackup[];
    const modulosAlvo = modulos || modulosDisponiveis;

    // Validar se módulos solicitados estão no backup
    for (const m of modulosAlvo) {
      if (!modulosDisponiveis.includes(m)) {
        throw new Error(`Módulo ${m} não está incluído neste backup`);
      }
    }

    const resultados = [];
    const basePath = backup.r2_path as string;

    // 3. Restaurar cada módulo
    for (const modulo of modulosAlvo) {
      try {
        const resultado = await this.restaurarModulo(basePath, modulo);
        resultados.push({ modulo, status: 'SUCCESS', ...resultado });
      } catch (error) {
        console.error(`Erro ao restaurar módulo ${modulo}:`, error);
        resultados.push({ modulo, status: 'ERROR', error: (error as Error).message });
      }
    }

    return resultados;
  }

  /**
   * Restaura um módulo específico do R2 para o D1
   */
  private async restaurarModulo(basePath: string, modulo: ModuloBackup) {
    // 1. Buscar arquivo no R2
    const path = `${basePath}/${modulo}.json`;
    const object = await this.env.BUCKET.get(path);

    if (!object) {
      throw new Error(`Arquivo de backup não encontrado no R2: ${path}`);
    }

    // @ts-ignore
    const data = (await object.json()) as any;

    const stats = {
      tabelas: 0,
      registros: 0,
    };

    // Processar tabelas principais e relacionadas
    const todasTabelas = { ...data.tabelas_principais, ...data.tabelas_relacionadas };

    for (const [tabela, registros] of Object.entries(todasTabelas)) {
      if (Array.isArray(registros) && registros.length > 0) {
        await this.restaurarTabela(tabela, registros);
        stats.tabelas++;
        stats.registros += registros.length;
      }
    }

    return stats;
  }

  /**
   * Exporta backup completo como JSON para download
   */
  async exportarBackupCompleto(uuid: string) {
    const backup = await this.env.DB.prepare('SELECT * FROM backups_controle WHERE uuid = ?')
      .bind(uuid)
      .first();

    if (!backup) throw new Error('Backup não encontrado');

    const modulosDisponiveis = JSON.parse(backup.modulos_incluidos as string) as ModuloBackup[];
    const basePath = backup.r2_path as string;
    const modulos: Record<string, any> = {};

    // Buscar dados de cada módulo do R2
    for (const modulo of modulosDisponiveis) {
      try {
        const path = `${basePath}/${modulo}.json`;
        const object = await this.env.BUCKET.get(path);

        if (object) {
          // @ts-ignore
          modulos[modulo] = await object.json();
        }
      } catch (error) {
        console.warn(`Erro ao carregar módulo ${modulo}:`, error);
        modulos[modulo] = { error: 'Não foi possível carregar este módulo' };
      }
    }

    // Retornar estrutura completa do backup
    return {
      metadata: {
        uuid: backup.uuid,
        tipo: backup.tipo,
        escopo: backup.escopo,
        created_at: backup.created_at,
        duracao_segundos: backup.duracao_segundos,
        total_registros: backup.total_registros,
        total_tabelas: backup.total_tabelas,
        tamanho_bytes: backup.tamanho_bytes,
        descricao: backup.descricao,
      },
      modulos,
      versao_backup: '1.0',
      exportado_em: new Date().toISOString(),
    };
  }

  /**
   * Insere ou atualiza registros na tabela
   */
  // @ts-ignore
  private async restaurarTabela(tabela: string, registros: any[]) {
    if (registros.length === 0) return;

    // Assumindo que o primeiro registro tem todas as colunas
    const colunas = Object.keys(registros[0]);
    const placeholders = colunas.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO ${tabela} (${colunas.join(', ')}) VALUES (${placeholders})`;

    // Batch insert para performance (limite de statements por batch do D1)
    const batchSize = 10; // Conservador para evitar limites de tamanho de query
    for (let i = 0; i < registros.length; i += batchSize) {
      const batch = registros.slice(i, i + batchSize);
      const statements = batch.map((reg) => {
        const values = colunas.map((col) => reg[col]);
        return this.env.DB.prepare(sql).bind(...values);
      });

      await this.env.DB.batch(statements);
    }
  }
}
