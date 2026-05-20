/**
 * Business Rules - Centralized business logic
 *
 * Centraliza regras de negócio reutilizáveis
 * Uso: import { businessRules } from '@/utils/business-rules'
 */

interface Certificado {
  id: string;
  dataValidade: string | Date;
  vencido?: boolean;
  proximoVencimento?: boolean;
}

interface Habilitacao {
  id: string;
  tipo: string;
  dataVencimento: string | Date;
  vencida?: boolean;
  proximoVencimento?: boolean;
}

interface Funcionario {
  id: string;
  certificados: Certificado[];
  habilitacoes: Habilitacao[];
}

interface Simulador {
  id: string;
  habilitacoes_requeridas: string[];
}

export const businessRules = {
  /**
   * Verifica se certificado está próximo de vencer
   * @param dataValidade Data de validade do certificado
   * @param diasAlerta Dias para alertar antes do vencimento (default: 30)
   * @returns true se próximo a vencer
   */
  isCertificadoExpiringSoon: (dataValidade: string | Date, diasAlerta: number = 30): boolean => {
    const data = typeof dataValidade === 'string' ? new Date(dataValidade) : dataValidade;
    const hoje = new Date();
    const diffTime = data.getTime() - hoje.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= diasAlerta && diffDays > 0;
  },

  /**
   * Verifica se certificado está vencido
   * @param dataValidade Data de validade
   * @returns true se vencido
   */
  isCertificadoExpired: (dataValidade: string | Date): boolean => {
    const data = typeof dataValidade === 'string' ? new Date(dataValidade) : dataValidade;
    return new Date() > data;
  },

  /**
   * Verifica se habilitação está próxima de vencer
   * @param dataVencimento Data de vencimento
   * @param diasAlerta Dias para alertar (default: 30)
   * @returns true se próxima a vencer
   */
  isHabilitacaoExpiringSoon: (dataVencimento: string | Date, diasAlerta: number = 30): boolean => {
    const data = typeof dataVencimento === 'string' ? new Date(dataVencimento) : dataVencimento;
    const hoje = new Date();
    const diffTime = data.getTime() - hoje.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= diasAlerta && diffDays > 0;
  },

  /**
   * Verifica se habilitação está vencida
   * @param dataVencimento Data de vencimento
   * @returns true se vencida
   */
  isHabilitacaoExpired: (dataVencimento: string | Date): boolean => {
    const data = typeof dataVencimento === 'string' ? new Date(dataVencimento) : dataVencimento;
    return new Date() > data;
  },

  /**
   * Calcula dias até vencimento
   * @param dataVencimento Data de vencimento
   * @returns Número de dias até vencimento (negativo se já vencido)
   */
  daysUntilExpiration: (dataVencimento: string | Date): number => {
    const data = typeof dataVencimento === 'string' ? new Date(dataVencimento) : dataVencimento;
    const hoje = new Date();
    const diffTime = data.getTime() - hoje.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },

  /**
   * Calcula score de compliance do funcionário
   * Score máximo: 100
   * @param certificados Array de certificados
   * @param habilitacoes Array de habilitações
   * @returns Score entre 0 e 100
   */
  calculateComplianceScore: (
    certificados: Certificado[] = [],
    habilitacoes: Habilitacao[] = [],
  ): number => {
    let score = 100;

    certificados.forEach((cert) => {
      if (businessRules.isCertificadoExpired(cert.dataValidade)) {
        score -= 15;
      } else if (businessRules.isCertificadoExpiringSoon(cert.dataValidade)) {
        score -= 5;
      }
    });

    habilitacoes.forEach((hab) => {
      if (businessRules.isHabilitacaoExpired(hab.dataVencimento)) {
        score -= 20;
      } else if (businessRules.isHabilitacaoExpiringSoon(hab.dataVencimento)) {
        score -= 8;
      }
    });

    return Math.max(0, score);
  },

  /**
   * Calcula status de compliance
   * @param score Score de compliance (0-100)
   * @returns Status: 'critico' | 'alerta' | 'bom' | 'excelente'
   */
  getComplianceStatus: (score: number): 'critico' | 'alerta' | 'bom' | 'excelente' => {
    if (score >= 90) return 'excelente';
    if (score >= 75) return 'bom';
    if (score >= 50) return 'alerta';
    return 'critico';
  },

  /**
   * Obtém cor para compliance score
   * @param score Score de compliance
   * @returns Cor CSS (red, orange, yellow, green)
   */
  getComplianceColor: (score: number): string => {
    const status = businessRules.getComplianceStatus(score);
    const colorMap: Record<string, string> = {
      critico: '#dc2626', // red
      alerta: '#ea580c', // orange
      bom: '#eab308', // yellow
      excelente: '#22c55e', // green
    };
    return colorMap[status];
  },

  /**
   * Valida se funcionário pode agendar simulador
   * @param funcionario Funcionário com habilitações
   * @param simulador Simulador com habilitações requeridas
   * @returns true se pode agendar
   */
  canScheduleSimulator: (funcionario: Funcionario, simulador: Simulador): boolean => {
    // Verifica habilitações necessárias
    const hasRequiredHabilitacoes = simulador.habilitacoes_requeridas.every((req: string) =>
      funcionario.habilitacoes.some(
        (hab: Habilitacao) =>
          hab.tipo === req && !businessRules.isHabilitacaoExpired(hab.dataVencimento),
      ),
    );

    return hasRequiredHabilitacoes;
  },

  /**
   * Obtém motivos pelos quais não pode agendar
   * @param funcionario Funcionário
   * @param simulador Simulador
   * @returns Array de motivos
   */
  getSchedulingBlockReasons: (funcionario: Funcionario, simulador: Simulador): string[] => {
    const reasons: string[] = [];

    simulador.habilitacoes_requeridas.forEach((req: string) => {
      const hab = funcionario.habilitacoes.find((h) => h.tipo === req);

      if (!hab) {
        reasons.push(`Falta habilitação: ${req}`);
      } else if (businessRules.isHabilitacaoExpired(hab.dataVencimento)) {
        reasons.push(`Habilitação ${req} vencida`);
      }
    });

    return reasons;
  },

  /**
   * Valida se funcionário está em dia
   * @param funcionario Funcionário
   * @returns true se em dia (nenhuma documentação vencida)
   */
  isEmDia: (funcionario: Funcionario): boolean => {
    const hasExpiredCert = funcionario.certificados.some((cert) =>
      businessRules.isCertificadoExpired(cert.dataValidade),
    );

    const hasExpiredHab = funcionario.habilitacoes.some((hab) =>
      businessRules.isHabilitacaoExpired(hab.dataVencimento),
    );

    return !hasExpiredCert && !hasExpiredHab;
  },

  /**
   * Obtém próximas datas para vencimento (ordenadas)
   * @param funcionario Funcionário
   * @param limit Limite de resultados
   * @returns Array de objetos com tipo, data e dias
   */
  getUpcomingExpirations: (
    funcionario: Funcionario,
    limit: number = 5,
  ): Array<{ tipo: string; data: Date; dias: number }> => {
    const expirations: Array<{ tipo: string; data: Date; dias: number }> = [];

    funcionario.certificados
      .filter((cert) => !businessRules.isCertificadoExpired(cert.dataValidade))
      .forEach((cert) => {
        const data =
          typeof cert.dataValidade === 'string' ? new Date(cert.dataValidade) : cert.dataValidade;
        const dias = businessRules.daysUntilExpiration(data);

        if (dias > 0 && dias <= 90) {
          expirations.push({
            tipo: `Certificado: ${cert.id}`,
            data,
            dias,
          });
        }
      });

    funcionario.habilitacoes
      .filter((hab) => !businessRules.isHabilitacaoExpired(hab.dataVencimento))
      .forEach((hab) => {
        const data =
          typeof hab.dataVencimento === 'string'
            ? new Date(hab.dataVencimento)
            : hab.dataVencimento;
        const dias = businessRules.daysUntilExpiration(data);

        if (dias > 0 && dias <= 90) {
          expirations.push({
            tipo: `Habilitação: ${hab.tipo}`,
            data,
            dias,
          });
        }
      });

    return expirations.sort((a, b) => a.dias - b.dias).slice(0, limit);
  },

  /**
   * Calcula percentual de habilitações ativas
   * @param habilitacoes Array de habilitações
   * @returns Percentual (0-100)
   */
  getActiveHabilitacoesPercentage: (habilitacoes: Habilitacao[] = []): number => {
    if (habilitacoes.length === 0) return 0;

    const active = habilitacoes.filter(
      (hab) => !businessRules.isHabilitacaoExpired(hab.dataVencimento),
    ).length;

    return Math.round((active / habilitacoes.length) * 100);
  },

  /**
   * Calcula percentual de certificados ativos
   * @param certificados Array de certificados
   * @returns Percentual (0-100)
   */
  getActiveCertificatesPercentage: (certificados: Certificado[] = []): number => {
    if (certificados.length === 0) return 0;

    const active = certificados.filter(
      (cert) => !businessRules.isCertificadoExpired(cert.dataValidade),
    ).length;

    return Math.round((active / certificados.length) * 100);
  },

  /**
   * Valida se funcionário pode voar
   * Regra: tem habilitação, certificado e nenhum vencido
   * @param funcionario Funcionário
   * @returns true se pode voar
   */
  canFly: (funcionario: Funcionario): boolean => {
    if (funcionario.habilitacoes.length === 0 || funcionario.certificados.length === 0) {
      return false;
    }

    return businessRules.isEmDia(funcionario);
  },

  /**
   * Obtém motivos pelos quais não pode voar
   * @param funcionario Funcionário
   * @returns Array de motivos
   */
  getCannotFlyReasons: (funcionario: Funcionario): string[] => {
    const reasons: string[] = [];

    if (funcionario.habilitacoes.length === 0) {
      reasons.push('Sem habilitação');
    }

    if (funcionario.certificados.length === 0) {
      reasons.push('Sem certificado');
    }

    funcionario.certificados.forEach((cert) => {
      if (businessRules.isCertificadoExpired(cert.dataValidade)) {
        reasons.push(`Certificado vencido`);
      }
    });

    funcionario.habilitacoes.forEach((hab) => {
      if (businessRules.isHabilitacaoExpired(hab.dataVencimento)) {
        reasons.push(`Habilitação ${hab.tipo} vencida`);
      }
    });

    return [...new Set(reasons)]; // Remove duplicatas
  },
};

export default businessRules;
