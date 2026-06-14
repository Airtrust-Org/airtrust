/**
 * BackupOrchestrator - Serviço de Orquestração de Backups
 * Gerencia criação, execução e monitoramento de backups
 */

import {
  BACKUP_MODULES,
  type ModuloBackup,
  ordenarModulosPorPrioridade,
  TODOS_MODULOS,
} from '../../config/backup-modules';

// Interface Env
interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
}

// UUID generator simples (fallback para Workers sem crypto)
function generateUUID(): string {
  // Implementação simplificada de UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface CriarBackupOptions {
  tipo: 'COMPLETO' | 'MODULAR' | 'INCREMENTAL';
  modulos?: ModuloBackup[];
  triggered_by: string;
  usuarios_id?: number;
  descricao?: string;
  retention_policy?: '30_DIAS' | '1_ANO' | '7_ANOS';
}

interface BackupMetrics {
  totalRegistros: number;
  totalTabelas: number;
  tamanhoBytes: number;
  duracaoSegundos: number;
}

interface R2BackupObject {
  key: string;
  size: number;
  uploaded: string;
  etag: string;
}

interface BackupArtifactDigest extends R2BackupObject {
  sha256: string;
}

export class BackupOrchestrator {
  constructor(private env: Env) {}

  /**
   * Executa backup automático (cron)
   */
  async executarBackupAutomatico(tipo: 'DIARIO' | 'SEMANAL' | 'MENSAL'): Promise<void> {
    console.log(`🔄 Iniciando backup automático: ${tipo}`);

    const retentionMap = {
      DIARIO: '30_DIAS' as const,
      SEMANAL: '1_ANO' as const,
      MENSAL: '7_ANOS' as const,
    };

    const escopo = tipo === 'MENSAL' ? 'COMPLETO' : 'INCREMENTAL';
    const modulosParaBackup =
      tipo === 'MENSAL' ? TODOS_MODULOS : this.determinarModulosIncrementais();

    await this.executarBackupManual({
      tipo: escopo === 'COMPLETO' ? 'COMPLETO' : 'INCREMENTAL',
      modulos: modulosParaBackup,
      triggered_by: `CRON_${tipo}`,
      retention_policy: retentionMap[tipo],
    });
  }

  /**
   * Executa backup manual (via API)
   */
  async executarBackupManual(options: CriarBackupOptions): Promise<number> {
    const startTime = Date.now();
    const backupUuid = generateUUID();

    console.log(`📦 Criando backup: ${options.tipo}`, {
      uuid: backupUuid,
      modulos: options.modulos?.length || 'TODOS',
    });

    const modulosParaBackup = options.modulos || (TODOS_MODULOS as unknown as ModuloBackup[]);
    const modulosOrdenados = ordenarModulosPorPrioridade(modulosParaBackup);

    // Criar registro de controle
    const controlId = await this.criarRegistroControle({
      uuid: backupUuid,
      tipo: options.tipo,
      escopo: options.modulos ? 'MODULAR' : 'GERAL',
      triggered_by: options.triggered_by,
      modulos_incluidos: JSON.stringify(modulosOrdenados),
      retention_policy: options.retention_policy || '7_ANOS',
      usuarios_id: options.usuarios_id,
      descricao: options.descricao,
    });

    try {
      const metrics: BackupMetrics = {
        totalRegistros: 0,
        totalTabelas: 0,
        tamanhoBytes: 0,
        duracaoSegundos: 0,
      };

      // Executar backup por módulo
      for (const modulo of modulosOrdenados) {
        const moduloMetrics = await this.backupModulo(controlId, modulo, backupUuid);
        metrics.totalRegistros += moduloMetrics.totalRegistros;
        metrics.totalTabelas += moduloMetrics.totalTabelas;
        metrics.tamanhoBytes += moduloMetrics.tamanhoBytes;
      }

      if (options.tipo === 'COMPLETO') {
        await this.backupArquivosR2(controlId, backupUuid);
      } else {
        // Backups incrementais/modulares mantêm apenas catálogo R2 para reduzir custo e tempo.
        await this.backupMetadadosR2(controlId, backupUuid);
      }

      // Finalizar
      metrics.duracaoSegundos = Math.floor((Date.now() - startTime) / 1000);
      const checksum = await this.gerarChecksumBackup(backupUuid);

      await this.finalizarBackup(controlId, {
        status: 'CONCLUIDO',
        checksum,
        ...metrics,
      });

      console.log(`✅ Backup ${backupUuid} concluído em ${metrics.duracaoSegundos}s`);

      return controlId;
    } catch (error) {
      console.error(`❌ Erro no backup ${backupUuid}:`, error);
      await this.registrarErro(controlId, error as Error);
      throw error;
    }
  }

  /**
   * Backup de um módulo específico
   */
  private async backupModulo(
    controlId: number,
    modulo: ModuloBackup,
    backupUuid: string,
  ): Promise<BackupMetrics> {
    const config = BACKUP_MODULES[modulo];
    const startTime = Date.now();

    await this.logBackup(controlId, 'INFO', `Iniciando backup módulo: ${config.nome}`);

    try {
      // Exportar tabelas principais
      const dadosPrincipais = await this.exportarTabelas([...config.tabelas_principais]);

      // Exportar tabelas relacionadas
      const dadosRelacionados = await this.exportarTabelas([...config.tabelas_relacionadas]);

      // Consolidar dados
      const backupData = {
        modulo,
        versao: '1.0',
        timestamp: new Date().toISOString(),
        tabelas_principais: dadosPrincipais,
        tabelas_relacionadas: dadosRelacionados,
        metadata: {
          total_registros:
            this.contarRegistros(dadosPrincipais) + this.contarRegistros(dadosRelacionados),
          dependencias: config.dependencias,
        },
      };

      // Salvar no R2
      const r2Path = this.gerarR2Path(backupUuid, modulo);
      const jsonString = JSON.stringify(backupData);
      await this.salvarR2(r2Path, jsonString);

      const duracao = Math.floor((Date.now() - startTime) / 1000);
      await this.logBackup(
        controlId,
        'SUCCESS',
        `Backup módulo ${config.nome} concluído em ${duracao}s`,
        {
          tabela_afetada: modulo,
          registros_processados: backupData.metadata.total_registros,
        },
      );

      return {
        totalRegistros: backupData.metadata.total_registros,
        totalTabelas: config.tabelas_principais.length + config.tabelas_relacionadas.length,
        tamanhoBytes: jsonString.length,
        duracaoSegundos: duracao,
      };
    } catch (error) {
      await this.logBackup(controlId, 'ERROR', `Falha no backup do módulo ${config.nome}`, {
        detalhes: JSON.stringify(error),
      });
      throw error;
    }
  }

  /**
   * Exporta dados de tabelas
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async exportarTabelas(tabelas: string[]): Promise<Record<string, any[]>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultado: Record<string, any[]> = {};

    for (const tabela of tabelas) {
      try {
        const query = `SELECT * FROM ${tabela} WHERE deleted_at IS NULL`;
        const { results } = await this.env.DB.prepare(query).all();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resultado[tabela] = results as any[];
      } catch {
        // Tabela pode não existir ainda
        console.warn(`Tabela ${tabela} não encontrada, pulando...`);
        resultado[tabela] = [];
      }
    }

    return resultado;
  }

  private async listarObjetosR2(skipBackupObjects = false): Promise<R2BackupObject[]> {
    return this.listarObjetosR2PorPrefixo(undefined, skipBackupObjects);
  }

  private async listarObjetosR2PorPrefixo(
    prefix?: string,
    skipBackupObjects = false,
  ): Promise<R2BackupObject[]> {
    const objetos: R2BackupObject[] = [];
    let cursor: string | undefined;

    do {
      const lista = await this.env.BUCKET.list({ cursor, limit: 1000, prefix });
      for (const obj of lista.objects) {
        if (skipBackupObjects && obj.key.startsWith('backups/')) {
          continue;
        }

        objetos.push(this.normalizarObjetoR2(obj));
      }
      cursor = lista.truncated ? lista.cursor : undefined;
    } while (cursor);

    return objetos;
  }

  /**
   * Backup leve de metadados R2 — lista objetos e salva manifest sem copiar arquivos
   */
  private async backupMetadadosR2(controlId: number, backupUuid: string): Promise<void> {
    await this.logBackup(controlId, 'INFO', 'Iniciando backup de metadados R2');

    try {
      const bucket = this.env.BUCKET;
      const objetos = await this.listarObjetosR2();

      const manifest = {
        timestamp: new Date().toISOString(),
        backup_uuid: backupUuid,
        total_arquivos: objetos.length,
        total_bytes: objetos.reduce((sum, o) => sum + o.size, 0),
        objetos,
      };

      await bucket.put(
        `backups/${backupUuid}/r2-metadata-manifest.json`,
        JSON.stringify(manifest),
        { httpMetadata: { contentType: 'application/json' } },
      );

      await this.logBackup(
        controlId,
        'SUCCESS',
        `Backup metadados R2 concluído: ${objetos.length} objetos catalogados`,
        { registros_processados: objetos.length },
      );
    } catch (error) {
      await this.logBackup(controlId, 'WARN', 'Erro ao catalogar metadados R2', {
        detalhes: JSON.stringify(error),
      });
      throw new Error(`Falha ao catalogar metadados R2: ${this.formatarErro(error)}`);
    }
  }

  /**
   * Backup de arquivos R2
   */
  private async backupArquivosR2(controlId: number, backupUuid: string): Promise<void> {
    await this.logBackup(controlId, 'INFO', 'Iniciando backup de arquivos R2');

    try {
      const bucket = this.env.BUCKET;
      const objetos = await this.listarObjetosR2(true);
      const arquivosBackup: Array<{ key: string; size: number; backup_key: string }> = [];

      for (const objeto of objetos) {
        const backupKey = `backups/${backupUuid}/r2-files/${objeto.key}`;
        const arquivo = await bucket.get(objeto.key);

        if (arquivo) {
          const body = await this.lerObjetoR2ArrayBuffer(arquivo, objeto.key);
          await bucket.put(backupKey, body, {
            customMetadata: {
              original_key: objeto.key,
              original_uploaded: String(objeto.uploaded),
              backup_uuid: backupUuid,
            },
          });

          arquivosBackup.push({
            key: objeto.key,
            size: objeto.size,
            backup_key: backupKey,
          });
        }
      }

      // Salvar manifest
      const manifest = {
        timestamp: new Date().toISOString(),
        total_arquivos: arquivosBackup.length,
        total_bytes: arquivosBackup.reduce((sum, f) => sum + f.size, 0),
        arquivos: arquivosBackup,
      };

      await bucket.put(`backups/${backupUuid}/r2-manifest.json`, JSON.stringify(manifest), {
        httpMetadata: { contentType: 'application/json' },
      });

      await this.logBackup(
        controlId,
        'SUCCESS',
        `Backup R2 concluído: ${arquivosBackup.length} arquivos`,
        { registros_processados: arquivosBackup.length },
      );
    } catch (error) {
      await this.logBackup(controlId, 'WARN', 'Erro no backup R2', {
        detalhes: JSON.stringify(error),
      });
      throw new Error(`Falha ao copiar arquivos R2 para backup: ${this.formatarErro(error)}`);
    }
  }

  /**
   * Gera path no R2 para o backup
   */
  private gerarR2Path(backupUuid: string, modulo?: ModuloBackup): string {
    const data = new Date();
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');

    const base = `backups/${ano}/${mes}/${dia}/${backupUuid}`;
    return modulo ? `${base}/${modulo}.json` : base;
  }

  /**
   * Salva arquivo no R2
   */
  private async salvarR2(path: string, content: string): Promise<void> {
    await this.env.BUCKET.put(path, content, {
      customMetadata: {
        content_type: 'application/json',
        created_at: new Date().toISOString(),
      },
    });
  }

  /**
   * Cria registro de controle no D1
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async criarRegistroControle(dados: any): Promise<number> {
    const expires = this.calcularExpiracao(dados.retention_policy);

    const result = await this.env.DB.prepare(
      `
      INSERT INTO backups_controle (
        uuid, tipo, escopo, triggered_by, modulos_incluidos, 
        retention_policy, expires_at, r2_bucket, r2_path, status, usuarios_id, descricao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EM_PROGRESSO', ?, ?)
    `,
    )
      .bind(
        dados.uuid,
        dados.tipo,
        dados.escopo,
        dados.triggered_by,
        dados.modulos_incluidos,
        dados.retention_policy,
        expires,
        'airtrust-storage',
        this.gerarR2Path(dados.uuid),
        dados.usuarios_id || null,
        dados.descricao || null,
      )
      .run();

    return result.meta.last_row_id as number;
  }

  /**
   * Calcula data de expiração
   */
  private calcularExpiracao(retention: string): string {
    const agora = new Date();
    switch (retention) {
      case '30_DIAS':
        return new Date(agora.setDate(agora.getDate() + 30)).toISOString();
      case '1_ANO':
        return new Date(agora.setFullYear(agora.getFullYear() + 1)).toISOString();
      case '7_ANOS':
        return new Date(agora.setFullYear(agora.getFullYear() + 7)).toISOString();
      default:
        return new Date(agora.setDate(agora.getDate() + 30)).toISOString();
    }
  }

  /**
   * Registra log de backup
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async logBackup(
    controlId: number,
    nivel: string,
    mensagem: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extras?: any,
  ): Promise<void> {
    await this.env.DB.prepare(
      `
      INSERT INTO backups_logs (
        backups_controle_id, nivel, mensagem, tabela_afetada, registros_processados, detalhes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
      .bind(
        controlId,
        nivel,
        mensagem,
        extras?.tabela_afetada || null,
        extras?.registros_processados || null,
        extras?.detalhes || null,
      )
      .run();
  }

  /**
   * Finaliza backup
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async finalizarBackup(controlId: number, dados: any): Promise<void> {
    await this.env.DB.prepare(
      `
      UPDATE backups_controle 
      SET status = ?, r2_checksum_sha256 = ?, duracao_segundos = ?, 
          total_registros = ?, total_tabelas = ?, tamanho_bytes = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    )
      .bind(
        dados.status,
        dados.checksum,
        dados.duracaoSegundos,
        dados.totalRegistros,
        dados.totalTabelas,
        dados.tamanhoBytes,
        controlId,
      )
      .run();
  }

  /**
   * Determina módulos para backup incremental
   */
  private determinarModulosIncrementais(): ModuloBackup[] {
    // Módulos com alta frequência de mudança
    return ['QUALIFICACOES', 'SIMULADORES', 'COMPLIANCE'];
  }

  /**
   * Conta registros em dataset
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private contarRegistros(dados: Record<string, any[]>): number {
    return Object.values(dados).reduce((sum, arr) => sum + arr.length, 0);
  }

  /**
   * Gera checksum do backup
   */
  private async gerarChecksumBackup(uuid: string): Promise<string> {
    if (!uuid || typeof uuid !== 'string') {
      throw new Error('UUID do backup ausente; nao e possivel gerar checksum real');
    }

    const datePrefix = this.gerarR2Path(uuid);
    const legacyPrefix = `backups/${uuid}/`;
    const artifactKeys = new Set<string>();

    for (const prefix of [datePrefix, legacyPrefix]) {
      const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
      const objetos = await this.listarObjetosR2PorPrefixo(normalizedPrefix);
      for (const objeto of objetos) {
        if (objeto.key.endsWith('/checksum-manifest.json')) {
          continue;
        }
        artifactKeys.add(objeto.key);
      }
    }

    const artifacts: BackupArtifactDigest[] = [];
    for (const key of [...artifactKeys].sort()) {
      const objeto = await this.env.BUCKET.get(key);
      if (!objeto) {
        throw new Error(`Artefato de backup ausente no R2 durante checksum: ${key}`);
      }

      const metadata = this.normalizarObjetoR2(objeto);
      const bytes = await this.lerObjetoR2ArrayBuffer(objeto, key);
      if (bytes.byteLength !== metadata.size) {
        throw new Error(
          `Tamanho inconsistente para artefato de backup ${key}: metadata=${metadata.size}, bytes=${bytes.byteLength}`,
        );
      }

      artifacts.push({
        ...metadata,
        sha256: `sha256:${await this.sha256Hex(bytes)}`,
      });
    }

    if (artifacts.length === 0) {
      throw new Error(`Nenhum artefato encontrado no R2 para gerar checksum do backup ${uuid}`);
    }

    // O checksum final cobre um manifesto deterministico com todos os artefatos e hashes.
    // O arquivo checksum-manifest.json e excluido da propria entrada para evitar hash recursivo.
    const manifest = {
      version: 1,
      backup_uuid: uuid,
      algorithm: 'SHA-256',
      generated_at: new Date().toISOString(),
      scope_prefixes: [datePrefix, legacyPrefix],
      artifact_count: artifacts.length,
      total_bytes: artifacts.reduce((sum, artifact) => sum + artifact.size, 0),
      artifacts,
    };

    const manifestJson = JSON.stringify(manifest);
    const manifestSha256 = await this.sha256Hex(manifestJson);
    await this.env.BUCKET.put(`backups/${uuid}/checksum-manifest.json`, manifestJson, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        sha256: `sha256:${manifestSha256}`,
        backup_uuid: uuid,
      },
    });

    return `sha256:${manifestSha256}`;
  }

  private normalizarObjetoR2(obj: R2Object): R2BackupObject {
    if (!obj.key || typeof obj.key !== 'string') {
      throw new Error('Objeto R2 sem key valida durante backup');
    }

    const size = Number(obj.size);
    if (!Number.isFinite(size) || size < 0) {
      throw new Error(`Objeto R2 com tamanho invalido durante backup: ${obj.key}`);
    }

    return {
      key: obj.key,
      size,
      uploaded: this.formatarUploadedAt(obj.uploaded),
      etag: typeof obj.etag === 'string' ? obj.etag : '',
    };
  }

  private formatarUploadedAt(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
    }

    return 'unknown';
  }

  private async lerObjetoR2ArrayBuffer(objeto: R2ObjectBody, key: string): Promise<ArrayBuffer> {
    if (typeof objeto.arrayBuffer === 'function') {
      return objeto.arrayBuffer();
    }

    if (objeto.body) {
      return new Response(objeto.body).arrayBuffer();
    }

    throw new Error(`Artefato de backup sem corpo legivel no R2: ${key}`);
  }

  private async sha256Hex(content: string | ArrayBuffer | Uint8Array): Promise<string> {
    const bytes =
      typeof content === 'string'
        ? new TextEncoder().encode(content)
        : content instanceof Uint8Array
          ? content
          : new Uint8Array(content);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private formatarErro(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Registra erro no backup
   */
  private async registrarErro(controlId: number, error: Error): Promise<void> {
    await this.env.DB.prepare(
      `
      UPDATE backups_controle SET status = 'FALHOU', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `,
    )
      .bind(controlId)
      .run();

    await this.logBackup(controlId, 'ERROR', error.message, {
      detalhes: JSON.stringify({ stack: error.stack }),
    });
  }
}
